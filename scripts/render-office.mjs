// Export office artwork to PNGs for the Canvas renderer.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'src/office/assets');
const server = await createServer({ root, server: { host: '127.0.0.1', port: 1427, strictPort: true }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('console', msg => { if (msg.type() === 'error') console.error(msg.text()); });
  page.on('pageerror', error => console.error(error));
  await page.goto('http://127.0.0.1:1427/scripts/art/render.html');
  await page.waitForFunction(() => !!window.exportOffice, { timeout: 30000 });
  const result = await page.evaluate(() => window.exportOffice());
  await mkdir(out, { recursive: true });
  for (const [name, data] of Object.entries(result.images)) {
    await writeFile(resolve(out, name), Buffer.from(data.split(',')[1], 'base64'));
  }
  await writeFile(resolve(out, 'layout.json'), JSON.stringify(result.layout, null, 2) + '\n');
  console.log(`Rendered ${Object.keys(result.images).length} local PNG assets.`);
} finally {
  await browser?.close();
  await server.close();
}
