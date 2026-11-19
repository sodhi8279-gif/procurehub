/* Amendment of site stock (9.3.3).
   At site, the project manager gives the actual quantity of an item (Amend stock on a
   row of the stock register, or a Physical count of many items) with the reason. It
   goes to HQ; when the administrator (or an approver of site corrections) approves,
   a stock correction entry is made and the stock shows the actual quantity. Until
   then the register is not changed. HQ users still correct stock directly. */

const saCanAsk=()=>ui.role==='site'&&!ui.preview&&isPM();
const saPending=pid=>S.corrections.filter(c=>c.action==='stock'&&c.status==='pending'&&c.projectId===pid);
function saWaitingFor(pid,sid,k){for(const c of saPending(pid)) if((c.storeId||'main')===(sid||'main')&&(c.lines||[]).some(l=>l.itemKey===k)) return c;return null}
const saRows=m=>siteRows(m.p).filter(r=>!m.only||r.itemKey===m.only);

A.stockAmend=d=>{const pid=d.p||siteProject();if(multiStore(pid)&&!stoSel(pid)) return toast('Choose the store at the top of the stock register first.','err');
  const w=saWaitingFor(pid,stoSel(pid)||'main',d.k);if(w) return toast(`This item is already waiting for HQ in ${w.no}.`,'err');
  const r=siteRows(pid).find(x=>x.itemKey===d.k);
  openModal({type:'saCount',p:pid,only:d.k,d:{},by:(ui.me&&ui.me.name)||'',reason:'',mode:'qty',c:r?{qty:String(r.bal),desc:r.desc,spec:r.spec||'',unit:r.unit,tq:String(r.bal)}:{}})};
A.saMode=d=>{const m=ui.modal;if(!m||m.type!=='saCount') return;m.mode=d.v;render()};

/* 9.10.0: the entry was made under the wrong item, type / size or unit.
   The quantity is taken out of the wrong item and put in the right one (in its own
   unit and quantity) when HQ approves. */
function saCat(desc,spec,fb){const it=D.itemMap[slug(desc)];return (it&&it.category)||(typeof classify==='function'&&classify(desc,spec||'').cat)||fb||'others'}
function saChangeForm(m,r){const c=m.c;const it=D.itemMap[slug(c.desc||'')];const sizes=(it&&it.sizes)||[];
  const tk=itemKey(c.desc,c.spec,c.unit);const same=tk===r.itemKey;const q=num(c.qty),tq=num(c.tq);
  const names=[...new Set([...siteRows(m.p).map(x=>x.desc),...D.items.filter(x=>!x.hidden).map(x=>x.desc)])].slice(0,1500);
  return `<datalist id="dl-sa-items">${names.map(n=>`<option value="${esc(n)}">`).join('')}</datalist><datalist id="dl-sa-sizes">${[...new Set([...sizes,...siteRows(m.p).filter(x=>norm(x.desc)===norm(c.desc)).map(x=>x.spec).filter(Boolean)])].map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
    <div class="sa-was"><div class="lbl">In the stock register (wrong)</div><div class="who">${thumb({category:r.cat,desc:r.desc},'xs')}<span><b>${esc(r.desc)}</b><small class="spec-block">${esc(r.spec||'')}</small><small class="muted">in stock ${fq(r.bal)} ${esc(r.unit)}</small></span></div></div>
    <div class="fields"><div class="f"><label for="f-modal-c-qty">Quantity entered wrongly (${esc(r.unit)})</label>${inp('modal.c.qty',c.qty,'inputmode="decimal" data-rerender="1"')}<small class="muted">All of it, or only the part entered wrongly</small></div></div>
    <div class="lbl">Correct entry</div>
    <div class="fields"><div class="f span2"><label for="f-modal-c-desc">Correct item</label>${inp('modal.c.desc',c.desc,'list="dl-sa-items" data-rerender="1" placeholder="Item name"')}</div>
      <div class="f"><label for="f-modal-c-spec">Correct type / size / specification</label>${inp('modal.c.spec',c.spec,'list="dl-sa-sizes" data-rerender="1"')}</div>
      <div class="f"><label for="f-modal-c-unit">Correct unit</label><select class="inp" id="f-modal-c-unit" data-bind="modal.c.unit" data-rerender="1">${selOpts(unitsWith(c.unit),c.unit)}</select></div>
      <div class="f"><label for="f-modal-c-tq">Correct quantity (${esc(c.unit||'')})</label>${inp('modal.c.tq',c.tq,'inputmode="decimal" data-rerender="1"')}<small class="muted">${norm(c.unit)!==norm(r.unit)?`In ${esc(c.unit)}, e.g. 100 Mtr = 328.08 RFT`:'Same as above if only the item or size was wrong'}</small></div></div>
    <div class="notice ${same?'warn':''}">${icon('swap')}<span>${same?'The correct item, size and unit are the same as in the register. Change at least one of them, or choose <b>Quantity is wrong</b>.':q>0&&tq>0?`On approval: <b class="t-red">− ${fq(q)} ${esc(r.unit)}</b> ${esc(r.desc)}${r.spec?' · '+esc(r.spec):''} &nbsp;→&nbsp; <b class="t-green">+ ${fq(tq)} ${esc(c.unit)}</b> ${esc(c.desc)}${c.spec?' · '+esc(c.spec):''}`:'Enter both quantities.'}</span></div>`}

{const prev=A.stockCount;A.stockCount=d=>{const pid=d.p||siteProject();if(saCanAsk()&&multiStore(pid)&&!stoSel(pid)) return toast('Choose the store at the top of the stock register first.','err');prev(d);if(saCanAsk()&&ui.modal&&ui.modal.type==='count'){ui.modal.type='saCount';ui.modal.reason='';render()}}}

{const prev=v6Modal;v6Modal=(m,busy)=>{if(m.type!=='saCount') return prev(m,busy);
  const rows=saRows(m);const sid=stoSel(m.p)||'main';const one=!!m.only;
  const r1=one?rows[0]:null;const chg=one&&r1&&m.mode==='change';
  const tog=one&&r1?`<div class="seg sa-seg" role="group" aria-label="What is wrong"><button type="button" class="${chg?'':'on'}" aria-pressed="${!chg}" data-act="saMode" data-v="qty">Quantity is wrong</button><button type="button" class="${chg?'on':''}" aria-pressed="${chg}" data-act="saMode" data-v="change">Item, type / size or unit is wrong</button></div>`:'';
  if(chg) return wrap('Amend stock · '+esc(projCode(m.p))+(multiStore(m.p)?' · '+esc(storeLabel(m.p,sid)):''),
    `${tog}<div class="notice info">${icon('send')}<span>Correct an entry made under the wrong item, type / size or unit. It goes to HQ; the stock register changes only when the administrator or an approver approves.</span></div>${saChangeForm(m,r1)}
    ${field('Why is the entry wrong? (required, HQ sees it)','modal.reason',m.reason,'placeholder="e.g. Received as 2.5 sqmm, entered as 1.5 sqmm by mistake"')}`,
    `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveCount" ${busy}>${icon('send')} Send to HQ for approval</button>`,'wide');
  return wrap((one?'Amend stock':'Physical stock count')+' · '+esc(projCode(m.p))+(multiStore(m.p)?' · '+esc(storeLabel(m.p,sid)):''),
    `${tog}<div class="notice info">${icon('send')}<span>Type the quantity that is <b>actually</b> at site${one?'':' (leave blank to skip an item)'}. The differences go to HQ for approval; the stock register changes only when the administrator approves.</span></div>
    <div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Register</th><th class="num">Actual</th><th class="num">Difference</th></tr></thead><tbody>${rows.map((r,ix)=>{const c=m.d[ix];const diff=c===''||c==null?null:Math.round((num(c)-r.bal)*1000)/1000;const w=saWaitingFor(m.p,sid,r.itemKey);
      return `<tr><td><div class="who">${thumb({category:r.cat,desc:r.desc},'xs')}<span><b>${esc(r.desc)}</b><small class="spec-block">${esc(r.spec||'')}</small>${w?`<small class="t-amber block">Waiting for HQ in ${esc(w.no)}</small>`:''}</span></div></td><td class="num mono">${fq(r.bal)} <small class="muted">${esc(r.unit)}</small></td>
      <td class="num">${w?'':`<input class="inp sm qty" id="cnt-${ix}" data-bind="modal.d.${ix}" value="${esc(c??'')}" inputmode="decimal" data-rerender="1" aria-label="Actual quantity of ${esc(r.desc)}">`}</td><td class="num mono ${diff==null||diff===0?'muted':diff<0?'t-red':'t-green'}">${diff==null?'—':(diff>0?'+':'')+fq(diff)}</td></tr>`}).join('')}</tbody></table></div>
    <div class="fields">${field('Counted by','modal.by',m.by)}</div>${field('Why is the stock wrong? (required, HQ sees it)','modal.reason',m.reason,'placeholder="e.g. Physical count on site; 10 bags hardened and thrown"')}`,
    `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveCount" ${busy}>${icon('send')} Send to HQ for approval</button>`,'wide')}}

{const prev=A.saveCount;A.saveCount=async(...a)=>{const m=ui.modal;if(!m||m.type!=='saCount') return prev(...a);
  const rows=saRows(m);const sid=stoSel(m.p)||'main';const lines=[];
  if(m.only&&m.mode==='change'){const r=rows[0];const c=m.c||{};if(!r) return;
    const q=Math.round(num(c.qty)*1000)/1000,tq=Math.round(num(c.tq)*1000)/1000;const desc=String(c.desc||'').trim(),spec=String(c.spec||'').trim(),unit=String(c.unit||'').trim();
    if(!(q>0)) return toast('Enter the quantity that was entered wrongly.','err');if(q>r.bal+1e-9) return toast(`Only ${fq(r.bal)} ${r.unit} is in the stock register.`,'err');
    if(!desc) return toast('Enter the correct item.','err');if(!unit) return toast('Choose the correct unit.','err');if(!(tq>0)) return toast('Enter the correct quantity.','err');
    if(itemKey(desc,spec,unit)===r.itemKey) return toast('The correct item, size and unit are the same as in the register.','err');
    const reason=String(m.reason||'').trim();if(!reason) return toast('Write why the entry is wrong.','err');
    const line={kind:'change',itemKey:r.itemKey,desc:r.desc,spec:r.spec||'',unit:r.unit,cat:r.cat,book:r.bal,qty:q,to:{desc,spec,unit,cat:saCat(desc,spec,r.cat),qty:tq}};
    if(await run(async()=>{const no=await allocNo('AR',S.corrections);await setDoc('corrections',newId(),{no,action:'stock',storeId:sid,lines:[line],reason,countedBy:String(m.by||'').trim()})},'Stock amendment sent to HQ for approval.')) closeModal();return}
  rows.forEach((r,ix)=>{const v=m.d[ix];if(v===''||v==null) return;if(!(num(v)>=0)) return;const act=Math.round(num(v)*1000)/1000;if(Math.abs(act-r.bal)>1e-9) lines.push({itemKey:r.itemKey,desc:r.desc,spec:r.spec||'',unit:r.unit,cat:r.cat,book:r.bal,actual:act})});
  if(!Object.values(m.d).some(v=>v!==''&&v!=null)) return toast('Enter the actual quantity.','err');
  if(Object.values(m.d).some(v=>v!==''&&v!=null&&!(num(v)>=0))) return toast('Enter valid quantities (0 or more).','err');
  if(!lines.length){closeModal();return toast('The quantities match the register. Nothing to amend.')}
  const reason=String(m.reason||'').trim();if(!reason) return toast('Write why the stock is wrong.','err');
  if(await run(async()=>{const no=await allocNo('AR',S.corrections);await setDoc('corrections',newId(),{no,action:'stock',storeId:sid,lines,reason,countedBy:String(m.by||'').trim()})},`Stock amendment of ${lines.length} item${lines.length>1?'s':''} sent to HQ for approval.`)) closeModal()}}

// how a stock amendment shows in the lists and in the approval box
function saTable(c,hq){const now=r=>{const src=(D.sst[c.projectId]||{})[c.storeId||'main']||(D.site[c.projectId]||{});const x=src[r.itemKey]||(D.site[c.projectId]||{})[r.itemKey];return x?x.bal:null};
  return `<div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Register when sent</th>${hq&&c.status==='pending'?'<th class="num">Register now</th>':''}<th class="num">Actual</th><th class="num">Change</th></tr></thead><tbody>${(c.lines||[]).map(l=>{const n=now(l);
    if(l.kind==='change'&&l.to) return `<tr class="sa-chg"><td><span class="chip amber">Wrong item / unit</span><br><s class="muted">${esc(l.desc)}${l.spec?' · '+esc(l.spec):''}</s><br>→ <b>${esc(l.to.desc)}</b>${l.to.spec?`<small class="spec-block">${esc(l.to.spec)}</small>`:''}</td><td class="num mono">${fq(l.book)} ${esc(l.unit)}</td>${hq&&c.status==='pending'?`<td class="num mono ${n!=null&&Math.abs(n-l.book)>1e-9?'t-amber':''}">${n==null?'—':fq(n)}</td>`:''}<td class="num mono">${fq(l.actual)} ${esc(l.unit)}</td><td class="num mono"><span class="t-red">−${fq(l.qty)} ${esc(l.unit)}</span><br><span class="t-green">+${fq(l.to.qty)} ${esc(l.to.unit)}</span></td></tr>`;
    return `<tr><td><b>${esc(l.desc)}</b><small class="spec-block">${esc(l.spec||'')}</small></td><td class="num mono">${fq(l.book)} ${esc(l.unit)}</td>${hq&&c.status==='pending'?`<td class="num mono ${n!=null&&Math.abs(n-l.book)>1e-9?'t-amber':''}">${n==null?'—':fq(n)}</td>`:''}<td class="num mono">${fq(l.actual)}</td><td class="num mono ${l.diff<0?'t-red':'t-green'}">${l.diff>0?'+':''}${fq(l.diff)}</td></tr>`}).join('')}</tbody></table></div>`}
{const prev=corrChanges;corrChanges=c=>c.action==='stock'?(c.lines||[]).map(l=>l.kind==='change'&&l.to?`${esc(l.desc)}${l.spec?' '+esc(l.spec):''} ${fq(l.qty)} ${esc(l.unit)} → ${esc(l.to.desc)}${l.to.spec?' '+esc(l.to.spec):''} ${fq(l.to.qty)} ${esc(l.to.unit)}`:`${esc(l.desc)}${l.spec?' '+esc(l.spec):''} ${fq(l.book)} → ${fq(l.actual)} ${esc(l.unit)}`).join(' · '):prev(c)}
{const prev=corrStatus;corrStatus=c=>c.action==='stock'?({pending:{label:'Stock amendment waiting for HQ',tone:'amber'},done:{label:'Stock amended',tone:'green'},rejected:{label:'Rejected',tone:'red'},cancelled:{label:'Withdrawn',tone:'plain'}}[c.status]||{label:c.status,tone:'plain'}):prev(c)}
{const prev=A.corrDecide;A.corrDecide=d=>{const c=S.corrections.find(y=>y.id===d.id);if(!c||c.action!=='stock') return prev(d);const ok=d.s==='approved';
  confirmBox({title:(ok?'Approve stock amendment ':'Reject ')+esc(c.no),danger:!ok,yes:ok?'Approve — amend the stock':'Reject',
    body:`<p><b>${esc(projName(c.projectId))}</b>${multiStore(c.projectId)?' · '+esc(storeLabel(c.projectId,c.storeId||'main')):''} · sent by ${esc(c.byName||'')} on ${fdt(c.at)}${c.countedBy?' · counted by '+esc(c.countedBy):''}</p><div class="notice">${icon('chat')}<span>${esc(c.reason)}</span></div>${saTable(c,true)}
      ${ok&&(c.lines||[]).some(l=>l.kind==='change')?'<p class="small muted">For a wrong item / unit, the quantity is taken out of the wrong item and put in the correct one.</p>':''}${ok?'<p class="small muted">A stock correction entry is made for each item with the change shown, and the site stock is recalculated at once. If the register has moved since it was sent (amber), the change is still the one shown.</p>':''}`,
    note:ok?'Note to the site (optional)':'Why is it rejected?',noteVal:'',noteArea:true,
    onYes:async m=>{const note=String(m.noteVal||'').trim();if(!ok&&!note) return toast('Write why it is rejected.','err');
      if(await run(()=>updDoc('corrections',c.id,{status:d.s,note}),ok?'Stock amended.':'Rejected.')) closeModal()}})}}

// "Amend" on each row of the stock register (project manager at site), and the pending ones above it
{const prev=stockTable;stockTable=function(pid){let h=prev(pid);if(!saCanAsk()) return h;
  return h.replace(/<button class="icon-btn sm" data-act="ledger" data-p="([^"]*)" data-k="([^"]*)" title="History and minimum level"/g,(all,p,k)=>`<button class="btn sm ghost" data-act="stockAmend" data-p="${p}" data-k="${k}" title="Amend the stock of this item through HQ">${icon('edit','xs')} Amend</button>`+all)}}
function saSiteCard(pid){const ls=S.corrections.filter(c=>c.action==='stock'&&c.projectId===pid&&(c.status==='pending'||((c.decision||{}).at||0)>Date.now()-5*864e5)).sort((a,b)=>(b.at||0)-(a.at||0));if(!ls.length) return '';
  return `<section class="card"><div class="card-h"><h2>${icon('edit')} Stock amendments</h2><span class="sub">Sent to HQ; the register changes when approved</span></div><div class="list">${ls.map(c=>`<div class="li"><div class="grow"><b>${esc(c.no)}</b> <small>${fdt(c.at)} · ${esc(c.byName||'')} — ${esc(c.reason)}</small><small class="muted">${corrChanges(c)}</small>${c.decision&&c.decision.note?`<small class="muted">HQ: ${esc(c.decision.note)}</small>`:''}</div>${chip(corrStatus(c))}${c.status==='pending'&&saCanAsk()?`<button class="btn sm ghost" data-act="corrCancel" data-id="${c.id}">Withdraw</button>`:''}</div>`).join('')}</div></section>`}
{const prev=stockBody;stockBody=function(pid){return saSiteCard(pid)+prev(pid)}}
