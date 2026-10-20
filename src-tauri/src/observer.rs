//! Incremental tailing adapted from AgentRoom's file_watcher.rs (MIT).
use crate::{model::{Session, Snapshot}, parser};
use chrono::Utc;
use std::{collections::HashMap, fs::{self, File}, io::{Read, Seek, SeekFrom}, path::{Path, PathBuf}, time::{Duration, SystemTime}};
#[cfg(unix)]
use std::os::unix::fs::MetadataExt;

const MAX_LINE: usize = 4 * 1024 * 1024;
const READ_BUDGET: u64 = 8 * 1024 * 1024;

pub struct FileState {
    offset: u64,
    pending: Vec<u8>,
    skipping: bool,
    identity: (u64, u64),
    prefix: Vec<u8>,
    modified: Option<SystemTime>,
    pub session: Session,
}
impl FileState {
    pub fn new(path: &Path) -> Self {
        Self { offset: 0, pending: Vec::new(), skipping: false, identity: (0, 0), prefix: Vec::new(), modified: None,
            session: Session::new(path.file_stem().unwrap_or_default().to_string_lossy().into_owned()) }
    }
    pub fn read(&mut self, path: &Path) -> Result<bool, String> {
        let mut file = File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
        let meta = file.metadata().map_err(|e| e.to_string())?;
        #[cfg(unix)] let identity = (meta.dev(), meta.ino());
        #[cfg(not(unix))] let identity = (0, 0);
        let modified = meta.modified().ok();
        if identity == self.identity && meta.len() == self.offset && modified == self.modified { return Ok(false); }
        let mut prefix = vec![0; meta.len().min(256) as usize];
        file.read_exact(&mut prefix).map_err(|e| e.to_string())?;
        let changed_prefix = !self.prefix.is_empty() && (prefix.len() < self.prefix.len() || prefix[..self.prefix.len()] != self.prefix);
        let reset = self.identity != identity || meta.len() < self.offset || changed_prefix;
        if reset { *self = Self::new(path); }
        self.identity = identity;
        self.prefix = prefix;
        self.modified = modified;
        file.seek(SeekFrom::Start(self.offset)).map_err(|e| e.to_string())?;
        let mut left = (meta.len() - self.offset).min(READ_BUDGET);
        let changed = left > 0 || reset;
        let mut buf = [0u8; 32768];
        while left > 0 {
            let size = left.min(buf.len() as u64) as usize;
            let n = file.read(&mut buf[..size]).map_err(|e| e.to_string())?;
            if n == 0 { break; }
            self.offset += n as u64;
            left -= n as u64;
            for &byte in &buf[..n] {
                if byte == b'\n' {
                    if !self.skipping && !self.pending.is_empty() {
                        match serde_json::from_slice(&self.pending) {
                            Ok(v) => parser::apply(&mut self.session, &v),
                            Err(_) => self.session.warnings += 1,
                        }
                    }
                    self.pending.clear(); self.skipping = false;
                } else if !self.skipping {
                    if self.pending.len() >= MAX_LINE {
                        self.pending.clear(); self.skipping = true; self.session.warnings += 1;
                    } else { self.pending.push(byte); }
                }
            }
        }
        Ok(changed)
    }
}

pub struct Observer {
    pub root: PathBuf,
    files: HashMap<PathBuf, FileState>,
    titles: HashMap<String, String>,
    title_signature: Option<(SystemTime, u64)>,
}
impl Observer {
    pub fn new(root: PathBuf) -> Self { Self { root, files: HashMap::new(), titles: HashMap::new(), title_signature: None } }
    fn refresh_titles(&mut self) {
        let Some(parent) = self.root.parent() else { return; };
        let path = parent.join("session_index.jsonl");
        let Ok(meta) = fs::metadata(&path) else { self.titles.clear(); self.title_signature = None; return; };
        let Ok(modified) = meta.modified() else { return; };
        let signature = Some((modified, meta.len()));
        if signature == self.title_signature { return; }
        let Ok(file) = File::open(path) else { return; };
        let mut bytes = Vec::new();
        if file.take(16 * 1024 * 1024).read_to_end(&mut bytes).is_err() { return; }
        let mut titles = HashMap::new();
        // Ignore an incomplete final publication; complete records are append ordered.
        for line in bytes.split_inclusive(|b| *b == b'\n').filter(|line| line.ends_with(b"\n")) {
            let Ok(v) = serde_json::from_slice::<serde_json::Value>(line) else { continue; };
            if let (Some(id), Some(name)) = (v["id"].as_str(), v["thread_name"].as_str()) {
                if !name.trim().is_empty() { titles.insert(id.to_owned(), name.trim().chars().take(160).collect()); }
            }
        }
        self.titles = titles;
        self.title_signature = signature;
    }
    pub fn scan(&mut self) -> Snapshot {
        self.refresh_titles();
        let mut snapshot = Snapshot { root: self.root.display().to_string(), checked_at: Utc::now().to_rfc3339(), ..Snapshot::default() };
        let mut paths = Vec::new();
        collect(&self.root, 0, &mut paths, &mut snapshot.errors);
        self.files.retain(|path, _| paths.contains(path));
        for path in paths {
            let state = self.files.entry(path.clone()).or_insert_with(|| FileState::new(&path));
            if let Err(e) = state.read(&path) { snapshot.errors.push(e); }
            if !state.session.last_observed.is_empty() {
                let mut session = state.session.clone();
                session.title = self.titles.get(&session.id).cloned().or(session.title);
                snapshot.sessions.push(session);
            }
        }
        snapshot.sessions.sort_by(|a, b| b.last_observed.cmp(&a.last_observed).then(a.id.cmp(&b.id)));
        snapshot.sessions.dedup_by(|a, b| a.id == b.id);
        snapshot.errors.truncate(30);
        snapshot.watching = self.root.is_dir() && snapshot.errors.is_empty();
        snapshot
    }
}
fn collect(dir: &Path, depth: usize, files: &mut Vec<PathBuf>, errors: &mut Vec<String>) {
    if depth > 8 { return; }
    let entries = match fs::read_dir(dir) { Ok(v) => v, Err(e) => { errors.push(format!("{}: {e}", dir.display())); return; } };
    for entry in entries {
        let entry = match entry { Ok(v) => v, Err(e) => { errors.push(e.to_string()); continue; } };
        let path = entry.path();
        let typ = match entry.file_type() { Ok(v) => v, Err(e) => { errors.push(e.to_string()); continue; } };
        // Don't follow symlinks into unrelated directories.
        if typ.is_dir() { collect(&path, depth + 1, files, errors); }
        else if typ.is_file() && path.extension().is_some_and(|v| v == "jsonl") {
            match entry.metadata().and_then(|m| m.modified()) {
                Ok(t) if SystemTime::now().duration_since(t).unwrap_or_default() <= Duration::from_secs(86400) => files.push(path),
                Ok(_) => {}, Err(e) => errors.push(e.to_string()),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    fn temp() -> PathBuf {
        let p = std::env::temp_dir().join(format!("agent-office-test-{}-{}", std::process::id(), Utc::now().timestamp_nanos_opt().unwrap()));
        fs::create_dir(&p).unwrap(); p
    }
    const META: &str = "{\"timestamp\":\"2026-10-19T00:00:00Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"s\",\"cwd\":\"/demo\"}}\n";
    #[test]
    fn utf8_partial_records_replay_and_read_only() {
        let dir = temp(); let path = dir.join("session.jsonl");
        let content = format!("{META}{{\"timestamp\":\"2026-10-19T00:00:01Z\",\"type\":\"event_msg\",\"payload\":{{\"type\":\"user_message\",\"message\":\"한글 요청\"}}}}\n");
        let cut = content.find("글").unwrap() + 1;
        fs::write(&path, &content.as_bytes()[..cut]).unwrap();
        let mut observer = Observer::new(dir.clone());
        assert!(observer.scan().sessions[0].request.is_none());
        File::options().append(true).open(&path).unwrap().write_all(&content.as_bytes()[cut..]).unwrap();
        let s = observer.scan(); assert_eq!(s.sessions[0].request.as_deref(), Some("한글 요청"));
        let before = fs::read(&path).unwrap();
        assert_eq!(observer.scan().sessions[0].history.len(), 1);
        assert_eq!(fs::read(&path).unwrap(), before);
        assert_eq!(Observer::new(dir.clone()).scan().sessions[0].history.len(), 1);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn truncation_atomic_replacement_and_malformed_lines() {
        let dir = temp(); let path = dir.join("s.jsonl");
        fs::write(&path, format!("{META}broken\n")).unwrap();
        let mut state = FileState::new(&path); state.read(&path).unwrap();
        assert_eq!(state.session.warnings, 1);
        fs::write(&path, META).unwrap(); state.read(&path).unwrap();
        assert_eq!(state.session.warnings, 0);
        let replacement = dir.join("replacement");
        fs::write(&replacement, META.replace("\"s\"", "\"r\"")).unwrap();
        fs::rename(replacement, &path).unwrap(); state.read(&path).unwrap();
        assert_eq!(state.session.id, "r");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn missing_root_is_visible_and_not_created() {
        let root = temp().join("missing");
        let snapshot = Observer::new(root.clone()).scan();
        assert!(!snapshot.watching); assert!(!snapshot.errors.is_empty()); assert!(!root.exists());
        fs::remove_dir_all(root.parent().unwrap()).unwrap();
    }
    #[test]
    fn titles_follow_the_read_only_index_including_renames() {
        let dir = temp(); let root = dir.join("sessions"); fs::create_dir(&root).unwrap();
        fs::write(root.join("s.jsonl"), META).unwrap();
        let index = dir.join("session_index.jsonl");
        let first = "{\"id\":\"s\",\"thread_name\":\"사무실 화면 정리\"}\n";
        fs::write(&index, first).unwrap();
        let mut observer = Observer::new(root);
        assert_eq!(observer.scan().sessions[0].title.as_deref(), Some("사무실 화면 정리"));
        let second = format!("{first}{{\"id\":\"s\",\"thread_name\":\"이름 변경\"}}\n");
        fs::write(&index, &second).unwrap();
        assert_eq!(observer.scan().sessions[0].title.as_deref(), Some("이름 변경"));
        assert_eq!(fs::read_to_string(index).unwrap(), second);
        fs::remove_dir_all(dir).unwrap();
    }
}
