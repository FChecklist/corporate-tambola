// 1.8.5 UNIFORM EMPLOYEE ID (owner rule 30 Oct 2026): one cleaning function everywhere. NFKC, then only A-Z and 0-9 are kept, upper case. "1B-678", "1b-678", "1B/678", "1B 678", "1b.678" are all 1B678.
// Games created before EMP_CLEAN_FROM_MS keep the old rule.
// FALSIFIED BY: empid-keeps-dash, empid-no-nfkc, empid-eszett-ss, empid-old-game-cleaned, empid-dup-after-cleaning-silent, empid-empty-accepted
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { cleanEmpId, empCleanOn, normEmpFor, normEmail, looksLikeEmail, EMP_CLEAN_FROM_MS, EMP_MAX } from "../src/empid";
import { cleanEmail } from "../src/approvals";
import { emailHashOf } from "../src/hostsetup";

const NEW_T = Math.max(Date.UTC(2026, 10, 5, 10, 0, 0), EMP_CLEAN_FROM_MS + 86_400_000); // a game made after the release instant: the uniform rule
const OLD_T = EMP_CLEAN_FROM_MS - 3 * 86_400_000; // a game made before it: the old rule
const GEN = 1692803367;
const roundAt = (ms: number) => Math.floor((ms / 1000 - GEN) / 3) + 1;
let env: PayEnv; let ipN = 0;
const realFetch = globalThis.fetch;
const call = (now: number, method: string, path: string, body?: unknown, key?: string) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(key ? { "x-organizer": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env as any, now);
const j = async (r: Response) => (await r.json()) as any;
const dev = (i: number) => (String(i).padStart(2, "0") + "b".repeat(32)).slice(0, 32);
async function setup(at: number) {
  const st = await j(await handle(new Request("http://x/api/start", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `7.7.6.${++ipN}` }, body: JSON.stringify({ email: `demo${ipN}@demo-test.invalid` }) }), env as any, at));
  const master = st.token as string, start = roundAt(at) + 1200;
  await call(at, "POST", "/api/z", { id: "EMP-1", startRound: start, callSeconds: 6, cap: 100, whoCanJoin: "list" }, master);
  await call(at, "POST", "/api/z/EMP-1/publish", { email: "demo1@demo-test.invalid", phone: "98765 43210" }, master);
  expect((await call(at, "PATCH", "/api/z/EMP-1/settings", { verify: "id", employeesOnly: true }, master)).status).toBe(200);
  return master;
}
const add = (at: number, key: string, people: unknown[]) => call(at, "POST", "/api/z/EMP-1/people", { people }, key);
const joinId = (at: number, empId: string, i: number) => call(at, "POST", "/api/z/EMP-1/join", { name: "G", empId, device: dev(i) });
beforeEach(() => { const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" } as any; (globalThis as any).fetch = async () => new Response("{}", { status: 404 }); });
afterEach(() => { globalThis.fetch = realFetch; });

describe("the one cleaning function", () => {
  test("the owner's five examples all become 1B678", () => { for (const x of ["1B-678", "1b-678", "1B/678", "1B 678", "1b.678"]) expect(cleanEmpId(x)).toBe("1B678"); });
  test("underscores, symbols, tabs, new lines, accents, other alphabets, emoji and zero-width characters are removed; non-ASCII letters never turn into A-Z", () => {
    expect(cleanEmpId("1B_678")).toBe("1B678"); expect(cleanEmpId("#1B*678!")).toBe("1B678"); expect(cleanEmpId("1B\t678\n")).toBe("1B678");
    expect(cleanEmpId("é1B678")).toBe("1B678"); expect(cleanEmpId("1Бя678")).toBe("1678"); expect(cleanEmpId("१B६७८")).toBe("B");
    expect(cleanEmpId("1B🙂678")).toBe("1B678"); expect(cleanEmpId("1B​6‌7‍8⁠")).toBe("1B678"); expect(cleanEmpId("ß1")).toBe("1"); // never "SS1"
  });
  test("full-width letters and digits become plain ones (NFKC first)", () => { expect(cleanEmpId("１Ｂ－６７８")).toBe("1B678"); expect(cleanEmpId("ｅｍｐ００１")).toBe("EMP001"); });
  test("normEmpFor: new games clean, refuse an ID with nothing left or more than 30 left, and keep empty as 'nothing typed'; old games keep the old rule", () => {
    const n = { created_ms: NEW_T }, o = { created_ms: OLD_T };
    expect(normEmpFor("1b.678", n)).toBe("1B678"); expect(normEmpFor("   ", n)).toBe(""); expect(normEmpFor("", n)).toBe(""); expect(normEmpFor("---", n)).toBe(null); expect(normEmpFor("​", n)).toBe(null); expect(normEmpFor("🙂🙂", n)).toBe(null);
    expect(normEmpFor("A".repeat(EMP_MAX), n)).toBe("A".repeat(EMP_MAX)); expect(normEmpFor("A".repeat(EMP_MAX + 1), n)).toBe(null); expect(normEmpFor("ab-".repeat(16), n)).toBe(null); // 32 characters once cleaned
    expect(normEmpFor("1B-678", o)).toBe("1B-678"); expect(normEmpFor("1b 678", o)).toBe("1B678"); expect(normEmpFor("---", o)).toBe(null); expect(normEmpFor("1B🙂678", o)).toBe(null);
    expect(empCleanOn({ created_ms: EMP_CLEAN_FROM_MS - 1 })).toBe(false); expect(empCleanOn({ created_ms: EMP_CLEAN_FROM_MS })).toBe(true); expect(empCleanOn(null)).toBe(false);
  });
});

describe("on the real Worker", () => {
  test("a NEW game: a listed '1B-678' is found however the person types it, and a second phone with another spelling is the same person", async () => {
    const m = await setup(NEW_T); expect((await add(NEW_T, m, [{ name: "Asha", empId: "1B-678" }])).status).toBe(200);
    expect((await joinId(NEW_T, "1b.678", 1)).status).toBe(200);
    const again = await joinId(NEW_T, "1B/678", 2); expect(again.status).toBe(423); expect((await j(again)).code).toBe("id-used");
  });
  test("a NEW game: the uploaded list is cleaned too; a row that repeats an earlier one only after cleaning is flagged, an exact repeat is counted", async () => {
    const m = await setup(NEW_T);
    const r = await j(await add(NEW_T, m, [{ name: "A", empId: "1B-678" }, { name: "B", empId: "1B/678" }, { name: "C", empId: "1B-678" }, { name: "D", empId: "---" }, { name: "E", empId: "2c 9" }]));
    expect(r.added ?? r.people?.length).toBe(2); // 1B678 and 2C9
    const why = (r.invalid ?? r.skipped ?? []).map((x: any) => x.why).join(" | ");
    expect(why).toContain("Same person after cleaning"); expect(why).toContain("1B678"); expect(why).toMatch(/letters and numbers only/);
    expect(r.duplicates ?? 0).toBe(1); // the exact repeat "1B-678" twice
  });
  test("a NEW game refuses an ID with nothing usable in it, with a plain message", async () => {
    await setup(NEW_T); for (const bad of ["---", "​​", "🙂"]) { const r = await joinId(NEW_T, bad, 3); expect(r.status).toBe(400); const b = await j(r); expect(b.code).toBe("bad-id"); expect(b.error).toContain("letters and numbers only"); }
  });
  test("an OLD game keeps the old rule: '1B-678' and '1B678' are different people, '1b 678' still equals '1B678'", async () => {
    const m = await setup(OLD_T); expect((await add(OLD_T, m, [{ name: "Asha", empId: "1B-678" }, { name: "Ben", empId: "1B678" }])).status).toBe(200);
    expect((await joinId(OLD_T, "1b-678", 1)).status).toBe(200); // the dashed one
    expect((await joinId(OLD_T, "1b 678", 2)).status).toBe(200); // "1B678", a different listed person
    expect((await joinId(OLD_T, "1B.678", 3)).status).toBe(403); // not on the list under the old rule: waits
  });
});

describe("ID-format matrix (pure): 200 IDs x 28 formats x both sides of the door", () => {
  const rng = (() => { let n = 12345; return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 0x100000000); })();
  const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const ids = Array.from({ length: 200 }, (_, k) => { const len = 1 + (k % 30); const kind = k % 3; const pool = kind === 0 ? ALNUM : kind === 1 ? "0123456789" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; return Array.from({ length: len }, () => pool[Math.floor(rng() * pool.length)]!).join(""); });
  const mid = (id: string, sep: string) => id.split("").join(sep);
  const full = (id: string) => id.replace(/[A-Z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)); // full-width forms
  const formats: [string, (id: string) => string][] = [
    ["same", (x) => x], ["lower", (x) => x.toLowerCase()], ["mixed case", (x) => x.split("").map((c, i) => (i % 2 ? c.toLowerCase() : c)).join("")],
    ["dashes", (x) => mid(x, "-")], ["spaces", (x) => mid(x, " ")], ["slashes", (x) => mid(x, "/")], ["dots", (x) => mid(x, ".")], ["underscores", (x) => mid(x, "_")], ["tabs", (x) => mid(x, "\t")],
    ["no-break space", (x) => mid(x, " ")], ["zero-width space", (x) => mid(x, "​")], ["zero-width non-joiner", (x) => mid(x, "‌")], ["word joiner", (x) => mid(x, "⁠")], ["soft hyphen", (x) => mid(x, "­")],
    ["left-to-right mark", (x) => "‎" + x + "‏"], ["BOM", (x) => "﻿" + x], ["new lines", (x) => "\n" + x + "\r\n"], ["hash prefix", (x) => "#" + x], ["brackets", (x) => "(" + x + ")"], ["quotes", (x) => `"${x}"`],
    ["emoji suffix", (x) => x + "🙂"], ["emoji inside", (x) => x.slice(0, 1) + "🙂" + x.slice(1)], ["accent prefix", (x) => "é" + x], ["cyrillic inside", (x) => x.slice(0, 1) + "Ж" + x.slice(1)], ["devanagari suffix", (x) => x + "१२"],
    ["full-width", full], ["full-width lower dashes", (x) => full(mid(x, "-")).toLowerCase()], ["everything", (x) => "​#" + mid(x.toLowerCase(), " -/.") + "🙂\n"],
  ];
  test("every format of every ID is cleaned back to the plain ID, on the list side and on the typed side, and they meet", () => {
    let n = 0, bad = 0; expect(formats.length).toBeGreaterThanOrEqual(20);
    for (const id of ids) for (const [name, f] of formats) {
      const listed = cleanEmpId(f(id)), typed = cleanEmpId(f(id)), other = cleanEmpId(formats[(n % formats.length)]![1](id)); n++;
      // full-width digits/letters survive NFKC; every other added character is dropped, so every format leaves exactly the plain ID
      if (listed !== id || typed !== id || other !== id) { if (bad++ < 3) console.log("FORMAT FAILED:", name, JSON.stringify(f(id)), "->", listed, "wanted", id); }
    }
    console.log("empid matrix: ids", ids.length, "formats", formats.length, "checks", n * 3, "failed", bad);
    expect(bad).toBe(0); expect(n).toBe(ids.length * formats.length);
  });
});

describe("1.8.5 the Email ID is case-insensitive everywhere, and never goes through the employee-ID cleaner", () => {
  const BASE = "demo1@demo-test.invalid";
  const variants = Array.from({ length: 16 }, (_, k) => { const loc = "demo1", dom = "demo-test.invalid"; return `${k & 1 ? loc.toUpperCase() : loc}@${k & 2 ? dom.toUpperCase() : dom}`.split("").map((c, i) => (k & 4 && i % 2 ? c.toUpperCase() : k & 8 && i % 3 === 0 ? c.toUpperCase() : c)).join(""); });
  test("all 16 case variants of an address are the same address, with the same hash", async () => {
    expect(new Set(variants).size).toBeGreaterThan(8);
    for (const v of variants) { expect(normEmail(v)).toBe(BASE); expect(cleanEmail(v)).toBe(BASE); expect(await emailHashOf(v)).toBe(await emailHashOf(BASE)); }
  });
  test("spaces around and inside, tabs, and the full-width at-sign and full stop are removed or normalised", async () => {
    // a participant's Email ID: every space removed, so the inner-space spellings are the same address. The hash is the ACCOUNT form (Host and sign-in e-mails): a space INSIDE is never glued, so it is a different hash.
    const allSpellings = [" demo1@demo-test.invalid ", "\tdemo1@demo-test.invalid\n", "demo1＠demo-test.invalid", "ｄｅｍｏ１＠ｄｅｍｏ－ｔｅｓｔ．ｉｎｖａｌｉｄ", "demo1 @ demo-test.invalid", "DEMO1\u00a0@Demo-Test.Invalid"];
    for (const v of allSpellings) { expect(normEmail(v)).toBe(BASE); expect(cleanEmail(v)).toBe(BASE); }
    for (const v of [" demo1@demo-test.invalid ", "\tdemo1@demo-test.invalid\n", "demo1＠demo-test.invalid", "ｄｅｍｏ１＠ｄｅｍｏ－ｔｅｓｔ．ｉｎｖａｌｉｄ"]) expect(await emailHashOf(v)).toBe(await emailHashOf(BASE));
    for (const v of ["demo1 @ demo-test.invalid", "DEMO1\u00a0@Demo-Test.Invalid"]) expect(await emailHashOf(v)).not.toBe(await emailHashOf(BASE));
    expect(cleanEmail("demo1@")).toBe(null); expect(cleanEmail("")).toBe(null);
  });
  test("the employee-ID cleaner is never applied to an email: it would make DEMO1DEMOTESTINVALID", () => {
    expect(cleanEmpId(BASE)).toBe("DEMO1DEMOTESTINVALID"); // what it would do: so a game refuses an email in an ID box instead
    expect(looksLikeEmail(BASE)).toBe(true); expect(looksLikeEmail("demo1＠demo-test.invalid")).toBe(true); expect(looksLikeEmail("1B-678")).toBe(false);
    expect(normEmpFor(BASE, { created_ms: NEW_T })).toBe(null); expect(normEmpFor("demo1＠demo-test.invalid", { created_ms: NEW_T })).toBe(null);
    expect(normEmpFor(BASE, { created_ms: OLD_T })).toBe(null); // the old rule never allowed an @ either
  });
  test("on the real Worker: an email typed in an employee-ID game is refused with a plain message, not turned into letters; an old game refuses it too", async () => {
    for (const at of [NEW_T, OLD_T]) {
      const d = makeD1(); env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "1000000", PUBLIC_ORIGIN: "https://tambola.test", PHONE_SALT: "salt" } as any;
      await setup(at); const r = await joinId(at, BASE, 1); expect(r.status).toBe(400); const b = await j(r); expect(b.code).toBe("bad-id");
      if (at === NEW_T) expect(String(b.error).toLowerCase()).toContain("looks like an email id"); else expect(b.error).toContain("letters and numbers only");
      expect(JSON.stringify(b)).not.toContain("DEMO1DEMOTESTINVALID");
    }
  });
});
