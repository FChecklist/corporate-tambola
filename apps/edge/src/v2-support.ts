// V2 item 8 (O27): a simple support ticket, raised and read by key and by screen. An organizer, a game key or a Host raises it; the owner answers.
//   POST /api/v2/support {subject, body, game?}        GET /api/v2/support        GET /api/v2/support/{id}        POST /api/v2/support/{id} {body}   (a follow-up from the same side)
//   OWNER: GET /api/owner/v2/support?status=open       POST /api/owner/v2/support/{id} {reply?, status?}
// Kept 365 days like the organizer's other records. The screen warns: never type players' names or numbers.
import { teamEmails } from "./credit";
import { company, sendMail, type PayEnv } from "./pay";
import { cleanText, type V2Ctx } from "./v2-types";

const PER_DAY = 10, OPEN_MAX = 20;
export const SUPPORT_KEEP_MS = 365 * 86_400_000;
const roleOf = (c: V2Ctx): string => (c.a.scopeKind === "lh" ? "host" : c.a.scopeKind === "ga" ? "ai" : c.a.kind === "master" ? "organizer" : c.a.kind === "host" ? "host" : c.a.kind === "ai" ? "ai" : "other");

/** Which tickets this caller may see: the organizer's own key sees the account's; a game key or a Host key sees the tickets of its game only. */
function scopeSql(c: V2Ctx): { sql: string; bind: unknown[] } | null {
  const a = c.a;
  if (!a.org || (a.kind !== "master" && a.kind !== "host" && a.kind !== "ai")) return null;
  if (a.scopeEid) return a.kind === "host" ? { sql: "org=? AND eid=? AND role='host'", bind: [a.org, a.scopeEid] } : { sql: "org=? AND eid=?", bind: [a.org, a.scopeEid] }; // a Host reads Hosts' tickets, never the organizer's (billing, tax)
  if (a.kind === "host" && a.eid) return { sql: "org=? AND eid=? AND role='host'", bind: [a.org, a.eid] };
  if (a.kind === "host") return { sql: "org=? AND role='host'", bind: [a.org] };
  return { sql: "org=?", bind: [a.org] };
}

export async function supportRoute(c: V2Ctx, rest: string): Promise<Response> {
  const { a, req, env, now, json } = c;
  const sc = scopeSql(c);
  if (!sc) return json({ error: "Please sign in with your organizer or Host key to reach support.", code: "not-allowed" }, 403);
  const db = env.DB;
  const one = rest.match(/^(\d{1,9})$/);
  if (req.method === "GET" && rest === "") {
    const r = (await db.prepare(`SELECT id, eid, role, subject, status, created_ms, updated_ms FROM v2_support WHERE ${sc.sql} ORDER BY id DESC LIMIT 50`).bind(...sc.bind).all<any>()).results ?? [];
    return json({ tickets: r.map((t: any) => ({ id: t.id, game: t.eid, by: t.role, subject: t.subject, status: t.status, createdMs: t.created_ms, updatedMs: t.updated_ms })) });
  }
  if (req.method === "GET" && one) {
    const t: any = await db.prepare(`SELECT * FROM v2_support WHERE id=? AND ${sc.sql}`).bind(Number(one[1]), ...sc.bind).first();
    if (!t) return json({ error: "No such ticket.", code: "not-found" }, 404);
    const msgs = (await db.prepare("SELECT who, body, at_ms FROM v2_support_msg WHERE tid=? ORDER BY id").bind(t.id).all<any>()).results ?? [];
    return json({ id: t.id, game: t.eid, by: t.role, subject: t.subject, status: t.status, createdMs: t.created_ms, messages: [{ who: t.role, body: t.body, atMs: t.created_ms }, ...msgs.map((m: any) => ({ who: m.who, body: m.body, atMs: m.at_ms }))] });
  }
  if (req.method === "POST" && rest === "") {
    const b = await c.body(req, 4096);
    const subject = cleanText(b?.subject, 120), text = cleanText(b?.body, 2000);
    if (subject.length < 3 || text.length < 5) return json({ error: "Please give a short subject and say what you need (a few words at least).", code: "need-text" }, 400);
    let eid: string | null = a.scopeEid ?? (a.kind === "host" ? a.eid ?? null : null);
    if (!eid && typeof b?.game === "string" && b.game) {
      const g = await db.prepare("SELECT id FROM engagement WHERE id=? AND org=?").bind(b.game, a.org).first();
      if (!g) return json({ error: "That game is not one of yours.", code: "bad-game" }, 400);
      eid = b.game;
    }
    const today = (await db.prepare("SELECT COUNT(*) AS c FROM v2_support WHERE org=? AND created_ms>?").bind(a.org, now - 86_400_000).first<{ c: number }>())?.c ?? 0;
    const open = (await db.prepare("SELECT COUNT(*) AS c FROM v2_support WHERE org=? AND status<>'closed'").bind(a.org).first<{ c: number }>())?.c ?? 0;
    if (today >= PER_DAY || open >= OPEN_MAX) return json({ error: "There are enough open tickets for now. We will answer them first; please wait for a reply.", code: "too-many" }, 429);
    if (!(await c.spend(3))) return c.busy();
    const role = roleOf(c);
    const r = await db.prepare("INSERT INTO v2_support(org,eid,role,subject,body,status,created_ms,updated_ms) VALUES(?,?,?,?,?,'open',?,?)").bind(a.org, eid, role, subject, text, now, now).run();
    const id = Number((r as any).meta?.last_row_id ?? (await db.prepare("SELECT MAX(id) AS m FROM v2_support WHERE org=?").bind(a.org).first<{ m: number }>())?.m);
    try { // one mail to our help address (never the key; the organizer's address so we can reply)
      const co = company(env as PayEnv), reply = (await teamEmails(env as PayEnv, a.org, eid)).organizer;
      if (co.email) await sendMail(env as PayEnv, db, co.email, `Support ticket ${id}: ${subject}`, `From: ${role}${eid ? ", game " + eid : ""}${reply ? "\nReply to: " + reply : ""}\n\n${text}\n`, now);
    } catch { /* the ticket is saved; the mail is a nicety */ }
    return json({ ok: true, id, status: "open", note: "We have your ticket. Please do not type players' names or mobile numbers in it." });
  }
  if (req.method === "POST" && one) {
    const t: any = await db.prepare(`SELECT * FROM v2_support WHERE id=? AND ${sc.sql}`).bind(Number(one[1]), ...sc.bind).first();
    if (!t) return json({ error: "No such ticket.", code: "not-found" }, 404);
    const text = cleanText((await c.body(req, 4096))?.body, 2000);
    if (text.length < 2) return json({ error: "Please write your message.", code: "need-text" }, 400);
    if (!(await c.spend(2))) return c.busy();
    await db.batch([db.prepare("INSERT INTO v2_support_msg(tid,who,body,at_ms) VALUES(?,?,?,?)").bind(t.id, roleOf(c), text, now), db.prepare("UPDATE v2_support SET status='open', updated_ms=? WHERE id=?").bind(now, t.id)]);
    return json({ ok: true });
  }
  return json({ error: "Not found" }, 404);
}

/** The owner's side (platform key only). */
export async function ownerSupportRoute(c: V2Ctx, rest: string): Promise<Response> {
  const { a, req, env, now, json } = c;
  if (!a.plat || c.req.headers.get("x-ct-link") === "1") return json({ error: "Not allowed." }, 403);
  const db = env.DB, one = rest.match(/^(\d{1,9})$/);
  if (req.method === "GET" && rest === "") {
    const st = c.url.searchParams.get("status");
    const r = (await db.prepare(`SELECT id, org, eid, role, subject, status, created_ms, updated_ms FROM v2_support ${st ? "WHERE status=?" : ""} ORDER BY id DESC LIMIT 100`).bind(...(st ? [st] : [])).all<any>()).results ?? [];
    return json({ tickets: r });
  }
  if (req.method === "GET" && one) {
    const t: any = await db.prepare("SELECT * FROM v2_support WHERE id=?").bind(Number(one[1])).first();
    if (!t) return json({ error: "No such ticket." }, 404);
    return json({ ticket: t, messages: (await db.prepare("SELECT who, body, at_ms FROM v2_support_msg WHERE tid=? ORDER BY id").bind(t.id).all<any>()).results ?? [] });
  }
  if (req.method === "POST" && one) {
    const t: any = await db.prepare("SELECT * FROM v2_support WHERE id=?").bind(Number(one[1])).first();
    if (!t) return json({ error: "No such ticket." }, 404);
    const b = await c.body(req, 4096), reply = cleanText(b?.reply, 2000), status = ["open", "answered", "closed"].includes(b?.status) ? b.status : reply ? "answered" : t.status;
    if (reply) await db.prepare("INSERT INTO v2_support_msg(tid,who,body,at_ms) VALUES(?,?,?,?)").bind(t.id, "support", reply, now).run();
    await db.prepare("UPDATE v2_support SET status=?, updated_ms=? WHERE id=?").bind(status, now, t.id).run();
    if (reply) { try { const to = (await teamEmails(env as PayEnv, t.org, t.eid)).organizer; if (to) await sendMail(env as PayEnv, db, to, `Your support ticket ${t.id}: ${t.subject}`, `${reply}\n\nTo answer, open your organizer screen and choose Support.`, now); } catch { /* the reply is saved */ } }
    return json({ ok: true, status });
  }
  return json({ error: "Not found" }, 404);
}

/** Tickets older than a year go (called from the daily purge). */
export async function purgeSupport(env: { DB: V2Ctx["env"]["DB"] }, now: number): Promise<void> {
  const old = now - SUPPORT_KEEP_MS;
  await env.DB.prepare("DELETE FROM v2_support_msg WHERE tid IN (SELECT id FROM v2_support WHERE created_ms<?)").bind(old).run();
  await env.DB.prepare("DELETE FROM v2_support WHERE created_ms<?").bind(old).run();
}
