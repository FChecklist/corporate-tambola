// V2 (13 Nov 2026): the one door the Worker opens for all new routes and the scoped-key gate. See docs/V2_CHANGE_PLAN.md.
// For an ordinary key on an ordinary route this returns null at once (no database read), so every route that existed in c6897f2 behaves exactly as before.
import { scopeGate, keysRoute, gameEndMs } from "./v2-keys";
import { receiptsRoute, orgReceiptsRoute } from "./v2-receipts";
import { certsRoute, verifyRoute } from "./v2-certs";
import { exportRoute } from "./v2-export";
import { supportRoute, ownerSupportRoute, purgeSupport } from "./v2-support";
import { claimReviewRoute, prizeHold } from "./v2-claims";
import { hostRoute } from "./v2-host";
import { KEY_AFTER_END_MS, cleanText, type V2Auth, type V2Ctx } from "./v2-types";

export { V2_SCHEMA } from "./v2-schema";
export type { V2Ctx, V2Auth } from "./v2-types";

const V2_PATH = /^\/api\/(z\/[A-Za-z0-9_-]{4,40}\/v2(\/|$)|org\/v2\/|v2\/|owner\/v2\/)/;
const PRIZEGIVEN = /^\/api\/z\/([A-Za-z0-9_-]{4,40})\/prizegiven$/;

/** The label an AI call carries in the game's own audit trail: "AI" or "AI: ChatGPT". A call is labelled when it comes with the organizer's AI key, an AI game key, a Host's AI link, or declares itself an AI
 *  (the gateway sends the header x-ai-model: "AI: <assistant>"). A master-key call that does not declare itself is a person and is not labelled. */
export function v2AiLabel(a: V2Auth, req: Request): string | null {
  const declared = req.headers.get("x-ai-model");
  const name = declared ? cleanText(declared.replace(/^\s*AI\s*:?\s*/i, ""), 40) : "";
  const isAi = a.kind === "ai" || a.scopeKind === "ga" || (a.kind === "host" && !!a.viaLink);
  if (!isAi && !declared) return null;
  if (!a.kind || (a.kind !== "master" && a.kind !== "ai" && a.kind !== "host")) return null;
  const nm = name || (a.scopeKind === "ga" ? cleanText(a.label ?? "", 40) : "");
  return "AI" + (nm ? ": " + nm : "");
}

export async function v2Route(c: V2Ctx): Promise<Response | null> {
  const { a, p, req, json } = c;
  const isV2 = V2_PATH.test(p);
  const pg = req.method === "POST" ? p.match(PRIZEGIVEN) : null;
  if (!a.scopeEid && !isV2 && !pg) return null;
  const gate = await scopeGate(c);
  if (gate) return gate;
  if (pg) return prizeHold(c, pg[1]!);
  if (!isV2) return null;
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\/api\/z\/([A-Za-z0-9_-]{4,40})\/v2\/([a-z]+)(?:\/(.*))?$/))) {
    const eid = m[1]!, what = m[2]!, rest = m[3] ?? "";
    if (a.kind === "master" && req.method !== "GET" && c.req.headers.get("x-ai-model") && (what === "keys" || what === "host" || what === "claimreview")) return json({ error: "A person does this, not an AI: the organizer opens it in their console.", code: "not-allowed" }, 403);
    switch (what) {
      case "keys": return keysRoute(c, eid, rest);
      case "receipts": return receiptsRoute(c, eid, rest);
      case "certs": return certsRoute(c, eid, rest);
      case "export": return exportRoute(c, eid);
      case "host": return hostRoute(c, eid, rest);
      case "claimreview": return claimReviewRoute(c, eid, rest);
      case "aitrail": return aiTrail(c, eid);
      case "status": return status(c, eid);
    }
    return json({ error: "Not found" }, 404);
  }
  if (p === "/api/org/v2/receipts" && req.method === "GET") return orgReceiptsRoute(c);
  if (p === "/api/org/v2/notices" && req.method === "GET") return orgNotices(c);
  if ((m = p.match(/^\/api\/v2\/support(?:\/(.*))?$/))) return supportRoute(c, m[1] ?? "");
  if ((m = p.match(/^\/api\/v2\/verify\/([A-Za-z0-9]{1,40})$/)) && req.method === "GET") return verifyRoute(c, m[1]!);
  if ((m = p.match(/^\/api\/owner\/v2\/support(?:\/(.*))?$/))) return ownerSupportRoute(c, m[1] ?? "");
  return json({ error: "Not found" }, 404);
}

async function aiTrail(c: V2Ctx, eid: string): Promise<Response> {
  const { a, env, json } = c;
  const e: any = await env.DB.prepare("SELECT org FROM engagement WHERE id=?").bind(eid).first();
  if (!e) return json({ error: "No such engagement." }, 404);
  if (!(a.plat || (a.org && a.org === e.org && (a.kind === "master" || a.kind === "ai")))) return json({ error: "The AI trail is for the organizer of this game.", code: "not-allowed" }, 403);
  const r = (await env.DB.prepare("SELECT at_ms, key_id, label, method, path, status, country FROM ai_audit WHERE eid=? ORDER BY id DESC LIMIT 300").bind(eid).all<any>()).results ?? [];
  return json({ game: eid, trail: r.map((x: any) => ({ atMs: x.at_ms, who: x.label ?? "AI", keyId: x.key_id, method: x.method, path: x.path, status: x.status, country: x.country })) });
}

async function status(c: V2Ctx, eid: string): Promise<Response> {
  const { a, env, now, json } = c;
  const e: any = await env.DB.prepare("SELECT * FROM engagement WHERE id=?").bind(eid).first();
  if (!e) return json({ error: "No such engagement." }, 404);
  if (!(a.plat || (a.org && a.org === e.org && a.kind === "master"))) return json({ error: "Not allowed.", code: "not-allowed" }, 403);
  const end = await gameEndMs(env, e, now);
  return json({ game: eid, over: end !== null, endedMs: end, gameKeysExpireMs: end === null ? null : end + KEY_AFTER_END_MS, afterTheEnd: end === null ? null : ["delete the game's data", "download the game's data", "fetch the invoice", "make a new game like it"] });
}

async function orgNotices(c: V2Ctx): Promise<Response> {
  const { a, env, json } = c;
  if (a.kind !== "master" || !a.org || a.scopeEid) return json({ error: "Not allowed.", code: "not-allowed" }, 403);
  const r = (await env.DB.prepare("SELECT eid, kind, text, at_ms FROM v2_notice WHERE org=? ORDER BY id DESC LIMIT 50").bind(a.org).all<any>()).results ?? [];
  return json({ notices: r.map((n: any) => ({ game: n.eid, kind: n.kind, text: n.text, atMs: n.at_ms })) });
}

/** Daily clean-up (called from purgeOld): old support tickets, and the V2 rows of games that no longer exist. */
export async function v2Purge(env: { DB: V2Ctx["env"]["DB"] }, now: number): Promise<void> {
  await purgeSupport(env, now).catch(() => undefined);
  // a game key stops answering 24 hours after its game ends (the gate says so at once); here the row is also switched off, so the team list is tidy
  await env.DB.prepare("UPDATE organizer_key SET revoked=1 WHERE scope_eid IS NOT NULL AND revoked=0 AND (scope_eid IN (SELECT eid FROM life WHERE end_ms IS NOT NULL AND end_ms<?) OR scope_eid IN (SELECT id FROM engagement WHERE cancelled_ms IS NOT NULL AND cancelled_ms<?))").bind(now - KEY_AFTER_END_MS, now - KEY_AFTER_END_MS).run().catch(() => undefined);
  for (const sql of [
    "DELETE FROM organizer_key WHERE scope_eid IS NOT NULL AND scope_eid NOT IN (SELECT id FROM engagement)",
    "DELETE FROM v2_flag WHERE eid NOT IN (SELECT id FROM engagement)",
    "DELETE FROM v2_handover WHERE eid NOT IN (SELECT id FROM engagement)",
    "DELETE FROM v2_notice WHERE eid IS NOT NULL AND eid NOT IN (SELECT id FROM engagement)",
    "DELETE FROM v2_claim_review WHERE eid NOT IN (SELECT id FROM engagement)",
  ]) await env.DB.prepare(sql).run().catch(() => undefined);
}
