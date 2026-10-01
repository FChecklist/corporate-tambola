/* Corporate Tambola – Organizer / Host / Team Lead console. Vanilla JS, no build. Uses window.TB from common.js.
 *   /console   -> Organizer (needs organizer login)
 *   /r/CODE    -> Host or Team Lead personal link (opens on that person's own phone)
 */
(function () {
  "use strict";
  const { $, esc, ic, toast, sheet, closeSheet } = TB;
  // clipboard copy that never throws (document may not be focused; falls back to a hidden textarea)
  function copy(text, msg) {
    const fb = () => { try { const t = document.createElement("textarea"); t.value = text; t.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); } catch {} };
    try { navigator.clipboard.writeText(text).catch(fb); } catch { fb(); }
    toast(esc(msg || "Copied"));
  }
  const root = $("app");
  const NOTICE = "Tickets, phones, claims and the activity log are deleted 24 hours after the engagement ends. Names, numbers and departments are kept for up to 365 days so you can reuse them, then deleted. You can erase them any time from the Dashboard.";

  // ---------------------------------------------------------------- constants
  const PN = { early5: "Early Five", top: "Top Line", mid: "Middle Line", bot: "Bottom Line", corners: "Four Corners", star: "Star", full: "Full House" };
  const KINDS = [
    { k: "early5", scope: "ticket", name: "Early Five", desc: "Any 5 numbers on a ticket", max: 5, min: 0 },
    { k: "top", scope: "ticket", name: "Top Line", desc: "All numbers of the first row", max: 5, min: 0 },
    { k: "mid", scope: "ticket", name: "Middle Line", desc: "All numbers of the second row", max: 5, min: 0 },
    { k: "bot", scope: "ticket", name: "Bottom Line", desc: "All numbers of the third row", max: 5, min: 0 },
    { k: "corners", scope: "ticket", name: "Four Corners", desc: "First and last numbers of the top and bottom rows", max: 5, min: 0 },
    { k: "star", scope: "ticket", name: "Star", desc: "Four corners and the centre of the middle row", max: 5, min: 0 },
    { k: "full", scope: "ticket", name: "Full House", desc: "All 15 numbers on one ticket", max: 10, min: 1 },
    { k: "full", scope: "two_ticket", name: "Full Two-Ticket House", desc: "All 30 numbers on both tickets", max: 10, min: 0, double: true },
  ];
  const kkey = (x) => x.k + ":" + x.scope;
  const BREAK_KINDS = [["file", "Company video link"], ["youtube", "YouTube link"], ["slides", "Slides"], ["speech", "Speech"]];
  const BREAK_PLAN = { 0: [], 1: [45], 2: [30, 60], 3: [22, 45, 67] };
  const SECS = [15, 20, 30, 45, 60, 90, 120, 180];
  const CAPS = [10, 25, 50, 100];
  const PAUSE_WHY = ["Internet issue", "Technical problem", "Safety"];
  const FILTERS = [["all", "Everyone"], ["host", "Hosts"], ["team_lead", "Team Leads"], ["family", "Family"], ["colleague", "Colleagues"], ["notjoined", "Not joined"]];
  const ord = (n) => ["", "1st", "2nd", "3rd"][n] || n + "th";
  let indT = null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------- state
  const S = {
    role: "org", // org | host
    code: "", me: null, data: null, step: "", stageStep: null, hostName: "",
    sel: new Set(), wsel: new Set(), q: "", filter: "all",
    paste: "", check: null, country: "", ck1: false, ck2: false, pauseWhy: PAUSE_WHY[0], talk: false,
    report: null, reportFor: "", msgDraft: null, ws: null,
  };
  const RW = { counts: {}, texts: {}, dirty: false, warn: "", v: 0 };
  const BK = { list: [], dirty: false, warn: "", v: 0 };
  let sheetYes = null;

  // ---------------------------------------------------------------- helpers
  async function api(method, path, body) {
    try { return await TB.api(method, path, body, { org: S.role === "org" }); }
    catch (e) {
      if (e.status === 401 && S.role === "org") { TB.setOrgToken(null); location.replace("/#login"); }
      throw e;
    }
  }
  const E = () => `/api/e/${S.code}`;
  const eng = () => S.data.engagement;
  const isOpen = () => eng().status === "open";
  const isOrg = () => S.role === "org";
  const errT = (e) => toast(esc(e && e.message ? e.message : String(e)));
  async function run(promise, okMsg) {
    try { const r = await promise; if (okMsg) toast(esc(okMsg)); return r === undefined ? true : r; }
    catch (e) { errT(e); return null; }
  }
  const pill = (cls, t) => `<span class="pill ${cls}"><i></i>${esc(t)}</span>`;
  const digits = (s) => String(s || "").replace(/\D/g, "");
  const wa = (e164, msg) => `https://wa.me/${digits(e164)}?text=${encodeURIComponent(msg)}`;
  const firstName = (n) => (n || "").trim().split(/\s+/)[0] || "there";
  const tzName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata"; } catch { return "Asia/Kolkata"; } };
  const roleName = (r) => (r === "host" ? "Host" : r === "team_lead" ? "Team Lead" : "Participant");
  const fmtTs = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
  function statusPill() {
    const s = eng().status;
    return { open: pill("ok", "Open for entry"), started: pill("warn", "Engagement in progress · entry closed"), ended: pill("bad", "Engagement ended"), purged: pill("", "Tickets and claims deleted") }[s] || "";
  }
  function pStatus(p) {
    return p.status === "joined" ? pill("ok", "Joined") : p.status === "pass_sent" ? pill("info", "Pass sent") : pill("", "Not joined");
  }
  function howJoined(p) {
    if (p.source === "list") return isOrg() ? "From your list" : "From the list";
    if (p.source === "waiting_room") return p.invitedBy ? `Admitted · invited by ${esc(p.invitedBy)}` : "Admitted from the waiting room";
    return `Pass from ${esc(p.invitedBy || "someone")}${p.kind === "family" ? " (family)" : ""}`;
  }
  function chips(act, key, type, opts, val, dis) {
    return `<div class="chips" role="radiogroup">${opts.map(([v, l]) => {
      const on = String(v) === String(val);
      return `<button type="button" class="chip ${on ? "on" : ""}" role="radio" aria-checked="${on}" ${dis ? "disabled" : ""} data-a="${act}" data-k="${key}" data-t="${type}" data-v="${esc(v)}">${esc(l)}</button>`;
    }).join("")}</div>`;
  }
  const parseV = (el) => (el.dataset.t === "n" ? Number(el.dataset.v) : el.dataset.t === "b" ? el.dataset.v === "true" : el.dataset.v);
  function setInd(txt, cls) { const el = $("saveInd"); if (el) { el.textContent = txt; el.className = cls || ""; } if (cls !== "ok") clearTimeout(indT); }
  function savedInd() { setInd("Saved", "ok"); clearTimeout(indT); indT = setTimeout(() => setInd(""), 2200); }
  function confirmSheet(o) {
    sheetYes = o.onYes;
    sheet(`<h2>${esc(o.title)}</h2><div class="muted small">${o.body || ""}</div>${o.extra || ""}
      <button class="btn ${o.danger ? "danger" : "gold"} block" style="margin-top:14px" data-a="sheetYes">${esc(o.yes)}</button>
      <button class="btn line block" style="margin-top:8px" data-a="closeSheet">${esc(o.no || "Cancel")}</button>`);
  }
  function loadScript(src) {
    return new Promise((res) => { const s = document.createElement("script"); s.src = src; s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s); });
  }
  function fatal(msg, extra) {
    root.innerHTML = `${topbar("")}<div class="rolecard"><div class="pcard center"><div class="res no">${ic("alert")}</div><h2>${esc(msg)}</h2>${extra || ""}</div></div>`;
  }
  function topbar(right) {
    return `<div class="ctop"><div class="ctin"><a href="/" style="border:0;padding:0;display:flex;align-items:center;gap:10px;color:#fff"><span class="mark">${ic("ticket")}</span><span class="word">Corporate <i>Tambola</i></span></a><span class="sp"></span>${right || ""}</div></div>`;
  }

  // ---------------------------------------------------------------- patching (never destroys typed text)
  function isEditing(el) {
    const a = document.activeElement;
    if (!a || !el.contains(a)) return false;
    return a.tagName === "TEXTAREA" || a.tagName === "SELECT" || (a.tagName === "INPUT" && !["checkbox", "radio", "button", "file"].includes(a.type));
  }
  function patch(el, html) {
    if (!el || el._h === html) return;
    if (isEditing(el)) return;
    el.innerHTML = html; el._h = html;
  }

  // ================================================================ ORGANIZER / HOST CONSOLE
  const STEP_LABEL = { setup: "Set up", rewards: "Rewards", breaks: "Brand breaks", people: "People", share: "Share", wait: "Waiting room", start: "Start", live: "Live", report: "Report" };
  function stepList() {
    const st = eng().status;
    if (!isOrg()) return st === "open" ? ["wait", "people"] : ["wait", "people", "live"];
    const a = ["setup", "rewards", "breaks", "people", "share", "wait"];
    if (st === "open") a.push("start"); else if (st === "started") a.push("live"); else if (st === "ended") a.push("live", "report"); else a.push("report");
    return a;
  }
  function defaultStep() {
    const st = eng().status;
    if (!isOrg()) return st === "open" ? "wait" : "live";
    return st === "open" ? "setup" : st === "started" ? "live" : "report";
  }

  async function bootConsole() {
    root.innerHTML = `${topbar(consoleLinks())}<div class="wrap" id="wrap"><div id="head"></div><div class="sbarx"><span></span><span id="saveInd"></span></div><nav class="snav2" id="steps" aria-label="Steps"></nav><div id="stage"></div></div>`;
    await loadConsole(true);
    if (!S.data) return;
    S.ws = TB.ws(S.code, { org: isOrg() }, (m) => { if (m && m.type === "talk") return; queueRefresh(); }, null);
    S.poll = setInterval(() => loadConsole(), 8000);
    setInterval(tick, 1000);
  }
  function consoleLinks(onDash) {
    if (isOrg()) return `${onDash ? "" : '<a href="/console">Dashboard</a>'}<a href="/#pricing">Buy another pack</a><button class="tl" data-a="logout">${ic("logout")} Log out</button>`;
    return `<a href="/e/${esc(S.code)}">Open my ticket</a>`;
  }
  let rT = null;
  function queueRefresh() { clearTimeout(rT); rT = setTimeout(() => loadConsole(), 300); }

  async function loadConsole(first) {
    let d;
    try { d = await api("GET", `${E()}/console`); }
    catch (e) {
      if (first) { fatal(e.message || "Cannot open this engagement.", isOrg() ? `<a class="btn" href="/console">Back to the Dashboard</a>` : ""); return; }
      if (!isOrg() && (e.status === 403 || e.status === 401)) { clearInterval(S.poll); if (S.ws) S.ws.close(); fatal("This link is no longer active on this phone.", `<p class="lead">The engagement may have ended and its personal data deleted, or your access was changed by the Organizer.</p>`); }
      return;
    }
    const prev = S.data && S.data.engagement.status;
    S.data = d;
    if (!S.step || !stepList().includes(S.step)) S.step = defaultStep();
    if (prev && prev !== d.engagement.status) {
      if (prev === "open" && (d.engagement.status === "started" || d.engagement.status === "starting") && S.step === "start") S.step = "live";
      if (d.engagement.status === "ended" && isOrg()) { S.step = "report"; S.report = null; }
      if (d.engagement.status === "purged") S.report = null;
      if (!stepList().includes(S.step)) S.step = defaultStep();
    }
    initDrafts();
    paintAll();
  }

  function paintAll() { paintHead(); paintSteps(); paintStage(); }

  function paintHead() {
    const d = S.data, e = d.engagement, c = d.counts;
    const title = isOrg() && S.me && S.me.engagements.length > 1
      ? `<select class="inp hsel" data-c="switch" aria-label="Choose engagement">${S.me.engagements.map((x) => `<option value="${esc(x.code)}" ${x.code === S.code ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>`
      : esc(e.name);
    const when = e.startsAt ? `${e.status === "open" ? "Starts" : "Starts at"} ${TB.fmtDT(e.startsAt)} (your time)` : "No start time set";
    patch($("head"), `<div class="chead"><div><div class="eyebrow">${isOrg() ? "Organizer console" : "Host console · " + esc(S.hostName)} · ${esc(e.orgName)}</div>
      <h1>${title}</h1><div class="stats" style="margin-top:4px"><span>${ic("clock")} ${esc(when)}</span><span>Code <b>${esc(e.code)}</b></span></div></div>
      <div style="text-align:right"><div>${statusPill()}</div><div class="stats" style="justify-content:flex-end;margin-top:6px"><span>Joined <b>${c.joined}</b></span><span>Places used <b>${c.used}</b> / <b>${c.limit}</b></span><span>Waiting <b>${c.waiting}</b></span>${c.conflicts ? `<span class="pill warn">${c.conflicts} phone alert${c.conflicts > 1 ? "s" : ""}</span>` : ""}</div></div></div>`);
  }
  function paintSteps() {
    const c = S.data.counts, list = stepList();
    patch($("steps"), list.map((s, i) => {
      const badge = s === "wait" && c.waiting + c.conflicts > 0 ? `<span class="bdg">${c.waiting + c.conflicts}</span>` : "";
      return `<button type="button" class="${S.step === s ? "on" : ""}" data-a="step" data-v="${s}"><span class="n">${i + 1}</span>${STEP_LABEL[s]}${badge}</button>`;
    }).join(""));
  }
  function paintStage() {
    const stage = $("stage");
    if (S.stageStep !== S.step) { stage.innerHTML = ""; S.stageStep = S.step; }
    const fn = { setup: setupSecs, rewards: rewardsSecs, breaks: breaksSecs, people: peopleSecs, share: shareSecs, wait: waitSecs, start: startSecs, live: liveSecs, report: reportSecs }[S.step];
    const secs = fn ? fn() : [];
    for (const [id, html] of secs) {
      let el = stage.querySelector(`[data-sec="${id}"]`);
      if (!el) { el = document.createElement("div"); el.dataset.sec = id; stage.appendChild(el); }
      patch(el, html);
    }
    // keep sections in order, and drop ones that no longer apply (e.g. the reuse banner)
    const ids = secs.map((x) => x[0]);
    [...stage.children].forEach((c) => { if (!ids.includes(c.dataset.sec)) c.remove(); });
    ids.forEach((id, i) => { const c = stage.querySelector(`[data-sec="${id}"]`); if (c && stage.children[i] !== c) stage.insertBefore(c, stage.children[i] || null); });
    if (S.step === "share") drawQR();
    if (S.step === "report" && !S.report && eng().status !== "open") loadReport();
    if (S.step === "people" && isOrg() && !D.dash && !D.loading) loadDash().then(() => { if (S.step === "people") paintStage(); });
  }
  function gotoStep(s) {
    S.step = s; S.stageStep = null; paintSteps(); paintStage();
    if (s === "people" && isOrg() && !D.loading) loadDash().then(() => { if (S.step === "people") paintStage(); });
    if (s === "rewards" || s === "breaks") { initDrafts(); paintStage(); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function tick() {
    document.querySelectorAll("[data-nextat],[data-liveat]").forEach((el) => {
      const t = Number(el.dataset.nextat || el.dataset.liveat); el.textContent = Math.max(0, Math.ceil((t - Date.now()) / 1000));
    });
  }

  // ---------------------------------------------------------------- drafts (rewards, breaks)
  function initDrafts() {
    if (!RW.dirty) {
      RW.counts = {}; RW.texts = {};
      for (const x of KINDS) { RW.counts[kkey(x)] = 0; RW.texts[kkey(x)] = []; }
      for (const r of S.data.rewards) {
        const key = r.pattern + ":" + r.scope;
        if (!(key in RW.counts)) continue;
        RW.counts[key]++; RW.texts[key][r.ordinal - 1] = r.text;
      }
      for (const x of KINDS) { const k = kkey(x); RW.texts[k] = Array.from({ length: RW.counts[k] }, (_, i) => RW.texts[k][i] || ""); }
    }
    if (!BK.dirty) BK.list = S.data.breaks.map((b) => ({ id: b.id, after: b.after, kind: b.kind, title: b.title, seconds: b.seconds, mediaUrl: b.mediaUrl || "" }));
  }

  // ---------------------------------------------------------------- 1. setup
  function timeOptions(ms) {
    const cur = new Date(ms).getHours() * 60 + new Date(ms).getMinutes(), list = [];
    for (let m = 360; m <= 1410; m += 30) list.push(m);
    if (!list.includes(cur)) { list.push(cur); list.sort((a, b) => a - b); }
    return list.map((m) => { const t = new Date(ms); t.setHours(Math.floor(m / 60), m % 60, 0, 0); return `<option value="${m}" ${m === cur ? "selected" : ""}>${esc(TB.fmtT(t))}</option>`; }).join("");
  }
  function setupSecs() {
    const e = eng(), ro = e.status !== "open" || !isOrg();
    const ms = e.startsAt || Date.now() + 864e5, d = new Date(ms);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const modeHint = { ai: "The system calls a random number every 10 seconds.", manual: "A Host presses “Draw” (the system picks the number at random) and announces it. At least 5 seconds apart.", both: "The system calls a number every 10 seconds. Hosts can also speak to everyone at any time." }[e.callMode];
    const raise = isOrg() && e.status === "open" ? `<button class="btn sm line" data-a="raise">${ic("users")} Raise limit</button>` : "";
    return [["setup", `<div class="panel"><div class="phead"><div class="step">1</div><div><h2>Set up the engagement</h2><p>Pick an option in each box. Changes save by themselves until the engagement starts.</p>
      ${e.status !== "open" ? `<p class="lockmsg">Everything is locked because the engagement has started.</p>` : ""}</div></div>
      <div class="grid">
        <div><label class="lb" for="gName">Engagement name</label><input class="inp" id="gName" maxlength="60" value="${esc(e.name)}" ${ro ? "disabled" : ""} data-c="name" data-i="name"></div>
        <div><label class="lb" for="gDate">Date</label><input class="inp" type="date" id="gDate" value="${iso}" ${ro ? "disabled" : ""} data-c="date"></div>
        <div><label class="lb" for="gTime">Start time</label><select class="inp" id="gTime" ${ro ? "disabled" : ""} data-c="time">${timeOptions(ms)}</select><p class="hint">Your own time zone (${esc(tzName())}). Participants see it in their own time.</p></div>
        <div><label class="lb" for="gCty">Most participants’ country</label><select class="inp" id="gCty" ${ro ? "disabled" : ""} data-c="country">${TB.countryOpts(e.defaultCountry)}</select><p class="hint">Numbers without a country code are read as this country.</p></div>
        <div><label class="lb">Participant limit (everyone, including family)</label><div class="row"><b class="mono" style="font-size:20px">${Number(e.limit).toLocaleString()}</b>${raise}</div><p class="hint">Equals the pack you bought. Entry stops at this number.</p></div>
      </div>
      <div class="grid">
        <div><label class="lb">Family members each participant can bring</label>${chips("set", "familyLimit", "n", [[0, "None"], [1, "1"], [2, "2"], [3, "3"], [4, "4"]], e.familyLimit, ro)}<p class="hint">Family members get their own pass. They cannot invite anyone.</p></div>
        <div><label class="lb">Can family members win rewards?</label>${chips("set", "familyCanWin", "b", [[true, "Yes"], [false, "No, they play for fun"]], e.familyCanWin, ro)}</div>
        <div><label class="lb">Can participants invite colleagues?</label>${chips("set", "participantInvites", "n", [[0, "No"], [1, "1 each"], [2, "2 each"], [3, "3 each"]], e.participantInvites, ro)}<p class="hint">Their invites go to the waiting room for you to approve.</p></div>
      </div>
      <div class="grid">
        <div><label class="lb">Tickets per participant</label>${chips("set", "ticketMode", "s", [["single", "1 ticket"], ["double", "2 tickets"]], e.ticketMode, ro)}<p class="hint">${e.ticketMode === "double" ? "Each participant gets two tickets. A “Full Two-Ticket House” reward becomes possible." : "Each participant gets one ticket."}</p></div>
        <div><label class="lb">How numbers are called</label>${chips("set", "callMode", "s", [["ai", "AI voice"], ["manual", "Host voice"], ["both", "AI voice + host speaks"]], e.callMode, ro)}<p class="hint">${esc(modeHint)}</p></div>
        <div><label class="lb">Voice</label><div class="pill wine" style="margin-top:4px">${ic("mic")} Indian English, female, slow and clear</div></div>
      </div></div>`]];
  }

  async function saveSettings(patchObj) {
    setInd("Saving…");
    Object.assign(eng(), patchObj);
    paintAll();
    try { await api("PATCH", `${E()}/settings`, patchObj); savedInd(); }
    catch (e) { errT(e); setInd("Not saved", "err"); await loadConsole(); }
  }
  async function setTicketMode(v) {
    if (v === "single" && S.data.rewards.some((r) => r.scope === "two_ticket")) {
      const spec = buildSpec(true);
      if (!spec.length) return toast("Keep at least one reward before switching to 1 ticket.");
      const ok = await run(api("PUT", `${E()}/rewards`, { spec }));
      if (!ok) return;
      toast("The Two-Ticket reward was removed.");
      RW.dirty = false;
    }
    await saveSettings({ ticketMode: v });
    await loadConsole();
  }
  let nameT = null;
  function saveName(el) {
    const v = el.value.trim() || "My engagement";
    if (v !== eng().name) saveSettings({ name: v });
  }
  function saveStart(dateStr, mins) {
    const e = eng(), d = new Date(e.startsAt || Date.now() + 864e5);
    if (dateStr) { const [y, m, da] = dateStr.split("-").map(Number); d.setFullYear(y, m - 1, da); }
    if (mins !== undefined) d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    saveSettings({ startsAt: d.getTime(), tz: tzName() });
  }
  function raiseSheet() {
    const e = eng(), bigger = TB.PACKS.filter((p) => p[0] > e.pack);
    if (!bigger.length) return toast("You already have the biggest pack.");
    const base = TB.price(e.pack, e.currency).total;
    S.raisePick = bigger[0][0];
    sheet(raiseHtml());
  }
  function raiseHtml() {
    const e = eng(), bigger = TB.PACKS.filter((p) => p[0] > e.pack), base = TB.price(e.pack, e.currency).total;
    return `<h2>Raise the participant limit</h2><p class="muted small">You have a pack of ${e.pack}. Choose a bigger pack and pay only the difference.</p>
      <div class="pm">${bigger.map((p) => { const diff = TB.price(p[0], e.currency).total - base; return `<button type="button" class="${S.raisePick === p[0] ? "on" : ""}" data-a="raisePick" data-v="${p[0]}"><span>${p[0].toLocaleString()} participants<small>You pay the difference</small></span><span style="margin-left:auto"><b>${esc(TB.money(diff, e.currency))}</b></span></button>`; }).join("")}</div>
      <button class="btn gold block" style="margin-top:12px" data-a="raiseGo">Pay the difference and raise the limit</button>
      <button class="btn line block" style="margin-top:8px" data-a="closeSheet">Cancel</button>`;
  }

  // ---------------------------------------------------------------- 2. rewards
  function buildSpec(dropTwo) {
    const dbl = eng().ticketMode === "double" && !dropTwo, spec = [];
    for (const x of KINDS) {
      if (x.scope === "two_ticket" && !dbl) continue;
      const k = kkey(x), n = RW.counts[k] || 0;
      if (n > 0) spec.push({ pattern: x.k, scope: x.scope, texts: Array.from({ length: n }, (_, i) => (RW.texts[k][i] || "").trim() || `Reward: ${x.name}`) });
    }
    return spec;
  }
  let rwT = null;
  function queueRewards(delay) {
    RW.dirty = true; RW.v++; setInd("Saving…"); clearTimeout(rwT); rwT = setTimeout(saveRewards, delay === undefined ? 500 : delay);
  }
  async function saveRewards() {
    const spec = buildSpec(), total = spec.reduce((a, s) => a + s.texts.length, 0);
    RW.warn = total === 0 ? "Offer at least one reward." : total > 30 ? "At most 30 rewards." : "";
    if (RW.warn) { setInd("Not saved", "err"); paintStage(); return; }
    const v = RW.v;
    try { await api("PUT", `${E()}/rewards`, { spec }); if (RW.v === v) { RW.dirty = false; savedInd(); } }
    catch (e) { errT(e); if (RW.v === v) RW.dirty = false; setInd("Not saved", "err"); }
    await loadConsole();
  }
  function rewardsSecs() {
    const e = eng(), ro = e.status !== "open" || !isOrg();
    const rows = KINDS.filter((x) => !x.double || e.ticketMode === "double").map((x) => {
      const k = kkey(x), n = RW.counts[k] || 0;
      const min = x.k === "full" && x.scope === "ticket" && e.ticketMode !== "double" ? 1 : x.k === "full" && x.scope === "ticket" ? 0 : x.min;
      const texts = Array.from({ length: n }, (_, i) => `<div class="ln"><span>${esc(n > 1 ? ord(i + 1) + " " + x.name : x.name)}</span><input class="inp" maxlength="80" placeholder="Reward, e.g. Smart watch" value="${esc(RW.texts[k][i] || "")}" ${ro ? "disabled" : ""} data-i="rwText" data-c="rwText" data-k="${k}" data-n="${i}" aria-label="Reward text for ${esc(x.name)} ${i + 1}"></div>`).join("");
      return `<div class="rwk"><div class="top"><div><b>${esc(x.name)}</b><div class="tiny muted">${esc(x.desc)}${n === 0 ? " · not offered" : ""}</div></div>
        <div class="row">${x.k === "full" && x.scope === "ticket" ? `<span class="tiny muted">How many houses</span>` : ""}<div class="stp"><button type="button" aria-label="Fewer" ${ro || n <= min ? "disabled" : ""} data-a="rwStep" data-k="${k}" data-v="-1">−</button><b>${n}</b><button type="button" aria-label="More" ${ro || n >= x.max ? "disabled" : ""} data-a="rwStep" data-k="${k}" data-v="1">+</button></div></div></div>
        ${n ? `<div class="lines">${texts}</div>` : ""}</div>`;
    }).join("");
    return [["rewards", `<div class="panel"><div class="phead"><div class="step">2</div><div><h2>Rewards</h2><p>Choose which rewards you give and write what each one is. “Full House” can have several houses: 1st, 2nd, 3rd and so on. You hand rewards over yourself.</p>
      ${e.status !== "open" ? `<p class="lockmsg">Locked because the engagement has started.</p>` : ""}</div></div>
      ${rows}
      ${RW.warn ? `<div class="err">${ic("alert")}<span>${esc(RW.warn)}</span></div>` : ""}
      <p class="hint">Two or more valid claims on the same number share that reward. Count 0 means the reward is not offered. At most 30 reward lines.</p></div>`]];
  }

  // ---------------------------------------------------------------- 3. brand breaks
  let bkT = null;
  function queueBreaks(delay) { BK.dirty = true; BK.v++; setInd("Saving…"); clearTimeout(bkT); bkT = setTimeout(saveBreaks, delay === undefined ? 600 : delay); }
  function respace() { const plan = BREAK_PLAN[BK.list.length] || []; BK.list.forEach((b, i) => (b.after = plan[i])); }
  async function saveBreaks() {
    const list = [...BK.list].sort((a, b) => a.after - b.after);
    let warn = "";
    list.forEach((b, i) => {
      if (!Number.isInteger(b.after) || b.after < 1 || b.after > 89) warn = "A brand break must come after call 1 to 89.";
      else if (i > 0 && b.after <= list[i - 1].after) warn = "Two brand breaks cannot come after the same call.";
      if (b.mediaUrl && !/^https?:\/\//i.test(b.mediaUrl)) warn = "Video links must start with http:// or https://.";
    });
    BK.warn = warn;
    if (warn) { setInd("Not saved", "err"); paintStage(); return; }
    const body = list.map((b) => ({ id: b.id, after: b.after, kind: b.kind, title: b.title || "Brand break", seconds: b.seconds, mediaUrl: b.kind === "file" || b.kind === "youtube" ? b.mediaUrl.trim() : undefined }));
    const v = BK.v;
    try { await api("PUT", `${E()}/breaks`, { breaks: body }); if (BK.v === v) { BK.dirty = false; savedInd(); } }
    catch (e) { errT(e); if (BK.v === v) BK.dirty = false; setInd("Not saved", "err"); }
    await loadConsole();
  }
  function breaksSecs() {
    const e = eng(), ro = e.status !== "open" || !isOrg();
    const rows = BK.list.map((b, i) => {
      const needsLink = b.kind === "file" || b.kind === "youtube";
      return `<div class="bbx"><div class="r1">
        <div><label class="lb">After call</label><div class="stp"><button type="button" ${ro ? "disabled" : ""} data-a="bkAfter" data-n="${i}" data-v="-1">−</button><b>${b.after}</b><button type="button" ${ro ? "disabled" : ""} data-a="bkAfter" data-n="${i}" data-v="1">+</button></div></div>
        <div style="flex:1 1 300px"><label class="lb">Type</label>${chips("bkKind", i, "s", BREAK_KINDS, b.kind, ro)}</div></div>
        <div class="r1" style="margin-top:6px"><div class="tt"><label class="lb">Title participants see</label><input class="inp" maxlength="60" value="${esc(b.title)}" ${ro ? "disabled" : ""} data-i="bkTitle" data-c="bkTitle" data-n="${i}"></div>
        <div><label class="lb">Length</label><select class="inp" ${ro ? "disabled" : ""} data-c="bkSecs" data-n="${i}">${(SECS.includes(b.seconds) ? SECS : [...SECS, b.seconds].sort((a, c) => a - c)).map((s) => `<option value="${s}" ${s === b.seconds ? "selected" : ""}>${s >= 60 && s % 60 === 0 ? s / 60 + " min" : s + " sec"}</option>`).join("")}</select></div>
        <button class="btn sm danger" ${ro ? "disabled" : ""} data-a="bkDel" data-n="${i}" aria-label="Remove brand break">${ic("trash")}</button></div>
        ${needsLink ? `<div style="margin-top:6px"><label class="lb">${b.kind === "youtube" ? "YouTube link" : "Company video link"} (starts with https://)</label><input class="inp" inputmode="url" value="${esc(b.mediaUrl)}" ${ro ? "disabled" : ""} placeholder="https://" data-i="bkUrl" data-c="bkUrl" data-n="${i}">
        ${!b.mediaUrl ? `<p class="hint bad">Add the link before the engagement starts.</p>` : ""}</div>` : `<p class="hint">${b.kind === "speech" ? "A Host speaks live during the break." : "Your slides are shown by the Host during the break."}</p>`}</div>`;
    }).join("");
    return [["breaks", `<div class="panel"><div class="phead"><div class="step">3</div><div><h2>Brand breaks</h2><p>Up to 3 moments where the engagement pauses for everyone and your company is on screen. Breaks never start while a claim is being checked.</p>
      ${e.status !== "open" ? `<p class="lockmsg">Locked because the engagement has started.</p>` : ""}</div></div>
      ${rows || `<p class="muted small">No brand breaks. Add one if you want to show a company video, YouTube video, slides or a speech.</p>`}
      ${BK.warn ? `<div class="err">${ic("alert")}<span>${esc(BK.warn)}</span></div>` : ""}
      <button class="btn sm line" ${ro || BK.list.length >= 3 ? "disabled" : ""} data-a="bkAdd">+ Add a brand break</button>
      <div class="note info">${ic("info")}<span><b>Company video:</b> each participant’s phone downloads a low-quality copy before the engagement starts. Recommended: MP4 360p H.264, under 50 MB.</span></div>
      <div class="note info">${ic("info")}<span><b>YouTube videos</b> stream when the break starts; they cannot be downloaded ahead.</span></div></div>`]];
  }

  // ---------------------------------------------------------------- 4. people
  const matchF = (p, f) => f === "all" || (f === "host" && p.role === "host") || (f === "team_lead" && p.role === "team_lead") || (f === "family" && p.kind === "family") || (f === "colleague" && p.kind === "colleague") || (f === "notjoined" && p.status !== "joined");
  function waMsg(p) {
    const e = eng(), f = firstName(p.name), link = p.roleLink || p.passLink || "";
    if (p.role === "host") return `Hi ${f}, you are a Host for ${e.name}. Open your link to help admit participants: ${link}\nPlease don't forward this link.`;
    if (p.role === "team_lead") return `Hi ${f}, you are a Team Lead for ${e.name}. Open your link to bring in up to ${p.cap} colleagues: ${link}\nPlease don't forward this link. It works on one phone only.`;
    return `Hi ${f}, here is your personal pass for ${e.name}: ${link}\nIt works on one phone only, so please don't forward it.`;
  }
  function addSec() {
    const e = eng(), lock = e.status !== "open", c = S.check;
    const cty = S.country || e.defaultCountry;
    const items = c ? [...c.ready, ...c.fixed] : [];
    return `<div class="panel"><div class="phead"><div class="step">4</div><div><h2>People</h2><p>Add mobile numbers by pasting a list or choosing a file. Any format works: 98765 43210, +91 98765 43210, 09876543210, +44 7700 900123. We fix the format and remove repeats.</p>
      ${lock ? `<p class="lockmsg">Entry is closed. Nobody can be added after the start.</p>` : ""}</div></div>
      <div class="grid"><div style="grid-column:1/-1"><label class="lb" for="paste">One person per line. The name is optional: “Rahul Mehta, 98765 43210” or just the number.</label>
      <textarea class="inp" id="paste" ${lock ? "disabled" : ""} data-i="paste" placeholder="Name, mobile number">${esc(S.paste)}</textarea></div>
      <div><label class="lb" for="pcty">Numbers without a country code are read as</label><select class="inp" id="pcty" ${lock ? "disabled" : ""} data-c="pcountry">${TB.countryOpts(cty)}</select></div>
      <div><label class="lb" for="pfile">Or choose a CSV or TXT file</label><input type="file" id="pfile" accept=".csv,.txt,text/plain,text/csv" ${lock ? "disabled" : ""} data-c="pfile" style="font-size:13px;max-width:100%"></div></div>
      <div class="row" style="margin-top:10px"><button class="btn" ${lock ? "disabled" : ""} data-a="check">Check numbers</button><span class="tiny muted">Nothing is added until you confirm.</span></div>
      ${c ? `<div class="chkres"><span class="pill ok">${c.ready.length} ready</span><span class="pill info">${c.fixed.length} format fixed</span><span class="pill warn">${c.repeats.length} repeats removed</span><span class="pill bad">${c.bad.length} need your attention</span></div>
      ${c.bad.length ? `<details class="chk" open><summary>Lines we could not read (${c.bad.length}). Fix them in the list and check again.</summary><ul>${c.bad.map((x) => `<li><span class="mono">${esc(x.ln)}</span>: ${esc(x.reason)}</li>`).join("")}</ul></details>` : ""}
      ${c.fixed.length ? `<details class="chk"><summary>Formats we fixed (${c.fixed.length})</summary><ul>${c.fixed.map((x) => `<li><span class="mono">${esc(x.ln)}</span> → <b class="mono">${esc(x.e164)}</b></li>`).join("")}</ul></details>` : ""}
      ${c.repeats.length ? `<details class="chk"><summary>Repeats removed (${c.repeats.length})</summary><ul>${c.repeats.map((x) => `<li><span class="mono">${esc(x.ln)}</span>: ${esc(x.reason)}</li>`).join("")}</ul></details>` : ""}
      ${S.addErr ? `<div class="err">${ic("alert")}<span>${esc(S.addErr)}</span></div>` : ""}
      <button class="btn gold" style="margin-top:10px" ${items.length && !lock ? "" : "disabled"} data-a="commit">Add ${TB.plural(items.length, "person", "people")}</button>` : ""}</div>`;
  }
  function famSec() {
    const e = eng();
    return `<div class="panel"><div class="phead"><div class="step">${ic("users")}</div><div><h2>Family members</h2><p>How many family members each participant can bring. Family members cannot invite anyone.</p></div></div>
      ${chips("set", "familyLimit", "n", [[0, "None"], [1, "1"], [2, "2"], [3, "3"], [4, "4"]], e.familyLimit, e.status !== "open")}</div>`;
  }
  function peopleSecs() {
    const e = eng(), open = e.status === "open", all = S.data.participants;
    const q = S.q.trim().toLowerCase(), qd = digits(q);
    const list = all.filter((p) => matchF(p, S.filter)).filter((p) => !q || (p.name || "").toLowerCase().includes(q) || (qd && digits(p.e164 || p.number).includes(qd)));
    S.sel = new Set([...S.sel].filter((id) => all.some((p) => p.id === id)));
    const rows = list.map((p) => {
      const hostRow = p.role === "host", fam = p.kind === "family";
      const canEdit = open && !fam && !(!isOrg() && hostRow);
      const roleCell = fam ? `<span class="pill">Family</span>` : `<div class="rolecell">${pill(hostRow ? "wine" : p.role === "team_lead" ? "info" : "", roleName(p.role))}${p.kind === "colleague" ? `<span class="pill">Colleague</span>` : ""}</div>`;
      const bring = p.role === "team_lead"
        ? `<select class="mini-sel" ${canEdit ? "" : "disabled"} data-c="cap" data-id="${p.id}" aria-label="Colleague limit">${CAPS.map((c) => `<option value="${c}" ${c === p.cap ? "selected" : ""}>${c} colleagues</option>`).join("")}</select><div class="sub">${p.colleaguesUsed} used</div>`
        : hostRow ? `<span class="sub">Helps run the engagement</span>` : fam ? `<span class="sub">Cannot invite</span>` : `<span class="sub">${e.familyLimit ? "Family: up to " + e.familyLimit : "No family"}</span>`;
      let link = `<span class="sub">Uses the engagement link</span>`;
      if (p.roleLink) link = `<div class="lnk"><button class="btn sm line" data-a="copyLink" data-v="${esc(p.roleLink)}" aria-label="Copy link">${ic("copy")}</button><a class="btn sm line" target="_blank" rel="noopener" href="${wa(p.e164, waMsg(p))}">WhatsApp</a></div>`;
      else if (p.passLink && p.status !== "joined") link = `<div class="lnk"><button class="btn sm line" data-a="copyLink" data-v="${esc(p.passLink)}">${ic("copy")} Pass link</button></div>`;
      const sel = `<input type="checkbox" aria-label="Select ${esc(p.name)}" ${S.sel.has(p.id) ? "checked" : ""} ${open && !(!isOrg() && hostRow) ? "" : "disabled"} data-c="sel" data-id="${p.id}">`;
      return `<tr><td class="sel">${sel}</td><td><div class="nm">${esc(p.name || "(no name)")}</div><div class="sub">${howJoined(p)}</div></td><td class="mono" data-l="Mobile">${esc(p.number)}</td><td data-l="Role">${roleCell}</td><td data-l="Can bring in">${bring}</td><td data-l="Status">${pStatus(p)}${p.blocked ? " " + pill("bad", "Blocked") : ""}</td><td data-l="Link">${link}</td></tr>`;
    }).join("");
    const n = S.sel.size;
    const bulk = open ? `<div class="bulk"><b>${n} selected</b><span class="lbx">Make Team Lead:</span>${CAPS.map((c) => `<button class="btn sm chipb" ${n ? "" : "disabled"} data-a="bulkTL" data-v="${c}">${c}</button>`).join("")}${isOrg() ? `<button class="btn sm line" ${n ? "" : "disabled"} data-a="bulkRole" data-v="host">Make Host</button>` : ""}<button class="btn sm line" ${n ? "" : "disabled"} data-a="bulkRole" data-v="participant">Make regular participant</button><button class="btn sm danger" ${n ? "" : "disabled"} data-a="bulkRemove">Remove</button><span class="sp"></span><button class="btn sm ghost" data-a="selAll">${n && n === list.length ? "Clear" : "Select all shown"}</button></div>` : "";
    const secs = [];
    if (isOrg() && open && all.length <= 5 && D.dash && D.dash.last) secs.push(["pbanner", reuseBanner()]);
    if (isOrg()) secs.push(["padd", addSec()]); else secs.push(["pfam", famSec()]);
    secs.push(["pbar", `<div class="panel" style="margin-bottom:0;border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom:0;box-shadow:none"><div class="phead" style="margin-bottom:2px"><div><h2>Everyone on the list</h2><p>Tick people, then choose what to do with them. Team Leads get their own link to bring in their team. Hosts help you run the engagement.</p></div></div>
      <div class="row"><input class="inp" style="max-width:260px" placeholder="Search name or number" value="${esc(S.q)}" data-i="q" aria-label="Search"></div>
      <div style="margin-top:10px">${chips("filter", "f", "s", FILTERS.map(([v, l]) => [v, l + (v === "all" ? "" : " (" + all.filter((p) => matchF(p, v)).length + ")")]), S.filter, false)}</div></div>`]);
    secs.push(["plist", `<div class="panel" style="border-top:0;border-top-left-radius:0;border-top-right-radius:0;padding-top:0;margin-top:0">
      <div class="tiny muted" style="margin:6px 0">${list.length} of ${all.length} shown</div>${bulk}
      <div class="tscroll stk"><table class="t people-t stack"><thead><tr><th></th><th>Name</th><th>Mobile</th><th>Role</th><th>Can bring in</th><th>Status</th><th>Their link</th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="muted">Nobody here yet. Add mobile numbers above.</td></tr>`}</tbody></table></div></div>`]);
    return secs;
  }
  async function doCheck() {
    if (!S.paste.trim()) return toast("Paste a list or choose a file first.");
    S.addErr = "";
    const r = await run(api("POST", `${E()}/upload/check`, { text: S.paste, country: S.country || eng().defaultCountry }));
    if (r) { S.check = r; paintStage(); }
  }
  async function doCommit() {
    const c = S.check; if (!c) return;
    const items = [...c.ready, ...c.fixed].map((x) => ({ name: x.name || "", e164: x.e164 }));
    if (!items.length) return;
    try { await api("POST", `${E()}/upload/commit`, { items }); }
    catch (e) { S.addErr = e.message; errT(e); paintStage(); return; }
    S.check = null; S.paste = ""; S.addErr = "";
    toast(`Added ${TB.plural(items.length, "person", "people")}`);
    await loadConsole();
  }
  async function bulkRole(role, cap) {
    const ids = [...S.sel], byId = new Map(S.data.participants.map((p) => [p.id, p]));
    const ok = ids.filter((id) => { const p = byId.get(id); return p && p.kind !== "family" && !(!isOrg() && (p.role === "host" || role === "host")); });
    const skipped = ids.length - ok.length;
    if (!ok.length) return toast("Family members and Hosts cannot be changed here.");
    const r = await run(api("POST", `${E()}/people/bulk`, { ids: ok, action: "role", role, cap }));
    if (r) { S.sel.clear(); toast(`Done${skipped ? ` · ${skipped} skipped (family members or Hosts)` : ""}`); }
    await loadConsole();
  }
  function bulkRemove() {
    const ids = [...S.sel], byId = new Map(S.data.participants.map((p) => [p.id, p]));
    const ok = ids.filter((id) => { const p = byId.get(id); return p && !(!isOrg() && p.role === "host"); });
    if (!ok.length) return toast("Hosts cannot be removed by a Host.");
    confirmSheet({ title: `Remove ${TB.plural(ok.length, "person", "people")}?`, body: "Anyone they invited (colleagues and family) is removed too, and their places are freed. This cannot be undone.", yes: "Remove", danger: true,
      onYes: async () => { closeSheet(); const r = await run(api("POST", `${E()}/people/bulk`, { ids: ok, action: "remove" })); if (r) { S.sel.clear(); toast(`Removed ${TB.plural(r.removed ?? ok.length, "person", "people")}`); } await loadConsole(); } });
  }

  // ---------------------------------------------------------------- 5. share
  function defaultMsg() {
    const e = eng();
    return `You're invited to ${e.name}${e.startsAt ? " on " + TB.fmtDT(e.startsAt) : ""}!\nJoin here from your phone: ${e.link}\nEntry closes when the first number is called.`;
  }
  const curMsg = () => (S.msgDraft !== null ? S.msgDraft : defaultMsg());
  function shareSecs() {
    const e = eng(), closed = e.status !== "open" && e.status !== "starting";
    const roles = S.data.participants.filter((p) => p.roleLink && (p.role === "host" || p.role === "team_lead"));
    const rl = roles.length ? `<div class="tscroll"><table class="t"><thead><tr><th>Name</th><th>Role</th><th>Personal link</th><th></th></tr></thead><tbody>${roles.map((p) => `<tr><td>${esc(p.name || "(no name)")}</td><td>${pill(p.role === "host" ? "wine" : "info", roleName(p.role))}</td><td class="mono" style="font-size:12px;word-break:break-all">${esc(p.roleLink)}</td><td><div class="lnk"><button class="btn sm line" data-a="copyLink" data-v="${esc(p.roleLink)}">${ic("copy")}</button><a class="btn sm line" target="_blank" rel="noopener" href="${wa(p.e164, waMsg(p))}">WhatsApp</a></div></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">No Hosts or Team Leads yet. Make them in the People step; their personal links appear here.</p>`;
    return [["share", `<div class="panel"><div class="phead"><div class="step">5</div><div><h2>Share the engagement link</h2><p>One link for everyone on your list. If a number is not on your list, that person goes to the waiting room.</p>
      ${closed ? `<p class="lockmsg">Entry is closed. The link now shows “Entry is closed”.</p>` : ""}
      ${isOrg() ? `<p class="hint">${ic("link")} <a href="/console#AI" data-a="aiHint">Use your AI for this</a>: let ChatGPT, Gemini or Claude do the setup for you.</p>` : ""}</div></div>
      <div class="row" style="align-items:flex-start;gap:18px"><div style="flex:1;min-width:260px"><div class="linkbox">${esc(e.link)}</div>
      <div class="row" style="margin-top:10px"><button class="btn sm" data-a="copyLink" data-v="${esc(e.link)}">${ic("copy")} Copy link</button><a class="btn sm line" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(curMsg())}">Share on WhatsApp</a><button class="btn sm line" data-a="copyMsg">${ic("mail")} Copy email message</button></div>
      <label class="lb" for="gmsg">Message that goes with the link</label><textarea class="inp" id="gmsg" style="min-height:100px;font-family:var(--sans)" ${isOrg() ? "" : "readonly"} data-i="msg">${esc(curMsg())}</textarea></div>
      <div><label class="lb" style="margin-top:0">Show on a screen or print for the office</label><div class="qrbox" id="qr"></div></div></div></div>
      <div class="panel"><div class="phead"><div class="step">${ic("link")}</div><div><h2>Host and Team Lead links</h2><p>Each link belongs to one person and works on one phone only. Send each link privately.</p></div></div>${rl}</div>`]];
  }
  async function drawQR() {
    const el = $("qr"); if (!el) return;
    const link = eng().link; if (el._t === link) return;
    el._t = link;
    if (!window.QRCode) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js");
    if (window.QRCode) TB.QR(el, link); else el.innerHTML = `<span class="tiny muted center">QR code needs an internet connection</span>`;
  }

  // ---------------------------------------------------------------- 6. waiting room
  function waitSecs() {
    const open = isOpen(), d = S.data, w = d.waiting;
    S.wsel = new Set([...S.wsel].filter((id) => w.some((x) => x.id === id)));
    const alerts = d.conflicts.map((c) => `<div class="alert">${ic("phone")}<span style="flex:1;min-width:220px"><b>Second phone tried to join as ${esc(c.name)}</b> <span class="mono">(${esc(c.number)})</span>. The first phone is still in. If ${esc(firstName(c.name))} changed phones, let the new one in.</span><button class="btn sm line" data-a="resolve" data-id="${c.id}" data-v="kept">Keep first phone</button><button class="btn sm" data-a="resolve" data-id="${c.id}" data-v="moved">Let new phone in</button></div>`).join("");
    const list = w.length ? `<div class="row" style="margin:6px 0"><label class="cb" style="margin:0"><input type="checkbox" ${!open ? "disabled" : ""} ${S.wsel.size && S.wsel.size === w.length ? "checked" : ""} data-c="wselAll"> Select all</label><span class="sp"></span>
      <button class="btn sm" ${!open || !S.wsel.size ? "disabled" : ""} data-a="admit" data-v="sel">Admit selected</button><button class="btn sm line" ${!open ? "disabled" : ""} data-a="admit" data-v="all">Admit everyone</button><button class="btn sm danger" ${!open || !S.wsel.size ? "disabled" : ""} data-a="decline">Decline selected</button></div>
      <div style="border:1px solid var(--line);border-radius:12px;padding:0 10px">${w.map((x) => `<div class="qitem"><input type="checkbox" ${!open ? "disabled" : ""} ${S.wsel.has(x.id) ? "checked" : ""} aria-label="Select ${esc(x.name)}" data-c="wsel" data-id="${x.id}"><div style="flex:1"><b>${esc(x.name)}</b> <span class="mono small muted">${esc(x.number)}</span>${x.info ? ` <span class="tiny muted">· ${esc(x.info)}</span>` : ""}<div class="tiny muted">${x.invitedBy ? "Invited by " + esc(x.invitedBy) : "Used the engagement link. Not on your list."} · ${TB.ago(x.at)}</div></div></div>`).join("")}</div>`
      : `<p class="muted small">Nobody is waiting.</p>`;
    return [["wait", `<div class="panel"><div class="phead"><div class="step">${isOrg() ? 6 : 1}</div><div><h2>Waiting room</h2><p>People who used the engagement link but are not on your list, and invites from participants. Admit them or decline them.</p>
      ${!open ? `<p class="lockmsg">Entry is closed. Anyone still waiting was told “Entry is closed”.</p>` : ""}</div></div>${alerts}${list}</div>`]];
  }

  // ---------------------------------------------------------------- 7. start
  function startSecs() {
    const e = eng(), c = S.data.counts;
    if (!isOrg()) return [["start", `<div class="panel"><div class="phead"><div class="step">${ic("lock")}</div><div><h2>Starting</h2><p>Only the Organizer can start or end the engagement.</p></div></div></div>`]];
    const missing = BK.list.filter((b) => (b.kind === "file" || b.kind === "youtube") && !b.mediaUrl).length;
    const ready = S.ck1 && S.ck2;
    return [["start", `<div class="panel" style="border-color:var(--gold)"><div class="phead"><div class="step">7</div><div><h2>Start the engagement</h2><p>Every setting locks at once. People can still join for 60 seconds while their phones get ready, then entry closes and the first number is called.</p></div></div>
      <div class="sum"><div class="kv"><span>Engagement</span><b>${esc(e.name)}</b></div>
      <div class="kv"><span>Planned start</span><b>${e.startsAt ? esc(TB.fmtDT(e.startsAt)) : "Not set"}</b></div>
      <div class="kv"><span>Joined</span><b>${c.joined} of ${c.used} places</b></div>
      <div class="kv"><span>Waiting room</span><b>${c.waiting ? pill("warn", c.waiting + " still waiting") : "Nobody waiting"}</b></div>
      <div class="kv"><span>Rewards</span><b>${S.data.rewards.length}</b></div>
      <div class="kv"><span>Brand breaks</span><b>${S.data.breaks.length}${missing ? " · " + missing + " without a link" : ""}</b></div>
      <div class="kv"><span>Tickets</span><b>${e.ticketMode === "double" ? "2 per participant" : "1 per participant"}</b></div>
      <div class="kv"><span>Numbers called by</span><b>${{ ai: "AI voice", manual: "Host voice", both: "AI voice + host speaks" }[e.callMode]}</b></div></div>
      ${c.joined === 0 ? `<div class="note warn">${ic("alert")}<span>Nobody has joined yet.</span></div>` : ""}
      ${missing ? `<div class="note warn">${ic("alert")}<span>A brand break has no video link. Add it in step 3 or remove the break.</span></div>` : ""}
      <label class="cb"><input type="checkbox" ${S.ck1 ? "checked" : ""} data-c="ck1"> <span>Everyone I want has been admitted.${c.waiting ? ` <span class="pill warn">${c.waiting} still waiting</span>` : ""}</span></label>
      <label class="cb"><input type="checkbox" ${S.ck2 ? "checked" : ""} data-c="ck2"> I understand that after the first 60 seconds nobody can join, and nothing can be changed.</label>
      <button class="btn gold" ${ready ? "" : "disabled"} data-a="start">${ic("play")} Start engagement now</button> <span class="tiny muted">${c.joined} of ${c.used} have joined so far.</span></div>`]];
  }

  // ---------------------------------------------------------------- 8. live
  function callerHtml() {
    const e = eng(), l = S.data.live;
    let cls = "", ball, eb, ln, sub = "";
    const pz = l.paused;
    if (e.status === "starting") { cls = "pz"; ball = ic("clock"); eb = "Starting · phones are getting ready"; ln = "The first number is called when the countdown ends."; sub = `People can still join. First number in <b data-liveat="${l.liveAt}">${Math.max(0, Math.ceil((l.liveAt - Date.now()) / 1000))}</b> seconds`; }
    else if (e.status === "ended") { cls = "pz"; ball = ic("flag"); eb = "Engagement ended"; ln = "Thank you for running it."; sub = isOrg() ? "Open the Report step for winners and the full list." : "The Organizer can see the report."; }
    else if (pz && pz.type === "claim") { cls = "pz"; ball = ic("pause"); eb = "Paused · checking a claim"; ln = "The system is checking. Everyone waits."; }
    else if (pz && pz.type === "result") { cls = "okc"; ball = ic("trophy"); eb = "Result shown to everyone"; ln = "The engagement continues in a few seconds."; }
    else if (pz && pz.type === "break") { cls = "brk"; ball = ic("play"); eb = "Brand break"; ln = esc(pz.title || ""); sub = "Playing on every phone."; }
    else if (pz && pz.type === "emergency") { cls = "pz"; ball = ic("pause"); eb = "Emergency pause"; ln = esc(pz.reason || ""); sub = "Shown to every participant."; }
    else {
      ball = l.current ? `<span class="big-num" style="font-size:40px">${l.current}</span>` : "<small>Ready</small>";
      eb = `Now calling · ${l.called} of 90 called`;
      ln = l.current ? "The current number is shown to every participant." : e.callMode === "manual" ? "Press “Draw next number” to call the first number." : "The first number is on its way…";
      sub = e.callMode === "manual" ? "Host voice: a Host draws each number." : l.nextAt ? `Next number in <b data-nextat="${l.nextAt}">${Math.max(0, Math.ceil((l.nextAt - Date.now()) / 1000))}</b> seconds` : "";
    }
    return `<div class="caller ${cls}"><div class="bigball">${ball}</div><div><div class="eyebrow">${eb}</div><div class="ln">${ln}</div><div class="sub">${sub}</div></div></div>`;
  }
  function liveSecs() {
    const e = eng(), l = S.data.live, d = S.data, running = e.status === "started", pz = l.paused;
    const draw = running && e.callMode === "manual" ? `<button class="btn" data-a="draw" ${pz ? "disabled" : ""}>${ic("draw")} Draw next number</button>` : running ? `<span class="tiny muted" style="flex:1 1 200px">The system calls a number every 10 seconds. It can only be paused in an emergency.</span>` : "";
    const talk = running && e.callMode !== "ai" ? `<button class="talk ${S.talk ? "on" : ""}" style="flex:1 1 100%" data-a="talk">${ic("mic")}<span><b>${S.talk ? "Speaking · tap to stop" : "Speak to everyone"}</b><br><span class="tiny muted">Everyone with sound on hears you</span></span>${S.talk ? `<span class="sp-chip" style="margin-left:auto">Host speaking</span>` : ""}</button>` : "";
    let pauseBtn = "";
    if (running) {
      if (pz && pz.type === "emergency") pauseBtn = `<button class="btn sm" data-a="resume">${ic("play")} Resume</button>`;
      else if (pz && pz.type === "break") pauseBtn = `<button class="btn sm line" data-a="endbreak">End brand break early</button>`;
      else pauseBtn = `<button class="btn sm line" ${pz ? "disabled" : ""} data-a="pause">${ic("pause")} Emergency pause</button>`;
    }
    const why = running && !(pz && (pz.type === "emergency" || pz.type === "break")) ? chips("why", "w", "s", PAUSE_WHY.map((x) => [x, x]), S.pauseWhy, !!pz) : "";
    const rewards = d.rewards.map((r) => {
      const w = r.winners || [];
      return `<div class="r ${w.length ? "won" : ""}"><span><b>${esc(r.name)}</b> <span class="tiny muted">${esc(r.text)}</span></span><span class="small">${w.length ? "" : pill("", "Open")}</span>
        ${w.length ? `<div class="win">${w.map((x) => esc(x.name || x.ticketId)).join(" & ")}${w.length > 1 ? " (shared)" : ""} · ${w.map((x) => esc(x.ticketId)).join(", ")} · won on number ${w[0].number} (call ${w[0].callNo})</div>` : ""}</div>`;
    }).join("");
    const nv = d.notValid.length ? d.notValid.slice(-8).reverse().map((n) => `<div>${esc(n.ticketId)} – ${esc(PN[n.pattern] || n.pattern)} <span class="tiny muted">${esc(n.why)}</span></div>`).join("") : `<span class="muted">None so far.</span>`;
    const log = d.log.filter((x) => !/^Call \d+:/.test(x.msg)).slice(0, 40).map((x) => `<li><time>${fmtTs(x.t)}</time><span>${esc(x.msg)}</span></li>`).join("");
    const brk = d.breaks.length ? d.breaks.map((b) => `<div>${b.done ? "✓" : "•"} After call ${b.after}: ${esc(b.title)} (${b.seconds} sec) ${b.done ? pill("ok", "Done") : ""}</div>`).join("") : `<span class="muted">None set up.</span>`;
    return [["live", `<div class="panel" style="border-color:var(--gold)"><div class="phead"><div class="step">${ic("play")}</div><div><h2>Live</h2><p>${isOrg() ? "You are running the engagement. Hosts see the same screen." : "You are helping run the engagement."} Numbers are always drawn at random by the system. Nobody sees a list of past numbers.</p></div></div>
      <div class="livebox"><div><div>${callerHtml()}</div>
        <div class="row" style="margin-top:10px">${draw}${talk}</div>
        ${running ? `<div style="margin-top:12px"><label class="lb" style="margin-top:0">Emergency pause: reason</label><div class="row">${why}${pauseBtn}${isOrg() ? `<span class="sp"></span><button class="btn danger" data-a="askEnd">${ic("flag")} End engagement</button>` : ""}</div></div>` : ""}
        <label class="lb">Calls so far</label><div><b class="mono" style="font-size:18px">${l.called}</b> <span class="muted small">of 90</span></div>
        <label class="lb">Brand breaks</label><div class="small">${brk}</div>
        <label class="lb">Activity</label><ul class="log">${log || `<li><span class="muted">Nothing yet.</span></li>`}</ul></div>
      <div><label class="lb" style="margin-top:0">Rewards</label><div class="prtab rwlist">${rewards}</div>
        <label class="lb">Not valid claims</label><div class="small">${nv}</div></div></div></div>`]];
  }

  // ---------------------------------------------------------------- 9. report
  async function loadReport() {
    if (S.reportFor === "loading") return;
    S.reportFor = "loading";
    try { S.report = await api("GET", `${E()}/report`); } catch (e) { S.report = { error: e.message }; }
    S.reportFor = ""; paintStage();
  }
  function reportTSV(r) {
    const e = eng(), L = [], t = (a) => a.map((x) => String(x ?? "").replace(/[\t\r\n]+/g, " ")).join("\t");
    L.push(t(["Engagement", r.engagement, "Organizer", e.orgName, "Started", r.startedAt ? TB.fmtDT(r.startedAt) : "", "Ended", r.endedAt ? TB.fmtDT(r.endedAt) : ""]), "", "WINNERS");
    L.push(t(["Reward", "Reward text", "Winner", "Ticket ID", "Mobile", "Winners sharing", "Won on number", "Call no.", "Time"]));
    r.winners.forEach((w) => L.push(t([w.reward, w.rewardText, w.name, w.ticketId, w.e164, w.winners, w.wonOnNumber, w.callNo, fmtTs(w.at)])));
    L.push("", "NOT AWARDED", ...nameNotAwarded(r).map((x) => t([x.name, x.text])));
    L.push("", "NOT VALID CLAIMS", t(["Ticket ID", "Reward claimed", "Reason", "Time"]));
    r.notValid.forEach((n) => L.push(t([n.ticketId, PN[n.pattern] || n.pattern, n.why, fmtTs(n.at)])));
    L.push("", "PARTICIPANTS", t(["Ticket ID", "Name", "Mobile", "Role", "Kind", "Status", "Not valid claims"]));
    r.participants.forEach((p) => L.push(t([p.ticketId, p.name, p.e164, p.kind === "family" ? "Family" : roleName(p.role), p.kind || "", p.joined ? "Joined" : "Did not join", p.notValid])));
    L.push("", "NUMBERS IN THE ORDER CALLED", r.callOrder.join(", "));
    return L.join("\n");
  }
  function nameNotAwarded(r) {
    const byId = new Map(S.data.rewards.map((x) => [x.id, x]));
    return r.notAwarded.map((x) => ({ name: (byId.get(x.id) || {}).name || x.id, text: x.text }));
  }
  function reportSecs() {
    const r = S.report;
    if (!r) return [["report", `<div class="panel center muted">Loading the report…</div>`]];
    if (r.error) return [["report", `<div class="panel"><div class="err">${ic("alert")}<span>${esc(r.error)}</span></div></div>`]];
    if (r.purged) {
      const s = r.summary || {};
      return [["report", `<div class="panel"><div class="phead"><div class="step">${ic("trash")}</div><div><h2>Personal data deleted</h2><p>${esc(NOTICE)}</p></div></div>
        <div class="grid" style="margin-top:10px"><div class="meter"><span>Participants</span><b>${s.players ?? 0}</b></div><div class="meter"><span>Family members</span><b>${s.family ?? 0}</b></div><div class="meter"><span>Team Leads</span><b>${s.teamLeads ?? 0}</b></div></div></div>`]];
    }
    const del = (r.endedAt || Date.now()) + 864e5;
    const na = nameNotAwarded(r);
    return [["report", `<div class="panel" style="border-color:var(--gold)"><div class="phead"><div class="step">${ic("flag")}</div><div><h2>Report</h2><p>Copy the report before the tickets and claims are deleted. ${esc(NOTICE)}</p></div></div>
      <div class="alert">${ic("clock")}<span style="flex:1"><b>Tickets, phones, claims and the activity log will be deleted on ${esc(TB.fmtDT(del))}.</b> Names, numbers and departments are kept for up to 365 days for reuse. Copy the report now and keep it with your records.</span><button class="btn sm" data-a="copyReport">${ic("copy")} Copy report for Excel</button></div>
      <label class="lb">Winners</label><div class="tscroll"><table class="t"><thead><tr><th>Reward</th><th>Winner</th><th>Ticket ID</th><th>Winners</th><th>Won on</th></tr></thead><tbody>${r.winners.length ? r.winners.map((w) => `<tr><td><b>${esc(w.reward)}</b><div class="sub">${esc(w.rewardText)}${w.winners > 1 ? " · shared equally" : ""}</div></td><td>${esc(w.name)}<div class="sub mono">${esc(w.e164)}</div></td><td class="mono" style="font-size:12px">${esc(w.ticketId)}</td><td>${w.winners}</td><td>Number ${w.wonOnNumber} (call ${w.callNo})</td></tr>`).join("") : `<tr><td colspan="5" class="muted">No rewards were won.</td></tr>`}</tbody></table></div>
      <label class="lb">Not awarded</label><div class="small">${na.length ? na.map((x) => `${esc(x.name)} <span class="muted">(${esc(x.text)})</span>`).join(", ") : "All rewards were won."}</div>
      <label class="lb">Not valid claims (${r.notValid.length})</label><div class="small">${r.notValid.length ? r.notValid.map((n) => `<div>${esc(n.ticketId)} – ${esc(PN[n.pattern] || n.pattern)} <span class="tiny muted">${esc(n.why)}</span></div>`).join("") : `<span class="muted">None.</span>`}</div>
      <label class="lb">Participants (${r.participants.length})</label><div class="tscroll" style="max-height:340px;overflow:auto"><table class="t"><thead><tr><th>Ticket ID</th><th>Name</th><th>Mobile</th><th>Role</th><th>Status</th></tr></thead><tbody>${r.participants.map((p) => `<tr><td class="mono" style="font-size:12px">${esc(p.ticketId)}</td><td>${esc(p.name)}</td><td class="mono">${esc(p.e164)}</td><td>${esc(p.kind === "family" ? "Family" : roleName(p.role))}</td><td>${p.joined ? "Joined" : "Did not join"}${p.blocked ? " · blocked" : ""}</td></tr>`).join("")}</tbody></table></div>
      <label class="lb">Numbers in the order they were called (${r.callOrder.length})</label><div class="linkbox" style="border-style:solid">${r.callOrder.join(", ") || "—"}</div></div>`]];
  }

  // ---------------------------------------------------------------- actions (click / change / input)
  const A = {
    step: (el) => gotoStep(el.dataset.v),
    logout: () => { TB.setOrgToken(null); location.href = "/"; },
    closeSheet: () => closeSheet(),
    sheetYes: () => { const f = sheetYes; sheetYes = null; f && f(); },
    set: (el) => { const k = el.dataset.k, v = parseV(el); if (k === "ticketMode") setTicketMode(v); else saveSettings({ [k]: v }); },
    raise: () => raiseSheet(),
    raisePick: (el) => { S.raisePick = Number(el.dataset.v); sheet(raiseHtml()); },
    raiseGo: async () => {
      const r = await run(api("POST", `${E()}/raise-limit`, { pack: S.raisePick }));
      if (r) { closeSheet(); toast(`Limit raised. You paid ${esc(TB.money(r.paid, r.currency))}.`); await loadConsole(); }
    },
    rwStep: (el) => {
      const k = el.dataset.k, d = Number(el.dataset.v), x = KINDS.find((y) => kkey(y) === k);
      const n = (RW.counts[k] || 0) + d;
      if (n < 0 || n > x.max) return;
      const total = Object.entries(RW.counts).reduce((a, [kk, v]) => a + (kk === k ? n : v), 0);
      if (total > 30) return toast("At most 30 rewards.");
      RW.counts[k] = n;
      if (d > 0) RW.texts[k][n - 1] = RW.texts[k][n - 1] || ""; else RW.texts[k].length = n;
      RW.warn = ""; paintStage(); queueRewards(350);
    },
    bkAdd: () => { if (BK.list.length >= 3) return; BK.list.push({ id: "b" + Math.random().toString(36).slice(2, 8), after: 45, kind: "file", title: "Our message", seconds: 30, mediaUrl: "" }); respace(); BK.warn = ""; paintStage(); queueBreaks(300); },
    bkDel: (el) => { BK.list.splice(Number(el.dataset.n), 1); respace(); BK.warn = ""; paintStage(); queueBreaks(300); },
    bkAfter: (el) => { const b = BK.list[Number(el.dataset.n)]; b.after = Math.max(1, Math.min(89, b.after + Number(el.dataset.v))); BK.warn = ""; paintStage(); queueBreaks(700); },
    bkKind: (el) => { BK.list[Number(el.dataset.k)].kind = el.dataset.v; paintStage(); queueBreaks(300); },
    check: doCheck, commit: doCommit,
    filter: (el) => { S.filter = el.dataset.v; paintStage(); },
    copyLink: (el) => copy(el.dataset.v, "Link copied"),
    copyMsg: () => copy(curMsg(), "Message copied for email"),
    selAll: () => {
      const q = S.q.trim().toLowerCase(), qd = digits(q);
      const vis = S.data.participants.filter((p) => matchF(p, S.filter)).filter((p) => !q || (p.name || "").toLowerCase().includes(q) || (qd && digits(p.e164 || p.number).includes(qd))).filter((p) => !(!isOrg() && p.role === "host"));
      if (S.sel.size && vis.every((p) => S.sel.has(p.id))) S.sel.clear(); else vis.forEach((p) => S.sel.add(p.id));
      paintStage();
    },
    bulkTL: (el) => bulkRole("team_lead", Number(el.dataset.v)),
    bulkRole: (el) => bulkRole(el.dataset.v),
    bulkRemove,
    resolve: async (el) => { const r = await run(api("POST", `${E()}/conflicts/${el.dataset.id}/resolve`, { res: el.dataset.v }), el.dataset.v === "moved" ? "Moved to the new phone. The old phone was logged out." : "Kept the first phone. The second phone stays out."); if (r) await loadConsole(); },
    admit: async (el) => {
      const body = el.dataset.v === "all" ? { all: true } : { ids: [...S.wsel] };
      const n = el.dataset.v === "all" ? S.data.waiting.length : S.wsel.size;
      const r = await run(api("POST", `${E()}/waiting/admit`, body), `Admitted ${TB.plural(n, "person", "people")}`);
      if (r) S.wsel.clear(); await loadConsole();
    },
    decline: async () => { const n = S.wsel.size; const r = await run(api("POST", `${E()}/waiting/decline`, { ids: [...S.wsel] }), `Declined ${TB.plural(n, "request")}`); if (r) S.wsel.clear(); await loadConsole(); },
    start: async () => { const r = await run(api("POST", `${E()}/start`, {}), "The engagement has started. Entry is closed."); if (r) { S.ck1 = S.ck2 = false; S.step = "live"; await loadConsole(); gotoStep("live"); } },
    draw: async () => { await run(api("POST", `${E()}/draw`, {})); await loadConsole(); },
    talk: () => { S.talk = !S.talk; if (S.ws) S.ws.send({ type: "talk", on: S.talk }); paintStage(); },
    why: (el) => { S.pauseWhy = el.dataset.v; paintStage(); },
    pause: async () => { await run(api("POST", `${E()}/pause`, { reason: S.pauseWhy })); await loadConsole(); },
    resume: async () => { await run(api("POST", `${E()}/resume`, {})); await loadConsole(); },
    endbreak: async () => { await run(api("POST", `${E()}/endbreak`, {})); await loadConsole(); },
    copyReport: () => { if (S.report && !S.report.error) copy(reportTSV(S.report), "Report copied. Paste it into Excel."); },
  };
  // End-engagement confirm needs to stay open until the tick-box is ticked; re-implemented without arguments.callee.
  A.askEnd = () => {
    const go = async () => {
      if (!$("endOk").checked) { sheetYes = go; return toast("Tick the box to confirm."); }
      closeSheet(); await run(api("POST", `${E()}/end`, {})); await loadConsole();
    };
    confirmSheet({ title: "End the engagement now?", body: "Rewards that are still open will not be awarded. The report becomes available. Tickets, phones, claims and the activity log are deleted 24 hours from now; names, numbers and departments are kept for up to 365 days so you can reuse them.", danger: true, yes: "End engagement", no: "Keep going",
      extra: `<label class="cb"><input type="checkbox" id="endOk"> I want to end the engagement for everyone.</label>`, onYes: go });
  };
  // the sheet button calls sheetYes then clears it; keep it set for the tick-box retry
  A.sheetYes = () => { const f = sheetYes; if (f) f(); };

  const C = {
    switch: (el) => { location.href = "/console#" + el.value; location.reload(); },
    name: (el) => saveName(el),
    date: (el) => el.value && saveStart(el.value),
    time: (el) => saveStart(null, Number(el.value)),
    country: (el) => saveSettings({ defaultCountry: el.value }),
    rwText: (el) => { RW.texts[el.dataset.k][Number(el.dataset.n)] = el.value; queueRewards(100); },
    bkTitle: (el) => { BK.list[Number(el.dataset.n)].title = el.value; queueBreaks(100); },
    bkUrl: (el) => { BK.list[Number(el.dataset.n)].mediaUrl = el.value.trim(); queueBreaks(100); paintStage(); },
    bkSecs: (el) => { BK.list[Number(el.dataset.n)].seconds = Number(el.value); queueBreaks(200); },
    pcountry: (el) => { S.country = el.value; S.check = null; paintStage(); },
    pfile: (el) => {
      const f = el.files && el.files[0]; if (!f) return;
      if (/\.xlsx?$/i.test(f.name)) { el.value = ""; return toast("Save the sheet as CSV and choose that file."); }
      const r = new FileReader();
      r.onload = () => { S.paste = String(r.result || ""); S.check = null; paintStage(); toast(`Read ${esc(f.name)}. Press Check numbers.`); };
      r.readAsText(f);
    },
    cap: async (el) => { const r = await run(api("POST", `${E()}/people/bulk`, { ids: [el.dataset.id], action: "role", role: "team_lead", cap: Number(el.value) })); if (!r) await loadConsole(); else await loadConsole(); },
    sel: (el) => { el.checked ? S.sel.add(el.dataset.id) : S.sel.delete(el.dataset.id); paintStage(); },
    wsel: (el) => { el.checked ? S.wsel.add(el.dataset.id) : S.wsel.delete(el.dataset.id); paintStage(); },
    wselAll: (el) => { S.wsel = el.checked ? new Set(S.data.waiting.map((w) => w.id)) : new Set(); paintStage(); },
    ck1: (el) => { S.ck1 = el.checked; paintStage(); },
    ck2: (el) => { S.ck2 = el.checked; paintStage(); },
  };
  const I = {
    name: (el) => { clearTimeout(nameT); nameT = setTimeout(() => saveName(el), 900); },
    rwText: (el) => { RW.texts[el.dataset.k][Number(el.dataset.n)] = el.value; queueRewards(900); },
    bkTitle: (el) => { BK.list[Number(el.dataset.n)].title = el.value; queueBreaks(900); },
    bkUrl: (el) => { BK.list[Number(el.dataset.n)].mediaUrl = el.value.trim(); queueBreaks(1200); },
    paste: (el) => { S.paste = el.value; },
    msg: (el) => { S.msgDraft = el.value; },
    q: (el) => { S.q = el.value; clearTimeout(I._qt); I._qt = setTimeout(() => { const l = document.querySelector('[data-sec="plist"]'); if (l) { l._h = null; } paintStage(); }, 200); },
    tlName: (el) => { T.name = el.value; },
    tlNum: (el) => { T.num = el.value; },
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-a]");
    if (!el || el.disabled) return;
    const f = A[el.dataset.a] || TA[el.dataset.a];
    if (f) f(el, e);
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-c]"); if (!el) return;
    const f = C[el.dataset.c] || TC[el.dataset.c];
    if (!f) return;
    if (el.tagName === "SELECT") el.blur();
    f(el, e);
  });
  document.addEventListener("input", (e) => {
    const el = e.target.closest("[data-i]"); if (!el) return;
    const f = I[el.dataset.i]; if (f) f(el, e);
  });

  // ================================================================ TEAM LEAD PAGE
  const T = { type: "colleague", name: "", cc: "", num: "", result: null, me: null, country: "IN", busy: false };
  const TA = {
    tlType: (el) => { T.type = el.dataset.v; T.result = null; tlPaint(); },
    tlCreate: async () => {
      if (T.busy) return;
      if (!T.name.trim()) return toast("Enter their name.");
      if (!T.num.trim()) return toast("Enter their mobile number.");
      T.busy = true;
      const r = await run(TB.api("POST", `/api/e/${S.code}/me/passes`, { name: T.name.trim(), raw: T.num, country: T.cc, kind: T.type }));
      T.busy = false;
      if (r) { T.result = { name: r.name, link: r.link, raw: T.num, cc: T.cc, type: T.type }; T.name = ""; T.num = ""; await tlLoad(); }
    },
    tlCancel: (el) => {
      const id = el.dataset.id, x = T.me.invitees.find((i) => i.id === id);
      confirmSheet({ title: `Cancel the pass for ${x ? x.name : "this person"}?`, body: "The link stops working and the place is free again.", yes: "Cancel the pass", no: "Keep it", danger: true,
        onYes: async () => { closeSheet(); const r = await run(TB.api("DELETE", `/api/e/${S.code}/me/passes/${id}`), "Pass cancelled. The place is free again."); if (r) await tlLoad(); } });
    },
    tlReissue: async (el) => {
      const r = await run(TB.api("POST", `/api/e/${S.code}/me/passes/${el.dataset.id}/reissue`, {}));
      if (r && r.link) { copy(r.link, "New link copied. The old link stopped working."); await tlLoad(); }
    },
  };
  const TC = {
    tlCc: (el) => { T.cc = el.value; },
  };
  function tlWaLink(link, raw, cc, name) {
    const dial = (TB.COUNTRIES.find((c) => c[0] === (cc || "IN")) || [0, 0, 91])[2];
    let d = digits(raw), num = "";
    if (raw) {
      if (String(raw).trim().startsWith("+")) num = d;
      else if (d.startsWith("00")) num = d.slice(2);
      else num = String(dial) + d.replace(/^0+/, "");
    }
    const msg = `Hi ${firstName(name)}, here is your personal pass for ${T.me.engagement.name}: ${link}\nIt works on one phone only, so please don't forward it.`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  }
  async function tlLoad() {
    try { T.me = await TB.api("GET", `/api/e/${S.code}/me`); }
    catch (e) { if (!T.me) return fatal("This link is not active on this phone.", `<p class="muted">${esc(e.message)}</p>`); return; }
    if (T.me.me.role === "host") { return enterHost(S.code, T.me.me.name); }
    tlPaint();
  }
  function tlPaint() {
    const m = T.me; if (!m) return;
    const e = m.engagement, q = m.quotas, closed = e.status !== "open" && e.status !== "starting";
    const cu = q.colleagues ? q.colleagues.used : 0, cap = q.colleagues ? q.colleagues.cap : 0;
    const fu = q.family ? q.family.used : 0, fl = q.family ? q.family.limit : 0;
    const cFull = !q.colleagues || cu >= cap, fFull = !q.family || fu >= fl;
    if (T.type === "colleague" && cFull && !fFull) T.type = "family";
    if (T.type === "family" && fFull && !cFull) T.type = "colleague";
    const first = firstName(m.me.name);
    const isTL = m.me.role === "team_lead";
    const head = `<div class="chead"><div><div class="eyebrow">Team Lead · ${esc(e.orgName)}</div><h1>${esc(first)}, bring in your team</h1><div class="stats">${esc(e.name)}${e.startsAt ? " · " + esc(TB.fmtDT(e.startsAt)) : ""}</div></div><a class="btn line" href="/e/${esc(S.code)}">${ic("ticket")} Open my ticket</a></div>`;
    const meters = `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
      ${q.colleagues ? `<div class="meter"><span>Colleague passes</span><b>${cu} / ${cap}</b><div class="bar"><i style="width:${cap ? Math.min(100, (cu / cap) * 100) : 0}%"></i></div></div>` : ""}
      ${q.family ? `<div class="meter"><span>Family passes</span><b>${fu} / ${fl}</b><div class="bar"><i style="width:${fl ? Math.min(100, (fu / fl) * 100) : 100}%"></i></div></div>` : ""}</div>`;
    const typeChips = q.colleagues && q.family ? chips("tlType", "t", "s", [["colleague", "A colleague"], ["family", "My family member"]], T.type, false) : "";
    let hint = closed ? `<p class="hint bad">Entry is closed. The engagement has started.</p>` : T.type === "colleague" && cFull ? `<p class="hint bad">You have used all ${cap} colleague passes. Ask the organizer for more.</p>` : T.type === "family" && fFull ? `<p class="hint bad">${fl ? "You have used all " + fl + " family passes." : "This engagement does not allow family members."}</p>` : `<p class="hint">The pass will work only for this number, on one phone.</p>`;
    const disabled = closed || (T.type === "colleague" ? cFull : fFull);
    const res = T.result ? `<div class="note ok" style="display:block;margin-top:14px"><b>Pass ready for ${esc(T.result.name)}</b><div class="linkbox" style="margin:8px 0">${esc(T.result.link)}</div>
      <div class="row"><a class="btn sm" target="_blank" rel="noopener" href="${tlWaLink(T.result.link, T.result.raw, T.result.cc, T.result.name)}">Send to ${esc(firstName(T.result.name))} on WhatsApp</a><button class="btn sm line" data-a="copyLink" data-v="${esc(T.result.link)}">${ic("copy")} Copy link</button></div></div>` : "";
    const rows = m.invitees.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.kind === "family" ? "Family" : "Colleague"}</td><td>${pStatus(x)}</td><td style="white-space:nowrap">${x.link ? `<div class="lnk"><a class="btn sm line" target="_blank" rel="noopener" href="${tlWaLink(x.link, "", "", x.name)}">WhatsApp</a><button class="btn sm line" data-a="copyLink" data-v="${esc(x.link)}">${ic("copy")}</button><button class="btn sm line" ${closed ? "disabled" : ""} data-a="tlReissue" data-id="${x.id}">Re-issue</button><button class="btn sm danger" ${closed ? "disabled" : ""} data-a="tlCancel" data-id="${x.id}">Cancel</button></div>` : `<span class="sub">Joined</span>`}</td></tr>`).join("");
    const secs = [
      ["tlhead", head + (isTL ? "" : `<div class="note warn">${ic("alert")}<span>You are no longer a Team Lead for this engagement.</span></div>`)],
      ["tlmeters", `<div class="panel"><div class="phead"><div class="step">1</div><div><h2>Create a pass</h2><p>Create a pass for each person. Each pass works on one phone only, so nobody else can use it.</p></div></div>${meters}</div>`],
    ];
    const form = `<div class="panel" style="margin-top:-6px;padding-top:6px"><label class="lb">Who is this pass for?</label>${typeChips || `<div class="small muted">${q.colleagues ? "A colleague" : "A family member"}</div>`}
      <div class="grid" style="margin-top:4px"><div><label class="lb" for="tlName">Their name</label><input class="inp" id="tlName" value="${esc(T.name)}" maxlength="60" data-i="tlName"></div>
      <div><label class="lb" for="tlCc">Their country</label><select class="inp" id="tlCc" data-c="tlCc">${TB.countryOpts(T.cc)}</select></div>
      <div><label class="lb" for="tlNum">Their mobile number</label><input class="inp" id="tlNum" inputmode="tel" value="${esc(T.num)}" data-i="tlNum">${hint}</div></div>
      <button class="btn" style="margin-top:12px" ${disabled || T.busy ? "disabled" : ""} data-a="tlCreate">Create pass</button>${res}</div>`;
    secs.push(["tlform", form]);
    secs.push(["tllist", `<div class="panel"><div class="phead"><div class="step">2</div><div><h2>Passes you created</h2><p>Cancel a pass that has not been used. If someone changes phones, issue a new link; the old one stops working.</p></div></div>
      ${m.invitees.length ? `<div class="tscroll"><table class="t"><thead><tr><th>Name</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="muted small">You have not created any passes yet.</p>`}</div>`]);
    let stage = $("tlstage");
    if (!stage) { root.innerHTML = `${topbar(``)}<div class="wrap" style="max-width:860px"><div id="tlstage"></div></div>`; stage = $("tlstage"); }
    for (const [id, html] of secs) {
      let el = stage.querySelector(`[data-sec="${id}"]`);
      if (!el) { el = document.createElement("div"); el.dataset.sec = id; stage.appendChild(el); }
      patch(el, html);
    }
  }

  // ================================================================ ROLE LINK (/r/CODE)
  const ROLE_ERR = {
    inuse: ["phone", "This link is already in use on another phone", "Only one phone can use a personal link. The Organizer has been told and can move your access to this phone."],
    closed: ["lock", "Entry is closed", "The engagement has already started, so nobody new can join. Ask your Organizer."],
    badlink: ["alert", "This link does not work", "Check the link your Organizer sent you."],
  };
  function roleScreen(inner) {
    root.innerHTML = `${topbar("")}<div class="rolecard">${inner}</div>`;
  }
  async function bootRole(linkCode) {
    let r;
    try { r = await TB.api("POST", `/api/r/${encodeURIComponent(linkCode)}/open`, {}); }
    catch (e) { return fatal(e.message); }
    if (r.t === "err") {
      const [ico, h, p] = ROLE_ERR[r.k] || ["alert", "Something went wrong", "Please try again."];
      return roleScreen(`<div class="pcard center"><div class="res no">${ic(ico)}</div><h2>${esc(h)}</h2><p class="lead">${esc(p)}</p></div>`);
    }
    if (r.t === "role") return roleConsent(linkCode, r);
    if (r.t === "ok") return enterRole(r.code, r.role, r.name);
    fatal("Something went wrong. Please try again.");
  }
  function roleConsent(linkCode, r) {
    const rn = roleName(r.role), en = r.engagement.name;
    roleScreen(`<div class="pcard"><div class="eyebrow">${esc(rn)} link</div><h2>Hi ${esc(firstName(r.name))}, you are a <em>${esc(rn)}</em> for ${esc(en)}</h2>
      <p class="lead">${r.role === "host" ? "As a Host you help admit participants and run the engagement." : "As a Team Lead you bring in your own team with personal passes."} This link works on this phone only.</p>
      ${r.engagement.startsAt ? `<div class="sum"><div class="kv"><span>When</span><b>${esc(TB.fmtDT(r.engagement.startsAt))}</b></div></div>` : ""}
      <label class="cb"><input type="checkbox" id="roleOk"> <span>I agree that my name and mobile number are used for this engagement. The Organizer may keep them for up to 365 days to reuse them, then they are deleted.</span></label>
      <button class="btn gold block" id="roleGo" disabled>Continue</button></div>`);
    const ok = $("roleOk"), go = $("roleGo");
    ok.onchange = () => (go.disabled = !ok.checked);
    go.onclick = async () => {
      go.disabled = true;
      try { const x = await TB.api("POST", `/api/r/${encodeURIComponent(linkCode)}/confirm`, { consent: true }); enterRole(x.code, x.role, r.name); }
      catch (e) { errT(e); go.disabled = !ok.checked; }
    };
  }
  function enterRole(code, role, name) {
    S.code = code;
    if (role === "host") return enterHost(code, name);
    if (role === "team_lead") { T.cc = ""; return enterTeamLead(); }
    fatal("You are not a Host or Team Lead any more.", `<a class="btn" href="/e/${esc(code)}">Open my ticket</a>`);
  }
  async function enterTeamLead() {
    try { const info = await TB.api("GET", `/api/e/${S.code}`); T.cc = info.defaultCountry || "IN"; } catch { T.cc = "IN"; }
    await tlLoad();
    if (S.role === "host") return;
    TB.ws(S.code, {}, () => { clearTimeout(enterTeamLead._t); enterTeamLead._t = setTimeout(tlLoad, 300); });
    setInterval(tlLoad, 10000);
  }
  function enterHost(code, name) {
    S.role = "host"; S.code = code; S.hostName = name || ""; S.step = ""; S.stageStep = null; S.data = null;
    bootConsole();
  }

  // ================================================================ DASHBOARD + REUSE (organizer landing screen)
  const D = { dash: null, lib: null, libQ: "", libT: null, loading: false, ai: undefined, aiDays: 30, aiLevel: "standard", aiBusy: false };
  async function loadAi() { try { D.ai = (await api("GET", "/api/orgs/me/ai-link")).link || null; } catch (e) { D.ai = D.ai === undefined ? null : D.ai; D.aiErr = true; } }
  function aiStatus() {
    const l = D.ai;
    if (!l) return { pill: pill("", "No link yet"), line: "You have not made a link yet." };
    if (l.revoked) return { pill: pill("bad", "Stopped"), line: "This link was stopped. Your AI can no longer use it." };
    if (!l.active) return { pill: pill("warn", "Expired"), line: `This link expired on ${esc(dDate(l.expiresAt))}.` };
    return { pill: pill("ok", l.level === "read" ? "Active · read only" : "Active"), line: `Expires on <b>${esc(dDate(l.expiresAt))}</b> · ${l.lastUsedAt ? "last used " + esc(TB.ago(l.lastUsedAt)) : "not used yet"} · <b>${l.calls || 0}</b> ${(l.calls || 0) === 1 ? "call" : "calls"}` };
  }
  function aiChoices() {
    return `<label class="lb">Valid for</label>${chips("aiPick", "aiDays", "n", [[1, "1 day"], [7, "7 days"], [30, "30 days"]], D.aiDays)}
      <label class="lb">What your AI may do</label>${chips("aiPick", "aiLevel", "s", [["standard", "Standard"], ["read", "Read only"]], D.aiLevel)}
      <p class="hint">${D.aiLevel === "read" ? "Read only: your AI can look at engagements and reports but cannot change anything." : "Standard: your AI can set up engagements, add people and run the day. Big steps still need your tap."}</p>`;
  }
  function aiCard() {
    const has = !!D.ai, st = aiStatus();
    return `<div class="panel dai" id="aiCard"><div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="eyebrow">Your AI</div><h2 class="dlh">Let your AI do the work</h2></div>${st.pill}</div>
      <p class="muted small" style="margin:4px 0 8px">Copy one message into ChatGPT, Gemini, Claude or any AI chat. Your AI then sets up engagements, adds or reuses people, runs the day and tells you the report. No password and no learning our screens. Starting, ending, removing people, erasing details and payments still need your tap.</p>
      ${D.ai !== undefined ? `<div class="dline" style="font-size:14px">${st.line}</div>` : ""}
      ${has ? `<p class="hint">A new link replaces and cancels the old one.</p>` : ""}
      ${aiChoices()}
      <div class="row dbtns" style="margin-top:12px"><button class="btn gold dbtn" ${D.aiBusy ? "disabled" : ""} data-a="aiCreate">${ic("link")} ${has ? "Create a new link" : "Create my AI work link"}</button>${has && D.ai.active ? `<button class="btn line dbtn" data-a="aiStop">Stop this link</button>` : ""}</div>
      <p class="hint">${ic("shield")} Your AI provider (for example OpenAI or Google) sees what your AI reads, such as names. Mobile numbers are masked.</p></div>`;
  }
  A.aiPick = (el) => { D[el.dataset.k] = parseV(el); const c = $("aiCard"); if (c) c.outerHTML = aiCard(); };
  A.aiCreate = async () => {
    if (D.aiBusy) return; D.aiBusy = true; const c = $("aiCard"); if (c) c.outerHTML = aiCard();
    const r = await run(api("POST", "/api/orgs/me/ai-link", { days: D.aiDays, level: D.aiLevel }));
    D.aiBusy = false;
    if (r) await loadAi();
    const c2 = $("aiCard"); if (c2) c2.outerHTML = aiCard();
    if (!r) return;
    AI_PROMPT = r.prompt || r.link;
    sheet(`<h2>Your AI work link is ready</h2><p class="muted small">Paste this whole message into your AI chat (ChatGPT, Gemini, Claude or any other). It will start working right away.</p>
      <label class="lb" for="aiMsg">Message for your AI</label><textarea class="inp" id="aiMsg" readonly style="min-height:150px" aria-label="Message for your AI">${esc(AI_PROMPT)}</textarea>
      <button class="btn gold block dbtn" style="margin-top:10px" data-a="aiCopy">${ic("copy")} Copy message</button>
      <p class="hint"><b>Shown only once.</b> We also emailed it to ${esc(r.emailedTo || S.me.email)}.</p>
      <ul class="facts" style="margin:8px 0 0"><li>Anyone with this message can act for you, so keep it private.</li><li>Mobile numbers are masked for your AI.</li><li>When your AI wants to start or end an engagement, it sends you a confirmation link. Open it and tap Confirm.</li></ul>
      <button class="btn line block dbtn" style="margin-top:10px" data-a="closeSheet">Done</button>`);
    const t = $("aiMsg"); if (t) { t.focus(); t.select(); }
  };
  A.aiCopy = () => { copy(AI_PROMPT, "Message copied"); const t = $("aiMsg"); if (t) t.select(); };
  A.aiStop = () => confirmSheet({ title: "Stop this AI work link?", body: "Your AI will no longer be able to act for you. Anything it already drafted that is waiting for your tap will not be confirmed. You can make a new link any time.", yes: "Stop this link", danger: true,
    onYes: async () => { closeSheet(); const r = await run(api("DELETE", "/api/orgs/me/ai-link"), "Link stopped"); if (r) { await loadAi(); const c = $("aiCard"); if (c) c.outerHTML = aiCard(); } } });
  A.aiHint = () => { location.href = "/console#AI"; };
  let AI_PROMPT = "";
  let R = null; // reuse sheet state
  let rvT = null;
  const dDate = (t) => (t ? TB.fmtD(t) : "date not set");
  const people = (n) => TB.plural(n, "person", "people");
  async function loadDash() {
    D.loading = true;
    try { D.dash = await api("GET", "/api/orgs/me/dashboard"); } catch (e) { if (!D.dash) D.dash = null; }
    D.loading = false;
    return D.dash;
  }
  async function loadLib() {
    try { D.lib = await api("GET", "/api/orgs/me/library?q=" + encodeURIComponent(D.libQ)); } catch (e) { D.lib = { total: 0, rows: [], error: e.message }; }
  }
  const pastList = () => (D.dash ? D.dash.history.filter((x) => x.status === "ended" || x.status === "purged") : []);
  const openList = () => (D.dash ? D.dash.history.filter((x) => x.status === "open") : []);
  const activeList = () => (D.dash ? D.dash.history.filter((x) => x.status === "open" || x.status === "starting" || x.status === "started") : []);
  const libCount = () => (D.dash ? D.dash.library.count : 0);
  // sources that can be reused: past engagements with kept people, plus the saved list
  const rvSources = (exclude) => pastList().filter((x) => x.code !== exclude && x.peopleCount > 0);
  const canReuseAny = () => rvSources("").length > 0 || libCount() > 0;
  const lastLine = (x) => `Held on <b>${esc(dDate(x.heldAt))}</b> · Total <b>${x.total}</b> · Participated <b>${x.participated}</b>`;

  function pastCard(x) {
    const kept = x.peopleCount > 0;
    return `<div class="panel dcard"><div class="row" style="justify-content:space-between;align-items:flex-start"><div style="min-width:0"><b style="font:600 17px var(--serif)">${esc(x.name)}</b><div class="tiny muted">${esc(dDate(x.heldAt))} · ${esc(x.code)}</div></div>${pill("", "Ended")}</div>
      <div class="stats" style="margin:8px 0">Total <b>${x.total}</b> · Participated <b>${x.participated}</b></div>
      <div style="margin-bottom:10px">${kept ? pill("info", "Details kept until " + dDate(x.peopleExpiresAt) + " · " + people(x.peopleCount)) : pill("", "Details deleted")}</div>
      <div class="row dbtns"><button class="btn sm dbtn" ${kept ? "" : "disabled"} data-a="dReuse" data-v="${esc(x.code)}">Reuse the data</button><button class="btn sm line dbtn" ${kept ? "" : "disabled"} data-a="dEraseEng" data-v="${esc(x.code)}">${ic("trash")} Erase kept details</button></div>
      ${kept ? "" : `<p class="hint">Nothing is kept from this engagement, so there is nothing to reuse.</p>`}</div>`;
  }
  function activeCard(x) {
    const when = x.heldAt ? new Date(x.heldAt) : null;
    return `<a class="gcard" style="text-decoration:none;color:inherit" href="/console#${esc(x.code)}" data-a="openEng" data-v="${esc(x.code)}"><div class="gdate"><b>${when ? when.getDate() : "–"}</b><span>${when ? when.toLocaleDateString(undefined, { month: "short" }) : ""}</span></div><div style="flex:1;min-width:0"><b>${esc(x.name)}</b><div class="tiny muted">${esc(x.code)} · ${x.total} on the list</div></div>${pill(x.status === "open" ? "ok" : "warn", x.status === "open" ? "Open" : x.status === "starting" ? "Starting" : "In progress")}<span class="btn sm gold dbtn" style="pointer-events:none">Open</span></a>`;
  }
  function libRows() {
    const l = D.lib;
    if (!l) return `<p class="muted small">Loading…</p>`;
    if (l.error) return `<div class="err">${ic("alert")}<span>${esc(l.error)}</span></div>`;
    if (!l.rows.length) return `<p class="muted small">${D.libQ ? "Nobody matches this search." : "Nobody is saved yet."}</p>`;
    return `<div class="liblist">${l.rows.map((r) => `<div class="librow"><div style="min-width:0;flex:1"><b>${esc(r.name || "(no name)")}</b>${r.info ? ` <span class="tiny muted">· ${esc(r.info)}</span>` : ""}<div class="mono tiny">${esc(r.number)}</div><div class="tiny muted">Kept until ${esc(dDate(r.expiresAt))}</div></div><button class="btn sm danger dbtn" data-a="libErase" data-v="${esc(r.e164)}" data-n="${esc(r.name || r.number)}" aria-label="Erase ${esc(r.name || r.number)}">${ic("trash")} Erase</button></div>`).join("")}</div>${l.total > l.rows.length && !D.libQ ? `<p class="hint">Showing the first ${l.rows.length} of ${l.total}. Use search to find anyone else.</p>` : ""}`;
  }
  function renderDash() {
    const me = S.me, d = D.dash;
    if (!d) { root.innerHTML = `${topbar(consoleLinks(true))}<div class="wrap" style="max-width:760px"><div class="panel center"><p class="muted">We could not load your Dashboard.</p><button class="btn" data-a="dReload">Try again</button></div></div>`; return; }
    const last = d.last, active = activeList(), past = pastList();
    const lastCard = last
      ? `<div class="panel dlast"><div class="eyebrow">Last engagement</div><h2 class="dlh">${esc(last.name)}</h2><div class="dline">${lastLine(last)}</div>
         <div class="row dbtns" style="margin-top:12px"><button class="btn gold dbtn" ${canReuseAny() ? "" : "disabled"} data-a="dReuse" data-v="">Reuse the data</button><button class="btn line dbtn" data-a="dHist">History of all past engagements</button></div>
         ${canReuseAny() ? "" : `<p class="hint">The details of this engagement have been deleted, so there is nothing to reuse yet.</p>`}</div>`
      : `<div class="panel dlast"><div class="eyebrow">Last engagement</div><h2 class="dlh">Nothing here yet</h2><p class="muted small" style="margin:6px 0 0">Your past engagements will appear here. After your first engagement you can reuse everyone with one tap.</p></div>`;
    root.innerHTML = `${topbar(consoleLinks(true))}<div class="wrap" style="max-width:760px">
      <div class="chead"><div><div class="eyebrow">Dashboard · ${esc(me.org)}</div><h1>Your engagements</h1><div class="stats">${esc(me.email)}</div></div><a class="btn gold" href="/#pricing">Buy another pack</a></div>
      ${lastCard}
      ${aiCard()}
      <h2 class="dh2">Current engagements</h2>
      ${active.length ? active.map(activeCard).join("") : `<div class="panel center"><p class="muted small" style="margin:0 0 10px">You have no open engagement. Buy a pack to create a new one, then reuse your past people in it.</p><a class="btn dbtn" href="/#pricing">Buy a pack</a></div>`}
      <h2 class="dh2" id="dHistory">History of all past engagements</h2>
      ${past.length ? past.map(pastCard).join("") : `<div class="panel center"><p class="muted small" style="margin:0">No past engagements yet.</p></div>`}
      <h2 class="dh2">My saved list</h2>
      <div class="panel" id="dLib"><div class="row" style="justify-content:space-between;align-items:center"><div><b style="font:600 20px var(--serif)">${d.library.count}</b> <span class="muted">${d.library.count === 1 ? "person saved" : "people saved"}</span></div><button class="btn sm danger dbtn" ${d.library.count ? "" : "disabled"} data-a="libEraseAll">${ic("trash")} Erase everyone</button></div>
        <p class="hint">Kept for up to ${d.retentionDays} days after you last use them, then deleted automatically.${d.library.soonestExpiry ? " The earliest deletion is on " + esc(dDate(d.library.soonestExpiry)) + "." : ""}</p>
        <label class="lb" for="libQ">Search by name or number</label><input class="inp" id="libQ" type="search" value="${esc(D.libQ)}" placeholder="Search your saved list" data-i="libQ">
        <div id="libList" style="margin-top:10px">${libRows()}</div></div></div>`;
  }
  async function dashboard(scrollHist) {
    root.innerHTML = `${topbar(consoleLinks(true))}<div class="wrap center muted" style="padding-top:60px">Loading…</div>`;
    await Promise.all([loadDash(), loadLib(), loadAi()]);
    renderDash();
    if (scrollHist === "ai") { const h = $("aiCard"); if (h) h.scrollIntoView(); }
    else if (scrollHist) { const h = $("dHistory"); if (h) h.scrollIntoView(); }
  }
  async function refreshDash() { await Promise.all([loadDash(), loadLib(), loadAi()]); renderDash(); }
  function paintLib() { const el = $("libList"); if (el) el.innerHTML = libRows(); }

  // ---- reuse sheet
  async function openReuse(o) {
    o = o || {};
    await loadDash();
    if (!D.dash) return toast("We could not load your past engagements. Try again.");
    const opens = openList();
    R = { target: o.target || "", from: "", list: true, colleagues: true, family: false, roles: false, prev: null, prevErr: "", seq: 0, busy: false };
    if (!R.target) {
      if (!opens.length) {
        return sheet(`<h2>Buy a pack to create a new engagement first</h2><p class="muted small">The data is added to an engagement that is open for entry. You do not have one yet.</p>
          <a class="btn gold block dbtn" style="margin-top:12px" href="/#pricing">Buy a pack</a><button class="btn line block dbtn" style="margin-top:8px" data-a="closeSheet">Close</button>`);
      }
      if (opens.length === 1) R.target = opens[0].code;
    }
    R.want = o.from || "";
    if (R.target) rvPickDefault();
    rvRender();
    if (R.target) rvQueue(0);
  }
  function rvPickDefault() {
    const srcs = rvSources(R.target);
    const want = R.want;
    if (want && (srcs.some((x) => x.code === want) || want === "library")) R.from = want;
    else if (D.dash.last && srcs.some((x) => x.code === D.dash.last.code)) R.from = D.dash.last.code;
    else if (srcs.length) R.from = srcs[0].code;
    else if (libCount() > 0) R.from = "library";
    else R.from = "";
  }
  function rvRender() {
    const r = R; if (!r) return;
    if (!r.target) {
      return sheet(`<h2>Which engagement do you want to fill?</h2><p class="muted small">Choose the engagement that should receive these people.</p>
        <div class="rvlist">${openList().map((x) => `<button type="button" class="chip" data-a="rvTarget" data-v="${esc(x.code)}"><b>${esc(x.name)}</b><span class="tiny muted">${esc(x.code)} · ${esc(dDate(x.heldAt))} · ${people(x.total)} on the list</span></button>`).join("")}</div>
        <button class="btn line block dbtn" style="margin-top:12px" data-a="closeSheet">Cancel</button>`);
    }
    const srcs = rvSources(r.target), tgt = D.dash.history.find((x) => x.code === r.target), p = r.prev;
    if (!srcs.length && !libCount()) {
      return sheet(`<h2>Nothing to reuse yet</h2><p class="muted small">No saved people were found. Details are kept after an engagement ends.</p><button class="btn line block dbtn" style="margin-top:12px" data-a="closeSheet">Close</button>`);
    }
    const chipHtml = srcs.map((x) => `<button type="button" class="chip ${r.from === x.code ? "on" : ""}" role="radio" aria-checked="${r.from === x.code}" data-a="rvFrom" data-v="${esc(x.code)}"><b>${esc(x.name)}</b><span class="tiny muted">${esc(dDate(x.heldAt))} · ${people(x.peopleCount)}</span></button>`).join("")
      + (libCount() ? `<button type="button" class="chip ${r.from === "library" ? "on" : ""}" role="radio" aria-checked="${r.from === "library"}" data-a="rvFrom" data-v="library"><b>Everyone in my saved list</b><span class="tiny muted">${people(libCount())}</span></button>` : "");
    const cnt = (k) => (p ? ` <b>(${p.counts[k]})</b>` : "");
    const tick = (k, label, extra) => `<label class="cb"><input type="checkbox" ${r[k] ? "checked" : ""} data-c="rvTick" data-k="${k}"><span>${label}${extra || ""}</span></label>`;
    let prev;
    if (r.prevErr) prev = `<div class="err">${ic("alert")}<span>${esc(r.prevErr)}</span></div>`;
    else if (!p) prev = `<div class="note">${ic("clock")}<span>Checking who will be added…</span></div>`;
    else {
      const total = tgt ? tgt.total + p.placesLeft : null;
      prev = `<div class="note info" style="display:block"><div>Will add <b>${people(p.willAdd)}</b>. ${p.skipped.alreadyIn} ${p.skipped.alreadyIn === 1 ? "is" : "are"} already in this engagement. ${p.skipped.optedOut} asked us not to keep their details.</div><div style="margin-top:4px">Places left: <b>${p.placesLeft}</b>${total ? " of <b>" + total + "</b>" : ""}</div></div>`
        + (p.exceedsBy > 0 ? `<div class="err" style="margin-top:8px">${ic("alert")}<span>This adds ${people(p.willAdd)} but only ${p.placesLeft} ${p.placesLeft === 1 ? "place is" : "places are"} left. Raise your limit or untick a group.</span></div>` : "");
    }
    const ok = p && !r.prevErr && p.willAdd > 0 && p.exceedsBy <= 0 && !r.busy;
    sheet(`<div class="rvs"><h2>Reuse the data</h2>
      <p class="muted small" style="margin:0 0 8px">Add people to <b>${esc(tgt ? tgt.name : r.target)}</b> <span class="tiny">(${esc(r.target)})</span>${openList().length > 1 ? ` <button type="button" class="btn ghost" data-a="rvChange">Change</button>` : ""}</p>
      <label class="lb" style="margin-top:4px">Take people from</label><div class="rvlist" role="radiogroup">${chipHtml}</div>
      <label class="lb">Who to add</label>
      ${tick("list", "People on the list", cnt("list"))}${tick("colleagues", "Colleagues who joined", cnt("colleagues"))}${tick("family", "Family members", cnt("family"))}
      ${tick("roles", "Also make the same Hosts and Team Leads", p ? ` <b>(${p.roles.hosts} Hosts, ${p.roles.teamLeads} Team Leads)</b>` : "")}
      <div id="rvPrev" style="margin-top:8px">${prev}</div>
      <button class="btn gold block dbtn" style="margin-top:14px" ${ok ? "" : "disabled"} data-a="rvGo">${r.busy ? "Adding…" : p && p.willAdd > 0 ? "Add " + people(p.willAdd) : "Add people"}</button>
      <button class="btn line block dbtn" style="margin-top:8px" data-a="closeSheet">Cancel</button></div>`);
  }
  function rvQueue(delay) {
    const r = R; if (!r || !r.target || !r.from) return;
    r.prev = null; r.prevErr = "";
    const seq = ++r.seq;
    clearTimeout(rvT);
    rvT = setTimeout(async () => {
      const q = `from=${encodeURIComponent(r.from)}&list=${r.list ? 1 : 0}&colleagues=${r.colleagues ? 1 : 0}&family=${r.family ? 1 : 0}`;
      let res, err = "";
      try { res = await api("GET", `/api/e/${encodeURIComponent(r.target)}/reuse/preview?${q}`); } catch (e) { err = e.message; }
      if (R !== r || r.seq !== seq) return;
      r.prev = res || null; r.prevErr = err; rvRender();
    }, delay === undefined ? 250 : delay);
  }
  async function rvGo() {
    const r = R; if (!r || r.busy) return;
    r.busy = true; rvRender();
    let res;
    try { res = await api("POST", `/api/e/${encodeURIComponent(r.target)}/reuse`, { from: r.from, include: { list: r.list, colleagues: r.colleagues, family: r.family }, restoreRoles: r.roles }); }
    catch (e) { r.busy = false; r.prevErr = e.message; rvRender(); return; }
    closeSheet();
    toast(`Added ${people(res.added)}${res.rolesRestored ? " · " + res.rolesRestored + " Host/Team Lead roles restored" : ""}`);
    const target = r.target; R = null; D.dash = null;
    S.nextStep = "people";
    if (S.role === "org" && S.code === target && S.data) { await loadConsole(); gotoStep("people"); }
    else { history.replaceState(null, "", "/console#" + target); startOrg(); }
  }
  function reuseBanner() {
    const l = D.dash.last, can = rvSources(S.code).length > 0 || libCount() > 0;
    return `<div class="alert"><span class="dbanner" style="flex:1;min-width:220px">${ic("clock")} <span><b>Last engagement was on ${esc(dDate(l.heldAt))}</b> · Total <b>${l.total}</b> · Participated <b>${l.participated}</b></span></span>${can ? `<button class="btn sm dbtn" data-a="reuseHere">Reuse the data</button>` : ""}<a class="btn sm line dbtn" href="/console#history">History</a></div>`;
  }

  // ---- erase (always behind a confirm sheet)
  function eraseEngagement(code) {
    const x = D.dash.history.find((h) => h.code === code); if (!x) return;
    confirmSheet({ title: `Erase the kept details of ${x.name}?`, body: `The names, numbers and departments kept from this engagement are deleted now. The totals stay. People who are also in your saved list stay there until you erase them in My saved list or they expire.`, yes: "Erase kept details", danger: true,
      onYes: async () => { closeSheet(); const r = await run(api("POST", "/api/orgs/me/erase", { type: "engagement", code }), "Kept details erased"); if (r) await refreshDash(); } });
  }
  function erasePerson(e164, name) {
    confirmSheet({ title: `Erase ${name}?`, body: `Their name, number and department are deleted from your saved list and from every past engagement. <b>This also stops us keeping this number again</b>, even if you upload it in a future engagement.`, yes: "Erase this person", danger: true,
      onYes: async () => { closeSheet(); const r = await run(api("POST", "/api/orgs/me/erase", { type: "person", e164 }), "Erased"); if (r) await refreshDash(); } });
  }
  function eraseAll() {
    const go = async () => {
      if (!$("eaOk").checked) { sheetYes = go; return toast("Tick the box to confirm."); }
      closeSheet(); const r = await run(api("POST", "/api/orgs/me/erase", { type: "all" }), "Everyone erased"); if (r) await refreshDash();
    };
    confirmSheet({ title: "Erase everyone you have saved?", body: "Every name, number and department kept from all your engagements is deleted. You will have to upload people again for your next engagement.", danger: true, yes: "Erase everyone", extra: `<label class="cb"><input type="checkbox" id="eaOk"> I understand this cannot be undone.</label>`, onYes: go });
  }

  A.openEng = (el, e) => { e.preventDefault(); history.replaceState(null, "", "/console#" + el.dataset.v); startOrg(); };
  A.dReload = () => dashboard();
  A.dHist = () => { const h = $("dHistory"); if (h) h.scrollIntoView({ behavior: "smooth" }); };
  A.dReuse = (el) => openReuse({ from: el.dataset.v });
  A.reuseHere = () => openReuse({ target: S.code });
  A.dEraseEng = (el) => eraseEngagement(el.dataset.v);
  A.libErase = (el) => erasePerson(el.dataset.v, el.dataset.n);
  A.libEraseAll = eraseAll;
  A.rvFrom = (el) => { if (!R) return; R.from = el.dataset.v; rvRender(); rvQueue(); };
  A.rvTarget = (el) => { if (!R) return; R.target = el.dataset.v; rvPickDefault(); rvRender(); rvQueue(0); };
  A.rvChange = () => { if (!R) return; R.want = R.from; R.target = ""; R.prev = null; rvRender(); };
  A.rvGo = rvGo;
  C.rvTick = (el) => { if (!R) return; R[el.dataset.k] = el.checked; rvRender(); if (el.dataset.k !== "roles") rvQueue(); };
  I.libQ = (el) => { D.libQ = el.value; clearTimeout(D.libT); D.libT = setTimeout(async () => { await loadLib(); paintLib(); }, 250); };
  window.addEventListener("hashchange", () => { if (S.role === "org") location.reload(); });

  async function startOrg() {
    if (!TB.orgToken()) return location.replace("/#login");
    S.role = "org";
    let me;
    try { me = await TB.api("GET", "/api/orgs/me", undefined, { org: true }); }
    catch (e) { if (e.status === 401) { TB.setOrgToken(null); return location.replace("/#login"); } return fatal(e.message); }
    S.me = me;
    const hash = decodeURIComponent(location.hash.slice(1)).toUpperCase();
    const code = (me.engagements.find((x) => x.code === hash) || {}).code;
    if (!code) return dashboard(hash === "AI" ? "ai" : hash === "HISTORY");
    S.code = code; S.data = null; S.step = S.nextStep || ""; S.nextStep = ""; S.stageStep = null;
    bootConsole();
  }

  // ---------------------------------------------------------------- boot
  const path = location.pathname;
  if (/^\/r\/[^/]+$/.test(path)) bootRole(path.split("/")[2]);
  else startOrg();
})();
