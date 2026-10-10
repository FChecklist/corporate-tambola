// Smoke test of the campaign foundation: one organizer, one game, paid through the FAKE Razorpay, invoice read back. Run with bun: bun tools/sim2/campaign/smoke-pay.mjs
import { spawn } from "node:child_process";
import { join } from "node:path";
import { makeFakeRzp } from "./fake-rzp.ts";

const ROOT = join(import.meta.dir, "../../..");
const PORT = Number(process.env.SIM_PORT ?? 8821); process.env.SIM_PORT = String(PORT);
const BUN = process.execPath;
const rz = makeFakeRzp(PORT + 100);
const srv = spawn(BUN, [join(ROOT, "tools/sim2/campaign/server.ts")], { cwd: ROOT, env: { ...process.env, SIM_PORT: String(PORT), CAMP_RZP_BASE: rz.url, CAMP_RZP_KEY: rz.keyId, CAMP_RZP_SECRET: rz.keySecret, CAMP_RZP_HOOK: rz.webhookSecret }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let log = ""; srv.stdout.on("data", (d) => (log += d)); srv.stderr.on("data", (d) => (log += d));
const alive = async () => { try { return (await fetch(`http://localhost:${PORT}/__sim/health`)).ok; } catch { return false; } };
for (let i = 0; i < 100 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 300));
if (!(await alive())) { console.log("server did not start:\n" + log.slice(-800)); rz.stop(); srv.kill(); process.exit(2); }
const H = await import("../lib/index.mjs");
let ok = 0, bad = 0; const check = (n, c, d = "") => { if (c) { ok++; console.log("  ok:", n); } else { bad++; console.log("  FAIL:", n, d); } };
try {
  await H.clock.freeze();
  const org = await H.Organizer.signUp("sim+smoke@example.com");
  const g = await org.createGame({ leadMs: 3 * H.HOUR, cfg: { cap: 100 } });
  const pub = await org.publish(g.id); check("publish (unpaid)", pub.ok, JSON.stringify(pub.body));
  const co = await H.call("POST", "/api/checkout", { eid: g.id, name: "Asha Rao", email: "sim+smoke@example.com", country: "IN", currency: "INR", phone: "9811122233", phoneCode: "91" }, org.h);
  check("checkout opens a fake Razorpay order", co.ok && co.body.mode === "razorpay" && co.body.razorpay?.orderId, JSON.stringify(co.body).slice(0, 300));
  const pay = rz.customerPays(co.body.razorpay.orderId, { method: "upi", vpa: "asha@okfake" });
  const v = await H.call("POST", "/api/payments/verify", { paymentId: co.body.paymentId, razorpay_order_id: pay.order_id, razorpay_payment_id: pay.id, razorpay_signature: rz.sign(pay.order_id, pay.id) });
  check("verify finishes the payment", v.ok && v.body.ok, JSON.stringify(v.body).slice(0, 300));
  const inv = await fetch(`http://localhost:${PORT}${v.body.invoiceUrl}`).then((r) => r.text());
  for (const x of ["Paid on (IST)", "Razorpay: UPI", "Terms and conditions", "Asha Rao"]) check(`invoice has "${x}"`, inv.includes(x));
  const s = await org.summary(g.id); check("game is paid and published", s.ok && s.body.payment?.status === "paid", JSON.stringify(s.body).slice(0, 200));
  console.log(`fake Razorpay calls: ${rz.calls.map((c) => c.method + " " + c.path + " " + c.status).join(" | ")}`);
} catch (e) { bad++; console.log("  THREW:", e?.stack ?? e); }
console.log(`SMOKE ${ok} ok, ${bad} failed`);
rz.stop(); srv.kill(); process.exit(bad ? 1 : 0);
