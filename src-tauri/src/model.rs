use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Default, Debug, Deserialize, Serialize, PartialEq)]
pub struct Usage {
    pub input: Option<u64>,
    pub cached_input: Option<u64>,
    pub output: Option<u64>,
    pub reasoning_output: Option<u64>,
    pub total: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Activity { pub at: String, pub text: String, pub kind: String }

#[derive(Clone, Debug, Serialize)]
pub struct Session {
    pub id: String,
    pub title: Option<String>,
    pub project: Option<String>,
    pub parent_id: Option<String>,
    pub origin: Option<String>,
    pub model: Option<String>,
    pub status: String,
    pub activity: String,
    pub tool: Option<String>,
    pub target: Option<String>,
    pub request: Option<String>,
    pub last_observed: String,
    pub task_started_at: Option<String>,
    pub task_finished_at: Option<String>,
    pub task_duration_ms: Option<u64>,
    pub usage: Option<Usage>,
    pub turn_usage: Option<Usage>,
    pub history: Vec<Activity>,
    pub warnings: usize,
    #[serde(skip)] pub calls: HashMap<String, String>,
    #[serde(skip)] pub questions: HashSet<String>,
    #[serde(skip)] pub turn_id: Option<String>,
    #[serde(skip)] pub seen: HashSet<String>,
    #[serde(skip)] pub usage_at: String,
    #[serde(skip)] pub authoritative_usage: bool,
}

impl Session {
    pub fn new(id: String) -> Self {
        Self { id, title: None, project: None, parent_id: None, origin: None, model: None,
            status: "unknown".into(), activity: "상태 확인 중".into(), tool: None, target: None,
            request: None, last_observed: String::new(), task_started_at: None,
            task_finished_at: None, task_duration_ms: None, usage: None, turn_usage: None,
            history: Vec::new(), warnings: 0, calls: HashMap::new(), questions: HashSet::new(),
            turn_id: None, seen: HashSet::new(), usage_at: String::new(), authoritative_usage: false }
    }
    pub fn note(&mut self, at: &str, kind: &str, text: String) {
        if self.history.last().is_some_and(|h| h.at == at && h.text == text) { return; }
        self.activity = text.clone();
        self.history.push(Activity { at: at.into(), kind: kind.into(), text });
        if self.history.len() > 80 { self.history.remove(0); }
    }
}

#[derive(Clone, Default, Debug, Serialize)]
pub struct Snapshot {
    pub sessions: Vec<Session>,
    pub errors: Vec<String>,
    pub root: String,
    pub checked_at: String,
    pub watching: bool,
}
