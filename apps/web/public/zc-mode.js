/* 1.8.2: which organizer screens open at /zc. The NEW screens are the default (except for links only the previous screens understand); ?flow=old opens the previous ones and is remembered on this browser; ?flow=new switches back.
   It runs first and only puts flow=new or flow=old into the address, so zc.js (previous screens) and pack/zc-flow.js (new screens) are not touched. */
(function () {
  try {
    var q = new URLSearchParams(location.search), f = q.get("flow"), KEY = "ctz-zcflow", s = null;
    try { s = localStorage.getItem(KEY); } catch (e) {}
    if (f === "new" || f === "old") { try { localStorage.setItem(KEY, f); } catch (e) {} }
    else {
      // links the previous screens alone understand (demo game, pass, quick start, new game from the ticket page, cap, do, k = a Host / AI key link, api): they open the previous screens and the choice is NOT stored
      var OLD = ["demo", "pass", "quick", "quickform", "new", "cap", "do", "k", "api"], forced = false;
      for (var i = 0; i < OLD.length; i++) if (q.has(OLD[i])) forced = true;
      // an existing game the new screens cannot run: manual start or host-called numbers need the Start / roll / pause controls (a signed control key), and a game that is live now needs Pause and Stop. Those open the previous screens, not stored.
      var gid = q.get("e");
      if (!forced && gid && /^[A-Za-z0-9_-]{4,40}$/.test(gid)) {
        try {
          var x = new XMLHttpRequest(); x.open("GET", "/api/z/" + encodeURIComponent(gid) + "/info", false); x.send(null);
          if (x.status === 200) {
            var j = JSON.parse(x.responseText), now = Date.now();
            if (j.startMode === "manual" || j.callMode === "host") forced = true;
            if (typeof j.startMs === "number" && now >= j.startMs - 15 * 60000 && now <= j.startMs + 4 * 3600000) forced = true;
          }
        } catch (e) { /* no answer: the new screens */ }
      }
      window.CT_ZCFORCED = forced;
      f = forced || s === "old" ? "old" : "new"; q.set("flow", f); try { history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash); } catch (e) {} }
    window.CT_ZCFLOW = f;
  } catch (e) { /* the page then opens as before */ }
})();
