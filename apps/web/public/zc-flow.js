/* Corporate Tambola, the NEW organizer flow (option only: open /zc.html?flow=new). Five steps and a Game dashboard.
   The current console (zc.js) is not touched: it stands aside when flow=new is in the address. Words follow docs 191 (language guide).
   Pure rules live in window.ZFLOW (tested); the page code below only draws them. */
(function () {
  "use strict";
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
  const BANNED = [/\binvit/i, /\bprivate\b/i, /\bwe\b/i, /\bRs\.?\s?\d/, /\bseats?\b/i, /\bplaces\b/i, /in the office/i, /\bcash\b/i];
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
  const FALLBACK_HOUSES = [{ id: "early5", label: "Early Five", how: "Be the first to mark any 5 of your numbers." }, { id: "top", label: "Top Line", how: "Mark all 5 numbers of the top line." }, { id: "mid", label: "Middle Line", how: "Mark all 5 numbers of the middle line." }, { id: "bot", label: "Bottom Line", how: "Mark all 5 numbers of the bottom line." }, { id: "full", label: "Full House", how: "Mark all 15 numbers of your ticket." }];
  /** The houses the game itself offers (window.ZG.PRIZE_HOUSES). Super Bumper House has its own part of the screen. */
  const housesOf = (zg) => (zg && Array.isArray(zg.PRIZE_HOUSES) && zg.PRIZE_HOUSES.length ? zg.PRIZE_HOUSES : FALLBACK_HOUSES).filter((h) => h.id !== "full2");
  const POPULAR = ["early5", "top", "full"], RECOMMENDED = ["early5", "top", "mid", "bot", "full"]; // the boss's picks, not data
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
  const defaultPrizes = (houses) => Object.fromEntries(houses.map((h) => [h.id, { on: RECOMMENDED.includes(h.id), n: 1, gift: GIFTS[0], other: "", worth: "" }]));
  const defaultBumper = () => ({ on: false, n: 1, gift: GIFTS[0], other: "", worth: "" });
  /** The prizes as the game stores them: a line per winner place (1st, 2nd, ...). Super Bumper House only with 2 tickets. */
  function buildRewards(sel, bumper, tix, cur) {
    const out = [];
    for (const [id, h] of Object.entries(sel)) {
      if (!h.on) continue;
      for (let o = 1; o <= Number(h.n); o++) out.push({ pattern: id, scope: "ticket", ordinal: o, text: prizeLine(h.gift, h.other, h.worth, cur) });
    }
    if (Number(tix) === 2 && bumper && bumper.on) for (let o = 1; o <= Number(bumper.n); o++) out.push({ pattern: "full", scope: "two_ticket", ordinal: o, text: prizeLine(bumper.gift, bumper.other, bumper.worth, cur) });
    return out;
  }
  function prizeProblems(sel, bumper, tix, houses) {
    const rows = Object.entries(sel).filter(([, h]) => h.on);
    const bump = Number(tix) === 2 && bumper && bumper.on;
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
  const fixUrl = (u) => (/^(www\.|youtu\.be\/|(m\.|music\.)?youtube\.com\/)/i.test(u) ? "https://" + u : u);
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
  const registry = {}; // step number -> function(el, ctx) that draws the step body (each step adds its own)

  const api = { COPY, STEPS, canOpen, nextAfter, dashboardOpen, badWords, registry, OCC, ZONES, wallToMs, todayIn, timeOptions, elsewhere, gameName, whenProblems, clockIn, CARDS, money, packChoices, audienceSettings, whoProblems, housesOf, tagsOf, GIFTS, prizeLine, defaultPrizes, defaultBumper, buildRewards, prizeProblems, breakMax, brandNameClean, linkKind, brandProblems, breakProblems, buildBrandPatch, contactProblems, readBack };
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
    const bar = el("ol", { class: "zf-bar", "aria-label": "Steps" });
    for (const s of STEPS) {
      const ok = canOpen(s.n, state.done), cur = state.open === s.n;
      bar.append(el("li", {}, el("button", { type: "button", class: "zf-pill" + (cur ? " cur" : "") + (state.done[s.n] ? " done" : ""), "data-step": String(s.n), ...(ok ? {} : { disabled: "" }), ...(cur ? { "aria-current": "step" } : {}), onclick: () => { state.open = s.n; draw(); scrollTo("zf-sec" + s.n); } }, el("b", { text: String(s.n) }), " ", s.name, s.optional ? el("i", { text: " (optional)" }) : null)));
    }
    const open = dashboardOpen(state.info);
    bar.append(el("li", {}, el("button", { type: "button", class: "zf-pill zf-dash", id: "zf-dash", ...(open ? {} : { disabled: "", title: COPY.dashLocked }) }, COPY.dash, open ? null : el("i", { text: " · " + COPY.dashLocked }))));
    app.append(bar);
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
    const nx = nextAfter(n, state.done);
    if (nx) state.open = nx;
    draw();
    if (nx) scrollTo("zf-sec" + nx);
  }
  /* ---- talking to the game service (same sign-in key as the current console) ---- */
  const BASE = (q.get("api") || "").replace(/\/$/, "");
  const secret = () => { try { return (window.CTK ? window.CTK.get("ctz-org") : sessionStorage.getItem("ctz-org")) || ""; } catch { return ""; } };
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
    box.append(el("h3", { text: "How many tickets does each participant get?" }));
    const tx = el("div", { class: "zf-chips", role: "radiogroup", "aria-label": "Tickets per participant" });
    for (const n of [1, 2]) tx.append(el("button", { type: "button", role: "radio", class: "zf-chip" + (prizes.tix === n ? " on" : ""), "aria-checked": String(prizes.tix === n), "data-tix": String(n), onclick: () => { prizes.tix = n; draw(); } }, n + (n === 1 ? " ticket" : " tickets")));
    box.append(tx);
    box.append(el("label", { for: "zf-cur", text: "Currency for “Worth up to” (it stays for every prize)" }));
    const cs = el("select", { id: "zf-cur", onchange: (e) => { prizes.cur = e.target.value; draw(); } });
    for (const c of CURRENCIES) cs.append(el("option", { value: c[0], ...(prizes.cur === c[0] ? { selected: "" } : {}) }, c[1].trim() + " " + c[0]));
    box.append(cs);
    const rowFor = (key, title, how, h, extra) => {
      const row = el("div", { class: "zf-prize" + (h.on ? " on" : ""), "data-house": key });
      const tags = extra ? [] : tagsOf(key);
      row.append(el("label", { class: "zf-tick" }, el("input", { type: "checkbox", id: "zf-tick-" + key, ...(h.on ? { checked: "" } : {}), onchange: (e) => { h.on = e.target.checked; draw(); } }), " ", el("b", { text: title }), tags.length ? el("span", { class: "zf-tag", text: " " + tags.join(" ") }) : null, el("small", { text: how })));
      if (h.on) {
        const nsel = el("select", { id: "zf-n-" + key, "aria-label": "How many times " + title + " can be won", onchange: (e) => { h.n = Number(e.target.value); draw(); } });
        for (let i = 1; i <= (extra ? 10 : 5); i++) nsel.append(el("option", { value: String(i), ...(h.n === i ? { selected: "" } : {}) }, String(i)));
        const gsel = el("select", { id: "zf-g-" + key, "aria-label": "The prize for " + title, onchange: (e) => { h.gift = e.target.value; draw(); } });
        for (const g of [...GIFTS, OTHER_GIFT]) gsel.append(el("option", { value: g, ...(h.gift === g ? { selected: "" } : {}) }, g));
        row.append(el("div", { class: "zf-fields" }, el("label", { for: "zf-n-" + key, text: "This prize can be won (times)" }), nsel, el("label", { for: "zf-g-" + key, text: "The prize" }), gsel,
          h.gift === OTHER_GIFT ? el("input", { type: "text", id: "zf-o-" + key, maxlength: "60", "aria-label": "Write the prize", value: h.other, oninput: (e) => { h.other = e.target.value; } }) : null,
          el("label", { for: "zf-w-" + key, text: "Worth up to (optional)" }), el("span", { class: "zf-money" }, symbolOf(prizes.cur) + " ", el("input", { type: "text", inputmode: "numeric", id: "zf-w-" + key, value: h.worth, oninput: (e) => { h.worth = e.target.value; } }))));
      }
      return row;
    };
    for (const h of houses) box.append(rowFor(h.id, h.label, h.how, prizes.sel[h.id] || (prizes.sel[h.id] = { on: false, n: 1, gift: GIFTS[0], other: "", worth: "" })));
    if (prizes.tix === 2) {
      box.append(el("h3", { text: "Two-ticket prizes" }));
      box.append(rowFor("bumper", "Super Bumper House", "Mark all 30 numbers of your two tickets together. Up to 10 winners.", prizes.bumper, true));
      box.append(el("p", {}, el("span", { class: "zf-soon", text: COPY.soon }), " Different prizes for Ticket A and Ticket B."));
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

  api.state = state; api.draw = draw; api.done = done; api.el = el;
  document.title = "Organizer console | Corporate Tambola";
  draw();
})();
