p = r"C:\ct\tambola\apps\web\public\z.js"
s = open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
s = s.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, old[:90]
    s = s.replace(old, new)

# 1. ticket cells can glow for the winning pattern
rep('''const ticketHtml = (t, called, label) => `<div class="zticket" aria-label="${label}">${t.flat().map((v) => v === null ? `<div class="e"></div>` : `<div class="${called.has(v) ? "m" : ""}">${v}</div>`).join("")}</div>`;''',
    '''const ticketHtml = (t, called, label, win) => `<div class="zticket" aria-label="${label}">${t.flat().map((v) => v === null ? `<div class="e"></div>` : `<div class="${called.has(v) ? "m" : ""}${win && win.has(v) && called.has(v) ? " w" : ""}">${v}</div>`).join("")}</div>`;''')

# 2. winners, prizes, hurray, final card, media: inserted before breakCard
block = r'''
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
  function prizesCard() {
    if (!PRIZES.length) return "";
    const rows = PRIZES.slice().sort((a, b) => a.round - b.round).map((w) => `<div class="zrow"><span>${esc(w.name)}${w.text ? `<br><small class="zsmall" style="margin:0">${esc(w.text)}</small>` : ""}</span><em>${w.pattern === "lucky" ? "Lucky draw" : "Round " + w.round}</em></div>`).join("");
    return `<div class="zcard zprizes"><h2>Your prizes</h2>${rows}<p class="zsmall" style="margin:6px 0 0">Saved on this phone. Show this to your organizer to collect.</p></div>`;
  }
  let shareLink = location.origin + "/";
  try { const c = (store.get("ctz-phone") || "").replace(/\D/g, ""); if (c.length === 10) fetch("/api/partner/check?code=" + c).then((r) => r.json()).then((j) => { if (j && j.valid) shareLink = location.origin + "/?ref=" + c; }).catch(() => {}); } catch {}
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
    const p = el.play(); if (p && p.catch) p.catch(() => { el.muted = true; const q = el.play(); if (q && q.catch) q.catch(() => {}); soundButton(() => { el.muted = false; }); });
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
'''
rep("  function breakCard(b) {", block + "\n  function breakCard(b) {")

# 3. break card: a slot for the player, and the link only as a fallback
rep('''    const act = b.mediaUrl ? `<a class="zbtn s" style="display:inline-flex;align-items:center;text-decoration:none;margin-top:10px" target="_blank" rel="noopener noreferrer" href="${esc(b.mediaUrl)}">${b.kind === "youtube" ? "Watch the video" : "Open"}</a>` : "";''',
    '''    const inPage = !!mediaKind(b);
    const act = b.mediaUrl ? (inPage ? `<div id="mslot" class="zmslot"></div><a class="zsmall" target="_blank" rel="noopener noreferrer" href="${esc(b.mediaUrl)}">Trouble playing? Open it in a new tab</a>` : `<a class="zbtn s" style="display:inline-flex;align-items:center;text-decoration:none;margin-top:10px" target="_blank" rel="noopener noreferrer" href="${esc(b.mediaUrl)}">${b.kind === "youtube" ? "Watch the video" : "Open"}</a>`) : "";''')

# 4. play view: ribbon + glow, prizes, final card; the old ended banner is replaced when ended by prizes
rep('''    if (v.phase === "ended" && !v.stopped) banners.push(''', '''    if (v.phase === "ended" && !v.stopped && !v.endedByPrizes) banners.push(''')
rep('''    const tix = v.tickets.map((t, i) => (v.tickets.length > 1 ? `<div class="zsmall" style="margin:${i ? 12 : 0}px 0 4px"><b>Ticket ${"AB"[i]}</b></div>` : "") + ticketHtml(t, called, v.tickets.length > 1 ? "Ticket " + "AB"[i] : "Your ticket")).join("");''',
    '''    const curWins = v.won.filter((w) => w.round === v.round), winSet = new Set(curWins.flatMap((w) => w.cells));
    const ribbon = curWins.length ? `<div class="zwin" role="status">&#127881; Congratulations! You won ${curWins.map((w) => esc(lineName(v.cfg, w.pattern, w.ordinal))).join(", ")}${curWins.some((w) => w.text) ? " &middot; " + curWins.filter((w) => w.text).map((w) => esc(w.text)).join(", ") : ""}</div>` : "";
    const tix = v.tickets.map((t, i) => (v.tickets.length > 1 ? `<div class="zsmall" style="margin:${i ? 12 : 0}px 0 4px"><b>Ticket ${"AB"[i]}</b></div>` : "") + ticketHtml(t, called, v.tickets.length > 1 ? "Ticket " + "AB"[i] : "Your ticket", winSet)).join("");''')
rep('''      ${waitingRoom(v)}
      ${roundCards(v)}''', '''      ${v.phase === "ended" ? finalCard(v) + prizesCard() : ""}
      ${waitingRoom(v)}
      ${roundCards(v)}''')
rep('''<div class="zcard"><h2>${v.tickets.length > 1 ? "Your tickets" : "Your ticket"}</h2>${tix}<a class="zref"''', '''<div class="zcard${curWins.length ? " zwon" : ""}"><h2>${v.tickets.length > 1 ? "Your tickets" : "Your ticket"}</h2>${ribbon}${tix}<a class="zref"''')
rep('''      <div class="zcard"><h2>Still to win</h2>${still}${chk}</div>''', '''      ${v.phase === "ended" ? "" : prizesCard()}
      <div class="zcard"><h2>Still to win</h2>${still}${chk}</div>''')

# 5. paint: record prizes, celebrate, play media, share button
rep('''    $app.innerHTML = playView(v);
    const s = document.getElementById("snd");''', '''    const fresh = syncPrizes(v);
    $app.innerHTML = playView(v);
    syncMedia(v); bindShare();
    if (fresh.length) showHurray(fresh);
    const s = document.getElementById("snd");''')
open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))

# CSS
c = r"C:\ct\tambola\apps\web\public\z.css"
t = open(c, encoding="utf-8", newline="").read()
cn = "\r\n" if "\r\n" in t else "\n"
t = t.rstrip() + cn + """
/* winners, hurray, final thank-you, in-page media */
.zticket div.w{background:#C9A24A;color:#1b1b1b;box-shadow:0 0 0 2px #fff,0 0 10px 2px #C9A24A;font-weight:800}
.zwin{background:linear-gradient(90deg,#fff6d6,#ffe9a8);border:1px solid #C9A24A;color:#5a4300;border-radius:10px;padding:10px 12px;margin:0 0 10px;font:700 15px/1.35 var(--sans,inherit)}
.zcard.zwon{border-color:#C9A24A;box-shadow:0 0 0 2px #f1dca0}
.zprizes{border-color:#C9A24A}
.zfinal{background:linear-gradient(180deg,#fffaf0,#fff);border-color:#C9A24A;text-align:center}
.zfinal .zfbig{font:700 22px/1.3 var(--serif,Georgia,serif);color:#0B3D91;margin:4px 0}
.zhurray{position:fixed;inset:0;z-index:100;background:rgba(11,61,145,.82);display:flex;align-items:center;justify-content:center;padding:16px}
.zhurray .zconf{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.zhcard{position:relative;background:#fffdf9;border-radius:18px;padding:22px 20px;text-align:center;max-width:380px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.35)}
.zhbig{font:800 44px/1.1 var(--serif,Georgia,serif);color:#C9A24A;text-shadow:0 1px 0 #8a6b1b}
.zhsub{font:600 15px var(--sans,inherit);color:#444;margin-top:6px}
.zhwhat{font:800 26px/1.2 var(--sans,inherit);color:#0B3D91;margin:6px 0 10px}
.zhp{font:600 15px var(--sans,inherit);color:#333;margin:0 0 10px}
.zmslot{width:100%;aspect-ratio:16/9;max-height:42vh;margin:10px 0 6px}
@media (prefers-reduced-motion:no-preference){.zhbig{animation:zpop .6s ease-out}@keyframes zpop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}}
""" + cn
open(c, "w", encoding="utf-8", newline="").write(t)

# build headers: let the phone page play YouTube and https media inside the page
b = r"C:\ct\tambola\pages\build.mjs"
u = open(b, encoding="utf-8", newline="").read()
old = '''${CSP.replace(/ frame-src[^;]*;/, "")}'''
assert u.count(old) == 1
u = u.replace(old, '''${CSP.replace(/ frame-src[^;]*;/, " frame-src https://www.youtube-nocookie.com;").replace("media-src 'self' blob:;", "media-src 'self' blob: https:;")}''')
open(b, "w", encoding="utf-8", newline="").write(u)
print("ok")
