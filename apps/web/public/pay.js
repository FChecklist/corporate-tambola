/* Corporate Tambola: the page where an organizer pays to publish a draft engagement. Opens after they confirm their email and mobile number.
   The organizer key comes from this browser tab (set when the console was opened). The SERVER decides the pack and verifies the payment. */
(function () {
  const TB = window.TB, esc = TB.esc, $app = document.getElementById("app");
  const eid = TB.qs("e") || "";
  let secret = ""; try { secret = sessionStorage.getItem("ctz-org") || ""; } catch {}
  const ss = (k) => { try { return sessionStorage.getItem(k) || ""; } catch { return ""; } };
  const nf = (n) => Number(n).toLocaleString("en-IN");
  const S = { info: null, mode: "", cur: "INR", err: "", busy: false, done: null, email: ss("ctz-email"), phone: ss("ctz-phone"), country: TB.guessCountry() };
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
        <p style="margin:0 0 10px">Thank you. Your engagement for up to <b>${nf(d.pack)}</b> participants is confirmed.${d.restartedAtMs ? ` It begins at <b>${esc(new Date(d.restartedAtMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))}</b>, for everyone already waiting.` : " Share the link with your participants from your console if you have not already."}</p>
        ${d.invoiceUrl ? `<p class="zsmall"><a href="${esc(d.invoiceUrl)}" target="_blank" rel="noopener">View your invoice ${esc(d.invoiceNumber || "")}</a>. We also emailed it to you.</p>` : ""}
        <a class="zbtn" href="/zc.html?e=${encodeURIComponent(d.eid || eid)}" style="text-decoration:none;display:inline-block">Open my engagement</a></div>`;
    }
    if (!S.info) return `${head}<p class="zmsg">${S.err ? esc(S.err) : "Loading…"}</p>`;
    const pack = packFor(S.info.cap);
    if (!S.info.draft && !S.info.unpaid) return `${head}<div class="zcard"><h2>This engagement is already paid and published</h2><a class="zbtn" href="/zc.html?e=${encodeURIComponent(eid)}" style="text-decoration:none;display:inline-block">Open my engagement</a></div>`;
    if (!pack) return `${head}<div class="zcard"><h2>A custom arrangement is needed</h2><p class="zsmall" style="margin-top:0">An engagement for more than 10,000 participants is arranged with us directly. Please write to us from the contact page.</p></div>`;
    const x = TB.price(pack, S.cur);
    const sum = S.cur === "INR"
      ? `<div class="zrow"><span>Price of Software</span><em>${TB.money(x.base, "INR")}</em></div><div class="zrow"><span>GST 18%</span><em>${TB.money(x.tax, "INR")}</em></div><div class="zrow"><span><b>Total</b></span><em><b>${TB.money(x.total, "INR")}</b></em></div>`
      : `<div class="zrow"><span><b>Total</b></span><em><b>${TB.money(x.total, "USD")}</b></em></div><p class="zsmall">No tax added. Billed in US dollars.</p>`;
    const off = S.mode === "off";
    return `${head}
      ${off ? `<div class="zbanner info"><b>Online payment opens soon.</b> Your engagement is saved and nothing is lost. Come back to this page when payment is switched on. Until then it stays held at its start time.</div>` : ""}
      <div class="zcard"><h2>Your order</h2>
        <div class="zrow"><span>Engagement</span><em>${esc(eid)}</em></div>
        <div class="zrow"><span>Participants</span><em>Up to ${nf(pack)}</em></div>${sum}
        <p class="zsmall">Every participant gets their own ticket on their phone. Participants never pay: you give the rewards. Unused places are not refunded.</p>${S.info.startMs ? `<p class="zsmall"><b>Pay before ${esc(new Date(S.info.startMs).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}.</b> If it is not paid by then, the engagement will not begin.${S.info.locked ? " It is waiting for your payment now: pay and it starts in about 3 minutes." : ""}</p>` : ""}</div>
      <div class="zcard zform"><h2>Billing details</h2>
        <label for="org">Organization name</label><input id="org" autocomplete="organization" value="${esc(S.org || "")}" placeholder="e.g. Acme Industries">
        <label for="cty">Country of your organization</label><select id="cty">${TB.countryOpts(S.country)}</select>
        <label for="tax">${S.country === "IN" ? "GSTIN (for your GST invoice)" : "Company tax / VAT number (optional)"}</label><input id="tax" autocomplete="off" maxlength="${S.country === "IN" ? 15 : 30}" value="${esc(S.tax || "")}" placeholder="${S.country === "IN" ? "e.g. 27ABCDE1234F1Z5" : "Shown on your invoice"}" style="text-transform:uppercase">
        <label for="em">Email (invoice)</label><input id="em" type="email" autocomplete="email" value="${esc(S.email)}">
        <label for="ph">Mobile number</label><input id="ph" type="tel" autocomplete="tel" value="${esc(S.phone)}" placeholder="98765 43210">
        ${S.err ? `<div class="zbanner bad">${esc(S.err)}</div>` : ""}
        <button class="zbtn" id="paygo" ${off || S.busy ? "disabled" : ""}>${S.busy ? "Processing…" : off ? "Payment opens soon" : "Pay " + TB.money(x.total, S.cur) + " securely with Razorpay"}</button>
        <p class="zsmall">Secure payment by Razorpay. A GST invoice is emailed to you. See the <a href="/legal.html#privacy">privacy policy</a>.</p></div>`;
  }
  function draw() { $app.innerHTML = view(); bind(); }
  function keep() { const g = (id) => { const e = document.getElementById(id); return e ? e.value : undefined; }; const v = { org: g("org"), tax: g("tax"), email: g("em"), phone: g("ph") }; for (const k in v) if (v[k] !== undefined) S[k] = v[k]; }

  function bind() {
    const $ = (id) => document.getElementById(id);
    if ($("cty")) $("cty").onchange = () => { keep(); S.country = $("cty").value; S.cur = S.country === "IN" ? "INR" : "USD"; draw(); };
    if ($("goLogin")) $("goLogin").onclick = () => { try { sessionStorage.setItem("ctz-next", "/pay.html?e=" + encodeURIComponent(eid)); } catch {} };
    if ($("paygo")) $("paygo").onclick = async () => {
      keep(); S.err = "";
      const org = (S.org || "").trim(), email = (S.email || "").trim().toLowerCase(), tax = (S.tax || "").trim().toUpperCase();
      if (org.length < 2) { S.err = "Please enter your organization name."; return draw(); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { S.err = "Please enter a valid email."; return draw(); }
      if (S.country === "IN" && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(tax)) { S.err = "Please enter a valid 15-character GSTIN, like 27ABCDE1234F1Z5."; return draw(); }
      S.busy = true; draw();
      try {
        let ref = ""; try { const v = JSON.parse(localStorage.getItem("ctz-ref") || "null"); if (v && Date.now() - v.at < 30 * 86400000) ref = v.code; } catch {}
        let r = await call("POST", "/api/checkout", { eid, org, email, country: S.country, taxId: tax, currency: S.cur, phone: S.phone, ref });
        if (r.mode === "razorpay") r = await TB.pay(r.razorpay, r.paymentId); // opens Razorpay Checkout; the server verifies the payment
        else if (r.result) r = r.result; // local test mode answers with the finished order
        try { sessionStorage.setItem("ctz-email", email); } catch {}
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
      try { S.info = await call("GET", `/api/z/${eid}/info`); }
      catch (e0) { // a Co-host may pay but cannot read the game: use the small game header they are allowed
        if (e0.status !== 403) throw e0;
        const h = await call("GET", `/api/z/${eid}/cohost`);
        S.info = { cap: h.cap, startMs: h.startMs, draft: !h.inviteLink, unpaid: !h.payment || h.payment.status !== "paid" };
      }
    } catch (e) { S.err = e.status === 403 || e.status === 404 ? "We could not open this engagement with your sign-in. Open it from your console." : e.message; }
    draw();
  })();
})();
