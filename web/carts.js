IC.cart=IC.cart||'<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2l1.6-6.8H6.2"/>';
/* ProcureHub — purchase carts.
   Approved demand items from the procurement queue can be gathered in a cart, for
   example all pending demands of one site, several demands of one site, or the same
   item asked for by different sites, and then bought together:
     • Call for quotations: one RFQ for the whole cart; identical items of different
       sites become one enquiry line, as in the queue. After the comparative, the POs
       are made as usual.
     • Cash purchase / Emergency purchase: the items are approved for that way of
       buying, then one cash or emergency purchase is entered per site (it may cover
       several demands of that site).
   Each item stays on its own demand: it keeps its demand number, its site and its
   delivery to that site. In the cart only the quantity to buy now (the rest stays in
   the queue) and a note can be changed. Nothing changes for items not put in a cart. */

const CRT_PERM=['rfq_create','demands_approve','emergency_purchase','po_approve'];
const crtCan=()=>ui.role==='hq'&&CRT_PERM.some(p=>can(p));
const crtOpenList=()=>(S.carts||[]).filter(c=>c.status!=='closed').sort((a,b)=>(b.at||0)-(a.at||0));
// demand line → the open cart it is in
function crtIndex(){const m={};for(const c of crtOpenList()) for(const it of c.items||[]) m[it.indentId+'|'+it.lineId]=c;return m}
function crtChip(k,idx){const c=(idx||crtIndex())[k];return c?` <button class="chip violet click small" data-act="go" data-v="carts" data-p="${esc(c.id)}" title="In purchase cart ${esc(c.no)}">${icon('cart','xs')} ${esc(crtShort(c))}</button>`:''}
const crtShort=c=>c.name?c.name:String(c.no||'').split('/').pop()?'Cart '+String(c.no||'').split('/').pop():'Cart';
// the cart's items with their demand and line as they are now
function crtRows(c){return (c.items||[]).map((it,i)=>{const ind=S.indents.find(x=>x.id===it.indentId);const l=ind&&(ind.lines||[]).find(x=>x.id===it.lineId);
  const info=ind&&l&&!ind.cancelled?lineInfo(ind,l):{st:'gone',label:'No longer on the demand',tone:'red',need:0};
  const need=l?needQty(l):0;const q=it.qty==null||it.qty===''?need:Math.min(num(it.qty),need);
  return {i,it,ind,l,info,need,q,k:it.indentId+'|'+it.lineId,open:info.st==='source',pid:ind&&ind.projectId}})}
const crtItemKey=l=>itemKey(l.desc,l.spec,l.unit);

/* ---------- procurement queue: two more ways to see it, and Add to cart ---------- */
function crtQueueGroups(L,by,row,head){
  if(by==='site'){const g={};for(const x of L)(g[x.ind.projectId]=g[x.ind.projectId]||[]).push(x);
    return Object.keys(g).sort((a,b)=>projName(a).localeCompare(projName(b))).map(pid=>{const xs=g[pid];const p=proj(pid)||{};const inds=[...new Set(xs.map(x=>x.ind.id))];const allSel=xs.every(x=>ui.sel[x.k]);
      return `<section class="card"><div class="q-banner"><span class="mini-cover">${cover(p)}</span><div class="grow"><h2>${esc(projName(pid))}</h2><small>${xs.length} line${xs.length===1?'':'s'} to source from ${inds.length} demand${inds.length===1?'':'s'}: ${inds.map(id=>esc((S.indents.find(i=>i.id===id)||{}).no||'')).join(', ')}</small></div>
      <div class="acts"><button class="btn sm" data-act="crtSelGroup" data-by="site" data-v="${esc(pid)}">${allSel?'Unselect all':'Select all'}</button>${crtCan()?`<button class="btn sm primary" data-act="crtQuick" data-by="site" data-v="${esc(pid)}">${icon('cart')} Cart for this site</button>`:''}</div></div>
      <div class="tw"><table class="t">${head}<tbody>${xs.sort((a,b)=>String(a.ind.no).localeCompare(String(b.ind.no))).map(row).join('')}</tbody></table></div></section>`}).join('')}
  // the same item asked for by different sites / demands
  const g={};for(const x of L)(g[crtItemKey(x.l)]=g[crtItemKey(x.l)]||[]).push(x);
  const keys=Object.keys(g).sort((a,b)=>g[b].length-g[a].length||String(g[a][0].l.desc).localeCompare(String(g[b][0].l.desc)));
  return `<p class="small muted">${icon('layers','xs')} Each item with the total asked for by all sites. Items asked for more than once are at the top.</p>`+keys.map(k=>{const xs=g[k];const l=xs[0].l;const tot=sum(xs,x=>x.info.need);const sites=[...new Set(xs.map(x=>x.ind.projectId))];const allSel=xs.every(x=>ui.sel[x.k]);
    return `<section class="card"><div class="q-banner"><div class="grow"><div class="who">${lineThumb(l,'sm')}<span><h2 style="margin:0">${esc(l.desc)}</h2><span class="spec-block">${esc(l.spec||'')}</span></span></div><small>Total <b class="mono">${fq(tot)} ${esc(l.unit)}</b> · ${xs.length} demand line${xs.length===1?'':'s'} · ${sites.length} site${sites.length===1?'':'s'}: ${sites.map(p=>esc(projCode(p))).join(', ')}</small></div>
    <div class="acts"><button class="btn sm" data-act="crtSelGroup" data-by="item" data-v="${esc(k)}">${allSel?'Unselect all':'Select all'}</button>${crtCan()?`<button class="btn sm primary" data-act="crtQuick" data-by="item" data-v="${esc(k)}">${icon('cart')} Cart for this item</button>`:''}</div></div>
    <div class="tw"><table class="t">${head}<tbody>${xs.map(row).join('')}</tbody></table></div></section>`}).join('')}
function crtGroupLines(by,v){return queueLines().filter(x=>by==='site'?x.ind.projectId===v:by==='item'?crtItemKey(x.l)===v:by==='mr'?x.ind.id===v:false)}
A.crtSelGroup=d=>{const g=crtGroupLines(d.by,d.v);const all=g.every(x=>ui.sel[x.k]);for(const x of g) ui.sel[x.k]=!all;render()};
A.crtQuick=d=>{const g=crtGroupLines(d.by,d.v);if(!g.length) return;
  const name=d.by==='site'?projName(d.v):d.by==='item'?(g[0].l.desc+(g[0].l.spec?' '+g[0].l.spec:'')):(g[0].ind.no||'');crtPick(g.map(x=>x.k),name)};
A.crtFromSel=()=>{const keys=Object.keys(ui.sel).filter(k=>ui.sel[k]&&queueLines().some(x=>x.k===k));if(!keys.length) return toast('Select lines first.','err');crtPick(keys,'')};
// choose: a new cart or one that is open
function crtPick(keys,name){const idx=crtIndex();const free=keys.filter(k=>!idx[k]);
  if(!free.length) return toast('These items are already in a purchase cart.','err');
  openModal({type:'crtPick',d:{keys:free,skipped:keys.length-free.length,to:'__new',name}})}

/* ---------- making a cart from the Carts page: by site, demands of a site, or the same item ---------- */
A.crtNew=()=>{const L=queueLines();if(!L.length) return toast('Nothing is waiting in the procurement queue.','err');
  const pids=[...new Set(L.map(x=>x.ind.projectId))];openModal({type:'crtNew',d:{mode:'site',pid:pids.length===1?pids[0]:'',sel:{},name:'',q:''}})};
function crtNewCands(d){const idx=crtIndex();const L=queueLines().filter(x=>!idx[x.k]);
  if(d.mode==='site'){const g={};for(const x of L)(g[x.ind.projectId]=g[x.ind.projectId]||[]).push(x);return Object.entries(g).map(([pid,xs])=>({id:pid,t:projName(pid),s:`${xs.length} item${xs.length===1?'':'s'} · ${new Set(xs.map(x=>x.ind.id)).size} demand${new Set(xs.map(x=>x.ind.id)).size===1?'':'s'}`,keys:xs.map(x=>x.k)}))}
  if(d.mode==='demands'){const g={};for(const x of L) if(!d.pid||x.ind.projectId===d.pid)(g[x.ind.id]=g[x.ind.id]||[]).push(x);
    return Object.values(g).map(xs=>{const i=xs[0].ind;return {id:i.id,t:`${i.no} · ${projCode(i.projectId)}`,s:`${xs.length} item${xs.length===1?'':'s'} · needed by ${fd(i.requiredBy)}${i.priority&&i.priority!=='Normal'?' · '+i.priority:''} — ${xs.slice(0,3).map(x=>x.l.desc).join(', ')}${xs.length>3?'…':''}`,keys:xs.map(x=>x.k)}})}
  const g={};const q=norm(d.q||'');for(const x of L){if(q&&!norm(x.l.desc+' '+(x.l.spec||'')).includes(q)) continue;(g[crtItemKey(x.l)]=g[crtItemKey(x.l)]||[]).push(x)}
  return Object.entries(g).sort((a,b)=>b[1].length-a[1].length).map(([k,xs])=>{const l=xs[0].l;const sites=[...new Set(xs.map(x=>x.ind.projectId))];
    return {id:k,t:l.desc+(l.spec?' · '+l.spec:''),s:`${fq(sum(xs,x=>x.info.need))} ${l.unit} in all · ${sites.length} site${sites.length===1?'':'s'}: ${sites.map(projCode).join(', ')}`,keys:xs.map(x=>x.k)}})}
A.crtNewMode=d=>{const m=ui.modal;m.d.mode=d.val;m.d.sel={};render()};
A.crtNewTick=d=>{const s=ui.modal.d.sel;s[d.id]=!s[d.id];render()};
A.crtNewAll=()=>{const d=ui.modal.d;const cs=crtNewCands(d);const all=cs.every(c=>d.sel[c.id]);for(const c of cs) d.sel[c.id]=!all;render()};
A.crtNewSave=async()=>{const d=ui.modal.d;const cs=crtNewCands(d).filter(c=>d.sel[c.id]);if(!cs.length) return toast('Tick what goes in the cart.','err');
  const keys=cs.flatMap(c=>c.keys);const name=String(d.name||'').trim()||(cs.length===1?cs[0].t:'');await crtSave('__new',keys,name)};

async function crtSave(to,keys,name){const items=keys.map(k=>{const [indentId,lineId]=k.split('|');return {indentId,lineId,qty:null,note:''}});
  const me=(ui.me&&ui.me.name)||'';const now=Date.now();
  const id=await run(async()=>{if(to!=='__new'){const c=S.carts.find(x=>x.id===to);if(!c) throw {message:'The cart was not found.'};const have=new Set((c.items||[]).map(x=>x.indentId+'|'+x.lineId));
      await updDoc('carts',c.id,{items:(c.items||[]).concat(items.filter(x=>!have.has(x.indentId+'|'+x.lineId))),log:(c.log||[]).concat({at:now,name:me,t:`${items.length} item${items.length===1?'':'s'} added`})});return c.id}
    const no=await allocNo('CART',S.carts||[]);const nid=newId();
    await setDoc('carts',nid,{no,name:String(name||'').slice(0,80),status:'open',items,at:now,by:ui.uid||null,byName:me,log:[{at:now,name:me,t:`Made with ${items.length} item${items.length===1?'':'s'}`}]});return nid});
  if(!id) return;ui.sel={};closeModal();toast(`${items.length} item${items.length===1?'':'s'} put in the purchase cart.`);go('carts',id)}
A.crtPickSave=async()=>{const d=ui.modal.d;await crtSave(d.to,d.keys,d.to==='__new'?d.name:'')};

/* ---------- the modals ---------- */
{const prev=v6Modal;v6Modal=(m,busy)=>{
  if(m.type==='crtPick'){const d=m.d;const open=crtOpenList();
    return wrap(`${icon('cart')} Add to purchase cart`,`<p>${d.keys.length} item${d.keys.length===1?'':'s'} from the procurement queue${d.skipped?` <span class="muted small">(${d.skipped} already in a cart are left out)</span>`:''}. Each item stays on its own demand and is delivered to its own site.</p>
      <div class="f full"><label for="f-modal-d-to">Put them in</label><select class="inp" id="f-modal-d-to" data-bind="modal.d.to" data-rerender="1"><option value="__new" ${d.to==='__new'?'selected':''}>A new cart</option>${open.map(c=>`<option value="${esc(c.id)}" ${d.to===c.id?'selected':''}>${esc(c.no)}${c.name?' · '+esc(c.name):''} (${(c.items||[]).length} items)</option>`).join('')}</select></div>
      ${d.to==='__new'?`<div class="f full"><label for="f-modal-d-name">Name of the cart <span class="muted small">(optional)</span></label>${inp('modal.d.name',d.name,'placeholder="e.g. Pipes for Nangal and Ropar"')}</div>`:''}`,
      `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="crtPickSave" ${busy}>${icon('cart')} Put in cart</button>`)}
  if(m.type==='crtNew'){const d=m.d;const cs=crtNewCands(d);const pids=[...new Set(queueLines().map(x=>x.ind.projectId))];const n=cs.filter(c=>d.sel[c.id]).length;
    return wrap(`${icon('cart')} New purchase cart`,`<p class="small muted">Gather items that are waiting in the procurement queue. Each item keeps its demand, its site and its delivery to that site.</p>
      <div class="f full"><label>Gather</label>${seg('crtmode',[['site','All demands of a site'],['demands','Chosen demands'],['items','The same item, all sites']],d.mode,'crtNewMode')}</div>
      ${d.mode==='demands'?`<div class="f"><label for="f-modal-d-pid">Site</label><select class="inp" id="f-modal-d-pid" data-bind="modal.d.pid" data-rerender="1"><option value="">All sites</option>${pids.map(p=>`<option value="${esc(p)}" ${d.pid===p?'selected':''}>${esc(projName(p))}</option>`).join('')}</select></div>`:''}
      ${d.mode==='items'?`<div class="f"><label for="f-modal-d-q">Find item</label>${inp('modal.d.q',d.q,'placeholder="e.g. DI pipe" data-rerender="1"')}</div>`:''}
      ${cs.length?`<div class="row tight"><button type="button" class="btn sm" data-act="crtNewAll">${cs.every(c=>d.sel[c.id])?'Untick all':'Tick all'}</button><span class="small muted">${n} ticked</span></div>
      <div class="crt-cands">${cs.map(c=>`<label class="crt-cand ${d.sel[c.id]?'on':''}"><input type="checkbox" data-act="crtNewTick" data-id="${esc(c.id)}" ${d.sel[c.id]?'checked':''}><span><b>${esc(c.t)}</b><small class="muted block">${esc(c.s)}</small></span></label>`).join('')}</div>`:'<p class="muted">Nothing here that is not already in a cart.</p>'}
      <div class="f full"><label for="f-modal-d-name">Name of the cart <span class="muted small">(optional)</span></label>${inp('modal.d.name',d.name,'placeholder="e.g. WTP Nangal — November"')}</div>`,
      `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="crtNewSave" ${busy} ${n?'':'disabled'}>${icon('cart')} Make cart</button>`,'wide')}
  return prev(m,busy)}}

/* ---------- the Carts page ---------- */
HQ_VIEWS.push('carts');Object.assign(VIEW_PERM,{carts:CRT_PERM});
Object.assign(TITLES,{carts:['Purchase carts','Demand items gathered to be bought together — each keeps its demand and site']});
{const prev=view;view=function(){if(ui.role==='hq'&&ui.view==='carts') return ui.param&&(S.carts||[]).some(c=>c.id===ui.param)?vCart(S.carts.find(c=>c.id===ui.param)):vCarts();return prev()}}
{const prev=navItems;navItems=function(){const n=prev();if(ui.role!=='hq'||!viewAllowed('carts')) return n;const i=n.findIndex(x=>x.v==='queue');if(i>=0) n.splice(i+1,0,{v:'carts',l:'Purchase carts',i:'cart',b:crtOpenList().filter(c=>crtRows(c).some(r=>r.open||r.info.st==='cash'||r.info.st==='emg')).length});return n}}

function crtSummary(c){const rs=crtRows(c);const n=st=>rs.filter(r=>r.info.st===st).length;
  const parts=[[n('source'),'to buy','violet'],[n('rfq'),'getting quotations','violet'],[n('cash'),'to buy in cash','amber'],[n('emg'),'to buy as emergency','red'],[n('po')+n('transit'),'ordered','blue'],[n('delivered'),'delivered','green'],[n('gone')+n('rejected'),'no longer open','red']];
  return parts.filter(p=>p[0]).map(p=>`<span class="chip ${p[2]}">${p[0]} ${p[1]}</span>`).join(' ')}
function vCarts(){const all=(S.carts||[]).slice().sort((a,b)=>(b.at||0)-(a.at||0));const shown=ui.f.crtc?all:all.filter(c=>c.status!=='closed');
  return `<section class="card"><div class="card-h"><h2>${icon('cart')} Purchase carts</h2><span class="sub">Gather approved demand items of one site, several demands, or the same item of many sites, and buy them together by quotation and PO, in cash or as an emergency purchase.</span>
    <div class="acts">${crtCan()?`<button class="btn primary" data-act="crtNew">${icon('plus')} New cart</button>`:''}<button class="btn" data-act="go" data-v="queue">${icon('queue')} Procurement queue</button></div></div>
    <div class="card-b"><p class="small muted">${icon('help','xs')} You can also tick lines in the <b>Procurement queue</b> and press <b>Add to cart</b>, or use <b>Cart for this site</b> / <b>Cart for this item</b> there. Items not put in a cart go on as before.</p></div>
    ${shown.length?`<div class="tw"><table class="t"><thead><tr><th>Cart</th><th>Sites</th><th class="num">Items</th><th>Where they stand</th><th>Made</th><th></th></tr></thead><tbody>${shown.map(c=>{const rs=crtRows(c);const sites=[...new Set(rs.map(r=>r.pid).filter(Boolean))];
      return `<tr class="click" data-act="go" data-v="carts" data-p="${esc(c.id)}"><td><b class="docno">${esc(c.no)}</b>${c.name?`<small class="block">${esc(c.name)}</small>`:''}${c.status==='closed'?' <span class="chip">Closed</span>':''}</td><td class="small">${sites.map(p=>esc(projCode(p))).join(', ')||'—'}</td><td class="num mono">${rs.length}</td><td>${crtSummary(c)||'<span class="muted small">Empty</span>'}</td><td class="small nowrap">${c.at?fd(msDate(c.at)):''}${c.byName?`<small class="muted block">${esc(c.byName)}</small>`:''}</td><td><button class="btn sm" data-act="go" data-v="carts" data-p="${esc(c.id)}">Open</button></td></tr>`}).join('')}</tbody></table></div>`
    :emptyBox(ART.x('clip','e-art'),'No purchase carts','Make one with New cart, or from the Procurement queue.')}
    ${all.some(c=>c.status==='closed')?`<div class="card-f"><button class="linkish small" data-act="setF" data-k="crtc" data-val="${ui.f.crtc?'':'1'}">${ui.f.crtc?'Hide closed carts':'Show closed carts'}</button></div>`:''}</section>`}

function crtDraft(c){const b=(ui.draft.crt=ui.draft.crt||{});if(!b[c.id]) b[c.id]={tick:{}};return b[c.id]}
function vCart(c){const rs=crtRows(c);const dr=crtDraft(c);const by=ui.f.crtg||'site';const ed=crtCan()&&c.status!=='closed';
  const openRs=rs.filter(r=>r.open);const ticked=openRs.filter(r=>dr.tick[r.k]!==false);
  const row=r=>{const l=r.l||{};return `<tr class="${r.open?'':'muted-row'}">
    <td>${r.open&&ed?`<input type="checkbox" data-act="crtTick" data-id="${esc(c.id)}" data-k="${esc(r.k)}" ${dr.tick[r.k]!==false?'checked':''} aria-label="Tick ${esc(l.desc||'')}">`:''}</td>
    <td><div class="who">${r.l?lineThumb(l,'sm'):''}<span><b>${esc(l.desc||'(item removed)')}</b><span class="spec-block">${esc(l.spec||'')}</span></span></div></td>
    <td class="small">${r.ind?`<button class="linkish docno nowrap" data-act="openIndent" data-id="${esc(r.ind.id)}">${esc(r.ind.no)}</button><small class="muted block">raised ${fd(r.ind.date)}</small>`:'—'}</td>
    <td class="small">${r.ind?`${icon('truck','xs')} ${esc(projCode(r.ind.projectId))}<small class="muted block">needed by ${fd(r.ind.requiredBy)}</small>`:''}</td>
    <td class="num mono nowrap">${r.l?fq(r.need)+' '+esc(l.unit):''}</td>
    <td class="num nowrap">${r.open&&ed?`<input class="inp sm qty" style="width:86px" inputmode="decimal" value="${esc(r.it.qty==null||r.it.qty===''?'':r.it.qty)}" placeholder="${esc(fq(r.need))}" data-act-change="crtSet" data-id="${esc(c.id)}" data-i="${r.i}" data-f="qty" aria-label="Quantity to buy now">`:r.l?`<span class="mono">${fq(r.q)}</span>`:''}</td>
    <td>${r.open&&ed?`<input class="inp sm" value="${esc(r.it.note||'')}" placeholder="Note" data-act-change="crtSet" data-id="${esc(c.id)}" data-i="${r.i}" data-f="note" aria-label="Note">`:`<span class="small">${esc(r.it.note||'')}</span>`}</td>
    <td>${chip(r.info)}</td>
    <td>${ed&&(r.open||r.info.st==='gone'||r.info.st==='rejected')?`<button class="btn sm ghost" data-act="crtRm" data-id="${esc(c.id)}" data-i="${r.i}" aria-label="Take out of the cart">${icon('trash','xs')}</button>`:''}</td></tr>`};
  const head=`<thead><tr><th style="width:30px"></th><th>Item</th><th>Demand</th><th>Delivered to</th><th class="num">Needed</th><th class="num">Buy now</th><th>Note</th><th>Where it stands</th><th></th></tr></thead>`;
  const groups={};for(const r of rs){const g=by==='demand'?(r.ind?r.ind.id:'—'):by==='item'?(r.l?crtItemKey(r.l):'—'):(r.pid||'—');(groups[g]=groups[g]||[]).push(r)}
  const gHead=(g,xs)=>{if(by==='demand'){const i=xs[0].ind;return i?`<b class="docno">${esc(i.no)}</b> · ${esc(projName(i.projectId))} <span class="muted small">· raised ${fd(i.date)}${i.requestedBy?' by '+esc(i.requestedBy):''}</span>`:'—'}
    if(by==='item'){const l=xs[0].l;return l?`<b>${esc(l.desc)}</b> <span class="spec-block" style="display:inline">${esc(l.spec||'')}</span> <span class="muted small">· in all <b class="mono">${fq(sum(xs.filter(r=>r.l),r=>r.q))} ${esc(l.unit)}</b> for ${new Set(xs.map(r=>r.pid)).size} site(s)</span>`:'—'}
    return `<b>${esc(projName(g))}</b> <span class="muted small">· ${new Set(xs.map(r=>r.ind&&r.ind.id)).size} demand(s)</span>`};
  // purchases to enter: items approved for cash / emergency, one purchase per site
  const enter=v=>{const g={};for(const r of rs) if(r.info.st===v)(g[r.pid]=g[r.pid]||[]).push(r);return Object.entries(g)};
  const cashG=enter('cash'),emgG=enter('emg');
  return `<div class="row" style="margin-bottom:8px"><button class="btn sm ghost" data-act="go" data-v="carts">← All carts</button></div>
  <section class="card"><div class="card-h"><h2>${icon('cart')} ${esc(c.no)}${c.status==='closed'?' <span class="chip">Closed</span>':''}</h2><span class="sub">${rs.length} item${rs.length===1?'':'s'} · ${new Set(rs.map(r=>r.pid).filter(Boolean)).size} site(s) · ${new Set(rs.map(r=>r.ind&&r.ind.id).filter(Boolean)).size} demand(s) · made ${c.at?fd(msDate(c.at)):''}${c.byName?' by '+esc(c.byName):''}</span>
    <div class="acts">${crtCan()?(c.status==='closed'?`<button class="btn sm" data-act="crtClose" data-id="${esc(c.id)}" data-v="open">Reopen</button>`:`<button class="btn sm" data-act="crtClose" data-id="${esc(c.id)}" data-v="closed">Close cart</button>`):''}${crtCan()&&!rs.some(r=>!r.open&&r.info.st!=='gone'&&r.info.st!=='rejected')?`<button class="btn sm ghost danger" data-act="crtDel" data-id="${esc(c.id)}">${icon('trash','xs')} Delete</button>`:''}</div></div>
    <div class="card-b"><div class="fields"><div class="f span2"><label for="crt-name">Name</label><input class="inp" id="crt-name" value="${esc(c.name||'')}" placeholder="e.g. Pipes for Nangal and Ropar" data-act-change="crtName" data-id="${esc(c.id)}" ${ed?'':'disabled'}></div></div>
    <div class="notice info">${icon('truck')}<span>Every item stays on its own demand and is <b>delivered to the site of its demand</b>. Here you may only change the quantity to buy now (the rest stays in the procurement queue) and add a note.</span></div>${crtSummary(c)?`<div class="chips" style="margin-top:8px">${crtSummary(c)}</div>`:''}</div></section>
  ${cashG.length||emgG.length?`<section class="card bv-card"><div class="card-h"><h2>${icon('bolt')} Purchases to enter</h2><span class="sub">One purchase per site; it may cover several demands of that site</span></div><div class="card-b"><div class="crt-enter">
    ${cashG.map(([pid,xs])=>`<div class="crt-en cash"><b>${icon('cash')} Cash · ${esc(projName(pid))}</b><small class="muted block">${xs.length} item${xs.length===1?'':'s'} from ${[...new Set(xs.map(r=>r.ind.no))].join(', ')}</small>${cashMaySpend()?`<button class="btn sm primary" data-act="crtCash" data-id="${esc(c.id)}" data-p="${esc(pid)}">Enter cash purchase</button>`:'<small class="muted">Someone who may make cash purchases enters it.</small>'}</div>`).join('')}
    ${emgG.map(([pid,xs])=>`<div class="crt-en emg"><b>${icon('alert')} Emergency · ${esc(projName(pid))}</b><small class="muted block">${xs.length} item${xs.length===1?'':'s'} from ${[...new Set(xs.map(r=>r.ind.no))].join(', ')}</small>${canEmg()?`<button class="btn sm emg-btn" data-act="crtEmg" data-id="${esc(c.id)}" data-p="${esc(pid)}">Enter emergency purchase</button>`:'<small class="muted">The Purchase manager or the Director (Procurement) enters it.</small>'}</div>`).join('')}</div></div></section>`:''}
  <section class="card"><div class="card-h"><h2>Items</h2><div class="acts">${seg('crtg',[['site','By site'],['demand','By demand'],['item','Same item together']],by)}</div></div>
    ${rs.length?`<div class="tw"><table class="t crt-t">${head}<tbody>${Object.entries(groups).map(([g,xs])=>`<tr class="grp"><td colspan="9">${gHead(g,xs)}</td></tr>${xs.map(row).join('')}`).join('')}</tbody></table></div>`:emptyBox(ART.x('clip','e-art'),'The cart is empty','Add items from the Procurement queue.')}
    ${ed&&openRs.length?`<div class="card-f"><span class="small muted">${ticked.length} of ${openRs.length} item${openRs.length===1?'':'s'} to buy ticked</span><span class="spacer"></span>
      ${can('rfq_create')?`<button class="btn primary" data-act="crtBuy" data-id="${esc(c.id)}" data-via="po" ${ticked.length?'':'disabled'}>${icon('quote')} Quotations &amp; PO</button>`:''}
      ${bvCanMark()?`<button class="btn" data-act="crtBuy" data-id="${esc(c.id)}" data-via="cash" ${ticked.length?'':'disabled'}>${icon('cash')} Cash purchase</button><button class="btn emg-btn" data-act="crtBuy" data-id="${esc(c.id)}" data-via="emergency" ${ticked.length?'':'disabled'}>${icon('alert')} Emergency purchase</button>`:''}</div>`:''}</section>
  ${(c.log||[]).length?`<section class="card"><div class="card-h"><h2>History</h2></div><div class="card-b"><ul class="small crt-log">${c.log.slice().reverse().map(x=>`<li>${x.at?fd(msDate(x.at)):''} · ${esc(x.name||'')}: ${esc(x.t||'')}</li>`).join('')}</ul></div></section>`:''}`}

A.crtTick=d=>{const c=S.carts.find(x=>x.id===d.id);if(!c) return;const dr=crtDraft(c);dr.tick[d.k]=dr.tick[d.k]===false;render()};
CH.crtSet=async el=>{const c=S.carts.find(x=>x.id===el.dataset.id);if(!c) return;const i=+el.dataset.i,f=el.dataset.f;const items=JSON.parse(JSON.stringify(c.items||[]));const it=items[i];if(!it) return;
  if(f==='qty'){const v=String(el.value).trim();if(v===''){it.qty=null}else{const r=crtRows(c)[i];const q=num(v);if(!(q>0)){toast('Enter a quantity more than 0, or leave it empty for the full quantity.','err');render();return}
      if(r&&q>r.need+1e-9){toast(`${r.l.desc}: the demand needs ${fq(r.need)} ${r.l.unit}; you can buy at most that.`,'err');render();return}it.qty=q}}
  else it.note=String(el.value).trim().slice(0,200);
  await run(()=>updDoc('carts',c.id,{items}))};
CH.crtName=async el=>{const c=S.carts.find(x=>x.id===el.dataset.id);if(!c) return;await run(()=>updDoc('carts',c.id,{name:String(el.value).trim().slice(0,80)}))};
A.crtRm=d=>{const c=S.carts.find(x=>x.id===d.id);if(!c) return;const r=crtRows(c)[+d.i];
  confirmBox({title:'Take out of the cart',body:`<p><b>${esc(r&&r.l?r.l.desc:'This item')}</b> is taken out of the cart. It stays on its demand${r&&r.open?' and in the procurement queue':''}.</p>`,yes:'Take out',onYes:async()=>{
    const items=(c.items||[]).filter((_,i)=>i!==+d.i);const ok=await run(()=>updDoc('carts',c.id,{items,log:(c.log||[]).concat({at:Date.now(),name:(ui.me&&ui.me.name)||'',t:'Taken out: '+(r&&r.l?r.l.desc:'item')})}));if(ok!==false) closeModal()}})};
A.crtClose=async d=>{const c=S.carts.find(x=>x.id===d.id);if(!c) return;await run(()=>updDoc('carts',c.id,{status:d.v,log:(c.log||[]).concat({at:Date.now(),name:(ui.me&&ui.me.name)||'',t:d.v==='closed'?'Closed':'Reopened'})}),d.v==='closed'?'Cart closed':'Cart reopened')};
A.crtDel=d=>{const c=S.carts.find(x=>x.id===d.id);if(!c) return;confirmBox({title:'Delete '+c.no,danger:true,yes:'Delete cart',body:'<p>The cart is deleted. Its items stay on their demands and in the procurement queue, as they were.</p>',
  onYes:async()=>{const ok=await run(()=>write('delete','carts',c.id));if(ok!==false){closeModal();go('carts')}}})};

// split a demand line when less than its quantity is bought now: the rest stays in the queue as its own line
function crtSplitIn(ls,lineId,q,what){const l=ls.find(x=>x.id===lineId);if(!l) return null;const need=needQty(l);
  if(q<need-1e-9){const rest=Math.round((need-q)*1000)/1000;const nl=JSON.parse(JSON.stringify(l));for(const k of ['buyVia','buyViaBy','buyViaByName','buyViaAt','buyViaNote','hqNote']) delete nl[k];
    Object.assign(nl,{id:newId(),qty:rest,approvedQty:rest,splitFrom:l.id,siteNote:(l.siteNote?l.siteNote+' · ':'')+'Balance after '+what});ls.splice(ls.indexOf(l)+1,0,nl);l.approvedQty=q}
  return l}
A.crtBuy=d=>{const c=S.carts.find(x=>x.id===d.id);if(!c) return;const dr=crtDraft(c);const via=d.via;
  const pick=crtRows(c).filter(r=>r.open&&dr.tick[r.k]!==false);if(!pick.length) return toast('Tick the items first.','err');
  if(via!=='po'&&!bvCanMark()) return toast('You may not approve cash or emergency purchases.','err');
  const what=via==='po'?'quotation':via==='cash'?'cash purchase':'emergency purchase';const sites=[...new Set(pick.map(r=>r.pid))];
  confirmBox({title:via==='po'?'Call for quotations':via==='cash'?'Buy in cash':'Buy as emergency purchase',yes:via==='po'?'Next: choose vendors':via==='cash'?'Approve for cash purchase':'Approve for emergency purchase',
    body:`<p>${pick.length} item${pick.length===1?'':'s'} of ${sites.length} site${sites.length===1?'':'s'}:</p><ul class="small">${pick.map(r=>`<li><b>${esc(r.l.desc)}</b>${r.l.spec?' · '+esc(r.l.spec):''} — ${fq(r.q)} ${esc(r.l.unit)} <span class="muted">for ${esc(projCode(r.pid))}, ${esc(r.ind.no)}${r.q<r.need-1e-9?` · the other ${fq(Math.round((r.need-r.q)*1000)/1000)} stay in the queue`:''}</span></li>`).join('')}</ul>
      <p class="small muted">${via==='po'?'One RFQ is made for all of them; the same item of different sites becomes one enquiry line. Each PO delivers to the sites of the demands.':via==='cash'?'Then enter one cash purchase per site from this cart (or from each demand).':'Then enter one emergency purchase per site from this cart; it goes straight to that site.'}</p>`,
    ...(via==='po'?{}:{note:'Reason / instruction (shown to the sites)',notePh:via==='cash'?'e.g. Small quantity, buy locally':'e.g. Work stopped, needed today'}),
    onYes:async m=>{const note=String(m.noteVal||'').trim();const me=(ui.me&&ui.me.name)||'';const now=Date.now();const by={};for(const r of pick)(by[r.ind.id]=by[r.ind.id]||[]).push(r);
      const ok=await run(async()=>{for(const [iid,rs] of Object.entries(by)){await patchLines(iid,ls=>{for(const r of rs){const l=crtSplitIn(ls,r.l.id,r.q,what);if(!l) continue;
          if(r.it.note) l.hqNote=r.it.note;
          if(via!=='po'){Object.assign(l,{buyVia:via,buyViaBy:ui.uid||null,buyViaByName:me,buyViaAt:now});const bn=[note,r.it.note].filter(Boolean).join(' · ');if(bn) l.buyViaNote=bn;else delete l.buyViaNote}}});
          if(via!=='po') await addHqRemark(iid,`Approved for ${what} (cart ${c.no}): `+rs.map(r=>`${r.l.desc}${r.l.spec?' '+r.l.spec:''} ${fq(r.q)} ${r.l.unit}`).join(', ')+(note?' — '+note:''),via==='cash'?'Cash purchase':'Emergency purchase')}
        await updDoc('carts',c.id,{log:(c.log||[]).concat({at:now,name:me,t:`${pick.length} item${pick.length===1?'':'s'} sent for ${what}${note?' — '+note:''}`})})},via==='po'?'':via==='cash'?'Approved for cash purchase':'Approved for emergency purchase');
      if(ok===false) return;closeModal();
      if(via==='po'){ui.sel={};for(const r of pick) ui.sel[r.k]=true;setTimeout(()=>A.newRfq(),150)}
      else if(via==='emergency'&&canEmg()&&sites.length===1) setTimeout(()=>A.crtEmg({id:c.id,p:sites[0]}),200)}})};

// one cash purchase for a site, covering the cart's items of several demands
A.crtCash=d=>{const c=S.carts.find(x=>x.id===d.id);if(!c) return;if(!cashMaySpend()) return toast('You have not been given the right to make cash purchases.','err');
  const rs=crtRows(c).filter(r=>r.info.st==='cash'&&r.pid===d.p);if(!rs.length) return toast('No items of this site are waiting for cash purchase.','err');
  const nos=[...new Set(rs.map(r=>r.ind.no))].join(', ');A.cashNew({});const m=ui.modal;if(!m) return;
  Object.assign(m.d,{location:'site',projectId:d.p,mode:'',purpose:`Against demand ${nos} (cart ${c.no})${rs[0].l.buyViaNote?' — '+rs[0].l.buyViaNote:''}`,fromIndent:rs[0].ind.id,fromNo:nos,
    srcs:rs.map(r=>({indentId:r.ind.id,lineId:r.l.id,desc:r.l.desc,spec:r.l.spec||'',qty:needQty(r.l),unit:r.l.unit,on:true})),
    lines:rs.map(r=>{const l=r.l;const last=typeof cashLast==='function'?cashLast(l.desc,l.spec):null;const it=D.itemMap[slug(l.desc)];return {desc:l.desc,spec:l.spec||'',unit:l.unit,qty:String(needQty(l)),rate:last&&last.rate?String(last.rate):'',gst:last&&last.gst!=null&&last.gst!==''?String(last.gst):it&&it.gst!=null&&it.gst!==''?String(it.gst):'18',usedNow:'',hint:last?`Last bought at ${money(last.rate)} per ${last.unit||''}${last.from?' from '+last.from:''}`:''}})});render()};
// one emergency purchase (one vendor, one PO) for a site, covering the cart's items of several demands
A.crtEmg=d=>{const c=S.carts.find(x=>x.id===d.id);if(!c) return;if(!canEmg()) return toast('Only the Purchase manager, the Director (Procurement) or the administrator can enter an emergency purchase.','err');
  const rs=crtRows(c).filter(r=>r.info.st==='emg'&&r.pid===d.p);if(!rs.length) return toast('No items of this site are waiting for emergency purchase.','err');
  A.emgNew();const m=ui.modal;if(!m||m.type!=='emg') return;
  Object.assign(m.d,{projectId:d.p,requestedBy:rs[0].ind.requestedBy||rs[0].ind.createdByName||'',reason:rs[0].l.buyViaNote||'',fromIndent:rs[0].ind.id,fromNo:[...new Set(rs.map(r=>r.ind.no))].join(', '),
    lines:rs.map(r=>{const l=r.l;const it=D.itemMap[slug(l.desc)];return {desc:l.desc,spec:l.spec||'',qty:String(needQty(l)),unit:l.unit,rate:'',gst:it&&it.gst!=null&&it.gst!==''?String(it.gst):'',hsn:(it&&it.hsn)||'',category:l.category||'',note:'',lineId:l.id,indentId:r.ind.id,maxQty:needQty(l)}})});render()};

Object.assign(ACT_PERM,{crtFromSel:CRT_PERM,crtQuick:CRT_PERM,crtNew:CRT_PERM,crtNewMode:CRT_PERM,crtNewTick:CRT_PERM,crtNewAll:CRT_PERM,crtNewSave:CRT_PERM,crtPickSave:CRT_PERM,crtTick:CRT_PERM,crtSet:CRT_PERM,crtName:CRT_PERM,crtRm:CRT_PERM,crtClose:CRT_PERM,crtDel:CRT_PERM,
  crtBuy:CRT_PERM,crtCash:['cash_spend','cash_approve','po_approve'],crtEmg:['emergency_purchase','po_approve']});
