// Takes screenshots of the organizer console and the participant's ticket page from the demo engagement. Usage: node tools/sim/demo-shots.mjs <outDir>
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
const require = createRequire("C:/ct/ct/package.json");
const { chromium } = require("playwright-core");
const BUN = "C:/Users/Dell/AppData/Roaming/npm/node_modules/bun/node_modules/@oven/bun-windows-x64-baseline/bin/bun.exe";
const out = process.argv[2], PORT = 8793, BASE = `http://localhost:${PORT}`, ID = "DEMO-DAY";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(BUN, ["run", "tools/sim/demo-server.ts"], { cwd: "C:/ct/tambola", env: { ...process.env, PORT: String(PORT) } });
await new Promise((res, rej) => { srv.stdout.on("data", (d) => String(d).includes("READY") && res()); srv.stderr.on("data", (d) => console.error(String(d).slice(0, 300))); srv.on("exit", () => rej(new Error("server exited"))); setTimeout(() => rej(new Error("no start")), 40000); });
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
// organizer console
const oc = await b.newContext({ viewport: { width: 1100, height: 900 } });
await oc.addInitScript(() => { sessionStorage.setItem("ctz-org", "demo"); sessionStorage.setItem("ctz-email", "organizer@yourcompany.example"); });
const op = await oc.newPage(); const errs = []; op.on("pageerror", (e) => errs.push(String(e)));
await op.goto(`${BASE}/zc.html?e=${ID}`); await sleep(9000);
await op.screenshot({ path: out + "/console-full.png", fullPage: true });
// a participant's phone: seat 5 is already joined on this device
const pc = await b.newContext({ viewport: { width: 390, height: 844 } });
await pc.addInitScript((id) => { localStorage.setItem("ctz:device", "d".repeat(32)); localStorage.setItem(`ctz:${id}:pid`, "5x000000000005"); localStorage.setItem(`ctz:${id}:jr`, "0"); }, ID);
const pp = await pc.newPage(); pp.on("pageerror", (e) => errs.push(String(e)));
await pp.goto(`${BASE}/z.html?e=${ID}`); await sleep(14000);
await pp.screenshot({ path: out + "/phone-full.png", fullPage: true });
const card = await pp.$(".zinvite"); if (card) await card.screenshot({ path: out + "/phone-invite-card.png" });
// the guest who follows an invitation link
const gc = await b.newContext({ viewport: { width: 390, height: 700 } });
const gp = await gc.newPage(); await gp.goto(`${BASE}/z.html?e=${ID}&from=5&c=colleagues`); await sleep(2500);
await gp.screenshot({ path: out + "/guest-join.png" });
console.log("errors:", JSON.stringify(errs));
await b.close(); srv.kill();
