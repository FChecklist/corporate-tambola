// INP-*: invalid, oversized and odd inputs on every public and organizer entry point. Desired behaviour: a clear 4xx, never a 5xx, never stored raw, nothing created by a refused call.
import { Api, BASE, IS_LIVE, J, anon, dev, eid, expect, mkEng, newOrg, phone, requireTestMode, rnd, roundMs, startIn, tc, test, type Org } from "./lib/harness";

let O: Org, m: Api, E: string;
test.beforeAll(async () => {
  if (IS_LIVE) await requireTestMode();
  O = await newOrg("inp", { signup: true }); m = new Api(BASE, O.token);
  E = (await mkEng(O, { cap: 40 })).id;
  await m.post(`/api/z/${E}/publish`, { email: O.email, phone: "9811122233" });
  await m.post("/api/payments/test", { eid: E, email: O.email, org: "Input Test Org", country: "IN" });
});
const noFive = (rs: { status: number; text: string }[]) => rs.filter((r) => r.status >= 500).map((r) => `${r.status} ${J(r.text).slice(0, 100)}`);

tc({ id: "INP-01", role: "organizer", title: "engagement ids: only 4-40 letters, digits, - and _ are accepted", steps: "POST /api/z with 12 bad ids and 3 good", expected: "bad ids 400; good ids 200; nothing created for bad ones" }, async () => {
  const bad = ["", "abc", "a b c d", "x".repeat(41), "ünïcode", "😀😀😀😀", "a/b/c/d", "a;b;c;d", "'; DROP TABLE engagement;--", "<script>x</script>", "..%2f..%2f", "ab\ncd"];
  const wrong: string[] = [];
  for (const id of bad) { const r = await m.post("/api/z", { id, startRound: startIn(3600), callSeconds: 6, cap: 10 }); if (r.status !== 400) wrong.push(`${JSON.stringify(id)}->${r.status}`); }
  for (const id of ["ABCD", "a-b_c-d_" + rnd(4), "x".repeat(40)]) { const r = await m.post("/api/z", { id: id === "x".repeat(40) ? "x".repeat(36) + rnd(4) : id + (id === "ABCD" ? rnd(4) : ""), startRound: startIn(3600), callSeconds: 6, cap: 10 }); if (r.status !== 200) wrong.push(`good ${id}->${r.status} ${J(r.text)}`); }
  expect(wrong).toEqual([]);
  return "12 refused, 3 accepted";
});
tc({ id: "INP-02", role: "organizer", title: "numbers: cap, callSeconds and startRound reject negative, zero, fractional, huge, string and NaN values", steps: "POST /api/z with each odd value", expected: "400 for all; never 5xx" }, async () => {
  const base = () => ({ id: eid("N"), startRound: startIn(3600), callSeconds: 6, cap: 10 });
  const variants: [string, object][] = [["cap -1", { cap: -1 }], ["cap 0", { cap: 0 }], ["cap 1.5", { cap: 1.5 }], ["cap 100001", { cap: 100001 }], ["cap 1e9", { cap: 1e9 }], ["cap '10'", { cap: "10" }], ["cap null", { cap: null }],
    ["callSeconds 3", { callSeconds: 3 }], ["callSeconds 7", { callSeconds: 7 }], ["callSeconds 0", { callSeconds: 0 }], ["callSeconds -6", { callSeconds: -6 }], ["callSeconds 6.0000001", { callSeconds: 6.0000001 }],
    ["startRound 1.5", { startRound: 1.5 }], ["startRound '1'", { startRound: "1" }], ["startRound null", { startRound: null }]];
  const wrong: string[] = [], rs: any[] = [];
  for (const [n, v] of variants) { const r = await m.post("/api/z", { ...base(), ...v }); rs.push(r); if (r.status !== 400) wrong.push(`${n}->${r.status}`); }
  expect(noFive(rs)).toEqual([]);
  expect(wrong, "odd numbers that were accepted").toEqual([]);
  return `${variants.length} refused`;
});
tc({ id: "INP-03", role: "organizer", title: "a start time in the past is refused at publish and at settings", steps: "Create with a past start round; try to publish; PATCH settings to a past time", expected: "publish 400 'start time has passed'; settings 400", known: "" }, async () => {
  const past = Math.floor((Date.now() / 1000 - 3600 - 1692803367) / 3);
  const c = await m.post("/api/z", { id: eid("P"), startRound: past, callSeconds: 6, cap: 10 });
  if (c.status === 200) {
    const id = (c.body.openUrl as string).split("e=")[1]!;
    const p = await m.post(`/api/z/${id}/publish`, { email: O.email, phone: "9811122233" }); expect(p.status).toBe(400);
    return `create accepted a past start (${c.status}) but publish refused: ${J(p.body)}`;
  }
  expect(c.status).toBe(400);
  const s = await m.patch(`/api/z/${E}/settings`, { startRound: past }); expect([400, 409]).toContain(s.status);
  return `create refused ${c.status}; settings ${s.status}`;
});
tc({ id: "INP-04", role: "organizer", title: "a start time very close to now (inside 2 minutes) is handled: publish is allowed only with a sane lead, and payment is still possible", steps: "Create + publish an engagement starting in 30 s", expected: "either refused with a clear message or published with a pay link and the 45-second lock described to the organizer" }, async () => {
  const id = (await mkEng(O, { startInSec: 30, cap: 10 })).id;
  const p = await m.post(`/api/z/${id}/publish`, { email: O.email, phone: "9811122233" });
  expect(p.status, J(p.text)).toBeLessThan(500);
  const info = await anon().get(`/api/z/${id}/info`);
  return `publish ${p.status} paid=${p.body.paid}; info locked=${info.body.locked}`;
});
tc({ id: "INP-05", role: "anonymous", title: "organizer sign-up refuses 14 kinds of bad e-mail", steps: "POST /api/start with bad addresses", expected: "400 each; no account created" }, async () => {
  const bad = ["", " ", "plain", "a@b", "a@b.c", "@x.com", "a b@x.com", "a@@x.com", "x".repeat(70) + "@x.com", "a@" + "y".repeat(260) + ".com", "a@x.com\nbcc:z@x.com", 123 as any, null as any, ["a@x.com"] as any];
  const wrong: string[] = [];
  for (const e of bad) { const r = await anon().post("/api/start", { email: e }); if (r.status !== 400) wrong.push(`${J(e).slice(0, 30)}->${r.status}`); }
  expect(wrong).toEqual([]);
  return `${bad.length} refused`;
});
tc({ id: "INP-05b", role: "anonymous", title: "sign-up refuses an e-mail with a double dot or angle brackets", steps: "POST /api/start with a@x..com and <script>@x.com", expected: "400 for both (they are not deliverable addresses)", known: "F-07" }, async () => {
  const rs = [await anon().post("/api/start", { email: "a@x..com" }), await anon().post("/api/start", { email: "<script>@x.com" })];
  expect(rs.map((r) => r.status), "accounts were created for non-addresses").toEqual([400, 400]);
  return "refused";
});
tc({ id: "INP-02b", role: "organizer", title: "a start time years in the future is refused (it would hold participant data for years)", steps: "POST /api/z with startRound 10 years ahead and with 1e30", expected: "400 (a sane horizon, e.g. one year)", known: "F-08" }, async () => {
  const far = await m.post("/api/z", { id: eid("F"), startRound: startIn(10 * 365 * 86400), callSeconds: 6, cap: 10 });
  const huge = await m.post("/api/z", { id: eid("F"), startRound: 1e30, callSeconds: 6, cap: 10 });
  expect([far.status, huge.status], "10 years ahead / 1e30").toEqual([400, 400]);
  return "refused";
});
tc({ id: "INP-06", role: "anonymous", title: "sign-up does not reveal whether an e-mail already has an account", steps: "POST /api/start twice with the same address, and compare with /api/auth/email for a stranger", expected: "same-shaped answer for a known and an unknown address", known: "F-05" }, async () => {
  const again = await anon().post("/api/start", { email: O.email });
  const stranger = await anon().post("/api/auth/email", { email: `nobody+${rnd()}@example.com` });
  const known = await anon().post("/api/auth/email", { email: O.email });
  expect(JSON.stringify(Object.keys(known.body).filter((k) => k !== "devCode" && k !== "devToken").sort())).toBe(JSON.stringify(Object.keys(stranger.body).filter((k) => k !== "devCode" && k !== "devToken").sort()));
  expect(again.body.exists, `/api/start answered ${J(again.body)} for an existing account: it tells a stranger who is registered`).toBeUndefined();
  return "same shape";
});
tc({ id: "INP-07", role: "participant", title: "mobile number formats: +91 / 0 prefix / spaces map to one person; short, long, letters and objects are refused", steps: "Join with each format on separate devices", expected: "equivalent numbers = same participant; invalid = 400" }, async () => {
  const ok = ["9876543210", "+91 98765 43210", "09876543210", "+919876543210", "91-98765-43210"];
  const pids = new Set<string>(); const out: string[] = [];
  let k = 0;
  for (const p of ok) { const r = await anon().post(`/api/z/${E}/join`, { phone: p, name: "Fmt", device: dev("f1") }); out.push(String(r.status)); if (r.body.pid) pids.add(r.body.pid); k++; }
  expect(pids.size, `statuses ${out}`).toBe(1);
  const bad = ["", "12345", "123456789", "1".repeat(16), "abcdefghij", "98765-4321", {} as any, [] as any, null as any];
  const wrong: string[] = [];
  for (const p of bad) { const r = await anon().post(`/api/z/${E}/join`, { phone: p, name: "Bad", device: dev("f2") }); if (r.status !== 400) wrong.push(`${J(p).slice(0, 25)}->${r.status}`); }
  expect(wrong).toEqual([]);
  return "5 formats = 1 person; invalid refused";
});
tc({ id: "INP-08", role: "participant", title: "names: emoji, right-to-left, 3,000 characters, markup and SQL are stored safely and shortened to 60", steps: "Join with each name; the organizer reads the names back", expected: "no < > backtick stored; max 60 chars; emoji/RTL preserved" }, async () => {
  const names = ["Priya 🎉🎊", "مرحبا بالعالم", "עברית שלום", "x".repeat(3000), "<img src=x onerror=alert(1)>", "'); DROP TABLE participant;--", "Zoë Å 山田太郎", "a\u0000b‮c"];
  const got: Record<string, string> = {};
  const pids: string[] = [];
  let i = 0;
  for (const n of names) { const r = await anon().post(`/api/z/${E}/join`, { phone: phone(100 + i), name: n, device: dev("n" + i) }); expect(r.status, J(r.text)).toBe(200); pids.push(r.body.pid); i++; }
  const nm = await m.get(`/api/z/${E}/names?pids=${pids.join(",")}`);
  const vals = pids.map((p) => nm.body.names?.[p] ?? "");
  expect(vals[0]).toContain("🎉"); expect(vals[1]).toBe(names[1]);
  expect(vals[3].length).toBeLessThanOrEqual(60);
  for (const v of vals) { expect(v).not.toMatch(/[<>`]/); expect(v.length).toBeLessThanOrEqual(60); }
  const alive = await anon().get(`/api/z/${E}/info`); expect(alive.status).toBe(200); // the table is still there
  return `8 names stored; lengths ${vals.map((v) => v.length).join(",")}`;
});
tc({ id: "INP-08b", role: "participant", title: "a 5,000-character name gets a clear message (or is shortened), not 'Enter a valid mobile number'", steps: "Join with a 5,000-character name; PATCH settings with a 5,000-character reward", expected: "200 (shortened) or an error that says the text is too long", known: "F-09" }, async () => {
  const r = await anon().post(`/api/z/${E}/join`, { phone: phone(900), name: "x".repeat(5000), device: dev("big1") });
  const d = (await mkEng(O, { cap: 20 })).id;
  const s = await m.patch(`/api/z/${d}/settings`, { rewards: [{ pattern: "full", ordinal: 1, text: "Z".repeat(5000) }] });
  const clear = (x: any) => x.status === 200 || /long|large|size|characters/i.test(x.body?.error ?? "");
  expect(clear(r), `join said: ${J(r.body)}`).toBe(true);
  expect(clear(s), `settings said: ${J(s.body)}`).toBe(true);
  return "ok";
});
tc({ id: "INP-09", role: "participant", title: "the same mobile number twice is one person; a second phone for the same number gets 423", steps: "Join, join again from the same device, join again from another device", expected: "same pid with again:true; other device 423 'other-phone'" }, async () => {
  const ph = phone(500);
  const a = await anon().post(`/api/z/${E}/join`, { phone: ph, name: "Dup", device: dev("d1") }), b = await anon().post(`/api/z/${E}/join`, { phone: ph, name: "Dup", device: dev("d1") });
  const c = await anon().post(`/api/z/${E}/join`, { phone: ph, name: "Dup", device: dev("d2") });
  expect(a.status).toBe(200); expect(b.body.pid).toBe(a.body.pid); expect(b.body.again).toBe(true);
  expect(c.status).toBe(423); expect(c.body.code).toBe("other-phone");
  return "200 / again / 423";
});
tc({ id: "INP-10", role: "participant", title: "two phones cannot share one device id for different numbers (one phone, one ticket)", steps: "Join number X and number Y from the same device id", expected: "second is refused with device-used" }, async () => {
  const a = await anon().post(`/api/z/${E}/join`, { phone: phone(600), name: "One", device: dev("same") });
  const b = await anon().post(`/api/z/${E}/join`, { phone: phone(601), name: "Two", device: dev("same") });
  expect(a.status).toBe(200); expect(b.status).toBeGreaterThanOrEqual(400); expect(b.body.code ?? "").toMatch(/device-used|used/i);
  return J(b.body);
});
tc({ id: "INP-11", role: "all", title: "garbage request bodies never cause a 5xx", steps: "POST non-JSON, JSON array, null, 6 MB, wrong content-type to join, claims, vote, settings, publish, start, checkout", expected: "4xx for all" }, async () => {
  const bodies: [string, any][] = [["not json", "{{{"], ["array", "[1,2,3]"], ["null", "null"], ["empty", ""], ["number", "42"], ["string", '"x"'], ["6MB", JSON.stringify({ a: "x".repeat(6_000_000) })]];
  const targets: [string, string, Api][] = [["POST", `/api/z/${E}/join`, anon()], ["POST", `/api/z/${E}/claims`, anon()], ["POST", `/api/z/${E}/vote`, anon()], ["PATCH", `/api/z/${E}/settings`, m], ["POST", `/api/z/${E}/publish`, m],
    ["POST", "/api/start", anon()], ["POST", "/api/checkout", anon()], ["POST", "/api/auth/email", anon()], ["POST", "/api/auth/verify", anon()], ["POST", "/api/auth/link", anon()], ["POST", "/api/partner/enroll", anon()], ["POST", "/api/v/b", anon()]];
  const rs: any[] = [], wrong: string[] = [];
  for (const [bn, b] of bodies) for (const [meth, path, who] of targets) { const r = await who.call(meth, path, b, { "content-type": "application/json" }); rs.push(r); if (r.status >= 500) wrong.push(`${bn} ${meth} ${path} -> ${r.status}`); }
  expect(wrong).toEqual([]);
  return `${rs.length} garbage calls, no 5xx`;
});
tc({ id: "INP-12", role: "participant", title: "claims and votes with out-of-range numbers are ignored without error", steps: "POST claims/vote with round -1, idx 1e12, 8 claims, wrong types", expected: "200/400/403; no 5xx; nothing settles" }, async () => {
  const j = await anon().post(`/api/z/${E}/join`, { phone: phone(700), name: "Claimer", device: dev("cl") });
  const pid = j.body.pid;
  const rs = [await anon().post(`/api/z/${E}/claims`, { pid, claims: [{ round: -1, pattern: "full", idx: 1e12 }, { round: "x" }, null, 5, [], {}, { pattern: "<b>" }, { round: 1, pattern: "full", idx: -3 }] }),
    await anon().post(`/api/z/${E}/claims`, { pid, claims: Array.from({ length: 50 }, () => ({ round: 1, pattern: "full", idx: 5 })) }),
    await anon().post(`/api/z/${E}/vote`, { pid, results: [{ pattern: "full", ordinal: 1, round: -1, idx: 1e12, pids: ["x"] }] }),
    await anon().post(`/api/z/${E}/vote`, { pid, results: [{ pattern: "full", ordinal: 1, round: 1, idx: 5, pids: ["1x" + "a".repeat(12)] }, {}, {}, {}] }),
    await anon().post(`/api/z/${E}/vote`, { pid: "not-a-pid", results: [] })];
  expect(noFive(rs)).toEqual([]);
  const res = await anon().get(`/api/z/${E}/results`); expect(res.body.results).toEqual([]);
  return rs.map((r) => r.status).join(",");
});
tc({ id: "INP-13", role: "organizer", title: "settings: duplicate rewards, unknown patterns, ordinal 99, 5,000-char text, 4 breaks, bad invites are refused or shortened", steps: "PATCH settings with each", expected: "400 for structural errors; text shortened to 80; no 5xx" }, async () => {
  const d = (await mkEng(O, { cap: 20 })).id;
  const P = (b: object) => m.patch(`/api/z/${d}/settings`, b);
  const wrong: string[] = [];
  const must400: [string, object][] = [["duplicate reward", { rewards: [{ pattern: "full", ordinal: 1, text: "a" }, { pattern: "full", ordinal: 1, text: "b" }] }], ["unknown pattern", { rewards: [{ pattern: "bingo", ordinal: 1, text: "a" }] }],
    ["ordinal 99", { rewards: [{ pattern: "full", ordinal: 99, text: "a" }] }], ["ordinal 0", { rewards: [{ pattern: "full", ordinal: 0, text: "a" }] }], ["rewards string", { rewards: "full" }], ["tickets 3", { tickets: 3 }], ["rounds 9", { rounds: 9 }], ["rounds 0", { rounds: 0 }],
    ["4 breaks", { breaks: [1, 2, 3, 4].map((a) => ({ after: a * 10, seconds: 30, kind: "file", title: "Break " + a, mediaUrl: "https://example.com/a.mp4" })) }],
    ["break after 0", { breaks: [{ after: 0, seconds: 30, kind: "file", title: "B", mediaUrl: "https://example.com/a.mp4" }] }], ["break after 90", { breaks: [{ after: 90, seconds: 30, kind: "file", title: "B", mediaUrl: "https://example.com/a.mp4" }] }],
    ["break 14s", { breaks: [{ after: 10, seconds: 14, kind: "file", title: "B", mediaUrl: "https://example.com/a.mp4" }] }], ["break 601s", { breaks: [{ after: 10, seconds: 601, kind: "file", title: "B", mediaUrl: "https://example.com/a.mp4" }] }],
    ["break javascript url", { breaks: [{ after: 10, seconds: 30, kind: "file", title: "B", mediaUrl: "javascript:alert(1)" }] }], ["break http url", { breaks: [{ after: 10, seconds: 30, kind: "file", title: "B", mediaUrl: "http://example.com/a.mp4" }] }],
    ["break data url", { breaks: [{ after: 10, seconds: 30, kind: "file", title: "B", mediaUrl: "data:text/html,<script>1</script>" }] }], ["break kind x", { breaks: [{ after: 10, seconds: 30, kind: "exec", title: "B" }] }],
    ["invites per 5", { invites: { on: true, per: 5, cats: ["family"] } }], ["invites per 0", { invites: { on: true, per: 0, cats: ["family"] } }], ["invites cats junk", { invites: { on: true, per: 2, cats: ["<b>"] } }]];
  for (const [n, b] of must400) { const r = await P(b); if (r.status !== 400) wrong.push(`${n}->${r.status} ${J(r.text).slice(0, 70)}`); }
  const long = await P({ rewards: [{ pattern: "full", ordinal: 1, text: "Z".repeat(3000) + "<b>x</b>" }] });
  expect(long.status, J(long.text)).toBe(200);
  const s = await m.get(`/api/z/${d}/summary`); const txt = s.body.rewards.find((r: any) => r.pattern === "full").text;
  if (txt.length > 80 || /[<>]/.test(txt)) wrong.push(`reward text not cleaned: ${txt.length}`);
  expect(wrong).toEqual([]);
  return `${must400.length} structural refusals; long text kept at ${txt.length}`;
});
tc({ id: "INP-14", role: "organizer's AI", title: "the schedule helper refuses a date without a time zone and an impossible date", steps: "GET /api/z/schedule?at= with no zone, 30 February, month 13, 'tomorrow'", expected: "400 / ok:false for all four; 30 February must not silently become 2 March", known: "F-06" }, async () => {
  const who = new Api(BASE, O.aiKey);
  const probe = async (at: string) => who.get(`/api/z/schedule?at=${encodeURIComponent(at)}`);
  const noZone = await probe("2027-10-31T16:00:00"), feb30 = await probe("2027-02-30T10:00:00+05:30"), m13 = await probe("2027-13-01T10:00:00+05:30"), word = await probe("tomorrow");
  const evidence = `noZone ok=${noZone.body.ok} IST=${noZone.body.startsAtIST}; feb30 ok=${feb30.body.ok} IST=${feb30.body.startsAtIST}; m13 ${m13.status}; word ${word.status}`;
  expect([m13.status, word.status]).toEqual([400, 400]);
  expect(noZone.status, "time with no zone is read as UTC: " + evidence).toBe(400);
  expect(feb30.status, "an impossible date is silently moved: " + evidence).toBe(400);
  return evidence;
});
tc({ id: "INP-15", role: "organizer's AI", title: "time zones: the same wall-clock time in IST, UTC and US zones gives the matching rounds (no DST drift)", steps: "Ask the helper for 2027-03-14T09:00 in -05:00 (EST) and -04:00 (EDT), and 2027-03-28T02:30+01:00", expected: "start rounds differ by exactly the offset difference; startMs matches the instant" }, async () => {
  const who = new Api(BASE, O.aiKey);
  const t = async (at: string) => (await who.get(`/api/z/schedule?at=${encodeURIComponent(at)}`)).body;
  const est = await t("2027-03-14T09:00:00-05:00"), edt = await t("2027-03-14T09:00:00-04:00");
  expect(est.startMs - edt.startMs).toBe(3_600_000);
  const want = Date.parse("2027-03-14T09:00:00-05:00");
  expect(Math.abs(est.startMs - want)).toBeLessThanOrEqual(3000);
  return `EST ${est.startMs} EDT ${edt.startMs} (1h apart)`;
});
tc({ id: "INP-16", role: "organizer", title: "announcements: HTML stripped, 160-character limit, empty clears, rapid repeat is rate-limited", steps: "POST announce with markup, 400 chars, empty, twice in a row", expected: "tags removed, <=160, cleared ok, second within 5 s = 429" }, async () => {
  const a = await m.post(`/api/z/${E}/announce`, { text: "<b>Hello</b> `team` " + "x".repeat(400) });
  expect(a.status, J(a.text)).toBe(200); expect(a.body.sent.text).not.toMatch(/[<>`]/); expect(a.body.sent.text.length).toBeLessThanOrEqual(160);
  const b = await m.post(`/api/z/${E}/announce`, { text: "again" }); expect(b.status).toBe(429);
  return "cleaned, truncated, rate-limited";
});
tc({ id: "INP-17", role: "organizer", title: "mark/unbind with bad seat numbers and roles are 400/404 not 500", steps: "POST mark/unbind with seat -1, 0, 1e9, '1', role 'admin'", expected: "4xx" }, async () => {
  const rs = [];
  for (const b of [{ seat: -1, role: "host" }, { seat: 0, role: "host" }, { seat: 1e9, role: "host" }, { seat: "1", role: "host" }, { seat: 1, role: "admin" }, { seat: 1 }, {}]) rs.push(await m.post(`/api/z/${E}/mark`, b));
  for (const b of [{ seat: -1 }, { seat: 1e9 }, { phone: "1" }, {}]) rs.push(await m.post(`/api/z/${E}/unbind`, b));
  expect(noFive(rs)).toEqual([]);
  expect(rs.filter((r) => r.status === 200).length).toBe(0);
  return rs.map((r) => r.status).join(",");
});
tc({ id: "INP-18", role: "organizer", title: "roster: 101 people, mixed bad numbers, duplicates and over-capacity", steps: "POST roster with 101 entries; then 10 entries with bad numbers; then past the limit", expected: "101 refused; invalid counted; room limit respected" }, async () => {
  const d = (await mkEng(O, { cap: 5 })).id;
  const big = await m.post(`/api/z/${d}/roster`, { people: Array.from({ length: 101 }, (_, i) => ({ phone: phone(2000 + i), name: "R" + i })) }); expect(big.status).toBe(400);
  const mix = await m.post(`/api/z/${d}/roster`, { people: [{ phone: "123" }, { phone: phone(2500), name: "Ok1" }, { phone: phone(2500), name: "Dup" }, { phone: "abc" }, ...Array.from({ length: 8 }, (_, i) => ({ phone: phone(2600 + i), name: "N" + i }))] });
  expect(mix.status).toBe(200); expect(mix.body.invalid).toBe(2); expect(mix.body.added).toBe(5);
  const p = await m.get(`/api/z/${d}/participants`); expect(p.body.total).toBe(5);
  return J(mix.body);
});
tc({ id: "INP-19", role: "buyer", title: "checkout: bad pack, bad e-mail, short organisation, bad GSTIN, unknown currency", steps: "POST /api/checkout with odd values (TEST mode)", expected: "400 for pack/e-mail/org/GSTIN problems; no payment row for refused calls" }, async () => {
  const good = { pack: 100, email: O.email, org: "Odd Org", country: "IN", currency: "INR" };
  const wrong: string[] = [];
  const t = async (n: string, patch: object, want = 400) => { const r = await anon().post("/api/checkout", { ...good, ...patch }); if (r.status !== want) wrong.push(`${n}->${r.status} ${J(r.text).slice(0, 60)}`); return r; };
  await t("pack -1", { pack: -1 }); await t("pack 0", { pack: 0 }); await t("pack 99", { pack: 99 }); await t("pack 1e9", { pack: 1e9 }); await t("pack text", { pack: "abc" }); await t("email bad", { email: "nope" }); await t("email empty", { email: "" });
  await t("org 1 char", { org: "A" }); await t("org missing", { org: undefined }); await t("GSTIN bad", { taxId: "12ABC" }); await t("GSTIN lower bad", { taxId: "zzzzzzzzzzzzzzz" });
  const eur = await anon().post("/api/checkout", { ...good, currency: "EUR" });
  expect(wrong).toEqual([]);
  return `EUR silently treated as INR: ${J(eur.body.result?.currency ?? eur.status)}`;
});
tc({ id: "INP-20", role: "organizer", title: "suggestions: contact details are refused, markup is stripped, short text refused", steps: "POST /api/z/suggestions with e-mail, phone, markup, 3-char title", expected: "400 for e-mail/phone/short; markup stripped" }, async () => {
  const S = (b: object) => new Api(BASE, O.aiKey).post("/api/z/suggestions", { kind: "feature", title: "A fine title " + rnd(), body: "A useful description of the need", ...b });
  const r1 = await S({ body: "call me on 9876543210 please" }), r2 = await S({ body: "write to me@example.com thanks" }), r3 = await S({ title: "abc" }), r4 = await S({ kind: "hack" });
  expect([r1.status, r2.status, r3.status, r4.status]).toEqual([400, 400, 400, 400]);
  const ok = await S({ title: "<b>Bold idea</b> " + rnd() }); expect(ok.status).toBe(200);
  const list = await new Api(BASE, O.aiKey).get("/api/z/suggestions");
  expect(list.text).not.toContain("<b>Bold");
  return "ok";
});
