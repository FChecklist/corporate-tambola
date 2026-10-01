/* Big screen (read-only). Shows only what the server broadcasts to the screen connection. No personal data is added here. */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const now = () => Date.now();

  // ---- link: /screen/CODE#KEY ----
  const code = decodeURIComponent(location.pathname.split("/").filter(Boolean)[1] || "");
  const key = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (!code || !key) { $("bad").classList.remove("hidden"); return; }

  // ---- state ----
  const S = {
    name: "", orgName: "", status: "open", liveAt: null, callNo: 0, current: null, paused: null, round: 1, rounds: 1,
    still: null, rewards: [], mom: null, brk: null, results: null, splash: null, feed: "", speak: false, ever: false,
  };
  let speakOn = false;

  const STATUS = { open: ["Waiting", "wait"], starting: ["Starting", "wait"], started: ["Live", "live"], ended: ["Ended", "end"], purged: ["Ended", "end"] };
  const setTxt = (el, t) => { if (el.textContent !== t) el.textContent = t; };
  const show = (el, on) => el.classList.toggle("hidden", !on);
  const announce = (t) => { const l = $("live"); l.textContent = ""; setTimeout(() => (l.textContent = t), 30); };

  // ---- rendering ----
  function over() { return S.status === "ended" || S.status === "purged"; }

  function render() {
    setTxt($("org"), S.orgName || "");
    setTxt($("eng"), S.name || "Corporate Tambola");
    if (S.name) document.title = S.name + " - Big screen";

    // round chip
    const rc = $("roundChip");
    if (S.rounds > 1) { rc.textContent = `Round ${S.round} of ${S.rounds}`; show(rc, true); } else show(rc, false);

    // status chip
    let [label, cls] = STATUS[S.status] || ["Waiting", "wait"];
    if (S.status === "started" && S.paused) { label = "Paused"; cls = "pause"; }
    $("statusChip").className = "chip-s st-" + cls;
    setTxt($("statusTxt"), label);

    // centre: ball / message
    const msg = $("msg"), ball = $("ball");
    const started = S.status === "started" || over();
    let m = "";
    if (!started) {
      if (S.status === "starting" && S.liveAt) m = `<div>Starting in</div><div class="cd" id="cd">${Math.max(0, Math.ceil((S.liveAt - now()) / 1000))} s</div>`;
      else m = `<div>The engagement starts soon</div><small>Please keep your phone ready</small>`;
    }
    $("centre").classList.toggle("msgmode", !!m);
    show(msg, !!m);
    if (m && msg.dataset.k !== m) { msg.innerHTML = m; msg.dataset.k = m; } else if (!m) msg.dataset.k = "";
    const has = S.current != null;
    ball.classList.toggle("empty", !has);
    setTxt($("ballNo"), has ? String(S.current) : "--");
    setTxt($("ballLbl"), has ? `Number ${S.current}` : (started && !over() ? "First number coming up" : ""));
    const total = 90;
    setTxt($("callCnt"), S.callNo ? `Call ${S.callNo} of ${total}` : "");
    setTxt($("miniNo"), has ? String(S.current) : "--");

    renderStill();
    renderBoard();
    renderFeed();
    renderOverlays();
  }

  function renderStill() {
    const st = S.still, box = $("still");
    if (!st) { show(box, false); return; }
    show(box, true);
    const set = (id, v) => { const el = $(id); if (el.textContent !== String(v)) { el.textContent = v; if (el.dataset.seen != null && !reduce()) { el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); } } el.dataset.seen = "1"; };
    set("stP", st.prizes); set("stL", st.lucky); set("stS", st.scratch);
    const next = $("next");
    const nt = st.next && !over() ? "Next surprise: " + st.next : "";
    show(next, !!nt); setTxt(next, nt);
    const zero = !st.prizes && !st.lucky && !st.scratch;
    show($("allWon"), zero);
    box.querySelector(".stillRow").classList.toggle("hidden", zero);
  }

  function renderBoard() {
    const rw = S.rewards || [], el = $("board");
    if (!rw.length) { el.innerHTML = ""; return; }
    const chip = (r) => {
      const w = r.winners || [];
      if (!w.length) return `<div class="rw"><b>${esc(r.name)}</b><span>${esc(r.text || "")}</span></div>`;
      const shown = w.slice(0, 2).map(esc).join(" . ") + (w.length > 2 ? ` +${w.length - 2}` : "");
      return `<div class="rw swon"><b>${esc(r.name)}</b><span class="tk">${shown}</span></div>`;
    };
    let html;
    if (rw.length > 10) {
      const open = rw.filter((r) => !(r.winners || []).length), won = rw.length - open.length;
      html = open.slice(0, 9).map(chip).join("") + (open.length > 9 ? `<div class="rw more">+${open.length - 9} more</div>` : "") + (won ? `<div class="rw more">${won} awarded</div>` : "");
    } else html = rw.map(chip).join("");
    if (el.dataset.k !== html) { el.innerHTML = html; el.dataset.k = html; }
  }

  function renderFeed() {
    const f = $("feed");
    show(f, !!S.feed); setTxt(f, S.feed || "");
  }

  function renderOverlays() {
    const t = now();
    let which = null;
    if (over()) which = "end";
    else if (S.brk && t < S.brk.endAt) which = "brk";
    else if (S.mom) which = S.mom.kind === "lucky" ? "lucky" : "scratch";
    else if (S.results && t < S.results.until) which = "result";
    else if (S.splash && t < S.splash.until) which = "splash";
    else if (S.paused === "intermission") which = "inter";
    else if (S.paused === "claim") which = "claim";
    const map = { end: "ovEnd", brk: "ovBreak", lucky: "ovLucky", scratch: "ovScratch", result: "ovResult", splash: "ovSplash", inter: "ovInter", claim: "ovClaim" };
    for (const k in map) show($(map[k]), k === which);
    if (which !== "brk") clearBreakMedia();
    if (which === "end") setTxt($("endSub"), S.name ? S.name : "");
    if (which === "inter") {
      setTxt($("interRound"), S.rounds > 1 ? `Round ${Math.min(S.round + (S.round < S.rounds ? 1 : 0), S.rounds)} of ${S.rounds}` : "");
      setTxt($("interTitle"), S.rounds > 1 ? `Round ${Math.min(S.round + 1, S.rounds)} starts soon` : "Back in a moment");
    }
    if (which === "brk") buildBreak();
    if (which === "result") buildResults();
    if (which === "splash") setTxt($("splashTxt"), S.splash.text);
    if (which === "lucky") buildLucky();
    if (which === "scratch") buildScratch();
    // keep the reel animating only while shown
    if (which === "lucky" && !reelTimer) startReel(); else if (which !== "lucky" && reelTimer) stopReel();
    document.body.dataset.ov = which || "";
  }

  // ---- results ----
  function buildResults() {
    const r = S.results, el = $("resList");
    if (el.dataset.k === String(r.id)) return;
    el.dataset.k = String(r.id);
    const items = r.items || [];
    const rows = items.slice(0, 6).map((i) => {
      if (!i.ok) return `<div class="sres no">Not valid</div>`;
      return `<div class="sres ok"><b>${esc(i.reward)}</b><span class="tk">${esc(i.ticketId)}</span>${i.fun ? "<small>valid, family plays for fun</small>" : ""}</div>`;
    });
    if (items.length > 6) rows.push(`<div class="sres no">+${items.length - 6} more</div>`);
    el.innerHTML = rows.join("") || `<div class="sres no">Not valid</div>`;
  }

  // ---- break ----
  function ytId(u) {
    try {
      const x = new URL(u);
      if (x.protocol !== "https:") return null;
      const h = x.hostname.replace(/^www\.|^m\./, "");
      if (h === "youtu.be") return x.pathname.slice(1).split("/")[0] || null;
      if (h === "youtube.com" || h === "youtube-nocookie.com") {
        if (x.searchParams.get("v")) return x.searchParams.get("v");
        const m = x.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/);
        return m ? m[1] : null;
      }
    } catch {}
    return null;
  }
  function clearBreakMedia() { const m = $("brkMedia"); if (m.dataset.k) { m.innerHTML = ""; m.dataset.k = ""; m.className = "brkMedia"; } }
  function buildBreak() {
    const b = S.brk, m = $("brkMedia");
    setTxt($("brkTitle"), b.title || "Break");
    if (m.dataset.k === b.id) return;
    $("brkTitle").classList.add("hidden");
    m.dataset.k = b.id; m.className = "brkMedia"; m.innerHTML = "";
    const id = b.kind === "youtube" && b.mediaUrl ? ytId(b.mediaUrl) : null;
    if (id && /^[\w-]{6,20}$/.test(id)) {
      const f = document.createElement("iframe");
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&rel=0&playsinline=1&modestbranding=1`;
      $("brkTitle").classList.remove("hidden");
      f.allow = "autoplay; encrypted-media; picture-in-picture"; f.title = b.title || "Brand break"; f.referrerPolicy = "strict-origin-when-cross-origin";
      m.appendChild(f);
    } else if (b.kind === "file" && /^https:\/\//i.test(b.mediaUrl || "")) {
      const v = document.createElement("video");
      v.src = b.mediaUrl; v.muted = true; v.autoplay = true; v.playsInline = true; v.setAttribute("aria-label", b.title || "Brand break");
      v.addEventListener("error", () => { m.innerHTML = ""; m.className = "brkMedia card"; m.textContent = b.title || "Break"; });
      $("brkTitle").classList.remove("hidden");
      m.appendChild(v); v.play && v.play().catch(() => {});
    } else { m.className = "brkMedia card"; m.textContent = b.title || "Break"; }
  }

  // ---- lucky draw ----
  let reelTimer = null;
  const AL = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const fake = () => { let s = "TMB-"; for (let i = 0; i < 4; i++) s += AL[Math.floor(Math.random() * AL.length)]; return s + "-" + String(Math.floor(Math.random() * 1000)).padStart(6, "0"); };
  function startReel() { if (reduce()) { setTxt($("lkReel"), "TMB-XXXX-000000"); return; } reelTimer = setInterval(() => { if (!S.mom || S.mom.result) return; setTxt($("lkReel"), fake()); }, 70); reelTimer = reelTimer; }
  function stopReel() { clearInterval(reelTimer); reelTimer = null; }
  const PRIZE = { booster: "a Booster", gift: "a Gift", reward: "a Reward", cash: "a Reward" };
  function prizeText(p) { if (!p) return "A surprise Reward"; return PRIZE[p] ? "Prize: " + PRIZE[p].replace(/^a /, "") : String(p); }

  function buildLucky() {
    const m = S.mom, k = "L" + m.id + (m.result ? "r" : "");
    show($("lkBump"), !!m.bumper);
    setTxt($("lkPrize"), `${m.winners} ${m.winners === 1 ? "winner" : "winners"} . ${prizeText(m.prize)}`);
    const rl = $("lkReel"), win = $("lkWin");
    rl.classList.toggle("stopped", !!m.result);
    if (!m.result) { show(win, false); win.innerHTML = ""; win.dataset.n = "0"; show(rl, true); }
    else {
      setTxt($("lkCount"), "");
      show(rl, false); show(win, true);
      const n = Math.min(m.shown || 0, m.result.winners.length);
      if (win.dataset.n !== String(n) || win.dataset.k !== k) {
        win.dataset.n = String(n); win.dataset.k = k;
        win.innerHTML = m.result.winners.length ? m.result.winners.slice(0, n).map((w) => `<div class="win">${esc(w)}</div>`).join("") : `<div class="win">Nobody was present this time</div>`;
      }
    }
  }
  function buildScratch() {
    const m = S.mom;
    if (!m.result) {
      $("scBody").innerHTML = `<b>${esc(m.winners)}</b> winning ${m.winners === 1 ? "card" : "cards"}<br>Scratch yours now`;
    } else {
      const n = m.result.winningCards != null ? m.result.winningCards : m.winners;
      $("scBody").innerHTML = `<b>${esc(n)}</b> winning ${n === 1 ? "card" : "cards"} this round`;
      setTxt($("scCount"), "");
    }
  }

  // ---- ticking: countdowns + expiries ----
  function tick() {
    const t = now();
    if (S.status === "starting" && S.liveAt && !S.current) {
      const cd = $("cd"); if (cd) setTxt(cd, Math.max(0, Math.ceil((S.liveAt - t) / 1000)) + " s");
    }
    if (S.brk) {
      const left = Math.max(0, Math.ceil((S.brk.endAt - t) / 1000));
      setTxt($("brkCount"), left ? left + " s" : "");
      if (t >= S.brk.endAt) { S.brk = null; render(); return; }
    }
    const m = S.mom;
    if (m) {
      if (!m.result) {
        const left = Math.max(0, Math.ceil((m.endAt - t) / 1000));
        const txt = left ? String(left) : "";
        if (m.kind === "lucky") { $("lkCount").innerHTML = left ? `${left}<small>seconds</small>` : `<small>Drawing...</small>`; }
        else $("scCount").innerHTML = left ? `${left}<small>seconds left</small>` : "";
      } else {
        if (m.kind === "lucky") {
          const total = m.result.winners.length, due = reduce() ? total : Math.min(total, Math.floor((t - m.result.at) / 1100) + 1);
          if (due !== (m.shown || 0)) { m.shown = due; buildLucky(); }
          const end = m.result.at + (reduce() ? 0 : Math.max(0, total - 1) * 1100) + 8000;
          if (t >= end) { S.mom = null; render(); return; }
        } else if (t >= m.result.at + 8000) { S.mom = null; render(); return; }
      }
    }
    if (S.results && t >= S.results.until) { S.results = null; render(); return; }
    if (S.splash && t >= S.splash.until) { S.splash = null; render(); return; }
  }
  setInterval(tick, 200);

  // ---- websocket (own tiny reconnecting socket) ----
  let ws = null, tries = 0, resyncing = false, resyncTimer = null, retryTimer = null;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  function setConn(ok) {
    const c = $("conn"); c.classList.toggle("off", !ok);
    setTxt($("connTxt"), ok ? "" : "Reconnecting...");
    c.title = ok ? "Connected" : "Reconnecting";
  }
  function connect() {
    clearTimeout(retryTimer);
    try { ws = new WebSocket(`${proto}://${location.host}/ws?e=${encodeURIComponent(code)}&s=${encodeURIComponent(key)}`); } catch { return schedule(); }
    const mine = ws;
    ws.onopen = () => { if (mine !== ws) return; tries = 0; S.ever = true; resyncing = false; setConn(true); };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMsg(m); };
    ws.onclose = () => { if (mine !== ws) return; if (resyncing) { connect(); return; } setConn(false); schedule(); };
    ws.onerror = () => {};
  }
  function schedule() {
    tries++;
    if (!S.ever && tries >= 4) { $("bad").querySelector("h2").textContent = "This screen link is not valid"; $("bad").querySelector("p").textContent = "Open the big-screen link again from the organizer console. It may have been changed."; show($("bad"), true); }
    retryTimer = setTimeout(connect, Math.min(10000, 1000 * Math.pow(1.7, tries - 1)));
  }
  // The server sends the full state once per connection and has no 'still' event, so after something changes the strip we quietly reconnect to read it again.
  function resync(delay) {
    clearTimeout(resyncTimer);
    resyncTimer = setTimeout(() => { if (ws && ws.readyState === 1) { resyncing = true; try { ws.close(); } catch {} } }, delay == null ? 700 : delay);
  }

  // ---- messages ----
  function onMsg(m) {
    const t = now();
    switch (m.type) {
      case "state": {
        S.name = m.name || S.name; S.orgName = m.orgName || S.orgName;
        S.status = m.status; S.liveAt = m.status === "starting" && m.liveIn != null ? t + m.liveIn : null;
        S.callNo = m.callNo || 0; S.current = m.current != null ? m.current : null; S.paused = m.paused || null;
        S.round = m.round || 1; S.rounds = m.rounds || 1; S.still = m.still || null; S.rewards = m.rewards || [];
        const am = m.moment;
        if (am) { if (!S.mom || S.mom.id !== am.id) S.mom = { id: am.id, kind: am.kind, winners: am.winners, bumper: am.bumper, prize: am.prize, endAt: t + (am.leftMs || 0), result: null, shown: 0 }; }
        else if (S.mom && !S.mom.result) S.mom = null;
        if (m.paused !== "break" && S.brk && !resyncing && t - (S.brk.startAt || 0) > 1500) S.brk = null;
        render(); break;
      }
      case "starting": S.status = "starting"; S.liveAt = t + (m.inMs || 0); S.feed = ""; render(); break;
      case "live": S.status = "started"; S.liveAt = null; S.paused = null; announce("The engagement is live"); render(); break;
      case "call":
        S.status = "started"; S.callNo = m.callNo; S.current = m.number; S.paused = S.paused === "claim" || S.paused === "result" ? S.paused : null;
        render();
        { const b = $("ball"); if (!reduce()) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); } }
        announce(`Number ${m.number}. Call ${m.callNo} of 90.`);
        if (speakOn && window.TBAudio) { try { TBAudio.play(m.number); } catch {} }
        break;
      case "pause":
        S.paused = m.kind;
        if (m.kind === "emergency") S.feed = "Paused" + (m.reason ? ": " + m.reason : "");
        else if (m.kind === "claim" && S.mom) { /* moment takes the stage */ }
        render(); break;
      case "resume": S.paused = null; S.brk = null; render(); resync(300); break;
      case "result": {
        const items = m.items || [];
        S.results = { id: t, items, until: t + 5000 };
        const okItems = items.filter((i) => i.ok);
        if (okItems.length) { const i = okItems[0]; S.feed = `Reward awarded: ${i.reward} . ${i.ticketId}` + (okItems.length > 1 ? ` (+${okItems.length - 1})` : ""); }
        else S.feed = "Not valid claim";
        let newly = 0;
        for (const i of items) {
          if (!i.ok || i.fun) continue;
          const r = S.rewards.find((x) => x.name === i.reward);
          if (r) { if (!r.winners.length) newly++; if (!r.winners.includes(i.ticketId)) r.winners.push(i.ticketId); }
        }
        if (S.still && newly) S.still.prizes = Math.max(0, S.still.prizes - newly);
        announce(okItems.length ? `Reward awarded: ${okItems.map((i) => i.reward).join(", ")}` : "Not valid claim");
        render(); resync(900); break;
      }
      case "break": {
        const secs = Math.max(1, +m.seconds || 10);
        S.brk = { id: String(t), title: m.title || "Break", kind: m.kind, mediaUrl: m.mediaUrl || "", endAt: t + secs * 1000, startAt: t };
        S.paused = "break"; S.feed = "Brand break: " + (m.title || "");
        announce("Brand break: " + (m.title || "")); render(); break;
      }
      case "moment_start":
        S.mom = { id: m.id, kind: m.kind, winners: m.winners, bumper: m.bumper, prize: m.prize, endAt: t + (+m.seconds || 0) * 1000, result: null, shown: 0 };
        S.feed = m.kind === "lucky" ? "Lucky draw" + (m.bumper ? " (bumper)" : "") : "Scratch cards";
        announce(m.kind === "lucky" ? "Lucky draw" : "Everyone has a scratch card");
        render(); break;
      case "moment_result": {
        if (!S.mom || S.mom.id !== m.id) S.mom = { id: m.id, kind: m.kind, winners: (m.winners || []).length, bumper: m.bumper, prize: "", endAt: t, shown: 0 };
        S.mom.result = { winners: m.winners || [], winningCards: m.winningCards, at: t };
        S.mom.shown = reduce() ? S.mom.result.winners.length : Math.min(1, S.mom.result.winners.length);
        if (S.still) { if (m.kind === "lucky") S.still.lucky = Math.max(0, S.still.lucky - 1); else S.still.scratch = Math.max(0, S.still.scratch - 1); }
        announce(m.kind === "lucky" ? (S.mom.result.winners.length ? "Lucky draw winners are on screen" : "Nobody was present this time") : `${m.winningCards != null ? m.winningCards : ""} winning cards this round`);
        render(); resync(1200); break;
      }
      case "round_start": S.round = m.round; S.rounds = m.of; S.paused = null; S.splash = { text: `Round ${m.round} of ${m.of}`, until: t + 3500 }; announce(`Round ${m.round} of ${m.of}`); render(); resync(500); break;
      case "round_end": S.feed = `Round ${m.round} of ${m.of} complete`; if (m.round < m.of) S.paused = "intermission"; render(); resync(500); break;
      case "ended": S.status = "ended"; render(); resync(600); break;
      case "purged": S.status = "purged"; render(); break;
      default: break;
    }
  }

  // ---- controls ----
  function fullscreen() {
    const d = document;
    if (d.fullscreenElement) d.exitFullscreen && d.exitFullscreen();
    else (d.documentElement.requestFullscreen || (() => Promise.resolve())).call(d.documentElement).catch(() => {});
  }
  function toggleSpeak() {
    speakOn = !speakOn;
    const b = $("spkBtn");
    b.setAttribute("aria-pressed", String(speakOn)); b.setAttribute("aria-label", "Speak numbers: " + (speakOn ? "on" : "off"));
    b.innerHTML = speakOn ? "&#x1F50A;" : "&#x1F507;";
    if (speakOn && window.TBAudio) { try { TBAudio.unlock(); } catch {} }
  }
  $("fsBtn").addEventListener("click", fullscreen);
  $("spkBtn").addEventListener("click", toggleSpeak);
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "f" || e.key === "F") fullscreen();
    else if (e.key === "s" || e.key === "S") toggleSpeak();
  });
  // hide the mouse pointer on the projector after a few seconds idle
  let idle; const wake = () => { document.body.style.cursor = ""; clearTimeout(idle); idle = setTimeout(() => (document.body.style.cursor = "none"), 4000); };
  document.addEventListener("mousemove", wake); wake();

  render();
  connect();
})();
