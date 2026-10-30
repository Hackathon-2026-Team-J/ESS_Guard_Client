import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, ChevronRight, CircleHelp, Database, FlaskConical, LayoutDashboard, Network, PanelLeftClose, PanelLeftOpen, Play, Radio, RefreshCw, SearchCheck, Settings2, ShieldCheck, Square, Trash2, TriangleAlert, X } from 'lucide-react';
import type { Filters, RuleId } from './model.ts';
import { defaultFilters, eventStats, groupEvents, rules, selectEvents } from './model.ts';
import { createServerClient, EVENT_LIMIT } from './api.ts';
import type { ReplayAction, ServerStats } from './api.ts';
import { Badge, CommandDetail, Empty, EventDetail, EventTable, FiltersBar, Pager, Panel } from './components.tsx';
import { FullPath } from './Planned.tsx';
import { PhysicalLive } from './PhysicalLive.tsx';

const source = createServerClient();
const emptyFilters: Filters = {...defaultFilters, date: ''};
const navigation = [
  { id: 'overview', label: '통합 감시', icon: LayoutDashboard },
  { id: 'detections', label: '탐지 이력', icon: SearchCheck },
  { id: 'path', label: '전 구간 감시', icon: Network, planned: true },
  { id: 'physical', label: '물리 검증', icon: Activity },
  { id: 'rules', label: '검증 규칙', icon: Settings2 },
  { id: 'replay', label: '시연 관리', icon: FlaskConical },
];
function routeFromHash() { const id = window.location.hash.slice(1); return navigation.some(n => n.id === id) ? id : 'overview'; }
function count(value: number | undefined) { return value === undefined ? '—' : value.toLocaleString(); }
function time(value: string | null) { return value ? new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false}).format(new Date(value)) : '조회 대기'; }
function LiveStats({stats}: {stats: ServerStats | null}) {
  return <div className="stats-grid">
    <div className="stat"><span>처리 명령</span><div><strong>{count(stats?.processedCount)}</strong><small>/ {count(stats?.totalCount)}</small></div><p><span className="mini-dot blue" />서버 전체 명령 처리 현황</p></div>
    <div className="stat"><span>처리 대기</span><div><strong>{count(stats ? Math.max(0, stats.totalCount - stats.processedCount) : undefined)}</strong><small>건</small></div><p>전체 명령 − 처리 명령</p></div>
    <div className="stat"><span>탐지 명령</span><div><strong className="amber-text">—</strong><small>건</small></div><p>전체 중복 제거 통계는 서버 미제공</p></div>
    <div className="stat"><span>탐지 이벤트</span><div><strong className="red-text">{count(stats?.detectionCount)}</strong><small>건</small></div><p>서버 전체 집계 · 한 명령에 여러 이벤트 가능</p></div>
  </div>;
}
export default function App() {
  const [server, setServer] = useState(source.getState);
  const {snapshot, stats, loading:busy, error} = server;
  const [route, setRoute] = useState(routeFromHash);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selected, setSelected] = useState<number>();
  const [page, setPage] = useState(0);
  const [group, setGroup] = useState(false);
  const [rule, setRule] = useState<RuleId>('R2');
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [controlError, setControlError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const commandDialog = useRef<HTMLDialogElement>(null);
  const [commandId, setCommandId] = useState<number>();
  const activeCommand = snapshot.commands.find(command => command.id === commandId);
  const resetting = server.actionPending === 'reset';
  const controlDisabled = server.actionPending !== null || stats === null;
  const refresh = () => { void source.refresh(); };

  useEffect(() => {
    const unsubscribe = source.subscribe(setServer);
    const disconnect = source.connect();
    setServer(source.getState());
    const onHash = () => { setRoute(routeFromHash()); setPage(0); };
    window.addEventListener('hashchange', onHash);
    return () => { unsubscribe(); disconnect(); window.removeEventListener('hashchange', onHash); };
  }, []);
  useEffect(() => { window.scrollTo({top:0, behavior:'instant'}); }, [route]);
  useEffect(() => { document.title = 'ESS Guard · ' + navigation.find(n => n.id === route)?.label; }, [route]);
  useEffect(() => { if (resetOpen) dialog.current?.showModal(); else dialog.current?.close(); }, [resetOpen]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (activeCommand) commandDialog.current?.showModal(); else commandDialog.current?.close(); }, [activeCommand?.id]);
  useEffect(() => { setSelected(undefined); setCommandId(undefined); setPage(0); }, [server.resetVersion]);

  function revealEventDetail() {
    requestAnimationFrame(() => { if (window.innerWidth <= 1250) document.getElementById('event-detail')?.scrollIntoView({block:'start', behavior:'instant'}); });
  }
  function selectEvent(id: number) { setSelected(id); revealEventDetail(); }
  function navigate(next: string) { window.location.hash = next; setRoute(next); setPage(0); }
  function openEvent(id: number) { setSelected(id); setFilters(emptyFilters); navigate('detections'); revealEventDetail(); }
  function updateFilters(next: Filters) { setFilters(next); setPage(0); setSelected(undefined); }
  async function runControl(action: ReplayAction) {
    setControlError('');
    try {
      const result = await source.control(action);
      if (action === 'reset') setResetOpen(false);
      setNotice(action === 'reset' ? '서버 탐지 결과를 초기화했습니다. 재생은 정지 상태입니다.' : '서버 ' + (action === 'start' ? '시작' : '정지') + ' 요청 완료 · 응답 시점 ' + (result.running ? '재생 중' : '정지'));
    } catch (cause) { setControlError(cause instanceof Error ? cause.message : '재생 제어에 실패했습니다.'); }
  }

  const current = navigation.find(n => n.id === route)!;
  const events = selectEvents(snapshot, route === 'detections' ? filters : emptyFilters);
  const allEvents = selectEvents(snapshot, emptyFilters);
  const eventSummary = eventStats(events);
  const shownEvent = events.find(e => e.id === selected) ?? events[0];
  const actualPage = Math.min(page, Math.max(0, Math.ceil(events.length / 7) - 1));
  const sourceGroups = groupEvents(events);
  const groupPage = Math.min(page, Math.max(0, Math.ceil(sourceGroups.length / 7) - 1));
  const devices = [...new Set(snapshot.events.map(event => event.deviceId).filter((id): id is string => Boolean(id)))].sort();
  const selectedRule = rules.find(r => r.id === rule)!;
  const progress = stats?.processedCount;
  const total = stats?.totalCount;
  const replayPercent = stats ? (stats.totalCount ? stats.processedCount / stats.totalCount * 100 : 0) : null;
  const streamLabel = {connecting:'SSE 연결·알림 대기', connected:'SSE 연결됨', reconnecting:'SSE 재연결 중', unavailable:'SSE 연결 불가'}[server.stream];
  const httpLabel = error ? '최근 조회 실패' : server.lastUpdated ? '서버 API 연결됨' : '서버 연결 확인 중';
  const recentCaption = '최근 최대 ' + EVENT_LIMIT + '건 중 ' + snapshot.events.length + '건 수신 · 목록 내 필터·페이지';

  return <div className={'app ' + (collapsed ? 'sidebar-collapsed' : '')}>
    <a href="#main" className="skip-link" onClick={e => {e.preventDefault(); document.getElementById('main')?.focus();}}>본문으로 이동</a>
    <aside className="sidebar">
      <a className="brand" href="#overview"><span className="brand-icon"><ShieldCheck size={26} strokeWidth={1.8} /></span><span>ESS <b>Guard</b><small>SECURITY OPERATIONS</small></span></a>
      <div className="workspace-label"><span className="mini-dot blue" />ESS 보안 모니터링</div>
      <p className="nav-caption">WORKSPACE</p>
      <nav aria-label="주 메뉴">{navigation.map(item => <a key={item.id} href={'#'+item.id} className={'nav-item '+(route === item.id ? 'active' : '')} aria-current={route === item.id ? 'page' : undefined} title={item.label}><item.icon size={19} strokeWidth={1.7} /><span>{item.label}</span>{item.planned && <small>기획</small>}{route === item.id && <i />}</a>)}</nav>
      <div className="asset-tree"><p className="nav-caption">분석 대상</p><button onClick={() => {setFilters(emptyFilters); navigate('detections');}}><Database size={17} /><span>전체 설비<small>수신 탐지 이벤트 조회</small></span><ChevronRight size={14} /></button></div>
      <div className="sidebar-bottom"><div className="sandbox-note"><Radio size={18} /><div><b>서버 데이터</b><p>3초 간격 자동 조회</p></div></div><span className="lock-note">재생 제어는 서버에 반영됩니다</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div><button className="icon-button sidebar-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}>{collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button><span className="breadcrumb">워크스페이스 <ChevronRight size={13} /><b>{current.label}</b></span></div><div className="topbar-right"><span className="source-label"><span className={'mini-dot '+(server.lastUpdated && !error ? 'blue' : 'amber')} />{httpLabel}</span><span className="environment">SERVER</span><button className="icon-button" aria-label="연결 안내" onClick={() => setNotice('통계와 최근 탐지는 서버 데이터입니다. 전 구간 감시는 기획 예시이고 물리 검증은 R4 탐지 알림까지 연결되어 있으며, 시작·정지·초기화는 실제 서버 재생을 제어합니다.')}><CircleHelp size={19} /></button></div></header>
      <main id="main" tabIndex={-1}>
        <div className="page-heading"><div><span className="eyebrow">{current.planned ? 'PLANNED CAPABILITIES' : 'ESS GUARD / COMMAND MONITORING'}</span><h1>{current.label}{current.planned && <span className="planned-pill">기획 미리보기</span>}</h1><p>{({overview:'서버의 명령 처리 현황과 탐지 결과를 한눈에 확인합니다.', detections:'수신한 탐지 근거와 명령 정보를 함께 추적합니다.', path:'관측 구간의 데이터 차이와 연관 근거를 비교합니다.', physical:'서버의 SOC·출력 불일치 탐지와 제공되는 근거를 확인합니다.', rules:'현재 서버의 운전 계획·측정값 기반 규칙을 확인합니다.', replay:'서버의 명령 재생과 탐지 결과 초기화를 관리합니다.'} as Record<string,string>)[route]}</p></div><div className="page-stamp"><span>마지막 통계 조회</span><b>{time(server.lastUpdated)} <small>KST</small></b></div></div>
        {error && <div className="error-banner" role="alert"><TriangleAlert size={18} /><span>{error}{server.lastUpdated ? ' 마지막 정상 조회 데이터를 표시합니다.' : ' 아직 서버 데이터를 받지 못했습니다.'}</span><button onClick={refresh}>다시 시도</button></div>}
        {!server.lastUpdated && busy && <div className="info-banner" role="status"><RefreshCw size={16} className="spin" />서버 데이터를 조회하고 있습니다.</div>}
        {route === 'overview' && <>
          <div className="live-toolbar"><span>전체 설비 · 서버 전체 집계 · {streamLabel}</span><button className="button" disabled={busy} onClick={refresh}><RefreshCw size={15} />새로고침</button></div>
          <LiveStats stats={stats} />
          <div className="overview-grid"><Panel title="명령 처리 현황" subtitle="명령 기준 집계 · 측정값 진행률은 미제공" action={<button className="text-button" onClick={() => navigate('replay')}>시연 관리 <ArrowRight size={14} /></button>}>
            <div className="detail-body"><div className="progress-numbers"><b>{count(progress)}</b><span>/ {count(total)}건</span><strong>{replayPercent === null ? '—' : replayPercent.toFixed(1)+'%'}</strong></div><progress value={progress ?? 0} max={total || 1} aria-label="명령 처리 진행률" />
            <div className="api-limitation"><Database size={21} /><div><b>전체 명령 목록은 아직 조회할 수 없습니다.</b><p>현재 API는 집계와 탐지된 명령의 일부 정보만 제공합니다. 이벤트의 명령 ID를 누르면 제공된 원본 정보를 확인할 수 있습니다.</p></div></div></div>
          </Panel><Panel title="위험도별 탐지 이벤트" subtitle="서버 전체 집계 · 날짜 필터 없음"><div className="severity-chart">{(['CRITICAL','HIGH','MEDIUM'] as const).map(severity => <div className="bar-item" key={severity}><div><Badge severity={severity} /><b>{count(stats?.severityCounts[severity])}<small>건</small></b></div><div className="bar-track"><span className={'bar-fill '+severity.toLowerCase()} style={{width:(stats ? stats.severityCounts[severity] / Math.max(1,...Object.values(stats.severityCounts)) * 100 : 0)+'%'}} /></div></div>)}</div><div className="chart-total"><span>전체 탐지 이벤트</span><b>{count(stats?.detectionCount)}<small>건</small></b></div><p className="panel-note">명령과 측정값에서 발생한 탐지 이벤트를 합산합니다.</p></Panel></div>
          <div className="planned-preview"><div className="planned-preview-icon"><Network size={25} /></div><div><span className="planned-pill">기획</span><h3>데이터가 지나가는 모든 구간을 한눈에</h3><p>배터리 → BMS → ESS EMS → 계통 EMS → 타 관제센터</p></div><button className="button" onClick={() => navigate('path')}>전 구간 설계 보기 <ArrowRight size={15} /></button><button className="text-button" onClick={() => navigate('physical')}>물리 검증 <ArrowRight size={14} /></button></div>
          <Panel title="최근 탐지 이벤트" subtitle={server.lastUpdated ? recentCaption+' · KST' : '서버 데이터 조회 대기'} action={<button className="text-button" onClick={() => navigate('detections')}>탐지 이력 보기 <ArrowRight size={14} /></button>}><EventTable events={events.slice(0,5)} onSelect={openEvent} onCommand={setCommandId} /></Panel>
        </>}
        {route === 'detections' && <>
          <div className="info-banner"><Database size={18} /><span>{recentCaption}. 아래 건수는 필터 결과이며 서버 전체 건수와 다를 수 있습니다.</span></div>
          <FiltersBar value={filters} onChange={updateFilters} eventFilters refresh={refresh} busy={busy} devices={devices} />
          <div className="results-caption"><span>수신 범위 내 이벤트 <b>{events.length}</b>건 <i />명령 <b>{eventSummary.commands}</b>건 · 측정값 <b>{new Set(events.filter(event=>event.telemetryId!=null).map(event=>event.telemetryId)).size}</b>건</span><span>탐지 시각 기준 · KST</span></div>
          <div className="detection-grid"><Panel title="탐지 목록" action={<div className="segmented"><button className={!group ? 'active' : ''} onClick={() => {setGroup(false); setPage(0);}}>이벤트별</button><button className={group ? 'active' : ''} onClick={() => {setGroup(true); setPage(0);}}>원인별</button></div>}>
            {group ? <>{!sourceGroups.length ? <Empty /> : <div className="group-list">{sourceGroups.slice(groupPage*7,(groupPage+1)*7).map(sourceGroup => <button key={sourceGroup.key} className="command-group" onClick={() => selectEvent(sourceGroup.events[0].id)}><Database size={20}/><span><b>{sourceGroup.label}</b><small>{sourceGroup.events[0].deviceId || '설비 미제공'}</small></span><span className="count-pill">탐지 {sourceGroup.events.length}건</span><ChevronRight size={16}/></button>)}</div>}<Pager page={groupPage} total={sourceGroups.length} size={7} onChange={setPage} /></> : <><EventTable compact events={events.slice(actualPage*7,(actualPage+1)*7)} selected={shownEvent?.id} onSelect={selectEvent} onCommand={setCommandId} /><Pager page={actualPage} total={events.length} size={7} onChange={setPage} /></>}
          </Panel><EventDetail event={shownEvent} snapshot={snapshot} onSelect={openEvent} /></div>
        </>}
        {route === 'path' && <FullPath />}
        {route === 'physical' && <PhysicalLive snapshot={snapshot} ready={Boolean(server.lastUpdated)} busy={busy} refresh={refresh} resetVersion={server.resetVersion}/>}
        {route === 'rules' && <>
          <div className="info-banner"><Settings2 size={18} /><span>현재 서버의 R1–R4 구현 내용입니다. 규칙 버전 조회 API가 없어 과거 탐지 이력의 의미와 다를 수 있습니다. R5는 현재 규칙에서 제거되었습니다.</span></div>
          <Panel title="명령·측정값 탐지 규칙" subtitle="규칙 설정 조회·편집 API는 미제공"><div className="table-scroll"><table className="rules-table"><thead><tr><th>규칙</th><th>탐지 내용</th><th>구현 상태</th><th>상세</th></tr></thead><tbody>{rules.map(r => <tr key={r.id} className={r.id === rule ? 'selected' : ''}><td><span className="rule-code">{r.id}</span><b>{r.name}</b></td><td>{r.description}</td><td><span className="status done">{r.id === 'R2' ? '구현 · MEDIUM/HIGH' : '구현 · HIGH'}</span></td><td><button className="text-button" onClick={() => setRule(r.id)} aria-label={r.name+' 상세 보기'}>상세 보기 <ChevronRight size={14} /></button></td></tr>)}</tbody></table></div></Panel>
          <div className="two-columns"><Panel title="선택한 규칙 상세" action={<span className="rule-code large">{rule}</span>}><div className="detail-body"><h3 className="rule-title">{selectedRule.name}</h3><p className="muted">{selectedRule.description}</p><dl className="detail-grid single"><div><dt>사용 데이터</dt><dd>{selectedRule.inputs}</dd></div><div><dt>정책</dt><dd>{selectedRule.policy}</dd></div><div><dt>서버 전체 탐지 건수</dt><dd>{count(stats?.ruleCounts[rule] ?? (stats ? 0 : undefined))}건</dd></div></dl></div></Panel>
          <Panel title="추가 조회 필요" subtitle="화면에서 검증 근거를 표시하기 위한 정보"><div className="policy-list">{['계획 출력 · 명령 출력(kW)','SOC · 실제 출력 시계열','예상 변화 · 잔차 · 생략 사유','규칙 버전 · 재생 상태'].map(item => <div key={item}><span>{item}</span><span className="pending-pill">API 미제공</span></div>)}</div></Panel></div>
          <Panel title="확장 검증 설정" action={<span className="planned-pill">기획</span>}><div className="future-settings">{['배터리 용량','검증 시간 구간','허용 오차','연속 초과 조건'].map(label => <label key={label}>{label}<input disabled value="미설정" readOnly /></label>)}<button className="button" disabled>편집 준비 중</button></div></Panel>
        </>}
        {route === 'replay' && <>
          <div className="info-banner"><FlaskConical size={18} /><span>명령과 측정값을 시간순으로 재생합니다. 아래 진행률은 명령만 집계하며, 100%여도 측정값 처리가 남을 수 있습니다. 제어는 공용 서버에 반영됩니다.</span></div>
          {controlError && !resetOpen && <div className="error-banner" role="alert">{controlError}</div>}
          <div className="replay-summary"><div><span className="muted">명령 처리 진행 · 서버 전체</span><div className="progress-numbers"><b>{count(progress)}</b><span>/ {count(total)}건</span><strong>{replayPercent === null ? '—' : replayPercent.toFixed(1)+'%'}</strong></div><progress value={progress ?? 0} max={total || 1} aria-label="명령 처리 진행률" /></div><div><span>대기</span><b>{count(stats ? Math.max(0, stats.totalCount-stats.processedCount) : undefined)}<small>건</small></b></div><div><span>평가용 이상 정답</span><b className="amber-text">{count(stats?.labeledAnomalyCount)}<small>건</small></b></div><div><span>탐지 이벤트</span><b className="red-text">{count(stats?.detectionCount)}<small>건</small></b></div></div>
          <Panel title="서버 재생 제어" subtitle="현재 재생 상태 조회 API는 미제공 · 아래 상태는 마지막 제어 응답 기준"><div className="replay-controls"><button className="button primary" disabled={controlDisabled} onClick={() => void runControl('start')}><Play size={16} />{server.actionPending === 'start' ? '시작 요청 중…' : '재생 시작'}</button><button className="button" disabled={controlDisabled} onClick={() => void runControl('stop')}><Square size={15} />{server.actionPending === 'stop' ? '정지 요청 중…' : '재생 정지'}</button><button className="button" disabled={busy} onClick={refresh}><RefreshCw size={15} />통계 새로고침</button></div><p className="control-status">{server.lastControl ? time(server.lastControl.at)+' KST 응답 · '+(server.lastControl.running ? '재생 중' : '정지')+' · 처리 '+server.lastControl.processedCount+'건' : '제어 요청 이력 없음 · 현재 재생 여부는 확인할 수 없습니다.'}</p><p className="panel-note">자동 처리 완료나 다른 사용자의 제어는 마지막 응답 이후 상태를 바꿀 수 있습니다.</p></Panel>
          <div className="overview-grid"><Panel title="최근 탐지와 원인 정보" subtitle={recentCaption}><EventTable events={allEvents.slice(0,6)} onSelect={openEvent} onCommand={setCommandId} /><p className="panel-note">탐지되지 않은 명령의 개별 목록과 정답 라벨은 API에서 제공하지 않습니다.</p></Panel><Panel title="실시간 알림과 자동 조회" subtitle={streamLabel}><div className="detail-body"><div className="stream-note"><Radio size={17} /><span>SSE로 탐지·초기화를 수신하며, 연결이 끊겨도 3초 주기로 조회합니다.</span></div><p className="fineprint">서버가 첫 알림을 보낼 때까지 연결 대기로 보일 수 있습니다. 정상 명령의 처리 진행은 통계 조회로 갱신합니다.</p><dl className="detail-grid single"><div><dt>최근 정상 조회</dt><dd>{time(server.lastUpdated)} KST</dd></div><div><dt>수신 이벤트</dt><dd>{snapshot.events.length}건</dd></div></dl></div></Panel></div>
          <div className="two-columns"><Panel title="평가용 정답 라벨" subtitle="탐지 결과와 다른 값입니다"><div className="detail-body"><p>서버가 제공한 이상 정답 라벨: <b>{count(stats?.labeledAnomalyCount)}건</b></p><p className="fineprint">라벨 건수는 평가 기준이며 실제 탐지 명령 수가 아닙니다. 명령별 라벨 조회는 제공되지 않습니다.</p></div></Panel><Panel title="서버 시연 초기화" subtitle="전체 탐지 결과와 명령·측정값 처리 상태를 초기화합니다"><div className="reset-panel"><p>원본 명령·측정값은 유지됩니다. 양쪽 처리 상태와 탐지 결과를 초기화한 뒤 재생은 정지됩니다.</p><button className="button danger" disabled={controlDisabled} onClick={() => {setControlError(''); setResetOpen(true);}}><Trash2 size={16} />탐지 결과 초기화</button></div></Panel></div>
        </>}
      </main>
      <footer className="statusbar"><span><span className={'mini-dot '+(error ? 'amber' : 'blue')} />{httpLabel} · {streamLabel}</span><span>통계 자동 조회 3초 <i />표시 시각 KST</span></footer>
    </div>
    {notice && <div className="toast" role="status"><ShieldCheck size={18} />{notice}<button aria-label="알림 닫기" onClick={() => setNotice('')}>×</button></div>}
    <dialog ref={commandDialog} className="command-dialog" aria-labelledby="command-title" onCancel={() => setCommandId(undefined)} onClose={() => setCommandId(undefined)}>
      {activeCommand && <><header className="command-dialog-heading"><div><span className="eyebrow">COMMAND DETAIL</span><h2 id="command-title">명령 #{activeCommand.id}</h2></div><button className="icon-button" autoFocus aria-label="명령 상세 닫기" onClick={() => setCommandId(undefined)}><X size={20} /></button></header>
        <CommandDetail command={activeCommand} events={snapshot.events} onEvent={id => {setCommandId(undefined); commandDialog.current?.close(); openEvent(id);}} /><div className="dialog-actions"><button className="button" onClick={() => setCommandId(undefined)}>닫기</button></div></>}
    </dialog>
    <dialog ref={dialog} className="reset-dialog" onCancel={e => {if (resetting) e.preventDefault(); else setResetOpen(false);}} onClose={() => setResetOpen(false)} aria-labelledby="reset-title"><div className="dialog-icon"><Trash2 size={24} /></div><h2 id="reset-title">서버 시연을 초기화할까요?</h2><p>공용 서버의 데이터가 변경됩니다.<br />접속 중인 다른 사용자에게도 영향을 줍니다.</p><ul><li>전체 탐지 결과 <b>{count(stats?.detectionCount)}건 삭제</b></li><li>전체 명령 <b>{count(total)}건과 전체 측정값을 처리 대기로 변경</b></li><li>재생은 정지되며 자동으로 다시 시작하지 않습니다.</li></ul>{controlError && <div className="error-banner" role="alert">{controlError}</div>}<div className="dialog-actions"><button className="button" autoFocus disabled={resetting} onClick={() => setResetOpen(false)}>취소</button><button className="button danger-solid" disabled={server.actionPending !== null} onClick={() => void runControl('reset')}>{resetting ? '초기화 중…' : '서버 초기화'}</button></div></dialog>
  </div>;
}

