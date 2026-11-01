import {apiUrl} from './api-config.js?v=gh-oracle-20261102a';
import {BrowserEngine} from './engine.js?v=gh-oracle-20261102a';
import {visitorId} from './visitor.js?v=gh-oracle-20261102a';
const SESSION='chattogram-hsc-private-job-oracle-v5',PERSIST='chattogram-hsc-remembered-job-oracle-v5';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,TOKEN=/^[A-Za-z0-9_-]{43}$/;
const FINISHED=new Set(['completed','stopped']);
function freshCredentials(){
  if(!globalThis.crypto?.getRandomValues)throw new Error('This browser cannot create a secure private search key. Please use an up-to-date browser.');
  const bytes=crypto.getRandomValues(new Uint8Array(32)),idBytes=crypto.getRandomValues(new Uint8Array(16));
  idBytes[6]=(idBytes[6]&15)|64;idBytes[8]=(idBytes[8]&63)|128;
  const hex=[...idBytes].map(x=>x.toString(16).padStart(2,'0')).join('');
  const id=globalThis.crypto.randomUUID?.()||`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  const token=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return {id,token,created_at:Date.now()};
}
function valid(c){return c&&UUID.test(c.id||'')&&TOKEN.test(c.token||'');}
async function post(path,data){
  let response;try{response=await fetch(apiUrl(path),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store',credentials:'same-origin'});}
  catch{throw new Error('The connection failed. Your background search may still be running; please try again.');}
  let answer;try{answer=await response.json();}catch{const error=new Error('The search service is temporarily unavailable. A free-service limit or outage may be responsible. Try again later.');error.status=response.status;throw error;}
  if(!response.ok){const error=new Error(answer.message||'The search service is temporarily unavailable.');error.status=response.status;error.type=answer.type;throw error;}return answer;
}
export class ServerEngine {
  constructor(onProgress=()=>{}) {
    this.onProgress=onProgress;this.local=new BrowserEngine(info=>this.onProgress(info));this.source=null;this.job=null;this.credentials=null;this.remember=false;this.keepOtherRemembered=false;this.saveWarning='';this.recoveryCopied=false;
  }
  persist() {
    if(!this.credentials)return;
    const raw=JSON.stringify(this.credentials);
    try{sessionStorage.setItem(SESSION,raw);}catch{this.saveWarning='Could not keep the private search key in this tab. Save the private recovery link before leaving.';}
    try{if(this.remember){localStorage.setItem(PERSIST,raw);this.keepOtherRemembered=false;}else if(!this.keepOtherRemembered)localStorage.removeItem(PERSIST);}catch{if(this.remember){this.remember=false;this.saveWarning='Could not remember the private search key on this device. Save the private recovery link instead.';}}
    if(this.saveWarning)this.onProgress();
  }
  forget(){this.credentials=null;try{sessionStorage.removeItem(SESSION);}catch{}try{if(!this.keepOtherRemembered)localStorage.removeItem(PERSIST);}catch{}}
  setRemember(value){this.remember=Boolean(value);if(this.credentials)this.persist();else if(!value)try{if(!this.keepOtherRemembered)localStorage.removeItem(PERSIST);}catch{}}
  cancelSource(){this.local.cancelSource();}
  async restore(){
    let c=null;
    try{
      const parts=new URLSearchParams(location.hash.slice(1)),raw=parts.get('resume');
      if(raw){const [id,token,created]=raw.split('.'),candidate={id,token,created_at:Number(created)||0};if(valid(candidate)){c=candidate;history.replaceState(null,'',location.pathname+location.search);}}
    }catch{}
    try{if(!c){const value=sessionStorage.getItem(SESSION);if(value)c=JSON.parse(value);}}catch{}
    try{const remembered=localStorage.getItem(PERSIST);if(remembered){const prior=JSON.parse(remembered);if(!c){c=prior;this.remember=true;}else if(prior.id===c.id&&prior.token===c.token)this.remember=true;else this.keepOtherRemembered=true;}}catch{}
    if(!valid(c))return {source:null,job:null,remember:this.remember};
    this.credentials=c;this.persist();
    try{const data=await post('search/status',{...c,after:0,include_source:true});this.source=data.source;this.local.source=data.source;this.job=data.job;this.persist();return {source:this.source,job:this.job,remember:this.remember};}
    catch(error){if(error.status===404&&(!c.created_at||Date.now()-c.created_at>30000)){this.forget();this.remember=false;}throw error;}
  }
  ensureReplaceable(){if(this.job&&!FINISHED.has(this.job.status))throw new Error('Stop or finish the current search first.');}
  async api(path,options={}) {
    const method=(options.method||'GET').toUpperCase(),payload=()=>JSON.parse(options.body||'{}');
    if(path==='/api/state')return this.restore();
    if(path==='/api/institutions/suggest')return this.local.api(path,options);
    if(path.startsWith('/api/source/')) {
      this.ensureReplaceable();const data=await this.local.api(path,options);this.source=data.source;this.job=null;this.forget();return data;
    }
    if(path==='/api/jobs'&&method==='POST') {
      this.ensureReplaceable();const o=payload();if(!this.source||o.source_id!==this.source.id)throw new Error('The roll list changed. Load it again.');
      const credentials=freshCredentials();this.credentials=credentials;this.recoveryCopied=false;this.persist();
      let data;
      try{data=await post('search/start',{...credentials,visitor_id:visitorId,source:this.source,options:o});}
      catch(first){
        // A lost response can still mean a job was created. Never discard its
        // secret just because the network or service is temporarily down.
        if([400,409,413,429].includes(first.status)||first.type==='busy'){this.forget();throw first;}
        if(/connection failed/i.test(first.message)){
          try{data=await post('search/start',{...credentials,visitor_id:visitorId,source:this.source,options:o});}catch{}
        }
        if(!data){
          try{const found=await post('search/status',{...credentials,after:0,include_source:true});data={job:found.job};}
          catch{throw new Error('The search may have started, but the connection was interrupted. Save the private recovery link below and retry the connection before starting another search.');}
        }
      }
      this.job=data.job;this.persist();return {job:data.job};
    }
    const match=path.match(/^\/api\/jobs\/([^/?]+)(?:\/(pause|resume|stop))?(?:\?after=(\d+))?$/);
    if(match) {
      if(method==='DELETE'&&!this.credentials&&this.job?.expired){this.job=null;return {ok:true};}
      if(!this.credentials||this.credentials.id!==decodeURIComponent(match[1]))throw new Error('This private search key is unavailable.');
      if(method==='DELETE'){await post('search/delete',this.credentials);this.job=null;this.forget();return {ok:true};}
      if(match[2]&&method==='POST'){const data=await post('search/action',{...this.credentials,command:match[2]});this.job=data.job;return {job:data.job};}
      const data=await post('search/status',{...this.credentials,after:Number(match[3]||0)});this.job=data.job;return {job:data.job};
    }
    throw new Error('Unknown action.');
  }
  resumeLink(){if(!this.credentials)throw new Error('There is no private search to recover.');return `${location.origin}${location.pathname}#resume=${this.credentials.id}.${this.credentials.token}.${this.credentials.created_at||0}`;}
}
