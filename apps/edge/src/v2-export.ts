// V2 item 4 (G41, O23): the organizer downloads the game's data (results, winners, tickets, payments), by key and by screen.
// The 24-hour promise is kept: names appear only while the game still holds them (they are deleted within 24 hours after the game) and only for a person's call; an AI-labelled call gets ticket numbers only.
// After the deletion the file says so plainly (personalDataDeleted: true) and the ticket list is empty.
import { openPii } from "./pii";
import { receiptRows } from "./v2-receipts";
import { prizeName } from "./v2-certs";
import { PAYEE, type V2Ctx } from "./v2-types";

const PARTS = new Set(["all", "results", "winners", "tickets", "payments"]);
const NAMES_MAX = 3000;
/** A spreadsheet runs a cell that starts with = + - @ as a formula: never let a typed name do that. */
const cell = (v: unknown): string => { let s = v === null || v === undefined ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows: Record<string, unknown>[]): string => { const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))); return [cols.join(",")].concat(rows.map((r) => cols.map((k) => cell(r[k])).join(","))).join("\n") + "\n"; };

const isAiCall = (c: V2Ctx) => c.a.kind === "ai" || c.a.scopeKind === "ga" || !!c.req.headers.get("x-ai-model");

export async function exportRoute(c: V2Ctx, eid: string): Promise<Response> {
  const { a, req, env, json, url } = c;
  if (req.method !== "GET") return json({ error: "Not found" }, 404);
  const e: any = await env.DB.prepare("SELECT * FROM engagement WHERE id=?").bind(eid).first();
  if (!e) return json({ error: "No such engagement." }, 404);
  if (!(a.plat || (a.org && a.org === e.org && (a.kind === "master" || a.scopeKind === "ga")))) return json({ error: "Only the organizer can download the game's data.", code: "not-allowed" }, 403);
  const part = url.searchParams.get("part") ?? "all", format = url.searchParams.get("format") ?? "json";
  if (!PARTS.has(part)) return json({ error: "part must be all, results, winners, tickets or payments.", code: "bad-part" }, 400);
  if (format !== "json" && format !== "csv") return json({ error: "format must be json or csv.", code: "bad-format" }, 400);
  if (format === "csv" && part === "all") return json({ error: "A spreadsheet file holds one part at a time: ask for part=results, winners, tickets or payments.", code: "csv-one-part" }, 400);
  let cfg: any = {}; try { cfg = JSON.parse(e.config ?? "{}"); } catch { /* defaults */ }
  const rewards: any[] = Array.isArray(cfg.rewards) ? cfg.rewards : [];
  const life = await env.DB.prepare("SELECT end_ms, purged_ms FROM life WHERE eid=?").bind(eid).first<{ end_ms: number | null; purged_ms: number | null }>();
  const personalDeleted = !!life?.purged_ms;
  const ai = isAiCall(c);
  const names = !ai && !personalDeleted;

  const win = ((await env.DB.prepare("SELECT round, pattern, ordinal, seat FROM winner WHERE eid=? ORDER BY round, pattern, ordinal, seat").bind(eid).all<any>()).results ?? []) as { round: number; pattern: string; ordinal: number; seat: number }[];
  const multi = (pattern: string) => rewards.filter((r) => r?.pattern === pattern).length > 1;
  const whoCache = new Map<number, string>();
  let opened = 0;
  const who = async (seat: number): Promise<string> => {
    if (!names || opened >= NAMES_MAX) return "";
    if (whoCache.has(seat)) return whoCache.get(seat)!;
    opened++;
    const p = await env.DB.prepare("SELECT p.pii AS pii FROM seat s JOIN participant p ON p.eid=s.eid AND p.pid=s.pid WHERE s.eid=? AND s.seq=?").bind(eid, seat).first<{ pii: string | null }>();
    const pi = p?.pii ? await openPii(env as any, p.pii) : null;
    const v = (pi?.name || pi?.empId || "").trim(); whoCache.set(seat, v); return v;
  };
  const winnersRows = async () => { const out: Record<string, unknown>[] = []; for (const w of win) out.push({ round: w.round, prize: prizeName(w.pattern, w.ordinal, multi(w.pattern)), reward: rewards.find((x) => x?.pattern === w.pattern && Number(x?.ordinal ?? 1) === w.ordinal)?.text ?? "", ticket: w.seat, ...(names ? { name: await who(w.seat) } : {}) }); return out; };
  const ticketRows = async () => {
    const seats = ((await env.DB.prepare("SELECT s.seq AS seq, s.role AS role, s.blocked AS blocked, s.src AS src, p.joined_ms AS joined_ms, p.pii AS pii FROM seat s LEFT JOIN participant p ON p.eid=s.eid AND p.pid=s.pid WHERE s.eid=? ORDER BY s.seq LIMIT 20000").bind(eid).all<any>()).results ?? []) as any[];
    const out: Record<string, unknown>[] = [];
    for (const s of seats) {
      const pi = names && s.pii && out.length < NAMES_MAX ? await openPii(env as any, s.pii) : null;
      out.push({ ticket: s.seq, joinedMs: s.joined_ms ?? null, role: s.role ?? "", removed: s.blocked ? "yes" : "", ...(names ? { name: (pi?.name || pi?.empId || "") } : {}) });
    }
    return out;
  };
  const gameRow = { id: eid, name: cfg.name ?? "", startMs: Math.round((1692803367 + (e.start_round - 1) * 3) * 1000), cap: e.cap, tickets: e.tickets, rounds: cfg.rounds ?? 1, cancelled: !!e.cancelled_ms, endedMs: life?.end_ms ?? null };
  const payments = async () => receiptRows(c, eid, String(cfg.name ?? ""), !ai && a.scopeKind !== "ga");
  const note = personalDeleted ? "The names and numbers of this game's players were deleted (within 24 hours after the game, as promised). Results, winners by ticket number and payments remain." : ai ? "This request was made by an AI: names and numbers are left out; ticket numbers only." : "Names are shown only while the game still holds them; they are deleted within 24 hours after the game.";

  let payload: any, rows: Record<string, unknown>[] = [];
  if (format === "csv") {
    rows = part === "results" ? win.map((w) => ({ round: w.round, prize: prizeName(w.pattern, w.ordinal, multi(w.pattern)), ticket: w.seat })) : part === "winners" ? await winnersRows() : part === "tickets" ? await ticketRows() : (await payments()).map((r: any) => ({ payee: PAYEE, ...r, creditNotes: (r.creditNotes ?? []).join(" "), refund: r.refund ? `${r.refund.amount} ${r.refund.status}` : "", creditNoteUrls: undefined }));
    return new Response(toCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="tambola-${eid}-${part}.csv"`, "cache-control": "no-store" } });
  }
  payload = { game: gameRow, personalDataDeleted: personalDeleted, personalDataIncluded: names, note, generatedMs: c.now };
  if (part === "results" || part === "all") payload.results = win.map((w) => ({ round: w.round, prize: prizeName(w.pattern, w.ordinal, multi(w.pattern)), ticket: w.seat }));
  if (part === "winners" || part === "all") payload.winners = await winnersRows();
  if (part === "tickets" || part === "all") payload.tickets = await ticketRows();
  if (part === "payments" || part === "all") payload.payments = await payments();
  return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="tambola-${eid}-${part}.json"`, "cache-control": "no-store" } });
}
