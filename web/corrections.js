'use strict';
/* Corrections to site records after they are final (receipts, gate passes, consumption).
   The project manager asks HQ with a reason; an administrator or someone with
   "site_amend_approve" approves or rejects; the project manager then corrects
   the quantities once. The server checks every step (corrections.go). */

PERM_GROUPS[2][1].push(['site_amend_approve','Approve site corrections','Approve or reject a project manager’s request to correct a receipt, gate pass or consumption report already entered at site']);
PERM_LABEL.site_amend_approve=PERM_GROUPS[2][1].slice(-1)[0][1];
for(const p of ROLE_PRESETS) if(/^(Purchase manager|Director)/.test(p[0])&&!p[2].includes('site_amend_approve')) p[2].push('site_amend_approve');
Object.assign(ACT_PERM,{corrDecide:'site_amend_approve'});
if(!S.corrections) S.corrections=[];

const CORR_KIND={dispatches:'receipt',siteissues:'gate pass',consumption:'consumption report'};
const corrQtyKey=col=>col==='dispatches'?'recvQty':'qty';
const corrRefOf=c=>(S[c.refCol]||[]).find(x=>x.id===c.refId);
const corrOpenFor=id=>S.corrections.find(c=>c.refId===id&&(c.status==='pending'||c.status==='approved'));
const corrCanDecide=pid=>ui.role==='hq'&&!ui.preview&&(ui.me.admin||(can('site_amend_approve')&&(!((ui.me.access||{}).projects||[]).length||ui.me.access.projects.includes(pid))));
function corrStatus(c){return {pending:{label:'Waiting for HQ approval',tone:'amber'},approved:{label:'Approved · correction to be made',tone:'blue'},rejected:{label:'Rejected',tone:'red'},cancelled:{label:'Cancelled',tone:'plain'},done:{label:'Corrected',tone:'green'}}[c.status]||{label:c.status,tone:'plain'}}
function corrEligible(col,x){if(!x) return false;
  if(col==='dispatches') return x.status==='delivered'||x.status==='short';
  if(col==='siteissues') return (x.status==='approved'||x.status==='returned')&&!(x.dest==='site'&&x.kind!=='return');
  if(col==='consumption') return x.status==='authenticated';return false}
const corrRefNo=x=>x.no||(typeof gpNo==='function'?gpNo(x):'')||'';

// button(s) shown on a receipt / gate pass / consumption report
function corrBtn(col,x){if(!x) return '';const o=corrOpenFor(x.id);
  const hist=(x.corrections||[]).length?`<span class="chip plain" title="${esc((x.corrections||[]).map(h=>h.no+' by '+h.byName).join(', '))}">Corrected ${x.corrections.length}×</span>`:'';
  if(o) return hist+(o.status==='approved'&&ui.role==='site'&&isPM()?`<button class="btn sm primary" data-act="corrDo" data-id="${o.id}">${icon('edit')} Make the correction</button>`:chip(corrStatus(o)));
  if(ui.role==='site'&&!ui.preview&&isPM()&&corrEligible(col,x)&&x.projectId===siteProject()) return hist+`<button class="btn sm" data-act="corrAsk" data-col="${col}" data-id="${x.id}">${icon('edit')} Request correction</button>`;
  return hist}

A.corrAsk=d=>{const x=(S[d.col]||[]).find(y=>y.id===d.id);if(!x) return;
  confirmBox({title:'Request correction · '+esc(corrRefNo(x)),body:`<p>Ask HQ to allow a correction of this ${CORR_KIND[d.col]}. When it is approved you can correct the quantities once. HQ sees the old and new quantities.</p>`,note:'What is wrong, and what should it be?',notePh:'e.g. 50 bags received, not 500 — entered wrongly',noteVal:'',noteArea:true,yes:'Send to HQ',onYes:async m=>{
    const reason=String(m.noteVal||'').trim();if(!reason){toast('Write what is wrong and why.','err');return}
    if(await run(async()=>{const no=await allocNo('AR',S.corrections);await setDoc('corrections',newId(),{no,refCol:d.col,refId:x.id,reason})},'Correction request sent to HQ for approval.')) closeModal()}})};
A.corrCancel=d=>{const c=S.corrections.find(y=>y.id===d.id);if(!c) return;confirmBox({title:'Cancel '+esc(c.no)+'?',body:'The request is closed and nothing is changed.',yes:'Cancel request',danger:true,onYes:async()=>{if(await run(()=>updDoc('corrections',c.id,{status:'cancelled'}),'Request cancelled.')) closeModal()}})};
A.corrDecide=d=>{const c=S.corrections.find(y=>y.id===d.id);if(!c) return;const ok=d.s==='approved';const x=corrRefOf(c);
  confirmBox({title:(ok?'Approve ':'Reject ')+esc(c.no),body:`<p><b>${esc(projName(c.projectId))}</b> · ${esc(c.kind||'')} <b>${esc(c.refNo||'')}</b> · asked by ${esc(c.byName||'')} on ${fdt(c.at)}</p><div class="notice">${icon('chat')}<span>${esc(c.reason)}</span></div>${x?corrLinesTable(c.refCol,x):''}${ok?'<p class="small muted">The project manager can then correct the quantities once. You will see the old and new values here.</p>':''}`,
    note:ok?'Note to the site (optional)':'Why is it rejected?',noteVal:'',noteArea:true,yes:ok?'Approve':'Reject',danger:!ok,onYes:async m=>{const note=String(m.noteVal||'').trim();if(!ok&&!note){toast('Write why it is rejected.','err');return}
      if(await run(()=>updDoc('corrections',c.id,{status:d.s,note}),ok?'Approved. The project manager can now correct it.':'Request rejected.')) closeModal()}})};
function corrLinesTable(col,x,c){const k=corrQtyKey(col);const done=c&&c.done;
  return `<div class="tw"><table class="t"><thead><tr><th>Item</th>${col==='dispatches'?'<th class="num">Sent</th>':''}<th class="num">${done?'Was':'Entered'}</th>${done?'<th class="num">Corrected to</th>':''}</tr></thead><tbody>${(x.lines||[]).map((l,i)=>`<tr><td>${esc(l.desc)} <small class="muted">${esc(l.spec||'')}</small></td>${col==='dispatches'?`<td class="num mono">${fq(l.qty)} ${esc(l.unit)}</td>`:''}<td class="num mono">${fq(done?done.before[i]:l[k])} ${esc(l.unit)}</td>${done?`<td class="num mono ${num(done.before[i])!==num(done.after[i])?'t-red':''}">${fq(done.after[i])}</td>`:''}</tr>`).join('')}</tbody></table></div>`}

// the correction itself
A.corrDo=d=>{const c=S.corrections.find(y=>y.id===d.id);const x=c&&corrRefOf(c);if(!x){toast('The record was not found.','err');return}
  const k=corrQtyKey(c.refCol);const q={};(x.lines||[]).forEach((l,i)=>q[i]=String(num(l[k])));openModal({type:'corrEdit',id:c.id,d:{q,note:''}})};
function corrModal(m,busy){const c=S.corrections.find(y=>y.id===m.id);const x=c&&corrRefOf(c);if(!x) return wrap('Correction','<p>Not found.</p>','<button class="btn" data-act="closeModal">Close</button>');
  const k=corrQtyKey(c.refCol),lab=c.refCol==='dispatches'?'Received':c.refCol==='siteissues'?'Issued':'Consumed';
  return wrap('Correct '+esc(c.kind)+' · '+esc(c.refNo||''),`<div class="notice">${icon('check')}<span>Approved by <b>${esc((c.decision||{}).byName||'HQ')}</b>${(c.decision||{}).note?': '+esc(c.decision.note):''}. Your request: ${esc(c.reason)}</span></div>
    <div class="tw"><table class="t"><thead><tr><th>Item</th>${c.refCol==='dispatches'?'<th class="num">Sent / supplied</th>':''}<th class="num">${lab} (entered)</th><th class="num">Correct ${lab.toLowerCase()}</th></tr></thead><tbody>${(x.lines||[]).map((l,i)=>`<tr><td><b>${esc(l.desc)}</b><small class="muted block">${esc(l.spec||'')}</small></td>${c.refCol==='dispatches'?`<td class="num mono">${fq(l.qty)} ${esc(l.unit)}</td>`:''}<td class="num mono">${fq(l[k])} ${esc(l.unit)}</td><td class="num"><input class="inp sm qty" id="cq-${i}" data-bind="modal.d.q.${i}" value="${esc(m.d.q[i]??'')}" inputmode="decimal"></td></tr>`).join('')}</tbody></table></div>
    ${field('Note (optional)','modal.d.note',m.d.note)}<p class="small muted">This can be done once. Site stock is recalculated, and HQ sees the old and new quantities.</p>`,
    `<button class="btn" data-act="closeModal">Close</button><button class="btn primary" data-act="corrSave" ${busy}>${icon('check')} Save correction</button>`,'wide')}
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='corrEdit'?corrModal(m,busy):prev(m,busy)}
A.corrSave=async()=>{const m=ui.modal;const c=S.corrections.find(y=>y.id===m.id);const x=c&&corrRefOf(c);if(!x) return;const k=corrQtyKey(c.refCol);
  const vals=(x.lines||[]).map((l,i)=>String(m.d.q[i]??'').trim());if(vals.some(v=>v===''||!(num(v)>=0))){toast('Enter a valid quantity on every line (0 if none).','err');return}
  const nv=vals.map(v=>Math.round(num(v)*1000)/1000);if(nv.every((v,i)=>v===num(x.lines[i][k]))){toast('Nothing was changed.','err');return}
  // site stock must not go below zero
  const sgn=c.refCol==='dispatches'?1:-1;const delta={};(x.lines||[]).forEach((l,i)=>{const key=l.itemKey||itemKey(l.desc,l.spec,l.unit);delta[key]=(delta[key]||0)+sgn*(nv[i]-num(l[k]))});
  for(const [key,dv] of Object.entries(delta)){const r=(D.site[x.projectId]||{})[key];if(dv<0&&r&&r.bal+dv<-1e-9){toast(`${r.desc}: site stock would go below zero (${fq(r.bal)} ${r.unit} in stock). Correct the later issues or consumption first.`,'err');return}}
  const lines=(x.lines||[]).map((l,i)=>Object.assign({},l,{[k]:nv[i]}));
  if(await run(()=>updDoc(c.refCol,x.id,{_correction:c.id,lines,corrNote:String(m.d.note||'').trim()}),'Correction saved. Site stock updated.')) closeModal()};

// lists: site home (project manager) and HQ dashboard (approvers)
function corrRow(c,acts){const x=corrRefOf(c);return `<div class="li"><div class="grow"><b>${esc(c.no)} · ${esc(c.kind||'')} ${esc(c.refNo||'')}</b><small>${ui.role==='hq'?esc(projName(c.projectId))+' · ':''}${esc(c.byName||'')} · ${fdt(c.at)} — ${esc(c.reason)}</small>${c.decision&&c.decision.note?`<small class="muted">HQ: ${esc(c.decision.note)}</small>`:''}${c.done?`<small class="muted">Corrected by ${esc(c.done.byName)} on ${fdt(c.done.at)}: ${(x&&x.lines||[]).map((l,i)=>num(c.done.before[i])!==num(c.done.after[i])?esc(l.desc)+' '+fq(c.done.before[i])+' → '+fq(c.done.after[i]):'').filter(Boolean).join(', ')}</small>`:''}</div>${chip(corrStatus(c))}${acts||''}</div>`}
function corrSiteCard(pid){if(!isPM()) return '';const week=Date.now()-7*864e5;
  const ls=S.corrections.filter(c=>c.projectId===pid&&(c.status==='pending'||c.status==='approved'||(c.decision&&c.decision.at>week)||(c.done&&c.done.at>week))).sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,8);if(!ls.length) return '';
  return `<section class="card"><div class="card-h"><h2>Correction requests</h2><span class="sub">Receipts, gate passes and consumption</span></div><div class="list">${ls.map(c=>corrRow(c,c.status==='approved'?`<button class="btn sm primary" data-act="corrDo" data-id="${c.id}">${icon('edit')} Make the correction</button><button class="btn sm ghost" data-act="corrCancel" data-id="${c.id}">Cancel</button>`:c.status==='pending'?`<button class="btn sm ghost" data-act="corrCancel" data-id="${c.id}">Cancel</button>`:'')).join('')}</div></section>`}
function corrHQCard(){const ls=S.corrections.filter(c=>c.status==='pending'&&corrCanDecide(c.projectId)).sort((a,b)=>(a.at||0)-(b.at||0));
  const recent=S.corrections.filter(c=>c.status==='done'&&c.done&&c.done.at>Date.now()-7*864e5).sort((a,b)=>b.done.at-a.done.at).slice(0,5);if(!ls.length&&!recent.length) return '';
  return `<section class="card" id="corr-hq"><div class="card-h"><h2>Site correction requests</h2>${ls.length?`<span class="chip amber">${ls.length} waiting</span>`:''}<span class="sub">Project managers asking to correct a receipt, gate pass or consumption</span></div><div class="list">${ls.map(c=>corrRow(c,`<button class="btn sm primary" data-act="corrDecide" data-id="${c.id}" data-s="approved">${icon('check')} Approve</button><button class="btn sm danger" data-act="corrDecide" data-id="${c.id}" data-s="rejected">Reject</button>`)).join('')}${recent.map(c=>corrRow(c)).join('')}</div></section>`}
