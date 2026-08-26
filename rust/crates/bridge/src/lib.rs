//! Shared bridge markers (OpenCut-style).
//!
//! Desktop / native builds call crate APIs via the long-lived `pinforge-server`
//! JSON-RPC process (or the one-shot `pinforge-worker` CLI as fallback).
//! A future `wasm` feature can wrap the same functions for the web.

/// Marker trait documenting that a type/function is part of the exported worker surface.
pub trait ExportSurface {}

/// Helper used in docs / tests to assert API stability.
pub fn surface_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
