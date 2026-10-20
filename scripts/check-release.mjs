import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
export const version = json('package.json').version;
assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'Expected a release version such as 0.1.0');

const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8');
const cargoLock = readFileSync(resolve(root, 'src-tauri/Cargo.lock'), 'utf8')
  .split('[[package]]').find(block => /^name = "agent-office"$/m.test(block));
const versions = {
  'package-lock.json': json('package-lock.json').version,
  'package-lock.json root': json('package-lock.json').packages[''].version,
  'src-tauri/tauri.conf.json': json('src-tauri/tauri.conf.json').version,
  'src-tauri/Cargo.toml': cargo.split('[lib]')[0].match(/^version\s*=\s*"([^"]+)"/m)?.[1],
  'src-tauri/Cargo.lock': cargoLock?.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
};
for (const [file, actual] of Object.entries(versions)) {
  assert.equal(actual, version, `${file} must match package.json (${version})`);
}
if (process.env.RELEASE_TAG) {
  assert.equal(process.env.RELEASE_TAG, `v${version}`, 'Release tag must match the checked-out app version');
}
console.log(`PASS: release versions match ${version}${process.env.RELEASE_TAG ? ` (${process.env.RELEASE_TAG})` : ''}.`);
