/* Gorilla – Trainings-Tracker
 * Offline-first: Plan, Einheiten und Körpergewicht liegen in IndexedDB auf dem Gerät. Jede Änderung wird sofort
 * lokal gespeichert und landet in einer Warteschlange (Outbox), die an die Apps-Script-Schnittstelle des Google Sheets
 * gesendet wird, sobald eine Verbindung besteht. Die Antwort ist immer der vollständige Stand des Sheets.
 */
(function(){
'use strict';

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const MON=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const WD=['So','Mo','Di','Mi','Do','Fr','Sa'];
const WDL=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseISO=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,(m||1)-1,d||1)};
const addDays=(s,k)=>{const d=parseISO(s);d.setDate(d.getDate()+k);return iso(d)};
const daysBetween=(a,b)=>Math.round((parseISO(b)-parseISO(a))/864e5);
const monday=s=>{const d=parseISO(s);d.setDate(d.getDate()-(d.getDay()+6)%7);return iso(d)};
const kw=s=>{const d=parseISO(s);d.setDate(d.getDate()+3-(d.getDay()+6)%7);const w1=new Date(d.getFullYear(),0,4);return 1+Math.round(((d-w1)/864e5-3+(w1.getDay()+6)%7)/7)};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,10));
const clone=o=>JSON.parse(JSON.stringify(o));
const toNum=v=>{if(v===''||v==null)return '';const n=Number(String(v).trim().replace(/\s|kg/gi,'').replace(',','.'));return isFinite(n)?n:''};
const fmtN=n=>n===''||n==null?'':String(Math.round(Number(n)*100)/100).replace('.',',');
const has=v=>v!==''&&v!=null;
const pl=(n,one,many)=>`${n} ${n===1?one:many}`;
let TODAY_ISO,YDAY_ISO;
function setToday(){const t=new Date();TODAY_ISO=iso(t);t.setDate(t.getDate()-1);YDAY_ISO=iso(t)}
setToday();
const shortDate=s=>{const d=parseISO(s);return `${WD[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]}${d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():''}`};
const relDate=s=>s===TODAY_ISO?'Heute':s===YDAY_ISO?'Gestern':shortDate(s);
const ago=s=>{const n=daysBetween(s,TODAY_ISO);return n<=0?'heute':n===1?'gestern':n<14?`vor ${n} Tagen`:n<60?`vor ${Math.round(n/7)} Wochen`:`vor ${Math.round(n/30)} Monaten`};

const I={
  left:'<svg class="i" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  chev:'<svg class="i chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  down:'<svg class="i" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  up:'<svg class="i" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  x:'<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check:'<svg class="i" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  trash:'<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  sheet:'<svg class="i" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/></svg>',
  gear:'<svg class="i" viewBox="0 0 24 24"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  cloudoff:'<svg class="i" viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M8 7.5A5 5 0 0116.6 9 4 4 0 0119 16.5M17 18H7a4 4 0 01-1.6-7.7"/></svg>',
  sync:'<svg class="i" viewBox="0 0 24 24"><path d="M20 11a8 8 0 00-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0014.3 4.9L20 16"/><path d="M20 20v-4h-4"/></svg>',
  warn:'<svg class="i" viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/></svg>',
  moon:'<svg class="i" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/></svg>',
  plus:'<svg class="i" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus:'<svg class="i" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  info:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  skip:'<svg class="i" viewBox="0 0 24 24"><path d="M5 5l9 7-9 7z"/><path d="M18 5v14"/></svg>',
  swap:'<svg class="i" viewBox="0 0 24 24"><path d="M7 4L4 7l3 3M4 7h13M17 20l3-3-3-3M20 17H7"/></svg>',
  up2:'<svg class="i" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  timer:'<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>',
  play:'<svg class="i" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  cal:'<svg class="i" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  ext:'<svg class="i" viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/></svg>',
  feather:'<svg class="i" viewBox="0 0 24 24"><path d="M12 3v18M5 10l7-7 7 7"/></svg>',
};
const SKIP_REASONS=['Gerät belegt','Schmerzen','Keine Zeit','Keine Energie','Anderes'];

/* Beispielplan, bis ein Google Sheet verbunden ist */
const SAMPLE_PLAN=[
  ['Tag A – Oberkörper','Bankdrücken','3','6–8','1–2','60 kg','Kurzhantel-Bankdrücken','Schulterblätter zusammen und nach unten, Füße fest am Boden. Stange kontrolliert zur unteren Brust, kurz absetzen, explosiv hoch.',150],
  ['Tag A – Oberkörper','Rudern am Kabel','3','8–10','1–2','50 kg','Kurzhantel-Rudern','Brust raus, Ellenbogen eng am Körper nach hinten ziehen, oben kurz halten. Kein Schwung aus dem Rücken.',120],
  ['Tag B – Unterkörper','Kniebeuge','3','6–8','1–2','70 kg','Beinpresse','Knie in Richtung Fußspitzen, Rücken neutral, mindestens bis parallel. Gewicht über dem Mittelfuß.',180],
  ['Tag B – Unterkörper','Rumänisches Kreuzheben','3','8–10','2','60 kg','Hip Thrust','Hüfte nach hinten schieben, Stange nah an den Beinen, Rücken gerade. Dehnung hinten im Oberschenkel spüren.',150],
  ['Cardio & Core','Zone-2-Cardio (locker)','1','25–35 min','—','—','Zügiger Lauf / Rad / Spazieren','Lockeres Dauer-Cardio in einem Tempo, bei dem du dich noch unterhalten könntest (Puls ca. 120–140).',0],
  ['Cardio & Core','Plank','3','30–45 s','0–1','BW','','Unterarmstütz: Ellenbogen unter den Schultern, Körper gerade wie ein Brett, Bauch und Po fest anspannen, nicht durchhängen.',60],
].map(([day,name,sets,reps,rir,target,alt,hint,rest])=>({day,name,sets,reps,rir,target,alt,hint,rest,video:''}));

/* ---------- state ---------- */
const S={plan:[],ses:[],bw:[],cfg:{cycle:7,start:''},url:'',view:'train',histMode:'ses'};
let OUT=[];
let CFG={url:'',token:'',lastSync:0};
let syncing=false,syncAgain=false,lastErr='';
let CUR=null,CUR_BACK='train';       // geöffnete Einheit
const UI={open:{},skipPick:{},addEx:false};

/* ---------- IndexedDB ---------- */
let DB=null;
function idb(){return new Promise((res,rej)=>{try{const r=indexedDB.open('gorilla',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}})}
const idbGet=k=>new Promise(res=>{if(!DB)return res(undefined);const q=DB.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>res(undefined)});
const idbSet=(k,v)=>new Promise(res=>{if(!DB)return res();const tx=DB.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>res()});
let saveT;
function persist(){clearTimeout(saveT);saveT=setTimeout(saveNow,150)}
function saveNow(){clearTimeout(saveT);return Promise.all([idbSet('data',{plan:S.plan,ses:S.ses,bw:S.bw,cfg:S.cfg,url:S.url}),idbSet('outbox',OUT),idbSet('cfg',CFG),idbSet('cur',CUR?{id:CUR.id,back:CUR_BACK}:null)])}

/* ---------- mutations ---------- */
function queue(k,op,id,d){OUT=OUT.filter(o=>!(o.k===k&&o.id===id));OUT.push({k,op,id,d:d?clone(d):null});persist();scheduleSync()}
function upsert(arr,o){const i=arr.findIndex(x=>x.id===o.id);if(i<0)arr.push(o);else arr[i]=o}
function applyOpLocal(o){
  if(o.k==='cfg'){S.cfg={...S.cfg,...o.d};return}
  const key=o.k==='ses'?'ses':o.k==='bw'?'bw':null;if(!key)return;
  if(o.op==='del')S[key]=S[key].filter(x=>x.id!==o.id);else upsert(S[key],clone(o.d));
}
const pendingIds=()=>new Set(OUT.filter(o=>o.k==='ses').map(o=>o.id));

/* ---------- Sync ---------- */
let syncT;
function scheduleSync(ms){clearTimeout(syncT);syncT=setTimeout(()=>sync(false),ms??1500)}
async function call(ops){
  const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),30000);
  try{
    const r=await fetch(CFG.url,{method:'POST',body:JSON.stringify({token:CFG.token,ops}),headers:{'Content-Type':'text/plain;charset=utf-8'},signal:ctl.signal,redirect:'follow'});
    const j=await r.json();
    if(!j.ok)throw new Error(j.error||'Unbekannter Fehler');
    return j;
  }catch(e){
    if(e.name==='AbortError')throw new Error('Zeitüberschreitung beim Sheet');
    if(e.message==='unauthorized')throw new Error('Zugangsschlüssel ist ungültig');
    if(e instanceof TypeError||e instanceof SyntaxError)throw new Error('Sheet nicht erreichbar');
    throw e;
  }finally{clearTimeout(to)}
}
function applySnapshot(d){
  if((d.plan||[]).length)S.plan=d.plan;
  S.ses=d.ses||[];S.bw=d.bw||[];S.cfg={cycle:7,start:'',...(d.cfg||{})};S.url=d.url||S.url;
  OUT.forEach(applyOpLocal);
  if(CUR&&isStored(CUR))upsert(S.ses,CUR);   // geöffnete Einheit: lokaler Stand gewinnt
}
async function sync(manual){
  if(!CFG.url||!CFG.token){if(manual)toast('Bitte zuerst das Google Sheet verbinden');return}
  if(!navigator.onLine){updateStatus();if(manual)toast('Offline. Die Synchronisierung folgt automatisch.');return}
  if(syncing){syncAgain=true;return}
  flushEdit();
  syncing=true;updateStatus();
  const sent=OUT.slice();
  try{
    const j=await call(sent);
    OUT=OUT.filter(o=>!sent.includes(o));
    applySnapshot(j.data);
    CFG.lastSync=Date.now();lastErr='';
    await saveNow();
    refresh();
    if(manual)toast('Synchronisiert');
  }catch(e){lastErr=e.message;if(manual)toast(esc(lastErr))}
  finally{syncing=false;updateStatus();if(syncAgain){syncAgain=false;scheduleSync(300)}}
}
async function connect(url,token){
  url=url.trim();token=token.trim();
  if(!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)){toast('Die Adresse muss mit https://script.google.com beginnen');return false}
  if(!token){toast('Bitte den Zugangsschlüssel eingeben');return false}
  const old={...CFG};CFG.url=url;CFG.token=token;
  try{
    const j=await call([]);
    const server=j.data||{};
    const sids=new Set((server.ses||[]).map(s=>s.id)),bids=new Set((server.bw||[]).map(b=>b.id));
    S.ses.filter(s=>!sids.has(s.id)).forEach(s=>queue('ses','put',s.id,s));   // lokal erfasste Einheiten ergänzen
    S.bw.filter(b=>!bids.has(b.id)).forEach(b=>queue('bw','put',b.id,b));
    clearTimeout(syncT);await sync(false);
    if(lastErr){toast(esc(lastErr));return false}
    toast('Mit dem Google Sheet verbunden');return true;
  }catch(e){CFG.url=old.url;CFG.token=old.token;toast(esc(e.message));return false}
}

/* ---------- Plan ---------- */
const days=()=>{const seen=new Set(),out=[];S.plan.forEach(p=>{if(p.day&&!seen.has(p.day)){seen.add(p.day);out.push(p.day)}});return out};
const planFor=day=>S.plan.filter(p=>p.day===day);
const planEx=(day,name)=>S.plan.find(p=>p.day===day&&p.name===name)||S.plan.find(p=>p.name===name)||null;
const unitOf=p=>{const r=String(p&&p.reps||'');return /min/i.test(r)?'min':/\d\s*(s|sek)\b|\bsek/i.test(r)?'s':'wdh'};
const unitLbl=u=>u==='min'?'Min.':u==='s'?'Sek.':'Wdh';
const showKg=p=>!p||!/^\s*(—|–|-)?\s*$/.test(String(p.target||'x'))||unitOf(p)==='wdh';
const showRir=p=>!p||!/^\s*(—|–|-)\s*$/.test(String(p.rir||''));
const rangeOf=s=>{const m=String(s||'').match(/(\d+(?:[.,]\d+)?)(?:\s*[–\-]\s*(\d+(?:[.,]\d+)?))?/);if(!m)return null;const lo=toNum(m[1]),hi=m[2]?toNum(m[2]):lo;return [lo,hi]};
const planSets=p=>{const r=rangeOf(p&&p.sets);return r?Math.max(1,Math.min(10,Math.round(r[1]))):3};
const alts=p=>String(p&&p.alt||'').split(/\s*\/\s*|\s*;\s*/).map(s=>s.trim()).filter(Boolean);

/* ---------- Einheiten ---------- */
const sortSes=a=>a.sort((x,y)=>x.date<y.date?1:x.date>y.date?-1:(y.u||0)-(x.u||0));
const isStored=s=>S.ses.some(x=>x.id===s.id);
const doneSets=x=>(x.sets||[]).filter(t=>has(t.r)||has(t.w));
const exCount=s=>{const d=(s.ex||[]).filter(x=>x.st!=='skip'&&doneSets(x).length).length,k=(s.ex||[]).filter(x=>x.st==='skip').length;return {d,k,sets:(s.ex||[]).reduce((n,x)=>n+(x.st==='skip'?0:doneSets(x).length),0)}};
const isEmptySes=s=>!s.note&&!(s.ex||[]).some(x=>x.st==='skip'||doneSets(x).length||x.note);
/** Letzte tatsächlich ausgeführte Leistung einer Übung vor diesem Datum. Leere oder übersprungene Einträge zählen nicht,
 *  dadurch „verschwinden“ die Werte der Vorwoche nicht mehr, wenn man zwischendurch etwas überspringt oder nur eine Notiz speichert. */
function lastPerf(name,date,excludeId,alt){
  for(const s of sortSes(S.ses.slice())){
    if(s.id===excludeId||s.date>date)continue;
    const x=(s.ex||[]).find(e=>e.n===name&&e.st!=='skip'&&doneSets(e).length&&(e.alt||'')===(alt||''));
    if(x)return {s,x};
  }
  return null;
}
function lastSkip(name,date,excludeId){
  for(const s of sortSes(S.ses.slice())){
    if(s.id===excludeId||s.date>date)continue;
    const x=(s.ex||[]).find(e=>e.n===name&&(e.st==='skip'||doneSets(e).length));
    if(x)return x.st==='skip'?{s,x}:null;
  }
  return null;
}
const lastOfDay=day=>sortSes(S.ses.filter(s=>s.day===day&&!isEmptySes(s)))[0]||null;
const setStr=(t,u)=>u==='wdh'?(has(t.w)&&Number(t.w)?`${fmtN(t.w)}×${fmtN(t.r)}`:`${fmtN(t.r)}`):`${fmtN(t.r)} ${u==='min'?'min':'s'}${has(t.w)&&Number(t.w)?` · ${fmtN(t.w)} kg`:''}`;
const e1rm=t=>has(t.w)&&has(t.r)&&Number(t.r)>0?Number(t.w)*(1+Math.min(Number(t.r),15)/30):0;

/* Deload-Zyklus */
function cycleStart(){if(S.cfg.start)return monday(S.cfg.start);const d=S.ses.map(s=>s.date).sort()[0];return monday(d||TODAY_ISO)}
function weekInfo(date){
  const cyc=Math.max(1,Number(S.cfg.cycle)||7);
  const idx=Math.floor(daysBetween(cycleStart(),monday(date))/7);
  const pos=((idx%cyc)+cyc)%cyc+1;
  return {pos,cyc,deload:cyc>1&&pos===cyc};
}

/** Vorschlag für heute nach dem Prinzip der doppelten Progression */
function advice(p,lp,deload){
  if(!p||!lp)return null;
  const u=unitOf(p);const sets=doneSets(lp.x);if(!sets.length)return null;
  const top=sets.reduce((m,t)=>Math.max(m,Number(t.w)||0),0);
  if(deload){
    if(u==='wdh'&&top)return {cls:'deload',text:`Deload: ca. ${fmtN(Math.round(top*0.9/1.25)*1.25)} kg, ${Math.max(1,Math.ceil(planSets(p)/2))} Sätze, 3–4 Wdh im Tank`};
    return {cls:'deload',text:`Deload: etwa die Hälfte der Sätze, locker bleiben`};
  }
  const rg=rangeOf(p.reps);if(!rg||u!=='wdh')return null;
  const [lo,hi]=rg;const reps=sets.map(t=>Number(t.r)||0);
  const enough=sets.length>=planSets(p);
  if(top&&enough&&reps.every(r=>r>=hi)){const inc=top>=40?2.5:top>=10?1.25:1;return {cls:'up',text:`Letztes Mal alle Sätze ≥ ${fmtN(hi)} Wdh. Heute ${fmtN(top+inc)} kg versuchen.`}}
  if(reps.some(r=>r<lo))return {cls:'',text:`Letztes Mal unter ${fmtN(lo)} Wdh. Gewicht halten und sauber ausführen.`};
  return {cls:'',text:`Gewicht halten und 1 Wdh mehr als letztes Mal schaffen.`};
}

/* ---------- status ---------- */
function statusInfo(){
  if(!CFG.url)return null;
  const n=OUT.length;
  if(!navigator.onLine)return {cls:'warn',icon:I.cloudoff,text:n?`Offline · ${n} ausstehend`:'Offline'};
  if(syncing)return {cls:'',icon:I.sync,text:'Synchronisiere'};
  if(lastErr)return {cls:'warn',icon:I.warn,text:n?`${n} ausstehend`:'Sync-Fehler'};
  if(n)return {cls:'',icon:I.sync,text:`${n} ausstehend`};
  return null;
}
function statusPill(){const s=statusInfo();return s?`<button class="offpill ${s.cls}" data-act="syncNow" title="${esc(lastErr||'Jetzt synchronisieren')}">${s.icon}${s.text}</button>`:''}
function updateStatus(){document.querySelectorAll('[data-slot="status"]').forEach(el=>el.innerHTML=statusPill());const b=$('#syncInfo');if(b)b.innerHTML=syncInfoHTML()}
function syncInfoHTML(){
  const n=OUT.length;const t=CFG.lastSync?new Date(CFG.lastSync):null;
  const when=t?(iso(t)===TODAY_ISO?`heute ${pad(t.getHours())}:${pad(t.getMinutes())}`:shortDate(iso(t))):'noch nie';
  return `${lastErr?`<span class="err">${esc(lastErr)}</span> · `:''}Zuletzt synchronisiert ${when}${n?` · ${n} ausstehend`:''}`;
}
const brand=()=>`<div class="brand"><img src="icons/icon.svg" alt="" width="24" height="24">Gorilla</div>`;
const topBar=()=>`<div class="top-row">${brand()}<div class="top-actions"><span data-slot="status">${statusPill()}</span><button class="icon-btn" data-act="tab" data-v="set" aria-label="Einstellungen">${I.gear}</button></div></div>`;

/* ---------- render ---------- */
function render(){
  const v=$('#view');
  if(S.view==='ses'&&CUR)renderSes(v);
  else if(S.view==='hist')renderHist(v);
  else if(S.view==='body')renderBody(v);
  else if(S.view==='set')renderSet(v);
  else {S.view='train';renderTrain(v)}
  const tabV=S.view==='ses'?CUR_BACK:S.view;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.v===tabV));
}
function refresh(){
  if(S.view==='ses'){updateStatus();return}                          // Einheit nie unter den Fingern neu zeichnen
  if(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#view form'))return;
  const y=window.scrollY;render();window.scrollTo(0,y);
}

/* Training (Start) */
function nextDay(){
  const ds=days();if(!ds.length)return null;
  const last=sortSes(S.ses.filter(s=>!isEmptySes(s)&&ds.includes(s.day)))[0];
  if(!last)return ds[0];
  return ds[(ds.indexOf(last.day)+1)%ds.length];
}
function renderTrain(v){
  const wi=weekInfo(TODAY_ISO);const mon=monday(TODAY_ISO);
  const week=S.ses.filter(s=>s.date>=mon&&s.date<=addDays(mon,6)&&!isEmptySes(s));
  const today=sortSes(S.ses.filter(s=>s.date===TODAY_ISO))[0];
  const nd=nextDay();const ds=days();
  const strip=Array.from({length:7},(_,i)=>{const d=addDays(mon,i);const n=week.filter(s=>s.date===d).length;return `<span class="wd ${d===TODAY_ISO?'today':''} ${n?'on':''}"><small>${WD[(i+1)%7]}</small><i></i></span>`}).join('');
  const cyc=Array.from({length:wi.cyc},(_,i)=>`<i class="${i+1<wi.pos?'past':i+1===wi.pos?'cur':''} ${i+1===wi.cyc?'dl':''}"></i>`).join('');
  v.innerHTML=`<header class="top">${topBar()}</header>
  <section class="sum hero" aria-label="Diese Woche">
    <div class="hero-h"><div class="sum-label">${wi.deload?'Deload-Woche':`Woche ${wi.pos} von ${wi.cyc}`} · KW ${kw(TODAY_ISO)}</div><div class="cyc" title="Zyklus">${cyc}</div></div>
    <div class="big"><span class="int">${week.length}</span><span class="dec"> ${week.length===1?'Einheit':'Einheiten'} diese Woche</span></div>
    <div class="wstrip">${strip}</div>
    ${wi.deload?`<p class="dl-note">${I.feather}<span>Deload: Gewicht um ca. 10 % senken, Sätze etwa halbieren, 3–4 Wdh im Tank lassen. Erholung ist Teil des Plans.</span></p>`:wi.pos===wi.cyc-1?`<p class="dl-note soft">${I.info}<span>Nächste Woche ist Deload.</span></p>`:''}
  </section>
  ${today&&!isEmptySes(today)?`<button class="next cont" data-act="openSes" data-id="${esc(today.id)}"><span class="next-l"><small>Heute begonnen</small><b>${esc(today.day)}</b><span>${(c=>`${c.d} erledigt${c.k?` · ${c.k} übersprungen`:''} · ${pl(c.sets,'Satz','Sätze')}`)(exCount(today))}</span></span><span class="go">${I.play}</span></button>`:''}
  ${nd&&!(today&&today.day===nd)?`<button class="next" data-act="start" data-day="${esc(nd)}"><span class="next-l"><small>Als Nächstes</small><b>${esc(nd)}</b><span>${planFor(nd).length} Übungen${(l=>l?` · zuletzt ${ago(l.date)}`:'')(lastOfDay(nd))}</span></span><span class="go">${I.play}</span></button>`:''}
  <section class="group">
    <div class="group-h"><h2>Trainingstage</h2><button class="txt-btn" data-act="backfill">${I.cal} Nachtragen</button></div>
    ${ds.length?`<ul class="rows">${ds.map(d=>{const l=lastOfDay(d);return `<li><button class="row" data-act="start" data-day="${esc(d)}"><span class="ci" style="--c:var(--accent)">${esc(d.replace(/^(tag|day)\s*/i,'').charAt(0).toUpperCase()||'•')}</span><span class="row-main"><b>${esc(d)}</b><small>${planFor(d).length} Übungen · ${l?`zuletzt ${ago(l.date)}`:'noch nie'}</small></span>${I.chev}</button></li>`}).join('')}</ul>`
    :`<div class="empty"><b>Noch kein Trainingsplan</b>Der Plan kommt aus dem Tab „Plan“ in deinem Google Sheet.<br><button class="btn primary" data-act="tab" data-v="set">Sheet verbinden</button></div>`}
  </section>
  ${!CFG.url?`<p class="hint center">Beispielplan. Verbinde dein Google Sheet in den Einstellungen, dann erscheint dein eigener Plan.</p>`:''}`;
}

/* Einheit */
function newSession(day,date){return {id:uuid(),date,day,note:'',u:Date.now(),ex:[]}}
function syncExList(s){
  // Übungen aus dem Plan ergänzen, bereits erfasste (auch nicht mehr im Plan) behalten
  const out=[];const seen=new Set();
  planFor(s.day).forEach(p=>{const x=(s.ex||[]).find(e=>e.n===p.name)||{n:p.name,st:'',alt:'',note:'',sets:[]};out.push(x);seen.add(p.name)});
  (s.ex||[]).forEach(x=>{if(!seen.has(x.n)){out.push(x);seen.add(x.n)}});
  s.ex=out;
}
function openSession(s,back){
  flushEdit();
  CUR=s;CUR_BACK=back||(S.view==='ses'?CUR_BACK:S.view);syncExList(CUR);UI.open={};UI.skipPick={};UI.addEx=false;
  S.view='ses';render();window.scrollTo(0,0);persist();
}
function startDay(day,date){
  date=date||TODAY_ISO;
  const ex=sortSes(S.ses.filter(s=>s.day===day&&s.date===date))[0];
  openSession(ex||newSession(day,date));
}
let editT=null,dirty=false;
function touch(){
  if(!CUR)return;CUR.u=Date.now();
  if(!isStored(CUR))S.ses.push(CUR);
  dirty=true;persist();clearTimeout(editT);editT=setTimeout(flushEdit,900);
}
function flushEdit(){clearTimeout(editT);if(CUR&&dirty){dirty=false;queue('ses','put',CUR.id,CUR)}}
function closeSession(){
  if(!CUR)return;
  flushEdit();
  if(isStored(CUR)&&isEmptySes(CUR)){S.ses=S.ses.filter(s=>s.id!==CUR.id);queue('ses','del',CUR.id)}
  const back=CUR_BACK;CUR=null;stopTimer();
  S.view=back==='ses'?'train':back;persist();render();window.scrollTo(0,0);
}

function renderSes(v){
  const s=CUR;const wi=weekInfo(s.date);
  const c=exCount(s);const total=s.ex.length;
  v.innerHTML=`<header class="top ses-top">
    <div class="top-row"><button class="txt-btn back" data-act="closeSes">${I.left}Fertig</button><span data-slot="status">${statusPill()}</span>
      <label class="chip date">${I.cal}<span>${relDate(s.date)}</span><input type="date" id="sesDate" value="${esc(s.date)}" max="${TODAY_ISO}" aria-label="Datum der Einheit"></label></div>
    <div class="ses-h"><h1>${esc(s.day)}</h1><div class="ses-meta"><span class="pill ${wi.deload?'dl':''}">${wi.deload?'Deload-Woche':`Woche ${wi.pos}/${wi.cyc}`}</span><span id="sesProg">${c.d+c.k}/${total} Übungen</span></div></div>
    <div class="prog"><i id="sesBar" style="width:${total?(c.d+c.k)/total*100:0}%"></i></div>
  </header>
  ${s.date!==TODAY_ISO?`<p class="backfill-note">${I.cal}<span>Du trägst ein Training vom <b>${shortDate(s.date)}</b> ein.</span></p>`:''}
  ${wi.deload?`<p class="dl-note">${I.feather}<span>Deload-Woche: weniger Sätze, ca. 10 % weniger Gewicht, locker bleiben.</span></p>`:''}
  <div id="exList">${s.ex.map((x,i)=>exCard(x,i)).join('')}</div>
  ${UI.addEx?`<form class="card addex" data-form="addEx"><label class="f">Zusätzliche Übung<input class="inp" id="addExName" maxlength="60" autocomplete="off" placeholder="z. B. Bizepscurls" list="exNames"></label>
    <datalist id="exNames">${[...new Set(S.plan.map(p=>p.name))].map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
    <div class="sh-actions"><button class="btn" type="button" data-act="addExCancel">Abbrechen</button><button class="btn primary" type="submit">Hinzufügen</button></div></form>`
  :`<button class="btn ghost wide" data-act="addEx">${I.plus} Übung hinzufügen</button>`}
  <section class="card">
    <label class="f">Notiz zur Einheit<textarea class="inp" data-in="sesNote" placeholder="z. B. schlecht geschlafen, Studio voll">${esc(s.note||'')}</textarea></label>
  </section>
  <div class="ses-end">
    <button class="btn primary wide" data-act="closeSes">${I.check} Training speichern</button>
    ${isStored(s)?`<button class="btn danger wide" data-act="delSes">${I.trash} Einheit löschen</button>`:''}
  </div>`;
}

function exCard(x,i){
  const s=CUR;const p=planEx(s.day,x.n);const u=unitOf(p);const wi=weekInfo(s.date);
  const lp=lastPerf(x.n,s.date,s.id,x.alt);const ls=lastSkip(x.n,s.date,s.id);
  const kg=showKg(p),rir=showRir(p);
  const target=p?[`${esc(p.sets||'?')} × ${esc(p.reps||'?')}`,rir&&p.rir?`RIR ${esc(p.rir)}`:'',p.target&&!/^(—|–|-)$/.test(p.target)?`Richtwert ${esc(p.target)}`:''].filter(Boolean).join(' · '):'Nicht im Plan';
  const altList=alts(p);
  if(x.st==='skip'){
    return `<article class="ex skipped" id="ex${i}"><div class="ex-h"><div class="ex-t"><h3>${esc(x.n)}</h3><small>${I.skip} Übersprungen</small></div>
      <button class="btn sm" data-act="unskip" data-x="${i}">Doch machen</button></div>
      <textarea class="inp note" data-in="exNote" data-x="${i}" rows="1" placeholder="Grund, z. B. Schulter zwickt">${esc(x.note||'')}</textarea></article>`;
  }
  const n=Math.max(x.sets.length,planSets(p));
  const adv=advice(p,lp,wi.deload);
  const open=!!UI.open[i];
  const lastSets=lp?doneSets(lp.x):[];
  const rows=Array.from({length:n},(_,k)=>{
    const t=x.sets[k]||{};const prev=k?x.sets[k-1]:null;const ph=lastSets[k]||(prev&&(has(prev.r)||has(prev.w))?prev:null)||lastSets[lastSets.length-1]||{};
    const done=has(t.r)||(!kg&&has(t.w));
    return `<div class="set ${done?'done':''}" data-x="${i}" data-k="${k}">
      <span class="sn">${k+1}</span>
      ${kg?`<input class="inp num" inputmode="decimal" data-in="w" value="${esc(fmtN(t.w))}" placeholder="${esc(fmtN(ph.w)||'kg')}" aria-label="Satz ${k+1} Gewicht in kg" enterkeyhint="next">`:''}
      <input class="inp num" inputmode="${u==='wdh'?'numeric':'decimal'}" data-in="r" value="${esc(fmtN(t.r))}" placeholder="${esc(fmtN(ph.r)||unitLbl(u))}" aria-label="Satz ${k+1} ${unitLbl(u)}" enterkeyhint="next">
      ${rir?`<input class="inp num" inputmode="decimal" data-in="rir" value="${esc(fmtN(t.rir))}" placeholder="${esc(fmtN(ph.rir)||'RIR')}" aria-label="Satz ${k+1} RIR" enterkeyhint="done">`:''}
      <button class="ok" data-act="setOk" data-x="${i}" data-k="${k}" aria-label="Satz ${k+1} erledigt">${I.check}</button>
    </div>`}).join('');
  return `<article class="ex" id="ex${i}" style="--cols:${['1.6rem',kg?'1fr':'',
    '1fr',rir?'0.8fr':'','42px'].filter(Boolean).join(' ')}">
    <div class="ex-h"><div class="ex-t"><h3>${esc(x.n)}${x.alt?` <span class="pill alt">${I.swap}${esc(x.alt)}</span>`:''}</h3><small>${target}</small></div>
      <button class="icon-btn ${open?'on':''}" data-act="toggleHint" data-x="${i}" aria-expanded="${open}" aria-label="Ausführung anzeigen">${I.info}</button></div>
    ${open||(!lp&&p&&p.hint&&!x.sets.length)?`<div class="hintbox">${p&&p.hint?`<p><b>Ausführung</b>${esc(p.hint)}</p>`:'<p>Für diese Übung ist im Plan kein Hinweis hinterlegt. Ergänze ihn in der Spalte „Hinweis“ im Sheet.</p>'}
      ${p&&p.video?`<a class="txt-btn" href="${esc(p.video)}" target="_blank" rel="noopener">${I.ext} Video ansehen</a>`:''}</div>`:''}
    ${lp?`<div class="last"><span class="lbl">Letztes Mal · ${esc(relDate(lp.s.date))}</span><span class="last-sets">${lastSets.map(t=>`<span>${esc(setStr(t,u))}${has(t.rir)?`<em>@${esc(fmtN(t.rir))}</em>`:''}</span>`).join('')}</span>
      ${lp.x.note?`<span class="last-note">„${esc(lp.x.note)}“</span>`:''}</div>`:`<div class="last none">Noch keine Werte${x.alt?' für diese Variante':''}. Starte mit dem Richtwert.</div>`}
    ${ls?`<div class="last warnish">Zuletzt übersprungen (${esc(relDate(ls.s.date))})${ls.x.note?`: ${esc(ls.x.note)}`:''}</div>`:''}
    ${adv?`<div class="adv ${adv.cls}">${adv.cls==='up'?I.up2:adv.cls==='deload'?I.feather:I.info}<span>${esc(adv.text)}</span></div>`:''}
    <div class="sets">
      <div class="set head"><span>Satz</span>${kg?'<span>kg</span>':''}<span>${unitLbl(u)}</span>${rir?'<span>RIR</span>':''}<span></span></div>
      ${rows}
    </div>
    <div class="ex-tools">
      <button class="mini" data-act="addSet" data-x="${i}">${I.plus} Satz</button>
      ${x.sets.length>planSets(p)?`<button class="mini" data-act="rmSet" data-x="${i}">${I.minus} Satz</button>`:''}
      ${altList.map(a=>`<button class="mini ${x.alt===a?'on':''}" data-act="alt" data-x="${i}" data-v="${esc(a)}">${I.swap} ${esc(a)}</button>`).join('')}
      <button class="mini" data-act="skipPick" data-x="${i}">${I.skip} Überspringen</button>
    </div>
    ${UI.skipPick[i]?`<div class="skippick"><span class="lbl">Warum überspringen?</span><div class="chips wrap">${SKIP_REASONS.map(r=>`<button class="chip" data-act="skip" data-x="${i}" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div></div>`:''}
    <textarea class="inp note" data-in="exNote" data-x="${i}" rows="1" placeholder="Notiz zu ${esc(x.n)} (heute)">${esc(x.note||'')}</textarea>
  </article>`;
}
function rerenderEx(i){const el=$('#ex'+i);if(el)el.outerHTML=exCard(CUR.ex[i],i);updProg()}
function updProg(){const c=exCount(CUR),t=CUR.ex.length;const a=$('#sesProg'),b=$('#sesBar');if(a)a.textContent=`${c.d+c.k}/${t} Übungen`;if(b)b.style.width=(t?(c.d+c.k)/t*100:0)+'%'}

/* Pausen-Timer */
let TM=null,tmI=null;
function startTimer(sec){
  if(!sec)return;
  TM={end:Date.now()+sec*1000,total:sec};clearInterval(tmI);tmI=setInterval(tick,250);tick();
}
function stopTimer(){TM=null;clearInterval(tmI);const el=$('#timer');el.hidden=true;el.innerHTML=''}
function tick(){
  const el=$('#timer');if(!TM){el.hidden=true;return}
  const left=Math.max(0,Math.round((TM.end-Date.now())/1000));
  el.hidden=false;
  el.innerHTML=`<div class="timer-in" style="--p:${(1-left/TM.total)*100}%">${I.timer}<b class="num">${Math.floor(left/60)}:${pad(left%60)}</b><span>Pause</span><button data-act="tPlus">+30 s</button><button data-act="tStop" aria-label="Pause beenden">${I.x}</button></div>`;
  if(left<=0){stopTimer();try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}beep();toast('Pause vorbei. Nächster Satz!')}
}
let AC=null;
function beep(){try{if(!AC)return;const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=880;g.gain.value=.15;o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+.25)}catch(e){}}

/* Verlauf */
function renderHist(v){
  const isS=S.histMode==='ses';
  v.innerHTML=`<header class="top">${topBar()}
    <div class="period"><h1 style="text-align:left">Verlauf</h1><div class="seg" role="group" aria-label="Ansicht">
      <button data-act="histMode" data-v="ses" class="${isS?'on':''}" aria-pressed="${isS}">Einheiten</button>
      <button data-act="histMode" data-v="ex" class="${!isS?'on':''}" aria-pressed="${!isS}">Übungen</button></div></div></header>
  ${isS?histSes():histEx()}`;
}
function histSes(){
  const list=sortSes(S.ses.filter(s=>!isEmptySes(s)));
  const pend=pendingIds();
  if(!list.length)return `<div class="empty"><b>Noch keine Einheiten</b>Starte ein Training oder trage eins nach.<br><button class="btn primary" data-act="backfill">Training nachtragen</button></div>`;
  let html=`<div class="hist-tools"><button class="txt-btn" data-act="backfill">${I.cal} Training nachtragen</button></div>`;
  const byW={};list.forEach(s=>(byW[monday(s.date)]=byW[monday(s.date)]||[]).push(s));
  for(const w of Object.keys(byW).sort().reverse()){
    const wi=weekInfo(w);
    html+=`<section class="day"><div class="day-h"><span class="d-num">KW ${kw(w)}</span><span class="d-wd">${shortDate(w).replace(/^\w+, /,'')} – ${shortDate(addDays(w,6)).replace(/^\w+, /,'')}</span><span class="pill ${wi.deload?'dl':''}">${wi.deload?'Deload':`Woche ${wi.pos}/${wi.cyc}`}</span></div><ul class="items">`;
    for(const s of byW[w]){const c=exCount(s);
      html+=`<li><button class="tx" data-act="openSes" data-id="${esc(s.id)}"><span class="ci" style="--c:var(--accent)">${WD[parseISO(s.date).getDay()]}</span>
        <span class="tx-main"><span class="tx-t">${esc(s.day)}</span><span class="tx-s">${pend.has(s.id)?`<span class="pend" title="Noch nicht im Sheet">${I.cloudoff}</span>`:''}${relDate(s.date)} · ${pl(c.d,'Übung','Übungen')} · ${pl(c.sets,'Satz','Sätze')}${c.k?` · <span class="skipc">${c.k} übersprungen</span>`:''}</span>
        ${s.note?`<span class="tx-n">${esc(s.note)}</span>`:''}</span>${I.chev}</button></li>`;}
    html+=`</ul></section>`;
  }
  return html;
}
function exNames(){const out=[],seen=new Set();S.plan.forEach(p=>{if(!seen.has(p.name)){seen.add(p.name);out.push(p.name)}});S.ses.forEach(s=>(s.ex||[]).forEach(x=>{if(!seen.has(x.n)&&(doneSets(x).length||x.st==='skip')){seen.add(x.n);out.push(x.n)}}));return out}
function exHistory(name){
  const out=[];sortSes(S.ses.slice()).forEach(s=>(s.ex||[]).forEach(x=>{if(x.n===name&&(x.st==='skip'||doneSets(x).length||x.note))out.push({s,x})}));return out;
}
function histEx(){
  const names=exNames();
  if(!names.length)return `<div class="empty"><b>Noch keine Übungen</b>Sobald du trainierst, siehst du hier deinen Fortschritt.</div>`;
  return `<ul class="rows" style="margin-top:12px">${names.map(n=>{
    const h=exHistory(n).filter(e=>e.x.st!=='skip'&&doneSets(e.x).length);const p=S.plan.find(q=>q.name===n);const u=unitOf(p);
    const best=h[0]?doneSets(h[0].x).reduce((b,t)=>(e1rm(t)||Number(t.r)||0)>(e1rm(b)||Number(b.r)||0)?t:b):null;
    return `<li><button class="row" data-act="exHist" data-v="${esc(n)}"><span class="row-main"><b>${esc(n)}</b><small>${h.length?`${h.length}× · zuletzt ${ago(h[0].s.date)} · bester Satz ${esc(setStr(best,u))}`:'noch keine Werte'}</small></span>${spark(h.slice(0,12).reverse().map(e=>score(e.x,u)))}${I.chev}</button></li>`}).join('')}</ul>`;
}
const score=(x,u)=>doneSets(x).reduce((m,t)=>Math.max(m,u==='wdh'&&e1rm(t)?e1rm(t):Number(t.r)||0),0);
function spark(vals){
  if(vals.length<2)return '';const w=64,h=22;const mn=Math.min(...vals),mx=Math.max(...vals);const sc=mx-mn||1;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1)*w).toFixed(1)},${(h-2-(v-mn)/sc*(h-4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}
function lineChart(pts,{unit='',avg=null}={}){
  if(pts.length<2)return '<p class="hint">Für eine Kurve braucht es mindestens zwei Einträge.</p>';
  const W=320,H=150,L=34,R=8,T=10,B=22;
  const xs=pts.map(p=>parseISO(p.d).getTime());const x0=Math.min(...xs),x1=Math.max(...xs)||x0+1;
  const ys=pts.map(p=>p.v).concat(avg?avg.map(p=>p.v):[]);let y0=Math.min(...ys),y1=Math.max(...ys);if(y1-y0<1){y0-=1;y1+=1}const pd=(y1-y0)*.12;y0-=pd;y1+=pd;
  const X=t=>L+(t-x0)/((x1-x0)||1)*(W-L-R),Y=v=>T+(1-(v-y0)/(y1-y0))*(H-T-B);
  const ticks=[y0+(y1-y0)*.15,y0+(y1-y0)*.5,y0+(y1-y0)*.85];
  const line=a=>a.map(p=>`${X(parseISO(p.d).getTime()).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const first=pts[0].d,last=pts[pts.length-1].d;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf">
    ${ticks.map(t=>`<line class="grid" x1="${L}" x2="${W-R}" y1="${Y(t)}" y2="${Y(t)}"/><text class="ax" x="${L-6}" y="${Y(t)+3}" text-anchor="end">${fmtN(Math.round(t*10)/10)}</text>`).join('')}
    ${avg?`<polyline class="avgl" points="${line(avg)}"/>`:''}
    <polyline class="ln" points="${line(pts)}"/>
    ${pts.map(p=>`<circle class="dot" cx="${X(parseISO(p.d).getTime()).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.6"/>`).join('')}
    <text class="ax" x="${L}" y="${H-6}">${shortDate(first).replace(/^\w+, /,'')}</text><text class="ax" x="${W-R}" y="${H-6}" text-anchor="end">${shortDate(last).replace(/^\w+, /,'')}</text>
  </svg>${unit?`<div class="chart-cap"><span>${esc(unit)}</span>${avg?'<span><i></i>7-Tage-Schnitt</span>':''}</div>`:''}`;
}
function openExHist(name){
  const h=exHistory(name);const p=S.plan.find(q=>q.name===name);const u=unitOf(p);
  const pts=h.filter(e=>e.x.st!=='skip'&&doneSets(e.x).length).map(e=>({d:e.s.date,v:Math.round(score(e.x,u)*10)/10})).reverse();
  openSheet('exh',`<div class="sh-head"><span></span><h2>${esc(name)}</h2><button class="txt-btn" data-act="close">Fertig</button></div>
  <div class="sh-body">
    ${p&&p.hint?`<div class="hintbox"><p><b>Ausführung</b>${esc(p.hint)}</p></div>`:''}
    <div class="card" style="margin-top:0">${lineChart(pts,{unit:u==='wdh'&&pts.some(x=>x.v)&&h.some(e=>doneSets(e.x).some(t=>Number(t.w)))?'Geschätztes 1RM in kg (bester Satz)':`Bester Satz in ${unitLbl(u)}`})}</div>
    <ul class="rows">${h.map(e=>`<li><button class="row" data-act="openSes" data-id="${esc(e.s.id)}"><span class="row-main"><b>${esc(relDate(e.s.date))}${e.x.alt?` · ${esc(e.x.alt)}`:''}</b>
      <small class="wrap">${e.x.st==='skip'?`<span class="skipc">Übersprungen</span>${e.x.note?` · ${esc(e.x.note)}`:''}`:`${doneSets(e.x).map(t=>esc(setStr(t,u))+(has(t.rir)?` @${esc(fmtN(t.rir))}`:'')).join(' · ')}${e.x.note?`<br>„${esc(e.x.note)}“`:''}`}</small></span>${I.chev}</button></li>`).join('')||'<li><div class="row"><span class="row-main"><small>Noch keine Einträge</small></span></div></li>'}</ul>
  </div>`);
}

/* Körpergewicht */
function renderBody(v){
  const list=S.bw.slice().sort((a,b)=>a.date<b.date?1:-1);
  const last=list[0];
  const avg7=d=>{const xs=S.bw.filter(b=>b.date<=d&&b.date>addDays(d,-7)).map(b=>Number(b.kg));return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null};
  const from=addDays(TODAY_ISO,-120);
  const pts=list.filter(b=>b.date>=from).map(b=>({d:b.date,v:Number(b.kg)})).reverse();
  const av=pts.map(p=>({d:p.d,v:avg7(p.d)}));
  const prev=last?list.find(b=>b.date<=addDays(last.date,-28)):null;
  const delta=last&&prev?Number(last.kg)-Number(prev.kg):null;
  v.innerHTML=`<header class="top">${topBar()}<div class="period"><h1 style="text-align:left">Körpergewicht</h1></div></header>
  <section class="sum">
    <div class="sum-label">${last?`Zuletzt ${relDate(last.date)}`:'Noch kein Eintrag'}</div>
    <div class="big"><span class="int">${last?fmtN(last.kg):'–'}</span><span class="dec">&nbsp;kg</span></div>
    ${last?`<div class="sum-meta"><span>Ø 7 Tage: ${fmtN(Math.round(avg7(last.date)*10)/10)} kg</span><span>${delta!==null?`${delta>0?'+':''}${fmtN(Math.round(delta*10)/10)} kg in 4 Wochen`:''}</span></div>`:''}
    <button class="btn primary" data-act="bwAdd">${I.plus} Gewicht eintragen</button>
  </section>
  ${pts.length>1?`<div class="card">${lineChart(pts,{unit:'kg, letzte 4 Monate',avg:av})}</div>`:''}
  ${list.length?`<section class="group"><h2 style="margin-bottom:10px">Einträge</h2><ul class="rows">${list.slice(0,60).map(b=>`<li><button class="row" data-act="bwEdit" data-id="${esc(b.id)}"><span class="row-main"><span class="rt"><b>${esc(relDate(b.date))}</b><span class="ra">${fmtN(b.kg)} kg</span></span>${b.note?`<small>${esc(b.note)}</small>`:''}</span></button></li>`).join('')}</ul></section>`:''}`;
}
let BW=null;
function openBw(b){
  BW=b?clone(b):{id:'bw-'+uuid().slice(0,8),date:TODAY_ISO,kg:'',note:''};const ed=!!b;
  const lastKg=(S.bw.slice().sort((a,c)=>a.date<c.date?1:-1)[0]||{}).kg;
  openSheet('bw',`<div class="sh-head"><button class="txt-btn" data-act="close">Abbrechen</button><h2>${ed?'Eintrag bearbeiten':'Gewicht eintragen'}</h2><span></span></div>
  <form class="sh-body" data-form="bw">
    <div class="frow"><label class="f">Gewicht (kg)<input class="inp num" id="bwKg" inputmode="decimal" value="${esc(fmtN(BW.kg))}" placeholder="${esc(fmtN(lastKg)||'z. B. 82,4')}" required autocomplete="off"></label>
    <label class="f">Datum<input class="inp" id="bwDate" type="date" value="${esc(BW.date)}" max="${TODAY_ISO}" required></label></div>
    <label class="f">Notiz<input class="inp" id="bwNote" value="${esc(BW.note||'')}" maxlength="80" autocomplete="off" placeholder="optional, z. B. morgens nüchtern"></label>
    <div class="sh-actions">${ed?`<button class="btn danger" type="button" data-act="bwDel">${I.trash}</button>`:''}<button class="btn primary" type="submit">Speichern</button></div>
  </form>`);
  setTimeout(()=>{const k=$('#bwKg');if(k&&!ed)k.focus()},300);
}

/* Nachtragen */
function openBackfill(){
  const ds=days();
  openSheet('bf',`<div class="sh-head"><button class="txt-btn" data-act="close">Abbrechen</button><h2>Training nachtragen</h2><span></span></div>
  <form class="sh-body" data-form="bf">
    <label class="f">Datum<input class="inp" id="bfDate" type="date" value="${YDAY_ISO}" max="${TODAY_ISO}" required></label>
    <div class="f"><span>Trainingstag</span><div class="chips wrap">${ds.map((d,i)=>`<label class="chip radio"><input type="radio" name="bfDay" value="${esc(d)}" ${i===0?'checked':''}><span>${esc(d)}</span></label>`).join('')}</div></div>
    <p class="hint" id="bfInfo"></p>
    <button class="btn primary" type="submit">Weiter</button>
  </form>`);
  updBf();
}
function updBf(){
  const d=$('#bfDate'),day=document.querySelector('input[name="bfDay"]:checked');const el=$('#bfInfo');if(!d||!el)return;
  const ex=day&&S.ses.find(s=>s.date===d.value&&s.day===day.value&&!isEmptySes(s));
  const wi=d.value?weekInfo(d.value):null;
  el.innerHTML=ex?`An diesem Tag gibt es schon eine Einheit „${esc(ex.day)}“. Sie wird zum Bearbeiten geöffnet.`:wi?`${shortDate(d.value)} · ${wi.deload?'Deload-Woche':`Woche ${wi.pos} von ${wi.cyc}`}`:'';
}

/* Einstellungen */
function renderSet(v){
  const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  const ds=days();
  v.innerHTML=`
  <header class="top"><div class="top-row"><button class="txt-btn back" data-act="tab" data-v="train">${I.left}Zurück</button><span data-slot="status">${statusPill()}</span></div><div class="period"><h1 style="text-align:left">Einstellungen</h1></div></header>

  <section class="group">
    <h2 style="margin-bottom:10px">Google Sheet</h2>
    ${CFG.url?`<ul class="rows">
      <li><div class="row"><span class="ci" style="--c:#2F9D6B">${I.sheet}</span><span class="row-main"><b>Verbunden</b><small id="syncInfo">${syncInfoHTML()}</small></span><button class="btn sm" data-act="syncNow">Sync</button></div></li>
      ${S.url?`<li><a class="row" href="${esc(S.url)}" target="_blank" rel="noopener"><span class="ci" style="--c:#2F9D6B">${I.ext}</span><span class="row-main"><b>Sheet öffnen</b><small>Plan, Log und Körpergewicht bearbeiten</small></span>${I.chev}</a></li>`:''}
      <li><button class="row" data-act="disconnect"><span class="ci" style="--c:#D2483C">${I.x}</span><span class="row-main"><b>Verbindung trennen</b><small>Daten bleiben auf dem Gerät und im Sheet</small></span>${I.chev}</button></li>
    </ul>`:`<p class="hint">Noch nicht verbunden. Deine Trainings liegen bisher nur auf diesem Gerät. Die Einrichtung steht in der Anleitung im Repository (README).</p>
    <form class="rows connect" data-form="connect">
      <label class="f">Web-App-Adresse<input class="inp" id="cUrl" type="url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" required></label>
      <label class="f">Zugangsschlüssel<input class="inp" id="cToken" autocomplete="off" placeholder="aus dem Tab „Gorilla“, Zelle B2" required></label>
      <button class="btn primary" type="submit" id="connectBtn">Verbinden</button>
    </form>`}
  </section>

  <section class="group">
    <h2>Trainingsplan</h2>
    <p class="hint">${ds.length} Trainingstage, ${S.plan.length} Übungen. Den Plan pflegst du im Sheet im Tab „Plan“. Ausführungshinweise kommen aus der Spalte „Hinweis“, die Pausenlänge in Sekunden aus „Pause“.</p>
  </section>

  <section class="group">
    <h2>Deload-Zyklus</h2>
    <p class="hint">Die letzte Woche jedes Zyklus ist eine Deload-Woche. Ein festes Startdatum sorgt dafür, dass sich der Zyklus nicht verschiebt, wenn du ältere Trainings nachträgst.</p>
    <form class="rows connect" data-form="cycle">
      <div class="frow"><label class="f">Wochen pro Zyklus<input class="inp num" id="cyc" type="number" inputmode="numeric" min="2" max="16" value="${esc(S.cfg.cycle||7)}"></label>
      <label class="f">Erste Woche ab<input class="inp" id="cycStart" type="date" value="${esc(S.cfg.start||cycleStart())}"></label></div>
      <p class="hint" style="margin:0">Aktuell: ${(w=>w.deload?'Deload-Woche':`Woche ${w.pos} von ${w.cyc}`)(weekInfo(TODAY_ISO))}</p>
      <button class="btn" type="submit">Übernehmen</button>
    </form>
  </section>

  <section class="group">
    <h2 style="margin-bottom:10px">App</h2>
    <ul class="rows">
      <li><div class="row"><span class="ci" style="--c:#5867D6">${I.moon}</span><span class="row-main"><b>Dunkler Modus</b><small>${themeIsDark()?'Dunkle Darstellung':'Helle Darstellung'}${themeSaved()?'':' · folgt dem Gerät'}</small></span><button class="switch" role="switch" data-act="theme" aria-checked="${themeIsDark()}" aria-label="Dunkler Modus"></button></div></li>
      <li><div class="homeprev"><img class="appicon" src="icons/icon.svg" alt="App-Icon Gorilla"><p><b>${standalone?'Gorilla ist installiert':'Auf den Homescreen legen'}</b>${standalone?'Startet ohne Browserleiste und funktioniert offline.':installEvt?'Installiere Gorilla als App.':'iPhone: in Safari auf Teilen tippen, dann „Zum Home-Bildschirm“.'}</p>${installEvt&&!standalone?`<button class="btn sm primary" data-act="install">Installieren</button>`:''}</div></li>
    </ul>
  </section>
  <p class="demo-note">Gorilla · Version ${window.GORILLA_VERSION||''}</p>`;
}

/* Darstellung */
const darkMQ=window.matchMedia('(prefers-color-scheme: dark)');
function themeSaved(){try{const t=localStorage.getItem('gorilla-theme');return t==='dark'||t==='light'?t:null}catch(e){return null}}
const themeIsDark=()=>{const t=themeSaved();return t?t==='dark':darkMQ.matches};
function applyTheme(){
  const t=themeSaved();if(t)document.documentElement.setAttribute('data-theme',t);else document.documentElement.removeAttribute('data-theme');
  const col=themeIsDark()?'#14110F':'#FBF8F4';document.querySelectorAll('meta[name="theme-color"]').forEach(m=>{m.setAttribute('content',col);m.removeAttribute('media')});
}
darkMQ.addEventListener?.('change',()=>{if(!themeSaved()){applyTheme();if(S.view==='set')refresh()}});

/* ---------- Sheets (Overlays) ---------- */
let sheetKind=null;
function openSheet(kind,html){
  sheetKind=kind;const sh=$('#sheet'),sc=$('#scrim');
  sh.innerHTML=html;sh.hidden=false;sc.hidden=false;
  requestAnimationFrame(()=>{sh.classList.add('open');sc.classList.add('open')});
}
function closeSheet(){
  const sh=$('#sheet'),sc=$('#scrim');sh.classList.remove('open');sc.classList.remove('open');sheetKind=null;BW=null;
  setTimeout(()=>{if(!sheetKind){sh.hidden=true;sc.hidden=true;sh.innerHTML=''}},280);
}
let toastT;
function toast(msg,undo){
  const el=$('#toast');el.innerHTML=`<span>${msg}</span>${undo?'<button data-act="undo">Rückgängig</button>':''}`;
  el._undo=undo;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),undo?5000:2600);
}

/* ---------- Ereignisse ---------- */
let installEvt=null;
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]');if(!b)return;
  if(b.tagName==='A')return;
  const a=b.dataset.act,xi=Number(b.dataset.x);
  if(!AC&&(a==='setOk'||a==='start')){try{AC=new (window.AudioContext||window.webkitAudioContext)()}catch(err){}}
  switch(a){
    case 'tab':if(S.view==='ses'){flushEdit();if(CUR&&isStored(CUR)&&isEmptySes(CUR)){S.ses=S.ses.filter(s=>s.id!==CUR.id);queue('ses','del',CUR.id)}CUR=null;stopTimer()}
      S.view=b.dataset.v;closeSheet();render();window.scrollTo(0,0);persist();break;
    case 'syncNow':sync(true);break;
    case 'start':startDay(b.dataset.day);break;
    case 'openSes':{const s=S.ses.find(x=>x.id===b.dataset.id);if(s){closeSheet();openSession(s)}break}
    case 'closeSes':{const c=CUR&&exCount(CUR);const empty=CUR&&isEmptySes(CUR);closeSession();if(c&&!empty)toast(`Gespeichert · ${pl(c.d,'Übung','Übungen')}, ${pl(c.sets,'Satz','Sätze')}`);break}
    case 'delSes':{const s=CUR;const back=CUR_BACK;S.ses=S.ses.filter(x=>x.id!==s.id);queue('ses','del',s.id);CUR=null;stopTimer();S.view=back;render();
      toast('Einheit gelöscht',()=>{S.ses.push(s);queue('ses','put',s.id,s);render()});break}
    case 'toggleHint':UI.open[xi]=!UI.open[xi];rerenderEx(xi);break;
    case 'addSet':{const x=CUR.ex[xi];const p=planEx(CUR.day,x.n);while(x.sets.length<Math.max(planSets(p),x.sets.length))x.sets.push({w:'',r:'',rir:''});x.sets.push({w:'',r:'',rir:''});rerenderEx(xi);touch();break}
    case 'rmSet':{const x=CUR.ex[xi];const gone=x.sets.pop();rerenderEx(xi);touch();
      if(gone&&(has(gone.r)||has(gone.w)))toast('Satz entfernt',()=>{x.sets.push(gone);rerenderEx(xi);touch()});break}
    case 'setOk':{
      const x=CUR.ex[xi],k=Number(b.dataset.k);const p=planEx(CUR.day,x.n);
      while(x.sets.length<=k)x.sets.push({w:'',r:'',rir:''});
      const t=x.sets[k];const row=b.closest('.set');
      const ph=f=>{const el=row.querySelector(`[data-in="${f}"]`);return el?toNum(el.placeholder):''};
      if(!has(t.r)&&!has(t.w)){t.w=ph('w');t.r=ph('r');t.rir=ph('rir');
        if(!has(t.r)&&!has(t.w)){toast('Bitte zuerst Gewicht und Wiederholungen eintragen');row.querySelector('input').focus();break}}
      if(x.st!=='skip')x.st='done';
      rerenderEx(xi);touch();
      const done=doneSets(x).length;const rest=Number(p&&p.rest)||90;
      if(done<Math.max(planSets(p),x.sets.length))startTimer(rest);
      else {stopTimer();const nx=document.getElementById('ex'+(xi+1));if(nx)setTimeout(()=>nx.scrollIntoView({behavior:'smooth',block:'start'}),150)}
      break}
    case 'alt':{const x=CUR.ex[xi];x.alt=x.alt===b.dataset.v?'':b.dataset.v;rerenderEx(xi);touch();break}
    case 'skipPick':UI.skipPick[xi]=!UI.skipPick[xi];rerenderEx(xi);break;
    case 'skip':{const x=CUR.ex[xi];const r=b.dataset.v;x.st='skip';UI.skipPick[xi]=false;
      if(r!=='Anderes')x.note=x.note&&!SKIP_REASONS.includes(x.note)?`${r} – ${x.note}`:r;
      rerenderEx(xi);touch();if(r==='Anderes')setTimeout(()=>{const t=document.querySelector(`#ex${xi} textarea`);if(t)t.focus()},50);break}
    case 'unskip':{const x=CUR.ex[xi];x.st=doneSets(x).length?'done':'';if(SKIP_REASONS.includes(x.note))x.note='';rerenderEx(xi);touch();break}
    case 'addEx':UI.addEx=true;render();setTimeout(()=>{const i=$('#addExName');if(i){i.focus();i.scrollIntoView({block:'center'})}},50);break;
    case 'addExCancel':UI.addEx=false;render();break;
    case 'tPlus':if(TM){TM.end+=30000;TM.total+=30;tick()}break;
    case 'tStop':stopTimer();break;
    case 'histMode':S.histMode=b.dataset.v;render();break;
    case 'exHist':openExHist(b.dataset.v);break;
    case 'backfill':openBackfill();break;
    case 'bwAdd':openBw(null);break;
    case 'bwEdit':openBw(S.bw.find(x=>x.id===b.dataset.id));break;
    case 'bwDel':{const old=S.bw.find(x=>x.id===BW.id);S.bw=S.bw.filter(x=>x.id!==BW.id);queue('bw','del',BW.id);closeSheet();render();
      if(old)toast('Eintrag gelöscht',()=>{S.bw.push(old);queue('bw','put',old.id,old);render()});break}
    case 'close':closeSheet();break;
    case 'undo':{const el=$('#toast');const fn=el._undo;el.classList.remove('show');el._undo=null;if(fn)fn();break}
    case 'theme':{const next=themeIsDark()?'light':'dark';try{if((next==='dark')===darkMQ.matches)localStorage.removeItem('gorilla-theme');else localStorage.setItem('gorilla-theme',next)}catch(err){}applyTheme();render();break}
    case 'disconnect':CFG.url='';CFG.token='';lastErr='';persist();render();toast('Verbindung getrennt');break;
    case 'install':if(installEvt){installEvt.prompt();installEvt=null;render()}break;
  }
});
$('#scrim').addEventListener('click',closeSheet);

document.addEventListener('input',e=>{
  const el=e.target;
  if(el.id==='bfDate'||el.name==='bfDay'){updBf();return}
  const f=el.dataset&&el.dataset.in;if(!f||!CUR)return;
  if(f==='sesNote'){CUR.note=el.value;touch();return}
  if(f==='exNote'){const x=CUR.ex[Number(el.dataset.x)];x.note=el.value;autoGrow(el);touch();return}
  const row=el.closest('.set');if(!row)return;
  const x=CUR.ex[Number(row.dataset.x)],k=Number(row.dataset.k);
  while(x.sets.length<=k)x.sets.push({w:'',r:'',rir:''});
  x.sets[k][f]=toNum(el.value);
  if(x.st!=='skip')x.st=doneSets(x).length?'done':'';
  row.classList.toggle('done',has(x.sets[k].r));
  updProg();touch();
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.id==='sesDate'&&CUR&&el.value){
    if(el.value>TODAY_ISO){toast('Datum liegt in der Zukunft');el.value=CUR.date;return}
    const clash=S.ses.find(s=>s.id!==CUR.id&&s.date===el.value&&s.day===CUR.day&&!isEmptySes(s));
    CUR.date=el.value;touch();render();
    toast(clash?`Achtung: Am ${shortDate(el.value)} gibt es schon „${esc(clash.day)}“`:`Datum auf ${shortDate(el.value)} gesetzt`);
  }
  if(el.dataset&&el.dataset.in&&['w','r','rir'].includes(el.dataset.in)&&has(toNum(el.value)))el.value=fmtN(toNum(el.value));
});
function autoGrow(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight+2,180)+'px'}
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter')return;const el=e.target;if(!el.matches||!el.matches('.set input'))return;
  e.preventDefault();const all=[...document.querySelectorAll('.set input')];const i=all.indexOf(el);if(all[i+1])all[i+1].focus();else el.blur();
});

document.addEventListener('submit',async e=>{
  const f=e.target.dataset.form;if(!f)return;e.preventDefault();
  if(f==='connect'){const btn=$('#connectBtn');btn.disabled=true;btn.textContent='Verbinde …';const ok=await connect($('#cUrl').value,$('#cToken').value);if(ok)render();else{btn.disabled=false;btn.textContent='Verbinden'}}
  if(f==='cycle'){const c=Math.max(2,Math.min(16,Number($('#cyc').value)||7));const st=$('#cycStart').value?monday($('#cycStart').value):'';S.cfg={cycle:c,start:st};queue('cfg','put','cfg',S.cfg);render();toast('Zyklus gespeichert')}
  if(f==='bw'){const kg=toNum($('#bwKg').value);if(!has(kg)||kg<20||kg>400){toast('Bitte ein gültiges Gewicht eingeben');return}
    BW.kg=kg;BW.date=$('#bwDate').value||TODAY_ISO;BW.note=$('#bwNote').value.trim();upsert(S.bw,BW);queue('bw','put',BW.id,BW);closeSheet();render();toast(`${fmtN(kg)} kg gespeichert`)}
  if(f==='bf'){const d=$('#bfDate').value;const day=(document.querySelector('input[name="bfDay"]:checked')||{}).value;if(!d||!day)return;
    if(d>TODAY_ISO){toast('Datum liegt in der Zukunft');return}closeSheet();startDay(day,d)}
  if(f==='addEx'){const n=$('#addExName').value.trim();if(!n)return;if(CUR.ex.some(x=>x.n===n)){toast('Übung ist schon dabei');return}
    CUR.ex.push({n,st:'',alt:'',note:'',sets:[]});UI.addEx=false;touch();render();const el=$('#ex'+(CUR.ex.length-1));if(el)el.scrollIntoView({block:'center'})}
});

document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault()},{passive:false});
window.addEventListener('online',()=>{updateStatus();scheduleSync(300)});
window.addEventListener('offline',updateStatus);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){const before=TODAY_ISO;setToday();if(before!==TODAY_ISO&&S.view!=='ses')refresh();if(TM)tick();scheduleSync(300)}
  else{flushEdit();saveNow()}
});
window.addEventListener('pagehide',()=>{flushEdit();saveNow()});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;if(S.view==='set')render()});

/* ---------- Start ---------- */
async function boot(){
  applyTheme();
  try{DB=await idb()}catch(e){DB=null}
  const [data,out,cfg,cur]=await Promise.all([idbGet('data'),idbGet('outbox'),idbGet('cfg'),idbGet('cur')]);
  if(data){S.plan=data.plan||[];S.ses=data.ses||[];S.bw=data.bw||[];S.cfg={cycle:7,start:'',...(data.cfg||{})};S.url=data.url||''}
  if(!S.plan.length)S.plan=clone(SAMPLE_PLAN);
  OUT=out||[];CFG={...CFG,...(cfg||{})};
  // Eine Einheit, die beim letzten Schließen offen war, wieder öffnen
  const open=cur&&S.ses.find(s=>s.id===cur.id);
  if(open&&daysBetween(open.date,TODAY_ISO)<=1&&Date.now()-(open.u||0)<6*3600e3){CUR=open;CUR_BACK=cur.back||'train';syncExList(CUR);S.view='ses'}
  render();
  if(!DB)toast('Speicher nicht verfügbar. Einträge gehen beim Schließen verloren.');
  scheduleSync(200);
  setInterval(()=>scheduleSync(0),5*60*1000);
}
boot();
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){navigator.serviceWorker.register('sw.js').catch(()=>{})}
})();
