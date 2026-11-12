'use strict';
/* Billing in a different unit from the demand (cement: demand in bags, billed per MT;
   TMT: demand in kg, billed per MT).

   Quantities, receipts and stock stay in the demand unit everywhere. An RFQ line
   can be quoted and billed in a billing unit: the line then carries
     unit = billing unit (MT), qty = demand qty ÷ bf,
     dUnit = demand unit (Bag / Kg), dQty = demand qty, bf = demand units per billing unit (20 bags / 1000 kg per MT).
   So estimates, the vendors' quotation sheet, quotes and the comparative are all per MT.
   When POs are made the line goes back to the demand unit (qty in bags / kg, rate per bag / kg)
   and keeps bu, bf and rateBu (rate per MT) for the PO print and billing. */

const normUnit=u=>{let x=String(u||'').trim().toLowerCase().replace(/[.\s\/_-]+/g,'');if(x.length>2) x=x.replace(/s$/,'');return ({kilogram:'kg',kilo:'kg',kgm:'kg',metricton:'mt',metricton:'mt',tonne:'mt',ton:'mt',tn:'mt',qtl:'quintal',qntl:'quintal',gram:'g',gm:'g',grm:'g'})[x]||x};
const MT_ALIASES=['mt','ton','tonne','metricton','metrictonne','tone','tn'];
const isMT=u=>MT_ALIASES.includes(normUnit(u));
const bagKg=()=>{const v=num((S.config||{}).bagKg);return v>0?v:50};
const isCement=l=>/cement/i.test(String(l.desc||'')+' '+String(l.cat||l.category||''))&&!/(pipe|board|sheet|block|paint|primer)/i.test(String(l.desc||''));

// the billing unit for an item measured in `unit`: {bu, bf (units per billing unit), why} or null
function convRule(l){const u=normUnit(l.dUnit||l.unit);if(!u||isMT(u)) return null;
  const it=D.itemMap&&D.itemMap[slug(l.desc||'')];
  if(it&&String(it.billUnit||'').trim()&&num(it.billPer)>0&&normUnit(it.unit)===u) return {bu:String(it.billUnit).trim(),bf:num(it.billPer),why:'catalogue'};
  if(u==='kg') return {bu:'MT',bf:1000,why:'1 MT = 1000 kg'};
  if(u==='quintal'||u==='qtl') return {bu:'MT',bf:10,why:'1 MT = 10 quintal'};
  if(u==='bag'&&isCement(l)){const kg=it&&num(it.bagKg)>0?num(it.bagKg):bagKg();return {bu:'MT',bf:Math.round(1000/kg*1e6)/1e6,why:`bag of ${fq(kg)} kg · 1 MT = ${fq(1000/kg)} bags`}}
  return null}

// switch an RFQ line between billing in its demand unit and in the billing unit
function setBilling(l,on){if(l.bf>0){l.unit=l.dUnit;l.qty=l.dQty;delete l.bf;delete l.dUnit;delete l.dQty;delete l.billWhy}
  if(!on) return l;const r=convRule(l);if(!r) return l;
  l.dUnit=l.unit;l.dQty=num(l.qty);l.bf=r.bf;l.billWhy=r.why;l.unit=r.bu;l.qty=Math.round(l.dQty/r.bf*1000)/1000;return l}

// display helpers: "1,000 Bag · 50 MT"
const hasBu=l=>!!(l&&l.bu&&num(l.bf)>0);
function fqBu(l,q){return hasBu(l)?`${fq(num(q)/num(l.bf))} ${esc(l.bu)}`:''}
function fqDual(l,q){return `${fq(q)} ${esc(l.unit)}${hasBu(l)?` <small class="muted">· ${fqBu(l,q)}</small>`:''}`}

// RFQ lines: billed per MT by default where a rule exists
A.rfqBill=d=>{const l=ui.modal&&ui.modal.d&&ui.modal.d.lines&&ui.modal.d.lines[+d.i];if(!l) return;setBilling(l,d.on==='1');render()};
function rfqBillCell(l,i){if(l.bf>0) return `<small class="block bill-hint t-blue">billed per ${esc(l.unit)} · = ${fq(l.dQty)} ${esc(l.dUnit)} <span class="muted">(${esc(l.billWhy||'')})</span> <button type="button" class="link" data-act="rfqBill" data-i="${i}" data-on="0">bill per ${esc(l.dUnit)}</button></small>`;
  const r=convRule(l);return r?`<small class="block bill-hint muted"><button type="button" class="link" data-act="rfqBill" data-i="${i}" data-on="1">bill per ${esc(r.bu)}</button> (${esc(r.why)})</small>`:''}

// POs: lines go back to the demand unit (qty in bags / kg, rate per bag / kg) and keep the billing unit
{const prev=generatePOs;generatePOs=async function(r){
  if(!(r.lines||[]).some(l=>l.bf>0)) return prev(r);
  const conv={};for(const l of r.lines) if(l.bf>0) conv[l.key]=l;
  const r2=Object.assign({},r,{lines:r.lines.map(l=>l.bf>0?Object.assign({},l,{unit:l.dUnit,qty:Math.round(num(l.qty)*num(l.bf)*1000)/1000,bu:l.unit,bf:l.bf}):l),quotes:{}});
  for(const [v,q] of Object.entries(r.quotes||{})){const rates={},ratesBu={};for(const [k,rt] of Object.entries(q.rates||{})){if(conv[k]){rates[k]=num(rt)/num(conv[k].bf);ratesBu[k]=num(rt)}else rates[k]=rt}r2.quotes[v]=Object.assign({},q,{rates,ratesBu})}
  return prev(r2)}}

// item catalogue: billing unit for an item
function itemBillFields(d){return `<div class="f"><label for="f-modal-d-billUnit">Billing unit (optional)</label>${inp('modal.d.billUnit',d.billUnit||'','placeholder="MT"')}</div>
  <div class="f"><label for="f-modal-d-billPer">${esc(d.unit||'units')} in 1 billing unit</label>${inp('modal.d.billPer',d.billPer||'','inputmode="decimal" placeholder="e.g. 20 bags / 1000 kg"')}</div>
  ${normUnit(d.unit)==='bag'?`<div class="f"><label for="f-modal-d-bagKg">Weight of one bag (kg)</label>${inp('modal.d.bagKg',d.bagKg||'','inputmode="decimal" placeholder="'+fq(bagKg())+'"')}</div>`:''}`}

// ---- earlier rates: tolerant matching (spelling, size written differently, unit) ----
const UNIT_ALIAS={no:'nos',nos:'nos',number:'nos',pc:'nos',piece:'nos',cum:'cum',m3:'cum','cu m':'cum',cmt:'cum',sqm:'sqm',m2:'sqm','sq m':'sqm',rmt:'rmt',mtr:'rmt',meter:'rmt',metre:'rmt',rm:'rmt',ltr:'ltr',litre:'ltr',liter:'ltr'};
function kgPer(u,desc){const n=normUnit(u);if(n==='kg') return 1;if(n==='g') return 0.001;if(isMT(n)) return 1000;if(n==='quintal'||n==='qtl') return 100;if(n==='bag'&&/cement/i.test(desc||'')) return bagKg();return 0}
// multiply a rate per `from` by this to get the rate per `to` (0 = not convertible)
function unitConv(from,to,desc){const a=normUnit(from),b=normUnit(to);if(a===b||(UNIT_ALIAS[a]&&UNIT_ALIAS[a]===UNIT_ALIAS[b])||(isMT(a)&&isMT(b))) return 1;const kf=kgPer(from,desc),kt=kgPer(to,desc);return kf>0&&kt>0?kt/kf:0}
const prettyUnit=u=>({mt:'MT',kg:'Kg',quintal:'Quintal',bag:'Bag',g:'g',no:'Nos',nos:'Nos'})[normUnit(u)]||u;
const looseDesc=s=>String(s||'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(w=>w.length>3&&/[^s]s$/.test(w)?w.slice(0,-1):w).join(' ');
const specToks=s=>new Set(String(s||'').toLowerCase().replace(/(\d)\s+(mm|cm|m|mtr|inch|in|kg|kgs|mt|ft|sqmm|grade)\b/g,'$1$2').replace(/(\d+(?:\.\d+)?)\s*(?:mm|cm|inch|ft|sqmm|kg|kgs)?\s*(dia|diameter|thick|thk)\b/g,'$1').split(/[^a-z0-9.]+/).filter(t=>t&&!['of','and','the','x','with','grade','gr','size','dia'].includes(t)));
// same item name: equal, or same first word and one name's words all in the other ("tmt" ~ "tmt steel bar"; "pipe" !~ "gi pipe")
const NAME_FILL=['steel','bar','rod','ms','material','item','grade'];
function descCompat(a,b){if(a===b) return true;const A=a.split(' '),B=b.split(' ');if(!A[0]||A[0]!==B[0]) return false;
  const [sm,lg]=A.length<=B.length?[A,B]:[B,A];return sm.every(w=>lg.includes(w))&&lg.filter(w=>!sm.includes(w)).every(w=>NAME_FILL.includes(w)||/^[0-9]/.test(w)===false&&w.length<=6)}
function specCompat(a,b){if(!a.size&&!b.size) return true;let n=0;for(const t of a) if(b.has(t)) n++;if(!n) return false;return n===a.size||n===b.size}
rateMatches=function(k){const [d,s,u]=String(k).split('|');const idx=rateIndex();const want=looseDesc(d),st=specToks(s);const out=[];
  for(const [kk,arr] of Object.entries(idx)){const [d2,s2,u2]=kk.split('|');if(kk!==k){if(!descCompat(want,looseDesc(d2))||!specCompat(st,specToks(s2))) continue}
    const f=kk===k?1:unitConv(u2,u,d+' '+d2);if(!(f>0)) continue;
    const sameItem=looseDesc(d2)===want&&[...specToks(s2)].sort().join(' ')===[...st].sort().join(' ');const otherUnit=normUnit(u2)!==normUnit(u);
    for(const x of arr) out.push(kk===k?x:Object.assign({},x,{rate:Math.round(x.rate*f*10000)/10000,origRate:x.rate,similar:!sameItem,converted:otherUnit,simDesc:d2,simSpec:s2,simUnit:prettyUnit(u2),wantUnit:u}))}
  return out.sort((a,b)=>b.at-a.at)};

// ---- receiving in the vendor's unit: the PO stays in the demand unit; a vendor billing in MT is converted ----
function altUnits(l){const d=(l.desc||'')+' '+(l.cat||l.category||'');return ['MT','Kg','Quintal','Bag'].filter(x=>normUnit(x)!==normUnit(l.unit)&&!(isMT(x)&&isMT(l.unit))&&unitConv(x,l.unit,d)>0)}
const qtyConv=(q,from,to,desc)=>{const f=unitConv(from,to,desc);return f>0?Math.round(num(q)/f*1000)/1000:num(q)};
const lDesc=l=>(l.desc||'')+' '+(l.cat||l.category||'');
// a value typed in unit U, as a quantity in the PO unit
function vuIn(l,U,v){return !U||U===l.unit||String(v??'').trim()===''?v:String(qtyConv(v,U,l.unit,lDesc(l)))}
function vuSel(l,k,sets,val){const a=altUnits(l);if(!a.length) return '';
  return `<label class="vu small muted">Vendor's unit <select class="inp sm auto" data-act-change="vuChange" data-k="${esc(String(k))}" data-sets="${sets}" data-unit="${esc(l.unit)}" data-desc="${esc(lDesc(l))}">${[l.unit,...a].map(u=>`<option value="${esc(u)}" ${String(val||l.unit)===u?'selected':''}>${esc(u)}</option>`).join('')}</select></label>`}
function vuHint(l,U,v,what){if(!U||U===l.unit||String(v??'').trim()==='') return '';return `<small class="block vu-hint">${what?esc(what)+' ':''}${esc(String(v))} ${esc(U)} = <b>${fq(qtyConv(v,U,l.unit,lDesc(l)))} ${esc(l.unit)}</b></small>`}
// changing the unit converts the figures already typed on that line (so 1,000 Bag becomes 50 MT, not 1,000 MT)
CH.vuChange=el=>{const m=ui.modal;if(!m) return;const k=el.dataset.k,unit=el.dataset.unit,desc=el.dataset.desc;m.d.uu=m.d.uu||{};const prev=m.d.uu[k]||unit,next=el.value;
  for(const f of el.dataset.sets.split(',')){const o=m.d[f];if(!o||o[k]==null||String(o[k]).trim()==='') continue;const inPo=prev===unit?num(o[k]):qtyConv(o[k],prev,unit,desc);o[k]=String(next===unit?Math.round(inPo*1000)/1000:qtyConv(inPo,unit,next,desc))}
  m.d.uu[k]=next;render()};
// site receipt / vendor dispatched: convert to the PO unit before saving, keep what was typed
function withVendorUnit(lines,d,sets){const ent={};lines.forEach((l,i)=>{const U=(d.uu||{})[i];if(!U||U===l.unit) return;const e={unit:U};for(const f of sets){if(!d[f]) continue;e[f]=String(d[f][i]??'');d[f][i]=vuIn(l,U,d[f][i])}ent[i]=e});return ent}
for(const [act,sets] of [['saveReceipt',['recv','sup']],['saveShipped',['sup']]]){const prev=A[act];A[act]=async(...a)=>{const m=ui.modal;const d=m&&m.d;const x=d&&S.dispatches.find(y=>y.id===m.id);
  if(!x||!d.uu||!Object.values(d.uu).some((u,i)=>u)) return prev(...a);
  const keep={};for(const f of sets) keep[f]=Object.assign({},d[f]||{});const uu=d.uu;d._entered=withVendorUnit(x.lines,d,sets);d.uu={};
  try{return await prev(...a)}finally{if(ui.modal===m){for(const f of sets) d[f]=keep[f];d.uu=uu;delete d._entered}}}}

// ---- convert stock already received to another unit (e.g. cement received in MT, issued in bags) ----
// Two linked stock adjustments: − the quantity in the old unit, + the same material in the new unit.
const ucStoreBal=(p,sid,k)=>{const r=((D.sst||{})[p]||{})[sid||'main'];const x=r&&r[k];return x?num(x.bal!=null?x.bal:0):0};
function ucCan(){return ui.role==='hq'?(ui.me.admin||can('sitestock_edit')):(!ui.preview&&isPM())}
function unitConvBtn(p,k,r){if(!r||!(r.bal>1e-9)||!altUnits(r).length||!ucCan()) return '';return `<button class="btn" data-act="ucOpen" data-p="${p}" data-k="${esc(k)}">${icon('swap')} Convert unit</button>`}
A.ucOpen=d=>{const r=(D.site[d.p]||{})[d.k];if(!r) return;const alts=altUnits(r);
  const stores=Object.keys((D.sst||{})[d.p]||{}).filter(sid=>ucStoreBal(d.p,sid,d.k)>1e-9);const sid=stores[0]||'main';
  openModal({type:'unitConv',p:d.p,k:d.k,d:{to:alts.includes('Bag')?'Bag':alts[0],storeId:sid,qty:String(ucStoreBal(d.p,sid,d.k)||r.bal),reason:''}})};
function ucModal(m,busy){const r=(D.site[m.p]||{})[m.k];if(!r) return '';const d=m.d;const alts=altUnits(r);
  const stores=Object.keys((D.sst||{})[m.p]||{}).filter(sid=>ucStoreBal(m.p,sid,m.k)>1e-9);const inStore=stores.length?ucStoreBal(m.p,d.storeId,m.k):r.bal;
  const q=num(d.qty),out=q>0?qtyConv(q,r.unit,d.to,lDesc(r)):0;
  return wrap('Convert unit · '+esc(r.desc),`<p class="small muted">${esc(r.spec||'')} · in stock <b>${fq(inStore)} ${esc(r.unit)}</b>${stores.length>1?' in this store':''}. The quantity you convert is taken out in ${esc(r.unit)} and put back as the same material in the new unit, so issues and consumption can be entered in that unit.</p>
    <div class="fields">${stores.length>1?`<div class="f"><label for="f-modal-d-storeId">Store</label><select class="inp" id="f-modal-d-storeId" data-bind="modal.d.storeId">${stores.map(s=>`<option value="${esc(s)}" ${s===d.storeId?'selected':''}>${esc(storeLabel(m.p,s))}</option>`).join('')}</select></div>`:''}
    <div class="f"><label for="f-modal-d-qty">Quantity to convert (${esc(r.unit)})</label>${inp('modal.d.qty',d.qty,'inputmode="decimal" data-rerender="1"')}</div>
    <div class="f"><label for="f-modal-d-to">Convert to</label><select class="inp" id="f-modal-d-to" data-bind="modal.d.to">${alts.map(u=>`<option ${u===d.to?'selected':''}>${esc(u)}</option>`).join('')}</select></div></div>
    <div class="notice">${icon('swap')}<span>${q>0?`<b>${fq(q)} ${esc(r.unit)}</b> becomes <b>${fq(out)} ${esc(d.to)}</b>`:'Enter the quantity.'} <small class="muted">(${normUnit(r.unit)==='bag'||normUnit(d.to)==='bag'?'bag of '+fq(r&&D.itemMap[slug(r.desc)]&&num(D.itemMap[slug(r.desc)].bagKg)>0?num(D.itemMap[slug(r.desc)].bagKg):bagKg())+' kg':'1 MT = 1000 kg = 10 quintal'})</small></span></div>
    ${field('Reason (optional)','modal.d.reason',d.reason)}`,
    `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="ucSave" ${busy}>${icon('check')} Convert</button>`)}
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='unitConv'?ucModal(m,busy):prev(m,busy)}
A.ucSave=async()=>{const m=ui.modal;const r=(D.site[m.p]||{})[m.k];if(!r) return;const d=m.d;const q=Math.round(num(d.qty)*1000)/1000;
  const stores=Object.keys((D.sst||{})[m.p]||{}).filter(sid=>ucStoreBal(m.p,sid,m.k)>1e-9);const avail=stores.length?ucStoreBal(m.p,d.storeId,m.k):r.bal;
  if(!(q>0)){toast('Enter the quantity to convert.','err');return}if(q>avail+1e-9){toast(`Only ${fq(avail)} ${r.unit} is in stock${stores.length>1?' in this store':''}.`,'err');return}
  const out=qtyConv(q,r.unit,d.to,lDesc(r));const conv=newId();const note=`Unit conversion: ${fq(q)} ${r.unit} → ${fq(out)} ${d.to}`;
  const base={type:'adjust',projectId:m.p,storeId:d.storeId||'main',desc:r.desc,spec:r.spec,cat:r.cat,date:today(),reason:String(d.reason||'').trim()||'Unit conversion',remarks:note,convId:conv,at:Date.now(),createdBy:ui.uid,createdByName:(ui.me&&ui.me.name)||''};
  if(await run(async()=>{await setDoc('sitelog',newId(),Object.assign({},base,{itemKey:r.itemKey,unit:r.unit,qty:-q}));await setDoc('sitelog',newId(),Object.assign({},base,{itemKey:itemKey(r.desc,r.spec,d.to),unit:d.to,qty:out}))},note+'. Site stock updated.')) closeModal()};
