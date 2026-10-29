/* 1.8.2: which organizer screens open at /zc. The NEW screens are the default; ?flow=old opens the previous ones and is remembered on this browser; ?flow=new switches back.
   It runs first and only puts flow=new or flow=old into the address, so zc.js (previous screens) and pack/zc-flow.js (new screens) are not touched. */
(function () {
  try {
    var q = new URLSearchParams(location.search), f = q.get("flow"), KEY = "ctz-zcflow", s = null;
    try { s = localStorage.getItem(KEY); } catch (e) {}
    if (f === "new" || f === "old") { try { localStorage.setItem(KEY, f); } catch (e) {} }
    else { f = s === "old" ? "old" : "new"; q.set("flow", f); try { history.replaceState(null, "", location.pathname + "?" + q.toString() + location.hash); } catch (e) {} }
    window.CT_ZCFLOW = f;
  } catch (e) { /* the page then opens as before */ }
})();
