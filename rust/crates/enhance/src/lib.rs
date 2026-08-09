//! Image enhance pipeline — auto-levels → denoise → upscale → sharpen → PNG.
//! Mirrors `packages/core` sharp pipeline with CPU-friendly Rust ops.

use anyhow::{anyhow, Context, Result};
use image::{imageops, DynamicImage, GenericImageView, ImageBuffer, ImageFormat, RgbaImage};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::Path;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PresetName {
    Auto,
    Soft,
    Crisp,
    Upscale,
}

#[derive(Debug, Clone, Copy)]
pub struct PresetParams {
    pub denoise: f32,
    pub sharpen: f32,
    pub upscale: f32,
    pub auto_levels: bool,
}

impl PresetName {
    pub fn params(self) -> PresetParams {
        match self {
            Self::Auto => PresetParams {
                denoise: 0.35,
                sharpen: 0.6,
                upscale: 1.0,
                auto_levels: true,
            },
            Self::Soft => PresetParams {
                denoise: 0.5,
                sharpen: 0.25,
                upscale: 1.0,
                auto_levels: true,
            },
            Self::Crisp => PresetParams {
                denoise: 0.2,
                sharpen: 1.1,
                upscale: 1.0,
                auto_levels: true,
            },
            Self::Upscale => PresetParams {
                denoise: 0.4,
                sharpen: 0.8,
                upscale: 2.0,
                auto_levels: true,
            },
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "soft" => Self::Soft,
            "crisp" => Self::Crisp,
            "upscale" => Self::Upscale,
            _ => Self::Auto,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhanceRequest {
    pub preset: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhanceResultMeta {
    pub ext: String,
    pub width: u32,
    pub height: u32,
}

/// Run enhance on an in-memory image buffer → PNG bytes.
pub fn enhance_buffer(input: &[u8], preset: PresetName) -> Result<(Vec<u8>, EnhanceResultMeta)> {
    let img = image::load_from_memory(input).context("decode image")?;
    let out = run_pipeline(img, preset.params())?;
    let (w, h) = out.dimensions();
    let mut png = Cursor::new(Vec::new());
    out.write_to(&mut png, ImageFormat::Png)
        .context("encode png")?;
    Ok((
        png.into_inner(),
        EnhanceResultMeta {
            ext: "png".into(),
            width: w,
            height: h,
        },
    ))
}

/// File-to-file enhance (worker CLI path).
pub fn enhance_file(input: &Path, output: &Path, preset: PresetName) -> Result<EnhanceResultMeta> {
    let bytes = std::fs::read(input).with_context(|| format!("read {}", input.display()))?;
    let (png, meta) = enhance_buffer(&bytes, preset)?;
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(output, png).with_context(|| format!("write {}", output.display()))?;
    Ok(meta)
}

fn run_pipeline(mut img: DynamicImage, p: PresetParams) -> Result<DynamicImage> {
    if p.auto_levels {
        img = DynamicImage::ImageRgba8(auto_levels_rgba(&img.to_rgba8(), 0.7));
    }
    if p.denoise > 0.01 {
        let size = if p.denoise < 0.45 { 3u32 } else { 5u32 };
        img = blur_approx(&img, size);
    }
    if p.upscale > 1.01 {
        let (w, h) = img.dimensions();
        let nw = ((w as f32) * p.upscale).round() as u32;
        let nh = ((h as f32) * p.upscale).round() as u32;
        img = img.resize_exact(nw.max(1), nh.max(1), imageops::FilterType::Lanczos3);
    }
    if p.sharpen > 0.01 {
        img = sharpen_rgba(&img, p.sharpen);
    }
    Ok(img)
}

fn auto_levels_rgba(img: &RgbaImage, strength: f32) -> RgbaImage {
    let mut hist = [0u32; 256];
    for px in img.pixels() {
        let y = ((px[0] as u32 + px[1] as u32 + px[2] as u32) / 3) as usize;
        hist[y] += 1;
    }
    let total = (img.width() * img.height()).max(1);
    let clip = ((total as f32) * 0.01) as u32;
    let (mut lo, mut hi) = (0usize, 255usize);
    let mut acc = 0u32;
    for i in 0..256 {
        acc += hist[i];
        if acc >= clip {
            lo = i;
            break;
        }
    }
    acc = 0;
    for i in (0..256).rev() {
        acc += hist[i];
        if acc >= clip {
            hi = i;
            break;
        }
    }
    if hi <= lo {
        return img.clone();
    }
    let range = (hi - lo) as f32;
    let s = strength.clamp(0.0, 1.0);
    let mut out = img.clone();
    for px in out.pixels_mut() {
        for c in 0..3 {
            let v = px[c] as f32;
            let stretched = ((v - lo as f32) / range * 255.0).clamp(0.0, 255.0);
            px[c] = (v * (1.0 - s) + stretched * s).round() as u8;
        }
    }
    out
}

fn blur_approx(img: &DynamicImage, size: u32) -> DynamicImage {
    // Fast box-like blur via image crate blur (Gaussian sigma mapped from kernel size).
    let sigma = (size as f32) * 0.45;
    DynamicImage::ImageRgba8(imageops::blur(&img.to_rgba8(), sigma))
}

fn sharpen_rgba(img: &DynamicImage, strength: f32) -> DynamicImage {
    let rgba = img.to_rgba8();
    let blurred = imageops::blur(&rgba, 1.2);
    let s = (strength * 0.85).clamp(0.0, 2.5);
    let (w, h) = rgba.dimensions();
    let mut out: RgbaImage = ImageBuffer::new(w, h);
    for (x, y, px) in rgba.enumerate_pixels() {
        let b = blurred.get_pixel(x, y);
        let mut o = *px;
        for c in 0..3 {
            let v = px[c] as f32 + (px[c] as f32 - b[c] as f32) * s;
            o[c] = v.clamp(0.0, 255.0).round() as u8;
        }
        out.put_pixel(x, y, o);
    }
    DynamicImage::ImageRgba8(out)
}

/// Sanity check used by worker health.
pub fn ping() -> &'static str {
    "enhance-ok"
}

pub fn validate_preset(name: &str) -> Result<PresetName> {
    match name.to_ascii_lowercase().as_str() {
        "auto" | "soft" | "crisp" | "upscale" => Ok(PresetName::parse(name)),
        other => Err(anyhow!("unknown preset: {other}")),
    }
}
