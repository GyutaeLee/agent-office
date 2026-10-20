import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { version } from './check-release.mjs';

assert.equal(process.platform, 'darwin', 'Release packaging requires macOS');
const root = resolve(import.meta.dirname, '..');
const app = resolve(root, 'src-tauri/target/release/bundle/macos/Agent Office.app');
assert.ok(existsSync(app), 'Build the app first with npm run desktop:build');
assert.deepEqual(readdirSync(resolve(app, 'Contents/MacOS')), ['agent-office'], 'The app must not include development-only binaries');

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message || result.stderr || command);
  return result.stdout.trim();
}

const bundledVersion = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', resolve(app, 'Contents/Info.plist')]);
assert.equal(bundledVersion, version, 'The app bundle is stale; rebuild before packaging');
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
const architectures = run('/usr/bin/lipo', ['-archs', resolve(app, 'Contents/MacOS/agent-office')]).split(/\s+/).sort().join(',');
const arch = { arm64: 'arm64', x86_64: 'x64', 'arm64,x86_64': 'universal' }[architectures];
assert.ok(arch, `Unsupported app architecture: ${architectures}`);

const output = resolve(root, 'release');
mkdirSync(output, { recursive: true });
const archive = resolve(output, `Agent-Office-${version}-macos-${arch}.zip`);
// Preserve the app's executable bits while excluding local extended attributes.
run('/usr/bin/ditto', ['-c', '-k', '--keepParent', '--norsrc', '--noextattr', '--noqtn', app, archive]);
const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
writeFileSync(`${archive}.sha256`, `${digest}  ${basename(archive)}\n`);
console.log(`Release files: release/${basename(archive)} and its .sha256 checksum.`);
