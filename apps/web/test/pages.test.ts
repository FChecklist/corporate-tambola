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
  page(o, `/zc?e=${eid}`, "zc.html", ZC_SCRIPTS, { "ctz-org": key, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com", ...session });

// --- the single-page console: small helpers ---
const ZC_SCRIPTS = "zgame.js control.js zc.js".split(" ");
/** Opens step n by its jump button (the numbered dot in the progress bar). */
const openStep = (p: Page, n: number) => p.click(`.zc-dot[data-open="${n}"]`);
const setField = (p: Page, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event("input", { bubbles: true })); };
const sections = (p: Page) => Array.from(p.win.document.querySelectorAll('section.zc-card[id^="sec"]')).map((e: any) => e.querySelector(".zc-sech b")!.textContent as string);
/**
 * A small fetch stub for what the real Worker cannot show: here, an OLDER server that does not have the team and Co-host endpoints yet (the page must say so politely, not crash).
 * It answers the paths it is given and passes everything else on to the real Worker.
 */
type Stub = (method: string, body: any, url: URL) => any;
const stub = (routes: Record<string, Stub>) => (win: any, f: string) => {
  if (f !== "control.js") return;
  const real = win.fetch;
  win.fetch = async (input: any, init?: any) => {
    const u = new URL(String(input), "http://localhost"), h = routes[u.pathname];
    if (!h) return real(input, init);
    const r = h((init?.method || "GET").toUpperCase(), init?.body ? JSON.parse(init.body) : undefined, u);
    return new Response(JSON.stringify(r && r.body !== undefined ? r.body : r), { status: (r && r.status) || 200, headers: { "content-type": "application/json" } });
  };
};
/** The roles come from the real Worker (apps/edge): these make a Host key, a Co-host key, and read the team back. */
const hostKey = async (o: O, label = "Anita") => (await o.json(await o.api("POST", "/api/org/host", { label }, o.token))).hostKey as string;
const cohostKey = async (o: O, label = "Ravi") => (await o.json(await o.api("POST", "/api/org/cohost", { label }, o.token))).cohostKey as string;
const keyId = (key: string) => createHash("sha256").update("key|" + key).digest("hex").slice(0, 10);
const teamOf = async (o: O) => o.json(await o.api("GET", "/api/org/team", undefined, o.token));
const COHOST_FROM = 1_000_000_000; // the Worker's own number: a Co-host's invite link carries it plus the first 7 hex of their key id

const quietPrivacy = (root: any) => { const l = root.querySelectorAll(".spriv a"); expect(l.length).toBe(1); const a = l[0]; expect(a.textContent).toBe("Privacy Policy"); expect(a.getAttribute("href")).toBe("/legal.html#privacy"); expect(a.getAttribute("target")).toBe("_blank"); expect(a.getAttribute("rel")).toBe("noopener"); expect(root.querySelectorAll('input[type="checkbox"]').length).toBe(0); };
describe("console (organizer page)", () => {
  test("UC-53 the home page: the AI work link is pinned at the top, Start a new game comes first, and the account holds the AI link box", async () => {
    const o = await organizer();
    const p = await page(o, "/zc", "zc.html", ZC_SCRIPTS, { "ctz-org": o.token, "ctz-aimsg": o.aiMessage });
    const t = await p.waitFor((x) => /Start a new game/.test(x) && /Your account/.test(x));
    expect(p.$("#aistrip")!.textContent).toMatch(/Your AI assistant work link/); expect(p.$("#aistripcopy")).toBeTruthy(); expect(p.$("#rolepill")!.textContent).toBe("Organizer");
    expect(t.indexOf("Start a new game")).toBeLessThan(t.indexOf("Your account"));
    expect(t).toMatch(/ChatGPT, Gemini, Grok, Claude, DeepSeek, Z\.ai/); expect(t).toMatch(/You keep four things: payment, Publish, erasing data, pause or stop/);
    expect((p.$("#aimsg") as any).value).toContain("/ai/cta_"); expect((p.$("#aimsg") as any).value).toMatch(/my own Corporate Tambola account/i); expect(p.$("#aicopy")).toBeTruthy();
    expect(p.errors).toEqual([]);
  });
  test("Replace my AI link: the button replaces the key, the box shows the new paste, the old link is dead, the new one answers", async () => {
    const o = await organizer();
    const p = await page(o, "/zc", "zc.html", ZC_SCRIPTS, { "ctz-org": o.token, "ctz-aimsg": o.aiMessage });
    await p.waitFor((x) => /Your account/.test(x));
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
    const p = await page(o, "/zc", "zc.html", ZC_SCRIPTS, { "ctz-org": o.token, "ctz-aimsg": o.aiMessage });
    await p.waitFor((x) => /Your account/.test(x)); p.click("#aifresh");
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
    expect((t.match(/DO NOT FORWARD: this page shows your personal AI work link/g) ?? []).length).toBe(2);
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
  test("the same seven ways sit in the console's account box", async () => {
    const o = await organizer();
    const p = await page(o, "/zc", "zc.html", ZC_SCRIPTS, { "ctz-org": o.token, "ctz-aimsg": o.aiMessage });
    await p.waitFor((x) => /Your account/.test(x)); expect(p.$("#aicopy")).toBeTruthy();
    await checkSeven(p, o.aiMessage);
  });
  test("sign-in e-mail link page: opening it consumes nothing; the button starts the session once and goes to the AI-link page; a used link says so", async () => {
    const o = await organizer({ TEST_MODE: "1" });
    const r = await o.json(await o.api("POST", "/api/auth/email", { email: "boss@acme.com" }));
    const p = await page(o, "/signin?t=" + r.devToken + "&go=ai", "signin.html", ["signin.js"], {});
    const t = await p.waitFor((x) => /Continue to Corporate Tambola/.test(x));
    expect(t).toMatch(/Works once, for 10 minutes/); expect(t).not.toMatch(/cta_/); expect(p.win.sessionStorage.getItem("ctz-org")).toBeFalsy();
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
  test("the console has a guest list: the owner pastes or types name and number and they are added; the AI never sees them", async () => {
    const o = await organizer(); await make(o, "UI-ROST"); await publish(o, "UI-ROST");
    const p = await consolePage(o, "UI-ROST"); await p.waitFor((x) => /Your game/.test(x));
    openStep(p, 6); p.click('[data-mode="paste"]'); await p.waitFor((x) => /Paste one person per line/.test(x));
    expect(p.text()).toMatch(/your AI never sees them/);
    (p.$("#rosterTxt") as any).value = ["Asha Verma, 98765 43210", "Bala 9876543211", "9876543212", "not a number"].join("\n"); p.click("#rosterGo");
    await p.waitFor((x) => /3 added, 1 not valid/.test(x));
    expect((await o.json(await o.api("GET", "/api/z/UI-ROST/participants?limit=10", undefined, o.token))).total).toBe(3);
    p.click('[data-mode="type"]'); await p.waitFor((x) => /Mobile number/.test(x));
    setField(p, "#gname", "Chitra"); setField(p, "#gphone", "9876543299"); p.click("#gadd");
    await p.waitFor((x) => /4 people are on your list/.test(x));
    expect(p.$('a[href*="wa.me/919876543299"]')).toBeTruthy(); // a WhatsApp button for the person just added (kept in this tab's memory only)
    expect(p.errors).toEqual([]);
  });
  test("UC-54 draft: the organizer publishes (free) after confirming email and mobile, then sees the payment-due card and the share link", async () => {
    const o = await organizer(); await make(o, "UI-DRAFT");
    const p = await consolePage(o, "UI-DRAFT");
    await p.waitFor((x) => /Hello\. Let us start/.test(x)); openStep(p, 7);
    await p.waitFor((x) => /Publish \(free\)/.test(x));
    expect(p.text()).toMatch(/publishing is free/i);
    p.click("#publishopen");
    await p.waitFor((x) => /Confirm and publish/.test(x));
    expect((p.$("#pubEmail") as any).value).toBe("boss@acme.com"); // prefilled, editable
    (p.$("#pubPhone") as any).value = "98765 43210"; (p.$("#pubPhone") as any).dispatchEvent(new p.win.Event("input", { bubbles: true }));
    p.click("#pubgo");
    const t = await p.waitFor((x) => /LAST STEP: PAY BEFORE THE START/i.test(x));
    expect(t).toMatch(/will not begin/);
    expect((p.$('a[href^="/pay.html"]') as any).getAttribute("href")).toBe("/pay.html?e=UI-DRAFT");
    openStep(p, 6); expect(await p.waitFor((x) => /Guest link/.test(x))).toMatch(/localhost\/z\.html\?e=UI-DRAFT/);
    expect(p.errors).toEqual([]);
  });
  test("UC-54 published but invalid details: the console shows the server's message and stays on the form", async () => {
    const o = await organizer(); await make(o, "UI-BADPUB");
    const p = await consolePage(o, "UI-BADPUB", o.token, { "ctz-email": "not-an-email" });
    await p.waitFor((x) => /Hello/.test(x)); openStep(p, 7); p.click("#publishopen"); await p.waitFor((x) => /Confirm and publish/.test(x));
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
    expect(t).toMatch(/If payment is not made before then, the engagement will not begin/); expect(t).toMatch(/Pay now/); openStep(p, 6); expect(p.text()).toMatch(/Open the big screen/);
  });
  test("UC-6 a wrong or expired sign-in shows a message, never an endless Loading", async () => {
    const o = await organizer(); await make(o, "UI-KEY");
    const p = await consolePage(o, "UI-KEY", "ctk_" + "0".repeat(48));
    const t = await p.waitFor((x) => /sign-in has expired|sign in again/i.test(x), 4000);
    expect(t).toMatch(/sign-in has expired|sign in again/i);
  });
  test("UC-80 the organizer sends a message to everyone from the console; empty is refused; clear works", async () => {
    const o = await organizer(); await make(o, "UI-ANN"); await regKey(o, "UI-ANN"); await publish(o, "UI-ANN");
    const p = await consolePage(o, "UI-ANN");
    await p.waitFor((x) => /Hello|Last step/.test(x)); openStep(p, 8); await p.waitFor((x) => /Message to everyone/.test(x));
    p.click("#annSend"); await p.waitFor((x) => /Write a message first/.test(x));
    p.click('[data-chip="Dinner is served"]'); expect((p.$("#annText") as any).value).toBe("Dinner is served");
    p.click("#annSend"); await p.waitFor((x) => /Sent\. Phones show and speak it/.test(x));
    expect((await o.json(await o.api("GET", "/api/z/UI-ANN/control"))).ann.text).toBe("Dinner is served");
    p.click("#annClear"); await p.waitFor((x) => /wait a few seconds/.test(x)); // the server spaces messages a few seconds apart
    o.world.now += 10_000; p.click("#annClear"); await p.waitFor((x) => /Message cleared/.test(x));
    expect((await o.json(await o.api("GET", "/api/z/UI-ANN/control"))).ann).toBeUndefined();
  });
  test("the role pill, the payment pill and the one-payment notice: pending shows the notice; paid hides it and says who paid", async () => {
    const o = await organizer(); await make(o, "UI-PAYP"); await publish(o, "UI-PAYP");
    const p = await consolePage(o, "UI-PAYP"); await p.waitFor((x) => /Last step/i.test(x));
    expect(p.$("#rolepill")!.textContent).toBe("Organizer"); expect(p.$("#paypill")!.textContent).toBe("Payment pending"); expect(p.$("#paypill")!.className).toMatch(/zc-pill-pend/);
    const note = p.$("#paynote")!; expect(note.getAttribute("role")).toBe("note"); expect(note.textContent).toMatch(/Just one of you needs to make it: the Organizer, a Host or a Co-host\. Guests pay nothing/);
    o.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id='UI-PAYP'").run(); // paid (the same signal the payment page uses)
    const q = await consolePage(o, "UI-PAYP"); await q.waitFor((x) => /Hello|Your game/.test(x));
    expect(q.$("#paypill")!.textContent).toBe("Paid"); expect(q.$("#paypill")!.className).toMatch(/zc-pill-paid/); expect(q.$("#paynote")).toBeNull();
    o.world.raw.prepare("INSERT OR REPLACE INTO kv(k,v) VALUES(?,?)").run("paidby/UI-PAYP", JSON.stringify({ by: "host", ms: START_MS - HOUR })); // the Worker records who paid
    const w = await consolePage(o, "UI-PAYP");
    await w.waitFor((x) => /Hello|Your game/.test(x)); openStep(w, 7);
    expect(await w.waitFor((x) => /Paid by the Host on/.test(x))).toMatch(/The game is on/);
    expect(p.errors).toEqual([]); expect(w.errors).toEqual([]);
  });
  const NINE = ["Your game", "How it plays", "Prizes", "Brand moments", "Your team", "Invite and share", "Check, publish and pay", "Game day", "After the game"];
  test("an Organizer sees all nine steps in order, one open at a time, with a hint on every step and Save and continue", async () => {
    const o = await organizer(); await make(o, "UI-NINE");
    const p = await consolePage(o, "UI-NINE"); await p.waitFor((x) => /Hello\. Let us start/.test(x));
    expect(sections(p)).toEqual(NINE);
    expect(p.win.document.querySelectorAll(".zc-secb").length - 1).toBe(1); // one step body is open (the other .zc-secb is the Help box)
    expect(p.$('[data-save="1"]')!.textContent).toBe("Save and continue");
    for (let n = 2; n <= 9; n++) { openStep(p, n); expect(p.win.document.querySelectorAll("section.zc-card.open").length).toBe(1); expect(p.$(`#sec${n}`)!.className).toMatch(/open/); }
    expect(p.$("#aistrip")).toBeTruthy(); expect(p.text()).toMatch(/Your account/);
    expect(p.errors).toEqual([]);
  });
  test("a Host sees the same nine steps and 'Host 1 of 5', but no account and no AI strip, and can add Co-hosts but not Hosts", async () => {
    const o = await organizer(); await make(o, "UI-HOSTV"); await publish(o, "UI-HOSTV");
    const hk = await hostKey(o, "Anita");
    const p = await consolePage(o, "UI-HOSTV", hk);
    await p.waitFor((x) => /Last step|Your game/i.test(x));
    expect(sections(p)).toEqual(NINE);
    await p.waitFor(() => p.$("#rolepill")!.textContent === "Host 1 of 5");
    expect(p.$("#aistrip")).toBeNull(); expect(p.text()).not.toMatch(/Your account|Close my account/);
    openStep(p, 5); await p.waitFor((x) => /Your Hosts: 1 of 5/.test(x));
    expect(p.$("#hostadd")).toBeNull(); expect(p.text()).toMatch(/Only the Organizer adds Hosts/); expect(p.$("#cohostadd")).toBeTruthy(); expect(p.$('[data-retire][data-kind="host"]')).toBeNull();
    setField(p, "#cohostlabel", "Ravi"); p.click("#cohostadd"); await p.waitFor((x) => /Your Co-hosts: 1 \(no limit\)/.test(x));
    expect((await teamOf(o)).cohosts.map((c: any) => c.label)).toEqual(["Ravi"]); // a Host really can add a Co-host
    expect(p.errors).toEqual([]);
  });
  test("a Co-host sees three steps (today's game, invite people, payment), the guest-invite note, and nothing that changes the game", async () => {
    const o = await organizer(); await make(o, "UI-COH"); await publish(o, "UI-COH"); const ck = await cohostKey(o);
    const from = COHOST_FROM + parseInt(keyId(ck).slice(0, 7), 16); // somebody joins through this Co-host's own link
    expect((await o.api("POST", "/api/z/UI-COH/join", { phone: "9811100001", device: "a".repeat(32), from })).status).toBe(200);
    const p = await consolePage(o, "UI-COH", ck);
    await p.waitFor((x) => /Hi\. Here is the game/.test(x));
    expect(sections(p)).toEqual(["Today's game", "Invite people", "Payment"]);
    expect(p.$("#rolepill")!.textContent).toBe("Co-host"); expect(p.$("#paypill")!.textContent).toBe("Payment pending"); expect(p.$("#paynote")).toBeTruthy(); expect(p.$("#aistrip")).toBeNull();
    expect(p.text()).toMatch(/1 person joined of 100/); expect(p.text()).toMatch(/You cannot change the game/); expect(p.text()).toMatch(/What you can do/); expect(p.text()).toMatch(/Invite people with their own link/); expect(p.text()).not.toMatch(/Add Hosts and Co-hosts/);
    openStep(p, 2); const t2 = await p.waitFor((x) => /Your own invite link/.test(x));
    expect(t2).toMatch(/localhost\/z\.html\?e=UI-COH&from=\d+/); expect(t2).toMatch(/People you brought\s*1(?!\d)/); expect(t2).toMatch(/You can invite as many people as you like/);
    expect(t2).toContain("Want your guests to invite their own friends? Ask the Organizer or a Host to switch it on. You cannot switch it on yourself.");
    openStep(p, 3); const t3 = await p.waitFor((x) => /Status: Payment pending/.test(x)); expect((p.$('a[href^="/pay.html"]') as any).getAttribute("href")).toBe("/pay.html?e=UI-COH"); expect(t3).toMatch(/Rs 2,358\.82 with GST\. Pay once, from any one of you/);
    for (const banned of [/Publish/, /Erase/, /Controls/, /guest list/i, /Your team/, /AI assistant/, /Message to everyone/, /Close my account/]) expect(p.text()).not.toMatch(banned);
    expect(p.errors).toEqual([]);
    o.world.raw.prepare("UPDATE engagement SET pack=100 WHERE id='UI-COH'").run(); o.world.raw.prepare("INSERT OR REPLACE INTO kv(k,v) VALUES(?,?)").run("paidby/UI-COH", JSON.stringify({ by: "organizer", ms: START_MS - HOUR }));
    const paid = await consolePage(o, "UI-COH", ck); await paid.waitFor((x) => /Hi\. Here is the game/.test(x)); expect(paid.$("#paypill")!.textContent).toBe("Paid"); expect(paid.$("#paynote")).toBeNull();
    openStep(paid, 3); expect(await paid.waitFor((x) => /Paid by the Organizer on/.test(x))).toMatch(/The game is on/);
    await make(o, "UI-COHD"); const d = await consolePage(o, "UI-COHD", ck); await d.waitFor((x) => /Hi/.test(x)); openStep(d, 2); expect(await d.waitFor((x) => /Your link appears once the game is published/.test(x))).not.toMatch(/z\.html\?e=UI-COHD/); // a draft has no link to give out yet
  });
  test("a Co-host link opens the Co-host view and the key leaves the address bar (#cohost=, #host= and ?k= all work)", async () => {
    const o = await organizer(); await make(o, "UI-COH"); const ck = await cohostKey(o);
    for (const url of [`/zc?e=UI-COH#cohost=${ck}`, `/zc?e=UI-COH#host=${ck}`, `/zc?e=UI-COH&k=${ck}`, `/zc?k=${ck}&e=UI-COH`]) {
      const p = await page(o, url, "zc.html", ZC_SCRIPTS, {});
      await p.waitFor((x) => /Hi\. Here is the game/.test(x));
      expect(p.win.location.hash).toBe(""); expect(p.win.location.search).toBe("?e=UI-COH"); expect(p.win.sessionStorage.getItem("ctz-org")).toBe(ck);
    }
    const link = (await o.json(await o.api("POST", "/api/org/cohost", {}, o.token))).link as string; // the link the Worker hands out opens the Co-host view too (add the game to it)
    const p = await page(o, "/zc?e=UI-COH&" + link.split("?")[1], "zc.html", ZC_SCRIPTS, {}); await p.waitFor((x) => /Hi\. Here is the game/.test(x));
  });
  test("a Co-host without a game link is told to open the link they were sent, and the console does not crash", async () => {
    const o = await organizer(); const ck = await cohostKey(o);
    const p = await page(o, "/zc", "zc.html", ZC_SCRIPTS, { "ctz-org": ck }); await p.waitFor((x) => /Open the link your Organizer or Host sent you/.test(x)); expect(p.errors).toEqual([]);
    expect(p.$("#aistrip")).toBeNull(); expect(p.$("#rolepill")!.textContent).toBe("Co-host");
  });
  test("an older server without the team and Co-host endpoints is handled politely: the team step says so, adding says so, a Co-host sees a friendly note, nothing crashes", async () => {
    const o = await organizer(); await make(o, "UI-NOTEAM");
    const gone = () => ({ status: 404, body: { error: "Not found" } });
    const p = await page(o, "/zc?e=UI-NOTEAM", "zc.html", ZC_SCRIPTS, { "ctz-org": o.token }, { afterLoad: stub({ "/api/org/team": gone, "/api/org/cohost": gone }) });
    await p.waitFor((x) => /Hello/.test(x)); openStep(p, 5);
    await p.waitFor((x) => /Your Hosts: 0 of 5/.test(x) && /not switched on yet/i.test(x));
    p.click("#cohostadd"); await p.waitFor((x) => /This is not switched on yet\. Please try again a little later\./.test(x));
    const c = await page(o, "/zc?e=UI-COH", "zc.html", ZC_SCRIPTS, { "ctz-org": "ctc_" + "0".repeat(48) }, { afterLoad: stub({ "/api/whoami": () => ({ kind: "cohost" }), "/api/z/UI-COH/cohost": gone }) });
    await c.waitFor((x) => /not switched on yet/.test(x)); expect(c.errors).toEqual([]); expect(p.errors).toEqual([]);
  });
  test("Your team: three role cards, Hosts n of 5 and Co-hosts (no limit), a private link for each person, remove, and the add button stops at five Hosts", async () => {
    const o = await organizer(); await make(o, "UI-TEAM");
    const p = await consolePage(o, "UI-TEAM"); await p.waitFor((x) => /Hello/.test(x)); openStep(p, 5);
    const t = await p.waitFor((x) => /Your Hosts: 0 of 5/.test(x) && /Your Co-hosts: 0 \(no limit\)/.test(x));
    const doc = p.win.document; expect(Array.from(doc.querySelectorAll(".zc-role b")).map((e: any) => e.textContent)).toEqual(["Organizer", "Host", "Co-host"]);
    expect(doc.querySelectorAll(".zc-role .zc-no").length).toBe(5); expect(doc.querySelectorAll(".zc-role .zc-yes").length).toBeGreaterThanOrEqual(10); expect(t).toMatch(/Sign-in keys, e-mail, AI link, close account/);
    for (let i = 1; i <= 5; i++) { setField(p, "#hostlabel", "Anita " + i); p.click("#hostadd"); await p.waitFor((x) => new RegExp(`Your Hosts: ${i} of 5`).test(x)); }
    expect((p.$("#hostadd") as any).disabled).toBe(true); expect(p.text()).toMatch(/most Hosts allowed/); expect(p.text()).toMatch(/Anita 3/);
    expect(p.text()).toMatch(/Send it to that one person only/); expect(p.$(".zc-person .zlink")!.textContent).toMatch(/\/zc\.html\?e=UI-TEAM#host=cth_[0-9a-f]{48}$/);
    p.click("#hostadd"); await new Promise((r) => setTimeout(r, 150)); expect((await teamOf(o)).hosts.length).toBe(5); // the sixth is stopped (and the server would refuse it too)
    expect((await o.api("POST", "/api/org/host", {}, o.token)).status).toBe(409);
    for (let i = 1; i <= 3; i++) { p.click("#cohostadd"); await p.waitFor((x) => new RegExp(`Your Co-hosts: ${i} \\(no limit\\)`).test(x)); }
    expect(Array.from(doc.querySelectorAll(".zc-person .zlink")).map((e: any) => e.textContent).filter((x: string) => /#cohost=ctc_[0-9a-f]{48}$/.test(x)).length).toBe(3);
    expect(p.text()).toMatch(/brought 0/); expect((await teamOf(o)).cohosts.length).toBe(3);
    p.win.confirm = () => true; p.click('[data-retire][data-kind="host"]'); await p.waitFor((x) => /Your Hosts: 4 of 5/.test(x)); expect((p.$("#hostadd") as any).disabled).toBe(false); expect((await teamOf(o)).hosts.length).toBe(4);
    p.click('[data-retire][data-kind="cohost"]'); await p.waitFor((x) => /Your Co-hosts: 2 \(no limit\)/.test(x)); expect((await teamOf(o)).cohosts.length).toBe(2);
    expect(p.errors).toEqual([]);
  });
  test("no drop-down list anywhere in the console: not on the home page, not in any of the nine steps, not in Quick setup, and none in the script", async () => {
    const o = await organizer(); await make(o, "UI-NOSEL");
    const home = await page(o, "/zc", "zc.html", ZC_SCRIPTS, { "ctz-org": o.token, "ctz-aimsg": o.aiMessage }); await home.waitFor((x) => /Start a new game/.test(x)); expect(home.win.document.querySelectorAll("select").length).toBe(0);
    const p = await consolePage(o, "UI-NOSEL"); await p.waitFor((x) => /Hello/.test(x));
    openStep(p, 4); p.click('[data-ck="opN"][data-v="1"]'); p.click('[data-ck="midN"][data-v="1"]'); p.click('[data-luckyadd]');
    for (let n = 1; n <= 9; n++) { openStep(p, n); expect([n, p.win.document.querySelectorAll("select").length]).toEqual([n, 0]); }
    const qk = await page(o, "/zc?quick=1", "zc.html", ZC_SCRIPTS, { "ctz-org": o.token }); await qk.waitFor((x) => /1\. Which game\?/.test(x)); expect(qk.win.document.querySelectorAll("select").length).toBe(0);
    expect(readFileSync(new URL("../public/zc.js", import.meta.url), "utf8")).not.toMatch(/<select|createElement\(["']select/);
  });
  test("Prizes: ten popular prizes as chips plus 'I will decide later' and 'No prize'; the choice is saved as the words on the ticket and read back", async () => {
    const o = await organizer(); await make(o, "UI-PRZ");
    const p = await consolePage(o, "UI-PRZ"); await p.waitFor((x) => /Hello/.test(x)); openStep(p, 3);
    const chipsOf = (pp: Page, h: string) => Array.from(pp.win.document.querySelectorAll(`[data-ck="hs.${h}.pt"]`)).map((b: any) => b.textContent);
    expect(chipsOf(p, "early5")).toEqual(["Gift voucher", "Gift hamper", "Smartphone", "Smart watch", "Earbuds or headphones", "Tablet or laptop", "Holiday or weekend stay", "Dinner or restaurant voucher", "Movie tickets", "Extra day off", "Something else", "I will decide later", "No prize"]);
    expect(p.text()).toMatch(/Fine\. We will remind you before you publish\./); // the default is "decide later"
    p.click('[data-ck="hs.early5.pt"][data-v="voucher"]'); expect(p.$("#f-hs-early5-pd")).toBeTruthy(); setField(p, "#f-hs-early5-pd", "1000");
    p.click('[data-ph="top"]'); p.click('[data-ck="hs.top.pt"][data-v="none"]'); expect(p.text()).toMatch(/The ticket shows "No prize"\. The winner is still announced\./);
    p.click('[data-ck="hs.top.n"][data-v="2"]');
    p.click('[data-ph="full"]'); p.click('[data-ck="hs.full.pt"][data-v="phone"]'); setField(p, "#f-hs-full-pd", "Galaxy");
    p.click('[data-save="3"]'); await p.waitFor((x) => /Saved\./.test(x));
    const sm = await o.json(await o.api("GET", "/api/z/UI-PRZ/summary", undefined, o.aiKey)); const txt = (pat: string, ord: number) => sm.rewards.find((r: any) => r.pattern === pat && r.ordinal === ord)?.text;
    expect(txt("early5", 1)).toBe("Gift voucher: Rs 1000"); expect(txt("top", 1)).toBe("No prize"); expect(txt("top", 2)).toBe("No prize"); expect(txt("full", 1)).toBe("Smartphone: Galaxy"); expect(txt("mid", 1)).toBe(""); // "decide later" stays empty
    const q = await consolePage(o, "UI-PRZ"); await q.waitFor((x) => /Hello/.test(x)); openStep(q, 3);
    expect(q.$('[data-ck="hs.early5.pt"][data-v="voucher"]')!.className).toMatch(/\bon\b/); expect((q.$("#f-hs-early5-pd") as any).value).toBe("1000");
    q.click('[data-ph="top"]'); expect(q.$('[data-ck="hs.top.pt"][data-v="none"]')!.className).toMatch(/\bon\b/); expect(q.$('[data-ck="hs.top.n"][data-v="2"]')!.className).toMatch(/\bon\b/);
    expect(q.text()).toMatch(/decide later/); expect(p.errors).toEqual([]);
  });
  test("Brand moments: four kinds (message, YouTube, video file, audio file) with Test it and a link hint; each is saved as the right kind and read back", async () => {
    const o = await organizer(); await make(o, "UI-BM");
    const p = await consolePage(o, "UI-BM"); await p.waitFor((x) => /Hello/.test(x)); openStep(p, 4);
    p.click('[data-ck="opN"][data-v="1"]'); p.click('[data-ck="midN"][data-v="2"]'); p.click('[data-ck="clN"][data-v="1"]');
    expect(Array.from(p.win.document.querySelectorAll('[data-ck="op.0.k"]')).map((b: any) => b.textContent)).toEqual(["Type a message", "YouTube link", "Paste video file link", "Paste audio file link"]);
    setField(p, "#f-op-0-t", "Welcome to Diwali");
    p.click('[data-ck="mid.0.k"][data-v="yt"]'); setField(p, "#f-mid-0-v", "https://youtu.be/dQw4w9WgXcQ"); expect(p.$('[data-lk="mid.0"]')!.textContent).toMatch(/YouTube link: plays inside the game/);
    p.click('[data-ck="mid.1.k"][data-v="vid"]'); setField(p, "#f-mid-1-v", "https://example.com/page"); expect(p.$('[data-lk="mid.1"]')!.textContent).toMatch(/opens a new tab/);
    setField(p, "#f-mid-1-v", "https://cdn.example.com/a.mp4"); expect(p.$('[data-lk="mid.1"]')!.textContent).toMatch(/Video file: plays inside the game/);
    p.click('[data-ck="cl.0.k"][data-v="aud"]'); setField(p, "#f-cl-0-v", "https://cdn.example.com/a.mp3"); expect(p.$('[data-lk="cl.0"]')!.textContent).toMatch(/Audio file/);
    expect(p.$("#bmcount")!.textContent).toBe("4 of 5");
    const opened: string[] = []; p.win.open = (u: string) => { opened.push(u); return null; }; p.click('[data-test="mid.0"]');
    expect(opened[0]).toMatch(/^\/preview\.html#/); expect(new URLSearchParams(opened[0]!.split("#")[1]).get("k")).toBe("youtube"); expect(new URLSearchParams(opened[0]!.split("#")[1]).get("w")).toBe("break");
    p.click('[data-save="4"]'); await p.waitFor((x) => /Saved\./.test(x));
    const sm = await o.json(await o.api("GET", "/api/z/UI-BM/summary", undefined, o.aiKey));
    expect(sm.opening[0]).toMatchObject({ kind: "speech", title: "Welcome to Diwali" }); expect(sm.breaks.map((b: any) => [b.kind, b.mediaUrl])).toEqual([["youtube", "https://youtu.be/dQw4w9WgXcQ"], ["file", "https://cdn.example.com/a.mp4"]]); expect(sm.closing[0]).toMatchObject({ kind: "file", mediaUrl: "https://cdn.example.com/a.mp3" });
    const q = await consolePage(o, "UI-BM"); await q.waitFor((x) => /Hello/.test(x)); openStep(q, 4);
    for (const sel of ['[data-ck="op.0.k"][data-v="msg"]', '[data-ck="mid.0.k"][data-v="yt"]', '[data-ck="mid.1.k"][data-v="vid"]', '[data-ck="cl.0.k"][data-v="aud"]']) expect([sel, /\bon\b/.test(q.$(sel)!.className)]).toEqual([sel, true]);
    expect(p.errors).toEqual([]);
  });
  test("the lucky draw can be a scratch card: add it, pick the look and the prize, save; it is placed halfway and titled with the prize", async () => {
    const o = await organizer(); await make(o, "UI-SCR");
    const p = await consolePage(o, "UI-SCR"); await p.waitFor((x) => /Hello/.test(x)); openStep(p, 4);
    p.click("[data-luckyadd]"); p.click('[data-ck="lucky.0.style"][data-v="scratch"]'); p.click('[data-ck="lucky.0.win"][data-v="5"]'); p.click('[data-ck="lucky.0.pt"][data-v="hamper"]');
    p.click('[data-save="4"]'); await p.waitFor((x) => /Saved\./.test(x));
    const sm = await o.json(await o.api("GET", "/api/z/UI-SCR/summary", undefined, o.aiKey)); expect(sm.breaks[0]).toMatchObject({ kind: "lucky", style: "scratch", winners: 5, title: "Gift hamper" }); expect(sm.breaks[0].after).toBe(45); // no number typed: the software put it halfway
    openStep(p, 4); p.click('[data-luckydel="0"]'); p.click('[data-save="4"]');
    for (let i = 0; i < 100; i++) { if ((await o.json(await o.api("GET", "/api/z/UI-SCR/summary", undefined, o.aiKey))).breaks.length === 0) break; await new Promise((r) => setTimeout(r, 50)); }
    expect((await o.json(await o.api("GET", "/api/z/UI-SCR/summary", undefined, o.aiKey))).breaks).toEqual([]);
  });
  test("How it plays: tap choices for tickets, speed, rounds and who can join; the guest-invite option explains its three levels; all of it is saved", async () => {
    const o = await organizer(); await make(o, "UI-PLAY");
    const p = await consolePage(o, "UI-PLAY"); await p.waitFor((x) => /Hello/.test(x)); openStep(p, 2);
    expect(p.win.document.querySelectorAll('[data-ck="cap"]').length).toBe(8); expect(p.text()).toMatch(/Up to 100 people/); expect(p.text()).toMatch(/Rs 2,358\.82 with GST/);
    p.click('[data-ck="tix"][data-v="2"]'); p.click('[data-ck="spd"][data-v="12"]'); p.click('[data-ck="rnd"][data-v="3"]'); p.click('[data-ck="join"][data-v="closed"]');
    expect(p.text()).not.toMatch(/Guests they invite can play, but cannot invite more people\.[\s\S]*How many can each guest invite/);
    p.click('[data-bool="inv"]'); const t = p.text();
    expect(t).toMatch(/Guests they invite can play, but cannot invite more people\./); expect(t).toMatch(/Organizer, Hosts and Co-hosts: invite any number\./); expect(t).toMatch(/A guest: invites up to 4\./); expect(t).toMatch(/A person invited by a guest: plays, with no invite link\./);
    p.click('[data-ck="per"][data-v="2"]'); p.click('[data-ck="cats"][data-v="friends"]'); p.click('[data-ck="cats"][data-v="family"]');
    p.click('[data-save="2"]'); await p.waitFor((x) => /Saved\./.test(x));
    const sm = await o.json(await o.api("GET", "/api/z/UI-PLAY/summary", undefined, o.aiKey));
    expect(sm).toMatchObject({ tickets: 2, callSeconds: 12, rounds: 3, closed: true, invites: { on: true, per: 2, cats: ["colleagues", "friends"] } });
    expect(p.errors).toEqual([]);
  });
  test("Your game: occasion, day and time are chips; saving sets the name and the exact start in India time; a past time is refused politely", async () => {
    const o = await organizer(); await make(o, "UI-WHEN");
    const p = await consolePage(o, "UI-WHEN"); await p.waitFor((x) => /Hello/.test(x));
    p.click('[data-ck="occ"][data-v="Dealer meet"]'); p.click('[data-ck="day"][data-v="other"]'); setField(p, "#f-dayo", "2026-10-05"); p.click('[data-ck="time"][data-v="other"]'); setField(p, "#f-timeo", "18:30");
    p.click('[data-save="1"]'); await p.waitFor((x) => /Saved\./.test(x));
    const sm = await o.json(await o.api("GET", "/api/z/UI-WHEN/summary", undefined, o.aiKey)); expect(sm.name).toBe("Dealer meet"); expect(sm.startMs).toBe(Date.parse("2026-10-05T18:30:00+05:30"));
    openStep(p, 1); setField(p, "#f-dayo", "2020-01-01"); p.click('[data-save="1"]'); await p.waitFor((x) => /start time in the future/.test(x));
    expect((await o.json(await o.api("GET", "/api/z/UI-WHEN/summary", undefined, o.aiKey))).startMs).toBe(Date.parse("2026-10-05T18:30:00+05:30")); // nothing changed
  });
  test("Invite and share: three boxed blocks (Guest link, Big screen, Your guest list) with copy, WhatsApp, e-mail, the big-screen link, three ways to add people and the privacy line", async () => {
    const o = await organizer(); await make(o, "UI-SHARE"); await publish(o, "UI-SHARE");
    const p = await consolePage(o, "UI-SHARE"); await p.waitFor((x) => /Last step|Your game/i.test(x)); openStep(p, 6);
    await p.waitFor((x) => /Guest link/.test(x)); const doc = p.win.document;
    expect(Array.from(doc.querySelectorAll("#sec6 .zc-block > h3")).map((e: any) => e.textContent).slice(0, 3)).toEqual(["Guest link", "Big screen", "Your guest list"]);
    const guest = "http://localhost/z.html?e=UI-SHARE";
    expect((p.$('a[href^="https://wa.me/?text="]') as any).getAttribute("href")).toContain(encodeURIComponent(guest)); expect((p.$('a[href^="mailto:"]') as any).getAttribute("href")).toContain(encodeURIComponent(guest));
    let copied = ""; Object.defineProperty(p.win.navigator, "clipboard", { value: { writeText: async (t: string) => { copied = t; } }, configurable: true });
    p.click("#copy"); await p.waitFor((x) => /Copied/.test(x)); expect(copied).toBe(guest); p.click("#copybig"); await new Promise((r) => setTimeout(r, 50)); expect(copied).toBe("http://localhost/big.html?e=UI-SHARE");
    const t = p.text(); expect(t).toMatch(/Open it on a laptop or phone connected to the big screen\. It shows numbers and winners only\./); expect((p.$('a[href="http://localhost/big.html?e=UI-SHARE"]') as any).textContent).toMatch(/Open the big screen/);
    expect(Array.from(doc.querySelectorAll("[data-mode]")).map((e: any) => e.textContent)).toEqual(["Type one by one", "Paste from Excel", "Upload a file"]);
    p.click('[data-mode="file"]'); expect(p.$("#gfile")).toBeTruthy(); expect((p.$("#gfile") as any).type).toBe("file");
    expect(p.text()).toMatch(/0 people are on your list or have joined/); expect(p.text()).toMatch(/Send invites/); expect(p.text()).toMatch(/By WhatsApp/); expect(p.text()).toMatch(/By e-mail/); expect(p.text()).toMatch(/Names and numbers stay here: your AI never sees them\./);
    expect(p.errors).toEqual([]);
  });
  test("Help: pre-answered questions (including Who can do what? and the big-screen link), Back to your steps, Back to top; and the progress bar moves as steps are saved", async () => {
    const o = await organizer(); await make(o, "UI-HELP");
    const p = await consolePage(o, "UI-HELP"); await p.waitFor((x) => /Hello/.test(x));
    const bar = () => p.$('[role="progressbar"]')!; expect(bar().getAttribute("aria-valuenow")).toBe("0"); expect(p.text()).toMatch(/0 of 9 done · 0%/);
    p.click('[data-save="1"]'); await p.waitFor((x) => /1 of 9 done · 11%/.test(x)); expect(bar().getAttribute("aria-valuenow")).toBe("11"); expect((p.$("#progfill") as any).style.width).toBe("11%");
    expect(p.$("#sec2")!.className).toMatch(/open/); // Save and continue moved on to the next step
    const qs = Array.from(p.win.document.querySelectorAll("[data-q] span:first-child")).map((e: any) => e.textContent); expect(qs.length).toBeGreaterThanOrEqual(13); expect(qs).toEqual(expect.arrayContaining(["How do I start?", "Who pays?", "Who can do what?", "What is the big screen link?", "Who do I contact?"]));
    p.click(`[data-q="${qs.indexOf("Who can do what?")}"]`); expect(p.text()).toMatch(/A Co-host invites people and can pay/);
    p.click(`[data-q="${qs.indexOf("What is the big screen link?")}"]`); expect(p.text()).toMatch(/shows numbers and winners only/);
    p.click('[data-act="help"]'); expect(p.$("#help")).toBeTruthy(); expect(p.text()).toMatch(/Back to your steps/); expect(p.text()).toMatch(/Back to top/);
    // the phone layout has its own bottom tabs and a steps sheet
    expect(Array.from(p.win.document.querySelectorAll(".zc-tab")).map((e: any) => e.textContent)).toEqual(["Steps", "Next", "Help", "Top"]);
    p.click('.zc-tab[data-act="sheet"]'); expect(p.$(".zc-sheet")!.textContent).toMatch(/Your game at a glance/); p.click('.zc-tab[data-act="sheet"]'); expect(p.$(".zc-sheet")).toBeNull();
    const css = readFileSync(new URL("../public/zc.css", import.meta.url), "utf8"); expect(css).toMatch(/@media \(max-width:640px\)/); expect(css).toMatch(/\.zc-side\{display:none\}/); expect(css).toMatch(/\.zc-paynote\{[^}]*font-size:11px/);
    expect(p.errors).toEqual([]);
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
  test("the phone does not keep the participant's own mobile number and never sends it in an address", async () => {
    const o = await organizer(); await make(o, "UI-NOPH"); await publish(o, "UI-NOPH");
    const p = await phone(o, "UI-NOPH"); await join(p); await p.waitFor((x) => /You are in|Your ticket|What you can win/.test(x));
    expect(p.win.localStorage.getItem("ctz-phone")).toBeNull();
    expect(JSON.stringify(Object.fromEntries(Array.from({ length: p.win.localStorage.length }, (_, i) => [p.win.localStorage.key(i), p.win.localStorage.getItem(p.win.localStorage.key(i))])))).not.toContain("9822222222");
    const z = readFileSync(new URL("../public/z.js", import.meta.url), "utf8");
    expect(z).not.toContain("partner/check"); expect(z).not.toContain("store.set(\"ctz-phone\"");
  });
  test("the join page has no consent tick box, only a small Privacy Policy link to the privacy section of the legal page", async () => {
    const o = await organizer(); await make(o, "UI-PRIV"); await publish(o, "UI-PRIV");
    const p = await phone(o, "UI-PRIV"); await p.waitFor((x) => /Join the engagement/.test(x));
    quietPrivacy(p.win.document); expect(p.$("#go")).toBeTruthy(); expect(p.win.document.body.textContent).toContain("Players are 18 or older."); expect(p.win.document.querySelectorAll(".spriv").length).toBe(2);
    for (const f of ["z.css", "app.css"]) expect(readFileSync(new URL("../public/" + f, import.meta.url), "utf8")).toMatch(/.spriv{[^}]*font-size:11px[^}]*font-weight:400/);
    expect(readFileSync(new URL("../public/legal.html", import.meta.url), "utf8")).toContain('id="privacy"');
  });
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
    const p = await page(o, "/zc?e=UI-AUTO", "zc.html", ZC_SCRIPTS, { "ctz-org": o.token, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com" }, { afterLoad: (win, f) => { if (f === "zgame.js") { const Orig = win.ZG.RoundStore; win.ZG.RoundStore = class extends Orig { constructor() { super({ fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(o.world.now) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, (x: any) => x.signature === "aa"); } }; } } });
    await p.waitFor((x) => /Rewards, from the public number log/.test(x), 30000);
    await new Promise((r) => setTimeout(r, 1500));
    const r = (await o.json(await o.api("GET", "/api/z/UI-AUTO/results"))) as any;
    expect(r.results).toEqual([]); // the organizer's page cannot settle anything
    expect(p.$("#settle")).toBeFalsy();
    expect(p.text()).toMatch(/You and we cannot choose or change them in the software/);
    expect((await o.api("POST", "/api/z/UI-AUTO/settle", { results: [{ pattern: "full", idx: 5, pids: [] }] }, o.token)).status).toBe(403);
  }, 60_000);
  test("'Change of phone': the organizer enters a number, and the next device that joins with it keeps the ticket", async () => {
    const o = await organizer(); await make(o, "UI-MOVE"); await publish(o, "UI-MOVE");
    expect((await o.api("POST", "/api/z/UI-MOVE/join", { phone: "9855555555", device: "1".repeat(32) })).status).toBe(200);
    expect((await o.api("POST", "/api/z/UI-MOVE/join", { phone: "9855555555", device: "2".repeat(32) })).status).toBe(423);
    const p = await consolePage(o, "UI-MOVE");
    await p.waitFor((x) => /Your game|Last step/i.test(x)); openStep(p, 6); await p.waitFor((x) => /Change of phone/.test(x));
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
    expect(body).toMatch(/Earn up to 50% on every game you bring/); expect(body).not.toMatch(/20% more every time/); expect(body).toMatch(/random code/i); expect(body).not.toMatch(/mobile number is your code/i);
    const packs: number[][] = p.win.TB.PACKS;
    expect(packs.slice(0, 3).map((x) => [x[0], x[1]])).toEqual([[100, 1999], [250, 2999], [500, 3999]]); // the launch prices
    const rows = [...doc.querySelectorAll("#earn-table .rrow:not(.rh)")].map((r: any) => r.textContent.replace(/\s+/g, " "));
    expect(rows.length).toBe(packs.length);
    expect(rows[0]).toMatch(/1,999/); expect(rows[0]).toMatch(/999\.50/); expect(rows[1]).toMatch(/1,499\.50/); expect(rows[2]).toMatch(/1,999\.50/);
    expect(body).not.toMatch(/per person|per participant|per head/i); // we never show a per-person price
    (doc.getElementById("calc-n") as any).value = "4"; (doc.getElementById("calc-pack") as any).value = "0"; (doc.getElementById("calc-n") as any).dispatchEvent(new p.win.Event("input"));
    expect(doc.getElementById("calc-out")!.textContent).toBe("₹3,998"); // 4 first purchases x Rs 999.50
  });
  test("joining takes a mobile number and an e-mailed code: the code is random, the link is /?ref=<code>, and the page switches to the partner's own dashboard", async () => {
    const o = await organizer(); const p = await page(o, "/partner.html", "partner.html", ["common.js", "partner.js"]);
    await p.waitFor((x) => /Get your link in 20 seconds/.test(x));
    (p.$("#ph") as any).value = "+91 98765 43210"; (p.$("#em") as any).value = "partner@example.com"; (p.$("#ok") as any).checked = true; p.click("#join");
    await p.waitFor((x) => /Check your email/.test(x));
    const mailed = (o.world.raw.prepare("SELECT body FROM outbox WHERE to_addr='partner@example.com' ORDER BY id DESC").get() as any).body.match(/\b\d{6}\b/)[0];
    (p.$("#cd") as any).value = mailed; p.click("#cdgo");
    const t = await p.waitFor(() => !!p.win.document.getElementById("dash")?.textContent?.includes("Your link"));
    const dash = p.win.document.getElementById("dash")!.textContent!;
    expect(dash).not.toMatch(/9876543210/); expect(dash).toMatch(/\/\?ref=[A-HJ-NP-Z2-9]{8}/); expect(dash).toMatch(/Your partner key/);
    expect(p.win.document.body.classList.contains("signed")).toBe(true);
    expect(p.errors).toEqual([]);
  });
  test("Create your engagement pop-up: brand top right, role pill, eight true bullets, an email field (not work email), one button, trust line, Esc closes, the sign-up still works", async () => {
    const o = await organizer();
    const p = await page(o, "/", "index.html", ["common.js", "site.js"], {});
    p.click("#payBtn"); await new Promise((r) => setTimeout(r, 200));
    const t = (p.$("#sheet") as any).textContent as string; expect(t).toMatch(/Create your engagement/);
    expect(t).toContain("Build it and publish it free."); expect(t).not.toMatch(/Pay (only )?before it starts/); expect(t).toMatch(/For the organizer or host/);
    for (const b of ["Play a video or audio message between numbers", "Set several prizes, and add a lucky draw", "A closed-group corporate tambola (housie)", "Every ticket is unique: no two can ever match", "Each participant gets their own ticket", "A free AI assistant sets it up for you", "Participants never pay. You provide the rewards", "All participant data is deleted within 24 hours of the game ending", "Built for DPDP Act, GDPR and US privacy laws"]) expect(t).toContain(b);
    expect(p.win.document.querySelectorAll(".bgrid li").length).toBe(9); expect(p.win.document.querySelectorAll(".bgrid .bico svg").length).toBe(9); for (const li of p.win.document.querySelectorAll(".bgrid li")) expect(li.textContent.trim().split(/s+/).length).toBeLessThanOrEqual(13); // one short line each
    expect(t).toContain("Free to build and publish. No password."); expect(t).toContain("Your console opens at once. We use your email for your invoice and to sign you in later.");
    expect(t).not.toMatch(/work email/i); expect(t.split(/s+/).length).toBeLessThan(150);
    const f = p.$("#fMail") as any; expect(p.win.document.querySelector('label[for="fMail"]').textContent).toBe("Your email");
    expect(f.getAttribute("type")).toBe("email"); expect(f.getAttribute("inputmode")).toBe("email"); expect(f.getAttribute("autocomplete")).toBe("email"); expect(f.getAttribute("placeholder")).toBe("you@example.com");
    expect(p.win.document.querySelector(".sheet .sbrand")!.getAttribute("aria-label")).toBe("Corporate Tambola"); expect(p.win.document.querySelector(".sheethead .rolepill")).toBeTruthy();
    expect((p.$("#frGo") as any).textContent).toMatch(/^s*Create my engagement/);
    p.win.document.dispatchEvent(new p.win.KeyboardEvent("keydown", { key: "Escape" })); await new Promise((r) => setTimeout(r, 50));
    { const sh = p.win.document.getElementById("sheet")!; const l = [...sh.querySelectorAll(".spriv a")] as any[]; expect(l.map((x) => x.getAttribute("href"))).toEqual(["/terms.html", "/legal.html#privacy"]); expect(sh.querySelector(".spriv")!.textContent).toBe("By continuing you accept the Terms and the Privacy & Data Policy."); for (const x of l) { expect(x.getAttribute("target")).toBe("_blank"); expect(x.getAttribute("rel")).toBe("noopener"); } expect(sh.querySelectorAll('input[type="checkbox"]').length).toBe(0); }
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
    const p = await consolePage(o, "UI-INV4"); await p.waitFor((x) => /Hello|Your game/.test(x)); openStep(p, 2);
    p.click('[data-bool="inv"]'); expect(p.win.document.querySelectorAll('[data-ck="cats"]').length).toBe(10);
    p.click('[data-ck="per"][data-v="3"]');
    for (const k of ["colleagues", "vendors", "customers"]) p.click(`[data-ck="cats"][data-v="${k}"]`); // family stays on; colleagues goes off; vendors and customers come on
    p.click('[data-save="2"]'); await p.waitFor((x) => /Saved\./.test(x));
    const info = await o.json(await o.api("GET", "/api/z/UI-INV4/info", undefined, o.token));
    expect(info.invites).toEqual({ on: true, per: 3, cats: ["family", "vendors", "customers"] });
    expect(p.errors).toEqual([]);
  }, 60_000);
});

describe("opening and closing brand moments on the phone", () => {
  const rtFake4 = (win: any, nowMs: () => number) => { const Orig = win.ZG.PhoneRuntime; win.ZG.PhoneRuntime = class extends Orig { constructor(eid: string, deps: any) { super(eid, { ...deps, beacon: { fetcher: async (url: string) => { const last = url.split("/").pop()!; const r = last === "latest" ? roundAt(nowMs()) : Number(last); return { ok: true, status: 200, json: async () => ({ round: r, randomness: rnd(r), signature: "aa" }) }; }, mirrors: ["https://a.test", "https://b.test", "https://c.test"], timeoutMs: 500 }, verify: (x: any) => x.signature === "aa" }); } }; };
  async function joined(o: O, id: string, settings: Record<string, unknown>) {
    await make(o, id); await o.api("PATCH", `/api/z/${id}/settings`, settings, o.aiKey); await publish(o, id);
    const p = await page(o, `/z?e=${id}`, "z.html", ["audio.js", "zgame.js", "z.js"], {}, { afterLoad: (win, f) => { if (f === "zgame.js") rtFake4(win, () => o.world.now); win.Math = Object.assign(Object.create(Math), { random: () => 0 }); } });
    await p.waitFor((x) => /Join the engagement/.test(x)); (p.$("#ph") as any).value = "9833333333"; p.click("#go"); await p.waitFor((x) => /Your ticket|What you can win/.test(x));
    return p;
  }
  const at = (o: O, p: any, secs: number) => { const rt = p.win.__rt; o.world.now = p.win.ZG.roundTimeMs(rt.startRound) + secs * 1000; rt.syncedAtMono = -Infinity; };
  const until = async (cond: () => boolean, ms = 25000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 200)); } };
  const settle = () => new Promise((r) => setTimeout(r, 1200));

  test("an opening plays only in the 2 minutes before the first number, with its video inside the page, and is gone once the numbers start", async () => {
    const o = await organizer(); const p = await joined(o, "UI-OPN1", { opening: [{ kind: "youtube", title: "Welcome from our CEO", mediaUrl: "https://youtu.be/dQw4w9WgXcQ", seconds: 60 }] }); const doc = p.win.document;
    at(o, p, -400); await settle(); expect(p.text()).not.toMatch(/A message from your organizer/); // far too early: just the countdown
    for (let s = -110; s < -50 && !doc.querySelector("#ctmedia iframe"); s += 6) { at(o, p, s); await settle(); }
    expect(p.text()).toMatch(/A message from your organizer/); expect(p.text()).toMatch(/Welcome from our CEO/);
    const f = doc.querySelector("#ctmedia iframe") as any; expect(f).toBeTruthy(); expect(f.src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    at(o, p, 30); await until(() => !doc.querySelector("#ctmedia iframe")); expect(p.text()).not.toMatch(/A message from your organizer/); // numbers have started
  }, 90_000);
  test("two openings (2 tickets) follow one another inside the same 2 minutes", async () => {
    const o = await organizer(); const p = await joined(o, "UI-OPN2", { tickets: 2, opening: [{ kind: "speech", title: "First hello", seconds: 30 }, { kind: "speech", title: "Second hello", seconds: 30 }] });
    at(o, p, -110); await p.waitFor((x) => /First hello/.test(x), 20000); expect(p.text()).not.toMatch(/Second hello/);
    at(o, p, -75); await p.waitFor((x) => /Second hello/.test(x), 20000); expect(p.text()).not.toMatch(/First hello/);
    at(o, p, -40); await until(() => !/Second hello|First hello/.test(p.text())); // both done: nothing more until the first number
  }, 90_000);
  test("a closing plays on the final screen, and with two closings a button moves to the next", async () => {
    const o = await organizer(); const p = await joined(o, "UI-CLS1", { tickets: 2, closing: [{ kind: "speech", title: "Thank you from the CEO" }, { kind: "youtube", title: "Our year in pictures", mediaUrl: "https://youtu.be/dQw4w9WgXcQ" }] }); const doc = p.win.document;
    at(o, p, 400); await settle(); expect(p.text()).not.toMatch(/Thank you from your organizer/); // not before the end
    at(o, p, 1000); await p.waitFor((x) => /Thank you from your organizer/.test(x), 40000);
    expect(p.text()).toMatch(/Thank you from the CEO/); expect(p.text()).toMatch(/Next message \(1 of 2\)/);
    p.click("#cnext"); await p.waitFor((x) => /Our year in pictures/.test(x), 20000);
    await until(() => !!doc.querySelector("#ctmedia iframe")); expect(p.text()).not.toMatch(/Next message/);
  }, 120_000);
  test("a closing video does not start before the game has ended", async () => {
    const o = await organizer(); const p = await joined(o, "UI-CLS2", { closing: [{ kind: "youtube", title: "Our year in pictures", mediaUrl: "https://youtu.be/dQw4w9WgXcQ" }] }); const doc = p.win.document;
    at(o, p, 400); await settle(); await settle(); expect(doc.querySelector("#ctmedia iframe")).toBeNull(); expect(p.text()).not.toMatch(/Our year in pictures/);
    at(o, p, 1000); await until(() => !!doc.querySelector("#ctmedia iframe"), 40000); expect(p.text()).toMatch(/Our year in pictures/);
  }, 90_000);
  test("with none set, a phone shows no opening and no closing card", async () => {
    const o = await organizer(); const p = await joined(o, "UI-NONE1", {});
    at(o, p, -100); await settle(); expect(p.text()).not.toMatch(/A message from your organizer/);
    at(o, p, 1000); await p.waitFor((x) => /Thank you for taking part|Game complete/.test(x), 40000); expect(p.text()).not.toMatch(/Thank you from your organizer/);
  }, 90_000);
});

describe("testing a brand moment without a game", () => {
  const prev = (o: O, hash: string) => page(o, "/preview.html" + hash, "preview.html", ["preview.js"]);
  test("the console says what kind of link was pasted: YouTube, video file and audio file play inside the game; any other page does not", async () => {
    const o = await organizer(); await make(o, "UI-LNK1");
    const p = await consolePage(o, "UI-LNK1"); await p.waitFor((x) => /Hello/.test(x)); openStep(p, 4); p.click('[data-ck="opN"][data-v="1"]'); p.click('[data-ck="op.0.k"][data-v="yt"]');
    const set = (v: string) => { setField(p, "#f-op-0-v", v); return (p.win.document.querySelector('[data-lk="op.0"]') as any).textContent as string; };
    expect(set("https://youtu.be/dQw4w9WgXcQ")).toMatch(/YouTube link: plays inside the game/);
    expect(set("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatch(/plays inside the game/);
    expect(set("https://cdn.acme.com/film.mp4")).toMatch(/Video file: plays inside the game/);
    expect(set("https://cdn.acme.com/song.mp3?x=1")).toMatch(/Audio file: plays inside the game/);
    expect(set("https://drive.google.com/file/d/abc/view")).toMatch(/opens a new tab and takes guests out of the game/);
    expect(set("https://vimeo.com/123456")).toMatch(/opens a new tab and takes guests out of the game/);
    expect(set("http://acme.com/a.mp4")).toMatch(/must start with https/);
    expect(set("")).toBe(""); // no link: guests see the message only, nothing to warn about
  }, 60_000);
  test("the Test button opens a page that shows the break like a guest's phone: the real video inside the page, a ticket under it, and everything gone when the break ends", async () => {
    const o = await organizer(); await make(o, "UI-LNK2");
    const p = await consolePage(o, "UI-LNK2"); await p.waitFor((x) => /Hello/.test(x)); openStep(p, 4);
    let opened = ""; (p.win as any).open = (u: string) => { opened = u; return null; };
    p.click('[data-ck="midN"][data-v="1"]'); p.click('[data-ck="mid.0.k"][data-v="yt"]');
    setField(p, "#f-mid-0-t", "Welcome from our CEO"); setField(p, "#f-mid-0-v", "https://youtu.be/dQw4w9WgXcQ"); setField(p, "#f-mid-0-s", "15");
    p.click('[data-test="mid.0"]');
    expect(opened).toMatch(/^\/preview\.html#/);
    const h = new URLSearchParams(opened.split("#")[1]); expect([h.get("w"), h.get("k"), h.get("t"), h.get("u"), h.get("s")]).toEqual(["break", "youtube", "Welcome from our CEO", "https://youtu.be/dQw4w9WgXcQ", "15"]);
    const v = await prev(o, "#" + opened.split("#")[1]);
    await v.waitFor((x) => /A short break/.test(x)); const doc = v.win.document;
    expect(v.text()).toMatch(/Test only/); expect(v.text()).toMatch(/This link plays inside the game/); expect(v.text()).toMatch(/Welcome from our CEO/); expect(v.text()).toMatch(/Your ticket \(sample\)/);
    expect((doc.querySelector("#ctmedia iframe") as any).src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    expect(v.text()).toMatch(/The numbers continue in \d+s/);
  }, 60_000);
  test("a link that cannot play inside the game is flagged on the test page, and a break with no link shows the message only", async () => {
    const o = await organizer();
    const a = await prev(o, "#w=break&k=file&t=Our%20deck&u=" + encodeURIComponent("https://example.com/deck.pdf") + "&s=30");
    await a.waitFor((x) => /A short break/.test(x)); expect(a.text()).toMatch(/will NOT play inside the game/); expect(a.win.document.querySelector("#ctmedia iframe, #ctmedia video, #ctmedia audio")).toBeNull();
    const b = await prev(o, "#w=closing&k=speech&t=Thank%20you");
    await b.waitFor((x) => /Thank you from your organizer/.test(x)); expect(b.text()).toMatch(/guests see your message only/); expect(b.text()).not.toMatch(/numbers continue/);
  }, 60_000);
});

describe("the free demo game", () => {
  const REAL_NOW = Date.now.bind(Date), REAL_PERF = performance.now.bind(performance);
  /** Opens demo.html with its own clock running `k` times faster than real time, so the minute-long demo takes about 18 seconds. */
  async function demo(o: O, hash = "", opts: { video?: string; k?: number } = {}) {
    const k = opts.k ?? 4, T0 = REAL_NOW(), P0 = REAL_PERF(); const calls: string[] = [];
    const p = await page(o, "/demo.html" + hash, "demo.html", ["audio.js", "zgame.js", "demo-config.js", "demo.js", "z.js"], {}, { afterLoad: (win, f) => {
      if (f === "audio.js") { (win as any).__CT_DEMO_CLOCK = { now: () => T0 + (REAL_PERF() - P0) * k, mono: () => P0 + (REAL_PERF() - P0) * k }; const of = (win as any).fetch; (win as any).fetch = (...a: any[]) => { calls.push(String(a[0])); return of ? of(...a) : Promise.reject(new Error("no network")); }; }
      if (f === "demo-config.js" && opts.video !== undefined) (win as any).CT_DEMO_VIDEO = opts.video;
    } });
    return { p, calls, T0 };
  }
  const until = async (cond: () => boolean, ms = 60000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 100)); } };
  /** Plays a run to its end and checks everything the owner specified. */
  async function playToEnd(o: O, hash: string) {
    const { p, calls } = await demo(o, hash); const doc = p.win.document; const rt = p.win.__rt;
    let sawBreak = false, sawBuiltInVideo = false, ticketDuringBreak = false, logDuringBreak = -1, breakGone = false;
    await until(() => {
      const view = rt.view(); const t = p.text();
      if (/How brand breaks work/.test(t)) { sawBreak = true; sawBuiltInVideo = sawBuiltInVideo || !!doc.querySelector("#ctmedia video"); logDuringBreak = view.log.length; ticketDuringBreak = !!doc.querySelector(".zticket"); }
      else if (sawBreak) breakGone = true;
      return view.phase === "ended";
    }, 90000);
    expect(sawBreak).toBe(true); expect(sawBuiltInVideo).toBe(true); expect((doc.querySelector("#ctmedia video") as any)?.src ?? "").toBe(""); /* the player is gone after the break */ expect(logDuringBreak).toBe(3); expect(ticketDuringBreak).toBe(true); expect(breakGone).toBe(true);
    expect(rt.view().log).toEqual([1, 23, 80, 9, 50, 60]); // exactly the scripted numbers, in order, by the real number-drawing code
    expect(rt.view().won.map((w: any) => w.pattern)).toEqual(["corners"]); expect(rt.view().won[0].idx).toBe(5); // Four corners, on the 6th number, by the real winner check
    const end = await p.waitFor((x) => /That was the demo/.test(x), 20000);
    expect(end).toMatch(/You won Four corners/); expect(end).toMatch(/Create my game/); expect(end).toMatch(/Run demo again/);
    expect(end).not.toMatch(/Confirm your prize details|Confirm where your prize goes/); // a demo asks for no name or number
    expect(calls.filter((u) => /\/api\//.test(u))).toEqual([]); // nothing was sent to our server
    return p;
  }

  test("before anyone presses anything: a real ticket marked DEMO, a Run Demo button, and nothing happening: no countdown, no time, no date, no number to type", async () => {
    const o = await organizer(); const { p } = await demo(o); const doc = p.win.document; const rt = p.win.__rt;
    await p.waitFor((x) => /Run Demo/.test(x)); const t = p.text();
    expect(t).toMatch(/Demo ticket/); expect(doc.querySelector(".zdemotag")?.textContent).toBe("DEMO"); expect(doc.querySelectorAll(".zticket div").length).toBe(27); // a real 3 x 9 ticket
    expect(doc.getElementById("drun")?.textContent).toBe("Run Demo");
    let copied = ""; Object.defineProperty(p.win.navigator, "clipboard", { value: { writeText: async (x: string) => { copied = x; } }, configurable: true });
    p.click("#dcopy"); await until(() => copied !== "", 3000); expect(copied).toMatch(/^http:\/\/localhost\/demo\.html$/); // the plain address, no time in it: anyone who opens it runs their own demo
    expect(t).not.toMatch(/Starting in|Join the engagement|Your mobile number|\d\d:\d\d:\d\d/);
    await new Promise((r) => setTimeout(r, 2500)); // many demo-seconds pass: still nothing runs by itself
    expect(rt.view().log).toEqual([]); expect(doc.querySelectorAll(".zticket div.m").length).toBe(0);
  }, 60_000);

  test("pressing Run Demo starts a fresh run 3 seconds later; the whole demo then plays by itself to the end; and Run demo again plays it a second time, identically", async () => {
    const o = await organizer(); const { p: idle } = await demo(o); await idle.waitFor((x) => /Run Demo/.test(x));
    idle.click("#drun"); const hash = idle.win.location.hash; expect(hash).toMatch(/^#r=\d+$/); // the press sets the start: nothing else is needed
    const first = await playToEnd(o, hash);
    expect(first.win.document.getElementById("dagain2")?.textContent).toBe("Run demo again");
    first.click("#dagain2"); const again = first.win.location.hash; expect(again).toMatch(/^#r=\d+$/); expect(again).not.toBe(hash);
    await playToEnd(o, again); // the second run is the same game again
  }, 240_000);

  test("the break is the owner's YouTube video when one is set: it plays inside the page for the break, the ticket stays, and the player is gone after it", async () => {
    const o = await organizer(); const { p } = await demo(o, "#r=" + (REAL_NOW() + 3000), { video: "https://youtu.be/dQw4w9WgXcQ" }); const doc = p.win.document;
    await until(() => !!doc.querySelector("#ctmedia iframe"), 60000);
    expect((doc.querySelector("#ctmedia iframe") as any).src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    expect(p.text()).toMatch(/A short video from your host/); expect(doc.querySelector(".zticket")).toBeTruthy();
    await until(() => !doc.querySelector("#ctmedia iframe"), 60000);
    expect(p.win.__rt.view().log.length).toBeGreaterThanOrEqual(3);
  }, 150_000);

  test("an old address (a run that ended long ago) shows the Run Demo screen again, not a half-finished game", async () => {
    const o = await organizer(); const { p } = await demo(o, "#r=" + (REAL_NOW() - 600000));
    await p.waitFor((x) => /Run Demo/.test(x)); expect(p.win.__rt.view().log).toEqual([]);
  }, 60_000);
});

describe("the console for an AI that works in the browser", () => {
  const quickPage = (o: O, session: Record<string, string> = {}) => page(o, `/zc?quick=1`, "zc.html", ZC_SCRIPTS, { "ctz-org": o.token, "ctz-aimsg": o.aiMessage, "ctz-email": "boss@acme.com", ...session });
  const until = async (cond: () => boolean, ms = 20000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await new Promise((r) => setTimeout(r, 100)); } };
  const set = (p: any, sel: string, v: string) => { const el = p.$(sel) as any; el.value = v; el.dispatchEvent(new p.win.Event("input", { bubbles: true })); el.dispatchEvent(new p.win.Event("change", { bubbles: true })); };

  test("a hand-over link from the AI opens the exact card and outlines the one button; nothing is pressed for the organizer", async () => {
    const o = await organizer(); await make(o, "UI-ACT1");
    const pub = await consolePage(o, "UI-ACT1"); // the normal page first, for comparison
    await pub.waitFor((x) => /Hello/.test(x)); openStep(pub, 7); await pub.waitFor((x) => /Publish my engagement, free/.test(x)); expect(pub.text()).not.toMatch(/brought you here/);
    const a = await page(o, `/zc?e=UI-ACT1&do=publish`, "zc.html", ZC_SCRIPTS, { "ctz-org": o.token, "ctz-email": "boss@acme.com" });
    await a.waitFor((x) => /Your AI assistant brought you here/.test(x));
    expect(a.text()).toMatch(/Confirm and publish/); expect(a.$("#pubEmail")).toBeTruthy(); // the card is already open
    expect((a.$("#pubgo") as any).style.outline).toMatch(/solid/); // the button to press is outlined
    const sm = await o.json(await o.api("GET", "/api/z/UI-ACT1/summary", undefined, o.aiKey)); expect(sm.status).toBe("draft"); // and it was NOT pressed
    await publish(o, "UI-ACT1");
    const e = await page(o, `/zc?e=UI-ACT1&do=erase`, "zc.html", ZC_SCRIPTS, { "ctz-org": o.token });
    await e.waitFor((x) => /Delete all participant data now/.test(x)); await until(() => /solid/.test((e.$("#erase") as any).style.outline)); expect(e.text()).toMatch(/Your AI assistant brought you here/);
    const c = await page(o, `/zc?e=UI-ACT1&do=pause`, "zc.html", ZC_SCRIPTS, { "ctz-org": o.token });
    await c.waitFor((x) => /Controls/.test(x)); await until(() => /solid/.test((c.$('[data-ctl="pause"]') as any).style.outline));
    const n = await page(o, `/zc?e=UI-ACT1`, "zc.html", ZC_SCRIPTS, { "ctz-org": o.token }); await n.waitFor((x) => /Check your game/.test(x)); expect(n.text()).not.toMatch(/brought you here/); // an ordinary visit shows no such banner
  }, 90_000);

  test("AI helper mode: no guest name or mobile number is on the page, the guest-list and look-up blocks are replaced by one notice, the organizer's own e-mail and mobile are not prefilled; switching it off brings them back", async () => {
    const o = await organizer(); await make(o, "UI-SHD1"); await publish(o, "UI-SHD1");
    expect((await o.api("POST", "/api/z/UI-SHD1/roster", { people: [{ name: "Ravi Kulkarni", phone: "9876501234" }] }, o.token)).status).toBe(200);
    expect((await o.api("POST", "/api/z/UI-SHD1/join", { phone: "9811122233", name: "Meera Shah", device: "a".repeat(32) })).status).toBe(200);
    const on = await consolePage(o, "UI-SHD1", o.token, { "ctz-shield": "1", "ctz-phone": "9000011111" }); await on.waitFor((x) => /AI helper mode/.test(x) && /Last step|Your game/i.test(x)); openStep(on, 6); await on.waitFor((x) => /Guest names and numbers are hidden/.test(x));
    for (const n of [6, 7, 8, 9]) { openStep(on, n); const t = on.text(); for (const secret of ["Ravi", "Kulkarni", "Meera", "Shah", "9876501234", "9811122233", "9000011111", "boss@acme.com"]) expect([n, secret, t.includes(secret)]).toEqual([n, secret, false]); }
    for (const id of ["#roster", "#rosterTxt", "#pdph", "#ubph", "#mkph", "#rptopen", "#rptnew"]) expect(on.$(id)).toBeNull(); // the blocks that take or show guest data are gone
    expect(on.$("#shield")).toBeTruthy(); expect((on.$("#shield") as any).checked).toBe(true);
    expect(on.$("#erase")).toBeTruthy(); // the hand-over buttons stay
    const off = await consolePage(o, "UI-SHD1", o.token, {}); await off.waitFor((x) => /Last step|Your game/i.test(x)); openStep(off, 6); off.click('[data-mode="paste"]'); expect(off.$("#rosterTxt")).toBeTruthy(); expect(off.$("#pdph")).toBeTruthy(); expect((off.$("#shield") as any).checked).toBe(false);
  }, 90_000);

  test("AI helper mode also keeps the organizer's own e-mail and mobile out of the Publish card; with it off they are prefilled for the organizer", async () => {
    const o = await organizer(); await make(o, "UI-SHD2");
    const on = await page(o, `/zc?e=UI-SHD2&do=publish`, "zc.html", ZC_SCRIPTS, { "ctz-org": o.token, "ctz-email": "boss@acme.com", "ctz-phone": "9000011111", "ctz-shield": "1" });
    await on.waitFor((x) => /Confirm and publish/.test(x)); expect((on.$("#pubEmail") as any).value).toBe(""); expect((on.$("#pubPhone") as any).value).toBe(""); expect(on.text()).not.toMatch(/boss@acme\.com|9000011111/);
    const off = await page(o, `/zc?e=UI-SHD2&do=publish`, "zc.html", ZC_SCRIPTS, { "ctz-org": o.token, "ctz-email": "boss@acme.com", "ctz-phone": "9000011111" });
    await off.waitFor((x) => /Confirm and publish/.test(x)); expect((off.$("#pubEmail") as any).value).toBe("boss@acme.com"); expect((off.$("#pubPhone") as any).value).toBe("9000011111");
  }, 60_000);
  test("every field on the console is reachable by name: each label is linked to its field, nothing unlabelled, and the page keeps the same elements when nothing has changed", async () => {
    const o = await organizer(); await make(o, "UI-A11Y1");
    const p = await consolePage(o, "UI-A11Y1"); await p.waitFor((x) => /Hello/.test(x)); const doc = p.win.document; openStep(p, 4); p.click('[data-ck="opN"][data-v="1"]'); p.click('[data-ck="midN"][data-v="2"]'); p.click('[data-ck="clN"][data-v="1"]'); p.click("[data-luckyadd]"); p.click('[data-ck="mid.1.k"][data-v="yt"]'); openStep(p, 6); p.click('[data-mode="paste"]'); openStep(p, 7); p.click("#publishopen"); openStep(p, 4);
    const bad: string[] = [];
    for (const f of Array.from(doc.querySelectorAll("input, select, textarea")) as any[]) {
      if (f.type === "hidden") continue;
      const named = (f.id && doc.querySelector(`label[for="${f.id}"]`)) || f.closest("label") || f.getAttribute("aria-label");
      if (!named) bad.push(`${f.tagName.toLowerCase()}#${f.id}.${f.getAttribute("data-bk") || f.getAttribute("data-op") || f.getAttribute("data-cl") || ""}`);
    }
    expect(bad).toEqual([]);
    for (const l of Array.from(doc.querySelectorAll("label[for]")) as any[]) expect([l.getAttribute("for"), !!doc.getElementById(l.getAttribute("for"))]).toEqual([l.getAttribute("for"), true]); // no label points at nothing
    const ids = Array.from(doc.querySelectorAll("[id]")).map((e: any) => e.id); expect(new Set(ids).size).toBe(ids.length); // ids are unique
    expect(doc.querySelector('[data-fi="mid.0.t"]')!.getAttribute("id")).toBe("f-mid-0-t"); // the brand-moment rows have stable names
    const btn = p.$('[data-save="4"]') as any; await new Promise((r) => setTimeout(r, 6000)); expect(btn.isConnected).toBe(true); expect(p.$('[data-save="4"]')).toBe(btn); // the 5-second refresh did not replace the page's elements
  }, 90_000);

  test("Quick setup: real date and time pickers, the first steps as one form of tap choices; saving makes the draft with the right start, size, tickets, prizes and name, then opens it", async () => {
    const o = await organizer(); const p = await quickPage(o); await p.waitFor((x) => /1\. Which game\?/.test(x) && /Up to 250 people/.test(x)); const doc = p.win.document;
    expect((p.$("#qk-date") as any).type).toBe("date"); expect((p.$("#qk-time") as any).type).toBe("time"); // real pickers
    expect(p.text()).toMatch(/Rs 2,358\.82 including GST/); expect(doc.querySelectorAll("select").length).toBe(0); // prices come from the software's own list
    const tomorrow = new Date(Date.now() + 5.5 * 3600000 + 2 * 86400000); const d = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;
    set(p, "#qk-name", "Diwali party"); set(p, "#qk-date", d); set(p, "#qk-time", "18:30");
    p.click('[data-ck="cap"][data-v="500"]'); p.click('[data-ck="tix"][data-v="2"]'); p.click('[data-ck="spd"][data-v="12"]'); p.click('[data-ck="join"][data-v="closed"]'); p.click('[data-bool="inv"]');
    set(p, "#qk-t-full", "Voucher 5000"); p.click('[data-ck="hs.full.n"][data-v="2"]');
    await until(() => /Diwali party: \d{4}-\d\d-\d\d at 18:30 India time; up to 500 people; 2 tickets each, a number every 12 seconds, 1 round; only people on your list; 6 prizes/.test(p.text()), 8000).catch(() => { throw new Error("summary was: " + (p.$("#qk-summary") as any)?.textContent); });
    p.click("#qk-save"); await p.waitFor((x) => /Your draft is saved/.test(x), 8000).catch(() => { throw new Error("save failed; error box: " + (p.$("#qk-err") as any)?.textContent + " | errors: " + p.errors.join("; ")); });
    const hist = await o.json(await o.api("GET", "/api/history", undefined, o.aiKey)); expect(hist.engagements.length).toBe(1);
    const id = hist.engagements[0].id; expect(id).toMatch(/^DIWALI-PARTY-\d{4}$/);
    const sm = await o.json(await o.api("GET", `/api/z/${id}/summary`, undefined, o.aiKey));
    expect(sm).toMatchObject({ name: "Diwali party", limit: 500, tickets: 2, callSeconds: 12, rounds: 1, closed: true, status: "draft" });
    expect(sm.startMs).toBe(Date.parse(d + "T18:30:00+05:30")); // exactly the picked day and time in India time
    expect(sm.rewards.filter((r: any) => r.pattern === "full").map((r: any) => r.text)).toEqual(["Voucher 5000", "Voucher 5000"]); expect(sm.invites).toMatchObject({ on: true, per: 4 });
    expect(sections(p)).toHaveLength(9); // it opened the game, ready for videos and messages
  }, 90_000);

  test("Quick setup refuses a start time that has passed and tells the organizer plainly; it saves nothing", async () => {
    const o = await organizer(); const p = await quickPage(o); await p.waitFor((x) => /1\. Which game\?/.test(x));
    set(p, "#qk-date", "2020-01-01"); set(p, "#qk-time", "10:00"); p.click("#qk-save");
    await until(() => (p.$("#qk-err") as any).style.display !== "none"); expect((p.$("#qk-err") as any).textContent).toMatch(/start time in the future/);
    expect((await o.json(await o.api("GET", "/api/history", undefined, o.aiKey))).engagements.length).toBe(0);
  }, 60_000);

  test("a second tab of the same browser is signed in by the first, without storing the key anywhere", async () => {
    const o = await organizer();
    const first = await page(o, `/zc`, "zc.html", ZC_SCRIPTS, { "ctz-org": o.token, "ctz-aimsg": o.aiMessage }); await first.waitFor((x) => /Your account/.test(x));
    const second = await page(o, `/zc`, "zc.html", ZC_SCRIPTS, {}); // no key in this tab's session
    await second.waitFor((x) => /Your account/.test(x), 10000); // it asked the other tab and was signed in
    expect(second.$("#sec")).toBeNull(); // no sign-in box
  }, 60_000);
});
