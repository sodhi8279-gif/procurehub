/* ProcureHub — going back to an earlier version.
   The server keeps the program of the running version and of the 5 most recent
   other versions (in the data folder, "versions"). Settings → Software update lists
   them; an administrator can switch to any of them. It goes through the same safe
   steps as an update: backup, test-start on a copy of the data, restart. The data
   is kept. */

// what each version brought, so one can see what going back removes
const VERSION_NOTES={
  '9.3.1':'Keeps the last versions; go back to any of them from Settings',
  '9.3.0':'Purchase carts: combine demands by site, chosen demands or same item; queue By site / Same item',
  '9.2.4':'Fittings: Type lists only fittings, materials in their own Material list',
  '9.2.3':'Item size / specification shown bigger and bold',
  '9.2.2':'Item catalogue shows every category, also empty ones',
  '9.2.1':'Change item uses the same selection as Add to demand',
  '9.2.0':'Industrial categories (IndustryBuying list)',
  '9.1.0':'Drop-down selection Material / Class / Size / IS; one standard category, merge categories',
  '9.0.0':'Standard Indian items with researched varieties and sizes',
  '8.9.0':'Merge a whole category into one item with selectable varieties',
  '8.8.2':'Common size list in category conversion',
  '8.8.1':'More category keywords',
  '8.8.0':'Items with varieties (Type, Class, IS code…) and conversion of existing items',
  '8.7.1':'Restore a cancelled demand',
  '8.7.0':'Demand items bought in cash / emergency; split a comparative item between vendors'};

function verListLoad(force){if(ui.verLoading||(ui.verList&&!force)) return;ui.verLoading=true;
  fetch('/api/update/versions',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{ui.verList=j||{versions:[]};ui.verLoading=false;render()}).catch(()=>{ui.verLoading=false})}
function verCard(){if(!isAdm()) return '';verListLoad();const j=ui.verList;const vs=(j&&j.versions)||[];const others=vs.filter(v=>!v.current);
  const when=ms=>ms?fd(msDate(ms)):'';
  return `<section class="card" id="kept-versions"><div class="card-h"><h2>${icon('clock')} Go back to an earlier version</h2><span class="sub">The running version and up to ${(j&&j.keep)||5} earlier versions are kept on the server</span></div>
  <div class="card-b"><p class="small">If something in a new version is not wanted, switch back to the version you used before. As with an update, ProcureHub first makes a <b>full backup</b>, then <b>test-starts</b> that version on a copy of your data (if it cannot open the data, nothing is changed), then restarts. <b>Your data is kept</b>: what was entered in the newer version stays, and features the older version does not have come back when you install the newer version again.</p>
  ${!j?'<p class="muted small">Loading…</p>':vs.length?`<div class="tw"><table class="t"><thead><tr><th>Version</th><th>What it brought</th><th>Used here</th><th></th></tr></thead><tbody>${vs.map(v=>`<tr${v.current?' class="sel"':''}><td class="nowrap"><b class="mono">${esc(v.version)}</b>${v.current?' <span class="chip green">Running now</span>':v.newer?' <span class="chip violet">Newer</span>':''}</td>
    <td class="small">${esc(VERSION_NOTES[v.version]||'')}</td><td class="small nowrap">${v.firstRun?'from '+when(v.firstRun):''}${v.lastRun&&!v.current?`<small class="muted block">last ${when(v.lastRun)}</small>`:''}</td>
    <td>${v.current?'':`<button class="btn sm ${v.newer?'primary':''}" data-act="verSwitch" data-v="${esc(v.version)}">${v.newer?'Switch to this version':'Go back to this version'}</button>`}</td></tr>`).join('')}</tbody></table></div>
    ${others.length?'':'<p class="small muted">No earlier version is kept yet. From now on, each version you install keeps the one before it here.</p>'}`:'<p class="small muted">No versions kept yet.</p>'}
  <div class="row" style="margin-top:8px"><label class="btn sm" for="f-verkeep">${icon('ul')} Add a version from its zip…</label><input type="file" id="f-verkeep" accept=".zip,.exe,application/zip,application/octet-stream" hidden data-act-change="verKeep"><span class="small muted">Stores an older (or newer) RGS-ProcureHub zip in this list without installing it.</span></div>
  <p class="small muted">Only the last ${(j&&j.keep)||5} earlier versions are kept; older copies are removed by themselves. To go further back, upload that version's zip above. Versions before 9.3.1 do not have this list: after going back to one of them, return by uploading the newer zip.</p></div></section>`}
{const prev=updCard;updCard=function(){return prev()+verCard()}}

A.verSwitch=d=>{const v=d.v;const j=ui.verList||{};const x=(j.versions||[]).find(y=>y.version===v);if(!x) return;const back=!x.newer;
  // what is given up: the notes of the versions between
  const lost=Object.keys(VERSION_NOTES).filter(k=>back?versionLess(v,k)&&!versionLess(ui.version||j.current,k):false);
  confirmBox({title:(back?'Go back to version ':'Switch to version ')+v,yes:back?'Go back to '+v:'Switch to '+v,danger:back,
    body:`<p>ProcureHub ${esc(ui.version||j.current||'')} is replaced by <b>${esc(v)}</b>. A full backup is made first and your data is kept. Everyone is disconnected for about half a minute.</p>
      ${lost.length?`<p class="small">These changes will not be there until you install the newer version again:</p><ul class="small">${lost.map(k=>`<li><b>${esc(k)}</b> — ${esc(VERSION_NOTES[k])}</li>`).join('')}</ul>`:''}`,
    note:'Why (kept in the activity log)',notePh:'e.g. New cart screen not needed yet',
    onYes:async m=>{closeModal();ui.upd={stage:'install',from:ui.version,to:v};openModal({type:'updating'});
      try{const r=await fetch('/api/update/switch',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:v,reason:String(m.noteVal||'').trim()})});const res=await r.json().catch(()=>null);
        if(!r.ok||!res||!res.ok){ui.upd={stage:'error',msg:(res&&res.error)||'The version could not be switched.'};render();return}
        ui.upd={stage:'restart',from:res.from,to:res.version,t0:Date.now()};render();updWait(res.version)}
      catch(e){ui.upd={stage:'error',msg:'The server could not be reached. Try again.'};render()}}})};
// compare a.b.c versions
function versionLess(a,b){const pa=String(a).split('.').map(Number),pb=String(b).split('.').map(Number);for(let i=0;i<3;i++){if((pa[i]||0)!==(pb[i]||0)) return (pa[i]||0)<(pb[i]||0)}return false}
CH.verKeep=async el=>{const f=el.files&&el.files[0];el.value='';if(!f) return;toast('Storing '+f.name+'…');
  try{const r=await fetch('/api/update/keep',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream'},body:f});const j=await r.json().catch(()=>null);
    if(!r.ok||!j||!j.ok) return toast((j&&j.error)||'The version could not be stored.','err');
    toast(j.kept?'Version '+j.version+' is now kept and can be switched to.':'Version '+j.version+' is older than the '+((ui.verList&&ui.verList.keep)||5)+' kept versions, so it was not kept.',j.kept?'':'err');verListLoad(true)}
  catch(e){toast('The upload was interrupted. Try again.','err')}};
Object.assign(ACT_PERM,{verSwitch:'__admin',verKeep:'__admin'});
