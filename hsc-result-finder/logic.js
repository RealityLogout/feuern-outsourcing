/* Shared, browser-side parsing and matching. No student records are stored here. */
export const LABELS = {
  science: 'Science', business: 'Business Studies', humanities: 'Humanities',
  others: 'Unsuccessful / Others', unclassified: 'Unclassified / pasted rolls',
};
const MAX_ROLLS = 10000;

export function asciiDigits(text) {
  return Array.from(String(text ?? ''), ch => {
    const n = ch.codePointAt(0);
    for (const start of [0x09e6, 0x0660, 0x06f0]) if (n >= start && n <= start + 9) return String(n - start);
    return ch;
  }).join('');
}
export function normalize(text) {
  return String(text ?? '').normalize('NFKC').toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
export function groupKey(label) {
  const n=normalize(label);
  if (['science','science group'].includes(n)) return 'science';
  if (['business','business studies','commerce','business studies group'].includes(n)) return 'business';
  if (['humanities','humanity','arts','humanities group'].includes(n)) return 'humanities';
  if (n.includes('unsuccessful') || ['others','other'].includes(n)) return 'others';
  return 'unclassified';
}
function rollPattern() { return /(?:^|[^0-9])([0-9]{6})\s*\[\s*([^\]\r\n]{0,30}?)\s*\](?![0-9])/gm; }
function id() { return globalThis.crypto?.randomUUID?.() || `list-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function finalize(groups, declared, metadata, kind, warnings, complete=true) {
  const seen=new Map(), output=[];
  for (const [key,label] of Object.entries(LABELS)) {
    if (!Object.hasOwn(groups,key)) continue;
    const entries=groups[key], unique=[], local=new Set();
    for (const entry of entries) {
      if (local.has(entry.roll)) { warnings.push(`Roll ${entry.roll} repeats within ${label}; it will be checked once.`); complete=false; continue; }
      local.add(entry.roll);
      if (seen.has(entry.roll)) { warnings.push(`Roll ${entry.roll} appears in multiple sections; it will be checked once.`); complete=false; }
      else seen.set(entry.roll,key);
      unique.push(entry);
    }
    const expected=Object.hasOwn(declared,key)?declared[key]:null;
    if (expected!==null && expected!==entries.length) {
      warnings.push(`${label} says ${expected} rolls, but ${entries.length} were extracted. The list may be incomplete.`); complete=false;
    }
    output.push({key,label,declared:expected,count:unique.length,entries:unique});
  }
  if (!output.length || !seen.size) throw new Error('No roll numbers could be read. The PDF may be scanned or use a different layout; paste rolls instead.');
  if (seen.size>MAX_ROLLS) throw new Error('This list has more than 10,000 rolls. Use a smaller list.');
  return {id:id(),kind,name:metadata.name||'',eiin:metadata.eiin||'',appeared:metadata.appeared||'',
    passed:metadata.passed||'',pass_rate:metadata.pass_rate||'',page_count:metadata.page_count||null,
    unique_total:seen.size,groups:output,warnings:[...new Set(warnings)].slice(0,40),complete};
}
export function parseManual(text) {
  if (typeof text!=='string'||text.length>250000) throw new Error('Enter a shorter roll list.');
  const tokens=asciiDigits(text).trim().split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) throw new Error('Enter at least one roll number.');
  if (tokens.length>MAX_ROLLS*2) throw new Error('Too many entries; use a smaller list.');
  const invalid=tokens.filter(x=>!/^\d{1,6}$/.test(x));
  if (invalid.length) throw new Error(`Each roll must have one to six digits. Invalid: ${invalid.slice(0,3).join(', ')}`);
  const entries=[...new Set(tokens)].map(roll=>({roll,list_value:'',pages:[],category:'unclassified'}));
  return finalize({unclassified:entries},{},{},'manual',[],true);
}
export function parseBoardSource(eiin, data, headingCounts={}) {
  if (!data||typeof data!=='object'||!Array.isArray(data.groups)) throw new Error('The board did not return a recognizable institute result. Check the official site.');
  const full=String(data.inst||'').trim(), match=asciiDigits(full).match(/\(\s*(\d{6})\s*\)\s*$/);
  if (!match||match[1]!==eiin) throw new Error('The board returned a different or unrecognized institution. No rolls were loaded.');
  const groups={},declared={},warnings=[];let complete=true;
  for (const [k,v] of Object.entries(headingCounts||{})) if (Object.hasOwn(LABELS,k) && Number.isInteger(v)) declared[k]=v;
  for (const section of data.groups) {
    if (!section||!Array.isArray(section.rolls)) {warnings.push('The board returned a section in an unexpected format.');complete=false;continue;}
    const title=String(section.title||''),key=groupKey(title);groups[key]??=[];
    if (key==='unclassified') {warnings.push(`Unrecognized board section "${title}" was placed under Unclassified.`);complete=false;}
    for (const raw of section.rolls) {
      const m=typeof raw==='string'?asciiDigits(raw.trim()).match(/^([0-9]{6})\s*\[\s*([^\]\r\n]{0,30}?)\s*\]$/):null;
      if(!m){warnings.push(`An entry in ${LABELS[key]} could not be read.`);complete=false;continue;}
      groups[key].push({roll:m[1],list_value:m[2].trim(),pages:[],category:key});
    }
  }
  return finalize(groups,declared,{name:full.slice(0,match.index).trim(),eiin,appeared:String(data.app??''),
    passed:String(data.pass??''),pass_rate:String(data.percent??'')},'board',warnings,complete);
}

export function parsePdfPages(pages) {
  const groups={},declared={},warnings=[];let current=null,sawHeading=false,unknown=false,conflicting=false,empty=0;
  const header=/^[ \t]*([A-Z][A-Z \t&/\-]{1,65}?)[ \t]*\([ \t]*(\d{1,5})[ \t]*\)[ \t]*$/gm;
  for (let p=0;p<pages.length;p++) {
    const text=asciiDigits(pages[p]||''); if (!text.trim()) empty++;
    const events=[];header.lastIndex=0;
    for (const m of text.matchAll(header)) events.push({at:m.index,type:'heading',m});
    for (const m of text.matchAll(rollPattern())) events.push({at:m.index,type:'roll',m});
    events.sort((a,b)=>a.at-b.at);
    for(const event of events) {
      const m=event.m;
      if(event.type==='heading') {
        const title=m[1].trim().replace(/\s+/g,' '),key=groupKey(title);sawHeading=true;current=key;groups[key]??=[];
        if(key==='unclassified'){unknown=true;warnings.push(`Unrecognized section "${title}" was placed under Unclassified.`);}
        const expected=Number(m[2]);
        if(Object.hasOwn(declared,key)&&declared[key]!==expected){warnings.push(`${LABELS[key]} has conflicting section counts.`);conflicting=true;}
        else declared[key]=expected;
      } else if(current!==null) groups[current].push({roll:m[1],list_value:m[2].trim(),pages:[p+1],category:current});
    }
  }
  let complete=!empty&&!unknown&&!conflicting;
  if(empty)warnings.push(`${empty} page(s) had no extractable text. Scanned pages require OCR and may contain missing rolls.`);
  if(!sawHeading) {
    const entries=[];
    for(let p=0;p<pages.length;p++) {
      const text=asciiDigits(pages[p]||''),matches=[...text.matchAll(rollPattern())];
      if(matches.length) for(const m of matches) entries.push({roll:m[1],list_value:m[2].trim(),pages:[p+1],category:'unclassified'});
      else for(const m of text.matchAll(/(?:^|[^0-9])([0-9]{6})(?![0-9])/gm)) entries.push({roll:m[1],list_value:'',pages:[p+1],category:'unclassified'});
    }
    for(const key of Object.keys(groups))delete groups[key];groups.unclassified=entries;
    for(const key of Object.keys(declared))delete declared[key];
    warnings.push('No recognized group headings were found. Numbers are unclassified and may include EIINs or other numbers; review the original PDF.');complete=false;
  }
  const first=asciiDigits(pages[0]||''),metadata={page_count:pages.length};
  const name=first.match(/^\s*INSTITUTE\s+NAME\s*:\s*(.+?)\s*$/im);
  if(name) {
    metadata.name=name[1].trim();const eiin=metadata.name.match(/\(\s*(\d{6})\s*\)\s*$/);
    if(eiin){metadata.eiin=eiin[1];metadata.name=metadata.name.slice(0,eiin.index).trim();}
  }
  for(const [label,key] of [['APPEARED','appeared'],['PASSED','passed'],['PERCENT','pass_rate']]) {
    const found=first.match(new RegExp('^\\s*'+label+'\\s*:\\s*([^\\r\\n]+)','im'));if(found)metadata[key]=found[1].trim();
  }
  return finalize(groups,declared,metadata,'pdf',warnings,complete);
}
export async function parsePdf(file) {
  if (!(file instanceof Blob) || file.size>20*1024*1024) throw new Error('This PDF is larger than 20 MB. Use a smaller file.');
  const buffer=await file.arrayBuffer(); const head=new TextDecoder().decode(buffer.slice(0,1024));
  if(!head.includes('%PDF-'))throw new Error('That file does not appear to be a PDF.');
  try {
    const pdfjs=await import('./vendor/pdf.min.mjs?v=gh-oracle-20261102a');
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs?v=gh-oracle-20261102a',import.meta.url).href;
    const doc=await pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,disableFontFace:true,verbosity:0}).promise;
    if(!doc.numPages||doc.numPages>1000)throw new Error('The PDF must contain between 1 and 1,000 pages.');
    const pages=[];
    for(let i=1;i<=doc.numPages;i++) {
      try { const page=await doc.getPage(i),content=await page.getTextContent();
        pages.push(content.items.map(x=>(x.str||'')+(x.hasEOL?'\n':'')).join(''));page.cleanup(); }
      catch(_){pages.push('');}
    }
    await doc.destroy();return parsePdfPages(pages);
  } catch(e) {
    if(e?.message?.includes('No roll numbers')||e?.message?.includes('more than 10,000')||e?.message?.includes('1,000 pages'))throw e;
    throw new Error('Could not read this PDF. It may be scanned, encrypted, damaged, or use an unsupported layout.');
  }
}

function similarity(a,b) {
  if(!a||!b)return 0;const n=a.length,m=b.length;
  if(n>150||m>150)return 0;
  let prev=Array.from({length:m+1},(_,i)=>i),cur=new Array(m+1);
  for(let i=1;i<=n;i++) {cur[0]=i;for(let j=1;j<=m;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));[prev,cur]=[cur,prev];}
  return 1-prev[m]/Math.max(n,m);
}
export function classifyName(name,target,similar=true,threshold=80) {
  const candidate=normalize(name),wanted=normalize(target);
  if(!wanted||!candidate)return {match:'none',score:null};
  if(candidate===wanted)return {match:'exact',score:100};
  if(candidate.includes(wanted))return {match:'partial',score:null};
  if(!similar||wanted.replace(/\s/g,'').length<4)return {match:'none',score:null};
  const words=candidate.split(' '),n=wanted.split(' ').length,scores=[similarity(wanted,candidate)];
  for(const size of new Set([Math.max(1,n-1),n,Math.min(words.length,n+1)]))
    for(let i=0;i+size<=words.length;i++)scores.push(similarity(wanted,words.slice(i,i+size).join(' ')));
  const score=Math.round(Math.max(...scores)*100);return {match:score>=threshold?'similar':'none',score};
}
function collegeTokens(text) {
  const synonyms={chittagong:'chattogram',chattagram:'chattogram',ctg:'chattogram',mohila:'mahila',mohilae:'mahila',women:'mahila',womens:'mahila',government:'govt',corparation:'corporation',corp:'corporation'};
  return normalize(text).split(' ').filter(x=>x&&!['and','the','of','eiin','number'].includes(x)).map(x=>synonyms[x]||x);
}
export function collegeScore(query,candidate) {
  const q=collegeTokens(query),c=collegeTokens(candidate);if(!q.length||!c.length)return 0;
  const common=new Set(['college','school','city','corporation','mahila','chattogram','govt']);let score=0,total=0;
  for(const word of q){const weight=common.has(word)?.6:2;score+=weight*Math.max(...c.map(x=>similarity(word,x)));total+=weight;}
  return Math.round(100*(.78*score/total+.22*similarity(q.join(' '),c.join(' '))));
}
export async function suggestColleges(query,web=true,webSearch=null) {
  query=String(query||'').trim().replace(/\s+/g,' ');
  if(query.length<3||query.length>120)throw new Error('Enter at least 3 characters of the college name.');
  const response=await fetch('./institutions.json',{cache:'no-cache'});if(!response.ok)throw new Error('The local college directory could not be loaded.');
  const directory=await response.json();let candidates=[];
  for(const item of directory.entries){const score=collegeScore(query,item.name+' '+(item.location||''));if(score>=40)candidates.push({...item,source:'Local directory',source_url:directory.source,score});}
  let warning='';
  if(web&&webSearch) {
    try {const result=await webSearch(query);warning=result.warning||'';for(const item of result.candidates||[]){const score=collegeScore(query,item.name);if(score>=35)candidates.push({...item,score});}}
    catch(_){warning='Web suggestions were unavailable; local directory matches are shown instead.';}
  }
  candidates.sort((a,b)=>b.score-a.score||(a.source==='Local directory'?-1:1));
  const seen=new Set();candidates=candidates.filter(x=>{if(seen.has(x.eiin))return false;seen.add(x.eiin);return true;}).slice(0,10);
  return {query,candidates,warning,note:'Suggestions may be incomplete or wrong. Verify the official institute name after selecting an EIIN.'};
}
