import type { PowerPoint } from './socSimulation.ts';

export function aggregatePower(history:Record<string,PowerPoint[]>) {
  const buckets=new Map<number,{at:number;charge:number;discharge:number;count:number}>();
  for(const points of Object.values(history))for(const point of points){
    const row=buckets.get(point.at)??{at:point.at,charge:0,discharge:0,count:0};
    row.charge+=Math.max(0,-point.actualKw);row.discharge+=Math.max(0,point.actualKw);row.count++;buckets.set(point.at,row);
  }
  // Never present a partial fleet sum as if every displayed device contributed.
  return [...buckets.values()].filter(row=>row.count===Object.keys(history).length).sort((a,b)=>a.at-b.at);
}
