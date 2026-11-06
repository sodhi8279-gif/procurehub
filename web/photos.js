"use strict";
/* ================= 6.8 PHOTOGRAPHS =================
   Real photographs from Wikimedia Commons, used under their free licences (see PHOTO_META).
   Files live in /img/photo/<file>-800.jpg and -1600.jpg. A slot is used only when its file is
   installed (PHOTOS_READY); otherwise the screen falls back to the existing illustration.
   A project's own photo (Projects → photo) always comes first on that site's banner. */

const PHOTO_META={
  hqHero:{file:'wtp-akra',title:'40 MGD Water Treatment Plant, Akra',author:'Soumava2002',license:'CC0 1.0 (public domain)',licUrl:'https://creativecommons.org/publicdomain/zero/1.0/',src:'https://commons.wikimedia.org/wiki/File:40_MGD_Water_Treatment_Plant,_Akra.jpg'},
  demand:{file:'pipeline-chennai',title:'Pipeline project, Chennai',author:'Adolfhari',license:'CC BY-SA 4.0',licUrl:'https://creativecommons.org/licenses/by-sa/4.0/',src:'https://commons.wikimedia.org/wiki/File:PIPELINE_PROJECT.JPG'},
  receive:{file:'pipes-truck',title:'Water pipes being unloaded from a truck, Ado-Ekiti',author:'Haylad',license:'CC BY-SA 4.0',licUrl:'https://creativecommons.org/licenses/by-sa/4.0/',src:'https://commons.wikimedia.org/wiki/File:WATER_Pipes_being_loaded_out_of_a_truck_in_Ado-Ekiti.jpg'},
  stock:{file:'warehouse-racks',title:'Warehouse with pallet rack storage',author:'Axisadman',license:'CC BY-SA 3.0',licUrl:'https://creativecommons.org/licenses/by-sa/3.0/',src:'https://commons.wikimedia.org/wiki/File:Modern_warehouse_with_pallet_rack_storage_system.jpg'},
  issue:{file:'gate-valve-main',title:'Gate valve on a water main',author:'Rainier5',license:'CC BY-SA 3.0',licUrl:'https://creativecommons.org/licenses/by-sa/3.0/',src:'https://commons.wikimedia.org/wiki/File:MunicipalGateValve.JPG'},
  contractor:{file:'water-line-tap',title:'Tapped 18" water line with gate valve and thrust block',author:'Brandonrush',license:'CC BY-SA 4.0',licUrl:'https://creativecommons.org/licenses/by-sa/4.0/',src:'https://commons.wikimedia.org/wiki/File:Tapping_water_line_in_Bentonville,_AR.jpg'},
};
const PHOTOS_READY=[]; // photograph files shipped in /img/photo (none at present)
// photographs installed by the administrator in Settings → Supporting photographs (config doc "photos")
const slotDoc=()=>{try{return ((store.cols.config||{}).photos||{}).slots||{}}catch(e){return {}}};
const slotFile=s=>{const x=slotDoc()[s]||(s==='hqHero'&&!ui.loaded.data?ui.heroSlot:null);return x&&x.f?x:null};
const hasPhoto=s=>!!slotFile(s)||PHOTOS_READY.includes(s);
function slotImg(slot,cls,alt,sizes){const m=PHOTO_META[slot];const x=slotFile(slot);const a=esc(alt===undefined?m.title:alt);
  if(x) return `<img class="photo ${cls||''}" src="/files/${esc(x.t||x.f)}" srcset="/files/${esc(x.t||x.f)} 640w, /files/${esc(x.f)} 1600w" sizes="${sizes||'(max-width:760px) 50vw, 25vw'}" loading="lazy" decoding="async" alt="${a}">`;
  return `<img class="photo ${cls||''}" src="/img/photo/${m.file}-800.jpg" srcset="/img/photo/${m.file}-800.jpg 800w, /img/photo/${m.file}-1600.jpg 1600w" sizes="${sizes||'(max-width:760px) 50vw, 25vw'}" loading="lazy" decoding="async" alt="${a}">`}
const RENDER_TAG='<span class="render-tag" title="A 3D render made for ProcureHub, not a photograph">3D render</span>';
// a genuine photograph for a slot when one is installed, else the 3D render, marked as such
function PH(slot,art,cls,alt,sizes){const m=PHOTO_META[slot];if(m&&hasPhoto(slot)) return slotImg(slot,cls,alt,sizes);return ART.x(art,'art '+(cls||''))+RENDER_TAG}
function phCredit(slot){const m=PHOTO_META[slot];if(!m||!hasPhoto(slot)) return '';
  return `<a class="ph-credit" href="${esc(m.src)}" target="_blank" rel="noopener" title="${esc(m.title)} — ${esc(m.author)}, ${esc(m.license)}">Photo: ${esc(m.author)} · ${esc(m.license)}</a>`}
// the large picture on the dashboard and sign-in page: a licensed photograph when installed, else the render, marked
{const oh=ART.hero;ART.hero=(cls='')=>hasPhoto('hqHero')?slotImg('hqHero','art '+cls,'','(max-width:760px) 100vw, 50vw')+phCredit('hqHero'):oh(cls)+RENDER_TAG}
// banner of a site: always the project's own uploaded photo (gallery.js), never a stock photograph
function heroPhoto(p){return {html:cover(p),credit:''}}

/* ---------- photo credits (Help) ---------- */
const credSrc=(k,m)=>slotFile(k)?`/files/${slotFile(k).t||slotFile(k).f}`:`/img/photo/${m.file}-800.jpg`;
function photoCredits(){const ready=Object.entries(PHOTO_META).filter(([k])=>hasPhoto(k));
  return `<section class="card" id="photo-credits"><div class="card-h"><h2>Photo credits</h2><span class="sub">${ready.length?'Real photographs from Wikimedia Commons, used under their free licences. They illustrate the kind of work; they do not show RGS Infra sites, equipment or projects.':'No stock photographs are installed yet. Screens use 3D renders, marked “3D render”.'}</span></div>
  ${ready.length?`<div class="credits">${ready.map(([k,m])=>`<figure class="credit" style="margin:0"><img src="${credSrc(k,m)}" alt="" loading="lazy"><div><b>${esc(m.title)}</b><span>${esc(m.author)} · <a href="${esc(m.licUrl)}" target="_blank" rel="noopener">${esc(m.license)}</a></span><a href="${esc(m.src)}" target="_blank" rel="noopener">Source on Wikimedia Commons</a></div></figure>`).join('')}</div>`:''}
  <div class="card-f small muted">Project photos are uploaded by your own team. Item and category pictures, and the pictures on screens without a photograph, are 3D renders made in Blender for ProcureHub — not photographs and not AI-generated. Items you photograph yourself replace their render.</div></section>`}

/* ---------- Settings → Supporting photographs (administrator) ---------- */
Object.assign(ACT_PERM,{slotDel:'settings'});
CH.slotUp=async el=>{const f=el.files&&el.files[0];el.value='';const k=el.dataset.k;if(!f||!PHOTO_META[k]) return;
  if(!/^image\/(jpeg|png|webp)$/.test(f.type)&&!/\.(jpe?g|png|webp)$/i.test(f.name)){toast('Choose the JPG file you downloaded from Wikimedia Commons.','err');return}
  if(f.size>40*1048576){toast('This file is larger than 40 MB.','err');return}
  ui.busyAct='slotUp:'+k;await run(async()=>{const full=await uploadFile(f,{max:1600});const t=await uploadFile(f,{max:640});const sl=Object.assign({},slotDoc());sl[k]={f:full,t,at:Date.now()};await setDoc('config','photos',{slots:sl})},'Photograph installed: '+PHOTO_META[k].title)};
A.slotDel=d=>{const k=d.k;confirmBox({title:'Remove this photograph?',body:'The screen goes back to the 3D render.',yes:'Remove',danger:true,onYes:async()=>{const sl=Object.assign({},slotDoc());delete sl[k];if(await run(()=>setDoc('config','photos',{slots:sl}),'Photograph removed')) closeModal()}})};
const SLOT_USE={hqHero:'HQ dashboard and sign-in page',demand:'Raise demand key (site home)',receive:'Receive material key',stock:'Site stock and Add existing stock keys',issue:'Gate passes, Issue material and Record material used keys',contractor:'Material back key (storekeeper home)'};
function slotPanel(){const n=Object.keys(PHOTO_META).filter(hasPhoto).length;
  return `<section class="card" id="supporting-photos"><div class="card-h"><h2>Supporting photographs</h2><span class="sub">${n} of ${Object.keys(PHOTO_META).length} installed. Genuine, freely licensed photographs for the dashboard and the site action keys. They illustrate the kind of work only — never your projects.</span></div>
   <div class="card-b"><ol class="small slot-how"><li>Open <b>Source</b>, download the original file from Wikimedia Commons.</li><li>Upload that same file here. Use only the photograph listed — the credit shown is for it.</li><li>The author and licence appear in Help → Photo credits automatically.</li></ol></div>
   <div class="slot-list">${Object.entries(PHOTO_META).map(([k,m])=>{const x=slotFile(k);return `<div class="slot-row"><span class="slot-ph">${x?`<img src="/files/${esc(x.t||x.f)}" alt="">`:`<span class="cover-empty">${icon('img')}</span>`}</span>
     <div class="grow"><b>${esc(m.title)}</b><small class="muted block">${esc(m.author)} · <a href="${esc(m.licUrl)}" target="_blank" rel="noopener">${esc(m.license)}</a> · used on: ${esc(SLOT_USE[k]||'—')}</small><a class="small" href="${esc(m.src)}" target="_blank" rel="noopener">${icon('dl','xs')} Source on Wikimedia Commons</a></div>
     <label class="btn sm ${x?'':'primary'}" data-busy="slotUp:${k}">${icon('ul')} ${x?'Replace':'Upload'}<input type="file" accept="image/jpeg,image/png,image/webp" hidden data-act-change="slotUp" data-k="${k}"></label>${x?`<button class="icon-btn sm danger" data-act="slotDel" data-k="${k}" aria-label="Remove ${esc(m.title)}">${icon('trash')}</button>`:''}</div>`}).join('')}</div></section>`}
Object.assign(ACT_PERM,{slotUp:'settings'});
{const prev=view;view=function(){const h=prev();return ui.role==='hq'&&ui.view==='settings'&&can('settings')?h+slotPanel():h}}

/* ---------- loading state on the button that started the work ---------- */
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-act]');ui.busyAct=b?b.dataset.act:''},true);
function markBusy(){document.querySelectorAll('.btn[aria-busy="true"]').forEach(b=>b.removeAttribute('aria-busy'));
  if(ui.busy&&ui.busyAct) document.querySelectorAll(`.btn[data-act="${CSS.escape(ui.busyAct)}"],.btn[data-busy="${CSS.escape(ui.busyAct)}"]`).forEach(b=>b.setAttribute('aria-busy','true'))}
{const prev=render;render=function(){const r=prev.apply(this,arguments);try{markBusy()}catch(e){}return r}}

/* ---------- the site banner follows the pointer slightly (not with reduced motion) ---------- */
{const rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)');let raf=0;
  document.addEventListener('pointermove',e=>{if(rm&&rm.matches||e.pointerType!=='mouse') return;const h=e.target.closest&&e.target.closest('.sh-ph');if(!h) return;
    cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{const r=h.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;h.style.setProperty('--px',(-x*10).toFixed(1)+'px');h.style.setProperty('--py',(-y*8).toFixed(1)+'px')})},{passive:true});
  document.addEventListener('pointerout',e=>{const h=e.target.closest&&e.target.closest('.sh-ph');if(h&&!h.contains(e.relatedTarget)){h.style.setProperty('--px','0px');h.style.setProperty('--py','0px')}},{passive:true})}

/* ================= PHOTOGRAPHS OF YOUR OWN MATERIALS =================
   Item catalogue → Photograph items. Each item has a camera button: on a phone it opens the
   camera, so the storekeeper photographs the real item in the store. Several photos can also be
   chosen at once and are matched to items by file name (e.g. "di-k7-pipe.jpg" or "DI K7 Pipe.jpg").
   A photo replaces the 3D render of that item everywhere: demands, POs, stock, gate passes. */
Object.assign(ACT_PERM,{itemPhotos:'masters_items',itemPhotoMatch:'masters_items',saveMatched:'masters_items',itemPhotoDel:'masters_items'});
const ownPhoto=it=>!!(it&&it.photo);
// save a photo on a catalogue item, keeping everything else about the item
async function saveItemPhoto(it,fileId){const doc={gst:it.gst??'',hsn:it.hsn||'',desc:it.desc,spec:it.spec||'',unit:it.unit||'Nos',category:it.category||classify(it.desc,it.spec).cat,photo:fileId,sizes:it.sizes||[],hidden:!!it.hidden,at:Date.now()};
  for(const k of ['defSpec','tags']) if(it[k]!==undefined) doc[k]=it[k];
  return setDoc('catalog',it.id,doc)}
A.itemPhotos=()=>{ui.f.iphoto=ui.f.iphoto?'':'1';ui.f.iph=ui.f.iph||'missing';render()};
A.itemPhotoDel=d=>{const it=D.itemMap[d.id];if(!it) return;confirmBox({title:'Remove the photo of '+it.desc+'?',body:'The item shows its 3D render again.',yes:'Remove photo',danger:true,onYes:async()=>{if(await run(()=>saveItemPhoto(it,''),'Photo removed')) closeModal()}})};
CH.itemPhotoOne=async el=>{const it=D.itemMap[el.dataset.id];const f=el.files&&el.files[0];el.value='';if(!it||!f) return;
  ui.busyAct='itemPhotoOne:'+it.id;await run(async()=>{const id=await uploadFile(f,{max:1200});await saveItemPhoto(it,id)},'Photo saved for '+it.desc)};
// several photos at once, matched by file name
const fileKey=n=>slug(String(n||'').replace(/\.[a-z0-9]+$/i,'').replace(/[_]+/g,' '));
function matchItem(name){const k=fileKey(name);if(D.itemMap[k]) return D.itemMap[k];const nk=norm(String(name).replace(/\.[a-z0-9]+$/i,'').replace(/[-_]+/g,' '));
  return D.items.find(x=>norm(x.desc)===nk)||D.items.find(x=>norm(x.desc+' '+(x.spec||''))===nk)||null}
CH.itemPhotoMany=el=>{const fs=[...(el.files||[])];el.value='';if(!fs.length) return;
  const rows=fs.map(f=>{const it=matchItem(f.name);return {f,name:f.name,id:it?it.id:'',url:URL.createObjectURL(f)}});
  openModal({type:'photoMatch',d:{rows}})};
function photoMatchModal(m,busy){const rows=m.d.rows;const opts=D.items.slice().sort((a,b)=>a.desc.localeCompare(b.desc)).map(x=>({v:x.id,l:x.desc+(x.spec?' — '+x.spec:'')}));const n=rows.filter(r=>r.id).length;
  return wrap('Match photos to items',`<p class="small muted">${n} of ${rows.length} photo${rows.length===1?'':'s'} matched by file name. Check each one and choose the item where it is missing.</p>
   <div class="pm-list">${rows.map((r,i)=>`<div class="pm-row"><img src="${r.url}" alt=""><div class="grow"><small class="muted">${esc(r.name)}</small><select class="inp" data-bind="modal.d.rows.${i}.id" aria-label="Item for ${esc(r.name)}">${selOpts(opts,r.id,'Skip this photo')}</select></div></div>`).join('')}</div>`,
   `<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="saveMatched" ${busy}>${icon('check')} Save ${n} photo${n===1?'':'s'}</button>`,'wide')}
A.saveMatched=async()=>{const rows=ui.modal.d.rows.filter(r=>r.id&&D.itemMap[r.id]);if(!rows.length){toast('Choose the item for at least one photo.','err');return}
  let done=0;const ok=await run(async()=>{for(const r of rows){const id=await uploadFile(r.f,{max:1200});await saveItemPhoto(D.itemMap[r.id],id);done++}},`${rows.length} item photo${rows.length===1?'':'s'} saved`);
  if(ok){ui.modal.d.rows.forEach(r=>URL.revokeObjectURL(r.url));closeModal()}else if(done) toast(done+' saved before the error. Try the rest again.','err')};
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='photoMatch'?photoMatchModal(m,busy):prev(m,busy)}
// the photographing view of the catalogue
function itemPhotoBoard(){const all=D.items.filter(x=>!x.hidden);const have=all.filter(ownPhoto).length;const f=ui.f.iph||'missing';const q=norm(ui.f.iq);const fc=ui.f.ic||'';
  let list=all.filter(x=>(f==='all'||(f==='missing'?!ownPhoto(x):ownPhoto(x)))&&(!fc||x.category===fc)&&(!q||norm(x.desc+' '+x.spec).includes(q))).sort((a,b)=>a.desc.localeCompare(b.desc));
  const pct=all.length?Math.round(have/all.length*100):0;
  return `<section class="card ph-board"><div class="card-h"><h2>Photograph items</h2><span class="sub">${have} of ${all.length} items have a real photo (${pct}%). Items without one show a 3D render.</span><div class="acts"><button class="btn sm" data-act="itemPhotos">${icon('x')} Done</button></div></div>
   <div class="card-b ph-intro"><div class="ph-meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Items with a real photo"><i style="width:${pct}%"></i></div>
   <p class="small">On a phone, tap <b>Take photo</b> on an item in the store: place it on a plain floor or table, in daylight, and fill the frame. On a computer, choose several photos at once — they are matched to items by file name.</p>
   <div class="row">${seg('iph',[['missing','Without photo'],['have','With photo'],['all','All']],f)}<span class="spacer"></span><label class="btn primary">${icon('ul')} Upload several photos<input type="file" accept="image/*" multiple hidden data-act-change="itemPhotoMany"></label></div></div>
   ${list.length?`<div class="item-grid big ph-grid">${list.slice(0,300).map(it=>`<div class="item-card ph-card ${ownPhoto(it)?'has':''}">${thumb(it,'lg')}${ownPhoto(it)?'':'<span class="render-tag">3D render</span>'}<b>${esc(it.desc)}</b><small>${esc(it.spec||'')}${it.spec?' · ':''}${esc(it.unit||'')}</small>
     <div class="ph-acts"><label class="btn sm ${ownPhoto(it)?'':'orange'}" data-busy="itemPhotoOne:${esc(it.id)}">${icon('camera')} ${ownPhoto(it)?'Retake':'Take photo'}<input type="file" accept="image/*" capture="environment" hidden data-act-change="itemPhotoOne" data-id="${esc(it.id)}"></label>${ownPhoto(it)?`<button class="icon-btn sm" data-act="itemPhotoDel" data-id="${esc(it.id)}" aria-label="Remove photo of ${esc(it.desc)}">${icon('trash')}</button>`:''}</div></div>`).join('')}</div>`
   :emptyBox('',f==='missing'?'Every item has a photo':'No items here','')}</section>`}
{const prev=view;view=function(){if(ui.role==='hq'&&ui.view==='items'&&ui.f.iphoto) return itemPhotoBoard();let h=prev();
  if(ui.role==='hq'&&ui.view==='items'&&can('masters_items')){const all=D.items.filter(x=>!x.hidden);const have=all.filter(ownPhoto).length;
    h=`<div class="notice info ph-cta">${icon('camera')}<span><b>${have} of ${all.length} items have a real photo.</b> The rest show 3D renders. Photograph your own materials so sites recognise them at a glance.</span><button class="btn primary sm" data-act="itemPhotos">${icon('camera')} Photograph items</button></div>`+h}
  return h}}
