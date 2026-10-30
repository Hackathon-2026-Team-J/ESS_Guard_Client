import type { DetectionEvent, Snapshot } from './model.ts';
import type { TelemetryState } from './telemetry.ts';
import { deviceForEvent, deviceIds } from './dashboard.ts';

export interface SimulatedSoc { soc:number; velocity:number; age:number; eventKey:string; label:string; plannedKw:number; commandKw:number; actualKw:number }
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
    const baseVelocity=direction*(.15+seed%7*.02);
    const old=previous[device]??{soc:40+(seed*17)%41,velocity:direction*.18,age:0,eventKey,label:'',plannedKw:-baseVelocity*150,commandKw:-baseVelocity*150,actualKw:-baseVelocity*150};
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
    // 500 kWh model, accelerated 120x: dSOC/d(real second) = -kW / 150.
    // R4 intentionally makes SOC diverge from the modeled physical output.
    const plannedKw=-baseVelocity*150,commandKw=event?.ruleId==='R4'?plannedKw:-target*150;
    const actualKw=event?.ruleId==='R4'?old.actualKw+(commandKw-old.actualKw)*(1-Math.exp(-dt*1.8)):-velocity*150;
    return [device,{soc,velocity,age,eventKey,label:event&&descriptions[event.ruleId]||'기본 충·방전 흐름',plannedKw,commandKw,actualKw}];
  }));
}

export interface PowerPoint { at:number; plannedKw:number; commandKw:number; actualKw:number; soc:number }
export interface SimulationFrame { values:SocSimulation; history:Record<string,PowerPoint[]>; clock:number }
export function advanceSimulationFrame(frame:SimulationFrame,snapshot:Snapshot,seconds:number):SimulationFrame {
  const elapsed=Math.max(0,Math.min(1,seconds));
  const values=advanceSocSimulation(frame.values,snapshot,elapsed),clock=frame.clock+elapsed*120000;
  const sampleAt=Math.floor(clock/60000)*60000;
  const history=Object.fromEntries(Object.entries(values).map(([id,value])=>{
    const old=frame.history[id]??[],last=old.at(-1);
    const points=(!last||sampleAt>last.at)?[...old,{at:sampleAt,plannedKw:value.plannedKw,commandKw:value.commandKw,actualKw:value.actualKw,soc:value.soc}]:old;
    return [id,points.filter(point=>point.at>=sampleAt-3600000).slice(-61)];
  }));
  return {values,history,clock};
}
export function createSimulationFrame(snapshot:Snapshot):SimulationFrame {
  let frame:SimulationFrame={values:{},history:{},clock:0};
  frame=advanceSimulationFrame(frame,snapshot,0);
  // Explicitly generated virtual-hour history, not a recovered real measurement.
  for(let minute=0;minute<60;minute++)frame=advanceSimulationFrame(frame,snapshot,.5);
  return frame;
}
