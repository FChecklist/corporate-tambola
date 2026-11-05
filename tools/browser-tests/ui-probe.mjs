import { launch, signIn, sleep } from "./ui-lib.mjs";
const SITE = process.env.SITE || "https://corporatetambola.com", B = process.env.BROWSER || "chrome", LOGIN = process.env.LOGIN || "demo1@xyz.in";
const browser = await launch(B); const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.on("dialog", (d) => d.accept().catch(() => {}));
try { await signIn(p, SITE, LOGIN); console.log("SIGNED IN", p.url(), (await p.innerText("body")).replace(/\s+/g, " ").slice(0, 160)); } catch (e) { await p.screenshot({ path: "C:/ct/test-sites/data/ui/probe-fail.png" }); console.log("FAIL", e.message.slice(0, 120), "|", (await p.innerText("body")).replace(/\s+/g, " ").slice(-300)); }
await browser.close();
