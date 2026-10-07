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
  // Seven ways to hand the paste to an AI: three open the AI with the paste pre-filled (a web address), three copy it and open the site (Ctrl+V, Send), one plain copy.
  const AIOPEN = [["ChatGPT", "https://chatgpt.com/?q="], ["Grok", "https://grok.com/?q="], ["Claude", "https://claude.ai/new?q="]];
  const AICOPY = [["Gemini", "https://gemini.google.com/app?q="], ["DeepSeek", "https://chat.deepseek.com/"], ["z.ai", "https://chat.z.ai/"]];
  const aiOptions = (paste) => `<div class="zsmall" style="font-weight:700;margin:12px 0 6px">Open your AI with this already filled in</div><div style="display:flex;flex-wrap:wrap;gap:8px">${AIOPEN.map(([n, u]) => `<a class="zbtn s" data-ai="${n}" href="${u}${encodeURIComponent(paste)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block">${n}</a>`).join("")}</div>
    <div class="zsmall" style="font-weight:700;margin:12px 0 6px">Copy it and open your AI, then press Ctrl+V and Send</div><div style="display:flex;flex-wrap:wrap;gap:8px">${AICOPY.map(([n, u]) => `<button class="zbtn s alt" type="button" data-aicopy="${n}" data-url="${u}${n === "Gemini" ? encodeURIComponent(paste) : ""}">${n}</button>`).join("")}</div><div class="zsmall" id="aicopied" role="status" style="margin-top:6px;font-weight:700;color:#0b6b3a"></div>`;
  const wireAiOptions = (root, paste) => root.querySelectorAll("[data-aicopy]").forEach((b) => (b.onclick = async () => {
    let ok = false; try { await navigator.clipboard.writeText(paste); ok = true; } catch {}
    const m = root.querySelector("#aicopied"); if (m) m.textContent = ok ? "Copied. Press Ctrl+V, then Send" : "Could not copy here: select the box above, copy it, then open " + b.dataset.aicopy + " and paste.";
    try { window.open(b.dataset.url, "_blank", "noopener,noreferrer"); } catch {}
  }));
  function optionsCard() {
    const ai = S.aiMsg
      ? `<textarea class="zlink" id="aimsg" rows="4" readonly style="width:100%;box-sizing:border-box">${esc(S.aiMsg)}</textarea><button class="zbtn" id="aicopy" style="margin-top:8px">Copy my AI work link</button>${aiOptions(S.aiMsg)}<button class="zbtn s alt" id="aifresh">Get a fresh AI link</button><button class="zbtn s alt" id="aireplace">Replace my AI link</button><button class="zbtn s alt" id="airevoke">Stop this link</button><p class="zsmall" style="margin:8px 0 0"><b>Fresh link</b>: e-mailed, works 24 hours. <b>Replace</b>: stops every old link.</p>`
      : `<button class="zbtn" id="aimake">Get my AI work link</button>`;
    return `<div class="zcard" style="border:2px solid #c9a24a;background:#fffaf0"><div class="zsmall" style="font-weight:700;letter-spacing:.06em;color:#8a6a1a">OPTION 1 · THE EASY WAY · MOST ORGANIZERS CHOOSE THIS</div>
      <h2 style="margin:6px 0 8px;font-size:22px">Let your free AI assistant do the work.</h2>
      <p style="margin:0 0 10px">Copy your AI work link and paste it into <b>ChatGPT, Gemini, Grok, Claude, DeepSeek, Z.ai</b> or any AI chat.</p>
      <p style="margin:0 0 10px">It sets everything up. You keep four things: payment, Publish, erasing data, pause or stop.</p>
      ${ai}
      <hr style="border:0;border-top:1px solid #e6d9b8;margin:16px 0">
      <div class="zsmall" style="font-weight:700;letter-spacing:.06em;color:#555">OPTION 2 · DO IT YOURSELF</div>
      <p style="margin:6px 0 8px">Prefer to click? Create your engagement by hand.</p>
      <a class="zbtn s alt" href="#newform" style="text-decoration:none;display:inline-block">Create engagement manually ↓</a>
      <p class="zsmall" style="margin:12px 0 0">New here? <a href="/demo.html" target="_blank" rel="noopener">Try the free 70-second demo</a> first: a real mini-game, nothing to type.</p></div>`;
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
      <button class="zbtn" id="mk">Create engagement</button><p class="zsmall">You build it first, at no cost. Payment is asked only when you publish. The first number is called two minutes after the start time. Numbers come from public randomness that nobody, including us, can know in advance.</p></div>
      ${(S.keys || []).length ? `<div class="zcard"><h2>Your sign-in keys</h2>${S.keys.map((k) => `<div class="zrow"><span>${k.kind === "ai" ? "AI assistant link" : "Organizer key"} · made ${new Date(k.created_ms).toLocaleDateString()}${k.thisOne ? " · in use now" : ""}</span>${k.revoked ? `<i>retired</i>` : k.thisOne ? `<i>active</i>` : `<button class="zbtn s alt" data-retire="${k.id}">Retire</button>`}</div>`).join("")}<p class="zsmall">If you ever lose a key or think someone has it, sign in with another one and retire it here.</p></div>` : ""}
      ${(S.sugs || []).length ? `<div class="zcard"><h2>Ideas to improve Corporate Tambola</h2><p class="zsmall" style="margin-top:0">Suggested by organizers' AI assistants. We review them all.</p>${S.sugs.map((x) => `<div class="zrow"><span>${esc(x.title)}${x.yours ? " · yours" : ""}</span><i>${x.votes} · ${esc(x.status.replace("_", " "))}</i></div>`).join("")}</div>` : ""}
      <div class="zcard"><h2>Close my organizer account</h2><p class="zsmall" style="margin-top:0">This deletes your account and all your engagements. Payment records stay, as the law requires. It cannot be undone.</p><button class="zbtn s alt" id="closeacct">Close my organizer account</button></div>
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
    return `<div class="zcard"><h2>Lucky draws</h2>${L.map((b, i) => { const d = S.lucky && S.lucky[i]; const done = (S.published || []).some((r) => r.pattern === "lucky" && r.ordinal === i + 1); return `<div class="zrow"><span>${esc(b.title)} · ${b.winners || 3} ${(b.winners || 3) === 1 ? "person" : "people"}</span>${done ? `<em>Decided</em>` : d ? `<em>Being confirmed by the phones</em>` : `<i>after the break ends</i>`}</div>`; }).join("")}
      <p class="zsmall">The software picks the winners from everyone who joined, using public random numbers. You and we cannot choose them. A winner is confirmed when several phones agree.</p></div>`;
  }
  async function namesFor(ids) {
    const nm = S.nameCache || (S.nameCache = new Map()), want = ids.filter((p) => !nm.has(p));
    for (let i = 0; i < want.length; i += 50) { try { const r = await call("GET", `/api/z/${eid}/names?pids=${want.slice(i, i + 50).join(",")}`); for (const [k, v] of Object.entries(r.names || {})) nm.set(k, v); } catch { /* shown as Participant */ } }
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
      const winners = ZG.luckyWinners(eid, L[i].after, x.randomness, S.people.filter((p) => !(p.jr > 0) || ZG.countFromOf(p.jr) <= round).map((p) => p.pid), L[i].winners || 3); // only people whose numbers counted by then
      out.push({ winners, published: (S.published || []).some((r) => r.pattern === "lucky" && r.ordinal === i + 1) });
    }
    return out;
  }
  /** The organizer's invitation policy: whether participants may invite, how many each, and which kinds of guests. */
  function invitesBlock(c) {
    const iv = c.invites || { on: false, per: 4, cats: ["family", "colleagues"] };
    const boxes = (ZG.INVITE_CATEGORIES || []).map((k) => `<label style="display:flex;gap:6px;align-items:center;margin:2px 0;font-weight:400"><input type="checkbox" data-invcat="${k.id}" style="width:auto;min-height:0" ${iv.cats.includes(k.id) ? "checked" : ""}> ${esc(k.label)}</label>`).join("");
    return `<div style="margin-top:14px;padding:10px 12px;border:1px solid var(--line);border-radius:10px"><label style="display:flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" id="invon" style="width:auto;min-height:0" ${iv.on ? "checked" : ""}> Let participants invite their colleagues / family members</label>
      <p class="zsmall" style="margin:4px 0 8px">Each person gets an Invite button with their own link. You decide how many people each can invite and who. The organizer, hosts and co-hosts can invite any number. Guests can invite in turn, so a chain forms and the report shows who invited whom.</p>
      <label for="invper">Most people one participant can invite</label><input id="invper" type="number" min="1" max="4" value="${iv.per}" style="max-width:90px">
      <div class="zsmall" style="margin:8px 0 2px">Kinds of guests they can invite</div><div style="columns:2;column-gap:16px">${boxes}</div></div>`;
  }
  function settingsCard() {
    const c = S.cfg || ZG.defaultCfg();
    const KINDS = { speech: "Message to read out", slides: "Slides", youtube: "YouTube link", file: "Video or audio file link", lucky: "Lucky draw" };
    const kindOpts = (sel, withLucky) => Object.keys(KINDS).filter((k) => withLucky || k !== "lucky").map((k) => `<option value="${k}" ${sel === k ? "selected" : ""}>${KINDS[k]}</option>`).join("");
    const slotRow = (grp, i, b, o) => `<div class="zgrid bmrow" data-grp="${grp}" data-row="${i}" style="margin-bottom:8px;padding:8px;border:1px dashed var(--line);border-radius:10px">
      <div><label>What is it</label><select data-${grp}="kind" data-i="${i}">${kindOpts(b.kind, o.lucky)}</select></div>
      <div><label>Your message or title (up to 80 characters)</label><input data-${grp}="title" data-i="${i}" maxlength="80" value="${esc(b.title || "")}"></div>
      ${o.seconds ? `<div><label>How long (seconds)</label><input type="number" min="15" max="${o.seconds}" step="3" data-${grp}="seconds" data-i="${i}" value="${b.seconds ?? 60}"></div>` : ""}
      ${o.lucky ? `<div><label>Lucky draw: how it is shown</label><select data-${grp}="style" data-i="${i}"><option value="draw" ${b.style !== "scratch" ? "selected" : ""}>A draw</option><option value="scratch" ${b.style === "scratch" ? "selected" : ""}>A scratch card</option></select></div>
      <div><label>Lucky draw: how many people win</label><select data-${grp}="winners" data-i="${i}">${[1, 3, 5, 10].map((n) => `<option value="${n}" ${(b.winners || 3) === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>` : ""}
      <div style="grid-column:1/-1"><label>Video or audio link, if you have one (https://: a YouTube link, or a direct link to a video or audio file)</label><input data-${grp}="mediaUrl" data-i="${i}" value="${esc(b.mediaUrl || "")}"></div>
      <div style="grid-column:1/-1"><div class="zsmall" data-lk="${grp}${i}" style="margin:0 0 6px"></div><button type="button" class="zbtn s alt" data-test="${grp}" data-i="${i}">Test it like a real guest</button></div>
      ${o.legacy && b.after && !b.auto ? `<div style="grid-column:1/-1" class="zsmall">Set earlier to play after number ${b.after}. <label style="display:inline;font-weight:400"><input type="checkbox" data-bk="autoplace" data-i="${i}" style="width:auto;min-height:0"> Place it automatically instead</label><input type="hidden" data-bk="after" data-i="${i}" value="${b.after}"></div>` : ""}</div>`;
    const op = c.opening || [], cl = c.closing || [];
    const openRows = [0, 1].map((i) => slotRow("op", i, op[i] || {}, { seconds: 120 })).join("");
    const midRows = [0, 1, 2, 3, 4, 5].map((i) => slotRow("bk", i, c.breaks[i] || {}, { seconds: 600, lucky: true, legacy: true })).join("");
    const closeRows = [0, 1].map((i) => slotRow("cl", i, cl[i] || {}, {})).join("");
    return `<div class="zcard zform"><h2>Tickets, rewards and brand moments</h2>
      <p class="zsmall" style="margin-top:0">You can change these until the first number is called.</p>
      <label for="rnd">Rounds (each round is a full game of 90 numbers with new tickets; a short wait separates them)</label><select id="rnd">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${(c.rounds || 1) === n ? "selected" : ""}>${n} round${n === 1 ? "" : "s"}</option>`).join("")}</select>
      <label for="tix">Tickets for each participant</label><select id="tix"><option value="1" ${c.tickets === 1 ? "selected" : ""}>1 ticket</option><option value="2" ${c.tickets === 2 ? "selected" : ""}>2 tickets</option></select>
      <label for="rw">What each house wins: one per line, like <code>full: Gift hamper</code>. Write a house twice for a 2nd reward. Houses: early5, top, mid, bot, corners, star, full, and full2 (Full Two-Ticket House, needs 2 tickets). Only houses you list are in play.</label>
      <textarea id="rw" rows="6" style="width:100%;box-sizing:border-box;font-size:15px;border:1px solid var(--line);border-radius:10px;padding:8px">${esc(rewardsToText(c))}</textarea>
      <h3 style="margin:16px 0 4px;font-size:16px">Your brand moments</h3>
      <p class="zsmall" style="margin:0 0 4px">Show your own message, a video or audio on every guest's phone. You get 5 for each ticket each guest holds (5 with 1 ticket, 10 with 2). Use any one or more.</p>
      <div id="bmcount" class="zsmall" style="font-weight:700;margin:0 0 8px"></div>
      <label style="margin-top:8px">Before the game starts (plays while guests wait for the first number)</label><div data-sec="op">${openRows}</div>
      <label style="margin-top:8px">During the game (the numbers pause while it is shown). The software spreads them evenly: one goes about halfway, two at a third and two thirds, and so on.</label><div data-sec="bk">${midRows}</div>
      <label style="margin-top:8px">At the end of the game (plays on the final screen)</label><div data-sec="cl">${closeRows}</div>
      ${invitesBlock(c)}
      <button class="zbtn s" id="savecfg">Save</button></div>`;
  }
  function readSettings() {
    const tickets = Number(document.getElementById("tix").value);
    const rewards = textToRewards(document.getElementById("rw").value, tickets);
    const grab = (grp, i) => { const g = (k) => (document.querySelector(`[data-${grp}="${k}"][data-i="${i}"]`) || {}).value || ""; return g; };
    const row = (grp, i, extra) => {
      const g = grab(grp, i), row = document.querySelector(`.bmrow[data-grp="${grp}"][data-row="${i}"]`);
      if (!row || row.style.display === "none" || (!g("title").trim() && !g("mediaUrl").trim())) return null;
      const b = { kind: g("kind") || "speech", title: g("title").trim() };
      if (g("seconds")) b.seconds = Number(g("seconds"));
      if (g("mediaUrl").trim()) b.mediaUrl = g("mediaUrl").trim();
      if (extra) extra(b, g, i);
      return b;
    };
    const opening = [0, 1].map((i) => row("op", i)).filter(Boolean);
    const closing = [0, 1].map((i) => row("cl", i)).filter(Boolean);
    const breaks = [0, 1, 2, 3, 4, 5].map((i) => row("bk", i, (b, g) => {
      const auto = document.querySelector(`[data-bk="autoplace"][data-i="${i}"]`);
      if (g("after") && !(auto && auto.checked)) b.after = Number(g("after")); // an older break keeps its number unless the organizer lets the software place it
      if (b.kind === "lucky") { b.winners = Number(g("winners") || 3); if (g("style") === "scratch") b.style = "scratch"; }
    })).filter(Boolean);
    const cats = [...document.querySelectorAll("[data-invcat]")].filter((b) => b.checked).map((b) => b.dataset.invcat);
    const invites = { on: document.getElementById("invon").checked, per: Number(document.getElementById("invper").value) || 4, cats };
    return { tickets, rewards, breaks, opening, closing, rounds: Number(document.getElementById("rnd").value), invites };
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
    return `<div class="zhead"><b>Corporate Tambola · Co-host · ${esc(eid)}</b></div>
      ${S.note ? `<div class="zbanner info">${esc(S.note)}</div>` : ""}
      <div class="zcard"><h2>Share with participants</h2><div class="zlink">${esc(link)}</div><a class="zbtn s alt" href="/big.html?e=${encodeURIComponent(eid)}" target="_blank" rel="noopener">Open the big screen</a></div>
      <div class="zgrid"><div class="zcard"><h2>Participants</h2><div class="zstat">${S.people.length}</div></div><div class="zcard"><h2>Numbers called</h2><div class="zstat">${S.log.length} / 90</div></div></div>
      ${announceCard()}
      ${prizeCard()}
      ${S.life && S.life.reportSent && !S.life.purged ? `<div class="zcard"><h2>Engagement report</h2><p class="zsmall">The report is built on your own device. Open it and save the PDF before the participants' details are deleted.</p><button class="zbtn s" id="rptopen">Open the report</button></div>` : ""}
      <div class="zcard"><p class="zsmall" style="margin:0">You are signed in as a co-host. The organizer controls the rest.</p></div>`;
  }
  function engView() {
    if (S.role === "host") return hostView();
    const link = location.origin + (BASE ? "" : "") + "/z.html?e=" + encodeURIComponent(eid) + (BASE ? "&api=" + encodeURIComponent(BASE) : "");
    const bad = S.checked ? S.checked.bad.length : 0;
    const c = S.control;
    const paused = c && c.pausedNow;
    return `<div class="zhead"><b>Corporate Tambola · ${esc(eid)}</b><button class="zsnd" id="back">All engagements</button></div>
      ${S.note ? `<div class="zbanner info">${esc(S.note)}</div>` : ""}
      ${payDueCard()}
      ${announceCard()}${hostsCard()}
      ${S.draft ? `<div class="zcard" style="border:2px solid #c9a24a"><h2>Your engagement is a draft</h2><p class="zsmall" style="margin-top:0">Set it up first (by hand or with your AI) and watch it take shape here. Participants cannot see or join a draft. When you are happy with it, publish it: <b>publishing is free</b>. You confirm your details, get your link, and send it to everyone. You pay before the start time, and it begins the moment you have.</p>${S.pubOpen ? `<label for="pubEmail">Your email (for the invoice)</label><input id="pubEmail" type="email" value="${esc(S.contact.email)}" autocomplete="email"><label for="pubPhone">Your mobile number</label><input id="pubPhone" type="tel" value="${esc(S.contact.phone)}" autocomplete="tel" placeholder="98765 43210"><button class="zbtn" id="pubgo">Confirm and publish</button><button class="zbtn s alt" id="pubcancel">Back</button>` : `<button class="zbtn" id="publishopen">Publish my engagement, free</button>`}${S.pubNote ? `<p class="zsmall"><b>${esc(S.pubNote)}</b></p>` : ""}</div>` : `<div class="zcard"><h2>Share with participants</h2><div class="zlink">${esc(link)}</div><button class="zbtn s alt" id="copy">Copy link</button><a class="zbtn s alt" href="/big.html?e=${encodeURIComponent(eid)}" target="_blank" rel="noopener" style="text-decoration:none;display:inline-block">Open the big screen</a><p class="zsmall">The big screen shows the numbers to a whole room on a projector or TV. Open it on the laptop that is connected to the screen.</p></div>`}
      <div class="zgrid"><div class="zcard"><h2>Participants</h2><div class="zstat">${S.people.length}</div></div><div class="zcard"><h2>Numbers called${S.cfg.rounds > 1 ? " · round " + S.round + " of " + S.cfg.rounds : ""}</h2><div class="zstat">${S.log.length} / 90</div></div></div>
      ${(S.reqs || []).length ? `<div class="zcard"><h2>Your AI assistant is asking</h2>${S.reqs.map((r) => `<div class="zrow"><span>${esc(r.action)}${r.note ? " · " + esc(r.note) : ""}</span></div>`).join("")}<button class="zbtn s${S.reqs[0].action === "erase" ? " bad" : ""}" id="reqok">${S.reqs[0].action === "erase" ? "Confirm: delete all participant data" : "Approve (" + esc(S.reqs[0].action) + ")"}</button><button class="zbtn s alt" id="reqno">Dismiss</button></div>` : ""}
      ${statsCard()}${playCard()}
      <div class="zcard zform"><h2>Invite list</h2>
        <label for="roster">Paste one person per line: name, mobile number</label><textarea id="roster" rows="4" style="width:100%;box-sizing:border-box;font-size:15px;border:1px solid var(--line);border-radius:10px;padding:8px"></textarea>
        <button class="zbtn s" id="addroster">Add to list</button>
        <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="closed" style="width:auto;min-height:0" ${S.closed ? "checked" : ""}> Invite only (people not on the list cannot join)</label></div>
      ${luckyAdminCard()}
      ${prizeCard()}
      ${S.started && !S.draft ? "" : settingsCard()}
      <div class="zcard"><h2>Controls</h2>
        <button class="zbtn s" data-ctl="pause" ${paused ? "disabled" : ""}>Pause</button><button class="zbtn s alt" data-ctl="resume" ${paused ? "" : "disabled"}>Resume</button><button class="zbtn s bad" data-ctl="stop">End engagement</button>
        <p class="zsmall">${S.cf ? `A pause reaches every phone about ${Math.max(10, Math.round(S.cf.leadRounds * 3 / 5) * 5)} seconds after you press it: phones check in on a timer, and larger engagements check less often so they stay within the free plan.` : (S.info && S.info.cap > 2000 ? "Pause is available for engagements of up to 2,000 participants. This one is larger, so it runs without it." : "Pause becomes available once this engagement is set up.")} ${paused ? "<b>Paused now.</b>" : ""} ${S.ctlNote ? esc(S.ctlNote) : ""}</p></div>
      <div class="zcard"><h2>Rewards · from the public number log</h2>
        ${S.settledPreview.length ? S.settledPreview.map((s) => `<div class="zrow"><span>${esc(lineLabel(s))} · call ${s.idx + 1}</span><em>${s.pids.length} participant${s.pids.length === 1 ? "" : "s"}${s.names ? " · " + esc(s.names) : ""}</em></div>`).join("") : "<p class=zsmall>No pattern is complete yet.</p>"}
        <p class="zsmall">Claims received: ${S.claims.length}. ${bad ? `<b>${bad} not valid</b> (they do not match the public log and are ignored).` : "All claims so far match the public log."}</p>
        <p class="zsmall">Numbers come from a public random beacon. Winners are confirmed when several phones agree. You and we cannot choose or change them in the software. Confirmed so far: ${(S.published || []).filter((r) => r.pattern !== "lucky").length}.</p>
        <button class="zbtn s alt" id="csv" ${S.settledPreview.length ? "" : "disabled"}>Download report</button></div>
      <div class="zcard zform"><h2>Add people</h2>
        <p class="zsmall" style="margin-top:0">One person per line: name, mobile number. Names and numbers stay here: your AI never sees them.</p>
        <label for="rosterTxt">Your list</label><textarea id="rosterTxt" class="inp" rows="5" placeholder="Asha, 98765 43210" autocomplete="off"></textarea><button class="zbtn s" id="rosterGo">Add them</button></div>
      <div class="zcard zform"><h2>A player's own data</h2>
        <p class="zsmall" style="margin-top:0">A player asks to see or delete their data? Enter their mobile number. Only you can do this.</p>
        <label for="pdph">Their mobile number</label><input id="pdph" inputmode="tel" autocomplete="off" placeholder="98765 43210"><button class="zbtn s alt" id="pdsee">Show what we hold</button> <button class="zbtn s" id="pddel">Delete their data</button></div>
      <div class="zcard zform"><h2>Change of phone</h2>
        <p class="zsmall" style="margin-top:0">A ticket plays on one phone only. If someone lost or changed their phone, enter their mobile number: the next phone they join with keeps their ticket.</p>
        <label for="ubph">Their mobile number</label><input id="ubph" inputmode="tel" autocomplete="off" placeholder="98765 43210"><button class="zbtn s" id="unbind">Let them move to a new phone</button></div>
      ${dataCard()}
      ${aiAuditCard()}`;
  }
  const ist = (ms) => new Date(ms + 5.5 * 3600000).toISOString().replace("T", ", ").slice(0, 20) + " IST";
  /** The moment the numbers start, the console shows how the game is going: who is in, who came late, who came through an invitation. */
  function statsCard() {
    if (!S.started || S.draft) return "";
    const ps = S.people, late = ps.filter((p) => p.jr > 0).length, viaInv = ps.filter((p) => p.inv).length, roles = ps.filter((p) => p.role).length;
    const byCat = {}; for (const p of ps) if (p.inv && p.cat) byCat[p.cat] = (byCat[p.cat] || 0) + 1;
    const label = (id) => ((ZG.INVITE_CATEGORIES || []).find((k) => k.id === id) || { label: id }).label;
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="zrow"><span>${esc(label(k))}</span><em>${n}</em></div>`).join("");
    return `<div class="zcard" style="border:2px solid #c9a24a"><h2>The game has begun</h2>
      <div class="zgrid"><div><div class="zstat">${ps.length}</div><div class="zsmall">people in the game</div></div><div><div class="zstat">${late}</div><div class="zsmall">joined after the first number</div></div><div><div class="zstat">${viaInv}</div><div class="zsmall">came through an invitation</div></div><div><div class="zstat">${S.settledPreview.length}</div><div class="zsmall">prizes won so far</div></div></div>
      ${cats ? `<h3 style="margin:10px 0 2px;font-size:13px">Invitations by kind of guest</h3>${cats}` : ""}${roles ? `<p class="zsmall" style="margin:8px 0 0">${roles} organizer / host / co-host ${roles === 1 ? "seat" : "seats"} playing along.</p>` : ""}
      <p class="zsmall" style="margin:8px 0 0">When the game ends we e-mail you the complete report as a PDF: when it started, how many people at each stage, every prize and winner, who invited whom, all statistics, and every name and mobile number.</p></div>`;
  }
  /** Organizer, host and co-hosts may hold a ticket like anyone, with no advantage: the numbers are public and appear for everyone at the same moment. */
  function playCard() {
    if (S.draft) return "";
    const url = `${location.origin}/z.html?e=${encodeURIComponent(eid)}`;
    return `<div class="zcard zform"><h2>Play along with your own ticket</h2>
      <p class="zsmall" style="margin-top:0">You, your hosts and co-hosts can play too. Nobody has an advantage: the numbers come from the public randomness, you see each one at the same moment as everyone, and pausing shows nothing early. Your seat is marked in the report and you stay out of lucky draws.</p>
      <div class="zlink">${esc(url)}</div>
      <p class="zsmall" style="margin:8px 0 4px">After you have opened the link and joined, mark your seat here:</p>
      <label for="mkph">Mobile number</label><input id="mkph" inputmode="tel" placeholder="98765 43210">
      <label for="mkrole">This person is the</label><select id="mkrole"><option value="organizer">Organizer</option><option value="host">Host</option><option value="co-host">Co-host</option><option value="none">Nobody special (remove the mark)</option></select>
      <button class="zbtn s" id="mark">Mark this seat</button></div>`;
  }
  const dmy = (ms) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  const prizeName = (p) => { const l = (S.cfg && S.cfg.rewards || []).find((x) => x.pattern === p.pattern && x.ordinal === p.ordinal); return p.pattern === "lucky" ? "Lucky draw " + p.ordinal : (PNAME[p.pattern] || p.pattern) + (p.ordinal > 1 ? " (" + p.ordinal + ")" : "") + (l && l.text ? " · " + l.text : ""); };
  const PNAME = { early5: "Early Five", top: "Top Line", mid: "Middle Line", bot: "Bottom Line", corners: "Four Corners", star: "Star", full: "Full House", full2: "Full Two-Ticket House" };
  /** Winners with the name and number they confirmed, any change they made after the game (with the original), and a tick for "prize given" with the date. */
  function prizeCard() {
    const P = S.prizes || [];
    if (!S.started || S.draft) return "";
    const rows = P.map((p, i) => `<div class="zrow" style="align-items:flex-start;gap:8px"><span style="flex:1"><b>${esc(p.name || "Participant")}</b> &middot; ${esc(p.phone || "")}<br><small class="zsmall" style="margin:0">${esc(prizeName(p))}${p.round > 1 ? " · round " + p.round : ""}${p.confirmed ? " · confirmed by the winner " + esc(dmy(p.confirmedMs)) : " · not confirmed by the winner yet"}</small>${p.changed ? `<br><small style="color:#b3261e"><b>Changed after the game.</b> Joined as ${esc(p.joinedWithName || "?")} · ${esc(p.joinedWithPhone || "?")}${(p.trail || []).map((t) => "; on " + esc(dmy(t.at)) + " changed to " + esc(t.name) + " · " + esc(t.phone)).join("")}</small>` : ""}</span>
      <label style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" style="width:auto;min-height:0" data-given="${i}" ${p.given ? "checked" : ""}> Prize given${p.given ? " " + esc(dmy(p.givenMs)) + (p.givenBy ? " by " + esc(p.givenBy) : "") : ""}</label></div>`).join("");
    return `<div class="zcard"><h2>Winners and prize hand-over</h2>${rows || "<p class=zsmall>No winner is confirmed yet.</p>"}
      <p class="zsmall">After the game each winner confirms their name and mobile number on their own phone. Anything they change is shown here together with what they joined with. Tick "Prize given" when you hand the prize over: the date is kept. These details are kept for 365 days with your engagement record.</p></div>`;
  }
  function bindPrizes() {
    document.querySelectorAll("[data-given]").forEach((c) => (c.onchange = async () => {
      const p = (S.prizes || [])[Number(c.dataset.given)]; if (!p) return;
      try { await call("POST", `/api/z/${eid}/prizegiven`, { round: p.round, pattern: p.pattern, ordinal: p.ordinal, seat: p.seat, given: c.checked }); S.note = c.checked ? "Marked as given." : "Tick removed."; } catch (e) { S.note = e.message; }
      refreshEng();
    }));
  }
  /** Every call the organizer's external AI made: when, what, and from where. */
  function aiAuditCard() {
    if (S.role === "host") return "";
    const T = S.aiTrail;
    return `<div class="zcard"><h2>What your AI assistant did</h2>
      ${T ? (T.length ? T.slice(0, 40).map((t) => `<div class="zrow"><span>${esc(dmy(t.at_ms))}<br><small class="zsmall" style="margin:0">${esc(t.method)} ${esc(t.path)} → ${esc(String(t.status))} · from ${esc(t.ip || "?")} ${esc(t.country || "")} · ${esc((t.ua || "").slice(0, 60))} · key ${esc(t.key_id || "")}</small></span></div>`).join("") : "<p class=zsmall>Your AI assistant has not made any call yet.</p>") : `<button class="zbtn s alt" id="aiaudit">Show the AI activity log</button>`}
      <p class="zsmall">Every call your AI assistant makes is recorded with the time, the key used and where it came from. It is kept for 365 days.</p></div>`;
  }
  function dataCard() {
    const l = S.life;
    const when = l ? `<div class="zrow"><span>Names, mobile numbers, seats and invitations of participants</span><em>deleted by ${esc(ist(l.personalDeleteAtMs))}${l.purged ? " (done)" : ""}</em></div>
      <div class="zrow"><span>Complete report: a link is e-mailed to you, and the PDF is built on your own device</span><em>${l.reportSent ? "link sent" : l.purged ? "not sent" : "after the game ends"}</em></div>
      <div class="zrow"><span>Your details as organizer / host / co-host, and the winners record</span><em>kept until 00:00 IST, ${esc(ist(l.fullDeleteAtMs).slice(0, 10))}</em></div>
      <div class="zrow"><span>Backups of deleted data</span><em>roll off within ${l.backupDays} days</em></div>` : "";
    return `<div class="zcard"><h2>Participant data</h2>
      <p class="zsmall" style="margin-top:0">Within 24 hours of the game ending we send you the report, then delete every participant's name and number. Only winners' prize hand-over details stay, for 365 days.</p>${when}
      ${S.life && S.life.reportSent && !S.life.purged ? `<button class="zbtn s" id="rptopen" style="margin-top:8px">Open the report now</button> <button class="zbtn s alt" id="rptnew" style="margin-top:8px">New report link</button> ` : ""}<button class="zbtn s alt" id="erase" style="margin-top:8px">Delete all participant data now</button>
      <p class="zsmall">You can also e-mail us from your registered address, or ask your AI assistant to request the deletion and then confirm it here. The report is e-mailed first when the game has already ended.</p></div>`;
  }
  function draw(v) { $app.innerHTML = v; bind(); }

  async function refreshHome() { try { S.keys = (await call("GET", "/api/org/keys")).keys; } catch { S.keys = []; } try { S.sugs = (await call("GET", "/api/z/suggestions")).suggestions.slice(0, 6); } catch { S.sugs = []; } try { S.history = await call("GET", "/api/history"); } catch (e) { if (e.status === 403) { secret = ""; return draw(loginView("That organizer key was not accepted.")); } } draw(homeView()); }

  async function refreshEng() {
    try {
      S.info = await call("GET", `/api/z/${eid}/info`); S.draft = !!S.info.draft; S.unpaid = !!S.info.unpaid; S.locked = !!S.info.locked;
      let pr = await call("GET", `/api/z/${eid}/participants`); S.people = pr.participants; S.closed = pr.closed;
      while (S.people.length < pr.total) { const more = await call("GET", `/api/z/${eid}/participants?offset=${S.people.length}`); if (!more.participants.length) break; S.people.push(...more.participants); } // a long list arrives in pages
      S.cfg = { tickets: pr.tickets, rewards: pr.rewards, breaks: pr.breaks, opening: pr.opening || [], closing: pr.closing || [], rounds: pr.rounds || 1, invites: pr.invites };
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
      const cfOf = new Map(S.people.filter((p) => p.jr > 0).map((p) => [p.pid, ZG.countFromOf(p.jr)])); // people who joined after the first number count from 90 s after joining
      const callRoundsOf = {}; for (let r = 1; r <= S.cfg.rounds; r++) callRoundsOf[r] = schedOf(r).filter((x) => x !== null);
      const late = { countFrom: cfOf, callRounds: callRoundsOf };
      S.checked = ZG.checkClaims(eid, S.claims.map((c) => ({ pid: c.pid, pattern: c.pattern, idx: c.idx, round: c.round })), S.logs, S.cfg, late);
      const nm = S.nameCache || (S.nameCache = new Map()); // names are sealed on our side: the console asks for the few it shows (winners), 50 at a time
      const settled = [];
      for (let r = 1; r <= S.cfg.rounds; r++) if (S.logs[r].length) settled.push(...ZG.settleAll(eid, pids, S.logs[r], S.cfg, r, { countFrom: cfOf, callRounds: callRoundsOf[r] }));
      await namesFor([...new Set(settled.filter((x) => x.pids.length <= 3).flatMap((x) => x.pids))]);
      S.settledPreview = settled.map((x) => ({ ...x, names: x.pids.length <= 3 ? x.pids.map((p) => nm.get(p) || "Participant").join(", ") : "" }));
      S.lucky = await computeLucky(now);
      try { S.life = await call("GET", `/api/z/${eid}/life`); } catch { S.life = null; }
      if (S.started && !S.draft) { try { S.prizes = (await call("GET", `/api/z/${eid}/prizes`)).prizes || []; } catch { S.prizes = S.prizes || []; } try { S.published = (await fetch(BASE + `/api/z/${eid}/results`).then((r) => r.json())).results || []; } catch { /* shown next time */ } } // the software decides the winners; this page only watches
    } catch (e) { S.note = e.status === 404 ? "That engagement was not found." : e.status === 403 ? "Your sign-in has expired or does not belong to this engagement. Open the home page and sign in again." : "Could not refresh. Retrying…"; }
    if (eid) draw(S.cfg && S.info ? engView() : `<div class="zhead"><b>Corporate Tambola · ${esc(eid)}</b><button class="zsnd" id="back">All engagements</button></div><div class="zbanner info">${esc(S.note || "Loading…")}</div>`);
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
    bindPrizes();
    if ($("rptnew")) $("rptnew").onclick = async () => { if (!confirm("Make a new report link? The old link, including the one in your e-mail, stops working at once.")) return; try { const r = await call("POST", `/api/z/${eid}/reportlink`, {}); if (r.url) window.open(r.url, "_blank", "noopener"); S.note = "New report link made. The old one has stopped."; } catch (e) { S.note = e.message; } refreshEng(); };
    if ($("rptopen")) $("rptopen").onclick = async () => { try { const r = await call("GET", `/api/z/${eid}/reportlink`); if (r.url) window.open(r.url, "_blank", "noopener"); else S.note = "The report is not ready yet."; } catch (e) { S.note = e.message; draw(engView()); } };
    if ($("aiaudit")) $("aiaudit").onclick = async () => { try { S.aiTrail = (await call("GET", "/api/org/ai/audit")).trail || []; } catch (e) { S.note = e.message; } draw(engView()); };
    if ($("rosterGo")) $("rosterGo").onclick = async () => {
      const people = $("rosterTxt").value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)[,;\t ]+([+()\d][\d ()+-]{8,})$/) || l.match(/^()([+()\d][\d ()+-]{8,})$/); return m ? { name: m[1].trim(), phone: m[2].trim() } : { name: l, phone: "" }; });
      if (!people.length) { S.note = "Paste your list first."; return refreshEng(); }
      let added = 0, skipped = 0, invalid = 0;
      try { for (let i = 0; i < people.length; i += 100) { const r = await call("POST", `/api/z/${eid}/roster`, { people: people.slice(i, i + 100) }); added += r.added || 0; skipped += r.skipped || 0; invalid += r.invalid || 0; } S.note = `${added} added${skipped ? ", " + skipped + " skipped" : ""}${invalid ? ", " + invalid + " not valid" : ""}.`; $("rosterTxt").value = ""; } catch (e) { S.note = e.message; }
      refreshEng();
    };
    if ($("pdsee")) $("pdsee").onclick = async () => { try { const r = await call("POST", `/api/z/${eid}/person`, { phone: $("pdph").value }); S.note = `Ticket ${r.seat}${r.name ? ", " + r.name : ""}${r.role ? ", " + r.role : ""}. We hold only their name and number.`; } catch (e) { S.note = e.message; } refreshEng(); };
    if ($("pddel")) $("pddel").onclick = async () => { if (!confirm("Delete this player's name and number now? This cannot be undone.")) return; try { await call("POST", `/api/z/${eid}/forget`, { phone: $("pdph").value }); S.note = "Done. Their data is deleted."; } catch (e) { S.note = e.message; } refreshEng(); };
    if ($("unbind")) $("unbind").onclick = async () => { try { await call("POST", `/api/z/${eid}/unbind`, { phone: $("ubph").value }); S.note = "Done. The next phone they join with keeps their ticket."; } catch (e) { S.note = e.message; } refreshEng(); };
    if ($("csv")) $("csv").onclick = async () => {
      await namesFor([...new Set(S.settledPreview.flatMap((x) => x.pids))]); const nm = S.nameCache;
      const rows = [["Reward", "Call number", "Participant"]];
      for (const s of S.settledPreview) for (const p of s.pids) rows.push([lineLabel(s), s.idx + 1, nm.get(p) || p]);
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(",")).join("\n")], { type: "text/csv" })); a.download = eid + "-rewards.csv"; a.click();
    };
    document.querySelectorAll("[data-retire]").forEach((b) => (b.onclick = async () => { if (!confirm("Retire this key? It will stop working at once.")) return; try { await call("POST", "/api/org/keys/revoke", { id: b.dataset.retire }); S.note = "Key retired."; } catch (e) { S.note = e.message; } refreshHome(); }));
    const newLink = async (path, ask) => {
      if (ask && !confirm(ask)) return;
      try { const r = await call("POST", path, {}); S.aiMsg = r.aiMessage; ss.set("ctz-aimsg", r.aiMessage); S.note = r.mailed ? "Your new AI work link is ready. The old links have stopped. A fresh 24-hour link is on its way to your e-mail." : "Your new AI work link is ready and the old one has stopped. Copy it from the box above (we have no e-mail address on file to send it to)."; } catch (e) { S.note = e.message; }
      draw(homeView());
    };
    if ($("closeacct")) $("closeacct").onclick = async () => {
      if (!confirm("Close your organizer account? Your account and all your engagements are deleted now. This cannot be undone.")) return;
      try { await call("POST", "/api/org/close", { confirm: true }); try { sessionStorage.clear(); } catch {} location.href = "/"; } catch (e) { S.note = e.message; draw(homeView()); }
    };
    if ($("aimake")) $("aimake").onclick = () => newLink("/api/org/ai/replace");
    if ($("aifresh")) $("aifresh").onclick = async () => { try { const r = await call("POST", "/api/org/ai/fresh", {}); S.note = r.mailed ? "A fresh 24-hour AI link is on its way to your e-mail. Never forward that e-mail." : "We have no e-mail address to send it to. Use the link in the box above."; } catch (e) { S.note = e.message; } draw(homeView()); };
    if ($("aireplace")) $("aireplace").onclick = () => newLink("/api/org/ai/replace", "Replace your AI work link? The old link stops working at once, even if an AI is using it right now.");
    if (S.aiMsg) wireAiOptions(document, S.aiMsg);
    if ($("aicopy")) $("aicopy").onclick = () => { try { navigator.clipboard.writeText(S.aiMsg); $("aicopy").textContent = "Copied. Now paste it into your AI chat"; } catch {} };
    if ($("airevoke")) $("airevoke").onclick = async () => { try { await call("POST", "/api/org/ai/revoke", {}); S.aiMsg = ""; ss.set("ctz-aimsg", ""); S.note = "Your AI work link has been stopped."; } catch (e) { S.note = e.message; } draw(homeView()); };
    if ($("reqok")) $("reqok").onclick = async () => {
      const r = S.reqs[0];
      if (r.action === "erase") { // your confirmation is what deletes, not the AI's request
        if (!confirm("Delete every participant's name and mobile number now? This cannot be undone. The winners record stays.")) return;
        try { const x = await call("POST", `/api/z/${eid}/erase`, {}); S.note = x.erased + " participants erased."; await call("POST", `/api/z/${eid}/control/request/clear`, {}); } catch (e) { S.note = e.message; }
        return refreshEng();
      }
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
    { // what kind of link is it, and a test page that shows it exactly as a guest's phone would
      const ytC = (u) => /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/.test(u);
      const linkInfo = (u) => {
        if (!u) return { ok: true, text: "No link: guests see your message only." };
        if (!/^https:\/\/[^\s<>"'`]+$/i.test(u)) return { ok: false, text: "The link must start with https:// and have no spaces." };
        if (ytC(u)) return { ok: true, text: "YouTube video: plays inside the game. If its owner has switched off showing it on other sites it will not play, so press the test button." };
        if (/\.(mp4|webm|m4v|mov|ogv)([?#]|$)/i.test(u)) return { ok: true, text: "Video file: plays inside the game." };
        if (/\.(mp3|m4a|aac|wav|ogg|oga)([?#]|$)/i.test(u)) return { ok: true, text: "Audio file: plays inside the game." };
        return { ok: false, text: "This link will NOT play inside the game: it opens in a new tab and takes guests out of the game. Use a YouTube link, or a direct link to a video (.mp4) or audio (.mp3) file." };
      };
      const val = (grp, i, k) => (document.querySelector(`[data-${grp}="${k}"][data-i="${i}"]`) || {}).value || "";
      const refresh = (grp, i) => { const el = document.querySelector(`[data-lk="${grp}${i}"]`); if (!el) return; const r = linkInfo(val(grp, i, "mediaUrl").trim()); el.textContent = r.text; el.style.color = r.ok ? "" : "#a02020"; };
      document.querySelectorAll(".bmrow").forEach((row) => { const grp = row.dataset.grp, i = row.dataset.row; refresh(grp, i); row.querySelectorAll("input,select").forEach((x) => x.addEventListener("input", () => refresh(grp, i))); });
      document.querySelectorAll("[data-test]").forEach((btn) => (btn.onclick = () => {
        const grp = btn.dataset.test, i = btn.dataset.i, w = { op: "opening", bk: "break", cl: "closing" }[grp];
        const sec = val(grp, i, "seconds");
        const h = new URLSearchParams({ w, k: val(grp, i, "kind") || "speech", t: val(grp, i, "title").trim() || "Your message", u: val(grp, i, "mediaUrl").trim(), ...(sec ? { s: sec } : {}) });
        window.open("/preview.html#" + h.toString(), "_blank", "noopener");
      }));
    }
    if ($("tix") && $("bmcount")) { // the brand moments follow the tickets: 1 + 3 + 1 for one ticket, 2 + 6 + 2 for two
      const sync = () => {
        const t = Number($("tix").value) || 1, lim = { op: t, bk: 3 * t, cl: t }; let used = 0, dropped = 0;
        for (const grp of ["op", "bk", "cl"]) document.querySelectorAll(`.bmrow[data-grp="${grp}"]`).forEach((r) => {
          const i = Number(r.dataset.row), shown = i < lim[grp]; r.style.display = shown ? "" : "none";
          const has = (r.querySelector(`[data-${grp}="title"]`).value.trim() || r.querySelector(`[data-${grp}="mediaUrl"]`).value.trim());
          if (has) { if (shown) used++; else dropped++; }
        });
        $("bmcount").textContent = `Brand moments: ${used} of ${5 * t} used (you have ${t} ticket${t === 1 ? "" : "s"} per person)` + (dropped ? `. ${dropped} more than the allowance, not saved: switch some off.` : "");
      };
      $("tix").onchange = sync; document.querySelectorAll(".bmrow input, .bmrow select").forEach((x) => x.addEventListener("input", sync)); sync();
    }
    if ($("savecfg")) $("savecfg").onclick = async () => {
      try { const v = readSettings(); const r = await call("PATCH", `/api/z/${eid}/settings`, v); S.cfg = { tickets: r.tickets, rewards: r.rewards, breaks: r.breaks, opening: r.opening || [], closing: r.closing || [], rounds: r.rounds || 1, invites: r.invites }; S.note = "Saved."; } catch (e) { S.note = e.message; }
      refreshEng();
    };
    if ($("mark")) $("mark").onclick = async () => { try { await call("POST", `/api/z/${eid}/mark`, { phone: $("mkph").value, role: $("mkrole").value }); S.note = "Marked."; } catch (e) { S.note = e.message; } refreshEng(); };
    if ($("erase")) $("erase").onclick = async () => { if (!confirm("Delete every participant's name and mobile number now? This cannot be undone. The winners record stays.")) return; try { const r = await call("POST", `/api/z/${eid}/erase`, {}); S.note = r.erased + " participants erased."; } catch (e) { S.note = e.message; } refreshEng(); };
  }

  // TEST mode (owner-controlled, see docs/TEST_AND_LIVE_MODE.md): a calm notice in the organizer console ONLY. Public pages, participant phones and e-mails never carry it.
  (async () => { try { const m = await (await fetch(BASE + "/api/mode", { cache: "no-store" })).json(); if (m && m.mode === "TEST" && !document.getElementById("testmode")) { const b = document.createElement("div"); b.id = "testmode"; b.className = "ztest"; b.setAttribute("role", "status"); b.textContent = "TEST MODE: nothing here is real. No one outside the owner’s test list is e-mailed, and nothing is charged."; const app = document.getElementById("app"); app.parentNode.insertBefore(b, app); } } catch (e) { /* no banner when the mode cannot be read */ } })();
  (async () => {
    if (secret) { try { S.role = (await call("GET", "/api/whoami")).kind === "host" ? "host" : ""; } catch { /* an old or wrong key is handled by the screens below */ } }
    if (!secret) draw(loginView(""));
    else if (S.role === "host" && !eid) draw(`<div class="zhead"><b>Corporate Tambola · Co-host</b></div><div class="zcard"><p style="margin:0">Open the co-host link your organizer sent you. It opens the engagement directly.</p></div>`);
    else if (eid) refreshEng(); else refreshHome();
  })();
  setInterval(() => { const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; /* never wipe what the organizer is typing */ if (!secret || document.hidden) return; if (eid) refreshEng(); else if (S.role !== "host") refreshHome(); }, 5000);
  window.__zc = S;
})();
