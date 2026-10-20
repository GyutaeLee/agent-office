import { test, expect, type Page } from '@playwright/test';
import { demo } from '../src/demo';
import { statusExplanation, taskDuration, type Snapshot } from '../src/types';
test('only named sessions show by default; details show status, tokens, and time', async ({ page }) => {
  const external: string[] = [], errors: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:1420/')) external.push(request.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?demo=1');
  await expect(page.getByText('데모 · 예시 세션입니다.')).toBeVisible();
  await expect(page.locator('.session-card')).toHaveCount(3);
  await expect(page.getByRole('complementary', { name: '작업 상세' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'agent-office · 사무실 화면 만들기' })).toBeVisible();
  await page.screenshot({ path: 'test-results/office-main.png' });
  await page.getByRole('button', { name: 'agent-office · 사무실 화면 만들기' }).click();
  const details = page.getByRole('complementary', { name: '작업 상세' });
  await expect(details.getByText('14,140')).toBeVisible();
  await expect(details.getByText('이번 작업 시간')).toBeVisible();
  await expect(details.getByText('명령 실행 중')).toBeVisible();
  await expect(details.getByText('터미널에서 명령을 실행하고 있어요.')).toBeVisible();
  await expect(details.locator('.metrics > div')).toHaveCount(2);
  const text = await page.locator('body').innerText();
  for (const raw of ['apply_patch', 'src/components/Office.tsx', demo.sessions[0].request!, demo.sessions[0].id, '캐시 입력', '추론 출력', '최근 활동', 'SESSION DETAILS', 'LOCAL OBSERVER']) expect(text).not.toContain(raw);
  await page.screenshot({ path: 'test-results/office-details.png' });
  await page.getByRole('button', { name: '상세 닫기' }).click();
  await expect(details).toHaveCount(0);
  await page.getByLabel('프로젝트', { exact: true }).selectOption('/projects/notes');
  await expect(page.locator('.session-card')).toHaveCount(1);
  await page.getByLabel('프로젝트', { exact: true }).selectOption('all');
  await expect(page.locator('.session-card')).toHaveCount(3);
  expect(errors).toEqual([]); expect(external).toEqual([]);
});
test('office zoom works with wheel and keyboard shortcuts, then fades away', async ({ page }) => {
  await page.goto('/?demo=1');
  const zoom = page.locator('.zoom-indicator');
  await expect(zoom).toBeHidden();
  await page.keyboard.press('Meta+=');
  await expect(zoom).toHaveText('110%');
  await expect(zoom).toHaveClass(/visible/);
  const box = await page.locator('.office-canvas').boundingBox();
  if (!box) throw new Error('Office canvas is missing');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -200);
  await expect(zoom).toHaveText('134%');
  await page.keyboard.press('Meta+0');
  await expect(zoom).toHaveText('100%');
  await expect(zoom).toBeHidden({ timeout: 2500 });
});
test('session detail explains question and approval waiting states without raw event text', () => {
  const base = demo.sessions[0];
  expect(statusExplanation({ ...base, status: 'waiting_input' })).toEqual({ label: '답변 대기', description: 'Codex가 다음 작업을 진행하려면 사용자의 답변이 필요해요.' });
  expect(statusExplanation({ ...base, status: 'waiting_approval' })).toEqual({ label: '승인 대기', description: 'Codex가 권한이나 작업 승인을 기다리고 있어요.' });
  expect(statusExplanation({ ...base, status: 'unknown' }).label).toBe('상태 확인 중');
});
test('selecting a question-mark session explains that Codex is waiting for an answer', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.getByRole('button', { name: 'notes · 문서 구성 정리' }).click();
  const details = page.getByRole('complementary', { name: '작업 상세' });
  await expect(details.getByText('답변 대기')).toBeVisible();
  await expect(details.getByText('Codex가 다음 작업을 진행하려면 사용자의 답변이 필요해요.')).toBeVisible();
  await expect(details.getByText('이번 작업 시간')).toBeVisible();
});
test('empty browser explicitly has no real connection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('미리 보기 · 실제 작업은 macOS 앱에서 확인하세요.')).toBeVisible();
  await expect(page.locator('.session-card')).toHaveCount(0);
});
test('mini hides overflow sessions and removes scrolling as the window shrinks', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 380 });
  await page.goto('/?demo=1&mini=1');
  await expect(page.locator('.mini-sessions button')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'agent-office · 변경 사항 검토' })).toBeVisible();
  await expect(page.locator('.mini-sessions')).toHaveCSS('overflow-x', 'hidden');
  expect(await page.locator('.mini-sessions').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await page.screenshot({ path: 'test-results/office-mini.png' });
  await page.setViewportSize({ width: 430, height: 380 });
  await expect(page.locator('.mini h1')).toBeHidden();
  await expect(page.locator('.mini-sessions button').nth(2)).toBeHidden();
  await page.setViewportSize({ width: 430, height: 330 });
  await expect(page.locator('.mini-sessions')).toBeHidden();
  await page.setViewportSize({ width: 400, height: 300 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBeTruthy();
});
test('resizing the native window fits both views without document scrollbars', async ({ page }) => {
  await mockDesktop(page, demo);
  for (const [mode, sizes] of [
    ['', [{ width: 900, height: 560 }, { width: 1280, height: 840 }, { width: 900, height: 570 }]],
    ['?mini=1', [{ width: 396, height: 268 }, { width: 560, height: 380 }, { width: 400, height: 270 }]],
  ] as const) {
    await page.goto(`/${mode}`);
    for (const size of sizes) {
      await page.setViewportSize(size);
      await expect.poll(() => page.evaluate(() => {
        const app = document.querySelector('.app')!.getBoundingClientRect();
        const room = document.querySelector('.room')!.getBoundingClientRect();
        return {
          documentFits: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
          appFits: app.width <= innerWidth && app.height <= innerHeight,
          roomFits: room.width > 0 && room.height > 0 && room.right <= innerWidth && room.bottom <= innerHeight,
        };
      }), { message: `${mode || 'main'} at ${size.width} × ${size.height}` }).toEqual({ documentFits: true, appFits: true, roomFits: true });
    }
    await page.screenshot({ path: `test-results/office-resize-${mode ? 'mini' : 'main'}.png` });
  }
});
test('desktop bridge routes mini selection without starting an agent', async ({ page }) => {
  await mockDesktop(page, demo);
  await page.goto('/?mini=1');
  await page.locator('.mini-sessions button').first().click();
  const calls = await page.evaluate(() => (window as any).testCalls);
  expect(calls.some((c: any) => c.cmd === 'inspect_session' && c.args.id === 'demo-office')).toBeTruthy();
  expect(calls.every((c: any) => c.cmd.startsWith('plugin:') || ['get_snapshot', 'get_account_usage', 'inspect_session'].includes(c.cmd))).toBeTruthy();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('many sessions remain readable and mini prioritizes work', async ({ page }) => {
  const many: Snapshot = { ...demo, sessions: Array.from({ length: 40 }, (_, i) => ({ ...demo.sessions[0], id: `session-${i}`, title: `작업 ${i}`, status: 'working' })) };
  await mockDesktop(page, many);
  await page.goto('/');
  await expect(page.locator('.session-card')).toHaveCount(40);
  expect(await page.locator('.room').evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBeTruthy();
  await page.goto('/?mini=1');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /40개 진행 중 세션/);
  await expect(page.locator('.mini-sessions button')).toHaveCount(40);
  expect(await page.locator('.mini-sessions button').evaluateAll(buttons => buttons.filter(button => getComputedStyle(button).display !== 'none').length)).toBe(3);
  expect(await page.locator('.mini-sessions').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
});
test('missing names do not expose prompts or IDs; errors stay human readable', async ({ page }) => {
  const snapshot: Snapshot = { ...demo, sessions: [{ ...demo.sessions[0], title: null }], errors: ['/private/secret/session.jsonl: permission denied'], watching: false };
  await mockDesktop(page, snapshot);
  await page.goto('/');
  await page.getByRole('button', { name: 'agent-office · 이름 없는 세션' }).click();
  await expect(page.getByRole('alert')).toHaveText('작업 정보를 불러오지 못했어요. 연결을 확인해 주세요.');
  const text = await page.locator('body').innerText();
  expect(text).not.toContain('/private/secret');
  expect(text).not.toContain(demo.sessions[0].request!);
  expect(text).not.toContain(demo.sessions[0].id);
});
test('elapsed time advances for current tasks and freezes for finished tasks', () => {
  const current = { ...demo.sessions[0], task_started_at: '2026-10-19T10:00:00Z' };
  expect(taskDuration(current, Date.parse('2026-10-19T10:04:12Z'))).toBe('4분 12초');
  const finished = { ...current, status: 'completed', task_finished_at: '2026-10-19T10:04:12Z', task_duration_ms: 252000 };
  expect(taskDuration(finished, Date.parse('2026-10-20T10:00:00Z'))).toBe('4분 12초');
  expect(taskDuration({ ...finished, task_started_at: null, task_finished_at: null, task_duration_ms: null })).toBe('—');
});
async function mockDesktop(page: Page, fixture: Snapshot) {
  await page.addInitScript(snapshot => {
    const w = window as any;
    w.isTauri = true;
    w.testCalls = [];
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    let callback = 0;
    w.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' } },
      transformCallback: () => ++callback,
      invoke: async (cmd: string, args: any) => {
        w.testCalls.push({ cmd, args });
        if (cmd === 'get_snapshot') return snapshot;
        if (cmd === 'get_account_usage') return { five_hour: null, weekly: null, updated_at: null };
        if (cmd === 'plugin:event|listen') return ++callback;
        if (cmd === 'plugin:window|is_visible') return true;
        if (cmd === 'plugin:window|is_minimized') return false;
        if (cmd === 'inspect_session' || cmd === 'plugin:event|unlisten') return;
        throw new Error(`Unexpected command: ${cmd}`);
      },
    };
  }, fixture);
}
