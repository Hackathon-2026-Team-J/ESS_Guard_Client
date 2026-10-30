import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredDevices, detectionStatus, deviceIds, parseRoute, siteRoute, siteSnapshot } from '../src/dashboard.ts';
import type { DetectionEvent, Snapshot } from '../src/model.ts';

const event:DetectionEvent={id:1,commandLogId:9,ruleId:'R2',severity:'HIGH',message:'server evidence',detectedAt:'2026-11-07T09:00:00+09:00'};
const snapshot:Snapshot={commands:[{id:9,issuedAt:null,clientId:null,role:null,deviceId:'ESS-07',functionCode:16,registerAddress:11,value:-50,essState:null,labeledAnomaly:null,processed:null}],events:[event,{...event,id:2,commandLogId:null,telemetryId:9,deviceId:'ESS-03',ruleId:'R4'}]};
test('site deep links round-trip encoded identifiers without changing their scope',()=>{
  assert.deepEqual(parseRoute('#'+siteRoute('ESS/한글 07','physical')),{view:'site',device:'ESS/한글 07',tab:'physical'});
  assert.deepEqual(parseRoute('#site/ESS-03/unsupported'),{view:'site',device:'ESS-03',tab:'monitor'});
});
test('malformed and missing routes recover to the overview',()=>{
  for(const hash of ['#site','%','none','#site/%E0%A4%A','#incident/no','#incident/9007199254740992'])assert.deepEqual(parseRoute(hash),{view:'overview'});
  assert.deepEqual(parseRoute('#incident/12'),{view:'incident',eventId:12});
  assert.deepEqual(parseRoute('#replay'),{view:'replay'});
});
test('fleet preserves configured sites and adds received devices using command fallback',()=>{
  assert.deepEqual(deviceIds(snapshot),[...configuredDevices,'ESS-07']);
  assert.deepEqual(deviceIds({commands:[],events:[]}),configuredDevices);
});
test('site scoping distinguishes command and telemetry sources sharing an ID',()=>{
  assert.deepEqual(siteSnapshot(snapshot,'ESS-07').events.map(item=>item.id),[1]);
  assert.deepEqual(siteSnapshot(snapshot,'ESS-03').events.map(item=>item.id),[2]);
  assert.equal(siteSnapshot(snapshot,'ESS-03').commands.length,0);
  assert.equal(siteSnapshot(snapshot,'ESS-06').events.length,0);
});
test('no received event never implies healthy, and loading is not a zero result',()=>{
  assert.deepEqual(detectionStatus([],false),{label:'조회 대기',tone:'unknown'});
  assert.deepEqual(detectionStatus([],true),{label:'수신 탐지 없음',tone:'unknown'});
  assert.equal(detectionStatus([event],true).tone,'high');
  assert.equal(detectionStatus([event,{...event,id:3,severity:'CRITICAL'}],true).tone,'critical');
});
test('explicitly blank historical device identifiers remain unknown',()=>{
  const historical={...snapshot,events:[{...event,deviceId:''}]};
  assert.equal(siteSnapshot(historical,'ESS-07').events.length,0);
  assert.deepEqual(deviceIds(historical),configuredDevices);
});
