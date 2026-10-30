import { useEffect, useState } from 'react';
import type { Snapshot } from './model.ts';
import { advanceSocSimulation } from './socSimulation.ts';
import type { SocSimulation } from './socSimulation.ts';

export function useSocSimulation(snapshot:Snapshot,active:boolean,resetVersion:number) {
  const [values,setValues]=useState<SocSimulation>({});
  useEffect(()=>setValues({}),[resetVersion]);
  useEffect(()=>{
    if(!active)return;
    setValues(previous=>advanceSocSimulation(previous,snapshot,0));
    let last=performance.now();
    const timer=setInterval(()=>{
      const now=performance.now(),seconds=(now-last)/1000;last=now;
      setValues(previous=>advanceSocSimulation(previous,snapshot,seconds));
    },250);
    return()=>clearInterval(timer);
  },[active,snapshot,resetVersion]);
  return values;
}
