//! Shared scrape options validated per provider before download/scrape jobs.

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScrapeMode {
    #[default]
    Single,
    Profile,
    Username,
    Keyword,
    Playlist,
    Board,
    Remix,
    Episode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VideoLengthFilter {
    ShortsOnly,
    LongOnly,
    All,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MediaFilter {
    PhotoOnly,
    VideoOnly,
    All,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SortBy {
    DateNewest,
    DateOldest,
    Popularity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PublishTimeWindow {
    Hours24,
    Days7,
    Days30,
    Months3,
    Months6,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapeOptions {
    #[serde(default)]
    pub mode: ScrapeMode,
    /// Username / profile handle when mode is Username or Profile
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub keyword: Option<String>,
    /// Cap items (1–2000). None = provider default.
    #[serde(default)]
    pub max_items: Option<u32>,
    /// Scrape metadata only — no file download
    #[serde(default)]
    pub scrape_only: bool,
    #[serde(default)]
    pub video_length: Option<VideoLengthFilter>,
    #[serde(default)]
    pub media_filter: Option<MediaFilter>,
    #[serde(default)]
    pub sort_by: Option<SortBy>,
    #[serde(default)]
    pub publish_time: Option<PublishTimeWindow>,
    /// ISO 3166-1 alpha-2 region code
    #[serde(default)]
    pub region: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub cookie: Option<String>,
    #[serde(default)]
    pub episode_id: Option<String>,
    #[serde(default)]
    pub remove_hashtags: bool,
    #[serde(default)]
    pub save_caption_txt: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapePlan {
    pub provider: String,
    pub supported: bool,
    pub scrape_only: bool,
    pub max_items: u32,
    pub mode: ScrapeMode,
    pub warnings: Vec<String>,
    pub notes: Vec<String>,
}

const MAX_ITEMS_CAP: u32 = 2000;
const DEFAULT_MAX: u32 = 50;

/// Validate scrape options for a provider id and produce an executable plan.
pub fn validate_scrape(provider: &str, opts: &ScrapeOptions) -> Result<ScrapePlan> {
    let mut warnings = Vec::new();
    let mut notes = Vec::new();

    if let Some(0) = opts.max_items {
        bail!("maxItems must be >= 1");
    }
    let max_items = opts.max_items.unwrap_or(DEFAULT_MAX).clamp(1, MAX_ITEMS_CAP);
    if opts.max_items.is_some_and(|n| n > MAX_ITEMS_CAP) {
        warnings.push(format!("maxItems capped at {MAX_ITEMS_CAP}"));
    }

    let provider = provider.to_ascii_lowercase();
    let mut supported = true;

    match opts.mode {
        ScrapeMode::Playlist if provider != "youtube" && provider != "ytdlp" => {
            warnings.push("playlist mode is best supported on YouTube".into());
        }
        ScrapeMode::Remix if provider != "sora2" && provider != "sora" => {
            warnings.push("remix mode is intended for Sora2".into());
            supported = false;
        }
        ScrapeMode::Episode if !provider.starts_with("drama") && !is_drama_provider(&provider) => {
            notes.push("episode mode targets micro-drama providers".into());
        }
        ScrapeMode::Board if provider != "pinterest" => {
            warnings.push("board mode is designed for Pinterest".into());
        }
        ScrapeMode::Keyword if !matches!(provider.as_str(), "pinterest" | "tiktok" | "youtube") => {
            notes.push("keyword scrape support varies by site".into());
        }
        _ => {}
    }

    if opts.publish_time.is_some() && provider != "tiktok" {
        warnings.push("publish-time filter is TikTok-oriented".into());
    }
    if opts.video_length.is_some() && provider != "youtube" {
        warnings.push("short/long filter is YouTube-oriented".into());
    }
    if opts.cookie.is_none()
        && matches!(
            opts.mode,
            ScrapeMode::Profile | ScrapeMode::Username | ScrapeMode::Board
        )
        && matches!(provider.as_str(), "kuaishou" | "twitter" | "instagram")
    {
        notes.push("cookie may be required for private or rate-limited profiles".into());
    }
    if opts.scrape_only {
        notes.push("scrapeOnly=true: metadata export without media files".into());
    }
    if opts.save_caption_txt {
        notes.push("captions will be written as .txt sidecars when supported".into());
    }

    Ok(ScrapePlan {
        provider,
        supported,
        scrape_only: opts.scrape_only,
        max_items,
        mode: opts.mode,
        warnings,
        notes,
    })
}

fn is_drama_provider(id: &str) -> bool {
    matches!(
        id,
        "reelshort"
            | "shortmax"
            | "netshort"
            | "flextv"
            | "meloshort"
            | "dramawave"
            | "dramabox"
            | "goodshort"
            | "melolo"
            | "snackshort"
            | "drama"
    ) || id.contains("drama")
        || id.contains("short")
        || id.contains("reel")
}
