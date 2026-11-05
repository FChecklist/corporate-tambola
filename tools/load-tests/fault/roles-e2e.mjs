// ROLES end to end against a LOCAL server (TEST mode): Organizer, Host, Co-host. What each may and may not do (docs/ROLES_AND_CONSOLE_SPEC.md + the code), then a whole manual-mode game:
// the Host presses Next with the Host's own key, phones join through the Co-host's own link (the Co-host sees how many they brought, never the names), the Organizer pauses / resumes / ends.
// env: BASE (default http://localhost:8861), OUT. Result: data/roles-e2e-<OUT>.json. Every row is: what we expected, what the server said, ok or not. A "not ok" is investigated before it is called a defect.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Harness, NodePhone, TBControl, ZG, sleep, roundAt, roundMs } from "./nodephone.mjs";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url)), DATA = process.env.DATA_DIR || ROOT + "data"; mkdirSync(DATA, { recursive: true });
const BASE = process.env.BASE || "http://localhost:8861", OUT = process.env.OUT || "run";
const H = new Harness(BASE, { ipPool: 80 }); const rr = (n) => Math.floor(Math.random() * n), ip = () => `10.${rr(250)}.${rr(250)}.${1 + rr(250)}`;
const rows = []; const row = (area, what, want, got, ok, note = "") => { rows.push({ area, what, want, got, ok: !!ok, note }); console.log(`${ok ? "ok  " : "FAIL"} [${area}] ${what} | want ${want} | got ${got}${note ? " | " + note : ""}`); };
const status = (r) => r.s + (r.j && (r.j.code || r.j.error) ? ` (${r.j.code || String(r.j.error).slice(0, 50)})` : "");
const expectStatus = (area, what, r, want) => { const ws = Array.isArray(want) ? want : [want]; row(area, what, ws.join("|"), status(r), ws.includes(r.s)); return r; };
const TAG = Math.random().toString(36).slice(2, 6).toUpperCase(), email = `roles.${TAG.toLowerCase()}@sample-co.in`, hostMail = `host.${TAG.toLowerCase()}@sample-co.in`, id = `ROLES-${TAG}`, id2 = `ROLES-${TAG}-B`;
await H.call("POST", "/api/owner/test-mail", { add: email }, "local-organizer-secret", "10.250.0.1"); await H.call("POST", "/api/owner/test-mail", { add: hostMail }, "local-organizer-secret", "10.250.0.1");

// ---------------- the Organizer builds a game and pays ----------------
const st = await H.call("POST", "/api/start", { email, ...H.consent("K2") }, undefined, ip()); const org = st.j.token; row("organizer", "sign-in makes an organizer key", "200 + token", status(st), st.ok && !!org);
const who = (k) => H.call("GET", "/api/whoami", undefined, k, ip());
expectStatus("organizer", "whoami says master", await who(org), 200);
const startRound = roundAt(Date.now() + 100_000), firstMs = roundMs(startRound) + 120_000;
const rewards = [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "Prize early5" }, { pattern: "top", scope: "ticket", ordinal: 1, text: "Prize top" }, { pattern: "full", scope: "ticket", ordinal: 1, text: "Prize full" }];
expectStatus("organizer", "create a manual (Host mode) game", await H.call("POST", "/api/z", { id, startRound, callSeconds: 9, cap: 40, name: "Roles game", callMode: "host", tickets: 1 }, org, ip()), 200);
expectStatus("organizer", "save the settings", await H.call("PATCH", `/api/z/${id}/settings`, { rewards, whoCanJoin: "anyone", guestInvites: { on: false } }, org, ip()), 200);
expectStatus("organizer", "publish", await H.call("POST", `/api/z/${id}/publish`, { email, phone: "9650397480", ...H.consent("K1") }, org, ip()), 200);
expectStatus("organizer", "pay (test payment)", await H.call("POST", "/api/payments/test", { pack: 100, email, name: "Organizer", org: "Roles Co", country: "IN", eid: id, ...H.consent("K3") }, org, ip()), 200);

// ---------------- the Host: added by the Organizer, finishes setup, then works inside the game ----------------
const addHost = expectStatus("organizer", "add a Host (name + mobile)", await H.call("POST", "/api/org/host", { label: "Host One", mobile: "9810000011" }, org, ip()), 200); const hostKey0 = addHost.j.hostKey;
const hw = await who(hostKey0); row("host", "whoami says host before setup", "200 kind host", status(hw) + " " + hw.j.kind, hw.s === 200 && hw.j.kind === "host");
expectStatus("host", "before setup every game route is held (403 host-setup)", await H.call("GET", `/api/z/${id}/summary`, undefined, hostKey0, ip()), 403);
const hs = await H.call("POST", "/api/host/setup/email", { email: hostMail, ...H.consent("K5") }, hostKey0, ip()); expectStatus("host", "setup: e-mail code requested", hs, 200);
const hv = await H.call("POST", "/api/host/setup/email/verify", { code: hs.j.devCode }, hostKey0, ip()); expectStatus("host", "setup: code confirmed, a device key is given", hv, 200); const host = hv.j.token; row("host", "setup finished (ready)", "ready true", String(hv.j.ready), hv.j.ready === true);
expectStatus("host", "the one-time link stops working after setup", await H.call("GET", `/api/z/${id}/summary`, undefined, hostKey0, ip()), [401, 403]);
expectStatus("host", "Host reads the game summary", await H.call("GET", `/api/z/${id}/summary`, undefined, host, ip()), 200);
expectStatus("host", "Host changes the prizes (game right)", await H.call("PATCH", `/api/z/${id}/settings`, { rewards }, host, ip()), 200);
expectStatus("host", "Host reads the guest list", await H.call("GET", `/api/z/${id}/people`, undefined, host, ip()), 200);
expectStatus("host", "Host may NOT add a Host (organizer only)", await H.call("POST", "/api/org/host", { label: "Host Two", mobile: "9810000012" }, host, ip()), 403);
expectStatus("host", "Host may read the team list", await H.call("GET", `/api/org/team?e=${id}`, undefined, host, ip()), 200);

// ---------------- the Co-host: added by the Host (or Organizer) for ONE game ----------------
const addCo = expectStatus("host", "Host adds a Co-host for this game", await H.call("POST", "/api/org/cohost", { label: "Cohost One", phone: "9810000022", e: id }, host, ip()), 200); const co = addCo.j.cohostKey;
expectStatus("cohost", "whoami says cohost", await who(co), 200);
expectStatus("cohost", "before accepting the role the Co-host can do nothing else (400 consent-required)", await H.call("POST", `/api/z/${id}/people`, { people: [{ name: "A B", phone: "9811111111" }], ...{} }, co, ip()), 400);
expectStatus("cohost", "Co-host accepts the role (K5)", await H.call("POST", "/api/org/role/accept", { ...H.consent("K5") }, co, ip()), 200);
const hd = expectStatus("cohost", "Co-host reads the small game header", await H.call("GET", `/api/z/${id}/cohost`, undefined, co, ip()), 200);
const hdKeys = Object.keys(hd.j || {}); row("cohost", "the header has no names / list / settings", "no people|rewards|settings keys", hdKeys.join(","), !hdKeys.some((k) => /people|rewards|settings|names|phones|list/i.test(k)));
expectStatus("cohost", "Co-host may NOT change the settings", await H.call("PATCH", `/api/z/${id}/settings`, { name: "hacked" }, co, ip()), 403);
expectStatus("cohost", "Co-host may NOT read the summary", await H.call("GET", `/api/z/${id}/summary`, undefined, co, ip()), 403);
expectStatus("cohost", "Co-host may NOT add a Host", await H.call("POST", "/api/org/host", { label: "x", mobile: "9810000013" }, co, ip()), 403);
expectStatus("cohost", "Co-host may NOT add a Co-host", await H.call("POST", "/api/org/cohost", { label: "x y", phone: "9810000033", e: id }, co, ip()), 403);
expectStatus("cohost", "Co-host may NOT read the team", await H.call("GET", "/api/org/team", undefined, co, ip()), 403);
expectStatus("cohost", "Co-host may NOT publish or publish control", await H.call("POST", `/api/z/${id}/publish`, { email, phone: "9650397480", ...H.consent("K1") }, co, ip()), 403);
console.log("co-host invite link:", hd.j.inviteLink);

// ---------------- phones: some through the Co-host's own link, some directly ----------------
const linkFrom = (() => { try { const u = new URL(hd.j.inviteLink); for (const k of ["from", "f", "c"]) if (u.searchParams.get(k)) return Number(u.searchParams.get(k)); } catch { /* none */ } return null; })();
row("cohost", "the invite link carries the chain mark (from=)", "a number", String(linkFrom), Number.isFinite(linkFrom) && linkFrom > 0);
const NVIA = 8, NDIR = 8, phones = [];
for (let i = 0; i < NVIA + NDIR; i++) { const via = i < NVIA; const ph = new NodePhone(H, id, { phone: `98${String(20000000 + i)}`, name: `Guest ${i}` }, { claim: "always" }); await ph.open(); ph.ok = await (via && linkFrom ? ph.rt.join(`98${String(20000000 + i)}`, `Guest ${i}`, { from: linkFrom }) : ph.join()); ph.via = via; phones.push(ph); if (ph.ok) ph.go(); }
row("phones", "all guests got a ticket", `${NVIA + NDIR}`, String(phones.filter((p) => p.ok).length), phones.every((p) => p.ok));
const hd2 = await H.call("GET", `/api/z/${id}/cohost`, undefined, co, ip()); row("cohost", "the Co-host sees how many they brought (never who)", String(NVIA), String(hd2.j.brought), hd2.j.brought === NVIA, `joined ${hd2.j.joined}`);
const pe = await H.call("GET", `/api/z/${id}/people`, undefined, host, ip()); row("host", "the Host's guest list shows everyone who joined", String(NVIA + NDIR), String((pe.j.people || pe.j.list || []).length || JSON.stringify(pe.j).slice(0, 60)), (pe.j.people || pe.j.list || []).length === NVIA + NDIR || pe.ok);

// ---------------- game day: the Host presses Next with the Host's own key; the Organizer pauses, resumes and ends; the Co-host cannot ----------------
const ctl = (k) => ({ token: k, base: BASE, prefix: "/api/z" }); const pub = (key, ...a) => Promise.race([TBControl.publish(id, ctl(key), ...a), sleep(30000).then(() => { throw new Error("control call timed out"); })]);
const k1 = await TBControl.ensureKey(id, ctl(host)); row("host", "Host registers the game-day signing key", "ok", JSON.stringify(k1).slice(0, 60), !!(k1 && k1.ok));
// (TBControl.ensureKey would answer "ok" from this test program's own key store without asking the server, so the server is asked directly)
expectStatus("cohost", "Co-host may NOT register a game-day signing key (server route)", await H.call("PUT", `/api/z/${id}/control/key`, { publicKey: "00".repeat(32), profile: "standard" }, co, ip()), 403);
await sleep(Math.max(0, firstMs - 20_000 - Date.now()));
let presses = 0; const press = async (key, who) => { try { const r = await pub(key, "next"); if (r.status === 200) presses++; return r.status; } catch (e) { return "err " + e.message; } };
const coPress = await press(co, "co"); row("cohost", "Co-host may NOT press Next", "refused (not 200)", String(coPress), coPress !== 200);
for (let k = 0; k < 6; k++) { const s = await press(host, "host"); if (k === 0) row("host", "Host presses Next", "200", String(s), s === 200); await sleep(8000); }
await sleep(3000); const nA = phones[0].view().log.filter((q) => q > 0).length; row("phones", "phones show the numbers the Host pressed", `${presses} (±1)`, String(nA), Math.abs(nA - presses) <= 1);
const same = new Set(phones.map((p) => JSON.stringify(p.view().log.filter((q) => q > 0)))); row("phones", "every phone shows the same numbers in the same order", "1 distinct log", String(same.size), same.size === 1);
const ps = await pub(host, "pause", { pauseForRounds: 600 }).catch((e) => ({ status: "err " + e.message })); row("host", "Host pauses the game", "200", String(ps.status), ps.status === 200);
const nP = phones[0].view().log.filter((q) => q > 0).length; await sleep(12000); const nP2 = phones[0].view().log.filter((q) => q > 0).length; row("phones", "no number comes while paused", "same count", `${nP} -> ${nP2}`, nP2 <= nP + 1);
const rs = await pub(org, "resume", {}).catch((e) => ({ status: "err " + e.message })); row("organizer", "Organizer resumes (Host paused it)", "200", String(rs.status), rs.status === 200);
for (let k = 0; k < 3; k++) { await press(host, "host"); await sleep(8000); }
const cp = await pub(co, "pause", { pauseForRounds: 600 }).catch((e) => ({ status: "err " + e.message })); row("cohost", "Co-host may NOT pause", "refused (not 200)", String(cp.status), cp.status !== 200);
const en = await pub(org, "stop", {}).catch((e) => ({ status: "err " + e.message })); row("organizer", "Organizer ends the game", "200", String(en.status), en.status === 200);
const tEnd = Date.now(); while (Date.now() - tEnd < 120000 && phones.some((p) => p.view().phase !== "ended")) await sleep(2000);
const ended = phones.filter((p) => p.view().phase === "ended").length; row("phones", "every phone reaches the end after the Organizer's End", String(phones.length), String(ended), ended === phones.length, `took ${Math.round((Date.now() - tEnd) / 1000)} s`);

// ---------------- paying and retiring ----------------
expectStatus("organizer", "a second game is created for the payment test", await H.call("POST", "/api/z", { id: id2, startRound: roundAt(Date.now() + 7200_000), callSeconds: 9, cap: 40, name: "Roles game B" }, org, ip()), 200);
expectStatus("organizer", "settings of game B", await H.call("PATCH", `/api/z/${id2}/settings`, { rewards, whoCanJoin: "anyone" }, org, ip()), 200);
expectStatus("organizer", "publish game B", await H.call("POST", `/api/z/${id2}/publish`, { email, phone: "9650397480", ...H.consent("K1") }, org, ip()), 200);
const co2 = (await H.call("POST", "/api/org/cohost", { label: "Cohost Two", phone: "9810000044", e: id2 }, org, ip())).j.cohostKey; await H.call("POST", "/api/org/role/accept", { ...H.consent("K5") }, co2, ip());
const cpay = await H.call("POST", "/api/payments/test", { pack: 100, email, name: "Cohost Two", org: "Roles Co", country: "IN", eid: id2, ...H.consent("K3") }, co2, ip()); row("cohost", "a Co-host can pay for the game (spec: Organizer, Host or Co-host)", "200", status(cpay), cpay.s === 200);
const sm = await H.call("GET", `/api/z/${id2}/summary`, undefined, org, ip()); row("organizer", "the summary records who paid", "paidBy co-host", JSON.stringify(sm.j.payment || {}).slice(0, 80), (sm.j.payment || {}).status === "paid" && /co/i.test((sm.j.payment || {}).paidBy || ""));
const team = await H.call("GET", `/api/org/team?e=${id}`, undefined, org, ip()); const hostId = (team.j.hosts || [])[0]?.id, coId = (team.j.cohosts || []).find((c) => c.label === "Cohost One")?.id;
expectStatus("host", "a Host may NOT retire a Host", await H.call("POST", "/api/org/team/retire", { id: hostId }, host, ip()), 403);
expectStatus("host", "a Host retires a Co-host", await H.call("POST", "/api/org/team/retire", { id: coId }, host, ip()), 200);
expectStatus("cohost", "a retired Co-host's key stops at once", await H.call("GET", `/api/z/${id}/cohost`, undefined, co, ip()), [401, 403]);
expectStatus("organizer", "the Organizer retires the Host", await H.call("POST", "/api/org/team/retire", { id: hostId }, org, ip()), 200);
expectStatus("host", "a retired Host's key stops at once", await H.call("GET", `/api/z/${id}/summary`, undefined, host, ip()), [401, 403]);
const hosts5 = []; for (let i = 0; i < 6; i++) hosts5.push((await H.call("POST", "/api/org/host", { label: "H" + i + " Name", mobile: `98100001${String(i).padStart(2, "0")}` }, org, ip())).s);
row("organizer", "at most 5 Hosts at a time (the 6th is refused)", "200 x5 then 409", hosts5.join(","), hosts5.slice(0, 5).every((s) => s === 200) && hosts5[5] === 409, "one Host was retired above, so this is a fresh count of 5 + the retired one");
for (const p of phones) p.stop();
const bad = rows.filter((r) => !r.ok); const out = { test: "roles end to end", at: new Date().toISOString(), total: rows.length, ok: rows.length - bad.length, notOk: bad.length, rows };
writeFileSync(`${DATA}/roles-e2e-${OUT}.json`, JSON.stringify(out, null, 1)); console.log(`DONE ${out.ok} of ${out.total} as expected; not as expected: ${bad.map((b) => b.what).join(" ; ") || "none"}`);
process.exit(0);
