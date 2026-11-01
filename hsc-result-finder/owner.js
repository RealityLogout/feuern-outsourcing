import {apiUrl} from './api-config.js?v=gh-oracle-20261102a';
const $=id=>document.getElementById(id);
const form=$('loginForm'),pass=$('passphrase'),card=$('loginCard'),inbox=$('inbox'),message=$('message'),list=$('helloList');
let secret='';
function say(text,good=false){message.textContent=text;message.classList.toggle('good',good);}
async function post(path,extra={}) {
  const response=await fetch(apiUrl('owner/'+path),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:secret,...extra}),cache:'no-store'});
  let data;try{data=await response.json();}catch{throw new Error('The owner service is temporarily unavailable.');}
  if(!response.ok)throw new Error(data.message||'The owner service is temporarily unavailable.');
  return data;
}
function display(data) {
  list.replaceChildren();
  for(const item of data.items||[]) {
    const li=document.createElement('li'),strong=document.createElement('strong'),time=document.createElement('time');
    strong.textContent=item.nickname||'Anonymous ♥';
    const date=new Date(item.created);time.dateTime=date.toISOString();time.textContent=date.toLocaleString();
    li.append(strong,time);list.append(li);
  }
  $('helloCount').textContent=`${Number(data.total)||0} ${Number(data.total)===1?'hello':'hellos'} in the last 30 days`;
  $('emptyHellos').hidden=Boolean(data.total);card.hidden=true;inbox.hidden=false;
}
async function loadCache(){const data=await post('cache/summary');$('cacheCount').textContent=`${Number(data.institutions)||0} institute lists · ${Number(data.results)||0} individual results`; $('cachePanel').hidden=false;}
async function loadFill(){
 const d=await post('progress'),list=$('fillList');list.replaceChildren();
 $('fillState').textContent=d.enabled?'Background collection is enabled.':'Background collection is paused.';
 const b=d.board||{};$('fillBudget').textContent=`UTC day: ${b.day||'—'} · board calls ${b.total||0}/${b.daily_limit||0} · background calls ${b.bg||0}/${b.background_limit||0}. ${b.blocked?'Board restriction: paused until reviewed.':''}`;
 const groups=new Map();for(const r of d.groups||[]){const lines=groups.get(r.eiin)||[];if(r.category)lines.push(`${r.category}: ${Number(r.saved)||0} saved / ${Number(r.total)||0} listed${Number(r.no_result)?`, ${r.no_result} no result`:''}`);else lines.push(r.state==='need_institution'?'Waiting for verified college list':r.state);groups.set(r.eiin,lines);}
 for(const [eiin,lines] of groups){const li=document.createElement('li'),strong=document.createElement('strong'),detail=document.createElement('span');strong.textContent=`EIIN ${eiin}`;detail.textContent=lines.join(' · ');li.append(strong,detail);list.append(li);}
 $('fillPanel').hidden=false;
}
async function load(){const data=await post('list');display(data);try{await loadCache();await loadFill();say('');}catch(error){say('Hellos loaded; database status unavailable: '+error.message);}}
form.addEventListener('submit',async event=>{
  event.preventDefault();secret=pass.value;const button=form.querySelector('button');button.disabled=true;say('Checking your passphrase…',true);
  try{await load();pass.value='';}catch(error){secret='';say(error.message);}
  finally{button.disabled=false;}
});
$('refresh').addEventListener('click',async()=>{try{await load();say('Hellos refreshed.',true);}catch(error){say(error.message);}});
$('lock').addEventListener('click',()=>{secret='';pass.value='';list.replaceChildren();card.hidden=false;inbox.hidden=true;$('cachePanel').hidden=true;$('fillPanel').hidden=true;say('Page locked.',true);pass.focus();});
$('clear').addEventListener('click',()=>$('clearDialog').showModal());
$('cancelClear').addEventListener('click',()=>$('clearDialog').close());
$('confirmClear').addEventListener('click',async()=>{
  const button=$('confirmClear');button.disabled=true;
  try{await post('clear');$('clearDialog').close();display({total:0,items:[]});say('All hellos deleted.',true);}catch(error){$('clearDialog').close();say(error.message);}
  finally{button.disabled=false;}
});

$('refreshCache').addEventListener('click',async()=>{try{await loadCache();say('Saved-record counts refreshed.',true);}catch(error){say(error.message);}});
$('clearCache').addEventListener('click',()=>$('cacheDialog').showModal());
$('cancelCache').addEventListener('click',()=>$('cacheDialog').close());
$('confirmCache').addEventListener('click',async()=>{
  const button=$('confirmCache');button.disabled=true;
  try{await post('cache/clear');$('cacheDialog').close();$('cacheCount').textContent='0 institute lists · 0 individual results';say('Saved board data deleted. Active searches may add records again.',true);}
  catch(error){$('cacheDialog').close();say(error.message);}finally{button.disabled=false;}
});

$('refreshFill').addEventListener('click',async()=>{try{await loadFill();say('Background progress refreshed.',true);}catch(e){say(e.message);}});
for(const [id,action] of [['pauseFill','fill/pause'],['resumeFill','fill/resume'],['resumeBoard','board/resume']])$(id).addEventListener('click',async()=>{try{if(id==='resumeBoard'&&!confirm('Confirm that the board permits access again. Do not bypass any challenge or restriction.'))return;await post(action);await loadFill();say('Updated.',true);}catch(e){say(e.message);}});

$('addEiins').addEventListener('click',async()=>{
 const values=$('additionalEiins').value.trim().split(/[\s,;]+/).filter(Boolean);
 if(!values.length||values.length>300||values.some(v=>!/^\d{6}$/.test(v))){say('Enter 1 to 300 six-digit EIINs, separated by spaces, commas or new lines.');return;}
 try{const data=await post('fill/add',{eiins:values});$('additionalEiins').value='';await loadFill();say(`${data.accepted} EIINs accepted; existing entries are unchanged.`,true);}catch(e){say(e.message);}
});
