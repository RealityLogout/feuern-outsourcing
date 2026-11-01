import { ServerEngine } from './server-engine.js?v=gh-oracle-20261102a';
import { jobTable,jobCsv } from './engine.js?v=gh-oracle-20261102a';
import { makeXlsx } from './xlsx.js?v=gh-oracle-20261102a';
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const el = {
    form:$('searchForm'),fields:$('setupFields'),alert:$('alertBox'),college:$('collegeQuery'),find:$('findInstitute'),lookupStatus:$('lookupStatus'),lookupText:$('lookupText'),cancelLookup:$('cancelLookup'),
    refresh:$('refreshBoard'),web:$('webSearch'),google:$('googleLink'),suggestions:$('suggestionArea'),pdf:$('pdfInput'),drop:$('dropZone'),
    manual:$('manualRolls'),loadManual:$('loadManual'),sourceEmpty:$('sourceEmpty'),sourceSummary:$('sourceSummary'),
    sourceTag:$('sourceTag'),sourceCount:$('sourceCount'),sourceName:$('sourceName'),sourceMeta:$('sourceMeta'),
    groupCards:$('groupCards'),listedNote:$('listedNote'),reviewGroup:$('reviewGroup'),rollList:$('rollList'),warnings:$('sourceWarnings'),
    incompleteLabel:$('incompleteLabel'),confirmIncomplete:$('confirmIncomplete'),remember:$('rememberProgress'),group:$('groupSelect'),
    othersLabel:$('othersLabel'),includeOthers:$('includeOthers'),target:$('targetName'),similar:$('similarNames'),
    threshold:$('threshold'),stopOnMatch:$('stopOnMatch'),delay:$('delay'),planCount:$('planCount'),planTime:$('planTime'),
    start:$('startButton'),statusBadge:$('statusBadge'),statusText:$('statusText'),checked:$('checkedMetric'),matches:$('matchMetric'),
    noResult:$('noResultMetric'),track:$('progressTrack'),fill:$('progressFill'),progressLabel:$('progressLabel'),
    progressPercent:$('progressPercent'),activity:$('activity'),activityTitle:$('activityTitle'),activityText:$('activityText'),
    retryText:$('retryText'),estimate:$('estimateText'),controls:$('jobControls'),pause:$('pauseButton'),resume:$('resumeButton'),
    stop:$('stopButton'),clear:$('clearButton'),resultCount:$('resultCount'),allCount:$('allCount'),matchesCount:$('matchesCount'),
    similarCount:$('similarCount'),emptyCount:$('emptyCount'),empty:$('emptyState'),emptyTitle:$('emptyTitle'),emptyText:$('emptyText'),
    tableWrap:$('tableWrap'),rows:$('resultRows'),downloadAll:$('downloadAll'),downloadMatches:$('downloadMatches'),downloadCsv:$('downloadCsv'),recoveryBox:$('recoveryBox'),copyRecovery:$('copyRecovery'),retryRecovery:$('retryRecovery'),recoveryLink:$('recoveryLink'),recoveryMessage:$('recoveryMessage'),
    csvNote:$('csvNote'),dialog:$('detailDialog'),dialogTitle:$('dialogTitle'),dialogBody:$('dialogBody'),
    closeDialog:$('closeDialog'),closeDialogBottom:$('closeDialogBottom'),
  };
  const groupNames = {science:'Science', business:'Business Studies', humanities:'Humanities', others:'Unsuccessful / Others', unclassified:'Unclassified', all:'All groups'};
  const activeStates = new Set(['running','pausing','paused','match_found','attention','fallback_review','stopping']);
  let source = null, job = null, results = [], busy = false, restoring = true, revision = 0, pollTimer = null;
  let selectedFilter = 'all', tableKey = '', connectionWarning = false;

  const engine = new ServerEngine(info => {
    if(info && info.waiting) {
      el.suggestions.hidden=false;
      el.lookupText.textContent=info.message || 'Other visitors are using the board. Waiting for a safe turn…';
      el.suggestions.replaceChildren(make('div','suggestion-message',el.lookupText.textContent));
    }
    if(engine.saveWarning) {
      el.remember.checked=false;alert(engine.saveWarning);engine.saveWarning='';
    }
  });
  async function api(path, options = {}) { return engine.api(path,options); }
  el.remember.addEventListener('change',()=>engine.setRemember(el.remember.checked));
  window.addEventListener('beforeunload',event=>{
    if(engine.credentials && (!job || activeStates.has(job.status)||results.length) && !el.remember.checked && !engine.recoveryCopied) {event.preventDefault();event.returnValue='';}
  });
  function alert(message) { el.alert.textContent = message; el.alert.hidden = false; }
  function clearAlert() { el.alert.textContent = ''; el.alert.hidden = true; connectionWarning = false; }
  function make(tag, cls, text) { const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
  function groupLabel(key) { return groupNames[key] || key || 'Unknown'; }
  function toAscii(text) {
    const starts=[0x09e6,0x0660,0x06f0];
    return Array.from(text, ch => { const p=ch.codePointAt(0); for(const s of starts) if(p>=s&&p<=s+9)return String(p-s); return ch; }).join('');
  }
  function setTab(which) {
    for(const button of document.querySelectorAll('.tab')) {
      const on=button.dataset.source===which; button.classList.toggle('selected',on); button.setAttribute('aria-selected',String(on));
      const panel=$(button.getAttribute('aria-controls')); panel.hidden=!on;
    }
  }
  for(const button of document.querySelectorAll('.tab')) button.addEventListener('click',()=>setTab(button.dataset.source));

  function confirmChoice(title, message, affirmative='Continue') {
    return new Promise(resolve=>{
      const dialog=make('dialog','confirm-dialog'); dialog.setAttribute('aria-labelledby','confirmTitle');
      const head=make('div','dialog-header'); const heading=make('h2','',title); heading.id='confirmTitle'; head.append(heading);
      const body=make('div','dialog-body confirm-copy',message);
      const foot=make('div','dialog-foot'); const cancel=make('button','outline-button','Cancel');cancel.type='button';cancel.id='confirmNo';
      const proceed=make('button','secondary-button green',affirmative);proceed.type='button';proceed.id='confirmYes';
      foot.append(cancel,proceed);dialog.append(head,body,foot);document.body.append(dialog);
      let finished=false;
      const finish=accepted=>{
        if(finished)return;
        finished=true;
        if(dialog.open)dialog.close(accepted?'yes':'no');
        dialog.remove();resolve(accepted);
      };
      cancel.addEventListener('click',()=>finish(false));
      proceed.addEventListener('click',()=>finish(true));
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
      dialog.addEventListener('close',()=>finish(dialog.returnValue==='yes'),{once:true});
      dialog.showModal();
    });
  }
  async function confirmReplace() {
    if(!(job && results.length))return true;
    return confirmChoice('Replace the roll list?', 'Loading a new list clears the current checked results. Download the Excel file first if you want to keep them.', 'Replace list');
  }
  function setSource(next, keepSelection=false) {
    const prior=el.group.value;
    source=next; job=null; results=[]; selectedFilter='all'; tableKey=''; revision++; clearTimeout(pollTimer);
    el.confirmIncomplete.checked=false;
    el.group.replaceChildren();
    if (!source) {
      el.group.append(make('option','', 'Load a roll list first')); el.group.firstChild.value='';
    } else {
      const all=make('option','',`All sections (${source.unique_total.toLocaleString()} rolls)`); all.value='all'; el.group.append(all);
      for(const group of source.groups) {
        const opt=make('option','',`${group.label} (${group.count.toLocaleString()})`); opt.value=group.key;
        if(!group.count) opt.disabled=true;
        el.group.append(opt);
      }
      el.group.value=keepSelection && [...el.group.options].some(o=>o.value===prior) ? prior : 'all';
    }
    renderSource(); render();
  }

  function renderSource() {
    el.sourceEmpty.hidden=Boolean(source); el.sourceSummary.hidden=!source;
    el.warnings.hidden=!source || !source.warnings.length; el.incompleteLabel.hidden=!source || source.complete;
    if (!source) { el.warnings.textContent=''; return; }
    el.sourceTag.textContent=source.kind==='pdf'?'PDF LOADED':source.kind==='board'?'BOARD RESULT LOADED':'PASTED LIST LOADED';
    el.sourceCount.textContent=`${source.unique_total.toLocaleString()} listed rolls`;
    el.sourceName.textContent=source.name || (source.kind==='manual'?'Pasted roll list':'Uploaded roll list');
    const meta=[];
    if(source.eiin)meta.push(`EIIN ${source.eiin}`);
    if(source.page_count)meta.push(`${source.page_count} PDF ${source.page_count===1?'page':'pages'}`);
    if(source.appeared)meta.push(`${source.appeared} appeared`);
    if(source.passed)meta.push(`${source.passed} passed`);
    if(source.cache_saved_at)meta.push(`${source.from_cache?'Saved board list':'Board list checked'} ${new Date(source.cache_saved_at).toLocaleDateString()}`);
    el.sourceMeta.textContent=meta.join(' · ') || 'The list is ready to review.';
    el.groupCards.replaceChildren();
    for(const g of source.groups) {
      const box=make('div','group-card'); const title=make('span','',g.label==='Unsuccessful / Others'?'Others':g.label); title.title=g.label;
      box.append(title,make('strong','',g.count.toLocaleString())); el.groupCards.append(box);
    }
    const appeared=Number(source.appeared);
    const absences=source.groups.flatMap(g=>g.entries).filter(x=>/^ABS\.?$/i.test(x.list_value||'')).length;
    const explainAbsences=Boolean(source.appeared) && Number.isFinite(appeared) && absences>0 && appeared+absences===source.unique_total;
    el.listedNote.hidden=!explainAbsences;
    el.listedNote.textContent=explainAbsences ? `The listed total includes ${absences.toLocaleString()} ABS entries, in addition to the ${appeared.toLocaleString()} who appeared.` : '';
    const previous=el.reviewGroup.value; el.reviewGroup.replaceChildren();
    for(const g of source.groups) {const opt=make('option','',`${g.label} (${g.count})`);opt.value=g.key;el.reviewGroup.append(opt);}
    if([...el.reviewGroup.options].some(o=>o.value===previous))el.reviewGroup.value=previous;
    renderRollList();
    el.warnings.textContent=source.warnings.join('\n');
  }
  function renderRollList() {
    if(!source) { el.rollList.textContent=''; return; }
    const g=source.groups.find(x=>x.key===el.reviewGroup.value);
    el.rollList.textContent=g ? g.entries.map(x=>x.roll+(x.list_value?`[${x.list_value}]`:'' )).join(', ') : '';
  }
  el.reviewGroup.addEventListener('change',renderRollList);

  function plan() {
    if(!source || !el.group.value)return {primary:0,fallback:0,total:0};
    const key=el.group.value; const selected=key==='all'?source.groups:source.groups.filter(g=>g.key===key);
    const seen=new Set(); let primary=0, fallback=0;
    for(const g of selected) for(const x of g.entries) if(!seen.has(x.roll)){seen.add(x.roll);primary++;}
    const other=source.groups.find(g=>g.key==='others');
    if(['science','business','humanities'].includes(key) && el.includeOthers.checked && other)
      for(const x of other.entries) if(!seen.has(x.roll)){seen.add(x.roll);fallback++;}
    return {primary,fallback,total:primary+fallback};
  }
  function updatePlan() {
    const hasOther=Boolean(source && source.groups.some(g=>g.key==='others'&&g.count));
    const chosen=el.group.value; el.othersLabel.hidden=!(hasOther && ['science','business','humanities'].includes(chosen));
    const p=plan(); el.planCount.textContent=`${p.total.toLocaleString()} ${p.total===1?'roll':'rolls'}`;
    if(!p.total)el.planTime.textContent='Load a list to begin';
    else {
      const mins=Math.max(1,Math.ceil(p.total*Number(el.delay.value)/60));
      el.planTime.textContent=(p.fallback?`${p.primary} group + ${p.fallback} others · `:'')+`up to ${mins} min + responses if not saved`;
    }
    const hasName=Boolean(el.target.value.trim());
    el.similar.disabled=!hasName; el.stopOnMatch.disabled=!hasName; el.threshold.disabled=!hasName || !el.similar.checked;
  }
  for(const x of [el.group,el.includeOthers,el.delay,el.target,el.similar,el.confirmIncomplete]) x.addEventListener('change',()=>{updatePlan();render();});
  el.target.addEventListener('input',()=>{updatePlan();render();});
  el.college.addEventListener('input',()=>{el.google.href=`https://www.google.com/search?q=${encodeURIComponent(el.college.value.trim()+' EIIN Chattogram')}`;});

  async function loadEiin(eiin) {
    if(busy || !(await confirmReplace()))return;
    clearAlert();busy=true;el.lookupStatus.hidden=false;el.cancelLookup.disabled=false;el.lookupText.textContent='Searching the board for this college…';render();el.suggestions.hidden=false;el.suggestions.replaceChildren(make('div','suggestion-message','Searching the board for this college…'));
    try {
      const data=await api('/api/source/eiin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eiin,force:el.refresh.checked})});
      setSource(data.source); el.college.value=eiin;
      el.suggestions.replaceChildren(make('div','suggestion-message',(data.source.from_cache?'Loaded from saved board data. Confirm the institute and check the saved date below.':'Loaded from the board. Please confirm the institute name below.')+(data.source.background_queued?' Its groups are queued for background collection; visitor searches take priority.':'')));
    } catch(error) {
      if(error.message==='Lookup cancelled.')el.suggestions.replaceChildren(make('div','suggestion-message','College lookup cancelled. The previous list was not changed.'));
      else {alert(error.message);el.suggestions.replaceChildren(make('div','suggestion-message','Could not load this EIIN. Check the EIIN and try again.'));}
    }
    finally {busy=false;el.lookupStatus.hidden=true;render();}
  }
  el.cancelLookup.addEventListener('click',()=>{el.cancelLookup.disabled=true;el.lookupText.textContent='Cancelling the college lookup…';engine.cancelSource();});
  el.find.addEventListener('click',async()=>{
    if(busy)return;
    const query=toAscii(el.college.value.trim());
    if(/^\d{6}$/.test(query)){await loadEiin(query);return;}
    if(/^\d+$/.test(query)){alert('An EIIN must contain exactly six digits.');el.college.focus();return;}
    if(query.length<3){alert('Enter at least three characters of the college name, or a six-digit EIIN.');el.college.focus();return;}
    clearAlert(); busy=true; render(); el.suggestions.hidden=false;
    el.suggestions.replaceChildren(make('div','suggestion-message','Looking for possible institutions…'));
    try {
      const data=await api('/api/institutions/suggest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,web:el.web.checked})});
      el.suggestions.replaceChildren();
      if(!data.candidates.length)el.suggestions.append(make('div','suggestion-message','No suggestions found. Search Google manually or enter the EIIN directly.'));
      for(const candidate of data.candidates) {
        const wrap=make('div','suggestion'); const main=make('div','suggestion-main');
        main.append(make('strong','',candidate.name));
        const info=make('small','',`EIIN ${candidate.eiin}${candidate.location?' · '+candidate.location:''} · ${candidate.source}`);
        if(candidate.source_url && /^https?:\/\//i.test(candidate.source_url)) {
          const link=make('a','suggestion-source','Source ↗'); link.href=candidate.source_url;link.target='_blank';link.rel='noopener noreferrer'; info.append(link);
        }
        main.append(info); const choose=make('button','', 'Use EIIN');choose.type='button';choose.addEventListener('click',()=>loadEiin(candidate.eiin));
        wrap.append(main,choose);el.suggestions.append(wrap);
      }
      const note=[data.note,data.warning].filter(Boolean).join(' ');if(note)el.suggestions.append(make('div','suggestion-message',note));
    } catch(error) { alert(error.message); el.suggestions.replaceChildren(make('div','suggestion-message','Could not search the directory. You can enter an EIIN directly.')); }
    finally {busy=false;render();}
  });
  el.college.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();el.find.click();}});

  async function loadPdf(file) {
    if(!file || busy)return;
    if(!(await confirmReplace())){el.pdf.value='';return;}
    if(file.size>20*1024*1024){alert('This PDF is larger than 20 MB. Use a smaller file.');el.pdf.value='';return;}
    clearAlert();busy=true;render();
    try {const data=await api('/api/source/pdf',{method:'POST',headers:{'Content-Type':'application/pdf'},body:file});setSource(data.source);setTab('pdf');}
    catch(error){alert(`${error.message} The previous list was not changed.`);}
    finally{busy=false;el.pdf.value='';render();}
  }
  el.pdf.addEventListener('change',event=>loadPdf(event.target.files[0]));
  for(const type of ['dragenter','dragover'])el.drop.addEventListener(type,event=>{event.preventDefault();if(!el.fields.disabled)el.drop.classList.add('dragging');});
  for(const type of ['dragleave','drop'])el.drop.addEventListener(type,event=>{event.preventDefault();el.drop.classList.remove('dragging');});
  el.drop.addEventListener('drop',event=>{if(!el.fields.disabled && event.dataTransfer.files.length)loadPdf(event.dataTransfer.files[0]);});
  el.loadManual.addEventListener('click',async()=>{
    if(busy || !(await confirmReplace()))return; clearAlert();busy=true;render();
    try{const data=await api('/api/source/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rolls:el.manual.value})});setSource(data.source);setTab('manual');}
    catch(error){alert(error.message);}
    finally{busy=false;render();}
  });

  function statusView() {
    if(connectionWarning)return {badge:'Unavailable',cls:'attention',box:'warning',title:'The search service is temporarily unavailable',text:'A hosting or database limit or outage may be responsible. Try again later and save your private recovery link.'};
    if(!job)return {badge:'Ready',cls:'ready',box:'neutral',title:'Ready when you are',text:'Load a roll list and choose a group to get started.'};
    switch(job.status) {
      case 'running': {
        const phase=groupLabel(job.current_category);
        if(job.wait_reason==='queue')return {badge:'Waiting',cls:'running',box:'neutral',title:'Waiting for a safe turn',text:`${job.message} Retrying roll ${job.current_roll} in about ${job.cooldown_in} seconds.`};
        if(job.wait_reason==='auto_retry')return {badge:'Retrying',cls:'attention',box:'warning',title:'Temporary board error',text:`${job.message} About ${job.cooldown_in} seconds remaining.`};
        if(!job.in_flight && job.cooldown_in>0)return {badge:'Searching',cls:'running',box:'neutral',title:'Waiting before the next request',text:`Next: ${phase}, roll ${job.current_roll}. ${job.cooldown_in} second(s) left in the request gap.`};
        return {badge:'Searching',cls:'running',box:'neutral',title:job.current_roll?`Checking roll ${job.current_roll}`:'Starting search',text:`Section: ${phase}. Individual results are checked one at a time.`};
      }
      case 'pausing':return {badge:'Pausing',cls:'ready',box:'neutral',title:'Pausing search',text:job.message};
      case 'paused':return {badge:'Paused',cls:'ready',box:'neutral',title:'Search paused',text:job.message};
      case 'match_found':{
        const row=[...results].reverse().find(x=>x.match && x.match!=='none');
        if(!row)return {badge:'Match found',cls:'match',box:'success',title:'Possible match found',text:job.message};
        const kind=row.match==='similar'?`Possible spelling match (${row.similarity}%)`:(row.match==='exact'?'Exact name match':'Partial name match');
        const mismatch=row.group_mismatch?` The individual result says ${row.group}, a different group from the one selected.`:'';
        return {badge:row.match==='similar'?'Possible match':'Match found',cls:'match',box:'success',title:`${kind}: ${row.name}`,text:`Roll ${row.roll} · ${row.group || 'group not shown'} · ${row.result || 'result not shown'}.${mismatch} Review the details, then stop or continue.`};
      }
      case 'fallback_review':return {badge:'Review next step',cls:'attention',box:'warning',title:'Selected group finished',text:job.message};
      case 'attention':return {badge:'Needs attention',cls:'attention',box:'warning',title:'Search needs attention',text:job.message};
      case 'stopping':return {badge:'Stopping',cls:'ready',box:'neutral',title:'Stopping search',text:job.message};
      case 'stopped':return {badge:'Stopped',cls:'ready',box:'neutral',title:'Search stopped',text:job.message};
      case 'completed':{
        const title=job.target?(job.matches?`Search complete · ${job.matches} ${job.matches===1?'match':'matches'}`:'Search complete · no matching names'):'Search complete';
        const extra=job.no_result?` ${job.no_result} rolls returned no result, so their names could not be checked.`:'';
        return {badge:'Completed',cls:'completed',box:job.matches?'success':'neutral',title,text:`${job.checked.toLocaleString()} roll${job.checked===1?'':'s'} checked.${extra} Download the Excel file to keep the details.`};
      }
      default:return {badge:'Ready',cls:'ready',box:'neutral',title:'Ready when you are',text:'Load a roll list and choose a group to get started.'};
    }
  }

  function renderResults() {
    el.resultCount.textContent=results.length; el.allCount.textContent=results.length;
    el.matchesCount.textContent=job?job.matches:0; el.similarCount.textContent=job?job.similar_count:0; el.emptyCount.textContent=job?job.no_result:0;
    const loading=Boolean(job&&results.length<job.checked);
    el.downloadAll.disabled=!results.length||loading;el.downloadMatches.disabled=!job||!job.matches||loading;el.downloadCsv.disabled=!results.length||loading;
    for(const b of document.querySelectorAll('.filter')){const on=b.dataset.filter===selectedFilter;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));}
    el.csvNote.textContent=loading?'Loading checked results before export…':job && job.checked<job.total ? `Excel contains ${job.checked} of ${job.total} planned rows so far. Continue to export the rest.` : 'Excel includes checked rows only, with one column per subject.';
    const key=`${job?job.id:'-'}:${results.length}:${selectedFilter}`; if(key===tableKey)return;tableKey=key;
    let shown=results;
    if(selectedFilter==='matches')shown=results.filter(x=>x.match&&x.match!=='none');
    if(selectedFilter==='similar')shown=results.filter(x=>x.match==='similar');
    if(selectedFilter==='no_result')shown=results.filter(x=>x.status==='no_result');
    el.rows.replaceChildren();
    if(!shown.length) {
      el.tableWrap.hidden=true;el.empty.hidden=false;
      el.emptyTitle.textContent=results.length?'Nothing in this filter':'Results will appear here';
      el.emptyText.textContent=results.length?'Try another filter to see the checked rolls.':'Review matches and open each row for full details.';
      return;
    }
    el.empty.hidden=true;el.tableWrap.hidden=false;const frag=document.createDocumentFragment();
    for(const row of [...shown].reverse()) {
      const tr=make('tr'); tr.append(make('td','',row.roll),make('td','',row.name||'—'));
      const group=make('td','',row.group||'—');if(row.group_mismatch)group.append(make('span','group-mismatch','Different group'));tr.append(group);
      let outcome=row.status==='no_result'?'No result':(row.result||'—'); if(row.gpa)outcome+=` · ${row.gpa}`;tr.append(make('td','',outcome));
      const statusCell=make('td'); const badge=make('span','match-pill');
      if(row.status==='no_result'){badge.classList.add('no-result');badge.textContent='NO RESULT';}
      else if(row.match==='similar'){badge.classList.add('similar');badge.textContent=`SIMILAR ${row.similarity}%`;}
      else if(row.match==='exact'||row.match==='partial'){badge.classList.add(row.match);badge.textContent=row.match==='exact'?'EXACT':'PARTIAL';}
      else badge.textContent='CHECKED';
      statusCell.append(badge);tr.append(statusCell);
      const detailsCell=make('td');const detail=make('button','detail-button','Details');detail.type='button';detail.addEventListener('click',()=>showDetails(row));detailsCell.append(detail);tr.append(detailsCell);frag.append(tr);
    }
    el.rows.append(frag);
  }

  function showDetails(row) {
    el.dialogTitle.textContent=`Roll ${row.roll}${row.name?' · '+row.name:''}`;el.dialogBody.replaceChildren();
    const dl=make('dl','detail-grid');
    const fields=[['Roll Number',row.roll],['Name',row.name],['Board',row.board],["Father’s Name",row.father_name],['Group',row.group],["Mother’s Name",row.mother_name],['Session',row.session],['Registration Number',row.reg_no],['Type',row.student_type],['Institute',row.institute],['Result',row.result],['GPA',row.gpa],['List section',groupLabel(row.category)],['Board list GPA / code',row.list_value],['PDF page(s)',(row.pages||[]).join(', ')]];
    for(const [label,value] of fields){const item=make('div','detail-item');item.append(make('dt','',label),make('dd','',value||'—'));dl.append(item);}
    el.dialogBody.append(dl);
    if(row.cache_saved_at)el.dialogBody.append(make('p','hint',`${row.from_cache?'Saved result':'Fetched from board'} · board checked ${new Date(row.cache_saved_at).toLocaleString()}. Saved results may be out of date.`));
    if(row.group_mismatch)el.dialogBody.append(make('p','detail-warning',`The individual result says ${row.group}; this differs from the group selected for the search.`));
    if(row.notes && row.notes.length)el.dialogBody.append(make('p','detail-warning',row.notes.join(' ')));
    el.dialogBody.append(make('h3','subject-title','Subject-wise marks'));
    if(row.subjects && row.subjects.length){
      const wrapper=make('div','subject-table'); const table=make('table');const head=make('thead');const hr=make('tr');hr.append(make('th','','Subject'),make('th','','Grade / marks'));head.append(hr);table.append(head);const body=make('tbody');
      for(const subject of row.subjects){const tr=make('tr');tr.append(make('td','',subject.subject),make('td','',subject.marks));body.append(tr);}table.append(body);wrapper.append(table);el.dialogBody.append(wrapper);
    } else el.dialogBody.append(make('p','hint','No subject-wise marks were returned for this roll.'));
    if(!el.dialog.open)el.dialog.showModal();
  }
  el.closeDialog.addEventListener('click',()=>el.dialog.close()); el.closeDialogBottom.addEventListener('click',()=>el.dialog.close());

  function render() {
    const active=Boolean(job&&activeStates.has(job.status)),unknown=Boolean(engine.credentials&&!job);
    el.fields.disabled=active||busy||restoring||unknown;
    updatePlan();
    el.start.disabled=active||busy||restoring||unknown||!source||!plan().total||(source&&!source.complete&&!el.confirmIncomplete.checked);
    el.start.querySelector('.button-label').textContent=active?'Search in progress':(job?'Start a new search':'Start searching');
    const view=statusView();el.statusBadge.className=`badge ${view.cls}`;el.statusText.textContent=view.badge;
    const checked=job?job.checked:0,total=job?job.total:0,percent=total?Math.round(checked*100/total):0;
    el.checked.replaceChildren(document.createTextNode(checked.toLocaleString()));el.checked.append(make('em','',` / ${total.toLocaleString()}`));
    el.matches.textContent=job?job.matches.toLocaleString():'0';el.noResult.textContent=job?job.no_result.toLocaleString():'0';
    el.fill.style.width=`${percent}%`;el.track.setAttribute('aria-valuenow',String(percent));
    el.progressLabel.textContent=total?`${checked.toLocaleString()} of ${total.toLocaleString()} checked`:'Nothing checked yet';el.progressPercent.textContent=`${percent}%`;
    el.activity.className=`activity ${view.box}`;el.activityTitle.textContent=view.title;el.activityText.textContent=view.text;
    el.retryText.hidden=!(job&&job.status==='attention'&&job.retry_in>0);if(!el.retryText.hidden)el.retryText.textContent=`Wait at least ${job.retry_in} seconds before retrying.`;
    if(job&&['stopped','completed'].includes(job.status))el.estimate.textContent=`${job.cached_count||0} saved results reused · ${job.live_count||0} checked at the board. Download Excel to keep your results.`;
    else if(job&&job.total>job.checked){const remain=job.total-job.checked;el.estimate.textContent=`${remain.toLocaleString()} remaining · ${job.cached_count||0} saved results reused. Saved records are fast; missing rolls need the shared board queue and at least a 3-second gap.`;}
    else el.estimate.textContent='Saved results are reused; missing results share the board queue and a 3-second gap.';
    el.recoveryBox.hidden=!engine.credentials;el.retryRecovery.hidden=!(unknown||connectionWarning);el.retryRecovery.disabled=restoring||busy;
    el.controls.hidden=!job;const st=job?job.status:'';
    el.pause.hidden=!['running','pausing'].includes(st);el.pause.disabled=busy||st==='pausing';el.pause.textContent=st==='pausing'?'Pausing…':'Pause';
    el.resume.hidden=!['paused','match_found','attention','fallback_review'].includes(st);el.resume.disabled=busy||(st==='attention'&&job.retry_in>0);
    el.resume.textContent=st==='attention'?'Retry current roll':st==='fallback_review'?'Check Unsuccessful / Others':st==='match_found'?'Continue to next':'Continue search';
    el.stop.hidden=!active;el.stop.disabled=busy||st==='stopping';el.stop.textContent=st==='stopping'?'Stopping…':st==='fallback_review'?'Finish here':'Stop';
    el.clear.hidden=!job||!['completed','stopped'].includes(st);el.clear.disabled=busy;
    renderResults();
  }

  function acceptJob(next, replace=false) {
    if(replace || !job || job.id!==next.id || next.offset===0) results=[...next.results];
    else if(next.offset===results.length) results.push(...next.results);
    else {results=[];}
    job=next;
  }
  function schedulePoll(ms=8000){
    clearTimeout(pollTimer);if(!job)return;
    if(results.length<job.checked){pollTimer=setTimeout(poll,350);return;}
    if(['running','pausing','stopping'].includes(job.status)){pollTimer=setTimeout(poll,ms);return;}
    if(job.status==='attention'&&job.retry_in>0)pollTimer=setTimeout(poll,Math.min(30000,Math.max(1000,job.retry_in*1000)));
  }
  async function poll(){
    if(!job)return;const rev=revision,id=job.id;
    try{const data=await api(`/api/jobs/${encodeURIComponent(id)}?after=${results.length}`);if(rev!==revision||!job||job.id!==id)return;acceptJob(data.job);if(connectionWarning)clearAlert();render();schedulePoll();}
    catch(error){
      if(rev!==revision||!job||job.id!==id)return;
      if(error.status===404){
        job.status='stopped';job.expired=true;job.message='This private search expired. Download any results already loaded in this tab.';job.checked=results.length;
        if(engine.job){engine.job.status='stopped';engine.job.expired=true;}engine.forget();
        alert('This private search has expired. Any results already loaded in this tab can still be downloaded.');render();return;
      }
      alert('The search service is unavailable. A hosting or database limit or outage may be responsible. Your private search may still be saved; try again later.');connectionWarning=true;render();clearTimeout(pollTimer);pollTimer=setTimeout(poll,60000);
    }
  }
  async function changeJob(action){
    if(!job||busy)return;clearAlert();revision++;clearTimeout(pollTimer);busy=true;render();
    try{const data=await api(`/api/jobs/${encodeURIComponent(job.id)}/${action}`,{method:'POST',body:''});acceptJob(data.job,true);}
    catch(error){alert(error.message);}
    finally{busy=false;render();schedulePoll(400);}
  }
  el.pause.addEventListener('click',()=>changeJob('pause'));el.resume.addEventListener('click',()=>changeJob('resume'));el.stop.addEventListener('click',()=>changeJob('stop'));
  el.clear.addEventListener('click',async()=>{
    if(!job||busy)return;
    if(!(await confirmChoice('Delete private progress?', 'This deletes this private search and its checked rows. Download Excel first if needed. Shared saved board records remain until the owner deletes them.', 'Delete private progress')))return;
    clearAlert();revision++;clearTimeout(pollTimer);busy=true;render();
    try{await api(`/api/jobs/${encodeURIComponent(job.id)}`,{method:'DELETE'});job=null;results=[];tableKey='';selectedFilter='all';}
    catch(error){alert(error.message);}
    finally{busy=false;render();}
  });

  el.form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!source||(engine.credentials&&!job)||(job&&activeStates.has(job.status)))return;
    if(!source.complete&&!el.confirmIncomplete.checked){alert('Review the extraction warnings and confirm the list may be incomplete.');return;}
    if(!plan().total){alert('Choose a group that contains rolls.');return;}
    const p=plan();
    const minutes=Math.max(1,Math.ceil(p.total*Number(el.delay.value)/60));
    const replaceNote=job&&results.length?' Starting a new search replaces the checked results, so download the Excel file first if needed.':'';
    const warning=`This search checks up to ${p.total.toLocaleString()} rolls. Saved results are reused unless you chose refresh. Missing rolls may take ${minutes} minutes or more, plus board response and queue time. The search runs on the server while you switch apps, but pauses on matches or board restrictions. Board-verified student details are saved until the owner deletes them and can be retrieved by other visitors. Only proceed if you are authorized to access these records.${replaceNote}`;
    if(!(await confirmChoice('Start this search?',warning,'Start search')))return;
    clearAlert();const name=el.target.value.trim();
    const payload={source_id:source.id,group:el.group.value,include_others:el.includeOthers.checked,target:name,similar:el.similar.checked,threshold:Number(el.threshold.value),stop_on_match:Boolean(name)&&el.stopOnMatch.checked,delay:Number(el.delay.value),force_refresh:el.refresh.checked,confirm_incomplete:el.confirmIncomplete.checked};
    revision++;clearTimeout(pollTimer);busy=true;render();
    try{const data=await api('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});acceptJob(data.job,true);selectedFilter='all';tableKey='';}
    catch(error){
      // A new job may exist even if its start response was lost. Do not show
      // stale rows from a different job or hide the new recovery link.
      if(engine.credentials&&(!job||engine.credentials.id!==job.id)){job=null;results=[];tableKey='';connectionWarning=true;}
      alert(error.message);
    }
    finally{busy=false;render();schedulePoll(350);}
  });
  for(const b of document.querySelectorAll('.filter'))b.addEventListener('click',()=>{selectedFilter=b.dataset.filter;renderResults();});
  async function download(scope,format='xlsx'){
    if(!job||!results.length||results.length<job.checked)return;
    try{
      const data={results,selected_group:job.selected_group},matches=scope==='matches';
      const blob=format==='csv'?new Blob([jobCsv(data,matches)],{type:'text/csv;charset=utf-8'}):makeXlsx(jobTable(data,matches));
      const url=URL.createObjectURL(blob),a=make('a');a.href=url;
      a.download=(matches?'hsc-2026-matches':'hsc-2026-checked-results')+(format==='csv'?'.csv':'.xlsx');
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){alert(error.message);}
  }
  el.downloadAll.addEventListener('click',()=>download('all'));el.downloadMatches.addEventListener('click',()=>download('matches'));el.downloadCsv.addEventListener('click',()=>download('all','csv'));
  el.copyRecovery.addEventListener('click',async()=>{
    try {
      const link=engine.resumeLink();
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(link);el.recoveryMessage.textContent='Private link copied. Save it somewhere safe; do not share it.';}
      else {el.recoveryLink.hidden=false;el.recoveryLink.value=link;el.recoveryLink.select();el.recoveryMessage.textContent='Copy this private link and save it somewhere safe; do not share it.';}
      engine.recoveryCopied=true;
    } catch {try{el.recoveryLink.hidden=false;el.recoveryLink.value=engine.resumeLink();el.recoveryLink.select();el.recoveryMessage.textContent='Copy this private link and keep it safe.';engine.recoveryCopied=true;}catch(error){alert(error.message);}}
  });

  async function restore(){
    clearAlert();restoring=true;render();
    try{
      const data=await api('/api/state');
      el.remember.checked=Boolean(data.remember);
      if(data.source){setSource(data.source);if(data.source.kind==='pdf')setTab('pdf');else if(data.source.kind==='manual')setTab('manual');}
      if(data.job){acceptJob(data.job,true);el.group.value=data.job.selected_group;el.includeOthers.checked=data.job.include_others;el.target.value=data.job.target;el.similar.checked=data.job.similar;el.threshold.value=String(data.job.threshold);el.stopOnMatch.checked=data.job.stop_on_match;el.delay.value=String(data.job.delay);}
    }catch(error){if(engine.credentials)connectionWarning=true;alert(engine.credentials?'Could not reconnect. The service may have reached a free-tier limit or experienced an outage. Save the recovery link and try again later.':'The private search was not found or has expired. You can start a new search.');}
    finally{restoring=false;render();schedulePoll(500);}
  }
  el.retryRecovery.addEventListener('click',()=>{if(job){clearTimeout(pollTimer);poll();}else restore();});
  restore();
})();
