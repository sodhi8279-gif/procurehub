'use strict';
/* Dispatch status of a PO (9.13.0).
   In the PO list every PO shows whether the vendor has dispatched the material:
     - a truck with a red cross: "Not dispatched", with the days since the PO;
     - a green truck: "Dispatched" to the site / HQ store, with the vehicle and the days since.
   Direct-to-site POs use their site deliveries (Vendor dispatched on the delivery).
   POs to the HQ store or a job worker are dispatched when HQ marks "Vendor dispatched"
   on the PO (vehicle, LR / e-way bill, expected date) or when a goods receipt is made. */

const dsDays=t=>t?Math.max(0,Math.floor((Date.now()-t)/864e5)):null;
const dsDayTxt=n=>n==null?'':n===0?'today':n===1?'1 day':n+' days';
const dsDateMs=iso=>iso?new Date(iso+'T00:00:00').getTime():0;

// {sent, part, k, n, at, from, veh[], to, recv}
function poDisp(p){if(!p||p.status==='cancelled') return null;const poAt=dsDateMs(p.date)||p.at||0;
  if(p.deliveryMode==='site'){
    const ds=((D.poDispatches&&D.poDispatches[p.id])||S.dispatches.filter(x=>x.poId===p.id)).filter(x=>x.status!=='cancelled');
    const sent=ds.filter(x=>x.status&&x.status!=='ordered');
    if(!sent.length) return {sent:false,from:poAt,to:'site',n:ds.length};
    return {sent:true,part:sent.length<ds.length,k:sent.length,n:ds.length,at:Math.min(...sent.map(x=>x.shippedAt||x.receivedAt||x.at||Date.now())),
      veh:[...new Set(sent.map(x=>String(x.vehicle||'').trim()).filter(Boolean))],to:'site',recv:sent.length===ds.length&&sent.every(x=>x.receivedAt)}}
  const gs=S.grns.filter(g=>g.poId===p.id);const to=p.deliveryMode==='vendor'?'job worker':'HQ store';
  if(p.vship||gs.length){const t=p.vship&&p.vship.at?p.vship.at:dsDateMs(gs.map(g=>g.date).sort()[0])||Date.now();
    return {sent:true,at:t,veh:[...new Set([p.vship&&p.vship.vehicle,...gs.map(g=>g.vehicle)].map(v=>String(v||'').trim()).filter(Boolean))],to,recv:poProgress(p).pct>=0.9999}}
  return {sent:false,from:poAt,to}}

function poDispCell(p){const s=poDisp(p);if(!s) return '<span class="muted small">—</span>';
  if(!s.sent){const d=dsDays(s.from);
    return `<div class="disp-st no" title="The vendor has not dispatched the material yet"><span class="disp-ic" aria-hidden="true">${icon('truck')}<i>${icon('x','xs')}</i></span><span><b>Not dispatched</b><small>${d==null?'':d===0?'PO today':dsDayTxt(d)+' since PO'}</small></span></div>`}
  const d=dsDays(s.at);
  return `<div class="disp-st ok" title="Dispatched by the vendor to the ${esc(s.to)}"><span class="disp-ic" aria-hidden="true">${icon('truck')}</span><span><b>${s.recv?'Delivered':s.part?`Dispatched ${s.k} of ${s.n}`:'Dispatched'}</b><small>to ${esc(s.to)}${s.veh.length?' · <span class="mono">'+esc(s.veh.join(', '))+'</span>':''}</small>${s.recv?'':`<small>${d===0?'today':dsDayTxt(d)+' ago'}</small>`}</span></div>`}

/* ---- HQ store / job worker POs: mark that the vendor has dispatched ---- */
const vsCan=po=>ui.role==='hq'&&po&&po.status!=='cancelled'&&po.deliveryMode!=='site'&&(can('po_issue')||can('store')||(ui.me&&ui.me.admin));
function poVshipBtn(po){if(!vsCan(po)||poProgress(po).pct>=0.9999) return '';
  return `<button class="btn sm ${po.vship?'':'primary'}" data-act="poVship">${icon('truck')} ${po.vship?'Dispatch details':'Vendor dispatched'}</button>`}
A.poVship=()=>{const po=poOf();if(!po) return;const x=po.vship||{};
  openModal({type:'poVship',id:po.id,d:{vehicle:x.vehicle||'',driver:x.driver||'',lrNo:x.lrNo||'',expectedDate:x.expectedDate||today()}})};
{const prev=v6Modal;v6Modal=(m,busy)=>{if(m.type!=='poVship') return prev(m,busy);const po=S.pos.find(p=>p.id===m.id);if(!po) return '';const d=m.d;
  return wrap('Vendor has dispatched · '+esc(po.no),`<p class="small muted">For material coming to the ${po.deliveryMode==='vendor'?'job worker':'HQ store'}. The PO list then shows it as dispatched; the goods receipt is made as usual when it arrives.</p>
    <div class="fields">${field('Vehicle no.','modal.d.vehicle',d.vehicle,'placeholder="e.g. HP 72 B 1234"')}${field('Driver & phone','modal.d.driver',d.driver)}${field('LR / e-way bill','modal.d.lrNo',d.lrNo)}${field('Expected arrival','modal.d.expectedDate',d.expectedDate,'type="date"')}</div>`,
    `${po.vship?`<button class="btn danger" data-act="poVshipClear" ${busy}>Not dispatched</button><span class="spacer"></span>`:''}<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="poVshipSave" ${busy}>${icon('check')} Save</button>`)}}
A.poVshipSave=async()=>{const m=ui.modal;const po=S.pos.find(p=>p.id===m.id);if(!po) return;const d=m.d;const vehicle=String(d.vehicle||'').trim();
  if(!vehicle&&!String(d.lrNo||'').trim()){toast('Enter the vehicle no. or the LR / e-way bill.','err');return}
  const vs={at:(po.vship&&po.vship.at)||Date.now(),vehicle,driver:String(d.driver||'').trim(),lrNo:String(d.lrNo||'').trim(),expectedDate:d.expectedDate||'',byName:(ui.me&&ui.me.name)||''};
  if(await run(()=>updDoc('pos',po.id,{vship:vs}),'Marked as dispatched by the vendor')) closeModal()};
A.poVshipClear=async()=>{const m=ui.modal;if(await run(()=>updDoc('pos',m.id,{vship:null}),'Marked as not dispatched')) closeModal()};
