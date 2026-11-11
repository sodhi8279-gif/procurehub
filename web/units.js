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

const normUnit=u=>String(u||'').trim().toLowerCase().replace(/\.$/,'').replace(/s$/,'');
const MT_ALIASES=['mt','ton','tonne','metric ton','metric tonne','tonnes','tone'];
const isMT=u=>MT_ALIASES.includes(normUnit(u));
const bagKg=()=>{const v=num((S.config||{}).bagKg);return v>0?v:50};
const isCement=l=>/cement/i.test(String(l.desc||'')+' '+String(l.cat||l.category||''))&&!/(pipe|board|sheet|block|paint|primer)/i.test(String(l.desc||''));

// the billing unit for an item measured in `unit`: {bu, bf (units per billing unit), why} or null
function convRule(l){const u=normUnit(l.dUnit||l.unit);if(!u||isMT(u)) return null;
  const it=D.itemMap&&D.itemMap[slug(l.desc||'')];
  if(it&&String(it.billUnit||'').trim()&&num(it.billPer)>0&&normUnit(it.unit)===u) return {bu:String(it.billUnit).trim(),bf:num(it.billPer),why:'catalogue'};
  if(u==='kg'||u==='kilogram'||u==='kgs') return {bu:'MT',bf:1000,why:'1 MT = 1000 kg'};
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
{const prev=buildRfqLines;buildRfqLines=function(keys){return prev(keys).map(l=>setBilling(l,!!convRule(l)))}}
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
function kgPer(u,desc){const n=normUnit(u);if(n==='kg'||n==='kilogram') return 1;if(isMT(n)) return 1000;if(n==='quintal'||n==='qtl') return 100;if(n==='bag'&&/cement/i.test(desc||'')) return bagKg();return 0}
// multiply a rate per `from` by this to get the rate per `to` (0 = not convertible)
function unitConv(from,to,desc){const a=normUnit(from),b=normUnit(to);if(a===b||(UNIT_ALIAS[a]&&UNIT_ALIAS[a]===UNIT_ALIAS[b])||(isMT(a)&&isMT(b))) return 1;const kf=kgPer(from,desc),kt=kgPer(to,desc);return kf>0&&kt>0?kt/kf:0}
const looseDesc=s=>String(s||'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(w=>w.length>3&&/[^s]s$/.test(w)?w.slice(0,-1):w).join(' ');
const specToks=s=>new Set(String(s||'').toLowerCase().replace(/(\d)\s+(mm|cm|m|mtr|inch|in|kg|kgs|mt|ft|sqmm|grade)\b/g,'$1$2').replace(/(\d+(?:\.\d+)?)\s*(?:mm|cm|inch|ft|sqmm|kg|kgs)?\s*(dia|diameter|thick|thk)\b/g,'$1').split(/[^a-z0-9.]+/).filter(t=>t&&!['of','and','the','x','with','grade','gr','size','dia'].includes(t)));
function specCompat(a,b){if(!a.size&&!b.size) return true;let n=0;for(const t of a) if(b.has(t)) n++;if(!n) return false;return n===a.size||n===b.size}
rateMatches=function(k){const [d,s,u]=String(k).split('|');const idx=rateIndex();const want=looseDesc(d),st=specToks(s);const out=[];
  for(const [kk,arr] of Object.entries(idx)){const [d2,s2,u2]=kk.split('|');if(kk!==k){if(looseDesc(d2)!==want||!specCompat(st,specToks(s2))) continue}
    const f=kk===k?1:unitConv(u2,u,d+' '+d2);if(!(f>0)) continue;
    for(const x of arr) out.push(kk===k?x:Object.assign({},x,{rate:Math.round(x.rate*f*100)/100,origRate:x.rate,similar:true,simDesc:d2,simSpec:s2,simUnit:u2,wantUnit:u}))}
  return out.sort((a,b)=>b.at-a.at)};
