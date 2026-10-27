/* Corporate Tambola organizer board: the real-life housie board with every number already called on it. ONLY the Organizer, a Host or a Co-host can open it
   (the key comes from the console link and is checked with the server). Players never see this board: they see only the number just called.
   It reads the public numbers and the public count of winners, and never joins the engagement. */
(function () {
  const ZG = window.ZG;
  const $app = document.getElementById("app");
  const q = new URLSearchParams(location.search);
  const EID = (q.get("e") || "").trim();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const NAMES = { early5: "Early Five", top: "Top line", mid: "Middle line", bot: "Bottom line", corners: "Four corners", star: "Star", full: "Full house", full2: "Full Two-Ticket House", lucky: "Lucky draw" };
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
      const cfg = { tickets: S.info.tickets, rewards: S.info.rewards, breaks: S.info.breaks, rounds: S.info.rounds || 1, callMode: S.info.callMode === "host" ? "host" : "auto", startMode: S.info.startMode === "manual" ? "manual" : "auto" };
      S.st = S.cf ? ZG.resolveControl(ZG.cfgOf(S.cf, ZG.hostGameOf(cfg, S.info.startRound)), S.cf.messages) : null; // host mode: the numbers come when the Host presses
      S.cfg = cfg;
      const stride = S.info.callSeconds / 3;
      let budget = 60;
      for (let r = 1; r <= cfg.rounds; r++) {
        const sched = Array.from({ length: 90 }, (_, k) => ZG.callRoundR(S.st, S.info.startRound + ZG.GRACE_ROUNDS, stride, cfg.breaks, r, k));
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
    const head = `${annBar}<div class="top"><div class="brand">${bLogo ? `<img class="blogo" alt="" src="${esc(bLogo)}">` : ""}${esc(bd && bd.name ? bd.name : "Corporate Tambola")}</div><div class="meta">${cfg.rounds > 1 ? "Round " + S.round + " of " + cfg.rounds + " · " : ""}Numbers called: ${log.length} of 90</div></div>`;
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

  if (!EID) { $app.innerHTML = `<p class="msg">No engagement was chosen.</p>`; return; }
  // Only the people who run the game see this board. The console link carries the key after the # (it never goes to the server in the address) and the server confirms it.
  let KEY = ""; try { const m = /(?:^|[#&])k=([^&]+)/.exec(location.hash || ""); if (m) { KEY = decodeURIComponent(m[1]); sessionStorage.setItem("ctz-board-" + EID, KEY); history.replaceState(null, "", location.pathname + location.search); } else KEY = sessionStorage.getItem("ctz-board-" + EID) || ""; } catch {}
  const checkKey = () => (KEY ? fetch(`/api/z/${EID}/cohost`, { headers: { "x-organizer": KEY }, cache: "no-store" }).then((r) => r.ok).catch(() => false) : Promise.resolve(false));
  checkKey().then((allowed) => {
    if (!allowed) { $app.innerHTML = `<main class="big"><h1>This board is for the Organizer</h1><p>The board with all the numbers is only for the Organizer, a Host or a Co-host. Players see only the number just called.</p><p>Please open it from your console: Game day, then Open my board.</p></main>`; return; }
    const loop = async () => { await tick(); draw(); };
    loop(); setInterval(loop, 3000);
    setInterval(() => { if (S.info && !(S.logs[S.round] || []).length) draw(); }, 1000);
  });
  return;
  const loop = async () => { await tick(); draw(); };
  loop(); setInterval(loop, 3000);
  setInterval(() => { if (S.info && !(S.logs[S.round] || []).length) draw(); }, 1000); // the countdown ticks every second
})();
