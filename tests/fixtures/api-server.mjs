// Isolated, in-memory API fixture for client QA. Never connects to AWS.
import { createServer } from 'node:http';
const clients = new Set();
const requests = [];
let running = false;
let processed = 100;
let nextId = 13;
let failing = false;
let rows = Array.from({length:9}, (_, index) => ({
  id:index+1, commandLogId:1042+index, telemetryId:null, ruleId:'R2', severity:'HIGH',
  message:'테스트 전용: 계획 -100kW 대비 명령 -130kW (편차 30.0%)', detectedAt:'2026-11-07T09:01:'+String(index).padStart(2,'0'),
  clientId:index%2 ? 'MON-02' : 'MON-01', role:'MONITOR', deviceId:index%2 ? 'ESS-02' : 'ESS-01',
  functionCode:16, registerAddress:11, value:-130, essState:'RUNNING',
}));
const sample = {...rows[0]};
const physicalSample={...sample,id:10,ruleId:'R4',commandLogId:null,telemetryId:12,deviceId:'ESS-03',clientId:null,role:null,functionCode:null,registerAddress:null,value:null,essState:null,message:'SOC 변화 불일치: 예상 -2.00%p, 실제 -3.00%p'};
rows.push(physicalSample,{...physicalSample,id:11,telemetryId:13},{...physicalSample,id:12,telemetryId:12});
function ruleCounts(){return rows.reduce((counts,row)=>{counts[row.ruleId]=(counts[row.ruleId]??0)+1;return counts;},{});}
function emit(name, data) {
  for(const response of clients) response.write('event: '+name+'\ndata: '+(typeof data==='string' ? data : JSON.stringify(data))+'\n\n');
}
function reply(response, status, body) {
  response.writeHead(status, {'Content-Type':'application/json'});
  response.end(JSON.stringify(body));
}
const server=createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1');
  if(url.pathname==='/__fixture/log') return reply(response,200,requests);
  if(url.pathname==='/__fixture/fail' && request.method==='POST'){failing=true; return reply(response,200,{failing});}
  if(url.pathname==='/__fixture/recover' && request.method==='POST'){failing=false; return reply(response,200,{failing});}
  if(url.pathname==='/__fixture/disconnect' && request.method==='POST'){for(const client of clients) client.end(); return reply(response,200,{});}
  requests.push({method:request.method,path:url.pathname,origin:request.headers.origin ?? null});
  if(request.headers.origin && request.method==='POST') return reply(response,403,{error:'Invalid CORS request'});
  if(failing && url.pathname!=='/api/stream') return reply(response,503,{error:'fixture offline'});
  if(url.pathname==='/api/stream' && request.method==='GET'){
    response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
    response.flushHeaders(); response.write(': fixture stream\n\n'); clients.add(response);
    request.on('close',()=>clients.delete(response)); return;
  }
  if(url.pathname==='/api/stats') return reply(response,200,{processedCount:processed,totalCount:230,detectionCount:rows.length,labeledAnomalyCount:30,severityCounts:rows.length ? {HIGH:rows.length} : {},ruleCounts:ruleCounts()});
  if(url.pathname==='/api/events') return reply(response,200,[...rows].sort((a,b)=>b.id-a.id).slice(0,Number(url.searchParams.get('limit') ?? 50)));
  if(request.method==='POST'){
    if(url.pathname==='/api/replay/start') running=true;
    else if(url.pathname==='/api/replay/stop') running=false;
    else if(url.pathname==='/api/replay/reset'){running=false;processed=0;rows=[];emit('reset','reset');}
    else return reply(response,404,{});
    return reply(response,200,{running,processedCount:processed});
  }
  reply(response,404,{});
});
const timer=setInterval(()=>{
  if(!running) return;
  if(processed>=230){running=false;return;}
  processed++;
  if(processed%5===0){
    const detection={...(processed%10===0?physicalSample:sample),id:nextId++,...(processed%10===0?{telemetryId:3000+processed}:{commandLogId:2000+processed}),detectedAt:new Date(Date.now()+9*3600000).toISOString().slice(0,23)};
    rows.push(detection); emit('detection',detection);
  }
},300);
server.listen(Number(process.env.ESS_FIXTURE_PORT ?? 8181),'127.0.0.1',()=>console.log('Isolated ESS API fixture: http://127.0.0.1:'+server.address().port));
function close(){clearInterval(timer);for(const client of clients) client.end();server.close(()=>process.exit(0));}
process.on('SIGINT',close);process.on('SIGTERM',close);

