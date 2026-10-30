export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM';
export type RuleId = string;
export type Role = 'OPERATOR' | 'MONITOR' | 'MAINTENANCE' | 'UNKNOWN';
export interface Command {
  id: number;
  issuedAt: string | null;
  clientId: string | null;
  role: Role | null;
  deviceId: string;
  functionCode: number | null;
  registerAddress: number | null;
  value: number | null;
  essState: 'STOPPED' | 'RUNNING' | 'MAINTENANCE' | 'FAULT' | null;
  labeledAnomaly: boolean | null;
  processed: boolean | null;
}
export interface DetectionEvent {
  id: number;
  commandLogId: number | null;
  telemetryId?: number | null;
  deviceId?: string;
  clientId?: string | null;
  ruleId: RuleId;
  severity: Severity;
  message: string;
  detectedAt: string;
}
export interface Snapshot { commands: Command[]; events: DetectionEvent[] }
export interface Filters { date: string; device: string; rule: string; severity: string; client: string }
export const defaultFilters: Filters = { date: '2026-10-31', device: '', rule: '', severity: '', client: '' };
export const rules: { id: RuleId; name: string; description: string; inputs: string; policy: string }[] = [
  { id: 'R1', name: '계획 방향 불일치', description: '운전 계획과 쓰기 명령의 충·방전 방향 비교', inputs: '운전 계획 · 명령 출력(kW) · 명령 시각', policy: '대기 명령은 제외. 계획이 없으면 대기로 간주하며, 계획과 다른 충·방전 명령은 HIGH.' },
  { id: 'R2', name: '출력 편차', description: '계획과 같은 방향의 명령에서 출력 편차 검사', inputs: '계획 출력(kW) · 명령 출력(kW)', policy: '계획이 0이 아닐 때 편차 20% 초과 및 2 kW 이상이면 탐지. 50% 초과는 HIGH, 그 외 MEDIUM.' },
  { id: 'R3', name: '잦은 방향 전환', description: '짧은 유지 시간 또는 반복적인 충·방전 전환 검사', inputs: '최근 5분 쓰기 명령 · 계획 전환 시각', policy: '5분 내 방향 전환 4회 이상 또는 현재 전환 전 유지 시간 60초 미만이면 HIGH. 계획 전환 ±30초는 제외.' },
  { id: 'R4', name: 'SOC 물리 불일치', description: '측정 출력으로 예상한 SOC 변화와 실제 변화 비교', inputs: '연속 SOC · 이전 측정 출력(kW) · 측정 간격', policy: '500 kWh 기준. 잔차가 예상 변화 절댓값의 15% 초과 및 0.5 %p 이상이면 HIGH. 직전 2분 내 명령 탐지가 있으면 이벤트 생성 생략.' },
];
export const ruleName = (id: string) => rules.find(rule => rule.id === id)?.name ?? id;
export function matchesCommand(command: Command, filters: Filters, includeDate = true) {
  return (!includeDate || !filters.date || command.issuedAt?.startsWith(filters.date))
    && (!filters.device || command.deviceId === filters.device)
    && (!filters.client || (command.clientId ?? '').toLowerCase().includes(filters.client.toLowerCase()));
}
export function eventSourceKey(event: DetectionEvent): string {
  if (event.commandLogId !== null) return 'command:' + event.commandLogId;
  if (event.telemetryId != null) return 'telemetry:' + event.telemetryId;
  return 'event:' + event.id;
}
export function eventSourceLabel(event: DetectionEvent): string {
  if (event.commandLogId !== null) return '명령 #' + event.commandLogId;
  if (event.telemetryId != null) return '측정 #' + event.telemetryId;
  return '원인 정보 미제공';
}
export function eventKind(event: DetectionEvent): string {
  return event.commandLogId !== null ? '명령 기반 탐지' : event.telemetryId != null ? '측정값 기반 탐지' : '원인 미제공';
}
export function groupEvents(events: DetectionEvent[]) {
  const groups = new Map<string, {key: string; label: string; events: DetectionEvent[]}>();
  for (const event of events) {
    const key = eventSourceKey(event);
    if (!groups.has(key)) groups.set(key, {key, label:eventSourceLabel(event), events:[]});
    groups.get(key)!.events.push(event);
  }
  return [...groups.values()];
}
export function relatedEvents(event: DetectionEvent, events: DetectionEvent[]) {
  return events.filter(candidate => eventSourceKey(candidate) === eventSourceKey(event));
}
export function physicalEvents(events: DetectionEvent[]) {
  return events.filter(event => event.ruleId === 'R4' && event.telemetryId != null && event.commandLogId === null);
}
export function selectEvents(snapshot: Snapshot, filters: Filters) {
  const commands = new Map(snapshot.commands.map(command => [command.id, command]));
  return snapshot.events.filter(event => {
    const command = event.commandLogId === null ? undefined : commands.get(event.commandLogId);
    const device = event.deviceId ?? command?.deviceId;
    const client = event.clientId ?? command?.clientId;
    return (!filters.date || event.detectedAt.startsWith(filters.date))
      && (!filters.rule || event.ruleId === filters.rule)
      && (!filters.severity || event.severity === filters.severity)
      && (!filters.device || device === filters.device)
      && (!filters.client || (client ?? '').toLowerCase().includes(filters.client.toLowerCase()));
  }).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt) || b.id - a.id);
}
export function commandStats(snapshot: Snapshot, filters: Filters) {
  const commands = snapshot.commands.filter(command => matchesCommand(command, filters));
  const processed = commands.filter(command => command.processed).length;
  const commandIds = new Set(commands.map(command => command.id));
  const detectedIds = new Set(snapshot.events.filter(event => event.commandLogId !== null && commandIds.has(event.commandLogId)).map(event => event.commandLogId));
  return { total: commands.length, processed, pending: commands.length - processed, detected: detectedIds.size,
    undetected: commands.filter(command => command.processed && !detectedIds.has(command.id)).length };
}
export function eventStats(events: DetectionEvent[]) {
  return { total: events.length, commands: new Set(events.flatMap(event => event.commandLogId === null ? [] : [event.commandLogId])).size,
    severity: { CRITICAL: events.filter(event => event.severity === 'CRITICAL').length,
      HIGH: events.filter(event => event.severity === 'HIGH').length,
      MEDIUM: events.filter(event => event.severity === 'MEDIUM').length } };
}
