import { useEffect, useRef, useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import type { DetectionEvent } from './model.ts';
import { alertKey, severityLabel, unreadAlerts } from './alerts.ts';
const storageKey='ess-guard-read-alerts-v1';
function storedRead():Set<string>{try{return new Set(JSON.parse(sessionStorage.getItem(storageKey)||'[]'));}catch{return new Set();}}
export function useAlerts(events:DetectionEvent[],ready:boolean,resetVersion:number) {
  const [read,setRead]=useState(storedRead),[toast,setToast]=useState<DetectionEvent|null>(null),[records,setRecords]=useState<DetectionEvent[]>([]);
  const seen=useRef(new Set<string>()),initialized=useRef(false),generation=useRef(resetVersion),maxId=useRef(-1);
  useEffect(()=>{
    const reset=generation.current!==resetVersion;
    if(reset){generation.current=resetVersion;seen.current.clear();maxId.current=-1;initialized.current=false;setRead(new Set());setToast(null);}
    if(reset)setRecords([]);
    if(!ready)return;
    setRecords(previous=>[...new Map([...(reset?[]:previous.filter(event=>!read.has(alertKey(event)))),...events].map(event=>[alertKey(event),event])).values()]);
    const fresh=events.filter(event=>!seen.current.has(alertKey(event))&&event.id>maxId.current&&!read.has(alertKey(event)));
    if(initialized.current&&fresh.length)setToast(unreadAlerts(fresh,new Set())[0]);
    events.forEach(event=>seen.current.add(alertKey(event)));maxId.current=Math.max(maxId.current,...events.map(event=>event.id));initialized.current=true;
    // The server retains a rolling event window; do not grow browser memory indefinitely.
    if(seen.current.size>1000)seen.current=new Set(events.map(alertKey));
  },[events,ready,resetVersion,read]);
  useEffect(()=>{try{sessionStorage.setItem(storageKey,JSON.stringify([...read].slice(-1000)));}catch{}},[read]);
  const markRead=(items:DetectionEvent[])=>{setRead(previous=>new Set([...previous,...items.map(alertKey)]));setToast(current=>current&&items.some(item=>alertKey(item)===alertKey(current))?null:current);};
  return {unread:unreadAlerts(records,read),events:records,read,markRead,toast,dismissToast:()=>setToast(null)};
}
export function GlobalAlerts({alerts,events,onEvent,open,setOpen}:{alerts:ReturnType<typeof useAlerts>;events:DetectionEvent[];onEvent:(id:number)=>void;open:boolean;setOpen:(open:boolean)=>void}) {
  const drawer=useRef<HTMLElement>(null);
  const [hiddenSignature,setHiddenSignature]=useState<string|null>(null);
  useEffect(()=>{if(!open)return;const previous=document.activeElement as HTMLElement|null;drawer.current?.querySelector<HTMLButtonElement>('header button')?.focus();return()=>previous?.focus();},[open]);
  const first=alerts.unread[0],toast=alerts.toast;
  const popup=toast??first,signature=alerts.unread.map(alertKey).sort().join('~');
  const closePopup=()=>{setHiddenSignature(signature);alerts.dismissToast();};
  return <>
    <div className="alert-announcer" role="alert" aria-atomic="true">{toast?`새 경고: ${severityLabel[toast.severity]}, ${toast.deviceId||'설비 미제공'}, ${toast.message}`:''}</div>
    {first&&popup&&signature!==hiddenSignature&&<aside className={'d-warning-window severity-'+popup.severity.toLowerCase()} aria-label="전역 경고 메시지">
      <header><TriangleAlert size={20}/><strong>{toast?'새 경고 발생':'경고 발생'}</strong><button className="warning-count" onClick={()=>setOpen(true)}>미확인 {alerts.unread.length}건</button><button className="warning-close" aria-label="경고창 닫기" title="창만 닫습니다. 미확인 경고는 유지됩니다." onClick={closePopup}><X size={18}/></button></header>
      <div className="warning-identity"><b>{popup.deviceId||'설비 미제공'}</b><span>{popup.severity} · {severityLabel[popup.severity]}</span></div>
      <p>{popup.ruleId} · {popup.message}</p><small>{popup.detectedAt.slice(11,19)} KST · 탐지 확인 필요</small>
      <footer><button onClick={()=>onEvent(popup.id)}>상세 근거 보기</button><button onClick={()=>alerts.markRead([popup])}>읽음 처리</button></footer>
    </aside>}
    {open&&<div className="alert-drawer-backdrop" onClick={()=>setOpen(false)}><section ref={drawer} className="alert-drawer" role="dialog" aria-modal="true" aria-label="경고 알림 센터" onClick={event=>event.stopPropagation()} onKeyDown={event=>{
      if(event.key==='Escape')setOpen(false);
      if(event.key==='Tab'){
        const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const first=buttons[0],last=buttons.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }}><header><h2>경고 알림 <span>{alerts.unread.length}건 미확인</span></h2><button aria-label="경고 알림 센터 닫기" onClick={()=>setOpen(false)}><X size={20}/></button></header><p>보관 경고 {events.length}건 · 읽음은 이 브라우저에만 적용됩니다.</p><button className="button" disabled={!alerts.unread.length} onClick={()=>alerts.markRead(alerts.unread)}>수신 경고 모두 읽음</button><div className="alert-drawer-list">{[...alerts.unread,...events.filter(event=>alerts.read.has(alertKey(event)))].map(event=><article key={alertKey(event)} className={'severity-'+event.severity.toLowerCase()+(alerts.read.has(alertKey(event))?' is-read':'')}><small>{severityLabel[event.severity]} · {event.detectedAt.slice(11,19)} KST · {alerts.read.has(alertKey(event))?'읽음':'미확인'}</small><b>{event.deviceId||'설비 미제공'} · {event.ruleId}</b><p>{event.message}</p><div><button onClick={()=>{setOpen(false);onEvent(event.id);}}>상세 보기</button>{!alerts.read.has(alertKey(event))&&<button onClick={()=>alerts.markRead([event])}>읽음</button>}</div></article>)}{!events.length&&<p>수신한 경고가 없습니다.</p>}</div></section></div>}
  </>;
}
