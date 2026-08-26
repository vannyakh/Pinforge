//! Pinforge desktop app server — newline-delimited JSON-RPC over stdio.
//!
//! Protocol:
//!   → { "id": "...", "method": "ping", "params": {} }
//!   ← { "id": "...", "ok": true, "result": {...} }
//!   ← { "event": "download.progress", "payload": {...} }

mod rpc;

use anyhow::{Context, Result};
use download::{DownloadOptions, ProgressFn};
use pinforge_engine::{CreateJobInput, JobEngine, JobProgress, JobStatus, ListJobsFilter, SharedEngine};
use pinforge_features::{feature_summary, list_features, validate_scrape, ScrapeOptions};
use pinforge_providers::{
    detect_url, ffmpeg_version, list_providers, scrape_drama, tool_status, ytdlp_download,
    DramaScrapeOpts, ToolPaths,
};
use pinforge_remote::RemoteServer;
use pinforge_settings::SettingsStore;
use rpc::{emit_event, write_error, write_result, RpcRequest};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;

struct App {
    data_dir: PathBuf,
    engine: SharedEngine,
    settings: Arc<SettingsStore>,
    tools: Arc<Mutex<ToolPaths>>,
    remote: Arc<Mutex<Option<RemoteServer>>>,
    default_out_dir: Arc<Mutex<PathBuf>>,
}

impl App {
    async fn new(data_dir: PathBuf) -> Result<Self> {
        tokio::fs::create_dir_all(&data_dir).await?;
        let engine = Arc::new(JobEngine::new(data_dir.join("mediacore")));
        engine.init().await?;
        let settings = Arc::new(SettingsStore::new(&data_dir));
        settings.init().await?;
        let default_out = data_dir.join("downloads");
        tokio::fs::create_dir_all(&default_out).await?;
        Ok(Self {
            data_dir,
            engine,
            settings,
            tools: Arc::new(Mutex::new(ToolPaths::from_env())),
            remote: Arc::new(Mutex::new(None)),
            default_out_dir: Arc::new(Mutex::new(default_out)),
        })
    }

    async fn handle(&self, req: RpcRequest) -> Result<Value> {
        let params = req.params.unwrap_or(Value::Null);
        match req.method.as_str() {
            "ping" => Ok(json!({
                "bridge": bridge::surface_version(),
                "enhance": enhance::ping(),
                "download": download::ping(),
                "engine": pinforge_engine::ping(),
                "settings": pinforge_settings::ping(),
                "providers": pinforge_providers::ping(),
                "features": pinforge_features::ping(),
                "remote": pinforge_remote::ping(),
                "featureTotal": pinforge_features::feature_count(),
                "dataDir": self.data_dir.display().to_string(),
            })),
            "shutdown" => {
                if let Some(remote) = self.remote.lock().await.as_ref() {
                    let _ = remote.stop().await;
                }
                Ok(json!({ "bye": true }))
            }
            "enhance.run" => self.enhance_run(params).await,
            "download.run" => self.download_run(params).await,
            "system.diskSpace" => self.disk_space(params).await,
            "system.resources" => self.resources().await,
            "system.zipFolder" => self.zip_folder(params).await,
            "jobs.create" => {
                let input: CreateJobInput = serde_json::from_value(params)?;
                let job = self.engine.create(input).await?;
                Ok(serde_json::to_value(job)?)
            }
            "jobs.get" => {
                let id = params
                    .get("id")
                    .and_then(|v| v.as_str())
                    .context("missing id")?;
                Ok(serde_json::to_value(self.engine.get(id).await)?)
            }
            "jobs.list" => {
                let filter: ListJobsFilter = serde_json::from_value(params).unwrap_or_default();
                Ok(serde_json::to_value(self.engine.list(filter).await)?)
            }
            "jobs.listUnfinished" => Ok(serde_json::to_value(self.engine.list_unfinished().await)?),
            "jobs.pause" => {
                let id = params.get("id").and_then(|v| v.as_str()).context("missing id")?;
                Ok(serde_json::to_value(self.engine.pause(id).await?)?)
            }
            "jobs.resume" => {
                let id = params.get("id").and_then(|v| v.as_str()).context("missing id")?;
                Ok(serde_json::to_value(self.engine.resume(id).await?)?)
            }
            "jobs.cancel" => {
                let id = params.get("id").and_then(|v| v.as_str()).context("missing id")?;
                Ok(serde_json::to_value(self.engine.cancel(id).await?)?)
            }
            "jobs.recover" => Ok(serde_json::to_value(self.engine.recover().await?)?),
            "jobs.updateProgress" => {
                let id = params.get("id").and_then(|v| v.as_str()).context("missing id")?;
                let progress: JobProgress = serde_json::from_value(
                    params.get("progress").cloned().unwrap_or(Value::Null),
                )?;
                Ok(serde_json::to_value(
                    self.engine.update_progress(id, progress).await?,
                )?)
            }
            "jobs.setStatus" => {
                let id = params.get("id").and_then(|v| v.as_str()).context("missing id")?;
                let status: JobStatus = serde_json::from_value(
                    params.get("status").cloned().context("missing status")?,
                )?;
                let error = params
                    .get("error")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                Ok(serde_json::to_value(
                    self.engine.set_status(id, status, error).await?,
                )?)
            }
            "media.process" => self.media_process(params).await,
            "settings.get" => Ok(self.settings.get().await),
            "settings.set" => {
                let result = self.settings.set(params).await?;
                Ok(result)
            }
            "providers.list" => Ok(serde_json::to_value(list_providers())?),
            "providers.detect" => {
                let url = params
                    .get("url")
                    .and_then(|v| v.as_str())
                    .context("missing url")?;
                Ok(serde_json::to_value(detect_url(url))?)
            }
            "features.list" => Ok(serde_json::to_value(list_features())?),
            "features.summary" => Ok(feature_summary()),
            "scrape.validate" | "scrape.plan" => {
                let provider = params
                    .get("provider")
                    .and_then(|v| v.as_str())
                    .context("missing provider")?;
                let opts: ScrapeOptions = params
                    .get("options")
                    .cloned()
                    .map(serde_json::from_value)
                    .transpose()?
                    .unwrap_or_default();
                let plan = validate_scrape(provider, &opts)?;
                Ok(serde_json::to_value(plan)?)
            }
            "drama.scrape" => {
                let url = params
                    .get("url")
                    .and_then(|v| v.as_str())
                    .context("missing url")?;
                let scrape_opts: ScrapeOptions = params
                    .get("options")
                    .cloned()
                    .map(serde_json::from_value)
                    .transpose()?
                    .unwrap_or_default();
                let drama_opts = DramaScrapeOpts {
                    max_items: scrape_opts.max_items,
                    language: scrape_opts.language.clone(),
                    episode_id: scrape_opts.episode_id.clone(),
                    scrape_only: scrape_opts.scrape_only,
                };
                let result = scrape_drama(url, &drama_opts).await?;
                Ok(serde_json::to_value(result)?)
            }
            "tools.status" => {
                let tools = self.tools.lock().await;
                Ok(serde_json::to_value(tool_status(&tools))?)
            }
            "tools.setPaths" => {
                let mut tools = self.tools.lock().await;
                if let Some(p) = params.get("ytdlp").and_then(|v| v.as_str()) {
                    tools.ytdlp = Some(PathBuf::from(p));
                }
                if let Some(p) = params.get("ffmpeg").and_then(|v| v.as_str()) {
                    tools.ffmpeg = Some(PathBuf::from(p));
                }
                Ok(serde_json::to_value(tool_status(&tools))?)
            }
            "tools.ffmpegVersion" => {
                let tools = self.tools.lock().await;
                Ok(json!({ "version": ffmpeg_version(&tools).await? }))
            }
            "remote.start" => self.remote_start(params).await,
            "remote.stop" => {
                if let Some(remote) = self.remote.lock().await.as_ref() {
                    remote.stop().await?;
                }
                *self.remote.lock().await = None;
                Ok(json!({ "ok": true }))
            }
            "config.setOutDir" => {
                let dir = params
                    .get("outDir")
                    .and_then(|v| v.as_str())
                    .context("missing outDir")?;
                let path = PathBuf::from(dir);
                tokio::fs::create_dir_all(&path).await?;
                *self.default_out_dir.lock().await = path.clone();
                Ok(json!({ "outDir": path.display().to_string() }))
            }
            other => Err(anyhow::anyhow!("unknown method: {other}")),
        }
    }

    async fn enhance_run(&self, params: Value) -> Result<Value> {
        let preset = params
            .get("preset")
            .and_then(|v| v.as_str())
            .unwrap_or("auto");
        let input = params
            .get("input")
            .and_then(|v| v.as_str())
            .context("missing input")?;
        let output = params
            .get("output")
            .and_then(|v| v.as_str())
            .context("missing output")?;
        let preset = enhance::validate_preset(preset)?;
        let meta = enhance::enhance_file(PathBuf::from(input).as_path(), PathBuf::from(output).as_path(), preset)?;
        Ok(serde_json::to_value(meta)?)
    }

    async fn download_run(&self, params: Value) -> Result<Value> {
        let url = params
            .get("url")
            .and_then(|v| v.as_str())
            .context("missing url")?
            .to_string();
        let out = params
            .get("out")
            .and_then(|v| v.as_str())
            .context("missing out")?
            .to_string();
        let concurrency = params
            .get("concurrency")
            .and_then(|v| v.as_u64())
            .unwrap_or(4) as usize;
        let referer = params
            .get("referer")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let job_id = params
            .get("jobId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let engine = self.engine.clone();
        let job_id_cb = job_id.clone();
        let on_progress: ProgressFn = Arc::new(move |p| {
            let payload = json!({
                "jobId": job_id_cb,
                "downloadedBytes": p.downloaded_bytes,
                "totalBytes": p.total_bytes,
                "percent": p.percent,
            });
            emit_event("download.progress", payload);
            if let Some(ref id) = job_id_cb {
                let engine = engine.clone();
                let id = id.clone();
                let progress = JobProgress {
                    downloaded_bytes: p.downloaded_bytes,
                    total_bytes: p.total_bytes,
                    percent: p.percent,
                };
                tokio::spawn(async move {
                    let _ = engine.update_progress(&id, progress).await;
                });
            }
        });

        if let Some(ref id) = job_id {
            let _ = self
                .engine
                .set_status(id, JobStatus::Downloading, None)
                .await;
        }

        let result = download::download_file_with_progress(
            DownloadOptions {
                url,
                out: out.clone(),
                concurrency,
                fragment_size: 4 * 1024 * 1024,
                referer,
            },
            Some(on_progress),
        )
        .await;

        match result {
            Ok(r) => {
                if let Some(ref id) = job_id {
                    let mut job = self.engine.get(id).await.unwrap();
                    job.status = JobStatus::Completed;
                    job.files.final_file = Some(r.path.clone());
                    job.progress = JobProgress {
                        downloaded_bytes: r.bytes,
                        total_bytes: Some(r.bytes),
                        percent: Some(100.0),
                    };
                    let _ = self.engine.upsert(job).await;
                }
                Ok(serde_json::to_value(r)?)
            }
            Err(e) => {
                if let Some(ref id) = job_id {
                    let _ = self
                        .engine
                        .set_status(id, JobStatus::Failed, Some(e.to_string()))
                        .await;
                }
                Err(e)
            }
        }
    }

    async fn media_process(&self, params: Value) -> Result<Value> {
        let url = params
            .get("url")
            .and_then(|v| v.as_str())
            .context("missing url")?
            .to_string();
        let out_dir = params
            .get("outDir")
            .and_then(|v| v.as_str())
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                // sync fallback — use locked default
                PathBuf::from("downloads")
            });
        let out_dir = if params.get("outDir").is_some() {
            out_dir
        } else {
            self.default_out_dir.lock().await.clone()
        };

        let detected = detect_url(&url);
        let job = self
            .engine
            .create(CreateJobInput {
                url: url.clone(),
                output_dir: Some(out_dir.display().to_string()),
                provider: detected.provider.clone(),
                title: params
                    .get("title")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                pack_id: params
                    .get("packId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            })
            .await?;

        emit_event(
            "job.updated",
            serde_json::to_value(&job).unwrap_or(Value::Null),
        );

        let _ = self
            .engine
            .set_status(&job.id, JobStatus::Downloading, None)
            .await;

        let tools = self.tools.lock().await.clone();
        match ytdlp_download(&tools, &url, &out_dir).await {
            Ok(result) => {
                let mut updated = self.engine.get(&job.id).await.unwrap();
                updated.status = JobStatus::Completed;
                updated.provider = Some(result.provider);
                updated.files.final_file = Some(result.path.clone());
                updated.progress.percent = Some(100.0);
                let updated = self.engine.upsert(updated).await?;
                emit_event(
                    "job.updated",
                    serde_json::to_value(&updated).unwrap_or(Value::Null),
                );
                Ok(json!({
                    "ok": true,
                    "job": updated,
                    "outPath": result.path,
                    "via": "ytdlp"
                }))
            }
            Err(e) => {
                // Fallback: if URL looks like a direct media file, use range download
                let ext = url
                    .rsplit('.')
                    .next()
                    .unwrap_or("bin")
                    .split('?')
                    .next()
                    .unwrap_or("bin");
                let dest = out_dir.join(format!("{}.{}", job.id, ext));
                match download::download_file(DownloadOptions {
                    url: url.clone(),
                    out: dest.display().to_string(),
                    concurrency: 4,
                    fragment_size: 4 * 1024 * 1024,
                    referer: None,
                })
                .await
                {
                    Ok(r) => {
                        let mut updated = self.engine.get(&job.id).await.unwrap();
                        updated.status = JobStatus::Completed;
                        updated.files.final_file = Some(r.path.clone());
                        updated.progress = JobProgress {
                            downloaded_bytes: r.bytes,
                            total_bytes: Some(r.bytes),
                            percent: Some(100.0),
                        };
                        let updated = self.engine.upsert(updated).await?;
                        emit_event(
                            "job.updated",
                            serde_json::to_value(&updated).unwrap_or(Value::Null),
                        );
                        Ok(json!({
                            "ok": true,
                            "job": updated,
                            "outPath": r.path,
                            "via": "download",
                            "ytdlpError": e.to_string()
                        }))
                    }
                    Err(e2) => {
                        let failed = self
                            .engine
                            .set_status(
                                &job.id,
                                JobStatus::Failed,
                                Some(format!("{e}; fallback: {e2}")),
                            )
                            .await?;
                        emit_event(
                            "job.updated",
                            serde_json::to_value(&failed).unwrap_or(Value::Null),
                        );
                        Err(anyhow::anyhow!("{e}; fallback: {e2}"))
                    }
                }
            }
        }
    }

    async fn remote_start(&self, params: Value) -> Result<Value> {
        let host = params
            .get("host")
            .and_then(|v| v.as_str())
            .unwrap_or("127.0.0.1");
        let port = params.get("port").and_then(|v| v.as_u64()).unwrap_or(0) as u16;
        let out = self.default_out_dir.lock().await.clone();
        let tools = self.tools.lock().await.clone();
        let server = RemoteServer::new(self.engine.clone(), tools, out);
        let result = server.start(host, port).await?;
        *self.remote.lock().await = Some(server);
        Ok(serde_json::to_value(result)?)
    }

    async fn disk_space(&self, params: Value) -> Result<Value> {
        let dir = params
            .get("dirPath")
            .or_else(|| params.get("path"))
            .and_then(|v| v.as_str())
            .unwrap_or(".");
        // Portable approximation via free space on parent
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStrExt;
            use std::ffi::OsStr;
            #[link(name = "kernel32")]
            extern "system" {
                fn GetDiskFreeSpaceExW(
                    path: *const u16,
                    free_bytes_available: *mut u64,
                    total_bytes: *mut u64,
                    total_free: *mut u64,
                ) -> i32;
            }
            let wide: Vec<u16> = OsStr::new(dir)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            let mut free = 0u64;
            let mut total = 0u64;
            let mut total_free = 0u64;
            let ok = unsafe {
                GetDiskFreeSpaceExW(wide.as_ptr(), &mut free, &mut total, &mut total_free)
            };
            if ok == 0 {
                return Ok(json!({ "free": null, "total": null }));
            }
            return Ok(json!({ "free": free, "total": total }));
        }
        #[cfg(not(windows))]
        {
            let _ = dir;
            Ok(json!({ "free": null, "total": null, "note": "disk space probe limited on this platform" }))
        }
    }

    async fn resources(&self) -> Result<Value> {
        Ok(json!({
            "cpuPercent": null,
            "memUsed": null,
            "memTotal": null,
            "via": "rust"
        }))
    }

    async fn zip_folder(&self, params: Value) -> Result<Value> {
        // Lightweight: report not implemented — Electron can still zip via Node.
        // Reserved for future zip crate.
        let _ = params;
        Err(anyhow::anyhow!(
            "system.zipFolder not yet implemented in Rust; use Electron fallback"
        ))
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let data_dir = std::env::var("PINFORGE_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            dirs_next_data().unwrap_or_else(|| PathBuf::from(".").join("pinforge-server-data"))
        });

    let app = Arc::new(App::new(data_dir).await?);

    // Ready line so Electron knows the server is listening
    emit_event(
        "server.ready",
        json!({
            "pid": std::process::id(),
            "dataDir": app.data_dir.display().to_string(),
        }),
    );

    let stdin = BufReader::new(tokio::io::stdin());
    let mut lines = stdin.lines();

    while let Some(line) = lines.next_line().await? {
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }
        let req: RpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                write_error(None, &format!("invalid request: {e}"));
                continue;
            }
        };
        let id = req.id.clone();
        if req.method == "shutdown" {
            match app.handle(req).await {
                Ok(v) => write_result(id, v),
                Err(e) => write_error(id, &e.to_string()),
            }
            break;
        }
        let app = app.clone();
        tokio::spawn(async move {
            match app.handle(req).await {
                Ok(v) => write_result(id, v),
                Err(e) => write_error(id, &e.to_string()),
            }
        });
    }

    Ok(())
}

fn dirs_next_data() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("LOCALAPPDATA").map(|p| PathBuf::from(p).join("Pinforge").join("server"))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|p| {
            PathBuf::from(p)
                .join("Library")
                .join("Application Support")
                .join("Pinforge")
                .join("server")
        })
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var_os("HOME")
            .map(|p| PathBuf::from(p).join(".local").join("share").join("pinforge").join("server"))
    }
}
