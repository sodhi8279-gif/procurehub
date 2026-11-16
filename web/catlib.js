/* ProcureHub — add the industrial category list (IndustryBuying style).
   27 categories with their sub-categories. Where a ProcureHub standard
   category already covers it (Electrical, Safety, Pumps, Tools, Hardware,
   Meters & Instruments) the sub-category names are added to that category's
   words; the others become your own categories. Every sub-category name is
   used as a keyword, so new items are filed in the right category, and the
   sub-categories are listed under the category in the Item catalogue. */

const CL_STOP=new Set(['tools','tool','accessories','accessory','equipment','equipments','products','product','items','item','parts','part','supplies','supply','machine','machines','sets','set','kits','kit','system','systems','components','component','others','other','essentials','material','materials','devices','device','care','spares','units','unit','and']);
const clSing=w=>w.replace(/(ches|shes|sses|xes)$/,m=>m.slice(0,-2)).replace(/ies$/,'y').replace(/([^s])s$/,'$1');
function catLibWordsOf(c){const out=new Set();for(const ph of c.groups.flatMap(g=>[g.n,...g.i])){for(const part of String(ph).toLowerCase().split(/\s*(?:&|,|\/|\band\b)\s*/)){const t=part.replace(/[^a-z0-9 \-]/g,' ').replace(/\s+/g,' ').trim();if(t.length<3) continue;out.add(t);const ws=t.split(' ');const sg=[...ws.slice(0,-1),clSing(ws[ws.length-1])].join(' ');out.add(sg);
    const head=clSing(ws[ws.length-1]);if(ws.length>1&&head.length>=4&&!CL_STOP.has(head)&&!CL_STOP.has(ws[ws.length-1])) out.add(head)}}
  return [...out].filter(x=>x.length>2&&!CL_STOP.has(x))}
function catLibHave(c){if(c.map) return CAT[c.map]||null;return CATS.find(x=>norm(x.name)===norm(c.name))||Object.values(CAT).find(x=>x.custom&&norm(x.name)===norm(c.name))||null}
A.catLib=()=>{const back=ui.modal&&ui.modal.type==='cats'?ui.modal:null;openModal({type:'catLib',back,d:{sel:Object.fromEntries(CAT_LIB.map((c,i)=>[i,!catLibHave(c)||!!c.map]))}})};
A.catLibTick=d=>{const s=ui.modal.d.sel;s[d.i]=!s[d.i];render()};
A.catLibAll=()=>{const s=ui.modal.d.sel;const all=CAT_LIB.every((c,i)=>s[i]);CAT_LIB.forEach((c,i)=>s[i]=!all);render()};
{const prev=v6Modal;v6Modal=(m,busy)=>{if(m.type!=='catLib') return prev(m,busy);const s=m.d.sel;const n=CAT_LIB.filter((c,i)=>s[i]).length;
  return wrap('Industrial categories',`<p class="small muted" style="margin-top:0">${CAT_LIB.length} categories with ${CAT_LIB.reduce((a,c)=>a+c.groups.length,0)} sub-categories and ${CAT_LIB.reduce((a,c)=>a+c.groups.reduce((b,g)=>b+g.i.length,0),0)} item types, arranged as on industrybuying.com. Their names become keywords, so new items go into the right category by themselves. Where a standard ProcureHub category already covers one, its words are added there instead of making a second category.</p>
   <div class="std-lib">${CAT_LIB.map((c,i)=>{const h=catLibHave(c);return `<label class="std-card ${s[i]?'on':''}"><input type="checkbox" data-act="catLibTick" data-i="${i}" ${s[i]?'checked':''}><span class="grow"><b>${esc(c.name)}</b> ${c.map?`<span class="chip blue xs">adds words to ${esc(catName(c.map))}</span>`:h?'<span class="chip green xs">already added — update words</span>':'<span class="chip plain xs">new category</span>'}
     <small class="block muted">${esc(c.groups.map(g=>g.n).join(' · '))}</small></span></label>`}).join('')}</div>`,
   `<button class="btn sm ghost" data-act="catLibAll">Tick all</button><span class="spacer"></span><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="catLibAdd" ${busy} ${n?'':'disabled'}>${icon('plus')} Add ${n} categor${n===1?'y':'ies'}</button>`,'wide')}}
A.catLibAdd=async()=>{const m=ui.modal;const pick=CAT_LIB.filter((c,i)=>m.d.sel[i]);
  const cats=JSON.parse(JSON.stringify((S.config&&S.config.cats)||[]));const catKw=Object.assign({},(S.config&&S.config.catKw)||{});const catGroups=Object.assign({},(S.config&&S.config.catGroups)||{});let made=0,upd=0;
  for(const c of pick){const words=catLibWordsOf(c);const groups=c.groups.map(g=>g.n);
    if(c.map){catKw[c.map]=[...new Set([...(catKw[c.map]||[]),...words])];catGroups[c.map]=[...new Set([...(catGroups[c.map]||[]),...groups])];upd++;continue}
    let x=cats.find(y=>norm(y.name)===norm(c.name));
    if(!x){let id='c-'+slug(c.name).slice(0,40),k=2;while(CAT[id]||cats.some(y=>y.id===id)) id='c-'+slug(c.name).slice(0,36)+'-'+(k++);x={id,name:c.name,kw:[],photo:'',hidden:false,h:hash(id)%360};cats.push(x);made++}else upd++;
    x.kw=[...new Set([...(x.kw||[]),...words])];catGroups[x.id]=[...new Set([...(catGroups[x.id]||[]),...groups])]}
  const ok=await run(()=>updDoc('config','main',{cats,catKw,catGroups}),'Categories added');
  if(ok!==false){closeModal();toast(`${made} new categor${made===1?'y':'ies'} added, ${upd} updated with more words.`)}};
Object.assign(ACT_PERM,{catLib:'masters_items',catLibTick:'masters_items',catLibAll:'masters_items',catLibAdd:'masters_items'});
// words added to standard categories are used by the auto-categoriser
{const prev=applyCustomCats;applyCustomCats=function(...a){const r=prev.apply(this,a);const kw=(S.config&&S.config.catKw)||{};for(const id of Object.keys(kw)){const c=CAT[id];if(c&&!c.custom) c.kw=[...new Set([...(c._kw0||(c._kw0=c.kw)),...kw[id]])]}return r}}
