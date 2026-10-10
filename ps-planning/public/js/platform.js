/* platform.js — remplace le runtime de l'artefact (window.claude.use) par Firebase + /api/ai.
   app.js démarre sans changement : mêmes services, mêmes formes. */
(function(){
"use strict";

var C=window.PS_CONFIG||{}, PS=window.PS=window.PS||{};
var configured=!!(C.firebase&&C.firebase.apiKey&&!/^PLACEHOLDER/.test(C.firebase.apiKey)&&window.firebase);
var auth=null, fs=null, dbOn=false, pending=0, resolveAuth;
var authReady=new Promise(function(r){ resolveAuth=r; });

function $(i){ return document.getElementById(i); }
function mk(t,c,x){ var e=document.createElement(t); if(c) e.className=c; if(x!=null) e.textContent=x; return e; }
function onReady(f){ if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",f); else f(); }
function rid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function toast(m){ var A=PS.app; if(A&&A.toast) A.toast(m); }
PS.debounce=function(f,ms){ var t; return function(){ clearTimeout(t); t=setTimeout(f,ms); }; };

/* ── statut de synchro ── */
function setSync(k,t){ var s=$("sync"), x=$("syncTxt"); if(!s||!x) return; s.className="sync"+(k?" "+k:""); x.textContent=t; }
function paintSync(){
  if(!dbOn) return;
  if(!navigator.onLine) setSync("off","Hors ligne");
  else if(pending>0) setSync("","Enregistrement…");
  else setSync("live","Synchronisé");
}
function track(p){
  pending++; paintSync();
  return p.then(function(v){ pending--; paintSync(); return v; },function(e){ pending--; paintSync(); throw e; });
}
window.addEventListener("offline",paintSync);
window.addEventListener("online",paintSync);

/* ── init Firebase ── */
if(configured){
  firebase.initializeApp(C.firebase);
  auth=firebase.auth();
  fs=firebase.firestore();
  try{ fs.enablePersistence({synchronizeTabs:true}).catch(function(){}); }catch(e){}
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function(){});
  auth.onAuthStateChanged(function(u){
    if(u){ hideGate(); resolveAuth(u); }
    else onReady(function(){ showGate(""); });
  });
} else {
  onReady(function(){ showGate("Configuration Firebase manquante. Voir NEEDS.md."); });
}

/* ── écran de connexion ── */
var gate=null;
function showGate(msg){
  if(gate){ gate.err.textContent=msg||""; return; }
  var ov=mk("div","psgate"); ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); ov.setAttribute("aria-label","Connexion");
  var f=mk("form","psgate-box"); f.noValidate=true;
  var mark=mk("div","mark"), sq=mk("div","sq","PS"), tt=mk("div","tt");
  tt.appendChild(mk("b",null,"Planning Éditorial")); tt.appendChild(mk("span",null,"Planet Sport"));
  mark.appendChild(sq); mark.appendChild(tt); f.appendChild(mark);
  var un=mk("input"); un.type="email"; un.autocomplete="username"; un.value=C.ownerEmail||""; un.hidden=true; un.tabIndex=-1; f.appendChild(un);
  var lb=mk("label",null,"Mot de passe"); lb.htmlFor="psgate-pw"; f.appendChild(lb);
  var pw=mk("input"); pw.type="password"; pw.id="psgate-pw"; pw.autocomplete="current-password"; pw.autofocus=true; f.appendChild(pw);
  var go=mk("button","btn solid","Entrer"); go.type="submit"; f.appendChild(go);
  var err=mk("div","psgate-err"); err.setAttribute("role","alert"); err.textContent=msg||""; f.appendChild(err);
  f.onsubmit=function(e){
    e.preventDefault();
    if(!auth){ err.textContent="Configuration Firebase manquante. Voir NEEDS.md."; return; }
    if(!pw.value){ pw.focus(); return; }
    go.disabled=true; err.textContent="";
    auth.signInWithEmailAndPassword(C.ownerEmail,pw.value).catch(function(e2){
      var c=e2&&e2.code||"";
      err.textContent=
        /wrong-password|invalid-credential|invalid-login-credentials|user-not-found|invalid-email/.test(c)?"Mot de passe incorrect.":
        c==="auth/too-many-requests"?"Trop de tentatives. Réessaie dans quelques minutes.":
        c==="auth/network-request-failed"?"Pas de connexion.":"Connexion impossible.";
      go.disabled=false; pw.select();
    });
  };
  ov.appendChild(f); document.body.appendChild(ov);
  gate={el:ov,err:err};
  setTimeout(function(){ try{ pw.focus(); }catch(e){} },0);
}
function hideGate(){ if(gate){ gate.el.remove(); gate=null; } }
PS.logout=function(){ if(!auth) return; auth.signOut().then(function(){ location.reload(); }); };

/* ── db : chaque doc est stocké { j: JSON, u: horodatage } (Firestore refuse les tableaux imbriqués) ── */
function enc(o){ return {j:JSON.stringify(o),u:firebase.firestore.FieldValue.serverTimestamp()}; }
function dec(raw){
  if(!raw) return undefined;
  if(typeof raw.j==="string"){ try{ return JSON.parse(raw.j); }catch(e){ return {}; } }
  return raw;
}
function wrapDoc(s){ return {exists:s.exists,id:s.id,data:function(){ return dec(s.data()); }}; }
var db={
  doc:function(path){
    var r=fs.doc(path);
    return {
      onSnapshot:function(cb,err){ return r.onSnapshot(function(s){ cb(wrapDoc(s)); },err); },
      set:function(o){ return track(r.set(enc(o))); },
      delete:function(){ return track(r.delete()); }
    };
  },
  collection:function(name){
    var q=fs.collection(name);
    return {
      onSnapshot:function(cb,err){
        return q.onSnapshot(function(sn){ cb({docs:sn.docs.map(wrapDoc)}); },err);
      }
    };
  },
  flush:function(){ return fs.waitForPendingWrites(); }
};
PS.enc=enc; PS.dec=dec;

/* ── window.claude : point d'entrée attendu par app.js ── */
var SERVICES={db:function(){ dbOn=true; setTimeout(paintSync,0); return db; }};
window.claude={
  use:function(name){
    if(!SERVICES[name]) return Promise.reject({code:"unknown_service"});
    return authReady.then(function(){ return SERVICES[name](); });
  },
  assetSrc:function(id){ return PS.assetSrc?PS.assetSrc(id):""; }
};
PS.SERVICES=SERVICES; PS.fs=function(){ return fs; }; PS.authReady=authReady;
PS.user=function(){ return auth&&auth.currentUser; };

/* ── Enregistrer / Ctrl+S / déconnexion ── */
function saveAll(){
  var A=PS.app; if(!fs) return;
  if(!navigator.onLine){ toast("Hors ligne : gardé sur l'appareil, envoi au retour du réseau"); return; }
  setSync("","Enregistrement…");
  (A&&A.S?A.S.wq:Promise.resolve()).then(function(){ return db.flush(); })
    .then(function(){ paintSync(); toast("Tout est enregistré"); })
    .catch(function(e){ console.warn(e); paintSync(); toast("Enregistrement impossible"); });
}
PS.saveAll=saveAll;
onReady(function(){
  var sy=$("sync"); if(!sy||!sy.parentNode) return;
  var sv=mk("button","btn sm","Enregistrer"); sv.id="btnSave"; sv.type="button"; sv.title="Tout enregistrer (Ctrl+S)"; sv.onclick=saveAll;
  var lo=mk("button","btn ghost sm","Se déconnecter"); lo.id="btnLogout"; lo.type="button"; lo.onclick=PS.logout;
  sy.parentNode.insertBefore(sv,sy.nextSibling); sy.parentNode.insertBefore(lo,sv.nextSibling);
  document.addEventListener("keydown",function(e){
    if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key==="s"||e.key==="S")){ e.preventDefault(); saveAll(); }
  });
});

/* ── assets : images réduites en WebP, stockées en data URL dans assets/{id} ── */
var TYPES=["image/png","image/jpeg","image/webp","image/gif"], assetCache={}, assetFetching={};
function loadImg(file){
  return new Promise(function(res,rej){
    var u=URL.createObjectURL(file), im=new Image();
    im.onload=function(){ URL.revokeObjectURL(u); res(im); };
    im.onerror=function(){ URL.revokeObjectURL(u); rej({code:"unsupported_type"}); };
    im.src=u;
  });
}
function encodeAt(im,edge,q){
  var w=im.naturalWidth, h=im.naturalHeight, k=Math.min(1,edge/Math.max(w,h));
  var c=document.createElement("canvas"); c.width=Math.max(1,Math.round(w*k)); c.height=Math.max(1,Math.round(h*k));
  c.getContext("2d").drawImage(im,0,0,c.width,c.height);
  var d=c.toDataURL("image/webp",q);
  if(d.indexOf("data:image/webp")!==0) d=c.toDataURL("image/jpeg",q); /* Safari n'encode pas le WebP */
  return d;
}
/* seuils appliqués à la data URL elle-même : c'est elle qui doit tenir sous la limite de 1 Mo d'un doc Firestore */
var assets={
  upload:function(file){
    if(!file||TYPES.indexOf(file.type)<0) return Promise.reject({code:"unsupported_type"});
    return loadImg(file).then(function(im){
      var d=encodeAt(im,1600,.82);
      if(d.length>700*1024) d=encodeAt(im,1200,.65);
      if(d.length>900*1024) throw {code:"too_large"};
      var id="a"+rid(), mime=d.slice(5,d.indexOf(";")), bytes=Math.round((d.length-d.indexOf(",")-1)*3/4);
      assetCache[id]=d;
      track(fs.doc("assets/"+id).set({dataUrl:d,type:mime,sizeBytes:bytes,createdAt:firebase.firestore.FieldValue.serverTimestamp()}))
        .catch(function(e){ console.warn(e); toast("Visuel non enregistré"); });
      return {id:id,sizeBytes:bytes};
    });
  }
};
PS.assetSrc=function(id){
  if(!id||typeof id!=="string"||id.indexOf("/")>=0) return "";
  if(Object.prototype.hasOwnProperty.call(assetCache,id)) return assetCache[id];
  if(!assetFetching[id]&&fs){
    assetFetching[id]=true;
    authReady.then(function(){ return fs.doc("assets/"+id).get(); }).then(function(s){
      var v=s.exists?s.data():null;
      assetCache[id]=(v&&typeof v.dataUrl==="string")?v.dataUrl:"";
      if(assetCache[id]) window.dispatchEvent(new CustomEvent("ps:asset",{detail:{id:id}}));
    }).catch(function(){ assetCache[id]=""; });
  }
  return "";
};

/* ── downloads : Blob + lien temporaire ── */
var downloads={
  save:function(o){
    try{
      var isStr=typeof o.data==="string", blob;
      if(isStr){
        var csv=/\.csv$/i.test(o.filename||"");
        var txt=(csv&&o.data.charAt(0)!=="﻿")?"﻿"+o.data:o.data;
        blob=new Blob([txt],{type:csv?"text/csv;charset=utf-8":/\.json$/i.test(o.filename||"")?"application/json":"text/plain;charset=utf-8"});
      } else {
        blob=new Blob([o.data],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      }
      var u=URL.createObjectURL(blob), a=document.createElement("a");
      a.href=u; a.download=o.filename||"export"; a.style.display="none";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(u); },4000);
      return Promise.resolve();
    }catch(e){ return Promise.reject({code:"download_failed"}); }
  }
};

/* ── sample + IA : POST /api/ai avec le jeton Firebase ── */
function aiCall(body,signal){
  return authReady.then(function(u){ return u.getIdToken(); }).then(function(tok){
    return fetch("/api/ai",{method:"POST",signal:signal,
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+tok},body:JSON.stringify(body)});
  }).then(function(r){
    if(r.status===429) throw {code:"rate_limited"};
    return r.text().then(function(t){
      var j; try{ j=JSON.parse(t); }catch(e){ throw {code:r.ok?"invalid_json":"ai_error"}; }
      if(!r.ok) throw {code:(j&&j.code)||"ai_error"};
      return j;
    });
  }).catch(function(e){
    if(e&&e.name==="AbortError") throw {code:"cancelled"};
    if(e&&e.code) throw e;
    throw {code:"ai_error"};
  });
}
var sample={ json:function(prompt,opts){ return aiCall({mode:"json",prompt:String(prompt||"")},opts&&opts.signal); } };
PS.ai=function(mode,payload,signal){ var b={mode:mode}; Object.keys(payload||{}).forEach(function(k){ b[k]=payload[k]; }); return aiCall(b,signal); };
PS.aiError=function(e){
  var c=e&&e.code;
  return c==="cancelled"?"Arrêté.":c==="rate_limited"?"Trop de demandes d'affilée. Réessaie dans un moment.":
    c==="invalid_json"?"Réponse illisible. Réessaie.":"L'IA n'a pas répondu. Réessaie.";
};

SERVICES.assets=function(){ return assets; };
SERVICES.downloads=function(){ return downloads; };
SERVICES.sample=function(){ return sample; };

/* ══════════ FONCTIONS IA ET SAUVEGARDE (accrochées par app.js) ══════════ */

/* A. Légende + 3 propositions dans la fiche contenu */
PS.captionField=function(it,ctx){
  var A=PS.app, f=mk("div","f");
  f.appendChild(mk("label",null,"Légende"));
  var ta=mk("textarea"); ta.id="fi-caption"; ta.value=it.caption||""; ta.placeholder="Texte publié avec le contenu…";
  ta.oninput=function(){ it.caption=ta.value; };
  f.appendChild(ta);
  var row=mk("div","psai-row"), b=mk("button","btn sm","3 propositions"), st=mk("span","hint");
  b.type="button"; row.appendChild(b); row.appendChild(st); f.appendChild(row);
  var opts=mk("div","pscaps"); opts.hidden=true; f.appendChild(opts);
  var ctl=null;
  b.onclick=function(){
    if(ctl){ ctl.abort(); return; }
    var c=ctx(), br=A.brand(it.brand), cp=A.camp(it.campaign), ct=A.ccat(it.category), itn=A.cintent(it.intent), ty=A.ctype(it.type);
    var item={marque:br?br.name:"", categorie:ct?ct.name:"", type:ty?ty.name:"", format:it.format||"",
      slot:c.kind==="story"?"Story":"Post", titre:it.title||"", notes:it.notes||"", campagne:cp?cp.name:"", intention:itn?itn.name:""};
    if(!item.titre&&!item.notes&&!item.marque){ st.textContent="Remplis au moins la marque ou l'angle."; return; }
    ctl=new AbortController(); b.textContent="Arrêter"; st.textContent="Rédaction…";
    PS.ai("captions",{item:item},ctl.signal).then(function(r){
      opts.innerHTML="";
      (r.options||[]).forEach(function(o){
        var cd=mk("button","pscap",o); cd.type="button";
        cd.onclick=function(){ ta.value=o; it.caption=o; ta.focus(); };
        opts.appendChild(cd);
      });
      opts.hidden=false; st.textContent="";
    }).catch(function(e){ st.textContent=PS.aiError(e); })
      .then(function(){ ctl=null; b.textContent="3 propositions"; });
  };
  return f;
};

/* B. Analyser la semaine affichée */
PS.reviewButton=function(){
  var b=mk("button","btn sm","Analyser la semaine"); b.id="reviewweek"; b.type="button";
  b.title="Repérer les déséquilibres de la semaine et proposer des échanges";
  b.onclick=function(){ reviewWeek(b); };
  return b;
};
function dayLabel(d){ var A=PS.app; return /^\d{4}-\d{2}-\d{2}$/.test(d)?A.DOWS[A.dw(A.pISO(d))]+" "+A.pISO(d).getDate():""; }
function reviewWeek(btn){
  var A=PS.app, S=A.S, ws=S.wk, we=A.addDays(ws,6);
  var list=A.allItems(ws,we);
  if(!list.length){ A.toast("Semaine vide : rien à analyser"); return; }
  var payload={
    semaine:{du:ws,au:we},
    contenus:list.map(function(r){
      var b=A.brand(r.it.brand), t=A.ctype(r.it.type), ct=A.ccat(r.it.category);
      return {date:r.date, jour:dayLabel(r.date), slot:r.kind, marque:b?b.name:"", type:t?t.name:"",
        categorie:ct?ct.name:"", format:r.it.format||"", quantite:A.qtyOf(r.it), titre:r.it.title||""};
    }),
    marques:S.cfg.brands.map(function(b){ return {nom:b.name,objectif_pct:b.target}; }),
    types:S.cfg.types.map(function(t){ return {nom:t.name,objectif_pct:t.target}; }),
    tolerance_points:S.cfg.tolerance, stories_min_par_jour:S.cfg.storiesPerDay
  };
  btn.disabled=true; btn.textContent="Analyse…";
  PS.ai("review",payload).then(function(r){ showReview(r.suggestions||[]); })
    .catch(function(e){ A.toast(PS.aiError(e)); })
    .then(function(){ btn.disabled=false; btn.textContent="Analyser la semaine"; });
}
function showReview(list){
  var A=PS.app, h=$("dlgHost"); h.innerHTML="";
  var sc=mk("div","scrim dlg"), bx=mk("div","dlgbox wide"); bx.setAttribute("role","dialog");
  bx.appendChild(mk("h3",null,"Analyse de la semaine"));
  if(!list.length) bx.appendChild(mk("p",null,"Rien à corriger : la semaine tient ses objectifs."));
  list.forEach(function(s){
    var row=mk("div","psrev");
    var d=dayLabel(s.date); if(d) row.appendChild(mk("div","psrev-d",d));
    row.appendChild(mk("div","psrev-i",s.issue));
    row.appendChild(mk("div","psrev-f",s.fix));
    bx.appendChild(row);
  });
  var ft=mk("div","dfoot"), ok=mk("button","btn sm solid","Fermer"); ok.type="button"; ok.onclick=A.closeDlg;
  ft.appendChild(ok); bx.appendChild(ft);
  sc.onclick=function(e){ if(e.target===sc) A.closeDlg(); };
  sc.appendChild(bx); h.appendChild(sc);
}

/* Sauvegarde JSON (même forme que seed.json) */
var COLLS=["days","campaigns","ideas","groups"];
function backupPaths(data){
  var out=[];
  COLLS.forEach(function(c){ var m=data[c]; if(m&&typeof m==="object") Object.keys(m).forEach(function(id){ if(id&&id.indexOf("/")<0) out.push([c+"/"+id,m[id]]); }); });
  var cf=data.config||{};
  ["settings","storyRules"].forEach(function(k){ if(cf[k]&&typeof cf[k]==="object") out.push(["config/"+k,cf[k]]); });
  return out;
}
function exportBackup(){
  var out={exportedAt:new Date().toISOString().slice(0,10),days:{},campaigns:{},ideas:{},groups:{},config:{}}, n=0;
  return Promise.all(COLLS.concat(["config"]).map(function(c){
    return fs.collection(c).get().then(function(sn){
      sn.docs.forEach(function(d){ var v=dec(d.data()); if(v===undefined) return; out[c][d.id]=v; n++; });
    });
  })).then(function(){
    var stamp=new Date().toISOString().slice(0,16).replace(/[-:T]/g,"");
    return downloads.save({filename:"planning-ps-sauvegarde-"+stamp+".json",data:JSON.stringify(out,null,1)}).then(function(){ return n; });
  });
}
function importBackup(data,replace){
  var paths=backupPaths(data), done=0, skipped=0;
  return Promise.all(paths.map(function(p){
    var r=fs.doc(p[0]);
    return (replace?Promise.resolve(false):r.get().then(function(s){ return s.exists; })).then(function(ex){
      if(ex){ skipped++; return; }
      return db.doc(p[0]).set(p[1]).then(function(){ done++; });
    });
  })).then(function(){ return {done:done,skipped:skipped}; });
}
function confirmImport(data,st){
  var A=PS.app, paths=backupPaths(data);
  if(!paths.length){ st.textContent="Aucune donnée reconnue dans ce fichier."; return; }
  var h=$("dlgHost"); h.innerHTML="";
  var sc=mk("div","scrim dlg"), bx=mk("div","dlgbox"); bx.setAttribute("role","alertdialog");
  bx.appendChild(mk("h3",null,"Importer cette sauvegarde ?"));
  bx.appendChild(mk("p",null,paths.length+" documents. Ceux qui existent déjà sont gardés tels quels."));
  var lb=mk("label","psck"), ck=mk("input"); ck.type="checkbox";
  lb.appendChild(ck); lb.appendChild(document.createTextNode(" remplacer les documents existants")); bx.appendChild(lb);
  var ft=mk("div","dfoot"), no=mk("button","btn sm","Annuler"), ok=mk("button","btn sm solid","Importer");
  no.type="button"; ok.type="button"; no.onclick=A.closeDlg;
  ok.onclick=function(){
    var rep=ck.checked; A.closeDlg(); st.textContent="Import…";
    importBackup(data,rep).then(function(r){
      st.textContent=r.done+" importé(s), "+r.skipped+" déjà présent(s).";
      A.toast("Sauvegarde importée");
    }).catch(function(e){ console.warn(e); st.textContent="Import interrompu."; });
  };
  ft.appendChild(no); ft.appendChild(ok); bx.appendChild(ft);
  sc.onclick=function(e){ if(e.target===sc) A.closeDlg(); };
  sc.appendChild(bx); h.appendChild(sc);
}
PS.backupSection=function(){
  var sec=mk("div"); sec.style.marginTop="22px";
  sec.appendChild(mk("div","secttl","Sauvegarde"));
  var row=mk("div"); row.style.cssText="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap";
  var ex=mk("button","btn sm","Exporter une sauvegarde (JSON)"), im=mk("button","btn sm","Importer une sauvegarde");
  ex.type="button"; im.type="button";
  var fi=mk("input"); fi.type="file"; fi.accept="application/json,.json"; fi.hidden=true;
  var st=mk("div","hint"); st.style.marginTop="6px";
  row.appendChild(ex); row.appendChild(im); row.appendChild(fi); sec.appendChild(row); sec.appendChild(st);
  ex.onclick=function(){
    if(!fs){ st.textContent="Pas de connexion à la base."; return; }
    st.textContent="Préparation…";
    exportBackup().then(function(n){ st.textContent=n+" documents exportés."; })
      .catch(function(e){ console.warn(e); st.textContent="Export impossible."; });
  };
  im.onclick=function(){ fi.click(); };
  fi.onchange=function(){
    var f=fi.files&&fi.files[0]; fi.value=""; if(!f) return;
    f.text().then(function(t){ return JSON.parse(t); })
      .then(function(d){ if(!d||typeof d!=="object") throw 0; confirmImport(d,st); })
      .catch(function(){ st.textContent="Fichier illisible."; });
  };
  return sec;
};
})();
