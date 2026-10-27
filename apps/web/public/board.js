/* Corporate Tambola organizer board: the real-life housie board with every number already called on it. ONLY the Organizer, a Host or a Co-host can open it
   (the key comes from the console link and is checked with the server). Players never see this board: they see only the number just called.
   It reads the public numbers and the public count of winners, and never joins the engagement. */
(function () {
  const ZG = window.ZG;
  const $app = document.getElementById("app");
  const q = new URLSearchParams(location.search);
  const EID = (q.get("e") || "").trim();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const NAMES = { early5: "Early Five", top: "Top line", mid: "Middle line", bot: "Bottom line", corners: "Four corners", star: "Star", full: "Full house", full2: "Super Bumper House", lucky: "Lucky draw" };
  (ZG.PRIZE_HOUSES || []).forEach((h) => { if (!NAMES[h.id]) NAMES[h.id] = h.label; }); // the newer houses come from the shared table
  const ORD = (k) => ["", "1st", "2nd", "3rd"][k] || k + "th";
  const S = { info: null, infoAge: 0, cf: null, store: new ZG.RoundStore({}), logs: {}, round: 1, now: null, st: null, results: [], err: "", lastNum: null };
  const j = async (url) => { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw Object.assign(new Error("http " + r.status), { status: r.status }); return r.json(); };
  const hms = (s) => { s = Math.max(0, Math.round(s)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":"); };
  const mmss = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

  async function tick() {
    try {
      if (!S.info || ++S.infoAge >= 20) { S.info = await j(`/api/z/${EID}/info`); S.infoAge = 0; } // the public settings, re-read every minute: a DEMO GAME made real drops its mark here too
      const cf0 = await fetch(`/api/z/${EID}/control`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => S.cf); S.cf = cf0 && cf0.pubKey ? cf0 : null; S.locked = !!(cf0 && cf0.locked); S.cancelled = !!(cf0 && cf0.cancelled); S.dns = !!(cf0 && cf0.didNotStart); S.ann = cf0 && cf0.ann && cf0.ann.text ? cf0.ann : null; // held for non-payment: nothing is shown
      const l = await ZG.fetchRound("latest"); if (l) { S.now = l.round; S.nowAt = Date.now(); }
      if (S.now === null) { S.err = "Waiting for the clock…"; return; }
      const lv = S.cf && S.cf.live; if (lv && S.info) S.info = { ...S.info, startRound: lv.startRound, callSeconds: lv.callSeconds, callMode: lv.callMode, startMode: lv.startMode }; // a time or mode changed after publishing: this screen follows through the file it already reads
      const cfg = { tickets: S.info.tickets, rewards: S.info.rewards, breaks: S.info.breaks, rounds: S.info.rounds || 1, callMode: S.info.callMode === "host" ? "host" : "auto", startMode: S.info.startMode === "manual" ? "manual" : "auto", keepCalling: S.info.afterPrizes === "keep" };
      S.st = S.cf ? ZG.resolveControl(ZG.cfgOf(S.cf, ZG.hostGameOf(cfg, S.info.startRound)), S.cf.messages) : null; // host mode: the numbers come when the Host presses
      S.cfg = cfg;
      const stride = S.info.callSeconds / 3;
      let budget = 60;
      for (let r = 1; r <= cfg.rounds; r++) {
        const sched = Array.from({ length: 90 }, (_, k) => ZG.callRoundR(S.st, S.info.startRound + ZG.GRACE_ROUNDS, stride, cfg.breaks, r, k));
        (S.sched = S.sched || {})[r] = sched;
        const upto = sched.filter((x) => x !== null && !S.locked && x <= S.now);
        const need = upto.filter((x) => !S.store.rounds.has(x)).slice(0, budget); budget -= need.length;
        await Promise.all(need.map((x, i) => (S.now - x <= 2 ? S.store.fetchLive(x, i) : S.store.fetchBackfill(x, i))));
        S.logs[r] = ZG.logFrom(ZG.roundEid(EID, r), sched.filter((x) => x !== null), S.store, upto.length);
      }
      S.store.verifySome(3);
      S.round = Math.max(1, ...Object.keys(S.logs).filter((r) => S.logs[r].length > 0).map(Number));
      try { S.results = (await j(`/api/z/${EID}/results`)).results || []; } catch {}
      S.err = "";
    } catch (e) { S.err = e.status === 403 ? "This engagement is not open yet." : e.status === 404 ? "That engagement was not found." : "Connecting…"; }
  }

  function draw() {
    if (!S.info) return ($app.innerHTML = `<p class="msg">${esc(S.err || "Loading…")}</p>`);
    const info = S.info, cfg = S.cfg || { rounds: 1 };
    const secsToStart = S.now === null ? null : (info.startRound + ZG.GRACE_ROUNDS - S.now) * 3 - (Date.now() - (S.nowAt || Date.now())) / 1000;
    const log = S.locked ? [] : S.logs[S.round] || [];
    if (S.dns) return ($app.innerHTML = `<div class="top"><div class="brand">Corporate Tambola</div></div><div class="big"><h1>This game did not start</h1><p>This game did not start. Your details have been erased.</p></div><div class="foot">${esc(location.host)}/z?e=${esc(EID)}</div>`); // nobody paid; the time and 20 hours went by
    if (S.cancelled) return ($app.innerHTML = `<div class="top"><div class="brand">Corporate Tambola</div></div><div class="big"><h1>This game was cancelled</h1><p>This game was cancelled by the organizer.</p></div><div class="foot">${esc(location.host)}/z?e=${esc(EID)}</div>`);
    if (S.locked) return ($app.innerHTML = `<div class="top"><div class="brand">Corporate Tambola</div></div><div class="big"><h1>Waiting for the Organizer or Host</h1><p>Waiting for the Organizer or Host to start the game.</p></div><div class="foot">${esc(location.host)}/z?e=${esc(EID)}</div>`);
    const paused = S.st && S.now !== null && S.st.intervals.some((i) => S.now >= i.start && S.now < i.end);
    const hostWait = cfg.callMode === "host" && !paused && S.now !== null && (!S.st || !S.st.nextRounds.length || (S.st.nextRounds[S.st.nextRounds.length - 1] <= S.now && log.length >= S.st.nextRounds.length - 90 * (S.round - 1)));
    const annBar = S.ann ? `<div class="annbar" role="alert">${esc(S.ann.text)}</div>` : "";
    const bd = info.brand && typeof info.brand === "object" ? info.brand : null, bLogo = bd && typeof bd.logo === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(bd.logo) ? bd.logo : ""; // the organizer's own logo and name, or ours in writing
    const head = `${annBar}<div class="top"><div class="brand">${bLogo ? `<img class="blogo" alt="" src="${esc(bLogo)}">` : ""}${esc(bd && bd.name ? bd.name : "Corporate Tambola")}</div><div class="meta">${cfg.rounds > 1 ? "Round " + S.round + " of " + cfg.rounds + " · " : ""}${ZG.calledLine(log.length)}</div></div>`;
    const wins = (S.results || []).filter((r) => r.round === S.round || r.round === undefined).map((r) => `<span><b>${esc(ORD(r.ordinal || 1))} ${esc(NAMES[r.pattern] || r.pattern)}</b> · ${r.count} winner${r.count === 1 ? "" : "s"}</span>`).join("");
    if (!log.length && cfg.startMode === "manual" && S.now !== null) { // a game that begins when the Host or Organizer presses Start
      const goR = S.st ? S.st.goRound : null, el = (Date.now() - (S.nowAt || Date.now())) / 1000, toR = (r) => (r - S.now) * 3 - el, joinL = `<p>Open the link on your phone and get your ticket: <b>${esc(location.host)}/z?e=${esc(EID)}</b></p>`;
      if (goR !== null && S.now < goR) return ($app.innerHTML = `${head}<div class="big"><h1>The game is starting</h1><p>The first number is coming.</p><div class="cd">${mmss(toR(goR))}</div>${joinL}</div><div class="foot">Join: ${esc(location.host)}/z?e=${esc(EID)}</div>`);
      if (goR === null && S.now < info.startRound) { const when = new Date((1692803367 + (info.startRound - 1) * 3) * 1000).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); return ($app.innerHTML = `${head}<div class="big"><p>The game starts at ${esc(when)}, in</p><div class="cd">${hms(toR(info.startRound))}</div><p>The host or organizer presses Start at that time.</p>${joinL}</div><div class="foot">Join: ${esc(location.host)}/z?e=${esc(EID)}</div>`); }
      if (goR === null) return ($app.innerHTML = `${head}<div class="big"><h1>Waiting for the host</h1><p>The host or organizer presses Start to begin the game.</p>${joinL}</div><div class="foot">Join: ${esc(location.host)}/z?e=${esc(EID)}</div>`);
    }
    if (!log.length) {
      const sec = secsToStart, joinLine = `<p>Open the link on your phone and get your ticket: <b>${esc(location.host)}/z?e=${esc(EID)}</b></p>`;
      return ($app.innerHTML = `${head}<div class="big">${sec !== null && sec > 120 ? `<p>The game starts in</p><div class="cd">${hms(sec - 120)}</div>${joinLine}` : sec !== null && sec > 0 ? `<h1>Your game is setting up</h1><p>We are waiting 2 minutes more for everyone to join.</p><div class="cd">${mmss(sec)}</div>${joinLine}` : hostWait ? `<h1>Waiting for the host</h1><p>The host presses for the first number.</p>` : `<h1>Get ready</h1><p>The first number is about to be called…</p>`}</div><div class="foot">Join: ${esc(location.host)}/z?e=${esc(EID)}</div>`);
    }
    const last = log[log.length - 1];
    const fresh = S.lastNum !== null && S.lastNum !== last; S.lastNum = last;
    const called = new Set(log);
    const board = Array.from({ length: 90 }, (_, i) => i + 1).map((n) => `<div class="${n === last ? "l" : called.has(n) ? "c" : ""}">${n}</div>`).join("");
    const recent = log.slice(-6, -1).reverse().map((n) => `<span>${n}</span>`).join("");
    const ps = ZG.prizeStatus && S.cfg ? ZG.prizeStatus(S.cfg, S.results || [], S.round || 1) : [];
    const prizes = ps.length ? `<div class="ps" aria-label="Prizes"><h2>Prizes</h2><ul>${ps.map((p) => p.claimed ? `<li class="done"><s>${esc(p.name)}</s> <small>claimed</small></li>` : `<li>${esc(p.name)}${p.text ? ": <b>" + esc(p.text) + "</b>" : ""}</li>`).join("")}</ul></div>` : "";
    const banner = paused ? `<div class="big" style="margin-bottom:1vh"><h1>Paused</h1><p>The organizer has paused the game. It will resume shortly.</p></div>` : "";
    $app.innerHTML = `${head}${banner}<div class="main"><div class="now"><div class="lbl">Number</div><div class="num ${fresh ? "fresh" : ""}">${last}</div>${hostWait && log.length < 90 ? `<p class="wait" id="hostwait">Waiting for the host</p>` : ""}<div class="recent" aria-label="Recent numbers">${recent}</div></div><div class="board" aria-label="Numbers called so far">${board}</div></div><div>${prizes}${wins ? `<div class="wins">${wins}</div>` : ""}<div class="foot">Join: ${esc(location.host)}/z?e=${esc(EID)}</div></div>`;
  }


  // ---------- the live panels under the board: story, quiet timer, controls, people, claims, averages, the whole log (Organizer, Host; a Co-host sees them without the controls) ----------
  const P = { gl: null, claims: [], tooLate: [], who: null, busy: false, note: "", sig: "" };
  const hm = (ms) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  async function pollPanels() {
    const g = async (path) => { const r = await fetch(path, { headers: { "x-organizer": KEY }, cache: "no-store" }); return r.ok ? r.json() : null; };
    try {
      P.gl = await g(`/api/z/${EID}/gamelog`);
      const c = await g(`/api/z/${EID}/claims`); if (c) { P.claims = c.claims || []; P.tooLate = c.tooLate || []; }
      const w = await g("/api/whoami"); P.who = (w && w.kind) || P.who;
    } catch { /* the next poll tries again */ }
  }
  const pausedNowB = () => !!(S.st && S.now !== null && S.st.intervals.some((i) => S.now >= i.start && S.now < i.end));
  function boardStory() {
    const log = S.logs[S.round] || [], cfg = S.cfg || {}, manual = cfg.startMode === "manual", go = S.st ? S.st.goRound : null, sr = S.info ? S.info.startRound : 0;
    const psAll = ZG.prizeStatus && S.cfg ? ZG.prizeStatus(S.cfg, S.results || [], S.round || 1) : [], prizesDone = !cfg.keepCalling && psAll.length > 0 && psAll.every((p) => p.claimed) && log.length > 0;
    const pz = S.st && S.now !== null ? S.st.intervals.find((i) => S.now >= i.start && S.now < i.end) : null, pm = pz && S.cf ? (S.cf.messages || []).find((m) => m.action === "pause" && m.atBeaconRound === pz.start) : null;
    let state;
    if (S.cancelled) state = "cancelled"; else if (S.locked) state = "unpaid"; else if (log.length >= 90) state = "endedAll"; else if (prizesDone) state = "endedPrizes"; else if (pz) state = "paused";
    else if (manual && go === null) state = S.now !== null && S.now >= sr ? "waitStart" : "waiting";
    else if (!log.length) { const left = S.now === null ? null : ((manual ? go : sr + ZG.GRACE_ROUNDS) - S.now) * 3; state = left !== null && left > 0 && left <= 300 ? "countdown" : "waiting"; }
    else state = "running";
    const left0 = S.now === null ? 0 : ((manual ? go || sr : sr + ZG.GRACE_ROUNDS) - S.now) * 3;
    return { state, ...ZG.story({ state, role: P.who === "host" ? "host" : P.who === "cohost" ? "cohost" : "organizer", called: prizesDone ? Math.max(0, ...(S.results || []).filter((x) => Number.isInteger(x.idx)).map((x) => x.idx + 2)) : log.length, manual, time: ZG.dayTimeIst((1692803367 + (sr - 1) * 3) * 1000), countdown: ZG.mmss(left0), by: pm && S.cf.by && S.cf.by[pm.seq - 1] === "Host" ? "a Host" : "the Organizer" }) };
  }
  function quietNext() {
    const nr = ((S.sched && S.sched[S.round]) || [])[(S.logs[S.round] || []).length];
    if (S.now === null || nr === null || nr === undefined || !Number.isFinite(nr) || pausedNowB() || (S.logs[S.round] || []).length >= 90) return "";
    const sec = (nr - S.now) * 3 - (Date.now() - (S.nowAt || Date.now())) / 1000;
    return sec > 0 ? "Next number in " + Math.ceil(sec) + "s" : "Next number any moment";
  }
  const calls = () => { const log = S.logs[S.round] || [], sc = (S.sched && S.sched[S.round]) || [], manual = (S.cfg || {}).callMode === "host"; return log.map((n, k) => ({ n, k: k + 1, ms: sc[k] != null && Number.isFinite(sc[k]) ? ZG.roundTimeMs(sc[k]) : null, manual })).filter((c) => c.ms !== null); };
  function events() { // plain proof lines: what happened, then the exact time (India time, with seconds). Newest first.
    const ev = [], who = (i) => (S.cf && S.cf.by && S.cf.by[i] === "Host" ? "a Host" : "the Organizer");
    const cs = calls();
    for (const c of cs) ev.push({ ms: c.ms, t: `Number <b>${c.n}</b> announced`, tail: ` \u00b7 ${ZG.calledLine(c.k)}` });
    for (const c of P.claims) ev.push({ ms: c.atMs, t: `Ticket ${seatOf(c.pid)} claimed ${esc(NAMES[c.pattern] || c.pattern)}${c.bogey ? "" : " after number " + (c.idx + 1)},`, tail: c.bogey ? " wrong (a Bogey)" : " accepted" });
    for (const x of P.tooLate) ev.push({ ms: x.atMs, t: `Ticket ${esc(x.ticket)} claimed ${esc(NAMES[x.pattern] || x.pattern)},`, tail: " too late, refused" });
    if (P.gl) {
      for (const p of P.gl.prizes) if (p.atMs) ev.push({ ms: p.atMs, t: `<b>${esc(p.prize)}</b> won by Ticket ${p.ticket}`, tail: "" });
      for (const jn of (P.gl.joins || [])) ev.push({ ms: jn.atMs, t: `Ticket ${jn.ticket} joined`, tail: "" });
      for (const c of P.gl.changes) ev.push({ ms: c.atMs, t: `${esc(c.who)}: ${esc(c.what)}`, tail: "" });
    }
    if (S.cf) (S.cf.messages || []).forEach((m, i) => { const txt = { go: "Start pressed", pause: "Paused", resume: "Resumed", extend: "Pause made longer", stop: "Game ended", next: "Next number pressed" }[m.action]; if (txt) ev.push({ ms: ZG.roundTimeMs(m.atBeaconRound), t: `${txt}`, tail: ` by ${who(i)}`, ctl: true }); });
    // the control lines are also in the plain list of changes: show each once
    const seenCtl = new Set(); const out = ev.filter((e) => { if (!e.ctl) return !/^(The Organizer|A Host): (Start was pressed|The game was (paused|resumed|ended)|The pause was made longer)$/.test(e.t.replace(/<[^>]*>/g, "")); const k = e.t + Math.round(e.ms / 1000); if (seenCtl.has(k)) return false; seenCtl.add(k); return true; });
    return out.sort((a, b) => b.ms - a.ms).slice(0, 400);
  }
  /** one line at the top of the log: how many numbers were announced, and whether any was missed (worked out from the log against the schedule) */
  function checkLine() {
    const sc = (S.sched && S.sched[S.round]) || [], log = S.logs[S.round] || [], due = S.now === null ? log.length : sc.filter((r) => r !== null && Number.isFinite(r) && r <= S.now).length;
    return ZG.sequenceCheck(log.length, Math.max(due, log.length));
  }
  const seatOf = (pid) => { const m = /^(\d+)x/.exec(String(pid)); return m ? m[1] : "?"; };
  function controlsHtml() {
    if (P.who !== "master" && P.who !== "host" && P.who !== "platform") return `<div class="bpbox" id="bp-controls"><h2>Controls</h2><p class="bpsmall">Pause, Resume and Next number are pressed by the Organizer or a Host.</p></div>`;
    const paused = pausedNowB(), manual = (S.cfg || {}).startMode === "manual", go = S.st ? S.st.goRound : null, host = (S.cfg || {}).callMode === "host", running = (S.logs[S.round] || []).length > 0 && (S.logs[S.round] || []).length < 90;
    const off = P.busy ? " disabled" : "";
    return `<div class="bpbox" id="bp-controls"><h2>Controls</h2><div class="bpbtns">
      ${manual && go === null ? `<button type="button" id="bp-go"${S.now !== null && S.now >= S.info.startRound ? off : " disabled"}>Start the game</button>` : ""}
      <button type="button" id="bp-pause"${paused || !running || P.busy ? " disabled" : ""}>Pause the game…</button>
      <button type="button" id="bp-resume"${paused ? off : " disabled"}>Resume</button>
      ${paused ? `<button type="button" id="bp-extend"${off}>Add 30 more minutes</button>` : ""}
      ${host ? `<button type="button" id="bp-next"${!paused && running ? off : " disabled"}>Next number</button>` : ""}</div>${P.note ? `<p class="bpnote" id="bp-note" role="status">${esc(P.note)}</p>` : ""}</div>`;
  }
  function panelsHtml() {
    if (!P.gl) return "";
    const st = boardStory(), g = P.gl, c = ZG.gapsByMode(calls().map((x) => ({ ms: x.ms, manual: x.manual }))), fmt = (v, n) => (v === null ? "not yet (needs at least 3 numbers)" : v + " seconds (from " + n + " numbers)");
    const q = quietNext(), people = `${g.people.joined} joined · ${g.people.waiting} waiting for the Organizer's OK` + (g.people.present != null ? ` · ${g.people.present} present` : "");
    const cl = [...P.claims.filter((x) => !x.bogey).map((x) => ({ ms: x.atMs, t: x.pid, p: x.pattern, r: "accepted" })), ...P.claims.filter((x) => x.bogey).map((x) => ({ ms: x.atMs, t: x.pid, p: x.pattern, r: "wrong (Bogey)" })), ...P.tooLate.map((x) => ({ ms: x.atMs, t: x.ticket + "x", p: x.pattern, r: "too late, refused" }))].sort((a, b) => b.ms - a.ms);
    const claimsRows = cl.length ? cl.slice(0, 100).map((x) => `<tr><td>${esc(hm(x.ms))}</td><td>Ticket ${seatOf(x.t)}</td><td>${esc(NAMES[x.p] || x.p)}</td><td>${esc(x.r)}</td></tr>`).join("") : `<tr><td colspan="4">No claim yet.</td></tr>`;
    return `<div class="bp"><div class="storybar" id="storyline" data-state="${st.state}"><b>${esc(st.say)}</b> <span>${esc(st.todo)}</span>${q ? ` <small class="bpquiet" id="bp-quiet" role="timer">${esc(q)}</small>` : ""}</div>
      ${controlsHtml()}
      <div class="bpgrid">
      <div class="bpbox" id="bp-people"><h2>People</h2><p>${esc(people)}</p></div>
      <div class="bpbox" id="bp-avg"><h2>Average gap between two numbers</h2><p>Called by the game: <b>${fmt(c.auto, c.nAuto)}</b></p><p>Called by hand: <b>${fmt(c.manual, c.nManual)}</b></p><p class="bpsmall">Worked out from the real times of this game's numbers; pauses and breaks are part of the time.</p></div>
      <div class="bpbox bpwide" id="bp-claims"><h2>Claims as they come</h2><div class="bpscroll"><table><thead><tr><th>Time</th><th>Who</th><th>Prize</th><th>Result</th></tr></thead><tbody>${claimsRows}</tbody></table></div></div>
      <div class="bpbox bpwide" id="bp-log"><h2>The whole game, newest first</h2><p class="bpcheck" id="bp-check" data-ok="${checkLine().ok}"><b>${esc(checkLine().text)}</b></p><div class="bpscroll" id="bp-logbox">${events().map((e) => `<div class="bpev">${e.t} <span class="bptime">${esc(hm(e.ms))}</span>${e.tail || ""}</div>`).join("") || "Nothing yet."}</div></div></div></div>`;
  }
  function askBoard(title, text, yes, no, tick) {
    return new Promise((res) => {
      const m = document.createElement("div"); m.id = "bp-sure"; m.className = "bpmodal"; m.setAttribute("role", "alertdialog"); m.setAttribute("aria-modal", "true");
      m.innerHTML = `<div class="bpmbox"><h3>${esc(title)}</h3><p>${esc(text)}</p>${tick ? `<label class="bptick"><input type="checkbox" id="bp-tick"> ${esc(tick)}</label>` : ""}<div class="bpbtns"><button type="button" id="bp-yes"${tick ? " disabled" : ""}>${esc(yes)}</button><button type="button" id="bp-no">${esc(no)}</button></div></div>`;
      document.body.appendChild(m); const done = (v) => { m.remove(); res(v); };
      if (tick) m.querySelector("#bp-tick").onchange = (e) => { m.querySelector("#bp-yes").disabled = !e.target.checked; };
      m.querySelector("#bp-yes").onclick = () => done(true); m.querySelector("#bp-no").onclick = () => done(false); m.querySelector("#bp-no").focus();
    });
  }
  async function press(action, o) {
    if (P.busy) return; P.busy = true; P.note = ""; drawPanels(true);
    try { const r = await TBControl.publish(EID, { token: KEY, base: "", prefix: "/api/z" }, action, o || {}); P.note = r.status === 200 ? { go: "Start was pressed.", pause: "Pause sent. It reaches the phones in a short while.", resume: "Resume sent.", extend: "Added 30 more minutes to the pause.", next: "Next number sent." }[action] || "Done." : (r.data && r.data.error) || "That did not go through. Please try again."; }
    catch (e) { P.note = /signing key/i.test(String(e && e.message)) ? "This browser does not hold the signing key for this game. Open the board from the browser where you opened your console." : "We could not reach the internet. Please check it and press the button again."; }
    setTimeout(() => { P.busy = false; drawPanels(true); }, 2500); // no accidental double press
    drawPanels(true); await pollPanels(); await tick(); draw(); drawPanels(true);
  }
  function drawPanels(force) {
    const el = document.getElementById("panels"); if (!el) return;
    const html = panelsHtml(); if (!force && html === P.sig) return;
    const box = document.getElementById("bp-logbox"), top = box ? box.scrollTop : 0;
    P.sig = html; el.innerHTML = html; const nb = document.getElementById("bp-logbox"); if (nb) nb.scrollTop = top;
    const on = (id, f) => { const b = document.getElementById(id); if (b) b.onclick = f; };
    on("bp-go", () => press("go")); on("bp-resume", () => press("resume")); on("bp-extend", () => press("extend", { addRounds: 600 })); on("bp-next", () => press("next"));
    on("bp-pause", async () => { if (await askBoard("Are you sure? Numbers stop for everybody.", "The game pauses on every phone and on the big screen until you press Resume. It ends by itself after 30 minutes.", "Yes, pause the game", "No, keep playing", "I understand: the numbers stop for every player until I press Resume.")) press("pause", { pauseForRounds: 600 }); });
  }

  if (!EID) { $app.innerHTML = `<p class="msg">No engagement was chosen.</p>`; return; }
  // Only the people who run the game see this board. The console link carries the key after the # (it never goes to the server in the address) and the server confirms it.
  let KEY = ""; try { const m = /(?:^|[#&])k=([^&]+)/.exec(location.hash || ""); if (m) { KEY = decodeURIComponent(m[1]); sessionStorage.setItem("ctz-board-" + EID, KEY); history.replaceState(null, "", location.pathname + location.search); } else KEY = sessionStorage.getItem("ctz-board-" + EID) || ""; } catch {}
  const checkKey = () => (KEY ? fetch(`/api/z/${EID}/cohost`, { headers: { "x-organizer": KEY }, cache: "no-store" }).then((r) => r.ok).catch(() => false) : Promise.resolve(false));
  checkKey().then((allowed) => {
    if (!allowed) { $app.innerHTML = `<main class="big"><h1>This board is for the Organizer</h1><p>The board with all the numbers is only for the Organizer, a Host or a Co-host. Players see only the number just called.</p><p>Please open it from your console: Game day, then Open my board.</p></main>`; return; }
    const loop = async () => { await tick(); draw(); drawPanels(); };
    loop(); setInterval(loop, 3000);
    pollPanels().then(() => drawPanels()); setInterval(async () => { await pollPanels(); drawPanels(); }, 5000);
    setInterval(() => { if (S.info && !(S.logs[S.round] || []).length) draw(); drawPanels(); }, 1000);
  });
  return;
  const loop = async () => { await tick(); draw(); };
  loop(); setInterval(loop, 3000);
  setInterval(() => { if (S.info && !(S.logs[S.round] || []).length) draw(); }, 1000); // the countdown ticks every second
})();
