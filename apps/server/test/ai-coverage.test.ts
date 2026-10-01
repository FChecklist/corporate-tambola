import { expect, test } from "bun:test";

// Every organizer-side console route must be reachable by the external AI through the AI work link, or be on this explicit
// list with a reason. A new console route added later without a tool fails this test.
const EXEMPT: Record<string, string> = {
  "GET /api/health": "monitoring",
  "POST /api/checkout": "money: the organizer pays, never the AI",
  "POST /api/payments/verify": "payment confirmation from the payment page",
  "POST /api/webhooks/razorpay": "payment provider callback",
  "GET /api/payments/status": "payment page polling",
  "POST /api/auth/email": "organizer sign-in",
  "POST /api/auth/verify": "organizer sign-in",
  "GET /api/orgs/me/ai-link": "creating/rotating the AI link is the organizer's own act",
  "POST /api/orgs/me/ai-link": "same",
  "DELETE /api/orgs/me/ai-link": "same",
  "GET /api/e/:code/control": "public static file that phones read, not an organizer action",
  "PUT /api/e/:code/control/key": "registering the signing key is done by the organizer own browser; the AI never holds or sets a key",
  "POST /api/e/:code/control": "must carry the organizer signature; the AI can only DRAFT it (request_control) and the confirm page signs",
  "GET /api/orgs/me/invoices": "TODO: add a read-only get_invoices tool",
};

const norm = (p: string) => p.split("${p.q")[0]!.replace(/\$\{[^}]*\}\s*\?.*$/, "").replace(/\/$/, "").replace(/\$\{[^}]*\}/g, ":x").replace(/:[a-z]+/g, ":x").replace(/\?.*$/, "");

test("every organizer console route has an AI tool or a stated reason", async () => {
  const idx = await Bun.file(new URL("../src/index.ts", import.meta.url)).text();
  const ai = await Bun.file(new URL("../src/ai-link.ts", import.meta.url)).text();
  const routes = [...idx.matchAll(/^route_\("([A-Z]+)", "([^"]+)"/gm)].map((m) => `${m[1]} ${m[2]}`);
  const console_ = routes.filter((r) => /\/api\/(e\/:code\/(console|settings|rewards|breaks|upload|people|waiting|conflicts|start|end|draw|pause|resume|moments|endbreak|raise-limit|report|reuse|control)|orgs\/me|checkout|payments|webhooks|auth|health)/.test(r));
  const tools = new Set([...ai.matchAll(/(?:must|call|callRoute)\([a-z]+,\s*"([A-Z]+)",\s*[`"]([^`"]*)[`"]/g)].map((m) => `${m[1]} ${norm(m[2]!)}`));
  const missing = console_.filter((r) => !EXEMPT[r] && ![...tools].some((t) => t === norm(r)));
  expect(missing).toEqual([]);
  expect(console_.length).toBeGreaterThan(20);
});
