import {apiUrl} from './api-config.js?v=gh-oracle-20261102a';
import {visitorId,forgetQueue} from './visitor.js?v=gh-oracle-20261102a';
const $=id=>document.getElementById(id);
const online=$('onlineText'),form=$('helloForm'),name=$('helloName'),send=$('helloSend'),status=$('helloStatus');
const SENT_KEY='chattogram-hsc-hello-sent-v2';
async function post(path,data,keepalive=false) {
  const response=await fetch(apiUrl(path),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor_id:visitorId,...data}),cache:'no-store',keepalive});
  let result;try{result=await response.json();}catch{throw new Error('This feature is temporarily unavailable. Please try again.');}
  if(!response.ok)throw new Error(result.message||'This feature is temporarily unavailable. Please try again.');
  return result;
}
let heartbeatPending=false,lastHeartbeat=0;
async function heartbeat(force=false) {
  if(heartbeatPending||(!force&&Date.now()-lastHeartbeat<15_000))return;
  heartbeatPending=true;lastHeartbeat=Date.now();
  try {const data=await post('presence',{});online.textContent=`Online: ~${Number(data.online)||0} tabs`;}
  catch {online.textContent='Online: —';}
  finally{heartbeatPending=false;}
}
function markSent(already=false) {
  send.disabled=true;name.disabled=true;send.textContent='Sent ♥';
  status.classList.remove('error');status.textContent=already?'You already sent a hello from this tab. Thank you!':'Thank you! Your optional hello was sent to the site owner.';
  try{sessionStorage.setItem(SENT_KEY,'1');}catch{}
}
try{if(sessionStorage.getItem(SENT_KEY)==='1')markSent(true);}catch{}
form.addEventListener('submit',async event=>{
  event.preventDefault();if(send.disabled)return;
  send.disabled=true;status.classList.remove('error');status.textContent='Sending your hello…';
  try{const result=await post('hello',{nickname:name.value.trim()});markSent(Boolean(result.already));}
  catch(error){status.textContent=error.message;status.classList.add('error');send.disabled=false;}
});
heartbeat(true);setInterval(()=>heartbeat(),45_000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')heartbeat();});
window.addEventListener('pageshow',()=>heartbeat());
window.addEventListener('pagehide',()=>{
  forgetQueue();
  try{post('presence/leave',{},true).catch(()=>{});}catch{}
});
