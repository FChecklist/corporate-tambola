// Refer & earn: sales partners who sell Corporate Tambola.
//   - A partner's reference code IS their 10-digit mobile number. Their unique link is  /?ref=<code>  and anyone who buys through it is attributed to them.
//   - Anyone can enrol (a participant from the ticket, or a stranger from the page) by giving a mobile number and agreeing; they get a private partner key (shown once)
//     to see their own sales. Nobody else can see a partner's sales, and a partner never sees who the buyer is (only date, pack and amount).
//   - A commission row is written when a referred purchase is PAID (never earlier). The commission RATE is not decided yet: rows wait as `pending_rate` with the
//     taxable value recorded, and we apply a rate later (or set PARTNER_COMMISSION_RATE) without losing anything. Self-referral is blocked with a reason.
//   - Attribution lasts ATTRIBUTION_DAYS from the click (kept in the buyer's own browser); the server only checks the code is a real, active partner.
//   - Payouts are made by us, outside this Worker (KYC, TDS and the payout channel are decided separately); here we only record that a payout was made.
import type { D1, Env } from "./worker";
import type { PayEnv } from "./pay";

export const ATTRIBUTION_DAYS = 30;
/** The commission every partner earns on the software price (before GST) of a paid, referred purchase. Owner decision 2026-10-03: 50%. PARTNER_COMMISSION_RATE can lower it (never above 50%). */
export const COMMISSION_RATE = 0.5;
/** What the partner who first brought a customer earns when that customer buys again within a year. */
export const REPEAT_COMMISSION_RATE = 0.2;
export const REPEAT_WINDOW_DAYS = 365;
export const PARTNER_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS partner (code TEXT PRIMARY KEY, key_hash TEXT NOT NULL, name TEXT, source TEXT, enrolled_ms INTEGER NOT NULL, consent_ms INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'active')`,
  `CREATE TABLE IF NOT EXISTS commission (id INTEGER PRIMARY KEY AUTOINCREMENT, payment_id TEXT UNIQUE NOT NULL, partner_code TEXT NOT NULL, base REAL NOT NULL, currency TEXT NOT NULL, rate REAL, amount REAL, status TEXT NOT NULL, reason TEXT, created_ms INTEGER NOT NULL, paid_ref TEXT, paid_ms INTEGER)`,
];

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");
const randHex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
const r2 = (x: number) => Math.round(x * 100) / 100;
async function body(req: Request, max = 2048): Promise<any | null> { const t = await req.text(); if (t.length > max) return null; try { const v = JSON.parse(t); return v && typeof v === "object" ? v : null; } catch { return null; } }

/** The 10-digit code for a mobile number as typed (+91 98765 43210, 098765 43210, 9876543210 are one person). */
export const partnerCode = (raw: unknown): string | null => { const d = String(raw ?? "").replace(/\D/g, ""); return d.length >= 10 && d.length <= 15 ? d.slice(-10) : null; };
export const phoneHashFor = (env: Env, code: string) => sha(`${env.PHONE_SALT ?? env.ORGANIZER_SECRET ?? "ct"}|${code}`); // same recipe the join route uses for participants

/** Called when a payment is fulfilled. Writes at most one commission row per payment; never throws into the purchase. */
export async function recordCommission(env: PayEnv, p: { id: string; ref?: string | null; buyer_phone_hash?: string | null; currency: string }, base: number, now: number): Promise<void> {
  try {
    // a customer belongs to the partner who first brought them for 12 months: their repeat purchases earn that partner the repeat rate, whether or not a link was used again
    const email = String((p as any).email ?? "").trim().toLowerCase();
    const since = now - REPEAT_WINDOW_DAYS * 86_400_000;
    const earlier = email ? await env.DB.prepare("SELECT c.partner_code AS code FROM payment pay LEFT JOIN commission c ON c.payment_id=pay.id AND c.status<>'void' WHERE lower(pay.email)=? AND pay.status='paid' AND pay.id<>? AND pay.paid_ms>? ORDER BY pay.paid_ms LIMIT 1").bind(email, p.id, since).first<{ code: string | null }>() : null;
    const repeat = !!earlier;
    const code = earlier?.code ?? p.ref;
    if (!code) return;
    const partner = await env.DB.prepare("SELECT code FROM partner WHERE code=? AND state='active'").bind(code).first<{ code: string }>();
    if (!partner) return; // unknown or stopped code: the purchase is simply not attributed
    let status = "pending_rate", reason: string | null = null, rate: number | null = null, amount: number | null = null;
    if (p.buyer_phone_hash && p.buyer_phone_hash === (await phoneHashFor(env, partner.code))) { status = "blocked"; reason = "self_referral"; }
    else {
      const set = env.PARTNER_COMMISSION_RATE !== undefined && env.PARTNER_COMMISSION_RATE !== "" ? Number(env.PARTNER_COMMISSION_RATE) : NaN;
      const first = set >= 0 && set <= 0.5 ? set : COMMISSION_RATE; // 50% on a customer's first purchase, unless the owner chose something lower
      const x = repeat ? Math.min(REPEAT_COMMISSION_RATE, first) : first; // 20% when the customer buys again within 12 months
      rate = x; amount = r2(base * x); status = "accrued";
    }
    await env.DB.prepare("INSERT OR IGNORE INTO commission(payment_id,partner_code,base,currency,rate,amount,status,reason,created_ms) VALUES(?,?,?,?,?,?,?,?,?)").bind(p.id, partner.code, base, p.currency, rate, amount, status, reason, now).run();
  } catch { /* a ledger problem must never undo a paid purchase; the payment row still carries the ref so it can be rebuilt */ }
}

export async function partnerRoute(req: Request, env: PayEnv, now: number, spend: (n: number) => Promise<boolean>, platform: boolean): Promise<Response | null> {
  const url = new URL(req.url); const p = url.pathname; const db: D1 = env.DB;
  if (!p.startsWith("/api/partner") && !p.startsWith("/api/partners")) return null;
  const busy = () => json({ error: "Busy day. Please try again after midnight UTC." }, 503);
  const origin = env.PUBLIC_ORIGIN ?? url.origin;

  if (req.method === "GET" && p === "/api/partner/check") { // the landing page asks whether a ?ref= code is real, to show "referred by a partner"
    const c = partnerCode(url.searchParams.get("code"));
    const row = c ? await db.prepare("SELECT code FROM partner WHERE code=? AND state='active'").bind(c).first() : null;
    return json({ valid: !!row });
  }

  if (req.method === "POST" && p === "/api/partner/enroll") {
    const b = await body(req);
    const code = partnerCode(b?.phone);
    if (!b || !code) return json({ error: "Enter a valid mobile number." }, 400);
    if (b.consent !== true) return json({ error: "Please agree to join Refer & earn." }, 400);
    const name = typeof b.name === "string" ? b.name.replace(/[<>`]/g, "").trim().slice(0, 60) : "";
    const have = await db.prepare("SELECT code FROM partner WHERE code=?").bind(code).first();
    if (have) return json({ ok: true, existed: true, code, link: `${origin}/?ref=${code}`, message: "This number is already enrolled. Sign in with your partner key to see your sales." });
    if (!(await spend(2))) return busy();
    const key = "ctp_" + randHex(20);
    await db.prepare("INSERT OR IGNORE INTO partner(code,key_hash,name,source,enrolled_ms,consent_ms,state) VALUES(?,?,?,?,?,?, 'active')").bind(code, await sha("partner|" + key), name || null, b.source === "ticket" ? "ticket" : "direct", now, now).run();
    return json({ ok: true, code, partnerKey: key, link: `${origin}/?ref=${code}` });
  }

  const me = async () => {
    const k = req.headers.get("x-partner") ?? "";
    if (!k) return null;
    return db.prepare("SELECT code, name, state, enrolled_ms FROM partner WHERE key_hash=?").bind(await sha("partner|" + k)).first<{ code: string; name: string | null; state: string; enrolled_ms: number }>();
  };
  if (req.method === "GET" && p === "/api/partner/me") {
    const m = await me();
    if (!m) return json({ error: "Not allowed." }, 403);
    const rows = (await db.prepare("SELECT c.payment_id, c.base, c.currency, c.rate, c.amount, c.status, c.reason, c.created_ms, pay.pack FROM commission c LEFT JOIN payment pay ON pay.id=c.payment_id WHERE c.partner_code=? ORDER BY c.id DESC LIMIT 200").bind(m.code).all<any>()).results ?? [];
    const sum = (st: string) => r2(rows.filter((r: any) => r.status === st && r.currency === "INR").reduce((s: number, r: any) => s + (r.amount ?? 0), 0));
    return json({
      code: m.code, name: m.name, state: m.state, link: `${origin}/?ref=${m.code}`, attributionDays: ATTRIBUTION_DAYS,
      totals: { sales: rows.length, accruedInr: sum("accrued"), paidInr: sum("paid"), waitingForRate: rows.filter((r: any) => r.status === "pending_rate").length, blocked: rows.filter((r: any) => r.status === "blocked").length },
      rateAnnounced: true, rate: COMMISSION_RATE, repeatRate: REPEAT_COMMISSION_RATE,
      sales: rows.map((r: any) => ({ date: r.created_ms, pack: r.pack, currency: r.currency, status: r.status, reason: r.reason, amount: r.amount })), // never who bought
    });
  }

  // ---- us (platform) ----
  if (!platform) return json({ error: "Not allowed." }, 403);
  if (req.method === "GET" && p === "/api/partners") {
    const rows = (await db.prepare("SELECT p.code, p.name, p.state, p.source, p.enrolled_ms, (SELECT COUNT(*) FROM commission c WHERE c.partner_code=p.code) AS sales, (SELECT COALESCE(SUM(amount),0) FROM commission c WHERE c.partner_code=p.code AND status='accrued') AS accrued FROM partner p ORDER BY p.enrolled_ms DESC LIMIT 500").all<any>()).results ?? [];
    return json({ partners: rows });
  }
  if (req.method === "POST" && p === "/api/partners/commission/rate") { // set the rate once it is decided; applies to every sale still waiting for one
    const b = await body(req);
    const rate = Number(b?.rate);
    if (!b || typeof b.rate !== "number" || !(rate >= 0 && rate <= 0.5)) return json({ error: "Rate must be between 0 and 0.5 (50%)." }, 400);
    const rows = (await db.prepare("SELECT id, base FROM commission WHERE status='pending_rate'").all<any>()).results ?? [];
    if (!(await spend(rows.length + 1))) return busy();
    for (const r of rows) await db.prepare("UPDATE commission SET rate=?, amount=?, status='accrued' WHERE id=? AND status='pending_rate'").bind(rate, r2(r.base * rate), r.id).run();
    return json({ ok: true, applied: rows.length });
  }
  if (req.method === "POST" && p === "/api/partners/payout") { // we paid the partner outside this system; record it once
    const b = await body(req);
    const code = partnerCode(b?.code);
    if (!b || !code || typeof b.reference !== "string" || b.reference.length < 3) return json({ error: "Give the partner code and the payment reference." }, 400);
    const r = await db.prepare("UPDATE commission SET status='paid', paid_ref=?, paid_ms=? WHERE partner_code=? AND status='accrued'").bind(b.reference.slice(0, 80), now, code).run();
    return json({ ok: true, paidRows: r.meta?.changes ?? 0 });
  }
  if (req.method === "POST" && p === "/api/partners/commission/void") { // a refunded purchase earns nothing
    const b = await body(req);
    if (!b || typeof b.paymentId !== "string") return json({ error: "Give the payment id." }, 400);
    const r = await db.prepare("UPDATE commission SET status='void', reason=? WHERE payment_id=? AND status IN ('pending_rate','accrued')").bind(typeof b.reason === "string" ? b.reason.slice(0, 120) : "refund", b.paymentId).run();
    return json({ ok: true, voided: r.meta?.changes ?? 0 });
  }
  if (req.method === "POST" && p === "/api/partners/state") {
    const b = await body(req);
    const code = partnerCode(b?.code);
    if (!b || !code || !["active", "blocked"].includes(b.state)) return json({ error: "Give the partner code and a state (active or blocked)." }, 400);
    await db.prepare("UPDATE partner SET state=? WHERE code=?").bind(b.state, code).run();
    return json({ ok: true });
  }
  return json({ error: "Not found" }, 404);
}
