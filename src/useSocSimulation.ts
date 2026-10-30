import { useEffect, useState } from 'react';
import type { Snapshot } from './model.ts';
import { advanceSimulationFrame, createSimulationFrame } from './socSimulation.ts';
import type { SimulationFrame } from './socSimulation.ts';

export function useSocSimulation(snapshot:Snapshot,active:boolean,resetVersion:number) {
  const [frame,setFrame]=useState<SimulationFrame>({values:{},history:{},clock:0});
  useEffect(()=>setFrame({values:{},history:{},clock:0}),[resetVersion]);
  useEffect(()=>{
    if(!active)return;
    setFrame(previous=>Object.keys(previous.values).length?advanceSimulationFrame(previous,snapshot,0):createSimulationFrame(snapshot));
    let last=performance.now();
    const timer=setInterval(()=>{
      const now=performance.now(),seconds=(now-last)/1000;last=now;
      setFrame(previous=>advanceSimulationFrame(previous,snapshot,seconds));
    },250);
    return()=>clearInterval(timer);
  },[active,snapshot,resetVersion]);
  return frame;
}
