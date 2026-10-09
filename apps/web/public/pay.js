/* Corporate Tambola: the page where an organizer pays to publish a draft engagement. Opens after they confirm their email and mobile number.
   The organizer key comes from this browser tab (set when the console was opened). The SERVER decides the pack and verifies the payment. */
(function () {
  const TB = window.TB, esc = TB.esc, $app = document.getElementById("app");
  const eid = TB.qs("e") || "";
  let secret = ""; try { secret = sessionStorage.getItem("ctz-org") || ""; } catch {}
  const ss = (k) => { try { return sessionStorage.getItem(k) || ""; } catch { return ""; } };
  const nf = (n) => Number(n).toLocaleString("en-IN");
  const S = { credited: 0, info: null, mode: "", cur: "INR", err: "", busy: false, done: null, email: ss("ctz-email"), phone: ss("ctz-phone"), name: ss("ctz-name"), pcode: "91", country: "IN" }; // India and +91 unless they change them: fewest taps to pay
  S.cur = S.country === "IN" ? "INR" : "USD";

  const call = async (method, path, body) => {
    const r = await fetch(path, { method, headers: { "content-type": "application/json", "x-organizer": secret }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong. Please try again."), { status: r.status });
    return j;
  };
  const head = `<div class="zhead"><b>Corporate Tambola · Publish engagement</b><a class="zsnd" href="/zc.html?e=${encodeURIComponent(eid)}" style="text-decoration:none">Back to my engagement</a></div>`;
  const packFor = (cap) => { const p = TB.PACKS.find((x) => x[0] >= cap); return p ? p[0] : null; };

  function view() {
    if (!secret) return `${head}<div class="zcard"><h2>Please sign in first</h2><p class="zsmall" style="margin-top:0">Open your console from the home page, or sign in with your work email: we send you a 6-digit code.</p><a class="zbtn" href="/#login" id="goLogin" style="text-decoration:none;display:inline-block">Sign in with email</a></div>`;
    if (S.done) {
      const d = S.done;
      return `${head}<div class="zcard" style="border:2px solid #2e7d4f"><h2>Payment received. Your engagement will begin on time.</h2>
        <p style="margin:0 0 10px">${d.paidFromCredit ? "Paid from your credit. " : ""}Thank you. Your engagement for up to <b>${nf(d.pack)}</b> participants is confirmed.${d.restartedAtMs ? ` It begins at <b>${esc(new Date(d.restartedAtMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))}</b>, for everyone already waiting.` : " Share the link with your participants from your console if you have not already."}</p>
        ${d.invoiceUrl ? `<p class="zsmall"><a href="${esc(d.invoiceUrl)}" target="_blank" rel="noopener">View your invoice ${esc(d.invoiceNumber || "")}</a>. We also emailed it to you.</p>` : ""}
        <a class="zbtn" href="/zc.html?e=${encodeURIComponent(d.eid || eid)}" style="text-decoration:none;display:inline-block">Open my engagement</a></div>`;
    }
    if (!S.info) return `${head}<p class="zmsg">${S.err ? esc(S.err) : "Loading…"}</p>`;
    const pack = packFor(S.info.cap);
    if (!S.info.draft && !S.info.unpaid) return `${head}<div class="zcard"><h2>This engagement is already paid and published</h2><a class="zbtn" href="/zc.html?e=${encodeURIComponent(eid)}" style="text-decoration:none;display:inline-block">Open my engagement</a></div>`;
    if (!pack) return `${head}<div class="zcard"><h2>A custom arrangement is needed</h2><p class="zsmall" style="margin-top:0">An engagement for more than 10,000 participants is arranged with us directly. Please write to us from the contact page.</p></div>`;
    const x = TB.price(pack, S.cur);
    const applied = S.cur === "INR" ? Math.max(Number(S.credited) || 0, Number(S.info.creditApplied) || 0) : 0; // credit already put on this game (by you, or by a Host); it comes off what you pay
    const toPay = Math.max(0, Math.round((x.total - applied) * 100) / 100);
    const avail = S.cur === "INR" && !applied && Number(S.info.credit) > 0 ? Number(S.info.credit) : 0;
    const until = S.info.creditExpiresMs ? new Date(S.info.creditExpiresMs - 1).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }) : "";
    const sum = (S.cur === "INR"
      ? `<div class="zrow"><span><b>Total</b></span><em><b>${TB.money(x.total, "INR")}</b></em></div>`
      : `<div class="zrow"><span><b>Total</b></span><em><b>${TB.money(x.total, "USD")}</b></em></div><p class="zsmall">No tax added. Billed in US dollars.</p>`)
      + (applied ? `<div class="zrow"><span>Your credit used</span><em>- ${TB.money(applied, "INR")}</em></div><div class="zrow"><span><b>To pay now</b></span><em><b>${TB.money(toPay, "INR")}</b></em></div>` : "");
    const off = S.mode === "off";
    return `${head}
      ${off ? `<div class="zbanner info"><b>Online payment opens soon.</b> Your engagement is saved and nothing is lost. Come back to this page when payment is switched on. Until then it stays held at its start time.</div>` : ""}
      <div class="zcard"><h2>Your order</h2>
        <div class="zrow"><span>Engagement</span><em>${esc(eid)}</em></div>
        <div class="zrow"><span>Participants</span><em>Up to ${nf(pack)}</em></div>${sum}
        <p class="zsmall">Every participant gets their own ticket on their phone. Participants never pay: you give the rewards. We do not give refunds. If you cancel a paid game before it starts, your payment stays as credit for your next game for 365 days. Unused credit lapses at the end of day 365. The credit belongs to your organizer account.</p>${S.info.startMs ? `<p class="zsmall"><b>Payment pending.</b> The game does not begin until it is paid for. Starts ${esc(new Date(S.info.startMs).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}. You can pay at any time until the guest data is erased${S.info.erasureMs ? ` (${esc(new Date(S.info.erasureMs).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))})` : ""}.${S.info.locked ? " It is waiting for your payment now: pay and it starts 2 minutes after your payment is confirmed." : " If you pay after the start time, it starts 2 minutes after your payment is confirmed."}</p>` : ""}</div>
      ${avail ? `<div class="zcard" style="border:2px solid #2e7d4f"><h2>Use your credit</h2><p class="zsmall" style="margin-top:0">You have credit of <b>${TB.money(avail, "INR")}</b>${until ? ` (valid until ${esc(until)})` : ""}. Use it for this game.</p>${S.err && S.creditErr ? `<div class="zbanner bad">${esc(S.err)}</div>` : ""}<button class="zbtn" id="usecredit" ${S.busy ? "disabled" : ""}>Use my credit</button></div>` : ""}
      <div class="zcard zform"><h2>Billing details</h2>
        <label for="nm">Name</label><input id="nm" autocomplete="name" value="${esc(S.name || "")}" placeholder="Your full name">
        <label for="em">Email (your invoice comes here)</label><input id="em" type="email" autocomplete="email" value="${esc(S.email)}" placeholder="you@company.com">
        <label for="ph">Mobile <span class="zsmall" style="display:inline">(optional)</span></label>
        <div style="display:flex;gap:8px"><select id="pcode" aria-label="Country code" style="flex:0 0 112px">${TB.COUNTRIES.map(([c, n, d]) => `<option value="${d}" ${String(d) === String(S.pcode) ? "selected" : ""}>${c} +${d}</option>`).join("")}</select><input id="ph" type="tel" autocomplete="tel-national" value="${esc(S.phone)}" placeholder="98765 43210" style="flex:1;min-width:0"></div>
        <label for="org">Organization name <span class="zsmall" style="display:inline">(optional)</span></label><input id="org" autocomplete="organization" value="${esc(S.org || "")}" placeholder="e.g. Acme Industries">
        <label for="cty">Country of your organization <span class="zsmall" style="display:inline">(optional)</span></label><select id="cty">${TB.countryOpts(S.country)}</select>
        ${S.country === "IN" ? "" : `<label for="tax">Company tax / VAT number <span class="zsmall" style="display:inline">(optional)</span></label><input id="tax" autocomplete="off" maxlength="30" value="${esc(S.tax || "")}" placeholder="Shown on your invoice" style="text-transform:uppercase">`}
        ${S.err ? `<div class="zbanner bad">${esc(S.err)}</div>` : ""}${S.busy ? `<div class="zbanner info" role="status">Confirming your payment with Razorpay. Please keep this page open. Your game starts only after Razorpay confirms.</div>` : ""}
        <button class="zbtn" id="paygo" ${off || S.busy ? "disabled" : ""}>${S.busy ? "Confirming your payment…" : off ? "Payment opens soon" : "Pay " + TB.money(applied ? toPay : x.total, S.cur) + " securely with Razorpay"}</button>
        <p class="zsmall">Secure payment by Razorpay. Payment to <a href="https://itservices-rajat-agarwal.pages.dev/" rel="noopener" target="_blank">IT Services by Rajat Agarwal</a>. An invoice is emailed to you. See the <a href="/legal.html#privacy">privacy policy</a>.</p></div>`;
  }
  // The server answers 202 {confirming:true} while Razorpay still says the payment is only created or authorized. We ask every 4 seconds, for up to 5 minutes, until the game itself says Paid.
  async function waitForConfirm(first) {
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      await new Promise((ok) => setTimeout(ok, 4000));
      let st = null;
      try { st = (await call("GET", `/api/z/${eid}/summary`)).payment; } catch { try { st = (await call("GET", `/api/z/${eid}/cohost`)).payment; } catch { /* keep asking */ } }
      if (st && st.status === "paid") return { ok: true, eid, pack: (S.info && packFor(S.info.cap)) || 0, total: 0, currency: S.cur };
    }
    throw new Error("We are still waiting for Razorpay to confirm your payment. Nothing is lost: your game starts as soon as it is confirmed. You can close this page and open your game to see the status.");
  }
  function draw() { $app.innerHTML = view(); bind(); }
  function keep() { const g = (id) => { const e = document.getElementById(id); return e ? e.value : undefined; }; const v = { name: g("nm"), org: g("org"), tax: g("tax"), email: g("em"), phone: g("ph"), pcode: g("pcode") }; for (const k in v) if (v[k] !== undefined) S[k] = v[k]; }

  function bind() {
    const $ = (id) => document.getElementById(id);
    if ($("cty")) $("cty").onchange = () => { keep(); S.country = $("cty").value; S.cur = S.country === "IN" ? "INR" : "USD"; draw(); };
    if ($("goLogin")) $("goLogin").onclick = () => { try { sessionStorage.setItem("ctz-next", "/pay.html?e=" + encodeURIComponent(eid)); } catch {} };
    if ($("usecredit")) $("usecredit").onclick = async () => {
      S.err = ""; S.creditErr = false; S.busy = true; draw();
      try {
        const r = await call("POST", `/api/z/${encodeURIComponent(eid)}/pay-with-credit`, {});
        S.credited = r.usedInr || 0;
        if (r.paid) S.done = { ok: true, eid, pack: packFor(S.info.cap) || 0, paidFromCredit: true, restartedAtMs: r.restartedAtMs || null };
        else S.info.creditApplied = r.usedInr; // the rest is paid below, in the usual way, for the same game
      } catch (e) { S.err = e.message; S.creditErr = true; }
      S.busy = false; draw();
    };
    if ($("paygo")) $("paygo").onclick = async () => {
      keep(); S.err = "";
      const nm = (S.name || "").trim(), org = (S.org || "").trim(), email = (S.email || "").trim().toLowerCase(), tax = (S.tax || "").trim().toUpperCase();
      if (nm.length < 2) { S.err = "Please enter your name."; return draw(); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { S.err = "Please enter a valid email."; return draw(); }
      if (S.country === "IN" && tax && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(tax)) { S.err = "Please enter a valid 15-character GSTIN, like 27ABCDE1234F1Z5."; return draw(); }
      S.busy = true; draw();
      try {
        let ref = ""; try { const v = JSON.parse(localStorage.getItem("ctz-ref") || "null"); if (v && Date.now() - v.at < 30 * 86400000) ref = v.code; } catch {}
        let r = await call("POST", "/api/checkout", { eid, name: nm, org, email, country: S.country, taxId: tax, currency: S.cur, phone: S.phone, phoneCode: S.pcode, ref });
        if (r.mode === "razorpay") r = await TB.pay(r.razorpay, r.paymentId); // opens Razorpay Checkout; the server verifies the payment
        else if (r.result) r = r.result; // local test mode answers with the finished order
        try { sessionStorage.setItem("ctz-email", email); sessionStorage.setItem("ctz-name", nm); } catch {}
        if (r && r.confirming) r = await waitForConfirm(r); // Razorpay has not confirmed yet: keep asking, never mark it paid early
        S.done = r;
      } catch (e) { S.err = e.cancelled ? e.message : e.message; }
      S.busy = false; draw();
    };
  }

  (async () => {
    if (!secret) return draw();
    if (!eid) { S.err = "No engagement was chosen."; return draw(); }
    try {
      const st = await fetch("/api/payments/status").then((r) => r.json()); S.mode = st.mode;
      const h = await call("GET", `/api/z/${eid}/cohost`); // only the Organizer, a Host or a Co-host of THIS game's account passes; anyone else gets a 403 and a calm message
      try { S.info = await call("GET", `/api/z/${eid}/info`); }
      catch (e0) { // a Co-host may pay but cannot read the game: use the small game header they are allowed
        if (e0.status !== 403) throw e0;
        S.info = { cap: h.cap, startMs: h.startMs, draft: !h.inviteLink, unpaid: !h.payment || h.payment.status !== "paid", credit: h.credit, creditExpiresMs: h.creditExpiresMs, creditApplied: h.creditApplied, erasureMs: h.erasureMs };
      }
    } catch (e) { S.err = e.status === 403 || e.status === 404 ? "We could not open this engagement with your sign-in. Open it from your console." : e.message; }
    draw();
  })();
})();
