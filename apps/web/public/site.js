/* Corporate Tambola public website: pricing, checkout, organizer login. Vanilla JS; needs common.js (window.TB). */
(function () {
  const $ = TB.$, esc = TB.esc, ic = TB.ic;
  const nf = (n) => Number(n).toLocaleString("en-IN");
  const S = { cur: TB.guessCurrency(), pack: 1000 };
  const FREE = { on: true, cap: 1e9 }; // the process: sign in, build the engagement, pay only when publishing
  let ORDER = null;

  // ---------- price display ----------
  function breakdown(pack, cur) {
    const x = TB.price(pack, cur);
    return cur === "INR"
      ? `<span>Software <b>${TB.money(x.base, "INR")}</b></span><span>GST 18% <b>${TB.money(x.tax, "INR")}</b></span><span>Total <b>${TB.money(x.total, "INR")}</b></span>`
      : `<span>Total <b>${TB.money(x.total, "USD")}</b></span><span>No tax added · billed in US dollars</span>`;
  }
  function renderPrices() {
    document.querySelectorAll("[data-cur]").forEach((el) => {
      el.innerHTML = ["INR", "USD"].map((k) => `<button type="button" class="${S.cur === k ? "on" : ""}" aria-pressed="${S.cur === k}" data-c="${k}">${k === "INR" ? "₹ INR" : "US$"}</button>`).join("");
    });
    $("pack").innerHTML = TB.PACKS.map(([n]) => `<option value="${n}" ${n === S.pack ? "selected" : ""}>Up to ${nf(n)} participants</option>`).join("");
    $("heroBrk").innerHTML = breakdown(S.pack, S.cur);
    $("packs").innerHTML = TB.PACKS.map(([n]) => {
      const x = TB.price(n, S.cur);
      return `<div class="pack"><span class="up">Up to</span><span class="n">${nf(n)} participants</span><span class="tot">${TB.money(x.total, S.cur)}</span><div class="brk">${breakdown(n, S.cur)}</div>${`<button type="button" class="btn ${n === S.pack ? "" : "line"}" data-buy="${n}" aria-label="Create an engagement for up to ${nf(n)} participants">Create Engagement ${ic("arrow")}</button>`}</div>`;
    }).join("");
    if (FREE.on) { $("priceNote").textContent = "You build your engagement first, at no cost. Payment is asked only when you publish it. " + (S.cur === "INR" ? "Prices in Indian rupees include 18% GST." : "Prices in US dollars. No tax added."); return; }
    $("priceNote").textContent = S.cur === "INR" ? "Prices in Indian rupees include 18% GST. Billed in India." : "Prices in US dollars. No tax added. Billed outside India.";
  }
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-c]"); if (c) { S.cur = c.dataset.c; renderPrices(); if ($("ordSum")) sumRefresh(); return; }
    const b = e.target.closest("[data-buy]"); if (b) { S.pack = +b.dataset.buy; renderPrices(); openCheckout(S.pack); return; }
    if (e.target.closest("[data-close]")) TB.closeSheet();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") TB.closeSheet(); });
  $("pack").addEventListener("change", (e) => { S.pack = +e.target.value; renderPrices(); });
  $("payBtn").addEventListener("click", () => openCheckout(S.pack));
  $("loginLink").addEventListener("click", (e) => { e.preventDefault(); openLogin(""); });

  // ---------- helpers ----------
  const xbtn = `<button type="button" class="xbtn" data-close aria-label="Close">${ic("x")}</button>`;
  const err = (t) => `<div class="err" role="alert">${ic("alert")}<span>${esc(t)}</span></div>`;
  const setErr = (t) => { $("fErr").innerHTML = t ? err(t) : ""; };
  const focusFirst = (id) => setTimeout(() => { const el = $(id); if (el) el.focus(); }, 60);
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.dataset.l = btn.dataset.l || btn.innerHTML; btn.innerHTML = on ? label : btn.dataset.l || btn.innerHTML; }

  // ---------- checkout ----------
  function sumHTML(pack, cur) {
    const x = TB.price(pack, cur);
    return cur === "INR"
      ? `<div class="kv"><span>Software</span><b>${TB.money(x.base, cur)}</b></div><div class="kv"><span>GST 18%</span><b>${TB.money(x.tax, cur)}</b></div><div class="kv t"><span>Total</span><b>${TB.money(x.total, cur)}</b></div>`
      : `<div class="kv"><span>Software</span><b>${TB.money(x.base, cur)}</b></div><div class="kv"><span>Tax</span><b>None added</b></div><div class="kv t"><span>Total</span><b>${TB.money(x.total, cur)}</b></div><p class="tiny muted" style="margin:0 0 10px">No tax added · billed in US dollars</p>`;
  }
  function sumRefresh() { $("ordSum").innerHTML = sumHTML(ORDER.pack, S.cur); }
  function taxField() {
    const c = $("oCty").value, india = c === "IN";
    $("taxBox").innerHTML = india
      ? `<label class="lb" for="oGst">GSTIN (for your GST invoice)</label><input class="inp" id="oGst" maxlength="15" autocomplete="off" placeholder="e.g. 27ABCDE1234F1Z5" style="text-transform:uppercase">`
      : `<label class="lb" for="oGst">Company tax / VAT number (optional)</label><input class="inp" id="oGst" maxlength="30" autocomplete="off" placeholder="Shown on your invoice">`;
    S.cur = india ? "INR" : "USD"; renderPrices(); sumRefresh();
  }
  function openCheckout(pack) {
    if (FREE.on) return openFree();
    ORDER = { pack };
    const def = TB.guessCountry();
    TB.sheet(`${xbtn}<div class="eyebrow">Your order</div><h2>Up to ${nf(pack)} participants</h2>
      <ul class="facts"><li>${ic("ticket")}Every participant gets their own ticket on their phone</li><li>${ic("phone")}Mobile number only. No SMS, no app, no password for participants</li><li>${ic("users")}A private engagement for your closed group, in any country</li><li>${ic("gift")}Participants never pay. You give the rewards</li></ul>
      <div class="sum" id="ordSum"></div>
      <form id="coForm" novalidate>
        <label class="lb" for="oName">Organization name</label><input class="inp" id="oName" autocomplete="organization" placeholder="e.g. Acme Industries">
        <label class="lb" for="oMail">Your work email (invoice and login)</label><input class="inp" id="oMail" type="email" autocomplete="email" placeholder="you@company.com">
        <label class="lb" for="oPh">Your mobile number (optional)</label><input class="inp" id="oPh" type="tel" autocomplete="tel" placeholder="98765 43210">
        <label class="lb" for="oCty">Country of your organization</label><select class="inp" id="oCty">${TB.countryOpts(def)}</select>
        <div id="taxBox"></div><div id="fErr"></div>
        <button class="btn block" style="margin-top:16px" type="submit" id="payGo">${ic("lock")} ${PAYMODE === "razorpay" ? "Pay securely with Razorpay" : PAYMODE === "off" ? "Payments are not switched on yet" : "Pay (local test payment)"}</button>
      </form>
      <p class="proto">${PAYMODE === "razorpay" ? "Secure payment by Razorpay. Unused places are not refunded. A GST invoice is emailed to you." : "Local test payment: no real money is taken. Unused places are not refunded."}</p>`);
    $("oCty").addEventListener("change", taxField);
    $("coForm").addEventListener("submit", (e) => { e.preventDefault(); pay(); });
    taxField(); focusFirst("oName");
  }
  // ---------- refer & earn: remember who sent this visitor for 30 days (kept in this browser only) ----------
  const REF = (() => {
    try {
      const p = new URLSearchParams(location.search).get("ref"); const d = p ? p.replace(/\D/g, "").slice(-10) : "";
      if (d.length === 10) localStorage.setItem("ctz-ref", JSON.stringify({ code: d, at: Date.now() }));
      const v = JSON.parse(localStorage.getItem("ctz-ref") || "null");
      if (v && Date.now() - v.at < 30 * 86400000) return v.code;
      localStorage.removeItem("ctz-ref");
    } catch {}
    return "";
  })();
  if (REF) TB.api("GET", "/api/partner/check?code=" + REF).then((r) => { if (!r.valid) { try { localStorage.removeItem("ctz-ref"); } catch {} } }).catch(() => {});
  let PAYMODE = "test"; // razorpay | test | off, from the server
  TB.api("GET", "/api/payments/status").then((s) => { PAYMODE = s.mode; }).catch(() => {});
  // ---------- free launch: create an organizer account with a work email; the key arrives only through the e-mailed code ----------
  function openFree() {
    TB.sheet(`${xbtn}<div class="eyebrow">Build it first. Pay when you publish.</div><h2>Create your engagement</h2>
      <ul class="facts"><li>${ic("ticket")}Every participant gets their own ticket on their phone</li><li>${ic("phone")}Mobile number only. No SMS, no app, no password for participants</li><li>${ic("gift")}Participants never pay. You give the rewards</li><li>${ic("users")}Free AI assistant for you, the organizer</li></ul>
      <form id="frForm" novalidate><label class="lb" for="fMail">Your work email</label><input class="inp" id="fMail" type="email" autocomplete="email" placeholder="you@company.com"><div id="fErr"></div>
      <button class="btn block" style="margin-top:14px" type="submit" id="frGo">Create my engagement ${ic("arrow")}</button></form>
      <p class="proto">Your console opens straight away: no password and no waiting for an email. Your email is used for your invoice and to sign you back in later.</p>`);
    $("frForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const m = $("fMail").value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)) return setErr("Please enter a valid work email.");
      const b = $("frGo"); b.disabled = true; setErr("");
      try {
        const r = await TB.api("POST", "/api/start", { email: m });
        if (r.exists) { TB.toast("You already have an account, so we are emailing you a code to confirm it is you"); return askCode(m, b); }
        try { sessionStorage.setItem("ctz-org", r.token); sessionStorage.setItem("ctz-aimsg", r.aiMessage); sessionStorage.setItem("ctz-email", m); } catch {}
        location.href = "/zc.html";
      } catch (x) { b.disabled = false; setErr(x.message); }
    });
    focusFirst("fMail");
  }
  async function pay() {
    const org = $("oName").value.trim(), email = $("oMail").value.trim().toLowerCase(), country = $("oCty").value, taxId = $("oGst").value.trim().toUpperCase();
    if (org.length < 2) return setErr("Please enter your organization name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setErr("Please enter a valid work email.");
    if (country === "IN" && !taxId) return setErr("Please enter your GSTIN.");
    if (country === "IN" && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(taxId)) return setErr("This GSTIN does not look right. It has 15 characters, like 27ABCDE1234F1Z5.");
    setErr("");
    const btn = $("payGo"); btn.disabled = true; const keep = btn.innerHTML; btn.textContent = "Processing…";
    try {
      let r = await TB.api("POST", "/api/checkout", { org, email, country, taxId, pack: ORDER.pack, currency: S.cur, ref: (() => { try { const v = JSON.parse(localStorage.getItem("ctz-ref") || "null"); return v && Date.now() - v.at < 30 * 86400000 ? v.code : ""; } catch { return ""; } })(), phone: ($("oPh") ? $("oPh").value.trim() : "") });
      if (r.mode === "razorpay") r = await TB.pay(r.razorpay, r.paymentId); // opens Razorpay Checkout; the server verifies the payment
      else if (r.result) r = Object.assign({ mode: r.mode }, r.result); // local test mode answers with the finished order
      ORDER = Object.assign(ORDER, { org, email, mode: r.mode }, r);
      done();
    } catch (e) { setErr(e.message); btn.disabled = false; btn.innerHTML = keep; }
  }
  function done() {
    const o = ORDER;
    TB.sheet(`${xbtn}<div class="res ok">${ic("check")}</div><h2 class="center">Your engagement is ready</h2>
      <div class="sum"><div class="kv"><span>Order</span><b class="mono">${esc(o.orderId)}</b></div><div class="kv"><span>Organization</span><b>${esc(o.org)}</b></div><div class="kv"><span>Participants</span><b>Up to ${nf(o.pack)}</b></div><div class="kv t"><span>${o.mode === "test" ? "Paid (test)" : "Paid"}</span><b>${TB.money(o.total, o.currency)}</b></div>${o.invoiceNumber ? `<div class="kv"><span>Invoice</span><b class="mono"><a href="${esc(o.invoiceUrl)}" target="_blank" rel="noopener">${esc(o.invoiceNumber)}</a></b></div>` : ""}</div>
      ${o.organizerKey ? `<div class="note info" role="note"><b>Your organizer key</b> (shown only once, and we have emailed it to you):<div class="mono" id="orgKey" style="word-break:break-all;margin:6px 0">${esc(o.organizerKey)}</div><button class="btn sm" type="button" id="cpKey">Copy key</button></div>` : `<p class="small muted center">You already have an organizer key. Sign in with your work email to continue.</p>`}
      <p class="small muted center">Next step: open your console to set the date, add participants and share the link. We sent the details and your invoice to <b>${esc(o.email)}</b>.</p>
      <div id="fErr"></div>
      <button class="btn block" id="toLogin" type="button">Open my console ${ic("arrow")}</button>`);
    const cp = $("cpKey"); if (cp) cp.addEventListener("click", () => { try { navigator.clipboard.writeText(o.organizerKey); TB.toast("Key copied"); } catch {} });
    $("toLogin").addEventListener("click", () => { if (o.organizerKey) { try { sessionStorage.setItem("ctz-org", o.organizerKey); } catch {} location.href = "/zc.html"; } else askCode(o.email, $("toLogin")); });
  }

  // ---------- login ----------
  function openLogin(email) {
    TB.sheet(`${xbtn}<div class="eyebrow">Organizer login</div><h2>Sign in with your work email</h2><p class="muted small">Participants never log in here. They join with your link. We email you a 6-digit code: no password.</p>
      <form id="lgForm" novalidate><label class="lb" for="lMail">Work email</label><input class="inp" id="lMail" type="email" autocomplete="email" placeholder="you@company.com" value="${esc(email || "")}"><div id="fErr"></div>
      <button class="btn block" style="margin-top:14px" type="submit" id="lgGo">Email me a code ${ic("arrow")}</button></form>`);
    $("lgForm").addEventListener("submit", (e) => { e.preventDefault(); const m = $("lMail").value.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)) return setErr("Please enter a valid work email."); askCode(m, $("lgGo")); });
    focusFirst("lMail");
  }
  async function askCode(email, btn) {
    if (btn) { btn.disabled = true; }
    try {
      const r = await TB.api("POST", "/api/auth/email", { email });
      codeView(email, r.devCode);
    } catch (e) { if (btn) btn.disabled = false; const f = $("fErr"); if (f) f.innerHTML = err(e.message); else TB.toast(esc(e.message)); }
  }
  function codeView(email, devCode) {
    TB.sheet(`${xbtn}<div class="eyebrow">Check your inbox</div><h2>Enter the 6-digit code</h2><p class="muted small">In production the code arrives by email at <b>${esc(email)}</b> and works for 10 minutes.</p>
      ${devCode ? `<div class="note info devcode" role="note"><span>Local test mode: your code is <b>${esc(devCode)}</b></span><button type="button" class="btn sm" id="useCode">Use this code</button></div>` : ""}
      <form id="cdForm" novalidate><label class="lb" for="lCode">6-digit code</label><input class="inp mono codein" id="lCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-describedby="fErr"><div id="fErr"></div>
      <button class="btn block" style="margin-top:14px" type="submit" id="cdGo">Sign in</button></form>
      <button class="btn line block" style="margin-top:8px" type="button" id="resend">Send a new code</button>`);
    const verify = async () => {
      const code = $("lCode").value.replace(/\D/g, "");
      if (code.length !== 6) return setErr("Enter the 6-digit code.");
      const b = $("cdGo"); b.disabled = true; setErr("");
      try {
        const r = await TB.api("POST", "/api/auth/verify", { email, code });
        try { sessionStorage.setItem("ctz-org", r.token); } catch {} location.href = "/zc.html";
      } catch (e) { b.disabled = false; setErr(e.message); }
    };
    $("cdForm").addEventListener("submit", (e) => { e.preventDefault(); verify(); });
    $("resend").addEventListener("click", () => askCode(email, $("resend")));
    const u = $("useCode"); if (u) u.addEventListener("click", () => { $("lCode").value = devCode; verify(); });
    focusFirst("lCode");
  }

  // ---------- init ----------
  renderPrices();
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let wi = 0; const tick = () => { const L = document.querySelectorAll("#whoL li"); L.forEach((l, i) => l.classList.toggle("on", i === wi % L.length)); wi++; };
    tick(); setInterval(tick, 1300);
    let bb = 0; setInterval(() => { bb = (bb + 2) % 102; const e = $("bbp"); if (e) e.style.setProperty("--p", bb + "%"); }, 200);
  }
  const hashLogin = () => { if (location.hash === "#login") openLogin(""); };
  window.addEventListener("hashchange", hashLogin); hashLogin();
})();
