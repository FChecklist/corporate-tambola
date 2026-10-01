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
    return { open: pill("ok", "Open for entry"), started: pill("warn", "Engagement in progress · entry closed"), ended: pill("bad", "Engagement ended"), purged: pill("", "Personal data deleted") }[s] || "";
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
  function consoleLinks() {
    if (isOrg()) return `<a href="/#pricing">Buy another pack</a><button class="tl" data-a="logout">${ic("logout")} Log out</button>`;
    return `<a href="/e/${esc(S.code)}">Open my ticket</a>`;
  }
  let rT = null;
  function queueRefresh() { clearTimeout(rT); rT = setTimeout(() => loadConsole(), 300); }

  async function loadConsole(first) {
    let d;
    try { d = await api("GET", `${E()}/console`); }
    catch (e) {
      if (first) { fatal(e.message || "Cannot open this engagement.", isOrg() ? `<a class="btn" href="/console">Back to my engagements</a>` : ""); return; }
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
    if (S.step === "share") drawQR();
    if (S.step === "report" && !S.report && eng().status !== "open") loadReport();
  }
  function gotoStep(s) {
    S.step = s; S.stageStep = null; paintSteps(); paintStage();
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
      ${closed ? `<p class="lockmsg">Entry is closed. The link now shows “Entry is closed”.</p>` : ""}</div></div>
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
      return [["report", `<div class="panel"><div class="phead"><div class="step">${ic("trash")}</div><div><h2>Personal data deleted</h2><p>24 hours after the end, every name, mobile number and personal link was deleted. Only this anonymous summary stays.</p></div></div>
        <div class="grid" style="margin-top:10px"><div class="meter"><span>Participants</span><b>${s.players ?? 0}</b></div><div class="meter"><span>Family members</span><b>${s.family ?? 0}</b></div><div class="meter"><span>Team Leads</span><b>${s.teamLeads ?? 0}</b></div></div></div>`]];
    }
    const del = (r.endedAt || Date.now()) + 864e5;
    const na = nameNotAwarded(r);
    return [["report", `<div class="panel" style="border-color:var(--gold)"><div class="phead"><div class="step">${ic("flag")}</div><div><h2>Report</h2><p>Copy the report before it is deleted. Personal data is deleted 24 hours after the end; only an anonymous summary stays.</p></div></div>
      <div class="alert">${ic("clock")}<span style="flex:1"><b>All names and mobile numbers will be deleted on ${esc(TB.fmtDT(del))}.</b> Copy the report now and keep it with your records.</span><button class="btn sm" data-a="copyReport">${ic("copy")} Copy report for Excel</button></div>
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
    confirmSheet({ title: "End the engagement now?", body: "Rewards that are still open will not be awarded. The report becomes available, and personal data is deleted 24 hours from now.", danger: true, yes: "End engagement", no: "Keep going",
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
      <label class="cb"><input type="checkbox" id="roleOk"> <span>I agree that my name and mobile number are used for this engagement and are deleted 24 hours after it ends.</span></label>
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

  // ================================================================ ORGANIZER BOOT
  function picker(me) {
    const list = me.engagements;
    root.innerHTML = `${topbar(consoleLinks())}<div class="wrap" style="max-width:720px"><div class="chead"><div><div class="eyebrow">Organizer console · ${esc(me.org)}</div><h1>Your engagements</h1><div class="stats">${esc(me.email)}</div></div><a class="btn gold" href="/#pricing">Buy another pack</a></div>
      ${list.length ? list.map((x) => `<a class="gcard" style="text-decoration:none;color:inherit" href="/console#${esc(x.code)}" data-a="openEng" data-v="${esc(x.code)}"><div class="gdate"><b>${x.startsAt ? new Date(x.startsAt).getDate() : "–"}</b><span>${x.startsAt ? new Date(x.startsAt).toLocaleDateString(undefined, { month: "short" }) : ""}</span></div><div style="flex:1"><b>${esc(x.name)}</b><div class="tiny muted">${esc(x.code)} · pack of ${x.pack} · ${x.participants} on the list</div></div>${pill(x.status === "open" ? "ok" : x.status === "started" ? "warn" : "", x.status === "open" ? "Open" : x.status === "started" ? "In progress" : x.status === "ended" ? "Ended" : "Deleted")}</a>`).join("") : `<div class="panel center"><p class="muted">You have no engagements yet.</p><a class="btn" href="/#pricing">Buy a pack</a></div>`}</div>`;
  }
  A.openEng = (el, e) => { e.preventDefault(); history.replaceState(null, "", "/console#" + el.dataset.v); startOrg(); };

  async function startOrg() {
    if (!TB.orgToken()) return location.replace("/#login");
    S.role = "org";
    let me;
    try { me = await TB.api("GET", "/api/orgs/me", undefined, { org: true }); }
    catch (e) { if (e.status === 401) { TB.setOrgToken(null); return location.replace("/#login"); } return fatal(e.message); }
    S.me = me;
    const hash = decodeURIComponent(location.hash.slice(1)).toUpperCase();
    let code = (me.engagements.find((x) => x.code === hash) || {}).code;
    if (!code && me.engagements.length === 1) code = me.engagements[0].code;
    if (!code) return picker(me);
    S.code = code; S.data = null; S.step = ""; S.stageStep = null;
    bootConsole();
  }

  // ---------------------------------------------------------------- boot
  const path = location.pathname;
  if (/^\/r\/[^/]+$/.test(path)) bootRole(path.split("/")[2]);
  else startOrg();
})();
