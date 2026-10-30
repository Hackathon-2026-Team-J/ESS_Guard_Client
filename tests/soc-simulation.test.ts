import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceSocSimulation, shouldSimulateSoc } from '../src/socSimulation.ts';
import type { Snapshot, DetectionEvent } from '../src/model.ts';

const event=(ruleId:string,id=1,deviceId='ESS-01'):DetectionEvent=>({id,deviceId,ruleId,severity:'HIGH',commandLogId:null,telemetryId:1,message:'검토 결과',detectedAt:'2026-10-31T12:00:00+09:00'});
test('simulation requires confirmed missing API and never replaces received real values',()=>{
  const state={readings:[],updatedAt:null,error:'',unsupported:false};
  assert.equal(shouldSimulateSoc(state),false);
  assert.equal(shouldSimulateSoc({...state,error:'HTTP 503'}),false);
  assert.equal(shouldSimulateSoc({...state,unsupported:true}),true);
  assert.equal(shouldSimulateSoc({...state,unsupported:true,readings:[{id:1,deviceId:'ESS-01',soc:0,actualKw:0,measuredAt:''}]}),false);
});
test('each rule changes the trajectory; refreshing or changing rules cannot jump SOC',()=>{
  const baseline:Snapshot={commands:[],events:[]},initial=advanceSocSimulation({},baseline,0),outcomes=[];
  for(const rule of ['R1','R2','R3','R4']){
    const snapshot={commands:[],events:[event(rule)]};
    let state=advanceSocSimulation(initial,snapshot,0);
    assert.equal(state['ESS-01'].soc,initial['ESS-01'].soc);
    for(let i=0;i<40;i++)state=advanceSocSimulation(state,snapshot,.25);
    outcomes.push(state['ESS-01'].soc);
    assert.match(state['ESS-01'].label,new RegExp(rule));
    assert.equal(advanceSocSimulation(state,snapshot,0)['ESS-01'].soc,state['ESS-01'].soc);
    assert.equal(advanceSocSimulation(state,{commands:[],events:[event('R4',2)]},0)['ESS-01'].soc,state['ESS-01'].soc);
  }
  assert.equal(new Set(outcomes).size,4);
});
test('latest event is scoped to its ESS and values stay bounded during a long session',()=>{
  const snapshot={commands:[],events:[event('R2',2),event('R1'),event('R4',3,'ESS-03')]};
  let state=advanceSocSimulation({},snapshot,0);
  assert.match(state['ESS-01'].label,/R2/);assert.match(state['ESS-03'].label,/R4/);
  assert.equal(state['ESS-02'].label,'기본 충·방전 흐름');
  for(let tick=0;tick<3600;tick++){
    const next=advanceSocSimulation(state,snapshot,1);
    for(const id of Object.keys(next)){
      assert.ok(next[id].soc>=0&&next[id].soc<=100);
      assert.ok(Math.abs(next[id].soc-state[id].soc)<=2,'bounded step without abrupt jumps');
    }
    state=next;
  }
  assert.deepEqual(advanceSocSimulation({},snapshot,0),advanceSocSimulation({},snapshot,0),'reset returns deterministic seeds');
});
