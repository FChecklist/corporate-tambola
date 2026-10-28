/* Corporate Tambola, the organizer console: ONE page with numbered, colourful steps that talk you through the game (see docs/ROLES_AND_CONSOLE_SPEC.md).
   Organizer and Host see ten steps; a Co-host sees three. It works on the owner's own machine; the game itself runs on the phones.
   The page holds the sign-in key only in this tab's session. Choices are tap chips, never drop-down lists. */
(function () {
  const ZG = window.ZG;
  const $app = document.getElementById("app");
  const q = new URLSearchParams(location.search);
  const BASE = (q.get("api") || "").replace(/\/$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ss = { get: (k) => (window.CTK ? window.CTK.get(k) : (() => { try { return sessionStorage.getItem(k); } catch { return null; } })()), set: (k, v) => { if (window.CTK) window.CTK.set(k, v); else { try { sessionStorage.setItem(k, v); } catch {} } } };
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let secret = ss.get("ctz-org") || "";
  { const m = location.hash.match(/^#(?:host|cohost)=(ct[hc]_[0-9a-f]{48})$/); if (m) { secret = m[1]; ss.set("ctz-org", secret); history.replaceState(null, "", location.pathname + location.search); } } // a Host or Co-host link: the key leaves the address bar at once
  { const k = q.get("k"); if (k && /^ct[hca]_[0-9a-f]{48}$/.test(k)) { secret = k; ss.set("ctz-org", secret); q.delete("k"); const rest = q.toString(); history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "")); } }
  let eid = q.get("e") || "";
  const LAST = (() => { try { return JSON.parse(ls.get("ctz-last") || "null"); } catch { return null; } })(); // where this person was last time (game and step): clicking the same link again, or the home address, takes them back there
  const saveLast = (v) => { try { ls.set("ctz-last", v ? JSON.stringify(v) : ""); } catch {} };
  const ACT = (q.get("do") || "").toLowerCase(); // a hand-over link from the AI assistant: opens the exact card; the organizer presses the button
  const QUICK = q.get("quickform") === "1"; // the plain one-page form: no link leads here any more (the test tools use it)
  const CREATE = q.get("quick") === "1"; // the old "Quick setup" link: it now makes a game in the colourful console, like the Create a new game button
  const NEWGAME = q.get("new") === "1"; // the link on a participant's ticket: "Create a new game as an organizer"
  const NEWDEMO = q.get("demo") === "1"; // from the website: start a free demo game (up to 10 people) right away
  // A demo pass link (zc.html?pass=...): the long secret in it is kept in this browser until the person is signed in, then used once, then forgotten. Nothing about it is shown to anybody else.
  { const pt = (q.get("pass") || "").toLowerCase(); if (/^[0-9a-f]{32}$/.test(pt)) { ls.set("ctz-pass", JSON.stringify({ t: pt, at: Date.now() })); q.delete("pass"); try { const rest = q.toString(); history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "")); } catch { /* the address stays */ } } }
  // A browser AI may open this page in a new tab, and a tab holds the key only for itself: another open tab of the same browser can hand it over (same site, same browser, never stored).
  const bc = typeof BroadcastChannel === "function" ? new BroadcastChannel("ctz-org-key") : null;
  const OLD_HOUSES = [{ id: "early5", label: "Early Five", how: "Be the first to mark any 5 of your numbers.", max: 5 }, { id: "top", label: "Top Line", how: "Mark all 5 numbers of the top line.", max: 5 }, { id: "mid", label: "Middle Line", how: "Mark all 5 numbers of the middle line.", max: 5 }, { id: "bot", label: "Bottom Line", how: "Mark all 5 numbers of the bottom line.", max: 5 }, { id: "corners", label: "Four Corners", how: "Mark the first and last number of the top and bottom lines.", max: 5 }, { id: "star", label: "Star", how: "Mark the four corners and the centre number of the middle line.", max: 5 }, { id: "full", label: "Full House", how: "Mark all 15 numbers of your ticket.", max: 5 }, { id: "full2", label: "Super Bumper House", how: "Mark all 30 numbers of your two tickets together.", max: 5 }];
  const HOUSES = ZG && Array.isArray(ZG.PRIZE_HOUSES) && ZG.PRIZE_HOUSES.length ? ZG.PRIZE_HOUSES : OLD_HOUSES;
  const NAMES = Object.fromEntries(HOUSES.map((h) => [h.id, h.label]));
  // ---- Simpler console: things are only HIDDEN here, never removed; change a constant to bring them back. The server keeps its own (higher) limits.
  const HIDE_ADVANCED = true; // true: the rarely used controls (rounds, the tie question, the typed winners box) are hidden by one CSS class (zc-hide + data-hidden)
  const PRIZE_MAX = { line: 5, other: 5, house: 10, bumper: 10 }; // the most winners the console OFFERS per prize class
  const ROUNDS_VISIBLE = [1]; // round 1 is the default and the only round offered
  const LINE_HOUSES = ["top", "mid", "bot", "twolines", "topbottom", "midcorners"];
  /** Which limit a prize follows: line (the line prizes), house (Full House), bumper (Full House on both tickets), other (everything else). */
  const prizeClassOf = (pattern) => (pattern === "full2" ? "bumper" : pattern === "full" ? "house" : LINE_HOUSES.includes(pattern) ? "line" : "other");
  const capOf = (pattern, serverMax) => Math.min(Number(serverMax) || 1, PRIZE_MAX[prizeClassOf(pattern)]);
  const hideWrap = (html) => (HIDE_ADVANCED ? `<div class="zc-hide" data-hidden="1">${html}</div>` : html);
  const call = async (method, path, body) => {
    let r;
    try { let tm; r = await Promise.race([fetch(BASE + path, { method, headers: { "content-type": "application/json", "x-organizer": secret }, body: body === undefined ? undefined : JSON.stringify(body) }), new Promise((_, no) => { tm = setTimeout(() => no(new Error("no answer")), 40000); })]); clearTimeout(tm); } // a request that never answers must not hold the page for ever
    catch (e) { const err = Object.assign(new Error("We could not reach the service. Please check your internet and try again."), { status: 0 }); guided(err, method, path, body); throw err; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const err = Object.assign(new Error(j.error || (r.status >= 500 ? "Something went wrong on our side. Please try again in a minute." : "Could not do that. Please try again.")), { code: j.code, status: r.status, needPack: j.needPack, payments: j.payments }); guided(err, method, path, body); throw err; }
    return j;
  };
  const STEP_NAMES = ["Date and time", "Number of participants", "Set Prizes", "Set Brand Moments", "Make hosts and co-hosts", "Invite and share links", "Check and publish", "Pay", "Game day", "After the game"];
  /** the guide (guide.js): a failed action explains itself, says what to do, and takes the person to the exact step and box; "Done?" brings them back here */
  function guided(err, method, path, body) {
    if (!window.CTG) return; const where = path.split("?")[0].replace(/\/[A-Za-z0-9_-]{6,}(?=\/|$)/g, "/..."); CTG.wrap(err, { what: method + " " + where });
    if (method === "GET" || err.status === 401) return;
    err.guided = true;
    const open = S.open || 0;
    CTG.watch(err, { retry: () => (S.redo && S.redo.err === err ? S.redo.fn() : call(method, path, body).then((r) => { S.toast = ""; S.teamNote = ""; S.note = "Done."; if (eid) { refreshTeam(); refreshEng(); } else if (secret) refreshHome(); return r; })), back: open ? { step: open, label: STEP_NAMES[open - 1] || "where you were" } : null }); // the screen's own message is upgraded in place by guide.js; if the screen shows nothing, the guide does
  }
  const S = { kind: "", annNote: "", aiMsg: ss.get("ctz-aimsg") || "", contact: { email: ss.get("ctz-email") || "", phone: ss.get("ctz-phone") || "" }, info: null, people: [], claims: [], control: null, results: [], store: null, log: [], note: "", history: null, busy: false,
    open: 0, sheet: false, q: -1, f: null, sum: null, team: null, teamNote: "", teamLinks: {}, teamWa: {}, myId: "", coh: null, cohErr: "", done: {}, mode: "type", recent: [], acct: false, hostN: 0, unsaved: {} };
  const role = () => (S.kind === "cohost" ? "cohost" : S.kind === "host" ? "host" : /^(partner|refer|sales)/.test(S.kind) ? "partner" : "organizer");
  const isOrg = () => role() === "organizer";
  const canRun = () => role() === "organizer" || role() === "host"; // the full game console
  const fmtDay = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const pad2 = (n) => String(n).padStart(2, "0");
  const istNow = () => new Date(Date.now() + 5.5 * 3600000);
  const istDateStr = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const dmy = (ms) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const money = (n) => "Rs " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const randId = () => "E" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
  const copyText = async (t) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
  async function latestRound() { const x = await ZG.fetchRound("latest"); return x ? x.round : null; }

  // ---------- the steps ----------
  // [number, title, colour, short hint (shown when the step is open or has nothing to summarise), what the console says when you open it]
  const FULL = [
    [1, "Date and time of the game", "blue", "Pick the occasion, day and time.", "Hello. Let us start with the basics."],
    [2, "Number of participants", "aqua", "How many players, and how the game runs.", "Good. Now, how many players, and how should it run?"],
    [3, "Set Prizes", "violet", "Tick the prizes. Pick what each one is.", "Now the fun part: prizes."],
    [4, "Set Brand Moments", "magenta", "Add your message or video. Test it first.", "Want your brand in the breaks?"],
    [5, "Make hosts and co-hosts", "green", "Add Hosts and Co-hosts. Send each link to one person.", "Who is helping you?"],
    [6, "Invite and Share links", "yellow", "Share the link. Add your people.", "Time to bring people in."],
    [7, "Check and publish", "orange", "Check everything. Then publish, free.", "Almost there. One last look."],
    [8, "Pay", "lime", "Pay once, before the start time.", "Last thing: payment."],
    [9, "Game day", "violet", "Run the game. Message your guests.", "It is game day."],
    [10, "After the game", "red", "Get your report. Erase data if you want.", "That was fun. Here is what is left."],
  ];
  const COH = [
    [1, "Today's game", "blue", "See the game and its payment.", "Hi. Here is the game."],
    [2, "Invite people", "green", "Send your link to your people.", "Bring your people in."],
    [3, "Payment", "orange", "Anyone can pay. Then the game is on.", "One more thing: payment."],
  ];
  const ROLE_NOTE = { organizer: "You made this game. You can do everything.", host: "You have the Organizer's rights for this game. Not the account.", cohost: "You can invite people and pay. Nothing else.", partner: "This is your partner area." };
  const steps = () => (role() === "cohost" ? COH : FULL);
  const doneKey = () => "ctz-prog-" + eid + "-" + role();
  const loadDone = () => { try { S.done = JSON.parse(ls.get(doneKey()) || "{}") || {}; } catch { S.done = {}; } };
  const saveDone = () => ls.set(doneKey(), JSON.stringify(S.done));
  const markDone = (n) => { S.done[n] = 1; saveDone(); };
  /** A step is done when the owner said so, or when the game itself proves it. */
  const isDone = (n) => (n === 7 && role() !== "cohost" ? false : !!S.done[n]) || (role() !== "cohost" && n === 7 && !!S.info && !S.draft) || (role() !== "cohost" && n === 8 && !!S.info && !S.draft && payState().paid) || (role() === "cohost" && n === 3 && payState().paid)
    || (role() !== "cohost" && n <= 6 && !!S.started && !S.draft) // the game has started: steps 1-6 are locked, so they are done whether or not anyone pressed "Save and continue"
    || (role() !== "cohost" && n === 9 && gameEnded()) || (role() !== "cohost" && n === 10 && !!(S.life && (S.life.purged || S.life.reportSent)));
  const nextStep = () => steps().find((s) => !isDone(s[0])) || null; /* Choices made in step 1 or 2 and not yet saved: the page says so, because a numbered dot or the Next tab can carry the person away before Save and continue. */ const touched = (n) => role() !== "cohost" && !lockedGame() && !!(S.touched && S.touched[n]); const markTouched = () => { if (S.f && (S.open === 1 || S.open === 2)) (S.touched = S.touched || {})[S.open] = 1; }; /* a red refusal is about the old choice: it goes as soon as the person changes anything */ const clearToast = () => { if (S.toast) { S.toast = ""; document.querySelectorAll(".zc-toast-foot").forEach((x) => x.remove()); } }; const edited = () => { markTouched(); clearToast(); }; const unsavedWarn = () => [1, 2, 3, 4].filter((n) => touched(n) || (n > 2 && role() !== "cohost" && !lockedGame() && !!S.unsaved[n])).map((n) => `<p class="zc-small zc-warnt" role="status" id="unsaved${n}"><b>Step ${n} has changes you have not saved yet,</b> so they are not in the list below. <button type="button" class="zc-mini" data-open="${n}">Open step ${n}</button> and press Save and continue.</p>`).join(""); /* the size a paid game was bought for (a free game of 10 people is not one): more people than that cannot be saved */ const paidPack = () => (!isFree10() && S.sum && S.sum.paid && Number(S.sum.pack) > 0 ? Number(S.sum.pack) : 0); /* on the day of the game, a time that is already behind us */ const passedToday = (f, t) => { const day = f.day === "other" ? f.dayo : f.day, now = istNow(); return day === istDateStr(now) && /^\d\d:\d\d$/.test(t) && t <= pad2(now.getUTCHours()) + ":" + pad2(now.getUTCMinutes()); };

  // ---------- who paid ----------
  /** One payment is enough for the game. The server says who paid; until it does, the old signals (published and not unpaid) stand in. */
  function payState() {
    const p = (S.sum && S.sum.payment && typeof S.sum.payment === "object" ? S.sum.payment : null) || (S.coh && S.coh.payment && typeof S.coh.payment === "object" ? S.coh.payment : null);
    if (p && p.status) return { paid: p.status === "paid", confirming: p.status === "confirming", paidBy: p.paidBy || "", paidMs: p.paidMs || 0 };
    if (S.coh && typeof S.coh.payment === "string") return { paid: S.coh.payment === "paid", confirming: S.coh.payment === "confirming", paidBy: "", paidMs: 0 };
    return { paid: !!S.info && !S.draft && !S.unpaid, paidBy: "", paidMs: 0 };
  }
  /** A DEMO GAME: the organizer's free game for up to 10 people (server: config.demo). Published free, never held for payment; "Make this a real game" (step 8, the pay page) turns it into a paid game of a chosen size at any time. */
  const DEMO_CAP = 10;
  const isFree10 = () => !!((S.info && S.info.demo) || (S.sum && S.sum.demo) || (S.coh && S.coh.demo)); // the Rs 0 game for up to 10 people: a real game, nothing on any screen marks it
  const isDemo = () => false;
  const payLabel = (p) => (isFree10() && p.paid ? "Rs 0 \u00b7 nothing to pay" : p.paid ? "Paid" : p.confirming ? "Confirming your payment..." : S.draft ? "Draft \u00b7 not published yet" : "Payment pending for this game");
  const isCancelled = () => !!(S.cancelDone || (S.sum && (S.sum.cancelled || S.sum.status === "cancelled")) || (S.coh && S.coh.cancelled) || (S.info && S.info.cancelled));
  const WHO = { organizer: "Organizer", host: "Host", "co-host": "Co-host", cohost: "Co-host" };

  // ---------- the choices (the form state: it lives here, so a refresh never loses what you are typing) ----------
  const OCC = ["Diwali party", "Dealer meet", "Annual day", "Team party", "Customer event", "Family day", "Weekend Fun", "Christmas Party", "Eid Party", "Holi Party", "Other"];
  const TIMES = [["10:00", "10 am"], ["12:00", "12 pm"], ["16:00", "4 pm"], ["18:00", "6 pm"], ["19:00", "7 pm"], ["20:00", "8 pm"], ["other", "Other time"]];
  const HS = HOUSES.map((h) => [h.id, h.label, h.how, h.max]); // [id, label, how to win, most winners]
  const maxOf = (k) => (HS.find((h) => h[0] === k) || [0, 0, 0, 100])[3];
  const winnersOf = (h, k) => Math.min(maxOf(k), Math.max(1, Math.floor(Number(h.n) || 1))); // what the organizer typed or tapped, kept between 1 and the safety ceiling
  const BUNDLES = { Classic: { early5: 1, top: 1, mid: 1, bot: 1, full: 1 }, Simple: { early5: 1, full: 1 }, Rich: { early5: 1, top: 1, mid: 1, bot: 1, corners: 1, star: 1, full: 3 } };
  // [key, label, currency prefix, what to ask]. "Decide later" saves an empty prize; "No prize" saves the words No prize, so the ticket shows them.
  const PT = [["voucher", "Gift voucher", "Rs", "Amount, for example 1000"], ["cash", "Cash prize", "cash", "Amount, for example 5000"], ["hamper", "Gift hamper", "", "What is in it? (optional)"], ["phone", "Smartphone", "", "Which one? (optional)"], ["watch", "Smart watch", "", "Which one? (optional)"], ["earbuds", "Earbuds or headphones", "", "Which one? (optional)"], ["tablet", "Tablet or laptop", "", "Which one? (optional)"], ["holiday", "Holiday or weekend stay", "", "Where?"], ["dinner", "Dinner or restaurant voucher", "Rs", "Amount, for example 2000"], ["movie", "Movie tickets", "", "How many tickets?"], ["dayoff", "Extra day off", "", ""], ["other", "Something else", "", "Type the prize"], ["later", "I will decide later", "", ""], ["none", "No prize", "", ""]];
  const KINDS = [["msg", "Type a message"], ["yt", "YouTube link"], ["vid", "Paste video file link"], ["aud", "Paste audio file link"]];
  const SERVER_KIND = { msg: "speech", yt: "youtube", vid: "file", aud: "file", slides: "slides" };
  const DEFAULT_TITLE = "A message from your organizer";
  const ptOf = (k) => PT.find((p) => p[0] === k);
  /** Cash prize: the currency (INR, shown with the rupee sign, is the default) and the amount. Saved inside the prize as "INR 5000"; shown on the ticket as "Cash prize: ₹5,000". */
  const CUR = [["INR", "₹", "Indian rupee (₹)"], ["USD", "$", "US dollar ($)"], ["EUR", "€", "Euro (€)"], ["GBP", "£", "Pound (£)"], ["AED", "AED ", "UAE dirham (AED)"], ["SGD", "S$", "Singapore dollar (S$)"]];
  const cashParse = (d) => { const m = /^([A-Z]{3})(?:\s+(.*))?$/.exec(String(d || "").trim()); const cur = m && CUR.some((c) => c[0] === m[1]) ? m[1] : "INR"; return { cur, amt: (m && CUR.some((c) => c[0] === m[1]) ? m[2] || "" : String(d || "")).replace(/[^0-9.]/g, "") }; };
  const cashJoin = (cur, amt) => cur + " " + String(amt || "").replace(/[^0-9.]/g, "");
  const cashText = (d) => { const { cur, amt } = cashParse(d); if (!amt) return "Cash prize"; const c = CUR.find((x) => x[0] === cur) || CUR[0], n = Number(amt); return "Cash prize: " + c[1] + (Number.isFinite(n) ? n.toLocaleString(cur === "INR" ? "en-IN" : "en-US", { maximumFractionDigits: 2 }) : amt); };
  const cashFrom = (t) => { const rest = t.slice("Cash prize: ".length); const c = [...CUR].sort((a, b) => b[1].length - a[1].length).find((x) => rest.startsWith(x[1])); return { pt: "cash", pd: cashJoin(c ? c[0] : "INR", c ? rest.slice(c[1].length) : rest) }; };
  /** The words a prize choice becomes on the ticket. */
  function prizeText(pt, pd) {
    const p = ptOf(pt), d = String(pd || "").trim();
    if (!p || pt === "later") return "";
    if (pt === "none") return "No prize";
    if (pt === "other") return d || "Something else";
    if (pt === "cash") return cashText(d);
    return p[1] + (d ? (p[2] ? ": Rs " + d.replace(/^Rs\.?\s*/i, "") : ": " + d) : "");
  }
  /** The other way round: a saved prize text becomes a choice again. */
  function prizeFrom(text) {
    const t = String(text || "").trim();
    if (!t) return { pt: "later", pd: "" };
    if (t === "No prize") return { pt: "none", pd: "" };
    if (t === "Cash prize") return { pt: "cash", pd: "" };
    if (t.startsWith("Cash prize: ")) return cashFrom(t);
    for (const p of PT.filter((x) => !["later", "none", "other"].includes(x[0]))) {
      if (t === p[1]) return { pt: p[0], pd: "" };
      if (t.startsWith(p[1] + ": ")) return { pt: p[0], pd: t.slice(p[1].length + 2).replace(/^Rs\s*/, "") };
    }
    return { pt: "other", pd: t };
  }
  const ptext = (pt, pd) => (pt === "later" ? "Decide later" : pt === "none" ? "No prize" : prizeText(pt, pd) || "Not chosen");
  const mediaKind = (u) => (/\.(mp3|m4a|aac|wav|ogg|oga)([?#]|$)/i.test(u) ? "aud" : "vid");
  /** A saved brand moment becomes a row of the form. */
  function momentFrom(b) {
    if (!b) return { k: "msg", v: "", t: "", s: "" };
    const url = b.mediaUrl || "";
    const k = b.kind === "slides" ? "slides" : b.kind === "youtube" ? "yt" : b.kind === "file" ? mediaKind(url) : url ? (/youtu/i.test(url) ? "yt" : mediaKind(url)) : "msg";
    return { k, v: url, t: b.title || "", s: b.seconds ? String(b.seconds) : "", ...(b.after && !b.auto ? { after: b.after } : {}) };
  }
  const momentEmpty = (m) => !(m.t || "").trim() && !(m.v || "").trim();
  /** A link pasted without https:// (www.youtube.com/..., youtu.be/...) is completed for the person, never refused for it. */
  const fixUrl = (u) => (/^(www\.|youtu\.be\/|(m\.|music\.)?youtube\.com\/)/i.test(u) ? "https://" + u : u);
  /** A row of the form becomes what the server saves. Rows with nothing in them are left out. */
  function momentOut(m, withAfter) {
    if (momentEmpty(m)) return null;
    const url = m.k !== "msg" ? fixUrl((m.v || "").trim()) : "";
    let kind = SERVER_KIND[m.k] || "speech";
    if (m.k !== "slides") { if (!url) kind = "speech"; else if (ytC(url)) kind = "youtube"; else if (kind === "youtube" && /\.(mp4|webm|m4v|mov|ogv|mp3|m4a|aac|wav|ogg|oga)([?#]|$)/i.test(url)) kind = "file"; } // the kind follows the link: none means a plain message (the server refuses a link kind without a link), a YouTube link on a file box is a YouTube moment, a video or audio file on the YouTube box is a file
    const b = { kind, title: (m.t || "").trim() || DEFAULT_TITLE };
    if (url) b.mediaUrl = url;
    if (String(m.s || "").trim()) { let s = Number(m.s); if (s >= 15 && s <= (withAfter ? 600 : 120)) s = Math.round(s / 3) * 3; b.seconds = s; } // the game counts in steps of 3 seconds: 40 becomes 39 (a number out of range is told to the person before Save, by name)
    if (withAfter && m.after) { b.after = m.after; if (!b.seconds) b.seconds = 60; } // a moment placed earlier keeps its place; with no time typed it lasts 60 seconds, as the others do
    return b;
  }
  const dayOpts = () => { const base = istNow(), out = []; for (let i = 0; i < 5; i++) { const d = new Date(base.getTime() + i * 86400000); out.push([istDateStr(d), i === 0 ? "Today" : i === 1 ? "Tomorrow" : DOW[d.getUTCDay()] + " " + d.getUTCDate() + " " + MON[d.getUTCMonth()]]); } return out; };
  const whoNow = () => { const w = (S.sum && S.sum.whoCanJoin) || S.whoCanJoin; return w === "anyone" ? "anyone" : "list"; };
  /** Host mode: a Host presses a button for each number (the saved setting, not the form). */
  const hostMode = () => ((S.cfg && S.cfg.callMode) || (S.info && S.info.callMode)) === "host";
  /** A manual start: the game waits until a Host or the Organizer presses Start (from the start time on). */
  const manualMode = () => ((S.cfg && S.cfg.startMode) || (S.info && S.info.startMode)) === "manual";
  const goRound = () => (S.st && S.st.goRound != null ? S.st.goRound : null);
  const maxFor = (t) => ({ op: t, mid: 3 * t, cl: t });

  /** Builds the form from what the server holds. */
  function formFromServer() {
    const c = S.cfg || ZG.defaultCfg(), t = c.tickets === 2 ? 2 : 1, inf = S.info || {};
    const blank = S.cloneNew === eid && S.cloneDated !== eid; // a game made like another: the date and time are picked again
    const start = inf.startMs ? new Date(inf.startMs + 5.5 * 3600000) : new Date(Date.now() + 86400000 + 5.5 * 3600000);
    const date = istDateStr(start), time = pad2(start.getUTCHours()) + ":" + pad2(start.getUTCMinutes());
    const nm = (c.name || "").trim();
    const f = { occ: nm ? (OCC.includes(nm) && nm !== "Other" ? nm : "Other") : "Diwali party", oname: nm && !OCC.includes(nm) ? nm : "", day: blank ? "" : dayOpts().some((d) => d[0] === date) ? date : "other", dayo: blank ? "" : date, time: blank ? "" : TIMES.some((x) => x[0] === time) ? time : "other", timeo: blank ? "" : time,
      cap: String(inf.cap || 250), tix: String(t), spd: String(inf.callSeconds || 12), rnd: String(c.rounds || 1), who: whoNow(), ver: c.verify === "id" || c.verify === "either" || c.verify === "both" ? c.verify : "mobile", emp: !!c.employeesOnly, mode: (c.callMode || inf.callMode) === "host" ? "host" : "auto", start: (c.startMode || inf.startMode) === "manual" ? "manual" : "auto", after: (c.keepCalling || inf.afterPrizes === "keep") ? "keep" : "end",
      inv: !!(c.invites && c.invites.on), per: String((c.invites && c.invites.per) || 4), cats: ((c.invites && c.invites.cats) || ["family", "colleagues"]).slice(), bundle: "", hs: {}, ph: "", ties: c.ties === "share" ? "share" : "next", demo: c.demo ? "1" : "0" };
    for (const [k] of HS) f.hs[k] = { on: false, n: 1, pt: "later", pd: "", orig: [] };
    for (const l of c.rewards || []) { const k = l.scope === "two_ticket" ? "full2" : l.pattern, h = f.hs[k]; if (!h) continue; h.on = true; h.n = Math.max(h.n, l.ordinal); h.orig[l.ordinal - 1] = l.text || ""; }
    for (const [k] of HS) { const h = f.hs[k]; if (h.on) { const a = prizeFrom(h.orig[0]); h.pt = a.pt; h.pd = a.pd; h.same = h.orig.every((x) => (x || "") === (h.orig[0] || "")); h.diff = !h.same; if (h.diff) h.per = Array.from({ length: h.n }, (_, i) => prizeFrom(h.orig[i])); } }
    f.ph = (HS.find(([k]) => f.hs[k].on) || ["full"])[0];
    const pad = (arr, n) => { const o = arr.slice(0, n); while (o.length < n) o.push({ k: "msg", v: "", t: "", s: "" }); return o; };
    const lk = (c.breaks || []).filter((b) => b.kind === "lucky"), mk = (c.breaks || []).filter((b) => b.kind !== "lucky");
    f.brand = Object.assign({ name: "", color: "", logo: "" }, inf.brand || (S.sum && S.sum.brand) || {}); f.opN = (c.opening || []).length; f.op = pad((c.opening || []).map(momentFrom), 2);
    f.midN = mk.length; f.mid = pad(mk.map(momentFrom), 6);
    f.clN = (c.closing || []).length; f.cl = pad((c.closing || []).map(momentFrom), 2);
    f.lucky = lk.map((b) => { const a = prizeFrom(b.title === "Lucky draw" ? "" : b.title); return { win: String(b.winners || 3), style: b.style === "scratch" ? "scratch" : "draw", pt: a.pt, pd: a.pd, ...(b.after && !b.auto ? { after: b.after } : {}) }; });
    return f;
  }
  const getP = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), S.f);
  const setP = (path, v) => { const ks = path.split("."), last = ks.pop(); const o = ks.reduce((x, k) => x[k], S.f); o[last] = v; };
  const usedMoments = () => { const f = S.f, t = Number(f.tix) || 1, lim = maxFor(t); const n = (rows, N, cap) => rows.slice(0, Math.min(N, cap)).filter((m) => !momentEmpty(m)).length; return n(f.op, f.opN, lim.op) + n(f.mid, f.midN, lim.mid) + f.lucky.length + n(f.cl, f.clN, lim.cl); };

  // ---------- small pieces ----------
  const lbl = (id, t) => `<label class="zc-lbl" for="${id}">${t}</label>`;
  const fid = (path) => "f-" + path.replace(/\./g, "-");
  const inp = (path, o = {}) => `<input id="${fid(path)}" class="zc-in" data-fi="${path}"${o.type ? ` type="${o.type}"` : ""}${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}${o.max ? ` maxlength="${o.max}"` : ""}${o.attrs ? " " + o.attrs : ""} value="${esc(getP(path))}">`;
  const chip = (path, v, l, multi) => { const cur = getP(path); const on = multi ? (cur || []).includes(v) : String(cur) === String(v); return `<button type="button" class="zc-chip${on ? " on" : ""}" data-ck="${path}" data-v="${esc(v)}"${multi ? ' data-multi="1"' : ""} aria-pressed="${on}">${esc(l)}</button>`; };
  const gid = (path) => "gl-" + path.replace(/\./g, "-");
  /** The two mode questions are RADIO BUTTONS: one option is always chosen, each has one plain sentence under it, and a tap anywhere on the option chooses it (the label wraps the input). */
  const MANUAL_MAX = 1000; // above this size only "by itself" + "the game does" exist (the manual options are hidden)
  const radios = (path, label, opts) => `<fieldset class="zc-radiogroup" id="rg-${path}"><legend class="zc-lbl" id="${gid(path)}">${label}</legend><div role="radiogroup" aria-labelledby="${gid(path)}">${opts.map(([v, l, d]) => { const on = String(getP(path)) === String(v); return `<label class="zc-radio${on ? " on" : ""}"><input type="radio" name="${path}" value="${esc(v)}" data-ck="${path}" data-v="${esc(v)}"${on ? " checked" : ""}><span class="zc-rtxt"><b>${esc(l)}</b><span class="zc-rdesc">${esc(d)}</span></span></label>`; }).join("")}</div></fieldset>`;
  const START_OPTS = [["auto", "Auto start", "The game starts by itself at the time I set."], ["manual", "Manual start", "The game starts when I press the Start button."]];
  const AFTER_OPTS = [["keep", "Keep calling until all 90 numbers", "Every number is still called, even after the last prize has been won, so nobody feels the game stopped early."], ["end", "End the game", "The game ends as soon as every prize has been won. No more numbers are called."]];
  const CALL_OPTS = [["auto", "The game calls the numbers", "A new number comes every 12 seconds, by itself."], ["host", "I call the numbers", "I press the Next button for every number."]];
  /** one line in plain words that follows the two choices */
  const modeSummary = (f) => {
    let when = "the start time"; try { const ms = startOf(f); if (Number.isFinite(ms)) when = new Date(ms).toLocaleString("en-US", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }).replace(",", "").replace(/ (AM|PM)$/, (m) => m.toLowerCase()); } catch { /* the day or time is not picked yet */ }
    return `<p class="zc-small zc-modesum" id="modesummary"><b>Your game:</b> ${f.start === "manual" ? "starts at " + esc(when) + " when you press Start" : "starts by itself at " + esc(when)}. ${f.mode === "host" ? "You call the numbers." : "The game calls the numbers."}</p>`;
  };
  const modeQuestions = (f) => { // "I press Start" exists at every size; "I do" (a Host calls every number) only up to 1,000 people
    const cap = Number(f.cap);
    if (cap > MANUAL_MAX) f.mode = "auto";
    const q2 = cap > MANUAL_MAX ? small("Games above 1,000 people are called by the game itself. You can still press Start yourself.", 'id="callhidden"') : radios("mode", "Who calls the numbers?", CALL_OPTS);
    return radios("start", "How should the game start?", START_OPTS) + q2 + modeSummary(f) + radios("after", "When every prize is won:", AFTER_OPTS);
  };
  // one small line under every group of tick boxes: what the boxes are for
  const HINTS = {
    occ: "The kind of party. It becomes the name of your game.", day: "The day guests should be ready.", time: "The time guests should be ready (India time). The first number comes 2 minutes later.",
    mode: "Auto: the numbers come by themselves. Host: a person presses a button for each number.", tix: "How many tickets each person plays with.",
    spd: "When the game calls the numbers itself, a new number comes every 12 seconds. 90 numbers take about 18 minutes. When a Host presses for each number, the Host sets the pace.", rnd: "Most events play 1 game. More games are played one after the other.",
    ver: "What a person must type to get in.", per: "The most people one guest can invite.",
    cats: "The kinds of guests they may invite.", ties: "What happens when two people complete the same line on the same number.", emp: "Tick this for a staff-only game: only people on your list can play and nobody can invite anyone.",
  };

  // ---------- (i) pop-ups: what each option does, and what it does not do ----------
  const INFOTXT = {
    step1: { t: "Date and time of the game", does: ["Gives the game its name (the occasion), the day and the start time in India time.", "Guests can join from the moment you publish. The first number comes 2 minutes after the start time.", "Check-in opens 5 minutes before the start time.", "Who calls the numbers (the software, or a Host who presses a button) is chosen in step 2."], not: ["It does not start the game by itself unless the game is paid for.", "It does not send any invitation: you share the link in a later step.", "After the game has started you cannot change the day or time."] },
    step2: { t: "Number of participants", does: ["Sets how many people can play, how many tickets each person gets, how fast the numbers come, how many rounds there are, who can join, and what people must give to get in.", "A game for 10 people or fewer is free. Bigger games are paid for before the start, by size."], not: ["It does not invite anyone: the people are added in the Invite step.", "Nobody can join after the game is full: they wait in the waiting room until you make space."] },
    step3: { t: "Set prizes", does: ["Choose which prizes the game has (for example Early Five, Top Line, Full House) and what each one is, such as a mug or a voucher.", "Each prize can have more than one winner position (1st, 2nd, ...).", "Winners are found by the software from the public numbers and the players' claims, so everyone sees the same winners."], not: ["It does not give out the real prizes: you hand them over. The report lists who won.", "It does not choose winners by hand. A player must press Claim for a prize in time."] },
    step4: { t: "Set brand moments", does: ["Add your company name, colour and logo, an opening message, breaks during the game, a closing message and lucky draws.", "Breaks have an exact length. The numbers stop during a break and every phone shows the break at the same moment."], not: ["It does not play sound or video unless you give a video link.", "It does not change the rules of the game or the prizes."] },
    step5: { t: "Make hosts and co-hosts", does: ["A Host runs the game with you (can press Next number in Host mode, pause and resume), sees the whole guest list and can add people.", "A Co-host helps with a group of people (for example one department). A Co-host can add and invite only their own group and sees only those people.", "A Host or Co-host can also pay for the game."], not: ["A Host or Co-host cannot change your account (sign-in keys, e-mail, close account).", "A Co-host cannot see anyone else's list and cannot add Hosts or Co-hosts."] },
    step6: { t: "Invite and share links", does: ["Shows the guest link to share by WhatsApp or e-mail, the number screen link for a meeting, and your own link to play the game yourself.", "You can add people by name and mobile number (or employee ID), upload a CSV, upload a PDF, or add one person at a time."], not: ["It does not send e-mails to guests by itself.", "Guests are not able to join before you publish."] },
    step7: { t: "Check and publish", does: ["Shows a summary of your game. Publishing makes the guest link work and the game appears for the people you invited.", "Publishing is free. You pay before the game starts."], not: ["It does not take payment.", "An unpaid game does not begin at its start time: it waits until it is paid."] },
    step8: { t: "Pay", does: ["Pay for the size of game you chose. Anyone can pay with the payment link, so your finance team can pay without logging in.", "When the payment is done the game unlocks by itself and the invoice is e-mailed to the payer and to you."], not: ["There are no refunds. If you cancel a paid game before it starts, the amount stays as credit for your next game.", "A Host or Co-host does not see the invoice details."] },
    step9: { t: "Game day", does: ["From here you can pause, resume or end the game, send a message to every phone, see how many people are present, and hand over prizes.", "In Host mode the Next number button lives here."], not: ["Pausing does not lose anything: the game carries on from the same number.", "Ending the game cannot be undone."] },
    step10: { t: "After the game", does: ["Shows your report: numbers called, winners, who was present.", "You can erase all guest data now. Otherwise it is erased automatically within 24 hours after the game ends."], not: ["The winners' record (who won what, and when they checked in) is kept for 365 days, because it is needed to settle prize claims.", "Erasing does not remove the invoice."] },
    occ: { t: "Occasion", does: ["The name of the occasion becomes the name of your game, shown to guests and in the report."], not: ["It does not change the rules or the look of the game."] },
    day: { t: "Which day", does: ["The day guests should be ready, in India time."], not: ["It does not start anything by itself. The game still needs to be published and paid for."] },
    time: { t: "Start time", does: ["The time guests should be ready, in India time. The first number comes 2 minutes later.", "Check-in opens 5 minutes before this time."], not: ["It does not delay the numbers: they start 2 minutes after this time, not at this time."] },
    start: { t: "How does it start?", does: ["By itself: the game begins at the start time you chose, with no one pressing anything.", "I press Start: at the start time the game waits. You or a Host press the big Start button on Game day. The numbers then begin together on every phone a short while later: about 40 seconds for a small game, a few minutes for a very large one, so that every phone has heard."], not: ["Start cannot be pressed before the start time. To start earlier, first change the start time.", "If nobody presses Start, the game does not begin by itself. Press Start, or change the start time.", "You can change this, and the start time, until the game starts. The links stay the same."] },
    mode: { t: "Who calls the numbers?", does: ["Auto: the software calls a new number every few seconds by itself. Nobody has to press anything.", "Host: a person presses Next number for each number, so they can speak between numbers. Phones show the number about 6 seconds after the press."], not: ["In Host mode, if nobody presses, no number comes.", "You cannot switch between Auto and Host after the game has started."] },
    tix: { t: "Tickets for each person", does: ["How many tickets every person plays with: 1 or 2.", "With 2 tickets a person has two chances for every prize; either ticket can win."], not: ["People cannot choose their own number of tickets.", "A second ticket does not mean a second prize for the same position."] },
    spd: { t: "Gap between two numbers", does: ["When the game calls the numbers itself, a new number comes every 12 seconds: calm enough to find it on your ticket, and a full game of 90 numbers takes about 18 minutes (about 36 minutes with two tickets). With claims, a game takes 30 to 60 minutes."], not: ["Breaks and pauses do not change the speed afterwards.", "It is locked once the game has started."] },
    rnd: { t: "Rounds", does: ["One round is one full game of up to 90 numbers. Two rounds means a second full game with new tickets and new numbers, straight after the first.", "The prizes are available again in every round."], not: ["Two rounds take about twice as long.", "Breaks and lucky draws belong to the first round."] },
    who: { t: "Who can join", does: ["Anyone with the link: whoever opens the link and types their details gets in straight away.", "Only people on a list: people you added get in; anyone else waits in a waiting room until you or a Host admits them."], not: ["It does not stop a person sharing the link, but a ticket only plays on one phone.", "The game stops accepting people when it is full."] },
    aud: { t: "Who is this game for?", does: ["Only my employees: only the people on the list you upload can play. Nobody can invite anyone. Each employee gives their employee ID, their mobile number, either, or both, as you choose.", "My employees, plus their friends and family: your employees play and each can invite a few guests by WhatsApp. People who are not on your list wait for you to say yes.", "A list of people I choose: customers, vendors, dealers or members you add. Only they play. Everyone else who opens the link waits for you.", "A list of people I choose, plus the people they invite: the same, and each person can invite a few more.", "Anyone with the link: whoever opens the link joins straight away with their mobile number. No list is needed.", "Anyone with the link, my employees confirm with their employee ID: anyone can join, and your employees prove who they are with their employee ID."], not: ["It does not check anyone against your company system: it checks against the list you give.", "A ticket plays on one phone only, whatever you choose.", "Until the game starts you can change this choice."] },
    emp: { t: "Only my employees", does: ["Only people on your list can play, and nobody can invite anyone else. People who are not on the list wait for you; you decide.", "Use it for staff-only games."], not: ["It does not check anyone against your HR system: it checks against the list you give.", "If you want families or vendors to play too, leave it unticked."] },
    ver: { t: "What must a person give to get in?", does: ["Mobile number: the person types their mobile number. The simplest choice.", "Employee ID: the person types their employee ID. A mobile number is optional.", "Mobile number or employee ID: either one is enough. Employees can use their ID; vendors and customers use their mobile number. Someone on your list is recognised by whichever they give.", "Mobile number and employee ID: employees must give both. Others give their mobile number only (unless you chose Only my employees)."], not: ["Employee ID alone is the lightest check: anyone who knows or guesses an ID can use it. Choose both for a stronger check.", "Employee IDs are shown only to the Organizer and the Hosts, never to other players or on the big screen.", "A wrong or unknown ID is not refused: that person waits and you decide whether to let them in."] },
    per: { t: "How many people can each guest invite", does: ["The most people one guest can bring in, for example family members."], not: ["Guests invited by a guest cannot invite more people."] },
    cats: { t: "Who can they invite", does: ["The kinds of people a guest may bring: family, colleagues, friends and so on. It is recorded so you can see how each person came in."], not: ["It does not check who the invited person really is."] },
    ties: { t: "If two or more people finish on the same number", does: ["Share: all of them win that prize together.", "Next: the first gets the prize, the next one gets the next position of that prize if there is one."], not: ["It does not decide anything by luck: the order is fixed from the public numbers so every phone agrees."] },
    bundle: { t: "Start from", does: ["Starts the game from a ready set of prizes, so you do not have to type them."], not: ["You can change every prize afterwards."] },
    play: { t: "Play the game yourself", does: ["The Organizer, Hosts and Co-hosts can play too. Press Play now to open your own ticket, or send the play link to your own WhatsApp.", "You keep your console open to run the game, and your ticket on your phone or in another tab.", "You tap numbers and press Claim like every other player."], not: ["Your seat is marked as the team's, so you cannot win the Unlucky prize or lucky draws: the people running the game are never picked.", "A ticket plays on one phone only: do not open your play link on two phones."] },
  };

  // ---------- the questions an organizer has about each option: why, how, what if ----------
  const INFOQA = {
    who: [
      ["Which one should I choose?", "Choose \"Anyone with the link\" when you want the easiest game: whoever receives the link can play at once. Choose \"Only people on a list\" when you want to decide who plays: only the people you add get a ticket."],
      ["What happens if I choose \"Anyone with the link\" (open for all)?", "Everyone who opens your link types their mobile number (or the detail you asked for) and gets a ticket straight away. You do not have to approve anyone. People you added to your list are recognised by their number. The game stops taking people when it is full."],
      ["What happens if I choose \"Only people on a list\"?", "Only the people you added can get in. A person types their mobile number on the link. If the number is on your list, they get a ticket at once. If it is not on your list, they see \"Please wait\" and the request appears in \"Waiting to come in\", where you or a Host presses Admit or Decline."],
      ["What if I share the common link and the game is \"Only people on a list\"?", "Nothing goes wrong. The common link is safe to send to a whole group, for example a WhatsApp group. People on your list get in by themselves. Everyone else waits and cannot play until you admit them. So you can send one link to everybody and still stay in control."],
      ["What if someone who is not on my list gets the link and I do nothing?", "They keep seeing \"Please wait\" and they do not get a ticket. If nobody answers in time, the request runs out and the person can ask again. You never have to do anything for the game to run."],
      ["Can I change this later?", "Yes, until the game starts. After the game has started it is locked."],
      ["Why would I choose a list?", "For staff-only games, for a closed group, or when you must be sure that only invited people play and you want to see who asks to come in."],
      ["Why would I choose open for all?", "For the widest reach with the least work: customers, vendors, families and employees, all with one link."],
    ],
    common: [
      ["What is the common link?", "One link for a whole group. You can send it in a WhatsApp group, by e-mail, on your intranet or on a screen. It is made so that nobody has to be invited one by one."],
      ["What does a person do with it?", "They open it, type their own mobile number (or employee ID, if you asked for that), tick the two boxes and press Join. Their ticket opens."],
      ["What happens depends on \"Who is this game for?\".", "If the game is open for all, everybody gets a ticket. If the game is for people on a list, only listed people get a ticket and everybody else waits for you to admit them."],
      ["Is the common link the same for every person?", "Yes. That is the point: one link for everyone. A personal link is different: it is made for one person only (see the personal link)."],
      ["What if the common link is forwarded to the wrong person?", "In an open game that person can play. In a list game they must wait for you. If you do not want them, press Decline, or remove them later."],
      ["What if two people share one phone?", "A ticket plays on one phone only, and each person needs their own mobile number. The second person must use their own phone or ask you to move the ticket."],
      ["What if I do not want the common link to work any more?", "In step 2, change \"Who is this game for?\" to a list choice such as \"A list of people I choose\" (until the game starts). People who are not listed will then wait for you."],
    ],
    personal: [
      ["What is a personal link?", "A link made for one listed person. They do not type anything: the link knows who they are. You can send it by WhatsApp from the list."],
      ["What if a personal link is forwarded to someone else?", "A ticket plays on one phone only. The first phone that opens it keeps the ticket. Anyone else who opens it is asked to use their own number and may have to wait for you."],
      ["Which is better, the personal link or the common link?", "The personal link is the easiest for the person (no typing) and the safest for you. The common link is the easiest for you (one link for everybody)."],
    ],
    waiting: [
      ["What is \"Waiting to come in\"?", "The list of people who opened your link but are not on your list. You decide for each one: Admit lets them in, Decline refuses them."],
      ["What if I admit someone by mistake?", "Open \"My people\" and remove them. They lose their ticket."],
      ["Who can admit people?", "The Organizer and the Hosts. A Co-host sees and decides only for the people who came through their own link."],
    ],
    emp: [
      ["What does \"Only my employees\" do exactly?", "It makes the game staff-only: only people on your list can play, and nobody can invite anybody else. Everyone else waits for you to decide."],
      ["What if an employee is not on my list?", "They wait. Add them to your list and they get in at once, or press Admit."],
      ["What if I want families or vendors to play too?", "Leave the box unticked. Then everyone can play, and you can still add your employees to the list."],
      ["Is this checked against my company's HR records?", "No. It is checked against the list you give us. Make sure the list is correct."],
    ],
    ver: [
      ["Which one should I choose?", "Use \"Mobile number\" for most games. Use \"Employee ID\" when your people know their ID but not each other's numbers. Use \"Mobile number or employee ID\" to let each person give whichever they remember. Use \"Mobile number and employee ID\" when you want the strongest check for employees."],
      ["What if an employee types a wrong ID?", "They are not refused. They wait, and you see the ID that was typed in \"Waiting to come in\". You decide."],
      ["What if an outsider has no employee ID?", "In a game that is not \"Only my employees\", outsiders simply type their mobile number and play."],
      ["Who can see the Employee IDs?", "Only the Organizer and the Hosts. Other players never see them, and they are not shown on the big screen."],
      ["Is the employee ID alone safe enough?", "It is the lightest check. Anyone who knows or guesses an ID can use it. For a stronger check choose \"Mobile number and employee ID\"."],
    ],
    mode: [
      ["What if I choose Host and the Host forgets to press?", "No number comes until a Host presses Next number. Phones show the number about 6 seconds after the press."],
      ["What if I choose Auto?", "Nobody has to do anything. The numbers come by themselves at the speed you choose and the game ends by itself."],
      ["Can I change this after the game has started?", "No."],
    ],
    tix: [["What if someone wants only one ticket?", "Everybody plays with the same number of tickets, so the game is fair. Choose 1 if you prefer a simpler game."]],
    spd: [["Can I make it faster?", "No. When the game calls the numbers itself, every game has one speed, a new number every 12 seconds, so everybody can follow. When a Host presses for each number, there is no fixed gap. Games made earlier keep the speed they were published with."]],
    rnd: [["What if I choose 2 rounds?", "After the first round there is a short break and then a second full game with new tickets. The prizes can be won again."], ["What if the first round ends early because all the prizes were won?", "The game moves straight on to the next round."]],
    ties: [["What if two people complete a line on the same number?", "With Share both win. With Next the first gets it and the other gets the next winner position of that prize, if there is one."]],
    per: [["What if I set it to zero?", "Guests cannot invite anyone."]],
    cats: [["Can I let guests invite anyone?", "Choose all the kinds. Each person who comes in through a guest is shown under the guest's name."]],
    occ: [["What if my occasion is not in the list?", "Choose Other and type your own name for the game."]],
    day: [["What if I pick the wrong day?", "Change it before the game starts. After the start it is locked."]],
    time: [["What time should I choose?", "The time you want guests to be ready. The first number comes 2 minutes later, and check-in opens 5 minutes before this time."]],
    play: [["What if I forget to press Play now?", "You can still play any time during the game: open your play link on your phone."], ["Can I win?", "Yes, you can win every prize except the Unlucky prize and lucky draws."]],
    bundle: [["What if I do not like the prizes it gives?", "Change, add or remove any prize afterwards."]],
    step1: [["What if I want to change the time later?", "You can, until the game starts. Guests who already have the link see the new time."]],
    step2: [["What if more people want to join than the limit?", "The game stops taking people when it is full. Raise the limit before the game starts, up to the size you paid for. For more people than that, make a new game like this one in step 7."]],
    step3: [["What if nobody claims a prize?", "Then nobody wins it. The game carries on until all the prizes are won or all 90 numbers have been called."]],
    step4: [["What if I add nothing here?", "Nothing is wrong: the game runs without a company name, breaks or messages."]],
    step5: [["What if I do not add anyone?", "That is fine. You can run the game on your own."]],
    step6: [["What if I use the common link and the personal links together?", "That is fine. Use personal links for people you know and the common link for groups."]],
    step7: [["What if I publish and then change my mind?", "You can still change most things until the game starts. You can also cancel it."]],
    step8: [["What if the payment fails?", "Nothing is taken and the game stays unpaid. Try again, or send the payment link to someone else."], ["What if someone else pays?", "Send them the payment link. They need no account. The game unlocks by itself once the payment is received."]],
    step9: [["What if I press Pause by mistake?", "Press Resume. The game carries on from the same number."], ["What if my internet goes down?", "The numbers keep coming on every phone by themselves. Only pause, resume and messages need your connection."]],
    step10: [["What if I need the report later?", "Open the report from the e-mail we send you. Erase the guest data only when you no longer need the names."]],
  };

  INFOTXT.common = { t: "The common link", does: ["One link for a whole group. Send it in a WhatsApp group, by e-mail or on your intranet.", "Each person types their own mobile number (or employee ID) and plays."], not: ["It is not made for one person: that is the personal link.", "It does not let people in by itself when the game is for people on a list: unlisted people wait for you."] };
  INFOTXT.personal = { t: "The personal link", does: ["A link made for one listed person. They do not type anything.", "You can send it from My people by WhatsApp."], not: ["It is not for forwarding: a ticket plays on one phone only."] };
  INFOTXT.waiting = { t: "Waiting to come in", does: ["Shows the people who opened your link but are not on your list. You press Admit or Decline for each."], not: ["Nobody in this list can play until you admit them."] };
  const iBtn = (key) => (INFOTXT[key] ? `<button type="button" class="zc-i" data-info="${key}" aria-label="More about: ${esc(INFOTXT[key].t)}">i</button>` : "");
  function openInfo(key) {
    const x = INFOTXT[key]; if (!x) return; closeInfo();
    const li = (a) => a.map((t) => `<li>${esc(t)}</li>`).join("");
    const m = document.createElement("div"); m.className = "zc-modal"; m.id = "zcmodal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-labelledby", "zcmt");
    m.innerHTML = `<div class="zc-mbox"><button type="button" class="zc-mx" data-info-close aria-label="Close">&times;</button><h3 id="zcmt">${esc(x.t)}</h3><div class="zc-mcols"><div><h4>What it does</h4><ul>${li(x.does)}</ul></div><div><h4>What it does not do</h4><ul>${li(x.not)}</ul></div></div>${(INFOQA[key] || []).length ? `<h4 class="zc-qah">Questions and answers</h4><dl class="zc-qa">${INFOQA[key].map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl>` : ""}<div class="zc-foot"><button type="button" class="zc-btn" data-info-close>Got it</button></div></div>`;
    m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-info-close]")) closeInfo(); });
    document.body.appendChild(m); const b = m.querySelector(".zc-btn"); if (b) b.focus();
  }
  function closeInfo() { const m = document.getElementById("zcmodal"); if (m) m.remove(); }
  /** A question that always shows (the browser's own confirm box can be blocked, and then the red button looks dead): true on Yes, false on No/Escape/outside tap; onYes runs inside the Yes tap (the only moment a new tab may open on a phone). */
  function askSure(title, text, yes, no, onYes, tick) { return new Promise((res) => { const old = document.getElementById("zcsure"); if (old) old.remove(); const m = document.createElement("div"); m.className = "zc-modal"; m.id = "zcsure"; m.setAttribute("role", "alertdialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-labelledby", "zcsuret"); m.innerHTML = `<div class="zc-mbox"><h3 id="zcsuret">${esc(title)}</h3>${String(text).split("\n\n").map((p) => `<p>${esc(p)}</p>`).join("")}${tick ? `<label class="zc-tick"><input type="checkbox" id="zcsuretick"> ${esc(tick)}</label>` : ""}<div class="zc-foot"><button type="button" class="zc-btn zc-btn-bad" data-y${tick ? " disabled" : ""}>${esc(yes)}</button> <button type="button" class="zc-btn zc-btn-alt" data-n>${esc(no)}</button></div></div>`; const key = (e) => { if (e.key === "Escape") done(false); }; const done = (v) => { document.removeEventListener("keydown", key); m.remove(); res(v); }; m.addEventListener("click", (e) => { if (e.target.closest("[data-y]")) { try { if (onYes) onYes(); } catch { /* the answer still counts */ } done(true); } else if (e.target === m || e.target.closest("[data-n]")) done(false); }); document.addEventListener("keydown", key); document.body.appendChild(m); if (tick) { const cb = m.querySelector("#zcsuretick"), yb = m.querySelector("[data-y]"); cb.onchange = () => { yb.disabled = !cb.checked; }; } const nb = m.querySelector("[data-n]"); if (nb) nb.focus(); }); }
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-info]"); if (b) { e.preventDefault(); e.stopPropagation(); openInfo(b.getAttribute("data-info")); } }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeInfo(); });
  const hintOf = (path) => (HINTS[path] ? `<span class="zc-hint2">${HINTS[path]}</span>` : "");
  const grp = (path, label, opts, multi) => `<span class="zc-lblrow"><span class="zc-lbl" id="${gid(path)}">${label}</span>${iBtn(path)}</span><div class="zc-chips" role="group" aria-labelledby="${gid(path)}">${opts.map(([v, l]) => chip(path, v, l, multi)).join("")}</div>${hintOf(path)}`;
  // Who is this game for? One plain choice that sets the existing settings (who can join, only my employees, guests may invite, what a person must give). See docs/ORGANIZER_FLOW_DESIGN_2026-10-25.md
  const AUD = [["1", "Only my employees (the list I upload)"], ["2", "My employees, plus their friends and family"], ["3", "A list of people I choose (customers, vendors, members)"], ["4", "A list of people I choose, plus the people they invite"], ["5", "Anyone with the link"], ["6", "Anyone with the link, my employees confirm with their employee ID"]];
  const audOf = (f) => (f.emp ? "1" : f.who === "anyone" ? (f.ver === "mobile" || !f.ver ? "5" : "6") : f.inv ? (f.ver === "mobile" || !f.ver ? "4" : "2") : "3");
  const applyAud = (f, a) => {
    f.aud = a; f.emp = a === "1"; f.who = a === "5" || a === "6" ? "anyone" : "list"; f.join = f.who; f.inv = a === "2" || a === "4";
    if (a === "3" || a === "4" || a === "5") f.ver = "mobile";
    else if (a === "6" && f.ver !== "id" && f.ver !== "both") f.ver = "id";
    else if ((a === "1" || a === "2") && f.ver === "mobile") f.ver = "id";
  };
  const verOptions = (a) => (a === "6" ? [["id", "Employee ID"], ["both", "Employee ID and mobile number"]] : [["id", "Employee ID"], ["mobile", "Mobile number"], ["either", "Employee ID or mobile number"], ["both", "Employee ID and mobile number"]]);
  const bchip = (path, label) => { const on = !!getP(path); return `<button type="button" class="zc-chip${on ? " on" : ""}" data-bool="${path}" aria-pressed="${on}">${esc(label)}</button>${iBtn(path)}${hintOf(path)}`; };
  // the reason a Save was refused is also shown right above the button the person just pressed (the top of a long step is out of sight on a phone)
  const footMsg = (n) => (S.toast && Number(S.open) === Number(n) ? `<div class="zc-toast zc-toast-foot" id="footmsg" role="alert">${esc(S.toast)}</div>` : "") + unsavedNote(n);
  const saveBtn = (n, label) => `<div class="zc-foot"><button class="zc-btn" type="button" data-save="${n}"${S.saving ? ' disabled aria-disabled="true"' : ""}>${S.saving === n ? "Saving…" : label}</button></div>`; // pressed once it says Saving and cannot be pressed again
  const cont = (n, label) => `${footMsg(n)}${saveBtn(n, label || "Continue")}`;
  const save = (n, label) => `${footMsg(n)}${saveBtn(n, label || "Save and continue")}`;
  const draftStop = () => (S.draft ? `<div class="zc-alert" id="draftstop" role="status"><b>Do not send links yet.</b> Your game is not published, so anyone who taps a link sees "not open yet". <button type="button" class="zc-mini" data-open="7">Publish in step 7 first</button></div>` : "");
  const small = (t, extra) => `<p class="zc-small"${extra ? " " + extra : ""}>${t}</p>`;
  const rowl = (left, right) => `<div class="zc-rowl"><span>${left}</span>${right || ""}</div>`;
  const lockedGame = () => !!S.started && !S.draft && !S.unpaid;
  const lockedNote = () => small("The game has started, so this can no longer be changed.");
  const when = (ms) => dmy(ms).replace(/,/g, "");
  const ist = (ms) => dmy(ms); // a friendly date and time, for example 11 Jan 2027, 3:16 pm
  const dayIst = (ms) => new Date(ms).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
  const pl = (n, one, many) => n + " " + (n === 1 ? one : many);

  /** Prize choice: chips for the ten popular prizes, "I will decide later" and "No prize", with the input beside the chosen one. */
  function prizePick(ptPath, pdPath) {
    const pt = getP(ptPath), p = ptOf(pt);
    let h = `<div class="zc-chips" role="group" aria-label="What is the prize?">${PT.map((x) => chip(ptPath, x[0], x[1])).join("")}</div>`;
    if (pt === "cash") { const c = cashParse(getP(pdPath)); h += `<div class="zc-chips" role="group" aria-label="Currency">${CUR.map((x) => `<button type="button" class="zc-chip${x[0] === c.cur ? " on" : ""}" data-cashcur="${pdPath}" data-v="${x[0]}" aria-pressed="${x[0] === c.cur}">${esc(x[2])}</button>`).join("")}</div><div class="zc-inline"><label class="zc-sr" for="${fid(pdPath)}-amt">Amount</label><input id="${fid(pdPath)}-amt" class="zc-in" inputmode="decimal" maxlength="14" placeholder="Digits only, for example 5000" data-cashamt="${pdPath}" value="${esc(c.amt)}"></div>`; }
    else if (p && p[3]) h += `<div class="zc-inline">${p[2] ? `<span>${p[2]}</span>` : ""}<label class="zc-sr" for="${fid(pdPath)}">${esc(p[3])}</label>${inp(pdPath, { ph: p[3], max: pt === "other" ? 80 : Math.min(70, 80 - p[1].length - (p[2] ? 5 : 2)) })}</div>`;
    if (pt === "later") h += small("Fine. We will remind you before you publish.");
    if (pt === "none") h += small("The ticket shows \"No prize\". The winner is still announced.");
    return h;
  }

  // ---------- step 1: your game ----------
  function stepGame() {
    if (!S.f) return small("Loading…");
    if (lockedGame()) return lockedNote() + readBack();
    const f = S.f, min = istDateStr(istNow()), max = istDateStr(new Date(S.info && S.info.moveUntilMs ? S.info.moveUntilMs - 1 : istNow().getTime() + 30 * 86400000)); // an unpaid game: 30 days; a paid one: as far as its credit lasts, 365 days from the payment
    return (S.cloneNew === eid && S.cloneDated !== eid ? `<div class="zc-box" id="newgameread"><b class="zc-bt">This is a new game. Nothing is paid or published yet.</b>${readBack()}</div>` : "") + grp("occ", "What is the occasion?", OCC.map((o) => [o, o]))
      + (f.occ === "Other" ? `<div class="zc-gap">${lbl("f-oname", "Name your game")}${inp("oname", { max: 60, ph: "Name your game" })}</div>` : "")
      + grp("day", "Which day? (India time)", dayOpts().concat([["other", "Pick another date"]]))
      + (f.day === "other" ? `<div class="zc-gap">${lbl("f-dayo", "Pick the date")}${inp("dayo", { type: "date", attrs: `min="${min}" max="${max}"` })}</div>` : "")
      + grp("time", "What time does it start?", TIMES.map(([v, l]) => [v, passedToday(f, v) ? l + " (passed)" : l]))
      + (f.time === "other" ? `<div class="zc-gap">${lbl("f-timeo", "Pick the time")}${inp("timeo", { type: "time", attrs: 'step="300"' })}</div>` : "")
      + small("Guests can join before. The first number comes 2 minutes after the start.")
      + save(1);
  }

  // ---------- step 2: how it plays ----------
  // the gap between two numbers: 9 or 12 seconds (an older game that uses 6 or 15 keeps its own value so it never disappears)
  const spdOpts = (cur) => { const o = [["12", "12 seconds"]]; const c = String(cur || ""); if (c && c !== "12") { /* an older game keeps the speed it was published with; new games have one speed */ o.push([c, c + " seconds"]); o.sort((a, b) => Number(a[0]) - Number(b[0])); } return o; };
  const capOptions = () => {
    const packs = (S.packs || []).map((k) => ({ n: k.upTo, price: k.inr })), cur = Number(S.f.cap);
    const list = packs.length ? packs : [100, 250, 500, 1000].map((n) => ({ n, price: 0 }));
    if (cur && !list.some((p) => p.n === cur)) list.push({ n: cur, price: 0 }), list.sort((a, b) => a.n - b.n);
    return [{ n: DEMO_CAP, price: 0, demo: true }].concat(list.filter((p) => p.n !== DEMO_CAP));
  };
  function stepPlay() {
    if (!S.f) return small("Loading…");
    if (lockedGame()) return lockedNote() + readBack();
    const f = S.f, cats = ZG.INVITE_CATEGORIES || [];
    const caps = capOptions().map((p) => `<button type="button" class="zc-chip${String(f.cap) === String(p.n) ? " on" : ""}" data-ck="cap" data-v="${p.n}" aria-pressed="${String(f.cap) === String(p.n)}"><span>${p.demo ? "Demo game · 10 people · Rs 0" : `Up to ${p.n} people`}</span></button>`).join("");
    const demoNow = Number(f.cap) > 0 && Number(f.cap) <= DEMO_CAP; f.demo = demoNow ? "1" : "0"; // a game of 10 people or fewer costs Rs 0; it is a real game in every other way
    const custom = !!f.capOther || !capOptions().some((p) => String(p.n) === String(f.cap)); // the sizes above are the choices; a different number is only for a crowd that fits none of them
    const own = `<div class="zc-gap"${custom ? "" : " hidden"}>${lbl("f-cap", "Your own number of players")}${inp("cap", { type: "number", ph: "For example 180", attrs: `inputmode="numeric" min="1" max="10000" step="1"` })}</div>` + (custom ? "" : `<div class="zc-chips zc-gap"><button type="button" class="zc-mini" data-bool="capOther">My crowd is a different size</button></div>`);
    return `<span class="zc-lbl zc-sec zc-sub">How many players</span>` + `<span class="zc-lbl" id="gl-cap">How many people at most?</span><div class="zc-chips" role="group" aria-labelledby="gl-cap">${caps}</div>` + own + (paidPack() ? small("Your payment covers up to " + paidPack() + " people. For more people, make a new game like this one in step 7.") : isFree10() && !S.draft ? small("This game is free for up to 10 people. To invite more, choose a bigger size in step 8 and pay: the game carries on.") : "") + small(demoNow ? "Invited guests count too. A game for 10 people or fewer is Rs 0: nothing to pay." : "Invited guests count too. The price is shown when you pay.")
      + `<span class="zc-lbl zc-sec zc-sub">How the game runs</span>` + modeQuestions(f)
      + small(f.start === "manual" ? "Start can be pressed only from the start time on. To start earlier, change the start time first." : f.mode === "host" ? "The order of the numbers still comes from the public random numbers, so nobody can choose a number." : "You pick the gap between the numbers just below.")
      + (f.mode === "host" ? small("A Host presses a button for each number, so there is no fixed gap: you decide the pace on game day.", 'id="nospeed"') : grp("spd", "Duration (gap) between two numbers", spdOpts(f.spd)))
      + grp("tix", "Tickets for each person (participant)", [["1", "1 ticket"], ["2", "2 tickets (more chances)"]])
      + hideWrap(grp("rnd", "How many full games in this event? (rounds)", [1, 2, 3, 4, 5].filter((n) => ROUNDS_VISIBLE.includes(n)).map((n) => [String(n), String(n) + (n === 1 ? " game" : " games")]))
      + small("One round is one full game of 90 numbers. With 2 rounds, guests play two games one after the other, each with new tickets and new numbers. Brand moments and lucky draws run in round 1 only."))
      + `<span class="zc-lbl zc-sec zc-sub">Who can play</span>` + (f.aud = f.aud || audOf(f), "") + grp("aud", "Who is this game for?", AUD)
      + small(({ 1: "Only the employees on your list can play, and nobody can invite anyone. Anyone else who opens your link waits for you to say yes.", 2: "Your employees play, and each employee can invite family and friends. People who are not on your list wait for you to say yes.", 3: "Only the people you add can play. Anyone else who opens your link waits for you to say yes.", 4: "The people you add can play, and each of them can invite a few more. Anyone else who opens your link waits for you to say yes.", 5: "Anyone who opens your link joins straight away. You do not need a list.", 6: "Anyone who opens your link can join. Your employees are recognised by their employee ID; add them to your list in step 6." })[f.aud])
      + (["1", "2", "6"].includes(f.aud) ? grp("ver", f.aud === "6" ? "What must an employee give?" : "What must an employee give to get in?", verOptions(f.aud))
        + small(f.ver === "id" ? "Each employee types their employee ID. This is the lightest check: anyone who knows or guesses an ID can use it. For a stronger check choose ID and mobile number." : f.ver === "both" ? "Each employee types their employee ID and their mobile number. This is the strongest check." : f.ver === "either" ? "Each employee types their employee ID or their mobile number: either one is enough." : "Each employee types their mobile number.") + (f.aud === "2" ? small("People an employee invites give their mobile number.") : "")
        : small("Each person types their mobile number. An employee ID does not apply to this choice."))
      + (f.inv ? `<div class="zc-box"><span class="zc-lbl zc-sec zc-sub">Guests bringing their own people</span>${grp("per", "How many people can each person invite?", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [String(n), String(n)]))}${grp("cats", "Who can they invite?", cats.map((k) => [k.id, k.label]), true)}${f.cats.length ? "" : small('Tick at least one kind of guest, or change "Who is this game for?" above.')}
          <ul class="zc-levels"><li><b>You, Hosts and Co-hosts:</b> invite as many as you like.</li><li><b>Each person you add:</b> up to ${esc(f.per)} people, by WhatsApp.</li><li><b>A person who was invited:</b> can play, cannot invite.</li></ul></div>` : "")
      + save(2);
  }

  // ---------- step 3: prizes ----------
  /** Make sure the per-winner prizes list has one entry for each winner (new ones start as a copy of the first). */
  function perFill(h) { h.per = h.per || []; const n = Number(h.n) || 1; while (h.per.length < n) h.per.push({ pt: h.pt, pd: h.pd }); return h.per; }
  function houseBox([k, name, how, max0]) {
    const f = S.f, h = f.hs[k], act = f.ph === k && h.on, max = Math.max(Number(max0) || 1, Number(h.n) || 1), cap = capOf(k, max0);
    const sumry = `${h.n} winner${Number(h.n) === 1 ? "" : "s"} · ${esc(h.diff ? "a prize for each" : ptext(h.pt, h.pd))}`;
    let body = "";
    if (act) {
      body += max > 1 ? grp(`hs.${k}.n`, "How many winners?", [1, 2, 3, 4, 5, 10, 20].filter((x) => x <= cap).map((x) => [String(x), String(x)]))
        + hideWrap(`<div class="zc-gap">${lbl(fid(`hs.${k}.n`), `Or type how many winners (1 to ${max})`)}${inp(`hs.${k}.n`, { type: "number", attrs: `inputmode="numeric" min="1" max="${max}" step="1"` })}</div>`) + `${small("If one person wins, the next person who finishes wins the next prize, until all your winners are found.")}` : small("One winner.");
      if (Number(h.n) > 1) body += `<div class="zc-chips zc-gap">${bchip(`hs.${k}.diff`, "A different prize for each winner")}</div>`;
      if (h.diff && Number(h.n) > 1) { const per = perFill(h); body += per.slice(0, Number(h.n)).map((_, i) => `<span class="zc-lbl">Prize for winner ${i + 1}</span>${prizePick(`hs.${k}.per.${i}.pt`, `hs.${k}.per.${i}.pd`)}`).join(""); }
      else body += `<span class="zc-lbl">What is the prize?</span>${prizePick(`hs.${k}.pt`, `hs.${k}.pd`)}`;
    }
    return `<div class="zc-box" data-house="${k}"><div class="zc-split"><label class="zc-check"><input type="checkbox" data-hc="${k}" ${h.on ? "checked" : ""}> ${esc(name)}</label>${h.on && !act ? `<span class="zc-split"><span class="zc-small zc-nomargin">${sumry}</span><button type="button" class="zc-mini" data-ph="${k}" aria-label="Change ${esc(name)}">Change</button></span>` : ""}</div><p class="zc-small zc-how">${esc(how || "")}</p>${body}</div>`;
  }
  function stepPrizes() {
    if (!S.f) return small("Loading…");
    if (lockedGame()) return lockedNote() + readBack();
    const two = Number(S.f.tix) === 2;
    return grp("bundle", "Start from", ["Classic", "Simple", "Rich", "Choose myself"].map((b) => [b, b]))
      + `<span class="zc-lbl">Tick the prizes. Each one says how to win.</span>` + small("Just like a real housie: numbers are called one by one, each player marks their own ticket and calls Claim, early prizes come first, then the lines, and the Full House last.") + HS.filter(([k]) => k !== "full2" || two).map(houseBox).join("")
      + hideWrap(`<div class="zc-block">${grp("ties", "If two or more people finish on the same number", [["next", "They take the next prizes, one after the other"], ["share", "They share that prize"]])}${small(S.f.ties === "share" ? "Everyone who finishes on the same number wins that same prize." : "A fixed, public order decides who gets the earlier prize, so nobody can steer it. Each person wins one prize of that house.")}</div>`)
      + small("You give the prizes. We provide the software.") + save(3);
  }

  // ---------- brand strip on the guest's ticket (Phase 3): company name, accent colour, a small logo ----------
  const BRAND_COLORS = [["#0B3D91", "Navy"], ["#1B7F5C", "Green"], ["#B3261E", "Red"], ["#6A1B9A", "Purple"], ["#C26A00", "Saffron"], ["#00798C", "Teal"], ["#37474F", "Charcoal"], ["#AD1457", "Pink"]]; // the eight colours the server accepts
  const previewUrl = () => "/preview.html#w=ticket&e=" + encodeURIComponent(eid);
  const previewButton = () => (canRun() && eid ? `<div class="zc-chips zc-gap"><a class="zc-chip" id="seeguests" href="${esc(previewUrl())}" target="_blank" rel="noopener">See what guests see</a></div>${small("Shows your game as it is saved, as a sample ticket marked PREVIEW. Save your changes first, then look. Nothing is sent to anyone.")}<p class="zc-small zc-warnt" id="previewnote" role="status" hidden></p>` : "");
  const brandHint = () => { const b = S.f.brand; return (b.logo || b.color) && !String(b.name || "").trim() ? `<p class="zc-small zc-warnt" id="brandhint" role="status">Type your company name above. Without it, your ${b.logo && b.color ? "logo and colour" : b.logo ? "logo" : "colour"} will not show on the tickets.${b.color && !b.logo ? " Or tap the colour again to take it off." : ""}</p>` : ""; }; // beside the boxes, the moment a logo or colour is chosen: the strip needs a name
  function brandBox() {
    const b = S.f.brand;
    return `<div class="zc-block" id="brandbox"><h3>Your brand on the ticket</h3>${small("Shown at the top of every guest's ticket. All of it is optional. A ticket cannot show &amp; or quote marks: we write &amp; as 'and'.")}${lbl("f-brand-name", "Company name")}${inp("brand.name", { max: 40, ph: "Company name" })}<div id="brandhintz">${brandHint()}</div>
      <span class="zc-lbl" id="gl-brandcolor">Accent colour</span><div class="zc-chips" role="group" aria-labelledby="gl-brandcolor">${BRAND_COLORS.map(([v, l]) => `<button type="button" class="zc-chip${b.color === v ? " on" : ""}" data-ck="brand.color" data-v="${v}" aria-pressed="${b.color === v}"><span class="zc-sw" style="background:${v}" aria-hidden="true"></span>${l}</button>`).join("")}</div>
      ${lbl("brandlogo", "Small logo (optional)")}<input id="brandlogo" class="zc-in" type="file" accept="image/png,image/jpeg,image/webp">${small(LOGO_RULES)}${b.logo ? `<div class="zc-logo"><img src="${esc(b.logo)}" alt="Your logo" width="48" height="48"><button type="button" class="zc-mini zc-danger" id="logorm">Remove logo</button></div>` : ""}${S.logoNote ? `<p class="zc-small zc-warnt" id="logonote" role="status">${esc(S.logoNote)}</p>` : small("We make it small for you, under 30 KB.")}
      ${previewButton()}</div>`;
  }
  // The logo rules (the same numbers as packages/beacon/src/config.ts, which the server enforces)
  const LOGO_RULES = "PNG, JPEG or WebP, up to 5 MB, at least 64 x 64 pixels, square or wide (at most 4 times wider than tall). Best: a square 256 x 256 picture with a white or see-through background. We shrink it to fit (30 KB, 192 pixels) and show it 30 pixels high on every ticket, in the browser and in the installed app.";
  /** Shrinks the chosen picture in the browser to a PNG or JPEG data URL of at most 30 KB. Nothing is sent anywhere else. */
  async function fitLogo(file) {
    // read as a data: URL (the page's security policy allows data: images, not blob: ones)
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("bad")); r.readAsDataURL(file); });
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("bad")); i.src = url; });
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height; if (!w0 || !h0) throw new Error("bad");
    if (Math.min(w0, h0) < 64) throw new Error("small");
    if (Math.max(w0, h0) > 4 * Math.min(w0, h0)) throw new Error("thin");
    const bytes = (d) => Math.ceil((d.length - d.indexOf(",") - 1) * 3 / 4);
    for (const side of [192, 144, 112, 80, 56]) {
      const k = Math.min(1, side / Math.max(w0, h0)), W = Math.max(1, Math.round(w0 * k)), H = Math.max(1, Math.round(h0 * k));
      for (const [type, q, white] of [["image/png", undefined, false], ["image/jpeg", 0.85, true], ["image/jpeg", 0.6, true]]) {
        const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); if (white) { g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); } g.drawImage(img, 0, 0, W, H);
        const d = c.toDataURL(type, q); if (d.startsWith("data:" + type) && bytes(d) <= 30720) return d;
      }
    }
    throw new Error("big");
  }
  // ---------- a payment link anyone can open ----------
  function payLinkBlock() {
    if (S.draft || isCancelled() || didNotStart() || payState().paid || payState().confirming) return "";
    return `<div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="copypaylink"${S.payBusy ? " disabled" : ""}>${S.payUrl ? "Copy payment link again" : "Copy payment link"}</button></div>${small(S.payUrl ? "Tap again to copy the same link. Nothing new is made, so the link you sent stays good." : "Making a new link stops the link you made before. Only make a new one if you have lost the first.")}${S.payLinkNote ? `<p class="zc-small" id="paylinknote" role="status">${esc(S.payLinkNote)}</p>` : ""}${S.payUrl && !S.payCopied ? `<div class="zlink" id="paylinkurl">${esc(S.payUrl)}</div>` : ""}`;
  }
  // ---------- step 4: brand moments ----------
  const YT_HOST = /^https:\/\/((www|m|music)\.)?(youtube\.com|youtu\.be)\//i; // the same host rule as the server (packages/beacon/src/config.ts): a phone's m.youtube.com is fine, any other address is refused on Save
  const ytC = (u) => YT_HOST.test(u) && /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/.test(u);
  function linkInfo(u0) {
    const u = fixUrl(u0 || "");
    if (!u) return { ok: true, text: "" };
    if (!/^https:\/\/[^\s<>"'`]+$/i.test(u)) return { ok: false, text: "The link must start with https:// and have no spaces." };
    if (ytC(u)) return { ok: true, text: "YouTube link: plays inside the game. If its owner has switched off showing it elsewhere, it will not play, so press Test it." };
    if (/\.(mp4|webm|m4v|mov|ogv)([?#]|$)/i.test(u)) return { ok: true, text: "Video file: plays inside the game." };
    if (/\.(mp3|m4a|aac|wav|ogg|oga)([?#]|$)/i.test(u)) return { ok: true, text: "Audio file: plays inside the game." };
    return { ok: false, text: "This link opens a new tab and takes guests out of the game. Use a YouTube link or a direct link to a video (.mp4) or audio (.mp3) file." };
  }
  const noteHtml = (path) => { const m = getP(path); if (!m || m.k === "msg") return ""; const r = linkInfo((m.v || "").trim()); return r.text ? `<span class="${r.ok ? "zc-okt" : "zc-badt"}">${esc(r.text)}</span>` : ""; };
  /** One brand moment: what it is (four kinds), the message or link, a title, and a Test it button that shows it exactly as a guest sees it. */
  function momentBox(g, i, title) {
    const m = S.f[g][i], p = `${g}.${i}`;
    const kinds = KINDS.concat(m.k === "slides" ? [["slides", "Slides (set earlier)"]] : []);
    const inputs = m.k === "msg"
      ? `<div class="zc-inline">${`<label class="zc-sr" for="${fid(p + ".t")}">Your message (up to 80 characters)</label>`}${inp(p + ".t", { ph: "Type your message (up to 80 characters)", max: 80 })}</div>`
      : `<div class="zc-inline"><label class="zc-sr" for="${fid(p + ".v")}">${m.k === "yt" ? "The YouTube link" : m.k === "aud" ? "The audio file link" : m.k === "slides" ? "The slides link" : "The video file link"}</label>${inp(p + ".v", { ph: m.k === "yt" ? "Paste the YouTube link" : m.k === "aud" ? "Paste the audio file link" : "Paste the video file link", max: 300 })}<button type="button" class="zc-mini" data-test="${p}">Test it</button></div>
         <p class="zc-small zc-safe">We do not save your video or audio. We play it straight from the link you paste, so the link must stay online while the game runs. Please press Test it to check that it plays before you publish.</p><p class="zc-small" data-lk="${p}">${noteHtml(p)}</p>${lbl(fid(p + ".t"), "Title guests see")}${inp(p + ".t", { ph: "Title", max: 80 })}`;
    const secs = g === "cl" ? "" : `${lbl(fid(p + ".s"), `How long (seconds, 15 to ${g === "op" ? 120 : 600}; leave empty for 60)`)}${inp(p + ".s", { type: "number", attrs: `min="15" max="${g === "op" ? 120 : 600}" step="3" inputmode="numeric"`, ph: "60" })}`;
    return `<div class="zc-box"><b class="zc-bt">${esc(title)}</b>${grp(p + ".k", "What is it?", kinds)}${inputs}${secs}${m.after ? small("Set earlier to play after number " + m.after + ".") : ""}</div>`;
  }
  const countChips = (path, max) => grp(path, "How many?", Array.from({ length: max + 1 }, (_, n) => [String(n), String(n)]));
  function stepBrand() {
    if (!S.f) return small("Loading…");
    if (lockedGame()) return lockedNote() + readBack();
    const f = S.f, t = Number(f.tix) || 1, lim = maxFor(t), u = usedMoments(), midUsed = momentsOut(f).breaks.length; // moments and lucky draws share the places "during the game"
    const N = (k) => Math.min(Number(f[k]) || 0, lim[{ opN: "op", midN: "mid", clN: "cl" }[k]]);
    let h = brandBox() + `<p class="zc-small">5 moments for each ticket. You have ${t} ticket${t === 1 ? "" : "s"} per person. Used: <b id="bmcount">${u} of ${5 * t}</b>.</p>`;
    if (u > 5 * t) h += `<p class="zc-small zc-badt">That is more than the allowance. Switch some off.</p>`;
    h += `<span class="zc-lbl zc-sec">Before the game starts</span>` + small("Plays while guests wait for the first number.") + countChips("opN", lim.op);
    for (let i = 0; i < N("opN"); i++) h += momentBox("op", i, "Moment " + (i + 1));
    h += `<span class="zc-lbl zc-sec">During the game (placed evenly)</span>` + small(`The numbers pause while it is shown. Moments and lucky draws share these ${lim.mid} places: <b id="midcount">${midUsed} used</b>.`) + countChips("midN", lim.mid);
    for (let i = 0; i < N("midN"); i++) h += momentBox("mid", i, "Moment " + (i + 1));
    f.lucky.forEach((l, i) => { h += `<div class="zc-box"><div class="zc-split"><b class="zc-bt">Lucky draw${f.lucky.length > 1 ? " " + (i + 1) : ""}</b><button type="button" class="zc-mini" data-luckydel="${i}" aria-label="Remove lucky draw ${i + 1}">Remove</button></div>${grp(`lucky.${i}.win`, "How many winners?", [["1", "1"], ["3", "3"], ["5", "5"], ["10", "10"]])}${grp(`lucky.${i}.style`, "How should it look?", [["draw", "A draw"], ["scratch", "A scratch card"]])}<span class="zc-lbl">What is the prize?</span>${prizePick(`lucky.${i}.pt`, `lucky.${i}.pd`)}</div>`; });
    h += midUsed >= lim.mid ? small(`All ${lim.mid} places during the game are used (moments and lucky draws together), so no more lucky draws can be added. Remove one to make room.`) : `<div class="zc-chips zc-gap"><button type="button" class="zc-chip" data-luckyadd="1">Add a lucky draw</button></div>`;
    h += `<span class="zc-lbl zc-sec">At the end of the game</span>` + small("Plays on the final screen.") + countChips("clN", lim.cl);
    for (let i = 0; i < N("clN"); i++) h += momentBox("cl", i, "Moment " + (i + 1));
    return h + save(4);
  }

  /** The read-back of steps 1 to 4: what is saved, with a Change button for each. */
  function readBack() {
    const f = S.f, c = S.cfg, inf = S.info; if (!f || !c || !inf) return "";
    const name = c.name || (f.occ === "Other" ? f.oname || "Your game" : f.occ);
    const prizes = (c.rewards || []).length, wait = (c.rewards || []).filter((r) => !r.text).length;
    const t = c.tickets, used = (c.opening || []).length + (c.breaks || []).length + (c.closing || []).length;
    const blankDate = S.cloneNew === eid && S.cloneDated !== eid;
    const rows = [["Game", blankDate ? `${name}, date and time still to pick` : `${name}, ${when(inf.startMs)}`, 1], ["People and play", `Up to ${inf.cap}, ${t} ticket${t === 1 ? "" : "s"}, ${hostMode() ? "a Host presses for each number" : `a number every ${inf.callSeconds} seconds`}, for: ${(() => { const c = S.cfg || {}, x = { emp: !!(c.employeesOnly || (S.sum && S.sum.employeesOnly)), who: whoNow(), inv: !!(c.invites && c.invites.on) || !!(S.sum && S.sum.invites && S.sum.invites.on), ver: vmode() }; return (AUD.find((r) => r[0] === audOf(x)) || ["", "only people on a list"])[1].toLowerCase(); })()}`, 2], ["Prizes", `${prizes} prize${prizes === 1 ? "" : "s"}${wait ? ` (${wait} to decide)` : ""}`, 3], ["Brand moments", `${used} of ${5 * t}`, 4]];
    return rows.map((r) => `<div class="zc-rowl"><span><span class="zc-small zc-nomargin">${r[0]}</span><br>${esc(r[1])}</span>${lockedGame() ? "" : `<button type="button" class="zc-mini" data-open="${r[2]}" aria-label="Change ${esc(r[0])}">Change</button>`}</div>`).join("")
      + (wait ? `<p class="zc-small zc-warnt">${wait} prize${wait === 1 ? " says" : "s say"} "decide later". You can still publish.</p>` : "");
  }

  // ---------- step 5: your team ----------
  const friendly = (e) => (e && e.status === 404 ? "This is not switched on yet. Please try again a little later." : e && e.status === 403 && !(e.message && !/^(forbidden|not allowed\.?)$/i.test(e.message)) ? "Please sign in again with the e-mail address you used." : (e && e.message) || "Something went wrong. Please try again.");
  function roleCards(only) {
    const li = (ok, t) => `<li class="${ok ? "zc-yes" : "zc-no"}"><span aria-hidden="true">${ok ? "&#10003;" : "&#10007;"}</span> <span class="zc-sr">${ok ? "Can: " : "Cannot: "}</span>${t}</li>`;
    const card = (c, name, items) => `<div class="zc-role" style="background:var(--bg-tint-${c});color:var(--text-tint-${c})"><b>${name}</b><ul>${items.join("")}</ul></div>`;
    const all = { organizer: card("blue", "Organizer", [li(1, "Everything in the game"), li(1, "Sign-in keys, e-mail, close account"), li(1, "Add Hosts and Co-hosts"), li(1, "Pay")]),
      host: card("aqua", "Host", [li(1, "Change the game, prizes and brand moments"), li(1, "Publish and run the game day"), li(1, "See the guest list"), li(1, "Add Co-hosts"), li(1, "Pay"), li(0, "The account: keys, e-mail, close account"), li(0, "Add Hosts")]),
      cohost: card("green", "Co-host", [li(1, "Invite people with their own link"), li(1, "Add and see their own people"), li(1, "See how many they brought"), li(1, "Pay"), li(0, "Change the game"), li(0, "See anyone else's list"), li(0, "Add Hosts or Co-hosts")])};
    return `<div class="zc-roles">${only ? all[only] : all.organizer + all.host + all.cohost}</div>`;
  }
  const coLimit = () => Number((S.sum && S.sum.coHostLimit) || 100);
  const EMAIL_RULE = "Guests and Co-hosts need only a name and a mobile number. No e-mail is needed. Only the Organizer and Hosts have an e-mail.";
  const maskPhone = (v) => { const t = String(v || ""); if (/[^0-9\s+\-]/.test(t)) return t; const d = t.replace(/\D/g, ""); return d.length > 4 ? "XXXXXX" + d.slice(-4) : t; };
  function teamRow(p, kind) {
    const link = S.teamLinks[p.id], canRetire = kind === "host" ? isOrg() : canRun();
    const SETUP = { ready: "Ready", "needs-mobile": "Still to add a mobile number", "waiting-for-host": "Waiting for them to open the link", "link-expired": "Their link has expired" };
    const setupLine = kind === "host" && p.setup && SETUP[p.setup] ? `<div class="zc-small zc-nomargin" data-setup="${esc(p.setup)}">${SETUP[p.setup]}</div>` : "";
    const newLink = kind === "host" && isOrg() && p.emailConfirmed === false && (p.setup === "waiting-for-host" || p.setup === "link-expired") ? `<div class="zc-chips zc-gap"><button type="button" class="zc-mini" data-newlink="${esc(p.id)}" data-label="${esc(p.label || "")}">Send a new link</button></div>` : "";
    return `<div class="zc-person"><div class="zc-split"><span><b>${esc(p.label || (kind === "host" ? "Host" : "Co-host"))}</b>${kind === "cohost" && p.brought !== undefined ? ` <span class="zc-small zc-nomargin">brought ${Number(p.brought) || 0}</span>` : ""}${kind === "host" && p.email ? ` <span class="zc-small zc-nomargin">${esc(p.email)}</span>` : ""}${kind === "host" && (p.phoneMasked || p.phone_masked || p.phone || p.mobile) ? ` <span class="zc-small zc-nomargin">mobile ${esc(maskPhone(p.phoneMasked || p.phone_masked || p.phone || p.mobile))}</span>` : ""}${kind === "cohost" && (p.phoneMasked || p.phone_masked || p.phone || p.mobile) ? ` <span class="zc-small zc-nomargin">mobile ${esc(maskPhone(p.phoneMasked || p.phone_masked || p.phone || p.mobile))}</span>` : ""}</span>${canRetire ? `<button type="button" class="zc-mini zc-danger" data-retire="${esc(p.id)}" data-kind="${kind}" aria-label="Remove ${esc(p.label || kind)}">Remove</button>` : ""}</div>
      ${setupLine}${newLink}${link ? `<div class="zc-linkrow"><span class="zlink">${esc(link)}</span><button type="button" class="zc-mini" data-copyteam="${esc(p.id)}">Copy link</button>${S.teamWa[p.id] ? `<a class="zc-mini" data-hostwa="${esc(p.id)}" href="${esc("https://wa.me/" + S.teamWa[p.id].d + "?text=" + encodeURIComponent("Hi " + S.teamWa[p.id].name + ", you are a " + (S.teamWa[p.id].role || "Host") + " for Corporate Tambola" + (S.cfg && S.cfg.name ? ": " + S.cfg.name : "") + ". Your personal link: " + link))}" target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>` : ""}</div>` : small("This personal link was shown once, when you added them. To get a new one, press Remove, then add them again.")}</div>`;
  }
  const teamFoot = (k) => (S.teamFoot && S.teamFoot.k === k ? `<div class="zc-toast${S.teamFoot.ok ? "" : " zc-toast-foot"}" role="${S.teamFoot.ok ? "status" : "alert"}">${esc(S.teamFoot.t)}</div>` : ""); function stepTeam() {
    const T = S.team, max = (T && T.maxHosts) || 5, hosts = (T && T.hosts) || [], co = (T && T.cohosts) || [];
    let h = (hostMode() ? small("You chose that a Host presses a button for each number. You can do it yourself, or add a Host here to do it on game day.") : "") + roleCards() + (S.teamNote ? `<div class="zc-toast" role="status">${esc(S.teamNote)}</div>` : "");
    if (!T && S.teamErr) h += `<p class="zc-small zc-warnt" role="status">${esc(S.teamErr)}</p>`;
    h += `<span class="zc-lbl zc-sec">Your Hosts: ${hosts.length} of ${max}</span>` + hosts.map((p) => teamRow(p, "host")).join("");
    if (isOrg()) h += `<div class="zc-inline"><label class="zc-sr" for="hostlabel">Name of the new Host</label><input id="hostlabel" value="${esc((S.tv || {}).hostlabel || "")}" class="zc-in" maxlength="40" placeholder="Name" autocomplete="off" required><label class="zc-sr" for="hostphone">Mobile number of the new Host</label><input id="hostphone" value="${esc((S.tv || {}).hostphone || "")}" class="zc-in" inputmode="tel" placeholder="Mobile number, 98765 43210" autocomplete="off"><label class="zc-sr" for="hostemail">E-mail of the new Host</label><input id="hostemail" value="${esc((S.tv || {}).hostemail || "")}" class="zc-in" type="email" maxlength="120" placeholder="E-mail (their link is sent here)" autocomplete="off"><button type="button" class="zc-btn zc-btn-s" id="hostadd"${hosts.length >= max ? " disabled" : ""}>Add a Host</button></div>${teamFoot("host")}${hosts.length >= max ? small(`You have the most Hosts allowed (${max}). Remove one to add another.`) : small("A Host needs a name and a mobile number or an e-mail, or both. With an e-mail we send their personal link there. With only a mobile number, you send it on WhatsApp.")}`;
    else h += small("Only the Organizer adds Hosts.");
    h += `<span class="zc-lbl zc-sec">Your Co-hosts: ${co.length} (no limit)</span>` + co.map((p) => teamRow(p, "cohost")).join("");
    h += `<div class="zc-inline"><label class="zc-sr" for="cohostlabel">Name of the new Co-host</label><input id="cohostlabel" value="${esc((S.tv || {}).cohostlabel || "")}" class="zc-in" maxlength="40" placeholder="Name" autocomplete="off" required><label class="zc-sr" for="cohostphone">Mobile number of the new Co-host</label><input id="cohostphone" value="${esc((S.tv || {}).cohostphone || "")}" class="zc-in" inputmode="tel" placeholder="Mobile number, 98765 43210" autocomplete="off" required><button type="button" class="zc-btn zc-btn-s" id="cohostadd">Add a Co-host</button></div>${teamFoot("cohost")}`;
    if (isOrg()) h += `<span class="zc-lbl" id="gl-cohl">Each Co-host can add up to</span><div class="zc-chips" role="group" aria-labelledby="gl-cohl">${[10, 50, 100, 250, 500, 1000].map((n) => `<button type="button" class="zc-chip${coLimit() === n ? " on" : ""}" data-cohl="${n}" aria-pressed="${coLimit() === n}">${n} people</button>`).join("")}</div>${small("This is for each Co-host. You can change it any time.")}`;
    h += `<p class="zc-small" id="emailrule">${EMAIL_RULE}</p>`;
    return h + small("Send it to that one person only.") + cont(5);
  }

  // ---------- step 6: invite and share ----------
  const guestLink = () => location.origin + "/z.html?e=" + encodeURIComponent(eid) + (BASE ? "&api=" + encodeURIComponent(BASE) : "");
  const bigLink = () => location.origin + "/big.html?e=" + encodeURIComponent(eid);
  const inviteText = () => rehShare() + `You are invited to play Corporate Tambola${S.cfg && S.cfg.name ? ": " + S.cfg.name : ""}. Join here: ${guestLink()}`;
  const waUrl = (num) => "https://wa.me/" + (num || "") + "?text=" + encodeURIComponent(inviteText());
  const waNumber = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length === 10 ? "91" + d : d; };
  // ---------- My people (docs/ROLES_AND_CONSOLE_SPEC_3.md): one list per inviter ----------
  // A typed number is matched to a list, not proven. The personal link is the strong proof. The server keeps the numbers sealed; this page shows them masked.
  const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "";
  /** One typed number becomes digits with a country code (91 for a plain Indian mobile), or null when it looks wrong. */
  function cleanPhone(raw) {
    const t = String(raw == null ? "" : raw).trim(), intl = /^\+/.test(t) || /^00/.test(t);
    let d = t.replace(/\D/g, ""); if (/^00/.test(t)) d = d.slice(2);
    if (intl) return /^91/.test(d) ? (/^91[6-9]\d{9}$/.test(d) ? d : null) : /^[1-9]\d{7,14}$/.test(d) ? d : null;
    if (/^0\d{10}$/.test(d)) d = d.slice(1);
    if (/^[6-9]\d{9}$/.test(d)) return "91" + d;
    if (/^91\d{10}$/.test(d)) return /^91[6-9]\d{9}$/.test(d) ? d : null;
    return /^[1-9]\d{10,14}$/.test(d) ? d : null;
  }
  const vmode = () => (S.sum && S.sum.verify) || (S.cfg && S.cfg.verify) || "mobile";
  const empOnlyNow = () => !!((S.sum && S.sum.employeesOnly) || (S.cfg && S.cfg.employeesOnly));
  async function pdfText(file) {
    if (file.size > 8 * 1024 * 1024) throw new Error("This PDF is too big (over 8 MB). Please send fewer people at a time.");
    const lib = await import("./vendor/pdfjs/pdf.min.mjs"); lib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", location.href).href;
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise, out = [];
    for (let n = 1; n <= Math.min(doc.numPages, 60); n++) {
      const tc = await (await doc.getPage(n)).getTextContent(), rows = [], merged = [];
      for (const it of tc.items) { if (!it.str || !it.str.trim()) continue; const y = it.transform[5], x = it.transform[4]; let r = rows.find((q) => Math.abs(q.y - y) < 3); if (!r) rows.push((r = { y, cells: [] })); r.cells.push({ x, w: it.width || 0, s: it.str }); }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) { r.cells.sort((a, b) => a.x - b.x); const cs = []; for (const c of r.cells) { const last = cs[cs.length - 1]; if (last && c.x - (last.x + last.w) < 3) { last.s += c.s; last.w = c.x + c.w - last.x; } else cs.push({ x: c.x, w: c.w, s: c.s }); } merged.push(cs); }
      // columns follow the header row, so an empty cell stays empty and the next cell does not slide into its column
      const colX = n === 1 || !out.colX ? (merged[0] || []).map((c) => c.x) : out.colX; if (n === 1 && colX.length > 1) out.colX = colX;
      for (const cs of merged) {
        if (colX.length > 1 && cs.length < colX.length) { const arr = colX.map(() => ""); for (const c of cs) { let k = 0; for (let q = 0; q < colX.length; q++) if (c.x >= colX[q] - 4) k = q; arr[k] = (arr[k] ? arr[k] + " " : "") + c.s.trim(); } out.push(arr.map((s) => s.replace(/,/g, " ")).join(",")); }
        else out.push(cs.map((c) => c.s.trim().replace(/,/g, " ")).join(","));
      }
    }
    if (!out.length) throw new Error("This PDF has no text in it. It looks like a photo or a scan. Please save it from Excel (File, Save as, PDF).");
    return out.join("\n");
  }
  function cleanBatch(rows) {
    const seen = new Set(), good = [], wrong = []; let dups = 0;
    for (const r of rows) {
      const name = String(r.name || "").trim(), emp = String(r.empId || "").replace(/\s+/g, "").toUpperCase();
      if ((vmode() === "id" && emp) || (vmode() === "either" && emp && !String(r.phone || "").trim())) { // known by employee ID: a mobile number is welcome but not needed
        const d0 = String(r.phone || "").trim() ? cleanPhone(r.phone) : "";
        if (String(r.phone || "").trim() && !d0) { wrong.push({ name, raw: String(r.phone || ""), empId: emp, why: "The mobile number looks wrong." }); continue; }
        if (seen.has("E" + emp)) { dups++; continue; }
        seen.add("E" + emp); good.push({ name, phone: d0, empId: emp }); continue;
      }
      const d = cleanPhone(r.phone);
      if (!d) { wrong.push({ name, raw: String(r.phone || ""), empId: emp, why: String(r.phone || "").trim() ? "The mobile number looks wrong." : vmode() === "mobile" ? (emp ? "This game asks for a mobile number, not an employee ID. Type the number here, or choose Only my employees in step 2." : "A mobile number is needed.") : emp ? "A mobile number is needed as well." : "A mobile number or an employee ID is needed." }); continue; }
      if (seen.has(d)) { dups++; continue; }
      seen.add(d); good.push({ name, phone: d, ...(emp && vmode() !== "mobile" ? { empId: emp } : {}) });
    }
    return { good, dups, wrong };
  }
  const stLabel = (s2) => ({ invited: "Invited", joined: "Joined", waiting: "Waiting", removed: "Removed" }[String(s2 || "invited").toLowerCase()] || "Invited");
  const startedNow = () => (role() === "cohost" ? !!(S.coh && S.coh.startMs && S.coh.startMs <= Date.now()) : !!S.started);
  const canRemove = () => canRun() || !startedNow();
  const commonLink = () => S.pp.common || (role() === "cohost" ? cohInvite() : guestLink());
  const digitsOf = (p) => { const d = String(p.phone || "").replace(/\D/g, ""); if (d.length >= 10) return d.length === 10 ? "91" + d : d; const m = String(p.waLink || "").match(/wa\.me\/(\d{8,15})/); return m ? m[1] : ""; };
  const waText = (p) => `Hi ${firstName(p.name) || "there"}, you are invited to play Corporate Tambola${S.cfg && S.cfg.name ? ": " + S.cfg.name : S.coh && S.coh.name ? ": " + S.coh.name : ""}. Your personal link: ${p.link || commonLink()}`;
  const waHref = (p) => p.waLink || ""; // the server builds it: wa.me/<number>?text=<short message with the personal link>
  const sentKey = () => "ctz-sent-" + eid;
  const markSent = (id) => { S.pp.sent[id] = 1; if (S.pp.fresh) delete S.pp.fresh[id]; ls.set(sentKey(), JSON.stringify(S.pp.sent)); };
  const last4Of = (w) => w.last4 || String(w.maskedPhone || w.masked || "").replace(/\D/g, "").slice(-4);
  const canContacts = () => { try { return !!(navigator.contacts && typeof navigator.contacts.select === "function"); } catch { return false; } };
  async function loadPeople() {
    if (S.shield || !eid || !(canRun() || role() === "cohost")) return;
    const P = S.pp; if (P.sentFor !== eid) { P.sentFor = eid; P.me = null; P.meNeed = false; try { P.sent = JSON.parse(ls.get(sentKey()) || "{}") || {}; } catch { P.sent = {}; } }
    try {
      const r = await call("GET", `/api/z/${eid}/people`), all = (r.people || []).slice();
      let last = (r.people || []).length; while (last >= 200) { const more = await call("GET", `/api/z/${eid}/people?offset=${all.length}`), rows = more.people || []; last = rows.length; all.push(...rows); } // a long list arrives in pages of 200, removed rows included: stop on a short page
      P.list = all; P.limit = role() === "cohost" ? Number(r.limit) || 100 : 0; P.used = typeof r.used === "number" ? r.used : null; P.common = r.commonLink || ""; P.canExport = !!r.canExport; P.err = ""; P.stale = "";
    } catch (e) { const m = e.status === 404 || e.status === 405 ? "My people list is not switched on yet. Please try again a little later." : friendly(e); if (P.list) P.stale = m; else { P.list = null; P.err = m; } }
    try { const w = await call("GET", `/api/z/${eid}/waiting`); P.waiting = w.waiting || []; P.approved = w.approved || []; } catch { /* the last waiting list stays until the next answer */ }
  }
  /** The caller's own play seat (POST /people/me), made only when they ask for it. */
  async function ensureMe(typed) {
    const P = S.pp; if (P.me && !typed) return P.me;
    const r = await call("POST", `/api/z/${eid}/people/me`, typed ? { phone: typed } : {}); P.me = r.person || null; P.meNeed = false; return P.me;
  }
  const needPeople = () => S.open === 6 && canRun() && !S.shield;
  // ---------- what you know about each person, and safe reading of files ----------
  const COLS = [["mobile", "Name and mobile number"], ["id", "Name and employee ID"], ["both", "Name, employee ID and mobile number"]];
  const colsAllowed = () => { const v = vmode(); return v === "mobile" || role() === "cohost" ? ["mobile"] : v === "both" ? ["mobile", "both"] : ["mobile", "id", "both"]; }; const colsNow = () => { if (S.cols && colsAllowed().includes(S.cols)) return S.cols; const v = vmode(); return v === "id" ? "id" : v === "either" || v === "both" ? "both" : "mobile"; };
  const MAX_CSV_BYTES = 1048576, MAX_LIST_ROWS = 5000; const junkText = (junk) => junk.slice(0, 5).map((x) => (x.name || x.raw || "a row") + " (" + String(x.why || "").replace(/ It was left out\.$/, "").replace(/\.$/, "") + ")").join("; ") + (junk.length > 5 ? "; and " + (junk.length - 5) + " more" : "") + ".";
  const stripCtl = (t) => Array.from(t).filter((ch) => { const c = ch.charCodeAt(0); return !(c < 32 || c === 127 || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029 || c === 0xfeff); }).join("");
  const NAME_OK = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\s.'\p{Pf}\p{Pi}\-()\/&,_]{0,59}$/u, EMP_OK = /^[A-Za-z0-9][A-Za-z0-9._\-\/]{0,29}$/;
  /** Reads a chosen file as plain text only after it passes the checks; throws an Error with a plain sentence otherwise. */
  async function readListFile(f, kind) {
    const nm = String(f.name || "").toLowerCase();
    if (/\.(xlsx|xls|xlsm|xlsb|ods|numbers)$/.test(nm)) throw new Error("Excel files are not accepted. In Excel choose File, Save as, " + (kind === "pdf" ? "PDF" : "CSV") + ", then upload that.");
    if (kind === "csv" && !/\.(csv|txt|tsv)$/.test(nm)) throw new Error("Please choose a CSV file (it ends with .csv).");
    if (kind === "pdf" && !/\.pdf$/.test(nm)) throw new Error("Please choose a PDF file (it ends with .pdf).");
    if (f.size > (kind === "pdf" ? 8 * 1048576 : MAX_CSV_BYTES)) throw new Error("This file is too big (more than " + (kind === "pdf" ? "8" : "1") + " MB). A list of names and numbers is much smaller. Please check you chose the right file.");
    if (!f.size) throw new Error("This file is empty.");
    const buf = new Uint8Array(await f.arrayBuffer());
    const head = String.fromCharCode.apply(null, Array.from(buf.slice(0, 8)));
    if (kind === "pdf") { if (head.indexOf("%PDF-") !== 0) throw new Error("This is not a real PDF file."); return buf; }
    if (head.slice(0, 2) === "MZ" || head.slice(0, 4) === "PK" + String.fromCharCode(3, 4) || head.slice(0, 4) === "%PDF" || head.slice(0, 4) === String.fromCharCode(0x7f) + "ELF" || head.slice(0, 2) === "#!") throw new Error("This is not a plain CSV file. Please save your list as CSV and try again.");
    if (buf.indexOf(0) >= 0) throw new Error("This is not a plain CSV file. Please save your list as CSV and try again.");
    let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { throw new Error("This file is not plain text. Please save your list as CSV (UTF-8) and try again."); }
    if (/<\s*(script|html|iframe|object|embed)/i.test(text)) throw new Error("This file contains web code, not a list. It was not used.");
    if (text.split(/\r?\n/).length > MAX_LIST_ROWS + 1) throw new Error("This list has more than " + MAX_LIST_ROWS + " rows. Please split it into smaller files.");
    return text;
  }
  /** Keeps only rows that look like real people: a tidy name, a real number, a tidy ID. Anything else is junk and is returned separately with the reason. */
  function vetRows(rows) {
    const ok = [], junk = [];
    for (const r of rows) {
      const cells = [r.name, r.phone, r.empId].map((c) => stripCtl(String(c == null ? "" : c)).trim());
      const [name, phone, empId] = cells, shown = { name, raw: phone || empId };
      if (cells.some((c) => /^[=@]/.test(c) || /^[+\-]\s*[^\d\s()]/.test(c))) { junk.push({ ...shown, why: "This row starts with a symbol that spreadsheets use for formulas. It was left out." }); continue; }
      if (cells.some((c) => /[<>`{}\\]|https?:\/\/|www\./i.test(c))) { junk.push({ ...shown, why: "This row has web or code characters. It was left out." }); continue; }
      if (name && /^[\d\s+()\-]{6,}$/.test(name)) { junk.push({ ...shown, why: "The name looks like a number. It was left out." }); continue; }
      if (name && !NAME_OK.test(name)) { junk.push({ ...shown, why: "The name can have letters, numbers and . ' - ( ) / & only, and up to 60 characters. It was left out." }); continue; }
      if (empId && !EMP_OK.test(empId.replace(/\s+/g, ""))) { junk.push({ ...shown, why: "The employee ID has unusual characters. It was left out." }); continue; }
      if (!phone && !empId) { junk.push({ ...shown, why: vmode() === "mobile" ? "There is no mobile number." : "There is no mobile number and no employee ID." }); continue; }
      ok.push({ name, phone, empId });
    }
    return { ok, junk };
  }
  async function addPeople(raw, keep, fromForm) {
    const P = S.pp;
    if (P.adding) { P.sum = "Still adding the last list. Please wait a moment, then try again."; return redraw(); } if (!raw.length) { P.sum = "Add a name and a number first."; return redraw(); }
    const consent = { v: CBConsent.version, boxes: ["A"] }; // the right to use these names and numbers is part of the Terms the Organizer accepted (clause 11.4A); no separate box is shown
    const { good, dups, wrong } = cleanBatch(raw); let added = good.length, serverDup = 0, got = 0, counted = false; const bad = wrong.slice();
    try {
      P.adding = true; P.sum = "Adding " + raw.length + (raw.length === 1 ? " person" : " people") + "..."; redraw(); for (let i = 0; i < good.length; i += 200) {
        const r = await call("POST", `/api/z/${eid}/people`, { consent, people: good.slice(i, i + 200).map((p) => ({ name: p.name, ...(p.phone ? { phone: "+" + p.phone } : {}), ...(p.empId ? { empId: p.empId } : {}) })) });
        serverDup += Number(r.duplicates) || 0; if (typeof r.added === "number") { got += r.added; counted = true; }
        const idOf = new Map(good.slice(i, i + 200).filter((g) => g.phone && g.empId).map((g) => [g.phone, g.empId])); /* the server names a refused row by name and number only: its employee ID is looked up from what was just sent */
        for (const x of r.invalid || []) { const q = parseList(String(typeof x === "string" ? x : x.raw || ""))[0] || { name: "", phone: "" }, ei = idOf.get(cleanPhone(q.phone)); bad.push({ name: q.name, raw: q.phone, ...(ei ? { empId: ei } : {}), why: typeof x === "string" ? "" : x.why || "" }); }
      }
      if (counted) added = got;
      const d = dups + serverDup;
      P.sum = `${added} good, ${d === 1 ? "1 duplicate" : d + " duplicates"} removed, ${bad.length === 1 ? "1 looks wrong" : bad.length + " look wrong"}`;
      P.wrong = keep ? P.wrong.concat(bad) : bad; if (fromForm && !bad.length) P.form = null;
    } catch (e) { P.sum = friendly(e); } P.adding = false;
    await loadPeople(); redraw();
  }
  function removeBox(p) {
    const nm = esc(p.name || "this person");
    return `<div class="zc-box zc-gap" role="group" aria-label="Remove ${nm}"><p class="zc-small zc-nomargin">${startedNow() ? `Take your time. Their phone will stop. If ${nm} already won, the win stands and the prize is marked not given.` : `${nm} loses their place and their link stops. You can add them again later.`}</p><div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s zc-btn-bad" data-rm="${esc(p.id)}" data-with="0">Only this person</button><button type="button" class="zc-btn zc-btn-s zc-btn-bad" data-rm="${esc(p.id)}" data-with="1">This person and everyone they invited</button><button type="button" class="zc-btn zc-btn-s zc-btn-alt" data-rmno="1">Keep them</button></div></div>`;
  }
  function personRow(p) {
    const id = esc(p.id), st = stLabel(p.status), gone = st === "Removed", sent = !!S.pp.sent[p.id], href = waHref(p);
    const extra = [p.role ? "This is your own seat (" + (WHO[p.role] || p.role) + ")" : "", p.inviter && canRun() && !p.role ? "Invited through " + p.inviter : "", p.approvedBy ? "Let in by " + p.approvedBy : "", sent && !gone ? "Sent on WhatsApp" : "", !sent && !gone && S.pp.fresh && S.pp.fresh[p.id] ? "New link ready, the old one has stopped" : ""].filter(Boolean).map(esc).join(" &middot; ");
    let btns = "";
    if (!gone) {
      btns += S.draft ? `<button type="button" class="zc-mini" data-open="7">Publish first</button>` : sent ? `<button type="button" class="zc-mini" data-resend="${id}">Send a new link</button>` : href ? `<a class="zc-mini" data-wa="${id}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Send on WhatsApp</a>` : "";
      if (canRemove() && !p.role) btns += `<button type="button" class="zc-mini zc-danger" data-rmask="${id}" aria-label="Remove ${esc(p.name || "this person")}">Remove</button>`;
    }
    return `<div class="zc-prow" data-pid="${id}"><div class="zc-split"><span><b>${esc(p.name || "No name")}</b> <span class="zc-small zc-nomargin">${esc(p.maskedPhone || "")}</span></span><span class="zc-stt zc-stt-${st.toLowerCase()}">${st}</span></div>${extra ? `<div class="zc-small zc-nomargin">${extra}</div>` : ""}${btns ? `<div class="zc-chips zc-gap">${btns}</div>` : ""}${S.pp.confirm === p.id && !gone ? removeBox(p) : ""}</div>`;
  }
  function waitingPanel() {
    const P = S.pp, W = P.waiting; if (!W) return "";
    const rows = W.map((w) => `<div class="zc-prow" data-wid="${esc(w.id)}"><div class="zc-split"><span><b>${esc(firstName(w.firstName || w.name))}</b> ${last4Of(w) ? `<span class="zc-small zc-nomargin">&middot;&middot;&middot;&middot; ${esc(last4Of(w))}</span>` : ""}${w.empId ? ` <span class="zc-small zc-nomargin">Employee ID typed: <b>${esc(w.empId)}</b></span>` : ""}</span></div><div class="zc-small zc-nomargin">Asking through ${esc(({ "common-link": "the common link", "personal-link": "a personal link", direct: "the game link" })[w.via] || w.via || w.inviter || w.throughName || "the common link")}</div><div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s" data-wid="${esc(w.id)}" data-decide="admit">Admit</button><button type="button" class="zc-btn zc-btn-s zc-btn-alt" data-wid="${esc(w.id)}" data-decide="decline">Decline</button></div></div>`).join("");
    const done = P.decided.concat((P.approved || []).map((a) => ({ name: firstName(a.firstName || a.name), last4: last4Of(a), decision: a.decision || "admit", by: a.by || a.approvedBy || "", ms: a.ms || a.approvedMs || 0 }))).slice(0, 8)
      .map((d) => `<div class="zc-small zc-nomargin">${esc(d.name)} &middot;&middot;&middot;&middot; ${esc(d.last4)}: ${d.decision === "decline" ? "declined" : "let in"} by ${esc(d.by || "someone")}${d.ms ? ", " + esc(dmy(d.ms)) : ""}</div>`).join("");
    const bulk = P.bulk ? `<div class="zc-box" id="bulkask" role="group" aria-label="Please confirm"><p><b>${P.bulk === "admit" ? `Let all ${W.length} ${W.length === 1 ? "person" : "people"} in?` : `Decline all ${W.length} ${W.length === 1 ? "person" : "people"}?`}</b></p>${small(P.bulk === "admit" ? "Everyone waiting is let in, one after the other, until the game is full." : "They are told you could not take them this time.")}<div class="zc-chips"><button type="button" class="zc-btn zc-btn-s${P.bulk === "decline" ? " zc-btn-bad" : ""}" id="bulkyes">${P.bulk === "admit" ? "Yes, let them in" : "Yes, decline them"}</button><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="bulkno">No, wait</button></div></div>`
      : W.length ? `<div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s" id="admitall">Approve all (${W.length})</button><button type="button" class="zc-mini" id="declineall">Decline all</button></div>` : "";
    return `<div class="zc-box" id="waitpanel"><b class="zc-bt">Waiting to come in${W.length ? ": " + W.length : ""}</b>${bulk}${rows || small("Nobody is waiting right now.")}${P.still ? `<p class="zc-small zc-warnt" id="stillwaiting">${esc(P.still)}</p>` : ""}${done ? `<div class="zc-gap">${done}</div>` : ""}</div>`;
  }
  function addBox() {
    const modes = (canContacts() ? [["contacts", "From my contacts"]] : []).concat([["pdf", "Upload a PDF"], ["file", "Upload a CSV"], ["type", "Add one person"]]);
    const m = modes.some((x) => x[0] === S.mode) || S.mode === "paste" ? S.mode : "type";
    const cols = colsNow(), withPh = cols !== "id", withId = cols !== "mobile", fm = S.pp.form || {};
    const chips = modes.map(([k, l]) => `<button type="button" class="zc-chip${m === k ? " on" : ""}" data-mode="${k}" aria-pressed="${m === k}">${l}</button>`).join("");
    const colChips = COLS.filter(([k]) => colsAllowed().includes(k)).map(([k, l]) => `<button type="button" class="zc-chip${cols === k ? " on" : ""}" data-cols="${k}" aria-pressed="${cols === k}">${l}</button>`).join("");
    const colsHdr = cols === "mobile" ? "Name, Mobile" : cols === "id" ? "Name, Employee ID" : "Name, Employee ID, Mobile";
    const SAFE = `<p class="zc-small zc-safe">Your file is read on your own device. It is never stored and never opened as a program. Only the names, mobile numbers and employee IDs inside it are added, and anything that does not look like a name, a number or an ID is left out and shown to you.</p>`;
    const tpl = `<div class="zc-inline"><button type="button" class="zc-btn zc-btn-s" id="gtemplate">Download the blank list</button></div>`;
    const pdfForm = `<ol class="zc-small zc-steps"><li>Download the blank list. It has the columns: ${colsHdr}.</li><li>Fill it in. You can use Excel or any program.</li><li>Save it as a <b>PDF</b> (in Excel: File, Save as, PDF).</li><li>Upload the PDF here. You will see the list before anyone is added.</li></ol>${tpl}${lbl("gpdf", "Choose your PDF")}<input id="gpdf" class="zc-in" type="file" accept=".pdf,application/pdf">${SAFE}<p class="zc-small" id="pdfnote" role="status">${esc(S.pdfNote || "")}</p>${S.pdfRows ? `<div class="zc-box" id="pdfprev"><b class="zc-bt">${S.pdfRows.length} ${S.pdfRows.length === 1 ? "person" : "people"} found in your PDF${S.pdfJunk ? `, ${S.pdfJunk} left out` : ""}</b>${S.pdfJunkText ? `<div class="zc-small zc-nomargin" id="pdfjunk">Left out: ${esc(S.pdfJunkText)}</div>` : ""}${S.pdfRows.slice(0, 5).map((r) => `<div class="zc-small zc-nomargin">${esc(r.name || "No name")} &middot; ${esc(r.phone ? "******" + String(r.phone).replace(/\D/g, "").slice(-4) : "")} ${esc(r.empId || "")}</div>`).join("")}${S.pdfRows.length > 5 ? `<div class="zc-small zc-nomargin">and ${S.pdfRows.length - 5} more</div>` : ""}<div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s" id="pdfgo"${S.pp.adding ? " disabled" : ""}>Add them</button><button type="button" class="zc-mini" id="pdfno">Not these</button></div></div>` : ""}`;
    const csvForm = `<ol class="zc-small zc-steps"><li>Download the blank list. It has the columns: ${colsHdr}.</li><li>Fill it in. You can use Excel or any program.</li><li>Save it as a <b>CSV</b> (in Excel: File, Save as, CSV).</li><li>Upload the CSV here. Excel files themselves (.xlsx) are not accepted.</li></ol>${tpl}${lbl("gfile", "Choose your CSV file")}<input id="gfile" class="zc-in" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain">${SAFE}<p class="zc-small" id="csvnote" role="status">${esc(S.csvNote || "")}</p>`;
    const typeForm = `<div class="zc-inline"><label class="zc-sr" for="gname">Name</label><input id="gname" class="zc-in" placeholder="Name" autocomplete="off" maxlength="60" value="${esc(fm.n || "")}">${withPh ? `<label class="zc-sr" for="gphone">Mobile number</label><input id="gphone" class="zc-in" inputmode="tel" placeholder="98765 43210" autocomplete="off" maxlength="20" value="${esc(fm.p || "")}">` : ""}${withId ? `<label class="zc-sr" for="gemp">Employee ID</label><input id="gemp" class="zc-in" placeholder="Employee ID" autocomplete="off" maxlength="30" value="${esc(fm.e || "")}">` : ""}<button type="button" class="zc-btn zc-btn-s" id="gadd"${S.pp.adding ? " disabled" : ""}>Add</button></div>`;
    const pasteForm = `${lbl("rosterTxt", "Paste one person per line")}<textarea id="rosterTxt" class="zc-in zc-ta" rows="5" autocomplete="off"></textarea><div class="zc-foot"><button type="button" class="zc-btn zc-btn-s" id="rosterGo"${S.pp.adding ? " disabled" : ""}>Add them</button></div>`;
    const form = m === "paste" ? pasteForm : m === "pdf" ? pdfForm : m === "contacts" ? `<div class="zc-inline"><button type="button" class="zc-btn zc-btn-s" id="gcontacts">Pick from my contacts</button></div>` : m === "file" ? csvForm : typeForm;
    return (colsAllowed().length > 1 ? `<span class="zc-lblrow"><span class="zc-lbl">What do you know about each person?</span></span><div class="zc-chips" role="group" aria-label="What you know about each person">${colChips}</div>${small("This decides the columns of the list and the boxes below.")}` : small(canRun() ? `This game asks every guest for a mobile number, so add each person with a name and a mobile number. To add people by employee ID instead, choose Only my employees in step 2. <button type="button" class="zc-mini" data-open="2">Open step 2</button>` : "Add each person with a name and a mobile number.", 'id="colsnote"')) + `<span class="zc-lbl">How do you want to add them?</span><div class="zc-chips" role="group" aria-label="How to add people">${chips}</div>${form}${small("Invite only people who would like to play.")}`;
  }
  const gtNote = (k) => (S.gtNote && S.gtNote.k === k ? `<p class="zc-small" id="gtnote" role="status"><b>${esc(S.gtNote.t)}</b></p>` : ""); const nearMsg = (id) => (S.near && S.near.id === id ? `<p class="zc-small zc-toast" role="status" data-near="${id}">${esc(S.near.t)}</p>` : ""); const gtv = (k) => esc((S.gt && S.gt[k]) || ""); const guestTools = () => (!canRun() ? "" : `<h4>A guest's own data</h4>${small("A player asks to see or delete their data? Enter their mobile number. Only you can do this.")}<div class="zc-inline"><label class="zc-sr" for="pdph">Their mobile number</label><input id="pdph" class="zc-in" inputmode="tel" autocomplete="off" placeholder="98765 43210" value="${esc(S.gtPh || "")}"><button type="button" class="zc-mini" id="pdsee">Show what we hold</button><button type="button" class="zc-mini zc-danger" id="pddel">Delete their data</button></div>${nearMsg("pd")}${gtNote("pd")}
      <h4>Change of phone</h4>${small("A ticket plays on one phone only. If someone lost or changed their phone, enter their mobile number: the next phone they join with keeps their ticket.")}<div class="zc-inline"><label class="zc-sr" for="ubph">Their mobile number</label><input id="ubph" class="zc-in" inputmode="tel" autocomplete="off" placeholder="98765 43210" value="${esc(S.gtUb || "")}"><button type="button" class="zc-mini" id="unbind">Let them move to a new phone</button></div>${nearMsg("ub")}${gtNote("ub")}`);
  function peopleBlock() {
    if (S.shield) return `<div class="zc-block" id="shieldnote"><h3>Guest names and numbers are hidden</h3>${small("This browser tab hides guest names and mobile numbers, so this page does not show or take them: the people list, looking up a guest, moving a ticket to a new phone and the report. Open the console in a new browser tab to use them yourself.")}</div>`;
    const P = S.pp, list = P.list;
    let h = `<div class="zc-block" id="mypeople"><h3>My people</h3>${P.stale ? `<p class="zc-small zc-warnt" id="ppstale" role="status">${esc(P.stale)} Showing the last list. It refreshes by itself.</p>` : ""}`;
    if (list === null) return h + (P.err ? `<p class="zc-small zc-warnt" id="ppnote" role="status">${esc(P.err)}</p>` : small("Loading…")) + `<p class="zc-small" id="emailrule2">${EMAIL_RULE}</p>${guestTools()}</div>`;
    const live = list.filter((p) => stLabel(p.status) !== "Removed"), full = !!P.limit && live.length >= P.limit;
    h += `<p class="zc-small"><b id="gcount">${live.length}</b> ${live.length === 1 ? "person is" : "people are"} on my list${P.limit ? ` (up to ${P.limit})` : ""}.</p>`;
    if (canRun()) h += small(`Who can play: <b>${whoNow() === "anyone" ? "Anyone with the link" : "Only people on a list"}</b>. You can change this in step 2 (Who is this game for?) until the game starts.`);
    h += waitingPanel();
    h += full ? small(`You have reached your limit of ${P.limit} people. Remove someone to add another.`) : addBox();
    if (P.sum) h += `<p class="zc-small" id="cleansum" role="status"><b>${esc(P.sum)}</b></p>`;
    if (P.wrong.length) h += `<div class="zc-box" id="wronglist"><b class="zc-bt">${P.wrong.every((w) => !String(w.raw || "").trim()) ? "These need a mobile number. Type it and press Fix and add." : "These look wrong. Fix the number and add them."}</b>${P.wrong.map((w, i) => `<div class="zc-inline"><span>${esc(w.name || "No name")}${w.empId ? ` <span class="zc-small zc-nomargin">(employee ID ${esc(w.empId)})</span>` : ""}${w.why ? ` <span class="zc-small zc-nomargin">${esc(w.why)}</span>` : ""}${/step 2/.test(w.why || "") ? ` <button type="button" class="zc-mini" data-open="2">Open step 2</button>` : ""}</span><label class="zc-sr" for="fixin${i}">Mobile number for ${esc(w.name || "this person")}</label><input id="fixin${i}" class="zc-in" inputmode="tel" value="${esc(w.raw)}"><button type="button" class="zc-mini" data-fix="${i}">Fix and add</button></div>`).join("")}</div>`;
    h += list.map(personRow).join("") + (list.length ? "" : small("Nobody yet. Add your first person above."));
    h += `<div class="zc-chips zc-gap"><button type="button" class="zc-mini" id="copycommon">Copy common link</button>${P.canExport ? `<button type="button" class="zc-mini" id="dlpeople">Download my list</button>` : ""}</div>`;
    h += small("The common link is for groups. The person types their own mobile number. A personal link is made for one person only.");
    h += `${small("Names and numbers stay here, in your own console.")}<p class="zc-small" id="emailrule2">${EMAIL_RULE}</p>`;
    h += guestTools();
    return h + `</div>`;
  }
  const localCsv = () => ["Name,Mobile,Personal link,WhatsApp link,Status"].concat((S.pp.list || []).map((p) => [p.name, p.maskedPhone, p.link, waHref(p), stLabel(p.status)].map((x) => '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"').join(","))).join("\n");
  /** Organizer and Host play through their own personal link too: their seat is marked for them (POST /people/me), made when they ask. */
  function playBlock() {
    if (S.shield || !canRun()) return "";
    const ph = S.myPhone !== undefined ? S.myPhone : isOrg() ? S.contact.phone || "" : "";
    return `<div class="zc-block" id="playalong"><h3>Play the game yourself ${iBtn("play")}</h3>${draftStop()}${small("The Organizer, Hosts and Co-hosts can play too. Press Play now to open your own ticket, or send your play link to your phone. You keep this console open to run the game. Your seat is marked as the team's, so you stay out of the Unlucky prize and lucky draws. Nobody has an advantage: you tap and claim like everyone else.")}
      <div class="zc-chips zc-gap"><button type="button" class="zc-chip" id="playnow"${S.draft ? " disabled aria-disabled=\"true\"" : ""}>Play now</button></div>
      ${S.pp.meNeed ? `${lbl("myph", "Your own mobile number")}<input id="myph" class="zc-in" inputmode="tel" placeholder="98765 43210" autocomplete="off" value="${esc(ph)}">` : ""}
      <div class="zc-foot"><button type="button" class="zc-btn zc-btn-s" id="sendmine"${S.draft ? " disabled aria-disabled=\"true\"" : ""}>Send my play link to my WhatsApp</button></div>${S.pp.mineNote ? `<p class="zc-small" id="minenote" role="status">${esc(S.pp.mineNote)}</p>` : ""}</div>`;
  }
  /** What will happen when this link is shared, said in plain words for the game as it is set now. */
  const commonNote = () => {
    const anyone = whoNow() === "anyone", emp = !!(S.sum && S.sum.employeesOnly);
    return `<div class="zc-note2" id="commonnote"><b>What happens when you share this link</b>` + (anyone
      ? `<span>This game is open for all. Everyone who has the link can play: they type their mobile number${vmode() === "mobile" ? "" : " or the detail you asked for"} and get a ticket straight away. You do not need to approve anyone.</span>`
      : `<span>This game is for people on your list. You can safely send this one link to a whole group: people on your list get in by themselves. Anyone else sees "Please wait" and cannot play until you or a Host press Admit in "Waiting to come in".</span>`)
      + (emp ? `<span>Only your employees can play and nobody can invite anyone else.</span>` : "") + `<span>You can change this in step 2 until the game starts.</span></div>`;
  };
  function stepShare() {
    const link = guestLink();
    return playBlock() + `<div class="zc-block"><h3>Guest link (the common link) ${iBtn("common")}</h3><div class="zc-linkrow"><span class="zlink">${esc(link)}</span><button type="button" class="zc-mini" id="copy">Copy link</button></div>
        <div class="zc-chips zc-gap"><a class="zc-chip" href="${esc(waUrl(""))}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a></div>${S.draft ? small("Do not send this link yet. Guests can join only after you publish in step 7.") : ""}${commonNote()}</div>
      <div class="zc-block"><h3>Number screen for the room or a meeting</h3><div class="zc-linkrow"><span class="zlink" id="biglink">${esc(bigLink())}</span><button type="button" class="zc-mini" id="copybig">Copy the link</button></div>
        <a class="zc-chip zc-gap" href="${esc(bigLink())}" target="_blank" rel="noopener">Open the number screen</a>${small("Show it on a big screen, or share it in Google Meet, Zoom or Teams. It shows only the number just called and the prizes: players never see the earlier numbers.")}<details class="zc-small" id="meetinghow"><summary>Optional: how to play it over Google Meet, Zoom or Teams</summary><ol style="margin:6px 0 0 18px;padding:0"><li>Start your Google Meet, Zoom or Teams call as usual. Everyone talks there, as always.</li><li>Paste the guest link in the meeting chat (or send it on WhatsApp). Each person opens it on their own phone and gets their ticket. The phone shows only the number just called.</li><li>Share your screen in the meeting and show the <b>number screen</b> (console, step 6: &ldquo;Open the number screen&rdquo;). It shows the number just called and the prizes, never names or numbers.</li><li>Choose who calls the numbers before the start (step 2): the software at a steady speed, or you press <b>Next number</b> yourself while you talk. You cannot change this once the game has started.</li><li>Brand breaks and your speech play on every phone. The software finds the winners and shows them on the number screen, so you can announce them in the call.</li></ol><p>Nothing is installed in the meeting app; the game runs alongside the call.</p></details></div>
      <div class="zc-block"><h3>My board (only for you)</h3>${small("The housie board with every number already called, like the real game. Only you, a Host or a Co-host can open it. Do not share this window.")}<a class="zc-chip zc-gap" id="myboard" href="${esc(location.origin + "/board.html?e=" + encodeURIComponent(eid) + "#k=" + encodeURIComponent(secret || ""))}" target="_blank" rel="noopener">Open my board</a></div>
      ${peopleBlock()}
      ${cont(6)}`;
  }

  // ---------- step 7: check and publish; step 8: pay ----------
  /** Published but not paid: the one thing that matters now. The link went to everyone, so the game must start. */
  function payDueCard() {
    if (!S.unpaid || S.draft || !S.info || isCancelled() || didNotStart() || payState().confirming) return "";
    const at = S.info.startMs, left = Math.round((at - Date.now()) / 1000);
    const whenS = new Date(at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const waiting = S.people.length;
    const fmtLeft = (s) => (s >= 86400 ? Math.floor(s / 86400) + " d " + Math.floor((s % 86400) / 3600) + " h" : s >= 3600 ? Math.floor(s / 3600) + " h " + Math.floor((s % 3600) / 60) + " min" : Math.max(0, Math.floor(s / 60)) + " min");
    const people = waiting ? `<b>${waiting} ${waiting === 1 ? "person has" : "people have"} already joined your link.</b> ` : "Your link is live. ";
    if (S.locked || left <= 0) return `<div class="zc-alert zc-alert-bad"><h3>Your game could not begin: payment is due</h3><p>${people}They are waiting, and nothing will start until it is paid. <b>Pay now and the game starts 2 minutes after your payment, for everyone already waiting.</b> One payment is enough, from the Organizer, a Host or a Co-host.</p><a class="zc-btn zc-btn-bad" href="/pay.html?e=${encodeURIComponent(eid)}">Pay now and start</a></div>`;
    return `<div class="zc-alert"><h3>Last step: pay before the start</h3><p>${people}Your game starts <b>${esc(whenS)}</b> (in ${fmtLeft(left)}).</p><p><b>If payment is not made before then, the game will not begin</b> and everyone you invited will be left waiting. It takes about 2 minutes.</p><a class="zc-btn" href="/pay.html?e=${encodeURIComponent(eid)}">Pay now</a></div>`;
  }
  const paidRow = () => { const p = payState(); return `<div class="zc-rowl zc-paid"><span><b>Paid</b><br><span class="zc-small zc-nomargin">${p.paidBy ? "Paid by the " + esc(WHO[p.paidBy] || p.paidBy) : "Paid"}${p.paidMs ? " on " + esc(dmy(p.paidMs)) : ""}. The game is on.</span></span><span aria-hidden="true">&#10003;</span></div>`; };
  // ---------- cancel the game (Organizer and Host): three taps, each more serious; the server wants confirmations: 3 ----------
  const CANCEL_NO = "This game cannot be cancelled now.";
  /** "Your credit: Rs 2,358.82, valid until 14 Jun 2027." (no refund: a paid game that is cancelled becomes credit for 365 days) */
  const creditText = (c) => (c ? `Your credit: ${money(c.amountInr)}, valid until ${dayIst(c.expiresMs)}.` : "");
  const cloneButton = () => (canRun() && eid ? `<div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s zc-btn-alt" data-clonebtn="1">${isDemo() ? "Make a real game like this one" : "Create a new game like this one"}</button></div>` : "");
  /** A cancelled PAID game can be moved to any date within 365 days of the payment (the payment stays with the game as its credit). */
  function moveBlock() {
    const I = Object.assign({}, S.info, S.sum), M = S.move || {};
    if (!I.rescheduleUntilMs) return "";
    if (M.done) return `<p class="zc-small" id="movedone" role="status"><b>Your game is moved.</b> Send your guests the link again: they need to join again.</p>`;
    const until = esc(dayIst(I.rescheduleUntilMs));
    if (I.canReschedule === false) return `<p class="zc-small" id="movecant">This game can no longer be moved. Your payment stays as credit for a new game.</p>`;
    return `<div id="moveblock"><p class="zc-small"><b>You can move this game to a new date until ${until}.</b> Your payment then stays with this game and nothing more is due. If you use the credit for another game first, this game can no longer be moved.</p><div class="zc-chips"><input type="datetime-local" id="movedt" aria-label="New date and time"> <button type="button" class="zc-btn zc-btn-s" id="movego"${M.busy ? " disabled" : ""}>Move my game to this date</button></div>${M.err ? `<p class="zc-small zc-warnt" role="status" id="moveerr">${esc(M.err)}</p>` : ""}</div>`;
  }
  function cancelBlock() {
    if (!canRun() || !S.info || S.draft) return "";
    const C = S.cancel || { stage: 0 }, name = (S.cfg && S.cfg.name) || (S.info && S.info.name) || "this game";
    if (isCancelled()) return `<div class="zc-block" id="cancelled"><h3>This game was cancelled</h3>${small("Guests see that the game was cancelled. Nothing more is needed from you.")}${C.credit ? `<p class="zc-small" id="creditnote"><b>Your payment of ${esc(money(C.credit.amountInr))} stays as credit until ${esc(dayIst(C.credit.expiresMs))}.</b> Use it for your next game.</p>` : small("If you had paid, your payment stays as credit for your next game. You can see it in Your account.")}${moveBlock()}${cloneButton()}</div>`;
    let b = "";
    if (C.stage === 0) b = small("You can cancel before the game starts. Guests will be told.") + `<div class="zc-chips"><button type="button" class="zc-btn zc-btn-s zc-btn-bad" id="cancelopen">Cancel this game</button></div>`;
    else if (C.err) b = `<p class="zc-small zc-warnt" role="status">${esc(C.err)}</p><div class="zc-chips"><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="cancelback">Close</button></div>`;
    else if (C.stage === 1 && !C.preview) b = small("One moment...");
    else if (C.stage === 1 && !C.preview.canCancel) b = `<p class="zc-small zc-warnt" id="cancelreason" role="status">${esc(C.preview.reason || CANCEL_NO)}</p><div class="zc-chips"><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="cancelback">Close</button></div>`;
    else {
      // three confirmations, each a red warning panel with the same plain warning, a progress line and its own heading; nothing is sent before the last button
      const n = C.stage, head = ["", "1st confirmation", "2nd confirmation", "Final confirmation"][n];
      const warn = `<p class="zc-cw-warn"><b>You are cancelling the game.</b> You need to confirm 3 times before the game is cancelled.</p>`;
      let inner;
      if (n === 1) inner = `<p><b>Do you want to cancel ${esc(name)}?</b></p>${C.preview && C.preview.paid ? `<p class="zc-small" id="norefund">There is no refund. Your payment stays as credit for your next game, for 365 days.</p>` : ""}<div class="zc-chips"><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="cancelback">No, keep my game</button><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="cancelresched">Change the date instead</button><button type="button" class="zc-btn zc-btn-s zc-btn-bad" id="cancel1">Yes, go to the 2nd confirmation</button></div>`;
      else if (n === 2) inner = `<p><b>This is what happens.</b></p><p class="zc-small" id="cancelwhat">${C.preview && C.preview.credit ? esc(creditText(C.preview.credit)) + " " : ""}Guests will be told. Their names and numbers will be erased. You cannot undo this.</p><label class="zc-check" for="cancelagree"><input type="checkbox" id="cancelagree"${C.agree ? " checked" : ""}> I understand that cancelling cannot be undone</label><div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="cancelprev">Go back</button><button type="button" class="zc-btn zc-btn-s zc-btn-bad" id="cancel2"${C.agree ? "" : " disabled"}>Submit</button></div>`;
      else inner = `<p><b>This will cancel ${esc(name)} for good.</b></p><div class="zc-chips"><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="cancelback">No, keep my game</button><button type="button" class="zc-btn zc-btn-s zc-btn-bad" id="cancel3"${C.busy ? " disabled" : ""}>Yes, ${esc(name)} is cancelled</button></div>`;
      b = `<div class="zc-cwarn" id="cancelpanel" role="alertdialog" aria-labelledby="cancelhead" aria-describedby="cancelwarn"><div class="zc-small zc-nomargin" id="cancelprog">Step ${n} of 3</div><h4 id="cancelhead">${head}</h4><div id="cancelwarn">${warn}</div>${inner}</div>`;
    }
    return `<div class="zc-block" id="cancelblock"><h3>Cancel this game</h3>${b}</div>`;
  }
  /** Prizes that have no text (the organizer chose "decide later" or left it empty): listed before publishing, because the winners would get nothing. Unlucky and the lucky draws name themselves. */
  function unnamedPrizes() {
    const rw = ((S.cfg && S.cfg.rewards) || []).filter((r) => r && r.pattern !== "unlucky" && r.pattern !== "lucky" && !String(r.text || "").trim());
    const label = (p) => { const h = (ZG.PRIZE_HOUSES || []).find((x) => x.id === p); return h ? h.label : p === "full2" ? "Full house, two tickets" : String(p); };
    const ord = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
    return rw.map((r) => { const many = ((S.cfg && S.cfg.rewards) || []).filter((x) => x.pattern === r.pattern && (x.scope || "ticket") === (r.scope || "ticket")).length > 1; return (many ? (ord[(r.ordinal || 1) - 1] || r.ordinal) + " " : "") + label(r.scope === "two_ticket" ? "full2" : r.pattern); });
  }
  const prizeWarn = () => { const n = unnamedPrizes(); return n.length ? `<div class="zc-alert" id="prizewarn" role="alert"><b>${n.length === 1 ? "1 prize has" : n.length + " prizes have"} no name: ${esc(n.join(", "))}.</b> Winners will get nothing. Go back and name them, or press Publish anyway.</div>` : ""; };
  // ---------- REHEARSALS (1.6.0): three free practice runs of a paid game, in three cards under the Publish step. One action per card, no settings.
  async function loadReh(force) {
    if (S.rehBusy || !eid || (S.info && S.info.rehearsal)) return;
    if (!force && S.rehAt && Date.now() - S.rehAt < 8000) return;
    S.rehBusy = true;
    try { S.reh = await call("GET", "/api/z/" + eid + "/rehearsals"); } catch { /* the cards stay as they were */ }
    S.rehBusy = false; S.rehAt = Date.now(); redraw();
  }
  /** Who is invited to this rehearsal: the game's own guests (default), the last rehearsal's guests, nobody (add people in the rehearsal), or a few picked from the game's list. */
  function rehShapes(n) {
    const sh = S.rehShape || "published";
    const opts = [["published", "Same guests as my game"], ...(n > 1 ? [["previous", "Last rehearsal's guests"]] : []), ["none", "No guests yet (I will add them)"], ["pick", "Pick guests from my game"]];
    const chips = opts.map(([v, l]) => `<button type="button" class="zc-chip${sh === v ? " on" : ""}" aria-pressed="${sh === v}" data-rehshape="${v}">${l}</button>`).join(" ");
    let pick = "";
    if (sh === "pick") {
      const list = ((S.pp && S.pp.list) || []).filter((p) => p.status !== "removed" && !p.role).slice(0, 60);
      pick = list.length ? `<div class="zc-small" id="rehpick">${list.map((p) => `<label style="display:block"><input type="checkbox" data-rehpick="${esc(p.id)}"${S.rehPick && S.rehPick[p.id] ? " checked" : ""}> ${esc(p.name || p.maskedPhone || "Guest")}</label>`).join("")}</div>` : `<p class="zc-small">Your guest list is empty or still loading.</p>`;
    }
    return `<p class="zc-small"><b>Who is invited?</b></p><div class="zc-chips" id="rehshape">${chips}</div>${pick}`;
  }
  const rehDate = (ms) => { try { return new Date(ms + 5.5 * 3600000).toISOString().slice(0, 10); } catch { return ""; } };
  function rehCards() {
    if (!eid || (S.info && S.info.rehearsal)) return ""; // a rehearsal itself has no rehearsals
    loadReh(false);
    const R = S.reh, cards = R && R.cards ? R.cards : [1, 2, 3].map((n) => ({ n, state: "locked", reason: "First publish your game and pay. This unlocks your 3 rehearsals." }));
    const card = (c) => {
      const grey = c.state === "locked";
      const body = c.state === "ready" ? `<p class="zc-small">A practice run of your game with your guests. Nothing here changes your real game.</p>${rehShapes(c.n)}<button type="button" class="zc-btn" data-reh="start" data-n="${c.n}">Start this rehearsal</button><p class="zc-small">Free, included with your game</p>`
        : c.state === "running" ? `<p class="zc-small"><b>Rehearsal ${c.n} is on.</b></p><a class="zc-btn" href="${esc(location.origin + "/zc.html?e=" + encodeURIComponent(c.id || ""))}">Open it</a> <button type="button" class="zc-mini" data-reh="close" data-id="${esc(c.id || "")}">Close this rehearsal</button>`
        : c.state === "done" ? `<p class="zc-small"><b>Done</b> ${esc(rehDate(c.dateMs))}</p><a class="zc-mini" href="${esc(location.origin + "/zc.html?e=" + encodeURIComponent(c.id || ""))}">See what happened</a>`
        : `<p class="zc-small">${esc(c.reason || "")}</p>`;
      return `<div class="zc-rehcard${grey ? " zc-grey" : ""}" id="reh${c.n}" style="border:1px solid #c9cdd6;border-radius:12px;padding:12px;margin:8px 0;${grey ? "opacity:.55;" : ""}"><b>Rehearsal ${c.n}</b>${body}<p class="zc-small">Practice only, not your real game</p></div>`;
    };
    return `<div class="zc-block" id="rehearsals"><h3>Rehearsals</h3>${cards.map(card).join("")}</div>`;
  }
  document.addEventListener("click", async (e) => {
    const sc = e.target && e.target.closest && e.target.closest("[data-rehshape]");
    if (sc) { S.rehShape = sc.dataset.rehshape; if (S.rehShape === "pick") { try { await loadPeople(); } catch { /* the list stays empty */ } } redraw(); return; }
    const pc = e.target && e.target.closest && e.target.closest("[data-rehpick]");
    if (pc) { S.rehPick = S.rehPick || {}; S.rehPick[pc.dataset.rehpick] = !!pc.checked; return; }
    const b = e.target && e.target.closest && e.target.closest("[data-reh]"); if (!b) return;
    if (b.dataset.reh === "start") {
      const n = Number(b.dataset.n) || 1;
      const yes = await askSure("Start rehearsal " + n + "?", "This is practice. It is not your real game.\n\nYour guests get a separate link for this rehearsal. Nothing here changes your real game.", "Yes, start the rehearsal", "No, not now");
      if (!yes) return;
      b.disabled = true;
      try { const sh = S.rehShape || "published", pk = sh === "pick" ? Object.keys(S.rehPick || {}).filter((k) => S.rehPick[k]).slice(0, 20) : null; if (sh === "pick" && !pk.length) { S.pubNote = "Tick the guests you want in this rehearsal."; b.disabled = false; redraw(); return; } const r = await call("POST", "/api/z/" + eid + "/rehearsal", pk ? { pick: pk } : { people: sh }); if (r && r.openUrl) { if (r.team && r.team.length) { try { await askSure("Your Co-hosts have new links for this rehearsal", r.team.map((t) => t.label + ": " + t.link).join(String.fromCharCode(10, 10)) + String.fromCharCode(10, 10) + "Send each Co-host their link. Their old links keep working for your real game.", "OK, open the rehearsal", "Open it anyway"); } catch { /* the sheet is only a convenience */ } } location.href = r.openUrl; return; } } catch (err) { S.pubNote = err && err.message ? err.message : "The rehearsal could not be started. Please try again."; }
      b.disabled = false; loadReh(true);
    } else if (b.dataset.reh === "close") {
      const yes = await askSure("Close this rehearsal?", "It ends now and the next rehearsal opens. Its results stay for you to read.", "Yes, close it", "No, keep it going");
      if (!yes) return;
      try { await call("POST", "/api/z/" + b.dataset.id + "/rehearsalclose", {}); } catch { /* shown on the next load */ }
      loadReh(true);
    }
  });
  function stepPublish() {
    if (!S.f) return small("Loading…");
    let h = `<span class="zc-lbl">Check your game</span>` + unsavedWarn() + readBack() + (S.f ? modeSummary(S.f).replace('id="modesummary"', 'id="modesummary2"') : "") + (S.draft ? prizeWarn() : "");
    if (S.draft) {
      h += `<div class="zc-block"><h3>Publish (free)</h3>${small(isFree10() ? "A game for 10 people or fewer costs <b>Rs 0</b>. Participants cannot see or join a draft. Publishing is free, and there is nothing to pay: the game starts on time by itself." : "Set it up first. Participants cannot see or join a draft. Publishing is free: you confirm your details, get your link and send it to everyone. You pay before the start time, and it begins the moment you have.")}`
        + (S.pubOpen ? `${lbl("pubEmail", "Your e-mail (for the invoice)")}<input id="pubEmail" data-need="1" class="zc-in" type="email" value="${S.shield ? "" : esc(S.contact.email)}" autocomplete="email">${lbl("pubPhone", "Your mobile number")}<input id="pubPhone" data-need="1" class="zc-in" type="tel" value="${S.shield ? "" : esc(S.contact.phone)}" autocomplete="tel" placeholder="98765 43210">${CBConsent.html("K1")}<div class="zc-foot"><button class="zc-btn" type="button" id="pubgo" data-needs="K1" disabled aria-disabled="true">Confirm and publish</button> <button class="zc-btn zc-btn-alt" type="button" id="pubcancel">Back</button></div>`
          : `<div class="zc-foot"><button class="zc-btn" type="button" id="publishopen">Publish my game, free</button></div>`)
        + (S.pubNote ? `<p class="zc-small"><b>${esc(S.pubNote)}</b></p>` : "") + `</div>`;
    } else {
      h += rowl(`<b>Published</b><br><span class="zc-small zc-nomargin">${isFree10() ? "Your game is live. Nothing to pay." : "Your link is live."}</span>`, `<span aria-hidden="true">&#10003;</span>`);
      h += isCancelled() ? "" : isFree10() ? small("Want more than 10 people? Choose a bigger size in step 8, at any time.") : small("Next: pay in step 8. One payment is enough.");
    }
    return h + rehCards() + (S.cloneNew === eid && S.draft ? `<div class="zc-box" id="newgamenote2">This is a new game. Nothing is paid or published yet.</div>` : "") + previewButton() + cancelBlock() + (S.draft || isCancelled() ? "" : cloneButton()) + (S.draft ? "" : cont(7)); // a draft has one obvious button, Publish
  }
  // ---------- credit (no refunds): the account's active credit can pay for a game ----------
  const creditTotal = () => Number((S.sum && S.sum.credit) || 0) || 0;
  const creditExpiry = () => (S.creditInfo && S.creditInfo.nextExpiryMs) || 0;
  function creditOffer() {
    const st = payState(); if (st.paid || st.confirming || S.draft || isCancelled()) return "";
    if (S.creditMsg) return `<div class="zc-box" id="creditoffer"><p id="creditmsg" role="status"><b>${esc(S.creditMsg)}</b></p></div>`;
    const t = creditTotal(); if (!(t > 0)) return "";
    return `<div class="zc-box" id="creditoffer"><p>You have credit of <b>${esc(money(t))}</b>${creditExpiry() ? ` (valid until ${esc(dayIst(creditExpiry()))})` : ""}. Use it for this game.</p><div class="zc-chips"><button type="button" class="zc-btn zc-btn-s" id="usecredit">Use my credit</button></div>${S.creditErr ? `<p class="zc-small zc-warnt" role="status">${esc(S.creditErr)}</p>` : ""}</div>`;
  }
  function creditsBlock() {
    const C = S.credits; if (!C || !Array.isArray(C.credits)) return "";
    const row = (c) => {
      const st = c.status === "used" ? "Used" : c.status === "expired" ? "Lapsed" : "Active";
      const when2 = c.status === "expired" ? `lapsed on ${dayIst(c.expiresMs)}` : c.status === "used" ? `used ${(c.uses || []).map((u) => dayIst(u.atMs) + (u.game ? " for " + u.game : "")).join(", ") || ""}` : `valid until ${dayIst(c.expiresMs)}`;
      return rowl(`${esc(money(c.status === "active" ? c.remainingInr : c.amountInr))}${c.status === "active" && c.remainingInr !== c.amountInr ? ` of ${esc(money(c.amountInr))}` : ""}<br><span class="zc-small zc-nomargin">${esc(when2)}${c.sourceGame ? " · from " + esc(c.sourceGame) : ""} · made ${esc(dayIst(c.createdMs))}</span>`, `<span class="zc-stt zc-stt-${st === "Active" ? "joined" : st === "Used" ? "invited" : "removed"}">${st}</span>`);
    };
    return `<div class="zc-block" id="creditsblock"><h3>Your credit</h3>${C.credits.length ? C.credits.map(row).join("") : small("You have no credit.")}${small("We do not give refunds. If you cancel a paid game before it starts, your payment stays in the Organizer's account as credit for the next game, for 365 days. Unused credit lapses at the end of day 365.")}</div>`;
  }
  async function loadCredits() { try { S.credits = await call("GET", "/api/org/credit"); } catch { S.credits = null; } }
  // ---------- games that wait for a payment, or did not start ----------
  const didNotStart = () => !!((S.info && S.info.didNotStart) || (S.sum && S.sum.didNotStart) || (S.coh && S.coh.didNotStart));
  const erasureMsOf = () => Number((S.sum && S.sum.erasureMs) || (S.info && S.info.erasureMs) || (S.coh && S.coh.erasureMs) || 0);
  const erasureLine = () => { const m = erasureMsOf(); return m && !didNotStart() && !payState().paid && !isCancelled() ? `<p class="zc-small" id="erasureline">Guest data will be erased on ${esc(dmy(m))} if the game does not start.</p>` : ""; };
  const didNotStartBlock = () => `<div class="zc-alert" id="didnotstart" role="status"><h3>This game did not start.</h3><p>Guest details have been erased.</p>${cloneButton()}</div>`;
  /** "Create a new game like this one": the panel (one place at the top) and what it does. */
  function clonePanel() {
    const K = S.clone; if (!K) return "";
    return `<div class="zc-alert" id="clonepanel" role="group" aria-label="Create a new game like this one"><h3>Create a new game like this one</h3>${small("The settings, prizes and brand are copied. The date, the payment, the guests and the Co-hosts are not.")}${K.hasPeople ? `<label class="zc-check" for="clonepeople"><input type="checkbox" id="clonepeople"${K.withPeople ? " checked" : ""}> Also bring my people list from the old game</label>` : small("The old guest list has been erased, so add your people again.")}${K.err ? `<p class="zc-small zc-warnt" role="status">${esc(K.err)}</p>` : ""}<div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s" id="clonego"${K.busy ? " disabled" : ""}>Create the new game</button><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="cloneno">Not now</button></div></div>`;
  }
  const hasOldPeople = () => !(S.life && S.life.purged) && (((S.people || []).length > 0) || ((S.pp.list || []).length > 0));
  /** Step 8: the only place a price is shown (and the Co-host's own Payment step, and the pay pages). */
  function stepPay() {
    if (!S.f) return small("Loading…");
    if (S.draft) return `<div class="zc-block" id="paynotpub"><h3>Publish first</h3>${small("You pay after you publish. Publishing is free. Check your game in step 7 and publish it. Then come back here.")}<div class="zc-chips"><button type="button" class="zc-mini" data-open="7">Go to step 7</button></div></div>`;
    if (isCancelled()) return small("This game was cancelled, so there is nothing to pay.");
    const price = S.sum && S.sum.priceInr ? `<div class="zc-rowl" id="pricerow"><span>Price for your game</span><b>${esc(money(S.sum.priceInr))}</b></div>` : "";
    if (didNotStart()) return didNotStartBlock();
    if (isFree10()) return makeRealBlock() + erasureLine();
    const st = payState();
    const cr = creditOffer();
    const body = st.paid ? paidRow() : st.confirming ? rowl(`<b>Confirming your payment...</b><br><span class="zc-small zc-nomargin">The game starts only after the bank says yes. Nothing more to do.</span>`, "") : (payDueCard() || rowl("<b>Pay</b><br>Waiting for the payment.", `<a class="zc-btn zc-btn-s" href="/pay.html?e=${encodeURIComponent(eid)}">Pay</a>`));
    return price + cr + body + payLinkBlock() + erasureLine() + small("Paid late? The game starts 2 minutes after your payment is confirmed.");
  }

  /** A DEMO GAME: "Make this a real game". The usual packs; the payment itself happens on the pay page (the same page and checkout as any game). After the game has ended, a new real game like this one is made instead (the clone). */
  function makeRealBlock() {
    const ended = gameEnded();
    const packs = (S.packs || []).length ? S.packs : [{ upTo: 100, inr: 2399 }, { upTo: 250, inr: 3499 }, { upTo: 500, inr: 4699 }, { upTo: 1000, inr: 7099 }];
    const pick = Number(S.realPack) || packs[0].upTo;
    const chips = packs.map((k) => `<button type="button" class="zc-chip${pick === k.upTo ? " on" : ""}" data-realpack="${k.upTo}" aria-pressed="${pick === k.upTo}">Up to ${k.upTo} people${k.inr ? " \u00b7 " + esc(money(k.inr)) : ""}</button>`).join("");
    const head = `<div class="zc-rowl zc-paid"><span><b>Rs 0 \u00b7 up to ${DEMO_CAP} people</b><br><span class="zc-small zc-nomargin">Nothing to pay for this game.</span></span><span aria-hidden="true">&#10003;</span></div>`;
    if (ended) return head + `<div class="zc-block" id="makereal"><h3>Create a new game like this one</h3>${small("A new game with the same settings, prizes and brand is made for you: pick the date and time and the number of people, then publish.")}<div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s" data-clonebtn="1" id="makerealclone">Make a real game like this one</button></div></div>`;
    return head + `<div class="zc-block" id="makereal"><h3>Need more than 10 people?</h3>${small(S.started ? "You can do this now, during the game. The game carries on as it is: the same link, the same people, the same numbers. More people can join, up to the number you choose." : "Choose the number of people and pay. The game stays as it is: the same link, the same settings. More people can join, up to the number you choose.")}<span class="zc-lbl" id="gl-realpack">How many people?</span><div class="zc-chips" role="group" aria-labelledby="gl-realpack">${chips}</div><div class="zc-foot"><a class="zc-btn" id="makerealgo" href="/pay.html?e=${encodeURIComponent(eid)}&pack=${pick}">Choose ${pick} people and pay</a></div>${small("We do not give refunds. If you cancel a paid game before it starts, your payment stays as credit for your next game for 365 days.")}</div>`;
  }
  // ---------- step 9: game day ----------
  const MSGS = ["Welcome! The game starts soon.", "Please take your seats", "Dinner is served", "Rewards at the stage in 10 minutes", "We start in 5 minutes", "Thank you for joining"];
  function announceBlock() {
    const avail = !!S.cf;
    return `<div class="zc-block"><h3>Message to everyone</h3>${small(avail ? "Shown and spoken on every phone and on the big screen. It reaches phones within about a minute. Tap a ready message or write your own, then press Send to everyone." : (S.info && S.info.cap > 2000 ? "Messages are available for games of up to 2,000 people." : "Messages become available once this game is set up."))}
      <div class="zc-chips">${MSGS.map((c) => `<button type="button" class="zc-chip" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      ${lbl("annText", "Or write your own")}<textarea id="annText" class="zc-in zc-ta" rows="2" maxlength="160" placeholder="Write a short message">${esc(S.annDraft)}</textarea>
      <div class="zc-foot"><button class="zc-btn zc-btn-s" type="button" id="annSend"${avail && !S.annBusy ? "" : " disabled"}>${S.annBusy ? "Sending…" : "Send to everyone"}</button> <button class="zc-btn zc-btn-s zc-btn-alt" type="button" id="annClear"${avail && !S.annBusy ? "" : " disabled"}>Clear message</button></div>${S.annNote ? `<p class="zc-small"><b>${esc(S.annNote)}</b></p>` : ""}</div>`;
  }
  const lineLabel = (s) => { const lines = (S.cfg && S.cfg.rewards || []).filter((l) => (l.scope === "two_ticket" ? "full2" : l.pattern) === s.pattern), line = lines.find((l) => l.ordinal === s.ordinal); return ((S.cfg && S.cfg.rounds > 1) ? "Round " + (s.round || 1) + " · " : "") + (lines.length > 1 ? ["", "1st", "2nd", "3rd"][s.ordinal] || s.ordinal + "th" : "") + (lines.length > 1 ? " " : "") + NAMES[s.pattern] + (line && line.text ? " (" + line.text + ")" : ""); };
  const PNAME = NAMES;
  const prizeName = (p) => { const l = (S.cfg && S.cfg.rewards || []).find((x) => x.pattern === p.pattern && x.ordinal === p.ordinal); return p.pattern === "lucky" ? "Lucky draw " + p.ordinal : (PNAME[p.pattern] || p.pattern) + (p.ordinal > 1 ? " (" + p.ordinal + ")" : "") + (l && l.text ? " · " + l.text : ""); };
  function prizeBlock() {
    const P = S.prizes || [];
    if (!S.started || S.draft) return "";
    const rows = P.map((p, i) => `<div class="zc-rowl zc-top"><span><b>${S.shield ? "Ticket " + esc(String(p.seat)) : esc(p.name || "Participant")}</b>${S.shield ? "" : " &middot; " + esc(p.phone || "")}<br><small class="zc-small zc-nomargin">${esc(prizeName(p))}${p.round > 1 ? " · round " + p.round : ""}${p.confirmed ? " · confirmed by the winner " + esc(dmy(p.confirmedMs)) : " · not confirmed by the winner yet"}</small>${p.changed && !S.shield ? `<br><small class="zc-badt"><b>Changed after the game.</b> Joined as ${esc(p.joinedWithName || "?")} · ${esc(p.joinedWithPhone || "?")}${(p.trail || []).map((t) => "; on " + esc(dmy(t.at)) + " changed to " + esc(t.name) + " · " + esc(t.phone)).join("")}</small>` : ""}</span>
      <label class="zc-check"><input type="checkbox" data-given="${i}" ${p.given ? "checked" : ""}> Prize given${p.given ? " " + esc(dmy(p.givenMs)) + (p.givenBy ? " by " + esc(p.givenBy) : "") : ""}</label>${p.canOverride === true ? ` <button type="button" class="zc-mini" data-ovopen="${i}">Change winner</button>` : ""}${p.canOverride === true && S.ovOpen === i ? `<div class="zc-chips zc-gap" role="group" aria-label="Choose the winner" data-ovlist="${i}">${(Array.isArray(p.claimants) ? p.claimants : []).map((c, j) => `<button type="button" class="zc-chip" data-ov="${i}" data-ovj="${j}">${esc(c.label || ("Ticket " + c.seat))}</button>`).join("")}<button type="button" class="zc-chip" data-ov="${i}" data-ovj="-1">Nobody</button></div>` : ""}</div>`).join("");
    return `<div class="zc-block"><h3>Prizes handed over</h3>${rows || small("No winner is confirmed yet.")}${rows ? small("This is the result the software worked out. You have the final say: you can change who gets a prize.", 'id="prizefinal"') : ""}${small("After the game each winner confirms their name and mobile number on their own phone. Anything they change is shown here together with what they joined with. Tick \"Prize given\" when you hand the prize over: the date is kept. The winners record and your details as Organizer and Host are kept for 365 days. Co-host details are erased with the guests.")}</div>`;
  }
  function statsBlock() {
    if (!S.started || S.draft) return "";
    const ps = S.people, late = ps.filter((p) => p.jr > 0).length, viaInv = ps.filter((p) => p.inv).length, roles = ps.filter((p) => p.role).length;
    const byCat = {}; for (const p of ps) if (p.inv && p.cat) byCat[p.cat] = (byCat[p.cat] || 0) + 1;
    const label = (id) => ((ZG.INVITE_CATEGORIES || []).find((k) => k.id === id) || { label: id }).label;
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="zc-rowl"><span>${esc(label(k))}</span><b>${n}</b></div>`).join("");
    return `<div class="zc-block"><h3>The game has begun</h3><div class="zc-stats"><div><div class="zc-stat">${ps.length}</div><div class="zc-small zc-nomargin">people in the game</div></div><div><div class="zc-stat">${late}</div><div class="zc-small zc-nomargin">joined after the first number</div></div><div><div class="zc-stat">${viaInv}</div><div class="zc-small zc-nomargin">came through an invitation</div></div><div><div class="zc-stat">${S.settledPreview.length}</div><div class="zc-small zc-nomargin">prizes won so far</div></div></div>
      ${cats ? `<h4>Invitations by kind of guest</h4>${cats}` : ""}${roles ? small(roles + " Organizer / Host / Co-host " + (roles === 1 ? "seat" : "seats") + " playing along.") : ""}
      ${small("When the game ends we e-mail you the complete report as a PDF: when it started, how many people at each stage, every prize and winner, who invited whom, all statistics, and every name and mobile number.")}</div>`;
  }
  function luckyBlock() {
    const L = (S.cfg && S.cfg.breaks || []).filter((b) => b.kind === "lucky");
    if (!L.length) return "";
    return `<div class="zc-block"><h3>Lucky draws</h3>${L.map((b, i) => { const d = S.lucky && S.lucky[i]; const done = (S.published || []).some((r) => r.pattern === "lucky" && r.ordinal === i + 1); return rowl(`${esc(b.title)} · ${b.winners || 3} ${(b.winners || 3) === 1 ? "person" : "people"}`, done ? `<b>Decided</b>` : d ? `<b>Being confirmed by the phones</b>` : `<span class="zc-small zc-nomargin">after the break ends</span>`); }).join("")}
      ${small("The software picks the winners from everyone who joined, using public random numbers. You and we cannot choose them. A winner is confirmed when several phones agree.")}</div>`;
  }
  function rewardsBlock() {
    const bad = S.checked ? S.checked.bad.length : 0;
    const nClaims = S.claims.filter((c) => !c.bogey).length, nBogeys = S.claims.length - nClaims;
    return `<div class="zc-block"><h3>Rewards, from the public numbers and the claims</h3>${S.settledPreview.length ? S.settledPreview.map((s) => rowl(`${esc(lineLabel(s))} · call ${s.idx + 1}`, `<b>${s.pids.length} participant${s.pids.length === 1 ? "" : "s"}${s.names ? " · " + esc(s.names) : ""}</b>`)).join("") : small("No prize has been claimed yet.")}
      ${small(`Claims received: ${nClaims}. ${bad ? `<b>${bad} not valid</b> (they do not match the public log and are ignored).` : "All claims so far match the public log."}${nBogeys ? ` Bogeys (wrong claims): ${nBogeys}.` : ""}`)}
      ${small(`Real housie: a player wins a prize only by tapping the numbers and pressing Claim before the next number is called. A wrong claim is a Bogey; two Bogeys on the same prize put that ticket out of it. Numbers come from a public random beacon. Winners are confirmed when several phones agree. You and we cannot choose or change them in the software. Confirmed so far: ${(S.published || []).filter((r) => r.pattern !== "lucky").length}.`)}
      <button type="button" class="zc-mini" id="csv"${S.settledPreview.length && !S.shield ? "" : " disabled"}>Download report</button></div>`;
  }
  /** Manual start: the big Start button. It cannot be pressed before the start time; the page says so in plain words and says what to do instead. */
  const whenIst = (ms) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) + " India time";
  function startBlock() {
    if (!manualMode() || S.draft || !S.info) return "";
    if (!S.cf) return `<div class="zc-block" id="startgame"><h3>Start the game</h3>${small("The Start button becomes available once this game is set up.")}</div>`;
    const go = goRound(), sr = S.info.startRound, timeUp = S.now !== null && S.now >= sr, stopped = !!(S.control && S.control.stopped);
    if (stopped) return "";
    const note = S.startNote ? `<p class="zc-small" id="startnote" role="status"><b>${esc(S.startNote)}</b></p>` : "";
    if (go !== null) {
      const left = S.now === null ? null : Math.max(0, (go - S.now) * 3);
      return `<div class="zc-block" id="startgame"><h3>Start the game</h3><p class="zc-small"><b id="startstate">${left !== null && left > 0 ? "Start was pressed. The game begins in about " + (left >= 120 ? Math.floor(left / 60) + " minutes " + (left % 60) + " seconds" : left + " seconds") + "." : "The game has started."}</b></p>${note}</div>`;
    }
    return `<div class="zc-block zc-hostcall" id="startgame"><h3>Start the game</h3>
      ${timeUp ? `<p class="zc-small"><b id="startstate">Press Start, or change the start time.</b> Nobody has pressed Start yet, so your players are waiting for you.</p>` : `<p class="zc-small"><b id="startstate">Start can be pressed from ${esc(whenIst(S.info.startMs))}.</b> To start earlier, first change the start time in step 1.</p>`}
      <button type="button" class="zc-btn zc-btn-big" id="startnow"${timeUp && !S.starting ? "" : " disabled"}>${S.starting ? "Starting…" : "Start the game"}</button>
      ${small(timeUp ? "Pressing Start tells every phone, the big screen and the Hosts' screens to begin together in " + leadWords() + ". It can be pressed only once." : "Start stays off until the start time. The change of a start time is written down in the list below, so there is always a record.")}${note}</div>`;
  }
  /** What changed, who, when: plain words, no player data. */
  function changesBlock() {
    if (S.draft || !S.changes || !Array.isArray(S.changes.changes)) return "";
    const rows = S.changes.changes.slice(0, 40).map((r) => `<div class="zc-rowl"><span><span class="zc-small zc-nomargin">${esc(r.when)} · ${esc(r.who)}</span><br>${esc(r.what)}</span></div>`).join("");
    return `<div class="zc-block" id="changes"><h3>What changed</h3>${rows || small("Nothing has been changed since this game was made.")}${small("Every change of the time, the way the game starts or runs, the prizes or the size is listed here, with who made it and when. No player's name or number is ever in this list.")}</div>`;
  }
  /** Host mode: the big "Next number" button. A press only decides WHEN the next number is released; the number itself comes from the public random beacon 6 seconds later, so nobody can choose it. */
  function hostBlock() {
    if (!hostMode() || !S.cfg) return "";
    if (!S.cf) return `<div class="zc-block" id="hostcall"><h3>Next number</h3>${small(S.info && S.info.cap > 1000 ? "A Host can call the numbers in games of up to 1,000 people. This game is larger, so the software calls them." : "The Next number button becomes available once this game is set up.")}</div>`;
    const st = S.st, nexts = (st && st.nextRounds) || [], count = nexts.length, rounds = (S.cfg && S.cfg.rounds) || 1, total = 90 * rounds;
    const log = S.logs && S.logs[S.round] ? S.logs[S.round] : [], last = log.length ? log[log.length - 1] : null;
    const onWay = count > 0 && (S.now === null || nexts[count - 1] > S.now || log.length + 90 * (S.round - 1) < count); // signed, but its round is not published or not read yet
    const paused = S.control && S.control.pausedNow, done = count >= total, inRound = count - 90 * (S.round - 1);
    const over = allPrizesWon(), ended = !!(S.control && S.control.stopped); const starting = manualMode() && (goRound() === null || S.now === null || S.now < goRound()); const off = !S.started || starting || onWay || done || S.pressing || over || ended;
    const state = !S.started ? (manualMode() ? "Press Start first (see Start the game above)." : "The game has not started yet.") : starting ? "The game is starting…" : ended ? (S.control.stopNow ? "The game is over." : "The game is being ended. No more numbers will be called.") : over ? "Every prize has been won. The game is over." : done ? "Every number has been called." : paused ? "Paused. Press Resume, then the next number." : onWay ? "On its way to every phone…" : count ? "Press when you are ready for the next number." : "Press for the first number when everyone is ready.";
    return `<div class="zc-block zc-hostcall" id="hostcall"><h3>Next number</h3>
      <div class="zc-hostrow"><div class="zc-hostnum" id="hostlast" aria-live="polite" aria-label="${last ? "Number " + last : "No number yet"}">${last ? last : "–"}</div><div><b id="hostcount">${Math.max(0, Math.min(90, inRound))} of 90</b> called${rounds > 1 ? ` · round ${S.round} of ${rounds}` : ""}<br><span class="zc-small zc-nomargin" id="hoststate">${esc(state)}</span></div></div>
      <button type="button" class="zc-btn zc-btn-big" id="nextnum"${off ? " disabled" : ""}>${onWay ? "On its way…" : "Next number"}</button>
      ${small("The number reaches every phone within about 15 seconds. The order of the numbers comes from the public random numbers: your press only says when the next one is released.")}
      ${S.nextNote ? `<p class="zc-small" id="nextnote" role="status"><b>${esc(S.nextNote)}</b></p>` : ""}</div>`;
  }
  const leadWords = () => { const sec = leadSec(); return sec >= 90 ? "about " + Math.round(sec / 60) + " minutes" : "about " + sec + " seconds"; }; // how long after the press the game begins, from this game's own control profile
  const leadSec = () => (S.cf ? Math.max(10, Math.round(S.cf.leadRounds * 3 / 5) * 5) : 40); // seconds a Pause, Resume or End takes to reach the phones: one figure for the whole page
  const ctlStateOf = (st, now) => { const cur = now === null ? null : st.intervals.find((i) => now >= i.start && now < i.end), nxt = now === null ? null : st.intervals.find((i) => now < i.start); return { pausedNow: !!cur, pauseEnd: cur ? cur.end : 0, pausePending: !cur && !!nxt, stopped: st.stopRound !== null, stopNow: now !== null && st.stopRound !== null && now >= st.stopRound }; }; // what step 9 shows: paused, on its way, or ended
  const CTL_SENT = { pause: (s) => `Pause sent. It reaches the phones in about ${s} seconds. It ends by itself after 30 minutes. Press Resume sooner if the break is over.`, resume: (s) => `Resume sent. The numbers restart on the phones in about ${s} seconds.`, stop: (s) => `Ending the game. Phones stop in about ${s} seconds.`, extend: () => "Added 30 more minutes to the pause." };
  /** plain words, and what to do next, for a control press that failed or was refused */
  const ctlWords = (e) => {
    const m = String((e && e.message) || e || "");
    return /Failed to fetch|Load failed|NetworkError|network request failed/i.test(m) ? "We could not reach the internet. Please check it and press the button again."
      : /lives in another browser/i.test(m) ? "The key that controls this game is on the phone or computer where you made it. Use that one to pause or end the game."
      : /signing key|Signature does not match|No key is registered/i.test(m) ? (S.info && S.info.cap > 2000 ? "Pause and End are available for games of up to 2,000 people. This game is larger, so it runs without them." : S.locked ? "This game is waiting for its payment, so it cannot be paused or ended yet. Pay in step 8 first." : "This phone is not set up to control this game yet. Reload this page once and press the button again.")
      : /already paused/i.test(m) ? "The pause is already on its way, no need to press again."
      : /already stopped/i.test(m) ? "This game has already been ended."
      : /already used|Next sequence number/i.test(m) ? "A press went through just before this one. Look at the buttons to see where the game is now."
      : /already ending/i.test(m) ? "The pause is already ending."
      : /not paused/i.test(m) ? "The game is not paused right now, or it is already restarting."
      : /^Not accepted/i.test(m) ? "That press did not go through. Please wait a few seconds and press again."
      : m || "That did not go through. Please try again.";
  };
  const PAYNOTE = (copied) => (copied ? "Copied. Paste it into WhatsApp or e-mail. " : "We could not copy it by itself. Touch and hold the link below, then choose Copy. ") + "Anyone with this link can pay for this game. It works until the game is paid or for 7 days.";
  const reportOpener = () => { let w = null; try { w = window.open("", "_blank"); if (w) w.opener = null; } catch { /* the pop-up was blocked */ } return w; }; // opened on the tap itself, filled in later (a phone browser blocks a window opened after a network call)
  const reportShow = (w, url, made) => { S.rptNote = made ? "New report link made. The old one has stopped." : ""; if (w) { try { w.location.href = url; return; } catch { /* shown below */ } } S.reportUrl = url; S.rptNote = (S.rptNote ? S.rptNote + " " : "") + "Your browser blocked the new tab. Tap the link below to open the report."; };
  const reportFail = (w, e) => { if (w) { try { w.close(); } catch { /* fine */ } } S.rptNote = friendly(e); };
  const rptExtra = () => (S.rptNote ? `<p class="zc-small" id="rptnote" role="status"><b>${esc(S.rptNote)}</b></p>` : "") + (S.reportUrl ? `<p class="zc-small"><a class="zc-btn zc-btn-s" id="rptlink" href="${esc(S.reportUrl)}" target="_blank" rel="noopener">Tap here to open the report</a></p>` : "");
  const RUN_LINE = `<p class="zc-small" id="runline"><b>The Organizer / Host has to log into the game when the game is played. The game is controlled by the Organizer / Host.</b></p>`;
  function stepDay() {
    if (S.draft) return RUN_LINE + small("This opens when your game is published. Then you run the game from here: pause, resume, end, message your guests and hand over prizes.");
    const CS = S.control || {}, paused = !!CS.pausedNow, stopped = !!CS.stopped, onWay = !!CS.pausePending && !stopped, off = stopped || !!S.ctlBusy;
    const present = S.info && S.info.checkin && S.presence ? `<div class="zc-block" id="presentbox"><h3>Present: ${S.presence.present} of ${S.presence.total}</h3>${small("Check-in opens 5 minutes before the start. Every participant must mark themselves present (name, mobile, and the 4-digit code on their own ticket page) before their ticket opens. Only people who are present can win a prize.")}</div>` : "";
    const ctl = `${present}<div class="zc-block"><h3>Controls</h3><div class="zc-chips"><button type="button" class="zc-btn zc-btn-s" data-ctl="pause"${paused || onWay || off ? " disabled" : ""}>Pause the game…</button><button type="button" class="zc-btn zc-btn-s zc-btn-alt" data-ctl="resume"${paused && !off ? "" : " disabled"}>Resume</button>${paused && !off ? `<button type="button" class="zc-btn zc-btn-s zc-btn-alt" data-ctl="extend">Add 30 more minutes</button>` : ""}<button type="button" class="zc-btn zc-btn-s zc-btn-bad" data-ctl="stop"${off ? " disabled" : ""}>End the game</button></div>${stopped ? `<p id="ctlstate" role="status" style="margin:8px 0 0"><b>${CS.stopNow ? "The game is over." : "The game is being ended. Phones stop in about " + leadSec() + " seconds."}</b></p>` : paused ? `<p id="ctlstate" role="status" style="margin:8px 0 0"><b>Paused.</b> The numbers restart by themselves at ${esc(CS.pauseEnd ? ist(ZG.roundTimeMs(CS.pauseEnd)) : "the end of the pause")}. Press Resume sooner if the break is over.</p>` : onWay ? `<p id="ctlstate" role="status" style="margin:8px 0 0"><b>Pause on its way to the phones...</b></p>` : ""}
      ${small((S.cf ? `A pause reaches every phone about ${leadSec()} seconds after you press it: phones check in on a timer, and larger games check less often so they stay within the free plan.` : (S.info && S.info.cap > 2000 ? "Pause is available for games of up to 2,000 people. This one is larger, so it runs without it." : "Pause becomes available once this game is set up.")) + (S.ctlNote ? ' <b id="ctlnote" role="status">' + esc(S.ctlNote) + "</b>" : ""))}</div>`;
    const bigCtl = `${present}<div class="zc-block"><h3>Controls</h3>${small("Pause and End are available for games of up to 2,000 people. This game runs without them. Start is the one control: once the game has started it plays itself.")}</div>`;
    return RUN_LINE + startBlock() + hostBlock() + (S.cf && S.cf.startOnly ? bigCtl : ctl) + changesBlock() + announceBlock() + statsBlock() + prizeBlock() + rewardsBlock() + luckyBlock() + playBlock() + cont(9);
  }

  // ---------- step 10: after the game ----------
  const afterClone = () => (didNotStart() || isCancelled() || (S.life && (S.life.purged || S.life.reportSent)) ? cloneButton() : "");
  function stepAfter() {
    const l = S.life;
    const when2 = l ? `${rowl("Names, mobile numbers, seats and invitations of participants and Co-hosts", `<b>deleted by ${esc(ist(l.personalDeleteAtMs))}${l.purged ? " (done)" : ""}</b>`)}
      ${rowl("Complete report: a link is e-mailed to you, and the PDF is built on your own device", `<b>${l.reportSent ? "link sent" : l.purged ? "not sent" : "after the game ends"}</b>`)}
      ${rowl("Your details as Organizer and Host, and the winners record", `<b>kept until ${esc(dayIst(l.fullDeleteAtMs))}</b>`)}` : "";
    const rpt = !S.shield && S.life && S.life.reportSent && !S.life.purged ? `<div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s" id="rptopen">Open the report now</button><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="rptnew">New report link</button></div>${nearMsg("rpt")}` : "";
    return small("Within 24 hours of the game ending we send you the report, then delete every participant's name and number. Your details as Organizer and Host, and the winners record, are kept for 365 days. Co-host details are erased with the guests.") + when2 + rpt + rptExtra()
      + `<div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s zc-btn-bad" id="erase">Delete all participant data now</button></div>${nearMsg("erase")}`
      + small("You tap once to confirm. You can also e-mail us from your registered address. The report is e-mailed first when the game has already ended.")
      + afterClone() + (S.draft ? "" : cont(10, "All done"));
  }

  // ---------- the co-host's three steps ----------
  // REHEARSAL: the same block at the top of every page of a rehearsal (Game ID, REHEARSAL GAME n, the sentence)
  function rehBanner(info) {
    let el = document.getElementById("rehbanner"); const R = info && info.rehearsal;
    if (!R) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "rehbanner"; el.setAttribute("role", "status"); el.style.cssText = "background:#b3261e;color:#fff;padding:10px 14px;text-align:center;line-height:1.35;position:sticky;top:0;z-index:40"; document.body.insertBefore(el, document.body.firstChild); }
    if (el.dataset.t !== R.block) { el.dataset.t = R.block; const ln = String(R.block).split(String.fromCharCode(10)); el.innerHTML = "<div>" + esc(ln[0] || "") + "</div><div style='font-size:1.25rem;font-weight:900'>" + esc(ln[1] || "") + "</div><div style='font-weight:700'>" + esc(ln.slice(2).join(" ")) + "</div>"; }
  }
  /** What a rehearsal puts in front of every share text (WhatsApp, e-mail, copy): the same block as on its pages. */
  // LANGUAGE (1.6.2): a small dropdown at the top right of every screen. English is the only language for now; the choice is remembered in this browser and takes effect at once. It sits outside the page that redraws every second, so it never closes by itself, and it is never under the gold Claim buttons (those are at the bottom).
  (function langBox() {
    try { const saved = localStorage.getItem("ctz-lang"); if (saved) ZG.setLang(saved); } catch { /* the browser may block storage */ }
    if (document.getElementById("langsel")) return;
    const btn = document.createElement("button"); btn.type = "button"; btn.id = "langsel"; btn.setAttribute("aria-label", "Language"); btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
    btn.style.cssText = "position:fixed;top:6px;right:6px;z-index:45;font-size:.8rem;padding:2px 8px;border-radius:8px;border:1px solid #c9cdd6;background:#fff;color:#1a2233;cursor:pointer";
    const menu = document.createElement("div"); menu.id = "langmenu"; menu.setAttribute("role", "listbox"); menu.hidden = true; menu.style.cssText = "position:fixed;top:32px;right:6px;z-index:46;background:#fff;color:#1a2233;border:1px solid #c9cdd6;border-radius:8px;padding:4px;box-shadow:0 6px 16px rgba(0,0,0,.2)";
    const label = () => { btn.textContent = String(ZG.getLang()).toUpperCase() + " ▾"; };
    for (const [c, n] of Object.entries(ZG.LANGS)) { const o = document.createElement("button"); o.type = "button"; o.setAttribute("role", "option"); o.dataset.lang = c; o.textContent = n; o.style.cssText = "display:block;width:100%;text-align:left;padding:6px 10px;border:0;background:none;font-size:.9rem;cursor:pointer"; o.onclick = () => { ZG.setLang(c); try { localStorage.setItem("ctz-lang", ZG.getLang()); } catch { /* not remembered */ } label(); menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }; menu.appendChild(o); }
    btn.onclick = () => { menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); };
    label(); document.body.appendChild(btn); document.body.appendChild(menu);
  })();
  const rehShare = () => (S.info && S.info.rehearsal ? S.info.rehearsal.block + String.fromCharCode(10, 10) : "");
  const cohInvite = () => (S.coh && S.coh.inviteLink) || guestLink();
  function cohStep(n) {
    const c = S.coh;
    if (!c) return `<p class="zc-small zc-warnt" role="status">${esc(S.cohErr || "Loading your game…")}</p>`;
    if (n === 1) return rowl(`<b>${esc(c.name || "Your game")}</b>, ${esc(c.startMs ? when(c.startMs) : "")}`, `<span class="zc-small zc-nomargin">read only</span>`) + rowl(`${Number(c.joined) || 0} ${Number(c.joined) === 1 ? "person" : "people"} joined of ${Number(c.cap) || 0}`, "") + small("You cannot change the game.") + `<span class="zc-lbl">What you can do</span>` + roleCards("cohost") + `${cont(1)}`;
    if (n === 2) return `<span class="zc-lbl">Your own invite link</span>` + (c.inviteLink ? `<div class="zc-linkrow"><span class="zlink">${esc(cohInvite())}</span><button type="button" class="zc-mini" id="copy">Copy link</button></div>
      <div class="zc-chips zc-gap"><a class="zc-chip" href="${esc("https://wa.me/?text=" + encodeURIComponent(rehShare() + "You are invited to play Corporate Tambola. Join here: " + cohInvite()))}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a></div>` : small("Your link appears once the game is published."))
      + `
      ${rowl("People you brought", `<b>${Number(c.brought) || 0}</b>`)}${small("You can invite people up to your limit.")}
      ${peopleBlock()}${small("Want your guests to invite their own friends? Ask the Organizer or a Host to switch it on. You cannot switch it on yourself.")}${cont(2)}`;
    const p = payState();
    return `<p class="zc-small">Status: <b>${payLabel(p)}</b></p>` + (p.paid ? paidRow() : p.confirming ? rowl(`<b>Confirming your payment...</b><br><span class="zc-small zc-nomargin">The game starts only after the bank says yes.</span>`, "") : rowl(`<b>Pay</b>${c.startMs ? " before " + esc(when(c.startMs)) : ""}<br><span class="zc-small zc-nomargin">${c.price ? esc(typeof c.price === "number" ? money(c.price) : String(c.price)) + ". " : ""}Pay once, from any one of you.</span>`, `<a class="zc-btn zc-btn-s" href="/pay.html?e=${encodeURIComponent(eid)}">Pay</a>`)) + payLinkBlock() + cont(3, "All done");
  }

  // ---------- the page: top bar, strips, progress, steps, help ----------
  const HELP = [
    ["How do I start?", "Open step 1, tap your choices, then press Save and continue. Do the same on each step: nothing is saved until you press it."],
    ["Who pays?", "Any one of the Organizer, a Host or a Co-host. Only one payment is needed. Guests pay nothing."],
    ["What if nobody pays?", "The game does not begin. Nothing is charged. Once one payment is made, the game is on."],
    ["Can I change things later?", "Yes, until the game starts. Open the step and change it."],
    ["How do I add a video?", "Open Brand moments and paste the link. Tap Test it to see what guests see."],
    ["What do guests see?", "A ticket on their phone. No app to install."],
    ["Is my guests' data safe?", "It is encrypted. Names and numbers are erased within 24 hours after the game."],
    ["What is a lucky draw?", "A draw during the game. The software picks the winners from everyone playing."],
    ["How do I stop the game?", "Open Game day and tap Pause or End. Organizer and Hosts can do this."],
    ["Who can do what?", "The Organizer can do everything, including the account (keys, e-mail). A Host can do everything in the game except the account and adding Hosts. A Co-host invites people and can pay. Open step 5 to see it."],
    ["What is the big screen link?", "A page for a projector or TV. It shows numbers and winners only, never a guest's name or number. Copy it in step 6 and open it on the laptop connected to the screen."],
    ["What is the demo game?", "It is a real game for up to 10 people at Rs 0, with every feature of the console. Choose \"Demo game, 10 people, Rs 0\" in step 2. If you need more people later, choose a bigger size in step 8 and pay: the game carries on."],
    ["Can I get a refund?", "We do not give refunds. If you cancel a paid game before it starts, your payment stays in the Organizer's account as credit for the next game, for 365 days. Unused credit lapses at the end of day 365."],
    ["Who do I contact?", "Write to our Grievance Officer at hello@corporatetambola.com. We reply within 30 days."],
  ];
  const ROLE_LABEL = { organizer: "Organizer", host: "Host", cohost: "Co-host", partner: "Partner" };
  function rolePill() {
    const r = role();
    if (r === "partner") return /^refer/.test(S.kind) ? "Refer and Earn Partner" : /^sales/.test(S.kind) ? "Sales Partner" : "Partner";
    if (r === "host" && S.hostN) return `Signed in as Host ${S.hostN} of ${(S.team && S.team.maxHosts) || 5}`;
    return `Signed in as ${ROLE_LABEL[r]}`;
  }
  /** A person who is both an Organizer and a Host holds two keys (the sign-in gave both): the one in use is `secret`, the other waits here. */
  const altRole = () => { try { const a = JSON.parse(ss.get("ctz-alt") || "null"); return a && typeof a.token === "string" && (a.kind === "host" || a.kind === "organizer") ? a : null; } catch { return null; } };
  const roleBtns = () => {
    const a = altRole(), r = role();
    return (a && (r === "organizer" || r === "host") ? `<button type="button" class="zc-mini zc-switch" id="switchrole" title="You are both. Switch your view.">Switch to ${a.kind === "host" ? "Host" : "Organizer"} view</button>` : "")
      + (r === "host" && eid ? `<button type="button" class="zc-mini" id="hostall">All my games</button>` : "")
      + (r !== "partner" && secret ? `${S.email && !S.shield ? `<span class="zc-who" id="whoemail" title="You are signed in as this e-mail address">${esc(S.email)}</span>` : ""}<button type="button" class="zc-mini zc-signout" id="signout" title="Sign out of this phone or laptop">Sign out</button>` : "");
  };
  const inGame = () => !!eid && S.screen !== "quick" && (role() === "cohost" ? !!S.coh || !!S.cohErr : !!S.cfg);
  function gameLabel() {
    if (!inGame()) return "";
    if (role() === "cohost") return S.coh ? `${S.coh.name || "Your game"} · ${S.coh.startMs ? when(S.coh.startMs) : ""}` : "";
    return `${(S.cfg && S.cfg.name) || "Your game"} · ${S.info ? when(S.info.startMs) : ""}`;
  }
  function barHtml() {
    const g = inGame() && role() !== "partner", p = payState();
    return `<header class="zc-bar"><span class="zc-brand"><img src="/icon-192.png" alt="" width="22" height="22"> <b>Corporate Tambola</b></span><span class="zc-pill zc-pill-role" id="rolepill" title="Your role">${esc(rolePill())}</span>`
      + (g && isDemo() ? `<span class="zc-pill zc-pill-demo" id="demopill" title="This is a demo game">DEMO GAME</span>` : "")
      + (g ? `<span class="zc-pill ${p.paid ? (isDemo() ? "zc-pill-demo" : "zc-pill-paid") : "zc-pill-pend"}" id="paypill" title="Payment status">${payLabel(p)}</span>` : "")
      + `<span class="zc-where">${esc(gameLabel())}</span>${isOrg() && eid ? `<button type="button" class="zc-mini" id="back">All games</button>` : ""}${roleBtns()}</header>`;
  }
  function payNote() {
    if (!inGame() || role() === "partner" || payState().paid || isCancelled() || didNotStart() || S.draft) return ""; // a draft has nothing to pay yet: publishing (step 7) comes first
    if (payState().confirming) return `<div class="zc-paynote" id="paynote" role="note"><b>Confirming your payment...</b> This takes a moment. The game starts only after the bank says yes. Nothing more to do.</div>`;
    return `<div class="zc-paynote" id="paynote" role="note"><b>A payment is pending for this game.</b> Just one of you needs to make it: the Organizer, a Host or a Co-host. Guests pay nothing. It is for this one game only, with no commitment and no repeat charges.${erasureMsOf() && role() !== "cohost" ? ` <span id="erasurestrip">Guest data will be erased on ${esc(dmy(erasureMsOf()))} if the game does not start.</span>` : ""}</div>`;
  }
  function aiStrip() {
    return ""; // the AI work link is not offered to the organizer or the host: the screens themselves do the work
    if (!isOrg()) return "";
    return `<div class="zc-ai" id="aistrip"><div class="zc-split"><b>Your AI assistant work link</b>${S.aiMsg ? `<button type="button" class="zc-mini" id="aistripcopy">Copy</button>` : `<button type="button" class="zc-mini" id="aistripmake">Get my AI work link</button>`}</div>
      <div class="zc-small zc-nomargin">Copy and paste it in any AI chat, like ChatGPT, Gemini, Claude, Grok, DeepSeek, z.ai and others. Copy it as many times as you like.</div>${shieldSwitch()}</div>`;
  }
  function progHtml() {
    const st = steps(), d = st.filter((s) => isDone(s[0])).length, p = Math.round(d * 100 / st.length);
    return `<div class="zc-prog"><div class="zc-split"><span>Your progress</span><span><b>${d} of ${st.length} done</b> · ${p}%</span></div><div class="zc-track" role="progressbar" aria-label="Your progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><div class="zc-fill" id="progfill" style="width:${p}%"></div></div>
      <div class="zc-jump"><span>Jump to</span>${st.map((s) => `<button type="button" class="zc-dot" data-open="${s[0]}" aria-label="Step ${s[0]}: ${esc(s[1])}" style="background:var(--bg-tint-${s[2]});color:var(--text-tint-${s[2]})${S.open === s[0] ? `;outline:2px solid var(--text-tint-${s[2]})` : ""}">${s[0]}</button>`).join("")}<button type="button" class="zc-pillbtn" data-act="help">Help</button></div></div>`;
  }
  function sum(n) {
    if (role() === "cohost") { const c = S.coh; if (!c) return ""; return [c.startMs ? when(c.startMs) : "", `${Number(c.brought) || 0} ${Number(c.brought) === 1 ? "person" : "people"} brought`, payState().paid ? "Paid" : "Payment pending for this game"][n - 1] || ""; }
    const c = S.cfg, inf = S.info; if (!c || !inf) return "";
    const t = c.tickets, used = (c.opening || []).length + (c.breaks || []).length + (c.closing || []).length, T = S.team;
    return [`${c.name || "Your game"}, ${when(inf.startMs)}`, `Up to ${inf.cap}, ${t} ticket${t === 1 ? "" : "s"}, ${hostMode() ? "a Host calls" : inf.callSeconds + " seconds"}`, `${(c.rewards || []).length} prizes`, `${used} of ${5 * t} moments`,
      T ? `${pl((T.hosts || []).length, "Host", "Hosts")}, ${pl((T.cohosts || []).length, "Co-host", "Co-hosts")}` : "", S.draft ? "Guest link ready after publishing" : "Guest link ready", S.draft ? "Not published yet" : "Published", S.draft ? "Publish first" : isCancelled() ? "Cancelled" : isDemo() ? "Demo game. Make it a real game here" : payState().paid ? (isFree10() ? "Rs 0 · nothing to pay" : "Paid. The game is on") : payState().confirming ? "Confirming your payment..." : "Payment pending", S.started ? (gameEnded() ? "The game is over" : "The game is on") : "Opens when the game starts", S.life && S.life.purged ? "Report sent, data erased" : S.life && S.life.reportSent ? "Report sent. Data is erased 24 h after the end" : "Your report, then erasing data"][n - 1] || "";
  }
  // "About this step": a short, always-visible write-up under each talking line (docs/ROLES_AND_CONSOLE_SPEC_4.md, A). At most 5 short lines each.
  const ABOUT = {
    1: ["This is the basics. Pick the occasion, the day and the time.", "Times are India time.", "Guests can join before the start. The first number comes 2 minutes after the start.", "The numbers and who calls them are chosen in step 2.", "You can change all this until the game starts."],
    2: ["Pick the biggest crowd you expect. You see the price when you pay. Choose 'Demo game, 10 people, Rs 0' for a real game with nothing to pay.", "Who is this game for: \"A list of people I choose\" keeps it to your list, and people not on the list wait for you to let them in.", "\"Anyone with the link\" lets people in at once.", "Who calls the numbers comes first: with the software, you choose the gap between numbers; with a Host, there is no gap to choose. Tickets and games in a row can stay as they are.", "Each guest can invite family or colleagues if you switch it on."],
    3: ["Tick the prizes you will give. Pick what each one is.", "\"I will decide later\" is fine. You can still publish and choose before the game starts.", "\"No prize\" shows on the ticket as \"No prize\".", "You give the prizes. We provide the software.", "The software picks the winners. Nobody can change them, not even us."],
    4: ["Show your message, video or audio in the game.", "You get 5 moments for each ticket: before the game, during it and at the end. A lucky draw is also a moment.", "If you paste a link, press \"Test it\" to check that it plays.", "Use a YouTube link, or a direct link to a video or audio file. We do not save your video or audio: we play it straight from the link, so keep the link online.", "Add your company name, a colour and a small logo for the top of the ticket. Press \"Save and continue\", then press \"See what guests see\" to check it."],
    5: ["A Host runs the game with you. Give a name and a mobile number or an e-mail; the Host adds the other one when they open their link.", "A Co-host invites people and can pay. A Co-host needs a name and a mobile number only.", "Guests need a name and a mobile number only.", "Send each personal link to one person only.", "Each Co-host can add up to 100 people unless you change it below."],
    6: ["Add your people here, one by one, from your phone contacts (where your phone allows it), by uploading a PDF or a CSV.", "Each person gets their own WhatsApp link. Or share the one common link in a group.", "With \"Only people on a list\", people who are not on your list wait under \"Waiting to come in\". You can let them in one by one or press \"Approve all\".", "The big screen link is for the laptop connected to the room screen. It shows numbers and winners only.", "Guests can join only after you publish in step 7."],
    7: ["Look through your game and change what you need.", "Publishing is free. Guests can join after you publish.", "Real housie: players tap each number as it is called and press Claim before the next number. A wrong claim is a Bogey; two Bogeys on the same prize and that ticket is out of it.", "You can cancel before the start time. We do not give refunds: a paid game becomes credit for your next game for 365 days. Or change the date instead.", "Press \"See what guests see\" to look at a sample ticket."],
    8: ["Pay once, before the start time. You see the price here.", "The Organizer, a Host or a Co-host can pay. A game for 10 people or fewer has nothing to pay: choose a bigger size here when you want more people, even during the game.", "Paid late? The game starts 2 minutes after your payment is confirmed.", "A paid game cannot be cancelled after the start time. Before it, your payment stays as credit for 365 days.", "\"Copy payment link\" makes a link anyone can open to pay for this game."],
    9: ["Run the game from here. Pause, resume or end it.", "Send a message to every phone.", "A prize goes to the player who claimed it in time: tap, then Claim before the next number. The software checks every claim.", "Tick a prize when you hand it over.", "Only the Organizer and Host can remove a person during the game."],
    10: ["Corporate Tambola is designed to follow the US privacy laws, the EU GDPR and India's Digital Personal Data Protection (DPDP) Act.", "A few minutes after the game, a link to the full game report is e-mailed to the Organizer. From then on, the data of the game is in the Organizer's custody.", "We delete all participant names and details within 24 hours of the game.", "For invoicing and tax, and as the law requires, we keep only the details of the Organizer, the Hosts and the winners for 365 days. After that we delete everything, except the invoice and tax records that the law requires us to keep.", "You can erase participant data earlier, at any time."],
  };
  const ABOUT_COH = { 1: ["You can see the game and what you may do."], 2: ["Add your people. Each gets their own WhatsApp link. You can bring up to your limit."], 3: ["One payment is enough. If someone has paid, you will see Paid.", "\"Copy payment link\" makes a link anyone can open to pay for this game."] };
  const aboutBox = (n) => { const L = (role() === "cohost" ? ABOUT_COH : ABOUT)[n]; return L ? `<div class="zc-about" id="about${n}"><b>About this step</b>${role() === "cohost" ? "" : iBtn("step" + n)}${L.map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""; };
  const badge = (s) => `<span class="zc-num" style="background:var(--text-tint-${s[2]})">${s[0]}</span>`;
  function synHtml() {
    return steps().map((s) => { const d = isDone(s[0]); return `<button type="button" class="zc-syn${S.open === s[0] ? " act" : ""}" data-open="${s[0]}">${badge(s)}<span class="zc-syntx"><b>${esc(s[1])}</b><br><span class="zc-muted">${esc(sum(s[0]) || (d ? "Done" : "To do"))}</span></span><span class="zc-st${d ? " ok" : ""}" aria-label="${d ? "Done" : "To do"}">${d ? "&#10003;" : "&#9675;"}</span></button>`; }).join("");
  }
  const stepBody = (n) => (role() === "cohost" ? cohStep(n) : [stepGame, stepPlay, stepPrizes, stepBrand, stepTeam, stepShare, stepPublish, stepPay, stepDay, stepAfter][n - 1]());
  function secHtml(s) {
    const n = s[0], isOpen = S.open === n, tc = touched(n), d = isDone(n) && !tc, c = s[2], sm = tc && !isOpen ? "Not saved yet. Open this step and press Save and continue." : sum(n);
    return `<section class="zc-card${isOpen ? " open" : ""}" id="sec${n}" style="${isOpen ? `border-color:var(--text-tint-${c})` : ""}"><button type="button" class="zc-sech" data-open="${n}" aria-expanded="${isOpen}" aria-controls="secb${n}" style="background:var(--bg-tint-${c});color:var(--text-tint-${c})">${badge(s)}<span class="zc-syntx"><b>${esc(s[1])}</b><br><span class="zc-hint">${esc(isOpen || !sm ? s[3] : sm)}</span></span><span class="zc-st${d ? " ok" : " pend"}" aria-label="${d ? "Done" : "To do"}">${d ? "&#10003;<span class=\"zc-sr\"> Done</span>" : "&#9675;<span class=\"zc-sr\"> To do</span>"}</span><span class="zc-caret" aria-hidden="true">${isOpen ? "&#9650;" : "&#9660;"}</span></button>`
      + (isOpen ? `<div class="zc-secb" id="secb${n}" style="border-left:5px solid var(--text-tint-${c});background:linear-gradient(0deg,var(--bg-tint-${c}) 0,var(--bg-tint-${c}) 100%);background-color:var(--bg-tint-${c})"><div class="zc-say" style="background:var(--bg-tint-${c});color:var(--text-tint-${c})${tc ? ";background:#FFF4D0;color:#5B4300;font-weight:700" : ""}">${tc ? "Not saved yet. Press Save and continue below." : d ? (n === 8 ? (payState().paid ? "Nothing more to pay." : esc(s[4])) : "Saved. You can change it any time.") : esc(s[4])}</div>${aboutBox(n)}${S.toast && n > 4 ? `<div class="zc-toast" role="status">${esc(S.toast)}</div>` : ""}${stepBody(n)}</div>` : "") + `</section>`;
  }
  /** The game is over (every number called, or the report already went out): the hint must not send the organizer back to step 1. */
  /** Every prize line has a confirmed winner (the rule the phones use to end the game): the game is over, the numbers are not called on to 90. */
  const allPrizesWon = () => { try { const ps = ZG.prizeStatus && S.cfg ? ZG.prizeStatus(S.cfg, S.published || [], S.round || 1) : []; return ps.length > 0 && ps.every((p) => p.claimed) && (S.round || 1) >= ((S.cfg && S.cfg.rounds) || 1) && !!S.started && !(S.cfg && S.cfg.keepCalling); } catch { return false; } };
  const gameEnded = () => !!(S.life && (S.life.purged || S.life.reportSent)) || (!!S.started && (S.log || []).length >= 90 && !(S.cfg && S.cfg.rounds > 1)) || allPrizesWon() || !!(S.control && S.control.stopNow);
  function nextHtml() {
    const n = nextStep();
    if (!n) return `<div class="zc-next zc-next-ok"><span><b>All done.</b> Nothing else to do.</span></div>`;
    if (gameEnded() && !S.draft) return `<div class="zc-next"><span><b>The game is over.</b> Hand over the prizes from step 9 (the winners list); the report link comes by e-mail (step 10).</span><button type="button" class="zc-mini" data-open="9">Go</button></div>`;
    return `<div class="zc-next"><span><b>Next:</b> ${esc(n[1])}. ${esc(n[4])}</span><button type="button" class="zc-mini" data-open="${n[0]}">Go</button></div>`;
  }
  function helpHtml() {
    return `<section class="zc-card zc-help" id="help"><div class="zc-sech zc-sech-static"><span class="zc-num zc-num-dark">?</span><span class="zc-syntx"><b>Help</b><br><span class="zc-hint">Tap a question. The answer is short.</span></span></div><div class="zc-secb">${HELP.map((x, i) => `<div class="zc-q"><button type="button" class="zc-qh" data-q="${i}" aria-expanded="${S.q === i}"><span>${esc(x[0])}</span><span aria-hidden="true">${S.q === i ? "&#9650;" : "&#9660;"}</span></button>${S.q === i ? `<div class="zc-qa">${esc(x[1])}</div>` : ""}</div>`).join("")}
      <div class="zc-chips zc-gap"><button type="button" class="zc-mini" data-act="steps">Back to your steps</button><button type="button" class="zc-mini" data-act="top">Back to top</button></div></div></section>`;
  }
  // ---------- the account: only the Organizer's ----------
  const AIOPEN = [["ChatGPT", "https://chatgpt.com/?q="], ["Grok", "https://grok.com/?q="], ["Claude", "https://claude.ai/new?q="]];
  const AICOPY = [["Gemini", "https://gemini.google.com/app?q="], ["DeepSeek", "https://chat.deepseek.com/"], ["z.ai", "https://chat.z.ai/"]];
  const aiOptions = (paste) => `<div class="zc-small"><b>Open your AI with this already filled in</b></div><div class="zc-chips">${AIOPEN.map(([n, u]) => `<a class="zc-chip" data-ai="${n}" href="${u}${encodeURIComponent(paste)}" target="_blank" rel="noopener noreferrer">${n}</a>`).join("")}</div>
    <div class="zc-small"><b>Copy it and open your AI, then press Ctrl+V and Send</b></div><div class="zc-chips">${AICOPY.map(([n, u]) => `<button class="zc-chip" type="button" data-aicopy="${n}" data-url="${u}${n === "Gemini" ? encodeURIComponent(paste) : ""}">${n}</button>`).join("")}</div><div class="zc-small zc-okt" id="aicopied" role="status"></div>`;
  const wireAiOptions = (root, paste) => root.querySelectorAll("[data-aicopy]").forEach((b) => (b.onclick = async () => {
    let ok = false; try { await navigator.clipboard.writeText(paste); ok = true; } catch {}
    const m = root.querySelector("#aicopied"); if (m) m.textContent = ok ? "Copied. Press Ctrl+V, then Send" : "Could not copy here: select the box above, copy it, then open " + b.dataset.aicopy + " and paste.";
    try { window.open(b.dataset.url, "_blank", "noopener,noreferrer"); } catch {}
  }));
  function aiBlock() {
    return "";
    const ai = S.aiMsg
      ? `<textarea class="zc-in zc-ta zlink" id="aimsg" rows="4" readonly aria-label="Your AI work link">${esc(S.aiMsg)}</textarea><div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s" id="aicopy">Copy my AI work link</button></div>${aiOptions(S.aiMsg)}<div class="zc-chips zc-gap"><button type="button" class="zc-mini" id="aifresh">Get a fresh AI link</button><button type="button" class="zc-mini" id="aireplace">Replace my AI link</button><button type="button" class="zc-mini zc-danger" id="airevoke">Stop this link</button></div><p class="zc-small"><b>Fresh link</b>: e-mailed, works 24 hours. <b>Replace</b>: stops every old link.</p>`
      : `<button type="button" class="zc-btn zc-btn-s" id="aimake">Get my AI work link</button>`;
    return `<div class="zc-block"><h3>Let your free AI assistant do the work</h3><p class="zc-small">Copy the whole message below and paste it into <b>ChatGPT (web browsing on), Gemini, Claude</b> or any AI chat that can open web links. It asks you one question at a time with numbered choices, builds the game, and gives you every link and the pay link. You keep four things: payment, Publish, erasing data, pause or stop. <a href="/ai-prompt.html" target="_blank" rel="noopener">The 6 steps, with tips for each assistant</a>.</p>${ai}
      <h4>An AI in your web browser, or do it yourself</h4>${small("Use an AI that works in your web browser (Claude in Chrome, Gemini in Chrome, ChatGPT Atlas, Perplexity Comet): tick <b>My AI works in my web browser</b> in the AI Assistant box, so it never sees a guest's name or number, then ask it to open this page and set up your game with the Quick setup form. It stops at Publish, erase, pause and stop, and it never pays.")}
      <div class="zc-chips"><a class="zc-chip" href="/zc.html?quick=1">Quick setup form (date and time pickers)</a><a class="zc-chip" href="/demo.html" target="_blank" rel="noopener">Try the free 70-second demo</a></div></div>`;
  }
  function acctHtml() {
    if (!isOrg()) return "";
    const open = S.acctOpen === null ? !eid : S.acctOpen;
    const credits = creditsBlock();
    const keys = (S.keys || []).length ? `<div class="zc-block"><h3>Your sign-in keys</h3>${S.keys.map((k) => `<div class="zc-rowl"><span>${k.kind === "ai" ? "Link for your helper tool" : k.kind === "host" ? "Host key" : k.kind === "cohost" ? "Co-host key" : "Organizer key"} · made ${new Date(k.created_ms).toLocaleDateString()}${k.thisOne ? " · in use now" : ""}</span>${k.revoked ? `<i>retired</i>` : k.thisOne ? `<i>active</i>` : `<button type="button" class="zc-mini" data-retirekey="${esc(k.id)}">Retire</button>`}</div>`).join("")}${small("If you ever lose a key or think someone has it, sign in with another one and retire it here.")}</div>` : "";
    const sugs = (S.sugs || []).length ? `<div class="zc-block"><h3>Ideas to improve Corporate Tambola</h3>${small("Suggested by other organizers. We review them all.")}${S.sugs.map((x) => rowl(esc(x.title) + (x.yours ? " · yours" : ""), `<i>${x.votes} · ${esc(x.status.replace("_", " "))}</i>`)).join("")}</div>` : "";
    const T = S.aiTrail;
    const audit = ""; /* the AI activity log is not shown in the organizer console */ const _auditUnused = `<div class="zc-block"><h3>What your AI assistant did</h3>${T ? (T.length ? T.slice(0, 40).map((t) => `<div class="zc-rowl"><span>${esc(dmy(t.at_ms))}<br><small class="zc-small zc-nomargin">${esc(t.method)} ${esc(t.path)} → ${esc(String(t.status))} · from ${esc(t.ip || "?")} ${esc(t.country || "")} · ${esc((t.ua || "").slice(0, 60))} · key ${esc(t.key_id || "")}</small></span></div>`).join("") : small("Your AI assistant has not made any call yet.")) : `<button type="button" class="zc-mini" id="aiaudit">Show the AI activity log</button>`}${small("Every call your AI assistant makes is recorded with the time, the key used and where it came from. It is kept for 365 days.")}</div>`;
    const close = `<div class="zc-block"><h3>Close my account</h3>${small("This deletes your account and all your games. Payment records stay, as the law requires. It cannot be undone.")}<button type="button" class="zc-mini zc-danger" id="closeacct">Close my account</button></div>`;
    return `<section class="zc-card zc-acct" id="acct"><button type="button" class="zc-sech" data-acct="1" aria-expanded="${open}" style="background:var(--surface-1)"><span class="zc-num zc-num-dark">A</span><span class="zc-syntx"><b>Your account</b><br><span class="zc-hint">These are for the Organizer only: your sign-in keys and records. Closing your account deletes your games.</span></span><span class="zc-st">${open ? "&#9650;" : "&#9660;"}</span></button>${open ? `<div class="zc-secb">${aiBlock()}${credits}${keys}${sugs}${audit}${close}</div>` : ""}</section>`;
  }
  // ---------- notes above the steps ----------
  const ACTTEXT = { publish: "Publishing is free. Check your e-mail and mobile number, then press \"Confirm and publish\" yourself.", erase: "Press \"Delete all participant data now\" only if you want every guest's name and number erased. It cannot be undone.", pause: "Press \"Pause\" to pause the running game for everyone.", stop: "Press \"End the game\" only if the game should end for everyone. It cannot be undone." };
  const actBanner = () => (ACT && ACTTEXT[ACT] && eid && canRun() ? `<div class="zc-toast" role="status" id="actbanner"><b>Your helper tool brought you here.</b> ${ACTTEXT[ACT]} Nobody but you can press it.</div>` : "");
  const ACTSTEP = { publish: 7, erase: 10, pause: 9, stop: 9 };
  /** The AI helper switch: one small line inside the AI Assistant box (Organizer only). Off by default. The shield behaviour itself is unchanged. */
  const shieldSwitch = () => `<div class="zc-shield"><label class="zc-check" for="shield"><input type="checkbox" id="shield" ${S.shield ? "checked" : ""}> My AI works in my web browser: hide guest names and numbers</label>${S.shield ? `<div class="zc-small zc-nomargin">On. This page shows no guest name or mobile number. Switch it off to load your guest list or look up a guest.</div>` : ""}</div>`;
  function alertZone() {
    let h = actBanner() + clonePanel();
    if (S.cloneNew === eid && S.draft && canRun()) h += `<div class="zc-toast" role="status" id="newgamenote">This is a new game. Nothing is paid or published yet.</div>`;
    if (didNotStart() && inGame() && canRun()) h += didNotStartBlock();
    if (isCancelled() && inGame()) h += `<div class="zc-toast" role="status" id="cancelnote">This game was cancelled. Guests can see this. Nothing more is needed.</div>`;
    if (S.note) h += `<div class="zc-toast" role="status" id="zcnote">${esc(S.note)}</div>`;
    if (S.passMsg) h += `<div class="zc-toast" role="status" id="passmsg">${esc(S.passMsg)}</div>`; // from a demo pass link: shown until the size is chosen in step 2
    if (canRun()) {
      if (S.locked && !S.draft) h += payDueCard();
      if ((S.reqs || []).length) h += `<div class="zc-alert"><h3>Your helper tool is asking</h3>${S.reqs.map((r) => rowl(esc(r.action) + (r.note ? " · " + esc(r.note) : ""))).join("")}<div class="zc-chips"><button type="button" class="zc-btn zc-btn-s${S.reqs[0].action === "erase" ? " zc-btn-bad" : ""}" id="reqok">${S.reqs[0].action === "erase" ? "Confirm: delete all participant data" : "Approve (" + esc(S.reqs[0].action) + ")"}</button><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="reqno">Dismiss</button></div></div>`;
      if (S.waitN > 0 && S.open !== 6) h += `<div class="zc-alert" id="waitbanner"><h3>${S.waitN === 1 ? "1 person is waiting to come in" : S.waitN + " people are waiting to come in"}</h3>${small("They opened your link but are not on your list. They wait until you let them in.")}<div class="zc-chips"><button type="button" class="zc-btn zc-btn-s" data-open="6">Open the waiting list</button></div></div>`;
      if (!S.draft && S.cfg) h += `<div class="zc-live" id="zclive"><b>${S.people.length}</b> ${S.people.length === 1 ? "person" : "people"} · numbers called <b>${S.log.length} / 90</b>${S.cfg.rounds > 1 ? ` · round ${S.round} of ${S.cfg.rounds}` : ""}</div>`;
    }
    return h;
  }
  const hmIst = (ms) => new Date(ms).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
  /** the numbers called so far in the round being played, cut where the game ended when the game ends with the last prize */
  function calledSoFar() {
    let log = (S.logs && S.logs[S.round]) || [];
    if (allPrizesWon()) { const last = Math.max(0, ...(S.published || []).filter((x) => (x.round || 1) === (S.round || 1) && Number.isInteger(x.idx)).map((x) => x.idx + 2)); if (last > 0 && last < log.length) log = log.slice(0, last); }
    return log;
  }
  const dayTimeIst = (ms) => ZG.dayTimeIst(ms); // the same words on every screen
  const mmssOf = (sec) => ZG.mmss(sec);
  /** What is happening now, as one of the story states (the same words every screen uses: ZG.story). */
  function consoleStory() {
    const log = calledSoFar(), r = role(), who = r === "host" ? "host" : r === "cohost" ? "cohost" : "organizer";
    const base = { role: who, called: log.length, manual: manualMode() };
    if (S.draft) return ZG.story({ ...base, state: "draft" });
    if (isCancelled()) return ZG.story({ ...base, state: "cancelled" });
    if (didNotStart()) return ZG.story({ ...base, state: "neverStarted" });
    const pz = S.st && S.now !== null ? S.st.intervals.find((i) => S.now >= i.start && S.now < i.end) : null;
    if (S.control && S.control.stopNow) return ZG.story({ ...base, state: "endedByOrganizer" });
    if (allPrizesWon()) return ZG.story({ ...base, state: "endedPrizes" });
    if (S.started && log.length >= 90 && (S.round || 1) >= ((S.cfg && S.cfg.rounds) || 1)) return ZG.story({ ...base, state: "endedAll" });
    if (S.unpaid) return ZG.story({ ...base, state: "unpaid" });
    if (pz) { const pm = S.cf ? (S.cf.messages || []).find((m) => m.action === "pause" && m.atBeaconRound === pz.start) : null; return ZG.story({ ...base, state: "paused", by: pm && S.cf.by && S.cf.by[pm.seq - 1] === "Host" ? "a Host" : "the Organizer" }); }
    if (!S.info) return ZG.story({ ...base, state: "waiting" });
    const sr = S.info.startRound, go = goRound();
    if (manualMode() && go === null) {
      if (S.now !== null && S.now > sr + 28800) return ZG.story({ ...base, state: "neverStarted" }); // a day after its time, nobody pressed Start
      return ZG.story({ ...base, state: S.now !== null && S.now >= sr ? "waitStart" : "waiting", time: dayTimeIst(S.info.startMs) });
    }
    if (log.length === 0) {
      const first = manualMode() ? go : sr + ZG.GRACE_ROUNDS, left = S.now === null || first === null ? null : (first - S.now) * 3;
      if (left !== null && left > 0 && left <= 300) return ZG.story({ ...base, state: "countdown", countdown: mmssOf(left) });
      if (left !== null && left > 300) return ZG.story({ ...base, state: "waiting", time: dayTimeIst(S.info.startMs) });
    }
    return ZG.story({ ...base, state: "running" });
  }
  const storyHtml = (st) => `<div class="zc-story" id="storyline" data-state="${st.state}"><b>${esc(st.say)}</b> <span>${esc(st.doNow)}</span></div>`;
  /** The vital details during the game and after it: from the game log the Worker keeps (tickets by number only). */
  function vitalsHtml() {
    const g = S.glog; if (!g || S.draft) return "";
    const log = calledSoFar(), when = (ms) => (ms ? hmIst(ms) : "-");
    const people = `${g.people.joined} joined` + (g.people.waiting ? `, ${g.people.waiting} waiting for your OK` : ", none waiting") + (g.people.present != null ? `, ${g.people.present} checked in as present` : "");
    const luckyRows = (g.lucky || []).map((l) => `<div class="zc-rowl"><span><b>Lucky draw: ${esc(l.title)}</b></span><span>${l.drawn ? "Drawn · Ticket number" + (l.tickets.length === 1 ? " " : "s ") + l.tickets.join(", ") : "Not drawn yet · " + l.winners + " picked at random"}</span></div>`).join("");
    const prizes = g.prizes.length || luckyRows ? g.prizes.map((p) => `<div class="zc-rowl"><span><b>${esc(p.prize)}</b>${p.text ? " · " + esc(p.text) : ""}</span><span>Ticket number ${p.ticket} · ${esc(when(p.atMs))}</span></div>`).join("") + luckyRows : '<span class="zc-small zc-nomargin">None yet.</span>';
    const pauses = g.pauses.length ? g.pauses.map((p) => `Paused by ${p.by.replace(/^The /, "the ").replace(/^A /, "a ")} at ${esc(when(p.fromMs))}${p.toMs ? " until " + esc(when(p.toMs)) : ""}`).join("; ") : "Not paused so far.";
    const warn = g.warnings.length ? g.warnings.map((w) => `<div class="zc-warnline">${esc(w)}</div>`).join("") : '<span class="zc-small zc-nomargin">Nothing to worry about.</span>';
    return `<details class="zc-block zc-vitals" id="vitals" open><summary><b>Game details</b></summary>
      <div class="zc-rowl"><span>Status</span><span id="v-status">${esc(consoleStory().say)}</span></div>
      <div class="zc-rowl"><span>People</span><span id="v-people">${esc(people)}</span></div>
      ${S.pres && S.pres.listening != null ? `<div class="zc-rowl"><span>Phones listening</span><span id="v-listen">About ${S.pres.listening} (pages in front, last minute)</span></div>` : ""}
      <div class="zc-rowl"><span>Pauses</span><span id="v-pauses">${pauses}</span></div>
      <h4 class="zc-h4">Prizes won so far</h4><div id="v-prizes">${prizes}</div>
      <h4 class="zc-h4">Warnings</h4><div id="v-warn">${warn}</div></details>`;
  }
  function gameLogBlock() {
    if (S.draft || !S.info || !eid) return "";
    const done = gameEnded() || (S.glog && S.glog.saved);
    if (!done) return "";
    const href = location.origin + "/gamelog.html?e=" + encodeURIComponent(eid), key = "#k=" + encodeURIComponent(secret);
    return `<div class="zc-block" id="gamelogbox"><h3>Game log</h3>${small("The vital details of this game in plain words: start and end time, how it ended, how many people joined, every prize with its ticket number and time, the pauses, the changes to the settings, the report e-mail and every number called with its time. It has ticket numbers only: no names and no mobile numbers. It is kept for 365 days.")}
      <div class="zc-chips"><a class="zc-btn zc-btn-big" id="gamelogopen" href="${esc(href + key)}" target="_blank" rel="noopener">Open the game log (print or save as PDF)</a><a class="zc-btn zc-btn-big zc-btn-alt" id="gamelogtxt" href="${esc(href + "&txt=1" + key)}" target="_blank" rel="noopener">Download as a text file</a></div></div>`;
  }
  /** Seconds to the next number from the game's own schedule (never a local guess); null when nothing is due (paused, not running, a Host who has not pressed, finished). */
  function nextSecs(hostLine) {
    if (!S.info || !S.cfg || !S.st && S.cf || S.now === null || S.control && (S.control.pausedNow || S.control.stopped) || manualMode() && goRound() === null) return null;
    const log = calledSoFar(); if (!S.started || log.length >= 90 || allPrizesWon()) return null;
    if (hostLine) return 0; // a Host presses for each number: there is no time to count down to
    const r = ZG.callRoundR(S.st || null, S.info.startRound + ZG.GRACE_ROUNDS, S.info.callSeconds / 3, S.cfg.breaks, S.round || 1, log.length);
    if (r === null || !Number.isFinite(r)) return null;
    return (r - S.now) * 3 - (Date.now() - (S.nowAt || Date.now())) / 1000;
  }
  const quietText = () => { const host = (S.cfg || {}).callMode === "host", sec = nextSecs(host); return sec === null ? "" : host ? "The host calls the numbers" : sec > 0 ? "Next number in " + Math.ceil(sec) + "s" : "Next number any moment"; };
  setInterval(() => { const el = document.getElementById("quietc"); if (!el) return; const t = quietText(); if (t) el.firstChild.textContent = t; }, 1000);
  /** At the TOP of the game screen, always: the one-sentence story, the Number board button, the counter (the latest number big, the last few beside it), a big PAUSED banner (who, since when, until when, with Resume), and how the game ended. */
  function liveBar() {
    if (!S.info || !eid) return "";
    const st = consoleStory();
    if (S.draft) return `<div class="zc-block zc-livebar" id="livebar">${storyHtml(st)}</div>`;
    const board = `<a class="zc-btn zc-btn-big zc-boardbtn" id="boardbtn" href="${esc(location.origin + "/board.html?e=" + encodeURIComponent(eid) + "#k=" + encodeURIComponent(secret))}" target="_blank" rel="noopener">Number board</a>`;
    if (!S.started) return `<div class="zc-block zc-livebar" id="livebar">${storyHtml(st)}<div class="zc-boardrow">${board}<span class="zc-small zc-nomargin">The board with every number called, like the real game. Only you and the Hosts can open it.</span></div></div>`;
    const log = calledSoFar(), last = log.length ? log[log.length - 1] : null, total = 90;
    const few = log.slice(-6, -1).reverse().map((n) => `<span class="zc-ball">${n}</span>`).join("");
    const strip = log.length ? log.map((n, i) => `<span class="zc-ball${i === log.length - 1 ? " last" : ""}">${n}</span>`).join("") : `<span class="zc-small zc-nomargin">No number has been called yet.</span>`;
    let pause = "";
    const pz = S.st && S.now !== null ? S.st.intervals.find((i) => S.now >= i.start && S.now < i.end) : null;
    if (pz && !(S.control && S.control.stopped)) {
      const pm = S.cf ? (S.cf.messages || []).find((m) => m.action === "pause" && m.atBeaconRound === pz.start) : null, who = pm && S.cf.by && S.cf.by[pm.seq - 1] === "Host" ? "a Host" : "the Organizer";
      const mins = Math.max(1, Math.round((pz.end - S.now) * 3 / 60));
      pause = `<div class="zc-pausebanner" id="pausebanner" role="status"><b>PAUSED</b><span>Paused by ${who} at ${esc(hmIst(ZG.roundTimeMs(pz.start)))} India time. The numbers start again at about ${esc(hmIst(ZG.roundTimeMs(pz.end)))} (in about ${mins} ${mins === 1 ? "minute" : "minutes"}), or sooner when you press Resume.</span><button type="button" class="zc-btn zc-btn-big" data-ctl="resume"${S.ctlBusy ? " disabled" : ""}>Resume the game</button></div>`;
    }
    return `<div class="zc-block zc-livebar" id="livebar">${storyHtml(st)}${pause}<div class="zc-boardrow">${board}<div class="zc-counter" id="numcount"><span class="zc-small zc-nomargin">${esc(ZG.calledLine(log.length, total))}</span><span class="zc-latest" id="latestnum" aria-label="${last ? "Latest number " + last : "No number yet"}">${last ?? "–"}</span>${few ? `<span class="zc-fewlbl">Last 5 numbers called</span>${few}` : ""}${quietText() ? `<span class="zc-quiet" id="quietc" role="timer"><span>${quietText()}</span></span>` : ""}</div></div><div class="zc-numstrip" id="numstrip" aria-label="Numbers called so far">${strip}</div>${vitalsHtml()}${gameLogBlock()}</div>`;
  }
  function mainHtml() {
    const r = role();
    return `<div id="zc-top"></div>${liveBar()}${alertZone()}<div class="zc-small zc-rolenote">${esc(ROLE_NOTE[r])}</div>${nextHtml()}${steps().map(secHtml).join("")}${helpHtml()}${acctHtml()}`;
  }
  function tabsHtml() {
    const n = nextStep();
    return `<nav class="zc-tabs" aria-label="Steps">${[["sheet", "Steps"], [n ? "next" : "top", "Next"], ["help", "Help"], ["top", "Top"]].map(([a, l]) => a === "next" ? `<button type="button" class="zc-tab" data-open="${n[0]}">${l}</button>` : a === "sheet" ? `<button type="button" class="zc-tab${S.sheet ? " on" : ""}" data-act="sheet" aria-pressed="${S.sheet}">${l}</button>` : `<button type="button" class="zc-tab" data-act="${a}">${l}</button>`).join("")}</nav>`;
  }
  function frame(inner, withNav) {
    return `<div class="zc-frame">${barHtml()}${withNav ? payNote() : ""}${aiStrip()}${withNav ? progHtml() : ""}${withNav && S.sheet ? `<div class="zc-sheet" id="zc-sheet"><div class="zc-split"><div class="zc-small zc-nomargin">Your game at a glance</div><button type="button" class="zc-mini" data-act="sheet">Close</button></div>${synHtml()}</div>` : ""}${inner}${withNav ? tabsHtml() : ""}</div>`;
  }
  function engView() {
    const r = role();
    const side = `<aside class="zc-side"><div class="zc-me"><span class="zc-num zc-num-dark">${esc(ROLE_LABEL[r].charAt(0))}</span><span><span class="zc-muted">Signed in as</span><br><b>${esc(rolePill().replace(/^Signed in as /, ""))}</b></span></div><div class="zc-small zc-nomargin">Your game at a glance</div>${synHtml()}<div class="zc-small">Payment: <b>${payState().paid ? (isFree10() ? "Rs 0" : "Paid") : payState().confirming ? "Confirming..." : "Pending"}</b></div></aside>`;
    return frame(`<div class="zc-body">${side}<div class="zc-main">${mainHtml()}</div></div>`, true);
  }
  const roleAcceptView = () => frame(`<div class="zc-body"><div class="zc-main"><div class="zc-block" id="roleaccept"><h3>Before you start</h3>${small("Tick the box to take the Co-host role. You can then invite people and pay.")}${CBConsent.html("K5")}${S.roleErr ? `<p class="zc-small zc-warnt" role="alert">${esc(S.roleErr)}</p>` : ""}<div class="zc-foot"><button class="zc-btn" type="button" id="roleacceptgo" data-needs="K5" disabled aria-disabled="true">Accept the Co-host role</button></div></div></div></div>`, false);
  /** The Co-host knows less: when the game starts, whether it is paid, and how it ended. The words are the same ones everybody reads. */
  function cohostStory() {
    const c = S.coh || {}, base = { role: "cohost" };
    if (c.cancelled) return ZG.story({ ...base, state: "cancelled" });
    if (c.didNotStart) return ZG.story({ ...base, state: "neverStarted" });
    if (c.ended) { const why = String(c.ended.reason || ""); return ZG.story({ ...base, state: /^All prizes/.test(why) ? "endedPrizes" : /ended by the organizer/.test(why) ? "endedByOrganizer" : "endedAll", called: c.ended.numbers ?? undefined }); }
    if (c.price != null) return ZG.story({ ...base, state: "unpaid" });
    if (c.startMs && c.startMs > Date.now()) return ZG.story({ ...base, state: "waiting", time: ZG.dayTimeIst(c.startMs) });
    return ZG.story({ ...base, state: "running" });
  }
  function cohostView() {
    if (S.coh && S.coh.roleAccepted === false) return roleAcceptView();
    const side = `<aside class="zc-side"><div class="zc-me"><span class="zc-num zc-num-dark">C</span><span><span class="zc-muted">You are</span><br><b>Co-host</b></span></div><div class="zc-small zc-nomargin">Your game at a glance</div>${synHtml()}</aside>`;
    return frame(`<div class="zc-body">${side}<div class="zc-main"><div id="zc-top"></div>${eid ? `<div class="zc-block zc-livebar" id="livebar">${storyHtml(cohostStory())}<div class="zc-boardrow"><a class="zc-btn zc-btn-big zc-boardbtn" id="boardbtn" href="${esc(location.origin + "/board.html?e=" + encodeURIComponent(eid) + "#k=" + encodeURIComponent(secret))}" target="_blank" rel="noopener">Number board</a><span class="zc-small zc-nomargin">The board with every number called, like the real game.</span></div></div>` : ""}${S.note ? `<div class="zc-toast" role="status">${esc(S.note)}</div>` : ""}${S.cohErr && !S.coh ? `<div class="zc-toast" role="status">${esc(S.cohErr)}</div>` : ""}<div class="zc-small zc-rolenote">${esc(ROLE_NOTE.cohost)}</div>${S.coh && S.coh.waitingFor && !didNotStart() ? `<div class="zc-toast" role="status" id="cohwaiting">Waiting for the Organizer or Host to start the game.</div>` : ""}${S.coh && didNotStart() ? `<div class="zc-alert" id="didnotstart" role="status"><h3>This game did not start.</h3><p>Guest details have been erased.</p></div>` : ""}${nextHtml()}${steps().map(secHtml).join("")}${helpHtml()}</div></div>`, true);
  }
  const loadingView = () => frame(`<div class="zc-body"><div class="zc-main"><div class="zc-toast" role="status">${esc(S.note || "Loading…")}</div>${eid && isOrg() ? "" : ""}</div></div>`, false);

  /** "Your games": every game of this person (Organizer: the games they made; Host: the games they help with), always on the screen, newest first. */
  const gameRow = (e) => `<div class="zc-rowl"><span><b>${esc(e.name || "Your game")}</b> · ${esc(e.startsAtIST || fmtDay(e.created_ms))} · ${e.participants} ${e.participants === 1 ? "person" : "people"} · ${e.deletable ? "draft" : e.draft ? "published, payment pending" : "published"} <span class="zc-muted">(code ${esc(e.id)})</span></span><span><button type="button" class="zc-mini" data-open-game="${esc(e.id)}">Open</button> <button type="button" class="zc-mini" data-clonebtn="1" data-from="${esc(e.id)}" data-people="${e.participants > 0 && !e.erased ? 1 : 0}">Create a new game like this one</button>${e.deletable ? ` <button type="button" class="zc-mini zc-btn-bad" data-del-draft="${esc(e.id)}">${S.delArm === e.id ? "Tap again to delete" : "Delete"}</button>` : ""}</span></div>`;
  const gamesBlock = (h, who) => { const gs = (h && h.engagements) || []; return `<div class="zc-block" id="yourgames"><h3>Your games${gs.length ? ` (${gs.length})` : ""}</h3>${gs.length ? small(who === "host" ? "The games you help to run as a Host. Pick one to open it." : "Every game you made. Open any of them, or start a new one.") + gs.map(gameRow).join("") : !h ? small(S.histErr ? "We could not load your games just now. We will try again in a few seconds." : "Loading your games...") : small(who === "host" ? "No game is open to you yet." : "You have no game yet. Start your first one below.")}</div>`; };
  /** A Host who also wants to run their own games: same e-mail, Organizer account, the Terms box, and then they hold both roles. */
  const hostNewBlock = () => { const a = altRole(); return `<div class="zc-block" id="hostnew"><h3>Start a new game as an Organizer</h3>${small("You help to run games as a Host. You can also make your own games as an Organizer, with the same e-mail. Your own games are separate from the games you host.")}${a && a.kind === "organizer" ? `<div class="zc-foot"><button type="button" class="zc-btn zc-btn-s" id="hostswitchorg">Open my Organizer view</button></div>` : `${CBConsent.html("K2")}${S.becomeErr ? `<p class="zc-small zc-warnt" role="alert">${esc(S.becomeErr)}</p>` : ""}<div class="zc-foot"><button type="button" class="zc-btn zc-btn-s" id="hostbecome">Create my Organizer account and start a new game</button></div>`}</div>`; };
  const waitLinkView = () => { if (role() === "host" && S.history && S.history.engagements) return frame(`<div class="zc-body"><div class="zc-main">${gamesBlock(S.history, "host")}${hostNewBlock()}</div></div>`, false); return waitLinkView0(); };
  const waitLinkView0 = () => frame(`<div class="zc-body"><div class="zc-main"><div class="zc-block"><p style="margin:0">Open the link your ${role() === "cohost" ? "Organizer or Host" : "Organizer"} sent you. It opens the game directly.</p></div>${S.note ? `<div class="zc-toast" role="status">${esc(S.note)}</div>` : ""}</div></div>`, false);
  const partnerView = () => frame(`<div class="zc-body"><div class="zc-main"><div class="zc-block"><h3>Your partner area</h3><p>Your partner screens are on their own page.</p><a class="zc-btn zc-btn-s" href="/partner.html">Open my partner area</a></div></div></div>`, false);
  function loginView(msg) {
    return `<div class="zc-frame zc-login"><header class="zc-bar"><span class="zc-brand"><img src="/icon-192.png" alt="" width="22" height="22"> <b>Corporate Tambola</b></span></header><div class="zc-main">
      <div class="zc-eyebrow">Organizer console</div>
      <h2>${NEWDEMO ? "Start your demo game" : NEWGAME ? "Create a new game as an organizer" : "Sign in to your console"}</h2>
      <p class="zc-lead">${NEWDEMO ? "A demo game is a real game for 10 people at Rs 0. " : ""}Type your e-mail and press Continue. There is no password. New here? Your account is made at once. Coming back? We e-mail you two ways to get in, and you use <b>one</b> of them.</p>
            ${msg ? `<div class="zc-toast" role="status">${esc(msg)}</div>` : ""}
      <label class="zc-lbl" for="lem">Your e-mail</label><input id="lem" class="zc-in" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="your e-mail"><div id="lerr" class="zc-toast zc-badt" role="alert" style="display:none"></div>
      <div class="zc-foot"><button class="zc-btn" id="goLogin" type="button">Continue</button></div>
      <p class="zc-small zc-muted zc-lead2">Nothing to remember. Participants never sign in; they join with your game link.</p>

    </div></div>`;
  }
  // ---------- home (no game open yet) ----------
  function homeView() {
    const h = S.history, last = h && h.engagements[0];
    const bar = last ? `<div class="zc-lastbar"><span>${last.deletable ? "Your newest draft was started on" : "Your last game was on"} <b>${fmtDay(last.created_ms)}</b> · ${last.participants} participants</span><span>${last.participants > 0 && !last.deletable ? `<button type="button" class="zc-mini" data-clonebtn="1" data-from="${esc(last.id)}" data-people="1">Reuse the data</button> ` : ""}<button type="button" class="zc-mini" data-hist="1">History</button></span></div>` : "";
    const main0 = clonePanel();
    const hist = S.showHist && h ? `<div class="zc-block"><h3>History · kept ${h.retentionDays} days</h3>${h.engagements.map((e) => `<div class="zc-rowl"><span>${esc(e.name || "Your game")} (code ${esc(e.id)}) · ${fmtDay(e.created_ms)} · ${e.participants} people${e.deletable ? " · draft" : e.draft ? " · published, payment pending" : ""}</span><span><button type="button" class="zc-mini" data-open-game="${esc(e.id)}">Open</button> <button type="button" class="zc-mini" data-clonebtn="1" data-from="${esc(e.id)}" data-people="${e.participants > 0 && !e.erased ? 1 : 0}">Create a new game like this one</button></span></div>`).join("")}</div>` : "";
    const main = `${S.note ? `<div class="zc-toast" role="status">${esc(S.note)}</div>` : ""}${S.passMsg ? `<div class="zc-toast" role="status" id="passmsg">${esc(S.passMsg)}</div>` : ""}${main0}<div class="zc-small zc-rolenote">${esc(ROLE_NOTE.organizer)}</div>
      ${gamesBlock(h, "organizer")}<div class="zc-block"><h3>Create a new game</h3>${small("You build it first, at no cost. Publishing is free. You pay before the game starts, unless it is a free game of 10 people or fewer. The first number is called two minutes after the start time.")}<div class="zc-chips"><button type="button" class="zc-btn zc-btn-s" id="mk"${S.creating ? ' disabled aria-disabled="true"' : ""}>${S.creating ? "Creating..." : "Create a new game"}</button></div>${small("In step 2 choose how many people. Up to 10 people is a free demo game: a real game at Rs 0, nothing to pay.")}</div>${bar}${hist}${acctHtml()}`;
    return frame(`<div class="zc-body"><div class="zc-main">${main}</div></div>`, false);
  }
  // ---------- Quick setup: the first three steps as one form, with a real date and time picker (the AI route and the browser-AI route use it) ----------
  function quickDefault() {
    const t = new Date(istNow().getTime() + 86400000);
    const f = { occ: "Other", oname: "", day: "other", dayo: istDateStr(t), time: "other", timeo: "16:00", cap: "250", tix: "1", spd: "12", rnd: "1", join: "list", mode: "auto", start: "auto", after: "keep", ver: "mobile", emp: false, inv: false, per: "4", cats: ["family", "colleagues"], bundle: "Classic", hs: {}, ph: "" };
    for (const [k] of HS) f.hs[k] = { on: false, n: 1, pt: "later", pd: "", orig: [] };
    applyBundleTo(f, "Classic");
    return f;
  }
  function applyBundleTo(f, b) { const set = BUNDLES[b]; if (!set) return; for (const [k] of HS) { const h = f.hs[k]; h.on = !!set[k]; if (set[k]) h.n = set[k]; } f.ph = (HS.find(([k]) => f.hs[k].on) || ["full"])[0]; }
  function quickView() {
    const f = S.f;
    const caps = capOptions().map((p) => `<button type="button" class="zc-chip${String(f.cap) === String(p.n) ? " on" : ""}" data-ck="cap" data-v="${p.n}" aria-pressed="${String(f.cap) === String(p.n)}"><span>Up to ${p.n} people</span></button>`).join("");
    const houses = HS.filter(([k]) => k !== "full2").map(([k, n, how, mx]) => `<div class="zc-box"><label class="zc-check" for="qk-h-${k}"><input type="checkbox" id="qk-h-${k}" data-hc="${k}" ${f.hs[k].on ? "checked" : ""}> ${n}</label><p class="zc-small zc-how">${esc(how || "")}</p>${mx > 1 ? grp(`hs.${k}.n`, "Winners", [1, 2, 3, 4, 5, 10, 20].filter((x) => x <= mx).map((x) => [String(x), String(x)])) : ""}${lbl("qk-t-" + k, "What is the prize? (up to 80 characters; you can fill this in later)")}<input id="qk-t-${k}" class="zc-in" data-qkprize="${k}" maxlength="80" value="${esc(f.hs[k].pt === "later" ? "" : prizeText(f.hs[k].pt, f.hs[k].pd))}"></div>`).join("");
    const main = `<div class="zc-block"><h3>1. Which game?</h3>${lbl("qk-name", "Name of the game (optional)")}<input id="qk-name" class="zc-in" data-fi="oname" maxlength="60" placeholder="Diwali party" value="${esc(f.oname)}">
        ${grp("occ", "Occasion", OCC.map((o) => [o, o]))}${lbl("qk-date", "Day (India time)")}<input id="qk-date" class="zc-in" type="date" data-fi="dayo" value="${esc(f.dayo)}" min="${istDateStr(istNow())}">${lbl("qk-time", "Start time (India time)")}<input id="qk-time" class="zc-in" type="time" data-fi="timeo" step="300" value="${esc(f.timeo)}">
        ${small("Guests can join before. The first number is called 2 minutes after the start time. Choose a time at least 2 hours ahead.")}</div>
      <div class="zc-block"><h3>2. How will it play?</h3><span class="zc-lbl" id="gl-cap">How many people at most? (people invited by your guests count too)</span><div role="group" aria-labelledby="gl-cap">${caps}</div>${modeQuestions(f)}${f.mode === "host" ? small("A Host presses a button for each number, so there is no fixed gap.") : grp("spd", "Duration (gap) between two numbers", spdOpts(f.spd))}${grp("tix", "Tickets for each person (participant)", [["1", "1 ticket"], ["2", "2 tickets (more chances)"]])}${grp("rnd", "How many full games in this event? (rounds)", [1, 2, 3, 4, 5].map((n) => [String(n), String(n)]))}${small("Most events play 1 game. Choose 2 or more to play the full game again straight after, with new tickets and new numbers. This is not the same as the 1 or 2 tickets each person holds.")}${f.emp ? "" : grp("join", "Who can join?", [["list", "Only people on a list"], ["anyone", "Anyone with the link"]])}<div class="zc-chips zc-gap">${bchip("emp", "Only my employees (nobody can invite anyone)")}</div>${grp("ver", "What must a person give to get in?", [["mobile", "Mobile number"], ["id", "Employee ID"], ["either", "Mobile number or employee ID"], ["both", "Mobile number and employee ID"]])}${f.emp ? "" : `<div class="zc-chips zc-gap">${bchip("inv", "Let each guest invite up to 4 family or colleagues")}</div>`}</div>
      <div class="zc-block"><h3>3. Prizes</h3>${grp("bundle", "Start from", ["Classic", "Simple", "Rich"].map((b) => [b, b]))}${houses}${small("You give the prizes; we only provide the software. Videos, messages and a lucky draw are added on the next page.")}</div>
      <div class="zc-block"><h3>4. Check and save</h3><div id="qk-summary" class="zc-small" aria-live="polite"></div><div id="qk-err" class="zc-toast zc-badt" role="alert" style="display:none"></div><div class="zc-foot"><button class="zc-btn" id="qk-save" type="button">Yes, save my draft</button></div>${small("Nothing is charged. Nobody else can see a draft. Next you publish it (free) and pay before the start time.")}</div>`;
    return frame(`<div class="zc-body"><div class="zc-main">${main}</div></div>`, false);
  }
  function quickRead() {
    const f = S.f, [y, mo, d] = (f.dayo || "").split("-").map(Number), [h, mi] = (f.timeo || "16:00").split(":").map(Number);
    const startMs = Date.UTC(y, mo - 1, d, h, mi) - 5.5 * 3600000, rewards = [];
    for (const [k] of HS) { const hh = f.hs[k]; if (k === "full2" || !hh.on) continue; const t = prizeText(hh.pt, hh.pd).slice(0, 80); for (let o = 1; o <= winnersOf(hh, k); o++) rewards.push({ pattern: k, ordinal: o, text: t }); }
    const name = (f.oname || "").trim() || (f.occ !== "Other" ? f.occ : "");
    return { name, occ: f.occ === "Other" ? "EVENT" : f.occ.toUpperCase().replace(/[^A-Z0-9]+/g, "-"), startMs, cap: Number(f.cap), ...(Number(f.cap) > 0 && Number(f.cap) <= DEMO_CAP ? { demo: true } : {}), /* "Up to 10 people" is the free demo game: it must be made as one, or it would ask for payment at the start time */ tickets: Number(f.tix) || 1, speed: Number(f.spd), rounds: Number(f.rnd), who: f.emp ? "list" : f.join === "anyone" ? "anyone" : "list", invite: !f.emp && !!f.inv, callMode: f.mode === "host" ? "host" : "auto", startMode: f.start === "manual" ? "manual" : "auto", afterPrizes: f.after === "end" ? "end" : "keep", verify: ["id", "either", "both"].includes(f.ver) ? f.ver : "mobile", employeesOnly: !!f.emp, rewards };
  }

  // ---------- Phase 4: "Continue with Google" and the Host's Finish setup (docs/ROLES_AND_CONSOLE_SPEC_4.md, C) ----------
  async function loadAuthConfig() { return; /* e-mail is the only way in */ try { const r = await fetch(BASE + "/api/auth/config").then((x) => (x.ok ? x.json() : null)); S.gcid = (r && (r.google || r.clientId)) || ""; } catch { S.gcid = ""; } if (S.gcid) redraw(); }
  /** Draws Google's own button into #gbtn. The Google script is loaded only on a screen that shows the button. */
  function mountGoogle(intent) {
    const holder = document.getElementById("gbtn"); if (!holder || !S.gcid || holder.dataset.done === S.gcid + intent) return;
    holder.dataset.done = S.gcid + intent;
    const draw2 = () => { try { window.google.accounts.id.initialize({ client_id: S.gcid, callback: (resp) => googleDone(resp, intent) }); window.google.accounts.id.renderButton(holder, { theme: "outline", size: "large", text: "continue_with", shape: "rectangular" }); } catch { holder.innerHTML = `<p class="zc-small">Open this page in your browser, or use an e-mail code.</p>`; } };
    if (window.google && window.google.accounts) return draw2();
    const sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = draw2; sc.onerror = () => { holder.innerHTML = `<p class="zc-small">Open this page in your browser, or use an e-mail code.</p>`; };
    document.head.appendChild(sc);
  }
  async function googleDone(resp, intent) {
    try {
      let consent = null; // a Host accepting the role ticks the K5 box first
      if (intent === "host") { if (!CBConsent.all($app, "K5")) { S.setupMsg = "Please tick the box to continue."; return redraw(); } consent = CBConsent.payload($app, "K5"); }
      const r = await call("POST", "/api/auth/google", { credential: resp && resp.credential, intent, ...(intent === "host" ? { hostKey: secret, consent } : {}) });
      const k = r.token || r.key || r.organizerKey || r.hostKey; if (k) { secret = k; ss.set("ctz-org", k); }
      S.loginMsg = ""; S.setupMsg = ""; S.setup = null; bootstrap();
    } catch (e) { S.loginMsg = e.message; S.setupMsg = e.message; redraw(); }
  }
  const googleBlock = () => ""; // one way in: the e-mail (Option 1 code, Option 2 tap). No Google button, no pasted key.
  function setupView() {
    const T = S.setup || {}, m = S.setupMsg;
    const email = T.needEmail ? `<h4>1. Your e-mail</h4>${small(T.emailMasked ? "Use the e-mail your Organizer gave us: " + esc(T.emailMasked) + "." : "Type your e-mail.")}${S.setupSent ? "" : CBConsent.html("K5")}${googleBlock()}
        ${S.setupSent ? `${lbl("setupcode", "The 6-digit code we sent you")}<input id="setupcode" class="zc-in" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456" value="${esc((S.sv || {}).setupcode || "")}"><div class="zc-foot"><button type="button" class="zc-btn zc-btn-s" id="setupverify">Check the code</button></div>`
          : `${lbl("setupemail", "Your e-mail")}<input id="setupemail" class="zc-in" type="email" autocomplete="email" placeholder="your e-mail" value="${esc((S.sv || {}).setupemail || "")}"><div class="zc-foot"><button type="button" class="zc-btn zc-btn-s" id="setupsend" data-needs="K5" disabled aria-disabled="true">Send me a code</button></div>`}`
      : `<p class="zc-small">Your e-mail is checked${T.emailMasked ? ": " + esc(T.emailMasked) : ""}.</p>`;
    const mobile = T.needMobile ? `<h4>${T.needEmail ? "2" : "1"}. Your mobile number</h4>${small("Typed once. We do not send a code to it.")}${lbl("setupmobile", "Your mobile number")}<input id="setupmobile" class="zc-in" inputmode="tel" autocomplete="tel" placeholder="98765 43210" value="${esc((S.sv || {}).setupmobile || "")}"><div class="zc-foot"><button type="button" class="zc-btn zc-btn-s" id="setupmobilego">Save my number</button></div>` : "";
    return `<div class="zc-frame zc-login"><header class="zc-bar"><span class="zc-brand"><img src="/icon-192.png" alt="" width="22" height="22"> <b>Corporate Tambola</b></span><span class="zc-pill zc-pill-role">Host</span></header><div class="zc-main"><div class="zc-block" id="finishsetup"><h3>Finish setup</h3>${small("Two quick things, then your game opens. This link works once.")}${m ? `<div class="zc-toast" role="status">${esc(m)}</div>` : ""}${email}${mobile}</div></div></div>`;
  }
  async function setupStep(path, body, okSent) {
    try { const r = await call("POST", path, body); if (r && r.token) { secret = r.token; ss.set("ctz-org", secret); } /* the e-mail is confirmed: this device gets its own key */ S.setupMsg = ""; if (okSent) S.setupSent = true; if (path.indexOf("/email/verify") > 0) delete (S.sv || {}).setupcode; S.setup = await call("GET", "/api/host/setup"); if (S.setup && S.setup.ready !== false) { S.setup = null; S.setupSent = false; return bootstrap(); } }
    catch (e) { S.setupMsg = friendly(e); }
    redraw();
  }
  // ---------- what the console loads ----------
  async function namesFor(ids) {
    if (S.shield) return; // AI helper mode: names are never fetched
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
  S.pp = { list: null, err: "", limit: 0, common: "", me: null, waiting: null, approved: [], decided: [], confirm: "", sent: {}, sentFor: "", sum: "", wrong: [] };
  S.shield = ss.get("ctz-shield") === "1"; S.acctOpen = null; S.mkrole = "organizer"; S.screen = "";
  const GROUPS = { 1: ["occ", "oname", "day", "dayo", "time", "timeo"], 2: ["cap", "tix", "spd", "rnd", "who", "inv", "per", "cats", "demo", "mode", "start", "after"], 3: ["hs", "ph", "bundle"], 4: ["opN", "op", "midN", "mid", "clN", "cl", "lucky", "brand"] };
  /** Brings the form in line with what the server holds, step by step, but never over a step the person has started changing (an AI may be changing the draft at the same time). */
  const snapGroup = (n) => { S.fSnap = S.fSnap || {}; for (const k of GROUPS[n]) S.fSnap[k] = JSON.stringify(S.f[k]); }; const unsavedSteps = () => { try { if (!S.f || !S.fSnap || S.fFor !== eid) return []; return [1, 2, 3, 4].filter((n) => GROUPS[n].filter((k) => k !== "demo").some((k) => S.fSnap[k] !== undefined && JSON.stringify(S.f[k]) !== S.fSnap[k])); } catch { return []; } }; function syncForm() {
    const fresh = formFromServer();
    if (!S.f || S.fFor !== eid) { S.f = fresh; S.fBase = JSON.parse(JSON.stringify(fresh)); S.fFor = eid; S.touched = {}; S.unsaved = {}; return; }
    for (const n of [1, 2, 3, 4]) { if (GROUPS[n].every((k) => JSON.stringify(S.f[k]) === JSON.stringify(S.fBase[k]))) { GROUPS[n].forEach((k) => (S.f[k] = fresh[k])); snapGroup(n); } }
    S.fBase = JSON.parse(JSON.stringify(fresh));
  }
  async function loadPacks() { try { S.packs = (await fetch(BASE + "/api/z/ai-manifest").then((r) => r.json())).packs || []; } catch { S.packs = []; } }

  async function redeemPass() { // a demo pass link was opened in this browser and the person is now signed in as an organizer: it gives ONE free game, once
    let v = null; try { v = JSON.parse(ls.get("ctz-pass") || "null"); } catch { v = null; }
    if (!v || !v.t) return; if (Date.now() - (Number(v.at) || 0) > 14 * 86400000) { ls.set("ctz-pass", ""); return; }
    if (!isOrg() || !secret) return;
    ls.set("ctz-pass", ""); // used or refused, it is not tried again
    try { const r = await call("POST", "/api/pass", { token: v.t }); S.passMsg = r.again ? "This demo link is already yours: press Create a new game." : `Your free demo is ready: one game of up to ${r.cap} people at Rs 0. In step 2 choose "Up to ${r.cap} people".`; }
    catch (e) { S.passMsg = e && e.message ? e.message : "This demo link could not be used. Please ask us for a new one."; }
  }
  async function refreshHome() {
    S.screen = "home";
    try { S.keys = (await call("GET", "/api/org/keys")).keys; } catch { S.keys = []; }
    try { S.sugs = (await call("GET", "/api/z/suggestions")).suggestions.slice(0, 6); } catch { S.sugs = []; }
    await loadCredits();
    try { S.history = await call("GET", "/api/history"); S.histErr = false; if (S.history && S.history.engagements && S.history.engagements.length) { try { sessionStorage.setItem("ctz-qauto", "1"); } catch { /* none */ } } /* this tab has seen games: "no games" later means they were deleted, not a new organizer */ } catch (e) { S.histErr = true; if (e.status === 403) { secret = ""; S.loginMsg = "That sign-in key or link was not accepted. A link you were sent may have expired, been replaced, or the game may have been cancelled: please ask the Organizer."; } }
    if (isOrg()) await redeemPass(); // a demo pass link opened in this browser is used now (before a first game is made for a new person)
    if (isOrg() && !QUICK && !NEWDEMO && !NEWGAME && !eid && S.history && S.history.engagements && S.history.engagements.length === 0) { let done = false; try { done = sessionStorage.getItem("ctz-qauto") === "1"; sessionStorage.setItem("ctz-qauto", "1"); } catch { done = true; } if (!done) { try { await startNew(); return; } catch (e) { S.note = friendly(e); } } } // no game yet: the first game is made by itself (once) and the console opens
    redraw();
  }
  async function loadAccount() { try { S.keys = (await call("GET", "/api/org/keys")).keys; } catch { S.keys = []; } await loadCredits(); redraw(); }
  async function refreshTeam() {
    if (!canRun() || !secret) return;
    try { S.team = await call("GET", "/api/org/team" + (eid ? "?e=" + encodeURIComponent(eid) : "")); S.teamErr = ""; } catch (e) { S.team = null; S.teamErr = e.status === 404 || e.status === 405 ? "The team list is not switched on yet. You can add people as soon as it is." : friendly(e); }
    S.hostN = 0;
    if (S.team && role() === "host") { try { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("key|" + secret)); const id = Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("").slice(0, 10); S.hostN = ((S.team.hosts || []).findIndex((h) => h.id === id) + 1) || 0; } catch { /* the label stays plain */ } }
    redraw();
  }
  function initOpen() {
    if (S.openInit === eid) return; S.openInit = eid; loadDone();
    const nx = nextStep();
    if (S.cloneNew === eid && S.cloneDated !== eid && canRun()) { S.open = 1; return; } // a game made like another opens on the date and time
    S.open = ACTSTEP[ACT] && canRun() ? ACTSTEP[ACT] : role() !== "cohost" && S.started && !S.draft && !S.unpaid ? 9 : role() !== "cohost" && !S.draft && !payState().paid ? 8 : nx ? nx[0] : 1;
    if (!ACT && LAST && LAST.eid === eid && LAST.role === role() && Number.isInteger(LAST.open) && LAST.open >= 1 && LAST.open <= 10 && !S.restoredStep) { S.restoredStep = true; S.open = LAST.open; } // the step they had open
  }
  async function refreshCohost() {
    try { S.coh = await call("GET", `/api/z/${eid}/cohost`); S.cohErr = ""; } catch (e) { S.cohErr = e.status === 404 || e.status === 405 ? "Your game page is not switched on yet. Please try again a little later." : friendly(e); }
    initOpen(); if (S.open === 2 && !S.shield) await loadPeople(); redraw();
  }
  async function refreshEng() {
    if (S.stateFor !== eid) { S.stateFor = eid; S.near = null; S.gt = null; S.redo = null; S.cancelDone = false; S.cancel = null; S.move = null; S.creditMsg = ""; S.creditErr = ""; S.payUrl = ""; S.payCopied = false; S.payLinkNote = ""; S.ctlNote = ""; S.annNote = ""; S.nextNote = ""; S.pubOpen = false; S.pubNote = ""; S.waitN = 0; S.gtNote = null; S.gtPh = ""; S.gtUb = ""; S.teamFoot = null; S.cols = ""; if (S.pp.sentFor && S.pp.sentFor !== eid) Object.assign(S.pp, { list: null, err: "", waiting: null, approved: [], decided: [], sum: "", wrong: [], confirm: "", bulk: "", still: "", stale: "", form: null, adding: false, fresh: {} }); } // what belongs to the game that was open before (a cancelled note, a payment link, a message) is cleared once, when another game opens
    if (S.s710For !== eid) { S.s710For = eid; S.sum = null; S.life = null; S.prizes = []; S.started = undefined; S.reportUrl = ""; S.rptNote = ""; S.annDraft = ""; S.ctlBusy = false; S.annBusy = false; S.payBusy = false; } // the old game's summary, life and prizes must never stand in for the new game's
    if (role() === "cohost") return refreshCohost();
    if (role() === "host" && S.setup && S.setup.ready === false) return; // a Host who has not finished the first-open setup (e-mail, mobile) cannot open the game yet: never ask for it, never show "this link no longer opens the game" in the middle of the setup
    S.screen = "eng";
    try {
      S.info = await call("GET", `/api/z/${eid}/info`); if (S.info && S.info.rehearsal && S.info.rehearsal.shownCap) S.info.cap = S.info.rehearsal.shownCap; /* a rehearsal shows the real game's size, never its own limit */ S.deadLink = false; /* this link opens the game: a 403 met earlier no longer holds */ if (S.info.checkin && !S.draft && canRun()) { try { S.presence = await call("GET", `/api/z/${eid}/presence`); } catch { /* shown next time */ } } S.draft = !!S.info.draft; S.unpaid = !!S.info.unpaid; S.locked = !!S.info.locked; S.demo = !!S.info.demo;
      if (ACT === "publish" && S.draft && !S.actOpened) { S.pubOpen = true; S.actOpened = true; } // the AI's hand-over link: the publish card is open and waiting for the organizer's own tap
      let pr = await call("GET", `/api/z/${eid}/participants`); S.people = pr.participants; S.closed = pr.closed; S.whoCanJoin = pr.whoCanJoin || S.whoCanJoin;
      while (S.people.length < pr.total) { const more = await call("GET", `/api/z/${eid}/participants?offset=${S.people.length}`); if (!more.participants.length) break; S.people.push(...more.participants); } // a long list arrives in pages
      S.cfg = { name: pr.name, tickets: pr.tickets, rewards: pr.rewards, breaks: pr.breaks, opening: pr.opening || [], closing: pr.closing || [], rounds: pr.rounds || 1, invites: pr.invites, callMode: S.info.callMode === "host" ? "host" : "auto", startMode: S.info.startMode === "manual" ? "manual" : "auto", keepCalling: S.info.afterPrizes === "keep", demo: pr.demo === true, verify: pr.verify, employeesOnly: pr.employeesOnly === true, ties: pr.ties }; // verify, employeesOnly and ties must come back into the form, or the next Save would send the defaults and wipe them
      try { S.sum = await call("GET", `/api/z/${eid}/summary`); } catch { S.sum = S.sum || null; }
      if (canRun() && Number(S.sum && S.sum.credit) > 0) { try { S.creditInfo = await call("GET", "/api/org/credit"); } catch { S.creditInfo = null; } } else S.creditInfo = null;
      try { S.claims = (await call("GET", `/api/z/${eid}/claims`)).claims; } catch (e) { if (isOrg()) throw e; S.claims = []; }
      try { S.reqs = (await call("GET", `/api/z/${eid}/control/request`)).requests; } catch { S.reqs = []; }
      // an engagement made by the AI has no pause key until the organizer opens it here. A Host's browser adds its own key beside it (also during the game: a Host can join in to press Next number),
      // checked once per visit and again while no key is registered yet
      if (!S.draft && (!S.started || role() === "host" || hostMode() || manualMode()) && (S.keyChecked !== eid || !S.cf)) { S.keyChecked = eid; try { const k = await TBControl.ensureKey(eid, { token: secret, base: BASE, prefix: "/api/z" }); if (!k.ok && !S.ctlNote) S.ctlNote = k.reason ? ctlWords({ message: k.reason }) : ""; } catch { /* the pause is optional; the engagement does not depend on it */ } }
      const cf0 = await fetch(BASE + `/api/z/${eid}/control`).then((r) => (r.ok ? r.json() : null)); const cf = cf0 && cf0.pubKey ? cf0 : null; // a held (unpaid) engagement answers {locked:true} with no signing key: that is not a pause file
      S.control = null; S.cf = cf;
      const now = await latestRound(); S.now = now; S.nowAt = Date.now();
      let st = null;
      if (cf) { st = ZG.resolveControl(ZG.cfgOf(cf, ZG.hostGameOf(S.cfg, S.info.startRound)), cf.messages); S.st = st; S.control = ctlStateOf(st, now); } else S.st = null;
      { const cs = S.control ? (S.control.pausedNow ? "p" : S.control.pausePending ? "w" : "") : ""; if (S.ctlState && S.ctlState !== cs) S.ctlNote = ""; S.ctlState = cs; } // "Pause sent" ends once the pause reaches the phones or ends
      const stride = S.info.callSeconds / 3;
      const schedOf = (r) => Array.from({ length: 90 }, (_, k) => ZG.callRoundR(st, S.info.startRound + ZG.GRACE_ROUNDS, stride, S.cfg.breaks, r, k));
      S.started = S.cfg.startMode === "manual" ? !!(st && st.goRound != null) : now !== null && now >= S.info.startRound + ZG.GRACE_ROUNDS; // a manual start has started when Start was pressed, however late
      try { S.changes = S.draft ? null : await call("GET", `/api/z/${eid}/changes`); } catch { S.changes = null; } // "what changed, who, when"
      try { S.glog = S.draft ? null : await call("GET", `/api/z/${eid}/gamelog`); } catch { S.glog = null; } // the vital details (tickets by number only)
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
      S.checked = ZG.checkClaims(eid, S.claims.filter((c) => !c.bogey).map((c) => ({ pid: c.pid, pattern: c.pattern, idx: c.idx, round: c.round })), S.logs, S.cfg, late);
      const nm = S.nameCache || (S.nameCache = new Map()); // names are sealed on our side: the console asks for the few it shows (winners), 50 at a time
      const settled = [];
      // a prize is won only by a claim in time (real housie): the organizer's own view settles from the claims and Bogeys the store holds, exactly as every phone does
      const pubClaims = (S.claims || []).map((c) => ({ pid: c.pid, pattern: c.pattern, round: c.round || 1, idx: c.idx, atMs: c.atMs || c.at_ms || 0, ...(c.bogey ? { bogey: true } : {}) }));
      for (let r = 1; r <= S.cfg.rounds; r++) if (S.logs[r].length) settled.push(...ZG.settleAll(eid, pids, S.logs[r], S.cfg, r, { countFrom: cfOf, callRounds: callRoundsOf[r] }, undefined, { claims: pubClaims, callRounds: callRoundsOf[r] }));
      await namesFor([...new Set(settled.filter((x) => x.pids.length <= 3).flatMap((x) => x.pids))]);
      S.settledPreview = settled.map((x) => ({ ...x, names: x.pids.length <= 3 && !S.shield ? x.pids.map((p) => nm.get(p) || "Participant").join(", ") : "" }));
      S.lucky = await computeLucky(now);
      try { S.life = await call("GET", `/api/z/${eid}/life`); } catch { S.life = null; }
      if (S.started && !S.draft) { try { S.prizes = (await call("GET", `/api/z/${eid}/prizes`)).prizes || []; } catch { S.prizes = S.prizes || []; } try { S.published = (await fetch(BASE + `/api/z/${eid}/results`).then((r) => r.json())).results || []; } catch { /* shown next time */ } } // the software decides the winners; this page only watches
      if (/^Could not refresh/.test(S.note || "")) S.note = ""; syncForm(); initOpen(); if (needPeople()) { await loadPeople(); S.waitN = ((S.pp && S.pp.waiting) || []).length; } else if (canRun() && !S.draft && !S.shield) { try { S.waitN = Number((await call("GET", `/api/z/${eid}/people?limit=1`)).waiting) || 0; } catch { /* shown next time */ } } else S.waitN = 0;
    } catch (e) { if (S.restored && (e.status === 404 || e.status === 403)) { S.restored = false; saveLast(null); eid = ""; history.replaceState(null, "", location.pathname + (BASE ? "?api=" + encodeURIComponent(BASE) : "")); S.cfg = null; S.info = null; return refreshHome(); } if ((!e.status || e.status >= 500 || e.status === 429) && S.cfg && S.f) { redraw(); return; } S.note = e.status === 404 ? "That game was not found." : e.status === 403 ? (S.deadLink = true, "This game does not open with this sign-in. Press " + (isOrg() ? "All games" : "All my games") + " to see your games, or press Sign out and sign in with the e-mail you used to make it.") : "Could not refresh. Retrying…"; }
    redraw();
  }

  // ---------- drawing ----------
  /** A link that no longer opens the game (cancelled, retired, replaced): a plain page, with none of the Organizer's controls. */
  const deadLinkView = () => frame(`<div class="zc-body"><div class="zc-main"><div class="zc-block" id="deadlink"><h3>This link no longer opens the game</h3><p style="margin:0">The game may have been cancelled, or the Organizer replaced your link with a new one. Please ask the Organizer.</p></div></div></div>`, false);
  let lastHtml = "";
  const CB = {}; // the ticks of each Terms point while the page redraws itself: never ticked in advance, never kept between visits
  const cbWire = () => ["K1", "K5"].forEach((k) => { if ($app.querySelector(`[data-cbc="${k}"]`)) CBConsent.wire($app, k, CB[k] || (CB[k] = {})); });
  function view() {
    if (!secret) return loginView(S.loginMsg || "");
    if (S.deadLink && /^ct[hc]_/.test(secret)) return deadLinkView(); // a Host or Co-host key (cth_ / ctc_) that the server no longer accepts
    if (role() === "host" && S.setup && S.setup.ready === false) return setupView();
    const r = role();
    if (r === "partner") return partnerView();
    if (!eid) { if (S.screen === "quick" && canRun()) return quickView(); return r === "organizer" ? homeView() : waitLinkView(); }
    if (r === "cohost") return cohostView();
    if (!S.cfg || !S.info || !S.f) return loadingView();
    return engView();
  }
  const redraw = () => { rehBanner(S.info); draw(view()); };
  /** Redraws only when something really changed: an AI (or a person) working on the page keeps the same elements instead of having them replaced every few seconds. */
  // What a person has typed or ticked and not yet saved survives any redraw (the page refreshes itself every few seconds): remembered per box, forgotten when the open step or the game changes.
  const dirty = {}; let dirtyFor = "";
  const noteDirty = (t) => { if (!t || !t.id || !t.tagName || !$app.contains(t)) return; const k = eid + ":" + S.open; if (k !== dirtyFor) { for (const x in dirty) delete dirty[x]; dirtyFor = k; } if (t.tagName === "INPUT" && (t.type === "checkbox" || t.type === "radio")) dirty[t.id] = { c: t.checked }; else if ((t.tagName === "INPUT" && t.type !== "file" && t.type !== "button" && t.type !== "submit") || t.tagName === "TEXTAREA") dirty[t.id] = { v: t.value }; };
  document.addEventListener("input", (e) => noteDirty(e.target)); document.addEventListener("change", (e) => noteDirty(e.target));
  // Work on steps 1 to 4 that is not saved yet: the first edit of a step sets a flag and shows "Not saved yet" beside the Save button; saving that step clears it. While a flag is set the page's own update (autoupdate.js) does not reload the page under the person.
  function unsavedNote(n) { return S.unsaved[n] && S.saving !== n ? `<p class="zc-small zc-warnt" id="unsavednote" role="status">Not saved yet. Press the button below to keep your changes.</p>` : ""; }
  window.__ctDirty = () => !!S.f && !lockedGame() && role() !== "cohost" && [1, 2, 3, 4].some((n) => S.unsaved[n]); // not on the home page, not once the steps are locked (Save can never clear the flag then)
  const markUnsaved = (e) => {
    const n = S.open, t = e.target; if (!(n >= 1 && n <= 4) || role() === "cohost" || S.unsaved[n] || !t || !t.closest || !t.closest("#secb" + n)) return;
    if (e.type === "click") { if (!t.closest("[data-ck],[data-bool],[data-cashcur],[data-luckyadd],[data-luckydel],#logorm")) return; const c = t.closest("[data-ck]"); if (t.closest('[data-bool="capOther"]') || (c && c === S.chipNoop)) { S.chipNoop = null; return; } } // nothing changed: the button only shows a box, or the chosen chip was tapped again
    if (e.type === "change" && t.type === "file") return; // a picture sets the flag itself, once it is accepted
    S.unsaved[n] = true; const ft = document.querySelector("#secb" + n + " .zc-foot"); if (ft && !document.getElementById("unsavednote")) ft.insertAdjacentHTML("beforebegin", unsavedNote(n));
  };
  ["input", "change", "click"].forEach((ev) => document.addEventListener(ev, markUnsaved));
  document.addEventListener("click", (e) => { const t = e.target; if (t && t.closest && t.closest("button") && $app.contains(t)) { for (const x in dirty) delete dirty[x]; S.near = null; } }, true); // pressing a button starts from the page as it is drawn from the saved state (a sent message stays cleared); only the self-refresh keeps unsaved boxes
  const restoreDirty = () => { if (dirtyFor !== eid + ":" + S.open) return; for (const id in dirty) { const el = document.getElementById(id); if (!el || !$app.contains(el)) continue; const d = dirty[id]; if ("c" in d) { if (el.checked !== d.c) el.checked = d.c; } else if (el.value !== d.v && el !== document.activeElement) el.value = d.v; } };
  function draw(v) {
    if (v === lastHtml && $app.firstChild) return;
    // A redraw (for any reason) must never interrupt a person who is typing: the box in use keeps its text, its focus and its cursor.
    const ae = document.activeElement, keep = ae && ae.id && $app.contains(ae) && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA") ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd, v: ae.value, type: ae.type } : null;
    lastHtml = v; $app.innerHTML = v;
    if (keep && keep.type !== "checkbox" && keep.type !== "radio" && keep.type !== "file") { const el = document.getElementById(keep.id); if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) { try { if (el.value !== keep.v) el.value = keep.v; el.focus({ preventScroll: true }); if (keep.s !== null) el.setSelectionRange(keep.s, keep.e); } catch { /* a box that has no cursor */ } } } // a file box can never be given a file name by the page (the browser refuses with an error): after choosing a logo this line used to stop the redraw, so no button of the step was connected any more
    if (secret && eid && S.cfg && !S.deadLink && (role() === "organizer" || role() === "host")) saveLast({ eid, open: S.open, role: role() });
    restoreDirty(); bind(); cbWire(); a11y(); markAct();
  }
  /** Every field gets a label that is really linked to it, every note is announced, every button has a name: an AI (or a screen reader) reads the page by these. */
  function a11y() {
    $app.querySelectorAll("label").forEach((l) => {
      if (l.getAttribute("for") || l.querySelector("input,select,textarea")) return;
      const t = l.nextElementSibling; const ctl = t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) ? t : t.querySelector && t.querySelector("input,select,textarea"));
      if (ctl && ctl.id) l.setAttribute("for", ctl.id);
    });
    $app.querySelectorAll("input,select,textarea").forEach((c) => { if (!c.getAttribute("aria-label") && !(c.id && $app.querySelector(`label[for="${c.id}"]`)) && !c.closest("label")) { const ph = c.getAttribute("placeholder"); if (ph) c.setAttribute("aria-label", ph); } });
    $app.querySelectorAll("button:not([aria-label])").forEach((b) => { if (!b.textContent.trim() && b.title) b.setAttribute("aria-label", b.title); });
  }
  function markAct() { // the one button the AI asked about is outlined and scrolled into view; it is never pressed for you
    if (!ACT || !eid || S.actMarked === eid + ACT) return;
    const el = ACT === "publish" ? document.getElementById("pubgo") || document.getElementById("publishopen") : ACT === "erase" ? document.getElementById("erase") : document.querySelector(`[data-ctl="${ACT === "stop" ? "stop" : "pause"}"]`);
    if (!el) return; S.actMarked = eid + ACT; el.style.outline = "4px solid #E4572E"; el.style.outlineOffset = "3px"; try { el.scrollIntoView({ block: "center" }); } catch { /* not every browser */ }
  }
  const go = (id) => { const e = document.getElementById(id); if (e && e.scrollIntoView) { try { e.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { /* not every browser */ } } };
  function openStep(n) { S.open = n; S.sheet = false; S.toast = ""; S.note = ""; S.near = null; S.redo = null; try { if (window.CTG && CTG.arrived) CTG.arrived(n); } catch { /* the guide is optional */ } S.gtNote = null; S.teamNote = ""; S.teamFoot = null; if (n === 5) refreshTeam(); redraw(); go("sec" + n); if ((n === 6 && canRun()) || (n === 2 && role() === "cohost")) loadPeople().then(redraw); }
  window.ctzStep = () => S.open; window.ctzStepName = (n) => STEP_NAMES[n - 1]; // for the guide: which step the person is on
  window.ctzFocus = (n, sel) => { try { openStep(n); } catch { return; } requestAnimationFrame(() => { if (sel && window.CTG) CTG.focus(sel.split(",").map((x) => "#sec" + n + " " + x.trim()).join(",") + "," + sel); }); }; // used by the guide: open step n, then the box
  function advance(n) { const nx = steps().find((s) => s[0] > n && !isDone(s[0])) || nextStep(); S.open = nx ? nx[0] : n; S.sheet = false; redraw(); go("sec" + S.open); }

  // ---------- saving a step ----------
  const MSG_PAST = "Please choose a start time in the future (at least 2 hours ahead is best).";
  function startOf(f) {
    const date = f.day === "other" ? f.dayo : f.day, time = f.time === "other" ? f.timeo : f.time;
    if (!date || !time) throw new Error("Pick the day and the time." + (date ? " The time is still missing: tap one of the times, or type your own." : time ? " The day is still missing: tap Today, Tomorrow or another day, or pick a date." : ""));
    const [y, mo, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
    return Date.UTC(y, mo - 1, d, h, mi) - 5.5 * 3600000;
  }
  function rewardsOut(f) {
    const rewards = [];
    for (const [k] of HS) {
      const h = f.hs[k]; if (!h.on || (k === "full2" && Number(f.tix) !== 2)) continue;
      for (let o = 1; o <= winnersOf(h, k); o++) rewards.push({ pattern: k === "full2" ? "full" : k, scope: k === "full2" ? "two_ticket" : "ticket", ordinal: o, text: h.diff && Number(h.n) > 1 ? prizeText(perFill(h)[o - 1].pt, perFill(h)[o - 1].pd) : !h.dirty && h.orig[o - 1] !== undefined ? h.orig[o - 1] : prizeText(h.pt, h.pd) });
    }
    return rewards;
  }
  function momentsOut(f) {
    const t = Number(f.tix) || 1, lim = maxFor(t);
    const rows = (g, N, cap, after) => f[g].slice(0, Math.min(Number(N) || 0, cap)).map((m) => momentOut(m, after)).filter(Boolean);
    const lucky = f.lucky.map((l) => ({ kind: "lucky", title: prizeText(l.pt, l.pd) || "Lucky draw", winners: Number(l.win) || 3, ...(l.style === "scratch" ? { style: "scratch" } : {}), ...(l.after ? { after: l.after, seconds: l.sec || 60 } : {}) }));
    return { tickets: t, opening: rows("op", f.opN, lim.op, false), breaks: [...rows("mid", f.midN, lim.mid, true), ...lucky], closing: rows("cl", f.clN, lim.cl, false) };
  }
  /** The signs a ticket cannot show are changed in the company name (the server would remove them without a word): & becomes "and", ' becomes the typographic apostrophe, the rest is dropped. */
  const brandNameClean = (s) => String(s || "").replace(/\s*&\s*/g, " and ").replace(/'/g, "\u2019").replace(/[<>`"\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 40).trim();
  const scrollToId = (id, block) => { const el = document.getElementById(id); if (el && el.scrollIntoView) { try { el.scrollIntoView({ behavior: "smooth", block: block || "start" }); } catch { /* not every browser */ } } };
  /** Step 4 is checked before anything is sent: a refusal names the exact moment and says what to do (the server's own sentences only say "a break"). Returns calm notes for what was set right on the way: a link box left empty (saved as a message), a time set to the nearest step of 3. */
  function brandCheck(f) {
    const t = Number(f.tix) || 1, lim = maxFor(t), where = { op: "before the game", mid: "during the game", cl: "at the end" }, notes = [];
    for (const g of ["op", "mid", "cl"]) f[g].slice(0, Math.min(Number(f[g + "N"]) || 0, lim[g])).forEach((m, i) => {
      if (momentEmpty(m)) return;
      const at = "Moment " + (i + 1) + " " + where[g] + ": ", b = momentOut(m, g === "mid"), u = b.mediaUrl || "", sec = String(m.s || "").trim();
      if (m.k !== "msg" && m.k !== "slides" && !u) notes.push("Moment " + (i + 1) + " " + where[g] + " had no link, so it shows your message only. Paste the link and save again to play a video or audio.");
      if (u && u[0] !== "/" && !/^https:\/\/[^\s<>"'`]+$/i.test(u)) throw new Error(at + "the link must start with https:// and have no spaces.");
      if (b.kind === "youtube" && !YT_HOST.test(u)) throw new Error(at + "that is not a YouTube video link. Copy it again from the YouTube Share button, or tap \"Paste video file link\" for a video file.");
      if ((m.t || "").trim().length === 1) throw new Error(at + "write a little more: the message needs at least 2 letters.");
      if (g !== "cl" && sec) {
        const n = Number(sec), hi = g === "op" ? 120 : 600;
        if (!(n >= 15 && n <= hi)) throw new Error(at + "how long must be from 15 to " + hi + " seconds. Clear the box to use 60.");
        if (n % 3) { m.s = String(Math.round(n / 3) * 3); notes.push("Moment " + (i + 1) + " " + where[g] + " lasts " + m.s + " seconds: the game counts in steps of 3."); }
      }
    });
    const op = momentsOut(f).opening.reduce((s, x) => s + (x.seconds || 60), 0);
    if (op > 120) throw new Error("The opening moments last " + op + " seconds together, but the game waits only 120 seconds (2 minutes) before the first number. Make them shorter. A moment with no time typed counts as 60 seconds.");
    const mid = momentsOut(f).breaks.length;
    if (mid > lim.mid) throw new Error("During the game you can have " + lim.mid + " things in all, moments and lucky draws together. You have " + mid + ". Remove " + (mid - lim.mid) + ", then press Save again.");
    return notes;
  }
  async function saveStep(n) { // one Save at a time: a second press while the first is working would save twice and jump the page under the person's finger
    if (S.saving) return; S.saving = n; S.toast = ""; redraw();
    try { await saveStepWork(n); if (!S.toast && n <= 4 && S.f && !S.midEdit) snapGroup(n); } finally { S.saving = 0; redraw(); }
  }
  async function saveStepWork(n) {
    S.toast = ""; S.midEdit = false;
    let sent = null; const mark = () => { sent = {}; for (const k of GROUPS[n] || []) sent[k] = JSON.stringify(S.f[k] === undefined ? null : S.f[k]); }; /* what is sent now, as the form holds it: a tap or a letter typed while the answer is awaited is not in it */
    try {
      const f = S.f;
      if (role() === "cohost") { markDone(n); return advance(n); }
      if (n === 1) { const name = f.occ === "Other" ? (f.oname || "").trim() : f.occ, ms = startOf(f); if (!(ms > Date.now())) throw new Error((f.day === "other" ? f.dayo : f.day) === istDateStr(istNow()) ? "That time has already passed today. Tap a later time, or tap Tomorrow." : MSG_PAST); const lastMs = S.info && S.info.moveUntilMs ? S.info.moveUntilMs - 1 : Date.now() + 30 * 86400000; if (ms > lastMs) throw new Error(S.info && S.info.moveUntilMs ? "Your credit and your game last 365 days from the payment, so a paid game can be moved to any day within 365 days of it. Please pick an earlier date." : "A game that is not paid for yet can start at most 30 days from today. Once it is paid, the Organizer can move it to any day within 365 days of the payment."); mark(); await call("PATCH", `/api/z/${eid}/settings`, { name, startRound: ZG.roundAt(ms) } /* who calls the numbers is saved by step 2 only */); }
      else if (n === 2) { { const c = Number(f.cap); if (!Number.isInteger(c) || c < 1) throw new Error("Please give the number of players, for example 180."); if (c > 10000) throw new Error("For more than 10,000 players, please write to hello@corporatetambola.com and we will arrange it."); f.demo = c <= DEMO_CAP ? "1" : "0"; /* the number just typed decides, not the last time the page was drawn */ { const bought = paidPack(); if (bought && c > bought) throw new Error("Your payment covers up to " + bought + " people. Choose " + bought + " or fewer, or make a new game like this one in step 7 for a bigger crowd."); } } if (!f.emp && f.inv && !f.cats.length) throw new Error("Pick at least one kind of guest."); mark(); await call("PATCH", `/api/z/${eid}/settings`, { callMode: f.mode === "host" ? "host" : "auto", startMode: f.start === "manual" ? "manual" : "auto", afterPrizes: f.after === "end" ? "end" : "keep", cap: Number(f.cap), callSeconds: Number(f.spd), tickets: Number(f.tix), rounds: Number(f.rnd), whoCanJoin: f.emp || f.who !== "anyone" ? "list" : "anyone", verify: f.ver, employeesOnly: !!f.emp, invites: { on: !f.emp && !!f.inv, per: Number(f.per) || 4, cats: f.cats }, ...(paidPack() || (S.demo && !S.draft) ? {} : { demo: f.demo === "1" }) }); try { S.sum = await call("GET", `/api/z/${eid}/summary`); } catch { /* shown at the next load */ } /* the page must know the new audience and what people give (employee ID or mobile) before step 6 reads the list */ }
      else if (n === 3) { const rewards = rewardsOut(f); if (!rewards.length) throw new Error("Tick at least one prize."); mark(); await call("PATCH", `/api/z/${eid}/settings`, { tickets: Number(f.tix), ties: f.ties === "share" ? "share" : "next", rewards }); }
      else if (n === 4) {
        // The company strip is optional and never stops a person: a name without a colour gets the first colour; a logo or colour without a name is simply not used yet (the game is saved and the person is told, calmly).
        const calmNotes = brandCheck(f); // every refusal names the moment and says what to do, before anything is sent
        const typed = (f.brand.name || "").replace(/\s+/g, " ").trim(), cleanNm = brandNameClean(typed); let nameNote = ""; f.brand.name = cleanNm;
        if (cleanNm !== typed) nameNote = cleanNm ? "Saved. Your company name will read “" + cleanNm + "” on the tickets: a ticket cannot show the & sign or quote marks, so we changed them. Please check it." : "Saved. Your company name had only signs that cannot be shown on a ticket, so it was left empty. Please type it with letters.";
        const bn = cleanNm, bl = f.brand.logo || "", brandChanged = JSON.stringify(f.brand) !== JSON.stringify((S.fBase || {}).brand);
        let bc = f.brand.color || ""; if (brandChanged && bn && !bc) { bc = "#0B3D91"; f.brand.color = bc; }
        const stripUnused = brandChanged && !bn && !!(bl || bc);
        mark(); await call("PATCH", `/api/z/${eid}/settings`, { ...momentsOut(f), ...(brandChanged ? { brand: bn ? { name: bn, color: bc, ...(bl ? { logo: bl } : {}) } : {} } : {}) });
        if (nameNote) S.brandNote = nameNote; else if (stripUnused) S.brandNote = "Saved. Your " + (bl ? "logo" : "colour") + " is not on the tickets yet, because there is no company name. You can add the name in step 4 any time.";
        if (calmNotes.length) S.brandNote = (S.brandNote || "Saved.") + " " + calmNotes.join(" ");
      }
      if (n === 1 && S.cloneNew === eid) S.cloneDated = eid; if (S.touched) S.touched[n] = 0; const savedNote = n === 1 && f.occ === "Other" && !(f.oname || "").trim() ? "Saved. Your game has no name yet: you can type one under Other in step 1 any time." : n === 2 && Number(f.tix) === 1 && ((S.cfg && S.cfg.rewards) || []).some((r) => r.scope === "two_ticket") ? "Saved. The Super Bumper House prize was removed, because it needs 2 tickets." : "Saved.";
      if (n === 2) S.passMsg = ""; if (n <= 4 && S.f && S.fBase) { for (const k of GROUPS[n] || []) S.fBase[k] = JSON.parse(sent ? sent[k] : JSON.stringify(S.f[k] === undefined ? null : S.f[k])); S.midEdit = !!sent && (GROUPS[n] || []).some((k) => JSON.stringify(S.f[k] === undefined ? null : S.f[k]) !== sent[k]); } /* what was just saved is the new baseline: a refresh that finishes a moment later must not take a later change of the person for 'unchanged' and overwrite it */ if (n <= 4) { markDone(n); S.unsaved[n] = S.midEdit; if (S.midEdit && n <= 2) (S.touched = S.touched || {})[n] = 1; /* a change made while the Save was on its way is still not saved: it stays on the screen, flagged */ if (n === 4 && S.brandNote) setTimeout(() => scrollToId("zcnote"), 0); S.note = (n === 4 && S.brandNote) || savedNote; S.brandNote = ""; if (n === 4 && S.note !== "Saved.") setTimeout(() => go("zcnote"), 0); refreshEng().catch(() => {}); return advance(n); } // move on at once; the fresh numbers arrive a moment later and redraw (a slow connection no longer leaves the person looking at a frozen screen)
      if (n >= 7 && !steps().some((s) => s[0] > n && !isDone(s[0]))) { S.note = gameEnded() ? "Nothing more to do here." : "Nothing more to do here until the game is played."; redraw(); return go("zc-top"); } if (n <= 6) markDone(n); advance(n);
    } catch (e) { S.toast = friendly(e); S.redo = { err: e, fn: () => saveStep(n) }; redraw(); const ft = document.querySelector("#sec" + n + " .zc-toast-foot"); if (ft && ft.scrollIntoView) { try { ft.scrollIntoView({ block: "center", behavior: "auto" }); } catch { /* not every browser */ } } else go("sec" + n); }
  }

  // ---------- quick setup: make the draft ----------
  async function makeDraft(r, id, hasName) {
    const res = await call("POST", "/api/z", { id, ...(r.name ? { name: r.name } : {}), startRound: ZG.roundAt(r.startMs), callSeconds: r.speed, cap: r.cap, tickets: r.tickets, rounds: r.rounds, rewards: r.rewards, whoCanJoin: r.who, ...(r.callMode === "host" ? { callMode: "host" } : {}), ...(r.startMode === "manual" ? { startMode: "manual" } : {}), ...(r.afterPrizes ? { afterPrizes: r.afterPrizes } : {}), ...(r.demo ? { demo: true } : {}) });
    return res;
  }
  async function afterCreate(id, r) {
    S.note = ""; S.toast = ""; // a note about the last thing (for example 'Draft deleted.') must not follow the person into a new game
    if (r && (r.verify !== "mobile" || r.employeesOnly)) await call("PATCH", `/api/z/${id}/settings`, { ...(r.verify !== "mobile" ? { verify: r.verify } : {}), ...(r.employeesOnly ? { employeesOnly: true } : {}) });
    if (r && r.invite) await call("PATCH", `/api/z/${id}/settings`, { invites: { on: true, per: 4, cats: ["family", "colleagues"] } });
    let k = { ok: false, reason: "" }; try { k = await TBControl.ensureKey(id, { token: secret, base: BASE, prefix: "/api/z" }); } catch { /* the pause key is optional: the game does not depend on it */ }
    eid = id; history.replaceState(null, "", "?e=" + id + (BASE ? "&api=" + encodeURIComponent(BASE) : "")); S.store = null; S.f = null; S.fFor = ""; S.unsaved = {}; S.touched = {}; S.openInit = ""; S.cfg = null; S.info = null; S.sum = null; S.screen = "eng";
    return k;
  }
  function quickSummary() {
    const el = document.getElementById("qk-summary"); if (!el) return;
    try { const r = quickRead(); const when2 = new Date(r.startMs + 5.5 * 3600000).toISOString(), ok = r.startMs > Date.now();
      el.textContent = `${r.name || "Your game"}: ${when2.slice(0, 10)} at ${when2.slice(11, 16)} India time${ok ? "" : " (that time has passed: choose a later one)"}; up to ${r.cap} people; ${r.tickets} ticket${r.tickets === 1 ? "" : "s"} each, a number every ${r.speed} seconds, ${r.rounds} round${r.rounds === 1 ? "" : "s"}; ${r.who === "list" ? "only people on a list" : "anyone with the link"}; ${r.rewards.length} prize${r.rewards.length === 1 ? "" : "s"}${r.callMode === "host" ? "; a Host presses each number" : ""}${r.employeesOnly ? "; employees only" : ""}${r.verify !== "mobile" ? "; people give " + ({ id: "their employee ID", either: "their mobile number or employee ID", both: "their mobile number and employee ID" }[r.verify]) : ""}.`; } catch { el.textContent = ""; }
  }
  async function quickSave() {
    const err = document.getElementById("qk-err"); err.style.display = "none";
    try {
      const r = quickRead(); if (!(r.startMs > Date.now())) throw new Error(MSG_PAST);
      if (!r.rewards.length) throw new Error("Tick at least one prize.");
      const md = new Date(r.startMs + 5.5 * 3600000), base = `${(r.name ? r.name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) : "") || r.occ}-${pad2(md.getUTCMonth() + 1)}${pad2(md.getUTCDate())}`.slice(0, 36);
      let id = base, made = null;
      for (let i = 1; i <= 9 && !made; i++) { id = i === 1 ? base : `${base}-${i}`; const res = await makeDraft(r, id); if (!res.existed) made = res; }
      if (!made) throw new Error("Could not find a free game code. Try a different name.");
      const k = await afterCreate(id, r);
      S.note = "Your draft is saved. Add your brand messages, videos or a lucky draw below if you want, then publish it (free)." + (k.ok || !k.reason ? "" : " Pause control is unavailable: " + k.reason);
      refreshEng();
    } catch (e) { err.textContent = e.message; err.style.display = ""; }
  }
  async function startNew(demo) {
    const saved = S.f; S.f = quickDefault(); const rr = quickRead();
    { let want = 0; try { want = Number(q.get("cap") || sessionStorage.getItem("ctz-cap") || 0); } catch { /* none */ } if (!demo && want > 0 && capOptions().some((p) => p.n === want)) { rr.cap = want; if (want <= DEMO_CAP) rr.demo = true; } try { sessionStorage.removeItem("ctz-cap"); } catch { /* none */ } } // the size chosen on the website
    S.f = saved;
    if (demo) { rr.cap = DEMO_CAP; rr.demo = true; } // a free demo game: up to 10 people, every screen says DEMO GAME
    const id = randId();
    await makeDraft({ ...rr, name: "" }, id);
    const k = await afterCreate(id, rr);
    S.note = "Your draft is saved. Open each step, tap your choices and press Save and continue." + (k.ok || !k.reason ? "" : " Pause control is unavailable: " + k.reason);
    refreshEng();
  }

  // ---------- buttons and fields ----------
  const looksPhone = (s) => /^[+()\d][\d ()+\-]*$/.test(String(s).trim()) && String(s).replace(/\D/g, "").length >= 8;
  const parseList = (text) => {
    const lines = String(text).split(/\r?\n/).map((l) => l.replace(/"([^"]*)"/g, (m, g) => g.replace(/[,;\t]+\s*/g, " ")).replace(/"/g, "").trim()).filter(Boolean);
    let map = null;
    if (lines.length && /name|mobile|phone|employee|emp/i.test(lines[0]) && !/\d{8,}/.test(lines[0])) {
      const h = lines.shift().split(/[,;\t]/).map((c) => c.trim().toLowerCase());
      map = { n: h.findIndex((c) => /name/.test(c) && !/employee|emp/.test(c)), p: h.findIndex((c) => /mobile|phone|number/.test(c) && !/employee|emp/.test(c)), e: h.findIndex((c) => /employee|emp|staff|\bid\b/.test(c)) };
    }
    return lines.map((l) => {
      const c = l.split(/[,;\t]/).map((x) => x.trim());
      if (map && c.length > 1) return { name: map.n >= 0 ? c[map.n] || "" : "", phone: map.p >= 0 ? c[map.p] || "" : "", empId: map.e >= 0 ? c[map.e] || "" : "" };
      if (c.length >= 3) return looksPhone(c[1]) || !looksPhone(c[2]) ? { name: c[0], phone: c[1], empId: c[2] } : { name: c[0], phone: c[2], empId: c[1] };
      if (c.length === 2) return looksPhone(c[1]) ? { name: c[0], phone: c[1] } : vmode() !== "mobile" ? { name: c[0], phone: "", empId: c[1] } : { name: c[0], phone: c[1] };
      const m = l.match(/^(.*?)[,;\t ]+([+()\d][\d ()+-]{4,})$/) || l.match(/^()([+()\d][\d ()+-]{8,})$/);
      return m ? { name: m[1].trim(), phone: m[2].trim() } : vmode() !== "mobile" && /^[A-Za-z0-9][A-Za-z0-9._\-\/]{0,29}$/.test(l) ? { name: "", phone: "", empId: l } : { name: l, phone: "" };
    });
  };
  function applyBundle(b) { applyBundleTo(S.f, b); }
  const markHsDirty = (path) => { if (/^hs\.[a-z0-9]+\.(pd|per\.\d+\.pd)$/.test(path)) S.f.hs[path.split(".")[1]].dirty = true; }; // a changed prize text (typed, or the cash amount or currency) is sent on Save, not the saved one
  function onField(el) {
    const path = el.dataset.fi;
    setP(path, el.value); edited();
    markHsDirty(path);
    const lk = document.querySelector(`[data-lk="${path.replace(/\.(v|t|s)$/, "")}"]`);
    if (lk && /\.v$/.test(path)) lk.innerHTML = noteHtml(path.replace(/\.v$/, ""));
    const bm = document.getElementById("bmcount"); if (bm && S.f) bm.textContent = `${usedMoments()} of ${5 * (Number(S.f.tix) || 1)}`;
    const bz = document.getElementById("brandhintz"); if (bz && path === "brand.name") bz.innerHTML = brandHint(); const mc = document.getElementById("midcount"); if (mc && S.f) mc.textContent = momentsOut(S.f).breaks.length + " used";
    if (document.getElementById("qk-summary")) quickSummary();
  }
  function chipClick(b) {
    const path = b.dataset.ck, v = b.dataset.v, before = JSON.stringify(S.f); if (b.dataset.multi || String(getP(path)) !== String(v)) edited();
    if (b.dataset.multi) { const a = (getP(path) || []).slice(), i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); setP(path, a); }
    else { setP(path, path === "brand.color" && getP(path) === v ? "" : v); if (path === "bundle") applyBundle(v); if (path === "aud") applyAud(S.f, v); }
    if (/^hs\.[a-z0-9]+\.(n|pt|pd|per\.\d+\.(pt|pd))$/.test(path)) S.f.hs[path.split(".")[1]].dirty = true;
    if (path === "tix" && v === "1" && S.f.hs.full2) S.f.hs.full2.on = false;
    if (path === "demo" && v === "1" && Number(S.f.cap) > DEMO_CAP) S.f.cap = String(DEMO_CAP); // a demo game: at most 10 people
    S.chipNoop = JSON.stringify(S.f) === before ? b : null; /* a tap that changed nothing (the chosen chip again) is not "not saved yet" */
    redraw(); if (document.getElementById("qk-summary")) quickSummary();
    if (b.type === "radio") { const keep = document.querySelector('input[type=radio][name="' + path + '"]:checked'); if (keep) keep.focus(); } // the page was drawn again: keep the keyboard on the chosen option
  }
  function bind() {
    const $ = (id) => document.getElementById(id);
    const all = (sel, fn) => $app.querySelectorAll(sel).forEach(fn);
    const noteAndDraw = (t) => { S.note = t; lastHtml = ""; redraw(); };
    if ($("shield")) $("shield").onchange = () => { S.shield = $("shield").checked; ss.set("ctz-shield", S.shield ? "1" : "0"); S.nameCache = null; lastHtml = ""; if (!eid) return redraw(); if (role() === "cohost") return redraw(); refreshEng(); };
    if ($("goLogin")) $("goLogin").onclick = () => { const em = ($("lem") && $("lem").value || "").trim(), bad = $("lerr"); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { if (bad) { bad.textContent = em ? "That does not look like an e-mail address. Check it for a typing slip, for example name@company.com, then press Continue." : "Type your e-mail address in the box above, for example name@company.com, then press Continue."; bad.style.display = ""; } if ($("lem")) $("lem").focus(); return; } try { sessionStorage.setItem("ctz-next", location.pathname + location.search); if (em) sessionStorage.setItem("ctz-login-email", em); } catch {} location.href = "/#login"; }; // the website's login box does the rest (new account or 6-digit code) and brings the person back here
    if ($("lem")) $("lem").oninput = () => { const x = $("lerr"); if (x) x.style.display = "none"; }; if ($("lem")) $("lem").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); $("goLogin").click(); } };
    if ($("in")) $("in").onclick = () => { secret = $("sec").value.trim(); ss.set("ctz-org", secret); S.loginMsg = ""; bootstrap(); };
    const leaveGame = () => { saveLast(null); S.clone = null; S.deadLink = false; eid = ""; S.cfg = null; S.info = null; S.f = null; S.fFor = ""; S.unsaved = {}; S.touched = {}; S.openInit = ""; S.note = ""; S.sum = null; S.store = null; S.history = null; S.team = null; S.hostN = 0; S.becomeErr = ""; history.replaceState(null, "", location.pathname + (BASE ? "?api=" + encodeURIComponent(BASE) : "")); };
    const takeKey = (key, mark) => { const me = { kind: isOrg() ? "organizer" : "host", token: secret }; ss.set("ctz-alt", JSON.stringify(me)); secret = key; ss.set("ctz-org", secret); S.kind = ""; leaveGame(); if (mark) S.note = mark; bootstrap(); };
    if ($("signout")) $("signout").onclick = () => { if (window.CTK) window.CTK.signOut(); else { ss.set("ctz-org", ""); ss.set("ctz-alt", ""); } location.href = "/zc.html" + (BASE ? "?api=" + encodeURIComponent(BASE) : ""); }; // signing in again is the same two e-mail ways: nothing to remember
    if ($("switchrole")) $("switchrole").onclick = () => { const a = altRole(); if (a) takeKey(a.token, a.kind === "host" ? "You are now in your Host view." : "You are now in your Organizer view."); };
    if ($("hostall")) $("hostall").onclick = () => { leaveGame(); bootstrap(); };
    if ($("hostswitchorg")) $("hostswitchorg").onclick = () => { const a = altRole(); if (a) takeKey(a.token, "You are now in your Organizer view."); };
    if ($("hostbecome")) $("hostbecome").onclick = async () => {
      if (!CBConsent.all($app, "K2")) { S.becomeErr = "Please tick the box to continue."; return redraw(); }
      try { const r = await call("POST", "/api/host/become-organizer", { consent: CBConsent.payload($app, "K2") }); S.becomeErr = ""; takeKey(r.token, "Your Organizer account is ready. Start your new game below."); }
      catch (e) { S.becomeErr = friendly(e); redraw(); }
    };
    if ($("back")) $("back").onclick = () => { saveLast(null); S.clone = null; S.deadLink = false; eid = ""; S.cfg = null; S.info = null; S.f = null; S.fFor = ""; S.unsaved = {}; S.touched = {}; S.openInit = ""; S.note = ""; S.sum = null; history.replaceState(null, "", location.pathname + (BASE ? "?api=" + encodeURIComponent(BASE) : "")); refreshHome(); };
    if ($("mk")) $("mk").onclick = async () => { if (S.creating) return; S.creating = true; redraw(); try { await startNew(); } catch (e) { S.note = friendly(e); } finally { S.creating = false; redraw(); } };
    if (NEWDEMO && !eid && secret && !S.autoDemo && $("mk")) { S.autoDemo = true; $("mk").disabled = true; startNew(true).catch((e) => noteAndDraw(friendly(e))); } // the website's "Start a demo game" link lands here signed in
    // moving around
    all("[data-open]", (b) => (b.onclick = () => openStep(Number(b.dataset.open))));
    all("[data-acct]", (b) => (b.onclick = () => { S.acctOpen = !(S.acctOpen === null ? !eid : S.acctOpen); redraw(); if (S.acctOpen) { go("acct"); if (!Array.isArray(S.keys)) loadAccount(); } }));
    all("[data-q]", (b) => (b.onclick = () => { const i = Number(b.dataset.q); S.q = S.q === i ? -1 : i; redraw(); }));
    all("[data-act]", (b) => (b.onclick = () => {
      const a = b.dataset.act; S.toast = "";
      if (a === "help") { S.q = S.q < 0 ? 0 : S.q; S.sheet = false; redraw(); return go("help"); }
      if (a === "top") { S.sheet = false; redraw(); return go("zc-top"); }
      if (a === "steps") { redraw(); return go("sec" + S.open); }
      if (a === "sheet") { S.sheet = !S.sheet; redraw(); if (S.sheet) go("zc-sheet"); }
    }));
    all("[data-save]", (b) => (b.onclick = () => saveStep(Number(b.dataset.save))));
    // the choices
    all("[data-ck]", (b) => (b.onclick = () => chipClick(b)));
    all("[data-bool]", (b) => (b.onclick = () => { if (b.dataset.bool !== "capOther") edited(); setP(b.dataset.bool, !getP(b.dataset.bool)); if (/^hs\.[a-z0-9]+\.diff$/.test(b.dataset.bool)) { const h = S.f.hs[b.dataset.bool.split(".")[1]]; h.dirty = true; if (h.diff) perFill(h); } redraw(); if ($("qk-summary")) quickSummary(); }));
    all("[data-fi]", (el) => (el.oninput = () => onField(el)));
    all("[data-cashamt]", (el) => (el.oninput = () => { edited(); const path = el.dataset.cashamt, cur = cashParse(getP(path)).cur; setP(path, cashJoin(cur, el.value)); markHsDirty(path); const clean = cashParse(getP(path)).amt; if (el.value !== clean) el.value = clean; /* digits only: the k of 50k never stays in the box looking like 50,000 while 50 is saved */ }));
    all("[data-cashcur]", (el) => (el.onclick = () => { edited(); const path = el.dataset.cashcur, amt = cashParse(getP(path)).amt; setP(path, cashJoin(el.dataset.v, amt)); markHsDirty(path); redraw(); }));
    all("[data-qkprize]", (el) => (el.oninput = () => { const h = S.f.hs[el.dataset.qkprize]; h.pt = el.value.trim() ? "other" : "later"; h.pd = el.value; quickSummary(); }));
    all("[data-hc]", (c) => (c.onchange = () => { edited(); const h = S.f.hs[c.dataset.hc]; h.on = c.checked; if (c.checked) S.f.ph = c.dataset.hc; h.dirty = true; redraw(); if ($("qk-summary")) quickSummary(); }));
    all("[data-ph]", (b) => (b.onclick = () => { S.f.ph = b.dataset.ph; redraw(); }));
    all("[data-luckyadd]", (b) => (b.onclick = () => { if (momentsOut(S.f).breaks.length >= maxFor(Number(S.f.tix) || 1).mid) { redraw(); return; } /* the places were filled by typing since the button was drawn: show "All places are used" now */ edited(); S.f.lucky.push({ win: "3", style: "draw", pt: "phone", pd: "" }); redraw(); }));
    all("[data-luckydel]", (b) => (b.onclick = () => { edited(); S.f.lucky.splice(Number(b.dataset.luckydel), 1); redraw(); }));
    if ($("seeguests")) $("seeguests").onclick = () => { const n = $("previewnote"), un = !!(S.unsaved[3] || S.unsaved[4]); if (n) { n.textContent = un ? "You have changes that are not saved yet, so the new tab shows the saved game. Press Save and continue, then look again." : ""; if (un) n.removeAttribute("hidden"); else n.setAttribute("hidden", ""); } }; // the preview shows the SAVED game: say so beside the button, at the click, when something is not saved yet (the tab still opens)
    all("[data-test]", (btn) => (btn.onclick = () => {
      const [g, i] = btn.dataset.test.split("."), m = S.f[g][Number(i)], w = { op: "opening", mid: "break", cl: "closing" }[g], u = fixUrl((m.v || "").trim());
      if (!u) { const lk = document.querySelector(`[data-lk="${btn.dataset.test}"]`); if (lk) lk.innerHTML = '<span class="zc-badt">Paste your link in the box above first, then press Test it.</span>'; return; } // nothing to test: say so beside the box, not in an empty new tab
      const h = new URLSearchParams({ w, k: momentOut(m, g === "mid").kind, t: (m.t || "").trim() || "Your message", u, ...(m.s ? { s: m.s } : {}) });
      window.open("/preview.html#" + h.toString(), "_blank", "noopener");
    }));
    // publish and pay
    if ($("publishopen")) $("publishopen").onclick = () => { S.pubOpen = true; S.pubNote = ""; redraw(); };
    if ($("pubcancel")) $("pubcancel").onclick = () => { S.pubOpen = false; redraw(); };
    if ($("pubEmail")) $("pubEmail").oninput = (e) => { S.contact.email = e.target.value; };
    if ($("pubPhone")) $("pubPhone").oninput = (e) => { S.contact.phone = e.target.value; };
    if ($("pubgo")) $("pubgo").onclick = async () => {
      if (!CBConsent.all($app, "K1")) { S.pubNote = "Please tick the box to continue."; return redraw(); }
      const consent = CBConsent.payload($app, "K1");
      $("pubgo").disabled = true;
      try { const pr = await call("POST", `/api/z/${eid}/publish`, { email: S.contact.email.trim(), phone: S.contact.phone, consent }); ss.set("ctz-email", S.contact.email.trim()); ss.set("ctz-phone", S.contact.phone); S.pubOpen = false; S.note = pr && pr.needsOrganizer ? "Not published. Only the Organizer publishes, with one tap. If you are a Help Desk helper, ask the Organizer from the Help Desk page." : pr && pr.paid ? "Published. Your game is live and nothing is due. Send the link in step 6 to your participants." : "Published. Send the link in step 6 to your participants. Then pay in step 8 before the start time, or the game will not begin."; }
      catch (e) { ss.set("ctz-email", S.contact.email.trim()); ss.set("ctz-phone", S.contact.phone); S.pubNote = e.message + (e.needPack ? " (a pack for up to " + e.needPack + " participants)" : ""); lastHtml = ""; S.redo = { err: e, fn: () => { const b = $("pubgo"); if (b && b.onclick) return b.onclick(); } }; }
      refreshEng();
    };
    // cancel the game
    if ($("cancelopen")) $("cancelopen").onclick = async () => {
      S.cancel = { stage: 1, preview: null, err: "" }; redraw();
      try { S.cancel.preview = await call("GET", `/api/z/${eid}/cancel-preview`); } catch (e) { S.cancel.err = e.status === 404 ? "Cancelling is not switched on yet. Please try again a little later." : friendly(e); }
      redraw();
    };
    if ($("movego")) $("movego").onclick = async () => {
      const v = (($("movedt") || {}).value || ""), ms = v ? new Date(v).getTime() : NaN;
      if (!(ms > Date.now())) { S.move = { err: "Please pick a new date and time in the future." }; return redraw(); }
      S.move = { busy: true }; redraw();
      try { await call("POST", `/api/z/${eid}/reopen`, { startRound: ZG.roundAt(ms) }); S.move = { done: true }; S.cancelDone = false; S.note = "Your game was moved to the new date."; }
      catch (e) { S.move = { err: friendly(e) }; }
      refreshEng();
    };
    if ($("cancelback")) $("cancelback").onclick = () => { S.cancel = { stage: 0 }; redraw(); };
    if ($("cancel1")) $("cancel1").onclick = () => { S.cancel.stage = 2; redraw(); };
    if ($("cancelagree")) $("cancelagree").onchange = () => { S.cancel.agree = $("cancelagree").checked; redraw(); };
    if ($("cancelresched")) $("cancelresched").onclick = () => { S.cancel = { stage: 0 }; openStep(1); };
    if ($("cancelprev")) $("cancelprev").onclick = () => { S.cancel.stage = 1; S.cancel.agree = false; redraw(); };
    if ($("cancel2")) $("cancel2").onclick = () => { if (!S.cancel.agree) return; S.cancel.stage = 3; redraw(); };
    if ($("cancel3")) $("cancel3").onclick = async () => {
      S.cancel.busy = true; $("cancel3").disabled = true;
      try { const r = await call("POST", `/api/z/${eid}/cancel`, { confirmations: 3 }); S.cancelDone = true; S.cancel = { stage: 0, credit: r.credit || (S.cancel.preview && S.cancel.preview.credit) || null }; S.note = "The game was cancelled."; }
      catch (e) { S.cancel = { stage: 1, preview: null, err: e.status === 404 ? "Cancelling is not switched on yet. Please try again a little later." : friendly(e) }; }
      refreshEng();
    };
    // the team
    const person = async (kind) => { if (S.personBusy) return; S.personBusy = true; const bt = $(kind + "add"), lab = bt ? bt.textContent : ""; if (bt) { bt.disabled = true; bt.textContent = "Adding..."; } try { await personWork(kind); } finally { S.personBusy = false; if (bt) { bt.disabled = false; bt.textContent = lab; } } }; // one at a time: a second press made a second person and a second e-mail
    const personWork = async (kind) => {
      const val = (id) => (($(id) || {}).value || "").trim(), name = val(kind + "label"), bad = (t) => { S.teamFoot = { k: kind, t }; S.teamNote = ""; return redraw(); }; S.teamFoot = null;
      S.tv = { [kind + "label"]: name, [kind + "phone"]: val(kind + "phone"), ...(kind === "host" ? { hostemail: val("hostemail") } : {}) }; // what was typed stays on the screen if something needs a correction
      let body;
      if (kind === "host") {
        const email = val("hostemail"), hp = val("hostphone");
        if (!name) { return bad("Please type the Host's name."); }
        if (!email && !hp) { return bad("Please type the Host's mobile number or e-mail."); }
        if (hp && hp.replace(/\D/g, "").length < 10) { return bad("Please check the Host's mobile number."); }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { return bad("Please check the Host's e-mail."); }
        body = { label: name, ...(eid ? { e: eid } : {}), ...(hp ? { mobile: hp } : {}), ...(email ? { email } : {}) }; S.lastHostWa = !email && hp ? cleanPhone(hp) : null;
      }
      else { const phone = val("cohostphone"); if (!name) { return bad("Please type the Co-host's name."); } if (phone.replace(/\D/g, "").length < 10) { return bad("Please type the Co-host's mobile number."); } body = { label: name, phone, eid, e: eid }; }
      const path = kind === "host" ? "/api/org/host" : "/api/org/cohost";
      try {
        let r; try { r = await call("POST", path, body); } catch (e) { S.redo = { err: e, fn: () => person(kind) }; throw e; }
        const key = r.hostKey || r.cohostKey || "", id = r.id || (key ? key.slice(0, 10) : ""), hash = kind === "host" ? "host" : "cohost";
        S.teamLinks[id] = key ? `${location.origin}/zc.html?e=${encodeURIComponent(eid)}#${hash}=${key}` : r.link || ""; let waD = kind === "host" ? S.lastHostWa : cleanPhone(body.phone); if (!waD && kind === "host" && r.emailed === false) { const wm = String(r.waLink || "").match(/wa\.me\/(\d{8,15})/); if (wm) waD = wm[1]; } if (waD) S.teamWa[id] = { d: waD, name: name, role: kind === "host" ? "Host" : "Co-host" };
        S.teamNote = ""; S.teamFoot = { k: kind, ok: true, t: kind === "host" ? (S.lastHostWa ? "Host added. Send their link on WhatsApp, to that one person only." : r.emailed === false ? "Host added, but the e-mail could not be sent. " + (waD ? "Send their link on WhatsApp, to that one person only." : "Copy their link below and send it to that one person only.") : "Host added. We sent their link to their e-mail.") : waD ? "Co-host added. Send their link on WhatsApp, to that one person only." : "Co-host added. Send the link to that one person only." }; S.tv = {}; await refreshTeam();
      } catch (e) { S.teamNote = ""; S.teamFoot = { k: kind, t: friendly(e) }; redraw(); }
    };
    if ($("hostadd")) $("hostadd").onclick = () => person("host");
    if ($("cohostadd")) $("cohostadd").onclick = () => person("cohost");
    all("[data-cohl]", (b) => (b.onclick = async () => { try { await call("PATCH", `/api/z/${eid}/settings`, { coHostLimit: Number(b.dataset.cohl) }); S.teamNote = "Saved."; S.sum = Object.assign({}, S.sum, { coHostLimit: Number(b.dataset.cohl) }); } catch (e) { S.teamNote = friendly(e); } redraw(); }));
    all("[data-retire]", (b) => (b.onclick = async () => {
      if (!(await askSure("Remove this " + (b.dataset.kind === "host" ? "Host" : "Co-host") + "?", "Their link stops working at once." + (b.dataset.kind === "host" ? "\n\nA Host works in all your games, so this stops them in every game." : ""), "Yes, remove them", "No, keep them"))) return;
      try { await call("POST", "/api/org/team/retire", { id: b.dataset.retire }); delete S.teamLinks[b.dataset.retire]; S.teamFoot = null; S.teamNote = "Removed. Their link has stopped."; await refreshTeam(); } catch (e) { S.teamNote = friendly(e); redraw(); }
    }));
    all("[data-newlink]", (b) => (b.onclick = async () => {
      try {
        const r = await call("POST", "/api/org/host/link", { id: b.dataset.newlink, ...(eid ? { e: eid } : {}) }), nid = r.id || b.dataset.newlink, key = r.hostKey || "";
        S.teamLinks[nid] = key ? `${location.origin}/zc.html?e=${encodeURIComponent(eid)}#host=${key}` : r.link || ""; // the old link has stopped
        const m = String(r.waLink || "").match(/wa\.me\/(\d{8,15})/); if (m) S.teamWa[nid] = { d: m[1], name: r.label || b.dataset.label || "" }; else delete S.teamWa[nid];
        S.teamNote = r.emailed ? "A new link is on its way to their e-mail. The old one has stopped." : "A new link is ready. The old one has stopped. Send it to that one person only.";
        await refreshTeam();
      } catch (e) { S.teamNote = e.code === "host-active" ? "This Host has already finished setup, so they sign in with their e-mail now. " + (e.message || "") : friendly(e); redraw(); }
    }));
    all("[data-copyteam]", (b) => (b.onclick = async () => { const ok = await copyText(S.teamLinks[b.dataset.copyteam] || ""); b.textContent = ok ? "Copied" : "Select and copy it"; }));
    // sharing and the guest list
    all("[data-mode]", (b) => (b.onclick = () => { S.mode = b.dataset.mode; redraw(); }));
    if ($("copy")) $("copy").onclick = async () => { const ok = await copyText(role() === "cohost" ? cohInvite() : guestLink()); $("copy").textContent = ok ? "Copied" : "Select and copy it"; };
    if ($("copybig")) $("copybig").onclick = async () => { const ok = await copyText(bigLink()); $("copybig").textContent = ok ? "Copied" : "Select and copy it"; };
    if ($("gadd")) $("gadd").onclick = () => { const n = $("gname").value.trim(), p = (($("gphone") || {}).value || "").trim(), e = (($("gemp") || {}).value || "").trim(), v = vetRows(n || p || e ? [{ name: n, phone: p, empId: e }] : []); S.pp.form = { n, p, e }; if (v.junk.length) { S.pp.sum = String(v.junk[0].why || "").replace(/ It was left out\.$/, "") + " Fix it and press Add again."; return redraw(); } addPeople(v.ok, false, true); };
    all("[data-cols]", (b) => (b.onclick = () => { S.cols = b.dataset.cols; redraw(); }));
    if ($("rosterGo")) $("rosterGo").onclick = () => { const v = vetRows(parseList($("rosterTxt").value)); if (!v.ok.length) { S.pp.sum = v.junk.length ? v.junk[0].why : "Add a name and a number first."; return redraw(); } addPeople(v.ok); };
    if ($("gtemplate")) $("gtemplate").onclick = () => { const c = colsNow(), head = c === "mobile" ? "Name,Mobile" : c === "id" ? "Name,Employee ID" : "Name,Employee ID,Mobile"; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + head + "\r\n"], { type: "text/csv" })); a.download = "my-people.csv"; a.click(); };
    if ($("gpdf")) $("gpdf").onchange = async () => { const f = $("gpdf").files && $("gpdf").files[0]; if (!f) return; S.pdfRows = null; S.pdfJunk = 0; S.pdfJunkText = ""; S.pdfNote = "Reading your PDF..."; redraw(); try { await readListFile(f, "pdf"); const v = vetRows(parseList(await pdfText(f)).filter((r) => r.phone || r.empId || r.name)); S.pdfRows = v.ok; S.pdfJunk = v.junk.length; S.pdfJunkText = v.junk.length ? junkText(v.junk) : ""; S.pdfNote = !v.ok.length ? "We could not find any names and numbers in this PDF. Please save your list as a PDF from Excel (File, Save as, PDF), not as a photo or a scan." : v.junk.length > v.ok.length ? "Most of this file does not look like a list of names and numbers, so it was not used." : ""; if (v.junk.length > v.ok.length) S.pdfRows = null; } catch (e) { S.pdfNote = (e && e.message) || "We could not read this PDF."; } redraw(); };
    if ($("pdfno")) $("pdfno").onclick = () => { S.pdfRows = null; S.pdfNote = ""; redraw(); };
    if ($("pdfgo")) $("pdfgo").onclick = () => { const r = S.pdfRows || []; S.pdfRows = null; S.pdfNote = ""; addPeople(r); };
    if ($("gfile")) $("gfile").onchange = async () => { const f = $("gfile").files && $("gfile").files[0]; if (!f) return; if (S.pp.adding) { S.csvNote = "Still adding the last list. Please wait a moment, then choose your file again."; return redraw(); } S.csvNote = ""; let t = ""; try { t = await readListFile(f, "csv"); } catch (e) { S.csvNote = (e && e.message) || "We could not read this file."; return redraw(); } const v = vetRows(parseList(t)); if (!v.ok.length || v.junk.length > v.ok.length) { S.csvNote = !v.ok.length ? "We could not find any names and numbers in this file. Fill in the blank list, one person per row, save it as CSV and upload it again." + (v.junk.length ? " Left out: " + junkText(v.junk) : "") : "Most of this file does not look like a list of names and numbers, so it was not used. Left out: " + junkText(v.junk); return redraw(); } S.csvNote = v.junk.length ? v.junk.length + (v.junk.length === 1 ? " row was" : " rows were") + " left out: " + junkText(v.junk) + " Fix them in your file and upload it again, or add them one by one." : ""; addPeople(v.ok); };
    if ($("gcontacts")) $("gcontacts").onclick = async () => { if (S.pp.adding) { S.pp.sum = "Still adding the last list. Please wait a moment, then pick your contacts again."; return redraw(); } try { const got = await navigator.contacts.select(["name", "tel"], { multiple: true }); addPeople((got || []).map((c) => ({ name: (c.name || [])[0] || "", phone: (c.tel || [])[0] || "" }))); } catch { S.pp.sum = "Could not open your contacts. Please upload a file or add one person instead."; redraw(); } };
    all("[data-fix]", (b) => (b.onclick = () => { const i = Number(b.dataset.fix), w = S.pp.wrong[i], v = ($("fixin" + i) || {}).value; if (!w) return; if (S.pp.adding) { w.raw = v; S.pp.sum = "Still adding the last list. Please wait a moment, then press Fix and add again."; return redraw(); } if (!cleanPhone(v)) { w.raw = v; S.pp.sum = String(v || "").trim() ? "That number still looks wrong. Check the digits." : "Type the mobile number in the box first."; return redraw(); } S.pp.wrong.splice(i, 1); addPeople([{ name: w.name, phone: v, empId: w.empId }], true); }));
    all("[data-wa]", (a) => (a.onclick = () => { markSent(a.dataset.wa); setTimeout(redraw, 0); }));
    all("[data-resend]", (b) => (b.onclick = async () => {
      if (b.disabled) return; b.disabled = true; /* one press: a second would make another new link and stop the first */ const id = b.dataset.resend;
      try { const r = await call("POST", `/api/z/${eid}/people/${encodeURIComponent(id)}/resend`, {}); delete S.pp.sent[id]; ls.set(sentKey(), JSON.stringify(S.pp.sent)); (S.pp.fresh || (S.pp.fresh = {}))[id] = 1; S.pp.sum = "A new link is ready. The old one has stopped. Press Send on WhatsApp next to their name."; } catch (e) { S.pp.sum = friendly(e); }
      await loadPeople(); lastHtml = ""; redraw(); // the same words twice draw the same page: build the button again
    }));
    all("[data-rmask]", (b) => (b.onclick = () => { S.pp.confirm = b.dataset.rmask; redraw(); }));
    all("[data-rmno]", (b) => (b.onclick = () => { S.pp.confirm = ""; redraw(); }));
    all("[data-rm]", (b) => (b.onclick = async () => {
      try { await call("POST", `/api/z/${eid}/people/${encodeURIComponent(b.dataset.rm)}/remove`, { withTheirPeople: b.dataset.with === "1" }); S.pp.sum = "Removed."; } catch (e) { S.pp.sum = friendly(e); }
      S.pp.confirm = ""; await loadPeople(); redraw();
    }));
    all("[data-decide]", (b) => (b.onclick = async () => {
      const id = b.dataset.wid, d = b.dataset.decide, w = (S.pp.waiting || []).find((x) => String(x.id) === id);
      try { await call("POST", `/api/z/${eid}/waiting/${encodeURIComponent(id)}`, { decision: d }); if (w) S.pp.decided.unshift({ name: firstName(w.firstName || w.name), last4: last4Of(w), decision: d, by: "you", ms: Date.now() }); S.pp.sum = d === "admit" ? "Let in." : "Declined."; } catch (e) { S.pp.sum = friendly(e); }
      await loadPeople(); redraw();
    }));
    if ($("brandlogo")) $("brandlogo").onchange = async () => {
      const f = $("brandlogo").files && $("brandlogo").files[0]; if (!f) return;
      if (!/^image\/(png|jpeg|webp)$/.test(f.type || "")) { S.logoNote = "Please choose a PNG, JPEG or WebP picture."; return redraw(); }
      if (f.size > 5 * 1024 * 1024) { S.logoNote = "That picture is bigger than 5 MB. Please choose a smaller one."; return redraw(); }
      try { S.f.brand.logo = await fitLogo(f); S.logoNote = ""; clearToast(); S.unsaved[4] = true; /* only a picture that was really taken is a change */ } catch (e) { S.logoNote = e && e.message === "small" ? "That picture is too small. It must be at least 64 x 64 pixels." : e && e.message === "thin" ? "That picture is too long and thin. It may be at most 4 times wider than tall." : "We could not use that picture. Try a smaller or simpler one."; }
      redraw();
    };
    if ($("logorm")) $("logorm").onclick = () => { edited(); S.f.brand.logo = ""; S.logoNote = ""; redraw(); };
    if ($("copypaylink")) $("copypaylink").onclick = async () => { if (S.payBusy) return; if (S.payUrl) { S.payCopied = await copyText(S.payUrl); S.payLinkNote = PAYNOTE(S.payCopied); return redraw(); } S.payBusy = true; redraw(); /* same link again: a new one stops the one already sent */
      try { const r = await call("POST", `/api/z/${eid}/paylink`, {}); S.payUrl = r.url || ""; S.payCopied = S.payUrl ? await copyText(S.payUrl) : false; S.payLinkNote = S.payUrl ? PAYNOTE(S.payCopied) : "We could not make the link. Please try again."; }
      catch (e) { S.payUrl = ""; S.payLinkNote = friendly(e); } S.payBusy = false;
      redraw();
    };
    if ($("admitall")) $("admitall").onclick = () => { S.pp.bulk = "admit"; redraw(); };
    if ($("declineall")) $("declineall").onclick = () => { S.pp.bulk = "decline"; redraw(); };
    if ($("bulkno")) $("bulkno").onclick = () => { S.pp.bulk = ""; redraw(); };
    if ($("bulkyes")) $("bulkyes").onclick = async () => {
      const d = S.pp.bulk; S.pp.bulk = ""; $("bulkyes").disabled = true; S.pp.still = "";
      try {
        const r = await call("POST", `/api/z/${eid}/waiting/all`, { decision: d }), n = Number(d === "admit" ? r.admitted : r.declined) || 0, st = Number(r.stillWaiting) || 0;
        S.pp.sum = d === "admit" ? `${n} ${n === 1 ? "person" : "people"} let in.` : `${n} declined.`;
        if (st) S.pp.still = r.message || `${st} still waiting: the game is full. Remove someone or ask for a bigger pack, then let them in.`;
      } catch (e) { S.pp.sum = friendly(e); }
      await loadPeople(); redraw();
    };
    if ($("copycommon")) $("copycommon").onclick = async () => { const ok = await copyText(commonLink()); $("copycommon").textContent = ok ? "Copied" : "Select and copy it"; };
    if ($("dlpeople")) $("dlpeople").onclick = async () => {
      let text = ""; try { const r = await fetch(BASE + `/api/z/${eid}/people/export`, { headers: { "x-organizer": secret } }); if (!r.ok) throw new Error("no export"); text = await r.text(); } catch { text = localCsv(); }
      try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = eid + "-my-people.csv"; a.click(); } catch { /* the browser could not save it */ }
    };
    if ($("myph")) $("myph").oninput = () => { S.myPhone = $("myph").value; };
    const mineErr = (e) => { if (e.status === 400 && (e.code === "need-phone" || /mobile/i.test(e.message))) { S.pp.meNeed = true; S.pp.mineNote = "Type your own mobile number, then press the button again."; } else S.pp.mineNote = friendly(e); };
    const typedMine = () => { const t = $("myph") ? $("myph").value.trim() : ""; if (t) S.myPhone = t; return t; };
    if ($("playnow")) $("playnow").onclick = async () => {
      let w = null; try { w = window.open("", "_blank"); if (w) w.opener = null; } catch { /* the pop-up was blocked */ }
      S.pp.mineNote = "";
      try { const t = typedMine(); if (t && !cleanPhone(t)) throw Object.assign(new Error("That number looks wrong. Please check it."), { status: 0 }); const me = await ensureMe(t); if (w) w.location.href = me.link; else window.open(me.link, "_blank", "noopener"); }
      catch (e) { if (w) { try { w.close(); } catch { /* fine */ } } mineErr(e); }
      redraw();
    };
    if ($("sendmine")) $("sendmine").onclick = async () => {
      S.pp.mineNote = "";
      try { const t = typedMine(); if (t && !cleanPhone(t)) throw Object.assign(new Error("That number looks wrong. Please check it."), { status: 0 }); const me = await ensureMe(t); if (me && me.waLink) { try { window.open(me.waLink, "_blank", "noopener,noreferrer"); } catch { /* blocked */ } S.pp.mineNote = "Your play link is on its way to your WhatsApp."; } else { S.pp.meNeed = true; S.pp.mineNote = "Type your own mobile number, then press the button again."; } }
      catch (e) { mineErr(e); }
      redraw();
    };
    const guestTool = async (k, path, box, doing, done, reload) => { if (S.gtBusy) return; const ph = (($(box) || {}).value || ""); if (k === "pd") S.gtPh = ph; else S.gtUb = ph; S.gtBusy = true; try { S.gtNote = { k, t: doing }; redraw(); const r = await call("POST", `/api/z/${eid}/${path}`, { phone: ph }); S.gtNote = { k, t: done(r) }; if (reload) await loadPeople(); } catch (e) { S.gtNote = { k, t: e.message }; } S.gtBusy = false; redraw(); }; /* a note under the buttons at once ("Looking..."), one press at a time, and the number box keeps what was typed */ if ($("pdsee")) $("pdsee").onclick = () => guestTool("pd", "person", "pdph", "Looking...", (r) => `Ticket ${r.seat}${r.name ? ", " + r.name : ""}${r.role ? ", " + r.role : ""}. We hold only their name and number.`);
    if ($("pddel")) $("pddel").onclick = async () => { if (!(await askSure("Delete this player's data?", "Their name and number are deleted now. This cannot be undone.", "Yes, delete it", "No, keep it"))) return; guestTool("pd", "forget", "pdph", "Deleting...", () => "Done. Their data is deleted.", true); };
    if ($("unbind")) $("unbind").onclick = () => guestTool("ub", "unbind", "ubph", "Working...", () => "Done. The next phone they join with keeps their ticket.");
    // game day
    all("[data-chip]", (b) => (b.onclick = () => { const t = $("annText"); if (t) { t.value = b.dataset.chip; t.dispatchEvent(new Event("input", { bubbles: true })); } })); /* the chip text counts as typed; no keyboard hides Send */
    if ($("annSend")) $("annSend").onclick = async () => {
      if (S.annBusy) return; const t = ($("annText").value || "").trim(); if (!t) { S.annNote = "Write a message first."; return redraw(); } S.annBusy = true; S.annDraft = t; S.annNote = ""; redraw();
      try { await call("POST", `/api/z/${eid}/announce`, { text: t }); S.annDraft = ""; S.annNote = "Sent. Phones show and speak it within about a minute."; } catch (e) { S.annNote = e.message; } S.annBusy = false; redraw();
      refreshEng();
    };
    if ($("annClear")) $("annClear").onclick = async () => { if (S.annBusy) return; S.annBusy = true; redraw(); try { await call("POST", `/api/z/${eid}/announce`, { text: "" }); S.annNote = "Message cleared."; } catch (e) { S.annNote = e.message; } S.annBusy = false; redraw(); refreshEng(); };
    if ($("startnow")) $("startnow").onclick = async () => { // manual start: one press, signed like every other control
      if (S.starting) return;
      S.starting = true; S.startNote = ""; redraw();
      try { const r = await TBControl.publish(eid, { token: secret, base: BASE, prefix: "/api/z" }, "go"); S.startNote = r.status === 200 ? "" : ctlWords({ message: (r.data && r.data.error) || "That press did not go through. Please press Start again." }); } catch (e) { S.startNote = ctlWords(e); }
      S.starting = false;
      refreshEng();
    };
    if ($("nextnum")) $("nextnum").onclick = async () => { // host mode: one press = one number, released 6 seconds later from the public random beacon
      if (S.pressing) return;
      if (S.control && S.control.stopped) { S.nextNote = ctlWords({ message: "already stopped" }); return redraw(); }
      const nexts = (S.st && S.st.nextRounds) || [];
      if (S.control && S.control.pausedNow) { S.nextNote = ZG.NEXT_REFUSALS.paused; return redraw(); }
      if (nexts.length && (S.now === null || nexts[nexts.length - 1] > S.now)) { S.nextNote = ZG.NEXT_REFUSALS.order; return redraw(); }
      S.pressing = true; S.nextNote = ""; redraw();
      try { const r = await TBControl.publish(eid, { token: secret, base: BASE, prefix: "/api/z" }, "next"); S.nextNote = r.status === 200 ? "" : ctlWords({ message: (r.data && r.data.error) || ZG.NEXT_REFUSALS.lead }); } catch (e) { S.nextNote = ctlWords(e); }
      S.pressing = false;
      refreshEng();
    };
    all("[data-ctl]", (b) => (b.onclick = async () => {
      const action = b.dataset.ctl;
      if (S.ctlBusy) return; if (action === "pause" && !(await askSure("Are you sure? Numbers stop for everybody.", "The game pauses on every phone and on the big screen until you press Resume. It ends by itself after 30 minutes.", "Yes, pause the game", "No, keep playing", null, "I understand: the numbers stop for every player until I press Resume."))) return; if (action === "stop" && !(await askSure("End the game for everyone?", "Every guest's phone stops at the same number. This cannot be undone.", "Yes, end the game for everyone", "No, keep playing"))) return; S.ctlBusy = true; S.ctlNote = ""; redraw();
      try { const r = await Promise.race([TBControl.publish(eid, { token: secret, base: BASE, prefix: "/api/z" }, action, action === "pause" ? { pauseForRounds: 600 } : action === "extend" ? { addRounds: 600 } : {}), new Promise((_, no) => setTimeout(() => no(new Error("Failed to fetch")), 30000))]); S.ctlNote = r.status === 200 ? CTL_SENT[action](leadSec()) : ctlWords({ message: (r.data && r.data.error) || "Not accepted" }); } catch (e) { S.ctlNote = ctlWords(e); } S.ctlBusy = false; /* frees the buttons after 30 s */
      refreshEng();
    }));
    all("[data-ovopen]", (b) => (b.onclick = () => { const i = Number(b.dataset.ovopen); S.ovOpen = S.ovOpen === i ? null : i; redraw(); }));
    all("[data-ov]", (b) => (b.onclick = async () => {
      const p = (S.prizes || [])[Number(b.dataset.ov)]; if (!p) return; const j = Number(b.dataset.ovj), c = j >= 0 && Array.isArray(p.claimants) ? p.claimants[j] : null;
      try { await call("POST", `/api/z/${eid}/override`, { round: p.round, pattern: p.pattern, ordinal: p.ordinal, seat: c ? c.seat : null }); S.note = c ? "Winner changed." : "Nobody wins this prize now."; S.ovOpen = null; } catch (e) { S.note = e.message; }
      refreshEng();
    }));
    all("[data-given]", (c) => (c.onchange = async () => {
      const p = (S.prizes || [])[Number(c.dataset.given)]; if (!p) return;
      try { await call("POST", `/api/z/${eid}/prizegiven`, { round: p.round, pattern: p.pattern, ordinal: p.ordinal, seat: p.seat, given: c.checked }); S.note = c.checked ? "Marked as given." : "Tick removed."; } catch (e) { S.note = e.message; }
      refreshEng();
    }));
    if ($("csv")) $("csv").onclick = async () => {
      await namesFor([...new Set(S.settledPreview.flatMap((x) => x.pids))]); const nm = S.nameCache;
      const rows = [["Reward", "Call number", "Participant"]];
      for (const s of S.settledPreview) for (const p of s.pids) rows.push([lineLabel(s), s.idx + 1, nm.get(p) || p]);
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(",")).join("\n")], { type: "text/csv" })); a.download = eid + "-rewards.csv"; a.click();
    };
    all("[data-mkrole]", (b) => (b.onclick = () => { S.mkrole = b.dataset.mkrole; redraw(); }));
    if ($("mark")) $("mark").onclick = async () => { try { await call("POST", `/api/z/${eid}/mark`, { phone: $("mkph").value, role: S.mkrole }); S.note = "Marked."; } catch (e) { S.note = e.message; } refreshEng(); };
    // after the game
    if ($("rptnew")) $("rptnew").onclick = async () => { let w = null; if (!(await askSure("Make a new report link?", "The old link, including the one in your e-mail, stops working at once.", "Yes, make a new link", "No, keep the old link", () => { w = reportOpener(); }))) return; S.reportUrl = ""; S.rptNote = ""; try { const r = await call("POST", `/api/z/${eid}/reportlink`, {}); if (r.url) reportShow(w, r.url, true); else reportFail(w, new Error("The new report link is not ready yet. Please try again in a minute.")); } catch (e) { reportFail(w, e); } refreshEng(); };
    if ($("rptopen")) $("rptopen").onclick = async () => { const w = reportOpener(); S.reportUrl = ""; S.rptNote = ""; try { const r = await call("GET", `/api/z/${eid}/reportlink`); if (r.url) reportShow(w, r.url, false); else reportFail(w, new Error("The report is not ready yet. Please try again in a few minutes.")); } catch (e) { reportFail(w, e); } redraw(); };
    if ($("erase")) $("erase").onclick = async () => {
      const startMs = (S.info && S.info.startMs) || 0, endMs = S.life && S.life.personalDeleteAtMs ? S.life.personalDeleteAtMs - 20 * 3600000 : 0, nowMs = Date.now();
      const warn = startMs && nowMs < startMs + 120000 ? "YOUR GAME HAS NOT STARTED YET.\n\nIf you delete the participant data now, everyone who has already joined loses their ticket, seat and invitation, the people you added are removed, and anyone waiting is dropped. They will have to join again and get new tickets. The report of this game will have no guest details.\n\nOnly do this if you want to start the guest list again. This cannot be undone. The winners record stays.\n\nDelete all participant data now?"
        : endMs && nowMs < endMs ? "YOUR GAME IS STILL RUNNING.\n\nIf you delete the participant data now, players lose their tickets in the middle of the game, claims and prizes can no longer be settled for them, and the report will have no guest details.\n\nOnly do this if you are stopping the game for good. This cannot be undone. The winners record stays.\n\nDelete all participant data now?"
        : "Every participant's name and mobile number will be deleted. This cannot be undone. The winners record stays.";
      if (!(await askSure("Delete all participant data now?", warn.replace(/\n\nDelete all participant data now\?$/, ""), "Yes, delete the names and numbers", "No, keep them"))) return; try { const r = await call("POST", `/api/z/${eid}/erase`, {}); S.near = { id: "erase", t: r.erased === 1 ? "1 participant erased." : r.erased + " participants erased." }; } catch (e) { S.near = { id: "erase", t: friendly(e) }; } refreshEng(); };
    if ($("reqok")) $("reqok").onclick = async () => {
      const r = S.reqs[0];
      if (r.action === "erase") { // your confirmation is what deletes, not the AI's request
        if (!(await askSure("Delete all participant data now?", "Every participant's name and mobile number will be deleted. This cannot be undone. The winners record stays.", "Yes, delete the names and numbers", "No, keep them"))) return;
        try { const x = await call("POST", `/api/z/${eid}/erase`, {}); S.note = x.erased + " participants erased."; await call("POST", `/api/z/${eid}/control/request/clear`, {}); } catch (e) { S.note = e.message; }
        return refreshEng();
      }
      try { const x = await TBControl.publish(eid, { token: secret, base: BASE, prefix: "/api/z" }, r.action, r.action === "pause" ? { pauseForRounds: 600 } : {}); S.ctlNote = x.status === 200 ? r.action + " sent." : ctlWords({ message: (x.data && x.data.error) || "Not accepted" }); await call("POST", `/api/z/${eid}/control/request/clear`, {}); } catch (e) { S.ctlNote = ctlWords(e); }
      refreshEng();
    };
    if ($("reqno")) $("reqno").onclick = async () => { try { await call("POST", `/api/z/${eid}/control/request/clear`, {}); } catch {} refreshEng(); };
    // history and the account
    all("[data-hist]", (b) => (b.onclick = () => { S.showHist = !S.showHist; redraw(); }));
    all("[data-realpack]", (b) => (b.onclick = () => { S.realPack = Number(b.dataset.realpack); redraw(); }));
    all("[data-clonebtn]", (b) => (b.onclick = async () => { if (b.dataset.people === undefined && !S.pp.list && !(S.people || []).length) { try { await loadPeople(); } catch { /* the panel then asks the old way */ } } const from = b.dataset.from || eid; S.clone = { from, hasPeople: b.dataset.people !== undefined ? b.dataset.people === "1" : hasOldPeople(), withPeople: false, err: "" }; redraw(); go("clonepanel"); }));
    if ($("clonepeople")) $("clonepeople").onchange = () => { S.clone.withPeople = $("clonepeople").checked; redraw(); };
    if ($("cloneno")) $("cloneno").onclick = () => { S.clone = null; redraw(); };
    if ($("clonego")) $("clonego").onclick = async () => {
      const K = S.clone; K.busy = true; K.err = ""; redraw();
      try {
        const r = await call("POST", `/api/z/${K.from}/clone`, { ...(K.hasPeople && K.withPeople ? { withPeople: true } : {}) });
        eid = r.id; history.replaceState(null, "", "?e=" + encodeURIComponent(r.id) + (BASE ? "&api=" + encodeURIComponent(BASE) : ""));
        S.store = null; S.f = null; S.fFor = ""; S.unsaved = {}; S.touched = {}; S.openInit = ""; S.cfg = null; S.info = null; S.sum = null; S.life = null; S.people = []; S.pp.list = null; S.pp.sentFor = ""; S.cancel = null; S.cancelDone = false; S.creditMsg = ""; S.screen = "eng";
        S.clone = null; S.cloneNew = r.id; S.cloneDated = ""; S.note = "Your new game is ready to check. Pick the date and time, then publish.";
        refreshTeam(); refreshEng();
      } catch (e) { K.busy = false; K.err = e.status === 404 ? "This is not switched on yet. Please try again a little later." : friendly(e); redraw(); }
    };
    if ($("usecredit")) $("usecredit").onclick = async () => {
      S.creditErr = ""; $("usecredit").disabled = true;
      try { const r = await call("POST", `/api/z/${eid}/pay-with-credit`, {}); S.creditMsg = r.paid ? `Paid with your credit: ${money(r.usedInr)}. The game is on.` : `${money(r.usedInr)} of your credit is used for this game. Pay the rest: ${money(r.toPayInr)}`; }
      catch (e) { S.creditErr = friendly(e); lastHtml = ""; }
      refreshEng();
    };
    all("[data-del-draft]", (b) => (b.onclick = async () => { // a draft nobody published: two taps, then it is gone and its place is free again
      const id = b.dataset.delDraft; if (S.delArm !== id) { S.delArm = id; return redraw(); }
      S.delArm = ""; try { await call("POST", `/api/z/${id}/discard`, {}); S.note = "Draft deleted."; } catch (e) { S.note = friendly(e); } await refreshHome(); redraw();
    }));
    all("[data-open-game]", (b) => (b.onclick = () => { S.note = ""; S.toast = ""; S.deadLink = false; if (S.clone && S.clone.from !== b.dataset.openGame) S.clone = null; /* a panel made for another game must not follow the person into this one */ eid = b.dataset.openGame; S.store = null; S.f = null; S.fFor = ""; S.unsaved = {}; S.touched = {}; S.openInit = ""; S.cfg = null; S.info = null; refreshTeam(); refreshEng(); }));
    all("[data-reuse]", (b) => (b.onclick = async () => {
      try { // a new game that starts with the earlier roster already on it
        const now = await latestRound(); const id = randId();
        const old = S.history.engagements.find((e) => e.id === b.dataset.reuse);
        await call("POST", "/api/z", { id, startRound: now + 20 * 20, callSeconds: 12, cap: Math.max(old.participants + 50, 500) });
        const r = await call("POST", `/api/z/${id}/reuse`, { from: b.dataset.reuse });
        await TBControl.ensureKey(id, { token: secret, base: BASE, prefix: "/api/z" });
        eid = id; history.replaceState(null, "", "?e=" + id); S.store = null; S.f = null; S.fFor = ""; S.unsaved = {}; S.touched = {}; S.openInit = ""; S.cfg = null; S.info = null; S.screen = "eng";
        S.note = `Created with ${r.copied} participants from the earlier game. It starts in 20 minutes; participants use the new link.`; refreshEng();
      } catch (e) { noteAndDraw(e.message); }
    }));
    all("[data-retirekey]", (b) => (b.onclick = async () => { if (!(await askSure("Retire this key?", "It will stop working at once.", "Yes, retire it", "No, keep it"))) return; try { await call("POST", "/api/org/keys/revoke", { id: b.dataset.retirekey }); S.note = "Key retired."; } catch (e) { S.note = e.message; } eid ? loadAccount() : refreshHome(); }));
    if ($("aiaudit")) $("aiaudit").onclick = async () => { try { S.aiTrail = (await call("GET", "/api/org/ai/audit")).trail || []; } catch (e) { S.note = e.message; } redraw(); };
    if ($("closeacct")) $("closeacct").onclick = async () => {
      if (!(await askSure("Close your account?", "Your account and all your games are deleted now. This cannot be undone.", "Yes, close my account", "No, keep it"))) return;
      try { await call("POST", "/api/org/close", { confirm: true }); try { sessionStorage.clear(); } catch {} location.href = "/"; } catch (e) { noteAndDraw(e.message); }
    };
    const newLink = async (path, ask) => {
      if (ask && !(await askSure("Are you sure?", ask, "Yes", "No"))) return;
      try { const r = await call("POST", path, {}); S.aiMsg = r.aiMessage; ss.set("ctz-aimsg", r.aiMessage); S.note = r.mailed ? "Your new AI work link is ready. The old links have stopped. A fresh 24-hour link is on its way to your e-mail." : "Your new AI work link is ready and the old one has stopped. Copy it from the box in your account (we have no e-mail address on file to send it to)."; } catch (e) { S.note = e.message; }
      S.acctOpen = true; redraw();
    };
    if ($("aimake")) $("aimake").onclick = () => newLink("/api/org/ai/replace");
    if ($("aistripmake")) $("aistripmake").onclick = () => newLink("/api/org/ai/replace");
    if ($("aifresh")) $("aifresh").onclick = async () => { try { const r = await call("POST", "/api/org/ai/fresh", {}); S.note = r.mailed ? "A fresh 24-hour AI link is on its way to your e-mail. Never forward that e-mail." : "We have no e-mail address to send it to. Use the link in the box in your account."; } catch (e) { S.note = e.message; } redraw(); };
    if ($("aireplace")) $("aireplace").onclick = () => newLink("/api/org/ai/replace", "Replace your AI work link? The old link stops working at once, even if an AI is using it right now.");
    if (S.aiMsg) wireAiOptions(document, S.aiMsg);
    if ($("aicopy")) $("aicopy").onclick = async () => { if (await copyText(S.aiMsg)) $("aicopy").textContent = "Copied. Now paste it into your AI chat"; };
    if ($("aistripcopy")) $("aistripcopy").onclick = async () => { if (await copyText(S.aiMsg)) $("aistripcopy").textContent = "Copied. Paste it into your AI chat"; };
    if ($("airevoke")) $("airevoke").onclick = async () => { try { await call("POST", "/api/org/ai/revoke", {}); S.aiMsg = ""; ss.set("ctz-aimsg", ""); S.note = "Your AI work link has been stopped."; } catch (e) { S.note = e.message; } redraw(); };
    if ($("qk-save")) { $("qk-save").onclick = quickSave; quickSummary(); }
    if ($("setupsend")) $("setupsend").onclick = () => { const v = $("setupemail").value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { S.setupMsg = "Please type your e-mail."; return redraw(); } if (!CBConsent.all($app, "K5")) { S.setupMsg = "Please tick the box to continue."; return redraw(); } setupStep("/api/host/setup/email", { email: v, consent: CBConsent.payload($app, "K5") }, true); };
    if ($("roleacceptgo")) $("roleacceptgo").onclick = async () => {
      if (!CBConsent.all($app, "K5")) { S.roleErr = "Please tick the box to continue."; return redraw(); }
      try { await call("POST", "/api/org/role/accept", { consent: CBConsent.payload($app, "K5") }); S.roleErr = ""; await refreshCohost(); } catch (e) { S.roleErr = friendly(e); redraw(); }
    };
    for (const fid of ["setupemail", "setupcode", "setupmobile"]) { const el = $(fid); if (el) el.oninput = () => { (S.sv = S.sv || {})[fid] = el.value; }; } // what a Host has typed survives any redraw of the page (a tap on the button could land just after one)
    if ($("setupverify")) $("setupverify").onclick = () => { const v = $("setupcode").value.trim(); if (!/^\d{6}$/.test(v)) { S.setupMsg = "The code has 6 digits."; return redraw(); } setupStep("/api/host/setup/email/verify", { code: v }); };
    if ($("setupmobilego")) $("setupmobilego").onclick = () => { const v = $("setupmobile").value.trim(); if (!cleanPhone(v)) { S.setupMsg = "Please check your mobile number."; return redraw(); } setupStep("/api/host/setup/mobile", { mobile: v }); };
    if ($("gbtn")) mountGoogle(secret ? "host" : "signin");
  }

  // TEST mode (owner-controlled, see docs/TEST_AND_LIVE_MODE.md): a calm notice in the organizer console ONLY. Public pages, participant phones and e-mails never carry it.
  (async () => { try { const m = await (await fetch(BASE + "/api/mode", { cache: "no-store" })).json(); if (m && m.mode === "TEST" && !document.getElementById("testmode")) { const b = document.createElement("div"); b.id = "testmode"; b.className = "ztest"; b.setAttribute("role", "status"); b.textContent = "TEST MODE: nothing here is real. No one outside the owner’s test list is e-mailed, and nothing is charged."; const app = document.getElementById("app"); app.parentNode.insertBefore(b, app); } } catch (e) { /* no banner when the mode cannot be read */ } })();
  let inited = false;
  async function bootstrap() {
    inited = true;
    if (secret) { try { const wh = await call("GET", "/api/whoami"); S.kind = wh.kind || ""; S.email = wh.email || ss.get("ctz-login-email") || ss.get("ctz-email") || "";  } catch { /* an old or wrong key is handled by the screens below */ } if (!isOrg()) S.shield = false; } // only the Organizer has the AI helper switch
    loadPacks(); loadAuthConfig();
    if (!secret) return redraw();
    const r = role();
    if (r === "host") { try { S.setup = await call("GET", "/api/host/setup"); } catch { S.setup = null; } if (S.setup && S.setup.ready === false) return redraw(); } // an older server has no Finish setup: the Host goes straight in
    if (r === "partner") return redraw();
    if (r === "cohost") { if (eid) return refreshCohost(); return redraw(); }
    if (!eid && !QUICK && !NEWDEMO && !NEWGAME && (r === "organizer" || r === "host") && LAST && LAST.eid && LAST.role === r) { eid = LAST.eid; S.restored = true; history.replaceState(null, "", "?e=" + encodeURIComponent(eid) + (BASE ? "&api=" + encodeURIComponent(BASE) : "")); } // back to the game they were in
    if (r === "host" && !eid) { try { S.history = await call("GET", "/api/history"); } catch { S.history = null; } const gs = (S.history && S.history.engagements) || []; if (gs.length === 1) { eid = gs[0].id; refreshTeam(); return refreshEng(); } return redraw(); } // a Host with one game goes straight in; with several they pick
    if (isOrg()) { await redeemPass(); if (eid && S.passMsg && /ready/.test(S.passMsg)) S.passMsg += " Your game is already made: open its last step and press Publish, no payment is needed."; } // a demo link opened while she is taken straight back into her game must still be used (found with a real prospect: the link was only used on the home screen)
    refreshTeam();
    if (eid) refreshEng();
    else if (CREATE && isOrg() && !S.createdOnce) { S.createdOnce = true; try { await startNew(); } catch (e) { S.note = friendly(e); refreshHome(); } }
    else if (QUICK) { S.screen = "quick"; S.f = quickDefault(); await loadPacks(); { const want = Number(q.get("cap") || (() => { try { return sessionStorage.getItem("ctz-cap"); } catch { return 0; } })()); if (want > 0 && capOptions().some((p) => p.n === want)) { S.f.cap = String(want); S.f.demo = want <= DEMO_CAP ? "1" : "0"; } } redraw(); }
    else refreshHome();
  }
  if (bc) bc.onmessage = async (e) => { // another tab offers its key: use it only if it really works (an old or foreign key is ignored)
    const d = e.data || {};
    if (d.ask && secret && (S.kind === "" || S.kind === "master" || S.kind === "ai")) bc.postMessage({ key: secret });
    else if (d.key && !secret && !inited) { try { const r = await fetch(BASE + "/api/whoami", { headers: { "x-organizer": String(d.key) } }); if (r.ok && !secret && !inited) { secret = String(d.key); ss.set("ctz-org", secret); bootstrap(); } } catch { /* offline: ignore */ } }
  };
  (async () => { if (!secret && bc) { bc.postMessage({ ask: true }); await new Promise((r) => setTimeout(r, 350)); } if (!inited) bootstrap(); })();
  let tickBusy = false, tickAt = 0; setInterval(() => { if (tickBusy && Date.now() - tickAt < 60000) return; const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; /* never wipe what the organizer is typing */ if (!secret || document.hidden) return; if (role() === "host" && S.setup && S.setup.ready === false) return; let p = null; if (eid) p = refreshEng(); else if (QUICK || S.screen === "quick") return; else if (isOrg()) p = refreshHome(); if (p && typeof p.finally === "function") { tickBusy = true; tickAt = Date.now(); p.finally(() => { tickBusy = false; }); } }, 5000);
  // ---- the claim signal in the Organizer's console (1.6.0): a few digits asked every 2 s while the Game day view is in front; when it moves, new claims show as calm pop-ups (ticket numbers only)
  { const BEAT = { cv: -1, init: false, seen: new Set() };
    const note = (text) => { let box = document.getElementById("claimtoasts"); if (!box) { box = document.createElement("div"); box.id = "claimtoasts"; box.setAttribute("role", "status"); box.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:8px;z-index:50;display:grid;gap:6px;width:min(92vw,520px);pointer-events:none"; document.body.appendChild(box); } const d = document.createElement("div"); d.style.cssText = "background:#14233f;color:#fff;border-radius:12px;padding:10px 14px;box-shadow:0 8px 20px -10px rgba(0,0,0,.6)"; d.textContent = text; box.appendChild(d); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => d.remove(), 6000); };
    const news = async () => { try { const c = await call("GET", "/api/z/" + eid + "/claims"); for (const x of (c && c.claims) || []) { const id = x.pid + "|" + x.pattern + "|" + (x.bogey ? "b" : x.idx) + "|" + x.atMs; if (BEAT.seen.has(id)) continue; BEAT.seen.add(id); if (BEAT.init) { const tk = parseInt(String(x.pid), 10); note(ZG.say(x.bogey ? "claim.w" : "claim.k", { t: tk, p: NAMES[x.pattern] || x.pattern })); } } BEAT.init = true; } catch { /* the 5 s refresh still brings the news */ } };
    setInterval(async () => { if (document.hidden || !eid || !S.started || !document.getElementById("livebar") || (S.info && S.info.rehearsal && S.info.rehearsal.over)) return; try { const r = await call("GET", "/api/z/" + eid + "/presence"); const was = S.pres && S.pres.listening; S.pres = r; if (r && r.listening !== was) redraw(); } catch { /* the line simply stays as it was */ } }, 30000);
    setInterval(async () => { if (document.hidden || !eid || !document.getElementById("livebar") || (S.info && S.info.rehearsal && S.info.rehearsal.over)) return; try { if (!BEAT.init) await news(); const r = await fetch((BASE || "") + "/api/z/" + eid + "/cv", { cache: "no-store" }); const n = Number((await r.text()).trim()); if (Number.isFinite(n)) { if (BEAT.cv >= 0 && n > BEAT.cv) await news(); BEAT.cv = n; } } catch { /* try again */ } }, 2200); }
  window.__zc = S; window.__zcMode = (m) => { S.mode = m; redraw(); }; // the page tests reach the plain-text list path through this
})();
