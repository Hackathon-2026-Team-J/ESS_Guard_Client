import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelemetryClient, parseLatestTelemetry, validSoc } from '../src/telemetry.ts';

const sample={id:1,deviceId:'ESS-01',measuredAt:'2026-10-31T14:32:00',actualKw:-50,soc:63.5};
const response=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
test('SOC 0 and 100 are measurements, not missing values; latest sample wins deterministically',()=>{
  const readings=parseLatestTelemetry([{...sample,soc:0},{...sample,id:2,soc:100},{...sample,id:3,measuredAt:'2026-10-31T14:31:00',soc:40}]);
  assert.equal(readings[0].id,2);assert.equal(readings[0].soc,100);
  assert.equal(readings[0].measuredAt,'2026-10-31T14:32:00.000+09:00');
  assert.equal(validSoc(0),true);assert.equal(validSoc(100),true);
  for(const soc of [undefined,-1,101,NaN,Infinity])assert.equal(validSoc(soc),false);
  assert.equal(parseLatestTelemetry([{...sample,soc:0}])[0].soc,0);
  assert.equal(parseLatestTelemetry([{...sample,soc:130}])[0].soc,130,'invalid-range evidence is not silently clamped');
});
test('invalid telemetry payloads cannot become gauge values',()=>{
  for(const data of [null,{},[{...sample,soc:'63'}],[{...sample,soc:null}],[{...sample,actualKw:null}],[{...sample,deviceId:''}],[{...sample,measuredAt:'invalid'}]])assert.throws(()=>parseLatestTelemetry(data));
});
test('missing API stays explicitly unavailable and failure preserves last readings',async()=>{
  let mode='unsupported';
  const client=createTelemetryClient({fetcher:async()=>mode==='unsupported'?new Response('',{status:404}):mode==='error'?new Response('',{status:503}):response(mode==='empty'?[]:[sample])});
  await client.refresh();assert.match(client.getState().error,/실측 조회 미지원/);assert.deepEqual(client.getState().readings,[]);
  assert.equal(client.getState().unsupported,true);
  mode='ready';await client.refresh();assert.equal(client.getState().readings[0].soc,63.5);
  assert.equal(client.getState().unsupported,false);
  mode='error';await client.refresh();assert.match(client.getState().error,/503/);assert.equal(client.getState().readings[0].soc,63.5);
  mode='empty';await client.refresh();assert.equal(client.getState().error,'');assert.deepEqual(client.getState().readings,[]);
});
test('reset cannot be undone by an old in-flight telemetry response',async()=>{
  let release:((response:Response)=>void)|undefined,calls=0;
  const client=createTelemetryClient({fetcher:async()=>{calls++;return calls===1?new Promise<Response>(resolve=>{release=resolve;}):response([]);}});
  const old=client.refresh();client.reset();await client.refresh();
  release!(response([sample]));await old;
  assert.deepEqual(client.getState().readings,[]);
});
test('telemetry timeout releases the request and allows retry',async()=>{
  let fail=true;
  const client=createTelemetryClient({timeoutMs:10,fetcher:async(_url,options)=>fail?new Promise<Response>((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(new Error('aborted')))):response([sample])});
  await client.refresh();assert.match(client.getState().error,/시간 초과/);
  fail=false;await client.refresh();assert.equal(client.getState().readings[0].soc,63.5);
});
test('confirmed unsupported endpoint is not repeatedly polled',async()=>{
  let calls=0;
  const client=createTelemetryClient({pollMs:5,fetcher:async()=>{calls++;return new Response('',{status:404});}});
  const disconnect=client.connect();
  try{await new Promise(resolve=>setTimeout(resolve,35));assert.equal(calls,1);}finally{disconnect();}
});
