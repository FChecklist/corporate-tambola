/* The player's note from a Host who did not accept a claim (V2 item 10). Only when the organizer has switched claim review on for the game, and only for a person who has made a claim: it asks the server, gently
   (every 30 to 45 seconds, never while the page is hidden, and not at all for ten minutes after the answer "review is off"), and shows ONE short line. It reads nothing but this phone's own ticket id and sends nothing but that id.
   The software still decides the winners: this note only explains why a prize is being held back. Words go through CTLang.t, so the line follows the person's own language. */
(function () {
  "use strict";
  var W = window, D = document, q = new URLSearchParams(location.search), eid = q.get("e") || "";
  if (!eid || W.__ctnote) return; W.__ctnote = 1;
  var BASE = (q.get("api") || "").replace(/\/$/, ""), bar = null, quietUntil = 0;
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function T(s) { return W.CTLang ? W.CTLang.t(s) : s; }
  function claimed() { try { var a = JSON.parse(get("ctz:" + eid + ":claimed") || "[]"); return a && a.length > 0; } catch (e) { return false; } }
  function name(p) { var hs = (W.ZG && W.ZG.PRIZE_HOUSES) || []; for (var i = 0; i < hs.length; i++) if (hs[i].id === p || hs[i].id === String(p).split("@")[0]) return hs[i].label; return p; }
  function show(notes) {
    if (!notes.length) { if (bar) bar.hidden = true; return; }
    if (!bar) { bar = D.createElement("div"); bar.setAttribute("role", "status"); bar.style.cssText = "position:fixed;left:8px;right:8px;top:8px;z-index:70;background:#fff7e6;color:#5c3b00;border:1px solid #e0b25a;border-radius:10px;padding:10px 12px;font:600 .95rem/1.4 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.2)"; D.body.appendChild(bar); }
    bar.hidden = false; bar.textContent = "";
    notes.forEach(function (n) { var p = D.createElement("div"); p.textContent = T("The Host could not accept your claim for") + " " + name(n.pattern) + (n.reason ? ": " + n.reason : "") + ". " + T("The game goes on."); bar.appendChild(p); });
  }
  function next() { setTimeout(tick, 30000 + Math.floor(Math.random() * 15000)); }
  function tick() {
    var pid = get("ctz:" + eid + ":pid");
    if (!pid || !claimed() || D.hidden || Date.now() < quietUntil) return next();
    fetch(BASE + "/api/z/" + encodeURIComponent(eid) + "/v2/claimreview/note?pid=" + encodeURIComponent(pid)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) return; if (!j.on) { quietUntil = Date.now() + 600000; return show([]); }
      show((j.notes || []).filter(function (n) { return n.decision === "reject"; }));
    }).catch(function () { /* the note is a nicety: stay quiet */ }).then(next);
  }
  setTimeout(tick, 8000);
})();
