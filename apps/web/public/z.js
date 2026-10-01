/* Corporate Tambola, phone page for zero-server engagements. All game logic lives in zgame.js (window.ZG); this file only draws it. */
(function () {
  const ZG = window.ZG;
  const $app = document.getElementById("app");
  const q = new URLSearchParams(location.search);
  const EID = (q.get("e") || location.hash.replace(/^#/, "") || "").trim();
  const BASE = (q.get("api") || "").replace(/\/$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const api = async (method, path, body) => {
    let r;
    try { r = await fetch(BASE + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new Error("offline"); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "http " + r.status), { status: r.status });
    return j;
  };
  const NAMES = { early5: "Early Five", top: "Top line", mid: "Middle line", bot: "Bottom line", corners: "Four corners", star: "Star", full: "Full house" };
  const getPublic = async (url) => { let r; try { r = await fetch(url, { cache: "no-store" }); } catch { throw new Error("offline"); } if (!r.ok) throw Object.assign(new Error("http " + r.status), { status: r.status }); return r.json(); };
  const rt = new ZG.PhoneRuntime(EID, { api, getPublic, beacon: {}, mono: () => performance.now(), store });
  let lastLen = 0, firstPaint = true, sound = store.get("ctz-sound") !== "off", timer = null;
  if (window.TBAudio) TBAudio.enabled = sound;
  const fmt = (s) => (s >= 90 ? Math.round(s / 60) + " min" : s + "s");

  const joinView = (msg) => `<div class="zhead"><b>Corporate Tambola</b></div>
    <div class="zcard zform"><h2>Join the engagement</h2>
    <label for="ph">Your mobile number</label><input id="ph" inputmode="tel" autocomplete="tel" placeholder="98765 43210">
    <label for="nm">Your name (shown only to the organizer)</label><input id="nm" autocomplete="name" maxlength="60">
    ${msg ? `<div class="zbanner bad" role="alert">${esc(msg)}</div>` : ""}
    <button class="zbtn" id="go">Get my ticket</button>
    <p class="zsmall">Your number is used only to give you the same ticket if you come back. Nobody else sees it.</p></div>`;

  const ticketHtml = (t, called, label) => `<div class="zticket" aria-label="${label}">${t.flat().map((v) => v === null ? `<div class="e"></div>` : `<div class="${called.has(v) ? "m" : ""}">${v}</div>`).join("")}</div>`;
  const ordinalName = (k) => ["", "1st", "2nd", "3rd"][k] || k + "th";
  const KEYNAME = (key) => (key === "full2" ? "Full Two-Ticket House" : NAMES[key]);

  function roundCards(v) {
    let out = "";
    if (v.intermission) out += `<div class="zcard zbreak" role="status"><h2>Round ${v.round} is over</h2><div style="font:700 20px var(--sans,inherit);margin:2px 0 4px">Round ${v.intermission.round} of ${v.rounds} starts in ${v.intermission.secondsLeft}s</div><div class="zsmall" style="margin:0">Everyone gets new tickets and a fresh set of numbers.</div></div>`;
    const earlier = (v.past || []).filter((p) => p.got.length);
    if (earlier.length) out += `<div class="zcard"><h2>Earlier rounds</h2>${earlier.map((p) => `<div class="zrow"><span>Round ${p.round}</span><em>${p.got.map((g) => esc((g.ordinal > 1 ? ordinalName(g.ordinal) + " " : "") + KEYNAME(g.pattern))).join(", ")}</em></div>`).join("")}</div>`;
    return out;
  }
  function luckyCard(v) {
    if (!v.lucky.length) return "";
    const rows = v.lucky.map((l) => `<div class="zrow"><span>${esc(l.title)}<br><small class="zsmall" style="margin:0">${l.winners} ${l.winners === 1 ? "person is" : "people are"} picked at random</small></span>${l.published ? (l.won ? `<em>You won!</em>` : `<i>Not this time</i>`) : `<i>at the end of the break</i>`}</div>`).join("");
    return `<div class="zcard"><h2>Lucky draw</h2>${rows}</div>`;
  }
  function breakCard(b) {
    const act = b.mediaUrl ? `<a class="zbtn s" style="display:inline-flex;align-items:center;text-decoration:none;margin-top:10px" target="_blank" rel="noopener noreferrer" href="${esc(b.mediaUrl)}">${b.kind === "youtube" ? "Watch the video" : "Open"}</a>` : "";
    const what = b.kind === "lucky" ? `${b.winners || 3} ${b.winners === 1 ? "person is" : "people are"} picked at random when this break ends. Everyone has an equal chance.` : b.kind === "speech" ? "Please listen to the host." : b.kind === "slides" ? "Please look at the screen." : "";
    return `<div class="zcard zbreak" role="status"><h2>A short break</h2><div style="font:700 20px var(--sans,inherit);margin:2px 0 4px">${esc(b.title)}</div><div class="zsmall" style="margin:0">${what} The numbers continue in ${b.secondsLeft}s.</div>${act}</div>`;
  }

  function stillToWinRows(v) {
    const keys = ZG.keysInPlay(v.cfg.rewards);
    return keys.map((key) => {
      const lines = ZG.linesFor(v.cfg.rewards, key);
      const n = ZG.stillToWin(v.tickets, key, v.log);
      const mine = v.myIdx[key];
      return lines.map((line) => {
        const total = lines.length;
        const name = (total > 1 ? ordinalName(line.ordinal) + " " : "") + KEYNAME(key);
        const res = v.results.find((r) => r.pattern === key && r.ordinal === line.ordinal);
        let right;
        if (res) right = mine === res.idx ? `<em>Yours${res.count > 1 ? " · shared by " + res.count : ""}</em>` : `<i>Awarded${res.count > 1 ? " to " + res.count : ""}</i>`;
        else if (line.ordinal === 1) right = mine >= 0 ? `<em>Complete</em>` : `<i>${n} to go</i>`;
        else right = `<i>after the ${ordinalName(line.ordinal - 1)}</i>`;
        return `<div class="zrow"><span>${esc(name)}${line.text ? `<br><small class="zsmall" style="margin:0">${esc(line.text)}</small>` : ""}</span>${right}</div>`;
      }).join("");
    }).join("");
  }

  function playView(v) {
    const called = new Set(v.log);
    const last = v.log[v.log.length - 1];
    const banners = [];
    if (v.error) banners.push(`<div class="zbanner warn" role="alert">${esc(v.error)}</div>`);
    if (v.locked) banners.push(`<div class="zbanner warn"><b>Waiting for the organizer.</b> This engagement cannot begin until the organizer finishes setting it up. Your ticket is safe. Keep this page open: it begins as soon as they are done.</div>`);
    else if (v.stopped) banners.push(`<div class="zbanner info">The organizer has ended this engagement.</div>`);
    else if (v.paused) banners.push(`<div class="zbanner info">Paused by the organizer. It will carry on shortly.</div>`);
    else if (v.mode === "hold") banners.push(`<div class="zbanner warn">Checking with the organizer… numbers will continue in a moment.</div>`);
    else if (v.mode === "blind") banners.push(`<div class="zbanner warn">Cannot reach the organizer's controls right now. Play continues; a pause may appear late.</div>`);
    if (v.phase === "ended" && !v.stopped) banners.push(`<div class="zbanner ok">${v.rounds > 1 ? "All " + v.rounds + " rounds are finished." : "All 90 numbers have been called."} Thank you for taking part.</div>`);
    const sub = v.phase === "ended" || v.locked || v.brk || v.intermission ? "" : v.log.length === 0 ? (v.nextCallInSec !== null ? "First number in " + fmt(v.nextCallInSec) : "Getting ready…") : v.paused || v.mode === "hold" ? "" : v.nextCallInSec !== null ? "Next number in " + v.nextCallInSec + "s" : "";
    const still = v.tickets.length ? stillToWinRows(v) : "";
    const chk = v.pendingChecks > 0 ? `<p class="zsmall">Double-checking ${v.pendingChecks} earlier number${v.pendingChecks === 1 ? "" : "s"} in the background.</p>` : "";
    const tix = v.tickets.map((t, i) => (v.tickets.length > 1 ? `<div class="zsmall" style="margin:${i ? 12 : 0}px 0 4px"><b>Ticket ${"AB"[i]}</b></div>` : "") + ticketHtml(t, called, v.tickets.length > 1 ? "Ticket " + "AB"[i] : "Your ticket")).join("");
    return `<div class="zhead"><b>Corporate Tambola</b><button class="zsnd" id="snd" aria-pressed="${sound}">${sound ? "Sound on" : "Sound off"}</button></div>
      ${banners.join("")}
      ${roundCards(v)}
      ${v.brk ? breakCard(v.brk) : ""}
      <div class="zcard"><div class="zball"><div class="zbig ${last ? "" : "none"}" id="big" aria-live="assertive" aria-label="${last ? "Number " + last : "No number yet"}">${last ?? "–"}</div></div>
        <div class="zsub">${sub}</div>
        <div class="zlast" aria-label="Recent numbers">${v.log.slice(-7, -1).reverse().map((n) => `<span>${n}</span>`).join("")}</div></div>
      <div class="zcard"><h2>${v.tickets.length > 1 ? "Your tickets" : "Your ticket"}</h2>${tix}<a class="zref" href="/partner.html?from=ticket">Refer &amp; earn</a></div>
      <div class="zcard"><h2>Still to win</h2>${still}${chk}</div>
      ${luckyCard(v)}
      <div class="zcard"><h2>${v.rounds > 1 ? "Round " + v.round + " of " + v.rounds + " · " : ""}All numbers · ${v.log.length} of 90 called</h2><div class="zboard">${Array.from({ length: 90 }, (_, i) => `<div class="${called.has(i + 1) ? "c" : ""}">${i + 1}</div>`).join("")}</div></div>`;
  }

  function paint() {
    const v = rt.view();
    if (v.phase === "missing" || v.phase === "boot") { $app.innerHTML = `<p class="zmsg">${esc(v.error || "Loading…")}</p>`; return; }
    if (v.phase === "join") { const f = document.getElementById("ph"); if (f && document.activeElement === f) return; $app.innerHTML = joinView(v.error); bindJoin(); return; }
    $app.innerHTML = playView(v);
    const s = document.getElementById("snd");
    if (s) s.onclick = async () => { sound = !sound; store.set("ctz-sound", sound ? "on" : "off"); if (window.TBAudio) { TBAudio.enabled = sound; if (sound) await TBAudio.unlock(); } paint(); };
    if (v.log.length > lastLen) { if (!firstPaint && v.log.length === lastLen + 1 && sound && window.TBAudio) TBAudio.play(v.log[v.log.length - 1]); lastLen = v.log.length; }
    firstPaint = false;
  }
  function bindJoin() {
    const go = document.getElementById("go");
    go.onclick = async () => {
      go.disabled = true;
      if (window.TBAudio) TBAudio.unlock();
      const typed = document.getElementById("ph").value;
      store.set("ctz-phone", typed.replace(/\D/g, "").slice(-10)); // kept on this phone only, so Refer & earn can fill it in for you
      const ok = await rt.join(typed, document.getElementById("nm").value.trim());
      if (ok) start(); else { go.disabled = false; paint(); }
    };
  }
  async function loop() { try { await rt.tick(); } catch { /* the loop must never die */ } paint(); }
  function start() { if (timer) return; loop(); timer = setInterval(loop, 1000); }

  if (!EID) { $app.innerHTML = `<p class="zmsg">This link is incomplete. Please ask your organizer for the engagement link.</p>`; return; }
  rt.boot().then(() => { paint(); if (rt.phase === "play") start(); });
  window.__rt = rt;
})();
