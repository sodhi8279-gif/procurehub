/* ProcureHub — cash purchase: scan the bill or enter by hand.
   Scan: take a photo of the bill (or choose a photo / PDF); the shop, GSTIN,
   bill no., date and every item with qty, unit, rate and GST are read and
   filled in, matched to your vendors and to items bought before. You check
   and send. By hand: the shop is chosen from your vendors (or typed), and an
   item bought before fills its unit, GST and last rate. */

function cashChooser(m){return `<p class="muted" style="margin-top:0">How do you want to enter the bill?</p>
  <div class="cash-pick">
   <label class="cash-opt primary" for="cash-scan-in">${ui.cashScanning?'<span class="spin"></span>':icon('camera')}<b>Scan the bill</b><span>Take a photo of the bill or cash memo. Shop, GSTIN, items, quantities and rates fill in by themselves — you only check.</span></label>
   <button type="button" class="cash-opt" data-act="cashMode" data-m="manual">${icon('edit')}<b>Enter by hand</b><span>Choose the shop from your vendors and type the items. Items bought before fill in their last rate.</span></button>
  </div>${cashScanInput()}
  <p class="small muted">Hold the phone straight over the bill, flat and in good light, with the whole bill in the photo. Printed bills read best; handwritten memos may need more corrections. You can also choose a photo already on the phone or computer.</p>`}

function cashScanInput(){return `<input type="file" id="cash-scan-in" accept="image/*,application/pdf,.pdf" hidden data-act-change="cashScanFile">`}

function cashScanBar(m){const d=m.d,sc=d.scan;
  if(ui.cashScanning) return `<div class="notice info"><span class="spin"></span><span><b>Reading the bill…</b> <span id="cash-scan-pct">${ui.cashScanPct==null?'':ui.cashScanPct<0?'getting the reader ready…':ui.cashScanPct+'%'}</span> — this takes 10–40 seconds${ui.cashScanPct!=null?' (the first time a little longer, while the reader loads)':''}.</span></div>`;
  if(!sc) return m.id?'':`<div class="row tight" style="margin-bottom:8px"><label class="btn sm" for="cash-scan-in">${icon('camera')} Scan the bill instead</label>${cashScanInput()}</div>`;
  return `<div class="notice ${sc.warnings&&sc.warnings.length?'warn':'info'}">${icon('camera')}<span><b>Filled from the bill — check every line against the photo before sending.</b>${sc.incl?' The bill showed prices including GST; rates were converted to before-GST.':''}${sc.warnings&&sc.warnings.length?'<ul style="margin:4px 0 0">'+sc.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':''}
   <span class="row tight" style="margin-top:6px"><label class="btn sm" for="cash-scan-in">${icon('camera')} Scan again</label></span></span></div>${cashScanInput()}`}

// item names to choose from: catalogue + everything bought before
function cashItemNames(){const seen=new Set(),out=[];const add=n=>{n=String(n||'').trim();const k=n.toLowerCase();if(n&&!seen.has(k)){seen.add(k);out.push(n)}};
  for(const c of S.cashbuys) for(const l of c.lines||[]) add(l.desc);for(const p of S.pos) for(const l of p.lines||[]) add(l.desc);for(const it of D.items) add(it.desc);return out.slice(0,1500)}
function cashShopNames(){const seen=new Set(),out=[];const add=n=>{n=String(n||'').trim();const k=n.toLowerCase();if(n&&!seen.has(k)){seen.add(k);out.push(n)}};
  S.vendors.filter(v=>!v.inactive).forEach(v=>add(v.name));S.cashbuys.slice().sort((a,b)=>(b.at||0)-(a.at||0)).forEach(c=>add(c.shop));return out}

const gstinOk=g=>/^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{3}$/.test(String(g||'').toUpperCase());
function cashFindVendor(name,gstin){const g=String(gstin||'').toUpperCase().trim();
  if(gstinOk(g)){const v=S.vendors.find(v=>String(v.gstin||'').toUpperCase().trim()===g);if(v) return v}
  const n=norm(name).replace(/\b(m s|ms|the|and|co|company|pvt|private|ltd|limited|llp|enterprises?|traders?|stores?|hardware|sanitary)\b/g,' ').replace(/\s+/g,' ').trim();if(!n) return null;
  return S.vendors.find(v=>norm(v.name)===norm(name))||S.vendors.find(v=>{const vn=norm(v.name).replace(/\b(m s|ms|the|and|co|company|pvt|private|ltd|limited|llp|enterprises?|traders?|stores?|hardware|sanitary)\b/g,' ').replace(/\s+/g,' ').trim();return vn&&n.length>=4&&(vn===n||vn.includes(n)||n.includes(vn))})||null}
function cashSetShop(d,name,gstin){const v=cashFindVendor(name,gstin);if(v){d.vendorId=v.id;d.shop=v.name;if(!d.shopGstin) d.shopGstin=v.gstin||String(gstin||'')}else{d.vendorId='';d.shop=String(name||'').trim();if(gstin&&!d.shopGstin) d.shopGstin=String(gstin).toUpperCase()}
  if(!v){const prev=S.cashbuys.filter(c=>norm(c.shop)===norm(d.shop)&&c.shopGstin).sort((a,b)=>(b.at||0)-(a.at||0))[0];if(prev&&!d.shopGstin) d.shopGstin=prev.shopGstin}}
CH.cashShop=el=>{const d=ui.modal&&ui.modal.d;if(!d) return;d.shopGstin=d.vendorId?'':d.shopGstin;cashSetShop(d,el.value,'');render()};

// the last time this item was bought (cash or purchase order)
function cashLast(desc,spec){const k=norm(desc),sp=norm(spec||'');let best=null;
  const see=(l,at,from)=>{if(norm(l.desc)!==k||(sp&&l.spec&&norm(l.spec)!==sp)) return;if(!best||at>best.at) best={at,unit:l.unit,rate:num(l.rate),gst:l.gst,spec:l.spec||'',from}};
  for(const c of S.cashbuys) if(c.status!=='rejected') for(const l of c.lines||[]) see(l,c.at||0,c.shop);
  for(const p of S.pos) if(p.status!=='cancelled') for(const l of p.lines||[]) see(l,p.at||p.createdAt||0,p.vendorName||'PO');
  return best}
CH.cashItem=el=>{const d=ui.modal&&ui.modal.d;if(!d) return;const l=d.lines[+el.dataset.i];if(!l) return;const desc=String(l.desc||'').trim();l.hint='';if(!desc){render();return}
  const it=D.itemMap[slug(desc)];const last=cashLast(desc,l.spec);
  if(last){if(!l.scan){if(last.unit) l.unit=last.unit;if(!l.rate&&last.rate) l.rate=String(last.rate);if(last.gst!=null&&last.gst!=='') l.gst=String(last.gst);if(!l.spec&&last.spec) l.spec=last.spec}
    l.hint=`Last bought ${last.rate?'at '+money(last.rate)+' per '+(last.unit||''):''}${last.from?' from '+last.from:''}${last.at?' · '+fd(new Date(last.at).toISOString().slice(0,10)):''}`}
  else if(it&&!l.scan){if(it.unit) l.unit=it.unit;const g=itemGst(desc);if(g!=null) l.gst=String(g)}
  render()};

// ---- scanning ----
function cashUnit(u){const t=String(u||'').trim();if(!t) return 'Nos';const n=normUnit?normUnit(t):t.toLowerCase();
  const hit=UNITS.find(x=>x.toLowerCase()===t.toLowerCase())||UNITS.find(x=>(normUnit?normUnit(x):x.toLowerCase())===n);if(hit) return hit;
  const map={pcs:'Nos',pc:'Nos',no:'Nos',nos:'Nos',piece:'Nos',pieces:'Nos',m:'Mtr',mtr:'Mtr',meter:'Mtr',metre:'Mtr',mtrs:'Mtr',kgs:'Kg',kg:'Kg',ltr:'Ltr',litre:'Ltr',l:'Ltr',bags:'Bag',bag:'Bag',pkt:'Pkt',packet:'Pkt',ft:'Ft',feet:'Ft'};
  return map[t.toLowerCase().replace(/\./g,'')]||t}
function cashSlab(g){if(g==null||g==='') return '18';const x=num(g);let b=GST_SLABS[0];for(const s of GST_SLABS) if(Math.abs(s-x)<Math.abs(b-x)) b=s;return String(b)}
CH.cashScanFile=async el=>{const f=el.files&&el.files[0];el.value='';const m=ui.modal;if(!f||!m) return;const d=m.d;
  ui.cashScanning=true;d.mode='scan';render();
  try{const id=await uploadFile(f,{max:2200});if(!d.photos.includes(id)) d.photos.push(id);
    let b;const pr=await api('/api/cash/scan',{probe:true}).catch(()=>({ai:false}));
    if(pr.ai){const j=await api('/api/cash/scan',{files:[id]});b=j.bill||{}}
    else{if(/pdf/i.test(f.type)||/\.pdf$/i.test(f.name||'')) throw {message:'Without the AI key only photos can be read. Take a photo of the bill (or a screenshot of the PDF).'};
      ui.cashScanPct=0;render();b=await ocrBill(f,p=>{ui.cashScanPct=p;const el=document.getElementById('cash-scan-pct');if(el) el.textContent=p<0?'getting the reader ready…':p+'%'})}
    cashSetShop(d,b.shop,b.gstin);if(b.gstin&&gstinOk(b.gstin)&&!d.vendorId) d.shopGstin=String(b.gstin).toUpperCase();
    if(b.bill_no) d.billNo=b.bill_no;if(/^\d{4}-\d{2}-\d{2}$/.test(b.bill_date||'')){d.billDate=b.bill_date;if(b.bill_date<=today()) d.date=b.bill_date}
    if(['Cash','UPI','Card'].includes(b.pay_mode)) d.payMode=b.pay_mode;
    const ls=(b.lines||[]).filter(l=>l.item).map(l=>{let desc=l.item,spec=l.size_spec||'';
      if(l.known_item){const mm=/^(.*?)\s*\((.*)\)\s*$/.exec(l.known_item);if(mm){desc=mm[1];spec=spec||mm[2]}else desc=l.known_item}
      return {desc,spec,unit:cashUnit(l.unit),qty:l.qty!=null?String(l.qty):'',rate:l.rate!=null?String(Math.round(l.rate*100)/100):'',gst:l.gst==null&&b.ocr?'18':cashSlab(l.gst),usedNow:'',scan:true,
        hint:l.amount!=null&&l.qty!=null&&l.rate!=null&&Math.abs(l.qty*l.rate*(1+num(l.gst)/100)-l.amount)>Math.max(2,l.amount*0.02)&&Math.abs(l.qty*l.rate-l.amount)>Math.max(2,l.amount*0.02)?`Bill shows amount ${money(l.amount)} — check qty and rate`:''}});
    if(ls.length) d.lines=ls;
    d.scan={total:b.bill_total!=null?num(b.bill_total):0,warnings:(b.warnings||[]).slice(0,8),incl:!!b.rates_include_gst};
    if(!ls.length) d.scan.warnings.unshift('No items could be read from this photo. Type them, or scan a clearer photo.');
    toast(ls.length?`${ls.length} item${ls.length===1?'':'s'} read from the bill — please check`:'Could not read items from the bill',ls.length?'ok':'err');
  }catch(e){d.mode=d.mode==='scan'?'manual':d.mode;toast(e.message||'Could not read the bill.','err')}
  ui.cashScanning=false;ui.cashScanPct=null;render()};
Object.assign(ACT_PERM,{cashMode:['cash_spend','cash_approve','po_approve'],cashScanFile:['cash_spend','cash_approve','po_approve'],cashShop:['cash_spend','cash_approve','po_approve'],cashItem:['cash_spend','cash_approve','po_approve']});
