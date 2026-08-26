//! Multi-connection Range fragment downloads (Tokio + reqwest).

use anyhow::{anyhow, Context, Result};
use bytes::Bytes;
use futures::stream::{FuturesUnordered, StreamExt};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::{AsyncSeekExt, AsyncWriteExt};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadOptions {
    pub url: String,
    pub out: String,
    #[serde(default = "default_concurrency")]
    pub concurrency: usize,
    #[serde(default = "default_fragment")]
    pub fragment_size: u64,
    #[serde(default)]
    pub referer: Option<String>,
}

fn default_concurrency() -> usize {
    4
}
fn default_fragment() -> u64 {
    4 * 1024 * 1024
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadResult {
    pub path: String,
    pub bytes: u64,
    pub used_fragments: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: Option<f64>,
}

pub type ProgressFn = Arc<dyn Fn(DownloadProgress) + Send + Sync>;

pub fn ping() -> &'static str {
    "download-ok"
}

/// Concurrent Range download into `opts.out`. Falls back to single stream.
pub async fn download_file(opts: DownloadOptions) -> Result<DownloadResult> {
    download_file_with_progress(opts, None).await
}

pub async fn download_file_with_progress(
    opts: DownloadOptions,
    on_progress: Option<ProgressFn>,
) -> Result<DownloadResult> {
    let concurrency = opts.concurrency.max(1);
    let client = reqwest::Client::builder()
        .user_agent("Pinforge-Server/0.1")
        .build()?;

    let mut headers = reqwest::header::HeaderMap::new();
    if let Some(ref r) = opts.referer {
        headers.insert(
            reqwest::header::REFERER,
            r.parse().context("referer header")?,
        );
    }

    let probe = probe_ranges(&client, &opts.url, &headers).await?;
    if let (Some(total), true) = (probe.length, probe.accept_ranges) {
        if total >= 2 * 1024 * 1024 && concurrency > 1 {
            return download_fragments(&client, &opts, &headers, total, concurrency, on_progress)
                .await;
        }
    }

    download_stream(&client, &opts, &headers, on_progress).await
}

struct Probe {
    length: Option<u64>,
    accept_ranges: bool,
}

async fn probe_ranges(
    client: &reqwest::Client,
    url: &str,
    headers: &reqwest::header::HeaderMap,
) -> Result<Probe> {
    let head = client.head(url).headers(headers.clone()).send().await;
    if let Ok(res) = head {
        if res.status().is_success() {
            let length = res
                .headers()
                .get(reqwest::header::CONTENT_LENGTH)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse().ok());
            let accept_ranges = res
                .headers()
                .get(reqwest::header::ACCEPT_RANGES)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_ascii_lowercase().contains("bytes"))
                .unwrap_or(false);
            return Ok(Probe {
                length,
                accept_ranges,
            });
        }
    }

    let res = client
        .get(url)
        .headers(headers.clone())
        .header(reqwest::header::RANGE, "bytes=0-0")
        .send()
        .await?;
    if res.status() == reqwest::StatusCode::PARTIAL_CONTENT {
        let total = res
            .headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.rsplit('/').next())
            .and_then(|s| s.parse().ok());
        return Ok(Probe {
            length: total,
            accept_ranges: true,
        });
    }
    Ok(Probe {
        length: None,
        accept_ranges: false,
    })
}

fn emit_progress(cb: &Option<ProgressFn>, downloaded: u64, total: Option<u64>) {
    if let Some(cb) = cb {
        let percent = total.map(|t| {
            if t > 0 {
                ((downloaded as f64) / (t as f64) * 10000.0).round() / 100.0
            } else {
                0.0
            }
        });
        cb(DownloadProgress {
            downloaded_bytes: downloaded,
            total_bytes: total,
            percent,
        });
    }
}

async fn download_stream(
    client: &reqwest::Client,
    opts: &DownloadOptions,
    headers: &reqwest::header::HeaderMap,
    on_progress: Option<ProgressFn>,
) -> Result<DownloadResult> {
    let res = client
        .get(&opts.url)
        .headers(headers.clone())
        .send()
        .await?
        .error_for_status()?;
    let total = res.content_length();
    let bytes = res.bytes().await?;
    if let Some(parent) = Path::new(&opts.out).parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    tokio::fs::write(&opts.out, &bytes).await?;
    emit_progress(
        &on_progress,
        bytes.len() as u64,
        total.or(Some(bytes.len() as u64)),
    );
    Ok(DownloadResult {
        path: opts.out.clone(),
        bytes: bytes.len() as u64,
        used_fragments: false,
    })
}

async fn download_fragments(
    client: &reqwest::Client,
    opts: &DownloadOptions,
    headers: &reqwest::header::HeaderMap,
    total: u64,
    concurrency: usize,
    on_progress: Option<ProgressFn>,
) -> Result<DownloadResult> {
    let out = Path::new(&opts.out);
    if let Some(parent) = out.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let part = format!("{}.part", opts.out);
    {
        let f = File::create(&part).await?;
        f.set_len(total).await?;
    }

    let mut ranges = Vec::new();
    let mut start = 0u64;
    while start < total {
        let end = (start + opts.fragment_size - 1).min(total - 1);
        ranges.push((start, end));
        start = end + 1;
    }

    let downloaded = Arc::new(AtomicU64::new(0));
    let mut workers = FuturesUnordered::new();
    let mut iter = ranges.into_iter();

    for _ in 0..concurrency {
        if let Some((s, e)) = iter.next() {
            workers.push(fetch_and_write(
                client.clone(),
                opts.url.clone(),
                headers.clone(),
                part.clone(),
                s,
                e,
                downloaded.clone(),
                on_progress.clone(),
                total,
            ));
        }
    }

    while let Some(res) = workers.next().await {
        res?;
        if let Some((s, e)) = iter.next() {
            workers.push(fetch_and_write(
                client.clone(),
                opts.url.clone(),
                headers.clone(),
                part.clone(),
                s,
                e,
                downloaded.clone(),
                on_progress.clone(),
                total,
            ));
        }
    }

    tokio::fs::rename(&part, &opts.out)
        .await
        .with_context(|| format!("rename {} → {}", part, opts.out))?;

    emit_progress(&on_progress, total, Some(total));

    Ok(DownloadResult {
        path: opts.out.clone(),
        bytes: total,
        used_fragments: true,
    })
}

async fn fetch_and_write(
    client: reqwest::Client,
    url: String,
    headers: reqwest::header::HeaderMap,
    path: String,
    start: u64,
    end: u64,
    downloaded: Arc<AtomicU64>,
    on_progress: Option<ProgressFn>,
    total: u64,
) -> Result<()> {
    let res = client
        .get(&url)
        .headers(headers)
        .header(reqwest::header::RANGE, format!("bytes={start}-{end}"))
        .send()
        .await?
        .error_for_status()?;
    let status = res.status();
    if !(status == reqwest::StatusCode::PARTIAL_CONTENT || status.is_success()) {
        return Err(anyhow!("fragment status {status} for {start}-{end}"));
    }
    let bytes: Bytes = res.bytes().await?;
    let mut file = File::options().write(true).open(&path).await?;
    file.seek(std::io::SeekFrom::Start(start)).await?;
    file.write_all(&bytes).await?;
    let so_far = downloaded.fetch_add(bytes.len() as u64, Ordering::Relaxed) + bytes.len() as u64;
    emit_progress(&on_progress, so_far, Some(total));
    Ok(())
}
