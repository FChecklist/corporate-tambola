// rc/tambola-1.8.5 fix round 1: the guide knows the "Enter your mobile number or your <idWord>." message, and zc-mode.js names its storage key where the notice scanner can see it.
// Run: bun test --isolate apps/web/test/rc185/fix-round1.test.ts
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newWorld, openPage, type Page } from "../harness";
import { PUB, scan } from "../storage-scan";
import { organizer, published, NEW_AT } from "./page";

setDefaultTimeout(30_000);
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

describe("guide: the Email ID / employee ID need-id messages (the server sends `Enter your employee ID.`, `Enter your Email ID.`, `Enter your mobile number or your ...`)", () => {
  test("the guide has a catalogue entry for each wording of the sentences, with a title and steps", async () => {
    const w = newWorld({ DATA_KEY: "k" });
    const p = await openPage(w.world, { url: "http://localhost/pricing.html", html: "pricing.html", scripts: ["guide.js"] }); open.push(p);
    for (const word of ["employee ID", "Email ID"]) {
      for (const msg of [`Enter your mobile number or your ${word}.`, `Enter your ${word}.`, `Enter your ${word} and your mobile number.`]) {
        const f = p.win.CTG.find({ status: 400, message: msg });
        expect([msg, f.matched]).toEqual([msg, true]);
        const g = p.win.CTG.explain({ status: 400, message: msg });
        expect(g.title.length > 8 && g.steps.length > 0).toBe(true);
      }
    }
  });
  test("the sentences exactly as the REAL Worker sends them (a join with no ID in an ID-only and an either game, employee ID and Email ID) go into the guide finder and a guided card comes back", async () => {
    const sent = new Set<string>();
    for (const [mode, kind] of [["id", "emp"], ["id", "email"], ["either", "emp"], ["either", "email"]] as const) {
      const o = await organizer(NEW_AT); const id = `RC-R1${mode}${kind}`.toUpperCase();
      await published(o, id, { verify: mode, employeesOnly: true, ...(kind === "email" ? { idKind: "email" } : {}) });
      const r = await o.api("POST", `/api/z/${id}/join`, { name: "Asha", device: "0a" + "b".repeat(30) }); const b = await o.json(r);
      expect([mode, kind, r.status, b.code]).toEqual([mode, kind, 400, "need-id"]); sent.add(String(b.error));
    }
    expect([...sent].sort()).toEqual(["Enter your Email ID.", "Enter your employee ID.", "Enter your mobile number or your Email ID.", "Enter your mobile number or your employee ID."]);
    const w = newWorld({ DATA_KEY: "k" });
    const p = await openPage(w.world, { url: "http://localhost/pricing.html", html: "pricing.html", scripts: ["guide.js"] }); open.push(p);
    for (const msg of sent) {
      const f = p.win.CTG.find({ status: 400, message: msg }); expect([msg, f.matched]).toEqual([msg, true]);
      const g = p.win.CTG.explain({ status: 400, message: msg }); expect([msg, g.matched, g.title.length > 8, g.steps.length > 0]).toEqual([msg, true, true, true]);
    }
  });
});

describe("guide source: the sentences are listed as the server writes them, with no template text", () => {
  test("guide.js lists 'Enter your Email ID', 'Enter your mobile number or your Email ID', 'Enter your employee ID' and 'Enter your mobile number or your employee ID' as plain text and has no '${'; the Worker still builds these sentences from idWord()", () => {
    const g = readFileSync(join(PUB, "guide.js"), "utf8"), wk = readFileSync(join(PUB, "../../edge/src/worker.ts"), "utf8");
    expect(wk.includes("Enter your mobile number or your ${idWord(vf.idKind)}.")).toBe(true);
    for (const frag of ['"Enter your Email ID"', '"Enter your mobile number or your Email ID"', '"Enter your employee ID"', '"Enter your mobile number or your employee ID"']) expect([frag, g.includes(frag)]).toEqual([frag, true]);
    expect(g.includes("${")).toBe(false);
  });
});

describe("storage: zc-mode.js keeps its choice under the literal key 'ctz-zcflow', and the registry lists it", () => {
  const src = readFileSync(join(PUB, "zc-mode.js"), "utf8");
  test("every getItem / setItem call in zc-mode.js has the key written out as a string (a variable would hide it from the notice scanner)", () => {
    const calls = [...src.matchAll(/localStorage\.(?:getItem|setItem)\(([^,)]*)/g)].map((m) => m[1]!.trim());
    expect(calls.length >= 2).toBe(true);
    expect(calls.filter((c) => c !== '"ctz-zcflow"')).toEqual([]);
  });
  test("the scanner sees the key in zc-mode.js and storage-registry.json lists it as a localStorage key", () => {
    expect(scan().uses.some((u) => u.file.endsWith("zc-mode.js") && u.store === "localStorage" && u.key === "ctz-zcflow")).toBe(true);
    const reg = JSON.parse(readFileSync(join(PUB, "../storage-registry.json"), "utf8")) as { items: { store: string; keys: string[] }[] };
    expect(reg.items.some((i) => i.store === "localStorage" && i.keys.includes("ctz-zcflow"))).toBe(true);
  });
});
