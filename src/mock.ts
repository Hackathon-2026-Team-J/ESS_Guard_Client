import type { DetectionEvent, Role, Snapshot, RuleId, Severity } from './model.ts';
import { ruleName } from './model.ts';

const definitions: [number, number, RuleId, Severity][] = [
  [8010, 960, 'R1', 'CRITICAL'], [8011, 960, 'R3', 'MEDIUM'],
  [8012, 975, 'R2', 'HIGH'], [8013, 975, 'R4', 'HIGH'],
  [8014, 990, 'R3', 'MEDIUM'], [8015, 990, 'R5', 'HIGH'],
  [8016, 1005, 'R4', 'HIGH'], [8017, 1020, 'R5', 'HIGH'],
  [8018, 1030, 'R1', 'CRITICAL'], [8019, 1030, 'R4', 'HIGH'],
  [8020, 1035, 'R3', 'MEDIUM'], [8021, 1042, 'R2', 'HIGH'],
  [8022, 1042, 'R3', 'MEDIUM'], [8023, 1043, 'R1', 'CRITICAL'],
];
export function createFixture(): Snapshot {
  const commands = Array.from({ length: 120 }, (_, index) => {
    const id = index < 100 ? 944 + index : 1101 + index - 100;
    const anomalous = definitions.some(item => item[1] === id);
    const unknown = [960, 1030, 1043].includes(id);
    const monitor = [975, 1042].includes(id);
    const role: Role = unknown ? 'UNKNOWN' : monitor ? 'MONITOR' : 'OPERATOR';
    return { id, issuedAt: new Date(Date.UTC(2026, 9, 31, 14, 30, 12 + index)).toISOString().replace('.000Z', '+09:00'),
      clientId: unknown ? 'EXT-09' : monitor ? 'MON-01' : 'OP-01', role, deviceId: 'ESS-01',
      functionCode: anomalous ? 6 : index % 2 ? 3 : 4, registerAddress: 120,
      value: anomalous ? 150 : 40, essState: 'RUNNING' as const, labeledAnomaly: anomalous, processed: index < 100 };
  });
  const events: DetectionEvent[] = definitions.map(([id, commandLogId, ruleId, severity], index) => ({
    id, commandLogId, ruleId, severity,
    message: ruleId === 'R2' ? '읽기 전용 역할에서 쓰기 명령 발생' : ruleId === 'R3' ? '설정된 레지스터 값 범위 초과' : ruleName(ruleId) + ' 규칙 위반',
    detectedAt: `2026-10-31T14:32:${String(index >= 11 ? index === 13 ? 14 : 13 : index).padStart(2, '0')}+09:00`,
  }));
  return { commands, events };
}
export function resetSnapshot(snapshot: Snapshot): Snapshot {
  return { commands: snapshot.commands.map(command => ({ ...command, processed: false })), events: [] };
}
export function advanceReplay(snapshot: Snapshot, detectedAt: string): Snapshot {
  const next = snapshot.commands.filter(command => !command.processed).sort((a, b) => a.id - b.id)[0];
  if (!next) return snapshot;
  const additions = createFixture().events.filter(event => event.commandLogId === next.id)
    .map(event => ({ ...event, detectedAt }));
  return { commands: snapshot.commands.map(command => command.id === next.id ? { ...command, processed: true } : command),
    events: [...snapshot.events, ...additions.filter(event => !snapshot.events.some(existing => existing.id === event.id))] };
}

export interface GuardDataSource {
  load(): Promise<Snapshot>;
  reset(): Promise<Snapshot>;
  subscribe(listener: (snapshot: Snapshot) => void): () => void;
}

export function createMockSource(): GuardDataSource {
  let snapshot = createFixture();
  let timer: ReturnType<typeof setInterval> | undefined;
  let seconds = 0;
  const listeners = new Set<(snapshot: Snapshot) => void>();
  const notify = () => listeners.forEach(listener => listener(structuredClone(snapshot)));
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ess-guard-mock-reset') : undefined;
  function reset() {
    if (timer) clearInterval(timer);
    seconds = 0;
    snapshot = resetSnapshot(snapshot);
    notify();
    timer = setInterval(() => {
      const time = new Date(Date.UTC(2026, 9, 31, 14, 32, 15 + seconds++)).toISOString().replace('.000Z', '+09:00');
      snapshot = advanceReplay(snapshot, time);
      notify();
      if (snapshot.commands.every(command => command.processed)) clearInterval(timer);
    }, 1000);
  }
  if (channel) channel.onmessage = event => { if (event.data === 'reset') reset(); };
  return {
    async load() { return structuredClone(snapshot); },
    async reset() { reset(); channel?.postMessage('reset'); return structuredClone(snapshot); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
