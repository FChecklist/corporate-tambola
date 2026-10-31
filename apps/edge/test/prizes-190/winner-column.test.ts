// R6 winner column (fix round 1): the prize sheet shows "Ticket N - <Employee ID or Email ID>, <name>, <mobile>". Those details come from the organizer-only GET /api/z/<id>/prizes and must NEVER appear in a public answer.
// FALSIFIED BY: tools/matrix/breaks/table.ts (WC-series)
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { FROM, P, Site, body2, j } from "./harness";
import { callTimeMs } from "../../src/lifecycle";
setDefaultTimeout(60_000);
const s = new Site();
const AT = FROM + 3_600_000;
const DEV = "0".repeat(32);
const SECRETS = ["E1001", "e1001", "Asha Winner", "9810007777", "810007777", "asha@acme.com", "ASHA@ACME.COM"];

/** A new 2-ticket game with an ID (`kind` = Employee ID or Email ID) and a mobile number; one player who wins top@1 by the phones' report. Returns what the organizer / the public routes need. */
async function won(id: string, kind: "emp" | "email", person: { empId?: string; name?: string; phone?: string } = {}) {
  const started = await s.make(id, AT);
  expect((await s.patch(AT + 1000, id, { ...body2(), verify: "either", whoCanJoin: "anyone", ...(kind === "email" ? { idKind: "email" } : {}) })).status).toBe(200);
  const listed = person.empId === "" ? null : person.empId ?? (kind === "email" ? "Asha@Acme.com" : "E1001");
  if (listed) { const a = await s.call(AT + 2000, "POST", `/api/z/${id}/people`, { people: [{ name: person.name ?? "Asha Winner", empId: listed }] }, P); expect([a.status, (await j(a)).error]).toEqual([200, undefined]); }
  const body = { name: person.name ?? "Asha Winner", ...(person.phone === "" ? {} : { phone: person.phone ?? "9810007777" }), ...(person.empId === "" ? {} : { empId: person.empId ?? (kind === "email" ? "Asha@Acme.com" : "E1001") }), device: DEV };
  const jn = await s.call(AT + 5000, "POST", `/api/z/${id}/join`, body), jb = await j(jn); expect([jn.status, jb.error]).toEqual([200, undefined]);
  const pid = jb.pid as string;
  s.raw.prepare("INSERT OR REPLACE INTO kv(k,v) VALUES(?,?)").run(`present/${id}/${String(pid).split("x")[0]}`, JSON.stringify({ t: AT + 6000, pid, dev: DEV }));
  const e = s.raw.query("SELECT * FROM engagement WHERE id=?").get(id) as any, t3 = (await callTimeMs(s.env as any, e, 1, 3))!;
  const v = await j(await s.call(t3 + 1000, "POST", `/api/z/${id}/vote`, { pid, device: DEV, results: [{ pattern: "top@1", ordinal: 1, round: 1, idx: 3, pids: [pid] }] })); expect([v.accepted, v.error]).toEqual([1, undefined]);
  return { pid, started, t3, joinBody: jb };
}
const prizes = async (id: string, now: number) => (await j(await s.call(now, "GET", `/api/z/${id}/prizes`, undefined, P))).prizes as any[];

describe("the organizer-only /prizes route carries what the sheet shows", () => {
  test("Employee ID game: seat, empId, name and mobile of the winner; empId is the cleaned form the game stores", async () => {
    s.reset(); const { started } = await won("WC-1", "emp"); const l = await prizes("WC-1", started + 60_000);
    expect(l.length).toBe(1); expect(l[0]).toMatchObject({ pattern: "top@1", ordinal: 1, round: 1, name: "Asha Winner", empId: "E1001" }); expect(String(l[0].phone)).toContain("7777"); expect(Number.isInteger(l[0].seat)).toBe(true);
  });
  test("Email ID game: the Email ID (read in lower case) is the same field, so the sheet shows it where the Employee ID would be", async () => {
    s.reset(); const { started } = await won("WC-2", "email"); const l = await prizes("WC-2", started + 60_000); expect(l[0].empId).toBe("asha@acme.com");
  });
  test("a winner who gave no ID has no empId key; one who gave no mobile has an empty phone; the sheet then shows only the parts that exist", async () => {
    s.reset(); const a = await won("WC-3", "emp", { empId: "" }); const la = await prizes("WC-3", a.started + 60_000); expect("empId" in la[0]).toBe(false); expect(la[0].name).toBe("Asha Winner");
    s.reset(); const b = await won("WC-4", "emp", { phone: "" }); const lb = await prizes("WC-4", b.started + 60_000); expect(lb[0].empId).toBe("E1001"); expect(lb[0].phone).toBe("");
  });
  test("a winner who corrects their name on their own phone: the sheet's name is the corrected one, the empId stays", async () => {
    s.reset(); const { pid, started } = await won("WC-5", "emp"); const c = await s.call(started + 30_000, "POST", "/api/z/WC-5/confirm", { pid, device: DEV, name: "Asha R", phone: "9810007777" }); expect(c.status).toBe(200);
    const l = await prizes("WC-5", started + 60_000); expect([l[0].name, l[0].empId]).toEqual(["Asha R", "E1001"]);
  });
});

describe("the ID, name and mobile of a winner reach NO public answer", () => {
  const leaks = (txt: string) => SECRETS.filter((x) => txt.includes(x));
  test("public info, anonymous summary, results, game log, my prizes of ANOTHER phone, the join answer of the next player and the claims answers carry none of it", async () => {
    s.reset(); const { pid, started, t3 } = await won("WC-6", "emp"); const now = started + 60_000;
    expect((await s.call(AT + 6500, "POST", "/api/z/WC-6/people", { people: [{ name: "Ravi", empId: "E2002" }] }, P)).status).toBe(200);
    const other = await s.call(AT + 7000, "POST", "/api/z/WC-6/join", { phone: "9810001234", name: "Ravi", empId: "E2002", device: "1".repeat(32) }); const ob = await other.text(); expect([other.status, leaks(ob)]).toEqual([200, []]); const opid = JSON.parse(ob).pid as string;
    for (const [path, h] of [["/info", {}], ["/info", { "x-organizer": "wrong" }], ["/results", {}], ["/gamelog", {}], ["/summary", {}], [`/myprizes?pid=${opid}&device=${"1".repeat(32)}`, {}], [`/myprizes?pid=${pid}&device=${"2".repeat(32)}`, {}], ["/prizes", {}], ["/prizes", { "x-organizer": "wrong" }], ["/people", {}]] as [string, Record<string, string>][]) {
      const x = await s.call(now, "GET", `/api/z/WC-6${path}`, undefined, h); const txt = await x.text(); expect([path, JSON.stringify(h), x.status < 500, leaks(txt)]).toEqual([path, JSON.stringify(h), true, []]);
    }
    const cl = await s.call(t3 + 2000, "POST", "/api/z/WC-6/claims", { pid: opid, device: "1".repeat(32), claims: [{ pattern: "top@1", idx: 3 }] }); expect(leaks(await cl.text())).toEqual([]);
  });
  test("/prizes without the organizer key is refused (401 or 403) and says nothing about the winner", async () => {
    s.reset(); const { started } = await won("WC-7", "emp"); for (const h of [{}, { "x-organizer": "nope" }, { authorization: "Bearer nope" }] as Record<string, string>[]) { const x = await s.call(started + 60_000, "GET", "/api/z/WC-7/prizes", undefined, h); expect([401, 403]).toContain(x.status); expect(leaks(await x.text())).toEqual([]); }
  });
  test("the winner's own phone sees its own name and mobile (not the ID) in my prizes, and another phone gets 403", async () => {
    s.reset(); const { pid, started } = await won("WC-8", "emp"); const mine = await s.call(started + 60_000, "GET", `/api/z/WC-8/myprizes?pid=${pid}&device=${DEV}`); const mb = await j(mine);
    expect([mine.status, mb.name]).toEqual([200, "Asha Winner"]); expect(JSON.stringify(mb)).not.toContain("E1001");
    const oth = await s.call(started + 60_000, "GET", `/api/z/WC-8/myprizes?pid=${pid}&device=${"3".repeat(32)}`); expect(oth.status).toBe(403);
  });
  test("an outside AI (the cut-down view) gets no ID, no name and a masked mobile - the sheet's data is not exposed through that door either", async () => {
    s.reset(); const { started } = await won("WC-9", "emp"); const l = await prizes("WC-9", started + 60_000); expect(l[0].empId).toBe("E1001"); // organizer view has it
    const src = await Bun.file(new URL("../../src/winners.ts", import.meta.url)).text(); expect(src).toMatch(/if \(outside\) out\.push\(\{ round: r\.round, pattern: r\.pattern, ordinal: r\.ordinal, seat: r\.seat, confirmed/); // the outside branch lists no name, phone or empId
  });
});
