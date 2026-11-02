// The agreement notice as a person meets it on the pages (real page scripts in a DOM, real Worker code, in-memory database). No tick-boxes since 1 Nov 2026: one small line with three links,
// the buttons are not held back, and the request still carries the version so the server keeps its proof.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, T, type Page } from "./harness";

setDefaultTimeout(30_000);
const START = roundAt(T) + 1200;
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer(extra: Record<string, string> = {}) {
  const w = newWorld(extra);
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string, aiMessage: s.aiMessage as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const make = (o: O, id: string) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100 }, o.aiKey);
const publish = (o: O, id: string) => o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token);
async function page(o: O, url: string, html: string, scripts: string[], session: Record<string, string> = {}, extra: Partial<Parameters<typeof openPage>[1]> = {}) {
  const p = await openPage(o.world, { url: "http://localhost" + url, html, scripts, session, tick: false, ...extra }); open.push(p); return p;
}
const rtFake = (win: any, nowMs: () => number) => {
  const Orig = win.ZG.PhoneRuntime;
  win.ZG.PhoneRuntime = class extends Orig {
    constructor(eid: string, deps: any) {
      super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test"], timeoutMs: 1000 } });
    }
  };
};
const tick = (p: Page, id: string) => { const i = p.win.document.getElementById(id) as any; i.checked = true; i.dispatchEvent(new p.win.Event("change", { bubbles: true })); };
const rows = (o: O, kind: string) => o.world.raw.query("SELECT * FROM consent_log WHERE kind=? ORDER BY at_ms, id").all(kind) as any[];

describe("K4 the join page", () => {
  test("one notice line, no boxes; the button is on; the join carries the version and is stored", async () => {
    const o = await organizer(); await make(o, "CP-JOIN"); await publish(o, "CP-JOIN");
    const p = await page(o, "/z?e=CP-JOIN", "z.html", ["audio.js", "zgame.js", "z.js"], {}, { afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, () => o.world.now); } });
    await p.waitFor((x) => /Join the game/.test(x));
    const doc = p.win.document;
    expect(doc.querySelectorAll('[data-cbc="K4"] input').length).toBe(0);
    expect(doc.querySelector('[data-cbc="K4"]')!.textContent!.trim()).toBe("By continuing, you agree to the Terms and Conditions, Privacy and Data, and Game rules.");
    const html = p.html(); expect(html.indexOf('data-cbc="K4"')).toBeGreaterThan(-1); expect(html.indexOf('data-cbc="K4"')).toBeLessThan(html.indexOf('id="nm"')); // before any name field
    const go = p.$("#go") as any;
    expect([go.disabled, go.getAttribute("aria-disabled")]).toEqual([false, "false"]);
    (p.$("#ph") as any).value = "9822222222"; (p.$("#nm") as any).value = "Asha";
    p.click("#go"); for (let i = 0; i < 100 && (o.world.raw.query("SELECT COUNT(*) c FROM participant").get() as any).c < 1; i++) await new Promise((r) => setTimeout(r, 50));
    const k4 = rows(o, "K4"); expect(k4).toHaveLength(1); expect(k4[0]).toMatchObject({ kind: "K4", ref: "CP-JOIN", boxes: "A,B" });
    expect(p.errors).toEqual([]);
  });
});

describe("K1 publish on the console", () => {
  test("no boxes: the Publish button needs only the phone number; the publish carries the version", async () => {
    const o = await organizer(); await make(o, "CP-PUB");
    const p = await page(o, "/zc?e=CP-PUB", "zc.html", ["zgame.js", "control.js", "zc.js"], { "ctz-org": o.token, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com" });
    await p.waitFor((x) => /Hello\. Let us start/.test(x)); p.click('.zc-dot[data-open="7"]');
    await p.waitFor((x) => /Publish \(free\)/.test(x)); p.click("#publishopen"); if (p.$("#pubanyway")) p.click("#pubanyway"); /* WP-04 TA12: blank prizes ask once more */
    await p.waitFor((x) => /Confirm and publish/.test(x));
    const doc = p.win.document;
    expect(doc.querySelectorAll('[data-cbc="K1"] input').length).toBe(0);
    (p.$("#pubPhone") as any).value = "98765 43210"; (p.$("#pubPhone") as any).dispatchEvent(new p.win.Event("input", { bubbles: true }));
    expect((p.$("#pubgo") as any).disabled).toBe(false);
    p.click("#pubgo"); await p.waitFor((x) => /Published/.test(x));
    const k1 = rows(o, "K1"); expect(k1).toHaveLength(1); expect(k1[0]).toMatchObject({ ref: "CP-PUB", boxes: "A,B" });
  });
});

describe("K2 the Create your game pop-up", () => {
  test("the notice sits with the sign-up and the sign-up carries the version", async () => {
    const site = await Bun.file(new URL("../public/site.js", import.meta.url)).text();
    expect(site).toContain('CBConsent.html("K2")'); expect(site).toContain('consent: CBConsent.payload(k2, "K2")');
    expect(site.indexOf('CBConsent.html("K2")')).toBeLessThan(site.indexOf('id="frGo"'));
  });
});

describe("K5 a Co-host takes the role", () => {
  test("the Co-host sees the acceptance with the notice and no box; after going ahead the console opens", async () => {
    const o = await organizer(); await make(o, "CP-COH"); await publish(o, "CP-COH");
    const ck = (await o.json(await o.api("POST", "/api/org/cohost", { label: "Ravi", phone: "9811100099", eid: "CP-COH" }, o.token))).cohostKey as string;
    const p = await page(o, "/zc?e=CP-COH", "zc.html", ["zgame.js", "control.js", "zc.js"], { "ctz-org": ck, "ctz-email": "boss@acme.com" });
    await p.waitFor((x) => /Before you start/.test(x));
    expect(p.win.document.querySelectorAll('[data-cbc="K5"] input').length).toBe(0);
    expect((p.$("#roleacceptgo") as any).disabled).toBe(false);
    p.click("#roleacceptgo"); await p.waitFor((x) => /Today's game|Invite people/.test(x));
    expect(rows(o, "K5")).toHaveLength(1);
  });
});

describe("K3 the payment page", () => {
  test("no box: the pay button is on", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await make(o, "CP-PAY"); await publish(o, "CP-PAY");
    const p = await page(o, "/pay?e=CP-PAY", "pay.html", ["common.js", "pay.js"], { "ctz-org": o.token, "ctz-email": "boss@acme.com" });
    await p.waitFor((x) => /Payment/.test(x) && !!p.$("#paygo"));
    expect(p.win.document.querySelectorAll('[data-cbc="K3"] input').length).toBe(0);
    expect([(p.$("#paygo") as any).disabled, (p.$("#paygo") as any).getAttribute("aria-disabled")]).toEqual([false, "false"]);
  });
});
