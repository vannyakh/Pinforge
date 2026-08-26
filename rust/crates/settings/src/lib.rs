//! Service settings JSON store (desktop download/provider prefs).

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use tokio::sync::Mutex;

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct SettingsDocument {
    #[serde(flatten)]
    pub values: Value,
}

pub struct SettingsStore {
    path: PathBuf,
    inner: Mutex<Value>,
}

impl SettingsStore {
    pub fn new(data_dir: impl AsRef<Path>) -> Self {
        let path = data_dir.as_ref().join("server-settings.json");
        Self {
            path,
            inner: Mutex::new(Value::Object(Default::default())),
        }
    }

    pub async fn init(&self) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        match tokio::fs::read_to_string(&self.path).await {
            Ok(raw) => {
                let parsed: Value =
                    serde_json::from_str(&raw).unwrap_or_else(|_| Value::Object(Default::default()));
                *self.inner.lock().await = parsed;
            }
            Err(_) => {
                self.flush().await?;
            }
        }
        Ok(())
    }

    async fn flush(&self) -> Result<()> {
        let value = self.inner.lock().await.clone();
        let json = serde_json::to_string_pretty(&value)?;
        let tmp = self.path.with_extension("json.tmp");
        tokio::fs::write(&tmp, json).await?;
        tokio::fs::rename(&tmp, &self.path).await?;
        Ok(())
    }

    pub async fn get(&self) -> Value {
        self.inner.lock().await.clone()
    }

    pub async fn get_key(&self, key: &str) -> Option<Value> {
        self.inner.lock().await.get(key).cloned()
    }

    pub async fn set(&self, partial: Value) -> Result<Value> {
        let mut guard = self.inner.lock().await;
        merge_json(&mut guard, partial);
        let out = guard.clone();
        drop(guard);
        self.flush().await?;
        Ok(out)
    }

    pub async fn set_key(&self, key: &str, value: Value) -> Result<Value> {
        let mut obj = serde_json::Map::new();
        obj.insert(key.to_string(), value);
        self.set(Value::Object(obj)).await
    }
}

fn merge_json(target: &mut Value, patch: Value) {
    match (target, patch) {
        (Value::Object(t), Value::Object(p)) => {
            for (k, v) in p {
                let entry = t.entry(k).or_insert(Value::Null);
                if entry.is_object() && v.is_object() {
                    merge_json(entry, v);
                } else {
                    *entry = v;
                }
            }
        }
        (t, p) => *t = p,
    }
}

pub fn ping() -> &'static str {
    "settings-ok"
}

pub async fn ensure_dir(path: impl AsRef<Path>) -> Result<()> {
    tokio::fs::create_dir_all(path.as_ref())
        .await
        .with_context(|| format!("mkdir {}", path.as_ref().display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmp_dir() -> PathBuf {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("pinforge-settings-test-{n}"))
    }

    #[tokio::test]
    async fn set_merges_nested_keys() {
        let dir = tmp_dir();
        let store = SettingsStore::new(&dir);
        store.init().await.unwrap();
        store
            .set(json!({ "youtube": { "quality": "1080" }, "preset": "auto" }))
            .await
            .unwrap();
        store
            .set(json!({ "youtube": { "subtitles": "separate" } }))
            .await
            .unwrap();
        let all = store.get().await;
        assert_eq!(all["preset"], "auto");
        assert_eq!(all["youtube"]["quality"], "1080");
        assert_eq!(all["youtube"]["subtitles"], "separate");
        let _ = tokio::fs::remove_dir_all(&dir).await;
    }
}
