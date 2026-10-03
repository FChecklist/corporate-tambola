/* Corporate Tambola: saves the whole game on this device (service worker) and offers "Add to home screen".
   Everything here runs in the visitor's own browser. */
(function () {
  if (window.__ctPwa) return;
  window.__ctPwa = true;
  let bar = null, deferred = null, saved = false;
  const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  function close() { if (bar) bar.remove(); bar = null; }
  function render() {
    if (!document.body) return;
    if (standalone() && saved) return close();
    if (!bar) {
      bar = document.createElement("div");
      bar.setAttribute("role", "status");
      bar.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:50;background:#0B3D91;color:#fff;border-radius:12px;padding:8px 12px;font:600 13px/1.35 system-ui,sans-serif;display:flex;gap:10px;align-items:center;justify-content:space-between;box-shadow:0 2px 12px rgba(0,0,0,.25)";
      document.body.appendChild(bar);
    }
    bar.textContent = "";
    const msg = document.createElement("span");
    msg.textContent = saved ? "Game saved on this device. It works even with weak signal." : "Saving the game on this device...";
    bar.appendChild(msg);
    if (deferred) {
      const b = document.createElement("button");
      b.textContent = "Install app";
      b.style.cssText = "all:unset;cursor:pointer;background:#C9A24A;color:#1b1b1b;padding:6px 12px;border-radius:8px";
      b.onclick = async () => { const d = deferred; deferred = null; d.prompt(); try { await d.userChoice; } catch (e) {} render(); };
      bar.appendChild(b);
    } else if (ios && !standalone()) {
      const t = document.createElement("span");
      t.style.fontWeight = "500";
      t.textContent = "To install: tap Share, then Add to Home Screen";
      bar.appendChild(t);
    }
    const x = document.createElement("button");
    x.setAttribute("aria-label", "Close");
    x.textContent = "✕";
    x.style.cssText = "all:unset;cursor:pointer;padding:2px 6px";
    x.onclick = close;
    bar.appendChild(x);
    if (saved && !deferred && !ios) setTimeout(() => { if (!deferred) close(); }, 6000);
  }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; render(); });
  window.addEventListener("appinstalled", () => { deferred = null; render(); });
  if (!("serviceWorker" in navigator) || !window.caches) return;
  navigator.serviceWorker.addEventListener("message", (ev) => {
    const m = ev.data || {};
    if (m.type === "ct-sw" && m.state === "ready") { saved = true; render(); }
  });
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/zsw.js");
      const reg = await navigator.serviceWorker.ready;
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
      if (reg.active) reg.active.postMessage({ type: "status" });
    } catch (e) {}
  });
})();
