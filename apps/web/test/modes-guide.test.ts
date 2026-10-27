// Every new message of the four modes has a catalog entry in the guide (what happened, what to do, where to go).
import { afterEach, expect, setDefaultTimeout, test } from "bun:test";
import { newWorld, openPage, type Page } from "./harness";
import { GO_REFUSALS, NEXT_REFUSALS } from "../../../packages/beacon/src/control";
import { NEEDS_CONSOLE_MSG, NOT_BEFORE_MSG, MANUAL_LIMIT_MSG, STARTED_MSG } from "../../edge/src/modes";

setDefaultTimeout(30_000);
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

test("each message the Start button and the two start/play settings can show is guided, not left as a bare sentence", async () => {
  const w = newWorld({ DATA_KEY: "k" });
  const p = await openPage(w.world, { url: "http://localhost/pricing.html", html: "pricing.html", scripts: ["guide.js"] }); open.push(p);
  const CTG = p.win.CTG;
  const msgs: [number, string][] = [
    [422, GO_REFUSALS.early], [422, GO_REFUSALS.again], [422, GO_REFUSALS.auto], [422, GO_REFUSALS.lead], [422, NEXT_REFUSALS.start], [422, NEXT_REFUSALS.early],
    [422, NOT_BEFORE_MSG], [409, STARTED_MSG], [409, NEEDS_CONSOLE_MSG], [409, MANUAL_LIMIT_MSG],
    [400, "How does the game start: by itself at the time (auto) or when you press Start (manual)."],
    [400, "The start time has passed. Press Start, or pick a new start time in the future."],
  ];
  for (const [status, message] of msgs) {
    const hit = CTG.find({ status, message });
    expect([message, !!hit.matched]).toEqual([message, true]);
  }
});
