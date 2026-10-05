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
    if (!r.ok) throw Object.assign(new Error(j.error || "http " + r.status), { status: r.status, code: j.code });
    return j;
  };
  const INVITE_FROM = Number(q.get("from")) || 0, INVITE_CAT = q.get("c") || "";
  const NAMES = { early5: "Early Five", top: "Top line", mid: "Middle line", bot: "Bottom line", corners: "Four corners", star: "Star", full: "Full house" };
  const getPublic = async (url) => { let r; try { r = await fetch(url, { cache: "no-store" }); } catch { throw new Error("offline"); } if (!r.ok) throw Object.assign(new Error("http " + r.status), { status: r.status }); return r.json(); };
  const rt = new ZG.PhoneRuntime(EID, { api, getPublic, beacon: {}, mono: () => performance.now(), store });
  let lastLen = 0, firstPaint = true, sound = store.get("ctz-sound") !== "off", timer = null;
  if (window.TBAudio) TBAudio.enabled = sound;
  const clock = (s) => { s = Math.max(0, Math.round(s)); return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":"); }; // 00:12:34
  const GRACE_SECS = ZG.GRACE_ROUNDS * 3;
  const fmt = (s) => (s >= 90 ? Math.round(s / 60) + " min" : s + "s");

  const joinView = (msg) => `<div class="zhead"><b>Corporate Tambola</b></div>
    <div class="zcard zform"><h2>Join the engagement</h2>${INVITE_FROM ? `<div class="zbanner ok" style="margin:0 0 8px">You were invited by a colleague or family member. Join with your own mobile number to get your own ticket.</div>` : ""}
    <label for="ph">Your mobile number</label><input id="ph" inputmode="tel" autocomplete="tel" placeholder="98765 43210">
    <label for="nm">Your name (shown only to the organizer)</label><input id="nm" autocomplete="name" maxlength="60">
    ${msg ? `<div class="zbanner bad" role="alert">${esc(msg)}</div>` : ""}
    <button class="zbtn" id="go">Get my ticket</button>
    <p class="zsmall">We use your number for your ticket and, if you win, your prize. Your organizer sees it. Other players do not.</p>
    <p class="spriv"><a href="/legal.html#privacy" target="_blank" rel="noopener">Privacy Policy</a></p></div>`;

  const ticketHtml = (t, called, label, win) => `<div class="zticket" aria-label="${label}">${t.flat().map((v) => v === null ? `<div class="e"></div>` : `<div class="${called.has(v) ? "m" : ""}${win && win.has(v) && called.has(v) ? " w" : ""}">${v}</div>`).join("")}</div>`;
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
    const ms = (1692803367 + (v.scheduledRound - 1) * 3) * 1000, f = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const text = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Corporate Tambola//EN", "BEGIN:VEVENT", "UID:" + EID + "@corporate-tambola", "DTSTAMP:" + f(Date.now()), "DTSTART:" + f(ms), "DTEND:" + f(ms + 45 * 60000), "SUMMARY:Corporate Tambola engagement", "DESCRIPTION:Open " + location.origin + "/z?e=" + EID + " a few minutes early.", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(text);
  }
  /** Before the first number: what to expect, what can be won, a sound check and a calendar entry. Everything here is known at boot, so it costs no extra requests. */
  function waitingRoom(v) {
    if (v.phase !== "play" || v.locked || v.late || v.log.length || v.nextCallInSec === null || v.nextCallInSec <= 0 || v.round > 1) return "";
    const ms = (1692803367 + (v.scheduledRound - 1) * 3) * 1000;
    const when = new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const prizes = ZG.keysInPlay(v.cfg.rewards).map((key) => ZG.linesFor(v.cfg.rewards, key).map((line) => `<li>${esc((ZG.linesFor(v.cfg.rewards, key).length > 1 ? ordinalName(line.ordinal) + " " : "") + KEYNAME(key))}${line.text ? ": <b>" + esc(line.text) + "</b>" : ""}</li>`).join("")).join("");
    const toFirst = v.nextCallInSec, setup = toFirst <= GRACE_SECS;
    const top = setup
      ? `<h2>Your game is setting up</h2><div class="zsetup">We are waiting 2 minutes more for everyone to join.</div><div class="zcount" aria-live="off" id="cd">${clock(toFirst)}</div><p class="zsmall" style="margin-top:0">until the first number. Keep this page open: the numbers appear on their own.</p>`
      : `<h2>You are in. See you at ${esc(when)}</h2><div class="zsmall" style="margin:0">Starting in</div><div class="zcount" aria-live="off" id="cd">${clock(toFirst - GRACE_SECS)}</div><p class="zsmall" style="margin-top:0">hours : minutes : seconds. Keep this page open: the numbers appear on their own.</p>`;
    return `<div class="zcard zwait">${top}
      ${prizes ? `<h3>What you can win</h3><ul class="zlist">${prizes}</ul>` : ""}
      <h3>How it works</h3><ol class="zlist"><li>Your ticket is below. Numbers are called one by one and marked for you.</li><li>When a row or the whole ticket is complete you will see it. The software checks it, you do not need to shout.</li><li>The organizer hands over the rewards.</li></ol>
      <button class="zbtn s alt" id="soundtest">Check my sound</button><a class="zbtn s alt" id="addcal" download="engagement.ics" href="${icsFor(v)}">Add to my calendar</a></div>`;
  }

  // ---------- winners: a prize record that stays on this phone, the hurray, the final thank-you ----------
  const prizeKey = "ctz-prizes:" + EID;
  const readJson = (k, d) => { try { const v = JSON.parse(store.get(k) || ""); return v || d; } catch { return d; } };
  const winId = (w) => w.round + ":" + w.pattern + ":" + w.ordinal;
  const lineName = (cfg, key, ordinal) => (ZG.linesFor(cfg.rewards, key).length > 1 ? ordinalName(ordinal) + " " : "") + KEYNAME(key);
  let PRIZES = [];
  const celebrated = new Set();
  function syncPrizes(v) {
    const have = readJson(prizeKey, []), ids = new Set(have.map(winId)), fresh = [];
    const add = (w) => { if (!ids.has(winId(w))) { ids.add(winId(w)); have.push(w); if (!celebrated.has(winId(w))) fresh.push(w); celebrated.add(winId(w)); } };
    for (const w of v.won) add({ round: w.round, pattern: w.pattern, ordinal: w.ordinal, text: w.text, name: lineName(v.cfg, w.pattern, w.ordinal) });
    for (const l of v.lucky) if (l.won) add({ round: 1, pattern: "lucky", ordinal: l.ordinal, text: l.title, name: l.title });
    if (fresh.length) store.set(prizeKey, JSON.stringify(have));
    PRIZES = have;
    return fresh;
  }
  function confetti(canvas) {
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const W = (canvas.width = innerWidth), H = (canvas.height = innerHeight), cols = ["#C9A24A", "#0B3D91", "#E4572E", "#2E9E6B", "#F4D35E"];
    const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, r: 4 + Math.random() * 6, c: cols[(Math.random() * cols.length) | 0], vy: 2 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3, a: Math.random() * 6.28, va: -0.2 + Math.random() * 0.4 }));
    const t0 = performance.now();
    (function f(t) {
      ctx.clearRect(0, 0, W, H);
      for (const q of ps) { q.x += q.vx; q.y += q.vy; q.a += q.va; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a); ctx.fillStyle = q.c; ctx.fillRect(-q.r / 2, -q.r / 2, q.r, q.r * 1.6); ctx.restore(); }
      if (t - t0 < 6000 && canvas.isConnected) requestAnimationFrame(f); else ctx.clearRect(0, 0, W, H);
    })(t0);
  }
  function showHurray(list) {
    const old = document.getElementById("hurray"); if (old) old.remove();
    const box = document.createElement("div"); box.id = "hurray"; box.className = "zhurray"; box.setAttribute("role", "alertdialog"); box.setAttribute("aria-live", "assertive");
    const what = list.map((w) => esc(w.name)).join(", ");
    const prize = list.filter((w) => w.text).map((w) => `<div class="zhp">${esc(w.text)}</div>`).join("");
    box.innerHTML = `<canvas class="zconf" aria-hidden="true"></canvas><div class="zhcard"><div class="zhbig">Hurray!</div><div class="zhsub">Congratulations, you won</div><div class="zhwhat">${what}</div>${prize}<button class="zbtn" id="hurok">Wonderful</button></div>`;
    document.body.appendChild(box);
    const done = () => { if (box.isConnected) box.remove(); };
    box.querySelector("#hurok").onclick = done; setTimeout(done, 15000);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) confetti(box.querySelector("canvas"));
    try { navigator.vibrate && navigator.vibrate([200, 100, 200, 100, 400]); } catch {}
    if (sound && window.TBAudio) TBAudio.say("Congratulations! You won " + list.map((w) => w.name).join(", ") + "!");
  }
  // ---------- tell our store that the game is over for this phone, once (tiny): the end-of-game clock relies on it. Winners are reported by the game code itself, and only count when several phones agree.
  const overKey = "ctz-over:" + EID;
  let overPending = false;
  async function reportToStore(v) {
    if (!v.pid) return;
    try {
      if (v.phase === "ended" && !store.get(overKey) && !overPending) {
        overPending = true; // spread over a little time so a big crowd does not ask at the same second
        setTimeout(async () => { try { await api("POST", `/api/z/${EID}/over`, { pid: v.pid }); store.set(overKey, "1"); } catch { /* tried again later */ } overPending = false; }, Math.floor(Math.random() * 45000));
      }
    } catch { /* never in the way of the game */ }
  }
  // ---------- after the game, a winner confirms the name and mobile number the prize goes to (the organizer and co-host see any change, with the original) ----------
  const CF = { loaded: false, loading: false, name: "", phone: "", confirmed: false, editing: false, edited: false, prizes: [], note: "", last: 0, busy: false };
  const myDevice = () => store.get("ctz:device") || "";
  async function loadCf(v) {
    if (v.phase !== "ended" || !PRIZES.length || !v.pid || CF.loading || (CF.loaded && CF.confirmed) || Date.now() - CF.last < 15000) return;
    CF.last = Date.now(); CF.loading = true;
    try {
      const r = await api("GET", `/api/z/${EID}/myprizes?pid=${encodeURIComponent(v.pid)}&device=${encodeURIComponent(myDevice())}`);
      CF.prizes = r.prizes || []; if (!CF.edited) { CF.name = r.name || ""; CF.phone = r.phone || ""; } CF.confirmed = !!r.confirmed; CF.loaded = CF.prizes.length > 0;
    } catch { /* tried again shortly */ }
    CF.loading = false;
  }
  function confirmCard(v) {
    if (v.phase !== "ended" || !PRIZES.length) return "";
    if (!CF.loaded) return `<div class="zcard"><h2>Confirm where your prize goes</h2><p class="zsmall">Waiting for your result to be confirmed by the other phones. This takes a moment.</p></div>`;
    if (CF.confirmed && !CF.editing) return `<div class="zcard"><h2>Details confirmed</h2><p style="margin:4px 0"><b>${esc(CF.name)}</b> &middot; ${esc(CF.phone)}</p><p class="zsmall">Your organizer has these details. <button class="zsnd" id="cfedit">Change</button></p></div>`;
    return `<div class="zcard zform"><h2>Confirm your prize details</h2>
      <p class="zsmall" style="margin:0 0 6px">Your organizer will use this name and mobile number to hand over your prize. Please check them and correct anything that is wrong. If you change them, your organizer and co-host will see both what you joined with and what you changed it to.</p>
      <label for="cfnm">Your name</label><input id="cfnm" autocomplete="name" maxlength="60" value="${esc(CF.name)}">
      <label for="cfph">Your mobile number</label><input id="cfph" inputmode="tel" autocomplete="tel" value="${esc(CF.phone)}">
      ${CF.note ? `<div class="zbanner ${CF.note.startsWith("Thank") ? "ok" : "bad"}" role="alert">${esc(CF.note)}</div>` : ""}
      <button class="zbtn" id="cfgo"${CF.busy ? " disabled" : ""}>Confirm</button></div>`;
  }
  function bindConfirm(v) {
    const nm = document.getElementById("cfnm"), ph = document.getElementById("cfph"), go = document.getElementById("cfgo"), ed = document.getElementById("cfedit");
    if (ed) ed.onclick = () => { CF.editing = true; CF.note = ""; paint(); };
    if (nm) nm.oninput = () => { CF.name = nm.value; CF.edited = true; };
    if (ph) ph.oninput = () => { CF.phone = ph.value; CF.edited = true; };
    if (go) go.onclick = async () => {
      CF.busy = true; CF.note = ""; paint();
      try { const r = await api("POST", `/api/z/${EID}/confirm`, { pid: v.pid, device: myDevice(), name: CF.name, phone: CF.phone }); CF.confirmed = true; CF.editing = false; CF.edited = false; CF.note = ""; CF.last = 0; }
      catch (e) { CF.note = (e && e.message) || "Could not save. Please try again."; }
      CF.busy = false; paint();
    };
  }
  function prizesCard() {
    if (!PRIZES.length) return "";
    const rows = PRIZES.slice().sort((a, b) => a.round - b.round).map((w) => `<div class="zrow"><span>${esc(w.name)}${w.text ? `<br><small class="zsmall" style="margin:0">${esc(w.text)}</small>` : ""}</span><em>${w.pattern === "lucky" ? "Lucky draw" : "Round " + w.round}</em></div>`).join("");
    return `<div class="zcard zprizes"><h2>Your prizes</h2>${rows}<p class="zsmall" style="margin:6px 0 0">Saved on this phone. Show this to your organizer to collect.</p></div>`;
  }
  let shareLink = location.origin + "/";
  try { localStorage.removeItem("ctz-phone"); } catch {} // older versions saved the participant's own number on the phone: it is not kept any more
  function finalCard(v) {
    const n = PRIZES.length;
    return `<div class="zcard zfinal"><h2>Game complete</h2>
      <div class="zfbig">Thank you for joining our extended family of Corporate Tambola.</div>
      <p class="zsmall" style="font-size:15px;margin:6px 0 10px">${n ? "You won " + n + " prize" + (n === 1 ? "" : "s") + ". They are listed below and stay on this phone." : "Every game is a good game. We hope you had fun, and we would love to see you at the next one."}</p>
      <button class="zbtn" id="shr">Share with friends and colleagues</button>
      <a class="zbtn s alt" style="display:inline-flex;align-items:center;text-decoration:none;margin-top:8px" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent("I just played Corporate Tambola with my team. Bring it to your company: " + shareLink)}">WhatsApp</a>
      <p class="zsmall" style="margin:10px 0 0"><a href="/partner.html?from=ticket">Earn 50% by sharing: Refer &amp; earn</a></p></div>`;
  }
  function bindShare() {
    const b = document.getElementById("shr"); if (!b) return;
    b.onclick = async () => {
      const data = { title: "Corporate Tambola", text: "I just played Corporate Tambola with my team. Bring it to your company:", url: shareLink };
      try { if (navigator.share) { await navigator.share(data); return; } } catch { return; }
      try { await navigator.clipboard.writeText(data.text + " " + data.url); b.textContent = "Link copied"; } catch { b.textContent = shareLink; }
    };
  }

  // ---------- break media plays inside the page (YouTube, video and audio files); anything else stays a link ----------
  const mediaHost = document.createElement("div");
  mediaHost.id = "ctmedia"; mediaHost.style.cssText = "position:absolute;z-index:30;display:none;background:#000;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.3)";
  document.body.appendChild(mediaHost);
  let mediaKey = "";
  const ytId = (u) => { const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/.exec(u || ""); return m ? m[1] : null; };
  const mediaKind = (b) => {
    if (!b || !b.mediaUrl) return null;
    if (ytId(b.mediaUrl)) return "yt";
    if (b.kind === "youtube") return null;
    if (/\.(mp4|webm|m4v|mov|ogv)([?#]|$)/i.test(b.mediaUrl)) return "video";
    if (/\.(mp3|m4a|aac|wav|ogg|oga)([?#]|$)/i.test(b.mediaUrl)) return "audio";
    return null;
  };
  function soundButton(onTap) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = "Tap for sound";
    b.style.cssText = "position:absolute;right:8px;bottom:8px;z-index:2;background:#C9A24A;color:#1b1b1b;border:0;border-radius:8px;padding:6px 12px;font:700 13px system-ui,sans-serif";
    b.onclick = () => { try { onTap(); } catch {} b.remove(); };
    mediaHost.appendChild(b);
  }
  function startMedia(b, kind) {
    const elapsed = Math.max(0, Math.min((b.seconds || 0) - (b.secondsLeft || 0), 3600));
    if (kind === "yt") {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), canSound = !ios && navigator.userActivation && navigator.userActivation.hasBeenActive;
      const f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + ytId(b.mediaUrl) + "?autoplay=1&mute=" + (canSound ? 0 : 1) + "&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&start=" + Math.round(elapsed) + "&origin=" + encodeURIComponent(location.origin);
      f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; f.title = b.title; f.setAttribute("allowfullscreen", ""); f.referrerPolicy = "strict-origin-when-cross-origin";
      f.style.cssText = "width:100%;height:100%;border:0"; mediaHost.appendChild(f);
      if (!canSound) soundButton(() => f.contentWindow.postMessage(JSON.stringify({ event: "command", func: "unMute", args: [] }), "https://www.youtube-nocookie.com"));
      return;
    }
    const el = document.createElement(kind === "video" ? "video" : "audio");
    el.src = b.mediaUrl; el.controls = true; el.autoplay = true; el.setAttribute("playsinline", ""); el.preload = "auto";
    el.style.cssText = kind === "video" ? "width:100%;height:100%;background:#000" : "position:absolute;left:8px;right:8px;top:50%;transform:translateY(-50%);width:calc(100% - 16px)";
    if (kind === "audio") { mediaHost.style.background = "#0B3D91"; const t = document.createElement("div"); t.textContent = b.title; t.style.cssText = "position:absolute;left:0;right:0;top:18%;text-align:center;color:#fff;font:700 18px system-ui,sans-serif;padding:0 12px"; mediaHost.appendChild(t); } else mediaHost.style.background = "#000";
    el.addEventListener("loadedmetadata", () => { try { if (elapsed && el.duration > elapsed + 1) el.currentTime = elapsed; } catch {} });
    mediaHost.appendChild(el);
    const p = typeof el.play === "function" ? el.play() : null; if (p && p.catch) p.catch(() => { el.muted = true; const q = el.play(); if (q && q.catch) q.catch(() => {}); soundButton(() => { el.muted = false; }); });
  }
  function placeMedia() {
    if (!mediaKey) return;
    const slot = document.getElementById("mslot");
    if (!slot) { mediaHost.style.display = "none"; return; }
    const r = slot.getBoundingClientRect();
    mediaHost.style.display = "block"; mediaHost.style.left = r.left + scrollX + "px"; mediaHost.style.top = r.top + scrollY + "px"; mediaHost.style.width = r.width + "px"; mediaHost.style.height = r.height + "px";
  }
  function syncMedia(v) {
    const b = v.brk, kind = b ? mediaKind(b) : null, key = b && kind ? b.title + "|" + b.mediaUrl : "";
    if (key !== mediaKey) {
      mediaHost.textContent = ""; mediaHost.style.display = "none"; mediaHost.style.background = "#000"; mediaKey = key;
      if (key) startMedia(b, kind);
    }
    placeMedia();
  }
  addEventListener("resize", placeMedia);

  /** Joined after the first number: what that means, then the countdown to this phone's own first number. */
  function lateCard(v) {
    const l = v.late; if (!l) return "";
    if (l.secondsUntil > 0) return `<div class="zcard zbreak" role="status"><h2>You joined after the game began</h2><div class="zsetup">Numbers called before you joined are gone, and prizes already awarded stay awarded.</div><div class="zcount" aria-live="off">${clock(l.secondsUntil)}</div><p class="zsmall" style="margin:0">until your numbers start. Your ticket is ready below.</p></div>`;
    return `<div class="zcard"><div class="zsmall" style="margin:0">You joined after the game began, so you play from your first number. ${l.hidden} number${l.hidden === 1 ? " was" : "s were"} called before you.</div></div>`;
  }
  // ---------- invite your colleagues / family members (when the organizer allows it) ----------
  let inviteCat = "", inviteInfo = null, inviteAt = -Infinity;
  const seatOf = (pid) => { const m = /^(\d+)x/.exec(pid || ""); return m ? Number(m[1]) : 0; };
  async function loadInvites(v) {
    if (!v.pid || !(v.cfg.invites && v.cfg.invites.on) || performance.now() - inviteAt < 45000) return;
    inviteAt = performance.now();
    try { inviteInfo = await api("GET", `/api/z/${EID}/invites?pid=${encodeURIComponent(v.pid)}`); } catch { /* shown next time */ }
  }
  const inviteLink = (v) => `${location.origin}/z.html?e=${encodeURIComponent(EID)}&from=${seatOf(v.pid)}${inviteCat ? "&c=" + encodeURIComponent(inviteCat) : ""}`;
  function inviteCard(v) {
    const iv = v.cfg.invites;
    if (!iv || !iv.on || !seatOf(v.pid)) return "";
    const cats = (ZG.INVITE_CATEGORIES || []).filter((c) => iv.cats.includes(c.id));
    if (!cats.length) return "";
    if (!inviteCat || !cats.some((c) => c.id === inviteCat)) inviteCat = cats[0].id;
    const used = inviteInfo ? inviteInfo.used : 0, unl = inviteInfo && inviteInfo.unlimited, left = Math.max(0, iv.per - used);
    const counter = unl ? "You can invite as many people as you like." : `You can invite up to <b>${iv.per}</b> people. You have invited <b>${used}</b>${left ? `, so <b>${left}</b> ${left === 1 ? "invitation is" : "invitations are"} left` : ". You have used all your invitations"}.`;
    const chips = cats.map((c) => `<button type="button" class="zchip${c.id === inviteCat ? " on" : ""}" data-icat="${esc(c.id)}">${esc(c.label)}</button>`).join("");
    const link = inviteLink(v), kind = (cats.find((c) => c.id === inviteCat) || cats[0]).label.toLowerCase();
    const text = "Join me for Corporate Tambola! Open this link, enter your mobile number and you get your own ticket: " + link;
    return `<div class="zcard zinvite"><h2>Invite your colleagues / family members</h2>
      <p class="zsmall" style="margin:0 0 8px">${counter}</p>
      ${!unl && !left ? "" : `<div class="zsmall" style="margin:0 0 4px">Who are you inviting?</div><div class="zchips">${chips}</div>
      <div class="zlink" id="invlink" style="margin-top:8px">${esc(link)}</div>
      <button class="zbtn s" id="invshare">Share invitation (${esc(kind)})</button>
      <a class="zbtn s alt" style="display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">WhatsApp</a>
      <button class="zbtn s alt" id="invcopy">Copy link</button>
      <p class="zsmall" style="margin:8px 0 0">Your guest joins with their own mobile number and gets their own ticket. ${unl ? "" : `Your link stops working after ${iv.per} people have joined through it.`}</p>`}</div>`;
  }
  function bindInvite(v) {
    document.querySelectorAll("[data-icat]").forEach((b) => (b.onclick = () => { inviteCat = b.dataset.icat; paint(); }));
    const sh = document.getElementById("invshare"); if (sh) sh.onclick = async () => { const data = { title: "Corporate Tambola", text: "Join me for Corporate Tambola! Open this link, enter your mobile number and you get your own ticket:", url: inviteLink(v) }; try { if (navigator.share) { await navigator.share(data); return; } } catch { return; } try { await navigator.clipboard.writeText(data.text + " " + data.url); sh.textContent = "Link copied"; } catch { sh.textContent = data.url; } };
    const cp = document.getElementById("invcopy"); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(inviteLink(v)); cp.textContent = "Copied"; } catch { cp.textContent = "Press and hold the link above to copy"; } };
  }
  function breakCard(b) {
    const inPage = !!mediaKind(b);
    const act = b.mediaUrl ? (inPage ? `<div id="mslot" class="zmslot"></div><a class="zsmall" target="_blank" rel="noopener noreferrer" href="${esc(b.mediaUrl)}">Trouble playing? Open it in a new tab</a>` : `<a class="zbtn s" style="display:inline-flex;align-items:center;text-decoration:none;margin-top:10px" target="_blank" rel="noopener noreferrer" href="${esc(b.mediaUrl)}">${b.kind === "youtube" ? "Watch the video" : "Open"}</a>`) : "";
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
    else if (v.mode === "hold" && v.nowRound !== null) banners.push(`<div class="zbanner warn">Checking with the organizer… numbers will continue in a moment.</div>`);
    else if (v.mode === "blind") banners.push(`<div class="zbanner warn">Cannot reach the organizer's controls right now. Play continues; a pause may appear late.</div>`);
    if (v.phase === "ended" && !v.stopped && !v.endedByPrizes) banners.push(`<div class="zbanner ok">${v.rounds > 1 ? "All " + v.rounds + " rounds are finished." : "All 90 numbers have been called."} Thank you for taking part.</div>`);
    const sub = v.phase === "ended" || v.locked || v.brk || v.intermission ? "" : v.late && v.late.secondsUntil > 0 ? "Your numbers start in " + clock(v.late.secondsUntil) : v.log.length === 0 ? (v.nextCallInSec !== null ? (v.nextCallInSec > GRACE_SECS ? "Starting in " + clock(v.nextCallInSec - GRACE_SECS) : "First number in " + clock(v.nextCallInSec)) : "Getting ready…") : v.paused || v.mode === "hold" ? "" : v.nextCallInSec !== null ? "Next number in " + v.nextCallInSec + "s" : "";
    const still = v.tickets.length ? stillToWinRows(v) : "";
    const chk = v.pendingChecks > 0 ? `<p class="zsmall">Double-checking ${v.pendingChecks} earlier number${v.pendingChecks === 1 ? "" : "s"} in the background.</p>` : "";
    const curWins = v.won.filter((w) => w.round === v.round), winSet = new Set(curWins.flatMap((w) => w.cells));
    const ribbon = curWins.length ? `<div class="zwin" role="status">&#127881; Congratulations! You won ${curWins.map((w) => esc(lineName(v.cfg, w.pattern, w.ordinal))).join(", ")}${curWins.some((w) => w.text) ? " &middot; " + curWins.filter((w) => w.text).map((w) => esc(w.text)).join(", ") : ""}</div>` : "";
    const tix = v.tickets.map((t, i) => (v.tickets.length > 1 ? `<div class="zsmall" style="margin:${i ? 12 : 0}px 0 4px"><b>Ticket ${"AB"[i]}</b></div>` : "") + ticketHtml(t, called, v.tickets.length > 1 ? "Ticket " + "AB"[i] : "Your ticket", winSet)).join("");
    return `<div class="zhead"><b>Corporate Tambola</b><button class="zsnd" id="snd" aria-pressed="${sound}">${sound ? "Sound on" : "Sound off"}</button></div>
      ${annBanner(v)}${banners.join("")}
      ${v.phase === "ended" ? finalCard(v) + confirmCard(v) + prizesCard() : ""}
      ${waitingRoom(v)}
      ${lateCard(v)}
      ${roundCards(v)}
      ${v.brk ? breakCard(v.brk) : ""}
      <div class="zcard"><div class="zball"><div class="zbig ${last ? "" : "none"}" id="big" aria-live="assertive" aria-label="${last ? "Number " + last : "No number yet"}">${last ?? "–"}</div></div>
        <div class="zsub">${sub}</div>
        <div class="zlast" aria-label="Recent numbers">${v.log.slice(-7, -1).reverse().map((n) => `<span>${n}</span>`).join("")}</div></div>
      <div class="zcard${curWins.length ? " zwon" : ""}"><h2>${v.tickets.length > 1 ? "Your tickets" : "Your ticket"}</h2>${ribbon}${tix}<a class="zref" href="/partner.html?from=ticket">Refer &amp; earn</a></div>
      ${v.phase === "ended" ? "" : prizesCard()}
      ${inviteCard(v)}
      <div class="zcard"><h2>Still to win</h2>${still}${chk}</div>
      ${luckyCard(v)}
      <div class="zcard"><h2>${v.rounds > 1 ? "Round " + v.round + " of " + v.rounds + " · " : ""}${v.late ? "Numbers since you joined · " + v.log.length : "All numbers · " + v.log.length + " of 90"} called</h2><div class="zboard">${Array.from({ length: 90 }, (_, i) => `<div class="${called.has(i + 1) ? "c" : ""}">${i + 1}</div>`).join("")}</div></div>`;
  }

  function paint() {
    const v = rt.view();
    if (!v.won) v.won = []; // an older saved copy of the game code during an update: never break the screen
    if (v.phase === "missing" || v.phase === "boot") { $app.innerHTML = `<p class="zmsg">${esc(v.error || "Loading…")}</p>`; return; }
    if (v.phase === "join") { const f = document.getElementById("ph"); if (f && document.activeElement === f) return; $app.innerHTML = joinView(v.error); bindJoin(); return; }
    const fresh = syncPrizes(v); reportToStore(v); loadCf(v);
    { const af = document.activeElement; if (af && (af.id === "cfnm" || af.id === "cfph")) return; } // never wipe a form someone is typing in
    $app.innerHTML = playView(v);
    syncMedia(v); bindShare(); bindConfirm(v); loadInvites(v); bindInvite(v);
    if (fresh.length) showHurray(fresh);
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
      const ok = await rt.join(typed, document.getElementById("nm").value.trim(), INVITE_FROM ? { from: INVITE_FROM, cat: INVITE_CAT } : undefined);
      if (ok) { paint(); start(); } else { go.disabled = false; paint(); } // show the ticket screen at once: the first tick may take a few seconds on a slow network
    };
  }
  async function loop() { try { await rt.tick(); } catch { /* the loop must never die */ } paint(); }
  function start() { if (timer) return; loop(); timer = setInterval(loop, 1000); }

  if (!EID) { $app.innerHTML = `<p class="zmsg">This link is incomplete. Please ask your organizer for the engagement link.</p>`; return; }
  rt.boot().then(() => { paint(); if (rt.phase === "play") start(); });
  window.__rt = rt;
})();
