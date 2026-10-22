// The guided path (src/ai-go.ts), screen by screen, after the dry run of 2026-10-22 with an AI that knew only the pasted message: any allowed day can be picked (paging),
// every "how it plays" question has numbered choices (speed, who calls, rounds, tie rule), the prize counts are links, prize NAMES are the one sanctioned self-built write,
// brand moments come as presets, the real-housie rule is said at the read-back and on the save page, and the links page lists every link and says which come after publishing.
import { beforeEach, describe, expect, test } from "bun:test";
import { withDevice } from "./device";
import { type Env } from "../src/worker";
import { handle } from "./with-terms";
import type { PayEnv } from "../src/pay";
import { makeD1 } from "./d1-sqlite";
import { DAYS_AHEAD, HOUSIE_RULE, PRIZE_NAMES_NOTE } from "../src/ai-go";

const T = Date.UTC(2026, 9, 1, 10, 0, 0); // Thu 1 Oct 2026, 15:30 India time
const ORIGIN = "https://tambola.test";
let env: PayEnv; let raw: ReturnType<typeof makeD1>["raw"];
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  handle(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...headers }, body: withDevice(method, path, body) }), env as Env, T);
const j = async (r: Response) => (await r.json()) as any;
const contact = { email: "boss@acme.com", phone: "98765 43210" };
beforeEach(() => { const d = makeD1(); raw = d.raw; env = { DB: d.db, ORGANIZER_SECRET: "plat", DAILY_WRITE_BUDGET: "100000", PUBLIC_ORIGIN: ORIGIN, DATA_KEY: "test-data-key" }; });
async function organizer() {
  const x = await j(await call("POST", "/api/start", { email: "boss@acme.com" }, { "cf-connecting-ip": "1.1.1.1" }));
  return { key: x.aiKey as string, token: x.token as string, base: `${ORIGIN}/ai/${x.aiKey}` };
}
const open = async (url: string) => { const u = new URL(url); const r = await call("GET", u.pathname + u.search); return { status: r.status, text: await r.text() }; };
type Choice = { n: number; label: string; url: string; rec: boolean };
const choicesOf = (t: string): Choice[] => {
  const out: Choice[] = []; const lines = t.split("\n");
  for (let i = 0; i < lines.length; i++) { const m = /^(\d+)\. (.*?)(  \(recommended\))?$/.exec(lines[i]!); const l = /^\s+LINK: (\S+)$/.exec(lines[i + 1] ?? ""); if (m && l) out.push({ n: Number(m[1]), label: m[2]!, url: l[1]!, rec: !!m[3] }); }
  return out;
};
async function pick(from: string, label: RegExp) {
  const c = choicesOf(from).find((x) => label.test(x.label)); if (!c) throw new Error(`no choice matching ${label} in:\n${from}`);
  expect(c.url.length).toBeLessThan(250); const r = await open(c.url); expect(r.status).toBe(200); return r.text;
}
/** Day, time, occasion and size picked; returns the "how it plays" screen. */
async function toPlay(base: string, size = /Up to 100/) { let t = (await open(`${base}/go/new`)).text; t = await pick(t, /^Tomorrow/); t = await pick(t, /^4 pm/); t = await pick(t, /Diwali/); return pick(t, size); }
const dayLabels = (t: string) => choicesOf(t).map((c) => c.label).filter((l) => !/later day|month later|earlier day/.test(l));

describe("1. the day picker reaches every allowed day", () => {
  test("a new game: 7 days a page, Today and Tomorrow named plainly, 'a later day' pages up to 30 days and no further; the day links carry no page", async () => {
    const o = await organizer();
    let t = (await open(`${o.base}/go/new`)).text; expect(t).toMatch(/within the next 30 days/);
    let days = dayLabels(t); expect(days[0]).toBe("Today, Thu 1 Oct"); expect(days[1]).toBe("Tomorrow, Fri 2 Oct"); expect(days[2]).toBe("Sat 3 Oct"); expect(days.length).toBe(7);
    const later = choicesOf(t).find((c) => /^A later day \(Thu 8 Oct 2026 to Wed 14 Oct 2026\)/.test(c.label))!; expect(later.url).toBe(`${o.base}/go/new?w=2`);
    expect(choicesOf(t).some((c) => /month later/.test(c.label))).toBe(false); // 30 days: no month jump
    expect(choicesOf(t).some((c) => /earlier day/.test(c.label))).toBe(false);
    t = (await open(later.url)).text; days = dayLabels(t); expect(days).toEqual(["Thu 8 Oct", "Fri 9 Oct", "Sat 10 Oct", "Sun 11 Oct", "Mon 12 Oct", "Tue 13 Oct", "Wed 14 Oct"]);
    expect(choicesOf(t).find((c) => /earlier day/.test(c.label))!.url).toBe(`${o.base}/go/new?w=1`);
    for (let w = 3; w <= 5; w++) t = (await open(`${o.base}/go/new?w=${w}`)).text;
    days = dayLabels(t); expect(days[0]).toBe("Thu 29 Oct"); expect(days.length).toBe(2); // days 28 and 29: the 30-day limit
    expect(choicesOf(t).some((c) => /later day/.test(c.label))).toBe(false); // nothing beyond the limit
    expect((await open(`${o.base}/go/new?w=99`)).text).toContain("Thu 29 Oct"); // a page past the end is the last page
    const picked = choicesOf(t)[0]!; expect(picked.url).toBe(`${o.base}/go/time?d=2026-10-29`); // no w is carried
    expect((await open(picked.url)).text).toMatch(/Thu 29 Oct 2026\. At what time/);
  });
  test("today disappears once no slot is 2 hours ahead; the year is shown when a page crosses into the next year", async () => {
    const o = await organizer();
    const late = (await handle(new Request("http://x/ai/" + o.key + "/go/new", { method: "GET" }), env as Env, Date.UTC(2026, 11, 30, 14, 0))).text(); // 30 Dec 2026, 19:30 India time: 8 pm is less than 2 hours ahead
    const d = dayLabels(await late); expect(d[0]).toBe("Tomorrow, Thu 31 Dec"); expect(d[1]).toBe("Fri 1 Jan 2027");
  });
  test("changing the day of a paid game pages up to 365 days, with a month jump; an unpaid game stays at 30", async () => {
    const o = await organizer(); const FUT = Math.floor((T / 1000 - 1692803367) / 3) + 1 + 4000;
    await call("POST", `/ai/${o.key}/z`, { id: "PAGE-1", startRound: FUT, callSeconds: 9, cap: 100 });
    let t = (await open(`${o.base}/go/gtime?id=PAGE-1`)).text; expect(t).toMatch(/at most 30 days ahead/); expect(choicesOf(t).some((c) => /month later/.test(c.label))).toBe(false);
    expect(choicesOf(t).find((c) => /later day/.test(c.label))!.url).toBe(`${o.base}/go/gtime?id=PAGE-1&w=2`);
    raw.prepare("UPDATE engagement SET pack=100 WHERE id=?").run("PAGE-1"); // paid, as the pay page would leave it
    t = (await open(`${o.base}/go/gtime?id=PAGE-1`)).text; expect(t).toMatch(new RegExp(`within ${DAYS_AHEAD.paid} days of the payment`));
    const month = choicesOf(t).find((c) => /About a month later \(from Thu 5 Nov 2026\)/.test(c.label))!; expect(month.url).toBe(`${o.base}/go/gtime?id=PAGE-1&w=6`);
    const far = (await open(`${o.base}/go/gtime?id=PAGE-1&w=52`)).text; expect(dayLabels(far)[0]).toBe("Thu 23 Sep 2027"); // day 357: the year is shown
    const last = (await open(`${o.base}/go/gtime?id=PAGE-1&w=53`)).text; expect(dayLabels(last).length).toBe(1); expect(dayLabels(last)[0]).toBe("Thu 30 Sep 2027"); expect(choicesOf(last).some((c) => /later day/.test(c.label))).toBe(false);
  });
});

describe("2. how it plays: every question has numbered choices and a recommendation", () => {
  test("speed, who calls, rounds and the tie rule are each one screen; the choice shows on the play screen and is saved", async () => {
    const o = await organizer();
    let t = await toPlay(o.base); expect(t).toMatch(/a number every 9 seconds, 1 round\. The software calls the numbers\. On a tie, people take the next prizes one after the other/);
    const labels = choicesOf(t).map((c) => c.label); expect(labels[0]).toBe("Looks good, continue"); expect(choicesOf(t)[0]!.rec).toBe(true);
    expect(labels).toEqual(expect.arrayContaining([expect.stringMatching(/^Change the speed \(now a number every 9 seconds\)/), expect.stringMatching(/^Who calls the numbers \(now: the software\)/), expect.stringMatching(/^Rounds \(now 1\)/), expect.stringMatching(/^What happens on a tie \(now: the next prizes\)/)]));
    let s = await pick(t, /Change the speed/); expect(choicesOf(s).map((c) => c.label)).toEqual(["Every 6 seconds (fast)", "Every 9 seconds (normal)", "Every 12 seconds (relaxed)", "Every 15 seconds (slow)"]); expect(choicesOf(s).find((c) => c.rec)!.label).toMatch(/9 seconds/);
    t = await pick(s, /Every 12 seconds/); expect(t).toMatch(/a number every 12 seconds/);
    s = await pick(t, /Who calls the numbers/); expect(s).toMatch(/presses a button for each number/); expect(s).toMatch(/up to 2,000 people/); expect(s).toMatch(/public random numbers, so nobody can choose one/);
    expect(choicesOf(s).map((c) => [c.label, c.rec])).toEqual([["The software calls the numbers", true], ["A Host presses a button for each number", false]]);
    t = await pick(s, /A Host presses a button/); expect(t).toMatch(/A Host presses a button for each number\./);
    s = await pick(t, /^Rounds/); expect(choicesOf(s).map((c) => c.label)).toEqual(["1 round", "2 rounds", "3 rounds", "4 rounds", "5 rounds"]); expect(choicesOf(s)[0]!.rec).toBe(true);
    t = await pick(s, /^3 rounds/); expect(t).toMatch(/3 rounds/);
    s = await pick(t, /What happens on a tie/); expect(s).toMatch(/finish a prize on the same number/);
    expect(choicesOf(s).map((c) => [c.label, c.rec])).toEqual([["Next: they take the next prizes one after the other (first winner, second winner...)", true], ["Share: they share that prize", false]]);
    t = await pick(s, /^Share/); expect(t).toMatch(/On a tie, people share the prize/);
    t = await pick(t, /Looks good/); t = await pick(t, /^Simple/); t = await pick(t, /^1 Full House winner$/); t = await pick(t, /No brand moment/);
    expect(t).toMatch(/- 1 ticket per person, a number every 12 seconds, 3 rounds/); expect(t).toMatch(/- A Host presses a button for each number/); expect(t).toMatch(/- Tie rule: people finishing on the same number share that prize/);
    for (const l of t.split("\n").filter((l) => l.startsWith("- "))) expect(l).not.toMatch(/callMode|callSeconds|ties|startRound|PATCH|JSON/); // plain words only
    t = await pick(t, /Yes, save/); expect(t).toMatch(/Your draft is saved/);
    const sm = await j(await call("GET", `/ai/${o.key}/z/DIWALI-1002/summary`));
    expect(sm).toMatchObject({ callSeconds: 12, callMode: "host", rounds: 3, ties: "share", tickets: 1 });
  });
  test("a game larger than 2,000 people is told plainly that the software calls the numbers, and the Host choice is not offered", async () => {
    const o = await organizer(); const t = await toPlay(o.base, /Up to 5000/); const s = await pick(t, /Who calls the numbers/);
    expect(s).toMatch(/Your game is larger, so the software calls them/); expect(choicesOf(s).map((c) => c.label)).toEqual(["The software calls the numbers"]);
  });
});

describe("3. prizes: the counts are links, the names are the one self-built write", () => {
  test("Rich with 3 Full House winners and 2 per line saves exactly those reward lines; the prizes page and the save page say how the names are given", async () => {
    const o = await organizer(); let t = await toPlay(o.base); t = await pick(t, /Looks good/);
    expect(t).toContain(PRIZE_NAMES_NOTE); expect(PRIZE_NAMES_NOTE).toMatch(/naming prizes is the one change I make for you without a ready link/); expect(PRIZE_NAMES_NOTE).toMatch(/console, step 3/);
    expect(choicesOf(t).map((c) => c.label)).toEqual(["Classic: Early 5, Top line, Middle line, Bottom line, Full house", "Simple: Early 5 and Full house", "Rich: Early 5, the three lines, Four corners, Star and Full house"]);
    t = await pick(t, /^Rich/); expect(choicesOf(t).map((c) => c.label)).toEqual(["1 Full House winner", "2 Full House winners", "3 Full House winners", "5 Full House winners"]); expect(choicesOf(t)[0]!.rec).toBe(true);
    t = await pick(t, /^3 Full House/); expect(choicesOf(t).map((c) => c.label)).toEqual(["1 winner for each line", "2 winners for each line"]);
    t = await pick(t, /^2 winners/); t = await pick(t, /No brand moment/);
    expect(t).toMatch(/- Prizes: Rich: Early 5, the three lines, Four corners, Star and Full house; 3 Full House winners, 2 winners for each line \(you name each prize afterwards\)/);
    t = await pick(t, /Yes, save/); expect(t).toContain(`1. Name the prizes. ${PRIZE_NAMES_NOTE}`);
    const sm = await j(await call("GET", `/ai/${o.key}/z/DIWALI-1002/summary`));
    expect(sm.rewards.map((r: any) => `${r.pattern}${r.ordinal}`)).toEqual(["early51", "top1", "top2", "mid1", "mid2", "bot1", "bot2", "corners1", "star1", "full1", "full2", "full3"]);
    expect(sm.rewards.every((r: any) => r.text === "")).toBe(true); // the names are not in any link
  });
  test("the manual and the front door agree with the guided pages: the settings address is the one sanctioned self-built write; everything else is a given link", async () => {
    const o = await organizer(); const full = (await open(o.base)).text; const front = full.slice(0, full.indexOf("LONG REFERENCE MANUAL"));
    expect(front).toMatch(/The ONE exception to 'only given links': prize NAMES and brand-moment titles are free text, so to name the prizes or place brand moments you may build the settings address yourself, exactly as the manual's examples show/);
    expect(full).toMatch(/This is the ONE address you may build yourself/); expect(full).toMatch(/Name the prizes \(the one address you build yourself/); expect(full).toMatch(/A speech break after number 45: GET/);
    expect(full).toMatch(/naming them is the one write you build yourself/);
  });
});

describe("4. brand moments come as presets", () => {
  test("speech break, opening message, both, lucky draw: each explained, each lands where the page says", async () => {
    const o = await organizer();
    const toExtras = async () => { let t = await toPlay(o.base); t = await pick(t, /Looks good/); t = await pick(t, /^Simple/); return pick(t, /^1 Full House winner$/); };
    let t = await toExtras(); expect(t).toMatch(/A speech break means the numbers pause for 1 minute while you or a Host speak live; it lands after number 45, about halfway/);
    const labels = choicesOf(t).map((c) => c.label); expect(choicesOf(t)[0]).toMatchObject({ label: "No brand moment", rec: true });
    expect(labels[1]).toMatch(/^A 1-minute speech break midway: the numbers pause after number 45 and you or a Host speak live/); expect(labels[2]).toMatch(/^An opening message while guests wait/); expect(labels[3]).toMatch(/^Both: the opening message and the 1-minute speech break after number 45/); expect(labels[4]).toMatch(/^A lucky draw \(1 winner, after number 45/);
    const save = async (from: string, re: RegExp, code: string) => { let r = await pick(from, re); expect(r).toMatch(/Nothing has been saved yet/); r = await pick(r, /Yes, save/); expect(r).toContain(`code is ${code}`); return j(await call("GET", `/ai/${o.key}/z/${code}/summary`)); };
    let sm = await save(t, /speech break midway/, "DIWALI-1002"); expect(sm.breaks).toMatchObject([{ kind: "speech", after: 45, seconds: 60 }]); expect(sm.opening).toEqual([]);
    sm = await save(await toExtras(), /^An opening message/, "DIWALI-1002-2"); expect(sm.breaks).toEqual([]); expect(sm.opening).toMatchObject([{ kind: "speech", title: expect.stringMatching(/Welcome/) }]);
    sm = await save(await toExtras(), /^Both/, "DIWALI-1002-3"); expect(sm.breaks).toMatchObject([{ kind: "speech", after: 45 }]); expect(sm.opening.length).toBe(1);
    sm = await save(await toExtras(), /^A lucky draw/, "DIWALI-1002-4"); expect(sm.breaks).toMatchObject([{ kind: "lucky", winners: 1, after: 45 }]);
    t = await pick(await toExtras(), /^Both/); expect(t).toMatch(/- An opening message while guests wait, and a 1-minute speech break after number 45/); // the read-back names the moment
    expect(choicesOf(t).some((c) => /Change the brand moment/.test(c.label))).toBe(true);
  });
});

describe("5 to 8. the rule, the links, the next steps, the 308", () => {
  test("the links page before and after publishing: console, pay (already for a draft), publish hand-over, the board note, and the guest link and number screen only once published", async () => {
    const o = await organizer(); const FUT = Math.floor((T / 1000 - 1692803367) / 3) + 1 + 4000;
    await call("POST", `/ai/${o.key}/z`, { id: "LINKS-1", startRound: FUT, callSeconds: 9, cap: 100 });
    let sm = await j(await call("GET", `/ai/${o.key}/z/LINKS-1/summary`)); expect(sm.links).toMatchObject({ console: `${ORIGIN}/zc.html?e=LINKS-1`, publishHandover: `${ORIGIN}/zc.html?e=LINKS-1&do=publish`, pay: `${ORIGIN}/pay.html?e=LINKS-1` }); expect(sm.links.guest).toBeUndefined();
    let t = (await open(`${o.base}/go/links?id=LINKS-1`)).text;
    expect(t).toMatch(/- Console \(your own page\): https:\/\/tambola.test\/zc.html\?e=LINKS-1\n/); expect(t).toMatch(/- After you publish, two more links appear here: the guest link \(to send to guests\) and the number screen/);
    expect(t).toMatch(/- Your board: open it from your console, step 6, 'Open my board' \(it carries your private key, so I cannot give it\)\./); expect(t).not.toMatch(/board\.html/);
    expect(t).toMatch(/- Publish \(free, one tap by you\): https:\/\/tambola.test\/zc.html\?e=LINKS-1&do=publish/); expect(t).toMatch(/- Pay \(you pay; I never do\): https:\/\/tambola.test\/pay.html\?e=LINKS-1/);
    expect(t).not.toMatch(/z\.html\?e=LINKS-1|big\.html\?e=LINKS-1/);
    await call("POST", `/api/z/LINKS-1/publish`, contact, { "x-organizer": o.token });
    sm = await j(await call("GET", `/ai/${o.key}/z/LINKS-1/summary`)); expect(sm.links).toMatchObject({ guest: `${ORIGIN}/z.html?e=LINKS-1`, bigScreen: `${ORIGIN}/big.html?e=LINKS-1`, pay: `${ORIGIN}/pay.html?e=LINKS-1` }); expect(sm.links.publishHandover).toBeUndefined();
    t = (await open(`${o.base}/go/links?id=LINKS-1`)).text;
    expect(t).toMatch(/- Guest link \(send to guests\): https:\/\/tambola.test\/z.html\?e=LINKS-1\n/); expect(t).toMatch(/- Number screen \(for a TV, projector or a video call\): https:\/\/tambola.test\/big.html\?e=LINKS-1\n/);
    expect(t).toMatch(/- Pay \(you pay; I never do\): https:\/\/tambola.test\/pay.html\?e=LINKS-1, before /); expect(t).not.toMatch(/appear here/); expect(t).not.toMatch(/do=publish/);
    expect(t).toMatch(/IF SOMETHING GOES WRONG: .*308 and moves to the same name without \.html \(for example \/zc or \/pay\) is normal: follow it/);
    const menu = (await open(`${o.base}/go/game?id=LINKS-1`)).text; expect(choicesOf(menu).find((c) => /^Pay: the organizer pays/.test(c.label))!.url).toBe(`${ORIGIN}/pay.html?e=LINKS-1`);
  });
  test("the save page says the real-housie rule, offers the next steps as links, and /go/msg is the welcome-message step (it waits for publishing)", async () => {
    const o = await organizer(); let t = await toPlay(o.base); t = await pick(t, /Looks good/); t = await pick(t, /^Simple/); t = await pick(t, /^1 Full House winner$/); t = await pick(t, /No brand moment/);
    expect(t).toContain(`- How a prize is won: ${HOUSIE_RULE}`); expect(HOUSIE_RULE).toBe("Your guests tap each number as it is called and press Claim before the next number; a wrong claim is a Bogey; two Bogeys on the same prize put that ticket out of it.");
    t = await pick(t, /Yes, save/); expect(t).toContain(`How a prize is won: ${HOUSIE_RULE}`);
    const cs = choicesOf(t); const by = (re: RegExp) => cs.find((c) => re.test(c.label))!.url;
    expect(by(/Write the welcome message/)).toBe(`${o.base}/go/msg?id=DIWALI-1002`); expect(by(/Load the guest list: in your console \(names never pass through me\)/)).toBe(`${ORIGIN}/zc.html?e=DIWALI-1002`);
    expect(by(/^Publish: the organizer taps once/)).toBe(`${ORIGIN}/zc.html?e=DIWALI-1002&do=publish`); expect(by(/^Pay: the organizer pays/)).toBe(`${ORIGIN}/pay.html?e=DIWALI-1002`);
    const msg = (await open(by(/Write the welcome message/))).text; expect(msg).toMatch(/Messages can be sent only after you publish/); expect(msg).toMatch(/come back here to send the welcome message/);
    expect(choicesOf(msg)[0]!.url).toBe(`${ORIGIN}/zc.html?e=DIWALI-1002&do=publish`);
    for (const line of t.split("\n")) expect(line).not.toMatch(/\bPATCH\b|\bPOST\b|JSON|_body|startRound/); // plain words on the save page
  });
  test("9. the front door stays short and comes first; the manual below mentions the 308 and the one self-built address", async () => {
    const o = await organizer(); const full = (await open(o.base)).text; const cut = full.indexOf("LONG REFERENCE MANUAL");
    expect(cut).toBeGreaterThan(0); expect(cut).toBeLessThan(8000); const front = full.slice(0, cut);
    expect(front.split("\n").length).toBeLessThan(60); expect(front).toMatch(/FIRST, say hello and offer these choices/); expect(front.indexOf("/go/new")).toBeLessThan(front.indexOf("THE 10 FACTS"));
    expect(front).toMatch(/answers 308 and moves to the same name without \.html \(for example \/zc\.html to \/zc, \/pay\.html to \/pay\) is normal: follow it/);
    expect(full.slice(cut)).toMatch(/answer 308 and move to the same name without \.html \(\/zc, \/pay, \/z, \/big\): normal, follow it/);
    expect(full.slice(cut)).toMatch(/The one write you build yourself is the settings address/);
  });
});
