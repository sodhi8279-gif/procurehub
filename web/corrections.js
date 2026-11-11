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

// the correction itself: quantities, and the details of the record (date, receiver, vehicle, challan, documents…)
const CORR_FIELDS={dispatches:[['receivedOn','Date received','date'],['receivedByName','Received by'],['receiverDesignation','Designation'],['vehicle','Vehicle no.'],['vendorChallan','Vendor challan no.'],['vendorInvoice','Invoice no.'],['siteRemarks','Remarks','area']],
  siteissues:[['vehicle','Vehicle no.'],['driver','Driver'],['lrNo','LR / e-way bill'],['remarks','Remarks','area']],
  consumption:[['date','Date','date'],['description','Work / description'],['location','Location'],['remarks','Remarks','area']]};
const CORR_DOCS={dispatches:[['billDocs',"Vendor's bill / tax invoice"],['signedDocs','Signed & stamped challan'],['photos','Photos of material']],consumption:[['photos','Photos']]};
const CORR_LABEL={receivedOn:'Date received',receivedByName:'Received by',receiverDesignation:'Designation',vehicle:'Vehicle',vendorChallan:'Challan no.',vendorInvoice:'Invoice no.',siteRemarks:'Remarks',remarks:'Remarks',driver:'Driver',lrNo:'LR no.',date:'Date',description:'Description',location:'Location',billDocs:'Vendor bill',signedDocs:'Signed challan',photos:'Photos'};
A.corrDo=d=>{const c=S.corrections.find(y=>y.id===d.id);const x=c&&corrRefOf(c);if(!x){toast('The record was not found.','err');return}
  const k=corrQtyKey(c.refCol);const q={},sq={};(x.lines||[]).forEach((l,i)=>{q[i]=String(num(l[k]));sq[i]=String(num(l.qty))});
  const f={};for(const [fk] of CORR_FIELDS[c.refCol]||[]) f[fk]=fk==='receivedOn'&&!x.receivedOn&&x.receivedAt?new Date(x.receivedAt).toISOString().slice(0,10):String(x[fk]??'');
  const docs={};for(const [dk] of CORR_DOCS[c.refCol]||[]) docs[dk]=(x[dk]||[]).slice();
  openModal({type:'corrEdit',id:c.id,d:{q,sq,f,f0:Object.assign({},f),docs,note:''}})};
function corrModal(m,busy){const c=S.corrections.find(y=>y.id===m.id);const x=c&&corrRefOf(c);if(!x) return wrap('Correction','<p>Not found.</p>','<button class="btn" data-act="closeModal">Close</button>');
  const k=corrQtyKey(c.refCol),lab=c.refCol==='dispatches'?'Received':c.refCol==='siteissues'?'Issued':'Consumed',dir=c.refCol==='dispatches'&&x.type==='direct';let n=0;
  return wrap('Correct '+esc(c.kind)+' · '+esc(c.refNo||''),`<div class="notice">${icon('check')}<span>Approved by <b>${esc((c.decision||{}).byName||'HQ')}</b>${(c.decision||{}).note?': '+esc(c.decision.note):''}. Your request: ${esc(c.reason)}</span></div>
    <div class="lbl">Quantities</div><div class="tw"><table class="t"><thead><tr><th>Item</th>${c.refCol==='dispatches'&&!dir?'<th class="num">Sent</th>':''}${dir?'<th class="num">As per vendor challan / invoice</th>':''}<th class="num">${lab} (entered)</th><th class="num">Correct ${lab.toLowerCase()}</th></tr></thead><tbody>${(x.lines||[]).map((l,i)=>`<tr><td><b>${esc(l.desc)}</b><small class="muted block">${esc(l.spec||'')}</small></td>${c.refCol==='dispatches'&&!dir?`<td class="num mono">${fq(l.qty)} ${esc(l.unit)}</td>`:''}${dir?`<td class="num"><input class="inp sm qty" id="csq-${i}" data-bind="modal.d.sq.${i}" value="${esc(m.d.sq[i]??'')}" inputmode="decimal"></td>`:''}<td class="num mono">${fq(l[k])} ${esc(l.unit)}</td><td class="num"><input class="inp sm qty" id="cq-${i}" data-bind="modal.d.q.${i}" value="${esc(m.d.q[i]??'')}" inputmode="decimal"></td></tr>`).join('')}</tbody></table></div>
    <div class="lbl">Details</div><div class="fields">${(CORR_FIELDS[c.refCol]||[]).filter(f=>f[2]!=='area').map(([fk,fl,t])=>field(fl,'modal.d.f.'+fk,m.d.f[fk],t==='date'?`type="date" max="${today()}"`:'')).join('')}</div>
    ${(CORR_FIELDS[c.refCol]||[]).filter(f=>f[2]==='area').map(([fk,fl])=>field(fl,'modal.d.f.'+fk,m.d.f[fk])).join('')}
    ${(CORR_DOCS[c.refCol]||[]).map(([dk,dl])=>docStep(++n,dl,'modal.d.docs.'+dk,m.d.docs[dk],false,'Remove a wrong file with × and upload the right one.')).join('')}
    ${field('Note about this correction (optional)','modal.d.note',m.d.note)}<p class="small muted">Change only what is wrong. This can be done once; HQ sees every old and new value. Site stock is recalculated.</p>`,
    `<button class="btn" data-act="closeModal">Close</button><button class="btn primary" data-act="corrSave" ${busy}>${icon('check')} Save correction</button>`,'wide')}
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='corrEdit'?corrModal(m,busy):prev(m,busy)}
A.corrSave=async()=>{const m=ui.modal;const c=S.corrections.find(y=>y.id===m.id);const x=c&&corrRefOf(c);if(!x) return;const k=corrQtyKey(c.refCol);const dir=c.refCol==='dispatches'&&x.type==='direct';
  const vals=(x.lines||[]).map((l,i)=>String(m.d.q[i]??'').trim());if(vals.some(v=>v===''||!(num(v)>=0))){toast('Enter a valid quantity on every line (0 if none).','err');return}
  const svals=dir?(x.lines||[]).map((l,i)=>String(m.d.sq[i]??'').trim()):[];if(svals.some(v=>v===''||!(num(v)>=0))){toast("Enter the vendor's quantity on every line.",'err');return}
  const r3=v=>Math.round(num(v)*1000)/1000;const nv=vals.map(r3),ns=svals.map(r3);
  const patch={_correction:c.id,corrNote:String(m.d.note||'').trim()};let changed=nv.some((v,i)=>v!==num(x.lines[i][k]))||ns.some((v,i)=>v!==num(x.lines[i].qty));
  for(const [fk] of CORR_FIELDS[c.refCol]||[]){const v=String(m.d.f[fk]??'').trim();if(v!==String(m.d.f0[fk]??'').trim()){patch[fk]=v;changed=true}}
  for(const [dk] of CORR_DOCS[c.refCol]||[]){const a=m.d.docs[dk]||[];if(JSON.stringify(a)!==JSON.stringify(x[dk]||[])){patch[dk]=a;changed=true}}
  if(c.refCol==='dispatches'&&patch.receivedByName!=null&&!patch.receivedByName){toast('Write who received the material.','err');return}
  if(patch.receivedOn&&patch.receivedOn>today()||patch.date&&patch.date>today()){toast('The date cannot be in the future.','err');return}
  if(!changed){toast('Nothing was changed.','err');return}
  // site stock must not go below zero
  const sgn=c.refCol==='dispatches'?1:-1;const delta={};(x.lines||[]).forEach((l,i)=>{const key=l.itemKey||itemKey(l.desc,l.spec,l.unit);delta[key]=(delta[key]||0)+sgn*(nv[i]-num(l[k]))});
  for(const [key,dv] of Object.entries(delta)){const r=(D.site[x.projectId]||{})[key];if(dv<0&&r&&r.bal+dv<-1e-9){toast(`${r.desc}: site stock would go below zero (${fq(r.bal)} ${r.unit} in stock). Correct the later issues or consumption first.`,'err');return}}
  patch.lines=(x.lines||[]).map((l,i)=>Object.assign({},l,{[k]:nv[i]},dir?{supQty:ns[i]}:{}));
  if(await run(()=>updDoc(c.refCol,x.id,patch),'Correction saved.')) closeModal()};
// what changed, in words
function corrChanges(c){const x=corrRefOf(c);const dn=c.done||{};const out=[];
  (x&&x.lines||[]).forEach((l,i)=>{if(dn.before&&num(dn.before[i])!==num(dn.after[i])) out.push(esc(l.desc)+' '+fq(dn.before[i])+' → '+fq(dn.after[i]));if(dn.supBefore&&num(dn.supBefore[i])!==num(dn.supAfter[i])) out.push(esc(l.desc)+' vendor qty '+fq(dn.supBefore[i])+' → '+fq(dn.supAfter[i]))});
  for(const [fk,v] of Object.entries(dn.fields||{})) if(['billDocs','signedDocs','photos'].includes(fk)) out.push(esc(CORR_LABEL[fk])+' replaced ('+esc(v.from)+' → '+esc(v.to)+')'); else out.push(esc(CORR_LABEL[fk]||fk)+' '+(String(v.from)===''?'—':esc(fk==='receivedOn'||fk==='date'?fd(v.from):v.from))+' → '+(String(v.to)===''?'—':esc(fk==='receivedOn'||fk==='date'?fd(v.to):v.to)));
  return out.join(' · ')}

// lists: site home (project manager) and HQ dashboard (approvers)
function corrRow(c,acts){const x=corrRefOf(c);return `<div class="li"><div class="grow"><b>${esc(c.no)} · ${esc(c.kind||'')} ${esc(c.refNo||'')}</b><small>${ui.role==='hq'?esc(projName(c.projectId))+' · ':''}${esc(c.byName||'')} · ${fdt(c.at)} — ${esc(c.reason)}</small>${c.decision&&c.decision.note?`<small class="muted">HQ: ${esc(c.decision.note)}</small>`:''}${c.done?`<small class="muted">Corrected by ${esc(c.done.byName)} on ${fdt(c.done.at)}: ${corrChanges(c)}</small>`:''}</div>${chip(corrStatus(c))}${acts||''}</div>`}
function corrSiteCard(pid){if(!isPM()) return '';const week=Date.now()-7*864e5;
  const ls=S.corrections.filter(c=>c.projectId===pid&&(c.status==='pending'||c.status==='approved'||(c.decision&&c.decision.at>week)||(c.done&&c.done.at>week))).sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,8);if(!ls.length) return '';
  return `<section class="card"><div class="card-h"><h2>Correction requests</h2><span class="sub">Receipts, gate passes and consumption</span></div><div class="list">${ls.map(c=>corrRow(c,c.status==='approved'?`<button class="btn sm primary" data-act="corrDo" data-id="${c.id}">${icon('edit')} Make the correction</button><button class="btn sm ghost" data-act="corrCancel" data-id="${c.id}">Cancel</button>`:c.status==='pending'?`<button class="btn sm ghost" data-act="corrCancel" data-id="${c.id}">Cancel</button>`:'')).join('')}</div></section>`}
function corrHQCard(){const ls=S.corrections.filter(c=>c.status==='pending'&&corrCanDecide(c.projectId)).sort((a,b)=>(a.at||0)-(b.at||0));
  const recent=S.corrections.filter(c=>c.status==='done'&&c.done&&c.done.at>Date.now()-7*864e5).sort((a,b)=>b.done.at-a.done.at).slice(0,5);if(!ls.length&&!recent.length) return '';
  return `<section class="card" id="corr-hq"><div class="card-h"><h2>Site correction requests</h2>${ls.length?`<span class="chip amber">${ls.length} waiting</span>`:''}<span class="sub">Project managers asking to correct a receipt, gate pass or consumption</span></div><div class="list">${ls.map(c=>corrRow(c,`<button class="btn sm primary" data-act="corrDecide" data-id="${c.id}" data-s="approved">${icon('check')} Approve</button><button class="btn sm danger" data-act="corrDecide" data-id="${c.id}" data-s="rejected">Reject</button>`)).join('')}${recent.map(c=>corrRow(c)).join('')}</div></section>`}
