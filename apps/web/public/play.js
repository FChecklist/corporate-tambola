/* Corporate Tambola: participant page (/e/CODE engagement link, /p/CODE personal pass). Vanilla JS, no build. */
(function () {
  "use strict";
  const $ = TB.$, esc = TB.esc, ic = TB.ic, enc = encodeURIComponent;
  const app = $("app");
  const seg = location.pathname.split("/").filter(Boolean);
  const MODE = seg[0], LINK = seg[1] || "";
  let code = MODE === "e" ? LINK : "";
  document.title = "Corporate Tambola";
  // Thin client: download the whole participant app once and keep it on the phone (see sw.js).
  TB.sw.on(() => { if ($("hd")) paintHd(); });
  TB.sw.start("participant");

  const PNAME = { early5: "Early Five", top: "Top Line", mid: "Middle Line", bot: "Bottom Line", corners: "Four Corners", star: "Star", full: "Full House" };
  const PDESC = { early5: "Any 5 numbers on your ticket", top: "All 5 numbers of the first row", mid: "All 5 numbers of the second row", bot: "All 5 numbers of the third row",
    corners: "First and last numbers of the top and bottom rows", star: "Four corners and the centre of the middle row", full: "All 15 numbers on your ticket" };
  const ERRS = {
    inuse: ["phone", "Already in use on another phone", "This number or pass has already joined on another phone. Only one phone can take part per number. Your organizer has been alerted and can move your entry to this phone."],
    cancelled: ["x", "This pass was cancelled", "The person who sent it cancelled this pass. Ask them to send you a new one."],
    closed: ["lock", "Entry is closed", "The engagement has started, so nobody new can join. Ask your organizer about the next engagement."],
    full: ["users", "This engagement is full", "This engagement has reached its limit of participants. Ask your organizer if a place can be freed."],
    declined: ["x", "Request not accepted", "The organizer did not admit this number to this engagement."],
    rate: ["clock", "Too many tries", "Please wait 10 minutes, then try again, or ask your organizer to check your number."],
    badlink: ["alert", "This link does not work", "Check the link your organizer sent you."],
    usepass: ["ticket", "Use your personal pass", "A personal pass was sent to this number. Open the pass link from your messages. You do not need to type your number."],
    moved: ["phone", "This phone was logged out", "Your entry was moved to another phone. If that was not you, contact your organizer."],
    deleted: ["trash", "This engagement has ended", "Its data has been deleted."],
    endedNew: ["flag", "This engagement has ended", "Thank you for your interest. Entry is closed."],
  };

  // ---------- small helpers ----------
  const dial = (cc) => (TB.COUNTRIES.find((c) => c[0] === cc) || [0, 0, ""])[2];
  const inlineErr = (id, msg) => { const el = $(id); if (el) el.innerHTML = msg ? `<div class="err">${ic("alert")}<span>${esc(msg)}</span></div>` : ""; };
  const busy = (id, on) => { const b = $(id); if (b) b.disabled = !!on; };
  const api = (m, p, b) => TB.api(m, p, b);
  const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";
  const say = (t) => { const l = $("live"); if (l) l.textContent = t; };
  let pollT = null, waitWs = null;
  function show(html) { clearInterval(pollT); if (waitWs) { waitWs.close(); waitWs = null; } app.innerHTML = `<div class="pw">${html}</div>`; window.scrollTo(0, 0); }
  const ptop = (menu) => `<div class="ptop"><span class="mark">${ic("ticket")}</span><span class="word">Corporate Tambola<i>.</i></span>${menu ? `<button class="av" data-act="menu" aria-label="Menu" aria-haspopup="dialog">${ic("menu")}</button>` : ""}</div>`;
  function errCard(k) {
    const [i, t, x] = ERRS[k] || ERRS.badlink;
    show(`${ptop()}<div class="pcard center"><div class="res no">${ic(i)}</div><h2>${t}</h2><p class="lead">${x}</p></div>`);
  }
  function fatal(msg) { show(`${ptop()}<div class="pcard center"><div class="res no">${ic("alert")}</div><h2>Something went wrong</h2><p class="lead">${esc(msg)}</p><button class="btn line block" data-act="reload">Try again</button></div>`); }
  const consentBox = (id, html) => `<label class="cb" style="border:1px solid var(--line);border-radius:12px;padding:12px"><input type="checkbox" id="${id}"><span>${html}</span></label>`;
  const REVEAL_CLAUSE = ` If I win a lucky draw, my first name, department and last 4 digits of my number may be shown to everyone in this engagement.`;
  const revealOn = () => !!(J.info && J.info.revealNames === true);
  const CONSENT_BASE = `I agree to join. My name, mobile number and department are used to run this engagement. My ticket and phone details are <b>deleted within 24 hours</b> after it ends. My name and number are <b>kept for up to 365 days</b> so my organizer can invite me to future engagements, and I can ask them not to be kept at any time. <a href="/legal.html#privacy" target="_blank" rel="noopener">Privacy notice</a>`;
  const consentText = () => CONSENT_BASE.replace(' <a href="/legal.html#privacy"', (revealOn() ? REVEAL_CLAUSE : "") + ' <a href="/legal.html#privacy"');

  // ---------- state ----------
  const J = { info: null, cc: "IN", raw: "", name: "", info2: "" };
  const G = { eng: null, me: null, quotas: null, invitees: [], consoleLink: null, tickets: [], ids: {}, gap: 10000, status: "open", current: 0, callNo: 0, rewards: [],
    pause: null, result: null, talk: false, nextLocal: 0, heard: new Set(), cut: { A: new Set(), B: new Set(), C: new Set() }, tab: "A", hl: null, wsOpen: false, wsEver: false,
    prefetching: false, brk: null, lastMe: 0, claimR: null, claimSel: "A",
    round: 1, rounds: 1, still: null, stillPrev: null, stillMax: { lucky: 0, scratch: 0 }, surprise: null, moment: null, boosters: { joker: 0, extra: 0, pass: 0 }, note: null, jokerT: "A" };
  let ws = null, tickT = null, resultT = null;
  const BLOBS = new Map();

  // ================= JOIN FLOWS =================
  async function bootEngagement() {
    let info;
    try { info = await api("GET", `/api/e/${enc(code)}`); } catch (e) { return e.status === 404 ? errCard("badlink") : fatal(e.message); }
    J.info = info; J.cc = info.defaultCountry || TB.guessCountry();
    try { await loadMe(); return startPlay(); } catch (e) { if (e.status !== 401) return fatal(e.message); }
    if (info.status === "purged") return errCard("deleted");
    if (info.status === "ended") return errCard("endedNew");
    try {
      const s = await api("GET", `/api/e/${enc(code)}/status`);
      if (s.state === "waiting") return waitScreen();
      if (s.state === "declined") return errCard("declined");
      if (s.state === "closed") return errCard("closed");
      if (s.state === "in") { await loadMe(); return startPlay(); }
    } catch {}
    if (!info.open) return errCard("closed");
    joinScreen();
  }

  function joinScreen() {
    const i = J.info;
    show(`${ptop()}<div class="pcard"><div class="eyebrow">${esc(i.orgName)}</div><h2>${esc(i.name)}</h2>
      <p class="lead">${i.startsAt ? `Starts ${esc(TB.fmtDT(i.startsAt))} (your local time). ` : ""}Entry closes when the first number is called.</p>
      <label class="lb" for="jCc">Country</label><select class="inp" id="jCc">${TB.countryOpts(J.cc)}</select>
      <label class="lb" for="jNum">Your mobile number</label><div class="phonein"><span id="jDial">+${dial(J.cc)}</span><input id="jNum" inputmode="tel" autocomplete="tel" placeholder="98765 43210" value="${esc(J.raw)}"></div>
      <p class="hint">Enter the number your organizer has for you. Any format works.</p><div id="jErr" role="alert"></div>
      <button class="btn block" id="jGo" style="margin-top:12px">Join engagement ${ic("arrow")}</button>
      <p class="tiny muted">No SMS or code is sent. Your number is only checked against the organizer's list. Your name and number are kept for up to 365 days so your organizer can invite you again, and you can ask us not to keep them.</p></div>`);
    $("jCc").onchange = () => { J.cc = $("jCc").value; $("jDial").textContent = "+" + dial(J.cc); };
    $("jNum").onkeydown = (e) => { if (e.key === "Enter") doJoin(); };
    $("jGo").onclick = doJoin;
  }

  async function doJoin() {
    J.raw = $("jNum").value.trim(); J.cc = $("jCc").value;
    if (!J.raw) return inlineErr("jErr", "Enter your mobile number.");
    inlineErr("jErr", ""); busy("jGo", true);
    try {
      const r = await api("POST", `/api/e/${enc(code)}/join`, { raw: J.raw, country: J.cc });
      if (r.t === "bad") { busy("jGo", false); return inlineErr("jErr", String(r.reason || "That number does not look right.").replace(/\.?$/, ".")); }
      if (r.t === "err") return errCard(r.k);
      if (r.t === "game") { await loadMe(); return startPlay(); }
      if (r.t === "wait") return waitScreen();
      if (r.t === "ask") return askScreen(r.display);
      if (r.t === "consent") return consentScreen(r);
      busy("jGo", false); inlineErr("jErr", "Something went wrong. Please try again.");
    } catch (e) { busy("jGo", false); inlineErr("jErr", e.message); }
  }

  function consentScreen(r) {
    show(`${ptop()}<div class="pcard"><div class="eyebrow">You're on the list</div><h2>Is this you?</h2>
      <div class="mname" aria-label="Masked name">${esc(r.name)}</div><p class="small muted" style="margin:0 0 8px">${r.e164Display ? "Number " + esc(r.e164Display) : ""}</p>
      <p class="lead">Your full name appears on your ticket only. Other participants never see it.</p>
      ${consentBox("cOk", consentText())}<div id="cErr" role="alert"></div>
      <button class="btn block" id="cGo">Yes, this is me. Join ${ic("arrow")}</button>
      <p class="center"><button class="linkbtn" id="cBack">No, use a different number</button></p>
      <p class="tiny muted">This phone becomes your ticket. If you open the engagement on another phone, it will be blocked.</p></div>`);
    $("cBack").onclick = joinScreen;
    $("cGo").onclick = async () => {
      if (!$("cOk").checked) return inlineErr("cErr", "Please tick the box to join.");
      busy("cGo", true);
      try { await api("POST", `/api/e/${enc(code)}/confirm`, { raw: J.raw, country: J.cc, consent: true }); await loadMe(); startPlay(); }
      catch (e) { busy("cGo", false); inlineErr("cErr", e.message); }
    };
  }

  function askScreen(display) {
    show(`${ptop()}<div class="pcard"><div class="eyebrow">Not on the list yet</div><h2>Ask to join</h2>
      <p class="lead"><span class="mono">${esc(display || "")}</span> is not on the organizer's list. Send a request and the organizer can let you in.</p>
      <label class="lb" for="aName">Your name</label><input class="inp" id="aName" maxlength="30" autocomplete="name" placeholder="So the organizer knows you" value="${esc(J.name)}">
      <label class="lb" for="aInfo">Department or flat (optional)</label><input class="inp" id="aInfo" maxlength="30" placeholder="e.g. Finance, or B-402" value="${esc(J.info2)}">
      ${consentBox("aOk", "I agree that my name and number are shared with the organizer for this engagement. My ticket and phone details are <b>deleted within 24 hours</b> after it ends. My name and number are <b>kept for up to 365 days</b> so the organizer can invite me again, unless I ask them not to be kept." + (revealOn() ? REVEAL_CLAUSE : ""))}<div id="aErr" role="alert"></div>
      <button class="btn block" id="aGo">Ask to join ${ic("arrow")}</button>
      <p class="center"><button class="linkbtn" id="aBack">Use a different number</button></p></div>`);
    $("aBack").onclick = joinScreen;
    $("aGo").onclick = async () => {
      J.name = $("aName").value.trim(); J.info2 = $("aInfo").value.trim();
      if (J.name.length < 2) return inlineErr("aErr", "Please enter your name.");
      if (!$("aOk").checked) return inlineErr("aErr", "Please tick the box to send your request.");
      busy("aGo", true);
      try { await api("POST", `/api/e/${enc(code)}/request`, { raw: J.raw, country: J.cc, name: J.name, info: J.info2, consent: true }); waitScreen(); }
      catch (e) { busy("aGo", false); inlineErr("aErr", e.message); }
    };
  }

  function waitScreen() {
    show(`${ptop()}<div class="pcard center"><div class="res">${ic("clock")}</div><h2>Your request is with the organizer</h2>
      <p class="lead">Keep this page open. You will get in as soon as the organizer admits you. Entry closes when the first number is called.</p><div class="waitdots"><i></i><i></i><i></i></div></div>`);
    const goIn = async () => { try { await loadMe(); TB.toast("The organizer let you in"); startPlay(); } catch { /* keep waiting */ } };
    // The organizer's decision is PUSHED to this phone; the slow poll below is only a safety net.
    waitWs = TB.ws(code, {}, (m) => {
      if (m.type === "admitted") goIn();
      else if (m.type === "declined") errCard("declined");
      else if (m.type === "live" || m.type === "ended") errCard("closed");
    });
    const poll = async () => {
      try {
        const s = await api("GET", `/api/e/${enc(code)}/status`);
        if (s.state === "in") return goIn();
        if (s.state === "declined") return errCard("declined");
        if (s.state === "closed") return errCard("closed");
        if (s.state === "none") return joinScreen();
      } catch {}
    };
    pollT = setInterval(poll, 20000);
  }

  async function bootPass() {
    show(`<div class="pcard center"><div class="waitdots"><i></i><i></i><i></i></div><p class="muted">Opening your pass…</p></div>`);
    let r;
    try { r = await api("POST", `/api/p/${enc(LINK)}/open`); } catch (e) { return fatal(e.message); }
    if (r.t === "game") { code = r.engagement.code; try { await loadMe(); return startPlay(); } catch (e) { return e.status === 401 ? errCard("inuse") : fatal(e.message); } }
    if (r.t === "err") return errCard(["cancelled", "badlink", "inuse", "closed", "full"].includes(r.k) ? r.k : "badlink");
    if (r.t !== "pass") return errCard("badlink");
    J.info = r.engagement;
    show(`${ptop()}<div class="pcard"><div class="eyebrow">Your personal pass</div><h2>Hi ${esc(firstName(r.name))}, this is your pass for <em>${esc(r.engagement.name)}</em></h2>
      <p class="lead">From ${esc(r.engagement.orgName)}. It works on one phone only, so please do not forward it. Nothing to type.</p>
      ${r.engagement.startsAt ? `<div class="passbox"><span>Starts</span><b>${esc(TB.fmtDT(r.engagement.startsAt))}</b></div>` : ""}
      ${consentBox("pOk", consentText())}<div id="pErr" role="alert"></div>
      <button class="btn block" id="pGo">Join engagement ${ic("arrow")}</button></div>`);
    $("pGo").onclick = async () => {
      if (!$("pOk").checked) return inlineErr("pErr", "Please tick the box to join.");
      busy("pGo", true);
      try { const c = await api("POST", `/api/p/${enc(LINK)}/confirm`, { consent: true }); code = c.code || r.engagement.code; await loadMe(); startPlay(); }
      catch (e) { busy("pGo", false); inlineErr("pErr", e.message); }
    };
  }

  // ================= LIVE TICKET =================
  // Round 1 keeps the original key; later rounds get their own (every round has new tickets and a new call list).
  const storeKey = () => `tb_play_${code}_${TB.device().slice(0, 8)}${G.round > 1 ? "_r" + G.round : ""}`;
  function saveLocal() { TB.store.set(storeKey(), JSON.stringify({ heard: [...G.heard], A: [...G.cut.A], B: [...G.cut.B], C: [...G.cut.C] })); }
  function loadLocal() {
    try { const o = JSON.parse(TB.store.get(storeKey()) || "null"); if (o) { G.heard = new Set(o.heard || []); G.cut.A = new Set(o.A || []); G.cut.B = new Set(o.B || []); G.cut.C = new Set(o.C || []); } } catch {}
  }
  // Returns true when the round changed (this round's heard/cut sets are replaced by the saved ones for the new round).
  function switchRound(r) {
    r = Number(r) || 1;
    if (G.localLoaded && r === G.round) return false;
    G.round = r; G.localLoaded = true; G.heard = new Set(); G.cut = { A: new Set(), B: new Set(), C: new Set() }; loadLocal();
    return true;
  }
  const autoOn = () => !!(G.surprise && G.surprise.autoMark);
  const LET = ["A", "B", "C"];
  const curTab = () => (LET.indexOf(G.tab) < G.tickets.length ? G.tab : "A");
  function automark(n) {
    let ch = false;
    G.tickets.forEach((t, i) => { const L = LET[i]; if (L && t.flat().includes(n) && !G.cut[L].has(n)) { G.cut[L].add(n); ch = true; } });
    return ch;
  }
  function hear(n) {
    if (!n) return; let ch = false;
    if (!G.heard.has(n)) { G.heard.add(n); ch = true; }
    if (autoOn() && automark(n)) ch = true;
    if (ch) saveLocal();
  }

  async function loadMe() {
    const d = await api("GET", `/api/e/${enc(code)}/me`);
    switchRound(d.state && d.state.round); // must run before hear() can overwrite saved cuts
    G.lastMe = Date.now(); G.eng = d.engagement; G.me = d.me; G.quotas = d.quotas; G.invitees = d.invitees || []; G.consoleLink = d.consoleLink;
    G.tickets = d.me.tickets || []; G.ids = d.me.ticketIds || {}; if (G.tickets.length > 2 && !G.ids.C && G.ids.A) G.ids.C = G.ids.A.replace(/-A$/, "-C"); G.gap = d.engagement.gapMs || 10000;
    const s = d.state; applyOptional(s); G.boosters = d.boosters || G.boosters;
    if (LET.indexOf(G.tab) >= G.tickets.length) G.tab = "A";
    G.status = s.status; G.liveLocal = s.liveIn != null ? Date.now() + s.liveIn : 0; G.callNo = s.callNo; G.current = s.current; G.rewards = s.rewards || [];
    if (G.status === "started" && G.current) hear(G.current);
    if (autoOn()) { let ch = false; G.heard.forEach((n) => { if (automark(n)) ch = true; }); if (ch) saveLocal(); }
    if (d.nextAt) { let rem = d.nextAt - Date.now(); if (rem < -1500 || rem > G.gap + 1500) rem = G.gap; G.nextLocal = Date.now() + Math.max(0, rem); } else G.nextLocal = 0;
    const p = d.paused;
    if (!p) { G.pause = null; if (G.brk) hideBreak(); }
    else {
      G.pause = { kind: p.type, reason: p.reason || "" };
      if (p.type === "break" && p.brk && !G.brk) {
        const b = (G.eng.breaks || []).find((x) => x.title === p.brk.title) || {};
        let secs = p.brk.until ? Math.round((p.brk.until - Date.now()) / 1000) : p.brk.seconds;
        if (!(secs > 0 && secs <= p.brk.seconds + 2)) secs = p.brk.seconds;
        showBreak({ title: p.brk.title, kind: p.brk.kind, seconds: secs, mediaUrl: b.mediaUrl });
      }
    }
    if (G.moment) syncMoment(G.moment, false);
  }
  // The optional-feature fields of the server's public state (null/absent when no optional feature is on).
  function applyOptional(s) {
    G.rounds = s.rounds || 1; G.surprise = s.surprise || null;
    const st = s.still && s.still.enabled !== false ? s.still : null;
    G.still = st;
    if (st) { G.stillMax.lucky = Math.max(G.stillMax.lucky, st.lucky || 0); G.stillMax.scratch = Math.max(G.stillMax.scratch, st.scratch || 0); }
    G.moment = s.moment || null;
  }
  async function reload(repaint = true) {
    try { await loadMe(); if (repaint) paintAll(); }
    catch (e) { if (e.status === 401) { stopLive(); errCard("moved"); } }
  }

  function stopLive() { if (ws) ws.close(); ws = null; G.wsOpen = false; G.wsEver = false; clearInterval(tickT); hideBreak(); closeMoment(); $("bnr").innerHTML = ""; }

  function startPlay() {
    if (G.status === "ended" || G.status === "purged") return endedScreen(G.status === "purged");
    show(`${ptop(true)}<div class="bp"><div class="bphd" id="hd"></div><div id="strip"></div><div id="still"></div><div id="boost"></div><div class="fields" id="fields"></div><div id="tabs"></div>
      <div class="tgrid" id="grid"></div><p class="pnote" id="pnote"></p><div id="notes"></div>
      <div class="plegal">Private engagement for a closed group. The organizer gives all rewards. The software only calls numbers and checks claims.</div>
      <div class="plinks"><a href="/legal.html#rules" target="_blank" rel="noopener">Rules &amp; how to play</a><a href="/legal.html#privacy" target="_blank" rel="noopener">Privacy</a><a href="/legal.html#disclaimer" target="_blank" rel="noopener">Disclaimer</a></div>
      <div class="stub" id="stub"></div></div>`);
    paintAll();
    prefetch();
    const mine = (ws = TB.ws(code, {}, onMsg, (s) => { if (ws !== mine) return; G.wsOpen = s === "open"; if (s === "open") G.wsEver = true; paintBanner(); }));
    clearInterval(tickT); tickT = setInterval(tick, 250);
  }

  // ---------- websocket ----------
  function onMsg(m) {
    switch (m.type) {
      case "state":
        switchRound(m.round); applyOptional(m);
        G.status = m.status; G.liveLocal = m.liveIn != null ? Date.now() + m.liveIn : 0; G.callNo = m.callNo; G.current = m.current; G.rewards = m.rewards || G.rewards;
        if (m.paused) { if (!G.pause || G.pause.kind !== m.paused) G.pause = { kind: m.paused, reason: "" }; } else { G.pause = null; hideBreak(); }
        if (G.status === "ended" || G.status === "purged") return endedScreen(G.status === "purged");
        if (G.status === "started" && m.current) hear(m.current);
        paintAll();
        syncMoment(G.moment, true);
        if (Date.now() - G.lastMe > 1500) reload();
        break;
      case "call":
        G.status = "started"; G.pause = null; G.current = m.number; G.callNo = m.callNo; hear(m.number); G.nextLocal = Date.now() + G.gap;
        say("Number " + m.number + " called.");
        try { if (TBAudio.unlocked) TBAudio.play(m.number); } catch {}
        paintStrip(); paintBanner(); paintRewards(); updMovBall();
        if (autoOn()) { paintTabs(); paintGrid(); }
        break;
      case "pause": G.pause = { kind: m.kind, reason: m.reason || "" }; paintStrip(); paintBanner(); paintRewards(); if (m.kind === "emergency") say("Paused. " + (m.reason || "")); break;
      case "result": showResult(m.items || []); refreshSoon(); break;
      case "break": showBreak(m); break;
      case "resume": G.pause = null; hideBreak(); paintStrip(); paintBanner(); paintRewards(); reload(); break;
      case "ended":
        G.status = "ended"; // a closing lucky draw / scratch card is allowed to finish before the thank-you screen replaces it
        if (MO.cur && !MO.after) { MO.after = () => { stopLive(); reloadForEnd(); }; setTimeout(() => { if (MO.after) closeMoment(true); }, 12000); }
        else if (!MO.after) { stopLive(); reloadForEnd(); }
        break;
      case "purged": stopLive(); endedScreen(true); break;
      case "refresh": if (m.scope === "settings") setTimeout(reload, Math.random() * 4000); else reload(); break; // random delay: thousands of phones never ask at once
      case "starting": G.status = "starting"; G.liveLocal = Date.now() + (m.inMs || 0); paintAll(); break;
      case "live": G.status = "started"; G.liveLocal = 0; paintAll(); break;
      case "loggedout": stopLive(); errCard("moved"); break;
      case "talk": G.talk = !!m.on; paintStrip(); break;
      case "round_start": onRoundStart(m); break;
      case "round_end": onRoundEnd(m); break;
      case "moment_start": onMomentStart(m); break;
      case "moment_result": onMomentResult(m); break;
      case "lucky_won": onLuckyWon(m); break;
      case "scratch_result": if (MO.cur && MO.cur.kind === "scratch" && (!m.momentId || m.momentId === MO.cur.id)) setScratchOutcome(m.outcome); break;
      case "booster": G.boosters = m.boosters || G.boosters; paintBoost(); break;
      case "presentAck":
        if (m.error) { if (MO.cur) { MO.cur.err = m.error; paintMoment(); } TB.toast(esc(m.error)); } else if (MO.cur) { MO.cur.confirmed = true; if (MO.cur.phase === "won") { MO.cur.phase = "confirmed"; paintMoment(); } say("Confirmed. Your organizer will contact you."); }
        break;
      case "scratchAck": if (m.error) { if (MO.cur) MO.cur.sent = false; TB.toast(esc(m.error)); } else if (m.outcome) setScratchOutcome(m.outcome); break;
      case "jokerAck": onJokerAck(m); break;
      case "claimAck":
        if (m.error) TB.toast(esc(m.error)); else TB.toast("Claim sent. The engagement pauses for everyone while it is checked.");
        break;
    }
  }
  async function reloadForEnd() { try { await loadMe(); } catch {} endedScreen(false); }

  function showResult(items) {
    const mine = new Set(Object.values(G.ids).filter(Boolean));
    G.result = { items: items.map((x) => ({ ...x, me: mine.has(x.ticketId) })) };
    G.pause = { kind: "result", reason: "" };
    clearTimeout(resultT); resultT = setTimeout(() => { G.result = null; paintBanner(); paintStrip(); }, 5000);
    if (G.result.items.some((x) => x.me && x.ok)) say("Reward awarded to your ticket."); else if (G.result.items.some((x) => x.me)) say("Not valid for your ticket.");
    paintStrip(); paintBanner(); paintRewards();
    setTimeout(() => reload(), 400);
  }

  // ---------- painting ----------
  function paintAll() { if (!$("strip")) return; paintHd(); paintStrip(); paintStill(); paintBoost(); paintFields(); paintTabs(); paintGrid(); paintNotes(); paintRewards(); paintBanner(); }

  function paintHd() {
    const st = { open: ["pill", "Not started yet"], starting: ["pill warn", "Starting"], started: ["pill ok", "Live"], ended: ["pill", "Ended"] }[G.status] || ["pill", G.status];
    const sw = TB.sw, swChip = sw.state === "downloading" || sw.state === "checking" ? `<span class="pill info">Getting ready ${sw.pct}%</span>` : sw.state === "ready" ? `<span class="pill ok"><i></i>Software ready</span>` : "";
    $("hd").innerHTML = `<div class="eyebrow">${esc(G.eng.orgName)}</div><h3>${esc(G.eng.name)}</h3><div class="meta"><span class="${st[0]}"><i></i>${st[1]}</span>
      ${G.eng.startsAt ? `<span>${ic("clock")} ${G.status === "open" ? "Starts" : "Started"} ${esc(TB.fmtDT(G.eng.startsAt))}</span>` : ""}${G.rounds > 1 ? `<span class="pill wine" id="rdchip">Round ${G.round} of ${G.rounds}</span>` : ""}${swChip}${G.prefetching ? `<span class="pill info">Getting videos ready</span>` : ""}</div>`;
  }

  function stripModel() {
    const p = G.pause && G.pause.kind;
    if (G.status === "starting") return { cls: "", ball: ic("clock"), eb: "Engagement starting", ln: "The first number is coming", sub: `${ic("clock")} <span id="cds"></span> Your software is ready.` };
    if (G.status === "open") return { cls: "", ball: ic("clock"), eb: "Engagement starts", ln: G.eng.startsAt ? TB.fmtDT(G.eng.startsAt) : "Soon", sub: "The organizer presses Start. The first number will appear here." };
    if (p === "claim") return { cls: "pz", ball: ic("pause"), eb: "Paused · claim received", ln: "Checking a claim...", sub: "The software is checking it. Everyone waits." };
    if (p === "result") {
      const it = (G.result && G.result.items) || [], any = it.some((x) => x.ok);
      if (!it.length) return { cls: "pz", ball: ic("pause"), eb: "Result", ln: "Checking is done", sub: "The engagement continues in a few seconds." };
      return { cls: any ? "okc" : "badc", ball: ic(any ? "check" : "x"), eb: any ? "Reward awarded" : "Not valid", ln: it.map((x) => x.ok ? x.reward : "Not valid").slice(0, 2).join(" · "), sub: "Checked by the software. The engagement continues in a few seconds." };
    }
    if (p === "break") return { cls: "brk", ball: ic("play"), eb: "Brand break", ln: G.brk ? G.brk.title : "A short break", sub: "The engagement continues right after." };
    if (p === "intermission") return { cls: "brk", ball: ic("clock"), eb: "Break between rounds", ln: "Next round starts soon", sub: "Your new ticket appears here by itself." };
    if (p === "moment") return { cls: "pz", ball: ic("star"), eb: "A surprise is on", ln: "Numbers continue right after", sub: "Your ticket is safe." };
    if (p === "emergency") return { cls: "pz", ball: ic("pause"), eb: "Paused by the host", ln: G.pause.reason || "Please wait", sub: "Please wait. Your ticket is safe." };
    const manual = G.eng.callMode === "manual";
    return { cls: "", ball: G.current ? String(G.current) : "<small>Ready</small>", eb: `Now calling · call ${G.callNo} of 90`, ln: G.current ? "Number " + G.current : (manual ? "The host is about to start…" : "The first number is on its way…"),
      sub: manual ? `${ic("mic")} The host draws the next number` : `${ic("clock")} <span id="cd"></span>`, bar: !manual };
  }
  function paintStrip() {
    const m = stripModel(), unlocked = TBAudio.unlocked;
    const tools = unlocked
      ? `<button class="spill icon ${TBAudio.enabled ? "on" : ""}" data-act="voice" aria-pressed="${TBAudio.enabled}" aria-label="Voice ${TBAudio.enabled ? "on" : "off"}" title="Voice ${TBAudio.enabled ? "on" : "off"}">${ic(TBAudio.enabled ? "vol" : "mute")}</button>`
      : `<button class="spill" data-act="audio">${ic("vol")} Join audio</button>`;
    $("strip").innerHTML = `<div class="strip2 ${m.cls}"><div class="ball" aria-hidden="true">${m.ball}</div><div>${G.talk ? `<span class="talkchip">${ic("mic")} Host speaking</span><br>` : ""}<div class="seb">${m.eb}</div><div class="sln">${esc(m.ln)}</div><div class="ssub">${m.sub}</div></div><div class="tools">${tools}</div>${m.bar ? `<div class="sbar"><i id="cdb"></i></div>` : ""}</div>`;
    tick();
  }
  function tick() {
    const cds = $("cds");
    if (cds) { const r = Math.max(0, Math.ceil((G.liveLocal - Date.now()) / 1000)); cds.textContent = r > 0 ? `First number in ${r}s.` : "Any moment now."; }
    const cd = $("cd");
    if (cd) {
      const rem = G.nextLocal - Date.now();
      cd.textContent = G.nextLocal && rem > 0 ? `Next number in ${Math.ceil(rem / 1000)}s` : (G.callNo ? "Next number any moment" : "Waiting for the first number");
      const b = $("cdb"); if (b) b.style.width = G.nextLocal && rem > 0 ? Math.min(100, (1 - rem / G.gap) * 100) + "%" : "100%";
    }
    if (G.brk) { const r = Math.max(0, Math.ceil((G.brk.until - Date.now()) / 1000)); const c = $("brkc"); if (c) c.textContent = r > 0 ? r : "…"; const l = $("brkl"); if (l) l.textContent = r > 0 ? "seconds left" : "Resuming"; }
  }

  const cardNo = (id) => { const m = /-(\d{4,})-[ABC]$/.exec(id || ""); return m ? m[1] : ""; };
  function paintFields() {
    $("fields").innerHTML = `<div><label>Participant</label><b>${esc(G.me.name)}</b></div><div><label>Date</label><b>${G.eng.startsAt ? esc(TB.fmtD(G.eng.startsAt)) : "-"}</b></div><div><label>Tickets</label><b>${G.tickets.length}</b></div>`;
  }
  function paintTabs() {
    $("tabs").innerHTML = G.tickets.length < 2 ? "" : `<div class="tabs2" role="tablist" aria-label="Your tickets">${LET.slice(0, G.tickets.length).map((t) => `<button class="chip ${curTab() === t ? "on" : ""}" role="tab" aria-selected="${curTab() === t}" data-act="tab" data-arg="${t}">Ticket ${t} <span class="tiny">· ${G.cut[t].size} cut</span></button>`).join("")}</div>`;
  }

  // pattern numbers (same rules as the server)
  const rowN = (t, r) => t[r].filter((v) => v !== null);
  function patternNums(t, p) {
    switch (p) {
      case "top": return rowN(t, 0); case "mid": return rowN(t, 1); case "bot": return rowN(t, 2);
      case "corners": { const a = rowN(t, 0), c = rowN(t, 2); return [a[0], a[4], c[0], c[4]]; }
      case "star": { const a = rowN(t, 0), b = rowN(t, 1), c = rowN(t, 2); return [a[0], a[4], c[0], c[4], b[2]]; }
      case "full": return t.flat().filter((v) => v !== null);
      default: return [];
    }
  }
  function cellsHTML(t, cutSet, hl, live) {
    const auto = autoOn();
    return t.flat().map((v) => v === null ? `<div class="cell blank"></div>`
      : live && auto ? `<div class="cell num auto ${cutSet.has(v) ? "cut" : ""} ${hl && hl.has(v) ? "hl" : ""}" role="img" aria-label="${v}${cutSet.has(v) ? ", cut" : ""}">${v}</div>`
      : live ? `<button class="cell num ${cutSet.has(v) ? "cut" : ""} ${hl && hl.has(v) ? "hl" : ""}" data-act="cell" data-arg="${v}" aria-pressed="${cutSet.has(v)}" aria-label="${v}${cutSet.has(v) ? ", cut" : ""}">${v}</button>`
        : `<div class="cell ${cutSet.has(v) ? "cut" : ""} ${hl && hl.has(v) ? "hl" : ""}">${v}</div>`).join("");
  }
  function paintGrid() {
    const tab = curTab(), t = G.tickets[LET.indexOf(tab)]; if (!t) return;
    const hl = G.hl ? new Set(patternNums(t, G.hl.pattern)) : null;
    $("grid").innerHTML = cellsHTML(t, G.cut[tab], hl, true);
    $("pnote").textContent = G.status === "started" && autoOn() ? "Called numbers are cut for you. Tap a reward name to see its pattern."
      : G.status === "started" ? "Tap a number to cut it (tap again to undo). You can cut a number only after it is called. Tap a reward name to see its pattern." : "Your ticket is ready. You can cut numbers once the first number is called.";
  }
  function paintNotes() {
    let h = "";
    if (G.me.blocked) h += `<div class="err" style="margin:0 12px 8px">${ic("lock")}<span>Your ticket is blocked after 2 Not valid claims. You can keep watching.</span></div>`;
    else if (G.me.notValid) h += `<div class="note warn" style="margin:0 12px 8px">${ic("alert")}<span>Not valid claims: ${G.me.notValid} of 2.</span></div>`;
    if (G.me.kind === "family" && !G.eng.familyCanWin) h += `<div class="note" style="margin:0 12px 8px">${ic("info")}<span>In this engagement family members take part for fun. Valid claims are shown, but rewards go to employees.</span></div>`;
    $("notes").innerHTML = h;
  }

  // ---------- rewards ----------
  const parseR = (r) => { const [pattern, scope, o] = String(r.id).split(":"); return { ...r, pattern, scope: scope || "ticket", ordinal: Number(o) || 1 }; };
  function mini(pattern) {
    const on = (r, c) => pattern === "full" || (pattern === "top" && r === 0) || (pattern === "mid" && r === 1) || (pattern === "bot" && r === 2)
      || ((pattern === "corners" || pattern === "star") && (r === 0 || r === 2) && (c === 0 || c === 8)) || (pattern === "star" && r === 1 && c === 4)
      || (pattern === "early5" && r === 1 && c % 2 === 0 && c < 9 && c / 2 < 5);
    let h = ""; for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) h += `<i class="${on(r, c) ? "p" : ""}"></i>`;
    return `<span class="mini" aria-hidden="true">${h}</span>`;
  }
  function paintRewards() {
    const two = G.tickets.length > 1;
    const list = G.rewards.map(parseR).filter((r) => r.scope !== "two_ticket" || two);
    const kinds = [...new Set(list.map((r) => r.pattern + ":" + r.scope))];
    list.sort((a, b) => kinds.indexOf(a.pattern + ":" + a.scope) - kinds.indexOf(b.pattern + ":" + b.scope) || a.ordinal - b.ordinal);
    const mine = new Set(Object.values(G.ids).filter(Boolean));
    const nextOpen = new Set(); const seen = new Set();
    for (const r of list) { const k = r.pattern + ":" + r.scope; if (!seen.has(k) && !(r.winners || []).length) { nextOpen.add(r.id); seen.add(k); } }
    const pz = G.pause && G.pause.kind;
    const canNow = G.status === "started" && !G.me.blocked && G.callNo > 0 && (!pz || pz === "claim");
    const open = list.filter((r) => !(r.winners || []).length).length;
    const rows = list.map((r) => {
      const won = (r.winners || []).length > 0, isNext = nextOpen.has(r.id);
      const ids = (r.winners || []).map((w) => `${esc(w)}${mine.has(w) ? ` <span class="mine">(you)</span>` : ""}`).join("<br>");
      return `<div class="pzr ${won ? "won" : ""} ${!won && !isNext ? "later" : ""} ${G.hl && G.hl.id === r.id ? "sel" : ""}">
        <button class="nm" data-act="hl" data-arg="${esc(r.id)}" aria-label="Show pattern for ${esc(r.name)}">${mini(r.pattern)}<b>${esc(r.name)}</b><small>${esc(r.text)}</small>${won ? `<em>${ids}</em>` : ""}</button>
        <span class="rt"><span class="pill ${won ? "ok" : ""}">${won ? "Awarded" : "Open"}</span>${won ? "" : isNext ? `<button class="cl" data-act="claim" data-arg="${esc(r.id)}" ${canNow ? "" : "disabled"}>Claim</button>` : `<span class="tiny muted">After the previous one</span>`}</span></div>`;
    }).join("");
    const ids = [G.ids.A, G.tickets.length > 1 ? G.ids.B : null, G.tickets.length > 2 ? G.ids.C : null].filter(Boolean);
    $("stub").innerHTML = `<div class="stubh"><span>Rewards</span><span>${open} open</span></div>${rows || `<p class="muted small">No rewards have been set up yet.</p>`}
      <div class="row" style="justify-content:space-between;margin-top:12px;align-items:flex-start"><span><span class="tiny muted">TICKET NO.</span><br><b style="font:600 18px var(--serif);color:var(--wine)">${esc(cardNo(G.ids.A))}</b></span><span class="tid" style="text-align:right">${ids.map(esc).join("<br>")}</span></div>`;
  }

  function paintBanner() {
    const out = [];
    if (G.wsEver && !G.wsOpen) out.push(`<div class="warn" role="status"><b>Reconnecting…</b>Your ticket is safe. Numbers continue when the connection returns.</div>`);
    const p = G.pause && G.pause.kind;
    if (p === "claim") out.push(`<div class="info"><b>${ic("pause")} Checking a claim...</b>The engagement is paused for everyone for a moment.</div>`);
    if (p === "emergency") out.push(`<div class="warn"><b>${ic("pause")} Paused by the host</b>${esc(G.pause.reason || "Please wait.")}</div>`);
    if (G.result && G.result.items.length) {
      const it = G.result.items, any = it.some((x) => x.ok), me = it.some((x) => x.me);
      out.push(`<div class="${any ? "ok" : "bad"}" role="status"><b>${any ? "Checked: reward awarded" : "Checked: not valid"}</b><ul>${it.map((x) =>
        `<li>${ic(x.ok ? "check" : "x")}<span>${x.ok ? (x.fun ? `Valid, family takes part for fun: ${esc(x.reward)}` : `Reward awarded: ${esc(x.reward)}`) : "Not valid"} - <span class="mono">${esc(x.ticketId)}</span>${x.me ? `<span class="you">That is you!</span>` : ""}</span></li>`).join("")}</ul>${me ? "" : ""}</div>`);
    }
    if (G.note) {
      const n = G.note;
      if (n.round) out.push(`<div class="info" role="status"><b>${ic("flag")} Round ${n.round} finished</b>${G.pause && G.pause.kind === "intermission" ? "Next round starts soon." : ""}</div>`);
      else out.push(`<div class="info" role="status">${n.html}</div>`);
    }
    $("bnr").innerHTML = out.join("");
  }

  // ---------- actions ----------
  const ACT = {
    reload: () => location.reload(),
    forget: () => TB.sheet(`<div class="eyebrow">Your details</div><h2>Do not keep my details?</h2><p class="muted small">Your organizer will not be able to invite you again from a saved list. Your ticket and phone details are deleted within 24 hours either way. This cannot be undone, but you can still be invited again with a new link.</p><button class="btn block" data-act="doforget">Yes, do not keep my name and number</button><button class="btn line block" data-act="close">Cancel</button>`),
    doforget: async () => { try { await api("POST", `/api/e/${enc(code)}/me/forget`); TB.closeSheet(); TB.toast("Done. We will not keep your name and number."); } catch (e) { TB.toast(esc(e.message)); } },
    audio: async () => { await TBAudio.unlock(); TBAudio.preload(); paintStrip(); TB.toast("Audio is on. You will hear each number."); },
    voice: () => { TBAudio.enabled = !TBAudio.enabled; if (!TBAudio.enabled) TBAudio.stop(); paintStrip(); },
    tab: (t) => { G.tab = LET.indexOf(t) < G.tickets.length ? t : "A"; paintTabs(); paintGrid(); },
    hl: (id) => { const r = G.rewards.map(parseR).find((x) => x.id === id); G.hl = G.hl && G.hl.id === id ? null : r; paintGrid(); paintRewards(); },
    cell: (arg) => {
      if (autoOn()) return;
      const n = Number(arg), tab = curTab();
      if (!G.heard.has(n)) return TB.toast("That number has not been called yet.");
      const s = G.cut[tab]; s.has(n) ? s.delete(n) : s.add(n);
      saveLocal(); try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(8); } catch {}
      paintTabs(); paintGrid();
    },
    claim: (id) => claimSheet(id),
    csel: (t) => { G.claimSel = t; renderClaim(); },
    doclaim: () => {
      const R = G.claimR; if (!R) return; TB.closeSheet();
      const two = R.scope === "two_ticket", t = two ? "AB" : (G.tickets.length > 1 ? G.claimSel : "A");
      const cut = t === "AB" ? [...G.cut.A, ...G.cut.B] : [...G.cut[t]];
      if (!ws || !G.wsOpen) return TB.toast("Not connected right now. Try again in a moment.");
      ws.send({ type: "claim", ticket: t, pattern: R.pattern, cut });
    },
    close: () => TB.closeSheet(),
    menu: () => menuSheet(),
    fam: () => famSheet("family"),
    inv: () => famSheet("invite"),
    copy: (v) => TB.copy(v, "Link copied"),
    famnew: () => famSheet(FS.kind),
    privacy: () => {},
  };
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]"); if (!el || el.disabled) return;
    const f = ACT[el.dataset.act]; if (f) f(el.dataset.arg, el);
  });

  // ---------- claim ----------
  function claimSheet(id) {
    const R = G.rewards.map(parseR).find((x) => x.id === id); if (!R) return;
    G.claimR = R; G.claimSel = R.scope === "two_ticket" ? "AB" : (G.tickets.length > 1 ? curTab() : "A");
    renderClaim();
  }
  function renderClaim() {
    const R = G.claimR, two = R.scope === "two_ticket", multi = G.tickets.length > 1;
    const grid = (i) => { const t = G.tickets[i], k = LET[i]; return `${two ? `<div class="tcap"><b>Ticket ${k}</b></div>` : ""}<div class="tgrid sg">${cellsHTML(t, G.cut[k], new Set(patternNums(t, R.pattern)), false)}</div>`; };
    const sel = G.claimSel;
    TB.sheet(`<div class="eyebrow">Confirm your claim</div><h2>${esc(R.name)}</h2><p class="muted small">${esc(PDESC[R.pattern] || "")}. Reward: ${esc(R.text)}.</p>
      ${multi && !two ? `<div class="chips" role="group" aria-label="Which ticket">${LET.slice(0, G.tickets.length).map((t) => `<button class="chip ${sel === t ? "on" : ""}" data-act="csel" data-arg="${t}" aria-pressed="${sel === t}">Ticket ${t}</button>`).join("")}</div>` : ""}
      <div class="bp" style="margin-top:10px">${two ? grid(0) + grid(1) : grid(Math.max(0, LET.indexOf(sel)))}</div>
      <p class="tiny muted center">${R.pattern === "early5" ? "You need at least 5 cut numbers that have been called." : "Outlined numbers are the ones this reward needs. Make sure all are cut."} The engagement pauses for everyone while the software checks.</p>
      <button class="btn gold block" data-act="doclaim">${ic("trophy")} Confirm claim${multi && !two ? " for Ticket " + sel : ""}</button><button class="btn line block" data-act="close">Cancel</button>`);
  }

  // ---------- menu, family passes, invites ----------
  function menuSheet() {
    const q = G.quotas, out = [];
    if (q.family && q.family.limit > 0) out.push(`<button data-act="fam">${ic("users")} Bring your family (${q.family.used}/${q.family.limit})</button>`);
    if (q.invites && q.invites.max > 0) out.push(`<button data-act="inv">${ic("mail")} Invite a colleague (${q.invites.used}/${q.invites.max})</button>`);
    if (G.consoleLink) out.push(`<a href="${esc(G.consoleLink)}">${ic("sliders")} ${G.me.role === "host" ? "Host console" : "My Team Lead page"}</a>`);
    out.push(`<button data-act="forget">${ic("trash")} Do not keep my details</button>`);
    out.push(`<a href="/legal.html#rules" target="_blank" rel="noopener">${ic("rules")} Rules &amp; how to play</a>`,
      `<a href="/legal.html#privacy" target="_blank" rel="noopener">${ic("shield")} Privacy &amp; your data</a>`,
      `<a href="/legal.html#disclaimer" target="_blank" rel="noopener">${ic("info")} Disclaimer</a>`,
      `<a href="mailto:care@yourbrand.in?subject=${enc("Corporate Tambola - " + G.eng.name)}">${ic("mail")} Write to us</a>`);
    TB.sheet(`<div class="eyebrow">Menu</div><h2>${esc(firstName(G.me.name) || "Your ticket")}</h2><div class="pmenu">${out.join("")}</div><button class="btn line block" data-act="close" style="margin-top:8px">Close</button>`);
  }

  const FS = { kind: "family", cc: null, name: "", raw: "", info: "", cancelArm: null };
  function waDigits(raw, cc) {
    let d = String(raw).replace(/\D/g, ""); const dc = String(dial(cc));
    if (String(raw).trim().startsWith("+")) return d;
    d = d.replace(/^0+/, ""); return d.startsWith(dc) && d.length > 10 ? d : dc + d;
  }
  const waLink = (digits, msg) => `https://wa.me/${digits ? digits : ""}?text=${enc(msg)}`;
  const waMsg = (name, link) => `Hi ${firstName(name)}, here is your personal pass for ${G.eng.name} by ${G.eng.orgName}: ${link}\nIt works on one phone only, please do not forward it.`;

  async function famSheet(kind) {
    FS.kind = kind; FS.cc = FS.cc || G.eng.defaultCountry || TB.guessCountry();
    try { await loadMe(); } catch {}
    const inv = kind === "invite", q = inv ? G.quotas.invites : G.quotas.family;
    if (!q) return TB.closeSheet();
    const lim = inv ? q.max : q.limit, used = q.used;
    const list = G.invitees.filter((x) => (inv ? x.kind !== "family" : x.kind === "family"));
    const st = (x) => x.status === "joined" ? `<span class="pill ok">Joined</span>` : `<span class="pill warn">${x.link ? "Pass not used yet" : "Waiting"}</span>`;
    const rows = list.map((x) => `<div class="inv"><div class="row"><b>${esc(x.name)}</b><span class="sp"></span>${st(x)}</div>
      ${x.link && x.status !== "joined" ? `<div class="linkbox" style="margin-top:6px">${esc(x.link)}</div><div class="row">
        <button class="btn sm line" data-act="copy" data-arg="${esc(waMsg(x.name, x.link))}">${ic("copy")} Copy</button>
        <a class="btn sm line" target="_blank" rel="noopener" href="${esc(waLink("", waMsg(x.name, x.link)))}">${ic("phone")} WhatsApp</a>
        <button class="btn sm line" data-pid="${esc(x.id)}" data-pa="reissue">New link</button>
        <button class="btn sm danger" data-pid="${esc(x.id)}" data-pa="cancel">${FS.cancelArm === x.id ? "Tap again to cancel" : "Cancel pass"}</button></div>` : ""}</div>`).join("");
    const full = used >= lim;
    TB.sheet(`<div class="eyebrow">${inv ? "Colleague invites" : "Family passes"} · ${used} of ${lim} used</div><h2>${inv ? "Invite a colleague" : "Bring your family"}</h2>
      <p class="muted small">${inv ? "Your invite goes to the waiting room. The organizer decides." : `Each family member gets a personal pass for one phone. They ${G.eng.familyCanWin ? "can win rewards" : "take part for fun (no rewards in this engagement)"}. Family members cannot invite anyone.`}</p>
      ${rows}${G.status !== "open" ? `<div class="err">${ic("lock")}<span>Entry is closed. The engagement has started.</span></div>` : full ? `<div class="err">${ic("alert")}<span>You have used all ${lim}.</span></div>` : `
      <label class="lb" for="fName">Their name</label><input class="inp" id="fName" maxlength="30" value="${esc(FS.name)}" autocomplete="off">
      ${inv ? `<label class="lb" for="fInfo">Department or flat (optional)</label><input class="inp" id="fInfo" maxlength="30" value="${esc(FS.info)}">` : ""}
      <label class="lb" for="fCc">Country</label><select class="inp" id="fCc">${TB.countryOpts(FS.cc)}</select>
      <label class="lb" for="fNum">Their mobile number</label><input class="inp" id="fNum" inputmode="tel" value="${esc(FS.raw)}" placeholder="Any format"><p class="hint">The pass will work only for this number.</p><div id="fErr" role="alert"></div>
      <button class="btn block" id="fGo" style="margin-top:10px">${inv ? "Send invite" : "Create pass"} ${ic("arrow")}</button>`}
      <button class="btn line block" data-act="close" style="margin-top:8px">Close</button>`);
    if ($("fGo")) $("fGo").onclick = () => fsCreate(kind);
    document.querySelectorAll("[data-pid]").forEach((b) => (b.onclick = () => passAction(b.dataset.pid, b.dataset.pa)));
  }
  function readFS() { FS.name = ($("fName") || {}).value || ""; FS.raw = ($("fNum") || {}).value || ""; FS.cc = ($("fCc") || {}).value || FS.cc; FS.info = ($("fInfo") || {}).value || ""; }
  async function fsCreate(kind) {
    readFS();
    if (FS.name.trim().length < 2) return inlineErr("fErr", "Enter their name.");
    if (!FS.raw.trim()) return inlineErr("fErr", "Enter their mobile number.");
    busy("fGo", true); inlineErr("fErr", "");
    try {
      if (kind === "invite") {
        await api("POST", `/api/e/${enc(code)}/me/invite`, { name: FS.name.trim(), info: FS.info.trim(), raw: FS.raw, country: FS.cc });
        FS.name = ""; FS.raw = ""; FS.info = ""; TB.toast("Invite sent to the waiting room"); return famSheet("invite");
      }
      const r = await api("POST", `/api/e/${enc(code)}/me/passes`, { name: FS.name.trim(), raw: FS.raw, country: FS.cc, kind: "family" });
      const digits = waDigits(FS.raw, FS.cc); const nm = r.name || FS.name; FS.name = ""; FS.raw = "";
      passReady(r.link, nm, digits);
    } catch (e) { busy("fGo", false); inlineErr("fErr", e.message); }
  }
  function passReady(link, name, digits) {
    const msg = waMsg(name, link);
    TB.sheet(`<div class="res ok">${ic("check")}</div><h2 class="center">Pass ready for ${esc(firstName(name))}</h2>
      <div class="passbox"><span>Pass link</span><b class="mono" style="font-size:12.5px;word-break:break-all">${esc(link)}</b></div>
      <a class="btn block" target="_blank" rel="noopener" href="${esc(waLink(digits, msg))}">${ic("phone")} Send to ${esc(firstName(name))} on WhatsApp</a>
      <button class="btn line block" data-act="copy" data-arg="${esc(msg)}">${ic("copy")} Copy link and message</button>
      <p class="tiny muted center">WhatsApp opens with the message ready. You press send. Not on WhatsApp? Use Copy and send it any way you like.</p>
      <button class="btn line block" data-act="famnew">Back to family passes</button>`);
  }
  async function passAction(pid, a) {
    try {
      if (a === "cancel") {
        if (FS.cancelArm !== pid) { FS.cancelArm = pid; return famSheet(FS.kind); }
        FS.cancelArm = null; await api("DELETE", `/api/e/${enc(code)}/me/passes/${enc(pid)}`); TB.toast("Pass cancelled. The place is free again."); return famSheet(FS.kind);
      }
      const r = await api("POST", `/api/e/${enc(code)}/me/passes/${enc(pid)}/reissue`);
      const x = G.invitees.find((i) => i.id === pid); passReady(r.link, x ? x.name : "", "");
    } catch (e) { TB.toast(esc(e.message)); }
  }

  // ---------- brand break ----------
  function ytId(u) {
    try {
      const x = new URL(u), h = x.hostname.replace(/^www\./, "");
      if (h === "youtu.be") return x.pathname.slice(1).split("/")[0];
      if (/youtube(-nocookie)?\.com$/.test(h)) return x.searchParams.get("v") || (/^\/(embed|shorts|live|v)\/([\w-]+)/.exec(x.pathname) || [])[2] || "";
    } catch {}
    return "";
  }
  async function cachedUrl(u) {
    if (BLOBS.has(u)) return BLOBS.get(u);
    try { if ("caches" in window) { const c = await caches.open("tb-media-v1"), r = await c.match(u); if (r && r.type !== "opaque") { const b = URL.createObjectURL(await r.blob()); BLOBS.set(u, b); return b; } } } catch {}
    return u;
  }
  async function showBreak(b) {
    hideBreak();
    G.pause = { kind: "break", reason: "" };
    const secs = Number(b.seconds) || 30;
    G.brk = { title: b.title, kind: b.kind, until: Date.now() + secs * 1000 };
    const ov = document.createElement("div"); ov.className = "brkov"; ov.id = "brk"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Brand break");
    let media = `<div class="card">${b.kind === "slides" ? "Presentation" : b.kind === "speech" ? "A short speech" : esc(b.title)}</div>`;
    if (b.kind === "youtube" && b.mediaUrl && ytId(b.mediaUrl)) media = `<iframe title="${esc(b.title)}" src="https://www.youtube-nocookie.com/embed/${enc(ytId(b.mediaUrl))}?autoplay=1&playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    else if (b.kind === "file" && b.mediaUrl) media = `<video id="brkv" autoplay playsinline></video>`;
    ov.innerHTML = `<div class="eyebrow">Brand break · ${esc(G.eng ? G.eng.orgName : "")}</div><h2>${esc(b.title)}</h2>${media}<div><div class="cnt" id="brkc">${secs}</div><div class="cntl" id="brkl">seconds left</div></div><div class="cntl">The engagement continues right after.</div>`;
    document.body.appendChild(ov);
    paintStrip(); paintBanner();
    const v = $("brkv");
    if (v) {
      v.onerror = () => { const c = document.createElement("div"); c.className = "card"; c.textContent = b.title; v.replaceWith(c); };
      v.src = await cachedUrl(b.mediaUrl);
      v.play().catch(() => { v.muted = true; v.play().catch(() => { v.controls = true; }); });
    }
  }
  function hideBreak() { G.brk = null; const o = $("brk"); if (o) o.remove(); }

  async function prefetch() {
    if (navigator.connection && navigator.connection.saveData) return;
    const urls = [...new Set((G.eng.breaks || []).filter((b) => b.kind === "file" && b.mediaUrl).map((b) => b.mediaUrl))];
    if (!urls.length || !("caches" in window)) return;
    G.prefetching = true; paintHd();
    try {
      const cache = await caches.open("tb-media-v1");
      for (const u of urls) {
        try {
          let r = await cache.match(u);
          if (!r) { const f = await fetch(u); if (f.ok) { await cache.put(u, f.clone()); r = f; } }
          if (r && r.type !== "opaque") BLOBS.set(u, URL.createObjectURL(await r.blob()));
        } catch {}
      }
    } catch {}
    G.prefetching = false; paintHd();
  }

  // ---------- ended ----------
  function endedScreen(deleted) {
    stopLive();
    const mine = new Set(Object.values(G.ids || {}).filter(Boolean));
    const won = (G.rewards || []).map(parseR).filter((r) => (r.winners || []).some((w) => mine.has(w)));
    show(`${ptop()}<div class="pcard center"><div class="res ok">${ic("flag")}</div><h2>Thank you for taking part</h2>
      <p class="lead">${deleted ? "This engagement has ended and its data has been deleted." : G.rounds > 1 ? "All rounds are finished." : "The engagement has ended."} The organizer gives the rewards directly. The software only called numbers and checked claims.</p>
      ${won.length ? `<div class="note ok" style="text-align:left">${ic("trophy")}<span>Your ticket won: <b>${won.map((r) => esc(r.name)).join(", ")}</b>. Your organizer will give the reward.</span></div>` : ""}
      ${deleted ? "" : `<p class="tiny muted">Your ticket and phone details are deleted within 24 hours. Your name and number are kept for up to 365 days so your organizer can invite you again.</p><button class="btn line block" data-act="forget">${ic("trash")} Do not keep my details</button>`}</div>
      <div class="plegal">Private engagement for a closed group. The organizer gives all rewards. The software only calls numbers and checks claims.</div>
      <div class="plinks"><a href="/legal.html#rules" target="_blank" rel="noopener">Rules</a><a href="/legal.html#privacy" target="_blank" rel="noopener">Privacy</a><a href="/legal.html#disclaimer" target="_blank" rel="noopener">Disclaimer</a></div>`);
  }


  // ================= OPTIONAL FEATURES: rounds, still to win, boosters, lucky draw, scratch card =================
  const REDUCED = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
  const BNAME = { joker: "Joker", extra: "Extra ticket", pass: "Lucky draw pass" };
  const SCR = { gift: "You won a gift! Your organizer will give it", joker: "You won a Joker", extra: "Extra ticket won (used in the next round)", pass: "Lucky draw pass won (used in the next draw)", none: "Better luck next time" };
  const prizeText = (p) => p === "gift" ? "a gift" : p === "booster" ? "a booster (Joker, Extra ticket or Lucky draw pass)" : p === "mix" ? "a gift or a booster" : BNAME[p] ? "a " + BNAME[p] : "a reward";
  let refreshT = null;
  function refreshSoon() { clearTimeout(refreshT); refreshT = setTimeout(() => reload(), 700); }

  // ---- still to win strip ----
  function paintStill() {
    const el = $("still"); if (!el) return;
    const st = G.still;
    if (!st) { el.innerHTML = ""; G.stillPrev = null; return; }
    const prev = G.stillPrev || {};
    const pop = (k) => (prev[k] != null && st[k] < prev[k] ? "pop" : "");
    const item = (k, n, one, many) => `<div class="sti"><b class="${pop(k)}">${n}</b><span>${n === 1 ? one : many}</span></div>`;
    const all = !st.prizes && !st.lucky && !st.scratch;
    const items = [item("prizes", st.prizes, "Reward", "Rewards")];
    if (st.lucky > 0 || G.stillMax.lucky > 0) items.push(item("lucky", st.lucky, "lucky draw", "lucky draws"));
    if (st.scratch > 0 || G.stillMax.scratch > 0) items.push(item("scratch", st.scratch, "scratch card", "scratch cards"));
    el.innerHTML = `<div class="still" role="group" aria-label="Still to win">${all
      ? `<div class="stdone">${ic("check")} All rewards won. Thank you for taking part!</div>`
      : `<div class="stt">Still to win</div><div class="stg">${items.join("")}</div>${st.next ? `<div class="stnext">Next surprise: ${esc(st.next)}</div>` : ""}`}</div>`;
    G.stillPrev = { prizes: st.prizes, lucky: st.lucky, scratch: st.scratch };
  }

  // ---- boosters tray ----
  function paintBoost() {
    const el = $("boost"); if (!el) return;
    const b = G.boosters || {}, on = G.surprise && G.surprise.boostersAllowed;
    if (!on || !(b.joker > 0 || b.extra > 0 || b.pass > 0)) { el.innerHTML = ""; return; }
    el.innerHTML = `<div class="boost" role="group" aria-label="Your boosters">
      ${b.joker > 0 ? `<button class="bchip joker" data-act="joker" aria-label="Use a Joker. You have ${b.joker}">${ic("star")} Joker ×${b.joker}</button>` : ""}
      ${b.extra > 0 ? `<span class="bchip">${ic("ticket")} Extra ticket ×${b.extra} (next round)</span>` : ""}
      ${b.pass > 0 ? `<span class="bchip">${ic("gift")} Lucky draw pass ×${b.pass} (next draw)</span>` : ""}</div>`;
  }
  function pickTicketSheet() {
    TB.sheet(`<div class="eyebrow">Joker</div><h2>Use it on which ticket?</h2><p class="muted small">The Joker cuts one called number you missed on that ticket.</p>
      <div class="chips" role="group" aria-label="Which ticket">${LET.slice(0, G.tickets.length).map((t) => `<button class="chip" style="min-height:44px;min-width:92px" data-act="jokerpick" data-arg="${t}">Ticket ${t}</button>`).join("")}</div>
      <button class="btn line block" data-act="close" style="margin-top:12px">Cancel</button>`);
  }
  function useJoker(t) {
    TB.closeSheet();
    if (!ws || !G.wsOpen) return TB.toast("Not connected right now. Try again in a moment.");
    G.jokerT = t; ws.send({ type: "joker", ticket: t, cut: [...G.cut[t]] });
  }
  function onJokerAck(m) {
    if (m.error) return TB.toast(esc(m.error));
    const n = m.number, t = G.jokerT || "A";
    if (n) { G.heard.add(n); G.cut[t].add(n); saveLocal(); }
    if (m.boosters) G.boosters = m.boosters;
    paintBoost(); paintTabs(); paintGrid();
    TB.toast(`Joker used: number ${esc(n)} marked`); say(`Joker used: number ${n} marked.`);
  }

  // ---- rounds ----
  function setNote(n, ms) { G.note = n; clearTimeout(setNote.t); setNote.t = setTimeout(() => { G.note = null; paintBanner(); }, ms || 7000); paintBanner(); }
  async function onRoundStart(m) {
    switchRound(m.round); G.rounds = m.of || G.rounds; G.tab = "A"; G.pause = null; G.current = 0; G.callNo = 0; G.nextLocal = 0; G.hl = null;
    await reload(false);
    paintAll();
    const txt = `Round ${m.round} of ${m.of}: your new ticket is ready`;
    setNote({ html: `<b>${ic("ticket")} ${esc(txt)}</b>` }); say(txt + ".");
  }
  function onRoundEnd(m) {
    setNote({ round: m.round }, 9000); say(`Round ${m.round} finished.`);
    setTimeout(() => reload(), 500);
  }

  // ---- moments (lucky draw / scratch card) ----
  const MO = { cur: null, dismissed: new Set() };
  function momentEl() {
    let o = $("mov");
    if (!o) { o = document.createElement("div"); o.id = "mov"; o.className = "mov"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); document.body.appendChild(o); }
    return o;
  }
  function clearMomentTimers() { const c = MO.cur; if (!c) return; clearInterval(c.spinT); clearInterval(c.cdT); clearTimeout(c.closeT); clearTimeout(c.safeT); }
  function closeMoment(markDone) {
    if (MO.cur && markDone) MO.dismissed.add(MO.cur.id);
    clearMomentTimers(); MO.cur = null;
    const o = $("mov"); if (o) o.remove();
    document.body.style.overflow = "";
    if (MO.after) { const f = MO.after; MO.after = null; f(); }
  }
  function ensureMoment(id, kind, extra) {
    if (MO.cur && MO.cur.id === id) { Object.assign(MO.cur, extra || {}); return MO.cur; }
    if (MO.dismissed.has(id)) return null;
    closeMoment(false);
    MO.cur = Object.assign({ id, kind, bumper: false, prize: "gift", winners: 0, phase: kind === "lucky" ? "draw" : "scratch", seconds: 30, err: "" }, extra || {});
    MO.cur.safeT = setTimeout(() => closeMoment(true), ((MO.cur.seconds || 30) + 40) * 1000);
    document.body.style.overflow = "hidden";
    paintMoment();
    return MO.cur;
  }
  function syncMoment(mm, closeIfNone) {
    if (mm && mm.id) {
      if (!MO.cur || MO.cur.id !== mm.id) { const c = ensureMoment(mm.id, mm.kind, { bumper: !!mm.bumper, prize: mm.prize, winners: mm.winners, seconds: Math.max(5, Math.round((mm.leftMs || 20000) / 1000)) }); if (c) say(mm.kind === "lucky" ? "Lucky draw." : "Scratch card."); }
    } else if (closeIfNone && MO.cur && ["draw", "scratch"].includes(MO.cur.phase)) closeMoment(false);
  }
  function onMomentStart(m) {
    const c = ensureMoment(m.id, m.kind, { bumper: !!m.bumper, prize: m.prize, winners: m.winners, seconds: m.seconds || 30 }); if (!c) return;
    say(m.kind === "lucky" ? (m.bumper ? "Bumper lucky draw." : "Lucky draw.") : "Scratch card for everyone. Scratch your card.");
    refreshSoon();
  }
  function onLuckyWon(m) {
    const c = ensureMoment(m.momentId, "lucky", {}); if (!c) return;
    c.phase = "won"; c.prize = m.prize; c.until = Date.now() + (m.confirmSeconds || 30) * 1000; c.err = "";
    clearTimeout(c.safeT); c.safeT = setTimeout(() => closeMoment(true), ((m.confirmSeconds || 30) + 40) * 1000);
    paintMoment(); say("You won the lucky draw! Tap I'm here.");
    const b = $("movhere"); if (b) try { b.focus(); } catch {}
    try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate([60, 40, 60]); } catch {}
  }
  function onMomentResult(m) {
    refreshSoon();
    const c = (MO.cur && MO.cur.id === m.id) ? MO.cur : ensureMoment(m.id, m.kind, { bumper: !!m.bumper }); if (!c) return;
    clearMomentTimers();
    c.wasConfirmed = !!c.confirmed || c.phase === "confirmed";
    c.phase = "result"; c.list = Array.isArray(m.winners) ? m.winners : []; c.cards = m.winningCards;
    if (c.kind === "scratch" && !c.outcome) revealCanvas();
    paintMoment();
    say(c.kind === "lucky" ? "Lucky draw result is on your screen." : (c.cards != null ? `${c.cards} winning cards this round.` : "Scratch card round finished."));
    c.closeT = setTimeout(() => closeMoment(true), 6000);
  }
  function updMovBall() { const b = $("movball"); if (b) { b.textContent = G.current || "-"; b.setAttribute("aria-label", G.current ? "Number " + G.current : "No number yet"); } }
  const movTop = (label, badge) => `<div class="movtop"><div class="eyebrow">${label}${badge ? `<span class="bump">BUMPER</span>` : ""}</div>
      <div class="movballw"><small>Number</small><b id="movball" role="img" aria-label="${G.current ? "Number " + G.current : "No number yet"}">${G.current || "-"}</b></div></div>`;
  const CODECH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const fakeCode = () => { let a = ""; for (let i = 0; i < 6; i++) { a += CODECH[Math.floor(Math.random() * CODECH.length)]; if (i === 2) a += "-"; } return a; };

  function paintMoment() {
    const c = MO.cur; if (!c) return;
    const o = momentEl(); o.className = "mov " + c.kind;
    if (c.kind === "lucky") {
      clearInterval(c.spinT); clearInterval(c.cdT);
      let h = "";
      if (c.phase === "draw") {
        h = `${movTop("Lucky draw", c.bumper)}<h2>Lucky draw</h2>
          <p class="movp">${c.winners ? TB.plural(c.winners, "winner") + " will be drawn. " : ""}Reward: ${esc(prizeText(c.prize))}.</p>
          <div class="spin" id="spin" aria-hidden="true">${REDUCED() ? "Drawing..." : fakeCode()}</div>
          <p class="movs">Winners are drawn by the system</p><button class="linkbtn movhide" data-act="mclose">Hide</button>`;
      } else if (c.phase === "won") {
        h = `${movTop("Lucky draw", c.bumper)}<div class="res ok mv">${ic("trophy")}</div><h2>You won!</h2>
          <p class="movp">Reward: ${esc(prizeText(c.prize))}.<br>Tap <b>I'm here</b> to confirm you are present.</p>
          <button class="btn gold big" id="movhere" data-act="here">${ic("check")} I'm here</button>
          <p class="movs" aria-hidden="true">Time left: <b id="movcd">${Math.max(0, Math.ceil((c.until - Date.now()) / 1000))}</b>s</p>
          ${c.err ? `<div class="err">${ic("alert")}<span>${esc(c.err)}</span></div>` : ""}`;
      } else if (c.phase === "confirmed") {
        const booster = c.prize && c.prize !== "gift";
        h = `${movTop("Lucky draw", c.bumper)}<div class="res ok mv">${ic("check")}</div><h2>You're in</h2>
          <p class="movp">${booster ? `Your ${esc(BNAME[c.prize] || "booster")} is added to your boosters.` : "Confirmed. Your organizer will contact you."}</p><button class="btn line big" data-act="mclose">Close</button>`;
      } else {
        const mineIds = new Set(Object.values(G.ids || {}).filter(Boolean)), list = (c.list || []).map((w) => `<li>${esc(w)}${mineIds.has(w) ? ` <span class="mine">(you)</span>` : ""}</li>`).join("");
        h = `${movTop("Lucky draw result", c.bumper)}<h2>Lucky draw winners</h2>${list ? `<ul class="movl">${list}</ul>` : `<p class="movp">No winner was confirmed this time.</p>`}
          ${c.wasConfirmed ? `<p class="movs">Your place is confirmed.</p>` : ""}<button class="btn line big" data-act="mclose">Close</button>`;
      }
      o.innerHTML = `<div class="movc">${h}</div>`;
      if (c.phase === "draw" && !REDUCED()) c.spinT = setInterval(() => { const s = $("spin"); if (s) s.textContent = fakeCode(); }, 90);
      if (c.phase === "won") c.cdT = setInterval(() => { const s = $("movcd"); if (s) s.textContent = Math.max(0, Math.ceil((c.until - Date.now()) / 1000)); }, 250);
      return;
    }
    // scratch card: build the canvas once, then only update parts
    if (!$("scrcv")) {
      o.innerHTML = `<div class="movc">${movTop("Scratch card")}<h2>Scratch your card</h2>
        <div class="scrbox" id="scrbox"><div class="scrres" id="scrres" aria-live="polite">Scratch to reveal</div><canvas id="scrcv" aria-label="Scratch card. Use the Reveal button instead if scratching is hard."></canvas></div>
        <p class="movs" id="scrfoot">Scratch with your finger, or use Reveal.</p>
        <div class="row" style="justify-content:center"><button class="btn gold big" id="scrbtn" data-act="reveal">Reveal</button></div></div>`;
      initCanvas();
    }
    const foot = $("scrfoot"), btn = $("scrbtn");
    if (c.phase === "result") {
      if (foot) foot.textContent = c.cards != null ? (c.cards === 1 ? "1 winning card this round" : `${c.cards} winning cards this round`) : "This round of scratch cards is over.";
      if (btn) { btn.disabled = false; btn.textContent = "Close"; btn.dataset.act = "mclose"; btn.classList.add("line"); btn.classList.remove("gold"); }
    }
  }

  // ---- scratch canvas ----
  function initCanvas() {
    const cv = $("scrcv"), box = $("scrbox"); if (!cv || !box) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = box.clientWidth || 300, H = box.clientHeight || 140;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const x = cv.getContext("2d"); x.scale(dpr, dpr);
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#F3D9A4"); g.addColorStop(.5, "#D9AE63"); g.addColorStop(1, "#B8894D");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.strokeStyle = "rgba(255,255,255,.22)"; x.lineWidth = 2;
    for (let i = -H; i < W; i += 14) { x.beginPath(); x.moveTo(i, H); x.lineTo(i + H, 0); x.stroke(); }
    x.fillStyle = "rgba(90,20,38,.75)"; x.font = "600 22px Georgia, serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("SCRATCH HERE", W / 2, H / 2);
    x.globalCompositeOperation = "destination-out";
    let down = false, last = null, moves = 0;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)]; };
    function stroke(a, b) { x.lineCap = "round"; x.lineJoin = "round"; x.lineWidth = 34; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
    const check = () => {
      try {
        const d = x.getImageData(0, 0, cv.width, cv.height).data; let clear = 0, tot = 0; const step = Math.max(6, Math.round(12 * dpr));
        for (let yy = 0; yy < cv.height; yy += step) for (let xx = 0; xx < cv.width; xx += step) { tot++; if (d[(yy * cv.width + xx) * 4 + 3] < 40) clear++; }
        if (tot && clear / tot >= 0.4) revealByUser();
      } catch {}
    };
    cv.addEventListener("pointerdown", (e) => { down = true; last = pt(e); try { cv.setPointerCapture(e.pointerId); } catch {} stroke(last, last); e.preventDefault(); });
    cv.addEventListener("pointermove", (e) => { if (!down) return; const p = pt(e); stroke(last, p); last = p; if (++moves % 6 === 0) check(); e.preventDefault(); });
    const up = () => { if (down) { down = false; check(); } };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  }
  function revealCanvas() { const cv = $("scrcv"); if (cv) cv.classList.add("gone"); }
  function revealByUser() {
    const c = MO.cur; if (!c || c.kind !== "scratch") return;
    revealCanvas();
    if (c.sent) return;
    if (!ws || !G.wsOpen) { TB.toast("Not connected right now. Try again in a moment."); return; }
    c.sent = true; ws.send({ type: "scratch", momentId: c.id });
    const b = $("scrbtn"); if (b && c.phase !== "result") { b.disabled = true; b.textContent = "Revealing..."; }
  }
  function setScratchOutcome(outcome) {
    const c = MO.cur; if (!c || c.kind !== "scratch") return;
    c.outcome = outcome; c.sent = true; revealCanvas();
    const t = SCR[outcome] || SCR.none, r = $("scrres"); if (r) { r.textContent = t; r.classList.toggle("win", outcome !== "none"); }
    const b = $("scrbtn"); if (b && c.phase !== "result") { b.disabled = false; b.textContent = "Done"; b.dataset.act = "mclose"; b.classList.remove("gold"); b.classList.add("line"); }
    say(t + ".");
  }
  Object.assign(ACT, {
    joker: () => { if (G.tickets.length > 1) pickTicketSheet(); else useJoker("A"); },
    jokerpick: (t) => useJoker(t),
    here: () => {
      const c = MO.cur; if (!c) return;
      if (!ws || !G.wsOpen) return TB.toast("Not connected right now. Try again in a moment.");
      ws.send({ type: "present", momentId: c.id });
    },
    reveal: () => revealByUser(),
    mclose: () => closeMoment(true),
  });

  // ---------- go ----------
  if (MODE === "p") bootPass(); else if (MODE === "e" && code) bootEngagement(); else errCard("badlink");
})();
