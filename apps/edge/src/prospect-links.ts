// One-time prospect links (owner order 2026-10-27): the owner makes a Rs 0 demo game link for a prospect from the private console, with an expiry (7 days) and a switch.
// A link is an ordinary demo pass (see redeemDemoPass in worker.ts): it gives the ONE account that opens it ONE free game of up to `cap` people, once.
// The secret is kept in the database (kv 'plink/<sha256("dpass|"+secret)>') so the owner can copy the link again; it is only ever returned to the owner's key.
//   GET  /api/owner/prospect-links                          -> the links (newest first) with their state: active | used | expired | off
//   POST /api/owner/prospect-links {action:"create", label?, cap?, days?}   -> {id, link}
//   POST /api/owner/prospect-links {action:"enable"|"disable", id}
//   POST /api/owner/prospect-links {action:"clone", from, startMs | startRound, callSeconds?, reason?}  -> the owner makes the next game for a prospect whose game did not go well: see below
// Own key (OWNER_LINK_KEY): it can make and switch links and do nothing else. Anybody else gets the same 404 as an unknown address; every call is written to the owner's access log.
import { logAccess } from "./audit";
import { cloneGame } from "./clone";
import type { D1, Env } from "./worker";

export interface LinkEnv extends Env { OWNER_LINK_KEY?: string }
export interface ProspectLink { cap: number; label: string; created: number; exp: number; on: boolean; tok: string }

const DAY = 86_400_000, DEFAULT_CAP = 100, DEFAULT_DAYS = 7, MAX_CAP = 250, MAX_DAYS = 30;
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const sha = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const same = (a: string, b: string): boolean => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** The prospect link behind a pass hash, or null. */
export async function getProspectLink(db: D1, ph: string): Promise<ProspectLink | null> {
  try { const r = await db.prepare("SELECT v FROM kv WHERE k=?").bind(`plink/${ph}`).first<{ v: string }>(); return r ? (JSON.parse(r.v) as ProspectLink) : null; } catch { return null; }
}
const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max);

const CLONE_GAPS = [6, 9, 12, 15]; // the gaps between numbers the product allows (worker.ts GAPS); a new game made by the owner uses 12 s unless told otherwise

export async function prospectLinksRoute(req: Request, env: LinkEnv, now: number, spend: (n: number) => Promise<boolean> = async () => true): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/owner/prospect-links") return null;
  const ok = (req.method === "GET" || req.method === "POST") && !!env.OWNER_LINK_KEY && same(req.headers.get("x-owner-link-key") ?? "", env.OWNER_LINK_KEY);
  if (!ok) { await logAccess(env.DB, now, "denied:prospect-links", null, null, 0, false, null); return json({ error: "Not found" }, 404); }
  const origin = (env as any).PUBLIC_ORIGIN ?? "https://corporatetambola.com";
  if (req.method === "GET") {
    const rows = (await env.DB.prepare("SELECT k, v FROM kv WHERE k LIKE 'plink/%' LIMIT 500").all<{ k: string; v: string }>()).results ?? [];
    const out: any[] = [];
    for (const r of rows) {
      let l: ProspectLink; try { l = JSON.parse(r.v); } catch { continue; }
      const ph = r.k.slice(6);
      const used = await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(`dpass/${ph}`).first<{ v: string }>();
      let usedAt: string | null = null; try { if (used) usedAt = new Date(Number(JSON.parse(used.v).at)).toISOString(); } catch { usedAt = null; }
      const state = !l.on ? "off" : now > l.exp ? "expired" : used ? "used" : "active";
      out.push({ id: ph.slice(0, 10), label: l.label, cap: l.cap, state, created: new Date(l.created).toISOString(), expires: new Date(l.exp).toISOString(), usedAt, link: `${origin}/zc.html?pass=${l.tok}` });
    }
    out.sort((a, b) => (a.created < b.created ? 1 : -1));
    await logAccess(env.DB, now, "prospect-links-list", null, null, out.length, true, null);
    return json({ links: out });
  }
  let b: any = null; try { b = JSON.parse(await req.text()); } catch { b = null; }
  const action = b?.action;
  if (action === "create") {
    const cap = Math.max(10, Math.min(MAX_CAP, Math.floor(Number(b?.cap ?? DEFAULT_CAP)) || DEFAULT_CAP));
    const days = Math.max(1, Math.min(MAX_DAYS, Math.floor(Number(b?.days ?? DEFAULT_DAYS)) || DEFAULT_DAYS));
    const tokBytes = new Uint8Array(16); crypto.getRandomValues(tokBytes);
    const tok = Array.from(tokBytes, (x) => x.toString(16).padStart(2, "0")).join("");
    const ph = await sha("dpass|" + tok);
    const link: ProspectLink = { cap, label: clean(b?.label, 60) || "prospect", created: now, exp: now + days * DAY, on: true, tok };
    await env.DB.prepare("INSERT INTO kv(k,v) VALUES(?,?)").bind(`plink/${ph}`, JSON.stringify(link)).run();
    await logAccess(env.DB, now, "prospect-link-create", null, null, 1, true, ph.slice(0, 10));
    return json({ ok: true, id: ph.slice(0, 10), cap, days, expires: new Date(link.exp).toISOString(), link: `${origin}/zc.html?pass=${tok}` });
  }
  if (action === "enable" || action === "disable") {
    const id = clean(b?.id, 10);
    if (!/^[0-9a-f]{10}$/.test(id)) return json({ error: "Say which link: {\"id\": \"...\"}." }, 400);
    const row = await env.DB.prepare("SELECT k, v FROM kv WHERE k LIKE ? LIMIT 1").bind(`plink/${id}%`).first<{ k: string; v: string }>();
    if (!row) return json({ error: "Not found" }, 404);
    const l = JSON.parse(row.v) as ProspectLink; l.on = action === "enable";
    await env.DB.prepare("UPDATE kv SET v=? WHERE k=?").bind(JSON.stringify(l), row.k).run();
    await logAccess(env.DB, now, "prospect-link-" + action, null, null, 1, true, id);
    return json({ ok: true, id, on: l.on });
  }
  if (action === "free") { // the owner makes ONE game free (Rs 0): a pack of the game's own size is given to its organizer and put on the game, with the owner's reason on the access log (a discount voucher for one specific game)
    const eid = clean(b?.eid, 40), reason = clean(b?.reason, 80);
    const e = await env.DB.prepare("SELECT id, org, cap, pack FROM engagement WHERE id=?").bind(eid).first<{ id: string; org: string | null; cap: number; pack: number | null }>();
    if (!e || !e.org) return json({ error: "Not found" }, 404);
    if ((e.pack ?? 0) > 0) return json({ ok: true, again: true, pack: e.pack });
    const eidn = "of_" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => x.toString(16).padStart(2, "0")).join("");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO entitlement(id,org,pack,payment_id,eid,created_ms) VALUES(?,?,?,'owner-free',?,?)").bind(eidn, e.org, e.cap, e.id, now),
      env.DB.prepare("UPDATE engagement SET pack=? WHERE id=? AND pack=0").bind(e.cap, e.id),
    ]);
    await logAccess(env.DB, now, "owner-free-game", e.id, null, 1, true, reason || "no reason given");
    return json({ ok: true, pack: e.cap });
  }
  if (action === "apply") { // the owner puts a person's own unused free or bought pack on their unpaid game (the same rule as pressing Publish again), for when the person cannot do it in time
    const eid = clean(b?.eid, 40);
    const e = await env.DB.prepare("SELECT id, org, cap, pack FROM engagement WHERE id=?").bind(eid).first<{ id: string; org: string | null; cap: number; pack: number | null }>();
    if (!e || !e.org) return json({ error: "Not found" }, 404);
    if ((e.pack ?? 0) > 0) return json({ ok: true, again: true, pack: e.pack });
    const ent = await env.DB.prepare("SELECT id, pack FROM entitlement WHERE org=? AND eid IS NULL AND pack>=? ORDER BY pack, created_ms LIMIT 1").bind(e.org, e.cap).first<{ id: string; pack: number }>();
    if (!ent) return json({ error: "This organizer has no unused pack big enough for this game." }, 409);
    await env.DB.batch([
      env.DB.prepare("UPDATE engagement SET pack=? WHERE id=? AND pack=0").bind(ent.pack, e.id),
      env.DB.prepare("UPDATE entitlement SET eid=? WHERE id=? AND eid IS NULL").bind(e.id, ent.id),
    ]);
    await logAccess(env.DB, now, "prospect-link-apply", e.id, null, 1, true, ent.id);
    return json({ ok: true, pack: ent.pack });
  }
  if (action === "clone") { // the owner makes the NEXT game for a prospect whose game went badly, so they redo nothing: the same draft the organizer would get from "Create a new game like this one" with her people,
    // at the start the owner names, with a free pack of the game's size waiting on her account. It is NOT published: publishing is the organizer's own act (her e-mail, her mobile and the Terms box she ticks herself),
    // and the free pack is put on the game by that same Publish press. Once per source game: pressing it twice gives the same new game.
    const from = clean(b?.from, 40), reason = clean(b?.reason, 80);
    const e = await env.DB.prepare("SELECT * FROM engagement WHERE id=?").bind(from).first<any>();
    if (!e || !e.org) return json({ error: "Not found" }, 404);
    const startRound = Number.isInteger(b?.startRound) ? (b.startRound as number) : Number.isInteger(b?.startMs) ? Math.floor(((b.startMs as number) / 1000 - 1692803367) / 3) + 1 : null; // a round number, or the time in ms (the console sends the time)
    if (startRound === null) return json({ error: 'Say when the new game starts: {"startMs": <time in ms>} or {"startRound": <whole number>}.' }, 400);
    const callSeconds = b?.callSeconds === undefined ? 12 : b.callSeconds;
    if (!Number.isInteger(callSeconds) || !CLONE_GAPS.includes(callSeconds)) return json({ error: `callSeconds must be one of ${CLONE_GAPS.join(", ")}.` }, 400);
    const mark = `ownerclone/${e.id}`;
    const claimed = await env.DB.prepare("INSERT OR IGNORE INTO kv(k,v) VALUES(?,?)").bind(mark, "pending").run();
    if ((claimed.meta?.changes ?? 0) === 0) {
      const v = (await env.DB.prepare("SELECT v FROM kv WHERE k=?").bind(mark).first<{ v: string }>())?.v ?? "pending";
      return v === "pending" ? json({ error: "A copy of this game is being made right now. Try again in a minute." }, 409) : json({ ok: true, again: true, id: v, openUrl: `${origin}/zc.html?e=${v}` });
    }
    const made = await cloneGame(env, { ...e, call_seconds: callSeconds }, { startRound, withPeople: true }, now, origin, spend, json);
    const out: any = await made.clone().json().catch(() => ({}));
    if (made.status !== 200 || !out.ok) { await env.DB.prepare("DELETE FROM kv WHERE k=? AND v='pending'").bind(mark).run(); return json(out?.error ? out : { error: "The copy could not be made." }, made.status === 200 ? 500 : made.status); }
    const eidn = "of_" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => x.toString(16).padStart(2, "0")).join("");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO entitlement(id,org,pack,payment_id,eid,created_ms) VALUES(?,?,?,'owner-free',NULL,?)").bind(eidn, e.org, e.cap, now), // an unused free pack of the game's own size: the organizer's Publish uses it
      env.DB.prepare("UPDATE kv SET v=? WHERE k=?").bind(out.id, mark),
    ]);
    await logAccess(env.DB, now, "owner-clone-game", e.id, null, 1 + (out.peopleCopied ?? 0), true, `${out.id}: ${reason || "no reason given"}`);
    const startMs = (1692803367 + (out.startRound - 1) * 3) * 1000; // round 1 is 2023-08-23 15:09:27 UTC; the same clock as clone.ts and worker.ts
    const startsAtIST = new Date(startMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) + " IST";
    return json({ ok: true, id: out.id, from: e.id, openUrl: out.openUrl, peopleCopied: out.peopleCopied, startRound: out.startRound, startMs, startsAtIST, callSeconds, cap: e.cap, freePack: e.cap, copied: out.copied, published: false });
  }
  return json({ error: 'Send {"action": "create" | "enable" | "disable" | "apply" | "free" | "clone"}.' }, 400);
}
