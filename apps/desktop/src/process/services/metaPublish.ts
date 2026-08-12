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
  MetaPostResult,
  MetaPostType,
  MetaPublishConfig,
  MetaPublishPublic,
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
    attachments?: {
      data?: Array<{
        media_type?: string;
        type?: string;
        subattachments?: { data?: unknown[] };
        media?: { image?: { src?: string } };
        title?: string;
        description?: string;
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
  filePath: string
): Promise<MetaPostResult> {
  const form = new FormData();
  form.append("access_token", pageToken);
  form.append("published", "true");
  if (message.trim()) form.append("message", message.trim());
  form.append("source", new Blob([new Uint8Array(await readFile(filePath))]), basename(filePath));

  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, { method: "POST", body: form });
  const body = (await res.json()) as PostResponse;
  if (!res.ok || body.error) {
    return { ok: false, message: body.error?.message ?? `Photo upload failed (${res.status}).` };
  }
  return {
    ok: true,
    postId: body.id ?? body.post_id,
    message: "Photo posted to the Page feed.",
  };
}

async function postVideo(
  pageId: string,
  pageToken: string,
  message: string,
  filePath: string
): Promise<MetaPostResult> {
  const form = new FormData();
  form.append("access_token", pageToken);
  form.append("published", "true");
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
  return {
    ok: true,
    postId: body.id ?? body.post_id,
    message: "Video posted to the Page feed.",
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
  const subCount = attachment?.subattachments?.data?.length ?? 0;
  const isCarousel = subCount > 1;
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
  };
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

  const capped = Math.max(1, Math.min(50, Math.floor(opts?.limit ?? 25) || 25));
  const params: Record<string, string> = {
    fields:
      "id,message,created_time,updated_time,permalink_url,full_picture,status_type,is_published,attachments{media_type,type,subattachments,media,title,description}",
    limit: String(capped),
    access_token: pageToken,
  };
  if (opts?.after?.trim()) params.after = opts.after.trim();

  const body = await graphGet<PagePostsResponse>(`/${pageId}/posts`, params);
  return {
    posts: (body.data ?? []).map(mapPagePost),
    nextCursor: body.paging?.cursors?.after,
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
  slides: MetaCarouselSlide[]
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

  const body = await graphPostJson<PostResponse>(
    `/${pageId}/feed`,
    { access_token: pageToken },
    {
      message: message.trim(),
      published: "true",
      multi_share_end_card: "false",
      child_attachments: JSON.stringify(childAttachments),
    }
  );

  return {
    ok: true,
    postId: body.id ?? body.post_id,
    message: "PE media carousel published to the Page feed.",
  };
}

async function postText(
  pageId: string,
  pageToken: string,
  message: string
): Promise<MetaPostResult> {
  const body = await graphPostJson<PostResponse>(
    `/${pageId}/feed`,
    { access_token: pageToken },
    { message: message.trim(), published: "true" }
  );
  return {
    ok: true,
    postId: body.id ?? body.post_id,
    message: "Text post published to the Page feed.",
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

  if (postType === "video_carousel") {
    try {
      const slides =
        payload.carouselSlides && payload.carouselSlides.length > 0
          ? payload.carouselSlides
          : legacySlidesFromPayload(payload);
      return await postPeCarousel(pageId, pageToken, message, landingLink, slides);
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
      return await postText(pageId, pageToken, message);
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
        return postPhoto(pageId, pageToken, message, filePath);
      }
      if (kind !== "video") {
        return { ok: false, message: "Video posts require a video file." };
      }
      return postVideo(pageId, pageToken, message, filePath);
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
      if (kind === "image") return postPhoto(pageId, pageToken, message, filePath);
      if (kind === "video") return postVideo(pageId, pageToken, message, filePath);
      return { ok: false, message: "Unsupported media type. Use a common image or video file." };
    }

    if (!message) return { ok: false, message: "Enter a message for the text post." };
    return postText(pageId, pageToken, message);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
