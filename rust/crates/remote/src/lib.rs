//! Localhost remote HTTP API (Axum).

use anyhow::{Context, Result};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use pinforge_engine::{CreateJobInput, JobStatus, SharedEngine};
use pinforge_providers::{detect_url, list_providers, tool_status, ytdlp_download, ToolPaths};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
struct AppState {
    engine: SharedEngine,
    tools: Arc<ToolPaths>,
    default_out_dir: PathBuf,
    handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteStartResult {
    pub port: u16,
    pub url: String,
}

pub struct RemoteServer {
    state: AppState,
    shutdown: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
}

impl RemoteServer {
    pub fn new(engine: SharedEngine, tools: ToolPaths, default_out_dir: PathBuf) -> Self {
        Self {
            state: AppState {
                engine,
                tools: Arc::new(tools),
                default_out_dir,
                handle: Arc::new(Mutex::new(None)),
            },
            shutdown: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn start(&self, host: &str, port: u16) -> Result<RemoteStartResult> {
        self.stop().await.ok();

        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        *self.shutdown.lock().await = Some(tx);

        let app = Router::new()
            .route("/health", get(health))
            .route("/api/status", get(api_status))
            .route("/api/tools", get(api_tools))
            .route("/api/providers", get(api_providers))
            .route("/api/detect", post(api_detect))
            .route("/api/queue", post(api_queue))
            .route("/api/download", post(api_download))
            .layer(
                CorsLayer::new()
                    .allow_origin(Any)
                    .allow_methods(Any)
                    .allow_headers(Any),
            )
            .with_state(self.state.clone());

        let addr: SocketAddr = format!("{host}:{port}")
            .parse()
            .with_context(|| format!("invalid bind address {host}:{port}"))?;
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .with_context(|| format!("bind {addr}"))?;
        let actual = listener.local_addr()?;
        let display_host = if host == "0.0.0.0" {
            "127.0.0.1"
        } else {
            host
        };
        let url = format!("http://{display_host}:{}", actual.port());

        let rx = rx;
        let handle = tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = rx.await;
                })
                .await;
        });
        *self.state.handle.lock().await = Some(handle);

        Ok(RemoteStartResult {
            port: actual.port(),
            url,
        })
    }

    pub async fn stop(&self) -> Result<()> {
        if let Some(tx) = self.shutdown.lock().await.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = self.state.handle.lock().await.take() {
            let _ = handle.await;
        }
        Ok(())
    }
}

async fn health() -> impl IntoResponse {
    Json(json!({ "ok": true, "service": "pinforge-remote" }))
}

async fn api_status(State(state): State<AppState>) -> impl IntoResponse {
    let tools = tool_status(&state.tools);
    let unfinished = state.engine.list_unfinished().await.len();
    Json(json!({
        "ok": true,
        "tools": tools,
        "unfinishedJobs": unfinished,
        "via": "rust"
    }))
}

async fn api_tools() -> impl IntoResponse {
    Json(json!({
        "ok": true,
        "tools": ["detect", "queue", "download", "providers", "status"]
    }))
}

async fn api_providers() -> impl IntoResponse {
    Json(json!({ "ok": true, "providers": list_providers() }))
}

#[derive(Deserialize)]
struct UrlBody {
    url: Option<String>,
    text: Option<String>,
    urls: Option<Vec<String>>,
}

fn extract_url(body: &UrlBody) -> Option<String> {
    body.url
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            body.text.as_ref().and_then(|t| {
                t.split_whitespace()
                    .find(|w| w.starts_with("http://") || w.starts_with("https://"))
                    .map(|s| s.to_string())
            })
        })
}

async fn api_detect(Json(body): Json<UrlBody>) -> impl IntoResponse {
    let Some(url) = extract_url(&body) else {
        return (StatusCode::BAD_REQUEST, Json(json!({ "ok": false, "error": "Missing url" })));
    };
    let detected = detect_url(&url);
    (
        StatusCode::OK,
        Json(json!({ "ok": true, "detect": detected })),
    )
}

async fn api_queue(State(state): State<AppState>, Json(body): Json<UrlBody>) -> impl IntoResponse {
    let mut urls = body.urls.clone().unwrap_or_default();
    if urls.is_empty() {
        if let Some(u) = extract_url(&body) {
            urls.push(u);
        }
    }
    let mut queued = 0usize;
    for url in urls {
        let detected = detect_url(&url);
        let _ = state
            .engine
            .create(CreateJobInput {
                url,
                output_dir: Some(state.default_out_dir.display().to_string()),
                provider: detected.provider,
                title: None,
                pack_id: None,
            })
            .await;
        queued += 1;
    }
    (StatusCode::OK, Json(json!({ "ok": true, "queued": queued })))
}

async fn api_download(State(state): State<AppState>, Json(body): Json<UrlBody>) -> impl IntoResponse {
    let Some(url) = extract_url(&body) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "Missing url" })),
        );
    };
    let detected = detect_url(&url);
    let job = match state
        .engine
        .create(CreateJobInput {
            url: url.clone(),
            output_dir: Some(state.default_out_dir.display().to_string()),
            provider: detected.provider.clone(),
            title: None,
            pack_id: None,
        })
        .await
    {
        Ok(j) => j,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "ok": false, "error": e.to_string() })),
            );
        }
    };
    let _ = state
        .engine
        .set_status(&job.id, JobStatus::Downloading, None)
        .await;

    match ytdlp_download(&state.tools, &url, &state.default_out_dir).await {
        Ok(result) => {
            let mut updated = job.clone();
            updated.status = JobStatus::Completed;
            updated.provider = Some(result.provider.clone());
            updated.files.final_file = Some(result.path.clone());
            let _ = state.engine.upsert(updated).await;
            (
                StatusCode::OK,
                Json(json!({
                    "ok": true,
                    "jobId": job.id,
                    "path": result.path,
                    "message": "Downloaded via yt-dlp"
                })),
            )
        }
        Err(e) => {
            let _ = state
                .engine
                .set_status(&job.id, JobStatus::Failed, Some(e.to_string()))
                .await;
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "ok": false, "error": e.to_string(), "jobId": job.id })),
            )
        }
    }
}

pub fn ping() -> &'static str {
    "remote-ok"
}

/// Helper for status payloads without starting HTTP.
pub fn status_value(tools: &ToolPaths, unfinished: usize) -> Value {
    json!({
        "ok": true,
        "tools": tool_status(tools),
        "unfinishedJobs": unfinished,
        "via": "rust"
    })
}
