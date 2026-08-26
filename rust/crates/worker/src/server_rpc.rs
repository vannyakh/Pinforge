//! Spawn pinforge-server and issue one-shot JSON-RPC requests over stdio.

use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use uuid::Uuid;

pub struct ServerClient {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<tokio::process::ChildStdout>,
}

impl ServerClient {
    pub async fn start(server_bin: &Path, data_dir: &Path) -> Result<Self> {
        tokio::fs::create_dir_all(data_dir).await.ok();
        let mut child = Command::new(server_bin)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("PINFORGE_DATA_DIR", data_dir)
            .kill_on_drop(true)
            .spawn()
            .with_context(|| format!("spawn {}", server_bin.display()))?;

        let stdin = child.stdin.take().context("server stdin")?;
        let stdout = BufReader::new(child.stdout.take().context("server stdout")?);

        Ok(Self {
            child,
            stdin,
            stdout,
        })
    }

    pub async fn request(&mut self, method: &str, params: Value) -> Result<Value> {
        let id = Uuid::new_v4().to_string();
        let line = json!({ "id": id, "method": method, "params": params });
        let mut payload = serde_json::to_string(&line)?;
        payload.push('\n');
        self.stdin
            .write_all(payload.as_bytes())
            .await
            .context("write RPC to pinforge-server")?;
        self.stdin.flush().await?;

        let mut buf = String::new();
        loop {
            buf.clear();
            let n = self
                .stdout
                .read_line(&mut buf)
                .await
                .context("read RPC from pinforge-server")?;
            if n == 0 {
                bail!("pinforge-server closed stdout before reply");
            }
            let trimmed = buf.trim();
            if trimmed.is_empty() {
                continue;
            }
            let msg: Value = serde_json::from_str(trimmed)
                .with_context(|| format!("invalid server line: {trimmed}"))?;
            if msg.get("event").is_some() {
                if let Some(event) = msg.get("event").and_then(|v| v.as_str()) {
                    if event == "download.progress" {
                        if let Some(pct) =
                            msg.pointer("/payload/percent").and_then(|v| v.as_f64())
                        {
                            eprintln!("progress: {pct:.0}%");
                        }
                    }
                }
                continue;
            }
            if msg.get("id").and_then(|v| v.as_str()) != Some(id.as_str()) {
                continue;
            }
            if msg.get("ok").and_then(|v| v.as_bool()) == Some(false) {
                let err = msg
                    .get("error")
                    .cloned()
                    .unwrap_or_else(|| json!("request failed"));
                bail!("RPC {method} failed: {err}");
            }
            return Ok(msg.get("result").cloned().unwrap_or(Value::Null));
        }
    }

    pub async fn shutdown(mut self) -> Result<()> {
        let _ = self.request("shutdown", json!({})).await;
        let _ = self.child.kill().await;
        Ok(())
    }
}

pub fn resolve_server_bin(override_path: Option<&Path>) -> Result<PathBuf> {
    if let Some(p) = override_path {
        if p.exists() {
            return Ok(p.to_path_buf());
        }
        bail!("pinforge-server not found at {}", p.display());
    }
    if let Ok(p) = std::env::var("PINFORGE_SERVER") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Ok(pb);
        }
    }

    let exe_name = if cfg!(windows) {
        "pinforge-server.exe"
    } else {
        "pinforge-server"
    };

    if let Ok(me) = std::env::current_exe() {
        if let Some(dir) = me.parent() {
            let sibling = dir.join(exe_name);
            if sibling.exists() {
                return Ok(sibling);
            }
            let resources = dir.join("resources").join("bin").join(exe_name);
            if resources.exists() {
                return Ok(resources);
            }
        }
    }

    for profile in ["release", "debug"] {
        let cand = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../target")
            .join(profile)
            .join(exe_name);
        if cand.exists() {
            return Ok(cand);
        }
    }

    Err(anyhow!(
        "pinforge-server binary not found. Build with: node scripts/build-rust-server.js"
    ))
}
