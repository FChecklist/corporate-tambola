// V2 item 6 (master key for ONE game, expiring 24 hours after the game ends) and the scope gate used by item 7 (Host key without personal data).
//
// The organizer's own sign-in key (ctk_) belongs to the whole account and is NOT changed. A GAME KEY is a separate key the organizer makes for one game (to give to an AI or a helper):
//   scope_kind 'gm' = game master key (a person's helper), 'ga' = game master key for an AI (every call is labelled AI in the game's own audit trail), 'lh' = a Host key made without personal data.
// The gate below runs before every existing route; for any key that is not scoped it returns null at once, so every existing route behaves exactly as in c6897f2.
import { realEndMs } from "./lifecycle";
import { cloneGame } from "./clone";
import { GAME_ID, KEY_AFTER_END_MS, cleanText, randHex, sha, type V2Ctx } from "./v2-types";

export const GAME_KEY_PREFIX = "ctg_";
const MAX_GAME_KEYS = 5;

export const MSG_OVER = "This game is over. With this key you can now only delete the game's data, download it, fetch the invoice, or make a new game like it. Nothing else is possible, and the key stops working 24 hours after the game ended.";
export const MSG_EXPIRED = "This key has expired: it worked until 24 hours after its game ended. Ask the organizer for a key for a new game.";
const MSG_SCOPE = "This key is for one game only. It cannot do account things such as the team, keys, or other games.";
const MSG_AI_PEOPLE = "Names and mobile numbers never pass through an AI. The organizer opens that list in their own console.";

/** When the game really ended (null while it is still to be played or being played). A cancelled game ended when it was cancelled. */
export async function gameEndMs(env: any, e: any, now: number): Promise<number | null> {
  if (e.cancelled_ms) return Number(e.cancelled_ms);
  return realEndMs(env, e, now);
}

/** Existing game actions a Host key made without personal data (scope 'lh') may call: the narrow Host rights (the same set a Host's AI link has) plus what the Host console reads. */
const LH_GET = new Set(["participants", "summary", "results", "info", "prizes", "life", "claims", "seats", "control", "gamelog", "changes", "presence", "myprizes"]);
const LH_POST = new Set(["announce", "prizegiven", "override"]);
/** After the game is over, a game master key may only: delete data, download data, fetch the invoice, make a new game like it. */
const OVER_POST = new Set(["erase", "clone"]);
const OVER_GET = new Set(["results", "reportlink"]);
/** What an AI-purposed game key never reaches (people lists carry names and numbers). */
const AI_DENY = new Set(["roster", "people", "waiting", "me", "names", "person", "forget"]);
/** Routes that name no game and are harmless for any signed-in key. */
const OPEN_OK = /^\/api\/(notices|auth\/config|invoice\/[A-Za-z0-9_.-]+|beacon\/.*|v2\/(support(\/\d+)?|verify\/[A-Za-z0-9]+))$|^\/api\/z\/(ai-manifest|schedule)$/;

export async function scopeGate(c: V2Ctx): Promise<Response | null> {
  const { a, p, req, env, now, json } = c;
  if (!a.scopeEid) return null;
  const e: any = await env.DB.prepare("SELECT * FROM engagement WHERE id=?").bind(a.scopeEid).first();
  if (!e) return json({ error: MSG_EXPIRED, code: "key-expired" }, 401);
  const end = await gameEndMs(env, e, now);
  if (end !== null && now >= end + KEY_AFTER_END_MS) return json({ error: MSG_EXPIRED, code: "key-expired" }, 401);
  const over = end !== null, lh = a.scopeKind === "lh", M = req.method;
  if (M === "GET" && p === "/api/whoami") return json({ kind: lh ? "host" : a.scopeKind === "ga" ? "ai" : "master", gameKey: true, game: a.scopeEid, over, expiresMs: end === null ? null : end + KEY_AFTER_END_MS });
  if (OPEN_OK.test(p)) return null;
  const m = p.match(/^\/api\/z\/([A-Za-z0-9_-]{4,40})\/([A-Za-z0-9-]+)(?:\/(.*))?$/);
  if (!m) return json({ error: MSG_SCOPE, code: "key-scope" }, 403);
  if (m[1] !== a.scopeEid) return json({ error: `This key is for the game ${a.scopeEid} only.`, code: "key-scope" }, 403);
  const action = m[2]!, sub = m[3] ?? "";
  if (action === "v2") { // the V2 routes check their own roles; after the end a game master key keeps only the data routes, a Host key made without personal data keeps its Host routes
    if (over && !lh && !/^(export|receipts|status|keys)(\/|$)/.test(sub)) return json({ error: MSG_OVER, code: "game-over" }, 403);
    return null;
  }
  if (lh) {
    const ok = M === "GET" ? LH_GET.has(action) : LH_POST.has(action);
    return ok ? null : json({ error: "This Host key is limited to watching the game, messages to everyone, and handing over prizes. For anything else please ask the organizer.", code: "host-limited" }, 403);
  }
  if (over) {
    if (M === "POST" && action === "clone") return cloneWithKey(c, e);
    const ok = (M === "POST" && OVER_POST.has(action)) || (M === "GET" && OVER_GET.has(action));
    if (!ok) return json({ error: MSG_OVER, code: "game-over" }, 403);
    return null;
  }
  if (action === "rehearsal") return json({ error: "A practice game with its own keys is the organizer's to make: please ask them to make it from their own console.", code: "key-scope" }, 403); // it would make new Co-host keys that do not stop 24 hours after the game
  if (a.scopeKind === "ga" && AI_DENY.has(action)) return json({ error: MSG_AI_PEOPLE, code: "ai-people" }, 403);
  if (M === "POST" && action === "clone") return cloneWithKey(c, e);
  if (M === "POST" && action === "reuse") { // fetching people from another game is allowed only from the game this one was made from
    const b = await c.body(req.clone(), 512);
    if (!a.scopeSrc || !b || b.from !== a.scopeSrc) return json({ error: "This key may bring people only from the game this one was made from.", code: "key-scope" }, 403);
  }
  return null;
}

/** "Make a new game like this one" through a game key: the same clone as the console's, and the new game gets its own key (so the work can go on without the organizer). */
async function cloneWithKey(c: V2Ctx, e: any): Promise<Response> {
  const { a, env, now, json, req, origin } = c;
  if (a.scopeKind === "ga" || req.headers.get("x-ai-model")) return json({ error: "A new game is the organizer's to make: please ask them to make it from their own console.", code: "key-scope" }, 403);
  if (a.kind !== "master" || !a.org || a.org !== e.org) return json({ error: "Not allowed.", code: "key-scope" }, 403);
  const b = (await c.body(req, 512)) ?? {};
  const r = await cloneGame(env as any, e, b, now, origin, (n) => c.spend(n), json);
  if (r.status >= 300) return r;
  let out: any; try { out = await r.clone().json(); } catch { return r; }
  if (!out?.id) return r;
  const k = await insertGameKey(c, out.id, a.scopeKind === "ga" ? "ga" : "gm", a.label ?? "", e.id);
  return json({ ...out, gameKey: k.key, gameKeyNote: "A key for the NEW game only. It is shown once. It works until 24 hours after that game ends." });
}

async function insertGameKey(c: V2Ctx, eid: string, kind: "gm" | "ga" | "lh", label: string, src: string | null): Promise<{ key: string; id: string }> {
  const key = GAME_KEY_PREFIX + randHex(24), kh = await sha("key|" + key);
  await c.env.DB.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,is_test,label,created_by,scope_eid,scope_src,scope_kind) VALUES(?,?,?,0,?,COALESCE((SELECT MAX(k2.is_test) FROM organizer_key k2 WHERE k2.org=?),0),?,'o',?,?,?)").bind(kh, c.a.org, "master", c.now, c.a.org, label, eid, src, kind).run();
  return { key, id: kh.slice(0, 10) };
}

/** POST/GET /api/z/{id}/v2/keys and POST /api/z/{id}/v2/keys/revoke. */
export async function keysRoute(c: V2Ctx, eid: string, rest: string): Promise<Response> {
  const { a, req, env, now, json } = c;
  const e: any = await env.DB.prepare("SELECT id, org, cancelled_ms FROM engagement WHERE id=?").bind(eid).first();
  if (!e) return json({ error: "No such engagement." }, 404);
  const account = a.kind === "master" && !a.scopeEid && a.org === e.org;
  const own = a.kind === "master" && a.scopeEid === eid && a.org === e.org;
  if (!account && !own) return json({ error: "Only the organizer's own key can make or retire game keys.", code: "not-allowed" }, 403);
  if (req.method === "GET" && rest === "") {
    const rows = (await env.DB.prepare("SELECT hash, label, scope_kind, created_ms, revoked FROM organizer_key WHERE scope_eid=? ORDER BY created_ms").bind(eid).all<any>()).results ?? [];
    return json({ game: eid, keys: rows.map((r: any) => ({ id: String(r.hash).slice(0, 10), label: r.label ?? "", kind: r.scope_kind === "lh" ? "host" : r.scope_kind === "ga" ? "ai" : "master", createdMs: r.created_ms, retired: !!r.revoked })), rule: "A game key works for this game only and stops 24 hours after the game ends." });
  }
  if (!account) return json({ error: "Only the organizer's own sign-in key can make or retire game keys.", code: "not-allowed" }, 403);
  if (req.method === "POST" && rest === "") {
    const b = await c.body(req, 512);
    const end = await gameEndMs(env, await env.DB.prepare("SELECT * FROM engagement WHERE id=?").bind(eid).first(), now);
    if (end !== null) return json({ error: "This game is over: a new key for it is not made. Use the key you have (it works for deleting and downloading data until 24 hours after the end), or make a new game.", code: "game-over" }, 409);
    const n = (await env.DB.prepare("SELECT COUNT(*) AS c FROM organizer_key WHERE scope_eid=? AND scope_kind IN ('gm','ga') AND revoked=0").bind(eid).first<{ c: number }>())?.c ?? 0;
    if (n >= MAX_GAME_KEYS) return json({ error: `A game can have up to ${MAX_GAME_KEYS} game keys at a time. Retire one first.`, code: "too-many" }, 409);
    if (!(await c.spend(3))) return c.busy();
    const label = cleanText(b?.label, 40), ai = b?.ai === true;
    const k = await insertGameKey(c, eid, ai ? "ga" : "gm", label, null);
    return json({ ok: true, key: k.key, id: k.id, label, kind: ai ? "ai" : "master", game: eid, shownOnce: true, rule: "Works for this game only. Stops 24 hours after the game ends. After the game ends it can only delete data, download data, fetch the invoice, or make a new game like it." });
  }
  if (req.method === "POST" && rest === "revoke") {
    const b = await c.body(req, 256);
    const id = typeof b?.id === "string" && /^[0-9a-f]{10}$/.test(b.id) ? b.id : "";
    if (!id) return json({ error: "Say which key (its id from the list).", code: "bad-id" }, 400);
    const r = await env.DB.prepare("UPDATE organizer_key SET revoked=1 WHERE scope_eid=? AND (substr(hash,1,10)=? OR (host_id IS NOT NULL AND substr(host_id,1,10)=?))").bind(eid, id, id).run();
    return (r.meta?.changes ?? 0) > 0 ? json({ ok: true }) : json({ error: "No such game key.", code: "not-found" }, 404);
  }
  return json({ error: "Not found" }, 404);
}

export { GAME_ID };
