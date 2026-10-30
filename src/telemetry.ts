import { normalizeTime } from './api.ts';

export interface LatestTelemetry { id:number; deviceId:string; measuredAt:string; actualKw:number; soc:number }
export interface TelemetryState { readings:LatestTelemetry[]; error:string; updatedAt:string|null; unsupported:boolean }
export function parseLatestTelemetry(raw:unknown):LatestTelemetry[] {
  if(!Array.isArray(raw))throw new Error('계측 응답이 배열이 아닙니다.');
  const devices=new Map<string,LatestTelemetry>();
  for(const row of raw){
    if(!row||typeof row!=='object'||!Number.isSafeInteger(row.id)||row.id<0||typeof row.deviceId!=='string'||!row.deviceId.trim()
      ||typeof row.soc!=='number'||!Number.isFinite(row.soc)||typeof row.actualKw!=='number'||!Number.isFinite(row.actualKw))throw new Error('계측 응답 형식이 올바르지 않습니다.');
    const reading={id:row.id,deviceId:row.deviceId,measuredAt:normalizeTime(row.measuredAt),actualKw:row.actualKw,soc:row.soc};
    const previous=devices.get(reading.deviceId);
    if(!previous||reading.measuredAt>previous.measuredAt||reading.measuredAt===previous.measuredAt&&reading.id>previous.id)devices.set(reading.deviceId,reading);
  }
  return [...devices.values()];
}
export const validSoc=(value:number|undefined)=>value!==undefined&&Number.isFinite(value)&&value>=0&&value<=100;

// Independent request state keeps an older server's missing endpoint from
// preventing statistics/events from updating. Never fill gauges with mock values.
export function createTelemetryClient({fetcher=fetch,pollMs=3000,timeoutMs=10000}: {fetcher?:typeof fetch;pollMs?:number;timeoutMs?:number}={}) {
  let state:TelemetryState={readings:[],error:'',updatedAt:null,unsupported:false};
  let generation=0,controller:AbortController|undefined,pending:Promise<void>|undefined,timer:ReturnType<typeof setInterval>|undefined;
  const listeners=new Set<(value:TelemetryState)=>void>();
  const update=(patch:Partial<TelemetryState>)=>{state={...state,...patch};listeners.forEach(listener=>listener(state));};
  function cancel(){generation++;controller?.abort();controller=undefined;pending=undefined;}
  function refresh():Promise<void>{
    if(pending)return pending;
    const current=generation,requestController=new AbortController();controller=requestController;
    const timeout=setTimeout(()=>requestController.abort(),timeoutMs);
    pending=(async()=>{
      try{
        const response=await fetcher('/api/telemetry/latest',{signal:requestController.signal,cache:'no-store',headers:{Accept:'application/json'}});
        if(response.status===404&&current===generation)update({unsupported:true});
        if(!response.ok)throw new Error(response.status===404?'SOC 조회 API 미지원 · 서버 업데이트 필요':'SOC 조회 실패 (HTTP '+response.status+')');
        const readings=parseLatestTelemetry(await response.json());
        if(current===generation&&!requestController.signal.aborted)update({readings,error:'',updatedAt:new Date().toISOString(),unsupported:false});
      }catch(error){if(current===generation)update({error:requestController.signal.aborted?'SOC 조회 시간 초과':error instanceof Error?error.message:'SOC 연결 오류'});}
      finally{clearTimeout(timeout);if(current===generation){pending=undefined;controller=undefined;}}
    })();return pending;
  }
  return {getState:()=>state,subscribe(listener:(value:TelemetryState)=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},refresh,
    reset(){cancel();update({readings:[],error:'',updatedAt:null,unsupported:false});void refresh();},
    connect(){void refresh();if(!timer)timer=setInterval(()=>void refresh(),pollMs);return()=>{if(timer)clearInterval(timer);timer=undefined;cancel();};}
  };
}
