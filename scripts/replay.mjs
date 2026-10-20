import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const build = spawnSync(process.execPath, ['scripts/desktop.mjs', 'probe'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);
const root = mkdtempSync(join(tmpdir(), 'agent-office-replay-'));
try {
  const file = join(root, 'synthetic.jsonl');
  const marker = join(root, 'SHOULD_NOT_EXIST');
  const at = new Date().toISOString();
  const record = (type, payload) => JSON.stringify({ timestamp: at, type, payload });
  writeFileSync(file, [
    record('session_meta', { id: 'synthetic', cwd: '/example/office' }),
    record('event_msg', { type: 'task_started', turn_id: 'turn-1' }),
    // A recorded command must remain data during replay.
    record('response_item', { type: 'function_call', name: 'exec_command', call_id: 'call-1', arguments: JSON.stringify({ cmd: `touch '${marker}'` }) }),
    record('token_usage_record', { thread_token_usage: { input_tokens: 100, cached_input_tokens: 50, output_tokens: 20, total_tokens: 120 }, turn_token_usage: { total_tokens: 120 } }),
    record('event_msg', { type: 'token_count', info: { total_token_usage: { total_tokens: 120 } } }),
    record('response_item', { type: 'function_call_output', call_id: 'call-1', output: 'synthetic' }),
    record('event_msg', { type: 'task_complete', turn_id: 'turn-1' }),
  ].join('\n') + '\n');
  const hash = () => createHash('sha256').update(readFileSync(file)).digest('hex');
  const before = hash();
  for (let i = 0; i < 2; i++) {
    const result = spawnSync('src-tauri/target/debug/observer-probe', [root], { encoding: 'utf8', timeout: 2000 });
    assert.equal(result.status, 0, result.stderr);
    const snapshot = JSON.parse(result.stdout);
    assert.equal(snapshot.sessions.length, 1);
    assert.equal(snapshot.sessions[0].status, 'completed');
    assert.equal(snapshot.sessions[0].usage.total, 120);
    assert.equal(hash(), before);
    assert.deepEqual(readdirSync(root), ['synthetic.jsonl']);
  }
  console.log('PASS: replay and restart preserve source SHA-256, one session, exact token totals, and inert tool contents.');
} finally { rmSync(root, { recursive: true, force: true }); }
