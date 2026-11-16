/* ProcureHub — item varieties.
   A catalogue item can carry its own varieties, e.g. Pipe:
     Type: GI / DI / PVC   ·   Class: Light / Medium / Heavy   ·   IS code: IS 1239 / IS 4985
   plus its sizes. When a site adds the item to a demand it picks one value of
   each (or types another), and the item's specification is written from them
   in a fixed order — "GI, Class Medium, IS 1239, 25 mm" — so the same thing is
   always written the same way and stock, rates and orders add up.
   Existing items can be converted: tick them in Find items → Convert to
   varieties; each is renamed everywhere to the one item with its values. */

const VAR_PRESETS={
  'Pipe':[['Type','GI, DI, MS, PVC, uPVC, CPVC, HDPE'],['Class','Light, Medium, Heavy'],['Pressure','PN 4, PN 6, PN 10, PN 16, 4 kg/cm², 6 kg/cm², 10 kg/cm²'],['IS code','IS 1239, IS 3589, IS 8329, IS 4985, IS 4984'],['Ends','Plain, Socketed, Flanged, Threaded']],
  'Valve':[['Type','Sluice, Butterfly, Gate, Ball, Non-return, Air'],['Pressure','PN 10, PN 16, PN 25'],['Body','CI, DI, Brass, PVC'],['Ends','Flanged, Threaded, Socket']],
  'Fitting':[['Type','Elbow, Tee, Reducer, Coupling, Bend, Collar, Union'],['Material','GI, DI, PVC, CPVC, HDPE'],['Angle','90°, 45°, 22.5°, 11.25°']],
  'Cable':[['Core','1 core, 2 core, 3 core, 3.5 core, 4 core'],['Size','1.5 sq mm, 2.5 sq mm, 4 sq mm, 6 sq mm, 10 sq mm'],['Conductor','Copper, Aluminium'],['Armour','Armoured, Unarmoured']],
  'Cement':[['Grade','OPC 43, OPC 53, PPC, PSC'],['Make','ACC, UltraTech, Ambuja, Shree']]};

const attrsToDraft=a=>(a||[]).map(x=>({name:x.name||'',optsText:(x.opts||[]).join(', '),req:x.req!==false,showName:!!x.showName}));
const attrsFromDraft=a=>(a||[]).map(x=>({name:String(x.name||'').trim(),opts:String(x.optsText||'').split(',').map(s=>s.trim()).filter(Boolean),req:!!x.req,showName:!!x.showName})).filter(x=>x.name);

// ---- the item editor: its varieties ----
function attrsEditor(m){const d=m.d;const a=d.attrs||(d.attrs=[]);
  return `<div class="f full var-ed"><label>Varieties <span class="muted small">— what sites choose when they ask for this item (sizes are above)</span></label>
   ${a.length?`<div class="var-rows">${a.map((x,i)=>`<div class="var-row"><input class="inp" data-bind="modal.d.attrs.${i}.name" value="${esc(x.name)}" placeholder="Name, e.g. Type" aria-label="Variety name">
     <input class="inp grow" data-bind="modal.d.attrs.${i}.optsText" value="${esc(x.optsText)}" placeholder="Choices, comma separated — e.g. GI, DI, PVC" aria-label="Choices">
     <label class="check small" title="The site must choose this"><input type="checkbox" data-bind="modal.d.attrs.${i}.req" ${x.req?'checked':''}> Must choose</label>
     <label class="check small" title="Write the name in the specification, e.g. Class Medium"><input type="checkbox" data-bind="modal.d.attrs.${i}.showName" ${x.showName?'checked':''}> Name in spec</label>
     <button type="button" class="btn sm ghost" data-act="varUp" data-i="${i}" ${i?'':'disabled'} aria-label="Move up">↑</button><button type="button" class="btn sm ghost" data-act="varDel" data-i="${i}" aria-label="Remove">${icon('trash','xs')}</button></div>`).join('')}</div>`:''}
   <div class="row tight" style="margin-top:6px"><button type="button" class="btn sm" data-act="varAdd">${icon('plus')} Add variety</button><span class="small muted">or start from:</span>${Object.keys(VAR_PRESETS).map(k=>`<button type="button" class="btn sm ghost" data-act="varPreset" data-k="${k}">${k}</button>`).join('')}</div>
   ${a.length?`<p class="small muted" style="margin:6px 0 0">Example specification: <b>${esc(varSpec({attrs:attrsFromDraft(a)},Object.fromEntries(attrsFromDraft(a).map(x=>[x.name,x.opts[0]||''])),String(d.sizesText||'').split(',')[0].trim(),'')||'—')}</b>. Sites can also type a value that is not listed.</p>`:''}
   ${m.id?`<button type="button" class="linkish small" data-act="varConvFrom" data-id="${esc(m.id)}">${icon('layers','xs')} Convert existing items into varieties of this item…</button>`:''}</div>`}
A.varAdd=()=>{ui.modal.d.attrs.push({name:'',optsText:'',req:true,showName:false});render()};
A.varDel=d=>{ui.modal.d.attrs.splice(+d.i,1);render()};
A.varUp=d=>{const a=ui.modal.d.attrs,i=+d.i;if(i>0){[a[i-1],a[i]]=[a[i],a[i-1]];render()}};
A.varPreset=d=>{const a=ui.modal.d.attrs;for(const [n,o] of VAR_PRESETS[d.k]||[]) if(!a.some(x=>norm(x.name)===norm(n))) a.push({name:n,optsText:o,req:n!=='Ends'&&n!=='Make'&&n!=='Armour'&&n!=='Angle',showName:n==='Class'||n==='Pressure'});render()};

// ---- the specification written from the chosen values ----
function varSpec(it,vals,size,extra){const parts=[];for(const a of it.attrs||[]){const v=String((vals||{})[a.name]||'').trim();if(!v) continue;parts.push(a.showName&&!norm(v).includes(norm(a.name))?a.name+' '+v:v)}
  if(size) parts.push(String(size).trim());if(extra&&String(extra).trim()) parts.push(String(extra).trim());return parts.join(', ')}
function varVals(it,d){const out={};for(const a of it.attrs||[]){const v=(d.av||{})[a.name];out[a.name]=v==='__other'?String((d.avo||{})[a.name]||'').trim():(v||'')}return out}
function varCheck(it,d){const vals=varVals(it,d);for(const a of it.attrs||[]) if(a.req&&!vals[a.name]&&!(typeof varShowAttr==='function'&&!varShowAttr(it,d,a))) return {err:`Choose the ${a.name.toLowerCase()}.`};return {vals}}

// ---- adding the item to a demand: choose a value of each ----
function varPicker(it,d){if(!(it.attrs||[]).length) return '';d.av=d.av||{};d.avo=d.avo||{};
  const note=typeof varNote==='function'?varNote(it,d):'';return it.attrs.map((a,i)=>{if(typeof varShowAttr==='function'&&!varShowAttr(it,d,a)) return '';const v=d.av[a.name]||'';const os=typeof varOptsFor==='function'?varOptsFor(it,d,a):a.opts;return `<div class="f"><label>${esc(a.name)}${a.req?'':' <span class="muted small">(optional)</span>'}</label><div class="size-chips">${os.map(o=>`<button type="button" class="schip ${v===o?'on':''}" data-act="varPick" data-a="${i}" data-val="${esc(o)}">${esc(o)}</button>`).join('')}<button type="button" class="schip ${v==='__other'?'on':''}" data-act="varPick" data-a="${i}" data-val="__other">Other</button></div>
    ${v==='__other'?`<input class="inp" style="margin-top:6px" data-bind="modal.d.avo.${esc(a.name)}" value="${esc(d.avo[a.name]||'')}" placeholder="Type the ${esc(a.name.toLowerCase())}">`:''}${i===0&&note?`<small class="muted block" style="margin-top:4px">${icon('help','xs')} ${esc(note)}</small>`:''}</div>`}).join('')}
A.varPick=d=>{const m=ui.modal,it=m.item;const a=it.attrs[+d.a];if(!a) return;m.d.av[a.name]=m.d.av[a.name]===d.val?'':d.val;
  if(it.rel&&it.rel.by===a.name&&typeof varOptsFor==='function'){for(const b of it.attrs){if(b===a) continue;const v=m.d.av[b.name];if(v&&(!varShowAttr(it,m.d,b)||v!=='__other'&&!varOptsFor(it,m.d,b).includes(v))) m.d.av[b.name]=''}const zs=varSizesFor(it,m.d);if(m.d.size&&m.d.size!=='__other'&&!zs.includes(m.d.size)) m.d.size=''}render()};
// an item asked before: its specification gives the values back
function varPrefill(it,d){const g=varGuess(it,d.spec||'');d.av={};d.avo={};for(const a of it.attrs){if(g.vals[a.name]) d.av[a.name]=g.vals[a.name]}
  if(g.size&&(it.sizes||[]).includes(g.size)) d.size=g.size;d.spec=g.rest}

// guess the values from an existing item's name and specification
function varGuess(it,text){let t=' '+String(text||'').replace(/[,;]/g,' , ')+' ';const vals={};
  const take=v=>{const re=new RegExp('(^|[^a-z0-9])'+v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s*')+'(?![a-z0-9])','i');const m=re.exec(t);if(!m) return false;t=t.slice(0,m.index)+m[1]+' '+t.slice(m.index+m[0].length);return true};
  for(const a of it.attrs||[]){const opts=[...a.opts].sort((x,y)=>y.length-x.length);for(const o of opts){if(take(a.name+' '+o)||take(o)){vals[a.name]=o;break}}}
  let size='';for(const z of [...(it.sizes||[])].sort((x,y)=>y.length-x.length)) if(take(z)){size=z;break}
  if(!size){const m=/((?:\d+\s+)?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)\s*(mm|inch|in|"|''|”|sq\s*mm|nb|dn)(?![a-z0-9])/i.exec(t);if(m){size=m[0].replace(/\s+/g,' ').trim();t=t.replace(m[0],' ')}}
  const rest=t.replace(/\s*,\s*(,\s*)+/g,', ').replace(/\s+/g,' ').replace(/^[\s,·\-]+|[\s,·\-]+$/g,'').trim();return {vals,size,rest}}

/* ---- converting existing items into varieties of one item ---- */
A.varConv=()=>{const keys=Object.keys(ui.sel.fi||{});const idx=itemIndex();const rows=idx.filter(o=>keys.includes(o.key));if(!rows.length) return toast('Tick the items first.','err');
  // the target: a catalogue item with varieties among them, else the first one's name
  const withAttrs=rows.map(o=>D.itemMap[slug(o.desc)]).find(it=>it&&(it.attrs||[]).length);const it=withAttrs||D.itemMap[slug(rows[0].desc)];
  varConvOpen(it?it.id:'',rows.map(o=>({o,on:true})),it?'':rows[0].desc)};
A.varConvFrom=d=>{const it=D.itemMap[d.id];if(!it) return;const words=norm(it.desc).split(' ').filter(w=>w.length>=3);
  const rows=itemIndex().filter(o=>!(norm(o.desc)===norm(it.desc)&&varSpec(it,varGuess(it,o.spec).vals,varGuess(it,o.spec).size,varGuess(it,o.spec).rest)===o.spec)&&words.some(w=>norm(o.desc).split(' ').includes(w)||norm(o.desc).split(' ').includes(w+'s'))).slice(0,120);
  if(!rows.length) return toast('No other items look like this one. Tick items in Find items and use Convert to varieties.','err');
  varConvOpen(it.id,rows.map(o=>({o,on:norm(o.desc)===norm(it.desc)})),'')};
function varConvOpen(targetId,rows,newName,lib){const it=targetId?D.itemMap[targetId]:(lib&&typeof libItem==='function'?Object.assign({id:''},libItem(lib)):null);
  const d={target:targetId||'__new',rel:it&&it.rel||null,name:it?it.desc:newName,category:it?it.category:(rows[0].o.cat||'others'),unit:it?it.unit:rows[0].o.unit,attrs:attrsToDraft(it&&it.attrs),sizesText:((it&&it.sizes)||[]).join(', '),rows:[]};
  if(!d.attrs.length){const p=Object.keys(VAR_PRESETS).find(k=>norm(d.name).includes(norm(k)));if(p) d.attrs=VAR_PRESETS[p].map(([n,o])=>({name:n,optsText:o,req:false,showName:n==='Class'||n==='Pressure'}))}
  d._new=true;d.rows=rows.map(({o,on})=>({key:o.key,desc:o.desc,spec:o.spec,unit:o.unit,on,vals:{},size:'',rest:'',touched:false,catOnly:!!o.catOnly,sizes:o.sizes||[]}));varConvDiscover(d);varConvGuess(d);
  openModal({type:'varConv',d})}
function varConvItem(d){return {attrs:attrsFromDraft(d.attrs),sizes:String(d.sizesText||'').split(',').map(s=>s.trim()).filter(Boolean)}}
// one way of writing a size: "20mm" → "20 mm", 4" / 4'' → "4 inch"
function normSize(z){let t=String(z||'').trim().replace(/\s+/g,' ');if(!t) return '';
  t=t.replace(/(\d)\s*(mm|cm|m|nb|dn)\b/gi,(m,a,u)=>a+' '+u.toLowerCase()).replace(/(\d)\s*(?:"|''|”|inch(?:es)?|in)(?![a-z])/gi,'$1 inch').replace(/(\d)\s*sq\.?\s*mm\b/gi,'$1 sq mm');
  return t.replace(/^(nb|dn)\s*(\d)/i,(m,u,a)=>u.toUpperCase()+' '+a)}
const sizeKey=z=>norm(normSize(z)).replace(/\s+/g,'');
function varConvSizes(d){return String(d.sizesText||'').split(',').map(s=>normSize(s)).filter(Boolean)}
// the sizes of all the items together: one common list for the item
function varConvMergeSizes(d){const seen=new Set(),out=[];const add=z=>{const n=normSize(z),k=sizeKey(n);if(n&&!seen.has(k)){seen.add(k);out.push(n)}};
  varConvSizes(d).forEach(add);d.rows.forEach(r=>{if(r.catOnly){if(r.on) (r.sizes||[]).forEach(add)}else add(r.size)});if(typeof sizeSort==='function') out.sort(sizeSort);d.sizesText=out.join(', ');
  for(const r of d.rows){if(r.size){const k=sizeKey(r.size);r.size=out.find(z=>sizeKey(z)===k)||normSize(r.size)}}}
// words of the item name ("Pipes" / "pipe") and of the variety names ("Class") are not left over as "other spec"
function varConvRest(d,rest){let t=' '+String(rest||'')+' ';const words=new Set();for(const w of norm(d.name).split(' ').filter(x=>x.length>1)){words.add(w);words.add(w.replace(/s$/,''));if(/(ches|shes|xes|sses)$/.test(w)) words.add(w.replace(/es$/,''));words.add(w+'s')}
  for(const a of d.attrs||[]) for(const w of norm(a.name).split(' ').filter(x=>x.length>1)) words.add(w);
  t=t.split(/(\s+|,)/).filter(x=>!words.has(norm(x))).join('');return t.replace(/\s*,\s*(,\s*)*/g,', ').replace(/\s+/g,' ').replace(/^[\s,·\-]+|[\s,·\-]+$/g,'').trim()}
function varConvGuess(d){const it=varConvItem(d);for(const r of d.rows){if(r.touched) continue;const extra=norm(r.desc)===norm(d.name)?'':r.desc.replace(new RegExp(d.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),'');const g=varGuess(it,extra+' , '+r.spec);r.vals=g.vals;r.size=normSize(g.size);r.rest=varConvRest(d,g.rest)}varConvMergeSizes(d)}
A.varConvGuess=()=>{const d=ui.modal.d;for(const r of d.rows) r.touched=false;varConvDiscover(d);varConvGuess(d);render()};
A.varConvRow=d=>{const r=ui.modal.d.rows[+d.i];if(r){r.on=!r.on;render()}};
A.varConvAttr=d=>{const m=ui.modal;const a=m.d.attrs;if(d.do==='add') a.push({name:'',optsText:'',req:false,showName:false});else if(d.do==='del') a.splice(+d.i,1);render()};
CH.varConvTarget=el=>{const d=ui.modal.d;const it=D.itemMap[el.value];if(it){d.name=it.desc;d.category=it.category||d.category;d.unit=it.unit||d.unit;if((it.attrs||[]).length) d.attrs=attrsToDraft(it.attrs);d.sizesText=(it.sizes||[]).join(', ')}varConvGuess(d);render()};

{const prev=v6Modal;v6Modal=(m,busy)=>{if(m.type!=='varConv') return prev(m,busy);const d=m.d;const it=varConvItem(d);const on=d.rows.filter(r=>r.on);
  const cat=D.items.filter(x=>!x.hidden).sort((a,b)=>a.desc.localeCompare(b.desc));
  return wrap('Convert items into varieties',`<p class="small muted" style="margin-top:0">Each ticked item is renamed <b>everywhere</b> (demands, orders, receipts, stock) to <b>one item</b> with its values written in the same order. Check each row's values; the item's quantities and units do not change.</p>
   <div class="fields"><div class="f"><label for="f-varTarget">Make them varieties of</label><select class="inp" id="f-varTarget" data-bind="modal.d.target" data-act-change="varConvTarget"><option value="__new" ${d.target==='__new'?'selected':''}>A new item…</option>${cat.map(x=>`<option value="${esc(x.id)}" ${d.target===x.id?'selected':''}>${esc(x.desc)}${(x.attrs||[]).length?' (has varieties)':''}</option>`).join('')}</select></div>
    ${field('Item name','modal.d.name',d.name,'placeholder="e.g. Pipe" data-rerender="1"')}
    <div class="f"><label for="f-modal-d-category">Category</label><select class="inp" id="f-modal-d-category" data-bind="modal.d.category">${catOpts(d.category)}</select></div>
    <div class="f"><label for="f-modal-d-unit">Unit in the catalogue</label><select class="inp" id="f-modal-d-unit" data-bind="modal.d.unit">${selOpts(UNITS,d.unit)}</select></div></div>
   <div class="f"><label>Varieties and their choices</label><div class="var-rows">${d.attrs.map((x,i)=>`<div class="var-row"><input class="inp" data-bind="modal.d.attrs.${i}.name" value="${esc(x.name)}" placeholder="Name, e.g. Type" data-rerender="1"><input class="inp grow" data-bind="modal.d.attrs.${i}.optsText" value="${esc(x.optsText)}" placeholder="Choices, comma separated" data-rerender="1"><label class="check small"><input type="checkbox" data-bind="modal.d.attrs.${i}.showName" ${x.showName?'checked':''} data-rerender="1"> Name in spec</label><button type="button" class="btn sm ghost" data-act="varConvAttr" data-do="del" data-i="${i}" aria-label="Remove">${icon('trash','xs')}</button></div>`).join('')}</div>
    <div class="row tight" style="margin-top:6px"><button type="button" class="btn sm" data-act="varConvAttr" data-do="add">${icon('plus')} Add variety</button><div class="f grow" style="margin:0"><label class="small muted" for="f-varSizes">Sizes — one common list for the item (all sizes of the items below are included)</label><input class="inp sm" id="f-varSizes" data-bind="modal.d.sizesText" value="${esc(d.sizesText||'')}" placeholder="Sizes, comma separated — e.g. 15 mm, 20 mm, 25 mm" data-act-change="varSizesEdit" aria-label="Sizes"><button type="button" class="linkish small" data-act="varStdSizes">${icon('plus','xs')} Add all standard sizes (15 mm – 1200 mm)</button></div><button type="button" class="btn sm ghost" data-act="varConvGuess">${icon('search','xs')} Read values again</button></div></div>
   <div class="tw"><table class="t var-t"><thead><tr><th></th><th>Now</th>${it.attrs.map(a=>`<th>${esc(a.name)}</th>`).join('')}<th>Size</th><th>Other spec</th><th>Will become</th></tr></thead><tbody>
   ${d.rows.map((r,i)=>{const sp=varSpec(it,r.vals,r.size,r.rest);return `<tr class="${r.on?'':'off'}"><td><input type="checkbox" data-act="varConvRow" data-i="${i}" ${r.on?'checked':''} aria-label="Convert ${esc(r.desc)}"></td><td><b>${esc(r.desc)}</b><small class="muted block">${r.catOnly?'<span class="chip plain xs">catalogue</span> ':''}${esc(r.spec||'—')} · ${esc(r.unit)}</small></td>
     ${it.attrs.map(a=>`<td><input class="inp sm" list="var-o-${esc(slug(a.name))}" data-bind="modal.d.rows.${i}.vals.${esc(a.name)}" value="${esc(r.vals[a.name]||'')}" data-rerender="1" data-act-change="varTouch" data-i="${i}" style="min-width:80px"></td>`).join('')}
     <td>${r.catOnly?`<span class="small muted">${(r.sizes||[]).length?'all its sizes ('+r.sizes.length+') → common list':'—'}</span>`:(()=>{const zs=varConvSizes(d);const cur=r.size||'';const inList=!cur||zs.some(z=>sizeKey(z)===sizeKey(cur));return `<select class="inp sm" data-act-change="varSize" data-i="${i}" aria-label="Size of ${esc(r.desc)}" style="min-width:90px"><option value="">—</option>${zs.map(z=>`<option value="${esc(z)}" ${sizeKey(z)===sizeKey(cur)?'selected':''}>${esc(z)}</option>`).join('')}<option value="__other" ${!inList||r.sizeOther?'selected':''}>Other size…</option></select>${!inList||r.sizeOther?`<input class="inp sm" style="margin-top:4px" data-bind="modal.d.rows.${i}.size" value="${esc(cur)}" placeholder="e.g. 350 mm" data-act-change="varSizeTyped" data-i="${i}">`:''}`})()}</td><td><input class="inp sm" data-bind="modal.d.rows.${i}.rest" value="${esc(r.rest||'')}" data-rerender="1" data-act-change="varTouch" data-i="${i}"></td>
     <td><b>${esc(d.name||'')}</b><small class="block">${r.catOnly?'catalogue entry removed; its sizes join the common list':esc(sp||'—')}</small></td></tr>`}).join('')}</tbody></table></div>
   ${it.attrs.map(a=>`<datalist id="var-o-${esc(slug(a.name))}">${a.opts.map(o=>`<option value="${esc(o)}">`).join('')}</datalist>`).join('')}<datalist id="var-sz">${it.sizes.map(o=>`<option value="${esc(o)}">`).join('')}</datalist>`,
   `<span class="small muted">${on.length} item${on.length===1?'':'s'} to convert</span><span class="spacer"></span><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="varConvSave" ${busy} ${on.length&&String(d.name||'').trim()?'':'disabled'}>${icon('check')} Convert everywhere</button>`,'wide xl')}}
CH.varSize=el=>{const d=ui.modal.d,r=d.rows[+el.dataset.i];if(!r) return;r.touched=true;if(el.value==='__other'){r.sizeOther=true;r.size=''}else{r.sizeOther=false;r.size=el.value}render()};
CH.varSizeTyped=el=>{const d=ui.modal.d,r=d.rows[+el.dataset.i];if(!r) return;r.touched=true;r.size=normSize(r.size);r.sizeOther=false;varConvMergeSizes(d);render()};
CH.varSizesEdit=()=>{varConvMergeSizes(ui.modal.d);render()};
CH.varTouch=el=>{const r=ui.modal.d.rows[+el.dataset.i];if(r) r.touched=true};

A.varConvSave=async()=>{const d=ui.modal.d;const name=String(d.name||'').trim();if(!name) return toast('Enter the item name.','err');
  varConvMergeSizes(d);const attrs=attrsFromDraft(d.attrs);const sizes=varConvSizes(d);
  const rows=d.rows.filter(r=>r.on);
  // values typed in the rows become choices of the item
  for(const r of rows){for(const a of attrs){const v=String(r.vals[a.name]||'').trim();if(v&&!a.opts.some(o=>norm(o)===norm(v))) a.opts.push(v)}const z=String(r.size||'').trim();if(z&&!sizes.some(s=>norm(s)===norm(z))) sizes.push(z)}
  if(typeof sizeSort==='function') sizes.sort(sizeSort);
  const it={attrs,sizes};const id=d.target!=='__new'?d.target:slug(name);
  if(d.target==='__new'&&D.itemMap[id]&&!confirm(`“${D.itemMap[id].desc}” is already in the catalogue. Add the varieties to it?`)) return;
  const plan=rows.filter(r=>!r.catOnly).map(r=>({from:{desc:r.desc,spec:r.spec,unit:r.unit},to:{desc:name,spec:varSpec(it,r.vals,String(r.size||'').trim(),r.rest),unit:r.unit,cat:d.category}})).filter(p=>p.from.desc!==p.to.desc||p.from.spec!==p.to.spec);
  const oldDescs=[...new Set(rows.map(r=>r.desc))].filter(x=>slug(x)!==id);
  const ok=await run(async()=>{const cur=D.itemMap[id];const base=Object.assign({},S.catalog[id]||(cur?{desc:cur.desc,spec:cur.spec||'',unit:cur.unit,category:cur.category,photo:cur.photo||'',gst:cur.gst??'',hsn:cur.hsn||''}:{}),
      {desc:name,unit:d.unit,category:d.category,attrs,sizes,...(d.rel?{rel:d.rel}:{}),spec:(cur&&cur.attrs&&cur.attrs.length)?(cur.spec||''):'',at:Date.now()});delete base.id;delete base.std;
    if(!base.photo){const src=oldDescs.map(x=>D.itemMap[slug(x)]).find(x=>x&&x.photo);if(src) base.photo=src.photo}
    await setDoc('catalog',id,base);let n=0;
    for(const p of plan){const j=await api('/api/items/rename',p);n+=j.docs||0}
    // the old catalogue names go away once all their entries were converted
    const left=new Set(itemIndex().map(o=>norm(o.desc)));
    for(const x of oldDescs){const oid=slug(x);if(!D.itemMap[oid]||left.has(norm(x))&&itemIndex().some(o=>norm(o.desc)===norm(x)&&!rows.some(r=>r.key===o.key))) continue;if(STD[oid]) await setDoc('catalog',oid,{desc:'',replacedBy:id,at:Date.now()});else await delDoc('catalog',oid)}
    return n},'Converted');
  if(ok!==false){closeModal();ui.sel.fi={};toast(`${plan.length} item${plan.length===1?'':'s'} converted into varieties of ${name}${ok?' — '+ok+' records updated':''}.`)}};
Object.assign(ACT_PERM,{varConv:'masters_items',varConvFrom:'masters_items',varConvSave:'masters_items',varConvGuess:'masters_items',varConvRow:'masters_items',varConvAttr:'masters_items'});

const STD_SIZES_MM=[15,20,25,32,40,50,63,65,75,80,90,100,110,125,150,160,180,200,225,250,280,300,315,350,400,450,500,600,700,750,800,900,1000,1100,1200].map(n=>n+' mm');
A.varStdSizes=()=>{const d=ui.modal.d;d.sizesText=[String(d.sizesText||''),STD_SIZES_MM.join(', ')].filter(Boolean).join(', ');varConvMergeSizes(d);render()};
Object.assign(ACT_PERM,{varStdSizes:'masters_items'});

// Item catalogue → a category → Merge into one item: every item of the category
// (catalogue entries and items used in demands/orders/stock) as varieties of one item
A.varConvCat=d=>{const c=d.c;const used=itemIndex().filter(o=>o.cat===c);const usedDesc=new Set(used.map(o=>norm(o.desc)));
  const catRows=D.items.filter(it=>it.category===c&&!it.hidden).map(it=>({key:'cat:'+it.id,desc:it.desc,spec:it.spec||'',unit:it.unit||'Nos',cat:c,catOnly:true,sizes:it.sizes||[]}));
  const rows=[...catRows,...used];if(!rows.length) return toast('No items in this category.','err');
  const lib=typeof libForCat==='function'?libForCat(c)[0]:null;const name=lib?lib.desc:(CAT_MERGE_NAME[c]||catName(c).replace(/\s*&.*$/,'').replace(/s$/,''));const nn=norm(name);
  const target=D.items.find(it=>it.category===c&&[nn,nn+'s',nn+'es'].includes(norm(it.desc))&&(it.attrs||[]).length);
  varConvOpen(target?target.id:'',rows.map(o=>({o,on:!(target&&o.catOnly&&o.key==='cat:'+target.id)})),target?'':name,!target&&lib?lib:null)};
const CAT_MERGE_NAME={pipes:'Pipe',fittings:'Fitting',valves:'Valve',electrical:'Cable',civil:'Civil material',paints:'Paint'};
Object.assign(ACT_PERM,{varConvCat:'masters_items'});

// find choices the items use that are not listed yet: PPR, DWC, RCC… (type),
// K7, NP3, PN10, SN8, PE100, 6 kg/cm² (class), IS 458 (IS code)
const VAR_MATERIALS=['gi','di','ms','ci','ss','ppr','pvc','upvc','cpvc','hdpe','mdpe','ldpe','dwc','rcc','swr','frp','grp','pe','hume','copper','brass','aluminium','steel','stoneware','sw','cast iron','ductile iron'];
function varConvDiscover(d){const find=re=>d.attrs.find(a=>re.test(a.name||''));const tA=find(/type|material/i),cA=find(/class|rating|grade/i)||find(/pressure/i),pA=find(/pressure/i)||cA,iA=find(/\bis\b|code|standard/i);
  const add=(a,v)=>{if(!a||!v) return;const os=String(a.optsText||'').split(',').map(x=>x.trim()).filter(Boolean);if(!os.some(o=>norm(o).replace(/\s/g,'')===norm(v).replace(/\s/g,''))){os.push(v);a.optsText=os.join(', ')}};
  const nameW=new Set(norm(d.name).split(' ').flatMap(w=>[w,w.replace(/s$/,''),w+'s']));
  for(const r of d.rows){const t=r.desc+' '+(r.spec||'');
    if(iA) for(const m of t.matchAll(/\bIS\s*[:\-]?\s*(\d{2,5})(?:\s*\(\s*part\s*(\d+)\s*\))?/gi)) add(iA,'IS '+m[1]+(m[2]?' (Part '+m[2]+')':''));
    if(pA) for(const m of t.matchAll(/(?<![a-z0-9])(PN\s?\d{1,2}|\d+(?:\.\d+)?\s*kg\/cm²?)(?![a-z0-9])/gi)) add(pA,/^pn/i.test(m[1])?'PN '+m[1].replace(/\D/g,''):m[1].replace(/\s*kg\/cm²?$/i,' kg/cm²'));
    if(cA) for(const m of t.matchAll(/(?<![a-z0-9])(K\s?\d{1,2}|NP\s?\d|SN\s?\d{1,2}|PE\s?\d{2,3}|SDR\s?\d{1,2}|sch(?:edule)?\s?\d{2,3}|class\s+[a-c]\b)(?![a-z0-9])/gi)) add(cA,m[1].replace(/\s+/g,'').replace(/^(sch|schedule)/i,'Sch ').replace(/kg\/cm²?$/i,' kg/cm²').replace(/^class/i,'Class ').toUpperCase().replace('KG/CM²','kg/cm²').replace(/^CLASS /,'Class ').replace(/^SCH /,'Sch '));
    if(tA){const ws=r.desc.split(/\s+/);for(const w of ws){const n=norm(w);if(!n||nameW.has(n)) continue;if(VAR_MATERIALS.includes(n)||(/^[A-Z]{2,5}$/.test(w)&&!/^(IS|NP|PN|SN|PE|SDR|ERW|MM)$/.test(w))){add(tA,VAR_MATERIALS.includes(n)&&n.length<=4?w.toUpperCase().replace(/^UPVC$/,'uPVC').replace(/^CPVC$/,'CPVC'):w);break}}}}}
