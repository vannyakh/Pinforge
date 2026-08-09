//! Pinforge worker CLI — OpenCut-style native Rust service for Electron.
//!
//! Commands:
//!   pinforge-worker ping
//!   pinforge-worker enhance --preset auto --input in.jpg --output out.png
//!   pinforge-worker download --url URL --out file.mp4 --concurrency 4

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "pinforge-worker", version, about = "Pinforge Rust worker")]
struct Cli {
    #[command(subcommand)]
    cmd: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    /// Health check for Electron bridge
    Ping,
    /// Image enhance pipeline (auto-levels → denoise → upscale → sharpen)
    Enhance {
        #[arg(long, default_value = "auto")]
        preset: String,
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        output: PathBuf,
    },
    /// Concurrent fragment / Range download
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

#[derive(Serialize)]
struct PingData {
    enhance: &'static str,
    download: &'static str,
    bridge: &'static str,
}

fn print_json<T: Serialize>(data: T) {
    let payload = JsonOk { ok: true, data };
    println!("{}", serde_json::to_string(&payload).unwrap());
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Commands::Ping => {
            print_json(PingData {
                enhance: enhance::ping(),
                download: download::ping(),
                bridge: bridge::surface_version(),
            });
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
