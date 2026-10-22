/* Corporate Tambola: the page where an organizer pays to publish a draft engagement. Opens after they confirm their email and mobile number.
   The organizer key comes from this browser tab (set when the console was opened). The SERVER decides the pack and verifies the payment. */
(function () {
  const TB = window.TB, esc = TB.esc, $app = document.getElementById("app");
  const eid = TB.qs("e") || "";
  let secret = ""; try { secret = sessionStorage.getItem("ctz-org") || ""; } catch {}
  const ss = (k) => { try { return sessionStorage.getItem(k) || ""; } catch { return ""; } };
  const nf = (n) => Number(n).toLocaleString("en-IN");
  // A DEMO GAME (free, up to 10 people) is made a real game here: the payer CHOOSES the pack (`pack` in the address, from the console's step 8, or the chips below); the server clears the demo mark and raises the size on a confirmed payment.
  const qPack = Number(TB.qs("pack")) || 0;
  const S = { k3: {}, credited: 0, info: null, mode: "", cur: "INR", err: "", busy: false, done: null, pack: TB.PACKS.some((x) => x[0] === qPack) ? qPack : 0, ...(() => { const v = TB.payer.load(); return { email: ss("ctz-email") || v.email || "", phone: ss("ctz-phone") || v.phone || "", name: ss("ctz-name") || v.name || "", org: v.org || "", tax: v.tax || "" }; })(), pcode: "91", country: "IN" }; // India and +91 unless they change them: fewest taps to pay
  S.cur = S.country === "IN" ? "INR" : "USD";

  const call = async (method, path, body) => {
    const r = await fetch(path, { method, headers: { "content-type": "application/json", "x-organizer": secret }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const err = Object.assign(new Error(j.error || "Something went wrong. Please try again."), { status: r.status }); if (window.CTG) { CTG.wrap(err, { what: method + " " + path.split("?")[0] }); if (method !== "GET") { err.guided = true; CTG.watch(err, { retry: () => call(method, path, body) }); } } throw err; }
    return j;
  };
  const head = `<div class="zhead"><b>Corporate Tambola · Publish engagement</b><a class="zsnd" href="/zc.html?e=${encodeURIComponent(eid)}" style="text-decoration:none">Back to my engagement</a></div>${TB.payBrand ? TB.payBrand() : ""}`;
  const packFor = (cap) => { const p = TB.PACKS.find((x) => x[0] >= cap); return p ? p[0] : null; };
  const isDemo = () => !!(S.info && S.info.demo);
  /** the pack being paid for: the smallest that fits the game, or, for a demo game being made real, the one the payer chose */
  const packNow = () => (isDemo() ? (S.pack || packFor(S.info.cap)) : packFor(S.info.cap));

  function view() {
    if (!secret) return `${head}<div class="zcard"><h2>Please sign in first</h2><p class="zsmall" style="margin-top:0">Open your console from the home page, or sign in with your e-mail: we send you a 6-digit code.</p><a class="zbtn" href="/#login" id="goLogin" style="text-decoration:none;display:inline-block">Sign in with email</a></div>`;
    if (S.done) {
      const d = S.done;
      return `${head}<div class="zcard" style="border:2px solid #2e7d4f"><h2>${d.converted ? "Payment received. Your demo game is now a real game." : "Payment received. Your engagement will begin on time."}</h2>${TB.payReceipt ? TB.payReceipt(d, d.eid || eid) : ""}
        <p style="margin:0 0 10px">${d.paidFromCredit ? "Paid from your credit. " : ""}Thank you. Your ${d.converted ? "game" : "engagement"} for up to <b>${nf(d.pack)}</b> participants is confirmed.${d.converted ? " It carries on exactly as it is: the same link, the same people, the same numbers. The DEMO GAME mark goes away on the next refresh and more people can join." : ""}${d.restartedAtMs ? ` It begins at <b>${esc(new Date(d.restartedAtMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))}</b>, for everyone already waiting.` : " Share the link with your participants from your console if you have not already."}</p>
        ${d.invoiceUrl ? `${TB.invoiceBox ? TB.invoiceBox(d, S.email) : ""}<p class="zsmall">We also emailed it to you and to the organizer.</p>` : ""}
        <a class="zbtn" href="/zc.html?e=${encodeURIComponent(d.eid || eid)}" style="text-decoration:none;display:inline-block">Open my engagement</a>
        <p class="zsmall" id="goNote" aria-live="polite" style="margin:10px 0 0">Opening your engagement page in a few seconds. <button type="button" class="zlink" id="goStay" style="background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer">Stay on this page</button></p></div>`;
    }
    if (!S.info) return `${head}<p class="zmsg">${S.err ? esc(S.err) : "Loading…"}</p>`;
    const pack = packNow();
    if (!S.info.draft && !S.info.unpaid && !isDemo()) return `${head}<div class="zcard"><h2>This engagement is already paid and published</h2><a class="zbtn" href="/zc.html?e=${encodeURIComponent(eid)}" style="text-decoration:none;display:inline-block">Open my engagement</a></div>`;
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
      ${isDemo() ? `<div class="zcard zdemo" id="makereal"><h2><span class="zdemotag">DEMO GAME</span> Make this a real game</h2><p class="zsmall" style="margin-top:0">This is a free demo game for up to ${nf(S.info.cap)} people. Choose how many people the real game is for and pay. The game carries on exactly as it is: the same link, the same people, the same numbers. The DEMO GAME mark goes away on the next refresh and more people can join.</p><div class="zchips" role="group" aria-label="How many people?">${TB.PACKS.map((k) => `<button type="button" class="zbtn s${k[0] === pack ? "" : " alt"}" data-pack="${k[0]}" aria-pressed="${k[0] === pack}">Up to ${nf(k[0])} \u00b7 ${TB.money(TB.price(k[0], S.cur).total, S.cur)}</button>`).join(" ")}</div></div>` : ""}
      <div class="zcard"><h2>${isDemo() ? "Payment for the real game" : "Payment"}</h2>
        <p class="pstmt">Payment is for Game ID <b class="mono">${esc(eid)}</b>; Amount <b>${TB.money(applied ? toPay : x.total, S.cur)}</b>;</p>
        <div class="pgame"><div class="zrow"><span><b>GAME ID</b></span><em><b class="mono">${esc(eid)}</b></em></div>${S.info.startMs ? `<div class="zrow"><span>Starts</span><em>${esc(new Date(S.info.startMs).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}</em></div>` : ""}<div class="zrow"><span>Players</span><em>Up to ${nf(pack)}</em></div></div>
        ${sum}
        <p class="zsmall">Every participant gets their own ticket on their phone. Participants never pay: you give the rewards. We do not give refunds. If you cancel a paid game before it starts, your payment stays as credit for your next game for 365 days. Unused credit lapses at the end of day 365. The credit belongs to your organizer account.</p>${S.info.startMs && !isDemo() ? `<p class="zsmall"><b>Payment pending.</b> The game does not begin until it is paid for. Starts ${esc(new Date(S.info.startMs).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))}. You can pay at any time until the guest data is erased${S.info.erasureMs ? ` (${esc(new Date(S.info.erasureMs).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }))})` : ""}.${S.info.locked ? " It is waiting for your payment now: pay and it starts 2 minutes after your payment is confirmed." : " If you pay after the start time, it starts 2 minutes after your payment is confirmed."}</p>` : ""}</div>
      ${avail ? `<div class="zcard" style="border:2px solid #2e7d4f"><h2>Use your credit</h2><p class="zsmall" style="margin-top:0">You have credit of <b>${TB.money(avail, "INR")}</b>${until ? ` (valid until ${esc(until)})` : ""}. Use it for this game.</p>${S.err && S.creditErr ? `<div class="zbanner bad">${esc(S.err)}</div>` : ""}<button class="zbtn" id="usecredit" ${S.busy ? "disabled" : ""}>Use my credit</button></div>` : ""}
      ${TB.proformaBox ? TB.proformaBox() : ""}
      <div class="zcard zform"><h2>Details</h2>
        <label for="nm">Name</label><input id="nm" data-need="1" autocomplete="name" value="${esc(S.name || "")}" placeholder="Full name">
        <label for="em">Email (your invoice comes here)</label><input id="em" data-need="1" type="email" autocomplete="email" value="${esc(S.email)}" placeholder="Email">
        <label for="ph">Mobile <span class="zsmall" style="display:inline">(optional)</span></label>
        <div style="display:flex;gap:8px"><select id="pcode" aria-label="Country code" style="flex:0 0 112px">${TB.COUNTRIES.map(([c, n, d]) => `<option value="${d}" ${String(d) === String(S.pcode) ? "selected" : ""}>${c} +${d}</option>`).join("")}</select><input id="ph" type="tel" autocomplete="tel-national" value="${esc(S.phone)}" placeholder="Mobile number" style="flex:1;min-width:0"></div>
        <label for="org">Company name <span class="zsmall" style="display:inline">(optional)</span></label><input id="org" autocomplete="organization" value="${esc(S.org || "")}" placeholder="Company name">
        <label for="cty">Country of your organization <span class="zsmall" style="display:inline">(optional)</span></label><select id="cty">${TB.countryOpts(S.country)}</select>
        <label for="tax">GST / Tax number <span class="zsmall" style="display:inline">(optional)</span></label><input id="tax" autocomplete="off" maxlength="30" value="${esc(S.tax || "")}" placeholder="GST / Tax number" style="text-transform:uppercase">
        ${CBConsent.html("K3")}
        ${S.err ? `<div class="zbanner bad">${esc(S.err)}</div>` : ""}${S.busy ? `<div class="zbanner info" role="status">Confirming your payment with Razorpay. Please keep this page open. Your game starts only after Razorpay confirms.</div>` : ""}
        <button class="zbtn" id="paygo" data-needs="K3" disabled aria-disabled="true" ${off || S.busy ? 'data-hold="1"' : ""}>${S.busy ? "Confirming your payment…" : off ? "Payment opens soon" : "Pay " + TB.money(applied ? toPay : x.total, S.cur) + " securely with Razorpay"}</button>
        <p class="zsmall">Secure payment by Razorpay. Payment to <a href="https://itservices-rajat-agarwal.pages.dev/" rel="noopener" target="_blank">IT Services by Rajat Agarwal</a>. An invoice is emailed to you. See the <a href="/legal.html#privacy">privacy policy</a>.</p></div>`;
  }
  // The server answers 202 {confirming:true} while Razorpay still says the payment is only created or authorized. We ask every 4 seconds, for up to 5 minutes, until the game itself says Paid.
  async function waitForConfirm(first) {
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      await new Promise((ok) => setTimeout(ok, 4000));
      let st = null;
      try { st = (await call("GET", `/api/z/${eid}/summary`)).payment; } catch { try { st = (await call("GET", `/api/z/${eid}/cohost`)).payment; } catch { /* keep asking */ } }
      if (st && st.status === "paid") return { ok: true, eid, pack: (S.info && packNow()) || 0, total: 0, currency: S.cur, ...(S.info && S.info.demo ? { converted: true } : {}) };
    }
    throw new Error("We are still waiting for Razorpay to confirm your payment. Nothing is lost: your game starts as soon as it is confirmed. You can close this page and open your game to see the status.");
  }
  function draw() { $app.innerHTML = view(); bind(); CBConsent.wire($app, "K3", S.k3); TB.payer.mark($app); if (S.done && TB.invoiceWire) TB.invoiceWire(S.done); else if (TB.proformaWire && S.info) TB.proformaWire(() => call("POST", "/api/proforma", { eid, currency: S.cur, name: S.name || "", email: S.email || "", phone: S.phone || "", org: S.org || "", taxId: S.tax || "", country: S.country, ...(isDemo() ? { pack: packNow() } : {}) })); }
  function keep() { const g = (id) => { const e = document.getElementById(id); return e ? e.value : undefined; }; const v = { name: g("nm"), org: g("org"), tax: g("tax"), email: g("em"), phone: g("ph"), pcode: g("pcode") }; for (const k in v) if (v[k] !== undefined) S[k] = v[k]; }

  function bind() {
    const $ = (id) => document.getElementById(id);
    if ($("cty")) $("cty").onchange = () => { keep(); S.country = $("cty").value; S.cur = S.country === "IN" ? "INR" : "USD"; draw(); };
    $app.querySelectorAll("[data-pack]").forEach((b) => (b.onclick = () => { keep(); S.pack = Number(b.dataset.pack); draw(); })); // a demo game being made real: the payer picks the size
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
      if (!CBConsent.all($app, "K3")) { S.err = "Please tick the box to continue."; return draw(); }
      const consent = CBConsent.payload($app, "K3");
      const nm = (S.name || "").trim(), org = (S.org || "").trim(), email = (S.email || "").trim().toLowerCase(), tax = (S.tax || "").trim().toUpperCase();
      if (nm.length < 2) { S.err = "Please enter your name."; return draw(); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { S.err = "Please enter a valid email."; return draw(); }
      if (S.country === "IN" && tax && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(tax)) { S.err = "Please enter a valid 15-character GSTIN, like 27ABCDE1234F1Z5."; return draw(); }
      TB.payer.save(S);
      S.busy = true; draw();
      try {
        let ref = ""; try { const v = JSON.parse(localStorage.getItem("ctz-ref") || "null"); if (v && Date.now() - v.at < 30 * 86400000) ref = v.code; } catch {}
        let r = await call("POST", "/api/checkout", { consent, eid, name: nm, org, email, country: S.country, taxId: tax, currency: S.cur, phone: S.phone, phoneCode: S.pcode, ref, ...(isDemo() ? { pack: packNow() } : {}) });
        if (r.mode === "razorpay") r = await TB.pay(r.razorpay, r.paymentId, r.hop); // opens Razorpay Checkout; the server verifies the payment
        else if (r.result) r = r.result; // local test mode answers with the finished order
        try { sessionStorage.setItem("ctz-email", email); sessionStorage.setItem("ctz-name", nm); } catch {}
        if (r && r.confirming) r = await waitForConfirm(r); // Razorpay has not confirmed yet: keep asking, never mark it paid early
        S.done = r;
        goAuto(r.eid || eid); // once the payment is confirmed the organizer lands on the engagement page by themselves (the receipt is also e-mailed)
      } catch (e) { S.err = e.cancelled ? e.message : e.message; }
      S.busy = false; draw();
    };
  }

  let autoT = null;
  function goAuto(id) {
    clearTimeout(autoT);
    autoT = setTimeout(() => {
      const stay = document.getElementById("goStay"); if (!stay) return; // already left, or the page was redrawn
      try { window.location.assign("/zc.html?e=" + encodeURIComponent(id)); } catch {}
    }, 7000);
    setTimeout(() => { const b = document.getElementById("goStay"); if (b) b.onclick = () => { clearTimeout(autoT); const n = document.getElementById("goNote"); if (n) n.textContent = "You can open your engagement any time with the button above."; }; }, 0);
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
