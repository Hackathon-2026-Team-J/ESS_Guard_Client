import { useEffect, useState } from 'react';
import { Activity, BatteryCharging, Database, Thermometer, Waves } from 'lucide-react';
import type { Filters, Snapshot } from './model.ts';
import { defaultFilters, physicalEvents, selectEvents } from './model.ts';
import { EventDetail, EventTable, FiltersBar, Pager, Panel } from './components.tsx';

const tabs = [
  {id:'soc', label:'SOC · 출력', icon:Activity},
  {id:'temperature', label:'온도 · 발열', icon:Thermometer},
  {id:'response', label:'명령 · 응답', icon:Waves},
  {id:'voltage', label:'셀 · 팩 전압', icon:BatteryCharging},
];
export function PhysicalLive({snapshot, ready, busy, refresh, resetVersion}: {snapshot:Snapshot; ready:boolean; busy:boolean; refresh:()=>void; resetVersion:number}) {
  const [tab,setTab] = useState('soc');
  const [filters,setFilters] = useState<Filters>({...defaultFilters,date:''});
  const [selected,setSelected] = useState<number>();
  const [page,setPage] = useState(0);
  useEffect(()=>{setSelected(undefined);setPage(0);},[resetVersion]);
  const all = physicalEvents(snapshot.events);
  const events = physicalEvents(selectEvents(snapshot,filters));
  const shown = events.find(event=>event.id===selected) ?? events[0];
  const actualPage = Math.min(page,Math.max(0,Math.ceil(events.length/7)-1));
  const devices = [...new Set(all.map(event=>event.deviceId).filter((id):id is string=>Boolean(id)))].sort();
  function select(id:number) {
    setSelected(id);
    requestAnimationFrame(()=>{if(window.innerWidth<=1250) document.getElementById('event-detail')?.scrollIntoView({block:'start',behavior:'instant'});});
  }
  return <>
    <div className="info-banner"><Activity size={18}/><span><b>R4 탐지 결과 연동</b>측정값 기반 물리 이상 알림을 표시합니다. 원시 시계열과 정상·생략된 검증 결과는 아직 조회할 수 없습니다.</span></div>
    <div className="page-tabs" role="tablist" aria-label="물리 검증 항목">{tabs.map(item=><button key={item.id} role="tab" aria-selected={tab===item.id} aria-controls="physical-content" onClick={()=>setTab(item.id)} className={tab===item.id?'active':''}><item.icon size={17}/>{item.label}</button>)}</div>
    <div id="physical-content" role="tabpanel">{tab==='soc' ? <>
      <FiltersBar value={filters} onChange={value=>{setFilters(value);setPage(0);setSelected(undefined);}} devices={devices} refresh={refresh} busy={busy}/>
      <div className="physical-readings">
        <div><span>수신 범위 내 R4 탐지 · 필터 적용</span><strong>{ready?events.length:'—'}<small>건</small></strong></div>
        <div><span>관련 측정값 · 중복 제외</span><strong>{ready?new Set(events.map(event=>event.telemetryId)).size:'—'}<small>건</small></strong></div>
        <div><span>전체 측정 처리 진행</span><strong>—</strong><small>조회 API 미제공</small></div>
        <div><span>정상·미평가·생략 여부</span><strong className="unknown-reading">확인 불가</strong><small>탐지 없음 ≠ 정상</small></div>
      </div>
      <div className="overview-grid">
        <Panel title="SOC 변화 · 출력 추세" subtitle="시계열 조회 API 연결 필요"><div className="unavailable-chart"><Activity size={36} strokeWidth={1.4}/><strong>측정 그래프 데이터 미제공</strong><p>SOC(%), 실제 출력(kW), 측정 시각과 예상·실제 변화량을 조회할 API가 필요합니다.</p><span>원시 측정값이 제공되면 추세와 계산 근거를 확인할 수 있습니다.</span></div></Panel>
        <Panel title="서버 검증 모델" subtitle="서버 구현 기준 설명 · 실시간 설정 조회값 아님"><div className="detail-body"><dl className="detail-grid single">
          <div><dt>용량 기준</dt><dd>500 kWh</dd></div><div><dt>출력 부호</dt><dd>양수: 방전 / 음수: 충전</dd></div><div><dt>비교 구간</dt><dd>직전 측정 → 현재 측정</dd></div>
          <div><dt>탐지 조건</dt><dd>잔차 &gt; |예상 변화| × 15%<br/>그리고 잔차 ≥ 0.5 %p</dd></div>
        </dl><div className="formula">예상 SOC 변화(%p) = −이전 출력(kW) × 경과 시간(h) ÷ 500(kWh) × 100</div><p className="fineprint">직전 2분 내 명령 탐지가 있으면 R4 이벤트 생성을 생략합니다. 이벤트가 없어도 정상으로 판정할 수 없습니다.</p></div></Panel>
      </div>
      <p className="physical-scope">최근 최대 200개 전체 이벤트 중 측정값 기반 R4만 표시 · 필터 결과 {events.length}건 / 수신 R4 {all.length}건</p>
      <div className="detection-grid"><Panel title="물리 이상 탐지 목록" subtitle="탐지 시각 기준 · KST">
        {!ready && !events.length ? <div className="unavailable-chart"><strong>서버 데이터 조회 대기</strong></div> : events.length ? <EventTable events={events.slice(actualPage*7,(actualPage+1)*7)} selected={shown?.id} onSelect={select}/> : <div className="unavailable-chart"><strong>수신 범위에서 해당 R4 탐지가 없습니다.</strong><p>필터·최근 조회 범위·검증 생략 여부에 따라 결과가 없을 수 있습니다. 정상 여부는 확인할 수 없습니다.</p></div>}
        <Pager page={actualPage} total={events.length} size={7} onChange={setPage}/>
      </Panel><EventDetail event={shown} snapshot={snapshot} onSelect={select}/></div>
    </> : <Panel title={tabs.find(item=>item.id===tab)!.label+' 검증'} subtitle="현재 서버에 검증·조회 API 미제공"><div className="unavailable-chart"><Database size={34}/><strong>추가 검증 API가 필요합니다.</strong><p>{tab==='temperature'?'전류·온도·주변 온도·냉각 상태와 열모델 결과가 필요합니다.':tab==='response'?'명령 발생 시각·수락 여부·보호 동작과 연결된 전류·전압 응답이 필요합니다.':'셀별 전압·독립 측정 팩 전압·셀 구성·측정 시각과 비교 결과가 필요합니다.'}</p><span>현재 R4는 출력과 SOC 변화의 일관성만 검사합니다.</span></div></Panel>}</div>
  </>;
}

