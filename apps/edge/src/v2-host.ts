// V2 items 7 and 11.
// 7 (O08): the organizer makes a Host key WITHOUT typing the Host's e-mail or mobile number and without a person confirming them. It is kept safe: ONE game, the narrow Host rights (watch, tell everyone,
//    hand over prizes, claim review, support, receipts without payment secrets), no paying, cancelling, erasing, cloning, team or keys, and it stops 24 hours after the game ends (scope gate, v2-keys.ts).
// 11 (H18, H25) (default until the owner decides): a Host can STEP DOWN (retires their own key and tells the organizer); the organizer can ASSIGN someone else; a Host can ASK for a hand-over, and during a live
//    game the hand-over happens only when the organizer approves (the old key is retired and a new limited Host key is shown once to the organizer).
import { teamEmails } from "./credit";
import { sendMail, type PayEnv } from "./pay";
import { cleanText, randHex, sha, type V2Ctx } from "./v2-types";
import { gameEndMs } from "./v2-keys";

const MAX_HOSTS = 5;

const accountOrGameMaster = (c: V2Ctx, org: string | null) => c.a.kind === "master" && c.a.scopeKind !== "ga" && !!c.a.org && c.a.org === org;

/** Makes the Host key (no personal data) and returns it once. */
async function makeLabelHost(c: V2Ctx, eid: string, org: string, label: string): Promise<{ key: string; id: string }> {
  const key = "cth_" + randHex(24), kh = await sha("key|" + key), db = c.env.DB, now = c.now;
  await db.batch([
    db.prepare("INSERT INTO organizer_key(hash,org,kind,revoked,created_ms,is_test,label,email_sealed,pii,created_by,host_id,scope_eid,scope_kind) VALUES(?,?,?,0,?,COALESCE((SELECT MAX(k2.is_test) FROM organizer_key k2 WHERE k2.org=?),0),?,NULL,NULL,'o',?,?,'lh')").bind(kh, org, "host", now, org, label, kh, eid),
    db.prepare("INSERT INTO host_state(host_id,org,email_hash,verified_ms,pend_hash,pend_sealed,link_exp_ms,spent,mobile_ok) VALUES(?,?,NULL,?,NULL,NULL,?,0,1)").bind(kh, org, now, now),
  ]);
  return { key, id: kh.slice(0, 10) };
}
/** The Host keys made without personal data for THIS game (at most five at a time). They never use one of the account's five Host places, and an old game's keys never block a new game. */
const activeHosts = async (c: V2Ctx, eid: string): Promise<number> => (await c.env.DB.prepare("SELECT COUNT(*) AS c FROM organizer_key WHERE scope_eid=? AND scope_kind='lh' AND revoked=0").bind(eid).first<{ c: number }>())?.c ?? 0;

async function tell(c: V2Ctx, org: string, eid: string, kind: string, text: string): Promise<void> {
  await c.env.DB.prepare("INSERT INTO v2_notice(org,eid,kind,text,at_ms) VALUES(?,?,?,?,?)").bind(org, eid, kind, text, c.now).run();
  try { const to = (await teamEmails(c.env as PayEnv, org, eid)).organizer; if (to) await sendMail(c.env as PayEnv, c.env.DB, to, `Your game ${eid}: ${kind === "stepdown" ? "a Host stepped down" : "a Host asks for a hand-over"}`, `${text}\n\nOpen the game in your organizer screen to choose a new Host.`, c.now); } catch { /* the notice in the screen stands */ }
}

export async function hostRoute(c: V2Ctx, eid: string, rest: string): Promise<Response> {
  const { a, req, env, now, json } = c;
  const db = env.DB;
  const e: any = await db.prepare("SELECT * FROM engagement WHERE id=?").bind(eid).first();
  if (!e) return json({ error: "No such engagement." }, 404);
  const sameOrg = !!a.org && a.org === e.org;
  const label = (c0: string) => cleanText(c0, 40);

  // ---- 7: make a Host key without personal data (the organizer, or a game master key; never an AI key)
  if (req.method === "POST" && rest === "") {
    if (!accountOrGameMaster(c, e.org) || (a.scopeEid && a.scopeEid !== eid)) return json({ error: "Only the organizer (or their game key) can make a Host key.", code: "not-allowed" }, 403);
    if (a.viaLink) return json({ error: "A person makes Host keys, not an AI link.", code: "not-allowed" }, 403);
    if ((await gameEndMs(env, e, now)) !== null) return json({ error: "This game is over, so a new Host is not needed.", code: "game-over" }, 409);
    if ((await activeHosts(c, eid)) >= MAX_HOSTS) return json({ error: `You can have up to ${MAX_HOSTS} Hosts at a time. Retire one first.`, code: "too-many" }, 409);
    if (!(await c.spend(4))) return c.busy();
    const lab = label((await c.body(req, 256))?.label ?? "");
    const k = await makeLabelHost(c, eid, e.org, lab);
    return json({ ok: true, hostKey: k.key, id: k.id, label: lab, game: eid, link: `${c.origin}/zc.html?k=${k.key}&e=${encodeURIComponent(eid)}`, shownOnce: true, rule: "Works for this game only, for watching, messages to everyone and handing over prizes. Stops 24 hours after the game ends. No e-mail or mobile number is kept for this Host." });
  }

  // ---- 11a: a Host steps down
  if (req.method === "POST" && rest === "stepdown") {
    if (a.kind !== "host" || !sameOrg || a.viaLink) return json({ error: "Only a Host can step down.", code: "not-allowed" }, 403);
    if (a.scopeEid && a.scopeEid !== eid) return json({ error: "This Host key is for another game.", code: "key-scope" }, 403);
    const hid = a.hid ?? a.kh;
    if (!hid) return json({ error: "Not allowed." }, 403);
    await db.prepare("UPDATE organizer_key SET revoked=1 WHERE hash=? OR host_id=?").bind(hid, hid).run();
    const who = (a.label ?? "").trim() || "A Host";
    await tell(c, e.org, eid, "stepdown", `${who} has stepped down (asked from game ${eid}). Every key this Host held on your account no longer works; make a new Host key for any game they were to look after.`);
    return json({ ok: true, message: "You have stepped down. Your Host key, for every game on this account, no longer works. The organizer has been told." });
  }

  // ---- 11b: a Host asks for a hand-over (the organizer decides)
  if (req.method === "POST" && rest === "handover") {
    if (a.kind !== "host" || !sameOrg || a.viaLink) return json({ error: "Only a Host can ask for a hand-over.", code: "not-allowed" }, 403);
    if (a.scopeEid && a.scopeEid !== eid) return json({ error: "This Host key is for another game.", code: "key-scope" }, 403);
    const hid = a.hid ?? a.kh!;
    if (await db.prepare("SELECT 1 AS x FROM v2_handover WHERE eid=? AND host_id=? AND state='pending'").bind(eid, hid).first()) return json({ error: "You have already asked. The organizer has been told.", code: "already" }, 409);
    if (!(await c.spend(3))) return c.busy();
    const note = cleanText((await c.body(req, 512))?.note, 200);
    await db.prepare("INSERT INTO v2_handover(eid,org,host_id,label,note,state,created_ms) VALUES(?,?,?,?,?,'pending',?)").bind(eid, e.org, hid, a.label ?? "", note, now).run();
    await tell(c, e.org, eid, "handover", `${(a.label ?? "").trim() || "A Host"} asks to hand over the Host job of game ${eid}${note ? ": " + note : ""}. The Host keeps working until you approve.`);
    return json({ ok: true, state: "pending", message: "The organizer has been asked. You keep your key until they approve." });
  }

  // ---- 11c: the organizer sees and decides
  if (req.method === "GET" && rest === "requests") {
    if (!accountOrGameMaster(c, e.org) && !(a.kind === "host" && sameOrg)) return json({ error: "Not allowed.", code: "not-allowed" }, 403);
    const own = a.kind === "host";
    const rows = ((await db.prepare(`SELECT id, label, note, state, created_ms, decided_ms FROM v2_handover WHERE eid=?${own ? " AND host_id=?" : ""} ORDER BY id DESC LIMIT 50`).bind(...(own ? [eid, a.hid ?? a.kh] : [eid])).all<any>()).results ?? []);
    const notices = own ? [] : ((await db.prepare("SELECT kind, text, at_ms FROM v2_notice WHERE org=? AND eid=? ORDER BY id DESC LIMIT 20").bind(e.org, eid).all<any>()).results ?? []);
    return json({ requests: rows.map((r: any) => ({ id: r.id, host: r.label, note: r.note, state: r.state, askedMs: r.created_ms, decidedMs: r.decided_ms })), notices: notices.map((n: any) => ({ kind: n.kind, text: n.text, atMs: n.at_ms })) });
  }
  const dm = rest.match(/^requests\/(\d{1,9})$/);
  if (req.method === "POST" && dm) {
    if (!accountOrGameMaster(c, e.org) || (a.scopeEid && a.scopeEid !== eid) || a.viaLink) return json({ error: "Only the organizer decides on a hand-over.", code: "not-allowed" }, 403);
    const r: any = await db.prepare("SELECT * FROM v2_handover WHERE id=? AND eid=?").bind(Number(dm[1]), eid).first();
    if (!r) return json({ error: "No such request.", code: "not-found" }, 404);
    if (r.state !== "pending") return json({ error: "That request was already decided.", code: "decided" }, 409);
    const b = await c.body(req, 256);
    if (b?.approve !== true) { await db.prepare("UPDATE v2_handover SET state='declined', decided_ms=? WHERE id=?").bind(now, r.id).run(); return json({ ok: true, state: "declined" }); }
    if ((await gameEndMs(env, e, now)) !== null) return json({ error: "This game is over, so a new Host is not needed.", code: "game-over" }, 409);
    if (!(await c.spend(4))) return c.busy();
    await db.prepare("UPDATE organizer_key SET revoked=1 WHERE hash=? OR host_id=?").bind(r.host_id, r.host_id).run(); // the old Host is retired first (so the 5-Host limit is never in the way)
    const k = await makeLabelHost(c, eid, e.org, label(b?.label ?? "") || (r.label ? `${r.label} (new)` : ""));
    await db.prepare("UPDATE v2_handover SET state='approved', decided_ms=? WHERE id=?").bind(now, r.id).run();
    return json({ ok: true, state: "approved", note: "The old Host's keys on this account no longer work. The new key is for this game only.", hostKey: k.key, id: k.id, game: eid, link: `${c.origin}/zc.html?k=${k.key}&e=${encodeURIComponent(eid)}`, shownOnce: true });
  }
  return json({ error: "Not found" }, 404);
}
