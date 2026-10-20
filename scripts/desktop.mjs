import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const localCargo = resolve(root, '.tools/cargo');
const env = { ...process.env };
if (existsSync(resolve(localCargo, 'bin/cargo'))) {
  env.CARGO_HOME = localCargo;
  env.RUSTUP_HOME = resolve(root, '.tools/rustup');
  env.PATH = `${localCargo}/bin${delimiter}${env.PATH}`;
}
const args = process.argv.slice(2);
const test = args[0] === 'test';
const probe = args[0] === 'probe';
const command = test || probe ? 'cargo' : resolve(root, 'node_modules/.bin/tauri');
const cargoArgs = [test ? 'test' : 'build', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--no-default-features', ...(probe ? ['--features', 'probe', '--bin', 'observer-probe'] : [])];
const result = spawnSync(command, test || probe ? cargoArgs : args, { cwd: root, env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
