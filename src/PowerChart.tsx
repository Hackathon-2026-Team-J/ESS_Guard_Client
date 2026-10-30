import { useState } from 'react';
import type { PowerPoint } from './socSimulation.ts';
import { aggregatePower } from './power.ts';

type Series={label:string;color:string;values:number[];dashed?:boolean};
export function PowerChart({history,device,soc=false}:{history:Record<string,PowerPoint[]>;device?:string;soc?:boolean}) {
  const [hover,setHover]=useState<number|null>(null);
  const points=device?(history[device]??[]):[],fleet=device?[]:aggregatePower(history),length=device?points.length:fleet.length;
  const series:Series[]=device?soc?[{label:'SOC',color:'#178875',values:points.map(p=>p.soc)}]:[
    {label:'계획',color:'#687385',values:points.map(p=>p.plannedKw),dashed:true},
    {label:'명령',color:'#377cce',values:points.map(p=>p.commandKw)},
    {label:'실제(모의)',color:'#d57b23',values:points.map(p=>p.actualKw)}
  ]:[{label:'방전',color:'#178875',values:fleet.map(p=>p.discharge)},{label:'충전',color:'#377cce',values:fleet.map(p=>p.charge)}];
  if(!length)return <div className="d-power-empty">시뮬레이션 시계열 준비 중</div>;
  const values=series.flatMap(s=>s.values),lo=soc?0:Math.min(0,...values),hi=soc?100:Math.max(10,...values),pad=soc?0:Math.max(5,(hi-lo)*.12),min=lo-pad,max=hi+pad;
  const at=(index:number)=>device?points[index].at:fleet[index].at,end=at(length-1);
  const x=(index:number)=>48+(at(index)-(end-3600000))/3600000*574,y=(value:number)=>104-(value-min)/(max-min)*88;
  const index=Math.min(length-1,hover??length-1),unit=soc?'%':'kW';
  return <div className="d-power-chart"><div className="d-power-legend"><span className="d-simulation-label">시뮬레이션 · 가상 1시간</span>{series.map(s=><span key={s.label}><i style={{background:s.color}}/>{s.label}</span>)}</div>
    <svg viewBox="0 0 640 132" preserveAspectRatio="none" role="img" aria-label={soc?'가상 SOC 추이':device?'시뮬레이션 계획·명령·실제 출력 비교':'시뮬레이션 통합 충·방전 추이'} onMouseMove={event=>{const box=event.currentTarget.getBoundingClientRect();setHover(Math.max(0,Math.min(length-1,Math.round(((event.clientX-box.left)/box.width*640-48)/574*(length-1)))));}} onMouseLeave={()=>setHover(null)}>
      {Array.from({length:5},(_,i)=>min+(max-min)*i/4).map(value=><g key={value}><line x1="48" x2="622" y1={y(value)} y2={y(value)} stroke="#e6ebf0"/><text x="40" y={y(value)+4} textAnchor="end">{value.toFixed(0)}</text></g>)}
      {series.map(s=><polyline key={s.label} data-series={s.label} fill="none" stroke={s.color} strokeWidth={s.dashed?3:1.8} strokeDasharray={s.dashed?'5 4':undefined} vectorEffect="non-scaling-stroke" points={s.values.map((value,i)=>`${x(i)},${y(value)}`).join(' ')}/>)}
      <line x1={x(index)} x2={x(index)} y1="12" y2="104" stroke="#8b96a6" strokeDasharray="2 3"/>{series.map(s=><circle key={s.label} cx={x(index)} cy={y(s.values[index])} r="3" fill={s.color}/>)}
      <text x="48" y="127">−60분</text><text x="335" y="127" textAnchor="middle">−30분</text><text x="622" y="127" textAnchor="end">가상 현재</text>
    </svg><div className="d-power-readout">{series.map(s=><span key={s.label} style={{color:s.color}}>{s.label} <b>{s.values[index].toFixed(1)}</b> {unit}</span>)}</div><label className="d-chart-scrubber">시점<input aria-label="차트 시점 선택" type="range" min="0" max={length-1} value={index} onChange={event=>setHover(Number(event.target.value))}/><span>가속 120배 · 실측 아님</span></label>
  </div>;
}
