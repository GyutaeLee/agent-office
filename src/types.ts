export interface Usage { input: number | null; cached_input: number | null; output: number | null; reasoning_output: number | null; total: number | null }
export interface Activity { at: string; text: string; kind: string }
export interface Session {
  id: string; title: string | null; project: string | null; parent_id: string | null; origin: string | null; model: string | null;
  status: string; activity: string; tool: string | null; target: string | null; request: string | null;
  last_observed: string; usage: Usage | null; turn_usage: Usage | null; history: Activity[]; warnings: number;
  task_started_at: string | null; task_finished_at: string | null; task_duration_ms: number | null;
}
export interface Snapshot { sessions: Session[]; errors: string[]; root: string; checked_at: string; watching: boolean }
export const statusNames: Record<string, string> = { working: '작업 중', tool: '도구 실행 중', completed: '응답 완료', waiting_input: '답변 대기', waiting_approval: '승인 대기', interrupted: '중단됨', error: '작업 실패', unknown: '상태 미확인' };
export const isWorking = (s: Session) => ['working', 'tool'].includes(s.status);
export const needsInput = (s: Session) => ['waiting_input', 'waiting_approval'].includes(s.status);
export const isVisibleSession = (s: Session) => isWorking(s) || needsInput(s);
export type ActivityZone = 'library' | 'servers' | 'workspace';
export function activityZone(s: Session): ActivityZone {
  const tool = (s.tool ?? '').toLowerCase();
  if (/(^|[_\W])(read|search|grep|glob|find|list_files?)([_\W]|$)/.test(tool)) return 'library';
  if (/(exec_command|command_execution|terminal|shell|bash|run_in_terminal)/.test(tool)) return 'servers';
  return 'workspace';
}
export function activityLabel(s: Session): string {
  if (needsInput(s)) return '고민 중';
  const zone = activityZone(s);
  const name = zone === 'library' ? '자료실' : zone === 'servers' ? '서버실' : '업무 공간';
  return s.status === 'tool' || s.activity.startsWith('도구 실행 기록') ? name : `${name} · 생각 중`;
}
export function statusExplanation(s: Session): { label: string; description: string } {
  switch (s.status) {
    case 'waiting_input': return { label: '답변 대기', description: 'Codex가 다음 작업을 진행하려면 사용자의 답변이 필요해요.' };
    case 'waiting_approval': return { label: '승인 대기', description: 'Codex가 권한이나 작업 승인을 기다리고 있어요.' };
    case 'tool':
      if (activityZone(s) === 'library') return { label: '자료 확인 중', description: '파일이나 자료를 읽고 있어요.' };
      if (activityZone(s) === 'servers') return { label: '명령 실행 중', description: '터미널에서 명령을 실행하고 있어요.' };
      return { label: '도구 사용 중', description: '도구를 사용해 작업하고 있어요.' };
    case 'working': return { label: '응답 준비 중', description: '다음 작업을 정리하거나 응답을 작성하고 있어요.' };
    case 'completed': return { label: '응답 완료', description: 'Codex가 이 작업의 응답을 마쳤어요.' };
    case 'interrupted': return { label: '작업 중단', description: '이 작업은 완료되기 전에 중단됐어요.' };
    case 'error': return { label: '작업 실패', description: '기록에 작업 실패가 표시되어 있어요.' };
    default: return { label: '상태 확인 중', description: '최근 기록만으로는 현재 상태를 확인하기 어려워요.' };
  }
}
export const projectName = (s: string | null) => s?.split('/').filter(Boolean).at(-1) || '프로젝트 미확인';
export const sessionName = (s: Session) => s.title?.trim() || '이름 없는 세션';
export const count = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('ko-KR');
export function taskDuration(s: Session, now = Date.now()): string {
  const terminal = ['completed', 'interrupted', 'error'].includes(s.status);
  let ms = terminal ? s.task_duration_ms : null;
  if (ms == null) {
    const start = Date.parse(s.task_started_at || '');
    const end = terminal ? Date.parse(s.task_finished_at || '') : now;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '—';
    ms = end - start;
  }
  const seconds = Math.floor(ms / 1000), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}시간 ${minutes % 60}분` : minutes > 0 ? `${minutes}분 ${seconds % 60}초` : `${seconds}초`;
}
