import { createRequire } from "node:module";
const require = createRequire("C:/ct/ct/package.json");
const { chromium } = require("playwright-core");
const [pdf, outPrefix, pages] = [process.argv[2], process.argv[3], Number(process.argv[4] || 1)];
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: false, args: ["--headless=new"] });
const p = await (await b.newContext({ viewport: { width: 900, height: 1250 } })).newPage();
for (let i = 1; i <= pages; i++) { await p.goto("file:///" + pdf + "#page=" + i + "&zoom=page-fit&toolbar=0&navpanes=0"); await p.waitForTimeout(2500); await p.screenshot({ path: outPrefix + i + ".png" }); }
await b.close();
