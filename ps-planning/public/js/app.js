(function(){
"use strict";

/* Palette catégorielle validée — l'ORDRE fait partie de la validation
   (séparation daltonienne et contraste tenus de proche en proche, clair et sombre). */
var PALETTE=[
  {color:"#2a78d6",colorDark:"#3987e5"},{color:"#eb6834",colorDark:"#d95926"},
  {color:"#1baf7a",colorDark:"#199e70"},{color:"#eda100",colorDark:"#c98500"},
  {color:"#e87ba4",colorDark:"#d55181"},{color:"#008300",colorDark:"#008300"},
  {color:"#4a3aa7",colorDark:"#9085e9"},{color:"#e34948",colorDark:"#e66767"}
];
var DEFAULTS={
  brands:[
    {id:"asics",name:"Asics",code:"ASI",color:"#2a78d6",colorDark:"#3987e5",target:25},
    {id:"puma",name:"Puma",code:"PUM",color:"#eb6834",colorDark:"#d95926",target:12},
    {id:"nox",name:"Nox",code:"NOX",color:"#1baf7a",colorDark:"#199e70",target:14},
    {id:"ps",name:"Planet Sport",code:"PS",color:"#eda100",colorDark:"#c98500",target:25},
    {id:"nb",name:"New Balance",code:"NB",color:"#e87ba4",colorDark:"#d55181",target:12},
    {id:"adidas",name:"Adidas",code:"ADI",color:"#008300",colorDark:"#008300",target:12}
  ],
  types:[{id:"cam",name:"Campagne",short:"CAM",target:40},
         {id:"pro",name:"Promotionnel",short:"PRO",target:35},
         {id:"edu",name:"Éducationnel",short:"EDU",target:25}],
  formats:["Reel","Carrousel","Photo","Vidéo","UGC","Story native","GIF / Motion"],
  statuses:[{id:"idee",name:"Idée"},{id:"brief",name:"Brief"},{id:"asset",name:"Asset prêt"},
            {id:"prog",name:"Programmé"},{id:"pub",name:"Publié"}],
  storiesPerDay:3, tolerance:5
};
var STATUS_TONE={idee:"var(--ink-3)",brief:"var(--warn)",asset:"var(--ink-2)",prog:"var(--ink)",pub:"var(--ok)"};
var MONTHS=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
var MON_S=["jan","fév","mar","avr","mai","juin","juil","août","sep","oct","nov","déc"];
var DOWS=["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
var DOWS_S=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
var TABS=[{id:"dash",name:"Dashboard"},{id:"cal",name:"Calendrier"},{id:"camp",name:"Campagnes"},{id:"prod",name:"Production"},{id:"ideas",name:"Idées"}];

var DEFRULES={
  rotation:["puma","adidas","nox","newera","ua","asics","nb"],
  assetOffset:3, uaFrom:"2026-10-15",
  magasinDays:[1,4], running:[[5,2],[6,2]], events:[[5,2]], uaFallback:"newera", uaFallbackLabel:"New Era",
  order:["ambassadeur","focus","running","event","collection","magasin","asset"],
  ambassadors:[[0,"asics"],[1,"nb"],[2,"asics"],[3,"nb"],[4,"asics"],[6,"puma"]],
  collection:[[1,"Chaussures"],[3,"Accessoires"],[5,"Chaussures"]],
  houseBrand:"ps", pairs:{nox:["Nox","Champion"],newera:["New Era","Arena"]},
  assetBrands:["adidas","asics","puma","nb"],
  intentions:[{id:"montrer",name:"Montrer"},{id:"reagir",name:"Faire réagir"},{id:"cliquer",name:"Faire cliquer"}],
  postCategories:[{id:"campagne",name:"Contenu de campagne"},{id:"engagement",name:"Trend / engagement"},
    {id:"psbrand",name:"Marque Planet Sport"},{id:"mix",name:"Product mix"},
    {id:"nouveautes",name:"Nouveautés en rayon"},{id:"creatif",name:"Création de marque"},
    {id:"ambassadeur",name:"Ambassadeurs"}],
  postSlots:[{day:0,cat:"campagne",format:"Carrousel"},{day:2,alt:["engagement","psbrand"],format:"Reel"},
    {day:3,alt:["mix","nouveautes"],format:"Carrousel"},{day:4,cat:"creatif",format:"Reel"},
    {day:6,cat:"ambassadeur",format:"Reel"}],
  reactiveDays:[5], postBrands:{psbrand:"ps",mix:"ps",nouveautes:"ps"},
  categories:[{id:"focus",name:"Focus Produit"},{id:"asset",name:"Focus Campagne"},
    {id:"collection",name:"Collection"},{id:"ambassadeur",name:"Ambassadeurs"},
    {id:"running",name:"Running club"},{id:"event",name:"Events"},{id:"magasin",name:"Contenu magasins"}]
};
var S={db:null,assets:null,sample:null,dl:null,xlsxP:null,ideas:{},rules:JSON.parse(JSON.stringify(DEFRULES)),cfg:JSON.parse(JSON.stringify(DEFAULTS)),days:{},campaigns:{},groups:{},campView:"groups",hideSkel:true,prodView:"kanban",prodScope:"month",fProd:"",fOwner:"",plist:{},selMode:false,sel:{},campMore:false,
       tab:"dash",ym:null,wk:null,calView:"week",scope:"all",
       fBrand:"",fCamp:"",fStatus:"",collapsed:{},draft:[],wq:Promise.resolve()};

function el(t,c,x){var e=document.createElement(t); if(c)e.className=c; if(x!=null)e.textContent=x; return e;}
function $(i){return document.getElementById(i);}
function pad(n){return n<10?"0"+n:""+n;}
function iso(y,m,d){return y+"-"+pad(m+1)+"-"+pad(d);}
function dISO(dt){return iso(dt.getFullYear(),dt.getMonth(),dt.getDate());}
function todayISO(){return dISO(new Date());}
function pISO(s){var p=String(s).split("-");return new Date(+p[0],+p[1]-1,+p[2]);}
function dim(y,m){return new Date(y,m+1,0).getDate();}
function dw(dt){return (dt.getDay()+6)%7;}
function thaw(x){ try{ return JSON.parse(JSON.stringify(x)); }catch(e){ return x; } }
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function addDays(s,n){var d=pISO(s); d.setDate(d.getDate()+n); return dISO(d);}
function shortDate(s){var d=pISO(s); return pad(d.getDate())+" "+MON_S[d.getMonth()];}
function mondayOf(s){var d=pISO(s); d.setDate(d.getDate()-dw(d)); return dISO(d);}
function slug(s){return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,28)||"x";}
function codeOf(n){var w=String(n).toUpperCase().replace(/[^A-Z0-9 ]/g,"").split(/\s+/).filter(Boolean);
  return (w.length>1?w.map(function(x){return x[0];}).join(""):(w[0]||"XX")).slice(0,3);}

function isDark(){var t=document.documentElement.getAttribute("data-theme");
  if(t==="dark")return true; if(t==="light")return false;
  return !!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);}
function bcol(b){ if(!b) return "var(--line-2)"; return isDark()&&b.colorDark?b.colorDark:b.color; }
function brand(id){for(var i=0;i<S.cfg.brands.length;i++) if(S.cfg.brands[i].id===id) return S.cfg.brands[i]; return null;}
function ctype(id){for(var i=0;i<S.cfg.types.length;i++) if(S.cfg.types[i].id===id) return S.cfg.types[i]; return null;}
function cstatus(id){for(var i=0;i<S.cfg.statuses.length;i++) if(S.cfg.statuses[i].id===id) return S.cfg.statuses[i]; return null;}
function statIdx(id){for(var i=0;i<S.cfg.statuses.length;i++) if(S.cfg.statuses[i].id===id) return i; return 0;}
function camp(id){return S.campaigns[id]||null;}
function ccat(id){
  var L=(S.rules.categories||[]).concat(S.rules.postCategories||[]);
  for(var i=0;i<L.length;i++) if(L[i].id===id) return L[i];
  return null;
}
function catsFor(kind){ return (kind==="post"?(S.rules.postCategories||[]):(S.rules.categories||[])); }
function cintent(id){var L=S.rules.intentions||[]; for(var i=0;i<L.length;i++) if(L[i].id===id) return L[i]; return null;}
function qtyOf(it){ var q=parseInt(it&&it.qty,10); return (isNaN(q)||q<1)?1:q; }
function dayCount(day){ var n=0; (day.stories||[]).forEach(function(x){ if(filled(x)) n+=qtyOf(x); }); return n; }
function weekPar(ws){ return Math.abs(Math.floor(pISO(ws).getTime()/86400000/7))%2; }
function pairLabel(bid,par){ var p=(S.rules.pairs||{})[bid]; return p?p[par%p.length]:null; }
function brandLabel(bid,par){ var pl=pairLabel(bid,par); if(pl) return pl; var b=brand(bid); return b?b.name:""; }
function blobUrl(id){ return id?window.claude.assetSrc(id):""; }
/* Les boîtes natives confirm()/prompt() sont bloquées dans l'artefact : dialogues maison */
function closeDlg(){ var h=$("dlgHost"); if(h) h.innerHTML=""; }
function askConfirm(title,text,okLabel,cb,danger){
  var h=$("dlgHost"); h.innerHTML="";
  var sc=el("div","scrim dlg"), bx=el("div","dlgbox");
  bx.setAttribute("role","alertdialog");
  bx.appendChild(el("h3",null,title));
  if(text) bx.appendChild(el("p",null,text));
  var ft=el("div","dfoot");
  var no=el("button","btn sm","Annuler"); no.type="button"; no.onclick=closeDlg;
  var ok=el("button","btn sm "+(danger?"danger":"solid"),okLabel||"Confirmer"); ok.type="button";
  ok.onclick=function(){ closeDlg(); cb(); };
  ft.appendChild(no); ft.appendChild(ok); bx.appendChild(ft);
  sc.onclick=function(e){ if(e.target===sc) closeDlg(); };
  sc.appendChild(bx); h.appendChild(sc);
  setTimeout(function(){ try{ no.focus(); }catch(e){} },0);
}
function askText(title,placeholder,okLabel,cb){
  var h=$("dlgHost"); h.innerHTML="";
  var sc=el("div","scrim dlg"), bx=el("div","dlgbox");
  bx.appendChild(el("h3",null,title));
  var inp=el("input"); inp.type="text"; inp.placeholder=placeholder||""; bx.appendChild(inp);
  var ft=el("div","dfoot");
  var no=el("button","btn sm","Annuler"); no.type="button"; no.onclick=closeDlg;
  var ok=el("button","btn sm solid",okLabel||"Ajouter"); ok.type="button";
  function go(){ var v=inp.value.trim(); if(!v) return; closeDlg(); cb(v); }
  ok.onclick=go; inp.onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); go(); } };
  ft.appendChild(no); ft.appendChild(ok); bx.appendChild(ft);
  sc.onclick=function(e){ if(e.target===sc) closeDlg(); };
  sc.appendChild(bx); h.appendChild(sc);
  setTimeout(function(){ try{ inp.focus(); }catch(e){} },0);
}
function toast(m){var h=$("toastHost"); h.innerHTML=""; var t=el("div","toast",m); h.appendChild(t); setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},2400);}
/* ── déplacement : drag & drop pointeur (souris + tactile) ── */
var DRAG={ref:null,node:null,ghost:null,zone:null,sx:0,sy:0,on:false,just:false,mv:null,up:null,lx:0,ly:0,tm:null};
var UNDO=null;
function snapshot(dates){
  var s={},seen={};
  dates.forEach(function(d){ if(!d||seen[d])return; seen[d]=1; s[d]=S.days[d]?JSON.parse(JSON.stringify(S.days[d])):null; });
  return s;
}
function applySnapshot(s){
  Object.keys(s).forEach(function(d){
    if(s[d]) S.days[d]=s[d]; else delete S.days[d];
    saveDay(d);
  });
}
function clearZone(){ if(DRAG.zone){ DRAG.zone.classList.remove("dropover"); DRAG.zone=null; } }
function beginDrag(x,y){
  if(DRAG.on||!DRAG.node) return;
  DRAG.on=true; document.body.classList.add("dragging");
  var r=DRAG.node.getBoundingClientRect();
  var g=el("div","dghost"); g.style.width=Math.max(150,Math.min(r.width,236))+"px";
  var c=DRAG.node.cloneNode(true); c.style.width="100%"; c.style.margin="0"; g.appendChild(c);
  document.body.appendChild(g); DRAG.ghost=g; moveGhost(x,y);
  /* défilement automatique près des bords : indispensable quand la cible est hors écran */
  DRAG.tm=setInterval(function(){
    var h=window.innerHeight||800, dy=DRAG.ly<70?-16:(DRAG.ly>h-70?16:0);
    if(dy){ window.scrollBy(0,dy); moveGhost(DRAG.lx,DRAG.ly); }
  },16);
}
function moveGhost(x,y){
  if(!DRAG.ghost) return;
  DRAG.lx=x; DRAG.ly=y;
  DRAG.ghost.style.left=x+"px"; DRAG.ghost.style.top=y+"px";
  DRAG.ghost.style.visibility="hidden";
  var elm=document.elementFromPoint(x,y);
  DRAG.ghost.style.visibility="";
  var z=(elm&&elm.closest)?elm.closest("[data-drop]"):null;
  if(z!==DRAG.zone){ clearZone(); if(z){ z.classList.add("dropover"); DRAG.zone=z; } }
}
function dragStart(ev,node,ref,immediate){
  if(ev.pointerType==="mouse"&&ev.button!==0) return;
  DRAG.ref=ref; DRAG.node=node; DRAG.sx=ev.clientX; DRAG.sy=ev.clientY;
  DRAG.mv=function(e){
    if(!DRAG.on){
      if(Math.abs(e.clientX-DRAG.sx)+Math.abs(e.clientY-DRAG.sy)<=7) return;
      beginDrag(e.clientX,e.clientY);
    }
    if(e.cancelable) e.preventDefault();
    moveGhost(e.clientX,e.clientY);
  };
  DRAG.up=function(){ endDrag(); };
  window.addEventListener("pointermove",DRAG.mv,{passive:false});
  window.addEventListener("pointerup",DRAG.up);
  window.addEventListener("pointercancel",DRAG.up);
  if(immediate){ if(ev.cancelable) ev.preventDefault(); beginDrag(ev.clientX,ev.clientY); }
}
function endDrag(){
  window.removeEventListener("pointermove",DRAG.mv);
  window.removeEventListener("pointerup",DRAG.up);
  window.removeEventListener("pointercancel",DRAG.up);
  var was=DRAG.on, ref=DRAG.ref, spec=DRAG.zone?DRAG.zone.getAttribute("data-drop"):null;
  if(DRAG.tm){ clearInterval(DRAG.tm); DRAG.tm=null; }
  if(DRAG.ghost&&DRAG.ghost.parentNode) DRAG.ghost.parentNode.removeChild(DRAG.ghost);
  clearZone(); document.body.classList.remove("dragging");
  DRAG.on=false; DRAG.ghost=null; DRAG.node=null; DRAG.ref=null; DRAG.mv=null; DRAG.up=null;
  if(was){ DRAG.just=true; setTimeout(function(){DRAG.just=false;},320); }
  if(was&&spec&&ref) applyDrop(ref,spec);
}
function applyDrop(ref,spec){
  var p=String(spec).split(":");
  if(p[0]==="day") doMove(ref,{date:p[1],kind:p[2]||null,index:(p[3]!=null&&p[3]!=="")?+p[3]:null});
  else if(p[0]==="week") doMove(ref,{date:addDays(ref.date,(+p[1])*7)});
  else if(p[0]==="status") moveStatus(ref,p[1]);
  else if(p[0]==="group"&&ref&&ref.camp) moveCampToGroup(ref.camp,p[1]);
}
function draggable(node,ref){
  node.addEventListener("pointerdown",function(e){
    if(e.pointerType!=="mouse") return;
    var t=e.target;
    if(t&&t.closest&&t.closest("a,.knav,.grip")) return;
    dragStart(e,node,ref,false);
  });
}
function gripFor(node,ref){
  var g=el("span","grip","⠿"); g.title="Glisser pour déplacer";
  g.addEventListener("pointerdown",function(e){ e.stopPropagation(); dragStart(e,node,ref,true); });
  return g;
}
function doMove(ref,tgt){
  var src=S.days[ref.date]; if(!src) return;
  var arr=ref.kind==="post"?src.posts:src.stories;
  var it=arr[ref.idx]; if(!it) return;
  var tDate=tgt.date||ref.date, tKind=tgt.kind||ref.kind;
  var sameSpot=(tDate===ref.date&&tKind===ref.kind&&(tgt.index==null||tgt.index===ref.idx));
  if(sameSpot) return;
  UNDO=snapshot([ref.date,tDate]);
  arr.splice(ref.idx,1);
  if(tKind!==ref.kind) it.category="";   // les catégories post et story ne se recoupent pas
  if(!S.days[tDate]) S.days[tDate]=emptyDay(tDate);
  var dst=tKind==="post"?S.days[tDate].posts:S.days[tDate].stories;
  var ix=(tgt.index==null)?dst.length:Math.max(0,Math.min(tgt.index,dst.length));
  dst.splice(ix,0,it);
  saveDay(ref.date); if(tDate!==ref.date) saveDay(tDate);
  render();
  var label=tDate!==ref.date?("Déplacé au "+shortDate(tDate)):(tKind!==ref.kind?("Basculé en "+(tKind==="post"?"post":"story")):"Réordonné");
  toastUndo(label);
}
function toastUndo(msg){
  var h=$("toastHost"); h.innerHTML="";
  var t=el("div","toast"); t.appendChild(el("span",null,msg));
  var b=el("button",null,"Annuler"); b.type="button";
  b.onclick=function(){ if(UNDO){ applySnapshot(UNDO); UNDO=null; render(); } h.innerHTML=""; };
  t.appendChild(b); h.appendChild(t);
  setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); },6500);
}
function idxById(arr,id,fallback){ for(var i=0;i<arr.length;i++) if(arr[i]&&id&&arr[i].id===id) return i; return (arr[fallback]?fallback:-1); }
function emptyDay(d){return {date:d,posts:[],stories:[]};}
function dayOf(d){return S.days[d]||emptyDay(d);}
function filled(it){return !!(it&&(it.brand||(it.title&&String(it.title).trim())));}
function pass(it){
  if(S.fBrand&&it.brand!==S.fBrand) return false;
  if(S.fCamp&&it.campaign!==S.fCamp) return false;
  if(S.fStatus&&(it.status||"idee")!==S.fStatus) return false;
  return true;
}
function allItems(from,to){
  var out=[];
  Object.keys(S.days).forEach(function(d){
    if(from&&d<from) return; if(to&&d>to) return;
    var day=S.days[d],i;
    for(i=0;i<day.posts.length;i++) if(filled(day.posts[i])) out.push({date:d,kind:"post",idx:i,it:day.posts[i]});
    for(i=0;i<day.stories.length;i++) if(filled(day.stories[i])) out.push({date:d,kind:"story",idx:i,it:day.stories[i]});
  });
  out.sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:(a.kind==="post"?-1:1);});
  return out;
}
function monthRange(){var y=S.ym.y,m=S.ym.m; return [iso(y,m,1),iso(y,m,dim(y,m))];}
function scoped(l){return S.scope==="all"?l:l.filter(function(r){return r.kind===S.scope;});}

/* ── persistance ── */
function saveDay(d){
  var day=S.days[d]; if(!S.db) return;
  var body=(day&&(day.posts.length||day.stories.length))?{date:d,posts:day.posts,stories:day.stories}:null;
  S.wq=S.wq.then(function(){var r=S.db.doc("days/"+d); return body?r.set(body):r.delete();})
           .catch(function(e){console.warn(e); toast("Enregistrement impossible");});
}
function saveCfg(){
  if(!S.db) return; var c=S.cfg;
  S.wq=S.wq.then(function(){return S.db.doc("config/settings").set({
    brands:c.brands,types:c.types,formats:c.formats,statuses:c.statuses,
    storiesPerDay:c.storiesPerDay,tolerance:c.tolerance});})
    .catch(function(e){console.warn(e); toast("Réglages non enregistrés");});
}
function saveCamp(c){ if(!S.db) return; S.wq=S.wq.then(function(){return S.db.doc("campaigns/"+c.id).set(c);}).catch(function(e){console.warn(e);}); }
function saveIdea(i){ if(!S.db) return; S.wq=S.wq.then(function(){return S.db.doc("ideas/"+i.id).set(i);}).catch(function(e){console.warn(e); toast("Idée non enregistrée");}); }
function delIdea(id){ delete S.ideas[id]; if(!S.db) return; S.wq=S.wq.then(function(){return S.db.doc("ideas/"+id).delete();}).catch(function(e){console.warn(e);}); }
function delCamp(id){ delete S.campaigns[id]; if(!S.db) return; S.wq=S.wq.then(function(){return S.db.doc("campaigns/"+id).delete();}).catch(function(e){console.warn(e);}); }
function setCollapse(k,v){ S.collapsed[k]=v; try{localStorage.setItem("ps_col",JSON.stringify(S.collapsed));}catch(e){} }

/* ── calculs ── */
function dist(items,key,list){
  var c={},t=0,i;
  for(i=0;i<list.length;i++) c[list[i].id]=0;
  for(i=0;i<items.length;i++){var v=items[i].it[key]; if(v&&c.hasOwnProperty(v)){c[v]++;t++;}}
  return {c:c,t:t};
}
function toneFor(d){var a=Math.abs(d); return a<=S.cfg.tolerance?"":(a<=S.cfg.tolerance*2?" w":" a");}
function monthStats(){
  var r=monthRange(),y=S.ym.y,m=S.ym.m,n=dim(y,m),spd=S.cfg.storiesPerDay;
  var all=allItems(r[0],r[1]), items=scoped(all);
  var expected=S.scope==="post"?n:(S.scope==="story"?n*spd:n*(1+spd));
  var holes=0,ready=0,d;
  for(d=1;d<=n;d++){
    var day=S.days[iso(y,m,d)];
    var np=day?day.posts.filter(filled).length:0, ns=day?dayCount(day):0;
    if(np<1||ns<spd) holes++;
  }
  items.forEach(function(x){var s=x.it.status; if(s==="asset"||s==="prog"||s==="pub") ready++;});
  return {all:all,items:items,n:n,expected:expected,holes:holes,ready:ready,
          bd:dist(items,"brand",S.cfg.brands),td:dist(items,"type",S.cfg.types)};
}

/* ── primitives ── */
function cardOf(title,meta,body,key){
  var c=el("div","card");
  var h=el(key?"button":"div","hd"+(key?" clickable":""));
  if(key){
    h.type="button";
    var ch=el("span","chev","▾"); h.appendChild(ch);
    if(S.collapsed[key]) c.className="card closed";
  }
  h.appendChild(el("h3",null,title));
  if(meta) h.appendChild(el("span","meta",meta));
  c.appendChild(h);
  var b=el("div","bd"); b.appendChild(body); c.appendChild(b);
  if(key) h.onclick=function(){
    var now=!c.classList.contains("closed");
    c.classList.toggle("closed",now); setCollapse(key,now);
  };
  return c;
}
function barsBlock(d,list,colored){
  var out=el("div"),wrap=el("div","bars"),max=30,i;
  for(i=0;i<list.length;i++){var pc=d.t?d.c[list[i].id]/d.t*100:0; max=Math.max(max,pc,list[i].target||0);}
  max=Math.ceil(max/10)*10;
  for(i=0;i<list.length;i++){
    var b=list[i],cnt=d.c[b.id]||0,act=d.t?cnt/d.t*100:0,tgt=b.target||0,diff=act-tgt;
    var row=el("div","brow"),nm=el("div","bnm"),sw=el("span","sw");
    sw.style.background=colored?bcol(b):"var(--ink-2)";
    nm.appendChild(sw); nm.appendChild(el("span",null,b.name)); row.appendChild(nm);
    var tr=el("div","track"),fi=el("div","fill");
    fi.style.width=Math.min(100,act/max*100)+"%";
    fi.style.background=colored?bcol(b):"var(--ink-2)";
    if(!d.t) fi.style.opacity=".22";
    tr.appendChild(fi);
    var tk=el("div","tick"); tk.style.left="calc("+Math.min(100,tgt/max*100)+"% - 1px)"; tk.title="Objectif "+tgt+"%";
    tr.appendChild(tk); row.appendChild(tr);
    var bv=el("div","bval");
    bv.appendChild(el("span","pc",Math.round(act)+"%"));
    var dl=el("span","dl"+(d.t?toneFor(diff):" n"),d.t?((diff>=0?"+":"")+Math.round(diff)):"—");
    dl.title=cnt+" slot(s) · objectif "+tgt+"%";
    bv.appendChild(dl); row.appendChild(bv); wrap.appendChild(row);
  }
  out.appendChild(wrap);
  var ax=el("div","axis");
  ax.appendChild(el("span",null,"0%")); ax.appendChild(el("span",null,Math.round(max/2)+"%")); ax.appendChild(el("span",null,max+"%"));
  out.appendChild(ax);
  if(!d.t) out.appendChild(el("div","empty","Aucun slot renseigné sur ce périmètre."));
  return out;
}
function metaBits(it,withStatus){
  var f=document.createDocumentFragment();
  var b=brand(it.brand); if(b) f.appendChild(el("span","bcode",b.code));
  var ty=ctype(it.type); if(ty) f.appendChild(el("span","tmark "+ty.id,ty.short));
  if(it.format) f.appendChild(el("span","stat",it.format));
  if(withStatus){var st=cstatus(it.status); if(st) f.appendChild(el("span","stat s-"+st.id,st.name));}
  return f;
}
function openRef(date,kind,idx){ return function(e){ if(e)e.stopPropagation(); if(DRAG.just) return; openItem({date:date,kind:kind,idx:idx}); }; }
function newAt(date,kind){ return function(e){ if(e)e.stopPropagation(); if(DRAG.just) return; openItem(null,{date:date,kind:kind}); }; }

function goTab(id){ S.tab=id; try{localStorage.setItem("ps_tab",id);}catch(e){} renderTabs(); renderSub(); render(); window.scrollTo(0,0); }
function goMonthCal(){ S.calView="month"; try{localStorage.setItem("ps_calview","month");}catch(e){} goTab("cal"); }
function goWeekOf(date){ S.calView="week"; try{localStorage.setItem("ps_calview","week");}catch(e){} S.wk=mondayOf(date); try{localStorage.setItem("ps_wk",S.wk);}catch(e){} var d=pISO(S.wk); S.ym={y:d.getFullYear(),m:d.getMonth()}; goTab("cal"); }
function dsec(title,sub){
  var h=el("div","grph dsec"); h.appendChild(el("span",null,title));
  if(sub) h.appendChild(el("span","gslots",sub));
  h.appendChild(el("span","ln")); return h;
}
function dsection(key,title,sub,nodes){
  var sec=el("section","dsx"+(S.collapsed["ds:"+key]?" closed":"")); sec.setAttribute("data-ds",key);
  var h=el("button","grph dsec"); h.type="button";
  h.appendChild(el("span","chev","▾"));
  h.appendChild(el("span","dst",title));
  if(sub) h.appendChild(el("span","gslots",sub));
  h.appendChild(el("span","ln"));
  var body=el("div","dsxb"); nodes.forEach(function(n){ body.appendChild(n); });
  h.onclick=function(){ var now=!sec.classList.contains("closed"); sec.classList.toggle("closed",now); setCollapse("ds:"+key,now); };
  sec.appendChild(h); sec.appendChild(body); return sec;
}
function weekStrip(){
  var t=todayISO(), ws=mondayOf(t), spd=S.cfg.storiesPerDay;
  var w=el("div","wstrip");
  for(var i=0;i<7;i++){
    (function(date,i){
      var day=dayOf(date), dt=pISO(date);
      var cell=el("button","wsc"+(date===t?" today":"")+(date<t?" past":"")); cell.type="button";
      var hd=el("div","wsh"); hd.appendChild(el("span","dn",DOWS_S[i])); hd.appendChild(el("b",null,String(dt.getDate()))); cell.appendChild(hd);
      var posts=day.posts.filter(filled);
      if(!posts.length){ cell.appendChild(el("div","wsn","Pas de post")); }
      posts.slice(0,2).forEach(function(p){
        var b=brand(p.brand), r=el("div","wsp"), sw=el("span","sw"); sw.style.background=b?bcol(b):"var(--line-2)";
        r.appendChild(sw); r.appendChild(el("span",null,p.title&&String(p.title).trim()?p.title:(b?b.name:"Post"))); cell.appendChild(r);
      });
      var ns=dayCount(day), tone=ns>=spd?"ok":(ns>0?"w":"a");
      cell.appendChild(el("div","wss "+tone,"ST "+ns+"/"+spd));
      cell.onclick=function(){ goWeekOf(date); };
      w.appendChild(cell);
    })(addDays(ws,i),i);
  }
  return w;
}
/* ══════════ DASHBOARD ══════════ */
function viewDash(){
  var v=$("view"); v.innerHTML="";
  var st=monthStats();
  var cov=st.expected?Math.round(st.items.length/st.expected*100):0;
  var readyPc=st.items.length?Math.round(st.ready/st.items.length*100):0;

  v.appendChild(cardOf("Ajouter des contenus à la volée","Claude structure, tu valides",composeCard(),"compose"));

  var tiles=el("div","tiles");
  function tile(k,val,suffix,sub,pillTxt,cls,go){
    var t=el("div","tile"+(go?" click":""));
    if(go){ t.setAttribute("role","button"); t.tabIndex=0; t.onclick=go; t.onkeydown=function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); go(); } }; }
    t.appendChild(el("div","k",k));
    var vv=el("div","v"); vv.appendChild(document.createTextNode(val));
    if(suffix) vv.appendChild(el("small",null," "+suffix));
    t.appendChild(vv);
    var s=el("div","s");
    if(pillTxt) s.appendChild(el("span","pill"+(cls?" "+cls:""),pillTxt));
    if(sub) s.appendChild(el("span",null,sub));
    t.appendChild(s);
    if(pillTxt&&/%$/.test(pillTxt)){
      var tb=el("div","tbar"),ti=el("i"); ti.style.width=Math.min(100,parseInt(pillTxt,10)||0)+"%"; tb.appendChild(ti); t.appendChild(tb);
      t.setAttribute("data-tone",cls||"");
    }
    tiles.appendChild(t);
  }
  var briefed=st.items.filter(function(r){return !isSkel(r.it);}).length;
  tile("Slots planifiés",String(st.items.length),"/ "+st.expected,"dont "+briefed+" briefé"+(briefed>1?"s":""),cov+"%",cov>=80?"ok":cov>=40?"w":"a",goMonthCal);
  tile("Prêt à publier",String(st.ready),"/ "+st.items.length,"asset validé ou plus",readyPc+"%",readyPc>=70?"ok":readyPc>=35?"w":"a",function(){ goTab("prod"); });
  tile("Jours incomplets",String(st.holes),"/ "+st.n,"sous le minimum",null,null,goMonthCal);
  var acts=Object.keys(S.campaigns).filter(function(k){return S.campaigns[k].status!=="done";}).length;
  tile("Campagnes ouvertes",String(acts),"","brouillon ou en cours",null,null,function(){ goTab("camp"); });
  v.appendChild(dsection("tiles","Chiffres du mois",MONTHS[S.ym.m]+" "+S.ym.y,[tiles]));

  var ws0=mondayOf(todayISO());
  v.appendChild(dsection("week","Cette semaine",shortDate(ws0)+" → "+shortDate(addDays(ws0,6)),[
    cardOf("Semaine en cours","clique un jour pour l'ouvrir",weekStrip(),"wkstrip"),
    cardOf("À traiter",null,todoBlock(),"todo")
  ]));

  var ck=Object.keys(S.campaigns).filter(function(k){return S.campaigns[k].status!=="done";})
    .sort(function(a,b){
      var sa=S.campaigns[a].status==="active"?0:1, sb=S.campaigns[b].status==="active"?0:1;
      if(sa!==sb) return sa-sb;
      return (S.campaigns[a].start||"9999")<(S.campaigns[b].start||"9999")?-1:1;
    });
  if(ck.length){
    v.appendChild(dsection("camps","Campagnes",ck.length+" ouverte"+(ck.length>1?"s":"")+" sur "+Object.keys(S.campaigns).length,[
      cardOf("En cours et à venir","triées : en cours d'abord",campList(ck),"camps")
    ]));
  }

  var grid=el("div","mgrid");
  grid.appendChild(cardOf("Répartition par marque","repère = objectif",barsBlock(st.bd,S.cfg.brands,true),"eqb"));
  grid.appendChild(S.scope==="story"
    ? cardOf("Répartition par catégorie de story",st.items.length+" stories",catBars(st.items),"eqt")
    : cardOf("Répartition par type","repère = objectif",barsBlock(st.td,S.cfg.types,false),"eqt"));
  grid.appendChild(cardOf("Pipeline de production",st.items.length+" slots",pipelineBlock(st.items),"pipe"));
  grid.appendChild(cardOf("Signaux de rythme",null,signalsBlock(st.all),"sig"));
  v.appendChild(dsection("month","Ce mois",MONTHS[S.ym.m]+" "+S.ym.y,[
    grid,
    cardOf("Calendrier type — semaine du "+shortDate(S.wk),"ce que le générateur produit",typeGrid(),"typecal")
  ]));
}
function campList(ck){
  var w=el("div","clist"), lim=S.campMore?ck.length:6;
  ck.slice(0,lim).forEach(function(k){
    var c=S.campaigns[k],b=brand(c.brand),pr=campProgress(c),tm=campTiming(c);
    var row=el("button","crw"); row.type="button";
    row.style.setProperty("--cc",b?bcol(b):"var(--ink-3)");
    var nm=el("span","crn"); var dot=el("span","gdot"); dot.style.background=b?bcol(b):"var(--ink-3)"; nm.appendChild(dot); nm.appendChild(el("b",null,c.name));
    row.appendChild(nm);
    var gc=el("span","crg"); if(groupOf(c)){ var g=S.groups[c.group],gd=el("span","gdot"); gd.style.background=gcol(g); gc.appendChild(gd); gc.appendChild(el("span",null,g.name)); }
    row.appendChild(gc);
    row.appendChild(el("span","ctime"+tm.tone,tm.txt));
    var pg=el("span","crp"),bar=el("span","bar"),fi=el("i"); fi.style.width=pr.pct+"%"; bar.appendChild(fi); pg.appendChild(bar);
    pg.appendChild(el("em",null,pr.n?pr.ready+"/"+pr.n:"—")); row.appendChild(pg);
    row.onclick=function(){ openCampaign(c); };
    w.appendChild(row);
  });
  var ft=el("div","clfoot");
  if(ck.length>6){
    var mb=el("button","btn ghost sm",S.campMore?"Réduire":"Voir les "+(ck.length-6)+" autres"); mb.type="button"; mb.id="campmore";
    mb.onclick=function(){ S.campMore=!S.campMore; render(); }; ft.appendChild(mb);
  }
  var go=el("button","btn ghost sm","Ouvrir l'onglet Campagnes →"); go.type="button"; go.onclick=function(){ goTab("camp"); };
  ft.appendChild(go); w.appendChild(ft);
  return w;
}

/* saisie libre → contenus structurés */
function composeCard(){
  var w=el("div","compose");
  var ta=el("textarea"); ta.id="qa-text";
  ta.placeholder="Décris ce que tu veux poster, en vrac.\nEx : « lundi un reel Asics sur la Gel-Nimbus filmé au Massira, mardi promo rentrée Planet Sport, et 3 stories padel Nox cette semaine »";
  w.appendChild(ta);
  var row=el("div","composeRow");
  var hint=el("div","hint");
  var go=el("button","btn sm solid","Générer le planning");
  var stop=el("button","btn sm","Arrêter"); stop.hidden=true;
  var props=el("div","props"); props.hidden=true;
  var ctl=null;

  if(!S.sample){
    hint.textContent="La génération par Claude n'est pas disponible dans cette vue. Utilise « + Nouveau ».";
    go.disabled=true;
  } else {
    hint.textContent="Claude propose des contenus datés que tu valides avant ajout. Rien n'est enregistré sans ta validation.";
  }
  row.appendChild(hint); row.appendChild(stop); row.appendChild(go);
  w.appendChild(row); w.appendChild(props);

  function renderProps(){
    props.innerHTML="";
    if(!S.draft.length){ props.hidden=true; return; }
    props.hidden=false;
    S.draft.forEach(function(p,i){
      var b=brand(p.brand);
      var row2=el("div","prop");
      var ck=el("input","ck"); ck.type="checkbox"; ck.checked=p._on!==false;
      ck.onchange=function(){ p._on=ck.checked; };
      row2.appendChild(ck);
      var bb=el("div","pb"); bb.style.background=bcol(b); row2.appendChild(bb);
      var pi=el("div","pi");
      pi.appendChild(el("div","pt",p.title||"Sans titre"));
      var pm=el("div","pm");
      pm.appendChild(el("span","udate",shortDate(p.date)));
      pm.appendChild(el("span","stat",p.kind==="story"?"Story":"Post"));
      pm.appendChild(metaBits(p,true));
      var cp=camp(p.campaign); if(cp) pm.appendChild(el("span","stat",cp.name));
      pi.appendChild(pm);
      row2.appendChild(pi);
      var ed=el("button","btn ghost sm","Modifier");
      ed.onclick=function(){
        openItem(null,{date:p.date,kind:p.kind,seedItem:p,fromDraft:p});
      };
      row2.appendChild(ed);
      props.appendChild(row2);
    });
    var act=el("div","composeRow"); act.style.marginTop="4px";
    var n=S.draft.filter(function(p){return p._on!==false;}).length;
    var add=el("button","btn sm solid","Ajouter "+n+" contenu(s) au planning");
    add.onclick=function(){
      var touched={};
      S.draft.forEach(function(p){
        if(p._on===false) return;
        var d=p.date;
        if(!S.days[d]) S.days[d]=emptyDay(d);
        (p.kind==="story"?S.days[d].stories:S.days[d].posts).push({
          id:uid(),brand:p.brand||"",type:p.type||"",format:p.format||"",
          status:p.status||"idee",campaign:p.campaign||"",title:p.title||"",notes:p.notes||"",
          assetId:"",link:""
        });
        touched[d]=1;
      });
      Object.keys(touched).forEach(saveDay);
      S.draft=[]; ta.value=""; render();
      toast(Object.keys(touched).length+" jour(s) mis à jour");
    };
    var drop=el("button","btn ghost sm","Tout écarter");
    drop.onclick=function(){ S.draft=[]; renderProps(); };
    act.appendChild(el("div","grow")); act.appendChild(drop); act.appendChild(add);
    props.appendChild(act);
  }
  renderProps();

  go.onclick=function(){
    var txt=ta.value.trim();
    if(!txt){ toast("Écris d'abord ton idée"); return; }
    if(!S.sample) return;
    go.disabled=true; stop.hidden=false;
    hint.textContent="Claude réfléchit…";
    ctl=new AbortController();
    var ws=S.wk, we=addDays(ws,6);
    var p="Tu aides à planifier le contenu social de Planet Sport, distributeur d'articles de sport au Maroc (30+ magasins, Instagram et Facebook).\n\n"+
      "Date du jour : "+todayISO()+". Semaine affichée : du "+ws+" au "+we+".\n\n"+
      "Marques (id = nom) : "+S.cfg.brands.map(function(b){return b.id+" = "+b.name;}).join(" ; ")+"\n"+
      "Types de contenu (id = nom) : "+S.cfg.types.map(function(t){return t.id+" = "+t.name;}).join(" ; ")+"\n"+
      "Formats possibles : "+S.cfg.formats.join(" ; ")+"\n"+
      "Statuts (id = nom) : "+S.cfg.statuses.map(function(s){return s.id+" = "+s.name;}).join(" ; ")+"\n"+
      "Campagnes existantes (id = nom) : "+(Object.keys(S.campaigns).map(function(k){return k+" = "+S.campaigns[k].name;}).join(" ; ")||"aucune")+"\n\n"+
      "Demande de l'utilisateur :\n\""+txt.slice(0,3000)+"\"\n\n"+
      "Réponds uniquement avec un tableau JSON, un objet par contenu :\n"+
      '[{"date":"AAAA-MM-JJ","kind":"post","brand":"<id>","type":"<id>","format":"<libellé exact>","status":"<id>","campaign":"<id ou chaîne vide>","title":"<angle court en français, 70 caractères max>","notes":"<brief en une phrase, ou chaîne vide>"}]\n\n'+
      "Règles : n'utilise que les id fournis, jamais un nom inventé ; kind vaut \"post\" ou \"story\" ; un seul post par jour sauf demande explicite ; si aucune date n'est précisée, répartis sur les jours de la semaine affichée ; statut \"idee\" par défaut ; titres concrets et vendeurs, jamais de langue de bois marketing, pas d'emoji ; aucun texte en dehors du JSON.";

    S.sample.json(p,{modelTier:"quick",signal:ctl.signal,cache:false}).then(function(arr){
      go.disabled=false; stop.hidden=true;
      if(!Array.isArray(arr)||!arr.length){ hint.textContent="Claude n'a rien proposé. Reformule en précisant les jours et les marques."; return; }
      var ok=[];
      arr.slice(0,25).forEach(function(o){
        if(!o||typeof o!=="object") return;
        var d=String(o.date||"").slice(0,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) d=ws;
        ok.push({date:d,kind:o.kind==="story"?"story":"post",
          brand:brand(o.brand)?o.brand:"", type:ctype(o.type)?o.type:"",
          format:S.cfg.formats.indexOf(o.format)>=0?o.format:"",
          status:cstatus(o.status)?o.status:"idee",
          campaign:camp(o.campaign)?o.campaign:"",
          title:String(o.title||"").slice(0,140), notes:String(o.notes||"").slice(0,400), _on:true});
      });
      S.draft=ok;
      hint.textContent=ok.length+" proposition(s). Décoche ce que tu ne veux pas, puis ajoute.";
      renderProps();
    }).catch(function(e){
      go.disabled=false; stop.hidden=true;
      var c=e&&e.code;
      hint.textContent=
        c==="cancelled"?"Génération arrêtée.":
        c==="not_granted"||c==="sampling_disabled"?"Génération non autorisée sur ce compte.":
        c==="rate_limited"?"Trop de demandes d'affilée. Réessaie dans un moment.":
        c==="invalid_json"?"Réponse illisible. Reformule plus simplement.":
        "La génération a échoué. Réessaie.";
    });
  };
  stop.onclick=function(){ if(ctl) ctl.abort(); };
  return w;
}

function todoBlock(){
  var w=el("div","todo"), t=todayISO();
  var all=allItems();
  var late=all.filter(function(r){return r.date<t&&(r.it.status||"idee")!=="pub"&&!isSkel(r.it);});
  var soon=all.filter(function(r){var s=r.it.status||"idee"; return r.date>=t&&r.date<=addDays(t,3)&&(s==="idee"||s==="brief");});
  var ws=mondayOf(t), spd=S.cfg.storiesPerDay, gaps=[];
  for(var i=0;i<7;i++){
    var d=addDays(ws,i); if(d<t) continue;
    var day=S.days[d];
    var np=day?day.posts.filter(filled).length:0;
    if(np<1) gaps.push(d);
  }
  function group(title,tone,rows,renderRow,emptyTxt){
    var g=el("div","tgroup"), h=el("div","th");
    var d2=el("span","d"); d2.style.background="var("+tone+")"; h.appendChild(d2);
    h.appendChild(el("span",null,title));
    h.appendChild(el("span","n",String(rows.length)));
    g.appendChild(h);
    var ul=el("div","ulist");
    if(!rows.length) ul.appendChild(el("div","empty",emptyTxt));
    rows.slice(0,5).forEach(function(r){ ul.appendChild(renderRow(r)); });
    if(rows.length>5) ul.appendChild(el("div","empty","+ "+(rows.length-5)+" autre(s)"));
    g.appendChild(ul); w.appendChild(g);
  }
  function itemRow(r){
    var b=brand(r.it.brand), row=el("button","urow"); row.type="button";
    var dd=el("span","udate"+(r.date<t?" late":""),shortDate(r.date)); row.appendChild(dd);
    if(r.it.assetId){ var im=el("img","uthumb"); im.src=blobUrl(r.it.assetId); im.alt=""; im.loading="lazy"; row.appendChild(im); }
    else { var bar=el("span","ubar"); bar.style.background=bcol(b); row.appendChild(bar); }
    row.appendChild(el("span","utxt",(r.kind==="story"?"Story · ":"")+(r.it.title||(b?b.name:"Sans titre"))));
    var stt=cstatus(r.it.status); if(stt) row.appendChild(el("span","stat s-"+stt.id,stt.name));
    row.onclick=function(){ openItem(r); };
    return row;
  }
  group("En retard — date passée, brief commencé, pas publié","--alert",late,itemRow,"Rien en retard.");
  group("À produire sous 3 jours","--warn",soon,itemRow,"Aucune urgence de production.");
  var dueIdeas=Object.keys(S.ideas).map(function(k){return S.ideas[k];}).filter(function(i){return i.due&&i.due<=addDays(t,7);})
    .sort(function(a,b){return a.due<b.due?-1:1;});
  if(dueIdeas.length) group("Idées à échéance (7 jours)","--warn",dueIdeas,function(i){
    var row=el("button","urow"); row.type="button";
    row.appendChild(el("span","udate"+(i.due<t?" late":""),shortDate(i.due)));
    var bar=el("span","ubar"); bar.style.background=bcol(brand(i.brand)); row.appendChild(bar);
    row.appendChild(el("span","utxt",i.title||"Sans titre"));
    row.appendChild(el("span","stat","Idée"));
    row.onclick=function(){ openIdea(i); };
    return row;
  },"");
  group("Jours sans post cette semaine","--ink-3",gaps,function(d){
    var row=el("button","urow"); row.type="button";
    row.appendChild(el("span","udate",shortDate(d)));
    var bar=el("span","ubar"); bar.style.background="var(--line-2)"; row.appendChild(bar);
    row.appendChild(el("span","utxt",DOWS[dw(pISO(d))]+" — aucun post prévu"));
    row.appendChild(el("span","stat","Ajouter"));
    row.onclick=function(){ openItem(null,{date:d,kind:"post"}); };
    return row;
  },"La semaine est couverte.");
  return w;
}
function catBars(items){
  var L=S.rules.categories||[], c={},t=0,i;
  for(i=0;i<L.length;i++) c[L[i].id]=0;
  var none=0;
  items.forEach(function(r){ var v=r.it.category; if(v&&c.hasOwnProperty(v)){c[v]++;t++;} else none++; });
  var max=1; L.forEach(function(x){ max=Math.max(max,c[x.id]); }); max=Math.max(max,none);
  var w=el("div","cbars");
  function row(name,n){
    var r=el("div","cbar");
    r.appendChild(el("span",null,name));
    var tk=el("div","tk"),fl=el("div","fl");
    fl.style.width=Math.round(n/max*100)+"%"; if(!n) fl.style.opacity="0";
    tk.appendChild(fl); r.appendChild(tk);
    r.appendChild(el("span","v",String(n)));
    w.appendChild(r);
  }
  L.forEach(function(x){ row(x.name,c[x.id]); });
  if(none) row("Sans catégorie",none);
  if(!items.length) w.appendChild(el("div","empty","Aucune story sur ce périmètre."));
  return w;
}
function pipelineBlock(items){
  var w=el("div");
  var skel=items.filter(function(r){return isSkel(r.it);});
  var rest=items.filter(function(r){return !isSkel(r.it);});
  var counts=S.cfg.statuses.map(function(s){return rest.filter(function(r){return (r.it.status||"idee")===s.id;}).length;});
  var total=counts.reduce(function(a,b){return a+b;},0)+skel.length;
  var st=el("div","stack");
  S.cfg.statuses.forEach(function(s,i){
    if(!counts[i]) return;
    var seg=el("div"); seg.style.flex=counts[i]; seg.style.background=STATUS_TONE[s.id]; seg.title=s.name+" — "+counts[i];
    st.appendChild(seg);
  });
  if(skel.length){ var sg=el("div","skelseg"); sg.style.flex=skel.length; sg.title="Squelettes générés — "+skel.length; st.appendChild(sg); }
  if(!total){var e0=el("div"); e0.style.cssText="flex:1;background:var(--surface-3)"; st.appendChild(e0);}
  w.appendChild(st);
  var leg=el("div","stackleg");
  S.cfg.statuses.forEach(function(s,i){
    var r=el("div","slrow"),sw=el("span","sw");
    sw.style.background=STATUS_TONE[s.id]; r.appendChild(sw);
    r.appendChild(el("span",null,s.name));
    r.appendChild(el("span","c",String(counts[i])));
    leg.appendChild(r);
  });
  var rs=el("div","slrow"),ssw=el("span","sw skelsw"); rs.appendChild(ssw);
  rs.appendChild(el("span",null,"Squelettes (pas encore briefés)"));
  rs.appendChild(el("span","c",String(skel.length))); leg.appendChild(rs);
  w.appendChild(leg); return w;
}
function signalsBlock(all){
  var w=el("div","sig");
  var posts=all.filter(function(r){return r.kind==="post";});
  var repeats=[],run=0,maxRun=0,i;
  for(i=0;i<posts.length;i++){
    if(i>0&&posts[i].it.brand&&posts[i].it.brand===posts[i-1].it.brand){
      if((pISO(posts[i].date)-pISO(posts[i-1].date))/86400000===1){
        var b=brand(posts[i].it.brand);
        repeats.push((b?b.code:"?")+" "+posts[i-1].date.slice(8)+"→"+posts[i].date.slice(8));
      }
    }
    if(posts[i].it.type==="pro"){run++; if(run>maxRun)maxRun=run;} else run=0;
  }
  var weeks={};
  all.forEach(function(r){
    var d=pISO(r.date),th=new Date(d); th.setDate(d.getDate()+3-dw(d));
    var k=th.getFullYear()+"W"+Math.ceil(((th-new Date(th.getFullYear(),0,1))/86400000+1)/7);
    if(!weeks[k]) weeks[k]={edu:0};
    if(r.it.type==="edu") weeks[k].edu++;
  });
  var noEdu=0,k2; for(k2 in weeks) if(!weeks[k2].edu) noEdu++;
  function row(lbl,val,state){
    var r=el("div","sigrow"),d=el("span","d");
    d.style.background="var("+(state==="ok"?"--ok":state==="w"?"--warn":"--alert")+")";
    r.appendChild(d); r.appendChild(el("span",null,lbl)); r.appendChild(el("span","v",val));
    w.appendChild(r);
  }
  row("Même marque 2 jours de suite",repeats.length?repeats.length+"×":"0",repeats.length===0?"ok":repeats.length<=2?"w":"a");
  if(repeats.length) w.appendChild(el("div","sigsub",repeats.slice(0,4).join(" · ")+(repeats.length>4?" …":"")));
  row("Série promo consécutive max",maxRun?maxRun+" posts":"0",maxRun<=2?"ok":maxRun===3?"w":"a");
  row("Semaines sans éducationnel",String(noEdu),noEdu===0?"ok":noEdu===1?"w":"a");
  var nov=all.filter(function(r){return !r.it.assetId;}).length;
  row("Contenus sans visuel",String(nov),nov===0?"ok":nov<=8?"w":"a");
  return w;
}

/* ══════════ CALENDRIER ══════════ */
function viewCal(){
  var v=$("view"); v.innerHTML="";
  if(S.selMode&&S.calView==="week") v.appendChild(selBar());
  if(S.calView==="week"){ v.appendChild(calCampPanel(S.wk,addDays(S.wk,6))); v.appendChild(weekGrid()); equalizeWeek(); }
  else { var mr=monthRange(); v.appendChild(calCampPanel(mr[0],mr[1])); v.appendChild(monthGrid()); }
  var st=monthStats();
  var wrapS=el("div"); wrapS.style.cssText="display:flex;flex-direction:column;gap:12px";
  var bar=el("div","stack"); bar.style.height="14px"; bar.style.marginBottom="0";
  S.cfg.brands.forEach(function(b){
    var n=st.bd.c[b.id]||0; if(!n) return;
    var seg=el("div"); seg.style.flex=n; seg.style.background=bcol(b); seg.title=b.name+" — "+n;
    bar.appendChild(seg);
  });
  if(!st.bd.t){var e0=el("div"); e0.style.cssText="flex:1;background:var(--surface-3)"; bar.appendChild(e0);}
  wrapS.appendChild(bar);
  var leg=el("div"); leg.style.cssText="display:flex;gap:16px;flex-wrap:wrap;font-size:12px";
  S.cfg.brands.forEach(function(b){
    var n=st.bd.c[b.id]||0,act=st.bd.t?n/st.bd.t*100:0,diff=act-(b.target||0);
    var li=el("span"); li.style.cssText="display:flex;align-items:center;gap:6px;color:var(--ink-2)";
    var sw=el("span","sw"); sw.style.background=bcol(b); li.appendChild(sw);
    li.appendChild(el("span",null,b.name));
    var bb=el("b",null,Math.round(act)+"%"); bb.style.cssText="font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums"; li.appendChild(bb);
    li.appendChild(el("span","dl"+(st.bd.t?toneFor(diff):" n"),st.bd.t?((diff>=0?"+":"")+Math.round(diff)):"—"));
    leg.appendChild(li);
  });
  wrapS.appendChild(leg);
  v.appendChild(cardOf("Équilibre du mois — "+MONTHS[S.ym.m]+" "+S.ym.y,
    st.items.length+" slots · "+st.holes+" jours incomplets",wrapS,"calbal"));

  var lg=el("div"); lg.style.cssText="display:flex;gap:20px;flex-wrap:wrap;font-size:12px;color:var(--ink-3);padding:0 2px";
  [["cam","Campagne"],["pro","Promotionnel"],["edu","Éducationnel"]].forEach(function(p){
    var li=el("span"); li.style.cssText="display:flex;align-items:center;gap:6px";
    li.appendChild(el("span","tmark "+p[0],p[0].toUpperCase()));
    li.appendChild(el("span",null,p[1])); lg.appendChild(li);
  });
  v.appendChild(lg);
}

function calCampPanel(from,to){
  var list=Object.keys(S.campaigns).map(function(k){return S.campaigns[k];}).filter(function(c){
    return c.start&&c.end&&c.status!=="done"&&c.start<=to&&c.end>=from;
  }).sort(function(a,b){return a.start<b.start?-1:1;});
  var closed=S.collapsed["calcamps"]!==false;
  var box=el("div","ccp"+(closed?" closed":"")); box.id="calcamps";
  var h=el("button","ccph"); h.type="button";
  h.appendChild(el("span","chev","▾"));
  h.appendChild(el("span","dst","Campagnes sur cette période"));
  h.appendChild(el("span","n",String(list.length)));
  h.onclick=function(){ var now=!box.classList.contains("closed"); box.classList.toggle("closed",now); setCollapse("calcamps",now); };
  box.appendChild(h);
  var body=el("div","ccpb");
  if(!list.length) body.appendChild(el("span","hint","Aucune campagne ouverte sur cette période."));
  list.forEach(function(c){
    var b=brand(c.brand), pr=campProgress(c), chip=el("button","ccpc"); chip.type="button";
    chip.style.setProperty("--cc",b?bcol(b):"var(--ink-3)");
    var d=el("span","gdot"); d.style.background=b?bcol(b):"var(--ink-3)"; chip.appendChild(d);
    chip.appendChild(el("b",null,c.name));
    chip.appendChild(el("span","ccpd",shortDate(c.start)+" → "+shortDate(c.end)));
    chip.appendChild(el("em",null,pr.n?pr.ready+"/"+pr.n+" prêts":"0 contenu"));
    chip.onclick=function(){ openCampaign(c); };
    body.appendChild(chip);
  });
  box.appendChild(body); return box;
}
function selKey(d,k,i){ return d+"|"+k+"|"+i; }
function selToggle(date,kind,idx){
  return function(e){
    if(e) e.stopPropagation(); if(DRAG.just) return;
    var k=selKey(date,kind,idx);
    if(S.sel[k]) delete S.sel[k]; else S.sel[k]={date:date,kind:kind,idx:idx};
    render();
  };
}
function setSelMode(on){ S.selMode=!!on; S.sel={}; renderSub(); render(); }
function bulkApply(fn,msg){
  var refs=Object.keys(S.sel).map(function(k){return S.sel[k];}); if(!refs.length) return;
  var dates={}; refs.forEach(function(r){ dates[r.date]=1; });
  UNDO=snapshot(Object.keys(dates));
  fn(refs);
  Object.keys(dates).forEach(function(d){ saveDay(d); });
  S.sel={}; render(); toastUndo(msg);
}
function selBar(){
  var n=Object.keys(S.sel).length, bar=el("div","selbar"); bar.id="selbar";
  bar.appendChild(el("b",null,n+" sélectionné"+(n>1?"s":"")));
  var all=el("button","btn sm","Toute la semaine"); all.type="button"; all.id="sel-all";
  all.onclick=function(){
    allItems(S.wk,addDays(S.wk,6)).forEach(function(r){ S.sel[selKey(r.date,r.kind,r.idx)]={date:r.date,kind:r.kind,idx:r.idx}; });
    render();
  };
  bar.appendChild(all);
  var ss=el("select","mini"); ss.id="sel-status"; ss.disabled=!n;
  var s0=el("option",null,"Changer le statut…"); s0.value=""; ss.appendChild(s0);
  S.cfg.statuses.forEach(function(x){ var op=el("option",null,x.name); op.value=x.id; ss.appendChild(op); });
  ss.onchange=function(){ var v=ss.value; if(!v) return;
    bulkApply(function(refs){ refs.forEach(function(r){ var d=S.days[r.date]; if(!d) return; var it=(r.kind==="post"?d.posts:d.stories)[r.idx]; if(it) it.status=v; }); },n+" contenu(s) → "+(cstatus(v)||{}).name);
  };
  bar.appendChild(ss);
  var sc=el("select","mini"); sc.id="sel-camp"; sc.disabled=!n;
  var c0=el("option",null,"Rattacher à une campagne…"); c0.value=""; sc.appendChild(c0);
  var cn=el("option",null,"— Retirer de la campagne —"); cn.value="__none"; sc.appendChild(cn);
  Object.keys(S.campaigns).forEach(function(k){ var op=el("option",null,S.campaigns[k].name); op.value=k; sc.appendChild(op); });
  sc.onchange=function(){ var v=sc.value; if(!v) return; var id=v==="__none"?"":v;
    bulkApply(function(refs){ refs.forEach(function(r){ var d=S.days[r.date]; if(!d) return; var it=(r.kind==="post"?d.posts:d.stories)[r.idx]; if(it) it.campaign=id; }); },n+" contenu(s) "+(id?"rattaché(s)":"détaché(s)"));
  };
  bar.appendChild(sc);
  var sp=el("span"); sp.style.flex="1"; bar.appendChild(sp);
  var del=el("button","btn sm danger","Supprimer"); del.type="button"; del.id="sel-del"; del.disabled=!n;
  del.onclick=function(){
    askConfirm("Supprimer "+n+" contenu(s) ?","Ils disparaissent du calendrier (annulable juste après).","Supprimer",function(){
      bulkApply(function(refs){
        refs.sort(function(a,b){ return b.idx-a.idx; }).forEach(function(r){ var d=S.days[r.date]; if(!d) return; (r.kind==="post"?d.posts:d.stories).splice(r.idx,1); });
      },n+" contenu(s) supprimé(s)");
    },true);
  };
  bar.appendChild(del);
  var done=el("button","btn sm solid","Terminer"); done.type="button"; done.onclick=function(){ setSelMode(false); };
  bar.appendChild(done);
  return bar;
}
function openCopyWeek(){
  var h=$("dlgHost"); h.innerHTML="";
  var sc=el("div","scrim dlg"), bx=el("div","dlgbox");
  bx.appendChild(el("h3",null,"Copier la semaine"));
  bx.appendChild(el("p",null,"Semaine du "+shortDate(S.wk)+" au "+shortDate(addDays(S.wk,6))+". Les copies repartent à zéro : statut Idée, sans visuel ni lien. Elles s'ajoutent à ce qui existe déjà."));
  var f=el("div","f"); f.appendChild(el("label",null,"Vers"));
  var sl=el("select"); sl.id="cw-to";
  [1,2,3,4].forEach(function(n){ var op=el("option",null,(n===1?"Semaine suivante":"Dans "+n+" semaines")+" — du "+shortDate(addDays(S.wk,n*7))); op.value=String(n); sl.appendChild(op); });
  f.appendChild(sl); bx.appendChild(f);
  var l=el("label","atchk"), cb=el("input"); cb.type="checkbox"; cb.id="cw-sk"; cb.checked=true; l.appendChild(cb); l.appendChild(el("span",null,"Inclure les squelettes")); bx.appendChild(l);
  var info=el("div","hint");
  bx.appendChild(info);
  function refs(){ return allItems(S.wk,addDays(S.wk,6)).filter(function(r){ return cb.checked||!isSkel(r.it); }); }
  function upd(){
    var n=+sl.value, r=refs(), busy=0;
    for(var i=0;i<7;i++){ var d=S.days[addDays(S.wk,i+n*7)]; if(d&&(d.posts.some(filled)||d.stories.some(filled))) busy++; }
    info.textContent=r.length+" contenu(s) à copier"+(busy?" · "+busy+" jour(s) déjà remplis dans la semaine cible (les copies s'ajoutent)":"")+".";
    ok.disabled=!r.length;
  }
  var ft=el("div","dfoot");
  var no=el("button","btn sm","Annuler"); no.type="button"; no.onclick=closeDlg;
  var ok=el("button","btn sm solid","Copier"); ok.type="button"; ok.id="cw-ok";
  ok.onclick=function(){
    var n=+sl.value, r=refs(), dates={};
    r.forEach(function(x){ dates[addDays(x.date,n*7)]=1; });
    UNDO=snapshot(Object.keys(dates));
    r.forEach(function(x){
      var td=addDays(x.date,n*7); if(!S.days[td]) S.days[td]=emptyDay(td);
      var cl=thaw(x.it); cl.id=uid(); cl.status="idee"; cl.assetId=""; cl.link="";
      (x.kind==="post"?S.days[td].posts:S.days[td].stories).push(cl);
    });
    Object.keys(dates).forEach(function(d){ saveDay(d); });
    closeDlg(); setWeek(addDays(S.wk,n*7)); toastUndo(r.length+" contenu(s) copié(s)");
  };
  sl.onchange=upd; cb.onchange=upd;
  ft.appendChild(no); ft.appendChild(ok); bx.appendChild(ft);
  sc.onclick=function(e){ if(e.target===sc) closeDlg(); };
  sc.appendChild(bx); h.appendChild(sc); upd();
}
function weekGrid(){
  var wrap=el("div","wk"), t=todayISO(), spd=S.cfg.storiesPerDay;
  for(var i=0;i<7;i++){
    var date=addDays(S.wk,i), dt=pISO(date), day=dayOf(date);
    var col=el("div","wcol"+(date===t?" today":"")+(i>=5?" weekend":""));
    col.setAttribute("data-drop","day:"+date+":");
    var h=el("div","wh");
    h.appendChild(el("span","dn",DOWS_S[i]));
    h.appendChild(el("span","dd",String(dt.getDate())));
    var mon=el("span","dn",MON_S[dt.getMonth()]); h.appendChild(mon);
    var np=day.posts.filter(filled).length, ns=dayCount(day);
    var missing=Math.max(0,1-np)+Math.max(0,spd-ns);
    var idle=!day.posts.length&&!day.stories.length;
    if(missing>0){var g=el("span","gp"+(idle?" idle":""),"−"+missing); g.title=missing+" story(ies) à ajouter"; h.appendChild(g);}
    col.appendChild(h);

    var b=el("div","wb");
    var sp=el("div","wsect"); sp.appendChild(el("span",null,"Post"));
    if(np) sp.appendChild(el("span","n",String(np)));
    b.appendChild(sp);
    var pz=el("div","dz"); pz.setAttribute("data-drop","day:"+date+":post");
    if(np){ day.posts.forEach(function(p,ix){ if(filled(p)) pz.appendChild(postCard(date,ix,p)); }); }
    var ap=el("button","addslot"+(np?"":" ghostpost"),"+ Ajouter un post"); ap.type="button"; ap.onclick=newAt(date,"post");
    pz.appendChild(ap); b.appendChild(pz);

    var ss=el("div","wsect"); ss.appendChild(el("span",null,"Stories"));
    var nTot=el("span","n",ns+" / "+spd); nTot.title="Total des stories du jour (quantités comprises) sur ton minimum";
    ss.appendChild(nTot); b.appendChild(ss);
    var sw=el("div","srowW"); sw.setAttribute("data-drop","day:"+date+":story");
    day.stories.forEach(function(p,ix){ if(filled(p)) sw.appendChild(storyRow(date,ix,p)); });
    var as=el("button","addslot","+ Story"); as.type="button"; as.onclick=newAt(date,"story");
    sw.appendChild(as);
    b.appendChild(sw);
    col.appendChild(b);
    wrap.appendChild(col);
  }
  return wrap;
}
function equalizeWeek(){
  var zs=document.querySelectorAll(".wk .dz[data-drop$=':post']"), mx=0, i;
  for(i=0;i<zs.length;i++){ zs[i].style.minHeight=""; }
  for(i=0;i<zs.length;i++){ mx=Math.max(mx,zs[i].offsetHeight); }
  for(i=0;i<zs.length;i++){ zs[i].style.minHeight=mx+"px"; }
}
function postCard(date,idx,it){
  var b=brand(it.brand);
  var c=el("button","pcard"+(pass(it)?"":" dim")); c.type="button";
  c.style.borderLeftColor=bcol(b);
  var th=el("div","pth"+(it.assetId?"":" none"));
  if(it.assetId){
    var im=el("img"); im.src=blobUrl(it.assetId); im.alt=""; im.loading="lazy";
    im.onerror=function(){ th.classList.add("none"); th.textContent="?"; };
    th.appendChild(im);
  } else th.textContent="＋";
  c.appendChild(th);
  var bd=el("div","pb2");
  var tlr=el("div","ptr");
  tlr.appendChild(el("div","tl",it.title&&String(it.title).trim()?it.title:(b?b.name:"Sans titre")));
  tlr.appendChild(gripFor(c,{date:date,kind:"post",idx:idx}));
  bd.appendChild(tlr);
  var mt=el("div","mt"); mt.appendChild(metaBits(it,true)); bd.appendChild(mt);
  var cp=camp(it.campaign);
  if(cp||it.link){
    var mt2=el("div","mt");
    if(cp) mt2.appendChild(el("span","stat",cp.name));
    if(it.link){
      var a=el("a","lk","lien"); a.href=it.link; a.target="_blank"; a.rel="noopener noreferrer";
      a.onclick=function(e){e.stopPropagation();};
      mt2.appendChild(a);
    }
    bd.appendChild(mt2);
  }
  c.appendChild(bd);
  if(S.selMode){ c.onclick=selToggle(date,"post",idx); if(S.sel[selKey(date,"post",idx)]) c.classList.add("sel"); }
  else { c.onclick=openRef(date,"post",idx); draggable(c,{date:date,kind:"post",idx:idx}); }
  return c;
}
function storyRow(date,idx,it){
  var b=brand(it.brand);
  var r=el("button","stw"+(pass(it)?"":" dim")); r.type="button";
  if(it.assetId){ var im=el("img","thb"); im.src=blobUrl(it.assetId); im.alt=""; im.loading="lazy"; r.appendChild(im); }
  else { var bar=el("span","sbar"); bar.style.background=bcol(b); r.appendChild(bar); }
  var si=el("div","si");
  var eyb=el("div","eyb");
  var ct=ccat(it.category);
  var ttl=it.title&&String(it.title).trim()?String(it.title).trim():(b?b.name:"Story");
  function norm(x){ return String(x||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/s$/,"").trim(); }
  var dup=ct&&norm(ct.name)===norm(ttl);
  eyb.appendChild(el("span",null, dup?"":(ct?ct.name:"Story")));
  var q=qtyOf(it); if(q>1) eyb.appendChild(el("span","qty","×"+q));
  si.appendChild(eyb);
  si.appendChild(el("div","st1",ttl));
  var s2=el("div","st2");
  var st=cstatus(it.status); if(st) s2.appendChild(el("span","stat s-"+st.id,st.name));
  var itn=cintent(it.intent); if(itn) s2.appendChild(el("span","intent",itn.name));
  if(s2.childNodes.length) si.appendChild(s2);
  r.appendChild(si);
  r.appendChild(gripFor(r,{date:date,kind:"story",idx:idx}));
  r.setAttribute("data-drop","day:"+date+":story:"+idx);
  if(S.selMode){ r.onclick=selToggle(date,"story",idx); if(S.sel[selKey(date,"story",idx)]) r.classList.add("sel"); }
  else { r.onclick=openRef(date,"story",idx); draggable(r,{date:date,kind:"story",idx:idx}); }
  return r;
}

function monthGrid(){
  var box=el("div");
  var y=S.ym.y,m=S.ym.m,spd=S.cfg.storiesPerDay;
  var dowb=el("div","dow"); for(var i=0;i<7;i++) dowb.appendChild(el("div",null,DOWS_S[i]));
  box.appendChild(dowb);
  var wrap=el("div","calwrap"),grid=el("div","grid"),list=el("div","daylist");
  var first=new Date(y,m,1),lead=dw(first),n=dim(y,m),total=Math.ceil((lead+n)/7)*7,tI=todayISO();
  for(var k=0;k<total;k++){
    var dt=new Date(y,m,1-lead+k),date=dISO(dt),out=dt.getMonth()!==m;
    var cell=el("div","day"+(out?" out":"")+(date===tI?" today":""));
    cell.setAttribute("data-drop","day:"+date+":");
    fillDay(cell,date,spd,out,false); grid.appendChild(cell);
    if(!out){ var card=el("div","dcard"+(date===tI?" today":"")); fillDay(card,date,spd,false,true); list.appendChild(card); }
  }
  wrap.appendChild(grid); box.appendChild(wrap); box.appendChild(list);
  return box;
}
function fillDay(cell,date,spd,isOut,isCard){
  var day=dayOf(date),dt=pISO(date),h=el("div","dh");
  h.appendChild(el("b",null,pad(dt.getDate())));
  if(isCard){var wd=el("span"); wd.style.cssText="font-size:11px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.07em;font-weight:600"; wd.textContent=DOWS[dw(dt)]; h.appendChild(wd);}
  var np=day.posts.filter(filled).length,ns=dayCount(day);
  var missing=Math.max(0,1-np)+Math.max(0,spd-ns);
  var idle=!day.posts.length&&!day.stories.length;
  if(missing>0&&!isOut){var g=el("span","gap"+(idle?" idle":""),"−"+missing); h.appendChild(g);}
  if(!isOut){var add=el("button","add","+"); add.type="button"; add.title="Ajouter un contenu"; add.onclick=newAt(date,"post"); h.appendChild(add);}
  cell.appendChild(h);
  if(np){
    day.posts.forEach(function(p,i){
      if(!filled(p)) return;
      var b=brand(p.brand);
      var s=el("button","slot"+(pass(p)?"":" dim")); s.type="button";
      if(p.assetId){var im=el("img","mini"); im.src=blobUrl(p.assetId); im.alt=""; im.loading="lazy"; s.appendChild(im);}
      else {var bar=el("div","bar"); bar.style.background=bcol(b); s.appendChild(bar);}
      var tx=el("div","tx");
      tx.appendChild(el("div","t1",p.title&&String(p.title).trim()?p.title:(b?b.name:"Sans titre")));
      var t2=el("div","t2"); t2.appendChild(metaBits(p,true));
      s.appendChild(tx); s.onclick=openRef(date,"post",i);
      draggable(s,{date:date,kind:"post",idx:i});
      cell.appendChild(s);
    });
  } else if(!isOut){
    var a=el("button","slot add","+ post"); a.type="button"; a.onclick=newAt(date,"post"); cell.appendChild(a);
  }
  if(isOut&&!day.stories.length) return;
  var sr=el("div","srow"); sr.appendChild(el("span","lb","ST"));
  var n2=Math.max(spd,day.stories.length);
  for(var j=0;j<n2;j++){
    var it=day.stories[j];
    if(it&&filled(it)){
      var br=brand(it.brand),c=el("button","schip"+(pass(it)?"":" dim")); c.type="button";
      var sw=el("span","sw"); sw.style.background=bcol(br); c.appendChild(sw);
      c.appendChild(el("span",null,br?br.code:"—"));
      c.title=(br?br.name+" · ":"")+(it.title||"");
      c.setAttribute("data-drop","day:"+date+":story:"+j);
      c.onclick=openRef(date,"story",j);
      draggable(c,{date:date,kind:"story",idx:j});
      sr.appendChild(c);
    } else if(!isOut){
      var mm=el("button","schip miss","+"); mm.type="button"; mm.title="Ajouter une story";
      mm.onclick=newAt(date,"story"); sr.appendChild(mm);
    }
  }
  cell.appendChild(sr);
}

/* ══════════ CAMPAGNES ══════════ */
function campaignSlots(id){ return allItems().filter(function(r){return r.it.campaign===id;}); }
function typeStack(items){
  var d=dist(items,"type",S.cfg.types),st=el("div","stack");
  st.style.height="10px"; st.style.marginBottom="0";
  var tones=["var(--ink)","var(--ink-2)","var(--ink-3)"];
  S.cfg.types.forEach(function(t,i){
    var n=d.c[t.id]||0; if(!n) return;
    var seg=el("div"); seg.style.flex=n; seg.style.background=tones[i%3]; seg.title=t.name+" — "+n; st.appendChild(seg);
  });
  if(!d.t){var e0=el("div"); e0.style.cssText="flex:1;background:var(--surface-3)"; st.appendChild(e0);}
  return st;
}
function brandChip(b){
  var c=el("span","bchip"),sw=el("span","sw");
  sw.style.background=bcol(b); c.appendChild(sw);
  c.appendChild(el("span",null,b?b.name:"Transverse")); return c;
}
/* ── dossiers (groupes de campagnes) ── */
function gcol(g){ var p=PALETTE[((g&&g.color!=null?+g.color:0)||0)%PALETTE.length]; return isDark()?p.colorDark:p.color; }
function groupList(){
  return Object.keys(S.groups).map(function(k){return S.groups[k];}).sort(function(a,b){
    var d=(a.order||0)-(b.order||0); return d||String(a.name).localeCompare(String(b.name));
  });
}
function groupOf(c){ return (c&&c.group&&S.groups[c.group])?c.group:""; }
function diffDays(a,b){ return Math.round((pISO(b)-pISO(a))/86400000); }
/* squelette = case générée (catégorie posée) jamais travaillée : ni brief, ni asset, ni lien, ni campagne */
function isSkel(it){
  return !!(it&&it.category&&(it.status||"idee")==="idee"&&!(it.notes&&String(it.notes).trim())&&!it.assetId&&!it.link&&!it.campaign);
}
function campProgress(c){
  var s=campaignSlots(c.id),ready=0,pub=0;
  s.forEach(function(r){ var st=r.it.status; if(st==="asset"||st==="prog"||st==="pub") ready++; if(st==="pub") pub++; });
  return {n:s.length,ready:ready,pub:pub,pct:s.length?Math.round(ready/s.length*100):0,slots:s};
}
function campTiming(c){
  var t=todayISO();
  if(c.status==="done") return {txt:"Terminée",tone:""};
  if(!c.start&&!c.end) return {txt:"Sans dates",tone:""};
  if(c.start&&c.start>t){ var d=diffDays(t,c.start); return {txt:d===1?"Démarre demain":"Démarre dans "+d+" j",tone:d<=7?" w":""}; }
  if(c.end&&c.end<t){ var o=diffDays(c.end,t); return {txt:"Dépassée de "+o+" j",tone:" a"}; }
  var left=c.end?diffDays(t,c.end):null;
  var tot=(c.start&&c.end)?diffDays(c.start,c.end)+1:0, k=c.start?diffDays(c.start,t)+1:0;
  return {txt:(tot?"Jour "+k+"/"+tot:"En cours")+(left!=null?" · "+(left===0?"dernier jour":"reste "+left+" j"):""),tone:" ok"};
}
function saveGroup(g){ if(!S.db) return; S.wq=S.wq.then(function(){return S.db.doc("groups/"+g.id).set(g);}).catch(function(e){console.warn(e);}); }
function delGroup(id){ delete S.groups[id]; if(!S.db) return; S.wq=S.wq.then(function(){return S.db.doc("groups/"+id).delete();}).catch(function(e){console.warn(e);}); }
function moveCampToGroup(id,gid){
  var c=S.campaigns[id]; if(!c) return;
  gid=(gid&&S.groups[gid])?gid:"";
  if((c.group||"")===gid) return;
  c.group=gid; saveCamp(c); render();
  toast(gid?("Rangée dans « "+S.groups[gid].name+" »"):"Sortie du dossier");
}
function moveGroup(id,dir){
  var L=groupList(),i=-1,k;
  for(k=0;k<L.length;k++) if(L[k].id===id) i=k;
  var j=i+dir; if(i<0||j<0||j>=L.length) return;
  var t=L[i]; L[i]=L[j]; L[j]=t;
  L.forEach(function(g,n){ if(g.order!==(n+1)*10){ g.order=(n+1)*10; saveGroup(g); } });
  render();
}
function seedGroups(){
  var base=[["Temps forts saisonniers",0],["Lancements produit",1],["Partenariats & ambassadeurs",2],["Magasin & events",3]];
  var o=groupList().length;
  base.forEach(function(p,i){
    var g={id:"g-"+slug(p[0])+"-"+uid().slice(-3),name:p[0],color:p[1],order:(o+i+1)*10};
    S.groups[g.id]=g; saveGroup(g);
  });
  renderSub(); render(); toast("4 dossiers créés — renomme-les ou supprime ceux dont tu n'as pas besoin");
}
function openGroup(g,onDone){
  var creating=!g;
  var m=creating?{id:"",name:"",color:groupList().length%PALETTE.length,order:(groupList().length+1)*10}:thaw(g);
  var h=$("dlgHost"); h.innerHTML="";
  var sc=el("div","scrim dlg"), bx=el("div","dlgbox");
  bx.appendChild(el("h3",null,creating?"Nouveau dossier":"Modifier le dossier"));
  var f=el("div","f"); f.appendChild(el("label",null,"Nom"));
  var inp=el("input"); inp.type="text"; inp.id="gr-name"; inp.value=m.name; inp.placeholder="Ex : Temps forts, Lancements, Partenariats…";
  inp.oninput=function(){ m.name=inp.value; };
  f.appendChild(inp); bx.appendChild(f);
  var f2=el("div","f"); f2.appendChild(el("label",null,"Couleur"));
  var sw=el("div","swr");
  PALETTE.forEach(function(p,i){
    var b=el("button","swb"); b.type="button"; b.style.background=isDark()?p.colorDark:p.color; b.title="Couleur "+(i+1);
    b.setAttribute("aria-pressed",m.color===i?"true":"false");
    b.onclick=function(){ m.color=i; Array.prototype.forEach.call(sw.childNodes,function(x,k){ x.setAttribute("aria-pressed",k===i?"true":"false"); }); };
    sw.appendChild(b);
  });
  f2.appendChild(sw); bx.appendChild(f2);
  var ft=el("div","dfoot");
  if(!creating){
    var del=el("button","btn sm danger","Supprimer"); del.type="button"; del.style.marginRight="auto";
    del.onclick=function(){
      var n=Object.keys(S.campaigns).filter(function(k){return S.campaigns[k].group===m.id;}).length;
      askConfirm("Supprimer le dossier « "+m.name+" » ?",
        n?(n+" campagne(s) y sont rangées : elles restent, sans dossier."):"Il est vide.","Supprimer",function(){
          Object.keys(S.campaigns).forEach(function(k){ var c=S.campaigns[k]; if(c.group===m.id){ c.group=""; saveCamp(c); } });
          delGroup(m.id); renderSub(); render(); toast("Dossier supprimé");
        },true);
    };
    ft.appendChild(del);
  }
  var no=el("button","btn sm","Annuler"); no.type="button"; no.onclick=closeDlg;
  var ok=el("button","btn sm solid",creating?"Créer":"Enregistrer"); ok.type="button";
  function go(){
    if(!String(m.name).trim()){ toast("Donne un nom au dossier"); return; }
    m.name=String(m.name).trim();
    if(creating) m.id="g-"+slug(m.name)+"-"+uid().slice(-3);
    S.groups[m.id]=m; saveGroup(m); closeDlg(); renderSub(); render();
    if(onDone) onDone(m); else toast(creating?"Dossier créé":"Dossier enregistré");
  }
  ok.onclick=go; inp.onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); go(); } };
  ft.appendChild(no); ft.appendChild(ok); bx.appendChild(ft);
  sc.onclick=function(e){ if(e.target===sc) closeDlg(); };
  sc.appendChild(bx); h.appendChild(sc);
  setTimeout(function(){ try{ inp.focus(); }catch(e){} },0);
}
function mergeCamp(srcId,tgtId){
  var src=S.campaigns[srcId],tgt=S.campaigns[tgtId]; if(!src||!tgt||srcId===tgtId) return 0;
  var touched={},n=0;
  allItems().forEach(function(r){ if(r.it.campaign===srcId){ r.it.campaign=tgtId; touched[r.date]=1; n++; } });
  Object.keys(touched).forEach(function(d){ saveDay(d); });
  if(src.notes&&String(src.notes).trim()&&!(tgt.notes&&String(tgt.notes).trim())){ tgt.notes=src.notes; saveCamp(tgt); }
  delCamp(srcId);
  return n;
}
/* rattacher des contenus déjà planifiés à une campagne */
function openAttach(campId,done){
  var c=S.campaigns[campId]; if(!c) return;
  var h=$("dlgHost"); h.innerHTML="";
  var sc=el("div","scrim dlg"), bx=el("div","dlgbox wide");
  bx.appendChild(el("h3",null,"Rattacher à « "+c.name+" »"));
  bx.appendChild(el("p",null,"Contenus du calendrier qui n'appartiennent à aucune campagne."));
  var fl=el("div","atfilters");
  var q=el("input"); q.type="text"; q.id="at-q"; q.placeholder="Rechercher un titre…"; fl.appendChild(q);
  var sb=el("select","mini"); sb.id="at-brand";
  var o0=el("option",null,"Toutes marques"); o0.value=""; sb.appendChild(o0);
  S.cfg.brands.forEach(function(b){ var op=el("option",null,b.name); op.value=b.id; sb.appendChild(op); });
  fl.appendChild(sb); bx.appendChild(fl);
  var opt=el("div","atopts");
  function chk(id,label,on){
    var l=el("label","atchk"),i=el("input"); i.type="checkbox"; i.id=id; i.checked=on;
    l.appendChild(i); l.appendChild(el("span",null,label)); opt.appendChild(l); return i;
  }
  var cUp=chk("at-up","À venir seulement",true), cSk=chk("at-sk","Sans les squelettes",true);
  bx.appendChild(opt);
  var list=el("div","atlist"); bx.appendChild(list);
  var picked={};
  var ft=el("div","dfoot"), cnt=el("span","atcount","0 sélectionné"); cnt.style.marginRight="auto";
  var no=el("button","btn sm","Annuler"); no.type="button"; no.onclick=closeDlg;
  var ok=el("button","btn sm solid","Rattacher"); ok.type="button"; ok.id="at-ok"; ok.disabled=true;
  ft.appendChild(cnt); ft.appendChild(no); ft.appendChild(ok); bx.appendChild(ft);
  function key(r){ return r.date+"|"+r.kind+"|"+r.it.id; }
  function upd(){
    var n=Object.keys(picked).length;
    cnt.textContent=n+" sélectionné"+(n>1?"s":""); ok.disabled=!n; ok.textContent=n?"Rattacher ("+n+")":"Rattacher";
  }
  function paint(){
    list.innerHTML="";
    var t=todayISO(), qq=q.value.trim().toLowerCase(), bf=sb.value;
    var rows=allItems().filter(function(r){
      if(r.it.campaign) return false;
      if(cUp.checked&&r.date<t) return false;
      if(cSk.checked&&isSkel(r.it)) return false;
      if(bf&&r.it.brand!==bf) return false;
      if(qq&&String(r.it.title||"").toLowerCase().indexOf(qq)<0) return false;
      return true;
    });
    if(!rows.length) list.appendChild(el("div","empty","Aucun contenu à rattacher avec ces filtres."));
    rows.slice(0,150).forEach(function(r){
      var b=brand(r.it.brand),lb=el("label","atrow"),cb=el("input"); cb.type="checkbox"; cb.checked=!!picked[key(r)];
      cb.onchange=function(){ if(cb.checked) picked[key(r)]=r; else delete picked[key(r)]; upd(); };
      lb.appendChild(cb);
      lb.appendChild(el("span","udate",shortDate(r.date)));
      var bar=el("span","ubar"); bar.style.background=bcol(b); lb.appendChild(bar);
      lb.appendChild(el("span","utxt",(r.kind==="story"?"Story · ":"")+(r.it.title||(b?b.name:"Sans titre"))));
      var st=cstatus(r.it.status); if(st) lb.appendChild(el("span","stat s-"+st.id,st.name));
      list.appendChild(lb);
    });
    if(rows.length>150) list.appendChild(el("div","empty","+ "+(rows.length-150)+" autres — affine la recherche."));
  }
  q.oninput=paint; sb.onchange=paint; cUp.onchange=paint; cSk.onchange=paint;
  ok.onclick=function(){
    var refs=Object.keys(picked).map(function(k){return picked[k];}), dates={};
    refs.forEach(function(r){ dates[r.date]=1; });
    UNDO=snapshot(Object.keys(dates));
    refs.forEach(function(r){
      var day=S.days[r.date]; if(!day) return;
      var arr=r.kind==="post"?day.posts:day.stories, i=idxById(arr,r.it.id,r.idx);
      if(i>=0) arr[i].campaign=campId;
    });
    Object.keys(dates).forEach(function(d){ saveDay(d); });
    closeDlg(); if(done) done(); render();
    toastUndo(refs.length+" contenu(s) rattaché(s)");
  };
  sc.onclick=function(e){ if(e.target===sc) closeDlg(); };
  sc.appendChild(bx); h.appendChild(sc); paint(); upd();
  setTimeout(function(){ try{ q.focus(); }catch(e){} },0);
}

function ringSvg(pct,n){
  var NS="http://www.w3.org/2000/svg", r=15, C=2*Math.PI*r;
  var svg=document.createElementNS(NS,"svg"); svg.setAttribute("viewBox","0 0 38 38"); svg.setAttribute("class","ring"); svg.setAttribute("aria-hidden","true");
  var t=document.createElementNS(NS,"circle"); t.setAttribute("cx","19"); t.setAttribute("cy","19"); t.setAttribute("r",String(r)); t.setAttribute("fill","none"); t.setAttribute("class","rt"); t.setAttribute("stroke-width","4");
  svg.appendChild(t);
  if(n&&pct>0){
    var f=document.createElementNS(NS,"circle"); f.setAttribute("cx","19"); f.setAttribute("cy","19"); f.setAttribute("r",String(r)); f.setAttribute("fill","none"); f.setAttribute("class","rf"); f.setAttribute("stroke-width","4");
    f.setAttribute("stroke-linecap","round"); f.setAttribute("stroke-dasharray",(C*pct/100)+" "+C); f.setAttribute("transform","rotate(-90 19 19)"); svg.appendChild(f);
  }
  var tx=document.createElementNS(NS,"text"); tx.setAttribute("x","19"); tx.setAttribute("y","23"); tx.setAttribute("text-anchor","middle"); tx.setAttribute("class","rn");
  tx.textContent=n?String(pct):"–"; svg.appendChild(tx);
  return svg;
}
function campaignCard(c,opts){
  opts=opts||{};
  var pr=campProgress(c),b=brand(c.brand),tm=campTiming(c);
  var card=el("button","ccard"); card.type="button";
  card.style.setProperty("--cc",b?bcol(b):"var(--ink-3)");
  var top=el("div","top"); top.style.background=b?bcol(b):"var(--ink-3)"; card.appendChild(top);
  var inn=el("div","in");
  var hd=el("div","chd");
  hd.appendChild(el("h4",null,c.name));
  if(!opts.nodrag) hd.appendChild(gripFor(card,{camp:c.id}));
  inn.appendChild(hd);
  inn.appendChild(el("div","dates",(c.start?shortDate(c.start):"—")+" → "+(c.end?shortDate(c.end):"—")));
  var cr=el("div","crow");
  cr.appendChild(brandChip(b));
  cr.appendChild(el("span","pill"+(c.status==="active"?" ok":c.status==="done"?"":" w"),
    c.status==="active"?"En cours":c.status==="done"?"Terminée":"Brouillon"));
  if(opts.showGroup&&groupOf(c)){
    var g=S.groups[c.group],gc=el("span","gchip"),gd=el("span","gdot"); gd.style.background=gcol(g);
    gc.appendChild(gd); gc.appendChild(el("span",null,g.name)); cr.appendChild(gc);
  }
  inn.appendChild(cr);
  if(c.goal) inn.appendChild(el("div","hint",c.goal));
  if(tm.txt) inn.appendChild(el("div","ctime"+tm.tone,tm.txt));
  var pg=el("div","cprog");
  pg.appendChild(ringSvg(pr.pct,pr.n));
  var pt=el("div","ptxt2");
  pt.appendChild(el("b",null,pr.n?(pr.ready+"/"+pr.n+" prêts"):"Aucun contenu"));
  if(pr.n) pt.appendChild(el("span",null,pr.pub+" publié"+(pr.pub>1?"s":"")));
  pg.appendChild(pt);
  inn.appendChild(pg);
  var cs=el("div","cstat");
  function s2(v,l){var d=el("div"); d.appendChild(el("b",null,v)); d.appendChild(el("span",null,l)); cs.appendChild(d);}
  s2(String(pr.n),"slots");
  s2(String(pr.slots.filter(function(r){return r.kind==="post";}).length),"posts");
  s2(String(pr.ready),"prêts");
  inn.appendChild(cs); card.appendChild(inn);
  card.onclick=function(){ if(DRAG.just) return; openCampaign(c); };
  if(!opts.nodrag) draggable(card,{camp:c.id});
  return card;
}
function campSection(o){
  var sec=el("section","csec"+(S.collapsed["cg:"+o.key]?" closed":""));
  if(o.drop!=null) sec.setAttribute("data-drop","group:"+o.drop);
  sec.setAttribute("data-sec",o.key);
  var h=el("div","grph");
  var ch=el("button","chev","▾"); ch.type="button"; ch.title="Replier / déplier";
  ch.onclick=function(){ var now=!sec.classList.contains("closed"); sec.classList.toggle("closed",now); setCollapse("cg:"+o.key,now); };
  h.appendChild(ch);
  if(o.dot){ var d=el("span","gdot"); d.style.background=o.dot; h.appendChild(d); }
  h.appendChild(el("span","gtitle",o.title));
  h.appendChild(el("span","n",String(o.keys.length)));
  var tot=0; o.keys.forEach(function(k){ tot+=campaignSlots(k).length; });
  h.appendChild(el("span","gslots",tot+" slot"+(tot>1?"s":"")));
  h.appendChild(el("span","ln"));
  if(o.actions){
    var ac=el("div","gact");
    o.actions.forEach(function(a){
      var b=el("button","btn ghost sm",a[0]); b.type="button"; b.title=a[1]; if(a[3]) b.setAttribute("data-act",a[3]); b.onclick=a[2]; ac.appendChild(b);
    });
    h.appendChild(ac);
  }
  sec.appendChild(h);
  if(o.keys.length){
    var g=el("div","cgrid");
    o.keys.forEach(function(k){ g.appendChild(campaignCard(S.campaigns[k],{showGroup:o.showGroup,nodrag:o.nodrag})); });
    sec.appendChild(g);
  } else if(o.emptyTxt){
    sec.appendChild(el("div","cempty",o.emptyTxt));
  }
  return sec;
}
function campTimeline(keys){
  var t=todayISO(),card=el("div","card"),bd=el("div","bd");
  var dated=keys.filter(function(k){return S.campaigns[k].start&&S.campaigns[k].end;});
  var undated=keys.filter(function(k){return !(S.campaigns[k].start&&S.campaigns[k].end);});
  if(!dated.length){
    bd.appendChild(el("div","empty","Aucune campagne avec dates de début et de fin.\nRenseigne-les dans la fiche pour les voir sur la frise."));
  } else {
    var lo=dated.reduce(function(a,k){return S.campaigns[k].start<a?S.campaigns[k].start:a;},"9999-12-31");
    var hi=dated.reduce(function(a,k){return S.campaigns[k].end>a?S.campaigns[k].end:a;},"0000-01-01");
    if(t>=addDays(lo,-30)&&t<lo) lo=t;
    if(t<=addDays(hi,30)&&t>hi) hi=t;
    lo=addDays(lo,-3); hi=addDays(hi,3);
    var span=diffDays(lo,hi)+1;
    var wrap=el("div","tl"); wrap.style.setProperty("--lw","180px");
    var head=el("div","tlrow tlhead"); head.appendChild(el("div","tll"));
    var tr=el("div","tlt"),cur=lo;
    while(cur<=hi){
      var cd=pISO(cur),nx=dISO(new Date(cd.getFullYear(),cd.getMonth()+1,1)),endM=addDays(nx,-1); if(endM>hi) endM=hi;
      var mm=el("div","tlm",MON_S[cd.getMonth()]+(cd.getMonth()===0||cur===lo?" "+String(cd.getFullYear()).slice(2):""));
      mm.style.left=(diffDays(lo,cur)/span*100)+"%"; mm.style.width=((diffDays(cur,endM)+1)/span*100)+"%";
      tr.appendChild(mm); cur=nx;
    }
    head.appendChild(tr); wrap.appendChild(head);
    var body=el("div","tlbody");
    function rowFor(k){
      var c=S.campaigns[k],b=brand(c.brand),pr=campProgress(c);
      var row=el("div","tlrow"),lab=el("button","tll"); lab.type="button";
      var sw=el("span","sw"); sw.style.background=b?bcol(b):"var(--ink-3)"; lab.appendChild(sw); lab.appendChild(el("span",null,c.name));
      lab.onclick=function(){ openCampaign(c); }; row.appendChild(lab);
      var trk=el("div","tlt");
      var s0=c.start<lo?lo:c.start, e0=c.end>hi?hi:c.end;
      var bar=el("button","tlbar"+(c.status==="done"?" done":"")); bar.type="button";
      bar.style.left=(diffDays(lo,s0)/span*100)+"%";
      bar.style.width=Math.max(1.2,(diffDays(s0,e0)+1)/span*100)+"%";
      bar.style.background=b?bcol(b):"var(--ink-3)";
      bar.title=c.name+" · "+shortDate(c.start)+" → "+shortDate(c.end)+" · "+pr.ready+"/"+pr.n+" prêts";
      var pf=el("i"); pf.style.width=pr.pct+"%"; bar.appendChild(pf);
      bar.appendChild(el("span",null,pr.n?(pr.ready+"/"+pr.n):""));
      bar.onclick=function(){ openCampaign(c); };
      trk.appendChild(bar); row.appendChild(trk); return row;
    }
    var gl=groupList().map(function(g){return {id:g.id,title:g.name,dot:gcol(g)};});
    gl.push({id:"",title:"Sans dossier",dot:""});
    var multi=groupList().length>0;
    gl.forEach(function(g){
      var ks=dated.filter(function(k){return groupOf(S.campaigns[k])===g.id;});
      if(!ks.length) return;
      if(multi){
        var gh=el("div","tlgh"); if(g.dot){ var dd=el("span","gdot"); dd.style.background=g.dot; gh.appendChild(dd); }
        gh.appendChild(el("span",null,g.title)); body.appendChild(gh);
      }
      ks.sort(function(a,b){return S.campaigns[a].start<S.campaigns[b].start?-1:1;}).forEach(function(k){ body.appendChild(rowFor(k)); });
    });
    if(t>=lo&&t<=hi){
      var tl=el("div","tltoday"); tl.style.left="calc(var(--lw) + (100% - var(--lw)) * "+((diffDays(lo,t)+.5)/span)+")";
      tl.appendChild(el("span",null,"Auj.")); body.appendChild(tl);
    }
    wrap.appendChild(body);
    var sc=el("div","tlscroll"); sc.appendChild(wrap); bd.appendChild(sc);
  }
  if(undated.length){
    var u=el("div","tlund"); u.appendChild(el("span","secttl","Sans dates"));
    undated.forEach(function(k){ var b=el("button","bchip",S.campaigns[k].name); b.type="button"; b.onclick=function(){ openCampaign(S.campaigns[k]); }; u.appendChild(b); });
    bd.appendChild(u);
  }
  card.appendChild(bd); return card;
}
function viewCamp(){
  var v=$("view"); v.innerHTML="";
  var keys=Object.keys(S.campaigns).sort(function(a,b){return (S.campaigns[a].start||"9999")<(S.campaigns[b].start||"9999")?-1:1;});
  // doublons de nom : la cause la plus fréquente d'un « ça s'est remplacé »
  var seen={},dups=[];
  keys.forEach(function(k){
    var n=String(S.campaigns[k].name||"").trim().toLowerCase().replace(/\s+/g," ");
    if(!n) return;
    if(seen[n]) { if(dups.indexOf(seen[n])<0) dups.push(seen[n]); }
    else seen[n]=S.campaigns[k].name;
  });
  if(dups.length){
    var w=el("div","dupw");
    w.appendChild(el("span",null,"⚠"));
    w.appendChild(el("span",null,"Plusieurs campagnes portent le même nom : "+dups.join(", ")+". Elles existent bien toutes — ouvre-les pour les fusionner, les renommer ou en supprimer."));
    v.appendChild(w);
  }
  if(!keys.length){
    var c=el("div","card"),bd=el("div","bd");
    bd.style.cssText="padding:60px 24px;text-align:center";
    bd.appendChild(el("div","empty","Aucune campagne pour l'instant.\nUne campagne regroupe les contenus d'un même temps fort — rentrée, Black Friday, lancement produit — et te dit combien de slots elle consomme vraiment."));
    var btn=el("button","btn solid sm","+ Créer une campagne"); btn.style.marginTop="14px";
    btn.onclick=function(){ openCampaign(null); };
    bd.appendChild(btn); c.appendChild(bd); v.appendChild(c); return;
  }
  var mode=S.campView||"groups";
  if(mode==="timeline"){ v.appendChild(campTimeline(keys)); return; }
  var wrap=el("div","grp");
  if(mode==="groups"){
    var GL=groupList();
    if(!GL.length){
      var gh=el("div","ghint");
      gh.appendChild(el("span",null,"Range tes campagnes en dossiers libres (saisons, lancements, partenariats…) puis glisse-les d'un dossier à l'autre."));
      var b1=el("button","btn sm","+ Créer un dossier"); b1.type="button"; b1.onclick=function(){ openGroup(null); };
      var b2=el("button","btn sm ghost","Dossiers types"); b2.type="button"; b2.title="Crée 4 dossiers de départ"; b2.onclick=seedGroups;
      gh.appendChild(b1); gh.appendChild(b2); v.appendChild(gh);
    }
    GL.forEach(function(g,i){
      var ks=keys.filter(function(k){return groupOf(S.campaigns[k])===g.id;});
      wrap.appendChild(campSection({key:g.id,drop:g.id,title:g.name,dot:gcol(g),keys:ks,
        emptyTxt:"Dossier vide — glisse une campagne ici.",
        actions:[
          ["↑","Monter le dossier",function(){ moveGroup(g.id,-1); },"up"],
          ["↓","Descendre le dossier",function(){ moveGroup(g.id,1); },"down"],
          ["✎","Renommer / changer la couleur",function(){ openGroup(g); },"edit"],
          ["+","Nouvelle campagne dans ce dossier",function(){ openCampaign(null,{group:g.id}); },"add"]
        ]}));
    });
    var loose=keys.filter(function(k){return !groupOf(S.campaigns[k]);});
    if(loose.length||GL.length){
      wrap.appendChild(campSection({key:"_",drop:"",title:GL.length?"Sans dossier":"Toutes les campagnes",keys:loose,
        emptyTxt:"Rien ici — glisse une campagne pour la sortir de son dossier."}));
    }
  } else if(mode==="brand"){
    S.cfg.brands.concat([null]).forEach(function(b){
      var ks=keys.filter(function(k){ var cb=S.campaigns[k].brand||""; return b?cb===b.id:!brand(cb); });
      if(!ks.length) return;
      wrap.appendChild(campSection({key:"b:"+(b?b.id:"_"),title:b?b.name:"Transverse",dot:b?bcol(b):null,keys:ks,showGroup:true,nodrag:true}));
    });
  } else {
    [["active","En cours"],["draft","Brouillon"],["done","Terminées"]].forEach(function(gr){
      var ks=keys.filter(function(k){ return (S.campaigns[k].status||"draft")===gr[0]; });
      if(!ks.length) return;
      wrap.appendChild(campSection({key:"s:"+gr[0],title:gr[1],keys:ks,showGroup:true,nodrag:true}));
    });
  }
  v.appendChild(wrap);
}

/* ══════════ IDÉES — à communiquer plus tard ══════════ */
function hostOf(u){ try{ return new URL(u).hostname.replace(/^www\./,""); }catch(e){ return String(u||"").replace(/^https?:\/\//,"").split("/")[0]; } }
function safeUrl(u){ u=String(u||"").trim(); return /^https?:\/\//i.test(u)?u:(u?"https://"+u:""); }
function ideaCard(o){
  var c=el("div","idea"), b=brand(o.brand), ct=ccat(o.category);
  if(o.assetId){
    var cv=el("button","icover"); cv.type="button"; cv.title="Voir en grand";
    var im=el("img"); im.src=blobUrl(o.assetId); im.alt=""; im.loading="lazy";
    im.onerror=function(){ cv.style.display="none"; };
    cv.appendChild(im); cv.onclick=function(){ openLightbox(blobUrl(o.assetId),o.title||""); };
    c.appendChild(cv);
  }
  c.appendChild(el("h4",null,o.title||"Sans titre"));
  if(o.why){ var wy=el("div","iwhy"); wy.appendChild(el("span",null,"Pour")); wy.appendChild(el("p",null,o.why)); c.appendChild(wy); }
  if(o.due){
    var dd=diffDays(todayISO(),o.due), dt=el("div","when due"+(dd<0?" a":dd<=7?" w":""),
      "À faire avant le "+shortDate(o.due)+(dd<0?" · dépassée":dd===0?" · aujourd'hui":dd<=7?" · dans "+dd+" j":""));
    c.appendChild(dt);
  }
  if(o.when) c.appendChild(el("div","when","⏱ "+o.when));
  if(o.note) c.appendChild(el("div","nt",o.note));
  if(o.link){
    var lk=el("a","ilink"); lk.href=safeUrl(o.link); lk.target="_blank"; lk.rel="noopener noreferrer";
    lk.appendChild(el("span",null,"↗")); lk.appendChild(el("span",null,hostOf(o.link))); c.appendChild(lk);
  }
  var mt=el("div","mt");
  if(b){ var sw=el("span","sw"); sw.style.background=bcol(b); mt.appendChild(sw); mt.appendChild(el("span","bcode",b.name)); }
  if(ct) mt.appendChild(el("span","cat",ct.name));
  if(o.group&&S.groups[o.group]){ var gg=el("span","gchip"),gd=el("span","gdot"); gd.style.background=gcol(S.groups[o.group]); gg.appendChild(gd); gg.appendChild(el("span",null,S.groups[o.group].name)); mt.appendChild(gg); }
  if(mt.childNodes.length) c.appendChild(mt);
  var ax=el("div","ax");
  var pl=el("button","btn sm solid","Planifier"); pl.type="button";
  pl.onclick=function(){
    openItem(null,{date:todayISO(),kind:"story",fromIdea:o.id,
      seedItem:{brand:o.brand||"",type:"",format:"Story native",status:"idee",campaign:"",
                title:o.title||"",category:o.category||"",
                notes:[o.why?("Pour : "+o.why):"",o.note||"",o.link?("Inspiration : "+o.link):""].filter(Boolean).join("\n")}});
  };
  var tc=el("button","btn sm","→ Campagne"); tc.type="button"; tc.title="Créer une campagne à partir de cette idée"; tc.setAttribute("data-act","toCamp");
  tc.onclick=function(){ openCampaign(null,{fromIdea:o}); };
  var ed=el("button","btn sm","Modifier"); ed.type="button"; ed.onclick=function(){ openIdea(o); };
  var rm=el("button","btn sm ghost","Supprimer"); rm.type="button";
  rm.onclick=function(){ askConfirm("Supprimer cette idée ?",o.title||"","Supprimer",function(){ delIdea(o.id); render(); toast("Idée supprimée"); },true); };
  ax.appendChild(pl); ax.appendChild(tc); ax.appendChild(ed); ax.appendChild(el("div")).style.flex="1"; ax.appendChild(rm);
  c.appendChild(ax);
  return c;
}
function viewIdeas(){
  var v=$("view"); v.innerHTML="";
  var q=el("div","qadd");
  var inp=el("input"); inp.type="text"; inp.id="idea-quick";
  inp.placeholder="Une idée, un sujet, un truc à communiquer plus tard…";
  var add=el("button","btn sm solid","Ajouter");
  function doAdd(){
    var t=inp.value.trim(); if(!t) return;
    var o={id:uid(),title:t,note:"",brand:"",category:"",when:"",why:"",link:"",assetId:"",created:todayISO()};
    S.ideas[o.id]=o; saveIdea(o); inp.value=""; render();
    setTimeout(function(){ var n=$("idea-quick"); if(n) n.focus(); },50);
  }
  add.onclick=doAdd;
  inp.onkeydown=function(e){ if(e.key==="Enter") doAdd(); };
  q.appendChild(inp); q.appendChild(add);
  v.appendChild(cardOf("Nouvelle idée","Entrée pour ajouter",q));

  var keys=Object.keys(S.ideas).sort(function(a,b){
    var da=S.ideas[a].due||"9999", db=S.ideas[b].due||"9999";
    if(da!==db) return da<db?-1:1;
    return (S.ideas[b].created||"")<(S.ideas[a].created||"")?-1:1;
  });
  if(!keys.length){
    var c=el("div","card"),bd=el("div","bd");
    bd.style.cssText="padding:56px 24px;text-align:center";
    bd.appendChild(el("div","empty","Rien en attente.\nTout ce que tu veux communiquer un jour sans savoir quand : une arrivée produit, un sujet de fond, une idée de réactivation. Tu le poses ici, tu le planifies quand le moment arrive."));
    c.appendChild(bd); v.appendChild(c); return;
  }
  var g=el("div","cgrid");
  keys.forEach(function(k){ g.appendChild(ideaCard(S.ideas[k])); });
  v.appendChild(cardOf("À planifier",keys.length+(keys.length>1?" idées":" idée"),g));
}
function openIdea(o){
  var host=$("modalHost"), creating=!o;
  var m=creating?{id:uid(),title:"",note:"",brand:"",category:"",when:"",why:"",link:"",assetId:"",created:todayISO()}:JSON.parse(JSON.stringify(o));
  var scrim=el("div","scrim"),sheet=el("div","sheet wide"),head=el("div","sh");
  var ab=el("div","accentbar"); ab.style.background=bcol(brand(m.brand)); head.appendChild(ab);
  var ht=el("div"); ht.style.flex="1";
  ht.appendChild(el("h2",null,creating?"Nouvelle idée":"Idée"));
  ht.appendChild(el("div","sub","À planifier")); head.appendChild(ht);
  var x=el("button","btn icon","✕"); x.onclick=close; head.appendChild(x);
  sheet.appendChild(head);
  var body=el("div","sb fiche"), cols=el("div","fx"), L=el("div","fxl"), R=el("div","fxr");

  /* inspiration visuelle */
  var prev=el("button","fprev"); prev.type="button";
  function paintPrev(){
    prev.innerHTML=""; prev.classList.toggle("has",!!m.assetId);
    if(m.assetId){
      var im=el("img"); im.src=blobUrl(m.assetId); im.alt="";
      im.onerror=function(){ prev.innerHTML=""; prev.classList.remove("has"); prev.appendChild(el("span",null,"visuel introuvable")); };
      prev.appendChild(im); prev.appendChild(el("span","zoomtag","⤢ Agrandir"));
    } else prev.appendChild(el("span",null,"Image d'inspiration"));
  }
  paintPrev();
  prev.onclick=function(){ if(m.assetId) openLightbox(blobUrl(m.assetId),m.title||""); };
  var drop=el("label","drop"), fi=el("input"); fi.type="file"; fi.accept="image/png,image/jpeg,image/webp,image/gif"; fi.hidden=true; fi.id="id-file";
  drop.appendChild(document.createTextNode("Dépose, colle (Ctrl+V) ou clique pour ajouter une image")); drop.appendChild(fi);
  var mrow=el("div"); mrow.style.cssText="display:flex;gap:8px;align-items:center;flex-wrap:wrap";
  var rmb=el("button","btn ghost sm","Retirer"); rmb.type="button"; rmb.hidden=!m.assetId; rmb.onclick=function(){ m.assetId=""; paintPrev(); rmb.hidden=true; };
  var mstat=el("span","hint"); mstat.style.flex="1";
  if(!S.assets){ drop.style.display="none"; mstat.textContent="L'envoi d'images n'est pas disponible dans cette vue."; }
  mrow.appendChild(rmb); mrow.appendChild(mstat);
  function handleFile(f){
    if(!f||!S.assets) return;
    if(f.size>20*1024*1024){ mstat.textContent="Fichier trop lourd (20 Mo maximum)."; return; }
    mstat.textContent="Envoi…";
    S.assets.upload(f).then(function(res){ m.assetId=res.id; paintPrev(); rmb.hidden=false; mstat.textContent="Image prête"; })
      .catch(function(e){ var c=e&&e.code; mstat.textContent=c==="too_large"?"Fichier trop lourd.":c==="unsupported_type"?"Format non accepté (PNG, JPEG, WebP, GIF).":c==="quota_or_state"?"Espace de stockage plein.":"Envoi impossible."; });
  }
  fi.onchange=function(){ handleFile(fi.files&&fi.files[0]); };
  drop.addEventListener("dragover",function(e){e.preventDefault(); drop.classList.add("over");});
  drop.addEventListener("dragleave",function(){drop.classList.remove("over");});
  drop.addEventListener("drop",function(e){ e.preventDefault(); drop.classList.remove("over"); handleFile(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]); });
  scrim.addEventListener("paste",function(e){ var f2=e.clipboardData&&e.clipboardData.files; if(f2&&f2.length&&/^image\//.test(f2[0].type)){ e.preventDefault(); handleFile(f2[0]); } });
  L.appendChild(prev); L.appendChild(drop); L.appendChild(mrow);

  var f1=el("div","f"); f1.appendChild(el("label",null,"Sujet"));
  var i1=el("input"); i1.type="text"; i1.id="id-title"; i1.value=m.title; i1.className="bigin"; i1.oninput=function(){ m.title=i1.value; };
  f1.appendChild(i1); R.appendChild(f1);
  var fy=el("div","f"); fy.appendChild(el("label",null,"À quoi sert cette idée ?"));
  var ty=el("textarea"); ty.id="id-why"; ty.value=m.why||""; ty.rows=2;
  ty.placeholder="Objectif en une phrase : réactiver les clients Asics, préparer le Black Friday, donner un visage à la marque…";
  ty.oninput=function(){ m.why=ty.value; };
  fy.appendChild(ty); R.appendChild(fy);
  var fl=el("div","f"); fl.appendChild(el("label",null,"Lien d'inspiration (compte, post, article, vidéo…)"));
  var lw=el("div","linkrow");
  var il=el("input"); il.type="url"; il.id="id-link"; il.value=m.link||""; il.placeholder="https://…";
  var lopen=el("a","btn sm","Ouvrir ↗"); lopen.target="_blank"; lopen.rel="noopener noreferrer";
  function paintLink(){ var u=safeUrl(il.value); lopen.hidden=!u; if(u) lopen.href=u; }
  il.oninput=function(){ m.link=il.value.trim(); paintLink(); };
  paintLink(); lw.appendChild(il); lw.appendChild(lopen); fl.appendChild(lw); R.appendChild(fl);

  function sel2(label,val,opts,ph,on,id){
    var f=el("div","f"); f.appendChild(el("label",null,label));
    var sl=el("select"); sl.id=id;
    var o0=el("option",null,ph); o0.value=""; sl.appendChild(o0);
    opts.forEach(function(x2){var op=el("option",null,x2.name); op.value=x2.id; if(x2.id===val)op.selected=true; sl.appendChild(op);});
    sl.onchange=function(){ on(sl.value); };
    f.appendChild(sl); return f;
  }
  var r=el("div","frow three");
  r.appendChild(sel2("Marque",m.brand,S.cfg.brands,"—",function(v){m.brand=v; ab.style.background=bcol(brand(v));},"id-brand"));
  r.appendChild(sel2("Catégorie",m.category,S.rules.categories||[],"—",function(v){m.category=v;},"id-cat"));
  var fw=el("div","f"); fw.appendChild(el("label",null,"Quand, à peu près"));
  var iw=el("input"); iw.type="text"; iw.id="id-when"; iw.value=m.when||""; iw.placeholder="Ex : après le 15 oct"; iw.oninput=function(){ m.when=iw.value; };
  fw.appendChild(iw); r.appendChild(fw);
  R.appendChild(r);
  var r2i=el("div","frow");
  var fdue=el("div","f"); fdue.appendChild(el("label",null,"À faire avant le"));
  var idue=el("input"); idue.type="date"; idue.id="id-due"; idue.value=m.due||""; idue.onchange=function(){ m.due=idue.value; };
  fdue.appendChild(idue); r2i.appendChild(fdue);
  r2i.appendChild(sel2("Dossier",m.group||"",groupList(),"Sans dossier",function(v){m.group=v;},"id-group"));
  R.appendChild(r2i);
  var f2=el("div","f"); f2.appendChild(el("label",null,"Notes"));
  var t2=el("textarea"); t2.id="id-note"; t2.value=m.note||"";
  t2.placeholder="Angle, contexte, ce qui déclenche, qui fournit le visuel…";
  t2.oninput=function(){ m.note=t2.value; };
  f2.appendChild(t2); R.appendChild(f2);
  cols.appendChild(L); cols.appendChild(R); body.appendChild(cols); sheet.appendChild(body);
  var foot=el("div","sf");
  if(!creating){
    var del=el("button","btn sm danger","Supprimer");
    del.onclick=function(){ askConfirm("Supprimer cette idée ?",m.title||"","Supprimer",function(){ delIdea(m.id); close(); render(); toast("Idée supprimée"); },true); };
    foot.appendChild(del);
  }
  var sp=el("div"); sp.style.flex="1"; foot.appendChild(sp);
  var cancel=el("button","btn sm","Annuler"); cancel.onclick=close; foot.appendChild(cancel);
  var ok=el("button","btn sm solid",creating?"Ajouter":"Enregistrer");
  function save(){
    if(!String(m.title).trim()){ toast("Donne un sujet à l'idée"); return; }
    S.ideas[m.id]=m; saveIdea(m); close(); renderSub(); render();
  }
  ok.onclick=save;
  scrim.addEventListener("keydown",function(e){ if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); save(); } });
  foot.appendChild(ok); sheet.appendChild(foot);
  function close(){ host.innerHTML=""; }
  scrim.onclick=function(e){ if(e.target===scrim) close(); };
  scrim.appendChild(sheet); host.innerHTML=""; host.appendChild(scrim);
  setTimeout(function(){ try{ i1.focus(); }catch(e){} },40);
}

/* ══════════ CALENDRIER TYPE ══════════ */
function typeGrid(){
  var plan=genWeek(S.wk), R=S.rules;
  var cats=(R.order||[]).map(function(id){ return ccat(id)||{id:id,name:id}; });
  var box=el("div","tgrid"), t=el("table");
  var th=el("thead"), hr=el("tr");
  hr.appendChild(el("th",null,""));
  DOWS_S.forEach(function(d){ hr.appendChild(el("th",null,d)); });
  th.appendChild(hr); t.appendChild(th);
  var tb=el("tbody");
  cats.forEach(function(c){
    var tr=el("tr");
    tr.appendChild(el("th",null,c.name));
    plan.forEach(function(day){
      var hits=day.items.filter(function(i2){ return i2.category===c.id; });
      var td=el("td");
      if(!hits.length){ td.textContent="·"; td.style.color="var(--line-2)"; }
      else{
        td.className="on";
        hits.forEach(function(i2,ix){
          if(ix) td.appendChild(document.createTextNode(" "));
          var b=brand(i2.brand);
          if(b){ var dot=el("span","tdot"); dot.style.background=bcol(b); td.appendChild(dot); }
          var q=qtyOf(i2);
          td.appendChild(document.createTextNode(i2.title+(q>1?" ×"+q:"")));
        });
      }
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  var tf=el("tfoot"), fr=el("tr");
  fr.appendChild(el("th",null,"Total"));
  var grand=0;
  plan.forEach(function(day){
    var n=day.items.reduce(function(a,i2){return a+qtyOf(i2);},0); grand+=n;
    fr.appendChild(el("td",null,String(n)));
  });
  tf.appendChild(fr); t.appendChild(tf);
  box.appendChild(t);
  var w=el("div");
  w.appendChild(box);
  var note=el("div","hint"); note.style.marginTop="12px";
  note.textContent="Total de "+grand+" stories sur la semaine. Les marques pairées alternent d'une semaine à l'autre, le tableau montre la semaine affichée dans le calendrier.";
  w.appendChild(note);
  return w;
}

/* ══════════ PRODUCTION ══════════ */
function ownerOf(it){ return String(it.owner||"").trim(); }
function prodFilter(rows,skipType){
  return rows.filter(function(r){
    if(!skipType&&S.fProd&&prodKind(r.it)!==S.fProd) return false;
    if(S.fOwner){ var w=ownerOf(r.it); if(S.fOwner==="__none"?w!=="":w!==S.fOwner) return false; }
    return true;
  });
}
function patchItem(ref,patch,msg){
  var day=S.days[ref.date]; if(!day) return;
  var arr=ref.kind==="post"?day.posts:day.stories, it=arr[ref.idx]; if(!it) return;
  UNDO=snapshot([ref.date]);
  Object.keys(patch).forEach(function(k){ it[k]=patch[k]; });
  saveDay(ref.date); renderSub(); render();
  if(msg) toastUndo(msg);
}
function ownerSelect(r){
  var sel=el("select","mini pown"); sel.title="Responsable"; sel.setAttribute("data-f","owner");
  var cur=ownerOf(r.it), o0=el("option",null,"— qui ?"); o0.value=""; sel.appendChild(o0);
  var list=allOwners(); if(cur&&list.indexOf(cur)<0) list.push(cur);
  list.forEach(function(w){ var op=el("option",null,w); op.value=w; if(w===cur) op.selected=true; sel.appendChild(op); });
  var on=el("option",null,"+ Nouveau…"); on.value="__new"; sel.appendChild(on);
  if(!cur) sel.value="";
  sel.onclick=function(e){ e.stopPropagation(); };
  sel.onchange=function(){
    if(sel.value==="__new"){
      sel.value=cur;
      askText("Responsable","Prénom, agence, freelance…","Affecter",function(v){ patchItem(r,{owner:v},"Affecté à "+v); });
      return;
    }
    patchItem(r,{owner:sel.value},sel.value?"Affecté à "+sel.value:"Responsable retiré");
  };
  return sel;
}
function savePlist(){ try{ localStorage.setItem("ps_plist",JSON.stringify(S.plist)); }catch(e){} }
function prodSeedFor(kind,owner,date){
  return {date:date||prodDefaultDate(),kind:"post",seedItem:{brand:"",type:"",format:"",status:"idee",campaign:S.fCamp||"",title:"",notes:"",prod:kind||"",owner:owner||""}};
}
function prodDefaultDate(){
  var t=todayISO(), mr=monthRange();
  if(S.prodScope==="month"&&(t<mr[0]||t>mr[1])) return mr[0];
  return t;
}
function prodStrip(scopedRows,perim,late){
  var box=el("div","pstrip"); box.id="pstrip";
  var main=el("div","pst-main");
  var ready=perim.filter(function(r){var s2=r.it.status; return s2==="asset"||s2==="prog"||s2==="pub";}).length;
  var pub=perim.filter(function(r){return r.it.status==="pub";}).length;
  var pct=perim.length?Math.round(ready/perim.length*100):0;
  var ttl=S.prodScope==="month"?(MONTHS[S.ym.m].charAt(0).toUpperCase()+MONTHS[S.ym.m].slice(1)+" "+S.ym.y):"Toute la production";
  main.appendChild(el("b",null,ttl));
  main.appendChild(el("span","pst-n",perim.length+" contenu"+(perim.length>1?"s":"")+" · "+ready+" prêt"+(ready>1?"s":"")+" · "+pub+" publié"+(pub>1?"s":"")));
  var bar=el("div","pbar"), fl=el("i"); fl.style.width=pct+"%"; bar.appendChild(fl); main.appendChild(bar);
  box.appendChild(main);
  var chips=el("div","pst-chips"); chips.id="ptype";
  function chip(id,label,n){
    var c=el("button","pchip"+(id?" pk-"+id:""),""); c.type="button"; c.setAttribute("data-k",id||"all");
    c.setAttribute("aria-pressed",S.fProd===id?"true":"false");
    if(id){ var d=el("span","pkd"); c.appendChild(d); }
    c.appendChild(el("span",null,label)); c.appendChild(el("em",null,String(n)));
    c.onclick=function(){ S.fProd=id; render(); };
    return c;
  }
  var ownerFiltered=prodFilter(scopedRows,true);
  chips.appendChild(chip("","Tout",ownerFiltered.length));
  PRODS.forEach(function(P){ chips.appendChild(chip(P.id,P.name,ownerFiltered.filter(function(r){return prodKind(r.it)===P.id;}).length)); });
  box.appendChild(chips);
  var ow=el("label","pst-own"); ow.appendChild(el("span",null,"Responsable"));
  var sel=el("select","mini"); sel.id="powner";
  var a0=el("option",null,"Tous"); a0.value=""; sel.appendChild(a0);
  var names=allOwners(); if(S.fOwner&&S.fOwner!=="__none"&&names.indexOf(S.fOwner)<0) names.push(S.fOwner);
  names.forEach(function(w){ var op=el("option",null,w); op.value=w; if(S.fOwner===w) op.selected=true; sel.appendChild(op); });
  var an=el("option",null,"Sans responsable"); an.value="__none"; if(S.fOwner==="__none") an.selected=true; sel.appendChild(an);
  sel.onchange=function(){ S.fOwner=sel.value; renderSub(); render(); };
  ow.appendChild(sel); box.appendChild(ow);
  if(late){
    var lb=el("button","pst-late",late+" non publié"+(late>1?"s":"")+" avant ce mois · voir"); lb.type="button"; lb.id="plate";
    lb.onclick=function(){ S.prodScope="all"; try{localStorage.setItem("ps_prodscope","all");}catch(e){} renderSub(); render(); };
    box.appendChild(lb);
  }
  return box;
}
function prodRow(r,t){
  var b=brand(r.it.brand), row=el("div","plrow"+(isSkel(r.it)?" skel":""));
  var late=r.date<t&&(r.it.status||"idee")!=="pub";
  row.appendChild(el("span","udate"+(late?" late":""),shortDate(r.date)+(r.kind==="story"?" · ST":"")));
  var bar=el("span","ubar"); bar.style.background=bcol(b); row.appendChild(bar);
  var mid=el("div","plmid");
  var tt=el("button","utxt ptxt",r.it.title||(b?b.name:"Sans titre")); tt.type="button";
  tt.onclick=function(){ openItem(r); }; mid.appendChild(tt);
  var meta=el("div","plmeta");
  if(b) meta.appendChild(el("span","bcode",b.code||b.name));
  if(r.it.format) meta.appendChild(el("span","stat",r.it.format));
  var cp=camp(r.it.campaign); if(cp) meta.appendChild(el("span","stat",cp.name));
  if(r.it.assetId){ var im=el("img","uthumb"); im.src=blobUrl(r.it.assetId); im.alt=""; im.loading="lazy"; meta.appendChild(im); }
  if(isSkel(r.it)) meta.appendChild(el("span","stat","squelette"));
  if(meta.childNodes.length) mid.appendChild(meta);
  row.appendChild(mid);
  row.appendChild(ownerSelect(r));
  var ty=el("select","mini pty"); ty.title="Type de production"; ty.setAttribute("data-f","prod");
  PRODS.forEach(function(P){ var op=el("option",null,P.name); op.value=P.id; if(prodKind(r.it)===P.id) op.selected=true; ty.appendChild(op); });
  ty.onchange=function(){ patchItem(r,{prod:ty.value},"Déplacé en « "+(PRODS.filter(function(P){return P.id===ty.value;})[0].name)+" »"); };
  row.appendChild(ty);
  var sl=el("select","mini pst"); sl.title="Changer le statut"; sl.setAttribute("data-f","status");
  S.cfg.statuses.forEach(function(s2){ var op=el("option",null,s2.name); op.value=s2.id; if((r.it.status||"idee")===s2.id) op.selected=true; sl.appendChild(op); });
  sl.onchange=function(){ moveStatus(r,sl.value); };
  row.appendChild(sl);
  return row;
}
function prodList(rows){
  var t=todayISO(), box=el("div","pl"); box.id="plists";
  PRODS.forEach(function(P){
    if(S.fProd&&S.fProd!==P.id) return;
    var st=S.plist[P.id]||(S.plist[P.id]={owner:"",hideDone:false});
    var mine=rows.filter(function(r){ return prodKind(r.it)===P.id; });
    var shown=mine.filter(function(r){
      var w=ownerOf(r.it);
      if(st.owner){ if(st.owner==="__none"?w!=="":w!==st.owner) return false; }
      if(st.hideDone&&r.it.status==="pub") return false;
      return true;
    });
    shown.sort(function(a,b){ return a.date<b.date?-1:a.date>b.date?1:0; });
    var ck="pl:"+P.id, sec=el("section","plsec pk-"+P.id+(S.collapsed[ck]?" closed":""));
    sec.setAttribute("data-kind",P.id);
    var h=el("div","plh");
    var ch=el("button","chev","▾"); ch.type="button"; ch.title="Replier / déplier";
    ch.onclick=function(){ var now=!sec.classList.contains("closed"); sec.classList.toggle("closed",now); setCollapse(ck,now); };
    h.appendChild(ch);
    var d=el("span","pkd"); h.appendChild(d);
    h.appendChild(el("span","gtitle",P.name));
    h.appendChild(el("span","n",String(shown.length)));
    var rd=shown.filter(function(r){var s2=r.it.status; return s2==="asset"||s2==="prog"||s2==="pub";}).length;
    h.appendChild(el("span","gslots",rd+"/"+shown.length+" prêts"));
    h.appendChild(el("span","ln"));
    var ctl=el("div","plctl");
    var os=el("select","mini"); os.title="Filtrer cette liste par responsable"; os.setAttribute("data-f","listowner");
    var q0=el("option",null,"Tous responsables"); q0.value=""; os.appendChild(q0);
    var names=allOwners(); if(st.owner&&st.owner!=="__none"&&names.indexOf(st.owner)<0) names.push(st.owner);
    names.forEach(function(w){ var op=el("option",null,w); op.value=w; if(st.owner===w) op.selected=true; os.appendChild(op); });
    var qn=el("option",null,"Sans responsable"); qn.value="__none"; if(st.owner==="__none") qn.selected=true; os.appendChild(qn);
    os.onchange=function(){ st.owner=os.value; savePlist(); render(); };
    ctl.appendChild(os);
    var hd=el("button","btn ghost sm"+(st.hideDone?" on":""),st.hideDone?"Publiés masqués":"Masquer publiés"); hd.type="button"; hd.setAttribute("aria-pressed",st.hideDone?"true":"false");
    hd.onclick=function(){ st.hideDone=!st.hideDone; savePlist(); render(); };
    ctl.appendChild(hd);
    var ad=el("button","btn ghost sm","+"); ad.type="button"; ad.title="Nouveau contenu "+P.name.toLowerCase(); ad.setAttribute("data-act","add");
    ad.onclick=function(){ openItem(null,prodSeedFor(P.id,(st.owner&&st.owner!=="__none")?st.owner:(S.fOwner&&S.fOwner!=="__none"?S.fOwner:""))); };
    ctl.appendChild(ad);
    h.appendChild(ctl);
    sec.appendChild(h);
    var bd=el("div","plb");
    if(!shown.length) bd.appendChild(el("div","cempty",mine.length?"Rien avec ces filtres.":("Aucune production "+P.name.toLowerCase()+(S.prodScope==="month"?" ce mois-ci.":"."))));
    shown.forEach(function(r){ bd.appendChild(prodRow(r,t)); });
    sec.appendChild(bd);
    box.appendChild(sec);
  });
  return box;
}
function viewProd(){
  var v=$("view"); v.innerHTML="";
  var t=todayISO(), mr=monthRange();
  var base=allItems().filter(function(r){return pass(r.it);});
  var skelN=base.filter(function(r){return isSkel(r.it);}).length;
  var noSk=S.hideSkel?base.filter(function(r){return !isSkel(r.it);}):base;
  var risk=base.filter(function(r){var s=r.it.status||"idee"; return r.date>=t&&r.date<=addDays(t,3)&&(s==="idee"||s==="brief");});
  if(risk.length){
    var rb=el("div","risk");
    rb.appendChild(el("span",null,"⚠"));
    rb.appendChild(el("span",null,risk.length+" contenu(s) à publier sous 3 jours, sans asset prêt."));
    v.appendChild(rb);
  }
  var scoped=S.prodScope==="month"?noSk.filter(function(r){return r.date>=mr[0]&&r.date<=mr[1];}):noSk;
  var perim=prodFilter(scoped);
  var late=S.prodScope==="month"?prodFilter(noSk).filter(function(r){return r.date<mr[0]&&(r.it.status||"idee")!=="pub";}).length:0;
  v.appendChild(prodStrip(scoped,perim,late));
  if(S.prodView==="list"){ v.appendChild(prodList(perim)); }
  else {
    var kan=el("div","kan"); kan.id="kanban";
    S.cfg.statuses.forEach(function(s){
      var col=el("div","kcol"),h=el("div","kh"),sw=el("span","sw");
      col.style.setProperty("--st",STATUS_TONE[s.id]||"var(--ink-3)");
      sw.style.background=STATUS_TONE[s.id]||"var(--ink-3)"; h.appendChild(sw);
      h.appendChild(el("h4",null,s.name));
      var items=perim.filter(function(r){return (r.it.status||"idee")===s.id;});
      items.sort(function(a,b){return a.date<b.date?-1:1;});
      h.appendChild(el("span","n",String(items.length)));
      col.appendChild(h);
      var body=el("div","kb");
      items.forEach(function(r){ body.appendChild(kCard(r,s.id)); });
      if(!items.length) body.appendChild(el("div","empty","—"));
      col.appendChild(body);
      col.setAttribute("data-drop","status:"+s.id);
      kan.appendChild(col);
    });
    v.appendChild(kan);
  }
  var hint=el("div","hint"); hint.style.padding="0 2px";
  hint.textContent=(S.prodView==="list"
    ?"Chaque liste a son propre filtre responsable. Change le statut, le type ou le responsable directement dans la ligne."
    :"Glisse une carte d'une colonne à l'autre (poignée ⠿ sur mobile), ou utilise les flèches. ✎ ouvre la fiche complète.")
    +(S.hideSkel&&skelN?" · "+skelN+" squelette(s) masqué(s) (cases générées pas encore briefées).":"");
  v.appendChild(hint);
}
function kCard(r,statusId){
  var b=brand(r.it.brand),c=el("div","kcard"+(isSkel(r.it)?" skel":""));
  var m=el("div","km");
  var late=r.date<todayISO()&&statusId!=="pub";
  m.appendChild(el("span","kdate"+(late?" late":""),shortDate(r.date)+(r.kind==="story"?" · ST":"")));
  if(b){var sw=el("span","sw"); sw.style.background=bcol(b); m.appendChild(sw); m.appendChild(el("span","bcode",b.code));}
  if(r.it.assetId){var im=el("img","uthumb"); im.style.cssText="width:22px;height:22px;margin-left:auto"; im.src=blobUrl(r.it.assetId); im.alt=""; im.loading="lazy"; m.appendChild(im);}
  c.appendChild(m);
  c.appendChild(el("div","kt",r.it.title||(b?b.name:"Sans titre")));
  var m2=el("div","km");
  var pk=prodKind(r.it); m2.appendChild(el("span","pkchip pk-"+pk,(PRODS.filter(function(P){return P.id===pk;})[0]||{name:""}).name));
  var ty=ctype(r.it.type); if(ty) m2.appendChild(el("span","tmark "+ty.id,ty.short));
  if(r.it.format) m2.appendChild(el("span","stat",r.it.format));
  if(ownerOf(r.it)) m2.appendChild(el("span","stat own","@ "+ownerOf(r.it)));
  var cp=camp(r.it.campaign); if(cp) m2.appendChild(el("span","stat",cp.name));
  if(m2.childNodes.length) c.appendChild(m2);
  var nav=el("div","knav"),i=statIdx(statusId);
  var prev=el("button",null,"‹"); prev.type="button"; prev.disabled=i===0; prev.title="Étape précédente";
  prev.onclick=function(e){e.stopPropagation(); moveStatus(r,S.cfg.statuses[i-1].id);};
  var next=el("button",null,"›"); next.type="button"; next.disabled=i===S.cfg.statuses.length-1; next.title="Étape suivante";
  next.onclick=function(e){e.stopPropagation(); moveStatus(r,S.cfg.statuses[i+1].id);};
  var open=el("button",null,"✎"); open.type="button"; open.title="Ouvrir la fiche";
  open.onclick=function(e){e.stopPropagation(); openItem(r);};
  nav.appendChild(prev); nav.appendChild(next); nav.appendChild(open);
  nav.appendChild(el("span")).style.flex="1";
  nav.appendChild(gripFor(c,{date:r.date,kind:r.kind,idx:r.idx}));
  c.appendChild(nav);
  c.onclick=function(){ if(DRAG.just) return; openItem(r); };
  draggable(c,{date:r.date,kind:r.kind,idx:r.idx});
  return c;
}
function moveStatus(ref,ns){
  var day=S.days[ref.date]; if(!day) return;
  var arr=ref.kind==="post"?day.posts:day.stories,it=arr[ref.idx];
  if(!it||it.status===ns) return;
  UNDO=snapshot([ref.date]);
  it.status=ns; saveDay(ref.date); render();
  var st=cstatus(ns);
  toastUndo("Passé en « "+(st?st.name:ns)+" »");
}

/* ══════════ FICHE CONTENU ══════════ */
var PRODS=[{id:"video",name:"Vidéo"},{id:"graphic",name:"Graphique"},{id:"other",name:"Autre"}];
function prodKind(it){
  if(it&&(it.prod==="video"||it.prod==="graphic"||it.prod==="other")) return it.prod;
  var f=String((it&&it.format)||"").toLowerCase();
  if(/reel|vid|ugc|motion|gif|tiktok/.test(f)) return "video";
  if(/photo|carrou|visuel|affiche|graph|banni/.test(f)) return "graphic";
  return "other";
}
function allOwners(){
  var o={}; allItems().forEach(function(r){ var w=String(r.it.owner||"").trim(); if(w) o[w]=1; });
  return Object.keys(o).sort();
}
function openLightbox(src,cap){
  var h=$("dlgHost"); h.innerHTML="";
  var sc=el("div","scrim dlg lb"); sc.setAttribute("role","dialog");
  var im=el("img"); im.src=src; im.alt=cap||"";
  var x=el("button","lbx","✕"); x.type="button"; x.setAttribute("aria-label","Fermer");
  var c=el("div","lbc",(cap||"")+"  ·  clic ou Échap pour fermer");
  sc.onclick=closeDlg; x.onclick=closeDlg;
  sc.appendChild(im); sc.appendChild(x); if(cap) sc.appendChild(c);
  h.appendChild(sc);
}
function openItem(ref,seed){
  var host=$("modalHost"),creating=!ref,it,date,kind;
  if(creating){
    date=(seed&&seed.date)||todayISO();
    kind=(seed&&seed.kind)||"post";
    var si=seed&&seed.seedItem;
    it=si?{id:uid(),brand:si.brand||"",type:si.type||"",format:si.format||"",status:si.status||"idee",
           campaign:si.campaign||"",title:si.title||"",notes:si.notes||"",assetId:"",link:"",prod:si.prod||"",owner:si.owner||""}
         :{id:uid(),brand:"",type:"",format:(seed&&seed.kind==="story")?"Story native":"",status:"idee",campaign:"",title:"",notes:"",category:"",intent:"",qty:1,assetId:"",link:""};
  } else {
    date=ref.date; kind=ref.kind;
    var day=S.days[date]; if(!day) return;
    var src=(kind==="post"?day.posts:day.stories)[ref.idx]; if(!src) return;
    it=JSON.parse(JSON.stringify(src));
  }
  var scrim=el("div","scrim"),sheet=el("div","sheet wide"),head=el("div","sh");
  var ab=el("div","accentbar"); head.appendChild(ab);
  var ht=el("div"); ht.style.flex="1";
  ht.appendChild(el("h2",null,creating?"Nouveau contenu":"Fiche contenu"));
  var sub=el("div","sub"); ht.appendChild(sub); head.appendChild(ht);
  var x=el("button","btn icon","✕"); x.onclick=close; head.appendChild(x);
  sheet.appendChild(head);

  var body=el("div","sb fiche");
  var cols=el("div","fx"), colL=el("div","fxl"), colR=el("div","fxr");

  /* ── colonne gauche : visuel (agrandissable) + lien ── */
  var prev=el("button","fprev"); prev.type="button";
  function paintPrev(){
    prev.innerHTML=""; prev.classList.toggle("has",!!it.assetId);
    if(it.assetId){
      var im=el("img"); im.src=blobUrl(it.assetId); im.alt="";
      im.onerror=function(){ prev.innerHTML=""; prev.classList.remove("has"); prev.appendChild(el("span",null,"visuel introuvable")); };
      prev.appendChild(im); prev.appendChild(el("span","zoomtag","⤢ Agrandir"));
      prev.title="Cliquer pour voir le visuel en grand";
    } else { prev.appendChild(el("span",null,"Pas de visuel")); prev.title=""; }
  }
  paintPrev();
  prev.onclick=function(){ if(it.assetId) openLightbox(blobUrl(it.assetId),it.title||""); };
  var drop=el("label","drop");
  var fi=el("input"); fi.type="file"; fi.accept="image/png,image/jpeg,image/webp,image/gif"; fi.hidden=true;
  drop.appendChild(document.createTextNode("Dépose, colle (Ctrl+V) ou clique pour choisir"));
  drop.appendChild(fi);
  var mrow=el("div"); mrow.style.cssText="display:flex;gap:8px;align-items:center;flex-wrap:wrap";
  var rmb=el("button","btn ghost sm","Retirer"); rmb.type="button"; rmb.hidden=!it.assetId;
  rmb.onclick=function(){ it.assetId=""; paintPrev(); rmb.hidden=true; };
  var mstat=el("span","hint"); mstat.style.flex="1";
  if(!S.assets){ drop.style.display="none"; mstat.textContent="L'envoi de visuels n'est pas disponible dans cette vue. Le champ lien reste utilisable."; }
  mrow.appendChild(rmb); mrow.appendChild(mstat);
  function handleFile(f){
    if(!f||!S.assets) return;
    if(f.size>20*1024*1024){ mstat.textContent="Fichier trop lourd (20 Mo maximum)."; return; }
    mstat.textContent="Envoi…";
    S.assets.upload(f).then(function(res){
      it.assetId=res.id; paintPrev(); rmb.hidden=false;
      mstat.textContent="Visuel prêt — "+Math.round(res.sizeBytes/1024)+" Ko";
    }).catch(function(e){
      var c=e&&e.code;
      mstat.textContent=c==="too_large"?"Fichier trop lourd.":c==="unsupported_type"?"Format non accepté (PNG, JPEG, WebP, GIF).":
        c==="quota_or_state"?"Espace de stockage plein.":"Envoi impossible.";
    });
  }
  fi.onchange=function(){ handleFile(fi.files&&fi.files[0]); };
  drop.addEventListener("dragover",function(e){e.preventDefault(); drop.classList.add("over");});
  drop.addEventListener("dragleave",function(){drop.classList.remove("over");});
  drop.addEventListener("drop",function(e){
    e.preventDefault(); drop.classList.remove("over");
    handleFile(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]);
  });
  scrim.addEventListener("paste",function(e){
    var fl2=e.clipboardData&&e.clipboardData.files; if(fl2&&fl2.length&&/^image\//.test(fl2[0].type)){ e.preventDefault(); handleFile(fl2[0]); }
  });
  var fl=el("div","f"); fl.appendChild(el("label",null,"Lien de l'asset (Drive, Canva…)"));
  var inL=el("input"); inL.type="url"; inL.id="fi-link"; inL.value=it.link||""; inL.placeholder="https://…";
  inL.oninput=function(){ it.link=inL.value.trim(); };
  fl.appendChild(inL);
  colL.appendChild(prev); colL.appendChild(drop); colL.appendChild(mrow); colL.appendChild(fl);

  function sel(label,val,opts,ph,on,id){
    var f=el("div","f"); f.appendChild(el("label",null,label));
    var s=el("select"); if(id)s.id=id;
    var o0=el("option",null,ph); o0.value=""; s.appendChild(o0);
    opts.forEach(function(o){var op=el("option",null,o.name); op.value=o.id; if(o.id===val)op.selected=true; s.appendChild(op);});
    s.onchange=function(){ on(s.value); };
    f.appendChild(s); return f;
  }

  /* ── colonne droite ── */
  var ft=el("div","f"); ft.appendChild(el("label",null,"Angle / accroche"));
  var inT=el("input"); inT.type="text"; inT.id="fi-title"; inT.value=it.title||""; inT.className="bigin";
  inT.placeholder="Ex : Gel-Kayano 32 — test terrain filmé au Massira";
  inT.oninput=function(){ it.title=inT.value; };
  ft.appendChild(inT); colR.appendChild(ft);

  var fs0=el("div","f"); fs0.appendChild(el("label",null,"Avancement"));
  var steps=el("div","steps"); steps.id="fi-steps";
  function paintSteps(){
    steps.innerHTML="";
    var cur=statIdx(it.status||"idee");
    S.cfg.statuses.forEach(function(st,i){
      var b3=el("button","stp"+(i<cur?" done":""),st.name); b3.type="button"; b3.setAttribute("data-s",st.id);
      b3.setAttribute("aria-pressed",i===cur?"true":"false");
      b3.onclick=function(){ it.status=st.id; paintSteps(); };
      steps.appendChild(b3);
    });
  }
  paintSteps(); fs0.appendChild(steps); colR.appendChild(fs0);

  var fd=el("div","f"); fd.appendChild(el("label",null,"Date"));
  var inD=el("input"); inD.type="date"; inD.id="fi-date"; inD.value=date;
  inD.onchange=function(){ date=inD.value||date; refreshHead(); };
  fd.appendChild(inD);
  var sh=el("div","shift");
  [["-1 sem",-7],["-1 j",-1],["+1 j",1],["+1 sem",7]].forEach(function(o){
    var bb=el("button",null,o[0]); bb.type="button";
    bb.onclick=function(){ date=addDays(date,o[1]); inD.value=date; refreshHead(); };
    sh.appendChild(bb);
  });
  fd.appendChild(sh);
  var fk=el("div","f"); fk.appendChild(el("label",null,"Type de slot"));
  var pr=el("div","pickrow");
  [["post","Post"],["story","Story"]].forEach(function(p){
    var b2=el("button","pick",p[1]); b2.type="button"; b2.setAttribute("data-k",p[0]);
    b2.setAttribute("aria-pressed",kind===p[0]?"true":"false");
    b2.onclick=function(){ kind=p[0]; pr.querySelectorAll(".pick").forEach(function(o){o.setAttribute("aria-pressed",o.getAttribute("data-k")===kind?"true":"false");}); refillCats(); };
    pr.appendChild(b2);
  });
  fk.appendChild(pr);
  var rowA=el("div","frow"); rowA.appendChild(fd); rowA.appendChild(fk); colR.appendChild(rowA);

  var rowB=el("div","frow three");
  rowB.appendChild(sel("Marque",it.brand,S.cfg.brands,"Choisir…",function(v){it.brand=v; refreshHead();},"fi-brand"));
  rowB.appendChild(sel("Format",it.format,S.cfg.formats.map(function(f){return {id:f,name:f};}),"—",function(v){it.format=v; refreshProd();},"fi-format"));
  rowB.appendChild(sel("Type de contenu",it.type,S.cfg.types,"Choisir…",function(v){it.type=v;},"fi-type"));
  colR.appendChild(rowB);

  /* production : qui fait quoi */
  var rowP=el("div","frow");
  var fP=el("div","f"); fP.appendChild(el("label",null,"Production"));
  var sP=el("select"); sP.id="fi-prod";
  function refreshProd(){
    var auto=prodKind({format:it.format}); var an=PRODS.filter(function(p){return p.id===auto;})[0].name;
    sP.innerHTML="";
    var a0=el("option",null,"Auto — "+an+" (selon le format)"); a0.value=""; sP.appendChild(a0);
    PRODS.forEach(function(p){ var op=el("option",null,p.name); op.value=p.id; sP.appendChild(op); });
    sP.value=it.prod||"";
  }
  refreshProd();
  sP.onchange=function(){ it.prod=sP.value; };
  fP.appendChild(sP); rowP.appendChild(fP);
  var fO=el("div","f"); fO.appendChild(el("label",null,"Responsable"));
  var inO=el("input"); inO.type="text"; inO.id="fi-owner"; inO.value=it.owner||""; inO.placeholder="Ex : Yassine, agence, Ilias…";
  inO.setAttribute("list","fi-owners");
  var dl2=el("datalist"); dl2.id="fi-owners"; allOwners().forEach(function(w){ var op=el("option"); op.value=w; dl2.appendChild(op); });
  inO.oninput=function(){ it.owner=inO.value.trim(); };
  fO.appendChild(inO); fO.appendChild(dl2); rowP.appendChild(fO);
  colR.appendChild(rowP);

  var rowD=el("div","frow three");
  var copts=Object.keys(S.campaigns).map(function(k){return {id:k,name:S.campaigns[k].name};});
  rowD.appendChild(sel("Campagne",it.campaign,copts,"Aucune",function(v){it.campaign=v;},"fi-camp"));
  var fCat=sel("Catégorie",it.category,catsFor(kind),"—",function(v){it.category=v;},"fi-cat"); rowD.appendChild(fCat);
  rowD.appendChild(sel("Intention",it.intent,S.rules.intentions||[],"—",function(v){it.intent=v;},"fi-intent"));
  colR.appendChild(rowD);
  var fq=el("div","f"); fq.appendChild(el("label",null,"Quantité de stories"));
  var qw=el("div"); qw.style.cssText="display:flex;gap:7px;align-items:center";
  var qm=el("button","btn sm","−"); qm.type="button";
  var qv=el("input"); qv.type="text"; qv.inputMode="numeric"; qv.id="fi-qty"; qv.value=qtyOf(it);
  qv.style.cssText="text-align:center;max-width:72px";
  var qp=el("button","btn sm","+"); qp.type="button";
  function setQ(n){ n=Math.max(1,Math.min(20,n)); it.qty=n; qv.value=n; }
  qm.onclick=function(){ setQ(qtyOf(it)-1); };
  qp.onclick=function(){ setQ(qtyOf(it)+1); };
  qv.oninput=function(){ var n=parseInt(qv.value,10); it.qty=(isNaN(n)||n<1)?1:Math.min(20,n); };
  qw.appendChild(qm); qw.appendChild(qv); qw.appendChild(qp);
  var qh=el("span","hint","« ×2 » = deux stories sur le même sujet, une seule carte."); qw.appendChild(qh);
  fq.appendChild(qw);
  colR.appendChild(fq);
  function refillCats(){
    var sl=fCat.querySelector("select"); if(!sl) return;
    var cs=catsFor(kind); sl.innerHTML="";
    var z=el("option",null,"—"); z.value=""; sl.appendChild(z);
    var ok3=false;
    cs.forEach(function(c){ var op=el("option",null,c.name); op.value=c.id; if(c.id===it.category){op.selected=true; ok3=true;} sl.appendChild(op); });
    if(!ok3){ it.category=""; sl.value=""; }
    fq.style.display=(kind==="story")?"":"none";
  }
  refillCats();

  var fn=el("div","f"); fn.appendChild(el("label",null,"Brief / notes de production"));
  var inN=el("textarea"); inN.id="fi-notes"; inN.value=it.notes||"";
  inN.placeholder="Lieu, casting, produit, message clé, CTA, contraintes magasin…";
  inN.oninput=function(){ it.notes=inN.value; };
  fn.appendChild(inN); colR.appendChild(fn);
  if(window.PS&&PS.captionField) colR.appendChild(PS.captionField(it,function(){ return {kind:kind,date:date}; }));
  cols.appendChild(colL); cols.appendChild(colR); body.appendChild(cols);
  sheet.appendChild(body);

  var foot=el("div","sf");
  if(!creating){
    var del=el("button","btn sm danger","Supprimer");
    del.onclick=function(){
      askConfirm("Supprimer ce contenu ?",it.title||"","Supprimer",function(){
        var d2=S.days[ref.date];
        if(d2){ var a2=(ref.kind==="post"?d2.posts:d2.stories), k2=idxById(a2,it.id,ref.idx); if(k2>=0){ a2.splice(k2,1); saveDay(ref.date); } }
        close(); render(); toast("Contenu supprimé");
      },true);
    };
    foot.appendChild(del);
    var dup=el("button","btn sm","Dupliquer +7 j");
    dup.onclick=function(){
      var nd=addDays(date,7);
      if(!S.days[nd]) S.days[nd]=emptyDay(nd);
      var cp2=JSON.parse(JSON.stringify(it)); cp2.id=uid(); cp2.status="idee";
      (kind==="post"?S.days[nd].posts:S.days[nd].stories).push(cp2);
      saveDay(nd); close(); render(); toast("Copié au "+shortDate(nd));
    };
    foot.appendChild(dup);
  }
  var sp=el("div"); sp.style.flex="1"; foot.appendChild(sp);
  var cancel=el("button","btn sm","Annuler"); cancel.onclick=close; foot.appendChild(cancel);
  var save=el("button","btn sm solid",creating?"Ajouter":"Enregistrer");
  var again=null;
  function doSave(next){
    var inPlace=false;
    if(!creating){
      var od=S.days[ref.date];
      if(od){
        var oa=(ref.kind==="post"?od.posts:od.stories), ok2=idxById(oa,it.id,ref.idx);
        if(ok2>=0&&date===ref.date&&kind===ref.kind){ oa[ok2]=it; inPlace=true; saveDay(date); }  // même jour, même slot : on garde la position
        else if(ok2>=0){ oa.splice(ok2,1); saveDay(ref.date); }
      }
    }
    if(!inPlace){
      if(!S.days[date]) S.days[date]=emptyDay(date);
      (kind==="post"?S.days[date].posts:S.days[date].stories).push(it);
      saveDay(date);
    }
    if(seed&&seed.fromIdea&&S.ideas[seed.fromIdea]) delIdea(seed.fromIdea);
    if(seed&&seed.fromDraft) S.draft=S.draft.filter(function(x){return x!==seed.fromDraft;});
    close(); render();
    toast(creating?(seed&&seed.fromIdea?"Idée planifiée au "+shortDate(date):"Contenu ajouté"):"Fiche enregistrée");
    if(next) openItem(null,{date:date,kind:kind});
  }
  save.onclick=function(){ doSave(false); };
  if(creating){
    again=el("button","btn sm","Ajouter et en créer un autre"); again.type="button"; again.id="fi-again";
    again.onclick=function(){ doSave(true); };
    foot.appendChild(again);
  }
  foot.appendChild(save);
  scrim.addEventListener("keydown",function(e){ if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); doSave(false); } });
  sheet.appendChild(foot);

  function refreshHead(){
    ab.style.background=bcol(brand(it.brand));
    var d=pISO(date);
    sub.textContent=DOWS[dw(d)]+" "+d.getDate()+" "+MONTHS[d.getMonth()]+" "+d.getFullYear();
  }
  refreshHead();
  function close(){ host.innerHTML=""; }
  scrim.onclick=function(e){ if(e.target===scrim) close(); };
  scrim.appendChild(sheet); host.innerHTML=""; host.appendChild(scrim);
  setTimeout(function(){ try{inT.focus();}catch(e){} },40);
}

/* ══════════ FICHE CAMPAGNE ══════════ */
function openCampaign(c,seed){
  var host=$("modalHost"),creating=!c;
  var fi=seed&&seed.fromIdea, st0=(fi&&fi.due)?(fi.due<todayISO()?todayISO():fi.due):todayISO();
  var m=creating?{id:"",name:fi?fi.title||"":"",brand:fi?fi.brand||"":"",start:st0,end:addDays(st0,13),goal:fi?fi.why||"":"",status:"draft",notes:fi?[fi.note||"",fi.link?("Inspiration : "+fi.link):""].filter(Boolean).join("\n"):"",group:fi?(S.groups[fi.group]?fi.group:""):((seed&&seed.group)||"")}
                :JSON.parse(JSON.stringify(c));
  var scrim=el("div","scrim"),sheet=el("div","sheet wide"),head=el("div","sh");
  var ab=el("div","accentbar"); ab.style.background=bcol(brand(m.brand)); head.appendChild(ab);
  var ht=el("div"); ht.style.flex="1";
  ht.appendChild(el("h2",null,creating?"Nouvelle campagne":m.name));
  ht.appendChild(el("div","sub","Campagne")); head.appendChild(ht);
  var x=el("button","btn icon","✕"); x.onclick=close; head.appendChild(x);
  sheet.appendChild(head);
  var body=el("div","sb");
  if(!creating){
    var qa=el("div","cqa");
    var sl0=campaignSlots(m.id), up=sl0.filter(function(r){return r.date>=todayISO();}), tgt=up.length?up[0].date:(sl0.length?sl0[0].date:(m.start||""));
    var qb1=el("button","btn sm","Voir au calendrier"); qb1.type="button"; qb1.id="ca-gocal"; qb1.disabled=!tgt;
    qb1.title=tgt?"Ouvre la semaine du "+shortDate(tgt):"Aucun contenu ni date de début";
    qb1.onclick=function(){ close(); goWeekOf(tgt); };
    var qb2=el("button","btn sm","Voir en production"); qb2.type="button"; qb2.id="ca-goprod"; qb2.disabled=!sl0.length;
    qb2.onclick=function(){ close(); S.fCamp=m.id; S.fOwner=""; S.fProd=""; S.fStatus=""; S.prodScope="all"; goTab("prod"); };
    var qb3=el("button","btn sm","Dupliquer"); qb3.type="button"; qb3.id="ca-dup"; qb3.title="Copie la campagne (sans ses contenus), en brouillon";
    qb3.onclick=function(){
      var cp=JSON.parse(JSON.stringify(m)); cp.id=slug(m.name)+"-"+uid().slice(-3); cp.name=m.name+" (copie)"; cp.status="draft";
      S.campaigns[cp.id]=cp; saveCamp(cp); close(); renderSub(); render(); toast("Campagne dupliquée, sans les contenus"); openCampaign(cp);
    };
    qa.appendChild(qb1); qa.appendChild(qb2); qa.appendChild(qb3); body.appendChild(qa);
  }
  var f1=el("div","f"); f1.appendChild(el("label",null,"Nom"));
  var inN=el("input"); inN.type="text"; inN.id="ca-name"; inN.value=m.name; inN.placeholder="Ex : Rentrée 2026";
  inN.oninput=function(){ m.name=inN.value; };
  f1.appendChild(inN); body.appendChild(f1);
  var r1=el("div","frow three");
  var fb=el("div","f"); fb.appendChild(el("label",null,"Marque principale"));
  var sb=el("select"); sb.id="ca-brand";
  var o0=el("option",null,"Transverse"); o0.value=""; sb.appendChild(o0);
  S.cfg.brands.forEach(function(b){var op=el("option",null,b.name); op.value=b.id; if(b.id===m.brand)op.selected=true; sb.appendChild(op);});
  sb.onchange=function(){ m.brand=sb.value; ab.style.background=bcol(brand(m.brand)); };
  fb.appendChild(sb); r1.appendChild(fb);
  var fs=el("div","f"); fs.appendChild(el("label",null,"Début"));
  var i1=el("input"); i1.type="date"; i1.id="ca-start"; i1.value=m.start||""; i1.onchange=function(){m.start=i1.value;};
  fs.appendChild(i1); r1.appendChild(fs);
  var fe=el("div","f"); fe.appendChild(el("label",null,"Fin"));
  var i2=el("input"); i2.type="date"; i2.id="ca-end"; i2.value=m.end||""; i2.onchange=function(){m.end=i2.value;};
  fe.appendChild(i2); r1.appendChild(fe);
  body.appendChild(r1);
  var r2=el("div","frow");
  var fg=el("div","f"); fg.appendChild(el("label",null,"Objectif"));
  var ig=el("input"); ig.type="text"; ig.id="ca-goal"; ig.value=m.goal||"";
  ig.placeholder="Ex : trafic magasin sur la semaine de rentrée";
  ig.oninput=function(){m.goal=ig.value;};
  fg.appendChild(ig); r2.appendChild(fg);
  var fst=el("div","f"); fst.appendChild(el("label",null,"Statut"));
  var ss=el("select"); ss.id="ca-status";
  [["draft","Brouillon"],["active","En cours"],["done","Terminée"]].forEach(function(p){
    var op=el("option",null,p[1]); op.value=p[0]; if(p[0]===m.status)op.selected=true; ss.appendChild(op);
  });
  ss.onchange=function(){m.status=ss.value;};
  fst.appendChild(ss); r2.appendChild(fst); body.appendChild(r2);
  var rG=el("div","f"); rG.appendChild(el("label",null,"Dossier"));
  var sg=el("select"); sg.id="ca-group";
  function fillGroups(){
    sg.innerHTML="";
    var g0=el("option",null,"Sans dossier"); g0.value=""; sg.appendChild(g0);
    groupList().forEach(function(g){ var op=el("option",null,g.name); op.value=g.id; if(g.id===m.group)op.selected=true; sg.appendChild(op); });
    var gn=el("option",null,"+ Nouveau dossier…"); gn.value="__new"; sg.appendChild(gn);
    if(!m.group) sg.value="";
  }
  fillGroups();
  sg.onchange=function(){
    if(sg.value==="__new"){
      sg.value=m.group||"";
      askText("Nouveau dossier","Ex : Temps forts, Lancements…","Créer",function(name){
        var g={id:"g-"+slug(name)+"-"+uid().slice(-3),name:name,color:groupList().length%PALETTE.length,order:(groupList().length+1)*10};
        S.groups[g.id]=g; saveGroup(g); m.group=g.id; fillGroups(); sg.value=g.id; renderSub();
      });
    } else m.group=sg.value;
  };
  rG.appendChild(sg); body.appendChild(rG);
  var fnn=el("div","f"); fnn.appendChild(el("label",null,"Notes"));
  var tn=el("textarea"); tn.id="ca-notes"; tn.value=m.notes||"";
  tn.placeholder="Message clé, offres, assets disponibles, contraintes magasin…";
  tn.oninput=function(){m.notes=tn.value;};
  fnn.appendChild(tn); body.appendChild(fnn);
  if(!creating){
    var slotHost=el("div");
    function paintSlots(){
      slotHost.innerHTML="";
      var slots=campaignSlots(m.id);
      var th=el("div","sthead");
      th.appendChild(el("div","secttl","Contenus rattachés — "+slots.length));
      var at=el("button","btn ghost sm","+ Rattacher des contenus"); at.type="button"; at.id="ca-attach";
      at.onclick=function(){ openAttach(m.id,paintSlots); };
      th.appendChild(at); slotHost.appendChild(th);
      var ul=el("div","ulist");
      if(!slots.length) ul.appendChild(el("div","empty","Aucun contenu rattaché. Rattache des contenus du calendrier ici, ou ouvre une fiche et choisis cette campagne."));
      slots.forEach(function(r){
        var b=brand(r.it.brand),row=el("button","urow"); row.type="button";
        row.appendChild(el("span","udate",shortDate(r.date)));
        if(r.it.assetId){var im=el("img","uthumb"); im.src=blobUrl(r.it.assetId); im.alt=""; im.loading="lazy"; row.appendChild(im);}
        else {var bar=el("span","ubar"); bar.style.background=bcol(b); row.appendChild(bar);}
        row.appendChild(el("span","utxt",(r.kind==="story"?"Story · ":"")+(r.it.title||(b?b.name:"Sans titre"))));
        var st=cstatus(r.it.status); if(st) row.appendChild(el("span","stat s-"+st.id,st.name));
        row.onclick=function(){ close(); openItem(r); };
        ul.appendChild(row);
      });
      slotHost.appendChild(ul);
    }
    paintSlots(); body.appendChild(slotHost);
    var others=Object.keys(S.campaigns).filter(function(k){return k!==m.id;});
    if(others.length){
      var mg=el("div","mergebox");
      mg.appendChild(el("div","secttl","Fusionner"));
      var mr=el("div","mergerow");
      var ms=el("select"); ms.id="ca-merge";
      var m0=el("option",null,"Verser dans une autre campagne…"); m0.value=""; ms.appendChild(m0);
      others.forEach(function(k){ var op=el("option",null,S.campaigns[k].name); op.value=k; ms.appendChild(op); });
      var mb=el("button","btn sm","Fusionner"); mb.type="button"; mb.id="ca-merge-go";
      mb.onclick=function(){
        var tid=ms.value; if(!tid){ toast("Choisis la campagne de destination"); return; }
        var n=campaignSlots(m.id).length, tn=S.campaigns[tid].name;
        askConfirm("Fusionner « "+m.name+" » dans « "+tn+" » ?",
          n+" contenu(s) passent dans « "+tn+" », puis « "+m.name+" » est supprimée.","Fusionner",function(){
            var moved=mergeCamp(m.id,tid); close(); render(); toast(moved+" contenu(s) déplacé(s), campagne fusionnée");
          },true);
      };
      mr.appendChild(ms); mr.appendChild(mb); mg.appendChild(mr); body.appendChild(mg);
    }
  }
  sheet.appendChild(body);
  var foot=el("div","sf");
  if(!creating){
    var del=el("button","btn sm danger","Supprimer");
    del.onclick=function(){
      var n=campaignSlots(m.id).length;
      askConfirm("Supprimer « "+m.name+" » ?",
        n?(n+" contenu(s) y sont rattachés : ils restent dans le calendrier, sans campagne."):"Aucun contenu n'y est rattaché.",
        "Supprimer",function(){
          var touched={};
          allItems().forEach(function(r){ if(r.it.campaign===m.id){ r.it.campaign=""; touched[r.date]=1; } });
          Object.keys(touched).forEach(function(d){ saveDay(d); });
          delCamp(m.id); close(); render(); toast("Campagne supprimée");
        },true);
    };
    foot.appendChild(del);
  }
  var sp=el("div"); sp.style.flex="1"; foot.appendChild(sp);
  var cancel=el("button","btn sm","Annuler"); cancel.onclick=close; foot.appendChild(cancel);
  var ok=el("button","btn sm solid",creating?"Créer":"Enregistrer");
  ok.onclick=function(){
    if(!String(m.name).trim()){ toast("Donne un nom à la campagne"); return; }
    if(creating) m.id=slug(m.name)+"-"+uid().slice(-3);
    S.campaigns[m.id]=m; saveCamp(m);
    if(creating&&fi){ delIdea(fi.id); }
    close(); renderSub(); render();
    toast(creating?(fi?"Campagne créée à partir de l'idée":"Campagne créée"):"Campagne enregistrée");
  };
  foot.appendChild(ok); sheet.appendChild(foot);
  function close(){ host.innerHTML=""; }
  scrim.onclick=function(e){ if(e.target===scrim) close(); };
  scrim.appendChild(sheet); host.innerHTML=""; host.appendChild(scrim);
}

/* ══════════ GÉNÉRATEUR DE STORIES ══════════ */
function genItem(bid,cat,par,extra,qty,forceLabel){
  var lab=forceLabel||brandLabel(bid,par);
  var T={focus:lab, asset:lab, ambassadeur:lab, magasin:"Contenu magasin",
         running:"Running club", event:"Event", collection:(extra||"Collection")};
  return {id:uid(),brand:bid||"",type:"",format:"Story native",status:"idee",
          campaign:"",title:T[cat]||cat,notes:"",category:cat,intent:"",
          qty:(qty&&qty>1)?qty:1,assetId:"",link:""};
}
function genWeek(ws){
  var R=S.rules, par=weekPar(ws), out=[];
  for(var d=0;d<7;d++){
    var date=addDays(ws,d), items=[], skipped=null;
    var fb=(R.rotation||[])[d];
    var forced=null;
    if(fb==="ua"&&R.uaFrom&&date<R.uaFrom&&R.uaFallback){ fb=R.uaFallback; forced=R.uaFallbackLabel||null; skipped="Under Armour à partir du "+shortDate(R.uaFrom); }
    if(fb) items.push(genItem(fb,"focus",par,null,1,forced));
    // le brand asset évite toute marque déjà présente ce jour-là (focus ou ambassadeur)
    var taken={}; if(fb) taken[fb]=1;
    (R.ambassadors||[]).forEach(function(x){ if(x[0]===d) taken[x[1]]=1; });
    var rot=R.rotation||[], ab=null;
    for(var k=0;k<rot.length;k++){
      var cand=rot[(d+(R.assetOffset||3)+k)%rot.length];
      if(!cand) continue;
      if(cand==="ua"&&R.uaFrom&&date<R.uaFrom) continue;
      if(R.assetBrands&&R.assetBrands.indexOf(cand)<0) continue; // Focus Campagne : Adidas, Asics, Puma, New Balance seulement
      if(taken[cand]) continue;
      ab=cand; break;
    }
    if(ab) items.push(genItem(ab,"asset",par));
    if((R.magasinDays||[]).indexOf(d)>=0) items.push(genItem(R.houseBrand||"","magasin",par));
    (R.running||[]).forEach(function(r){ if(r[0]===d) items.push(genItem("","running",par,null,r[1])); });
    (R.events||[]).forEach(function(r){ if(r[0]===d) items.push(genItem("","event",par,null,r[1])); });
    (R.ambassadors||[]).forEach(function(a){ if(a[0]===d) items.push(genItem(a[1],"ambassadeur",par)); });
    (R.collection||[]).forEach(function(c2){ if(c2[0]===d) items.push(genItem(R.houseBrand||"","collection",par,c2[1])); });
    var ord=R.order||[];
    items.sort(function(a,b2){
      var ia=ord.indexOf(a.category), ib=ord.indexOf(b2.category);
      return (ia<0?99:ia)-(ib<0?99:ib);
    });
    out.push({date:date,items:items,skipped:skipped});
  }
  return out;
}
function genPosts(ws){
  var R=S.rules, par=weekPar(ws), out=[];
  var TT={campagne:"Contenu de campagne",engagement:"Trend / engagement",psbrand:"Contenu de marque Planet Sport",
          mix:"Product mix — prix et dispo",nouveautes:"Nouveautés en rayon",
          creatif:"Création de marque",ambassadeur:"Contenu ambassadeur"};
  for(var d=0;d<7;d++){
    var date=addDays(ws,d), items=[], reserved=((R.reactiveDays||[]).indexOf(d)>=0);
    (R.postSlots||[]).forEach(function(sl){
      if(sl.day!==d) return;
      var cat=sl.cat||(sl.alt?sl.alt[par%sl.alt.length]:null);
      if(!cat) return;
      var bid=(R.postBrands||{})[cat]||"";
      items.push({id:uid(),brand:bid,type:"",format:sl.format||"",status:"idee",campaign:"",
                  title:TT[cat]||cat,notes:"",category:cat,intent:"",qty:1,assetId:"",link:""});
    });
    out.push({date:date,items:items,reserved:reserved});
  }
  return out;
}
function openGenerator(){
  var host=$("modalHost"), ws=S.wk, mode="fill", scope="both";
  var scrim=el("div","scrim"),sheet=el("div","sheet wide"),head=el("div","sh");
  var ab=el("div","accentbar"); ab.style.background="var(--ink)"; head.appendChild(ab);
  var ht=el("div"); ht.style.flex="1";
  ht.appendChild(el("h2",null,"Générer la semaine"));
  ht.appendChild(el("div","sub",shortDate(ws)+" – "+shortDate(addDays(ws,6))));
  head.appendChild(ht);
  var x=el("button","btn icon","✕"); x.onclick=close; head.appendChild(x);
  sheet.appendChild(head);

  var body=el("div","sb");
  var sum=el("div","exsum"); body.appendChild(sum);

  function line(label,opts,get,set){
    var l=el("div","exline"); l.appendChild(el("div","k",label));
    var sg=el("div","seg");
    opts.forEach(function(o){
      var b=el("button",null,o[1]); b.type="button"; b.setAttribute("data-v",o[0]);
      b.setAttribute("aria-pressed",get()===o[0]?"true":"false");
      b.onclick=function(){ set(o[0]); sg.querySelectorAll("button").forEach(function(z){ z.setAttribute("aria-pressed",z.getAttribute("data-v")===get()?"true":"false"); }); paint(); };
      sg.appendChild(b);
    });
    var w=el("div"); w.appendChild(sg); l.appendChild(w); body.appendChild(l);
  }
  line("Contenus",[["both","Posts + stories"],["posts","Posts seuls"],["stories","Stories seules"]],
    function(){return scope;},function(v){scope=v;});
  line("Mode",[["fill","Ajouter à l'existant"],["replace","Remplacer la semaine"]],
    function(){return mode;},function(v){mode=v;});
  var note=el("div","hint"); body.appendChild(note);
  var host2=el("div"); body.appendChild(host2);
  sheet.appendChild(body);

  var foot=el("div","sf");
  var hint=el("div","hint"); hint.style.flex="1";
  hint.textContent="Tout est créé au statut « Idée » — tu complètes les angles et les visuels ensuite.";
  var cancel=el("button","btn sm","Annuler"); cancel.onclick=close;
  var go=el("button","btn sm solid","Générer");
  foot.appendChild(hint); foot.appendChild(cancel); foot.appendChild(go);
  sheet.appendChild(foot);

  var planS=[], planP=[];
  function build(){
    planS = scope!=="posts" ? genWeek(ws) : null;
    planP = scope!=="stories" ? genPosts(ws) : null;
  }
  function counts(){
    var ns=0,np=0;
    if(planS) planS.forEach(function(d){ d.items.forEach(function(i2){ ns+=qtyOf(i2); }); });
    if(planP) planP.forEach(function(d){ np+=d.items.length; });
    return {s:ns,p:np};
  }
  function paint(){
    build();
    var c=counts(), tot=c.s+c.p;
    sum.innerHTML="";
    sum.appendChild(el("b",null,String(tot)));
    var parts=[];
    if(c.p) parts.push(c.p+" post"+(c.p>1?"s":""));
    if(c.s) parts.push(c.s+" storie"+(c.s>1?"s":""));
    sum.appendChild(el("span",null,"contenus · "+parts.join(" et ")));
    note.textContent="Les posts ne touchent pas les stories et inversement. Semaine "+(weekPar(ws)?"B":"A")+
      " — "+(weekPar(ws)?"Champion / Arena, Marque Planet Sport, Nouveautés en rayon":"Nox / New Era, Trend engagement, Product mix")+".";
    host2.innerHTML="";
    for(var d=0;d<7;d++){
      var dayP=planP?planP[d]:null, dayS=planS?planS[d]:null;
      var items=[];
      if(dayP) dayP.items.forEach(function(i2){ items.push({it:i2,kind:"post"}); });
      if(dayS) dayS.items.forEach(function(i2){ items.push({it:i2,kind:"story"}); });
      if(!items.length && !(dayP&&dayP.reserved)) continue;
      var box=el("div","gday"), h=el("div","gh"), dt=pISO(addDays(ws,d));
      h.appendChild(el("b",null,DOWS[d]+" "+dt.getDate()));
      if(dayP&&dayP.reserved){ var rs=el("span","hint","créneau réactif — laissé libre"); rs.style.marginLeft="6px"; h.appendChild(rs); }
      if(dayS&&dayS.skipped){ var sk=el("span","hint",dayS.skipped); sk.style.marginLeft="6px"; h.appendChild(sk); }
      var n=items.reduce(function(a,r){ return a+(r.kind==="post"?1:qtyOf(r.it)); },0);
      h.appendChild(el("span","n",String(n)));
      box.appendChild(h);
      var bd=el("div","gb");
      items.forEach(function(r){
        var row=el("div","grow2"), b=brand(r.it.brand);
        var sw=el("span","sw"); sw.style.background=b?bcol(b):"var(--line-2)"; sw.style.borderRadius="2px"; row.appendChild(sw);
        var q=qtyOf(r.it);
        row.appendChild(el("span","t",r.it.title+(q>1?"  ×"+q:"")));
        if(r.kind==="post") row.appendChild(el("span","stat","Post"));
        if(r.it.format) row.appendChild(el("span","stat",r.it.format));
        var c2=ccat(r.it.category); if(c2) row.appendChild(el("span","cat",c2.name));
        bd.appendChild(row);
      });
      box.appendChild(bd); host2.appendChild(box);
    }
    go.textContent="Générer "+tot+" contenu"+(tot>1?"s":"");
    go.disabled=tot===0;
  }
  paint();

  go.onclick=function(){
    var dates=[]; for(var i=0;i<7;i++) dates.push(addDays(ws,i));
    UNDO=snapshot(dates);
    dates.forEach(function(date,d){
      if(!S.days[date]) S.days[date]=emptyDay(date);
      if(planP){
        if(mode==="replace") S.days[date].posts=[];
        planP[d].items.forEach(function(i2){ S.days[date].posts.push(i2); });
      }
      if(planS){
        if(mode==="replace") S.days[date].stories=[];
        planS[d].items.forEach(function(i2){ S.days[date].stories.push(i2); });
      }
      saveDay(date);
    });
    var c=counts();
    close(); render(); toastUndo((c.s+c.p)+" contenus générés");
  };
  function close(){ host.innerHTML=""; }
  scrim.onclick=function(e){ if(e.target===scrim) close(); };
  scrim.appendChild(sheet); host.innerHTML=""; host.appendChild(scrim);
}

/* ══════════ EXPORT ══════════ */
var EXCOLS=["Date","Jour","Slot","Catégorie","Qté","Intention","Marque","Type de contenu","Format","Statut","Campagne","Angle / accroche","Brief","Lien","Légende"];
function exRange(scope){
  if(scope==="week") return [S.wk,addDays(S.wk,6)];
  if(scope==="month"){var y=S.ym.y,m=S.ym.m; return [iso(y,m,1),iso(y,m,dim(y,m))];}
  return [null,null];
}
function exList(scope,kind){
  var r=exRange(scope);
  return allItems(r[0],r[1]).filter(function(x){ return kind==="all"||x.kind===kind; });
}
function exRow(r){
  var b=brand(r.it.brand),t=ctype(r.it.type),st=cstatus(r.it.status),cp=camp(r.it.campaign);
  var d=pISO(r.date);
  var ct=ccat(r.it.category), itn=cintent(r.it.intent);
  return [r.date, DOWS[dw(d)], r.kind==="post"?"Post":"Story", ct?ct.name:"", qtyOf(r.it), itn?itn.name:"",
          b?b.name:"", t?t.name:"", r.it.format||"", st?st.name:"", cp?cp.name:"",
          r.it.title||"", (r.it.notes||"").replace(/\s+/g," "), r.it.link||"", (r.it.caption||"").replace(/\s+/g," ")];
}
function exLabel(scope,list){
  if(scope==="week") return shortDate(S.wk)+" – "+shortDate(addDays(S.wk,6))+" "+pISO(S.wk).getFullYear();
  if(scope==="month") return MONTHS[S.ym.m]+" "+S.ym.y;
  if(!list.length) return "planning vide";
  return shortDate(list[0].date)+" – "+shortDate(list[list.length-1].date);
}
function exFilename(scope,list){
  var r=exRange(scope);
  var a=r[0]||(list[0]&&list[0].date)||todayISO();
  var b=r[1]||(list[list.length-1]&&list[list.length-1].date)||todayISO();
  return "planning-planet-sport_"+a+"_"+b;
}
function exCSV(list){
  function q(v){ v=String(v==null?"":v); return /[";\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
  var lines=[EXCOLS.map(q).join(";")];
  list.forEach(function(r){ lines.push(exRow(r).map(q).join(";")); });
  return "\uFEFF"+lines.join("\r\n");
}
function exText(scope,list){
  var out=["PLANNING ÉDITORIAL — PLANET SPORT","Période : "+exLabel(scope,list),""];
  var byDay={};
  list.forEach(function(r){ (byDay[r.date]=byDay[r.date]||[]).push(r); });
  Object.keys(byDay).sort().forEach(function(d){
    var dt=pISO(d);
    out.push(DOWS[dw(dt)].toUpperCase()+" "+dt.getDate()+" "+MON_S[dt.getMonth()]);
    byDay[d].forEach(function(r){
      var b=brand(r.it.brand),t=ctype(r.it.type),st=cstatus(r.it.status);
      var bits=[b?b.name:"sans marque"];
      if(t) bits.push(t.name);
      if(r.it.format) bits.push(r.it.format);
      if(st) bits.push(st.name);
      var q=qtyOf(r.it);
      out.push("  "+(r.kind==="post"?"POST ":"STORY")+(q>1?" ×"+q:"")+" · "+bits.join(" · "));
      if(r.it.title) out.push("        "+r.it.title);
    });
    out.push("");
  });
  if(!list.length) out.push("(aucun contenu sur cette période)");
  return out.join("\n");
}
function loadXLSX(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(S.xlsxP) return S.xlsxP;
  S.xlsxP=new Promise(function(res,rej){
    var sc=document.createElement("script");
    sc.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    sc.onload=function(){ window.XLSX?res(window.XLSX):rej({code:"lib"}); };
    sc.onerror=function(){ S.xlsxP=null; rej({code:"lib"}); };
    document.head.appendChild(sc);
  });
  return S.xlsxP;
}
function dlError(e){
  var c=e&&e.code;
  if(c==="declined") return "Export annulé.";
  if(c==="lib") return "Le moteur Excel n'a pas pu se charger. Prends le CSV, il s'ouvre dans Excel.";
  if(c==="rate_limited") return "Une demande est déjà en cours. Réessaie dans un instant.";
  if(c==="too_large") return "Fichier trop lourd. Exporte une période plus courte.";
  if(c==="unavailable"||c==="not_granted"||c==="capability_disabled") return "Le téléchargement n'est pas disponible dans cette vue.";
  return "Le téléchargement a échoué.";
}
function openExport(){
  var host=$("modalHost");
  var scope=(S.tab==="cal"&&S.calView==="week")?"week":"month";
  var kind="all", fmt="xlsx";
  var scrim=el("div","scrim"),sheet=el("div","sheet wide"),head=el("div","sh");
  var ab=el("div","accentbar"); ab.style.background="var(--ink)"; head.appendChild(ab);
  var ht=el("div"); ht.style.flex="1";
  ht.appendChild(el("h2",null,"Exporter le planning"));
  ht.appendChild(el("div","sub","Export")); head.appendChild(ht);
  var x=el("button","btn icon","✕"); x.onclick=close; head.appendChild(x);
  sheet.appendChild(head);

  var body=el("div","sb"),grid=el("div","exgrid");
  function segLine(label,opts,get,set){
    var l=el("div","exline"); l.appendChild(el("div","k",label));
    var sg=el("div","seg");
    opts.forEach(function(o){
      var b=el("button",null,o[1]); b.type="button";
      b.setAttribute("data-v",o[0]);
      b.setAttribute("aria-pressed",get()===o[0]?"true":"false");
      b.onclick=function(){
        set(o[0]);
        sg.querySelectorAll("button").forEach(function(z){ z.setAttribute("aria-pressed",z.getAttribute("data-v")===get()?"true":"false"); });
        paint();
      };
      sg.appendChild(b);
    });
    var w=el("div"); w.appendChild(sg); l.appendChild(w); grid.appendChild(l);
  }
  segLine("Période",[["week","Semaine affichée"],["month","Mois affiché"],["all","Tout le planning"]],
    function(){return scope;},function(v){scope=v;});
  segLine("Inclure",[["all","Posts + stories"],["post","Posts"],["story","Stories"]],
    function(){return kind;},function(v){kind=v;});
  segLine("Format",[["xlsx","Excel"],["csv","CSV"],["text","Texte à copier"]],
    function(){return fmt;},function(v){fmt=v;});

  var sum=el("div","exsum");
  var prev=el("div");
  grid.appendChild(sum); grid.appendChild(prev);
  body.appendChild(grid); sheet.appendChild(body);

  var foot=el("div","sf");
  var note=el("span","hint"); note.style.flex="1";
  var cancel=el("button","btn sm","Fermer"); cancel.onclick=close;
  var go=el("button","btn sm solid","Télécharger");
  foot.appendChild(note); foot.appendChild(cancel); foot.appendChild(go);
  sheet.appendChild(foot);

  function paint(){
    var list=exList(scope,kind);
    sum.innerHTML="";
    sum.appendChild(el("b",null,String(list.length)));
    sum.appendChild(el("span",null,(list.length>1?"contenus":"contenu")+" · "+exLabel(scope,list)));
    prev.innerHTML="";
    if(fmt==="text"){
      var ta=el("textarea","extxt"); ta.id="ex-text"; ta.readOnly=true; ta.value=exText(scope,list);
      prev.appendChild(ta);
      go.textContent="Copier le texte";
      note.textContent="À coller dans WhatsApp, un mail ou un message d'équipe.";
    } else {
      var box=el("div","extable"),sc2=el("div","scroll"),t=el("table");
      var tr=el("tr"); EXCOLS.forEach(function(c){ tr.appendChild(el("th",null,c)); });
      var th=el("thead"); th.appendChild(tr); t.appendChild(th);
      var tb=el("tbody");
      list.slice(0,5).forEach(function(r){
        var row=el("tr"); exRow(r).forEach(function(v){ row.appendChild(el("td",null,v)); }); tb.appendChild(row);
      });
      if(!list.length){ var er=el("tr"),ed=el("td",null,"Aucun contenu sur cette période."); ed.colSpan=EXCOLS.length; ed.style.color="var(--ink-3)"; er.appendChild(ed); tb.appendChild(er); }
      t.appendChild(tb); sc2.appendChild(t); box.appendChild(sc2);
      if(list.length>5) box.appendChild(el("div","more","… et "+(list.length-5)+" autre(s) ligne(s) dans le fichier"));
      prev.appendChild(box);
      go.textContent=fmt==="xlsx"?"Télécharger le fichier Excel":"Télécharger le CSV";
      note.textContent=fmt==="xlsx"?"Une ligne par contenu, colonnes filtrables."
                                   :"Séparateur point-virgule et encodage UTF-8 : s'ouvre directement dans Excel en français.";
    }
    go.disabled=(list.length===0&&fmt!=="text");
  }
  paint();

  go.onclick=function(){
    var list=exList(scope,kind);
    if(fmt==="text"){
      var ta=$("ex-text"); if(!ta) return;
      ta.focus(); ta.select();
      var done=function(){ toast("Texte copié"); };
      var manual=function(){ try{ ta.focus(); ta.select(); }catch(e){} note.textContent="Copie automatique refusée par le navigateur — le texte est sélectionné, fais Ctrl+C (Cmd+C sur Mac)."; };
      var legacy=function(){ var ok=false; try{ ok=document.execCommand("copy"); }catch(e){} if(ok) done(); else manual(); };
      try{
        if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done).catch(legacy);
        else legacy();
      }catch(e){ legacy(); }
      return;
    }
    if(!S.dl){ note.textContent="Le téléchargement n'est pas disponible dans cette vue."; return; }
    go.disabled=true; var old=go.textContent; go.textContent="Préparation…";
    var fn=exFilename(scope,list);
    var run;
    if(fmt==="csv"){
      run=S.dl.save({filename:fn+".csv",data:exCSV(list)});
    } else {
      run=loadXLSX().then(function(X){
        var aoa=[EXCOLS].concat(list.map(exRow));
        var ws=X.utils.aoa_to_sheet(aoa);
        ws["!cols"]=[{wch:11},{wch:10},{wch:7},{wch:16},{wch:5},{wch:13},{wch:15},{wch:15},{wch:13},{wch:12},{wch:18},{wch:50},{wch:40},{wch:30},{wch:60}];
        ws["!freeze"]={xSplit:"0",ySplit:"1"};
        var wb=X.utils.book_new(); X.utils.book_append_sheet(wb,ws,"Planning");
        return S.dl.save({filename:fn+".xlsx",data:X.write(wb,{bookType:"xlsx",type:"array"})});
      });
    }
    run.then(function(){ go.disabled=false; go.textContent=old; note.textContent="Fichier enregistré."; toast("Export terminé"); })
       .catch(function(e){ go.disabled=false; go.textContent=old; note.textContent=dlError(e); });
  };

  function close(){ host.innerHTML=""; }
  scrim.onclick=function(e){ if(e.target===scrim) close(); };
  scrim.appendChild(sheet); host.innerHTML=""; host.appendChild(scrim);
}

/* ══════════ RÉGLAGES ══════════ */
function openSettings(){
  var host=$("modalHost"),scrim=el("div","scrim"),sheet=el("div","sheet"),head=el("div","sh");
  var ab=el("div","accentbar"); ab.style.background="var(--ink)"; head.appendChild(ab);
  var ht=el("div"); ht.style.flex="1";
  ht.appendChild(el("h2",null,"Marques, objectifs & rythme"));
  ht.appendChild(el("div","sub","Réglages")); head.appendChild(ht);
  var x=el("button","btn icon","✕"); x.onclick=close; head.appendChild(x);
  sheet.appendChild(head);
  var body=el("div","sb");

  var bsec=el("div");
  bsec.appendChild(el("div","secttl","Marques et objectifs (% des slots)"));
  var bbox=el("div"); bbox.style.marginTop="10px"; bsec.appendChild(bbox);
  var btot=el("div","tot"); bsec.appendChild(btot);
  var brow=el("div"); brow.style.cssText="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap";
  var addB=el("button","btn sm","+ Ajouter une marque"); addB.type="button";
  var bhint=el("div","hint");
  brow.appendChild(addB); brow.appendChild(bhint); bsec.appendChild(brow);
  function paintBrands(){
    bbox.innerHTML="";
    S.cfg.brands.forEach(function(b,ix){
      var r=el("div","qrow"),sw=el("span","sw"); sw.style.background=bcol(b); r.appendChild(sw);
      var nm=el("input"); nm.type="text"; nm.value=b.name; nm.id="br-n-"+ix; nm.style.textAlign="left";
      nm.oninput=function(){ b.name=nm.value; b.code=codeOf(nm.value); };
      r.appendChild(nm);
      var i=el("input"); i.type="text"; i.inputMode="decimal"; i.value=b.target; i.id="br-t-"+ix;
      i.oninput=function(){var v=parseFloat(i.value.replace(",",".")); b.target=isNaN(v)?0:Math.max(0,Math.min(100,v)); updT();};
      r.appendChild(i);
      var rm=el("button","rm","✕"); rm.type="button"; rm.title="Retirer "+b.name;
      rm.onclick=function(){
        var used=allItems().filter(function(x){return x.it.brand===b.id;}).length;
        askConfirm("Retirer "+b.name+" ?",used?(used+" contenu(s) y sont rattachés : ils resteront mais sans marque affichée."):"","Retirer",function(){
          S.cfg.brands.splice(ix,1); paintBrands(); updT();
        },true);
      };
      r.appendChild(rm);
      bbox.appendChild(r);
    });
    bhint.textContent=S.cfg.brands.length>=8
      ? "8 marques, c'est le maximum de couleurs qui restent distinguables. Au-delà, regroupe les petites marques."
      : "Les couleurs sont attribuées dans un ordre validé (contraste et vision daltonienne). L'ordre n'est donc pas modifiable.";
    addB.disabled=S.cfg.brands.length>=8;
  }
  function updT(){
    var t=0; S.cfg.brands.forEach(function(b){t+=(+b.target||0);});
    btot.textContent="Total "+Math.round(t)+"% — doit faire 100%";
    btot.className="tot"+(Math.abs(t-100)>0.5?" bad":"");
  }
  addB.onclick=function(){
    askText("Nouvelle marque","Nom de la marque","Ajouter",function(nm){
      var p=PALETTE[S.cfg.brands.length]||PALETTE[PALETTE.length-1];
      S.cfg.brands.push({id:slug(nm)+"-"+uid().slice(-3),name:nm,code:codeOf(nm),color:p.color,colorDark:p.colorDark,target:0});
      paintBrands(); updT();
    });
  };
  paintBrands(); updT();
  body.appendChild(bsec);

  var tsec=el("div");
  tsec.appendChild(el("div","secttl","Objectifs par type de contenu"));
  var tbox=el("div"); tbox.style.marginTop="10px";
  var ttot=el("div","tot");
  S.cfg.types.forEach(function(t,ix){
    var r=el("div","qrow"),sw=el("span","sw"); sw.style.background="var(--ink-2)"; r.appendChild(sw);
    r.appendChild(el("span",null,t.name));
    var i=el("input"); i.type="text"; i.inputMode="decimal"; i.value=t.target; i.id="ty-t-"+ix;
    i.oninput=function(){var v=parseFloat(i.value.replace(",",".")); t.target=isNaN(v)?0:Math.max(0,Math.min(100,v)); updTT();};
    r.appendChild(i); r.appendChild(el("span"));
    tbox.appendChild(r);
  });
  function updTT(){
    var t=0; S.cfg.types.forEach(function(b){t+=(+b.target||0);});
    ttot.textContent="Total "+Math.round(t)+"% — doit faire 100%";
    ttot.className="tot"+(Math.abs(t-100)>0.5?" bad":"");
  }
  updTT();
  tsec.appendChild(tbox); tsec.appendChild(ttot); body.appendChild(tsec);

  var r=el("div","frow");
  var f1=el("div","f"); f1.appendChild(el("label",null,"Stories minimum par jour"));
  var i1=el("input"); i1.type="text"; i1.inputMode="numeric"; i1.id="set-spd"; i1.value=S.cfg.storiesPerDay;
  i1.oninput=function(){var v=parseInt(i1.value,10); S.cfg.storiesPerDay=isNaN(v)?3:Math.max(0,Math.min(12,v));};
  f1.appendChild(i1); r.appendChild(f1);
  var f2=el("div","f"); f2.appendChild(el("label",null,"Tolérance d'écart (points)"));
  var i2=el("input"); i2.type="text"; i2.inputMode="decimal"; i2.id="set-tol"; i2.value=S.cfg.tolerance;
  i2.oninput=function(){var v=parseFloat(i2.value.replace(",",".")); S.cfg.tolerance=isNaN(v)?5:Math.max(1,Math.min(50,v));};
  f2.appendChild(i2); r.appendChild(f2);
  body.appendChild(r);
  if(window.PS&&PS.backupSection) body.appendChild(PS.backupSection());
  sheet.appendChild(body);

  var foot=el("div","sf");
  var wipe=el("button","btn sm danger","Vider les exemples");
  wipe.onclick=function(){
    askConfirm("Supprimer les contenus « exemple » ?","Seuls les contenus marqués exemple sont retirés.","Supprimer",function(){
      var n=0;
      Object.keys(S.days).forEach(function(d){
        var day=S.days[d];
        var np=day.posts.filter(function(p){return !p.sample;});
        var ns=day.stories.filter(function(p){return !p.sample;});
        if(np.length!==day.posts.length||ns.length!==day.stories.length){n++; day.posts=np; day.stories=ns; saveDay(d);}
      });
      close(); render(); toast(n?n+" jour(s) nettoyé(s)":"Aucun exemple");
    },true);
  };
  foot.appendChild(wipe);
  var sp=el("div"); sp.style.flex="1"; foot.appendChild(sp);
  var cancel=el("button","btn sm","Annuler"); cancel.onclick=function(){ close(); render(); }; foot.appendChild(cancel);
  var ok=el("button","btn sm solid","Enregistrer");
  ok.onclick=function(){ saveCfg(); close(); renderSub(); render(); toast("Réglages enregistrés"); };
  foot.appendChild(ok); sheet.appendChild(foot);
  function close(){ host.innerHTML=""; }
  scrim.onclick=function(e){ if(e.target===scrim) close(); };
  scrim.appendChild(sheet); host.innerHTML=""; host.appendChild(scrim);
}

/* ══════════ CHROME ══════════ */
function weekLabel(){
  var a=pISO(S.wk), b=pISO(addDays(S.wk,6));
  var am=MON_S[a.getMonth()], bm=MON_S[b.getMonth()];
  return a.getDate()+(am===bm?"":" "+am)+" – "+b.getDate()+" "+bm+" "+b.getFullYear();
}
function renderSub(){
  cleanFilters();
  var b=$("subbar"); b.innerHTML="";
  if(S.tab==="cal"){
    var seg0=el("div","seg");
    [["week","Semaine"],["month","Mois"]].forEach(function(o){
      var bt=el("button",null,o[1]);
      bt.setAttribute("aria-pressed",S.calView===o[0]?"true":"false");
      bt.onclick=function(){ S.calView=o[0]; try{localStorage.setItem("ps_calview",o[0]);}catch(e){} renderSub(); render(); };
      seg0.appendChild(bt);
    });
    b.appendChild(seg0);
  }
  if(S.tab==="dash"||(S.tab==="cal"&&S.calView==="month")||(S.tab==="prod"&&S.prodScope==="month")){
    var nav=el("div","mnav");
    var p=el("button","btn icon","‹"); p.title="Mois précédent"; p.onclick=function(){shiftMonth(-1);};
    var lbl=el("div","lbl",MONTHS[S.ym.m].charAt(0).toUpperCase()+MONTHS[S.ym.m].slice(1)+" "+S.ym.y);
    var n=el("button","btn icon","›"); n.title="Mois suivant"; n.onclick=function(){shiftMonth(1);};
    nav.appendChild(p); nav.appendChild(lbl); nav.appendChild(n); b.appendChild(nav);
    var td=el("button","btn ghost sm","Ce mois-ci");
    td.onclick=function(){var t=new Date(); setMonth(t.getFullYear(),t.getMonth());};
    b.appendChild(td);
  }
  if(S.tab==="prod"){
    var psg=el("div","seg"); psg.id="prodscope";
    [["month","Mois"],["all","Tout"]].forEach(function(o){
      var bt=el("button",null,o[1]); bt.setAttribute("aria-pressed",S.prodScope===o[0]?"true":"false");
      bt.title=o[0]==="month"?"Production du mois affiché":"Toute la production, tous mois confondus";
      bt.onclick=function(){ S.prodScope=o[0]; try{localStorage.setItem("ps_prodscope",o[0]);}catch(e){} renderSub(); render(); };
      psg.appendChild(bt);
    });
    b.appendChild(psg);
  }
  if(S.selMode&&!(S.tab==="cal"&&S.calView==="week")){ S.selMode=false; S.sel={}; }
  if(S.tab==="cal"&&S.calView==="week"){
    var nav2=el("div","mnav");
    var p2=el("button","btn icon","‹"); p2.title="Semaine précédente"; p2.onclick=function(){shiftWeek(-1);};
    var l2=el("div","lbl",weekLabel());
    var n2=el("button","btn icon","›"); n2.title="Semaine suivante"; n2.onclick=function(){shiftWeek(1);};
    nav2.appendChild(p2); nav2.appendChild(l2); nav2.appendChild(n2); b.appendChild(nav2);
    var td2=el("button","btn ghost sm","Cette semaine");
    td2.onclick=function(){ setWeek(mondayOf(todayISO())); };
    b.appendChild(td2);
    var gen=el("button","btn sm","Générer la semaine");
    gen.title="Remplir posts et stories selon tes règles de contenu";
    gen.onclick=openGenerator;
    b.appendChild(gen);
    var cwb=el("button","btn sm","Copier la semaine"); cwb.id="copyweek"; cwb.title="Dupliquer cette semaine vers une autre"; cwb.onclick=openCopyWeek; b.appendChild(cwb);
    var smb=el("button","btn sm"+(S.selMode?" solid":""),S.selMode?"Sélection active":"Sélectionner"); smb.id="selmode"; smb.title="Choisir plusieurs contenus puis agir en lot";
    smb.onclick=function(){ setSelMode(!S.selMode); }; b.appendChild(smb);
    if(window.PS&&PS.reviewButton) b.appendChild(PS.reviewButton());
  }
  if(S.tab==="dash"){
    b.appendChild(el("div","vr"));
    var seg=el("div","seg");
    [["all","Tout"],["post","Posts"],["story","Stories"]].forEach(function(o){
      var bt=el("button",null,o[1]);
      bt.setAttribute("aria-pressed",S.scope===o[0]?"true":"false");
      bt.onclick=function(){S.scope=o[0]; try{localStorage.setItem("ps_scope",o[0]);}catch(e){} renderSub(); render();};
      seg.appendChild(bt);
    });
    b.appendChild(seg);
  }
  if(S.tab==="cal"||S.tab==="prod"){
    b.appendChild(el("div","vr"));
    var sb2=el("select","mini"); sb2.title="Filtrer par marque";
    var b0=el("option",null,"Toutes les marques"); b0.value=""; sb2.appendChild(b0);
    S.cfg.brands.forEach(function(br){
      var op=el("option",null,br.name); op.value=br.id;
      if(S.fBrand===br.id) op.selected=true;
      sb2.appendChild(op);
    });
    sb2.onchange=function(){ S.fBrand=sb2.value; renderSub(); render(); };
    b.appendChild(sb2);
    var sc=el("select","mini"); sc.title="Filtrer par campagne";
    var o0=el("option",null,"Toutes campagnes"); o0.value=""; sc.appendChild(o0);
    Object.keys(S.campaigns).forEach(function(k){
      var op=el("option",null,S.campaigns[k].name); op.value=k; if(S.fCamp===k)op.selected=true; sc.appendChild(op);
    });
    sc.onchange=function(){S.fCamp=sc.value; renderSub(); render();};
    b.appendChild(sc);
    if(S.tab==="prod"){
      var stS=el("select","mini"); stS.title="Filtrer par statut";
      var s0=el("option",null,"Tous statuts"); s0.value=""; stS.appendChild(s0);
      S.cfg.statuses.forEach(function(s){var op=el("option",null,s.name); op.value=s.id; if(S.fStatus===s.id)op.selected=true; stS.appendChild(op);});
      stS.onchange=function(){S.fStatus=stS.value; renderSub(); render();};
      b.appendChild(stS);
    }
    if(S.tab==="prod"){
      var pvs=el("div","seg"); pvs.id="prodview";
      [["kanban","Colonnes"],["list","Listes"]].forEach(function(o){
        var bt=el("button",null,o[1]); bt.setAttribute("aria-pressed",S.prodView===o[0]?"true":"false");
        bt.onclick=function(){ S.prodView=o[0]; try{localStorage.setItem("ps_prodview",o[0]);}catch(e){} renderSub(); render(); };
        pvs.appendChild(bt);
      });
      b.appendChild(pvs);
      var sk=el("div","seg"); sk.id="skelseg";
      [[true,"Briefés"],[false,"+ squelettes"]].forEach(function(o){
        var bt=el("button",null,o[1]); bt.title=o[0]?"Masquer les cases générées pas encore briefées":"Afficher aussi les squelettes";
        bt.setAttribute("aria-pressed",S.hideSkel===o[0]?"true":"false");
        bt.onclick=function(){ S.hideSkel=o[0]; try{localStorage.setItem("ps_skel",o[0]?"1":"0");}catch(e){} renderSub(); render(); };
        sk.appendChild(bt);
      });
      b.appendChild(sk);
    }
    var cl=el("button","btn ghost sm","Réinitialiser");
    cl.style.marginLeft="auto";
    cl.disabled=!(S.fBrand||S.fCamp||S.fStatus||(S.tab==="prod"&&(S.fOwner||S.fProd))); cl.hidden=cl.disabled;
    cl.onclick=function(){S.fBrand=""; S.fCamp=""; S.fStatus=""; if(S.tab==="prod"){ S.fOwner=""; S.fProd=""; } renderSub(); render();};
    b.appendChild(cl);
    if(S.tab==="prod"){
      var np=el("button","btn sm solid","+ Contenu"); np.id="prodnew"; np.title="Nouveau contenu de production";
      np.onclick=function(){ openItem(null,prodSeedFor(S.fProd,(S.fOwner&&S.fOwner!=="__none")?S.fOwner:"")); };
      b.appendChild(np);
    }
  }
  if(S.tab==="ideas"){
    b.appendChild(el("span","flabel","Idées"));
    b.appendChild(el("span",null,Object.keys(S.ideas).length+" en attente"));
    var ni=el("button","btn sm","+ Idée détaillée");
    ni.style.marginLeft="auto";
    ni.onclick=function(){ openIdea(null); };
    b.appendChild(ni);
  }
  if(S.tab==="camp"){
    var segC=el("div","seg"); segC.id="campview";
    [["groups","Dossiers"],["status","Statut"],["brand","Marque"],["timeline","Frise"]].forEach(function(o){
      var bt=el("button",null,o[1]); bt.setAttribute("data-v",o[0]);
      bt.setAttribute("aria-pressed",S.campView===o[0]?"true":"false");
      bt.onclick=function(){ S.campView=o[0]; try{localStorage.setItem("ps_campview",o[0]);}catch(e){} renderSub(); render(); };
      segC.appendChild(bt);
    });
    b.appendChild(segC);
    b.appendChild(el("span",null,Object.keys(S.campaigns).length+" campagne"+(Object.keys(S.campaigns).length>1?"s":"")+" · "+groupList().length+" dossier"+(groupList().length>1?"s":"")));
    var ng=el("button","btn sm","+ Dossier"); ng.id="newgroup";
    ng.style.marginLeft="auto";
    ng.onclick=function(){ openGroup(null); };
    b.appendChild(ng);
    var nc=el("button","btn sm","+ Nouvelle campagne");
    nc.onclick=function(){ openCampaign(null); };
    b.appendChild(nc);
  }
  if(!b.childNodes.length) b.appendChild(el("span","flabel"," "));
}
function renderTabs(){
  var t=$("tabs"); t.innerHTML="";
  TABS.forEach(function(tb){
    var b=el("button",null,tb.name);
    b.setAttribute("role","tab");
    b.setAttribute("aria-selected",S.tab===tb.id?"true":"false");
    b.onclick=function(){
      S.tab=tb.id; try{localStorage.setItem("ps_tab",tb.id);}catch(e){}
      renderTabs(); renderSub(); render(); window.scrollTo(0,0);
    };
    t.appendChild(b);
  });
}
function renderKit(){
  var k=$("kit"); if(!k) return; k.innerHTML="";
  S.cfg.brands.forEach(function(b){
    var seg=el("i"); seg.style.flex=String(Math.max(b.target||8,4)); seg.style.background=bcol(b); seg.title=b.name; k.appendChild(seg);
  });
}
function cleanFilters(){
  // un filtre qui pointe vers une campagne / marque / statut supprimé(e) viderait la vue sans que rien ne l'explique
  if(S.fCamp&&!S.campaigns[S.fCamp]) S.fCamp="";
  if(S.fBrand&&!brand(S.fBrand)) S.fBrand="";
  if(S.fStatus&&!cstatus(S.fStatus)) S.fStatus="";
}
function render(){
  cleanFilters();
  renderKit();
  if(S.tab==="dash") viewDash();
  else if(S.tab==="cal") viewCal();
  else if(S.tab==="ideas") viewIdeas();
  else if(S.tab==="camp") viewCamp();
  else viewProd();
}
function setMonth(y,m){S.ym={y:y,m:m}; try{localStorage.setItem("ps_ym",y+"-"+m);}catch(e){} renderSub(); render();}
function shiftMonth(d){var m=S.ym.m+d,y=S.ym.y; while(m<0){m+=12;y--;} while(m>11){m-=12;y++;} setMonth(y,m);}
function setWeek(w){
  S.wk=w; try{localStorage.setItem("ps_wk",w);}catch(e){}
  var d=pISO(w); S.ym={y:d.getFullYear(),m:d.getMonth()};
  renderSub(); render();
}
function shiftWeek(n){ setWeek(addDays(S.wk,n*7)); }
function setSync(k,t){var s=$("sync"); s.className="sync"+(k?" "+k:""); $("syncTxt").textContent=t;}

function boot(){
  var t=new Date(),y=t.getFullYear(),m=t.getMonth();
  S.wk=mondayOf(todayISO());
  try{
    var sv=localStorage.getItem("ps_ym"); if(sv){var p=sv.split("-"); if(p.length===2&&!isNaN(+p[0])){y=+p[0]; m=+p[1];}}
    var w=localStorage.getItem("ps_wk"); if(w&&/^\d{4}-\d{2}-\d{2}$/.test(w)) S.wk=w;
    var tb=localStorage.getItem("ps_tab"); if(tb) S.tab=tb;
    var sc=localStorage.getItem("ps_scope"); if(sc) S.scope=sc;
    var cv=localStorage.getItem("ps_calview"); if(cv) S.calView=cv;
    var cw=localStorage.getItem("ps_campview"); if(cw) S.campView=cw;
    var pv=localStorage.getItem("ps_prodview"); if(pv) S.prodView=(pv==="list"||pv==="weeks")?"list":"kanban";
    var psc=localStorage.getItem("ps_prodscope"); if(psc==="all"||psc==="month") S.prodScope=psc;
    var pl0=localStorage.getItem("ps_plist"); if(pl0) S.plist=JSON.parse(pl0)||{};
    var sk0=localStorage.getItem("ps_skel"); if(sk0!=null) S.hideSkel=sk0!=="0";
    var co=localStorage.getItem("ps_col"); if(co) S.collapsed=JSON.parse(co)||{};
  }catch(e){}
  S.ym={y:y,m:m};

  $("btnSettings").onclick=openSettings;
  $("btnExport").onclick=openExport;
  $("btnNew").title="Nouveau contenu (touche N)"; $("btnNew").onclick=function(){ openItem(null,{date:todayISO(),kind:"post"}); };
  document.addEventListener("keydown",function(e){ if(e.key==="Escape"){ if($("dlgHost").firstChild) closeDlg(); else $("modalHost").innerHTML=""; } });
  document.addEventListener("keydown",function(e){
    if(e.ctrlKey||e.metaKey||e.altKey||e.defaultPrevented) return;
    var tg=e.target; if(tg&&tg.closest&&tg.closest("input,textarea,select,[contenteditable='true']")) return;
    if($("modalHost").firstChild||$("dlgHost").firstChild) return;
    var k=e.key;
    if(k==="n"){ e.preventDefault(); openItem(null,{date:todayISO(),kind:"post"}); }
    else if(k==="t"){
      e.preventDefault();
      if(S.tab==="cal"&&S.calView==="week") setWeek(mondayOf(todayISO()));
      else { var nw=new Date(); setMonth(nw.getFullYear(),nw.getMonth()); }
    }
    else if(k==="ArrowLeft"||k==="ArrowRight"){
      var dd=k==="ArrowLeft"?-1:1;
      if(S.tab==="cal"&&S.calView==="week"){ e.preventDefault(); shiftWeek(dd); }
      else if(S.tab==="dash"||S.tab==="cal"||(S.tab==="prod"&&S.prodScope==="month")){ e.preventDefault(); shiftMonth(dd); }
    }
    else if(/^[1-5]$/.test(k)&&TABS[+k-1]){ goTab(TABS[+k-1].id); }
  });
  function themeChanged(){ renderSub(); render(); }
  if(window.matchMedia){
    var mq=window.matchMedia("(prefers-color-scheme: dark)");
    if(mq.addEventListener) mq.addEventListener("change",themeChanged);
  }
  try{ new MutationObserver(themeChanged).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]}); }catch(e){}

  renderTabs(); renderSub(); render();
  if(window.PS){ PS.app={S:S,toast:toast,render:render,renderSub:renderSub,el:el,closeDlg:closeDlg,askConfirm:askConfirm,brand:brand,ctype:ctype,camp:camp,ccat:ccat,cintent:cintent,cstatus:cstatus,addDays:addDays,qtyOf:qtyOf,allItems:allItems,DOWS:DOWS,pISO:pISO,dw:dw};
    window.addEventListener("ps:asset",PS.debounce(render,100)); }
  setSync("","Connexion");
  if(!window.claude||!window.claude.use){ setSync("off","Hors ligne"); return; }

  window.claude.use("assets").then(function(a){ S.assets=a; }).catch(function(){});
  window.claude.use("downloads").then(function(d){ S.dl=d; }).catch(function(){});
  window.claude.use("sample").then(function(s){ S.sample=s; if(S.tab==="dash") render(); }).catch(function(){});

  window.claude.use("db").then(function(db){
    if(!db){ setSync("off","Hors ligne"); return; }
    S.db=db; setSync("live","Synchronisé");
    db.doc("config/settings").onSnapshot(function(s){
      if(!s.exists) return;
      var v=thaw(s.data())||{};
      if(v.brands&&v.brands.length) S.cfg.brands=v.brands;
      if(v.types&&v.types.length) S.cfg.types=v.types;
      if(v.formats&&v.formats.length) S.cfg.formats=v.formats;
      if(v.statuses&&v.statuses.length) S.cfg.statuses=v.statuses;
      if(typeof v.storiesPerDay==="number") S.cfg.storiesPerDay=v.storiesPerDay;
      if(typeof v.tolerance==="number") S.cfg.tolerance=v.tolerance;
      renderSub(); render();
    },function(e){console.warn(e);});
    db.collection("days").onSnapshot(function(sn){
      S.days={};
      sn.docs.forEach(function(d){
        var v=thaw(d.data())||{};
        S.days[d.id]={date:v.date||d.id,posts:(v.posts||[]).slice(),stories:(v.stories||[]).slice()};
      });
      render();
    },function(e){console.warn(e); setSync("off","Lecture interrompue");});
    db.doc("config/storyRules").onSnapshot(function(s2){
      if(!s2.exists) return;
      var v=thaw(s2.data())||{};
      Object.keys(DEFRULES).forEach(function(k){ if(v[k]!=null) S.rules[k]=v[k]; });
      if(v.intentions!=null) S.rules.intentions=v.intentions;
      renderSub(); render();
    },function(e){console.warn(e);});
    db.collection("ideas").onSnapshot(function(sn){
      S.ideas={};
      sn.docs.forEach(function(d){ try{ var v=thaw(d.data())||{}; v.id=d.id; S.ideas[d.id]=v; }catch(e){ console.warn(e); } });
      renderSub(); render();
    },function(e){console.warn(e);});
    db.collection("groups").onSnapshot(function(sn){
      S.groups={};
      sn.docs.forEach(function(d){ try{ var v=thaw(d.data())||{}; v.id=d.id; S.groups[d.id]=v; }catch(e){ console.warn(e); } });
      renderSub(); render();
    },function(e){console.warn(e);});
    db.collection("campaigns").onSnapshot(function(sn){
      S.campaigns={};
      sn.docs.forEach(function(d){ try{ var v=thaw(d.data())||{}; v.id=d.id; S.campaigns[d.id]=v; }catch(e){ console.warn(e); } });
      renderSub(); render();
    },function(e){console.warn(e);});
  }).catch(function(e){ console.warn(e); setSync("off","Hors ligne"); });
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot);
else boot();
})();
