/** Meta Developer App credentials + connected Page for Graph API posting. */
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
}

export interface PublishConfig {
  meta: MetaPublishConfig;
}

export const DEFAULT_META_REDIRECT_URI = "http://localhost:8765/meta/callback";

export const DEFAULT_META_PUBLISH: MetaPublishConfig = {
  appId: "",
  appSecret: "",
  redirectUri: DEFAULT_META_REDIRECT_URI,
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
}

export interface MetaPageSummary {
  id: string;
  name: string;
  category?: string;
  tasks?: string[];
}

export interface MetaPostResult {
  ok: boolean;
  postId?: string;
  message: string;
}

export type MetaPublishTimingMode = "now" | "schedule";

/** When mode is `schedule`, `scheduledPublishTime` is required (Unix seconds, UTC). */
export interface MetaPublishTiming {
  mode: MetaPublishTimingMode;
  scheduledPublishTime?: number;
}

export type MetaPostType = "text" | "photo" | "video" | "video_carousel";

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
