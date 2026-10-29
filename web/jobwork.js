"use strict";
/* ================= JOB WORK: MATERIAL WITH JOB WORKERS =================
   Material placed with a job worker, e.g. switchgear sent to the panel
   builder. Entries (collection "jobwork"):
     in     – job worker received material (supplier PO routed to him, HQ store, or another supplier)
     bill   – job worker billed the finished product; the raw material used is taken off his balance
     return – unused material sent back to the HQ store
     scrap  – wastage / scrap written off
   Balance with job worker = in − bill − return − scrap (per item). */

Object.assign(ACT_PERM,{jwRecv:['store','po_issue'],saveJwRecv:['store','po_issue'],jwSend:'store',saveJwSend:'store',jwIn:['store','po_issue'],saveJwIn:['store','po_issue'],
  jwBill:['store','po_issue'],saveJwBill:['store','po_issue'],jwBack:'store',saveJwBack:'store',jwCancel:['store','po_issue'],jwUseAll:['store','po_issue']});

const JW_TYPE={in:'Received by job worker',bill:'Used in his bill',return:'Returned to HQ store',scrap:'Wastage / scrap'};
const JW_TONE={in:'blue',bill:'green',return:'violet',scrap:'amber'};
const jwFab=e=>vend(e.vendorId)||{id:e.vendorId,name:e.vendorName||'Job worker'};
const jwFabName=po=>(vend(po.shipToVendorId)||{}).name||po.shipToVendorName||'job worker';
const jwNo=e=>e.no||'—';

// latest purchase rate (excl. GST), GST % and HSN of an item
function jwRate(k){let best=null;for(const p of S.pos){if(p.status==='cancelled') continue;for(const l of p.lines||[]){if((l.itemKey||itemKey(l.desc,l.spec,l.unit))!==k||l.rate==null) continue;if(!best||(p.at||0)>best.at) best={rate:num(l.rate),gst:num(l.gst),hsn:l.hsn||'',at:p.at||0}}}return best}

function jwWhat(e){const f=jwFab(e).name;
  if(e.type==='in') return e.source==='store'?'Sent from HQ store':e.source==='po'?`From ${e.supplierName||'supplier'} against ${e.poNo||'PO'}`:`From ${e.supplierName||'supplier'}`;
  if(e.type==='bill') return `Bill ${e.billNo||''}${e.product&&e.product.desc?' · '+e.product.desc:''}`;
  if(e.type==='return') return 'Returned unused to HQ store';
  return 'Wastage / scrap'+(e.remarks?' · '+e.remarks:'');
}

function fabLedger(){const V={};
  const vrow=e=>V[e.vendorId]||(V[e.vendorId]={vendorId:e.vendorId,name:jwFab(e).name,items:{},ent:[],bills:0,value:0,open:0});
  const irow=(m,k,l)=>m.items[k]||(m.items[k]={itemKey:k,desc:l.desc,spec:l.spec||'',unit:l.unit,cat:l.cat||'others',inQ:0,used:0,ret:0,scrap:0,bal:0,rate:null,ent:[]});
  const list=S.jobwork.filter(e=>e.status!=='cancelled').sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.at||0)-(b.at||0));
  for(const e of list){const m=vrow(e);m.ent.push(e);if(e.type==='bill') m.bills++;
    for(const l of e.lines||[]){const k=l.itemKey||itemKey(l.desc,l.spec,l.unit);const r=irow(m,k,l);const q=num(l.qty);if(!(q>0)) continue;
      if(e.type==='in'){r.inQ+=q;if(l.rate!=null&&l.rate!=='') r.rate=num(l.rate)}else if(e.type==='bill') r.used+=q;else if(e.type==='return') r.ret+=q;else if(e.type==='scrap') r.scrap+=q;
      r.ent.push({e,q})}}
  for(const m of Object.values(V)){for(const r of Object.values(m.items)){r.bal=Math.round((r.inQ-r.used-r.ret-r.scrap)*1000)/1000;if(r.rate==null){const x=jwRate(r.itemKey);if(x) r.rate=x.rate}
      r.value=r.bal>0&&r.rate?r.bal*r.rate:0;m.value+=r.value;if(r.bal>1e-9) m.open++}
    m.list=Object.values(m.items).sort((a,b)=>(b.bal>1e-9)-(a.bal>1e-9)||String(a.desc).localeCompare(b.desc))}
  return V}
function jwOpenCount(){if(!S.jobwork.length) return 0;return Object.values(fabLedger()).filter(m=>m.open).length}
const jwBalOf=vid=>(fabLedger()[vid]||{list:[]}).list.filter(r=>r.bal>1e-9);

/* ---------- on the purchase order ---------- */
function jwPoParty(po){const f=vend(po.shipToVendorId)||{name:po.shipToVendorName||''};const si=storeInfo();const c=S.config||{};
  const fab=`${esc(f.name||'')}<br><span style="white-space:pre-line">${esc(f.address||f.city||'')}</span>${f.gstin?'<br><b>GSTIN:</b> '+esc(f.gstin):''}${f.contact?'<br>Attn: '+esc(f.contact):''}${f.phone?' · '+esc(f.phone):''}`;
  const bill=po.jwBillTo==='us'?`<b>Bill to</b><br>${esc(si.legal||company())}<br><span style="white-space:pre-line">${esc(si.address||c.hqAddress||'')}</span>${si.gstin?'<br><b>GSTIN:</b> '+esc(si.gstin):''}`:`<b>Bill to — job worker</b><br>${fab}`;
  return `${bill}<br><br><b>Ship to — job worker's works</b><br>${po.jwBillTo==='us'?fab:esc(f.name||'')+' (address above)'}<br><span style="font-size:11px;color:#465A6D">${po.jwBillTo==='us'?'Material is supplied on our account to the job worker for job work. Send copies of the invoice and challan to us.':'Please raise the tax invoice on the job worker named above. The material is part of his order to us. Send a copy of the challan to us.'}</span>`}
function jwPoCard(po){const es=S.jobwork.filter(e=>e.poId===po.id&&e.type==='in');
  return `<section class="card"><div class="card-h"><h2>Received at job worker</h2><span class="sub">${esc(jwFabName(po))} · supplier's invoice to ${po.jwBillTo==='us'?'us (free issue)':'the job worker'}</span><div class="acts"><button class="btn sm" data-act="go" data-v="jobwork">${icon('tool')} With job workers</button></div></div>
  <div class="list">${es.map(e=>`<div class="li click" data-act="jwView" data-id="${e.id}"><span class="n-ic ${e.status==='cancelled'?'red':'green'}">${icon('tool')}</span><div class="grow"><b>${esc(jwNo(e))} · ${fd(e.date)}</b>${e.status==='cancelled'?' <span class="chip red plain">cancelled</span>':''}<small>Challan ${esc(e.challan||'—')} · invoice ${esc(e.invoice||'—')}</small>${photoStrip(e.docs)}</div><span class="small mono">${fq(sum(e.lines||[],l=>num(l.qty)))} received</span></div>`).join('')||'<div class="empty sm"><p>Nothing received at the job worker yet.</p></div>'}</div></section>`}

/* ---------- page ---------- */
function vJobwork(){
  const V=fabLedger();const tab=ui.tab.jw||'bal';const vs=Object.values(V).sort((a,b)=>b.open-a.open||String(a.name).localeCompare(b.name));
  const open=vs.filter(m=>m.open);const val=sum(open,m=>m.value);
  const ents=S.jobwork.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||(b.at||0)-(a.at||0));
  const bills=ents.filter(e=>e.type==='bill');
  const exp=S.pos.filter(p=>p.deliveryMode==='vendor'&&p.status!=='cancelled'&&poProgress(p).pct<1-1e-9).sort((a,b)=>(a.at||0)-(b.at||0));
  const q=norm(ui.f.jwq||'');
  const kpis=`<div class="kpis four">
   <button class="kpi has-ph" data-act="tab" data-k="jw" data-val="bal"><span class="kpi-ph">${ART.x('store')}</span><span class="k">Job workers holding our material</span><span class="v">${open.length}</span><span class="d">${seeRates()?'unconsumed worth '+lakh(val):'with unconsumed balance'}</span></button>
   <button class="kpi has-ph" data-act="tab" data-k="jw" data-val="exp" data-tone="${exp.length?'amber':''}"><span class="kpi-ph">${ART.x('po')}</span><span class="k">Expected at job workers</span><span class="v">${exp.length}</span><span class="d">supplier POs sent to a job worker</span></button>
   <button class="kpi has-ph" data-act="tab" data-k="jw" data-val="bills"><span class="kpi-ph">${ART.x('grn')}</span><span class="k">Job worker bills</span><span class="v">${bills.filter(e=>e.status!=='cancelled').length}</span><span class="d">finished products billed</span></button>
   <button class="kpi has-ph" data-act="tab" data-k="jw" data-val="moves"><span class="kpi-ph">${ART.x('truck')}</span><span class="k">Movements</span><span class="v">${ents.length}</span><span class="d">received, used, returned</span></button></div>`;
  const acts=`<div class="toolbar store-acts"><button class="btn primary" data-act="jwBill">${icon('doc')} Record job worker's bill</button><button class="btn" data-act="jwSend">${icon('truck')} Send from HQ store</button><button class="btn" data-act="jwIn">${icon('plus')} Material received by job worker</button><button class="btn" data-act="jwBack">${icon('swap')} Return unused / wastage</button><span class="spacer"></span><button class="btn" data-act="jwXlsx">${icon('dl')} Excel</button></div>`;
  const tabs=[['bal','Balance with job workers',open.length],['exp','Expected at job workers',exp.length],['bills','Job worker bills',''],['moves','All movements','']];
  let body='';
  if(tab==='bal'){
    const list=(ui.f.jwz?vs:open).filter(m=>!q||norm(m.name+' '+m.list.map(r=>r.desc).join(' ')).includes(q));
    body=list.length?list.map(m=>{const v=vend(m.vendorId)||{id:m.vendorId,name:m.name};const rows=m.list.filter(r=>ui.f.jwz||r.bal>1e-9);
      return `<section class="card jw-card"><div class="card-h">${vendorAvatar(v)}<div><h2>${esc(m.name)}</h2><span class="sub">${m.open} item${m.open===1?'':'s'} unconsumed${seeRates()&&m.value?' · worth '+money0(m.value):''} · ${m.bills} bill${m.bills===1?'':'s'}</span></div>
      <div class="acts"><button class="btn sm primary" data-act="jwBill" data-v="${esc(m.vendorId)}">${icon('doc')} Record bill</button><button class="btn sm" data-act="jwBack" data-v="${esc(m.vendorId)}">${icon('swap')} Return / wastage</button><button class="btn sm" data-act="jwVendor" data-v="${esc(m.vendorId)}">${icon('layers')} Account</button></div></div>
      ${rows.length?`<div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Received</th><th class="num">Used in bills</th><th class="num">Returned</th><th class="num">Wastage</th><th class="num">Unconsumed</th>${seeRates()?'<th class="num">Value</th>':''}</tr></thead><tbody>${rows.map(r=>`<tr><td><div class="who">${thumb({category:r.cat,desc:r.desc},'xs')}<span><b>${esc(r.desc)}</b><small class="muted block">${esc(r.spec||'')}</small></span></div></td><td class="num mono">${fq(r.inQ)}</td><td class="num mono">${fq(r.used)}</td><td class="num mono">${r.ret?fq(r.ret):'—'}</td><td class="num mono">${r.scrap?fq(r.scrap):'—'}</td><td class="num mono"><b class="${r.bal>1e-9?'t-amber':'t-green'}">${fq(r.bal)}</b> <span class="muted small">${esc(r.unit)}</span></td>${seeRates()?`<td class="num mono">${r.value?money0(r.value):'—'}</td>`:''}</tr>`).join('')}</tbody></table></div>`:'<div class="empty sm"><p>All material with this job worker is accounted for.</p></div>'}</section>`}).join(''):
      `<section class="card">${emptyBox(ART.x('store','e-art'),q?'Nothing matches':'No material with job workers',`When a supplier delivers to your job worker (open the PO → Change delivery → To a job worker), or you send material from the HQ store, it shows here until the job worker bills the finished product.`)}</section>`;
    body=`<div class="toolbar pad"><div class="search-inp">${icon('search')}<input class="inp" id="f-jwq" placeholder="Search job worker or item" data-bind="f.jwq" data-rerender="1" value="${esc(ui.f.jwq||'')}"></div><label class="check sm"><input type="checkbox" id="f-jwz" data-bind="f.jwz" data-rerender="1" ${ui.f.jwz?'checked':''}> Show settled items</label></div>`+body;
  }else if(tab==='exp'){
    body=`<section class="card"><div class="card-h"><h2>Supplier POs to be delivered at a job worker</h2></div>${exp.length?`<div class="tw"><table class="t"><thead><tr><th>PO</th><th>Supplier</th><th>Deliver to job worker</th><th>Invoice to</th><th class="num">Items</th><th style="min-width:100px">Received</th><th></th></tr></thead><tbody>${exp.map(p=>`<tr><td><button class="linkish docno" data-act="openPo" data-id="${p.id}">${esc(p.no)}</button><small class="muted block">${fd(p.date)}</small></td><td>${esc(p.vendorName)}</td><td><b>${esc(jwFabName(p))}</b></td><td class="small">${p.jwBillTo==='us'?'Us (free issue)':'Job worker'}</td><td class="num">${(p.lines||[]).length}</td><td>${bar(poProgress(p).pct,'green')}</td><td><button class="btn sm primary" data-act="jwRecv" data-id="${p.id}">${icon('tool')} Record receipt</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty sm"><p>No open purchase order is going to a job worker.</p></div>'}</section>`;
  }else{
    const list=(tab==='bills'?bills:ents).filter(e=>!q||norm([e.no,e.billNo,jwFab(e).name,jwWhat(e),...(e.lines||[]).map(l=>l.desc)].join(' ')).includes(q));
    body=`<div class="toolbar pad"><div class="search-inp">${icon('search')}<input class="inp" id="f-jwq" placeholder="Search" data-bind="f.jwq" data-rerender="1" value="${esc(ui.f.jwq||'')}"></div></div><section class="card">${list.length?`<div class="tw"><table class="t"><thead><tr><th>Entry</th><th>Date</th><th>Job worker</th><th>What</th>${tab==='bills'?`<th>Raw material used</th>${seeRates()?'<th class="num">Bill amount</th>':''}<th>Delivered to</th>`:'<th class="num">Items</th><th class="num">Qty</th>'}<th>Documents</th><th></th></tr></thead><tbody>${list.slice(0,400).map(e=>`<tr class="click ${e.status==='cancelled'?'muted':''}" data-act="jwView" data-id="${e.id}"><td><span class="docno">${esc(jwNo(e))}</span>${e.status==='cancelled'?' <span class="chip red plain">cancelled</span>':''}</td><td class="nowrap">${fd(e.date)}</td><td><b>${esc(jwFab(e).name)}</b></td><td><span class="chip ${JW_TONE[e.type]||''} plain">${esc(JW_TYPE[e.type]||e.type)}</span><small class="muted block">${esc(jwWhat(e))}</small></td>
      ${tab==='bills'?`<td class="small">${(e.lines||[]).filter(l=>num(l.qty)>0).map(l=>`${esc(l.desc)} × ${fq(l.qty)} ${esc(l.unit)}`).join('<br>')||'—'}</td>${seeRates()?`<td class="num mono">${e.amount!=null?money(num(e.amount)*(1+num(e.gst)/100)):'—'}</td>`:''}<td class="small">${esc(jwDeliverLabel(e))}</td>`:`<td class="num">${(e.lines||[]).length}</td><td class="num mono">${fq(sum(e.lines||[],l=>num(l.qty)))}</td>`}
      <td>${(e.docs||[]).length?photoStrip(e.docs):'<span class="muted small">none</span>'}</td><td>${icon('chev')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty sm"><p>No entries yet.</p></div>'}</section>`;
  }
  return `${kpis}${acts}<div class="tabs" role="tablist">${tabs.map(([v,l,n])=>`<button role="tab" aria-selected="${tab===v}" data-act="tab" data-k="jw" data-val="${v}">${l}${n?` <span class="tab-n">${n}</span>`:''}</button>`).join('')}</div>${body}
  <div class="notice info">${icon('help')}<span><b>How it works.</b> Material bought for a job worker (for example switchgear for the panel builder) is received in his name — from the supplier's PO, or sent from the HQ store. When he bills the finished panel, record his bill and tick the material that went into it: that quantity is <b>used</b>, and whatever is left stays here as <b>unconsumed</b> against him until it is used in a later bill, returned to the HQ store, or written off as wastage.</span></div>`;
}
function jwDeliverLabel(e){if(e.type!=='bill') return '';if(e.deliver==='po') return 'Through our PO '+(e.poNo||'');if(e.deliver==='store') return 'HQ store'+(e.grnNo?' · '+e.grnNo:'');if(e.deliver==='site') return projCode(e.projectId)+(e.dispatchNo?' · '+e.dispatchNo:'');return 'Not tracked here'}

/* ---------- modals ---------- */
function jwVendorSel(bind,val,onlyOpen){const V=fabLedger();const list=S.vendors.filter(v=>!onlyOpen||(V[v.id]&&V[v.id].open)).sort((a,b)=>String(a.name).localeCompare(b.name));
  return `<select class="inp" id="${fid(bind)}" data-bind="${bind}" data-rerender="1">${selOpts(list.map(v=>({v:v.id,l:v.name+(V[v.id]&&V[v.id].open?` · ${V[v.id].open} item${V[v.id].open===1?'':'s'} with him`:'')})),val,'Choose job worker')}</select>`}
function jwUseTable(vid,d,label){const rows=jwBalOf(vid);if(!vid) return '<p class="small muted">Choose the job worker to see the material he holds.</p>';
  if(!rows.length) return `<div class="notice warn">${icon('alert')}<span>No unconsumed material is recorded with this job worker.</span></div>`;
  return `<div class="tw"><table class="t"><thead><tr><th>Material with him</th><th class="num">Unconsumed</th><th class="num">${label}</th><th></th></tr></thead><tbody>${rows.map((r,i)=>{const v=d.use[r.itemKey]??'';const over=num(v)>r.bal+1e-9;
    return `<tr><td><div class="who">${thumb({category:r.cat,desc:r.desc},'xs')}<span><b>${esc(r.desc)}</b><small class="muted block">${esc(r.spec||'')}</small></span></div></td><td class="num mono">${fq(r.bal)} ${esc(r.unit)}</td><td class="num"><input class="inp sm qty ${over?'bad':''}" id="ju-${i}" data-bind="modal.d.use.${r.itemKey}" value="${esc(v)}" inputmode="decimal" data-rerender="1"></td><td><button type="button" class="btn sm ghost" data-act="jwUseAll" data-k="${esc(r.itemKey)}" title="Use the full balance">All</button></td></tr>`}).join('')}</tbody></table></div>`}

function jwModal(m,busy){const d=m.d||{};
  switch(m.type){
  case 'jwRecv':{const po=S.pos.find(p=>p.id===m.poId);if(!po) return '';
    return wrap('Received at job worker · '+esc(po.no),`<p class="small muted">From <b>${esc(po.vendorName)}</b> → <b>${esc(jwFabName(po))}</b> (job worker). Supplier's invoice made out to <b>${po.jwBillTo==='us'?'us':'the job worker'}</b>.</p>
    <div class="fields">${field('Received on','modal.d.date',d.date,'type="date"')}${field('Supplier challan no.','modal.d.challan',d.challan)}${field('Invoice no.','modal.d.invoice',d.invoice)}${field('Invoice date','modal.d.invoiceDate',d.invoiceDate,'type="date"')}${field('Vehicle no.','modal.d.vehicle',d.vehicle)}</div>
    <div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Balance on PO</th><th class="num">Received by job worker</th></tr></thead><tbody>${po.lines.map((l,ix)=>{const bal=Math.max(0,num(l.qty)-poRecv(po,l.key));return `<tr><td><div class="who">${thumb({category:l.cat,desc:l.desc},'xs')}<span><b>${esc(l.desc)}</b><small class="muted block">${esc(l.spec||'')}</small></span></div></td><td class="num mono">${fq(bal)} ${esc(l.unit)}</td><td class="num"><input class="inp sm qty" id="jr-${ix}" data-bind="modal.d.recv.${l.key}" value="${esc(d.recv[l.key]??'')}" inputmode="decimal"></td></tr>`}).join('')}</tbody></table></div>
    ${field('Remarks','modal.d.remarks',d.remarks)}<div class="f full"><label>Challan / invoice signed by the job worker (photo or PDF)</label>${photoPicker('modal.d.docs',d.docs,{label:'Upload photo or PDF',doc:true})}</div>`,
    `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveJwRecv" ${busy}>Save receipt</button>`,'wide')}
  case 'jwSend':{const L=storeLedger();const items=Object.values(L).filter(r=>r.bal>1e-9).sort((a,b)=>String(a.desc).localeCompare(b.desc));const s=norm(d.s||'');const shown=items.filter(r=>!s||norm(r.desc+' '+r.spec).includes(s)||num(d.q[r.itemKey])>0);
    return wrap('Send material from HQ store to a job worker',`<div class="fields"><div class="f span2"><label for="f-modal-d-vendorId">Job worker</label>${jwVendorSel('modal.d.vendorId',d.vendorId)}</div>${field('Date','modal.d.date',d.date,'type="date"')}${field('Vehicle no.','modal.d.vehicle',d.vehicle)}</div>
    <div class="f full"><label for="f-modal-d-purpose">For making (finished product)</label>${inp('modal.d.purpose',d.purpose,'placeholder="e.g. 415 V MCC panel for SPS-2"')}</div>
    <div class="search-inp">${icon('search')}<input class="inp" id="f-modal-d-s" placeholder="Search store item" data-bind="modal.d.s" data-rerender="1" value="${esc(d.s||'')}"></div>
    ${shown.length?`<div class="tw" style="max-height:330px"><table class="t"><thead><tr><th>Item in HQ store</th><th class="num">In store</th><th class="num">Send</th></tr></thead><tbody>${shown.map((r,i)=>`<tr><td><div class="who">${thumb({category:r.cat,desc:r.desc},'xs')}<span><b>${esc(r.desc)}</b><small class="muted block">${esc(r.spec||'')}${r.reserved?` · ${fq(r.reserved)} reserved for site demands`:''}</small></span></div></td><td class="num mono">${fq(r.bal)} ${esc(r.unit)}</td><td class="num"><input class="inp sm qty" id="js-${i}" data-bind="modal.d.q.${r.itemKey}" value="${esc(d.q[r.itemKey]??'')}" inputmode="decimal"></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty sm"><p>No material in the HQ store.</p></div>'}
    ${field('Remarks','modal.d.remarks',d.remarks)}`,
    `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveJwSend" ${busy}>${icon('truck')} Save and print challan</button>`,'wide')}
  case 'jwIn':return wrap('Material received by a job worker',`<p class="small muted">Use this when a supplier delivered material to the job worker without a PO in ProcureHub. For a PO, open the PO → Change delivery → To a job worker, then “Record receipt at job worker”.</p>
    <div class="fields"><div class="f span2"><label for="f-modal-d-vendorId">Job worker</label>${jwVendorSel('modal.d.vendorId',d.vendorId)}</div>${field('Received on','modal.d.date',d.date,'type="date"')}${field('Supplier','modal.d.supplier',d.supplier)}${field('Challan no.','modal.d.challan',d.challan)}${field('Invoice no.','modal.d.invoice',d.invoice)}
    <div class="f"><label>Supplier's invoice made out to</label>${seg('billTo',[['fab','Job worker'],['us','Us']],d.billTo,'mset')}</div></div>
    <div class="tw"><table class="t"><thead><tr><th>Item</th><th>Specification</th><th class="num">Qty</th><th>Unit</th><th class="num">Rate excl. GST (optional)</th><th></th></tr></thead><tbody>${d.lines.map((l,i)=>`<tr><td><input class="inp sm" id="ji-d-${i}" data-bind="modal.d.lines.${i}.desc" value="${esc(l.desc)}" list="dl-jwitems"></td><td><input class="inp sm" id="ji-s-${i}" data-bind="modal.d.lines.${i}.spec" value="${esc(l.spec)}"></td><td class="num"><input class="inp sm qty" id="ji-q-${i}" data-bind="modal.d.lines.${i}.qty" value="${esc(l.qty)}" inputmode="decimal"></td><td><select class="inp sm" id="ji-u-${i}" data-bind="modal.d.lines.${i}.unit">${selOpts(UNITS,l.unit)}</select></td><td class="num"><input class="inp sm qty" id="ji-r-${i}" data-bind="modal.d.lines.${i}.rate" value="${esc(l.rate)}" inputmode="decimal"></td><td>${d.lines.length>1?`<button type="button" class="btn sm ghost" data-act="jwInRm" data-i="${i}" aria-label="Remove">${icon('x')}</button>`:''}</td></tr>`).join('')}</tbody></table></div>
    <datalist id="dl-jwitems">${D.items.slice(0,500).map(c=>`<option value="${esc(c.desc)}">`).join('')}</datalist><button type="button" class="btn sm" data-act="jwInAdd">${icon('plus')} Add line</button>
    <div class="f full"><label>Challan / invoice (photo or PDF)</label>${photoPicker('modal.d.docs',d.docs,{label:'Upload photo or PDF',doc:true})}</div>`,
    `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveJwIn" ${busy}>Save</button>`,'wide');
  case 'jwBill':{const vpos=d.vendorId?S.pos.filter(p=>p.vendorId===d.vendorId&&p.status!=='cancelled').sort((a,b)=>(b.at||0)-(a.at||0)):[];const tot=num(d.amount)*(1+num(d.gst)/100);
    return wrap("Record job worker's bill",`<div class="fields"><div class="f span2"><label for="f-modal-d-vendorId">Job worker</label>${jwVendorSel('modal.d.vendorId',d.vendorId)}</div>${field('His bill no.','modal.d.billNo',d.billNo)}${field('Bill date','modal.d.billDate',d.billDate,'type="date"')}</div>
    <h3 class="mt">Finished product billed</h3>
    <div class="fields"><div class="f span2"><label for="f-modal-d-product">Product</label>${inp('modal.d.product',d.product,'placeholder="e.g. 415 V MCC panel complete with switchgear"')}</div>${field('Specification','modal.d.pspec',d.pspec)}${field('Qty','modal.d.pqty',d.pqty,'inputmode="decimal"')}<div class="f"><label for="f-modal-d-punit">Unit</label><select class="inp" id="f-modal-d-punit" data-bind="modal.d.punit">${selOpts(UNITS,d.punit)}</select></div>
    ${seeRates()?`${field('Bill amount excl. GST (₹)','modal.d.amount',d.amount,'inputmode="decimal" data-rerender="1"')}${field('GST %','modal.d.gst',d.gst,'inputmode="decimal" data-rerender="1"')}<div class="f"><label>Bill total</label><div class="inp ro mono">${money(tot)}</div></div>`:''}
    <div class="f span2"><label for="f-modal-d-poId">Against our PO to him (optional)</label><select class="inp" id="f-modal-d-poId" data-bind="modal.d.poId" data-rerender="1">${selOpts(vpos.map(p=>({v:p.id,l:p.no+' · '+fd(p.date)+' · '+(p.lines||[]).length+' items'})),d.poId,'No PO / not linked')}</select></div></div>
    <div class="f"><label>Finished product delivered to</label>${seg('deliver',[...(d.poId?[['po','As per our PO']]:[]),['store','HQ store'],['site','A site'],['none','Not tracked here']],d.deliver,'mset')}</div>
    ${d.deliver==='site'?`<div class="f"><label for="f-modal-d-projectId">Site</label><select class="inp" id="f-modal-d-projectId" data-bind="modal.d.projectId">${selOpts(S.projects.filter(p=>p.status!=='closed').map(p=>({v:p.id,l:projLabel(p.id)})),d.projectId,'Choose site')}</select></div><p class="small muted">The site confirms receipt under “Receive material”, as for any direct delivery.</p>`:d.deliver==='store'?'<p class="small muted">The product is added to HQ store stock as an inward (GRN) and can be sent to sites from there.</p>':d.deliver==='po'?'<p class="small muted">Record its receipt on the PO as usual (HQ store inward or site receipt).</p>':''}
    <h3 class="mt">Raw material used from his balance</h3><p class="small muted">Enter what went into this product. It is taken off his balance; the rest stays with him as unconsumed.</p>
    ${jwUseTable(d.vendorId,d,'Used in this product')}
    ${field('Remarks','modal.d.remarks',d.remarks)}<div class="f full"><label>Copy of his bill (photo or PDF)</label>${photoPicker('modal.d.docs',d.docs,{label:'Upload photo or PDF',doc:true})}</div>`,
    `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveJwBill" ${busy}>Save bill</button>`,'wide')}
  case 'jwBack':return wrap('Return unused material / wastage',`<div class="fields"><div class="f span2"><label for="f-modal-d-vendorId">Job worker</label>${jwVendorSel('modal.d.vendorId',d.vendorId,true)}</div>${field('Date','modal.d.date',d.date,'type="date"')}${d.kind==='return'?field('Challan no.','modal.d.challan',d.challan):''}</div>
    <div class="f"><label>What happened to it</label>${seg('kind',[['return','Returned to HQ store'],['scrap','Wastage / scrap (write off)']],d.kind,'mset')}</div>
    ${jwUseTable(d.vendorId,d,d.kind==='return'?'Returned':'Written off')}
    ${field(d.kind==='return'?'Remarks':'Reason (required)','modal.d.remarks',d.remarks)}<div class="f full"><label>${d.kind==='return'?'Return challan (photo or PDF)':'Supporting document (optional)'}</label>${photoPicker('modal.d.docs',d.docs,{label:'Upload photo or PDF',doc:true})}</div>`,
    `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveJwBack" ${busy}>Save</button>`,'wide');
  case 'jwVendor':{const m2=fabLedger()[m.vid];const v=vend(m.vid)||{name:m2?m2.name:''};
    if(!m2) return wrap(esc(v.name||'Job worker'),'<p>No movements yet.</p>',`<button class="btn" data-act="closeModal">Close</button>`);
    return wrap('Material account · '+esc(v.name),`${m2.list.map(r=>{let bal=0;return `<h3 class="mt">${esc(r.desc)} <small class="muted">${esc(r.spec||'')} · unconsumed <b>${fq(r.bal)} ${esc(r.unit)}</b></small></h3><div class="tw"><table class="t"><thead><tr><th>Date</th><th>Entry</th><th>Details</th><th class="num">In</th><th class="num">Out</th><th class="num">Balance</th></tr></thead><tbody>${r.ent.map(({e,q})=>{const inQ=e.type==='in'?q:0,outQ=e.type==='in'?0:q;bal+=inQ-outQ;return `<tr class="click" data-act="jwView" data-id="${e.id}"><td class="nowrap">${fd(e.date)}</td><td><span class="docno">${esc(jwNo(e))}</span></td><td class="small">${esc(jwWhat(e))}</td><td class="num mono t-green">${inQ?fq(inQ):''}</td><td class="num mono">${outQ?fq(outQ):''}</td><td class="num mono"><b>${fq(Math.round(bal*1000)/1000)}</b></td></tr>`}).join('')}</tbody></table></div>`}).join('')}`,
      `<button class="btn" data-act="jwPrintAcct" data-v="${esc(m.vid)}">${icon('print')} Print statement</button><span class="spacer"></span><button class="btn" data-act="closeModal">Close</button>`,'wide')}
  case 'jwView':{const e=S.jobwork.find(x=>x.id===m.id);if(!e) return wrap('Entry','<p>Not found.</p>','');const f=jwFab(e);
    return wrap(esc(JW_TYPE[e.type]||'Entry')+' · '+esc(jwNo(e)),`<div class="meta"><div><span>Job worker</span><b>${esc(f.name)}</b></div><div><span>Date</span><b>${fd(e.date)}</b></div><div><span>Details</span><b>${esc(jwWhat(e))}</b></div>${e.type==='in'&&e.billTo?`<div><span>Supplier's invoice to</span><b>${e.billTo==='us'?'Us (free issue)':'Job worker'}</b></div>`:''}${e.type==='bill'?`<div><span>Delivered to</span><b>${esc(jwDeliverLabel(e))}</b></div>${seeRates()&&e.amount!=null?`<div><span>Bill amount</span><b>${money(num(e.amount))} + GST ${fq(e.gst)}%</b></div>`:''}`:''}${e.challan||e.invoice?`<div><span>Challan / invoice</span><b>${esc(e.challan||'—')} / ${esc(e.invoice||'—')}</b></div>`:''}${e.status==='cancelled'?'<div><span>Status</span><b class="t-red">Cancelled</b></div>':''}</div>
    ${e.type==='bill'?`<p><b>Product:</b> ${esc(e.product&&e.product.desc||'')} ${e.product&&e.product.spec?'· '+esc(e.product.spec):''} × ${fq(e.product&&e.product.qty)} ${esc(e.product&&e.product.unit||'')}</p>`:''}
    <div class="tw"><table class="t"><thead><tr><th>${e.type==='bill'?'Raw material used':'Item'}</th><th class="num">Qty</th>${seeRates()?'<th class="num">Rate</th>':''}</tr></thead><tbody>${(e.lines||[]).map(l=>`<tr><td><b>${esc(l.desc)}</b><small class="muted block">${esc(l.spec||'')}</small></td><td class="num mono">${fq(l.qty)} ${esc(l.unit)}</td>${seeRates()?`<td class="num mono">${l.rate!=null&&l.rate!==''?money(num(l.rate)):'—'}</td>`:''}</tr>`).join('')||'<tr><td colspan="3" class="muted">No raw material from his balance.</td></tr>'}</tbody></table></div>
    ${e.remarks?`<p class="small">Remarks: ${esc(e.remarks)}</p>`:''}${photoStrip(e.docs)}`,
    `${e.status!=='cancelled'&&actOk('jwCancel')?`<button class="btn danger" data-act="jwCancel" data-id="${e.id}">Cancel entry</button>`:''}<span class="spacer"></span><button class="btn" data-act="jwPrint" data-id="${e.id}">${icon('print')} Print</button><button class="btn" data-act="closeModal">Close</button>`,'wide')}
  }
  return '';
}

/* ---------- documents ---------- */
function jwDoc(e){const b='border:1px solid #c9d3d6;padding:6px 8px;font-size:12.5px;vertical-align:top';const si=storeInfo();const f=jwFab(e);const rates=seeRates();
  const title={in:e.source==='store'?'DELIVERY CHALLAN — GOODS SENT FOR JOB WORK':'MATERIAL RECEIVED BY JOB WORKER',bill:'JOB WORKER BILL — MATERIAL CONSUMPTION',return:'MATERIAL RETURNED FROM JOB WORK',scrap:'WASTAGE / SCRAP AT JOB WORKER'}[e.type];
  const us=`<b>${esc(si.legal||company())}</b><br>${esc(si.name||'')}<br><span style="white-space:pre-line">${esc(si.address||'')}</span>${si.gstin?'<br>GSTIN: '+esc(si.gstin)+(si.state?' · '+esc(si.state)+' ('+esc(si.code)+')':''):''}`;
  const fab=`<b>${esc(f.name)}</b><br><span style="white-space:pre-line">${esc(f.address||f.city||'')}</span>${f.gstin?'<br>GSTIN: '+esc(f.gstin):''}${f.phone?'<br>'+esc(f.phone):''}`;
  const [l1,p1,l2,p2]=e.type==='return'?['From (job worker)',fab,'To (HQ store)',us]:e.type==='in'&&e.source!=='store'?['Supplier',`<b>${esc(e.supplierName||'')}</b>${e.poNo?'<br>PO '+esc(e.poNo):''}`,'Received by (job worker)',fab]:['From',us,'To (job worker)',fab];
  let tv=0;const rows=(e.lines||[]).map((l,i)=>{const r=l.rate!=null&&l.rate!==''?num(l.rate):null;const v=r!=null?r*num(l.qty):null;if(v) tv+=v;return `<tr><td style="${b}">${i+1}</td><td style="${b}">${esc(l.desc)}${l.spec?'<br><span style="color:#465A6D">'+esc(l.spec)+'</span>':''}</td><td style="${b}">${esc(l.hsn||'')}</td><td style="${b};text-align:right">${fq(l.qty)}</td><td style="${b}">${esc(l.unit)}</td>${rates?`<td style="${b};text-align:right">${r!=null?fq(r):''}</td><td style="${b};text-align:right">${v!=null?fq(Math.round(v*100)/100):''}</td>`:''}</tr>`}).join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0F2132;padding:28px;max-width:900px;margin:0 auto"><table style="width:100%"><tr><td><b style="font-size:19px">${esc(company())}</b></td><td style="text-align:right"><b style="font-size:15px;color:#1172C4">${title}</b><br><b>${esc(jwNo(e))}</b><br>Date: ${fd(e.date)}${e.billNo?'<br>Job worker bill: '+esc(e.billNo)+(e.billDate?' dt '+fd(e.billDate):''):''}${e.challan?'<br>Challan: '+esc(e.challan):''}${e.vehicle?'<br>Vehicle: '+esc(e.vehicle):''}</td></tr></table>
  <table style="width:100%;border-collapse:collapse;margin-top:14px"><tr><td style="${b};width:50%"><b>${l1}</b><br>${p1}</td><td style="${b}"><b>${l2}</b><br>${p2}</td></tr></table>
  ${e.type==='bill'?`<p style="font-size:13px"><b>Finished product:</b> ${esc(e.product&&e.product.desc||'')}${e.product&&e.product.spec?' · '+esc(e.product.spec):''} × ${fq(e.product&&e.product.qty)} ${esc(e.product&&e.product.unit||'')}${rates&&e.amount!=null?` · bill amount ${money(num(e.amount))} + GST ${fq(e.gst)}%`:''}<br><b>Raw material supplied to the job worker and used in this product:</b></p>`:e.purpose?`<p style="font-size:13px"><b>For making:</b> ${esc(e.purpose)}</p>`:''}
  <table style="width:100%;border-collapse:collapse;margin-top:10px"><thead><tr style="background:#e9eef2"><th style="${b}">#</th><th style="${b};text-align:left">Description</th><th style="${b}">HSN</th><th style="${b};text-align:right">Qty</th><th style="${b}">Unit</th>${rates?`<th style="${b};text-align:right">Rate (₹)</th><th style="${b};text-align:right">Value (₹)</th>`:''}</tr></thead><tbody>${rows||`<tr><td colspan="7" style="${b}">—</td></tr>`}${rates&&tv?`<tr><td colspan="6" style="${b};text-align:right"><b>Total value</b></td><td style="${b};text-align:right"><b>${fq(Math.round(tv*100)/100)}</b></td></tr>`:''}</tbody></table>
  ${e.type==='in'&&e.source==='store'?'<p style="font-size:12px;margin-top:10px">Goods sent for job work and not for sale. The job worker will use them in the product named above; unused material is to be returned to us.</p>':''}${e.remarks?`<p style="font-size:12px">Remarks: ${esc(e.remarks)}</p>`:''}
  <table style="width:100%;margin-top:46px;font-size:12px"><tr><td>Prepared by</td><td style="text-align:center">Received by (name, sign &amp; stamp)</td><td style="text-align:right">Authorised signatory</td></tr></table></div>`}
function jwAcctDoc(vid){const m=fabLedger()[vid];const v=vend(vid)||{name:m?m.name:''};const b='border:1px solid #c9d3d6;padding:6px 8px;font-size:12.5px';
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#0F2132;padding:28px;max-width:900px;margin:0 auto"><b style="font-size:19px">${esc(company())}</b><div style="font-size:15px;color:#1172C4;margin-top:4px"><b>Statement of our material with ${esc(v.name)}</b> · as on ${fd(today())}</div>
  <table style="width:100%;border-collapse:collapse;margin-top:14px"><thead><tr style="background:#e9eef2"><th style="${b};text-align:left">Item</th><th style="${b}">Unit</th><th style="${b};text-align:right">Received</th><th style="${b};text-align:right">Used in bills</th><th style="${b};text-align:right">Returned</th><th style="${b};text-align:right">Wastage</th><th style="${b};text-align:right">Unconsumed</th></tr></thead><tbody>${(m?m.list:[]).map(r=>`<tr><td style="${b}">${esc(r.desc)}${r.spec?' · '+esc(r.spec):''}</td><td style="${b}">${esc(r.unit)}</td><td style="${b};text-align:right">${fq(r.inQ)}</td><td style="${b};text-align:right">${fq(r.used)}</td><td style="${b};text-align:right">${fq(r.ret)}</td><td style="${b};text-align:right">${fq(r.scrap)}</td><td style="${b};text-align:right"><b>${fq(r.bal)}</b></td></tr>`).join('')}</tbody></table>
  <p style="font-size:12px;margin-top:12px">Please confirm the unconsumed balance above, or let us know of any difference.</p><table style="width:100%;margin-top:46px;font-size:12px"><tr><td>For ${esc(company())}</td><td style="text-align:right">Confirmed by ${esc(v.name)} (sign &amp; stamp)</td></tr></table></div>`}

/* ---------- actions ---------- */
const jwLine=(l,q,extra)=>Object.assign({itemKey:l.itemKey||itemKey(l.desc,l.spec,l.unit),desc:l.desc,spec:l.spec||'',unit:l.unit,cat:l.cat||classify(l.desc,l.spec).cat,qty:q},extra||{});
const jwUseLines=(vid,use)=>{const out=[];for(const r of jwBalOf(vid)){const q=num(use[r.itemKey]);if(q>0) out.push(jwLine(r,q,r.rate!=null?{rate:Math.round(r.rate*100)/100}:{}))}return out};
function jwCheckUse(vid,use){for(const r of jwBalOf(vid)){const q=num(use[r.itemKey]);if(q<0){toast('Quantities cannot be negative.','err');return false}if(q>r.bal+1e-9){toast(`${r.desc}: only ${fq(r.bal)} ${r.unit} is with this job worker.`,'err');return false}}return true}
A.jwView=d=>openModal({type:'jwView',id:d.id,prev:ui.modal&&ui.modal.type==='jwVendor'?ui.modal:null});
A.jwVendor=d=>openModal({type:'jwVendor',vid:d.v});
A.jwPrint=d=>{const e=S.jobwork.find(x=>x.id===d.id);if(e) printHtml(jwNo(e),jwDoc(e))};
A.jwPrintAcct=d=>printHtml('Material with '+((vend(d.v)||{}).name||'job worker'),jwAcctDoc(d.v));
A.jwUseAll=d=>{const r=jwBalOf(ui.modal.d.vendorId).find(x=>x.itemKey===d.k);if(r){ui.modal.d.use[d.k]=String(r.bal);render()}};

A.jwRecv=d=>{const po=S.pos.find(p=>p.id===(d.id||ui.param));if(!po) return;if(!poIsApproved(po)){toast('This PO is waiting for approval by the Director (Procurement).','err');return}const recv={};for(const l of po.lines){const b=Math.max(0,num(l.qty)-poRecv(po,l.key));recv[l.key]=b?String(b):''}
  openModal({type:'jwRecv',poId:po.id,d:{date:today(),challan:'',invoice:'',invoiceDate:'',vehicle:'',remarks:'',recv,docs:[]}})};
A.saveJwRecv=async()=>{const m=ui.modal;const po=S.pos.find(p=>p.id===m.poId);const d=m.d;if(!po) return;
  for(const l of po.lines){const q=num(d.recv[l.key]);if(q<0){toast('Quantities cannot be negative.','err');return}}
  const lines=po.lines.map(l=>({l,q:num(d.recv[l.key])})).filter(x=>x.q>0).map(({l,q})=>jwLine(Object.assign({},l,{itemKey:l.itemKey||itemKey(l.desc,l.spec,l.unit)}),q,{key:l.key,rate:num(l.rate),gst:num(l.gst),hsn:l.hsn||''}));
  if(!lines.length){toast('Enter the quantity received by the job worker.','err');return}
  const fab=vend(po.shipToVendorId)||{};
  const ok=await run(async()=>{const no=await allocNo('JW',S.jobwork);await setDoc('jobwork',newId(),{no,type:'in',source:'po',vendorId:po.shipToVendorId,vendorName:fab.name||po.shipToVendorName||'',poId:po.id,poNo:po.no,supplierId:po.vendorId,supplierName:po.vendorName,billTo:po.jwBillTo||'fab',
      date:d.date||today(),challan:d.challan||'',invoice:d.invoice||'',invoiceDate:d.invoiceDate||'',vehicle:d.vehicle||'',remarks:d.remarks||'',docs:d.docs||[],lines,at:Date.now(),by:ui.uid||null});
    const received=Object.assign({},po.received||{});for(const l of lines) received[l.key]=num(received[l.key])+l.qty;await updDoc('pos',po.id,{received});return no});
  if(ok!==false){closeModal();toast(ok+' saved. Material is now shown with '+(fab.name||'the job worker')+'.')}};

A.jwSend=d=>openModal({type:'jwSend',d:{vendorId:d&&d.v||'',date:today(),vehicle:'',purpose:'',remarks:'',s:'',q:{}}});
A.saveJwSend=async()=>{const d=ui.modal.d;if(!vend(d.vendorId)){toast('Choose the job worker.','err');return}const L=storeLedger();const lines=[];
  for(const [k,v] of Object.entries(d.q)){const q=num(v);if(!q) continue;const r=L[k];if(!r||q<0){toast('Quantities cannot be negative.','err');return}if(q>r.bal+1e-9){toast(`${r.desc}: only ${fq(r.bal)} ${r.unit} in the HQ store.`,'err');return}
    const rt=jwRate(k);lines.push(jwLine(r,q,rt?{rate:rt.rate,gst:rt.gst,hsn:rt.hsn||itemHsn(r.desc)||''}:{hsn:itemHsn(r.desc)||''}))}
  if(!lines.length){toast('Enter the quantity to send.','err');return}
  const id=newId();const fab=vend(d.vendorId);
  const ok=await run(async()=>{const no=await allocNo('JW',S.jobwork);await setDoc('jobwork',id,{no,type:'in',source:'store',vendorId:fab.id,vendorName:fab.name||'',date:d.date||today(),vehicle:d.vehicle||'',purpose:String(d.purpose||'').trim(),remarks:d.remarks||'',docs:[],lines,at:Date.now(),by:ui.uid||null});return no});
  if(ok!==false){toast(ok+' saved. HQ store stock reduced; material shown with '+fab.name+'.');openModal({type:'jwView',id});const e=S.jobwork.find(x=>x.id===id);if(e) printHtml(e.no,jwDoc(e))}};

A.jwIn=d=>openModal({type:'jwIn',d:{vendorId:d&&d.v||'',date:today(),supplier:'',challan:'',invoice:'',billTo:'fab',docs:[],lines:[{desc:'',spec:'',unit:'Nos',qty:'',rate:''}]}});
A.jwInAdd=()=>{ui.modal.d.lines.push({desc:'',spec:'',unit:'Nos',qty:'',rate:''});render()};
A.jwInRm=d=>{ui.modal.d.lines.splice(+d.i,1);render()};
A.saveJwIn=async()=>{const d=ui.modal.d;if(!vend(d.vendorId)){toast('Choose the job worker.','err');return}
  const ls=d.lines.filter(l=>String(l.desc).trim()||num(l.qty)>0);if(!ls.length){toast('Enter at least one item.','err');return}
  for(const l of ls){if(!String(l.desc).trim()){toast('Enter the item name on every line.','err');return}if(!(num(l.qty)>0)){toast(`Enter the quantity for ${l.desc}.`,'err');return}}
  const fab=vend(d.vendorId);const lines=ls.map(l=>{const desc=String(l.desc).trim(),spec=String(l.spec||'').trim();return jwLine({desc,spec,unit:l.unit||'Nos'},num(l.qty),Object.assign({hsn:itemHsn(desc)||''},String(l.rate??'').trim()!==''?{rate:num(l.rate)}:{}))});
  const ok=await run(async()=>{const no=await allocNo('JW',S.jobwork);await setDoc('jobwork',newId(),{no,type:'in',source:'other',vendorId:fab.id,vendorName:fab.name||'',supplierName:String(d.supplier||'').trim(),billTo:d.billTo==='us'?'us':'fab',date:d.date||today(),challan:d.challan||'',invoice:d.invoice||'',remarks:'',docs:d.docs||[],lines,at:Date.now(),by:ui.uid||null});return no});
  if(ok!==false){closeModal();toast(ok+' saved.')}};

A.jwBill=d=>{const vid=d&&d.v||'';openModal({type:'jwBill',d:{vendorId:vid,billNo:'',billDate:today(),product:'',pspec:'',pqty:'1',punit:'Nos',amount:'',gst:'18',poId:'',deliver:'store',projectId:'',use:{},remarks:'',docs:[]}})};
A.saveJwBill=async()=>{const d=ui.modal.d;const fab=vend(d.vendorId);if(!fab){toast('Choose the job worker.','err');return}
  if(!String(d.billNo).trim()){toast("Enter the job worker's bill number.",'err');return}
  if(!String(d.product).trim()){toast('Enter the finished product billed.','err');return}
  if(!(num(d.pqty)>0)){toast('Enter the product quantity.','err');return}
  if(seeRates()&&String(d.gst??'').trim()!==''&&!(num(d.gst)>=0&&num(d.gst)<=100)){toast('GST % must be between 0 and 100.','err');return}
  if(!jwCheckUse(d.vendorId,d.use)) return;const lines=jwUseLines(d.vendorId,d.use);
  if(!lines.length&&jwBalOf(d.vendorId).length){toast('Enter the raw material from his balance used in this product.','err');return}
  const deliver=d.deliver==='po'&&!d.poId?'store':d.deliver;if(deliver==='site'&&!proj(d.projectId)){toast('Choose the site the product was delivered to.','err');return}
  const po=d.poId?S.pos.find(p=>p.id===d.poId):null;const product={desc:String(d.product).trim(),spec:String(d.pspec||'').trim(),qty:num(d.pqty),unit:d.punit||'Nos'};
  const pk=itemKey(product.desc,product.spec,product.unit);const id=newId();
  const ok=await run(async()=>{const no=await allocNo('JC',S.jobwork);const e={no,type:'bill',vendorId:fab.id,vendorName:fab.name||'',billNo:String(d.billNo).trim(),billDate:d.billDate||today(),date:d.billDate||today(),product,poId:po?po.id:null,poNo:po?po.no:'',deliver,projectId:deliver==='site'?d.projectId:null,remarks:d.remarks||'',docs:d.docs||[],lines,at:Date.now(),by:ui.uid||null};
    if(seeRates()&&String(d.amount??'').trim()!==''){e.amount=num(d.amount);e.gst=num(d.gst)}
    if(deliver==='store'){e.grnId=newId();e.grnNo=await allocNo('GRN',S.grns)}
    if(deliver==='site'){e.dispatchId=newId();e.dispatchNo=await allocNo('DD',S.dispatches)}
    await setDoc('jobwork',id,e);
    const pl=Object.assign({},product,{cat:classify(product.desc,product.spec).cat,itemKey:pk});
    if(deliver==='store'){const gl={key:'L1',desc:pl.desc,spec:pl.spec,unit:pl.unit,cat:pl.cat,itemKey:pk,recv:pl.qty,rej:0,acc:pl.qty,hsn:itemHsn(pl.desc)||''};if(e.amount!=null){gl.rate=Math.round(e.amount/pl.qty*100)/100;gl.gst=e.gst}
      await setDoc('grns',e.grnId,{no:e.grnNo,poId:null,type:'jobwork',jwId:id,date:e.billDate,party:fab.name||'',partyGstin:String(fab.gstin||'').toUpperCase(),invoice:e.billNo,invoiceDate:e.billDate,challan:'',vehicle:'',remarks:'Finished product from job worker · '+no,photos:e.docs,lines:[gl],at:Date.now(),by:ui.uid||null})}
    if(deliver==='site') await setDoc('dispatches',e.dispatchId,{no:e.dispatchNo,type:'direct',projectId:d.projectId,poId:null,jwId:id,vendorName:fab.name||'',date:e.billDate,expectedDate:'',status:'ordered',at:Date.now(),lines:[{itemKey:pk,desc:pl.desc,spec:pl.spec,unit:pl.unit,cat:pl.cat,qty:pl.qty,recvQty:null}]});
    return no});
  if(ok!==false){closeModal();toast(ok+' saved. '+(lines.length?'Raw material marked as used; the rest stays with '+fab.name+' as unconsumed.':'Bill recorded.'))}};

A.jwBack=d=>openModal({type:'jwBack',d:{vendorId:d&&d.v||'',kind:'return',date:today(),challan:'',remarks:'',use:{},docs:[]}});
A.saveJwBack=async()=>{const d=ui.modal.d;const fab=vend(d.vendorId);if(!fab){toast('Choose the job worker.','err');return}
  if(!jwCheckUse(d.vendorId,d.use)) return;const lines=jwUseLines(d.vendorId,d.use);if(!lines.length){toast('Enter the quantity.','err');return}
  if(d.kind==='scrap'&&!String(d.remarks||'').trim()){toast('Enter the reason for the wastage / scrap.','err');return}
  const ok=await run(async()=>{const no=await allocNo('JW',S.jobwork);await setDoc('jobwork',newId(),{no,type:d.kind==='scrap'?'scrap':'return',vendorId:fab.id,vendorName:fab.name||'',date:d.date||today(),challan:d.challan||'',remarks:String(d.remarks||'').trim(),docs:d.docs||[],lines,at:Date.now(),by:ui.uid||null});return no});
  if(ok!==false){closeModal();toast(ok+' saved.'+(d.kind==='return'?' HQ store stock updated.':''))}};

A.jwCancel=d=>{const e=S.jobwork.find(x=>x.id===d.id);if(!e) return;
  if(e.type==='bill'&&e.grnId&&S.grns.some(g=>g.id===e.grnId)){const L=storeLedger();const k=itemKey(e.product.desc,e.product.spec,e.product.unit);if(!L[k]||L[k].bal<num(e.product.qty)-1e-9){toast('The finished product has already been sent out of the HQ store, so this bill cannot be cancelled.','err');return}}
  if(e.type==='bill'&&e.dispatchId){const x=S.dispatches.find(x=>x.id===e.dispatchId);if(x&&x.status!=='ordered'&&x.status!=='cancelled'){toast('The site has already received the product, so this bill cannot be cancelled.','err');return}}
  if(e.type==='return'){const L=storeLedger();for(const l of e.lines||[]){const r=L[l.itemKey];if(!r||r.bal<num(l.qty)-1e-9){toast(`${l.desc} returned with this entry has already gone out of the HQ store.`,'err');return}}}
  if(e.type==='in'&&e.source==='po'){const po=S.pos.find(p=>p.id===e.poId);if(po&&po.status==='cancelled'){toast('The PO is cancelled.','err');return}}
  confirmBox({title:'Cancel '+jwNo(e),body:e.type==='in'?'The material is taken off the job worker\'s balance'+(e.source==='store'?' and goes back into HQ store stock.':e.source==='po'?' and the PO shows it as not yet received.':'.'):e.type==='bill'?'The raw material goes back to the job worker\'s unconsumed balance'+(e.grnId?', and the finished product is taken out of HQ store stock.':e.dispatchId?', and the delivery waiting at the site is cancelled.':'.'):'The quantity goes back to the job worker\'s balance.',yes:'Cancel entry',danger:true,onYes:async()=>{
    const ok=await run(async()=>{await updDoc('jobwork',e.id,{status:'cancelled',cancelledAt:Date.now(),cancelledBy:ui.uid||null});
      if(e.type==='in'&&e.source==='po'){const po=S.pos.find(p=>p.id===e.poId);if(po){const received=Object.assign({},po.received||{});for(const l of e.lines||[]) if(l.key) received[l.key]=Math.max(0,num(received[l.key])-num(l.qty));await updDoc('pos',po.id,{received})}}
      const g=e.type==='bill'&&e.grnId&&S.grns.find(g=>g.id===e.grnId);if(g) await updDoc('grns',g.id,{cancelled:true,remarks:'Cancelled with job worker bill '+jwNo(e),lines:(g.lines||[]).map(l=>Object.assign({},l,{acc:0,rej:num(l.recv)}))});
      if(e.type==='bill'&&e.dispatchId&&S.dispatches.some(x=>x.id===e.dispatchId&&x.status==='ordered')) await updDoc('dispatches',e.dispatchId,{status:'cancelled',cancelledAt:Date.now(),note:'Job worker bill cancelled'})},'Entry cancelled');
    if(ok!==false) closeModal()}})};

A.jwXlsx=()=>{const V=fabLedger();const bal=[['Job worker','Item','Specification','Unit','Received','Used in bills','Returned','Wastage / scrap','Unconsumed balance',...(seeRates()?['Rate','Unconsumed value']:[])]];
  for(const m of Object.values(V).sort((a,b)=>String(a.name).localeCompare(b.name))) for(const r of m.list) bal.push([m.name,r.desc,r.spec,r.unit,r.inQ,r.used,r.ret,r.scrap,r.bal,...(seeRates()?[r.rate!=null?Math.round(r.rate*100)/100:'',Math.round(r.value*100)/100]:[])]);
  const mv=[['Entry no','Date','Job worker','Entry','Details','Supplier invoice to','Job worker bill no','Finished product','Product qty','Item','Specification','Unit','Qty','Status']];
  for(const e of S.jobwork.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.at||0)-(b.at||0))) for(const l of (e.lines&&e.lines.length?e.lines:[{}])) mv.push([e.no||'',e.date||'',jwFab(e).name,JW_TYPE[e.type]||e.type,jwWhat(e),e.billTo==='us'?'Us':e.billTo==='fab'?'Job worker':'',e.billNo||'',e.product?e.product.desc:'',e.product?e.product.qty:'',l.desc||'',l.spec||'',l.unit||'',l.qty!=null?num(l.qty):'',e.status==='cancelled'?'Cancelled':'Active']);
  saveXlsx('material-with-job workers-'+today()+'.xlsx',[{name:'Balance with job workers',rows:bal},{name:'Movements',rows:mv}])};
