IC.cash=IC.cash||'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>';
IC.bolt=IC.bolt||'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>';
IC.clip=IC.clip||'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4M8.5 10h7M8.5 14h7M8.5 18h4"/>';
/* ProcureHub — buying demand items in cash or as an emergency purchase.
   On a demand the approver ticks items, sets the quantity to buy that way, and
   chooses: Emergency purchase or Cash purchase. A smaller quantity splits the
   item: the rest stays on the demand for the normal quotation → PO process.
   • Emergency: the Purchase manager / Director (or the approver, if allowed)
     enters the emergency purchase straight from the demand — vendor, rates and
     the PO; the delivery goes direct to the site, against this same demand.
   • Cash: the site (if it may make cash purchases) or HQ buys the items for
     cash; the cash purchase is entered from the demand and marks the items
     bought once it is finally approved. */

const bvLineOpen=(i,l)=>{if(l.status==='rejected'||l.pcRemoved||l.poId||l.rfqId||l.transferId||l.fromStock) return false;if(D.cashSrc[i.id+'|'+l.id]) return false;const inf=lineInfo(i,l);return !['delivered','transit','rejected','po','rfq','precheck'].includes(inf.st)};
const bvCanMark=()=>ui.role==='hq'&&(can('demands_approve')||canEmg());
function bvDraft(i){const b=(ui.draft.bv=ui.draft.bv||{});if(!b[i.id]) b[i.id]={};return b[i.id]}

function buyViaCard(i,siteMode){if(i.cancelled||amendIsOpen(i)||pcPending(i)) return '';
  const ls=i.lines||[];const cashL=ls.filter(l=>lineInfo(i,l).st==='cash'),emgL=ls.filter(l=>lineInfo(i,l).st==='emg');
  let out='';
  // items approved for cash: whoever may buy for cash enters it from here
  if(cashL.length){const may=cashMaySpend();out+=`<section class="card bv-card cash"><div class="card-h"><h2>${icon('cash')} To buy in cash</h2><span class="sub">${cashL.length} item${cashL.length===1?'':'s'} approved for cash purchase${cashL[0].buyViaByName?' by '+esc(cashL[0].buyViaByName):''}</span>${may?`<div class="acts"><button class="btn primary" data-act="cashFromDemand" data-id="${i.id}">${icon('cash')} Enter cash purchase</button></div>`:''}</div>
    <div class="card-b"><ul class="bv-list">${cashL.map(l=>`<li><b>${esc(l.desc)}</b>${l.spec?' · '+esc(l.spec):''} — ${fq(needQty(l))} ${esc(l.unit)}${l.buyViaNote?` <span class="muted small">· ${esc(l.buyViaNote)}</span>`:''}${!siteMode&&bvCanMark()?` <button class="linkish small" data-act="bvUndo" data-ind="${i.id}" data-line="${l.id}">back to normal purchase</button>`:''}</li>`).join('')}</ul>
    <p class="small muted">${may?'Buy these, then press <b>Enter cash purchase</b>: the items are filled in — scan the bill or type the rates. Once the cash purchase is finally approved, the items show as bought.':siteMode?'Your login may not make cash purchases. Ask HQ to give you the right, or HQ will buy and enter them.':'Someone with the right to make cash purchases for this site enters it from this demand.'}</p></div></section>`}
  if(emgL.length){const may=canEmg();out+=`<section class="card bv-card emg"><div class="card-h"><h2>${icon('alert')} To buy as emergency purchase</h2><span class="sub">${emgL.length} item${emgL.length===1?'':'s'} approved for emergency purchase${emgL[0].buyViaByName?' by '+esc(emgL[0].buyViaByName):''}</span>${may&&!siteMode?`<div class="acts"><button class="btn emg-btn" data-act="emgFromDemand" data-id="${i.id}">${icon('alert')} Enter emergency purchase</button></div>`:''}</div>
    <div class="card-b"><ul class="bv-list">${emgL.map(l=>`<li><b>${esc(l.desc)}</b>${l.spec?' · '+esc(l.spec):''} — ${fq(needQty(l))} ${esc(l.unit)}${l.buyViaNote?` <span class="muted small">· ${esc(l.buyViaNote)}</span>`:''}${!siteMode&&bvCanMark()?` <button class="linkish small" data-act="bvUndo" data-ind="${i.id}" data-line="${l.id}">back to normal purchase</button>`:''}</li>`).join('')}</ul>
    <p class="small muted">${siteMode?'HQ buys these urgently from a vendor; the material comes straight to your site under <b>Receive material</b>.':may?'Settle the rate with a registered vendor, then press <b>Enter emergency purchase</b>: the PO and the delivery to site are made against this demand.':'The Purchase manager or the Director (Procurement) enters the emergency purchase from this demand.'}</p></div></section>`}
  // the approver picks items to buy outside the quotation process
  if(!siteMode&&bvCanMark()){const open=ls.filter(l=>bvLineOpen(i,l)&&!l.buyVia);if(open.length){const b=bvDraft(i);const n=open.filter(l=>b[l.id]&&b[l.id].on).length;
    out+=`<section class="card bv-card"><div class="card-h"><h2>${icon('bolt')} Buy some items in cash or as emergency</h2><span class="sub">Tick the items, set how much to buy that way, then choose. The rest stays for the normal quotation and PO.</span></div>
    <div class="tw"><table class="t bv-t"><thead><tr><th style="width:34px"><input type="checkbox" aria-label="Tick all" data-act="bvAll" data-id="${i.id}" ${n===open.length?'checked':''}></th><th>Item</th><th class="num">Needed</th><th class="num">Buy now</th><th>Status</th></tr></thead><tbody>
    ${open.map(l=>{const x=b[l.id]||{};const need=needQty(l);return `<tr class="${x.on?'sel':''}"><td><input type="checkbox" id="bv-${l.id}" data-act="bvTick" data-ind="${i.id}" data-line="${l.id}" ${x.on?'checked':''} aria-label="Tick ${esc(l.desc)}"></td>
      <td><label for="bv-${l.id}"><b>${esc(l.desc)}</b>${l.spec?`<br><small class="muted">${esc(l.spec)}</small>`:''}</label></td><td class="num mono">${fq(need)} ${esc(l.unit)}</td>
      <td class="num">${x.on?`<input class="inp sm qty" id="bvq-${l.id}" data-bind="draft.bv.${i.id}.${l.id}.qty" value="${esc(x.qty??need)}" inputmode="decimal" data-rerender="1" style="width:90px"> <small class="muted">${esc(l.unit)}</small>`:'<span class="muted small">—</span>'}</td>
      <td>${chip(lineInfo(i,l))}</td></tr>`}).join('')}</tbody></table></div>
    <div class="card-f"><span class="small muted">${n?`${n} item${n===1?'':'s'} ticked`:'Tick items to buy outside the quotation process'}</span><span class="spacer"></span>
      <button class="btn" data-act="buyVia" data-id="${i.id}" data-via="cash" ${n?'':'disabled'}>${icon('cash')} Cash purchase</button>
      <button class="btn emg-btn" data-act="buyVia" data-id="${i.id}" data-via="emergency" ${n?'':'disabled'}>${icon('alert')} Emergency purchase</button></div></section>`}}
  return out}

A.bvTick=d=>{const i=S.indents.find(x=>x.id===d.ind);if(!i) return;const b=bvDraft(i);const l=(i.lines||[]).find(x=>x.id===d.line);const x=b[d.line]||(b[d.line]={qty:String(needQty(l))});x.on=!x.on;render()};
A.bvAll=d=>{const i=S.indents.find(x=>x.id===d.id);if(!i) return;const b=bvDraft(i);const open=(i.lines||[]).filter(l=>bvLineOpen(i,l)&&!l.buyVia);const all=open.every(l=>b[l.id]&&b[l.id].on);for(const l of open){const x=b[l.id]||(b[l.id]={qty:String(needQty(l))});x.on=!all}render()};

// mark the ticked items; a smaller quantity splits the item, the rest stays for the normal process
A.buyVia=d=>{const i=S.indents.find(x=>x.id===d.id);if(!i) return;const via=d.via;const b=bvDraft(i);
  if(via==='emergency'&&!can('demands_approve')&&!canEmg()) return toast('You may not approve emergency purchases.','err');
  const pick=[];for(const l of (i.lines||[])){const x=b[l.id];if(!x||!x.on||!bvLineOpen(i,l)||l.buyVia) continue;const q=num(x.qty),need=needQty(l);
    if(!(q>0)) return toast(`Enter the quantity of ${l.desc} to buy now.`,'err');if(q>need+1e-9) return toast(`${l.desc}: you can buy at most ${fq(need)} ${l.unit} this way (what the demand needs).`,'err');pick.push({l,q,need})}
  if(!pick.length) return toast('Tick the items first.','err');
  const what=via==='cash'?'cash purchase':'emergency purchase';
  confirmBox({title:via==='cash'?'Buy in cash':'Buy as emergency purchase',yes:via==='cash'?'Approve for cash purchase':'Approve for emergency purchase',
    body:`<p>These items will be bought by <b>${what}</b> instead of the quotation process:</p><ul>${pick.map(p=>`<li><b>${esc(p.l.desc)}</b>${p.l.spec?' · '+esc(p.l.spec):''} — ${fq(p.q)} ${esc(p.l.unit)}${p.q<p.need-1e-9?` <span class="muted">(the other ${fq(Math.round((p.need-p.q)*1000)/1000)} ${esc(p.l.unit)} stay for the normal PO)</span>`:''}</li>`).join('')}</ul>
      ${pick.some(p=>!p.l.status||p.l.status!=='approved')?'<p class="small muted">Items not yet approved are approved at these quantities.</p>':''}
      <p class="small muted">${via==='cash'?'The site sees <b>To buy in cash</b> on this demand; whoever may make cash purchases enters the purchase from there.':canEmg()?'Next, the emergency purchase form opens with these items.':'The Purchase manager or the Director (Procurement) then enters the emergency purchase from this demand.'}</p>`,
    note:'Reason / instruction (shown to the site)',notePh:via==='cash'?'e.g. Small quantity, buy locally at Pampore':'e.g. Work stopped, needed today',
    onYes:async m=>{const note=String(m.noteVal||'').trim();const me=(ui.me&&ui.me.name)||'';const now=Date.now();
      const ok=await run(async()=>{await patchLines(i.id,ls=>{for(const p of pick){const l=ls.find(x=>x.id===p.l.id);if(!l) continue;const need=needQty(l);
          if(p.q<need-1e-9){const rest=Math.round((need-p.q)*1000)/1000;const nl=JSON.parse(JSON.stringify(l));for(const k of ['buyVia','buyViaBy','buyViaByName','buyViaAt','buyViaNote']) delete nl[k];
            Object.assign(nl,{id:newId(),qty:rest,splitFrom:l.id,siteNote:(l.siteNote?l.siteNote+' · ':'')+'Balance after '+what});if(l.status==='approved') nl.approvedQty=rest;else delete nl.approvedQty;ls.splice(ls.indexOf(l)+1,0,nl)}
          if(l.status!=='approved'){l.status='approved';l.approvedAt=now;l.decidedBy=ui.uid||null;l.decidedByName=me}
          l.approvedQty=p.q;Object.assign(l,{buyVia:via,buyViaBy:ui.uid||null,buyViaByName:me,buyViaAt:now});if(note) l.buyViaNote=note;else delete l.buyViaNote}});
        await addHqRemark(i.id,`Approved for ${what}: `+pick.map(p=>`${p.l.desc}${p.l.spec?' '+p.l.spec:''} ${fq(p.q)} ${p.l.unit}`).join(', ')+(note?' — '+note:''),via==='cash'?'Cash purchase':'Emergency purchase')},
        via==='cash'?'Approved for cash purchase':'Approved for emergency purchase');
      if(ok===false) return;delete ui.draft.bv[i.id];closeModal();if(via==='emergency'&&canEmg()) setTimeout(()=>A.emgFromDemand({id:i.id}),200)}})};

A.bvUndo=d=>confirmBox({title:'Back to normal purchase',body:'<p>The item goes back to the procurement queue for quotation and PO.</p>',yes:'Move back',onYes:async()=>{
  const ok=await run(()=>patchLines(d.ind,ls=>{const l=ls.find(x=>x.id===d.line);if(l) for(const k of ['buyVia','buyViaBy','buyViaByName','buyViaAt','buyViaNote']) delete l[k]}),'Moved back to normal purchase');if(ok!==false) closeModal()}});

// the emergency purchase form, filled from the demand
A.emgFromDemand=d=>{const i=S.indents.find(x=>x.id===d.id);if(!i) return;if(!canEmg()) return toast('Only the Purchase manager, the Director (Procurement) or the administrator can enter an emergency purchase.','err');
  const ls=(i.lines||[]).filter(l=>lineInfo(i,l).st==='emg');if(!ls.length) return toast('No items of this demand are waiting for emergency purchase.','err');
  A.emgNew();const m=ui.modal;if(!m||m.type!=='emg') return;
  Object.assign(m.d,{projectId:i.projectId,requestedBy:i.requestedBy||i.createdByName||'',reason:ls[0].buyViaNote||'',fromIndent:i.id,fromNo:i.no,
    lines:ls.map(l=>{const it=D.itemMap[slug(l.desc)];return {desc:l.desc,spec:l.spec||'',qty:String(needQty(l)),unit:l.unit,rate:'',gst:it&&it.gst!=null&&it.gst!==''?String(it.gst):'',hsn:(it&&it.hsn)||'',category:l.category||'',note:'',lineId:l.id,maxQty:needQty(l),dUnit:l.unit}})});render()};

// the cash purchase form, filled from the demand
A.cashFromDemand=d=>{const i=S.indents.find(x=>x.id===d.id);if(!i) return;if(!cashMaySpend()) return toast('You have not been given the right to make cash purchases.','err');
  const ls=(i.lines||[]).filter(l=>lineInfo(i,l).st==='cash');if(!ls.length) return toast('No items of this demand are waiting for cash purchase.','err');
  A.cashNew({});const m=ui.modal;if(!m) return;
  Object.assign(m.d,{location:'site',projectId:i.projectId,mode:'',purpose:`Against demand ${i.no}${ls[0].buyViaNote?' — '+ls[0].buyViaNote:''}`,fromIndent:i.id,fromNo:i.no,srcs:ls.map(l=>({indentId:i.id,lineId:l.id,desc:l.desc,spec:l.spec||'',qty:needQty(l),unit:l.unit,on:true})),
    lines:ls.map(l=>{const last=typeof cashLast==='function'?cashLast(l.desc,l.spec):null;const it=D.itemMap[slug(l.desc)];return {desc:l.desc,spec:l.spec||'',unit:l.unit,qty:String(needQty(l)),rate:last&&last.rate?String(last.rate):'',gst:last&&last.gst!=null&&last.gst!==''?String(last.gst):it&&it.gst!=null&&it.gst!==''?String(it.gst):'18',usedNow:'',hint:last?`Last bought at ${money(last.rate)} per ${last.unit||''}${last.from?' from '+last.from:''}`:''}})});render()};
// the box on the cash form showing which demand items it buys
function cashSrcBox(d){if(!(d.srcs||[]).length) return '';return `<div class="notice info">${icon('clip')}<span><b>Against demand ${esc(d.fromNo||'')}</b> — these items are marked bought when this cash purchase is finally approved. Untick any you did not buy:
  <span class="bv-src">${d.srcs.map((s,k)=>`<label class="check"><input type="checkbox" data-act="cashSrcTick" data-k="${k}" ${s.on?'checked':''}> ${esc(s.desc)}${s.spec?' · '+esc(s.spec):''} — ${fq(s.qty)} ${esc(s.unit)}</label>`).join('')}</span></span></div>`}
A.cashSrcTick=d=>{const s=ui.modal.d.srcs[+d.k];if(s) s.on=!s.on;render()};
Object.assign(ACT_PERM,{restoreIndent:['demands_approve'],buyVia:['demands_approve','emergency_purchase','po_approve'],bvTick:['demands_approve','emergency_purchase','po_approve'],bvAll:['demands_approve','emergency_purchase','po_approve'],bvUndo:['demands_approve','emergency_purchase','po_approve'],cashSrcTick:['cash_spend','cash_approve','po_approve']});

/* ---- comparative: split one item's quantity between two vendors ----
   The item becomes two lines on the comparative (e.g. 300 + 200 bags), each
   keeping every vendor's quoted rate, so each part can be awarded to a
   different vendor; the POs are then made one per vendor as usual. */
A.rfqSplit=d=>{const r=rfqOf();const l=r&&r.lines.find(x=>x.key===d.k);if(!l) return;if(r.status==='approved'||r.status==='ordered') return toast('Reopen the comparative to split an item.','err');
  openModal({type:'rfqSplit',rfq:r.id,k:l.key,d:{q1:String(Math.round(l.qty/2*1000)/1000)}})};
{const prev=v6Modal;v6Modal=(m,busy)=>{if(m.type!=='rfqSplit') return prev(m,busy);const r=S.rfqs.find(x=>x.id===m.rfq);const l=r&&r.lines.find(x=>x.key===m.k);if(!l) return '';
  const q1=num(m.d.q1),q2=Math.round((l.qty-q1)*1000)/1000;const ok=q1>0&&q2>0;
  return wrap('Split between vendors',`<p><b>${esc(l.desc)}</b>${l.spec?' · '+esc(l.spec):''} — ${fq(l.qty)} ${esc(l.unit)} on this comparative.</p>
   <p class="small muted">The item becomes two lines. Every vendor's quoted rate stays on both, so you can award the first part to one vendor and the second part to another. Each vendor then gets its own PO.</p>
   <div class="fields"><div class="f"><label for="f-modal-d-q1">First part (${esc(l.unit)})</label><input class="inp" id="f-modal-d-q1" data-bind="modal.d.q1" value="${esc(m.d.q1)}" inputmode="decimal" data-rerender="1"></div>
   <div class="f"><label>Second part (${esc(l.unit)})</label><input class="inp" value="${ok?fq(q2):''}" disabled></div></div>
   ${ok?'':`<p class="small t-red">The first part must be more than 0 and less than ${fq(l.qty)}.</p>`}`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveRfqSplit" ${busy} ${ok?'':'disabled'}>${icon('swap')} Split</button>`)}}
A.saveRfqSplit=async()=>{const m=ui.modal;const r=S.rfqs.find(x=>x.id===m.rfq);if(!r) return;const lines=JSON.parse(JSON.stringify(r.lines));const ix=lines.findIndex(x=>x.key===m.k);if(ix<0) return;const l=lines[ix];
  const q1=Math.round(num(m.d.q1)*1000)/1000,total=num(l.qty);if(!(q1>0&&q1<total)) return toast('Enter the quantity of the first part.','err');const frac=q1/total;
  let nk=l.key+'b',n=2;while(lines.some(x=>x.key===nk)) nk=l.key+'b'+(n++);
  const T=sum(l.srcs||[],s=>num(s.qty)),target=Math.round(T*frac*1000)/1000;const s1=[],s2=[],cuts=[];let acc=0;
  for(const s of l.srcs||[]){const q=num(s.qty);if(acc+q<=target+1e-9){s1.push(s);acc+=q}else if(acc>=target-1e-9) s2.push(s);
    else{const part=Math.round((target-acc)*1000)/1000,rest=Math.round((q-part)*1000)/1000,nid=newId();s1.push(Object.assign({},s,{qty:part},s.origQty!=null?{origQty:part}:{}));s2.push(Object.assign({},s,{lineId:nid,qty:rest},s.origQty!=null?{origQty:rest}:{}));cuts.push({iid:s.indentId,lid:s.lineId,nid,part,rest});acc=target}}
  const a=Object.assign({},l,{qty:q1,srcs:s1}),b=JSON.parse(JSON.stringify(l));Object.assign(b,{key:nk,qty:Math.round((total-q1)*1000)/1000,srcs:s2,splitOf:l.key});delete b.qtyChg;
  if(l.bf>0&&l.dQty!=null){a.dQty=Math.round(l.dQty*frac*1000)/1000;b.dQty=Math.round((l.dQty-a.dQty)*1000)/1000}
  lines.splice(ix,1,a,b);
  const quotes=JSON.parse(JSON.stringify(r.quotes||{}));for(const q of Object.values(quotes)) for(const f of Object.keys(q)){const o=q[f];if(o&&typeof o==='object'&&!Array.isArray(o)&&Object.prototype.hasOwnProperty.call(o,l.key)) o[nk]=JSON.parse(JSON.stringify(o[l.key]))}
  const award=Object.assign({},r.award||{});if(award[l.key]) award[nk]=award[l.key];
  const ok=await run(async()=>{for(const c of cuts) await patchLines(c.iid,ls=>{const x=ls.find(y=>y.id===c.lid);if(!x) return;const nl=JSON.parse(JSON.stringify(x));Object.assign(nl,{id:c.nid,qty:c.rest,approvedQty:c.rest,splitFrom:x.id});x.approvedQty=c.part;ls.splice(ls.indexOf(x)+1,0,nl)});
    await updDoc('rfqs',r.id,{lines,quotes,award})},`Split into ${fq(q1)} + ${fq(Math.round((total-q1)*1000)/1000)} ${l.unit} — award each part to its vendor`);if(ok!==false) closeModal()};
Object.assign(ACT_PERM,{rfqSplit:['compare_approve','rfq_create'],saveRfqSplit:['compare_approve','rfq_create']});

// Sourcing queue: demands with items approved for emergency or cash purchase
function bvQueueBanner(){const by={};for(const x of allLines()){if(x.info.st!=='emg'&&x.info.st!=='cash') continue;const b=by[x.ind.id]||(by[x.ind.id]={ind:x.ind,emg:0,cash:0});b[x.info.st]++}
  const xs=Object.values(by);if(!xs.length) return '';
  return `<section class="card bv-card emg"><div class="card-h"><h2>${icon('alert')} Approved for emergency or cash purchase</h2><span class="sub">These items are not sent for quotation</span></div><div class="list">${xs.map(b=>`<button class="li" data-act="openIndent" data-id="${b.ind.id}"><div class="grow"><b><span class="docno">${esc(b.ind.no)}</span> · ${esc(projCode(b.ind.projectId))}</b><small>${b.emg?`<span class="chip red xs">${b.emg} emergency</span> `:''}${b.cash?`<span class="chip amber xs">${b.cash} cash</span>`:''}</small></div>${icon('chev')}</button>`).join('')}</div></section>`}
{const prev=vQueue;vQueue=function(){return bvQueueBanner()+prev()}}
