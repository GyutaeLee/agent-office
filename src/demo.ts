import type { Session, Snapshot } from './types';
const make = (id: string, status: string, project: string, request: string, tool: string | null, parent: string | null = null): Session => ({
  id, title: ({ 'demo-office': '사무실 화면 만들기', 'demo-review': '변경 사항 검토', 'demo-note': '문서 구성 정리', 'demo-done': '테스트 결과 정리' } as Record<string, string>)[id] || null,
  status, project, parent_id: parent, origin: 'synthetic-demo', model: '기록된 모델', activity: tool ? `도구 실행 · ${tool}` : status === 'completed' ? '응답 완료' : '작업 시작',
  tool, target: tool ? 'src/components/Office.tsx' : null, request, last_observed: new Date().toISOString(),
  usage: { input: 12400, cached_input: 8200, output: 1740, reasoning_output: 640, total: 14140 },
  turn_usage: { input: 3600, cached_input: 1800, output: 840, reasoning_output: 320, total: 4440 },
  history: [{ at: new Date().toISOString(), text: '작업 시작', kind: 'start' }, { at: new Date().toISOString(), text: '파일 읽기 · Read', kind: 'tool' }], warnings: 0,
  task_started_at: new Date(Date.now() - 252000).toISOString(),
  task_finished_at: status === 'completed' ? new Date().toISOString() : null,
  task_duration_ms: status === 'completed' ? 252000 : null,
});
export const demo: Snapshot = {
  sessions: [make('demo-office', 'tool', '/projects/agent-office', '에이전트가 일하는 모습을 작은 사무실로 보여줘.', 'exec_command'), make('demo-review', 'tool', '/projects/agent-office', '변경된 기록 해석기를 검토해줘.', 'Read', 'demo-office'), make('demo-note', 'waiting_input', '/projects/notes', '문서의 구성 방식을 선택해줘.', 'request_user_input'), make('demo-done', 'completed', '/projects/notes', '테스트 결과를 정리해줘.', null)],
  errors: [], root: '합성 기록 · 실제 작업과 무관', checked_at: new Date().toISOString(), watching: true,
};
