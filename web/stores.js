"use strict";
/* ================= 6.6 STORES AT SITE, STOREKEEPER, PROJECT MANAGER, GATE PASSES =================
   - A site can have more than one store. Stock from before stores existed is in the "Main store".
   - Site logins have a role: project manager (raises demands, keeps stores and issue heads,
     approves), storekeeper (receives and issues for his stores, cannot raise demands) or
     site user (all tasks, as before).
   - Material leaves a store only on a gate pass approved by the project manager. It goes to an
     issue head (contractor, works contractor, company works, misc. consumption), another site,
     the company warehouse (HQ store) or back to a vendor. The gate pass number is given on approval.
   - Existing stock entered by the storekeeper counts once the project manager approves it.
   - Material issued to each head is kept with its value.
   - A site manager at HQ (right site_approve) looks after the sites assigned to him.
   - Freight can be recorded on receipts, transfers and gate passes.
   The server enforces the same rules (stores.go). */

SITE_VIEWS.push('s_gp','s_heads');
HQ_VIEWS.push('gatepasses');
Object.assign(VIEW_PERM,{gatepasses:['sitestock_view','site_approve']});
Object.assign(TITLES,{s_gp:['Gate passes','Material going out of the stores, approved by the project manager'],s_heads:['Stores & contractors','Stores of the site, contractors and issue heads'],gatepasses:['Gate passes','Material issued from site stores']});
PERM_GROUPS[2][1].push(['site_approve','Site manager — approve for assigned sites','For the sites assigned: approve gate passes and stock entered by storekeepers, keep their stores and contractors']);
PERM_LABEL.site_approve=PERM_GROUPS[2][1].slice(-1)[0][1];
ROLE_PRESETS.push(['Site manager','Looks after the sites assigned to him: demands, stores, stock and gate passes; approves gate passes when the project manager is away. Assign his sites below',['demands_view','raise_demand','sitestock_view','site_approve','reports']]);
Object.assign(ACT_PERM,{gpDo:'site_approve',slDo:'site_approve',headEdit:['site_approve','masters_projects'],saveHead:['site_approve','masters_projects'],storeEdit:['site_approve','masters_projects'],saveStore:['site_approve','masters_projects'],gpNew:'__none'});

const GP_DEST={head:'Contractor / head',site:'Another site',hq:'Company warehouse (HQ store)',vendor:'Return to vendor',repair:'Repair / testing / hire (returnable)'};
const COND={good:'Good',used:'Used, serviceable',damaged:'Damaged',repair:'Needs repair'};
const HEAD_T={contractor:'Contractor',works:'Works contractor',company:'Company works (departmental)',misc:'Misc. consumption head'};
const FR_BY={us:'Paid by us (company)',vendor:'Paid by vendor / free delivery',inbill:'Included in the bill',sender:'Paid by sending site',receiver:'Paid by receiving site'};
const SROLE={pm:'Project manager',store:'Storekeeper','':'Site user (all tasks)'};
const siteRoleOf=u=>u&&u.role==='site'?(u.siteRole||(u.siteHead?'pm':'')):'';
const myRole=()=>ui.preview?'':siteRoleOf(ui.me);
const isPM=()=>ui.role==='site'&&myRole()==='pm';
const isSK=()=>ui.role==='site'&&myRole()==='store';
function projStores(pid){const ls=((proj(pid)||{}).stores)||[];const main=ls.find(s=>s.id==='main');
  return [Object.assign({id:'main',name:'Main store',active:true},main||{},{active:true}),...ls.filter(s=>s.id!=='main')]}
const storeLabel=(pid,sid)=>{const s=projStores(pid).find(x=>x.id===(sid||'main'));return s?s.name:'Main store'};
function myStores(pid){let ls=projStores(pid).filter(s=>s.active!==false);if(isSK()&&(ui.me.stores||[]).length) ls=ls.filter(s=>ui.me.stores.includes(s.id));return ls}
const projHeads=(pid,all)=>(((proj(pid)||{}).heads)||[]).filter(h=>all||h.active!==false);
const multiStore=pid=>projStores(pid).length>1;
const canApproveSite=pid=>ui.role==='site'?isPM():(can('site_approve')&&(!(ui.me.access||{}).projects||!(ui.me.access.projects||[]).length||ui.me.access.projects.includes(pid)));
const canKeepLists=pid=>ui.role==='site'?isPM():(can('masters_projects')||canApproveSite(pid));
const storeRows=(pid,sid)=>Object.values(((D.sst[pid]||{})[sid||'main'])||{});
const gpStatus=g=>({pending:{label:'Waiting for PM approval',tone:'amber'},approved:g.returnable&&g.kind!=='return'?(gpOpenQty(g)>1e-9?(g.dueDate<today()?{label:'Overdue — due '+fd(g.dueDate),tone:'red'}:{label:'Out — due '+fd(g.dueDate),tone:'violet'}):{label:'Returned in full',tone:'green'}):{label:'Approved',tone:'green'},rejected:{label:'Rejected',tone:'red'},cancelled:{label:'Cancelled',tone:'grey'}}[g.status]||{label:g.status,tone:'grey'});
const gpNo=g=>g.no||(g.kind==='return'?'Draft return note':'Draft gate pass');
function gpDestText(g){if(g.kind==='return') return 'Back from '+(g.dest==='repair'?g.vendorName||'':`${HEAD_T[g.headType]||'Head'}: ${g.headName||''}`)+(g.againstNo?' (on '+g.againstNo+')':'');if(g.dest==='repair') return 'Repair / testing / hire: '+(g.vendorName||'');if(g.dest==='head') return `${HEAD_T[g.headType]||'Head'}: ${g.headName||''}`;if(g.dest==='site') return 'Site: '+(proj(g.toProjectId)?projName(g.toProjectId):g.toProjectName||'another site')+(g.toStoreId?' · '+storeLabel(g.toProjectId,g.toStoreId):'');if(g.dest==='hq') return 'Company warehouse (HQ store)';if(g.dest==='vendor') return 'Return to vendor: '+(g.vendorName||'');return ''}
const gpValue=g=>sum(g.lines||[],l=>num(l.value));
const showGpValue=()=>ui.role==='hq'?seeRates():!isSK();

/* ---------- freight ---------- */
function freightBlock(base,f){f=f||{};return `<fieldset class="fr-box"><legend>${icon('truck','xs')} Freight <span class="muted small">(optional)</span></legend><div class="fields">
  ${field('Freight amount (₹)',base+'.amt',f.amt??'','inputmode="decimal" placeholder="0"')}
  <div class="f"><label for="${fid(base+'.by')}">Paid by</label><select class="inp" id="${fid(base+'.by')}" data-bind="${base}.by">${selOpts(Object.entries(FR_BY).map(([v,l])=>({v,l})),f.by||'','Choose…')}</select></div>
  ${field('Transporter',base+'.transporter',f.transporter,'placeholder="Name of transporter"')}${field('LR / bilty no.',base+'.lr',f.lr)}</div></fieldset>`}
function frOut(f){if(!f) return null;const o={amt:Math.max(0,num(f.amt)),by:f.by||'',transporter:String(f.transporter||'').trim(),lr:String(f.lr||'').trim(),note:String(f.note||'').trim()};return o.amt||o.by||o.transporter||o.lr||o.note?o:null}
const frText=f=>f?[f.amt?money0(f.amt):'',f.by?FR_BY[f.by]||f.by:'',f.transporter?esc(f.transporter):'',f.lr?'LR '+esc(f.lr):''].filter(Boolean).join(' · '):'';
const frLine=f=>f&&frText(f)?`<div class="lbl">Freight</div><p class="small">${frText(f)}</p>`:'';

/* ---------- gate pass: make ---------- */
A.gpNew=d=>{const pid=d.p||siteProject();const st=myStores(pid);if(!st.length){toast('No store is given to you. Ask the project manager.','err');return}
  const sid=d.s&&st.some(s=>s.id===d.s)?d.s:st[0].id;const q={};if(d.k) q[d.k]='';
  openModal({type:'gp',pid,d:{storeId:sid,dest:d.dest||'head',returnable:false,dueDate:'',headId:'',toProjectId:'',toStoreId:'',vendorName:'',reason:'',q,find:'',remarks:'',vehicle:'',driver:'',lrNo:'',freight:{}}})};
A.gpDest=d=>{ui.modal.d.dest=d.val;render()};
function gpModal(m,busy){const d=m.d,pid=m.pid;const stores=myStores(pid);const fq2=norm(d.find);
  const rows=storeRows(pid,d.storeId).filter(r=>r.free>1e-9||num(d.q[r.itemKey])>0).sort((a,b)=>String(a.desc).localeCompare(b.desc));
  const shown=rows.filter(r=>!fq2||norm(r.desc+' '+r.spec).includes(fq2)||num(d.q[r.itemKey])>0);
  const heads=projHeads(pid);const n=rows.filter(r=>num(d.q[r.itemKey])>0).length;
  const destBox={head:heads.length?`<div class="f span2"><label for="f-modal-d-headId">Issued to</label><select class="inp" id="f-modal-d-headId" data-bind="modal.d.headId">${'<option value="">Choose…</option>'+Object.entries(HEAD_T).map(([t,l])=>{const hs=heads.filter(h=>h.type===t);return hs.length?`<optgroup label="${esc(l)}">${hs.map(h=>`<option value="${esc(h.id)}" ${d.headId===h.id?'selected':''}>${esc(h.name)}${h.work?' — '+esc(h.work):''}</option>`).join('')}</optgroup>`:''}).join('')}</select></div>`
      :`<div class="notice warn span2">${icon('alert')}<span>No contractors or issue heads yet. ${isPM()||canKeepLists(pid)?'<button type="button" class="linkish" data-act="headEdit" data-p="'+esc(pid)+'">Add one</button>':'Ask the project manager to add them under <b>Stores &amp; contractors</b>.'}</span></div>`,
    site:`<div class="f"><label for="f-modal-d-toProjectId">Site</label><select class="inp" id="f-modal-d-toProjectId" data-bind="modal.d.toProjectId" data-rerender="1">${selOpts(S.projects.filter(p=>p.active!==false&&p.id!==pid).map(p=>({v:p.id,l:p.name||p.code})),d.toProjectId,'Choose site…')}</select></div>
      ${d.toProjectId&&multiStore(d.toProjectId)?`<div class="f"><label for="f-modal-d-toStoreId">Receiving store</label><select class="inp" id="f-modal-d-toStoreId" data-bind="modal.d.toStoreId">${selOpts(projStores(d.toProjectId).filter(s=>s.active!==false).map(s=>({v:s.id,l:s.name})),d.toStoreId,'Their storekeeper chooses')}</select></div>`:'<div class="f"></div>'}`,
    hq:`<div class="notice info span2">${icon('box')}<span>The material goes back to the company warehouse (HQ store) and is added to its stock.</span></div>`,
    repair:`${field('Goes to (repairer, testing lab or party it is lent to)','modal.d.vendorName',d.vendorName,'placeholder="e.g. Kirloskar service centre, Ludhiana"','span2')}${field('Must come back by','modal.d.dueDate',d.dueDate,'type="date"')}<div class="f"></div>`,
    vendor:`${field('Vendor','modal.d.vendorName',d.vendorName,'placeholder="Name of the supplier"','span2')}<div class="f full"><label>Reason</label><div class="size-chips">${Object.entries(VRET_REASON).map(([k,l])=>`<button type="button" class="schip ${d.reason===k?'on':''}" data-act="mset" data-k="reason" data-val="${k}">${esc(l)}</button>`).join('')}</div></div>`}[d.dest];
  return wrap('New gate pass · '+esc(projName(pid)),`<div class="notice info">${icon('doc')}<span>The material leaves the store only after the <b>project manager approves</b> this gate pass. The gate pass number is given on approval.</span></div>
   <div class="fields">${stores.length>1?`<div class="f"><label for="f-modal-d-storeId">From store</label><select class="inp" id="f-modal-d-storeId" data-bind="modal.d.storeId" data-rerender="1">${selOpts(stores.map(s=>({v:s.id,l:s.name})),d.storeId)}</select></div>`:`<div class="f"><label>From store</label><b class="block pad-t">${esc(stores[0]?stores[0].name:'Main store')}</b></div>`}
   <div class="f span2"><label>Goes to</label><div class="seg wide-seg" role="group">${Object.entries(GP_DEST).map(([k,l])=>`<button type="button" data-act="gpDest" data-val="${k}" aria-pressed="${d.dest===k}">${esc(l)}</button>`).join('')}</div></div>
   ${destBox}${d.dest==='head'?`<label class="check span2"><input type="checkbox" data-bind="modal.d.returnable" data-rerender="1" ${d.returnable?'checked':''}> Returnable — tools, shuttering, pumps or testing equipment that must come back</label>${d.returnable?field('Must come back by','modal.d.dueDate',d.dueDate,'type="date"'):''}`:''}</div>
   <div class="row"><b>Material</b><span class="muted small">${n} item${n===1?'':'s'} chosen</span><span class="spacer"></span><div class="search-inp">${icon('search')}<input class="inp sm" id="f-modal-d-find" placeholder="Search item" data-bind="modal.d.find" data-rerender="1" value="${esc(d.find||'')}"></div></div>
   ${rows.length?`<div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Free in store</th><th class="num">Qty to issue</th></tr></thead><tbody>${shown.slice(0,200).map(r=>`<tr><td><div class="who">${thumb({category:r.cat,desc:r.desc},'sm')}<span><b>${esc(r.desc)}</b><small class="muted block">${esc(r.spec||'')}</small></span></div></td><td class="num mono">${fq(r.free)} ${esc(r.unit)}</td><td class="num">${inp('modal.d.q.'+r.itemKey,d.q[r.itemKey]??'','inputmode="decimal" style="width:110px" placeholder="0"')}</td></tr>`).join('')}</tbody></table></div>`
     :`<div class="notice warn">${icon('alert')}<span>There is no stock in this store to issue.</span></div>`}
   <div class="f full"><label for="f-modal-d-remarks">Remarks / narration <span class="req">required</span></label><textarea class="inp" id="f-modal-d-remarks" data-bind="modal.d.remarks" rows="2" placeholder="e.g. For laying of 150 mm DI main, Ch. 2+300 to 2+600, Zone B">${esc(d.remarks||'')}</textarea></div>
   ${d.dest!=='head'?`<div class="fields">${field('Vehicle no.','modal.d.vehicle',d.vehicle)}${field('Driver & phone','modal.d.driver',d.driver)}${field('Challan / e-way bill','modal.d.lrNo',d.lrNo)}</div>${freightBlock('modal.d.freight',d.freight)}`:''}`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveGp" ${busy}>${icon('check')} Send for approval</button>`,'wide')}
A.saveGp=async()=>{const m=ui.modal,d=m.d,pid=m.pid;const lines=[];
  for(const r of storeRows(pid,d.storeId)){const raw=(d.q||{})[r.itemKey];if(raw===undefined||String(raw).trim()==='') continue;const q=num(raw);if(!q) continue;
    if(q<0){toast('Quantity cannot be negative.','err');return}
    if(q>r.free+1e-9){toast(`Only ${fq(r.free)} ${r.unit} of ${r.desc} is free in this store.`,'err');return}
    lines.push({itemKey:r.itemKey,desc:r.desc,spec:r.spec||'',unit:r.unit,cat:r.cat,qty:q})}
  if(!lines.length){toast('Enter the quantity to issue.','err');return}
  if(d.dest==='head'&&!d.headId){toast('Choose the contractor or head.','err');return}
  if(d.dest==='site'&&!d.toProjectId){toast('Choose the site.','err');return}
  if(d.dest==='vendor'&&!String(d.vendorName||'').trim()){toast('Enter the vendor.','err');return}
  if(d.dest==='vendor'&&!d.reason){toast('Choose the reason for the return.','err');return}
  if(d.dest==='repair'&&!String(d.vendorName||'').trim()){toast('Enter where it goes.','err');return}
  const retb=d.dest==='repair'||(d.dest==='head'&&d.returnable);if(retb&&(!d.dueDate||d.dueDate<today())){toast('Give the date by which it must come back.','err');return}
  if(!String(d.remarks||'').trim()){toast('Write the remarks / narration.','err');document.getElementById('f-modal-d-remarks')?.focus();return}
  const doc={projectId:pid,storeId:d.storeId,dest:d.dest,lines,remarks:String(d.remarks).trim(),vehicle:d.vehicle||'',driver:d.driver||'',lrNo:d.lrNo||''};
  if(d.dest==='head') doc.headId=d.headId;if(d.dest==='site'){doc.toProjectId=d.toProjectId;doc.toStoreId=d.toStoreId||''}if(d.dest==='vendor'){doc.vendorName=String(d.vendorName).trim();doc.reason=d.reason}if(d.dest==='repair') doc.vendorName=String(d.vendorName).trim();if(retb){doc.returnable=true;doc.dueDate=d.dueDate}
  if(d.dest!=='head'){const f=frOut(d.freight);if(f) doc.freight=f}
  if(await run(()=>setDoc('siteissues',newId(),doc),isPM()?'Gate pass made. Approve it to let the material go.':'Gate pass sent to the project manager for approval.')) closeModal()};

/* ---------- gate pass: view, approve, print ---------- */
A.gpView=d=>openModal({type:'gpView',id:d.id,d:{note:''}});
function gpViewModal(m,busy){const g=S.siteissues.find(x=>x.id===m.id);if(!g) return wrap('Gate pass','<p>Not found.</p>','<button class="btn" data-act="closeModal">Close</button>');
  const vals=showGpValue()&&g.status==='approved';const appr=canApproveSite(g.projectId)&&g.status==='pending';const mine=ui.role==='site'&&g.by===ui.uid&&g.status==='pending';
  const disp=g.dispatchId&&S.dispatches.find(x=>x.id===g.dispatchId);
  return wrap(esc(gpNo(g))+' · '+esc(projName(g.projectId)),`<div class="row tight">${chip(gpStatus(g))}<span class="muted small">From ${esc(storeLabel(g.projectId,g.storeId))} · prepared by ${esc(g.byName||'')} ${g.at?'· '+fdt(g.at):''}</span></div>
   <div class="lbl">${g.kind==='return'?'Comes back':'Goes to'}</div><p><b>${esc(gpDestText(g))}</b>${g.dest==='vendor'&&g.reason?' · '+esc(VRET_REASON[g.reason]||g.reason):''}${g.kind==='return'?' · into '+esc(storeLabel(g.projectId,g.storeId)):''}</p>
   ${g.returnable&&g.kind!=='return'?`<p class="small">${icon('clock','xs')} Returnable — must come back by <b>${fd(g.dueDate)}</b>${g.status==='approved'?` · ${gpOpenQty(g)>1e-9?`<span class="${g.dueDate<today()?'t-red':'t-amber'}">${fq(gpOpenQty(g))} still out</span>`:'<span class="t-green">all back</span>'}`:''}</p>`:''}
   <div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Qty</th>${vals?'<th class="num">Rate</th><th class="num">Value</th>':''}</tr></thead><tbody>${(g.lines||[]).map(l=>`<tr><td><div class="who">${lineThumb(l,'xs')}<span><b>${esc(l.desc)}</b><small class="muted block">${esc(l.spec||'')}${l.cond?' · condition: '+esc(COND[l.cond]||l.cond):''}</small></span></div></td><td class="num mono">${fq(l.qty)} ${esc(l.unit)}</td>${vals?`<td class="num mono">${l.rate?money(l.rate):'—'}</td><td class="num mono">${l.value?money0(l.value):'—'}</td>`:''}</tr>`).join('')}</tbody>${vals&&gpValue(g)?`<tfoot><tr><td colspan="3" class="num"><b>Value</b></td><td class="num mono"><b>${money0(gpValue(g))}</b></td></tr></tfoot>`:''}</table></div>
   <div class="lbl">Remarks / narration</div><p>${esc(g.remarks||'')}</p>
   ${g.vehicle||g.driver||g.lrNo?`<p class="small muted">${[g.vehicle&&'Vehicle '+esc(g.vehicle),g.driver&&esc(g.driver),g.lrNo&&esc(g.lrNo)].filter(Boolean).join(' · ')}</p>`:''}${frLine(g.freight)}
   ${g.appr?`<div class="notice ${g.appr.status==='rejected'?'err':'ok'}">${icon(g.appr.status==='rejected'?'x':'check')}<span>${g.appr.status==='rejected'?'Rejected':'Approved'} by <b>${esc(g.appr.byName||'')}</b> ${fdt(g.appr.at)}${g.appr.note?' — “'+esc(g.appr.note)+'”':''}</span></div>`:''}
   ${disp?`<p class="small">Transfer <button class="linkish docno" data-act="viewDispatch" data-id="${disp.id}">${esc(disp.no)}</button> · ${chip(dispStatus(disp))}</p>`:''}
   ${appr?`<div class="f full"><label for="f-modal-d-note">Your remarks (needed to reject)</label>${inp('modal.d.note',m.d.note,'placeholder="optional when approving"')}</div>`:''}
   ${g.status==='pending'&&!appr?`<p class="small t-amber">${icon('clock','xs')} Waiting for the project manager. The material must not leave the store yet.</p>`:''}`,
   `${mine?`<button class="btn danger" data-act="gpDo" data-s="cancelled">Cancel gate pass</button><span class="spacer"></span>`:''}${appr?`<button class="btn danger" data-act="gpDo" data-s="rejected">Reject</button><span class="spacer"></span>`:''}<button class="btn" data-act="closeModal">Close</button>${g.status==='approved'&&g.returnable&&g.kind!=='return'&&gpOpenQty(g)>1e-9&&ui.role==='site'&&!ui.preview?`<button class="btn" data-act="gpReturn" data-g="${g.id}">${icon('back')} Receive back</button>`:''}${g.status==='approved'?`<button class="btn" data-act="gpPrint" data-id="${g.id}">${icon('print')} Print ${g.kind==='return'?'return note':'gate pass'}</button>`:''}${appr?`<button class="btn primary" data-act="gpDo" data-s="approved" ${busy}>${icon('check')} ${g.kind==='return'?'Approve &amp; take into stock':'Approve &amp; let it go'}</button>`:''}`,'wide')}
A.gpDo=async d=>{const m=ui.modal;const g=S.siteissues.find(x=>x.id===m.id);if(!g) return;const note=String(m.d.note||'').trim();
  if(d.s==='rejected'&&!note){toast('Write why it is rejected.','err');document.getElementById('f-modal-d-note')?.focus();return}
  const p={status:d.s};if(d.s==='cancelled') p.cancelNote=note;else p.apprNote=note;
  const ok=await run(()=>updDoc('siteissues',g.id,p),{approved:'Gate pass approved',rejected:'Gate pass rejected',cancelled:'Gate pass cancelled'}[d.s]);
  if(ok&&d.s==='approved'){const x=S.siteissues.find(y=>y.id===g.id);closeModal();if(x&&x.no) printHtml(x.no,gpDoc(x))}else if(ok) closeModal()};
A.gpPrint=d=>{const g=S.siteissues.find(x=>x.id===d.id);if(g&&g.no) printHtml(g.no,gpDoc(g))};
function gpDoc(g){const c=S.config,p=proj(g.projectId)||{};const b='border:1px solid #c9d3d6;padding:6px 8px;font-size:12px;vertical-align:top';const vals=showGpValue();
  const rows=(g.lines||[]).map((l,i)=>`<tr><td style="${b}">${i+1}</td><td style="${b}"><b>${esc(l.desc)}</b>${l.spec?'<br><span style="color:#465A6D">'+esc(l.spec)+'</span>':''}${l.cond?'<br><span style="color:#465A6D">Condition: '+esc(COND[l.cond]||l.cond)+'</span>':''}</td><td style="${b};text-align:right">${fq(l.qty)}</td><td style="${b}">${esc(l.unit)}</td>${vals?`<td style="${b};text-align:right">${l.rate?fq(Math.round(l.rate*100)/100):''}</td><td style="${b};text-align:right">${l.value?fq(Math.round(l.value)):''}</td>`:''}</tr>`).join('');
  return `<div style="font-family:Arial,sans-serif;color:#10202F;max-width:800px;margin:auto">
  <table style="width:100%"><tr><td>${c.logo?`<img src="/files/${esc(c.logo)}" style="height:50px;max-width:150px;object-fit:contain" alt=""><br>`:''}<b style="font-size:19px">${esc(company())}</b><br>${esc(p.name||'')}${p.code?' ('+esc(p.code)+')':''}</td>
  <td style="text-align:right"><div style="font-size:21px;font-weight:800;color:#1172C4">${g.kind==='return'?'MATERIAL RETURN NOTE':g.returnable?'RETURNABLE GATE PASS':'GATE PASS / ISSUE CHALLAN'}</div><b>${esc(g.no||'')}</b><br>Date: ${fd(msDate(g.appr&&g.appr.at||g.at))}</td></tr></table>
  <table style="width:100%;border-collapse:collapse;margin-top:10px"><tr><td style="${b};width:50%"><b>${g.kind==='return'?'Into store':'From'}</b><br>${esc(storeLabel(g.projectId,g.storeId))}<br>${esc(p.name||'')}</td><td style="${b}"><b>${g.kind==='return'?'Received back':'Issued to'}</b><br>${esc(gpDestText(g))}${g.dest==='vendor'&&g.reason?'<br>Reason: '+esc(VRET_REASON[g.reason]||g.reason):''}${g.returnable&&g.kind!=='return'?'<br><b>Returnable — to come back by '+fd(g.dueDate)+'</b>':''}</td></tr></table>
  <table style="width:100%;border-collapse:collapse;margin-top:10px"><thead><tr style="background:#e9eef2"><th style="${b}">#</th><th style="${b};text-align:left">Item</th><th style="${b};text-align:right">Qty</th><th style="${b}">Unit</th>${vals?`<th style="${b};text-align:right">Rate (₹)</th><th style="${b};text-align:right">Value (₹)</th>`:''}</tr></thead><tbody>${rows}${vals&&gpValue(g)?`<tr><td colspan="5" style="${b};text-align:right"><b>Total value</b></td><td style="${b};text-align:right"><b>${fq(Math.round(gpValue(g)))}</b></td></tr>`:''}</tbody></table>
  <p style="font-size:12px;margin-top:10px"><b>Remarks / narration:</b> ${esc(g.remarks||'')}</p>
  ${g.vehicle||g.driver||g.lrNo?`<p style="font-size:12px">Vehicle: ${esc(g.vehicle||'—')} · Driver: ${esc(g.driver||'—')} · Challan / e-way bill: ${esc(g.lrNo||'—')}</p>`:''}
  ${g.freight&&frText(g.freight)?`<p style="font-size:12px">Freight: ${frText(g.freight)}</p>`:''}
  <table style="width:100%;margin-top:40px;font-size:12px"><tr><td style="width:33%">Prepared by<br><b>${esc(g.byName||'')}</b><br>Storekeeper</td><td style="width:33%">Approved by<br><b>${esc(g.appr&&g.appr.byName||'')}</b><br>Project manager · ${g.appr?fdt(g.appr.at):''}</td><td>${g.kind==='return'?'Returned by':'Received by'}<br><br>Name, signature &amp; date</td></tr></table>
  <p style="font-size:10px;color:#6B7C8C;margin-top:24px">${g.kind==='return'?'Material taken back into the store against this approved return note.':'Material may leave the store only against this approved gate pass.'} Generated by ProcureHub.</p></div>`}

/* ---------- stock entered by the storekeeper: approval ---------- */
const slPending=pid=>S.sitelog.filter(e=>e.status==='pending'&&(!pid||e.projectId===pid));
A.slDo=d=>{const e=S.sitelog.find(x=>x.id===d.id);if(!e) return;
  if(d.s==='approved'){confirmBox({title:'Approve this stock entry?',body:`${fq(e.qty)} ${esc(e.unit)} ${esc(e.desc)} ${esc(e.spec||'')} into ${esc(storeLabel(e.projectId,e.storeId))}${e.orate?' at '+money(e.orate)+' per '+esc(e.unit):''}.`,yes:'Approve',onYes:async()=>{if(await run(()=>updDoc('sitelog',e.id,{status:'approved',apprNote:''}),'Stock entry approved. It is now in the inventory.')) closeModal()}});return}
  confirmBox({title:'Reject this stock entry?',body:`${fq(e.qty)} ${esc(e.unit)} ${esc(e.desc)}`,yes:'Reject',danger:true,note:'Reason',onYes:async()=>{const n=String(ui.modal.noteVal||'').trim();if(!n){toast('Write the reason.','err');return}if(await run(()=>updDoc('sitelog',e.id,{status:'rejected',apprNote:n}),'Stock entry rejected')) closeModal()}})};
/* ---------- a transfer HQ asked for: the storekeeper prepares it, the project manager lets it go ---------- */
A.sendOk=d=>{const x=S.dispatches.find(y=>y.id===d.id);if(!x) return;confirmBox({title:'Let this material go?',body:`${esc(x.no)} to ${esc(projName(x.projectId))}: ${esc((x.lines||[]).map(l=>fq(l.qty)+' '+l.unit+' '+l.desc).join(', '))}.${x.vehicle?' Vehicle '+esc(x.vehicle)+'.':''}`,yes:'Let it go',onYes:async()=>{if(await run(()=>updDoc('dispatches',x.id,{sendOk:true}),'Material let go. The receiving site has been told.')) closeModal()}})};

/* ---------- lists ---------- */
function gpTable(list,showSite){const vals=showGpValue();
  return list.length?`<div class="tw"><table class="t"><thead><tr><th>Gate pass</th>${showSite?'<th>Site</th>':''}<th>From store</th><th>Issued to</th><th>Material</th>${vals?'<th class="num">Value</th>':''}<th>Status</th></tr></thead><tbody>${list.map(g=>`<tr class="click" data-act="gpView" data-id="${g.id}"><td><span class="docno">${esc(gpNo(g))}</span><small class="muted block">${fdt(g.appr&&g.appr.at||g.at)}</small></td>${showSite?`<td>${esc(projName(g.projectId))}</td>`:''}<td class="small">${esc(storeLabel(g.projectId,g.storeId))}</td><td><b>${esc(gpDestText(g))}</b><small class="muted block">${esc((g.remarks||'').slice(0,80))}</small></td>
    <td><div class="thumbs">${(g.lines||[]).slice(0,3).map(l=>lineThumb(l,'xs')).join('')}<span class="small">${esc((g.lines||[]).slice(0,3).map(l=>fq(l.qty)+' '+l.unit+' '+l.desc).join(', '))}${(g.lines||[]).length>3?'…':''}</span></div></td>${vals?`<td class="num mono">${gpValue(g)?money0(gpValue(g)):'—'}</td>`:''}<td>${chip(gpStatus(g))}</td></tr>`).join('')}</tbody></table></div>`
  :'<div class="empty sm"><p>No gate passes here.</p></div>'}
function approvalsBlock(pid){const appr=canApproveSite(pid);const gps=S.siteissues.filter(g=>g.status==='pending'&&(!pid||g.projectId===pid));const sl=slPending(pid);
  const snd=S.dispatches.filter(x=>x.status==='to_send'&&x.sendReq&&(!pid||x.fromProjectId===pid));
  if(!gps.length&&!sl.length&&!snd.length) return '';
  return `<section class="card appr-box"><div class="card-h"><h2>${appr?'Waiting for your approval':'Waiting for the project manager'}</h2><span class="sub">${gps.length} gate pass${gps.length===1?'':'es'} / return note${gps.length===1?'':'s'} · ${sl.length} stock entr${sl.length===1?'y':'ies'}${snd.length?' · '+snd.length+' transfer'+(snd.length===1?'':'s'):''}</span></div>
  ${gps.length?gpTable(gps.sort((a,b)=>(a.at||0)-(b.at||0)),!pid):''}
  ${sl.length?`<div class="tw"><table class="t"><thead><tr><th>Existing stock entered</th>${pid?'':'<th>Site</th>'}<th>Store</th><th class="num">Qty</th>${showGpValue()?'<th class="num">Rate</th>':''}<th>By</th><th></th></tr></thead><tbody>${sl.map(e=>`<tr><td><div class="who">${thumb({category:e.cat,desc:e.desc},'sm')}<span><b>${esc(e.desc)}</b><small class="muted block">${esc(e.spec||'')}${e.remarks?' · '+esc(e.remarks):''}</small></span></div></td>${pid?'':`<td>${esc(projName(e.projectId))}</td>`}<td class="small">${esc(storeLabel(e.projectId,e.storeId))}</td><td class="num mono">${fq(e.qty)} ${esc(e.unit)}</td>${showGpValue()?`<td class="num mono">${e.orate?money(e.orate):'—'}</td>`:''}<td class="small">${esc(e.createdByName||'')}<small class="muted block">${fd(e.date)}</small></td>
    <td class="nowrap">${canApproveSite(e.projectId)?`<button class="btn sm primary" data-act="slDo" data-s="approved" data-id="${e.id}">Approve</button> <button class="btn sm ghost" data-act="slDo" data-s="rejected" data-id="${e.id}">Reject</button>`:'<span class="small t-amber">Waiting</span>'}</td></tr>`).join('')}</tbody></table></div>`:''}
  ${snd.length?`<div class="list">${snd.map(x=>dispCard(x,'from')).join('')}</div>`:''}</section>`}
function vGatePasses(pid){const f=ui.f.gpf||'all';const all=S.siteissues.filter(g=>!pid||g.projectId===pid).sort((a,b)=>(b.at||0)-(a.at||0));
  const list=all.filter(g=>f==='all'||g.status===f);const mk=ui.role==='site'&&!ui.preview;
  return `${mk?`<div class="stock-acts">${Object.entries(GP_DEST).map(([k,l],i)=>`<button class="sa ${i?'':'hi'}" data-act="gpNew" data-dest="${k}" data-p="${esc(pid)}"><span class="sa-ph">${ART.x(['use','truck','store','clip','mix'][i]||'use')}</span><span><b>${esc(l)}</b><small>${['Issue to contractor or consumption head','Send material to another site','Return to HQ store','Rejected / wrong material','Tools and equipment that must come back'][i]}</small></span></button>`).join('')}<button class="sa" data-act="gpReturn" data-p="${esc(pid)}"><span class="sa-ph">${ART.x('ok')}</span><span><b>Material back from contractor</b><small>Unused material returned to the store</small></span></button></div>`:''}
  ${returnableBlock(pid)}
  ${approvalsBlock(pid)}
  <section class="card"><div class="card-h"><h2>Gate passes</h2>${seg('gpf',[['all','All'],['pending','Waiting'],['approved','Approved'],['rejected','Rejected']],f)}<span class="sub">${list.length}</span></div>${gpTable(list.slice(0,300),!pid)}</section>`}
function vHQGatePasses(){const sites=S.projects.filter(p=>p.active!==false);const pid=ui.f.gpp||'';
  return `<div class="toolbar"><select class="inp" style="max-width:340px" data-bind="f.gpp" data-rerender="1">${selOpts(sites.map(p=>({v:p.id,l:p.name||p.code})),pid,'All sites')}</select><span class="spacer"></span>${pid?`<button class="btn" data-act="go" data-v="sitestock" data-p="${esc(pid)}">${icon('layers')} Site stock</button>`:''}</div>
  ${vGatePasses(pid)}${pid?headsSection(pid):''}`}

/* ---------- stores and issue heads ---------- */
A.storeEdit=d=>{const pid=d.p||siteProject();const s=d.id?projStores(pid).find(x=>x.id===d.id):null;openModal({type:'storeEdit',pid,id:d.id||'',d:s?{name:s.name,place:s.place||'',active:s.active!==false}:{name:'',place:'',active:true}})};
A.saveStore=async()=>{const m=ui.modal,d=m.d,pid=m.pid;const name=String(d.name||'').trim();if(!name){toast('Enter the name of the store.','err');return}
  const ls=(((proj(pid)||{}).stores)||[]).map(x=>Object.assign({},x));const id=m.id||('st'+Date.now().toString(36));
  if(ls.some(x=>x.id!==id&&norm(x.name)===norm(name))||(id!=='main'&&norm(name)===norm(storeLabel(pid,'main')))){toast('There is already a store with this name.','err');return}
  const i=ls.findIndex(x=>x.id===id);const rec={id,name,place:String(d.place||'').trim(),active:id==='main'?true:d.active!==false,at:(i>=0&&ls[i].at)||Date.now()};
  if(i>=0) ls[i]=rec;else ls.push(rec);if(await run(()=>updDoc('projects',pid,{stores:ls}),'Store saved')) closeModal()};
A.headEdit=d=>{const pid=d.p||siteProject();const h=d.id?projHeads(pid,true).find(x=>x.id===d.id):null;openModal({type:'headEdit',pid,id:d.id||'',d:h?Object.assign({},h):{type:d.t||'contractor',name:'',work:'',contact:'',phone:'',gstin:'',note:'',active:true}})};
A.saveHead=async()=>{const m=ui.modal,d=m.d,pid=m.pid;const name=String(d.name||'').trim();if(!name){toast('Enter the name.','err');return}if(!HEAD_T[d.type]){toast('Choose the type.','err');return}
  const ls=(((proj(pid)||{}).heads)||[]).map(x=>Object.assign({},x));const id=m.id||('hd'+Date.now().toString(36));
  if(ls.some(x=>x.id!==id&&x.type===d.type&&norm(x.name)===norm(name))){toast('This name is already in the list.','err');return}
  const i=ls.findIndex(x=>x.id===id);const rec={id,type:d.type,name,work:String(d.work||'').trim(),contact:String(d.contact||'').trim(),phone:String(d.phone||'').trim(),gstin:String(d.gstin||'').trim().toUpperCase(),note:String(d.note||'').trim(),active:d.active!==false,at:(i>=0&&ls[i].at)||Date.now()};
  if(i>=0) ls[i]=rec;else ls.push(rec);if(await run(()=>updDoc('projects',pid,{heads:ls}),'Saved')) closeModal()};
function storeEditModal(m,busy){const d=m.d;return wrap((m.id?'Edit store':'New store')+' · '+esc(projName(m.pid)),`<div class="fields">${field('Name of store','modal.d.name',d.name,'placeholder="e.g. Store at STP site, Pipe yard Zone 2"')}${field('Location','modal.d.place',d.place,'placeholder="e.g. Near WTP gate"')}</div>
  ${m.id&&m.id!=='main'?`<label class="check"><input type="checkbox" data-bind="modal.d.active" ${d.active!==false?'checked':''}> Store in use</label>`:''}
  <p class="small muted">Stock from before stores were added is in the main store. Give a storekeeper his stores under Settings → Users.</p>`,`<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveStore" ${busy}>Save</button>`)}
function headEditModal(m,busy){const d=m.d;return wrap((m.id?'Edit':'Add')+' contractor / head · '+esc(projName(m.pid)),`<div class="f full"><label>Type</label><div class="seg wide-seg" role="group">${Object.entries(HEAD_T).map(([k,l])=>`<button type="button" data-act="mset" data-k="type" data-val="${k}" aria-pressed="${d.type===k}">${esc(l)}</button>`).join('')}</div></div>
  <div class="fields">${field(d.type==='misc'?'Name of head':d.type==='company'?'Name of work / department':'Name of contractor','modal.d.name',d.name,`placeholder="${d.type==='misc'?'e.g. Site office, Testing, Shuttering':d.type==='company'?'e.g. Departmental laying gang 2':'e.g. Sharma Constructions'}"`)}${field('Work / package','modal.d.work',d.work,'placeholder="e.g. Laying DI pipes Zone B"')}
  ${d.type!=='misc'?field('Contact person','modal.d.contact',d.contact)+field('Phone','modal.d.phone',d.phone,'inputmode="tel"'):''}${d.type==='contractor'||d.type==='works'?field('GSTIN','modal.d.gstin',d.gstin):''}${field('Note','modal.d.note',d.note)}</div>
  ${m.id?`<label class="check"><input type="checkbox" data-bind="modal.d.active" ${d.active!==false?'checked':''}> In use (switch off when the work is over; its record stays)</label>`:''}`,`<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveHead" ${busy}>Save</button>`)}
// material issued to each head, with value
function headStock(pid){const o={};for(const g of S.siteissues){if(g.status!=='approved'||g.dest!=='head'||!g.headId||g.projectId!==pid) continue;const ret=g.kind==='return',sg=ret?-1:1;const h=o[g.headId]||(o[g.headId]={items:{},value:0,n:0,last:0,gps:[]});if(!ret) h.n++;h.gps.push(g);h.last=Math.max(h.last,(g.appr&&g.appr.at)||0);
  for(const l of g.lines||[]){const k=l.itemKey||itemKey(l.desc,l.spec,l.unit);const r=h.items[k]||(h.items[k]={desc:l.desc,spec:l.spec||'',unit:l.unit,cat:l.cat,qty:0,value:0,iss:0,back:0});r.qty+=sg*num(l.qty);r.value+=sg*num(l.value);h.value+=sg*num(l.value);if(ret) r.back+=num(l.qty);else r.iss+=num(l.qty)}}return o}
A.headView=d=>openModal({type:'headView',pid:d.p,id:d.id});
function headViewModal(m){const pid=m.pid;const h=projHeads(pid,true).find(x=>x.id===m.id)||{};const hs=headStock(pid)[m.id]||{items:{},value:0,gps:[]};const vals=showGpValue();const rows=Object.values(hs.items).sort((a,b)=>String(a.desc).localeCompare(b.desc));
  return wrap(esc(h.name||'')+' · '+esc(HEAD_T[h.type]||''),`<p class="small muted">${[h.work,h.contact,h.phone,h.gstin&&'GSTIN '+h.gstin].filter(Boolean).map(esc).join(' · ')}</p>
  ${rows.length?`<div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Issued</th><th class="num">Returned</th><th class="num">With them</th>${vals?'<th class="num">Value with them</th>':''}</tr></thead><tbody>${rows.map(r=>`<tr><td><div class="who">${thumb({category:r.cat,desc:r.desc},'sm')}<span><b>${esc(r.desc)}</b><small class="muted block">${esc(r.spec)}</small></span></div></td><td class="num mono">${fq(r.iss)}</td><td class="num mono">${r.back?fq(r.back):'—'}</td><td class="num mono"><b>${fq(r.qty)}</b> ${esc(r.unit)}</td>${vals?`<td class="num mono">${r.value?money0(r.value):'—'}</td>`:''}</tr>`).join('')}</tbody>${vals?`<tfoot><tr><td colspan="4" class="num"><b>Total value with them</b></td><td class="num mono"><b>${money0(hs.value)}</b></td></tr></tfoot>`:''}</table></div>`:'<div class="empty sm"><p>Nothing issued yet.</p></div>'}
  ${hs.gps.length?`<div class="lbl">Gate passes</div>${gpTable(hs.gps.sort((a,b)=>(b.at||0)-(a.at||0)))}`:''}`,`${ui.role==='site'&&!ui.preview&&rows.some(r=>r.qty>1e-9)?`<button class="btn" data-act="gpReturn" data-p="${esc(pid)}" data-h="${esc(m.id)}">${icon('back')} Material back</button>`:''}<button class="btn" data-act="dlHead" data-p="${esc(pid)}" data-id="${esc(m.id)}">${icon('dl')} Excel</button><button class="btn" data-act="closeModal">Close</button>`,'wide')}
A.dlHead=d=>{const h=projHeads(d.p,true).find(x=>x.id===d.id)||{};const hs=headStock(d.p)[d.id]||{gps:[]};const vals=showGpValue();
  const rows=[['Gate pass / return note','Date','Issued / returned','Item','Specification','Unit','Qty',...(vals?['Rate','Value']:[]),'Remarks']];
  for(const g of hs.gps) for(const l of g.lines||[]){const sg=g.kind==='return'?-1:1;rows.push([g.no,msDate(g.appr&&g.appr.at||g.at),g.kind==='return'?'Returned':'Issued',l.desc,l.spec||'',l.unit,sg*num(l.qty),...(vals?[num(l.rate),Math.round(sg*num(l.value))]:[]),g.remarks||''])}
  saveXlsx((h.name||'head').replace(/[^\w -]+/g,'')+'.xlsx',[{name:'Issued',rows}])};
function headsSection(pid){const hs=headStock(pid);const heads=projHeads(pid,true);const vals=showGpValue();const keep=canKeepLists(pid);
  return `<section class="card"><div class="card-h"><h2>Contractors &amp; issue heads</h2><span class="sub">Material issued on approved gate passes${vals?', with value':''}</span>${keep?`<div class="acts"><button class="btn sm primary" data-act="headEdit" data-p="${esc(pid)}">${icon('plus')} Add contractor / head</button></div>`:''}</div>
  ${heads.length?`<div class="tw"><table class="t"><thead><tr><th>Name</th><th>Type</th><th>Work</th><th class="num">Gate passes</th>${vals?'<th class="num">Value with them</th>':''}<th>Last issue</th><th></th></tr></thead><tbody>${Object.keys(HEAD_T).flatMap(t=>heads.filter(h=>h.type===t)).map(h=>{const x=hs[h.id]||{n:0,value:0,last:0};return `<tr class="click ${h.active===false?'muted':''}" data-act="headView" data-p="${esc(pid)}" data-id="${esc(h.id)}"><td><b>${esc(h.name)}</b>${h.active===false?' <span class="chip grey plain">closed</span>':''}${h.contact?`<small class="muted block">${esc(h.contact)}${h.phone?' · '+esc(h.phone):''}</small>`:''}</td><td class="small">${esc(HEAD_T[h.type]||'')}</td><td class="small">${esc(h.work||'')}</td><td class="num mono">${x.n||'—'}</td>${vals?`<td class="num mono">${x.value?money0(x.value):'—'}</td>`:''}<td class="small">${x.last?fd(msDate(x.last)):'—'}</td><td>${keep?`<button class="icon-btn sm" data-act="headEdit" data-p="${esc(pid)}" data-id="${esc(h.id)}" aria-label="Edit">${icon('edit')}</button>`:''}</td></tr>`}).join('')}</tbody>${vals?`<tfoot><tr><td colspan="4" class="num"><b>Total</b></td><td class="num mono"><b>${money0(sum(Object.values(hs),x=>x.value))}</b></td><td colspan="2"></td></tr></tfoot>`:''}</table></div>`
  :emptyBox(ART.x('clip','e-art sm'),'No contractors or heads yet',keep?'Add the contractors, works contractors, company works and consumption heads the store issues material to.':'The project manager adds them.',keep?`<button class="btn primary" data-act="headEdit" data-p="${esc(pid)}">${icon('plus')} Add</button>`:'')}</section>`}
function storesSection(pid){const keep=canKeepLists(pid);const vals=ui.role==='hq'&&seeRates();
  return `<section class="card"><div class="card-h"><h2>Stores</h2><span class="sub">${projStores(pid).length} store${projStores(pid).length===1?'':'s'} at this site</span>${keep?`<div class="acts"><button class="btn sm primary" data-act="storeEdit" data-p="${esc(pid)}">${icon('plus')} Add store</button></div>`:''}</div>
  <div class="tw"><table class="t"><thead><tr><th>Store</th><th>Location</th><th class="num">Items in stock</th>${vals?'<th class="num">Stock value</th>':''}<th></th></tr></thead><tbody>${projStores(pid).map(s=>{const rs=storeRows(pid,s.id);return `<tr class="${s.active===false?'muted':''}"><td><b>${esc(s.name)}</b>${s.active===false?' <span class="chip grey plain">closed</span>':''}</td><td class="small">${esc(s.place||'')}</td><td class="num mono">${rs.filter(r=>r.bal>1e-9).length}</td>${vals?`<td class="num mono">${money0(sum(rs,r=>r.value))}</td>`:''}<td class="nowrap"><button class="btn sm" data-act="storeStock" data-p="${esc(pid)}" data-s="${esc(s.id)}">Stock</button>${keep?` <button class="icon-btn sm" data-act="storeEdit" data-p="${esc(pid)}" data-id="${esc(s.id)}" aria-label="Edit">${icon('edit')}</button>`:''}</td></tr>`}).join('')}</tbody></table></div></section>`}
A.storeStock=d=>{ui.f.sto=d.s;if(ui.role==='site') go('s_stock');else go('sitestock',d.p)};
function vHeads(pid){return `${storesSection(pid)}${headsSection(pid)}`}

/* ---------- views, menus, modals ---------- */
{const prev=view;view=function(){
  if(ui.role==='site'&&siteProject()){const pid=siteProject();
    if(ui.view==='s_gp') return vGatePasses(pid);
    if(ui.view==='s_heads') return vHeads(pid);
    if(isSK()&&(ui.view==='s_new'||ui.view==='s_list'||ui.view==='s_indent'||ui.view==='done')) return emptyBox(ART.x('clip','e-art'),'Demands are raised by the project manager','As storekeeper you receive material and make gate passes. Tell the project manager what the site needs.',`<button class="btn primary" data-act="go" data-v="s_home">Home</button>`);
    if(isSK()&&(ui.view==='s_home'||!ui.view)) return vSKHome(pid);
    return prev()}
  if(ui.role==='hq'&&ui.view==='gatepasses') return vHQGatePasses();
  return prev()}}
function vSKHome(pid){const p=proj(pid)||{};const inc=S.dispatches.filter(d=>d.projectId===pid&&(d.status==='in_transit'||d.status==='ordered'));const toSend=S.dispatches.filter(d=>d.fromProjectId===pid&&d.status==='to_send');
  const mine=S.siteissues.filter(g=>g.projectId===pid&&g.by===ui.uid).sort((a,b)=>(b.at||0)-(a.at||0));const st=myStores(pid);
  const myWait=S.siteissues.filter(g=>g.projectId===pid&&g.by===ui.uid&&g.status==='pending').length;const out=S.siteissues.filter(g=>g.projectId===pid&&g.returnable&&g.kind!=='return'&&g.status==='approved'&&gpOpenQty(g)>1e-9);
  const items=st.reduce((n,s)=>n+storeRows(pid,s.id).filter(r=>r.bal>1e-9).length,0);
  return `${siteBanner(p,[
      {act:'go',v:'s_incoming',k:'On the way',val:inc.length,d:'to receive into your stores',cls:inc.length?'go':'',dot:inc.length>0},
      {act:'go',v:'s_gp',k:'Waiting for approval',val:myWait,d:'your gate passes'},
      {act:'go',v:'s_gp',k:'Returnable out',val:out.length,d:out.filter(g=>g.dueDate<today()).length+' overdue',cls:out.some(g=>g.dueDate<today())?'warn':''},
      {act:'go',v:'s_stock',k:'Items in stock',val:items,d:st.map(s=>s.name).join(', ')}],`${greet()}, ${esc(firstName(ui.me.name))} · storekeeper`)}
  ${actionKeys([
    {act:'go',v:'s_incoming',hi:true,ph:'receive',art:'truck',t:'Receive material',s:inc.length?inc.length+' on the way':'Nothing on the way',n:inc.length},
    {act:'gpNew',p:pid,ph:'issue',art:'use',t:'Issue material',s:'Gate pass for the project manager'},
    {act:'gpReturn',p:pid,ph:'contractor',art:'clip',t:'Material back',s:'From a contractor, on a return note'},
    {act:'openStock',p:pid,ph:'stock',art:'store',t:'Add existing stock',s:'Counts after approval'}])}
  ${toSend.length?`<section class="card"><div class="card-h"><h2>Material to send to other sites</h2><span class="sub">HQ asked for these. Load them; the project manager lets them go</span></div><div class="list">${toSend.map(d=>dispCard(d,'from')).join('')}</div></section>`:''}
  ${inc.length?`<section class="card"><div class="card-h"><h2>On the way to your site</h2></div><div class="list">${inc.map(d=>dispCard(d)).join('')}</div></section>`:''}
  ${approvalsBlock(pid)}
  <section class="card"><div class="card-h"><h2>My gate passes</h2><div class="acts"><button class="btn sm" data-act="go" data-v="s_gp">All gate passes</button></div></div>${gpTable(mine.slice(0,10))}</section>`}
{const prev=navItems;navItems=function(){const n=prev();
  if(ui.role==='hq'){if(!viewAllowed('gatepasses')) return n;const i=n.findIndex(x=>x.v==='sitestock');const it={v:'gatepasses',l:'Gate passes',i:'doc',b:can('site_approve')?S.siteissues.filter(g=>g.status==='pending'&&canApproveSite(g.projectId)).length+slPending().filter(e=>canApproveSite(e.projectId)).length:0};if(i>=0) n.splice(i+1,0,it);return n}
  const pid=siteProject();const wait=S.siteissues.filter(g=>g.projectId===pid&&g.status==='pending').length+slPending(pid).length+S.dispatches.filter(x=>x.fromProjectId===pid&&x.status==='to_send'&&x.sendReq).length;
  let out=n;if(isSK()) out=n.filter(x=>!['s_new','s_list','s_cons'].includes(x.v));
  const i=out.findIndex(x=>x.v==='s_stock');out.splice(i+1,0,{v:'s_gp',l:'Gate passes',i:'doc',b:isPM()?wait:S.siteissues.filter(g=>g.projectId===pid&&g.by===ui.uid&&g.status==='rejected'&&Date.now()-((g.appr&&g.appr.at)||0)<3*864e5).length},{v:'s_heads',l:'Stores & contractors',i:'box'});
  return out}}
{const prev=alerts;alerts=function(){const o=prev();
  if(ui.role==='site'){const pid=siteProject();if(isPM()){const g=S.siteissues.filter(x=>x.projectId===pid&&x.status==='pending').length,s=slPending(pid).length,t=S.dispatches.filter(x=>x.fromProjectId===pid&&x.status==='to_send'&&x.sendReq).length;
      if(g+s+t) o.unshift({tone:'amber',i:'doc',t:`${g+s+t} waiting for your approval`,s:[g&&g+' gate pass'+(g>1?'es':''),s&&s+' stock entr'+(s>1?'ies':'y'),t&&t+' transfer'+(t>1?'s':'')].filter(Boolean).join(' · '),v:'s_gp'})}
    if(isSK()){const r=S.siteissues.filter(x=>x.projectId===pid&&x.by===ui.uid&&x.status==='rejected'&&Date.now()-((x.appr&&x.appr.at)||0)<3*864e5);if(r.length) o.unshift({tone:'red',i:'x',t:`${r.length} gate pass${r.length>1?'es were':' was'} rejected`,s:r.map(x=>x.appr&&x.appr.note||'').join(' · '),v:'s_gp'})}}
  else if(can('site_approve')){const g=S.siteissues.filter(x=>x.status==='pending'&&canApproveSite(x.projectId)&&Date.now()-(x.at||0)>864e5).length;if(g) o.push({tone:'amber',i:'doc',t:`${g} gate pass${g>1?'es':''} waiting more than a day`,s:'Project manager has not approved yet',v:'gatepasses'})}
  return o}}
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='gp'?gpModal(m,busy):m.type==='gpView'?gpViewModal(m,busy):m.type==='storeEdit'?storeEditModal(m,busy):m.type==='headEdit'?headEditModal(m,busy):m.type==='headView'?headViewModal(m,busy):prev(m,busy)}

/* ---------- site logins: role and stores ---------- */
A.userSiteRole=d=>{const u=ui.modal.d;u.siteRole=d.val;u.siteHead=d.val==='pm';render()};
A.userStore=d=>{const u=ui.modal.d;const s=u.stores||(u.stores=[]);const i=s.indexOf(d.k);if(i>=0) s.splice(i,1);else s.push(d.k);render()};
function siteRoleFields(u){const r=u.siteRole??(u.siteHead?'pm':'');
  return `<div class="f full"><label>Role at site</label><div class="role-grid">${[['pm','Raises demands, keeps the stores and contractors, approves gate passes and stock entered by the storekeeper, authenticates consumption'],['store','Receives material and makes gate passes for his stores. Cannot raise demands; nothing goes out or comes into stock until the project manager approves'],['','Everything at site as before: demands, receipts and stock, without approvals']].map(([k,dsc])=>`<button type="button" class="role-c ${r===k?'on':''}" data-act="userSiteRole" data-val="${k}"><b>${esc(SROLE[k])}</b><small>${esc(dsc)}</small></button>`).join('')}</div></div>
  ${r==='store'?`<div class="f full"><label>Stores he looks after</label>${u.projectId?`<div class="proj-pick">${projStores(u.projectId).filter(s=>s.active!==false).map(s=>`<label class="perm sm ${(u.stores||[]).includes(s.id)?'on':''}"><input type="checkbox" data-act="userStore" data-k="${esc(s.id)}" ${(u.stores||[]).includes(s.id)?'checked':''}><span><b>${esc(s.name)}</b><small>${esc(s.place||'')}</small></span></label>`).join('')}</div><small class="muted">None ticked = all stores of the site. The project manager adds stores under <b>Stores &amp; contractors</b>.</small>`:'<small class="muted">Choose the project first.</small>'}</div>`:''}`}

/* ---------- 6.7: material coming back — contractor returns and returnable gate passes ---------- */
// still out on a returnable gate pass (issued less returns approved or waiting), per item
function gpOpen(g){const o={};for(const l of g.lines||[]){const k=l.itemKey||itemKey(l.desc,l.spec,l.unit);o[k]=o[k]||{l,qty:0};o[k].qty+=num(l.qty)}
  for(const r of S.siteissues) if(r.kind==='return'&&r.againstId===g.id&&(r.status==='approved'||r.status==='pending')) for(const l of r.lines||[]){const k=l.itemKey||itemKey(l.desc,l.spec,l.unit);if(o[k]) o[k].qty-=num(l.qty)}
  return o}
const gpOpenQty=g=>sum(Object.values(gpOpen(g)),x=>Math.max(0,x.qty));
const returnablesOut=pid=>S.siteissues.filter(g=>g.status==='approved'&&g.returnable&&g.kind!=='return'&&(!pid||g.projectId===pid)&&gpOpenQty(g)>1e-9).sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate)));
// with a head: issued on approved gate passes less returns (approved, and waiting when asked)
function headNetItems(pid,hid,withPending){const o={};for(const g of S.siteissues){if(g.projectId!==pid||g.headId!==hid) continue;const ret=g.kind==='return';
  if(ret?!(g.status==='approved'||(withPending&&g.status==='pending')):!(g.status==='approved'&&g.dest==='head')) continue;
  for(const l of g.lines||[]){const k=l.itemKey||itemKey(l.desc,l.spec,l.unit);const r=o[k]||(o[k]={l,qty:0,iss:0,back:0,value:0});const q=num(l.qty);if(ret){r.qty-=q;r.back+=q;r.value-=num(l.value)}else{r.qty+=q;r.iss+=q;r.value+=num(l.value)}}}
  return o}
function returnableBlock(pid){const out=returnablesOut(pid);if(!out.length) return '';const td=today();const site=ui.role==='site'&&!ui.preview;
  return `<section class="card"><div class="card-h"><h2>Returnable material out</h2><span class="sub">${out.length} gate pass${out.length===1?'':'es'} · ${out.filter(g=>g.dueDate<td).length} overdue</span></div>
  <div class="tw"><table class="t"><thead><tr><th>Gate pass</th>${pid?'':'<th>Site</th>'}<th>With</th><th>Still out</th><th>Due back</th><th></th></tr></thead><tbody>${out.map(g=>{const o=Object.values(gpOpen(g)).filter(x=>x.qty>1e-9);return `<tr class="${g.dueDate<td?'row-red':''}"><td><button class="linkish docno" data-act="gpView" data-id="${g.id}">${esc(g.no)}</button></td>${pid?'':`<td>${esc(projName(g.projectId))}</td>`}<td><b>${esc(gpDestText(g))}</b></td><td class="small">${esc(o.map(x=>fq(x.qty)+' '+x.l.unit+' '+x.l.desc).join(', '))}</td><td class="nowrap ${g.dueDate<td?'t-red':g.dueDate<=addDays(td,2)?'t-amber':''}"><b>${fd(g.dueDate)}</b>${g.dueDate<td?`<small class="block">${Math.round((Date.parse(td)-Date.parse(g.dueDate))/864e5)} days late</small>`:''}</td><td>${site?`<button class="btn sm" data-act="gpReturn" data-g="${g.id}">${icon('back')} Receive back</button>`:''}</td></tr>`}).join('')}</tbody></table></div></section>`}
A.gpReturn=d=>{const g=d.g?S.siteissues.find(x=>x.id===d.g):null;const pid=g?g.projectId:(d.p||siteProject());const st=myStores(pid);if(!st.length){toast('No store is given to you.','err');return}
  const sid=g&&st.some(s=>s.id===g.storeId)?g.storeId:st[0].id;closeModal();
  openModal({type:'gpRet',pid,d:{againstId:g?g.id:'',headId:g?g.headId||'':(d.h||''),storeId:sid,q:{},cond:{},remarks:'',vehicle:''}})};
function gpRetModal(m,busy){const d=m.d,pid=m.pid;const g=d.againstId&&S.siteissues.find(x=>x.id===d.againstId);const stores=myStores(pid);const heads=projHeads(pid,true);
  const open=g?Object.entries(gpOpen(g)).map(([k,x])=>({k,l:x.l,qty:x.qty})):d.headId?Object.entries(headNetItems(pid,d.headId,true)).map(([k,x])=>({k,l:x.l,qty:x.qty})):[];const rows=open.filter(x=>x.qty>1e-9);
  return wrap(g?'Receive back · '+esc(g.no):'Material back from contractor',`<div class="notice info">${icon('back')}<span>The material is added back to the store after the <b>project manager approves</b> this return note.</span></div>
   <div class="fields">${g?`<div class="f span2"><label>Comes back from</label><b class="block pad-t">${esc(gpDestText(g))}</b></div>`:`<div class="f span2"><label for="f-modal-d-headId">Contractor / head</label><select class="inp" id="f-modal-d-headId" data-bind="modal.d.headId" data-rerender="1">${'<option value="">Choose…</option>'+heads.map(h=>`<option value="${esc(h.id)}" ${d.headId===h.id?'selected':''}>${esc(h.name)} — ${esc(HEAD_T[h.type]||'')}</option>`).join('')}</select></div>`}
   ${stores.length>1?`<div class="f"><label for="f-modal-d-storeId">Into store</label><select class="inp" id="f-modal-d-storeId" data-bind="modal.d.storeId">${selOpts(stores.map(s=>({v:s.id,l:s.name})),d.storeId)}</select></div>`:''}${field('Vehicle no. (if any)','modal.d.vehicle',d.vehicle)}</div>
   ${rows.length?`<div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">With them</th><th class="num">Qty back</th><th>Condition</th></tr></thead><tbody>${rows.map(x=>`<tr><td><div class="who">${lineThumb(x.l,'xs')}<span><b>${esc(x.l.desc)}</b><small class="muted block">${esc(x.l.spec||'')}</small></span></div></td><td class="num mono">${fq(x.qty)} ${esc(x.l.unit)}</td><td class="num">${inp('modal.d.q.'+x.k,d.q[x.k]??'','inputmode="decimal" style="width:100px" placeholder="0"')}</td><td><select class="inp sm" data-bind="modal.d.cond.${x.k}">${selOpts(Object.entries(COND).map(([v,l])=>({v,l})),d.cond[x.k]||'good')}</select></td></tr>`).join('')}</tbody></table></div>`
    :(g||d.headId?'<div class="notice warn">'+icon('alert')+'<span>Nothing is out with them.</span></div>':'')}
   <div class="f full"><label for="f-modal-d-remarks">Remarks <span class="req">required</span></label><textarea class="inp" id="f-modal-d-remarks" data-bind="modal.d.remarks" rows="2" placeholder="e.g. Work in Zone B finished; 3 valves unused, returned in good condition">${esc(d.remarks||'')}</textarea></div>`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveGpRet" ${busy}>${icon('check')} Send for approval</button>`,'wide')}
A.saveGpRet=async()=>{const m=ui.modal,d=m.d,pid=m.pid;const g=d.againstId&&S.siteissues.find(x=>x.id===d.againstId);
  if(!g&&!d.headId){toast('Choose the contractor or head.','err');return}
  const open=g?gpOpen(g):headNetItems(pid,d.headId,true);const lines=[];
  for(const [k,x] of Object.entries(open)){const raw=d.q[k];if(raw===undefined||String(raw).trim()==='') continue;const q=num(raw);if(!q) continue;
    if(q<0||q>x.qty+1e-9){toast(`Only ${fq(x.qty)} ${x.l.unit} of ${x.l.desc} is with them.`,'err');return}
    lines.push({itemKey:k,desc:x.l.desc,spec:x.l.spec||'',unit:x.l.unit,cat:x.l.cat,qty:q,cond:d.cond[k]||'good'})}
  if(!lines.length){toast('Enter the quantity that comes back.','err');return}
  if(!String(d.remarks||'').trim()){toast('Write the remarks.','err');return}
  const doc={kind:'return',projectId:pid,storeId:d.storeId,lines,remarks:String(d.remarks).trim(),vehicle:d.vehicle||''};if(g) doc.againstId=g.id;else doc.headId=d.headId;
  if(await run(()=>setDoc('siteissues',newId(),doc),'Return note sent to the project manager for approval.')) closeModal()};
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='gpRet'?gpRetModal(m,busy):prev(m,busy)}
{const prev=alerts;alerts=function(){const o=prev();const td=today();
  const mine=ui.role==='site'?returnablesOut(siteProject()):(can('site_approve')||can('sitestock_view'))?returnablesOut('').filter(g=>ui.role==='hq'&&(!can('site_approve')||canApproveSite(g.projectId))):[];
  const late=mine.filter(g=>g.dueDate<td),soon=mine.filter(g=>g.dueDate>=td&&g.dueDate<=addDays(td,2));
  if(late.length) o.unshift({tone:'red',i:'clock',t:`${late.length} returnable gate pass${late.length>1?'es are':' is'} overdue`,s:late.slice(0,3).map(g=>gpDestText(g)+' · due '+fd(g.dueDate)).join(' · '),v:ui.role==='site'?'s_gp':'gatepasses'});
  if(soon.length) o.push({tone:'amber',i:'clock',t:`${soon.length} returnable item${soon.length>1?'s':''} due back in 2 days`,s:soon.slice(0,3).map(g=>gpDestText(g)).join(' · '),v:ui.role==='site'?'s_gp':'gatepasses'});
  return o}}
