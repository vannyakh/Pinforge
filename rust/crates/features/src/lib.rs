//! Feature catalog and scrape option model for the Rust app server.
//!
//! Clients (desktop/CLI) query `features.list` / `scrape.validate`;
//! execution stays in providers/engine/download crates.

mod catalog;
mod scrape;

pub use catalog::{
    feature_count, feature_summary, features_by_category, list_features, FeatureCategory,
    FeatureEntry, FeatureId, FeatureStatus,
};
pub use scrape::{
    validate_scrape, MediaFilter, PublishTimeWindow, ScrapeMode, ScrapeOptions, ScrapePlan,
    SortBy, VideoLengthFilter,
};

pub fn ping() -> &'static str {
    "features-ok"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_has_134_features() {
        assert_eq!(feature_count(), 134);
        assert_eq!(list_features().len(), 134);
    }

    #[test]
    fn categories_partition_all_features() {
        let social = features_by_category(FeatureCategory::Social);
        let advanced = features_by_category(FeatureCategory::Advanced);
        let basic = features_by_category(FeatureCategory::Basic);
        assert!(!social.is_empty());
        assert!(!advanced.is_empty());
        assert!(!basic.is_empty());
        assert_eq!(social.len() + advanced.len() + basic.len(), 134);
    }

    #[test]
    fn scrape_validate_rejects_zero_count() {
        let opts = ScrapeOptions {
            mode: ScrapeMode::Profile,
            max_items: Some(0),
            ..Default::default()
        };
        assert!(validate_scrape("youtube", &opts).is_err());
    }

    #[test]
    fn scrape_plan_for_youtube_playlist() {
        let opts = ScrapeOptions {
            mode: ScrapeMode::Playlist,
            max_items: Some(50),
            video_length: Some(VideoLengthFilter::ShortsOnly),
            scrape_only: true,
            ..Default::default()
        };
        let plan = validate_scrape("youtube", &opts).unwrap();
        assert!(plan.supported);
        assert!(plan.scrape_only);
        assert_eq!(plan.provider, "youtube");
    }
}
