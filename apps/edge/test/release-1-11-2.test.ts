// Release 1.11.2 (21 Nov 2026): what the two audits of 1.11.1 asked for.
//   A1  the owner's personal address was a fixture in 8 test and tool files           -> none left; a test now looks at the whole repository
//   A2  the data-request mail cap was per game only                                   -> per game, per network, per organizer mailbox and for the whole site
//   A3  the Help Desk per-address limit was bypassed by +tag and dot spellings        -> the counter uses the canonical mailbox
//   A4  "We told the organizer" was said when no such mail was sent                   -> the answer says it only when it is true
//   Lows: one-statement counters (parallel calls), mailcap clean-up test, guide text for a refused invitation, a busy answer keeps the hourly slot
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import RELEASES from "../src/releases.json";
import { makeD1 } from "./d1-sqlite";
import { anonMailAllowed, canonMailbox, dataRequestMailTurns, hourlyMailAllowed, lanesTick } from "../src/mail-lanes";

const ROOT = join(import.meta.dir, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const rel = RELEASES as { version: string; date: string; title: string; changes: string[] }[];
const T = Date.UTC(2026, 10, 21, 10, 0, 0);

describe("1.11.2: the version rule (a change after a deploy is a new version)", () => {
  test("releases.json (it feeds the footer, /version.json and the owner's release page), package.json, CHANGELOG and the knowledge page all say 1.11.2, with 1.11.1 and 1.11.0 right under it", () => {
    const i2 = rel.findIndex((r) => r.version === "1.11.2"); expect(i2).toBeGreaterThanOrEqual(0); // newer releases (1.12.0: the pricing update) may sit above it; see release-1-12-0.test.ts
    expect(rel.slice(i2, i2 + 3).map((r) => r.version)).toEqual(["1.11.2", "1.11.1", "1.11.0"]);
    expect(rel[i2]!.date).toMatch(/^2026-11-2\d$/); expect(rel[i2]!.changes.length).toBeGreaterThan(3);
    expect(JSON.parse(read("package.json")).version).toBe(rel[0]!.version);
    const log = read("CHANGELOG.md");
    expect(log).toMatch(/^## 1\.11\.2 - 2026-11-2\d$/m); expect(log.indexOf("## 1.11.2")).toBeLessThan(log.indexOf("## 1.11.1"));
    expect(existsSync(join(ROOT, "docs/KNOWLEDGE/11-RELEASE-1.11.2.md"))).toBe(true);
    expect(read("docs/KNOWLEDGE/11-RELEASE-1.11.2.md")).toMatch(/^# Release 1\.11\.2/);
    expect(read("docs/KNOWLEDGE/README.md")).toContain("11-RELEASE-1.11.2.md");
    expect(read("docs/KNOWLEDGE/05-OPEN-ITEMS.md")).toContain("## Release 1.11.2");
  });
  test("the release notes are plain: no code names, no file names, no settings written as code", () => {
    for (const c of rel.find((r) => r.version === "1.11.2")!.changes) { expect(c).not.toMatch(/`|\.ts\b|\.js\b|DATAREQ_|HD_INVITE|kv\b/); expect(c.length).toBeLessThan(520); }
  });
  test("the 1.11.1 entry does not promise more than it did: it says one GAME, and points to 1.11.2 for the rest", () => {
    const r1 = rel.find((r) => r.version === "1.11.1")!; expect(r1.changes[0]).toMatch(/ONE game/); expect(r1.changes[0]).toContain("1.11.2");
  });
});

describe("1.11.2 A1: the owner's personal address is nowhere in the repository (tests and tools included)", () => {
  const files = (): string[] => {
    const git = (a: string[]) => { const r = Bun.spawnSync(["git", ...a], { cwd: ROOT, stdout: "pipe", stderr: "ignore" }); return r.exitCode === 0 ? new TextDecoder().decode(r.stdout).split("\n").filter(Boolean) : null; };
    const tracked = git(["ls-files"]), fresh = git(["ls-files", "--others", "--exclude-standard"]);
    if (tracked) return [...tracked, ...(fresh ?? [])];
    const out: string[] = []; const walk = (d: string) => { for (const n of readdirSync(join(ROOT, d))) { if (n === "node_modules" || n === ".git") continue; const p = join(d, n); statSync(join(ROOT, p)).isDirectory() ? walk(p) : out.push(p); } }; walk("."); return out;
  };
  const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|html|txt|toml|sql|yml|yaml|py|sh|css|svg)$/;
  test("no text file holds the owner's mailbox name (the pattern is written so that this file does not contain it)", () => {
    const NAME = /ra{2}jat/i; const bad: string[] = [];
    for (const f of files()) { if (!TEXT.test(f) || !existsSync(join(ROOT, f))) continue; const t = readFileSync(join(ROOT, f), "utf8"); t.split("\n").forEach((l, i) => { if (NAME.test(l)) bad.push(`${f}:${i + 1}`); }); }
    expect(bad).toEqual([]);
  });
  test("no mailbox on the owner's personal-brand domain is unmasked in the docs (role mailboxes in the hand-over transcripts too)", () => {
    const bad: string[] = [];
    for (const f of files().filter((x) => x.startsWith("docs/") && TEXT.test(x))) for (const m of read(f).matchAll(/([A-Za-z0-9._%+*-]+)@rajatsir\.com/gi)) if (!/^[A-Za-z0-9]\*\*\*$/.test(m[1]!)) bad.push(f);
    expect(bad).toEqual([]);
  });
});

describe("1.11.2 A2/A3: the mailbox name used for counting", () => {
  test("+tag is dropped everywhere; dots and googlemail fold only on Gmail; case and spaces fold", () => {
    expect(canonMailbox("  Vic.Tim+Promo@GoogleMail.com ")).toBe("victim@gmail.com");
    expect(canonMailbox("v.i.c.t.i.m@gmail.com")).toBe("victim@gmail.com");
    expect(canonMailbox("a.b+x@acme.com")).toBe("a.b@acme.com"); expect(canonMailbox("a.b@acme.com")).not.toBe(canonMailbox("ab@acme.com"));
    expect(canonMailbox("plain")).toBe("plain"); expect(canonMailbox("")).toBe("");
  });
});

describe("1.11.2 L1 (both audits): the counters take ONE statement, so parallel requests are counted exactly", () => {
  const NONE = { DATAREQ_MAIL_PER_IP_DAY: "0", DATAREQ_MAIL_PER_RECIPIENT_DAY: "0", DATAREQ_MAIL_PER_DAY: "0" };
  test("14 requests of one game at the same moment with a cap of 10: exactly 10 send, ONE digest, 3 hold (it used to be none, and no digest)", async () => {
    const { db } = makeD1();
    const r = await Promise.all(Array.from({ length: 14 }, () => dataRequestMailTurns(db, { ...NONE, DATAREQ_MAIL_PER_GAME_DAY: "10" }, { eid: "PAR-1", ipHash: "x", recipientHash: null }, T)));
    const owner = r.map((x) => x.owner); expect(owner.filter((x) => x === "send").length).toBe(10); expect(owner.filter((x) => x === "digest").length).toBe(1); expect(owner.filter((x) => x === "hold").length).toBe(3);
  });
  test("60 invitations at the same moment with a site cap of 30: exactly 30 pass; 80 sign-up codes with a cap of 60: exactly 60 pass", async () => {
    const { db } = makeD1();
    const a = await Promise.all(Array.from({ length: 60 }, () => hourlyMailAllowed(db, "hdinvite", "30", 30, T))); expect(a.filter(Boolean).length).toBe(30);
    const b = await Promise.all(Array.from({ length: 80 }, () => anonMailAllowed(db, { ANON_MAIL_PER_HOUR: "60" }, T))); expect(b.filter(Boolean).length).toBe(60);
  });
  test("the widest cap decides: an organizer address over its cap gets ONE digest even when the game itself is under its own cap; a cap of 0 skips that scope", async () => {
    const { db } = makeD1(); const env = { DATAREQ_MAIL_PER_GAME_DAY: "5", DATAREQ_MAIL_PER_IP_DAY: "0", DATAREQ_MAIL_PER_RECIPIENT_DAY: "2", DATAREQ_MAIL_PER_DAY: "0" };
    const t: string[] = []; for (let i = 0; i < 5; i++) t.push((await dataRequestMailTurns(db, env, { eid: `G${i}`, ipHash: "x", recipientHash: "r1" }, T)).org);
    expect(t).toEqual(["send", "send", "digest", "hold", "hold"]);
    expect((await dataRequestMailTurns(db, env, { eid: "G9", ipHash: "x", recipientHash: "r2" }, T)).org).toBe("send"); // another mailbox
    expect((await dataRequestMailTurns(db, env, { eid: "G9", ipHash: "x", recipientHash: "r1" }, T + 25 * 3_600_000)).org).toBe("send"); // the next day
  });
  test("a database that cannot count never blocks (every scope answers send)", async () => {
    const dead = { prepare: () => { throw new Error("db down"); } } as any;
    expect(await dataRequestMailTurns(dead, {}, { eid: "X", ipHash: "x", recipientHash: "r" }, T)).toEqual({ org: "send", owner: "send" });
  });
});

describe("1.11.2 (audit 1 L3): the counter rows are deleted after about 48 hours, the new ones too", () => {
  test("day and hour rows of the mail caps (game, network, mailbox, site, invitations) are kept for a day and gone after 49 hours; rows of other kinds stay", async () => {
    const { db, raw } = makeD1();
    await dataRequestMailTurns(db, {}, { eid: "CLN-1", ipHash: "aaaa", recipientHash: "bbbb" }, T); await hourlyMailAllowed(db, "hdinvite", undefined, 30, T);
    raw.run("INSERT INTO kv(k,v) VALUES('keepme/1','1')");
    const n = () => (raw.query("SELECT COUNT(*) c FROM kv WHERE k LIKE 'mailcap/%'").get() as any).c as number;
    expect(n()).toBe(5);
    await lanesTick(db, T + 24 * 3_600_000); expect(n()).toBe(5);
    await lanesTick(db, T + 49 * 3_600_000); expect(n()).toBe(0);
    expect((raw.query("SELECT COUNT(*) c FROM kv WHERE k='keepme/1'").get() as any).c).toBe(1);
  });
});

describe("1.11.2 A4: the wording is true", () => {
  test("the player's answer no longer says 'We told the organizer' in any case; the privacy table says the mail is capped and the answer is conditional", () => {
    expect(read("apps/edge/src/rights.ts")).not.toMatch(/We told the organizer/);
    const doc = read("docs/PRIVACY_AND_LIFECYCLE.md"); expect(doc).toMatch(/up to daily limits/); expect(doc).toMatch(/only when that note was sent/);
  });
  test("the guide text for a paused Help Desk invitation says the invitation was not sent (nothing was saved), and the saved copies of the site are renewed", () => {
    const g = read("apps/web/public/guide.js"); const i = g.indexOf("Many invitations are being sent right now");
    expect(i).toBeGreaterThan(0); const entry = g.slice(i, g.indexOf("},", g.indexOf("g: { retry: true }", i)) + 2);
    expect(entry).not.toMatch(/Nothing you did is lost/); expect(entry).toMatch(/was not sent/);
    const sw = read("apps/web/public/zsw.js"); expect(sw).toMatch(/const CACHE = "ct-game-v(\d+)"/); expect(Number(sw.match(/const CACHE = "ct-game-v(\d+)"/)![1])).toBeGreaterThanOrEqual(47);
    expect(sw).toContain("guide.js");
  });
  test("every new setting is listed in the settings list and in the owner steps", () => {
    for (const k of ["DATAREQ_MAIL_PER_GAME_DAY", "DATAREQ_MAIL_PER_IP_DAY", "DATAREQ_MAIL_PER_RECIPIENT_DAY", "DATAREQ_MAIL_PER_DAY", "HD_INVITE_MAIL_PER_HOUR"]) { expect([k, read("config/SECRETS_NAMES.md").includes("`" + k + "`")]).toEqual([k, true]); expect([k, read("docs/MAIL-DELIVERABILITY-OWNER-STEPS.md").includes("`" + k + "`")]).toEqual([k, true]); }
  });
});
