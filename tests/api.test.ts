import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerClient, mergeEvents, normalizeTime, parseEvent, parseStats, snapshotFromEvents } from '../src/api.ts';
import type { StreamConnection } from '../src/api.ts';

const event = {id:7, commandLogId:42, ruleId:'R2', severity:'HIGH', message:'읽기 전용 쓰기',
  detectedAt:'2026-11-07T09:01:02', clientId:'MON-01', role:'MONITOR', deviceId:'ESS-02',
  functionCode:16, registerAddress:11, value:-20, essState:null};
const stats = {processedCount:100, totalCount:230, detectionCount:1, labeledAnomalyCount:30, severityCounts:{HIGH:1}, ruleCounts:{R2:1}};
const json = (value: unknown) => new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}});
class FakeStream implements StreamConnection {
  callbacks = new Map<string, ((event: {data?:string}) => void)[]>();
  closed = false;
  addEventListener(name: string, callback: (event:{data?:string})=>void) { this.callbacks.set(name,[...(this.callbacks.get(name) ?? []),callback]); }
  close() {this.closed=true;}
  emit(name:string, data?:unknown) {this.callbacks.get(name)?.forEach(callback=>callback({data:typeof data === 'string' ? data : JSON.stringify(data)}));}
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('server event preserves provided fields without inventing missing command fields', () => {
  const snapshot = snapshotFromEvents([parseEvent(event),parseEvent({...event,id:8})]);
  assert.equal(snapshot.events.length,2);
  assert.equal(snapshot.commands.length,1);
  assert.equal(snapshot.commands[0].issuedAt,null);
  assert.equal(snapshot.commands[0].processed,null);
  assert.equal(snapshot.commands[0].labeledAnomaly,null);
  assert.equal(snapshot.commands[0].value,-20);
  assert.equal(snapshot.events[0].detectedAt,'2026-11-07T09:01:02.000+09:00');
});

test('timestamps are normalized to KST and invalid DTOs fail explicitly', () => {
  assert.equal(normalizeTime('2026-11-07T00:01:02Z'),'2026-11-07T09:01:02.000+09:00');
  assert.equal(normalizeTime('2026-11-07T09:01:02.123456'),'2026-11-07T09:01:02.123+09:00');
  assert.throws(()=>parseEvent({...event,detectedAt:'not-a-date'}));
  assert.throws(()=>parseEvent({...event,id:'7'}));
  assert.throws(()=>parseEvent({...event,severity:'LOW'}));
  assert.throws(()=>parseStats({...stats,totalCount:-1}));
});

test('global stats keep label counts separate and omitted severity keys mean zero', () => {
  const result=parseStats(stats);
  assert.deepEqual(result.severityCounts,{CRITICAL:0,HIGH:1,MEDIUM:0});
  assert.equal(result.labeledAnomalyCount,30);
  assert.equal(result.detectionCount,1);
  assert.equal(result.processedCount,100);
});

test('SSE and HTTP events deduplicate by event ID and retain only newest 200', () => {
  const rows=Array.from({length:220},(_,index)=>parseEvent({...event,id:index+1}));
  const merged=mergeEvents(rows,[parseEvent({...event,id:220,message:'updated'})]);
  assert.equal(merged.length,200);
  assert.equal(merged[0].id,220);
  assert.equal(merged[0].message,'updated');
  assert.equal(merged.at(-1)?.id,21);
});

test('HTTP failure preserves last successful data and a later refresh recovers', async () => {
  let fail=false;
  const client=createServerClient({fetcher:async url=>fail ? new Response('failure',{status:503}) : json(String(url).endsWith('/stats') ? stats : [event])});
  await client.refresh();
  assert.equal(client.getState().snapshot.events.length,1);
  const last=client.getState().lastUpdated;
  fail=true; await client.refresh();
  assert.match(client.getState().error,/HTTP 503/);
  assert.equal(client.getState().lastUpdated,last);
  assert.equal(client.getState().stats?.totalCount,230);
  assert.equal(client.getState().snapshot.events.length,1);
  fail=false; await client.refresh();
  assert.equal(client.getState().error,'');
  client.disconnect();
});

test('initial failure remains unavailable rather than displaying mock data or zero stats', async () => {
  const client=createServerClient({fetcher:async()=>{throw new Error('offline');}});
  await client.refresh();
  assert.equal(client.getState().stats,null);
  assert.equal(client.getState().lastUpdated,null);
  assert.deepEqual(client.getState().snapshot,{commands:[],events:[]});
  assert.match(client.getState().error,/offline/);
  client.disconnect();
});

test('named SSE deduplicates detection and discards an older in-flight list response', async () => {
  const stream=new FakeStream();
  let release: ((value:Response)=>void) | undefined;
  const client=createServerClient({streamFactory:()=>stream,pollMs:60000,fetcher:async url=>
    String(url).endsWith('/stats') ? json(stats) : new Promise<Response>(resolve=>{release=resolve;})});
  client.connect();
  stream.emit('detection',event);
  stream.emit('detection',event);
  assert.equal(client.getState().snapshot.events.length,1);
  release?.(json([]));
  await tick();
  assert.equal(client.getState().snapshot.events[0].id,7);
  client.disconnect();
  assert.equal(stream.closed,true);
  stream.emit('detection',{...event,id:99});
  assert.equal(client.getState().snapshot.events[0].id,7);
});

test('SSE reset rejects stale HTTP results and clears selected-data generation', async () => {
  const stream=new FakeStream();
  let release: ((value:Response)=>void) | undefined;
  const client=createServerClient({streamFactory:()=>stream,pollMs:60000,fetcher:async url=>
    String(url).endsWith('/stats') ? json(stats) : new Promise<Response>(resolve=>{release=resolve;})});
  client.connect();
  stream.emit('detection',event);
  stream.emit('reset','reset');
  release?.(json([event]));
  await tick();
  assert.equal(client.getState().snapshot.events.length,0);
  assert.equal(client.getState().resetVersion,1);
  assert.equal(client.getState().stats,null);
  client.disconnect();
});

test('reconnect resyncs a reset missed offline and normal commands advance through polling', async () => {
  const stream=new FakeStream();
  let currentStats=stats;
  let rows=[event];
  const client=createServerClient({streamFactory:()=>stream,pollMs:10,fetcher:async url=>json(String(url).endsWith('/stats') ? currentStats : rows)});
  client.connect(); await client.refresh();
  stream.emit('error');
  assert.equal(client.getState().stream,'reconnecting');
  rows=[];
  currentStats={...stats,processedCount:0,detectionCount:0,severityCounts:{HIGH:0},ruleCounts:{R2:0}};
  stream.emit('open'); await client.refresh();
  assert.equal(client.getState().snapshot.events.length,0);
  currentStats={...currentStats,processedCount:10};
  await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>{unsubscribe(); reject(new Error('poll did not advance'));},500);
    const unsubscribe=client.subscribe(state=>{
      if(state.stats?.processedCount===10){clearTimeout(timeout); unsubscribe(); resolve();}
    });
  });
  assert.equal(client.getState().stats?.detectionCount,0);
  client.disconnect();
});

test('controls use bodyless POST, reject concurrent controls, and reset stays stopped', async () => {
  const requests: {url:string;method:string;body:unknown}[]=[];
  let release: ((value:Response)=>void) | undefined;
  let cleared=false;
  const client=createServerClient({fetcher:async (url,init)=>{
    requests.push({url:String(url),method:init?.method ?? 'GET',body:init?.body});
    if(String(url).endsWith('/replay/start')) return new Promise<Response>(resolve=>{release=resolve;});
    if(String(url).endsWith('/replay/reset')) {cleared=true; return json({running:false,processedCount:0});}
    return json(String(url).endsWith('/stats') ? {...stats,processedCount:cleared ? 0 : 100,detectionCount:cleared ? 0 : 1} : cleared ? [] : [event]);
  }});
  await client.refresh();
  const starting=client.control('start');
  await assert.rejects(client.control('stop'),/진행 중/);
  release?.(json({running:true,processedCount:100}));
  await starting; await client.refresh();
  assert.equal(client.getState().lastControl?.running,true);
  await client.control('reset'); await client.refresh();
  assert.equal(client.getState().lastControl?.running,false);
  assert.equal(client.getState().snapshot.events.length,0);
  assert.equal(client.getState().stats?.processedCount,0);
  assert.deepEqual(requests.filter(request=>request.method==='POST'),[
    {url:'/api/replay/start',method:'POST',body:undefined},
    {url:'/api/replay/reset',method:'POST',body:undefined},
  ]);
  client.disconnect();
});

test('POST failure does not fabricate a successful acknowledgment or automatically retry', async () => {
  let posts=0;
  const client=createServerClient({fetcher:async (url,init)=>{
    if(init?.method==='POST'){posts++; return new Response('failure',{status:500});}
    return json(String(url).endsWith('/stats') ? stats : [event]);
  }});
  await client.refresh();
  await assert.rejects(client.control('stop'),/제어 결과를 확인하지 못했습니다/);
  await client.refresh();
  assert.equal(posts,1);
  assert.equal(client.getState().lastControl,null);
  assert.equal(client.getState().actionPending,null);
  client.disconnect();
});

test('request timeout releases loading state and surfaces a retryable error', async () => {
  const client=createServerClient({timeoutMs:10,fetcher:async(_url,init)=>new Promise((_resolve,reject)=>{
    init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
  })});
  await client.refresh();
  assert.equal(client.getState().loading,false);
  assert.match(client.getState().error,/초과/);
  client.disconnect();
});

