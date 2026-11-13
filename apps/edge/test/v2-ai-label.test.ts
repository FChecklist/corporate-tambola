// V2 item 5: calls made by an AI (the AI key, an AI game key, a Host's AI link, or a master-key call that says it is an AI) are named in the game's own audit trail as 'AI' or 'AI: ChatGPT'.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { call, j, keyH, paidGame, q, reset, restore, uid, create } from "./param-harness";
import { gameKey, labelHost } from "./v2-helpers";

beforeEach(() => reset());
afterEach(restore);

const rows = (eid: string) => q("SELECT label, key_id, method, path FROM ai_audit WHERE eid=? ORDER BY id", eid);
const summary = (id: string, h: Record<string, string>) => call("GET", `/api/z/${id}/summary`, undefined, h);

describe("who is labelled AI", () => {
  test("a master-key call that declares itself an AI is labelled with the caller's name", async () => {
    const g = await paidGame(); const n0 = rows(g.id).length;
    expect((await summary(g.id, { ...keyH(g.key), "x-ai-model": "AI: ChatGPT" })).status).toBe(200);
    const r = rows(g.id).slice(n0); expect(r.length).toBe(1); expect(r[0].label).toBe("AI: ChatGPT"); expect(r[0].path).toContain(`/api/z/${g.id}/summary`);
  });
  test("a bare 'AI' header is labelled 'AI'; a master-key call that does not declare itself is a person and is not in the AI trail", async () => {
    const g = await paidGame(); const n0 = rows(g.id).length;
    await summary(g.id, keyH(g.key)); expect(rows(g.id).length).toBe(n0);
    await summary(g.id, { ...keyH(g.key), "x-ai-model": "AI" }); expect(rows(g.id).slice(n0).map((r: any) => r.label)).toEqual(["AI"]);
  });
  test("the organizer's AI key is always labelled, with or without a name", async () => {
    const g = await paidGame(); const n0 = rows(g.id).length;
    await summary(g.id, keyH(g.ai)); await summary(g.id, { ...keyH(g.ai), "x-ai-model": "AI: Gemini" });
    expect(rows(g.id).slice(n0).map((r: any) => r.label)).toEqual(["AI", "AI: Gemini"]);
  });
  test("an AI game key is always labelled, with the label it was given, unless the call names itself", async () => {
    const g = await paidGame(); const k = await gameKey(g, { ai: true, label: "Claude" }); const n0 = rows(g.id).length;
    await summary(g.id, keyH(k)); await summary(g.id, { ...keyH(k), "x-ai-model": "AI: ChatGPT" });
    expect(rows(g.id).slice(n0).map((r: any) => r.label)).toEqual(["AI: Claude", "AI: ChatGPT"]);
  });
  test("a person's game key (not for an AI) is not labelled unless the call says it is an AI", async () => {
    const g = await paidGame(); const k = await gameKey(g, { label: "Neha" }); const n0 = rows(g.id).length;
    await summary(g.id, keyH(k)); expect(rows(g.id).length).toBe(n0);
    await summary(g.id, { ...keyH(k), "x-ai-model": "AI: Claude" }); expect(rows(g.id).slice(n0).map((r: any) => r.label)).toEqual(["AI: Claude"]);
  });
  test("the name is cleaned: no markup, short", async () => {
    const g = await paidGame(); const n0 = rows(g.id).length;
    await summary(g.id, { ...keyH(g.key), "x-ai-model": "AI: <script>alert(1)</script>" + "x".repeat(100) });
    const l = rows(g.id).slice(n0)[0].label as string; expect(l.startsWith("AI: ")).toBe(true); expect(l.length).toBeLessThanOrEqual(44); expect(l).not.toMatch(/[<>]/);
  });
  test("the label is stored with the call, not with who happens to read the trail", async () => {
    const g = await paidGame(); await summary(g.id, { ...keyH(g.key), "x-ai-model": "AI: ChatGPT" });
    const t = await j(await call("GET", "/api/org/ai/audit", undefined, keyH(g.key)));
    expect(t.trail.some((x: any) => x.label === "AI: ChatGPT" && x.eid === g.id)).toBe(true);
  });
});

describe("the game's own trail (GET /api/z/{id}/v2/aitrail)", () => {
  test("the organizer sees the AI's calls to this game and nothing from other games", async () => {
    const g = await paidGame(); const other = uid(); await create(g.key, other);
    await summary(g.id, { ...keyH(g.key), "x-ai-model": "AI: ChatGPT" }); await summary(other, { ...keyH(g.key), "x-ai-model": "AI: ChatGPT" });
    const t = await j(await call("GET", `/api/z/${g.id}/v2/aitrail`, undefined, keyH(g.key)));
    expect(t.game).toBe(g.id); expect(t.trail.length).toBe(1); expect(t.trail[0]).toMatchObject({ who: "AI: ChatGPT", method: "GET" }); expect(t.trail[0].path).toContain(g.id);
  });
  test("the organizer's AI key may read its own trail; a Host and a stranger may not", async () => {
    const g = await paidGame(); const s = await paidGame(); const h = await labelHost(g);
    expect((await call("GET", `/api/z/${g.id}/v2/aitrail`, undefined, keyH(g.ai))).status).toBe(200);
    expect((await call("GET", `/api/z/${g.id}/v2/aitrail`, undefined, keyH(h))).status).toBe(403);
    expect((await call("GET", `/api/z/${g.id}/v2/aitrail`, undefined, keyH(s.key))).status).toBe(403);
  });
  test("a refused call is in the trail too, with its status", async () => {
    const g = await paidGame(); const k = await gameKey(g, { ai: true, label: "Claude" });
    const r = await call("GET", `/api/z/${g.id}/roster`, undefined, keyH(k)); expect(r.status).toBe(403);
    const t = await j(await call("GET", `/api/z/${g.id}/v2/aitrail`, undefined, keyH(g.key)));
    expect(t.trail.some((x: any) => x.who === "AI: Claude" && x.status === 403 && /roster/.test(x.path))).toBe(true);
  });
});
