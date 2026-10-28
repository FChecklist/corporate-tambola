/* Corporate Tambola big screen: shows the engagement to a room on a projector or TV. No sign-in and no personal data: it only reads the public
   numbers (the same ones every phone uses) and the public count of winners. It never joins the engagement. */
(function () {
  const ZG = window.ZG;
  const $app = document.getElementById("app");
  // A tap is never lost to a redraw: while a finger or mouse button is down the screen is not redrawn (it is redrawn right after the release), nor while text is selected.
  const HOLD = (() => { let down = 0, pend = []; const set = () => { down = Date.now(); }, clr = () => { if (!down) return; down = 0; if (pend.length) { const fs = pend; pend = []; setTimeout(() => fs.forEach((f) => f()), 40); } };
    ["pointerdown", "touchstart", "mousedown"].forEach((e) => document.addEventListener(e, set, true)); ["pointerup", "pointercancel", "touchend", "touchcancel", "mouseup"].forEach((e) => document.addEventListener(e, clr, true));
    return { held: (f) => { if (down && Date.now() - down < 2500) { if (!pend.includes(f)) pend.push(f); return true; } try { const s = window.getSelection && window.getSelection(); if (s && !s.isCollapsed && s.anchorNode && document.contains(s.anchorNode)) return true; } catch {} return false; } }; })();
  /** keeps the scroll position of inner scrolling boxes, and the focused field with its caret, across a redraw of `root` */
  const KEEP = (root, redraw) => { const sc = Array.from(root.querySelectorAll("[id],.zhcard,.zinvsheet,.bpscroll")).filter((e) => e.scrollTop > 0).map((e) => [e.id, e.className, e.scrollTop]); const af = document.activeElement, fid = af && af.id && root.contains(af) ? af.id : "", ss = fid && af.selectionStart != null ? [af.selectionStart, af.selectionEnd] : null;
    redraw(); for (const [id, cn, top] of sc) { const e = id ? document.getElementById(id) : root.getElementsByClassName(cn)[0]; if (e) e.scrollTop = top; }
    if (fid) { const e = document.getElementById(fid); if (e && e !== document.activeElement) { try { e.focus({ preventScroll: true }); if (ss && e.setSelectionRange) e.setSelectionRange(ss[0], ss[1]); } catch {} } } };
  const q = new URLSearchParams(location.search);
  const EID = (q.get("e") || "").trim();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const NAMES = { early5: "Early Five", top: "Top line", mid: "Middle line", bot: "Bottom line", corners: "Four corners", star: "Star", full: "Full house", full2: "Super Bumper House", lucky: "Lucky draw" };
  (ZG.PRIZE_HOUSES || []).forEach((h) => { if (!NAMES[h.id]) NAMES[h.id] = h.label; }); // the newer houses come from the shared table
  const ORD = (k) => ["", "1st", "2nd", "3rd"][k] || k + "th";
  const S = { info: null, infoAge: 0, cf: null, store: new ZG.RoundStore({}), logs: {}, round: 1, now: null, st: null, results: [], err: "", lastNum: null, t0: Date.now() };
  const j = async (url) => { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw Object.assign(new Error("http " + r.status), { status: r.status }); return r.json(); };
  const hms = (s) => { s = Math.max(0, Math.round(s)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":"); };
  const mmss = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

  async function tick() {
    try {
      if (!S.info || ++S.infoAge >= 20) { S.info = await j(`/api/z/${EID}/info`); S.infoAge = 0; } // the public settings, re-read every minute: a DEMO GAME made real drops its mark here too
      const cf0 = await fetch(`/api/z/${EID}/control`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => S.cf); S.cf = cf0 && cf0.pubKey ? cf0 : null; S.locked = !!(cf0 && cf0.locked); S.cancelled = !!(cf0 && cf0.cancelled); S.dns = !!(cf0 && cf0.didNotStart); S.ann = cf0 && cf0.ann && cf0.ann.text ? cf0.ann : null; // held for non-payment: nothing is shown
      const l = await ZG.fetchRound("latest"); if (l) { S.now = l.round; S.nowAt = Date.now(); const smp = ZG.roundTimeMs(l.round) + 1500 - performance.now(); S.offs = S.offs || []; if (S.offs.length && Math.max(...S.offs) - smp > 15000) S.offs = []; S.offs.push(smp); if (S.offs.length > 5) S.offs.shift(); S.off = Math.max(...S.offs); } // the clock is the newest of the last 5 answers (a stale answer is never too new): one stale answer never makes the countdown jump
      if (S.now === null) { S.err = "Waiting for the clock…"; return; }
      const lv = S.cf && S.cf.live; if (lv && S.info) S.info = { ...S.info, startRound: lv.startRound, callSeconds: lv.callSeconds, callMode: lv.callMode, startMode: lv.startMode, afterPrizes: lv.afterPrizes }; // a time or mode changed after publishing: this screen follows through the file it already reads
      const cfg = { tickets: S.info.tickets, rewards: S.info.rewards, breaks: S.info.breaks, rounds: S.info.rounds || 1, callMode: S.info.callMode === "host" ? "host" : "auto", startMode: S.info.startMode === "manual" ? "manual" : "auto", keepCalling: S.info.afterPrizes === "keep" };
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
        S["next" + r] = sched[upto.length] === undefined ? null : sched[upto.length];
      }
      S.store.verifySome(3);
      S.round = Math.max(1, ...Object.keys(S.logs).filter((r) => S.logs[r].length > 0).map(Number));
      try { S.results = (await j(`/api/z/${EID}/results`)).results || []; } catch {}
      S.err = "";
    } catch (e) { S.err = e.status === 403 ? "This game is not published yet. Publish it first (step 7 in your console). This screen then starts by itself: you do not need to refresh." : e.status === 404 ? "That engagement was not found." : "Connecting…"; }
  }

  function draw() {
    if (HOLD.held(draw)) return;
    if (!S.info) return ($app.innerHTML = `<p class="msg">${esc(S.err || "Loading…")}</p>`);
    const info = S.info, cfg = S.cfg || { rounds: 1 };
    const secsToStart = S.now === null ? null : (info.startRound + ZG.GRACE_ROUNDS - S.now) * 3 - (Date.now() - (S.nowAt || Date.now())) / 1000;
    let log = S.locked ? [] : S.logs[S.round] || [];
    // every prize line has a confirmed winner: the game is over, the numbers stop where the last prize was completed (they are NOT called on to 90)
    const psAll = ZG.prizeStatus && S.cfg ? ZG.prizeStatus(S.cfg, S.results || [], S.round || 1) : [];
    const allDone = !(S.cfg && S.cfg.keepCalling) && psAll.length > 0 && psAll.every((p) => p.claimed) && (S.round || 1) >= ((S.cfg && S.cfg.rounds) || 1) && log.length > 0;
    // the numbers stop at the last completion plus the one call whose claim window closes it (the phones stop at the same count)
    if (allDone) { const lastIdx = Math.max(0, ...(S.results || []).filter((r) => (r.round || 1) === (S.round || 1) && Number.isInteger(r.idx)).map((r) => r.idx + 2)); if (lastIdx > 0 && lastIdx < log.length) log = log.slice(0, lastIdx); }
    if (S.dns) return ($app.innerHTML = `<div class="top"><div class="brand">Corporate Tambola</div></div><div class="big"><h1>This game did not start</h1><p>This game did not start. Your details have been erased.</p></div><div class="foot">${esc(location.host)}/z?e=${esc(EID)}</div>`); // nobody paid; the time and 20 hours went by
    if (S.cancelled) return ($app.innerHTML = `<div class="top"><div class="brand">Corporate Tambola</div></div><div class="big"><h1>This game was cancelled</h1><p>This game was cancelled by the organizer.</p></div><div class="foot">${esc(location.host)}/z?e=${esc(EID)}</div>`);
    if (S.locked) return ($app.innerHTML = `<div class="top"><div class="brand">Corporate Tambola</div></div><div class="big"><h1>Waiting for the Organizer or Host</h1><p>Waiting for the Organizer or Host to start the game.</p></div><div class="foot">${esc(location.host)}/z?e=${esc(EID)}</div>`);
    const paused = S.st && S.now !== null && S.st.intervals.some((i) => S.now >= i.start && S.now < i.end);
    // host mode: the Host has not pressed for the next number yet (or the last press has reached the screen): nothing counts down
    const hostWait = cfg.callMode === "host" && !paused && S.now !== null && (!S.st || !S.st.nextRounds.length || (S.st.nextRounds[S.st.nextRounds.length - 1] <= S.now && log.length >= S.st.nextRounds.length - 90 * (S.round - 1)));
    const lost = (S.now === null ? Date.now() - S.t0 : Date.now() - (S.nowAt || Date.now())) > 15000; // no answer from the public clock for 15 seconds: the numbers on this screen may be late
    const lostBar = lost ? `<div class="lostbar" role="alert">Connection lost. The numbers on this screen may be late. Reconnecting…</div>` : "";
    const annBar = S.ann ? `<div class="annbar" role="alert">${esc(S.ann.text)}</div>` : "";
    const bd = info.brand && typeof info.brand === "object" ? info.brand : null, bLogo = bd && typeof bd.logo === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(bd.logo) ? bd.logo : ""; // the organizer's own logo and name, or ours in writing
    const head = `${lostBar}${annBar}<div class="top"><div class="brand">${bLogo ? `<img class="blogo" alt="" src="${esc(bLogo)}">` : ""}${esc(bd && bd.name ? bd.name : "Corporate Tambola")}</div><div class="meta" id="calledmeta">${cfg.rounds > 1 ? "Round " + S.round + " of " + cfg.rounds + " · " : ""}${esc(ZG.calledLine(log.length))}</div></div>`;
    const storyState = S.cancelled ? "cancelled" : allDone ? "endedPrizes" : (log.length >= 90 && (S.round || 1) >= (cfg.rounds || 1)) ? "endedAll" : paused ? "paused" : cfg.startMode === "manual" && (!S.st || S.st.goRound == null) ? (S.now !== null && S.now >= info.startRound ? "waitStart" : "waiting") : log.length ? "running" : (secsToStart !== null && secsToStart > 0 && secsToStart <= 300 ? "countdown" : "waiting");
    const pzS = S.st && S.now !== null ? S.st.intervals.find((x) => S.now >= x.start && S.now < x.end) : null, pmS = pzS && S.cf ? (S.cf.messages || []).find((m) => m.action === "pause" && m.atBeaconRound === pzS.start) : null;
    const st0 = ZG.story({ state: storyState, role: "screen", called: log.length, manual: cfg.startMode === "manual", time: ZG.dayTimeIst((1692803367 + (info.startRound - 1) * 3) * 1000), countdown: ZG.mmss(secsToStart || 0), by: pmS && S.cf.by && S.cf.by[pmS.seq - 1] === "Host" ? "a Host" : "the Organizer" });
    const storyBar = `<div class="storybar" id="storyline" data-state="${storyState}"><b>${esc(st0.say)}</b> <span>${esc(st0.doNow)}</span></div>`;
    const wins = (S.results || []).filter((r) => r.round === S.round || r.round === undefined).map((r) => `<span><b>${esc(ORD(r.ordinal || 1))} ${esc(NAMES[r.pattern] || r.pattern)}</b> · ${r.count} winner${r.count === 1 ? "" : "s"}</span>`).join("");
    if (!log.length && cfg.startMode === "manual" && S.now !== null) { // a game that begins when the Host or Organizer presses Start
      const goR = S.st ? S.st.goRound : null, el = (Date.now() - (S.nowAt || Date.now())) / 1000, toR = (r) => (r - S.now) * 3 - el, joinL = `<p>Open the link on your phone and get your ticket: <b>${esc(location.host)}/z?e=${esc(EID)}</b></p>`;
      if (goR !== null && S.now < goR) return ($app.innerHTML = `${head}${storyBar}<div class="big"><h1>The game is starting</h1><p>The first number is coming.</p><div class="cd">${mmss(toR(goR))}</div>${joinL}</div><div class="foot">Join: ${esc(location.host)}/z?e=${esc(EID)}</div>`);
      if (goR === null && S.now < info.startRound) { const when = new Date((1692803367 + (info.startRound - 1) * 3) * 1000).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); return ($app.innerHTML = `${head}${storyBar}<div class="big"><p>The game starts at ${esc(when)}, in</p><div class="cd">${hms(toR(info.startRound))}</div><p>The host or organizer presses Start at that time.</p>${joinL}</div><div class="foot">Join: ${esc(location.host)}/z?e=${esc(EID)}</div>`); }
      if (goR === null) return ($app.innerHTML = `${head}${storyBar}<div class="big"><h1>Waiting for the host</h1><p>The host or organizer presses Start to begin the game.</p>${joinL}</div><div class="foot">Join: ${esc(location.host)}/z?e=${esc(EID)}</div>`);
    }
    if (!log.length) {
      const sec = secsToStart, joinLine = `<p>Open the link on your phone and get your ticket: <b>${esc(location.host)}/z?e=${esc(EID)}</b></p>`;
      return ($app.innerHTML = `${head}${storyBar}<div class="big">${sec !== null && sec > 120 ? `<p>The game starts in</p><div class="cd">${hms(sec - 120)}</div>${joinLine}` : sec !== null && sec > 0 ? `<h1>Your game is setting up</h1><p>We are waiting 2 minutes more for everyone to join.</p><div class="cd">${mmss(sec)}</div>${joinLine}` : hostWait ? `<h1>Waiting for the host</h1><p>The host presses for the first number.</p>` : `<h1>Get ready</h1><p>The first number is about to be called…</p>`}</div><div class="foot">Join: ${esc(location.host)}/z?e=${esc(EID)}</div>`);
    }
    const last = log[log.length - 1];
    const fresh = S.lastNum !== null && S.lastNum !== last; S.lastNum = last;
    const called = new Set(log);
    const ps = ZG.prizeStatus && S.cfg ? ZG.prizeStatus(S.cfg, S.results || [], S.round || 1) : [];
    const prizes = ps.length ? `<div class="ps" aria-label="Prizes"><h2>Prizes</h2><ul>${ps.map((p) => p.claimed ? `<li class="done"><s>${esc(p.name)}</s> <small>claimed</small></li>` : `<li>${esc(p.name)}${p.text ? ": <b>" + esc(p.text) + "</b>" : ""}</li>`).join("")}</ul></div>` : "";
    const hm = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const pz = S.st && S.now !== null ? S.st.intervals.find((x) => S.now >= x.start && S.now < x.end) : null, pm = pz && S.cf ? (S.cf.messages || []).find((m) => m.action === "pause" && m.atBeaconRound === pz.start) : null, pby = pm && S.cf.by && S.cf.by[pm.seq - 1] === "Host" ? "a Host" : "the Organizer";
    const over90 = log.length >= 90 && (S.round || 1) >= ((S.cfg && S.cfg.rounds) || 1);
    const banner = allDone ? `<div class="big" style="margin-bottom:1vh"><h1>Game over</h1><p>All prizes were awarded after ${log.length} numbers. Thank you for playing.</p></div>` : over90 ? `<div class="big" style="margin-bottom:1vh"><h1>Game over</h1><p>All 90 numbers were called. Thank you for playing.</p></div>` : paused ? `<div class="big" id="pausebanner" style="margin-bottom:1vh"><h1>PAUSED</h1><p>${pz ? "Paused by " + esc(pby) + " at " + esc(hm(ZG.roundTimeMs(pz.start))) + ". The numbers start again at about " + esc(hm(ZG.roundTimeMs(pz.end))) + ", or sooner when they press Resume." : "The organizer has paused the game. It will resume shortly."}</p></div>` : "";
    // between two numbers (software-called games): a big countdown 9, 8, 7 ... 1; silent
    const nr = S["next" + S.round], left = !paused && !hostWait && cfg.callMode !== "host" && S.off !== undefined && nr !== null && nr !== undefined && Number.isFinite(nr) && log.length < 90 ? Math.max(0, Math.ceil((ZG.roundTimeMs(nr) - (performance.now() + S.off)) / 1000)) : null;
    const cdown = left !== null && left <= Math.max(3, info.callSeconds) ? `<div class="cdown" role="timer" aria-label="Next number in ${left} seconds"><div class="cdnum">${left}</div><div class="cdlbl">seconds to the next number</div></div>` : "";
    $app.innerHTML = `${head}${storyBar}${banner}<div class="main"><div class="now"><div class="lbl">Number</div><div class="num ${fresh ? "fresh" : ""}">${last}</div><div class="calledbig" id="calledbig">${esc(ZG.calledLine(log.length))}</div>${log.length > 1 ? `<div class="lastfew" id="lastfew">Last 5 numbers called: ${log.slice(-6, -1).reverse().map((n) => `<i>${n}</i>`).join("")}</div>` : ""}${cdown}${cfg.callMode === "host" && !paused && !hostWait && log.length > 0 && log.length < 90 ? `<p class="wait" id="hostcalls">The host calls the numbers</p>` : ""}${hostWait && log.length < 90 ? `<p class="wait" id="hostwait">Waiting for the host</p>` : ""}</div>${prizes}</div><div>${wins ? `<div class="wins">${wins}</div>` : ""}<div class="foot">Join: ${esc(location.host)}/z?e=${esc(EID)}</div></div>`;
  }

  if (!EID) { $app.innerHTML = `<p class="msg">No engagement was chosen.</p>`; return; }
  window.__big = S; // read by the tests (nothing personal is in it)
  // keep the projector's screen on while this page is in front (where the browser can): a blank screen in front of a room is a visible failure
  let wl = null;
  const keepAwake = async () => { try { if (wl || !navigator.wakeLock || document.visibilityState === "hidden") return; wl = await navigator.wakeLock.request("screen"); wl.addEventListener("release", () => { wl = null; }); } catch { wl = null; } };
  keepAwake(); document.addEventListener("visibilitychange", keepAwake); setInterval(keepAwake, 30000);
  const loop = async () => { await tick(); draw(); };
  loop(); setInterval(loop, 3000);
  setInterval(() => { if (S.info) draw(); }, 1000); // the countdowns tick every second (before the first number, and between two numbers)
  // ---- the claim signal: a few digits asked every ~2 s while this screen is in front; when it moves, the new claims (ticket numbers only) are shown as calm pop-ups
  const CN = { early5: "Early Five", top: "Top line", mid: "Middle line", bot: "Bottom line", corners: "Four corners", star: "Star", full: "Full house" };
  const toastNote = (text) => { let box = document.getElementById("claimtoasts"); if (!box) { box = document.createElement("div"); box.id = "claimtoasts"; box.setAttribute("role", "status"); box.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:2vh;z-index:50;display:grid;gap:8px;width:min(80vw,900px);pointer-events:none"; document.body.appendChild(box); } const d = document.createElement("div"); d.style.cssText = "background:#14233f;color:#fff;border-radius:14px;padding:14px 20px;font-size:2.2vmin;box-shadow:0 8px 20px -10px rgba(0,0,0,.6)"; d.textContent = text; box.appendChild(d); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => d.remove(), 7000); };
  const BC = { cv: -1, upto: 0, init: false, busy: false };
  const claimsSince = async () => { try { const r = await fetch(`/api/z/${EID}/seats?after=999999999&cafter=${BC.upto}`, { cache: "no-store" }); if (!r.ok) return; const j = await r.json(); for (const c of j.claims || []) { if (Number(c.atMs) > BC.upto) { BC.upto = Number(c.atMs); if (BC.init) { const t = /^(\d+)x/.exec(String(c.pid)); toastNote(c.bogey ? `Ticket ${t ? t[1] : "?"}'s claim was not correct. The game continues.` : `Ticket ${t ? t[1] : "?"} has claimed ${CN[c.pattern] || c.pattern}. Checking now\u2026`); } } } BC.init = true; } catch { /* the next signal tries again */ } };
  claimsSince();
  const beat = async () => { if (document.hidden || BC.busy) return; BC.busy = true; try { const r = await fetch(`/api/z/${EID}/cv`, { cache: "no-store" }); const n = Number((await r.text()).trim()); if (Number.isFinite(n)) { if (BC.cv >= 0 && n > BC.cv) await claimsSince(); BC.cv = n; } } catch { /* try again */ } BC.busy = false; };
  setInterval(beat, 2000 + Math.floor(Math.random() * 500));
})();
