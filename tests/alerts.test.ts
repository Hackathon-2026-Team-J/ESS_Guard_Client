import test from 'node:test';
import assert from 'node:assert/strict';
import { alertKey, unreadAlerts, batteryStatus } from '../src/alerts.ts';
import type { DetectionEvent } from '../src/model.ts';
const make=(id:number,severity:DetectionEvent['severity']):DetectionEvent=>({id,severity,deviceId:'ESS-01',ruleId:'R2',message:'경고',detectedAt:'2026-10-31T12:00:00+09:00',commandLogId:null});
test('unread warnings are deduplicated and prioritize severity over recency',()=>{
  const events=[make(3,'MEDIUM'),make(2,'HIGH'),make(1,'CRITICAL'),make(1,'CRITICAL')];
  assert.deepEqual(unreadAlerts(events,new Set()).map(e=>e.id),[1,2,3]);
  assert.deepEqual(unreadAlerts(events,new Set([alertKey(events[2])])).map(e=>e.id),[2,3]);
  assert.notEqual(alertKey(events[0]),alertKey({...events[0],detectedAt:'2026-11-01T12:00:00+09:00'}));
});
test('battery warnings take precedence, with separate low-charge and unavailable states',()=>{
  assert.equal(batteryStatus(90,[make(1,'CRITICAL')]).tone,'critical');
  assert.equal(batteryStatus(10,[make(2,'HIGH')]).tone,'high');
  assert.equal(batteryStatus(50,[make(3,'MEDIUM')]).tone,'medium');
  assert.equal(batteryStatus(0,[]).tone,'low');
  assert.equal(batteryStatus(20,[]).tone,'low');
  assert.equal(batteryStatus(21,[]).label,'잔량 표시');
  assert.equal(batteryStatus(undefined,[]).tone,'unknown');
  assert.equal(batteryStatus(30,[],true).tone,'stale');
});
