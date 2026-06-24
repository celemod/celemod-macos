use serde::{Deserialize, Serialize};

// --- Download System ---

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum DownloadStatus {
    Waiting,
    Downloading,
    Finished,
    Failed,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadInfo {
    pub name: String,
    pub url: String,
    pub dest: String,
    pub status: DownloadStatus,
    pub data: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bytes_per_sec: f64,
}

// --- Mod System ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModDependency {
    pub name: String,
    pub version: String,
    pub optional: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalMod {
    pub game_banana_id: i64,
    pub name: String,
    pub deps: Vec<ModDependency>,
    pub version: String,
    pub file: String,
    pub size: u64,
}

// --- Mod Check ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FullModCheckIssue {
    pub file: String,
    pub error: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FullModCheckProgress {
    pub current: usize,
    pub total: usize,
    pub file: String,
    pub done: bool,
    pub issues: Vec<FullModCheckIssue>,
}

// --- Everest install progress ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EverestInstallProgress {
    pub status: String,
    pub progress: f64,
}

// --- Download progress payload ---

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadProgressPayload {
    pub subtasks: Vec<DownloadInfo>,
    pub state: String,
}
