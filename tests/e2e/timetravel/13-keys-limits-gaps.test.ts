// TT-30..: expiring keys, replayed sign-in links, the rate limits, the 80,000-write daily guard, and what the organizer's console must do for pause/announce (gap G4).
import { expect } from "bun:test";
import { DAY, HOUR, PLAT, T, dev, j, join, organizer, paidEngagement, phone, roundAt, tt, world } from "./lib";

const J = (x: unknown) => JSON.stringify(x).slice(0, 300);
const count = (w: ReturnType<typeof world>, sql: string, ...a: any[]) => (w.raw.prepare(sql).get(...a) as any).c as number;

tt({ id: "TT-30", role: "organizer's AI", title: "a fresh 24-hour AI link works for 24 hours and then dies; the lasting link and the organizer are unaffected", steps: "POST /api/org/ai/fresh; read the e-mailed link; use it at +23h and +25h", expected: "200 at +23h; 404 at +25h; lasting AI key still works" }, async () => {
  const w = world(); const o = await organizer(w, "fresh@example.com");
  const f = await w.call("POST", "/api/org/ai/fresh", {}, o.h); expect(f.status, await f.clone().text()).toBe(200);
  const mail = w.raw.prepare("SELECT body FROM outbox ORDER BY id DESC LIMIT 1").get() as any;
  const key = /\/ai\/(cta_[0-9a-f]{48})/.exec(mail.body)?.[1]; expect(key, "temporary key in the e-mail").toBeTruthy();
  const at = (t: number, k = key!) => w.call("GET", `/ai/${k}`, undefined, {}, t);
  const a = await at(T + 23 * HOUR), b = await at(T + 25 * HOUR), c = await at(T + 25 * HOUR, o.aiKey);
  expect([a.status, b.status, c.status]).toEqual([200, 404, 200]);
  return "23h 200, 25h 404, lasting key 200";
});
tt({ id: "TT-31", role: "organizer", title: "sign-in codes and links cannot be replayed: single use, 5 wrong tries lock, 10-minute expiry", steps: "Request a code; use the link twice; try wrong codes; use the right code after expiry", expected: "second use refused; locked after 5 wrong; expired code refused" }, async () => {
  const w = world(); (w.env as any).TEST_MODE = "1"; const o = await organizer(w, "replay@example.com");
  const ask = async (t = T) => j(await w.call("POST", "/api/auth/email", { email: o.email }, {}, t));
  const a = await ask(); expect(a.devCode).toMatch(/^\d{6}$/);
  const l1 = await w.call("POST", "/api/auth/link", { token: a.devToken }, {}, T + 1000), l2 = await w.call("POST", "/api/auth/link", { token: a.devToken }, {}, T + 2000);
  expect([l1.status, l2.status]).toEqual([200, 400]);
  const b = await ask(T + 3000);
  for (let i = 0; i < 5; i++) await w.call("POST", "/api/auth/verify", { email: o.email, code: String(111111 + i) }, {}, T + 4000);
  const locked = await w.call("POST", "/api/auth/verify", { email: o.email, code: b.devCode }, {}, T + 5000); expect(locked.status).toBe(400);
  const c = await ask(T + 20 * 60_000); const late = await w.call("POST", "/api/auth/verify", { email: o.email, code: c.devCode }, {}, T + 20 * 60_000 + 11 * 60_000); expect(late.status).toBe(400);
  const six = []; for (let i = 0; i < 7; i++) six.push((await w.call("POST", "/api/auth/email", { email: o.email }, { "cf-connecting-ip": "9.9.9.9" }, T + 2 * HOUR + i * 1000)).status);
  expect(six.slice(-2), "more than 5 codes an hour").toContain(429);
  return `link 200/400; lock ok; expiry ok; ${six.join(",")}`;
});
tt({ id: "TT-32", role: "anonymous", title: "per-address limits: 10 new accounts a day, then 429 with a human message", steps: "11 sign-ups from one address", expected: "10 x 200, 11th 429" }, async () => {
  const w = world(); const codes: number[] = [];
  for (let i = 0; i < 11; i++) codes.push((await w.call("POST", "/api/start", { email: `lim${i}@example.com` }, { "cf-connecting-ip": "5.5.5.5" })).status);
  expect(codes).toEqual([...Array(10).fill(200), 429]);
  const next = await w.call("POST", "/api/start", { email: "lim99@example.com" }, { "cf-connecting-ip": "5.5.5.5" }, T + DAY + HOUR); expect(next.status, "allowance returns next day").toBe(200);
  return codes.join(",");
});
tt({ id: "TT-33", role: "owner", title: "the 80,000-write daily guard: reads keep working, writes get a polite 'busy', and the allowance returns the next UTC day", steps: "Budget 60; fill it with joins; read info/results/seats; join again; next day", expected: "503 busy for writes; GETs 200; next day writes work" }, async () => {
  const w = world({ budget: "300" }); const g = await paidEngagement(w, { cap: 500 });
  let i = 1, st = 200; while (st === 200 && i < 400) { st = (await join(w, g.id, i)).status; i++; }
  expect(st, `joins stopped at ${i}`).toBe(503);
  const reads = [await w.call("GET", `/api/z/${g.id}/info`), await w.call("GET", `/api/z/${g.id}/results`), await w.call("GET", `/api/z/${g.id}/control`), await w.call("GET", "/api/mode"), await w.call("GET", "/api/z/ai-manifest")];
  expect(reads.map((r) => r.status === 200 || r.status === 404)).toEqual([true, true, true, true, true]);
  const body = await (await w.call("POST", `/api/z/${g.id}/join`, { phone: phone(900), name: "x", device: dev("x") })).json() as any; expect(body.error).toMatch(/busy/i);
  const nextDay = await join(w, g.id, 901, T + DAY + HOUR); expect(nextDay.status).toBe(200);
  return `guard hit after ${i - 1} joins`;
});
tt({ id: "TT-34", role: "organizer", title: "pause and announcements need the organizer's console: without it an announcement is stored but no phone is told", steps: "Published game, console never opened: announce, ask for pause, read the control file phones read", expected: "phones' control file carries the announcement (or the organizer is told it will not reach phones)", known: "G4", severityIfFails: "M" }, async () => {
  const w = world(); const g = await paidEngagement(w, { cap: 50 });
  const ann = await j(await w.call("POST", `/api/z/${g.id}/announce`, { text: "Free snacks at the pantry" }, g.org.h, T + 1000));
  const ctl = await w.call("GET", `/api/z/${g.id}/control`, undefined, {}, T + 2000); const body = await j(ctl);
  const pr = await j(await w.call("POST", `/api/z/${g.id}/control/request`, { action: "pause", note: "fire drill" }, g.org.h, T + 3000));
  expect(ann.ok).toBe(true);
  expect(JSON.stringify(body), `announce answered ${J(ann)}; the phones' control file is ${ctl.status} ${J(body)}; pause request answered ${J(pr)}`).toContain("Free snacks");
  return "delivered";
});
tt({ id: "TT-35", role: "organizer", title: "a console left open registers the signing key; closing it later does not undo announcements already sent", steps: "Register a key (as the console does), announce, read control", expected: "control file carries the announcement" }, async () => {
  const w = world(); const g = await paidEngagement(w, { cap: 50 });
  const { publicKeyFromSecret } = await import("../../../packages/beacon/src/control");
  const pub = publicKeyFromSecret("44".repeat(32));
  const reg = await w.call("PUT", `/api/z/${g.id}/control/key`, { publicKey: pub }, g.org.h, T + 500); expect(reg.status, await reg.clone().text()).toBe(200);
  await w.call("POST", `/api/z/${g.id}/announce`, { text: "Hello again" }, g.org.h, T + 1000);
  const body = await j(await w.call("GET", `/api/z/${g.id}/control`, undefined, {}, T + 2000));
  expect(JSON.stringify(body)).toContain("Hello again");
  return "delivered with a registered key";
});
tt({ id: "TT-36", role: "organizer", title: "a draft engagement cannot be deleted by hand (only forgotten after 30 days) and 10 drafts block new ones", steps: "Create 11 drafts", expected: "11th refused with a message; the message does not tell the organizer to do something impossible ('delete one')", known: "G6", severityIfFails: "L" }, async () => {
  const w = world(); const o = await organizer(w, "drafts@example.com"); const st: number[] = []; let msg = "";
  for (let i = 0; i < 11; i++) { const r = await w.call("POST", "/api/z", { id: `DRAFT${i}XX`, startRound: roundAt(T + 3 * DAY), callSeconds: 6, cap: 50 }, o.h); st.push(r.status); if (r.status !== 200) msg = (await r.json() as any).error; }
  expect(st.slice(0, 10).every((s) => s === 200) && st[10] !== 200).toBe(true);
  const del = await w.call("DELETE", "/api/z/DRAFT0XX", undefined, o.h);
  expect(msg + " | delete: " + del.status, "the refusal says 'delete one' but no delete exists").not.toMatch(/delete one/i);
  return msg;
});
