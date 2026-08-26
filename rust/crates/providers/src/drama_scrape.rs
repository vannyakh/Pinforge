//! DramaBox / ReelShort episode scrape (page + embedded JSON).
//!
//! Resolves book/episode ids from public URLs, fetches HTML, and extracts
//! episode metadata + stream/subtitle URLs when present in the page payload.

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

use super::detect_drama;

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DramaScrapeOpts {
    #[serde(default)]
    pub max_items: Option<u32>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub episode_id: Option<String>,
    #[serde(default)]
    pub scrape_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DramaEpisode {
    pub index: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_sec: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DramaScrapeResult {
    pub provider: String,
    pub source_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    pub episodes: Vec<DramaEpisode>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct DramaRef {
    pub provider: &'static str,
    pub label: &'static str,
    pub book_id: Option<String>,
    pub episode_index: Option<u32>,
    pub slug: Option<String>,
}

/// Parse DramaBox / ReelShort (and sibling) public URLs into ids.
pub fn parse_drama_ref(raw: &str) -> Option<DramaRef> {
    let trimmed = raw.trim();
    let parsed = Url::parse(trimmed).ok()?;
    let host = parsed.host_str()?.to_ascii_lowercase();
    let path = parsed.path().to_string();
    let path_lc = path.to_ascii_lowercase();
    let (provider, label) = detect_drama(&host, &path_lc)?;

    let mut book_id = None;
    let mut episode_index = None;
    let mut slug = None;

    for (k, v) in parsed.query_pairs() {
        let key = k.to_ascii_lowercase();
        if matches!(key.as_str(), "bookid" | "book_id" | "id") && book_id.is_none() {
            book_id = Some(v.to_string());
        }
        if matches!(key.as_str(), "episode" | "ep" | "chapter" | "chapterindex") {
            if let Ok(n) = v.parse::<u32>() {
                episode_index = Some(n.max(1));
            }
        }
    }

    // ReelShort: /episodes/episode-1-title-slug-{bookId}-{tail}
    if provider == "reelshort" || path_lc.contains("/episodes/") {
        if let Some(seg) = path.split('/').filter(|s| !s.is_empty()).last() {
            if let Some(caps) = parse_reelshort_segment(seg) {
                episode_index = episode_index.or(caps.0);
                book_id = book_id.or(caps.1);
                slug = caps.2;
            }
        }
    }

    // DramaBox-style path segments: /doc/{bookId}, /ebook/{bookId}, /movie/{bookId}
    if book_id.is_none() {
        let parts: Vec<_> = path.split('/').filter(|s| !s.is_empty()).collect();
        for (i, part) in parts.iter().enumerate() {
            let p = part.to_ascii_lowercase();
            if matches!(p.as_str(), "doc" | "ebook" | "movie" | "book" | "detail" | "play") {
                if let Some(next) = parts.get(i + 1) {
                    if looks_like_book_id(next) {
                        book_id = Some((*next).to_string());
                        break;
                    }
                }
            }
        }
    }

    // Trailing numeric / hex id on path
    if book_id.is_none() {
        if let Some(seg) = path.split('/').filter(|s| !s.is_empty()).last() {
            if looks_like_book_id(seg) {
                book_id = Some(seg.to_string());
            }
        }
    }

    Some(DramaRef {
        provider,
        label,
        book_id,
        episode_index,
        slug,
    })
}

fn looks_like_book_id(s: &str) -> bool {
    let s = s.trim();
    if s.len() < 6 || s.len() > 48 {
        return false;
    }
    s.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        && s.chars().any(|c| c.is_ascii_digit())
}

fn parse_reelshort_segment(
    seg: &str,
) -> Option<(Option<u32>, Option<String>, Option<String>)> {
    let lower = seg.to_ascii_lowercase();
    let ep = if let Some(rest) = lower.strip_prefix("episode-") {
        rest.split('-')
            .next()
            .and_then(|n| n.parse::<u32>().ok())
            .map(|n| n.max(1))
    } else {
        None
    };

    // Prefer 24-char hex ObjectId in the segment
    let book = seg
        .split('-')
        .find(|p| p.len() == 24 && p.chars().all(|c| c.is_ascii_hexdigit()))
        .map(|s| s.to_string())
        .or_else(|| {
            seg.split('-')
                .rev()
                .find(|p| looks_like_book_id(p) && p.len() >= 8)
                .map(|s| s.to_string())
        });

    let slug = {
        let parts: Vec<_> = seg.split('-').collect();
        if parts.len() > 3 {
            Some(parts[1..parts.len().saturating_sub(2)].join("-"))
        } else {
            None
        }
    };

    if ep.is_none() && book.is_none() {
        None
    } else {
        Some((ep, book, slug))
    }
}

/// Scrape a drama page for episodes / media URLs.
pub async fn scrape_drama(url: &str, opts: &DramaScrapeOpts) -> Result<DramaScrapeResult> {
    let drama_ref = parse_drama_ref(url).ok_or_else(|| anyhow!("not a known drama URL: {url}"))?;
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()?;

    let resp = client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml,application/json")
        .header("Accept-Language", opts.language.as_deref().unwrap_or("en-US,en;q=0.9"))
        .send()
        .await
        .with_context(|| format!("fetch {url}"))?;

    let status = resp.status();
    if !status.is_success() {
        bail!("drama page HTTP {status}");
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    let body = resp.text().await?;

    let mut result = if content_type.contains("application/json") {
        scrape_from_json_body(url, &drama_ref, &body)?
    } else {
        scrape_from_html(url, &drama_ref, &body)?
    };

    if let Some(lang) = &opts.language {
        result.language = Some(lang.clone());
    }
    if result.book_id.is_none() {
        result.book_id = drama_ref.book_id.clone();
    }

    // Focus single episode when requested
    if let Some(ep_id) = opts.episode_id.as_deref().or(drama_ref
        .episode_index
        .map(|n| n.to_string())
        .as_deref())
    {
        if let Ok(n) = ep_id.parse::<u32>() {
            result.episodes.retain(|e| e.index == n || e.id.as_deref() == Some(ep_id));
            if result.episodes.is_empty() {
                result.episodes.push(DramaEpisode {
                    index: n,
                    id: Some(ep_id.to_string()),
                    title: Some(format!("Episode {n}")),
                    media_url: None,
                    subtitle_url: None,
                    duration_sec: None,
                });
                result
                    .warnings
                    .push("requested episode not found in page payload; stub entry returned".into());
            }
        }
    }

    let cap = opts.max_items.unwrap_or(200).clamp(1, 2000) as usize;
    if result.episodes.len() > cap {
        result.episodes.truncate(cap);
        result
            .warnings
            .push(format!("episodes truncated to maxItems={cap}"));
    }

    if result.episodes.is_empty() {
        // Metadata-only fallback so clients still get a usable row
        result.episodes.push(DramaEpisode {
            index: drama_ref.episode_index.unwrap_or(1),
            id: drama_ref.book_id.clone(),
            title: result.title.clone().or_else(|| Some(drama_ref.label.to_string())),
            media_url: None,
            subtitle_url: None,
            duration_sec: None,
        });
        result
            .warnings
            .push("no episode list in page; returned metadata stub (stream URL may require auth)"
                .into());
    }

    if opts.scrape_only {
        result
            .warnings
            .push("scrapeOnly=true: metadata returned without download".into());
    }

    Ok(result)
}

fn scrape_from_html(url: &str, drama_ref: &DramaRef, html: &str) -> Result<DramaScrapeResult> {
    let mut warnings = Vec::new();
    let title = meta_content(html, "og:title")
        .or_else(|| meta_content(html, "twitter:title"))
        .or_else(|| title_tag(html));
    let cover = meta_content(html, "og:image").or_else(|| meta_content(html, "twitter:image"));
    let og_video = meta_content(html, "og:video")
        .or_else(|| meta_content(html, "og:video:url"))
        .or_else(|| meta_content(html, "og:video:secure_url"));

    let mut episodes = Vec::new();
    let mut book_id = drama_ref.book_id.clone();
    let mut resolved_title = title;

    if let Some(json_str) = extract_next_data(html) {
        match serde_json::from_str::<Value>(&json_str) {
            Ok(v) => {
                let extracted = extract_from_json(&v);
                if book_id.is_none() {
                    book_id = extracted.book_id;
                }
                if resolved_title.is_none() {
                    resolved_title = extracted.title;
                }
                if !extracted.episodes.is_empty() {
                    episodes = extracted.episodes;
                }
            }
            Err(e) => warnings.push(format!("__NEXT_DATA__ parse failed: {e}")),
        }
    }

    // Also try inline JSON blobs commonly used by SPA shells
    if episodes.is_empty() {
        for blob in extract_json_script_blobs(html).into_iter().take(8) {
            if let Ok(v) = serde_json::from_str::<Value>(&blob) {
                let extracted = extract_from_json(&v);
                if !extracted.episodes.is_empty() {
                    if book_id.is_none() {
                        book_id = extracted.book_id;
                    }
                    if resolved_title.is_none() {
                        resolved_title = extracted.title;
                    }
                    episodes = extracted.episodes;
                    break;
                }
            }
        }
    }

    let media_urls = find_media_urls(html);
    let subtitle_urls = find_subtitle_urls(html);

    if episodes.is_empty() {
        if let Some(media) = og_video.or_else(|| media_urls.first().cloned()) {
            episodes.push(DramaEpisode {
                index: drama_ref.episode_index.unwrap_or(1),
                id: book_id.clone(),
                title: resolved_title.clone(),
                media_url: Some(media),
                subtitle_url: subtitle_urls.first().cloned(),
                duration_sec: None,
            });
        }
    } else {
        // Fill missing media from page-level discovery
        for (i, ep) in episodes.iter_mut().enumerate() {
            if ep.media_url.is_none() {
                if let Some(u) = media_urls.get(i).cloned().or_else(|| media_urls.first().cloned()) {
                    // Only attach shared page media to the focused episode
                    if drama_ref.episode_index.map(|n| n == ep.index).unwrap_or(i == 0) {
                        ep.media_url = Some(u);
                    }
                }
            }
            if ep.subtitle_url.is_none() {
                if let Some(u) = subtitle_urls.get(i).cloned() {
                    ep.subtitle_url = Some(u);
                }
            }
        }
        if media_urls.is_empty() && episodes.iter().all(|e| e.media_url.is_none()) {
            warnings.push(
                "episode list found but no media URLs in HTML (login or API may be required)"
                    .into(),
            );
        }
    }

    Ok(DramaScrapeResult {
        provider: drama_ref.provider.into(),
        source_url: url.into(),
        book_id,
        title: resolved_title,
        cover_url: cover,
        language: None,
        episodes,
        warnings,
    })
}

fn scrape_from_json_body(url: &str, drama_ref: &DramaRef, body: &str) -> Result<DramaScrapeResult> {
    let v: Value = serde_json::from_str(body).context("invalid JSON response")?;
    let extracted = extract_from_json(&v);
    Ok(DramaScrapeResult {
        provider: drama_ref.provider.into(),
        source_url: url.into(),
        book_id: extracted.book_id.or_else(|| drama_ref.book_id.clone()),
        title: extracted.title,
        cover_url: extracted.cover_url,
        language: None,
        episodes: extracted.episodes,
        warnings: Vec::new(),
    })
}

#[derive(Default)]
struct Extracted {
    book_id: Option<String>,
    title: Option<String>,
    cover_url: Option<String>,
    episodes: Vec<DramaEpisode>,
}

fn extract_from_json(root: &Value) -> Extracted {
    let mut out = Extracted::default();
    walk_json(root, &mut out, 0);
    // Deduplicate by index
    out.episodes.sort_by_key(|e| e.index);
    out.episodes.dedup_by_key(|e| e.index);
    out
}

fn walk_json(v: &Value, out: &mut Extracted, depth: usize) {
    if depth > 24 {
        return;
    }
    match v {
        Value::Object(map) => {
            for (k, val) in map {
                let key = k.to_ascii_lowercase();
                match key.as_str() {
                    "bookid" | "book_id" => {
                        if out.book_id.is_none() {
                            if let Some(s) = val.as_str() {
                                out.book_id = Some(s.to_string());
                            } else if let Some(n) = val.as_u64() {
                                out.book_id = Some(n.to_string());
                            }
                        }
                    }
                    "bookname" | "book_name" | "title" | "name" if out.title.is_none() => {
                        if let Some(s) = val.as_str() {
                            if s.len() > 1 && s.len() < 200 {
                                out.title = Some(s.to_string());
                            }
                        }
                    }
                    "cover" | "coverurl" | "cover_url" | "poster" if out.cover_url.is_none() => {
                        if let Some(s) = val.as_str() {
                            if s.starts_with("http") {
                                out.cover_url = Some(s.to_string());
                            }
                        }
                    }
                    "chapters" | "chapterlist" | "episodelist" | "episodes" | "chapter_list" => {
                        if let Some(arr) = val.as_array() {
                            for (i, item) in arr.iter().enumerate() {
                                if let Some(ep) = episode_from_value(item, (i as u32) + 1) {
                                    out.episodes.push(ep);
                                }
                            }
                        }
                    }
                    _ => {}
                }
                walk_json(val, out, depth + 1);
            }
        }
        Value::Array(arr) => {
            for item in arr.iter().take(500) {
                walk_json(item, out, depth + 1);
            }
        }
        _ => {}
    }
}

fn episode_from_value(v: &Value, fallback_index: u32) -> Option<DramaEpisode> {
    let obj = v.as_object()?;
    let index = obj
        .get("chapterIndex")
        .or_else(|| obj.get("chapter_index"))
        .or_else(|| obj.get("episode"))
        .or_else(|| obj.get("index"))
        .or_else(|| obj.get("ep"))
        .and_then(|x| {
            x.as_u64()
                .map(|n| n as u32)
                .or_else(|| x.as_str()?.parse().ok())
        })
        .unwrap_or(fallback_index)
        .max(1);

    let id = obj
        .get("chapterId")
        .or_else(|| obj.get("chapter_id"))
        .or_else(|| obj.get("id"))
        .and_then(|x| x.as_str().map(|s| s.to_string()).or_else(|| x.as_u64().map(|n| n.to_string())));

    let title = obj
        .get("chapterName")
        .or_else(|| obj.get("chapter_name"))
        .or_else(|| obj.get("title"))
        .or_else(|| obj.get("name"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());

    let media = first_str(
        obj,
        &[
            "videoPath",
            "video_path",
            "playUrl",
            "play_url",
            "mediaUrl",
            "media_url",
            "mp4",
            "m3u8",
            "url",
            "src",
        ],
    )
    .or_else(|| {
        obj.get("video")
            .and_then(|v| v.as_object())
            .and_then(|vid| first_str(vid, &["mp4", "m3u8", "url", "src", "path"]))
    });

    let subtitle = first_str(
        obj,
        &["subtitle", "subtitleUrl", "subtitle_url", "vtt", "srt", "caption"],
    );

    let duration_sec = obj
        .get("duration")
        .or_else(|| obj.get("durationSec"))
        .and_then(|x| x.as_f64().or_else(|| x.as_u64().map(|n| n as f64)));

    // Require at least some episode signal
    if id.is_none() && title.is_none() && media.is_none() && obj.len() < 2 {
        return None;
    }

    Some(DramaEpisode {
        index,
        id,
        title,
        media_url: media,
        subtitle_url: subtitle,
        duration_sec,
    })
}

fn first_str(obj: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    for k in keys {
        if let Some(v) = obj.get(*k) {
            if let Some(s) = v.as_str() {
                if s.starts_with("http") || s.contains(".m3u8") || s.contains(".mp4") {
                    return Some(s.to_string());
                }
            }
        }
    }
    None
}

fn extract_next_data(html: &str) -> Option<String> {
    let marker = "id=\"__NEXT_DATA__\"";
    let start = html.find(marker)?;
    let after = &html[start..];
    let gt = after.find('>')?;
    let rest = &after[gt + 1..];
    let end = rest.find("</script>")?;
    Some(rest[..end].trim().to_string())
}

fn extract_json_script_blobs(html: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = html;
    while let Some(idx) = rest.find("<script") {
        rest = &rest[idx..];
        let Some(gt) = rest.find('>') else { break };
        let open = &rest[..=gt];
        rest = &rest[gt + 1..];
        let Some(end) = rest.find("</script>") else { break };
        let body = rest[..end].trim();
        rest = &rest[end + 9..];
        let is_json_type = open.contains("application/json")
            || open.contains("__NEXT_DATA__")
            || open.contains("application/ld+json");
        if is_json_type && body.starts_with('{') {
            out.push(body.to_string());
        }
    }
    out
}

fn meta_content(html: &str, prop: &str) -> Option<String> {
    // property="og:title" content="..."
    let patterns = [
        format!("property=\"{prop}\""),
        format!("property='{prop}'"),
        format!("name=\"{prop}\""),
        format!("name='{prop}'"),
    ];
    for p in patterns {
        if let Some(idx) = html.find(&p) {
            let window = &html[idx..].chars().take(400).collect::<String>();
            if let Some(c) = attr_value(window, "content") {
                return Some(html_decode_basic(&c));
            }
        }
    }
    None
}

fn attr_value(tagish: &str, attr: &str) -> Option<String> {
    for quote in ['"', '\''] {
        let key = format!("{attr}={quote}");
        if let Some(start) = tagish.find(&key) {
            let rest = &tagish[start + key.len()..];
            if let Some(end) = rest.find(quote) {
                return Some(rest[..end].to_string());
            }
        }
    }
    None
}

fn title_tag(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title>")? + 7;
    let end = lower[start..].find("</title>")? + start;
    let t = html[start..end].trim();
    if t.is_empty() {
        None
    } else {
        Some(html_decode_basic(t))
    }
}

fn html_decode_basic(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn find_media_urls(html: &str) -> Vec<String> {
    let mut urls = Vec::new();
    for needle in [".m3u8", ".mp4"] {
        let mut rest = html;
        while let Some(idx) = rest.find(needle) {
            let before = &rest[..idx];
            let start = before
                .rfind("https://")
                .or_else(|| before.rfind("http://"));
            if let Some(s) = start {
                let candidate = &rest[s..idx + needle.len()];
                let cleaned = candidate
                    .trim_matches(|c: char| c == '"' || c == '\'' || c == '\\' || c == ')' || c == '(')
                    .to_string();
                if cleaned.starts_with("http") && !urls.contains(&cleaned) {
                    urls.push(cleaned);
                }
            }
            rest = &rest[idx + needle.len()..];
            if urls.len() >= 40 {
                return urls;
            }
        }
    }
    urls
}

fn find_subtitle_urls(html: &str) -> Vec<String> {
    let mut urls = Vec::new();
    for needle in [".vtt", ".srt"] {
        let mut rest = html;
        while let Some(idx) = rest.find(needle) {
            let before = &rest[..idx];
            if let Some(s) = before.rfind("https://").or_else(|| before.rfind("http://")) {
                let candidate = &rest[s..idx + needle.len()];
                let cleaned = candidate
                    .trim_matches(|c: char| c == '"' || c == '\'' || c == '\\')
                    .to_string();
                if cleaned.starts_with("http") && !urls.contains(&cleaned) {
                    urls.push(cleaned);
                }
            }
            rest = &rest[idx + needle.len()..];
            if urls.len() >= 40 {
                return urls;
            }
        }
    }
    urls
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_reelshort_episode_url() {
        let u = "https://www.reelshort.com/episodes/episode-1-daisy-tucker-and-mr-nyc-68955a832bc50c718b009d8d-fxcfjh1dzy";
        let r = parse_drama_ref(u).expect("ref");
        assert_eq!(r.provider, "reelshort");
        assert_eq!(r.episode_index, Some(1));
        assert_eq!(
            r.book_id.as_deref(),
            Some("68955a832bc50c718b009d8d")
        );
    }

    #[test]
    fn parses_dramabox_doc_url() {
        let u = "https://www.dramabox.com/doc/41000122939";
        let r = parse_drama_ref(u).expect("ref");
        assert_eq!(r.provider, "dramabox");
        assert_eq!(r.book_id.as_deref(), Some("41000122939"));
    }

    #[test]
    fn scrapes_next_data_fixture() {
        let html = r#"<!DOCTYPE html><html><head>
<meta property="og:title" content="Test Drama"/>
<meta property="og:image" content="https://cdn.example.com/cover.jpg"/>
</head><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"bookId":"41000122939","bookName":"Test Drama","chapters":[
  {"chapterIndex":1,"chapterId":"c1","chapterName":"Ep 1","video":{"mp4":"https://cdn.example.com/1.mp4"},"subtitle":"https://cdn.example.com/1.vtt"},
  {"chapterIndex":2,"chapterId":"c2","chapterName":"Ep 2","playUrl":"https://cdn.example.com/2.m3u8"}
]}}}
</script>
</body></html>"#;
        let drama_ref = DramaRef {
            provider: "dramabox",
            label: "DramaBox",
            book_id: Some("41000122939".into()),
            episode_index: None,
            slug: None,
        };
        let result = scrape_from_html("https://www.dramabox.com/doc/41000122939", &drama_ref, html)
            .unwrap();
        assert_eq!(result.title.as_deref(), Some("Test Drama"));
        assert_eq!(result.episodes.len(), 2);
        assert_eq!(
            result.episodes[0].media_url.as_deref(),
            Some("https://cdn.example.com/1.mp4")
        );
        assert_eq!(
            result.episodes[0].subtitle_url.as_deref(),
            Some("https://cdn.example.com/1.vtt")
        );
        assert!(result.episodes[1]
            .media_url
            .as_deref()
            .unwrap()
            .contains(".m3u8"));
    }

    #[test]
    fn scrapes_og_video_fallback() {
        let html = r#"<html><head>
<meta property="og:title" content="Single Ep"/>
<meta property="og:video" content="https://cdn.example.com/ep.m3u8"/>
</head><body></body></html>"#;
        let drama_ref = DramaRef {
            provider: "reelshort",
            label: "ReelShort",
            book_id: Some("abc12345".into()),
            episode_index: Some(3),
            slug: None,
        };
        let result = scrape_from_html("https://www.reelshort.com/episodes/x", &drama_ref, html)
            .unwrap();
        assert_eq!(result.episodes.len(), 1);
        assert_eq!(result.episodes[0].index, 3);
        assert!(result.episodes[0]
            .media_url
            .as_deref()
            .unwrap()
            .ends_with(".m3u8"));
    }
}
