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
  openModal({type:'saCount',p:pid,only:d.k,d:{},by:(ui.me&&ui.me.name)||'',reason:''})};
{const prev=A.stockCount;A.stockCount=d=>{const pid=d.p||siteProject();if(saCanAsk()&&multiStore(pid)&&!stoSel(pid)) return toast('Choose the store at the top of the stock register first.','err');prev(d);if(saCanAsk()&&ui.modal&&ui.modal.type==='count'){ui.modal.type='saCount';ui.modal.reason='';render()}}}

{const prev=v6Modal;v6Modal=(m,busy)=>{if(m.type!=='saCount') return prev(m,busy);
  const rows=saRows(m);const sid=stoSel(m.p)||'main';const one=!!m.only;
  return wrap((one?'Amend stock':'Physical stock count')+' · '+esc(projCode(m.p))+(multiStore(m.p)?' · '+esc(storeLabel(m.p,sid)):''),
    `<div class="notice info">${icon('send')}<span>Type the quantity that is <b>actually</b> at site${one?'':' (leave blank to skip an item)'}. The differences go to HQ for approval; the stock register changes only when the administrator approves.</span></div>
    <div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Register</th><th class="num">Actual</th><th class="num">Difference</th></tr></thead><tbody>${rows.map((r,ix)=>{const c=m.d[ix];const diff=c===''||c==null?null:Math.round((num(c)-r.bal)*1000)/1000;const w=saWaitingFor(m.p,sid,r.itemKey);
      return `<tr><td><div class="who">${thumb({category:r.cat,desc:r.desc},'xs')}<span><b>${esc(r.desc)}</b><small class="spec-block">${esc(r.spec||'')}</small>${w?`<small class="t-amber block">Waiting for HQ in ${esc(w.no)}</small>`:''}</span></div></td><td class="num mono">${fq(r.bal)} <small class="muted">${esc(r.unit)}</small></td>
      <td class="num">${w?'':`<input class="inp sm qty" id="cnt-${ix}" data-bind="modal.d.${ix}" value="${esc(c??'')}" inputmode="decimal" data-rerender="1" aria-label="Actual quantity of ${esc(r.desc)}">`}</td><td class="num mono ${diff==null||diff===0?'muted':diff<0?'t-red':'t-green'}">${diff==null?'—':(diff>0?'+':'')+fq(diff)}</td></tr>`}).join('')}</tbody></table></div>
    <div class="fields">${field('Counted by','modal.by',m.by)}</div>${field('Why is the stock wrong? (required, HQ sees it)','modal.reason',m.reason,'placeholder="e.g. Physical count on site; 10 bags hardened and thrown"')}`,
    `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveCount" ${busy}>${icon('send')} Send to HQ for approval</button>`,'wide')}}

{const prev=A.saveCount;A.saveCount=async(...a)=>{const m=ui.modal;if(!m||m.type!=='saCount') return prev(...a);
  const rows=saRows(m);const sid=stoSel(m.p)||'main';const lines=[];
  rows.forEach((r,ix)=>{const v=m.d[ix];if(v===''||v==null) return;if(!(num(v)>=0)) return;const act=Math.round(num(v)*1000)/1000;if(Math.abs(act-r.bal)>1e-9) lines.push({itemKey:r.itemKey,desc:r.desc,spec:r.spec||'',unit:r.unit,cat:r.cat,book:r.bal,actual:act})});
  if(!Object.values(m.d).some(v=>v!==''&&v!=null)) return toast('Enter the actual quantity.','err');
  if(Object.values(m.d).some(v=>v!==''&&v!=null&&!(num(v)>=0))) return toast('Enter valid quantities (0 or more).','err');
  if(!lines.length){closeModal();return toast('The quantities match the register. Nothing to amend.')}
  const reason=String(m.reason||'').trim();if(!reason) return toast('Write why the stock is wrong.','err');
  if(await run(async()=>{const no=await allocNo('AR',S.corrections);await setDoc('corrections',newId(),{no,action:'stock',storeId:sid,lines,reason,countedBy:String(m.by||'').trim()})},`Stock amendment of ${lines.length} item${lines.length>1?'s':''} sent to HQ for approval.`)) closeModal()}}

// how a stock amendment shows in the lists and in the approval box
function saTable(c,hq){const now=r=>{const src=(D.sst[c.projectId]||{})[c.storeId||'main']||(D.site[c.projectId]||{});const x=src[r.itemKey]||(D.site[c.projectId]||{})[r.itemKey];return x?x.bal:null};
  return `<div class="tw"><table class="t"><thead><tr><th>Item</th><th class="num">Register when sent</th>${hq&&c.status==='pending'?'<th class="num">Register now</th>':''}<th class="num">Actual</th><th class="num">Change</th></tr></thead><tbody>${(c.lines||[]).map(l=>{const n=now(l);
    return `<tr><td><b>${esc(l.desc)}</b><small class="spec-block">${esc(l.spec||'')}</small></td><td class="num mono">${fq(l.book)} ${esc(l.unit)}</td>${hq&&c.status==='pending'?`<td class="num mono ${n!=null&&Math.abs(n-l.book)>1e-9?'t-amber':''}">${n==null?'—':fq(n)}</td>`:''}<td class="num mono">${fq(l.actual)}</td><td class="num mono ${l.diff<0?'t-red':'t-green'}">${l.diff>0?'+':''}${fq(l.diff)}</td></tr>`}).join('')}</tbody></table></div>`}
{const prev=corrChanges;corrChanges=c=>c.action==='stock'?(c.lines||[]).map(l=>`${esc(l.desc)}${l.spec?' '+esc(l.spec):''} ${fq(l.book)} → ${fq(l.actual)} ${esc(l.unit)}`).join(' · '):prev(c)}
{const prev=corrStatus;corrStatus=c=>c.action==='stock'?({pending:{label:'Stock amendment waiting for HQ',tone:'amber'},done:{label:'Stock amended',tone:'green'},rejected:{label:'Rejected',tone:'red'},cancelled:{label:'Withdrawn',tone:'plain'}}[c.status]||{label:c.status,tone:'plain'}):prev(c)}
{const prev=A.corrDecide;A.corrDecide=d=>{const c=S.corrections.find(y=>y.id===d.id);if(!c||c.action!=='stock') return prev(d);const ok=d.s==='approved';
  confirmBox({title:(ok?'Approve stock amendment ':'Reject ')+esc(c.no),danger:!ok,yes:ok?'Approve — amend the stock':'Reject',
    body:`<p><b>${esc(projName(c.projectId))}</b>${multiStore(c.projectId)?' · '+esc(storeLabel(c.projectId,c.storeId||'main')):''} · sent by ${esc(c.byName||'')} on ${fdt(c.at)}${c.countedBy?' · counted by '+esc(c.countedBy):''}</p><div class="notice">${icon('chat')}<span>${esc(c.reason)}</span></div>${saTable(c,true)}
      ${ok?'<p class="small muted">A stock correction entry is made for each item with the change shown, and the site stock is recalculated at once. If the register has moved since it was sent (amber), the change is still the one shown.</p>':''}`,
    note:ok?'Note to the site (optional)':'Why is it rejected?',noteVal:'',noteArea:true,
    onYes:async m=>{const note=String(m.noteVal||'').trim();if(!ok&&!note) return toast('Write why it is rejected.','err');
      if(await run(()=>updDoc('corrections',c.id,{status:d.s,note}),ok?'Stock amended.':'Rejected.')) closeModal()}})}}

// "Amend" on each row of the stock register (project manager at site), and the pending ones above it
{const prev=stockTable;stockTable=function(pid){let h=prev(pid);if(!saCanAsk()) return h;
  return h.replace(/<button class="icon-btn sm" data-act="ledger" data-p="([^"]*)" data-k="([^"]*)" title="History and minimum level"/g,(all,p,k)=>`<button class="btn sm ghost" data-act="stockAmend" data-p="${p}" data-k="${k}" title="Amend the stock of this item through HQ">${icon('edit','xs')} Amend</button>`+all)}}
function saSiteCard(pid){const ls=S.corrections.filter(c=>c.action==='stock'&&c.projectId===pid&&(c.status==='pending'||((c.decision||{}).at||0)>Date.now()-5*864e5)).sort((a,b)=>(b.at||0)-(a.at||0));if(!ls.length) return '';
  return `<section class="card"><div class="card-h"><h2>${icon('edit')} Stock amendments</h2><span class="sub">Sent to HQ; the register changes when approved</span></div><div class="list">${ls.map(c=>`<div class="li"><div class="grow"><b>${esc(c.no)}</b> <small>${fdt(c.at)} · ${esc(c.byName||'')} — ${esc(c.reason)}</small><small class="muted">${corrChanges(c)}</small>${c.decision&&c.decision.note?`<small class="muted">HQ: ${esc(c.decision.note)}</small>`:''}</div>${chip(corrStatus(c))}${c.status==='pending'&&saCanAsk()?`<button class="btn sm ghost" data-act="corrCancel" data-id="${c.id}">Withdraw</button>`:''}</div>`).join('')}</div></section>`}
{const prev=stockBody;stockBody=function(pid){return saSiteCard(pid)+prev(pid)}}
