/* Corporate Tambola, Refer & earn. A sales partner's reference code is their mobile number; their unique link is /?ref=<code>.
   Anyone may join (a participant from their ticket, or anyone from this page). Nothing is shown to anyone but the partner themselves. */
(function () {
  const $app = document.getElementById("app");
  const q = new URLSearchParams(location.search);
  const BASE = (q.get("api") || "").replace(/\/$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: (k) => { try { localStorage.removeItem(k); } catch {} } };
  const api = async (method, path, body, key) => {
    const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-partner": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong."), { status: r.status });
    return j;
  };
  const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const day = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const S = { note: "", err: "", me: null, fresh: null };

  function shareBlock(code, link) {
    const text = "Corporate Tambola makes your company engagement unforgettable. Take a look: " + link;
    return `<div class="zlink" id="mylink">${esc(link)}</div>
      <p class="zsmall">Your reference code is your mobile number: <b>${esc(code)}</b>. Anyone who buys through your link is counted for you.</p>
      <button class="zbtn s" id="copy">Copy my link</button>
      <a class="zbtn s alt" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">Share on WhatsApp</a>`;
  }
  function pitch() {
    return `<div class="zcard"><h2>Refer &amp; earn</h2>
      <p style="margin:0 0 8px">Know a company that would love a live Tambola for its people? Tell them about Corporate Tambola. When they buy through your link, you earn a commission.</p>
      <ul class="zsmall" style="margin:0;padding-left:18px"><li>Your mobile number is your reference code.</li><li>You get your own link to share.</li><li>You can see your sales here. Buyers' details are never shown to you.</li><li>The commission is explained to every partner before the first payout.</li></ul></div>`;
  }
  function enrollView() {
    const phone = ls.get("ctz-phone") || "";
    const fromTicket = q.get("from") === "ticket";
    return `<div class="zhead"><b>Corporate Tambola</b></div>${pitch()}
      <div class="zcard zform"><h2>${fromTicket ? "Join as a sales partner" : "Join Refer &amp; earn"}</h2>
        <label for="ph">Your mobile number</label><input id="ph" inputmode="tel" autocomplete="tel" value="${esc(phone)}" placeholder="98765 43210">
        <label for="nm">Your name (optional)</label><input id="nm" autocomplete="name" maxlength="60">
        <label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;color:var(--ink)"><input type="checkbox" id="ok" style="width:auto;min-height:0;margin-top:3px"> <span>I would like to join Refer &amp; earn and receive updates about it on this mobile number.</span></label>
        ${S.err ? `<div class="zbanner bad" role="alert">${esc(S.err)}</div>` : ""}
        <button class="zbtn" id="join">Get my link</button>
        <p class="zsmall">Already joined? <a href="#" id="signin">Sign in with your partner key</a></p></div>`;
  }
  function signinView() {
    return `<div class="zhead"><b>Corporate Tambola</b></div><div class="zcard zform"><h2>Sign in</h2>
      <label for="pk">Your partner key</label><input id="pk" type="password" autocomplete="off" placeholder="ctp_…">
      ${S.err ? `<div class="zbanner bad" role="alert">${esc(S.err)}</div>` : ""}
      <button class="zbtn" id="go">Show my sales</button>
      <p class="zsmall">Lost your key? Write to us from the Contact page and we will help you after checking it is you.</p><p class="zsmall"><a href="#" id="back">Back</a></p></div>`;
  }
  function dashView() {
    const m = S.me; const t = m.totals;
    const fresh = S.fresh ? `<div class="zbanner ok">You are in. <b>Your partner key (shown only this once):</b><div class="mono" style="word-break:break-all;margin:6px 0">${esc(S.fresh)}</div>Keep it somewhere safe; you need it to see your sales.</div>` : "";
    const rows = m.sales.length ? `<table><tr><th>Date</th><th>Pack</th><th>Status</th><th>Commission</th></tr>${m.sales.map((s) => `<tr><td>${day(s.date)}</td><td>${s.pack ? "up to " + s.pack : "-"}</td><td>${statusText(s)}</td><td>${s.amount === null ? "to be announced" : inr(s.amount)}</td></tr>`).join("")}</table>` : `<p class="zsmall" style="margin:0">No sales yet. Share your link to get started.</p>`;
    return `<div class="zhead"><b>Corporate Tambola · Refer &amp; earn</b><button class="zsnd" id="out">Sign out</button></div>${fresh}
      ${m.state !== "active" ? `<div class="zbanner warn">Your partner account is paused. Please contact us.</div>` : ""}
      <div class="zcard"><h2>Your link</h2>${shareBlock(m.code, m.link)}</div>
      <div class="zgrid"><div class="zcard"><h2>Sales</h2><div class="zstat">${t.sales}</div></div><div class="zcard"><h2>Earned so far</h2><div class="zstat">${inr(t.accruedInr + t.paidInr)}</div><p class="zsmall" style="margin:4px 0 0">${t.paidInr ? inr(t.paidInr) + " paid" : "None paid yet"}</p></div></div>
      ${!m.rateAnnounced && t.waitingForRate ? `<div class="zbanner info">${t.waitingForRate} sale${t.waitingForRate === 1 ? " is" : "s are"} counted for you. The commission will be announced soon and applied to them.</div>` : ""}
      <div class="zcard"><h2>Your sales</h2>${rows}<p class="zsmall">A person who opens your link counts for ${m.attributionDays} days. Buyers' details are never shown.</p></div>`;
  }
  const statusText = (s) => ({ pending_rate: "Counted", accrued: "Earned", paid: "Paid", blocked: "Not counted (own purchase)", void: "Cancelled" }[s.status] || s.status);

  function draw(v) { $app.innerHTML = v; bind(); }
  function bind() {
    const $ = (id) => document.getElementById(id);
    if ($("copy")) $("copy").onclick = () => { try { navigator.clipboard.writeText(document.getElementById("mylink").textContent); $("copy").textContent = "Copied"; } catch {} };
    if ($("join")) $("join").onclick = async () => {
      S.err = "";
      if (!$("ok").checked) { S.err = "Please tick the box to join."; return draw(enrollView()); }
      $("join").disabled = true;
      try {
        const r = await api("POST", "/api/partner/enroll", { phone: $("ph").value, name: $("nm").value.trim(), consent: true, source: q.get("from") === "ticket" ? "ticket" : "direct" });
        if (r.partnerKey) { ls.set("ctz-pkey", r.partnerKey); S.fresh = r.partnerKey; await load(); }
        else { S.err = r.message || "This number is already enrolled."; draw(signinView()); }
      } catch (e) { S.err = e.message; draw(enrollView()); }
    };
    if ($("signin")) $("signin").onclick = (e) => { e.preventDefault(); S.err = ""; draw(signinView()); };
    if ($("back")) $("back").onclick = (e) => { e.preventDefault(); S.err = ""; draw(enrollView()); };
    if ($("go")) $("go").onclick = async () => { const k = $("pk").value.trim(); try { await api("GET", "/api/partner/me", undefined, k); ls.set("ctz-pkey", k); S.err = ""; S.fresh = null; await load(); } catch (e) { S.err = e.status === 403 ? "That key was not recognised." : e.message; draw(signinView()); } };
    if ($("out")) $("out").onclick = () => { ls.del("ctz-pkey"); S.me = null; S.fresh = null; draw(enrollView()); };
  }
  async function load() {
    const k = ls.get("ctz-pkey");
    if (!k) return draw(enrollView());
    try { S.me = await api("GET", "/api/partner/me", undefined, k); draw(dashView()); }
    catch (e) { if (e.status === 403) { ls.del("ctz-pkey"); draw(enrollView()); } else { $app.innerHTML = `<p class="zmsg">${esc(e.message)}</p>`; } }
  }
  load();
})();
