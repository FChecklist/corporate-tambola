// The guided path for an AI assistant: every screen is one short, ready-made link; the AI shows the words, offers the choices, opens the link the organizer picks.
// Nothing is typed into an address by the AI (some chatbots refuse addresses they build themselves, and Claude limits addresses to 250 characters), and nothing is saved
// until the organizer says yes at the read-back (so the 10 free drafts are never wasted). State travels in the link itself (short keys), so there is nothing to store.
// The ONE sanctioned exception, and the manual says the same: to NAME the prizes (free text) or to place brand moments, the AI may build the settings address itself,
// exactly as the manual's examples show. Everything else: only the links it was given.
//
//   d day (YYYY-MM-DD, India)  t time (HHMM)  o occasion  c people limit  k tickets (1|2)  s speed (6|9|12|15)  r rounds (1-5)  j join (o open | c invite-only)
//   v invitations per guest (0 = off)  cm who calls (a software | h a Host presses a button)  sm how it starts (a by itself | m I press Start)  ti tie rule (n next | s share)  p prize bundle (c classic | s simple | r rich)
//   f Full House winners (1|2|3|5)  l winners per line prize (1|2)  x brand moments (n none | s speech break | o opening message | b both | l lucky draw)
//   id game code  m message number  w day page (1 = the next 7 days, 2 = the 7 after, ...; never carried forward)
//
// The renderer is pure except for `ctx.api`, which calls our own API as the organizer's AI key (so every rule and every audit row is the same as a direct call).

import { PACKS, price } from "../../../packages/shared/src/pricing";
import { roundAt, roundTimeMs } from "../../../packages/beacon/src/index";
import { MANUAL_MAX_PARTICIPANTS } from "../../../packages/beacon/src/control";

export interface Choice { n: number; label: string; url: string; recommended?: boolean }
export interface Screen { say: string; choices: Choice[]; ifWrong?: string; done?: boolean }
export interface GoCtx { base: string; origin: string; now: number; api: (method: string, path: string, body?: unknown) => Promise<{ status: number; json: any }> }

const IST = 19_800_000;
export const OCCASIONS: Record<string, { label: string; code: string }> = {
  diwali: { label: "Diwali party", code: "DIWALI" }, dealer: { label: "Dealer meet", code: "DEALER-MEET" }, annual: { label: "Annual day", code: "ANNUAL-DAY" },
  team: { label: "Team party", code: "TEAM-PARTY" }, customer: { label: "Customer event", code: "CUSTOMER-EVENT" }, family: { label: "Family day", code: "FAMILY-DAY" },
  weekend: { label: "Weekend Fun", code: "WEEKEND-FUN" }, christmas: { label: "Christmas Party", code: "CHRISTMAS-PARTY" }, eid: { label: "Eid Party", code: "EID-PARTY" }, holi: { label: "Holi Party", code: "HOLI-PARTY" }, other: { label: "Corporate event", code: "EVENT" },
};
const SLOTS = ["1000", "1200", "1600", "1800", "1900", "2000"];
export const PRESET_MESSAGES = ["Welcome! The game starts soon. Please keep this page open.", "The game starts in about 10 minutes. Please keep this page open.", "Thank you for joining. Good luck, everyone!", "A short break is coming. Please stay on this page."];
const BUNDLES: Record<string, { label: string; houses: string[] }> = {
  c: { label: "Classic: Early 5, Top line, Middle line, Bottom line, Full house", houses: ["early5", "top", "mid", "bot", "full"] },
  s: { label: "Simple: Early 5 and Full house", houses: ["early5", "full"] },
  r: { label: "Rich: Early 5, the three lines, Four corners, Star and Full house", houses: ["early5", "top", "mid", "bot", "corners", "star", "full"] },
};
const LINES = new Set(["top", "mid", "bot"]);
/** How many days ahead a game may be set: 30 while it is not paid for; a paid game may move to any day within 365 days of the payment (the server enforces both). */
export const DAYS_AHEAD = { unpaid: 30, paid: 365 };
const DAYS_PER_PAGE = 7;
export const SPEEDS = [12]; // one speed for new games (older games keep theirs; the Worker still accepts every gap)
export const FULL_HOUSE_WINNERS = [1, 2, 3, 5];
/** The one-line rule of real housie, said at the read-back and on the save page. */
export const HOUSIE_RULE = "Your guests tap each number as it is called and press Claim before the next number; a wrong claim is a Bogey; two Bogeys on the same prize put that ticket out of it.";
/** Where the prize names come from: free text, so the guided links cannot carry them. Said on the prizes page and the save page; the manual says the same. */
export const PRIZE_NAMES_NOTE = "Tell me the name of each prize and I will add them for you (naming prizes is the one change I make for you without a ready link). Or name them yourself in your console, step 3.";
const BOARD_NOTE = "Your board: open it from your console, step 6, 'Open my board' (it carries your personal key, so I cannot give it).";
/** The brand-moment presets the extras step offers. One during-the-game moment lands after number 45 (about halfway): the software places it. */
const MOMENTS: Record<string, { label: string; rec?: boolean }> = {
  n: { label: "No brand moment", rec: true },
  s: { label: "A 1-minute speech break midway: the numbers pause after number 45 and you or a Host speak live to the room or on the call (nothing is uploaded)" },
  o: { label: "An opening message while guests wait for the first number (I write the words with you next)" },
  b: { label: "Both: the opening message and the 1-minute speech break after number 45" },
  l: { label: "A lucky draw (1 winner, after number 45; you name the prize later)" },
  w: { label: "A live welcome speech before the first number: you or a Host speak while the guests wait (nothing is uploaded)" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const istParts = (ms: number) => { const d = new Date(ms + IST); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() }; };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (iso: string, withYear = false) => { const [y, m, d] = iso.split("-").map(Number); const wd = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); return `${DAYS[wd]} ${d} ${MONTHS[m! - 1]}${withYear ? " " + y : ""}`; };
const timeLabel = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${t.slice(2) === "00" ? "" : ":" + t.slice(2)} ${h < 12 ? "am" : "pm"}`; };
/** The start moment for a day (YYYY-MM-DD) and time (HHMM), both in India time. */
export const startMsOf = (d: string, t: string): number => { const [y, m, dd] = d.split("-").map(Number); return Date.UTC(y!, m! - 1, dd!, Number(t.slice(0, 2)), Number(t.slice(2))) - IST; };
export const startRoundOf = (ms: number): number => roundAt(ms);
const validDay = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d), validTime = (t: string | null) => !!t && SLOTS.includes(t);
const money = (n: number) => `Rs ${price(n, "INR").total.toLocaleString("en-IN")} (about USD ${price(n, "USD").total})`;
const packFor = (cap: number) => PACKS.find((p) => p[0] >= cap)?.[0] ?? null;
const isoOf = (ms: number) => { const p = istParts(ms); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; };

/** The params a step carries forward, in a stable short order (`w`, the day page, is never carried: it belongs to the day picker alone). */
const KEYS = ["id", "d", "t", "o", "c", "k", "s", "r", "j", "v", "cm", "sm", "ti", "p", "f", "l", "x", "m"];
export function link(ctx: GoCtx, step: string, q: URLSearchParams, set: Record<string, string> = {}): string {
  const out = new URLSearchParams();
  for (const k of KEYS) { const v = k in set ? set[k] : q.get(k); if (v !== null && v !== undefined && v !== "") out.set(k, v); }
  const s = out.toString();
  return `${ctx.base}/go/${step}${s ? "?" + s : ""}`;
}
const withPage = (url: string, w: number) => `${url}${url.includes("?") ? "&" : "?"}w=${w}`;
const choices = (rows: [string, string, boolean?][]): Choice[] => rows.map(([label, url, rec], i) => ({ n: i + 1, label, url, ...(rec ? { recommended: true } : {}) }));
const WRONG = "If a link does not open or the answer is an error, tell the organizer plainly and offer the console (their own page) instead. Do not make up addresses. A page link that answers 308 and moves to the same name without .html (for example /zc or /pay) is normal: follow it.";

/** One page of days (7 a page) up to `limitDays` ahead, with Today and Tomorrow named plainly and paging links to a later (or earlier) page, so any allowed day can be picked. */
const dayRows = (ctx: GoCtx, q: URLSearchParams, next: string, limitDays: number): [string, string, boolean?][] => {
  const rows: [string, string, boolean?][] = [];
  const w = Math.max(1, Math.min(Math.ceil(limitDays / DAYS_PER_PAGE), Number(q.get("w")) || 1));
  const from = (w - 1) * DAYS_PER_PAGE, to = Math.min(limitDays, w * DAYS_PER_PAGE);
  const thisYear = istParts(ctx.now).y;
  for (let i = from; i < to; i++) {
    const iso = isoOf(ctx.now + i * 86_400_000);
    if (i === 0 && !SLOTS.some((t) => startMsOf(iso, t) >= ctx.now + 2 * 3_600_000)) continue; // nothing left today that is at least 2 hours ahead
    rows.push([(i === 0 ? "Today, " : i === 1 ? "Tomorrow, " : "") + dayLabel(iso, Number(iso.slice(0, 4)) !== thisYear), link(ctx, next, q, { d: iso })]);
  }
  const self = link(ctx, next === "time" ? "new" : "gtime", q, { d: "", t: "" });
  if (to < limitDays) { const a = isoOf(ctx.now + to * 86_400_000), b = isoOf(ctx.now + (Math.min(limitDays, to + DAYS_PER_PAGE) - 1) * 86_400_000); rows.push([`A later day (${dayLabel(a, true)} to ${dayLabel(b, true)})`, withPage(self, w + 1)]); }
  if (limitDays - to > 4 * DAYS_PER_PAGE) rows.push([`About a month later (from ${dayLabel(isoOf(ctx.now + (to + 4 * DAYS_PER_PAGE) * 86_400_000), true)})`, withPage(self, w + 5)]);
  if (w > 1) rows.push(["An earlier day", withPage(self, w - 1)]);
  return rows;
};
const timeRows = (ctx: GoCtx, q: URLSearchParams, next: string): [string, string, boolean?][] => {
  const d = q.get("d")!;
  return SLOTS.filter((t) => startMsOf(d, t) >= ctx.now + 2 * 3_600_000).map((t) => [timeLabel(t) + " (India time)", link(ctx, next, q, { t }), t === "1600"] as [string, string, boolean?]);
};
/** The settings read from the link, with the recommended value wherever the organizer has not chosen. */
const settingsOf = (q: URLSearchParams) => ({
  k: q.get("k") === "2" ? 2 : 1, s: SPEEDS.includes(Number(q.get("s"))) ? Number(q.get("s")) : 12, r: Math.min(5, Math.max(1, Number(q.get("r")) || 1)), j: q.get("j") === "c", v: Number(q.get("v")) || 0,
  host: q.get("cm") === "h" && Number(q.get("c")) <= MANUAL_MAX_PARTICIPANTS, manual: q.get("sm") === "m", share: q.get("ti") === "s", p: BUNDLES[q.get("p") || "c"] ?? BUNDLES.c!, f: FULL_HOUSE_WINNERS.includes(Number(q.get("f"))) ? Number(q.get("f")) : 1, l: q.get("l") === "2" ? 2 : 1, x: MOMENTS[q.get("x") || "n"] ? (q.get("x") || "n") : "n", c: Number(q.get("c")),
});
const prizeLines = (st: ReturnType<typeof settingsOf>): string => `${st.p.label}; ${st.f} Full House winner${st.f === 1 ? "" : "s"}${st.p.houses.some((h) => LINES.has(h)) ? `, ${st.l} winner${st.l === 1 ? "" : "s"} for each line` : ""}`;
const momentLine = (x: string): string => x === "n" ? "No brand moment" : x === "s" ? "A 1-minute speech break after number 45 (you or a Host speak live)" : x === "o" ? "An opening message while guests wait" : x === "w" ? "A live welcome speech before the first number (you or a Host speak)" : x === "b" ? "An opening message while guests wait, and a 1-minute speech break after number 45" : "One lucky draw (1 winner, after number 45); you name the prize later";
const summaryLines = (q: URLSearchParams): string[] => {
  const d = q.get("d")!, t = q.get("t")!, o = OCCASIONS[q.get("o") || "other"] ?? OCCASIONS.other!, st = settingsOf(q);
  const pk = packFor(st.c);
  return [`Game: ${o!.label}`, `Day and time: ${dayLabel(d, true)}, ${timeLabel(t)} India time (the first number is called 2 minutes after)`, `People: up to ${st.c}${pk ? ` (${money(pk)})` : ""}`,
    `${st.k} ticket${st.k === 1 ? "" : "s"} per person, a number every ${st.s} seconds, ${st.r} round${st.r === 1 ? "" : "s"}`, st.manual ? "You press Start at the start time" : "The game starts by itself at the start time", st.host ? "A Host presses a button for each number" : "The software calls the numbers at that speed",
    st.share ? "Tie rule: people finishing on the same number share that prize" : "Tie rule: people finishing on the same number take the next prizes one after the other",
    st.j ? "Invite-only: only people on your list can join" : "Anyone with the link can join", st.v ? `Each guest may invite up to ${st.v} more people` : "Guests may not invite others",
    `Prizes: ${prizeLines(st)} (you name each prize afterwards)`, momentLine(st.x), `How a prize is won: ${HOUSIE_RULE}`, "Nothing is charged until you pay, before the start time."];
};
const consoleOf = (ctx: GoCtx, id: string, act = "") => `${ctx.origin}/zc.html?e=${encodeURIComponent(id)}${act ? "&do=" + act : ""}`;
const payOf = (ctx: GoCtx, id: string) => `${ctx.origin}/pay.html?e=${encodeURIComponent(id)}`;

export async function goScreen(ctx: GoCtx, step: string, q: URLSearchParams): Promise<Screen> {
  const L = (s: string, set: Record<string, string> = {}) => link(ctx, s, q, set);
  const st = settingsOf(q);
  switch (step) {
    case "": case "start": return { say: "Hello! I can set up or manage your Corporate Tambola game with you. What would you like to do?", choices: choices([["Start a new game", `${ctx.base}/go/new`, true], ["Change a game that has not started yet", `${ctx.base}/go/games`], ["Show the links of a game", `${ctx.base}/go/games?then=links`], ["Tell me about the software (is it safe, confidential, legal?)", `${ctx.base}/facts`], ["Try a free demo first", `${ctx.origin}/demo.html`]]), ifWrong: WRONG };
    case "new": return { say: `Which day is the game? (India time; any day within the next ${DAYS_AHEAD.unpaid} days. Once it is paid you can move it to any day within ${DAYS_AHEAD.paid} days of the payment.)`, choices: choices(dayRows(ctx, q, "time", DAYS_AHEAD.unpaid)), ifWrong: WRONG };
    case "time": if (!validDay(q.get("d"))) return goScreen(ctx, "new", q);
      return { say: `${dayLabel(q.get("d")!, true)}. At what time should it start? (Guests can join before; the first number is called 2 minutes after the start time.)`, choices: choices(timeRows(ctx, q, "occ")), ifWrong: WRONG };
    case "occ": if (!validDay(q.get("d")) || !validTime(q.get("t"))) return goScreen(ctx, "new", q);
      return { say: "What is the occasion?", choices: choices(Object.entries(OCCASIONS).map(([k, v]) => [v.label, L("size", { o: k })] as [string, string])), ifWrong: WRONG };
    case "size": return { say: "How many people at most? Choose a little above your headcount (people invited by your guests count too). The price follows the size and is paid only when you are ready, before the start.", choices: choices(PACKS.map(([n]) => [`Up to ${n} people: ${money(n)}`, L("play", { c: String(n) }), n === 250] as [string, string, boolean?])), ifWrong: WRONG };
    case "play": {
      const lines = `Here is how it will play: ${st.k} ticket${st.k === 1 ? "" : "s"} per person, a number every ${st.s} seconds, ${st.r} round${st.r === 1 ? "" : "s"}. ${st.host ? "A Host presses a button for each number." : "The software calls the numbers."} ${st.manual ? "You press Start at the start time." : "It starts by itself at the start time."} ${st.share ? "On a tie, people share the prize." : "On a tie, people take the next prizes one after the other."} ${st.j ? "Invite-only." : "Open to anyone with the link."} ${st.v ? `Guests may invite up to ${st.v} more people each.` : "Guests may not invite others."}`;
      return { say: `${lines} These are the recommended choices. Change anything, or continue.`, choices: choices([["Looks good, continue", L("prizes"), true], [st.k === 1 ? "Give each person 2 tickets (more chances)" : "Give each person 1 ticket", L("play", { k: st.k === 1 ? "2" : "1" })],
        [`Change the speed (now a number every ${st.s} seconds)`, L("speed")], [`How does it start (now: ${st.manual ? "I press Start" : "by itself at the time"})`, L("starter")], [`Who calls the numbers (now: ${st.host ? "a Host presses a button" : "the software"})`, L("caller")], [`Rounds (now ${st.r})`, L("rounds")], [`What happens on a tie (now: ${st.share ? "share the prize" : "the next prizes"})`, L("tie")],
        [st.j ? "Open to anyone with the link" : "Invite-only (only people on my list)", L("play", { j: st.j ? "o" : "c" })], [st.v ? "Guests may not invite others" : "Let each guest invite up to 4 more (family, colleagues)", L("play", { v: st.v ? "0" : "4" })]]), ifWrong: WRONG };
    }
    case "speed": return { say: "When the game calls the numbers itself, every game has one speed: a new number every 12 seconds. (When a Host presses for each number, there is no fixed gap: the Host sets the pace.) A full game of 90 numbers takes about 18 minutes, or about 36 minutes with two tickets each. With claims, a game takes 30 to 60 minutes.", choices: choices([["Every 12 seconds", L("play", { s: "12" }), true]]), ifWrong: WRONG };
    case "starter": return { say: `How does the game start? By itself at the start time, or you (or a Host) press a big Start button. Start can be pressed only from the start time on; until then players see "waiting for the host". Pressing Start works for games of any size.`,
      choices: choices([["It starts by itself at the start time", L("play", { sm: "a" }), true], ["I press Start", L("play", { sm: "m" })]]), ifWrong: WRONG };
    case "caller": {
      const big = st.c > MANUAL_MAX_PARTICIPANTS;
      return { say: `Who calls the numbers? The software calls them at the chosen speed, or a Host presses a button for each number (the order still comes from public random numbers, so nobody can choose one). A Host can call the numbers in games of up to ${MANUAL_MAX_PARTICIPANTS.toLocaleString("en-IN")} people.${big ? ` Your game is larger, so the software calls them.` : ""}`,
        choices: choices([["The software calls the numbers", L("play", { cm: "a" }), true], ...(big ? [] : [["A Host presses a button for each number", L("play", { cm: "h" })] as [string, string, boolean?]])]), ifWrong: WRONG };
    }
    case "rounds": return { say: "How many rounds? Each round has new numbers and new tickets, with the same prizes.", choices: choices([1, 2, 3, 4, 5].map((r) => [`${r} round${r === 1 ? "" : "s"}`, L("play", { r: String(r) }), r === 1] as [string, string, boolean?])), ifWrong: WRONG };
    case "tie": return { say: "What happens when two people finish a prize on the same number?", choices: choices([["Next: they take the next prizes one after the other (first winner, second winner...)", L("play", { ti: "n" }), true], ["Share: they share that prize", L("play", { ti: "s" })]]), ifWrong: WRONG };
    case "prizes": return { say: `Which prizes do you want to run? (You give the prizes; we only provide the software.) ${PRIZE_NAMES_NOTE}`, choices: choices(Object.entries(BUNDLES).map(([k, b]) => [b.label, L("fullhouse", { p: k }), k === "c"] as [string, string, boolean?])), ifWrong: WRONG };
    case "fullhouse": return { say: "How many Full House winners? (First, second, third... each is a prize you give.)", choices: choices(FULL_HOUSE_WINNERS.map((n) => [`${n} Full House winner${n === 1 ? "" : "s"}`, L(st.p.houses.some((h) => LINES.has(h)) ? "lines" : "extras", { f: String(n) }), n === 1] as [string, string, boolean?])), ifWrong: WRONG };
    case "lines": return { say: "How many winners for each line prize (Top, Middle and Bottom line)?", choices: choices([1, 2].map((n) => [`${n} winner${n === 1 ? "" : "s"} for each line`, L("extras", { l: String(n) }), n === 1] as [string, string, boolean?])), ifWrong: WRONG };
    case "extras": return { say: "Do you want a brand moment? A speech break means the numbers pause for 1 minute while you or a Host speak live; it lands after number 45, about halfway. (More moments, videos and slides can be added after saving; I can help.)", choices: choices(Object.entries(MOMENTS).map(([k, m]) => [m.label, L("review", { x: k }), !!m.rec] as [string, string, boolean?])), ifWrong: WRONG };
    case "review": {
      if (!validDay(q.get("d")) || !validTime(q.get("t")) || !q.get("c")) return goScreen(ctx, "new", q);
      return { say: ["Please read this back to the organizer and ask for a clear yes:", ...summaryLines(q).map((l) => "- " + l), "", "Nothing has been saved yet."].join("\n"), choices: choices([["Yes, save my draft", L("save"), true], ["Change the day or time", L("new", { d: "", t: "" })], ["Change the size", L("size")], ["Change how it plays", L("play")], ["Change the prizes", L("prizes")], ["Change the brand moment", L("extras")]]), ifWrong: WRONG };
    }
    case "save": {
      if (!validDay(q.get("d")) || !validTime(q.get("t")) || !q.get("c")) return goScreen(ctx, "new", q);
      const startMs = startMsOf(q.get("d")!, q.get("t")!);
      if (startMs <= ctx.now) return { say: "That start time has already passed. Please choose a new day and time.", choices: choices([["Choose a new day and time", `${ctx.base}/go/new`]]) };
      const o = OCCASIONS[q.get("o") || "other"] ?? OCCASIONS.other!;
      const rewards: { pattern: string; ordinal: number; text: string }[] = [];
      for (const h of st.p.houses) { const n = h === "full" ? st.f : LINES.has(h) ? st.l : 1; for (let i = 1; i <= n; i++) rewards.push({ pattern: h, ordinal: i, text: "" }); }
      const speech = { kind: "speech", title: "A word from the organizer", seconds: 60 }, opening = { kind: "speech", title: "Welcome! The game starts soon. Please keep this page open.", seconds: 60 };
      const welcome = { kind: "speech", title: "A welcome from the organizer", seconds: 60 };
      const moments = st.x === "s" ? { breaks: [speech] } : st.x === "o" ? { opening: [opening] } : st.x === "w" ? { opening: [welcome] } : st.x === "b" ? { opening: [opening], breaks: [speech] } : st.x === "l" ? { breaks: [{ kind: "lucky", title: "Lucky draw", winners: 1, seconds: 60 }] } : {};
      const base = `${o.code}-${pad(istParts(startMs).mo)}${pad(istParts(startMs).d)}`; let id = base, made: any = null;
      for (let i = 1; i <= 9; i++) {
        id = i === 1 ? base : `${base}-${i}`;
        const body: any = { id, name: `${o.label}, ${dayLabel(q.get("d")!)}`, startRound: startRoundOf(startMs), callSeconds: st.s, cap: st.c, tickets: st.k, rounds: st.r, rewards, closed: st.j, ties: st.share ? "share" : "next", ...(st.host ? { callMode: "host" } : {}), ...(st.manual ? { startMode: "manual" } : {}), ...moments };
        const r = await ctx.api("POST", "z", body);
        if (r.status !== 200) return { say: `I could not save it: ${r.json?.error ?? "something went wrong"}. ${r.json?.next ?? ""}`.trim(), choices: choices([["Open the organizer's console", `${ctx.origin}/zc.html`]]), ifWrong: WRONG };
        if (!r.json.existed) { made = r.json; break; }
      }
      if (!made) return { say: "I could not find a free game code. Please open the console.", choices: choices([["Open the organizer's console", `${ctx.origin}/zc.html`]]) };
      if (st.v) await ctx.api("PATCH", `z/${id}/settings`, { invites: { on: true, per: st.v, cats: ["family", "colleagues"] } });
      return { done: true, say: [`Your draft is saved. Its code is ${id}. Nobody else can see it yet.`, `How a prize is won: ${HOUSIE_RULE}`, "What is left, and who does it:", `1. Name the prizes. ${PRIZE_NAMES_NOTE}`, "2. Write the welcome message for your guests (link below), or add more brand moments, videos or a lucky draw (I can help; I can also show you a test page so you see a video exactly as a guest will).", "3. Load the guest list in your console, or simply share the guest link (names never pass through me).", "4. You press Publish (free) on the page below: one tap.", `5. You pay on the pay link. Pay before the start time so the game begins on time; a later payment starts it 2 minutes after you pay (the last moment is shown on the pay page)"t")!)} India time). I never pay.`, "6. You share the guest link, which appears in your console and on my links page after you publish (we e-mail it too)."].join("\n"),
        choices: choices([["Open the draft in the console (watch it)", made.openUrl ?? consoleOf(ctx, id), true], ["Write the welcome message", `${ctx.base}/go/msg?id=${id}`], ["Load the guest list: in your console (names never pass through me)", consoleOf(ctx, id)], ["Publish: the organizer taps once", consoleOf(ctx, id, "publish")], ["Pay: the organizer pays (any time until the guest data is erased)", payOf(ctx, id)], ["Read the game back", `${ctx.base}/go/game?id=${id}`], ["See the links", `${ctx.base}/go/links?id=${id}`]]), ifWrong: WRONG };
    }
    case "games": {
      const r = await ctx.api("GET", "history");
      if (r.status !== 200) return { say: "I could not read your games. Please open the console.", choices: choices([["Open the organizer's console", `${ctx.origin}/zc.html`]]) };
      const next = q.get("then") === "links" ? "links" : "game";
      const open = (r.json.engagements as any[]).filter((e) => roundTimeMs(e.start_round) > ctx.now);
      if (!open.length) return { say: "You have no game that has not started yet. Do you want to start a new one?", choices: choices([["Start a new game", `${ctx.base}/go/new`, true]]) };
      return { say: "Which game? (Only games that have not started are shown.)", choices: choices(open.slice(0, 12).map((e) => [`${e.id}: ${e.startsAtIST}${e.draft ? " (draft)" : ""}, ${e.participants} joined`, `${ctx.base}/go/${next}?id=${encodeURIComponent(e.id)}`] as [string, string])), ifWrong: WRONG };
    }
    case "game": case "links": case "who": case "gtime": case "gtime2": case "gtime3": case "say": case "msg": case "say2": case "helper": return gameStep(ctx, step === "msg" ? "say" : step, q);
    case "facts": return { say: "Open the facts address; it lists the 10 facts.", choices: choices([["The 10 facts", `${ctx.base}/facts`]]) };
    default: return { say: "That step does not exist. Start again.", choices: choices([["Start", `${ctx.base}/go`]]) };
  }
}

async function gameStep(ctx: GoCtx, step: string, q: URLSearchParams): Promise<Screen> {
  const id = q.get("id") || "";
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) return goScreen(ctx, "games", q);
  const sm = await ctx.api("GET", `z/${id}/summary`);
  if (sm.status !== 200) return { say: `I could not read the game ${id}: ${sm.json?.error ?? "not found"}.`, choices: choices([["Choose another game", `${ctx.base}/go/games`]]) };
  const s = sm.json, draft = /draft/.test(s.status), unpaid = /payment due|NOT PAID/.test(s.status), published = !draft, payBefore: string | undefined = s.payUntil ?? s.payBefore; // the summary's payUntil (the erasure moment) is the real deadline
  const lk = s.links ?? {};
  const links = (): string[] => [`Console (your own page): ${lk.console ?? s.consoleUrl}`,
    ...(published ? [`Guest link (send to guests): ${lk.guest ?? s.shareUrl}`, `Number screen (for a TV, projector or a video call): ${lk.bigScreen ?? String(s.shareUrl).replace("/z.html", "/big.html")}`] : ["After you publish, two more links appear here: the guest link (to send to guests) and the number screen (for a TV, projector or a video call)."]),
    BOARD_NOTE, ...(draft ? [`Publish (free, one tap by you): ${lk.publishHandover ?? consoleOf(ctx, id, "publish")}`] : []),
    ...(lk.pay || s.payUrl || unpaid || draft ? [`Pay (you pay; I never do): ${lk.pay ?? s.payUrl ?? payOf(ctx, id)}${payBefore ? `, before ${payBefore}` : ""}`] : []),
    `Test a video or audio link: ${lk.testBrandMoment ?? ctx.origin + "/preview.html"} (the organizer can open this; I can build a ready address for a link)`];
  if (step === "links") return { say: ["Links for " + id + ":", ...links().map((l) => "- " + l)].join("\n"), choices: choices([...(draft ? [["Publish: the organizer taps once", lk.publishHandover ?? consoleOf(ctx, id, "publish")] as [string, string, boolean?]] : []), ["Back to this game", `${ctx.base}/go/game?id=${id}`]]), ifWrong: WRONG };
  if (step === "who") { const p = await ctx.api("GET", `z/${id}/participants?limit=1`); return { say: `${p.json?.total ?? 0} ${(p.json?.total ?? 0) === 1 ? "person has" : "people have"} joined ${id}${s.limit ? " out of a limit of " + s.limit : ""}. I only see ticket numbers, never names or mobile numbers.`, choices: choices([["Back to this game", `${ctx.base}/go/game?id=${id}`]]) }; }
  const limit = s.paid ? DAYS_AHEAD.paid : DAYS_AHEAD.unpaid;
  if (step === "gtime") return { say: `Change the day of ${id} (now ${s.startsAtIST}). Which day? (${s.paid ? `A paid game can move to any day within ${DAYS_AHEAD.paid} days of the payment.` : `A game that is not paid for yet can be set at most ${DAYS_AHEAD.unpaid} days ahead.`})`, choices: choices(dayRows(ctx, q, "gtime2", limit)), ifWrong: WRONG };
  if (step === "gtime2") { if (!validDay(q.get("d"))) return goScreen(ctx, "gtime", q); return { say: `${dayLabel(q.get("d")!, true)}. At what time?`, choices: choices(timeRows(ctx, q, "gtime3")), ifWrong: WRONG }; }
  if (step === "gtime3") {
    if (!validDay(q.get("d")) || !validTime(q.get("t"))) return goScreen(ctx, "gtime", q);
    const ms = startMsOf(q.get("d")!, q.get("t")!); const r = await ctx.api("PATCH", `z/${id}/settings`, { startRound: startRoundOf(ms) });
    return r.status === 200 ? { done: true, say: `Done. ${id} now starts on ${dayLabel(q.get("d")!, true)} at ${timeLabel(q.get("t")!)} India time (the first number 2 minutes after).`, choices: choices([["Back to this game", `${ctx.base}/go/game?id=${id}`]]) } : { say: `I could not change it: ${r.json?.error ?? "error"}. ${r.json?.next ?? ""}`.trim(), choices: choices([["Back to this game", `${ctx.base}/go/game?id=${id}`]]) };
  }
  if (step === "say") { if (!published) return { say: "Messages can be sent only after you publish: nobody can see a draft. Publish first (one tap), then come back here to send the welcome message.", choices: choices([["Publish: the organizer taps once", consoleOf(ctx, id, "publish")], ["Back", `${ctx.base}/go/game?id=${id}`]]) }; return { say: "Which message should go to every guest's phone (it is spoken and shown, and goes to the big screen)?", choices: choices(PRESET_MESSAGES.map((m, i) => [m, link(ctx, "say2", q, { id, m: String(i + 1) })] as [string, string])) }; }
  if (step === "say2") { const i = Number(q.get("m")) - 1, text = PRESET_MESSAGES[i]; if (!text) return goScreen(ctx, "say", q); const r = await ctx.api("POST", `z/${id}/announce`, { text }); return { done: r.status === 200, say: r.status === 200 ? `Sent to every guest: "${text}"` : `I could not send it: ${r.json?.error ?? "error"}. ${r.json?.next ?? ""}`.trim(), choices: choices([["Back to this game", `${ctx.base}/go/game?id=${id}`]]) }; }
  if (step === "helper") {
    return { done: true, say: `A Host needs a name and a mobile number or an e-mail address (or both), and only the owner enters those, in the console (Your team). Ask the organizer to add the Host there; I cannot. A Host looks after the game with them but cannot change the account or add another Host.`, choices: choices([["Back to this game", `${ctx.base}/go/game?id=${id}`]]) };
  }
  // the game menu
  const rows: [string, string, boolean?][] = [["Change the day or time", `${ctx.base}/go/gtime?id=${id}`], ["Show the links", `${ctx.base}/go/links?id=${id}`], ["How many have joined", `${ctx.base}/go/who?id=${id}`], ["Create a Host link", `${ctx.base}/go/helper?id=${id}`]];
  if (published) rows.splice(2, 0, ["Send a message to every guest", `${ctx.base}/go/say?id=${id}`]);
  if (draft) rows.unshift(["Publish (free): the organizer taps once", consoleOf(ctx, id, "publish"), true]);
  if (draft || unpaid) rows.push(["Pay: the organizer pays", lk.pay ?? s.payUrl ?? payOf(ctx, id)]);
  rows.push(["Erase all guest data now: the organizer confirms", consoleOf(ctx, id, "erase")], ["Pause or stop: the organizer taps once", consoleOf(ctx, id, "pause")]);
  return { say: [`Game ${id}: ${s.status}. Starts ${s.startsAtIST}. Up to ${s.limit} people, ${s.participants} joined, ${s.tickets} ticket${s.tickets === 1 ? "" : "s"} each.`, ...(unpaid && payBefore ? [`Payment is due before ${payBefore} (the organizer pays; I never do).`] : []), "What would you like to do?"].join("\n"), choices: choices(rows), ifWrong: WRONG };
}

export function screenText(s: Screen): string {
  const L = ["SAY TO THE ORGANIZER:", s.say, ""];
  if (s.choices.length) { L.push("CHOICES (offer these; open ONLY the link of the one the organizer picks; never build a link yourself):"); for (const c of s.choices) L.push(`${c.n}. ${c.label}${c.recommended ? "  (recommended)" : ""}`, `   LINK: ${c.url}`); }
  if (s.ifWrong) L.push("", "IF SOMETHING GOES WRONG: " + s.ifWrong);
  return L.join("\n");
}
export const screenJson = (s: Screen) => ({ say: s.say, choices: s.choices, ...(s.ifWrong ? { if_something_goes_wrong: s.ifWrong } : {}), ...(s.done ? { done: true } : {}) });
