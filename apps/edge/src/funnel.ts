// First-party organizer FUNNEL (owner order 31 Oct 2026). Our own Worker and D1 only, no third-party script, no personal details: a step is a row in the existing visit store
// (kind 'fn' for the steps the server sees, 'act' and 'pv' for the steps the public pages report). One step is counted once per organizer visit. Country level only.
// A visitor with Global Privacy Control or Do Not Track never has a visit row, so the server steps only raise an anonymous counter (visit_agg dim 'gpc_fun').
// The server steps are written by recordFun. Flag: FUNNEL_EVENTS = "off" stops all of them (the report then shows what was already kept).
import { orgIsTest } from "./mode";
import type { D1, Env } from "./worker";

/** The steps, in order. `pay_failed` is a side branch of the payment, not a step on the way to the next one. */
export const FUN_STEPS = [
  ["viewed", "Page viewed"], ["size_chosen", "Size or price chosen"], ["signup_started", "Sign-up started"], ["game_created", "Game created"], ["game_published", "Game published"],
  ["pay_page_reached", "Payment page reached"], ["pay_page_opened", "Payment page opened"], ["pay_link_copied", "Payment share link copied"], ["pay_started", "Payment started"],
  ["pay_succeeded", "Payment succeeded"], ["pay_failed", "Payment failed"], ["game_started", "Game started"], ["game_completed", "Game completed"],
] as const;
export type FunStep = (typeof FUN_STEPS)[number][0];
/** The steps the SERVER writes (the others come from the public pages' own events). */
export const SERVER_STEPS = new Set<string>(["game_created", "game_published", "pay_page_reached", "pay_link_copied", "pay_started", "pay_succeeded", "pay_failed", "game_started", "game_completed"]);

/** One step for an organizer, once per visit; against the organizer's first visit. With no visit on record only an anonymous counter goes up. Never throws. */
export async function recordFun(env: { DB: D1; FUNNEL_EVENTS?: string }, org: string | null | undefined, step: FunStep, now: number): Promise<void> {
  try {
    if (env.FUNNEL_EVENTS === "off" || !org || !SERVER_STEPS.has(step) || (await orgIsTest(env as unknown as Env, org))) return;
    const db = env.DB, s = await db.prepare("SELECT sid FROM visit_session WHERE org=? AND is_bot=0 ORDER BY first_ms ASC LIMIT 1").bind(org).first<{ sid: string }>();
    if (!s) { await db.prepare("INSERT INTO visit_agg(day,dim,k,n,ms) VALUES(?,?,?,1,0) ON CONFLICT(day,dim,k) DO UPDATE SET n=n+1").bind(new Date(now).toISOString().slice(0, 10), "gpc_fun", step).run(); return; }
    if (await db.prepare("SELECT 1 AS x FROM visit_event WHERE sid=? AND kind='fn' AND name=? LIMIT 1").bind(s.sid, step).first()) return;
    await db.prepare("INSERT INTO visit_event(sid,at_ms,kind,path,name,val,n) VALUES(?,?,'fn',NULL,?,NULL,NULL)").bind(s.sid, now, step).run();
  } catch { /* tracking must never break a game or a payment */ }
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Monday of the week (UTC), as a date. */
export const weekOf = (ms: number) => { const d = new Date(ms), k = (d.getUTCDay() + 6) % 7; return dayOf(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - k)); };
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export interface FunRow { step: FunStep; label: string; count: number; ofPrevious: number | null; ofFirst: number | null }
/** Counts per step to rows. The chain is the steps in order except pay_failed; each row says how many of the previous step went on. Pure. */
export function funnelRows(counts: Record<string, number>): FunRow[] {
  const first = counts.viewed ?? 0; let prev: number | null = null;
  return FUN_STEPS.map(([step, label]) => {
    const count = counts[step] ?? 0, side = step === "pay_failed";
    const row: FunRow = { step, label, count, ofPrevious: side || prev === null ? null : pct(count, prev), ofFirst: pct(count, first) };
    if (!side) prev = count;
    return row;
  });
}

interface Sess { sid: string; first_ms: number; src: string | null; utm_source: string | null; utm_campaign: string | null; device: string | null; country: string | null }
/** The funnel for visits that began in [from, to): total, per day, per week, and where visitors came from (source, campaign, device, country). Human, live visits only. */
export async function funnelReport(env: { DB: D1 }, from: number, to: number, test = false) {
  const db = env.DB, tf = test ? 1 : 0;
  const sess = ((await db.prepare("SELECT sid,first_ms,src,utm_source,utm_campaign,device,country FROM visit_session WHERE first_ms>=? AND first_ms<? AND is_bot=0 AND is_test=? ORDER BY first_ms LIMIT 50000").bind(from, to, tf).all<Sess>()).results ?? []) as Sess[];
  const ev = (await db.prepare("SELECT e.sid AS sid, e.kind AS kind, e.name AS name, e.path AS path FROM visit_event e JOIN visit_session s ON s.sid=e.sid WHERE s.first_ms>=? AND s.first_ms<? AND s.is_bot=0 AND s.is_test=? AND (e.kind='fn' OR (e.kind='act' AND e.name IN ('pack','start_open')) OR (e.kind='pv' AND e.path='/pay')) LIMIT 200000").bind(from, to, tf).all<{ sid: string; kind: string; name: string | null; path: string | null }>()).results ?? [];
  const stepOf = (e: { kind: string; name: string | null }): string | null => (e.kind === "fn" ? e.name : e.kind === "act" ? (e.name === "pack" ? "size_chosen" : e.name === "start_open" ? "signup_started" : null) : e.kind === "pv" ? "pay_page_opened" : null);
  const has = new Map<string, Set<string>>();
  for (const e of ev) { const s = stepOf(e); if (!s) continue; let x = has.get(e.sid); if (!x) has.set(e.sid, (x = new Set())); x.add(s); }
  const countOf = (xs: Sess[]) => { const c: Record<string, number> = { viewed: xs.length }; for (const s of xs) for (const st of has.get(s.sid) ?? []) c[st] = (c[st] ?? 0) + 1; return c; };
  const bucket = (key: (s: Sess) => string | null | undefined) => { const m = new Map<string, Sess[]>(); for (const s of sess) { const k = key(s); if (!k) continue; const a = m.get(k); if (a) a.push(s); else m.set(k, [s]); } return m; };
  const periods = (key: (s: Sess) => string) => [...bucket(key).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([period, xs]) => ({ period, rows: funnelRows(countOf(xs)) }));
  const split = (key: (s: Sess) => string | null | undefined, top = 15) => [...bucket(key).entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1)).slice(0, top).map(([k, xs]) => { const c = countOf(xs); return { k, viewed: c.viewed ?? 0, published: c.game_published ?? 0, paid: c.pay_succeeded ?? 0 }; });
  return {
    from, to, mode: test ? "test" : "live", total: funnelRows(countOf(sess)), days: periods((s) => dayOf(s.first_ms)), weeks: periods((s) => weekOf(s.first_ms)),
    sources: split((s) => s.utm_source || s.src || "direct"), campaigns: split((s) => s.utm_campaign), devices: split((s) => s.device), countries: split((s) => s.country),
    note: "One step is counted once per organizer visit, against the visit's first day. A visitor with Global Privacy Control or Do Not Track is not in these numbers. Country level only.",
  };
}
const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** The same report as CSV: scope (total, day or week), the period, the step, its count, and the two percentages. */
export function funnelCsv(r: Awaited<ReturnType<typeof funnelReport>>): string {
  const L = ["scope,period,step,label,count,percent_of_previous,percent_of_first"];
  const add = (scope: string, period: string, rows: FunRow[]) => { for (const x of rows) L.push([scope, period, x.step, q(x.label), x.count, x.ofPrevious ?? "", x.ofFirst ?? ""].join(",")); };
  add("total", "all", r.total); for (const d of r.days) add("day", d.period, d.rows); for (const w of r.weeks) add("week", w.period, w.rows);
  return L.join("\n") + "\n";
}
