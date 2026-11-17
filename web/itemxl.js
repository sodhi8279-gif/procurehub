/* Item catalogue (9.4.0):
   1. Standard drop-downs for my items — items that only have a size list (e.g. Wire)
      get the varieties and sizes of the matching Standard item (India) as drop-downs.
   2. Excel template — download the catalogue as an Excel template (one row per item,
      its sizes and up to 8 choices with their options), fill it outside ProcureHub
      and upload it back. New items are created, existing ones get the choices. */

/* ---------- 1. standard drop-downs ---------- */
const STD_SKIP=/\b(wrench|grinder|pulley|spanner|detector|extinguisher|lubricant|solvent|thinner|tape|binding wire|barbed wire|wire mesh|wire rope|plywood|board|kit|disc|ladder|hammer|crowbar|shovel|pickaxe|cone|signboard|first aid)\b/;
const STD_MATCH=[['safety-ppe',/\b(helmet|gloves?|gumboots?|safety shoes?|reflective jacket|goggles?|harness|ear plugs?|dust mask)\b/],['valve',/\bvalves?\b/],['pump',/\bpumps?\b/],['water-meter',/\b(water meter|flow meter)\b/],
  ['manhole-cover',/\bmanhole/],['rubber-gasket',/\b(gaskets?|rubber rings?|o rings?)\b/],['welding-electrode',/\b(electrodes?|welding rods?)\b/],['paint',/\b(paint|primer|enamel|emulsion)\b/],
  ['pipe-fitting',/\b(elbows?|bends?|tees?|reducers?|couplers?|couplings?|sockets?|unions?|nipples?|flange adaptors?|collars?|end caps?|stub ends?|fittings?)\b/],['pipe',/\b(pipes?|tubes?)\b/],
  ['cement',/\bcement\b/],['tmt-bar',/\b(tmt|rebar|reinforcement bar|sariya|saria)\b/],['structural-steel',/\b(ms angle|ms channel|joist|beam|ms plate|chequered plate|flat bar|ismb|ismc|isa)\b/],
  ['aggregate-sand',/\b(sand|aggregate|grit|stone dust|gsb|wmm)\b/],['brick-block',/\b(bricks?|blocks?|pavers?)\b/],['ready-mix-concrete',/\b(rmc|ready mix|concrete)\b/],
  ['cable',/\b(cables?|wires?|wiring)\b/],['mcb-switchgear',/\b(mcb|mccb|rccb|elcb|rcbo|isolator|switchgear|distribution board)\b/],['light-fitting',/\b(light|lamp|led|luminaire|flood light|street light)\b/],
  ['bolt-nut',/\b(bolts?|nuts?|screws?|washers?|anchor fasteners?|studs?)\b/]];
function stdGuess(it){const t=norm(it.desc);if(STD_SKIP.test(t)) return null;
  for(const [id,re] of STD_MATCH) if(re.test(t)){const g=STD_LIB.find(x=>x.id===id);if(g) return g}return null}
// sizes: keep the item's own sizes that the standard list does not already have (same number = same size)
function stdSizesMerge(own,std){const nk=z=>{const m=String(z).match(/[\d.]+/);return m?String(parseFloat(m[0])):norm(z)};const out=[...std];
  for(const raw of own||[]) for(const z of String(raw).split(/\.\s+|[,;]/).map(x=>x.trim()).filter(Boolean)){if(!out.some(s=>nk(s)===nk(z)||sizeKey(s)===sizeKey(z))) out.push(z)}return out}
async function stdMergeInto(id,g){const it=libItem(g);const have=D.itemMap[id];if(!have) return;const cur=S.catalog[id]||{};
  const attrs=(have.attrs||[]).map(a=>Object.assign({},a,{opts:[...a.opts]}));
  for(const a of it.attrs){const x=attrs.find(y=>norm(y.name)===norm(a.name));if(x){for(const o of a.opts) if(!x.opts.some(p=>norm(p)===norm(o))) x.opts.push(o)}else attrs.push(a)}
  const doc=Object.assign({desc:have.desc,spec:have.spec||'',unit:have.unit,category:have.category,photo:have.photo||'',gst:have.gst??'',hsn:have.hsn||''},cur,
    {attrs,sizes:stdSizesMerge(have.sizes,it.sizes),rel:it.rel||have.rel||null,stdFrom:g.id,hidden:!!have.hidden,at:Date.now()});delete doc.id;delete doc.std;
  if(!doc.rel) delete doc.rel;await setDoc('catalog',id,doc)}
A.stdApply=()=>{const items=D.items.filter(x=>!(x.attrs||[]).length&&!x.hidden);if(!items.length) return toast('Every item already has drop-down choices.');
  const pick={},on={};for(const x of items){const g=stdGuess(x);pick[x.id]=g?g.id:'';on[x.id]=!!g}openModal({type:'stdApply',d:{pick,on,q:'',only:'match'}})};
A.stdApplyTick=d=>{const o=ui.modal.d.on;o[d.id]=!o[d.id];render()};
CH.stdApplyPick=el=>{const d=ui.modal.d;d.pick[el.dataset.id]=el.value;d.on[el.dataset.id]=!!el.value;render()};
A.stdApplyAll=()=>{const d=ui.modal.d;const rs=stdApplyRows(d).filter(x=>d.pick[x.id]);const all=rs.every(x=>d.on[x.id]);for(const x of rs) d.on[x.id]=!all;render()};
function stdApplyRows(d){const q=norm(d.q||'');return D.items.filter(x=>!(x.attrs||[]).length&&!x.hidden&&(!q||norm(x.desc+' '+catName(x.category)).includes(q))&&(d.only!=='match'||d.pick[x.id])).sort((a,b)=>String(a.desc).localeCompare(b.desc))}
{const prev=v6Modal;v6Modal=(m,busy)=>{if(m.type!=='stdApply') return prev(m,busy);const d=m.d;const rs=stdApplyRows(d);const n=Object.keys(d.on).filter(k=>d.on[k]&&d.pick[k]).length;
  return wrap('Standard drop-downs for my items',`<p class="small muted" style="margin-top:0">These items only have a size list. Give each the varieties and sizes of a <b>Standard item (India)</b>, so that in a demand they are chosen from drop-downs (for example Wire → Type, Conductor, Cores, Insulation, Voltage, IS and size in sq mm). The item keeps its name, category and photo; its own sizes are kept as well.</p>
    <div class="toolbar">${seg('stdonly',[['match','Suggested'],['all','All items without choices']],d.only,'stdApplyOnly')}<div class="search-inp">${icon('search')}<input class="inp sm" id="f-stdq" placeholder="Find item" data-bind="modal.d.q" data-rerender="1" value="${esc(d.q||'')}"></div><button class="btn sm ghost" data-act="stdApplyAll">Tick / untick all</button></div>
    ${rs.length?`<div class="tw" style="max-height:52vh"><table class="t"><thead><tr><th></th><th>Your item</th><th>Its sizes now</th><th>Use the standard item</th><th>What it gets</th></tr></thead><tbody>${rs.map(x=>{const g=STD_LIB.find(y=>y.id===d.pick[x.id]);const li=g&&libItem(g);
      return `<tr><td>${g?`<input type="checkbox" data-act="stdApplyTick" data-id="${esc(x.id)}" ${d.on[x.id]?'checked':''} aria-label="Use for ${esc(x.desc)}">`:''}</td><td><b>${esc(x.desc)}</b><small class="muted block">${esc(catName(x.category))}</small></td><td class="small muted">${(x.sizes||[]).length?esc((x.sizes||[]).slice(0,6).join(', '))+((x.sizes||[]).length>6?'…':''):'—'}</td>
      <td><select class="inp sm" data-act-change="stdApplyPick" data-id="${esc(x.id)}" aria-label="Standard item for ${esc(x.desc)}"><option value="">— none —</option>${STD_LIB.map(y=>`<option value="${y.id}" ${y.id===d.pick[x.id]?'selected':''}>${esc(y.desc)}</option>`).join('')}</select></td>
      <td class="small">${li?li.attrs.map(a=>`<b>${esc(a.name)}</b> ${a.opts.length}`).join(' · ')+(li.sizes.length?` · <b>Sizes</b> ${li.sizes.length}`:''):'<span class="muted">—</span>'}</td></tr>`}).join('')}</tbody></table></div>`:'<p class="muted">No items here.</p>'}`,
    `<span class="small muted">${n} item${n===1?'':'s'} ticked</span><span class="spacer"></span><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="stdApplySave" ${busy} ${n?'':'disabled'}>${icon('check')} Give them drop-downs</button>`,'wide')}}
A.stdApplyOnly=d=>{ui.modal.d.only=d.val;render()};
A.stdApplySave=async()=>{const d=ui.modal.d;const ids=Object.keys(d.on).filter(k=>d.on[k]&&d.pick[k]&&D.itemMap[k]);if(!ids.length) return;
  const ok=await run(async()=>{for(const id of ids) await stdMergeInto(id,STD_LIB.find(g=>g.id===d.pick[id]))},`${ids.length} item${ids.length===1?'':'s'} now have drop-down choices`);if(ok!==false) closeModal()};

/* ---------- 2. Excel template ---------- */
const IXL_N=8;
const IXL_HEAD=['Item name','Category','Unit','GST %','HSN code','Sizes (comma separated)','Note / specification'].concat(...Array.from({length:IXL_N},(_,i)=>[`Choice ${i+1} name`,`Choice ${i+1} options (comma separated)`,`Choice ${i+1} required (Y/N)`]));
A.itemXlDown=d=>{const blank=d&&d.blank;const rows=[IXL_HEAD];
  if(blank){rows.push(['Cable','Electrical','Mtr','18','8544','1.5 sq mm, 2.5 sq mm, 4 sq mm','ISI marked','Type','House wire, Multicore flexible, LT power (armoured)','Y','Conductor','Copper, Aluminium','N','Cores','1 core, 2 core, 3 core, 4 core','N','IS','IS 694, IS 1554 (Part 1)','N']);
    rows.push(['Pipe','Pipes','Mtr','18','7306','25 mm, 32 mm, 40 mm, 50 mm','','Material','GI, DI, CI, Others','Y','Class','Light, Medium, Heavy','N','IS','IS 1239, IS 8329','N'])}
  else for(const x of D.items.slice().sort((a,b)=>(catName(a.category)+a.desc).localeCompare(catName(b.category)+b.desc))){const r=[x.desc,catName(x.category),x.unit||'',x.gst??'',x.hsn||'',(x.sizes||[]).join(', '),x.spec||''];
    (x.attrs||[]).slice(0,IXL_N).forEach(a=>r.push(a.name,(a.opts||[]).join(', '),a.req?'Y':'N'));rows.push(r)}
  const how=[['How to fill the item template'],[''],['1. One row per item. "Item name" and "Unit" are needed; everything else is optional.'],
    ['2. Category: write the category name as in the Categories sheet. If left blank, ProcureHub guesses it from the name.'],
    ['3. Sizes: all sizes in one cell, separated by commas, e.g. 15 mm, 20 mm, 25 mm. They are shown as a drop-down in the demand.'],
    ['4. Choices: up to '+IXL_N+' drop-downs per item. Give each a name (e.g. Material, Class, IS) and its options separated by commas (e.g. GI, DI, CI). Y in "required" means the site must choose it.'],
    ['5. Upload: Item catalogue → Excel template → Upload filled template. You see a preview first: new items are created; for items already in the catalogue you choose whether the choices are added to the old ones or replace them.'],
    ['6. Do not change the heading row. Rows can be in any order; empty rows are skipped.'],
    [''],['Units in use: '+UNITS.join(', ')]];
  const cats=[['Category','Code']].concat(CATS.map(c=>[c.name,c.id]));
  saveXlsx(blank?'procurehub-item-template.xlsx':'procurehub-items-'+today()+'.xlsx',[{name:'Items',rows},{name:'How to fill',rows:how},{name:'Categories',rows:cats}])};
A.itemXlMenu=()=>openModal({type:'itemXlMenu'});
{const prev=v6Modal;v6Modal=(m,busy)=>{if(m.type==='itemXlMenu') return wrap(`${icon('dl')} Item Excel template`,`<p class="small">Fill items with their <b>sizes</b> and <b>drop-down choices</b> in Excel outside ProcureHub, then upload the file here.</p>
  <div class="crt-enter">
   <div class="crt-en"><b>${icon('dl')} Catalogue as template</b><small class="muted">All your ${D.items.length} items with their sizes and choices. Change or add rows and upload it back.</small><button class="btn sm primary" data-act="itemXlDown">Download</button></div>
   <div class="crt-en"><b>${icon('doc')} Blank template</b><small class="muted">Only the headings and two filled examples (Cable, Pipe).</small><button class="btn sm" data-act="itemXlDown" data-blank="1">Download</button></div>
   <div class="crt-en"><b>${icon('ul')} Upload filled template</b><small class="muted">Shows a preview before anything is saved.</small><label class="btn sm primary" for="f-itemxl">Choose Excel file…</label><input type="file" id="f-itemxl" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden data-act-change="itemXlFile"></div></div>`,
  `<button class="btn" data-act="closeModal">Close</button>`);
  if(m.type==='itemXl') return itemXlModal(m,busy);return prev(m,busy)}}
const ixlYes=v=>/^(y|yes|1|true|required|req)$/i.test(String(v||'').trim());
const ixlList=v=>String(v||'').split(/[,\n;]/).map(s=>s.trim()).filter(Boolean).filter((s,i,a)=>a.findIndex(t=>norm(t)===norm(s))===i);
function ixlCat(v,desc){const t=norm(v);if(t){const c=CATS.find(c=>norm(c.name)===t||norm(c.id)===t);if(c) return c.id}return classify(desc,'').cat||'others'}
function ixlParse(rows){const hi=rows.findIndex(r=>(r||[]).some(c=>norm(c)==='item name'));if(hi<0) throw {message:'This is not the ProcureHub item template: the heading "Item name" was not found in the first sheet.'};
  const H=rows[hi].map(c=>norm(c));const col=re=>H.findIndex(h=>re.test(h));
  const ci={name:col(/^item name/),cat:col(/^category/),unit:col(/^unit/),gst:col(/gst/),hsn:col(/hsn/),sizes:col(/^sizes?/),note:col(/note|specification/)};
  const ch=[];H.forEach((h,i)=>{const m=h.match(/^choice (\d+) (name|options|required)/);if(m){const k=+m[1];ch[k]=ch[k]||{};ch[k][m[2]]=i}});
  const out=[];const seen={};
  for(let r=hi+1;r<rows.length;r++){const row=rows[r]||[];const g=i=>i>=0&&row[i]!=null?String(row[i]).trim():'';const desc=g(ci.name).replace(/\s+/g,' ');if(!desc) continue;
    const it={row:r+1,desc,cat:g(ci.cat),unit:g(ci.unit),gst:g(ci.gst),hsn:g(ci.hsn),sizes:ixlList(g(ci.sizes)),note:g(ci.note),attrs:[],err:''};
    for(const c of ch.filter(Boolean)){const nm=g(c.name??-1),op=ixlList(g(c.options??-1));if(!nm&&!op.length) continue;if(!nm){it.err='A choice has options but no name';continue}if(!op.length){it.err=`Choice "${nm}" has no options`;continue}
      if(it.attrs.some(a=>norm(a.name)===norm(nm))){it.err=`Choice "${nm}" is twice`;continue}it.attrs.push({name:nm.slice(0,40),opts:op.map(o=>o.slice(0,80)),req:ixlYes(g(c.required??-1)),showName:false})}
    if(it.gst!==''&&!(num(it.gst)>=0&&num(it.gst)<=100)) it.err='GST % must be 0 to 100';
    const ex=D.items.find(x=>norm(x.desc)===norm(desc));it.id=ex?ex.id:slug(desc);it.exists=!!ex;
    if(!ex&&!it.unit) it.unit='Nos';if(it.unit&&!UNITS.includes(it.unit)){const u=UNITS.find(u=>norm(u)===norm(it.unit));if(u) it.unit=u}
    if(seen[norm(desc)]) it.err='The same item is on row '+seen[norm(desc)];seen[norm(desc)]=it.row;out.push(it)}
  if(!out.length) throw {message:'No items found under the heading row.'};return out}
CH.itemXlFile=async el=>{const f=el.files&&el.files[0];el.value='';if(!f) return;toast('Reading '+f.name+'…');
  try{const r=await fetch('/api/xlsx/read',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream'},body:f});const j=await r.json().catch(()=>null);if(!r.ok||!j) throw {message:(j&&j.error)||'The file could not be read.'};
    const items=ixlParse((j.sheets||[])[0]||[]);openModal({type:'itemXl',d:{items,mode:'add',name:f.name}})}
  catch(e){toast(e.message||'The file could not be read.','err')}};
function itemXlModal(m,busy){const d=m.d;const ok=d.items.filter(x=>!x.err);const nNew=ok.filter(x=>!x.exists).length,nUp=ok.length-nNew,nErr=d.items.length-ok.length;
  return wrap(`${icon('ul')} Upload items · ${esc(d.name)}`,`<div class="chips"><span class="chip green">${nNew} new</span><span class="chip blue">${nUp} already in the catalogue</span>${nErr?`<span class="chip red">${nErr} with a problem — skipped</span>`:''}</div>
    ${nUp?`<div class="f full" style="margin-top:8px"><label>For items already in the catalogue</label>${seg('ixlmode',[['add','Add the sizes and choices to what is there'],['replace','Replace sizes and choices with the sheet']],d.mode,'itemXlMode')}</div>`:''}
    <div class="tw" style="max-height:50vh"><table class="t"><thead><tr><th>Row</th><th>Item</th><th>Category · unit</th><th>Choices</th><th class="num">Sizes</th><th></th></tr></thead><tbody>${d.items.map(x=>`<tr><td class="mono small">${x.row}</td><td><b>${esc(x.desc)}</b>${x.note?`<small class="muted block">${esc(x.note)}</small>`:''}</td><td class="small">${esc(catName(ixlCat(x.cat,x.desc)))}${x.unit?' · '+esc(x.unit):''}</td>
      <td class="small">${x.attrs.map(a=>`<b>${esc(a.name)}</b>${a.req?'*':''} ${a.opts.length}`).join(' · ')||'<span class="muted">—</span>'}</td><td class="num mono">${x.sizes.length||'—'}</td><td>${x.err?`<span class="chip red">${esc(x.err)}</span>`:x.exists?'<span class="chip blue">Update</span>':'<span class="chip green">New</span>'}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">* the site must choose it. Photos, rates and history of existing items are kept.</p>`,
    `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="itemXlSave" ${busy} ${ok.length?'':'disabled'}>${icon('check')} Save ${ok.length} item${ok.length===1?'':'s'}</button>`,'wide')}
A.itemXlMode=d=>{ui.modal.d.mode=d.val;render()};
A.itemXlSave=async()=>{const d=ui.modal.d;const ok=d.items.filter(x=>!x.err);const rep=d.mode==='replace';
  const r=await run(async()=>{for(const x of ok){const have=D.itemMap[x.id];const cur=S.catalog[x.id]||{};
      const base=Object.assign(have?{desc:have.desc,spec:have.spec||'',unit:have.unit,category:have.category,photo:have.photo||'',gst:have.gst??'',hsn:have.hsn||'',sizes:have.sizes||[],attrs:have.attrs||[],...(have.rel?{rel:have.rel}:{})}:{desc:x.desc,photo:''},cur);delete base.id;delete base.std;
      if(x.cat||!have) base.category=ixlCat(x.cat,x.desc);if(x.unit) base.unit=x.unit;if(x.gst!=='') base.gst=num(x.gst);if(x.hsn) base.hsn=x.hsn;if(x.note) base.spec=x.note;
      if(have&&!rep){const attrs=(base.attrs||[]).map(a=>Object.assign({},a,{opts:[...(a.opts||[])]}));
        for(const a of x.attrs){const y=attrs.find(b=>norm(b.name)===norm(a.name));if(y){for(const o of a.opts) if(!y.opts.some(p=>norm(p)===norm(o))) y.opts.push(o);if(a.req) y.req=true}else attrs.push(a)}
        const sizes=[...(base.sizes||[])];for(const z of x.sizes) if(!sizes.some(s=>sizeKey(s)===sizeKey(z))) sizes.push(z);base.attrs=attrs;base.sizes=sizes}
      else{base.attrs=x.attrs;base.sizes=x.sizes}
      if(base.rel&&!(base.attrs||[]).some(a=>a.name===base.rel.by)) delete base.rel;
      base.hidden=false;base.at=Date.now();await setDoc('catalog',x.id,base)}},`${ok.length} item${ok.length===1?'':'s'} saved from Excel`);
  if(r!==false) closeModal()};

Object.assign(ACT_PERM,{stdApply:'masters_items',stdApplyTick:'masters_items',stdApplyPick:'masters_items',stdApplyAll:'masters_items',stdApplyOnly:'masters_items',stdApplySave:'masters_items',
  itemXlMenu:'masters_items',itemXlDown:'masters_items',itemXlFile:'masters_items',itemXlMode:'masters_items',itemXlSave:'masters_items'});
