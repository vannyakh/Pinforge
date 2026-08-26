//! Playwright scrapers remain in Node (`@pinforge/providers` + Electron).
//! This module documents the intentional split — do not call Chromium from Rust yet.

#![allow(dead_code)]

/// Marker: browser extraction is a Node sidecar until replaced.
pub const PLAYWRIGHT_SIDECAR: &str = "node-playwright";
