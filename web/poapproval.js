"use strict";
/* ================= PURCHASE ORDER APPROVAL =================
   A new PO waits for the Director (Procurement) — a person with the right
   "Approve purchase orders" — who approves it with his signature-and-stamp image.
   Only then can it be emailed or sent to the vendor and received against.
   The server enforces the same rules (poapproval.go). */

Object.assign(ACT_PERM,{poApprove:'po_approve',savePoApprove:'po_approve',poReturn:'po_approve',poResubmit:['po_issue','po_approve'],saveMySign:'po_approve',savePoApprovalSetting:'__admin'});

const poAppr=po=>po&&po.approval||null;
const poIsApproved=po=>{const a=poAppr(po);return !a||a.status==='approved'};
const poPendingCount=()=>can('po_approve')?S.pos.filter(p=>p.status!=='cancelled'&&poAppr(p)&&poAppr(p).status==='pending').length+stiPendingList().length:0;
const poApprovalOn=()=>S.config.poApproval!==false;

// the approval card on the PO page
function poApprovalCard(po){const a=poAppr(po);if(!a||po.status==='cancelled') return '';
  if(a.status==='approved') return `<div class="notice ok po-appr">${icon('check')}<span><b>Approved by ${esc(a.byName||'')}</b>${a.designation?' ('+esc(a.designation)+')':''} on ${fdt(a.at)}${a.remark?' · “'+esc(a.remark)+'”':''}. The PO can now be sent to the vendor.</span>${a.sign?`<img class="sign-mini" src="/files/${esc(a.sign)}" alt="Signature">`:''}</div>`;
  const mine=can('po_approve');
  const head=a.status==='returned'?`<b>Sent back by ${esc(a.byName||'')}</b> on ${fdt(a.at)}: “${esc(a.remark||'')}”. Correct the PO and send it for approval again.`
    :`<b>Waiting for approval by the Director (Procurement).</b> Until it is approved, the PO cannot be emailed or sent to the vendor, and no material can be received against it.${a.remark?'<br>'+esc(a.remark):''}`;
  const btns=a.status==='returned'?(can('po_issue')||mine?`<button class="btn sm primary" data-act="poResubmit">${icon('ul')} Send for approval again</button>`:'')
    :(mine?`<button class="btn sm primary" data-act="poApprove">${icon('check')} Approve &amp; sign</button><button class="btn sm danger" data-act="poReturn">Send back</button>`:'');
  return `<div class="notice ${a.status==='returned'?'err':'warn'} po-appr">${icon(a.status==='returned'?'alert':'clock')}<span>${head}</span>${btns?`<div class="row tight">${btns}</div>`:''}</div>`}

// signature block at the foot of the PO document
function poSignBlock(po){const a=poAppr(po);
  if(a&&a.status==='approved'&&a.sign) return `<td style="text-align:right;vertical-align:bottom">For ${esc(company())}<br><img src="/files/${esc(a.sign)}" alt="" style="height:78px;max-width:220px;object-fit:contain;margin:4px 0"><br><b>${esc(a.byName||'')}</b><br>${esc(a.designation||'Authorised signatory')}<br><span style="color:#465A6D">Approved ${fd(msDate(a.at))}</span></td>`;
  return `<td style="text-align:right">For ${esc(company())}<br><br><br>Authorised signatory</td>`}
function poDraftMark(po){const a=poAppr(po);if(!a||a.status==='approved'||po.status==='cancelled') return '';
  return `<div style="border:2px solid #C0392B;color:#C0392B;font-weight:800;text-align:center;padding:8px;margin-bottom:12px;letter-spacing:.06em">DRAFT — NOT APPROVED — NOT VALID FOR SUPPLY</div>`}

/* ---------- approve / send back / resubmit ---------- */
A.poApprove=()=>{const po=poOf();if(!po) return;openModal({type:'poApprove',poId:po.id,d:{remark:''}})};
A.savePoApprove=async()=>{const m=ui.modal;const po=S.pos.find(p=>p.id===m.poId);if(!po) return;
  if(!ui.me.sign){toast('Upload your signature with stamp first (My account).','err');return}
  if(await run(()=>updDoc('pos',po.id,{approval:{status:'approved',remark:String(m.d.remark||'').trim()}}),po.no+' approved and signed. It can now be sent to the vendor.')!==false) closeModal()};
A.poReturn=()=>{const po=poOf();if(!po) return;confirmBox({title:'Send '+po.no+' back',body:'The purchase team corrects it and sends it for approval again.',noteArea:true,note:'Reason (required)',notePh:'e.g. Rate of DI pipe higher than last order; renegotiate',yes:'Send back',danger:true,
  onYes:async m=>{const r=String(m.noteVal||'').trim();if(!r){toast('Write why it is sent back.','err');return}if(await run(()=>updDoc('pos',po.id,{approval:{status:'returned',remark:r}}),'Sent back to the purchase team')!==false) closeModal()}})};
A.poResubmit=()=>{const po=poOf();if(!po) return;confirmBox({title:'Send '+po.no+' for approval',body:'The Director (Procurement) is asked to approve it again.',noteArea:true,note:'What was changed (optional)',yes:'Send for approval',
  onYes:async m=>{if(await run(()=>updDoc('pos',po.id,{approval:{status:'pending',remark:String(m.noteVal||'').trim()}}),'Sent for approval')!==false) closeModal()}})};

function poApproveModal(m,busy){if(m.type!=='poApprove') return '';const po=S.pos.find(p=>p.id===m.poId);if(!po) return '';const me=ui.me||{};const t=poTotals(po);
  return wrap('Approve '+esc(po.no),`<div class="meta"><div><span>Vendor</span><b>${esc(po.vendorName)}</b></div><div><span>Items</span><b>${(po.lines||[]).length}</b></div><div><span>Order value incl. GST</span><b>${money(t.total)}</b></div><div><span>Delivery</span><b>${esc(delivLabel(po))}</b></div></div>
   ${me.sign?`<div class="sign-prev"><span class="small muted">Your signature and stamp will be printed on the PO:</span><img src="/files/${esc(me.sign)}" alt="Your signature"><b>${esc(me.name||'')}</b><span class="small">${esc(me.designation||'Director (Procurement)')}</span></div>`
     :`<div class="notice warn">${icon('alert')}<span>You have not uploaded your signature with stamp yet. Go to <b>My account → Signature &amp; stamp</b>, upload it, then approve.</span><button class="btn sm" data-act="go" data-v="account">My account</button></div>`}
   <div class="f full"><label for="f-modal-d-remark">Remark (optional)</label>${inp('modal.d.remark',m.d.remark,'placeholder="e.g. Approved; ensure delivery before 15 Nov"')}</div>`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="savePoApprove" ${busy} ${me.sign?'':'disabled'}>${icon('check')} Approve &amp; sign</button>`)}

/* ---------- My account: signature with stamp ---------- */
function mySignCard(){if(!can('po_approve')) return '';const me=ui.me||{};const d=ui.draft.sign||(ui.draft.sign={sign:me.sign||'',designation:me.designation||'Director (Procurement)'});
  return `<section class="card" id="my-sign"><div class="card-h"><h2>Signature &amp; stamp</h2><span class="sub">Printed on every purchase order and site transfer indent you approve</span></div><div class="card-b grid" style="gap:12px">
   <p class="small muted">Sign on white paper and put the company stamp over it, take a clear photo (or scan) and crop it close. A PNG with a transparent background looks best. Each PO keeps the signature it was approved with.</p>
   <div class="f"><label>Signature with stamp</label>${photoPicker('draft.sign.sign',d.sign,{multi:false,pdf:false,png:true,label:d.sign?'Replace':'Upload image'})}</div>
   ${field('Designation printed under the signature','draft.sign.designation',d.designation)}
   <div class="row end"><button class="btn primary" data-act="saveMySign" ${ui.busy?'disabled':''}>Save</button></div></div></section>`}
A.saveMySign=async()=>{const d=ui.draft.sign;if(!d) return;const sign=Array.isArray(d.sign)?(d.sign[0]||''):(d.sign||'');
  if(!sign){toast('Upload the image of your signature with stamp.','err');return}
  const ok=await run(async()=>{const j=await api('/api/me/sign',{sign,designation:String(d.designation||'').trim()});ui.me=Object.assign({},ui.me,{sign:j.user.sign,designation:j.user.designation})},'Signature saved');
  if(ok!==false){ui.draft.sign=null;render()}};

/* ---------- Settings ---------- */
function poApprovalSettingCard(){if(!isAdm()) return '';const on=poApprovalOn();const who=(ui.users||[]).filter(u=>u.role==='hq'&&u.active!==false&&!u.admin&&((u.access||{}).perms||[]).includes('po_approve'));
  return `<section class="card" id="po-appr-set"><div class="card-h"><h2>Purchase order &amp; site transfer approval</h2>${on?'<span class="chip green">On</span>':'<span class="chip plain">Off</span>'}</div><div class="card-b grid" style="gap:12px">
   <p class="small muted">When on, every new PO and every site transfer indent waits for the Director (Procurement) to approve and sign it. A PO cannot be emailed to the vendor or received against, and a site cannot send transferred material, until it is approved. Create a login with the role <b>Director (Procurement)</b> in HQ team &amp; permissions (administrators cannot approve POs themselves); he uploads his signature with stamp in My account. Nobody can approve a PO they made themselves.</p>
   ${seg('poappr',[['0','Off — POs are active at once'],['1','On — Director approves every PO']],on?'1':'0','savePoApprovalSetting')}
   <div class="small">${who.length?'Can approve: '+who.map(u=>`<b>${esc(u.name)}</b> ${u.sign?'<span class="t-green">(signature uploaded)</span>':'<span class="t-amber">(no signature yet)</span>'}`).join(', '):'<span class="t-amber">Nobody has the right to approve purchase orders yet — new POs will wait until a Director (Procurement) login is created.</span>'}</div></div></section>`}
A.savePoApprovalSetting=async d=>{const on=d.val==='1';await run(()=>updDoc('config','main',{poApproval:on}),on?'PO approval switched on':'PO approval switched off')};
