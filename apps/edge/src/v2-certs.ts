// V2 item 3 (G40): winner certificates. Default (privacy-safe) reading of the owner's note "winner name, mobile, e-mail ID, game id, ticket number ... chain link":
//  - the certificate the organizer downloads shows the winner's name or ID (ONLY while the game still holds it: before the 24-hour deletion; afterwards "Ticket No. N"), game id, ticket number, prize and line, round, date and a verification link;
//  - mobile number and e-mail are NEVER on it and are never copied into this table;
//  - the verification record is signed (HMAC) and hash-chained per game, and keeps only NON-PERSONAL fields (no name, no mobile, no e-mail, no game name).
// Anyone can check a certificate at /verify.html?c=<id> (API: GET /api/v2/verify/<id>).
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";
import { openPii } from "./pii";
import { sha, randHex, type V2Ctx } from "./v2-types";

const HOUSE: Record<string, string> = Object.fromEntries(PRIZE_HOUSES.map((h) => [h.id, h.label]));
const ord = (n: number) => ["", "1st", "2nd", "3rd"][n] ?? `${n}th`;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));

/** "Early Five", "2nd Full House", "Lucky draw": the same house names the game uses. */
export function prizeName(pattern: string, ordinal: number, multi: boolean): string {
  const base = pattern === "lucky" ? "Lucky draw" : /^[a-z0-9]+@2$/.test(pattern) ? `${HOUSE[pattern.split("@")[0]!] ?? pattern.split("@")[0]} (two tickets)` : HOUSE[pattern] ?? pattern;
  return (multi || ordinal > 1 ? ord(ordinal) + " " : "") + base;
}

const secretOf = (env: any): string => String(env.DATA_KEY || env.ORGANIZER_SECRET || "");
async function hmac(env: any, text: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode("v2cert|" + secretOf(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, "0")).join("");
}
const canon = (r: { id: string; eid: string; seq: number; round: number; pattern: string; ordinal: number; ticket: number; prize: string; issued_ms: number; prev: string }) =>
  [r.id, r.eid, r.seq, r.round, r.pattern, r.ordinal, r.ticket, r.prize, r.issued_ms, r.prev].join("|");
const genesis = (eid: string) => sha("v2cert-genesis|" + eid);

interface CertRow { id: string; eid: string; seq: number; round: number; pattern: string; ordinal: number; ticket: number; prize: string; issued_ms: number; prev: string; hash: string; sig: string }

/** Is this game's whole chain intact up to `upTo` (links, hashes and signatures)? */
async function chainOk(env: any, rows: CertRow[], upTo: number): Promise<boolean> {
  let prev = await genesis(rows[0]?.eid ?? "");
  for (const r of rows) {
    if (r.seq > upTo) break;
    if (r.prev !== prev || r.hash !== (await sha(canon(r))) || r.sig !== (await hmac(env, r.hash))) return false;
    prev = r.hash;
  }
  return true;
}

const isAiCall = (c: V2Ctx) => c.a.kind === "ai" || c.a.scopeKind === "ga" || !!c.req.headers.get("x-ai-model");
const mayUse = (c: V2Ctx, org: string | null) => c.a.plat || (!!c.a.org && c.a.org === org && (c.a.kind === "master" || c.a.scopeKind === "ga"));

export async function certsRoute(c: V2Ctx, eid: string, rest: string): Promise<Response> {
  const { a, req, env, now, json } = c;
  const e: any = await env.DB.prepare("SELECT * FROM engagement WHERE id=?").bind(eid).first();
  if (!e) return json({ error: "No such engagement." }, 404);
  if (!mayUse(c, e.org)) return json({ error: "Certificates are made and downloaded by the organizer.", code: "not-allowed" }, 403);
  let cfg: any = {}; try { cfg = JSON.parse(e.config ?? "{}"); } catch { /* defaults */ }
  const rewards: any[] = Array.isArray(cfg.rewards) ? cfg.rewards : [];
  const winners = ((await env.DB.prepare("SELECT round, pattern, ordinal, seat FROM winner WHERE eid=? ORDER BY round, pattern, ordinal, seat").bind(eid).all<any>()).results ?? []) as { round: number; pattern: string; ordinal: number; seat: number }[];
  const multiOf = (pattern: string) => rewards.filter((r) => r?.pattern === pattern).length > 1;
  const rejected = new Set(((await env.DB.prepare("SELECT round, pattern, ticket FROM v2_claim_review WHERE eid=? AND decision='reject'").bind(eid).all<any>()).results ?? []).map((r: any) => `${r.round}|${r.pattern}|${r.ticket}`));
  const eligible = winners.filter((w) => !rejected.has(`${w.round}|${w.pattern}|${w.seat}`));
  const issued = ((await env.DB.prepare("SELECT * FROM v2_cert WHERE eid=? ORDER BY seq").bind(eid).all<CertRow>()).results ?? []) as CertRow[];

  if (req.method === "POST" && rest === "issue") { // one certificate per winning ticket and prize; running it again changes nothing that exists
    if (!eligible.length) return json({ error: "There are no winners recorded yet, so there are no certificates to make. They can be made once the game's winners are known.", code: "no-winners" }, 409);
    if (!(await c.spend(2 + eligible.length))) return c.busy();
    let made = 0;
    for (const w of eligible) {
      if (issued.find((x) => x.round === w.round && x.pattern === w.pattern && x.ordinal === w.ordinal && x.ticket === w.seat)) continue;
      for (let tries = 0; tries < 4; tries++) {
        const last = (await env.DB.prepare("SELECT seq, hash FROM v2_cert WHERE eid=? ORDER BY seq DESC LIMIT 1").bind(eid).first<{ seq: number; hash: string }>());
        const row = { id: randHex(10), eid, seq: (last?.seq ?? 0) + 1, round: w.round, pattern: w.pattern, ordinal: w.ordinal, ticket: w.seat, prize: prizeName(w.pattern, w.ordinal, multiOf(w.pattern)), issued_ms: now, prev: last?.hash ?? (await genesis(eid)) };
        const hash = await sha(canon(row)), sig = await hmac(env, hash);
        const r = await env.DB.prepare("INSERT OR IGNORE INTO v2_cert(id,eid,seq,round,pattern,ordinal,ticket,prize,issued_ms,prev,hash,sig) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(row.id, eid, row.seq, row.round, row.pattern, row.ordinal, row.ticket, row.prize, row.issued_ms, row.prev, hash, sig).run();
        if ((r.meta?.changes ?? 0) > 0) { made++; issued.push({ ...row, hash, sig }); break; }
        if (await env.DB.prepare("SELECT 1 AS x FROM v2_cert WHERE eid=? AND round=? AND pattern=? AND ordinal=? AND ticket=?").bind(eid, w.round, w.pattern, w.ordinal, w.seat).first()) break; // another call made it first
      }
    }
    return json({ ok: true, made, total: (await env.DB.prepare("SELECT COUNT(*) AS c FROM v2_cert WHERE eid=?").bind(eid).first<{ c: number }>())?.c ?? 0 });
  }
  const mine = (r: CertRow) => ({ id: r.id, ticket: r.ticket, prize: r.prize, round: r.round, issuedMs: r.issued_ms, position: r.seq, verifyUrl: `${c.origin}/verify.html?c=${r.id}`, downloadUrl: `${c.origin}/api/z/${eid}/v2/certs/${r.id}.html` });
  if (req.method === "GET" && rest === "") {
    const todo = eligible.filter((w) => !issued.find((x) => x.round === w.round && x.pattern === w.pattern && x.ordinal === w.ordinal && x.ticket === w.seat)).length;
    return json({ game: eid, certificates: issued.map(mine), notYetMade: todo, note: "A certificate shows the winner's name only while the game still holds it (it is deleted within 24 hours after the game). The verification record never holds a name, mobile number or e-mail." });
  }
  if (req.method === "GET" && rest === "csv") {
    const csv = ["certificate,ticket,prize,round,issued,verify"].concat(issued.map((r) => [r.id, r.ticket, `"${r.prize.replace(/"/g, '""')}"`, r.round, new Date(r.issued_ms).toISOString(), `${c.origin}/verify.html?c=${r.id}`].join(","))).join("\n") + "\n";
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="certificates-${eid}.csv"`, "cache-control": "no-store" } });
  }
  const dm = rest.match(/^([0-9a-f]{20})\.html$/);
  if (req.method === "GET" && dm) {
    const r = issued.find((x) => x.id === dm[1]);
    if (!r) return json({ error: "No such certificate.", code: "not-found" }, 404);
    let who = "";
    if (!isAiCall(c)) { // names only for a person's screen, never for an AI-labelled call, and only while the game still holds them
      const p = await env.DB.prepare("SELECT p.pii AS pii FROM seat s JOIN participant p ON p.eid=s.eid AND p.pid=s.pid WHERE s.eid=? AND s.seq=?").bind(eid, r.ticket).first<{ pii: string | null }>();
      const pi = p?.pii ? await openPii(env as any, p.pii) : null;
      who = (pi?.name || pi?.empId || "").trim();
    }
    const reward = rewards.find((x) => x?.pattern === r.pattern && Number(x?.ordinal ?? 1) === r.ordinal)?.text;
    const html = certificateHtml({ who, ticket: r.ticket, prize: r.prize, reward: reward ? String(reward) : "", gameId: eid, gameName: String(cfg.name ?? ""), issued: r.issued_ms, url: `${c.origin}/verify.html?c=${r.id}`, id: r.id });
    const h: Record<string, string> = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
    if (c.url.searchParams.get("download") === "1") h["content-disposition"] = `attachment; filename="certificate-${eid}-ticket-${r.ticket}.html"`;
    return new Response(html, { headers: h });
  }
  return json({ error: "Not found" }, 404);
}

function certificateHtml(o: { who: string; ticket: number; prize: string; reward: string; gameId: string; gameName: string; issued: number; url: string; id: string }): string {
  const day = new Date(o.issued + 19_800_000).toISOString().slice(0, 10);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Certificate: ${esc(o.prize)}</title><style>body{font-family:Georgia,serif;margin:0;padding:24px;background:#fff;color:#1a2233}.c{max-width:760px;margin:0 auto;border:6px double #c9a24a;padding:40px;text-align:center}h1{margin:0 0 6px;font-size:2rem;color:#0b3d91}.w{font-size:1.9rem;margin:18px 0;border-bottom:1px solid #c9a24a;display:inline-block;padding:0 24px}p{margin:8px 0;font-size:1.05rem}.s{font-size:.8rem;color:#555;margin-top:26px;word-break:break-all}</style></head><body><div class="c"><h1>Certificate of winning</h1><p>${o.gameName ? esc(o.gameName) + " &middot; " : ""}Game ${esc(o.gameId)}</p><p>This certifies that</p><div class="w">${o.who ? esc(o.who) : "Ticket No. " + o.ticket}</div><p>${o.who ? "holding Ticket No. " + o.ticket + " " : ""}won <b>${esc(o.prize)}</b>${o.reward ? " (" + esc(o.reward) + ")" : ""}</p><p>${esc(day)}</p><p class="s">Check that this certificate is real: ${esc(o.url)}<br>Certificate ${esc(o.id)}</p></div></body></html>`;
}

/** GET /api/v2/verify/{id}: PUBLIC. Says only what the record holds, which is nothing personal. */
export async function verifyRoute(c: V2Ctx, id: string): Promise<Response> {
  const { env, json } = c;
  const r = await env.DB.prepare("SELECT * FROM v2_cert WHERE id=?").bind(id).first<CertRow>();
  if (!r) return json({ valid: false, error: "No certificate with this number.", code: "unknown" }, 404);
  const rows = ((await env.DB.prepare("SELECT * FROM v2_cert WHERE eid=? ORDER BY seq").bind(r.eid).all<CertRow>()).results ?? []) as CertRow[];
  const ok = await chainOk(env, rows, r.seq);
  return json({ valid: ok, certificate: r.id, game: r.eid, ticket: r.ticket, prize: r.prize, round: r.round, issuedMs: r.issued_ms, position: r.seq, ofTotal: rows.length, hash: r.hash, previous: r.prev, ...(ok ? {} : { error: "This record does not match its chain." }) });
}
