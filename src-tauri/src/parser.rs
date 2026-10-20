//! Codex's local transcript is version-dependent. Never execute transcript contents.
use crate::model::{Session, Usage};
use serde_json::Value;

fn string(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_owned)
}
pub fn preview(s: &str, limit: usize) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(limit).collect()
}
fn message_text(v: &Value) -> String {
    if let Some(s) = v.as_str() { return preview(s, 160); }
    if let Some(a) = v.as_array() {
        return a.iter().filter_map(|x| x.get("text").and_then(Value::as_str))
            .map(|s| preview(s, 160)).collect::<Vec<_>>().join(" ").chars().take(160).collect();
    }
    String::new()
}
fn usage(v: &Value) -> Option<Usage> {
    if !v.is_object() { return None; }
    let read = |key: &str| v.get(key).and_then(Value::as_u64);
    let u = Usage { input: read("input_tokens"), cached_input: read("cached_input_tokens"),
        output: read("output_tokens"), reasoning_output: read("reasoning_output_tokens"), total: read("total_tokens") };
    (u != Usage::default()).then_some(u)
}
fn ready(s: &mut Session) {
    s.status = if !s.questions.is_empty() { "waiting_input" } else if !s.calls.is_empty() { "tool" } else { "working" }.into();
}
fn tool_start(s: &mut Session, id: &str, name: &str, args: &Value, at: &str) {
    if id.is_empty() || !s.seen.insert(format!("start:{id}")) { return; }
    let is_question = matches!(name.rsplit('.').next().unwrap_or(name), "request_user_input" | "request_user_input_async" | "AskUserQuestion");
    s.calls.insert(id.into(), name.into());
    if is_question { s.questions.insert(id.into()); }
    s.tool = Some(name.into());
    s.target = ["file_path", "path", "command", "cmd", "query"].iter()
        .find_map(|k| string(args, k)).map(|v| preview(&v, 120));
    let label = if is_question { "답변 요청" } else if name.contains("patch") || name.contains("Edit") || name.contains("Write") { "파일 수정" }
        else if name.contains("search") || name.contains("Search") { "검색" }
        else if name.contains("Read") { "파일 읽기" } else { "도구 실행" };
    ready(s);
    s.note(at, "tool", format!("{label} · {name}"));
}
fn tool_end(s: &mut Session, id: &str, at: &str) {
    if !s.seen.insert(format!("end:{id}")) { return; }
    let name = s.calls.remove(id);
    // Async questions return immediately; only an actual recorded answer resolves them.
    if name.as_deref().is_some_and(|n| !n.ends_with("request_user_input_async")) { s.questions.remove(id); }
    if !matches!(s.status.as_str(), "completed" | "interrupted" | "error") { ready(s); }
    if let Some(name) = name { s.note(at, "tool", format!("도구 응답 · {name}")); }
}
fn user_message(s: &mut Session, content: &Value, id: Option<String>, at: &str) {
    if let Some(id) = id { if !s.seen.insert(format!("user:{id}")) { return; } }
    let text = message_text(content);
    if text.is_empty() || text.starts_with("<environment_context>") || text.starts_with("# AGENTS.md") { return; }
    s.request = Some(text);
    s.note(at, "request", "사용자 요청 수신".into());
}
fn item(s: &mut Session, v: &Value, at: &str) {
    let typ = v["type"].as_str().unwrap_or("");
    let id = string(v, "id").unwrap_or_default();
    match typ {
        "UserMessage" | "userMessage" => user_message(s, &v["content"], string(v, "id"), at),
        "CommandExecution" | "commandExecution" | "McpToolCall" | "mcpToolCall" | "FileChange" | "fileChange" => {
            if !s.seen.insert(format!("item:{id}")) { return; }
            let name = string(v, "tool").or_else(|| string(v, "command")).unwrap_or_else(|| if typ.to_lowercase().contains("file") { "파일 수정" } else { "명령 실행" }.into());
            s.tool = Some(preview(&name, 80));
            s.target = string(v, "cwd").or_else(|| string(&v["changes"][0], "path"));
            let failed = v["status"].as_str() == Some("failed") || v["exit_code"].as_i64().is_some_and(|n| n != 0);
            s.note(at, if failed { "error" } else { "tool" }, format!("{} · {}", if failed { "도구 오류" } else { "도구 실행 기록" }, preview(&name, 100)));
        }
        // Parentage comes from metadata / explicit child records, never proximity or names.
        "SubAgentActivity" => {
            s.note(at, "agent", "하위 에이전트 활동".into());
        }
        "AgentMessage" | "agentMessage" => {
            if v["phase"].as_str() == Some("commentary") {
                s.note(at, "message", "진행 상황 응답".into());
            }
        }
        _ => {}
    }
}

pub fn apply(s: &mut Session, v: &Value) {
    let at = v["timestamp"].as_str().unwrap_or("");
    if !at.is_empty() { s.last_observed = at.into(); }
    let p = &v["payload"];
    match v["type"].as_str().unwrap_or("") {
        "session_meta" => {
            if let Some(id) = string(p, "id").or_else(|| string(p, "session_id")) { s.id = id; }
            s.project = string(p, "cwd");
            s.origin = string(p, "originator");
            s.title = string(p, "thread_name").or_else(|| string(p, "title"))
                .or_else(|| string(&p["source"]["subagent"]["thread_spawn"], "agent_nickname"));
            s.parent_id = string(p, "parent_thread_id").or_else(|| string(&p["source"]["subagent"]["thread_spawn"], "parent_thread_id"));
        }
        "turn_context" => { s.model = string(p, "model").or_else(|| s.model.clone()); }
        "token_usage_record" => {
            if at >= s.usage_at.as_str() {
                if let Some(u) = usage(&p["thread_token_usage"]) { s.usage = Some(u); }
                if let Some(u) = usage(&p["turn_token_usage"]) { s.turn_usage = Some(u); }
                s.authoritative_usage = true;
                s.usage_at = at.into();
            }
        }
        "event_msg" => match p["type"].as_str().unwrap_or("") {
            "task_started" => {
                let turn = string(p, "turn_id");
                if let Some(id) = &turn { if !s.seen.insert(format!("turn-start:{id}")) { return; } }
                if turn != s.turn_id || matches!(s.status.as_str(), "unknown" | "completed" | "interrupted" | "error") {
                    s.turn_id = turn; s.calls.clear(); s.questions.clear(); s.turn_usage = None;
                    s.tool = None; s.target = None; s.status = "working".into();
                    s.task_started_at = string(p, "started_at").or_else(|| (!at.is_empty()).then(|| at.into()));
                    s.task_finished_at = None;
                    s.task_duration_ms = None;
                    s.note(at, "start", "작업 시작".into());
                }
            }
            "task_complete" | "task_completed" | "turn_aborted" | "task_failed" => {
                if p["turn_id"].as_str().is_some_and(|id| s.turn_id.as_deref().is_some_and(|current| current != id)) { return; }
                s.status = match p["type"].as_str().unwrap() { "turn_aborted" => "interrupted", "task_failed" => "error", _ => "completed" }.into();
                s.calls.clear(); s.questions.clear(); s.tool = None;
                s.task_finished_at = (!at.is_empty()).then(|| at.into());
                s.task_duration_ms = p.get("duration_ms").and_then(Value::as_u64);
                s.note(at, "end", match s.status.as_str() { "completed" => "응답 완료", "error" => "작업 실패", _ => "작업 중단" }.into());
            }
            "token_count" if !s.authoritative_usage => {
                if let Some(u) = usage(&p["info"]["total_token_usage"]) { s.usage = Some(u); }
                if let Some(u) = usage(&p["info"]["last_token_usage"]) { s.turn_usage = Some(u); }
            }
            "item_completed" => item(s, &p["item"], at),
            "user_message" => user_message(s, &p["message"], None, at),
            "approval_requested" | "permission_request" => { s.status = "waiting_approval".into(); s.note(at, "wait", "승인 요청 기록".into()); }
            "approval_resolved" => { ready(s); }
            _ => {}
        },
        "response_item" => match p["type"].as_str().unwrap_or("") {
            "function_call" | "custom_tool_call" => {
                let args = p.get("arguments").and_then(Value::as_str).and_then(|a| serde_json::from_str(a).ok()).unwrap_or_else(|| p.get("arguments").cloned().unwrap_or(Value::Null));
                tool_start(s, p["call_id"].as_str().unwrap_or(""), p["name"].as_str().unwrap_or("unknown"), &args, at);
            }
            "function_call_output" | "custom_tool_call_output" => tool_end(s, p["call_id"].as_str().unwrap_or(""), at),
            "message" if p["role"].as_str() == Some("user") => user_message(s, &p["content"], string(p, "id"), at),
            _ => {}
        },
        "retained_context" if p["type"].as_str() == Some("verified_answer") => {
            if let Some(id) = p["call_id"].as_str() { s.questions.remove(id); }
            if s.status == "waiting_input" { ready(s); }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn event(s: &mut Session, kind: &str, payload: Value) { apply(s, &json!({"timestamp":"2026-10-19T10:00:00Z","type":kind,"payload":payload})); }
    #[test]
    fn authoritative_usage_replaces_snapshots_without_double_counting() {
        let mut s = Session::new("s".into());
        for _ in 0..2 { event(&mut s, "token_usage_record", json!({"thread_token_usage":{"input_tokens":100,"cached_input_tokens":40,"output_tokens":20,"total_tokens":120},"turn_token_usage":{"total_tokens":30}})); }
        event(&mut s, "event_msg", json!({"type":"token_count","info":{"total_token_usage":{"total_tokens":999}}}));
        assert_eq!(s.usage.as_ref().unwrap().total, Some(120));
        assert_eq!(s.turn_usage.unwrap().total, Some(30));
    }
    #[test]
    fn explicit_lifecycle_and_questions_only() {
        let mut s = Session::new("s".into());
        event(&mut s, "event_msg", json!({"type":"task_started","turn_id":"t"}));
        event(&mut s, "response_item", json!({"type":"function_call","name":"request_user_input_async","call_id":"q"}));
        event(&mut s, "response_item", json!({"type":"function_call_output","call_id":"q","output":"shown"}));
        assert_eq!(s.status, "waiting_input");
        event(&mut s, "retained_context", json!({"type":"verified_answer","call_id":"q"}));
        assert_eq!(s.status, "working");
        event(&mut s, "future_event", json!({}));
        assert_eq!(s.status, "working");
        event(&mut s, "event_msg", json!({"type":"task_complete","turn_id":"t"}));
        assert_eq!(s.status, "completed");
    }
    #[test]
    fn tool_dedup_and_errors_do_not_finish_the_task() {
        let mut s = Session::new("s".into());
        for _ in 0..2 { event(&mut s, "response_item", json!({"type":"function_call","name":"Read","call_id":"x"})); }
        assert_eq!(s.history.len(), 1);
        event(&mut s, "event_msg", json!({"type":"item_completed","item":{"type":"CommandExecution","id":"c","exit_code":1}}));
        assert_ne!(s.status, "error");
        event(&mut s, "response_item", json!({"type":"function_call_output","call_id":"x"}));
        assert_eq!(s.status, "working");
    }
    #[test]
    fn parentage_and_private_reasoning() {
        let mut s = Session::new("s".into());
        event(&mut s, "session_meta", json!({"id":"child","cwd":"/projects/demo","source":{"subagent":{"thread_spawn":{"parent_thread_id":"parent"}}}}));
        event(&mut s, "response_item", json!({"type":"reasoning","summary":"SECRET"}));
        assert_eq!(s.parent_id.as_deref(), Some("parent"));
        assert!(!serde_json::to_string(&s).unwrap().contains("SECRET"));
    }
    #[test]
    fn duplicate_start_cannot_revive_completed_turn() {
        let mut s = Session::new("s".into());
        let start = json!({"type":"task_started","turn_id":"t"});
        event(&mut s, "event_msg", start.clone());
        event(&mut s, "event_msg", json!({"type":"task_complete","turn_id":"t"}));
        event(&mut s, "event_msg", start);
        assert_eq!(s.status, "completed");
        event(&mut s, "event_msg", json!({"type":"task_started","turn_id":"new"}));
        event(&mut s, "event_msg", json!({"type":"task_complete","turn_id":"t"}));
        assert_eq!(s.status, "working");
    }
    #[test]
    fn zero_and_missing_usage_are_different() {
        let mut s = Session::new("s".into());
        assert!(s.usage.is_none());
        event(&mut s, "token_usage_record", json!({"thread_token_usage":{"total_tokens":0}}));
        assert_eq!(s.usage.unwrap().total, Some(0));
    }
    #[test]
    fn timing_tracks_the_latest_task_without_idle_time() {
        let mut s = Session::new("s".into());
        apply(&mut s, &json!({"timestamp":"2026-10-19T10:00:00Z","type":"event_msg","payload":{"type":"task_started","turn_id":"one"}}));
        apply(&mut s, &json!({"timestamp":"2026-10-19T10:02:00Z","type":"event_msg","payload":{"type":"task_complete","turn_id":"one","duration_ms":120000}}));
        assert_eq!(s.task_duration_ms, Some(120000));
        assert_eq!(s.task_finished_at.as_deref(), Some("2026-10-19T10:02:00Z"));
        apply(&mut s, &json!({"timestamp":"2026-10-19T12:00:00Z","type":"event_msg","payload":{"type":"task_started","turn_id":"two"}}));
        assert_eq!(s.task_started_at.as_deref(), Some("2026-10-19T12:00:00Z"));
        assert_eq!(s.task_finished_at, None);
        assert_eq!(s.task_duration_ms, None);
    }
}
