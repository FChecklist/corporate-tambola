// The numbers a game called, with the clock time of each (read-only, no player data): rebuilt from the game's public settings, its signed pause record and the public
// random-number feed (drand), exactly as every phone does it. Usage: bun run tools/game-numbers.ts <game id> [out file]
// D1 is read with the owner's READ-ONLY token from C:\ct\ct\.env.local. Nothing is written anywhere except the out file.
import { readFileSync, writeFileSync } from "node:fs";
import { cfgOfRow } from "../apps/edge/src/lifecycle";
import { GRACE_ROUNDS } from "../packages/beacon/src/config";
import { callRoundR, hostGameOf } from "../packages/beacon/src/game";
import { cfgOf as controlCfg, resolveControl } from "../packages/beacon/src/control";
import { fetchRound, pickNumber, roundTimeMs } from "../packages/beacon/src";

const eid = process.argv[2]; if (!eid) { console.error("Say which game: bun run tools/game-numbers.ts <game id> [out file]"); process.exit(1); }
const env: Record<string, string> = {};
for (const l of readFileSync("C:/ct/ct/.env.local", "utf8").split(/\r?\n/)) { const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(l); if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, ""); }
const DB = "4a6a1d3f-f1c7-44ac-b0ce-4cebd749a8de";
async function q(sql: string): Promise<any[]> {
  if (!/^\s*select/i.test(sql)) throw new Error("read-only");
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${DB}/query`, { method: "POST", headers: { authorization: "Bearer " + env.CLOUDFLARE_D1_TOKEN, "content-type": "application/json" }, body: JSON.stringify({ sql }) });
  const j: any = await r.json(); return j.success ? j.result[0].results : [];
}
const ist = (ms: number) => new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const e = (await q(`SELECT id, start_round, call_seconds, tickets, config FROM engagement WHERE id='${eid.replace(/[^A-Za-z0-9_-]/g, "")}'`))[0];
if (!e) { console.error("No such game"); process.exit(1); }
const cfg = cfgOfRow(e);
const ctl = (await q(`SELECT v FROM kv WHERE k='control/${e.id}.json'`))[0];
const f = ctl ? JSON.parse(ctl.v) : null;
const st = f ? resolveControl(controlCfg(f, hostGameOf(cfg)), f.messages) : null;
const start = e.start_round + GRACE_ROUNDS, stride = e.call_seconds / 3;
const lines: string[] = [`Game ${e.id}: ${cfg.callMode} play, speed ${e.call_seconds}s, first number planned at ${ist(roundTimeMs(start))}, ${f?.messages?.length ?? 0} control messages (${(f?.messages ?? []).map((m: any) => m.action).join(", ") || "none"})`];
const called: number[] = []; const rows: { k: number; n: number; at: string }[] = [];
for (let k = 0; k < 90; k++) {
  const r = callRoundR(st, start, stride, cfg.breaks, 1, k);
  if (r === null || !Number.isFinite(r)) { lines.push(`(call ${k + 1} onward: not scheduled)`); break; }
  const x = await fetchRound(r, {}); if (!x) { lines.push(`(call ${k + 1}: the public feed does not have round ${r})`); break; }
  const n = pickNumber(e.id, k, x.randomness, called); called.push(n);
  rows.push({ k: k + 1, n, at: ist(roundTimeMs(r)) }); lines.push(`${String(k + 1).padStart(2)}  number ${String(n).padStart(2)}  at ${ist(roundTimeMs(r))}  (beacon round ${r})`);
}
lines.push(`Total numbers called: ${called.length}`);
const out = process.argv[3]; const text = lines.join("\n") + "\n";
if (out) writeFileSync(out, text); console.log(text);
