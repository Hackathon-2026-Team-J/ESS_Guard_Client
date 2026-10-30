import type { DetectionEvent, Snapshot } from './model.ts';
import type { TelemetryState } from './telemetry.ts';
import { deviceForEvent, deviceIds } from './dashboard.ts';

export interface SimulatedSoc { soc:number; velocity:number; age:number; eventKey:string; label:string }
export type SocSimulation = Record<string,SimulatedSoc>;
export const shouldSimulateSoc=(state:TelemetryState)=>state.unsupported&&state.readings.length===0;
const descriptions:Record<string,string>={R1:'R1 방향 반전',R2:'R2 변화 속도 증가',R3:'R3 반복 방향 전환',R4:'R4 불규칙 변화'};

// Accelerated visual scenarios, never reconstructed measurements or verdicts.
// A stable device seed avoids random jumps when events refresh or cards paginate.
export function advanceSocSimulation(previous:SocSimulation,snapshot:Snapshot,seconds:number):SocSimulation {
  const dt=Math.max(0,Math.min(1,seconds)),latest=new Map<string,DetectionEvent>();
  for(const event of snapshot.events){
    const device=deviceForEvent(event,snapshot),old=latest.get(device);
    if(device&&(!old||Date.parse(event.detectedAt)>Date.parse(old.detectedAt)||event.detectedAt===old.detectedAt&&event.id>old.id))latest.set(device,event);
  }
  return Object.fromEntries(deviceIds(snapshot).map(device=>{
    const seed=[...device].reduce((value,char)=>(value*31+char.charCodeAt(0))>>>0,0),direction=seed%2?1:-1;
    const event=latest.get(device),eventKey=event?`${event.id}:${event.ruleId}:${event.detectedAt}`:'';
    const old=previous[device]??{soc:40+(seed*17)%41,velocity:direction*.18,age:0,eventKey,label:''};
    const age=(old.eventKey===eventKey?old.age:0)+dt;
    let target=direction*(.15+seed%7*.02);
    if(event?.ruleId==='R1')target=-direction*.4;
    if(event?.ruleId==='R2')target=direction*.95;
    if(event?.ruleId==='R3')target=Math.cos(age/2)*.9;
    if(event?.ruleId==='R4')target=Math.sin(age/4+seed%5)*1.6+direction*.35;
    // Ease both direction changes and the return from either display boundary.
    if(old.soc<8)target=Math.abs(target)+.2;
    if(old.soc>92)target=-Math.abs(target)-.2;
    const velocity=old.velocity+(target-old.velocity)*(1-Math.exp(-dt*1.8));
    const soc=Math.max(0,Math.min(100,old.soc+velocity*dt));
    return [device,{soc,velocity,age,eventKey,label:event&&descriptions[event.ruleId]||'기본 충·방전 흐름'}];
  }));
}
