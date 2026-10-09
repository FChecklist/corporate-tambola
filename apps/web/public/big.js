/* Corporate Tambola big screen: shows the engagement to a room on a projector or TV. No sign-in and no personal data: it only reads the public
   numbers (the same ones every phone uses) and the public count of winners. It never joins the engagement. */
(function () {
  const ZG = window.ZG;
  const $app = document.getElementById("app");
  const q = new URLSearchParams(location.search);
  const EID = (q.get("e") || "").trim();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const NAMES = { early5: "Early Five", top: "Top line", mid: "Middle line", bot: "Bottom line", corners: "Four corners", star: "Star", full: "Full house", full2: "Full Two-Ticket House", lucky: "Lucky draw" };
  (ZG.PRIZE_HOUSES || []).forEach((h) => { if (!NAMES[h.id]) NAMES[h.id] = h.label; }); // the newer houses come from the shared table
  const ORD = (k) => ["", "1st", "2nd", "3rd"][k] || k + "th";
  const S = { info: null, cf: null, store: new ZG.RoundStore({}), logs: {}, round: 1, now: null, st: null, results: [], err: "", lastNum: null };
  const j = async (url) => { const r = await fetch(url, { cache: "no-store" }); if (!r.ok) throw Object.assign(new Error("http " + r.status), { status: r.status }); return r.json(); };
  const hms = (s) => { s = Math.max(0, Math.round(s)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":"); };
  const mmss = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

  async function tick() {
    try {
      if (!S.info) S.info = await j(`/api/z/${EID}/info`);
      const cf0 = await fetch(`/api/z/${EID}/control`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => S.cf); S.cf = cf0 && cf0.pubKey ? cf0 : null; S.locked = !!(cf0 && cf0.locked); S.cancelled = !!(cf0 && cf0.cancelled); S.dns = !!(cf0 && cf0.didNotStart); S.ann = cf0 && cf0.ann && cf0.ann.text ? cf0.ann : null; // held for non-payment: nothing is shown
      const l = await ZG.fetchRound("latest"); if (l) { S.now = l.round; S.nowAt = Date.now(); }
      if (S.now === null) { S.err = "Waiting for the clock…"; return; }
      S.st = S.cf ? ZG.resolveControl(ZG.cfgOf(S.cf), S.cf.messages) : null;
      const cfg = { tickets: S.info.tickets, rewards: S.info.rewards, breaks: S.info.breaks, rounds: S.info.rounds || 1 };
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
    if (S.dns) return ($app.innerHTML = `<div class="top"><div class="brand">Corporate Tambola</div></div><div class="big"><h1>This game did not start</h1><p>This game did not start. Your details have been erased.</p></div><div class="foot">${esc(location.host)}/z?e=${esc(EID)}</div>`); // nobody paid; the time and 23 hours went by
    if (S.cancelled) return ($app.innerHTML = `<div class="top"><div class="brand">Corporate Tambola</div></div><div class="big"><h1>This game was cancelled</h1><p>This game was cancelled by the organizer.</p></div><div class="foot">${esc(location.host)}/z?e=${esc(EID)}</div>`);
    if (S.locked) return ($app.innerHTML = `<div class="top"><div class="brand">Corporate Tambola</div></div><div class="big"><h1>Waiting for the Organizer or Host</h1><p>Waiting for the Organizer or Host to start the game.</p></div><div class="foot">${esc(location.host)}/z?e=${esc(EID)}</div>`);
    const paused = S.st && S.now !== null && S.st.intervals.some((i) => S.now >= i.start && S.now < i.end);
    const annBar = S.ann ? `<div class="annbar" role="alert">${esc(S.ann.text)}</div>` : "";
    const head = `${annBar}<div class="top"><div class="brand">Corporate Tambola</div><div class="meta">${cfg.rounds > 1 ? "Round " + S.round + " of " + cfg.rounds + " · " : ""}${log.length} of 90 numbers called</div></div>`;
    const wins = (S.results || []).filter((r) => r.round === S.round || r.round === undefined).map((r) => `<span><b>${esc(ORD(r.ordinal || 1))} ${esc(NAMES[r.pattern] || r.pattern)}</b> · ${r.count} winner${r.count === 1 ? "" : "s"}</span>`).join("");
    if (!log.length) {
      const sec = secsToStart;
      return ($app.innerHTML = `${head}<div class="big">${sec !== null && sec > 120 ? `<p>The engagement starts in</p><div class="cd">${hms(sec - 120)}</div><p>Open the link on your phone and get your ticket.</p>` : sec !== null && sec > 0 ? `<h1>Your game is setting up</h1><p>We are waiting 2 minutes more for everyone to join.</p><div class="cd">${mmss(sec)}</div><p>Open the link on your phone and get your ticket.</p>` : `<h1>Get ready</h1><p>The first number is about to be called…</p>`}</div><div class="foot">${esc(location.host)}</div>`);
    }
    const last = log[log.length - 1];
    const fresh = S.lastNum !== null && S.lastNum !== last; S.lastNum = last;
    const called = new Set(log);
    const board = Array.from({ length: 90 }, (_, i) => i + 1).map((n) => `<div class="${n === last ? "l" : called.has(n) ? "c" : ""}">${n}</div>`).join("");
    const recent = log.slice(-6, -1).reverse().map((n) => `<span>${n}</span>`).join("");
    const banner = paused ? `<div class="big" style="margin-bottom:1vh"><h1>Paused</h1><p>The organizer has paused the engagement. It will resume shortly.</p></div>` : "";
    $app.innerHTML = `${head}${banner}<div class="main"><div class="now"><div class="lbl">Number</div><div class="num ${fresh ? "fresh" : ""}">${last}</div><div class="recent" aria-label="Recent numbers">${recent}</div></div><div class="board" aria-label="Numbers called so far">${board}</div></div><div>${wins ? `<div class="wins">${wins}</div>` : ""}<div class="foot">Join: ${esc(location.host)}/z?e=${esc(EID)}</div></div>`;
  }

  if (!EID) { $app.innerHTML = `<p class="msg">No engagement was chosen.</p>`; return; }
  const loop = async () => { await tick(); draw(); };
  loop(); setInterval(loop, 3000);
  setInterval(() => { if (S.info && !(S.logs[S.round] || []).length) draw(); }, 1000); // the countdown ticks every second
})();
