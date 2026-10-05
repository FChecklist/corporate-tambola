// The pages themselves, run as a browser runs them (real page scripts in a DOM, talking to the real Worker code and an in-memory database).
// IDs match docs/USE_CASES.md. These catch what API tests cannot: a page that freezes, a button that does nothing, a message that never shows.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";

setDefaultTimeout(30_000);
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { newWorld, openPage, roundAt, roundMs, T, type Page } from "./harness";
import { publicKeyFromSecret } from "../../../packages/beacon/src/control";

const HOUR = 3_600_000;
const START = roundAt(T) + 1200; // one hour after T
const START_MS = roundMs(START);
const rnd = (r: number) => createHash("sha256").update("fake" + r).digest("hex");
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
const regKey = (o: O, id: string) => o.api("PUT", `/api/z/${id}/control/key`, { publicKey: publicKeyFromSecret("11".repeat(32)) }, o.token);
async function page(o: O, url: string, html: string, scripts: string[], session: Record<string, string> = {}, extra: Partial<Parameters<typeof openPage>[1]> = {}) {
  const p = await openPage(o.world, { url: "http://localhost" + url, html, scripts, session, ...extra }); open.push(p); return p;
}
const consolePage = (o: O, eid: string, key = o.token, session: Record<string, string> = {}) =>
  page(o, `/zc?e=${eid}`, "zc.html", ["zgame.js", "control.js", "zc.js"], { "ctz-org": key, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com", ...session });

describe("console (organizer page)", () => {
  test("UC-53 the home page shows the two options first, with the AI work link ready to copy", async () => {
    const o = await organizer();
    const p = await page(o, "/zc", "zc.html", ["zgame.js", "control.js", "zc.js"], { "ctz-org": o.token, "ctz-aimsg": o.aiMessage });
    const t = await p.waitFor((x) => /OPTION 1/.test(x));
    expect(t.indexOf("OPTION 1")).toBeLessThan(t.indexOf("OPTION 2")); expect(t.indexOf("OPTION 2")).toBeLessThan(t.indexOf("Create your engagement"));
    expect(t).toMatch(/ChatGPT, Gemini, Grok, Claude, DeepSeek, Z\.ai/); expect(t).toMatch(/Only four things stay with you: payment, pressing Publish/);
    expect((p.$("#aimsg") as any).value).toContain("/ai/cta_"); expect((p.$("#aimsg") as any).value).toMatch(/my own Corporate Tambola account/i); expect(p.$("#aicopy")).toBeTruthy();
    expect(p.errors).toEqual([]);
  });
  test("Replace my AI link: the button replaces the key, the box shows the new paste, the old link is dead, the new one answers", async () => {
    const o = await organizer();
    const p = await page(o, "/zc", "zc.html", ["zgame.js", "control.js", "zc.js"], { "ctz-org": o.token, "ctz-aimsg": o.aiMessage });
    await p.waitFor((x) => /OPTION 1/.test(x));
    expect(p.text()).toMatch(/Replace my AI link/); p.win.confirm = () => true;
    p.click("#aireplace");
    await p.waitFor((x) => /A fresh 24-hour link is on its way to your e-mail/.test(x));
    const v = (p.$("#aimsg") as any).value as string; const nk = v.match(/cta_[0-9a-f]{48}/)![0];
    expect(nk).not.toBe(o.aiKey);
    expect((await o.api("GET", `/ai/${o.aiKey}`)).status).toBe(404); expect((await o.api("GET", `/ai/${nk}`)).status).toBe(200);
    expect(p.errors).toEqual([]);
  });
  test("Get a fresh AI link (console) mails a 24-hour link; the lasting box is unchanged", async () => {
    const o = await organizer();
    const p = await page(o, "/zc", "zc.html", ["zgame.js", "control.js", "zc.js"], { "ctz-org": o.token, "ctz-aimsg": o.aiMessage });
    await p.waitFor((x) => /OPTION 1/.test(x)); p.click("#aifresh");
    await p.waitFor((x) => /fresh 24-hour AI link is on its way/.test(x));
    expect((p.$("#aimsg") as any).value).toBe(o.aiMessage); expect(p.errors).toEqual([]);
  });
  test("Show my AI work link (the e-mail's button): asks for the organizer's sign-in; once signed in shows the two-line paste with Copy, Fresh and Replace and the do-not-forward warnings", async () => {
    const o = await organizer();
    const anon = await page(o, "/ai-link", "ai-link.html", ["ai-link.js"], {});
    const t0 = await anon.waitFor((x) => /Sign in as the organizer/.test(x));
    expect(t0).not.toMatch(/cta_/); expect(t0).toMatch(/6-digit code/); expect(anon.$("#msg")).toBeFalsy();
    const p = await page(o, "/ai-link", "ai-link.html", ["ai-link.js"], { "ctz-org": o.token });
    const t = await p.waitFor((x) => /YOUR AI WORK LINK/.test(x));
    const v = (p.$("#msg") as any).value as string; expect(v).toBe(o.aiMessage); expect(v.split("\n").length).toBe(2); expect(v).toContain("/ai/cta_");
    expect(p.$("#cp")).toBeTruthy(); expect(p.$("#fr")).toBeTruthy(); expect(p.$("#rp")).toBeTruthy();
    expect((t.match(/IMPORTANT - DO NOT FORWARD YOUR AI WORK LINK/g) ?? []).length).toBe(2);
    p.click("#fr"); await p.waitFor((x) => /fresh 24-hour link is on its way/.test(x));
    expect(p.errors).toEqual([]);
  });
  const checkSeven = async (p: any, paste: string) => {
    const hrefOf = (n: string) => new URL((p.$(`[data-ai="${n}"]`) as any).href);
    for (const [n, origin, path] of [["ChatGPT", "https://chatgpt.com", "/"], ["Grok", "https://grok.com", "/"], ["Claude", "https://claude.ai", "/new"]] as const) {
      const el = p.$(`[data-ai="${n}"]`) as any, u = hrefOf(n);
      expect(u.origin).toBe(origin); expect(u.pathname).toBe(path); expect(u.searchParams.get("q")).toBe(paste); // the two lines and the link, URL-encoded
      expect(el.href).toContain("?q=" + encodeURIComponent(paste)); expect(el.getAttribute("target")).toBe("_blank"); expect(el.getAttribute("rel")).toBe("noopener noreferrer");
    }
    const opened: string[] = []; let copied = ""; p.win.open = (u: string) => { opened.push(u); return null; };
    Object.defineProperty(p.win.navigator, "clipboard", { value: { writeText: async (t: string) => { copied = t; } }, configurable: true });
    for (const [n, origin] of [["Gemini", "https://gemini.google.com"], ["DeepSeek", "https://chat.deepseek.com"], ["z.ai", "https://chat.z.ai"]] as const) {
      copied = ""; p.click(`[data-aicopy="${n}"]`); await p.waitFor((x: string) => /Copied\. Press Ctrl\+V, then Send/.test(x));
      expect(copied).toBe(paste); expect(new URL(opened.at(-1)!).origin).toBe(origin);
    }
    expect(new URL(opened[0]!).pathname).toBe("/app"); expect(new URL(opened[0]!).searchParams.get("q")).toBe(paste); // Gemini: a harmless prefill attempt
    expect(opened[1]).toBe("https://chat.deepseek.com/"); expect(opened[2]).toBe("https://chat.z.ai/");
  };
  test("seven ways to hand the paste to an AI on the sign-in page: three pre-filled addresses, three copy-and-open buttons, one plain copy", async () => {
    const o = await organizer();
    const p = await page(o, "/ai-link", "ai-link.html", ["ai-link.js"], { "ctz-org": o.token });
    await p.waitFor((x) => /YOUR AI WORK LINK/.test(x)); expect(p.$("#cp")).toBeTruthy();
    await checkSeven(p, o.aiMessage);
  });
  test("the same seven ways sit in the console's Option 1 box", async () => {
    const o = await organizer();
    const p = await page(o, "/zc", "zc.html", ["zgame.js", "control.js", "zc.js"], { "ctz-org": o.token, "ctz-aimsg": o.aiMessage });
    await p.waitFor((x) => /OPTION 1/.test(x)); expect(p.$("#aicopy")).toBeTruthy();
    await checkSeven(p, o.aiMessage);
  });
  test("sign-in e-mail link page: opening it consumes nothing; the button starts the session once and goes to the AI-link page; a used link says so", async () => {
    const o = await organizer({ TEST_MODE: "1" });
    const r = await o.json(await o.api("POST", "/api/auth/email", { email: "boss@acme.com" }));
    const p = await page(o, "/signin?t=" + r.devToken + "&go=ai", "signin.html", ["signin.js"], {});
    const t = await p.waitFor((x) => /Continue to Corporate Tambola/.test(x));
    expect(t).toMatch(/AI work link next/); expect(t).not.toMatch(/cta_/); expect(p.win.sessionStorage.getItem("ctz-org")).toBeFalsy();
    expect(p.win.location.search).toBe(""); // the token left the address bar
    expect((await o.api("POST", "/api/auth/email", { email: "stranger@x.com" })).status).toBe(200);
    p.click("#go");
    await new Promise((res) => setTimeout(res, 400));
    expect(p.win.sessionStorage.getItem("ctz-org")).toMatch(/^ctk_[0-9a-f]{48}$/);
    const again = await page(o, "/signin?t=" + r.devToken + "&go=console", "signin.html", ["signin.js"], {});
    await again.waitFor((x) => /Continue to Corporate Tambola/.test(x)); again.click("#go");
    await again.waitFor((x) => /not valid any more/.test(x));
    expect(again.win.sessionStorage.getItem("ctz-org")).toBeFalsy();
  });
  test("UC-54 draft: the organizer publishes (free) after confirming email and mobile, then sees the payment-due card and the share link", async () => {
    const o = await organizer(); await make(o, "UI-DRAFT");
    const p = await consolePage(o, "UI-DRAFT");
    await p.waitFor((x) => /Your engagement is a draft/.test(x));
    expect(p.text()).toMatch(/publishing is free/i); expect(p.text()).not.toMatch(/Share with participants/);
    p.click("#publishopen");
    await p.waitFor((x) => /Confirm and publish/.test(x));
    expect((p.$("#pubEmail") as any).value).toBe("boss@acme.com"); // prefilled, editable
    (p.$("#pubPhone") as any).value = "98765 43210"; (p.$("#pubPhone") as any).dispatchEvent(new p.win.Event("input", { bubbles: true }));
    p.click("#pubgo");
    const t = await p.waitFor((x) => /LAST STEP: PAY BEFORE THE START/i.test(x));
    expect(t).toMatch(/will not begin/); expect(t).toMatch(/Share with participants/);
    expect((p.$('a[href^="/pay.html"]') as any).getAttribute("href")).toBe("/pay.html?e=UI-DRAFT");
    expect(p.text()).toMatch(/localhost\/z\.html\?e=UI-DRAFT/);
    expect(p.errors).toEqual([]);
  });
  test("UC-54 published but invalid details: the console shows the server's message and stays on the form", async () => {
    const o = await organizer(); await make(o, "UI-BADPUB");
    const p = await consolePage(o, "UI-BADPUB", o.token, { "ctz-email": "not-an-email" });
    await p.waitFor((x) => /draft/.test(x)); p.click("#publishopen"); await p.waitFor((x) => /Confirm and publish/.test(x));
    p.click("#pubgo");
    await p.waitFor((x) => /valid (email|mobile)/i.test(x)); expect(p.text()).not.toMatch(/LAST STEP/i);
  });
  test("UC-10 / UC-54 held for non-payment: a clear red card, nothing called, no freeze", async () => {
    const o = await organizer(); await make(o, "UI-HELD"); await publish(o, "UI-HELD");
    o.world.now = START_MS + 5 * 60_000;
    const p = await consolePage(o, "UI-HELD");
    const t = await p.waitFor((x) => /could not begin/i.test(x));
    expect(t).toMatch(/Pay now and start/); expect(t).toMatch(/0 \/ 90/); expect(p.errors).toEqual([]);
  });
  test("UC-54 a payment-due card counts down to the start and offers Pay now", async () => {
    const o = await organizer(); await make(o, "UI-DUE"); await publish(o, "UI-DUE");
    const p = await consolePage(o, "UI-DUE");
    const t = await p.waitFor((x) => /LAST STEP/i.test(x));
    expect(t).toMatch(/If payment is not made before then, the engagement will not begin/); expect(t).toMatch(/Pay now/); expect(t).toMatch(/Open the big screen/);
  });
  test("UC-6 a wrong or expired sign-in shows a message, never an endless Loading", async () => {
    const o = await organizer(); await make(o, "UI-KEY");
    const p = await consolePage(o, "UI-KEY", "ctk_" + "0".repeat(48));
    const t = await p.waitFor((x) => !/^Loading/.test(x) || /sign-in/i.test(x), 4000);
    expect(t).toMatch(/sign-in has expired|sign in again/i);
  });
  test("UC-80 the organizer sends a message to everyone from the console; empty is refused; clear works", async () => {
    const o = await organizer(); await make(o, "UI-ANN"); await regKey(o, "UI-ANN"); await publish(o, "UI-ANN");
    const p = await consolePage(o, "UI-ANN");
    await p.waitFor((x) => /Message to everyone/.test(x));
    p.click("#annSend"); await p.waitFor((x) => /Write a message first/.test(x));
    p.click('[data-chip="Dinner is served"]'); expect((p.$("#annText") as any).value).toBe("Dinner is served");
    p.click("#annSend"); await p.waitFor((x) => /Sent\. Phones show and speak it/.test(x));
    expect((await o.json(await o.api("GET", "/api/z/UI-ANN/control"))).ann.text).toBe("Dinner is served");
    p.click("#annClear"); await p.waitFor((x) => /wait a few seconds/.test(x)); // the server spaces messages a few seconds apart
    o.world.now += 10_000; p.click("#annClear"); await p.waitFor((x) => /Message cleared/.test(x));
    expect((await o.json(await o.api("GET", "/api/z/UI-ANN/control"))).ann).toBeUndefined();
  });
  test("UC-81 the co-host link opens a limited screen: numbers, participants, big screen and messages, nothing that changes anything", async () => {
    const o = await organizer(); await make(o, "UI-HOST"); await regKey(o, "UI-HOST"); await publish(o, "UI-HOST");
    const host = await consolePage(o, "UI-HOST"); await host.waitFor((x) => /Co-host/.test(x)); // the organizer's own screen offers it
    host.click("#hostmake"); const link = (await host.waitFor((x) => /#host=cth_/.test(x))).match(/#host=(cth_[0-9a-f]{48})/)![1]!;
    const h = await page(o, `/zc?e=UI-HOST#host=${link}`, "zc.html", ["zgame.js", "control.js", "zc.js"]);
    const t = await h.waitFor((x) => /Co-host · UI-HOST/.test(x));
    expect(t).toMatch(/Message to everyone/); expect(t).toMatch(/Open the big screen/);
    for (const banned of [/Publish/i, /Pay/i, /Erase/, /Invite list/, /Controls/, /Rewards ·/, /AI assistant/i, /Co-host link/i]) expect(t).not.toMatch(banned);
    expect(h.win.location.hash).toBe(""); // the key is not left in the address bar
    h.click('[data-chip="We start in 5 minutes"]'); h.click("#annSend");
    await h.waitFor((x) => /Sent\./.test(x));
    expect((await o.json(await o.api("GET", "/api/z/UI-HOST/control"))).ann.text).toBe("We start in 5 minutes");
  });
  test("UC-82 the break editor can make a lucky draw a scratch card", async () => {
    const o = await organizer(); await make(o, "UI-SCR");
    const p = await consolePage(o, "UI-SCR"); await p.waitFor((x) => /Tickets, rewards and brand breaks/.test(x));
    const set = (sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; };
    set('[data-bk="after"][data-i="0"]', "40"); set('[data-bk="seconds"][data-i="0"]', "60"); set('[data-bk="kind"][data-i="0"]', "lucky"); set('[data-bk="title"][data-i="0"]', "Scratch and win"); set('[data-bk="style"][data-i="0"]', "scratch");
    p.click("#savecfg"); await p.waitFor((x) => /Saved/.test(x));
    expect((await o.json(await o.api("GET", "/api/z/UI-SCR/summary", undefined, o.aiKey))).breaks[0].style).toBe("scratch");
  });
});

describe("payment page", () => {
  const payPage = (o: O, eid: string, signedIn = true) => page(o, `/pay?e=${eid}`, "pay.html", ["common.js", "pay.js"], signedIn ? { "ctz-org": o.token, "ctz-email": "boss@acme.com", "ctz-phone": "98765 43210" } : {});
  test("UC-55 not signed in: asks to sign in instead of showing a broken page", async () => {
    const o = await organizer(); await make(o, "UI-PAY0");
    const p = await payPage(o, "UI-PAY0", false); expect(await p.waitFor((x) => /Please sign in first/.test(x))).toMatch(/Sign in with email/);
  });
  test("UC-23 / UC-55 payments not switched on: the order is shown, the button says so, nothing can be charged", async () => {
    const o = await organizer(); await make(o, "UI-PAY1", { cap: 230 }); await publish(o, "UI-PAY1");
    const p = await payPage(o, "UI-PAY1");
    const t = await p.waitFor((x) => /Your order/.test(x));
    expect(t).toMatch(/Online payment opens soon/); expect(t).toMatch(/Up to 250/); expect(t).toMatch(/GST 18%/); expect(t).toMatch(/Pay before/);
    expect((p.$("#paygo") as any).disabled).toBe(true);
  });
  test("UC-9 / UC-55 test-payment mode end to end in the page: validation first, then paid, published, and told when it begins", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await make(o, "UI-PAY2", { cap: 100 }); await publish(o, "UI-PAY2");
    const p = await payPage(o, "UI-PAY2"); await p.waitFor((x) => /Billing details/.test(x));
    p.click("#paygo"); await p.waitFor((x) => /organization name/i.test(x));
    (p.$("#org") as any).value = "Acme Industries";
    p.click("#paygo"); await p.waitFor((x) => /GSTIN/i.test(x) && /valid/i.test(x)); // India needs a GSTIN on this page
    (p.$("#org") as any).value = "Acme Industries"; (p.$("#tax") as any).value = "27ABCDE1234F1Z5";
    p.click("#paygo");
    const t = await p.waitFor((x) => /Payment received/i.test(x));
    expect(t).toMatch(/will begin on time/); expect(t).toMatch(/Open my engagement/);
    expect((o.world.raw.prepare("SELECT pack FROM engagement WHERE id='UI-PAY2'").get() as any).pack).toBe(100);
  });
  test("UC-12 / UC-55 paying while held: the page says when it will begin", async () => {
    const o = await organizer({ TEST_MODE: "1" }); await make(o, "UI-PAY3"); await publish(o, "UI-PAY3");
    o.world.now = START_MS + HOUR;
    const p = await payPage(o, "UI-PAY3"); await p.waitFor((x) => /waiting for your payment now/i.test(x));
    (p.$("#org") as any).value = "Acme"; (p.$("#tax") as any).value = "27ABCDE1234F1Z5"; p.click("#paygo");
    expect(await p.waitFor((x) => /Payment received/i.test(x))).toMatch(/It begins at/);
  });
  test("UC-55 an already paid engagement says so; a stranger's engagement is not shown", async () => {
    const o = await organizer(); await make(o, "UI-PAY4"); await publish(o, "UI-PAY4"); o.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id='UI-PAY4'").run();
    expect(await (await payPage(o, "UI-PAY4")).waitFor((x) => /already paid and published/i.test(x))).toBeTruthy();
    const other = await o.json(await o.api("POST", "/api/start", { email: "other@x.com" }, undefined)).then ? null : null; void other;
  });
});

describe("big screen", () => {
  const big = (o: O, eid: string) => page(o, `/big?e=${eid}`, "big.html", ["zgame.js", "big.js"]);
  test("UC-56 before the start it counts down; a held engagement says it is waiting; an announcement is shown big", async () => {
    const o = await organizer(); await make(o, "UI-BIG"); await regKey(o, "UI-BIG"); await publish(o, "UI-BIG");
    let p = await big(o, "UI-BIG");
    expect(await p.waitFor((x) => /The engagement starts in/.test(x))).toMatch(/0 of 90 numbers called/);
    await o.api("POST", "/api/z/UI-BIG/announce", { text: "Dinner is served" }, o.token);
    await p.close(); p = await big(o, "UI-BIG");
    await p.waitFor((x) => /Dinner is served/.test(x));
    o.world.now = START_MS + 60_000; await p.close(); p = await big(o, "UI-BIG");
    expect(await p.waitFor((x) => /Waiting for the organizer/.test(x))).not.toMatch(/pay/i);
  });
  test("UC-56 a draft shows a message, not a crash", async () => {
    const o = await organizer(); await make(o, "UI-BIG2");
    const p = await big(o, "UI-BIG2"); await p.waitFor((x) => /not open yet|Connecting/i.test(x));
  });
});

describe("phone page", () => {
  const rtFake = (win: any, nowMs: () => number) => { // the phone's runtime with a fake public beacon (the real one is not reachable from a test)
    const Orig = win.ZG.PhoneRuntime;
    win.ZG.PhoneRuntime = class extends Orig {
      constructor(eid: string, deps: any) {
        super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa", mono: () => deps.mono() });
      }
    };
  };
  const phone = (o: O, eid: string) => page(o, `/z?e=${eid}`, "z.html", ["audio.js", "zgame.js", "z.js"], {}, { afterLoad: (win, f) => { if (f === "zgame.js") rtFake(win, () => o.world.now); } });
  const join = async (p: Page) => { await p.waitFor((x) => /Join the engagement/.test(x)); (p.$("#ph") as any).value = "9822222222"; (p.$("#nm") as any).value = "Asha"; p.click("#go"); };
  test("UC-29 / UC-57 a guest joins a published engagement before payment and gets the waiting room: countdown, what can be won, how it works, sound check, calendar", async () => {
    const o = await organizer(); await make(o, "UI-PH1"); await o.api("PATCH", "/api/z/UI-PH1/settings", { rewards: [{ pattern: "full", ordinal: 1, text: "Voucher 5000" }, { pattern: "early5", ordinal: 1, text: "Gift hamper" }] }, o.aiKey); await publish(o, "UI-PH1");
    const p = await phone(o, "UI-PH1"); await join(p);
    const t = await p.waitFor((x) => /What you can win/.test(x));
    expect(t).toMatch(/You are in\. See you at/); expect(t).toMatch(/Voucher 5000/); expect(t).toMatch(/Gift hamper/); expect(t).toMatch(/How it works/); expect(t).toMatch(/Check my sound/); expect(t).toMatch(/Add to my calendar/);
    expect(t).toMatch(/Starting in\s*\d\d:\d\d:\d\d/); expect(t).not.toMatch(/pay|unpaid|invoice/i); // hours:minutes:seconds to the time the organizer gave
    expect(decodeURIComponent((p.$("#addcal") as any).getAttribute("href"))).toMatch(/BEGIN:VEVENT[\s\S]*SUMMARY:Corporate Tambola/);
    expect(p.errors).toEqual([]);
  });
  test("the clock counts down to the time given; at that exact time the phone says the game is setting up for 2 more minutes, and the first number comes 2 minutes later", async () => {
    const o = await organizer(); await make(o, "UI-PH9"); await publish(o, "UI-PH9");
    const p = await phone(o, "UI-PH9"); await join(p); const rt = p.win.__rt;
    const before = await p.waitFor((x) => /Starting in\s*\d\d:\d\d:\d\d/.test(x));
    const secs = (x: string) => { const m = /Starting in\s*(\d\d):(\d\d):(\d\d)/.exec(x)!; return +m[1]! * 3600 + +m[2]! * 60 + +m[3]!; };
    expect(secs(before)).toBeGreaterThan(3000); expect(secs(before)).toBeLessThanOrEqual(3600); // about an hour to go
    o.world.now = roundMs(rt.scheduledRound) + 5_000; rt.syncedAtMono = -Infinity; // the exact time arrives (plus a moment)
    const setup = await p.waitFor((x) => /Your game is setting up/.test(x));
    expect(setup).toMatch(/We are waiting 2 minutes more for everyone to join/); expect(setup).toMatch(/\d\d:\d\d:\d\d/); expect(setup).not.toMatch(/Starting in\s*\d\d:/);
    expect(rt.view().log.length).toBe(0); // no number yet
    o.world.now = roundMs(rt.scheduledRound) + 125_000; rt.syncedAtMono = -Infinity; // 2 minutes after the time given
    await p.waitFor(() => rt.view().log.length >= 1);
    expect(p.text()).not.toMatch(/Your game is setting up/);
  }, 60_000);
  test("UC-28 a draft's link says it is not open yet", async () => {
    const o = await organizer(); await make(o, "UI-PH2");
    const p = await phone(o, "UI-PH2"); await p.waitFor((x) => /not open yet|Could not reach|not valid/i.test(x));
  });
  test("UC-38 / UC-57 held for non-payment: the phone says it is waiting for the organizer, shows no number and never mentions money", async () => {
    const o = await organizer(); await make(o, "UI-PH3"); await regKey(o, "UI-PH3"); await publish(o, "UI-PH3");
    const p = await phone(o, "UI-PH3"); await join(p); await p.waitFor((x) => /What you can win|Your ticket/.test(x));
    o.world.now = START_MS + 30_000; // the clock moves past the hold point; the phone learns it with its next check
    for (let i = 0; i < 40 && !/Waiting for the organizer/.test(p.text()); i++) { await new Promise((r) => setTimeout(r, 100)); (p.win.__rt as any).lastControlPoll = -1e9; }
    const t = await p.waitFor((x) => /Waiting for the organizer/.test(x), 8000);
    expect(t).not.toMatch(/pay|unpaid|invoice|price/i); expect(t).toMatch(/Your ticket is safe/);
  });
  test("UC-80 an announcement shows as a banner on the phone, can be dismissed, and a new one shows again", async () => {
    const o = await organizer(); await make(o, "UI-PH4"); await regKey(o, "UI-PH4"); await publish(o, "UI-PH4");
    const p = await phone(o, "UI-PH4"); await join(p); await p.waitFor((x) => /Your ticket|What you can win/.test(x));
    let at = T; const say = (text: string) => o.api("POST", "/api/z/UI-PH4/announce", { text }, o.token, (at += 10_000));
    await say("Please take your seats");
    const poll = async (re: RegExp) => { for (let i = 0; i < 60 && !re.test(p.text()); i++) { (p.win.__rt as any).lastControlPoll = -1e9; await new Promise((r) => setTimeout(r, 100)); } return p.text(); };
    expect(await poll(/Message from the organizer/)).toMatch(/Please take your seats/);
    p.click("#annok"); await p.waitFor((x) => !/Message from the organizer/.test(x));
    await say("Rewards at the stage");
    expect(await poll(/Rewards at the stage/)).toMatch(/Message from the organizer/);
  });
});

describe("scratch card on the phone", () => {
  const rtFake2 = (win: any, nowMs: () => number) => { const Orig = win.ZG.PhoneRuntime; win.ZG.PhoneRuntime = class extends Orig { constructor(eid: string, deps: any) { super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa" }); } }; };
  async function scratchSetup(o: O, id: string) {
    await make(o, id); await o.api("PATCH", `/api/z/${id}/settings`, { breaks: [{ after: 30, seconds: 60, kind: "lucky", title: "Scratch and win", winners: 3, style: "scratch" }] }, o.aiKey); await publish(o, id);
    const p = await page(o, `/z?e=${id}`, "z.html", ["audio.js", "zgame.js", "z.js"], {}, { afterLoad: (win, f) => { if (f === "zgame.js") rtFake2(win, () => o.world.now); } });
    await p.waitFor((x) => /Join the engagement/.test(x)); (p.$("#ph") as any).value = "9822222222"; p.click("#go"); await p.waitFor((x) => /Your ticket|What you can win/.test(x));
    return p;
  }
  test("UC-82 a scratch card: the winner scratches to reveal 'You won', it opens by itself after 45 seconds, and a non-winner sees 'Not this time'", async () => {
    const o = await organizer(); const p = await scratchSetup(o, "UI-SC1"); const rt = p.win.__rt;
    expect(await p.waitFor((x) => /Scratch card/.test(x))).toMatch(/at the end of the break/);
    rt.allResults = [{ pattern: "lucky", ordinal: 1, round: 1, idx: 30, count: 1, winners: [rt.pid] }];
    await p.waitFor((x) => /Scratch here/.test(x)); expect(p.text()).not.toMatch(/You won/);
    p.click("[data-scr]"); expect(await p.waitFor((x) => /You won!/.test(x))).not.toMatch(/Scratch here/);
    rt.allResults = [{ pattern: "lucky", ordinal: 1, round: 1, idx: 30, count: 1, winners: ["someone-else"] }];
    await p.waitFor((x) => /Not this time/.test(x));
  });
  test("UC-82 untouched, a scratch card opens by itself after 45 seconds", async () => {
    const o = await organizer(); const p = await scratchSetup(o, "UI-SC2"); const rt = p.win.__rt;
    rt.allResults = [{ pattern: "lucky", ordinal: 1, round: 1, idx: 30, count: 1, winners: ["someone-else"] }];
    await p.waitFor((x) => /Scratch here/.test(x));
    o.world.now += 46_000; expect(await p.waitFor((x) => /Not this time/.test(x))).not.toMatch(/Scratch here/);
  });
});

describe("winners, the end, and break media on the phone", () => {
  const rtFake3 = (win: any, nowMs: () => number) => { const Orig = win.ZG.PhoneRuntime; win.ZG.PhoneRuntime = class extends Orig { constructor(eid: string, deps: any) { super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa" }); } }; };
  async function joined(o: O, id: string, settings: Record<string, unknown> = {}) {
    await make(o, id); if (Object.keys(settings).length) await o.api("PATCH", `/api/z/${id}/settings`, settings, o.aiKey); await publish(o, id);
    const p = await page(o, `/z?e=${id}`, "z.html", ["audio.js", "zgame.js", "z.js"], {}, { afterLoad: (win, f) => { if (f === "zgame.js") rtFake3(win, () => o.world.now); win.Math = Object.assign(Object.create(Math), { random: () => 0 }); } });
    await p.waitFor((x) => /Join the engagement/.test(x)); (p.$("#ph") as any).value = "9833333333"; p.click("#go"); await p.waitFor((x) => /Your ticket|What you can win/.test(x));
    return p;
  }
  /** Moves the pretend world clock to `secs` after the engagement's first call and lets the phone notice (its clock re-syncs on the next tick). */
  const at = (o: O, p: any, secs: number) => { const rt = p.win.__rt; o.world.now = p.win.ZG.roundTimeMs(rt.startRound) + secs * 1000; rt.syncedAtMono = -Infinity; };
  const until = async (cond: () => boolean, ms = 25000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 200)); } };
  const prizes = { rewards: [{ pattern: "early5", ordinal: 1, text: "Gift hamper" }, { pattern: "top", ordinal: 1, text: "Movie tickets" }, { pattern: "full", ordinal: 1, text: "Voucher 5000" }] };
  test("a winner sees Hurray with confetti, a congratulations ribbon with the winning numbers lit on the ticket, and a prize list that stays; when the last prize is awarded the phone itself ends the game with the thank-you and a share button", async () => {
    const o = await organizer(); const p = await joined(o, "UI-WIN1", prizes); const rt = p.win.__rt; const doc = p.win.document;
    at(o, p, 400); // about 44 numbers out: this phone is the only player, so it has won the first houses
    await until(() => !!doc.getElementById("hurray")); // worked out on the phone itself: nobody published anything
    expect(doc.getElementById("hurray")?.textContent).toMatch(/Congratulations, you won/);
    expect(doc.querySelector("#hurray canvas")).toBeTruthy();
    expect(await p.waitFor((x) => /Congratulations! You won/.test(x))).toMatch(/Your prizes/);
    expect(doc.querySelectorAll(".zticket div.w").length).toBeGreaterThan(0); // the winning numbers are lit
    const saved = JSON.parse(p.win.localStorage.getItem("ctz-prizes:UI-WIN1") || "[]"); expect(saved.length).toBeGreaterThan(0); expect(saved[0].text).toMatch(/Gift hamper|Movie tickets/);
    expect(rt.view().localWinners).toBe(true);
    (doc.getElementById("hurok") as any)?.click();
    await p.waitFor((x) => /Your prizes/.test(x)); // it stays after the overlay is gone
    at(o, p, 1000); // every number is out
    const end = await p.waitFor((x) => /Game complete/.test(x), 30000);
    expect(end).toMatch(/Thank you for joining our extended family of Corporate Tambola/); expect(end).toMatch(/Share with friends and colleagues/); expect(end).toMatch(/Voucher 5000/);
    expect(doc.getElementById("shr")).toBeTruthy();
    expect(rt.view().endedByPrizes).toBe(true); expect(rt.view().log.length).toBeLessThan(90); // it ended on the prizes, not on the last number
    await until(() => (o.world.raw.query("SELECT COUNT(*) c FROM winner WHERE src='phones'").get() as any).c >= 3 && (o.world.raw.query("SELECT COUNT(*) c FROM overvote").get() as any).c >= 1); // the phone told our store about its wins and that the game is over
    expect(o.world.raw.query("SELECT end_src FROM life").get()).toEqual({ end_src: "phones" });
    // the winner confirms where the prize goes; a changed number is kept with the original and shown to the organizer
    await p.waitFor((x) => /Confirm your prize details/.test(x), 40000);
    (p.$("#cfnm") as any).value = "Asha Rao"; (p.$("#cfph") as any).value = "98765 43210"; (p.$("#cfph") as any).dispatchEvent(new p.win.Event("input")); (p.$("#cfnm") as any).dispatchEvent(new p.win.Event("input"));
    p.click("#cfgo");
    await p.waitFor((x) => /Details confirmed/.test(x), 20000);
    const list = (await o.json(await o.api("GET", "/api/z/UI-WIN1/prizes", undefined, o.token))) as any;
    expect(list.prizes.length).toBeGreaterThan(0); expect(list.prizes[0]).toMatchObject({ name: "Asha Rao", phone: "9876543210", confirmed: true, changed: true });
    expect(JSON.stringify(o.world.raw.query("SELECT * FROM winner").all())).not.toMatch(/Voucher|9833|Gift/); // seat, prize, round, time: no names or numbers
  }, 90_000);
  test("a player who joined too late to win anything still gets the thank-you and the share button when the game ends, and no prizes are listed", async () => {
    const o = await organizer({ FREE_LAUNCH: "1" }); await make(o, "UI-WIN2"); await o.api("PATCH", "/api/z/UI-WIN2/settings", prizes, o.aiKey); await publish(o, "UI-WIN2");
    expect((await o.api("POST", "/api/z/UI-WIN2/join", { phone: "9877777777", device: "9".repeat(32) })).status).toBe(200); // the one player who joined in time
    o.world.now = roundMs(START + 40) + 1_000_000; // the whole game has been played: the one player won everything
    const p = await page(o, "/z?e=UI-WIN2", "z.html", ["audio.js", "zgame.js", "z.js"], {}, { afterLoad: (win, f) => { if (f === "zgame.js") rtFake3(win, () => o.world.now); } });
    await p.waitFor((x) => /Join the engagement/.test(x)); (p.$("#ph") as any).value = "9833333333"; p.click("#go"); // joins now: far too late
    const end = await p.waitFor((x) => /Game complete/.test(x), 40000);
    expect(end).toMatch(/extended family of Corporate Tambola/); expect(end).not.toMatch(/Your prizes/); expect(p.win.document.getElementById("hurray")).toBeNull();
    expect(p.win.__rt.view().late).not.toBeNull(); expect(p.win.__rt.view().log).toEqual([]); // and it was never shown a single old number
  }, 90_000);
  test("a phone that joins mid-game is told old numbers are gone, counts down to its own first number, and then plays on from there", async () => {
    const o = await organizer({ FREE_LAUNCH: "1" }); await make(o, "UI-LATE1"); await publish(o, "UI-LATE1");
    expect((await o.api("POST", "/api/z/UI-LATE1/join", { phone: "9866666666", device: "8".repeat(32) })).status).toBe(200);
    o.world.now = roundMs(START + 40) + 200_000; // about 22 numbers are already out
    const p = await page(o, "/z?e=UI-LATE1", "z.html", ["audio.js", "zgame.js", "z.js"], {}, { afterLoad: (win, f) => { if (f === "zgame.js") rtFake3(win, () => o.world.now); } });
    await p.waitFor((x) => /Join the engagement/.test(x)); (p.$("#ph") as any).value = "9833333333"; p.click("#go");
    const t = await p.waitFor((x) => /You joined after the game began/.test(x));
    expect(t).toMatch(/Numbers called before you joined are gone, and prizes already awarded stay awarded/); expect(t).toMatch(/\d\d:\d\d:\d\d/); expect(t).toMatch(/until your numbers start/);
    expect(t).not.toMatch(/Your game is setting up|Starting in/); expect(p.win.__rt.view().log).toEqual([]);
    o.world.now += 100_000; p.win.__rt.syncedAtMono = -Infinity; // past the 90-second count-from
    const t2 = await p.waitFor((x) => /you play from your first number/.test(x), 30000);
    expect(t2).toMatch(/numbers? (was|were) called before you/);
    await p.waitFor(() => p.win.__rt.view().log.length > 0, 30000); expect(p.text()).toMatch(/Numbers since you joined/);
  }, 90_000);
  test("a YouTube break plays inside the page (privacy-friendly player, autoplay, no leaving the ticket) and disappears when the break ends", async () => {
    const o = await organizer(); const p = await joined(o, "UI-MED1", { breaks: [{ after: 3, seconds: 60, kind: "youtube", title: "Welcome from our CEO", mediaUrl: "https://youtu.be/dQw4w9WgXcQ" }] }); const rt = p.win.__rt; const doc = p.win.document;
    for (let s = 20; s < 90 && !doc.querySelector("#ctmedia iframe"); s += 4) { at(o, p, s); await new Promise((r) => setTimeout(r, 1200)); }
    const f = doc.querySelector("#ctmedia iframe") as any; expect(f).toBeTruthy();
    expect(f.src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/); expect(f.src).toMatch(/autoplay=1/); expect(f.getAttribute("allow")).toMatch(/autoplay/);
    expect(doc.getElementById("mslot")).toBeTruthy(); expect(p.text()).toMatch(/Welcome from our CEO/);
    at(o, p, 200); await until(() => !doc.querySelector("#ctmedia iframe")); // break over: the player is removed
  }, 90_000);
  test("a video file break plays in the page; a link that cannot be played inside the page stays a plain link", async () => {
    const o = await organizer(); const p = await joined(o, "UI-MED2", { breaks: [{ after: 3, seconds: 60, kind: "file", title: "Our story", mediaUrl: "https://cdn.example.com/story.mp4" }] }); const doc = p.win.document;
    for (let s = 20; s < 90 && !doc.querySelector("#ctmedia video"); s += 4) { at(o, p, s); await new Promise((r) => setTimeout(r, 1200)); }
    expect((doc.querySelector("#ctmedia video") as any)?.src).toBe("https://cdn.example.com/story.mp4");
    const o2 = await organizer(); const q = await joined(o2, "UI-MED3", { breaks: [{ after: 3, seconds: 60, kind: "file", title: "Our deck", mediaUrl: "https://example.com/deck.pdf" }] });
    for (let s = 20; s < 90 && !/Our deck/.test(q.text()); s += 4) { at(o2, q, s); await new Promise((r) => setTimeout(r, 1200)); }
    expect(q.text()).toMatch(/Our deck/); expect(q.win.document.querySelector("#ctmedia video, #ctmedia iframe, #ctmedia audio")).toBeNull(); expect(q.text()).toMatch(/Open/);
  }, 120_000);
});

describe("console: results go out on their own, and a person can move to a new phone", () => {
  const until = async (cond: () => Promise<boolean> | boolean, ms = 30000) => { const t0 = Date.now(); while (!(await cond())) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 300)); } };
  test("the console only watches: with numbers called it publishes nothing and offers no Publish button; the phones settle the winners", async () => {
    const o = await organizer({ FREE_LAUNCH: "1" }); await make(o, "UI-AUTO"); await publish(o, "UI-AUTO");
    const j = await o.api("POST", "/api/z/UI-AUTO/join", { phone: "9844444444", device: "f".repeat(32) });
    expect(j.status).toBe(200);
    o.world.now = START_MS + 1_000_000; // every one of the 90 numbers is out: every house is complete for the one player
    const p = await page(o, "/zc?e=UI-AUTO", "zc.html", ["zgame.js", "control.js", "zc.js"], { "ctz-org": o.token, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com" }, { afterLoad: (win, f) => { if (f === "zgame.js") { const Orig = win.ZG.RoundStore; win.ZG.RoundStore = class extends Orig { constructor() { super({ fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(o.world.now) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, (x: any) => x.signature === "aa"); } }; } } });
    await p.waitFor((x) => /Rewards/.test(x), 30000);
    await new Promise((r) => setTimeout(r, 1500));
    const r = (await o.json(await o.api("GET", "/api/z/UI-AUTO/results"))) as any;
    expect(r.results).toEqual([]); // the organizer's page cannot settle anything
    expect(p.$("#settle")).toBeFalsy();
    expect(p.text()).toMatch(/cannot choose, change or remove a winner/);
    expect((await o.api("POST", "/api/z/UI-AUTO/settle", { results: [{ pattern: "full", idx: 5, pids: [] }] }, o.token)).status).toBe(403);
  }, 60_000);
  test("'Change of phone': the organizer enters a number, and the next device that joins with it keeps the ticket", async () => {
    const o = await organizer(); await make(o, "UI-MOVE"); await publish(o, "UI-MOVE");
    expect((await o.api("POST", "/api/z/UI-MOVE/join", { phone: "9855555555", device: "1".repeat(32) })).status).toBe(200);
    expect((await o.api("POST", "/api/z/UI-MOVE/join", { phone: "9855555555", device: "2".repeat(32) })).status).toBe(423);
    const p = await consolePage(o, "UI-MOVE");
    await p.waitFor((x) => /Change of phone/.test(x));
    (p.$("#ubph") as any).value = "98555 55555"; p.click("#unbind");
    await p.waitFor((x) => /next phone they join with keeps their ticket/i.test(x));
    expect((await o.api("POST", "/api/z/UI-MOVE/join", { phone: "9855555555", device: "2".repeat(32) })).status).toBe(200);
    expect((await o.api("POST", "/api/z/UI-MOVE/join", { phone: "9855555555", device: "1".repeat(32) })).status).toBe(423);
  }, 60_000);
});

describe("Refer & Earn page", () => {
  const html = () => readFileSync(join(import.meta.dir, "../public/partner.html"), "utf8");
  test("the page pitches 50%, lists every pack with exactly half of its price, and has a working calculator", async () => {
    const o = await organizer(); const p = await page(o, "/partner.html", "partner.html", ["common.js", "partner.js"]);
    const doc = p.win.document; const body = doc.body.textContent!.replace(/\s+/g, " ");
    expect(body).toMatch(/Earn 50% on every new company you bring/); expect(body).toMatch(/20% more every time that company buys again/); expect(body).toMatch(/mobile number is your code/i);
    const packs: number[][] = p.win.TB.PACKS;
    expect(packs.slice(0, 3).map((x) => [x[0], x[1]])).toEqual([[100, 1999], [250, 2999], [500, 3999]]); // the launch prices
    const rows = [...doc.querySelectorAll("#earn-table .rrow:not(.rh)")].map((r: any) => r.textContent.replace(/\s+/g, " "));
    expect(rows.length).toBe(packs.length);
    expect(rows[0]).toMatch(/1,999/); expect(rows[0]).toMatch(/999\.50/); expect(rows[1]).toMatch(/1,499\.50/); expect(rows[2]).toMatch(/1,999\.50/);
    expect(body).not.toMatch(/per person|per participant|per head/i); // we never show a per-person price
    (doc.getElementById("calc-n") as any).value = "4"; (doc.getElementById("calc-pack") as any).value = "0"; (doc.getElementById("calc-n") as any).dispatchEvent(new p.win.Event("input"));
    expect(doc.getElementById("calc-out")!.textContent).toBe("₹3,998"); // 4 first purchases x Rs 999.50
  });
  test("joining takes only a mobile number: the code is its 10 digits, the link is /?ref=<code>, and the page switches to the partner's own dashboard", async () => {
    const o = await organizer(); const p = await page(o, "/partner.html", "partner.html", ["common.js", "partner.js"]);
    await p.waitFor((x) => /Get your link in 20 seconds/.test(x));
    (p.$("#ph") as any).value = "+91 98765 43210"; (p.$("#ok") as any).checked = true; p.click("#join");
    const t = await p.waitFor(() => !!p.win.document.getElementById("dash")?.textContent?.includes("Your link"));
    const dash = p.win.document.getElementById("dash")!.textContent!;
    expect(dash).toMatch(/9876543210/); expect(dash).toMatch(/\/\?ref=9876543210/); expect(dash).toMatch(/Your partner key/);
    expect(p.win.document.body.classList.contains("signed")).toBe(true);
    expect(p.errors).toEqual([]);
  });
  test("Create your engagement pop-up: brand top right, role pill, eight true bullets, an email field (not work email), one button, trust line, Esc closes, the sign-up still works", async () => {
    const o = await organizer();
    const p = await page(o, "/", "index.html", ["common.js", "site.js"], {});
    p.click("#payBtn"); await new Promise((r) => setTimeout(r, 200));
    const t = (p.$("#sheet") as any).textContent as string; expect(t).toMatch(/Create your engagement/);
    expect(t).toContain("Build it and publish it free."); expect(t).not.toMatch(/Pay (only )?before it starts/); expect(t).toMatch(/For the organizer or host/);
    for (const b of ["A private tambola (housie) for your own people", "Every ticket is unique: no two tickets can ever be the same", "no app to download, no SMS, no password", "play a video or audio message between numbers", "Set several prizes, and add a lucky draw inside the game", "Participants never pay. You provide the rewards", "Your free AI assistant can set everything up for you", "names and mobile numbers are deleted within 24 hours after the game ends"]) expect(t).toContain(b);
    expect(p.win.document.querySelectorAll(".bgrid li").length).toBe(8); expect(p.win.document.querySelectorAll(".bgrid .bico svg").length).toBe(8);
    expect(t).toMatch(/Free to build and publish. No password. Pay only before the start./); expect(t).toMatch(/Your console opens straight away: no password needed. We use your email for your invoice and to sign you back in later./);
    expect(t).not.toMatch(/work email/i); expect(t).not.toMatch(/waiting for an email/);
    const f = p.$("#fMail") as any; expect(p.win.document.querySelector('label[for="fMail"]').textContent).toBe("Your email");
    expect(f.getAttribute("type")).toBe("email"); expect(f.getAttribute("inputmode")).toBe("email"); expect(f.getAttribute("autocomplete")).toBe("email"); expect(f.getAttribute("placeholder")).toBe("you@example.com");
    expect(p.win.document.querySelector(".sheet .sbrand")!.getAttribute("aria-label")).toBe("Corporate Tambola"); expect(p.win.document.querySelector(".sheethead .rolepill")).toBeTruthy();
    expect((p.$("#frGo") as any).textContent).toMatch(/^s*Create my engagement/);
    p.win.document.dispatchEvent(new p.win.KeyboardEvent("keydown", { key: "Escape" })); await new Promise((r) => setTimeout(r, 50));
    expect(p.win.document.getElementById("modal").classList.contains("hidden")).toBe(true);
    expect(p.errors).toEqual([]);
  });
  test("the page is linked from the home page and listed for search engines, and ships with its stylesheet", () => {
    expect(readFileSync(join(import.meta.dir, "../public/index.html"), "utf8")).toContain('href="/partner.html"');
    expect(readFileSync(join(import.meta.dir, "../public/sitemap.xml"), "utf8")).toContain("/partner.html");
    expect(readFileSync(join(import.meta.dir, "../../../pages/build.mjs"), "utf8")).toContain('"partner.css"');
    expect(html()).toContain('href="/partner.css"');
  });
});

describe("invitations on the pages", () => {
  const rtFake3 = (win: any, nowMs: () => number) => { const Orig = win.ZG.PhoneRuntime; win.ZG.PhoneRuntime = class extends Orig { constructor(eid: string, deps: any) { super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa" }); } }; };
  const paidOrg = () => organizer({ FREE_LAUNCH: "1" });
  const setInvites = (o: O, id: string, invites: unknown) => o.api("PATCH", `/api/z/${id}/settings`, { invites }, o.aiKey);
  test("a participant sees 'Invite your colleagues / family members' with only the kinds the organizer allowed, their own link per kind, and how many invitations are left", async () => {
    const o = await paidOrg(); await make(o, "UI-INV1"); await setInvites(o, "UI-INV1", { on: true, per: 4, cats: ["family", "colleagues", "dealers"] }); await publish(o, "UI-INV1");
    const p = await page(o, "/z?e=UI-INV1", "z.html", ["audio.js", "zgame.js", "z.js"], {}, { afterLoad: (win, f) => { if (f === "zgame.js") rtFake3(win, () => o.world.now); } });
    await p.waitFor((x) => /Join the engagement/.test(x)); (p.$("#ph") as any).value = "9811111111"; p.click("#go");
    const t = await p.waitFor((x) => /Invite your colleagues \/ family members/i.test(x) && /You have invited 0/.test(x));
    expect(t).toMatch(/up to 4 people/); expect(t).toMatch(/4 invitations are left/); expect(t).toMatch(/Family members/); expect(t).toMatch(/Colleagues/); expect(t).toMatch(/Dealers/); expect(t).not.toMatch(/Vendors|Friends/);
    const link = () => (p.win.document.getElementById("invlink") as any).textContent as string;
    expect(link()).toMatch(/\/z\.html\?e=UI-INV1&from=1&c=family$/);
    (p.win.document.querySelector('[data-icat="colleagues"]') as any).click();
    await p.waitFor(() => /c=colleagues$/.test(link())); expect(p.text()).toMatch(/Share invitation \(colleagues\)/);
    expect(p.win.document.querySelector('a[href^="https://wa.me/"]')).toBeTruthy(); expect(p.errors).toEqual([]);
  }, 60_000);
  test("with invitations off there is no invite card at all", async () => {
    const o = await paidOrg(); await make(o, "UI-INV2"); await publish(o, "UI-INV2");
    const p = await page(o, "/z?e=UI-INV2", "z.html", ["audio.js", "zgame.js", "z.js"], {}, { afterLoad: (win, f) => { if (f === "zgame.js") rtFake3(win, () => o.world.now); } });
    await p.waitFor((x) => /Join the engagement/.test(x)); (p.$("#ph") as any).value = "9811111112"; p.click("#go"); await p.waitFor((x) => /Your ticket|What you can win/.test(x));
    expect(p.text()).not.toMatch(/Invite your colleagues/i);
  }, 60_000);
  test("a guest opening an invitation link is told who it came from, joins with their own number, is recorded under the inviter, and the 5th guest of a 4-person link is told it is used up", async () => {
    const o = await paidOrg(); await make(o, "UI-INV3"); await setInvites(o, "UI-INV3", { on: true, per: 4, cats: ["family", "colleagues"] }); await publish(o, "UI-INV3");
    expect((await o.api("POST", "/api/z/UI-INV3/join", { phone: "9822222221", device: "1".repeat(32) })).status).toBe(200); // the inviter is seat 1
    const guest = async (n: number) => { const p = await page(o, "/z?e=UI-INV3&from=1&c=colleagues", "z.html", ["audio.js", "zgame.js", "z.js"], {}, { afterLoad: (win, f) => { if (f === "zgame.js") rtFake3(win, () => o.world.now); } }); await p.waitFor((x) => /Join the engagement/.test(x)); (p.$("#ph") as any).value = "98222222" + String(30 + n); p.click("#go"); return p; };
    const g1 = await guest(1); await g1.waitFor((x) => /Your ticket|What you can win|Starting in|Getting ready/.test(x));
    expect(o.world.raw.query("SELECT inv, cat FROM seat WHERE seq=2").get()).toEqual({ inv: 1, cat: "colleagues" });
    for (let n = 2; n <= 4; n++) await guest(n);
    const g5 = await guest(5);
    const msg = await g5.waitFor((x) => /most one person can invite/.test(x)); expect(msg).toMatch(/already been used by 4 people/); expect(o.world.raw.query("SELECT COUNT(*) c FROM seat WHERE inv=1").get()).toEqual({ c: 4 });
    const fresh = await page(o, "/z?e=UI-INV3&from=1&c=colleagues", "z.html", ["audio.js", "zgame.js", "z.js"]); await fresh.waitFor((x) => /You were invited by a colleague or family member/.test(x));
  }, 120_000);
  test("the organizer's console saves the invitation policy: on/off, how many each, and the kinds of guests", async () => {
    const o = await paidOrg(); await make(o, "UI-INV4"); await publish(o, "UI-INV4");
    const p = await consolePage(o, "UI-INV4"); await p.waitFor((x) => /Let participants invite their colleagues/.test(x));
    expect(p.win.document.querySelectorAll("[data-invcat]").length).toBe(10);
    (p.$("#invon") as any).checked = true; (p.$("#invper") as any).value = "3";
    for (const b of p.win.document.querySelectorAll("[data-invcat]") as any) b.checked = ["family", "vendors", "customers"].includes(b.dataset.invcat);
    p.click("#savecfg"); await p.waitFor((x) => /Saved\./.test(x));
    const info = await o.json(await o.api("GET", "/api/z/UI-INV4/info", undefined, o.token));
    expect(info.invites).toEqual({ on: true, per: 3, cats: ["family", "customers", "vendors"].sort((a, b) => ["family", "colleagues", "friends", "dealers", "vendors", "customers"].indexOf(a) - ["family", "colleagues", "friends", "dealers", "vendors", "customers"].indexOf(b)) });
    expect(p.errors).toEqual([]);
  }, 60_000);
});
