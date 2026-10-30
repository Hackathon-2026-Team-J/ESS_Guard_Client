import type { DetectionEvent } from './model.ts';
export const alertKey=(event:DetectionEvent)=>`${event.id}|${event.detectedAt}|${event.deviceId??''}|${event.ruleId}`;
export const severityRank={CRITICAL:3,HIGH:2,MEDIUM:1};
export const severityLabel={CRITICAL:'긴급 경고',HIGH:'높은 위험',MEDIUM:'주의 경고'};
export function unreadAlerts(events:DetectionEvent[],read:ReadonlySet<string>) {
  return [...new Map(events.map(event=>[alertKey(event),event])).values()].filter(event=>!read.has(alertKey(event)))
    .sort((a,b)=>severityRank[b.severity]-severityRank[a.severity]||Date.parse(b.detectedAt)-Date.parse(a.detectedAt)||b.id-a.id);
}
export function batteryStatus(soc:number|undefined,events:DetectionEvent[],stale=false) {
  const warning=unreadAlerts(events,new Set())[0];
  if(warning)return {tone:warning.severity.toLowerCase(),label:severityLabel[warning.severity]};
  if(soc===undefined)return {tone:'unknown',label:'잔량 미수신'};
  if(stale)return {tone:'stale',label:'이전 수신값'};
  if(soc<=20)return {tone:'low',label:'잔량 부족'};
  return {tone:'charge',label:'잔량 표시'};
}
