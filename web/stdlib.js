/* ProcureHub — standard items with varieties, researched for the Indian market
   (Bureau of Indian Standards specifications and what manufacturers sell).
   Each group is ONE catalogue item: its varieties (Type, Class, Pressure,
   IS code…) and its sizes. "rel" narrows the choices once the first variety
   is picked — e.g. Pipe → GI shows only Light/Medium/Heavy, IS 1239 and
   15–150 mm; Pipe → HDPE shows PE 63/80/100, PN 2.5–16, IS 4984 and
   16–1000 mm OD.
   Sources (checked Nov 2026): IS 8329 (DI pipes, K7–K12, DN 80–2000; DN 80–1200
   commonly sold), IS 4984 (HDPE, PE 63/80/100, PN 2.5–16, 16–1000 mm), IS 4985
   (uPVC, Class 1–6 = 2.5–12.5 kg/cm², 20–400 mm), IS 1239 Pt 1 (GI/MS tubes,
   Light/Medium/Heavy, colour bands yellow/blue/red, 15–150 NB), IS 3589 (ERW),
   IS 15778 (CPVC SDR 11/13.5, 15–50 mm CTS; SCH 40/80 above), IS 15801 (PPR),
   IS 13592 (SWR Type A vent/rain, Type B soil/waste), IS 16098 (DWC SN 4/8),
   IS 458 (RCC NP1–NP4, P1–P3, 80–2600 mm), IS 1726 / IS 12592 (manhole covers
   LD-2.5, MD-10, HD-20, EHD-35), IS 1786 (TMT Fe 415–600, 8–40 mm),
   IS 14846 (sluice valves PN 1.0/1.6, 50–1200 mm), IS 13095 (butterfly),
   IS 694 / IS 1554 / IS 7098 (cables 0.5–630 sq mm), IS 269 / 1489 / 455
   (cement), IS 383 (aggregates), IS 1077 / 12894 / 2185 (bricks, blocks). */
// fittings only — the material is its own list, never mixed in here
const VAR_FITTINGS=['Elbow 90°','Elbow 45°','Bend 90°','Bend 45°','Bend 22.5°','Bend 11.25°','Long bend','Door bend','Tee (equal)','Tee (reducing)','Y-tee','Cross','Reducer (concentric)','Reducer (eccentric)','Coupling / socket','Union','Nipple','Hex nipple','Barrel nipple','Long screw','Plug','End cap','Bush','Flange (slip-on)','Flange (weld neck)','Flange (screwed)','Blind flange','Puddle flange','Flange adaptor','Collar','MJ collar','Mechanical joint (Gibault)','Dismantling joint','Repair clamp','Tail piece','Service saddle','Tapping saddle','MTA (male adaptor)','FTA (female adaptor)','P-trap','Nahani trap'];
const VAR_FIT_MATERIALS=['GI','DI','CI','MS','SS','Malleable iron','HDPE','uPVC','PVC','CPVC','PPR','SWR','Brass'];

const MM=a=>a.map(n=>n+' mm');
const SZ={
  di:MM([80,100,125,150,200,250,300,350,400,450,500,600,700,750,800,900,1000,1100,1200]),
  ci:MM([80,100,125,150,200,250,300,350,400,450,500,600,700,750]),
  nb:MM([15,20,25,32,40,50,65,80,100,125,150]),
  msbig:MM([15,20,25,32,40,50,65,80,100,125,150,200,250,300,350,400,450,500,600,700,800,900,1000,1200]),
  hdpe:MM([16,20,25,32,40,50,63,75,90,110,125,140,160,180,200,225,250,280,315,355,400,450,500,560,630,710,800,900,1000]),
  upvc:MM([20,25,32,40,50,63,75,90,110,125,140,160,180,200,225,250,280,315,355,400]),
  cpvc:MM([15,20,25,32,40,50,65,80,100,150,200,250,300]),
  ppr:MM([20,25,32,40,50,63,75,90,110,125,160]),
  swr:MM([40,50,63,75,90,110,125,160,200]),
  dwc:MM([75,90,110,160,200,250,315,400,500,600,800,1000]),
  rcc:MM([80,100,150,200,225,250,300,350,400,450,500,600,700,800,900,1000,1100,1200,1400,1600,1800,2000,2200,2400,2600]),
  sw:MM([100,150,200,250,300,350,400,450,500,600]),
  mdpe:MM([20,25,32,40,50,63])};
const uniq=a=>[...new Set(a)];
const sortSz=a=>uniq(a).sort((x,y)=>parseFloat(x)-parseFloat(y));

const STD_LIB=[
 {id:'pipe',desc:'Pipe',cat:'pipes',unit:'Mtr',relBy:'Material',
  attrs:[['Material','DI, CI, GI, MS, HDPE, MDPE, uPVC, CPVC, PPR, SWR, DWC, RCC, Stoneware',1],['Class','K7, K8, K9, K10, K12, LA, A, B, Light, Medium, Heavy, PE 63, PE 80, PE 100, SDR 11, SDR 13.5, SCH 40, SCH 80, Type A, Type B, SN 4, SN 8, NP2, NP3, NP4, P1, P2, P3',0],['Pressure','PN 2.5, PN 4, PN 6, PN 8, PN 10, PN 12.5, PN 16, PN 20, PN 25, Class 1 (2.5 kg/cm²), Class 2 (4 kg/cm²), Class 3 (6 kg/cm²), Class 4 (8 kg/cm²), Class 5 (10 kg/cm²), Class 6 (12.5 kg/cm²)',0],['IS','IS 8329, IS 1536, IS 1239 (Part 1), IS 3589, IS 4984, IS 14333, IS 4985, IS 15778, ASTM F441, IS 15801, IS 13592, IS 16098, IS 458, IS 651',0],['Ends / joint','Socket & spigot (push-on), Double flanged, Screwed & socketed, Plain end, Bevelled end, Butt fusion, Electrofusion, Solvent weld, Ring-fit, Collar joint, Flush joint',0]],
  sizes:sortSz(Object.values(SZ).flat()),
  rel:{'DI':{'Class':['K7','K8','K9','K10','K12'],'IS':['IS 8329'],'Ends / joint':['Socket & spigot (push-on)','Double flanged'],sizes:SZ.di,note:'IS 8329 — cement mortar lined, 5.5 / 6 m lengths'},
   'CI':{'Class':['LA','A','B'],'IS':['IS 1536'],'Ends / joint':['Socket & spigot (push-on)','Double flanged'],sizes:SZ.ci},
   'GI':{'Class':['Light','Medium','Heavy'],'IS':['IS 1239 (Part 1)'],'Ends / joint':['Screwed & socketed','Plain end'],sizes:SZ.nb,note:'Colour band: Light yellow, Medium blue, Heavy red; 6 m lengths'},
   'MS':{'Class':['Light','Medium','Heavy'],'IS':['IS 1239 (Part 1)','IS 3589'],'Ends / joint':['Plain end','Bevelled end','Screwed & socketed'],sizes:SZ.msbig,note:'IS 1239 up to 150 NB; IS 3589 (ERW / spiral) for larger sizes — give wall thickness in spec'},
   'HDPE':{'Class':['PE 63','PE 80','PE 100'],Pressure:['PN 2.5','PN 4','PN 6','PN 8','PN 10','PN 12.5','PN 16','PN 20'],'IS':['IS 4984','IS 14333'],'Ends / joint':['Butt fusion','Electrofusion','Plain end'],sizes:SZ.hdpe,note:'Size is outside diameter; IS 4984 water, IS 14333 sewerage'},
   'MDPE':{'Class':['PE 80','PE 100'],Pressure:['PN 6','PN 10','PN 12.5','PN 16'],'IS':['IS 4984'],'Ends / joint':['Plain end'],sizes:SZ.mdpe,note:'House service connections, in coils'},
   'uPVC':{Pressure:['Class 1 (2.5 kg/cm²)','Class 2 (4 kg/cm²)','Class 3 (6 kg/cm²)','Class 4 (8 kg/cm²)','Class 5 (10 kg/cm²)','Class 6 (12.5 kg/cm²)'],'IS':['IS 4985'],'Ends / joint':['Solvent weld','Ring-fit'],sizes:SZ.upvc,note:'IS 4985 colour: Class 1 red, 2 blue, 3 green, 4 brown, 5 yellow, 6 black'},
   'CPVC':{'Class':['SDR 11','SDR 13.5','SCH 40','SCH 80'],'IS':['IS 15778','ASTM F441'],'Ends / joint':['Solvent weld'],sizes:SZ.cpvc,note:'SDR 11 / 13.5 in 15–50 mm (CTS); SCH 40 / 80 from 65 mm'},
   'PPR':{'Class':['SDR 11','SDR 7.4','SDR 6'],Pressure:['PN 10','PN 16','PN 20','PN 25'],'IS':['IS 15801'],'Ends / joint':['Butt fusion','Plain end'],sizes:SZ.ppr},
   'SWR':{'Class':['Type A','Type B'],'IS':['IS 13592'],'Ends / joint':['Solvent weld','Ring-fit'],sizes:SZ.swr,note:'Type A: vent & rain water; Type B: soil & waste. 3 / 6 m'},
   'DWC':{'Class':['SN 4','SN 8'],'IS':['IS 16098'],'Ends / joint':['Ring-fit'],sizes:SZ.dwc,note:'Double wall corrugated sewer pipe'},
   'RCC':{'Class':['NP2','NP3','NP4','P1','P2','P3'],'IS':['IS 458'],'Ends / joint':['Collar joint','Socket & spigot (push-on)','Flush joint'],sizes:SZ.rcc,note:'NP2 light, NP3 medium (under roads), NP4 heavy; 2–2.5 m lengths'},
   'Stoneware':{'IS':['IS 651'],'Ends / joint':['Socket & spigot (push-on)'],sizes:SZ.sw}}},

 {id:'pipe-fitting',desc:'Pipe fitting',cat:'fittings',unit:'Nos',relBy:'Material',
  attrs:[['Fitting',VAR_FITTINGS.join(', '),1],['Material','DI, CI, GI, MS, SS, Malleable iron, HDPE, uPVC, PVC, CPVC, PPR, SWR, Brass',1],['Ends','Socketed, Double flanged, Flanged & socketed, Threaded (BSP), Butt fusion, Electrofusion, Solvent weld, Ring-fit, Push-on',0],['Pressure / class','PN 6, PN 10, PN 16, K12, Light, Medium, Heavy, SDR 11, SCH 40, SCH 80, Type A, Type B',0],['IS','IS 9523, IS 1538, IS 1879, IS 1239 (Part 2), IS 8008, IS 8360, IS 7834, IS 10124, ASTM D2846, IS 15801, IS 14735',0]],
  sizes:sortSz([...SZ.di,...SZ.nb,...SZ.hdpe,...SZ.upvc,...SZ.cpvc,...SZ.ppr,...SZ.swr]),
  rel:{'DI':{Ends:['Socketed','Double flanged','Flanged & socketed','Push-on'],'Pressure / class':['PN 10','PN 16','K12'],'IS':['IS 9523'],sizes:SZ.di,note:'IS 9523 DI fittings, normally K12'},
   'CI':{Ends:['Socketed','Double flanged','Flanged & socketed'],'Pressure / class':['PN 10','PN 16'],'IS':['IS 1538'],sizes:SZ.ci},
   'GI':{Ends:['Threaded (BSP)'],'Pressure / class':['Light','Medium','Heavy'],'IS':['IS 1879','IS 1239 (Part 2)'],sizes:SZ.nb,note:'Malleable iron (IS 1879) or wrought steel (IS 1239 Part 2)'},
   'MS':{Ends:['Double flanged','Threaded (BSP)','Socketed'],'Pressure / class':['PN 10','PN 16'],sizes:SZ.msbig,note:'Fabricated specials — give thickness in spec'},
   'HDPE':{Ends:['Butt fusion','Electrofusion'],'Pressure / class':['PN 6','PN 10','PN 16'],'IS':['IS 8008','IS 8360'],sizes:SZ.hdpe,note:'IS 8008 moulded, IS 8360 fabricated'},
   'uPVC':{Ends:['Solvent weld','Ring-fit','Threaded (BSP)'],'Pressure / class':['PN 6','PN 10'],'IS':['IS 7834','IS 10124'],sizes:SZ.upvc},
   'CPVC':{Ends:['Solvent weld','Threaded (BSP)'],'Pressure / class':['SDR 11','SCH 40','SCH 80'],'IS':['ASTM D2846'],sizes:SZ.cpvc},
   'PPR':{Ends:['Butt fusion','Threaded (BSP)'],'Pressure / class':['PN 16','PN 20'],'IS':['IS 15801'],sizes:SZ.ppr},
   'SWR':{Ends:['Solvent weld','Ring-fit'],'Pressure / class':['Type A','Type B'],'IS':['IS 14735'],sizes:SZ.swr},
   'Brass':{Ends:['Threaded (BSP)'],sizes:SZ.nb.slice(0,6)}}},

 {id:'valve',desc:'Valve',cat:'valves',unit:'Nos',relBy:'Type',
  attrs:[['Type','Sluice valve, Butterfly valve, Non-return (reflux) valve, Air valve (single), Air valve (double / kinetic), Ball valve, Gate valve, Globe valve, Foot valve, Scour valve, Pressure reducing valve, Float valve, Knife gate valve, Landing valve (hydrant)',1],['Pressure','PN 1.0 (PN 10), PN 1.6 (PN 16), PN 2.5, Class 1, Class 2',0],['Body','CI, DI (SG iron), Cast steel (WCB), Brass, Bronze / gunmetal, Stainless steel, uPVC / CPVC',0],['Ends','Double flanged, Threaded (BSP), Wafer, Lug, Socket (solvent)',0],['Operation','Handwheel, Cap top (key), Gear operated, Electric actuator, Lever',0],['IS','IS 14846, IS 13095, IS 5312, IS 14845, IS 778, IS 9890, IS 4038, IS 5290',0]],
  sizes:sortSz([...MM([15,20,25,32,40]),...SZ.di.slice(0,15),'50 mm','63 mm','65 mm']),
  rel:{'Sluice valve':{Pressure:['PN 1.0 (PN 10)','PN 1.6 (PN 16)'],Body:['CI','DI (SG iron)'],Ends:['Double flanged'],Operation:['Handwheel','Cap top (key)','Gear operated','Electric actuator'],'IS':['IS 14846'],sizes:MM([50,65,80,100,125,150,200,250,300,350,400,450,500,600,700,750,800,900,1000,1100,1200]),note:'IS 14846: non-rising stem, double flanged, 50–1200 mm'},
   'Butterfly valve':{Pressure:['PN 1.0 (PN 10)','PN 1.6 (PN 16)','PN 2.5'],Body:['CI','DI (SG iron)','Cast steel (WCB)'],Ends:['Double flanged','Wafer','Lug'],Operation:['Lever','Gear operated','Electric actuator'],'IS':['IS 13095'],sizes:MM([50,65,80,100,125,150,200,250,300,350,400,450,500,600,700,750,800,900,1000,1100,1200])},
   'Non-return (reflux) valve':{Pressure:['PN 1.0 (PN 10)','PN 1.6 (PN 16)'],Body:['CI','DI (SG iron)','Brass'],Ends:['Double flanged','Threaded (BSP)','Wafer'],'IS':['IS 5312','IS 778'],sizes:MM([15,20,25,32,40,50,65,80,100,125,150,200,250,300,350,400,450,500,600]),note:'Swing check (IS 5312) for mains; brass (IS 778) for small sizes'},
   'Air valve (single)':{Pressure:['PN 1.0 (PN 10)','PN 1.6 (PN 16)'],Body:['CI','DI (SG iron)'],Ends:['Threaded (BSP)','Double flanged'],'IS':['IS 14845'],sizes:MM([25,40,50,80])},
   'Air valve (double / kinetic)':{Pressure:['PN 1.0 (PN 10)','PN 1.6 (PN 16)'],Body:['CI','DI (SG iron)'],Ends:['Double flanged'],'IS':['IS 14845'],sizes:MM([50,80,100,150,200,250])},
   'Ball valve':{Body:['Brass','Stainless steel','uPVC / CPVC','Cast steel (WCB)'],Ends:['Threaded (BSP)','Socket (solvent)','Double flanged'],Operation:['Lever','Gear operated'],'IS':['IS 9890'],sizes:MM([15,20,25,32,40,50,65,80,100])},
   'Gate valve':{Pressure:['Class 1','Class 2'],Body:['Brass','Bronze / gunmetal','Cast steel (WCB)'],Ends:['Threaded (BSP)','Double flanged'],'IS':['IS 778'],sizes:MM([15,20,25,32,40,50,65,80])},
   'Globe valve':{Pressure:['Class 1','Class 2'],Body:['Brass','Bronze / gunmetal','Cast steel (WCB)'],Ends:['Threaded (BSP)','Double flanged'],'IS':['IS 778'],sizes:MM([15,20,25,32,40,50])},
   'Foot valve':{Body:['CI','Brass','uPVC / CPVC'],Ends:['Threaded (BSP)','Double flanged'],'IS':['IS 4038'],sizes:MM([25,32,40,50,65,80,100,125,150])},
   'Landing valve (hydrant)':{Body:['Bronze / gunmetal','Stainless steel'],Ends:['Double flanged'],'IS':['IS 5290'],sizes:MM([63,80])}}},

 {id:'cement',desc:'Cement',cat:'civil',unit:'Bag',relBy:'Grade',
  attrs:[['Grade','OPC 33, OPC 43, OPC 53, PPC (fly ash), PSC (slag), SRC (sulphate resisting), Rapid hardening, White cement',1],['IS','IS 269, IS 1489 (Part 1), IS 455, IS 12330, IS 8041, IS 8042',0],['Make','UltraTech, ACC, Ambuja, Shree, Dalmia, JK Cement, JK Lakshmi, Birla A1, Ramco, Nuvoco, Wonder, Birla White, JK White',0],['Packing','50 kg bag, Bulk (loose)',0]],sizes:[],
  rel:{'OPC 33':{'IS':['IS 269']},'OPC 43':{'IS':['IS 269']},'OPC 53':{'IS':['IS 269']},'PPC (fly ash)':{'IS':['IS 1489 (Part 1)']},'PSC (slag)':{'IS':['IS 455']},'SRC (sulphate resisting)':{'IS':['IS 12330']},'Rapid hardening':{'IS':['IS 8041']},'White cement':{'IS':['IS 8042']}}},

 {id:'tmt-bar',desc:'TMT bar',cat:'civil',unit:'MT',
  attrs:[['Grade','Fe 415, Fe 415D, Fe 500, Fe 500D, Fe 550, Fe 550D, Fe 600',1],['Type','TMT, CRS (corrosion resistant), Epoxy coated',0],['IS','IS 1786',0],['Make','TATA Tiscon, JSW Neosteel, SAIL, Jindal Panther, RINL (Vizag), Kamdhenu, Shyam, SRMB, Rathi, Electrosteel',0]],
  sizes:MM([6,8,10,12,16,20,25,28,32,36,40]),note:'IS 1786; 12 m lengths; weight per m = d²/162 kg'},

 {id:'structural-steel',desc:'Structural steel',cat:'civil',unit:'MT',relBy:'Section',
  attrs:[['Section','Angle (ISA), Channel (ISMC), Beam (ISMB), Joist (ISJB), Flat, Round bar, Square bar, Plate, Chequered plate, HR sheet, CR sheet, GI sheet, Square hollow section (SHS), Rectangular hollow section (RHS)',1],['Grade','E250 (Fe 410), E350, E410, YSt 310',0],['IS','IS 2062, IS 808, IS 4923, IS 1079, IS 513, IS 3502, IS 277',0]],
  sizes:[],rel:{'Angle (ISA)':{'IS':['IS 2062','IS 808'],sizes:['25x25x3','35x35x5','40x40x5','50x50x5','50x50x6','65x65x6','75x75x6','75x75x8','90x90x8','100x100x8','100x100x10','150x150x12']},
   'Channel (ISMC)':{'IS':['IS 2062','IS 808'],sizes:['ISMC 75','ISMC 100','ISMC 125','ISMC 150','ISMC 200','ISMC 250','ISMC 300','ISMC 400']},
   'Beam (ISMB)':{'IS':['IS 2062','IS 808'],sizes:['ISMB 100','ISMB 125','ISMB 150','ISMB 175','ISMB 200','ISMB 250','ISMB 300','ISMB 350','ISMB 400','ISMB 450','ISMB 500','ISMB 600']},
   'Joist (ISJB)':{'IS':['IS 2062','IS 808'],sizes:['ISJB 150','ISJB 175','ISJB 200','ISJB 225']},
   'Flat':{'IS':['IS 2062'],sizes:['25x5','32x6','40x6','50x6','50x8','65x8','75x10','100x10','100x12']},
   'Round bar':{'IS':['IS 2062'],sizes:MM([6,8,10,12,16,20,25,32,40,50])},'Square bar':{'IS':['IS 2062'],sizes:MM([10,12,16,20,25])},
   'Plate':{'IS':['IS 2062'],sizes:MM([5,6,8,10,12,16,20,25,32])},'Chequered plate':{'IS':['IS 3502'],sizes:MM([5,6,8,10])},
   'HR sheet':{'IS':['IS 1079'],sizes:MM([1.6,2,2.5,3,4])},'CR sheet':{'IS':['IS 513'],sizes:MM([0.63,0.8,1,1.2,1.6,2])},'GI sheet':{sizes:MM([0.4,0.5,0.63,0.8,1,1.2]),'IS':['IS 277']},
   'Square hollow section (SHS)':{sizes:['25x25','40x40','50x50','60x60','72x72','80x80','100x100','150x150'],'IS':['IS 4923']},
   'Rectangular hollow section (RHS)':{sizes:['40x20','50x25','60x40','80x40','96x48','100x50','122x61','150x100'],'IS':['IS 4923']}}},

 {id:'aggregate-sand',desc:'Aggregate & sand',cat:'civil',unit:'Cum',relBy:'Material',
  attrs:[['Material','Coarse aggregate (crushed stone), Natural gravel, River sand, M-sand (manufactured), P-sand (plastering), Stone dust, Boulder / rubble, Murrum, GSB, WMM',1],['Sand zone','Zone I, Zone II, Zone III, Zone IV',0],['IS','IS 383, IS 2116, IS 1542, MoRTH',0]],
  sizes:MM([6,10,12.5,20,40,63]).concat(['150–300 mm (boulder)']),
  rel:{'Coarse aggregate (crushed stone)':{'IS':['IS 383'],sizes:MM([6,10,12.5,20,40,63])},'Natural gravel':{'IS':['IS 383'],sizes:MM([10,20,40])},
   'River sand':{'Sand zone':['Zone I','Zone II','Zone III','Zone IV'],'IS':['IS 383','IS 2116'],sizes:[]},'M-sand (manufactured)':{'Sand zone':['Zone II','Zone III'],'IS':['IS 383'],sizes:[]},
   'P-sand (plastering)':{'IS':['IS 1542'],sizes:[]},'Stone dust':{sizes:[]},'Boulder / rubble':{sizes:['150–300 mm (boulder)']},'Murrum':{sizes:[]},'GSB':{'IS':['MoRTH'],sizes:[]},'WMM':{'IS':['MoRTH'],sizes:[]}}},

 {id:'brick-block',desc:'Brick & block',cat:'civil',unit:'Nos',relBy:'Type',
  attrs:[['Type','Burnt clay brick, Fly ash brick, AAC block, Solid concrete block, Hollow concrete block, Paver block, Kerb stone',1],['Class / grade','Class 3.5, Class 5, Class 7.5, Class 10, Grade 1, Grade 2, Grade A, Grade B, M30, M35, M40, M50',0],['IS','IS 1077, IS 12894, IS 2185 (Part 3), IS 2185 (Part 1), IS 15658, IS 5758',0]],
  sizes:['230x110x75','190x90x90','230x110x70','600x200x100','600x200x150','600x200x200','400x200x100','400x200x150','400x200x200','60 mm (paver)','80 mm (paver)','100 mm (paver)'],
  rel:{'Burnt clay brick':{'Class / grade':['Class 3.5','Class 5','Class 7.5','Class 10'],'IS':['IS 1077'],sizes:['230x110x75','190x90x90']},
   'Fly ash brick':{'Class / grade':['Class 5','Class 7.5','Class 10'],'IS':['IS 12894'],sizes:['230x110x75','230x110x70','190x90x90']},
   'AAC block':{'Class / grade':['Grade 1','Grade 2'],'IS':['IS 2185 (Part 3)'],sizes:['600x200x100','600x200x150','600x200x200','600x200x225','600x200x250']},
   'Solid concrete block':{'Class / grade':['Grade A','Grade B'],'IS':['IS 2185 (Part 1)'],sizes:['400x200x100','400x200x150','400x200x200']},
   'Hollow concrete block':{'Class / grade':['Grade A','Grade B'],'IS':['IS 2185 (Part 1)'],sizes:['400x200x100','400x200x150','400x200x200']},
   'Paver block':{'Class / grade':['M30','M35','M40','M50'],'IS':['IS 15658'],sizes:['60 mm (paver)','80 mm (paver)','100 mm (paver)']},
   'Kerb stone':{'Class / grade':['M30','M35','M40'],'IS':['IS 5758'],sizes:['300x150x450','300x150x600','350x150x450']}}},

 {id:'ready-mix-concrete',desc:'Ready mix concrete',cat:'civil',unit:'Cum',
  attrs:[['Grade','M10, M15, M20, M25, M30, M35, M40, M45, M50',1],['Cement','OPC, PPC / fly ash, GGBS',0],['Placing','Pump, Chute / direct',0],['IS','IS 4926, IS 456',0]],sizes:[],note:'Give slump and aggregate size in spec'},

 {id:'cable',desc:'Cable',cat:'electrical',unit:'Mtr',relBy:'Type',
  attrs:[['Type','House wire (single core), Multicore flexible, LT power (armoured), LT power (unarmoured), Control cable, Submersible flat, Aerial bunched (ABC), Earthing wire, LAN (Cat 6)',1],['Conductor','Copper, Aluminium',0],['Cores','1 core, 2 core, 3 core, 3.5 core, 4 core, 5 core, 7 core, 10 core, 12 core, 19 core, 24 core',0],['Insulation','PVC FR, FR-LSH, HFFR (zero halogen), XLPE',0],['Voltage','1.1 kV, 3.3 kV, 11 kV',0],['IS','IS 694, IS 1554 (Part 1), IS 7098 (Part 1), IS 14255',0]],
  sizes:['0.5 sq mm','0.75 sq mm','1 sq mm','1.5 sq mm','2.5 sq mm','4 sq mm','6 sq mm','10 sq mm','16 sq mm','25 sq mm','35 sq mm','50 sq mm','70 sq mm','95 sq mm','120 sq mm','150 sq mm','185 sq mm','240 sq mm','300 sq mm','400 sq mm','500 sq mm','630 sq mm'],
  rel:{'House wire (single core)':{Conductor:['Copper'],Cores:['1 core'],Insulation:['PVC FR','FR-LSH','HFFR (zero halogen)'],Voltage:['1.1 kV'],'IS':['IS 694'],sizes:['0.75 sq mm','1 sq mm','1.5 sq mm','2.5 sq mm','4 sq mm','6 sq mm','10 sq mm'],note:'90 m coils'},
   'Multicore flexible':{Conductor:['Copper'],Cores:['2 core','3 core','4 core','5 core','7 core','10 core','12 core','19 core','24 core'],Insulation:['PVC FR','FR-LSH','HFFR (zero halogen)'],'IS':['IS 694'],sizes:['0.5 sq mm','0.75 sq mm','1 sq mm','1.5 sq mm','2.5 sq mm','4 sq mm','6 sq mm','10 sq mm']},
   'LT power (armoured)':{Conductor:['Copper','Aluminium'],Cores:['1 core','2 core','3 core','3.5 core','4 core'],Insulation:['PVC FR','FR-LSH','XLPE'],Voltage:['1.1 kV'],'IS':['IS 1554 (Part 1)','IS 7098 (Part 1)'],sizes:['1.5 sq mm','2.5 sq mm','4 sq mm','6 sq mm','10 sq mm','16 sq mm','25 sq mm','35 sq mm','50 sq mm','70 sq mm','95 sq mm','120 sq mm','150 sq mm','185 sq mm','240 sq mm','300 sq mm','400 sq mm','500 sq mm','630 sq mm'],note:'IS 1554 PVC, IS 7098 XLPE'},
   'LT power (unarmoured)':{Conductor:['Copper','Aluminium'],Cores:['1 core','2 core','3 core','3.5 core','4 core'],Insulation:['PVC FR','FR-LSH','XLPE'],Voltage:['1.1 kV'],'IS':['IS 1554 (Part 1)','IS 7098 (Part 1)'],sizes:['1.5 sq mm','2.5 sq mm','4 sq mm','6 sq mm','10 sq mm','16 sq mm','25 sq mm','35 sq mm','50 sq mm','70 sq mm','95 sq mm','120 sq mm','150 sq mm','185 sq mm','240 sq mm','300 sq mm','400 sq mm']},
   'Control cable':{Conductor:['Copper'],Cores:['2 core','3 core','4 core','5 core','7 core','10 core','12 core','19 core','24 core'],'IS':['IS 1554 (Part 1)'],sizes:['1.5 sq mm','2.5 sq mm']},
   'Submersible flat':{Conductor:['Copper'],Cores:['3 core'],'IS':['IS 694'],sizes:['1.5 sq mm','2.5 sq mm','4 sq mm','6 sq mm','10 sq mm','16 sq mm','25 sq mm']},
   'Aerial bunched (ABC)':{Conductor:['Aluminium'],Insulation:['XLPE'],'IS':['IS 14255'],sizes:['16 sq mm','25 sq mm','35 sq mm','50 sq mm','70 sq mm','95 sq mm','120 sq mm']},
   'Earthing wire':{Conductor:['Copper','Aluminium'],sizes:['2.5 sq mm','4 sq mm','6 sq mm','10 sq mm','16 sq mm','25 sq mm']},
   'LAN (Cat 6)':{Conductor:['Copper'],sizes:[]}}},

 {id:'mcb-switchgear',desc:'MCB & switchgear',cat:'electrical',unit:'Nos',
  attrs:[['Type','MCB, RCCB, RCBO, Isolator, MCCB, Distribution board, Changeover switch',1],['Poles','SP, SPN, DP, TP, TPN, FP',0],['Curve','B curve, C curve, D curve',0],['Make','Havells, Schneider, Legrand, L&T, Siemens, ABB, Anchor, Polycab',0],['IS','IS/IEC 60898, IS 12640, IS/IEC 60947-2, IS 8828',0]],
  sizes:['6 A','10 A','16 A','20 A','25 A','32 A','40 A','63 A','80 A','100 A','125 A','160 A','250 A','400 A','630 A']},

 {id:'light-fitting',desc:'Light fitting',cat:'electrical',unit:'Nos',
  attrs:[['Type','LED tube / batten, LED bulb, LED panel, LED flood light, LED street light, High bay, High mast lantern',1],['Colour','Cool day light (6500K), Natural white (4000K), Warm white (3000K)',0],['Make','Philips, Havells, Syska, Crompton, Bajaj, Wipro, Surya, Orient',0]],
  sizes:['9 W','12 W','18 W','20 W','24 W','36 W','40 W','45 W','50 W','70 W','90 W','100 W','120 W','150 W','200 W','250 W']},

 {id:'manhole-cover',desc:'Manhole cover & frame',cat:'sewer',unit:'Nos',relBy:'Material',
  attrs:[['Material','Cast iron, Ductile iron, SFRC, Precast RCC, FRP / composite',1],['Grade','LD-2.5, MD-10, HD-20, EHD-35',1,0],['Shape','Circular, Square, Rectangular, Lamphole',0],['IS','IS 1726, IS 12592, EN 124',0]],
  sizes:['350 mm dia','450 mm dia','500 mm dia','560 mm dia','600 mm dia','450x450','560x560','600x600','450x600','900x450','900x600'],
  rel:{'Cast iron':{'IS':['IS 1726']},'SFRC':{'IS':['IS 12592']},'Precast RCC':{'IS':['IS 12592']},'Ductile iron':{'IS':['EN 124']},'FRP / composite':{}},note:'LD-2.5 footpaths, MD-10 light traffic, HD-20 roads, EHD-35 heavy traffic / highways'},

 {id:'pump',desc:'Pump',cat:'pumps',unit:'Nos',
  attrs:[['Type','Borewell submersible, Openwell submersible, Monoblock centrifugal, End suction, Split case, Vertical turbine, Dewatering / drainage, Sewage (non-clog), Booster, Dosing pump, Hand pump (India Mark II), Hand pump (India Mark III)',1],['Phase','Single phase, Three phase',0],['Bore','100 mm (4"), 150 mm (6"), 200 mm (8"), 250 mm (10")',0],['IS','IS 8034, IS 14220, IS 9079, IS 6595, IS 15500, IS 9301',0],['Make','Kirloskar, KSB, CRI, Grundfos, Texmo, Lubi, Crompton, Havells, V-Guard, Shakti, Wilo',0]],
  sizes:['0.5 HP','1 HP','1.5 HP','2 HP','3 HP','5 HP','7.5 HP','10 HP','12.5 HP','15 HP','20 HP','25 HP','30 HP','40 HP','50 HP','60 HP','75 HP','100 HP'],note:'Give head (m) and discharge (LPM / m³/h) in spec'},

 {id:'water-meter',desc:'Water meter',cat:'meters',unit:'Nos',
  attrs:[['Type','Multi-jet, Single-jet, Woltman (bulk), Electromagnetic flow meter, Ultrasonic, AMR / smart',1],['Class','Class B, Class C, R80, R100, R160',0],['Ends','Threaded, Flanged',0],['IS','IS 779, IS 2373, ISO 4064',0]],
  sizes:MM([15,20,25,32,40,50,65,80,100,150,200,250,300,400,500,600])},

 {id:'welding-electrode',desc:'Welding electrode',cat:'chemicals',unit:'Pkt',
  attrs:[['Type','Mild steel rutile (E6013), Low hydrogen (E7018), Cast iron, Stainless steel (E308L), Stainless steel (E316L), Hard facing',1],['Make','ESAB, Ador, D&H Secheron, Mangalam, Kobelco',0],['IS','IS 814, AWS A5.1',0]],
  sizes:['2.5 mm','3.15 mm','4 mm','5 mm']},

 {id:'paint',desc:'Paint',cat:'paints',unit:'Ltr',
  attrs:[['Type','Red oxide primer, Zinc chromate primer, Synthetic enamel, Epoxy primer, Epoxy paint, Coal tar epoxy, Bitumen paint, PU paint, Zinc rich primer, Interior emulsion, Exterior emulsion, Cement paint, Distemper, Road marking (thermoplastic)',1],['Shade','White, Black, Grey, Smoke grey, Signal red, Golden yellow, Sky blue, Green, Aluminium',0],['Make','Asian Paints, Berger, Nerolac, Dulux, Shalimar, Jotun, Indigo',0],['IS','IS 2074, IS 104, IS 2932, IS 158, IS 5410, IS 15489',0]],
  sizes:['0.5 Ltr','1 Ltr','4 Ltr','10 Ltr','20 Ltr']},

 {id:'bolt-nut',desc:'Bolt & nut',cat:'hardware',unit:'Nos',
  attrs:[['Type','Hex bolt with nut, Hex bolt with nut & washer, Foundation (J) bolt, Anchor fastener, Stud bolt, U-bolt, Eye bolt, Allen bolt',1],['Grade','4.6, 8.8, 10.9, SS 304, SS 316',0],['Finish','Black, Hot dip galvanised, Zinc plated',0],['IS','IS 1363, IS 1364, IS 1367',0]],
  sizes:['M6','M8','M10','M12','M16','M20','M24','M30','M36'],note:'Give the length in spec, e.g. 60 mm long'},

 {id:'rubber-gasket',desc:'Rubber gasket',cat:'hardware',unit:'Nos',
  attrs:[['Type','Tyton ring (DI push-on), Flange gasket (full face), Flange gasket (ring), Rubber ring for uPVC, Rubber ring for RCC',1],['Material','EPDM, SBR, Neoprene, Nitrile (NBR), CNAF',0],['IS','IS 5382',0]],
  sizes:SZ.di.slice(0,1).concat(MM([50,65]),SZ.di.slice(1))},

 {id:'safety-ppe',desc:'Safety item (PPE)',cat:'safety',unit:'Nos',relBy:'Item',
  attrs:[['Item','Helmet, Safety shoe, Gum boot, Reflective jacket, Hand gloves (cotton), Hand gloves (leather), Hand gloves (rubber / nitrile), Safety goggles, Face shield, Ear plug, Dust mask (N95), Full body harness, Safety belt, Raincoat',1],['Colour','White, Yellow, Blue, Red, Green, Orange',0],['IS','IS 2925, IS 15298 (Part 2), IS 3521',0]],
  sizes:['S','M','L','XL','XXL','6','7','8','9','10','11'],
  rel:{'Helmet':{'IS':['IS 2925'],Colour:['White','Yellow','Blue','Red','Green','Orange'],sizes:[]},'Safety shoe':{'IS':['IS 15298 (Part 2)'],Colour:['Black'],sizes:['6','7','8','9','10','11']},'Gum boot':{sizes:['6','7','8','9','10','11']},'Reflective jacket':{Colour:['Orange','Yellow','Green'],sizes:['M','L','XL','XXL']},'Full body harness':{'IS':['IS 3521'],sizes:[]},'Safety belt':{'IS':['IS 3521'],sizes:[]},'Raincoat':{sizes:['M','L','XL','XXL']}}}
];

// a library group as a catalogue item
function libItem(g){return {desc:g.desc,category:g.cat,unit:g.unit,spec:g.note||'',attrs:g.attrs.map(([name,opts,req,showName])=>({name,opts:opts.split(',').map(s=>s.trim()).filter(Boolean),req:!!req,showName:!!showName})),sizes:g.sizes||[],rel:g.rel?{by:g.relBy,map:g.rel}:null}}
const libForCat=c=>STD_LIB.filter(g=>g.cat===c);

// ---- choosing in the demand: once the first variety is picked, show only what goes with it ----
function varRel(it,d){const r=it&&it.rel;if(!r||!r.by||!r.map) return null;const v=(d.av||{})[r.by];return v&&r.map[v]||null}
function varOptsFor(it,d,a){const r=varRel(it,d);if(!r||a.name===it.rel.by||!Array.isArray(r[a.name])) return a.opts;return r[a.name]}
// a variety that belongs to other choices only (e.g. Pressure is not asked for GI pipe) is not shown
function varShowAttr(it,d,a){const r=varRel(it,d);if(!r||a.name===it.rel.by||Array.isArray(r[a.name])) return true;return !Object.values(it.rel.map).some(x=>Array.isArray(x[a.name]))}
function varSizesFor(it,d){const r=varRel(it,d);return r&&Array.isArray(r.sizes)?r.sizes:(it.sizes||[])}
function varNote(it,d){const r=varRel(it,d);return r&&r.note?r.note:''}

// ---- Item catalogue → Standard items (India) ----
A.stdLib=()=>openModal({type:'stdLib',d:{sel:{}}});
A.stdLibTick=d=>{const s=ui.modal.d.sel;s[d.id]=!s[d.id];render()};
{const prev=v6Modal;v6Modal=(m,busy)=>{if(m.type!=='stdLib') return prev(m,busy);const sel=m.d.sel;const n=Object.values(sel).filter(Boolean).length;
  const byCat={};for(const g of STD_LIB)(byCat[g.cat]=byCat[g.cat]||[]).push(g);
  return wrap('Standard items with varieties (India)',`<p class="small muted" style="margin-top:0">Ready items researched from the Indian Standards (BIS) and what manufacturers sell in India. Each is <b>one item</b> with its varieties and sizes; when a variety is chosen in a demand, only the matching choices are shown (e.g. Pipe → GI shows Light/Medium/Heavy, IS 1239 and 15–150 mm). Items already in your catalogue get the new choices added; nothing is removed.</p>
   ${Object.entries(byCat).map(([c,gs])=>`<div class="lbl">${esc(catName(c))}</div><div class="std-lib">${gs.map(g=>{const it=libItem(g);const nm=norm(g.desc);const have=D.items.find(x=>x.category===g.cat&&[nm,nm+'s',nm+'es'].includes(norm(x.desc)));return `<label class="std-card ${sel[g.id]?'on':''}"><input type="checkbox" data-act="stdLibTick" data-id="${g.id}" ${sel[g.id]?'checked':''}><span class="grow"><b>${esc(g.desc)}</b>${have?` <span class="chip ${(have.attrs||[]).length?'green':'blue'} xs">${(have.attrs||[]).length?'in catalogue — add choices':'in catalogue — add varieties'}</span>`:''}
     <small class="block muted">${it.attrs.map(a=>`<b>${esc(a.name)}</b> ${a.opts.length}`).join(' · ')}${it.sizes.length?` · <b>Sizes</b> ${it.sizes.length}`:''}</small>
     <small class="block muted">${esc(it.attrs[0].opts.slice(0,8).join(', '))}${it.attrs[0].opts.length>8?'…':''}</small></span></label>`}).join('')}</div>`).join('')}`,
   `<button class="btn sm ghost" data-act="stdLibAll">Tick all</button><span class="spacer"></span><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="stdLibAdd" ${busy} ${n?'':'disabled'}>${icon('plus')} Add ${n||''} item${n===1?'':'s'}</button>`,'wide')}}
A.stdLibAll=()=>{const s=ui.modal.d.sel;const all=STD_LIB.every(g=>s[g.id]);for(const g of STD_LIB) s[g.id]=!all;render()};
A.stdLibAdd=async()=>{const ids=STD_LIB.filter(g=>ui.modal.d.sel[g.id]);
  const ok=await run(async()=>{for(const g of ids) await stdLibPut(g)},'Added');
  if(ok!==false){closeModal();const cats=[...new Set(ids.map(g=>g.cat))];toast(`${ids.length} standard item${ids.length===1?'':'s'} added. To fold your existing items into them: Item catalogue → choose the category → Merge into one item.`);ui.f.ic=cats.length===1?cats[0]:ui.f.ic;render()}};
async function stdLibPut(g){const it=libItem(g);const nm=norm(g.desc);const hit=D.items.find(x=>x.category===g.cat&&[nm,nm+'s',nm+'es'].includes(norm(x.desc)));const id=hit?hit.id:g.id;const cur=S.catalog[id]||{};const have=D.itemMap[id];
  const ALIAS={type:'Material',material:'Material','class / grade':'Class',class:'Class','is code':'IS',is:'IS',standard:'IS'};
  const attrs=(have&&have.attrs||[]).map(a=>{const x=Object.assign({},a,{opts:[...a.opts]});const al=ALIAS[norm(a.name)];if(al&&it.attrs.some(b=>b.name===al)&&!(have.attrs||[]).some(b=>b.name===al)) x.name=al;return x});
  for(const a of it.attrs){const x=attrs.find(y=>norm(y.name)===norm(a.name));if(x){for(const o of a.opts) if(!x.opts.some(p=>norm(p)===norm(o))) x.opts.push(o)}else attrs.push(a)}
  const sizes=[...(have&&have.sizes||[])];for(const z of it.sizes) if(!sizes.some(s=>norm(s).replace(/\s/g,'')===norm(z).replace(/\s/g,''))) sizes.push(z);
  const doc=Object.assign({},have?{desc:have.desc,spec:have.spec||'',unit:have.unit,category:have.category,photo:have.photo||'',gst:have.gst??'',hsn:have.hsn||''}:{},cur,{desc:have?have.desc:it.desc,unit:have&&have.unit||it.unit,category:have&&have.category||it.category,spec:(have&&have.spec)||it.spec,attrs,sizes,rel:it.rel,hidden:false,at:Date.now()});delete doc.id;delete doc.std;
  await setDoc('catalog',id,doc)}
Object.assign(ACT_PERM,{stdLib:'masters_items',stdLibTick:'masters_items',stdLibAll:'masters_items',stdLibAdd:'masters_items'});
