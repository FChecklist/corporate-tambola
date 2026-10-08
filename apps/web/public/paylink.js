/* Corporate Tambola: the page behind a "payment link" (docs/ROLES_AND_CONSOLE_SPEC_2.md, item 13). Anyone who holds the link can open it, with no sign-in: it shows only the game's name,
   its date and the price, asks only for a name and an e-mail, and pays for THAT game and no other. The server decides the price and verifies the payment; nothing here writes anything else. */
(function () {
  const TB = window.TB, esc = TB.esc, $app = document.getElementById("app");
  let token = (TB.qs("t") || "").trim();
  if (token) { try { sessionStorage.setItem("ctz-pl", token); } catch {} } else { try { token = sessionStorage.getItem("ctz-pl") || ""; } catch {} } // a refresh of this tab still works
  if (!/^[0-9a-f]{48}$/.test(token)) token = ""; // anything else is not one of our links (and never goes into an address)
  try { history.replaceState(null, "", location.pathname); } catch {} // the secret leaves the address bar at once
  const S = { info: null, err: "", busy: false, done: null, gone: false, name: "", email: "", phone: "", pcode: "91", org: "", tax: "", country: "IN", more: false };
  const call = async (method, path, body) => {
    let r;
    try { r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw Object.assign(new Error("Cannot reach the server. Check your internet and try again."), { status: 0 }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "Something went wrong. Please try again."), { status: r.status, body: j });
    return j;
  };
  const head = `<div class="zhead"><b>Corporate Tambola · Payment</b></div>`;
  const when = (ms) => { try { return new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
  const calm = (title, text) => `${head}<div class="zcard" role="status"><h2>${esc(title)}</h2><p class="zsmall" style="margin:0">${text}</p></div>`;

  function view() {
    if (!token || S.gone) return calm("This payment link is not working", "It may be incomplete or it may have been replaced. Please ask the person who sent it for a new link.");
    if (S.done) return calm("Payment received. Thank you.", `The game is paid for.${S.done.invoiceUrl ? ` <a href="${esc(S.done.invoiceUrl)}" target="_blank" rel="noopener">View the invoice ${esc(S.done.invoiceNumber || "")}</a>. We also e-mailed it to you.` : " We e-mail the invoice to the address you gave."} You can close this page.`);
    if (!S.info) return `${head}<p class="zmsg">${S.err ? esc(S.err) : "Loading…"}</p>`;
    const i = S.info, st = i.status;
    if (st === "paid") return calm("This game is already paid for", "Nothing more is needed. You can close this page.");
    if (st === "expired") return calm("This payment link has run out", "A payment link works for 7 days. Please ask the person who sent it to make a new one.");
    if (st === "cancelled") return calm("This game was cancelled", "There is nothing to pay. Please speak to the organizer.");
    if (st === "confirming" && !S.busy) return calm("Confirming a payment", "A payment for this game is being confirmed. Please wait a few minutes. If it goes through, this page will say the game is paid.");
    if (!i.price) return calm("A custom arrangement is needed", "A game this big is arranged with us directly. Please write to us from the contact page.");
    const p = i.price, cur = p.currency || "INR";
    const sum = cur === "INR"
      ? `<div class="zrow"><span>Price of Software</span><em>${TB.money(p.base, "INR")}</em></div><div class="zrow"><span>GST 18%</span><em>${TB.money(p.gst, "INR")}</em></div><div class="zrow"><span><b>Total</b></span><em><b>${TB.money(p.total, "INR")}</b></em></div>`
      : `<div class="zrow"><span><b>Total</b></span><em><b>${TB.money(p.total, cur)}</b></em></div><p class="zsmall">No tax added.</p>`;
    return `${head}
      <div class="zcard"><h2>${esc(i.game && i.game.name ? i.game.name : "Your game")}</h2>
        ${i.game && i.game.startMs ? `<div class="zrow"><span>Date</span><em>${esc(when(i.game.startMs))}</em></div>` : ""}${sum}
        <p class="zsmall">You are paying for this one game only. Players never pay.</p></div>
      <div class="zcard zform"><h2>Who is paying</h2>
        <label for="nm">Name</label><input id="nm" autocomplete="name" value="${esc(S.name)}" placeholder="Your full name">
        <label for="em">E-mail (the invoice comes here)</label><input id="em" type="email" autocomplete="email" value="${esc(S.email)}" placeholder="you@company.com">
        ${S.more ? `<label for="ph">Mobile <span class="zsmall" style="display:inline">(optional)</span></label>
        <div style="display:flex;gap:8px"><select id="pcode" aria-label="Country code" style="flex:0 0 112px">${TB.COUNTRIES.map(([c, n, d]) => `<option value="${d}" ${String(d) === String(S.pcode) ? "selected" : ""}>${c} +${d}</option>`).join("")}</select><input id="ph" type="tel" autocomplete="tel-national" value="${esc(S.phone)}" placeholder="98765 43210" style="flex:1;min-width:0"></div>
        <label for="org">Organization <span class="zsmall" style="display:inline">(optional)</span></label><input id="org" autocomplete="organization" value="${esc(S.org)}" placeholder="e.g. Acme Industries">
        <label for="tax">GSTIN <span class="zsmall" style="display:inline">(optional, for a GST invoice)</span></label><input id="tax" autocomplete="off" maxlength="15" value="${esc(S.tax)}" placeholder="e.g. 27ABCDE1234F1Z5" style="text-transform:uppercase">` : `<button class="zsnd" id="more" type="button" style="margin-top:8px">Add a mobile number, organization or GSTIN (optional)</button>`}
        ${S.err ? `<div class="zbanner bad" role="alert">${esc(S.err)}</div>` : ""}${S.busy ? `<div class="zbanner info" role="status">Confirming your payment with Razorpay. Please keep this page open.</div>` : ""}
        <button class="zbtn" id="paygo" ${S.busy ? "disabled" : ""}>${S.busy ? "Confirming your payment…" : "Pay " + TB.money(p.total, cur) + " securely with Razorpay"}</button>
        <p class="zsmall">Secure payment by Razorpay. A GST invoice is e-mailed to you. See the <a href="/legal.html#privacy">privacy policy</a>.</p></div>`;
  }
  function keep() { const g = (id) => { const e = document.getElementById(id); return e ? e.value : undefined; }; const v = { name: g("nm"), email: g("em"), phone: g("ph"), pcode: g("pcode"), org: g("org"), tax: g("tax") }; for (const k in v) if (v[k] !== undefined) S[k] = v[k]; }
  function draw() { $app.innerHTML = view(); bind(); }

  // Razorpay may say the payment is only created for a while: ask this link every 4 seconds, for up to 5 minutes, until the server says paid. Never mark it paid early.
  async function waitForConfirm() {
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      await new Promise((ok) => setTimeout(ok, 4000));
      try { const j = await call("GET", `/api/paylink/${token}`); if (j.status === "paid") return { ok: true }; } catch { /* keep asking */ }
    }
    throw new Error("We are still waiting for Razorpay to confirm your payment. Nothing is lost: the game is marked paid as soon as it is confirmed. You can close this page and open the link again later to see the status.");
  }
  function bind() {
    const $ = (id) => document.getElementById(id);
    if ($("more")) $("more").onclick = () => { keep(); S.more = true; draw(); };
    if ($("paygo")) $("paygo").onclick = async () => {
      keep(); S.err = "";
      const nm = (S.name || "").trim(), email = (S.email || "").trim().toLowerCase(), tax = (S.tax || "").trim().toUpperCase();
      if (nm.length < 2) { S.err = "Please enter your name."; return draw(); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { S.err = "Please enter a valid e-mail."; return draw(); }
      if (tax && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(tax)) { S.err = "Please enter a valid 15-character GSTIN, like 27ABCDE1234F1Z5."; return draw(); }
      S.busy = true; draw();
      try {
        const body = { name: nm, email, country: S.country };
        if ((S.phone || "").trim()) { body.phone = S.phone.trim(); body.phoneCode = S.pcode; }
        if ((S.org || "").trim()) body.org = S.org.trim();
        if (tax) body.taxId = tax;
        let r = await call("POST", `/api/paylink/${token}/checkout`, body);
        if (r.mode === "razorpay") r = await TB.pay(r.razorpay, r.paymentId); // opens Razorpay Checkout; the SERVER verifies the payment
        else if (r.result) r = r.result; // local test mode answers with the finished order
        if (r && r.confirming) r = await waitForConfirm();
        S.done = r || { ok: true };
      } catch (e) {
        if (e && e.status === 409 && e.body && e.body.status) { try { S.info = await call("GET", `/api/paylink/${token}`); S.err = ""; } catch { S.err = e.message; } } // already paid, expired or cancelled meanwhile: show that calm screen
        else S.err = e.message;
      }
      S.busy = false; draw();
    };
  }
  (async () => {
    if (!token) return draw();
    try { S.info = await call("GET", `/api/paylink/${token}`); }
    catch (e) { if (e.status === 404) S.gone = true; else S.err = e.message; }
    draw();
  })();
})();
