import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { randomBytes } from "node:crypto";
import { shell } from "electron";
import { getStore } from "../store";
import type {
  MetaCarouselSlide,
  MetaPageSummary,
  MetaPageVideoSummary,
  MetaPagePostSummary,
  MetaPagePostsPage,
  MetaPostInsight,
  MetaPostInsightMetrics,
  MetaSharePostsResult,
  MetaDeletePostsResult,
  MetaPostResult,
  MetaPostType,
  MetaPublishConfig,
  MetaPublishPublic,
  MetaPublishTiming,
} from "../../common/publish/types";
import { DEFAULT_META_REDIRECT_URI } from "../../common/publish/types";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const OAUTH_DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

const META_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "public_profile",
].join(",");

const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);
const MIN_CAROUSEL_VIDEOS = 2;
const MAX_CAROUSEL_VIDEOS = 5;
const MIN_SCHEDULE_LEAD_SEC = 10 * 60;
const MAX_SCHEDULE_LEAD_SEC = 75 * 24 * 60 * 60;

function resolvePublishTimingFields(timing?: MetaPublishTiming): Record<string, string> {
  if (!timing || timing.mode !== "schedule") {
    return { published: "true" };
  }
  const ts = timing.scheduledPublishTime;
  if (!ts || !Number.isFinite(ts)) {
    throw new Error("Choose a date and time for the scheduled post.");
  }
  const scheduled = Math.floor(ts);
  const now = Math.floor(Date.now() / 1000);
  if (scheduled < now + MIN_SCHEDULE_LEAD_SEC) {
    throw new Error("Scheduled time must be at least 10 minutes from now.");
  }
  if (scheduled > now + MAX_SCHEDULE_LEAD_SEC) {
    throw new Error("Scheduled time must be within 75 days.");
  }
  return {
    published: "false",
    scheduled_publish_time: String(scheduled),
  };
}

function publishResultMessage(scheduled: boolean, label: string): string {
  return scheduled
    ? `${label} scheduled on the Page feed.`
    : `${label} published to the Page feed.`;
}

type GraphErrorBody = {
  error?: { message?: string; type?: string; code?: number };
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

type MeResponse = {
  id?: string;
  name?: string;
};

type AccountsResponse = {
  data?: Array<{
    id: string;
    name: string;
    access_token?: string;
    category?: string;
    tasks?: string[];
  }>;
  error?: GraphErrorBody["error"];
};

type PostResponse = {
  id?: string;
  post_id?: string;
  error?: GraphErrorBody["error"];
};

type PageVideosResponse = {
  data?: Array<{
    id: string;
    title?: string;
    description?: string;
    updated_time?: string;
    permalink_url?: string;
    picture?: string | { data?: { url?: string } };
    thumbnails?: { data?: Array<{ uri?: string }> };
  }>;
};

type VideoDetailResponse = {
  id?: string;
  title?: string;
  description?: string;
  picture?: string | { data?: { url?: string } };
};

type PhotoImagesResponse = {
  images?: Array<{ source?: string; width?: number; height?: number }>;
};

type PagePostsResponse = {
  data?: Array<{
    id: string;
    message?: string;
    created_time?: string;
    updated_time?: string;
    permalink_url?: string;
    full_picture?: string;
    status_type?: string;
    is_published?: boolean;
    shares?: { count?: number };
    comments?: { summary?: { total_count?: number } };
    reactions?: { summary?: { total_count?: number } };
    attachments?: {
      data?: Array<{
        media_type?: string;
        type?: string;
        subattachments?: { data?: unknown[]; summary?: { total_count?: number } };
        media?: { image?: { src?: string } };
        title?: string;
        description?: string;
        url?: string;
        target?: { url?: string };
      }>;
    };
  }>;
  paging?: { cursors?: { after?: string; before?: string } };
};

let activeOAuth: {
  state: string;
  server: Server;
  timeout: NodeJS.Timeout;
  resolve: (code: string) => void;
  reject: (err: Error) => void;
} | null = null;

function getMetaConfig(): MetaPublishConfig {
  return getStore().get("publish").meta;
}

function setMetaConfig(partial: Partial<MetaPublishConfig>): MetaPublishConfig {
  const store = getStore();
  const next = { ...getMetaConfig(), ...partial };
  store.set("publish", { meta: next });
  return next;
}

function parseRedirectUri(redirectUri: string): { host: string; port: number; pathname: string } {
  const url = new URL(redirectUri.trim() || DEFAULT_META_REDIRECT_URI);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Redirect URI must use http or https.");
  }
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error("Redirect URI port is invalid.");
  }
  return {
    host: url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
    port,
    pathname: url.pathname.endsWith("/") ? url.pathname.slice(0, -1) || "/" : url.pathname,
  };
}

async function graphDelete(path: string, params: Record<string, string>): Promise<void> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), { method: "DELETE" });
  const body = (await res.json()) as { success?: boolean } & GraphErrorBody;
  const err = body.error;
  if (!res.ok || err || body.success === false) {
    throw new Error(err?.message ?? `Graph API delete failed (${res.status}).`);
  }
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString());
  const body = (await res.json()) as T & GraphErrorBody;
  const err = (body as GraphErrorBody).error;
  if (!res.ok || err) {
    throw new Error(err?.message ?? `Graph API request failed (${res.status}).`);
  }
  return body;
}

async function graphPostJson<T>(
  path: string,
  params: Record<string, string>,
  body?: Record<string, string>
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const json = (await res.json()) as T & GraphErrorBody;
  const err = (json as GraphErrorBody).error;
  if (!res.ok || err) {
    throw new Error(err?.message ?? `Graph API request failed (${res.status}).`);
  }
  return json;
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function cancelActiveOAuth(reason?: string): void {
  if (!activeOAuth) return;
  clearTimeout(activeOAuth.timeout);
  activeOAuth.server.close();
  activeOAuth.reject(new Error(reason ?? "OAuth flow cancelled."));
  activeOAuth = null;
}

function waitForOAuthCallback(redirectUri: string, state: string): Promise<string> {
  cancelActiveOAuth("Replaced by a new OAuth attempt.");

  const { host, port, pathname } = parseRedirectUri(redirectUri);

  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      void (async () => {
        try {
          const reqUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
          if (reqUrl.pathname !== pathname) {
            sendHtml(res, 404, "<h1>Not found</h1>");
            return;
          }

          const error = reqUrl.searchParams.get("error");
          const errorDescription = reqUrl.searchParams.get("error_description");
          if (error) {
            sendHtml(
              res,
              400,
              `<h1>Facebook login failed</h1><p>${errorDescription ?? error}</p><p>You can close this tab.</p>`
            );
            cancelActiveOAuth(errorDescription ?? error);
            return;
          }

          const returnedState = reqUrl.searchParams.get("state") ?? "";
          const code = reqUrl.searchParams.get("code") ?? "";
          if (!code || returnedState !== state) {
            sendHtml(res, 400, "<h1>Invalid OAuth response</h1><p>You can close this tab.</p>");
            cancelActiveOAuth("Invalid OAuth state or missing authorization code.");
            return;
          }

          sendHtml(
            res,
            200,
            "<h1>Connected</h1><p>Pinforge received authorization. You can close this tab and return to the app.</p>"
          );

          if (activeOAuth) {
            clearTimeout(activeOAuth.timeout);
            activeOAuth.resolve(code);
            activeOAuth = null;
          }
          server.close();
        } catch (err) {
          sendHtml(res, 500, "<h1>Server error</h1>");
          cancelActiveOAuth(err instanceof Error ? err.message : String(err));
        }
      })();
    });

    server.on("error", (err) => {
      cancelActiveOAuth(err.message);
      reject(err);
    });

    const timeout = setTimeout(() => {
      cancelActiveOAuth("OAuth timed out. Try Connect again.");
    }, OAUTH_TIMEOUT_MS);

    activeOAuth = {
      state,
      server,
      timeout,
      resolve,
      reject,
    };

    server.listen(port, host, () => undefined);
  });
}

async function exchangeCodeForToken(
  config: MetaPublishConfig,
  code: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const redirectUri = config.redirectUri.trim() || DEFAULT_META_REDIRECT_URI;
  const body = await graphGet<TokenResponse>("/oauth/access_token", {
    client_id: config.appId.trim(),
    client_secret: config.appSecret.trim(),
    redirect_uri: redirectUri,
    code,
  });
  if (!body.access_token) throw new Error("Facebook did not return an access token.");
  return { accessToken: body.access_token, expiresIn: body.expires_in };
}

async function exchangeLongLivedToken(
  config: MetaPublishConfig,
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  const body = await graphGet<TokenResponse>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: config.appId.trim(),
    client_secret: config.appSecret.trim(),
    fb_exchange_token: shortLivedToken,
  });
  if (!body.access_token) throw new Error("Failed to exchange for a long-lived token.");
  return { accessToken: body.access_token, expiresIn: body.expires_in };
}

export function toMetaPublishPublic(config: MetaPublishConfig): MetaPublishPublic {
  return {
    appId: config.appId,
    redirectUri: config.redirectUri || DEFAULT_META_REDIRECT_URI,
    hasAppSecret: Boolean(config.appSecret?.trim()),
    connected: Boolean(config.userAccessToken?.trim()),
    userName: config.userName,
    tokenExpiresAt: config.tokenExpiresAt,
    pageId: config.pageId,
    pageName: config.pageName,
    hasPageToken: Boolean(config.pageAccessToken?.trim()),
  };
}

export function getMetaPublishPublic(): MetaPublishPublic {
  return toMetaPublishPublic(getMetaConfig());
}

export function setMetaAppConfig(partial: {
  appId?: string;
  appSecret?: string;
  redirectUri?: string;
}): MetaPublishPublic {
  const prev = getMetaConfig();
  const incomingSecret = partial.appSecret?.trim() ?? "";
  const next: MetaPublishConfig = {
    ...prev,
    appId: partial.appId !== undefined ? partial.appId.trim() : prev.appId,
    redirectUri:
      partial.redirectUri !== undefined
        ? partial.redirectUri.trim() || DEFAULT_META_REDIRECT_URI
        : prev.redirectUri,
    appSecret: incomingSecret || prev.appSecret,
  };
  setMetaConfig(next);
  return toMetaPublishPublic(next);
}

export async function startMetaConnect(): Promise<{ ok: boolean; message: string; userName?: string }> {
  const config = getMetaConfig();
  if (!config.appId.trim() || !config.appSecret.trim()) {
    return { ok: false, message: "Save App ID and App Secret first." };
  }

  const redirectUri = config.redirectUri.trim() || DEFAULT_META_REDIRECT_URI;
  const state = randomBytes(16).toString("hex");
  const authUrl = new URL(OAUTH_DIALOG);
  authUrl.searchParams.set("client_id", config.appId.trim());
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", META_SCOPES);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  try {
    const codePromise = waitForOAuthCallback(redirectUri, state);
    await shell.openExternal(authUrl.toString());
    const code = await codePromise;

    const short = await exchangeCodeForToken(config, code);
    const long = await exchangeLongLivedToken(config, short.accessToken);
    const expiresIn = long.expiresIn ?? short.expiresIn;
    const tokenExpiresAt =
      typeof expiresIn === "number" && expiresIn > 0
        ? Date.now() + expiresIn * 1000
        : Date.now() + 60 * 24 * 60 * 60 * 1000;

    const me = await graphGet<MeResponse>("/me", {
      fields: "id,name",
      access_token: long.accessToken,
    });

    setMetaConfig({
      userAccessToken: long.accessToken,
      tokenExpiresAt,
      userName: me.name,
      pageId: undefined,
      pageName: undefined,
      pageAccessToken: undefined,
    });

    return {
      ok: true,
      message: me.name ? `Connected as ${me.name}.` : "Facebook account connected.",
      userName: me.name,
    };
  } catch (err) {
    cancelActiveOAuth();
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function disconnectMetaPublish(): MetaPublishPublic {
  const prev = getMetaConfig();
  setMetaConfig({
    ...prev,
    userAccessToken: undefined,
    tokenExpiresAt: undefined,
    userName: undefined,
    pageId: undefined,
    pageName: undefined,
    pageAccessToken: undefined,
  });
  return getMetaPublishPublic();
}

type MetaPageInternal = MetaPageSummary & { accessToken?: string };

export async function listMetaPages(): Promise<MetaPageSummary[]> {
  const pages = await listMetaPagesInternal();
  return pages.map(({ accessToken: _token, ...rest }) => rest);
}

async function listMetaPagesInternal(): Promise<MetaPageInternal[]> {
  const config = getMetaConfig();
  const token = config.userAccessToken?.trim();
  if (!token) throw new Error("Connect your Facebook account first.");

  const body = await graphGet<AccountsResponse>("/me/accounts", {
    fields: "id,name,access_token,category,tasks",
    access_token: token,
  });

  return (body.data ?? []).map((page) => ({
    id: page.id,
    name: page.name,
    category: page.category,
    tasks: page.tasks,
    accessToken: page.access_token,
  }));
}

export async function selectMetaPage(payload: {
  pageId: string;
  pageName?: string;
}): Promise<MetaPublishPublic> {
  const pageId = payload.pageId.trim();
  if (!pageId) throw new Error("Page ID is required.");

  const pages = await listMetaPagesInternal();
  const page = pages.find((p) => p.id === pageId);
  if (!page?.accessToken) {
    throw new Error("Page not found or missing permissions. Refresh pages and try again.");
  }

  setMetaConfig({
    pageId: page.id,
    pageName: payload.pageName?.trim() || page.name,
    pageAccessToken: page.accessToken,
  });
  return getMetaPublishPublic();
}

function mediaKind(filePath: string): "image" | "video" | "unknown" {
  const ext = extname(filePath).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return "unknown";
}

async function postPhoto(
  pageId: string,
  pageToken: string,
  message: string,
  filePath: string,
  timing?: MetaPublishTiming
): Promise<MetaPostResult> {
  const form = new FormData();
  form.append("access_token", pageToken);
  const timingFields = resolvePublishTimingFields(timing);
  for (const [key, value] of Object.entries(timingFields)) {
    form.append(key, value);
  }
  if (message.trim()) form.append("message", message.trim());
  form.append("source", new Blob([new Uint8Array(await readFile(filePath))]), basename(filePath));

  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, { method: "POST", body: form });
  const body = (await res.json()) as PostResponse;
  if (!res.ok || body.error) {
    return { ok: false, message: body.error?.message ?? `Photo upload failed (${res.status}).` };
  }
  const scheduled = timing?.mode === "schedule";
  return {
    ok: true,
    postId: body.id ?? body.post_id,
    message: publishResultMessage(scheduled, "Photo"),
  };
}

async function postVideo(
  pageId: string,
  pageToken: string,
  message: string,
  filePath: string,
  timing?: MetaPublishTiming
): Promise<MetaPostResult> {
  const form = new FormData();
  form.append("access_token", pageToken);
  const timingFields = resolvePublishTimingFields(timing);
  for (const [key, value] of Object.entries(timingFields)) {
    form.append(key, value);
  }
  if (message.trim()) form.append("description", message.trim());
  form.append("source", new Blob([new Uint8Array(await readFile(filePath))]), basename(filePath));

  const res = await fetch(`https://graph-video.facebook.com/${GRAPH_VERSION}/${pageId}/videos`, {
    method: "POST",
    body: form,
  });
  const body = (await res.json()) as PostResponse;
  if (!res.ok || body.error) {
    return { ok: false, message: body.error?.message ?? `Video upload failed (${res.status}).` };
  }
  const scheduled = timing?.mode === "schedule";
  return {
    ok: true,
    postId: body.id ?? body.post_id,
    message: publishResultMessage(scheduled, "Video"),
  };
}

function resolvePictureUrl(
  picture?: string | { data?: { url?: string } }
): string | undefined {
  if (!picture) return undefined;
  if (typeof picture === "string") return picture;
  return picture.data?.url;
}

function resolveVideoThumbnail(video: {
  picture?: string | { data?: { url?: string } };
  thumbnails?: { data?: Array<{ uri?: string }> };
}): string | undefined {
  return (
    resolvePictureUrl(video.picture) ??
    video.thumbnails?.data?.find((t) => t.uri)?.uri
  );
}

export async function listMetaPageVideos(limit = 25): Promise<MetaPageVideoSummary[]> {
  const config = getMetaConfig();
  const pageId = config.pageId?.trim();
  const pageToken = config.pageAccessToken?.trim();
  if (!pageId || !pageToken) {
    throw new Error("Select a Facebook Page before listing videos.");
  }

  const capped = Math.max(1, Math.min(50, Math.floor(limit) || 25));
  const body = await graphGet<PageVideosResponse>(`/${pageId}/videos`, {
    fields: "id,title,description,updated_time,permalink_url,picture,thumbnails",
    limit: String(capped),
    access_token: pageToken,
  });

  return (body.data ?? []).map((video) => ({
    id: video.id,
    title: video.title,
    description: video.description,
    updatedTime: video.updated_time,
    permalinkUrl: video.permalink_url,
    thumbnailUrl: resolveVideoThumbnail(video),
  }));
}

function mapPagePost(raw: NonNullable<PagePostsResponse["data"]>[number]): MetaPagePostSummary {
  const attachment = raw.attachments?.data?.[0];
  const subCount =
    attachment?.subattachments?.summary?.total_count ??
    attachment?.subattachments?.data?.length ??
    0;
  const isCarousel =
    subCount > 1 || attachment?.type === "album" || attachment?.media_type === "album";
  const pictureUrl =
    raw.full_picture ??
    attachment?.media?.image?.src ??
    undefined;

  let mediaType = attachment?.media_type ?? attachment?.type;
  if (isCarousel) mediaType = "carousel";
  else if (!mediaType && raw.status_type?.includes("video")) mediaType = "video";
  else if (!mediaType && raw.status_type?.includes("photo")) mediaType = "photo";

  return {
    id: raw.id,
    message: raw.message,
    createdTime: raw.created_time,
    updatedTime: raw.updated_time,
    permalinkUrl: raw.permalink_url,
    pictureUrl,
    statusType: raw.status_type,
    mediaType,
    isPublished: raw.is_published,
    isCarousel,
    attachmentCount: isCarousel ? subCount : attachment ? 1 : 0,
    reactionCount: raw.reactions?.summary?.total_count,
    commentCount: raw.comments?.summary?.total_count,
    shareCount: raw.shares?.count,
  };
}

const PAGE_POSTS_LIST_FIELDS =
  "id,message,created_time,updated_time,permalink_url,full_picture,status_type,is_published,shares,comments.limit(0).summary(true),reactions.limit(0).summary(true),attachments.limit(1){media_type,type,subattachments.limit(0).summary(true),media{image{src}}}";

const PAGE_POSTS_LIST_FIELDS_MINIMAL =
  "id,message,created_time,permalink_url,full_picture,status_type,is_published,attachments.limit(1){media_type,type,media{image{src}}}";

function isGraphDataVolumeError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("reduce the amount of data") || msg.includes("too much data");
}

export async function listMetaPagePosts(opts?: {
  limit?: number;
  after?: string;
}): Promise<MetaPagePostsPage> {
  const config = getMetaConfig();
  const pageId = config.pageId?.trim();
  const pageToken = config.pageAccessToken?.trim();
  if (!pageId || !pageToken) {
    throw new Error("Select a Facebook Page before listing posts.");
  }

  const requested = Math.max(1, Math.min(25, Math.floor(opts?.limit ?? 10) || 10));
  const attempts: Array<{ limit: number; fields: string }> = [
    { limit: requested, fields: PAGE_POSTS_LIST_FIELDS },
    { limit: Math.min(requested, 5), fields: PAGE_POSTS_LIST_FIELDS },
    { limit: 5, fields: PAGE_POSTS_LIST_FIELDS_MINIMAL },
  ];
  const seen = new Set<string>();
  const uniqueAttempts = attempts.filter((a) => {
    const key = `${a.limit}:${a.fields}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let lastErr: Error | undefined;
  for (const attempt of uniqueAttempts) {
    const params: Record<string, string> = {
      fields: attempt.fields,
      limit: String(attempt.limit),
      access_token: pageToken,
    };
    if (opts?.after?.trim()) params.after = opts.after.trim();

    try {
      const body = await graphGet<PagePostsResponse>(`/${pageId}/posts`, params);
      return {
        posts: (body.data ?? []).map(mapPagePost),
        nextCursor: body.paging?.cursors?.after,
      };
    } catch (err) {
      if (!isGraphDataVolumeError(err)) throw err;
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastErr ?? new Error("Failed to list Page posts.");
}

const POST_INSIGHT_METRICS = [
  "post_impressions",
  "post_impressions_unique",
  "post_engaged_users",
  "post_clicks",
  "post_reactions_by_type_total",
  "post_activity_by_action_type",
  "post_video_views",
].join(",");

type PostInsightsResponse = {
  data?: Array<{
    name?: string;
    values?: Array<{ value?: number | Record<string, number> }>;
  }>;
};

function parseInsightObjectValue(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function pickActivityCount(obj: Record<string, number> | undefined, keys: string[]): number | undefined {
  if (!obj) return undefined;
  let sum = 0;
  let found = false;
  for (const key of keys) {
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase().includes(key)) {
        sum += v;
        found = true;
      }
    }
  }
  return found ? sum : undefined;
}

function mapPostInsights(body: PostInsightsResponse): MetaPostInsightMetrics {
  const metrics: MetaPostInsightMetrics = {};
  for (const row of body.data ?? []) {
    const rawValue = row.values?.[0]?.value;
    const scalar = typeof rawValue === "number" ? rawValue : undefined;
    const objectValue = parseInsightObjectValue(rawValue);

    switch (row.name) {
      case "post_impressions":
        if (scalar != null) metrics.impressions = scalar;
        break;
      case "post_impressions_unique":
        if (scalar != null) metrics.reach = scalar;
        break;
      case "post_engaged_users":
        if (scalar != null) metrics.engaged = scalar;
        break;
      case "post_clicks":
        if (scalar != null) metrics.clicks = scalar;
        break;
      case "post_video_views":
        if (scalar != null) metrics.videoViews = scalar;
        break;
      case "post_reactions_by_type_total":
        if (objectValue) {
          metrics.reactions = Object.values(objectValue).reduce((a, b) => a + b, 0);
          metrics.likes = objectValue.like ?? objectValue.LIKE;
          metrics.loves = objectValue.love ?? objectValue.LOVE;
        } else if (scalar != null) {
          metrics.reactions = scalar;
        }
        break;
      case "post_activity_by_action_type":
        if (objectValue) {
          metrics.comments = pickActivityCount(objectValue, ["comment"]);
          metrics.shares = pickActivityCount(objectValue, ["share"]);
          if (metrics.reactions == null) {
            metrics.reactions = pickActivityCount(objectValue, ["like", "reaction"]);
          }
        }
        break;
      default:
        break;
    }
  }
  return metrics;
}

async function fetchPostInsight(postId: string, pageToken: string): Promise<MetaPostInsight> {
  try {
    const body = await graphGet<PostInsightsResponse>(`/${postId}/insights`, {
      metric: POST_INSIGHT_METRICS,
      access_token: pageToken,
    });
    let metrics = mapPostInsights(body);

    try {
      const postBody = await graphGet<{
        shares?: { count?: number };
        comments?: { summary?: { total_count?: number } };
        reactions?: { summary?: { total_count?: number } };
      }>(`/${postId}`, {
        fields: "shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)",
        access_token: pageToken,
      });
      if (metrics.reactions == null && postBody.reactions?.summary?.total_count != null) {
        metrics.reactions = postBody.reactions.summary.total_count;
      }
      if (metrics.comments == null && postBody.comments?.summary?.total_count != null) {
        metrics.comments = postBody.comments.summary.total_count;
      }
      if (metrics.shares == null && postBody.shares?.count != null) {
        metrics.shares = postBody.shares.count;
      }
    } catch {
      /* post object enrichment optional */
    }

    const hasData = Object.values(metrics).some((v) => typeof v === "number");
    return {
      postId,
      ok: hasData,
      metrics,
      message: hasData ? undefined : "No insight data available for this post yet.",
    };
  } catch (err) {
    return {
      postId,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getMetaPostInsights(postIds: string[]): Promise<MetaPostInsight[]> {
  const pageToken = getMetaConfig().pageAccessToken?.trim();
  if (!pageToken) throw new Error("Select a Facebook Page before loading insights.");

  const unique = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
  const results: MetaPostInsight[] = [];
  for (const postId of unique) {
    results.push(await fetchPostInsight(postId, pageToken));
  }
  return results;
}

export async function shareMetaPostsToPages(payload: {
  postIds: string[];
  targetPageIds: string[];
  posts?: Array<{ id: string; message?: string; permalinkUrl?: string }>;
  shareMessage?: string;
}): Promise<MetaSharePostsResult> {
  const postIds = [...new Set(payload.postIds.map((id) => id.trim()).filter(Boolean))];
  const targetPageIds = [...new Set(payload.targetPageIds.map((id) => id.trim()).filter(Boolean))];
  if (postIds.length === 0) throw new Error("Select at least one post to share.");
  if (targetPageIds.length === 0) throw new Error("Select at least one target Page.");

  const pages = await listMetaPagesInternal();
  const postsById = new Map((payload.posts ?? []).map((p) => [p.id, p]));
  const results: MetaSharePostsResult["results"] = [];

  for (const postId of postIds) {
    const post = postsById.get(postId);
    const link = post?.permalinkUrl?.trim();
    const caption = payload.shareMessage?.trim() || post?.message?.trim() || "";

    for (const pageId of targetPageIds) {
      const target = pages.find((p) => p.id === pageId);
      if (!target?.accessToken) {
        results.push({
          postId,
          pageId,
          ok: false,
          message: "Page not found or missing permissions.",
        });
        continue;
      }

      if (!link) {
        results.push({
          postId,
          pageId,
          pageName: target.name,
          ok: false,
          message: "Post has no Facebook permalink to share.",
        });
        continue;
      }

      try {
        const form: Record<string, string> = {
          access_token: target.accessToken,
          link,
        };
        if (caption) form.message = caption;

        const body = await graphPostJson<PostResponse>(`/${pageId}/feed`, {}, form);
        results.push({
          postId,
          pageId,
          pageName: target.name,
          ok: true,
          message: "Shared to Page.",
          newPostId: body.id ?? body.post_id,
        });
      } catch (err) {
        results.push({
          postId,
          pageId,
          pageName: target.name,
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return {
    ok: okCount > 0,
    message:
      okCount === results.length
        ? `Shared ${okCount} time${okCount === 1 ? "" : "s"}.`
        : `${okCount}/${results.length} shares succeeded.`,
    results,
  };
}

export async function deleteMetaPagePosts(postIds: string[]): Promise<MetaDeletePostsResult> {
  const pageToken = getMetaConfig().pageAccessToken?.trim();
  if (!pageToken) throw new Error("Select a Facebook Page before deleting posts.");

  const unique = [...new Set(postIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) throw new Error("Select at least one post to delete.");

  const results: MetaDeletePostsResult["results"] = [];
  for (const postId of unique) {
    try {
      await graphDelete(`/${postId}`, { access_token: pageToken });
      results.push({ postId, ok: true, message: "Post deleted." });
    } catch (err) {
      results.push({
        postId,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return {
    ok: okCount > 0,
    message:
      okCount === results.length
        ? `Deleted ${okCount} post${okCount === 1 ? "" : "s"}.`
        : `${okCount}/${results.length} deletes succeeded.`,
    results,
  };
}

async function uploadPageVideo(
  pageId: string,
  pageToken: string,
  filePath: string,
  opts?: { published?: boolean; title?: string; description?: string }
): Promise<string> {
  const form = new FormData();
  form.append("access_token", pageToken);
  form.append("published", opts?.published === false ? "false" : "true");
  if (opts?.title?.trim()) form.append("title", opts.title.trim());
  if (opts?.description?.trim()) form.append("description", opts.description.trim());
  form.append("source", new Blob([new Uint8Array(await readFile(filePath))]), basename(filePath));

  const res = await fetch(`https://graph-video.facebook.com/${GRAPH_VERSION}/${pageId}/videos`, {
    method: "POST",
    body: form,
  });
  const body = (await res.json()) as PostResponse;
  if (!res.ok || body.error || !body.id) {
    throw new Error(body.error?.message ?? `Video upload failed (${res.status}).`);
  }
  return body.id;
}

async function uploadPagePhotoPicture(
  pageId: string,
  pageToken: string,
  filePath: string
): Promise<string> {
  const form = new FormData();
  form.append("access_token", pageToken);
  form.append("published", "false");
  form.append("source", new Blob([new Uint8Array(await readFile(filePath))]), basename(filePath));

  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, { method: "POST", body: form });
  const body = (await res.json()) as PostResponse;
  if (!res.ok || body.error || !body.id) {
    throw new Error(body.error?.message ?? `Photo upload failed (${res.status}).`);
  }

  const images = await graphGet<PhotoImagesResponse>(`/${body.id}`, {
    fields: "images",
    access_token: pageToken,
  });
  const pictureUrl = images.images?.[0]?.source;
  if (!pictureUrl) throw new Error("Could not resolve uploaded photo URL for carousel.");
  return pictureUrl;
}

async function buildVideoCarouselAttachment(
  pageToken: string,
  videoId: string,
  link: string,
  name?: string,
  description?: string
): Promise<Record<string, string>> {
  const video = await graphGet<VideoDetailResponse>(`/${videoId}`, {
    fields: "title,description,picture",
    access_token: pageToken,
  });
  const attachment: Record<string, string> = {
    link,
    video_id: videoId,
    name: name?.trim() || video.title?.trim() || "Video",
  };
  const cardDescription = description?.trim() || video.description?.trim();
  if (cardDescription) attachment.description = cardDescription;
  const picture = resolvePictureUrl(video.picture);
  if (picture) attachment.picture = picture;
  return attachment;
}

async function resolveCarouselSlideAttachment(
  pageId: string,
  pageToken: string,
  slide: MetaCarouselSlide,
  defaultLink: string
): Promise<Record<string, string>> {
  const cardLink = slide.link?.trim() || defaultLink;

  if (slide.kind === "video") {
    let videoId = slide.pageVideoId?.trim();
    if (!videoId && slide.filePath?.trim()) {
      const path = slide.filePath.trim();
      const info = await stat(path);
      if (!info.isFile()) throw new Error(`Not a file: ${basename(path)}`);
      if (mediaKind(path) !== "video") {
        throw new Error(`Video card requires a video file: ${basename(path)}`);
      }
      videoId = await uploadPageVideo(pageId, pageToken, path, {
        published: false,
        title: slide.name?.trim() || basename(path, extname(path)),
        description: slide.description,
      });
    }
    if (!videoId) throw new Error("Video card needs a Page video or local file.");
    return buildVideoCarouselAttachment(
      pageToken,
      videoId,
      cardLink,
      slide.name,
      slide.description
    );
  }

  const filePath = slide.filePath?.trim();
  if (!filePath) throw new Error("Photo card needs an image file.");
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`Not a file: ${basename(filePath)}`);
  if (mediaKind(filePath) !== "image") {
    throw new Error(`Photo card requires an image file: ${basename(filePath)}`);
  }

  const picture = await uploadPagePhotoPicture(pageId, pageToken, filePath);
  const attachment: Record<string, string> = {
    link: cardLink,
    picture,
    name: slide.name?.trim() || basename(filePath, extname(filePath)),
  };
  if (slide.description?.trim()) attachment.description = slide.description.trim();
  return attachment;
}

function legacySlidesFromPayload(payload: {
  videoIds?: string[];
  filePaths?: string[];
}): MetaCarouselSlide[] {
  const slides: MetaCarouselSlide[] = [];
  for (const id of payload.videoIds ?? []) {
    const trimmed = id.trim();
    if (trimmed) slides.push({ kind: "video", pageVideoId: trimmed });
  }
  for (const path of payload.filePaths ?? []) {
    const trimmed = path.trim();
    if (!trimmed) continue;
    const kind = mediaKind(trimmed);
    if (kind === "video") slides.push({ kind: "video", filePath: trimmed });
    else if (kind === "image") slides.push({ kind: "photo", filePath: trimmed });
  }
  return slides;
}

async function postPeCarousel(
  pageId: string,
  pageToken: string,
  message: string,
  link: string,
  slides: MetaCarouselSlide[],
  timing?: MetaPublishTiming
): Promise<MetaPostResult> {
  if (slides.length < MIN_CAROUSEL_VIDEOS) {
    return {
      ok: false,
      message: `Add at least ${MIN_CAROUSEL_VIDEOS} carousel cards (video or photo).`,
    };
  }
  if (slides.length > MAX_CAROUSEL_VIDEOS) {
    return {
      ok: false,
      message: `Maximum ${MAX_CAROUSEL_VIDEOS} carousel cards per post.`,
    };
  }

  const landingLink = link.trim() || `https://www.facebook.com/${pageId}`;
  const childAttachments = [];
  for (const slide of slides) {
    childAttachments.push(
      await resolveCarouselSlideAttachment(pageId, pageToken, slide, landingLink)
    );
  }

  const timingFields = resolvePublishTimingFields(timing);
  const body = await graphPostJson<PostResponse>(
    `/${pageId}/feed`,
    { access_token: pageToken },
    {
      message: message.trim(),
      ...timingFields,
      multi_share_end_card: "false",
      child_attachments: JSON.stringify(childAttachments),
    }
  );

  const scheduled = timing?.mode === "schedule";
  return {
    ok: true,
    postId: body.id ?? body.post_id,
    message: publishResultMessage(scheduled, "PE media carousel"),
  };
}

async function postText(
  pageId: string,
  pageToken: string,
  message: string,
  timing?: MetaPublishTiming
): Promise<MetaPostResult> {
  const timingFields = resolvePublishTimingFields(timing);
  const body = await graphPostJson<PostResponse>(
    `/${pageId}/feed`,
    { access_token: pageToken },
    { message: message.trim(), ...timingFields }
  );
  const scheduled = timing?.mode === "schedule";
  return {
    ok: true,
    postId: body.id ?? body.post_id,
    message: publishResultMessage(scheduled, "Text post"),
  };
}

export async function postToMetaPage(payload: {
  message: string;
  filePath?: string;
  filePaths?: string[];
  postType?: MetaPostType;
  link?: string;
  videoIds?: string[];
  carouselSlides?: MetaCarouselSlide[];
  timing?: MetaPublishTiming;
}): Promise<MetaPostResult> {
  const config = getMetaConfig();
  const pageId = config.pageId?.trim();
  const pageToken = config.pageAccessToken?.trim();
  if (!pageId || !pageToken) {
    return { ok: false, message: "Select a Facebook Page before posting." };
  }

  const message = payload.message?.trim() ?? "";
  const filePath = payload.filePath?.trim();
  const postType = payload.postType;
  const landingLink = payload.link?.trim() ?? `https://www.facebook.com/${pageId}`;
  const timing = payload.timing;

  if (postType === "video_carousel") {
    try {
      const slides =
        payload.carouselSlides && payload.carouselSlides.length > 0
          ? payload.carouselSlides
          : legacySlidesFromPayload(payload);
      return await postPeCarousel(pageId, pageToken, message, landingLink, slides, timing);
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (postType === "text") {
    if (!message) return { ok: false, message: "Enter a message for the text post." };
    try {
      return await postText(pageId, pageToken, message, timing);
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (postType === "photo" || postType === "video") {
    if (!filePath) {
      return {
        ok: false,
        message: postType === "photo" ? "Choose a photo file." : "Choose a video file.",
      };
    }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) return { ok: false, message: "Media path is not a file." };
      const kind = mediaKind(filePath);
      if (postType === "photo") {
        if (kind !== "image") {
          return { ok: false, message: "Photo posts require an image file." };
        }
        return postPhoto(pageId, pageToken, message, filePath, timing);
      }
      if (kind !== "video") {
        return { ok: false, message: "Video posts require a video file." };
      }
      return postVideo(pageId, pageToken, message, filePath, timing);
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (!message && !filePath) {
    return { ok: false, message: "Enter a message or choose a media file." };
  }

  try {
    if (filePath) {
      const info = await stat(filePath);
      if (!info.isFile()) return { ok: false, message: "Media path is not a file." };

      const kind = mediaKind(filePath);
      if (kind === "image") return postPhoto(pageId, pageToken, message, filePath, timing);
      if (kind === "video") return postVideo(pageId, pageToken, message, filePath, timing);
      return { ok: false, message: "Unsupported media type. Use a common image or video file." };
    }

    if (!message) return { ok: false, message: "Enter a message for the text post." };
    return postText(pageId, pageToken, message, timing);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
