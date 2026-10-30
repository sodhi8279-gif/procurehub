"use strict";
/* ================= UTILITIES ================= */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{const n=parseFloat(String(v??'').replace(/,/g,''));return isFinite(n)?n:0};
const nf=new Intl.NumberFormat('en-IN',{maximumFractionDigits:2});
const nf0=new Intl.NumberFormat('en-IN',{maximumFractionDigits:0});
const fq=n=>nf.format(n||0);
const money=n=>'₹'+nf.format(Math.round((n||0)*100)/100);
const money0=n=>'₹'+nf0.format(Math.round(n||0));
const lakh=n=>{n=n||0;if(n>=1e7) return '₹'+(n/1e7).toFixed(2)+' Cr';if(n>=1e5) return '₹'+(n/1e5).toFixed(2)+' L';return money0(n)};
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function today(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
function addDays(iso,n){const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)}
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function fd(iso){if(!iso) return '—';const p=String(iso).slice(0,10).split('-');if(p.length<3) return esc(iso);return `${+p[2]} ${MON[+p[1]-1]} ${p[0]}`}
function fdLong(iso){const d=new Date(iso+'T00:00:00');return `${DAYS[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`}
function fdt(ms){if(!ms) return '—';const d=new Date(ms);return `${d.getDate()} ${MON[d.getMonth()]}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
const msDate=ms=>{const d=new Date(ms);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
function timeAgo(ms){if(!ms) return '';const s=(Date.now()-ms)/1000;if(s<60) return 'just now';if(s<3600) return Math.floor(s/60)+' min ago';if(s<86400) return Math.floor(s/3600)+' h ago';const d=Math.floor(s/86400);return d===1?'yesterday':d<30?d+' days ago':fd(msDate(ms))}
function daysFrom(iso){if(!iso) return 0;return Math.round((new Date(iso+'T00:00:00')-new Date(today()+'T00:00:00'))/864e5)}
function norm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function slug(s){return (norm(s).replace(/ /g,'-').slice(0,120))||'item'}
function itemKey(d,s,u){return norm(d)+'|'+norm(s)+'|'+String(u||'').toLowerCase()}
function fy(){const d=new Date();const y=d.getFullYear()%100;return d.getMonth()>=3?`${y}-${y+1}`:`${y-1}-${y}`}
function hash(s){let h=7;for(const c of String(s)) h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)}
const sum=(a,f)=>{let t=0;for(const x of a) t+=f?f(x):x;return t};
function inWords(n){
  n=Math.round((n||0)*100)/100;const r=Math.floor(n),p=Math.round((n-r)*100);
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two=x=>x<20?a[x]:b[Math.floor(x/10)]+(x%10?' '+a[x%10]:'');
  const three=x=>{const h=Math.floor(x/100),t=x%100;return (h?a[h]+' Hundred'+(t?' ':''):'')+(t?two(t):'')};
  const w=x=>{if(x===0) return 'Zero';const o=[];const cr=Math.floor(x/1e7);x%=1e7;const l=Math.floor(x/1e5);x%=1e5;const th=Math.floor(x/1000);x%=1000;
    if(cr) o.push(w(cr)+' Crore');if(l) o.push(two(l)+' Lakh');if(th) o.push(two(th)+' Thousand');if(x) o.push(three(x));return o.join(' ')};
  return 'Rupees '+w(r)+(p?' and '+two(p)+' Paise':'')+' Only';
}
function csv(rows){return rows.map(r=>r.map(c=>{const s=String(c??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\n')}
const initials=s=>String(s||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const firstName=s=>String(s||'').trim().split(/\s+/)[0]||'';

/* ================= CATEGORIES & CATALOGUE ================= */
const catName=id=>(CAT[id]||CAT.others).name;
const catH=id=>(CAT[id]||CAT.others).h;
function catSw(id){return `<span class="cat"><span class="cat-ic tint" style="--h:${catH(id)}">${ART.cat(id)}</span><span>${esc(catName(id))}</span></span>`}
const STD=Object.fromEntries(STD_ITEMS.map(i=>{const id=slug(i.desc);return [id,{id,desc:i.desc,unit:i.unit,sizes:i.sizes,spec:i.spec,category:i.cat,std:true}]}));
function catalogItems(){const m={};for(const k in STD) m[k]=Object.assign({},STD[k]);for(const c of S.catalogList){m[c.id]=Object.assign({},m[c.id]||{},c,{std:!!STD[c.id]})}return Object.values(m).filter(x=>x.desc)}
function classify(desc,spec){
  const c=D.itemMap&&D.itemMap[slug(desc)];if(c&&c.category&&!c.hidden) return {cat:c.category,src:'catalog'};
  const t=' '+norm(desc+' '+(spec||''))+' ';let best='others',bs=0;
  for(const cat of CATS){let s=0;for(const k of cat.kw){const nk=norm(k);if(t.includes(' '+nk+' ')||t.includes(' '+nk+'s ')||t.includes(' '+nk+'es ')) s+=nk.split(' ').length+(cat.boost||0)}if(s>bs){bs=s;best=cat.id}}
  return {cat:best,src:bs?'auto':'none'};
}
function thumb(o,cls=''){const cat=o.category||o.cat||'others';const it=o.desc&&D.itemMap&&D.itemMap[slug(o.desc)];const ph=o.photo||(it&&it.photo);return `<span class="thumb ${cls}">${ph?`<img src="/files/${esc(ph)}" alt="" loading="lazy">`:ART.item(o.desc,cat)}</span>`}
function lineThumb(l,cls=''){const it=D.itemMap&&D.itemMap[slug(l.desc)];return thumb({category:l.category||l.cat||(it&&it.category),photo:l.photo||(it&&it.photo),desc:l.desc},cls)}
const schemeKind=s=>({'Sewerage':'sewer','Storm Water':'sewer','STP':'stp','WTP':'stp','Jal Jeevan Mission':'jjm'})[s]||'water';
function cover(p,cls=''){if(p&&p.photo) return `<img class="cover-img ${cls}" src="/files/${esc(p.photo)}" alt="" loading="lazy">`;return ART.scene(schemeKind(p&&p.scheme),(hash(p&&p.id||'x')%3)+1,'cover-img '+cls)}

/* ================= HQ ROLES & PERMISSIONS ================= */
const PERM_GROUPS=[
 ['Demands',[['demands_view','See site demands','Demand inbox and every requisition from the sites this person can see'],['demands_precheck','Pre-check demands','Check new site demands first: edit items and quantities, delete a demand, or pre-approve it for the approver'],['demands_approve','Approve demands','Approve, change quantities, hold or reject demand lines'],['raise_demand','Raise demands for sites','Create requisitions on behalf of a site']]],
 ['Quotations & purchase orders',[['rfq_create','Call for quotations','Create RFQs from the procurement queue and send them to vendors'],['quotes_enter','Upload quotations','Enter or paste vendor rates and attach quotation copies'],['compare_approve','Approve comparative','Award lines to vendors and approve the comparative statement'],['po_issue','Issue purchase orders','Generate, email and cancel purchase orders'],['po_approve','Approve purchase orders','Director (Procurement): approve and sign purchase orders before they can be sent to vendors'],['rates_view','See rates and values','Vendor rates, PO values and stock value. Always on for anyone who uploads quotes, approves, issues POs or sees reports']]],
 ['Store & site stock',[['store','HQ store & dispatch','Inward at HQ store (GRN), store stock, dispatch challans to sites and transfers between sites'],['sitestock_view','See site stock','Stock registers of the sites this person can see'],['sitestock_edit','Change site stock','Add stock, issues, counts and minimum levels for sites']]],
 ['Masters, reports & settings',[['masters_projects','Projects','Add and edit projects'],['masters_vendors','Vendors','Add and edit vendors and the materials they supply'],['masters_items','Item catalogue','Edit items, sizes and pictures'],['reports','Reports & Excel download','Spend reports, registers and full data download'],['settings','Company, email & backup settings','Everything in Settings except users and logins']]],
];
const PERM_LABEL=Object.fromEntries(PERM_GROUPS.flatMap(g=>g[1]).map(p=>[p[0],p[1]]));
const ROLE_PRESETS=[
 ['Purchase manager','Runs procurement end to end: approves demands, quotations, comparatives and POs',['demands_view','demands_approve','raise_demand','rfq_create','quotes_enter','compare_approve','po_issue','rates_view','sitestock_view','masters_vendors','masters_items','reports']],
 ['Purchase executive','Calls for quotations and uploads vendor quotes. Cannot approve or issue POs',['demands_view','rfq_create','quotes_enter','rates_view','masters_vendors']],
 ['Store keeper','Receives material at the central store and dispatches it to sites',['demands_view','store','sitestock_view']],
 ['Site coordinator','Follows site demands and stock, raises demands for sites',['demands_view','raise_demand','sitestock_view','sitestock_edit']],
 ['Accounts / auditor','Sees everything including rates and reports. Cannot change anything',['demands_view','rates_view','sitestock_view','reports']],
 ['Demand pre-checker','Checks new site demands, corrects or deletes them, and pre-approves them for the approver',['demands_view','demands_precheck','sitestock_view']],
 ['Director (Procurement)','Approves and signs purchase orders before they go to vendors; sees demands, rates and reports',['po_approve','demands_view','rates_view','reports','sitestock_view']],
 ['Viewer','Sees site demands and site stock only',['demands_view','sitestock_view']],
];
const seeRates=()=>can('rates_view');
const isAdm=()=>!!(ui.me&&ui.me.role==='hq'&&ui.me.admin);
function can(p){const me=ui.me;if(!me||me.role!=='hq') return false;if(me.admin) return p!=='demands_precheck'&&p!=='po_approve'&&p!=='consume_auth';const ps=(me.access&&me.access.perms)||[];if(ps.includes(p)) return true;if(p==='rates_view') return ['quotes_enter','compare_approve','po_issue','po_approve','reports'].some(x=>ps.includes(x));return false}
const permOk=p=>p==='__admin'?isAdm():can(p);
const VIEW_PERM={precheck:['demands_precheck','__admin'],demands:['demands_view','demands_approve'],indent:['demands_view','demands_approve','demands_precheck'],queue:['rfq_create','store','po_issue','demands_approve'],rfqs:['rfq_create','quotes_enter','compare_approve','rates_view'],rfq:['rfq_create','quotes_enter','compare_approve','rates_view'],pos:['po_issue','po_approve','rates_view','store'],po:['po_issue','po_approve','rates_view','store'],grn:['store'],dispatch:['store'],jobwork:['store','po_issue','rates_view'],sitestock:['sitestock_view','sitestock_edit'],projects:['masters_projects','sitestock_view','demands_view'],vendors:['masters_vendors','rfq_create'],items:['masters_items'],reports:['reports'],settings:['settings','__admin'],s_new:['raise_demand'],done:['raise_demand']};
function viewAllowed(v){if(!ui.me||ui.me.role!=='hq'||ui.role!=='hq') return true;const ps=VIEW_PERM[v];return !ps||ps.some(permOk)}
const ACT_PERM={pcSave:'demands_precheck',pcPass:'demands_precheck',pcDelete:'demands_precheck',pcRm:'demands_precheck',pcAdd:'demands_precheck',savePrecheckSetting:'settings',approveAllPending:'demands_approve',lineStatus:'demands_approve',approveIndent:'demands_approve',hqRemark:'demands_approve',setLineCat:'demands_approve',
 newRfq:'rfq_create',rfqForCat:'rfq_create',selCat:'rfq_create',toggleSel:'rfq_create',mailRfq:'rfq_create',mailRfqAll:'rfq_create',logSend:'rfq_create',copyRfq:'rfq_create',addRfqVendor:'rfq_create',cancelRfq:'rfq_create',
 enterQuote:'quotes_enter',pasteRates:'quotes_enter',gstAll:'quotes_enter',editPoGst:'po_issue',savePoGst:'po_issue',saveQuote:'quotes_enter',delQuote:'quotes_enter',
 award:'compare_approve',awardL1:'compare_approve',awardVendor:'compare_approve',approveRfq:'compare_approve',unapproveRfq:'compare_approve',
 genPOs:'po_issue',mailPo:'po_issue',cancelPo:'po_issue',dlComparative:'rates_view',dlPo:'rates_view',printPo:'rates_view',dlPoRegister:'rates_view',
 issueStock:'store',inwardPick:'store',inwardOther:'store',saveInward:'store',grnDocs:'store',saveGrnDocs:'store',freeChallan:'store',saveFreeChallan:'store',poDelivery:'po_issue',savePoDelivery:'po_issue',newTransfer:'store',recordGrn:'store',saveGrn:'store',openingStock:'store',saveOpening:'store',newChallan:'store',saveChallan:'store',markShipped:'store',saveShipped:'store',cancelDispatch:'store',printChallan:'store',dlStock:'store',dlDispatch:'store',
 editProject:'masters_projects',saveProject:'masters_projects',editVendor:'masters_vendors',vendCatQuick:'masters_vendors',saveVendor:'masters_vendors',delVendor:'masters_vendors',editItem:'masters_items',editCats:'masters_items',saveCats:'masters_items',catAdd:'masters_items',catRm:'masters_items',quickCat:'masters_items',saveItem:'masters_items',delItem:'masters_items',
 siteLog:'sitestock_edit',saveSiteLog:'sitestock_edit',stockCount:'sitestock_edit',saveCount:'sitestock_edit',saveMin:'sitestock_edit',delSiteLog:'sitestock_edit',reorderLow:'raise_demand',dlSiteStock:'sitestock_view',dlProjStock:'sitestock_view',
 dlDemand:'demands_view',dlInward:'rates_view',dlOutward:'rates_view',
 newSiteLogin:'__admin',resetLogin:'__admin',bulkLogins:'__admin',editUser:'__admin',saveUser:'__admin',delUser:'__admin',loadSample:'__admin',clearSample:'__admin',wipeAll:'__admin',restoreFile:'__admin',loadAudit:'__admin',
 saveConfig:'settings',saveStore:'settings',saveSmtp:'settings',testSmtp:'settings',backupNow:'settings',saveBackupConf:'settings',dlBackup:'settings'};
const actOk=a=>{if(!ui.me||ui.me.role!=='hq'||!ACT_PERM[a]) return true;const p=ACT_PERM[a];return Array.isArray(p)?p.some(permOk):permOk(p)};
function applyPerms(root){if(!ui.me||ui.me.role!=='hq'||isAdm()) return;
  root.querySelectorAll('[data-act],[data-act-change]').forEach(el=>{const a=el.dataset.act||el.dataset.actChange;if(a==='go'?viewAllowed(el.dataset.v):actOk(a)) return;
    if(el.tagName==='TD'||el.tagName==='TR'||(a==='go'&&el.matches('.kpi,.flow-st,.li,.pop-n'))){el.style.cursor='default';el.removeAttribute('data-act');el.classList.remove('cs-cell');el.removeAttribute('title')}
    else if(el.tagName==='INPUT'||el.tagName==='SELECT'){el.disabled=true;if(el.id){const lb=root.querySelector(`label.btn[for="${el.id}"]`);if(lb) lb.remove()}}
    else el.remove()})}
function accessSummary(u){if(!u||u.role!=='hq') return 'Site · '+projCode(u&&u.projectId);if(u.admin) return 'Administrator';const a=u.access||{};return (a.role||'Custom')+' · '+((a.projects||[]).length?(a.projects.length+' site'+(a.projects.length>1?'s':'')):'all sites')}

/* ================= GST & BILLING ================= */
const GST_STATES={'01':'Jammu & Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh','05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh','10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur','15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal','20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat','26':'Dadra & Nagar Haveli and Daman & Diu','27':'Maharashtra','29':'Karnataka','30':'Goa','31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu','34':'Puducherry','35':'Andaman & Nicobar Islands','36':'Telangana','37':'Andhra Pradesh','38':'Ladakh','97':'Other Territory'};
const stateCode=name=>{const n=norm(name||'').replace(/&/g,'and');for(const [c,v] of Object.entries(GST_STATES)) if(norm(v).replace(/&/g,'and')===n) return c;return ''};
function gstinCheck(g){g=String(g||'').trim().toUpperCase();if(!g) return '';if(!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return 'A GSTIN has 15 characters: 2-digit state code, 10-character PAN, then 3 more characters.';
  if(!GST_STATES[g.slice(0,2)]&&g.slice(0,2)!=='28'&&g.slice(0,2)!=='25') return 'The first two digits of the GSTIN are not a valid state code.';
  const cs='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';let sum=0;for(let i=0;i<14;i++){const p=cs.indexOf(g[i])*(i%2?2:1);sum+=Math.floor(p/36)+p%36}
  return cs[(36-sum%36)%36]===g[14]?'':'The last character of the GSTIN does not match (check digit). Please check for a typing mistake.'}
const addrText=a=>[a.address1,a.address2,[a.city,a.district].filter(Boolean).join(', '),[a.state,a.pin].filter(Boolean).join(' - ')].filter(x=>String(x||'').trim()).join('\n');
// The HQ store as a GST-registered place of business (entered in Settings).
function storeInfo(){const c=S.config||{};const st=c.store||{};const gstin=String(st.gstin||c.gstin||'').toUpperCase();const state=st.state||(gstin?GST_STATES[gstin.slice(0,2)]:'')||'';
  return {name:st.name||'Central Store',legal:st.legal||company(),gstin,state,code:gstin?gstin.slice(0,2):stateCode(state),address:addrText(st)||c.storeAddress||c.hqAddress||'',contact:st.contact||'',phone:st.phone||'',email:st.email||'',set:!!(st.gstin&&addrText(st))}}
// A site as the receiver of HQ's bill.
function siteBilling(p){p=p||{};const gstin=String(p.gstin||'').toUpperCase();const state=p.state||(gstin?GST_STATES[gstin.slice(0,2)]:'')||'';
  return {name:p.billName||p.name||'',gstin,state,code:gstin?gstin.slice(0,2):stateCode(state),address:[p.address||p.city||'',p.pin?'PIN '+p.pin:''].filter(Boolean).join('\n')}}
// Same GSTIN (or site without its own GSTIN) = stock movement on a delivery challan; different GSTIN = tax invoice.
function outwardKind(projectId){const s=storeInfo(),b=siteBilling(proj(projectId));return b.gstin&&s.gstin&&b.gstin!==s.gstin?'invoice':'challan'}
// Default value of an item going out of the store: last purchase rate, GST and HSN.
function itemTax(k){let best=null;for(const p of S.pos){if(p.status==='cancelled') continue;for(const l of p.lines||[]){const ik=l.itemKey||itemKey(l.desc,l.spec,l.unit);if(ik===k&&(!best||(p.at||0)>best.at)) best={rate:num(l.rate),gst:num(l.gst),hsn:l.hsn||'',at:p.at||0}}}
  for(const g of S.grns) for(const l of g.lines||[]) if((l.itemKey===k)&&l.rate!=null&&l.rate!==''&&(!best||(g.at||0)>best.at)) best={rate:num(l.rate),gst:num(l.gst),hsn:l.hsn||'',at:g.at||0};
  const desc=k.split('|')[0];return {rate:best?best.rate:'',gst:best?best.gst:(itemGst(desc)??18),hsn:(best&&best.hsn)||itemHsn(desc)||''}}
function taxLines(lines,intra){let taxable=0,cgst=0,sgst=0,igst=0;const out=lines.map(l=>{const t=num(l.qty)*num(l.rate);const g=t*num(l.gst)/100;taxable+=t;if(intra){cgst+=g/2;sgst+=g/2}else igst+=g;return Object.assign({},l,{taxable:t,tax:g})});const r=x=>Math.round(x*100)/100;
  return {lines:out,taxable:r(taxable),cgst:r(cgst),sgst:r(sgst),igst:r(igst),total:r(taxable+cgst+sgst+igst)}}

/* ================= STATE ================= */
const S={projects:[],vendors:[],indents:[],rfqs:[],pos:[],grns:[],dispatches:[],sitelog:[],stocklvl:[],jobwork:[],mailquotes:[],consumption:[],catalog:{},catalogList:[],config:{}};
const ui={view:'loading',param:null,modal:null,f:{},sel:{},draft:{},loaded:{},role:null,preview:'',uid:null,fatal:null,tab:{},busy:false,online:true,me:null,users:[],smtp:null,pop:null,q:'',drawer:false,uploading:0,pickCat:null,pickQ:'',cartOpen:false};
let D={};
const app=document.getElementById('app');
const store={cols:{},rev:0,epoch:''};
const mailOk=()=>!!(ui.smtp&&ui.smtp.configured);
const proj=id=>S.projects.find(p=>p.id===id);
const projCode=id=>{const p=proj(id);return p?(p.code||p.name):'—'};
// full site name (HQ store screens show which site the material is for)
const projName=id=>{const p=proj(id);return p?(p.name||p.code):'—'};
const projLabel=id=>{const p=proj(id);return p?`${p.code?p.code+' · ':''}${p.name}`:'Unknown project'};
const vend=id=>S.vendors.find(v=>v.id===id);
const company=()=>S.config.company||ui.company||'RGS Infra';

/* ================= SERVER ================= */
async function api(path,body,method){
  const opt={method:method||(body!==undefined?'POST':'GET'),credentials:'same-origin',headers:{}};
  if(body!==undefined){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body)}
  let r;try{r=await fetch(path,opt)}catch(e){throw {message:'Cannot reach the ProcureHub server. Check the internet connection and try again.'}}
  let j=null;try{j=await r.json()}catch(e){}
  if(r.status===401&&!/^\/api\/(login|setup|me)/.test(path)){setTimeout(()=>location.reload(),1500);throw {code:401,message:'Your session has ended. Please sign in again.'}}
  if(!r.ok) throw {code:r.status,message:(j&&j.error)||('Server error '+r.status)};
  return j;
}
function applyDoc(d){const c=store.cols[d.col]||(store.cols[d.col]={});if(d.deleted) delete c[d.id];else c[d.id]=d.data}
function rebuild(){
  const L=c=>Object.entries(store.cols[c]||{}).map(([id,d])=>Object.assign({},d,{id}));
  for(const k of ['projects','vendors','indents','rfqs','pos','grns','dispatches','sitelog','stocklvl','jobwork','mailquotes','consumption']) S[k]=L(k);
  S.catalogList=L('catalog');S.catalog=Object.fromEntries(S.catalogList.map(x=>[x.id,x]));
  S.config=(store.cols.config||{}).main||{};
  applyCustomCats();
}
// Categories added by the user (Item catalogue → Categories) are merged into the standard list, before "Others".
function applyCustomCats(){const cs=(S.config&&S.config.cats)||[];
  for(let i=CATS.length-1;i>=0;i--) if(CATS[i].custom) CATS.splice(i,1);
  for(const k of Object.keys(CAT)) if(CAT[k].custom) delete CAT[k];
  const add=cs.filter(c=>c&&c.id&&c.name).map(c=>({id:c.id,name:c.name,h:c.h!=null&&c.h!==''?+c.h:hash(c.id)%360,blurb:c.blurb||'',kw:(c.kw||[]).filter(Boolean),photo:c.photo||'',hidden:!!c.hidden,custom:true}));
  for(const c of add) CAT[c.id]=c;
  CATS.splice(CATS.findIndex(c=>c.id==='others'),0,...add.filter(c=>!c.hidden))}
function catUsage(id){return {items:D.items?D.items.filter(i=>i.category===id).length:0,lines:S.indents.reduce((n,i)=>n+(i.lines||[]).filter(l=>l.category===id).length,0),vendors:S.vendors.filter(v=>(v.categories||[]).includes(id)).length}}
async function syncLoop(){
  for(;;){
    try{
      const r=await fetch(`/api/sync?since=${store.rev}&epoch=${encodeURIComponent(store.epoch)}&wait=${store.rev?1:0}`,{credentials:'same-origin'});
      if(r.status===401){location.reload();return}
      if(!r.ok) throw new Error('sync '+r.status);
      const j=await r.json();
      if(j.v){if(ui.version&&j.v!==ui.version){toast('ProcureHub was updated to version '+j.v+'. Reloading…');await sleep(1500);location.reload();return}ui.version=j.v}
      if(j.reset) store.cols={};
      for(const d of j.docs||[]) applyDoc(d);
      store.rev=j.rev;store.epoch=j.epoch;ui.online=true;
      if(!ui.loaded.data){ui.loaded.data=true;rebuild();restoreRoute()}else rebuild();
      schedule();
    }catch(e){if(ui.online){ui.online=false;schedule()}await sleep(4000)}
  }
}
let _raf=0;function schedule(){if(_raf) return;_raf=requestAnimationFrame(()=>{_raf=0;render()})}
function errMsg(e){return (e&&e.message)||'Something went wrong. Try again.'}
async function run(fn,ok){if(ui.busy) return false;ui.busy=true;schedule();try{const r=await fn();if(ok) toast(ok);return r===undefined?true:r}catch(e){console.error(e);toast(errMsg(e),'err');return false}finally{ui.busy=false;schedule()}}
async function write(op,col,id,data){const j=await api('/api/write',{op,col,id,data});if(j&&j.doc){applyDoc(j.doc);rebuild();schedule()}return j}
const setDoc=(col,id,data)=>write('set',col,id,data);
const updDoc=(col,id,data)=>write('update',col,id,data);
const delDoc=(col,id)=>write('delete',col,id);
function maxNo(prefix,list){const f=fy();let m=0;for(const x of list){const p=String(x.no||'').split('/');if(p[0]===prefix&&p[1]===f) m=Math.max(m,parseInt(p[2],10)||0)}return m}
async function allocNo(prefix,list){const f=fy();const j=await api('/api/counter',{prefix,fy:f,floor:maxNo(prefix,list)});return `${prefix}/${f}/${String(j.n).padStart(4,'0')}`}
function toast(msg,kind){const t=document.createElement('div');t.className='toast'+(kind==='err'?' err':'');t.innerHTML=`<span class="toast-dot"></span><span></span>`;t.lastChild.textContent=msg;document.getElementById('toasts').appendChild(t);setTimeout(()=>t.remove(),kind==='err'?8000:3600)}

/* ================= PHOTOS ================= */
async function compressImage(file,max,keepPng){
  let img;
  try{img=await createImageBitmap(file)}catch(e){img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej({message:'This photo could not be read. Try a JPG or PNG photo.'});i.src=URL.createObjectURL(file)})}
  const w=img.width,h=img.height,sc=Math.min(1,max/Math.max(w,h));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*sc));c.height=Math.max(1,Math.round(h*sc));
  const ctx=c.getContext('2d');if(!keepPng){ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height)}ctx.drawImage(img,0,0,c.width,c.height);
  return await new Promise(r=>c.toBlob(r,keepPng?'image/png':'image/jpeg',.82));
}
async function uploadBlob(b){const r=await fetch('/api/upload',{method:'POST',credentials:'same-origin',headers:{'Content-Type':b.type||'application/octet-stream'},body:b});let j=null;try{j=await r.json()}catch(e){}if(!r.ok) throw {message:(j&&j.error)||'Upload failed. Try again.'};return j.id}
async function uploadFile(file,opt={}){
  const isPdfFile=file.type==='application/pdf'||/\.pdf$/i.test(file.name||'');
  if(isPdfFile){if(file.size>12*1048576) throw {message:`${file.name} is larger than 12 MB. Scan it at a lower resolution or split it.`};return uploadBlob(file.type?file:new Blob([file],{type:'application/pdf'}))}
  if(!/^image\//.test(file.type)&&!/\.(jpe?g|png|webp)$/i.test(file.name||'')) throw {message:`${file.name||'This file'} is not a photo or PDF. Choose a JPG, PNG or PDF file.`};
  return uploadBlob(await compressImage(file,opt.max||1600,opt.png));
}
const isPdf=id=>/\.pdf$/.test(String(id||''));
const isXlsx=id=>/\.xlsx$/.test(String(id||''));
function photoTile(id,removePath){return `<span class="ph">${isXlsx(id)?`<a class="ph-pdf" href="/files/${esc(id)}" download>${icon('grid')}<span>Excel</span></a>`:isPdf(id)?`<a class="ph-pdf" href="/files/${esc(id)}" target="_blank" rel="noopener">${icon('doc')}<span>PDF</span></a>`:`<button type="button" class="ph-img" data-act="viewPhoto" data-id="${esc(id)}" aria-label="View photo"><img src="/files/${esc(id)}" alt="" loading="lazy"></button>`}${removePath?`<button type="button" class="ph-x" data-act="rmPhoto" data-path="${esc(removePath)}" data-id="${esc(id)}" aria-label="Remove">${icon('x')}</button>`:''}</span>`}
function photoPicker(path,ids,o={}){
  ids=(Array.isArray(ids)?ids:(ids?[ids]:[])).filter(Boolean);const multi=o.multi!==false;const fid='up-'+path.replace(/[^a-zA-Z0-9]/g,'-');
  if(o.doc) return `<div class="photos doc-up">${ids.map(id=>photoTile(id,path)).join('')}<label class="doc-drop" for="${fid}" data-drop="${esc(path)}" data-multi="${multi?1:0}">${ui.uploading?'<span class="spin"></span>':icon('ul')}<span><b>Browse files</b> or drag them here<small>Photos (JPG, PNG) or PDF · up to 12 MB each${multi?' · several at once':''}</small></span></label><input type="file" id="${fid}" accept="image/*,application/pdf,.pdf" ${multi?'multiple':''} hidden data-upload="${esc(path)}" data-multi="${multi?1:0}"></div>`;
  return `<div class="photos">${ids.map(id=>photoTile(id,path)).join('')}${(multi||!ids.length)?`<label class="ph-add" for="${fid}">${ui.uploading?'<span class="spin"></span>':icon('camera')}<span>${esc(o.label||(ids.length?'Add more':'Add photo'))}</span></label><input type="file" id="${fid}" accept="image/*${o.pdf===false?'':',application/pdf'}" ${multi?'multiple':''} hidden data-upload="${esc(path)}" data-multi="${multi?1:0}" ${o.png?'data-png="1"':''}>`:''}</div>`;
}
function photoStrip(ids){ids=(ids||[]).filter(Boolean);return ids.length?`<div class="photos sm">${ids.map(id=>photoTile(id)).join('')}</div>`:''}

/* ================= DERIVED DATA ================= */
function derive(){
  const d={delivered:{},transit:{},storeOut:{},storeDisp:{},stock:{},directRecv:{},poDispatches:{},site:{},reserved:{},lineDisp:{}};
  D=d;d.items=catalogItems();d.itemMap=Object.fromEntries(d.items.map(x=>[x.id,x]));
  const siteRow=(p,k,l)=>{const m=d.site[p]||(d.site[p]={});return m[k]||(m[k]={itemKey:k,desc:l.desc,spec:l.spec||'',unit:l.unit,cat:l.cat||l.category||classify(l.desc,l.spec).cat,recv:0,out:0,used:0,cons:0,pcons:0,open:0,dmg:0,ret:0,adj:0,bal:0,min:0,last:0})};
  d.rate={};for(const p of S.pos){if(p.status==='cancelled') continue;for(const l of p.lines||[]){const k=l.itemKey||itemKey(l.desc,l.spec,l.unit);const r=d.rate[k];if(!r||(p.at||0)>r.at) d.rate[k]={rate:num(l.rate)*(1+num(l.gst)/100),at:p.at||0}}}
  // value of existing stock entered with a rate (used when there is no PO rate)
  d.orate={};const oat={};const orate=(k,r,at)=>{if(num(r)>0&&(!(k in oat)||at>=oat[k])){d.orate[k]=num(r);oat[k]=at}};
  for(const g of S.grns) if(g.type==='opening') for(const l of g.lines||[]) orate(l.itemKey||itemKey(l.desc,l.spec,l.unit),l.orate,g.at||0);
  for(const e of S.sitelog) if(e.type==='opening') orate(e.itemKey||itemKey(e.desc,e.spec,e.unit),e.orate,e.at||0);
  d.rateOf=k=>d.rate[k]?d.rate[k].rate:(d.orate[k]||0);
  for(const x of S.dispatches){if(x.status==='cancelled') continue;
    for(const l of x.lines||[]){const k=l.indentId+'|'+l.lineId;const ik=l.itemKey||itemKey(l.desc,l.spec,l.unit);
      if(l.indentId)(d.lineDisp[k]=d.lineDisp[k]||[]).push(x);
      if(x.status==='delivered'||x.status==='short'){if(l.indentId) d.delivered[k]=(d.delivered[k]||0)+num(l.recvQty);const sr=siteRow(x.projectId,ik,l);sr.recv+=num(l.recvQty);sr.last=Math.max(sr.last,x.receivedAt||0)}
      if(x.status==='in_transit'&&l.indentId) d.transit[k]=(d.transit[k]||0)+num(l.qty);
      if(x.type==='store'){d.storeOut[ik]=(d.storeOut[ik]||0)+num(l.qty);if(l.indentId) d.storeDisp[k]=(d.storeDisp[k]||0)+num(l.qty)}
      if(x.type==='transfer'&&x.fromProjectId){if(x.status==='to_send'){const m=d.reserved[x.fromProjectId]||(d.reserved[x.fromProjectId]={});m[ik]=(m[ik]||0)+num(l.qty)}else siteRow(x.fromProjectId,ik,l).out+=num(l.qty)}
      if(x.type==='direct'&&x.poId&&(x.status==='delivered'||x.status==='short')){const pk=x.poId+'|'+l.poKey;d.directRecv[pk]=(d.directRecv[pk]||0)+num(l.recvQty)}
    }
    if(x.poId)(d.poDispatches[x.poId]=d.poDispatches[x.poId]||[]).push(x);
  }
  const retIn={};
  for(const e of S.sitelog){const ik=e.itemKey||itemKey(e.desc,e.spec,e.unit);const r=siteRow(e.projectId,ik,e);const q=num(e.qty);r.last=Math.max(r.last,e.at||0);
    if(e.type==='use') r.used+=q;else if(e.type==='damage') r.dmg+=q;else if(e.type==='return'){r.ret+=q;retIn[ik]=retIn[ik]||{l:e,q:0};retIn[ik].q+=q}else if(e.type==='adjust') r.adj+=q;else r.open+=q}
  // consumption reported by sites: counts once the site head / project manager authenticates it
  for(const c of S.consumption){if(c.status==='rejected') continue;for(const l of c.lines||[]){const r=siteRow(c.projectId,l.itemKey||itemKey(l.desc,l.spec,l.unit),l);if(c.status==='authenticated'){r.cons+=num(l.qty);r.last=Math.max(r.last,(c.auth&&c.auth.at)||0)}else r.pcons+=num(l.qty)}}
  d.lvl={};for(const v of S.stocklvl){(d.lvl[v.projectId]=d.lvl[v.projectId]||{})[v.itemKey]=v;const r=d.site[v.projectId]&&d.site[v.projectId][v.itemKey];if(r) r.min=num(v.min)}
  for(const p in d.site) for(const k in d.site[p]){const r=d.site[p][k];r.bal=Math.round((r.open+r.recv-r.out-r.used-r.cons-r.dmg-r.ret+r.adj)*1000)/1000;r.free=r.bal-r.pcons-((d.reserved[p]||{})[k]||0);r.low=r.min>0&&r.bal<r.min;r.value=r.bal>0?r.bal*d.rateOf(k):0}
  for(const g of S.grns){for(const l of g.lines||[]){const s=d.stock[l.itemKey]||(d.stock[l.itemKey]={itemKey:l.itemKey,desc:l.desc,spec:l.spec,unit:l.unit,cat:l.cat,inQ:0,outQ:0});s.inQ+=num(l.acc)}}
  for(const k in retIn){const s=d.stock[k]||(d.stock[k]={itemKey:k,desc:retIn[k].l.desc,spec:retIn[k].l.spec,unit:retIn[k].l.unit,cat:retIn[k].l.cat,inQ:0,outQ:0});s.inQ+=retIn[k].q}
  for(const k in d.storeOut){const s=d.stock[k];if(s) s.outQ+=d.storeOut[k];else d.stock[k]={itemKey:k,desc:k.split('|')[0],spec:'',unit:k.split('|')[2],cat:'others',inQ:0,outQ:d.storeOut[k]}}
  // material sent from the HQ store to job workers, and unused material they return
  for(const e of S.jobwork){if(e.status==='cancelled') continue;const out=e.type==='in'&&e.source==='store',back=e.type==='return';if(!out&&!back) continue;
    for(const l of e.lines||[]){const k=l.itemKey||itemKey(l.desc,l.spec,l.unit);const s=d.stock[k]||(d.stock[k]={itemKey:k,desc:l.desc,spec:l.spec||'',unit:l.unit,cat:l.cat||'others',inQ:0,outQ:0});if(out) s.outQ+=num(l.qty);else s.inQ+=num(l.qty)}}
  for(const k in d.stock) d.stock[k].bal=d.stock[k].inQ-d.stock[k].outQ;
}
function needQty(l){return l.approvedQty!=null?num(l.approvedQty):num(l.qty)}
const amendIsOpen=ind=>!!(ind&&!ind.cancelled&&ind.amend&&ind.amend.status==='open');
const pcPending=ind=>!!(ind&&!ind.cancelled&&ind.precheck&&ind.precheck.status==='pending');
function lineInfo(ind,l){
  const k=ind.id+'|'+l.id,need=needQty(l),del=D.delivered[k]||0,tr=D.transit[k]||0;
  if(l.pcRemoved) return {st:'rejected',label:'Removed at pre-check',tone:'red',del,need};
  if(l.status==='rejected'&&l.deletedBy) return {st:'rejected',label:'Deleted by '+l.deletedBy,tone:'red',del,need};
  if(amendIsOpen(ind)&&l.status!=='rejected') return {st:'review',label:'Sent back for amendment',tone:'red',del,need};
  if(pcPending(ind)) return {st:'precheck',label:'Awaiting pre-check',tone:'violet',del,need};
  if(l.status==='rejected') return {st:'rejected',label:'Rejected',tone:'red',del,need};
  if(l.status==='hold') return {st:'review',label:'On hold',tone:'amber',del,need,hold:true};
  if(l.status!=='approved') return {st:'review',label:'Awaiting HQ review',tone:'amber',del,need};
  if(need>0&&del>=need-1e-9) return {st:'delivered',label:'Delivered',tone:'green',del,need};
  if(tr>0) return {st:'transit',label:del>0?'Part received · rest on the way':'On the way',tone:'amber',del,need};
  if(del>0) return {st:'transit',label:'Part received',tone:'amber',del,need};
  if(l.transferId){const t=S.dispatches.find(x=>x.id===l.transferId);const a=t&&t.status==='to_send'&&t.approval;const w=a&&a.status!=='approved'?(a.status==='returned'?' · indent sent back':' · indent awaiting approval'):'';return {st:'po',label:'Transfer from '+(l.transferFrom||'another site')+w,tone:'blue',del,need}}
  if(l.poNo&&l.jwVendor) return {st:'po',label:'Ordered · '+l.poNo+' · goes to '+l.jwVendor+' for assembly',tone:'blue',del,need};
  if(l.poNo) return {st:'po',label:'Ordered · '+l.poNo,tone:'blue',del,need};
  if(l.fromStock) return {st:'po',label:'Issue from central store',tone:'blue',del,need};
  if(l.rfqNo) return {st:'rfq',label:'Getting quotations',tone:'violet',del,need};
  return {st:'source',label:'Approved',tone:'violet',del,need};
}
const ST_ORDER={review:0,source:1,rfq:1,po:2,transit:3,delivered:4};
function lineSteps(ind,l,info){
  const disp=(D.lineDisp[ind.id+'|'+l.id]||[]).filter(x=>x.status!=='cancelled');
  const sent=disp.filter(x=>['in_transit','delivered','short'].includes(x.status));
  const recv=disp.filter(x=>x.receivedAt);const o=ST_ORDER[info.st]??0;
  return [
    {l:'Raised',d:ind.at?msDate(ind.at):ind.date,on:true},
    ...(ind.precheck?[{l:'Pre-checked',d:ind.precheck.at?msDate(ind.precheck.at):'',on:ind.precheck.status==='passed'}]:[]),
    {l:'Approved',d:l.approvedAt?msDate(l.approvedAt):'',on:o>=1},
    {l:'Ordered',d:l.poAt?msDate(l.poAt):l.transferAt?msDate(l.transferAt):'',on:o>=2},
    {l:'Dispatched',d:sent.length?msDate(Math.min(...sent.map(x=>x.shippedAt||x.at||0))):'',on:o>=3},
    {l:'Received',d:recv.length&&o>=4?msDate(Math.max(...recv.map(x=>x.receivedAt))):'',on:o>=4},
  ];
}
function stepper(steps,rej,rejText){if(rej) return `<div class="steps rej"><span class="step on"><i></i><b>Raised</b></span><span class="step bad"><i></i><b>${rejText||'Rejected by HQ'}</b></span></div>`;
  return `<div class="steps">${steps.map(s=>`<span class="step ${s.on?'on':''}"><i></i><b>${s.l}</b>${s.d&&s.on?`<em>${fd(s.d).replace(/ \d{4}$/,'')}</em>`:''}</span>`).join('')}</div>`}
function allLines(projectId){const o=[];for(const ind of S.indents){if(ind.cancelled) continue;if(projectId&&ind.projectId!==projectId) continue;for(const l of ind.lines||[]) o.push({ind,l,k:ind.id+'|'+l.id,info:lineInfo(ind,l)})}return o}
function indentStatus(ind){
  if(ind.cancelled) return {label:ind.pcDeleted?'Deleted at pre-check':'Cancelled',tone:'red',pct:0};
  if(amendIsOpen(ind)) return {label:'Sent back to site',tone:'red',pct:0};
  if(pcPending(ind)) return {label:'Awaiting pre-check',tone:'violet',pct:0};
  const ls=(ind.lines||[]).map(l=>lineInfo(ind,l));const act=ls.filter(x=>x.st!=='rejected');
  const need=sum(act,x=>x.need),del=sum(act,x=>Math.min(x.del,x.need));const pct=need?del/need:0;
  if(ls.some(x=>x.st==='review'&&!x.hold)) return {label:'Awaiting review',tone:'amber',pct};
  if(!act.length) return {label:'Rejected',tone:'red',pct:0};
  if(act.every(x=>x.st==='delivered')) return {label:'Completed',tone:'green',pct:1};
  return {label:'In progress',tone:'blue',pct};
}
function poTotals(po){const basic=sum(po.lines||[],l=>num(l.qty)*num(l.rate));const gst=sum(po.lines||[],l=>num(l.qty)*num(l.rate)*num(l.gst)/100);const fr=num(po.freight);return {basic,gst,freight:fr,total:basic+gst+fr}}
// PO delivered to the HQ store (not direct to sites, not to a job worker)
const toStore=p=>p.deliveryMode!=='site'&&p.deliveryMode!=='vendor';
const delivLabel=p=>p.deliveryMode==='site'?'Direct to sites':p.deliveryMode==='vendor'?'To job worker '+((vend(p.shipToVendorId)||{}).name||p.shipToVendorName||''):'Central store';
function poRecv(po,key){return po.deliveryMode==='site'?(D.directRecv[po.id+'|'+key]||0):num((po.received||{})[key])}
function poProgress(po){const o=sum(po.lines||[],l=>num(l.qty));const r=sum(po.lines||[],l=>Math.min(num(l.qty),poRecv(po,l.key)));return {o,r,pct:o?r/o:0}}
function poStatus(po){if(po.status==='cancelled') return {label:'Cancelled',tone:'red'};const ap=po.approval;if(ap&&ap.status==='pending') return {label:'Awaiting approval',tone:'violet'};if(ap&&ap.status==='returned') return {label:'Sent back',tone:'red'};const p=poProgress(po);if(p.pct>=1-1e-9) return {label:'Completed',tone:'green'};if(p.r>0) return {label:'Part received',tone:'amber'};return {label:'Open',tone:'blue'}}
function rfqStatus(r){const vq=Object.keys(r.quotes||{}).length;
  if(r.status==='cancelled') return {label:'Cancelled',tone:'red'};
  if(r.status==='ordered') return {label:'PO issued',tone:'green'};
  if(r.status==='approved') return {label:'Comparative approved',tone:'blue'};
  if(vq) return {label:`${vq} of ${(r.vendorIds||[]).length} quotes in`,tone:'violet'};
  if(r.status==='sent') return {label:'Awaiting quotes',tone:'amber'};
  return {label:'Draft · not sent',tone:'plain'}}
function dispStatus(d){if(d.type==='transfer'&&d.status==='to_send'&&d.approval){if(d.approval.status==='pending') return {label:'Awaiting approval',tone:'violet'};if(d.approval.status==='returned') return {label:'Sent back',tone:'red'}}return d.status==='ordered'?{label:'Ordered from vendor',tone:'blue'}:d.status==='to_send'?{label:'Waiting to be sent',tone:'violet'}:d.status==='in_transit'?{label:'On the way',tone:'amber'}:d.status==='short'?{label:'Received short',tone:'red'}:d.status==='cancelled'?{label:'Cancelled',tone:'red'}:{label:'Received',tone:'green'}}
const chip=s=>`<span class="chip ${s.tone||''}">${esc(s.label)}</span>`;
function siteProject(){return ui.role==='site'?(ui.preview||(ui.me&&ui.me.projectId)||''):''}
const GST_SLABS=[0,0.1,0.25,1.5,3,5,6,12,18,28,40];
function qGst(q,key){const g=q&&q.gstRates&&q.gstRates[key];return g!=null&&g!==''?num(g):num(q&&q.gst)}
function itemGst(desc){const it=D.itemMap&&D.itemMap[slug(desc||'')];return it&&it.gst!=null&&it.gst!==''?num(it.gst):null}
function itemHsn(desc){const it=D.itemMap&&D.itemMap[slug(desc||'')];return (it&&it.hsn)||''}
function quoteGstLabel(r,q){const s=[...new Set(r.lines.filter(l=>num((q.rates||{})[l.key])>0).map(l=>qGst(q,l.key)))];return s.length===1?fq(s[0])+'%':s.length?'mixed '+s.sort((a,b)=>a-b).map(x=>fq(x)+'%').join('/'):fq(q.gst)+'%'}
function landed(r,vid){const q=(r.quotes||{})[vid];if(!q) return null;let basic=0,missing=0,gst=0;for(const l of r.lines){const rt=num((q.rates||{})[l.key]);if(rt>0){basic+=rt*num(l.qty);gst+=rt*num(l.qty)*qGst(q,l.key)/100}else missing++}const fr=num(q.freight);return {basic,gst,fr,total:basic+gst+fr,missing}}
function l1Map(r){const m={};for(const l of r.lines){let best=null;for(const v of r.vendorIds||[]){const q=(r.quotes||{})[v];if(!q) continue;const rt=num((q.rates||{})[l.key]);if(!(rt>0)) continue;const eff=rt*(1+qGst(q,l.key)/100);if(!best||eff<best.eff) best={v,eff,rt}}m[l.key]=best}return m}

/* ================= ICONS ================= */
const IC={
  tool:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.5 17.2a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.1-5.4l-2.4 2.4-2.3-.4-.4-2.3z"/>',
 home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
 inbox:'<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
 queue:'<path d="M4 6h16M4 12h16M4 18h10"/>',
 quote:'<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h4"/>',
 po:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
 grn:'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
 truck:'<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
 chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
 proj:'<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>',
 vend:'<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-4-6"/>',
 tag:'<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
 bell:'<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 moon:'<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>',
 auto:'<circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',
 out:'<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
 key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
 camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
 doc:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
 print:'<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
 chat:'<path d="M4 20l1.5-4A8 8 0 1 1 9 19.3z"/>',
 dl:'<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',ul:'<path d="M12 20V9M7 14l5-5 5 5M4 4h16"/>',
 edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',trash:'<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/>',
 check:'<path d="M5 12l5 5 9-10"/>',chev:'<path d="M9 6l6 6-6 6"/>',back:'<path d="M15 6l-6 6 6 6"/>',
 swap:'<path d="M4 8h14l-4-4M20 16H6l4 4"/>',layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.5"/>',
 pin:'<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
 phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
 cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
 box:'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 alert:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
 star:'<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/>',
 img:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
 grid:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
};
const icon=(n,cls='')=>`<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]||''}</svg>`;

/* ================= SHELL ================= */
function render(){
  const ae=document.activeElement;let fid=ae&&ae.id&&(app.contains(ae)||document.getElementById('modal').contains(ae))?ae.id:null;let ss=null,se=null;
  try{if(fid&&ae.selectionStart!=null){ss=ae.selectionStart;se=ae.selectionEnd}}catch(e){}
  const scrollers=[...document.querySelectorAll('[data-keep-scroll]')].map(el=>[el.dataset.keepScroll,el.scrollTop]);
  if(ui.loaded.data||ui.view==='login'||ui.view==='setup'||ui.view==='fatal'||ui.view==='loading') derive();
  app.innerHTML=shell();
  document.getElementById('modal').innerHTML=ui.modal?modalHtml():'';
  document.body.classList.toggle('has-modal',!!ui.modal);
  applyPerms(app);applyPerms(document.getElementById('modal'));
  for(const [k,t] of scrollers){const el=document.querySelector(`[data-keep-scroll="${k}"]`);if(el) el.scrollTop=t}
  if(fid){const el=document.getElementById(fid);if(el){el.focus({preventScroll:true});try{if(ss!=null) el.setSelectionRange(ss,se)}catch(e){}}}
}
function navItems(){
  if(ui.role==='hq'){
    const L=allLines();const rev=L.filter(x=>x.info.st==='review'&&!x.info.hold).length;const src=L.filter(x=>x.info.st==='source').length;
    const rq=S.rfqs.filter(r=>r.status==='sent'||r.status==='draft').length;
    const grn=S.pos.filter(p=>toStore(p)&&p.status!=='cancelled'&&poProgress(p).pct<1).length;
    return [
      {g:'Operations'},
      {v:'dashboard',l:'Dashboard',i:'home'},
      ...((S.config&&S.config.precheck)||S.indents.some(pcPending)?[{v:'precheck',l:'Pre-check',i:'check',b:S.indents.filter(pcPending).length}]:[]),
      {v:'demands',l:'Demand inbox',i:'inbox',b:rev},
      {v:'queue',l:'Procurement queue',i:'queue',b:src},
      {v:'rfqs',l:'Quotations',i:'quote',b:rq+mqCount()},
      {v:'pos',l:'Purchase orders',i:'po',b:poPendingCount()},
      {v:'grn',l:'HQ store',i:'box',b:grn},
      {v:'dispatch',l:'Dispatch to sites',i:'truck'},
      {v:'jobwork',l:'With job workers',i:'tool',b:jwOpenCount()},
      {v:'sitestock',l:'Site stock',i:'layers'},
      {v:'consumption',l:'Consumption',i:'doc',b:consWaiting()},
      {g:'Masters'},
      {v:'projects',l:'Projects',i:'proj'},
      {v:'vendors',l:'Vendors',i:'vend'},
      {v:'items',l:'Item catalogue',i:'grid'},
      {v:'finditems',l:'Find items',i:'search'},
      {g:'Insights'},
      {v:'reports',l:'Reports',i:'chart'},
      {v:'settings',l:'Settings & backup',i:'gear'},
      {v:'help',l:'Help & guide',i:'help'},
      {v:'account',l:'My account',i:'key'},
    ].filter(n=>n.g||viewAllowed(n.v)).filter((n,i,a)=>!n.g||(a[i+1]&&!a[i+1].g));
  }
  const p=siteProject();const inc=S.dispatches.filter(d=>(d.projectId===p&&(d.status==='in_transit'||d.status==='ordered'))||(d.fromProjectId===p&&d.status==='to_send')).length;
  return [{g:'My site'},{v:'s_home',l:'Home',i:'home'},{v:'s_new',l:'Raise demand',i:'plus'},{v:'s_list',l:'My demands',i:'inbox',b:S.indents.filter(i=>i.projectId===p&&amendIsOpen(i)).length},{v:'s_incoming',l:'Receive material',i:'truck',b:inc},{v:'s_stock',l:'Site stock',i:'layers',b:Object.values(D.site[p]||{}).filter(r=>r.low).length},{v:'s_cons',l:'Consumption',i:'doc',b:consWaiting()},{v:'s_find',l:'Find items',i:'search'},{g:'Support'},{v:'help',l:'Help & guide',i:'help'},{v:'account',l:'My account',i:'key'}];
}
function isActive(v){const map={indent:'demands',rfq:'rfqs',po:'pos',s_indent:'s_list',done:ui.role==='hq'?'demands':'s_new'};return ui.view===v||map[ui.view]===v}
const TITLES={precheck:['Pre-check','New site demands waiting to be checked before approval'],dashboard:['Dashboard','Headquarters'],demands:['Demand inbox','Requests from all sites'],indent:['Material requisition','Demand inbox'],queue:['Procurement queue','Approved demand, grouped by category'],rfqs:['Quotations','Requests for quotation'],rfq:['Request for quotation','Quotations'],pos:['Purchase orders','Procurement'],po:['Purchase order','Purchase orders'],grn:['HQ store','Inward, stock in store and material sent to sites'],dispatch:['Dispatch to sites','Demand-wise challans from HQ store, transfers between sites'],jobwork:['With job workers','Material sent to vendors for job work and what they have used'],sitestock:['Site stock','Material at every project'],reports:['Reports','Spend and performance'],projects:['Projects','Masters'],vendors:['Vendors','Masters'],items:['Item catalogue','Masters'],settings:['Settings & backup','Users, site logins, company, email and backups'],account:['My account','Profile and password'],help:['Help & guide','How ProcureHub works'],s_home:['Home','My site'],s_new:['Raise demand','Pick what your site needs'],s_list:['My demands','Live status from HQ'],s_indent:['Material requisition','My demands'],s_incoming:['Receive material','Incoming and outgoing'],s_stock:['Site stock','Material at my site'],done:['Demand sent','Raise demand']};
function brandBlock(){const logo=S.config.logo||ui.logo;return `<div class="brand">${logo?`<img class="brand-logo" src="/files/${esc(logo)}" alt="">`:ART.logo('brand-logo')}<div><b>${esc(company())}</b><small>ProcureHub</small></div></div>`}
function shell(){
  if(ui.view==='loading') return `<div class="loading">${ART.logo('load-logo')}<div class="spin"></div><span>Loading ProcureHub…</span></div>`;
  if(ui.view==='login'||ui.view==='setup') return authHtml();
  if(ui.view==='pwchange') return pwChangeHtml();
  if(ui.view==='fatal') return `<div class="loading">${ART.logo('load-logo')}<h3>ProcureHub</h3><p>${esc(ui.fatal)}</p><button class="btn" onclick="location.reload()">Try again</button></div>`;
  const ready=ui.loaded.data;
  const nav=navItems().map(n=>n.g?`<div class="navg">${n.g}</div>`:`<button data-act="go" data-v="${n.v}" title="${esc(n.l)}" ${isActive(n.v)?'aria-current="page"':''}>${icon(n.i)}<span>${n.l}</span>${n.b?`<span class="badge">${n.b}</span>`:''}</button>`).join('');
  const [title,crumb]=ready?header():['Loading',''];
  const body=ready?view():`<div class="loading in"><div class="spin"></div></div>`;
  const me=ui.me||{};const al=ready?alerts():[];
  const themeIc=ui.theme==='dark'?'moon':ui.theme==='light'?'sun':'auto';
  return `<div class="app ${ui.role==='site'?'is-site':'is-hq'}">
  <aside class="side ${ui.drawer?'open':''}" aria-label="Main menu">
    ${brandBlock()}
    <nav class="nav">${nav}</nav>
    ${ui.isHQ&&isAdm()?`<div class="preview"><label for="f-preview">Preview a site's screens</label><select id="f-preview" data-act-change="preview"><option value="">— HQ view —</option>${S.projects.filter(p=>p.active!==false).map(p=>`<option value="${esc(p.id)}" ${ui.preview===p.id?'selected':''}>${esc(p.code||p.name)}</option>`).join('')}</select></div>`:''}
    <div class="side-user"><span class="avatar" style="--h:${hash(me.id)%360}">${esc(initials(me.name))}</span><div><b>${esc(me.name||'')}</b><small>${ui.isHQ?esc(accessSummary(me)):esc(projCode(me.projectId))}</small></div></div>
    <div class="side-ver" title="ProcureHub version running on the server">ProcureHub ${esc(ui.version||'')}</div>
  </aside>
  <div class="scrim" data-act="drawer"></div>
  <main class="main">
    <header class="top">
      <button class="icon-btn only-m" data-act="drawer" aria-label="Open menu">${icon('menu')}</button>
      <div class="top-title"><span class="crumb">${crumb}</span><h1>${title}</h1></div>
      <div class="top-tools">
        <div class="search ${ui.pop==='search'?'open':''}">${icon('search')}<input id="f-search" placeholder="${ui.role==='hq'?'Search MR, PO, item, vendor…':'Search demands or items…'}" data-bind="q" data-rerender="1" data-focus-pop="search" value="${esc(ui.q)}" autocomplete="off"><kbd>/</kbd>${ui.pop==='search'&&ui.q.trim().length>=2?searchPanel():''}</div>
        <div class="pop-wrap"><button class="icon-btn" data-act="pop" data-p="bell" aria-label="Notifications">${icon('bell')}${al.length?`<span class="dot">${al.length>9?'9+':al.length}</span>`:''}</button>${ui.pop==='bell'?bellPanel(al):''}</div>
        <button class="icon-btn" data-act="theme" aria-label="Theme: ${ui.theme||'auto'}" title="Theme: ${ui.theme||'auto'}">${icon(themeIc)}</button>
        <div class="pop-wrap"><button class="avatar-btn" data-act="pop" data-p="user" aria-label="Account"><span class="avatar" style="--h:${hash(me.id)%360}">${esc(initials(me.name))}</span></button>${ui.pop==='user'?userPanel():''}</div>
      </div>
    </header>
    ${ui.online?'':`<div class="offline">${icon('alert')} Connection to the server lost. Reconnecting… Changes are paused until it comes back.</div>`}
    ${ui.preview?`<div class="preview-bar">${icon('user')} You are previewing the site screens of <b>${esc(projLabel(ui.preview))}</b>. <button class="btn sm" data-act="endPreview">Back to HQ view</button></div>`:''}
    <div class="content">${body}</div>
  </main>
  ${ui.role==='site'?bottomNav():''}
  </div>`;
}
function bottomNav(){const p=siteProject();const inc=S.dispatches.filter(d=>(d.projectId===p&&(d.status==='in_transit'||d.status==='ordered'))||(d.fromProjectId===p&&d.status==='to_send')).length;
  const it=[['s_home','home','Home'],['s_list','inbox','Demands'],['s_new','plus','Raise'],['s_incoming','truck','Receive'],['s_stock','layers','Stock']];
  return `<nav class="bnav" aria-label="Site menu">${it.map(([v,i,l])=>`<button data-act="go" data-v="${v}" class="${v==='s_new'?'raise':''}" ${isActive(v)?'aria-current="page"':''}>${icon(i)}<span>${l}</span>${v==='s_incoming'&&inc?`<i>${inc}</i>`:''}</button>`).join('')}</nav>`}
function header(){
  const t=TITLES[ui.view]||['',''];
  if(ui.view==='indent'||ui.view==='s_indent'){const i=S.indents.find(x=>x.id===ui.param);return [i?esc(i.no):'Requisition',t[1]]}
  if(ui.view==='rfq'){const r=S.rfqs.find(x=>x.id===ui.param);return [r?esc(r.no):'RFQ',t[1]]}
  if(ui.view==='po'){const p=S.pos.find(x=>x.id===ui.param);return [p?esc(p.no):'PO',t[1]]}
  if(ui.view==='s_new'&&ui.role==='hq') return ['Raise demand for a site','Demand inbox'];
  return t;
}
function userPanel(){const me=ui.me||{};return `<div class="pop"><div class="pop-h"><span class="avatar lg" style="--h:${hash(me.id)%360}">${esc(initials(me.name))}</span><div><b>${esc(me.name)}</b><small>${esc(me.username)} · ${ui.isHQ?'HQ':'Site · '+esc(projCode(me.projectId))}</small></div></div>
  <div class="pop-acc">${esc(accessSummary(me))}</div><button class="pop-i" data-act="go" data-v="account">${icon('user')} My account</button><button class="pop-i" data-act="myPassword">${icon('key')} Change password</button><button class="pop-i" data-act="go" data-v="help">${icon('help')} Help & guide</button><button class="pop-i" data-act="logout">${icon('out')} Sign out</button></div>`}
function alerts(){
  const o=[];const td=today();
  if(ui.role==='hq'){
    const L=allLines();const rev=L.filter(x=>x.info.st==='review'&&!x.info.hold);
    const pcN=S.indents.filter(pcPending).length;if(pcN&&can('demands_precheck')) o.push({tone:'violet',i:'check',t:`${pcN} demand${pcN>1?'s':''} to pre-check`,s:'Edit, delete or pre-approve for the approver',v:'precheck'});
    if(rev.length) o.push({tone:'amber',i:'inbox',t:`${rev.length} demand lines to review`,s:`from ${new Set(rev.map(x=>x.ind.projectId)).size} sites`,v:'demands'});
    const od=L.filter(x=>x.ind.requiredBy&&x.ind.requiredBy<td&&!['delivered','rejected'].includes(x.info.st));
    if(od.length) o.push({tone:'red',i:'clock',t:`${od.length} lines past required date`,s:'Sites are waiting',v:'demands'});
    for(const r of S.rfqs) if(r.status==='sent'&&r.dueDate&&r.dueDate<td&&Object.keys(r.quotes||{}).length<(r.vendorIds||[]).length) o.push({tone:'amber',i:'quote',t:`${r.no}: quotes overdue`,s:`${Object.keys(r.quotes||{}).length} of ${(r.vendorIds||[]).length} received`,v:'rfq',p:r.id});
    for(const p of S.pos){if(p.status==='cancelled'||!p.deliveryDays) continue;const exp=addDays(p.date,+p.deliveryDays);if(exp<td&&poProgress(p).pct<1) o.push({tone:'red',i:'po',t:`${p.no} delivery is late`,s:`${p.vendorName} · due ${fd(exp)}`,v:'po',p:p.id})}
    for(const d of S.dispatches){if(d.status==='short'&&d.receivedAt&&Date.now()-d.receivedAt<14*864e5) o.push({tone:'red',i:'alert',t:`Short receipt at ${projCode(d.projectId)}`,s:`${d.no} · ${d.siteRemarks||'check quantities'}`,act:'viewDispatch',id:d.id})}
    const lowP=Object.entries(D.site).map(([p,m])=>[p,Object.values(m).filter(r=>r.low).length]).filter(x=>x[1]);
    if(lowP.length) o.push({tone:'amber',i:'layers',t:`${sum(lowP,x=>x[1])} item${sum(lowP,x=>x[1])>1?'s':''} below minimum stock`,s:lowP.slice(0,4).map(([p,n])=>projCode(p)+': '+n).join(' · '),v:'sitestock'});
    for(const d of S.dispatches){if(d.status==='to_send'&&Date.now()-(d.at||0)>2*864e5) o.push({tone:'amber',i:'swap',t:`${d.no} not yet sent by ${projCode(d.fromProjectId)}`,s:`Transfer to ${projCode(d.projectId)}`,act:'viewDispatch',id:d.id})}
  }else{
    const p=siteProject();
    const inc=S.dispatches.filter(d=>d.projectId===p&&(d.status==='in_transit'||d.status==='ordered'));
    if(inc.length) o.push({tone:'amber',i:'truck',t:`${inc.length} consignment${inc.length>1?'s':''} to receive`,s:'Confirm when material arrives',v:'s_incoming'});
    const ts=S.dispatches.filter(d=>d.fromProjectId===p&&d.status==='to_send');
    if(ts.length) o.push({tone:'violet',i:'swap',t:`${ts.length} transfer${ts.length>1?'s':''} to send`,s:'HQ asked you to send material to another site',v:'s_incoming'});
    const L=allLines(p);const rec=L.filter(x=>x.l.approvedAt&&Date.now()-x.l.approvedAt<3*864e5&&x.l.status==='approved');
    if(rec.length) o.push({tone:'green',i:'check',t:`${rec.length} line${rec.length>1?'s':''} approved by HQ`,s:'In the last 3 days',v:'s_list'});
    for(const i of S.indents) if(i.projectId===p) for(const r of i.hqRemarks||[]) if(Date.now()-(r.at||0)<3*864e5) o.push({tone:'blue',i:'chat',t:`HQ remark on ${i.no}`,s:String(r.text).slice(0,80),act:'openIndent',id:i.id});
    const rj=L.filter(x=>x.l.status==='rejected');if(rj.length) o.push({tone:'red',i:'x',t:`${rj.length} line${rj.length>1?'s':''} rejected`,s:'Open My demands for details',v:'s_list'});
    const low=Object.values(D.site[p]||{}).filter(r=>r.low);if(low.length) o.push({tone:'amber',i:'layers',t:`${low.length} item${low.length>1?'s':''} below minimum stock`,s:low.slice(0,3).map(r=>r.desc).join(', '),v:'s_stock'});
  }
  return o;
}
function bellPanel(al){return `<div class="pop wide"><div class="pop-t">Needs attention</div>${al.length?al.slice(0,12).map(a=>`<button class="pop-n" ${a.act?`data-act="${a.act}" data-id="${a.id}"`:`data-act="go" data-v="${a.v}" ${a.p?`data-p="${a.p}"`:''}`}><span class="n-ic ${a.tone}">${icon(a.i)}</span><span><b>${esc(a.t)}</b><small>${esc(a.s||'')}</small></span></button>`).join(''):`<div class="pop-empty">${ART.x('ok','sm-art')}<span>All caught up.</span></div>`}</div>`}
function searchPanel(){
  const q=norm(ui.q);const res=[];
  const add=(g,t,s,act)=>{if(res.length<14) res.push({g,t,s,act})};
  for(const i of S.indents){const txt=norm(i.no+' '+(i.lines||[]).map(l=>l.desc+' '+l.spec).join(' ')+' '+projLabel(i.projectId));if(txt.includes(q)) add('Demands',i.no,`${projCode(i.projectId)} · ${(i.lines||[]).length} items · ${fd(i.date)}`,`data-act="openIndent" data-id="${i.id}"`)}
  if(ui.role==='hq'){
    for(const p of S.pos) if(norm(p.no+' '+p.vendorName+' '+(p.lines||[]).map(l=>l.desc).join(' ')).includes(q)) add('Purchase orders',p.no,`${p.vendorName}${seeRates()?' · '+money0(poTotals(p).total):''}`,`data-act="openPo" data-id="${p.id}"`);
    for(const r of S.rfqs) if(norm(r.no+' '+(r.lines||[]).map(l=>l.desc).join(' ')).includes(q)) add('Quotations',r.no,`${(r.lines||[]).length} items · ${rfqStatus(r).label}`,`data-act="openRfq" data-id="${r.id}"`);
    for(const v of S.vendors) if(norm(v.name+' '+v.city).includes(q)) add('Vendors',v.name,v.city||'',`data-act="editVendor" data-id="${v.id}"`);
    for(const p of S.projects) if(norm(p.name+' '+p.code+' '+p.city).includes(q)) add('Projects',p.name,p.code||'',`data-act="editProject" data-id="${p.id}"`);
  }
  for(const it of D.items) if(!it.hidden&&norm(it.desc+' '+it.spec).includes(q)) add('Items',it.desc,catName(it.category),ui.role==='hq'?`data-act="editItem" data-id="${esc(it.id)}"`:`data-act="pickItem" data-id="${esc(it.id)}"`);
  if(!res.length) return `<div class="pop wide search-pop"><div class="pop-empty">No matches for “${esc(ui.q)}”.</div></div>`;
  let g='';return `<div class="pop wide search-pop">${res.map(r=>{const h=r.g!==g?`<div class="pop-t">${r.g}</div>`:'';g=r.g;return h+`<button class="pop-n" ${r.act}><span><b>${esc(r.t)}</b><small>${esc(r.s)}</small></span></button>`}).join('')}</div>`;
}
function authHtml(){
  const setup=ui.view==='setup';const a=ui.auth||(ui.auth={company:'RGS Infra'});
  return `<div class="auth">
   <div class="auth-art">${ART.hero('auth-hero')}<div class="auth-shade"></div>
     <div class="auth-copy"><div class="auth-brand">${ui.logo?`<img class="brand-logo" src="/files/${esc(ui.logo)}" alt="">`:ART.logo('brand-logo')}<b>${esc(ui.company||'RGS Infra')}</b></div>
     <h2>Every pipe, valve and helmet — from site demand to site delivery.</h2>
     <ul><li>${icon('check')} Sites raise demands from their phones</li><li>${icon('check')} HQ compares vendor quotes and issues POs</li><li>${icon('check')} Track every item until the site confirms receipt</li></ul></div></div>
   <form class="auth-card" id="auth-form" data-submit="${setup?'doSetup':'doLogin'}" novalidate>
     <span class="eyebrow">${setup?'First-time setup':'Welcome back'}</span>
     <h1>${setup?'Set up ProcureHub':'Sign in to ProcureHub'}</h1>
     ${setup?`<p class="muted">Create the HQ administrator account. You will add HQ staff and one login per site after this.</p>
     <div class="f"><label for="a-company">Company name</label><input class="inp" id="a-company" data-bind="auth.company" value="${esc(a.company||'')}" autocomplete="organization"></div>
     <div class="f"><label for="a-name">Your name</label><input class="inp" id="a-name" data-bind="auth.name" value="${esc(a.name||'')}" autocomplete="name"></div>`:''}
     <div class="f"><label for="a-user">Username</label><input class="inp lg" id="a-user" data-bind="auth.username" value="${esc(a.username||'')}" autocomplete="username" autocapitalize="none" spellcheck="false"></div>
     <div class="f"><label for="a-pass">Password</label><input class="inp lg" type="password" id="a-pass" data-bind="auth.password" autocomplete="${setup?'new-password':'current-password'}"></div>
     ${ui.authErr?`<div class="notice warn">${icon('alert')}<span>${esc(ui.authErr)}</span></div>`:''}
     <button class="btn primary xl" type="submit" ${ui.busy?'disabled':''}>${setup?'Create account and start':'Sign in'}</button>
     ${setup?'':'<p class="muted small">Forgot your password? Ask HQ to set a new one for you.</p>'}
     ${ui.version?`<p class="muted small ver-line">Version ${esc(ui.version)}</p>`:''}
   </form></div>`;
}

function pwChangeHtml(){const a=ui.pw||(ui.pw={});const me=ui.me||{};
  return `<div class="auth"><div class="auth-art">${ART.hero('auth-hero')}<div class="auth-shade"></div><div class="auth-copy"><div class="auth-brand">${ui.logo?`<img class="brand-logo" src="/files/${esc(ui.logo)}" alt="">`:ART.logo('brand-logo')}<b>${esc(ui.company||'RGS Infra')}</b></div><h2>Welcome, ${esc(firstName(me.name)||me.username||'')}.</h2><ul><li>${icon('check')} HQ created your login with a temporary password</li><li>${icon('check')} Choose your own password to continue</li><li>${icon('check')} Don't share it — every entry is recorded in your name</li></ul></div></div>
   <form class="auth-card" id="pw-form" data-submit="doFirstPassword" novalidate><span class="eyebrow">One-time step</span><h1>Set your own password</h1><p class="muted">Signed in as <b>${esc(me.username||'')}</b>.</p>
   <div class="f"><label for="pw-old">Temporary password (from HQ)</label><input class="inp lg" type="password" id="pw-old" data-bind="pw.old" autocomplete="current-password"></div>
   <div class="f"><label for="pw-new">New password</label><input class="inp lg" type="password" id="pw-new" data-bind="pw.nw" autocomplete="new-password" placeholder="At least 6 characters"></div>
   <div class="f"><label for="pw-new2">Repeat new password</label><input class="inp lg" type="password" id="pw-new2" data-bind="pw.nw2" autocomplete="new-password"></div>
   ${ui.authErr?`<div class="notice warn">${icon('alert')}<span>${esc(ui.authErr)}</span></div>`:''}
   <button class="btn primary xl" type="submit" ${ui.busy?'disabled':''}>Save password and continue</button><button class="btn ghost" type="button" data-act="logout">Sign out</button></form></div>`}
async function saveXlsx(filename,sheets){
  try{const r=await fetch('/api/xlsx',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename,sheets})});if(!r.ok) throw 0;saveFile(filename,await r.blob())}
  catch(e){const first=sheets[0];saveFile(filename.replace(/\.xlsx$/,'.csv'),csv(first.rows));toast('Excel could not be created, saved as CSV instead.','err')}}

/* ================= SHARED UI PIECES ================= */
const emptyBox=(art,h,p,btn)=>`<div class="empty">${art||''}<h3>${h}</h3>${p?`<p>${p}</p>`:''}${btn||''}</div>`;
const selOpts=(arr,val,ph)=>(ph!=null?`<option value="">${esc(ph)}</option>`:'')+arr.map(o=>{const v=typeof o==='object'?o.v:o,l=typeof o==='object'?o.l:o;return `<option value="${esc(v)}" ${String(val)===String(v)?'selected':''}>${esc(l)}</option>`}).join('');
const catOpts=v=>CATS.map(c=>`<option value="${c.id}" ${v===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
const projOpts=(v,ph)=>selOpts(S.projects.filter(p=>p.active!==false).map(p=>({v:p.id,l:(p.code?p.code+' · ':'')+p.name})),v,ph);
const fid=b=>'f-'+b.replace(/[^a-zA-Z0-9]/g,'-');
function inp(bind,val,attrs=''){return `<input class="inp" id="${fid(bind)}" data-bind="${bind}" value="${esc(val??'')}" ${attrs}>`}
function field(label,bind,val,attrs='',cls=''){return `<div class="f ${cls}"><label for="${fid(bind)}">${label}</label>${inp(bind,val,attrs)}</div>`}
function stepperInp(bind,val,id){return `<div class="qty-step"><button type="button" class="qs-b" data-act="qtyStep" data-bind="${bind}" data-d="-1" aria-label="Less">${icon('minus')}</button><input class="inp qty" id="${id||fid(bind)}" data-bind="${bind}" value="${esc(val??'')}" inputmode="decimal"><button type="button" class="qs-b" data-act="qtyStep" data-bind="${bind}" data-d="1" aria-label="More">${icon('plus')}</button></div>`}
function seg(k,opts,val,act='setF'){return `<div class="seg" role="group">${opts.map(([v,l])=>`<button type="button" data-act="${act}" data-k="${k}" data-val="${v}" aria-pressed="${val===v}">${l}</button>`).join('')}</div>`}
function bar(p,cls=''){return `<div class="bar ${cls}"><i style="width:${Math.max(0,Math.min(100,p*100)).toFixed(1)}%"></i></div>`}
function stars(n){n=+n||0;return `<span class="stars" aria-label="${n} of 5">${[1,2,3,4,5].map(i=>`<span class="${i<=n?'on':''}">★</span>`).join('')}</span>`}
function printHtml(title,inner){const w=window.open('','_blank');if(!w){toast('Allow pop-ups for this site to print.','err');return}
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4;margin:10mm}body{margin:0;font-family:Arial,Helvetica,sans-serif}</style></head><body>${inner}</body></html>`);w.document.close();w.focus();setTimeout(()=>w.print(),450)}
function saveFile(filename,data){try{let b=data;if(!(data instanceof Blob)){if(filename.endsWith('.csv')) data='﻿'+data;b=new Blob([data],{type:filename.endsWith('.csv')?'text/csv;charset=utf-8':filename.endsWith('.html')?'text/html;charset=utf-8':'application/json'})}
  const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),8000);toast('Downloaded '+filename)}catch(e){toast('Could not download the file.','err')}}
function waLink(phone,text){let d=String(phone||'').replace(/\D/g,'');if(d.length===10) d='91'+d;return d?`https://wa.me/${d}?text=${encodeURIComponent(text)}`:'#'}
