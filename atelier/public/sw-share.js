// Atelier: Web Share Target handling, loaded by sw.js with importScripts("/sw-share.js").
//
// Plain JavaScript, no imports, so it runs in the service worker and in a test sandbox alike. It defines
// self.AtelierShare with three functions:
//
//   parseShareForm(form)          what the OS share sheet sent (title, text, url, files), capped and filtered
//   enqueueShare(idb, payload)    keep it in IndexedDB ("atelier-share-inbox" / "shares") until the Inbox page takes it
//   handleShareTarget(request, idb)  store first, then 303 to /inbox?shared=1; any failure is 303 to /inbox?shared=error
//
// Nothing here reads the network: the shared bytes stay on this device until the signed-in Inbox page, which
// has the person's session, sends them on. A request that reaches the server instead (no service worker) is answered
// by app/share-target/route.ts with a plain redirect and its body is never read.
(function () {
  var DB_NAME = "atelier-share-inbox";
  var STORE = "shares";

  var MAX_FILES = 10;
  var MAX_IMAGE_BYTES = 50 * 1024 * 1024;
  var MAX_VIDEO_BYTES = 200 * 1024 * 1024;
  var MAX_TITLE = 300;
  var MAX_TEXT = 10000;
  var MAX_URL = 2048;
  // No SVG: R2 would serve it as-is and it can carry script. HEIC is not listed: browsers cannot decode it.
  var IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
  var VIDEO_TYPES = ["video/mp4", "video/webm"];

  function clip(value, max) {
    return typeof value === "string" ? value.slice(0, max) : "";
  }

  function isFile(v) {
    return !!v && typeof v === "object" && typeof v.size === "number" && typeof v.type === "string" && typeof v.name === "string";
  }

  /** A string that is exactly one http(s) link. */
  function isSingleWebUrl(s) {
    var v = s.trim();
    if (!v || /\s/.test(v)) return false;
    try {
      var u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }

  function newId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return "share-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function parseShareForm(form) {
    var title = clip(form.get("title"), MAX_TITLE);
    var text = clip(form.get("text"), MAX_TEXT);
    var url = clip(form.get("url"), MAX_URL);
    // Android puts the shared link in `text` and leaves `url` empty.
    if (!url && text && isSingleWebUrl(text)) {
      url = text.trim().slice(0, MAX_URL);
      text = "";
    }
    var files = [];
    var skipped = 0;
    var all = form.getAll("media");
    for (var i = 0; i < all.length; i++) {
      var f = all[i];
      if (!isFile(f)) continue;
      var image = IMAGE_TYPES.indexOf(f.type) !== -1;
      var video = VIDEO_TYPES.indexOf(f.type) !== -1;
      var ok = (image && f.size <= MAX_IMAGE_BYTES) || (video && f.size <= MAX_VIDEO_BYTES);
      if (!ok || files.length >= MAX_FILES) {
        skipped++;
        continue;
      }
      files.push({ name: clip(f.name, 200), type: f.type, blob: f });
    }
    return { id: newId(), receivedAt: new Date().toISOString(), title: title, text: text, url: url, files: files, skipped: skipped };
  }

  function openDb(idb) {
    return new Promise(function (resolve, reject) {
      var req = idb.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        // Out-of-line, auto-incrementing keys: payloads come back in the order they were stored.
        req.result.createObjectStore(STORE, { autoIncrement: true });
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error("IndexedDB open failed"));
      };
      req.onblocked = function () {
        reject(new Error("IndexedDB is blocked"));
      };
    });
  }

  function enqueueShare(idb, payload) {
    return openDb(idb).then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).add(payload);
        tx.oncomplete = function () {
          db.close();
          resolve();
        };
        tx.onerror = tx.onabort = function () {
          db.close();
          reject(tx.error || new Error("IndexedDB write failed"));
        };
      });
    });
  }

  function redirect(path) {
    return new Response(null, { status: 303, headers: { Location: path } });
  }

  function handleShareTarget(request, idb) {
    return request
      .formData()
      .then(function (form) {
        var payload = parseShareForm(form);
        var empty = !payload.title && !payload.text && !payload.url && payload.files.length === 0 && payload.skipped === 0;
        return empty ? undefined : enqueueShare(idb, payload);
      })
      .then(
        function () {
          return redirect("/inbox?shared=1");
        },
        function () {
          return redirect("/inbox?shared=error");
        },
      );
  }

  self.AtelierShare = { parseShareForm: parseShareForm, enqueueShare: enqueueShare, handleShareTarget: handleShareTarget };
})();
