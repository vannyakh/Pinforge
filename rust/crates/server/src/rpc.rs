//! JSON-RPC stdio helpers (thread-safe stdout writes).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, Write};
use std::sync::Mutex;

static STDOUT: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Deserialize)]
pub struct RpcRequest {
    pub id: Option<Value>,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
}

#[derive(Debug, Serialize)]
struct RpcResponse {
    id: Option<Value>,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct RpcEvent {
    event: String,
    payload: Value,
}

pub fn write_result(id: Option<Value>, result: Value) {
    write_line(&RpcResponse {
        id,
        ok: true,
        result: Some(result),
        error: None,
    });
}

pub fn write_error(id: Option<Value>, error: &str) {
    write_line(&RpcResponse {
        id,
        ok: false,
        result: None,
        error: Some(error.to_string()),
    });
}

pub fn emit_event(event: &str, payload: Value) {
    write_line(&RpcEvent {
        event: event.to_string(),
        payload,
    });
}

fn write_line<T: Serialize>(msg: &T) {
    let _lock = STDOUT.lock().unwrap_or_else(|e| e.into_inner());
    let mut out = io::stdout().lock();
    let _ = serde_json::to_writer(&mut out, msg);
    let _ = out.write_all(b"\n");
    let _ = out.flush();
}

#[allow(dead_code)]
pub fn read_requests() {}
