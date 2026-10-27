// Steps 7 to 10 made idiot-proof (owner order, 2026-10-26): every mistake is told in plain words next to the control that was used, with what to do next; nothing looks dead, contradicts itself or invites a second payment.
// The real page scripts run in a DOM against the real Worker code (the same way pages.test.ts does it; its few helpers are copied here because that file does not export them).
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { newWorld, openPage, roundAt, roundMs, T, type Page } from "./harness";
import { nextMessage, publicKeyFromSecret, readPublished, signControlWithSecret, type KV } from "../../../packages/beacon/src/control";
import { PRIZE_HOUSES } from "../../../packages/beacon/src/config";

setDefaultTimeout(40_000);
const HOUR = 3_600_000;
const START = roundAt(T) + 1200; // one hour after T
const START_MS = roundMs(START);
const KEY = "11".repeat(32);
let open: Page[] = [];
afterEach(async () => { for (const p of open) await p.close(); open = []; });

async function organizer(extra: Record<string, string> = {}) {
  const w = newWorld(extra);
  const s = await w.json(await w.api("POST", "/api/start", { email: "boss@acme.com" }));
  return { ...w, token: s.token as string, aiKey: s.aiKey as string, aiMessage: s.aiMessage as string };
}
type O = Awaited<ReturnType<typeof organizer>>;
const make = async (o: O, id: string, over: Record<string, unknown> = {}) => o.api("POST", "/api/z", { id, startRound: START, callSeconds: 9, cap: 100, ...over }, o.aiKey);
const publish = (o: O, id: string) => o.api("POST", `/api/z/${id}/publish`, { email: "boss@acme.com", phone: "98765 43210" }, o.token);
const regKey = (o: O, id: string) => o.api("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret(KEY) }, o.token);
const ZC_SCRIPTS = "zgame.js control.js zc.js".split(" ");
async function page(o: O, url: string, html: string, scripts: string[], session: Record<string, string> = {}, extra: Partial<Parameters<typeof openPage>[1]> = {}) {
  if (scripts.includes("zc.js")) { const inner = extra.afterLoad; extra = { ...extra, afterLoad: (win: any, f: string) => { if (f === "zgame.js" && win.ZG && !win.ZG.PRIZE_HOUSES) win.ZG.PRIZE_HOUSES = PRIZE_HOUSES; inner?.(win, f); } }; }
  const p = await openPage(o.world, { url: "http://localhost" + url, html, scripts, session, ...extra }); open.push(p); return p;
}
const consolePage = (o: O, eid: string, key = o.token, session: Record<string, string> = {}, extra: Partial<Parameters<typeof openPage>[1]> = {}) =>
  page(o, `/zc?e=${eid}`, "zc.html", ZC_SCRIPTS, { "ctz-org": key, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com", ...session }, extra);
const openStep = (p: Page, n: number) => p.click(`.zc-dot[data-open="${n}"]`);
/** records every /api call the page makes, and can answer chosen ones itself: over["POST /api/z/ID/x"] = (method, body, url) => body */
function spy(over: Record<string, (m: string, body: any, url: URL) => any> = {}) {
  const st: any = { calls: [] as any[] };
  const hook = (win: any, f: string) => {
    if (f !== "control.js") return;
    const real = win.fetch;
    win.fetch = async (input: any, init2?: any) => {
      const u = new URL(String(input), "http://localhost"), m = (init2?.method || "GET").toUpperCase(), body = init2?.body ? JSON.parse(init2.body) : undefined;
      if (u.pathname.startsWith("/api/")) st.calls.push([m, u.pathname, body]);
      const h = over[m + " " + u.pathname];
      if (h) return new Response(JSON.stringify(await h(m, body, u)), { status: 200, headers: { "content-type": "application/json" } });
      return real(input, init2);
    };
  };
  return { st, hook };
}
const fakeWin = () => { const w: any = { location: { href: "" }, opener: 1, closed: false, close() { w.closed = true; } }; return w; };

describe("steps 7 and 8: publish, pay", () => {
  test("a Rs 0 game is told that nothing is due: the note, the side panel and step 8 agree", async () => {
    const o = await organizer(); await make(o, "IP-FREE", { cap: 10, demo: true });
    const p = await consolePage(o, "IP-FREE"); await p.waitFor((x) => /Hello/.test(x)); openStep(p, 7);
    p.click("#publishopen"); await p.waitFor((x) => /Confirm and publish/.test(x));
    const ph = p.$("#pubPhone") as any; ph.value = "98765 43210"; ph.dispatchEvent(new p.win.Event("input", { bubbles: true }));
    p.click("#pubgo"); await p.waitFor(() => !!p.$("#zcnote"));
    expect(p.$("#zcnote")!.textContent).toMatch(/nothing is due/); expect(p.$("#zcnote")!.textContent).not.toMatch(/pay in step 8/);
    expect(p.text()).toMatch(/Payment: Rs 0/); expect(p.text()).not.toMatch(/Payment: Paid/);
    openStep(p, 8); expect(p.$("#sec8 .zc-say")!.textContent).toBe("Nothing more to pay.");
  });

  test("step 7 offers no Continue on an unpublished game, and an old saved tick does not make it look done", async () => {
    const o = await organizer(); await make(o, "IP-DRAFT");
    const p = await consolePage(o, "IP-DRAFT", o.token, {}, { afterLoad: (win: any, f: string) => { if (f === "keep.js") win.localStorage.setItem("ctz-prog-IP-DRAFT-organizer", JSON.stringify({ 7: 1 })); } });
    await p.waitFor((x) => /Hello/.test(x)); openStep(p, 7);
    expect(p.$("#publishopen")).toBeTruthy(); expect(p.$('[data-save="7"]')).toBeNull(); // one obvious button: Publish
    expect(p.$("#sec7 .zc-st")!.getAttribute("aria-label")).toBe("To do");
  });

  test("Copy payment link again copies the same link: no new link is made, so the link already sent keeps working", async () => {
    const o = await organizer(); await make(o, "IP-PAYL"); await publish(o, "IP-PAYL"); const w = spy();
    const p = await consolePage(o, "IP-PAYL", o.token, {}, { afterLoad: w.hook }); await p.waitFor((x) => /Last step|Your game|Hello/i.test(x)); openStep(p, 8);
    const copied: string[] = []; Object.defineProperty(p.win.navigator, "clipboard", { value: { writeText: async (t: string) => { copied.push(t); } }, configurable: true });
    expect(p.text()).toMatch(/Making a new link stops the link you made before/); // said before the first tap
    p.click("#copypaylink"); await p.waitFor((x) => /Copied\. Paste it into WhatsApp or e-mail\./.test(x)); // and a copy is confirmed
    expect(p.text()).toMatch(/Tap again to copy the same link/);
    p.click("#copypaylink"); await p.waitFor(() => copied.length === 2);
    expect(copied[1]).toBe(copied[0]);
    expect(w.st.calls.filter((c: any) => c[0] === "POST" && c[1] === "/api/z/IP-PAYL/paylink").length).toBe(1); // the second tap asked the server for nothing
  });

  test("cancelling one game does not make the next game opened in the same tab look cancelled", async () => {
    const o = await organizer(); await make(o, "IP-CA"); await publish(o, "IP-CA"); await make(o, "IP-CB"); await publish(o, "IP-CB");
    const p = await consolePage(o, "IP-CA"); await p.waitFor((x) => /Last step|Your game|Hello/i.test(x)); openStep(p, 7);
    p.click("#cancelopen"); await p.waitFor((x) => /1st confirmation/.test(x)); p.click("#cancel1"); await p.waitFor((x) => /2nd confirmation/.test(x));
    const agree = p.$("#cancelagree") as any; agree.checked = true; agree.dispatchEvent(new p.win.Event("change", { bubbles: true }));
    p.click("#cancel2"); await p.waitFor((x) => /Final confirmation/.test(x)); p.click("#cancel3"); await p.waitFor((x) => /This game was cancelled/.test(x));
    p.click("#back"); await p.waitFor(() => !!p.$("#yourgames")); p.click('[data-open-game="IP-CB"]');
    await p.waitFor((x) => /Last step: pay before the start/i.test(x)); // game B is published and unpaid: its pay card is there
    expect(p.$("#cancelnote")).toBeNull(); expect(p.text()).not.toMatch(/was cancelled/);
  });
});

describe("step 9: the buttons that run the game", () => {
  const kvOf = (o: O): KV => ({ get: async (k) => (o.world.raw.prepare("SELECT v FROM kv WHERE k=?").get(k) as any)?.v ?? null, put: async () => {} });
  const controlPage = (o: O, eid: string, asked: string[]) => {
    const kv = kvOf(o);
    return consolePage(o, eid, o.token, {}, { afterLoad: (win: any, f: string) => {
      if (f !== "control.js") return;
      win.confirm = (m: string) => { asked.push(m); return true; }; // the browser's own question box must never be used
      win.TBControl.sign = async (code: string, _a: unknown, action: any, extra: any = {}) => signControlWithSecret(KEY, nextMessage((await readPublished(kv, code))!, roundAt(o.world.now), { action, ...extra })); // the browser's key store needs a real browser
    } });
  };

  test("Pause tells the true delay and that it ends by itself; End asks in the page and then shows that the game is being ended", async () => {
    const o = await organizer(); await make(o, "IP-CTL", { cap: 600 }); await regKey(o, "IP-CTL"); await publish(o, "IP-CTL"); // 251 to 1000 people: a press takes 85 seconds to reach the phones (the old fixed sentence said 40)
    const asked: string[] = []; const c = await controlPage(o, "IP-CTL", asked); const kv = kvOf(o);
    await c.waitFor((x) => /Last step|Your game|Hello/i.test(x)); openStep(c, 9); await c.waitFor((x) => /Controls/.test(x));
    c.click('[data-ctl="pause"]'); await c.waitFor(() => !!c.$("#zcsure")); expect(c.$("#zcsure")!.textContent).toMatch(/Are you sure\? Numbers stop for everybody/); c.click("#zcsure [data-y]"); await c.waitFor((x) => /It ends by itself after 30 minutes/.test(x)); // Pause asks first
    expect(c.$("#ctlstate")!.textContent).toMatch(/Pause on its way/); expect((c.$('[data-ctl="pause"]') as any).disabled).toBe(true); // no second Pause while the first is on its way
    expect(c.$("#ctlnote")!.textContent).toMatch(/reaches the phones in about 85 seconds/); expect(c.text()).not.toMatch(/about 40 seconds/);
    c.click('[data-ctl="stop"]'); await c.waitFor(() => !!c.$("#zcsure")); expect(c.$("#zcsure")!.textContent).toMatch(/This cannot be undone/);
    c.click("#zcsure [data-n]"); await c.waitFor(() => !c.$("#zcsure")); // No: nothing is sent
    expect((await readPublished(kv, "IP-CTL"))!.messages.map((m) => m.action)).toEqual(["pause"]);
    c.click('[data-ctl="stop"]'); await c.waitFor(() => !!c.$("#zcsure")); c.click("#zcsure [data-y]");
    await c.waitFor((x) => /Ending the game\./.test(x));
    expect((await readPublished(kv, "IP-CTL"))!.messages.map((m) => m.action)).toEqual(["pause", "stop"]);
    expect(c.$("#ctlstate")!.textContent).toMatch(/being ended/); expect((c.$('[data-ctl="stop"]') as any).disabled).toBe(true); expect((c.$('[data-ctl="resume"]') as any).disabled).toBe(true);
    expect(asked).toEqual([]);
  });
});

describe("step 10: the report", () => {
  const URL1 = "http://localhost/report.html#k=abc";
  test("the report opens on the tap itself; when the browser blocks the new tab the link is shown to tap; a new link says what happened", async () => {
    const o = await organizer(); await make(o, "IP-RPT"); await publish(o, "IP-RPT");
    const w = spy({
      "GET /api/z/IP-RPT/life": () => ({ reportSent: true, purged: false, personalDeleteAtMs: START_MS + 24 * HOUR, fullDeleteAtMs: START_MS + 365 * 24 * HOUR }),
      "GET /api/z/IP-RPT/reportlink": () => ({ url: URL1 }), "POST /api/z/IP-RPT/reportlink": () => ({ url: URL1 }),
    });
    const p = await consolePage(o, "IP-RPT", o.token, {}, { afterLoad: w.hook }); await p.waitFor((x) => /Last step|Your game|Hello/i.test(x));
    openStep(p, 10); await p.waitFor(() => !!p.$("#rptopen"));
    const win = fakeWin(); let blocked = false; p.win.open = (u?: string) => (blocked || u !== "" ? null : win); // a tab opened empty on the tap, filled in after the network call
    p.click("#rptopen"); await p.waitFor(() => !!win.location.href); expect(win.location.href).toBe(URL1); expect(p.$("#rptlink")).toBeNull();
    blocked = true; p.click("#rptopen"); await p.waitFor(() => !!p.$("#rptlink"));
    expect((p.$("#rptlink") as any).getAttribute("href")).toBe(URL1); expect(p.$("#rptnote")!.textContent).toMatch(/blocked the new tab/);
    p.click("#rptnew"); await p.waitFor(() => !!p.$("#zcsure")); expect(p.$("#zcsure")!.textContent).toMatch(/stops working at once/); p.click("#zcsure [data-y]");
    await p.waitFor(() => /New report link made\. The old one has stopped\./.test(p.$("#rptnote")?.textContent ?? ""));
    expect(p.$("#rptlink")).toBeTruthy(); // the new link is right there to tap
  });
});

describe("the payment page", () => {
  const payPage = (o: O, eid: string, hook?: (win: any, f: string) => void) => page(o, `/pay?e=${eid}`, "pay.html", ["common.js", "pay.js"], { "ctz-org": o.token, "ctz-email": "boss@acme.com", "ctz-phone": "98765 43210" }, hook ? { afterLoad: hook } : {});
  const answer = (win: any, routes: Record<string, (real: () => Promise<Response>) => Promise<Response> | Response>) => { const real = win.fetch; win.fetch = async (input: any, init?: any) => { const u = new URL(String(input), "http://localhost"), h = routes[(init?.method || "GET").toUpperCase() + " " + u.pathname]; return h ? h(() => real(input, init)) : real(input, init); }; };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  test("a game whose payment is still being confirmed shows a calm card, not a second payment form", async () => {
    const o = await organizer(); await make(o, "IP-CONF"); await publish(o, "IP-CONF");
    const p = await payPage(o, "IP-CONF", (win, f) => { if (f === "common.js") answer(win, { "GET /api/z/IP-CONF/cohost": async (real) => json({ ...(await (await real()).json()), payment: { status: "confirming" } }) }); });
    const t = await p.waitFor((x) => /We are checking your payment/.test(x));
    expect(t).toMatch(/Please do not pay again/); expect(p.$("#paygo")).toBeNull(); expect(p.$("#chkpay")).toBeTruthy(); expect(p.$("#payagain")).toBeNull();
    expect(typeof (p.win as any).ctzFocus).toBe("function"); // the guide's "Take me there" buttons lead somewhere on this page too
  });

  test("when the confirmation call fails after the Razorpay window, the page keeps asking: no error, no live Pay button, no second payment", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await make(o, "IP-VERIFY"); await publish(o, "IP-VERIFY"); // the gateway is on in this world: with no keys and no TEST_MODE the page says 'Payment opens soon' and holds the Pay button, so the click does nothing
    let verifyCalls = 0, checkouts = 0;
    const p = await payPage(o, "IP-VERIFY", (win, f) => {
      if (f !== "common.js") return;
      win.Razorpay = function (this: any, opts: any) { this.on = () => {}; this.open = () => setTimeout(() => opts.handler({ razorpay_order_id: "order_x", razorpay_payment_id: "pay_x", razorpay_signature: "sig" }), 0); };
      answer(win, {
        "POST /api/checkout": () => { checkouts++; return json({ mode: "razorpay", paymentId: "pay_0123456789abcdef", razorpay: { keyId: "k", orderId: "order_x", amount: 239900, currency: "INR", name: "Corporate Tambola", description: "d", prefill: {}, notes: {}, theme: {} } }); },
        "POST /api/payments/verify": () => { verifyCalls++; return json({ error: "Something went wrong. Please try again." }, 500); },
      });
    });
    await p.waitFor((x) => /Details/.test(x)); (p.$("#nm") as any).value = "Asha Rao"; p.click("#paygo");
    await p.waitFor(() => verifyCalls === 1); await new Promise((r) => setTimeout(r, 300));
    expect(p.text()).toMatch(/Please keep this page open/); expect(p.text()).not.toMatch(/Something went wrong/); // the page is still asking, it did not hand the Pay button back
    expect((p.$("#paygo") as any).getAttribute("data-hold")).toBe("1"); expect(checkouts).toBe(1);
    o.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id='IP-VERIFY'").run(); o.world.raw.prepare("INSERT OR REPLACE INTO kv(k,v) VALUES(?,?)").run("paidby/IP-VERIFY", JSON.stringify({ by: "organizer", ms: START_MS - HOUR })); // the gateway's own message arrives: the game is paid
    await p.waitFor((x) => /Payment received/i.test(x), 15_000);
    expect(p.text()).toMatch(/Open my game/); expect(p.text()).not.toMatch(/engagement/i); expect(checkouts).toBe(1); expect(verifyCalls).toBe(1);
  });
});
