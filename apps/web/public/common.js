/* Shared browser helpers for all Corporate Tambola pages (vanilla JS, no build). Exposes window.TB. */
(function () {
  const TB = (window.TB = {});
  const $ = (id) => document.getElementById(id);
  TB.$ = $;
  TB.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  TB.ic = (n) => `<svg class="ic"><use href="#i-${n}"/></svg>`;
  TB.qs = (k) => new URLSearchParams(location.search).get(k);
  TB.pathPart = (i) => location.pathname.split("/").filter(Boolean)[i] || "";

  // ---- safe storage ----
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  TB.store = store;

  // ---- identity ----
  // Each browser has one random device secret. The server stores only its hash. Never put it in a URL.
  TB.device = () => {
    let d = store.get("tb_device");
    if (!d || d.length < 32) { d = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""); store.set("tb_device", d); }
    return d;
  };
  TB.orgToken = () => store.get("tb_org_token");
  TB.setOrgToken = (t) => (t ? store.set("tb_org_token", t) : store.del("tb_org_token"));

  // ---- API: TB.api(method, path, body, {org:true}) -> JSON, throws Error(message) with .status ----
  TB.api = async (method, path, body, opt = {}) => {
    const headers = { "content-type": "application/json", "x-device": TB.device() };
    if (window.TBV && !window.TBV.gpc) { headers["x-ct-vs"] = window.TBV.sid; if (window.TBV.vid) headers["x-ct-vid"] = window.TBV.vid; } // visit tracking on the public pages (v.js): lets the server tie an account to the visit that led to it
    const tok = opt.org ? TB.orgToken() : null;
    if (tok) headers.authorization = "Bearer " + tok;
    let res;
    try { res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch (e) { const err = new Error("Cannot reach the server. Check your internet and try again."); err.status = 0; throw err; }
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) { const err = new Error((data && data.error) || "Something went wrong. Please try again."); err.status = res.status; throw err; }
    return data;
  };

  // ---- WebSocket with automatic reconnect. TB.ws(code, {org:true}|{}, onMessage) -> {close()} ----
  TB.ws = (code, opt, onMsg, onState) => {
    let ws, closed = false, tries = 0;
    const open = () => {
      const q = opt.org ? `t=${encodeURIComponent(TB.orgToken() || "")}` : `d=${encodeURIComponent(TB.device())}`;
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?e=${encodeURIComponent(code)}&${q}`);
      ws.onopen = () => { tries = 0; onState && onState("open"); };
      ws.onmessage = (ev) => { try { onMsg(JSON.parse(ev.data)); } catch {} };
      ws.onclose = () => { onState && onState("closed"); if (!closed) setTimeout(open, Math.min(5000, 400 * ++tries)); };
    };
    open();
    return { send: (m) => ws && ws.readyState === 1 && ws.send(JSON.stringify(m)), close: () => { closed = true; ws && ws.close(); } };
  };

  // ---- toast with optional Undo, bottom sheet (no browser alert/confirm/prompt anywhere) ----
  let toastT = null;
  function ensureShell() {
    if (!$("toast")) { const t = document.createElement("div"); t.id = "toast"; t.className = "toast hidden"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    if (!$("modal")) {
      const m = document.createElement("div"); m.id = "modal"; m.className = "modal hidden";
      m.innerHTML = '<div class="sheet" id="sheet" role="dialog" aria-modal="true"></div>'; document.body.appendChild(m);
      m.addEventListener("click", (e) => { if (e.target.id === "modal") TB.closeSheet(); });
    }
  }
  TB.toast = (msg, undo) => {
    ensureShell();
    const t = $("toast");
    t.innerHTML = `<span>${msg}</span>` + (undo ? '<button id="undoB">Undo</button>' : "");
    t.classList.remove("hidden");
    clearTimeout(toastT);
    if (undo) $("undoB").onclick = () => { undo(); t.classList.add("hidden"); };
    toastT = setTimeout(() => t.classList.add("hidden"), undo ? 7000 : 3200);
  };
  TB.sheet = (html) => { ensureShell(); $("sheet").innerHTML = html; $("modal").classList.remove("hidden"); };
  TB.closeSheet = () => { ensureShell(); $("modal").classList.add("hidden"); };
  TB.copy = (text, msg) => { try { navigator.clipboard.writeText(text); } catch {} TB.toast(msg || "Copied"); };
  document.addEventListener("DOMContentLoaded", ensureShell);

  // ---- formatting ----
  TB.fmtT = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  TB.fmtD = (t) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  TB.fmtDT = (t) => new Date(t).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  TB.ago = (t) => { const s = Math.round((Date.now() - t) / 1000); if (s < 60) return "just now"; const m = Math.round(s / 60); return m < 60 ? m + " min ago" : Math.round(m / 60) + " h ago"; };
  TB.plural = (n, a, b) => n + " " + (n === 1 ? a : b || a + "s");
  TB.initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  TB.money = (n, cur) => cur === "INR" ? "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }) : "US$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  // [participants, INR price (no GST is charged), USD]. Mirror of packages/shared/src/pricing.ts.
  TB.GST_ON = false;
  TB.PACKS = [[100, 2399, 34], [250, 3499, 51], [500, 4699, 67], [750, 5899, 84], [1000, 7099, 101], [2500, 11799, 169], [5000, 17699, 253], [10000, 29499, 421]];
  TB.price = (pack, cur) => { const p = TB.PACKS.find((x) => x[0] === pack); if (cur === "INR") { const t = TB.GST_ON ? Math.round(p[1] * 0.18 * 100) / 100 : 0; return { total: Math.round((p[1] + t) * 100) / 100, base: p[1], tax: t }; } return { total: p[2], base: p[2], tax: 0 }; };
  TB.guessCurrency = () => { try { return /^Asia\/(Kolkata|Calcutta)$/.test(Intl.DateTimeFormat().resolvedOptions().timeZone) ? "INR" : "USD"; } catch { return "USD"; } };

  // ---- countries (dial codes shown in the number field; the server does the real validation) ----
  TB.COUNTRIES = [["IN", "India", 91], ["AE", "United Arab Emirates", 971], ["US", "United States", 1], ["GB", "United Kingdom", 44], ["SG", "Singapore", 65], ["AU", "Australia", 61], ["CA", "Canada", 1],
    ["SA", "Saudi Arabia", 966], ["QA", "Qatar", 974], ["KW", "Kuwait", 965], ["OM", "Oman", 968], ["BH", "Bahrain", 973], ["NP", "Nepal", 977], ["BD", "Bangladesh", 880], ["LK", "Sri Lanka", 94],
    ["MY", "Malaysia", 60], ["ZA", "South Africa", 27], ["KE", "Kenya", 254], ["NG", "Nigeria", 234], ["DE", "Germany", 49], ["FR", "France", 33], ["NL", "Netherlands", 31], ["NZ", "New Zealand", 64],
    ["IE", "Ireland", 353], ["PH", "Philippines", 63], ["ID", "Indonesia", 62], ["PK", "Pakistan", 92], ["JP", "Japan", 81], ["CN", "China", 86], ["HK", "Hong Kong", 852], ["TH", "Thailand", 66]];
  TB.countryOpts = (sel) => TB.COUNTRIES.map(([c, n, d]) => `<option value="${c}" ${c === sel ? "selected" : ""}>${TB.esc(n)} (+${d})</option>`).join("");
  TB.guessCountry = () => { try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; if (/Calcutta|Kolkata/.test(tz)) return "IN"; if (/Dubai/.test(tz)) return "AE"; if (/London/.test(tz)) return "GB"; if (/Singapore/.test(tz)) return "SG"; if (/^Australia\//.test(tz)) return "AU"; if (/^America\//.test(tz)) return "US"; } catch {} return "IN"; };

  // ---- thin client: service worker that downloads the app once and keeps it (see sw.js) ----
  // TB.sw.start(group, cb): cb({state:'unsupported'|'checking'|'downloading'|'ready'|'error', pct, bytesTotal}) on every change.
  TB.sw = {
    state: "idle", pct: 0, bytesTotal: 0, listeners: [],
    on(cb) { TB.sw.listeners.push(cb); cb({ state: TB.sw.state, pct: TB.sw.pct, bytesTotal: TB.sw.bytesTotal }); },
    emit(o) { Object.assign(TB.sw, o); TB.sw.listeners.forEach((f) => { try { f({ state: TB.sw.state, pct: TB.sw.pct, bytesTotal: TB.sw.bytesTotal }); } catch {} }); },
    async start(group) {
      if (!("serviceWorker" in navigator) || !window.caches) { TB.sw.emit({ state: "unsupported", pct: 100 }); return; }
      TB.sw.emit({ state: "checking", pct: 0 });
      navigator.serviceWorker.addEventListener("message", (ev) => {
        const m = ev.data || {};
        if (m.type !== "tb-sw") return;
        if (m.state === "error") return TB.sw.emit({ state: "error" });
        const pct = m.bytesTotal ? Math.min(100, Math.round((m.bytesDone / m.bytesTotal) * 100)) : 100;
        TB.sw.emit({ state: m.state, pct: m.state === "ready" ? 100 : pct, bytesTotal: m.bytesTotal || 0 });
      });
      try {
        await navigator.serviceWorker.register("/sw.js");
        const reg = await navigator.serviceWorker.ready;
        try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {} // ask the browser to keep the app (not clear it when storage is low)
        const target = reg.active || navigator.serviceWorker.controller;
        if (target) target.postMessage({ type: "ensure", groups: ["core", group] });
      } catch { TB.sw.emit({ state: "error" }); }
    },
  };

  // ---- payments: Razorpay Checkout (the brand is the checkout name). The SERVER verifies the payment; the browser only reports it. ----
  TB.pay = (rz, paymentId) => new Promise((resolve, reject) => {
    const open = () => {
      try {
        const box = new window.Razorpay({
          key: rz.keyId, order_id: rz.orderId, amount: rz.amount, currency: rz.currency, name: rz.name, description: rz.description, prefill: rz.prefill, notes: rz.notes, theme: rz.theme, ...(rz.config ? { config: rz.config } : {}),
          handler: async (resp) => {
            try { resolve(await TB.api("POST", "/api/payments/verify", { paymentId, razorpay_order_id: resp.razorpay_order_id, razorpay_payment_id: resp.razorpay_payment_id, razorpay_signature: resp.razorpay_signature })); }
            catch (e) { reject(e); }
          },
          modal: { ondismiss: () => reject(Object.assign(new Error("Payment was cancelled. Nothing was charged."), { cancelled: true })) },
        });
        box.on && box.on("payment.failed", (r) => reject(new Error((r && r.error && r.error.description) || "The payment failed. Nothing was charged.")));
        box.open();
      } catch (e) { reject(new Error("Could not open the payment window. Please try again.")); }
    };
    if (window.Razorpay) return open();
    const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = open; s.onerror = () => reject(new Error("Could not reach the payment service. Check your internet and try again."));
    document.head.appendChild(s);
  });

  TB.QR = (el, text) => { /* optional: uses qrcodejs if the page loaded it */ if (window.QRCode && el) { el.innerHTML = ""; new window.QRCode(el, { text, width: 140, height: 140 }); } };
})();
