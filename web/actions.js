"use strict";
/* ================= ROUTING ================= */
const HQ_VIEWS=['account','dashboard','demands','indent','queue','rfqs','rfq','pos','po','grn','dispatch','sitestock','reports','projects','vendors','items','settings','help','s_new','done'];
const SITE_VIEWS=['account','s_home','s_new','s_list','s_indent','s_incoming','s_stock','help','done'];
function parseHash(){const h=decodeURIComponent(location.hash.slice(1));if(!h) return null;const i=h.indexOf('/');return i<0?{v:h,p:null}:{v:h.slice(0,i),p:h.slice(i+1)}}
function restoreRoute(){const s=parseHash();const ok=(ui.role==='hq'?HQ_VIEWS:SITE_VIEWS);if(s&&ok.includes(s.v)&&(ui.role!=='hq'||viewAllowed(s.v))){ui.view=s.v;ui.param=s.p||null}try{history.replaceState({v:ui.view,p:ui.param},'',`#${ui.view}${ui.param?'/'+ui.param:''}`)}catch(e){}}
function go(v,param){if(ui.role==='hq'&&!ui.preview&&!viewAllowed(v)){toast('You don\'t have access to that page. Ask your administrator.','err');v='dashboard';param=null}
  if(ui.preview&&!SITE_VIEWS.includes(v)&&v!=='help'){ui.preview='';ui.role='hq'}
  ui.view=v;ui.param=param||null;ui.modal=null;ui.pop=null;ui.drawer=false;ui.cartOpen=false;
  try{history.pushState({v,p:param||null},'',`#${v}${param?'/'+param:''}`)}catch(e){}
  if(v==='settings'){loadUsers();loadBackup();loadAudit()}if(v==='projects') loadUsers();window.scrollTo(0,0);render()}
window.addEventListener('popstate',e=>{const s=e.state||parseHash();ui.modal=null;ui.pop=null;if(s&&s.v){ui.view=s.v;ui.param=s.p||null;render()}});

/* ================= BOOT ================= */
function applyTheme(){try{ui.theme=localStorage.getItem('ph-theme')||''}catch(e){ui.theme=''}if(ui.theme) document.documentElement.dataset.theme=ui.theme;else delete document.documentElement.dataset.theme}
async function boot(){
  applyTheme();document.body.insertAdjacentHTML('afterbegin',ART.sprite);render();
  let r,j=null;
  try{r=await fetch('/api/me',{credentials:'same-origin'});try{j=await r.json()}catch(e){}}catch(e){ui.view='fatal';ui.fatal='Cannot reach the ProcureHub server. Check that it is running and that this device is connected.';render();return}
  if(j){ui.company=j.company;ui.logo=j.logo;ui.version=j.version||'';ui.dataNotes=j.dataNotes||null}
  if(r.status===401){ui.view=j&&j.setup?'setup':'login';render();setTimeout(()=>{const el=document.getElementById(ui.view==='setup'?'a-name':'a-user');el&&el.focus()},50);return}
  if(!r.ok||!j||!j.user){ui.view='fatal';ui.fatal='The server returned an error. Try reloading the page.';render();return}
  ui.me=j.user;ui.net=j.net||null;ui.uid=j.user.id;ui.isHQ=j.user.role==='hq';ui.role=ui.isHQ?'hq':'site';
  if(j.user.mustChange){ui.view='pwchange';render();setTimeout(()=>{const el=document.getElementById('pw-old');el&&el.focus()},50);return}
  ui.view=ui.isHQ?'dashboard':'s_home';
  if(ui.isHQ){loadUsers();loadSmtp();loadMailIn()}
  if(ui.isHQ&&!isAdm()){const pv=parseHash();if(pv&&!viewAllowed(pv.v)) history.replaceState(null,'','#dashboard')}
  render();syncLoop();
}
async function loadUsers(){if(!isAdm()) return;try{ui.users=(await api('/api/users')).users||[];schedule()}catch(e){}}
async function loadAudit(){if(!isAdm()) return;try{ui.audit=(await api('/api/audit')).entries||[];schedule()}catch(e){}}
async function loadBackup(){if(!can('settings')) return;try{ui.bk=await api('/api/backup/status');const c=ui.bk.conf||{};if(!ui.draft.bk) ui.draft.bk={dir:c.dir||'',email:c.email||'',hour:String(c.email?(c.emailHour??19):19)};schedule()}catch(e){}}
async function loadSmtp(){if(!can('settings')&&!can('rfq_create')&&!can('po_issue')) return;try{ui.smtp=await api('/api/smtp');schedule()}catch(e){}}

/* ================= HELPERS ================= */
function setPath(path,val){const p=path.split('.');let o=ui;for(let i=0;i<p.length-1;i++){if(o[p[i]]==null) o[p[i]]={};o=o[p[i]]}o[p[p.length-1]]=val}
function getPath(path){let o=ui;for(const k of path.split('.')){if(o==null) return undefined;o=o[k]}return o}
function openModal(m){ui.modal=m;ui.pop=null;render();setTimeout(()=>{const el=document.querySelector('#modal .modal-b input:not([type=checkbox]):not([type=radio]):not([type=file]):not([readonly]),#modal .modal-b textarea:not([readonly])');if(el&&window.innerWidth>760) el.focus({preventScroll:true})},40)}
function closeModal(){if(ui.modal&&ui.modal.type==='photo'&&ui.modal.prev) ui.modal=ui.modal.prev;else ui.modal=null;render()}
function confirmBox(o){openModal(Object.assign({type:'confirm'},o))}
async function patchLines(indId,fn){const ind=S.indents.find(i=>i.id===indId);if(!ind) return;const lines=JSON.parse(JSON.stringify(ind.lines||[]));fn(lines,ind);await updDoc('indents',indId,{lines})}
async function learn(desc,spec,unit,cat){const id=slug(desc);const base=S.catalog[id]?Object.assign({},S.catalog[id]):STD[id]?{desc:STD[id].desc,spec:STD[id].spec,unit:STD[id].unit,sizes:STD[id].sizes}:{desc:desc.trim(),spec:spec||'',unit:unit||''};delete base.id;delete base.std;
  try{await setDoc('catalog',id,Object.assign(base,{category:cat,at:Date.now()}))}catch(e){console.warn(e)}}
function guessUnit(s){s=norm(s);if(!s) return 'Nos';if(/^(m|mtr|mtrs|meter|metre|meters|rm|rmt)$/.test(s)) return 'Mtr';if(/^(no|nos|pc|pcs|piece|each|ea)$/.test(s)) return 'Nos';if(/^(kg|kgs)$/.test(s)) return 'Kg';if(/^(l|ltr|litre|liter|ltrs)$/.test(s)) return 'Ltr';if(/^(bag|bags)$/.test(s)) return 'Bag';if(/^(set|sets)$/.test(s)) return 'Set';if(/^(pair|pairs|pr)$/.test(s)) return 'Pair';if(/^(mt|ton|tonne|tons)$/.test(s)) return 'MT';return UNITS.find(u=>u.toLowerCase()===s)||'Nos'}
function blankLine(){return {lid:newId(),desc:'',spec:'',unit:'Nos',qty:'',category:'others',catSrc:'none',siteNote:'',photo:''}}
const A={};const CH={};

/* ================= GENERAL ================= */
A.go=d=>{if(d.v==='s_new'&&ui.role==='hq'&&!ui.preview) draftIndent();go(d.v,d.p)};
A.setF=d=>{ui.f[d.k]=d.val;if(d.go) go(d.go);else render()};
A.tab=d=>{ui.tab[d.k]=d.val;render()};
A.closeModal=closeModal;
A.bgClose=(d,el,e)=>{if(e.target===el) closeModal()};
A.openIndent=d=>{if(!d.id) return;go(ui.role==='hq'?'indent':'s_indent',d.id)};
A.openRfq=d=>go('rfq',d.id);A.openPo=d=>go('po',d.id);
A.pop=d=>{ui.pop=ui.pop===d.p?null:d.p;render()};
A.drawer=()=>{ui.drawer=!ui.drawer;render()};
A.theme=()=>{const n={'':'light',light:'dark',dark:''}[ui.theme||''];ui.theme=n;try{if(n) localStorage.setItem('ph-theme',n);else localStorage.removeItem('ph-theme')}catch(e){}applyTheme();toast('Theme: '+(n||'same as device'));render()};
A.endPreview=()=>{ui.preview='';ui.role='hq';go('dashboard')};
A.queueCat=d=>{ui.f.qc=d.c;go('queue')};
A.projDemands=d=>{ui.f.dp=d.id;ui.f.ds='open';go('demands')};
A.confirmYes=async()=>{const m=ui.modal;if(m&&m.onYes) await m.onYes(m)};
A.viewPhoto=d=>{const prev=ui.modal;openModal({type:'photo',id:d.id,prev})};
A.rmPhoto=d=>{const cur=getPath(d.path);if(Array.isArray(cur)) setPath(d.path,cur.filter(x=>x!==d.id));else setPath(d.path,'');render()};
A.copyUrl=async()=>{try{await navigator.clipboard.writeText(location.origin);toast('Address copied')}catch(e){openModal({type:'text',title:'ProcureHub address',text:location.origin})}};
A.qtyStep=d=>{const v=num(getPath(d.bind));const nv=Math.max(0,Math.round((v+Number(d.d))*100)/100);setPath(d.bind,String(nv));render()};
A.mset=d=>{ui.modal.d[d.k]=d.val;render()};
CH.preview=el=>{ui.preview=el.value;if(el.value){ui.role='site';go('s_home')}else{ui.role='hq';go('dashboard')}};
CH.setFsel=el=>{ui.f[el.dataset.k]=el.value;render()};

/* ================= ACCOUNTS ================= */
A.doLogin=async()=>{const a=ui.auth||{};ui.authErr='';if(!a.username||!a.password){ui.authErr='Enter your username and password.';render();return}
  ui.busy=true;render();try{await api('/api/login',{username:a.username,password:a.password});location.reload()}catch(e){ui.authErr=e.message;ui.busy=false;render()}};
A.doSetup=async()=>{const a=ui.auth||{};ui.authErr='';if(!a.company||!a.username||!a.password){ui.authErr='Fill in company name, username and password.';render();return}
  ui.busy=true;render();try{await api('/api/setup',{company:a.company,name:a.name||'',username:a.username,password:a.password});location.reload()}catch(e){ui.authErr=e.message;ui.busy=false;render()}};
A.logout=async()=>{try{await api('/api/logout',{})}catch(e){}location.hash='';location.reload()};
A.myPassword=()=>openModal({type:'password',d:{old:'',nw:'',nw2:''}});
A.doFirstPassword=async()=>{const a=ui.pw||{};ui.authErr='';
  if(!a.old||!a.nw){ui.authErr='Fill in the temporary password and your new password.';render();return}
  if(a.nw.length<6){ui.authErr='The new password must be at least 6 characters.';render();return}
  if(a.nw!==a.nw2){ui.authErr='The two new passwords do not match.';render();return}
  ui.busy=true;render();try{await api('/api/password',{old:a.old,new:a.nw});location.reload()}catch(e){ui.authErr=e.message;ui.busy=false;render()}};
A.savePassword2=async()=>{const d=ui.draft.pw||{};if(!d.old||!d.nw){toast('Fill in your current and new password.','err');return}if(d.nw!==d.nw2){toast('The two new passwords do not match.','err');return}
  if(await run(()=>api('/api/password',{old:d.old,new:d.nw}),'Password changed. Other devices have been signed out.')){ui.draft.pw={old:'',nw:'',nw2:''};render()}};
function genPassword(seed){const w=(String(seed||'').replace(/[^a-z]/gi,'').slice(-4))||'Site';const a=new Uint32Array(2);crypto.getRandomValues(a);return w[0].toUpperCase()+w.slice(1).toLowerCase()+'@'+String(1000+a[0]%9000)+'abcdefghjkmnpqrstuvwxyz'[a[1]%23]}
function genUsername(p){let base=String(p.code||p.name||'site').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,30);if(base.length<3) base=(base+'-site').replace(/^-/,'');
  const taken=new Set(ui.users.map(u=>u.username));let u=base,i=2;while(taken.has(u)) u=base+'-'+(i++);return u}
async function createSiteLogin(p){const pw=genPassword(p.code||p.name);const name=(p.siteContact&&!/sample/i.test(p.siteContact))?p.siteContact:((p.code||p.name)+' site');
  const r=await api('/api/users',{id:'',name,username:genUsername(p),password:pw,phone:p.phone||'',role:'site',projectId:p.id,active:true});ui.users.push(r.user);
  return {projectId:p.id,name,username:r.user.username,password:pw,phone:p.phone||''}}
A.newSiteLogin=async d=>{const p=proj(d.p);if(!p) return;await loadUsers();const c=await run(()=>createSiteLogin(p));if(c){loadUsers();openModal({type:'cred',list:[c]})}};
A.bulkLogins=()=>{const ps=S.projects.filter(p=>p.active!==false&&!ui.users.some(u=>u.role==='site'&&u.projectId===p.id));
  confirmBox({title:`Create ${ps.length} site login${ps.length>1?'s':''}`,body:`One login is created for each of: <b>${ps.map(p=>esc(p.code||p.name)).join(', ')}</b>. You'll see every username and temporary password on the next screen to share with the sites.`,yes:'Create logins',onYes:async()=>{
    const list=[];await run(async()=>{for(const p of ps) list.push(await createSiteLogin(p))});loadUsers();if(list.length) openModal({type:'cred',list});else closeModal()}})};
A.resetLogin=d=>{const u=ui.users.find(x=>x.id===d.id);if(!u) return;
  confirmBox({title:'Reset password for '+u.username,body:`A new temporary password is created and <b>${esc(u.name)}</b> is signed out on all devices. They must choose their own password at the next sign-in.`,yes:'Reset password',onYes:async()=>{
    const pw=genPassword((proj(u.projectId)||{}).code||u.username);
    const r=await run(()=>api('/api/users',{id:u.id,name:u.name,username:u.username,password:pw,phone:u.phone||'',role:u.role,projectId:u.projectId||'',active:true}));
    if(r){loadUsers();openModal({type:'cred',reset:true,list:[{projectId:u.projectId||'',name:u.name,username:u.username,password:pw,phone:u.phone||(proj(u.projectId)||{}).phone||''}]})}}})};
A.copyCred=async()=>{const t=credText(ui.modal.list);try{await navigator.clipboard.writeText(t);toast('Login details copied')}catch(e){openModal({type:'text',title:'Login details',text:t})}};
A.printCred=()=>{const list=ui.modal.list;printHtml('Site logins',`<div style="font-family:Arial,sans-serif;padding:20px">${list.map(c=>`<div style="border:2px dashed #888;border-radius:10px;padding:16px 20px;margin:0 0 18px;page-break-inside:avoid"><div style="font-size:18px;font-weight:700">${esc(company())} · ProcureHub</div><div style="color:#444;margin:4px 0 12px">${esc(c.projectId?projLabel(c.projectId):c.name)}</div><table style="font-size:15px"><tr><td style="padding:3px 14px 3px 0">Website</td><td><b>${esc(location.origin)}</b></td></tr><tr><td style="padding:3px 14px 3px 0">Username</td><td><b>${esc(c.username)}</b></td></tr><tr><td style="padding:3px 14px 3px 0">Temporary password</td><td><b style="font-size:18px;letter-spacing:1px">${esc(c.password)}</b></td></tr></table><div style="color:#555;font-size:13px;margin-top:10px">Choose your own password at first sign-in. Keep it private.</div></div>`).join('')}</div>`)};
A.savePassword=async()=>{const d=ui.modal.d;if(d.nw!==d.nw2){toast('The two new passwords do not match.','err');return}if(await run(()=>api('/api/password',{old:d.old,new:d.nw}),'Password changed')) closeModal()};
A.editUser=d=>{const u=d.id?ui.users.find(x=>x.id===d.id):null;const role=d.role||'site';
  const acc=u?(u.role==='hq'?(u.admin?{admin:true,role:'Administrator',perms:[],projects:[]}:Object.assign({admin:false,role:'Custom',perms:[],projects:[]},JSON.parse(JSON.stringify(u.access||{})))):{admin:false,role:'Viewer',perms:['demands_view','sitestock_view'],projects:[]}):{admin:false,role:'Purchase executive',perms:ROLE_PRESETS[1][2].slice(),projects:[]};
  if(!acc.perms) acc.perms=[];if(!acc.projects) acc.projects=[];acc.scope=acc.projects.length?'some':'all';
  openModal({type:'user',id:d.id||null,d:u?Object.assign({},u,{password:'',acc}):{name:'',username:'',password:'',phone:'',role,projectId:'',active:true,acc}})};
A.userPreset=d=>{const a=ui.modal.d.acc;if(d.k==='admin'){a.admin=true;a.role='Administrator'}else{const p=ROLE_PRESETS[+d.k];a.admin=false;a.role=p[0];a.perms=p[2].slice()}render()};
A.userPerm=(d,el)=>{const a=ui.modal.d.acc;const s=new Set(a.perms);el.checked?s.add(d.k):s.delete(d.k);a.perms=[...s];a.admin=false;const m=ROLE_PRESETS.find(p=>p[2].length===a.perms.length&&p[2].every(x=>s.has(x)));a.role=m?m[0]:'Custom';render()};
A.userScope=d=>{ui.modal.d.acc.scope=d.val;render()};
A.userProj=(d,el)=>{const a=ui.modal.d.acc;const s=new Set(a.projects);el.checked?s.add(d.k):s.delete(d.k);a.projects=[...s];render()};
A.saveUser=async()=>{const m=ui.modal;const u=m.d;if(u.role==='hq'&&!u.acc.admin){if(!u.acc.perms.length) return toast('Tick at least one permission, or make this person an administrator.','err');if(u.acc.scope==='some'&&!u.acc.projects.length) return toast('Choose at least one site.','err')}const r=await run(()=>api('/api/users',{id:m.id||'',name:u.name||'',username:u.username||'',password:u.password||'',phone:u.phone||'',role:u.role,projectId:u.role==='site'?u.projectId||'':'',siteHead:u.role==='site'&&!!u.siteHead,cashSpend:u.role==='site'&&!!u.cashSpend,cashLimit:Math.max(0,num(u.cashLimit)),active:u.active!==false,access:u.role==='hq'?{admin:!!u.acc.admin,role:u.acc.admin?'Administrator':u.acc.role,perms:u.acc.perms,projects:u.acc.scope==='some'?u.acc.projects:[]}:null}),m.id?'User updated':'User created');if(r){closeModal();loadUsers()}};
A.loadAudit=()=>loadAudit();
A.delUser=()=>{const id=ui.modal.id;confirmBox({title:'Delete user',body:'This person can no longer sign in. Their past demands and receipts stay on record.',yes:'Delete user',danger:true,onYes:async()=>{if(await run(()=>api('/api/users?id='+encodeURIComponent(id),undefined,'DELETE'),'User deleted')){closeModal();loadUsers()}}})};

/* ================= RAISE DEMAND ================= */
A.pickCat=d=>{if(d.c==='others'){A.customItem({cat:'others'});return}ui.pickCat=d.c;ui.pickQ='';render();const el=document.querySelector('.picker');if(el&&el.getBoundingClientRect().top<0) el.scrollIntoView({behavior:'smooth'})};
A.pickBack=()=>{ui.pickCat=null;ui.pickQ='';render()};
A.pickItem=d=>{const it=D.itemMap[d.id];if(!it) return;if(ui.view!=='s_new'){ui.pop=null;ui.q='';go('s_new')}
  openModal({type:'addItem',item:it,d:{size:'',otherSize:'',qty:'',unit:it.unit||'Nos',spec:it.spec||'',note:'',photo:''}})};
A.addToDemand=()=>{const m=ui.modal,it=m.item,d=m.d;const sizes=it.sizes||[];
  const size=d.size==='__other'?(d.otherSize||'').trim():d.size;
  if(sizes.length&&!size){toast('Choose a size.','err');return}
  if(!(num(d.qty)>0)){toast('Enter the quantity.','err');document.getElementById('f-modal-d-qty')?.focus();return}
  const spec=[size,(d.spec||'').trim()].filter(Boolean).join(', ');
  draftIndent().lines.push({lid:newId(),desc:it.desc,spec,qty:String(num(d.qty)),unit:d.unit,category:it.category||'others',catSrc:'catalog',siteNote:d.note||'',photo:d.photo||''});
  ui.modal=null;toast(`Added ${fq(num(d.qty))} ${d.unit} ${it.desc}${size?' '+size:''}`);render()};
A.customItem=d=>openModal({type:'customItem',d:{desc:(d&&d.desc)||'',spec:'',qty:'',unit:'Nos',category:(d&&d.cat)||'others',catSrc:'none',catManual:!!(d&&d.cat),note:'',photo:''}});
A.addCustom=()=>{const d=ui.modal.d;if(!String(d.desc||'').trim()){toast('Enter the item description.','err');return}if(!(num(d.qty)>0)){toast('Enter the quantity.','err');return}
  draftIndent().lines.push({lid:newId(),desc:d.desc.trim(),spec:(d.spec||'').trim(),qty:String(num(d.qty)),unit:d.unit,category:d.category,catSrc:d.catManual?'manual':d.catSrc,siteNote:d.note||'',photo:d.photo||''});
  ui.modal=null;toast('Added '+d.desc.trim());render()};
A.cartToggle=()=>{ui.cartOpen=!ui.cartOpen;render()};
A.setDraft=d=>{draftIndent()[d.k]=d.val;render()};
A.rmLine=d=>{draftIndent().lines.splice(+d.ix,1);render()};
A.clearDraft=()=>confirmBox({title:'Clear this demand?',body:'All items you picked will be removed.',yes:'Clear',danger:true,onYes:()=>{ui.draft.ind=null;closeModal()}});
A.pasteLines=()=>openModal({type:'paste',text:''});
A.doPaste=()=>{const t=ui.modal.text||'';const L=draftIndent().lines;let n=0;
  for(const row of t.split(/\r?\n/)){if(!row.trim()) continue;const c=row.split('\t').map(s=>s.trim());while(c.length<4) c.push('');
    const qty=num(c[2]);if(!c[0]||(/^(item|desc|description|s\.?\s?no|sr)/i.test(c[0])&&!qty)) continue;
    const l=Object.assign(blankLine(),{desc:c[0],spec:c[1]||'',qty:qty?String(qty):'',unit:guessUnit(c[3])});const cl=classify(l.desc,l.spec);l.category=cl.cat;l.catSrc=cl.src;L.push(l);n++}
  ui.modal=null;render();toast(n+' lines added')};
A.submitIndent=async()=>{
  const d=draftIndent();const pid=ui.role==='hq'?d.projectId:siteProject();
  if(!pid){toast('Choose the project first.','err');ui.cartOpen=true;render();return}
  const lines=d.lines.filter(l=>String(l.desc).trim());if(!lines.length){toast('Add at least one item.','err');return}
  const bad=lines.find(l=>!(num(l.qty)>0));if(bad){toast(`Enter a quantity for "${bad.desc}".`,'err');ui.cartOpen=true;render();return}
  await run(async()=>{const no=await allocNo('MR',S.indents);const id=newId();
    await setDoc('indents',id,{no,projectId:pid,date:today(),requiredBy:d.requiredBy||'',priority:d.priority||'Normal',requestedBy:d.requestedBy||'',remarks:d.remarks||'',createdBy:ui.uid||null,createdByName:(ui.me&&ui.me.name)||'',raisedByHQ:ui.role==='hq'&&!ui.preview,at:Date.now(),
      lines:lines.map(l=>({id:newId(),desc:String(l.desc).trim(),spec:String(l.spec||'').trim(),qty:num(l.qty),unit:l.unit,category:l.category||'others',catSrc:l.catSrc,siteNote:l.siteNote||'',photo:l.photo||'',status:'pending'}))});
    ui.draft.ind=null;ui.pickCat=null;ui.pickQ='';go('done',id)});
};

/* ================= DEMAND REVIEW ================= */
A.cancelIndent=d=>confirmBox({title:'Cancel requisition',body:'The requisition is withdrawn and HQ will not process it.',yes:'Cancel requisition',danger:true,onYes:async()=>{await run(()=>updDoc('indents',d.id,{cancelled:true,cancelledAt:Date.now()}),'Requisition cancelled');go(ui.role==='hq'?'demands':'s_list')}});
A.lineStatus=async d=>{const note=String((ui.draft.ar&&ui.draft.ar[d.line])||'').trim();
  if(d.s==='rejected'&&!note){toast('Write the reason in the remark box first, so the site knows why.','err');const el=document.getElementById('ar-'+d.line);el&&el.focus();return}
  const ok=await run(()=>patchLines(d.ind,lines=>{const l=lines.find(x=>x.id===d.line);if(!l) return;l.status=d.s;if(d.s==='pending') delete l.approvalNote;else if(note) l.approvalNote=note;if(d.s==='approved'){const v=ui.draft.aq&&ui.draft.aq[l.id];l.approvedQty=num(v!=null?v:(l.approvedQty??l.qty));l.approvedAt=Date.now()}if(d.s==='pending'){delete l.approvedAt}}),d.s==='approved'?'Line approved':d.s==='rejected'?'Line rejected':d.s==='hold'?'Line on hold':'Line reopened');if(ok!==false&&ui.draft.ar) delete ui.draft.ar[d.line]};
function approveLines(ind,lines,note,only){let n=0;for(const l of lines) if(only?(!l.status||l.status==='pending'):(!l.status||l.status==='pending'||l.status==='hold')){const v=!only&&ui.draft.aq&&ui.draft.aq[l.id];const ln=String((ui.draft.ar&&ui.draft.ar[l.id])||'').trim();l.status='approved';l.approvedQty=num(v!=null&&v!==false?v:(only?l.qty:(l.approvedQty??l.qty)));l.approvedAt=Date.now();if(ln||note) l.approvalNote=ln||note;n++}return n}
async function addHqRemark(indId,text,action){const ind=S.indents.find(i=>i.id===indId);if(!ind||!text) return;await updDoc('indents',indId,{hqRemarks:(ind.hqRemarks||[]).concat({id:newId(),text,action:action||'',at:Date.now(),name:(ui.me&&ui.me.name)||''})})}
A.approveIndent=d=>{const i=S.indents.find(x=>x.id===d.id);if(!i) return;const n=(i.lines||[]).filter(l=>!l.status||l.status==='pending'||l.status==='hold').length;
  confirmBox({title:'Approve '+i.no,body:`<p>${n} line${n>1?'s':''} will be approved at the quantities shown. Remarks typed against a single line stay with that line.</p>`,note:'Approver remarks (optional) — the site will see this',noteArea:true,notePh:'e.g. Approved. Use existing stock of 100 mm valves first; balance will come from Ludhiana store.',yes:'Approve',onYes:async m=>{const note=String(m.noteVal||'').trim();
    const ok=await run(async()=>{await patchLines(d.id,lines=>approveLines(i,lines,note,false));if(note) await addHqRemark(d.id,note,'Approved')},'All lines approved');if(ok!==false){ui.draft.ar={};closeModal()}}})};
A.hqRemark=d=>confirmBox({title:'Add a remark for the site',body:'<p>The site can read this remark on the requisition. Remarks are kept with your name and time and cannot be deleted.</p>',note:'Remark',noteArea:true,yes:'Add remark',onYes:async m=>{const t=String(m.noteVal||'').trim();if(!t) return toast('Write the remark first.','err');if(await run(()=>addHqRemark(d.id,t,''),'Remark added')!==false) closeModal()}});
/* ---- pre-check of demands ---- */
A.pcRm=d=>{const l=ui.draft.pc[d.id].lines[+d.i];if(l.isNew) ui.draft.pc[d.id].lines.splice(+d.i,1);else l.removed=!l.removed;render()};
A.pcAdd=d=>{ui.draft.pc[d.id].lines.push({id:newId(),desc:'',spec:'',qty:'',unit:'Nos',removed:false,isNew:true});render();setTimeout(()=>{const n=ui.draft.pc[d.id].lines.length-1;const el=document.getElementById('pc-d-'+n);el&&el.focus()},40)};
function pcBuild(i){const d=ui.draft.pc[i.id];const log=[];const lines=[];const orig=i.lines||[];
  for(const x of d.lines){const desc=String(x.desc||'').trim(),spec=String(x.spec||'').trim();
    if(x.isNew){if(!desc&&!(num(x.qty)>0)) continue;if(!desc) throw {message:'Enter the item name of the added line.'};if(!(num(x.qty)>0)) throw {message:`Enter the quantity for ${desc}.`};
      const c=classify(desc,spec);lines.push({id:x.id,desc,spec,unit:x.unit||'Nos',qty:num(x.qty),category:c.cat,catSrc:c.src,status:'pending',siteNote:'',photo:'',pcAdded:true});log.push(`Added ${desc}${spec?' '+spec:''} · ${fq(num(x.qty))} ${x.unit}`);continue}
    const o=orig.find(l=>l.id===x.id);if(!o) continue;const l=JSON.parse(JSON.stringify(o));
    if(x.removed){if(!l.pcRemoved){l.status='rejected';l.pcRemoved=true;l.approvalNote='Removed at pre-check'+(d.note?': '+d.note:'');log.push(`Removed ${o.desc}${o.spec?' '+o.spec:''} (${fq(o.qty)} ${o.unit})`)}lines.push(l);continue}
    if(l.pcRemoved){delete l.pcRemoved;l.status='pending';delete l.approvalNote;log.push(`Restored ${o.desc}`)}
    if(!desc) throw {message:'An item name is empty.'};if(!(num(x.qty)>0)) throw {message:`Enter the quantity for ${desc}, or remove the item.`};
    const ch=[];if(desc!==o.desc) ch.push(`item ${o.desc} → ${desc}`);if(spec!==(o.spec||'')) ch.push(`size/spec ${o.spec||'—'} → ${spec||'—'}`);if(num(x.qty)!==num(o.qty)) ch.push(`qty ${fq(o.qty)} → ${fq(num(x.qty))}`);if((x.unit||o.unit)!==o.unit) ch.push(`unit ${o.unit} → ${x.unit}`);
    if(ch.length){if(!l.orig) l.orig={desc:o.desc,spec:o.spec||'',qty:num(o.qty),unit:o.unit};Object.assign(l,{desc,spec,qty:num(x.qty),unit:x.unit||o.unit});if(desc!==o.desc){const c=classify(desc,spec);l.category=c.cat;l.catSrc=c.src}log.push(`${o.desc}: ${ch.join(', ')}`)}
    lines.push(l)}
  if(!lines.some(l=>!l.pcRemoved)) throw {message:'All items are removed. Use "Delete demand" instead.'};
  return {lines,log}}
async function pcWrite(i,pass){const d=ui.draft.pc[i.id];const {lines,log}=pcBuild(i);const nm=(ui.me&&ui.me.name)||'';const now=Date.now();
  const pcLog=(i.pcLog||[]).concat(log.map(t=>({at:now,name:nm,text:t})),pass&&String(d.note||'').trim()?[{at:now,name:nm,text:'Note: '+String(d.note).trim()}]:[]);
  const patch={lines,pcLog};if(pass) patch.precheck={status:'passed',note:String(d.note||'').trim()};
  await updDoc('indents',i.id,patch);return log.length}
A.pcSave=async d=>{const i=S.indents.find(x=>x.id===d.id);if(!i) return;const n=await run(()=>pcWrite(i,false));if(n!==false){toast(n?`${n} change${n>1?'s':''} saved. Still waiting for pre-approval.`:'No changes to save.');delete ui.draft.pc[i.id];render()}};
A.pcPass=d=>{const i=S.indents.find(x=>x.id===d.id);if(!i) return;let preview;try{preview=pcBuild(i)}catch(e){toast(e.message,'err');return}
  confirmBox({title:'Pre-approve '+i.no,body:`<p>${preview.lines.filter(l=>!l.pcRemoved).length} item${preview.lines.filter(l=>!l.pcRemoved).length>1?'s':''} go to the approver${preview.log.length?` with ${preview.log.length} change${preview.log.length>1?'s':''} you made`:''}. The site sees the changes and your note.</p>`,yes:'Pre-approve',onYes:async()=>{const keep=ui.draft.pc[i.id];const r=await run(()=>pcWrite(i,true),'Pre-approved. Sent to the approver.');if(r!==false){delete ui.draft.pc[i.id];closeModal();go('precheck')}else ui.draft.pc[i.id]=keep}})};
A.pcDelete=d=>{const i=S.indents.find(x=>x.id===d.id);if(!i) return;confirmBox({title:'Delete '+i.no,body:'<p>The demand is withdrawn and will not go to the approver. It stays on record with your name and reason, and the site sees it as deleted.</p>',note:'Reason (required)',noteArea:true,yes:'Delete demand',danger:true,
  onYes:async m=>{const why=String(m.noteVal||'').trim();if(!why){toast('Write the reason for deleting.','err');return}if(await run(()=>updDoc('indents',i.id,{cancelled:true,cancelledAt:Date.now(),cancelReason:why,pcDeleted:true}),'Demand deleted at pre-check')!==false){if(ui.draft.pc) delete ui.draft.pc[i.id];closeModal();go('precheck')}}})};
A.savePrecheckSetting=async d=>{const on=d.val==='1';if(on===!!(S.config&&S.config.precheck)) return;
  const ok=await run(()=>setDoc('config','main',Object.assign({},S.config,{precheck:on})),on?'Pre-check switched on. Every new demand now waits for pre-check.':'Pre-check switched off. New demands go straight to the approver.');
  if(ok===false||!on) return;
  const waiting=S.indents.filter(i=>!i.cancelled&&!i.precheck&&(i.lines||[]).length&&(i.lines||[]).every(l=>!l.status||l.status==='pending'));
  if(waiting.length) confirmBox({title:'Send waiting demands to pre-check?',body:`<p><b>${waiting.length} demand${waiting.length>1?'s':''}</b> raised earlier ${waiting.length>1?'are':'is'} still waiting for approval (${waiting.slice(0,6).map(i=>esc(i.no)).join(', ')}${waiting.length>6?'…':''}).</p><p>Send ${waiting.length>1?'them':'it'} to pre-check as well, so nothing is approved without pre-approval?</p>`,yes:'Yes, send to pre-check',
    onYes:async()=>{const r=await run(async()=>{for(const i of waiting) await updDoc('indents',i.id,{precheck:{status:'pending'}});return waiting.length});if(r!==false){toast(`${waiting.length} demand${waiting.length>1?'s':''} moved to pre-check`);closeModal()}}})};
A.approveAllPending=()=>confirmBox({title:'Approve all new lines',body:'Every demand line awaiting review across all projects is approved at the quantity the site asked for.',note:'Approver remarks (optional) — every site will see this',noteArea:true,yes:'Approve all',onYes:async m=>{const note=String(m.noteVal||'').trim();await run(async()=>{for(const ind of S.indents){if(ind.cancelled||pcPending(ind)||amendIsOpen(ind)||(ind.precheck&&ind.precheck.by===ui.uid)) continue;if(!(ind.lines||[]).some(l=>!l.status||l.status==='pending')) continue;await patchLines(ind.id,lines=>approveLines(ind,lines,note,true));if(note) await addHqRemark(ind.id,note,'Approved')}},'All new lines approved');closeModal()}});
CH.setLineCat=async el=>{const {ind,line}=el.dataset;const i=S.indents.find(x=>x.id===ind);const l=i&&(i.lines||[]).find(x=>x.id===line);await run(async()=>{await patchLines(ind,ls=>{const x=ls.find(y=>y.id===line);x.category=el.value;x.catSrc='manual'});if(l) await learn(l.desc,l.spec,l.unit,el.value)},'Category updated — the catalogue will remember it')};
A.printMR=d=>{const i=S.indents.find(x=>x.id===d.id);if(i) printHtml(i.no,mrDoc(i))};

/* ================= QUEUE & RFQ ================= */
A.toggleSel=(d,el)=>{ui.sel[d.k]=el.checked;render()};
A.clearSel=()=>{ui.sel={};render()};
A.selCat=d=>{const g=queueLines().filter(x=>(x.l.category||'others')===d.c);const all=g.every(x=>ui.sel[x.k]);for(const x of g) ui.sel[x.k]=!all;render()};
A.rfqForCat=d=>{ui.sel={};for(const x of queueLines()) if((x.l.category||'others')===d.c) ui.sel[x.k]=true;A.newRfq()};
function buildRfqLines(keys){const m={};
  for(const k of keys){const [iid,lid]=k.split('|');const ind=S.indents.find(i=>i.id===iid);const l=ind&&(ind.lines||[]).find(x=>x.id===lid);if(!l) continue;
    const ik=itemKey(l.desc,l.spec,l.unit);const r=m[ik]||(m[ik]={desc:l.desc,spec:l.spec||'',unit:l.unit,cat:l.category||'others',qty:0,srcs:[]});
    r.qty+=needQty(l);r.srcs.push({indentId:iid,lineId:lid,projectId:ind.projectId,qty:needQty(l),mrNo:ind.no})}
  return Object.values(m).map((r,i)=>Object.assign({key:'L'+(i+1)},r))}
A.newRfq=()=>{const keys=Object.keys(ui.sel).filter(k=>ui.sel[k]&&queueLines().some(x=>x.k===k));if(!keys.length){toast('Select lines first.','err');return}
  const lines=buildRfqLines(keys);const cats=[...new Set(lines.map(l=>l.cat))];
  openModal({type:'newRfq',d:{keys,lines,vendorIds:S.vendors.filter(v=>(v.categories||[]).some(c=>cats.includes(c))).map(v=>v.id),dueDate:addDays(today(),3),deliveryMode:'store',notes:''}})};
A.toggleRfqVend=(d,el)=>{const a=ui.modal.d.vendorIds;const i=a.indexOf(d.v);if(el.checked&&i<0) a.push(d.v);if(!el.checked&&i>=0) a.splice(i,1);render()};
async function createRfq(m,extra){
  const cats=[...new Set(m.lines.map(l=>l.cat))];const no=await allocNo('RFQ',S.rfqs);const id=newId();
  await setDoc('rfqs',id,Object.assign({no,date:today(),dueDate:m.dueDate,deliveryMode:m.deliveryMode,notes:m.notes||'',category:cats.length===1?cats[0]:'mixed',vendorIds:m.vendorIds.slice(),lines:m.lines,quotes:{},award:{},status:'draft',sentLog:[],at:Date.now(),createdBy:ui.uid||null},extra||{}));
  const byInd={};for(const l of m.lines) for(const s of l.srcs)(byInd[s.indentId]=byInd[s.indentId]||[]).push(s.lineId);
  try{for(const [iid,lids] of Object.entries(byInd)) await patchLines(iid,ls=>{for(const l of ls) if(lids.includes(l.id)){l.rfqId=id;l.rfqNo=no;l.rfqAt=Date.now()}})}
  catch(e){try{await updDoc('rfqs',id,{status:'cancelled',cancelNote:'Could not link to the demands: '+errMsg(e)})}catch(_){}throw {message:no+' was not created: '+errMsg(e)}}
  return {id,no};
}
A.createRfq=async()=>{const m=ui.modal.d;const r=await run(()=>createRfq(m));if(r){ui.sel={};toast(r.no+' created. Now send it to the vendors.');go('rfq',r.id)}};
A.issueStock=async d=>{const [iid,lid]=d.k.split('|');await run(()=>patchLines(iid,ls=>{const l=ls.find(x=>x.id===lid);l.fromStock=true;l.poAt=Date.now()}),'Marked for issue from store. Create the challan in Store & dispatch.')};
A.newTransfer=d=>{const x=queueLines().find(y=>y.k===d.k);if(!x) return;const ik=itemKey(x.l.desc,x.l.spec,x.l.unit);
  const srcs=Object.entries(D.site).filter(([p,m])=>p!==x.ind.projectId&&m[ik]&&m[ik].free>0).sort((a,b)=>b[1][ik].free-a[1][ik].free);
  const from=srcs.length?srcs[0][0]:'';openModal({type:'transfer',x,d:{from,qty:String(from?Math.min(x.info.need,srcs[0][1][ik].free):''),note:''}})};
A.saveTransfer=async()=>{const m=ui.modal,x=m.x,d=m.d;const ik=itemKey(x.l.desc,x.l.spec,x.l.unit);const row=(D.site[d.from]||{})[ik];let q=num(d.qty);
  if(!row){toast('Choose the sending site.','err');return}if(!(q>0)){toast('Enter the quantity.','err');return}
  if(q>row.free+1e-9){toast(`Only ${fq(row.free)} ${x.l.unit} is available at ${projCode(d.from)}.`,'err');return}
  if(q>x.info.need) q=x.info.need;
  const ok=await run(async()=>{const no=await allocNo('STI',S.dispatches);const did=newId();
    await setDoc('dispatches',did,{no,type:'transfer',fromProjectId:d.from,projectId:x.ind.projectId,status:'to_send',date:today(),note:d.note||'',purpose:d.purpose||'',at:Date.now(),createdBy:ui.uid,createdByName:(ui.me&&ui.me.name)||'',
      lines:[{itemKey:ik,desc:x.l.desc,spec:x.l.spec||'',unit:x.l.unit,cat:x.l.category,qty:q,indentId:x.ind.id,lineId:x.l.id,mrNo:x.ind.no,recvQty:null}]});
    await patchLines(x.ind.id,ls=>{const i=ls.findIndex(l=>l.id===x.l.id);const l=ls[i];const need=needQty(l);
      if(q<need-1e-9){const rest=Math.round((need-q)*1000)/1000;const nl=JSON.parse(JSON.stringify(l));for(const k of ['transferId','transferNo','transferFrom','transferAt','rfqId','rfqNo','poId','poNo','fromStock']) delete nl[k];
        Object.assign(nl,{id:newId(),qty:rest,approvedQty:rest,splitFrom:l.id,siteNote:(l.siteNote?l.siteNote+' · ':'')+'Balance after transfer'});ls.splice(i+1,0,nl);l.approvedQty=q}
      Object.assign(l,{transferId:did,transferNo:no,transferFrom:projCode(d.from),transferAt:Date.now()})});
    return no});
  if(ok){closeModal();if(poApprovalOn()){toast(`Site transfer indent ${ok} sent to the Director (Procurement) for approval. ${projCode(d.from)} can send the material once it is approved.`);go('sti',S.dispatches.find(y=>y.no===ok)?S.dispatches.find(y=>y.no===ok).id:null)}else toast(`Site transfer indent ${ok} created. ${projCode(d.from)} will see it under Receive material.`)}};
A.addRfqVendor=()=>{const r=S.rfqs.find(x=>x.id===ui.param);const others=S.vendors.filter(v=>!(r.vendorIds||[]).includes(v.id));
  if(!others.length){toast('All vendors are already on this RFQ.');return}
  confirmBox({title:'Add vendor to '+r.no,body:`<div class="checks">${others.map(v=>`<label class="check"><input type="radio" name="addv" id="av-${v.id}" data-act="pickAddV" data-v="${v.id}">${vendorAvatar(v)}<span>${esc(v.name)}</span></label>`).join('')}</div>`,yes:'Add vendor',onYes:async m=>{if(!m.pick){toast('Choose a vendor.','err');return}if(await run(()=>updDoc('rfqs',r.id,{vendorIds:[...(r.vendorIds||[]),m.pick]}),'Vendor added')) closeModal()}})};
A.pickAddV=d=>{ui.modal.pick=d.v};
const rfqOf=()=>S.rfqs.find(x=>x.id===ui.param);
async function logSend(r,vid,via){await updDoc('rfqs',r.id,{sentLog:[...(r.sentLog||[]),{vendorId:vid,via,at:Date.now()}],status:r.status==='draft'?'sent':r.status})}
A.logSend=async(d,el,e)=>{const r=rfqOf();const v=vend(d.v);if(!v||!v.phone){e.preventDefault();toast('Add a phone number for this vendor first.','err');return}try{await logSend(r,d.v,d.via)}catch(err){}};
A.copyRfq=async d=>{const r=rfqOf();const v=vend(d.v);const t=rfqText(r,v);try{await navigator.clipboard.writeText(t);toast('RFQ text copied');await logSend(r,d.v,'copied text')}catch(e){openModal({type:'text',title:'RFQ text for '+(v?v.name:''),text:t})}};
const sendMail=(to,subject,html,text,extra)=>api('/api/mail',Object.assign({to:[to],subject,html,text},extra||{}));
A.mailRfq=async d=>{const r=rfqOf();const v=vend(d.v);if(!v||!v.email){toast('Add an email for this vendor first.','err');return}
  if(!mailOk()){toast('Set up email in Settings first, or use WhatsApp / Copy.','err');return}
  await run(async()=>{await sendMail(v.email,`RFQ ${r.no} – ${company()} – quote by ${fd(r.dueDate)}`,rfqHtml(r,v),rfqText(r,v),{rfqSheet:{rfq:r.id,vendor:v.id}});await logSend(r,d.v,'Email')},'RFQ emailed to '+v.name)};
A.mailRfqAll=async()=>{const r=rfqOf();if(!mailOk()){toast('Set up email in Settings first, or use WhatsApp / Copy.','err');return}
  const vs=(r.vendorIds||[]).map(vend).filter(v=>v&&v.email);if(!vs.length){toast('None of these vendors has an email address.','err');return}
  ui.busy=true;render();let ok=0;const log=[...(r.sentLog||[])];
  for(const v of vs){try{await sendMail(v.email,`RFQ ${r.no} – ${company()} – quote by ${fd(r.dueDate)}`,rfqHtml(r,v),rfqText(r,v),{rfqSheet:{rfq:r.id,vendor:v.id}});ok++;log.push({vendorId:v.id,via:'Email',at:Date.now()})}catch(e){toast(v.name+': '+errMsg(e),'err');break}}
  try{if(ok) await updDoc('rfqs',r.id,{sentLog:log,status:r.status==='draft'?'sent':r.status})}catch(e){}
  ui.busy=false;render();if(ok) toast(`RFQ emailed to ${ok} vendor${ok===1?'':'s'}`);const noMail=(r.vendorIds||[]).length-vs.length;if(noMail) toast(noMail+' vendor(s) have no email. Use WhatsApp for them.')};
A.enterQuote=d=>{const r=rfqOf();const v=vend(d.v)||{};const q=(r.quotes||{})[d.v];
  const dq=q?JSON.parse(JSON.stringify(Object.assign({files:[]},q))):{rates:{},gst:18,freight:0,deliveryDays:'',payment:v.payment||'',validity:'30 days',remarks:'',files:[]};
  const gr=dq.gstRates||{};dq.gstRates={};for(const l of r.lines){const g=gr[l.key]!=null&&gr[l.key]!==''?gr[l.key]:(q?dq.gst:(itemGst(l.desc)??dq.gst));dq.gstRates[l.key]=String(g)}
  openModal({type:'quote',rfqId:r.id,vid:d.v,d:dq})};
A.gstAll=()=>{const m=ui.modal;const g=String(m.d.gst??'').trim();if(g===''||!(num(g)>=0&&num(g)<=100)){toast('Enter a GST % between 0 and 100 first.','err');return}const r=S.rfqs.find(x=>x.id===m.rfqId);for(const l of r.lines) m.d.gstRates[l.key]=g;render()};
A.pasteRates=()=>{const m=ui.modal;const r=S.rfqs.find(x=>x.id===m.rfqId);const clean=x=>num(String(x||'').replace(/[₹%,\s]|rs\.?/gi,''));
  const rows=(m.aiText||'').split(/\r?\n/).map(s=>s.split('\t').map(c=>c.trim()).filter(c=>c!=='')).filter(c=>c.length);let n=0,ng=0;
  r.lines.forEach((l,i)=>{const c=rows[i]||[];let rate,g=null;if(c.length>=2&&GST_SLABS.includes(clean(c[c.length-1]))&&clean(c[c.length-2])>0){rate=clean(c[c.length-2]);g=clean(c[c.length-1])}else rate=clean(c[c.length-1]);
    if(rate>0){m.d.rates[l.key]=String(rate);n++}if(g!=null){m.d.gstRates[l.key]=String(g);ng++}});m.aiMsg=`Filled ${n} of ${r.lines.length} rates${ng?` and ${ng} GST rates`:''}. Check them before saving.`;m.aiOpen=true;render()};
A.saveQuote=async()=>{const m=ui.modal;const r=S.rfqs.find(x=>x.id===m.rfqId);const q=m.d;const rates={},gstRates={};for(const l of r.lines){const v=num(q.rates[l.key]);if(v>0){rates[l.key]=v;const gs=String(q.gstRates[l.key]??'').trim();const g=gs===''?num(q.gst):num(gs);if(!(g>=0&&g<=100)||isNaN(g)){toast(`GST % for ${l.desc} must be between 0 and 100.`,'err');return}gstRates[l.key]=g}}
  if(!Object.keys(rates).length){toast('Enter at least one rate.','err');return}
  const quote={rates,gstRates,gst:num(q.gst),freight:num(q.freight),deliveryDays:q.deliveryDays?num(q.deliveryDays):'',payment:q.payment||'',validity:q.validity||'',remarks:q.remarks||'',files:q.files||[],at:Date.now()};
  const hsn={};for(const k in rates) if(q.hsn&&String(q.hsn[k]||'').trim()) hsn[k]=String(q.hsn[k]).trim();if(Object.keys(hsn).length) quote.hsn=hsn;
  if(m.mailId) quote.fromMail=m.mailId;
  if(await run(async()=>{await updDoc('rfqs',r.id,{quotes:Object.assign({},r.quotes||{},{[m.vid]:quote}),status:r.status==='draft'?'sent':r.status});if(m.mailId) await updDoc('mailquotes',m.mailId,{status:'accepted',decidedAt:Date.now(),decidedBy:ui.uid||null})},m.mailId?'Quotation from email accepted into the comparative':'Quotation saved')) closeModal()};
A.delQuote=async()=>{const m=ui.modal;const r=S.rfqs.find(x=>x.id===m.rfqId);const quotes=Object.assign({},r.quotes);delete quotes[m.vid];const award=Object.assign({},r.award);for(const k in award) if(award[k]===m.vid) delete award[k];
  if(await run(()=>updDoc('rfqs',r.id,{quotes,award}),'Quote removed')) closeModal()};
A.award=async d=>{const r=rfqOf();if(r.status==='approved'){toast('Reopen the comparative to change awards.','err');return}await run(()=>updDoc('rfqs',r.id,{award:Object.assign({},r.award||{},{[d.k]:d.v})}))};
A.awardL1=async()=>{const r=rfqOf();const l1=l1Map(r);const award={};for(const k in l1) if(l1[k]) award[k]=l1[k].v;await run(()=>updDoc('rfqs',r.id,{award}),'Lowest rate awarded for each line')};
A.awardVendor=async d=>{const r=rfqOf();const q=r.quotes[d.v];const award={};for(const l of r.lines) if(num((q.rates||{})[l.key])>0) award[l.key]=d.v;await run(()=>updDoc('rfqs',r.id,{award}),'Awarded')};
A.approveRfq=()=>{const r=rfqOf();confirmBox({title:'Approve comparative '+r.no,body:'Approving locks the awarded rates. You can then generate purchase orders, one per awarded vendor.',note:'Approval note (optional)',yes:'Approve',onYes:async m=>{if(await run(()=>updDoc('rfqs',r.id,{status:'approved',approvedAt:Date.now(),approvedBy:ui.uid||null,approvalNote:m.noteVal||''}),'Comparative approved')) closeModal()}})};
A.unapproveRfq=async()=>{const r=rfqOf();await run(()=>updDoc('rfqs',r.id,{status:'sent',approvedAt:null}))};
A.cancelRfq=()=>{const r=rfqOf();confirmBox({title:'Cancel '+r.no,body:'The lines go back to the procurement queue so they can be sourced again.',yes:'Cancel RFQ',danger:true,onYes:async()=>{await run(async()=>{await updDoc('rfqs',r.id,{status:'cancelled'});const byInd={};for(const l of r.lines) for(const s of l.srcs)(byInd[s.indentId]=byInd[s.indentId]||[]).push(s.lineId);for(const [iid,lids] of Object.entries(byInd)) await patchLines(iid,ls=>{for(const l of ls) if(lids.includes(l.id)&&l.rfqId===r.id&&!l.poId){delete l.rfqId;delete l.rfqNo;delete l.rfqAt}})},'RFQ cancelled');closeModal()}})};
async function createDirectDispatches(po,id,exp){const byP={};const made=[];for(const l of po.lines) for(const s of l.srcs||[])(byP[s.projectId]=byP[s.projectId]||[]).push({l,s});
  for(const [pid,arr] of Object.entries(byP)){const dno=await allocNo('DD',S.dispatches.concat(made));const doc={no:dno,type:'direct',projectId:pid,poId:id,poNo:po.no,vendorName:po.vendorName,date:po.date,expectedDate:exp,status:'ordered',at:Date.now(),
    lines:arr.map(({l,s})=>({poKey:l.key,itemKey:l.itemKey,desc:l.desc,spec:l.spec,unit:l.unit,cat:l.cat,qty:num(s.qty),indentId:s.indentId,lineId:s.lineId,mrNo:s.mrNo||'',recvQty:null}))};await setDoc('dispatches',newId(),doc);made.push(doc)}}
async function generatePOs(r){
  const award=r.award||{};const byV={};for(const l of r.lines){const v=award[l.key];if(!v) throw {message:'Award every line before generating POs.'};(byV[v]=byV[v]||[]).push(l)}
  const poIds=[],created=[];
  for(const [vid,lines] of Object.entries(byV)){const v=vend(vid)||{};const q=r.quotes[vid];const no=await allocNo('PO',S.pos.concat(created));const id=newId();
    const po={no,rfqId:r.id,rfqNo:r.no,vendorId:vid,vendorName:v.name||'',date:today(),deliveryMode:r.deliveryMode,deliveryDays:q.deliveryDays||'',payment:q.payment||v.payment||'',freight:num(q.freight),terms:S.config.poTerms||DEFAULT_TERMS,
      lines:lines.map(l=>({key:l.key,desc:l.desc,spec:l.spec,unit:l.unit,cat:l.cat,qty:num(l.qty),rate:num(q.rates[l.key]),gst:qGst(q,l.key),hsn:((q.hsn||{})[l.key])||itemHsn(l.desc),itemKey:itemKey(l.desc,l.spec,l.unit),srcs:l.srcs})),received:{},status:'issued',at:Date.now(),createdBy:ui.uid||null};
    await setDoc('pos',id,po);poIds.push(id);created.push(po);const exp=po.deliveryDays?addDays(po.date,+po.deliveryDays):'';
    if(r.deliveryMode==='site') await createDirectDispatches(po,id,exp);
    const byInd={};for(const l of po.lines) for(const s of l.srcs)(byInd[s.indentId]=byInd[s.indentId]||[]).push(s.lineId);
    for(const [iid,lids] of Object.entries(byInd)) await patchLines(iid,ls=>{for(const l of ls) if(lids.includes(l.id)) Object.assign(l,{poId:id,poNo:no,vendorName:po.vendorName,expectedDate:exp,orderedQty:needQty(l),poAt:Date.now()})});
  }
  await updDoc('rfqs',r.id,{status:'ordered',poIds,orderedAt:Date.now()});return created;
}
A.editPoGst=()=>{const po=poOf();if(!po) return;const gst={},hsn={};for(const l of po.lines){gst[l.key]=String(num(l.gst));hsn[l.key]=l.hsn||itemHsn(l.desc)||''}openModal({type:'poGst',poId:po.id,d:{gst,hsn,learn:true}})};
A.savePoGst=async()=>{const m=ui.modal;const po=S.pos.find(p=>p.id===m.poId);if(!po) return;const d=m.d;
  for(const l of po.lines){const g=num(d.gst[l.key]);if(String(d.gst[l.key]??'').trim()===''||!(g>=0&&g<=100)){toast(`GST % for ${l.desc} must be between 0 and 100.`,'err');return}}
  const lines=po.lines.map(l=>Object.assign({},l,{gst:num(d.gst[l.key]),hsn:String(d.hsn[l.key]||'').trim()}));
  const ok=await run(async()=>{await updDoc('pos',po.id,{lines});if(d.learn&&can('masters_items')) for(const l of lines){const id=slug(l.desc);const cur=S.catalog[id];if(!cur&&!STD[id]) continue;const base=cur?Object.assign({},cur):{desc:STD[id].desc,spec:STD[id].spec,unit:STD[id].unit,sizes:STD[id].sizes,category:STD[id].category||l.cat};delete base.id;delete base.std;
    if(num(base.gst)!==l.gst||base.gst===''||base.gst==null||(l.hsn&&base.hsn!==l.hsn)) await setDoc('catalog',id,Object.assign(base,{gst:l.gst,hsn:l.hsn||base.hsn||'',at:Date.now()}))}},'GST and HSN saved');if(ok!==false) closeModal()};
A.poDelivery=()=>{const po=poOf();if(!po) return;const ds=S.dispatches.filter(x=>x.poId===po.id&&x.status!=='cancelled');
  if(poProgress(po).r>0||S.grns.some(g=>g.poId===po.id)||ds.some(x=>x.status!=='ordered')||S.jobwork.some(e=>e.poId===po.id&&e.status!=='cancelled')){toast('Material has already been received or dispatched against this PO, so its delivery can no longer be changed.','err');return}
  const cur=po.deliveryMode==='site'?'site':po.deliveryMode==='vendor'?'vendor':'store';
  openModal({type:'poDelivery',poId:po.id,d:{mode:cur,fab:po.shipToVendorId||'',billTo:po.jwBillTo||'fab'}})};
// stamp demand lines that go to a job worker, so sites see where their material is
async function jwMarkLines(po,name){const byInd={};for(const l of po.lines) for(const s of l.srcs||[])(byInd[s.indentId]=byInd[s.indentId]||[]).push(s.lineId);
  for(const [iid,lids] of Object.entries(byInd)) await patchLines(iid,ls=>{for(const l of ls) if(lids.includes(l.id)&&l.poId===po.id){if(name) l.jwVendor=name;else delete l.jwVendor}})}
A.savePoDelivery=async()=>{const m=ui.modal;const po=S.pos.find(p=>p.id===m.poId);if(!po) return;const d=m.d;const cur=po.deliveryMode==='site'?'site':po.deliveryMode==='vendor'?'vendor':'store';
  if(d.mode==='vendor'&&!vend(d.fab)){toast('Choose the job worker who receives the material.','err');return}
  if(d.mode===cur&&(d.mode!=='vendor'||(d.fab===po.shipToVendorId&&d.billTo===po.jwBillTo))){closeModal();return}
  const exp=po.deliveryDays?addDays(po.date,+po.deliveryDays):'';const fab=vend(d.fab)||{};
  const ok=await run(async()=>{
    if(cur==='site'&&d.mode!=='site') for(const x of S.dispatches.filter(x=>x.poId===po.id&&x.type==='direct'&&x.status==='ordered')) await updDoc('dispatches',x.id,{status:'cancelled',cancelledAt:Date.now(),note:'PO delivery changed'});
    if(d.mode==='site'&&cur!=='site') await createDirectDispatches(po,po.id,exp);
    const patch={deliveryMode:d.mode};
    if(d.mode==='vendor') Object.assign(patch,{shipToVendorId:fab.id,shipToVendorName:fab.name||'',jwBillTo:d.billTo==='us'?'us':'fab'});else Object.assign(patch,{shipToVendorId:null,shipToVendorName:null,jwBillTo:null});
    await updDoc('pos',po.id,patch);
    if(d.mode==='vendor'||cur==='vendor') await jwMarkLines(po,d.mode==='vendor'?fab.name||'job worker':'');
  },'Delivery changed to '+(d.mode==='site'?'direct to sites':d.mode==='vendor'?(fab.name||'the job worker'):'HQ store')+'. Send the updated PO to the vendor.');if(ok!==false) closeModal()};
A.genPOs=async()=>{const r=rfqOf();const res=await run(()=>generatePOs(r));if(res&&res.length){toast(`${res.length} purchase order${res.length===1?'':'s'} created`+(poApprovalOn()?' — waiting for approval by the Director (Procurement)':''));go('pos')}};
A.dlComparative=()=>{const r=rfqOf();const vids=(r.vendorIds||[]).filter(v=>(r.quotes||{})[v]);const vn=v=>(vend(v)||{}).name||'';const rows=[['Comparative statement',r.no,fd(r.date)],[],['Item','Specification','Qty','Unit',...vids.flatMap(v=>[vn(v)+' rate',vn(v)+' GST %',vn(v)+' amount']),'L1 vendor','Awarded to']];
  const l1=l1Map(r);for(const l of r.lines) rows.push([l.desc,l.spec,l.qty,l.unit,...vids.flatMap(v=>{const rt=num(r.quotes[v].rates[l.key]);return [rt||'',rt?qGst(r.quotes[v],l.key):'',rt?rt*l.qty:'']}),l1[l.key]?vn(l1[l.key].v):'',r.award&&r.award[l.key]?vn(r.award[l.key]):'']);
  rows.push([]);for(const lab of ['Basic value','GST amount','Freight','Landed total','Delivery days','Payment']) rows.push([lab,'','','',...vids.flatMap(v=>{const q=r.quotes[v];const t=landed(r,v);return [lab==='Basic value'?Math.round(t.basic*100)/100:lab==='GST amount'?Math.round(t.gst*100)/100:lab==='Freight'?q.freight:lab==='Landed total'?Math.round(t.total*100)/100:lab==='Delivery days'?q.deliveryDays:q.payment,'','']})]);
  saveXlsx(r.no.replace(/\//g,'-')+'-comparative.xlsx',[{name:'Comparative',rows}])};

/* ================= PURCHASE ORDERS ================= */
const poOf=()=>S.pos.find(x=>x.id===ui.param);
A.dlPo=()=>{const po=poOf();saveFile(po.no.replace(/\//g,'-')+'.html',`<!doctype html><html><head><meta charset="utf-8"><title>${esc(po.no)}</title><base href="${location.origin}/"></head><body style="margin:0;background:#fff">${poDoc(po)}</body></html>`)};
A.printPo=()=>{const po=poOf();printHtml(po.no,poDoc(po))};
A.mailPo=async()=>{if(!mailOk()){toast('Set up email in Settings first.','err');return}const po=poOf();const v=vend(po.vendorId)||{};if(!v.email){toast('Add an email for this vendor first.','err');return}
  confirmBox({title:'Email '+po.no+' to '+v.name,body:`The purchase order goes to <b>${esc(v.email)}</b> from your company mailbox.`,yes:'Send email',onYes:async()=>{
    const ok=await run(async()=>{await sendMail(v.email,`Purchase Order ${po.no} – ${company()}`,`<p>Dear ${esc(v.contact||v.name)},</p><p>Please find our purchase order below. Kindly acknowledge and confirm the dispatch schedule.</p>${poDoc(po).replace(/src="\/files\//g,`src="${location.origin}/files/`)}`,`Purchase Order ${po.no} dated ${fd(po.date)}. Total ${money(poTotals(po).total)}. Please view this email in HTML.`,{poId:po.id});
      await updDoc('pos',po.id,{mailLog:[...(po.mailLog||[]),{at:Date.now(),to:v.email}]})},'PO emailed to '+v.name);if(ok) closeModal()}})};
A.cancelPo=()=>{const po=poOf();confirmBox({title:'Cancel '+po.no,body:'The demand lines go back to the procurement queue. Direct-to-site deliveries not yet received are cancelled.',yes:'Cancel PO',danger:true,onYes:async()=>{await run(async()=>{
  await updDoc('pos',po.id,{status:'cancelled',cancelledAt:Date.now()});
  for(const d of (D.poDispatches[po.id]||[])) if(d.status==='ordered'||d.status==='in_transit') await updDoc('dispatches',d.id,{status:'cancelled'});
  const byInd={};for(const l of po.lines) for(const s of l.srcs||[])(byInd[s.indentId]=byInd[s.indentId]||[]).push(s.lineId);
  for(const [iid,lids] of Object.entries(byInd)) await patchLines(iid,ls=>{for(const l of ls) if(lids.includes(l.id)&&l.poId===po.id){for(const k of ['poId','poNo','poAt','vendorName','expectedDate','orderedQty','rfqId','rfqNo','rfqAt']) delete l[k]}})},'PO cancelled');closeModal()}})};

/* ================= RECEIPT, STORE, DISPATCH ================= */
A.recordGrn=d=>{const po=S.pos.find(p=>p.id===d.id);if(!poIsApproved(po)){toast('This PO is waiting for approval by the Director (Procurement).','err');return}const recv={};for(const l of po.lines){const b=Math.max(0,num(l.qty)-poRecv(po,l.key));recv[l.key]=b?String(b):''}
  openModal({type:'grn',poId:po.id,d:{date:today(),challan:'',invoice:'',invoiceDate:'',vehicle:'',remarks:'',recv,rej:{},photos:[]}})};
A.saveGrn=async()=>{const m=ui.modal;const po=S.pos.find(p=>p.id===m.poId);const d=m.d;
  const lines=po.lines.map(l=>{const rc=num(d.recv[l.key]),rj=num(d.rej[l.key]);return {key:l.key,desc:l.desc,spec:l.spec,unit:l.unit,cat:l.cat,itemKey:l.itemKey||itemKey(l.desc,l.spec,l.unit),recv:rc,rej:rj,acc:Math.max(0,rc-rj)}}).filter(l=>l.recv>0);
  if(!lines.length){toast('Enter the received quantity.','err');return}
  const ok=await run(async()=>{const no=await allocNo('GRN',S.grns);await setDoc('grns',newId(),{no,poId:po.id,poNo:po.no,vendorName:po.vendorName,date:d.date,challan:d.challan,invoice:d.invoice,invoiceDate:d.invoiceDate||'',vehicle:d.vehicle,remarks:d.remarks,photos:d.photos||[],lines,at:Date.now(),by:ui.uid||null});
    const received=Object.assign({},po.received||{});for(const l of lines) received[l.key]=num(received[l.key])+l.acc;await updDoc('pos',po.id,{received});toast(no+' saved. Store stock updated.')});
  if(ok) closeModal()};
A.inwardPick=()=>openModal({type:'inwardPick'});
A.inwardOther=d=>openModal({type:'inward',d:{type:d.t,date:today(),party:'',partyGstin:'',challan:'',invoice:'',invoiceDate:'',vehicle:'',remarks:'',photos:[],lines:[{desc:'',spec:'',unit:'Nos',qty:'',rate:'',gst:'',hsn:''}]}});
A.inwardAdd=()=>{ui.modal.d.lines.push({desc:'',spec:'',unit:'Nos',qty:'',rate:'',gst:'',hsn:''});render()};
A.inwardRm=d=>{ui.modal.d.lines.splice(+d.i,1);render()};
A.saveInward=async()=>{const d=ui.modal.d;const lines=d.lines.filter(l=>String(l.desc).trim()||num(l.qty)>0);
  if(!lines.length){toast('Enter at least one item.','err');return}
  for(const l of lines){if(!String(l.desc).trim()){toast('Enter the item name on every line.','err');return}if(!(num(l.qty)>0)){toast(`Enter the quantity for ${l.desc}.`,'err');return}
    if(String(l.gst??'').trim()!==''&&!(num(l.gst)>=0&&num(l.gst)<=100)){toast(`GST % for ${l.desc} must be between 0 and 100.`,'err');return}}
  const pg=String(d.partyGstin||'').trim().toUpperCase();if(gstinCheck(pg)){toast('Supplier GSTIN: '+gstinCheck(pg),'err');return}
  const ok=await run(async()=>{const no=await allocNo('GRN',S.grns);await setDoc('grns',newId(),{no,poId:null,type:d.type,date:d.date||today(),party:String(d.party||'').trim(),partyGstin:pg,invoiceDate:d.invoiceDate||'',challan:d.challan||'',invoice:d.invoice||'',vehicle:d.vehicle||'',remarks:d.remarks||'',photos:d.photos||[],at:Date.now(),by:ui.uid||null,
    lines:lines.map((l,i)=>{const desc=String(l.desc).trim();const o={key:'L'+(i+1),desc,spec:String(l.spec||'').trim(),unit:l.unit||'Nos',cat:classify(desc,l.spec).cat,itemKey:itemKey(desc,String(l.spec||'').trim(),l.unit||'Nos'),recv:num(l.qty),rej:0,acc:num(l.qty),hsn:String(l.hsn||'').trim()||itemHsn(desc)};
      if(String(l.rate??'').trim()!==''){o.rate=num(l.rate);o.gst=String(l.gst??'').trim()===''?(itemGst(desc)??18):num(l.gst)}return o})});return no});
  if(ok!==false){closeModal();toast(ok+' saved. HQ store stock updated.');ui.tab.store='stock';render()}};
A.grnDocs=d=>{const g=S.grns.find(x=>x.id===d.id);if(g) openModal({type:'grnDocs',id:g.id,d:{photos:(g.photos||[]).slice()}})};
A.saveGrnDocs=async()=>{const m=ui.modal;if(await run(()=>updDoc('grns',m.id,{photos:m.d.photos||[]}),'Documents saved')!==false) closeModal()};
A.printGrn=d=>{const g=S.grns.find(x=>x.id===d.id);if(g) printHtml(g.no,grnDoc(g))};
A.storeItem=d=>openModal({type:'storeItem',k:d.k});
A.freeChallan=d=>openModal({type:'freeChallan',d:{projectId:'',date:today(),vehicle:'',lrNo:'',driver:'',note:'',lines:[{k:d.k||'',qty:''}]}});
A.fcAdd=()=>{ui.modal.d.lines.push({k:'',qty:''});render()};
A.fcRm=d=>{ui.modal.d.lines.splice(+d.i,1);render()};
A.saveFreeChallan=async(dd,el,e,force)=>{const d=ui.modal.d;if(!d.projectId){toast('Choose the site to send to.','err');return}
  const lines=d.lines.filter(l=>l.k&&num(l.qty)>0);if(!lines.length){toast('Choose an item and enter the quantity to send.','err');return}
  const L=storeLedger();const need={};for(const l of lines) need[l.k]=(need[l.k]||0)+num(l.qty);
  for(const k in need){const r=L[k];if(!r||need[k]>r.bal+1e-9){toast(`Only ${fq(r?r.bal:0)} ${r?r.unit:''} of ${r?r.desc:'this item'} is in the HQ store.`,'err');return}}
  const over=Object.keys(need).filter(k=>need[k]>L[k].free+1e-9);
  if(over.length&&!force){const keep=ui.modal;confirmBox({title:'Use reserved stock?',body:`<p>${over.map(k=>esc(L[k].desc)).join(', ')}: this is more than the free stock. Part of it is reserved for approved demands of other sites.</p>`,yes:'Send anyway',onYes:async()=>{ui.modal=keep;await A.saveFreeChallan(dd,el,e,true)}});return}
  const ok=await run(async()=>{const no=await allocNo('DC',S.dispatches);await setDoc('dispatches',newId(),{no,type:'store',projectId:d.projectId,date:d.date||today(),vehicle:d.vehicle||'',lrNo:d.lrNo||'',driver:d.driver||'',note:d.note||'',status:'in_transit',shippedAt:Date.now(),at:Date.now(),free:true,
    lines:lines.map(l=>{const r=L[l.k];return {itemKey:l.k,desc:r.desc,spec:r.spec||'',unit:r.unit,cat:r.cat,qty:num(l.qty),recvQty:null}})});return no});
  if(ok!==false){closeModal();toast(ok+' created. '+projCode(d.projectId)+' can now confirm receipt.')}};
A.openingStock=()=>A.openStock({p:'hq'});
A.saveOpening=async()=>{const d=ui.modal.d;if(!String(d.desc).trim()||!(num(d.qty)>0)){toast('Enter item and quantity.','err');return}
  const cat=classify(d.desc,d.spec).cat;const ok=await run(async()=>{const no=await allocNo('GRN',S.grns);await setDoc('grns',newId(),{no,poId:null,type:'opening',date:today(),lines:[{key:'O1',desc:d.desc.trim(),spec:d.spec||'',unit:d.unit,cat,itemKey:itemKey(d.desc,d.spec,d.unit),recv:num(d.qty),rej:0,acc:num(d.qty)}],at:Date.now()})},'Added to store stock');
  if(ok) closeModal()};
A.newChallan=d=>{const R=readyToDispatch().filter(x=>x.ind.projectId===d.p);const bal={};for(const x of R){const k=itemKey(x.l.desc,x.l.spec,x.l.unit);if(bal[k]==null) bal[k]=x.bal}
  const lines=R.map(x=>{const k=itemKey(x.l.desc,x.l.spec,x.l.unit);const q=Math.max(0,Math.min(x.pend,bal[k]));bal[k]-=q;return {k:x.k,itemKey:k,desc:x.l.desc,spec:x.l.spec||'',unit:x.l.unit,cat:x.l.category,pend:x.pend,bal:x.bal,qty:q?String(q):'',mr:x.ind.no,indentId:x.ind.id,lineId:x.l.id}});
  openModal({type:'challan',projectId:d.p,d:{date:today(),vehicle:'',lrNo:'',driver:'',lines}})};
A.saveChallan=async()=>{const m=ui.modal;const d=m.d;const lines=d.lines.filter(l=>num(l.qty)>0);if(!lines.length){toast('Enter quantities to dispatch.','err');return}
  const need={};for(const l of lines) need[l.itemKey]=(need[l.itemKey]||0)+num(l.qty);
  for(const k in need){const s=D.stock[k];if(!s||need[k]>s.bal+1e-9){toast('Not enough stock for '+(s?s.desc:k.split('|')[0])+'.','err');return}}
  const ok=await run(async()=>{const no=await allocNo('DC',S.dispatches);await setDoc('dispatches',newId(),{no,type:'store',projectId:m.projectId,date:d.date,vehicle:d.vehicle,lrNo:d.lrNo,driver:d.driver,status:'in_transit',shippedAt:Date.now(),at:Date.now(),
    lines:lines.map(l=>({itemKey:l.itemKey,desc:l.desc,spec:l.spec,unit:l.unit,cat:l.cat,qty:num(l.qty),indentId:l.indentId,lineId:l.lineId,mrNo:l.mr,recvQty:null}))});return no});
  if(ok){closeModal();toast(ok+' created. The site can now confirm receipt.')}};
A.markShipped=d=>{const x=S.dispatches.find(y=>y.id===d.id);openModal({type:'shipped',id:d.id,d:{vehicle:x.vehicle||'',lrNo:x.lrNo||'',expectedDate:x.expectedDate||today()}})};
A.saveShipped=async()=>{const m=ui.modal;if(await run(()=>updDoc('dispatches',m.id,{status:'in_transit',vehicle:m.d.vehicle,lrNo:m.d.lrNo,expectedDate:m.d.expectedDate,shippedAt:Date.now()}),'Marked as on the way')) closeModal()};
A.viewDispatch=d=>openModal({type:'dispatchView',id:d.id});
A.printChallan=d=>{const x=S.dispatches.find(y=>y.id===d.id);if(x) printHtml(x.no,challanDoc(x))};
A.cancelDispatch=d=>{const x=S.dispatches.find(y=>y.id===d.id);confirmBox({title:'Cancel '+x.no,body:x.type==='transfer'?'The transfer is cancelled and the demand line goes back to the procurement queue.':'Quantities return to store stock (or to the pending vendor delivery).',yes:'Cancel',danger:true,onYes:async()=>{
  const ok=await run(async()=>{await updDoc('dispatches',x.id,{status:'cancelled'});if(x.type==='transfer'){for(const l of x.lines) await patchLines(l.indentId,ls=>{const y=ls.find(z=>z.id===l.lineId);if(y&&y.transferId===x.id) for(const k of ['transferId','transferNo','transferFrom','transferAt']) delete y[k]})}},'Cancelled');if(ok) closeModal()}})};
A.receiveDispatch=d=>{const x=S.dispatches.find(y=>y.id===d.id);const recv={};x.lines.forEach((l,i)=>recv[i]=String(l.qty));const rs=((proj(x.projectId)||{}).receivers||[]).filter(r=>r.name);
  openModal({type:'receive',id:d.id,d:{recv,by:rs.length===1?rs[0].name:(rs.length?'':(ui.me&&ui.me.name)||''),designation:'',date:today(),remarks:'',photos:[],signedDocs:[],declared:false}})};
A.saveReceipt=async()=>{const m=ui.modal;const x=S.dispatches.find(y=>y.id===m.id);const d=m.d;const rs=((proj(x.projectId)||{}).receivers||[]).filter(r=>r.name);
  if(!String(d.by||'').trim()){toast(rs.length?'Choose the authorised person who received the material.':'Enter the name of the person who received the material.','err');return}
  if(!(d.signedDocs||[]).length){toast('Upload the challan signed and stamped at site (photo or PDF).','err');const z=document.querySelector('#modal [data-drop="modal.d.signedDocs"]');z&&z.scrollIntoView({block:'center'});return}
  if(!d.declared){toast('Tick the confirmation at the bottom.','err');return}
  const lines=x.lines.map((l,i)=>Object.assign({},l,{recvQty:num(d.recv[i])}));const short=lines.some(l=>l.recvQty+1e-9<num(l.qty));
  const who=rs.find(r=>r.name===d.by);
  if(await run(()=>updDoc('dispatches',x.id,{lines,status:short?'short':'delivered',receivedAt:Date.now(),receivedOn:d.date||today(),receivedByName:String(d.by).trim(),receiverDesignation:who?who.designation||'':String(d.designation||'').trim(),siteRemarks:d.remarks||'',photos:d.photos||[],signedDocs:d.signedDocs,declared:true}),short?'Receipt saved — shortage reported to HQ':'Receipt confirmed. Site stock updated.')) closeModal()};
A.signLater=d=>openModal({type:'signLater',id:d.id,d:{signedDocs:[]}});
A.saveSignLater=async()=>{const m=ui.modal;if(!(m.d.signedDocs||[]).length){toast('Upload the signed and stamped challan first.','err');return}const x=S.dispatches.find(y=>y.id===m.id);
  if(await run(()=>updDoc('dispatches',m.id,{signedDocs:(x.signedDocs||[]).concat(m.d.signedDocs)}),'Signed challan saved')) closeModal()};
A.rpAdd=()=>{const d=ui.modal.d;(d.receivers=d.receivers||[]).push({name:'',designation:'',phone:''});render();setTimeout(()=>{const el=document.getElementById('rp-n-'+(d.receivers.length-1));el&&el.focus()},30)};
A.rpRm=d=>{ui.modal.d.receivers.splice(+d.i,1);render()};
A.sendTransfer=d=>openModal({type:'sendTransfer',id:d.id,d:{vehicle:'',driver:'',lrNo:'',by:(ui.me&&ui.me.name)||'',photos:[]}});
A.saveSendTransfer=async()=>{const m=ui.modal;if(await run(()=>updDoc('dispatches',m.id,{status:'in_transit',vehicle:m.d.vehicle,driver:m.d.driver,lrNo:m.d.lrNo,sentByName:m.d.by,shippedAt:Date.now(),sentPhotos:m.d.photos||[]}),'Marked as sent. The receiving site has been told.')) closeModal()};

/* ================= SITE STOCK ================= */
A.recordUse=()=>A.siteLog({t:'use',p:siteProject()});
A.siteLog=d=>{const pid=d.p||siteProject();if(!pid){toast('Choose a project first.','err');return}
  openModal({type:'sitelog',projectId:pid,d:{type:d.t||'use',key:d.k||'',desc:'',spec:'',unit:'Nos',qty:'',date:today(),location:'',issuedTo:'',reason:'',remarks:''}})};
A.saveSiteLog=async()=>{const m=ui.modal,d=m.d,pid=m.projectId;const q=num(d.qty);let doc;
  if(d.type==='opening'){if(!String(d.desc).trim()){toast('Enter the item.','err');return}if(!(q>0)){toast('Enter the quantity.','err');return}
    doc={type:'opening',itemKey:itemKey(d.desc,d.spec,d.unit),desc:d.desc.trim(),spec:(d.spec||'').trim(),unit:d.unit,cat:classify(d.desc,d.spec).cat}}
  else{const row=(D.site[pid]||{})[d.key];if(!row){toast('Choose the item.','err');return}if(!(q>0)){toast('Enter the quantity.','err');return}
    const avail=row.bal-(row.pcons||0);if(q>avail+1e-9){toast(`Only ${fq(avail)} ${row.unit} is available${row.pcons?' ('+fq(row.pcons)+' is in consumption reports waiting for authentication)':''}.`,'err');return}
    if(d.type==='damage'&&!d.reason){toast('Choose the reason.','err');return}
    doc={type:d.type,itemKey:row.itemKey,desc:row.desc,spec:row.spec,unit:row.unit,cat:row.cat}}
  Object.assign(doc,{projectId:pid,qty:q,date:d.date||today(),location:d.location||'',issuedTo:(d.issuedTo||'').trim(),reason:d.reason||'',remarks:d.remarks||'',at:Date.now(),createdBy:ui.uid,createdByName:(ui.me&&ui.me.name)||''});
  const msg={use:'Issue recorded',opening:'Stock added',damage:'Damage / loss recorded',return:'Return recorded. Central store stock updated.'}[d.type];
  if(await run(()=>setDoc('sitelog',newId(),doc),msg)) closeModal()};
A.delSiteLog=d=>confirmBox({title:'Delete this entry?',body:'Site stock will be recalculated.',yes:'Delete',danger:true,onYes:async()=>{if(await run(()=>delDoc('sitelog',d.id),'Entry deleted')) closeModal()}});
A.ledger=d=>{const lv=(D.lvl[d.p]||{})[d.k];openModal({type:'ledger',p:d.p,k:d.k,min:lv&&num(lv.min)?String(lv.min):''})};
A.saveMin=async()=>{const m=ui.modal;const r=(D.site[m.p]||{})[m.k];if(!r) return;const v=num(m.min);if(v<0){toast('Minimum level cannot be negative.','err');return}
  const id='lv~'+m.p+'~'+hash(m.k).toString(36)+m.k.length;
  await run(()=>setDoc('stocklvl',id,{projectId:m.p,itemKey:m.k,desc:r.desc,spec:r.spec,unit:r.unit,min:v,at:Date.now(),by:ui.uid||null}),v?`Minimum level set to ${fq(v)} ${r.unit}`:'Minimum level removed')};
A.stockCount=d=>openModal({type:'count',p:d.p||siteProject(),d:{},by:(ui.me&&ui.me.name)||''});
A.saveCount=async()=>{const m=ui.modal;const rows=siteRows(m.p);const todo=[];
  rows.forEach((r,ix)=>{const v=m.d[ix];if(v===''||v==null) return;const diff=Math.round((num(v)-r.bal)*1000)/1000;if(Math.abs(diff)>1e-9) todo.push({r,diff,v})});
  if(!Object.values(m.d).some(v=>v!==''&&v!=null)){toast('Enter at least one counted quantity.','err');return}
  if(!todo.length){closeModal();toast('Count matches the register. Nothing to correct.');return}
  const ok=await run(async()=>{for(const t of todo) await setDoc('sitelog',newId(),{type:'adjust',projectId:m.p,itemKey:t.r.itemKey,desc:t.r.desc,spec:t.r.spec,unit:t.r.unit,cat:t.r.cat,qty:t.diff,date:today(),reason:'Physical count '+fd(today()),remarks:`Counted ${fq(num(t.v))} ${t.r.unit}${m.by?' by '+m.by:''}`,at:Date.now(),createdBy:ui.uid,createdByName:(ui.me&&ui.me.name)||''})},`${todo.length} correction${todo.length>1?'s':''} saved`);
  if(ok) closeModal()};
A.reorderLow=d=>{const p=d.p||siteProject();const low=Object.values(D.site[p]||{}).filter(r=>r.low);if(!low.length) return;
  const dr=draftIndent();if(ui.role==='hq') dr.projectId=p;
  for(const r of low){if(dr.lines.some(l=>itemKey(l.desc,l.spec,l.unit)===r.itemKey)) continue;const q=Math.max(r.min*2-r.bal,r.min);
    dr.lines.push({lid:newId(),desc:r.desc,spec:r.spec||'',qty:String(Math.ceil(q)),unit:r.unit,category:r.cat||'others',catSrc:'catalog',siteNote:'Below minimum stock',photo:''})}
  dr.remarks=dr.remarks||'Replenishment of items below minimum stock level';go('s_new');ui.cartOpen=true;toast(`${low.length} low-stock item${low.length>1?'s':''} added. Check quantities and send.`)};
A.dlProjStock=d=>{const p=d.p;const code=projCode(p);const hq=ui.role==='hq';
  const head=['Item','Specification','Category','Unit','Opening / added','Received','Issued','Sent to other sites','Damaged / lost','Returned to store','Count corrections','Balance','Minimum level','Status'].concat(hq?['Rate incl GST','Value']:[]);
  const rows=[head].concat(siteRows(p).map(r=>[r.desc,r.spec||'',catName(r.cat),r.unit,r.open,r.recv,r.used,r.out,r.dmg,r.ret,r.adj,r.bal,r.min||'',stockStatus(r).label].concat(hq?[D.rate[r.itemKey]?Math.round(D.rate[r.itemKey].rate*100)/100:'',Math.round(r.value)]:[])));
  const reg=[['Date','Entry','Item','Specification','Unit','Qty','Issued to','Location','Reason','Remarks','Entered by']].concat(S.sitelog.filter(e=>e.projectId===p).sort((a,b)=>(a.at||0)-(b.at||0)).map(e=>[e.date,(LOG_T[e.type]||LOG_T.opening)[0],e.desc,e.spec||'',e.unit,num(e.qty),e.issuedTo||'',e.location||'',e.reason||'',e.remarks||'',e.createdByName||'']));
  saveXlsx(`site-stock-${code}-${today()}.xlsx`,[{name:'Stock '+code,rows},{name:'Register',rows:reg}])};

/* ================= MASTERS ================= */
A.editProject=d=>{const p=d.id?S.projects.find(x=>x.id===d.id):null;openModal({type:'project',id:d.id||null,d:p?JSON.parse(JSON.stringify(p)):{code:'',name:'',scheme:'Water Supply',client:'',city:'',state:'',siteContact:'',phone:'',address:'',photo:'',active:true}})};
A.saveProject=async()=>{const m=ui.modal;const p=m.d;if(!String(p.name||'').trim()){toast('Enter the project name.','err');return}
  p.gstin=String(p.gstin||'').trim().toUpperCase();const ge=gstinCheck(p.gstin);if(ge){toast('Site GSTIN: '+ge,'err');return}
  if(p.pin&&!/^[1-9][0-9]{5}$/.test(String(p.pin).trim())){toast('PIN code must be 6 digits.','err');return}
  if(p.gstin&&GST_STATES[p.gstin.slice(0,2)]&&p.state&&stateCode(p.state)&&GST_STATES[p.gstin.slice(0,2)]!==p.state){toast(`The site GSTIN is registered in ${GST_STATES[p.gstin.slice(0,2)]}, but the project state is ${p.state}.`,'err');return}
  const doc={code:(p.code||'').trim().toUpperCase(),name:p.name.trim(),scheme:p.scheme||'',client:p.client||'',city:p.city||'',state:p.state||'',siteContact:p.siteContact||'',phone:p.phone||'',address:p.address||'',receivers:(p.receivers||[]).map(r=>({name:String(r.name||'').trim(),designation:String(r.designation||'').trim(),phone:String(r.phone||'').trim()})).filter(r=>r.name),pin:String(p.pin||'').trim(),billName:String(p.billName||'').trim(),gstin:p.gstin,photo:p.photo||'',active:p.active!==false,at:p.at||Date.now()};if(p.sample) doc.sample=true;
  if(await run(()=>setDoc('projects',m.id||newId(),doc),'Project saved')) closeModal()};
A.editVendor=d=>{const v=d.id?S.vendors.find(x=>x.id===d.id):null;openModal({type:'vendor',id:d.id||null,d:v?JSON.parse(JSON.stringify(v)):{name:'',gstin:'',contact:'',phone:'',email:'',city:'',address:'',payment:'',rating:'',categories:[]}})};
A.vendCatQuick=async(d,el)=>{const v=S.vendors.find(x=>x.id===d.v);if(!v) return;const cats=(v.categories||[]).filter(c=>c!==d.c);if(el.checked) cats.push(d.c);
  const ok=await run(()=>updDoc('vendors',v.id,{categories:cats}),el.checked?`${v.name}: ${catName(d.c)} assigned`:`${v.name}: ${catName(d.c)} removed`);if(ok===false){el.checked=!el.checked;render()}};
A.toggleVendCat=(d,el)=>{const a=ui.modal.d.categories||(ui.modal.d.categories=[]);const i=a.indexOf(d.c);if(el.checked&&i<0) a.push(d.c);if(!el.checked&&i>=0) a.splice(i,1);render()};
A.saveVendor=async()=>{const m=ui.modal;const v=m.d;if(!String(v.name||'').trim()){toast('Enter the vendor name.','err');return}
  const doc={name:v.name.trim(),gstin:(v.gstin||'').toUpperCase(),contact:v.contact||'',phone:v.phone||'',email:(v.email||'').trim(),city:v.city||'',address:v.address||'',payment:v.payment||'',rating:v.rating?+v.rating:'',categories:v.categories||[],at:v.at||Date.now()};if(v.sample) doc.sample=true;
  if(await run(()=>setDoc('vendors',m.id||newId(),doc),'Vendor saved')) closeModal()};
A.delVendor=()=>{const id=ui.modal.id;confirmBox({title:'Delete vendor',body:'Existing RFQs and POs keep the vendor name. The vendor is no longer offered for new RFQs.',yes:'Delete',danger:true,onYes:async()=>{if(await run(()=>delDoc('vendors',id),'Vendor deleted')) closeModal()}})};
function catDraft(){return ((S.config&&S.config.cats)||[]).map(c=>Object.assign({},c,{kwText:(c.kw||[]).join(', ')}))}
A.editCats=()=>openModal({type:'cats',d:{cats:catDraft()}});
A.catAdd=()=>{ui.modal.d.cats.push({id:'',name:'',kwText:'',photo:'',hidden:false,isNew:true});render();setTimeout(()=>{const el=document.getElementById('ce-n-'+(ui.modal.d.cats.length-1));el&&el.focus()},40)};
A.catRm=d=>{ui.modal.d.cats.splice(+d.i,1);render()};
function catsToSave(list){const out=[];const names=new Set(CATS.filter(c=>!c.custom).map(c=>norm(c.name)));
  for(const c of list){const name=String(c.name||'').trim();if(!name&&c.isNew) continue;if(!name) throw {message:'A category name is empty.'};
    if(names.has(norm(name))) throw {message:`There is already a category called “${name}”.`};names.add(norm(name));
    let id=c.id;if(!id){id='c-'+slug(name).slice(0,40);let n=2;while(CAT[id]&&!list.some(x=>x.id===id)||out.some(x=>x.id===id)) id='c-'+slug(name).slice(0,36)+'-'+(n++)}
    out.push({id,name,kw:String(c.kwText||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean),photo:c.photo||'',hidden:!!c.hidden,h:c.h!=null&&c.h!==''?+c.h:hash(id)%360})}
  return out}
A.saveCats=async()=>{let cats;try{cats=catsToSave(ui.modal.d.cats)}catch(e){toast(e.message,'err');return}
  if(await run(()=>updDoc('config','main',{cats}),'Categories saved')!==false) closeModal()};
A.quickCat=()=>{const keep=ui.modal;confirmBox({title:'New category',body:'<p>Add a category for items that do not fit the existing ones. You can add keywords and a picture later under Item catalogue → Categories.</p>',note:'Category name',yes:'Add category',
  onYes:async m=>{const name=String(m.noteVal||'').trim();if(!name){toast('Enter the category name.','err');return}let cats;try{cats=catsToSave(catDraft().concat({name,kwText:'',photo:'',hidden:false}))}catch(e){toast(e.message,'err');return}
    if(await run(()=>updDoc('config','main',{cats}),'Category “'+name+'” added')!==false){ui.modal=keep;keep.d.category=cats[cats.length-1].id;render()}}})};
A.editItem=d=>{const it=d.id?D.itemMap[d.id]:null;openModal({type:'item',id:d.id||null,std:!!(it&&it.std),d:it?{desc:it.desc,spec:it.spec||'',unit:it.unit||'Nos',category:it.category||'others',photo:it.photo||'',sizesText:(it.sizes||[]).join(', '),hidden:!!it.hidden,gst:it.gst??'',hsn:it.hsn||''}:{desc:'',spec:'',unit:'Nos',category:'pipes',photo:'',sizesText:'',hidden:false,gst:'',hsn:''}})};
A.saveItem=async()=>{const m=ui.modal,d=m.d;if(!String(d.desc).trim()){toast('Enter the item description.','err');return}const id=m.id||slug(d.desc);const gs=String(d.gst??'').trim();if(gs!==''&&!(num(gs)>=0&&num(gs)<=100)){toast('GST % must be between 0 and 100.','err');return}
  if(await run(()=>setDoc('catalog',id,{gst:gs===''?'':num(gs),hsn:String(d.hsn||'').trim(),desc:d.desc.trim(),spec:d.spec||'',unit:d.unit,category:d.category,photo:d.photo||'',sizes:String(d.sizesText||'').split(',').map(s=>s.trim()).filter(Boolean),hidden:!!d.hidden,at:Date.now()}),'Item saved')) closeModal()};
A.delItem=()=>{const id=ui.modal.id;confirmBox({title:'Delete item',body:'The item is removed from the catalogue. Past demands are not affected.',yes:'Delete',danger:true,onYes:async()=>{if(await run(()=>delDoc('catalog',id),'Item deleted')) closeModal()}})};
A.saveStore=async()=>{const st=Object.assign({},ui.draft.store);st.gstin=String(st.gstin||'').trim().toUpperCase();const e=gstinCheck(st.gstin);if(e){toast(e,'err');return}
  for(const k of ['name','legal','address1','address2','city','district','pin','contact','phone','email']) st[k]=String(st[k]||'').trim();
  if(!st.address1||!st.city){toast('Enter the full store address (address line 1 and city).','err');return}
  if(st.gstin&&!st.state) st.state=GST_STATES[st.gstin.slice(0,2)]||'';if(!st.state){toast('Choose the state.','err');return}
  if(st.pin&&!/^[1-9][0-9]{5}$/.test(st.pin)){toast('PIN code must be 6 digits.','err');return}
  if(st.gstin&&GST_STATES[st.gstin.slice(0,2)]&&GST_STATES[st.gstin.slice(0,2)]!==st.state){toast(`The GSTIN is registered in ${GST_STATES[st.gstin.slice(0,2)]}, but the state chosen is ${st.state}.`,'err');return}
  const cfg=Object.assign({},S.config,{store:st,storeAddress:addrText(st)});if(await run(()=>setDoc('config','main',cfg),'HQ store details saved')!==false){ui.draft.store=null;render()}};
A.saveConfig=async()=>{const d=Object.assign({},ui.draft.cfg);delete d.store;delete d.storeAddress;await run(()=>setDoc('config','main',Object.assign({},S.config,d)),'Company details saved')};

/* ================= EMAIL SETTINGS & BACKUP ================= */
async function saveSmtpDraft(){const d=ui.draft.smtp||{};ui.smtp=await api('/api/smtp',{host:d.host||'',port:d.port||'',security:d.security||'starttls',user:d.user||'',pass:d.pass||'',from:d.from||'',fromName:d.fromName||''});ui.draft.smtp.pass=''}
A.saveSmtp=async()=>{await run(saveSmtpDraft,'Email settings saved')};
A.testSmtp=async()=>{const r=await run(async()=>{await saveSmtpDraft();return api('/api/smtp/test',{})});if(r&&r.to) toast('Test email sent to '+r.to+'. Check that inbox.')};
A.backupNow=async()=>{const r=await run(()=>api('/api/backup/now',{}));if(r){ui.bk=r.status;toast(r.ok?'Backup saved: Excel, data copy and safety copy.':'Backup problem: '+r.error,r.ok?'':'err');render()}};
A.saveBackupConf=async()=>{const d=ui.draft.bk||{};const r=await run(()=>api('/api/backup/config',{dir:d.dir||'',email:d.email||'',emailHour:+d.hour||0}),'Backup settings saved');if(r){ui.bk=r.status;render();setTimeout(loadBackup,4000)}};
A.dlBackup=async()=>{toast('Preparing backup…');try{const r=await fetch('/api/backup',{credentials:'same-origin'});if(!r.ok) throw 0;saveFile('procurehub-backup-'+today()+'.zip',await r.blob())}catch(e){toast('Could not download the backup.','err')}};
CH.restoreFile=el=>{const f=el.files&&el.files[0];el.value='';if(!f) return;const isZip=/\.zip$/i.test(f.name)||f.type.includes('zip');
  confirmBox({title:'Restore backup',body:`Replace all current projects, vendors, demands, RFQs, POs, dispatches and stock with the contents of <b>${esc(f.name)}</b>? User logins and email settings are kept. A copy of the current data is saved in the backups folder first.`,typed:'RESTORE',yes:'Restore',danger:true,onYes:async()=>{
    const r=await run(async()=>{if(isZip){const res=await fetch('/api/restore',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/zip'},body:f});const j=await res.json().catch(()=>null);if(!res.ok) throw {message:(j&&j.error)||'Restore failed.'};return j}
      let data;try{data=JSON.parse(await f.text())}catch(e){throw {message:'That file is not a ProcureHub backup.'}}return api('/api/restore',data)});
    if(r){closeModal();toast(`${r.records} records restored${r.files?' with '+r.files+' photos':''}`)}}})};

/* ================= DOWNLOADS ================= */
A.dlDemand=()=>{const rows=[['MR no','Project code','Project','Raised','Required by','Priority','Requested by','Item','Specification','Category','Asked qty','Approved qty','Unit','Status','RFQ','PO','Vendor','Transfer','Received qty','Approval remark','Decided by']];
  for(const x of allLines().sort((a,b)=>(a.ind.at||0)-(b.ind.at||0))){const p=proj(x.ind.projectId)||{};rows.push([x.ind.no,p.code||'',p.name||'',x.ind.date,x.ind.requiredBy,x.ind.priority,x.ind.requestedBy||'',x.l.desc,x.l.spec||'',catName(x.l.category),x.l.qty,x.l.status==='approved'?needQty(x.l):'',x.l.unit,x.info.label,x.l.rfqNo||'',x.l.poNo||'',x.l.vendorName||'',x.l.transferNo||'',x.info.del,x.l.approvalNote||'',x.l.decidedByName||''])}
  saveXlsx('demand-register-'+today()+'.xlsx',[{name:'Demand register',rows}])};
A.dlPoRegister=()=>{const rows=[['PO no','Date','Vendor','RFQ','Delivery','Item','Specification','HSN','Category','Qty','Unit','Rate','GST %','GST amount','Amount excl GST','Amount incl GST','Received','Status']];
  for(const p of S.pos.slice().sort((a,b)=>(a.at||0)-(b.at||0))) for(const l of p.lines) rows.push([p.no,p.date,p.vendorName,p.rfqNo||'',delivLabel(p),l.desc,l.spec||'',l.hsn||'',catName(l.cat),l.qty,l.unit,l.rate,l.gst,Math.round(l.qty*l.rate*l.gst)/100,Math.round(l.qty*l.rate*100)/100,Math.round(l.qty*l.rate*(1+l.gst/100)*100)/100,poRecv(p,l.key),poStatus(p).label]);
  saveXlsx('po-register-'+today()+'.xlsx',[{name:'PO register',rows}])};
A.dlDispatch=()=>{const rows=[['Challan no','Type','From','To project','Date','PO','Vendor','Vehicle','LR','Item','Specification','Qty sent','Qty received','Unit','MR no','Status','Received on','Site remarks']];
  for(const d of S.dispatches.slice().sort((a,b)=>(a.at||0)-(b.at||0))) for(const l of d.lines) rows.push([d.no,d.type==='direct'?'Direct from vendor':d.type==='transfer'?'Site transfer':'From store',d.type==='transfer'?projLabel(d.fromProjectId):d.type==='direct'?d.vendorName:'Central store',projLabel(d.projectId),d.date,d.poNo||'',d.vendorName||'',d.vehicle||'',d.lrNo||'',l.desc,l.spec||'',l.qty,l.recvQty??'',l.unit,l.mrNo||'',dispStatus(d).label,d.receivedAt?msDate(d.receivedAt):'',d.siteRemarks||'']);
  saveXlsx('dispatch-register-'+today()+'.xlsx',[{name:'Dispatch register',rows}])};
function grnLineTax(g,l){if(l.rate!=null&&l.rate!=='') return {rate:num(l.rate),gst:num(l.gst),hsn:l.hsn||''};const po=g.poId&&S.pos.find(p=>p.id===g.poId);const pl=po&&(po.lines||[]).find(x=>x.key===l.key);
  return pl?{rate:num(pl.rate),gst:num(pl.gst),hsn:l.hsn||pl.hsn||itemHsn(l.desc)}:{rate:'',gst:'',hsn:l.hsn||itemHsn(l.desc)}}
A.dlInward=()=>{const si=storeInfo();const r2=x=>Math.round(x*100)/100;const rows=[['GRN no','GRN date','Type','PO no','Supplier','Supplier GSTIN','Supplier state code','Invoice no','Invoice date','Challan no','Received at','Store GSTIN','Item','Specification','HSN','Qty accepted','Unit','Rate (excl GST)','Taxable value','GST %','CGST','SGST','IGST','Total','Documents']];
  for(const g of S.grns.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.at||0)-(b.at||0))){const po=g.poId&&S.pos.find(p=>p.id===g.poId);const vg=String(g.partyGstin||(po&&(vend(po.vendorId)||{}).gstin)||'').toUpperCase();const bt=g.billTo||si;
    const intra=!vg||!bt.gstin||vg.slice(0,2)===String(bt.gstin).slice(0,2);
    for(const l of g.lines||[]){if(!(num(l.acc)>0)) continue;const t=grnLineTax(g,l);const tv=t.rate===''?'':r2(num(l.acc)*t.rate);const tax=tv===''?0:tv*num(t.gst)/100;
      rows.push([g.no,g.date,g.poNo?'Against PO':(INWARD_SRC[g.type]||'Inward'),g.poNo||'',g.vendorName||g.party||'',vg,vg.slice(0,2),g.invoice||'',g.invoiceDate||'',g.challan||'',bt.name||'HQ store',bt.gstin||'',l.desc,l.spec||'',t.hsn,num(l.acc),l.unit,t.rate,tv,t.gst,tv===''?'':intra?r2(tax/2):0,tv===''?'':intra?r2(tax/2):0,tv===''?'':intra?0:r2(tax),tv===''?'':r2(tv+tax),(g.photos||[]).length])}}
  saveXlsx('inward-register-gst-'+today()+'.xlsx',[{name:'Inward register',rows}])};
A.dlOutward=()=>{const rows=[['Document no','Kind','Invoice no','Date','Site code','Site / project','Bill to','Site GSTIN','Place of supply (state code)','From (HQ store GSTIN)','Item','Specification','HSN','Qty','Unit','Rate (excl GST)','Taxable value','GST %','CGST','SGST','IGST','Total','Status','Received on','Received by','Designation','Signed copy','Valuation']];
  for(const d of S.dispatches.filter(x=>x.type==='store'&&x.status!=='cancelled').sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.at||0)-(b.at||0))){const p=proj(d.projectId)||{};const to=d.to||siteBilling(p),from=d.from||storeInfo();
    const intra=d.intra!=null?d.intra:(!to.code||!from.code||to.code===from.code);const est=!d.totals;
    const ls=est?taxLines(d.lines.map(l=>{const t=itemTax(l.itemKey||itemKey(l.desc,l.spec,l.unit));return Object.assign({},l,{rate:num(t.rate),gst:num(t.gst),hsn:l.hsn||t.hsn})}),intra).lines:d.lines;
    for(const l of ls){const tax=num(l.tax);rows.push([d.no,d.kind==='invoice'?'Tax invoice':'Delivery challan',d.invoiceNo||'',d.date,p.code||'',p.name||'',to.name||'',to.gstin||'',to.code||'',from.gstin||'',l.desc,l.spec||'',l.hsn||'',num(l.qty),l.unit,num(l.rate),num(l.taxable),num(l.gst),intra?Math.round(tax*50)/100:0,intra?Math.round(tax*50)/100:0,intra?0:Math.round(tax*100)/100,Math.round((num(l.taxable)+tax)*100)/100,dispStatus(d).label,d.receivedOn||(d.receivedAt?msDate(d.receivedAt):''),d.receivedByName||'',d.receiverDesignation||'',(d.signedDocs||[]).length?'Yes':'No',est?'Older challan: valued at last purchase rate':'As issued'])}}
  saveXlsx('outward-register-gst-'+today()+'.xlsx',[{name:'Outward register',rows}])};
A.dlStock=()=>{const L=storeLedger();const rv=seeRates();const rows=[['Item','Specification','Category','Unit','Received','Sent to sites','In store','Demanded by site','Reserved for demands','Free','Last inward','Days in store',...(rv?['Value (Rs)']:[])]];
  for(const r of Object.values(L).sort((a,b)=>String(a.desc).localeCompare(b.desc))) rows.push([r.desc,r.spec||'',catName(r.cat),r.unit,r.inQ,r.outQ,r.bal,r.forSites.map(x=>projName(x.p)+' '+x.q+(x.mrs.length?' ('+x.mrs.join(', ')+')':'')).join('; ')||(r.bal>0?'Free stock':''),r.reserved,r.free,r.lastIn,r.age??'',...(rv?[Math.round(r.value)]:[])]);
  const led=[['Item','Specification','Unit','Date','Document','Details','In','Out','Balance']];for(const r of Object.values(L)) for(const e of r.ent) led.push([r.desc,r.spec||'',r.unit,e.d,e.no||'',e.what,e.inQ||'',e.outQ||'',e.bal]);
  saveXlsx('hq-store-stock-'+today()+'.xlsx',[{name:'HQ store stock',rows},{name:'In and out register',rows:led}])};
A.dlSiteStock=()=>{const rows=[['Project code','Project','Item','Specification','Category','Unit','Opening / added','Received','Sent to other sites','Issued','Damaged / lost','Returned to store','Count corrections','Balance','Minimum level','Status','Value']];for(const p in D.site) for(const r of Object.values(D.site[p])) rows.push([projCode(p),projLabel(p),r.desc,r.spec||'',catName(r.cat),r.unit,r.open,r.recv,r.out,r.used,r.dmg,r.ret,r.adj,r.bal,r.min||'',stockStatus(r).label,Math.round(r.value)]);saveXlsx('site-stock-'+today()+'.xlsx',[{name:'Site stock',rows}])};

/* ================= SAMPLE DATA ================= */
A.loadSample=()=>confirmBox({title:'Load sample data',body:'Adds 5 example projects, 8 example vendors, 7 site demands, one RFQ with quotes and some site stock — all marked as samples so you can remove them later from Settings.',yes:'Load samples',onYes:async()=>{ui.modal=null;await run(loadSample,'Sample data loaded');go('dashboard')}});
async function loadSample(){
  const P=[['WS-BTI','AMRUT 2.0 Water Supply, Bathinda','Water Supply','Bathinda','Punjab','Municipal Corporation Bathinda'],['SW-LDH','Sewerage Network Phase II, Ludhiana','Sewerage','Ludhiana','Punjab','PWSSB'],['JJM-JPR','JJM Rural Water Supply Package 4, Jaipur','Jal Jeevan Mission','Jaipur','Rajasthan','PHED Rajasthan'],['WS-NGP','24x7 Water Supply Zone 3, Nagpur','Water Supply','Nagpur','Maharashtra','Nagpur Municipal Corporation'],['STP-VNS','30 MLD STP and Trunk Sewer, Varanasi','STP','Varanasi','Uttar Pradesh','UP Jal Nigam']];
  const pid={};for(const [code,name,scheme,city,state,client] of P){const id='smp-'+code.toLowerCase();pid[code]=id;await setDoc('projects',id,{code,name,scheme,city,state,client,siteContact:'Site Engineer (sample)',phone:'',address:`Project site office, ${city}, ${state}`,photo:'',active:true,sample:true,at:Date.now()})}
  const V=[['Shree Balaji Pipes & Tubes',['pipes','fittings'],'Ludhiana','30 days credit',4],['Narmada Polymers',['pipes','fittings'],'Ahmedabad','Advance 20%, balance on delivery',4],['Ganga Flow Controls',['valves','fittings','meters'],'Kolkata','45 days credit',5],['Sunrise Paints Agency',['paints','chemicals'],'Delhi','30 days credit',3],['Om Hardware & Fasteners',['hardware','tools','chemicals'],'Ludhiana','15 days credit',4],['SafeGuard PPE Suppliers',['safety'],'Mumbai','30 days credit',4],['Kirti Industrial Tools',['tools','electrical','pumps'],'Jaipur','Against delivery',3],['Vardhman Civil Traders',['civil','sewer'],'Varanasi','15 days credit',4]];
  const vid=[];let i=0;for(const [name,categories,city,payment,rating] of V){const id='smp-v'+(++i);vid.push(id);await setDoc('vendors',id,{name,categories,city,payment,rating,contact:'Sales desk (sample)',phone:'',email:'',gstin:'',address:city,sample:true,at:Date.now()})}
  const t=today();
  const mk=(desc,size,qty,status)=>{const s=STD[slug(desc)];const spec=[size,s?s.spec:''].filter(Boolean).join(', ');const l={id:newId(),desc,spec,qty,unit:s?s.unit:'Nos',category:s?s.category:classify(desc,size).cat,catSrc:'catalog',siteNote:'',photo:'',status:status||'approved'};if(l.status==='approved'){l.approvedQty=qty;l.approvedAt=Date.now()-86400000}return l};
  const I=[
    ['WS-BTI',-6,4,'Urgent','Er. Gurpreet Singh',[mk('DI K7 pipe','200 mm',360),mk('DI double flanged tee','200 mm',6),mk('Sluice valve','200 mm',4),mk('Rubber gasket push-on','200 mm',70),mk('Safety helmet','Yellow',40)]],
    ['SW-LDH',-5,10,'Normal','Er. Rajesh Mehta',[mk('DWC pipe SN8','400 mm',600),mk('RCC NP3 pipe','600 mm',120),mk('Manhole cover FRP','560 mm',25),mk('Reflective jacket','Orange',60)]],
    ['JJM-JPR',-4,7,'Normal','Er. Anil Sharma',[mk('HDPE pipe PE100 PN10','110 mm',1500),mk('HDPE electrofusion coupler','110 mm',80),mk('Water meter','15 mm',200),mk('Pipe wrench','18 inch',6)]],
    ['WS-NGP',-3,-1,'Critical','Er. Sunil Deshmukh',[mk('DI K7 pipe','200 mm',240),mk('Butterfly valve','300 mm',2),mk('Epoxy paint food grade','20 L',12),mk('MS bolts and nuts','M16 x 75',400)]],
    ['STP-VNS',-2,12,'Normal','Er. Vivek Tripathi',[mk('Cement OPC 53 grade','',800),mk('TMT bar Fe500D','12 mm',6),mk('Safety shoes','8',50),mk('Dewatering pump','5 HP',2)]],
    ['WS-BTI',-1,8,'Normal','Er. Gurpreet Singh',[mk('uPVC pipe 6 kg/cm²','110 mm',300,'pending'),mk('Solvent cement','1 L',10,'pending'),mk('Barricade tape','',20,'pending')]],
    ['JJM-JPR',0,6,'Urgent','Er. Anil Sharma',[mk('HDPE pipe PE100 PN10','90 mm',900,'pending'),mk('Ball valve','50 mm',30,'pending'),mk('Nitrile gloves','',100,'pending')]],
  ];
  const created=[];
  for(const [code,dd,rq,prio,by,lines] of I){const no=await allocNo('MR',S.indents.concat(created));const id='smp-'+newId();
    const doc={no,projectId:pid[code],date:addDays(t,dd),requiredBy:addDays(t,rq),priority:prio,requestedBy:by,remarks:'Sample requisition',createdBy:null,createdByName:by,at:Date.now()+dd*86400000,lines,sample:true};await setDoc('indents',id,doc);created.push(Object.assign({id},doc))}
  const keys=[];for(const ind of created.slice(0,4)) for(const l of ind.lines) if(['pipes','fittings'].includes(l.category)&&ind.projectId!==pid['JJM-JPR']&&l.status==='approved') keys.push(ind.id+'|'+l.id);
  const rl=buildRfqLines(keys);const rates1={},rates2={};const base={'di k7 pipe':2650,'di double flanged tee':6800,'dwc pipe sn8':1420,'rcc np3 pipe':2350};
  for(const l of rl){const b=base[norm(l.desc)]||1000;rates1[l.key]=Math.round(b);rates2[l.key]=Math.round(b*(l.key==='L1'?1.04:0.96))}
  await createRfq({lines:rl,vendorIds:[vid[0],vid[1]],dueDate:addDays(t,2),deliveryMode:'store',notes:'Sample RFQ'},{sample:true,status:'sent',quotes:{[vid[0]]:{rates:rates1,gst:18,freight:15000,deliveryDays:10,payment:'30 days credit',validity:'30 days',remarks:'',at:Date.now()},[vid[1]]:{rates:rates2,gst:18,freight:22000,deliveryDays:14,payment:'Advance 20%',validity:'15 days',remarks:'',at:Date.now()}}});
  const op=(code,desc,size,qty)=>{const s=STD[slug(desc)];const spec=[size,s?s.spec:''].filter(Boolean).join(', ');const unit=s?s.unit:'Nos';return setDoc('sitelog','smp-'+newId(),{projectId:pid[code],type:'opening',itemKey:itemKey(desc,spec,unit),desc,spec,unit,cat:s?s.category:'others',qty,date:addDays(t,-20),location:'Site store',remarks:'Sample opening stock',at:Date.now()-20*86400000,sample:true,createdByName:'Sample'})};
  await op('STP-VNS','Safety helmet','Yellow',60);await op('STP-VNS','Reflective jacket','Orange',35);await op('WS-NGP','Rubber gasket push-on','200 mm',120);await op('SW-LDH','Cement OPC 53 grade','',140);
}
A.clearSample=()=>confirmBox({title:'Remove sample data',body:'Deletes every project, vendor, demand, RFQ and stock entry marked as a sample, plus POs, GRNs and dispatches made from them.',yes:'Remove samples',danger:true,onYes:async()=>{ui.modal=null;await run(async()=>{
  const sp=new Set(S.projects.filter(p=>p.sample).map(p=>p.id));const sr=new Set(S.rfqs.filter(r=>r.sample).map(r=>r.id));
  const pos=S.pos.filter(p=>sr.has(p.rfqId));const spo=new Set(pos.map(p=>p.id));
  for(const d of S.dispatches) if(sp.has(d.projectId)||sp.has(d.fromProjectId)||spo.has(d.poId)) await delDoc('dispatches',d.id);
  for(const g of S.grns) if(spo.has(g.poId)) await delDoc('grns',g.id);
  for(const p of pos) await delDoc('pos',p.id);
  for(const r of S.rfqs) if(r.sample) await delDoc('rfqs',r.id);
  for(const e of S.sitelog) if(e.sample||sp.has(e.projectId)) await delDoc('sitelog',e.id);
  for(const i of S.indents) if(i.sample||sp.has(i.projectId)) await delDoc('indents',i.id);
  for(const v of S.vendors) if(v.sample) await delDoc('vendors',v.id);
  for(const p of S.projects) if(p.sample) await delDoc('projects',p.id);
},'Sample data removed');render()}});
A.wipeAll=()=>confirmBox({title:'Delete all data',body:'Permanently deletes every project, vendor, demand, RFQ, PO, GRN, dispatch, stock entry and catalogue change. User logins are kept. This cannot be undone.',typed:'DELETE',yes:'Delete everything',danger:true,onYes:async()=>{ui.modal=null;await run(async()=>{
  for(const [col,arr] of [['dispatches',S.dispatches],['grns',S.grns],['pos',S.pos],['rfqs',S.rfqs],['sitelog',S.sitelog],['indents',S.indents],['vendors',S.vendors],['projects',S.projects],['catalog',S.catalogList]]) for(const x of arr) await delDoc(col,x.id)},'All data deleted');render()}});

/* ================= EVENTS ================= */
async function handleUpload(el){
  const files=[...el.files];el.value='';if(!files.length) return;await uploadTo(el.dataset.upload,files,el.dataset.multi==='1',el.dataset.png==='1')}
async function uploadTo(path,files,multi,png){
  ui.uploading++;render();
  try{for(const f of (multi?files:files.slice(0,1))){const id=await uploadFile(f,{png,max:png?800:1600});if(multi){const cur=getPath(path);setPath(path,(Array.isArray(cur)?cur:[]).concat(id))}else setPath(path,id)}}
  catch(e){toast(errMsg(e),'err')}finally{ui.uploading--;render()}
}
document.addEventListener('dragover',e=>{const z=e.target.closest&&e.target.closest('[data-drop]');if(z){e.preventDefault();z.classList.add('over')}});
document.addEventListener('dragleave',e=>{const z=e.target.closest&&e.target.closest('[data-drop]');if(z) z.classList.remove('over')});
document.addEventListener('drop',e=>{const z=e.target.closest&&e.target.closest('[data-drop]');if(!z) return;e.preventDefault();z.classList.remove('over');const files=[...(e.dataTransfer&&e.dataTransfer.files||[])];if(files.length) uploadTo(z.dataset.drop,files,z.dataset.multi==='1',false)});
document.addEventListener('click',e=>{
  if(ui.pop&&!e.target.closest('.pop-wrap,.search')){ui.pop=null;schedule()}
  const el=e.target.closest('[data-act]');if(!el) return;
  // The modal backdrop only reacts to clicks on the backdrop itself. Clicks on labels, tick
  // boxes and text inside a pop-up must keep their normal browser behaviour.
  if(el.dataset.act==='bgClose'&&e.target!==el) return;
  if(el.tagName==='A'&&el.getAttribute('href')==='#'){e.preventDefault();toast('Add a phone number for this vendor first.','err');return}
  const fn=A[el.dataset.act];if(!fn) return;
  if(!actOk(el.dataset.act)||(el.dataset.act==='go'&&ui.role==='hq'&&!viewAllowed(el.dataset.v))){e.preventDefault();toast('You don\'t have permission for this. Ask your administrator.','err');return}
  if(el.tagName!=='A'&&el.type!=='checkbox'&&el.type!=='radio'&&el.tagName!=='LABEL') e.preventDefault();
  fn(el.dataset,el,e);
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(ui.modal){if(ui.modal.type==='photo'&&ui.modal.prev){ui.modal=ui.modal.prev;render()}else closeModal();return}if(ui.pop||ui.drawer||ui.cartOpen){ui.pop=null;ui.drawer=false;ui.cartOpen=false;render();return}}
  if(e.key==='/'&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)&&!ui.modal){const s=document.getElementById('f-search');if(s){e.preventDefault();s.focus()}}
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-act]:not(button):not(a):not(input):not(label)')){e.preventDefault();e.target.click()}
});
document.addEventListener('focusin',e=>{const p=e.target.dataset&&e.target.dataset.focusPop;if(p&&ui.pop!==p){ui.pop=p;schedule()}});
document.addEventListener('input',e=>{
  const el=e.target;if(!el.dataset||!el.dataset.bind) return;
  setPath(el.dataset.bind,el.type==='checkbox'?el.checked:el.value);
  if(el.dataset.mclassify&&ui.modal&&ui.modal.d){const d=ui.modal.d;if(!d.catManual){const c=classify(d.desc,d.spec);d.category=c.cat;d.catSrc=String(d.desc).trim()?c.src:'none'}const it=D.itemMap[slug(d.desc)];if(it&&it.unit) d.unit=it.unit;schedule()}
  if(el.dataset.bind==='q'&&ui.pop!=='search') ui.pop='search';
  if(el.dataset.rerender) schedule();
});
document.addEventListener('change',e=>{
  const el=e.target;if(!el.dataset) return;
  if(el.dataset.upload){handleUpload(el);return}
  if(el.dataset.bind&&(el.tagName==='SELECT'||el.type==='checkbox')){setPath(el.dataset.bind,el.type==='checkbox'?el.checked:el.value);if(el.dataset.mcat&&ui.modal) ui.modal.d.catManual=true;if(el.dataset.rerender||el.tagName==='SELECT') schedule()}
  const h=el.dataset.actChange;if(h&&CH[h]){if(!actOk(h)){toast('You don\'t have permission for this.','err');return}CH[h](el)}
});
document.addEventListener('submit',e=>{const f=e.target;if(f.dataset&&f.dataset.submit&&A[f.dataset.submit]){e.preventDefault();A[f.dataset.submit]()}});
// start once every script (including the add-on files after this one) has loaded
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
