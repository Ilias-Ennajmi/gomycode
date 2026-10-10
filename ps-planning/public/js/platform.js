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

/*@@SERVICES@@*/
})();
