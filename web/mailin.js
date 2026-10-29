"use strict";
/* ================= QUOTATIONS READ FROM EMAIL =================
   The server reads vendor replies from the company mailbox (Settings → Read quotations
   from email) into "mailquotes". Here the purchase team checks each one against the
   original attachment and accepts it into the comparative, or sets it aside. */

Object.assign(ACT_PERM,{mqReview:'quotes_enter',mqAside:'quotes_enter',mqAssign:'quotes_enter',saveMqAssign:'quotes_enter',mailCheck:['quotes_enter','rfq_create','settings'],
  saveMailIn:'settings',dlRfqSheet:['rfq_create','quotes_enter']});

const MQ_METHOD={excel:['Read from Excel sheet','green'],ai:['Read by AI — check carefully','violet'],manual:['Enter rates by hand','amber']};
const mqOpen=x=>x.status==='review'||x.status==='unmatched';
const mqList=()=>S.mailquotes.filter(mqOpen).sort((a,b)=>(b.received||0)-(a.received||0));
const mqCount=()=>can('quotes_enter')?S.mailquotes.filter(mqOpen).length:0;

async function loadMailIn(){if(!can('settings')) return;try{ui.mailin=await api('/api/mailin');ui.mailinOn=ui.mailin.enabled;schedule()}catch(e){}}

function mqRow(x,showRfq){const m=MQ_METHOD[x.method]||null;const n=(x.warnings||[]).length;const rates=x.quote&&x.quote.rates?Object.keys(x.quote.rates).length:0;
  return `<div class="li mq ${x.status==='unmatched'?'mq-un':''}"><span class="n-ic ${x.status==='unmatched'?'amber':'blue'}">${icon('mail')}</span><div class="grow">
   <b>${esc(x.vendorName||x.fromName||x.from)}</b>${showRfq&&x.rfqNo?` · <button class="linkish docno" data-act="openRfq" data-id="${esc(x.rfqId||'')}">${esc(x.rfqNo)}</button>`:''}
   <small>${esc(x.subject||'(no subject)')} · ${esc(x.from)} · ${fdt(x.received)}</small>
   <small>${x.status==='unmatched'?'<span class="chip amber plain">Needs matching</span>':m?`<span class="chip ${m[1]} plain">${m[0]}</span>`:''}${x.status==='review'?` ${rates} rate${rates===1?'':'s'} read`:''}${n?` · <span class="t-amber">${n} point${n===1?'':'s'} to check</span>`:''}</small>
   ${photoStrip(x.files)}</div>
   <div class="row tight">${x.status==='unmatched'?`<button class="btn sm primary" data-act="mqAssign" data-id="${x.id}">Match</button>`:`<button class="btn sm primary" data-act="mqReview" data-id="${x.id}">Check &amp; accept</button>`}<button class="btn sm ghost" data-act="mqAside" data-id="${x.id}" title="Not a quotation, or not needed">Set aside</button></div></div>`}

// on the RFQ page
function mqCard(r){if(!can('quotes_enter')) return '';const xs=S.mailquotes.filter(x=>x.rfqId===r.id&&mqOpen(x)).sort((a,b)=>(b.received||0)-(a.received||0));
  const done=S.mailquotes.filter(x=>x.rfqId===r.id&&x.status==='accepted').length;
  if(!xs.length&&!done) return '';
  return `<section class="card" id="mq-rfq"><div class="card-h"><h2>Received by email</h2><span class="sub">${xs.length?`${xs.length} waiting for your check`:'All checked'}${done?` · ${done} accepted`:''}</span><div class="acts">${can('settings')||can('rfq_create')||can('quotes_enter')?`<button class="btn sm" data-act="mailCheck" ${ui.busy?'disabled':''}>${icon('mail')} Check mail now</button>`:''}</div></div>
  <div class="list">${xs.map(x=>mqRow(x,false)).join('')||'<div class="empty sm"><p>Nothing waiting.</p></div>'}</div></section>`}

// on the Quotations list
function mqBanner(){if(!can('quotes_enter')) return '';const xs=mqList();const ready=ui.mailinOn;
  if(!xs.length) return ready?`<div class="notice info">${icon('mail')}<span>Vendors' replies are read from the company mailbox automatically. New quotations appear here and on their RFQ.</span><span class="spacer"></span><button class="btn sm" data-act="mailCheck" ${ui.busy?'disabled':''}>Check mail now</button></div>`:'';
  return `<section class="card" id="mq-all"><div class="card-h"><h2>Quotations received by email</h2><span class="sub">Check each against the vendor's original and accept it into the comparative</span><div class="acts"><button class="btn sm" data-act="mailCheck" ${ui.busy?'disabled':''}>${icon('mail')} Check mail now</button></div></div>
  <div class="list">${xs.map(x=>mqRow(x,true)).join('')}</div></section>`}

// Settings card
function mailInCard(){if(!can('settings')) return '';const s=ui.mailin;if(!s){loadMailIn();return `<section class="card" id="mailin"><div class="card-h"><h2>Read quotations from email</h2></div><div class="card-b"><p class="muted small">Loading…</p></div></section>`}
  const d=ui.draft.mailin||(ui.draft.mailin={enabled:s.enabled,ownBox:!!(s.host||s.user),host:s.host||'',port:s.port?String(s.port):'',user:s.user||'',pass:'',every:String(s.every||5),days:'7',aiKey:'',aiModel:s.aiModel||'',aiDaily:String(s.aiDaily||50),clearAI:false});
  return `<section class="card" id="mailin"><div class="card-h"><h2>Read quotations from email</h2>${s.enabled?'<span class="chip green">On</span>':'<span class="chip plain">Off</span>'}</div><div class="card-b grid" style="gap:14px">
   <p class="small muted" style="max-width:85ch">Every RFQ email carries an Excel quotation sheet. When a vendor replies, ProcureHub reads the reply from your inbox: the filled sheet exactly, and a PDF, scan, photo or the vendor's own format with Claude AI (needs an API key). The rates wait under Quotations for your check before they enter the comparative. Your mailbox is only read: messages stay unread and are never changed or deleted. Only mails that name an RFQ number or come from a vendor's email address are taken up.</p>
   ${seg('mi-on',[['0','Off'],['1','On — read vendor replies']],d.enabled?'1':'0','miSet')}
   <div class="f"><label>Mailbox</label>${seg('mi-own',[['0','Same account as sending email'],['1','A different mailbox']],d.ownBox?'1':'0','miSet')}<small class="muted">${d.ownBox?'':s.effUser?`Reads ${esc(s.effUser)} at ${esc(s.effHost)}:${s.effPort} (IMAP).`:'Set up “Email for RFQs and POs” first.'} For Gmail, the same App password works; Microsoft 365 / Outlook mailboxes cannot be read with a password and are not supported.</small></div>
   ${d.ownBox?`<div class="fields">${field('IMAP server','draft.mailin.host',d.host,'placeholder="imap.gmail.com"')}${field('Port','draft.mailin.port',d.port,'inputmode="numeric" placeholder="993"')}${field('Username','draft.mailin.user',d.user,'autocomplete="off"')}${field('Password / app password','draft.mailin.pass',d.pass,`type="password" autocomplete="new-password" placeholder="${s.hasPass?'Saved — leave blank to keep':''}"`)}</div>`:''}
   <div class="fields">${field('Check every (minutes)','draft.mailin.every',d.every,'inputmode="numeric"')}${!s.enabled?field('On first start, read mail of the last (days)','draft.mailin.days',d.days,'inputmode="numeric"'):''}</div>
   <div class="f"><label>Reading PDFs, scans and photos (Claude AI)</label><small class="muted">Create an API key at console.anthropic.com (Settings → API keys) and add credit there. Each quotation read costs a few rupees; the daily limit caps the cost. Quotations are sent to Anthropic only to be read.</small></div>
   <div class="fields">${field('API key','draft.mailin.aiKey',d.aiKey,`type="password" autocomplete="off" placeholder="${s.hasAIKey?'Saved — leave blank to keep':'sk-ant-…'}"`)}${field('AI readings per day (limit)','draft.mailin.aiDaily',d.aiDaily,'inputmode="numeric"')}${field('Model','draft.mailin.aiModel',d.aiModel,'placeholder="claude-sonnet-5-5"')}</div>
   ${s.hasAIKey?`<label class="check"><input type="checkbox" id="f-draft-mailin-clearAI" data-bind="draft.mailin.clearAI" ${d.clearAI?'checked':''}> Remove the saved API key (stop AI reading)</label>`:''}
   <div class="small ${s.lastError?'t-red':'muted'}">${s.lastCheck?`Last check ${fdt(s.lastCheck)}: ${s.lastError?esc(s.lastError):`${s.lastFound} new quotation${s.lastFound===1?'':'s'}`}.`:'Not checked yet.'}${s.hasAIKey?` AI readings today: ${s.aiUsed} of ${s.aiDaily}.`:''}</div>
   <div class="row end"><button class="btn" data-act="mailCheck" ${ui.busy||!s.enabled?'disabled':''}>Check mail now</button><button class="btn primary" data-act="saveMailIn" ${ui.busy?'disabled':''}>Save</button></div></div></section>`}

/* ---------- modal: match an email to RFQ and vendor ---------- */
function mqModal(m,busy){if(m.type!=='mqAssign') return '';const x=S.mailquotes.find(y=>y.id===m.id);if(!x) return '';const d=m.d;
  const rfqs=S.rfqs.filter(r=>['draft','sent','approved'].includes(r.status)).sort((a,b)=>(b.at||0)-(a.at||0));const r=S.rfqs.find(y=>y.id===d.rfqId);
  const vs=(r?(r.vendorIds||[]).map(vend).filter(Boolean):S.vendors).slice().sort((a,b)=>String(a.name).localeCompare(b.name));
  return wrap('Match email to RFQ',`<div class="meta"><div><span>From</span><b>${esc(x.fromName?x.fromName+' <'+x.from+'>':x.from)}</b></div><div><span>Subject</span><b>${esc(x.subject||'—')}</b></div><div><span>Received</span><b>${fdt(x.received)}</b></div></div>
   ${(x.warnings||[]).length?`<div class="notice warn">${icon('alert')}<span>${(x.warnings||[]).map(esc).join('<br>')}</span></div>`:''}
   ${x.body?`<details><summary class="small">Mail text</summary><pre class="mail-body">${esc(x.body.slice(0,3000))}</pre></details>`:''}${photoStrip(x.files)}
   <div class="fields two"><div class="f"><label for="f-modal-d-rfqId">RFQ</label><select class="inp" id="f-modal-d-rfqId" data-bind="modal.d.rfqId" data-rerender="1">${selOpts(rfqs.map(y=>({v:y.id,l:y.no+' · '+(y.lines||[]).length+' items · '+fd(y.date)})),d.rfqId,'Choose RFQ')}</select></div>
   <div class="f"><label for="f-modal-d-vendorId">Vendor</label><select class="inp" id="f-modal-d-vendorId" data-bind="modal.d.vendorId">${selOpts(vs.map(v=>({v:v.id,l:v.name})),d.vendorId,'Choose vendor')}</select></div></div>
   <p class="small muted">The quotation is then read again for that RFQ, and waits for your check.</p>`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveMqAssign" ${busy}>Match and read</button>`,'wide')}

/* ---------- actions ---------- */
A.mailCheck=async()=>{ui.busy=true;render();try{const j=await api('/api/mailin/check',{});toast(j.found?`${j.found} new quotation${j.found===1?'':'s'} read from email`:'No new quotations in the mailbox')}catch(e){toast(errMsg(e),'err')}ui.busy=false;loadMailIn();render()};
A.miSet=d=>{const m=ui.draft.mailin;if(d.k==='mi-on') m.enabled=d.val==='1';else m.ownBox=d.val==='1';render()};
A.saveMailIn=async()=>{const d=ui.draft.mailin;if(!d) return;
  if(d.enabled&&!d.ownBox&&!(ui.mailin&&ui.mailin.effUser)){toast('Set up “Email for RFQs and POs” first, or choose a different mailbox.','err');return}
  const ok=await run(async()=>{ui.mailin=await api('/api/mailin',{enabled:!!d.enabled,ownBox:!!d.ownBox,host:d.host,port:d.port,user:d.user,pass:d.pass,every:d.every,days:d.days,aiKey:d.aiKey,aiModel:d.aiModel,aiDaily:d.aiDaily,clearAI:!!d.clearAI});ui.mailinOn=ui.mailin.enabled},'Saved');
  if(ok!==false) ui.draft.mailin=null;render()};
A.mqAside=d=>{const x=S.mailquotes.find(y=>y.id===d.id);if(!x) return;confirmBox({title:'Set aside this email?',body:`<p>${esc(x.subject||'')} from ${esc(x.from)}.</p><p class="small muted">It is kept, but no longer waits for a check. Rates already in the comparative are not changed.</p>`,yes:'Set aside',onYes:async()=>{if(await run(()=>updDoc('mailquotes',x.id,{status:'aside',decidedAt:Date.now(),decidedBy:ui.uid||null}),'Set aside')!==false) closeModal()}})};
A.mqAssign=d=>{const x=S.mailquotes.find(y=>y.id===d.id);if(x) openModal({type:'mqAssign',id:x.id,d:{rfqId:x.rfqId||'',vendorId:x.vendorId||''}})};
A.saveMqAssign=async()=>{const m=ui.modal;if(!m.d.rfqId||!m.d.vendorId){toast('Choose the RFQ and the vendor.','err');return}
  ui.busy=true;render();try{await api('/api/mailin/assign',{id:m.id,rfqId:m.d.rfqId,vendorId:m.d.vendorId});closeModal();toast('Matched. Read again for the RFQ — check and accept it.')}catch(e){toast(errMsg(e),'err')}ui.busy=false;render()};
// open the normal quotation window, filled from the email
A.mqReview=d=>{const x=S.mailquotes.find(y=>y.id===d.id);if(!x) return;const r=S.rfqs.find(y=>y.id===x.rfqId);if(!r){toast('The RFQ of this email no longer exists.','err');return}
  if(['ordered','cancelled'].includes(r.status)){toast(`${r.no} is ${r.status==='ordered'?'already ordered':'cancelled'}; this quotation can only be set aside.`,'err');return}
  if(r.status==='approved'){toast(`Reopen the comparative of ${r.no} first to add this quotation.`,'err');return}
  if(ui.view!=='rfq'||ui.param!==r.id) go('rfq',r.id);
  const v=vend(x.vendorId)||{};const q=x.quote||{};const old=(r.quotes||{})[x.vendorId];
  const dq={rates:{},gstRates:{},hsn:Object.assign({},q.hsn||{}),gst:'',freight:q.freight!=null?q.freight:(old?old.freight:0),deliveryDays:q.deliveryDays!=null?q.deliveryDays:(old?old.deliveryDays:''),
    payment:q.payment||(old&&old.payment)||v.payment||'',validity:q.validity||(old&&old.validity)||'',remarks:q.remarks||'',files:[...new Set([...((old&&old.files)||[]),...(x.files||[])])]};
  {const cnt={};for(const k in (q.gstRates||{})){const g=q.gstRates[k];cnt[g]=(cnt[g]||0)+1}const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];dq.gst=top?String(top[0]):'18'}
  for(const l of r.lines){const rt=(q.rates||{})[l.key];dq.rates[l.key]=rt!=null?String(rt):'';const g=(q.gstRates||{})[l.key];dq.gstRates[l.key]=g!=null?String(g):(rt!=null?String(itemGst(l.desc)??''):'')}
  openModal({type:'quote',rfqId:r.id,vid:x.vendorId,d:dq,mailId:x.id})};
A.dlRfqSheet=d=>{const r=rfqOf();if(r) location.href=`/api/rfqsheet?rfq=${encodeURIComponent(r.id)}&v=${encodeURIComponent(d.v)}`};

// the banner shown inside the quotation window when it was filled from an email
function mqQuoteBanner(m){if(!m.mailId) return '';const x=S.mailquotes.find(y=>y.id===m.mailId);if(!x) return '';const meth=MQ_METHOD[x.method]||['',''];
  const r=S.rfqs.find(y=>y.id===m.rfqId);const notes=x.notes||{};const nl=r?r.lines.filter(l=>notes[l.key]).map(l=>`<li><b>${esc(l.desc)}</b>: ${esc(notes[l.key])}</li>`).join(''):'';
  const old=r&&(r.quotes||{})[m.vid];
  return `<div class="notice ${x.method==='excel'?'info':'warn'} mq-banner">${icon('mail')}<span><b>Filled from the vendor's email</b> · ${esc(x.subject||'')} · ${fdt(x.received)} · <span class="chip ${meth[1]} plain">${meth[0]}</span><br>
   Compare every rate with the original before saving${x.method==='ai'?' — AI can misread a figure':''}. ${old?'<b>This replaces the quotation already entered for this vendor.</b>':''}
   ${(x.warnings||[]).length?`<ul class="mq-warn">${x.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}${nl?`<ul class="mq-warn">${nl}</ul>`:''}</span></div>
   <div class="mq-orig"><span class="small muted">Original from the vendor:</span>${photoStrip(x.files)||'<span class="small muted">no attachment (rates were in the mail text)</span>'}${x.body?`<details><summary class="small">Mail text</summary><pre class="mail-body">${esc(x.body.slice(0,4000))}</pre></details>`:''}</div>`}
