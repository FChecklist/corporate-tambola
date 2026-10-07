/* Corporate Tambola, the organizer console: ONE page with numbered, colourful steps that talk you through the game (see docs/ROLES_AND_CONSOLE_SPEC.md).
   Organizer and Host see nine steps; a Co-host sees three. It works on the owner's own machine; the game itself runs on the phones.
   The page holds the sign-in key only in this tab's session. Choices are tap chips, never drop-down lists. */
(function () {
  const ZG = window.ZG;
  const $app = document.getElementById("app");
  const q = new URLSearchParams(location.search);
  const BASE = (q.get("api") || "").replace(/\/$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let secret = ss.get("ctz-org") || "";
  { const m = location.hash.match(/^#(?:host|cohost)=(ct[hc]_[0-9a-f]{48})$/); if (m) { secret = m[1]; ss.set("ctz-org", secret); history.replaceState(null, "", location.pathname + location.search); } } // a Host or Co-host link: the key leaves the address bar at once
  { const k = q.get("k"); if (k && /^ct[hc]_[0-9a-f]{48}$/.test(k)) { secret = k; ss.set("ctz-org", secret); q.delete("k"); const rest = q.toString(); history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "")); } }
  let eid = q.get("e") || "";
  const ACT = (q.get("do") || "").toLowerCase(); // a hand-over link from the AI assistant: opens the exact card; the organizer presses the button
  const QUICK = q.get("quick") === "1";
  // A browser AI may open this page in a new tab, and a tab holds the key only for itself: another open tab of the same browser can hand it over (same site, same browser, never stored).
  const bc = typeof BroadcastChannel === "function" ? new BroadcastChannel("ctz-org-key") : null;
  const NAMES = { full2: "Full Two-Ticket House", early5: "Early Five", top: "Top line", mid: "Middle line", bot: "Bottom line", corners: "Four corners", star: "Star", full: "Full house" };
  const call = async (method, path, body) => {
    const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", "x-organizer": secret }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "http " + r.status), { status: r.status, needPack: j.needPack, payments: j.payments });
    return j;
  };
  const S = { kind: "", annNote: "", aiMsg: ss.get("ctz-aimsg") || "", contact: { email: ss.get("ctz-email") || "", phone: ss.get("ctz-phone") || "" }, info: null, people: [], claims: [], control: null, results: [], store: null, log: [], note: "", history: null, busy: false,
    open: 0, sheet: false, q: -1, f: null, sum: null, team: null, teamNote: "", teamLinks: {}, myId: "", coh: null, cohErr: "", done: {}, mode: "type", recent: [], acct: false, hostN: 0 };
  const role = () => (S.kind === "cohost" ? "cohost" : S.kind === "host" ? "host" : /^(partner|refer|sales)/.test(S.kind) ? "partner" : "organizer");
  const isOrg = () => role() === "organizer";
  const canRun = () => role() === "organizer" || role() === "host"; // the full game console
  const fmtDay = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const pad2 = (n) => String(n).padStart(2, "0");
  const istNow = () => new Date(Date.now() + 5.5 * 3600000);
  const istDateStr = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const ist = (ms) => new Date(ms + 5.5 * 3600000).toISOString().replace("T", ", ").slice(0, 20) + " IST";
  const dmy = (ms) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const money = (n) => "Rs " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const randId = () => "E" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
  const copyText = async (t) => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
  async function latestRound() { const x = await ZG.fetchRound("latest"); return x ? x.round : null; }

  // ---------- the steps ----------
  // [number, title, colour, short hint (shown when the step is open or has nothing to summarise), what the console says when you open it]
  const FULL = [
    [1, "Your game", "blue", "Pick the occasion, day and time.", "Hello. Let us start with the basics."],
    [2, "How it plays", "aqua", "Choose the size and the style.", "Good. Now, how should it play?"],
    [3, "Prizes", "violet", "Tick the prizes. Pick what each one is.", "Now the fun part: prizes."],
    [4, "Brand moments", "magenta", "Add your message or video. Test it first.", "Want your brand in the breaks?"],
    [5, "Your team", "green", "Add Hosts and Co-hosts. Send each link to one person.", "Who is helping you?"],
    [6, "Invite and share", "yellow", "Share the link. Add your guest list.", "Time to bring people in."],
    [7, "Check, publish and pay", "orange", "Check everything. Then publish and pay.", "Almost there. One last look."],
    [8, "Game day", "violet", "Run the game. Message your guests.", "It is game day."],
    [9, "After the game", "red", "Get your report. Erase data if you want.", "That was fun. Here is what is left."],
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
  const isDone = (n) => !!S.done[n] || (role() !== "cohost" && n === 7 && !!S.info && !S.draft && payState().paid) || (role() === "cohost" && n === 3 && payState().paid);
  const nextStep = () => steps().find((s) => !isDone(s[0])) || null;

  // ---------- who paid ----------
  /** One payment is enough for the game. The server says who paid; until it does, the old signals (published and not unpaid) stand in. */
  function payState() {
    const p = (S.sum && S.sum.payment && typeof S.sum.payment === "object" ? S.sum.payment : null) || (S.coh && S.coh.payment && typeof S.coh.payment === "object" ? S.coh.payment : null);
    if (p && p.status) return { paid: p.status === "paid", paidBy: p.paidBy || "", paidMs: p.paidMs || 0 };
    if (S.coh && typeof S.coh.payment === "string") return { paid: S.coh.payment === "paid", paidBy: "", paidMs: 0 };
    return { paid: !!S.info && !S.draft && !S.unpaid, paidBy: "", paidMs: 0 };
  }
  const WHO = { organizer: "Organizer", host: "Host", "co-host": "Co-host", cohost: "Co-host" };

  // ---------- the choices (the form state: it lives here, so a refresh never loses what you are typing) ----------
  const OCC = ["Diwali party", "Dealer meet", "Annual day", "Team party", "Customer event", "Family day", "Other"];
  const TIMES = [["10:00", "10 am"], ["12:00", "12 pm"], ["16:00", "4 pm"], ["18:00", "6 pm"], ["19:00", "7 pm"], ["20:00", "8 pm"], ["other", "Other time"]];
  const HS = [["early5", "Early Five"], ["top", "Top line"], ["mid", "Middle line"], ["bot", "Bottom line"], ["corners", "Four corners"], ["star", "Star"], ["full", "Full house"], ["full2", "Full Two-Ticket House"]];
  const BUNDLES = { Classic: { early5: 1, top: 1, mid: 1, bot: 1, full: 1 }, Simple: { early5: 1, full: 1 }, Rich: { early5: 1, top: 1, mid: 1, bot: 1, corners: 1, star: 1, full: 3 } };
  // [key, label, currency prefix, what to ask]. "Decide later" saves an empty prize; "No prize" saves the words No prize, so the ticket shows them.
  const PT = [["voucher", "Gift voucher", "Rs", "Amount, for example 1000"], ["hamper", "Gift hamper", "", "What is in it? (optional)"], ["phone", "Smartphone", "", "Which one? (optional)"], ["watch", "Smart watch", "", "Which one? (optional)"], ["earbuds", "Earbuds or headphones", "", "Which one? (optional)"], ["tablet", "Tablet or laptop", "", "Which one? (optional)"], ["holiday", "Holiday or weekend stay", "", "Where?"], ["dinner", "Dinner or restaurant voucher", "Rs", "Amount, for example 2000"], ["movie", "Movie tickets", "", "How many tickets?"], ["dayoff", "Extra day off", "", ""], ["other", "Something else", "", "Type the prize"], ["later", "I will decide later", "", ""], ["none", "No prize", "", ""]];
  const KINDS = [["msg", "Type a message"], ["yt", "YouTube link"], ["vid", "Paste video file link"], ["aud", "Paste audio file link"]];
  const SERVER_KIND = { msg: "speech", yt: "youtube", vid: "file", aud: "file", slides: "slides" };
  const DEFAULT_TITLE = "A message from your organizer";
  const ptOf = (k) => PT.find((p) => p[0] === k);
  /** The words a prize choice becomes on the ticket. */
  function prizeText(pt, pd) {
    const p = ptOf(pt), d = String(pd || "").trim();
    if (!p || pt === "later") return "";
    if (pt === "none") return "No prize";
    if (pt === "other") return d || "Something else";
    return p[1] + (d ? (p[2] ? ": Rs " + d.replace(/^Rs\.?\s*/i, "") : ": " + d) : "");
  }
  /** The other way round: a saved prize text becomes a choice again. */
  function prizeFrom(text) {
    const t = String(text || "").trim();
    if (!t) return { pt: "later", pd: "" };
    if (t === "No prize") return { pt: "none", pd: "" };
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
  /** A row of the form becomes what the server saves. Rows with nothing in them are left out. */
  function momentOut(m, withAfter) {
    if (momentEmpty(m)) return null;
    const kind = SERVER_KIND[m.k] || "speech";
    const b = { kind, title: (m.t || "").trim() || DEFAULT_TITLE };
    if (m.k !== "msg" && (m.v || "").trim()) b.mediaUrl = m.v.trim();
    if (String(m.s || "").trim()) b.seconds = Number(m.s);
    if (withAfter && m.after) b.after = m.after;
    return b;
  }
  const dayOpts = () => { const base = istNow(), out = []; for (let i = 0; i < 5; i++) { const d = new Date(base.getTime() + i * 86400000); out.push([istDateStr(d), i === 0 ? "Today" : i === 1 ? "Tomorrow" : DOW[d.getUTCDay()] + " " + d.getUTCDate() + " " + MON[d.getUTCMonth()]]); } return out; };
  const maxFor = (t) => ({ op: t, mid: 3 * t, cl: t });

  /** Builds the form from what the server holds. */
  function formFromServer() {
    const c = S.cfg || ZG.defaultCfg(), t = c.tickets === 2 ? 2 : 1, inf = S.info || {};
    const start = inf.startMs ? new Date(inf.startMs + 5.5 * 3600000) : new Date(Date.now() + 86400000 + 5.5 * 3600000);
    const date = istDateStr(start), time = pad2(start.getUTCHours()) + ":" + pad2(start.getUTCMinutes());
    const nm = (c.name || "").trim();
    const f = { occ: nm ? (OCC.includes(nm) && nm !== "Other" ? nm : "Other") : "Diwali party", oname: nm && !OCC.includes(nm) ? nm : "", day: dayOpts().some((d) => d[0] === date) ? date : "other", dayo: date, time: TIMES.some((x) => x[0] === time) ? time : "other", timeo: time,
      cap: String(inf.cap || 250), tix: String(t), spd: String(inf.callSeconds || 9), rnd: String(c.rounds || 1), join: S.closed ? "closed" : "open",
      inv: !!(c.invites && c.invites.on), per: String((c.invites && c.invites.per) || 4), cats: ((c.invites && c.invites.cats) || ["family", "colleagues"]).slice(), bundle: "", hs: {}, ph: "" };
    for (const [k] of HS) f.hs[k] = { on: false, n: 1, pt: "later", pd: "", orig: [] };
    for (const l of c.rewards || []) { const k = l.scope === "two_ticket" ? "full2" : l.pattern, h = f.hs[k]; if (!h) continue; h.on = true; h.n = Math.max(h.n, l.ordinal); h.orig[l.ordinal - 1] = l.text || ""; }
    for (const [k] of HS) { const h = f.hs[k]; if (h.on) { const a = prizeFrom(h.orig[0]); h.pt = a.pt; h.pd = a.pd; h.same = h.orig.every((x) => (x || "") === (h.orig[0] || "")); } }
    f.ph = (HS.find(([k]) => f.hs[k].on) || ["full"])[0];
    const pad = (arr, n) => { const o = arr.slice(0, n); while (o.length < n) o.push({ k: "msg", v: "", t: "", s: "" }); return o; };
    const lk = (c.breaks || []).filter((b) => b.kind === "lucky"), mk = (c.breaks || []).filter((b) => b.kind !== "lucky");
    f.opN = (c.opening || []).length; f.op = pad((c.opening || []).map(momentFrom), 2);
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
  const grp = (path, label, opts, multi) => `<span class="zc-lbl" id="${gid(path)}">${label}</span><div class="zc-chips" role="group" aria-labelledby="${gid(path)}">${opts.map(([v, l]) => chip(path, v, l, multi)).join("")}</div>`;
  const bchip = (path, label) => { const on = !!getP(path); return `<button type="button" class="zc-chip${on ? " on" : ""}" data-bool="${path}" aria-pressed="${on}">${esc(label)}</button>`; };
  const save = (n, label) => `<div class="zc-foot"><button class="zc-btn" type="button" data-save="${n}">${label || "Save and continue"}</button></div>`;
  const small = (t, extra) => `<p class="zc-small"${extra ? " " + extra : ""}>${t}</p>`;
  const rowl = (left, right) => `<div class="zc-rowl"><span>${left}</span>${right || ""}</div>`;
  const lockedGame = () => !!S.started && !S.draft && !S.unpaid;
  const lockedNote = () => small("The game has started, so this can no longer be changed.");
  const when = (ms) => dmy(ms).replace(/,/g, "");

  /** Prize choice: chips for the ten popular prizes, "I will decide later" and "No prize", with the input beside the chosen one. */
  function prizePick(ptPath, pdPath) {
    const pt = getP(ptPath), p = ptOf(pt);
    let h = `<div class="zc-chips" role="group" aria-label="What is the prize?">${PT.map((x) => chip(ptPath, x[0], x[1])).join("")}</div>`;
    if (p && p[3]) h += `<div class="zc-inline">${p[2] ? `<span>${p[2]}</span>` : ""}<label class="zc-sr" for="${fid(pdPath)}">${esc(p[3])}</label>${inp(pdPath, { ph: p[3], max: 70 })}</div>`;
    if (pt === "later") h += small("Fine. We will remind you before you publish.");
    if (pt === "none") h += small("The ticket shows \"No prize\". The winner is still announced.");
    return h;
  }

  // ---------- step 1: your game ----------
  function stepGame() {
    if (!S.f) return small("Loading…");
    if (lockedGame()) return lockedNote() + readBack();
    const f = S.f, min = istDateStr(istNow());
    return grp("occ", "What is the occasion?", OCC.map((o) => [o, o]))
      + (f.occ === "Other" ? `<div class="zc-gap">${lbl("f-oname", "Name your game")}${inp("oname", { max: 60, ph: "Name your game" })}</div>` : "")
      + grp("day", "Which day? (India time)", dayOpts().concat([["other", "Pick another date"]]))
      + (f.day === "other" ? `<div class="zc-gap">${lbl("f-dayo", "Pick the date")}${inp("dayo", { type: "date", attrs: `min="${min}"` })}</div>` : "")
      + grp("time", "What time does it start?", TIMES)
      + (f.time === "other" ? `<div class="zc-gap">${lbl("f-timeo", "Pick the time")}${inp("timeo", { type: "time", attrs: 'step="300"' })}</div>` : "")
      + small("Guests can join before. The first number comes 2 minutes after the start.") + save(1);
  }

  // ---------- step 2: how it plays ----------
  const capOptions = () => {
    const packs = (S.packs || []).map((k) => ({ n: k.upTo, price: k.inr_including_gst })), cur = Number(S.f.cap);
    const list = packs.length ? packs : [100, 250, 500, 1000].map((n) => ({ n, price: 0 }));
    if (cur && !list.some((p) => p.n === cur)) list.push({ n: cur, price: 0 }), list.sort((a, b) => a.n - b.n);
    return list;
  };
  function stepPlay() {
    if (!S.f) return small("Loading…");
    if (lockedGame()) return lockedNote() + readBack();
    const f = S.f, cats = ZG.INVITE_CATEGORIES || [];
    const caps = capOptions().map((p) => `<button type="button" class="zc-chip zc-wide${String(f.cap) === String(p.n) ? " on" : ""}" data-ck="cap" data-v="${p.n}" aria-pressed="${String(f.cap) === String(p.n)}"><span>Up to ${p.n} people</span><span class="zc-muted">${p.price ? money(p.price) + " with GST" : ""}</span></button>`).join("");
    return `<span class="zc-lbl" id="gl-cap">How many people at most?</span><div role="group" aria-labelledby="gl-cap">${caps}</div>` + small("Invited guests count too.")
      + grp("tix", "Tickets for each person", [["1", "1 ticket"], ["2", "2 tickets (more chances)"]])
      + grp("spd", "How fast are the numbers?", [["6", "6 seconds"], ["9", "9 seconds"], ["12", "12 seconds"], ["15", "15 seconds"]])
      + grp("rnd", "How many rounds?", [1, 2, 3, 4, 5].map((n) => [String(n), String(n)]))
      + grp("join", "Who can join?", [["open", "Anyone with the link"], ["closed", "Only people on my list"]])
      + `<span class="zc-lbl">Guest invites</span><div class="zc-chips">${bchip("inv", "Let each guest invite family or colleagues")}</div>`
      + small("Guests they invite can play, but cannot invite more people.")
      + (f.inv ? `<div class="zc-box">${grp("per", "How many can each guest invite?", [1, 2, 3, 4].map((n) => [String(n), String(n)]))}${grp("cats", "Which kinds of guests?", cats.map((k) => [k.id, k.label]), true)}
          <ul class="zc-levels"><li><b>Organizer, Hosts and Co-hosts:</b> invite any number.</li><li><b>A guest:</b> invites up to ${esc(f.per)}.</li><li><b>A person invited by a guest:</b> plays, with no invite link.</li></ul></div>` : "")
      + save(2);
  }

  // ---------- step 3: prizes ----------
  function houseBox([k, name]) {
    const f = S.f, h = f.hs[k], act = f.ph === k && h.on;
    const sumry = `${h.n} winner${Number(h.n) === 1 ? "" : "s"} · ${esc(ptext(h.pt, h.pd))}`;
    return `<div class="zc-box"><div class="zc-split"><label class="zc-check"><input type="checkbox" data-hc="${k}" ${h.on ? "checked" : ""}> ${esc(name)}</label>${h.on && !act ? `<span class="zc-split"><span class="zc-small zc-nomargin">${sumry}</span><button type="button" class="zc-mini" data-ph="${k}" aria-label="Change ${esc(name)}">Change</button></span>` : ""}</div>`
      + (act ? `${grp(`hs.${k}.n`, "How many winners?", [1, 2, 3, 4, 5].map((n) => [String(n), String(n)]))}<span class="zc-lbl">What is the prize?</span>${prizePick(`hs.${k}.pt`, `hs.${k}.pd`)}` : "") + `</div>`;
  }
  function stepPrizes() {
    if (!S.f) return small("Loading…");
    if (lockedGame()) return lockedNote() + readBack();
    const two = Number(S.f.tix) === 2;
    return grp("bundle", "Start from", ["Classic", "Simple", "Rich", "Choose myself"].map((b) => [b, b]))
      + `<span class="zc-lbl">Tick the prizes. Open one at a time.</span>` + HS.filter(([k]) => k !== "full2" || two).map(houseBox).join("")
      + small("You give the prizes. We provide the software.") + save(3);
  }

  // ---------- step 4: brand moments ----------
  const ytC = (u) => /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})/.test(u);
  function linkInfo(u) {
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
         <p class="zc-small" data-lk="${p}">${noteHtml(p)}</p>${lbl(fid(p + ".t"), "Title guests see")}${inp(p + ".t", { ph: "Title", max: 80 })}`;
    const secs = g === "cl" ? "" : `${lbl(fid(p + ".s"), "How long (seconds, optional)")}${inp(p + ".s", { type: "number", attrs: `min="15" max="${g === "op" ? 120 : 600}" step="3"`, ph: "60" })}`;
    return `<div class="zc-box"><b class="zc-bt">${esc(title)}</b>${grp(p + ".k", "What is it?", kinds)}${inputs}${secs}${m.after ? small("Set earlier to play after number " + m.after + ".") : ""}</div>`;
  }
  const countChips = (path, max) => grp(path, "How many?", Array.from({ length: max + 1 }, (_, n) => [String(n), String(n)]));
  function stepBrand() {
    if (!S.f) return small("Loading…");
    if (lockedGame()) return lockedNote() + readBack();
    const f = S.f, t = Number(f.tix) || 1, lim = maxFor(t), u = usedMoments();
    const N = (k) => Math.min(Number(f[k]) || 0, lim[{ opN: "op", midN: "mid", clN: "cl" }[k]]);
    let h = `<p class="zc-small">5 moments for each ticket. You have ${t} ticket${t === 1 ? "" : "s"} per person. Used: <b id="bmcount">${u} of ${5 * t}</b>.</p>`;
    if (u > 5 * t) h += `<p class="zc-small zc-badt">That is more than the allowance. Switch some off.</p>`;
    h += `<span class="zc-lbl zc-sec">Before the game starts</span>` + small("Plays while guests wait for the first number.") + countChips("opN", lim.op);
    for (let i = 0; i < N("opN"); i++) h += momentBox("op", i, "Moment " + (i + 1));
    h += `<span class="zc-lbl zc-sec">During the game (placed evenly)</span>` + small("The numbers pause while it is shown.") + countChips("midN", lim.mid);
    for (let i = 0; i < N("midN"); i++) h += momentBox("mid", i, "Moment " + (i + 1));
    f.lucky.forEach((l, i) => { h += `<div class="zc-box"><div class="zc-split"><b class="zc-bt">Lucky draw${f.lucky.length > 1 ? " " + (i + 1) : ""}</b><button type="button" class="zc-mini" data-luckydel="${i}" aria-label="Remove lucky draw ${i + 1}">Remove</button></div>${grp(`lucky.${i}.win`, "How many winners?", [["1", "1"], ["3", "3"], ["5", "5"], ["10", "10"]])}${grp(`lucky.${i}.style`, "How should it look?", [["draw", "A draw"], ["scratch", "A scratch card"]])}<span class="zc-lbl">What is the prize?</span>${prizePick(`lucky.${i}.pt`, `lucky.${i}.pd`)}</div>`; });
    h += `<div class="zc-chips zc-gap"><button type="button" class="zc-chip" data-luckyadd="1">Add a lucky draw</button></div>`;
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
    const rows = [["Game", `${name}, ${when(inf.startMs)}`, 1], ["People and play", `Up to ${inf.cap}, ${t} ticket${t === 1 ? "" : "s"}, a number every ${inf.callSeconds} seconds, ${S.closed ? "only people on your list" : "anyone with the link"}`, 2], ["Prizes", `${prizes} prize${prizes === 1 ? "" : "s"}${wait ? ` (${wait} to decide)` : ""}`, 3], ["Brand moments", `${used} of ${5 * t}`, 4]];
    return rows.map((r) => `<div class="zc-rowl"><span><span class="zc-small zc-nomargin">${r[0]}</span><br>${esc(r[1])}</span>${lockedGame() ? "" : `<button type="button" class="zc-mini" data-open="${r[2]}" aria-label="Change ${esc(r[0])}">Change</button>`}</div>`).join("")
      + (wait ? `<p class="zc-small zc-warnt">${wait} prize${wait === 1 ? " says" : "s say"} "decide later". You can still publish.</p>` : "");
  }

  // ---------- step 5: your team ----------
  const friendly = (e) => (e && e.status === 404 ? "This is not switched on yet. Please try again a little later." : e && e.status === 403 ? "You are not allowed to do that." : (e && e.message) || "Something went wrong. Please try again.");
  function roleCards(only) {
    const li = (ok, t) => `<li class="${ok ? "zc-yes" : "zc-no"}"><span aria-hidden="true">${ok ? "&#10003;" : "&#10007;"}</span> <span class="zc-sr">${ok ? "Can: " : "Cannot: "}</span>${t}</li>`;
    const card = (c, name, items) => `<div class="zc-role" style="background:var(--bg-tint-${c});color:var(--text-tint-${c})"><b>${name}</b><ul>${items.join("")}</ul></div>`;
    const all = { organizer: card("blue", "Organizer", [li(1, "Everything in the game"), li(1, "Sign-in keys, e-mail, AI link, close account"), li(1, "Add Hosts and Co-hosts"), li(1, "Pay")]),
      host: card("aqua", "Host", [li(1, "Change the game, prizes and brand moments"), li(1, "Publish and run the game day"), li(1, "See the guest list"), li(1, "Add Co-hosts"), li(1, "Pay"), li(0, "The account: keys, e-mail, AI link, close account"), li(0, "Add Hosts")]),
      cohost: card("green", "Co-host", [li(1, "Invite people with their own link"), li(1, "See how many they brought"), li(1, "Pay"), li(0, "Change the game"), li(0, "See the guest list or any names"), li(0, "Add anyone")])};
    return `<div class="zc-roles">${only ? all[only] : all.organizer + all.host + all.cohost}</div>`;
  }
  function teamRow(p, kind) {
    const link = S.teamLinks[p.id], canRetire = kind === "host" ? isOrg() : canRun();
    return `<div class="zc-person"><div class="zc-split"><span><b>${esc(p.label || (kind === "host" ? "Host" : "Co-host"))}</b>${kind === "cohost" && p.brought !== undefined ? ` <span class="zc-small zc-nomargin">brought ${Number(p.brought) || 0}</span>` : ""}</span>${canRetire ? `<button type="button" class="zc-mini zc-danger" data-retire="${esc(p.id)}" data-kind="${kind}" aria-label="Remove ${esc(p.label || kind)}">Remove</button>` : ""}</div>
      ${link ? `<div class="zc-linkrow"><span class="zlink">${esc(link)}</span><button type="button" class="zc-mini" data-copyteam="${esc(p.id)}">Copy link</button></div>` : small("The private link is shown only when the person is added. Remove and add again to get a new one.")}</div>`;
  }
  function stepTeam() {
    const T = S.team, max = (T && T.maxHosts) || 5, hosts = (T && T.hosts) || [], co = (T && T.cohosts) || [];
    let h = roleCards() + (S.teamNote ? `<div class="zc-toast" role="status">${esc(S.teamNote)}</div>` : "");
    if (!T && S.teamErr) h += `<p class="zc-small zc-warnt" role="status">${esc(S.teamErr)}</p>`;
    h += `<span class="zc-lbl zc-sec">Your Hosts: ${hosts.length} of ${max}</span>` + hosts.map((p) => teamRow(p, "host")).join("");
    if (isOrg()) h += `<div class="zc-inline">${lbl("hostlabel", '<span class="zc-sr">Name of the new Host</span>')}<input id="hostlabel" class="zc-in" maxlength="40" placeholder="Name (optional)"><button type="button" class="zc-btn zc-btn-s" id="hostadd"${hosts.length >= max ? " disabled" : ""}>Add a Host</button></div>${hosts.length >= max ? small(`You have the most Hosts allowed (${max}). Remove one to add another.`) : ""}`;
    else h += small("Only the Organizer adds Hosts.");
    h += `<span class="zc-lbl zc-sec">Your Co-hosts: ${co.length} (no limit)</span>` + co.map((p) => teamRow(p, "cohost")).join("");
    h += `<div class="zc-inline"><label class="zc-sr" for="cohostlabel">Name of the new Co-host</label><input id="cohostlabel" class="zc-in" maxlength="40" placeholder="Name (optional)"><button type="button" class="zc-btn zc-btn-s" id="cohostadd">Add a Co-host</button></div>`;
    return h + small("Send it to that one person only.") + `<div class="zc-foot"><button class="zc-btn" type="button" data-save="5">Continue</button></div>`;
  }

  // ---------- step 6: invite and share ----------
  const guestLink = () => location.origin + "/z.html?e=" + encodeURIComponent(eid) + (BASE ? "&api=" + encodeURIComponent(BASE) : "");
  const bigLink = () => location.origin + "/big.html?e=" + encodeURIComponent(eid);
  const inviteText = () => `You are invited to play Corporate Tambola${S.cfg && S.cfg.name ? ": " + S.cfg.name : ""}. Join here: ${guestLink()}`;
  const waUrl = (num) => "https://wa.me/" + (num || "") + "?text=" + encodeURIComponent(inviteText());
  const mailUrl = () => "mailto:?subject=" + encodeURIComponent("You are invited to Corporate Tambola") + "&body=" + encodeURIComponent(inviteText());
  const waNumber = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length === 10 ? "91" + d : d; };
  function guestListBlock() {
    if (S.shield) return `<div class="zc-block" id="shieldnote"><h3>Guest names and numbers are hidden</h3>${small("AI helper mode is on, so this page does not show or take any guest's name or mobile number: the guest list, looking up a guest, moving a ticket to a new phone, marking a seat and the report. Switch AI helper mode off (at the top) to use them yourself.")}</div>`;
    const m = S.mode;
    const modes = [["type", "Type one by one"], ["paste", "Paste from Excel"], ["file", "Upload a file"]].map(([k, l]) => `<button type="button" class="zc-chip${m === k ? " on" : ""}" data-mode="${k}" aria-pressed="${m === k}">${l}</button>`).join("");
    const form = m === "type" ? `<div class="zc-inline"><label class="zc-sr" for="gname">Name</label><input id="gname" class="zc-in" placeholder="Name" autocomplete="off"><label class="zc-sr" for="gphone">Mobile number</label><input id="gphone" class="zc-in" inputmode="tel" placeholder="98765 43210" autocomplete="off"><button type="button" class="zc-btn zc-btn-s" id="gadd">Add</button></div>`
      : m === "paste" ? `${lbl("rosterTxt", "Paste one person per line: name, mobile number")}<textarea id="rosterTxt" class="zc-in zc-ta" rows="5" placeholder="Asha, 98765 43210" autocomplete="off"></textarea><button type="button" class="zc-btn zc-btn-s" id="rosterGo">Add them</button>`
      : `${lbl("gfile", "Choose a file (CSV or text): one person per line, name then mobile number")}<input id="gfile" class="zc-in" type="file" accept=".csv,.txt,.tsv,text/csv,text/plain">${small("In Excel, save your sheet as CSV first.")}`;
    const rec = S.recent.slice(-12).map((p, i) => `<a class="zc-mini" href="${esc(waUrl(waNumber(p.phone)))}" target="_blank" rel="noopener noreferrer">WhatsApp ${esc(p.name || "guest " + (i + 1))}</a>`).join(" ");
    return `<div class="zc-block"><h3>Your guest list</h3><div class="zc-chips" role="group" aria-label="How to add people">${modes}</div>${form}
      <p class="zc-small"><b id="gcount">${S.people.length}</b> ${S.people.length === 1 ? "person is" : "people are"} on your list or have joined.</p>
      <span class="zc-lbl">Send invites</span><div class="zc-chips"><a class="zc-chip" href="${esc(waUrl(""))}" target="_blank" rel="noopener noreferrer">By WhatsApp</a><a class="zc-chip" href="${esc(mailUrl())}">By e-mail</a></div>${rec ? `<div class="zc-chips zc-gap">${rec}</div>` : ""}
      ${small("Names and numbers stay here: your AI never sees them.")}
      <h4>A guest's own data</h4>${small("A player asks to see or delete their data? Enter their mobile number. Only you can do this.")}<div class="zc-inline"><label class="zc-sr" for="pdph">Their mobile number</label><input id="pdph" class="zc-in" inputmode="tel" autocomplete="off" placeholder="98765 43210"><button type="button" class="zc-mini" id="pdsee">Show what we hold</button><button type="button" class="zc-mini zc-danger" id="pddel">Delete their data</button></div>
      <h4>Change of phone</h4>${small("A ticket plays on one phone only. If someone lost or changed their phone, enter their mobile number: the next phone they join with keeps their ticket.")}<div class="zc-inline"><label class="zc-sr" for="ubph">Their mobile number</label><input id="ubph" class="zc-in" inputmode="tel" autocomplete="off" placeholder="98765 43210"><button type="button" class="zc-mini" id="unbind">Let them move to a new phone</button></div></div>`;
  }
  function stepShare() {
    const link = guestLink();
    return `<div class="zc-block"><h3>Guest link</h3><div class="zc-linkrow"><span class="zlink">${esc(link)}</span><button type="button" class="zc-mini" id="copy">Copy link</button></div>
        <div class="zc-chips zc-gap"><a class="zc-chip" href="${esc(waUrl(""))}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a><a class="zc-chip" href="${esc(mailUrl())}">Send by e-mail</a></div>${S.draft ? small("Guests can join once you publish.") : ""}</div>
      <div class="zc-block"><h3>Big screen</h3><div class="zc-linkrow"><span class="zlink" id="biglink">${esc(bigLink())}</span><button type="button" class="zc-mini" id="copybig">Copy the link</button></div>
        <a class="zc-chip zc-gap" href="${esc(bigLink())}" target="_blank" rel="noopener">Open the big screen</a>${small("Open it on a laptop or phone connected to the big screen. It shows numbers and winners only.")}</div>
      ${guestListBlock()}
      <div class="zc-foot"><button class="zc-btn" type="button" data-save="6">Continue</button></div>`;
  }

  // ---------- step 7: check, publish and pay ----------
  /** Published but not paid: the one thing that matters now. The link went to everyone, so the game must start. */
  function payDueCard() {
    if (!S.unpaid || S.draft || !S.info) return "";
    const at = S.info.startMs, left = Math.round((at - Date.now()) / 1000);
    const whenS = new Date(at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const waiting = S.people.length;
    const fmtLeft = (s) => (s >= 86400 ? Math.floor(s / 86400) + " d " + Math.floor((s % 86400) / 3600) + " h" : s >= 3600 ? Math.floor(s / 3600) + " h " + Math.floor((s % 3600) / 60) + " min" : Math.max(0, Math.floor(s / 60)) + " min");
    const people = waiting ? `<b>${waiting} ${waiting === 1 ? "person has" : "people have"} already joined your link.</b> ` : "Your link is live. ";
    const price = S.sum && S.sum.priceInrIncludingGst ? ` (${money(S.sum.priceInrIncludingGst)} with GST)` : "";
    if (S.locked || left <= 0) return `<div class="zc-alert zc-alert-bad"><h3>Your engagement could not begin: payment is due</h3><p>${people}They are waiting, and nothing will start until it is paid. <b>Pay now and it begins in about 3 minutes, for everyone already waiting.</b> One payment is enough, from the Organizer, a Host or a Co-host.</p><a class="zc-btn zc-btn-bad" href="/pay.html?e=${encodeURIComponent(eid)}">Pay now and start</a></div>`;
    return `<div class="zc-alert"><h3>Last step: pay before the start</h3><p>${people}Your engagement starts <b>${esc(whenS)}</b> (in ${fmtLeft(left)})${esc(price)}.</p><p><b>If payment is not made before then, the engagement will not begin</b> and everyone you invited will be left waiting. It takes about 2 minutes.</p><a class="zc-btn" href="/pay.html?e=${encodeURIComponent(eid)}">Pay now</a></div>`;
  }
  const paidRow = () => { const p = payState(); return `<div class="zc-rowl zc-paid"><span><b>Paid</b><br><span class="zc-small zc-nomargin">${p.paidBy ? "Paid by the " + esc(WHO[p.paidBy] || p.paidBy) : "Paid"}${p.paidMs ? " on " + esc(dmy(p.paidMs)) : ""}. The game is on.</span></span><span aria-hidden="true">&#10003;</span></div>`; };
  function stepPublish() {
    if (!S.f) return small("Loading…");
    let h = `<span class="zc-lbl">Check your game</span>` + readBack();
    if (S.draft) {
      h += `<div class="zc-block"><h3>Publish (free)</h3>${small("Set it up first (by hand or with your AI). Participants cannot see or join a draft. Publishing is free: you confirm your details, get your link and send it to everyone. You pay before the start time, and it begins the moment you have.")}`
        + (S.pubOpen ? `${lbl("pubEmail", "Your e-mail (for the invoice)")}<input id="pubEmail" class="zc-in" type="email" value="${S.shield ? "" : esc(S.contact.email)}" autocomplete="email">${lbl("pubPhone", "Your mobile number")}<input id="pubPhone" class="zc-in" type="tel" value="${S.shield ? "" : esc(S.contact.phone)}" autocomplete="tel" placeholder="98765 43210"><div class="zc-foot"><button class="zc-btn" type="button" id="pubgo">Confirm and publish</button> <button class="zc-btn zc-btn-alt" type="button" id="pubcancel">Back</button></div>`
          : `<div class="zc-foot"><button class="zc-btn" type="button" id="publishopen">Publish my engagement, free</button></div>`)
        + (S.pubNote ? `<p class="zc-small"><b>${esc(S.pubNote)}</b></p>` : "") + `</div>`;
      h += `<div class="zc-rowl"><span><b>Pay</b><br><span class="zc-small zc-nomargin">After you publish. Pay once, from any one of you.</span></span></div>`;
    } else {
      h += rowl(`<b>Published</b><br><span class="zc-small zc-nomargin">Your link is live.</span>`, `<span aria-hidden="true">&#10003;</span>`);
      h += payState().paid ? paidRow() : (payDueCard() || rowl("<b>Pay</b><br>Waiting for the payment.", `<a class="zc-btn zc-btn-s" href="/pay.html?e=${encodeURIComponent(eid)}">Pay</a>`));
    }
    return h + `<div class="zc-foot"><button class="zc-btn zc-btn-alt" type="button" data-save="7">Continue</button></div>`;
  }

  // ---------- step 8: game day ----------
  const MSGS = ["Welcome! The game starts soon.", "Please take your seats", "Dinner is served", "Rewards at the stage in 10 minutes", "We start in 5 minutes", "Thank you for joining"];
  function announceBlock() {
    const avail = !!S.cf;
    return `<div class="zc-block"><h3>Message to everyone</h3>${small(avail ? "Shown and spoken on every phone and on the big screen. It reaches phones within about a minute." : (S.info && S.info.cap > 2000 ? "Messages are available for engagements of up to 2,000 participants." : "Messages become available once this engagement is set up."))}
      <div class="zc-chips">${MSGS.map((c) => `<button type="button" class="zc-chip" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      ${lbl("annText", "Or write your own")}<textarea id="annText" class="zc-in zc-ta" rows="2" maxlength="160" placeholder="Write a short message"></textarea>
      <div class="zc-foot"><button class="zc-btn zc-btn-s" type="button" id="annSend"${avail ? "" : " disabled"}>Send to everyone</button> <button class="zc-btn zc-btn-s zc-btn-alt" type="button" id="annClear"${avail ? "" : " disabled"}>Clear message</button></div>${S.annNote ? `<p class="zc-small"><b>${esc(S.annNote)}</b></p>` : ""}</div>`;
  }
  const lineLabel = (s) => { const lines = (S.cfg && S.cfg.rewards || []).filter((l) => (l.scope === "two_ticket" ? "full2" : l.pattern) === s.pattern), line = lines.find((l) => l.ordinal === s.ordinal); return ((S.cfg && S.cfg.rounds > 1) ? "Round " + (s.round || 1) + " · " : "") + (lines.length > 1 ? ["", "1st", "2nd", "3rd"][s.ordinal] || s.ordinal + "th" : "") + (lines.length > 1 ? " " : "") + NAMES[s.pattern] + (line && line.text ? " (" + line.text + ")" : ""); };
  const PNAME = { early5: "Early Five", top: "Top Line", mid: "Middle Line", bot: "Bottom Line", corners: "Four Corners", star: "Star", full: "Full House", full2: "Full Two-Ticket House" };
  const prizeName = (p) => { const l = (S.cfg && S.cfg.rewards || []).find((x) => x.pattern === p.pattern && x.ordinal === p.ordinal); return p.pattern === "lucky" ? "Lucky draw " + p.ordinal : (PNAME[p.pattern] || p.pattern) + (p.ordinal > 1 ? " (" + p.ordinal + ")" : "") + (l && l.text ? " · " + l.text : ""); };
  function prizeBlock() {
    const P = S.prizes || [];
    if (!S.started || S.draft) return "";
    const rows = P.map((p, i) => `<div class="zc-rowl zc-top"><span><b>${S.shield ? "Ticket " + esc(String(p.seat)) : esc(p.name || "Participant")}</b>${S.shield ? "" : " &middot; " + esc(p.phone || "")}<br><small class="zc-small zc-nomargin">${esc(prizeName(p))}${p.round > 1 ? " · round " + p.round : ""}${p.confirmed ? " · confirmed by the winner " + esc(dmy(p.confirmedMs)) : " · not confirmed by the winner yet"}</small>${p.changed && !S.shield ? `<br><small class="zc-badt"><b>Changed after the game.</b> Joined as ${esc(p.joinedWithName || "?")} · ${esc(p.joinedWithPhone || "?")}${(p.trail || []).map((t) => "; on " + esc(dmy(t.at)) + " changed to " + esc(t.name) + " · " + esc(t.phone)).join("")}</small>` : ""}</span>
      <label class="zc-check"><input type="checkbox" data-given="${i}" ${p.given ? "checked" : ""}> Prize given${p.given ? " " + esc(dmy(p.givenMs)) + (p.givenBy ? " by " + esc(p.givenBy) : "") : ""}</label></div>`).join("");
    return `<div class="zc-block"><h3>Prizes handed over</h3>${rows || small("No winner is confirmed yet.")}${small("After the game each winner confirms their name and mobile number on their own phone. Anything they change is shown here together with what they joined with. Tick \"Prize given\" when you hand the prize over: the date is kept. These details are kept for 365 days with your engagement record.")}</div>`;
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
    return `<div class="zc-block"><h3>Rewards, from the public number log</h3>${S.settledPreview.length ? S.settledPreview.map((s) => rowl(`${esc(lineLabel(s))} · call ${s.idx + 1}`, `<b>${s.pids.length} participant${s.pids.length === 1 ? "" : "s"}${s.names ? " · " + esc(s.names) : ""}</b>`)).join("") : small("No pattern is complete yet.")}
      ${small(`Claims received: ${S.claims.length}. ${bad ? `<b>${bad} not valid</b> (they do not match the public log and are ignored).` : "All claims so far match the public log."}`)}
      ${small(`Numbers come from a public random beacon. Winners are confirmed when several phones agree. You and we cannot choose or change them in the software. Confirmed so far: ${(S.published || []).filter((r) => r.pattern !== "lucky").length}.`)}
      <button type="button" class="zc-mini" id="csv"${S.settledPreview.length && !S.shield ? "" : " disabled"}>Download report</button></div>`;
  }
  function playBlock() {
    if (S.shield) return "";
    return `<div class="zc-block"><h3>Play along with your own ticket</h3>${small("You, your Hosts and Co-hosts can play too. Nobody has an advantage: the numbers come from the public randomness, you see each one at the same moment as everyone, and pausing shows nothing early. Your seat is marked in the report and you stay out of lucky draws (flag yourself before the game begins).")}<div class="zlink">${esc(guestLink())}</div>
      ${small("After you have opened the link and joined, mark your seat here:")}${lbl("mkph", "Mobile number")}<input id="mkph" class="zc-in" inputmode="tel" placeholder="98765 43210">
      <span class="zc-lbl" id="gl-mkrole">This person is the</span><div class="zc-chips" role="group" aria-labelledby="gl-mkrole">${[["organizer", "Organizer"], ["host", "Host"], ["co-host", "Co-host"], ["none", "Nobody special (remove the mark)"]].map(([v, l]) => `<button type="button" class="zc-chip${S.mkrole === v ? " on" : ""}" data-mkrole="${v}" aria-pressed="${S.mkrole === v}">${l}</button>`).join("")}</div>
      <div class="zc-foot"><button type="button" class="zc-btn zc-btn-s" id="mark">Mark this seat</button></div></div>`;
  }
  function stepDay() {
    if (S.draft) return small("This opens when your game is published. Then you run the game from here: pause, resume, end, message your guests and hand over prizes.") + `<div class="zc-foot"><button class="zc-btn zc-btn-alt" type="button" data-save="8">Continue</button></div>`;
    const paused = S.control && S.control.pausedNow;
    const ctl = `<div class="zc-block"><h3>Controls</h3><div class="zc-chips"><button type="button" class="zc-btn zc-btn-s" data-ctl="pause"${paused ? " disabled" : ""}>Pause</button><button type="button" class="zc-btn zc-btn-s zc-btn-alt" data-ctl="resume"${paused ? "" : " disabled"}>Resume</button><button type="button" class="zc-btn zc-btn-s zc-btn-bad" data-ctl="stop">End the game</button></div>
      ${small((S.cf ? `A pause reaches every phone about ${Math.max(10, Math.round(S.cf.leadRounds * 3 / 5) * 5)} seconds after you press it: phones check in on a timer, and larger engagements check less often so they stay within the free plan.` : (S.info && S.info.cap > 2000 ? "Pause is available for engagements of up to 2,000 participants. This one is larger, so it runs without it." : "Pause becomes available once this engagement is set up.")) + (paused ? " <b>Paused now.</b>" : "") + (S.ctlNote ? " " + esc(S.ctlNote) : ""))}</div>`;
    return ctl + announceBlock() + statsBlock() + prizeBlock() + rewardsBlock() + luckyBlock() + playBlock() + `<div class="zc-foot"><button class="zc-btn zc-btn-alt" type="button" data-save="8">Continue</button></div>`;
  }

  // ---------- step 9: after the game ----------
  function stepAfter() {
    const l = S.life;
    const when2 = l ? `${rowl("Names, mobile numbers, seats and invitations of participants", `<b>deleted by ${esc(ist(l.personalDeleteAtMs))}${l.purged ? " (done)" : ""}</b>`)}
      ${rowl("Complete report: a link is e-mailed to you, and the PDF is built on your own device", `<b>${l.reportSent ? "link sent" : l.purged ? "not sent" : "after the game ends"}</b>`)}
      ${rowl("Your details as Organizer / Host / Co-host, and the winners record", `<b>kept until 00:00 IST, ${esc(ist(l.fullDeleteAtMs).slice(0, 10))}</b>`)}
      ${rowl("Backups of deleted data", `<b>roll off within ${l.backupDays} days</b>`)}` : "";
    const rpt = !S.shield && S.life && S.life.reportSent && !S.life.purged ? `<div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s" id="rptopen">Open the report now</button><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="rptnew">New report link</button></div>` : "";
    return small("Within 24 hours of the game ending we send you the report, then delete every participant's name and number. Only winners' prize hand-over details stay, for 365 days.") + when2 + rpt
      + `<div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s zc-btn-bad" id="erase">Delete all participant data now</button></div>`
      + small("You tap once to confirm. You can also e-mail us from your registered address, or ask your AI assistant to request the deletion and then confirm it here. The report is e-mailed first when the game has already ended.")
      + `<div class="zc-foot"><button class="zc-btn zc-btn-alt" type="button" data-save="9">All done</button></div>`;
  }

  // ---------- the co-host's three steps ----------
  const cohInvite = () => (S.coh && S.coh.inviteLink) || guestLink();
  function cohStep(n) {
    const c = S.coh;
    if (!c) return `<p class="zc-small zc-warnt" role="status">${esc(S.cohErr || "Loading your game…")}</p>`;
    if (n === 1) return rowl(`<b>${esc(c.name || "Your game")}</b>, ${esc(c.startMs ? when(c.startMs) : "")}`, `<span class="zc-small zc-nomargin">read only</span>`) + rowl(`${Number(c.joined) || 0} ${Number(c.joined) === 1 ? "person" : "people"} joined of ${Number(c.cap) || 0}`, "") + small("You cannot change the game.") + `<span class="zc-lbl">What you can do</span>` + roleCards("cohost") + `<div class="zc-foot"><button class="zc-btn" type="button" data-save="1">Continue</button></div>`;
    if (n === 2) return `<span class="zc-lbl">Your own invite link</span>` + (c.inviteLink ? `<div class="zc-linkrow"><span class="zlink">${esc(cohInvite())}</span><button type="button" class="zc-mini" id="copy">Copy link</button></div>
      <div class="zc-chips zc-gap"><a class="zc-chip" href="${esc("https://wa.me/?text=" + encodeURIComponent("You are invited to play Corporate Tambola. Join here: " + cohInvite()))}" target="_blank" rel="noopener noreferrer">Share on WhatsApp</a><a class="zc-chip" href="${esc("mailto:?subject=" + encodeURIComponent("You are invited to Corporate Tambola") + "&body=" + encodeURIComponent("Join here: " + cohInvite()))}">Send by e-mail</a></div>` : small("Your link appears once the game is published."))
      + `
      ${rowl("People you brought", `<b>${Number(c.brought) || 0}</b>`)}${small("You can invite as many people as you like.")}
      ${small("Want your guests to invite their own friends? Ask the Organizer or a Host to switch it on. You cannot switch it on yourself.")}<div class="zc-foot"><button class="zc-btn" type="button" data-save="2">Continue</button></div>`;
    const p = payState();
    return `<p class="zc-small">Status: <b>${p.paid ? "Paid" : "Payment pending"}</b></p>` + (p.paid ? paidRow() : rowl(`<b>Pay</b>${c.startMs ? " before " + esc(when(c.startMs)) : ""}<br><span class="zc-small zc-nomargin">${c.price ? esc(typeof c.price === "number" ? money(c.price) : String(c.price)) + " with GST. " : ""}Pay once, from any one of you.</span>`, `<a class="zc-btn zc-btn-s" href="/pay.html?e=${encodeURIComponent(eid)}">Pay</a>`)) + `<div class="zc-foot"><button class="zc-btn zc-btn-alt" type="button" data-save="3">All done</button></div>`;
  }

  // ---------- the page: top bar, strips, progress, steps, help ----------
  const HELP = [
    ["How do I start?", "Open step 1 and tap your choices. Your game saves as you go."],
    ["Can the AI do this for me?", "Yes. Copy your AI link at the top and paste it in any AI chat."],
    ["Who pays?", "Any one of the Organizer, a Host or a Co-host. Only one payment is needed. Guests pay nothing."],
    ["What if nobody pays?", "The game does not begin. Nothing is charged. Once one payment is made, the game is on."],
    ["Can I change things later?", "Yes, until the game starts. Open the step and change it."],
    ["How do I add a video?", "Open Brand moments and paste the link. Tap Test it to see what guests see."],
    ["What do guests see?", "A ticket on their phone. No app to install."],
    ["Is my guests' data safe?", "It is encrypted. Names and numbers are erased within 24 hours after the game."],
    ["What is a lucky draw?", "A draw during the game. The software picks the winners from everyone playing."],
    ["How do I stop the game?", "Open Game day and tap Pause or End. Organizer and Hosts can do this."],
    ["Who can do what?", "The Organizer can do everything, including the account (keys, e-mail, AI link). A Host can do everything in the game except the account and adding Hosts. A Co-host invites people and can pay. Open step 5 to see it."],
    ["What is the big screen link?", "A page for a projector or TV. It shows numbers and winners only, never a guest's name or number. Copy it in step 6 and open it on the laptop connected to the screen."],
    ["Who do I contact?", "Write to our Grievance Officer. We reply within 30 days."],
  ];
  const ROLE_LABEL = { organizer: "Organizer", host: "Host", cohost: "Co-host", partner: "Partner" };
  function rolePill() {
    const r = role();
    if (r === "partner") return /^refer/.test(S.kind) ? "Refer and Earn Partner" : /^sales/.test(S.kind) ? "Sales Partner" : "Partner";
    if (r === "host" && S.hostN) return `Host ${S.hostN} of ${(S.team && S.team.maxHosts) || 5}`;
    return ROLE_LABEL[r];
  }
  const inGame = () => !!eid && S.screen !== "quick" && (role() === "cohost" ? !!S.coh || !!S.cohErr : !!S.cfg);
  function gameLabel() {
    if (!inGame()) return "";
    if (role() === "cohost") return S.coh ? `${S.coh.name || "Your game"} · ${S.coh.startMs ? when(S.coh.startMs) : ""}` : "";
    return `${(S.cfg && S.cfg.name) || "Your game"} · ${S.info ? when(S.info.startMs) : ""}`;
  }
  function barHtml() {
    const g = inGame() && role() !== "partner", p = payState();
    return `<header class="zc-bar"><span class="zc-brand"><img src="/icon-192.png" alt="" width="22" height="22"> <b>Corporate Tambola</b></span><span class="zc-pill zc-pill-role" id="rolepill" title="Your role">${esc(rolePill())}</span>`
      + (g ? `<span class="zc-pill ${p.paid ? "zc-pill-paid" : "zc-pill-pend"}" id="paypill" title="Payment status">${p.paid ? "Paid" : "Payment pending"}</span>` : "")
      + `<span class="zc-where">${esc(gameLabel())}</span>${isOrg() && eid ? `<button type="button" class="zc-mini" id="back">All games</button>` : ""}</header>`;
  }
  function payNote() {
    if (!inGame() || role() === "partner" || payState().paid) return "";
    return `<div class="zc-paynote" id="paynote" role="note"><b>A payment is pending for this game.</b> Just one of you needs to make it: the Organizer, a Host or a Co-host. Guests pay nothing. It is for this one game only, with no commitment and no repeat charges.</div>`;
  }
  function aiStrip() {
    if (!isOrg()) return "";
    return `<div class="zc-ai" id="aistrip"><div class="zc-split"><b>Your AI assistant work link</b>${S.aiMsg ? `<button type="button" class="zc-mini" id="aistripcopy">Copy</button>` : `<button type="button" class="zc-mini" id="aistripmake">Get my AI work link</button>`}</div>
      <div class="zc-small zc-nomargin">Copy and paste it in any AI chat, like ChatGPT, Gemini, Claude, Grok, DeepSeek, z.ai and others. Copy it as many times as you like.</div></div>`;
  }
  function progHtml() {
    const st = steps(), d = st.filter((s) => isDone(s[0])).length, p = Math.round(d * 100 / st.length);
    return `<div class="zc-prog"><div class="zc-split"><span>Your progress · saved</span><span><b>${d} of ${st.length} done</b> · ${p}%</span></div><div class="zc-track" role="progressbar" aria-label="Your progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><div class="zc-fill" id="progfill" style="width:${p}%"></div></div>
      <div class="zc-jump"><span>Jump to</span>${st.map((s) => `<button type="button" class="zc-dot" data-open="${s[0]}" aria-label="Step ${s[0]}: ${esc(s[1])}" style="background:var(--bg-tint-${s[2]});color:var(--text-tint-${s[2]})${S.open === s[0] ? `;outline:2px solid var(--text-tint-${s[2]})` : ""}">${s[0]}</button>`).join("")}<button type="button" class="zc-pillbtn" data-act="help">Help</button></div></div>`;
  }
  function sum(n) {
    if (role() === "cohost") { const c = S.coh; if (!c) return ""; return [c.startMs ? when(c.startMs) : "", `${Number(c.brought) || 0} ${Number(c.brought) === 1 ? "person" : "people"} brought`, payState().paid ? "Paid" : "Payment pending"][n - 1] || ""; }
    const c = S.cfg, inf = S.info; if (!c || !inf) return "";
    const t = c.tickets, used = (c.opening || []).length + (c.breaks || []).length + (c.closing || []).length, T = S.team;
    return [`${c.name || "Your game"}, ${when(inf.startMs)}`, `Up to ${inf.cap}, ${t} ticket${t === 1 ? "" : "s"}, ${inf.callSeconds} seconds`, `${(c.rewards || []).length} prizes`, `${used} of ${5 * t} moments`,
      T ? `${(T.hosts || []).length} Hosts, ${(T.cohosts || []).length} Co-hosts` : "", S.draft ? "Guest link ready after publishing" : "Guest link ready", payState().paid ? "Paid. The game is on" : S.draft ? "Not published yet" : "Payment pending", S.started ? "The game is on" : "Opens when the game starts", "After the game"][n - 1] || "";
  }
  const badge = (s) => `<span class="zc-num" style="background:var(--text-tint-${s[2]})">${s[0]}</span>`;
  function synHtml() {
    return steps().map((s) => { const d = isDone(s[0]); return `<button type="button" class="zc-syn${S.open === s[0] ? " act" : ""}" data-open="${s[0]}">${badge(s)}<span class="zc-syntx"><b>${esc(s[1])}</b><br><span class="zc-muted">${esc(sum(s[0]) || (d ? "Done" : "To do"))}</span></span><span class="zc-st${d ? " ok" : ""}" aria-label="${d ? "Done" : "To do"}">${d ? "&#10003;" : "&#9675;"}</span></button>`; }).join("");
  }
  const stepBody = (n) => (role() === "cohost" ? cohStep(n) : [stepGame, stepPlay, stepPrizes, stepBrand, stepTeam, stepShare, stepPublish, stepDay, stepAfter][n - 1]());
  function secHtml(s) {
    const n = s[0], isOpen = S.open === n, d = isDone(n), c = s[2], sm = sum(n);
    return `<section class="zc-card${isOpen ? " open" : ""}" id="sec${n}" style="${isOpen ? `border-color:var(--text-tint-${c})` : ""}"><button type="button" class="zc-sech" data-open="${n}" aria-expanded="${isOpen}" aria-controls="secb${n}" style="background:var(--bg-tint-${c});color:var(--text-tint-${c})">${badge(s)}<span class="zc-syntx"><b>${esc(s[1])}</b><br><span class="zc-hint">${esc(isOpen || !sm ? s[3] : sm)}</span></span><span class="zc-st">${d ? "&#10003;<span class=\"zc-sr\"> Done</span>" : isOpen ? "&#9650;" : "&#9660;"}</span></button>`
      + (isOpen ? `<div class="zc-secb" id="secb${n}"><div class="zc-say" style="background:var(--bg-tint-${c});color:var(--text-tint-${c})">${d ? "Saved. You can change it any time." : esc(s[4])}</div>${S.toast ? `<div class="zc-toast" role="status">${esc(S.toast)}</div>` : ""}${stepBody(n)}</div>` : "") + `</section>`;
  }
  function nextHtml() {
    const n = nextStep();
    if (!n) return `<div class="zc-next zc-next-ok"><span><b>All done.</b> Nothing else to do.</span></div>`;
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
    const ai = S.aiMsg
      ? `<textarea class="zc-in zc-ta zlink" id="aimsg" rows="4" readonly aria-label="Your AI work link">${esc(S.aiMsg)}</textarea><div class="zc-chips zc-gap"><button type="button" class="zc-btn zc-btn-s" id="aicopy">Copy my AI work link</button></div>${aiOptions(S.aiMsg)}<div class="zc-chips zc-gap"><button type="button" class="zc-mini" id="aifresh">Get a fresh AI link</button><button type="button" class="zc-mini" id="aireplace">Replace my AI link</button><button type="button" class="zc-mini zc-danger" id="airevoke">Stop this link</button></div><p class="zc-small"><b>Fresh link</b>: e-mailed, works 24 hours. <b>Replace</b>: stops every old link.</p>`
      : `<button type="button" class="zc-btn zc-btn-s" id="aimake">Get my AI work link</button>`;
    return `<div class="zc-block"><h3>Let your free AI assistant do the work</h3><p class="zc-small">Copy your AI work link and paste it into <b>ChatGPT, Gemini, Grok, Claude, DeepSeek, Z.ai</b> or any AI chat. It sets everything up. You keep four things: payment, Publish, erasing data, pause or stop.</p>${ai}
      <h4>An AI in your web browser, or do it yourself</h4>${small("Use an AI that works in your web browser (Claude in Chrome, Gemini in Chrome, ChatGPT Atlas, Perplexity Comet): switch on <b>AI helper mode</b> at the top, so it never sees a guest's name or number, then ask it to open this page and set up your game with the Quick setup form. It stops at Publish, erase, pause and stop, and it never pays.")}
      <div class="zc-chips"><a class="zc-chip" href="/zc.html?quick=1">Quick setup form (date and time pickers)</a><a class="zc-chip" href="/demo.html" target="_blank" rel="noopener">Try the free 70-second demo</a></div></div>`;
  }
  function acctHtml() {
    if (!isOrg()) return "";
    const open = S.acctOpen === null ? !eid : S.acctOpen;
    const keys = (S.keys || []).length ? `<div class="zc-block"><h3>Your sign-in keys</h3>${S.keys.map((k) => `<div class="zc-rowl"><span>${k.kind === "ai" ? "AI assistant link" : k.kind === "host" ? "Host key" : k.kind === "cohost" ? "Co-host key" : "Organizer key"} · made ${new Date(k.created_ms).toLocaleDateString()}${k.thisOne ? " · in use now" : ""}</span>${k.revoked ? `<i>retired</i>` : k.thisOne ? `<i>active</i>` : `<button type="button" class="zc-mini" data-retirekey="${esc(k.id)}">Retire</button>`}</div>`).join("")}${small("If you ever lose a key or think someone has it, sign in with another one and retire it here.")}</div>` : "";
    const sugs = (S.sugs || []).length ? `<div class="zc-block"><h3>Ideas to improve Corporate Tambola</h3>${small("Suggested by organizers' AI assistants. We review them all.")}${S.sugs.map((x) => rowl(esc(x.title) + (x.yours ? " · yours" : ""), `<i>${x.votes} · ${esc(x.status.replace("_", " "))}</i>`)).join("")}</div>` : "";
    const T = S.aiTrail;
    const audit = `<div class="zc-block"><h3>What your AI assistant did</h3>${T ? (T.length ? T.slice(0, 40).map((t) => `<div class="zc-rowl"><span>${esc(dmy(t.at_ms))}<br><small class="zc-small zc-nomargin">${esc(t.method)} ${esc(t.path)} → ${esc(String(t.status))} · from ${esc(t.ip || "?")} ${esc(t.country || "")} · ${esc((t.ua || "").slice(0, 60))} · key ${esc(t.key_id || "")}</small></span></div>`).join("") : small("Your AI assistant has not made any call yet.")) : `<button type="button" class="zc-mini" id="aiaudit">Show the AI activity log</button>`}${small("Every call your AI assistant makes is recorded with the time, the key used and where it came from. It is kept for 365 days.")}</div>`;
    const close = `<div class="zc-block"><h3>Close my account</h3>${small("This deletes your account and all your games. Payment records stay, as the law requires. It cannot be undone.")}<button type="button" class="zc-mini zc-danger" id="closeacct">Close my account</button></div>`;
    return `<section class="zc-card zc-acct" id="acct"><button type="button" class="zc-sech" data-acct="1" aria-expanded="${open}" style="background:var(--surface-1)"><span class="zc-num zc-num-dark">A</span><span class="zc-syntx"><b>Your account</b><br><span class="zc-hint">Your AI link, sign-in keys and records. Only the Organizer sees this.</span></span><span class="zc-st">${open ? "&#9650;" : "&#9660;"}</span></button>${open ? `<div class="zc-secb">${aiBlock()}${keys}${sugs}${audit}${close}</div>` : ""}</section>`;
  }
  // ---------- notes above the steps ----------
  const ACTTEXT = { publish: "Publishing is free. Check your e-mail and mobile number, then press \"Confirm and publish\" yourself.", erase: "Press \"Delete all participant data now\" only if you want every guest's name and number erased. It cannot be undone.", pause: "Press \"Pause\" to pause the running game for everyone.", stop: "Press \"End the game\" only if the game should end for everyone. It cannot be undone." };
  const actBanner = () => (ACT && ACTTEXT[ACT] && eid && canRun() ? `<div class="zc-toast" role="status" id="actbanner"><b>Your AI assistant brought you here.</b> ${ACTTEXT[ACT]} Nobody but you can press it.</div>` : "");
  const ACTSTEP = { publish: 7, erase: 9, pause: 8, stop: 8 };
  const shieldSwitch = () => `<div class="zc-shield"><label class="zc-check" for="shield"><input type="checkbox" id="shield" ${S.shield ? "checked" : ""}> <b>AI helper mode</b></label><div class="zc-small zc-nomargin">${S.shield ? "ON: guests' names and mobile numbers are hidden on this page, so an AI that works in your browser cannot see them. To load your guest list, look up a guest or move a ticket to a new phone, switch this off." : "Using an AI that works in your browser (Claude in Chrome, Gemini in Chrome, ChatGPT Atlas, Comet)? Switch this on first: it hides every guest's name and mobile number from the AI."}</div></div>`;
  function alertZone() {
    let h = actBanner();
    if (S.note) h += `<div class="zc-toast" role="status" id="zcnote">${esc(S.note)}</div>`;
    if (canRun()) {
      if (S.locked && !S.draft) h += payDueCard();
      if ((S.reqs || []).length) h += `<div class="zc-alert"><h3>Your AI assistant is asking</h3>${S.reqs.map((r) => rowl(esc(r.action) + (r.note ? " · " + esc(r.note) : ""))).join("")}<div class="zc-chips"><button type="button" class="zc-btn zc-btn-s${S.reqs[0].action === "erase" ? " zc-btn-bad" : ""}" id="reqok">${S.reqs[0].action === "erase" ? "Confirm: delete all participant data" : "Approve (" + esc(S.reqs[0].action) + ")"}</button><button type="button" class="zc-btn zc-btn-s zc-btn-alt" id="reqno">Dismiss</button></div></div>`;
      if (!S.draft && S.cfg) h += `<div class="zc-live" id="zclive"><b>${S.people.length}</b> ${S.people.length === 1 ? "person" : "people"} · numbers called <b>${S.log.length} / 90</b>${S.cfg.rounds > 1 ? ` · round ${S.round} of ${S.cfg.rounds}` : ""}</div>`;
    }
    return h;
  }
  function mainHtml() {
    const r = role();
    return `<div id="zc-top"></div>${alertZone()}${canRun() ? shieldSwitch() : ""}<div class="zc-small zc-rolenote">${esc(ROLE_NOTE[r])}</div>${nextHtml()}${steps().map(secHtml).join("")}${helpHtml()}${acctHtml()}`;
  }
  function tabsHtml() {
    const n = nextStep();
    return `<nav class="zc-tabs" aria-label="Steps">${[["sheet", "Steps"], [n ? "next" : "top", "Next"], ["help", "Help"], ["top", "Top"]].map(([a, l]) => a === "next" ? `<button type="button" class="zc-tab" data-open="${n[0]}">${l}</button>` : `<button type="button" class="zc-tab" data-act="${a}">${l}</button>`).join("")}</nav>`;
  }
  function frame(inner, withNav) {
    return `<div class="zc-frame">${barHtml()}${withNav ? payNote() : ""}${aiStrip()}${withNav ? progHtml() : ""}${withNav && S.sheet ? `<div class="zc-sheet"><div class="zc-small zc-nomargin">Your game at a glance</div>${synHtml()}</div>` : ""}${inner}${withNav ? tabsHtml() : ""}</div>`;
  }
  function engView() {
    const r = role();
    const side = `<aside class="zc-side"><div class="zc-me"><span class="zc-num zc-num-dark">${esc(ROLE_LABEL[r].charAt(0))}</span><span><span class="zc-muted">You are</span><br><b>${esc(rolePill())}</b></span></div><div class="zc-small zc-nomargin">Your game at a glance</div>${synHtml()}${(S.sum && S.sum.priceInrIncludingGst) ? `<div class="zc-small">Price: ${esc(money(S.sum.priceInrIncludingGst))} with GST<br>Payment: <b>${payState().paid ? "Paid" : "Pending"}</b></div>` : `<div class="zc-small">Payment: <b>${payState().paid ? "Paid" : "Pending"}</b></div>`}</aside>`;
    return frame(`<div class="zc-body">${side}<div class="zc-main">${mainHtml()}</div></div>`, true);
  }
  function cohostView() {
    const side = `<aside class="zc-side"><div class="zc-me"><span class="zc-num zc-num-dark">C</span><span><span class="zc-muted">You are</span><br><b>Co-host</b></span></div><div class="zc-small zc-nomargin">Your game at a glance</div>${synHtml()}</aside>`;
    return frame(`<div class="zc-body">${side}<div class="zc-main"><div id="zc-top"></div>${S.note ? `<div class="zc-toast" role="status">${esc(S.note)}</div>` : ""}${S.cohErr && !S.coh ? `<div class="zc-toast" role="status">${esc(S.cohErr)}</div>` : ""}<div class="zc-small zc-rolenote">${esc(ROLE_NOTE.cohost)}</div>${nextHtml()}${steps().map(secHtml).join("")}${helpHtml()}</div></div>`, true);
  }
  const loadingView = () => frame(`<div class="zc-body"><div class="zc-main"><div class="zc-toast" role="status">${esc(S.note || "Loading…")}</div>${eid && isOrg() ? "" : ""}</div></div>`, false);
  const waitLinkView = () => frame(`<div class="zc-body"><div class="zc-main"><div class="zc-block"><p style="margin:0">Open the link your ${role() === "cohost" ? "Organizer or Host" : "Organizer"} sent you. It opens the game directly.</p></div>${S.note ? `<div class="zc-toast" role="status">${esc(S.note)}</div>` : ""}</div></div>`, false);
  const partnerView = () => frame(`<div class="zc-body"><div class="zc-main"><div class="zc-block"><h3>Your partner area</h3><p>Your partner screens are on their own page.</p><a class="zc-btn zc-btn-s" href="/partner.html">Open my partner area</a></div></div></div>`, false);
  function loginView(msg) {
    return `<div class="zc-frame zc-login"><header class="zc-bar"><span class="zc-brand"><img src="/icon-192.png" alt="" width="22" height="22"> <b>Corporate Tambola</b></span></header><div class="zc-main"><div class="zc-block"><h3>Sign in</h3>
      <label class="zc-lbl" for="sec">Your sign-in key</label><input id="sec" class="zc-in" type="password" autocomplete="off" value="${esc(secret)}">
      ${msg ? `<div class="zc-toast" role="status">${esc(msg)}</div>` : ""}<div class="zc-foot"><button class="zc-btn" id="in" type="button">Continue</button></div></div><div class="zc-block"><h3>Coming back?</h3>${small("Sign in with your work e-mail: we send you a 6-digit code, no password.")}<a class="zc-chip" href="/#login" id="goLogin">Sign in with e-mail</a></div></div></div>`;
  }
  // ---------- home (no game open yet) ----------
  function homeView() {
    const h = S.history, last = h && h.engagements[0];
    const bar = last ? `<div class="zc-lastbar"><span>Your last game was on <b>${fmtDay(last.created_ms)}</b> · ${last.participants} participants</span><span><button type="button" class="zc-mini" data-reuse="${esc(last.id)}">Reuse the data</button> <button type="button" class="zc-mini" data-hist="1">History</button></span></div>` : "";
    const hist = S.showHist && h ? `<div class="zc-block"><h3>History · kept ${h.retentionDays} days</h3>${h.engagements.map((e) => `<div class="zc-rowl"><span>${esc(e.id)} · ${fmtDay(e.created_ms)} · ${e.participants} people${e.draft ? " · draft" : ""}</span><span><button type="button" class="zc-mini" data-open-game="${esc(e.id)}">Open</button> <button type="button" class="zc-mini" data-reuse="${esc(e.id)}">Reuse</button></span></div>`).join("")}</div>` : "";
    const main = `${S.note ? `<div class="zc-toast" role="status">${esc(S.note)}</div>` : ""}${shieldSwitch()}<div class="zc-small zc-rolenote">${esc(ROLE_NOTE.organizer)}</div>
      <div class="zc-block"><h3>Start a new game</h3>${small("You build it first, at no cost. You pay only when you publish. The first number is called two minutes after the start time.")}<div class="zc-chips"><button type="button" class="zc-btn zc-btn-s" id="mk">Start a new game</button><a class="zc-chip" href="/zc.html?quick=1">Quick setup form</a></div></div>${bar}${hist}${acctHtml()}`;
    return frame(`<div class="zc-body"><div class="zc-main">${main}</div></div>`, false);
  }
  // ---------- Quick setup: the first three steps as one form, with a real date and time picker (the AI route and the browser-AI route use it) ----------
  function quickDefault() {
    const t = new Date(istNow().getTime() + 86400000);
    const f = { occ: "Other", oname: "", day: "other", dayo: istDateStr(t), time: "other", timeo: "16:00", cap: "250", tix: "1", spd: "9", rnd: "1", join: "open", inv: false, per: "4", cats: ["family", "colleagues"], bundle: "Classic", hs: {}, ph: "" };
    for (const [k] of HS) f.hs[k] = { on: false, n: 1, pt: "later", pd: "", orig: [] };
    applyBundleTo(f, "Classic");
    return f;
  }
  function applyBundleTo(f, b) { const set = BUNDLES[b]; if (!set) return; for (const [k] of HS) { const h = f.hs[k]; h.on = !!set[k]; if (set[k]) h.n = set[k]; } f.ph = (HS.find(([k]) => f.hs[k].on) || ["full"])[0]; }
  function quickView() {
    const f = S.f;
    const caps = capOptions().map((p) => `<button type="button" class="zc-chip zc-wide${String(f.cap) === String(p.n) ? " on" : ""}" data-ck="cap" data-v="${p.n}" aria-pressed="${String(f.cap) === String(p.n)}"><span>Up to ${p.n} people</span><span class="zc-muted">${p.price ? money(p.price) + " including GST" : ""}</span></button>`).join("");
    const houses = HS.filter(([k]) => k !== "full2").map(([k, n]) => `<div class="zc-box"><label class="zc-check" for="qk-h-${k}"><input type="checkbox" id="qk-h-${k}" data-hc="${k}" ${f.hs[k].on ? "checked" : ""}> ${n}</label>${grp(`hs.${k}.n`, "Winners", [1, 2, 3, 4, 5].map((x) => [String(x), String(x)]))}${lbl("qk-t-" + k, "What is the prize? (up to 80 characters; you can fill this in later)")}<input id="qk-t-${k}" class="zc-in" data-qkprize="${k}" maxlength="80" value="${esc(f.hs[k].pt === "later" ? "" : prizeText(f.hs[k].pt, f.hs[k].pd))}"></div>`).join("");
    const main = `${shieldSwitch()}<div class="zc-block"><h3>1. Which game?</h3>${lbl("qk-name", "Name of the game (optional)")}<input id="qk-name" class="zc-in" data-fi="oname" maxlength="60" placeholder="Diwali party" value="${esc(f.oname)}">
        ${grp("occ", "Occasion", OCC.map((o) => [o, o]))}${lbl("qk-date", "Day (India time)")}<input id="qk-date" class="zc-in" type="date" data-fi="dayo" value="${esc(f.dayo)}" min="${istDateStr(istNow())}">${lbl("qk-time", "Start time (India time)")}<input id="qk-time" class="zc-in" type="time" data-fi="timeo" step="300" value="${esc(f.timeo)}">
        ${small("Guests can join before. The first number is called 2 minutes after the start time. Choose a time at least 2 hours ahead.")}</div>
      <div class="zc-block"><h3>2. How will it play?</h3><span class="zc-lbl" id="gl-cap">How many people at most? (people invited by your guests count too)</span><div role="group" aria-labelledby="gl-cap">${caps}</div>${grp("tix", "Tickets for each person", [["1", "1 ticket"], ["2", "2 tickets (more chances)"]])}${grp("spd", "Speed", [["6", "Fast: a number every 6 seconds"], ["9", "Normal: every 9 seconds (recommended)"], ["12", "Relaxed: every 12 seconds"], ["15", "Slow: every 15 seconds"]])}${grp("rnd", "Rounds", [1, 2, 3, 4, 5].map((n) => [String(n), String(n)]))}${grp("join", "Who can join?", [["open", "Anyone with the link"], ["closed", "Only people on my list"]])}<div class="zc-chips zc-gap">${bchip("inv", "Let each guest invite up to 4 family or colleagues")}</div></div>
      <div class="zc-block"><h3>3. Prizes</h3>${grp("bundle", "Start from", ["Classic", "Simple", "Rich"].map((b) => [b, b]))}${houses}${small("You give the prizes; we only provide the software. Videos, messages and a lucky draw are added on the next page.")}</div>
      <div class="zc-block"><h3>4. Check and save</h3><div id="qk-summary" class="zc-small" aria-live="polite"></div><div id="qk-err" class="zc-toast zc-badt" role="alert" style="display:none"></div><div class="zc-foot"><button class="zc-btn" id="qk-save" type="button">Yes, save my draft</button></div>${small("Nothing is charged. Nobody else can see a draft. Next you publish it (free) and pay before the start time.")}</div>`;
    return frame(`<div class="zc-body"><div class="zc-main">${main}</div></div>`, false);
  }
  function quickRead() {
    const f = S.f, [y, mo, d] = (f.dayo || "").split("-").map(Number), [h, mi] = (f.timeo || "16:00").split(":").map(Number);
    const startMs = Date.UTC(y, mo - 1, d, h, mi) - 5.5 * 3600000, rewards = [];
    for (const [k] of HS) { const hh = f.hs[k]; if (k === "full2" || !hh.on) continue; const t = prizeText(hh.pt, hh.pd).slice(0, 80); for (let o = 1; o <= (Number(hh.n) || 1); o++) rewards.push({ pattern: k, ordinal: o, text: t }); }
    const name = (f.oname || "").trim() || (f.occ !== "Other" ? f.occ : "");
    return { name, occ: f.occ === "Other" ? "EVENT" : f.occ.toUpperCase().replace(/[^A-Z0-9]+/g, "-"), startMs, cap: Number(f.cap), tickets: Number(f.tix) || 1, speed: Number(f.spd), rounds: Number(f.rnd), closed: f.join === "closed", invite: !!f.inv, rewards };
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
  S.shield = ss.get("ctz-shield") === "1"; S.acctOpen = null; S.mkrole = "organizer"; S.screen = "";
  const GROUPS = { 1: ["occ", "oname", "day", "dayo", "time", "timeo"], 2: ["cap", "tix", "spd", "rnd", "join", "inv", "per", "cats"], 3: ["hs", "ph", "bundle"], 4: ["opN", "op", "midN", "mid", "clN", "cl", "lucky"] };
  /** Brings the form in line with what the server holds, step by step, but never over a step the person has started changing (an AI may be changing the draft at the same time). */
  function syncForm() {
    const fresh = formFromServer();
    if (!S.f || S.fFor !== eid) { S.f = fresh; S.fBase = JSON.parse(JSON.stringify(fresh)); S.fFor = eid; return; }
    for (const n of [1, 2, 3, 4]) { if (GROUPS[n].every((k) => JSON.stringify(S.f[k]) === JSON.stringify(S.fBase[k]))) GROUPS[n].forEach((k) => (S.f[k] = fresh[k])); }
    S.fBase = JSON.parse(JSON.stringify(fresh));
  }
  async function loadPacks() { try { S.packs = (await fetch(BASE + "/api/z/ai-manifest").then((r) => r.json())).packs || []; } catch { S.packs = []; } }

  async function refreshHome() {
    S.screen = "home";
    try { S.keys = (await call("GET", "/api/org/keys")).keys; } catch { S.keys = []; }
    try { S.sugs = (await call("GET", "/api/z/suggestions")).suggestions.slice(0, 6); } catch { S.sugs = []; }
    try { S.history = await call("GET", "/api/history"); } catch (e) { if (e.status === 403) { secret = ""; S.loginMsg = "That sign-in key was not accepted."; } }
    redraw();
  }
  async function loadAccount() { try { S.keys = (await call("GET", "/api/org/keys")).keys; } catch { S.keys = []; } redraw(); }
  async function refreshTeam() {
    if (!canRun() || !secret) return;
    try { S.team = await call("GET", "/api/org/team"); S.teamErr = ""; } catch (e) { S.team = null; S.teamErr = e.status === 404 || e.status === 405 ? "The team list is not switched on yet. You can add people as soon as it is." : friendly(e); }
    S.hostN = 0;
    if (S.team && role() === "host") { try { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("key|" + secret)); const id = Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("").slice(0, 10); S.hostN = ((S.team.hosts || []).findIndex((h) => h.id === id) + 1) || 0; } catch { /* the label stays plain */ } }
    redraw();
  }
  function initOpen() {
    if (S.openInit === eid) return; S.openInit = eid; loadDone();
    const nx = nextStep();
    S.open = ACTSTEP[ACT] && canRun() ? ACTSTEP[ACT] : role() !== "cohost" && S.started && !S.draft && !S.unpaid ? 8 : role() !== "cohost" && !S.draft && !payState().paid ? 7 : nx ? nx[0] : 1;
  }
  async function refreshCohost() {
    try { S.coh = await call("GET", `/api/z/${eid}/cohost`); S.cohErr = ""; } catch (e) { S.cohErr = e.status === 404 || e.status === 405 ? "Your game page is not switched on yet. Please try again a little later." : friendly(e); }
    initOpen(); redraw();
  }
  async function refreshEng() {
    if (role() === "cohost") return refreshCohost();
    S.screen = "eng";
    try {
      S.info = await call("GET", `/api/z/${eid}/info`); S.draft = !!S.info.draft; S.unpaid = !!S.info.unpaid; S.locked = !!S.info.locked;
      if (ACT === "publish" && S.draft && !S.actOpened) { S.pubOpen = true; S.actOpened = true; } // the AI's hand-over link: the publish card is open and waiting for the organizer's own tap
      let pr = await call("GET", `/api/z/${eid}/participants`); S.people = pr.participants; S.closed = pr.closed;
      while (S.people.length < pr.total) { const more = await call("GET", `/api/z/${eid}/participants?offset=${S.people.length}`); if (!more.participants.length) break; S.people.push(...more.participants); } // a long list arrives in pages
      S.cfg = { name: pr.name, tickets: pr.tickets, rewards: pr.rewards, breaks: pr.breaks, opening: pr.opening || [], closing: pr.closing || [], rounds: pr.rounds || 1, invites: pr.invites };
      try { S.sum = await call("GET", `/api/z/${eid}/summary`); } catch { S.sum = S.sum || null; }
      try { S.claims = (await call("GET", `/api/z/${eid}/claims`)).claims; } catch (e) { if (isOrg()) throw e; S.claims = []; }
      try { S.reqs = (await call("GET", `/api/z/${eid}/control/request`)).requests; } catch { S.reqs = []; }
      if (!S.started && !S.draft) { try { const k = await TBControl.ensureKey(eid, { token: secret, base: BASE, prefix: "/api/z" }); if (!k.ok && !S.ctlNote) S.ctlNote = k.reason || ""; } catch { /* the pause is optional; the engagement does not depend on it */ } } // an engagement made by the AI has no pause key until the organizer opens it here
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
      S.settledPreview = settled.map((x) => ({ ...x, names: x.pids.length <= 3 && !S.shield ? x.pids.map((p) => nm.get(p) || "Participant").join(", ") : "" }));
      S.lucky = await computeLucky(now);
      try { S.life = await call("GET", `/api/z/${eid}/life`); } catch { S.life = null; }
      if (S.started && !S.draft) { try { S.prizes = (await call("GET", `/api/z/${eid}/prizes`)).prizes || []; } catch { S.prizes = S.prizes || []; } try { S.published = (await fetch(BASE + `/api/z/${eid}/results`).then((r) => r.json())).results || []; } catch { /* shown next time */ } } // the software decides the winners; this page only watches
      syncForm(); initOpen();
    } catch (e) { S.note = e.status === 404 ? "That engagement was not found." : e.status === 403 ? "Your sign-in has expired or does not belong to this engagement. Open the home page and sign in again." : "Could not refresh. Retrying…"; }
    redraw();
  }

  // ---------- drawing ----------
  let lastHtml = "";
  function view() {
    if (!secret) return loginView(S.loginMsg || "");
    const r = role();
    if (r === "partner") return partnerView();
    if (!eid) { if (S.screen === "quick" && canRun()) return quickView(); return r === "organizer" ? homeView() : waitLinkView(); }
    if (r === "cohost") return cohostView();
    if (!S.cfg || !S.info || !S.f) return loadingView();
    return engView();
  }
  const redraw = () => draw(view());
  /** Redraws only when something really changed: an AI (or a person) working on the page keeps the same elements instead of having them replaced every few seconds. */
  function draw(v) { if (v === lastHtml && $app.firstChild) return; lastHtml = v; $app.innerHTML = v; bind(); a11y(); markAct(); }
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
  function openStep(n) { S.open = n; S.sheet = false; S.toast = ""; S.note = ""; if (n === 5) refreshTeam(); redraw(); go("sec" + n); }
  function advance(n) { const nx = steps().find((s) => s[0] > n && !isDone(s[0])) || nextStep(); S.open = nx ? nx[0] : n; S.sheet = false; redraw(); go("sec" + S.open); }

  // ---------- saving a step ----------
  const MSG_PAST = "Please choose a start time in the future (at least 2 hours ahead is best).";
  function startOf(f) {
    const date = f.day === "other" ? f.dayo : f.day, time = f.time === "other" ? f.timeo : f.time;
    if (!date || !time) throw new Error("Pick the day and the time.");
    const [y, mo, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
    return Date.UTC(y, mo - 1, d, h, mi) - 5.5 * 3600000;
  }
  function rewardsOut(f) {
    const rewards = [];
    for (const [k] of HS) {
      const h = f.hs[k]; if (!h.on || (k === "full2" && Number(f.tix) !== 2)) continue;
      for (let o = 1; o <= (Number(h.n) || 1); o++) rewards.push({ pattern: k === "full2" ? "full" : k, scope: k === "full2" ? "two_ticket" : "ticket", ordinal: o, text: !h.dirty && h.orig[o - 1] !== undefined ? h.orig[o - 1] : prizeText(h.pt, h.pd) });
    }
    return rewards;
  }
  function momentsOut(f) {
    const t = Number(f.tix) || 1, lim = maxFor(t);
    const rows = (g, N, cap, after) => f[g].slice(0, Math.min(Number(N) || 0, cap)).map((m) => momentOut(m, after)).filter(Boolean);
    const lucky = f.lucky.map((l) => ({ kind: "lucky", title: prizeText(l.pt, l.pd) || "Lucky draw", winners: Number(l.win) || 3, ...(l.style === "scratch" ? { style: "scratch" } : {}), ...(l.after ? { after: l.after, seconds: l.sec || 60 } : {}) }));
    return { tickets: t, opening: rows("op", f.opN, lim.op, false), breaks: [...rows("mid", f.midN, lim.mid, true), ...lucky], closing: rows("cl", f.clN, lim.cl, false) };
  }
  async function saveStep(n) {
    S.toast = "";
    try {
      const f = S.f;
      if (role() === "cohost") { markDone(n); return advance(n); }
      if (n === 1) { const name = f.occ === "Other" ? (f.oname || "").trim() : f.occ, ms = startOf(f); if (!(ms > Date.now())) throw new Error(MSG_PAST); await call("PATCH", `/api/z/${eid}/settings`, { name, startRound: ZG.roundAt(ms) }); }
      else if (n === 2) { if (f.inv && !f.cats.length) throw new Error("Pick at least one kind of guest."); await call("PATCH", `/api/z/${eid}/settings`, { cap: Number(f.cap), callSeconds: Number(f.spd), tickets: Number(f.tix), rounds: Number(f.rnd), closed: f.join === "closed", invites: { on: !!f.inv, per: Number(f.per) || 4, cats: f.cats } }); }
      else if (n === 3) { const rewards = rewardsOut(f); if (!rewards.length) throw new Error("Tick at least one prize."); await call("PATCH", `/api/z/${eid}/settings`, { tickets: Number(f.tix), rewards }); }
      else if (n === 4) { await call("PATCH", `/api/z/${eid}/settings`, momentsOut(f)); }
      if (n <= 4) { markDone(n); S.note = "Saved."; await refreshEng(); return advance(n); }
      markDone(n); advance(n);
    } catch (e) { S.toast = friendly(e); redraw(); go("sec" + n); }
  }

  // ---------- quick setup: make the draft ----------
  async function makeDraft(r, id, hasName) {
    const res = await call("POST", "/api/z", { id, ...(r.name ? { name: r.name } : {}), startRound: ZG.roundAt(r.startMs), callSeconds: r.speed, cap: r.cap, tickets: r.tickets, rounds: r.rounds, rewards: r.rewards, closed: r.closed });
    return res;
  }
  async function afterCreate(id, r) {
    if (r && r.invite) await call("PATCH", `/api/z/${id}/settings`, { invites: { on: true, per: 4, cats: ["family", "colleagues"] } });
    let k = { ok: false, reason: "" }; try { k = await TBControl.ensureKey(id, { token: secret, base: BASE, prefix: "/api/z" }); } catch { /* the pause key is optional: the game does not depend on it */ }
    eid = id; history.replaceState(null, "", "?e=" + id + (BASE ? "&api=" + encodeURIComponent(BASE) : "")); S.store = null; S.f = null; S.fFor = ""; S.openInit = ""; S.cfg = null; S.info = null; S.sum = null; S.screen = "eng";
    return k;
  }
  function quickSummary() {
    const el = document.getElementById("qk-summary"); if (!el) return;
    try { const r = quickRead(); const when2 = new Date(r.startMs + 5.5 * 3600000).toISOString(), ok = r.startMs > Date.now();
      el.textContent = `${r.name || "Your game"}: ${when2.slice(0, 10)} at ${when2.slice(11, 16)} India time${ok ? "" : " (that time has passed: choose a later one)"}; up to ${r.cap} people; ${r.tickets} ticket${r.tickets === 1 ? "" : "s"} each, a number every ${r.speed} seconds, ${r.rounds} round${r.rounds === 1 ? "" : "s"}; ${r.closed ? "only people on your list" : "anyone with the link"}; ${r.rewards.length} prize${r.rewards.length === 1 ? "" : "s"}.`; } catch { el.textContent = ""; }
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
  async function startNew() {
    const saved = S.f; S.f = quickDefault(); const rr = quickRead(); S.f = saved;
    const id = randId();
    await makeDraft({ ...rr, name: "" }, id);
    const k = await afterCreate(id, rr);
    S.note = "Your draft is saved. Open each step and tap your choices." + (k.ok || !k.reason ? "" : " Pause control is unavailable: " + k.reason);
    refreshEng();
  }

  // ---------- buttons and fields ----------
  const parseList = (text) => String(text).split(/\r?\n/).map((l) => l.replace(/"/g, "").trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)[,;\t ]+([+()\d][\d ()+-]{8,})$/) || l.match(/^()([+()\d][\d ()+-]{8,})$/); return m ? { name: m[1].trim(), phone: m[2].trim() } : { name: l, phone: "" }; });
  async function addPeople(people) {
    if (!people.length) { S.note = "Paste your list first."; return redraw(); }
    let added = 0, skipped = 0, invalid = 0;
    try {
      for (let i = 0; i < people.length; i += 100) { const r = await call("POST", `/api/z/${eid}/roster`, { people: people.slice(i, i + 100) }); added += r.added || 0; skipped += r.skipped || 0; invalid += r.invalid || 0; }
      S.note = `${added} added${skipped ? ", " + skipped + " skipped" : ""}${invalid ? ", " + invalid + " not valid" : ""}.`;
      if (!S.shield) S.recent = S.recent.concat(people.filter((p) => String(p.phone).replace(/\D/g, "").length >= 10)).slice(-30); // kept in this tab's memory only, to offer a WhatsApp button per person
    } catch (e) { S.note = e.message; }
    refreshEng();
  }
  function applyBundle(b) { applyBundleTo(S.f, b); }
  function onField(el) {
    const path = el.dataset.fi;
    setP(path, el.value);
    if (/^hs\.[a-z0-9]+\.pd$/.test(path)) S.f.hs[path.split(".")[1]].dirty = true;
    const lk = document.querySelector(`[data-lk="${path.replace(/\.(v|t|s)$/, "")}"]`);
    if (lk && /\.v$/.test(path)) lk.innerHTML = noteHtml(path.replace(/\.v$/, ""));
    const bm = document.getElementById("bmcount"); if (bm && S.f) bm.textContent = `${usedMoments()} of ${5 * (Number(S.f.tix) || 1)}`;
    if (document.getElementById("qk-summary")) quickSummary();
  }
  function chipClick(b) {
    const path = b.dataset.ck, v = b.dataset.v;
    if (b.dataset.multi) { const a = (getP(path) || []).slice(), i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); setP(path, a); }
    else { setP(path, v); if (path === "bundle") applyBundle(v); }
    if (/^hs\.[a-z0-9]+\.(n|pt|pd)$/.test(path)) S.f.hs[path.split(".")[1]].dirty = true;
    if (path === "tix" && v === "1" && S.f.hs.full2) S.f.hs.full2.on = false;
    redraw(); if (document.getElementById("qk-summary")) quickSummary();
  }
  function bind() {
    const $ = (id) => document.getElementById(id);
    const all = (sel, fn) => $app.querySelectorAll(sel).forEach(fn);
    const noteAndDraw = (t) => { S.note = t; redraw(); };
    if ($("shield")) $("shield").onchange = () => { S.shield = $("shield").checked; ss.set("ctz-shield", S.shield ? "1" : "0"); S.nameCache = null; lastHtml = ""; if (!eid) return redraw(); if (role() === "cohost") return redraw(); refreshEng(); };
    if ($("goLogin")) $("goLogin").onclick = () => { try { sessionStorage.setItem("ctz-next", location.pathname + location.search); } catch {} };
    if ($("in")) $("in").onclick = () => { secret = $("sec").value.trim(); ss.set("ctz-org", secret); S.loginMsg = ""; bootstrap(); };
    if ($("back")) $("back").onclick = () => { eid = ""; S.cfg = null; S.info = null; S.f = null; S.fFor = ""; S.openInit = ""; S.note = ""; S.sum = null; history.replaceState(null, "", location.pathname + (BASE ? "?api=" + encodeURIComponent(BASE) : "")); refreshHome(); };
    if ($("mk")) $("mk").onclick = async () => { $("mk").disabled = true; try { await startNew(); } catch (e) { noteAndDraw(friendly(e)); } };
    // moving around
    all("[data-open]", (b) => (b.onclick = () => openStep(Number(b.dataset.open))));
    all("[data-acct]", (b) => (b.onclick = () => { S.acctOpen = !(S.acctOpen === null ? !eid : S.acctOpen); redraw(); if (S.acctOpen) { go("acct"); if (!Array.isArray(S.keys)) loadAccount(); } }));
    all("[data-q]", (b) => (b.onclick = () => { const i = Number(b.dataset.q); S.q = S.q === i ? -1 : i; redraw(); }));
    all("[data-act]", (b) => (b.onclick = () => {
      const a = b.dataset.act; S.toast = "";
      if (a === "help") { S.q = S.q < 0 ? 0 : S.q; S.sheet = false; redraw(); return go("help"); }
      if (a === "top") { S.sheet = false; redraw(); return go("zc-top"); }
      if (a === "steps") { redraw(); return go("sec" + S.open); }
      if (a === "sheet") { S.sheet = !S.sheet; redraw(); }
    }));
    all("[data-save]", (b) => (b.onclick = () => saveStep(Number(b.dataset.save))));
    // the choices
    all("[data-ck]", (b) => (b.onclick = () => chipClick(b)));
    all("[data-bool]", (b) => (b.onclick = () => { setP(b.dataset.bool, !getP(b.dataset.bool)); redraw(); if ($("qk-summary")) quickSummary(); }));
    all("[data-fi]", (el) => (el.oninput = () => onField(el)));
    all("[data-qkprize]", (el) => (el.oninput = () => { const h = S.f.hs[el.dataset.qkprize]; h.pt = el.value.trim() ? "other" : "later"; h.pd = el.value; quickSummary(); }));
    all("[data-hc]", (c) => (c.onchange = () => { const h = S.f.hs[c.dataset.hc]; h.on = c.checked; if (c.checked) S.f.ph = c.dataset.hc; h.dirty = true; redraw(); if ($("qk-summary")) quickSummary(); }));
    all("[data-ph]", (b) => (b.onclick = () => { S.f.ph = b.dataset.ph; redraw(); }));
    all("[data-luckyadd]", (b) => (b.onclick = () => { S.f.lucky.push({ win: "3", style: "draw", pt: "phone", pd: "" }); redraw(); }));
    all("[data-luckydel]", (b) => (b.onclick = () => { S.f.lucky.splice(Number(b.dataset.luckydel), 1); redraw(); }));
    all("[data-test]", (btn) => (btn.onclick = () => {
      const [g, i] = btn.dataset.test.split("."), m = S.f[g][Number(i)], w = { op: "opening", mid: "break", cl: "closing" }[g];
      const h = new URLSearchParams({ w, k: SERVER_KIND[m.k] || "speech", t: (m.t || "").trim() || "Your message", u: (m.v || "").trim(), ...(m.s ? { s: m.s } : {}) });
      window.open("/preview.html#" + h.toString(), "_blank", "noopener");
    }));
    // publish and pay
    if ($("publishopen")) $("publishopen").onclick = () => { S.pubOpen = true; S.pubNote = ""; redraw(); };
    if ($("pubcancel")) $("pubcancel").onclick = () => { S.pubOpen = false; redraw(); };
    if ($("pubEmail")) $("pubEmail").oninput = (e) => { S.contact.email = e.target.value; };
    if ($("pubPhone")) $("pubPhone").oninput = (e) => { S.contact.phone = e.target.value; };
    if ($("pubgo")) $("pubgo").onclick = async () => {
      $("pubgo").disabled = true;
      try { await call("POST", `/api/z/${eid}/publish`, { email: S.contact.email.trim(), phone: S.contact.phone }); ss.set("ctz-email", S.contact.email.trim()); ss.set("ctz-phone", S.contact.phone); S.pubOpen = false; S.note = "Published. Send the link in step 6 to your participants. Please pay before the start time, or the engagement will not begin."; }
      catch (e) { ss.set("ctz-email", S.contact.email.trim()); ss.set("ctz-phone", S.contact.phone); S.pubNote = e.message + (e.needPack ? " (a pack for up to " + e.needPack + " participants)" : ""); }
      refreshEng();
    };
    // the team
    const person = async (kind) => {
      const lab = ($(kind + "label") || {}).value || "", path = kind === "host" ? "/api/org/host" : "/api/org/cohost";
      try {
        const r = await call("POST", path, lab.trim() ? { label: lab.trim() } : {});
        const key = r.hostKey || r.cohostKey || "", id = r.id || (key ? key.slice(0, 10) : ""), hash = kind === "host" ? "host" : "cohost";
        S.teamLinks[id] = key ? `${location.origin}/zc.html?e=${encodeURIComponent(eid)}#${hash}=${key}` : r.link || "";
        S.teamNote = (kind === "host" ? "Host" : "Co-host") + " added. Send the link to that one person only."; await refreshTeam();
      } catch (e) { S.teamNote = friendly(e); redraw(); }
    };
    if ($("hostadd")) $("hostadd").onclick = () => person("host");
    if ($("cohostadd")) $("cohostadd").onclick = () => person("cohost");
    all("[data-retire]", (b) => (b.onclick = async () => {
      if (!confirm("Remove this " + (b.dataset.kind === "host" ? "Host" : "Co-host") + "? Their link stops working at once.")) return;
      try { await call("POST", "/api/org/team/retire", { id: b.dataset.retire }); delete S.teamLinks[b.dataset.retire]; S.teamNote = "Removed. Their link has stopped."; await refreshTeam(); } catch (e) { S.teamNote = friendly(e); redraw(); }
    }));
    all("[data-copyteam]", (b) => (b.onclick = async () => { const ok = await copyText(S.teamLinks[b.dataset.copyteam] || ""); b.textContent = ok ? "Copied" : "Select and copy it"; }));
    // sharing and the guest list
    all("[data-mode]", (b) => (b.onclick = () => { S.mode = b.dataset.mode; redraw(); }));
    if ($("copy")) $("copy").onclick = async () => { const ok = await copyText(role() === "cohost" ? cohInvite() : guestLink()); $("copy").textContent = ok ? "Copied" : "Select and copy it"; };
    if ($("copybig")) $("copybig").onclick = async () => { const ok = await copyText(bigLink()); $("copybig").textContent = ok ? "Copied" : "Select and copy it"; };
    if ($("gadd")) $("gadd").onclick = () => { const n = $("gname").value.trim(), p = $("gphone").value.trim(); addPeople(p || n ? [{ name: n, phone: p }] : []); };
    if ($("rosterGo")) $("rosterGo").onclick = async () => { const people = parseList($("rosterTxt").value); await addPeople(people); };
    if ($("gfile")) $("gfile").onchange = async () => { const f = $("gfile").files && $("gfile").files[0]; if (!f) return; let t = ""; try { t = await f.text(); } catch { return noteAndDraw("Could not read that file. Try pasting the list instead."); } addPeople(parseList(t)); };
    if ($("pdsee")) $("pdsee").onclick = async () => { try { const r = await call("POST", `/api/z/${eid}/person`, { phone: $("pdph").value }); S.note = `Ticket ${r.seat}${r.name ? ", " + r.name : ""}${r.role ? ", " + r.role : ""}. We hold only their name and number.`; } catch (e) { S.note = e.message; } refreshEng(); };
    if ($("pddel")) $("pddel").onclick = async () => { if (!confirm("Delete this player's name and number now? This cannot be undone.")) return; try { await call("POST", `/api/z/${eid}/forget`, { phone: $("pdph").value }); S.note = "Done. Their data is deleted."; } catch (e) { S.note = e.message; } refreshEng(); };
    if ($("unbind")) $("unbind").onclick = async () => { try { await call("POST", `/api/z/${eid}/unbind`, { phone: $("ubph").value }); S.note = "Done. The next phone they join with keeps their ticket."; } catch (e) { S.note = e.message; } refreshEng(); };
    // game day
    all("[data-chip]", (b) => (b.onclick = () => { const t = $("annText"); if (t) { t.value = b.dataset.chip; t.focus(); } }));
    if ($("annSend")) $("annSend").onclick = async () => {
      const t = ($("annText").value || "").trim(); if (!t) { S.annNote = "Write a message first."; return redraw(); }
      try { await call("POST", `/api/z/${eid}/announce`, { text: t }); S.annNote = "Sent. Phones show and speak it within about a minute."; } catch (e) { S.annNote = e.message; }
      refreshEng();
    };
    if ($("annClear")) $("annClear").onclick = async () => { try { await call("POST", `/api/z/${eid}/announce`, { text: "" }); S.annNote = "Message cleared."; } catch (e) { S.annNote = e.message; } refreshEng(); };
    all("[data-ctl]", (b) => (b.onclick = async () => {
      const action = b.dataset.ctl;
      if (action === "stop" && !confirm("End this engagement for everyone? This cannot be undone.")) return;
      try { const r = await TBControl.publish(eid, { token: secret, base: BASE, prefix: "/api/z" }, action, action === "pause" ? { pauseForRounds: 600 } : {}); S.ctlNote = r.status === 200 ? action[0].toUpperCase() + action.slice(1) + " sent. Phones follow within about 40 seconds." : (r.data && r.data.error) || "Not accepted."; } catch (e) { S.ctlNote = e.message; }
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
    if ($("rptnew")) $("rptnew").onclick = async () => { if (!confirm("Make a new report link? The old link, including the one in your e-mail, stops working at once.")) return; try { const r = await call("POST", `/api/z/${eid}/reportlink`, {}); if (r.url) window.open(r.url, "_blank", "noopener"); S.note = "New report link made. The old one has stopped."; } catch (e) { S.note = e.message; } refreshEng(); };
    if ($("rptopen")) $("rptopen").onclick = async () => { try { const r = await call("GET", `/api/z/${eid}/reportlink`); if (r.url) window.open(r.url, "_blank", "noopener"); else S.note = "The report is not ready yet."; } catch (e) { S.note = e.message; } redraw(); };
    if ($("erase")) $("erase").onclick = async () => { if (!confirm("Delete every participant's name and mobile number now? This cannot be undone. The winners record stays.")) return; try { const r = await call("POST", `/api/z/${eid}/erase`, {}); S.note = r.erased + " participants erased."; } catch (e) { S.note = e.message; } refreshEng(); };
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
    // history and the account
    all("[data-hist]", (b) => (b.onclick = () => { S.showHist = !S.showHist; redraw(); }));
    all("[data-open-game]", (b) => (b.onclick = () => { eid = b.dataset.openGame; S.store = null; S.f = null; S.fFor = ""; S.openInit = ""; S.cfg = null; S.info = null; refreshTeam(); refreshEng(); }));
    all("[data-reuse]", (b) => (b.onclick = async () => {
      try { // a new engagement that starts with the earlier roster already on it
        const now = await latestRound(); const id = randId();
        const old = S.history.engagements.find((e) => e.id === b.dataset.reuse);
        await call("POST", "/api/z", { id, startRound: now + 20 * 20, callSeconds: old.call_seconds, cap: Math.max(old.participants + 50, 500) });
        const r = await call("POST", `/api/z/${id}/reuse`, { from: b.dataset.reuse });
        await TBControl.ensureKey(id, { token: secret, base: BASE, prefix: "/api/z" });
        eid = id; history.replaceState(null, "", "?e=" + id); S.store = null; S.f = null; S.fFor = ""; S.openInit = ""; S.cfg = null; S.info = null; S.screen = "eng";
        S.note = `Created with ${r.copied} participants from the earlier engagement. It starts in 20 minutes; participants use the new link.`; refreshEng();
      } catch (e) { noteAndDraw(e.message); }
    }));
    all("[data-retirekey]", (b) => (b.onclick = async () => { if (!confirm("Retire this key? It will stop working at once.")) return; try { await call("POST", "/api/org/keys/revoke", { id: b.dataset.retirekey }); S.note = "Key retired."; } catch (e) { S.note = e.message; } eid ? loadAccount() : refreshHome(); }));
    if ($("aiaudit")) $("aiaudit").onclick = async () => { try { S.aiTrail = (await call("GET", "/api/org/ai/audit")).trail || []; } catch (e) { S.note = e.message; } redraw(); };
    if ($("closeacct")) $("closeacct").onclick = async () => {
      if (!confirm("Close your account? Your account and all your games are deleted now. This cannot be undone.")) return;
      try { await call("POST", "/api/org/close", { confirm: true }); try { sessionStorage.clear(); } catch {} location.href = "/"; } catch (e) { noteAndDraw(e.message); }
    };
    const newLink = async (path, ask) => {
      if (ask && !confirm(ask)) return;
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
  }

  // TEST mode (owner-controlled, see docs/TEST_AND_LIVE_MODE.md): a calm notice in the organizer console ONLY. Public pages, participant phones and e-mails never carry it.
  (async () => { try { const m = await (await fetch(BASE + "/api/mode", { cache: "no-store" })).json(); if (m && m.mode === "TEST" && !document.getElementById("testmode")) { const b = document.createElement("div"); b.id = "testmode"; b.className = "ztest"; b.setAttribute("role", "status"); b.textContent = "TEST MODE: nothing here is real. No one outside the owner’s test list is e-mailed, and nothing is charged."; const app = document.getElementById("app"); app.parentNode.insertBefore(b, app); } } catch (e) { /* no banner when the mode cannot be read */ } })();
  let inited = false;
  async function bootstrap() {
    inited = true;
    if (secret) { try { S.kind = (await call("GET", "/api/whoami")).kind || ""; } catch { /* an old or wrong key is handled by the screens below */ } }
    loadPacks();
    if (!secret) return redraw();
    const r = role();
    if (r === "partner") return redraw();
    if (r === "cohost") { if (eid) return refreshCohost(); return redraw(); }
    if (r === "host" && !eid) return redraw();
    refreshTeam();
    if (eid) refreshEng();
    else if (QUICK) { S.screen = "quick"; S.f = quickDefault(); await loadPacks(); redraw(); }
    else refreshHome();
  }
  if (bc) bc.onmessage = async (e) => { // another tab offers its key: use it only if it really works (an old or foreign key is ignored)
    const d = e.data || {};
    if (d.ask && secret && (S.kind === "" || S.kind === "master" || S.kind === "ai")) bc.postMessage({ key: secret });
    else if (d.key && !secret && !inited) { try { const r = await fetch(BASE + "/api/whoami", { headers: { "x-organizer": String(d.key) } }); if (r.ok && !secret && !inited) { secret = String(d.key); ss.set("ctz-org", secret); bootstrap(); } } catch { /* offline: ignore */ } }
  };
  (async () => { if (!secret && bc) { bc.postMessage({ ask: true }); await new Promise((r) => setTimeout(r, 350)); } if (!inited) bootstrap(); })();
  setInterval(() => { const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; /* never wipe what the organizer is typing */ if (!secret || document.hidden) return; if (eid) refreshEng(); else if (QUICK || S.screen === "quick") return; else if (isOrg()) refreshHome(); }, 5000);
  window.__zc = S;
})();
