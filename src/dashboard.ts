import type { DetectionEvent, Snapshot } from './model.ts';

// Display configuration, not an online-device inventory. The current API only
// identifies devices that have emitted detections; keep configured sites visible.
export const configuredDevices = ['ESS-01', 'ESS-02', 'ESS-03', 'ESS-04', 'ESS-05', 'ESS-06'];
export const siteTabs = ['monitor', 'path', 'physical', 'logs'] as const;
export type SiteTab = typeof siteTabs[number];
export type View = 'overview' | 'detections' | 'path' | 'physical' | 'rules' | 'replay' | 'site' | 'incident';
export interface DashboardRoute { view: View; device?: string; tab?: SiteTab; eventId?: number }
const views: View[] = ['overview', 'detections', 'path', 'physical', 'rules', 'replay'];
export function parseRoute(hash: string): DashboardRoute {
  const [view, parameter, tab] = hash.replace(/^#/, '').split('/');
  if (view === 'site' && parameter) {
    try { return {view, device: decodeURIComponent(parameter), tab: siteTabs.includes(tab as SiteTab) ? tab as SiteTab : 'monitor'}; }
    catch { return {view: 'overview'}; }
  }
  if (view === 'incident' && /^\d+$/.test(parameter ?? '') && Number.isSafeInteger(Number(parameter))) return {view, eventId: Number(parameter)};
  return {view: views.includes(view as View) ? view as View : 'overview'};
}
export function siteRoute(device: string, tab: SiteTab = 'monitor') { return 'site/' + encodeURIComponent(device) + '/' + tab; }
export function deviceForEvent(event: DetectionEvent, snapshot: Snapshot) {
  return event.deviceId ?? snapshot.commands.find(command => command.id === event.commandLogId)?.deviceId ?? '';
}
export function deviceIds(snapshot: Snapshot, measuredDevices:string[] = []) {
  return [...new Set([...configuredDevices, ...measuredDevices, ...snapshot.events.map(event => deviceForEvent(event, snapshot)).filter(Boolean)])].sort();
}
export function siteSnapshot(snapshot: Snapshot, device: string): Snapshot {
  return {commands: snapshot.commands.filter(command => command.deviceId === device), events: snapshot.events.filter(event => deviceForEvent(event, snapshot) === device)};
}
export function detectionStatus(events: DetectionEvent[], ready: boolean) {
  if (!ready) return {label: '조회 대기', tone: 'unknown'};
  if (!events.length) return {label: '수신 탐지 없음', tone: 'unknown'};
  return {label: '탐지 이력', tone: events.some(event => event.severity === 'CRITICAL') ? 'critical' : events.some(event => event.severity === 'HIGH') ? 'high' : 'medium'};
}
