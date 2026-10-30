// 1.8.3: a Co-host whose acceptance was recorded under the OLD terms version opens the Co-host console as before: no tick box, no "out of date" dead end.
import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(60_000);
const START = roundAt(T) + 1200;
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

test("an old-version Co-host record: the Co-host console shows the game, and never the tick sentence or the reload sentence", async () => {
  const w = newWorld({ FREE_LAUNCH: "1" }); const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  await w.api("POST", "/api/z", { id: "UI-OLDC", startRound: START, callSeconds: 9, cap: 100 }, s.aiKey);
  await w.api("POST", "/api/z/UI-OLDC/publish", { email: "boss@acme.com", phone: "98765 43210" }, s.token);
  const k = (await w.json(await w.api("POST", "/api/org/cohost", { label: "Ravi", phone: "9811100099", eid: "UI-OLDC" }, s.token))).cohostKey as string;
  await w.api("POST", "/api/org/role/accept", {}, k);
  w.world.raw.run("UPDATE consent_log SET version='2026-10-15' WHERE kind='K5'"); // accepted before the version moved
  const p = await openPage(w.world, { url: "http://localhost/zc?e=UI-OLDC", html: "zc.html", scripts: "zgame.js control.js zc.js".split(" "), session: { "ctz-org": k, "ctz-aimsg": s.aiMessage as string, "ctz-email": "boss@acme.com" },
    afterLoad: (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; } });
  open.push(p);
  const t = await p.waitFor((x) => /Hi\. Here is the game/.test(x), 25_000);
  expect(/Please tick the box|out of date/i.test(t)).toBe(false); expect(p.errors).toEqual([]);
});
