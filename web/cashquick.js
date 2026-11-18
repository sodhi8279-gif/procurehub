/* ProcureHub — add a vendor or an item from inside the cash bill.
   The shop not in Vendors, or an item not in the Item catalogue, can be added
   right there: a small form opens inside the bill, and on saving the shop or
   the item line is filled in. The bill stays open with everything typed. */

const CQ_PERM=['cash_spend','cash_approve','po_approve','masters_vendors','masters_items'];

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

// ---- item: the same way items are added normally ----
// Search the item catalogue and the standard items (Pipe, Fitting, Valve, Cable…);
// an item with varieties shows its drop-downs (Material → Class → Size → IS…),
// narrowed by the first choice. A new item is set up like in Item catalogue:
// category, unit, GST, HSN, sizes offered and varieties, then chosen for the line.
const cqItemInfo=desc=>{const it=D.itemMap&&D.itemMap[slug(desc)];return it&&!it.hidden?it:null};
const cqHasDrop=it=>!!(it&&((it.attrs||[]).length||(it.sizes||[]).length));
const cqLibHave=g=>{const nm=norm(g.desc);return D.items.find(x=>x.category===g.cat&&!x.hidden&&[nm,nm+'s',nm+'es'].includes(norm(x.desc)))||null};
const cqSizes=t=>String(t||'').split(',').map(z=>typeof normSize==='function'?normSize(z):z.trim()).filter(Boolean);

function cqItem(n){const p=n&&n.pick;if(!p) return null;
  if(p.kind==='cat') return D.itemMap[p.id]||null;
  if(p.kind==='lib'){const g=STD_LIB.find(x=>x.id===p.gid);return g?Object.assign({id:g.id},libItem(g)):null}
  return {id:slug(n.q||''),desc:String(n.q||'').trim(),category:n.category,unit:n.unit,spec:n.spec||'',attrs:attrsFromDraft(n.attrs||[]),sizes:cqSizes(n.sizesText),rel:null}}

function cqSugg(q){q=String(q||'').trim();if(!q) return {lib:[],list:[],exact:false};
  const toks=norm(q).split(' ').filter(Boolean);const r=suggItems(q);const list=r.list.slice(0,8);
  const lib=typeof STD_LIB==='undefined'?[]:STD_LIB.filter(g=>{if(cqLibHave(g)) return false;const it=libItem(g);const hay=' '+norm([g.desc,catName(g.cat),...it.attrs.flatMap(a=>a.opts)].join(' '))+' ';
    return toks.every(t=>hay.includes(' '+t)||hay.includes(' '+t.replace(/e?s$/,'')))}).slice(0,4);
  return {lib,list,exact:r.exact}}

function cqPicker(it,n){const sizes=varSizesFor(it,n);const note=varNote(it,n);
  const sizeSel=()=>{const v=n.size||'';return `<div class="vp-col"><label for="cq-size">Size</label><select class="inp" id="cq-size" data-act-change="cqSize"><option value="">— choose —</option>${sizes.map(z=>`<option value="${esc(z)}" ${v===z?'selected':''}>${esc(z)}</option>`).join('')}<option value="__other" ${v==='__other'?'selected':''}>Others…</option></select>${v==='__other'?inp('modal.d.ni.otherSize',n.otherSize,'placeholder="Type the size"'):''}</div>`};
  const cell=c=>{if(c.size) return sizes.length||n.size==='__other'?sizeSel():'';
    const a=c.a,i=it.attrs.indexOf(a);if(!varShowAttr(it,n,a)) return '';const v=n.av[a.name]||'';const os=varOptsFor(it,n,a);
    return `<div class="vp-col"><label for="cq-a-${i}">${esc(a.name)}${a.req?'':' <span class="muted small">(optional)</span>'}</label><select class="inp" id="cq-a-${i}" data-act-change="cqPick" data-a="${i}"><option value="">— choose —</option>${os.map(o=>`<option value="${esc(o)}" ${v===o?'selected':''}>${esc(o)}</option>`).join('')}<option value="__other" ${v==='__other'?'selected':''}>Others…</option></select>${v==='__other'?inp('modal.d.ni.avo.'+a.name,n.avo[a.name],`placeholder="Type the ${esc(a.name.toLowerCase())}"`):''}</div>`};
  const cols=(it.attrs||[]).length?varCols(it):(sizes.length?[{size:true}]:[]);
  return `${cols.length?`<div class="vp-grid">${cols.map(cell).join('')}</div>`:''}${note?`<p class="small muted" style="margin:4px 0 0">${icon('help','xs')} ${esc(note)}</p>`:''}`}
function cqSpec(it,n){const size=n.size==='__other'?String(n.otherSize||'').trim():(n.size||'');return (it.attrs||[]).length?varSpec(it,varVals(it,n),size,n.extra):[size,String(n.extra||'').trim()].filter(Boolean).join(', ')}

function cqAttrsEd(n){const a=n.attrs||(n.attrs=[]);
  return `<div class="f full var-ed"><label>Varieties <span class="muted small">— drop-downs for this item (Type, Class, Pressure…), like in Item catalogue</span></label>
   ${a.length?`<div class="var-rows">${a.map((x,i)=>`<div class="var-row"><input class="inp" data-bind="modal.d.ni.attrs.${i}.name" value="${esc(x.name)}" placeholder="Name, e.g. Type" aria-label="Variety name" data-rerender="1">
     <input class="inp grow" data-bind="modal.d.ni.attrs.${i}.optsText" value="${esc(x.optsText)}" placeholder="Choices, comma separated — e.g. GI, DI, PVC" aria-label="Choices" data-rerender="1">
     <label class="check small"><input type="checkbox" data-bind="modal.d.ni.attrs.${i}.req" ${x.req?'checked':''}> Must choose</label>
     <label class="check small"><input type="checkbox" data-bind="modal.d.ni.attrs.${i}.showName" ${x.showName?'checked':''}> Name in spec</label>
     <button type="button" class="btn sm ghost" data-act="cqVarDel" data-i="${i}" aria-label="Remove">${icon('trash','xs')}</button></div>`).join('')}</div>`:''}
   <div class="row tight" style="margin-top:6px"><button type="button" class="btn sm" data-act="cqVarAdd">${icon('plus')} Add variety</button><span class="small muted">or start from:</span>${Object.keys(VAR_PRESETS).map(k=>`<button type="button" class="btn sm ghost" data-act="cqVarPreset" data-k="${k}">${k}</button>`).join('')}</div></div>`}

function cashItemBtns(d,l,i){
  if(d.ni&&d.ni.i===i) return '';
  const desc=String(l.desc||'').trim();const it=desc&&cqItemInfo(desc);
  if(!desc) return `<button type="button" class="btn sm" data-act="cashINew" data-i="${i}">${icon('search')} Choose item</button>`;
  if(!it) return `<button type="button" class="btn sm" data-act="cashINew" data-i="${i}" title="Pick it from the item list, or add it as a new item">${icon('plus')} Add to item list</button>`;
  return cqHasDrop(it)?`<button type="button" class="btn sm" data-act="cashINew" data-i="${i}">${icon('layers')} Choose type / size</button>`:`<button type="button" class="btn sm ghost" data-act="cashINew" data-i="${i}">${icon('search')} Change item</button>`}

function cashItemPanel(d,i){const n=d.ni;if(!n||n.i!==i) return '';const it=cqItem(n);const p=n.pick;
  const foot=`<div class="row tight"><span class="spacer"></span><button type="button" class="btn sm" data-act="cashICancel">Cancel</button>${p?`<button type="button" class="btn sm primary" data-act="cashISave" ${ui.busy?'disabled':''}>${icon('check')} ${p.kind==='cat'?'Use on this line':'Save item & use'}</button>`:''}</div>`;
  const common=`<div class="fields"><div class="f"><label for="${fid('modal.d.ni.unit')}">Unit</label><select class="inp" id="${fid('modal.d.ni.unit')}" data-bind="modal.d.ni.unit">${selOpts(UNITS.includes(n.unit)?UNITS:UNITS.concat([n.unit]),n.unit)}</select></div>
    <div class="f"><label for="${fid('modal.d.ni.gst')}">GST % on the bill</label><select class="inp" id="${fid('modal.d.ni.gst')}" data-bind="modal.d.ni.gst">${selOpts(GST_SLABS.map(String),n.gst)}</select></div>
    <div class="f span2"><label for="${fid('modal.d.ni.extra')}">Make / more specification (optional)</label>${inp('modal.d.ni.extra',n.extra,'placeholder="e.g. Jindal, IBR tested" data-rerender="1"')}</div></div>`;
  let body;
  if(!p){const sg=cqSugg(n.q);const q=String(n.q||'').trim();
    body=`<div class="f"><label for="${fid('modal.d.ni.q')}">Item — type to search the item list</label>${inp('modal.d.ni.q',n.q,'placeholder="e.g. Pipe, Elbow, Sluice valve, Cable" autocomplete="off" data-rerender="1"')}</div>
     ${q?`<div class="cq-sugg">${sg.lib.map(g=>`<button type="button" class="cq-opt" data-act="cqChoose" data-k="lib" data-id="${esc(g.id)}">${thumb({category:g.cat,desc:g.desc},'xs')}<span class="grow"><b>${esc(g.desc)}</b><small>${esc(catName(g.cat))} · standard item with drop-downs (${esc(libItem(g).attrs.map(a=>a.name).slice(0,4).join(', '))}, Size)</small></span></button>`).join('')}
      ${sg.list.map((o,k)=>`<button type="button" class="cq-opt" data-act="cqChoose" data-k="${o.kind}" data-id="${esc(o.kind==='cat'?o.id:String(k))}">${thumb({category:o.cat,desc:o.desc},'xs')}<span class="grow"><b>${esc(o.desc)}${o.spec?` <span class="sugg-spec">${esc(o.spec)}</span>`:''}</b><small>${esc(catName(o.cat))} · ${esc(o.unit)}${o.kind==='cat'?(cqHasDrop(D.itemMap[o.id])?' · drop-downs':'')+' · in item list':' · used before, not in item list'}</small></span></button>`).join('')}
      ${`<button type="button" class="cq-opt create" data-act="cqChoose" data-k="new"><span class="thumb xs plus">${icon('plus')}</span><span class="grow"><b>Create new item “${esc(q)}”</b><small>Set it up with category, unit, sizes and drop-downs</small></span></button>`}</div>`:'<p class="small muted" style="margin:0">Type the item name. Items in your list and standard items (pipes, fittings, valves, cables, cement, steel…) come up with their size and type drop-downs.</p>'}`}
  else if(p.kind==='new'){const prev=it.attrs.length||it.sizes.length;
    body=`<div class="fields">
     <div class="f span2"><label for="${fid('modal.d.ni.q')}">Item description</label>${inp('modal.d.ni.q',n.q,'placeholder="e.g. DI K7 pipe" autocomplete="off"')}${String(n.q||'').trim()&&cqItemInfo(n.q)?`<small class="t-amber">An item with this name is already in the list — <button type="button" class="linkish small" data-act="cqChoose" data-k="cat" data-id="${esc(cqItemInfo(n.q).id)}">use it</button></small>`:''}</div>
     <div class="f"><label for="${fid('modal.d.ni.category')}">Category</label><div class="row tight nowrap"><select class="inp" id="${fid('modal.d.ni.category')}" data-bind="modal.d.ni.category">${catOpts(n.category)}</select>${ui.role==='hq'&&(can('masters_items')||can('settings'))?`<button type="button" class="btn sm" data-act="cqQuickCat" title="Add a new category">${icon('plus')} New</button>`:''}</div></div>
     ${field('HSN code','modal.d.ni.hsn',n.hsn,'inputmode="numeric" placeholder="e.g. 7303"')}
     <div class="f span2"><label for="${fid('modal.d.ni.spec')}">Default specification</label>${inp('modal.d.ni.spec',n.spec,'placeholder="e.g. IS 8329, cement mortar lined"')}</div>
     <div class="f full"><label for="${fid('modal.d.ni.sizesText')}">Sizes offered (comma separated)</label>${inp('modal.d.ni.sizesText',n.sizesText,'placeholder="100 mm, 150 mm, 200 mm" data-rerender="1"')}<button type="button" class="linkish small" data-act="cqStdSizes">${icon('plus','xs')} Add standard mm sizes</button></div>
     ${cqAttrsEd(n)}</div>
     ${prev?`<div class="lbl">For this bill — choose</div>${cqPicker(it,n)}`:''}${common}
     <p class="vp-sum small">${icon('check','xs')} <b>${esc(it.desc||'New item')}</b>${cqSpec(it,n)?' — '+esc(cqSpec(it,n)):''}</p>`}
  else{const have=p.kind==='lib';
    body=`<div class="mhead"><div class="grow"><b>${esc(it.desc)}</b> ${catSw(it.category)} ${have?'<span class="chip blue xs">standard item — will be added to your item list</span>':''}${it.spec?`<small class="muted block">${esc(it.spec)}</small>`:''}</div><button type="button" class="btn sm ghost" data-act="cqChoose" data-k="none">${icon('search')} Change item</button></div>
     ${cqPicker(it,n)}${common}
     <p class="vp-sum small">${icon('check','xs')} <b>${esc(it.desc)}</b>${cqSpec(it,n)?' — '+esc(cqSpec(it,n)):cqHasDrop(it)?' <span class="muted">— choose from the drop-downs</span>':''}</p>`}
  return `<div class="cq-panel" id="cq-item"><div class="cq-h">${icon(p&&p.kind!=='new'?'layers':'plus')}<b>${!p?'Choose item':p.kind==='new'?'New item':'Item'}</b><span class="muted small">— ${p&&p.kind==='new'?'saved to the Item catalogue and filled in this line':'filled in this line'}</span></div>${body}${foot}</div>`}

// choose an item: prefill its drop-downs from what the bill says
function cqPickItem(n,pick,l){n.pick=pick;n.av={};n.avo={};n.size='';n.otherSize='';const it=cqItem(n);if(!it) return;
  if(pick.kind==='new') return;
  if(it.unit) n.unit=it.unit;const g=it.gst!=null&&it.gst!==''?it.gst:null;if(g!=null) n.gst=cashSlab(g);
  const known=l&&cqItemInfo(l.desc);const text=l?[l.spec||'',known?'':(l.desc||'')].join(' , '):'';
  if((it.attrs||[]).length){const gu=varGuess(it,text);n.av=gu.vals;n.extra=known?gu.rest:String(l&&l.spec||'').trim()?gu.rest:'';
    const zs=varSizesFor(it,n);const z=gu.size&&zs.find(x=>sizeKey(x)===sizeKey(gu.size));if(z) n.size=z;else if(gu.size){n.size='__other';n.otherSize=gu.size}}
  else if((it.sizes||[]).length&&l&&l.spec){const z=it.sizes.find(x=>sizeKey(x)===sizeKey(l.spec));if(z) n.size=z;else n.extra=l.spec}
  else if(l&&known) n.extra=l.spec||''}

A.cashINew=x=>{const d=ui.modal&&ui.modal.d;if(!d) return;const i=+x.i;const l=d.lines[i];if(!l) return;delete d.nv;
  const desc=String(l.desc||'').trim();const it=desc&&cqItemInfo(desc);
  d.ni={i,q:desc,pick:null,av:{},avo:{},size:'',otherSize:'',extra:'',unit:l.unit||'Nos',gst:String(l.gst||'18'),category:desc?(classify(desc,l.spec||'').cat||'others'):'others',hsn:'',spec:'',sizesText:'',attrs:[]};
  if(it) cqPickItem(d.ni,{kind:'cat',id:it.id},l);
  render();setTimeout(()=>{const el=document.querySelector('#cq-item select, #cq-item input');if(el){if(!it) el.focus();document.getElementById('cq-item').scrollIntoView({block:'center',behavior:'smooth'})}},40)};
A.cashICancel=()=>{const d=ui.modal&&ui.modal.d;if(d){delete d.ni;render()}};
A.cqChoose=x=>{const d=ui.modal&&ui.modal.d,n=d&&d.ni;if(!n) return;const l=d.lines[n.i];
  if(x.k==='none'){n.pick=null;render();return}
  if(x.k==='cat'){const it=D.itemMap[x.id];if(!it) return;n.q=it.desc;cqPickItem(n,{kind:'cat',id:it.id},l)}
  else if(x.k==='lib') cqPickItem(n,{kind:'lib',gid:x.id},l);
  else if(x.k==='used'){const o=cqSugg(n.q).list[+x.id];if(!o) return;n.q=o.desc;n.unit=o.unit||n.unit;n.category=o.cat||n.category;n.extra=o.spec||'';n.pick={kind:'new'}}
  else{n.q=String(n.q||'').trim();n.category=classify(n.q,'').cat||n.category||'others';n.pick={kind:'new'};const g=itemGst(n.q);if(g!=null) n.gst=cashSlab(g)}
  render()};
CH.cqPick=el=>{const d=ui.modal&&ui.modal.d,n=d&&d.ni;if(!n) return;const it=cqItem(n);const a=it&&it.attrs[+el.dataset.a];if(!a) return;n.av[a.name]=el.value;
  if(it.rel&&it.rel.by===a.name){for(const b of it.attrs){if(b===a) continue;const v=n.av[b.name];if(v&&(!varShowAttr(it,n,b)||v!=='__other'&&!varOptsFor(it,n,b).includes(v))) n.av[b.name]=''}const zs=varSizesFor(it,n);if(n.size&&n.size!=='__other'&&!zs.includes(n.size)) n.size=''}render()};
CH.cqSize=el=>{const n=ui.modal&&ui.modal.d&&ui.modal.d.ni;if(n){n.size=el.value;render()}};
A.cqVarAdd=()=>{const n=ui.modal.d.ni;n.attrs.push({name:'',optsText:'',req:true,showName:false});render()};
A.cqVarDel=x=>{const n=ui.modal.d.ni;const a=n.attrs[+x.i];n.attrs.splice(+x.i,1);if(a) delete n.av[a.name];render()};
A.cqVarPreset=x=>{const a=ui.modal.d.ni.attrs;for(const [nm,o] of VAR_PRESETS[x.k]||[]) if(!a.some(y=>norm(y.name)===norm(nm))) a.push({name:nm,optsText:o,req:nm!=='Ends'&&nm!=='Make'&&nm!=='Armour'&&nm!=='Angle',showName:nm==='Class'||nm==='Pressure'});render()};
A.cqStdSizes=()=>{const n=ui.modal.d.ni;const seen=new Set(),out=[];for(const z of cqSizes(n.sizesText).concat(STD_SIZES_MM)){const k=sizeKey(z);if(!seen.has(k)){seen.add(k);out.push(z)}}n.sizesText=out.join(', ');render()};
A.cqQuickCat=()=>{const keep=ui.modal;confirmBox({title:'New category',body:'<p>Add a category for items that do not fit the existing ones.</p>',note:'Category name',yes:'Add category',
  onYes:async m=>{const name=String(m.noteVal||'').trim();if(!name){toast('Enter the category name.','err');return}let cats;try{cats=catsToSave(catDraft().concat({name,kwText:'',photo:'',hidden:false}))}catch(e){toast(e.message,'err');return}
    if(await run(()=>updDoc('config','main',{cats}),'Category “'+name+'” added')!==false){ui.modal=keep;if(keep.d.ni) keep.d.ni.category=cats[cats.length-1].id;render()}}})};

A.cashISave=async()=>{const m=ui.modal,d=m&&m.d;if(!d||!d.ni) return;const n=d.ni;const l=d.lines[n.i];if(!l){delete d.ni;render();return}
  if(!n.pick){toast('Choose the item from the list, or create a new one.','err');return}
  let it=cqItem(n);if(!it) return;
  if(n.pick.kind==='new'){const desc=String(n.q||'').trim().replace(/\s+/g,' ');if(!desc){toast('Enter the item description.','err');return}
    const ex=cqItemInfo(desc);if(ex){toast(`“${ex.desc}” is already in the item list — choose it there.`,'err');return}
    const bad=(n.attrs||[]).find(a=>!String(a.name||'').trim()&&String(a.optsText||'').trim());if(bad){toast('Give each variety a name, e.g. Type or Class.','err');return}
    it=Object.assign(it,{desc,id:slug(desc)})}
  const v=(it.attrs||[]).length?varCheck(it,n):{vals:{}};if(v.err){toast(v.err,'err');return}
  const size=n.size==='__other'?String(n.otherSize||'').trim():(n.size||'');
  if(varSizesFor(it,n).length&&!size){toast('Choose a size.','err');return}
  const spec=cqSpec(it,n);let desc=it.desc;
  if(n.pick.kind!=='cat'){
    const body=n.pick.kind==='lib'?{kind:'item',id:it.id,desc:it.desc,spec:it.spec||'',unit:it.unit,category:it.category,sizes:it.sizes,attrs:it.attrs,rel:it.rel}
      :{kind:'item',id:it.id,desc:it.desc,spec:String(n.spec||'').trim(),unit:n.unit||'Nos',category:n.category||'others',gst:num(n.gst),hsn:String(n.hsn||'').trim(),sizes:it.sizes,attrs:it.attrs};
    const j=await run(()=>api('/api/cash/quick',body));if(!j||ui.modal!==m) return;desc=j.desc||desc;
    toast(j.existing?`“${desc}” is already in the item list — used on this line`:`“${desc}” added to the item list`)}
  l.desc=desc;l.spec=spec;l.unit=n.unit||it.unit||l.unit||'Nos';l.gst=String(n.gst||l.gst||'18');l.hint='';delete d.ni;render()};
// Typing in the shop or item box and then clicking a button straight away: the box
// leaving focus redraws the bill (vendor match, last rate), which used to swallow
// the click. Keep the focus on mouse-down, then let the box finish before the click acts.
document.addEventListener('mousedown',e=>{if(!ui.modal||ui.modal.type!=='cashNew') return;const b=e.target.closest&&e.target.closest('#modal button[data-act]');const ae=document.activeElement;
  if(b&&ae&&ae.matches&&ae.matches('#modal input[data-act-change]')){e.preventDefault();ui.cqBlur=true}},true);
document.addEventListener('click',e=>{if(!ui.cqBlur) return;ui.cqBlur=false;const ae=document.activeElement;if(ae&&ae.matches&&ae.matches('#modal input[data-act-change]')) ae.blur()},true);

Object.assign(ACT_PERM,{cashVNew:CQ_PERM,cashVCancel:CQ_PERM,cashVSave:CQ_PERM,cashINew:CQ_PERM,cashICancel:CQ_PERM,cashISave:CQ_PERM,cqChoose:CQ_PERM,cqPick:CQ_PERM,cqSize:CQ_PERM,cqVarAdd:CQ_PERM,cqVarDel:CQ_PERM,cqVarPreset:CQ_PERM,cqStdSizes:CQ_PERM,cqQuickCat:['masters_items','settings']});
