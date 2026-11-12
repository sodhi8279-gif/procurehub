/* ================= 7.0 · EXTRA CHARGES, ROUND OFF & EMERGENCY PURCHASE =================
   Extra charges on a quotation (and the PO made from it):
     • before tax — loading, unloading, packing, cutting… GST is charged on them at their own GST %
     • after tax  — added to the bill as they are, no GST
   Round off: none, automatic to the nearest rupee, or a manual amount.

   Emergency purchase: HQ settles the rate with a registered vendor offline, buys the
   material and enters it here. One entry makes the site's demand (marked EMERGENCY,
   already approved), the PO (delivery direct to the site) and the consignment the site
   receives. After that everything works as for any other PO.
*/
const CHG_SUGGEST=['Loading & unloading','Loading charges','Unloading charges','Packing & forwarding','Cutting charges','Testing charges','Handling charges','Cartage / local transport','Insurance','Crane / hydra charges','Other charges'];
function chargeList(o){return (o&&Array.isArray(o.charges)?o.charges:[]).filter(c=>num(c.amt)!==0)}
// full bill: basic + before-tax charges + GST (items and charges) + freight + after-tax charges + round off
function withCharges(o,basic,gst,fr){const cs=chargeList(o);const bef=cs.filter(c=>c.when!=='after'),aft=cs.filter(c=>c.when==='after');
  const before=sum(bef,c=>num(c.amt)),cgst=sum(bef,c=>num(c.amt)*num(c.gst)/100),after=sum(aft,c=>num(c.amt));
  const pre=basic+before+gst+cgst+num(fr)+after;const ro=o&&o.roundAuto?Math.round(pre)-pre:num(o&&o.roundOff);
  return {basic,itemGst:gst,cgst,gst:gst+cgst,freight:num(fr),fr:num(fr),before,after,taxable:basic+before,roundOff:Math.round(ro*100)/100,total:Math.round((pre+ro)*100)/100,extra:before+cgst+after+ro,charges:cs}}
const roMode=o=>o.roMode||(o.roundAuto?'auto':num(o.roundOff)?'manual':'none');
// the editor used on the quotation form and the emergency purchase form; base = data-bind path of the object
function chargesBox(base,o,t){o.charges=o.charges||[];const mode=roMode(o);const p=base.replace(/\./g,'-');
  return `<fieldset class="chg-box"><legend>${icon('plus','xs')} Extra charges &amp; round off <span class="muted small">(optional)</span></legend>
  <datalist id="chg-sug">${CHG_SUGGEST.map(s=>`<option value="${esc(s)}">`).join('')}</datalist><datalist id="gst-slabs-c">${GST_SLABS.map(g=>`<option value="${g}">`).join('')}</datalist>
  ${o.charges.length?`<div class="tw"><table class="t chg"><thead><tr><th>Charge for</th><th>Added</th><th class="num">Amount (₹)</th><th class="num">GST %</th><th></th></tr></thead><tbody>${o.charges.map((c,i)=>`<tr>
    <td><input class="inp sm" id="${p}-cl-${i}" data-bind="${base}.charges.${i}.label" value="${esc(c.label||'')}" list="chg-sug" placeholder="e.g. Loading & unloading"></td>
    <td><select class="inp sm auto" id="${p}-cw-${i}" data-bind="${base}.charges.${i}.when"><option value="before" ${c.when!=='after'?'selected':''}>Before tax (GST charged)</option><option value="after" ${c.when==='after'?'selected':''}>After tax (no GST)</option></select></td>
    <td class="num"><input class="inp sm rate" id="${p}-ca-${i}" data-bind="${base}.charges.${i}.amt" value="${esc(c.amt??'')}" inputmode="decimal" data-rerender="1"></td>
    <td class="num">${c.when==='after'?'<span class="muted small">—</span>':`<input class="inp sm gst" id="${p}-cg-${i}" data-bind="${base}.charges.${i}.gst" value="${esc(c.gst??'')}" inputmode="decimal" list="gst-slabs-c" data-rerender="1">`}</td>
    <td><button type="button" class="btn sm ghost" data-act="chgRm" data-b="${base}" data-i="${i}" aria-label="Remove charge">${icon('trash','xs')}</button></td></tr>`).join('')}</tbody></table></div>`:''}
  <div class="row"><button type="button" class="btn sm" data-act="chgAdd" data-b="${base}">${icon('plus','xs')} Add charge</button><span class="small muted">Loading, unloading, packing, cutting, testing… Before tax: GST is added on it. After tax: added to the total as it is.</span></div>
  <div class="row ro-row"><b class="small">Round off</b><div class="seg" role="group">${[['none','None'],['auto','Nearest ₹'],['manual','Enter amount']].map(([v,l])=>`<button type="button" data-act="roSet" data-b="${base}" data-val="${v}" aria-pressed="${mode===v}">${l}</button>`).join('')}</div>
   ${mode==='manual'?`<input class="inp sm rate" id="${p}-ro" data-bind="${base}.roundOff" value="${esc(o.roundOff??'')}" inputmode="decimal" data-rerender="1" placeholder="e.g. -0.40" aria-label="Round off amount">`:''}</div>
  ${t?billSummary(t):''}</fieldset>`}
function billSummary(t){const r=(l,v,b)=>`<tr${b?' class="tot"':''}><td>${l}</td><td class="num mono">${b?'<b>'+fq(v)+'</b>':fq(v)}</td></tr>`;
  return `<table class="t bill-sum"><tbody>${r('Basic value',t.basic)}${t.before?r('Extra charges before tax',t.before)+r('Taxable value',t.taxable):''}${r('GST'+(t.cgst?' (incl. '+fq(Math.round(t.cgst*100)/100)+' on charges)':''),Math.round(t.gst*100)/100)}${t.freight?r('Freight',t.freight):''}${t.after?r('Extra charges after tax',t.after):''}${t.roundOff?r('Round off',t.roundOff):''}${r('Grand total',t.total,1)}</tbody></table>`}
A.chgAdd=d=>{const o=getPath(d.b);if(!o) return;(o.charges=o.charges||[]).push({label:'',amt:'',when:'before',gst:String(o.gst!=null&&o.gst!==''?o.gst:18)});render();setTimeout(()=>{const el=document.getElementById(d.b.replace(/\./g,'-')+'-cl-'+(o.charges.length-1));el&&el.focus()},30)};
A.chgRm=d=>{const o=getPath(d.b);if(!o||!o.charges) return;o.charges.splice(+d.i,1);render()};
A.roSet=d=>{const o=getPath(d.b);if(!o) return;o.roMode=d.val;render()};
// cleaned charges and round off for saving; throws a message the user can act on
function chargesOut(o){const out=[];for(const c of o.charges||[]){const amt=num(c.amt);const label=String(c.label||'').trim();if(!amt) continue;
    if(!label) throw {message:'Write what each extra charge is for (e.g. Loading & unloading).'};
    const when=c.when==='after'?'after':'before';const g=when==='after'?0:num(c.gst);if(when==='before'&&(String(c.gst??'').trim()===''||!(g>=0&&g<=100))) throw {message:`GST % for ${label} must be between 0 and 100.`};
    out.push({label:label.slice(0,80),amt:Math.round(amt*100)/100,when,gst:g})}
  const mode=roMode(o);const ro=mode==='manual'?num(o.roundOff):0;if(Math.abs(ro)>1000) throw {message:'Round off can be at most ₹1,000.'};
  return {charges:out,roundAuto:mode==='auto',roundOff:Math.round(ro*100)/100}}
// GST of before-tax charges, by rate (for the PO's GST summary)
function chargeGstSplit(o){const m={};for(const c of chargeList(o)) if(c.when!=='after'&&num(c.gst)) m[num(c.gst)]=(m[num(c.gst)]||0)+num(c.amt)*num(c.gst)/100;return m}
// lines on the printed PO between "Basic value" and "Total"
function poChargeRows(po,b,cols){const t=poTotals(po);const td=(l,v)=>`<tr><td colspan="${cols}" style="${b};text-align:right">${l}</td><td style="${b};text-align:right">${fq(v)}</td></tr>`;
  const cs=chargeList(po);return {before:cs.filter(c=>c.when!=='after').map(c=>td(esc(c.label)+(num(c.gst)?` <span style="color:#465A6D">(GST ${fq(c.gst)}%)</span>`:''),num(c.amt))).join('')+(t.before?td('<b>Taxable value</b>',t.taxable):''),
    after:cs.filter(c=>c.when==='after').map(c=>td(esc(c.label),num(c.amt))).join('')+(t.roundOff?td('Round off',t.roundOff):'')}}

/* ---------------- who may enter an emergency purchase ---------------- */
function canEmg(){const me=ui.me;if(!me||me.role!=='hq'||ui.role!=='hq') return false;if(me.admin) return true;const a=me.access||{};return can('emergency_purchase')||can('po_approve')||String(a.role||'').trim().toLowerCase()==='purchase manager'}
const emgBtn=(cls='')=>canEmg()?`<button class="btn emg-btn ${cls}" data-act="emgNew" title="Material bought on rates settled offline: makes the site's demand, the PO and the delivery to site in one step">${icon('alert')} Emergency purchase</button>`:'';
const emgChip=x=>x&&x.emergency?`<span class="chip emg">${icon('alert','xs')} Emergency purchase</span>`:'';

/* ---------------- the form ---------------- */
const emgBlank=()=>({desc:'',spec:'',qty:'',unit:'Nos',rate:'',gst:'',hsn:'',category:'',note:''});
A.emgNew=()=>{if(!canEmg()){toast('Only the Purchase manager, the Director (Procurement) or the administrator can enter an emergency purchase.','err');return}
  openModal({type:'emg',d:{projectId:(ui.view==='demands'&&ui.f.dp)||'',vendorId:'',date:today(),requestedBy:'',reason:'',quoteRef:'',quoteDate:today(),files:[],deliveryDays:'',payment:'',freight:'',charges:[],roMode:'auto',roundOff:'',gst:'18',lines:[emgBlank()],shipped:false,vehicle:'',driver:'',lrNo:''}})};
A.emgAddLine=()=>{ui.modal.d.lines.push(emgBlank());render();setTimeout(()=>{const el=document.getElementById('emg-d-'+(ui.modal.d.lines.length-1));el&&el.focus()},30)};
A.emgRmLine=d=>{const L=ui.modal.d.lines;L.splice(+d.i,1);if(!L.length) L.push(emgBlank());render()};
A.emgShip=()=>{ui.modal.d.shipped=!ui.modal.d.shipped;render()};
// picking a catalogue item fills its unit, GST %, HSN and category
CH.emgItem=el=>{const m=ui.modal;if(!m||m.type!=='emg') return;const l=m.d.lines[+el.dataset.i];if(!l) return;const it=D.itemMap[slug(l.desc)];
  if(it){if(it.unit) l.unit=it.unit;if(it.gst!=null&&it.gst!==''&&String(l.gst).trim()==='') l.gst=String(it.gst);if(it.hsn&&!l.hsn) l.hsn=it.hsn;l.category=it.category||''}
  if(String(l.gst).trim()==='') l.gst=String(m.d.gst||18);render()};
CH.emgVendor=()=>{const m=ui.modal;const v=vend(m.d.vendorId);if(v&&!m.d.payment) m.d.payment=v.payment||'';render()};
function emgTotals(d){let b=0,g=0;for(const l of d.lines){const a=num(l.qty)*num(l.rate);b+=a;g+=a*num(l.gst)/100}return withCharges({charges:d.charges,roundAuto:roMode(d)==='auto',roundOff:roMode(d)==='manual'?d.roundOff:0},b,g,d.freight)}
function emgModal(m,busy){const d=m.d;const t=emgTotals(d);const v=vend(d.vendorId);const p=proj(d.projectId);
  const items=(D.items||[]).filter(i=>!i.hidden);
  const vOpts=selOpts(S.vendors.slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(x=>({v:x.id,l:x.name+(x.city?' · '+x.city:'')})),d.vendorId,'— choose a registered vendor —');
  const pOpts=selOpts(S.projects.filter(x=>x.active!==false&&(isAdm()||!(ui.me.access&&(ui.me.access.projects||[]).length)||ui.me.access.projects.includes(x.id))).map(x=>({v:x.id,l:(x.code?x.code+' · ':'')+x.name})),d.projectId,'— choose the site —');
  return wrap(`${icon('alert')} Emergency purchase`,`<div class="notice emg-note">${icon('alert')}<span><b>For material bought urgently on rates settled offline</b> with a registered vendor. Saving makes, in one step: the site's demand marked <b>EMERGENCY</b> (already approved), the purchase order${poApprovalOn()?(can('po_approve')&&ui.me.sign?' (approved with your signature)':' (sent to the Director (Procurement) for approval)'):''}, and the delivery the site receives under <b>Receive material</b>. After that it works like any other PO.</span></div>
  <div class="fields">
   <div class="f"><label for="emg-p">Send to site</label><select class="inp" id="emg-p" data-bind="modal.d.projectId">${pOpts}</select></div>
   <div class="f"><label for="emg-v">Vendor</label><select class="inp" id="emg-v" data-bind="modal.d.vendorId" data-act-change="emgVendor">${vOpts}</select>${v?`<small class="muted">${esc([v.gstin&&'GSTIN '+v.gstin,v.phone].filter(Boolean).join(' · '))}</small>`:''}</div>
   ${field('PO date','modal.d.date',d.date,'type="date"')}
   ${field('Asked by (at site)','modal.d.requestedBy',d.requestedBy,'placeholder="Name of the person who asked"')}
   ${field('Reason for emergency','modal.d.reason',d.reason,'placeholder="e.g. Pipe burst on main line, supply stopped"','full')}
   ${field('Vendor quotation / bill no.','modal.d.quoteRef',d.quoteRef,'placeholder="Quotation, bill or phone confirmation"')}
   ${field('Quotation date','modal.d.quoteDate',d.quoteDate,'type="date"')}
   ${field('Payment terms','modal.d.payment',d.payment)}
   ${field('Delivery (days)','modal.d.deliveryDays',d.deliveryDays,'inputmode="numeric" placeholder="0 = today"')}
  </div>
  <datalist id="emg-items">${items.map(i=>`<option value="${esc(i.desc)}">`).join('')}</datalist><datalist id="gst-slabs-e">${GST_SLABS.map(g=>`<option value="${g}">`).join('')}</datalist>
  <div class="lbl">Items bought</div>
  <div class="tw"><table class="t emg-lines"><thead><tr><th>Item</th><th>Size / specification</th><th class="num">Qty</th><th>Unit</th><th class="num">Rate (excl. GST)</th><th class="num">GST %</th><th>HSN</th><th class="num">Amount</th><th></th></tr></thead><tbody>
  ${d.lines.map((l,i)=>{const it=D.itemMap[slug(l.desc)];const a=num(l.qty)*num(l.rate);return `<tr>
   <td><div class="who">${l.desc?lineThumb({desc:l.desc,category:l.category},'xs'):''}<input class="inp sm" id="emg-d-${i}" data-bind="modal.d.lines.${i}.desc" data-act-change="emgItem" data-i="${i}" value="${esc(l.desc)}" list="emg-items" placeholder="Type or pick an item"></div></td>
   <td>${it&&(it.sizes||[]).length?`<datalist id="emg-sz-${i}">${it.sizes.map(s=>`<option value="${esc(s)}">`).join('')}</datalist>`:''}<input class="inp sm" id="emg-s-${i}" data-bind="modal.d.lines.${i}.spec" value="${esc(l.spec)}" ${it&&(it.sizes||[]).length?`list="emg-sz-${i}"`:''} placeholder="Size, class, make"></td>
   <td class="num"><input class="inp sm qty" id="emg-q-${i}" data-bind="modal.d.lines.${i}.qty" value="${esc(l.qty)}" inputmode="decimal" data-rerender="1"></td>
   <td><select class="inp sm auto" id="emg-u-${i}" data-bind="modal.d.lines.${i}.unit">${selOpts(UNITS.includes(l.unit)?UNITS:[l.unit,...UNITS],l.unit)}</select></td>
   <td class="num"><input class="inp sm rate" id="emg-r-${i}" data-bind="modal.d.lines.${i}.rate" value="${esc(l.rate)}" inputmode="decimal" data-rerender="1"></td>
   <td class="num"><input class="inp sm gst" id="emg-g-${i}" data-bind="modal.d.lines.${i}.gst" value="${esc(l.gst)}" inputmode="decimal" list="gst-slabs-e" data-rerender="1" placeholder="${esc(d.gst)}"></td>
   <td><input class="inp sm hsn" id="emg-h-${i}" data-bind="modal.d.lines.${i}.hsn" value="${esc(l.hsn)}" inputmode="numeric"></td>
   <td class="num mono">${a?fq(a):'—'}</td>
   <td><button type="button" class="btn sm ghost" data-act="emgRmLine" data-i="${i}" aria-label="Remove line">${icon('trash','xs')}</button></td></tr>`}).join('')}</tbody></table></div>
  <div class="row"><button type="button" class="btn sm" data-act="emgAddLine">${icon('plus','xs')} Add item</button><span class="small muted">Rates are per unit, excluding GST. Empty GST % is taken as ${esc(d.gst||'18')}%.</span></div>
  <div class="fields">${field('Freight (₹, total, no GST)','modal.d.freight',d.freight,'inputmode="decimal" data-rerender="1"')}</div>
  ${chargesBox('modal.d',d,t)}
  <div class="f full"><label>Vendor's quotation or bill (photo or PDF)</label>${photoPicker('modal.d.files',d.files,{label:'Upload quotation / bill',doc:true})}</div>
  <label class="check"><input type="checkbox" id="emg-ship" ${d.shipped?'checked':''} data-act="emgShip"> The material has already left the vendor for the site</label>
  ${d.shipped?`<div class="fields">${field('Vehicle no.','modal.d.vehicle',d.vehicle)}${field('Driver & phone','modal.d.driver',d.driver)}${field('Challan / e-way bill','modal.d.lrNo',d.lrNo)}</div>`:''}
  ${p?`<p class="small muted">${icon('pin','xs')} Delivery to <b>${esc(p.name)}</b>${p.address?' — '+esc(p.address):''}. The site will see it as an emergency purchase and confirm receipt with the vendor's bill and the signed challan, as usual.</p>`:''}`,
  `<span class="grow"><b class="big">${money(t.total)}</b> <span class="muted small">grand total</span></span><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary emg-go" data-act="emgSave" ${busy}>${icon('check')} Save &amp; send to site</button>`,'wide')}
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='emg'?emgModal(m,busy):prev(m,busy)}

A.emgSave=async()=>{const m=ui.modal;const d=m.d;
  if(!d.projectId){toast('Choose the site.','err');return}
  if(!d.vendorId){toast('Choose the vendor.','err');return}
  if(!String(d.reason).trim()){toast('Write why this is an emergency purchase.','err');document.getElementById('f-modal-d-reason')?.focus();return}
  const lines=[];for(const l of d.lines){if(!String(l.desc).trim()&&!num(l.qty)&&!num(l.rate)) continue;const desc=String(l.desc).trim();
    if(!desc){toast('Enter the item on every line.','err');return}
    if(!(num(l.qty)>0)){toast(`Enter the quantity of ${desc}.`,'err');return}
    if(!(num(l.rate)>0)){toast(`Enter the rate of ${desc}.`,'err');return}
    const gs=String(l.gst??'').trim();const g=gs===''?num(d.gst||18):num(gs);if(!(g>=0&&g<=100)){toast(`GST % for ${desc} must be between 0 and 100.`,'err');return}
    const spec=String(l.spec||'').trim(),unit=l.unit||'Nos';const it=D.itemMap[slug(desc)];
    lines.push({desc,spec,unit,qty:num(l.qty),rate:num(l.rate),gst:g,hsn:String(l.hsn||'').trim()||itemHsn(desc),category:l.category||(it&&it.category)||classify(desc,spec).cat||'others',itemKey:itemKey(desc,spec,unit),note:''})}
  if(!lines.length){toast('Add the items bought.','err');return}
  {const bad=lines.filter(l=>rateUnitFix(l.desc,l.category,l.unit,l.rate));if(bad.length&&!m.unitOk){m.unitOk=true;const f=rateUnitFix(bad[0].desc,bad[0].category,bad[0].unit,bad[0].rate);toast(`${bad[0].desc}: ₹${fq(bad[0].rate)} per ${bad[0].unit} looks like a rate per ${f.as} (about ₹${fq(f.rate)} per ${bad[0].unit}). Correct the rate or unit, or tap Save again to keep it.`,'err');return}}
  let co;try{co=chargesOut(d)}catch(e){toast(errMsg(e),'err');return}
  const dd=String(d.deliveryDays).trim()===''?null:num(d.deliveryDays);
  const body=Object.assign({projectId:d.projectId,vendorId:d.vendorId,date:d.date||today(),requestedBy:d.requestedBy,reason:d.reason,quoteRef:d.quoteRef,quoteDate:d.quoteDate,files:d.files||[],
    deliveryDays:dd||0,expectedDate:addDays(d.date||today(),dd||0),payment:d.payment,freight:num(d.freight),terms:S.config.poTerms||DEFAULT_TERMS,lines,shipped:!!d.shipped,vehicle:d.vehicle,driver:d.driver,lrNo:d.lrNo},co);
  const res=await run(()=>api('/api/emergency',body));if(!res||!res.poId) return;
  closeModal();toast(`Emergency purchase saved: ${res.mrNo} for ${projCode(d.projectId)}, ${res.poNo}${res.approval==='pending'?' (waiting for approval by the Director (Procurement))':''} and delivery ${res.ddNo} to site.`);
  for(let i=0;i<30&&!S.pos.some(p=>p.id===res.poId);i++) await sleep(150);go('po',res.poId)};

/* ---------------- how an emergency purchase shows ---------------- */
function emgIndentBox(i,siteMode){const e=i.emergency;if(!e) return '';
  return `<div class="notice emg-note">${icon('alert')}<span><b>Emergency purchase by HQ</b> — bought directly from ${esc(e.vendorName||'the vendor')}${!siteMode&&e.poNo?` on <button class="linkish docno" data-act="openPo" data-id="${esc(e.poId)}">${esc(e.poNo)}</button>`:e.poNo?' on '+esc(e.poNo):''}${e.byName?' · entered by '+esc(e.byName):''}${e.at?' · '+fdt(e.at):''}.${e.reason?'<br>Reason: '+esc(e.reason):''}${siteMode?'<br>The material comes straight to your site. Receive it under <b>Receive material</b> with the vendor\'s bill and the signed challan.':''}</span></div>`}
function emgPoBox(po){if(!po.emergency) return '';const ind=S.indents.find(x=>x.id===po.indentId);
  return `<div class="notice emg-note">${icon('alert')}<span><b>Emergency purchase</b> — rate settled offline${po.quoteRef?' · vendor ref. <b>'+esc(po.quoteRef)+'</b>':''}${po.quoteDate?' dated '+fd(po.quoteDate):''}${po.createdByName?' · entered by '+esc(po.createdByName):''}.${po.emergencyReason?'<br>Reason: '+esc(po.emergencyReason):''}${ind?`<br>Site demand: <button class="linkish docno" data-act="openIndent" data-id="${ind.id}">${esc(ind.no)}</button> · ${esc(projLabel(ind.projectId))}`:''}
   ${(po.quoteFiles||[]).length?`<br>Quotation / bill: ${po.quoteFiles.map((f,k)=>`<a class="linkish" href="/files/${esc(f)}" target="_blank" rel="noopener">copy ${k+1}</a>`).join(' · ')}`:''}</span></div>`}
