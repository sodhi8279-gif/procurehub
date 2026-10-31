"use strict";
/* ================= VERSION 6 =================
   1. Site transfer indent (STI): material moved from one site to another instead of buying it.
      The indent goes to the Director (Procurement) as a draft, in the same path as a purchase
      order, and is approved with his signature and stamp before the sending site may dispatch.
   2. Existing stock with actual or approximate value, for every site store and the HQ store.
   3. Consumption reports at sites, authenticated by the site head / project manager.
   4. Find items, and (administrators) correct the spelling or unit of an item everywhere.
   The server enforces the same rules (approval.go, consumption.go, items.go). */

HQ_VIEWS.push('sti','consumption','finditems','jobwork');
SITE_VIEWS.push('s_cons','s_find');
Object.assign(VIEW_PERM,{sti:['po_issue','po_approve','store','rates_view'],consumption:['sitestock_view','sitestock_edit','consume_auth']});
Object.assign(TITLES,{sti:['Site transfer indent','Purchase orders'],consumption:['Consumption at sites','Material consumed, authenticated by the site head / project manager'],finditems:['Find items','Catalogue, stores, demands and orders'],
  s_cons:['Consumption','Material consumed at your site'],s_find:['Find items','Catalogue and your site stock']});
PERM_GROUPS[2][1].push(['consume_auth','Authenticate site consumption','Authenticate or reject consumption reported by sites (the site head / project manager of each site can also do this)']);
PERM_LABEL.consume_auth=PERM_GROUPS[2][1].slice(-1)[0][1];
Object.assign(ACT_PERM,{openSti:['po_issue','po_approve','store','rates_view'],stiApprove:'po_approve',saveStiApprove:'po_approve',stiReturn:'po_approve',stiResubmit:['store','po_issue','po_approve'],printSti:['po_issue','po_approve','store','rates_view'],
  openStock:['store','sitestock_edit'],saveOpenStock:['store','sitestock_edit'],osAdd:['store','sitestock_edit'],osRm:['store','sitestock_edit'],osPaste:['store','sitestock_edit'],
  consReport:'sitestock_edit',saveCons:'sitestock_edit',consAuth:'consume_auth',consReject:'consume_auth',itemFix:'__admin',saveItemFix:'__admin'});

/* ================= 1. SITE TRANSFER INDENT ================= */
const stiAppr=d=>d&&d.approval||null;
const stiApproved=d=>{const a=stiAppr(d);return !a||a.status==='approved'};
function stiPendingList(){return S.dispatches.filter(d=>d.type==='transfer'&&d.status==='to_send'&&stiAppr(d)&&stiAppr(d).status==='pending')}
const stiOf=()=>S.dispatches.find(x=>x.id===ui.param);
const stiName=d=>/^STI\//.test(d.no||'')?'Site transfer indent':'Transfer';

function stiListCard(onlyWaiting){
  let list=S.dispatches.filter(d=>d.type==='transfer');
  if(onlyWaiting) list=list.filter(d=>d.status==='to_send'&&stiAppr(d)&&stiAppr(d).status!=='approved');
  const q=norm(ui.f.pq);if(q) list=list.filter(d=>norm(d.no+' '+projLabel(d.fromProjectId)+' '+projLabel(d.projectId)+' '+(d.lines||[]).map(l=>l.desc).join(' ')).includes(q));
  list.sort((a,b)=>(b.at||0)-(a.at||0));
  return `<section class="card"><div class="card-h"><h2>${onlyWaiting?'Site transfer indents waiting for approval':'Site transfer indents'}</h2><span class="sub">Material moved from one site to another instead of a purchase</span></div>
  ${list.length?`<div class="tw"><table class="t"><thead><tr><th>Indent</th><th>From site</th><th>To site</th><th>Items</th>${seeRates()?'<th class="num">Approx. value</th>':''}<th>Made by</th><th>Status</th></tr></thead><tbody>${list.map(d=>`<tr class="click" data-act="openSti" data-id="${d.id}"><td><span class="docno">${esc(d.no)}</span><small class="muted block">${fd(d.date)}</small></td><td><b>${esc(projName(d.fromProjectId))}</b><small class="muted block">${esc(projCode(d.fromProjectId))}</small></td><td><b>${esc(projName(d.projectId))}</b><small class="muted block">${esc(projCode(d.projectId))}</small></td>
    <td><div class="thumbs">${(d.lines||[]).slice(0,4).map(l=>lineThumb(l,'xs')).join('')}<span class="small">${esc((d.lines||[]).map(l=>fq(l.qty)+' '+l.unit+' '+l.desc).join(', '))}</span></div></td>${seeRates()?`<td class="num mono">${stiValue(d)?money0(stiValue(d)):'—'}</td>`:''}<td class="small">${esc(d.createdByName||'')}</td><td>${chip(dispStatus(d))}</td></tr>`).join('')}</tbody></table></div>`
  :emptyBox(ART.x('transfer','e-art'),onlyWaiting?'Nothing waiting':'No site transfer indents yet','Make one from the procurement queue when another site has the item in stock (“Transfer from site”).')}</section>`}

function stiValue(d){return sum(d.lines||[],l=>num(l.qty)*D.rateOf(l.itemKey||itemKey(l.desc,l.spec,l.unit)))}

function stiApprovalCard(d){const a=stiAppr(d);if(!a||d.status==='cancelled') return '';
  if(a.status==='approved') return `<div class="notice ok po-appr">${icon('check')}<span><b>Approved by ${esc(a.byName||'')}</b>${a.designation?' ('+esc(a.designation)+')':''} on ${fdt(a.at)}${a.remark?' · “'+esc(a.remark)+'”':''}. ${d.status==='to_send'?esc(projCode(d.fromProjectId))+' can now send the material.':''}</span>${a.sign?`<img class="sign-mini" src="/files/${esc(a.sign)}" alt="Signature">`:''}</div>`;
  const mine=can('po_approve');
  const head=a.status==='returned'?`<b>Sent back by ${esc(a.byName||'')}</b> on ${fdt(a.at)}: “${esc(a.remark||'')}”. Correct it (or cancel it) and send it for approval again.`
    :`<b>Draft — waiting for approval by the Director (Procurement).</b> Until it is approved, ${esc(projCode(d.fromProjectId))} cannot send the material.${a.remark?'<br>'+esc(a.remark):''}`;
  const btns=a.status==='returned'?(can('store')||can('po_issue')||mine?`<button class="btn sm primary" data-act="stiResubmit" data-id="${d.id}">${icon('ul')} Send for approval again</button>`:'')
    :(mine?`<button class="btn sm primary" data-act="stiApprove" data-id="${d.id}">${icon('check')} Approve &amp; sign</button><button class="btn sm danger" data-act="stiReturn" data-id="${d.id}">Send back</button>`:'');
  return `<div class="notice ${a.status==='returned'?'err':'warn'} po-appr">${icon(a.status==='returned'?'alert':'clock')}<span>${head}</span>${btns?`<div class="row tight">${btns}</div>`:''}</div>`}

function stiDoc(d){
  const c=S.config,fp=proj(d.fromProjectId)||{},tp=proj(d.projectId)||{},a=stiAppr(d);const b='border:1px solid #c9d3d6;padding:6px 8px;font-size:12.5px;vertical-align:top';
  const logo=c.logo?`<img src="/files/${esc(c.logo)}" style="height:54px;max-width:160px;object-fit:contain;margin-bottom:6px" alt="">`:'';
  const draft=a&&a.status!=='approved'&&d.status!=='cancelled'?`<div style="border:2px solid #C0392B;color:#C0392B;font-weight:800;text-align:center;padding:8px;margin-bottom:12px;letter-spacing:.06em">DRAFT — NOT APPROVED — MATERIAL NOT TO BE SENT</div>`:'';
  const vals=seeRates();const tot=vals?stiValue(d):0;
  const site=(lab,p)=>`<b>${lab}</b><br>${esc(p.name||'')}${p.code?' ('+esc(p.code)+')':''}<br><span style="white-space:pre-line">${esc(p.address||[p.city,p.state].filter(Boolean).join(', '))}</span>${p.siteContact?'<br>Site in-charge: '+esc(p.siteContact)+(p.phone?' · '+esc(p.phone):''):''}`;
  const sign=a&&a.status==='approved'&&a.sign?`<td style="text-align:right;vertical-align:bottom">For ${esc(company())}<br><img src="/files/${esc(a.sign)}" alt="" style="height:78px;max-width:220px;object-fit:contain;margin:4px 0"><br><b>${esc(a.byName||'')}</b><br>${esc(a.designation||'Authorised signatory')}<br><span style="color:#465A6D">Approved ${fd(msDate(a.at))}</span></td>`
    :`<td style="text-align:right;vertical-align:bottom">For ${esc(company())}<br><br><br>Director (Procurement)</td>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0F2132;background:#fff;padding:28px;max-width:900px;margin:0 auto">${draft}
  <table style="width:100%;border-collapse:collapse"><tr><td style="vertical-align:top">${logo}<div style="font-size:20px;font-weight:800">${esc(company())}</div><div style="font-size:12px;color:#465A6D;white-space:pre-line">${esc(c.hqAddress||'')}</div></td>
  <td style="text-align:right;vertical-align:top"><div style="font-size:21px;font-weight:800;color:#1172C4">SITE TRANSFER INDENT</div><div style="font-size:13px"><b>${esc(d.no)}</b><br>Date: ${fd(d.date)}${[...new Set((d.lines||[]).map(l=>l.mrNo).filter(Boolean))].length?'<br>Against demand: '+esc([...new Set((d.lines||[]).map(l=>l.mrNo).filter(Boolean))].join(', ')):''}</div></td></tr></table>
  <table style="width:100%;border-collapse:collapse;margin-top:16px"><tr><td style="${b};width:50%">${site('Material to be sent from',fp)}</td><td style="${b}">${site('Material to be received at',tp)}</td></tr>
  ${d.purpose||d.note?`<tr><td colspan="2" style="${b}">${d.purpose?'<b>Purpose:</b> '+esc(d.purpose):''}${d.purpose&&d.note?'<br>':''}${d.note?'<b>Note to sending site:</b> '+esc(d.note):''}</td></tr>`:''}</table>
  <table style="width:100%;border-collapse:collapse;margin-top:16px"><thead><tr style="background:#e9eef2"><th style="${b}">#</th><th style="${b};text-align:left">Item</th><th style="${b};text-align:left">Demand</th><th style="${b};text-align:right">Qty</th><th style="${b}">Unit</th>${vals?`<th style="${b};text-align:right">Approx. rate (₹)</th><th style="${b};text-align:right">Approx. value (₹)</th>`:''}</tr></thead>
  <tbody>${(d.lines||[]).map((l,i)=>{const r=D.rateOf(l.itemKey||itemKey(l.desc,l.spec,l.unit));return `<tr><td style="${b}">${i+1}</td><td style="${b}"><b>${esc(l.desc)}</b>${l.spec?'<br><span style="color:#465A6D">'+esc(l.spec)+'</span>':''}</td><td style="${b}">${esc(l.mrNo||'')}</td><td style="${b};text-align:right">${fq(l.qty)}</td><td style="${b}">${esc(l.unit)}</td>${vals?`<td style="${b};text-align:right">${r?fq(r):'—'}</td><td style="${b};text-align:right">${r?fq(num(l.qty)*r):'—'}</td>`:''}</tr>`}).join('')}
  ${vals&&tot?`<tr><td colspan="6" style="${b};text-align:right"><b>Approximate value of material transferred</b></td><td style="${b};text-align:right"><b>${fq(tot)}</b></td></tr>`:''}</tbody></table>
  <div style="margin-top:14px;font-size:12px;color:#465A6D">The sending site dispatches the material with a transfer challan only after this indent is approved, and the receiving site confirms receipt in ProcureHub with the signed and stamped challan. The material is not purchased; no purchase order is issued for these quantities.</div>
  <table style="width:100%;margin-top:40px;font-size:12px"><tr><td style="vertical-align:bottom">Prepared by<br><br><b>${esc(d.createdByName||'')}</b><br>${fd(msDate(d.at||Date.now()))}</td>${sign}</tr></table></div>`}

function vSti(){
  const d=stiOf();if(!d||d.type!=='transfer') return emptyBox('','Indent not found','',`<button class="btn" data-act="setF" data-k="ps" data-val="sti" data-go="pos">Back</button>`);
  const st=dispStatus(d);const sent=['in_transit','delivered','short'].includes(d.status);
  return `<section class="card"><div class="card-h"><span class="n-ic violet">${icon('swap')}</span><div><h2>${esc(stiName(d))} <span class="docno">${esc(d.no)}</span></h2><span class="sub">${esc(projLabel(d.fromProjectId))} → ${esc(projLabel(d.projectId))}</span></div>${chip(st)}
   <div class="acts"><button class="btn sm" data-act="printSti" data-id="${d.id}">${icon('print')} Print</button>${sent?`<button class="btn sm" data-act="printChallan" data-id="${d.id}">${icon('doc')} Transfer challan</button>`:''}${d.status==='to_send'?`<button class="btn sm danger" data-act="cancelDispatch" data-id="${d.id}">Cancel</button>`:''}<button class="btn sm ghost" data-act="setF" data-k="ps" data-val="sti" data-go="pos">${icon('back')} Back</button></div></div>
   <div class="card-b">${stiApprovalCard(d)}${!stiAppr(d)&&d.status==='to_send'?`<div class="notice info">${icon('help')}<span>This transfer was made before approval of transfers was switched on, so it does not need approval.</span></div>`:''}
   ${sent?`<p class="small muted">${icon('truck','xs')} Sent ${fdt(d.shippedAt)}${d.sentByName?' by '+esc(d.sentByName):''}${d.vehicle?' · vehicle '+esc(d.vehicle):''}${d.receivedAt?' · received '+fdt(d.receivedAt)+' by '+esc(d.receivedByName||''):''}</p>`:''}
   <div class="paper">${stiDoc(d)}</div></div></section>`}

A.openSti=d=>go('sti',d.id);
A.printSti=d=>{const x=S.dispatches.find(y=>y.id===(d.id||ui.param));if(x) printHtml(x.no,stiDoc(x))};
A.stiApprove=d=>openModal({type:'stiApprove',id:d.id||ui.param,d:{remark:''}});
A.saveStiApprove=async()=>{const m=ui.modal;const x=S.dispatches.find(y=>y.id===m.id);if(!x) return;
  if(!ui.me.sign){toast('Upload your signature with stamp first (My account).','err');return}
  if(await run(()=>updDoc('dispatches',x.id,{approval:{status:'approved',remark:String(m.d.remark||'').trim()}}),x.no+' approved and signed. '+projCode(x.fromProjectId)+' can now send the material.')!==false) closeModal()};
A.stiReturn=d=>{const x=S.dispatches.find(y=>y.id===(d.id||ui.param));if(!x) return;confirmBox({title:'Send '+x.no+' back',body:'The store / purchase team corrects it or cancels it.',noteArea:true,note:'Reason (required)',notePh:'e.g. Buy fresh instead; the sending site needs this material next month',yes:'Send back',danger:true,
  onYes:async m=>{const r=String(m.noteVal||'').trim();if(!r){toast('Write why it is sent back.','err');return}if(await run(()=>updDoc('dispatches',x.id,{approval:{status:'returned',remark:r}}),'Sent back')!==false) closeModal()}})};
A.stiResubmit=d=>{const x=S.dispatches.find(y=>y.id===(d.id||ui.param));if(!x) return;confirmBox({title:'Send '+x.no+' for approval',body:'The Director (Procurement) is asked to approve it again.',noteArea:true,note:'What was changed (optional)',yes:'Send for approval',
  onYes:async m=>{if(await run(()=>updDoc('dispatches',x.id,{approval:{status:'pending',remark:String(m.noteVal||'').trim()}}),'Sent for approval')!==false) closeModal()}})};

function stiApproveModal(m,busy){const d=S.dispatches.find(x=>x.id===m.id);if(!d) return '';const me=ui.me||{};
  return wrap('Approve '+esc(d.no),`<div class="meta"><div><span>From</span><b>${esc(projLabel(d.fromProjectId))}</b></div><div><span>To</span><b>${esc(projLabel(d.projectId))}</b></div><div><span>Items</span><b>${(d.lines||[]).length}</b></div>${seeRates()&&stiValue(d)?`<div><span>Approx. value</span><b>${money(stiValue(d))}</b></div>`:''}</div>
   <div class="small">${(d.lines||[]).map(l=>`${fq(l.qty)} ${esc(l.unit)} <b>${esc(l.desc)}</b>${l.spec?' — '+esc(l.spec):''}`).join('<br>')}</div>
   ${me.sign?`<div class="sign-prev"><span class="small muted">Your signature and stamp will be printed on the indent:</span><img src="/files/${esc(me.sign)}" alt="Your signature"><b>${esc(me.name||'')}</b><span class="small">${esc(me.designation||'Director (Procurement)')}</span></div>`
     :`<div class="notice warn">${icon('alert')}<span>You have not uploaded your signature with stamp yet. Go to <b>My account → Signature &amp; stamp</b>, upload it, then approve.</span><button class="btn sm" data-act="go" data-v="account">My account</button></div>`}
   <div class="f full"><label for="f-modal-d-remark">Remark (optional)</label>${inp('modal.d.remark',m.d.remark,'placeholder="e.g. Approved; send within 3 days"')}</div>`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveStiApprove" ${busy} ${me.sign?'':'disabled'}>${icon('check')} Approve &amp; sign</button>`)}

/* ================= 2. EXISTING STOCK WITH VALUE ================= */
const osLine=()=>({desc:'',spec:'',unit:'Nos',qty:'',rate:'',value:''});
A.openStock=d=>{const target=d.p||siteProject();if(!target){toast('Choose a project first.','err');return}
  openModal({type:'openStock',target,d:{date:today(),basis:'actual',remarks:'',lines:[osLine(),osLine(),osLine()],paste:'',showPaste:false}})};
A.osAdd=()=>{ui.modal.d.lines.push(osLine());render()};
A.osRm=d=>{const ls=ui.modal.d.lines;ls.splice(+d.i,1);if(!ls.length) ls.push(osLine());render()};
A.osPasteToggle=()=>{ui.modal.d.showPaste=!ui.modal.d.showPaste;render()};
A.osPaste=()=>{const d=ui.modal.d;const rows=String(d.paste||'').split(/\r?\n/).map(r=>r.split(r.includes('\t')?'\t':/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c=>c.trim().replace(/^"|"$/g,''))).filter(r=>r.some(Boolean));
  const add=[];for(const r of rows){const [desc,spec,unit,qty,rate,value]=r;if(!desc||!(num(qty)>0)) continue;add.push({desc,spec:spec||'',unit:guessUnit(unit||''),qty:String(num(qty)),rate:num(rate)>0?String(num(rate)):'',value:num(value)>0?String(num(value)):''})}
  if(!add.length){toast('No rows with an item and a quantity were found. Columns: Item · Specification · Unit · Qty · Rate · Value.','err');return}
  d.lines=d.lines.filter(l=>String(l.desc).trim()).concat(add);d.paste='';d.showPaste=false;render();toast(add.length+' row'+(add.length===1?'':'s')+' added')};
const osRate=l=>num(l.rate)>0?num(l.rate):(num(l.value)>0&&num(l.qty)>0?num(l.value)/num(l.qty):0);
const osVal=l=>num(l.value)>0?num(l.value):num(l.qty)*num(l.rate);

function openStockModal(m,busy){const d=m.d;const hq=m.target==='hq';const vals=ui.role==='hq'&&seeRates();
  const where=hq?'HQ store':projLabel(m.target);const total=sum(d.lines,osVal);const n=d.lines.filter(l=>String(l.desc).trim()&&num(l.qty)>0).length;
  return wrap('Existing stock · '+esc(where),`<datalist id="dl-os">${D.items.slice(0,800).map(c=>`<option value="${esc(c.desc)}">`).join('')}</datalist>
   <p class="small muted">Enter the material already lying in the ${hq?'HQ store':'site store'}${vals?' with its value. Give the rate per unit <b>or</b> the total value of each line.':'.'} It is added to the stock register as existing stock and can then be issued, transferred or dispatched like any other stock.</p>
   <div class="fields two">${field('Stock as on','modal.d.date',d.date,'type="date"')}${vals?`<div class="f"><label>Value is</label>${seg('osb',[['actual','Actual (from bills)'],['approx','Approximate (estimated)']],d.basis,'osBasis')}</div>`:'<div class="f"></div>'}</div>
   <div class="tw"><table class="t os-t"><thead><tr><th>#</th><th>Item</th><th>Specification / size</th><th>Unit</th><th class="num">Qty</th>${vals?'<th class="num">Rate (₹)</th><th class="num">Value (₹)</th>':''}<th></th></tr></thead><tbody>
   ${d.lines.map((l,i)=>`<tr><td class="muted">${i+1}</td><td>${inp('modal.d.lines.'+i+'.desc',l.desc,'list="dl-os" placeholder="Item name" style="min-width:180px"')}</td><td>${inp('modal.d.lines.'+i+'.spec',l.spec,'placeholder="e.g. 150 mm"')}</td>
     <td><select class="inp sm auto" id="${fid('modal.d.lines.'+i+'.unit')}" data-bind="modal.d.lines.${i}.unit">${selOpts(UNITS.includes(l.unit)?UNITS:UNITS.concat([l.unit]),l.unit)}</select></td>
     <td>${inp('modal.d.lines.'+i+'.qty',l.qty,'inputmode="decimal" style="width:90px" data-rerender="1"')}</td>
     ${vals?`<td>${inp('modal.d.lines.'+i+'.rate',l.rate,'inputmode="decimal" style="width:100px" data-rerender="1"')}</td><td>${inp('modal.d.lines.'+i+'.value',l.value,`inputmode="decimal" style="width:120px" data-rerender="1" placeholder="${osVal(l)?fq(Math.round(osVal(l))):''}"`)}</td>`:''}
     <td><button type="button" class="icon-btn sm" data-act="osRm" data-i="${i}" aria-label="Remove line">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>
   <div class="row"><button type="button" class="btn sm" data-act="osAdd">${icon('plus')} Add line</button><button type="button" class="btn sm" data-act="osPasteToggle">${icon('copy')} Paste from Excel</button><span class="spacer"></span>${vals?`<b>${n} item${n===1?'':'s'} · ${money(total)}${d.basis==='approx'?' (approx.)':''}</b>`:`<b>${n} item${n===1?'':'s'}</b>`}</div>
   ${d.showPaste?`<div class="f full"><label for="f-modal-d-paste">Copy rows from Excel with the columns <b>Item · Specification · Unit · Qty${vals?' · Rate · Value':''}</b> and paste them here</label><textarea class="inp" id="f-modal-d-paste" data-bind="modal.d.paste" rows="5" placeholder="DI K7 pipe&#9;150 mm&#9;Mtr&#9;120&#9;1450"></textarea><div class="row end"><button type="button" class="btn sm primary" data-act="osPaste">Add these rows</button></div></div>`:''}
   ${field('Remarks (e.g. physical verification by, location in store)','modal.d.remarks',d.remarks,'','full')}`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveOpenStock" ${busy}>${icon('plus')} Add to ${hq?'HQ store':'site stock'}</button>`,'wide')}
A.osBasis=d=>{ui.modal.d.basis=d.val;render()};

A.saveOpenStock=async()=>{const m=ui.modal,d=m.d;const hq=m.target==='hq';const vals=ui.role==='hq'&&seeRates();
  const lines=d.lines.filter(l=>String(l.desc).trim()||num(l.qty)>0);
  for(const l of lines){if(!String(l.desc).trim()){toast('Enter the item name on every line.','err');return}if(!(num(l.qty)>0)){toast('Enter the quantity for '+l.desc+'.','err');return}}
  if(!lines.length){toast('Enter at least one item.','err');return}
  const now=Date.now(),me=(ui.me&&ui.me.name)||'';
  const clean=l=>{const desc=String(l.desc).trim(),spec=String(l.spec||'').trim(),unit=l.unit||'Nos';const o={desc,spec,unit,cat:classify(desc,spec).cat,itemKey:itemKey(desc,spec,unit)};
    if(vals&&osRate(l)>0){o.orate=Math.round(osRate(l)*100)/100;o.value=Math.round(osVal(l)*100)/100;o.basis=d.basis}return o};
  const ok=await run(async()=>{
    if(hq){const no=await allocNo('OS',S.grns);
      await setDoc('grns',newId(),{no,poId:null,type:'opening',date:d.date||today(),basis:vals?d.basis:'',remarks:d.remarks||'',party:'Existing stock',at:now,by:ui.uid,byName:me,
        lines:lines.map((l,i)=>Object.assign(clean(l),{key:'O'+(i+1),recv:num(l.qty),rej:0,acc:num(l.qty)}))});return no}
    const no=await allocNo('OS',S.sitelog.filter(e=>e.batch).map(e=>({no:e.batch})).concat(S.grns));
    for(const l of lines) await setDoc('sitelog',newId(),Object.assign(clean(l),{type:'opening',projectId:m.target,qty:num(l.qty),date:d.date||today(),reason:'Existing stock',remarks:d.remarks||'',batch:no,at:now,createdBy:ui.uid,createdByName:me}));
    return no});
  if(ok){closeModal();toast(`${ok}: ${lines.length} item${lines.length===1?'':'s'} added to ${hq?'the HQ store':projCode(m.target)+' stock'}`)}};

/* ================= 3. CONSUMPTION AT SITES ================= */
const CONS_ST={pending:{label:'Waiting for authentication',tone:'amber'},authenticated:{label:'Authenticated',tone:'green'},rejected:{label:'Rejected',tone:'red'}};
function consCanAuth(c){if(!c||c.status!=='pending'||c.reportedBy===ui.uid) return false;
  if(ui.role==='site') return !ui.preview&&!!(ui.me&&ui.me.siteHead)&&ui.me.projectId===c.projectId;
  return can('consume_auth')}
function consWaiting(){return S.consumption.filter(consCanAuth).length}
function consBody(pid){
  const f=ui.f.cf||(consWaiting()?'pending':'all');const q=norm(ui.f.cq);
  let list=S.consumption.filter(c=>!pid||c.projectId===pid);const all=list.length;
  if(f!=='all') list=list.filter(c=>c.status===f);
  if(q) list=list.filter(c=>norm([c.no,c.description,c.remarks,c.reportedByName,...(c.lines||[]).map(l=>l.desc+' '+l.spec)].join(' ')).includes(q));
  list.sort((a,b)=>(b.at||0)-(a.at||0));
  const site=ui.role==='site';const head=site&&ui.me&&ui.me.siteHead;const canReport=site||can('sitestock_edit');
  const pend=S.consumption.filter(c=>(!pid||c.projectId===pid)&&c.status==='pending').length;
  return `${site?`<div class="notice info">${icon('help')}<span>${head?'You are the <b>site head / project manager</b> of this site. Consumption reported by others counts in site stock only after you authenticate it.':'Report material consumed at site with a description of the work. It reduces site stock once the <b>site head / project manager</b> authenticates it.'}</span></div>`:''}
  <div class="toolbar">${seg('cf',[['pending',`Waiting${pend?' ('+pend+')':''}`],['authenticated','Authenticated'],['rejected','Rejected'],['all','All']],f)}<div class="search-inp">${icon('search')}<input class="inp" id="f-cq" placeholder="Search report, work or item" data-bind="f.cq" data-rerender="1" value="${esc(ui.f.cq||'')}"></div><span class="spacer"></span>${canReport&&pid?`<button class="btn orange" data-act="consReport" data-p="${pid}">${icon('plus')} Report consumption</button>`:''}</div>
  ${list.length?list.map(consCard).join(''):`<section class="card">${emptyBox(ART.x('use','e-art'),all?'Nothing here':'No consumption reported yet',pid?'Report material consumed at site, with the description of the work and remarks.':'Sites report consumption from their Consumption page.',canReport&&pid?`<button class="btn orange" data-act="consReport" data-p="${pid}">${icon('plus')} Report consumption</button>`:'')}</section>`}`}
function consCard(c){const s=CONS_ST[c.status]||CONS_ST.pending;const a=c.auth||{};const mineEdit=c.status==='pending'&&(c.reportedBy===ui.uid||(ui.role==='hq'&&can('sitestock_edit')));
  return `<section class="card cons-card"><div class="card-h"><span class="n-ic ${s.tone}">${icon('doc')}</span><div><h2><span class="docno">${esc(c.no||'')}</span> · ${fd(c.date)}</h2><span class="sub">${ui.role==='hq'?esc(projLabel(c.projectId))+' · ':''}reported by ${esc(c.reportedByName||'')}${c.reportedAt?' on '+fdt(c.reportedAt):''}</span></div>${chip(s)}
   <div class="acts">${consCanAuth(c)?`<button class="btn sm primary" data-act="consAuth" data-id="${c.id}">${icon('check')} Authenticate</button><button class="btn sm danger" data-act="consReject" data-id="${c.id}">Reject</button>`:''}${mineEdit?`<button class="btn sm" data-act="consReport" data-id="${c.id}">${icon('edit')} Correct</button><button class="btn sm ghost" data-act="consDel" data-id="${c.id}">${icon('trash')}</button>`:''}<button class="btn sm ghost" data-act="consPrint" data-id="${c.id}">${icon('print')}</button></div></div>
   <div class="card-b"><p><b>Description of consumption:</b> ${esc(c.description||'')}</p>${c.location?`<p class="small"><b>Location / work:</b> ${esc(c.location)}</p>`:''}${c.remarks?`<p class="small"><b>Remarks:</b> ${esc(c.remarks)}</p>`:''}
   <div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Qty consumed</th></tr></thead><tbody>${(c.lines||[]).map(l=>`<tr><td><div class="who">${lineThumb(l,'xs')}<span><b>${esc(l.desc)}</b><small class="muted block">${esc(l.spec||'')}</small></span></div></td><td class="num mono">${fq(l.qty)} ${esc(l.unit)}</td></tr>`).join('')}</tbody></table></div>
   ${photoStrip(c.photos)}
   ${c.status!=='pending'?`<p class="small ${c.status==='rejected'?'t-red':'t-green'}">${icon(c.status==='rejected'?'alert':'check','xs')} ${c.status==='rejected'?'Rejected':'Authenticated'} by <b>${esc(a.byName||'')}</b>${a.designation?' ('+esc(a.designation)+')':''} on ${fdt(a.at)}${a.remark?' · “'+esc(a.remark)+'”':''}</p>`:''}</div></section>`}
function vConsumption(){
  if(ui.role==='site') return consBody(siteProject());
  const pf=ui.f.cp||'';
  return `<div class="toolbar"><select class="inp auto" id="f-cp" data-act-change="setFsel" data-k="cp">${projOpts(pf,'All projects')}</select>${pf?`<span class="muted">${esc(projLabel(pf))}</span>`:''}</div>${consBody(pf)}`}

A.consReport=d=>{const c=d.id?S.consumption.find(x=>x.id===d.id):null;const pid=c?c.projectId:(d.p||siteProject()||ui.f.cp||'');
  if(!pid){toast('Choose the project first.','err');return}
  const lines=c?c.lines.map(l=>({key:l.itemKey||itemKey(l.desc,l.spec,l.unit),qty:String(l.qty)})):[{key:'',qty:''}];
  openModal({type:'consReport',id:c?c.id:null,projectId:pid,d:{date:c?c.date:today(),description:c?c.description:'',location:c?c.location||'':'',remarks:c?c.remarks||'':'',photos:c?(c.photos||[]).slice():[],lines}})};
A.consAddLine=()=>{ui.modal.d.lines.push({key:'',qty:''});render()};
A.consRmLine=d=>{const ls=ui.modal.d.lines;ls.splice(+d.i,1);if(!ls.length) ls.push({key:'',qty:''});render()};
function consAvail(pid,key,exceptId){const r=(D.site[pid]||{})[key];if(!r) return 0;let own=0;const c=exceptId&&S.consumption.find(x=>x.id===exceptId);if(c&&c.status==='pending') for(const l of c.lines||[]) if((l.itemKey||itemKey(l.desc,l.spec,l.unit))===key) own+=num(l.qty);return Math.round((r.bal-r.pcons+own)*1000)/1000}
function consModal(m,busy){const d=m.d;const rows=siteRows(m.projectId).filter(r=>r.bal>1e-9||d.lines.some(l=>l.key===r.itemKey));
  return wrap((m.id?'Correct consumption report':'Report consumption')+' · '+esc(projCode(m.projectId)),`
   <div class="fields two">${field('Date of consumption','modal.d.date',d.date,'type="date"')}${field('Location / chainage / structure','modal.d.location',d.location,'placeholder="e.g. Zone 3, MH-41 to MH-47"')}</div>
   <div class="f full"><label for="f-modal-d-description">Description of consumption (required)</label><textarea class="inp" id="f-modal-d-description" data-bind="modal.d.description" rows="3" placeholder="e.g. Laying of 150 mm DI K7 pipeline from MH-41 to MH-47, 120 m, including jointing">${esc(d.description||'')}</textarea></div>
   <div class="lbl">Material consumed</div>
   ${rows.length?`<div class="tw"><table class="t"><thead><tr><th>Item in site stock</th><th class="num">Available</th><th class="num">Qty consumed</th><th></th></tr></thead><tbody>${d.lines.map((l,i)=>{const r=(D.site[m.projectId]||{})[l.key];return `<tr><td><select class="inp" id="${fid('modal.d.lines.'+i+'.key')}" data-bind="modal.d.lines.${i}.key"><option value="">Choose item…</option>${rows.map(x=>`<option value="${esc(x.itemKey)}" ${x.itemKey===l.key?'selected':''}>${esc(x.desc)}${x.spec?' — '+esc(x.spec):''} (${esc(x.unit)})</option>`).join('')}</select></td>
     <td class="num mono">${r?fq(consAvail(m.projectId,l.key,m.id))+' '+esc(r.unit):'—'}</td><td>${inp('modal.d.lines.'+i+'.qty',l.qty,'inputmode="decimal" style="width:110px"')}</td><td><button type="button" class="icon-btn sm" data-act="consRmLine" data-i="${i}" aria-label="Remove">${icon('trash')}</button></td></tr>`}).join('')}</tbody></table></div>
   <div class="row"><button type="button" class="btn sm" data-act="consAddLine">${icon('plus')} Add item</button></div>`:`<div class="notice warn">${icon('alert')}<span>There is no stock at this site to report against. Material appears in site stock when receipts are confirmed or existing stock is added.</span></div>`}
   <div class="f full"><label for="f-modal-d-remarks">Remarks</label><textarea class="inp" id="f-modal-d-remarks" data-bind="modal.d.remarks" rows="2" placeholder="e.g. Wastage 2 m due to cutting">${esc(d.remarks||'')}</textarea></div>
   <div class="f full"><label>Photos (optional)</label>${photoPicker('modal.d.photos',d.photos)}</div>
   <p class="small muted">The report goes to the site head / project manager for authentication. Site stock reduces once it is authenticated.</p>`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveCons" ${busy} ${rows.length?'':'disabled'}>${icon('check')} ${m.id?'Save correction':'Send for authentication'}</button>`,'wide')}
A.saveCons=async()=>{const m=ui.modal,d=m.d;const desc=String(d.description||'').trim();
  if(!desc){toast('Describe the consumption (work done / where the material was used).','err');return}
  const ls=d.lines.filter(l=>l.key||num(l.qty)>0);if(!ls.length){toast('Add at least one item consumed.','err');return}
  const seen={};const lines=[];
  for(const l of ls){const r=(D.site[m.projectId]||{})[l.key];if(!r){toast('Choose the item on every line.','err');return}const q=num(l.qty);if(!(q>0)){toast('Enter the quantity consumed for '+r.desc+'.','err');return}
    seen[l.key]=(seen[l.key]||0)+q;const av=consAvail(m.projectId,l.key,m.id);if(seen[l.key]>av+1e-9){toast(`Only ${fq(av)} ${r.unit} of ${r.desc} is available at site.`,'err');return}
    lines.push({itemKey:r.itemKey,desc:r.desc,spec:r.spec||'',unit:r.unit,cat:r.cat,qty:q})}
  const body={date:d.date||today(),description:desc,location:String(d.location||'').trim(),remarks:String(d.remarks||'').trim(),photos:d.photos||[],lines};
  const ok=await run(async()=>{if(m.id){await updDoc('consumption',m.id,body);return S.consumption.find(x=>x.id===m.id).no}
    const no=await allocNo('CR',S.consumption);await setDoc('consumption',newId(),Object.assign({no,projectId:m.projectId,at:Date.now()},body));return no});
  if(ok){closeModal();toast(m.id?ok+' corrected':ok+' sent to the site head / project manager for authentication')}};
A.consAuth=d=>{const c=S.consumption.find(x=>x.id===d.id);if(!c) return;confirmBox({title:'Authenticate '+c.no,body:`<p>${esc(c.description)}</p><p class="small">${(c.lines||[]).map(l=>`${fq(l.qty)} ${esc(l.unit)} ${esc(l.desc)}`).join(' · ')}</p><p class="small muted">Reported by ${esc(c.reportedByName||'')}. Site stock reduces by these quantities.</p>`,noteArea:true,note:'Remark (optional)',yes:'Authenticate',
  onYes:async m=>{if(await run(()=>updDoc('consumption',c.id,{status:'authenticated',authRemark:String(m.noteVal||'').trim()}),c.no+' authenticated. Site stock updated.')!==false) closeModal()}})};
A.consReject=d=>{const c=S.consumption.find(x=>x.id===d.id);if(!c) return;confirmBox({title:'Reject '+c.no,body:'The quantities are not taken out of site stock. The reporter can make a fresh report.',noteArea:true,note:'Reason (required)',yes:'Reject',danger:true,
  onYes:async m=>{const r=String(m.noteVal||'').trim();if(!r){toast('Write why the report is rejected.','err');return}if(await run(()=>updDoc('consumption',c.id,{status:'rejected',authRemark:r}),c.no+' rejected')!==false) closeModal()}})};
A.consDel=d=>{const c=S.consumption.find(x=>x.id===d.id);if(!c) return;confirmBox({title:'Withdraw '+c.no+'?',body:'The report is removed. Nothing changes in site stock.',yes:'Withdraw',danger:true,onYes:async()=>{if(await run(()=>delDoc('consumption',c.id),'Report withdrawn')) closeModal()}})};
A.consPrint=d=>{const c=S.consumption.find(x=>x.id===d.id);if(c) printHtml(c.no,consDoc(c))};
function consDoc(c){const p=proj(c.projectId)||{},a=c.auth||{};const b='border:1px solid #c9d3d6;padding:6px 8px;font-size:12.5px;vertical-align:top';
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0F2132;padding:28px;max-width:860px;margin:0 auto">
  <table style="width:100%"><tr><td><b style="font-size:19px">${esc(company())}</b><div style="font-size:12px;color:#465A6D">${esc(p.name||'')} ${p.code?'('+esc(p.code)+')':''}</div></td><td style="text-align:right"><div style="font-size:20px;font-weight:800;color:#1172C4">MATERIAL CONSUMPTION REPORT</div><b>${esc(c.no||'')}</b><br>Date: ${fd(c.date)}</td></tr></table>
  <table style="width:100%;border-collapse:collapse;margin-top:14px"><tr><td style="${b}"><b>Description of consumption</b><br>${esc(c.description||'')}${c.location?'<br><b>Location / work:</b> '+esc(c.location):''}${c.remarks?'<br><b>Remarks:</b> '+esc(c.remarks):''}</td></tr></table>
  <table style="width:100%;border-collapse:collapse;margin-top:14px"><thead><tr style="background:#e9eef2"><th style="${b}">#</th><th style="${b};text-align:left">Item</th><th style="${b};text-align:right">Qty consumed</th><th style="${b}">Unit</th></tr></thead><tbody>${(c.lines||[]).map((l,i)=>`<tr><td style="${b}">${i+1}</td><td style="${b}"><b>${esc(l.desc)}</b>${l.spec?'<br><span style="color:#465A6D">'+esc(l.spec)+'</span>':''}</td><td style="${b};text-align:right">${fq(l.qty)}</td><td style="${b}">${esc(l.unit)}</td></tr>`).join('')}</tbody></table>
  <table style="width:100%;margin-top:40px;font-size:12px"><tr><td style="vertical-align:bottom">Reported by<br><br><b>${esc(c.reportedByName||'')}</b><br>${c.reportedAt?fdt(c.reportedAt):''}</td>
  <td style="text-align:right;vertical-align:bottom">${c.status==='authenticated'?`Authenticated by<br><br><b>${esc(a.byName||'')}</b><br>${esc(a.designation||'Site head / Project manager')}<br>${fdt(a.at)}${a.remark?'<br>“'+esc(a.remark)+'”':''}`:c.status==='rejected'?`<b style="color:#C0392B">REJECTED</b> by ${esc(a.byName||'')} on ${fdt(a.at)}<br>${esc(a.remark||'')}`:`<span style="color:#8a5a00">Not yet authenticated</span><br><br>Site head / Project manager`}</td></tr></table></div>`}

/* ================= 4. FIND ITEMS · CORRECT NAMES AND UNITS ================= */
function itemIndex(){const site=ui.role==='site',pid=siteProject();const M={};
  const get=(k,s)=>M[k]||(M[k]={key:k,desc:s.desc,spec:s.spec||'',unit:s.unit,cat:s.cat||s.category||classify(s.desc,s.spec).cat,hq:0,sites:[],dem:0,demN:0,pos:[],cons:0});
  if(!site) for(const k in D.stock){const s=D.stock[k];if(s.inQ||s.outQ) get(k,s).hq=s.bal}
  for(const p in D.site){if(site&&p!==pid) continue;for(const k in D.site[p]){const r=D.site[p][k];if(r.bal||r.recv||r.open) {const o=get(k,r);if(r.bal) o.sites.push([p,r.bal]);o.cons+=r.cons+r.used}}}
  for(const x of allLines(site?pid:'')){if(['delivered','rejected'].includes(x.info.st)) continue;const o=get(itemKey(x.l.desc,x.l.spec,x.l.unit),Object.assign({cat:x.l.category},x.l));o.dem+=Math.max(0,x.info.need-x.info.del);o.demN++}
  if(!site) for(const p of S.pos){if(p.status==='cancelled') continue;for(const l of p.lines||[]){const o=get(l.itemKey||itemKey(l.desc,l.spec,l.unit),l);if(!o.pos.includes(p.no)) o.pos.push(p.no)}}
  return Object.values(M)}
function vFind(){
  const q=norm(ui.f.fq);const site=ui.role==='site';const adm=isAdm();
  const cat=q?D.items.filter(i=>norm(i.desc+' '+(i.spec||'')+' '+(i.sizes||[]).join(' ')+' '+catName(i.category||i.cat)).includes(q)).slice(0,60):[];
  let rows=itemIndex();if(q) rows=rows.filter(o=>norm(o.desc+' '+o.spec+' '+o.unit+' '+catName(o.cat)).includes(q));
  rows.sort((a,b)=>String(a.desc).localeCompare(b.desc)||String(a.spec).localeCompare(b.spec));const shown=rows.slice(0,300);
  // the same item written in more than one way (different unit or spelling of the same words)
  const dupKey=o=>norm(o.desc).replace(/ /g,'')+'|'+norm(o.spec).replace(/ /g,'');const dup={};for(const o of itemIndex()){const k=dupKey(o);dup[k]=(dup[k]||0)+1}
  return `<div class="toolbar"><div class="search-inp grow">${icon('search')}<input class="inp" id="f-fq" placeholder="Type an item, size or category — e.g. DI pipe 150, sluice valve, cement" data-bind="f.fq" data-rerender="1" value="${esc(ui.f.fq||'')}"></div><span class="muted">${rows.length} item${rows.length===1?'':'s'}</span></div>
  ${adm?`<div class="notice info">${icon('edit')}<span>As administrator you can <b>edit</b> the spelling, specification, unit or <b>category</b> of an item (or tick several items and change their category together). The correction is made in every demand, quotation, PO, receipt, challan, stock and consumption entry, so its stock and history stay together. Correcting it to the name of an item that already exists merges the two. Units are relabelled, not converted.</span></div>`:''}
  <section class="card"><div class="card-h"><h2>${q?'Items found':'All items in use'}</h2><span class="sub">${site?'Your site stock and demands':'HQ store, site stores, open demands and purchase orders'}</span></div>
  ${adm&&shown.length?(()=>{ui.fiShown=shown.map(o=>o.key);const nsel=Object.keys(ui.sel.fi||{}).length;return `<div class="toolbar pad fi-bulk"><span class="small ${nsel?'':'muted'}">${nsel?`<b>${nsel}</b> item${nsel===1?'':'s'} ticked`:'Tick items to change their category together'}</span><select class="inp sm auto" id="f-fiCat" data-bind="f.fiCat"><option value="">New category…</option>${catOpts(ui.f.fiCat||'')}</select><button class="btn sm primary" data-act="fiBulkCat" ${nsel?'':'disabled'}>${icon('grid')} Change category</button></div>`})():''}
  ${shown.length?`<div class="tw"><table class="t"><thead><tr>${adm?`<th><input type="checkbox" data-act="fiSelAll" aria-label="Tick all" ${shown.length&&shown.every(o=>(ui.sel.fi||{})[o.key])?'checked':''}></th>`:''}<th>Item</th><th>Category</th><th>Unit</th>${site?'':'<th class="num">HQ store</th>'}<th>${site?'At your site':'At sites'}</th><th class="num">Open demand</th>${site?'':'<th>Purchase orders</th>'}${seeRates()&&!site?'<th class="num">Rate</th>':''}${adm?'<th></th>':''}</tr></thead><tbody>${shown.map(o=>`<tr>${adm?`<td><input type="checkbox" data-act="fiSel" data-k="${esc(o.key)}" aria-label="Tick ${esc(o.desc)}" ${(ui.sel.fi||{})[o.key]?'checked':''}></td>`:''}<td><div class="who">${thumb({category:o.cat,desc:o.desc},'sm')}<span><b>${esc(o.desc)}</b><small class="muted block">${esc(o.spec||'')}${dup[dupKey(o)]>1?(o.spec?' · ':'')+'<span class="t-amber">also written another way</span>':''}</small></span></div></td><td>${catSw(o.cat)}</td><td>${esc(o.unit)}</td>
    ${site?'':`<td class="num mono">${o.hq?fq(o.hq):'<span class="muted">—</span>'}</td>`}<td>${o.sites.length?`<div class="chips">${o.sites.map(([p,b])=>`<span class="chip plain" title="${esc(projLabel(p))}">${esc(projCode(p))}: ${fq(b)}</span>`).join('')}</div>`:'<span class="muted small">—</span>'}</td>
    <td class="num mono">${o.dem?fq(o.dem):'<span class="muted">—</span>'}${o.demN?`<small class="muted block">${o.demN} line${o.demN===1?'':'s'}</small>`:''}</td>${site?'':`<td class="small">${o.pos.length?esc(o.pos.slice(-3).join(', '))+(o.pos.length>3?' +'+(o.pos.length-3):''):'<span class="muted">—</span>'}</td>`}
    ${seeRates()&&!site?`<td class="num mono">${D.rateOf(o.key)?money(D.rateOf(o.key)):'—'}</td>`:''}${adm?`<td><button class="btn sm" data-act="itemFix" data-k="${esc(o.key)}">${icon('edit')} Edit</button></td>`:''}</tr>`).join('')}</tbody></table></div>${rows.length>shown.length?`<div class="card-f small muted">Showing the first ${shown.length}. Type more to narrow down.</div>`:''}`
  :`<div class="empty sm"><p>${q?'No item in stock, demands or orders matches “'+esc(ui.f.fq)+'”.':'No items in use yet.'}</p></div>`}</section>
  ${cat.length?`<section class="card"><div class="card-h"><h2>In the item catalogue</h2><span class="sub">What sites can pick when raising a demand</span></div><div class="tw"><table class="t"><thead><tr><th>Item</th><th>Category</th><th>Unit</th><th>Sizes</th>${adm?'<th></th>':''}</tr></thead><tbody>${cat.map(i=>`<tr><td><div class="who">${thumb({category:i.category||i.cat,desc:i.desc},'sm')}<span><b>${esc(i.desc)}</b><small class="muted block">${esc(i.spec||'')}</small></span></div></td><td>${esc(catName(i.category||i.cat))}</td><td>${esc(i.unit||'')}</td><td class="small">${esc((i.sizes||[]).join(', '))}</td>${adm?`<td><button class="btn sm" data-act="itemFix" data-cat="${esc(i.id)}">${icon('edit')} Edit</button></td>`:''}</tr>`).join('')}</tbody></table></div></section>`:''}`}

A.itemFix=d=>{let from;
  if(d.cat){const it=D.itemMap[d.cat];if(!it) return;from={desc:it.desc,spec:'',unit:it.unit||'Nos',cat:it.category||'others',catOnly:true,catId:it.id,dspec:it.spec||'',sizes:(it.sizes||[]).join(', ')}}
  else{const o=itemIndex().find(x=>x.key===d.k);if(!o) return;from={desc:o.desc,spec:o.spec||'',unit:o.unit,cat:o.cat||'others'}}
  const cid=from.catId||slug(from.desc);
  openModal({type:'itemFix',from,d:{desc:from.desc,spec:from.spec,unit:from.unit,dspec:from.dspec||'',sizes:from.sizes||'',category:CAT[from.cat]?from.cat:'others',alsoCat:!!D.itemMap[cid]},catId:cid,count:null});itemFixCount()};
async function itemFixCount(){const m=ui.modal;if(!m||m.type!=='itemFix') return;try{if(m.from.catOnly){let docs=0,lines=0;for(const o of itemIndex().filter(o=>norm(o.desc)===norm(m.from.desc))){const j=await api('/api/items/rename',{from:{desc:o.desc,spec:o.spec,unit:o.unit},to:{desc:o.desc,spec:o.spec,unit:o.unit},dry:true});docs+=j.docs;lines+=j.lines}if(ui.modal===m){m.count={docs,lines};render()}return}const j=await api('/api/items/rename',{from:m.from,to:{desc:m.from.desc,spec:m.from.spec,unit:m.from.unit},dry:true});if(ui.modal===m){m.count=j;render()}}catch(e){}}
function itemFixModal(m,busy){const d=m.d,f=m.from;const it=D.itemMap[m.catId];const units=UNITS.includes(d.unit)?UNITS:UNITS.concat([d.unit]);
  const named=d.desc.trim()!==f.desc||String(d.spec).trim()!==(f.spec||'')||d.unit!==f.unit;const catEdit=f.catOnly&&(String(d.dspec).trim()!==(f.dspec||'')||sizeList(d.sizes).join(', ')!==sizeList(f.sizes).join(', '));const catChg=d.category!==f.cat;const changed=named||catChg||catEdit;
  const toKey=itemKey(d.desc,d.spec,d.unit);const merge=named&&toKey!==itemKey(f.desc,f.spec,f.unit)&&itemIndex().some(o=>o.key===toKey);
  return wrap('Edit item',`<div class="notice">${icon('tag')}<span>Now: <b>${esc(f.desc)}</b>${f.spec?' — '+esc(f.spec):''} · ${esc(f.unit)} · ${esc(catName(f.cat))}${m.count?`<br><span class="small muted">Used in ${m.count.docs} record${m.count.docs===1?'':'s'} (${m.count.lines} line${m.count.lines===1?'':'s'}).</span>`:''}</span></div>
   <div class="fields">${field('Item name','modal.d.desc',d.desc,'data-rerender="1"','span2')}${f.catOnly?'':field('Specification / size','modal.d.spec',d.spec,'data-rerender="1"')}
   <div class="f"><label for="f-modal-d-unit">Unit</label><select class="inp" id="f-modal-d-unit" data-bind="modal.d.unit">${selOpts(units,d.unit)}</select></div>
   <div class="f"><label for="f-modal-d-category">Category</label><select class="inp" id="f-modal-d-category" data-bind="modal.d.category">${catOpts(d.category)}</select></div>
   ${f.catOnly?`${field('Default specification','modal.d.dspec',d.dspec,'data-rerender="1" placeholder="e.g. 50 kg bag, IS 1489"','span2')}<div class="f full"><label for="f-modal-d-sizes">Sizes sites can pick (separate with commas)</label><textarea class="inp" id="f-modal-d-sizes" data-bind="modal.d.sizes" data-rerender="1" rows="2" placeholder="e.g. 43 grade, 53 grade">${esc(d.sizes||'')}</textarea><small class="muted">This is the catalogue entry, shared by all its sizes. To correct the size or specification written in past demands and stock, edit that line under “Items found” above.</small></div>`:''}</div>
   ${catChg?`<div class="notice info">${icon('grid')}<span>The category changes from <b>${esc(catName(f.cat))}</b> to <b>${esc(catName(d.category))}</b> in every demand, order and stock entry of this item${f.catOnly?' (all its sizes)':''}. The procurement queue, vendor lists and reports follow the new category.</span></div>`:''}
   ${merge?`<div class="notice warn">${icon('alert')}<span>An item with this name, specification and unit already exists. The two will be <b>merged</b>: their stock and history are added together.</span></div>`:''}
   ${d.unit!==f.unit?`<div class="notice warn">${icon('alert')}<span>The unit is only relabelled from <b>${esc(f.unit)}</b> to <b>${esc(d.unit)}</b>; quantities are not converted. Use this to correct a wrongly chosen unit.</span></div>`:''}
   ${it&&!f.catOnly?`<label class="check"><input type="checkbox" id="f-modal-d-alsoCat" data-bind="modal.d.alsoCat" ${d.alsoCat?'checked':''}> Also change the item “${esc(it.desc)}” in the item catalogue</label>`:''}`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveItemFix" ${busy} ${changed?'':'disabled'}>${icon('check')} Save everywhere</button>`)}
A.saveItemFix=async()=>{const m=ui.modal,d=m.d,f=m.from;const catChg=d.category!==f.cat;
  const to={desc:d.desc.trim(),spec:f.catOnly?'':String(d.spec||'').trim(),unit:d.unit,cat:catChg?d.category:''};
  if(!to.desc){toast('Enter the item name.','err');return}
  const ok=await run(async()=>{let n=0;
    if(!f.catOnly){const j=await api('/api/items/rename',{from:{desc:f.desc,spec:f.spec,unit:f.unit},to});n=j.docs}
    else{for(const o of itemIndex().filter(o=>norm(o.desc)===norm(f.desc))){const j=await api('/api/items/rename',{from:{desc:o.desc,spec:o.spec,unit:o.unit},to:{desc:to.desc,spec:o.spec,unit:o.unit===f.unit?to.unit:o.unit,cat:to.cat}});n+=j.docs}}
    if(f.catOnly){to.spec=String(d.dspec||'').trim();to.sizes=sizeList(d.sizes)}
    if(f.catOnly||d.alsoCat) await fixCatalog(m.catId,to);
    return n});
  if(ok!==false){closeModal();toast(`Saved${ok?' in '+ok+' record'+(ok===1?'':'s'):''}.`)}};
async function fixCatalog(oldId,to){const it=D.itemMap[oldId];if(!it) return;const newId=slug(to.desc);
  const base={desc:to.desc,spec:to.spec!=null&&to.sizes?to.spec:(it.spec||''),unit:to.unit||it.unit,sizes:to.sizes||it.sizes||[],category:to.cat||it.category||it.cat,at:Date.now()};for(const k of ['photo','gst','hsn','hidden','kw']) if(it[k]!=null) base[k]=it[k];
  if(newId===oldId){await setDoc('catalog',oldId,base);return}
  if(!D.itemMap[newId]) await setDoc('catalog',newId,base);else if(to.cat) await setDoc('catalog',newId,Object.assign({},S.catalog[newId]||{desc:D.itemMap[newId].desc,unit:D.itemMap[newId].unit,sizes:D.itemMap[newId].sizes||[]},{category:to.cat,at:Date.now()}));
  if(STD[oldId]) await setDoc('catalog',oldId,{desc:'',replacedBy:newId,at:Date.now()});else await delDoc('catalog',oldId)}
// several items at once: Find items → tick items → Change category
A.fiSel=(d,el)=>{const s=ui.sel.fi||(ui.sel.fi={});if(el.checked) s[d.k]=1;else delete s[d.k];render()};
A.fiSelAll=(d,el)=>{const s=ui.sel.fi={};if(el.checked) for(const k of (ui.fiShown||[])) s[k]=1;render()};
A.fiBulkCat=async()=>{const cat=ui.f.fiCat;const keys=Object.keys(ui.sel.fi||{});if(!cat){toast('Choose the new category.','err');return}if(!keys.length) return;
  const rows=itemIndex().filter(o=>keys.includes(o.key));
  confirmBox({title:'Change category of '+rows.length+' item'+(rows.length===1?'':'s'),body:`<p>${rows.slice(0,12).map(o=>esc(o.desc+(o.spec?' '+o.spec:''))).join(', ')}${rows.length>12?'…':''}</p><p>New category: <b>${esc(catName(cat))}</b>. Every demand, order and stock entry of these items is changed${' '}and the catalogue items are moved too.</p>`,yes:'Change category',onYes:async()=>{
    const ok=await run(async()=>{let n=0;const done=new Set();for(const o of rows){const j=await api('/api/items/rename',{from:{desc:o.desc,spec:o.spec,unit:o.unit},to:{desc:o.desc,spec:o.spec,unit:o.unit,cat}});n+=j.docs;
      const cid=slug(o.desc);if(D.itemMap[cid]&&!done.has(cid)){done.add(cid);await fixCatalog(cid,{desc:D.itemMap[cid].desc,unit:D.itemMap[cid].unit,cat})}}return n});
    if(ok!==false){ui.sel.fi={};closeModal();toast(`Category changed to ${catName(cat)}${ok?' in '+ok+' record'+(ok===1?'':'s'):''}.`)}}})};

const sizeList=t=>String(t||'').split(',').map(x=>x.trim()).filter(Boolean);

/* ================= MODALS ================= */
function v6Modal(m,busy){switch(m.type){
  case 'stiApprove':return stiApproveModal(m,busy);
  case 'openStock':return openStockModal(m,busy);
  case 'consReport':return consModal(m,busy);
  case 'itemFix':return itemFixModal(m,busy);
}return ''}

/* ================= 5. ITEM SUGGESTIONS WHILE TYPING (demands) =================
   As the user types an item, every matching item in the database drops down below the box:
   catalogue items first, then items already used in demands, orders and stock (with their size
   and unit). If nothing matches exactly what was typed, "Create new item" is offered. */
function suggItems(q){const toks=norm(q).split(' ').filter(Boolean);if(!toks.length) return {list:[],exact:false};
  const hit=s=>{const n=' '+norm(s)+' ';return toks.every(t=>n.includes(' '+t)||n.includes(t))};
  const score=(desc,extra)=>{const nd=norm(desc);return (nd===norm(q)?0:nd.startsWith(norm(q))?1:toks.every(t=>(' '+nd).includes(' '+t))?2:3)+(extra||0)};
  const out=[];const seen=new Set();
  for(const it of D.items){if(it.hidden||!it.desc) continue;if(!hit(it.desc+' '+(it.spec||'')+' '+(it.sizes||[]).join(' ')+' '+catName(it.category))) continue;
    out.push({kind:'cat',id:it.id,desc:it.desc,spec:'',unit:it.unit||'Nos',cat:it.category||'others',sizes:it.sizes||[],note:it.spec||'',sc:score(it.desc)});seen.add(slug(it.desc)+'||')}
  const used={};const add=(l,src)=>{if(!l||!l.desc) return;const k=itemKey(l.desc,l.spec,l.unit);const o=used[k]||(used[k]={desc:l.desc,spec:l.spec||'',unit:l.unit||'Nos',cat:l.category||l.cat||classify(l.desc,l.spec).cat,n:0,src});o.n++};
  for(const i of S.indents) for(const l of i.lines||[]) add(l,'demands');
  for(const p of S.pos) for(const l of p.lines||[]) add(l,'orders');
  for(const g of S.grns) for(const l of g.lines||[]) add(l,'store');
  for(const e of S.sitelog) add(e,'site stock');
  for(const x of S.dispatches) for(const l of x.lines||[]) add(l,'dispatches');
  for(const k in used){const o=used[k];if(!hit(o.desc+' '+o.spec+' '+o.unit)) continue;out.push({kind:'used',key:k,desc:o.desc,spec:o.spec,unit:o.unit,cat:o.cat,n:o.n,src:o.src,sc:score(o.desc,.5)})}
  out.sort((a,b)=>a.sc-b.sc||(a.kind==='cat'?-1:0)-(b.kind==='cat'?-1:0)||String(a.desc).localeCompare(b.desc)||String(a.spec).localeCompare(b.spec));
  const exact=out.some(o=>norm(o.desc)===norm(q)||norm(o.desc+' '+o.spec)===norm(q));
  return {list:out.slice(0,40),exact}}
function suggPanel(q,where){q=String(q||'').trim();if(!q) return '';const {list,exact}=suggItems(q);const sel=ui.suggIx||0;
  const row=(o,i)=>`<button type="button" class="pop-n sugg ${i===sel?'on':''}" data-act="suggPick" data-i="${i}" data-w="${where}">${thumb({category:o.cat,desc:o.desc},'xs')}<span class="grow"><b>${esc(o.desc)}${o.spec?` <span class="sugg-spec">${esc(o.spec)}</span>`:''}</b><small>${esc(catName(o.cat))} · ${esc(o.unit)}${o.kind==='cat'?(o.sizes.length?' · sizes '+esc(o.sizes.slice(0,6).join(', '))+(o.sizes.length>6?'…':''):'')+' · catalogue':' · used before in '+esc(o.src)}</small></span></button>`;
  const create=!exact?`<button type="button" class="pop-n sugg create ${sel===list.length?'on':''}" data-act="suggPick" data-i="${list.length}" data-w="${where}"><span class="thumb xs plus">${icon('plus')}</span><span class="grow"><b>Create new item “${esc(q)}”</b><small>Not in the database — add it as a new item</small></span></button>`:'';
  return `<div class="pop wide sugg-pop" role="listbox">${list.length?`<div class="pop-t">${list.length} item${list.length===1?'':'s'} in the database</div>`+list.map(row).join(''):'<div class="pop-empty">No item in the database matches “'+esc(q)+'”.</div>'}${create}</div>`}
const popOf=w=>w==='modal'?'msugg':w==='line'?'lsugg':'pick';
const suggQuery=w=>w==='modal'||w==='line'?(ui.modal&&ui.modal.d&&ui.modal.d.desc)||'':ui.pickQ||'';
A.suggPick=d=>{if(document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.sugg) document.activeElement.blur();const w=d.w,q=suggQuery(w).trim();const {list}=suggItems(q);const o=list[+d.i];ui.pop=null;ui.suggIx=0;
  if(w==='line'){const m=ui.modal;if(o){Object.assign(m.d,{desc:o.desc,unit:o.unit||m.d.unit,category:o.cat||m.d.category});m.d.spec=o.kind==='used'?(o.spec||''):((D.itemMap[o.id]&&D.itemMap[o.id].spec)||'');m.sizes=o.kind==='cat'?(o.sizes||[]):[]}else{m.d.desc=q;m.sizes=[]}render();setTimeout(()=>{const el=document.getElementById('f-modal-d-spec');el&&el.focus()},30);return}
  const carry=w==='modal'&&ui.modal?ui.modal.d:{};
  if(!o){ // create new item
    if(w==='modal'){ui.modal.d.desc=q;ui.modal.d.newItem=true;render();setTimeout(()=>{const el=document.getElementById('f-modal-d-spec');el&&el.focus()},30);return}
    ui.pickQ='';A.customItem({desc:q});ui.modal.d.newItem=true;render();return}
  const it=o.kind==='cat'?D.itemMap[o.id]:(D.itemMap[slug(o.desc)]&&norm(D.itemMap[slug(o.desc)].desc)===norm(o.desc)?D.itemMap[slug(o.desc)]:{id:slug(o.desc),desc:o.desc,category:o.cat,unit:o.unit,sizes:[],spec:''});
  if(w!=='modal') ui.pickQ='';
  const sizes=it.sizes||[];let size='',spec=o.kind==='cat'?(it.spec||''):'';
  if(o.kind==='used'&&o.spec){if(sizes.includes(o.spec)) size=o.spec;else spec=o.spec}
  if(ui.view!=='s_new'&&w!=='modal') go('s_new');
  openModal({type:'addItem',item:it,d:{size,otherSize:'',qty:carry.qty||'',unit:o.unit||it.unit||'Nos',spec,note:carry.note||'',photo:carry.photo||''}})};
// arrow keys and Enter in the item box
document.addEventListener('keydown',e=>{const el=e.target;if(!el||!el.dataset||!el.dataset.sugg) return;
  if(el.dataset.sugg==='pick'&&ui.modal) return;
  if(e.key==='Escape'&&(ui.pop==='pick'||ui.pop==='msugg'||ui.pop==='lsugg')){e.preventDefault();e.stopPropagation();ui.pop=null;render();return}const w=el.dataset.sugg;const q=suggQuery(w).trim();if(!q) return;
  const {list,exact}=suggItems(q);const max=list.length+(exact?0:1)-1;if(max<0) return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();ui.pop=popOf(w);ui.suggIx=Math.max(0,Math.min(max,(ui.suggIx||0)+(e.key==='ArrowDown'?1:-1)));render();
    setTimeout(()=>{const on=document.querySelector('.sugg-pop .sugg.on');on&&on.scrollIntoView({block:'nearest'})},0)}
  else if(e.key==='Enter'&&ui.pop===popOf(w)){e.preventDefault();e.stopPropagation();A.suggPick({w,i:String(Math.min(ui.suggIx||0,max))})}
},true);
document.addEventListener('input',e=>{const el=e.target;if(el&&el.dataset&&el.dataset.sugg){ui.suggIx=0;if(el.dataset.sugg==='modal'&&ui.modal&&ui.modal.d) ui.modal.d.newItem=false;ui.pop=popOf(el.dataset.sugg);schedule()}});

// a new item created by someone who keeps the item catalogue goes straight into the catalogue
{const add=A.addCustom;A.addCustom=async()=>{const d=ui.modal&&ui.modal.d;const nw=d&&d.newItem&&ui.role==='hq'&&!ui.preview&&can('masters_items')&&String(d.desc||'').trim()&&num(d.qty)>0&&!D.itemMap[slug(d.desc)];
  const x=nw?{desc:d.desc.trim(),unit:d.unit,cat:d.category}:null;add();if(x&&!ui.modal){try{await setDoc('catalog',slug(x.desc),{desc:x.desc,spec:'',unit:x.unit,sizes:[],category:x.cat,at:Date.now()})}catch(e){}}}}

// Item catalogue → edit item: when an administrator changes the category, the demands, orders and
// stock entries of that item follow (on request).
{const save=A.saveItem;A.saveItem=async(...a)=>{const m=ui.modal;const it=m&&m.id?D.itemMap[m.id]:null;const old=it&&(it.category||'others');const nw=m&&m.d&&m.d.category;
  await save(...a);
  if(!it||!isAdm()||!nw||old===nw||(ui.modal&&ui.modal===m)) return;
  const rows=itemIndex().filter(o=>norm(o.desc)===norm(it.desc)&&o.cat!==nw);if(!rows.length) return;
  confirmBox({title:'Also change past records?',body:`<p><b>${esc(it.desc)}</b> is now in <b>${esc(catName(nw))}</b>. ${rows.length} size${rows.length===1?'':'s'} of it in demands, orders or stock still show <b>${esc(catName(old))}</b>.</p><p>Change them too, so the procurement queue, vendors and reports use the new category?</p>`,yes:'Change them too',onYes:async()=>{
    const ok=await run(async()=>{let n=0;for(const o of rows){const j=await api('/api/items/rename',{from:{desc:o.desc,spec:o.spec,unit:o.unit},to:{desc:o.desc,spec:o.spec,unit:o.unit,cat:nw}});n+=j.docs}return n});
    if(ok!==false){closeModal();toast(`Category changed in ${ok} record${ok===1?'':'s'}.`)}}})}}


/* ================= 6. APPROVER CHANGES THE ITEM WHILE APPROVING =================
   e.g. the site asked for Cement OPC, the approver changes it to Cement PPC. The site's original
   request is kept on the line and shown to the site with who changed it and why (the server stamps it). */
Object.assign(ACT_PERM,{lineItem:'demands_approve',saveLineItem:'demands_approve'});
const lineEditable=l=>!l.rfqId&&!l.poId&&!l.transferId&&!l.fromStock&&!l.pcRemoved&&l.status!=='rejected';
A.lineItem=d=>{const i=S.indents.find(x=>x.id===d.ind);const l=i&&(i.lines||[]).find(x=>x.id===d.line);if(!l) return;
  if(!lineEditable(l)){toast('This line is already being sourced (RFQ, PO, store or transfer). Change it there.','err');return}
  const it=D.itemMap[slug(l.desc)];
  openModal({type:'lineItem',ind:i.id,line:l.id,sizes:it&&norm(it.desc)===norm(l.desc)?(it.sizes||[]):[],d:{desc:l.desc,spec:l.spec||'',unit:l.unit,category:l.category||'others',qty:String(ui.draft.aq&&ui.draft.aq[l.id]!=null?ui.draft.aq[l.id]:(l.approvedQty??l.qty)),note:'',approve:true}})};
function lineItemModal(m,busy){const i=S.indents.find(x=>x.id===m.ind);const l=i&&(i.lines||[]).find(x=>x.id===m.line);if(!l) return '';const d=m.d;const was=l.apprOrig||l;
  const units=UNITS.includes(d.unit)?UNITS:UNITS.concat([d.unit]);
  const changed=d.desc.trim()!==l.desc||String(d.spec).trim()!==(l.spec||'')||d.unit!==l.unit||d.category!==(l.category||'others');
  return wrap('Change item · '+esc(i.no),`<div class="notice">${icon('inbox')}<span>Site asked for: <b>${esc(was.desc)}</b>${was.spec?' — '+esc(was.spec):''} · ${fq(was.qty)} ${esc(was.unit)}${l.siteNote?`<br><span class="small muted">Site note: ${esc(l.siteNote)}</span>`:''}</span></div>
   <div class="fields"><div class="f span2 pop-wrap sugg-wrap"><label for="f-modal-d-desc">Item to supply</label>${inp('modal.d.desc',d.desc,'data-sugg="line" data-focus-pop="lsugg" data-rerender="1" autocomplete="off" role="combobox" placeholder="Start typing — e.g. Cement PPC"')}${ui.pop==='lsugg'?suggPanel(d.desc,'line'):''}</div>
   ${(m.sizes||[]).length?`<div class="f full"><label>Size</label><div class="size-chips">${m.sizes.map(z=>`<button type="button" class="schip ${d.spec===z?'on':''}" data-act="mset" data-k="spec" data-val="${esc(z)}">${esc(z)}</button>`).join('')}</div></div>`:''}
   ${field('Size / specification','modal.d.spec',d.spec,'data-rerender="1" placeholder="e.g. 53 grade, 50 kg bag"')}
   <div class="f"><label for="f-modal-d-unit">Unit</label><select class="inp" id="f-modal-d-unit" data-bind="modal.d.unit">${selOpts(units,d.unit)}</select></div>
   <div class="f"><label for="f-modal-d-category">Category</label><select class="inp" id="f-modal-d-category" data-bind="modal.d.category">${catOpts(d.category)}</select></div>
   <div class="f"><label for="f-modal-d-qty">Quantity to approve</label>${stepperInp('modal.d.qty',d.qty)}</div></div>
   <div class="f full"><label for="f-modal-d-note">Reason for the change (shown to the site)</label><textarea class="inp" id="f-modal-d-note" data-bind="modal.d.note" rows="2" placeholder="e.g. PPC is specified for this work as per approved mix design">${esc(d.note||'')}</textarea></div>
   <label class="check"><input type="checkbox" id="f-modal-d-approve" data-bind="modal.d.approve" ${d.approve?'checked':''}> Approve the line with this change</label>`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveLineItem" ${busy} ${changed?'':'disabled'}>${icon('check')} ${d.approve?'Change &amp; approve':'Change item'}</button>`,'wide')}
A.saveLineItem=async()=>{const m=ui.modal,d=m.d;const desc=String(d.desc||'').trim();if(!desc){toast('Enter the item.','err');return}
  const note=String(d.note||'').trim();if(!note){toast('Write the reason for the change, so the site knows why.','err');document.getElementById('f-modal-d-note')?.focus();return}
  const q=num(d.qty);if(d.approve&&!(q>0)){toast('Enter the quantity to approve.','err');return}
  const ok=await run(()=>patchLines(m.ind,ls=>{const l=ls.find(x=>x.id===m.line);if(!l) return;
    Object.assign(l,{desc,spec:String(d.spec||'').trim(),unit:d.unit,category:d.category,catSrc:'manual',chgNote:note});
    if(d.approve){l.status='approved';l.approvedQty=q;l.approvedAt=Date.now();l.approvalNote=note}}),d.approve?'Item changed and approved':'Item changed');
  if(ok!==false){if(ui.draft.aq) delete ui.draft.aq[m.line];closeModal()}};
// note on the line: what the site asked for and who changed it
function apprChangeNote(l,site){const o=l.apprOrig;if(!o) return '';
  return `<small class="pc-orig">${icon('edit','xs')} ${site?'You asked':'Site asked'}: ${esc(o.desc)}${o.spec?' '+esc(o.spec):''} · ${fq(o.qty)} ${esc(o.unit)} — changed to ${esc(l.desc)}${l.spec?' '+esc(l.spec):''} by ${esc(l.chgByName||'HQ')}${l.chgAt?' on '+fdt(l.chgAt):''}${l.chgNote?': “'+esc(l.chgNote)+'”':''}</small>`}
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='lineItem'?lineItemModal(m,busy):prev(m,busy)}

/* ================= 7. PROCUREMENT QUEUE: BY REQUISITION, VENDORS ITEM BY ITEM ================= */
Object.assign(ACT_PERM,{selAllQueue:'rfq_create',selMr:'rfq_create',rfqForMr:'rfq_create',rfqMode:'rfq_create',rfqLineVend:'rfq_create',rfqLineAddVend:'rfq_create',createRfqs:'rfq_create',
  sendBack:['demands_approve','demands_precheck'],lineDelete:'demands_approve'});
A.selAllQueue=()=>{const L=queueLines();const all=L.every(x=>ui.sel[x.k]);for(const x of L) ui.sel[x.k]=!all;render()};
A.selMr=d=>{const g=queueLines().filter(x=>x.ind.id===d.id);const all=g.every(x=>ui.sel[x.k]);for(const x of g) ui.sel[x.k]=!all;render()};
A.rfqForMr=d=>{ui.sel={};for(const x of queueLines()) if(x.ind.id===d.id) ui.sel[x.k]=true;A.newRfq()};
{const open=A.newRfq;A.newRfq=()=>{open();const m=ui.modal;if(!m||m.type!=='newRfq') return;m.d.mode='same';
  for(const l of m.d.lines) l.vids=S.vendors.filter(v=>(v.categories||[]).includes(l.cat)).map(v=>v.id);render()}}
A.rfqMode=d=>{ui.modal.d.mode=d.val;render()};
A.rfqLineVend=(d,el)=>{const l=ui.modal.d.lines.find(x=>x.key===d.key);if(!l) return;const s=new Set(l.vids||[]);el.checked?s.add(d.v):s.delete(d.v);l.vids=[...s];render()};
CH.rfqLineAddVend=el=>{const l=ui.modal.d.lines.find(x=>x.key===el.dataset.key);if(!l||!el.value) return;l.vids=[...new Set([...(l.vids||[]),el.value])];render()};
A.createRfqs=async()=>{const m=ui.modal.d;const groups={};
  for(const l of m.lines){if(!(l.vids||[]).length){toast('Choose at least one vendor for '+l.desc+'.','err');return}const k=l.vids.slice().sort().join(',');(groups[k]=groups[k]||[]).push(l)}
  const made=await run(async()=>{const out=[];for(const [k,ls] of Object.entries(groups)){const lines=ls.map((l,i)=>{const c=Object.assign({},l,{key:'L'+(i+1)});delete c.vids;return c});
    out.push(await createRfq({lines,vendorIds:k.split(','),dueDate:m.dueDate,deliveryMode:m.deliveryMode,notes:m.notes}))}return out});
  if(made){ui.sel={};closeModal();toast(made.map(r=>r.no).join(', ')+' created. Now send '+(made.length===1?'it':'them')+' to the vendors.');if(made.length===1) go('rfq',made[0].id);else{ui.f.rs='open';go('rfqs')}}};

/* ================= 8. DEMAND SENT BACK TO THE RAISER FOR AMENDMENT ================= */
const amendOk=i=>!i.cancelled&&!amendIsOpen(i)&&!(i.lines||[]).some(l=>l.status==='approved'||l.rfqId||l.poId||l.transferId||l.fromStock);
function sendBackBtn(i,siteMode){if(siteMode||ui.role!=='hq'||!(can('demands_approve')||can('demands_precheck'))||!amendOk(i)) return '';
  return `<button class="btn" data-act="sendBack" data-id="${i.id}" title="Return the demand to the person who raised it, to add or remove items or change quantities">${icon('back')} Send back to site</button>`}
function amendCanEdit(i,siteMode){if(!amendIsOpen(i)) return false;return siteMode?ui.role==='site'&&!ui.preview:(ui.role==='hq'&&i.createdBy===ui.uid)}
const amendWho=st=>st==='pre-check'?'the pre-checker':'the approver';
function amendBanner(i,siteMode){const a=i.amend;if(!a) return '';
  if(a.status==='open') return `<div class="notice err">${icon('back')}<span><b>Sent back ${siteMode?'to you ':'to the site '}for amendment by ${amendWho(a.stage)}</b> — ${esc(a.byName||'HQ')}, ${fdt(a.at)}: “${esc(a.note||'')}”${siteMode?`<br>Add the items that are missing, remove items or change quantities below, then send it again. It goes back to ${amendWho(a.stage)}.`:`<br>Nothing in it can be approved until the site sends it again. It then comes back to ${amendWho(a.stage)}.`}</span></div>`;
  if(a.status==='resubmitted') return `<p class="ro-note">${icon('check','xs')} <span><b>Amended and sent again</b> by ${esc(a.byName||'')} on ${fdt(a.at)}${a.note?': “'+esc(a.note)+'”':''} (it was sent back by ${amendWho(a.sentBackStage)}, ${esc(a.sentBackBy||'HQ')}: “${esc(a.sentBackNote||'')}”). It is now with ${amendWho(a.sentBackStage)} again.</span></p>`;
  return ''}
function amendLogCard(i){const lg=i.amendLog||[];if(!lg.length) return '';
  return `<section class="card"><div class="card-h"><h2>Sent back and amended</h2><span class="sub">${lg.length} entr${lg.length===1?'y':'ies'}</span></div><div class="list">${lg.slice().reverse().map(e=>`<div class="li"><span class="n-ic ${e.type==='sent back'?'red':'green'}">${icon(e.type==='sent back'?'back':'edit')}</span><div class="grow"><b>${e.type==='sent back'?'Sent back by '+amendWho(e.stage)+' — ':'Amended by '}${esc(e.by||'')}</b> <small class="muted">${fdt(e.at)}</small>${e.note?`<p class="rm-t">${esc(e.note)}</p>`:''}${e.added?`<small class="block t-green">Added: ${esc(e.added)}</small>`:''}${e.removed?`<small class="block t-red">Removed: ${esc(e.removed)}</small>`:''}${e.changed?`<small class="block">Changed: ${esc(e.changed)}</small>`:''}</div></div>`).join('')}</div></section>`}
A.sendBack=d=>{const i=S.indents.find(x=>x.id===d.id);if(!i) return;confirmBox({title:'Send '+i.no+' back to the site',body:`<p>The demand goes back to <b>${esc(i.requestedBy||i.createdByName||'the person who raised it')}</b> at ${esc(projName(i.projectId))}. They can add items, remove items or change quantities and then send it again; it then comes back to ${pcPending(i)?'pre-check':'you as approver'}. Nothing in it can be approved meanwhile.</p>`,noteArea:true,note:'What should be changed (required — the site sees this)',notePh:'e.g. Add 20 nos DI collars 150 mm for the same stretch; reduce cement to 200 bags',yes:'Send back',
  onYes:async m=>{const n=String(m.noteVal||'').trim();if(!n){toast('Write what the site should change.','err');return}if(await run(()=>updDoc('indents',i.id,{amend:{status:'open',note:n}}),i.no+' sent back to the site')!==false){closeModal();go(ui.view==='indent'?'demands':ui.view)}}})};
function amendDraft(i){const dd=ui.draft.am||(ui.draft.am={});return dd[i.id]||(dd[i.id]={note:'',remarks:i.remarks||'',lines:(i.lines||[]).filter(l=>!l.pcRemoved).map(l=>({id:l.id,desc:l.desc,spec:l.spec||'',unit:l.unit,qty:String(l.qty),category:l.category||'others',siteNote:l.siteNote||'',removed:false,rejected:l.status==='rejected'}))})}
function amendEditor(i){const d=amendDraft(i);const n=d.lines.filter(l=>!l.removed).length;
  return `<section class="card amend-ed"><div class="card-h"><h2>Amend the demand</h2><span class="sub">${n} item${n===1?'':'s'}</span><div class="acts"><button class="btn sm primary" data-act="amendAdd" data-id="${i.id}">${icon('plus')} Add item</button></div></div>
  <div class="am-lines">${d.lines.map((l,ix)=>`<div class="am-line ${l.removed?'struck':''}"><div class="who">${lineThumb(l,'xs')}<span><b>${esc(l.desc)}</b>${l.id?'':' <span class="chip green plain">new</span>'}${l.rejected?' <span class="chip red plain">rejected by HQ</span>':''}</span></div>
    <div class="am-f">${l.removed?`<span class="small">${fq(l.qty)} ${esc(l.unit)} ${esc(l.spec)} — will be removed</span>`:`<label class="am-q"><span>Qty</span>${inp('draft.am.'+i.id+'.lines.'+ix+'.qty',l.qty,'inputmode="decimal"')}</label>
    <label><span>Unit</span><select class="inp sm" id="${fid('draft.am.'+i.id+'.lines.'+ix+'.unit')}" data-bind="draft.am.${i.id}.lines.${ix}.unit">${selOpts(UNITS.includes(l.unit)?UNITS:UNITS.concat([l.unit]),l.unit)}</select></label>
    <label class="am-s"><span>Size / specification</span>${inp('draft.am.'+i.id+'.lines.'+ix+'.spec',l.spec,'placeholder="Size"')}</label>`}
    <button class="btn sm ${l.removed?'':'ghost'}" data-act="amendRm" data-id="${i.id}" data-ix="${ix}">${l.removed?'Keep':icon('trash')+' Remove'}</button></div></div>`).join('')}</div>
  <div class="card-b"><div class="f full"><label for="${fid('draft.am.'+i.id+'.note')}">Note for HQ about the changes</label><textarea class="inp" id="${fid('draft.am.'+i.id+'.note')}" data-bind="draft.am.${i.id}.note" rows="2" placeholder="e.g. Collars added as asked; cement reduced to 200 bags">${esc(d.note||'')}</textarea></div>
  <div class="row end"><button class="btn" data-act="amendReset" data-id="${i.id}">Undo changes</button><button class="btn orange" data-act="amendSend" data-id="${i.id}" ${ui.busy?'disabled':''}>${icon('ul')} Send amended demand to HQ</button></div></div></section>`}
A.amendRm=d=>{const l=amendDraft(S.indents.find(x=>x.id===d.id)).lines[+d.ix];if(!l) return;if(!l.id){amendDraft(S.indents.find(x=>x.id===d.id)).lines.splice(+d.ix,1)}else l.removed=!l.removed;render()};
A.amendReset=d=>{delete ui.draft.am[d.id];render()};
A.amendAdd=d=>openModal({type:'amendAdd',ind:d.id,sizes:[],d:{desc:'',spec:'',unit:'Nos',category:'others',qty:'',siteNote:''}});
function amendAddModal(m,busy){const d=m.d;const units=UNITS.includes(d.unit)?UNITS:UNITS.concat([d.unit]);
  return wrap('Add item to the demand',`<div class="fields"><div class="f span2 pop-wrap sugg-wrap"><label for="f-modal-d-desc">Item</label>${inp('modal.d.desc',d.desc,'data-sugg="line" data-focus-pop="lsugg" data-rerender="1" autocomplete="off" role="combobox" placeholder="Start typing — e.g. DI collar"')}${ui.pop==='lsugg'?suggPanel(d.desc,'line'):''}</div>
   ${(m.sizes||[]).length?`<div class="f full"><label>Size</label><div class="size-chips">${m.sizes.map(z=>`<button type="button" class="schip ${d.spec===z?'on':''}" data-act="mset" data-k="spec" data-val="${esc(z)}">${esc(z)}</button>`).join('')}</div></div>`:''}
   ${field('Size / specification','modal.d.spec',d.spec)}<div class="f"><label for="f-modal-d-unit">Unit</label><select class="inp" id="f-modal-d-unit" data-bind="modal.d.unit">${selOpts(units,d.unit)}</select></div>
   <div class="f"><label for="f-modal-d-category">Category</label><select class="inp" id="f-modal-d-category" data-bind="modal.d.category">${catOpts(d.category)}</select></div><div class="f"><label for="f-modal-d-qty">Quantity</label>${stepperInp('modal.d.qty',d.qty)}</div>
   ${field('Note for HQ (optional)','modal.d.siteNote',d.siteNote,'','full')}</div>`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn orange" data-act="saveAmendAdd" ${busy}>${icon('plus')} Add</button>`,'wide')}
A.saveAmendAdd=()=>{const m=ui.modal,d=m.d;if(!String(d.desc).trim()){toast('Enter the item.','err');return}if(!(num(d.qty)>0)){toast('Enter the quantity.','err');return}
  const i=S.indents.find(x=>x.id===m.ind);amendDraft(i).lines.push({id:'',desc:d.desc.trim(),spec:String(d.spec||'').trim(),unit:d.unit,qty:String(num(d.qty)),category:d.category,siteNote:d.siteNote||'',removed:false});closeModal();toast('Added '+d.desc.trim()+'. Send the amended demand when you are done.')};
A.amendSend=async d=>{const i=S.indents.find(x=>x.id===d.id);if(!i) return;const dr=amendDraft(i);
  const keep=dr.lines.filter(l=>!l.removed);if(!keep.length){toast('Keep at least one item, or ask HQ to cancel the demand.','err');return}
  for(const l of keep) if(!(num(l.qty)>0)){toast('Enter the quantity for '+l.desc+'.','err');return}
  const lines=keep.map(l=>l.id?{id:l.id,desc:l.desc,spec:String(l.spec||'').trim(),unit:l.unit,qty:num(l.qty),siteNote:l.siteNote}:{desc:l.desc,spec:l.spec,unit:l.unit,qty:num(l.qty),category:l.category,catSrc:'manual',siteNote:l.siteNote});
  if(await run(()=>updDoc('indents',i.id,{lines,amend:{status:'resubmitted',note:String(dr.note||'').trim()}}),'Amended demand sent to HQ')!==false){delete ui.draft.am[i.id];render()}};
A.lineDelete=d=>{const i=S.indents.find(x=>x.id===d.ind);const l=i&&(i.lines||[]).find(x=>x.id===d.line);if(!l) return;
  confirmBox({title:'Delete '+l.desc+' from '+i.no+'?',body:'<p>The item is taken out of the demand and will not be bought. The site sees that you deleted it and why.</p>',noteArea:true,note:'Reason (required)',yes:'Delete item',danger:true,
  onYes:async m=>{const r=String(m.noteVal||'').trim();if(!r){toast('Write the reason.','err');return}
    if(await run(()=>patchLines(i.id,ls=>{const x=ls.find(y=>y.id===l.id);if(!x) return;x.status='rejected';x.approvalNote=r;x.deletedBy=(ui.me&&ui.me.name)||'HQ'}),'Item deleted from the demand')!==false) closeModal()}})};
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='amendAdd'?amendAddModal(m,busy):prev(m,busy)}

/* ================= 9. RETURN TO VENDOR =================
   Material already received (HQ store or a site) going back to the vendor: rejected, wrong
   specification, damaged, excess… Stock goes down at once. "Vendor will replace" makes the quantity
   due again on the purchase order; otherwise the return note works as a debit note. */
const VRET_REASON={rejected:'Rejected on inspection / quality',spec:'Specification mismatch',damaged:'Damaged / defective',wrong:'Wrong item supplied',excess:'Excess / not ordered',other:'Other reason'};
Object.assign(ACT_PERM,{vretNew:['store','sitestock_edit','po_issue'],saveVret:['store','sitestock_edit','po_issue'],vretCancel:'store'});
const vretVal=v=>sum(v.lines||[],l=>num(l.qty)*num(l.rate)*(1+num(l.gst)/100));
function vretAvail(from,k){if(from==='hq'){const L=storeLedger();return L[k]?Math.max(0,L[k].bal):0}const r=(D.site[from]||{})[k];return r?Math.max(0,r.bal-(r.pcons||0)):0}
function vretPoLines(po,from){const out=[];for(const l of po.lines||[]){const k=l.itemKey||itemKey(l.desc,l.spec,l.unit);const got=poRecv(po,l.key);if(!(got>0)) continue;
  out.push({k,poKey:l.key,desc:l.desc,spec:l.spec||'',unit:l.unit,cat:l.cat||'others',rate:l.rate,gst:l.gst,avail:Math.min(got,vretAvail(from,k)),qty:''})}return out}
function vretStockLines(from){const rows=from==='hq'?Object.values(storeLedger()).filter(r=>r.bal>1e-9):Object.values(D.site[from]||{}).filter(r=>r.bal-(r.pcons||0)>1e-9);
  return rows.sort((a,b)=>String(a.desc).localeCompare(b.desc)).map(r=>({k:r.itemKey,poKey:'',desc:r.desc,spec:r.spec||'',unit:r.unit,cat:r.cat||'others',rate:D.rateOf(r.itemKey)?Math.round(D.rateOf(r.itemKey)*100)/100:'',gst:D.rateOf(r.itemKey)?0:'',avail:vretAvail(from,r.itemKey),qty:''}))} // stock rate already includes GST
A.vretNew=d=>{let from=d.p||(ui.role==='site'?siteProject():'hq');let poId='',vendorId='',vendorName='',dispId='';
  if(d.po){const po=S.pos.find(p=>p.id===d.po);if(!po) return;poId=po.id;vendorId=po.vendorId;vendorName=po.vendorName;if(po.deliveryMode==='site'){const ds=S.dispatches.find(x=>x.poId===po.id&&['delivered','short'].includes(x.status));from=ds?ds.projectId:from==='hq'?'':from}else from='hq'}
  const m={type:'vret',d:{from,vendorId,vendorName,poId,dispId,date:today(),reason:'rejected',replace:true,remarks:'',vehicle:'',lrNo:'',photos:[],lines:[]}};
  ui.modal=m;vretLoad();openModal(m)};
function vretLoad(){const m=ui.modal,d=m.d;if(!d.from){d.lines=[];return}
  if(d.dispId){const x=S.dispatches.find(y=>y.id===d.dispId);d.poId=x&&x.poId||'';d.vendorName=x&&x.vendorName||'';const po=d.poId&&S.pos.find(p=>p.id===d.poId);
    d.lines=(x&&x.lines||[]).filter(l=>num(l.recvQty)>0).map(l=>{const k=l.itemKey||itemKey(l.desc,l.spec,l.unit);const pl=po&&(po.lines||[]).find(z=>z.key===l.poKey);return {k,poKey:l.poKey||'',desc:l.desc,spec:l.spec||'',unit:l.unit,cat:l.cat||'others',rate:pl?pl.rate:'',gst:pl?pl.gst:'',avail:Math.min(num(l.recvQty),vretAvail(d.from,k)),qty:''}});return}
  const po=d.poId&&S.pos.find(p=>p.id===d.poId);d.lines=po?vretPoLines(po,d.from):vretStockLines(d.from)}
CH.vretFrom=el=>{const d=ui.modal.d;d.from=el.value;d.poId='';d.dispId='';vretLoad();render()};
CH.vretVendor=el=>{const d=ui.modal.d;d.vendorId=el.value;const v=vend(el.value);d.vendorName=v?v.name:'';d.poId='';vretLoad();render()};
CH.vretPo=el=>{const d=ui.modal.d;d.poId=el.value;const po=S.pos.find(p=>p.id===el.value);if(po){d.vendorId=po.vendorId;d.vendorName=po.vendorName}vretLoad();render()};
CH.vretDisp=el=>{const d=ui.modal.d;d.dispId=el.value;if(!el.value){d.poId='';d.vendorName=''}vretLoad();render()};
A.vretReason=d=>{ui.modal.d.reason=d.val;render()};A.vretRepl=d=>{ui.modal.d.replace=d.val==='1';render()};
function vretModal(m,busy){const d=m.d;const hq=ui.role==='hq';const site=d.from&&d.from!=='hq';
  const pos=hq&&d.vendorId?S.pos.filter(p=>p.vendorId===d.vendorId&&p.status!=='cancelled'&&(p.lines||[]).some(l=>poRecv(p,l.key)>0)):[];
  const disps=site?S.dispatches.filter(x=>x.projectId===d.from&&x.type==='direct'&&['delivered','short'].includes(x.status)).sort((a,b)=>(b.receivedAt||0)-(a.receivedAt||0)):[];
  const vals=hq&&seeRates();const tot=sum(d.lines,l=>num(l.qty)*num(l.rate)*(1+num(l.gst)/100));
  return wrap('Return material to vendor',`<div class="fields">
   ${hq?`<div class="f"><label for="f-vret-from">Returned from</label><select class="inp" id="f-vret-from" data-act-change="vretFrom"><option value="hq" ${d.from==='hq'?'selected':''}>HQ store</option>${S.projects.filter(p=>p.active!==false).map(p=>`<option value="${p.id}" ${d.from===p.id?'selected':''}>Site · ${esc(p.name)}</option>`).join('')}</select></div>
   <div class="f"><label for="f-vret-vendor">Vendor</label><select class="inp" id="f-vret-vendor" data-act-change="vretVendor"><option value="">Choose vendor…</option>${S.vendors.slice().sort((a,b)=>String(a.name).localeCompare(b.name)).map(v=>`<option value="${v.id}" ${d.vendorId===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></div>
   <div class="f"><label for="f-vret-po">Against purchase order</label><select class="inp" id="f-vret-po" data-act-change="vretPo"><option value="">— not against a PO —</option>${pos.map(p=>`<option value="${p.id}" ${d.poId===p.id?'selected':''}>${esc(p.no)} · ${fd(p.date)}</option>`).join('')}</select></div>`
   :`<div class="f span2"><label for="f-vret-disp">Material received from</label><select class="inp" id="f-vret-disp" data-act-change="vretDisp"><option value="">Other / not listed</option>${disps.map(x=>`<option value="${x.id}" ${d.dispId===x.id?'selected':''}>${esc(x.vendorName||'Vendor')} · ${esc(x.no)}${x.poNo?' · '+esc(x.poNo):''} · ${fd(x.receivedOn||msDate(x.receivedAt||x.at))}</option>`).join('')}</select></div>
   ${d.dispId?'':field('Vendor name','modal.d.vendorName',d.vendorName,'placeholder="Name of the supplier"')}`}
   ${field('Date of return','modal.d.date',d.date,'type="date"')}</div>
   <div class="f full"><label>Reason</label><div class="size-chips">${Object.entries(VRET_REASON).map(([k,l])=>`<button type="button" class="schip ${d.reason===k?'on':''}" data-act="vretReason" data-val="${k}">${esc(l)}</button>`).join('')}</div></div>
   ${d.poId?`<div class="f full"><label>What happens next</label>${seg('vretrepl',[['1','Vendor will replace — quantity becomes due again on the PO'],['0','No replacement — debit note']],d.replace?'1':'0','vretRepl')}</div>`:''}
   ${d.lines.length?`<div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Can return</th><th class="num">Qty to return</th>${vals?'<th class="num">Value incl. GST</th>':''}</tr></thead><tbody>${d.lines.map((l,i)=>`<tr><td><div class="who">${lineThumb(l,'xs')}<span><b>${esc(l.desc)}</b><small class="muted block">${esc(l.spec||'')}</small></span></div></td><td class="num mono">${fq(l.avail)} ${esc(l.unit)}</td><td>${inp('modal.d.lines.'+i+'.qty',l.qty,`inputmode="decimal" style="width:100px" data-rerender="1" ${l.avail>0?'':'disabled'}`)}</td>${vals?`<td class="num mono">${l.rate!==''&&num(l.qty)?money(num(l.qty)*num(l.rate)*(1+num(l.gst)/100)):'—'}</td>`:''}</tr>`).join('')}</tbody></table></div>${vals&&tot?`<p class="row end"><b>Value of material returned: ${money(tot)}</b></p>`:''}`
   :`<div class="notice">${icon('help')}<span>${hq&&!d.vendorId?'Choose the vendor (and the PO, if any).':'No stock here to return.'}</span></div>`}
   <div class="fields">${field('Vehicle no.','modal.d.vehicle',d.vehicle)}${field('LR / e-way bill','modal.d.lrNo',d.lrNo)}</div>
   <div class="f full"><label for="f-modal-d-remarks">Details of the problem (printed on the return note)</label><textarea class="inp" id="f-modal-d-remarks" data-bind="modal.d.remarks" rows="2" placeholder="e.g. 6 lengths found cracked at the spigot end; test certificate does not match IS 8329">${esc(d.remarks||'')}</textarea></div>
   <div class="f full"><label>Photos / inspection report (optional)</label>${photoPicker('modal.d.photos',d.photos,{doc:true})}</div>`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveVret" ${busy}>${icon('back')} Save return &amp; print note</button>`,'wide')}
A.saveVret=async()=>{const m=ui.modal,d=m.d;if(!d.from){toast('Choose where the material is returned from.','err');return}
  const vname=String(d.vendorName||'').trim();if(!vname){toast('Choose the vendor.','err');return}
  const lines=d.lines.filter(l=>num(l.qty)>0);if(!lines.length){toast('Enter the quantity to return.','err');return}
  for(const l of lines) if(num(l.qty)>l.avail+1e-9){toast(`Only ${fq(l.avail)} ${l.unit} of ${l.desc} can be returned.`,'err');return}
  if(!String(d.remarks||'').trim()){toast('Write the details of the problem.','err');return}
  const site=d.from!=='hq';const po=d.poId&&S.pos.find(p=>p.id===d.poId);
  const doc={from:site?'site':'hq',projectId:site?d.from:'',vendorId:d.vendorId||'',vendorName:vname,poId:d.poId||'',poNo:po?po.no:(d.dispId?((S.dispatches.find(x=>x.id===d.dispId)||{}).poNo||''):''),dispatchId:d.dispId||'',
    date:d.date||today(),reason:d.reason,replace:!!(d.poId&&d.replace),remarks:String(d.remarks).trim(),vehicle:d.vehicle||'',lrNo:d.lrNo||'',photos:d.photos||[],status:'returned',at:Date.now(),createdBy:ui.uid,createdByName:(ui.me&&ui.me.name)||'',
    lines:lines.map(l=>({itemKey:l.k,poKey:l.poKey||'',desc:l.desc,spec:l.spec,unit:l.unit,cat:l.cat,qty:num(l.qty),rate:l.rate===''?null:num(l.rate),gst:l.gst===''?null:num(l.gst)}))};
  const ok=await run(async()=>{const no=await allocNo('RTV',S.vreturns);const id=newId();await setDoc('vreturns',id,Object.assign({no},doc));return S.vreturns.find(x=>x.id===id)});
  if(ok){closeModal();toast(`${ok.no} saved. Stock reduced${ok.replace?' and the quantity is due again on '+ok.poNo:''}.`);printHtml(ok.no,vretDoc(ok))}};
A.vretPrint=d=>{const v=S.vreturns.find(x=>x.id===d.id);if(v) printHtml(v.no,vretDoc(v))};
A.vretCancel=d=>{const v=S.vreturns.find(x=>x.id===d.id);if(!v) return;confirmBox({title:'Cancel '+v.no+'?',body:'Use this only if the material did not actually go back. Stock is restored.',noteArea:true,note:'Reason (required)',yes:'Cancel return',danger:true,
  onYes:async m=>{const r=String(m.noteVal||'').trim();if(!r){toast('Write the reason.','err');return}if(await run(()=>updDoc('vreturns',v.id,{status:'cancelled',cancelNote:r}),v.no+' cancelled')!==false) closeModal()}})};
function vretList(loc){const site=loc&&loc!=='hq';const list=S.vreturns.filter(v=>site?v.projectId===loc:true).sort((a,b)=>(b.at||0)-(a.at||0));const vals=ui.role==='hq'&&seeRates();
  return `<section class="card"><div class="card-h"><h2>Material returned to vendors</h2><span class="sub">Rejected, wrong specification, damaged or excess material sent back</span><div class="acts"><button class="btn sm primary" data-act="vretNew" data-p="${esc(loc||'hq')}">${icon('back')} Return to vendor</button></div></div>
  ${list.length?`<div class="tw"><table class="t"><thead><tr><th>Return note</th><th>From</th><th>Vendor</th><th>Reason</th><th>Items</th>${vals?'<th class="num">Value</th>':''}<th>Next</th><th></th></tr></thead><tbody>${list.map(v=>`<tr><td><span class="docno">${esc(v.no)}</span><small class="muted block">${fd(v.date)}</small>${v.status==='cancelled'?' <span class="chip red plain">cancelled</span>':''}</td><td class="small">${v.from==='site'?esc(projName(v.projectId)):'HQ store'}</td><td><b>${esc(v.vendorName)}</b>${v.poNo?`<small class="muted block">${esc(v.poNo)}</small>`:''}</td><td class="small">${esc(VRET_REASON[v.reason]||v.reason)}</td>
   <td class="small">${(v.lines||[]).map(l=>`${fq(l.qty)} ${esc(l.unit)} ${esc(l.desc)}`).join('<br>')}</td>${vals?`<td class="num mono">${vretVal(v)?money0(vretVal(v)):'—'}</td>`:''}<td class="small">${v.replace?'<span class="chip amber plain">Replacement due</span>':'<span class="chip plain">Debit note</span>'}</td>
   <td class="nowrap"><button class="btn sm" data-act="vretPrint" data-id="${v.id}">${icon('print')}</button>${ui.role==='hq'&&v.status!=='cancelled'?`<button class="btn sm ghost" data-act="vretCancel" data-id="${v.id}">Cancel</button>`:''}</td></tr>`).join('')}</tbody></table></div>`
  :emptyBox(ART.x('truck','e-art'),'Nothing returned to vendors','When material received is rejected or does not match the order, return it with “Return to vendor”.')}</section>`}
function vretDoc(v){const c=S.config;const b='border:1px solid #c9d3d6;padding:6px 8px;font-size:12.5px;vertical-align:top';const vd=vend(v.vendorId)||{};const vals=seeRates()&&(v.lines||[]).some(l=>l.rate!=null);const tot=vretVal(v);
  const fromTxt=v.from==='site'?(()=>{const p=proj(v.projectId)||{};return `${esc(p.name||'')}${p.code?' ('+esc(p.code)+')':''}<br><span style="white-space:pre-line">${esc(p.address||[p.city,p.state].filter(Boolean).join(', '))}</span>`})():(()=>{const si=storeInfo();return `${esc(si.legal||company())}<br>${esc(si.name||'HQ store')}<br><span style="white-space:pre-line">${esc(si.address||'')}</span>${si.gstin?'<br>GSTIN: '+esc(si.gstin):''}`})();
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0F2132;padding:28px;max-width:900px;margin:0 auto">
  <table style="width:100%"><tr><td>${c.logo?`<img src="/files/${esc(c.logo)}" style="height:50px;max-width:150px;object-fit:contain" alt=""><br>`:''}<b style="font-size:19px">${esc(company())}</b></td><td style="text-align:right"><div style="font-size:20px;font-weight:800;color:#1172C4">MATERIAL RETURN NOTE${!v.replace&&vals?' / DEBIT NOTE':''}</div><b>${esc(v.no)}</b><br>Date: ${fd(v.date)}${v.status==='cancelled'?'<br><b style="color:#C0392B">CANCELLED</b>':''}</td></tr></table>
  <table style="width:100%;border-collapse:collapse;margin-top:14px"><tr><td style="${b};width:50%"><b>Returned from</b><br>${fromTxt}</td><td style="${b}"><b>Returned to (vendor)</b><br>${esc(vd.name||v.vendorName)}<br><span style="white-space:pre-line">${esc(vd.address||vd.city||'')}</span>${vd.gstin?'<br>GSTIN: '+esc(vd.gstin):''}${v.poNo?'<br><b>Against PO:</b> '+esc(v.poNo):''}</td></tr>
  <tr><td style="${b}"><b>Reason:</b> ${esc(VRET_REASON[v.reason]||v.reason)}<br>${esc(v.remarks||'')}</td><td style="${b}"><b>Vehicle:</b> ${esc(v.vehicle||'—')} · <b>LR / e-way bill:</b> ${esc(v.lrNo||'—')}<br><b>${v.replace?'Please replace the material returned at the earliest, under the same purchase order.':'No replacement required. Please issue a credit note / adjust in your bill.'}</b></td></tr></table>
  <table style="width:100%;border-collapse:collapse;margin-top:14px"><thead><tr style="background:#e9eef2"><th style="${b}">#</th><th style="${b};text-align:left">Item</th><th style="${b};text-align:right">Qty returned</th><th style="${b}">Unit</th>${vals?`<th style="${b};text-align:right">Rate (₹)</th><th style="${b};text-align:right">GST %</th><th style="${b};text-align:right">Value incl. GST (₹)</th>`:''}</tr></thead>
  <tbody>${(v.lines||[]).map((l,i)=>`<tr><td style="${b}">${i+1}</td><td style="${b}"><b>${esc(l.desc)}</b>${l.spec?'<br><span style="color:#465A6D">'+esc(l.spec)+'</span>':''}</td><td style="${b};text-align:right">${fq(l.qty)}</td><td style="${b}">${esc(l.unit)}</td>${vals?`<td style="${b};text-align:right">${l.rate!=null?fq(l.rate):''}</td><td style="${b};text-align:right">${l.gst!=null?fq(l.gst):''}</td><td style="${b};text-align:right">${l.rate!=null?fq(num(l.qty)*num(l.rate)*(1+num(l.gst)/100)):''}</td>`:''}</tr>`).join('')}
  ${vals&&tot?`<tr><td colspan="6" style="${b};text-align:right"><b>Total value</b></td><td style="${b};text-align:right"><b>${fq(tot)}</b></td></tr><tr><td colspan="7" style="${b}"><b>In words:</b> ${inWords(tot)}</td></tr>`:''}</tbody></table>
  <p style="font-size:12px;color:#465A6D">${(v.photos||[]).length?(v.photos.length+' photo(s) / document(s) kept in ProcureHub.'):''}</p>
  <table style="width:100%;margin-top:40px;font-size:12px"><tr><td style="vertical-align:bottom">Prepared by<br><br><b>${esc(v.createdByName||'')}</b></td><td style="text-align:center;vertical-align:bottom">For ${esc(company())}<br><br><br>Authorised signatory</td><td style="text-align:right;vertical-align:bottom;width:34%"><div style="border:1px dashed #9aa8b1;height:60px;margin-bottom:4px"></div>Received by vendor (sign &amp; stamp)</td></tr></table></div>`}
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='vret'?vretModal(m,busy):prev(m,busy)}

/* ================= 10. CASH (COUNTER) PURCHASES =================
   Entered by people with the right to spend (within their limit per bill), approved by the approver
   (right "Approve cash purchases") and finally by the person who grants purchase orders (Director).
   Consumption from a cash purchase — at once or later — goes through the same two approvals.
   Stock counts them once finally approved. The server checks every step (cash.go). */
HQ_VIEWS.push('cash');SITE_VIEWS.push('s_cash');
Object.assign(VIEW_PERM,{cash:['cash_spend','cash_approve','po_approve','rates_view','reports']});
Object.assign(TITLES,{cash:['Cash purchases','Bought at the counter — approved by the approver and the PO-granting authority'],s_cash:['Cash purchases','Items bought for cash at your site']});
PERM_GROUPS[1][1].push(['cash_spend','Make cash purchases','Enter items bought for cash (counter purchases) at HQ or for a site, within the limit per bill'],['cash_approve','Approve cash purchases','First approval of cash purchases and of consumption from them (final approval is by the person who approves purchase orders)']);
for(const p of PERM_GROUPS[1][1].slice(-2)) PERM_LABEL[p[0]]=p[1];
ROLE_PRESETS[0][2].push('cash_approve');
Object.assign(ACT_PERM,{cashApprove:'cash_approve',cashFinal:'po_approve',cashNew:'cash_spend',saveCash:['cash_spend','cash_approve','po_approve']});
const CASH_ST={pending:['Waiting for approver','amber'],approved:['Waiting for final approval','violet'],final:['Approved','green'],returned:['Returned for correction','red'],rejected:['Rejected','red']};
const cashChip=s=>chip({label:(CASH_ST[s]||[s])[0],tone:(CASH_ST[s]||[0,'plain'])[1]});
// quantity consumed per line, counting only finally approved consumption
function cashUsedFinal(c){const u={};if(c.status!=='final') return u;(c.lines||[]).forEach((l,i)=>u[i]=num(l.usedNow));for(const x of c.uses||[]) if(x.status==='final') for(const k in x.qty||{}) u[+k]=(u[+k]||0)+num(x.qty[k]);return u}
function cashUsedAll(c){const u={};(c.lines||[]).forEach((l,i)=>u[i]=num(l.usedNow));for(const x of c.uses||[]) if(x.status!=='rejected') for(const k in x.qty||{}) u[+k]=(u[+k]||0)+num(x.qty[k]);return u}
const cashMaySpend=()=>ui.role==='site'?!!(ui.me&&ui.me.cashSpend)&&!ui.preview:can('cash_spend');
function cashCanStep(t,c){if(ui.role!=='hq'||!t||t.by===ui.uid) return '';if(t.status==='pending'&&can('cash_approve')) return 'approve';
  if(t.status==='approved'&&can('po_approve')&&!(t.appr&&t.appr.by===ui.uid)) return 'final';return ''}
function cashWaiting(){let n=0;for(const c of S.cashbuys){if(cashCanStep(c,c)) n++;for(const u of c.uses||[]) if(cashCanStep(u,c)) n++}return n}
const cashWhere=c=>c.location==='hq'?'HQ store'+(c.projectId?' · for '+projName(c.projectId):''):projName(c.projectId);
function vCash(){const site=ui.role==='site';const pid=site?siteProject():(ui.f.cpp||'');const mine=cashWaiting();
  const f=ui.f.cpf||(mine?'todo':'open');const q=norm(ui.f.cpq);
  let list=S.cashbuys.filter(c=>!pid||c.projectId===pid);
  list=list.filter(c=>f==='all'?true:f==='todo'?(cashCanStep(c,c)||(c.uses||[]).some(u=>cashCanStep(u,c))||(c.status==='returned'&&c.by===ui.uid)):f==='open'?['pending','approved','returned'].includes(c.status)||(c.uses||[]).some(u=>u.status==='pending'||u.status==='approved'):c.status===f);
  if(q) list=list.filter(c=>norm([c.no,c.shop,c.purpose,c.byName,...(c.lines||[]).map(l=>l.desc+' '+l.spec)].join(' ')).includes(q));
  list.sort((a,b)=>(b.at||0)-(a.at||0));
  const tot=sum(list.filter(c=>c.status!=='rejected'),c=>num(c.total));
  return `<div class="toolbar">${seg('cpf',[['todo',`For me${mine?' ('+mine+')':''}`],['open','Open'],['final','Approved'],['rejected','Rejected'],['all','All']],f)}
   ${site?'':`<select class="inp auto" id="f-cpp" data-act-change="setFsel" data-k="cpp">${projOpts(pid,'All sites and HQ')}</select>`}<div class="search-inp">${icon('search')}<input class="inp" id="f-cpq" placeholder="Search shop, item, CP no." data-bind="f.cpq" data-rerender="1" value="${esc(ui.f.cpq||'')}"></div>
   <span class="spacer"></span><span class="muted small">${list.length} entr${list.length===1?'y':'ies'} · ${money0(tot)}</span>${cashMaySpend()?`<button class="btn orange" data-act="cashNew">${icon('plus')} New cash purchase</button>`:''}</div>
  ${!cashMaySpend()&&site?`<div class="notice info">${icon('help')}<span>Cash purchases are entered by the people HQ has given the right to spend. Ask HQ if you need it.</span></div>`:''}
  ${list.length?list.map(cashCard).join(''):`<section class="card">${emptyBox(ART.x('po','e-art'),'No cash purchases here','Items bought for cash at the counter are entered here with the bill, approved by the approver and finally by the PO-granting authority.',cashMaySpend()?`<button class="btn orange" data-act="cashNew">${icon('plus')} New cash purchase</button>`:'')}</section>`}`}
function cashSteps(t){const s=t.status;return `<div class="steps ${s==='rejected'?'rej':''}"><span class="step on"><i></i><b>Entered</b><em>${esc(firstName(t.byName||''))}</em></span><span class="step ${s==='approved'||s==='final'?'on':''}"><i></i><b>Approver</b>${t.appr?`<em>${esc(firstName(t.appr.byName))}</em>`:''}</span><span class="step ${s==='final'?'on':''}"><i></i><b>Final</b>${t.fin?`<em>${esc(firstName(t.fin.byName))}</em>`:''}</span></div>`}
function cashStepBtns(t,c){const k=cashCanStep(t,c);const u=t===c?'':` data-use="${t.id}"`;if(!k) return '';
  return `<button class="btn sm primary" data-act="cashStep" data-id="${c.id}"${u} data-a="${k==='approve'?'approve':'final'}">${icon('check')} ${k==='approve'?'Approve':'Final approval'}</button>${t===c?`<button class="btn sm" data-act="cashStep" data-id="${c.id}" data-a="return">Return for correction</button>`:''}<button class="btn sm danger" data-act="cashStep" data-id="${c.id}"${u} data-a="reject">Reject</button>`}
function cashCard(c){const usedAll=cashUsedAll(c);const left=(c.lines||[]).some((l,i)=>num(l.qty)-(usedAll[i]||0)>1e-9);const me=c.by===ui.uid;
  return `<section class="card cash-card"><div class="card-h"><span class="n-ic ${(CASH_ST[c.status]||[])[1]||''}">${icon('tag')}</span><div><h2><span class="docno">${esc(c.no)}</span> · ${esc(c.shop||'')} · ${money(num(c.total))}</h2><span class="sub">${fd(c.date)} · ${esc(cashWhere(c))} · ${esc(c.payMode||'Cash')}${c.billNo?' · bill '+esc(c.billNo):''} · entered by ${esc(c.byName||'')}</span></div>${cashChip(c.status)}
   <div class="acts">${cashStepBtns(c,c)}${me&&(c.status==='returned'||c.status==='pending')?`<button class="btn sm" data-act="cashNew" data-id="${c.id}">${icon('edit')} ${c.status==='returned'?'Correct &amp; send again':'Correct'}</button>`:''}${c.status!=='rejected'&&left?`<button class="btn sm" data-act="cashUse" data-id="${c.id}">${icon('minus')} Record consumption</button>`:''}<button class="btn sm ghost" data-act="cashPrint" data-id="${c.id}">${icon('print')}</button></div></div>
   <div class="card-b">${cashSteps(c)}
   ${c.returnNote&&(c.status==='returned'||c.status==='rejected')?`<div class="notice err">${icon('alert')}<span><b>${c.status==='returned'?'Returned for correction':'Rejected'} by ${esc(c.returnNote.byName)}</b> · ${fdt(c.returnNote.at)}: “${esc(c.returnNote.remark)}”</span></div>`:''}
   <p class="small"><b>Purpose:</b> ${esc(c.purpose||'')}${c.useRemarks?` · <b>Consumed at once:</b> ${esc(c.useRemarks)}`:''}</p>
   <div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">GST %</th><th class="num">Amount</th><th class="num">Consumed</th><th class="num">Left</th></tr></thead><tbody>${(c.lines||[]).map((l,i)=>`<tr><td><div class="who">${lineThumb(l,'xs')}<span><b>${esc(l.desc)}</b><small class="muted block">${esc(l.spec||'')}</small></span></div></td><td class="num mono">${fq(l.qty)} ${esc(l.unit)}</td><td class="num mono">${fq(l.rate)}</td><td class="num mono">${fq(l.gst)}</td><td class="num mono">${money(num(l.amount))}</td><td class="num mono">${fq(usedAll[i]||0)}</td><td class="num mono">${fq(num(l.qty)-(usedAll[i]||0))}</td></tr>`).join('')}</tbody></table></div>
   ${photoStrip(c.photos)}
   ${(c.uses||[]).length?`<div class="lbl">Consumption from this purchase</div><div class="list">${c.uses.map(u=>`<div class="li"><span class="n-ic ${(CASH_ST[u.status]||[])[1]||''}">${icon('minus')}</span><div class="grow"><b><span class="docno">${esc(u.no)}</span> · ${fd(u.date)} · ${Object.entries(u.qty||{}).map(([k,v])=>{const l=c.lines[+k]||{};return `${fq(v)} ${esc(l.unit||'')} ${esc(l.desc||'')}`}).join(', ')}</b><small>${esc(u.remarks||'')} · by ${esc(u.byName||'')}${u.appr?' · approved by '+esc(u.appr.byName):''}${u.fin?' · final by '+esc(u.fin.byName):''}${u.returnNote?' · '+esc(u.returnNote.byName)+': “'+esc(u.returnNote.remark)+'”':''}</small></div>${cashChip(u.status)}<div class="row tight">${cashStepBtns(u,c)}</div></div>`).join('')}</div>`:''}</div></section>`}

const cashLine=()=>({desc:'',spec:'',unit:'Nos',qty:'',rate:'',gst:'18',usedNow:''});
A.cashNew=d=>{const c=d.id?S.cashbuys.find(x=>x.id===d.id):null;
  const loc=c?c.location:(ui.role==='site'?'site':'hq');const pid=c?c.projectId:(ui.role==='site'?siteProject():(ui.f.cpp||''));
  openModal({type:'cashNew',id:c?c.id:null,d:c?{location:c.location,projectId:c.projectId,date:c.date,shop:c.shop,shopGstin:c.shopGstin||'',billNo:c.billNo||'',billDate:c.billDate||'',payMode:c.payMode||'Cash',purpose:c.purpose,useRemarks:c.useRemarks||'',photos:(c.photos||[]).slice(),
    lines:c.lines.map(l=>({desc:l.desc,spec:l.spec||'',unit:l.unit,qty:String(l.qty),rate:String(l.rate),gst:String(l.gst),usedNow:l.usedNow?String(l.usedNow):''}))}
    :{location:loc,projectId:pid,date:today(),shop:'',shopGstin:'',billNo:'',billDate:today(),payMode:'Cash',purpose:'',useRemarks:'',photos:[],lines:[cashLine(),cashLine()]}})};
A.cashAdd=()=>{ui.modal.d.lines.push(cashLine());render()};A.cashRm=d=>{const ls=ui.modal.d.lines;ls.splice(+d.i,1);if(!ls.length) ls.push(cashLine());render()};
A.cashLoc=d=>{ui.modal.d.location=d.val;render()};A.cashPay=d=>{ui.modal.d.payMode=d.val;render()};
const cashAmt=l=>num(l.qty)*num(l.rate)*(1+num(l.gst)/100);
function cashModal(m,busy){const d=m.d;const site=ui.role==='site';const tot=sum(d.lines,cashAmt);const lim=num(ui.me&&ui.me.cashLimit);const anyUsed=d.lines.some(l=>num(l.usedNow)>0);
  return wrap(m.id?'Correct cash purchase':'New cash purchase',`<datalist id="dl-cash">${D.items.slice(0,800).map(c=>`<option value="${esc(c.desc)}">`).join('')}</datalist>
   <div class="fields">${site?`<div class="f span2"><label>Bought for</label><b>${esc(projName(d.projectId))}</b></div>`:`<div class="f"><label>Bought for</label>${seg('cploc',[['site','A site'],['hq','HQ store']],d.location,'cashLoc')}</div>
     <div class="f"><label for="f-modal-d-projectId">${d.location==='hq'?'For project (optional)':'Site'}</label><select class="inp" id="f-modal-d-projectId" data-bind="modal.d.projectId">${projOpts(d.projectId,d.location==='hq'?'— HQ use —':'Choose site')}</select></div>`}
   ${field('Date of purchase','modal.d.date',d.date,'type="date"')}${field('Shop / seller','modal.d.shop',d.shop,'placeholder="Name of the shop"')}${field('Shop GSTIN (if on bill)','modal.d.shopGstin',d.shopGstin)}
   ${field('Bill / cash memo no.','modal.d.billNo',d.billNo)}${field('Bill date','modal.d.billDate',d.billDate,'type="date"')}<div class="f"><label>Paid by</label>${seg('cppay',[['Cash','Cash'],['UPI','UPI'],['Card','Card']],d.payMode,'cashPay')}</div></div>
   <div class="f full"><label for="f-modal-d-purpose">Purpose — why it was bought for cash (required)</label>${inp('modal.d.purpose',d.purpose,'placeholder="e.g. Urgent repair of pump at SPS-2; not in stock"')}</div>
   <div class="lbl">Items bought</div><div class="am-lines cash-lines">${d.lines.map((l,i)=>`<div class="am-line"><div class="am-f">
    <label class="am-s"><span>Item</span>${inp('modal.d.lines.'+i+'.desc',l.desc,'list="dl-cash" placeholder="Item"')}</label><label class="am-s"><span>Size / spec</span>${inp('modal.d.lines.'+i+'.spec',l.spec)}</label></div><div class="am-f">
    <label class="am-q"><span>Qty</span>${inp('modal.d.lines.'+i+'.qty',l.qty,'inputmode="decimal" data-rerender="1"')}</label>
    <label><span>Unit</span><select class="inp sm" id="${fid('modal.d.lines.'+i+'.unit')}" data-bind="modal.d.lines.${i}.unit">${selOpts(UNITS.includes(l.unit)?UNITS:UNITS.concat([l.unit]),l.unit)}</select></label>
    <label class="am-q"><span>Rate (₹)</span>${inp('modal.d.lines.'+i+'.rate',l.rate,'inputmode="decimal" data-rerender="1"')}</label>
    <label><span>GST %</span><select class="inp sm" id="${fid('modal.d.lines.'+i+'.gst')}" data-bind="modal.d.lines.${i}.gst">${selOpts(GST_SLABS.map(String),l.gst)}</select></label>
    <label class="am-q"><span>Used at once</span>${inp('modal.d.lines.'+i+'.usedNow',l.usedNow,'inputmode="decimal" data-rerender="1" placeholder="0"')}</label>
    <span class="mono"><b>${cashAmt(l)?money(cashAmt(l)):''}</b></span><button type="button" class="btn sm ghost" data-act="cashRm" data-i="${i}">${icon('trash')} Remove</button></div></div>`).join('')}</div>
   <div class="row"><button type="button" class="btn sm" data-act="cashAdd">${icon('plus')} Add item</button><span class="spacer"></span><b>Total ${money(tot)}</b>${lim?`<span class="small ${tot>lim?'t-red':'muted'}">· your limit ${money0(lim)} per bill</span>`:''}</div>
   ${anyUsed?`<div class="f full"><label for="f-modal-d-useRemarks">Remarks about what was used at once (required)</label>${inp('modal.d.useRemarks',d.useRemarks,'placeholder="e.g. Used in pump repair at SPS-2 on the same day"')}</div>`:''}
   <div class="f full"><label>Bill / cash memo (photo or PDF)</label>${photoPicker('modal.d.photos',d.photos,{doc:true})}</div>
   <p class="small muted">Goes to the approver, then to the person who grants purchase orders for final approval. Quantities not used at once are added to ${d.location==='hq'?'the HQ store':'site stock'} after final approval.</p>`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn orange" data-act="saveCash" ${busy}>${icon('ul')} ${m.id?(S.cashbuys.find(x=>x.id===m.id)||{}).status==='returned'?'Send again for approval':'Save correction':'Send for approval'}</button>`,'wide')}
A.saveCash=async()=>{const m=ui.modal,d=m.d;const lines=d.lines.filter(l=>String(l.desc).trim()||num(l.qty)>0);
  if(d.location==='site'&&!d.projectId){toast('Choose the site.','err');return}
  if(!String(d.shop).trim()){toast('Enter the shop.','err');return}if(!String(d.purpose).trim()){toast('Enter the purpose.','err');return}
  if(!lines.length){toast('Enter at least one item.','err');return}
  for(const l of lines){if(!String(l.desc).trim()||!(num(l.qty)>0)){toast('Enter item and quantity on every line.','err');return}if(num(l.usedNow)>num(l.qty)){toast('Used at once cannot be more than bought for '+l.desc+'.','err');return}}
  if(lines.some(l=>num(l.usedNow)>0)&&!String(d.useRemarks||'').trim()){toast('Write remarks about what was used at once.','err');return}
  if(!(d.photos||[]).length){toast('Attach the bill or cash memo.','err');return}
  const body={date:d.date,shop:String(d.shop).trim(),shopGstin:String(d.shopGstin||'').trim(),billNo:String(d.billNo||'').trim(),billDate:d.billDate||'',payMode:d.payMode,purpose:String(d.purpose).trim(),useRemarks:String(d.useRemarks||'').trim(),photos:d.photos,
    lines:lines.map(l=>{const desc=String(l.desc).trim(),spec=String(l.spec||'').trim();return {desc,spec,unit:l.unit,cat:classify(desc,spec).cat,itemKey:itemKey(desc,spec,l.unit),qty:num(l.qty),rate:num(l.rate),gst:num(l.gst),usedNow:num(l.usedNow)}})};
  const ok=await run(async()=>{if(m.id){const c=S.cashbuys.find(x=>x.id===m.id);await updDoc('cashbuys',m.id,Object.assign(body,c.status==='returned'?{resubmit:true}:{}));return c.no}
    const no=await allocNo('CP',S.cashbuys);await setDoc('cashbuys',newId(),Object.assign({no,location:d.location,projectId:d.projectId||'',at:Date.now()},body));return no});
  if(ok){closeModal();toast(ok+(m.id?' saved':' sent to the approver'))}};
A.cashStep=d=>{const c=S.cashbuys.find(x=>x.id===d.id);if(!c) return;const t=d.use?(c.uses||[]).find(u=>u.id===d.use):c;const lbl={approve:'Approve',final:'Final approval',return:'Return for correction',reject:'Reject'}[d.a];
  const need=d.a==='return'||d.a==='reject';
  confirmBox({title:lbl+' · '+(t.no||c.no),body:`<p><b>${esc(c.shop)}</b> · ${money(num(c.total))} · ${esc(cashWhere(c))}</p><p class="small">${d.use?Object.entries(t.qty||{}).map(([k,v])=>`${fq(v)} ${esc((c.lines[+k]||{}).unit||'')} ${esc((c.lines[+k]||{}).desc||'')}`).join(', ')+' — '+esc(t.remarks||''):esc(c.purpose||'')}</p>`,noteArea:true,note:need?'Reason (required)':'Remark (optional)',yes:lbl,danger:d.a==='reject',
   onYes:async m=>{const r=String(m.noteVal||'').trim();if(need&&!r){toast('Write the reason.','err');return}
     if(await run(()=>updDoc('cashbuys',c.id,{step:{action:d.a,remark:r,useId:d.use||''}}),lbl+' done')!==false) closeModal()}})};
A.cashUse=d=>{const c=S.cashbuys.find(x=>x.id===d.id);if(!c) return;openModal({type:'cashUse',id:c.id,d:{date:today(),remarks:'',qty:{}}})};
function cashUseModal(m,busy){const c=S.cashbuys.find(x=>x.id===m.id);if(!c) return '';const u=cashUsedAll(c);
  return wrap('Record consumption · '+esc(c.no),`<p class="small muted">From the cash purchase at ${esc(c.shop)} on ${fd(c.date)}. It is counted after the approver and the PO-granting authority approve it.</p>
   <div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Left</th><th class="num">Consumed now</th></tr></thead><tbody>${(c.lines||[]).map((l,i)=>{const left=num(l.qty)-(u[i]||0);return `<tr><td><b>${esc(l.desc)}</b><small class="muted block">${esc(l.spec||'')}</small></td><td class="num mono">${fq(left)} ${esc(l.unit)}</td><td>${left>1e-9?inp('modal.d.qty.'+i,m.d.qty[i]||'','inputmode="decimal" style="width:100px"'):'—'}</td></tr>`}).join('')}</tbody></table></div>
   <div class="fields two">${field('Date','modal.d.date',m.d.date,'type="date"')}</div>
   <div class="f full"><label for="f-modal-d-remarks">Remarks about the consumption (required)</label><textarea class="inp" id="f-modal-d-remarks" data-bind="modal.d.remarks" rows="2" placeholder="Where and for what work it was used">${esc(m.d.remarks||'')}</textarea></div>`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn orange" data-act="saveCashUse" ${busy}>${icon('ul')} Send for approval</button>`)}
A.saveCashUse=async()=>{const m=ui.modal;const qty={};for(const [k,v] of Object.entries(m.d.qty||{})) if(num(v)>0) qty[k]=num(v);
  if(!Object.keys(qty).length){toast('Enter the quantity consumed.','err');return}if(!String(m.d.remarks||'').trim()){toast('Write the remarks about the consumption.','err');return}
  if(await run(()=>updDoc('cashbuys',m.id,{addUse:{qty,remarks:String(m.d.remarks).trim(),date:m.d.date}}),'Consumption sent for approval')!==false) closeModal()};
A.cashPrint=d=>{const c=S.cashbuys.find(x=>x.id===d.id);if(c) printHtml(c.no,cashDoc(c))};
function cashDoc(c){const b='border:1px solid #c9d3d6;padding:6px 8px;font-size:12.5px;vertical-align:top';const conf=S.config;const fin=c.fin;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0F2132;padding:28px;max-width:900px;margin:0 auto">${c.status!=='final'?`<div style="border:2px solid #C0392B;color:#C0392B;font-weight:800;text-align:center;padding:8px;margin-bottom:12px">${c.status==='rejected'?'REJECTED':'NOT YET FULLY APPROVED'}</div>`:''}
  <table style="width:100%"><tr><td>${conf.logo?`<img src="/files/${esc(conf.logo)}" style="height:50px;max-width:150px;object-fit:contain" alt=""><br>`:''}<b style="font-size:19px">${esc(company())}</b></td><td style="text-align:right"><div style="font-size:20px;font-weight:800;color:#1172C4">CASH PURCHASE VOUCHER</div><b>${esc(c.no)}</b><br>Date: ${fd(c.date)}</td></tr></table>
  <table style="width:100%;border-collapse:collapse;margin-top:14px"><tr><td style="${b};width:50%"><b>Bought from</b><br>${esc(c.shop)}${c.shopGstin?'<br>GSTIN: '+esc(c.shopGstin):''}<br>Bill ${esc(c.billNo||'—')} dt. ${fd(c.billDate)} · paid by ${esc(c.payMode||'Cash')}</td><td style="${b}"><b>Bought for</b><br>${esc(cashWhere(c))}<br><b>Purpose:</b> ${esc(c.purpose||'')}</td></tr></table>
  <table style="width:100%;border-collapse:collapse;margin-top:14px"><thead><tr style="background:#e9eef2"><th style="${b}">#</th><th style="${b};text-align:left">Item</th><th style="${b};text-align:right">Qty</th><th style="${b}">Unit</th><th style="${b};text-align:right">Rate</th><th style="${b};text-align:right">GST %</th><th style="${b};text-align:right">Amount (₹)</th><th style="${b};text-align:right">Used at once</th></tr></thead>
  <tbody>${(c.lines||[]).map((l,i)=>`<tr><td style="${b}">${i+1}</td><td style="${b}"><b>${esc(l.desc)}</b>${l.spec?'<br><span style="color:#465A6D">'+esc(l.spec)+'</span>':''}</td><td style="${b};text-align:right">${fq(l.qty)}</td><td style="${b}">${esc(l.unit)}</td><td style="${b};text-align:right">${fq(l.rate)}</td><td style="${b};text-align:right">${fq(l.gst)}</td><td style="${b};text-align:right">${fq(l.amount)}</td><td style="${b};text-align:right">${l.usedNow?fq(l.usedNow):''}</td></tr>`).join('')}
  <tr><td colspan="6" style="${b};text-align:right"><b>Total</b></td><td style="${b};text-align:right"><b>${fq(c.total)}</b></td><td style="${b}"></td></tr><tr><td colspan="8" style="${b}"><b>In words:</b> ${inWords(num(c.total))}</td></tr></tbody></table>
  ${c.useRemarks?`<p style="font-size:12px"><b>Used at once:</b> ${esc(c.useRemarks)}</p>`:''}
  <table style="width:100%;margin-top:40px;font-size:12px"><tr><td style="vertical-align:bottom">Bought / entered by<br><br><b>${esc(c.byName||'')}</b><br>${fdt(c.enteredAt||c.at)}</td><td style="text-align:center;vertical-align:bottom">Approved by<br><br><b>${esc(c.appr?c.appr.byName:'')}</b><br>${c.appr?fdt(c.appr.at):''}</td>
  <td style="text-align:right;vertical-align:bottom">${fin&&fin.sign?`<img src="/files/${esc(fin.sign)}" alt="" style="height:70px;max-width:200px;object-fit:contain"><br>`:'<br><br>'}Final approval<br><b>${esc(fin?fin.byName:'')}</b><br>${fin?esc(fin.designation||'')+'<br>'+fdt(fin.at):''}</td></tr></table></div>`}
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='cashNew'?cashModal(m,busy):m.type==='cashUse'?cashUseModal(m,busy):prev(m,busy)}

/* ================= 11. SECURE CONNECTION (https) ================= */
async function loadHttps(){if(!isAdm()) return;try{ui.https=await api('/api/https');if(!ui.draft.https) ui.draft.https={domain:ui.https.domain||(/[a-z]/i.test(location.hostname)&&location.hostname.includes('.')?location.hostname:''),email:ui.https.email||''};schedule()}catch(e){}}
function httpsCard(){if(!isAdm()) return '';const h=ui.https;if(!h){if(!ui._httpsLoading){ui._httpsLoading=1;loadHttps()}return ''}const d=ui.draft.https||{};
  const onHttps=location.protocol==='https:';
  const state=h.manual?`<span class="chip green">On (own certificate)</span>`:h.on&&h.ready?`<span class="chip green">On</span>`:h.on?`<span class="chip amber">Waiting for certificate</span>`:`<span class="chip plain">Off</span>`;
  return `<section class="card" id="https-set"><div class="card-h"><h2>Secure connection (https)</h2>${state}<span class="sub">Removes “Not secure” in the browser</span></div><div class="card-b grid" style="gap:12px">
   ${h.manual?`<p class="small">ProcureHub was started with its own certificate (--tls-cert), so the connection is already secure.</p>`:`
   <p class="small muted">Sites reach ProcureHub through an internet name such as <b>rgsit.ddnsking.com</b>. Enter it here and ProcureHub gets a free certificate from Let's Encrypt and renews it by itself. Everyone then opens <b>https://</b>name<b>:${h.port}</b>; old http links are sent there automatically. Inside the office, addresses with the computer's IP keep working.</p>
   <div class="notice info">${icon('help')}<span><b>One step in the router first:</b> forward <b>port 80</b> (TCP) to this computer, the same way port ${h.port} is already forwarded. Let's Encrypt checks the name through port 80. Nothing else needs to be installed.</span></div>
   <div class="fields">${field('Internet name (without http://)','draft.https.domain',d.domain,'placeholder="rgsit.ddnsking.com" autocapitalize="none" spellcheck="false"')}${field('Email for certificate notices (optional)','draft.https.email',d.email,'type="email"')}</div>
   ${h.on?`<div class="small">${h.ready?`${icon('check','xs')} <b class="t-green">Certificate active</b>${h.expires?' · renews automatically before '+fd(msDate(h.expires)):''} · open <a href="${esc(h.url)}">${esc(h.url)}</a>`:`${icon('clock','xs')} No certificate yet.`}</div>`:''}
   ${h.port80Error?`<div class="notice err">${icon('alert')}<span>${esc(h.port80Error)}</span></div>`:''}
   ${h.error?`<div class="notice err">${icon('alert')}<span>${esc(h.error)}</span></div>`:''}
   <div class="row end">${h.on?`<button class="btn" data-act="httpsOff">Switch off</button>`:''}<button class="btn primary" data-act="httpsOn" ${ui.busy?'disabled':''}>${icon('key')} ${h.on?'Save &amp; check again':'Switch on &amp; get certificate'}</button></div>
   ${onHttps?'':h.on&&h.ready?`<p class="small">You are on plain http now. Open <a href="${esc(h.url)}">${esc(h.url)}</a> and sign in again there.</p>`:''}`}</div></section>`}
A.httpsOn=async()=>{const d=ui.draft.https||{};if(!String(d.domain||'').trim()){toast('Enter the internet name, e.g. rgsit.ddnsking.com.','err');return}
  toast('Getting the certificate from Let\'s Encrypt — this can take up to a minute…');
  await run(async()=>{ui.https=await api('/api/https',{on:true,domain:d.domain,email:d.email||''})});
  if(ui.https&&ui.https.ready) toast('Secure connection is on. Open '+ui.https.url);else if(ui.https&&ui.https.error) toast('Certificate not issued yet — see the message in Settings.','err')};
A.httpsOff=()=>confirmBox({title:'Switch off the secure connection?',body:'Browsers will show “Not secure” again for the internet name.',yes:'Switch off',danger:true,onYes:async()=>{const d=ui.draft.https||{};await run(async()=>{ui.https=await api('/api/https',{on:false,domain:d.domain||'',email:d.email||''})},'Secure connection switched off');closeModal()}});
Object.assign(ACT_PERM,{httpsOn:'__admin',httpsOff:'__admin'});
