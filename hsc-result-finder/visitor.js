import {apiUrl} from './api-config.js?v=gh-oracle-20261102a';
/* A random ID for this browser tab, used only for turn-taking and an approximate online count. */
const KEY='chattogram-hsc-tab-id-v2';
function randomId() {
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const b=new Uint8Array(16);
  if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(b);
  else for(let i=0;i<b.length;i++)b[i]=Math.floor(Math.random()*256);
  b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const h=[...b].map(n=>n.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
let id='';
try {id=sessionStorage.getItem(KEY)||'';if(!/^[0-9a-f-]{36}$/i.test(id)){id=randomId();sessionStorage.setItem(KEY,id);}}
catch {id=randomId();}
export const visitorId=id;
export function forgetQueue() {
  const body=JSON.stringify({visitor_id:visitorId});
  try {fetch(apiUrl('queue/cancel'),{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true,cache:'no-store'}).catch(()=>{});}catch{}
}
