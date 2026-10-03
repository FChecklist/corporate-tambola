/* Corporate Tambola, organizer page for zero-server engagements: create, share, watch, pause/resume/stop, check claims, settle, history/reuse/erase.
   Works on the organizer's own machine; the game itself runs on the phones. The page holds the organizer secret only in this tab's session. */
(function () {
  const ZG = window.ZG;
  const $app = document.getElementById("app");
  const q = new URLSearchParams(location.search);
  const BASE = (q.get("api") || "").replace(/\/$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
  let secret = ss.get("ctz-org") || "";
  { const m = location.hash.match(/^#host=(cth_[0-9a-f]{48})$/); if (m) { secret = m[1]; ss.set("ctz-org", secret); history.replaceState(null, "", location.pathname + location.search); } }
  let eid = q.get("e") || "";
  const NAMES = { full2: "Full Two-Ticket House", early5: "Early Five", top: "Top line", mid: "Middle line", bot: "Bottom line", corners: "Four corners", star: "Star", full: "Full house" };
  const call = async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", "x-organizer": secret }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "http " + r.status), { status: r.status, needPack: j.needPack, payments: j.payments });
    return j;
  };
  const S = { role: "", annNote: "", hostLink: "", aiMsg: ss.get("ctz-aimsg") || "", contact: { email: ss.get("ctz-email") || "", phone: ss.get("ctz-phone") || "" }, info: null, people: [], claims: [], control: null, results: [], store: null, log: [], note: "", history: null, busy: false };
  const fmtDay = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  async function latestRound() { const x = await ZG.fetchRound("latest"); return x ? x.round : null; }

  function loginView(msg) {
    return `<div class="zhead"><b>Corporate Tambola · Organizer</b></div><div class="zcard zform"><h2>Organizer key</h2>
      <label for="sec">Your organizer key</label><input id="sec" type="password" autocomplete="off" value="${esc(secret)}">
      ${msg ? `<div class="zbanner bad">${esc(msg)}</div>` : ""}<button class="zbtn" id="in">Continue</button></div><div class="zcard"><h2>Coming back?</h2><p class="zsmall" style="margin-top:0">Sign in with your work email: we send you a 6-digit code, no password.</p><a class="zbtn s alt" href="/#login" id="goLogin" style="text-decoration:none;display:inline-block">Sign in with email</a></div>`;
  }
  /** The two ways to work, shown first and prominently. Most organizers pick the AI. */
  function optionsCard() {
    const ai = S.aiMsg
      ? `<textarea class="zlink" id="aimsg" rows="5" readonly style="width:100%;box-sizing:border-box">${esc(S.aiMsg)}</textarea><button class="zbtn" id="aicopy" style="margin-top:8px">Copy my AI work link</button><button class="zbtn s alt" id="airevoke">Stop this link</button>`
      : `<button class="zbtn" id="aimake">Get my AI work link</button>`;
    return `<div class="zcard" style="border:2px solid #c9a24a;background:#fffaf0"><div class="zsmall" style="font-weight:700;letter-spacing:.06em;color:#8a6a1a">OPTION 1 · THE EASY WAY · MOST ORGANIZERS CHOOSE THIS</div>
      <h2 style="margin:6px 0 8px;font-size:22px">Let your free AI assistant do all the work for you.</h2>
      <p style="margin:0 0 10px">Do not want to fill in forms? Copy your AI work link below and paste it into any AI chat: <b>ChatGPT, Gemini, Grok, Claude, DeepSeek, Z.ai</b> or any other. Then just tell it what you want, in your own words: <i>"Create an engagement for 300 employees this Friday at 4 pm, with a lucky draw."</i></p>
      <p style="margin:0 0 10px">It sets up everything: the engagement, the rewards, your brand breaks, your participant list and the schedule. <b>You watch it happen right here on this page.</b> It is free with every engagement. When it is ready to publish, the AI hands you the link; you confirm your details and pay yourself. The AI never pays.</p>
      ${ai}
      <hr style="border:0;border-top:1px solid #e6d9b8;margin:16px 0">
      <div class="zsmall" style="font-weight:700;letter-spacing:.06em;color:#555">OPTION 2 · DO IT YOURSELF</div>
      <p style="margin:6px 0 8px">Prefer to click through it yourself? Create your engagement by hand in the console.</p>
      <a class="zbtn s alt" href="#newform" style="text-decoration:none;display:inline-block">Create engagement manually ↓</a></div>`;
  }
  function homeView() {
    const h = S.history;
    const last = h && h.engagements[0];
    const bar = last ? `<div class="lastbar"><span>LAST ENGAGEMENT WAS ON <b>${fmtDay(last.created_ms)}</b> · ${last.participants} participants</span><span><button data-reuse="${esc(last.id)}">REUSE THE DATA</button><button data-hist="1">HISTORY</button></span></div>` : "";
    const hist = S.showHist && h ? `<div class="zcard"><h2>History · kept ${h.retentionDays} days</h2><table>${h.engagements.map((e) => `<tr><td>${esc(e.id)}</td><td>${fmtDay(e.created_ms)}</td><td>${e.participants} people${e.draft ? " · draft" : ""}</td><td><button class="zbtn s alt" data-open="${esc(e.id)}">Open</button><button class="zbtn s alt" data-reuse="${esc(e.id)}">Reuse</button></td></tr>`).join("")}</table></div>` : "";
    return `<div class="zhead"><b>Corporate Tambola · Organizer</b></div>${optionsCard()}${bar}${hist}
      <div class="zcard zform" id="newform"><h2>Create your engagement</h2>
      <label for="mins">Starts in (minutes)</label><input id="mins" type="number" min="1" max="1440" value="10">
      <label for="spd">Calling speed</label><select id="spd"><option value="6">Fast · 6 seconds</option><option value="9" selected>Normal · 9 seconds</option><option value="12">Relaxed · 12 seconds</option><option value="15">Slow · 15 seconds</option></select>
      <label for="cap">Most participants</label><input id="cap" type="number" min="1" max="100000" value="500">
      <button class="zbtn" id="mk">Create engagement</button><p class="zsmall">You build it first, at no cost. Payment is asked only when you publish. The first number is called one minute after the start time. Numbers come from public randomness that nobody, including us, can know in advance.</p></div>
      ${(S.keys || []).length ? `<div class="zcard"><h2>Your sign-in keys</h2>${S.keys.map((k) => `<div class="zrow"><span>${k.kind === "ai" ? "AI assistant link" : "Organizer key"} · made ${new Date(k.created_ms).toLocaleDateString()}${k.thisOne ? " · in use now" : ""}</span>${k.revoked ? `<i>retired</i>` : k.thisOne ? `<i>active</i>` : `<button class="zbtn s alt" data-retire="${k.id}">Retire</button>`}</div>`).join("")}<p class="zsmall">If you ever lose a key or think someone has it, sign in with another one and retire it here.</p></div>` : ""}
      ${(S.sugs || []).length ? `<div class="zcard"><h2>Ideas to improve Corporate Tambola</h2><p class="zsmall" style="margin-top:0">Suggested by organizers' AI assistants. We review them all.</p>${S.sugs.map((x) => `<div class="zrow"><span>${esc(x.title)}${x.yours ? " · yours" : ""}</span><i>${x.votes} · ${esc(x.status.replace("_", " "))}</i></div>`).join("")}</div>` : ""}
      ${S.note ? `<div class="zbanner info">${esc(S.note)}</div>` : ""}`;
  }
  const HOUSE_WORDS = [[/^(full two[- ]ticket( house)?|two[- ]ticket|full2)$/i, "full2"], [/^(early ?five|early ?5|early5)$/i, "early5"], [/^(top( line)?)$/i, "top"], [/^(middle( line)?|mid)$/i, "mid"], [/^(bottom( line)?|bot)$/i, "bot"], [/^(four )?corners$/i, "corners"], [/^star$/i, "star"], [/^(full( house)?)$/i, "full"]];
  const ORD = (k) => ["", "1st", "2nd", "3rd"][k] || k + "th";
  function lineLabel(s) {
    const lines = (S.cfg && S.cfg.rewards || []).filter((l) => (l.scope === "two_ticket" ? "full2" : l.pattern) === s.pattern);
    const line = lines.find((l) => l.ordinal === s.ordinal);
    return ((S.cfg && S.cfg.rounds > 1) ? "Round " + (s.round || 1) + " · " : "") + (lines.length > 1 ? ORD(s.ordinal) + " " : "") + NAMES[s.pattern] + (line && line.text ? " (" + line.text + ")" : "");
  }
  function rewardsToText(c) {
    return c.rewards.map((l) => (l.scope === "two_ticket" ? "full2" : l.pattern) + ": " + l.text).join("\n");
  }
  function textToRewards(txt, tickets) {
    const seen = {}; const out = [];
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim(); if (!line) continue;
      const m = line.match(/^([A-Za-z0-9 -]+?)\s*[:\-]\s*(.*)$/) || [null, line, ""];
      const hit = HOUSE_WORDS.find(([re]) => re.test(m[1].trim()));
      if (!hit) throw new Error("I did not recognise \"" + m[1].trim() + "\". Use early5, top, mid, bot, corners, star, full or full2.");
      const key = hit[1]; seen[key] = (seen[key] || 0) + 1;
      out.push({ pattern: key === "full2" ? "full" : key, scope: key === "full2" ? "two_ticket" : "ticket", ordinal: seen[key], text: m[2].trim() });
    }
    return out;
  }
  function luckyAdminCard() {
    const L = (S.cfg && S.cfg.breaks || []).filter((b) => b.kind === "lucky");
    if (!L.length) return "";
    return `<div class="zcard"><h2>Lucky draws</h2>${L.map((b, i) => { const d = S.lucky && S.lucky[i]; return `<div class="zrow"><span>${esc(b.title)} · ${b.winners || 3} ${(b.winners || 3) === 1 ? "person" : "people"}</span>${d ? (d.published ? `<em>Published</em>` : `<button class="zbtn s" data-lucky="${i}">Publish ${d.winners.length} winner${d.winners.length === 1 ? "" : "s"}</button>`) : `<i>after the break ends</i>`}</div>${d && !d.published ? `<div class="zsmall" style="margin:0 0 6px">${esc(d.winners.map((p) => (S.people.find((x) => x.pid === p) || {}).name || "Participant").join(", "))}</div>` : ""}`; }).join("")}
      <p class="zsmall">Winners are picked from everyone on your list using the public randomness of the round that ends the break, so nobody can influence the draw. Check the names, then publish.</p></div>`;
  }
  let lastPub = ""; const luckySent = new Set();
  /** Results and lucky-draw winners go out on their own while this page is open: the numbers are public, so there is nothing for a person to decide. */
  async function autoPublish() {
    try {
      const all = S.settledPreview.map(({ pattern, ordinal, round, idx, pids }) => ({ pattern, ordinal, round, idx, pids }));
      const sig = JSON.stringify(all.map((x) => [x.pattern, x.ordinal, x.round, x.idx, x.pids.length]));
      if (all.length && sig !== lastPub) { for (let i = 0; i < all.length; i += 40) await call("POST", `/api/z/${eid}/settle`, { results: all.slice(i, i + 40) }); lastPub = sig; }
      const L = (S.cfg.breaks || []).filter((b) => b.kind === "lucky");
      for (let i = 0; i < L.length; i++) { const d = S.lucky && S.lucky[i]; if (d && !d.published && !luckySent.has(i)) { await call("POST", `/api/z/${eid}/settle`, { results: [{ pattern: "lucky", ordinal: i + 1, idx: L[i].after, pids: d.winners }] }); luckySent.add(i); } }
    } catch (e) { /* the next refresh tries again */ }
  }
  async function computeLucky(now) {
    const L = (S.cfg.breaks || []).filter((b) => b.kind === "lucky"); const out = [];
    const st = S.st || null; const stride = S.info.callSeconds / 3;
    for (let i = 0; i < L.length; i++) {
      const round = ZG.luckyRound(st, S.info.startRound + ZG.GRACE_ROUNDS, stride, S.cfg.breaks, L[i]);
      if (round === null || now === null || round > now) { out.push(null); continue; }
      const x = S.luckyRand && S.luckyRand[round] ? S.luckyRand[round] : await ZG.fetchRound(round);
      if (!x) { out.push(null); continue; }
      (S.luckyRand = S.luckyRand || {})[round] = x;
      const winners = ZG.luckyWinners(eid, L[i].after, x.randomness, S.people.map((p) => p.pid), L[i].winners || 3);
      out.push({ winners, published: (S.published || []).some((r) => r.pattern === "lucky" && r.ordinal === i + 1) });
    }
    return out;
  }
  function settingsCard() {
    const c = S.cfg || ZG.defaultCfg();
    const rows = [0, 1, 2].map((i) => { const b = c.breaks[i] || {}; return `<div class="zgrid" style="margin-bottom:8px"><div><label>After how many numbers</label><input type="number" min="1" max="89" data-bk="after" data-i="${i}" value="${b.after ?? ""}"></div><div><label>Seconds (15 to 600)</label><input type="number" min="15" max="600" step="3" data-bk="seconds" data-i="${i}" value="${b.seconds ?? ""}"></div>
      <div><label>Kind</label><select data-bk="kind" data-i="${i}">${["speech", "slides", "youtube", "file", "lucky"].map((k) => `<option value="${k}" ${b.kind === k ? "selected" : ""}>${{ speech: "Speech", slides: "Slides", youtube: "YouTube link", file: "Video file link", lucky: "Lucky draw" }[k]}</option>`).join("")}</select></div>
      <div><label>Title</label><input data-bk="title" data-i="${i}" maxlength="80" value="${esc(b.title || "")}"></div>
      <div><label>Lucky draw: how it is shown</label><select data-bk="style" data-i="${i}"><option value="draw" ${b.style !== "scratch" ? "selected" : ""}>A draw</option><option value="scratch" ${b.style === "scratch" ? "selected" : ""}>A scratch card</option></select></div>
      <div><label>Lucky draw: how many people</label><select data-bk="winners" data-i="${i}">${[1, 3, 5, 10].map((n) => `<option value="${n}" ${(b.winners || 3) === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div style="grid-column:1/-1"><label>Link (https://, for YouTube or a video file)</label><input data-bk="mediaUrl" data-i="${i}" value="${esc(b.mediaUrl || "")}"></div></div>`; }).join("");
    return `<div class="zcard zform"><h2>Tickets, rewards and brand breaks</h2>
      <p class="zsmall" style="margin-top:0">You can change these until the first number is called.</p>
      <label for="rnd">Rounds (each round is a full game of 90 numbers with new tickets; a short wait separates them)</label><select id="rnd">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${(c.rounds || 1) === n ? "selected" : ""}>${n} round${n === 1 ? "" : "s"}</option>`).join("")}</select>
      <label for="tix">Tickets for each participant</label><select id="tix"><option value="1" ${c.tickets === 1 ? "selected" : ""}>1 ticket</option><option value="2" ${c.tickets === 2 ? "selected" : ""}>2 tickets</option></select>
      <label for="rw">What each house wins: one per line, like <code>full: Gift hamper</code>. Write a house twice for a 2nd reward. Houses: early5, top, mid, bot, corners, star, full, and full2 (Full Two-Ticket House, needs 2 tickets). Only houses you list are in play.</label>
      <textarea id="rw" rows="6" style="width:100%;box-sizing:border-box;font-size:15px;border:1px solid var(--line);border-radius:10px;padding:8px">${esc(rewardsToText(c))}</textarea>
      <label style="margin-top:14px">Brand breaks (up to 3): the numbers pause while your message or video is shown</label>${rows}
      <button class="zbtn s" id="savecfg">Save</button></div>`;
  }
  function readSettings() {
    const tickets = Number(document.getElementById("tix").value);
    const rewards = textToRewards(document.getElementById("rw").value, tickets);
    const breaks = [];
    for (let i = 0; i < 3; i++) {
      const g = (k) => (document.querySelector(`[data-bk="${k}"][data-i="${i}"]`) || {}).value || "";
      if (!g("after") && !g("seconds") && !g("title") && !g("mediaUrl")) continue;
      const b = { after: Number(g("after")), seconds: Number(g("seconds")), kind: g("kind") || "speech", title: g("title").trim() };
      if (g("mediaUrl").trim()) b.mediaUrl = g("mediaUrl").trim();
      if (b.kind === "lucky") { b.winners = Number(g("winners") || 3); if (g("style") === "scratch") b.style = "scratch"; }
      breaks.push(b);
    }
    return { tickets, rewards, breaks, rounds: Number(document.getElementById("rnd").value) };
  }
  /** Published but not paid: the one thing that matters now. The organizer sent the link to everyone, so the engagement must start. */
  function payDueCard() {
    if (!S.unpaid || S.draft || !S.info) return "";
    const at = S.info.startMs, left = Math.round((at - Date.now()) / 1000);
    const when = new Date(at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const waiting = S.people.length;
    const fmtLeft = (s) => (s >= 86400 ? Math.floor(s / 86400) + " d " + Math.floor((s % 86400) / 3600) + " h" : s >= 3600 ? Math.floor(s / 3600) + " h " + Math.floor((s % 3600) / 60) + " min" : Math.max(0, Math.floor(s / 60)) + " min");
    const people = waiting ? `<b>${waiting} ${waiting === 1 ? "person has" : "people have"} already joined your link.</b> ` : "Your link is live. ";
    if (S.locked || left <= 0) return `<div class="zcard" style="border:3px solid #b3261e;background:#fff4f2"><h2 style="color:#b3261e;margin:0 0 6px">Your engagement could not begin: payment is due</h2><p style="margin:0 0 10px">${people}They are waiting, and nothing will start until you pay. <b>Pay now and it begins in about 3 minutes, for everyone already waiting.</b></p><a class="zbtn" href="/pay.html?e=${encodeURIComponent(eid)}" style="text-decoration:none;display:inline-block;background:#b3261e">Pay now and start</a></div>`;
    return `<div class="zcard" style="border:3px solid #c9a24a;background:#fffaf0"><h2 style="margin:0 0 6px">Last step: pay before the start</h2><p style="margin:0 0 6px">${people}Your engagement starts <b>${esc(when)}</b> (in ${fmtLeft(left)}).</p><p style="margin:0 0 10px"><b>If payment is not made before then, the engagement will not begin</b> and everyone you invited will be left waiting. It takes about 2 minutes.</p><a class="zbtn" href="/pay.html?e=${encodeURIComponent(eid)}" style="text-decoration:none;display:inline-block">Pay now</a></div>`;
  }
  /** A message to every phone and the big screen (organizer or co-host). */
  function announceCard() {
    if (S.draft) return "";
    const avail = !!S.cf;
    const chips = ["Please take your seats", "Dinner is served", "Rewards at the stage in 10 minutes", "We start in 5 minutes"];
    return `<div class="zcard zform"><h2>Message to everyone</h2><p class="zsmall" style="margin-top:0">${avail ? "Shown and spoken on every phone and on the big screen. It reaches phones within about a minute." : (S.info && S.info.cap > 2000 ? "Messages are available for engagements of up to 2,000 participants." : "Messages become available once this engagement is set up.")}</p>
      <textarea id="annText" rows="2" maxlength="160" placeholder="Write a short message" style="width:100%;box-sizing:border-box;font-size:15px;border:1px solid var(--line);border-radius:10px;padding:8px"></textarea>
      <div>${chips.map((c) => `<button class="zbtn s alt" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      <button class="zbtn s" id="annSend" ${avail ? "" : "disabled"}>Send to everyone</button><button class="zbtn s alt" id="annClear" ${avail ? "" : "disabled"}>Clear message</button>${S.annNote ? `<p class="zsmall"><b>${esc(S.annNote)}</b></p>` : ""}</div>`;
  }
  function hostsCard() {
    if (S.draft || S.role === "host") return "";
    return `<div class="zcard"><h2>Co-host</h2><p class="zsmall" style="margin-top:0">Invite someone to stand on stage with you. They can watch this engagement and send messages to everyone. They cannot change anything, see phone numbers, publish or pay.</p>
      ${S.hostLink ? `<div class="zlink">${esc(S.hostLink)}</div><button class="zbtn s alt" id="hostcopy">Copy co-host link</button><p class="zsmall">It is shown only now. You can retire it any time from your keys on the home page.</p>` : `<button class="zbtn s" id="hostmake">Create a co-host link</button>`}</div>`;
  }
  /** What a co-host sees: the numbers, who is here, the big screen, and the message box. Nothing that changes anything. */
  function hostView() {
    const link = location.origin + "/z.html?e=" + encodeURIComponent(eid);
    return `<div class="zhead"><b>Co-host · ${esc(eid)}</b></div>
      ${S.note ? `<div class="zbanner info">${esc(S.note)}</div>` : ""}
      <div class="zcard"><h2>Share with participants</h2><div class="zlink">${esc(link)}</div><a class="zbtn s alt" href="/big.html?e=${encodeURIComponent(eid)}" target="_blank" rel="noopener">Open the big screen</a></div>
      <div class="zgrid"><div class="zcard"><h2>Participants</h2><div class="zstat">${S.people.length}</div></div><div class="zcard"><h2>Numbers called</h2><div class="zstat">${S.log.length} / 90</div></div></div>
      ${announceCard()}
      <div class="zcard"><p class="zsmall" style="margin:0">You are signed in as a co-host. The organizer controls the rest.</p></div>`;
  }
  function engView() {
    if (S.role === "host") return hostView();
    const link = location.origin + (BASE ? "" : "") + "/z.html?e=" + encodeURIComponent(eid) + (BASE ? "&api=" + encodeURIComponent(BASE) : "");
    const bad = S.checked ? S.checked.bad.length : 0;
    const c = S.control;
    const paused = c && c.pausedNow;
    return `<div class="zhead"><b>Engagement ${esc(eid)}</b><button class="zsnd" id="back">All engagements</button></div>
      ${S.note ? `<div class="zbanner info">${esc(S.note)}</div>` : ""}
      ${payDueCard()}
      ${announceCard()}${hostsCard()}
      ${S.draft ? `<div class="zcard" style="border:2px solid #c9a24a"><h2>Your engagement is a draft</h2><p class="zsmall" style="margin-top:0">Set it up first (by hand or with your AI) and watch it take shape here. Participants cannot see or join a draft. When you are happy with it, publish it: <b>publishing is free</b>. You confirm your details, get your link, and send it to everyone. You pay before the start time, and it begins the moment you have.</p>${S.pubOpen ? `<label for="pubEmail">Your email (for the invoice)</label><input id="pubEmail" type="email" value="${esc(S.contact.email)}" autocomplete="email"><label for="pubPhone">Your mobile number</label><input id="pubPhone" type="tel" value="${esc(S.contact.phone)}" autocomplete="tel" placeholder="98765 43210"><button class="zbtn" id="pubgo">Confirm and publish</button><button class="zbtn s alt" id="pubcancel">Back</button>` : `<button class="zbtn" id="publishopen">Publish my engagement, free</button>`}${S.pubNote ? `<p class="zsmall"><b>${esc(S.pubNote)}</b></p>` : ""}</div>` : `<div class="zcard"><h2>Share with participants</h2><div class="zlink">${esc(link)}</div><button class="zbtn s alt" id="copy">Copy link</button><a class="zbtn s alt" href="/big.html?e=${encodeURIComponent(eid)}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block">Open the big screen</a><p class="zsmall">The big screen shows the numbers to a whole room on a projector or TV. Open it on the laptop that is connected to the screen.</p></div>`}
      <div class="zgrid"><div class="zcard"><h2>Participants</h2><div class="zstat">${S.people.length}</div></div><div class="zcard"><h2>Numbers called${S.cfg.rounds > 1 ? " · round " + S.round + " of " + S.cfg.rounds : ""}</h2><div class="zstat">${S.log.length} / 90</div></div></div>
      ${(S.reqs || []).length ? `<div class="zcard"><h2>Your AI assistant is asking</h2>${S.reqs.map((r) => `<div class="zrow"><span>${esc(r.action)}${r.note ? " · " + esc(r.note) : ""}</span></div>`).join("")}<button class="zbtn s" id="reqok">Approve (${esc(S.reqs[0].action)})</button><button class="zbtn s alt" id="reqno">Dismiss</button></div>` : ""}
      <div class="zcard zform"><h2>Invite list</h2>
        <label for="roster">Paste one person per line: name, mobile number</label><textarea id="roster" rows="4" style="width:100%;box-sizing:border-box;font-size:15px;border:1px solid var(--line);border-radius:10px;padding:8px"></textarea>
        <button class="zbtn s" id="addroster">Add to list</button>
        <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="closed" style="width:auto;min-height:0" ${S.closed ? "checked" : ""}> Invite only (people not on the list cannot join)</label></div>
      ${luckyAdminCard()}
      ${S.started && !S.draft ? "" : settingsCard()}
      <div class="zcard"><h2>Controls</h2>
        <button class="zbtn s" data-ctl="pause" ${paused ? "disabled" : ""}>Pause</button><button class="zbtn s alt" data-ctl="resume" ${paused ? "" : "disabled"}>Resume</button><button class="zbtn s bad" data-ctl="stop">End engagement</button>
        <p class="zsmall">${S.cf ? `A pause reaches every phone about ${Math.max(10, Math.round(S.cf.leadRounds * 3 / 5) * 5)} seconds after you press it: phones check in on a timer, and larger engagements check less often so they stay within the free plan.` : (S.info && S.info.cap > 2000 ? "Pause is available for engagements of up to 2,000 participants. This one is larger, so it runs without it." : "Pause becomes available once this engagement is set up.")} ${paused ? "<b>Paused now.</b>" : ""} ${S.ctlNote ? esc(S.ctlNote) : ""}</p></div>
      <div class="zcard"><h2>Rewards · from the public number log</h2>
        ${S.settledPreview.length ? S.settledPreview.map((s) => `<div class="zrow"><span>${esc(lineLabel(s))} · call ${s.idx + 1}</span><em>${s.pids.length} participant${s.pids.length === 1 ? "" : "s"}${s.names ? " · " + esc(s.names) : ""}</em></div>`).join("") : "<p class=zsmall>No pattern is complete yet.</p>"}
        <p class="zsmall">Claims received: ${S.claims.length}. ${bad ? `<b>${bad} not valid</b> (they do not match the public log and are ignored).` : "All claims so far match the public log."}</p>
        <button class="zbtn s" id="settle" ${S.settledPreview.length ? "" : "disabled"}>Publish now</button><span class="zsmall"> Results are also published automatically while this page is open.</span>
        <button class="zbtn s alt" id="csv" ${S.settledPreview.length ? "" : "disabled"}>Download report</button></div>
      <div class="zcard zform"><h2>Change of phone</h2>
        <p class="zsmall" style="margin-top:0">A ticket plays on one phone only. If someone lost or changed their phone, enter their mobile number: the next phone they join with keeps their ticket.</p>
        <label for="ubph">Their mobile number</label><input id="ubph" inputmode="tel" autocomplete="off" placeholder="98765 43210"><button class="zbtn s" id="unbind">Let them move to a new phone</button></div>
      <div class="zcard"><h2>Participant data</h2><button class="zbtn s alt" id="erase">Erase all participant data for this engagement</button>
        <p class="zsmall">Participant data is kept for 365 days and then deleted automatically. You can erase it sooner at any time.</p></div>`;
  }
  function draw(v) { $app.innerHTML = v; bind(); }

  async function refreshHome() { try { S.keys = (await call("GET", "/api/org/keys")).keys; } catch { S.keys = []; } try { S.sugs = (await call("GET", "/api/z/suggestions")).suggestions.slice(0, 6); } catch { S.sugs = []; } try { S.history = await call("GET", "/api/history"); } catch (e) { if (e.status === 403) { secret = ""; return draw(loginView("That organizer key was not accepted.")); } } draw(homeView()); }

  async function refreshEng() {
    try {
      S.info = await call("GET", `/api/z/${eid}/info`); S.draft = !!S.info.draft; S.unpaid = !!S.info.unpaid; S.locked = !!S.info.locked;
      let pr = await call("GET", `/api/z/${eid}/participants`); S.people = pr.participants; S.closed = pr.closed;
      while (S.people.length < pr.total) { const more = await call("GET", `/api/z/${eid}/participants?offset=${S.people.length}`); if (!more.participants.length) break; S.people.push(...more.participants); } // a long list arrives in pages
      S.cfg = { tickets: pr.tickets, rewards: pr.rewards, breaks: pr.breaks, rounds: pr.rounds || 1 };
      S.claims = S.role === "host" ? [] : (await call("GET", `/api/z/${eid}/claims`)).claims;
      try { S.reqs = S.role === "host" ? [] : (await call("GET", `/api/z/${eid}/control/request`)).requests; } catch { S.reqs = []; }
      if (!S.started && !S.draft && S.role !== "host") { try { const k = await TBControl.ensureKey(eid, { token: secret, base: BASE, prefix: "/api/z" }); if (!k.ok && !S.ctlNote) S.ctlNote = k.reason || ""; } catch { /* the pause is optional; the engagement does not depend on it */ } } // an engagement made by the AI has no pause key until the organizer opens it here
      const cf0 = await fetch(BASE + `/api/z/${eid}/control`).then((r) => (r.ok ? r.json() : null)); const cf = cf0 && cf0.pubKey ? cf0 : null; // a held (unpaid) engagement answers {locked:true} with no signing key: that is not a pause file
      S.control = null; S.cf = cf;
      const now = await latestRound();
      let st = null;
      if (cf) { st = ZG.resolveControl(ZG.cfgOf(cf), cf.messages); S.st = st; S.control = { pausedNow: now !== null && st.intervals.some((i) => now >= i.start && now < i.end) }; } else S.st = null;
      const stride = S.info.callSeconds / 3;
      const schedOf = (r) => Array.from({ length: 90 }, (_, k) => ZG.callRoundR(st, S.info.startRound + ZG.GRACE_ROUNDS, stride, S.cfg.breaks, r, k));
      S.started = now !== null && now >= S.info.startRound + ZG.GRACE_ROUNDS;
      try { S.published = (await fetch(BASE + `/api/z/${eid}/results`).then((r) => r.json())).results || []; } catch { S.published = S.published || []; }
      if (!S.store) S.store = new ZG.RoundStore({});
      S.logs = {}; let budget = 60; // catch up quickly when the console is opened late
      for (let r = 1; r <= S.cfg.rounds; r++) {
        const sched = schedOf(r);
        const upto = sched.filter((x) => x !== null && now !== null && !S.locked && x <= now); // held for non-payment: nothing is shown to anyone, the organizer included
        const need = upto.filter((x) => !S.store.rounds.has(x)).slice(0, budget); budget -= need.length;
        await Promise.all(need.map((x, i) => (now - x <= 2 ? S.store.fetchLive(x, i) : S.store.fetchBackfill(x, i))));
        S.logs[r] = ZG.logFrom(ZG.roundEid(eid, r), sched.filter((x) => x !== null), S.store, upto.length);
      }
      S.store.verifySome(3);
      S.round = Math.max(1, ...Object.keys(S.logs).filter((r) => S.logs[r].length > 0).map(Number));
      S.log = S.logs[S.round] || [];
      const pids = S.people.map((p) => p.pid);
      S.checked = ZG.checkClaims(eid, S.claims.map((c) => ({ pid: c.pid, pattern: c.pattern, idx: c.idx, round: c.round })), S.logs, S.cfg);
      const nm = new Map(S.people.map((p) => [p.pid, p.name]));
      S.settledPreview = [];
      for (let r = 1; r <= S.cfg.rounds; r++) if (S.logs[r].length) S.settledPreview.push(...ZG.settleAll(eid, pids, S.logs[r], S.cfg, r).map((s) => ({ ...s, names: s.pids.length <= 3 ? s.pids.map((p) => nm.get(p) || "Participant").join(", ") : "" })));
      S.lucky = await computeLucky(now);
      if (S.role !== "host" && !S.locked) await autoPublish(); // winners hear without anyone pressing a button
    } catch (e) { S.note = e.status === 404 ? "That engagement was not found." : e.status === 403 ? "Your sign-in has expired or does not belong to this engagement. Open the home page and sign in again." : "Could not refresh. Retrying…"; }
    if (eid) draw(S.cfg && S.info ? engView() : `<div class="zhead"><b>Engagement ${esc(eid)}</b><button class="zsnd" id="back">All engagements</button></div><div class="zbanner info">${esc(S.note || "Loading…")}</div>`);
  }

  function bind() {
    const $ = (id) => document.getElementById(id);
    if ($("goLogin")) $("goLogin").onclick = () => { try { sessionStorage.setItem("ctz-next", location.pathname + location.search); } catch {} };
    if ($("in")) $("in").onclick = () => { secret = $("sec").value.trim(); ss.set("ctz-org", secret); refreshHome(); };
    if ($("mk")) $("mk").onclick = async () => {
      $("mk").disabled = true;
      try {
        const now = await latestRound();
        if (now === null) throw new Error("Could not read the public clock. Check your connection.");
        const id = "E" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
        await call("POST", "/api/z", { id, startRound: now + Math.round(Number($("mins").value) * 20) + 20, callSeconds: Number($("spd").value), cap: Number($("cap").value) });
        const k = await TBControl.ensureKey(id, { token: secret, base: BASE, prefix: "/api/z" });
        S.note = k.ok ? "" : "Created, but pause control is unavailable: " + (k.reason || "");
        eid = id; history.replaceState(null, "", "?e=" + id + (BASE ? "&api=" + encodeURIComponent(BASE) : "")); S.store = null; refreshEng();
      } catch (e) { S.note = e.message; draw(homeView()); }
    };
    if ($("publishopen")) $("publishopen").onclick = () => { S.pubOpen = true; S.pubNote = ""; draw(engView()); };
    if ($("pubcancel")) $("pubcancel").onclick = () => { S.pubOpen = false; draw(engView()); };
    if ($("pubEmail")) $("pubEmail").oninput = (e) => { S.contact.email = e.target.value; };
    if ($("pubPhone")) $("pubPhone").oninput = (e) => { S.contact.phone = e.target.value; };
    if ($("pubgo")) $("pubgo").onclick = async () => {
      $("pubgo").disabled = true;
      try { await call("POST", `/api/z/${eid}/publish`, { email: S.contact.email.trim(), phone: S.contact.phone }); ss.set("ctz-email", S.contact.email.trim()); ss.set("ctz-phone", S.contact.phone); S.pubOpen = false; S.note = "Published. Send the link below to your participants. Please pay before the start time, or the engagement will not begin."; }
      catch (e) {
        ss.set("ctz-email", S.contact.email.trim()); ss.set("ctz-phone", S.contact.phone);
        S.pubNote = e.message + (e.needPack ? " (a pack for up to " + e.needPack + " participants)" : "");
      }
      refreshEng();
    };
    document.querySelectorAll("[data-chip]").forEach((b) => (b.onclick = () => { const t = $("annText"); if (t) { t.value = b.dataset.chip; t.focus(); } }));
    if ($("annSend")) $("annSend").onclick = async () => {
      const t = ($("annText").value || "").trim(); if (!t) { S.annNote = "Write a message first."; return draw(engView()); }
      try { await call("POST", `/api/z/${eid}/announce`, { text: t }); S.annNote = "Sent. Phones show and speak it within about a minute."; } catch (e) { S.annNote = e.message; }
      refreshEng();
    };
    if ($("annClear")) $("annClear").onclick = async () => { try { await call("POST", `/api/z/${eid}/announce`, { text: "" }); S.annNote = "Message cleared."; } catch (e) { S.annNote = e.message; } refreshEng(); };
    if ($("hostmake")) $("hostmake").onclick = async () => { try { const r = await call("POST", "/api/org/host", {}); S.hostLink = `${location.origin}/zc.html?e=${encodeURIComponent(eid)}#host=${r.hostKey}`; } catch (e) { S.note = e.message; } draw(engView()); };
    if ($("hostcopy")) $("hostcopy").onclick = () => { try { navigator.clipboard.writeText(S.hostLink); $("hostcopy").textContent = "Copied"; } catch {} };
    document.querySelectorAll("[data-hist]").forEach((b) => (b.onclick = () => { S.showHist = !S.showHist; draw(homeView()); }));
    document.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => { eid = b.dataset.open; S.store = null; refreshEng(); }));
    document.querySelectorAll("[data-reuse]").forEach((b) => (b.onclick = async () => {
      // a new engagement that starts with the earlier roster already on it
      try {
        const now = await latestRound(); const id = "E" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => "abcdefghjkmnpqrstuvwxyz23456789"[x % 31]).join("");
        const old = S.history.engagements.find((e) => e.id === b.dataset.reuse);
        await call("POST", "/api/z", { id, startRound: now + 20 * 20, callSeconds: old.call_seconds, cap: Math.max(old.participants + 50, 500) });
        const r = await call("POST", `/api/z/${id}/reuse`, { from: b.dataset.reuse });
        await TBControl.ensureKey(id, { token: secret, base: BASE, prefix: "/api/z" });
        S.note = `Created with ${r.copied} participants from the earlier engagement. It starts in 20 minutes; participants use the new link.`; eid = id; S.store = null; refreshEng();
      } catch (e) { S.note = e.message; draw(homeView()); }
    }));
    if ($("back")) $("back").onclick = () => { eid = ""; history.replaceState(null, "", location.pathname + (BASE ? "?api=" + encodeURIComponent(BASE) : "")); S.note = ""; refreshHome(); };
    if ($("copy")) $("copy").onclick = () => navigator.clipboard && navigator.clipboard.writeText(document.querySelector(".zlink").textContent);
    document.querySelectorAll("[data-ctl]").forEach((b) => (b.onclick = async () => {
      const action = b.dataset.ctl;
      if (action === "stop" && !confirm("End this engagement for everyone? This cannot be undone.")) return;
      try { const r = await TBControl.publish(eid, { token: secret, base: BASE, prefix: "/api/z" }, action, action === "pause" ? { pauseForRounds: 600 } : {}); S.ctlNote = r.status === 200 ? action[0].toUpperCase() + action.slice(1) + " sent. Phones follow within about 40 seconds." : (r.data && r.data.error) || "Not accepted."; } catch (e) { S.ctlNote = e.message; }
      refreshEng();
    }));
    if ($("settle")) $("settle").onclick = async () => { try { const all = S.settledPreview.map(({ pattern, ordinal, round, idx, pids }) => ({ pattern, ordinal, round, idx, pids })); for (let i = 0; i < all.length; i += 40) await call("POST", `/api/z/${eid}/settle`, { results: all.slice(i, i + 40) }); S.note = "Results published to participants."; } catch (e) { S.note = e.message; } refreshEng(); };
    if ($("unbind")) $("unbind").onclick = async () => { try { await call("POST", `/api/z/${eid}/unbind`, { phone: $("ubph").value }); S.note = "Done. The next phone they join with keeps their ticket."; } catch (e) { S.note = e.message; } refreshEng(); };
    if ($("csv")) $("csv").onclick = () => {
      const nm = new Map(S.people.map((p) => [p.pid, p.name || ""]));
      const rows = [["Reward", "Call number", "Participant"]];
      for (const s of S.settledPreview) for (const p of s.pids) rows.push([lineLabel(s), s.idx + 1, nm.get(p) || p]);
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(",")).join("\n")], { type: "text/csv" })); a.download = eid + "-rewards.csv"; a.click();
    };
    document.querySelectorAll("[data-retire]").forEach((b) => (b.onclick = async () => { if (!confirm("Retire this key? It will stop working at once.")) return; try { await call("POST", "/api/org/keys/revoke", { id: b.dataset.retire }); S.note = "Key retired."; } catch (e) { S.note = e.message; } refreshHome(); }));
    if ($("aimake")) $("aimake").onclick = async () => {
      try { const r = await call("POST", "/api/org/ai", {}); S.aiMsg = r.aiMessage; ss.set("ctz-aimsg", r.aiMessage); } catch (e) { S.note = e.message; }
      draw(homeView());
    };
    if ($("aicopy")) $("aicopy").onclick = () => { try { navigator.clipboard.writeText(S.aiMsg); $("aicopy").textContent = "Copied. Now paste it into your AI chat"; } catch {} };
    if ($("airevoke")) $("airevoke").onclick = async () => { try { await call("POST", "/api/org/ai/revoke", {}); S.aiMsg = ""; ss.set("ctz-aimsg", ""); S.note = "Your AI work link has been stopped."; } catch (e) { S.note = e.message; } draw(homeView()); };
    if ($("reqok")) $("reqok").onclick = async () => {
      const r = S.reqs[0];
      try { const x = await TBControl.publish(eid, { token: secret, base: BASE, prefix: "/api/z" }, r.action, r.action === "pause" ? { pauseForRounds: 600 } : {}); S.ctlNote = x.status === 200 ? r.action + " sent." : (x.data && x.data.error) || "Not accepted."; await call("POST", `/api/z/${eid}/control/request/clear`, {}); } catch (e) { S.ctlNote = e.message; }
      refreshEng();
    };
    if ($("reqno")) $("reqno").onclick = async () => { try { await call("POST", `/api/z/${eid}/control/request/clear`, {}); } catch {} refreshEng(); };
    if ($("addroster")) $("addroster").onclick = async () => {
      const people = $("roster").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)[,;\t ]+([+0-9][0-9 +()-]{8,})$/); return m ? { name: m[1].trim(), phone: m[2] } : { name: "", phone: l }; });
      let added = 0, invalid = 0;
      try { for (let i = 0; i < people.length; i += 100) { const r = await call("POST", `/api/z/${eid}/roster`, { people: people.slice(i, i + 100) }); added += r.added; invalid += r.invalid; } S.note = added + " added" + (invalid ? ", " + invalid + " not valid (check the numbers)" : "") + "."; } catch (e) { S.note = e.message; }
      refreshEng();
    };
    if ($("closed")) $("closed").onchange = async () => { try { await call("PATCH", `/api/z/${eid}/settings`, { closed: $("closed").checked }); S.note = $("closed").checked ? "Only people on the list can join." : "Anyone with the link can join."; } catch (e) { S.note = e.message; } refreshEng(); };
    document.querySelectorAll("[data-lucky]").forEach((b) => (b.onclick = async () => {
      const i = Number(b.dataset.lucky); const d = S.lucky[i];
      try { await call("POST", `/api/z/${eid}/settle`, { results: [{ pattern: "lucky", ordinal: i + 1, idx: S.cfg.breaks.filter((x) => x.kind === "lucky")[i].after, pids: d.winners }] }); S.note = "Lucky draw winners published."; } catch (e) { S.note = e.message; }
      refreshEng();
    }));
    if ($("savecfg")) $("savecfg").onclick = async () => {
      try { const v = readSettings(); const r = await call("PATCH", `/api/z/${eid}/settings`, v); S.cfg = { tickets: r.tickets, rewards: r.rewards, breaks: r.breaks, rounds: r.rounds || 1 }; S.note = "Saved."; } catch (e) { S.note = e.message; }
      refreshEng();
    };
    if ($("erase")) $("erase").onclick = async () => { if (!confirm("Erase all participant data for this engagement? This cannot be undone.")) return; try { const r = await call("POST", `/api/z/${eid}/erase`, {}); S.note = r.erased + " participants erased."; } catch (e) { S.note = e.message; } refreshEng(); };
  }

  (async () => {
    if (secret) { try { S.role = (await call("GET", "/api/whoami")).kind === "host" ? "host" : ""; } catch { /* an old or wrong key is handled by the screens below */ } }
    if (!secret) draw(loginView(""));
    else if (S.role === "host" && !eid) draw(`<div class="zhead"><b>Co-host</b></div><div class="zcard"><p style="margin:0">Open the co-host link your organizer sent you. It opens the engagement directly.</p></div>`);
    else if (eid) refreshEng(); else refreshHome();
  })();
  setInterval(() => { const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; /* never wipe what the organizer is typing */ if (!secret || document.hidden) return; if (eid) refreshEng(); else if (S.role !== "host") refreshHome(); }, 5000);
  window.__zc = S;
})();
