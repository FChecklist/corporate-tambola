// SMOKE 20 NOV, owner step 19: the data sent to the organizer (the report and its PDF): what it holds, who can see it, who cannot (Hosts, Co-hosts, AI keys, strangers, players), when the link closes.
// A mobile-number game (names and numbers exist) in each of the four start formats, so there is real personal data to leak.
import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { reset, restore, provider, installProvider, FORMATS, newGame, runAllNumbers, callLog, winnersOf, row, one, q, call, j, W, T, MIN, HOUR, count, keyH, tickFor, lifecycleTick, reportLink, publicKeyFromSecret, HOST_SECRET, type Game } from "./h";
import { join } from "../param-harness";
import { layoutReport, layoutPeoplePart } from "../../src/report-layout";
setDefaultTimeout(240_000);
beforeEach(() => { reset(); installProvider(); }); afterEach(restore);

const NAMES = ["Asha Rao", "Ravi Shah", "Meera Iyer", "Kabir Sen", "Zoya Khan"];
async function mobileGame(f: (typeof FORMATS)[number]) {
  const g = await newGame(f, { verify: "mobile", list: false });
  const h = await j(await call("POST", "/api/org/host", { label: "Priya", mobile: "9822200011", email: "host@acme.com" }, g.h));
  W.raw.prepare("UPDATE host_state SET verified_ms=?, mobile_ok=1").run(T);
  const c = await j(await call("POST", "/api/org/cohost", { label: "Ravi", phone: "9876500001", e: g.id }, g.h));
  const pids: string[] = [];
  for (const [i, n] of NAMES.entries()) { const r = await join(g.id, i + 1, { name: n }); expect([n, r.status]).toEqual([n, 200]); pids.push((await j(r)).pid); }
  const last = await runAllNumbers(g); const { log } = await callLog(g);
  const res = winnersOf(g, pids, log).map((x) => ({ pattern: x.pattern, ordinal: x.ordinal, round: 1, idx: x.idx, pids: x.pids }));
  for (const pid of pids) for (let i = 0; i < res.length; i += 3) await call("POST", `/api/z/${g.id}/vote`, { pid, results: res.slice(i, i + 3) }, {}, last + MIN);
  await tickFor(last + 5 * MIN, 12);
  const k = new URL(await reportLink(W.env as any, g.id)).searchParams.get("k")!;
  return { g, host: keyH(h.hostKey), cohost: keyH(c.cohostKey), ai: g.org.aiH as Record<string, string>, pids, last, k, res };
}
const endOf = (g: Game) => Number(one("SELECT end_ms FROM life WHERE eid=?", g.id).end_ms);

for (const f of FORMATS) describe(`[${f.key}] the report (step 19)`, () => {
  test("S19-1 content: every player once, with the name and number they gave, the prizes with their winners, the game's times; the PDF is built from it and carries the names", async () => {
    const { g, k } = await mobileGame(f);
    const base = await j(await call("GET", `/api/report/${g.id}?k=${k}`, undefined, {}, endOf(g) + 10 * MIN));
    expect(base.totalPeople).toBe(5); expect(base.base.prizes.length).toBe(7); expect(base.base.engagementId).toBe(g.id);
    const ppl = (await j(await call("GET", `/api/report/${g.id}?k=${k}&part=people&i=0`, undefined, {}, endOf(g) + 10 * MIN))).people as any[];
    expect(ppl.map((p) => p.name).sort()).toEqual([...NAMES].sort());
    for (const p of ppl) expect(String(p.phone)).toMatch(/^(91)?\d{10}$/);
    expect(new Set(ppl.map((p) => p.seat)).size).toBe(5);
    const winnersNamed = base.base.prizes.flatMap((p: any) => p.winners).filter((w: any) => w.name);
    expect(winnersNamed.length).toBeGreaterThan(0); for (const w of winnersNamed) expect(NAMES).toContain(w.name);
    const pdf = layoutReport(base.base); expect(String.fromCharCode(...pdf.slice(0, 5))).toBe("%PDF-");
    const part = layoutPeoplePart(base.base, ppl, 1, 1); const txt = new TextDecoder("latin1").decode(part);
    for (const n of NAMES) expect(txt).toContain(n.split(" ")[0]!);
  });
  test("S19-2 who can fetch the report LINK: only the Organizer's own key. A Host, a Co-host, an AI key, a stranger, a player get no link", async () => {
    const { g, host, cohost, ai } = await mobileGame(f); const at = endOf(g) + 10 * MIN;
    const get = async (h: Record<string, string>) => { const r = await call("GET", `/api/z/${g.id}/reportlink`, undefined, h, at); return { s: r.status, url: (await j(r)).url as string | null | undefined }; };
    const m = await get(g.h); expect(m.s).toBe(200); expect(m.url).toMatch(/report\.html\?e=/);
    const leaks: string[] = [];
    for (const [who, h] of [["Host", host], ["Co-host", cohost], ["AI key", ai], ["stranger", {}]] as const) { const r = await get(h as Record<string, string>); if (r.url) leaks.push(who); }
    expect(leaks).toEqual([]); // nobody but the Organizer is given the address of the report
  });
  test("S19-3 the report link itself: no key, a wrong key, another game's key, an old key after Replace: all refused; the new key works; after 19 hours it is closed", async () => {
    const { g, k } = await mobileGame(f); const at = endOf(g) + 10 * MIN;
    const t = (kk: string | null, now = at) => call("GET", `/api/report/${g.id}${kk === null ? "" : "?k=" + kk}`, undefined, {}, now);
    expect((await t(k)).status).toBe(200);
    for (const bad of [null, "", "0".repeat(40), k.slice(0, -1) + (k.endsWith("0") ? "1" : "0")]) expect([bad, (await t(bad)).status]).toEqual([bad, 403]);
    const other = await newGame(f); const ko = new URL(await reportLink(W.env as any, other.id)).searchParams.get("k")!; expect((await t(ko)).status).toBe(403);
    const nu = await j(await call("POST", `/api/z/${g.id}/reportlink`, {}, g.h, at)); const k2 = new URL(nu.url).searchParams.get("k")!; expect(k2).not.toBe(k);
    expect((await t(k)).status).toBe(403); expect((await t(k2)).status).toBe(200);
    expect((await t(k2, endOf(g) + 19 * HOUR - MIN)).status).toBe(200); expect((await t(k2, endOf(g) + 19 * HOUR + MIN)).status).toBeGreaterThanOrEqual(400);
  });
  test("S19-4 the e-mail: one, to the organizer's confirmed address only (never the Host or Co-host), holds no name and no number, and only this mail carries the report address", async () => {
    const { g } = await mobileGame(f);
    const rep = provider.delivered.filter((m) => /report is ready/i.test(m.subject) && m.text.includes(g.id));
    expect(rep.length).toBe(1); expect(rep[0]!.to).toBe("boss@acme.com");
    for (const n of NAMES) expect(rep[0]!.text).not.toContain(n); for (let i = 1; i <= 5; i++) expect(rep[0]!.text).not.toContain("9" + String(100000000 + i));
    for (const m of provider.delivered) if (m !== rep[0]) expect([m.subject, /report\.html\?e=/.test(m.text)]).toEqual([m.subject, false]);
    expect(provider.delivered.filter((m) => m.to === "host@acme.com" && /report/i.test(m.subject)).length).toBe(0);
    // the time it states is the time the data really goes
    const life = await j(await call("GET", `/api/z/${g.id}/life`, undefined, g.h, endOf(g) + 10 * MIN));
    expect(life.personalDeleteAtMs - life.endMs).toBe(20 * HOUR);
    await lifecycleTick(W.env as any, life.personalDeleteAtMs + MIN); expect(count("SELECT COUNT(*) AS c FROM participant WHERE eid=?", g.id)).toBe(0);
  });
  test("S19-5 the people lists: the Host's lists carry ticket ids only, a stranger gets nothing, a Co-host cannot read the people", async () => {
    const { g, host, cohost, ai, pids } = await mobileGame(f);
    const at = g.at + 5 * MIN;
    const part = async (h: Record<string, string>) => { const r = await call("GET", `/api/z/${g.id}/participants`, undefined, h, at); return { s: r.status, body: JSON.stringify(await j(r)) }; };
    for (const h of [g.h, host]) { const r = await part(h as Record<string, string>); expect(r.s).toBe(200); for (const n of NAMES) expect(r.body).not.toContain(n); for (let i = 1; i <= 5; i++) expect(r.body).not.toContain("9" + String(100000000 + i)); }
    for (const h of [cohost, {}]) expect((await part(h as Record<string, string>)).s).toBeGreaterThanOrEqual(400);
    const nm = (h: Record<string, string>) => call("GET", `/api/z/${g.id}/names?pids=${pids.join(",")}`, undefined, h, at);
    expect((await nm(g.h)).status).toBe(200);
    for (const [who, h] of [["Co-host", cohost], ["AI key", ai], ["stranger", {}]] as const) expect([who, (await nm(h as Record<string, string>)).status >= 400]).toEqual([who, true]);
  });
  test.failing("S19-6 OPEN (owner decision): a Host cannot read the name of a player who has not won (today: any pid, 60 at a time, so a Host can read the whole list)", async () => {
    const { g, host, pids } = await mobileGame(f);
    const r = await j(await call("GET", `/api/z/${g.id}/names?pids=${pids.join(",")}`, undefined, host, g.at + 5 * MIN));
    expect(Object.keys(r.names ?? {}).length).toBeLessThan(5);
  });
});
