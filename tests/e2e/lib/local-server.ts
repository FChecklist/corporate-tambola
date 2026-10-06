// Local stand-in for the end-to-end run: the real Worker code + an in-memory SQLite database + the real web files, in TEST mode.
// TEST_MODE=1 (the older local-only switch) makes sign-in and partner codes come back in the answer so the specs can finish those flows without a mailbox.
// Exposes a small /__e2e/* control surface (local only): move the clock, read mail events, read raw rows. It does not exist in the real Worker.
import { startLocal } from "../../../apps/edge/src/local";
process.env.TEST_MODE = process.env.TEST_MODE ?? "1";
const s = startLocal({ port: Number(process.env.E2E_PORT ?? 8791), secret: "e2e", dbFile: ":memory:", mode: "TEST", budget: process.env.E2E_BUDGET });
(s.env as any).ORGANIZER_SECRET = "e2e";
(s.env as any).DATA_KEY = "e2e-data-key-0123456789abcdef0123456789abcdef";
(s.env as any).PHONE_SALT = "e2e-phone-salt";
(s.env as any).CRON_KEY = "e2e-cron-key-0123456789";
console.log("READY " + s.url);
// control surface on a second port so nothing about it is reachable through the app's own port
Bun.serve({ port: Number(process.env.E2E_PORT ?? 8791) + 1, async fetch(req) {
  const u = new URL(req.url);
  if (u.pathname === "/rows") { const q = u.searchParams.get("sql") ?? ""; if (!/^\s*select\b/i.test(q)) return new Response("select only", { status: 400 }); return Response.json(s.raw.query(q).all()); }
  if (u.pathname === "/exec") { const q = u.searchParams.get("sql") ?? ""; s.raw.run(q); return Response.json({ ok: true }); }
  if (u.pathname === "/tick") { const now = Number(u.searchParams.get("now") ?? Date.now()); const { handle } = await import("../../../apps/edge/src/worker"); const r = await handle(new Request(s.url + "/api/lifecycle/tick", { method: "POST", headers: { "x-organizer": "e2e" } }), s.env, now); return new Response(await r.text(), { status: r.status }); }
  return new Response("not found", { status: 404 });
} });
