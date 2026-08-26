//! Pinforge CLI — talks to pinforge-server (core service) via NDJSON JSON-RPC.
//!
//! Binaries: `pinforge` and `pinforge-worker` (same CLI).
//! Electron desktop remotes the same server over stdio; this CLI is the
//! headless / installer / scripting entrypoint.

mod server_rpc;

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

use server_rpc::{resolve_server_bin, ServerClient};

#[derive(Parser, Debug)]
#[command(
    name = "pinforge",
    version,
    about = "Pinforge CLI — remote-controls pinforge-server (Rust core service)"
)]
struct Cli {
    /// Data directory for pinforge-server (jobs/settings)
    #[arg(long, global = true)]
    data_dir: Option<PathBuf>,

    /// Override path to pinforge-server binary
    #[arg(long, global = true)]
    server: Option<PathBuf>,

    #[command(subcommand)]
    cmd: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Health check (server + local crates)
    Ping,
    /// List providers from pinforge-server
    Providers,
    /// Detect provider for a URL
    Detect {
        #[arg(long)]
        url: String,
    },
    /// List 134-feature catalog
    Features {
        #[arg(long)]
        summary: bool,
    },
    /// Validate scrape options for a provider
    ScrapeValidate {
        #[arg(long)]
        provider: String,
        #[arg(long, default_value = "{}")]
        options: String,
    },
    /// Scrape DramaBox / ReelShort episode metadata
    DramaScrape {
        #[arg(long)]
        url: String,
        #[arg(long, default_value = "{}")]
        options: String,
    },
    /// Download / process media via pinforge-server media.process
    Process {
        #[arg(long)]
        url: String,
        #[arg(long, short = 'o')]
        out: PathBuf,
    },
    /// Image enhance pipeline (local, no server required)
    Enhance {
        #[arg(long, default_value = "auto")]
        preset: String,
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        output: PathBuf,
    },
    /// Concurrent fragment / Range download (local, no server required)
    Download {
        #[arg(long)]
        url: String,
        #[arg(long)]
        out: PathBuf,
        #[arg(long, default_value_t = 4)]
        concurrency: usize,
        #[arg(long)]
        referer: Option<String>,
    },
}

#[derive(Serialize)]
struct JsonOk<T: Serialize> {
    ok: bool,
    data: T,
}

fn print_json<T: Serialize>(data: T) {
    let payload = JsonOk { ok: true, data };
    println!("{}", serde_json::to_string(&payload).unwrap());
}

fn print_human_providers(list: &[Value]) {
    for p in list {
        let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("?");
        let label = p.get("label").and_then(|v| v.as_str()).unwrap_or(id);
        let live = p.get("live").and_then(|v| v.as_bool()).unwrap_or(false);
        let badge = if live { "live" } else { "stub" };
        println!("  {label:<22} [{badge}] ({id})");
    }
}

async fn server_call(
    server_bin: &Path,
    data_dir: &Path,
    method: &str,
    params: Value,
) -> Result<Value> {
    let mut client = ServerClient::start(server_bin, data_dir).await?;
    let result = client.request(method, params).await;
    let _ = client.shutdown().await;
    result
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let data_dir = cli
        .data_dir
        .or_else(|| std::env::var_os("PINFORGE_DATA_DIR").map(PathBuf::from))
        .unwrap_or_else(|| {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join(".pinforge-data")
        });
    let server_override = cli
        .server
        .or_else(|| std::env::var_os("PINFORGE_SERVER").map(PathBuf::from));

    match cli.cmd {
        Commands::Ping => {
            let local = json!({
                "enhance": enhance::ping(),
                "download": download::ping(),
                "bridge": bridge::surface_version(),
            });
            match resolve_server_bin(server_override.as_deref()) {
                Ok(bin) => match server_call(&bin, &data_dir, "ping", json!({})).await {
                    Ok(server) => print_json(json!({ "local": local, "server": server })),
                    Err(e) => print_json(json!({ "local": local, "serverError": e.to_string() })),
                },
                Err(e) => print_json(json!({ "local": local, "serverError": e.to_string() })),
            }
        }
        Commands::Providers => {
            let bin = resolve_server_bin(server_override.as_deref())?;
            let list = server_call(&bin, &data_dir, "providers.list", json!({})).await?;
            if std::env::var_os("PINFORGE_JSON").is_some() {
                print_json(&list);
            } else if let Some(arr) = list.as_array() {
                print_human_providers(arr);
            } else {
                print_json(&list);
            }
        }
        Commands::Detect { url } => {
            let bin = resolve_server_bin(server_override.as_deref())?;
            let result =
                server_call(&bin, &data_dir, "providers.detect", json!({ "url": url })).await?;
            print_json(result);
        }
        Commands::Features { summary } => {
            let bin = resolve_server_bin(server_override.as_deref())?;
            let method = if summary {
                "features.summary"
            } else {
                "features.list"
            };
            let result = server_call(&bin, &data_dir, method, json!({})).await?;
            print_json(result);
        }
        Commands::ScrapeValidate { provider, options } => {
            let opts: Value = serde_json::from_str(&options).context("options must be JSON")?;
            let bin = resolve_server_bin(server_override.as_deref())?;
            let result = server_call(
                &bin,
                &data_dir,
                "scrape.validate",
                json!({ "provider": provider, "options": opts }),
            )
            .await?;
            print_json(result);
        }
        Commands::DramaScrape { url, options } => {
            let opts: Value = serde_json::from_str(&options).context("options must be JSON")?;
            let bin = resolve_server_bin(server_override.as_deref())?;
            let result = server_call(
                &bin,
                &data_dir,
                "drama.scrape",
                json!({ "url": url, "options": opts }),
            )
            .await?;
            print_json(result);
        }
        Commands::Process { url, out } => {
            let bin = resolve_server_bin(server_override.as_deref())?;
            let out_dir = out.display().to_string();
            let mut client = ServerClient::start(&bin, &data_dir).await?;
            client
                .request("config.setOutDir", json!({ "outDir": out_dir }))
                .await?;
            let result = client
                .request(
                    "media.process",
                    json!({
                        "url": url,
                        "outDir": out_dir,
                    }),
                )
                .await?;
            let _ = client.shutdown().await;
            let ok = result.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
            if !ok {
                let err = result
                    .pointer("/job/error")
                    .and_then(|v| v.as_str())
                    .unwrap_or("media.process failed");
                bail!("{err}");
            }
            print_json(result);
        }
        Commands::Enhance {
            preset,
            input,
            output,
        } => {
            let preset = enhance::validate_preset(&preset)?;
            let meta = enhance::enhance_file(&input, &output, preset)
                .with_context(|| format!("enhance {}", input.display()))?;
            print_json(meta);
        }
        Commands::Download {
            url,
            out,
            concurrency,
            referer,
        } => {
            let result = download::download_file(download::DownloadOptions {
                url,
                out: out.to_string_lossy().into_owned(),
                concurrency,
                fragment_size: 4 * 1024 * 1024,
                referer,
            })
            .await?;
            print_json(result);
        }
    }
    Ok(())
}
