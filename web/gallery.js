"use strict";
/* ================= 6.8 PROJECT PHOTOGRAPHS =================
   Photos of a project come only from people uploading them. There is no stock or rendered
   picture for a project: until someone uploads, the project shows an empty state with
   "Upload Project Photos" for those allowed to add them.
   Project doc: photos:[{f,t,o,cap,alt,at,by,byName}], photo = cover (one of photos[].f).
     f = photo shown, t = small copy for cards, o = original kept when the photo was cropped.
   Who may manage photos: HQ with Projects rights, the HQ site manager of the site, and the
   project manager and site engineers of that site (not the storekeeper). The server checks it. */

Object.assign(IC,{
  crop:'<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  left:'<path d="m15 18-6-6 6-6"/>',right:'<path d="m9 18 6-6-6-6"/>',
  expand:'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  undo:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>'});
HQ_VIEWS.push('projphotos');SITE_VIEWS.push('s_photos');
TITLES.projphotos=['Project photos','Projects'];TITLES.s_photos=['Project photos','My site'];

const GAL_MAX_MB=25;      // a photo straight from a phone camera; it is reduced before upload
const GAL_FULL=2000, GAL_THUMB=640;
const GAL_TYPES=/^image\/(jpeg|png|webp)$/;

function projPhotos(p){if(!p) return [];if(Array.isArray(p.photos)&&p.photos.length) return p.photos;return p.photo?[{f:p.photo,legacy:true}]:[]}
function coverOf(p){const l=projPhotos(p);return l.find(x=>x.f===p.photo)||l[0]||null}
function canProjPhotos(p){if(!p||!ui.me) return false;
  if(ui.role==='site') return !ui.preview&&ui.me.projectId===p.id&&myRole()!=='store';
  return can('masters_projects')||(can('site_approve')&&canApproveSite(p.id))}
const galPid=()=>ui.role==='site'?siteProject():(ui.param||'');
const galView=()=>ui.role==='site'?'s_photos':'projphotos';
const photoAlt=(p,x)=>x&&x.alt?x.alt:(x&&x.cap?x.cap:'Photo of '+(p&&p.name||'the project'));

// cover of a project wherever it appears: the uploaded cover, else an empty state (never a stock picture)
cover=function(p,cls=''){const c=coverOf(p);
  if(c) return `<img class="cover-img ${cls}" src="/files/${esc(c.t||c.f)}" alt="${esc(photoAlt(p,c))}" loading="lazy" decoding="async">`;
  return `<span class="cover-empty ${cls}" role="img" aria-label="No project photo yet">${icon('camera')}</span>`};

// banner of a site: its own cover photo, or an empty state asking for photos
heroPhoto=function(p){const c=coverOf(p);const n=projPhotos(p).length;const may=canProjPhotos(p);const v=galView();
  if(c) return {html:`<img class="cover-img" src="/files/${esc(c.f)}" alt="${esc(photoAlt(p,c))}" decoding="async"><button class="btn glass sm sh-photos" data-act="go" data-v="${v}" ${ui.role==='hq'?`data-p="${esc(p.id)}"`:''}>${icon('img')} ${n} photo${n===1?'':'s'}</button>`,credit:''};
  return {html:`<div class="sh-empty" aria-hidden="true"></div><div class="sh-up">${may?`<button class="btn orange" data-act="go" data-v="${v}" ${ui.role==='hq'?`data-p="${esc(p.id)}"`:''}>${icon('camera')} Upload Project Photos</button>`:`<span class="sh-none">${icon('camera')} No project photos yet</span>`}</div>`,credit:''}};

/* ---------- uploading with progress ---------- */
function xhrUpload(blob,onp){return new Promise((res,rej)=>{const x=new XMLHttpRequest();x.open('POST','/api/upload');x.withCredentials=true;x.setRequestHeader('Content-Type',blob.type||'image/jpeg');
  x.upload.onprogress=e=>{if(e.lengthComputable&&onp) onp(e.loaded/e.total)};
  x.onload=()=>{let j=null;try{j=JSON.parse(x.responseText)}catch(e){}if(x.status>=200&&x.status<300&&j&&j.id) res(j.id);else rej({message:(j&&j.error)||'The upload failed ('+x.status+'). Try again.'})};
  x.onerror=()=>rej({message:'The connection to the server was lost. Check the network and try again.'});x.send(blob)})}
function galCheckFile(f){
  if(!GAL_TYPES.test(f.type||'')&&!/\.(jpe?g|png|webp)$/i.test(f.name||'')) return /\.(heic|heif)$/i.test(f.name||'')?'HEIC photos cannot be read here. On the iPhone choose Settings → Camera → Formats → Most Compatible, or share the photo as JPG.':'This is not a JPG, PNG or WebP photo.';
  if(f.size>GAL_MAX_MB*1048576) return `This photo is ${(f.size/1048576).toFixed(1)} MB. The limit is ${GAL_MAX_MB} MB.`;
  if(!f.size) return 'This file is empty.';
  return ''}
const G=ui.gal||(ui.gal={q:[],running:false});
function galSetBar(k,frac,text){const it=G.q.find(x=>x.k===k);if(it){it.prog=frac;if(text) it.msg=text}
  const b=document.getElementById('gq-bar-'+k);if(b){b.style.width=Math.round(frac*100)+'%';b.parentElement.setAttribute('aria-valuenow',Math.round(frac*100))}
  const t=document.getElementById('gq-msg-'+k);if(t&&text) t.textContent=text}
// make the two copies (full and small) of a photo and upload them
async function galSend(blobSrc,k){
  galSetBar(k,.03,'Preparing…');
  const full=await compressImage(blobSrc,GAL_FULL),small=await compressImage(blobSrc,GAL_THUMB);
  galSetBar(k,.06,'Uploading…');
  const f=await xhrUpload(full,p=>galSetBar(k,.06+p*.84,'Uploading… '+Math.round(p*100)+'%'));
  const t=await xhrUpload(small,p=>galSetBar(k,.9+p*.08));
  return {f,t}}
async function galSaveList(pid,list,cover){const patch={photos:list.map(x=>{const o={f:x.f,cap:x.cap||'',alt:x.alt||''};if(x.t) o.t=x.t;if(x.o) o.o=x.o;return o})};if(cover!==undefined) patch.photo=cover;return updDoc('projects',pid,patch)}
function galAdd(files){const pid=galPid();const p=proj(pid);if(!p||!canProjPhotos(p)) return;
  const room=60-projPhotos(p).length-G.q.filter(x=>x.st==='wait'||x.st==='up').length;
  files.forEach((f,i)=>{const k=Date.now().toString(36)+i+Math.random().toString(36).slice(2,6);const err=galCheckFile(f)||(i>=room?'A project can keep up to 60 photos.':'');
    G.q.push({k,pid,f,name:f.name||'Photo',url:err?'':URL.createObjectURL(f),st:err?'err':'wait',msg:err||'Waiting…',prog:0})});
  render();galRun()}
async function galRun(){if(G.running) return;G.running=true;
  try{for(;;){const it=G.q.find(x=>x.st==='wait');if(!it) break;it.st='up';render();
      try{const ids=await galSend(it.f,it.k);const p=proj(it.pid);const list=projPhotos(p).slice();
        const base=(p.name||'Project')+(p.city?', '+p.city:'');list.push({f:ids.f,t:ids.t,cap:'',alt:'Photo of '+base});
        await galSaveList(it.pid,list,p.photo&&list.some(x=>x.f===p.photo)?p.photo:list[0].f);
        it.st='done';it.prog=1;it.msg='Uploaded';}
      catch(e){it.st='err';it.msg=errMsg(e)}
      render()}}
  finally{G.running=false}
  const ok=G.q.filter(x=>x.st==='done').length,bad=G.q.filter(x=>x.st==='err').length;
  if(ok) toast(`${ok} photo${ok===1?'':'s'} uploaded${bad?` · ${bad} could not be uploaded`:''}`,bad?'err':'');
  setTimeout(()=>{G.q.filter(x=>x.st==='done').forEach(x=>x.url&&URL.revokeObjectURL(x.url));G.q=G.q.filter(x=>x.st!=='done');render()},2500)}
CH.galPick=el=>{const fs=[...(el.files||[])];el.value='';if(fs.length) galAdd(fs)};
A.galRetry=d=>{const it=G.q.find(x=>x.k===d.k);if(!it||!it.url) return;it.st='wait';it.msg='Waiting…';it.prog=0;render();galRun()};
A.galDismiss=d=>{const it=G.q.find(x=>x.k===d.k);if(it&&it.url) URL.revokeObjectURL(it.url);G.q=G.q.filter(x=>x.k!==d.k);render()};
// drag and drop onto the drop zone (and drag to reorder photos)
document.addEventListener('dragover',e=>{const z=e.target.closest&&e.target.closest('[data-gdrop]');if(z&&e.dataTransfer&&[...e.dataTransfer.types].includes('Files')){e.preventDefault();z.classList.add('over')}});
document.addEventListener('dragleave',e=>{const z=e.target.closest&&e.target.closest('[data-gdrop]');if(z&&!z.contains(e.relatedTarget)) z.classList.remove('over')});
document.addEventListener('drop',e=>{const z=e.target.closest&&e.target.closest('[data-gdrop]');if(!z) return;e.preventDefault();z.classList.remove('over');const fs=[...(e.dataTransfer&&e.dataTransfer.files||[])];if(fs.length) galAdd(fs)});
document.addEventListener('dragstart',e=>{const c=e.target.closest&&e.target.closest('[data-gi]');if(!c||!c.draggable) return;G.drag=+c.dataset.gi;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain','photo')}catch(x){}});
document.addEventListener('dragover',e=>{if(G.drag==null) return;const c=e.target.closest&&e.target.closest('[data-gi]');if(c){e.preventDefault();document.querySelectorAll('.gcard.drop-on').forEach(x=>x!==c&&x.classList.remove('drop-on'));c.classList.add('drop-on')}});
document.addEventListener('drop',e=>{if(G.drag==null) return;const c=e.target.closest&&e.target.closest('[data-gi]');const from=G.drag;G.drag=null;if(!c) return;e.preventDefault();galMove(from,+c.dataset.gi)});
document.addEventListener('dragend',()=>{G.drag=null;document.querySelectorAll('.gcard.drop-on').forEach(x=>x.classList.remove('drop-on'))});

/* ---------- managing the photos ---------- */
async function galMove(from,to){const pid=galPid();const p=proj(pid);const l=projPhotos(p).slice();if(from===to||from<0||to<0||from>=l.length||to>=l.length) return;
  const [x]=l.splice(from,1);l.splice(to,0,x);await run(()=>galSaveList(pid,l),'Order saved');
  const b=document.getElementById('g-mv-'+to);b&&b.focus()}
A.galUp=d=>galMove(+d.i,+d.i-1);A.galDown=d=>galMove(+d.i,+d.i+1);
A.galCover=async d=>{const pid=galPid();const l=projPhotos(proj(pid));const x=l[+d.i];if(!x) return;await run(()=>galSaveList(pid,l,x.f),'Cover photo set')};
A.galDel=d=>{const pid=galPid();const p=proj(pid);const l=projPhotos(p);const x=l[+d.i];if(!x) return;
  confirmBox({title:'Delete this photo?',body:`It is removed from ${esc(p.name)} for everyone.${x.f===p.photo&&l.length>1?' The next photo becomes the cover.':''}`,yes:'Delete photo',danger:true,
    onYes:async()=>{const rest=l.filter((_,i)=>i!==+d.i);if(await run(()=>galSaveList(pid,rest,x.f===p.photo?(rest[0]?rest[0].f:''):p.photo),'Photo deleted')) closeModal()}})};
CH.galReplace=async el=>{const f=el.files&&el.files[0];el.value='';const i=+el.dataset.i;const pid=galPid();const p=proj(pid);const l=projPhotos(p).slice();if(!f||!l[i]) return;
  const err=galCheckFile(f);if(err){toast(err,'err');return}
  const k='rep'+i;G.q.push({k,pid,f,name:'Replacing photo '+(i+1),url:URL.createObjectURL(f),st:'up',msg:'Preparing…',prog:0});render();
  const it=G.q.find(x=>x.k===k);
  try{const ids=await galSend(f,k);const old=l[i];l[i]={f:ids.f,t:ids.t,cap:old.cap||'',alt:old.alt||''};await galSaveList(pid,l,old.f===p.photo?ids.f:p.photo);it.st='done';it.msg='Replaced';toast('Photo replaced')}
  catch(e){it.st='err';it.msg=errMsg(e);it.url='';toast(errMsg(e),'err')}
  render();setTimeout(()=>{G.q=G.q.filter(x=>x.k!==k||x.st==='err');render()},2000)};
// captions and descriptions are saved when the field is left
CH.galText=async el=>{const pid=galPid();const l=projPhotos(proj(pid)).map(x=>Object.assign({},x));const i=+el.dataset.i;if(!l[i]) return;const k=el.dataset.k;const v=el.value.trim().slice(0,200);if((l[i][k]||'')===v) return;
  l[i][k]=v;await run(()=>galSaveList(pid,l),k==='cap'?'Caption saved':'Description saved')};

/* ---------- full-size viewer ---------- */
A.galView=d=>{G.back=document.activeElement&&document.activeElement.id||'';openModal({type:'gview',i:+d.i,pid:d.p||galPid()})};
A.galPrev=()=>{const m=ui.modal;const n=projPhotos(proj(m.pid)).length;m.i=(m.i-1+n)%n;render();const b=document.getElementById('gv-prev');b&&b.focus()};
A.galNext=()=>{const m=ui.modal;const n=projPhotos(proj(m.pid)).length;m.i=(m.i+1)%n;render();const b=document.getElementById('gv-next');b&&b.focus()};
A.galClose=()=>{const back=G.back;closeModal();if(back){const b=document.getElementById(back);b&&b.focus()}};
function gviewModal(m){const p=proj(m.pid);const l=projPhotos(p);const x=l[m.i];if(!x) return '';const n=l.length;
  return `<div class="modal-bg dark gv-bg" data-act="bgClose"><div class="gv" role="dialog" aria-modal="true" aria-label="Photo ${m.i+1} of ${n}: ${esc(x.cap||p.name)}">
   <div class="gv-top"><span class="gv-count">${m.i+1} / ${n}</span><span class="grow"></span><a class="btn glass sm" href="/files/${esc(x.f)}" target="_blank" rel="noopener">${icon('expand')} Open full size</a><button class="icon-btn gv-x" id="gv-close" data-act="galClose" aria-label="Close viewer">${icon('x')}</button></div>
   <figure class="gv-fig"><img src="/files/${esc(x.f)}" alt="${esc(photoAlt(p,x))}"><figcaption>${x.cap?`<b>${esc(x.cap)}</b>`:''}<small>${x.f===p.photo?'Cover photo · ':''}${x.byName?'Added by '+esc(x.byName):''}${x.at?' · '+fdt(x.at):''}</small></figcaption></figure>
   ${n>1?`<button class="gv-nav prev" id="gv-prev" data-act="galPrev" aria-label="Previous photo">${icon('left')}</button><button class="gv-nav next" id="gv-next" data-act="galNext" aria-label="Next photo">${icon('right')}</button>`:''}</div></div>`}
document.addEventListener('keydown',e=>{const m=ui.modal;if(!m) return;
  if(m.type==='gview'){if(e.key==='ArrowLeft'){e.preventDefault();A.galPrev()}else if(e.key==='ArrowRight'){e.preventDefault();A.galNext()}else if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();A.galClose()}}
  // keep keyboard focus inside any open dialog
  if(e.key==='Tab'){const box=document.querySelector('#modal [role="dialog"]');if(!box) return;
    const els=[...box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null||x===document.activeElement);
    if(!els.length) return;const first=els[0],last=els[els.length-1];
    if(!box.contains(document.activeElement)){e.preventDefault();first.focus()}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}},true);
// focus the dialog when one opens, so keyboard users start inside it
{const prev=openModal;openModal=function(m){prev(m);setTimeout(()=>{const box=document.querySelector('#modal [role="dialog"]');if(box&&!box.contains(document.activeElement)){const f=document.getElementById('gv-close')||box.querySelector('.modal-h .icon-btn,button,[href],input,select,textarea');f&&f.focus({preventScroll:true})}},60)}}

/* ---------- cropping (the original is kept) ---------- */
A.galCrop=async d=>{const pid=galPid();const l=projPhotos(proj(pid));const x=l[+d.i];if(!x) return;
  const src=x.o||x.f;await run(async()=>{const r=await fetch('/files/'+src,{credentials:'same-origin'});if(!r.ok) throw {message:'The photo could not be loaded.'};
    const bmp=await createImageBitmap(await r.blob());openModal({type:'gcrop',i:+d.i,pid,src,bmp,ar:'16:9',z:1,cx:.5,cy:.5})})};
const CROP_AR={'16:9':16/9,'4:3':4/3,'1:1':1,'3:4':3/4};
function cropRect(m){const W=m.bmp.width,H=m.bmp.height;const ar=CROP_AR[m.ar]||W/H;let w=W,h=W/ar;if(h>H){h=H;w=H*ar}w/=m.z;h/=m.z;
  const x=Math.max(0,Math.min(W-w,m.cx*W-w/2)),y=Math.max(0,Math.min(H-h,m.cy*H-h/2));return {x,y,w,h}}
function drawCrop(){const m=ui.modal;if(!m||m.type!=='gcrop') return;const c=document.getElementById('gc-canvas');if(!c) return;const W=m.bmp.width,H=m.bmp.height;
  const box=c.parentElement.getBoundingClientRect();const sc=Math.min(box.width/W,(box.height||420)/H);c.width=Math.round(W*sc);c.height=Math.round(H*sc);
  const g=c.getContext('2d');g.drawImage(m.bmp,0,0,c.width,c.height);const r=cropRect(m);
  g.fillStyle='rgba(8,18,32,.62)';g.beginPath();g.rect(0,0,c.width,c.height);g.rect(r.x*sc,r.y*sc,r.w*sc,r.h*sc);g.fill('evenodd');
  g.strokeStyle='#fff';g.lineWidth=2;g.strokeRect(r.x*sc+1,r.y*sc+1,r.w*sc-2,r.h*sc-2);
  g.strokeStyle='rgba(255,255,255,.4)';g.lineWidth=1;for(const t of [1/3,2/3]){g.beginPath();g.moveTo(r.x*sc+r.w*sc*t,r.y*sc);g.lineTo(r.x*sc+r.w*sc*t,r.y*sc+r.h*sc);g.moveTo(r.x*sc,r.y*sc+r.h*sc*t);g.lineTo(r.x*sc+r.w*sc,r.y*sc+r.h*sc*t);g.stroke()}
  const pv=document.getElementById('gc-prev');if(pv){const pw=pv.width=320,ph=pv.height=Math.round(320*r.h/r.w);pv.getContext('2d').drawImage(m.bmp,r.x,r.y,r.w,r.h,0,0,pw,ph)}}
{const prev=render;render=function(){const r=prev.apply(this,arguments);if(ui.modal&&ui.modal.type==='gcrop') requestAnimationFrame(drawCrop);return r}}
A.gcAr=d=>{ui.modal.ar=d.val;ui.modal.z=1;render()};
document.addEventListener('input',e=>{const el=e.target;const m=ui.modal;if(!m||m.type!=='gcrop'||!el.dataset||!el.dataset.gc) return;m[el.dataset.gc]=+el.value;drawCrop()});
// drag the picture inside the crop
document.addEventListener('pointerdown',e=>{const c=e.target.id==='gc-canvas'&&e.target;const m=ui.modal;if(!c||!m) return;c.setPointerCapture(e.pointerId);const st={x:e.clientX,y:e.clientY,cx:m.cx,cy:m.cy};
  const mv=ev=>{m.cx=Math.max(0,Math.min(1,st.cx+(ev.clientX-st.x)/c.width));m.cy=Math.max(0,Math.min(1,st.cy+(ev.clientY-st.y)/c.height));drawCrop()};
  const up=()=>{c.removeEventListener('pointermove',mv);c.removeEventListener('pointerup',up);c.removeEventListener('pointercancel',up);const r=cropRect(m);const W=m.bmp.width,H=m.bmp.height;m.cx=(r.x+r.w/2)/W;m.cy=(r.y+r.h/2)/H;render()};
  c.addEventListener('pointermove',mv);c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up)});
document.addEventListener('keydown',e=>{const m=ui.modal;if(!m||m.type!=='gcrop'||e.target.id!=='gc-canvas') return;const st=.02;const k={ArrowLeft:['cx',-st],ArrowRight:['cx',st],ArrowUp:['cy',-st],ArrowDown:['cy',st]}[e.key];if(!k) return;e.preventDefault();m[k[0]]=Math.max(0,Math.min(1,m[k[0]]+k[1]));drawCrop()});
function gcropModal(m,busy){const x=projPhotos(proj(m.pid))[m.i];
  return wrap('Crop photo',`<div class="gc"><div class="gc-stage"><canvas id="gc-canvas" tabindex="0" aria-label="Crop area. Drag, or use the arrow keys, to move the picture inside the frame."></canvas></div>
   <div class="gc-side"><div class="lbl">Shape</div>${seg('gcar',Object.keys(CROP_AR).map(k=>[k,k==='16:9'?'16:9 banner':k]),m.ar,'gcAr')}
    <div class="f"><label for="gc-z">Zoom</label><input id="gc-z" type="range" min="1" max="3" step=".01" value="${m.z}" data-gc="z"></div>
    <div class="f"><label for="gc-x">Left – right</label><input id="gc-x" type="range" min="0" max="1" step=".005" value="${m.cx}" data-gc="cx"></div>
    <div class="f"><label for="gc-y">Up – down</label><input id="gc-y" type="range" min="0" max="1" step=".005" value="${m.cy}" data-gc="cy"></div>
    <div class="lbl">Preview</div><canvas id="gc-prev" class="gc-prev" aria-hidden="true"></canvas>
    <p class="small muted">The original photo is kept${x&&x.o?' — you are cropping from it again':''}. You can go back to it at any time.</p></div></div>`,
   `${x&&x.o?`<button class="btn ghost" data-act="gcRestore" ${busy}>${icon('undo')} Use original</button><span class="spacer"></span>`:''}<button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="gcSave" ${busy}>${icon('crop')} Save crop</button>`,'wide')}
A.gcSave=async()=>{const m=ui.modal;const r=cropRect(m);const pid=m.pid;
  const ok=await run(async()=>{const c=document.createElement('canvas');const sc=Math.min(1,GAL_FULL/Math.max(r.w,r.h));c.width=Math.round(r.w*sc);c.height=Math.round(r.h*sc);c.getContext('2d').drawImage(m.bmp,r.x,r.y,r.w,r.h,0,0,c.width,c.height);
    const blob=await new Promise(res=>c.toBlob(res,'image/jpeg',.86));const k='crop';const f=await xhrUpload(blob);const t=await xhrUpload(await compressImage(blob,GAL_THUMB));
    const p=proj(pid);const l=projPhotos(p).slice();const old=l[m.i];l[m.i]={f,t,o:old.o||old.f,cap:old.cap||'',alt:old.alt||''};await galSaveList(pid,l,old.f===p.photo?f:p.photo)},'Crop saved. The original is kept.');
  if(ok) closeModal()};
A.gcRestore=async()=>{const m=ui.modal;const pid=m.pid;
  const ok=await run(async()=>{const p=proj(pid);const l=projPhotos(p).slice();const old=l[m.i];if(!old.o) return;const r=await fetch('/files/'+old.o,{credentials:'same-origin'});const t=await xhrUpload(await compressImage(await r.blob(),GAL_THUMB));
    l[m.i]={f:old.o,t,cap:old.cap||'',alt:old.alt||''};await galSaveList(pid,l,old.f===p.photo?old.o:p.photo)},'Original photo restored');
  if(ok) closeModal()};
{const prev=v6Modal;v6Modal=(m,busy)=>m.type==='gview'?gviewModal(m):m.type==='gcrop'?gcropModal(m,busy):prev(m,busy)}

/* ---------- the gallery page ---------- */
function vProjPhotos(){const pid=galPid();const p=proj(pid);
  if(!p) return emptyBox('','Choose a project','Open a project from Projects to see its photos.',`<button class="btn" data-act="go" data-v="projects">Projects</button>`);
  const l=projPhotos(p);const may=canProjPhotos(p);const q=G.q.filter(x=>x.pid===pid);const busy=q.some(x=>x.st==='up'||x.st==='wait');
  const c=coverOf(p);
  return `<section class="card gal-head"><div class="gal-cover">${c?`<button class="gal-cover-btn" data-act="galView" data-i="${l.indexOf(c)}" id="g-cover" aria-label="View the cover photo full size">${cover(p)}</button>`:cover(p)}</div>
   <div class="gal-info"><span class="eyebrow">${ui.role==='hq'?`<button class="linkish" data-act="go" data-v="projects">Projects</button> / `:''}Project photos</span><h2>${esc(p.name)}</h2>
    <p class="muted">${[p.city,p.state].filter(Boolean).map(esc).join(', ')}${p.scheme?' · '+esc(p.scheme):''}</p>
    <div class="gal-stats"><span><b>${l.length}</b> photo${l.length===1?'':'s'}</span><span>${c?'Cover chosen':'No cover yet'}</span><span>${may?'You can add and manage photos':'View only'}</span></div>
    ${may?`<div class="row"><label class="btn primary" id="g-pick" ${busy?'aria-busy="true"':''}>${icon('ul')} Upload Project Photos<input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden data-act-change="galPick"></label>${l.length?`<button class="btn" data-act="galView" data-i="0" id="g-open">${icon('expand')} View gallery</button>`:''}</div>`:''}</div></section>
  ${may?`<label class="gal-drop" data-gdrop="1" for="g-file">${icon('camera')}<span><span class="g-fine"><b>Drag project photos here</b> or <u>browse files</u></span><span class="g-touch"><b>Tap to choose photos</b> or take one with the camera</span><small>JPG, PNG or WebP · up to ${GAL_MAX_MB} MB each · several at once. Large photos are reduced to 2000 px before upload.</small></span></label><input type="file" id="g-file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden data-act-change="galPick">`:''}
  ${q.length?`<section class="card gq" aria-live="polite"><div class="card-h"><h2>Uploads</h2><span class="sub">${q.filter(x=>x.st==='done').length} of ${q.length} done</span></div><div class="gq-list">${q.map(x=>`<div class="gq-row gq-${x.st}">${x.url?`<img src="${x.url}" alt="">`:`<span class="gq-noimg">${icon('alert')}</span>`}<div class="grow"><b>${esc(x.name)}</b>
     ${x.st==='err'?`<small class="t-red" role="alert">${esc(x.msg)}</small>`:`<div class="gq-bar" role="progressbar" aria-label="Upload of ${esc(x.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((x.prog||0)*100)}"><i id="gq-bar-${x.k}" style="width:${Math.round((x.prog||0)*100)}%"></i></div><small id="gq-msg-${x.k}" class="muted">${esc(x.msg)}</small>`}</div>
     ${x.st==='err'?`${x.url?`<button class="btn sm" data-act="galRetry" data-k="${x.k}">Try again</button>`:''}<button class="icon-btn sm" data-act="galDismiss" data-k="${x.k}" aria-label="Remove from list">${icon('x')}</button>`:x.st==='done'?`<span class="gq-ok">${icon('check')}</span>`:''}</div>`).join('')}</div></section>`:''}
  ${l.length?`<section class="gal-grid">${l.map((x,i)=>`<article class="gcard ${x.f===p.photo?'is-cover':''}" data-gi="${i}" ${may?'draggable="true"':''}>
     <button class="gcard-ph" id="g-v-${i}" data-act="galView" data-i="${i}" aria-label="View photo ${i+1} full size"><img src="/files/${esc(x.t||x.f)}" alt="${esc(photoAlt(p,x))}" loading="lazy" decoding="async" width="640" height="480"></button>
     ${x.f===p.photo?`<span class="gcard-badge">${icon('star')} Cover</span>`:''}${x.o?'<span class="gcard-badge crop">Cropped</span>':''}
     <div class="gcard-b">${may?`<div class="f"><label for="g-cap-${i}">Caption</label><input class="inp" id="g-cap-${i}" value="${esc(x.cap||'')}" maxlength="200" placeholder="e.g. Rising main, chainage 2+400" data-act-change="galText" data-k="cap" data-i="${i}"></div>
       <div class="f"><label for="g-alt-${i}">Description for screen readers</label><input class="inp" id="g-alt-${i}" value="${esc(x.alt||'')}" maxlength="200" placeholder="What the photo shows" data-act-change="galText" data-k="alt" data-i="${i}"></div>`
       :`${x.cap?`<b>${esc(x.cap)}</b>`:''}`}<small class="muted">${x.byName?esc(x.byName)+' · ':''}${x.at?fdt(x.at):''}</small></div>
     ${may?`<div class="gcard-acts"><button class="btn sm gcard-cv" id="g-cv-${i}" data-act="galCover" data-i="${i}" ${x.f===p.photo?'disabled aria-pressed="true"':'aria-pressed="false"'}>${icon('star')} ${x.f===p.photo?'This is the cover':'Set as cover'}</button><span class="gcard-tools">
       <button class="icon-btn sm" id="g-mv-${i}" data-act="galUp" data-i="${i}" ${i===0?'disabled':''} aria-label="Move photo ${i+1} earlier">${icon('left')}</button><button class="icon-btn sm" data-act="galDown" data-i="${i}" ${i===l.length-1?'disabled':''} aria-label="Move photo ${i+1} later">${icon('right')}</button>
       <button class="icon-btn sm" data-act="galCrop" data-i="${i}" aria-label="Crop photo ${i+1}" title="Crop">${icon('crop')}</button>
       <label class="icon-btn sm" title="Replace" aria-label="Replace photo ${i+1}" tabindex="0" role="button">${icon('swap')}<input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden data-act-change="galReplace" data-i="${i}"></label>
       <button class="icon-btn sm danger" data-act="galDel" data-i="${i}" aria-label="Delete photo ${i+1}" title="Delete">${icon('trash')}</button></span></div>`:''}</article>`).join('')}</section>`
   :`<section class="card gal-empty">${icon('camera')}<h3>No project photos yet</h3><p class="muted">Photos of this site appear here and on the project's cards and banner. ${may?'Upload progress photos taken at the site — trenches, pipe laying, structures, testing.':'The project manager or HQ can add them.'}</p>${may?`<label class="btn orange">${icon('ul')} Upload Project Photos<input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden data-act-change="galPick"></label>`:''}</section>`}`}
// a label acting as a button opens its file picker from the keyboard too
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('label[role="button"]')){e.preventDefault();const i=e.target.querySelector('input[type=file]');i&&i.click()}});

{const prev=view;view=function(){if(ui.view==='projphotos'&&ui.role==='hq') return vProjPhotos();if(ui.view==='s_photos'&&ui.role==='site') return vProjPhotos();return prev()}}
{const prev=navItems;navItems=function(){const n=prev();if(ui.role!=='site') return n;const i=n.findIndex(x=>x.v==='s_stock');n.splice(i<0?n.length:i+1,0,{v:'s_photos',l:'Project photos',i:'img',b:0});return n}}
A.projPhotos=d=>go('projphotos',d.id);
// swipe between photos on a phone
{let sx=null;document.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'&&e.target.closest&&e.target.closest('.gv-fig')) sx=e.clientX},{passive:true});
  document.addEventListener('pointerup',e=>{if(sx==null) return;const dx=e.clientX-sx;sx=null;if(ui.modal&&ui.modal.type==='gview'&&Math.abs(dx)>50) dx<0?A.galNext():A.galPrev()},{passive:true})}
