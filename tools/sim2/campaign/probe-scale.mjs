// Scale probe: one paid game with N phones through tools/sim2/crowd.ts. Prints time, the crowd's summary and the peak memory of the crowd process.  bun tools/sim2/campaign/probe-scale.mjs [phones=1000] [tickets=2] [rounds=1]
import { spawn } from "node:child_process";
import { join } from "node:path";
import { makeFakeRzp } from "./fake-rzp.ts";

const ROOT = join(import.meta.dir, "../../..");
const N = Number(process.argv[2] ?? 1000), TICKETS = Number(process.argv[3] ?? 2), ROUNDS = Number(process.argv[4] ?? 1);
const PORT = Number(process.env.SIM_PORT ?? 8822); process.env.SIM_PORT = String(PORT);
const BUN = process.execPath;
const rz = makeFakeRzp(PORT + 100);
const srv = spawn(BUN, [join(ROOT, "tools/sim2/campaign/server.ts")], { cwd: ROOT, env: { ...process.env, SIM_PORT: String(PORT), CAMP_RZP_BASE: rz.url, CAMP_RZP_KEY: rz.keyId, CAMP_RZP_SECRET: rz.keySecret, CAMP_RZP_HOOK: rz.webhookSecret }, stdio: "ignore", windowsHide: true });
const alive = async () => { try { return (await fetch(`http://localhost:${PORT}/__sim/health`)).ok; } catch { return false; } };
for (let i = 0; i < 100 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 300));
const H = await import("../lib/index.mjs");
const out = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
try {
  await H.clock.freeze();
  const org = await H.Organizer.signUp("sim+probe@example.com");
  const breaks = [{ after: 20, seconds: 30, kind: "speech", title: "Welcome" }, { after: 45, seconds: 30, kind: "lucky", title: "Lucky draw 1", winners: 5, style: "draw" }, { after: 70, seconds: 30, kind: "lucky", title: "Lucky draw 2", winners: 3, style: "scratch" }];
  const g = await org.createGame({ leadMs: 3 * H.HOUR, cfg: { cap: 1000, tickets: TICKETS, rounds: ROUNDS, breaks, name: "Probe " + N } });
  out("game", g.id, "tickets", TICKETS, "rounds", ROUNDS);
  const pub = await org.publish(g.id); if (!pub.ok) throw new Error("publish " + JSON.stringify(pub.body));
  const co = await H.call("POST", "/api/checkout", { eid: g.id, name: "Asha Rao", email: "sim+probe@example.com", country: "IN", currency: "INR" }, org.h);
  const pay = rz.customerPays(co.body.razorpay.orderId, { method: "card" });
  const v = await H.call("POST", "/api/payments/verify", { paymentId: co.body.paymentId, razorpay_order_id: pay.order_id, razorpay_payment_id: pay.id, razorpay_signature: rz.sign(pay.order_id, pay.id) });
  out("paid", v.ok);
  const t0 = Date.now();
  const p = spawn(BUN, [join(ROOT, "tools/sim2/crowd.ts"), JSON.stringify({ eid: g.id, startRound: g.startRound, phones: N, seed: "probe", base: `http://localhost:${PORT}`, maxSteps: 900, lateFrac: 0.2, offlineFrac: 0.03 })], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let buf = ""; p.stdout.on("data", (d) => (buf += d)); p.stderr.on("data", (d) => (buf += d));
  let peak = 0; const iv = setInterval(async () => { try { const r = Bun.spawnSync(["powershell", "-NoProfile", "-Command", `(Get-Process -Id ${p.pid}).PeakWorkingSet64/1MB`]); peak = Math.max(peak, Math.round(Number(r.stdout.toString().trim()) || 0)); } catch {} }, 5000);
  await new Promise((r) => p.on("close", r)); clearInterval(iv);
  const line = buf.trim().split("\n").filter((l) => l.startsWith("{")).pop();
  out(`crowd finished in ${((Date.now() - t0) / 1000).toFixed(0)} s, crowd process peak ~${peak} MB`);
  out(line ? line.slice(0, 900) : buf.slice(-600));
} catch (e) { console.log("THREW", e?.stack ?? e); }
rz.stop(); srv.kill(); process.exit(0);
