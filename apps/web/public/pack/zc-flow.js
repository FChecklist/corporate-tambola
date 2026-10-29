/* The NEW organizer flow, shared by every game (option only: open /zc.html?flow=new). Five steps and a Game dashboard.
   The current console (zc.js) is not touched: it stands aside when flow=new is in the address. Words follow docs 191 (language guide).
   Pure rules live in window.ZFLOW (tested); the page code below only draws them.
   The pack holds no game rules: each game says what it has in its own small zc-flow-game.js (window.ZFLOW_GAME). */
(function () {
  "use strict";
  /** What this game says about itself (zc-flow-game.js). Nothing here is a game rule: the prize list comes from the game's own table (ZG.PRIZE_HOUSES). */
  const G = Object.assign({ brand: "Corporate Games", tickets: [1, 2], bumper: false, boardMax: 90, boardCols: 10, boardTitle: "GAME", sample: true, board: true, claims: true, popular: [], recommended: [] }, (typeof window !== "undefined" && window.ZFLOW_GAME) || {});
  const COPY = {
    top: "No personal details needed. All game and participant information is deleted within 24 hours of the game.",
    soon: "Coming soon",
    dash: "Game dashboard",
    dashLocked: "Opens after you publish",
    next: "Next",
  };
  const STEPS = [
    { n: 1, id: "when", name: "Date and time" },
    { n: 2, id: "who", name: "Who is this game for" },
    { n: 3, id: "prizes", name: "Tickets and prizes" },
    { n: 4, id: "brand", name: "Brand & Breaks", optional: true },
    { n: 5, id: "publish", name: "Check and publish" },
  ];
  /** A step can be opened when every earlier required step is done. Brand & Breaks is optional, so it never blocks step 5. */
  function canOpen(n, done) {
    for (const s of STEPS) { if (s.n >= n) break; if (!s.optional && !done[s.n]) return false; }
    return true;
  }
  /** The next step to scroll to after a step is saved (the first step not yet done, after n). */
  function nextAfter(n, done) {
    for (const s of STEPS) if (s.n > n && !done[s.n]) return s.n;
    return 0;
  }
  /** The Game dashboard stays locked until the game is published. */
  const dashboardOpen = (info) => !!info && info.published === true;
  /** Words banned by the language guide in anything the organizer reads. */
  const BANNED = [/\binvit/i, new RegExp("\\bpriv" + "ate\\b", "i"), /\bwe\b/i, /\bRs\.?\s?\d/, /\bseats?\b/i, /\bplaces\b/i, /in the office/i, /\bcash\b/i];
  const badWords = (text) => BANNED.filter((r) => r.test(text)).map(String);
  /* ---- Step 1: date, time and zone (pure) ---- */
  const OCC = ["Diwali party", "Dealer meet", "Annual day", "Team party", "Customer event", "Family day", "Weekend Fun", "Christmas Party", "Eid Party", "Holi Party", "Other"];
  const ZONES = [
    { id: "Asia/Kolkata", label: "India (IST)" }, { id: "Asia/Dubai", label: "Dubai" }, { id: "Asia/Singapore", label: "Singapore" },
    { id: "Europe/London", label: "London" }, { id: "America/New_York", label: "New York" }, { id: "America/Los_Angeles", label: "Los Angeles" }, { id: "Australia/Sydney", label: "Sydney" },
  ];
  const OTHER_ZONE = "other";
  const validZone = (z) => { try { new Intl.DateTimeFormat("en", { timeZone: z }); return true; } catch { return false; } };
  /** What a clock in `zone` reads at `ms`, as numbers. */
  function partsIn(ms, zone) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
  }
  /** The moment (ms) when the wall clock in `zone` reads dateStr (YYYY-MM-DD) and timeStr (HH:MM). */
  function wallToMs(dateStr, timeStr, zone) {
    const [y, mo, d] = dateStr.split("-").map(Number), [h, mi] = timeStr.split(":").map(Number);
    const want = Date.UTC(y, mo - 1, d, h, mi);
    let ms = want;
    for (let i = 0; i < 3; i++) { const p = partsIn(ms, zone); ms += want - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi); }
    return ms;
  }
  const pad = (n) => String(n).padStart(2, "0");
  const todayIn = (now, zone) => { const p = partsIn(now, zone); return p.y + "-" + pad(p.mo) + "-" + pad(p.d); };
  /** Times offered every 15 minutes; one that has already passed in the chosen zone is disabled. */
  function timeOptions(dateStr, zone, now) {
    const out = [];
    for (let m = 0; m < 24 * 60; m += 15) { const t = pad(Math.floor(m / 60)) + ":" + pad(m % 60); out.push({ t, passed: !(wallToMs(dateStr, t, zone) > now) }); }
    return out;
  }
  const clockIn = (ms, zone) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
  /** "For people elsewhere": the same moment on the clocks of the other popular zones. */
  const elsewhere = (ms, zone) => ZONES.filter((z) => z.id !== zone).slice(0, 4).map((z) => z.label + ": " + clockIn(ms, z.id));
  const gameName = (occ, other) => (occ === "Other" ? String(other || "").replace(/\s+/g, " ").trim() : occ);
  /** Everything wrong with step 1, in plain words (empty list = fine). */
  function whenProblems(f, now) {
    const bad = [];
    if (!gameName(f.occ, f.oname)) bad.push("Please type a name for your game.");
    if (!f.date || !f.time) { bad.push("Please choose a day and a time."); return bad; }
    const zone = f.zone === OTHER_ZONE ? f.zoneOther : f.zone;
    if (!zone || !validZone(zone)) { bad.push("Please choose a time zone from the list."); return bad; }
    const ms = wallToMs(f.date, f.time, zone);
    if (!(ms > now)) bad.push("That time has already passed. Please choose a later time.");
    else if (ms > now + 30 * 86400000) bad.push("A game can start at most 30 days from today.");
    return bad;
  }
  /* ---- Step 2: who is this game for (pure) ---- */
  const CARDS = [
    { id: "people", name: "Your people", line: "Everyone who works with you.", invites: false, cats: [] },
    { id: "family", name: "Your people and their families", line: "Each person can bring up to 4 family members. Every ticket is one participant.", invites: true, cats: ["family"] },
    { id: "extended", name: "Extended family", line: "Your people, their families and friends, wherever they are.", invites: true, cats: ["family", "colleagues"] },
  ];
  const FALLBACK_PACKS = [{ upTo: 100, inr: 2399 }, { upTo: 250, inr: 3499 }, { upTo: 500, inr: 4699 }, { upTo: 1000, inr: 7099 }];
  const money = (n) => "₹" + Number(n).toLocaleString("en-IN");
  /** The size choices, from the game's real pack ladder (smallest first). */
  const packChoices = (packs) => (Array.isArray(packs) && packs.length ? packs : FALLBACK_PACKS).filter((k) => Number(k.upTo) > 0).map((k) => ({ upTo: Number(k.upTo), inr: Number(k.inr) || 0, label: "Up to " + k.upTo + " participants" + (k.inr ? " · " + money(k.inr) : "") })).sort((a, b) => a.upTo - b.upTo);
  /** What the system saves for a card: only people the organizer lets in take part; family cards allow 4 more people each. */
  function audienceSettings(cardId, upTo) {
    const c = CARDS.find((x) => x.id === cardId) || CARDS[0];
    return { cap: Number(upTo), whoCanJoin: "list", callMode: "auto", demo: false, invites: { on: c.invites, per: 4, cats: c.cats } };
  }
  function whoProblems(f, choices) {
    if (!CARDS.some((c) => c.id === f.card)) return ["Please choose who the game is for."];
    if (!choices.some((k) => k.upTo === Number(f.upTo))) return ["Please choose the size of your game."];
    return [];
  }
  /* ---- Step 3: tickets and prizes (pure) ---- */
  /** The houses the game itself offers (window.ZG.PRIZE_HOUSES). Super Bumper House has its own part of the screen. */
  const housesOf = (zg) => (zg && Array.isArray(zg.PRIZE_HOUSES) ? zg.PRIZE_HOUSES : []).filter((h) => h.id !== "full2");
  const POPULAR = G.popular, RECOMMENDED = G.recommended; // the boss's picks, not data: each game lists its own
  /** Tags always read (Popular) before (Recommended). */
  const tagsOf = (id) => [POPULAR.includes(id) ? "(Popular)" : "", RECOMMENDED.includes(id) ? "(Recommended)" : ""].filter(Boolean);
  const GIFTS = ["Gift voucher", "Gift hamper", "Smartphone", "Smart watch", "Earbuds or headphones", "Tablet or laptop", "Holiday or weekend stay", "Dinner or restaurant voucher", "Movie tickets", "Extra day off"]; // no cash, ever
  const OTHER_GIFT = "Other";
  const CURRENCIES = [["INR", "₹", "en-IN"], ["USD", "$", "en-US"], ["EUR", "€", "en-US"], ["GBP", "£", "en-GB"], ["AED", "AED ", "en-US"], ["SGD", "S$", "en-US"]];
  const symbolOf = (cur) => (CURRENCIES.find((c) => c[0] === cur) || CURRENCIES[0])[1];
  /** The words saved for one prize: the gift, and "worth up to" when the organizer gave an amount. */
  function prizeLine(gift, other, worth, cur) {
    const g = gift === OTHER_GIFT ? String(other || "").replace(/\s+/g, " ").trim() : gift;
    const w = String(worth || "").replace(/[^0-9.]/g, "");
    if (!g) return "";
    if (!w || !(Number(w) > 0)) return g;
    const c = CURRENCIES.find((x) => x[0] === cur) || CURRENCIES[0];
    return g + " (worth up to " + c[1] + Number(w).toLocaleString(c[2]) + ")";
  }
  const defaultPrizes = (houses) => Object.fromEntries(houses.map((h) => [h.id, { on: RECOMMENDED.length ? RECOMMENDED.includes(h.id) : !!h.dflt, n: 1, gift: GIFTS[0], other: "", worth: "" }]));
  const defaultBumper = () => ({ on: false, n: 1, gift: GIFTS[0], other: "", worth: "" });
  /** The prizes as the game stores them: a line per winner place (1st, 2nd, ...). Super Bumper House only with 2 tickets. */
  function buildRewards(sel, bumper, tix, cur) {
    const out = [];
    for (const [id, h] of Object.entries(sel)) {
      if (!h.on) continue;
      for (let o = 1; o <= Number(h.n); o++) out.push({ pattern: id, scope: "ticket", ordinal: o, text: prizeLine(h.gift, h.other, h.worth, cur) });
    }
    if (G.bumper && Number(tix) === 2 && bumper && bumper.on) for (let o = 1; o <= Number(bumper.n); o++) out.push({ pattern: "full", scope: "two_ticket", ordinal: o, text: prizeLine(bumper.gift, bumper.other, bumper.worth, cur) });
    return out;
  }
  function prizeProblems(sel, bumper, tix, houses) {
    const rows = Object.entries(sel).filter(([, h]) => h.on);
    const bump = G.bumper && Number(tix) === 2 && bumper && bumper.on;
    if (!rows.length && !bump) return ["Tick at least one prize."];
    for (const [id, h] of rows) { const name = (houses.find((x) => x.id === id) || {}).label || id; if (!prizeLine(h.gift, h.other, h.worth, "INR")) return ["Please write the prize for " + name + "."]; }
    if (bump && !prizeLine(bumper.gift, bumper.other, bumper.worth, "INR")) return ["Please write the prize for Super Bumper House."];
    return [];
  }
  /* ---- Step 4: Brand & Breaks (pure) ---- */
  const BREAK_MAX = { 1: 3, 2: 5 }; // message breaks: a 1-ticket game, a 2-ticket game
  const breakMax = (tix) => BREAK_MAX[Number(tix) === 2 ? 2 : 1];
  const BRAND_COLORS = ["#0B3D91", "#1A7A46", "#B3261E", "#7A3EB1", "#C75B00", "#0F6E7A"];
  /** A ticket cannot show & or quote marks: the company name is made safe, and the organizer is told (same rule as the current console). */
  const brandNameClean = (s) => String(s || "").replace(/\s*&\s*/g, " and ").replace(/'/g, "\u2019").replace(/[<>`"\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 40).trim();
  const fixUrl = (u) => (/^(www\.|youtu\.be\/|(m\.|music\.)?youtube\.com\/)/i.test(u) ? "https:" + "//" + u : u);
  const YT = /^https:\/\/((www|m|music)\.)?(youtube\.com\/(watch\?|shorts\/|embed\/|live\/)|youtu\.be\/)/i;
  const MEDIA = /^https:\/\/[^\s]+\.(mp4|webm|m4v|mov|ogv|mp3|m4a|aac|wav|ogg|oga)([?#]\S*)?$/i;
  /** What a pasted link is: a YouTube link (best), a link straight to a video or audio file, or neither. */
  function linkKind(raw) {
    const u = fixUrl(String(raw || "").trim());
    return YT.test(u) ? "youtube" : MEDIA.test(u) ? "file" : null;
  }
  function brandProblems(b) {
    const out = [];
    if (b.logo && !brandNameClean(b.name)) out.push("Your logo needs a company name. Please type the name, or remove the logo.");
    return out;
  }
  function breakProblems(breaks, tix) {
    if (breaks.length > breakMax(tix)) return ["You can add up to " + breakMax(tix) + " message breaks for a " + (Number(tix) === 2 ? "2-ticket" : "1-ticket") + " game."];
    for (let i = 0; i < breaks.length; i++) if (!linkKind(breaks[i].link)) return ["Message break " + (i + 1) + ": please paste a public link. A YouTube link is best."];
    return [];
  }
  /** What the game stores: the company strip and the message breaks (the opening and closing moments are left empty in this flow). */
  function buildBrandPatch(form, tix) {
    const name = brandNameClean(form.brand.name);
    const brand = name ? { name, color: form.brand.color || BRAND_COLORS[0], ...(form.brand.logo ? { logo: form.brand.logo } : {}) } : {};
    const breaks = form.breaks.map((b) => { const u = fixUrl(String(b.link).trim()); return { kind: linkKind(u), title: String(b.title || "").trim() || "A message from your organizer", mediaUrl: u }; });
    return { tickets: Number(tix), opening: [], breaks, closing: [], brand };
  }
  /* ---- Step 5: check and publish (pure) ---- */
  const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
  /** The organizer's own contact, needed to publish (the invoice and the game report go there). */
  function contactProblems(email, phone) {
    if (!EMAIL.test(String(email || "").trim())) return ["Please type your email ID, for example name@company.com."];
    const d = String(phone || "").replace(/\D/g, "");
    if (d.length < 10 || d.length > 15) return ["Please type your mobile number, with 10 digits."];
    return [];
  }
  /** Everything chosen in steps 1 to 4, in plain words, to read back before publishing. */
  function readBack(s) {
    const lines = [];
    if (s.when) lines.push(["Game", s.name + " · " + clockIn(s.when.ms, s.when.zone) + " (" + ((ZONES.find((z) => z.id === s.when.zone) || {}).label || s.when.zone.replace(/_/g, " ")) + ")"]);
    const card = CARDS.find((c) => c.id === s.card);
    const size = (s.choices || []).find((k) => k.upTo === Number(s.upTo));
    if (card) lines.push(["For", card.name + (size ? " · " + size.label : "")]);
    lines.push(["Tickets", s.tix + (Number(s.tix) === 1 ? " ticket" : " tickets") + " for each participant"]);
    const rw = s.rewards || [];
    const names = {};
    for (const r of rw) { const k = r.pattern + "|" + r.scope; (names[k] = names[k] || { r, n: 0 }).n++; }
    for (const { r, n } of Object.values(names)) lines.push([r.scope === "two_ticket" ? "Super Bumper House" : (s.houses.find((h) => h.id === r.pattern) || {}).label || r.pattern, r.text + (n > 1 ? " · won " + n + " times" : "")]);
    lines.push(["Company", s.brand && s.brand.name ? s.brand.name : "Not added"]);
    lines.push(["Message breaks", String((s.breaks || []).length)]);
    return lines;
  }
  /* ---- Game dashboard (pure) ---- */
  const BANNER_UNPAID = "Published, payment is pending. Don’t worry. The game will not start until the payment is done, and you can cancel it at any time.";
  /** One status banner: unpaid or paid, in the words of the style guide. `startText` is the start time as the organizer read it in step 1. */
  const bannerOf = (info, startText) => (!info || !info.published ? null : info.paid
    ? { kind: "paid", text: "Congratulations, your game is on! It will begin at " + startText + ". You can postpone or change it up to 5 minutes before the game begins." }
    : { kind: "unpaid", text: BANNER_UNPAID });
  const gameLink = (origin, eid) => origin + "/z.html?e=" + eid;
  const payLink = (origin, eid) => origin + "/pay.html?e=" + eid;
  const boardLink = (origin, eid) => origin + "/board.html?e=" + eid;
  const shareMessage = (name, link, eid) => "You are welcome to join our " + name + " game." + (eid ? " Game ID: " + eid + "." : "") + " Open this game link on your phone: " + link;
  const PAY_PRINT = "The payment is small, so many organizers pay it themselves and claim it back (recommended). You can also copy the payment link and share it with the person who will pay. The payment link works for 7 days.";
  /** The waiting table: Ticket number always; Name, Employee ID, Email ID, Mobile and Referred by only when somebody gave them. */
  function waitColumns(rows) {
    const all = [
      { label: "Ticket number", get: (w) => (w.ticket != null ? String(w.ticket) : ""), always: true },
      { label: "Name", get: (w) => String(w.name || w.firstName || "") },
      { label: "Employee ID", get: (w) => String(w.empId || w.employeeId || "") },
      { label: "Email ID", get: (w) => String(w.email || "") },
      { label: "Mobile", get: (w) => (w.mobile ? String(w.mobile) : w.last4 ? "ends " + w.last4 : "") },
      { label: "Referred by", get: (w) => String(w.via || w.referredBy || "") },
    ];
    return all.filter((c) => c.always || rows.some((w) => c.get(w)));
  }
  const waitLabel = (w) => [w.ticket != null ? "Ticket " + w.ticket : "", w.name || w.firstName || "", w.empId || w.employeeId || "", w.email || "", w.last4 ? "ends " + w.last4 : ""].filter(Boolean).join(" \u00b7 ") || "A participant";
  /** Tickets claimed: real claims only (practice rows are left out). */
  const claimedCount = (claims) => (Array.isArray(claims) ? claims.filter((c) => !c.bogey).length : 0);
  const REPORT_NOTE = "After the game, download your game report within 24 hours. All game and participant information is deleted within 24 hours of the game.";
  /* ---- Game ID and the eleven statuses (pure) ---- */
  const STATUSES = {
    draft: { label: "Draft", tone: "grey" },
    pending: { label: "Published, payment pending", tone: "amber" },
    paid: { label: "Published and paid", tone: "green" },
    free: { label: "Published, free game", tone: "green" },
    overdue: { label: "Payment pending, start time passed", tone: "red" },
    live: { label: "Live now", tone: "red" },
    paused: { label: "Paused", tone: "amber" },
    completed: { label: "Completed", tone: "blue" },
    cancelled: { label: "Cancelled", tone: "grey" },
    refund: { label: "Cancelled, refund requested", tone: "amber" },
    deleted: { label: "Data deleted", tone: "grey" },
  };
  /** The one status of a game, from what the game's own info answer says (`raw`), plus facts from elsewhere (paused, refund, report sent, data deleted). */
  function statusOf(raw, facts, now) {
    const f = facts || {};
    if (f.deleted) return "deleted";
    if (raw && raw.cancelled) return f.refund ? "refund" : "cancelled";
    if (!raw || raw.draft) return "draft";
    const start = Number(raw.startMs) || 0, end = start + (Number(raw.gameMinutes) || 60) * 60000 + 600000;
    if (raw.unpaid === true) return raw.locked || (start && now >= start) ? "overdue" : "pending";
    if (f.completed || (start && now > end)) return "completed";
    if (f.paused) return "paused";
    if (start && now >= start) return "live";
    return raw.demo ? "free" : "paid";
  }
  const STATUS_WORDS = {
    draft: "Saved as a draft. Nobody can join yet. Finish the steps and press Publish.",
    overdue: "Payment is pending and the start time has passed, so the game has not started. Pay now, change the date, or cancel it.",
    live: "Your game is live now. Your participants are playing.",
    paused: "Your game is paused. It continues when it is resumed.",
    completed: "Your game is complete. Download your game report within 24 hours. After that, all game and participant information is deleted.",
    cancelled: "This game was cancelled. Nothing is charged. You can make a copy of it any time.",
    refund: "This game was cancelled and a refund was requested. Please keep the Game ID for any question.",
    deleted: "The information of this game has been deleted. Only the Game ID and the payment record remain.",
  };
  const BANNER_KIND = { draft: "off", pending: "unpaid", paid: "paid", free: "paid", overdue: "overdue", live: "live", paused: "paused", completed: "done", cancelled: "off", refund: "paused", deleted: "off" };
  /** The one banner of a status. Pending and paid keep the owner's exact words (bannerOf); a free game reads like a paid one. */
  function statusBanner(status, startText) {
    const kind = BANNER_KIND[status] || "off";
    if (status === "pending") return { kind, text: BANNER_UNPAID };
    if (status === "paid") return { kind, text: bannerOf({ published: true, paid: true }, startText).text };
    if (status === "free") return { kind, text: "Congratulations, your game is on! It is a free game. It will begin at " + startText + ". You can postpone or change it up to 5 minutes before the game begins." };
    return { kind, text: STATUS_WORDS[status] || "" };
  }

  /* ---- Host and Co-host sign-in (DEMO STUB: the real passcode by email and the role check are Phase B; the stub only runs on this computer) ---- */
  const TEAM_DEMO = { host: "host@acme.com", cohost: "cohost@acme.com", code: "123456" };
  const PASS = { tries: 5, minutes: 10 };
  const stubOn = (search, hostname) => new URLSearchParams(search).get("demo") === "roles" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname);
  const roleOfEmail = (email) => { const e = String(email || "").trim().toLowerCase(); return e === TEAM_DEMO.host ? "host" : e === TEAM_DEMO.cohost ? "cohost" : null; };
  /** One try at the 6-digit passcode: it works for 10 minutes and for 5 wrong tries. */
  function passcodeCheck(att, code, now) {
    if (now - att.sentMs > PASS.minutes * 60000) return { ok: false, reason: "expired", msg: "This passcode has expired. Please ask for a new one." };
    if (att.tries >= PASS.tries) return { ok: false, reason: "locked", msg: "Too many wrong tries. Please ask for a new passcode." };
    if (String(code) === TEAM_DEMO.code) return { ok: true };
    att.tries++;
    return { ok: false, reason: "wrong", msg: "That passcode is not right. You have " + (PASS.tries - att.tries) + (PASS.tries - att.tries === 1 ? " try" : " tries") + " left." };
  }
  const ROLE_BAR = {
    host: "You are a Host of this game. You can change the game, like the organizer.",
    cohost: "You are a Co-host of this game. You can share the game link and let people in. You cannot change the game or pay.",
  };
  const NOT_ON_LIST = "This email ID is not on the list. Please ask the organizer to add you, or join the game as a participant.";
  const registry = {}; // step number -> function(el, ctx) that draws the step body (each step adds its own)

  const api = { COPY, STEPS, canOpen, nextAfter, dashboardOpen, badWords, registry, OCC, ZONES, wallToMs, todayIn, timeOptions, elsewhere, gameName, whenProblems, clockIn, CARDS, money, packChoices, audienceSettings, whoProblems, housesOf, tagsOf, GIFTS, prizeLine, defaultPrizes, defaultBumper, buildRewards, prizeProblems, breakMax, brandNameClean, linkKind, brandProblems, breakProblems, buildBrandPatch, contactProblems, readBack, bannerOf, gameLink, payLink, boardLink, shareMessage, claimedCount, BANNER_UNPAID, PAY_PRINT, waitColumns, waitLabel, STATUSES, statusOf, statusBanner, stubOn, roleOfEmail, passcodeCheck, TEAM_DEMO, PASS, ROLE_BAR, NOT_ON_LIST, sampleTickets };
  if (typeof window !== "undefined") window.ZFLOW = api;
  if (typeof module !== "undefined") module.exports = api;
  if (typeof document === "undefined") return;
  const q = new URLSearchParams(location.search);
  if (q.get("flow") !== "new") return;

  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  };
  const state = { done: {}, open: 1, info: null };
  const app = document.getElementById("app");
  function scrollTo(id) { const t = document.getElementById(id); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: "smooth", block: "start" }); }

  function draw() {
    app.replaceChildren();
    app.append(el("p", { class: "zf-top", role: "note", text: COPY.top }));
    { const rb = roleBar(); if (rb) app.append(rb); }
    if (state.eid) app.append(idBar());
    if (state.mode === "signin") { app.append(teamSignin()); return; }
    if (state.view === "cohost") { app.append(dashboard({ cohost: true })); return; }
    const bar = el("ol", { class: "zf-bar", "aria-label": "Steps" });
    for (const s of STEPS) {
      const ok = canOpen(s.n, state.done), cur = state.open === s.n;
      bar.append(el("li", {}, el("button", { type: "button", class: "zf-pill" + (cur ? " cur" : "") + (state.done[s.n] ? " done" : ""), "data-step": String(s.n), ...(ok ? {} : { disabled: "" }), ...(cur ? { "aria-current": "step" } : {}), onclick: () => { state.view = "steps"; state.open = s.n; draw(); scrollTo("zf-sec" + s.n); } }, el("b", { text: String(s.n) }), " ", s.name, s.optional ? el("i", { text: " (optional)" }) : null)));
    }
    const open = dashboardOpen(state.info);
    bar.append(el("li", {}, el("button", { type: "button", class: "zf-pill zf-dash" + (state.view === "dash" ? " cur" : ""), id: "zf-dash", ...(open ? { onclick: () => { state.view = "dash"; draw(); refreshDash(); } } : { disabled: "", title: COPY.dashLocked }) }, COPY.dash, open ? null : el("i", { text: " · " + COPY.dashLocked }))));
    app.append(bar);
    if (state.view === "dash" && dashboardOpen(state.info)) { app.append(dashboard()); return; }
    for (const s of STEPS) {
      const sec = el("section", { class: "zf-sec" + (state.open === s.n ? " open" : ""), id: "zf-sec" + s.n, "aria-labelledby": "zf-h" + s.n });
      sec.append(el("h2", { id: "zf-h" + s.n, text: s.n + ". " + s.name }));
      if (state.open === s.n) {
        const body = el("div", { class: "zf-body" });
        if (registry[s.n]) registry[s.n](body, { state, done, redraw: draw }); else body.append(el("p", { class: "zf-soon", text: COPY.soon }));
        sec.append(body);
      }
      app.append(sec);
    }
  }
  /** Called by a step when it has saved: mark it done and move on to the next step, scrolling to it. */
  function done(n) {
    state.done[n] = true;
    if (n === 5 && dashboardOpen(state.info)) { state.view = "dash"; draw(); refreshDash(); return; }
    const nx = nextAfter(n, state.done);
    if (nx) state.open = nx;
    draw();
    if (nx) scrollTo("zf-sec" + nx);
  }
  /* ---- talking to the game service (same sign-in key as the current console) ---- */
  const BASE = (q.get("api") || "").replace(/\/$/, "");
  const secret = () => { try { return (window.CTK ? window.CTK.get("ctz-org") : sessionStorage.getItem("ctz-org")) || ""; } catch { return ""; } };
  { const k = q.get("k"); if (k && /^ct[hcak]_[0-9a-f]{48}$/.test(k)) { try { if (window.CTK) window.CTK.set("ctz-org", k); else sessionStorage.setItem("ctz-org", k); q.delete("k"); const rest = q.toString(); window.history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "")); } catch { /* the page then asks for the link again */ } } } // a sign-in link from the current console (?k=...) works here too
  state.eid = q.get("e") || "";
  async function call(method, path, body) {
    const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", "x-organizer": secret() }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "Could not do that. Please try again."), { status: r.status });
    return j;
  }
  const randId = () => "E" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
  api.call = call;

  /* ---- Step 1 ---- */
  const form = { occ: "Team party", oname: "", date: "", time: "", zone: "Asia/Kolkata", zoneOther: "" };
  api.form = form;
  registry[1] = (box) => {
    const now = Date.now(), zone = form.zone === OTHER_ZONE ? form.zoneOther : form.zone, okZone = !!zone && validZone(zone);
    const msg = el("p", { class: "zf-msg", role: "status", id: "zf-msg1" });
    const redo = () => { const keep = document.activeElement && document.activeElement.id; draw(); if (keep) { const k = document.getElementById(keep); if (k) k.focus(); } };
    box.append(el("p", { class: "zf-lead", text: "Choose when your game begins. People can join from any location." }));
    const occ = el("div", { class: "zf-chips", role: "radiogroup", "aria-label": "Occasion" });
    for (const o of OCC) occ.append(el("button", { type: "button", role: "radio", class: "zf-chip" + (form.occ === o ? " on" : ""), "aria-checked": String(form.occ === o), "data-occ": o, onclick: () => { form.occ = o; redo(); } }, o));
    box.append(el("h3", { text: "What is the occasion?" }), occ);
    if (form.occ === "Other") box.append(el("label", { for: "zf-oname", text: "Write the occasion (it becomes the name of your game)" }), el("input", { id: "zf-oname", type: "text", maxlength: "40", value: form.oname, oninput: (e) => { form.oname = e.target.value; } }));
    if (!okZone) { box.append(el("p", { class: "zf-msg", text: "Choose a time zone to see the times." })); }
    const zsel = el("select", { id: "zf-zone", "aria-label": "Time zone", onchange: (e) => { form.zone = e.target.value; form.time = ""; redo(); } });
    for (const z of ZONES) zsel.append(el("option", { value: z.id, ...(form.zone === z.id ? { selected: "" } : {}) }, z.label));
    zsel.append(el("option", { value: OTHER_ZONE, ...(form.zone === OTHER_ZONE ? { selected: "" } : {}) }, "Other"));
    const day = el("input", { id: "zf-date", type: "date", value: form.date, ...(okZone ? { min: todayIn(now, zone) } : {}), onchange: (e) => { form.date = e.target.value; form.time = ""; redo(); } });
    const tsel = el("select", { id: "zf-time", "aria-label": "Time", onchange: (e) => { form.time = e.target.value; redo(); } }, el("option", { value: "" }, "Choose a time"));
    if (okZone && form.date) for (const t of timeOptions(form.date, zone, now)) tsel.append(el("option", { value: t.t, ...(t.passed ? { disabled: "" } : {}), ...(form.time === t.t ? { selected: "" } : {}) }, t.t));
    box.append(el("h3", { text: "Which day and time?" }), el("label", { for: "zf-date", text: "Day" }), day, el("label", { for: "zf-time", text: "Time" }), tsel, el("label", { for: "zf-zone", text: "Time zone" }), zsel);
    if (form.zone === OTHER_ZONE) box.append(el("label", { for: "zf-zone2", text: "Time zone name, for example Asia/Tokyo" }), el("input", { id: "zf-zone2", type: "text", value: form.zoneOther, onchange: (e) => { form.zoneOther = e.target.value.trim(); redo(); } }));
    if (okZone && form.date && form.time) {
      const ms = wallToMs(form.date, form.time, zone);
      box.append(el("div", { class: "zf-else", id: "zf-else" }, el("b", { text: "What time it is for people elsewhere" }), el("ul", {}, elsewhere(ms, zone).map((x) => el("li", { text: x })))));
    }
    const go = el("button", { type: "button", class: "zf-go", id: "zf-save1", onclick: async () => {
      const bad = whenProblems(form, Date.now());
      if (bad.length) { msg.textContent = bad[0]; return; }
      go.disabled = true; msg.textContent = "Saving…";
      try {
        const z = form.zone === OTHER_ZONE ? form.zoneOther : form.zone, ms = wallToMs(form.date, form.time, z), name = gameName(form.occ, form.oname);
        const startRound = window.ZG.roundAt(ms);
        if (state.eid) await call("PATCH", `/api/z/${state.eid}/settings`, { name, startRound });
        else { const id = randId(); await call("POST", "/api/z", { id, name, startRound, callSeconds: 12, cap: 10 }); state.eid = id; try { window.history.replaceState(null, "", location.pathname + "?flow=new&e=" + id); } catch {} }
        state.when = { ms, zone: z };
        done(1);
      } catch (e) { go.disabled = false; msg.textContent = e.message; }
    } }, "Save and continue");
    box.append(msg, go);
  };

  /* ---- Step 2 ---- */
  const who = { card: "people", upTo: 0, how: "self" };
  api.who = who;
  registry[2] = (box) => {
    if (!state.packs) { fetch(BASE + "/api/z/ai-manifest").then((r) => r.json()).then((j) => { state.packs = j.packs || []; draw(); }).catch(() => { state.packs = []; draw(); }); box.append(el("p", { text: "Loading the sizes…" })); return; }
    const choices = packChoices(state.packs);
    if (!who.upTo) who.upTo = choices[0].upTo; // the smallest size is already chosen for you
    const msg = el("p", { class: "zf-msg", role: "status", id: "zf-msg2" });
    box.append(el("p", { class: "zf-lead", text: "You choose who the game is for. The system takes care of the rest." }));
    const cards = el("div", { class: "zf-cards", role: "radiogroup", "aria-label": "Who is this game for" });
    for (const c of CARDS) cards.append(el("button", { type: "button", role: "radio", class: "zf-card" + (who.card === c.id ? " on" : ""), "aria-checked": String(who.card === c.id), "data-card": c.id, onclick: () => { who.card = c.id; draw(); } }, el("b", { text: c.name }), el("span", { text: c.line })));
    box.append(cards);
    box.append(el("h3", { text: "How are your participants let in?" }));
    const how = el("div", { class: "zf-how" });
    how.append(el("label", { class: "zf-opt" }, el("input", { type: "radio", name: "zf-how", value: "system", disabled: "", id: "zf-how-system" }), " System validates for you ", el("span", { class: "zf-soon", text: COPY.soon }), el("small", { text: " The system checks each person against your list of employee IDs or email IDs. You can add the list yourself, whenever it is ready." })));
    how.append(el("label", { class: "zf-opt" }, el("input", { type: "radio", name: "zf-how", value: "self", checked: "", id: "zf-how-self" }), " You validate yourself ", el("small", { text: " Everyone waits for you. You or your Host lets each person in from the Game dashboard." })));
    box.append(how);
    box.append(el("h3", { text: "How big is your game?" }));
    const sel = el("select", { id: "zf-size", "aria-label": "Size of your game", onchange: (e) => { who.upTo = Number(e.target.value); draw(); } });
    for (const k of choices) sel.append(el("option", { value: String(k.upTo), ...(who.upTo === k.upTo ? { selected: "" } : {}) }, k.label));
    box.append(sel);
    const go = el("button", { type: "button", class: "zf-go", id: "zf-save2", onclick: async () => {
      const bad = whoProblems(who, choices);
      if (bad.length) { msg.textContent = bad[0]; return; }
      if (!state.eid) { msg.textContent = "Please save step 1 first."; return; }
      go.disabled = true; msg.textContent = "Saving…";
      try { await call("PATCH", `/api/z/${state.eid}/settings`, audienceSettings(who.card, who.upTo)); done(2); }
      catch (e) { go.disabled = false; msg.textContent = e.message; }
    } }, "Save and continue");
    box.append(msg, go);
  };

  /* ---- Step 3 ---- */
  const prizes = { tix: 1, cur: "INR", sel: null, bumper: defaultBumper() };
  api.prizes = prizes;
  registry[3] = (box) => {
    const houses = housesOf(window.ZG);
    if (!prizes.sel) prizes.sel = defaultPrizes(houses); // the usual prizes are already ticked for you
    const msg = el("p", { class: "zf-msg", role: "status", id: "zf-msg3" });
    box.append(el("p", { class: "zf-lead", text: "Tick the prizes you want to give. Prizes are gifts." }));
    if (G.tickets.length > 1) box.append(el("h3", { text: "How many tickets does each participant get?" }));
    const tx = el("div", { class: "zf-chips", role: "radiogroup", "aria-label": "Tickets per participant" });
    for (const n of G.tickets) tx.append(el("button", { type: "button", role: "radio", class: "zf-chip" + (prizes.tix === n ? " on" : ""), "aria-checked": String(prizes.tix === n), "data-tix": String(n), onclick: () => { prizes.tix = n; draw(); } }, n + (n === 1 ? " ticket" : " tickets")));
    if (G.tickets.length > 1) box.append(tx);
    box.append(el("label", { for: "zf-cur", text: "Currency for “Worth up to” (it stays for every prize)" }));
    const cs = el("select", { id: "zf-cur", onchange: (e) => { prizes.cur = e.target.value; draw(); } });
    for (const c of CURRENCIES) cs.append(el("option", { value: c[0], ...(prizes.cur === c[0] ? { selected: "" } : {}) }, c[1].trim() + " " + c[0]));
    box.append(cs);
    const rowFor = (key, title, how, h, extra, maxN) => {
      const row = el("div", { class: "zf-prize" + (h.on ? " on" : ""), "data-house": key });
      const tags = extra ? [] : tagsOf(key);
      row.append(el("label", { class: "zf-tick" }, el("input", { type: "checkbox", id: "zf-tick-" + key, ...(h.on ? { checked: "" } : {}), onchange: (e) => { h.on = e.target.checked; draw(); } }), " ", el("b", { text: title }), tags.length ? el("span", { class: "zf-tag", text: " " + tags.join(" ") }) : null, el("small", { text: how })));
      if (h.on) {
        const nsel = el("select", { id: "zf-n-" + key, "aria-label": "How many times " + title + " can be won", onchange: (e) => { h.n = Number(e.target.value); draw(); } });
        for (let i = 1; i <= (extra ? 10 : maxN || 5); i++) nsel.append(el("option", { value: String(i), ...(h.n === i ? { selected: "" } : {}) }, String(i)));
        const gsel = el("select", { id: "zf-g-" + key, "aria-label": "The prize for " + title, onchange: (e) => { h.gift = e.target.value; draw(); } });
        for (const g of [...GIFTS, OTHER_GIFT]) gsel.append(el("option", { value: g, ...(h.gift === g ? { selected: "" } : {}) }, g));
        row.append(el("div", { class: "zf-fields" }, el("label", { for: "zf-n-" + key, text: "This prize can be won (times)" }), nsel, el("label", { for: "zf-g-" + key, text: "The prize" }), gsel,
          h.gift === OTHER_GIFT ? el("input", { type: "text", id: "zf-o-" + key, maxlength: "60", "aria-label": "Write the prize", value: h.other, oninput: (e) => { h.other = e.target.value; } }) : null,
          el("label", { for: "zf-w-" + key, text: "Worth up to (optional)" }), el("span", { class: "zf-money" }, symbolOf(prizes.cur) + " ", el("input", { type: "text", inputmode: "numeric", id: "zf-w-" + key, value: h.worth, oninput: (e) => { h.worth = e.target.value; } }))));
      }
      return row;
    };
    if (!houses.length) box.append(el("p", { class: "zf-soon", text: "The prizes of this game are not available yet." }));
    for (const h of houses) box.append(rowFor(h.id, h.label, h.how, prizes.sel[h.id] || (prizes.sel[h.id] = { on: false, n: 1, gift: GIFTS[0], other: "", worth: "" }), false, Math.min(5, Number(h.max) || 5)));
    if (prizes.tix === 2) {
      box.append(el("h3", { text: "Two-ticket prizes" }));
      if (G.bumper) box.append(rowFor("bumper", "Super Bumper House", "Mark all 30 numbers of your two tickets together. Up to 10 winners.", prizes.bumper, true));
      for (const ab of ["Ticket A", "Ticket B"]) box.append(el("div", { class: "zf-prize zf-ab", "data-house": "ab-" + ab.slice(-1) }, el("label", { class: "zf-tick" }, el("input", { type: "checkbox", disabled: "" }), " ", el("b", { text: ab + " prizes" }), el("small", { text: "Different prizes for each of the two tickets." })), el("span", { class: "zf-soon", text: COPY.soon })));
    }
    const go = el("button", { type: "button", class: "zf-go", id: "zf-save3", onclick: async () => {
      const bad = prizeProblems(prizes.sel, prizes.bumper, prizes.tix, houses);
      if (bad.length) { msg.textContent = bad[0]; return; }
      if (!state.eid) { msg.textContent = "Please save step 1 first."; return; }
      go.disabled = true; msg.textContent = "Saving…";
      try { await call("PATCH", `/api/z/${state.eid}/settings`, { tickets: prizes.tix, rewards: buildRewards(prizes.sel, prizes.bumper, prizes.tix, prizes.cur) }); done(3); }
      catch (e) { go.disabled = false; msg.textContent = e.message; }
    } }, "Save and continue");
    box.append(msg, go);
  };

  /* ---- Step 4 ---- */
  const brandForm = { brand: { name: "", color: "", logo: "" }, breaks: [] };
  api.brandForm = brandForm;
  /** Shrinks the chosen picture in the browser to at most 30 KB (same numbers as the current console and the game's own limits). */
  async function fitLogo(file) {
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("bad")); r.readAsDataURL(file); });
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("bad")); i.src = url; });
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new Error("bad");
    if (Math.min(w0, h0) < 64) throw new Error("small");
    if (Math.max(w0, h0) > 4 * Math.min(w0, h0)) throw new Error("thin");
    const bytes = (d) => Math.ceil((d.length - d.indexOf(",") - 1) * 3 / 4);
    for (const side of [192, 144, 112, 80, 56]) {
      const k = Math.min(1, side / Math.max(w0, h0)), W = Math.max(1, Math.round(w0 * k)), H = Math.max(1, Math.round(h0 * k));
      for (const [type, qual, white] of [["image/png", undefined, false], ["image/jpeg", 0.85, true], ["image/jpeg", 0.6, true]]) {
        const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d"); if (white) { g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); } g.drawImage(img, 0, 0, W, H);
        const d = c.toDataURL(type, qual); if (d.startsWith("data:" + type) && bytes(d) <= 30720) return d;
      }
    }
    throw new Error("big");
  }
  const LOGO_WORDS = { small: "That picture is too small. Please use one at least 64 x 64 pixels.", thin: "That picture is too wide or too tall. Please use a square or slightly wide one.", big: "We could not make that picture small enough. Please try another one.", bad: "We could not read that picture. Please use a PNG, JPEG or WebP." };
  registry[4] = (box) => {
    const tix = prizes.tix, max = breakMax(tix), b = brandForm.brand;
    const msg = el("p", { class: "zf-msg", role: "status", id: "zf-msg4" });
    box.append(el("p", { class: "zf-lead", text: "This step is optional. Add your company name and message breaks, or skip it." }));
    box.append(el("h3", { text: "Your company" }));
    box.append(el("label", { for: "zf-bname", text: "Company name (optional)" }), el("input", { type: "text", id: "zf-bname", maxlength: "40", value: b.name, oninput: (e) => { b.name = e.target.value; } }));
    box.append(el("p", { class: "zf-small", text: "It appears on every ticket." }));
    const sw = el("div", { class: "zf-chips", role: "radiogroup", "aria-label": "Colour" });
    for (const c of BRAND_COLORS) sw.append(el("button", { type: "button", role: "radio", class: "zf-swatch" + (b.color === c ? " on" : ""), "aria-checked": String(b.color === c), "aria-label": "Colour " + c, style: "background:" + c, "data-color": c, onclick: () => { b.color = c; draw(); } }));
    box.append(el("label", { text: "Colour" }), sw);
    box.append(el("label", { for: "zf-blogo", text: "Small logo (optional)" }), el("input", { type: "file", id: "zf-blogo", accept: "image/png,image/jpeg,image/webp", onchange: async (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      try { b.logo = await fitLogo(file); msg.textContent = "Logo added."; } catch (err) { b.logo = ""; msg.textContent = LOGO_WORDS[err.message] || LOGO_WORDS.bad; }
    } }));
    box.append(el("p", { class: "zf-small", text: "PNG, JPEG or WebP, at least 64 x 64 pixels. The system makes it small to fit." }));
    box.append(el("h3", { text: "Message breaks" }));
    box.append(el("p", { class: "zf-lead", text: "Show a message during the game. Paste one public link for each break. A YouTube link is best. You can add up to " + max + "." }));
    brandForm.breaks.length = Math.min(brandForm.breaks.length, max);
    brandForm.breaks.forEach((m, i) => {
      box.append(el("div", { class: "zf-break", "data-break": String(i) },
        el("label", { for: "zf-bt" + i, text: "Message break " + (i + 1) + " title (optional)" }), el("input", { type: "text", id: "zf-bt" + i, maxlength: "60", value: m.title, oninput: (e) => { m.title = e.target.value; } }),
        el("label", { for: "zf-bl" + i, text: "Public link" }), el("input", { type: "text", id: "zf-bl" + i, inputmode: "url", value: m.link, oninput: (e) => { m.link = e.target.value; } }),
        el("button", { type: "button", class: "zf-link", id: "zf-brm" + i, onclick: () => { brandForm.breaks.splice(i, 1); draw(); } }, "Remove")));
    });
    if (brandForm.breaks.length < max) box.append(el("button", { type: "button", class: "zf-add", id: "zf-badd", onclick: () => { brandForm.breaks.push({ title: "", link: "" }); draw(); } }, "Add a message break"));
    else box.append(el("p", { class: "zf-small", text: "That is the most you can add for a " + (tix === 2 ? "2-ticket" : "1-ticket") + " game." }));
    const save = async (skip) => {
      const bad = skip ? [] : [...brandProblems(b), ...breakProblems(brandForm.breaks, tix)];
      if (bad.length) { msg.textContent = bad[0]; return; }
      if (!state.eid) { msg.textContent = "Please save step 1 first."; return; }
      const cleaned = brandNameClean(b.name);
      msg.textContent = "Saving…";
      try {
        if (!skip) await call("PATCH", `/api/z/${state.eid}/settings`, buildBrandPatch(brandForm, tix));
        if (!skip && cleaned !== String(b.name).trim()) b.name = cleaned;
        done(4);
      } catch (e) { msg.textContent = e.message; }
    };
    box.append(msg, el("button", { type: "button", class: "zf-go", id: "zf-save4", onclick: () => save(false) }, "Save and continue"), " ", el("button", { type: "button", class: "zf-link", id: "zf-skip4", onclick: () => save(true) }, "Skip this step"));
  };

  /* ---- Step 5: what your participants will see (the game's own ticket maker and the player page's own look, with sample numbers) ---- */
  const pv = { view: "mobile" };
  api.pv = pv;
  /** Sample tickets from the game's real ticket maker (ZG.ticketsFor). null if the game files are not loaded. */
  function sampleTickets(eid, tix) {
    try { const t = window.ZG && window.ZG.ticketsFor ? window.ZG.ticketsFor(eid || "SAMPLE", "sample-player", Number(tix) === 2 ? 2 : 1) : null; return Array.isArray(t) && t.length ? t : null; } catch { return null; }
  }
  function previewNode() {
    const tix = prizes.tix, tickets = sampleTickets(state.eid, tix), laptop = pv.view === "laptop";
    const box = el("div", { class: "zf-preview", id: "zf-preview" });
    const seg = el("div", { class: "zf-chips", role: "radiogroup", "aria-label": "Preview view" });
    for (const [v, t] of [["mobile", "Mobile view"], ["laptop", "Laptop view"]]) seg.append(el("button", { type: "button", role: "radio", class: "zf-chip" + (pv.view === v ? " on" : ""), "aria-checked": String(pv.view === v), "data-pv": v, onclick: () => { pv.view = v; draw(); } }, t));
    box.append(seg, el("p", { class: "zf-small", id: "zf-pvnote", text: "These are sample numbers. Your participants see their own tickets." }));
    const frame = el("div", { class: "zf-frame " + (laptop ? "laptop" : "mobile"), id: "zf-frame", "aria-label": "Preview of the participant page" });
    const b = brandForm.brand;
    frame.append(el("div", { class: "zf-pvhead" }, b.logo ? el("img", { src: b.logo, alt: "", height: "30" }) : null, el("b", { text: brandNameClean(b.name) || "Your company name" }), el("span", { text: "Game ID " + (state.eid || "") })));
    frame.append(el("p", { class: "zf-pvlast", text: "Last number: 47" }));
    if (!G.sample) frame.append(el("p", {}, el("span", { class: "zf-soon", text: COPY.soon }), " A preview of the participant page for this game."));
    else if (!tickets) frame.append(el("p", { class: "zf-small", text: "The sample tickets could not be made here." }));
    else tickets.forEach((t, i) => {
      const label = tix === 2 ? (i === 0 ? "Ticket A" : "Ticket B") : "Your ticket";
      const marked = new Set(t.flat().filter((v) => v !== null).slice(0, 4));
      const grid = el("div", { class: "zticket zf-pvticket", "aria-label": label, style: "grid-template-columns: repeat(" + (t[0] ? t[0].length : 9) + ", 1fr)" });
      for (const v of t.flat()) grid.append(v === null ? el("div", { class: "e" }) : el("div", { class: marked.has(v) ? "m" : "", text: String(v) }));
      frame.append(el("p", { class: "zf-pvlabel" }, el("b", { text: label }), " · Ticket number " + (101 + i) + " (sample)"), grid);
    });
    frame.append(el("label", { class: "zf-small", for: "zf-pvname", text: "Your name (optional)" }), el("input", { type: "text", id: "zf-pvname", disabled: "" }));
    const houses = housesOf(window.ZG), shown = buildRewards(prizes.sel || {}, prizes.bumper, tix, prizes.cur);
    const seen = new Set();
    const ul = el("ul", { class: "zf-pvprizes", id: "zf-pvprizes" });
    for (const r of shown) { const k = r.pattern + "|" + r.scope; if (seen.has(k)) continue; seen.add(k); ul.append(el("li", {}, el("span", { text: (r.scope === "two_ticket" ? "Super Bumper House" : (houses.find((h) => h.id === r.pattern) || {}).label || r.pattern) + ": " + r.text }), " ", el("button", { type: "button", class: "zf-add", disabled: "" }, "Claim"))); }
    frame.append(ul);
    if (laptop && G.board) frame.append(retroBoard([7, 14, 21, 28, 47])); // sample stamps
    box.append(frame);
    return box;
  }
  /* ---- Step 5 ---- */
  const pub = { email: "", phone: "" };
  try { pub.email = (window.CTK ? window.CTK.get("ctz-email") : sessionStorage.getItem("ctz-email")) || ""; } catch { /* the box starts empty */ }
  registry[5] = (box) => {
    const houses = housesOf(window.ZG), msg = el("p", { class: "zf-msg", role: "status", id: "zf-msg5" });
    const rewards = buildRewards(prizes.sel || {}, prizes.bumper, prizes.tix, prizes.cur);
    box.append(el("p", { class: "zf-lead", text: "Please check everything. You can go back to any step to change it." }));
    const list = el("dl", { class: "zf-read", id: "zf-read" });
    for (const [k, v] of readBack({ name: gameName(form.occ, form.oname), when: state.when, card: who.card, upTo: who.upTo, choices: packChoices(state.packs), tix: prizes.tix, rewards, houses, brand: brandForm.brand, breaks: brandForm.breaks })) list.append(el("dt", { text: k }), el("dd", { text: v }));
    box.append(list);
    box.append(el("h3", { text: "What your participants will see" }), previewNode());
    box.append(el("h3", { text: "Hosts and Co-hosts" }));
    box.append(el("p", { text: "A Host is your right hand: a Host can make any change you can, and you can have up to 5. A Co-host brings people to the game and cannot change the game. You can have as many as you like." }));
    box.append(el("p", {}, el("span", { class: "zf-soon", text: COPY.soon }), " Adding Hosts and Co-hosts by email ID. For now the game is yours, and you can still hand over a Host or Co-host link from the current console."));
    box.append(el("h3", { text: "Your contact" }));
    box.append(el("p", { class: "zf-small", text: "Only you see these. The invoice and your game report are sent here. They are never shown to participants." }));
    box.append(el("label", { for: "zf-pemail", text: "Your email ID" }), el("input", { type: "email", id: "zf-pemail", autocomplete: "email", value: pub.email, oninput: (e) => { pub.email = e.target.value; } }));
    box.append(el("label", { for: "zf-pphone", text: "Your mobile number" }), el("input", { type: "tel", id: "zf-pphone", autocomplete: "tel", placeholder: "98765 43210", value: pub.phone, oninput: (e) => { pub.phone = e.target.value; } }));
    const consent = el("div", { id: "zf-consent" });
    if (window.CBConsent) consent.innerHTML = window.CBConsent.html("K1");
    box.append(consent);
    const go = el("button", { type: "button", class: "zf-go", id: "zf-publish", "data-needs": "K1", onclick: async () => {
      const bad = contactProblems(pub.email, pub.phone);
      if (bad.length) { msg.textContent = bad[0]; return; }
      if (!state.eid) { msg.textContent = "Please save step 1 first."; return; }
      go.disabled = true; msg.textContent = "Publishing…";
      try {
        const pr = await call("POST", `/api/z/${state.eid}/publish`, { email: pub.email.trim(), phone: pub.phone, consent: window.CBConsent ? window.CBConsent.payload(consent, "K1") : undefined });
        try { if (window.CTK) window.CTK.set("ctz-email", pub.email.trim()); else sessionStorage.setItem("ctz-email", pub.email.trim()); } catch { /* optional */ }
        state.info = { published: true, paid: !!(pr && pr.paid), payUrl: pr && pr.payUrl, shareUrl: pr && pr.shareUrl };
        done(5);
      } catch (e) { go.disabled = false; msg.textContent = e.message; }
    } }, "Publish");
    box.append(msg, go);
    if (window.CBConsent) window.CBConsent.wire(consent, "K1", {}, go); // Publish waits for the tick
  };

  /* ---- Game dashboard, Game ID bar, Host / Co-host pages ---- */
  const dash = { waiting: [], claims: [], note: "", loaded: false, facts: {}, notNow: [], inGame: [], called: [] };
  api.dash = dash;
  const originOf = () => (BASE || location.origin);
  const STUB = stubOn(location.search, location.hostname);
  const statusNow = () => state.demoStatus || statusOf(state.raw, dash.facts, Date.now());
  async function refreshDash() {
    if (!state.eid) return;
    try { const i = await call("GET", `/api/z/${state.eid}/info`); state.raw = i; state.info = { ...(state.info || {}), published: !i.draft, paid: !i.unpaid, startMs: i.startMs }; } catch { /* the last answer stays */ }
    try { dash.waiting = (await call("GET", `/api/z/${state.eid}/waiting`)).waiting || []; } catch { /* the last list stays */ }
    try { dash.claims = (await call("GET", `/api/z/${state.eid}/claims`)).claims || []; } catch { /* the last count stays */ }
    try { const l = await call("GET", `/api/z/${state.eid}/life`); dash.facts = { ...dash.facts, deleted: !!(l && l.purged), completed: !!(l && l.reportSent) }; } catch { /* no life answer: the time decides */ }
    dash.loaded = true;
    if (state.view === "dash" || state.view === "cohost") draw();
  }
  async function decide(w, decision) {
    try {
      await call("POST", `/api/z/${state.eid}/waiting/${encodeURIComponent(w.id)}`, { decision });
      dash.notNow = dash.notNow.filter((x) => x.id !== w.id); dash.inGame = dash.inGame.filter((x) => x.id !== w.id);
      if (decision === "admit") dash.inGame.push(w); else dash.notNow.push(w);
      dash.note = decision === "admit" ? "Let in." : "Not now. You can let them in later.";
    } catch (e) { dash.note = e.message; }
    await refreshDash();
  }
  async function copy(text, what) {
    try { await navigator.clipboard.writeText(text); dash.note = what + " copied."; } catch { dash.note = "Please copy it by hand: " + text; }
    draw();
  }
  /** The bar at the top of every screen once the game exists: its Game ID (with Copy) and its status. */
  function idBar() {
    const st = statusNow(), S = STATUSES[st];
    const bar = el("div", { class: "zf-idbar", id: "zf-idbar" }, el("span", { class: "zf-idlabel", text: "Game ID" }), " ", el("b", { id: "zf-gameid", text: state.eid }), " ",
el("span", { class: "zf-pillstatus " + S.tone, id: "zf-status", "data-status": st, text: S.label }));
    if (STUB && state.eid) {
      const sel = el("select", { id: "zf-demostatus", "aria-label": "Demo: show status", onchange: (e) => { state.demoStatus = e.target.value || ""; draw(); } }, el("option", { value: "" }, "Demo: show status"));
      for (const [id, v] of Object.entries(STATUSES)) sel.append(el("option", { value: id, ...(state.demoStatus === id ? { selected: "" } : {}) }, v.label));
      bar.append(" ", sel);
    }
    return bar;
  }
  const roleBar = () => (state.role ? el("div", { class: "zf-rolebar", id: "zf-rolebar" }, el("span", { text: ROLE_BAR[state.role] }), " ", el("button", { type: "button", class: "zf-add", id: "zf-signout", onclick: () => { state.role = ""; state.mode = "signin"; state.team = { email: "", sent: null, att: null }; draw(); } }, "Sign out")) : null);
  /** Host / Co-host sign-in (demo stub): email ID, then the 6-digit passcode. */
  function teamSignin() {
    const t = state.team, sec = el("section", { class: "zf-sec open", id: "zf-signin" });
    sec.append(el("p", { class: "zf-demo", id: "zf-demo", text: "DEMO ONLY: this sign-in is a pretend one for looking at the screens. Use host@acme.com or cohost@acme.com, passcode " + TEAM_DEMO.code + ". The real passcode by email needs Phase B." }));
    if (!t.sent) {
      sec.append(el("h2", { text: "Are you the Host or a Co-host?" }), el("label", { for: "zf-temail", text: "Type your email ID" }), el("input", { type: "email", id: "zf-temail", autocomplete: "email", value: t.email, oninput: (e) => { t.email = e.target.value; } }));
      const msg = el("p", { class: "zf-msg", id: "zf-tmsg", role: "status" });
      sec.append(msg, el("button", { type: "button", class: "zf-go", id: "zf-tgo", onclick: () => { if (!roleOfEmail(t.email)) { msg.textContent = NOT_ON_LIST; return; } t.sent = Date.now(); t.att = { tries: 0, sentMs: t.sent }; draw(); } }, "Continue"), " ", el("a", { class: "zf-link", id: "zf-asplayer", href: gameLink(originOf(), state.eid) }, "Join as a participant"));
      return sec;
    }
    sec.append(el("h2", { text: "Type your 6-digit passcode" }), el("p", { text: "The system sent a passcode to " + t.email.trim() + ". It works for " + PASS.minutes + " minutes." }));
    const row = el("div", { class: "zf-codes", id: "zf-codes" }), boxes = [];
    for (let i = 0; i < 6; i++) boxes.push(el("input", { type: "text", inputmode: "numeric", maxlength: "1", id: "zf-pc" + i, "aria-label": "Digit " + (i + 1), autocomplete: "one-time-code",
      oninput: (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(-1); if (e.target.value && boxes[i + 1]) boxes[i + 1].focus(); },
      onpaste: (e) => { const d = String((e.clipboardData || window.clipboardData).getData("text")).replace(/\D/g, "").slice(0, 6); if (!d) return; e.preventDefault(); boxes.forEach((b, k) => { b.value = d[k] || ""; }); } }));
    row.append(...boxes);
    const msg = el("p", { class: "zf-msg", id: "zf-tmsg", role: "status" });
    sec.append(row, msg, el("button", { type: "button", class: "zf-go", id: "zf-pcgo", onclick: () => {
      const r = passcodeCheck(t.att, boxes.map((b) => b.value).join(""), Date.now());
      if (!r.ok) { msg.textContent = r.msg; return; }
      const role = roleOfEmail(t.email);
      state.role = role; state.mode = ""; for (const s of STEPS) state.done[s.n] = true;
      state.raw = { startMs: Date.now() + 3 * 3600000, gameMinutes: 60 }; state.info = { published: true, paid: true, startMs: state.raw.startMs };
      state.view = role === "host" ? "dash" : "cohost"; draw();
    } }, "Check passcode"), " ", el("button", { type: "button", class: "zf-link", id: "zf-newcode", onclick: () => { t.sent = Date.now(); t.att = { tries: 0, sentMs: t.sent }; msg.textContent = "A new passcode was sent."; } }, "Send a new passcode"), " ", el("button", { type: "button", class: "zf-link", id: "zf-diffemail", onclick: () => { t.sent = null; t.att = null; draw(); } }, "Use a different email ID"));
    return sec;
  }
  /** The share card: Game ID, game link and the ways to send it. Hosts and Co-hosts use this same link. */
  function shareCard(o, eid, name) {
    const link = gameLink(o, eid), msg = shareMessage(name, link, eid);
    const wa = ["https:", "", "wa.me", ""].join("/") + "?text=" + encodeURIComponent(msg); // opened by the person's own tap
    return el("section", { class: "zf-sharecard", id: "zf-sharecard", "aria-labelledby": "zf-sh" },
      el("h2", { id: "zf-sh", text: "Share this game link with your participants." }),
      el("p", {}, el("span", { class: "zf-idlabel", text: "Game ID " }), el("b", { id: "zf-shareid", text: eid })),
      el("label", { for: "zf-link", text: "Game link for participants" }), el("input", { type: "text", readonly: "", id: "zf-link", value: link }),
      el("p", { class: "zf-btnrow" }, el("button", { type: "button", class: "zf-go", id: "zf-copylink", onclick: () => copy(link, "Game link") }, "Copy game link"), " ",
        el("button", { type: "button", class: "zf-add", id: "zf-copymsg", onclick: () => copy(msg, "Message") }, "Copy a message to share"), " ",
        el("a", { class: "zf-add", id: "zf-whatsapp", href: wa, target: "_blank", rel: "noopener" }, "Share on WhatsApp")),
      el("p", { class: "zf-msgbox", id: "zf-sharemsg", text: msg }),
      el("p", { class: "zf-small", text: "Hosts and Co-hosts use this same link." }));
  }
  /** Payment: a pill (Pending amber, Done green, Free game green), the buttons while it is pending, and the small print. */
  function paymentBlock(st, o, eid) {
    const pill = st === "free" ? ["Free game", "green"] : st === "pending" || st === "overdue" ? ["Pending", "amber"] : ["Done", "green"];
    const sec = el("section", { class: "zf-pay", id: "zf-pay" }, el("h3", {}, "Payment ", el("span", { class: "zf-pillstatus " + pill[1], id: "zf-paypill", text: pill[0] })));
    if (st === "pending" || st === "overdue") {
      sec.append(el("a", { class: "zf-go", id: "zf-paynow", href: payLink(o, eid), target: "_blank", rel: "noopener" }, "Pay now"), " ", el("button", { type: "button", class: "zf-add", id: "zf-copypay", onclick: async () => { let u = ""; try { u = (await call("POST", `/api/z/${eid}/paylink`, {})).url || ""; } catch (e) { dash.note = e.message; return draw(); } copy(u || payLink(o, eid), "Payment link"); } }, "Copy payment link"),
        el("p", { class: "zf-small", id: "zf-payprint", text: PAY_PRINT }));
      if (st === "overdue") sec.append(el("p", {}, el("a", { class: "zf-add", id: "zf-changedate", href: "/zc.html?e=" + encodeURIComponent(eid) }, "Change the date"), " ", el("a", { class: "zf-add", id: "zf-cancelgame", href: "/zc.html?e=" + encodeURIComponent(eid) }, "Cancel this game")));
    }
    return sec;
  }
  /** Waiting for you: one table, a column only when a participant gave that detail; Let in / Not now; then the grey Not now list and the green list. */
  function waitingBlock(co) {
    const sec = el("section", { class: "zf-waitsec", id: "zf-waitsec" }, el("h3", { text: "Waiting for you to let them in the game" }));
    const rows = dash.waiting;
    if (!rows.length) sec.append(el("p", { id: "zf-nowait", text: "Nobody is waiting right now." }));
    else {
      const cols = waitColumns(rows), wrap = el("div", { class: "zf-tablewrap" }), table = el("table", { class: "zf-table amber", id: "zf-wait" });
      table.append(el("thead", {}, el("tr", {}, cols.map((c) => el("th", { scope: "col", text: c.label })), el("th", { scope: "col", text: "" }))));
      const tb = el("tbody");
      for (const w of rows) tb.append(el("tr", { "data-wid": String(w.id) }, cols.map((c) => el("td", { "data-label": c.label, text: c.get(w) || "—" })), el("td", {}, el("button", { type: "button", class: "zf-add", "data-decide": "admit", onclick: () => decide(w, "admit") }, "Let in"), " ", el("button", { type: "button", class: "zf-link", "data-decide": "decline", onclick: () => decide(w, "decline") }, "Not now"))));
      table.append(tb); wrap.append(table); sec.append(wrap);
      if (!co) sec.append(el("button", { type: "button", class: "zf-add", id: "zf-letall", onclick: async () => { try { await call("POST", `/api/z/${state.eid}/waiting/all`, { decision: "admit" }); for (const w of rows) dash.inGame.push(w); dash.note = "Everybody was let in."; } catch (e) { dash.note = e.message; } await refreshDash(); } }, "Let everyone in"));
    }
    if (dash.notNow.length) {
      sec.append(el("h3", { text: "Not now" }));
      const ul = el("ul", { class: "zf-list grey", id: "zf-notnow" });
      for (const w of dash.notNow) ul.append(el("li", { "data-wid": String(w.id) }, el("span", { text: waitLabel(w) }), " ", el("button", { type: "button", class: "zf-add", "data-decide": "admit", onclick: () => decide(w, "admit") }, "Let in")));
      sec.append(ul);
    }
    if (dash.inGame.length) {
      sec.append(el("h3", { text: "In the game" }));
      const ul = el("ul", { class: "zf-list green", id: "zf-ingame" });
      for (const w of dash.inGame) ul.append(el("li", { "data-wid": String(w.id), text: waitLabel(w) }));
      sec.append(ul);
    }
    return sec;
  }
  /** The retro game board: a cream card with a double red border, round numbered discs, called numbers stamped red, a gold ball for the last number. */
  function retroBoard(called) {
    const board = el("section", { class: "zf-retro", id: "zf-retro", "aria-label": "Game board" });
    board.append(el("h3", { class: "zf-retro-title", text: "★ " + G.boardTitle + " ★" }), el("p", { class: "zf-small", text: "close group online corporate " + G.boardTitle.toLowerCase() }));
    const got = new Set(called), last = called.length ? called[called.length - 1] : 0;
    board.append(el("div", { class: "zf-ball", id: "zf-ball", text: last ? String(last) : "–" }));
    const grid = el("div", { class: "zf-discs", id: "zf-discs", style: "grid-template-columns: repeat(" + G.boardCols + ", 1fr)" });
    for (let n = 1; n <= G.boardMax; n++) grid.append(el("span", { class: "zf-disc" + (got.has(n) ? " called" : ""), "data-n": String(n), text: String(n) }));
    board.append(grid, el("p", { class: "zf-small", id: "zf-calledcount", text: called.length ? called.length + " numbers called" : "No number called yet." }));
    return board;
  }
  /** The Game dashboard (organizer and Host); a Co-host sees the Co-host page: the same share card, waiting table, tickets claimed and board, and cannot change anything. */
  function dashboard(opts) {
    const co = !!(opts && opts.cohost), o = originOf(), eid = state.eid, name = gameName(form.occ, form.oname), st = statusNow();
    const startText = state.when ? clockIn(state.when.ms, state.when.zone) : (state.info && state.info.startMs ? clockIn(state.info.startMs, "Asia/Kolkata") + " India time" : "the start time");
    const sec = el("section", { class: "zf-sec open zf-dashboard", id: "zf-dashboard", "aria-labelledby": "zf-hd" }, el("h2", { id: "zf-hd", text: co ? "Your Co-host page" : COPY.dash }));
    const bn = statusBanner(st, startText);
    const gone = st === "cancelled" || st === "refund" || st === "deleted" || st === "draft";
    if (!gone) sec.append(shareCard(o, eid, name)); // 1 the share card, at the very top
    if (!co) sec.append(el("div", { class: "zf-banner " + bn.kind, id: "zf-banner", "aria-live": "polite" }, bn.text)); // 2 the status banner
    if (st === "paused") sec.append(el("p", {}, el("button", { type: "button", class: "zf-add", id: "zf-resume", disabled: "" }, "Resume"), " ", el("span", { class: "zf-soon", text: COPY.soon })));
    if (st === "cancelled") sec.append(el("p", {}, el("button", { type: "button", class: "zf-add", id: "zf-copygame", disabled: "" }, "Make a copy"), " ", el("span", { class: "zf-soon", text: COPY.soon })));
    if (gone) { sec.append(el("p", { class: "zf-msg", role: "status", id: "zf-dashnote", text: st === "deleted" ? "" : dash.note })); return sec; }
    if (!co) sec.append(paymentBlock(st, o, eid)); // 3 payment
    sec.append(waitingBlock(co)); // 4 waiting for you
    if (G.claims) sec.append(el("h3", { text: "Tickets claimed" }), el("p", { id: "zf-claimed", text: String(claimedCount(dash.claims)) })); // 5 tickets claimed
    if (G.board) sec.append(retroBoard(dash.called || [])); // 6 the retro board
    if (!co) sec.append(el("p", {}, el("a", { class: "zf-add", id: "zf-board", href: boardLink(o, eid), target: "_blank", rel: "noopener" }, "Open the game board")), el("p", { class: "zf-small", id: "zf-report", text: REPORT_NOTE }));
    sec.append(el("p", { class: "zf-msg", role: "status", id: "zf-dashnote", text: dash.note }));
    return sec;
  }

  api.state = state; api.draw = draw; api.done = done; api.el = el;
  document.title = "Organizer console | " + G.brand;
  state.team = { email: "", sent: null, att: null }; state.role = ""; state.mode = "";
  if (STUB && q.get("team") === "1" && state.eid) state.mode = "signin";
  draw();
  if (state.eid && secret()) { call("GET", `/api/z/${state.eid}/info`).then((i) => { if (i && !i.draft && i.startMs) { state.raw = i; state.info = { published: true, paid: !i.unpaid, startMs: i.startMs }; for (const s of STEPS) state.done[s.n] = true; state.view = "dash"; draw(); refreshDash(); } }).catch(() => {}); }
})();
