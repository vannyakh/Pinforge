//! URL provider detection + yt-dlp / ffmpeg tool spawning.

mod playwright_sidecar;

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub label: String,
    pub live: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectResult {
    pub url: String,
    pub provider: Option<String>,
    pub label: Option<String>,
    pub matched: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub ytdlp: Option<String>,
    pub ffmpeg: Option<String>,
    pub playwright_note: String,
}

#[derive(Debug, Clone, Default)]
pub struct ToolPaths {
    pub ytdlp: Option<PathBuf>,
    pub ffmpeg: Option<PathBuf>,
}

impl ToolPaths {
    pub fn from_env() -> Self {
        Self {
            ytdlp: std::env::var_os("PINFORGE_YTDLP")
                .map(PathBuf::from)
                .or_else(|| which("yt-dlp")),
            ffmpeg: std::env::var_os("PINFORGE_FFMPEG")
                .map(PathBuf::from)
                .or_else(|| which("ffmpeg")),
        }
    }
}

fn which(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
        #[cfg(windows)]
        {
            let exe = dir.join(format!("{name}.exe"));
            if exe.is_file() {
                return Some(exe);
            }
        }
    }
    None
}

const BUILTIN: &[(&str, &str, &[&str])] = &[
    ("youtube", "YouTube", &["youtube.com", "youtu.be", "youtube-nocookie.com"]),
    ("tiktok", "TikTok", &["tiktok.com", "vm.tiktok.com"]),
    ("instagram", "Instagram", &["instagram.com", "instagr.am"]),
    ("facebook", "Facebook", &["facebook.com", "fb.watch", "fb.com"]),
    ("pinterest", "Pinterest", &["pinterest.com", "pin.it"]),
    ("twitter", "X (Twitter)", &["twitter.com", "x.com", "t.co"]),
    ("douyin", "Douyin", &["douyin.com", "iesdouyin.com"]),
    ("kuaishou", "Kuaishou", &["kuaishou.com", "gifshow.com"]),
];

pub fn list_providers() -> Vec<ProviderInfo> {
    let mut list: Vec<_> = BUILTIN
        .iter()
        .map(|(id, label, _)| ProviderInfo {
            id: (*id).into(),
            label: (*label).into(),
            live: true,
        })
        .collect();
    list.push(ProviderInfo {
        id: "ytdlp".into(),
        label: "yt-dlp".into(),
        live: true,
    });
    list
}

pub fn detect_url(raw: &str) -> DetectResult {
    let url = raw.trim();
    let Ok(parsed) = Url::parse(url) else {
        return DetectResult {
            url: url.into(),
            provider: None,
            label: None,
            matched: false,
        };
    };
    let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
    for (id, label, hosts) in BUILTIN {
        if hosts.iter().any(|h| host == *h || host.ends_with(&format!(".{h}"))) {
            return DetectResult {
                url: url.into(),
                provider: Some((*id).into()),
                label: Some((*label).into()),
                matched: true,
            };
        }
    }
    if parsed.scheme() == "http" || parsed.scheme() == "https" {
        return DetectResult {
            url: url.into(),
            provider: Some("ytdlp".into()),
            label: Some("yt-dlp".into()),
            matched: true,
        };
    }
    DetectResult {
        url: url.into(),
        provider: None,
        label: None,
        matched: false,
    }
}

pub fn tool_status(tools: &ToolPaths) -> ToolStatus {
    ToolStatus {
        ytdlp: tools.ytdlp.as_ref().map(|p| p.display().to_string()),
        ffmpeg: tools.ffmpeg.as_ref().map(|p| p.display().to_string()),
        playwright_note: "Playwright scrapers remain a Node sidecar until replaced.".into(),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YtdlpDownloadResult {
    pub path: String,
    pub provider: String,
}

/// Download a URL via yt-dlp into `out_dir` (best effort single file).
pub async fn ytdlp_download(
    tools: &ToolPaths,
    url: &str,
    out_dir: impl AsRef<Path>,
) -> Result<YtdlpDownloadResult> {
    let bin = tools
        .ytdlp
        .as_ref()
        .ok_or_else(|| anyhow!("yt-dlp binary not found (set PINFORGE_YTDLP or PATH)"))?;
    let out_dir = out_dir.as_ref();
    tokio::fs::create_dir_all(out_dir).await?;
    let template = out_dir.join("%(title).80B [%(id)s].%(ext)s");
    let output = Command::new(bin)
        .arg("-o")
        .arg(template)
        .arg("--no-playlist")
        .arg("--print")
        .arg("after_move:filepath")
        .arg("--no-simulate")
        .arg(url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .with_context(|| format!("spawn yt-dlp {}", bin.display()))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("yt-dlp failed: {}", err.trim()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let path = stdout
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .last()
        .ok_or_else(|| anyhow!("yt-dlp produced no filepath"))?
        .to_string();
    let detected = detect_url(url);
    Ok(YtdlpDownloadResult {
        path,
        provider: detected.provider.unwrap_or_else(|| "ytdlp".into()),
    })
}

pub async fn ffmpeg_version(tools: &ToolPaths) -> Result<String> {
    let bin = tools
        .ffmpeg
        .as_ref()
        .ok_or_else(|| anyhow!("ffmpeg not found"))?;
    let output = Command::new(bin)
        .arg("-version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await?;
    let text = String::from_utf8_lossy(&output.stdout);
    Ok(text.lines().next().unwrap_or("ffmpeg").to_string())
}

pub fn ping() -> &'static str {
    "providers-ok"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_major_hosts() {
        let yt = detect_url("https://www.youtube.com/watch?v=abc");
        assert!(yt.matched);
        assert_eq!(yt.provider.as_deref(), Some("youtube"));

        let tt = detect_url("https://www.tiktok.com/@u/video/1");
        assert_eq!(tt.provider.as_deref(), Some("tiktok"));

        let x = detect_url("https://x.com/u/status/1");
        assert_eq!(x.provider.as_deref(), Some("twitter"));

        let pin = detect_url("https://www.pinterest.com/pin/123/");
        assert_eq!(pin.provider.as_deref(), Some("pinterest"));
    }

    #[test]
    fn unknown_http_falls_back_to_ytdlp() {
        let d = detect_url("https://example.com/watch/1");
        assert!(d.matched);
        assert_eq!(d.provider.as_deref(), Some("ytdlp"));
    }

    #[test]
    fn rejects_non_http() {
        let d = detect_url("not-a-url");
        assert!(!d.matched);
        assert!(d.provider.is_none());
    }

    #[test]
    fn list_providers_includes_builtins_and_ytdlp() {
        let list = list_providers();
        assert!(list.iter().any(|p| p.id == "youtube"));
        assert!(list.iter().any(|p| p.id == "ytdlp"));
    }
}
