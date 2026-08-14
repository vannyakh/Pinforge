import { createReadStream, type ReadStream } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { stat } from "node:fs/promises";
import { extname } from "node:path";
import { randomBytes } from "node:crypto";
import { shell } from "electron";
import { getStore } from "../store";
import type {
  YouTubeChannelSummary,
  YouTubePostResult,
  YouTubePrivacyStatus,
  YouTubePublishConfig,
  YouTubePublishPublic,
  YouTubePublishTiming,
} from "../../common/publish/types";
import { DEFAULT_YOUTUBE_REDIRECT_URI } from "../../common/publish/types";
import { oauthErrorPage, oauthSuccessPage, renderOAuthCallbackPage } from "../oauthCallbackPage";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const MIN_SCHEDULE_LEAD_SEC = 15 * 60;
const MAX_SCHEDULE_LEAD_SEC = 6 * 30 * 24 * 60 * 60;

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"]);

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleErrorBody = {
  error?: {
    message?: string;
    errors?: Array<{ message?: string; reason?: string }>;
  };
};

type ChannelsResponse = GoogleErrorBody & {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      thumbnails?: { default?: { url?: string } };
    };
  }>;
};

type VideoInsertResponse = GoogleErrorBody & {
  id?: string;
};

let activeOAuth: {
  state: string;
  server: Server;
  timeout: NodeJS.Timeout;
  resolve: (code: string) => void;
  reject: (err: Error) => void;
} | null = null;

function getYouTubeConfig(): YouTubePublishConfig {
  return getStore().get("publish").youtube;
}

function setYouTubeConfig(partial: Partial<YouTubePublishConfig>): YouTubePublishConfig {
  const store = getStore();
  const publish = store.get("publish");
  const next = { ...publish.youtube, ...partial };
  store.set("publish", { ...publish, youtube: next });
  return next;
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem">${body}</body></html>`);
}

function parseRedirectUri(redirectUri: string): { host: string; port: number; pathname: string } {
  const url = new URL(redirectUri.trim() || DEFAULT_YOUTUBE_REDIRECT_URI);
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

function cancelActiveOAuth(reason?: string): void {
  if (!activeOAuth) return;
  clearTimeout(activeOAuth.timeout);
  try {
    activeOAuth.server.close();
  } catch {
    /* ignore */
  }
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
            sendHtml(
              res,
              404,
              renderOAuthCallbackPage({
                variant: "not_found",
                title: "Not found",
                message: "This OAuth callback URL is not valid.",
              })
            );
            return;
          }

          const error = reqUrl.searchParams.get("error");
          const errorDescription = reqUrl.searchParams.get("error_description");
          if (error) {
            sendHtml(
              res,
              400,
              oauthErrorPage("Google sign-in failed", errorDescription ?? error)
            );
            cancelActiveOAuth(errorDescription ?? error);
            return;
          }

          const returnedState = reqUrl.searchParams.get("state") ?? "";
          const code = reqUrl.searchParams.get("code") ?? "";
          if (!code || returnedState !== state) {
            sendHtml(
              res,
              400,
              renderOAuthCallbackPage({
                variant: "invalid",
                title: "Invalid response",
                message: "The authorization response could not be verified. Try connecting again from Pinforge.",
              })
            );
            cancelActiveOAuth("Invalid OAuth state or missing authorization code.");
            return;
          }

          sendHtml(res, 200, oauthSuccessPage("YouTube"));

          if (activeOAuth) {
            clearTimeout(activeOAuth.timeout);
            activeOAuth.resolve(code);
            activeOAuth = null;
          }
          server.close();
        } catch (err) {
          sendHtml(
            res,
            500,
            renderOAuthCallbackPage({
              variant: "server_error",
              title: "Something went wrong",
              message: "The local callback server hit an error. Close this tab and try again.",
            })
          );
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

function googleErrorMessage(body: GoogleErrorBody, fallback: string): string {
  const err = body.error;
  if (!err) return fallback;
  const detail = err.errors?.[0]?.message ?? err.message;
  return detail ?? fallback;
}

async function exchangeCodeForTokens(
  config: YouTubePublishConfig,
  code: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const redirectUri = config.redirectUri.trim() || DEFAULT_YOUTUBE_REDIRECT_URI;
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId.trim(),
      client_secret: config.clientSecret.trim(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description ?? body.error ?? "Google did not return an access token.");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: body.expires_in,
  };
}

async function refreshAccessToken(config: YouTubePublishConfig): Promise<string> {
  const refreshToken = config.refreshToken?.trim();
  if (!refreshToken) throw new Error("Missing refresh token. Connect YouTube again.");

  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId.trim(),
      client_secret: config.clientSecret.trim(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description ?? body.error ?? "Failed to refresh YouTube access token.");
  }

  const expiresIn = body.expires_in;
  const tokenExpiresAt =
    typeof expiresIn === "number" && expiresIn > 0
      ? Date.now() + expiresIn * 1000
      : Date.now() + 3600 * 1000;

  setYouTubeConfig({
    accessToken: body.access_token,
    tokenExpiresAt,
  });
  return body.access_token;
}

async function ensureAccessToken(): Promise<string> {
  const config = getYouTubeConfig();
  const token = config.accessToken?.trim();
  const expiresAt = config.tokenExpiresAt ?? 0;
  if (token && expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return token;
  }
  return refreshAccessToken(config);
}

function resolveUploadStatus(
  privacyStatus: YouTubePrivacyStatus,
  timing?: YouTubePublishTiming
): { privacyStatus: YouTubePrivacyStatus; publishAt?: string } {
  if (!timing || timing.mode !== "schedule") {
    return { privacyStatus };
  }
  const ts = timing.scheduledPublishTime;
  if (!ts || !Number.isFinite(ts)) {
    throw new Error("Choose a date and time for the scheduled upload.");
  }
  const scheduled = Math.floor(ts);
  const now = Math.floor(Date.now() / 1000);
  if (scheduled < now + MIN_SCHEDULE_LEAD_SEC) {
    throw new Error("Scheduled time must be at least 15 minutes from now.");
  }
  if (scheduled > now + MAX_SCHEDULE_LEAD_SEC) {
    throw new Error("Scheduled time must be within six months.");
  }
  const publishAt = new Date(scheduled * 1000).toISOString();
  return { privacyStatus: "private", publishAt };
}

function videoMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mkv") return "video/x-matroska";
  if (ext === ".avi") return "video/x-msvideo";
  return "application/octet-stream";
}

function uploadResultMessage(scheduled: boolean): string {
  return scheduled
    ? "Video scheduled on your YouTube channel."
    : "Video uploaded to your YouTube channel.";
}

export function toYouTubePublishPublic(config: YouTubePublishConfig): YouTubePublishPublic {
  return {
    clientId: config.clientId,
    redirectUri: config.redirectUri || DEFAULT_YOUTUBE_REDIRECT_URI,
    hasClientSecret: Boolean(config.clientSecret?.trim()),
    connected: Boolean(config.refreshToken?.trim() || config.accessToken?.trim()),
    userName: config.userName,
    tokenExpiresAt: config.tokenExpiresAt,
    channelId: config.channelId,
    channelTitle: config.channelTitle,
    channelThumbnailUrl: config.channelThumbnailUrl,
    hasChannel: Boolean(config.channelId?.trim()),
  };
}

export function getYouTubePublishPublic(): YouTubePublishPublic {
  return toYouTubePublishPublic(getYouTubeConfig());
}

export function setYouTubeAppConfig(partial: {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}): YouTubePublishPublic {
  const prev = getYouTubeConfig();
  const incomingSecret = partial.clientSecret?.trim() ?? "";
  const next: YouTubePublishConfig = {
    ...prev,
    clientId: partial.clientId !== undefined ? partial.clientId.trim() : prev.clientId,
    redirectUri:
      partial.redirectUri !== undefined
        ? partial.redirectUri.trim() || DEFAULT_YOUTUBE_REDIRECT_URI
        : prev.redirectUri,
    clientSecret: incomingSecret || prev.clientSecret,
  };
  setYouTubeConfig(next);
  return toYouTubePublishPublic(next);
}

export async function startYouTubeConnect(): Promise<{ ok: boolean; message: string; userName?: string }> {
  const config = getYouTubeConfig();
  if (!config.clientId.trim() || !config.clientSecret.trim()) {
    return { ok: false, message: "Save Client ID and Client Secret first." };
  }

  const redirectUri = config.redirectUri.trim() || DEFAULT_YOUTUBE_REDIRECT_URI;
  const state = randomBytes(16).toString("hex");
  const authUrl = new URL(GOOGLE_AUTH);
  authUrl.searchParams.set("client_id", config.clientId.trim());
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", YOUTUBE_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  try {
    const codePromise = waitForOAuthCallback(redirectUri, state);
    await shell.openExternal(authUrl.toString());
    const code = await codePromise;

    const tokens = await exchangeCodeForTokens(config, code);
    const expiresIn = tokens.expiresIn;
    const tokenExpiresAt =
      typeof expiresIn === "number" && expiresIn > 0
        ? Date.now() + expiresIn * 1000
        : Date.now() + 3600 * 1000;

    setYouTubeConfig({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? config.refreshToken,
      tokenExpiresAt,
      userName: undefined,
      channelId: undefined,
      channelTitle: undefined,
      channelThumbnailUrl: undefined,
    });

    const channels = await listYouTubeChannels();
    if (channels.length === 1) {
      await selectYouTubeChannel({
        channelId: channels[0].id,
        channelTitle: channels[0].title,
        channelThumbnailUrl: channels[0].thumbnailUrl,
      });
    }

    const updated = getYouTubeConfig();
    const label = updated.channelTitle ?? updated.userName ?? "YouTube account";

    return {
      ok: true,
      message: `Connected to ${label}.`,
      userName: label,
    };
  } catch (err) {
    cancelActiveOAuth();
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function disconnectYouTubePublish(): YouTubePublishPublic {
  const prev = getYouTubeConfig();
  setYouTubeConfig({
    ...prev,
    accessToken: undefined,
    refreshToken: undefined,
    tokenExpiresAt: undefined,
    userName: undefined,
    channelId: undefined,
    channelTitle: undefined,
    channelThumbnailUrl: undefined,
  });
  return getYouTubePublishPublic();
}

export async function listYouTubeChannels(): Promise<YouTubeChannelSummary[]> {
  const token = await ensureAccessToken();
  const url = new URL(`${YOUTUBE_API}/channels`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("mine", "true");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as ChannelsResponse;
  if (!res.ok) {
    throw new Error(googleErrorMessage(body, "Failed to list YouTube channels."));
  }

  return (body.items ?? []).map((item) => ({
    id: item.id,
    title: item.snippet?.title ?? item.id,
    thumbnailUrl: item.snippet?.thumbnails?.default?.url,
  }));
}

export async function selectYouTubeChannel(payload: {
  channelId: string;
  channelTitle?: string;
  channelThumbnailUrl?: string;
}): Promise<YouTubePublishPublic> {
  const channelId = payload.channelId.trim();
  if (!channelId) throw new Error("Channel ID is required.");

  const channels = await listYouTubeChannels();
  const channel = channels.find((c) => c.id === channelId);
  if (!channel) {
    throw new Error("Channel not found. Refresh channels and try again.");
  }

  setYouTubeConfig({
    channelId: channel.id,
    channelTitle: payload.channelTitle?.trim() || channel.title,
    channelThumbnailUrl: payload.channelThumbnailUrl ?? channel.thumbnailUrl,
    userName: payload.channelTitle?.trim() || channel.title,
  });
  return getYouTubePublishPublic();
}

async function initiateResumableUpload(
  accessToken: string,
  metadata: Record<string, unknown>
): Promise<string> {
  const url = new URL(YOUTUBE_UPLOAD);
  url.searchParams.set("uploadType", "resumable");
  url.searchParams.set("part", "snippet,status");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/*",
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    let message = "Failed to start YouTube upload.";
    try {
      const body = (await res.json()) as GoogleErrorBody;
      message = googleErrorMessage(body, message);
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const location = res.headers.get("Location");
  if (!location) throw new Error("YouTube did not return an upload URL.");
  return location;
}

async function uploadVideoStream(
  location: string,
  filePath: string,
  contentType: string
): Promise<string | undefined> {
  const fileStat = await stat(filePath);
  const size = fileStat.size;
  const stream = createReadStream(filePath) as ReadStream;

  const res = await fetch(location, {
    method: "PUT",
    headers: {
      "Content-Length": String(size),
      "Content-Type": contentType,
    },
    body: stream as unknown as NonNullable<RequestInit["body"]>,
    duplex: "half" as const,
  });

  if (!res.ok) {
    let message = "Video upload failed.";
    try {
      const body = (await res.json()) as GoogleErrorBody;
      message = googleErrorMessage(body, message);
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  try {
    const body = (await res.json()) as VideoInsertResponse;
    return body.id;
  } catch {
    return undefined;
  }
}

export async function uploadToYouTube(payload: {
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: YouTubePrivacyStatus;
  filePath: string;
  timing?: YouTubePublishTiming;
}): Promise<YouTubePostResult> {
  const config = getYouTubeConfig();
  if (!config.channelId?.trim()) {
    return { ok: false, message: "Select a YouTube channel in Publishing settings first." };
  }

  const filePath = payload.filePath.trim();
  if (!filePath) {
    return { ok: false, message: "Choose a video file to upload." };
  }

  const ext = extname(filePath).toLowerCase();
  if (!VIDEO_EXT.has(ext)) {
    return { ok: false, message: "Unsupported video format. Use MP4, MOV, WebM, or MKV." };
  }

  const title = payload.title.trim();
  if (!title) {
    return { ok: false, message: "Title is required for YouTube uploads." };
  }

  const privacyStatus = payload.privacyStatus ?? "private";
  const scheduled = payload.timing?.mode === "schedule";
  let statusFields: { privacyStatus: YouTubePrivacyStatus; publishAt?: string };
  try {
    statusFields = resolveUploadStatus(privacyStatus, payload.timing);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  try {
    const accessToken = await ensureAccessToken();
    const tags = (payload.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 30);
    const metadata = {
      snippet: {
        title,
        description: payload.description?.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        categoryId: "22",
      },
      status: {
        privacyStatus: statusFields.privacyStatus,
        publishAt: statusFields.publishAt,
        selfDeclaredMadeForKids: false,
      },
    };

    const uploadUrl = await initiateResumableUpload(accessToken, metadata);
    const videoId = await uploadVideoStream(uploadUrl, filePath, videoMimeType(filePath));

    return {
      ok: true,
      videoId,
      message: uploadResultMessage(scheduled),
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
