/** Meta Developer App credentials + connected Page for Graph API posting. */
export type MetaClonePostMode = "single" | "carousel" | "all";

export interface MetaPublishConfig {
  appId: string;
  appSecret: string;
  /** OAuth redirect URI registered in the Meta app (loopback). */
  redirectUri: string;
  userAccessToken?: string;
  tokenExpiresAt?: number;
  userName?: string;
  pageId?: string;
  pageName?: string;
  pageAccessToken?: string;
  /** Saved Facebook Page URL for clone-from-page flow. */
  clonePageUrl?: string;
  /** Default post limit when listing clone source page (1–25). */
  clonePostLimit?: number;
  /** Filter clone list: single posts, carousel posts, or all. */
  clonePostMode?: MetaClonePostMode;
}

export interface PublishConfig {
  meta: MetaPublishConfig;
  youtube: YouTubePublishConfig;
  /** User-saved carousel caption title suggestions (persisted). */
  captionTitleSuggestions: string[];
  /** User-saved hashtag suggestions (persisted). */
  hashtagSuggestions: string[];
}

export const DEFAULT_META_REDIRECT_URI = "http://localhost:8765/meta/callback";

export const DEFAULT_META_PUBLISH: MetaPublishConfig = {
  appId: "",
  appSecret: "",
  redirectUri: DEFAULT_META_REDIRECT_URI,
  clonePostLimit: 10,
  clonePostMode: "all",
};

/** Safe view for renderer — secrets and tokens are never exposed. */
export interface MetaPublishPublic {
  appId: string;
  redirectUri: string;
  hasAppSecret: boolean;
  connected: boolean;
  userName?: string;
  tokenExpiresAt?: number;
  pageId?: string;
  pageName?: string;
  hasPageToken: boolean;
  clonePageUrl?: string;
  clonePostLimit?: number;
  clonePostMode?: MetaClonePostMode;
}

export interface MetaPageSummary {
  id: string;
  name: string;
  category?: string;
  tasks?: string[];
  /** Page profile picture from Graph API `picture`. */
  pictureUrl?: string;
}

export interface MetaPostResult {
  ok: boolean;
  postId?: string;
  message: string;
}

/** Granular Meta Page publish steps streamed to the renderer during `postToMetaPage`. */
export type MetaPublishProgressPhase =
  | "create_video"
  | "video_thumbnail"
  | "upload_photo"
  | "create_post"
  | "publish";

export interface MetaPublishProgressEvent {
  pageId: string;
  phase: MetaPublishProgressPhase;
  message: string;
  videoId?: string;
  postId?: string;
}

export type MetaPublishProgressHandler = (event: MetaPublishProgressEvent) => void;

export type MetaPublishTimingMode = "now" | "schedule";

/** When mode is `schedule`, `scheduledPublishTime` is required (Unix seconds, UTC). */
export interface MetaPublishTiming {
  mode: MetaPublishTimingMode;
  scheduledPublishTime?: number;
}

export type MetaPostType = "text" | "photo" | "video" | "video_carousel";

/** Photo Page post layout — maps to Meta Graph API single / album / link carousel. */
export type MetaPhotoPostMode = "single" | "album" | "carousel";

/** Where multi-photo album mode publishes — Page feed post or a Facebook Album object. */
export type MetaPhotoAlbumDestination = "feed" | "facebook_album";

export interface MetaPageAlbumSummary {
  id: string;
  name: string;
  photoCount?: number;
  coverPhotoUrl?: string;
}

export type MetaCarouselSlideKind = "video" | "photo";

/** One card in a PE / Power Editor media carousel post. */
export interface MetaCarouselSlide {
  kind: MetaCarouselSlideKind;
  /** Existing video on the connected Page. */
  pageVideoId?: string;
  /** Local media file uploaded unpublished before posting. */
  filePath?: string;
  /** Card headline (e.g. brand name on image cards). */
  name?: string;
  /** Card footer text under the media (e.g. "Like Page …"). */
  description?: string;
  /** Per-card link; falls back to the post-level carousel link. */
  link?: string;
  /** Meta Marketing API call_to_action type for carousel ad cards (e.g. LIKE_PAGE). */
  callToActionType?: string;
  /** Local image uploaded as preferred video thumbnail via Graph API /{video-id}/thumbnails. */
  videoThumbnailPath?: string;
}

/** Video already on the connected Facebook Page (for carousel / PE posts). */
export interface MetaPageVideoSummary {
  id: string;
  title?: string;
  description?: string;
  updatedTime?: string;
  thumbnailUrl?: string;
  permalinkUrl?: string;
}

/** A post published on the connected Facebook Page. */
export interface MetaPagePostSummary {
  id: string;
  message?: string;
  createdTime?: string;
  updatedTime?: string;
  permalinkUrl?: string;
  pictureUrl?: string;
  statusType?: string;
  mediaType?: string;
  isPublished?: boolean;
  isCarousel?: boolean;
  attachmentCount?: number;
  /** Summary counts from Graph API post object. */
  reactionCount?: number;
  commentCount?: number;
  shareCount?: number;
}

export interface MetaPagePostsPage {
  posts: MetaPagePostSummary[];
  nextCursor?: string;
}

export interface MetaClonePagePostsResult extends MetaPagePostsPage {
  page: MetaPageSummary;
}

/** Full post content resolved for clone → compose (includes local media paths). */
export interface MetaPagePostCloneDetail {
  postId: string;
  postType: MetaPostType;
  message: string;
  link: string;
  filePath?: string;
  carouselSlides?: MetaCarouselSlide[];
}

export interface MetaPostInsightMetrics {
  impressions?: number;
  reach?: number;
  engaged?: number;
  clicks?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
  likes?: number;
  loves?: number;
  videoViews?: number;
}

export interface MetaPostInsight {
  postId: string;
  ok: boolean;
  message?: string;
  metrics?: MetaPostInsightMetrics;
}

export interface MetaSharePostItemResult {
  postId: string;
  pageId: string;
  pageName?: string;
  ok: boolean;
  message: string;
  newPostId?: string;
}

export interface MetaSharePostsResult {
  ok: boolean;
  message: string;
  results: MetaSharePostItemResult[];
}

export interface MetaDeletePostItemResult {
  postId: string;
  ok: boolean;
  message: string;
}

export interface MetaDeletePostsResult {
  ok: boolean;
  message: string;
  results: MetaDeletePostItemResult[];
}

/** Google OAuth client + connected YouTube channel for Data API uploads. */
export interface YouTubePublishConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  userName?: string;
  channelId?: string;
  channelTitle?: string;
  channelThumbnailUrl?: string;
}

export const DEFAULT_YOUTUBE_REDIRECT_URI = "http://localhost:8766/youtube/callback";

export const DEFAULT_YOUTUBE_PUBLISH: YouTubePublishConfig = {
  clientId: "",
  clientSecret: "",
  redirectUri: DEFAULT_YOUTUBE_REDIRECT_URI,
};

export type YouTubePrivacyStatus = "public" | "private" | "unlisted";

export type YouTubePublishTimingMode = "now" | "schedule";

export interface YouTubePublishTiming {
  mode: YouTubePublishTimingMode;
  /** Unix seconds for scheduled publish */
  scheduledPublishTime?: number;
}

/** Safe view for renderer — secrets and tokens are never exposed. */
export interface YouTubePublishPublic {
  clientId: string;
  redirectUri: string;
  hasClientSecret: boolean;
  connected: boolean;
  userName?: string;
  tokenExpiresAt?: number;
  channelId?: string;
  channelTitle?: string;
  channelThumbnailUrl?: string;
  hasChannel: boolean;
}

export interface YouTubeChannelSummary {
  id: string;
  title: string;
  thumbnailUrl?: string;
}

export interface YouTubePostResult {
  ok: boolean;
  videoId?: string;
  message: string;
}
