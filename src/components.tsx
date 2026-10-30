import { useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, FileSearch, RotateCcw, Search } from 'lucide-react';
import type { Command, DetectionEvent, Filters, Severity, Snapshot } from './model.ts';
import { eventKind, eventSourceLabel, relatedEvents, rules } from './model.ts';

export function Panel({ title, subtitle, action, children, className = '', id }: { id?: string; title: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section id={id} className={'panel ' + className}><header className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</section>;
}
export function Badge({ severity }: { severity: Severity }) {
  return <span className={'badge severity-' + severity.toLowerCase()}><i />{severity}</span>;
}
export function Empty({ children = '조건에 맞는 데이터가 없습니다.' }: { children?: ReactNode }) {
  return <div className="empty"><FileSearch size={30} strokeWidth={1.3} /><strong>{children}</strong><span>조회 조건을 변경하거나 새로고침해 주세요.</span></div>;
}
export function FiltersBar({ value, onChange, eventFilters = false, refresh, busy, devices = [] }: { devices?: string[]; value: Filters; onChange: (filters: Filters) => void; eventFilters?: boolean; refresh: () => void; busy: boolean }) {
  const set = (key: keyof Filters, next: string) => onChange({ ...value, [key]: next });
  return <div className="filters">
    <label>탐지 날짜 (비우면 전체)<input aria-label="표시 날짜" type="date" value={value.date} onChange={e => set('date', e.target.value)} /></label>
    <label>대상 설비<select value={value.device} onChange={e => set('device', e.target.value)}><option value="">전체 설비</option>{[...new Set([...devices, value.device].filter(Boolean))].map(device => <option key={device}>{device}</option>)}</select></label>
    {eventFilters && <><label>위험도<select value={value.severity} onChange={e => set('severity', e.target.value)}><option value="">전체 위험도</option>{['CRITICAL', 'HIGH', 'MEDIUM'].map(s => <option key={s}>{s}</option>)}</select></label>
      <label>규칙<select value={value.rule} onChange={e => set('rule', e.target.value)}><option value="">전체 규칙</option>{rules.map(r => <option key={r.id} value={r.id}>{r.id} · {r.name}</option>)}</select></label>
      <label className="search-label">클라이언트<div className="search-field"><Search size={15} /><input placeholder="클라이언트 ID 검색" value={value.client} onChange={e => set('client', e.target.value)} /></div></label></>}
    <button className="button refresh-button" onClick={refresh} disabled={busy}><RotateCcw size={15} className={busy ? 'spin' : ''} />{busy ? '불러오는 중' : '새로고침'}</button>
  </div>;
}
export function Stats({ commands, events }: { commands: { processed: number; total: number; pending: number }; events: { total: number; commands: number } }) {
  return <div className="stats-grid">
    <div className="stat"><span>처리 명령</span><div><strong>{commands.processed.toLocaleString()}</strong><small>/ {commands.total.toLocaleString()}</small></div><p><span className="mini-dot blue" />발생일 기준 명령 처리 현황</p></div>
    <div className="stat"><span>처리 대기</span><div><strong>{commands.pending.toLocaleString()}</strong><small>건</small></div><p>아직 평가하지 않은 명령</p></div>
    <div className="stat"><span>탐지 명령</span><div><strong className="amber-text">{events.commands.toLocaleString()}</strong><small>건</small><ArrowUpRight size={19} /></div><p>탐지일 기준 · 중복 명령 제외</p></div>
    <div className="stat"><span>탐지 이벤트</span><div><strong className="red-text">{events.total.toLocaleString()}</strong><small>건</small><ArrowDownRight size={19} /></div><p>명령 한 건에 여러 이벤트 가능</p></div>
  </div>;
}
export function Pager({ page, total, size, onChange }: { page: number; total: number; size: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <div className="pager"><span>전체 <b>{total}</b>건 {total > 0 && <>중 {page * size + 1}–{Math.min((page + 1) * size, total)}</>}</span><div><button className="icon-button" aria-label="이전 페이지" disabled={page === 0} onClick={() => onChange(page - 1)}><ChevronLeft size={16} /></button><span>{page + 1} / {pages}</span><button className="icon-button" aria-label="다음 페이지" disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={16} /></button></div></div>;
}
export function CommandTable({ commands, events, onCommand, limit, labels = false }: { commands: Command[]; events: DetectionEvent[]; onCommand?: (id: number) => void; limit?: number; labels?: boolean }) {
  const [page, setPage] = useState(0);
  const size = limit ?? 8;
  const actualPage = Math.min(page, Math.max(0, Math.ceil(commands.length / size) - 1));
  const sorted = [...commands].sort((a, b) => (b.issuedAt ?? '').localeCompare(a.issuedAt ?? '') || b.id - a.id);
  const rows = sorted.slice(limit ? 0 : actualPage * size, limit ? size : (actualPage + 1) * size);
  return <>{!rows.length ? <Empty /> : <div className="table-scroll"><table><thead><tr><th>명령 ID</th><th>발생 시각</th><th>클라이언트</th><th>기능 코드</th><th>처리</th><th className="number">탐지 수</th>{labels && <th>평가 라벨</th>}</tr></thead><tbody>{rows.map(c => {
    const count = events.filter(e => e.commandLogId === c.id).length;
    return <tr key={c.id} className={onCommand ? "clickable-row" : undefined} onClick={() => onCommand?.(c.id)}><td>{onCommand ? <button className="text-button mono" aria-label={"명령 " + c.id + " 상세"} onClick={event => { event.stopPropagation(); onCommand(c.id); }}>#{c.id}</button> : <span className="mono">#{c.id}</span>}</td><td className="mono muted">{c.issuedAt?.slice(11, 19) ?? '미제공'}</td><td>{c.clientId}<small className="cell-sub">{c.role}</small></td><td><span className={c.functionCode === 6 || c.functionCode === 16 ? 'write-code' : 'read-code'}>{c.functionCode}</span> {c.functionCode === 6 || c.functionCode === 16 ? '쓰기' : '읽기'}</td><td><span className={'status ' + (c.processed ? 'done' : '')}>{c.processed ? '완료' : '대기'}</span></td><td className={'number ' + (count ? 'blue-text' : 'muted')}>{c.processed ? count : '—'}</td>{labels && <td>{c.labeledAnomaly ? '이상 예시' : '정상 예시'}</td>}</tr>;
  })}</tbody></table></div>}{!limit && <Pager page={actualPage} total={commands.length} size={size} onChange={setPage} />}</>;
}
export function EventTable({ events, selected, onSelect, onCommand, compact = false }: { events: DetectionEvent[]; selected?: number; onSelect: (id: number) => void; onCommand?: (id: number) => void; compact?: boolean }) {
  if (!events.length) return <Empty />;
  return <div className="table-scroll"><table className="event-table"><thead><tr><th>탐지 시각</th><th>이벤트 / 원인</th><th>규칙</th><th>위험도</th>{!compact && <th>탐지 내용</th>}</tr></thead><tbody>{events.map(event => <tr key={event.id} className={'clickable-row ' + (event.id === selected ? 'selected' : '')} onClick={() => onSelect(event.id)}><td className="mono">{event.detectedAt.slice(11, 19)}<small className="event-date">{event.detectedAt.slice(0, 10)}</small></td><td><button className="text-button mono" aria-label={'이벤트 ' + event.id + ' 상세'} onClick={click => { click.stopPropagation(); onSelect(event.id); }}>#{event.id}</button><small className="cell-sub">{event.commandLogId !== null && onCommand ? <button className="command-link" aria-label={"원본 명령 " + event.commandLogId + " 상세 · 이벤트 " + event.id} onClick={click => { click.stopPropagation(); if (event.commandLogId !== null) onCommand(event.commandLogId); }}>{eventSourceLabel(event)}</button> : event.telemetryId != null ? <button className="command-link" aria-label={'측정 ' + event.telemetryId + ' 관련 탐지 · 이벤트 ' + event.id} onClick={click => {click.stopPropagation(); onSelect(event.id);}}>{eventSourceLabel(event)}</button> : eventSourceLabel(event)}</small></td><td><span className="rule-code">{event.ruleId}</span>{!compact && <span className="rule-name">{eventKind(event)}</span>}</td><td><Badge severity={event.severity} /></td>{!compact && <td className="message-cell">{event.message}</td>}</tr>)}</tbody></table></div>;
}
export function EventDetail({ event, snapshot, onSelect }: { event?: DetectionEvent; snapshot: Snapshot; onSelect: (id: number) => void }) {
  if (!event) return <Panel title="탐지 상세"><Empty>이벤트를 선택해 주세요.</Empty></Panel>;
  const command = snapshot.commands.find(c => c.id === event.commandLogId);
  const related = relatedEvents(event, snapshot.events);
  return <Panel title={'이벤트 #' + event.id} subtitle={eventSourceLabel(event)} action={<Badge severity={event.severity} />} className="detail-panel" id="event-detail">
    <div className="detail-body"><div className="event-reason"><span>{event.ruleId} · {eventKind(event)}</span><strong>{event.message}</strong><small>탐지 시각 {event.detectedAt.slice(0, 19).replace('T', ' ')} · KST</small></div>
      {event.commandLogId !== null ? <><h3>원본 명령 정보</h3>{command ? <CommandInfo command={command} /> : <p className="notice">원본 명령 확인 불가 · 탐지 이벤트는 유지됩니다.</p>}</> : event.telemetryId != null ? <><h3>원인 측정값</h3><dl className="detail-grid">
        <div><dt>측정값 ID</dt><dd>#{event.telemetryId}</dd></div><div><dt>대상 설비</dt><dd>{event.deviceId || '서버 미제공'}</dd></div>
        <div><dt>측정 시각</dt><dd>서버 미제공</dd></div><div><dt>측정 출력 · SOC</dt><dd>서버 미제공</dd></div>
      </dl><p className="fineprint">위 시각은 탐지 시각입니다. 측정 시각과 원시 데이터는 별도 조회 API가 필요합니다. 이 탐지에는 원인 명령 ID가 제공되지 않습니다.</p></> : <p className="notice">원인 식별자가 제공되지 않았습니다.</p>}
      <p className="fineprint">규칙 버전은 응답에 없습니다. 과거 이력의 규칙 의미는 현재 규칙 설명과 다를 수 있으며 탐지 사유는 서버 원문으로 표시합니다.</p>
      <h3>수신 범위 내 같은 원인의 탐지 <span className="count-pill">{related.length}</span></h3>
      <div className="related-events">{related.map(e => <button key={e.id} onClick={() => onSelect(e.id)} className={e.id === event.id ? 'related selected' : 'related'}><span><b>{e.ruleId}</b> {eventKind(e)}<small>이벤트 #{e.id}</small></span><Badge severity={e.severity} /></button>)}</div>
    </div>
  </Panel>;
}

export function CommandInfo({ command }: { command: Command }) {
  const fields = [
    ['명령 ID', '#' + command.id], ['발생 시각', command.issuedAt?.slice(0, 19).replace('T', ' ') ?? '서버 미제공'],
    ['클라이언트', command.clientId ?? '서버 미제공'], ['역할', command.role ?? '서버 미제공'], ['대상 설비', command.deviceId || '서버 미제공'],
    ['기능 코드', command.functionCode === null ? '서버 미제공' : command.functionCode + (command.functionCode === 6 || command.functionCode === 16 ? ' · 쓰기' : ' · 읽기')],
    ['레지스터 주소', command.registerAddress ?? '서버 미제공'], ['명령 값', command.value === null ? '서버 미제공' : command.value + ' (원시 정수)'],
    ['명령 당시 설비 상태', command.essState ?? '정보 없음'], ['처리 상태', command.processed === null ? '서버 미제공' : command.processed ? '처리 완료' : '대기'],
  ];

  return <dl className="detail-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function CommandDetail({ command, events, onEvent }: { command: Command; events: DetectionEvent[]; onEvent: (id: number) => void }) {
  const related = events.filter(event => event.commandLogId === command.id);
  return <div className="detail-body">
    <div className={'command-summary ' + (command.processed ? 'evaluated' : '')}>
      <span className={'status ' + (command.processed ? 'done' : '')}>{command.processed === null ? '처리 상태 미제공' : command.processed ? '처리 완료' : '처리 대기'}</span>
      <p>{command.processed === null ? '탐지 이벤트에 포함된 명령 정보입니다. 명령 발생 시각과 처리 상태는 제공되지 않습니다.' : !command.processed ? '아직 평가되지 않은 명령입니다.' : related.length ? '이 명령에서 ' + related.length + '개의 탐지 이벤트가 발생했습니다.' : '처리가 완료되었으며 연결된 탐지 이벤트가 없습니다.'}</p>
    </div>
    <CommandInfo command={command} />
    <p className="fineprint">명령 값은 원시 정수입니다. 처리 완료 또는 규칙 미탐지가 설비의 안전을 보장하지 않습니다.</p>
    <h3>수신 범위 내 연결된 탐지 <span className="count-pill">{related.length}</span></h3>
    {related.length ? <div className="related-events">{related.map(event => <button key={event.id} className="related" onClick={() => onEvent(event.id)}><span><b>{event.ruleId}</b> {eventKind(event)}<small>이벤트 #{event.id} · 상세 보기</small></span><Badge severity={event.severity} /></button>)}</div> : <p className="command-no-events">{command.processed ? '연결된 탐지 결과가 없습니다.' : '평가가 완료되면 탐지 결과를 확인할 수 있습니다.'}</p>}
  </div>;
}
