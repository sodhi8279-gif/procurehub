/* ProcureHub — add a vendor or an item from inside the cash bill.
   The shop not in Vendors, or an item not in the Item catalogue, can be added
   right there: a small form opens inside the bill, and on saving the shop or
   the item line is filled in. The bill stays open with everything typed. */

const CQ_PERM=['cash_spend','cash_approve','po_approve','masters_vendors','masters_items'];
const cqItemKnown=desc=>{const it=D.itemMap&&D.itemMap[slug(desc)];return !!(it&&!it.hidden)};

// ---- vendor ----
function cashVendorBtn(d){
  if(d.nv) return '';
  const shop=String(d.shop||'').trim();
  if(d.vendorId) return `<button type="button" class="btn sm ghost" data-act="cashVNew" data-blank="1">${icon('plus','xs')} New vendor</button>`;
  return `<button type="button" class="btn sm" data-act="cashVNew">${icon('plus','xs')} ${shop?'Add “'+esc(shop.length>28?shop.slice(0,28)+'…':shop)+'” to vendors':'New vendor'}</button>`}

function cashVendorPanel(d){const v=d.nv;if(!v) return '';
  return `<div class="cq-panel" id="cq-vendor"><div class="cq-h">${icon('plus')}<b>New vendor</b><span class="muted small">— saved to Vendors and chosen for this bill</span></div>
   <div class="fields">
    <div class="f span2"><label for="${fid('modal.d.nv.name')}">Vendor / shop name</label>${inp('modal.d.nv.name',v.name,'placeholder="e.g. Sharma Hardware Store" autocomplete="off"')}</div>
    ${field('GSTIN (if any)','modal.d.nv.gstin',v.gstin,'placeholder="15 characters" autocomplete="off" style="text-transform:uppercase"')}
    ${field('Phone / WhatsApp','modal.d.nv.phone',v.phone,'inputmode="tel"')}
    ${field('Contact person','modal.d.nv.contact',v.contact)}
    ${field('City / town','modal.d.nv.city',v.city)}
    <div class="f full"><label for="${fid('modal.d.nv.address')}">Address</label>${inp('modal.d.nv.address',v.address,'placeholder="Shop address"')}</div>
   </div>
   <div class="row tight"><span class="spacer"></span><button type="button" class="btn sm" data-act="cashVCancel">Cancel</button><button type="button" class="btn sm primary" data-act="cashVSave" ${ui.busy?'disabled':''}>${icon('check')} Save vendor</button></div></div>`}

A.cashVNew=x=>{const d=ui.modal&&ui.modal.d;if(!d) return;const blank=x&&x.blank;
  if(!blank&&d.vendorId){const v=S.vendors.find(v=>v.id===d.vendorId);toast(`“${v?v.name:d.shop}” is already in Vendors — chosen for this bill`);render();return}
  d.nv={name:blank?'':String(d.shop||'').trim(),gstin:blank?'':String(d.shopGstin||'').trim().toUpperCase(),phone:'',contact:'',city:'',address:''};
  render();setTimeout(()=>{const el=document.getElementById(fid('modal.d.nv.name'));if(el){el.focus();el.scrollIntoView({block:'center',behavior:'smooth'})}},40)};
A.cashVCancel=()=>{const d=ui.modal&&ui.modal.d;if(d){delete d.nv;render()}};
A.cashVSave=async()=>{const m=ui.modal,d=m&&m.d;if(!d||!d.nv) return;const v=d.nv;
  const name=String(v.name||'').trim().replace(/\s+/g,' ');if(!name){toast('Enter the vendor name.','err');return}
  const g=String(v.gstin||'').trim().toUpperCase();const ge=gstinCheck(g);if(ge){toast('GSTIN: '+ge,'err');return}
  const j=await run(()=>api('/api/cash/quick',{kind:'vendor',name,gstin:g,phone:String(v.phone||'').trim(),contact:String(v.contact||'').trim(),city:String(v.city||'').trim(),address:String(v.address||'').trim()}));
  if(!j||ui.modal!==m) return;
  d.vendorId=j.id;d.shop=j.name;d.shopGstin=j.gstin||g||d.shopGstin||'';d.vendorNew={id:j.id,name:j.name,city:j.existing?'':String(v.city||'').trim()};delete d.nv;
  toast(j.existing?`“${j.name}” is already in Vendors — chosen for this bill`:`“${j.name}” added to Vendors`);render()};

// ---- item ----
function cashItemBtns(d,l,i){
  if(d.ni&&d.ni.i===i) return '';
  const desc=String(l.desc||'').trim();
  return desc&&!cqItemKnown(desc)?`<button type="button" class="btn sm" data-act="cashINew" data-i="${i}" title="Add this item to the Item catalogue">${icon('plus','xs')} Add to item list</button>`:`<button type="button" class="btn sm ghost" data-act="cashINew" data-i="${i}" data-blank="1" title="Item not in the list? Add a new one">${icon('plus')} New item</button>`}

function cashItemPanel(d,i){const n=d.ni;if(!n||n.i!==i) return '';
  return `<div class="cq-panel" id="cq-item"><div class="cq-h">${icon('plus')}<b>New item</b><span class="muted small">— saved to the Item catalogue and filled in this line</span></div>
   <div class="fields">
    <div class="f span2"><label for="${fid('modal.d.ni.desc')}">Item name</label>${inp('modal.d.ni.desc',n.desc,'placeholder="e.g. PVC solvent cement" autocomplete="off"')}${String(n.desc||'').trim()&&cqItemKnown(n.desc)?`<small class="t-green">${icon('check','xs')} Already in the item list — it will just be used</small>`:''}</div>
    ${field('Size / specification','modal.d.ni.spec',n.spec,'placeholder="optional"')}
    <div class="f"><label for="${fid('modal.d.ni.category')}">Category</label><select class="inp" id="${fid('modal.d.ni.category')}" data-bind="modal.d.ni.category">${catOpts(n.category)}</select></div>
    <div class="f"><label for="${fid('modal.d.ni.unit')}">Unit</label><select class="inp" id="${fid('modal.d.ni.unit')}" data-bind="modal.d.ni.unit">${selOpts(UNITS.includes(n.unit)?UNITS:UNITS.concat([n.unit]),n.unit)}</select></div>
    <div class="f"><label for="${fid('modal.d.ni.gst')}">GST %</label><select class="inp" id="${fid('modal.d.ni.gst')}" data-bind="modal.d.ni.gst">${selOpts(GST_SLABS.map(String),n.gst)}</select></div>
    ${field('HSN code (if known)','modal.d.ni.hsn',n.hsn,'inputmode="numeric"')}
   </div>
   <div class="row tight"><span class="spacer"></span><button type="button" class="btn sm" data-act="cashICancel">Cancel</button><button type="button" class="btn sm primary" data-act="cashISave" ${ui.busy?'disabled':''}>${icon('check')} Save item</button></div></div>`}

A.cashINew=x=>{const d=ui.modal&&ui.modal.d;if(!d) return;const i=+x.i;const l=d.lines[i];if(!l) return;const blank=x.blank&&!(String(l.desc||'').trim()&&!cqItemKnown(l.desc));
  const desc=blank?'':String(l.desc||'').trim();const cat=desc?(classify(desc,l.spec||'').cat||'others'):'others';
  d.ni={i,desc,spec:blank?'':String(l.spec||''),unit:l.unit||'Nos',category:CAT[cat]?cat:'others',gst:String(l.gst||'18'),hsn:''};
  render();setTimeout(()=>{const el=document.getElementById(fid('modal.d.ni.desc'));if(el){el.focus();el.scrollIntoView({block:'center',behavior:'smooth'})}},40)};
A.cashICancel=()=>{const d=ui.modal&&ui.modal.d;if(d){delete d.ni;render()}};
A.cashISave=async()=>{const m=ui.modal,d=m&&m.d;if(!d||!d.ni) return;const n=d.ni;const l=d.lines[n.i];if(!l){delete d.ni;render();return}
  const desc=String(n.desc||'').trim().replace(/\s+/g,' ');if(!desc){toast('Enter the item name.','err');return}
  const id=slug(desc);let saved=desc;
  if(!cqItemKnown(desc)){const j=await run(()=>api('/api/cash/quick',{kind:'item',id,desc,spec:String(n.spec||'').trim(),unit:n.unit||'Nos',category:n.category||'others',gst:num(n.gst),hsn:String(n.hsn||'').trim()}));
    if(!j||ui.modal!==m) return;saved=j.desc||desc;toast(j.existing?`“${saved}” is already in the item list — used on this line`:`“${saved}” added to the item list`)}
  else{const it=D.itemMap[id];saved=it.desc||desc;toast(`“${saved}” is in the item list — used on this line`)}
  l.desc=saved;if(String(n.spec||'').trim()) l.spec=String(n.spec).trim();l.unit=n.unit||l.unit||'Nos';if(!l.scan||!l.gst) l.gst=String(n.gst||l.gst||'18');
  l.hint='';delete d.ni;render()};

// Typing in the shop or item box and then clicking a button straight away: the box
// leaving focus redraws the bill (vendor match, last rate), which used to swallow
// the click. Keep the focus on mouse-down, then let the box finish before the click acts.
document.addEventListener('mousedown',e=>{if(!ui.modal||ui.modal.type!=='cashNew') return;const b=e.target.closest&&e.target.closest('#modal button[data-act]');const ae=document.activeElement;
  if(b&&ae&&ae.matches&&ae.matches('#modal input[data-act-change]')){e.preventDefault();ui.cqBlur=true}},true);
document.addEventListener('click',e=>{if(!ui.cqBlur) return;ui.cqBlur=false;const ae=document.activeElement;if(ae&&ae.matches&&ae.matches('#modal input[data-act-change]')) ae.blur()},true);

Object.assign(ACT_PERM,{cashVNew:CQ_PERM,cashVCancel:CQ_PERM,cashVSave:CQ_PERM,cashINew:CQ_PERM,cashICancel:CQ_PERM,cashISave:CQ_PERM});
