import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { OfficeCanvas } from './office/OfficeCanvas';
import { demo } from './demo';
import { activityLabel, count, isVisibleSession, projectName, sessionName, statusExplanation, statusNames, taskDuration, type Session, type Snapshot } from './types';

const native = isTauri();
const initialMini = new URLSearchParams(location.search).get('mini') === '1';
const preview = import.meta.env.DEV && !native && new URLSearchParams(location.search).get('demo') === '1';
const empty: Snapshot = { sessions: [], errors: [], root: '', checked_at: '', watching: false };
const readSetting = (key: string, fallback: string) => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};

type UsageWindow = { remaining_percent: number; resets_at: number | null };
type AccountUsage = { five_hour: UsageWindow | null; weekly: UsageWindow | null; updated_at: string | null };

function Icon({ name }: { name: 'office' | 'mini' | 'fullscreen' | 'refresh' }) {
  const paths = {
    office: <path d="M4 20V5h16v15M2 20h20M8 9h2m4 0h2M8 13h2m4 0h2M10 20v-3h4v3" />,
    mini: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M13 13h5v4h-5z" /></>,
    fullscreen: <path d="M3 8V3h5m8 0h5v5M21 16v5h-5M8 21H3v-5" />,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function useAccountUsage() {
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async (force = false) => {
    if (!native) return;
    setLoading(true);
    try {
      const value = await invoke<AccountUsage>('get_account_usage', { force });
      setUsage(value); setError('');
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (!native) return;
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);
  return { usage, error, loading, refresh };
}
function UsageMeter({ usage, error, loading, onRefresh }: {
  usage: AccountUsage | null; error: string; loading: boolean; onRefresh: () => void;
}) {
  const format = (window: UsageWindow) => `${window.remaining_percent}% 남음`;
  const status = error ? '사용량 확인 불가' : loading ? '사용량 확인 중' : '사용량 정보 없음';
  const title = error || (usage?.updated_at ? `마지막 확인 ${new Date(usage.updated_at).toLocaleTimeString('ko-KR')}` : '계정 사용량');
  return <div className="usage-meter" title={title} aria-label="계정 사용량">
    {usage?.five_hour && <span><small>5시간</small><strong>{format(usage.five_hour)}</strong></span>}
    {usage?.weekly && <span><small>일주일</small><strong>{format(usage.weekly)}</strong></span>}
    {usage && error && <span className="usage-unavailable">갱신 실패</span>}
    {!usage && <span className={error ? 'usage-unavailable' : 'usage-placeholder'}>{status}</span>}
    {usage && !usage.five_hour && !usage.weekly && <span className="usage-unavailable">{status}</span>}
    <button className={`usage-refresh ${loading ? 'loading' : ''}`} onClick={onRefresh} disabled={loading} aria-label="사용량 새로고침" title="사용량 새로고침">
      <Icon name="refresh" />
    </button>
  </div>;
}
function useOffice() {
  const [snapshot, setSnapshot] = useState<Snapshot>(preview ? demo : empty);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!native) return;
    let disposed = false; let off: (() => void) | undefined;
    const refresh = async () => {
      try { const s = await invoke<Snapshot>('get_snapshot'); if (!disposed) { setSnapshot(s); setError(''); setConnected(true); } }
      catch (e) { if (!disposed) { setError(String(e)); setConnected(false); } }
    };
    void (async () => {
      try { const unlisten = await listen<Snapshot>('office-snapshot', e => { if (!disposed) { setSnapshot(e.payload); setConnected(true); setError(''); } }); if (disposed) unlisten(); else off = unlisten; }
      catch (e) { if (!disposed) setError(String(e)); }
      await refresh();
    })();
    const timer = window.setInterval(() => { void refresh(); }, 3000);
    return () => { disposed = true; off?.(); window.clearInterval(timer); };
  }, []);
  return { snapshot, error, connected };
}
export function App() {
  const { snapshot, error, connected } = useOffice();
  const accountUsage = useAccountUsage();
  const [mini, setMini] = useState(initialMini);
  const [project, setProject] = useState(() => readSetting('office-project', 'all'));
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [zoomHintVisible, setZoomHintVisible] = useState(false);
  const zoomHintTimer = useRef<number | null>(null);
  const [visible, setVisible] = useState(!document.hidden);
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    const update = async () => {
      if (document.hidden) { setVisible(false); return; }
      if (!native) { setVisible(true); return; }
      try { const w = getCurrentWindow(); setVisible(await w.isVisible() && !await w.isMinimized()); }
      catch { setVisible(false); }
    };
    void update();
    document.addEventListener('visibilitychange', update);
    const timer = window.setInterval(() => { void update(); }, 700);
    return () => { document.removeEventListener('visibilitychange', update); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!native) return;
    let disposed = false; let off: (() => void) | undefined;
    void listen<string>('inspect-session', e => {
      setMini(false); setSelected(e.payload); setProject('all');
    }).then(f => { if (disposed) f(); else off = f; });
    return () => { disposed = true; off?.(); };
  }, []);
  useEffect(() => {
    try { localStorage.setItem('office-project', project); } catch { /* View preferences are optional. */ }
  }, [project]);
  const showZoomHint = useCallback(() => {
    setZoomHintVisible(true);
    if (zoomHintTimer.current !== null) window.clearTimeout(zoomHintTimer.current);
    zoomHintTimer.current = window.setTimeout(() => setZoomHintVisible(false), 1100);
  }, []);
  const zoomBy = useCallback((factor: number) => {
    setZoom(value => Math.round(Math.max(0.6, Math.min(2.4, value * factor)) * 100) / 100);
    showZoomHint();
  }, [showZoomHint]);
  const resetZoom = useCallback(() => { setZoom(1); showZoomHint(); }, [showZoomHint]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (['=', '+'].includes(event.key)) { event.preventDefault(); zoomBy(1.1); }
      else if (['-', '_'].includes(event.key)) { event.preventDefault(); zoomBy(1 / 1.1); }
      else if (event.key === '0') { event.preventDefault(); resetZoom(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (zoomHintTimer.current !== null) window.clearTimeout(zoomHintTimer.current);
    };
  }, [resetZoom, zoomBy]);
  const liveSessions = snapshot.sessions.filter(isVisibleSession);
  const projects = useMemo(() => [...new Set(liveSessions.map(s => s.project).filter((p): p is string => !!p))]
    .sort((a, b) => projectName(a).localeCompare(projectName(b), 'ko') || a.localeCompare(b)), [liveSessions]);
  useEffect(() => {
    if (snapshot.checked_at && project !== 'all' && !projects.includes(project)) setProject('all');
  }, [snapshot.checked_at, project, projects]);

  const projectSessions = liveSessions.filter(s => project === 'all' || s.project === project);
  const sessions = projectSessions;
  const visibleSessions = sessions;
  const seats = [...visibleSessions].sort((a, b) => projectName(a.project).localeCompare(projectName(b.project), 'ko') || sessionName(a).localeCompare(sessionName(b), 'ko') || a.id.localeCompare(b.id));
  const groups = useMemo(() => {
    const grouped = new Map<string, Session[]>();
    for (const s of sessions) {
      const key = s.project ?? '';
      grouped.set(key, [...(grouped.get(key) ?? []), s]);
    }
    return [...grouped].sort(([a], [b]) => projectName(a).localeCompare(projectName(b), 'ko') || a.localeCompare(b));
  }, [sessions]);
  const picked = liveSessions.find(s => s.id === selected);
  const healthy = snapshot.watching && (connected || preview) && !error && snapshot.errors.length === 0;
  const select = (id: string) => {
    if (mini && native) void invoke('inspect_session', { id }).catch(e => setActionError(String(e)));
    else setSelected(id);
  };
  const openMini = async () => {
    try { if (native) { await invoke('open_mini'); setMini(true); } else location.assign('?demo=1&mini=1'); setActionError(''); }
    catch (e) { setActionError(String(e)); }
  };
  const openMain = async () => {
    try { if (native) { await invoke('open_main'); setMini(false); } else location.assign('?demo=1'); setActionError(''); }
    catch (e) { setActionError(String(e)); }
  };
  return <div className={mini ? 'app mini' : 'app'}>
    <header className="topbar">
      <div className="brand"><span className="brand-icon"><Icon name="office" /></span><h1>Agent Office</h1></div>
      <div className="header-actions">
        {!mini && <span className={`connection ${healthy ? 'online' : ''}`}><i />{healthy ? '연결됨' : '연결 확인 중'}</span>}
        {native && <UsageMeter {...accountUsage} onRefresh={() => void accountUsage.refresh(true)} />}
        {mini
          ? <button className="button main-view-button" onClick={() => void openMain()} title="전체 보기"><Icon name="fullscreen" />전체 보기</button>
          : <>
            <button className="button" onClick={() => void openMini()}><Icon name="mini" />미니 보기</button>
          </>}
      </div>
    </header>
    {(preview || !native) && <div className="preview-banner">{preview ? '데모 · 예시 세션입니다.' : '미리 보기 · 실제 작업은 macOS 앱에서 확인하세요.'}</div>}
    {(error || actionError || snapshot.errors.length > 0) && <div className="error-banner" role="alert">{actionError ? '창을 열지 못했어요. 다시 시도해 주세요.' : '작업 정보를 불러오지 못했어요. 연결을 확인해 주세요.'}</div>}
    <div className="workspace">
      {!mini && <aside className="sidebar">
        <label className="project-select"><span>프로젝트</span>
          <select aria-label="프로젝트" value={project} onChange={e => { setProject(e.target.value); setSelected(null); }}>
            <option value="all">모든 프로젝트</option>
            {projects.map(p => <option key={p} value={p}>{projectName(p)}</option>)}
          </select>
        </label>
        <div className="live-heading"><span>진행 중</span><strong>{sessions.length}</strong></div>
        <div className="session-list">
          {sessions.length === 0 && <p className="list-empty">{snapshot.checked_at ? '지금 진행 중인 세션이 없어요.' : '세션을 불러오는 중…'}</p>}
          {groups.map(([name, entries]) => <section className="project-group" key={name || 'unknown'}>
            <button className={`project-group-heading ${project === name ? 'current' : ''}`} onClick={() => { setProject(name || 'all'); setSelected(null); }} aria-label={`${projectName(name)} 프로젝트`} aria-pressed={project === name}>
              <span className="project-group-mark" aria-hidden="true" />
              <strong>{projectName(name)}</strong>
              <span className="project-group-count">{entries.length}</span>
            </button>
            {entries.map(s => <button className={`session-card ${selected === s.id ? 'selected' : ''}`} key={s.id} onClick={() => select(s.id)} aria-label={`${projectName(s.project)} · ${sessionName(s)}`} aria-pressed={selected === s.id}>
              <span className={`status-dot ${s.status}`} role="img" aria-label={statusNames[s.status] || '상태 미확인'} title={statusNames[s.status] || '상태 미확인'} />
              <span className="session-copy"><strong>{sessionName(s)}</strong><small>{activityLabel(s)}</small></span>
            </button>)}
          </section>)}
        </div>
      </aside>}
      <main className="main">
        <div className="room-heading"><h2>{project === 'all' ? '사무실' : projectName(project)}</h2><span>{sessions.length}개 세션</span></div>
        <div className="room">
          <OfficeCanvas sessions={seats} selected={selected} onSelect={select} animate={visible} zoom={zoom} onZoomChange={zoomBy} />
          <div className={`zoom-indicator ${zoomHintVisible ? 'visible' : ''}`} aria-hidden={!zoomHintVisible}>{Math.round(zoom * 100)}%</div>
        </div>
        {mini && <div className="mini-sessions" aria-label="세션 선택">{sessions.map(s =>
          <button key={s.id} onClick={() => select(s.id)} aria-label={`${projectName(s.project)} · ${sessionName(s)}`}>
            <span className={`status-dot ${s.status}`} /><span><small>{projectName(s.project)}</small>{sessionName(s)}</span>
          </button>)}</div>}
      </main>
      {!mini && picked && <aside className="inspector" aria-label="작업 상세">
        <div className="detail-heading"><span>세션 정보</span><button className="close-detail" onClick={() => setSelected(null)} aria-label="상세 닫기">×</button></div>
        <Details session={picked} visible={visible} />
      </aside>}
    </div>
  </div>;
}
function Details({ session: s, visible }: { session: Session; visible: boolean }) {
  const [now, setNow] = useState(Date.now);
  const explanation = statusExplanation(s);
  useEffect(() => {
    setNow(Date.now());
    if (!visible || !s.task_started_at || ['completed', 'interrupted', 'error'].includes(s.status)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [s.id, s.status, s.task_started_at, visible]);
  return <div className="details">
    <p className="detail-project">{projectName(s.project)}</p>
    <h3>{sessionName(s)}</h3>
    <div className={`detail-state ${s.status}`}>
      <strong>{explanation.label}</strong>
      <p>{explanation.description}</p>
    </div>
    <dl className="metrics">
      <div><dt>세션 토큰 <small>기록된 누계</small></dt><dd>{count(s.usage?.total)}</dd></div>
      <div><dt>이번 작업 시간</dt><dd className="duration">{taskDuration(s, now)}</dd></div>
    </dl>
  </div>;
}
