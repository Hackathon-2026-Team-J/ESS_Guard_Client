import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePower } from '../src/power.ts';
import { createSimulationFrame, advanceSimulationFrame } from '../src/socSimulation.ts';

test('virtual history contains one hour and rolls without unbounded growth',()=>{
  const snapshot={commands:[],events:[]};let frame=createSimulationFrame(snapshot);
  assert.equal(frame.history['ESS-01'].length,61);assert.equal(frame.clock,3600000);
  assert.equal(frame.history['ESS-01'][0].at,0);
  for(let i=0;i<300;i++)frame=advanceSimulationFrame(frame,snapshot,.25);
  assert.ok(frame.history['ESS-01'].length<=61);
  assert.equal(frame.history['ESS-01'].at(-1)!.at-frame.history['ESS-01'][0].at,3600000);
  assert.ok(frame.history['ESS-01'].every(p=>Number.isFinite(p.actualKw)));
});
test('fleet power separates charge and discharge and omits partial coverage',()=>{
  const point=(at:number,actualKw:number)=>({at,actualKw,plannedKw:0,commandKw:0,soc:50});
  assert.deepEqual(aggregatePower({a:[point(0,30),point(60000,40)],b:[point(60000,-20)]}),[{at:60000,charge:20,discharge:40,count:2}]);
});
test('simulated SOC and power obey the declared 500 kWh / 120x relation except R4 scenario',()=>{
  const snapshot={commands:[],events:[]},first=createSimulationFrame(snapshot),next=advanceSimulationFrame(first,snapshot,.25);
  for(const id of Object.keys(next.values))assert.ok(Math.abs(next.values[id].soc-first.values[id].soc+next.values[id].actualKw*.25/150)<1e-9);
});
