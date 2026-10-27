// One-time prospect links (owner order 2026-10-27): the owner makes a Rs 0 demo game link for a prospect from the private console, with an expiry (7 days) and a switch.
// A link is an ordinary demo pass (see redeemDemoPass in worker.ts): it gives the ONE account that opens it ONE free game of up to `cap` people, once.
// The secret is kept in the database (kv 'plink/<sha256("dpass|"+secret)>') so the owner can copy the link again; it is only ever returned to the owner's key.
//   GET  /api/owner/prospect-links                          -> the links (newest first) with their state: active | used | expired | off
//   POST /api/owner/prospect-links {action:"create", label?, cap?, days?}   -> {id, link}
//   POST /api/owner/prospect-links {action:"enable"|"disable", id}
// Own key (OWNER_LINK_KEY): it can make and switch links and do nothing else. Anybody else gets the same 404 as an unknown address; every call is written to the owner's access log.
import { logAccess } from "./audit";
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

export async function prospectLinksRoute(req: Request, env: LinkEnv, now: number): Promise<Response | null> {
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
  return json({ error: 'Send {"action": "create" | "enable" | "disable"}.' }, 400);
}
