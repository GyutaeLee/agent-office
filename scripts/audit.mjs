// Check model, process, network, and IPC boundaries.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const files = [];
function walk(dir) { for (const entry of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) walk(path); else files.push(path); } }
walk('src-tauri/src'); walk('src');
const forbidden = [/Command::new\s*\(/, /std::process::Command/, /tokio::process/, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/, /api\.(?:openai|anthropic)\.com/, /\b(?:reqwest|ureq)::/];
const failures = files.flatMap(path => forbidden.filter(pattern => pattern.test(readFileSync(path, 'utf8'))).map(pattern => `${path}: ${pattern}`));
const desktop = readFileSync('src-tauri/src/desktop.rs', 'utf8');
const handlers = desktop.match(/generate_handler!\[([^\]]*)\]/)?.[1].replace(/\s/g, '');
if (handlers !== 'get_snapshot,get_account_usage,open_mini,open_main,inspect_session') failures.push('Unexpected IPC command surface');
const urls = [...desktop.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map(match => match[1]);
if (!urls.length || urls.some(host => host !== 'chatgpt.com')) failures.push('Unexpected network destination');
if ((desktop.match(/NSURLConnection::sendSynchronousRequest_returningResponse_error/g) ?? []).length !== 1) failures.push('Quota lookup must remain a single read-only request path');
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
if (!config.app.security.csp.includes('connect-src ipc: http://ipc.localhost;')) failures.push('Production external connections are not blocked');
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('PASS: no model/process execution; one fixed read-only quota request; five local IPC commands; production webview CSP restricts connections to IPC.');
