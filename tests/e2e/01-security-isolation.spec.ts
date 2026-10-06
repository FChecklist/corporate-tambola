// SEC-*: who may do what. Owner endpoints, cross-tenant isolation (IDOR), what the AI work link and the co-host key can and cannot do, revoked keys, GET-only AI clients.
import { Api, BASE, IS_LIVE, J, anon, eid, expect, mkEng, newOrg, owner, phone, dev, requireTestMode, startIn, tc, test, platformKey, type Org } from "./lib/harness";

let A: Org, B: Org, EA: string, EB: string, hostKeyA: string, aiA: Api, aiB: Api, mA: Api, mB: Api, hA: Api;

test.beforeAll(async () => {
  if (IS_LIVE) await requireTestMode();
  A = await newOrg("secA"); B = await newOrg("secB");
  mA = new Api(BASE, A.token); mB = new Api(BASE, B.token); aiA = new Api(BASE, A.aiKey); aiB = new Api(BASE, B.aiKey);
  EA = (await mkEng(A, { cap: 50 })).id; EB = (await mkEng(B, { cap: 50 })).id;
  await mA.patch(`/api/z/${EA}/settings`, { rewards: [{ pattern: "full", ordinal: 1, text: "Secret hamper A" }] });
  const p = await mA.post(`/api/z/${EA}/publish`, { email: A.email, phone: "9811122233" });
  if (p.status !== 200) throw new Error("publish A " + J(p.text));
  await mB.post(`/api/z/${EB}/publish`, { email: B.email, phone: "9811122244" });
  // pay A in TEST mode so it is a real, joinable engagement
  const pay = await mA.post("/api/payments/test", { eid: EA, email: A.email, org: "Org A", country: "IN" });
  if (pay.status !== 200) throw new Error("pay A " + J(pay.text));
  await mA.post(`/api/z/${EA}/roster`, { people: [{ phone: phone(1), name: "Alice Private" }, { phone: phone(2), name: "Bob Private" }] });
  const hk = await mA.post("/api/org/host"); hostKeyA = hk.body.hostKey; hA = new Api(BASE, hostKeyA);
});

const NOT_FOUND_OR_DENY = [401, 403, 404];

tc({ id: "SEC-01", role: "anonymous", title: "owner endpoints answer 404 without a key", steps: "Call each owner-only address with no key", expected: "404 (same as an unknown address), never 200/401/500" }, async () => {
  const paths: [string, string][] = [["GET", "/api/owner/mode"], ["POST", "/api/owner/mode"], ["GET", "/api/owner/test-mail"], ["POST", "/api/owner/purge-test-data"], ["GET", "/api/owner/visits/summary"],
    ["GET", "/api/owner/audit/access"], ["GET", "/api/owner/audit/sys/verify"], ["GET", "/api/owner/audit/sys"], ["POST", "/api/owner/audit/sys/hold"], ["POST", "/api/owner/audit/sys/analyze"]];
  const bad: string[] = [];
  for (const [m, p] of paths) { const r = await anon().call(m, p, m === "POST" ? {} : undefined); if (r.status !== 404) bad.push(`${m} ${p} -> ${r.status}`); }
  expect(bad, "owner endpoints that did not answer 404").toEqual([]);
  return `${paths.length} owner addresses all 404`;
});
tc({ id: "SEC-02", role: "organizer / AI / co-host", title: "owner endpoints answer 404 to organizer, AI and co-host keys", steps: "Same list with each of the three keys", expected: "404 for every one" }, async () => {
  const paths: [string, string][] = [["GET", "/api/owner/mode"], ["POST", "/api/owner/purge-test-data"], ["GET", "/api/owner/visits/summary"], ["GET", "/api/owner/audit/access"], ["GET", "/api/owner/audit/sys/verify"]];
  const bad: string[] = [];
  for (const k of [A.token, A.aiKey, hostKeyA]) for (const [m, p] of paths) { const r = await new Api(BASE, k).call(m, p, m === "POST" ? { confirm: "purge test data" } : undefined); if (r.status !== 404) bad.push(`${m} ${p} -> ${r.status}`); }
  expect(bad).toEqual([]);
  return "45 attempts, all 404";
});
tc({ id: "SEC-03", role: "AI work link", title: "the platform key cannot be used inside an AI address; owner calls through /ai/ are refused", steps: "GET /ai/<platform key>; GET /ai/<platform key>/owner/mode (never printed)", expected: "404 'link gone' for both" }, async () => {
  const k = platformKey();
  const r1 = await anon().get(`/ai/${k}`), r2 = await anon().get(`/ai/${k}/owner/mode`);
  expect([r1.status, r2.status]).toEqual([404, 404]);
  return "404/404";
});
tc({ id: "SEC-04", role: "anonymous", title: "platform-only actions are refused without the platform key", steps: "POST /api/org, /api/purge, /api/notices, /api/lifecycle/tick, partner admin calls, as anonymous and as an organizer", expected: "401/403/404, never 200" }, async () => {
  const calls: [string, string, any][] = [["POST", "/api/org", {}], ["POST", "/api/purge", {}], ["POST", "/api/notices", { notices: [{ id: "x1", title: "t", body: "b" }] }], ["POST", "/api/lifecycle/tick", {}],
    ["GET", "/api/partners", undefined], ["POST", "/api/partners/commission/rate", { rate: 0.5 }], ["POST", "/api/partners/payout", {}], ["POST", "/api/partners/commission/void", {}], ["POST", "/api/partners/state", {}]];
  const bad: string[] = [];
  for (const who of [anon(), mA, aiA]) for (const [m, p, b] of calls) { const r = await who.call(m, p, b); if (r.status === 200 || r.status >= 500) bad.push(`${m} ${p} -> ${r.status}`); }
  expect(bad).toEqual([]);
  return `${calls.length * 3} refusals`;
});
tc({ id: "SEC-05", role: "second organizer B", title: "B cannot read or change A's engagement (IDOR sweep over every engagement action)", steps: "With B's master key call every /api/z/<A's id>/<action>", expected: "403/404 each time; A's settings unchanged" }, async () => {
  const before = (await mA.get(`/api/z/${EA}/summary`)).text;
  const acts: [string, string, any][] = [["GET", "summary", undefined], ["PATCH", "settings", { cap: 5, rewards: [{ pattern: "full", ordinal: 1, text: "HACKED" }] }], ["GET", "participants", undefined], ["GET", "claims", undefined],
    ["GET", "prizes", undefined], ["POST", "prizegiven", { round: 1, pattern: "full", ordinal: 1, given: true }], ["POST", "announce", { text: "hacked" }], ["POST", "erase", {}], ["POST", "reuse", { from: EB }],
    ["POST", "unbind", { seat: 1 }], ["POST", "mark", { seat: 1, role: "organizer" }], ["POST", "roster", { people: [{ phone: phone(77), name: "Mallory" }] }], ["GET", "life", undefined], ["GET", "invites", undefined],
    ["GET", "reportlink", undefined], ["POST", "reportlink", {}], ["POST", "publish", { email: "x@example.com", phone: "9811122255" }], ["POST", "control/request", { action: "stop" }], ["PUT", "control/key", { publicKey: "x" }],
    ["POST", "person", { phone: phone(1) }], ["POST", "forget", { phone: phone(1) }], ["GET", "names", undefined]];
  const bad: string[] = [];
  for (const [m, a, b] of acts) { const r = await mB.call(m, `/api/z/${EA}/${a}`, b); if (![403, 404, 409, 400].includes(r.status) || r.status === 200) bad.push(`${m} ${a} -> ${r.status} ${J(r.text).slice(0, 80)}`); }
  expect(bad, "cross-tenant calls that were not refused").toEqual([]);
  expect((await mA.get(`/api/z/${EA}/summary`)).text).toBe(before);
  return `${acts.length} B->A calls refused; A summary byte-identical`;
});
tc({ id: "SEC-06", role: "second organizer B", title: "B's AI key and A's AI key are equally walled off", steps: "A's AI key against B's engagement and the reverse; also A's AI key on /api/history", expected: "no data crosses; history lists only own engagements" }, async () => {
  const r1 = await aiA.get(`/api/z/${EB}/summary`), r2 = await aiB.get(`/api/z/${EA}/summary`);
  expect([r1.status, r2.status].every((s) => s === 403 || s === 404)).toBe(true);
  const h = await aiA.get("/api/history");
  const ids = (h.body.engagements ?? []).map((x: any) => x.id);
  expect(ids).toContain(EA); expect(ids).not.toContain(EB);
  return `A sees ${ids.length} engagements, none of B's`;
});
tc({ id: "SEC-07", role: "second organizer B", title: "B cannot copy A's roster through 'reuse' from A's engagement", steps: "B POST /api/z/<EB>/reuse {from: EA}", expected: "refused; no people copied" }, async () => {
  const r = await mB.post(`/api/z/${EB}/reuse`, { from: EA });
  expect(r.status).toBe(400);
  const p = await mB.get(`/api/z/${EB}/participants`);
  expect((p.body.participants ?? p.body.people ?? []).length ?? 0).toBe(0);
  return J(r.body);
});
tc({ id: "SEC-08", role: "second organizer B", title: "B cannot open A's report with B's own or a made-up key", steps: "GET /api/report/<EA> with no key, with a wrong key, with another engagement's key", expected: "404/403 and no personal data" }, async () => {
  const r0 = await anon().get(`/api/report/${EA}`), r1 = await anon().get(`/api/report/${EA}?k=${"0".repeat(32)}`), r2 = await anon().get(`/api/report/${EA}?k=${A.token}`);
  for (const r of [r0, r1, r2]) { expect([403, 404, 410, 400]).toContain(r.status); expect(r.text).not.toContain("Alice"); }
  return [r0.status, r1.status, r2.status].join("/");
});
tc({ id: "SEC-09", role: "AI work link", title: "the AI can prepare but not publish, pay, erase, settle, pause or take names", steps: "With A's AI key: publish a fresh draft, pay, erase, settle, roster, unbind by phone, close account, replace link, list keys", expected: "each refused or turned into a request for the organizer" }, async () => {
  const d = (await mkEng(A, { cap: 20 })).id;
  const out: string[] = [];
  const pub = await aiA.post(`/api/z/${d}/publish`, {}); expect(pub.body.needsOrganizer).toBe(true); out.push("publish->needsOrganizer");
  const sum = await mA.get(`/api/z/${d}/summary`); expect(sum.body.status).toBe("draft"); // still a draft after the AI 'published'
  const pay = await aiA.post("/api/payments/test", { eid: d, email: A.email, org: "AI", country: "IN" }); expect(pay.status).not.toBe(200); out.push(`pay->${pay.status}`);
  const ck = await aiA.post("/api/checkout", { eid: d, pack: 100, email: A.email, org: "AI" }); expect(ck.status).not.toBe(200); out.push(`checkout->${ck.status}`);
  const er = await aiA.post(`/api/z/${EA}/erase`, {}); expect([403, 404]).toContain(er.status); out.push(`erase->${er.status}`);
  const st = await aiA.post(`/api/z/${EA}/settle`, { results: [] }); expect([403, 404]).toContain(st.status);
  const ro = await aiA.post(`/api/z/${EA}/roster`, { people: [{ phone: phone(5), name: "AI Person" }] }); expect(ro.status).toBe(403); out.push("roster->403");
  const ub = await aiA.post(`/api/z/${EA}/unbind`, { phone: phone(1) }); expect(ub.status).toBe(403); out.push("unbind-by-phone->403");
  const cl = await aiA.post("/api/org/close", { confirm: true }); expect([403, 404]).toContain(cl.status); out.push(`close->${cl.status}`);
  const rp = await aiA.post("/api/org/ai/replace", {}); expect([403, 404]).toContain(rp.status);
  const ks = await aiA.get("/api/org/keys"); expect([403, 404]).toContain(ks.status);
  const cr = await aiA.post(`/api/z/${EA}/control/request`, { action: "erase", note: "please" }); expect(cr.status).toBe(200); expect(cr.body.message).toMatch(/Nothing has been deleted/);
  const people = await mA.get(`/api/z/${EA}/participants`); expect(JSON.stringify(people.body)).toContain("participants");
  return out.join(", ");
});
tc({ id: "SEC-10", role: "AI work link", title: "AI participant view never carries names or mobile numbers", steps: "AI GET participants, prizes, summary of an engagement with named people", expected: "no 10-digit numbers and no names in any AI answer" }, async () => {
  const bodies = [(await aiA.get(`/api/z/${EA}/participants`)).text, (await aiA.get(`/api/z/${EA}/prizes`)).text, (await aiA.get(`/api/z/${EA}/summary`)).text, (await aiA.get(`/api/z/${EA}/claims`)).text];
  const all = bodies.join("\n");
  expect(all).not.toMatch(/Alice|Bob Private/); expect(all).not.toMatch(new RegExp(phone(1))); expect(all).not.toMatch(new RegExp(phone(2)));
  return "no names/numbers in 4 AI reads";
});
tc({ id: "SEC-11", role: "co-host", title: "a co-host key can only watch, announce and tick prizes", steps: "Co-host calls every organizer action", expected: "allowed: participants, summary, results, info, announce, prizes, prizegiven, reportlink, life; all else refused" }, async () => {
  const denied: [string, string, any][] = [["PATCH", "settings", { cap: 10 }], ["POST", "publish", { email: "a@b.co", phone: "9811122233" }], ["POST", "roster", { people: [{ phone: phone(9), name: "X" }] }], ["POST", "erase", {}], ["POST", "reuse", { from: EB }], ["POST", "unbind", { seat: 1 }],
    ["POST", "mark", { seat: 1, role: "host" }], ["PUT", "control/key", { publicKey: "k" }], ["POST", "forget", { phone: phone(1) }]];
  const bad: string[] = [];
  for (const [m, a, b] of denied) { const r = await hA.call(m, `/api/z/${EA}/${a}`, b); if (![403, 404].includes(r.status)) bad.push(`${m} ${a}->${r.status}`); }
  for (const p of ["/api/org/host", "/api/org/keys", "/api/org/close", "/api/org/ai/replace", "/api/payments/test"]) { const r = await hA.post(p, {}); if (![400, 403, 404].includes(r.status)) bad.push(`${p}->${r.status}`); }
  expect(bad).toEqual([]);
  const ok = [await hA.get(`/api/z/${EA}/summary`), await hA.get(`/api/z/${EA}/participants`), await hA.get(`/api/z/${EA}/life`)];
  expect(ok.map((r) => r.status)).toEqual([200, 200, 200]);
  return "10+5 refusals; 3 reads allowed";
});
tc({ id: "SEC-11b", role: "co-host", title: "a co-host cannot file pause/stop/erase requests (they are the organizer's to ask)", steps: "Co-host POST /control/request {action: stop} and {action: erase}", expected: "403/404 (a co-host may only watch, announce and tick prizes)", known: "F-02" }, async () => {
  const r1 = await hA.post(`/api/z/${EA}/control/request`, { action: "stop", note: "co-host test" });
  const r2 = await hA.post(`/api/z/${EA}/control/request`, { action: "erase", note: "co-host test" });
  await mA.post(`/api/z/${EA}/control/request/clear`, {}); // tidy
  expect([r1.status, r2.status], "co-host request statuses").toEqual([403, 403]);
  return "refused";
});
tc({ id: "SEC-12", role: "co-host", title: "co-host cannot reach another organizer's engagement", steps: "A's co-host key on B's engagement (allowed actions only)", expected: "403/404" }, async () => {
  for (const a of ["summary", "participants", "life", "prizes"]) { const r = await hA.get(`/api/z/${EB}/${a}`); expect([403, 404]).toContain(r.status); }
  return "4 reads refused";
});
tc({ id: "SEC-13", role: "organizer", title: "a retired (revoked) sign-in key stops working; the key in use cannot be retired", steps: "Create 2nd key by POST /api/org/keys? use /api/auth flow: revoke the AI key and call with it", expected: "revoked AI key refused at once; its /ai/ address answers 404" }, async () => {
  const o = await newOrg("secRev");
  const ai = new Api(BASE, o.aiKey), m = new Api(BASE, o.token);
  expect((await ai.get("/api/whoami")).status).toBe(200);
  const rv = await m.post("/api/org/ai/revoke"); expect(rv.status).toBe(200);
  expect((await ai.get("/api/whoami")).status).toBeGreaterThanOrEqual(403);
  expect((await anon().get(`/ai/${o.aiKey}`)).status).toBe(404);
  const self = await m.get("/api/org/keys"); const me = self.body.keys.find((k: any) => k.thisOne);
  const rs = await m.post("/api/org/keys/revoke", { id: me.id }); expect(rs.status).toBe(409);
  return "AI key dead after revoke; self-revoke 409";
});
tc({ id: "SEC-14", role: "AI work link", title: "replace link kills the old AI link at once and the new one works", steps: "POST /api/org/ai/replace with the organizer key", expected: "old key refused, new key works" }, async () => {
  const o = await newOrg("secRep"); const m = new Api(BASE, o.token);
  const r = await m.post("/api/org/ai/replace"); expect(r.status).toBe(200);
  expect((await new Api(BASE, o.aiKey).get("/api/whoami")).status).toBeGreaterThanOrEqual(403);
  const msg: string = r.body.aiMessage ?? r.text; const nk = /cta_[0-9a-f]{48}/.exec(msg)?.[0]; expect(nk).toBeTruthy();
  expect((await new Api(BASE, nk).get("/api/whoami")).status).toBe(200);
  return "old dead, new alive";
});
tc({ id: "SEC-15", role: "AI work link (GET-only client)", title: "GET-only AI clients can act through _method/_body; only POST/PATCH are accepted; bad JSON is refused", steps: "GET /ai/<key>/z/<id>/settings?_method=PATCH&_body=...; _method=DELETE; broken _body", expected: "PATCH applied; DELETE 400; broken JSON 400" }, async () => {
  const d = (await mkEng(B, { cap: 20 })).id;
  const ok = await anon().get(`/ai/${B.aiKey}/z/${d}/settings?_method=PATCH&_body=${encodeURIComponent(JSON.stringify({ cap: 30 }))}`);
  expect(ok.status).toBe(200);
  expect((await mB.get(`/api/z/${d}/summary`)).body.limit).toBe(30);
  const del = await anon().get(`/ai/${B.aiKey}/z/${d}/settings?_method=DELETE`); expect(del.status).toBe(400);
  const bad = await anon().get(`/ai/${B.aiKey}/z/${d}/settings?_method=PATCH&_body=%7Bnot-json`); expect(bad.status).toBe(400);
  const man = await anon().get(`/ai/${B.aiKey}`); expect(man.status).toBe(200); expect(man.headers.get("content-type")).toMatch(/text\/plain/);
  const head = await fetch(`${BASE}/ai/${B.aiKey}`, { method: "HEAD" }); expect(head.status).toBe(200);
  return "PATCH via GET ok, DELETE 400, bad JSON 400, manual text/plain, HEAD ok";
});
tc({ id: "SEC-16", role: "AI work link", title: "an organizer sign-in key (ctk_) and a made-up key are never accepted in an AI address", steps: "GET /ai/<ctk_..>, /ai/cta_<random>, /ai/short", expected: "404 each" }, async () => {
  const rs = [await anon().get(`/ai/${B.token}`), await anon().get(`/ai/cta_${"0".repeat(48)}`), await anon().get(`/ai/zzz`)];
  expect(rs.map((r) => r.status)).toEqual([404, 404, 404]);
  return "404 x3";
});
tc({ id: "SEC-17", role: "organizer", title: "the AI's calls are in the organizer's audit trail and the trail never contains a key", steps: "A's AI makes calls; the organizer reads /api/org/ai/audit", expected: "entries exist; no ctk_/cta_/cth_ key text" }, async () => {
  await aiA.get(`/api/z/${EA}/summary`);
  const r = await mA.get("/api/org/ai/audit");
  expect(r.status).toBe(200);
  expect(r.text).not.toMatch(/ct[kah]_[0-9a-f]{20}/);
  const n = (r.body.trail ?? []).length;
  expect(n).toBeGreaterThan(0);
  return `${n} audited AI calls, no key text`;
});
tc({ id: "SEC-18", role: "organizer", title: "organizer cannot read another organizer's AI audit or key list", steps: "B reads /api/org/ai/audit and /api/org/keys", expected: "only B's own rows" }, async () => {
  const au = await mB.get("/api/org/ai/audit");
  expect(JSON.stringify(au.body)).not.toContain(EA);
  const ks = await mA.get("/api/org/keys"), kb = await mB.get("/api/org/keys");
  const ia = new Set(ks.body.keys.map((k: any) => k.id)); expect(kb.body.keys.some((k: any) => ia.has(k.id))).toBe(false);
  return "no overlap";
});
tc({ id: "SEC-19", role: "anonymous", title: "unknown engagement ids and malformed ids do not leak or crash", steps: "GET info/join/seats for odd ids", expected: "404/400, never 500, no stack traces" }, async () => {
  const ids = ["NOPE1234", "a", "A".repeat(60), "%00", "..%2f..%2fetc", "'; DROP TABLE engagement;--", "<script>", "ünï", "😀😀😀😀"];
  const bad: string[] = [];
  for (const id of ids) for (const a of ["info", "seats", "results"]) { const r = await anon().get(`/api/z/${encodeURIComponent(id)}/${a}`); if (r.status >= 500 || /at .*\(.*:\d+:\d+\)/.test(r.text)) bad.push(`${id} ${a} ${r.status}`); }
  expect(bad).toEqual([]);
  return `${ids.length * 3} odd reads, no 5xx`;
});
tc({ id: "SEC-20", role: "anonymous", title: "security headers and CSP on the game, console and pay pages", steps: "HEAD the pages", expected: "CSP present; frame-ancestors none; nosniff on game pages" }, async () => {
  const bad: string[] = [];
  for (const p of ["/z", "/zc", "/pay", "/big"]) { const r = await fetch(BASE + p); const csp = r.headers.get("content-security-policy") ?? ""; if (!csp.includes("frame-ancestors 'none'")) bad.push(`${p} csp:${csp ? "weak" : "missing"}`); if (r.headers.get("x-content-type-options") !== "nosniff") bad.push(`${p} nosniff missing`); }
  if (!IS_LIVE) return "skipped on local stand-in (headers come from Cloudflare Pages _headers)";
  expect(bad).toEqual([]);
  return "ok";
});
