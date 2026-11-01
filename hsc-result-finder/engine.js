import {apiUrl} from './api-config.js?v=gh-oracle-20261102a';
import {asciiDigits,parseManual,parsePdf,parseBoardSource,suggestColleges,classifyName,groupKey,LABELS} from './logic.js?v=gh-oracle-20261102a';
import {visitorId,forgetQueue} from './visitor.js?v=gh-oracle-20261102a';

const API=apiUrl('');
const SESSION_KEY='chattogram-hsc-finder-session-v1';
const RESTARTABLE=new Set(['completed','stopped']);
const ACTIVE=new Set(['running','pausing','paused','match_found','attention','fallback_review','stopping']);
function localId(){return globalThis.crypto?.randomUUID?.()||`job-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
async function remote(path,data,externalSignal=null) {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),38000);
  const abort=()=>controller.abort();if(externalSignal?.aborted)abort();else externalSignal?.addEventListener('abort',abort,{once:true});
  try {
    const response=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,visitor_id:visitorId,cache_version:typeof document!=='undefined'&&document.querySelector('meta[name="result-cache-policy"][content="3"]')?3:0}),
      cache:'no-store',signal:controller.signal,credentials:'same-origin'});
    let result={};try{result=await response.json();}catch{}
    if(!result.type) {
      if(response.status>=500)return {type:'transient',retry_after:15,message:`The service is unavailable (HTTP ${response.status}). A free-service limit or outage may be responsible. Please try again later.`};
      return {type:'unexpected',message:`The search service returned HTTP ${response.status}. Please check the official board site.`};
    }
    return result;
  } catch {return externalSignal?.aborted?{type:'cancelled'}:{type:'transient',retry_after:15,message:'The connection timed out or failed. The current item was not counted.'};}
  finally {clearTimeout(timeout);externalSignal?.removeEventListener('abort',abort);}
}
function wait(ms,signal) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new Error('Lookup cancelled.'));return;}
    const onAbort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);reject(new Error('Lookup cancelled.'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',onAbort);resolve();},ms);
    signal?.addEventListener('abort',onAbort,{once:true});
  });
}
function cleanResult(value) {return JSON.parse(JSON.stringify(value));}

export class LocalJob {
  constructor(source,payload,notify=()=>{},saved=null,request=remote) {
    this.notify=notify;this.request=request;this.timer=null;this.wake=null;this.loopActive=false;
    if(saved) {
      Object.assign(this,saved);
      this.source=source;this.notify=notify;this.request=request;this.timer=null;this.wake=null;this.loopActive=false;
      if(['running','pausing','stopping'].includes(this.status)) {this.status='paused';this.message='Saved progress was restored. Tap Continue search to resume.';}
      this.in_flight=false;this.wait_reason='';this.cooldown_until=0;
      return;
    }
    if(!source||payload.source_id!==source.id)throw new Error('The roll list changed. Load it again.');
    if(!source.complete&&payload.confirm_incomplete!==true)throw new Error('Review the warnings and confirm the incomplete list.');
    const selected=payload.group,groups=new Map(source.groups.map(g=>[g.key,g]));
    if(typeof selected!=='string'||!(selected==='all'||groups.has(selected)))throw new Error('Select a group from the loaded list.');
    const chosen=selected==='all'?source.groups:source.groups.filter(g=>g.key===selected);
    const seen=new Set(),primary=[],fallback=[];
    for(const g of chosen)for(const e of g.entries)if(!seen.has(e.roll)){seen.add(e.roll);primary.push({...e});}
    if(!primary.length)throw new Error('This group has no rolls to check.');
    if(['science','business','humanities'].includes(selected)&&payload.include_others&&groups.has('others'))
      for(const e of groups.get('others').entries)if(!seen.has(e.roll)){seen.add(e.roll);fallback.push({...e});}
    if(primary.length+fallback.length>10000)throw new Error('This search has too many rolls.');
    const delay=Number(payload.delay),threshold=Number(payload.threshold);
    if(!Number.isInteger(delay)||delay<3||delay>30)throw new Error('The request gap must be between 3 and 30 seconds.');
    if(!Number.isInteger(threshold)||threshold<70||threshold>95)throw new Error('The similarity threshold must be between 70 and 95 percent.');
    this.id=localId();this.source=source;this.source_id=source.id;this.source_name=source.name;this.source_eiin=source.eiin;
    this.selected_group=selected;this.primary_count=primary.length;this.fallback_count=fallback.length;this.queue=[...primary,...fallback];
    this.target=String(payload.target||'').trim().replace(/\s+/g,' ').slice(0,120);
    this.similar=Boolean(payload.similar);this.threshold=threshold;this.stop_on_match=Boolean(payload.stop_on_match)&&Boolean(this.target);
    this.delay=delay;this.include_others=Boolean(payload.include_others);this.results=[];this.cursor=0;this.matches=0;this.similar_count=0;this.no_result=0;
    this.status='running';this.message='Checking rolls one at a time.';this.wait_reason='';this.in_flight=false;this.fallback_reviewed=false;
    this.retry_not_before=0;this.cooldown_until=0;this.next_own_request=0;this.transient_count=0;
  }
  saveable() {
    const keys=['id','source_id','source_name','source_eiin','selected_group','primary_count','fallback_count','queue','target','similar','threshold',
      'stop_on_match','delay','include_others','results','cursor','matches','similar_count','no_result','status','message','fallback_reviewed',
      'retry_not_before','next_own_request','transient_count'];
    return Object.fromEntries(keys.map(k=>[k,this[k]]));
  }
  changed(){this.notify();}
  snapshot(after=0) {
    const offset=Math.max(0,Math.min(Number(after)||0,this.results.length)),entry=this.queue[this.cursor]||{};
    return {id:this.id,source_id:this.source_id,selected_group:this.selected_group,include_others:this.include_others,target:this.target,
      similar:this.similar,threshold:this.threshold,stop_on_match:this.stop_on_match,delay:this.delay,
      status:this.status,message:this.message,wait_reason:this.wait_reason,total:this.queue.length,checked:this.cursor,matches:this.matches,
      similar_count:this.similar_count,no_result:this.no_result,current_roll:entry.roll||'',current_category:entry.category||'',in_flight:this.in_flight,
      retry_in:Math.max(0,Math.ceil((this.retry_not_before-Date.now())/1000)),cooldown_in:Math.max(0,Math.ceil((this.cooldown_until-Date.now())/1000)),
      offset,results:cleanResult(this.results.slice(offset))};
  }
  record(entry,outcome) {
    const result={...outcome,category:entry.category,list_value:entry.list_value||'',pages:entry.pages||[]};
    const cls=classifyName(result.name||'',this.target,this.similar,this.threshold);result.match=cls.match;result.similarity=cls.match==='similar'?cls.score:null;
    const actual=groupKey(result.group||''),specific=['science','business','humanities'];
    result.group_mismatch=result.status==='ok'&&specific.includes(this.selected_group)&&specific.includes(actual)?actual!==this.selected_group:null;
    this.results.push(result);this.cursor++;
    if(result.status==='no_result')this.no_result++;
    if(result.match!=='none'){this.matches++;if(result.match==='similar')this.similar_count++;}
    return result.match!=='none';
  }
  interruptibleWait(ms,reason,message) {
    this.wait_reason=reason;this.message=message;this.cooldown_until=Date.now()+ms;this.changed();
    return new Promise(resolve=>{
      this.wake=()=>{clearTimeout(this.timer);this.timer=null;this.wake=null;this.cooldown_until=0;resolve();};
      this.timer=setTimeout(this.wake,ms);
    });
  }
  start(){if(!this.loopActive&&this.status==='running')void this.run();}
  async run() {
    if(this.loopActive)return;this.loopActive=true;
    try {
      while(this.status==='running') {
        if(this.cursor>=this.queue.length){this.status='completed';this.message='All rolls in the search plan have been checked.';this.changed();break;}
        if(this.fallback_count&&this.cursor>=this.primary_count&&!this.fallback_reviewed) {
          this.fallback_reviewed=true;
          if(this.target&&this.matches){this.status='fallback_review';this.message='The selected group is complete and possible matches were found. Choose whether to check the mixed Unsuccessful / Others list too.';this.changed();break;}
        }
        const due=this.next_own_request-Date.now();
        if(due>0){await this.interruptibleWait(due,'gap','Waiting before the next request.');continue;}
        const entry=this.queue[this.cursor];this.in_flight=true;this.wait_reason='';this.message='Checking the current roll.';this.changed();
        const answer=await this.request('individual',{roll:entry.roll});
        this.in_flight=false;
        if(this.status==='stopping') {
          if(answer.type==='queue')forgetQueue();
          if(answer.type==='result')this.record(entry,answer.result);
          this.status='stopped';this.message='Search stopped. Checked rows are available to download.';this.changed();break;
        }
        if(this.status==='pausing') {
          if(answer.type==='queue')forgetQueue();
          if(answer.type==='result')this.record(entry,answer.result);
          this.status='paused';this.message='Search paused. Checked rows are available to download.';this.next_own_request=Date.now()+this.delay*1000;this.changed();break;
        }
        if(answer.type==='queue') {
          const seconds=Math.max(2,Number(answer.retry_after)||4),jitter=300+Math.random()*1000;
          const estimate=Number(answer.estimate_seconds)>0?` At least about ${answer.estimate_seconds} seconds for your next turn, plus board response time.`:'';
          await this.interruptibleWait(seconds*1000+jitter,'queue',(answer.message||'Other visitors are using the board. Your search is waiting for its turn.')+estimate);continue;
        }
        if(answer.type==='transient') {
          this.transient_count++;
          if(this.transient_count<=2) {
            const seconds=Math.max(Number(answer.retry_after)||15,this.transient_count===1?15:30);
            await this.interruptibleWait(seconds*1000,'auto_retry',`${answer.message||'Temporary board error.'} Retrying this roll automatically (${this.transient_count} of 2).`);continue;
          }
          this.status='attention';this.retry_not_before=Date.now()+3000;
          this.message=`${answer.message||'Temporary board error.'} Two automatic retries did not work. When the board is available, tap Retry current roll to continue; checked rows are kept.`;this.changed();break;
        }
        if(answer.type==='blocked') {
          this.status='attention';this.retry_not_before=Date.now()+Math.max(1,Number(answer.retry_after)||120)*1000;
          this.message=`${answer.message||'The board requested verification or limited access.'} Do not bypass it. After the wait, check the official site; if access is allowed, tap Retry current roll.`;this.changed();break;
        }
        if(answer.type!=='result') {
          this.status='attention';this.retry_not_before=Date.now()+3000;
          this.message=`${answer.message||'The board returned an unexpected page.'} This roll was not counted. Check the official site, then tap Retry current roll if appropriate.`;this.changed();break;
        }
        this.transient_count=0;const matched=this.record(entry,answer.result);this.next_own_request=Date.now()+this.delay*1000;
        if(this.cursor>=this.queue.length){this.status='completed';this.message='All rolls in the search plan have been checked.';}
        else if(matched&&this.stop_on_match){this.status='match_found';this.message='A possible name match was found. Review it, then continue if needed.';}
        this.changed();
      }
    } finally {this.loopActive=false;this.in_flight=false;this.changed();}
  }
  action(action) {
    if(action==='pause') {
      if(this.status!=='running')throw new Error('This search is not running.');
      if(!this.in_flight)forgetQueue();
      if(this.in_flight){this.status='pausing';this.message='Pausing after the current request.';}
      else{this.status='paused';this.message='Search paused. Checked rows are available to download.';if(this.wake)this.wake();}
    } else if(action==='resume') {
      if(!['paused','match_found','attention','fallback_review'].includes(this.status))throw new Error('This search cannot be continued right now.');
      if(this.status==='attention'&&Date.now()<this.retry_not_before)throw new Error(`Wait another ${Math.ceil((this.retry_not_before-Date.now())/1000)} seconds before retrying.`);
      this.status='running';this.message='Checking rolls one at a time.';this.wait_reason='';this.retry_not_before=0;this.transient_count=0;
      // A previous loop can still be unwinding after its wait was interrupted.
      if(this.loopActive) setTimeout(()=>this.start(),0);else this.start();
    } else if(action==='stop') {
      if(RESTARTABLE.has(this.status))return;
      if(!this.in_flight)forgetQueue();
      if(this.in_flight){this.status='stopping';this.message='Stopping after the current request.';}
      else {this.status='stopped';this.message='Search stopped. Checked rows are available to download.';if(this.wake)this.wake();}
    } else throw new Error('Unknown search action.');
    this.changed();
  }
}

function csvCell(value) {
  let s=value==null?'':String(value);if(/^[\s]*[=+\-@]/.test(s))s="'"+s;
  return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
export function jobTable(job,matchesOnly=false) {
  const rows=job.results.filter(x=>!matchesOnly||x.match!=='none'),subjects=[];
  for(const row of rows)for(const item of row.subjects||[])if(item.subject&&!subjects.includes(item.subject))subjects.push(item.subject);
  const headers=['Roll Number','Name','Board',"Father's Name",'Group',"Mother's Name",'Session','Registration Number','Type','Institute','Result','GPA',
    'Source Section','Board List GPA/Code','PDF Page(s)','Name Match','Similarity (%)','Different Group?','Lookup Status','Notes','Fetched from','Board checked at',...subjects.map(s=>'Subject: '+s)];
  const data=[headers];
  for(const row of rows) {
    const marks=new Map((row.subjects||[]).map(x=>[x.subject,x.marks]));
    const mismatch=row.group_mismatch===true?'Yes':row.group_mismatch===false?'No':['science','business','humanities'].includes(job.selected_group)?'Unknown':'Not applicable';
    const cells=[row.roll,row.name,row.board,row.father_name,row.group,row.mother_name,row.session,row.reg_no,row.student_type,row.institute,row.result,row.gpa,
      LABELS[row.category]||row.category,row.list_value,(row.pages||[]).join('; '),row.match,row.similarity,mismatch,row.status,(row.notes||[]).join('; '),row.from_cache?'Saved result':'Board',row.cache_saved_at?new Date(row.cache_saved_at).toISOString():'',
      ...subjects.map(s=>marks.get(s)||'')];
    data.push(cells);
  }
  return data;
}
export function jobCsv(job,matchesOnly=false) {return '\ufeff'+jobTable(job,matchesOnly).map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';}

export class BrowserEngine {
  constructor(onProgress=()=>{}) {this.source=null;this.job=null;this.remember=false;this.onProgress=onProgress;this.saveWarning='';this.sourceController=null;}
  save() {
    if(!this.remember)return;
    try{sessionStorage.setItem(SESSION_KEY,JSON.stringify({version:1,source:this.source,job:this.job?.saveable()||null}));}
    catch{this.remember=false;this.saveWarning='Could not save progress in this tab. Download a partial CSV and keep the page open.';try{sessionStorage.removeItem(SESSION_KEY);}catch{}}
  }
  changed(){this.save();this.onProgress();}
  setRemember(value) {this.remember=Boolean(value);if(this.remember){this.save();if(this.saveWarning)this.onProgress();}else try{sessionStorage.removeItem(SESSION_KEY);}catch{};}
  restore() {
    try {
      const raw=sessionStorage.getItem(SESSION_KEY);if(!raw)return {source:null,job:null,remember:false};
      const data=JSON.parse(raw);if(data.version!==1||!data.source||!Array.isArray(data.source.groups))throw new Error('bad saved data');
      this.remember=true;this.source=data.source;
      this.job=data.job?new LocalJob(this.source,null,()=>this.changed(),data.job):null;
      return {source:this.source,job:this.job?.snapshot()||null,remember:true};
    } catch {try{sessionStorage.removeItem(SESSION_KEY);}catch{}return {source:null,job:null,remember:false};}
  }
  ensureReplaceable(){if(this.job&&!RESTARTABLE.has(this.job.status))throw new Error('Stop or finish the current search first.');}
  cancelSource() {if(this.sourceController)this.sourceController.abort();forgetQueue();}
  async loadInstitution(eiin,force=false) {
    let result;const controller=new AbortController(),lookupId=globalThis.crypto?.randomUUID?.()||(()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;})();this.sourceController=controller;
    try {
      while(!controller.signal.aborted) {
        result=await remote('institution',{eiin,force,lookup_id:lookupId},controller.signal);
        if(result.type==='cancelled')throw new Error('Lookup cancelled.');
        if(result.type!=='queue')break;
        const estimate=Number(result.estimate_seconds)>0?` At least about ${result.estimate_seconds} seconds until your turn, plus board response time.`:'';
        this.onProgress({waiting:true,message:(result.message||'Other visitors are searching; your college lookup is in the queue.')+estimate});
        await wait((Math.max(2,Number(result.retry_after)||4)+Math.random())*1000,controller.signal);
      }
      if(controller.signal.aborted)throw new Error('Lookup cancelled.');
      if(result?.type==='institution'){const source=parseBoardSource(eiin,result.data,result.heading_counts);source.from_cache=Boolean(result.cached);source.cache_saved_at=Number(result.cache_saved_at)||0;source.background_queued=Boolean(result.background_queued);return source;}
      if(result?.type==='blocked')throw new Error(`${result.message} Wait at least ${result.retry_after||120} seconds.`);
      throw new Error(result?.message||'The institute lookup is temporarily unavailable. Try again or use a PDF.');
    } finally {if(this.sourceController===controller)this.sourceController=null;}
  }
  async api(path,options={}) {
    const method=(options.method||'GET').toUpperCase(),payload=()=>JSON.parse(options.body||'{}');
    if(path==='/api/state')return this.restore();
    if(path==='/api/institutions/suggest') {
      const data=payload();return suggestColleges(data.query,data.web,async query=>{
        const result=await remote('suggest',{query});return result.type==='suggestions'?result:{candidates:[],warning:'Web search is busy or unavailable; local directory suggestions are shown.'};
      });
    }
    if(path.startsWith('/api/source/')) {
      this.ensureReplaceable();let source;
      if(path.endsWith('/pdf'))source=await parsePdf(options.body);
      else if(path.endsWith('/manual'))source=parseManual(payload().rolls||'');
      else if(path.endsWith('/eiin')){const eiin=asciiDigits(String(payload().eiin||'').trim());if(!/^\d{6}$/.test(eiin))throw new Error('EIIN must contain six digits.');source=await this.loadInstitution(eiin,Boolean(payload().force));}
      else throw new Error('Unknown roll list source.');
      this.source=source;this.job=null;this.changed();return {source};
    }
    if(path==='/api/jobs'&&method==='POST') {
      this.ensureReplaceable();this.job=new LocalJob(this.source,payload(),()=>this.changed());this.changed();this.job.start();return {job:this.job.snapshot()};
    }
    const match=path.match(/^\/api\/jobs\/([^/?]+)(?:\/(pause|resume|stop))?(?:\?after=(\d+))?$/);
    if(match) {
      if(!this.job||this.job.id!==decodeURIComponent(match[1]))throw new Error('This search is no longer available.');
      if(method==='DELETE'){this.ensureReplaceable();this.job=null;this.changed();return {ok:true};}
      if(match[2]&&method==='POST'){this.job.action(match[2]);return {job:this.job.snapshot()};}
      return {job:this.job.snapshot(Number(match[3]||0))};
    }
    throw new Error('Unknown action.');
  }
  csv(matchesOnly=false){if(!this.job)throw new Error('There is no search to download.');return jobCsv(this.job,matchesOnly);}
}
