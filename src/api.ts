import type { Command, DetectionEvent, Role, Severity, Snapshot } from './model.ts';

export const EVENT_LIMIT = 200;
export interface ServerStats {
  processedCount: number; totalCount: number; detectionCount: number; labeledAnomalyCount: number;
  severityCounts: Record<Severity, number>; ruleCounts: Record<string, number>;
}
export interface ApiEvent extends DetectionEvent {
  clientId: string | null; role: Role | null; deviceId: string; telemetryId: number | null;
  functionCode: number | null; registerAddress: number | null; value: number | null;
  essState: Command['essState'];
}
export type ReplayAction = 'start' | 'stop' | 'reset';
export interface ReplayResponse { running: boolean; processedCount: number }
export interface ServerState {
  snapshot: Snapshot; stats: ServerStats | null; loading: boolean; error: string;
  stream: 'connecting' | 'connected' | 'reconnecting' | 'unavailable';
  lastUpdated: string | null; resetVersion: number; actionPending: ReplayAction | null;
  lastControl: (ReplayResponse & { action: ReplayAction; at: string }) | null;
}
export interface StreamConnection {
  addEventListener(name: string, callback: (event: { data?: string }) => void): void;
  close(): void;
}
type Options = {
  fetcher?: typeof fetch;
  streamFactory?: (url: string) => StreamConnection;
  pollMs?: number; timeoutMs?: number; baseUrl?: string;
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('서버 응답 형식이 올바르지 않습니다.');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(name + ' 값이 없습니다.');
  return value;
}
function integer(value: unknown, name: string, nonnegative = true): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || (nonnegative && value < 0)) throw new Error(name + ' 값이 올바르지 않습니다.');
  return value;
}
function enumValue<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (!values.includes(value as T)) throw new Error(name + ' 값이 올바르지 않습니다.');
  return value as T;
}
export function normalizeTime(value: unknown): string {
  const raw = text(value, '탐지 시각');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(raw)) throw new Error('탐지 시각 형식이 올바르지 않습니다.');
  const ms = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw : raw + '+09:00');
  if (!Number.isFinite(ms)) throw new Error('탐지 시각 형식이 올바르지 않습니다.');
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 23) + '+09:00';
}
export function parseEvent(value: unknown): ApiEvent {
  const item = object(value);
  return {
    id: integer(item.id, '이벤트 ID'), commandLogId: item.commandLogId == null ? null : integer(item.commandLogId, '명령 ID'),
    telemetryId: item.telemetryId == null ? null : integer(item.telemetryId, '측정값 ID'),
    ruleId: text(item.ruleId, '규칙'),
    severity: enumValue<Severity>(item.severity, ['CRITICAL','HIGH','MEDIUM'], '위험도'),
    message: text(item.message, '탐지 사유'), detectedAt: normalizeTime(item.detectedAt),
    clientId: item.clientId == null ? null : text(item.clientId, '클라이언트'), deviceId: text(item.deviceId, '설비'),
    role: item.role == null ? null : enumValue<Role>(item.role, ['OPERATOR','MONITOR','MAINTENANCE','UNKNOWN'], '역할'),
    functionCode: item.functionCode == null ? null : integer(item.functionCode, '기능 코드'), registerAddress: item.registerAddress == null ? null : integer(item.registerAddress, '주소'),
    value: item.value == null ? null : integer(item.value, '명령 값', false),
    essState: item.essState == null ? null : enumValue(item.essState, ['STOPPED','RUNNING','MAINTENANCE','FAULT'] as const, '설비 상태'),
  };
}
export function parseEvents(value: unknown): ApiEvent[] {
  if (!Array.isArray(value)) throw new Error('탐지 목록 응답이 배열이 아닙니다.');
  return mergeEvents([], value.map(parseEvent));
}
export function parseStats(value: unknown): ServerStats {
  const item = object(value);
  const counts = object(item.severityCounts);
  const ruleCounts = Object.fromEntries(Object.entries(object(item.ruleCounts)).map(([key, count]) => [key, integer(count, '규칙 집계')]));
  return { processedCount: integer(item.processedCount, '처리 건수'), totalCount: integer(item.totalCount, '전체 건수'),
    detectionCount: integer(item.detectionCount, '탐지 건수'), labeledAnomalyCount: integer(item.labeledAnomalyCount, '정답 라벨 건수'),
    severityCounts: { CRITICAL: integer(counts.CRITICAL ?? 0, 'CRITICAL'), HIGH: integer(counts.HIGH ?? 0, 'HIGH'), MEDIUM: integer(counts.MEDIUM ?? 0, 'MEDIUM') }, ruleCounts };
}
export function parseReplay(value: unknown): ReplayResponse {
  const item = object(value);
  if (typeof item.running !== 'boolean') throw new Error('재생 제어 응답 형식이 올바르지 않습니다.');
  return { running: item.running, processedCount: integer(item.processedCount, '처리 건수') };
}
export function mergeEvents(previous: ApiEvent[], incoming: ApiEvent[]): ApiEvent[] {
  const byId = new Map(previous.map(event => [event.id, event]));
  incoming.forEach(event => byId.set(event.id, event));
  return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, EVENT_LIMIT);
}
export function snapshotFromEvents(events: ApiEvent[]): Snapshot {
  const commands = new Map<number, Command>();
  events.forEach(event => {
    if (event.commandLogId === null) return;
    if (!commands.has(event.commandLogId)) commands.set(event.commandLogId, {
      id: event.commandLogId, issuedAt: null, processed: null, labeledAnomaly: null,
      clientId: event.clientId, role: event.role, deviceId: event.deviceId, functionCode: event.functionCode,
      registerAddress: event.registerAddress, value: event.value, essState: event.essState,
    });
  });
  return { commands: [...commands.values()], events };
}
export function createServerClient(options: Options = {}) {
  const fetcher = options.fetcher ?? fetch;
  const base = (options.baseUrl ?? '/api').replace(/\/$/, '');
  const timeoutMs = options.timeoutMs ?? 10000;
  const createStream = options.streamFactory ?? (url => new EventSource(url) as unknown as StreamConnection);
  let state: ServerState = {
    snapshot: {commands: [], events: []}, stats: null, loading: true, error: '',
    stream: 'connecting', lastUpdated: null, resetVersion: 0, actionPending: null, lastControl: null,
  };
  let rows: ApiEvent[] = [];
  let active = false;
  let revision = 0;
  let loadingRequest: { controller: AbortController; promise: Promise<void> } | undefined;
  let stream: StreamConnection | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;
  let queued: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(value: ServerState) => void>();
  function update(patch: Partial<ServerState>) { state = {...state, ...patch}; listeners.forEach(listener => listener(state)); }
  async function request(path: string, controller: AbortController, method = 'GET'): Promise<unknown> {
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(base + path, {method, signal: controller.signal, headers: {Accept: 'application/json'}, cache: 'no-store'});
      if (!response.ok) throw new Error('서버 요청 실패 (HTTP ' + response.status + ')');
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function invalidate() {
    revision++;
    loadingRequest?.controller.abort();
    loadingRequest = undefined;
  }
  function queueRefresh() {
    if (!active || queued) return;
    queued = setTimeout(() => { queued = undefined; void refresh(); }, 400);
  }
  function applyReset() {
    invalidate(); rows = [];
    update({ snapshot: {commands: [], events: []}, resetVersion: state.resetVersion + 1,
      stats: state.stats ? {...state.stats, processedCount: 0, detectionCount: 0, severityCounts: {CRITICAL:0,HIGH:0,MEDIUM:0}, ruleCounts:{}} : null });
  }
  function releaseRead(controller: AbortController) {
    if (loadingRequest?.controller === controller) loadingRequest = undefined;
  }
  async function refresh(): Promise<void> {
    if (loadingRequest) return loadingRequest.promise;
    const currentRevision = revision;
    const controller = new AbortController();
    update({loading:true});
    const promise = (async () => {
      try {
        const [eventsJson, statsJson] = await Promise.all([request('/events?limit=' + EVENT_LIMIT, controller), request('/stats', controller)]);
        const events = parseEvents(eventsJson);
        const stats = parseStats(statsJson);
        if (currentRevision !== revision || controller.signal.aborted) return;
        rows = events;
        update({snapshot: snapshotFromEvents(rows), stats, loading:false, error:'', lastUpdated:new Date().toISOString()});
      } catch (error) {
        if (currentRevision !== revision) return;
        update({loading:false, error: controller.signal.aborted ? '서버 응답 시간이 초과되었습니다. 마지막 수신 데이터를 표시합니다.' : '데이터 갱신 실패: ' + (error instanceof Error ? error.message : '네트워크 연결을 확인해 주세요.')});
      } finally { releaseRead(controller); }
    })();
    loadingRequest = {controller, promise};
    return promise;
  }
  async function control(action: ReplayAction): Promise<ReplayResponse> {
    if (state.actionPending) throw new Error('다른 재생 제어 요청이 진행 중입니다.');
    if (!['start','stop','reset'].includes(action)) throw new Error('지원하지 않는 제어입니다.');
    update({actionPending:action});
    invalidate();
    try {
      const result = parseReplay(await request('/replay/' + action, new AbortController(), 'POST'));
      if (action === 'reset') applyReset();
      update({lastControl:{...result, action, at:new Date().toISOString()}});
      return result;
    } catch (error) {
      throw new Error('제어 결과를 확인하지 못했습니다. 통계를 확인한 뒤 다시 시도해 주세요. ' + (error instanceof Error ? error.message : '연결 오류'));
    } finally {
      update({actionPending:null});
      void refresh();
    }
  }
  function connect() {
    if (active) return disconnect;
    active = true;
    void refresh();
    poll = setInterval(() => { void refresh(); }, options.pollMs ?? 3000);
    update({stream:'connecting'});
    try {
      const connection = createStream(base + '/stream');
      stream = connection;
      const valid = () => active && stream === connection;
      connection.addEventListener('open', () => {
        if (!valid()) return;
        update({stream:'connected'});
        invalidate(); void refresh();
      });
      connection.addEventListener('error', () => {
        if (!valid()) return;
        update({stream:'reconnecting'});
      });
      connection.addEventListener('detection', event => {
        if (!valid()) return;
        try {
          const detection = parseEvent(JSON.parse(event.data ?? ''));
          invalidate();
          rows = mergeEvents(rows, [detection]);
          update({snapshot:snapshotFromEvents(rows), stream:'connected'});
          queueRefresh();
        } catch {
          update({error:'실시간 탐지 형식을 읽지 못했습니다. 목록을 다시 조회합니다.'});
          queueRefresh();
        }
      });
      connection.addEventListener('reset', () => {
        if (!valid()) return;
        applyReset(); queueRefresh();
      });
    } catch { update({stream:'unavailable'}); }
    return disconnect;
  }
  function disconnect() {
    active = false;
    stream?.close(); stream = undefined;
    if (poll) clearInterval(poll);
    if (queued) clearTimeout(queued);
    poll = undefined; queued = undefined;
    invalidate();
  }
  return { getState:() => state, subscribe(listener: (value: ServerState) => void) {listeners.add(listener); return () => {listeners.delete(listener);};}, connect, disconnect, refresh, control };
}

