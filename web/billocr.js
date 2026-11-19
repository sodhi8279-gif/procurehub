/* ProcureHub — reading a bill photo inside the browser, without any AI key.
   The text is read with Tesseract (open-source OCR, served by ProcureHub
   itself from /ocr/, nothing goes to the internet), then the bill is taken
   apart by rules: shop, GSTIN, bill no., date, item rows (qty × rate =
   amount), GST % and the total. Works best on printed bills; handwriting is
   read poorly, so every line is marked for checking. */

let _ocrLoad=null;
function ocrLib(){if(window.Tesseract) return Promise.resolve();if(_ocrLoad) return _ocrLoad;
  _ocrLoad=new Promise((res,rej)=>{const s=document.createElement('script');s.src='/ocr/tesseract.min.js';s.onload=res;s.onerror=()=>{_ocrLoad=null;rej({message:'Could not load the bill reader. Check the connection and try again.'})};document.head.appendChild(s)});return _ocrLoad}

// sharpen the photo for reading: grey, stronger contrast, about 2000 px wide
async function ocrPrep(file){const url=URL.createObjectURL(file);try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
  const sc=Math.min(1,2200/Math.max(img.width,img.height)),w=Math.round(img.width*sc),h=Math.round(img.height*sc);const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.drawImage(img,0,0,w,h);
  const d=x.getImageData(0,0,w,h),p=d.data;let mn=255,mx=0;for(let i=0;i<p.length;i+=16){const g=.299*p[i]+.587*p[i+1]+.114*p[i+2];if(g<mn) mn=g;if(g>mx) mx=g}
  const r=Math.max(40,mx-mn);for(let i=0;i<p.length;i+=4){let g=.299*p[i]+.587*p[i+1]+.114*p[i+2];g=Math.max(0,Math.min(255,(g-mn)*255/r));p[i]=p[i+1]=p[i+2]=g}x.putImageData(d,0,0);return c}
  finally{URL.revokeObjectURL(url)}}

async function ocrBill(file,progress){await ocrLib();
  const worker=await Tesseract.createWorker('eng',1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr/',langPath:'/ocr/',gzip:true,
    logger:m=>{if(progress&&m.status==='recognizing text') progress(Math.round(m.progress*100));else if(progress&&/load/.test(m.status||'')) progress(-1)}});
  try{const src=/^image\//.test(file.type)?await ocrPrep(file):file;const {data}=await worker.recognize(src);window._ocrText=data.text;return parseBillText(data.text||'')}
  finally{worker.terminate()}}

/* ---- taking the bill apart ---- */
const OCR_UNITS={nos:'Nos',no:'Nos',pcs:'Nos',pc:'Nos',pce:'Nos',piece:'Nos',pieces:'Nos',kg:'Kg',kgs:'Kg',mtr:'Mtr',mtrs:'Mtr',meter:'Mtr',metre:'Mtr',m:'Mtr',rmt:'RMT',rft:'RFT',sft:'Sqft',coil:'Coil',coils:'Coil',sheet:'Sheet',sheets:'Sheet',qtl:'Quintal',brass:'Brass',trip:'Trip',ltr:'Ltr',ltrs:'Ltr',litre:'Ltr',l:'Ltr',bag:'Bag',bags:'Bag',box:'Box',set:'Set',sets:'Set',pair:'Pair',prs:'Pair',roll:'Roll',rolls:'Roll',pkt:'Pkt',pkts:'Pkt',packet:'Pkt',bundle:'Bundle',drum:'Drum',mt:'MT',ton:'MT',tonne:'MT',cum:'Cum',sqm:'Sqm',ft:'Ft',feet:'Ft',sqft:'Sqft',cft:'Cft',lot:'Lot',doz:'Doz'};
const OCR_SIZE=/^(mm|cm|inch|inches|in|"|''|”|sqmm|sq\.?mm|sq|amp|a|w|watt|v|volt|core|ml|gm|g|hp|kw|mpa|bar|kgf|no\.?|#)$/i;
const OCR_SKIP=/\b(sub\s*total|grand\s*total|total|cgst|sgst|igst|utgst|gst|tax|round(ed)?\s*off|discount|freight|cartage|transport|balance|received|paid|cash|change|amount\s*in\s*words|rupees|only|thank|e\.?\s*&\s*o\.?\s*e|terms|bank|a\/c|ifsc|signature|authori[sz]ed|declaration|customer|buyer|bill\s*to|ship\s*to|state\s*code|place\s*of\s*supply|phone|mobile|ph\.|email|website|hsn\s*\/?\s*sac\s*$)\b/i;
const OCR_HEAD=/\b(s\.?\s*no|sr\.?\s*no|particulars|description|item\s*name|qty|quantity|rate|amount|hsn)\b/i;
function ocrNum(t){const s=String(t).replace(/^(rs\.?|inr|₹|=|:)+/i,'').replace(/\/-$/,'').replace(/,/g,'');return /^\d+(\.\d+)?$/.test(s)?parseFloat(s):null}
function ocrFixGstin(s){const t=s.toUpperCase().replace(/[^A-Z0-9]/g,'');if(t.length!==15) return '';
  const d=c=>({O:'0',D:'0',Q:'0',I:'1',L:'1',Z:'2',S:'5',B:'8',G:'6'})[c]||c,a=c=>({0:'O',1:'I',2:'Z',5:'S',8:'B',6:'G'})[c]||c;
  const f=t.split('').map((c,i)=>[0,1,7,8,9,10].includes(i)?d(c):[2,3,4,5,6,11].includes(i)?a(c):i===13?'Z':c).join('');return /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(f)?f:''}
function ocrDate(s){let m=/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/.exec(s);if(m){let y=+m[3];if(y<100) y+=2000;const mo=+m[2],dd=+m[1];if(mo>=1&&mo<=12&&dd>=1&&dd<=31) return `${y}-${String(mo).padStart(2,'0')}-${String(dd).padStart(2,'0')}`}
  m=/\b(\d{1,2})[\s\-.]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-.,]*(\d{2,4})\b/i.exec(s);if(m){let y=+m[3];if(y<100) y+=2000;const mo='janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[2].toLowerCase())/3+1;return `${y}-${String(mo).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`}return ''}

function parseBillText(text){
  const raw=String(text).replace(/\r/g,'').split('\n').map(l=>l.replace(/[|¦]/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
  const all=raw.join('\n'),up=all.toUpperCase();const out={shop:'',gstin:'',bill_no:'',bill_date:'',pay_mode:'',rates_include_gst:false,lines:[],bill_total:null,warnings:[],ocr:true};
  // GSTIN: the seller's comes first; skip our own
  const own=String((S.config&&(S.config.gstin||S.config.companyGstin))||'').toUpperCase();
  const gs=[];for(const m of up.matchAll(/\b[0-9OIDSZ]{2}[A-Z0-9]{5}[0-9OIDSZBG]{4}[A-Z0-9][0-9A-Z]{3}\b/g)){const g=ocrFixGstin(m[0]);if(g&&g!==own&&!gs.includes(g)) gs.push(g)}out.gstin=gs[0]||'';
  for(const l of raw){const m=/\b(?:bill|invoice|inv|memo|receipt|voucher|challan)\s*(?:no|number|#)?\.?\s*[:\-#]?\s*([A-Z0-9][A-Z0-9\/\-]{0,19})/i.exec(l);if(m&&/\d/.test(m[1])){out.bill_no=m[1];break}}
  for(const l of raw) if(/date|dt\b|dated/i.test(l)){const d=ocrDate(l);if(d){out.bill_date=d;break}}if(!out.bill_date) out.bill_date=ocrDate(all);
  if(/\b(upi|g\s*pay|gpay|phone\s*pe|paytm|bhim)\b/i.test(all)) out.pay_mode='UPI';else if(/\b(card|pos|swipe)\b/i.test(all)) out.pay_mode='Card';else if(/\bcash\b/i.test(all)) out.pay_mode='Cash';
  // shop: a vendor whose name is on the bill, else the first proper line at the top
  const nAll=' '+norm(all)+' ';const v=S.vendors.find(v=>{const n=norm(v.name).replace(/\b(m s|ms)\b/g,'').trim();return n.length>=5&&nAll.includes(' '+n+' ')});
  if(v) out.shop=v.name;else{for(const l of raw.slice(0,8)){const letters=(l.match(/[a-z]/gi)||[]).length;if(letters<4||/invoice|cash\s*memo|estimate|gstin|gst\s*no|bill|original|duplicate|phone|mob|ph\.|email|@|www|address|road|near|^\d/i.test(l)) continue;out.shop=l.replace(/^m\s*\/\s*s\.?\s*/i,'').replace(/[^A-Za-z0-9&.,'()\- ]/g,'').trim();break}}
  // GST %
  let cg=0,ig=0,gst=null;for(const l of raw){let m=/\b(c|s|ut)\s*gst\b[^0-9%]{0,12}(\d{1,2}(?:\.\d+)?)\s*%/i.exec(l);if(m&&+m[2]<=14){cg=Math.max(cg,+m[2]);continue}m=/\bigst\b[^0-9%]{0,12}(\d{1,2}(?:\.\d+)?)\s*%/i.exec(l);if(m&&+m[1]<=28) ig=Math.max(ig,+m[1]);m=/\bgst\b[^0-9%]{0,12}(\d{1,2}(?:\.\d+)?)\s*%/i.exec(l);if(m&&!cg&&!ig&&+m[1]<=28) gst=+m[1]}
  if(cg) gst=cg*2;else if(ig) gst=ig;const taxShown=gst!=null||/\b(cgst|sgst|igst)\b/i.test(all);
  // total
  let best=null;for(const l of raw){if(!/total|net\s*(amt|amount|payable)|amount\s*payable|grand/i.test(l)||/sub\s*total|total\s*qty|in\s*words/i.test(l)) continue;const ns=l.split(' ').map(ocrNum).filter(x=>x!=null&&x>0);if(!ns.length) continue;const val=ns[ns.length-1];const pr=/grand|net|payable/i.test(l)?2:1;if(!best||pr>best.pr||(pr===best.pr&&val>best.v)) best={v:val,pr}}out.bill_total=best?best.v:null;
  // item rows
  for(const l of raw){if(OCR_SKIP.test(l)&&!/[a-z]{3,}.*\d+\s*(nos|pcs|kg|mtr|bag|ltr)\b/i.test(l)) continue;if(OCR_HEAD.test(l)&&(l.match(/\d/g)||[]).length<3) continue;
    const tk=l.replace(/^\s*\d{1,3}(\s*[.)\]:-]\s*|\s+(?=[A-Za-z]))/,'').split(' ');let desc=[],nums=[],unit='',seenNum=false;
    for(let i=0;i<tk.length;i++){const t=tk[i],n=ocrNum(t),nx=(tk[i+1]||'').toLowerCase().replace(/[.,]$/,'');
      if(n!=null&&!seenNum&&nx&&OCR_SIZE.test(nx)){desc.push(t+(nx.length<=3?'':' ')+tk[i+1]);i++;continue} // 20 mm: part of the name
      if(n!=null&&(seenNum||desc.join('').replace(/[^a-z]/gi,'').length>=3)){seenNum=true;nums.push(n);if(OCR_UNITS[nx]&&!unit){unit=OCR_UNITS[nx];i++}continue}
      const m=/^(\d+(?:\.\d+)?)(nos|pcs|kg|kgs|mtr|m|ltr|bags?|box|set|rolls?|pkt|ft)$/i.exec(t);if(m&&seenNum){nums.push(+m[1]);unit=unit||OCR_UNITS[m[2].toLowerCase()]||'';continue}
      if(seenNum){const u=OCR_UNITS[t.toLowerCase().replace(/[.,]$/,'')];if(u&&!unit){unit=u;continue}if(/^[a-z]/i.test(t)&&nums.length<2) continue;continue}
      desc.push(t)}
    const name=desc.join(' ').replace(/[^A-Za-z0-9"'&\/.\-+x×() ]/g,'').replace(/\s+/g,' ').trim();if((name.match(/[a-z]/gi)||[]).length<3||nums.length<2) continue;
    // drop an HSN code (4-8 digits) written before the numbers
    if(nums.length>=3&&Number.isInteger(nums[0])&&nums[0]>=1000&&String(nums[0]).length>=4&&String(nums[0]).length<=8) nums.shift();
    const amt=nums[nums.length-1];let qty=null,rate=null,g=gst,ok=false;
    for(let i=0;i<nums.length-1&&!ok;i++) for(let j=0;j<nums.length-1&&!ok;j++){if(i===j) continue;const a=nums[i],b=nums[j];if(!(a>0&&b>0)) continue;
      if(Math.abs(a*b-amt)<=Math.max(1,amt*0.01)){qty=a;rate=b;ok=true}else if(g&&Math.abs(a*b*(1+g/100)-amt)<=Math.max(1,amt*0.015)){qty=a;rate=b;ok=true}}
    if(ok&&qty>rate&&!Number.isInteger(qty)&&Number.isInteger(rate)){const t=qty;qty=rate;rate=t} // the whole number is usually the quantity
    if(!ok){if(nums.length===2){qty=nums[0];rate=qty?Math.round(amt/qty*100)/100:null}else{qty=nums[0];rate=nums[1]}}
    const nm=ocrSplitName(name);
    out.lines.push({item:nm.desc,size_spec:nm.spec,qty,unit:unit||'Nos',rate,gst:taxShown?(g!=null?g:null):0,amount:amt,known_item:ocrKnown(nm.desc),_check:!ok})}
  // the GST was not shown per line: rates as written
  if(!taxShown&&out.lines.length) out.warnings.push('No GST shown on the bill — rates taken as written, GST 0%. Change the GST % if the bill includes tax.');
  if(taxShown&&gst==null) out.warnings.push('GST % could not be read — set it on each line.');
  if(!out.lines.length) out.warnings.push('No item rows could be read. Type the items, or take a sharper photo (bill flat, good light, whole bill in the frame).');
  const bad=out.lines.filter(l=>l._check).length;if(bad) out.warnings.push(`${bad} line${bad===1?'':'s'}: quantity × rate does not match the amount — check them.`);
  if(gs.length>1) out.warnings.push('More than one GSTIN on the bill; the first was taken as the shop\'s.');
  out.warnings.push('Read on this device without AI: check every line against the photo.');
  return out}

// a name already used for this item (catalogue or bought before)
function ocrKnown(name){const w=norm(name).split(' ').filter(x=>x.length>1);if(!w.length) return '';let best='',bs=0;
  for(const n of cashItemNames()){const nw=norm(n).split(' ').filter(x=>x.length>1);if(!nw.length) continue;const hit=w.filter(x=>nw.includes(x)).length;const s=hit/Math.max(w.length,nw.length);if(s>bs){bs=s;best=n}}
  return bs>=0.6?best:''}

// "PVCPipe4inch6kg" → item "PVC Pipe", size "4 inch 6 kg"
function ocrSplitName(name){let t=String(name).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([A-Z]{2,})([A-Z][a-z])/g,'$1 $2').replace(/([A-Za-z])(\d)/g,'$1 $2').replace(/(\d)([A-Za-z])/g,'$1 $2').replace(/\s+/g,' ').trim();
  const sz=/(\d+(?:\.\d+)?(?:\s*\/\s*\d+)?\s*(?:mm|cm|inch|inches|in|"|''|”|kg|kgs|gm|g|ml|ltr|l|sq\s*mm|sqmm|core|amp|w|watt|v|mtr|m|ft|hp|kw|kgf|bar|mpa)\b(?:\s*(?:x|×|\*)\s*\d+(?:\.\d+)?\s*(?:mm|cm|inch|in|m|ft)?\b)?)/gi;
  const spec=[];const desc=t.replace(sz,m=>{spec.push(m.replace(/\s+/g,' ').trim());return ' '}).replace(/\s+/g,' ').replace(/[-–,\/]\s*$/,'').trim();
  return desc.replace(/[^a-z]/gi,'').length>=3?{desc,spec:spec.join(' ')}:{desc:t,spec:''}}
