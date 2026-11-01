"use strict";
/* Pictures. Photo-style renders ship in /img:
   - img/items/<item-id>.jpg  one picture for every standard catalogue item
   - img/cat-<category>.jpg   category pictures
   - img/x-*.jpg              pictures for dashboard tiles, help and empty screens
   Items typed in by sites get the closest standard item's picture, otherwise their category picture.
   The only drawing left is the company logo mark. */
(function(){
const LOGO=`<rect width="64" height="64" rx="15" fill="url(#g-logobg)"/><path d="M32,9 C32,9 15,30 15,41 A17,17 0 0 0 49,41 C49,30 32,9 32,9 Z" fill="#fff"/>
 <path d="M15.5,38 L48.5,38 L48.9,40.5 L49,44 L15,44 L15.1,40.5 Z" fill="url(#g-logo)"/><path d="M17.5,47.5 L46.5,47.5" stroke="#0d4a86" stroke-opacity=".25" stroke-width="1.4"/><circle cx="46" cy="16" r="4.6" fill="#f28c28"/>`;
const sprite=`<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>
 <linearGradient id="g-logo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e7fd0"/><stop offset="1" stop-color="#0d4a86"/></linearGradient>
 <linearGradient id="g-logobg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#13406b"/><stop offset="1" stop-color="#0a2240"/></linearGradient></defs>
 <symbol id="a-logo" viewBox="0 0 64 64">${LOGO}</symbol></svg>`;
const CAT_IDS=['pipes','fittings','valves','paints','hardware','safety','tools','electrical','civil','sewer','pumps','meters','chemicals','others'];
const IMG=(src,cls,style='')=>`<img class="art photo ${cls}" src="/img/${src}" alt="" draggable="false"${style?` style="${style}"`:''}>`;
const XMAP={truck:'x-truck',transfer:'x-truck',road:'x-truck',swap:'x-truck',store:'x-store',box:'x-store',layers:'x-store',clip:'x-clip',inbox:'x-clip',use:'x-use',ok:'x-ok',check:'x-ok',grn:'x-ok',quote:'x-quote',po:'x-po',clock:'x-clock',mix:'x-mix',queue:'x-mix'};
const slugify=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/ /g,'-').slice(0,120);
const STOP=new Set(['mm','and','with','for','of','the','type','grade','class','nos','no','set','inch','kg','cm','ltr','l']);
const toks=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(t=>t&&!STOP.has(t)&&!/^\d+(\.\d+)?$/.test(t));
let IDX=null;const cache={};
function itemFile(desc,cat){
  const key=(desc||'')+'|'+(cat||'');if(key in cache) return cache[key];
  if(!IDX) IDX=(typeof STD_ITEMS!=='undefined'?STD_ITEMS:[]).map(i=>({id:slugify(i.desc),cat:i.cat,t:new Set(toks(i.desc))}));
  const id=slugify(desc);let best=IDX.some(x=>x.id===id)?id:null;
  if(!best&&desc){const t=toks(desc);let bs=0;
    for(const x of IDX){let s=0;for(const w of t) if(x.t.has(w)) s+=w.length>3?2:1;if(s&&x.cat===cat) s+=1.5;if(s>bs){bs=s;best=x.id}}
    if(bs<2.5) best=null}
  return cache[key]=best?`items/${best}.jpg`:`cat-${CAT_IDS.includes(cat)?cat:'others'}.jpg`;
}
window.ART={
  sprite,
  cat:(id,cls='')=>CAT[id]&&CAT[id].photo?`<img class="art photo ${cls}" src="/files/${CAT[id].photo}" alt="" draggable="false">`:IMG(`cat-${CAT_IDS.includes(id)?id:'others'}.jpg`,cls),
  item:(desc,cat,cls='')=>{const f=itemFile(desc,cat);return !f.startsWith('items/')&&CAT[cat]&&CAT[cat].photo?ART.cat(cat,cls):IMG(f,cls)},
  x:(id,cls='')=>IMG((XMAP[id]||'x-ok')+'.jpg',cls),
  hero:(cls='')=>IMG('hero.jpg',cls),
  scene:(kind,v,cls='')=>IMG(`scene-${kind}.jpg`,cls,`object-position:${['50%','30%','70%'][(v||1)-1]} 50%`),
  logo:(cls='')=>`<svg class="logo-mark ${cls}" viewBox="0 0 64 64" aria-hidden="true"><use href="#a-logo"/></svg>`,
};
})();
