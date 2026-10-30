import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerClient, parseEvent, parseEvents, snapshotFromEvents } from '../src/api.ts';
import type { StreamConnection } from '../src/api.ts';
import { defaultFilters, eventStats, groupEvents, physicalEvents, relatedEvents, selectEvents } from '../src/model.ts';

const measurement = {id:50,ruleId:'R4',severity:'HIGH',message:'SOC 변화 불일치: 예상 -2.00%p, 실제 -3.00%p',
  detectedAt:'2026-11-07T09:06:00',deviceId:'ESS-02',commandLogId:null,telemetryId:12,
  clientId:null,role:null,functionCode:null,registerAddress:null,value:null,essState:null};
const command = {...measurement,id:51,ruleId:'R2',commandLogId:12,telemetryId:null,clientId:'EMS-01',
  role:'OPERATOR',functionCode:6,registerAddress:11,value:-130};
const filters = {...defaultFilters,date:''};
const json = (data:unknown)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const stats = {processedCount:1,totalCount:141,detectionCount:2,labeledAnomalyCount:30,severityCounts:{HIGH:2},ruleCounts:{R2:1,R4:1}};

test('mixed command and telemetry responses preserve both without synthetic commands',()=>{
  const snapshot=snapshotFromEvents(parseEvents([measurement,command]));
  assert.equal(snapshot.events.length,2);
  assert.equal(snapshot.commands.length,1);
  assert.equal(snapshot.commands[0].id,12);
  assert.equal(snapshot.commands[0].value,-130);
  assert.equal(snapshot.events.find(e=>e.id===50)?.commandLogId,null);
  assert.equal(snapshot.events.find(e=>e.id===50)?.telemetryId,12);
  assert.equal(eventStats(snapshot.events).commands,1);
});

test('telemetry device/date filtering works without a command and client search excludes telemetry',()=>{
  const snapshot=snapshotFromEvents(parseEvents([measurement,command]));
  assert.equal(selectEvents(snapshot,{...filters,device:'ESS-02'}).length,2);
  assert.deepEqual(selectEvents(snapshot,{...filters,device:'ESS-02',rule:'R4',date:'2026-11-07'}).map(e=>e.id),[50]);
  assert.deepEqual(selectEvents(snapshot,{...filters,client:'ems-01'}).map(e=>e.id),[51]);
  assert.equal(selectEvents(snapshot,{...filters,date:'2026-11-08'}).length,0);
});

test('source grouping separates identical command/measurement IDs and unrelated null commands',()=>{
  const rows=parseEvents([measurement,command,{...measurement,id:52,telemetryId:13},{...measurement,id:53}]);
  const groups=groupEvents(rows);
  assert.equal(groups.length,3);
  assert.equal(groups.find(group=>group.key==='telemetry:12')?.events.length,2);
  assert.equal(groups.find(group=>group.key==='command:12')?.events.length,1);
  assert.deepEqual(relatedEvents(parseEvent(measurement),rows).map(event=>event.id),[53,50]);
  const unknown=parseEvent({...measurement,id:55,telemetryId:null});
  assert.equal(relatedEvents(unknown,[unknown,parseEvent({...measurement,id:56,telemetryId:null})]).length,1);
});

test('physical feed excludes historical command-based R4 and unknown rules',()=>{
  const rows=parseEvents([measurement,{...command,ruleId:'R4'},{...measurement,id:60,ruleId:'R6'}]);
  assert.deepEqual(physicalEvents(rows).map(event=>event.id),[50]);
  assert.equal(rows.find(event=>event.id===60)?.ruleId,'R6');
});

test('blank historical device and nullable command metadata stay unknown',()=>{
  const snapshot=snapshotFromEvents(parseEvents([{...measurement,commandLogId:44,telemetryId:null,deviceId:''}]));
  assert.equal(snapshot.commands[0].deviceId,'');
  assert.equal(snapshot.commands[0].clientId,null);
  assert.equal(snapshot.commands[0].functionCode,null);
  assert.equal(selectEvents(snapshot,{...filters,device:'ESS-01'}).length,0);
});

test('HTTP mixed response updates global stats instead of rejecting telemetry events',async()=>{
  const client=createServerClient({fetcher:async url=>json(String(url).endsWith('/stats')?stats:[measurement,command])});
  await client.refresh();
  assert.equal(client.getState().error,'');
  assert.equal(client.getState().stats?.totalCount,141);
  assert.equal(client.getState().snapshot.events.length,2);
  assert.equal(client.getState().snapshot.commands.length,1);
  client.disconnect();
});

test('telemetry SSE merges with command events and reset clears both sources',async()=>{
  const callbacks=new Map<string,(event:{data?:string})=>void>();
  let closed=false;
  const stream:StreamConnection={addEventListener:(name,callback)=>{callbacks.set(name,callback);},close:()=>{closed=true;}};
  const client=createServerClient({streamFactory:()=>stream,pollMs:60000,fetcher:async url=>json(String(url).endsWith('/stats')?stats:[command])});
  client.connect(); await client.refresh();
  callbacks.get('detection')?.({data:JSON.stringify(measurement)});
  callbacks.get('detection')?.({data:JSON.stringify(measurement)});
  assert.equal(client.getState().error,'');
  assert.equal(client.getState().snapshot.events.length,2);
  assert.equal(client.getState().snapshot.commands.length,1);
  assert.equal(physicalEvents(client.getState().snapshot.events).length,1);
  callbacks.get('reset')?.({data:'reset'});
  assert.deepEqual(client.getState().snapshot,{commands:[],events:[]});
  assert.equal(client.getState().stats?.detectionCount,0);
  client.disconnect(); assert.equal(closed,true);
});

