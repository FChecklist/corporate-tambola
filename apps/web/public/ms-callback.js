/* Where Microsoft sends the sign-in window back to. It hands the one-time code and the state to the page that opened it (same site only) and closes. Nothing is stored. */
(function () {
  const q = new URLSearchParams(location.search);
  try { if (window.opener) window.opener.postMessage({ type: "ms-code", code: q.get("code") || "", state: q.get("state") || "" }, location.origin); } catch {}
  try { history.replaceState(null, "", "/ms-callback.html"); } catch {}
  setTimeout(() => { try { window.close(); } catch {} }, 150);
})();
