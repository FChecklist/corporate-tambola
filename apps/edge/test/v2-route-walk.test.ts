// V2 route walk (BOSS sweep after audit round 7). The rules of docs/V2_ROUTE_TABLE.md, enforced by walking EVERY route the worker's source names, not a hand-picked few.
// It finds the routes by reading the source (so a route added later is walked at once), and for each key made for one game (gm = a person's game key, ga = an AI's game key, lh = a Host key without personal data) checks:
//  1. other games and every account-level route are refused, in a plain call, with a padded body, and with the key ALSO placed in the body and the query string;
//  2. a key put in a body or query string is never an identity: the answer is the anonymous answer;
//  3. the AI game key answers exactly as the organizer's own AI key does (so every AI rule applies), and no answer carries a name or mobile number;
//  4. the Host key without personal data reaches only its short list, however the call is spelled (padding, ?_method= through /ai/);
//  5. after the end only the short list remains, and 24 hours after the end every call is refused as expired.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOUR, T, W, call, j, keyH, mob, paidGame, reset, restore, uid, create } from "./param-harness";
import { endGame, gameKey, guests, labelHost } from "./v2-helpers";

beforeEach(() => reset());
afterEach(restore);

// ---- the routes, read from the source
const SRC = join(import.meta.dir, "..", "src");
const srcText = readdirSync(SRC).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(join(SRC, f), "utf8")).join("\n");
const ACTIONS = [...new Set([...srcText.matchAll(/action === "([a-z0-9-]+)"/g)].map((m) => m[1]!))].filter((a) => a !== "v2").sort();
const LITERAL = [...new Set([...srcText.matchAll(/"(\/api\/[a-zA-Z0-9/_-]+)"/g)].map((m) => m[1]!))].filter((p) => !p.startsWith("/api/z/") && !p.endsWith("/")).sort();
const EXTRA_SUB = ["control/key", "control/pause", "v2/keys", "v2/keys/revoke", "v2/host", "v2/host/stepdown", "v2/host/handover", "v2/host/requests", "v2/claimreview", "v2/claimreview/mode", "v2/aitrail", "v2/status", "v2/export", "v2/receipts", "v2/receipts/send", "v2/certs", "v2/certs/issue", "v2/certs/csv"];
// what a key made for one game may call outside its own game: nothing but these harmless public ones
const OPEN_OK = /^\/api\/(notices|auth\/config|invoice\/[A-Za-z0-9_.-]+|beacon\/.*|v2\/(support(\/\d+)?|verify\/[A-Za-z0-9]+)|whoami)$|^\/api\/z\/(ai-manifest|schedule)$/;
// the Host key without personal data: its whole list (the table, section "Host key without personal data")
const LH_GET = new Set(["participants", "summary", "results", "info", "prizes", "life", "claims", "seats", "control", "gamelog", "changes", "presence", "myprizes"]);
const LH_POST = new Set(["announce", "prizegiven", "override"]);
const GATE_CODES = ["key-scope", "game-over", "host-limited", "ai-people", "key-expired", "not-allowed"];
const PAD = "x".repeat(5000);
const METHODS = ["GET", "POST"] as const;

async function world(withGuests = true) {
  const g = await paidGame(); const other = await paidGame(); if (withGuests) await guests(g.id, 2);
  const keys = { gm: await gameKey(g), ga: await gameKey(g, { ai: true, label: "ChatGPT" }), lh: await labelHost(g) };
  return { g, other, keys };
}
const asAnon = async (m: string, path: string, body?: unknown) => { const r = await call(m, path, body); return { status: r.status, text: await r.text() }; };
const personal = (t: string) => /Guest [12]\b/.test(t) || t.includes(mob(1)) || t.includes(mob(2));

describe("the route list is read from the source", () => {
  test("it finds the engagement actions and the account routes (so the walk cannot silently shrink)", () => {
    expect(ACTIONS.length).toBeGreaterThan(30); expect(ACTIONS).toContain("prizegiven"); expect(ACTIONS).toContain("roster");
    expect(LITERAL.length).toBeGreaterThan(60); expect(LITERAL).toContain("/api/checkout"); expect(LITERAL).toContain("/api/auth/google");
  });
});

describe("1. other games and account routes are refused for every key made for one game", () => {
  test("every action on ANOTHER game, every account-level route: refused; plain, padded, and with the key in the body and the query", async () => {
    const { g, other, keys } = await world();
    const bad: string[] = [];
    for (const [kind, key] of Object.entries(keys)) {
      for (const m of METHODS) {
        for (const act of [...ACTIONS, ...EXTRA_SUB]) {
          const path = `/api/z/${other.id}/${act}`;
          for (const v of [{ body: {} }, { body: { pad: PAD } }, { body: { key, hostKey: key, token: key }, qs: `?k=${key}&key=${key}` }]) {
            const r = await call(m, path + (v.qs ?? ""), m === "POST" ? v.body : undefined, keyH(key));
            if (r.status < 400 || r.status >= 500 && r.status !== 503) bad.push(`${kind} ${m} ${path} -> ${r.status}`);
            else if (r.status !== 404 && r.status !== 401 && r.status !== 403) bad.push(`${kind} ${m} ${path} -> ${r.status}`);
          }
        }
        for (const p of LITERAL) {
          if (OPEN_OK.test(p)) continue;
          const path = p.replace(/\{[^}]+\}/g, "x");
          for (const v of [{}, { pad: PAD }, { key, hostKey: key, token: key }]) {
            const r = await call(m, path, m === "POST" ? v : undefined, keyH(key));
            if (r.status === 200 || r.status === 201 || r.status === 302) bad.push(`${kind} ${m} ${path} -> ${r.status}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
    void g;
  }, 180_000);
});

describe("2. a key in a body or query string is never an identity", () => {
  test("for every route, a scoped key placed only in the body or query gets exactly the anonymous answer", async () => {
    const { g, keys } = await world();
    const diff: string[] = [];
    for (const key of Object.values(keys)) {
      for (const act of ACTIONS) {
        const path = `/api/z/${g.id}/${act}`;
        const fake = "ctg_" + "0".repeat(48); // the same call with a made-up key in the same places: what a stranger gets
        const anon = await asAnon("POST", path + `?k=${fake}&key=${fake}&hostKey=${fake}`, { key: fake, hostKey: fake, token: fake, organizer: fake });
        const r = await call("POST", path + `?k=${key}&key=${key}&hostKey=${key}`, { key, hostKey: key, token: key, organizer: key });
        const t = await r.text();
        if (r.status !== anon.status || t !== anon.text) diff.push(`POST ${path}: stranger ${anon.status} vs ${r.status}`);
      }
      for (const p of LITERAL.filter((x) => !x.startsWith("/api/z/"))) {
        const path = p.replace(/\{[^}]+\}/g, "x"); if (/\/(lifecycle|mail|inbound|webhook|payout|paytest|payments\/test)/.test(path)) continue; // not key routes, or rate-limited by address
        const fake = "ctg_" + "0".repeat(48);
        const anon = await asAnon("POST", path + `?k=${fake}`, { key: fake, hostKey: fake, token: fake, organizer: fake });
        const r = await call("POST", path + `?k=${key}`, { key, hostKey: key, token: key, organizer: key });
        if (r.status !== anon.status) diff.push(`POST ${path}: stranger ${anon.status} vs ${r.status}`);
      }
    }
    expect(diff).toEqual([]);
  }, 180_000);
});

describe("3. an AI game key is exactly an AI key, and nothing personal comes back", () => {
  test("for every action and method it answers like the organizer's own AI key (or is refused by the gate); no answer holds a name or mobile", async () => {
    const mismatch: string[] = [], leaks: string[] = [];
    const shared = await world(); // one game with two guests, walked by every action: nothing personal may come back to an AI or a Host key
    for (const act of ACTIONS) for (const m of METHODS) for (const key of [shared.keys.ga, shared.keys.lh]) { const rr = await call(m, `/api/z/${shared.g.id}/${act}`, m === "POST" ? { pad: "x" } : undefined, keyH(key)); if (personal(await rr.text())) leaks.push(`${m} ${act}`); }
    for (const act of ACTIONS) {
      for (const m of METHODS) {
        const a = await world(false), b = await world(false);
        const body = m === "POST" ? { pad: "x" } : undefined;
        const r1 = await call(m, `/api/z/${a.g.id}/${act}`, body, keyH(a.g.ai));
        const r2 = await call(m, `/api/z/${b.g.id}/${act}`, body, keyH(b.keys.ga)); const t2 = await r2.text();
        let code = ""; try { code = JSON.parse(t2).code ?? ""; } catch { /* not json */ }
        if (r1.status !== r2.status && !GATE_CODES.includes(code)) mismatch.push(`${m} ${act}: ai ${r1.status} vs ga ${r2.status}`);

      }
    }
    expect(mismatch).toEqual([]); expect(leaks).toEqual([]);
  }, 280_000);
});

describe("4. the Host key without personal data reaches only its short list", () => {
  test("every other action is refused as host-limited, however the body is padded; and through /ai/ with ?_method=", async () => {
    const { g, keys } = await world(); const bad: string[] = [];
    for (const act of ACTIONS) {
      for (const m of METHODS) {
        const allowed = m === "GET" ? LH_GET.has(act) : LH_POST.has(act);
        for (const body of [{}, { pad: PAD }]) {
          const r = await call(m, `/api/z/${g.id}/${act}`, m === "POST" ? body : undefined, keyH(keys.lh)); const t = await r.text();
          let code = ""; try { code = JSON.parse(t).code ?? ""; } catch { /* not json */ }
          if (!allowed && code !== "host-limited") bad.push(`${m} ${act} -> ${r.status} ${code}`);
          if (allowed && code === "host-limited") bad.push(`${m} ${act} should be allowed`);
        }
      }
      // the /ai/<key> spelling, with a method override: the inner call meets the same gate
      const r = await call("GET", `/ai/${keys.lh}/z/${g.id}/${act}?_method=POST&_body=${encodeURIComponent("{}")}`);
      const t = await r.text(); let code = ""; try { code = JSON.parse(t).code ?? ""; } catch { /* not json */ }
      if (!LH_POST.has(act) && r.status === 200 && code !== "host-limited") bad.push(`/ai/ override ${act} -> ${r.status}`);
    }
    for (const sub of EXTRA_SUB.filter((s) => s.startsWith("v2/") && !/^v2\/(host\/(stepdown|handover|requests)|claimreview$)/.test(s))) {
      for (const m of METHODS) { const r = await call(m, `/api/z/${g.id}/${sub}`, m === "POST" ? {} : undefined, keyH(keys.lh)); if (r.status === 200 && !/^v2\/(receipts$|host$|claimreview$)/.test(sub)) bad.push(`lh ${m} ${sub} -> 200`); }
    }
    expect(bad).toEqual([]);
  }, 280_000);
});

describe("5. after the end only the short list remains; 24 hours later everything is refused", () => {
  test("a person's and an AI's game key", async () => {
    const { g, keys } = await world(); endGame(g.id, T + HOUR);
    const now = T + 2 * HOUR, bad: string[] = [];
    const OVER_POST = new Set(["erase", "clone"]), OVER_GET = new Set(["results", "reportlink"]);
    for (const [kind, key] of Object.entries(keys).filter(([k]) => k !== "lh")) {
      for (const act of ACTIONS) for (const m of METHODS) {
        const allowed = (m === "POST" && OVER_POST.has(act)) || (m === "GET" && OVER_GET.has(act));
        const r = await call(m, `/api/z/${g.id}/${act}`, m === "POST" ? { pad: PAD } : undefined, keyH(key), now); const t = await r.text();
        let code = ""; try { code = JSON.parse(t).code ?? ""; } catch { /* not json */ }
        if (!allowed && code !== "game-over") bad.push(`${kind} ${m} ${act} -> ${r.status} ${code}`);
      }
    }
    const late = T + HOUR + 24 * HOUR;
    for (const key of Object.values(keys)) for (const p of [`/api/z/${g.id}/summary`, "/api/whoami", `/api/z/${g.id}/v2/status`]) {
      const r = await call("GET", p, undefined, keyH(key), late); if (r.status !== 401) bad.push(`expired ${p} -> ${r.status}`);
    }
    expect(bad).toEqual([]);
  }, 180_000);
});

describe("6. the one place a key becomes an identity", () => {
  test("a key made for one game is no key at all unless the call came through the gate", async () => {
    const { keys } = await world(); const { authOfKey } = await import("../src/worker");
    for (const key of Object.values(keys)) {
      expect((await authOfKey(W.env as any, key, T)).kind).toBeNull(); // the default: not gated
      expect((await authOfKey(W.env as any, key, T, true)).kind).not.toBeNull();
    }
  });
  test("only the header reader and the /ai/ link pass gated=true (so a new flow that reads a key from somewhere else starts closed)", () => {
    const calls = srcText.split(/\r?\n/).filter((l) => /authOfKey\(/.test(l) && !/function authOfKey/.test(l));
    const gatedCalls = calls.filter((c) => /now, true\)/.test(c)), plainCalls = calls.filter((c) => !/now, true\)/.test(c));
    expect(gatedCalls.length).toBe(2); // authOf (header) and the /ai/<key> link
    expect(plainCalls.length).toBe(1); // the Google host sign-in, whose key travels in the body
  });
  test("every other query of organizer_key by hash is a reviewed one (a new one fails here, so it is looked at before it ships)", () => {
    const sources = readdirSync(SRC).filter((f) => f.endsWith(".ts") && !f.startsWith("v2")).map((f) => [f, readFileSync(join(SRC, f), "utf8")] as const);
    const seen: string[] = [];
    for (const [f, text] of sources) for (const m of text.matchAll(/FROM organizer_key WHERE hash=\?[^"`]*/g)) if (!/scope_eid IS NULL/.test(m[0]!) && !/scope_eid, scope_kind, scope_src/.test(text.slice(Math.max(0, m.index! - 170), m.index! + 10))) seen.push(f + ": " + m[0]!.slice(0, 80));
    // reviewed: the help desk checks a Host row it made itself; the Host setup reads a Host identity by its internal id; the lasting AI link check reads the organizer's own AI key
    expect(seen.sort()).toEqual(["helpdesk.ts: FROM organizer_key WHERE hash=? AND kind='host' AND revoked=0", "hostsetup.ts: FROM organizer_key WHERE hash=?", "hostsetup.ts: FROM organizer_key WHERE hash=?),0)) ON CONFLICT(host_id) DO UPDATE SET email_ha", "hostsetup.ts: FROM organizer_key WHERE hash=? AND kind='host' AND revoked=0", "worker.ts: FROM organizer_key WHERE hash=? AND revoked=0"].concat(seen.filter((x) => /created_by='d'/.test(x))).sort());
  });
});
