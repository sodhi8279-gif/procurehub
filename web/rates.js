"use strict";
/* ================= 6.7 RATES, ESTIMATE BEFORE THE RFQ, FINDING VENDORS =================
   - Rate history of every item from purchase orders and quotations received.
   - Each new RFQ carries an estimate: per item the lowest rate received in the last 3 months
     (with the vendor), else the last purchase rate. The approver checks and approves the
     estimate before the RFQ may go to vendors (the server enforces it, rates.go).
   - The comparative shows the earlier rates next to the quotes, for negotiation.
   - Find vendors: manufacturers and dealers searched on the web with the company's AI key,
     nearest to HQ or the site first, plus the vendors already on record for that category. */

const REF_DAYS=90;
Object.assign(ACT_PERM,{estApprove:['compare_approve','demands_approve'],estReturn:['compare_approve','demands_approve'],estEdit:['rfq_create','compare_approve'],saveEst:['rfq_create','compare_approve'],findVendors:['rfq_create','masters_vendors','po_issue','compare_approve'],runFindVendors:['rfq_create','masters_vendors','po_issue','compare_approve'],addLeadVendor:'masters_vendors'});

/* ---------- rate history ---------- */
let RH=null,RHrev=null;
function rateIndex(){if(RH&&RHrev===D) return RH;const m={};const add=(k,x)=>(m[k]=m[k]||[]).push(x);
  for(const p of S.pos){if(p.status==='cancelled'||p.ratesHidden) continue;const at=p.at||Date.parse(p.date)||0;
    for(const l of p.lines||[]){const r=num(l.rate);if(!(r>0)) continue;add(l.itemKey||itemKey(l.desc,l.spec,l.unit),{kind:'po',emg:!!p.emergency,rate:r,gst:num(l.gst),vendorId:p.vendorId,vendorName:p.vendorName||(vend(p.vendorId)||{}).name||'',at,no:p.no,id:p.id,rfqId:p.rfqId||''});if(l.bu&&num(l.rateBu)>0) add(itemKey(l.desc,l.spec,l.bu),{kind:'po',rate:num(l.rateBu),gst:num(l.gst),vendorId:p.vendorId,vendorName:p.vendorName||(vend(p.vendorId)||{}).name||'',at,no:p.no,id:p.id,rfqId:p.rfqId||''})}}
  for(const r of S.rfqs){for(const [vid,q] of Object.entries(r.quotes||{})){const at=q.at||r.at||0;
    for(const l of r.lines||[]){const rt=num((q.rates||{})[l.key]);if(!(rt>0)) continue;add(itemKey(l.desc,l.spec,l.unit),{kind:'quote',rate:rt,gst:qGst(q,l.key),vendorId:vid,vendorName:(vend(vid)||{}).name||'',at,no:r.no,id:r.id})}}}
  for(const k in m) m[k].sort((a,b)=>b.at-a.at);RH=m;RHrev=D;return m}
// reference rates for an item (excl. GST): last purchase, and the lowest received in the last 3 months
// rate records for an item key (made tolerant of spelling, size and unit in units.js)
let rateMatches=k=>rateIndex()[k]||[];
function rateRef(k,skipId){const all=rateMatches(k).filter(x=>!skipId||(x.id!==skipId&&x.rfqId!==skipId));const since=Date.now()-REF_DAYS*864e5;const recent=all.filter(x=>x.at>=since);
  const last=all.find(x=>x.kind==='po')||null;const low=recent.slice().sort((a,b)=>a.rate-b.rate)[0]||null;
  const est=low||last;return {last,low,n:recent.length,est,basis:low?'low3':last?'last':''}}
const refTxt=x=>x?`${money(x.rate)}<small class="muted block">${esc(x.vendorName||'')} · ${x.kind==='po'?(x.emg?'emergency PO':'PO'):'quote'} ${esc(x.no||'')} · ${fd(msDate(x.at))}</small>${x.similar?`<small class="block t-amber">similar item: ${esc(x.simDesc)}${x.simSpec?' · '+esc(x.simSpec):''}${x.simUnit&&normUnit(x.simUnit)!==normUnit(x.wantUnit)?' · '+money(x.origRate)+' per '+esc(x.simUnit):''}</small>`:''}`:'<span class="muted small">—</span>';
const lineKey=l=>itemKey(l.desc,l.spec,l.unit);

/* ---------- estimate made with the RFQ ---------- */
function buildEstimate(lines){const est={lines:{},total:0};
  for(const l of lines){const rf=rateRef(lineKey(l));const x=rf.est;const rate=x?x.rate:0;
    est.lines[l.key]={rate,basis:rf.basis,vendorName:x?x.vendorName:'',refNo:x?x.no:'',refAt:x?x.at:0,lastRate:rf.last?rf.last.rate:0,lastVendor:rf.last?rf.last.vendorName:'',lowRate:rf.low?rf.low.rate:0,lowVendor:rf.low?rf.low.vendorName:''};
    est.total+=rate*num(l.qty)}
  est.total=Math.round(est.total*100)/100;return est}
{const prev=createRfq;createRfq=async function(m,extra){if(extra&&extra.sample) return prev(m,extra);return prev(m,Object.assign({estimate:buildEstimate(m.lines)},extra||{}))}}
const estOf=r=>r&&r.estimate||null;
const estOk=r=>!estOf(r)||estOf(r).status==='approved';
const EST_ST={pending:{label:'Estimate waiting for approval',tone:'amber'},approved:{label:'Estimate approved',tone:'green'},returned:{label:'Estimate sent back for recheck',tone:'red'}};
function estTotal(r){const e=estOf(r);if(!e) return 0;return sum(r.lines||[],l=>num((e.lines[l.key]||{}).rate)*num(l.qty))}
function estimateCard(r){const e=estOf(r);if(!e) return '';const vals=seeRates();const st=EST_ST[e.status]||EST_ST.pending;
  const canAppr=(can('compare_approve')||can('demands_approve'))&&r.createdBy!==ui.uid&&e.status==='pending';const canEdit=(can('rfq_create')||can('compare_approve'))&&e.status!=='approved'&&!['ordered','cancelled'].includes(r.status);
  const B={low3:'lowest in 3 months',last:'last purchase',manual:'entered by purchase team','':'no earlier rate'};
  return `<section class="card ${e.status==='approved'?'':'appr-box'}"><div class="card-h"><h2>Estimate before RFQ</h2>${chip(st)}<span class="sub">${vals?'Estimated value '+money0(estTotal(r))+' + GST':''}</span><div class="acts">${canEdit?`<button class="btn sm" data-act="estEdit">${icon('edit')} Recheck rates</button>`:''}</div></div>
  ${e.status==='returned'?`<div class="notice err">${icon('back')}<span>Sent back by <b>${esc(e.byName||'')}</b> ${fdt(e.at)}: “${esc(e.note||'')}”. Recheck the rates and send it again.</span></div>`:''}
  ${e.status==='pending'&&e.returnNote?`<p class="small muted">Rechecked by ${esc(e.revisedBy||'')} after: “${esc(e.returnNote)}”${e.note?' — '+esc(e.note):''}</p>`:''}
  ${vals?`<div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Last purchase</th><th class="num">Lowest in 3 months</th><th class="num">Estimate rate</th><th class="num">Estimate value</th></tr></thead><tbody>${r.lines.map(l=>{const x=e.lines[l.key]||{};
    return `<tr><td><div class="who">${thumb({category:l.cat,desc:l.desc},'xs')}<span><b>${esc(l.desc)}</b><small class="muted block">${esc(l.spec||'')}</small></span></div></td><td class="num mono">${fq(l.qty)} ${esc(l.unit)}</td><td class="num mono">${x.lastRate?money(x.lastRate)+`<small class="muted block">${esc(x.lastVendor||'')}</small>`:'—'}</td><td class="num mono">${x.lowRate?money(x.lowRate)+`<small class="muted block">${esc(x.lowVendor||'')}</small>`:'—'}</td><td class="num mono"><b>${x.rate?money(x.rate):'<span class="t-amber">not set</span>'}</b><small class="muted block">${esc(B[x.basis]||'')}</small></td><td class="num mono">${x.rate?money0(x.rate*num(l.qty)):'—'}</td></tr>`}).join('')}</tbody></table></div>`:'<p class="small muted">Rates are hidden for your login.</p>'}
  <div class="card-f"><div class="grow small muted">${e.status==='approved'?`${icon('check','xs')} Approved by <b>${esc(e.byName||'')}</b> ${fdt(e.at)}${e.note?' — '+esc(e.note):''}. The RFQ can go to vendors.`:`The RFQ goes to vendors only after the approver approves this estimate.${r.createdBy===ui.uid?' You made this RFQ, so another person approves it.':''}`}</div>
  ${canAppr?`<button class="btn danger" data-act="estReturn">Send back for recheck</button><button class="btn primary" data-act="estApprove" ${ui.busy?'disabled':''}>${icon('check')} Approve estimate</button>`:''}</div></section>`}
A.estApprove=()=>{const r=rfqOf();confirmBox({title:'Approve the estimate of '+r.no+'?',body:`Estimated value ${money0(estTotal(r))} + GST for ${r.lines.length} item${r.lines.length===1?'':'s'}. The RFQ can then be sent to vendors.`,note:'Remarks (optional)',yes:'Approve estimate',onYes:async m=>{if(await run(()=>updDoc('rfqs',r.id,{estimate:{status:'approved',note:String(m.noteVal||'').trim()}}),'Estimate approved')) closeModal()}})};
A.estReturn=()=>{const r=rfqOf();confirmBox({title:'Send the estimate back for recheck',body:'The purchase team rechecks the rates and sends it again.',noteArea:true,note:'What should be rechecked (required)',yes:'Send back',danger:true,onYes:async m=>{const n=String(m.noteVal||'').trim();if(!n){toast('Write what should be rechecked.','err');return}if(await run(()=>updDoc('rfqs',r.id,{estimate:{status:'returned',note:n}}),'Estimate sent back')) closeModal()}})};
A.estEdit=()=>{const r=rfqOf();const e=estOf(r);openModal({type:'estEdit',id:r.id,d:{note:'',rates:Object.fromEntries(r.lines.map(l=>[l.key,String((e.lines[l.key]||{}).rate||'')]))}})};
function estEditModal(m,busy){const r=S.rfqs.find(x=>x.id===m.id);const e=estOf(r);const d=m.d;
  return wrap('Recheck estimate · '+esc(r.no),`<p class="small muted">Rates per unit excluding GST. Earlier rates are shown for each item.</p><div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Last purchase</th><th class="num">Lowest in 3 months</th><th class="num">Estimate rate (₹)</th></tr></thead><tbody>${r.lines.map(l=>{const x=e.lines[l.key]||{};return `<tr><td><b>${esc(l.desc)}</b><small class="muted block">${esc(l.spec||'')}</small></td><td class="num mono">${fq(l.qty)} ${esc(l.unit)}</td><td class="num mono">${x.lastRate?money(x.lastRate):'—'}<small class="muted block">${esc(x.lastVendor||'')}</small></td><td class="num mono">${x.lowRate?money(x.lowRate):'—'}<small class="muted block">${esc(x.lowVendor||'')}</small></td><td class="num">${inp('modal.d.rates.'+l.key,d.rates[l.key],'inputmode="decimal" style="width:120px"')}</td></tr>`}).join('')}</tbody></table></div>
   <div class="f full"><label for="f-modal-d-note">Note for the approver</label>${inp('modal.d.note',d.note,'placeholder="e.g. Steel prices up 6% this month; rate taken from latest quote"')}</div>`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveEst" ${busy}>Send for approval</button>`,'wide')}
A.saveEst=async()=>{const m=ui.modal;const r=S.rfqs.find(x=>x.id===m.id);const e=estOf(r);const lines={};let total=0;
  for(const l of r.lines){const v=num(m.d.rates[l.key]);if(v<0){toast('Rate cannot be negative.','err');return}const old=e.lines[l.key]||{};lines[l.key]=Object.assign({},old,{rate:v,basis:v===num(old.rate)?old.basis:'manual'});total+=v*num(l.qty)}
  if(await run(()=>updDoc('rfqs',r.id,{estimate:{status:'pending',lines,total:Math.round(total*100)/100,note:String(m.d.note||'').trim()}}),'Estimate sent for approval')) closeModal()};

/* ---------- earlier rates in the comparative ---------- */
function prevRateCell(r,l){const rf=rateRef(lineKey(l),r.id);const e=estOf(r);const x=e&&e.lines[l.key];const l1=l1Map(r)[l.key];
  const base=rf.last?rf.last.rate:(rf.low?rf.low.rate:0);let diff='';
  if(l1&&base){const q=num(((r.quotes[l1.v]||{}).rates||{})[l.key]);if(q>0){const pc=(q-base)/base*100;diff=`<small class="block ${pc>0.5?'t-red':pc<-0.5?'t-green':'muted'}">L1 ${pc>0?'+':''}${fq(Math.round(pc*10)/10)}% vs ${rf.last?'last purchase':'lowest 3 m'}</small>`}}
  // where a rate came from: emergency PO, or a similar item / other unit (converted)
  const src=x=>`${x.emg?' <span class="chip red xs">emergency PO</span>':''}${x.similar?`<small class="block t-amber">similar item: ${esc(x.simDesc)}${x.simSpec?' · '+esc(x.simSpec):''}${normUnit(x.simUnit)!==normUnit(x.wantUnit)?' · '+fq(x.origRate)+' per '+esc(x.simUnit):''}</small>`:''}`;
  return `<td class="small prev-r">${rf.last?`<div><span class="muted">Last PO</span> <b class="mono">${fq(rf.last.rate)}</b> <span class="muted">${esc(rf.last.vendorName||'')} · ${esc(rf.last.no||'')} · ${fd(msDate(rf.last.at))}</span>${src(rf.last)}</div>`:'<div class="muted">No earlier PO</div>'}${rf.low&&rf.low!==rf.last?`<div><span class="muted">Lowest 3 m</span> <b class="mono">${fq(rf.low.rate)}</b> <span class="muted">${esc(rf.low.vendorName||'')} (${rf.low.kind==='po'?(rf.low.emg?'emergency PO':'PO'):'quote'})</span>${src(rf.low)}</div>`:''}${x&&x.rate?`<div><span class="muted">Estimate</span> <b class="mono">${fq(x.rate)}</b></div>`:''}${diff}</td>`}

/* ---------- item rate history (Find items, queue) ---------- */
A.rateHist=d=>openModal({type:'rateHist',k:d.k,desc:d.desc||''});
function rateHistModal(m){const list=rateMatches(m.k);const rf=rateRef(m.k);const name=m.desc||(list[0]&&'')||m.k.split('|')[0];
  return wrap('Rates · '+esc(name),`${list.length?`<div class="kpis three"><div class="kpi"><span class="k">Last purchase</span><span class="v small-v">${rf.last?money(rf.last.rate):'—'}</span><span class="d">${rf.last?esc(rf.last.vendorName)+' · '+fd(msDate(rf.last.at)):''}</span></div><div class="kpi"><span class="k">Lowest in 3 months</span><span class="v small-v">${rf.low?money(rf.low.rate):'—'}</span><span class="d">${rf.low?esc(rf.low.vendorName)+' · '+(rf.low.kind==='po'?'PO':'quote'):''}</span></div><div class="kpi"><span class="k">Rates in 3 months</span><span class="v small-v">${rf.n}</span><span class="d">purchases and quotations</span></div></div>
   <div class="tw"><table class="t"><thead><tr><th>Date</th><th>Vendor</th><th>From</th><th class="num">Rate excl. GST</th><th class="num">GST</th></tr></thead><tbody>${list.slice(0,60).map(x=>`<tr><td>${fd(msDate(x.at))}</td><td>${esc(x.vendorName)}</td><td class="small">${x.kind==='po'?'Purchase order':'Quotation'} ${esc(x.no)}</td><td class="num mono">${money(x.rate)}</td><td class="num mono">${fq(x.gst)}%</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty sm"><p>No purchases or quotations for this item yet.</p></div>'}`,`<button class="btn" data-act="closeModal">Close</button>`,'wide')}

/* ---------- finding manufacturers and dealers ---------- */
const VLEAD_T={manufacturer:'Manufacturer',dealer:'Dealer',distributor:'Distributor'};
A.findVendors=d=>{let item=d.desc||'',spec=d.spec||'',unit=d.unit||'',qty=d.qty||'',cat=d.cat||'';
  if(d.rfq){const r=S.rfqs.find(x=>x.id===d.rfq);const l=r&&r.lines.find(x=>x.key===d.key);if(l){item=l.desc;spec=l.spec||'';unit=l.unit;qty=l.qty;cat=l.cat}}
  const sites=d.p?[d.p]:[];const c=S.config||{};
  openModal({type:'findVendors',d:{item,spec,unit,qty:String(qty||''),cat,near:sites.length?siteNear(sites[0]):(c.storeAddress||c.hqAddress||''),nearPick:sites.length?sites[0]:'hq',mfr:true,note:'',res:null}})};
function siteNear(pid){const p=proj(pid)||{};return [p.city,p.state].filter(Boolean).join(', ')||p.name||''}
A.vfNear=d=>{const m=ui.modal.d;m.nearPick=d.val;const c=S.config||{};m.near=d.val==='hq'?(c.storeAddress||c.hqAddress||''):siteNear(d.val);render()};
A.runFindVendors=async()=>{const m=ui.modal,d=m.d;if(!String(d.item).trim()){toast('Enter the item.','err');return}if(!String(d.near).trim()){toast('Enter the delivery place (city, state).','err');return}
  ui.busy=true;d.res=null;render();try{const j=await api('/api/ai/vendors',{item:d.item,spec:d.spec,unit:d.unit,qty:num(d.qty),near:d.near,note:d.note,manufacturers:!!d.mfr});if(ui.modal===m){d.res=j.vendors||[];if(!d.res.length) toast('No suppliers found. Try a simpler item name.','err')}}
  catch(e){toast(errMsg(e),'err')}finally{ui.busy=false;render()}};
A.addLeadVendor=async d=>{const m=ui.modal;const v=(m.d.res||[])[+d.i];if(!v) return;
  if(S.vendors.some(x=>norm(x.name)===norm(v.name))){toast(v.name+' is already a vendor.','err');return}
  const doc={name:v.name.trim(),contact:'',phone:v.phone||'',email:v.email||'',gstin:(v.gstin||'').toUpperCase(),address:[[v.city,v.state].filter(Boolean).join(', '),v.website||''].filter(Boolean).join('\n'),city:[v.city,v.state].filter(Boolean).join(', '),payment:'',rating:'',categories:m.d.cat?[m.d.cat]:[],notes:[VLEAD_T[v.type]||'',v.products||'',v.website||'',v.km?'about '+Math.round(v.km)+' km from '+m.d.near:'','Found by vendor search '+today()].filter(Boolean).join(' · '),active:true,at:Date.now()};
  if(await run(()=>setDoc('vendors',newId(),doc),v.name+' added to vendors')){v.added=true;render()}};
function findVendorsModal(m,busy){const d=m.d;const res=d.res;const known=S.vendors.filter(v=>v.active!==false&&(!d.cat||(v.categories||[]).includes(d.cat)));
  const nearList=[['hq','HQ store'],...S.projects.filter(p=>p.active!==false).map(p=>[p.id,p.name||p.code])];
  const st=String(d.near||'').toLowerCase();const score=v=>{const a=String((v.city||'')+' '+(v.state||'')+' '+(v.address||'')).toLowerCase();return st&&a&&st.split(/[ ,]+/).filter(w=>w.length>2).some(w=>a.includes(w))?0:1};
  return wrap('Find vendors',`<div class="fields">${field('Item','modal.d.item',d.item,'placeholder="e.g. DI K-7 pipe"','span2')}${field('Size / specification','modal.d.spec',d.spec)}${field('Quantity','modal.d.qty',d.qty,'inputmode="decimal"')}
   <div class="f span2"><label for="f-modal-d-nearPick">Deliver to</label><select class="inp" id="f-modal-d-nearPick" data-act-change="vfNearSel">${selOpts(nearList.map(([v,l])=>({v,l})),d.nearPick)}</select></div>${field('Place (city, state)','modal.d.near',d.near,'placeholder="e.g. Bathinda, Punjab"','span2')}
   ${field('Note (optional)','modal.d.note',d.note,'placeholder="e.g. ISI marked, IS 8329, BIS licence"','span2')}<label class="check span2"><input type="checkbox" data-bind="modal.d.mfr" ${d.mfr?'checked':''}> Manufacturers only</label></div>
   <div class="row"><button class="btn primary" data-act="runFindVendors" ${busy}>${icon('search')} ${ui.busy?'Searching the web… (up to a minute)':'Search the web'}</button><span class="small muted">Uses the company's AI key. The results are leads to check — call and verify before ordering.</span></div>
   ${res?(res.length?`<div class="tw"><table class="t"><thead><tr><th>Supplier</th><th>Type</th><th>Place</th><th class="num">Distance</th><th>Contact</th><th></th></tr></thead><tbody>${res.map((v,i)=>`<tr><td><b>${esc(v.name)}</b><small class="muted block">${esc(v.products||'')}${v.why?' — '+esc(v.why):''}</small>${v.source?`<a class="small" href="${esc(v.source)}" target="_blank" rel="noopener noreferrer">source</a>`:''}</td><td class="small">${esc(VLEAD_T[v.type]||v.type||'')}</td><td class="small">${esc([v.city,v.state].filter(Boolean).join(', '))}</td><td class="num mono">${v.km?'~'+fq(Math.round(v.km))+' km':'—'}</td><td class="small">${[v.phone,v.email].filter(Boolean).map(esc).join('<br>')}${v.website?`<br><a href="${esc(/^https?:/.test(v.website)?v.website:'https://'+v.website)}" target="_blank" rel="noopener noreferrer">${esc(v.website)}</a>`:''}${v.gstin?'<br>GSTIN '+esc(v.gstin):''}</td><td>${v.added?'<span class="chip green plain">added</span>':can('masters_vendors')?`<button class="btn sm" data-act="addLeadVendor" data-i="${i}">${icon('plus')} Add as vendor</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty sm"><p>Nothing found.</p></div>'):''}
   <div class="lbl">Vendors already on record${d.cat?' for '+esc(catName(d.cat)):''} (same place first)</div>
   ${known.length?`<div class="list">${known.slice().sort((a,b)=>score(a)-score(b)).slice(0,12).map(v=>`<div class="li">${vendorAvatar(v)}<div class="grow"><b>${esc(v.name)}</b><small>${esc([v.city,v.state].filter(Boolean).join(', ')||v.address||'')}${v.phone?' · '+esc(v.phone):''}</small></div>${score(v)===0?'<span class="chip green plain">near</span>':''}</div>`).join('')}</div>`:'<p class="small muted">None yet.</p>'}`,
   `<button class="btn" data-act="closeModal">Close</button>`,'wide')}
CH.vfNearSel=el=>A.vfNear({val:el.value});

/* ---------- hooks into the existing screens ---------- */
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='estEdit'?estEditModal(m,busy):m.type==='rateHist'?rateHistModal(m):m.type==='findVendors'?findVendorsModal(m,busy):prev(m,busy)}
{const prev=view;view=function(){let h=prev();
  if(ui.role==='hq'&&ui.view==='rfq'){const r=S.rfqs.find(x=>x.id===ui.param);if(r&&estOf(r)){const card=estimateCard(r);const i=h.indexOf('<section class="card"><div class="card-h"><h2>Vendors</h2>');h=i>=0?h.slice(0,i)+card+h.slice(i):card+h}}
  if(ui.role==='hq'&&ui.view==='vendors'&&(can('rfq_create')||can('masters_vendors'))) h=`<div class="row end" style="margin-bottom:10px"><button class="btn primary" data-act="findVendors">${icon('search')} Find manufacturers / dealers</button></div>`+h;
  return h}}
// sending is held until the estimate is approved
for(const k of ['mailRfq','mailRfqAll','logSend','copyRfq','enterQuote']){const prev=A[k];A[k]=(d,el,e)=>{const r=rfqOf();if(r&&!estOk(r)){if(e&&e.preventDefault) e.preventDefault();toast('The estimate must be approved before the RFQ goes to vendors.','err');return}return prev(d,el,e)}}
