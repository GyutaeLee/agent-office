use crate::{model::Snapshot, observer::Observer};
use notify::Watcher;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex}, time::{Duration, Instant}};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

struct Shared(Arc<Mutex<Snapshot>>);
struct UsageShared(Arc<Mutex<UsageCache>>);
#[derive(Clone, Default, Serialize, Deserialize)]
struct UsageWindow { remaining_percent: u8, resets_at: Option<i64> }
#[derive(Clone, Default, Serialize, Deserialize)]
struct AccountUsage { five_hour: Option<UsageWindow>, weekly: Option<UsageWindow>, updated_at: Option<String> }
#[derive(Default)]
struct UsageCache { usage: Option<AccountUsage>, attempted_at: Option<Instant>, error: Option<String> }
#[derive(Deserialize)]
struct CodexAuth { auth_mode: Option<String>, tokens: Option<CodexTokens> }
#[derive(Deserialize)]
struct CodexTokens { access_token: Option<String>, account_id: Option<String> }
#[derive(Default, Serialize, Deserialize)]
struct Geometry { x: i32, y: i32, width: u32, height: u32 }
#[derive(Default, Serialize, Deserialize)]
struct Preferences { windows: HashMap<String, Geometry> }
fn pref_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> { app.path().app_config_dir().ok().map(|p| p.join("windows.json")) }
fn preferences(app: &tauri::AppHandle) -> Preferences { pref_path(app).and_then(|p| fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default() }
fn apply_mini_window_behavior(window: &WebviewWindow, mini: bool) -> Result<(), String> {
    window.set_always_on_top(mini).map_err(|e| e.to_string())?;
    window.set_visible_on_all_workspaces(mini).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        let raw = window.ns_window().map_err(|e| e.to_string())? as usize;
        window.run_on_main_thread(move || unsafe {
            let native = &*(raw as *const objc2_app_kit::NSWindow);
            if let Some(mtm) = objc2::MainThreadMarker::new() {
                let app = objc2_app_kit::NSApplication::sharedApplication(mtm);
                let policy = if mini {
                    objc2_app_kit::NSApplicationActivationPolicy::Accessory
                } else {
                    objc2_app_kit::NSApplicationActivationPolicy::Regular
                };
                let _ = app.setActivationPolicy(policy);
            }
            if mini {
                let behavior = objc2_app_kit::NSWindowCollectionBehavior::CanJoinAllSpaces
                    | objc2_app_kit::NSWindowCollectionBehavior::CanJoinAllApplications
                    | objc2_app_kit::NSWindowCollectionBehavior::FullScreenAuxiliary
                    | objc2_app_kit::NSWindowCollectionBehavior::Stationary;
                native.setCollectionBehavior(behavior);
                native.setStyleMask(native.styleMask() | objc2_app_kit::NSWindowStyleMask::NonactivatingPanel);
                native.setLevel(objc2_app_kit::NSScreenSaverWindowLevel);
                native.orderFrontRegardless();
            } else {
                native.setCollectionBehavior(objc2_app_kit::NSWindowCollectionBehavior::Default);
                native.setStyleMask(native.styleMask() & !objc2_app_kit::NSWindowStyleMask::NonactivatingPanel);
                native.setLevel(objc2_app_kit::NSNormalWindowLevel);
            }
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn save_windows(app: &tauri::AppHandle) {
    let Some(path) = pref_path(app) else { return; };
    let mut prefs = preferences(app);
    for (label, window) in app.webview_windows() {
        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) {
            prefs.windows.insert(label, Geometry { x: pos.x, y: pos.y, width: size.width, height: size.height });
        }
    }
    if let Some(parent) = path.parent() { if fs::create_dir_all(parent).is_err() { return; } }
    if let Ok(bytes) = serde_json::to_vec(&prefs) {
        let tmp = path.with_extension("tmp");
        if fs::write(&tmp, bytes).is_ok() { let _ = fs::rename(tmp, path); }
    }
}
fn make_window(app: &tauri::AppHandle) -> Result<(), String> {
    let label = "main";
    if let Some(w) = app.get_webview_window(label) { w.show().map_err(|e| e.to_string())?; w.unminimize().map_err(|e| e.to_string())?; w.set_focus().map_err(|e| e.to_string())?; return Ok(()); }
    let prefs = preferences(app);
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Agent Office")
        .inner_size(1280.0, 840.0)
        .min_inner_size(900.0, 600.0)
        .on_navigation(|url| matches!(url.scheme(), "tauri" | "asset") || matches!(url.host_str(), Some("tauri.localhost" | "127.0.0.1")));
    if let Some(g) = prefs.windows.get(label) {
        // Saved physical coordinates must be converted for Retina displays.
        let scale = app.primary_monitor().ok().flatten().map(|m| m.scale_factor()).unwrap_or(1.0);
        let saved_width = g.width as f64 / scale;
        let saved_height = g.height as f64 / scale;
        // A mini-view size should not make the app reopen as a tiny window.
        if saved_width >= 900.0 && saved_height >= 600.0 {
            builder = builder.inner_size(saved_width, saved_height);
        }
        if let Ok(monitors) = app.available_monitors() {
            if monitors.iter().any(|m| { let p = m.position(); let s = m.size(); g.x >= p.x && g.y >= p.y && g.x + 100 < p.x + s.width as i32 && g.y + 100 < p.y + s.height as i32 }) {
                builder = builder.position(g.x as f64 / scale, g.y as f64 / scale);
            }
        }
    }
    let _window = builder.build().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn get_snapshot(state: tauri::State<Shared>) -> Result<Snapshot, String> { state.0.lock().map(|s| s.clone()).map_err(|e| e.to_string()) }
fn set_view_mode(window: &WebviewWindow, mini: bool) -> Result<(), String> {
    if window.is_fullscreen().unwrap_or(false) {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
    }
    let (width, height) = if mini { (560.0, 380.0) } else { (1280.0, 840.0) };
    let (min_width, min_height) = if mini { (400.0, 300.0) } else { (900.0, 600.0) };
    window.set_min_size(Some(tauri::LogicalSize::new(min_width, min_height))).map_err(|e| e.to_string())?;
    window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    apply_mini_window_behavior(window, mini)?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn open_mini(window: WebviewWindow) -> Result<(), String> {
    set_view_mode(&window, true)
}
#[tauri::command]
fn open_main(window: WebviewWindow) -> Result<(), String> {
    set_view_mode(&window, false)
}
#[tauri::command]
fn inspect_session(window: WebviewWindow, state: tauri::State<Shared>, id: String) -> Result<(), String> {
    if !state.0.lock().map_err(|e| e.to_string())?.sessions.iter().any(|s| s.id == id) { return Err("세션을 찾을 수 없습니다".into()); }
    set_view_mode(&window, false)?;
    window.emit("inspect-session", id).map_err(|e| e.to_string())?;
    Ok(())
}

fn auth_tokens() -> Result<(String, String), String> {
    let home = std::env::var_os("CODEX_HOME").map(std::path::PathBuf::from).unwrap_or_else(|| {
        std::path::PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".codex")
    });
    let file = fs::File::open(home.join("auth.json")).map_err(|_| "Codex 사용량을 확인할 수 없어요. 로그인을 확인해 주세요.".to_string())?;
    let auth: CodexAuth = serde_json::from_reader(file).map_err(|_| "Codex 로그인 정보를 읽을 수 없어요.".to_string())?;
    if auth.auth_mode.as_deref() != Some("chatgpt") {
        return Err("ChatGPT 계정으로 Codex에 로그인해 주세요.".to_string());
    }
    let tokens = auth.tokens.ok_or_else(|| "Codex 앱 로그인 정보가 필요해요.".to_string())?;
    let access_token = tokens.access_token.filter(|s| !s.is_empty())
        .ok_or_else(|| "Codex 앱 로그인 정보가 필요해요.".to_string())?;
    let account_id = tokens.account_id.filter(|s| !s.is_empty())
        .ok_or_else(|| "Codex 앱 로그인 정보가 필요해요.".to_string())?;
    Ok((access_token, account_id))
}

fn usage_window(value: &serde_json::Value) -> Option<UsageWindow> {
    let used = value.get("used_percent")?.as_f64()?;
    Some(UsageWindow {
        remaining_percent: (100.0 - used).round().clamp(0.0, 100.0) as u8,
        resets_at: value.get("reset_at").and_then(serde_json::Value::as_i64),
    })
}

fn first_object<'a>(value: &'a serde_json::Value, keys: &[&str]) -> Option<&'a serde_json::Value> {
    keys.iter().filter_map(|key| value.get(*key)).find(|entry| entry.is_object())
}

fn parse_account_usage(body: &serde_json::Value) -> Result<AccountUsage, String> {
    let limits = first_object(body, &["rate_limit", "rate_limits"])
        .ok_or_else(|| "계정 사용량 형식을 읽을 수 없어요.".to_string())?;
    let primary = first_object(limits, &["primary_window", "five_hour", "primary"]);
    let secondary = first_object(limits, &["secondary_window", "weekly", "secondary"]);
    let mut usage = AccountUsage::default();
    for (raw, fallback_weekly) in [(primary, false), (secondary, true)] {
        let Some(raw) = raw else { continue; };
        let Some(window) = usage_window(raw) else { continue; };
        let weekly = raw.get("limit_window_seconds").and_then(serde_json::Value::as_u64)
            .map(|seconds| seconds >= 172_800).unwrap_or(fallback_weekly);
        if weekly { usage.weekly = Some(window); } else { usage.five_hour = Some(window); }
    }
    if usage.five_hour.is_none() && usage.weekly.is_none() {
        return Err("계정 사용량 정보가 아직 없어요.".to_string());
    }
    usage.updated_at = Some(chrono::Utc::now().to_rfc3339());
    Ok(usage)
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn fetch_account_usage() -> Result<AccountUsage, String> {
    let (access_token, account_id) = auth_tokens()?;
    use objc2_foundation::{NSMutableURLRequest, NSURLConnection, NSURL, NSURLRequestCachePolicy, NSString};
    let url_text = NSString::from_str("https://chatgpt.com/backend-api/wham/usage");
    let url = NSURL::URLWithString(&url_text).ok_or_else(|| "사용량 서버 주소가 올바르지 않아요.".to_string())?;
    let request = NSMutableURLRequest::requestWithURL_cachePolicy_timeoutInterval(
        &url, NSURLRequestCachePolicy::ReloadIgnoringLocalCacheData, 8.0,
    );
    for (name, value) in [
        ("Authorization", format!("Bearer {access_token}")),
        ("ChatGPT-Account-Id", account_id),
        ("Accept", "application/json".to_string()),
        ("Origin", "https://chatgpt.com".to_string()),
        ("Referer", "https://chatgpt.com/".to_string()),
        ("User-Agent", "Agent Office/0.1".to_string()),
    ] {
        let header_name = NSString::from_str(name);
        let header_value = NSString::from_str(&value);
        request.setValue_forHTTPHeaderField(Some(&header_value), &header_name);
    }
    let method = NSString::from_str("GET");
    request.setHTTPMethod(&method);
    let mut response = None;
    let data = NSURLConnection::sendSynchronousRequest_returningResponse_error(&request, Some(&mut response))
        .map_err(|_| "사용량 서버에 연결할 수 없어요.".to_string())?;
    if let Some(response) = response {
        if let Ok(http) = response.downcast::<objc2_foundation::NSHTTPURLResponse>() {
            let status = http.statusCode();
            if status == 401 || status == 403 { return Err("Codex 로그인이 만료됐어요. Codex 앱을 다시 열어 주세요.".to_string()); }
            if !(200..300).contains(&status) { return Err("계정 사용량을 가져오지 못했어요.".to_string()); }
        }
    }
    let body: serde_json::Value = serde_json::from_slice(&data.to_vec()).map_err(|_| "계정 사용량 응답을 읽을 수 없어요.".to_string())?;
    parse_account_usage(&body)
}

#[cfg(not(target_os = "macos"))]
fn fetch_account_usage() -> Result<AccountUsage, String> {
    Err("계정 사용량 확인은 macOS에서만 지원해요.".to_string())
}

#[cfg(test)]
mod usage_tests {
    use super::parse_account_usage;
    use serde_json::json;

    #[test]
    fn parses_remaining_five_hour_and_weekly_percentages() {
        let usage = parse_account_usage(&json!({
            "rate_limit": {
                "primary_window": { "used_percent": 67, "limit_window_seconds": 18_000, "reset_at": 1_800 },
                "secondary_window": { "used_percent": 40, "limit_window_seconds": 604_800, "reset_at": 2_400 }
            }
        })).unwrap();
        assert_eq!(usage.five_hour.unwrap().remaining_percent, 33);
        assert_eq!(usage.weekly.unwrap().remaining_percent, 60);
    }

    #[test]
    fn recognizes_weekly_only_primary_window() {
        let usage = parse_account_usage(&json!({
            "rate_limit": {
                "primary_window": { "used_percent": 81, "limit_window_seconds": 604_800 },
                "secondary_window": null
            }
        })).unwrap();
        assert!(usage.five_hour.is_none());
        assert_eq!(usage.weekly.unwrap().remaining_percent, 19);
    }
}

#[tauri::command]
async fn get_account_usage(state: tauri::State<'_, UsageShared>, force: bool) -> Result<AccountUsage, String> {
    let cache = Arc::clone(&state.0);
    tauri::async_runtime::spawn_blocking(move || {
        let mut cache = cache.lock().map_err(|_| "사용량 상태를 읽을 수 없어요.".to_string())?;
        if !force && cache.attempted_at.is_some_and(|t| t.elapsed() < Duration::from_secs(60)) {
            if let Some(error) = &cache.error { return Err(error.clone()); }
            return cache.usage.clone().ok_or_else(|| "계정 사용량을 가져오지 못했어요.".to_string());
        }
        cache.attempted_at = Some(Instant::now());
        match fetch_account_usage() {
            Ok(usage) => { cache.usage = Some(usage.clone()); cache.error = None; Ok(usage) }
            Err(error) => { cache.error = Some(error.clone()); Err(error) }
        }
    }).await.map_err(|_| "사용량 조회를 마치지 못했어요.".to_string())?
}

pub fn run() {
    let cancel = Arc::new(AtomicBool::new(false));
    let cancel_worker = Arc::clone(&cancel);
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_snapshot, get_account_usage, open_mini, open_main, inspect_session])
        .setup(move |app| {
            let snapshot = Arc::new(Mutex::new(Snapshot::default()));
            app.manage(Shared(Arc::clone(&snapshot)));
            app.manage(UsageShared(Arc::new(Mutex::new(UsageCache::default()))));
            make_window(app.handle())?;
            let handle = app.handle().clone();
            let root = std::env::var_os("AGENT_OFFICE_SESSIONS_DIR").map(std::path::PathBuf::from).unwrap_or_else(|| {
                std::env::var_os("CODEX_HOME").map(std::path::PathBuf::from).unwrap_or_else(|| std::path::PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".codex")).join("sessions")
            });
            std::thread::spawn(move || {
                let mut observer = Observer::new(root.clone());
                let (tx, rx) = std::sync::mpsc::sync_channel(1);
                let mut watcher = notify::recommended_watcher(move |event: Result<notify::Event, notify::Error>| { let _ = tx.try_send(event); }).ok();
                if let Some(w) = watcher.as_mut() { let _ = w.watch(&root, notify::RecursiveMode::Recursive); }
                while !cancel_worker.load(Ordering::Relaxed) {
                    let next = observer.scan();
                    // Always refresh liveness; only publish changed data to the webviews.
                    let mut guard = snapshot.lock().unwrap();
                    let changed = serde_json::to_string(&(&guard.sessions, &guard.errors, &guard.watching)).ok() != serde_json::to_string(&(&next.sessions, &next.errors, &next.watching)).ok();
                    *guard = next.clone(); drop(guard);
                    if changed { let _ = handle.emit("office-snapshot", next); }
                    let _ = rx.recv_timeout(Duration::from_millis(750));
                    std::thread::sleep(Duration::from_millis(100));
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                save_windows(window.app_handle());
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!()).expect("Agent Office failed to start");
    app.run(move |handle, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. }) { save_windows(handle); }
        if matches!(event, tauri::RunEvent::Exit) { cancel.store(true, Ordering::Relaxed); }
    });
}
