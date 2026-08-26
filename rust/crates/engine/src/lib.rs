//! Job queue + JSON persistence (mirrors packages/engine FileJobStore).

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum JobStatus {
    Queued,
    Analyzing,
    Downloading,
    Paused,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

impl JobStatus {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Cancelled
        )
    }

    pub fn is_unfinished(&self) -> bool {
        !self.is_terminal()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JobProgress {
    pub downloaded_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JobFiles {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temp: Option<String>,
    #[serde(rename = "final", skip_serializing_if = "Option::is_none")]
    pub final_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub job_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJob {
    pub id: String,
    pub url: String,
    pub status: JobStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    pub progress: JobProgress,
    pub files: JobFiles,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_dir: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pack_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateJobInput {
    pub url: String,
    #[serde(default)]
    pub output_dir: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub pack_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListJobsFilter {
    #[serde(default)]
    pub status: Option<Vec<JobStatus>>,
    #[serde(default)]
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoreDump {
    version: u32,
    jobs: HashMap<String, DownloadJob>,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn create_job_id() -> String {
    let t = format!("{:x}", now_ms());
    let r = &uuid::Uuid::new_v4().simple().to_string()[..6];
    format!("job_{t}{r}")
}

fn progress_percent(p: &JobProgress) -> Option<f64> {
    if let Some(pct) = p.percent {
        return Some(pct);
    }
    if let Some(total) = p.total_bytes {
        if total > 0 {
            return Some(((p.downloaded_bytes as f64) / (total as f64) * 10000.0).round() / 100.0);
        }
    }
    None
}

pub struct JobEngine {
    data_dir: PathBuf,
    db_path: PathBuf,
    inner: Mutex<StoreDump>,
}

impl JobEngine {
    pub fn new(data_dir: impl AsRef<Path>) -> Self {
        let data_dir = data_dir.as_ref().to_path_buf();
        let db_path = data_dir.join("jobs.db.json");
        Self {
            data_dir,
            db_path,
            inner: Mutex::new(StoreDump {
                version: 1,
                jobs: HashMap::new(),
            }),
        }
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub async fn init(&self) -> Result<()> {
        tokio::fs::create_dir_all(&self.data_dir).await?;
        match tokio::fs::read_to_string(&self.db_path).await {
            Ok(raw) => {
                if let Ok(parsed) = serde_json::from_str::<StoreDump>(&raw) {
                    if parsed.version == 1 {
                        *self.inner.lock().await = parsed;
                        return Ok(());
                    }
                }
            }
            Err(_) => {}
        }
        self.flush().await?;
        Ok(())
    }

    async fn flush(&self) -> Result<()> {
        let dump = self.inner.lock().await.clone();
        let json = serde_json::to_string_pretty(&dump)?;
        if let Some(parent) = self.db_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let tmp = self.db_path.with_extension("json.tmp");
        tokio::fs::write(&tmp, json).await?;
        tokio::fs::rename(&tmp, &self.db_path).await?;
        Ok(())
    }

    pub async fn create(&self, input: CreateJobInput) -> Result<DownloadJob> {
        let now = now_ms();
        let job = DownloadJob {
            id: create_job_id(),
            url: input.url,
            status: JobStatus::Queued,
            provider: input.provider,
            progress: JobProgress::default(),
            files: JobFiles::default(),
            output_dir: input.output_dir,
            title: input.title,
            error: None,
            pack_id: input.pack_id,
            created_at: now,
            updated_at: now,
        };
        {
            let mut guard = self.inner.lock().await;
            guard.jobs.insert(job.id.clone(), job.clone());
        }
        self.flush().await?;
        Ok(job)
    }

    pub async fn get(&self, id: &str) -> Option<DownloadJob> {
        self.inner.lock().await.jobs.get(id).cloned()
    }

    pub async fn list(&self, filter: ListJobsFilter) -> Vec<DownloadJob> {
        let mut jobs: Vec<_> = self.inner.lock().await.jobs.values().cloned().collect();
        if let Some(statuses) = &filter.status {
            jobs.retain(|j| statuses.contains(&j.status));
        }
        jobs.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        if let Some(limit) = filter.limit {
            jobs.truncate(limit);
        }
        jobs
    }

    pub async fn list_unfinished(&self) -> Vec<DownloadJob> {
        self.list(ListJobsFilter {
            status: None,
            limit: None,
        })
        .await
        .into_iter()
        .filter(|j| j.status.is_unfinished())
        .collect()
    }

    pub async fn upsert(&self, mut job: DownloadJob) -> Result<DownloadJob> {
        if let Some(pct) = progress_percent(&job.progress) {
            job.progress.percent = Some(pct);
        }
        job.updated_at = now_ms();
        {
            let mut guard = self.inner.lock().await;
            guard.jobs.insert(job.id.clone(), job.clone());
        }
        self.flush().await?;
        Ok(job)
    }

    pub async fn set_status(
        &self,
        id: &str,
        status: JobStatus,
        error: Option<String>,
    ) -> Result<DownloadJob> {
        let mut job = self
            .get(id)
            .await
            .with_context(|| format!("job not found: {id}"))?;
        job.status = status;
        job.error = error;
        self.upsert(job).await
    }

    pub async fn update_progress(&self, id: &str, progress: JobProgress) -> Result<DownloadJob> {
        let mut job = self
            .get(id)
            .await
            .with_context(|| format!("job not found: {id}"))?;
        job.progress = progress;
        if job.status == JobStatus::Queued || job.status == JobStatus::Analyzing {
            job.status = JobStatus::Downloading;
        }
        self.upsert(job).await
    }

    pub async fn pause(&self, id: &str) -> Result<DownloadJob> {
        self.set_status(id, JobStatus::Paused, None).await
    }

    pub async fn resume(&self, id: &str) -> Result<DownloadJob> {
        self.set_status(id, JobStatus::Queued, None).await
    }

    pub async fn cancel(&self, id: &str) -> Result<DownloadJob> {
        self.set_status(id, JobStatus::Cancelled, None).await
    }

    /// Mark interrupted non-terminal jobs as paused (crash recovery).
    pub async fn recover(&self) -> Result<Vec<DownloadJob>> {
        let unfinished = self.list_unfinished().await;
        let mut recovered = Vec::new();
        for job in unfinished {
            if matches!(
                job.status,
                JobStatus::Downloading | JobStatus::Analyzing | JobStatus::Processing | JobStatus::Queued
            ) {
                let updated = self
                    .set_status(&job.id, JobStatus::Paused, Some("Recovered after interrupt".into()))
                    .await?;
                recovered.push(updated);
            }
        }
        Ok(recovered)
    }
}

pub type SharedEngine = Arc<JobEngine>;

pub fn ping() -> &'static str {
    "engine-ok"
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmp_dir() -> PathBuf {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("pinforge-engine-test-{n}"))
    }

    #[tokio::test]
    async fn create_list_pause_cancel() {
        let dir = tmp_dir();
        let engine = JobEngine::new(&dir);
        engine.init().await.unwrap();

        let job = engine
            .create(CreateJobInput {
                url: "https://example.com/v".into(),
                output_dir: Some(dir.join("out").display().to_string()),
                provider: Some("youtube".into()),
                title: Some("t".into()),
                pack_id: None,
            })
            .await
            .unwrap();
        assert!(job.id.starts_with("job_"));
        assert_eq!(job.status, JobStatus::Queued);

        let listed = engine.list(ListJobsFilter::default()).await;
        assert_eq!(listed.len(), 1);

        let paused = engine.pause(&job.id).await.unwrap();
        assert_eq!(paused.status, JobStatus::Paused);

        let cancelled = engine.cancel(&job.id).await.unwrap();
        assert_eq!(cancelled.status, JobStatus::Cancelled);

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }

    #[tokio::test]
    async fn recover_marks_active_as_paused() {
        let dir = tmp_dir();
        let engine = JobEngine::new(&dir);
        engine.init().await.unwrap();
        let job = engine
            .create(CreateJobInput {
                url: "https://example.com/a".into(),
                output_dir: None,
                provider: None,
                title: None,
                pack_id: None,
            })
            .await
            .unwrap();
        engine
            .set_status(&job.id, JobStatus::Downloading, None)
            .await
            .unwrap();

        let recovered = engine.recover().await.unwrap();
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].status, JobStatus::Paused);

        let _ = tokio::fs::remove_dir_all(&dir).await;
    }

    #[tokio::test]
    async fn persists_across_reload() {
        let dir = tmp_dir();
        {
            let engine = JobEngine::new(&dir);
            engine.init().await.unwrap();
            engine
                .create(CreateJobInput {
                    url: "https://example.com/persist".into(),
                    output_dir: None,
                    provider: Some("tiktok".into()),
                    title: None,
                    pack_id: None,
                })
                .await
                .unwrap();
        }
        let engine2 = JobEngine::new(&dir);
        engine2.init().await.unwrap();
        let jobs = engine2.list(ListJobsFilter::default()).await;
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].provider.as_deref(), Some("tiktok"));
        let _ = tokio::fs::remove_dir_all(&dir).await;
    }
}
