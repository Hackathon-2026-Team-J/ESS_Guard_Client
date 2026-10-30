import { useState } from 'react';
import { Activity, ArrowRight, BatteryCharging, Building2, Cpu, Database, FlaskConical, Network, Thermometer, Waves, Zap } from 'lucide-react';
import { Panel } from './components.tsx';

function PreviewNotice() {
  return <div className="info-banner planned-banner"><FlaskConical size={19} /><span><b>기획 미리보기 · 예시 데이터</b> 계측 데이터 수집 및 검증 API가 연결되지 않은 설계 화면입니다.</span></div>;
}
function Trend({ physical = false }: { physical?: boolean }) {
  const x = (seconds: number) => 60 + seconds / (physical ? 5 : 100) * 620;
  const y = (value: number) => physical ? 42 + -value / 30 * 150 : 192 - value / 100 * 150;
  const times = physical ? ['14:32:08', '14:32:09', '14:32:10', '14:32:11', '14:32:12', '14:32:13'] : ['14:31:30', '14:31:50', '14:32:10', '14:32:30', '14:32:50', '14:33:10'];
  const ticks = physical ? [0, -10, -20, -30] : [0, 25, 50, 75, 100];
  const initial = physical ? 0 : 98;
  const final = physical ? -28 : 70;
  const step = physical ? 2 : 40;
  return <div className="trend"><div className="chart-legend"><span><i style={{ background: physical ? '#7c3aed' : '#2563eb' }} />{physical ? '보고 SOC 변화 (Modbus)' : 'CAN · 배터리 → BMS'}</span><span><i style={{ background: physical ? '#0891b2' : '#ef9b22' }} />{physical ? '전류 적분 예상 변화' : 'Modbus · IEC104 · ICCP'}</span></div>
    <svg viewBox="0 0 730 242" role="img" aria-label={physical ? 'SOC 변화량: 14시 32분 10초에 보고 변화가 0에서 마이너스 28퍼센트포인트로 하락. 예상 변화는 0.' : 'SOC 예시: 14시 32분 10초에 Modbus 이후 값이 98에서 70퍼센트로 하락. CAN은 98퍼센트 유지.'}>
      {ticks.map(tick => <g key={tick}><line x1="60" x2="680" y1={y(tick)} y2={y(tick)} stroke="#e6eaf1" /><text x="45" y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
      {times.map((time, index) => <g key={time}><line x1={x(index * (physical ? 1 : 20))} x2={x(index * (physical ? 1 : 20))} y1="36" y2="196" stroke="#f0f3f8" /><text x={x(index * (physical ? 1 : 20))} y="221" textAnchor="middle">{time}</text></g>)}
      <text transform="translate(16 128) rotate(-90)" textAnchor="middle">{physical ? 'SOC 변화 (%p)' : 'SOC (%)'}</text>
      <line x1={x(step)} x2={x(step)} y1="30" y2="195" stroke="#b3becf" strokeDasharray="4 4" />
      <path d={'M60,' + y(initial) + ' H680'} fill="none" stroke={physical ? '#0891b2' : '#2563eb'} strokeWidth="2.5" strokeDasharray={physical ? '6 4' : undefined} />
      <path d={'M60,' + y(initial) + ' H' + x(step) + ' V' + y(final) + ' H680'} fill="none" stroke={physical ? '#7c3aed' : '#ef9b22'} strokeWidth="3" />
      <circle cx={x(step)} cy={y(final)} r="4" fill={physical ? '#7c3aed' : '#ef9b22'} />
    </svg>
    {physical && <><div className="current-chart"><span>전류 (A)</span><svg viewBox="0 0 730 85" role="img" aria-label="분석 구간 5초 동안 전류는 0암페어"><line x1="60" y1="40" x2="680" y2="40" stroke="#2563eb" strokeWidth="2" /><text x="45" y="44">0</text>{times.map((time, index) => <text key={time} x={x(index)} y="72" textAnchor="middle">{time}</text>)}</svg></div><p className="panel-note">분석 구간 2026-10-31 14:32:08–14:32:13 · 예시 전류 0 A</p></>}
  </div>;
}
export function FullPath() {
  const nodes = [{ name: '배터리 모듈', icon: BatteryCharging }, { name: 'BMS', icon: Cpu }, { name: 'ESS EMS', icon: Database }, { name: '계통 EMS', icon: Building2 }, { name: '타 관제센터', icon: Network }];
  return <><PreviewNotice /><Panel title="전력 데이터 관측 경로" subtitle="배터리부터 관제센터까지 · 실제 연결 상태를 나타내지 않습니다"><div className="topology">{nodes.map((node, i) => <div className="topology-segment" key={node.name}><div className={'topology-node ' + (i === 2 ? 'highlight' : '')}><node.icon size={30} strokeWidth={1.5} /><b>{node.name}</b></div>{i < 4 && <div className={'topology-edge ' + (i === 1 ? 'anomaly' : '')}><span>{['CAN', 'Modbus TCP', 'DNP3 / IEC104', 'ICCP'][i]}</span><ArrowRight size={29} />{i === 1 && <small>관측 편차 예시</small>}</div>}</div>)}</div></Panel>
    <div className="overview-grid"><Panel title="관측 지점별 비교" subtitle="같은 시각에 관측된 SOC 예시 · 2026-10-31 14:32:10"><div className="table-scroll"><table><thead><tr><th>관측 구간</th><th>항목</th><th className="number">값</th><th>비교 결과</th></tr></thead><tbody>{[['CAN · 배터리 → BMS', '98.0', 'Modbus와 불일치'], ['Modbus · BMS → ESS EMS', '70.0', 'IEC104와 일치'], ['IEC104 · ESS EMS → 계통', '70.0', 'ICCP와 일치'], ['ICCP · 계통 → 타 센터', '70.0', '비교 끝점']].map((row, i) => <tr key={row[0]}><td>{row[0]}</td><td className="muted">SOC</td><td className="number"><b>{row[1]}</b> %</td><td><span className={i === 0 ? 'status warning' : 'status'}>{row[2]}</span></td></tr>)}</tbody></table></div><Trend /></Panel>
    <Panel title="교차 검증" subtitle="단일 관측 차이와 공격 판정을 구분합니다"><div className="correlation-list"><div><ShieldIcon /><span><b>명령 규칙</b><small>탐지 결과 연계 예정</small></span></div><div><Network size={22} /><span><b>구간 일관성</b><small>CAN–Modbus 불일치 예시</small></span></div><div><Activity size={22} /><span><b>물리 검증</b><small>SOC 변화량 불일치 예시</small></span></div></div><div className="correlation-note"><strong>상관관계 검토 필요</strong><p>동시 이상만으로 공격을 확정하지 않습니다.</p></div><div className="detail-body"><h3>연계 시 필요한 정보</h3><ul className="muted-list"><li>관측 지점과 공통 설비 식별자</li><li>동일 기준의 시각과 측정 품질</li><li>프로토콜별 항목·주기 보정</li></ul></div></Panel></div></>;
}
function ShieldIcon() { return <Zap size={22} />; }

const physicalTabs = [
  { id: 'soc', label: 'SOC · 전류', icon: Activity },
  { id: 'temperature', label: '온도 · 발열', icon: Thermometer },
  { id: 'response', label: '명령 · 응답', icon: Waves },
  { id: 'voltage', label: '셀 · 팩 전압', icon: BatteryCharging },
];
const futureInfo: Record<string, { title: string; description: string; inputs: string[]; considerations: string[] }> = {
  temperature: { title: '온도 은폐 검증', description: '전류와 온도 변화의 관계를 냉각·운전 조건과 함께 검토하는 화면입니다.', inputs: ['전류 시계열', '온도 시계열', '주변 온도 · 냉각 상태'], considerations: ['고정 온도만으로 위조를 확정하지 않음', '열모델과 지연 시간 정의', '연속 초과 조건 및 허용오차 설정'] },
  response: { title: '명령–응답 정합성 검증', description: '충방전 명령과 관측된 전류·전압 응답의 일관성을 검토합니다.', inputs: ['명령 식별자 · 발생 시각', '명령 수락 · 보호 동작', '전류 · 전압 응답'], considerations: ['요청과 실제 수락 구분', '명령과 응답의 시간 연결', '정상 보호 동작을 이상으로 오인하지 않도록 설계'] },
  voltage: { title: '셀 합–팩 전압 검증', description: '직렬 셀 전압의 합과 독립적으로 측정된 팩 전압을 비교합니다.', inputs: ['셀별 전압', '독립 측정 팩 전압', '셀 구성 · 측정 시각'], considerations: ['직렬 · 병렬 구성 반영', '독립 관측값 확보', '측정 오차와 시각 차이 보정'] },
};
export function Physical() {
  const [tab, setTab] = useState('soc');
  return <><PreviewNotice /><div className="page-tabs" role="tablist" aria-label="물리 검증 항목">{physicalTabs.map(item => <button key={item.id} role="tab" aria-selected={tab === item.id} aria-controls="physical-content" onClick={() => setTab(item.id)} className={tab === item.id ? 'active' : ''}><item.icon size={17} />{item.label}</button>)}</div>
    <div id="physical-content" role="tabpanel">{tab === 'soc' ? <>
      <div className="physical-readings">{[['CAN SOC', '98.0', '%'], ['Modbus SOC', '70.0', '%'], ['전류', '0.0', 'A'], ['분석 구간', '5', '초']].map(([label, value, unit]) => <div key={label}><span>{label}</span><strong>{value}<small>{unit}</small></strong></div>)}</div>
      <div className="overview-grid"><Panel title="SOC 변화량 · 전류 추세" subtitle="보고 변화와 전류 적분 모델의 차이"><Trend physical /></Panel>
        <div className="stack"><Panel title="계산 결과" subtitle="분석 구간의 변화량 기준"><div className="residual-results"><div><span>보고 SOC 변화</span><strong>−28.0<small>%p</small></strong></div><div><span>예상 변화</span><strong>0.0<small>%p</small></strong></div><div><span>잔차</span><strong>28.0<small>%p</small></strong></div></div><div className="residual-alert">예시 판정 · 관계식 불일치</div></Panel>
        <Panel title="검증 근거" subtitle="단순 시연 모델"><div className="detail-body"><dl className="detail-grid single"><div><dt>모델 용량</dt><dd>100 Ah</dd></div><div><dt>평균 전류</dt><dd>0.0 A</dd></div><div><dt>전류 부호</dt><dd>충전 양(+)의 방향</dd></div></dl><div className="formula">예상 변화 = 100 × ∫I dt / (3600 × Q)<br />잔차 = |보고 변화 − 예상 변화|</div><p className="fineprint">예상 변화량은 실제 SOC의 정답이 아닙니다. 일정한 오프셋은 변화량 검사만으로 놓칠 수 있어 구간 비교와 함께 검토합니다.</p></div></Panel></div></div></> :
      <Panel title={futureInfo[tab].title} action={<span className="planned-pill">추가 설계</span>}><div className="future-detail"><div className="future-illustration">{tab === 'temperature' ? <Thermometer size={64} strokeWidth={1} /> : tab === 'response' ? <Waves size={64} strokeWidth={1} /> : <BatteryCharging size={64} strokeWidth={1} />}<p>{futureInfo[tab].description}</p><span className="pending-pill">실제 검증 미구현</span></div><div><h3>필요한 입력</h3><ul className="muted-list">{futureInfo[tab].inputs.map(input => <li key={input}>{input}</li>)}</ul><h3>검토 사항</h3><ul className="muted-list">{futureInfo[tab].considerations.map(input => <li key={input}>{input}</li>)}</ul></div></div></Panel>}
    </div>
  </>;
}

