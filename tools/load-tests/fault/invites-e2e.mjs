// INVITATIONS at the size of about 1000 people on a local server with the deployed settings. Ways in, who counted, who may approve:
//  game O (open, guests may invite): the Organizer's link; 10 Co-hosts who bring people by their OWN common link and by their OWN list (personal links); participants who invite family / colleagues by
//  share link and by their own list; the two-level rule; the Co-host list limit; the cap.
//  game C (list only, guests may invite): a stranger who comes through a Co-host's link or a guest's link waits for THAT person to approve; what the Organizer can still do; one approves, another declines.
// env: BASE, OUT. Result: data/invites-e2e-<OUT>.json
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Harness, sleep, roundAt } from "./nodephone.mjs";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url)), DATA = process.env.DATA_DIR || ROOT + "data"; mkdirSync(DATA, { recursive: true });
const BASE = process.env.BASE || "http://localhost:8885", OUT = process.env.OUT || "run";
const H = new Harness(BASE, { ipPool: 10 }); const rr = (n) => Math.floor(Math.random() * n), pip = () => `10.${rr(250)}.${rr(250)}.${1 + rr(250)}`;
const OFFICE = Array.from({ length: 6 }, pip);
const rows = []; const row = (area, what, want, got, ok, note = "") => { rows.push({ area, what, want, got, ok: !!ok, note }); console.log(`${ok ? "ok  " : "FAIL"} [${area}] ${what} | want ${want} | got ${got}${note ? " | " + note : ""}`); };
const st = (r) => `${r.s}${r.j && (r.j.code || r.j.error) ? " (" + (r.j.code || String(r.j.error).slice(0, 70)) + ")" : ""}`;
const TAG = Math.random().toString(36).slice(2, 6).toUpperCase(), email = `inv.${TAG.toLowerCase()}@sample-co.in`, idO = `INVO-${TAG}`, idC = `INVC-${TAG}`;
const dev = (k) => (Buffer.from("d" + TAG + k).toString("hex") + "c".repeat(32)).slice(0, 32); let ctr = 0; const mob = () => `98${String(30000000 + ++ctr)}`;
const call = (m, p, b, key) => H.call(m, p, b, key, pip());
const join = async (id, body, ip = OFFICE[rr(6)]) => { const q = await fetch(`${BASE}/api/z/${id}/join`, { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ name: "G " + (++ctr), device: dev("j" + ctr), ...H.consent("K4"), ...body }) }); return { s: q.status, j: await q.json().catch(() => ({})) }; };
const asGuest = async (id, pid, m, p, b) => { const q = await fetch(`${BASE}/api/z/${id}${p}${p.includes("?") ? "&" : "?"}me=${pid}`, { method: m, headers: { "content-type": "application/json", "cf-connecting-ip": pip() }, body: b ? JSON.stringify(b) : undefined }); return { s: q.status, j: await q.json().catch(() => ({})) }; };
const me = async (id, pid) => (await fetch(`${BASE}/api/z/${id}/me?pid=${pid}`)).json();
const fromOf = (link) => Number(new URL(link).searchParams.get("from"));
const rewards = [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "e" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "f" }];
await H.call("POST", "/api/owner/test-mail", { add: email }, "local-organizer-secret", "10.250.0.1");
const org = (await call("POST", "/api/start", { email, ...H.consent("K2") })).j.token; const startRound = roundAt(Date.now() + 3 * 3600e3);
async function mk(id, over, cap) { await call("POST", "/api/z", { id, startRound, callSeconds: 9, cap, name: "Invites " + id, tickets: 1 }, org); const r = await call("PATCH", `/api/z/${id}/settings`, { rewards, guestInvites: { on: true, per: 4, cats: ["family", "colleagues"] }, coHostLimit: 40, ...over }, org); await call("POST", `/api/z/${id}/publish`, { email, phone: "9650397480", ...H.consent("K1") }, org); await call("POST", "/api/payments/test", { pack: 1000, email, name: "Org", org: "Org Co", country: "IN", eid: id, ...H.consent("K3") }, org); return r; }
const sO = await mk(idO, { whoCanJoin: "anyone" }, 1000); row("setup", "game O: open, guests may invite (4 each, family or colleagues), Co-host list limit 40", "200", st(sO), sO.ok && sO.j.guestInvites?.on === true, "coHostLimit " + sO.j.coHostLimit);
const orgList = await call("GET", `/api/z/${idO}/people`, undefined, org); const orgFrom = fromOf(orgList.j.commonLink); row("setup", "the Organizer has a common link with a code", "from=<number>", String(orgFrom), Number.isFinite(orgFrom));

// ---------------- Co-hosts: 10, each brings people by their own link and by their own list ----------------
const cos = []; for (let i = 0; i < 10; i++) { const x = await call("POST", "/api/org/cohost", { label: `Cohost ${i}`, phone: `98100002${String(i).padStart(2, "0")}`, e: idO }, org); await call("POST", "/api/org/role/accept", { ...H.consent("K5") }, x.j.cohostKey); const lst = await call("GET", `/api/z/${idO}/people`, undefined, x.j.cohostKey); cos.push({ i, key: x.j.cohostKey, from: fromOf(lst.j.commonLink), id: x.j.id }); }
row("cohost", "10 Co-hosts added; each has an own common link", "10 different codes", `${new Set(cos.map((c) => c.from)).size} different`, new Set(cos.map((c) => c.from)).size === 10);
const t0 = Date.now(); let viaLink = 0, viaList = 0, listTokens = [];
await Promise.all(cos.map(async (c) => {
  for (let k = 0; k < 30; k++) { const x = await join(idO, { phone: mob(), from: c.from }); if (x.s === 200) viaLink++; }
  const add = await call("POST", `/api/z/${idO}/people`, { people: Array.from({ length: 8 }, (_, k) => ({ name: `CoList ${c.i}-${k}`, phone: mob(), type: "employee" })), ...H.consent("K6") }, c.key); c.added = add.j.added;
  const lst = await call("GET", `/api/z/${idO}/people`, undefined, c.key); for (const p of (lst.j.people || [])) if (p.link) { const tk = p.link.split("/j/")[1]; const x = await join(idO, { token: tk }); if (x.s === 200) { viaList++; } } c.list = (lst.j.people || []).length;
}));
row("cohost", "10 Co-hosts x 30 people through their own common link all get a ticket", "300", String(viaLink), viaLink === 300, `${Math.round((Date.now() - t0) / 100) / 10} s`);
row("cohost", "10 Co-hosts x 8 people added to their own list (\"call others\"), each joins with the personal link", "80", String(viaList), viaList === 80, `lists ${cos.map((c) => c.list).join(",")}`);
let ok = 0; for (const c of cos) { const h = await call("GET", `/api/z/${idO}/cohost`, undefined, c.key); if (h.j.brought === 38) ok++; else console.log("   cohost", c.i, "brought", h.j.brought, "want 38"); } row("cohost", "each Co-host's 'brought' count equals what they really brought (30 by link + 8 by list)", "10 of 10 = 38", `${ok} of 10`, ok === 10);
// Co-host list limit (40): link joins count on the same list
const c0 = cos[0]; const more = await call("POST", `/api/z/${idO}/people`, { people: Array.from({ length: 5 }, (_, k) => ({ name: `Over ${k}`, phone: mob(), type: "employee" })), ...H.consent("K6") }, c0.key); row("cohost", "a Co-host over their list limit (40): the extra people are refused with a clear message", "refused, message names the limit", st(more) + " " + JSON.stringify(more.j).slice(0, 90), more.s >= 400 && /full|limit|list/i.test(JSON.stringify(more.j)));
await call("POST", `/api/z/${idO}/people`, { people: [0, 1].map((k) => ({ name: `Fill ${k}`, phone: mob(), type: "employee" })), ...H.consent("K6") }, c0.key); // now exactly 40 on this Co-host's list
const over = await join(idO, { phone: mob(), from: c0.from }); row("cohost", "a stranger on a full Co-host link (40 used): put in the waiting room, not refused outright", "403/409 waiting or invite-full", st(over), [403, 409].includes(over.s) && /waiting|invite-full/.test(over.j.code || ""));
const whoC0 = await call("GET", `/api/z/${idO}/waiting`, undefined, c0.key), whoO = await call("GET", `/api/z/${idO}/waiting`, undefined, org);
row("cohost", "that over-the-limit request goes to the ORGANIZER (the Co-host whose list is full does not see it, by design)", "Co-host 0, Organizer 1", `Co-host ${(whoC0.j.waiting || []).length}, Organizer ${(whoO.j.waiting || []).length}`, (whoC0.j.waiting || []).length === 0 && (whoO.j.waiting || []).length === 1, "what the person is told: " + String(over.j.error).slice(0, 110));
if ((whoO.j.waiting || [])[0]) { const d2 = await call("POST", `/api/z/${idO}/waiting/${whoO.j.waiting[0].id}`, { decision: "admit" }, org); row("cohost", "the Organizer admits it (placed on the Organizer's own list)", "200 admitted", st(d2) + " " + JSON.stringify(d2.j).slice(0, 70), d2.s === 200 && d2.j.admitted === true); }

// ---------------- the Organizer's own link, then participants who invite ----------------
const direct = []; await Promise.all(Array.from({ length: 250 }, async () => { const x = await join(idO, { phone: mob(), from: orgFrom }); if (x.s === 200) direct.push(x.j.pid); }));
row("organizer", "250 people through the Organizer's common link", "250", String(direct.length), direct.length === 250);
const g = await Promise.all(direct.slice(0, 60).map(async (pid) => ({ pid, ...(await me(idO, pid)) }))); const canInv = g.filter((x) => x.canInvite).length; row("guests", "a person who joined directly may invite (guest invites are on)", "60 of 60 canInvite", `${canInv} of 60`, canInv === 60, `per ${g[0].per}`);
// share link: each of 40 guests brings 2 (family + colleagues)
let shared = 0, sharedInvitees = []; await Promise.all(g.slice(0, 40).map(async (x) => { for (const cat of ["family", "colleagues"]) { const r = await join(idO, { phone: mob(), from: x.seat, cat }); if (r.s === 200) { shared++; sharedInvitees.push(r.j.pid); } } }));
row("guests", "40 guests x 2 people through their share link (family / colleagues) all get a ticket", "80", String(shared), shared === 80);
// own list: 20 other guests add 2 people each with personal links
let ownList = 0, ownJoined = 0; await Promise.all(g.slice(40, 60).map(async (x) => { const a = await asGuest(idO, x.pid, "POST", "/people", { people: [0, 1].map((k) => ({ name: `GL ${x.seat}-${k}`, phone: mob() })), ...H.consent("K6") }); ownList += a.j.added || 0; const l = await asGuest(idO, x.pid, "GET", "/people"); for (const p of (l.j.people || [])) { if (p.link) { const r = await join(idO, { token: p.link.split("/j/")[1] }); if (r.s === 200) ownJoined++; } } }));
row("guests", "20 guests add 2 people each to their own list; those people join with their personal link", "40 added, 40 joined", `${ownList} added, ${ownJoined} joined`, ownList === 40 && ownJoined === 40);
// limit per guest (4)
const gx = g[0]; const extra = []; for (let k = 0; k < 4; k++) extra.push(await asGuest(idO, gx.pid, "POST", "/people", { people: [{ name: `Extra ${k}`, phone: mob() }], ...H.consent("K6") }));
row("guests", "a guest may invite 4 people in all (2 by link + 2 by list here is 4): the next one is refused with a message", "refused after the 4th", extra.map((e) => e.s + (e.j.error ? "(" + String(e.j.error).slice(0, 40) + ")" : "")).join(" | "), extra.some((e) => e.s >= 400));
// two levels
const lvl2 = sharedInvitees[0]; const m2 = await me(idO, lvl2); row("guests", "a person who was invited by a guest cannot invite anyone (two levels only)", "canInvite false", String(m2.canInvite), m2.canInvite === false);
const l2join = await join(idO, { phone: mob(), from: m2.seat }); row("guests", "…their share link still lets people in but records no inviter (falls back to the Organizer, silently)", "200 (info)", st(l2join), l2join.s === 200, "INFORMATION: the person who shared it is not told it did not count");
// the cap
const have = (await call("GET", `/api/z/${idO}/people?limit=1`, undefined, org)).j.total; let fill = 0; for (let k = 0; k < 1100 - have && fill < 400; k++) { const x = await join(idO, { phone: mob() }); if (x.s === 200) fill++; else if (x.s === 409) break; }
const full = await join(idO, { phone: mob() }); row("cap", `the game is full at 1000: the next person is told so`, "409 full", st(full), full.s === 409, `seats before filling ${have}`);
const inv = []; for (let off = 0; off < 1500; off += 500) { const q = await call("GET", `/api/z/${idO}/people?limit=500&offset=${off}`, undefined, org); const part = q.j.people || []; inv.push(...part.filter((p) => p.status === "invited" && p.link)); if (part.length < 500) break; }
if (inv[0]) { const late = await join(idO, { token: inv[0].link.split("/j/")[1] }); row("cap", `a person who was invited (personal link) but opened it after the game filled up from the open link (${inv.length} such people)`, "still gets the place that was promised", st(late), late.s === 200, "if 409: the invitation promised a place the game did not keep"); }
const total = (await call("GET", `/api/z/${idO}/people?limit=1`, undefined, org)).j; row("track", "the Organizer's total equals the cap and nothing is over it", "1000", String(total.total), total.total <= 1000, `cap ${total.cap}`);

// ---------------- game C: list only; approval goes to the inviter ----------------
const sC = await mk(idC, { whoCanJoin: "list" }, 300); await call("POST", `/api/z/${idC}/people`, { people: Array.from({ length: 20 }, (_, i) => ({ name: `Listed ${i}`, phone: `97000000${String(i).padStart(2, "0")}`, type: "employee" })), ...H.consent("K6") }, org);
const cC = await call("POST", "/api/org/cohost", { label: "Cohost C", phone: "9810000999", e: idC }, org); await call("POST", "/api/org/role/accept", { ...H.consent("K5") }, cC.j.cohostKey); const coC = cC.j.cohostKey; const coCfrom = fromOf((await call("GET", `/api/z/${idC}/people`, undefined, coC)).j.commonLink);
const L0 = await join(idC, { phone: "9700000000" }); row("closed", "a listed person joins", "200", st(L0), L0.s === 200); const L0me = await me(idC, L0.j.pid); const guestFrom = L0me.seat;
const strangers = []; for (let i = 0; i < 6; i++) { const ph = mob(); const r = await join(idC, { phone: ph, from: i < 3 ? coCfrom : guestFrom }); r.ph = ph; strangers.push(r); } row("closed", "strangers on a Co-host link (3) and on a guest's share link (3) are held (403 waiting)", "6 x 403 waiting", strangers.map((x) => x.s).join(","), strangers.every((x) => x.s === 403 && x.j.code === "waiting"));
const wCo = (await call("GET", `/api/z/${idC}/waiting`, undefined, coC)).j.waiting || [], wOrg = (await call("GET", `/api/z/${idC}/waiting`, undefined, org)).j.waiting || [], wGuest = (await asGuest(idC, L0.j.pid, "GET", "/waiting")).j.waiting || [];
row("closed", "the Co-host sees only the 3 who came through them; the guest sees only their 3; the Organizer sees all 6", "3 / 3 / 6", `${wCo.length} / ${wGuest.length} / ${wOrg.length}`, wCo.length === 3 && wGuest.length === 3 && wOrg.length === 6);
const [s0, s1, s2] = [strangers[0], strangers[1], strangers[2]]; const dco = await call("POST", `/api/z/${idC}/waiting/${s0.j.wid}`, { decision: "decline" }, coC); const dorg = await call("POST", `/api/z/${idC}/waiting/${s0.j.wid}`, { decision: "admit" }, org);
row("conflict", "the Co-host declines, then the Organizer tries to admit the same person", "answer: already declined (the first decision stands)", st(dorg) + " " + JSON.stringify(dorg.j), dorg.j.already === "declined");
const readd = await call("POST", `/api/z/${idC}/people`, { people: [{ name: "Back In", phone: s0.ph, type: "employee" }], ...H.consent("K6") }, org); row("conflict", "the Organizer adds the declined person to the list by hand (the way to overrule a decline)", "added 1", st(readd) + " added " + readd.j.added, readd.j.added === 1);
const back = await join(idC, { phone: s0.ph }); row("conflict", "…and that person now gets in", "200", st(back), back.s === 200);
const gA = await asGuest(idC, L0.j.pid, "POST", `/waiting/${strangers[3].j.wid}`, { decision: "admit" }); row("closed", "a guest admits a person who came through their own link", "200 admitted", st(gA) + " " + JSON.stringify(gA.j).slice(0, 60), gA.s === 200 && gA.j.admitted === true);
const gOther = await asGuest(idC, L0.j.pid, "POST", `/waiting/${s1.j.wid}`, { decision: "admit" }); row("closed", "a guest may NOT decide a request that came through a Co-host's link", "404 (not theirs)", st(gOther), gOther.s === 404);
const coOther = await call("POST", `/api/z/${idC}/waiting/${strangers[4].j.wid}`, { decision: "admit" }, coC); row("closed", "the Co-host may NOT decide a request that came through a guest's link", "404 (not theirs)", st(coOther), coOther.s === 404);
const bad = rows.filter((r) => !r.ok); const out = { test: "invitations at about 1000 people", at: new Date().toISOString(), base: BASE, total: rows.length, ok: rows.length - bad.length, notOk: bad.length, rows };
writeFileSync(`${DATA}/invites-e2e-${OUT}.json`, JSON.stringify(out, null, 1)); console.log(`DONE ${out.ok} of ${out.total} as expected; not as expected: ${bad.map((b) => b.what).join(" ; ") || "none"}`); process.exit(0);
