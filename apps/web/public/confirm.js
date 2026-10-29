/* Corporate Tambola – confirmation page for things your AI drafted: /confirm/<draftId>#<code>
 * The confirm code lives in the URL fragment. It is only ever sent in the JSON body of the two API calls below. */
(function () {
  "use strict";
  const { $, esc, ic } = TB;
  const root = $("app");
  const id = TB.pathPart(1);
  const code = decodeURIComponent(location.hash.replace(/^#/, "")).trim();
  let draft = null, timer = null, signedEmail = "";

  const WORDS = {
    start_engagement: "Start the engagement", end_engagement: "End the engagement", remove_people: "Remove people",
    erase_details: "Erase saved details", erase_people: "Erase saved details", raise_limit: "Raise the participant limit",
  };
  const tool = (t) => WORDS[t] || String(t || "An action").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()).replace(/\bgames?\b/gi, "engagement").replace(/\bplayers?\b/gi, "participant").replace(/\bprizes?\b/gi, "reward").replace(/\badmin\b/gi, "organizer");
  const paramLine = (p) => {
    if (!p || typeof p !== "object") return "";
    return Object.keys(p).filter((k) => !/token|secret/i.test(k)).map((k) => {
      let v = p[k];
      if (Array.isArray(v)) v = v.length + " item" + (v.length === 1 ? "" : "s"); else if (v && typeof v === "object") v = "details";
      return `${esc(k.replace(/_/g, " "))}: <b>${esc(v)}</b>`;
    }).join(" · ");
  };
  const card = (inner) => `<div class="panel">${inner}</div>`;
  const view = (html) => { root.innerHTML = html; };
  const setErr = (m) => { const f = $("fErr"); if (f) f.innerHTML = m ? `<div class="err" role="alert">${ic("alert")}<span>${esc(m)}</span></div>` : ""; };

  // raw call so we can read the body of a failed confirm (it lists what went wrong)
  async function call(path, body) {
    const headers = { "content-type": "application/json", "x-device": TB.device() };
    const tok = TB.orgToken(); if (tok) headers.authorization = "Bearer " + tok;
    let res;
    try { res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body) }); }
    catch { return { status: 0, data: { error: "Cannot reach the server. Check your internet and try again." } }; }
    let data = null; try { data = await res.json(); } catch {}
    return { status: res.status, data: data || {} };
  }
  const reason = (status, data) => {
    if (status === 401) return "Please sign in again.";
    if (status === 409) return data.error || "This confirmation code does not match. Ask your AI for a fresh confirmation link.";
    if (status === 410) return data.error || "This request has expired or was already used. Ask your AI to draft it again.";
    if (status === 404) return data.error || "This request was not found for your account. Make sure you are signed in with the same work email you gave your AI.";
    return data.error || "Something went wrong. Please try again.";
  };
  const title = (status, data) => /already/i.test(data.error || "") ? "Already confirmed" : status === 410 ? "This request is no longer open" : status === 409 ? "This link does not match" : status === 404 ? "Not your request" : "We could not open this";
  const problem = (title, msg) => view(card(`<div class="res no">${ic("alert")}</div><h1 class="center" style="font-size:22px">${esc(title)}</h1><p class="muted center">${esc(msg)}</p>`));

  // ---------- sign in ----------
  function signIn(msg) {
    view(card(`<div class="eyebrow">Organizer sign in</div><h1>Sign in to confirm</h1><p class="muted small">Your AI cannot do this without you. Sign in with the work email you used for your account. We email you a 6-digit code: no password.</p>
      ${msg ? `<div class="err" role="alert">${ic("alert")}<span>${esc(msg)}</span></div>` : ""}
      <form id="lgForm" novalidate><label class="lb" for="lMail">Work email</label><input class="inp" id="lMail" type="email" autocomplete="email" placeholder="your e-mail" value="${esc(signedEmail)}"><div id="fErr"></div>
      <button class="btn block" style="margin-top:14px" type="submit" id="lgGo">Email me a code ${ic("arrow")}</button></form>`));
    $("lgForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const m = $("lMail").value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m)) return setErr("Please enter a valid work email.");
      const b = $("lgGo"); b.disabled = true; setErr("");
      try { const r = await TB.api("POST", "/api/auth/email", { email: m }); signedEmail = m; codeView(m, r.devCode); }
      catch (er) { b.disabled = false; setErr(er.message); }
    });
    const i = $("lMail"); if (i) i.focus();
  }
  function codeView(email, devCode) {
    view(card(`<div class="sheethead"><div class="eyebrow">Check your inbox</div><span class="sbrand" role="img" aria-label="Corporate Tambola"><span class="mark"><img src="/logo-mark.svg?v=2" alt="" width="26" height="26"></span><span class="word">Corporate Tambola<i>.</i></span></span></div>
      <h1 id="cdTitle">Check your email</h1>
      <p class="sheetbody">We emailed <b class="sendto">${esc(email)}</b>. Option 1: type the 6-digit number from the e-mail here. Option 2: tap <b>Sign me in</b> in the e-mail (then come back to this page). It works for 10 minutes. Check spam too.</p>
      ${devCode ? `<div class="note info devcode" role="note"><span>Local test mode: your passcode is <b>${esc(devCode)}</b></span><button type="button" class="btn sm" id="useCode">Use this passcode</button></div>` : ""}
      <form id="cdForm" novalidate><label class="lb" for="lCode">6-digit passcode</label><input class="inp mono codein" id="lCode" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-describedby="fErr cdHelp" autocapitalize="off" spellcheck="false"><div id="fErr" role="alert"></div>
      <button class="btn block big" style="margin-top:14px" type="submit" id="cdGo">Sign in</button></form>
      <button class="btn line block big" style="margin-top:8px" type="button" id="resend">Send me a new code</button>
      <p class="sheethelp" id="cdHelp" role="status" aria-live="polite">Not there yet? Check spam, or send a new code.</p>`));
    const verify = async () => {
      const c = $("lCode").value.replace(/\D/g, "");
      if (c.length !== 6) return setErr("Enter the 6-digit passcode.");
      const b = $("cdGo"); b.disabled = true; setErr("");
      try { const r = await TB.api("POST", "/api/auth/verify", { email, code: c }); TB.setOrgToken(r.token); load(); }
      catch (er) { b.disabled = false; setErr(er.message); }
    };
    $("cdForm").addEventListener("submit", (e) => { e.preventDefault(); verify(); });
    $("resend").addEventListener("click", async () => { try { const r = await TB.api("POST", "/api/auth/email", { email }); codeView(email, r.devCode); TB.toast("A new code was sent"); } catch (er) { setErr(er.message); } });
    const u = $("useCode"); if (u) u.addEventListener("click", () => { $("lCode").value = devCode; verify(); });
    $("lCode").focus();
  }

  // ---------- preview ----------
  async function load() {
    if (!id || !code) return problem("This link is incomplete", "Open the full confirmation link your AI gave you, including everything after the # sign.");
    if (!TB.orgToken()) return signIn();
    view(`<div class="panel center muted">Checking your request…</div>`);
    const { status, data } = await call(`/api/ai/drafts/${encodeURIComponent(id)}/preview`, { code });
    if (status === 401) { TB.setOrgToken(null); return signIn("Please sign in to continue."); }
    if (status !== 200) return problem(title(status, data), reason(status, data));
    draft = data; show();
  }
  const left = () => (draft.expires_at ? new Date(draft.expires_at).getTime() - Date.now() : null);
  function countdown() {
    const t = left(); if (t === null) return "";
    if (t <= 0) return "This request has expired";
    const m = Math.ceil(t / 60000);
    return m >= 60 ? "Open for about " + Math.round(m / 60) + " h" : "Open for " + m + " minute" + (m === 1 ? "" : "s");
  }
  function show() {
    const acts = (draft.actions || []).map((a) => { const pl = paramLine(a.params); return `<div class="cfact">${ic("check")}<div><b>${esc(tool(a.tool))}</b>${pl ? `<div class="tiny muted">${pl}</div>` : ""}</div></div>`; }).join("");
    view(card(`<div class="eyebrow">Your AI is waiting for you</div><h1>Your AI is asking you to confirm</h1>
      <p class="cfsum">${esc(draft.summary || "")}</p>
      ${acts ? `<div class="sum" style="padding:2px 12px"><div class="eyebrow" style="padding-top:10px">What will happen</div>${acts}</div>` : ""}
      <p class="hint">${ic("clock")} <span id="cdt">${esc(countdown())}</span></p>
      <div id="fErr"></div>
      <button class="btn gold block" style="margin-top:14px" id="yes">${ic("check")} Confirm</button>
      <button class="cflink" id="no" type="button">Not now</button>`));
    clearInterval(timer);
    timer = setInterval(() => {
      const el = $("cdt"); if (!el) return clearInterval(timer);
      el.textContent = countdown();
      if (left() <= 0) { clearInterval(timer); const y = $("yes"); if (y) y.disabled = true; setErr("This request has expired. Ask your AI to draft it again."); }
    }, 15000);
    $("yes").addEventListener("click", confirm);
    $("no").addEventListener("click", () => { clearInterval(timer); view(card(`<div class="res">${ic("x")}</div><h1 class="center" style="font-size:22px">Nothing was done</h1><p class="muted center">You can close this page. The request stays open until it expires, so you can come back to this link and confirm it later, or just tell your AI you do not want it.</p>`)); });
  }
  async function confirm() {
    const b = $("yes"); b.disabled = true; setErr("");
    // a pause/resume/stop for phone-only engagements must be signed by the key that lives in THIS browser (the AI cannot do it)
    let signed;
    const ctl = (draft.actions || []).find((a) => a.tool === "request_control");
    if (ctl && window.TBControl) {
      try {
        const p = ctl.params || {}, mins = Number(p.minutes || 0);
        signed = await window.TBControl.sign(p.code, { token: "" }, p.action, { pauseForRounds: p.action === "pause" && mins ? mins * 20 : undefined, addRounds: p.action === "extend" ? mins * 20 : undefined });
      } catch (e) { b.disabled = false; return setErr("Open this link in the browser where you set up this engagement: that is where your signing key is kept."); }
    }
    const { status, data } = await call(`/api/ai/drafts/${encodeURIComponent(id)}/confirm`, { code, signed });
    if (status === 401) { TB.setOrgToken(null); return signIn("Please sign in again to finish."); }
    if (data && Array.isArray(data.results)) {
      const needPay = data.results.find((r) => r.ok && r.result && r.result.mode === "razorpay");
      if (needPay) return payStep(data, status, needPay.result);
      return done(data, status);
    }
    if (status === 410 || status === 409 || status === 404) return problem(title(status, data), reason(status, data));
    b.disabled = false; setErr(reason(status, data));
  }
  // an upgrade is confirmed first, then paid on this page (the AI can never pay)
  function payStep(data, status, r) {
    clearInterval(timer);
    view(card(`<div class="res">${ic("lock")}</div><h1 class="center" style="font-size:24px">One more step: pay</h1>
      <p class="center">Your upgrade is confirmed. Pay ${esc(TB.money(r.razorpay.amount / 100, r.razorpay.currency))} securely with Razorpay to finish.</p><div id="fErr"></div>
      <button class="btn gold block" id="payNow">${ic("lock")} Pay now</button>`));
    $("payNow").addEventListener("click", async () => {
      $("payNow").disabled = true; setErr("");
      try { const paid = await TB.pay(r.razorpay, r.paymentId, r.hop); data.results.forEach((x) => { if (x.result && x.result.mode === "razorpay") x.result = paid; }); done(data, status); }
      catch (e) { $("payNow").disabled = false; setErr(e.message); }
    });
  }
  function done(data, status) {
    clearInterval(timer);
    const rows = data.results.map((r) => {
      const ok = r.ok, e = r.error, detail = ok ? "" : (e && e.message) || (typeof e === "string" ? e : "");
      return `<div class="cfact">${ic(ok ? "check" : "alert")}<div><b>${esc(tool(r.tool))}</b> · ${ok ? "done" : "did not work"}${detail ? `<div class="tiny" style="color:var(--bad)">${esc(detail)}</div>` : ""}</div></div>`;
    }).join("");
    const all = data.ok !== false && status < 400;
    view(card(`<div class="res ${all ? "ok" : "no"}">${ic(all ? "check" : "alert")}</div><h1 class="center" style="font-size:24px">${all ? "Done" : "Some steps did not work"}</h1>
      <p class="center">${all ? "Go back to your AI chat and tell it you confirmed." : "Go back to your AI chat and tell it what happened. It can try again."}</p>
      ${rows ? `<div class="sum" style="padding:2px 12px">${rows}</div>` : ""}
      <a class="btn line block" style="margin-top:12px" href="/console">Open my Dashboard</a>`));
  }
  load();
})();
