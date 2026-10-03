/* Corporate Tambola, phone page for zero-server engagements. All game logic lives in zgame.js (window.ZG); this file only draws it. */
(function () {
  const ZG = window.ZG;
  const $app = document.getElementById("app");
  const q = new URLSearchParams(location.search);
  const LAST = "ct-last-eid";
  let EID = (q.get("e") || location.hash.replace(/^#/, "") || "").trim();
  try { if (EID) localStorage.setItem(LAST, EID); else EID = localStorage.getItem(LAST) || ""; } catch {} // the installed app opens without the link: use the last game
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
  // A scratch card is the same fair draw as a lucky draw (the winners are fixed by the public numbers before anyone scratches); only the reveal differs.
  const scratched = new Set(), seenAt = {};
  function luckyCard(v) {
    if (!v.lucky.length) return "";
    const scr = v.lucky.some((l) => l.style === "scratch");
    const rows = v.lucky.map((l) => {
      let right;
      if (!l.published) right = `<i>at the end of the break</i>`;
      else if (l.style === "scratch") {
        seenAt[l.ordinal] = seenAt[l.ordinal] || Date.now();
        const open = scratched.has(l.ordinal) || Date.now() - seenAt[l.ordinal] > 45000; // it opens by itself after 45 seconds
        right = open ? (l.won ? `<em>You won!</em>` : `<i>Not this time</i>`) : `<button class="zscratch" data-scr="${l.ordinal}" aria-label="Scratch to reveal">Scratch here</button>`;
      } else right = l.won ? `<em>You won!</em>` : `<i>Not this time</i>`;
      return `<div class="zrow"><span>${esc(l.title)}<br><small class="zsmall" style="margin:0">${l.winners} ${l.winners === 1 ? "person is" : "people are"} picked at random${l.style === "scratch" ? " · scratch card" : ""}</small></span>${right}</div>`;
    }).join("");
    return `<div class="zcard"><h2>${scr ? "Scratch card" : "Lucky draw"}</h2>${rows}</div>`;
  }
  function icsFor(v) {
    const ms = (1692803367 + (v.startRound - 1) * 3) * 1000, f = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const text = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Corporate Tambola//EN", "BEGIN:VEVENT", "UID:" + EID + "@corporate-tambola", "DTSTAMP:" + f(Date.now()), "DTSTART:" + f(ms), "DTEND:" + f(ms + 45 * 60000), "SUMMARY:Corporate Tambola engagement", "DESCRIPTION:Open " + location.origin + "/z?e=" + EID + " a few minutes early.", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(text);
  }
  /** Before the first number: what to expect, what can be won, a sound check and a calendar entry. Everything here is known at boot, so it costs no extra requests. */
  function waitingRoom(v) {
    if (v.phase !== "play" || v.locked || v.log.length || v.nextCallInSec === null || v.nextCallInSec <= 0 || v.round > 1) return "";
    const ms = (1692803367 + (v.startRound - 1) * 3) * 1000;
    const when = new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const prizes = ZG.keysInPlay(v.cfg.rewards).map((key) => ZG.linesFor(v.cfg.rewards, key).map((line) => `<li>${esc((ZG.linesFor(v.cfg.rewards, key).length > 1 ? ordinalName(line.ordinal) + " " : "") + KEYNAME(key))}${line.text ? ": <b>" + esc(line.text) + "</b>" : ""}</li>`).join("")).join("");
    return `<div class="zcard zwait"><h2>You are in. See you at ${esc(when)}</h2>
      <div class="zcount" aria-live="off">${fmt(v.nextCallInSec)}</div><p class="zsmall" style="margin-top:0">until the first number. Keep this page open: the numbers appear on their own.</p>
      ${prizes ? `<h3>What you can win</h3><ul class="zlist">${prizes}</ul>` : ""}
      <h3>How it works</h3><ol class="zlist"><li>Your ticket is below. Numbers are called one by one and marked for you.</li><li>When a row or the whole ticket is complete you will see it. The software checks it, you do not need to shout.</li><li>The organizer hands over the rewards.</li></ol>
      <button class="zbtn s alt" id="soundtest">Check my sound</button><a class="zbtn s alt" id="addcal" download="engagement.ics" href="${icsFor(v)}">Add to my calendar</a></div>`;
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

  let annSeen = null, annSpoken = null;
  function annBanner(v) {
    const a = v.announcement;
    if (!a || a.id === annSeen) return "";
    return `<div class="zbanner info zann" role="alert"><b>Message from the organizer</b><br>${esc(a.text)} <button class="zsnd" id="annok">OK</button></div>`;
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
      ${annBanner(v)}${banners.join("")}
      ${waitingRoom(v)}
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
    const ok = document.getElementById("annok"); if (ok) ok.onclick = () => { annSeen = v.announcement.id; paint(); };
    if (v.announcement && v.announcement.id !== annSpoken) { annSpoken = v.announcement.id; if (sound && window.TBAudio) TBAudio.say(v.announcement.text); try { navigator.vibrate && navigator.vibrate(120); } catch {} }
    document.querySelectorAll("[data-scr]").forEach((b) => (b.onclick = () => { scratched.add(Number(b.dataset.scr)); paint(); }));
    const st = document.getElementById("soundtest"); if (st) st.onclick = async () => { if (window.TBAudio) { TBAudio.enabled = true; await TBAudio.unlock(); TBAudio.test(); } };
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
