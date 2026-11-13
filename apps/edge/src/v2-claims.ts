// V2 item 10 (H15) (default until the owner decides): the Host can SEE each claim and approve or reject it with a short reason that the player reads.
// OPTIONAL PER GAME and OFF by default. It sits BESIDE the play path: claims are stored, judged and settled exactly as before; winners stay decided by the software and the public result is unchanged.
// What a rejection does: the reason shows on the player's page, the ticket's PRIZE HAND-OVER is held back (`prizegiven` answers 409 while the claim is rejected), and no certificate is made for it.
// An approval (or a later approval after a rejection) lifts the hold. With no Host action nothing differs from before.
import { seatOfPid } from "../../../packages/beacon/src/unique-ticket";
import { cleanText, type V2Ctx } from "./v2-types";

const PID = /^[0-9]{1,6}x[0-9a-f]{12}$/;
export const reviewOn = async (db: V2Ctx["env"]["DB"], eid: string): Promise<boolean> => !!(await db.prepare("SELECT 1 AS x FROM v2_flag WHERE eid=? AND k='claimreview' AND v='1'").bind(eid).first());

const isHost = (c: V2Ctx) => c.a.kind === "host" && !!c.a.org;
const isOrganizer = (c: V2Ctx) => c.a.plat || (c.a.kind === "master" && !!c.a.org);

export async function claimReviewRoute(c: V2Ctx, eid: string, rest: string): Promise<Response> {
  const { a, req, env, now, json } = c;
  const db = env.DB;
  const e: any = await db.prepare("SELECT id, org FROM engagement WHERE id=?").bind(eid).first();
  if (!e) return json({ error: "No such engagement." }, 404);
  // public: a player reads the notes on their OWN claims (the ticket id is the one their phone already holds)
  if (req.method === "GET" && rest === "note") {
    const pid = c.url.searchParams.get("pid") ?? "";
    if (!PID.test(pid)) return json({ error: "Bad ticket id." }, 400);
    if (!(await reviewOn(db, eid))) return json({ on: false, notes: [] });
    const seat = seatOfPid(pid);
    const rows = seat === null ? [] : ((await db.prepare("SELECT pattern, round, decision, reason FROM v2_claim_review WHERE eid=? AND ticket=? ORDER BY at_ms").bind(eid, seat).all<any>()).results ?? []);
    return json({ on: true, notes: rows.map((r: any) => ({ pattern: r.pattern, round: r.round, decision: r.decision, ...(r.decision === "reject" ? { reason: r.reason ?? "" } : {}) })) });
  }
  const org = a.plat || (a.org && a.org === e.org);
  if (!org || !(isHost(c) || isOrganizer(c))) return json({ error: "Claim review is for the Host and the organizer of this game.", code: "not-allowed" }, 403);
  if (a.kind === "host" && a.scopeEid && a.scopeEid !== eid) return json({ error: "This Host key is for another game.", code: "key-scope" }, 403);
  if (req.method === "POST" && rest === "mode") { // the organizer switches the review on or off for this game
    if (!isOrganizer(c) || a.kind === "ai") return json({ error: "Only the organizer can switch claim review on or off.", code: "not-allowed" }, 403);
    const on = (await c.body(req, 128))?.on === true;
    await db.prepare("INSERT INTO v2_flag(eid,k,v) VALUES(?,'claimreview',?) ON CONFLICT(eid,k) DO UPDATE SET v=excluded.v").bind(eid, on ? "1" : "0").run();
    return json({ ok: true, on });
  }
  if (req.method === "GET" && rest === "") {
    const on = await reviewOn(db, eid);
    const claims = ((await db.prepare("SELECT pid, pattern, round, idx, at_ms FROM claim WHERE eid=? ORDER BY at_ms, pid LIMIT 500").bind(eid).all<any>()).results ?? []) as any[];
    const revs = new Map<string, any>(); for (const r of ((await db.prepare("SELECT round, pattern, ticket, decision, reason, by, at_ms FROM v2_claim_review WHERE eid=?").bind(eid).all<any>()).results ?? []) as any[]) revs.set(`${r.round}|${r.pattern}|${r.ticket}`, r);
    const winners = new Set(((await db.prepare("SELECT round, pattern, seat FROM winner WHERE eid=?").bind(eid).all<any>()).results ?? []).map((w: any) => `${w.round}|${w.pattern}|${w.seat}`));
    return json({ on, claims: claims.map((x) => { const t = seatOfPid(x.pid) ?? 0, k = `${x.round}|${x.pattern}|${t}`, r = revs.get(k); return { ticket: t, pattern: x.pattern, round: x.round, number: x.idx + 1, atMs: x.at_ms, softwareWinner: winners.has(k), review: r ? { decision: r.decision, reason: r.reason ?? "", by: r.by, atMs: r.at_ms } : null }; }) });
  }
  if (req.method === "POST" && rest === "") {
    if (!(await reviewOn(db, eid))) return json({ error: "Claim review is switched off for this game. The organizer can switch it on.", code: "review-off" }, 409);
    if (a.kind === "ai" || a.viaLink) return json({ error: "A person decides on claims, not an AI.", code: "not-allowed" }, 403);
    const b = await c.body(req, 1024);
    const ticket = Number(b?.ticket), pattern = typeof b?.pattern === "string" && /^[a-z0-9]{2,12}(@[12])?$/.test(b.pattern) ? b.pattern : "", round = b?.round === undefined ? 1 : Number(b.round);
    const decision = b?.decision === "approve" || b?.decision === "reject" ? b.decision : "";
    if (!Number.isInteger(ticket) || ticket < 1 || !pattern || !Number.isInteger(round) || round < 1 || !decision) return json({ error: "Say which ticket and prize, and approve or reject.", code: "bad-review" }, 400);
    const reason = cleanText(b?.reason, 120).replace(/\+?\d[\d\s-]{5,}\d/g, "…").trim(); // a long run of digits (a mobile number) is never kept: the note is read by anyone who has the ticket number
    if (decision === "reject" && reason.length < 3) return json({ error: "Please give a short reason; the player will read it. Please write no name and no number.", code: "need-reason" }, 400);
    const has = ((await db.prepare("SELECT pid FROM claim WHERE eid=? AND pattern=? AND round=?").bind(eid, pattern, round).all<any>()).results ?? []).some((r: any) => seatOfPid(r.pid) === ticket);
    if (!has) return json({ error: "There is no such claim to review.", code: "no-claim" }, 404);
    if (!(await c.spend(2))) return c.busy();
    await db.prepare("INSERT INTO v2_claim_review(eid,round,pattern,ticket,decision,reason,by,at_ms) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(eid,round,pattern,ticket) DO UPDATE SET decision=excluded.decision, reason=excluded.reason, by=excluded.by, at_ms=excluded.at_ms").bind(eid, round, pattern, ticket, decision, decision === "reject" ? reason : null, a.kind === "host" ? "host" : "organizer", now).run();
    return json({ ok: true, decision });
  }
  return json({ error: "Not found" }, 404);
}

/** Called for POST /prizegiven before the normal route: a prize whose claim a Host rejected is not handed over until it is approved. Returns a refusal or null. */
export async function prizeHold(c: V2Ctx, eid: string): Promise<Response | null> {
  const db = c.env.DB;
  if (!(await reviewOn(db, eid))) return null;
  const b = await c.body(c.req.clone(), 1024);
  if (!b || b.given !== true || !Number.isInteger(b.seat) || typeof b.pattern !== "string" || !Number.isInteger(b.round)) return null;
  const r = await db.prepare("SELECT reason FROM v2_claim_review WHERE eid=? AND round=? AND pattern=? AND ticket=? AND decision='reject'").bind(eid, b.round, b.pattern, b.seat).first<{ reason: string | null }>();
  return r ? c.json({ error: `A Host did not accept this claim${r.reason ? ": " + r.reason : ""}. Approve it first if you wish to hand over the prize.`, code: "claim-rejected" }, 409) : null;
}
