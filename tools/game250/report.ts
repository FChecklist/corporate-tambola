// Writes docs/250x10/RESULTS.md from docs/250x10/data/game01..10.json (bun run tools/game250/report.ts). Nothing is typed by hand into the tables.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Rec } from "./engine";

const dir = "docs/250x10/data";
const recs: Rec[] = readdirSync(dir).filter((f) => /^game\d+\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
const fmt = (x: unknown) => (x === undefined || x === null ? "-" : typeof x === "object" ? "`" + JSON.stringify(x).replace(/\|/g, "/") + "`" : String(x).replace(/\|/g, "/"));
const row = (a: string, b: unknown) => `| ${a} | ${fmt(b)} |`;
const tbl = (rows: [string, unknown][]) => ["| What | Result |", "|---|---|", ...rows.map(([a, b]) => row(a, b))].join("\n");
const pass = (cs: { ok: boolean }[]) => `${cs.filter((c) => c.ok).length}/${cs.length}`;

let md = `# 250 players x 10 games: results

Run on **${new Date().toISOString().slice(0, 10)}** in the local test environment: the real Worker code (\`apps/edge\`) on an in-memory SQLite stand-in for D1, 250 real phone runtimes per game (the same code the phone page runs), a fake public beacon in virtual time (one step = one 3-second beacon round).
**No production, no real payment, no real mail.** The games are made by the owner's test account (\`demo1@xyz.in\` with the runner key = the owner "test price" of Rs 0 up to 1,000 people). Mail goes to the \`outbox\` table (or, in game 9, to a stand-in for the mail provider).
How to run: \`bun run tools/game250/run.ts all\` (or \`3\`, \`5,6\`), then \`bun run tools/game250/report.ts\`. Code: \`tools/game250/\`. Raw data: \`docs/250x10/data/game01.json\` ... \`game10.json\`.

**How to read the "CPU / memory" rows.** The Worker and the 250 phones run in one process here. "Peak memory" is therefore the whole test process (the phones are most of it), not the Worker. "Request CPU" taken during the crowd includes the phones' own work that runs between two awaits, so it is an upper bound; the "isolated" figures (games 1 and 3) are the same routes one at a time on a quiet process, and are the honest ones. Cloudflare's free plan allows 10 ms of CPU per request (docs/IMPLEMENTATION.md); in-process SQLite is counted here but D1's network wait is not.

`;
md += `## Summary\n\n| # | Game | Players joined | Prizes | Checks passed | Fairness checks passed | Errors (non-2xx) | Store writes (of 80,000/day) |\n|---|---|---|---|---|---|---|---|\n`;
for (const r of recs) {
  const err = Object.entries((r.errors as any).byStatus ?? {}).filter(([k]) => k !== "200").map(([k, v]) => `${k}:${v}`).join(" ");
  md += `| ${r.game} | ${r.title} | ${(r.players as any).joined}/${r.target} | ${r.prizes.length} | ${pass(r.checks)} | ${pass(r.fairness)} | ${err || "none"} | ${(r.limits as any).storeWrites} (${(r.limits as any).writeBudgetPct}%) |\n`;
}
md += "\n";
for (const r of recs) {
  const t = r.timings as any, l = r.limits as any, p = r.players as any, cl = r.claims as any, e = r.extra as any;
  md += `## Game ${r.game}: ${r.title}\n\nGame id \`${r.id}\`. Mode: ${r.mode}.\n\n`;
  md += tbl([
    ["Players joined", `${p.joined} of ${p.target} (not joined: ${p.notJoined}; join retries: ${p.joinRetries})`],
    ["First / last player joined at (virtual minutes after the game was made)", `${p.firstJoinAtSimMin} / ${p.lastJoinAtSimMin}`],
    ["Players checked in (present check)", p.checkedIn],
    ["Join refusals seen", p.joinErrors],
    ["Claims stored", cl.stored],
    ["Claim requests answered too late (409)", cl.claimRequestsAnsweredTooLate409],
    ["Claims by house", cl.byPattern],
    ["Wrong claims (Bogeys)", cl.bogeys],
    ["Phones that pressed Claim", cl.phonesPressedClaim],
    ["Prizes published", `${r.prizes.length}: ` + r.prizes.map((x: any) => `${x.pattern}#${x.ordinal}@${x.call}${x.winners > 1 ? "x" + x.winners : ""}`).join(", ")],
    ["Numbers called", t.numbersCalled],
    ["First number at (virtual minutes after the game was made)", t.firstNumberAtSimMin],
    ["Game length, first number to all phones ended (virtual minutes)", t.simulatedGameMinutes],
    ["Test run length (real seconds)", l.wallSec],
    ["Requests to the Worker", l.requests],
    ["Outbound network requests made by the test (must be 0)", l.outboundNetworkRequests],
    ["Responses other than 200", (r.errors as any).byStatus],
    ["Requests over 10 ms CPU (in the crowd, upper bound) / over 50 ms", `${l.reqOver10msCpu} / ${l.reqOver50msCpu} of ${l.requests}`],
    ["Slowest request CPU in the crowd (ms, upper bound)", l.maxReqCpuMs],
    ["Isolated request CPU, ms (p50/p95/max)", l.isolatedCpuMs ? Object.fromEntries(Object.entries(l.isolatedCpuMs).map(([k, v]: any) => [k, `${v.p50}/${v.p95}/${v.max}`])) : "not measured in this game (see games 1 and 3)"],
    ["Process CPU for the whole run (s) / peak memory (MB, whole test process)", `${l.cpuSec} / ${l.rssPeakMB}`],
    ["Store writes", `${l.storeWrites} = ${l.writeBudgetPct}% of the 80,000 a day the Worker allows itself (the free D1 plan is 100,000)`],
  ]) + "\n\n";
  const extra = Object.fromEntries(Object.entries(e).filter(([k]) => !["publicResults", "groundTruthPrizes", "logAgreement", "samples", "ticks", "stateTimeline", "createAnswer", "calledNumbers", "participantsInStore"].includes(k)));
  if (Object.keys(extra).length) md += "Game-specific measurements:\n\n" + tbl(Object.entries(extra).map(([k, v]) => [k, v] as [string, unknown])) + "\n\n";
  if (e.stateTimeline) md += "Data held over time:\n\n| When after the end | Players held | Seats with a number | List rows | Check-ins | Claims | Prize rows | Report parts | Audit (personal) | Game rows | Settings record |\n|---|---|---|---|---|---|---|---|---|---|---|\n" + e.stateTimeline.map((s: any) => `| ${s.label} (${s.atH} h) | ${s.participants} | ${s.seats_with_ph} | ${s.people_list} | ${s.checkins} | ${s.claims} | ${s.prizeRows} | ${s.reportChunks} | ${s.auditPii} | ${s.engagement} | ${s.gameRecord} |`).join("\n") + "\n\n";
  md += "Fairness checks (nobody could predict or alter the numbers):\n\n| Check | Result | Detail |\n|---|---|---|\n" + r.fairness.map((c) => `| ${c.name} | ${c.ok ? "PASS" : "**FAIL**"} | ${c.ok ? "" : c.detail.replace(/\|/g, "/")} |`).join("\n") + "\n\n";
  md += "Game checks:\n\n| Check | Result | Detail |\n|---|---|---|\n" + r.checks.map((c) => `| ${c.name} | ${c.ok ? "PASS" : "**FAIL**"} | ${c.ok ? c.detail.slice(0, 160).replace(/\|/g, "/") : c.detail.replace(/\|/g, "/")} |`).join("\n") + "\n\n";
  const samples = ((r.errors as any).samples ?? []).filter((s: any) => s.status !== 404 || !/numbers|call|draw|log|calls|seed|rig/.test(s.route));
  if (samples.length) md += "Errors the Worker answered (grouped):\n\n| Status | Route | Message | Count |\n|---|---|---|---|\n" + samples.slice(0, 12).map((s: any) => `| ${s.status} | ${s.route} | ${String(s.msg).replace(/\|/g, "/")} | ${s.n} |`).join("\n") + "\n\n";
  if (r.notes.length) md += "Notes: " + r.notes.join("; ") + "\n\n";
}
if (existsSync("docs/250x10/FINDINGS.md")) md += "\n" + readFileSync("docs/250x10/FINDINGS.md", "utf8") + "\n";
writeFileSync("docs/250x10/RESULTS.md", md);
console.log("wrote docs/250x10/RESULTS.md", md.length, "bytes");
