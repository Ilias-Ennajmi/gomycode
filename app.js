(function(){
  var DAY_NAMES = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
  var CAT_COLORS = {
    "Campaigns Content": "var(--cat-campaign)",
    "Brands Collections Content": "var(--cat-brands)",
    "Planet Sport Content": "var(--cat-planet)",
    "Educational Content": "var(--cat-edu)",
    "Story 1": "var(--story1)",
    "Story 2": "var(--story2)",
    "Story 3": "var(--story3)"
  };
  var CAT_ICON = {
    "Campaigns Content": "ti-discount-2",
    "Brands Collections Content": "ti-tag",
    "Planet Sport Content": "ti-building-store",
    "Educational Content": "ti-bulb",
    "Story 1": "ti-bolt",
    "Story 2": "ti-camera",
    "Story 3": "ti-repeat"
  };
  var STATUS_COLORS = {
    "Idée": "#378ADD", "En préparation": "#EF9F27", "Prêt": "#639922", "Publié": "#888780"
  };

  var TIER1 = [["Adidas",36.3],["Puma",30.5],["New Balance",9.5],["Asics",6.8]];
  var TIER2 = [["Arena",4.5],["Nox",1.7],["Dunlop",1.8],["Castelli",2.6]];
  var TIER3 = [["Quiksilver",1.4],["Wilson",1.4],["Champion",1.1],["Venum",1.1],["Roxy",0.6],["Polar",0.3],["Stiga",0.3],["Speedo",0.1],["Banana Moon",0.03]];
  var TIER1_PAIRS = [["Adidas","Puma"], ["New Balance","Asics"]];
  var TIER2_NAMES = TIER2.map(function(t){return t[0];});
  var TIER3_NAMES = TIER3.map(function(t){return t[0];});
  var ROTATE_SLOT = ["Planet Sport Content — Store Content", "Educational Content — Tech Specs Info"];

  var STORY1_ROLE_BY_DAY = {
    "Lundi": "Tier 2 Brand", "Mardi": "Store Content", "Mercredi": "Tier 3 Brand",
    "Jeudi": "Outfit Composition", "Vendredi": "La Excuse Tuée",
    "Samedi": "UGC — Repost Client", "Dimanche": "Sunday Run Motivation"
  };
  var STORY1_FORMAT = {
    "Tier 2 Brand": "Reel/image reposté", "Store Content": "Image ou Reel en boutique",
    "Tier 3 Brand": "Reel/image reposté", "Outfit Composition": "Image, tags produits",
    "La Excuse Tuée": "Image, texte overlay", "UGC — Repost Client": "Repost story client",
    "Sunday Run Motivation": "Image, citation overlay"
  };
  var STORY1_CTA = {
    "Tier 2 Brand": "Swipe up pour découvrir la marque",
    "Store Content": "Réponds : t'as déjà vu ce coin ?",
    "Tier 3 Brand": "Swipe up pour découvrir la marque",
    "Outfit Composition": "Swipe up vers la tenue",
    "La Excuse Tuée": "Réponds avec ton excuse du jour",
    "UGC — Repost Client": "Tague-nous pour être reposté",
    "Sunday Run Motivation": "Partage à quelqu'un qui repousse encore"
  };
  var STORY2_TREATMENT = {
    "Lundi": "Produit seul, photo simple", "Mardi": "Produit porté/utilisé",
    "Mercredi": "Produit seul, photo simple", "Jeudi": "Produit porté/utilisé",
    "Vendredi": "Produit + prix, direct", "Samedi": "Usage précis (match, sortie)",
    "Dimanche": "Usage précis (running)"
  };

  var HOLIDAYS = {
    "2026-07-19": "Finale Coupe du Monde 2026",
    "2026-07-30": "Fête du Trône",
    "2026-08-14": "Oued Eddahab",
    "2026-08-20": "Révolution du Roi et du Peuple",
    "2026-08-21": "Fête de la Jeunesse",
    "2026-09-05": "Aïd El Mawlid"
  };

  function pad(n){ return n < 10 ? "0"+n : ""+n; }
  function toKey(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
  function addDays(d, n){ var r = new Date(d); r.setDate(r.getDate()+n); return r; }
  function mondayOf(d){ var day = (d.getDay()+6)%7; return addDays(d, -day); }
  function weekNum(d){ var base = new Date(2026,6,13); return Math.round((mondayOf(d)-base)/(7*86400000)); }
  function mod(n,m){ return ((n%m)+m)%m; }

  function genDayCards(dateObj){
    var key = toKey(dateObj);
    var dayName = DAY_NAMES[(dateObj.getDay()+6)%7];
    var w = weekNum(dateObj);
    var tier1pair = TIER1_PAIRS[mod(w,2)];
    var tier2 = TIER2_NAMES[mod(w,4)];
    var tier3 = TIER3_NAMES[mod(w,9)];
    var rotate = ROTATE_SLOT[mod(w,2)];
    var cards = [];

    var feed = null;
    if (dayName === "Lundi") feed = {kind:"Feed", category:"Brands Collections Content", title: tier1pair[0], brand: tier1pair[0], tier:1, format:"Brand Post", cta:"Swipe up / Shop Now"};
    else if (dayName === "Mardi") feed = {kind:"Feed", category:"Campaigns Content", title:"Sales / Campagne active", format:"Créatif libre", cta:"Swipe up vers l'offre"};
    else if (dayName === "Mercredi") feed = {kind:"Feed", category:"Brands Collections Content", title: tier1pair[1], brand: tier1pair[1], tier:1, format:"Brand Post", cta:"Swipe up / Shop Now"};
    else if (dayName === "Jeudi") feed = {kind:"Feed", category:"Campaigns Content", title:"Sales / Campagne active", format:"Créatif libre", cta:"Swipe up vers l'offre"};
    else if (dayName === "Vendredi") feed = {kind:"Feed", category:"Brands Collections Content", title: tier2, brand: tier2, tier:2, format:"Post simple ou Carousel", cta:"Swipe up / Shop Now"};
    else if (dayName === "Samedi") feed = {kind:"Feed", category: rotate.split(" — ")[0], title: rotate.split(" — ")[1], format:"Carousel ou Reel", cta:"Swipe up vers le post"};

    if (feed) cards.push(feed);

    var s1role = STORY1_ROLE_BY_DAY[dayName];
    var s1title = s1role;
    var s1brand = null, s1tier = null;
    if (s1role === "Tier 2 Brand") { s1title = "Repost marque"; s1brand = tier2; s1tier = 2; }
    if (s1role === "Tier 3 Brand") { s1title = "Repost marque"; s1brand = tier3; s1tier = 3; }
    var s1card = {kind:"Story 1", category:"Story 1", title: s1title, format: STORY1_FORMAT[s1role], cta: STORY1_CTA[s1role]};
    if (s1brand) { s1card.brand = s1brand; s1card.tier = s1tier; }
    cards.push(s1card);
    cards.push({kind:"Story 2", category:"Story 2", title:"Focus Produit", format: STORY2_TREATMENT[dayName], cta:"Swipe up / Shop Now"});

    var s3title = feed ? ("Repost — " + (feed.brand || feed.title)) : "Repost meilleur post récent / campagne";
    cards.push({kind:"Story 3", category:"Story 3", title: s3title, format:"Repost (image ou reel)", cta:"Swipe up vers le post"});

    cards.forEach(function(c, i){
      c.id = key + "-" + i + "-" + c.kind.replace(/\s/g,"");
      c.status = "Idée";
      c.responsable = "À assigner";
      c.note = "";
      c.checklist = [false, false, false];
      c.link = "";
    });
    return cards;
  }

  var STORAGE_KEY = "ps_calendar_v3";
  var state = { weeks: {}, ideas: [], production: { todo: [], inprogress: [], ready: [] }, campaigns: [], assets: [], influencers: [] };

  function ensureStateShape(){
    if (!state.weeks) state.weeks = {};
    if (!state.ideas) state.ideas = [];
    if (!state.production) state.production = { todo: [], inprogress: [], ready: [] };
    if (!state.campaigns || state.campaigns.length === 0) state.campaigns = JSON.parse(JSON.stringify(CAMPAIGN_SEED));
    if (!state.prefs) state.prefs = { dark: false, tab: "calendar", view: "week" };
    if (!state.assets) state.assets = [];
    if (!state.influencers) state.influencers = [];
  }

  function ensureWeekData(mondayDate){
    var wk = toKey(mondayDate);
    if (!state.weeks[wk]) {
      var days = {};
      for (var i=0;i<7;i++){
        var d = addDays(mondayDate, i);
        days[toKey(d)] = genDayCards(d);
      }
      state.weeks[wk] = days;
    }
    return state.weeks[wk];
  }

  var REAL_TODAY = new Date();
  var RANGE_START = new Date(2026,6,13);
  var RANGE_END = new Date(2026,9,4);
  var N_WEEKS = 12;
  var initialAnchor = (REAL_TODAY >= RANGE_START && REAL_TODAY <= RANGE_END) ? REAL_TODAY : RANGE_START;
  var currentMonday = mondayOf(initialAnchor);
  var todayKey = toKey(REAL_TODAY);
  var currentView = "week";
  var currentFilters = { search: "", status: "", resp: "" };

  var CAMPAIGN_SEED = [
    {id:"camp-cdm", name:"Coupe du Monde 2026", period:"11 juin – 19 juillet", start:"2026-06-11", end:"2026-07-19", items:[]},
    {id:"camp-summer", name:"Summer Sales", period:"3 juillet – 17 août", start:"2026-07-03", end:"2026-08-17", items:[]},
    {id:"camp-bts", name:"Back to School", period:"28 août – 14 septembre", start:"2026-08-28", end:"2026-09-14", items:[]},
    {id:"camp-botola", name:"Reprise Botola", period:"Fin août – septembre", start:"2026-08-24", end:"2026-09-30", items:[]},
    {id:"camp-bf", name:"Black Friday", period:"Fin novembre", start:"2026-11-27", end:"2026-11-30", items:[]},
    {id:"camp-hiver", name:"Collection Hiver", period:"Décembre – janvier", start:"2026-12-01", end:"2027-01-15", items:[]},
    {id:"camp-ny", name:"Nouvel An / Nouveaux Objectifs", period:"Fin décembre – début janvier", start:"2026-12-26", end:"2027-01-10", items:[]}
  ];

  var CHARTE_ITEMS = [
    "Français par défaut, \"on\" plutôt que \"nous\"",
    "Phrases courtes, punchy, accroche impérative ou déclarative",
    "Pas de tirets, pas de deux-points en milieu de texte",
    "Maximum 2 emojis par légende",
    "\"DIMA MAGHRIB\" en clôture des posts significatifs, jamais en milieu de texte",
    "Référence magasin/web en fin de légende (\"En magasin & sur planetsport.ma\")",
    "Pas de mot répété dans une même légende",
    "Éviter le ton institutionnel ou moralisateur",
    "Toujours proposer 3 options de copy, structurellement différentes"
  ];

  // ---------- Supabase — auth & persistence ----------
  var WORKSPACE_ID = "planet-sport-workspace";
  var supa = null;
  var saveTimer = null;
  var lastPushedJSON = null;
  var realtimeChannel = null;

  function supabaseConfigured(){
    return !!(window.PS_SUPABASE_URL && window.PS_SUPABASE_ANON_KEY &&
      window.PS_SUPABASE_URL.indexOf("YOUR-PROJECT") === -1 &&
      window.PS_SUPABASE_ANON_KEY.indexOf("YOUR-ANON-KEY") === -1);
  }

  function setSyncStatus(text, offline){
    var el = document.getElementById("psSyncStatus");
    if (!el) return;
    el.classList.toggle("offline", !!offline);
    el.innerHTML = '<span class="ps-syncdot"></span><span>'+text+'</span>';
  }

  function save(){
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e){}
    if (!supa) return;
    clearTimeout(saveTimer);
    setSyncStatus("Enregistrement…");
    saveTimer = setTimeout(function(){
      var payload = JSON.parse(JSON.stringify(state));
      var json = JSON.stringify(payload);
      lastPushedJSON = json;
      supa.from("app_state").upsert({ id: WORKSPACE_ID, data: payload, updated_at: new Date().toISOString() })
        .then(function(res){
          if (res.error) { setSyncStatus("Erreur de synchro", true); console.error("Supabase save error", res.error); }
          else { setSyncStatus("Synchronisé"); }
        });
    }, 700);
  }

  function load(cb){
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch(e){}
    if (raw) { try { state = JSON.parse(raw); } catch(e){} }
    if (!supa) { cb(); return; }
    supa.from("app_state").select("data").eq("id", WORKSPACE_ID).maybeSingle().then(function(res){
      if (res.error) { setSyncStatus("Erreur de chargement", true); }
      else if (res.data && res.data.data && Object.keys(res.data.data).length) { state = res.data.data; setSyncStatus("Synchronisé"); }
      else { setSyncStatus("Synchronisé"); }
      cb();
      subscribeRealtime();
    }).catch(function(){ setSyncStatus("Hors ligne", true); cb(); });
  }

  function subscribeRealtime(){
    if (!supa || realtimeChannel) return;
    realtimeChannel = supa.channel("app_state_sync")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_state", filter: "id=eq."+WORKSPACE_ID }, function(payload){
        var incomingJSON = JSON.stringify(payload.new.data);
        if (incomingJSON === lastPushedJSON) return;
        state = payload.new.data;
        ensureStateShape();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e){}
        renderTabBody(state.prefs.tab || "calendar");
        setSyncStatus("Mis à jour par un autre appareil");
      })
      .subscribe();
  }

  var monthsFr = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  function fmtRange(monday){
    var sunday = addDays(monday, 6);
    var s = monday.getDate() + " " + monthsFr[monday.getMonth()];
    var e = sunday.getDate() + " " + monthsFr[sunday.getMonth()] + " " + sunday.getFullYear();
    return s + " – " + e;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  function daysUntil(dateStr, occ){
    var parts = dateStr.split("-");
    var d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    var diff = Math.round((d - REAL_TODAY)/86400000);
    return diff;
  }

  function renderStats(){
    var wk = toKey(currentMonday);
    var daysData = state.weeks[wk] || {};
    var feedCount = 0, storyCount = 0;
    Object.keys(daysData).forEach(function(k){
      daysData[k].forEach(function(c){ if (c.kind === "Feed") feedCount++; else storyCount++; });
    });
    var nextHoliday = null;
    Object.keys(HOLIDAYS).sort().forEach(function(k){
      if (!nextHoliday && daysUntil(k) >= 0) nextHoliday = k;
    });
    var holidayText = nextHoliday ? (daysUntil(nextHoliday) + "j — " + HOLIDAYS[nextHoliday]) : "Aucune";

    var dated = state.campaigns.filter(function(c){ return c.start && c.end; }).slice().sort(function(a,b){ return a.start.localeCompare(b.start); });
    var current = dated.filter(function(c){ return todayKey >= c.start && todayKey <= c.end; })[0] || null;
    var next = dated.filter(function(c){ return c.start > (current ? current.end : todayKey); })[0] || null;
    var campText = (current ? current.name : "Aucune") + " → " + (next ? next.name : "—");

    var el = document.getElementById("psStats");
    var items = [
      [feedCount, "posts Feed cette semaine", false],
      [storyCount, "stories cette semaine", false],
      [campText, "campagne actuelle → suivante", true],
      [holidayText, "prochaine échéance", true]
    ];
    el.innerHTML = items.map(function(it){
      var sizeStyle = it[2] ? ' style="font-size:15px;"' : "";
      return '<div class="ps-stat"><div class="ps-stat-num ps-h"'+sizeStyle+'>'+it[0]+'</div><div class="ps-stat-label">'+it[1]+'</div></div>';
    }).join("");
  }

  var AVATAR_COLORS = {
    "À assigner": "#9AA2AF", "Ilias": "#235789", "Agence": "#C98A1E", "Équipe Boutique": "#2F7A4C"
  };
  function avatarInitials(name){
    if (!name) return "?";
    var parts = name.split(" ");
    return parts.length > 1 ? (parts[0][0]+parts[1][0]).toUpperCase() : name.slice(0,2).toUpperCase();
  }

  function cardIsDueSoon(card, dateKey){
    if (card.status !== "Prêt") return false;
    var parts = dateKey.split("-");
    var d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    var diffH = (d - REAL_TODAY) / 3600000;
    return diffH >= 0 && diffH <= 48;
  }

  function activeCampaignFor(dateKey){
    for (var i=0;i<state.campaigns.length;i++){
      var c = state.campaigns[i];
      if (c.start && c.end && dateKey >= c.start && dateKey <= c.end) return c;
    }
    return null;
  }

  function cardIsLate(card, dateKey){
    if (card.status === "Publié") return false;
    var parts = dateKey.split("-");
    var d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    return d < new Date(REAL_TODAY.getFullYear(), REAL_TODAY.getMonth(), REAL_TODAY.getDate());
  }

  function cardMatchesFilters(card){
    if (currentFilters.search) {
      var q = currentFilters.search.toLowerCase();
      var hay = (card.title + " " + (card.brand||"") + " " + card.category).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    if (currentFilters.status && card.status !== currentFilters.status) return false;
    if (currentFilters.resp && card.responsable !== currentFilters.resp) return false;
    return true;
  }

  function renderCard(card, dateKey, zoneCards, staggerIndex){
    var el = document.createElement("div");
    el.className = "ps-card" + (cardIsDueSoon(card, dateKey) ? " ps-duesoon" : "");
    el.tabIndex = 0;
    el.dataset.cardId = card.id;
    el.style.setProperty("--card-accent", CAT_COLORS[card.category] || "var(--line)");
    if (staggerIndex !== undefined) el.style.animationDelay = (staggerIndex * 25) + "ms";
    if (!cardMatchesFilters(card)) el.style.display = "none";
    el.draggable = true;
    var tagHtml = card.brand ? '<span class="ps-tag tierdefault">'+escapeHtml(card.brand)+'</span>' : "";
    var late = cardIsLate(card, dateKey);
    var checklist = card.checklist || [false,false,false];
    var doneCount = checklist.filter(Boolean).length;
    var checklistHtml = "";
    if (card.kind === "Feed") {
      checklistHtml = '<div class="ps-checklist" title="Shooting / Montage / Caption">' +
        checklist.map(function(done,i){ return '<span class="ps-checkdot'+(done?" done":"")+'" data-ci="'+i+'">'+(done?'<i class="ti ti-check" aria-hidden="true" style="font-size:8px;"></i>':'')+'</span>'; }).join("") +
        '<span style="font-size:9px;color:var(--text-3);margin-left:2px;">'+doneCount+'/3</span></div>';
    }
    var linkHtml = card.link ? '<a class="ps-cardlink" href="'+escapeHtml(card.link)+'" target="_blank" rel="noopener"><i class="ti ti-link" aria-hidden="true" style="font-size:11px;"></i>Lien</a>' : "";
    var avatarColor = AVATAR_COLORS[card.responsable] || "#9AA2AF";
    el.innerHTML =
      '<div style="position:absolute;top:5px;right:5px;display:flex;gap:3px;">' +
        '<div class="ps-card-del ps-card-dup" title="Dupliquer" style="position:static;"><i class="ti ti-copy" aria-hidden="true" style="font-size:11px;"></i></div>' +
        '<div class="ps-card-del" title="Supprimer" style="position:static;"><i class="ti ti-x" aria-hidden="true" style="font-size:11px;"></i></div>' +
      '</div>' +
      (card.image ? '<img src="'+escapeHtml(card.image)+'" alt="" style="width:100%;height:64px;object-fit:cover;border-radius:6px;margin-bottom:5px;" onerror="this.style.display=\'none\'">' : "") +
      '<div class="ps-card-top"><i class="ti '+(CAT_ICON[card.category]||"ti-point")+' ps-card-icon" aria-hidden="true"></i><span class="ps-card-kind">'+card.kind+'</span></div>' +
      '<div class="ps-card-title">'+escapeHtml(card.title)+'</div>' +
      '<div class="ps-card-format">'+escapeHtml(card.format || "")+'</div>' +
      tagHtml +
      (late ? '<span class="ps-tag ps-late">En retard</span>' : "") +
      checklistHtml + linkHtml +
      '<div class="ps-card-foot"><span class="ps-dot ps-dot-cycle" title="Cliquer pour changer le statut" style="background:'+(STATUS_COLORS[card.status]||"#999")+';"></span><span class="ps-statustext">'+card.status+'</span>' +
      '<span class="ps-avatar" style="background:'+avatarColor+';" title="'+escapeHtml(card.responsable||"")+'">'+avatarInitials(card.responsable)+'</span></div>';
    el.addEventListener("dragstart", function(e){
      e.dataTransfer.setData("text/plain", dateKey+"::"+card.id);
      e.dataTransfer.effectAllowed = "move";
      setTimeout(function(){ el.style.opacity = "0.4"; }, 0);
    });
    el.addEventListener("dragend", function(){ el.style.opacity = "1"; });
    el.addEventListener("dragover", function(e){ e.preventDefault(); e.stopPropagation(); });
    el.addEventListener("drop", function(e){
      e.preventDefault();
      e.stopPropagation();
      handleDrop(e, dateKey, card);
    });
    el.querySelectorAll(".ps-checkdot").forEach(function(dot){
      dot.addEventListener("click", function(e){
        e.stopPropagation();
        var ci = parseInt(dot.dataset.ci);
        if (!card.checklist) card.checklist = [false,false,false];
        card.checklist[ci] = !card.checklist[ci];
        save();
        render();
      });
    });
    el.querySelector(".ps-dot-cycle").addEventListener("click", function(e){
      e.stopPropagation();
      var order = ["Idée","En préparation","Prêt","Publié"];
      var idx = order.indexOf(card.status);
      card.status = order[(idx + 1) % order.length];
      save();
      render();
    });
    el.querySelector(".ps-card-dup").addEventListener("click", function(e){
      e.stopPropagation();
      var copy = JSON.parse(JSON.stringify(card));
      copy.id = card.id + "-copy-" + Date.now();
      copy.status = "Idée";
      var idx = zoneCards.indexOf(card);
      zoneCards.splice(idx + 1, 0, copy);
      save();
      render();
    });
    el.querySelector(".ps-card-del").addEventListener("click", function(e){
      e.stopPropagation();
      if (!window.confirm("Supprimer ce contenu ?")) return;
      var idx = zoneCards.indexOf(card);
      if (idx > -1) {
        var removed = zoneCards.splice(idx, 1)[0];
        save();
        render();
        showUndoToast("Contenu supprimé", function(){
          zoneCards.splice(idx, 0, removed);
          save();
          render();
        });
      }
    });
    el.addEventListener("click", function(e){
      if (e.target.closest(".ps-card-del") || e.target.closest(".ps-checkdot") || e.target.closest(".ps-cardlink")) return;
      openEditModal(card, dateKey, zoneCards);
    });
    return el;
  }

  function showUndoToast(message, restoreFn){
    var root = document.getElementById("psToastRoot");
    root.innerHTML = "";
    var toast = document.createElement("div");
    toast.className = "ps-toast";
    toast.innerHTML = '<span>'+message+'</span><button>Annuler</button>';
    toast.querySelector("button").addEventListener("click", function(){
      restoreFn();
      root.innerHTML = "";
    });
    root.appendChild(toast);
    setTimeout(function(){ if (root.contains(toast)) root.innerHTML = ""; }, 5000);
  }

  var dragKindHint = "";

  function handleDrop(e, toDateKey, targetCard){
    var data = e.dataTransfer.getData("text/plain");
    if (!data) return;
    var parts = data.split("::");
    var fromKey = parts[0], cardId = parts[1];
    var wk = toKey(currentMonday);
    var daysData = state.weeks[wk];
    var fromCards = daysData[fromKey];
    if (!fromCards) return;
    var idx = -1;
    for (var j=0;j<fromCards.length;j++){ if (fromCards[j].id === cardId){ idx = j; break; } }
    if (idx === -1) return;
    var moved = fromCards[idx];

    var isFeedMove = moved.kind === "Feed";
    if (targetCard && (targetCard.kind === "Feed") !== isFeedMove) return; // don't mix zones

    fromCards.splice(idx, 1);
    if (!daysData[toDateKey]) daysData[toDateKey] = [];
    var toCards = daysData[toDateKey];
    if (targetCard) {
      var targetIdx = toCards.indexOf(targetCard);
      if (fromKey === toDateKey && targetIdx > idx) targetIdx -= 0;
      toCards.splice(targetIdx === -1 ? toCards.length : targetIdx, 0, moved);
    } else {
      toCards.push(moved);
    }
    save();
    render();
    snapCard(moved.id);
  }

  function snapCard(cardId){
    setTimeout(function(){
      var el = document.querySelector('.ps-card[data-card-id="'+cardId+'"]');
      if (el) { el.classList.add("snap"); setTimeout(function(){ el.classList.remove("snap"); }, 300); }
    }, 30);
  }

  function computeAttentionItems(){
    var items = [];
    Object.keys(state.weeks).sort().forEach(function(wk){
      var daysData = state.weeks[wk];
      Object.keys(daysData).sort().forEach(function(dateKey){
        (daysData[dateKey] || []).forEach(function(card){
          var late = cardIsLate(card, dateKey);
          var soon = !late && cardIsDueSoon(card, dateKey);
          if (late || soon) items.push({ card: card, dateKey: dateKey, late: late });
        });
      });
    });
    items.sort(function(a,b){
      if (a.late !== b.late) return a.late ? -1 : 1;
      return a.dateKey < b.dateKey ? -1 : (a.dateKey > b.dateKey ? 1 : 0);
    });
    return items;
  }

  function jumpToDate(dateKey){
    var parts = dateKey.split("-");
    var d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    currentMonday = mondayOf(d);
    if (currentView !== "week") {
      document.querySelectorAll("#psViewSeg button").forEach(function(b){ b.classList.remove("active"); });
      var wbtn = document.querySelector('#psViewSeg button[data-view="week"]');
      if (wbtn) wbtn.classList.add("active");
      currentView = "week";
      state.prefs.view = "week";
      save();
      document.getElementById("psWeekView").style.display = "";
      document.getElementById("psMonthView").style.display = "none";
      document.getElementById("psListView").style.display = "none";
    }
    render();
    setTimeout(function(){
      var col = document.querySelector('.ps-daycol[data-date-key="'+dateKey+'"]');
      if (col) {
        col.scrollIntoView({behavior:"smooth", inline:"center", block:"nearest"});
        col.classList.add("snap");
        setTimeout(function(){ col.classList.remove("snap"); }, 600);
      }
    }, 60);
  }

  function renderAttentionPanel(){
    var section = document.getElementById("psAttentionSection");
    var panel = document.getElementById("psAttentionPanel");
    var countEl = document.getElementById("psAttentionCount");
    var items = computeAttentionItems();
    if (!items.length) { section.style.display = "none"; panel.innerHTML = ""; return; }
    section.style.display = "";
    countEl.textContent = items.length + (items.length > 1 ? " éléments" : " élément");
    panel.innerHTML = "";
    items.slice(0, 8).forEach(function(it){
      var row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px;";
      var parts = it.dateKey.split("-");
      var dstr = parts[2]+"/"+parts[1];
      row.innerHTML =
        '<span class="ps-tag" style="margin-top:0;flex-shrink:0;'+(it.late ? "background:#FCEBEB;color:#A32D2D;" : "background:#FEF3DC;color:#93650B;")+'">'+(it.late ? "En retard" : "Bientôt")+'</span>' +
        '<span style="color:var(--text-3);flex-shrink:0;min-width:34px;">'+dstr+'</span>' +
        '<span style="flex:1;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escapeHtml(it.card.title)+'</span>' +
        (it.card.brand ? '<span class="ps-tag tierdefault" style="margin-top:0;flex-shrink:0;">'+escapeHtml(it.card.brand)+'</span>' : "") +
        '<span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:'+(STATUS_COLORS[it.card.status]||"#999")+';"></span>' +
        '<button class="ps-btn" style="font-size:11px;padding:4px 9px;flex-shrink:0;">Voir</button>';
      row.querySelector("button").addEventListener("click", function(){ jumpToDate(it.dateKey); });
      panel.appendChild(row);
    });
  }

  function render(){
    ensureWeekData(currentMonday);
    document.getElementById("psWeekLabel").textContent = fmtRange(currentMonday);
    document.getElementById("psPrintHeader").textContent = "Planet Sport — Semaine du " + fmtRange(currentMonday);
    var grid = document.getElementById("psGrid");
    grid.innerHTML = "";
    var wk = toKey(currentMonday);
    var daysData = state.weeks[wk];

    for (var i=0;i<7;i++){
      var d = addDays(currentMonday, i);
      var key = toKey(d);
      var isHoliday = !!HOLIDAYS[key];
      var isToday = key === todayKey;
      var col = document.createElement("div");
      col.className = "ps-daycol" + (isHoliday ? " holiday" : "");
      col.dataset.dateKey = key;

      var head = document.createElement("div");
      head.className = "ps-dayhead";
      var activeCamp = activeCampaignFor(key);
      head.innerHTML =
        '<div class="ps-daybadge ps-h'+(isToday?" today":"")+'">'+pad(d.getDate())+'</div>' +
        '<div class="ps-dayname">'+DAY_NAMES[i]+'</div>' +
        (isHoliday ? '<div class="ps-holidaynote">'+HOLIDAYS[key]+'</div>' : "") +
        (activeCamp ? '<div class="ps-daybanner" style="background:'+CAT_COLORS["Campaigns Content"]+';color:#fff;">'+escapeHtml(activeCamp.name)+'</div>' : "");
      col.appendChild(head);

      if (!daysData[key]) daysData[key] = [];
      var allCards = daysData[key];
      var feedCards = allCards.filter(function(c){ return c.kind === "Feed"; });
      var storyCards = allCards.filter(function(c){ return c.kind !== "Feed"; });

      var feedLabel = document.createElement("div");
      feedLabel.className = "ps-zone-label";
      feedLabel.textContent = "Feed";
      col.appendChild(feedLabel);

      var feedZone = document.createElement("div");
      feedZone.className = "ps-feedzone";
      feedCards.forEach(function(card, idx){ feedZone.appendChild(renderCard(card, key, allCards, i*4+idx)); });
      setupZoneDnD(feedZone, key, allCards, true);
      col.appendChild(feedZone);

      var addFeedBtn = document.createElement("div");
      addFeedBtn.className = "ps-addbtn";
      addFeedBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true" style="font-size:11px;"></i> Post';
      addFeedBtn.addEventListener("click", function(){ openCreateModal(key, true); });
      col.appendChild(addFeedBtn);

      var divider = document.createElement("hr");
      divider.className = "ps-zone-divider";
      col.appendChild(divider);

      var storyLabel = document.createElement("div");
      storyLabel.className = "ps-zone-label";
      storyLabel.textContent = "Stories";
      col.appendChild(storyLabel);

      var storyZone = document.createElement("div");
      storyZone.className = "ps-storyzone";
      storyCards.forEach(function(card, idx){ storyZone.appendChild(renderCard(card, key, allCards, i*4+idx)); });
      setupZoneDnD(storyZone, key, allCards, false);
      col.appendChild(storyZone);

      var addStoryBtn = document.createElement("div");
      addStoryBtn.className = "ps-addbtn";
      addStoryBtn.innerHTML = '<i class="ti ti-plus" aria-hidden="true" style="font-size:11px;"></i> Story';
      addStoryBtn.addEventListener("click", function(){ openCreateModal(key, false); });
      col.appendChild(addStoryBtn);

      grid.appendChild(col);
    }
    renderStats();
    renderAttentionPanel();
  }

  function setupZoneDnD(zoneEl, dateKey, allCardsRef, isFeedZone){
    zoneEl.addEventListener("dragover", function(e){ e.preventDefault(); zoneEl.classList.add("dragover"); });
    zoneEl.addEventListener("dragleave", function(){ zoneEl.classList.remove("dragover"); });
    zoneEl.addEventListener("drop", function(e){
      e.preventDefault();
      zoneEl.classList.remove("dragover");
      var data = e.dataTransfer.getData("text/plain");
      if (!data) return;
      var parts = data.split("::");
      var fromKey = parts[0], cardId = parts[1];
      var wk = toKey(currentMonday);
      var daysData = state.weeks[wk];
      var fromCards = daysData[fromKey];
      if (!fromCards) return;
      var idx = -1;
      for (var j=0;j<fromCards.length;j++){ if (fromCards[j].id === cardId){ idx = j; break; } }
      if (idx === -1) return;
      var moved = fromCards[idx];
      var movedIsFeed = moved.kind === "Feed";
      if (movedIsFeed !== isFeedZone) return;
      fromCards.splice(idx, 1);
      if (!daysData[dateKey]) daysData[dateKey] = [];
      daysData[dateKey].push(moved);
      save();
      render();
      snapCard(moved.id);
    });
  }

  function openEditModal(card, dateKey, zoneCards){
    var root = document.getElementById("psModalRoot");
    var backdrop = document.createElement("div");
    backdrop.className = "ps-drawer-backdrop";
    var wrap = document.createElement("div");
    wrap.className = "ps-drawer";
    wrap.innerHTML =
      '<div class="ps-drawer-head"><i class="ti '+(CAT_ICON[card.category]||"ti-point")+'" style="color:'+(CAT_COLORS[card.category]||"var(--text-2)")+';" aria-hidden="true"></i>'+card.kind+
        '<button class="ps-drawer-close" id="mClose" aria-label="Fermer"><i class="ti ti-x" aria-hidden="true"></i></button>' +
      '</div>' +
      '<div class="ps-drawer-body">' +
        '<div class="ps-field"><label>Titre / Axe</label><input type="text" id="mTitle" value="'+escapeHtml(card.title)+'"></div>' +
        '<div class="ps-field"><label>Format</label><input type="text" id="mFormat" value="'+escapeHtml(card.format||"")+'"></div>' +
        '<div class="ps-field"><label>CTA</label><input type="text" id="mCta" value="'+escapeHtml(card.cta||"")+'"></div>' +
        '<div class="ps-field"><label>Marque (tag, optionnel)</label><input type="text" id="mBrand" value="'+escapeHtml(card.brand||"")+'"></div>' +
        '<div class="ps-field"><label>Statut</label><select id="mStatus">'+
          ["Idée","En préparation","Prêt","Publié"].map(function(s){ return '<option value="'+s+'"'+(s===card.status?" selected":"")+'>'+s+'</option>'; }).join("") +
        '</select></div>' +
        '<div class="ps-field"><label>Responsable</label><select id="mResp">'+
          ["À assigner","Ilias","Agence","Équipe Boutique"].map(function(s){ return '<option value="'+s+'"'+(s===card.responsable?" selected":"")+'>'+s+'</option>'; }).join("") +
        '</select></div>' +
        '<div class="ps-field"><label>Note</label><textarea id="mNote" rows="2">'+escapeHtml(card.note||"")+'</textarea></div>' +
        '<div class="ps-field"><label>Image (URL, optionnel — pour l\'aperçu feed)</label><input type="text" id="mImage" value="'+escapeHtml(card.image||"")+'" placeholder="https://..."></div>' +
        (card.image ? '<img src="'+escapeHtml(card.image)+'" alt="" style="width:100%;border-radius:10px;margin:-4px 0 11px;max-height:160px;object-fit:cover;" onerror="this.style.display=\'none\'">' : "") +
        '<div class="ps-field"><label>Lien (visuel / Drive / Figma)</label><input type="text" id="mLink" value="'+escapeHtml(card.link||"")+'" placeholder="https://..."></div>' +
        '<div class="ps-field"><label>Checklist</label>'+
          ["Shooting","Montage","Caption"].map(function(lbl,i){
            var checked = (card.checklist && card.checklist[i]) ? " checked" : "";
            return '<label style="display:flex;align-items:center;gap:6px;font-weight:400;font-size:12.5px;margin-bottom:4px;"><input type="checkbox" id="mCheck'+i+'" style="width:auto;"'+checked+'> '+lbl+'</label>';
          }).join("") +
        '</div>' +
      '</div>' +
      '<div class="ps-drawer-actions">' +
        (zoneCards ? '<button class="ps-btn" id="mDelete" style="color:#A32D2D;margin-right:auto;">Supprimer</button>' : "") +
        '<button class="ps-btn" id="mCancel">Annuler</button>' +
        '<button class="ps-btn primary" id="mSave">Enregistrer</button>' +
      '</div>';
    root.appendChild(backdrop);
    root.appendChild(wrap);

    function closeDrawer(){ if (root.contains(wrap)) root.removeChild(wrap); if (root.contains(backdrop)) root.removeChild(backdrop); }
    wrap.querySelector("#mCancel").addEventListener("click", closeDrawer);
    wrap.querySelector("#mClose").addEventListener("click", closeDrawer);
    backdrop.addEventListener("click", closeDrawer);
    if (zoneCards) {
      wrap.querySelector("#mDelete").addEventListener("click", function(){
        if (!window.confirm("Supprimer ce contenu ?")) return;
        var idx = zoneCards.indexOf(card);
        if (idx > -1) {
          var removed = zoneCards.splice(idx, 1)[0];
          save();
          closeDrawer();
          render();
          showUndoToast("Contenu supprimé", function(){
            zoneCards.splice(idx, 0, removed);
            save();
            render();
          });
        }
      });
    }
    wrap.querySelector("#mSave").addEventListener("click", function(){
      card.title = wrap.querySelector("#mTitle").value;
      card.format = wrap.querySelector("#mFormat").value;
      card.cta = wrap.querySelector("#mCta").value;
      card.brand = wrap.querySelector("#mBrand").value || null;
      card.status = wrap.querySelector("#mStatus").value;
      card.responsable = wrap.querySelector("#mResp").value;
      card.note = wrap.querySelector("#mNote").value;
      card.image = wrap.querySelector("#mImage").value;
      card.link = wrap.querySelector("#mLink").value;
      card.checklist = [0,1,2].map(function(i){ return wrap.querySelector("#mCheck"+i).checked; });
      save();
      closeDrawer();
      render();
    });
  }

  var TYPE_OPTIONS = [
    {value:"Feed|Campaigns Content", label:"Feed — Campaigns Content"},
    {value:"Feed|Brands Collections Content", label:"Feed — Brands Collections"},
    {value:"Feed|Planet Sport Content", label:"Feed — Planet Sport"},
    {value:"Feed|Educational Content", label:"Feed — Educational"},
    {value:"Story 1|Story 1", label:"Story 1 (variable)"},
    {value:"Story 2|Story 2", label:"Story 2 (Focus Produit)"},
    {value:"Story 3|Story 3", label:"Story 3 (Repost)"}
  ];

  function openCreateModal(dateKey, isFeed){
    var root = document.getElementById("psModalRoot");
    var wrap = document.createElement("div");
    wrap.className = "ps-modal-backdrop";
    var options = TYPE_OPTIONS.filter(function(o){ return isFeed ? o.value.indexOf("Feed|") === 0 : o.value.indexOf("Feed|") !== 0; });
    wrap.innerHTML =
      '<div class="ps-modal">' +
        '<div class="ps-modal-head"><i class="ti ti-plus" aria-hidden="true"></i>Nouveau '+(isFeed?"post":"story")+'</div>' +
        '<div class="ps-field"><label>Type</label><select id="cType">'+
          options.map(function(o){ return '<option value="'+o.value+'">'+o.label+'</option>'; }).join("") +
        '</select></div>' +
        '<div class="ps-field"><label>Titre / Axe</label><input type="text" id="cTitle" placeholder="Ex: Nouveau modèle running"></div>' +
        '<div class="ps-field"><label>Format</label><input type="text" id="cFormat" placeholder="Ex: Carousel"></div>' +
        '<div class="ps-field"><label>CTA</label><input type="text" id="cCta" placeholder="Ex: Swipe up / Shop Now"></div>' +
        '<div class="ps-field"><label>Marque (tag, optionnel)</label><input type="text" id="cBrand" placeholder="Ex: Adidas"></div>' +
        '<div class="ps-field"><label>Image (URL, optionnel)</label><input type="text" id="cImage" placeholder="https://..."></div>' +
        '<div class="ps-field"><label>Lien (optionnel)</label><input type="text" id="cLink" placeholder="https://..."></div>' +
        '<div class="ps-modal-actions">' +
          '<button class="ps-btn" id="cCancel">Annuler</button>' +
          '<button class="ps-btn primary" id="cSave">Ajouter</button>' +
        '</div>' +
      '</div>';
    root.appendChild(wrap);

    wrap.querySelector("#cCancel").addEventListener("click", function(){ root.removeChild(wrap); });
    wrap.addEventListener("click", function(e){ if (e.target === wrap) root.removeChild(wrap); });
    wrap.querySelector("#cSave").addEventListener("click", function(){
      var typeVal = wrap.querySelector("#cType").value.split("|");
      var kind = typeVal[0], category = typeVal[1];
      var newCard = {
        id: dateKey + "-new-" + Date.now(),
        kind: kind,
        category: category,
        title: wrap.querySelector("#cTitle").value || "Nouveau contenu",
        format: wrap.querySelector("#cFormat").value || "",
        cta: wrap.querySelector("#cCta").value || "",
        brand: wrap.querySelector("#cBrand").value || null,
        status: "Idée",
        responsable: "À assigner",
        note: "",
        checklist: [false,false,false],
        image: wrap.querySelector("#cImage").value || "",
        link: wrap.querySelector("#cLink").value || ""
      };
      var wk = toKey(currentMonday);
      var daysData = state.weeks[wk];
      if (!daysData[dateKey]) daysData[dateKey] = [];
      daysData[dateKey].push(newCard);
      save();
      root.removeChild(wrap);
      render();
    });
  }

  document.getElementById("psPrev").addEventListener("click", function(){
    currentMonday = addDays(currentMonday, -7);
    render();
    document.getElementById("psGrid").classList.add("slide-r");
    setTimeout(function(){ document.getElementById("psGrid").classList.remove("slide-r"); }, 250);
  });
  document.getElementById("psNext").addEventListener("click", function(){
    currentMonday = addDays(currentMonday, 7);
    render();
    document.getElementById("psGrid").classList.add("slide-l");
    setTimeout(function(){ document.getElementById("psGrid").classList.remove("slide-l"); }, 250);
  });
  document.getElementById("psToday").addEventListener("click", function(){
    currentMonday = mondayOf(initialAnchor);
    render();
    if (currentView === "month") renderMonthView();
    if (currentView === "list") renderListView();
  });

  var tabColors = { "Tier 1": "var(--cat-brands)", "Tier 2": "var(--cat-planet)", "Tier 3": "var(--text-3)" };
  function allBrandDefs(){
    var defs = [];
    [["Tier 1", TIER1], ["Tier 2", TIER2], ["Tier 3", TIER3]].forEach(function(group){
      group[1].forEach(function(item){
        defs.push({ tier: group[0], name: item[0], pct: item[1] });
      });
    });
    return defs;
  }

  function renderStatsTab(){
    var panel = document.getElementById("psStatsPanel");
    var holidayRows = Object.keys(HOLIDAYS).sort().map(function(k){
      var d = daysUntil(k);
      var when = d < 0 ? "Passé" : (d === 0 ? "Aujourd'hui" : ("dans "+d+"j"));
      return '<div class="ps-tierrow"><span style="min-width:150px;font-weight:500;">'+k.split("-").reverse().join("/")+'</span><span style="flex:1;">'+HOLIDAYS[k]+'</span><span class="ps-tierpct">'+when+'</span></div>';
    }).join("");
    panel.innerHTML =
      '<div style="font-weight:600;margin-bottom:8px;">Rythme hebdomadaire</div>' +
      '<div class="ps-tierrow"><span style="min-width:220px;">Feed</span><span style="flex:1;color:var(--text-2);">6 posts / semaine (2 Tier 1, 1 Tier 2, 2 Campaigns, 1 Planet Sport / Educational)</span></div>' +
      '<div class="ps-tierrow"><span style="min-width:220px;">Stories</span><span style="flex:1;color:var(--text-2);">21 créneaux / semaine — 3/jour (variable + Focus Produit + Repost)</span></div>' +
      '<div style="font-weight:600;margin:16px 0 8px;">Échéances (fériés / événements)</div>' +
      holidayRows;
  }

  // ---------- Duplicate week ----------
  document.getElementById("psDupWeekBtn").addEventListener("click", function(){
    if (!window.confirm("Dupliquer cette semaine vers la semaine suivante ?")) return;
    ensureWeekData(currentMonday);
    var nextMonday = addDays(currentMonday, 7);
    ensureWeekData(nextMonday);
    var srcWk = toKey(currentMonday), dstWk = toKey(nextMonday);
    var srcDays = state.weeks[srcWk], dstDays = state.weeks[dstWk];
    for (var i=0;i<7;i++){
      var srcKey = toKey(addDays(currentMonday, i));
      var dstKey = toKey(addDays(nextMonday, i));
      dstDays[dstKey] = (srcDays[srcKey] || []).map(function(c){
        var copy = JSON.parse(JSON.stringify(c));
        copy.id = dstKey + "-dup-" + Math.random().toString(36).slice(2,8);
        copy.status = "Idée";
        return copy;
      });
    }
    save();
    showUndoToast("Semaine dupliquée vers la suivante", function(){});
  });

  // ---------- CSV import ----------
  function showCsvReport(added, errors){
    var root = document.getElementById("psModalRoot");
    var wrap = document.createElement("div");
    wrap.className = "ps-modal-backdrop";
    var errHtml = errors.length
      ? '<div style="max-height:240px;overflow-y:auto;background:#FCEBEB;border-radius:8px;padding:10px 12px;font-size:11.5px;color:#A32D2D;line-height:1.7;">' + errors.map(escapeHtml).join("<br>") + '</div>'
      : '<div style="color:var(--success);font-size:12.5px;">Aucune erreur.</div>';
    wrap.innerHTML =
      '<div class="ps-modal">' +
        '<div class="ps-modal-head"><i class="ti ti-file-import" aria-hidden="true"></i>Rapport d\'import CSV</div>' +
        '<div style="font-size:13px;margin-bottom:10px;">'+added+' ligne(s) importée(s)'+(errors.length ? ", "+errors.length+" ligne(s) ignorée(s) :" : ".")+'</div>' +
        errHtml +
        '<div class="ps-modal-actions"><button class="ps-btn primary" id="csvRepClose">Fermer</button></div>' +
      '</div>';
    root.appendChild(wrap);
    wrap.querySelector("#csvRepClose").addEventListener("click", function(){ root.removeChild(wrap); });
    wrap.addEventListener("click", function(e){ if (e.target===wrap) root.removeChild(wrap); });
  }

  document.getElementById("psCsvInput").addEventListener("change", function(e){
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(evt){
      var text = evt.target.result;
      var lines = text.split(/\r?\n/).filter(function(l){ return l.trim(); });
      var startIdx = /date/i.test(lines[0]) ? 1 : 0;
      var added = 0;
      var errors = [];
      var validKinds = ["Feed","Story 1","Story 2","Story 3"];
      var validStatuses = ["Idée","En préparation","Prêt","Publié"];
      for (var i=startIdx;i<lines.length;i++){
        var lineNum = i+1;
        var cols = lines[i].split(",").map(function(c){ return c.trim(); });
        if (cols.length < 3) { errors.push("Ligne "+lineNum+" : au moins 3 colonnes attendues (Date, Type, Titre), "+cols.length+" trouvée(s)."); continue; }
        var dateParts = cols[0].split("/");
        if (dateParts.length !== 3) { errors.push("Ligne "+lineNum+" : date \""+cols[0]+"\" invalide (format attendu JJ/MM/AAAA)."); continue; }
        var dateKey = dateParts[2]+"-"+dateParts[1].padStart(2,"0")+"-"+dateParts[0].padStart(2,"0");
        var dateObj = new Date(dateKey + "T00:00:00");
        if (isNaN(dateObj.getTime())) { errors.push("Ligne "+lineNum+" : date \""+cols[0]+"\" invalide."); continue; }
        var kind = cols[1] || "Feed";
        if (validKinds.indexOf(kind) === -1) { errors.push("Ligne "+lineNum+" : type \""+kind+"\" non reconnu (attendu Feed / Story 1 / Story 2 / Story 3)."); continue; }
        if (!cols[2]) { errors.push("Ligne "+lineNum+" : titre manquant."); continue; }
        var status = cols[4] || "Idée";
        if (validStatuses.indexOf(status) === -1) { errors.push("Ligne "+lineNum+" : statut \""+status+"\" non reconnu, \"Idée\" utilisé à la place."); status = "Idée"; }
        var targetMonday = mondayOf(dateObj);
        ensureWeekData(targetMonday);
        var wk = toKey(targetMonday);
        if (!state.weeks[wk][dateKey]) state.weeks[wk][dateKey] = [];
        var category = kind === "Feed" ? "Planet Sport Content" : kind;
        state.weeks[wk][dateKey].push({
          id: "csv-"+Date.now()+"-"+i, kind: kind, category: category,
          title: cols[2], format: cols[3] || "", cta: "",
          status: status, responsable: cols[5] || "À assigner",
          note: "", checklist:[false,false,false], link:""
        });
        added++;
      }
      save();
      render();
      document.getElementById("psCsvInput").value = "";
      showCsvReport(added, errors);
    };
    reader.readAsText(file);
  });

  // ---------- Dark mode ----------
  var darkSwitch = document.getElementById("psDarkSwitch");
  function applyDarkMode(on){
    document.getElementById("psRoot").classList.toggle("dark", on);
    darkSwitch.classList.toggle("on", on);
  }
  darkSwitch.addEventListener("click", function(){
    state.prefs.dark = !state.prefs.dark;
    applyDarkMode(state.prefs.dark);
    save();
  });

  // ---------- Global search (Cmd/Ctrl+K) ----------
  function buildSearchIndex(){
    var idx = [];
    Object.keys(state.weeks).forEach(function(wk){
      var days = state.weeks[wk];
      Object.keys(days).forEach(function(dateKey){
        days[dateKey].forEach(function(c){
          idx.push({ type:"Calendrier", label:c.title, meta:c.kind+" · "+dateKey, action:function(){
            currentMonday = mondayOf(new Date(dateKey+"T00:00:00"));
            switchTab("calendar");
            document.querySelector('#psViewSeg button[data-view="week"]').click();
            render();
          }});
        });
      });
    });
    state.ideas.forEach(function(idea){
      idx.push({ type:"Idéation", label:idea.title, meta:"Idée", action:function(){ switchTab("ideas"); } });
    });
    state.influencers.forEach(function(inf){
      idx.push({ type:"Influence", label:inf.name, meta:inf.status+" · "+(inf.platform||""), action:function(){ switchTab("influence"); } });
    });
    ["todo","inprogress","ready"].forEach(function(col){
      state.production[col].forEach(function(c){
        idx.push({ type:"Production", label:c.title, meta:col, action:function(){ switchTab("production"); } });
      });
    });
    state.campaigns.forEach(function(camp){
      idx.push({ type:"Campagne", label:camp.name, meta:camp.period, action:function(){ switchTab("campaigns"); } });
      camp.items.forEach(function(item){
        idx.push({ type:"Campagne", label:item.title, meta:camp.name, action:function(){ switchTab("campaigns"); } });
      });
    });
    return idx;
  }

  function openSearchModal(){
    var root = document.getElementById("psSearchModalRoot");
    var wrap = document.createElement("div");
    wrap.className = "ps-searchmodal";
    wrap.innerHTML =
      '<div class="ps-searchbox">' +
        '<input type="text" class="ps-searchinput" id="psSearchInput" placeholder="Rechercher un contenu, une idée, une campagne...">' +
        '<div class="ps-searchresults" id="psSearchResults"></div>' +
      '</div>';
    root.appendChild(wrap);
    var input = wrap.querySelector("#psSearchInput");
    var resultsEl = wrap.querySelector("#psSearchResults");
    var index = buildSearchIndex();

    function renderResults(query){
      var q = query.toLowerCase();
      var matches = q ? index.filter(function(item){ return item.label.toLowerCase().indexOf(q) !== -1; }).slice(0,20) : index.slice(0,10);
      resultsEl.innerHTML = "";
      matches.forEach(function(m){
        var r = document.createElement("div");
        r.className = "ps-searchresult";
        r.innerHTML = '<div class="ps-searchresult-title">'+escapeHtml(m.label)+'</div><div class="ps-searchresult-meta">'+m.type+' · '+escapeHtml(m.meta)+'</div>';
        r.addEventListener("click", function(){ m.action(); root.removeChild(wrap); });
        resultsEl.appendChild(r);
      });
      if (!matches.length) resultsEl.innerHTML = '<div class="ps-searchresult" style="color:var(--text-3);">Aucun résultat</div>';
    }
    renderResults("");
    input.addEventListener("input", function(){ renderResults(input.value); });
    input.focus();
    wrap.addEventListener("click", function(e){ if (e.target === wrap) root.removeChild(wrap); });
  }
  document.getElementById("psSearchBtn").addEventListener("click", openSearchModal);

  function renderTabBody(tab){
    if (tab === "calendar") { render(); return; }
    if (tab === "influence") { renderInfluence(); return; }
    if (tab === "ideas") { renderIdeas(); return; }
    if (tab === "production") { renderKanban(); return; }
    if (tab === "campaigns") { renderCampaigns(); return; }
    if (tab === "brands") { renderLibrary(); return; }
    if (tab === "stats") { renderStatsSubTab(currentStatsSubTab); return; }
  }

  function switchTab(tab){
    document.querySelectorAll(".ps-navbtn[data-tab]").forEach(function(b){ b.classList.toggle("active", b.dataset.tab === tab); });
    ["calendar","influence","ideas","production","campaigns","brands","stats"].forEach(function(t){
      var idMap = {calendar:"psTabCalendar", influence:"psTabInfluence", ideas:"psTabIdeas", production:"psTabProduction", campaigns:"psTabCampaigns", brands:"psTabBrands", stats:"psTabStats"};
      document.getElementById(idMap[t]).style.display = (t === tab) ? "" : "none";
    });
    state.prefs.tab = tab;
    save();
    renderTabBody(tab);
  }

  // ---------- Rotation balance ----------
  function renderRotationPanel(){
    var el = document.getElementById("psRotationPanel");
    var allBrands = [["Tier 1", TIER1.map(function(t){return t[0];}), 3.5],
                     ["Tier 2", TIER2_NAMES, 28],
                     ["Tier 3", TIER3_NAMES, 63]];
    var rows = [];
    allBrands.forEach(function(group){
      var tierLabel = group[0], names = group[1], expectedDays = group[2];
      names.forEach(function(brand){
        var lastSeen = null;
        var sortedWeeks = Object.keys(state.weeks).sort();
        sortedWeeks.forEach(function(wk){
          Object.keys(state.weeks[wk]).sort().forEach(function(dateKey){
            state.weeks[wk][dateKey].forEach(function(c){
              if (c.brand === brand) lastSeen = dateKey;
            });
          });
        });
        var daysSince = lastSeen ? Math.round((REAL_TODAY - new Date(lastSeen+"T00:00:00"))/86400000) : null;
        rows.push({ tier:tierLabel, brand:brand, daysSince:daysSince, expected: expectedDays });
      });
    });
    el.innerHTML = rows.map(function(r){
      var warn = r.daysSince !== null && r.daysSince > r.expected * 1.5;
      var text = r.daysSince === null ? "Pas encore apparu" : (r.daysSince + " jour(s) depuis la dernière fois");
      return '<div class="ps-rotrow"><span style="min-width:60px;font-weight:600;">'+r.tier+'</span><span style="min-width:110px;">'+r.brand+'</span><span class="'+(warn?"ps-rotwarn":"")+'" style="flex:1;">'+text+(warn?" — à replanifier":"")+'</span></div>';
    }).join("");
  }

  // ---------- Feed grid preview ----------
  function renderGridPreview(){
    var el = document.getElementById("psGridPreview");
    var wk = toKey(currentMonday);
    ensureWeekData(currentMonday);
    var daysData = state.weeks[wk];
    var feedItems = [];
    for (var i=0;i<7;i++){
      var key = toKey(addDays(currentMonday, i));
      (daysData[key]||[]).forEach(function(c){ if (c.kind === "Feed") feedItems.push(c); });
    }
    el.innerHTML = feedItems.slice(0,9).map(function(c){
      if (c.image) {
        return '<div class="ps-gridpreview-cell" style="background-image:url(\''+escapeHtml(c.image)+'\');background-size:cover;background-position:center;text-shadow:0 1px 4px rgba(0,0,0,0.6);"><span>'+escapeHtml(c.title)+'</span></div>';
      }
      return '<div class="ps-gridpreview-cell" style="background:'+(CAT_COLORS[c.category]||"#ccc")+';">'+escapeHtml(c.title)+'</div>';
    }).join("");
  }

  // ---------- Stats analytics (cumulative across the whole generated calendar) ----------
  function forEachCard(fn){
    Object.keys(state.weeks).sort().forEach(function(wk){
      Object.keys(state.weeks[wk]).sort().forEach(function(dateKey){
        state.weeks[wk][dateKey].forEach(function(c){ fn(c, dateKey); });
      });
    });
  }

  function computeBrandBreakdown(){
    var counts = {};
    forEachCard(function(c){
      if (!c.brand) return;
      if (!counts[c.brand]) counts[c.brand] = { feed:0, story:0 };
      if (c.kind === "Feed") counts[c.brand].feed++; else counts[c.brand].story++;
    });
    var brandColor = {};
    allBrandDefs().forEach(function(b){ brandColor[b.name] = tabColors[b.tier]; });
    return Object.keys(counts).map(function(name){
      var c = counts[name];
      return { label: name, count: c.feed + c.story, feed: c.feed, story: c.story, color: brandColor[name] || "var(--text-3)" };
    }).sort(function(a,b){ return b.count - a.count; });
  }

  function computeStatusBreakdown(){
    var order = ["Idée","En préparation","Prêt","Publié"];
    var counts = {};
    order.forEach(function(s){ counts[s] = 0; });
    forEachCard(function(c){ if (counts[c.status] !== undefined) counts[c.status]++; });
    return order.map(function(s){ return { label: s, count: counts[s], color: STATUS_COLORS[s] }; });
  }

  function computeCategoryBreakdown(){
    var order = ["Campaigns Content","Brands Collections Content","Planet Sport Content","Educational Content"];
    var labels = { "Campaigns Content":"Campaigns", "Brands Collections Content":"Brands", "Planet Sport Content":"Planet Sport", "Educational Content":"Educational" };
    var counts = {};
    order.forEach(function(c){ counts[c] = 0; });
    forEachCard(function(c){ if (counts[c.category] !== undefined) counts[c.category]++; });
    return order.map(function(c){ return { label: labels[c], count: counts[c], color: CAT_COLORS[c] }; });
  }

  function computeResponsableBreakdown(){
    var order = ["Ilias","Agence","Équipe Boutique","À assigner"];
    var counts = {};
    order.forEach(function(r){ counts[r] = 0; });
    forEachCard(function(c){
      var r = c.responsable || "À assigner";
      if (counts[r] === undefined) counts[r] = 0;
      counts[r]++;
    });
    return order.map(function(r){ return { label: r, count: counts[r], color: AVATAR_COLORS[r] || "#9AA2AF" }; });
  }

  function renderBarChart(container, rows, opts){
    opts = opts || {};
    if (!rows.length || !rows.some(function(r){ return r.count > 0; })) {
      container.innerHTML = '<div style="color:var(--text-2);font-size:12.5px;">Pas encore de données.</div>';
      return;
    }
    var max = Math.max.apply(null, rows.map(function(r){ return r.count; })) || 1;
    container.innerHTML = '<div class="ps-barchart">' + rows.map(function(r){
      var pct = Math.round((r.count / max) * 100);
      var countText = (opts.showSplit && r.feed !== undefined) ? (r.feed+" Feed · "+r.story+" Stories") : (r.count+"");
      return '<div class="ps-barchart-row">' +
        '<div class="ps-barchart-label">'+escapeHtml(r.label)+'</div>' +
        '<div class="ps-barchart-track"><div class="ps-barchart-bar" style="width:'+pct+'%;background:'+r.color+';"></div></div>' +
        '<div class="ps-barchart-count">'+countText+'</div>' +
      '</div>';
    }).join("") + '</div>';
  }

  function renderDonutChart(container, segments){
    var total = segments.reduce(function(sum, seg){ return sum + seg.count; }, 0);
    if (!total) {
      container.innerHTML = '<div style="color:var(--text-2);font-size:12.5px;">Pas encore de données.</div>';
      return;
    }
    var radius = 46, circumference = 2 * Math.PI * radius, offset = 0;
    var circles = segments.filter(function(s){ return s.count > 0; }).map(function(seg){
      var frac = seg.count / total;
      var dash = frac * circumference;
      var circle = '<circle r="'+radius+'" cx="60" cy="60" fill="transparent" stroke-width="16" style="stroke:'+seg.color+';" ' +
        'stroke-dasharray="'+dash.toFixed(2)+' '+(circumference-dash).toFixed(2)+'" ' +
        'stroke-dashoffset="'+(-offset).toFixed(2)+'" transform="rotate(-90 60 60)"></circle>';
      offset += dash;
      return circle;
    }).join("");
    var legend = segments.map(function(seg){
      var pct = Math.round((seg.count/total)*100);
      return '<div class="ps-donut-legend-item"><span class="ps-donut-legend-dot" style="background:'+seg.color+';"></span>'+escapeHtml(seg.label)+'<span class="ps-donut-legend-count">'+seg.count+' ('+pct+'%)</span></div>';
    }).join("");
    container.innerHTML = '<div class="ps-donutwrap">' +
      '<div class="ps-donut-svgwrap"><svg width="120" height="120" viewBox="0 0 120 120">'+circles+'</svg>' +
        '<div class="ps-donut-total"><div class="ps-donut-total-num">'+total+'</div><div class="ps-donut-total-label">Total</div></div>' +
      '</div>' +
      '<div class="ps-donut-legend">'+legend+'</div>' +
    '</div>';
  }

  var currentStatsSubTab = "apercu";
  function renderStatsSubTab(tab){
    currentStatsSubTab = tab;
    document.getElementById("psStatsSubApercu").style.display = tab === "apercu" ? "" : "none";
    document.getElementById("psStatsSubMarques").style.display = tab === "marques" ? "" : "none";
    document.getElementById("psStatsSubContenu").style.display = tab === "contenu" ? "" : "none";
    if (tab === "apercu") { renderStatsTab(); renderRotationPanel(); renderGridPreview(); }
    if (tab === "marques") { renderBarChart(document.getElementById("psBrandChartPanel"), computeBrandBreakdown(), { showSplit: true }); }
    if (tab === "contenu") {
      renderDonutChart(document.getElementById("psStatusChartPanel"), computeStatusBreakdown());
      renderBarChart(document.getElementById("psCategoryChartPanel"), computeCategoryBreakdown());
      renderBarChart(document.getElementById("psWorkloadChartPanel"), computeResponsableBreakdown());
    }
  }
  document.getElementById("psStatsSeg").addEventListener("click", function(e){
    var btn = e.target.closest("button");
    if (!btn) return;
    document.querySelectorAll("#psStatsSeg button").forEach(function(b){ b.classList.remove("active"); });
    btn.classList.add("active");
    renderStatsSubTab(btn.dataset.statsTab);
  });

  function bootApp(){
    load(function(){
      ensureStateShape();
      applyDarkMode(state.prefs.dark);
      for (var w=0; w<N_WEEKS; w++){ ensureWeekData(addDays(RANGE_START, w*7)); }
      render();
      switchTab(state.prefs.tab || "calendar");
      var effectiveView = state.prefs.view || "week";
      if (effectiveView === "week" && window.innerWidth < 640) effectiveView = "list";
      if (effectiveView !== "week") {
        var vbtn = document.querySelector('#psViewSeg button[data-view="'+effectiveView+'"]');
        if (vbtn) vbtn.click();
      }
    });
  }

  document.addEventListener("keydown", function(e){
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openSearchModal();
    }
  });

  // ---------- View toggle (week/month/list) ----------
  document.getElementById("psViewSeg").addEventListener("click", function(e){
    var btn = e.target.closest("button");
    if (!btn) return;
    document.querySelectorAll("#psViewSeg button").forEach(function(b){ b.classList.remove("active"); });
    btn.classList.add("active");
    currentView = btn.dataset.view;
    state.prefs.view = currentView;
    save();
    document.getElementById("psWeekView").style.display = currentView === "week" ? "" : "none";
    document.getElementById("psMonthView").style.display = currentView === "month" ? "" : "none";
    document.getElementById("psListView").style.display = currentView === "list" ? "" : "none";
    if (currentView === "month") renderMonthView();
    if (currentView === "list") renderListView();
  });

  function renderMonthView(){
    var el = document.getElementById("psMonthView");
    el.innerHTML = "";
    var head = document.createElement("div");
    head.className = "ps-monthgrid";
    DAY_NAMES.forEach(function(n){
      var h = document.createElement("div");
      h.className = "ps-monthhead";
      h.textContent = n.slice(0,3);
      head.appendChild(h);
    });
    el.appendChild(head);
    var grid = document.createElement("div");
    grid.className = "ps-monthgrid";
    grid.style.marginTop = "6px";
    for (var w=0; w<4; w++){
      var weekMon = addDays(currentMonday, w*7);
      ensureWeekData(weekMon);
      var wk = toKey(weekMon);
      var daysData = state.weeks[wk];
      for (var i=0;i<7;i++){
        var d = addDays(weekMon, i);
        var key = toKey(d);
        var cards = daysData[key] || [];
        var cell = document.createElement("div");
        cell.className = "ps-monthcell";
        var feedCardsC = cards.filter(function(c){ return c.kind === "Feed"; });
        var storyCardsC = cards.filter(function(c){ return c.kind !== "Feed"; });
        var maxEach = 3;
        function lineFor(c){
          return '<div class="ps-mc-line"><span class="ps-mc-line-dot" style="background:'+(CAT_COLORS[c.category]||"#ccc")+';"></span>'+escapeHtml(c.title)+'</div>';
        }
        var feedLines = feedCardsC.slice(0, maxEach).map(lineFor).join("");
        var storyLines = storyCardsC.slice(0, maxEach).map(lineFor).join("");
        var divider = (feedCardsC.length && storyCardsC.length) ? '<hr class="ps-zone-divider" style="margin:3px 0;">' : "";
        var moreCount = Math.max(0, feedCardsC.length - maxEach) + Math.max(0, storyCardsC.length - maxEach);
        var moreHtml = moreCount > 0 ? '<div class="ps-mc-more">+'+moreCount+' autre(s)</div>' : "";
        cell.innerHTML = '<div class="ps-mc-date ps-h">'+pad(d.getDate())+'</div><div class="ps-mc-lines">'+feedLines+divider+storyLines+moreHtml+'</div>';
        (function(targetMonday){
          cell.addEventListener("click", function(){
            currentMonday = targetMonday;
            document.querySelector('#psViewSeg button[data-view="week"]').click();
            render();
          });
        })(weekMon);
        grid.appendChild(cell);
      }
    }
    el.appendChild(grid);
  }

  var selectedListIds = {};

  function renderListView(){
    var el = document.getElementById("psListView");
    var wk = toKey(currentMonday);
    ensureWeekData(currentMonday);
    var daysData = state.weeks[wk];
    var rows = [];
    for (var i=0;i<7;i++){
      var d = addDays(currentMonday, i);
      var key = toKey(d);
      (daysData[key] || []).forEach(function(c){
        rows.push({date: pad(d.getDate())+"/"+pad(d.getMonth()+1), day: DAY_NAMES[i], dateKey: key, card: c});
      });
    }
    rows = rows.filter(function(r){ return cardMatchesFilters(r.card); });

    var visibleIds = {};
    rows.forEach(function(r){ visibleIds[r.card.id] = true; });
    Object.keys(selectedListIds).forEach(function(id){ if (!visibleIds[id]) delete selectedListIds[id]; });
    var selCount = Object.keys(selectedListIds).length;

    var STATUS_LIST = ["Idée","En préparation","Prêt","Publié"];
    var RESP_LIST = ["À assigner","Ilias","Agence","Équipe Boutique"];
    var bulkBarHtml =
      '<div class="ps-toolbar" id="psListBulkBar" style="justify-content:space-between;margin-bottom:10px;'+(selCount ? "" : "display:none;")+'">' +
        '<span id="psListBulkCount" style="font-size:12px;font-weight:600;">'+selCount+' sélectionné(s)</span>' +
        '<div class="ps-toolbar" style="gap:6px;">' +
          '<select id="lbStatus" style="font-size:12px;"><option value="">Statut...</option>'+STATUS_LIST.map(function(s){ return '<option value="'+s+'">'+s+'</option>'; }).join("")+'</select>' +
          '<select id="lbResp" style="font-size:12px;"><option value="">Responsable...</option>'+RESP_LIST.map(function(s){ return '<option value="'+s+'">'+s+'</option>'; }).join("")+'</select>' +
          '<button class="ps-btn" id="lbDelete" style="font-size:12px;">Supprimer</button>' +
        '</div>' +
      '</div>';

    var html = bulkBarHtml + '<div class="ps-listtable-wrap"><table class="ps-listtable"><thead><tr><th style="width:24px;"><input type="checkbox" id="lbSelectAll"></th><th>Date</th><th>Jour</th><th>Type</th><th>Titre</th><th>Statut</th><th>Responsable</th></tr></thead><tbody>';
    rows.forEach(function(r){
      var checked = selectedListIds[r.card.id] ? " checked" : "";
      html += '<tr data-card-id="'+r.card.id+'" data-date-key="'+r.dateKey+'"><td><input type="checkbox" class="ps-rowcheck"'+checked+'></td><td>'+r.date+'</td><td>'+r.day+'</td><td>'+r.card.kind+'</td><td>'+escapeHtml(r.card.title)+'</td>' +
        '<td><span class="ps-dot" style="background:'+(STATUS_COLORS[r.card.status]||"#999")+';display:inline-block;margin-right:5px;"></span>'+r.card.status+'</td>' +
        '<td>'+r.card.responsable+'</td></tr>';
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;

    function findCard(cardId, dateKey){
      var dd = state.weeks[toKey(currentMonday)];
      var arr = dd && dd[dateKey];
      if (!arr) return null;
      for (var j=0;j<arr.length;j++){ if (arr[j].id === cardId) return {arr:arr, idx:j, card:arr[j]}; }
      return null;
    }

    function refreshBulkBar(){
      var bar = document.getElementById("psListBulkBar");
      var count = Object.keys(selectedListIds).length;
      bar.style.display = count ? "" : "none";
      document.getElementById("psListBulkCount").textContent = count + " sélectionné(s)";
    }

    el.querySelectorAll(".ps-rowcheck").forEach(function(cb){
      cb.addEventListener("change", function(){
        var id = cb.closest("tr").dataset.cardId;
        if (cb.checked) selectedListIds[id] = true; else delete selectedListIds[id];
        refreshBulkBar();
      });
    });
    var selectAll = document.getElementById("lbSelectAll");
    selectAll.addEventListener("change", function(){
      el.querySelectorAll(".ps-rowcheck").forEach(function(cb){
        cb.checked = selectAll.checked;
        var id = cb.closest("tr").dataset.cardId;
        if (selectAll.checked) selectedListIds[id] = true; else delete selectedListIds[id];
      });
      refreshBulkBar();
    });

    document.getElementById("lbStatus").addEventListener("change", function(){
      var val = this.value;
      if (!val) return;
      el.querySelectorAll("tr[data-card-id]").forEach(function(tr){
        if (!selectedListIds[tr.dataset.cardId]) return;
        var found = findCard(tr.dataset.cardId, tr.dataset.dateKey);
        if (found) found.card.status = val;
      });
      save();
      render();
      renderListView();
    });
    document.getElementById("lbResp").addEventListener("change", function(){
      var val = this.value;
      if (!val) return;
      el.querySelectorAll("tr[data-card-id]").forEach(function(tr){
        if (!selectedListIds[tr.dataset.cardId]) return;
        var found = findCard(tr.dataset.cardId, tr.dataset.dateKey);
        if (found) found.card.responsable = val;
      });
      save();
      render();
      renderListView();
    });
    document.getElementById("lbDelete").addEventListener("click", function(){
      var count = Object.keys(selectedListIds).length;
      if (!count) return;
      if (!window.confirm("Supprimer "+count+" élément(s) ?")) return;
      var removed = [];
      el.querySelectorAll("tr[data-card-id]").forEach(function(tr){
        var id = tr.dataset.cardId, dateKey = tr.dataset.dateKey;
        if (!selectedListIds[id]) return;
        var found = findCard(id, dateKey);
        if (found) { found.arr.splice(found.idx, 1); removed.push({dateKey:dateKey, card:found.card}); }
      });
      selectedListIds = {};
      save();
      render();
      renderListView();
      showUndoToast(removed.length+" élément(s) supprimé(s)", function(){
        var dd = state.weeks[toKey(currentMonday)];
        removed.forEach(function(r){
          if (!dd[r.dateKey]) dd[r.dateKey] = [];
          dd[r.dateKey].push(r.card);
        });
        save();
        render();
        renderListView();
      });
    });
  }

  // ---------- Filters ----------
  document.getElementById("psFilterBtn").addEventListener("click", function(){
    var panel = document.getElementById("psFilterPanel");
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });

  document.getElementById("psKeyBtn").addEventListener("click", function(){
    var panel = document.getElementById("psKeyPanel");
    if (panel.style.display === "none") {
      var items = [
        ["Campaigns Content","var(--cat-campaign)"],
        ["Brands Collections","var(--cat-brands)"],
        ["Planet Sport","var(--cat-planet)"],
        ["Educational","var(--cat-edu)"],
        ["Story 1","var(--story1)"],
        ["Story 2","var(--story2)"],
        ["Story 3","var(--story3)"]
      ];
      document.getElementById("psKeyList").innerHTML = items.map(function(it){
        return '<span style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:'+it[1]+';display:inline-block;"></span>'+it[0]+'</span>';
      }).join("");
    }
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  });
  document.getElementById("fSearch").addEventListener("input", function(){ currentFilters.search = this.value; render(); if (currentView==="list") renderListView(); });
  document.getElementById("fStatus").addEventListener("change", function(){ currentFilters.status = this.value; render(); if (currentView==="list") renderListView(); });
  document.getElementById("fResp").addEventListener("change", function(){ currentFilters.resp = this.value; render(); if (currentView==="list") renderListView(); });
  document.getElementById("fClear").addEventListener("click", function(){
    currentFilters = { search:"", status:"", resp:"" };
    document.getElementById("fSearch").value = "";
    document.getElementById("fStatus").value = "";
    document.getElementById("fResp").value = "";
    render();
    if (currentView==="list") renderListView();
  });

  // ---------- WhatsApp-style export ----------
  document.getElementById("psExportBtn").addEventListener("click", function(){
    var wk = toKey(currentMonday);
    ensureWeekData(currentMonday);
    var daysData = state.weeks[wk];
    var lines = ["*Planet Sport — Semaine du "+fmtRange(currentMonday)+"*", ""];
    for (var i=0;i<7;i++){
      var d = addDays(currentMonday, i);
      var key = toKey(d);
      var cards = daysData[key] || [];
      if (!cards.length) continue;
      lines.push("*"+DAY_NAMES[i]+" "+pad(d.getDate())+"/"+pad(d.getMonth()+1)+"*");
      cards.forEach(function(c){
        lines.push("• ["+c.kind+"] "+c.title+" — "+c.status);
      });
      lines.push("");
    }
    var text = lines.join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function(){
        showUndoToast("Semaine copiée dans le presse-papiers", function(){});
      }).catch(function(){
        window.prompt("Copiez le texte ci-dessous :", text);
      });
    } else {
      window.prompt("Copiez le texte ci-dessous :", text);
    }
  });

  // ---------- PDF export (print) ----------
  document.getElementById("psPdfBtn").addEventListener("click", function(){
    if (currentView !== "week") {
      var wbtn = document.querySelector('#psViewSeg button[data-view="week"]');
      if (wbtn) wbtn.click();
    }
    setTimeout(function(){ window.print(); }, 50);
  });

  // ---------- Keyboard shortcuts ----------
  function defaultCreateDateKey(){
    var wk = toKey(currentMonday);
    var diffDays = Math.round((new Date(REAL_TODAY.getFullYear(),REAL_TODAY.getMonth(),REAL_TODAY.getDate()) - currentMonday) / 86400000);
    if (diffDays >= 0 && diffDays < 7) return todayKey;
    return wk;
  }

  function openShortcutsModal(){
    var root = document.getElementById("psModalRoot");
    var wrap = document.createElement("div");
    wrap.className = "ps-modal-backdrop";
    var rows = [["⌘K / Ctrl+K","Recherche"],["← / →","Semaine précédente / suivante"],["T","Aujourd'hui"],["N","Nouveau post"],["Échap","Fermer une fenêtre"],["?","Cette aide"]];
    wrap.innerHTML = '<div class="ps-modal"><div class="ps-modal-head"><i class="ti ti-keyboard" aria-hidden="true"></i>Raccourcis clavier</div>' +
      rows.map(function(r){ return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line);font-size:12.5px;"><span style="font-weight:600;">'+r[0]+'</span><span style="color:var(--text-2);">'+r[1]+'</span></div>'; }).join("") +
      '<div class="ps-modal-actions"><button class="ps-btn primary" id="skClose">Fermer</button></div></div>';
    root.appendChild(wrap);
    wrap.querySelector("#skClose").addEventListener("click", function(){ root.removeChild(wrap); });
    wrap.addEventListener("click", function(e){ if (e.target === wrap) root.removeChild(wrap); });
  }
  document.getElementById("psShortcutsBtn").addEventListener("click", openShortcutsModal);

  document.addEventListener("keydown", function(e){
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === "Escape") {
      var modalRoot = document.getElementById("psModalRoot");
      if (modalRoot.firstChild) modalRoot.innerHTML = "";
      return;
    }
    if (e.key === "?") { openShortcutsModal(); return; }
    var calTab = document.getElementById("psTabCalendar");
    if (calTab.style.display === "none") return;
    if (e.key.toLowerCase() === "t") { document.getElementById("psToday").click(); return; }
    if (e.key.toLowerCase() === "n") { openCreateModal(defaultCreateDateKey(), true); return; }
    if (currentView !== "week") return;
    if (e.key === "ArrowLeft") { document.getElementById("psPrev").click(); }
    if (e.key === "ArrowRight") { document.getElementById("psNext").click(); }
  });

  // ---------- Idéation ----------
  var ideaSearchQuery = "";

  function renderIdeas(){
    var panel = document.getElementById("psIdeasPanel");
    if (!state.ideas.length) {
      panel.innerHTML = '<div style="color:var(--text-2);font-size:13px;">Aucune idée pour le moment. Cliquez sur "Nouvelle idée" pour commencer.</div>';
      return;
    }
    panel.innerHTML = "";
    var PRIORITY_ORDER = {"Haute":0,"Moyenne":1,"Basse":2};
    var sortedIdeas = state.ideas.slice().sort(function(a,b){
      return PRIORITY_ORDER[a.priority||"Moyenne"] - PRIORITY_ORDER[b.priority||"Moyenne"];
    });
    if (ideaSearchQuery) {
      var q = ideaSearchQuery.toLowerCase();
      sortedIdeas = sortedIdeas.filter(function(idea){
        return (idea.title+" "+(idea.note||"")+" "+(idea.tagDetail||"")).toLowerCase().indexOf(q) !== -1;
      });
    }
    if (!sortedIdeas.length) {
      panel.innerHTML = '<div style="color:var(--text-2);font-size:13px;">Aucune idée ne correspond à la recherche.</div>';
      return;
    }
    var PRIORITY_COLORS = { "Haute": {bg:"#FCEBEB",fg:"#A32D2D"}, "Moyenne": {bg:"#FEF3DC",fg:"#93650B"}, "Basse": {bg:"#EAF4EC",fg:"#1E703F"} };
    sortedIdeas.forEach(function(idea){
      var el = document.createElement("div");
      el.className = "ps-ideacard";
      var imgHtml = idea.image ? '<img src="'+escapeHtml(idea.image)+'" alt="" style="width:100%;border-radius:8px;margin-bottom:8px;max-height:120px;object-fit:cover;" onerror="this.style.display=\'none\'">' : "";
      var linkHtml = idea.link ? '<a href="'+escapeHtml(idea.link)+'" target="_blank" rel="noopener" class="ps-cardlink" style="margin-bottom:8px;"><i class="ti ti-link" aria-hidden="true" style="font-size:11px;"></i>Lien</a>' : "";
      var tagColors = { "Produit": {bg:"#DCE6F1",fg:"#0C447C"}, "Campagne": {bg:"#F4CCCC",fg:"#791F1F"}, "Autre": {bg:"#EEF1F7",fg:"#444441"} };
      var pc = PRIORITY_COLORS[idea.priority||"Moyenne"];
      var tagHtml = '<span class="ps-tag" style="background:'+pc.bg+';color:'+pc.fg+';margin-bottom:6px;margin-right:4px;display:inline-block;">'+(idea.priority||"Moyenne")+'</span>';
      if (idea.tagType) {
        var tc = tagColors[idea.tagType] || tagColors["Autre"];
        var tagText = idea.tagType + (idea.tagDetail ? " · "+escapeHtml(idea.tagDetail) : "");
        tagHtml += '<span class="ps-tag" style="background:'+tc.bg+';color:'+tc.fg+';margin-bottom:6px;display:inline-block;">'+tagText+'</span>';
      }
      tagHtml += '<br>';
      el.innerHTML =
        '<div class="ps-card-del" title="Supprimer"><i class="ti ti-x" aria-hidden="true" style="font-size:11px;"></i></div>' +
        imgHtml +
        tagHtml +
        '<div style="font-weight:600;margin-bottom:3px;">'+escapeHtml(idea.title)+'</div>' +
        '<div style="color:var(--text-2);font-size:11.5px;margin-bottom:6px;">'+escapeHtml(idea.note||"")+'</div>' +
        linkHtml +
        '<button class="ps-btn" style="font-size:11px;padding:5px 10px;display:block;">Envoyer en production</button>';
      el.querySelector(".ps-card-del").addEventListener("click", function(e){
        e.stopPropagation();
        var idx = state.ideas.indexOf(idea);
        var removed = state.ideas.splice(idx,1)[0];
        save(); renderIdeas();
        showUndoToast("Idée supprimée", function(){ state.ideas.splice(idx,0,removed); save(); renderIdeas(); });
      });
      el.querySelector("button.ps-btn").addEventListener("click", function(){
        state.production.todo.push({ id:"prod-"+Date.now(), kind:"Feed", category:"Planet Sport Content", title: idea.title, format:"", cta:"", brand:null, note: idea.note||"", image: idea.image||"", link: idea.link||"", fromIdea: true });
        var idx = state.ideas.indexOf(idea);
        state.ideas.splice(idx,1);
        save(); renderIdeas();
      });
      panel.appendChild(el);
    });
  }

  document.getElementById("psIdeaSearch").addEventListener("input", function(){
    ideaSearchQuery = this.value;
    renderIdeas();
  });

  document.getElementById("psAddIdea").addEventListener("click", function(){
    var root = document.getElementById("psModalRoot");
    var wrap = document.createElement("div");
    wrap.className = "ps-modal-backdrop";
    wrap.innerHTML =
      '<div class="ps-modal">' +
        '<div class="ps-modal-head"><i class="ti ti-bulb" aria-hidden="true"></i>Nouvelle idée</div>' +
        '<div class="ps-field"><label>Titre</label><input type="text" id="iTitle" placeholder="Ex: Story sur les nouveaux crampons"></div>' +
        '<div class="ps-field"><label>Priorité</label><select id="iPriority"><option value="Moyenne">Moyenne</option><option value="Haute">Haute</option><option value="Basse">Basse</option></select></div>' +
        '<div class="ps-field"><label>Tag</label><select id="iTagType"><option value="">Aucun</option><option value="Produit">Produit</option><option value="Campagne">Campagne</option><option value="Autre">Autre</option></select></div>' +
        '<div class="ps-field"><label>Détail du tag (optionnel)</label><input type="text" id="iTagDetail" placeholder="Ex: Adidas Predator / Back to School"></div>' +
        '<div class="ps-field"><label>Note</label><textarea id="iNote" rows="3" placeholder="Détails, inspiration..."></textarea></div>' +
        '<div class="ps-field"><label>Image (URL, optionnel)</label><input type="text" id="iImage" placeholder="https://..."></div>' +
        '<div class="ps-field"><label>Lien (URL, optionnel)</label><input type="text" id="iLink" placeholder="https://..."></div>' +
        '<div class="ps-modal-actions"><button class="ps-btn" id="iCancel">Annuler</button><button class="ps-btn primary" id="iSave">Ajouter</button></div>' +
      '</div>';
    root.appendChild(wrap);
    wrap.querySelector("#iCancel").addEventListener("click", function(){ root.removeChild(wrap); });
    wrap.addEventListener("click", function(e){ if (e.target===wrap) root.removeChild(wrap); });
    wrap.querySelector("#iSave").addEventListener("click", function(){
      var title = wrap.querySelector("#iTitle").value.trim();
      if (!title) { root.removeChild(wrap); return; }
      var isDup = state.ideas.some(function(x){ return x.title.trim().toLowerCase() === title.toLowerCase(); });
      if (isDup && !wrap.dataset.confirmed) {
        wrap.dataset.confirmed = "1";
        if (!wrap.querySelector("#iDupWarn")) {
          var warnEl = document.createElement("div");
          warnEl.id = "iDupWarn";
          warnEl.style.cssText = "background:#FEF3DC;color:#93650B;border-radius:8px;padding:8px 10px;font-size:12px;margin-bottom:11px;";
          warnEl.textContent = 'Une idée avec un titre similaire existe déjà. Cliquez à nouveau sur "Ajouter" pour l\'ajouter quand même.';
          wrap.querySelector(".ps-modal-actions").insertAdjacentElement("beforebegin", warnEl);
        }
        return;
      }
      state.ideas.push({
        id:"idea-"+Date.now(), title: title, note: wrap.querySelector("#iNote").value,
        image: wrap.querySelector("#iImage").value, link: wrap.querySelector("#iLink").value,
        tagType: wrap.querySelector("#iTagType").value, tagDetail: wrap.querySelector("#iTagDetail").value,
        priority: wrap.querySelector("#iPriority").value
      });
      save();
      root.removeChild(wrap);
      renderIdeas();
    });
  });

  // ---------- Production (Kanban) ----------
  var KAN_COLS = [["todo","À faire"],["inprogress","En cours"],["ready","Prêt"]];

  function renderKanban(){
    var el = document.getElementById("psKanban");
    el.innerHTML = "";
    KAN_COLS.forEach(function(colDef){
      var colKey = colDef[0], colLabel = colDef[1];
      var col = document.createElement("div");
      col.className = "ps-kancol";
      col.dataset.col = colKey;
      var head = document.createElement("div");
      head.className = "ps-kancol-head";
      head.innerHTML = "<span>"+colLabel+"</span><span style='color:var(--text-3);'>"+state.production[colKey].length+"</span>";
      col.appendChild(head);
      state.production[colKey].forEach(function(card){
        col.appendChild(renderKanCard(card, colKey));
      });
      col.addEventListener("dragover", function(e){ e.preventDefault(); });
      col.addEventListener("drop", function(e){
        e.preventDefault();
        var data = e.dataTransfer.getData("text/plain");
        if (!data || data.indexOf("kan::") !== 0) return;
        var parts = data.split("::");
        var fromCol = parts[1], cardId = parts[2];
        var fromArr = state.production[fromCol];
        var idx = -1;
        for (var j=0;j<fromArr.length;j++){ if (fromArr[j].id === cardId){ idx=j; break; } }
        if (idx === -1) return;
        var moved = fromArr.splice(idx,1)[0];
        state.production[colKey].push(moved);
        save(); renderKanban();
      });
      el.appendChild(col);
    });
  }

  function kanDueBadge(dueDate){
    if (!dueDate) return "";
    var parts = dueDate.split("-");
    var d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    var today = new Date(REAL_TODAY.getFullYear(), REAL_TODAY.getMonth(), REAL_TODAY.getDate());
    var diffH = (d - today) / 3600000;
    if (diffH < 0) return '<span class="ps-tag" style="background:#FCEBEB;color:#A32D2D;margin-left:4px;">En retard</span>';
    if (diffH <= 48) return '<span class="ps-tag" style="background:#FEF3DC;color:#93650B;margin-left:4px;">Bientôt</span>';
    return "";
  }

  function renderKanCard(card, colKey){
    var el = document.createElement("div");
    el.className = "ps-kancard";
    el.draggable = true;
    var tagHtml = card.brand ? '<span class="ps-tag tierdefault">'+escapeHtml(card.brand)+'</span>' : "";
    var originHtml = card.fromIdea ? '<span class="ps-tag" style="background:#EEEDFE;color:#3C3489;margin-left:4px;"><i class="ti ti-bulb" aria-hidden="true" style="font-size:9px;vertical-align:-1px;"></i> Depuis Idéation</span>' : "";
    var avatarColor = AVATAR_COLORS[card.responsable] || "#9AA2AF";
    el.innerHTML =
      '<div class="ps-card-del" title="Supprimer"><i class="ti ti-x" aria-hidden="true" style="font-size:11px;"></i></div>' +
      '<div style="font-size:9px;text-transform:uppercase;color:var(--text-3);font-weight:600;">'+card.kind+' · '+card.category+'</div>' +
      '<div style="font-weight:600;margin:2px 0;">'+escapeHtml(card.title)+'</div>' +
      tagHtml + originHtml + kanDueBadge(card.dueDate) +
      '<div style="display:flex;gap:6px;align-items:center;margin-top:8px;">' +
        '<select class="ps-kan-ctype" style="font-size:10.5px;padding:3px 5px;flex:1;">'+
          ["Photo","Vidéo","Carousel","Reel","Texte"].map(function(t){ return '<option'+(t===card.contentType?" selected":"")+'>'+t+'</option>'; }).join("") +
        '</select>' +
        '<select class="ps-kan-resp" style="font-size:10.5px;padding:3px 5px;flex:1;">'+
          ["À assigner","Ilias","Agence","Équipe Boutique"].map(function(t){ return '<option'+(t===card.responsable?" selected":"")+'>'+t+'</option>'; }).join("") +
        '</select>' +
      '</div>' +
      '<div style="margin-top:6px;"><input type="date" class="ps-kan-due" style="font-size:10.5px;padding:3px 5px;width:100%;" value="'+(card.dueDate||"")+'" title="Échéance"></div>' +
      (colKey === "ready" ? '<button class="ps-btn" style="font-size:10.5px;padding:4px 8px;margin-top:6px;">Programmer</button>' : "");
    el.querySelector(".ps-kan-ctype").addEventListener("change", function(){ card.contentType = this.value; save(); });
    el.querySelector(".ps-kan-resp").addEventListener("change", function(){ card.responsable = this.value; save(); renderKanban(); });
    el.querySelector(".ps-kan-due").addEventListener("change", function(){ card.dueDate = this.value; save(); renderKanban(); });
    el.addEventListener("dragstart", function(e){
      e.dataTransfer.setData("text/plain", "kan::"+colKey+"::"+card.id);
      e.dataTransfer.effectAllowed = "move";
    });
    el.querySelector(".ps-card-del").addEventListener("click", function(e){
      e.stopPropagation();
      var arr = state.production[colKey];
      var idx = arr.indexOf(card);
      var removed = arr.splice(idx,1)[0];
      save(); renderKanban();
      showUndoToast("Retiré de la production", function(){ arr.splice(idx,0,removed); save(); renderKanban(); });
    });
    var scheduleBtn = el.querySelector("button.ps-btn");
    if (scheduleBtn) {
      scheduleBtn.addEventListener("click", function(e){
        e.stopPropagation();
        openScheduleModal(card, colKey);
      });
    }
    return el;
  }

  function openScheduleModal(card, colKey){
    var root = document.getElementById("psModalRoot");
    var wrap = document.createElement("div");
    wrap.className = "ps-modal-backdrop";
    wrap.innerHTML =
      '<div class="ps-modal">' +
        '<div class="ps-modal-head"><i class="ti ti-calendar-event" aria-hidden="true"></i>Programmer</div>' +
        '<div class="ps-field"><label>Date</label><input type="date" id="schedDate" value="'+todayKey+'"></div>' +
        '<div class="ps-modal-actions"><button class="ps-btn" id="schedCancel">Annuler</button><button class="ps-btn primary" id="schedSave">Ajouter au calendrier</button></div>' +
      '</div>';
    root.appendChild(wrap);
    wrap.querySelector("#schedCancel").addEventListener("click", function(){ root.removeChild(wrap); });
    wrap.addEventListener("click", function(e){ if (e.target===wrap) root.removeChild(wrap); });
    wrap.querySelector("#schedSave").addEventListener("click", function(){
      var dateVal = wrap.querySelector("#schedDate").value;
      if (!dateVal) { root.removeChild(wrap); return; }
      var targetMonday = mondayOf(new Date(dateVal + "T00:00:00"));
      ensureWeekData(targetMonday);
      var wk = toKey(targetMonday);
      if (!state.weeks[wk][dateVal]) state.weeks[wk][dateVal] = [];
      var newCard = JSON.parse(JSON.stringify(card));
      newCard.id = "sched-" + Date.now();
      newCard.status = "Prêt";
      newCard.responsable = "À assigner";
      newCard.note = card.note || "";
      state.weeks[wk][dateVal].push(newCard);
      var arr = state.production[colKey];
      var idx = arr.indexOf(card);
      if (idx > -1) arr.splice(idx,1);
      save();
      root.removeChild(wrap);
      renderKanban();
    });
  }

  document.getElementById("psAddProd").addEventListener("click", function(){
    var root = document.getElementById("psModalRoot");
    var wrap = document.createElement("div");
    wrap.className = "ps-modal-backdrop";
    wrap.innerHTML =
      '<div class="ps-modal">' +
        '<div class="ps-modal-head"><i class="ti ti-plus" aria-hidden="true"></i>Nouveau contenu à produire</div>' +
        '<div class="ps-field"><label>Type</label><select id="pType">'+
          TYPE_OPTIONS.map(function(o){ return '<option value="'+o.value+'">'+o.label+'</option>'; }).join("") +
        '</select></div>' +
        '<div class="ps-field"><label>Titre</label><input type="text" id="pTitle"></div>' +
        '<div class="ps-field"><label>Type de contenu</label><select id="pContentType"><option>Photo</option><option>Vidéo</option><option>Carousel</option><option>Reel</option><option>Texte</option></select></div>' +
        '<div class="ps-field"><label>Qui va le faire</label><select id="pResp"><option>À assigner</option><option>Ilias</option><option>Agence</option><option>Équipe Boutique</option></select></div>' +
        '<div class="ps-field"><label>Marque (optionnel)</label><input type="text" id="pBrand"></div>' +
        '<div class="ps-modal-actions"><button class="ps-btn" id="pCancel">Annuler</button><button class="ps-btn primary" id="pSave">Ajouter</button></div>' +
      '</div>';
    root.appendChild(wrap);
    wrap.querySelector("#pCancel").addEventListener("click", function(){ root.removeChild(wrap); });
    wrap.addEventListener("click", function(e){ if (e.target===wrap) root.removeChild(wrap); });
    wrap.querySelector("#pSave").addEventListener("click", function(){
      var typeVal = wrap.querySelector("#pType").value.split("|");
      state.production.todo.push({
        id:"prod-"+Date.now(), kind:typeVal[0], category:typeVal[1],
        title: wrap.querySelector("#pTitle").value || "Nouveau contenu",
        brand: wrap.querySelector("#pBrand").value || null, format:"", cta:"",
        contentType: wrap.querySelector("#pContentType").value,
        responsable: wrap.querySelector("#pResp").value
      });
      save();
      root.removeChild(wrap);
      renderKanban();
    });
  });

  // ---------- Influence ----------
  var INFLUENCE_STATUS_COLORS = {
    "Prospection": {bg:"#E6F1FB",fg:"#0C447C"}, "Contacté": {bg:"#FAEEDA",fg:"#854F0B"},
    "Négociation": {bg:"#F4CCCC",fg:"#791F1F"}, "Actif": {bg:"#EAF3DE",fg:"#3B6D11"},
    "Terminé": {bg:"#EEF1F7",fg:"#444441"}, "Refusé": {bg:"#F1EFE8",fg:"#5F5E5A"}
  };

  var influenceView = "list";
  var INFLUENCE_PIPELINE_COLS = ["Prospection","Contacté","Négociation","Actif","Terminé","Refusé"];

  function renderInfluence(){
    document.getElementById("psInfluencePanel").style.display = influenceView === "list" ? "" : "none";
    document.getElementById("psInfluencePipeline").style.display = influenceView === "pipeline" ? "" : "none";
    if (influenceView === "pipeline") { renderInfluencePipeline(); return; }
    var panel = document.getElementById("psInfluencePanel");
    if (!state.influencers.length) {
      panel.innerHTML = '<div style="color:var(--text-2);font-size:13px;">Aucun influenceur suivi pour le moment. Ajoutez vos contacts en prospection ou déjà actifs.</div>';
      return;
    }
    var html = '<div class="ps-listtable-wrap"><table class="ps-listtable"><thead><tr><th>Nom</th><th>Plateforme</th><th>Catégorie</th><th>Campagne</th><th>Statut</th><th>Relance</th><th>Contact</th><th></th></tr></thead><tbody>';
    state.influencers.forEach(function(inf){
      var sc = INFLUENCE_STATUS_COLORS[inf.status] || INFLUENCE_STATUS_COLORS["Prospection"];
      html += '<tr data-inf-id="'+inf.id+'" style="cursor:pointer;">' +
        '<td style="font-weight:500;">'+escapeHtml(inf.name)+'</td>' +
        '<td>'+escapeHtml(inf.platform||"")+'</td>' +
        '<td>'+escapeHtml(inf.category||"")+'</td>' +
        '<td>'+escapeHtml(inf.campaign||"—")+'</td>' +
        '<td><span class="ps-tag" style="background:'+sc.bg+';color:'+sc.fg+';">'+inf.status+'</span></td>' +
        '<td>'+(inf.followUpDate ? (inf.followUpDate.split("-").reverse().join("/") + kanDueBadge(inf.followUpDate)) : "—")+'</td>' +
        '<td style="color:var(--text-2);">'+escapeHtml(inf.contact||"")+'</td>' +
        '<td><span class="ps-inf-del" data-inf-id="'+inf.id+'" style="cursor:pointer;color:var(--text-3);"><i class="ti ti-x" aria-hidden="true"></i></span></td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';
    panel.innerHTML = html;
    panel.querySelectorAll("tr[data-inf-id]").forEach(function(row){
      row.addEventListener("click", function(e){
        if (e.target.closest(".ps-inf-del")) return;
        var inf = state.influencers.filter(function(i){ return i.id === row.dataset.infId; })[0];
        if (inf) openInfluencerModal(inf);
      });
    });
    panel.querySelectorAll(".ps-inf-del").forEach(function(del){
      del.addEventListener("click", function(e){
        e.stopPropagation();
        if (!window.confirm("Supprimer cet influenceur ?")) return;
        var idx = state.influencers.findIndex(function(i){ return i.id === del.dataset.infId; });
        if (idx > -1) {
          var removed = state.influencers.splice(idx,1)[0];
          save(); renderInfluence();
          showUndoToast("Influenceur supprimé", function(){ state.influencers.splice(idx,0,removed); save(); renderInfluence(); });
        }
      });
    });
  }

  function renderInfluencePipeline(){
    var el = document.getElementById("psInfluencePipeline");
    el.innerHTML = "";
    INFLUENCE_PIPELINE_COLS.forEach(function(status){
      var col = document.createElement("div");
      col.className = "ps-kancol";
      var items = state.influencers.filter(function(i){ return (i.status||"Prospection") === status; });
      col.innerHTML = '<div class="ps-kancol-head"><span>'+status+'</span><span style="color:var(--text-3);">'+items.length+'</span></div>';
      items.forEach(function(inf){
        var card = document.createElement("div");
        card.className = "ps-kancard";
        card.innerHTML =
          '<div style="font-weight:600;margin-bottom:2px;">'+escapeHtml(inf.name)+'</div>' +
          '<div style="font-size:10.5px;color:var(--text-2);">'+escapeHtml(inf.platform||"")+(inf.campaign ? " · "+escapeHtml(inf.campaign) : "")+'</div>' +
          (inf.followUpDate ? '<div style="margin-top:5px;">'+kanDueBadge(inf.followUpDate)+' <span style="font-size:10px;color:var(--text-3);">Relance '+inf.followUpDate.split("-").reverse().join("/")+'</span></div>' : "");
        card.addEventListener("click", function(){ openInfluencerModal(inf); });
        col.appendChild(card);
      });
      el.appendChild(col);
    });
  }

  document.getElementById("psInfViewSeg").addEventListener("click", function(e){
    var btn = e.target.closest("button");
    if (!btn) return;
    document.querySelectorAll("#psInfViewSeg button").forEach(function(b){ b.classList.remove("active"); });
    btn.classList.add("active");
    influenceView = btn.dataset.infView;
    renderInfluence();
  });

  function openInfluencerModal(inf){
    var isNew = !inf;
    var data = inf || { id:"inf-"+Date.now(), name:"", platform:"Instagram", category:"Brands Collections Content", campaign:"", status:"Prospection", contact:"", followers:"", notes:"", followUpDate:"" };
    var root = document.getElementById("psModalRoot");
    var wrap = document.createElement("div");
    wrap.className = "ps-modal-backdrop";
    var campOptions = ['<option value="">Aucune</option>'].concat(state.campaigns.map(function(c){ return '<option value="'+escapeHtml(c.name)+'"'+(c.name===data.campaign?" selected":"")+'>'+escapeHtml(c.name)+'</option>'; })).join("");
    wrap.innerHTML =
      '<div class="ps-modal">' +
        '<div class="ps-modal-head"><i class="ti ti-users" aria-hidden="true"></i>'+(isNew?"Nouvel influenceur":"Modifier l'influenceur")+'</div>' +
        '<div class="ps-field"><label>Nom</label><input type="text" id="infName" value="'+escapeHtml(data.name)+'" placeholder="Ex: @coureur_maroc"></div>' +
        '<div class="ps-field"><label>Plateforme</label><select id="infPlatform">'+
          ["Instagram","TikTok","YouTube","Twitter/X","Autre"].map(function(p){ return '<option'+(p===data.platform?" selected":"")+'>'+p+'</option>'; }).join("") +
        '</select></div>' +
        '<div class="ps-field"><label>Catégorie de contenu</label><select id="infCategory">'+
          ["Campaigns Content","Brands Collections Content","Planet Sport Content","Educational Content","Autre"].map(function(c){ return '<option value="'+c+'"'+(c===data.category?" selected":"")+'>'+c+'</option>'; }).join("") +
        '</select></div>' +
        '<div class="ps-field"><label>Campagne associée</label><select id="infCampaign">'+campOptions+'</select></div>' +
        '<div class="ps-field"><label>Statut</label><select id="infStatus">'+
          ["Prospection","Contacté","Négociation","Actif","Terminé","Refusé"].map(function(s){ return '<option'+(s===data.status?" selected":"")+'>'+s+'</option>'; }).join("") +
        '</select></div>' +
        '<div class="ps-field"><label>Contact (email / téléphone / DM)</label><input type="text" id="infContact" value="'+escapeHtml(data.contact)+'"></div>' +
        '<div class="ps-field"><label>Followers (optionnel)</label><input type="text" id="infFollowers" value="'+escapeHtml(data.followers||"")+'" placeholder="Ex: 24K"></div>' +
        '<div class="ps-field"><label>Date de relance (optionnel)</label><input type="date" id="infFollowUp" value="'+(data.followUpDate||"")+'"></div>' +
        '<div class="ps-field"><label>Notes</label><textarea id="infNotes" rows="3">'+escapeHtml(data.notes||"")+'</textarea></div>' +
        '<div class="ps-modal-actions">' +
          (isNew ? "" : '<button class="ps-btn" id="infDelete" style="margin-right:auto;color:#A32D2D;">Supprimer</button>') +
          '<button class="ps-btn" id="infCancel">Annuler</button>' +
          '<button class="ps-btn primary" id="infSave">'+(isNew?"Ajouter":"Enregistrer")+'</button>' +
        '</div>' +
      '</div>';
    root.appendChild(wrap);
    wrap.querySelector("#infCancel").addEventListener("click", function(){ root.removeChild(wrap); });
    wrap.addEventListener("click", function(e){ if (e.target===wrap) root.removeChild(wrap); });
    if (!isNew) {
      wrap.querySelector("#infDelete").addEventListener("click", function(){
        if (!window.confirm("Supprimer cet influenceur ?")) return;
        var idx = state.influencers.indexOf(data);
        state.influencers.splice(idx,1);
        save();
        root.removeChild(wrap);
        renderInfluence();
      });
    }
    wrap.querySelector("#infSave").addEventListener("click", function(){
      var name = wrap.querySelector("#infName").value.trim();
      if (!name) { root.removeChild(wrap); return; }
      data.name = name;
      data.platform = wrap.querySelector("#infPlatform").value;
      data.category = wrap.querySelector("#infCategory").value;
      data.campaign = wrap.querySelector("#infCampaign").value;
      data.status = wrap.querySelector("#infStatus").value;
      data.contact = wrap.querySelector("#infContact").value;
      data.followers = wrap.querySelector("#infFollowers").value;
      data.followUpDate = wrap.querySelector("#infFollowUp").value;
      data.notes = wrap.querySelector("#infNotes").value;
      if (isNew) state.influencers.push(data);
      save();
      root.removeChild(wrap);
      renderInfluence();
    });
  }

  document.getElementById("psAddInfluencer").addEventListener("click", function(){ openInfluencerModal(null); });

  // ---------- Campaigns ----------
  function campaignCalendarStats(camp){
    if (!camp.start || !camp.end) return null;
    var total = 0, published = 0;
    forEachCard(function(c, dateKey){
      if (dateKey >= camp.start && dateKey <= camp.end) { total++; if (c.status === "Publié") published++; }
    });
    return { total: total, published: published };
  }

  function renderCampaignTimeline(){
    var section = document.getElementById("psCampaignTimelineSection");
    var wrap = document.getElementById("psCampaignTimeline");
    var dated = state.campaigns.filter(function(c){ return c.start && c.end; });
    if (!dated.length) { section.style.display = "none"; return; }
    section.style.display = "";
    function toDays(s){ var p = s.split("-"); return Date.UTC(+p[0], +p[1]-1, +p[2]) / 86400000; }
    var minN = Math.min.apply(null, dated.map(function(c){ return toDays(c.start); }));
    var maxN = Math.max.apply(null, dated.map(function(c){ return toDays(c.end); }));
    var span = Math.max(1, maxN - minN);
    wrap.innerHTML = dated.map(function(c){
      var left = ((toDays(c.start) - minN) / span) * 100;
      var width = Math.max(2, ((toDays(c.end) - toDays(c.start)) / span) * 100);
      var isPast = c.end < todayKey;
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;font-size:11.5px;">' +
        '<div style="min-width:120px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+escapeHtml(c.name)+'">'+escapeHtml(c.name)+'</div>' +
        '<div style="flex:1;position:relative;height:16px;background:var(--canvas);border-radius:6px;">' +
          '<div style="position:absolute;top:0;bottom:0;left:'+left+'%;width:'+width+'%;background:'+CAT_COLORS["Campaigns Content"]+';border-radius:6px;opacity:'+(isPast?0.45:1)+';"></div>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  function renderCampaigns(){
    renderCampaignTimeline();
    var panel = document.getElementById("psCampaignsPanel");
    panel.innerHTML = "";
    state.campaigns.forEach(function(camp){
      var board = document.createElement("div");
      board.className = "ps-campboard";
      var doneN = camp.items.filter(function(it){ return it.status === "Publié"; }).length;
      var totalN = camp.items.length;
      var pct = totalN ? Math.round((doneN/totalN)*100) : 0;
      var calStats = campaignCalendarStats(camp);
      var calStatsHtml = calStats ? '<div style="font-size:11px;color:var(--text-2);margin-bottom:6px;">'+calStats.published+'/'+calStats.total+' contenus calendrier publiés sur la période</div>' : "";
      board.innerHTML =
        '<div class="ps-campboard-head"><div><div class="ps-campname">'+escapeHtml(camp.name)+'</div><div class="ps-campperiod">'+escapeHtml(camp.period)+'</div></div>' +
        '<div style="display:flex;gap:6px;align-items:center;">' +
          '<button class="ps-iconbtn ps-camp-edit" title="Modifier"><i class="ti ti-pencil" aria-hidden="true"></i></button>' +
          '<button class="ps-iconbtn ps-camp-remove" title="Supprimer la campagne"><i class="ti ti-trash" aria-hidden="true"></i></button>' +
          '<button class="ps-btn" style="font-size:11px;">+ Idée / Contenu</button>' +
        '</div></div>' +
        '<div style="font-size:11px;color:var(--text-2);margin-bottom:6px;">'+doneN+'/'+totalN+' publiés</div>' +
        '<div class="ps-tierbar-bg" style="margin-bottom:12px;"><div class="ps-tierbar-fill" style="width:'+pct+'%;background:'+CAT_COLORS["Campaigns Content"]+';"></div></div>' +
        calStatsHtml +
        '<div class="ps-camp-items"></div>';
      board.querySelector(".ps-camp-edit").addEventListener("click", function(){ openEditCampaignModal(camp); });
      board.querySelector(".ps-camp-remove").addEventListener("click", function(){
        if (!window.confirm("Supprimer la campagne \""+camp.name+"\" et tout son contenu ?")) return;
        var idx = state.campaigns.indexOf(camp);
        var removed = state.campaigns.splice(idx,1)[0];
        save(); renderCampaigns();
        showUndoToast("Campagne supprimée", function(){ state.campaigns.splice(idx,0,removed); save(); renderCampaigns(); });
      });
      var itemsWrap = board.querySelector(".ps-camp-items");
      var sortedItems = camp.items.slice().sort(function(a,b){ return (a.date||"9999").localeCompare(b.date||"9999"); });
      sortedItems.forEach(function(item){
        if (!item.status) item.status = "Idée";
        var itEl = document.createElement("div");
        itEl.className = "ps-campitem";
        var dateLabel = item.date ? item.date.split("-").reverse().join("/") : "Sans date";
        itEl.innerHTML =
          '<div class="ps-card-del" title="Supprimer"><i class="ti ti-x" aria-hidden="true" style="font-size:11px;"></i></div>' +
          '<div style="font-size:10px;color:var(--text-3);margin-bottom:3px;">'+dateLabel+'</div>' +
          '<div style="margin-bottom:6px;">'+escapeHtml(item.title)+'</div>' +
          '<select class="ps-campitem-status" style="font-size:11px;padding:4px 6px;">'+
            ["Idée","En préparation","Prêt","Publié"].map(function(s){ return '<option value="'+s+'"'+(s===item.status?" selected":"")+'>'+s+'</option>'; }).join("") +
          '</select>';
        itEl.querySelector(".ps-card-del").addEventListener("click", function(){
          var idx = camp.items.indexOf(item);
          camp.items.splice(idx,1);
          save(); renderCampaigns();
        });
        itEl.querySelector(".ps-campitem-status").addEventListener("change", function(){
          item.status = this.value;
          save(); renderCampaigns();
        });
        itemsWrap.appendChild(itEl);
      });
      board.querySelector("button.ps-btn").addEventListener("click", function(){
        openCampaignItemModal(camp);
      });
      panel.appendChild(board);
    });
  }

  function openEditCampaignModal(camp){
    var root = document.getElementById("psModalRoot");
    var wrap = document.createElement("div");
    wrap.className = "ps-modal-backdrop";
    wrap.innerHTML =
      '<div class="ps-modal">' +
        '<div class="ps-modal-head"><i class="ti ti-pencil" aria-hidden="true"></i>Modifier la campagne</div>' +
        '<div class="ps-field"><label>Nom</label><input type="text" id="ecName" value="'+escapeHtml(camp.name)+'"></div>' +
        '<div class="ps-field"><label>Période (texte affiché)</label><input type="text" id="ecPeriod" value="'+escapeHtml(camp.period)+'"></div>' +
        '<div class="ps-field"><label>Date de début</label><input type="date" id="ecStart" value="'+(camp.start||"")+'"></div>' +
        '<div class="ps-field"><label>Date de fin</label><input type="date" id="ecEnd" value="'+(camp.end||"")+'"></div>' +
        '<div class="ps-modal-actions"><button class="ps-btn" id="ecCancel">Annuler</button><button class="ps-btn primary" id="ecSave">Enregistrer</button></div>' +
      '</div>';
    root.appendChild(wrap);
    wrap.querySelector("#ecCancel").addEventListener("click", function(){ root.removeChild(wrap); });
    wrap.addEventListener("click", function(e){ if (e.target===wrap) root.removeChild(wrap); });
    wrap.querySelector("#ecSave").addEventListener("click", function(){
      camp.name = wrap.querySelector("#ecName").value || camp.name;
      camp.period = wrap.querySelector("#ecPeriod").value || camp.period;
      camp.start = wrap.querySelector("#ecStart").value || null;
      camp.end = wrap.querySelector("#ecEnd").value || null;
      save();
      root.removeChild(wrap);
      renderCampaigns();
    });
  }

  document.getElementById("psAddCampaign").addEventListener("click", function(){
    var root = document.getElementById("psModalRoot");
    var wrap = document.createElement("div");
    wrap.className = "ps-modal-backdrop";
    wrap.innerHTML =
      '<div class="ps-modal">' +
        '<div class="ps-modal-head"><i class="ti ti-plus" aria-hidden="true"></i>Nouvelle campagne</div>' +
        '<div class="ps-field"><label>Nom</label><input type="text" id="ncName" placeholder="Ex: Ramadan"></div>' +
        '<div class="ps-field"><label>Période (texte affiché)</label><input type="text" id="ncPeriod" placeholder="Ex: Février – Mars"></div>' +
        '<div class="ps-field"><label>Date de début (optionnel)</label><input type="date" id="ncStart"></div>' +
        '<div class="ps-field"><label>Date de fin (optionnel)</label><input type="date" id="ncEnd"></div>' +
        '<div class="ps-modal-actions"><button class="ps-btn" id="ncCancel">Annuler</button><button class="ps-btn primary" id="ncSave">Créer</button></div>' +
      '</div>';
    root.appendChild(wrap);
    wrap.querySelector("#ncCancel").addEventListener("click", function(){ root.removeChild(wrap); });
    wrap.addEventListener("click", function(e){ if (e.target===wrap) root.removeChild(wrap); });
    wrap.querySelector("#ncSave").addEventListener("click", function(){
      var name = wrap.querySelector("#ncName").value.trim();
      if (!name) { root.removeChild(wrap); return; }
      state.campaigns.push({
        id: "camp-"+Date.now(), name: name,
        period: wrap.querySelector("#ncPeriod").value || "",
        start: wrap.querySelector("#ncStart").value || null,
        end: wrap.querySelector("#ncEnd").value || null,
        items: []
      });
      save();
      root.removeChild(wrap);
      renderCampaigns();
    });
  });

  function openCampaignItemModal(camp){
    var root = document.getElementById("psModalRoot");
    var wrap = document.createElement("div");
    wrap.className = "ps-modal-backdrop";
    wrap.innerHTML =
      '<div class="ps-modal">' +
        '<div class="ps-modal-head"><i class="ti ti-discount-2" aria-hidden="true"></i>Contenu pour '+escapeHtml(camp.name)+'</div>' +
        '<div class="ps-field"><label>Titre</label><input type="text" id="ciTitle" placeholder="Ex: Post ouverture soldes"></div>' +
        '<div class="ps-field"><label>Date (optionnel)</label><input type="date" id="ciDate"></div>' +
        '<div class="ps-modal-actions"><button class="ps-btn" id="ciCancel">Annuler</button><button class="ps-btn primary" id="ciSave">Ajouter</button></div>' +
      '</div>';
    root.appendChild(wrap);
    wrap.querySelector("#ciCancel").addEventListener("click", function(){ root.removeChild(wrap); });
    wrap.addEventListener("click", function(e){ if (e.target===wrap) root.removeChild(wrap); });
    wrap.querySelector("#ciSave").addEventListener("click", function(){
      var title = wrap.querySelector("#ciTitle").value.trim();
      if (!title) { root.removeChild(wrap); return; }
      camp.items.push({ id:"campitem-"+Date.now(), title: title, status:"Idée", date: wrap.querySelector("#ciDate").value || "" });
      save();
      root.removeChild(wrap);
      renderCampaigns();
    });
  }

  // ---------- Library (Bibliothèque) ----------
  function brandLinkRowHtml(asset){
    var isImg = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(asset.url||"");
    var iconHtml = isImg
      ? '<img src="'+escapeHtml(asset.url)+'" alt="" style="width:22px;height:22px;border-radius:5px;object-fit:cover;flex-shrink:0;" onerror="this.style.display=\'none\'">'
      : '<i class="ti ti-link" aria-hidden="true"></i>';
    return '<div class="ps-brandlink" data-asset-id="'+asset.id+'">' +
      iconHtml +
      '<a href="'+escapeHtml(asset.url)+'" target="_blank" rel="noopener">'+escapeHtml(asset.title)+'</a>' +
      '<div class="ps-card-del" title="Supprimer" style="position:static;display:flex;"><i class="ti ti-x" aria-hidden="true" style="font-size:10px;"></i></div>' +
    '</div>';
  }

  function renderBrandGrid(){
    var grid = document.getElementById("psBrandGrid");
    var defs = allBrandDefs();
    var cardsHtml = defs.map(function(b){
      var brandAssets = state.assets.filter(function(a){ return a.brand === b.name; });
      var linksHtml = brandAssets.length ? brandAssets.map(brandLinkRowHtml).join("") : '<div class="ps-brandlink-empty">Aucun lien</div>';
      return '<div class="ps-brandcard" data-brand="'+escapeHtml(b.name)+'">' +
        '<div class="ps-brandcard-head">' +
          '<span class="ps-tierbadge" style="background:'+tabColors[b.tier]+';">'+b.tier+'</span>' +
          '<span class="ps-brandcard-name">'+escapeHtml(b.name)+'</span>' +
        '</div>' +
        '<div class="ps-tierbar-bg"><div class="ps-tierbar-fill" style="width:'+Math.min(100, b.pct*2.4)+'%;background:'+tabColors[b.tier]+';"></div></div>' +
        '<div class="ps-tierpct" style="text-align:right;margin:2px 0 8px;">'+b.pct+'% du catalogue</div>' +
        '<div class="ps-brandlinks">'+linksHtml+'</div>' +
        '<button class="ps-btn ps-brand-addlink" style="font-size:10.5px;padding:4px 9px;margin-top:8px;">+ Lien</button>' +
      '</div>';
    }).join("");

    var generalAssets = state.assets.filter(function(a){ return !a.brand; });
    var generalLinksHtml = generalAssets.length ? generalAssets.map(brandLinkRowHtml).join("") : '<div class="ps-brandlink-empty">Aucun lien</div>';
    cardsHtml += '<div class="ps-brandcard" data-brand="">' +
      '<div class="ps-brandcard-head"><span class="ps-brandcard-name">Général</span></div>' +
      '<div class="ps-brandlinks">'+generalLinksHtml+'</div>' +
      '<button class="ps-btn ps-brand-addlink" style="font-size:10.5px;padding:4px 9px;margin-top:8px;">+ Lien</button>' +
    '</div>';

    grid.innerHTML = cardsHtml;

    grid.querySelectorAll(".ps-brandcard").forEach(function(card){
      var brand = card.dataset.brand || null;
      card.querySelector(".ps-brand-addlink").addEventListener("click", function(){ openAssetModal(brand); });
      card.querySelectorAll(".ps-brandlink").forEach(function(linkEl){
        linkEl.querySelector(".ps-card-del").addEventListener("click", function(){
          var idx = state.assets.findIndex(function(a){ return a.id === linkEl.dataset.assetId; });
          if (idx > -1) { state.assets.splice(idx,1); save(); renderBrandGrid(); }
        });
      });
    });
  }

  function openAssetModal(presetBrand){
    var root = document.getElementById("psModalRoot");
    var wrap = document.createElement("div");
    wrap.className = "ps-modal-backdrop";
    var brandOptions = ['<option value="">Général</option>'].concat(allBrandDefs().map(function(b){
      return '<option value="'+escapeHtml(b.name)+'"'+(b.name===presetBrand?" selected":"")+'>'+escapeHtml(b.name)+'</option>';
    })).join("");
    wrap.innerHTML =
      '<div class="ps-modal">' +
        '<div class="ps-modal-head"><i class="ti ti-link" aria-hidden="true"></i>Ajouter un lien</div>' +
        '<div class="ps-field"><label>Marque</label><select id="asBrand">'+brandOptions+'</select></div>' +
        '<div class="ps-field"><label>Titre</label><input type="text" id="asTitle" placeholder="Ex: Guide de marque Planet Sport"></div>' +
        '<div class="ps-field"><label>URL</label><input type="text" id="asUrl" placeholder="https://..."></div>' +
        '<div class="ps-modal-actions"><button class="ps-btn" id="asCancel">Annuler</button><button class="ps-btn primary" id="asSave">Ajouter</button></div>' +
      '</div>';
    root.appendChild(wrap);
    wrap.querySelector("#asCancel").addEventListener("click", function(){ root.removeChild(wrap); });
    wrap.addEventListener("click", function(e){ if (e.target===wrap) root.removeChild(wrap); });
    wrap.querySelector("#asSave").addEventListener("click", function(){
      var title = wrap.querySelector("#asTitle").value.trim();
      var url = wrap.querySelector("#asUrl").value.trim();
      if (!title || !url) { root.removeChild(wrap); return; }
      var brandVal = wrap.querySelector("#asBrand").value;
      state.assets.push({ id:"asset-"+Date.now(), title: title, url: url, brand: brandVal || null });
      save();
      root.removeChild(wrap);
      renderBrandGrid();
    });
  }

  document.getElementById("psAddAsset").addEventListener("click", function(){ openAssetModal(null); });

  function renderLibrary(){
    renderBrandGrid();
    var feedAxes = [
      ["Campaigns Content","Sales / Campagne active — 2x/semaine"],
      ["Brands Collections Content","Tier 1 (2x), Tier 2 (1x) — rotation"],
      ["Planet Sport Content","Store Content, Ambassadors, Coulisses — rotation 1x/2 sem."],
      ["Educational Content","Tech Specs, Par Sport, Un Modèle Une Histoire — rotation 1x/2 sem."]
    ];
    var feedPanel = document.getElementById("psAxesFeedPanel");
    feedPanel.innerHTML = "";
    feedAxes.forEach(function(a){
      var row = document.createElement("div");
      row.className = "ps-tierrow";
      row.innerHTML =
        '<span style="min-width:180px;font-weight:500;">'+a[0]+'</span>' +
        '<span style="color:var(--text-2);flex:1;">'+a[1]+'</span>' +
        '<button class="ps-btn ps-use-axe" style="font-size:10.5px;padding:4px 9px;">Utiliser cet axe</button>';
      row.querySelector(".ps-use-axe").addEventListener("click", function(){
        state.production.todo.push({ id:"prod-"+Date.now(), kind:"Feed", category:a[0], title:a[0], format:"", cta:"", brand:null, note:"", link:"" });
        save();
        showUndoToast("Ajouté en Production", function(){});
      });
      feedPanel.appendChild(row);
    });

    var storyAxes = [
      ["Story 1","Variable — change chaque jour (marques Tier 2/3, motivation, UGC...)"],
      ["Story 2","Focus Produit — traitement varié selon le jour"],
      ["Story 3","Repost du post Feed / meilleur post / campagne"]
    ];
    var storyPanel = document.getElementById("psAxesStoryPanel");
    storyPanel.innerHTML = "";
    storyAxes.forEach(function(a){
      var row = document.createElement("div");
      row.className = "ps-tierrow";
      row.innerHTML =
        '<span style="min-width:180px;font-weight:500;">'+a[0]+'</span>' +
        '<span style="color:var(--text-2);flex:1;">'+a[1]+'</span>' +
        '<button class="ps-btn ps-use-axe" style="font-size:10.5px;padding:4px 9px;">Utiliser cet axe</button>';
      row.querySelector(".ps-use-axe").addEventListener("click", function(){
        state.production.todo.push({ id:"prod-"+Date.now(), kind:a[0], category:a[0], title:a[0], format:"", cta:"", brand:null, note:"", link:"" });
        save();
        showUndoToast("Ajouté en Production", function(){});
      });
      storyPanel.appendChild(row);
    });

    var chartePanel = document.getElementById("psChartePanel");
    chartePanel.innerHTML = CHARTE_ITEMS.map(function(c){ return '<div class="ps-charte-item">'+escapeHtml(c)+'</div>'; }).join("");
  }

  // ---------- Tab switching ----------
  document.querySelectorAll(".ps-navbtn[data-tab]").forEach(function(btn){
    btn.addEventListener("click", function(){ switchTab(btn.dataset.tab); });
  });

  // ---------- Auth gate ----------
  function showScreen(id){
    ["psAuthScreen","psConfigScreen"].forEach(function(sid){
      document.getElementById(sid).style.display = sid === id ? "flex" : "none";
    });
    document.getElementById("psRoot").style.display = id ? "none" : "flex";
  }

  document.getElementById("psLogoutRow").addEventListener("click", function(){
    if (!supa) return;
    supa.auth.signOut().then(function(){ location.reload(); });
  });

  document.getElementById("authSubmit").addEventListener("click", function(){ submitLogin(); });
  document.getElementById("authPassword").addEventListener("keydown", function(e){ if (e.key === "Enter") submitLogin(); });

  function submitLogin(){
    var email = document.getElementById("authEmail").value.trim();
    var password = document.getElementById("authPassword").value;
    var errEl = document.getElementById("authError");
    errEl.style.display = "none";
    if (!email || !password) return;
    supa.auth.signInWithPassword({ email: email, password: password }).then(function(res){
      if (res.error) {
        errEl.textContent = "Email ou mot de passe incorrect.";
        errEl.style.display = "block";
        return;
      }
      showScreen(null);
      bootApp();
    });
  }

  function initAuthFlow(){
    if (!supabaseConfigured()) { showScreen("psConfigScreen"); return; }
    supa = window.supabase.createClient(window.PS_SUPABASE_URL, window.PS_SUPABASE_ANON_KEY);
    supa.auth.getSession().then(function(res){
      var session = res.data && res.data.session;
      if (session) { showScreen(null); bootApp(); }
      else { showScreen("psAuthScreen"); }
    });
  }

  initAuthFlow();
})();
