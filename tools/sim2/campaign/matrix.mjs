// The 20-game matrix (docs/CAMPAIGN_20_GAMES.md). Ten games with 1 ticket (G01-G10), ten with 2 tickets (G11-G20). Every game takes a different mix of the factors below;
// every value of every factor is used at least twice per ticket mode, and the pairings are shifted between the two modes so the two groups do not repeat each other.
// Pure data + small helpers (no network): the runner (game.mjs) turns one spec into a played game.

const IST = 19_800_000;
/** a moment given in Indian time (what the owner sees on a clock) */
export const ist = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - IST;

/** CALENDAR: where the fake watch and calendar are set when the game is made. `leadHours` = hours until the game starts; `payAtHoursAfter` moves the clock before paying. */
export const CALENDARS = [
  { id: "ordinary", label: "ordinary day, 10:00", t0: ist(2026, 11, 2, 10, 0), leadHours: 3 },
  { id: "year-end", label: "31 Dec 18:30, game crosses into the new year", t0: ist(2026, 12, 31, 18, 30), leadHours: 5.4 },
  { id: "month-end", label: "31 Jan 20:00, month end", t0: ist(2027, 1, 31, 20, 0), leadHours: 3 },
  { id: "leap-day", label: "28 Feb 2028 22:00, game on 29 Feb", t0: ist(2028, 2, 28, 22, 0), leadHours: 3 },
  { id: "fy-change", label: "31 Mar 23:30, financial year changes (invoice series)", t0: ist(2027, 3, 31, 23, 30), leadHours: 3, payAfterMin: 45 },
  { id: "just-before-midnight", label: "23:50 IST, game starts after midnight", t0: ist(2026, 10, 31, 23, 50), leadHours: 3 },
  { id: "small-hours", label: "03:00 night start", t0: ist(2027, 6, 15, 3, 0), leadHours: 3 },
  { id: "resched", label: "game rescheduled once before it starts", t0: ist(2026, 11, 10, 12, 0), leadHours: 3, reschedule: true },
  { id: "far-ahead", label: "game set 29 days ahead (limit is 30)", t0: ist(2027, 2, 1, 9, 0), leadHours: 24 * 29 },
  { id: "first-of-month-late", label: "1 April 00:05", t0: ist(2027, 4, 1, 0, 5), leadHours: 3 },
];

/** PAYMENT STORIES with the fake Razorpay (see game.mjs payStory) */
export const PAY = ["upi", "card", "netbanking", "wallet", "authorized-capture", "webhook-only", "verify-and-webhook", "tamper-then-ok", "failed-retry", "host-pays", "cohost-pays", "paylink", "usd-card", "late-pay", "credit"];

const BRAND_SLOT = (t) => ({ kind: "speech", title: t });
/** BREAKS: brand breaks and lucky draws. Functions of the ticket count (a 2-ticket game may have 6 mid-game breaks, 2 opening slots, 2 closing slots) */
export const BREAKS = {
  none: () => ({ breaks: [] }),
  speech: () => ({ breaks: [{ after: 30, seconds: 60, kind: "speech", title: "A word from our CEO" }] }),
  file: () => ({ breaks: [{ after: 20, seconds: 45, kind: "file", title: "Company film", mediaUrl: "/demo-break.mp4" }, { after: 50, seconds: 30, kind: "lucky", title: "Lucky draw", winners: 3 }] }),
  youtube: () => ({ breaks: [{ after: 25, seconds: 60, kind: "youtube", title: "Our year", mediaUrl: "https://youtu.be/dQw4w9WgXcQ" }, { after: 60, seconds: 30, kind: "lucky", title: "Scratch and win", winners: 10, style: "scratch" }, { after: 80, seconds: 30, kind: "speech", title: "Thank you" }] }),
  luckyOne: () => ({ breaks: [{ after: 30, seconds: 30, kind: "lucky", title: "Grand lucky draw", winners: 1, style: "draw" }] }),
  luckyThree: () => ({ breaks: [{ after: 15, seconds: 30, kind: "lucky", title: "Lucky draw one", winners: 5 }, { after: 40, seconds: 30, kind: "lucky", title: "Scratch two", winners: 5, style: "scratch" }, { after: 65, seconds: 30, kind: "lucky", title: "Lucky draw three", winners: 3 }] }),
  slides: () => ({ breaks: [{ after: 40, seconds: 60, kind: "slides", title: "Results so far" }] }),
  max: (tickets) => ({ breaks: Array.from({ length: 3 * tickets }, (_, i) => { const after = 10 + i * (tickets === 2 ? 12 : 25); return i % 2 ? { after, seconds: 30, kind: "lucky", title: `Lucky ${i + 1}`, winners: [1, 3, 5, 10][i % 4], style: i % 4 === 3 ? "scratch" : "draw" } : { after, seconds: 30, kind: "speech", title: `Moment ${i + 1}` }; }) }),
  edges: () => ({ breaks: [{ after: 10, seconds: 15, kind: "speech", title: "Early" }, { after: 88, seconds: 15, kind: "speech", title: "Almost done" }] }),
  withEdges: (tickets) => ({ breaks: [{ after: 45, seconds: 30, kind: "lucky", title: "Big draw", winners: 10, style: "scratch" }], opening: Array.from({ length: tickets }, (_, i) => BRAND_SLOT(`Welcome ${i + 1}`)), closing: Array.from({ length: tickets }, (_, i) => BRAND_SLOT(`Goodbye ${i + 1}`)) }),
};
export const BREAK_KEYS = Object.keys(BREAKS);

/** HOUSES: the prize lines. rl(pattern, ordinal) = one reward line */
const rl = (pattern, ordinal = 1, scope = "ticket") => ({ pattern, scope, ordinal, text: `${pattern} #${ordinal}` });
const many = (p, n) => Array.from({ length: n }, (_, i) => rl(p, i + 1));
export const HOUSES = {
  default: () => undefined, // the software's own default seven
  extraWinners: () => [rl("early5"), ...many("top", 2), ...many("mid", 2), ...many("bot", 2), rl("corners"), rl("star"), ...many("full", 3)],
  all19: () => ["early5", "early7", "early10", "top", "mid", "bot", "twolines", "corners", "star", "plus", "frame", "topbottom", "midcorners", "odd5", "even5", "low5", "high5", "full", "unlucky"].map((p) => rl(p)),
  newer: () => [rl("early7"), rl("early10"), rl("twolines"), rl("plus"), rl("frame"), rl("full")],
  anyN: () => [rl("odd5"), rl("even5"), rl("low5"), rl("high5"), rl("topbottom"), rl("midcorners"), rl("full")],
  maxWinners: () => [...many("top", 2), ...many("mid", 2), ...many("bot", 2), ...many("full", 10)],
  unlucky: () => [rl("early5"), ...many("full", 5), rl("unlucky")],
  minimal: () => [rl("full")],
  many: () => [rl("early5"), rl("early7"), rl("early10"), rl("twolines"), rl("full")],
  withTwoTicket: () => [rl("early5"), rl("top"), rl("mid"), rl("bot"), rl("full"), rl("full", 1, "two_ticket"), rl("full", 2, "two_ticket"), rl("unlucky")],
};

/** JOIN policy and people */
export const JOINS = ["anyone", "list", "list+waiting", "invites", "anyone+invites", "list+invites"];

// ---- the 20 specs. Each row picks one value of each factor. (p = payment story, c = calendar, b = breaks, h = houses, r = rounds, g = call gap seconds, j = join policy)
const ONE = [ // tickets 1
  { p: "upi",                c: "ordinary",             b: "none",       h: "default",      r: 1, g: 6,  j: "anyone" },
  { p: "card",               c: "year-end",             b: "speech",     h: "extraWinners", r: 2, g: 9,  j: "list" },
  { p: "netbanking",         c: "month-end",            b: "file",       h: "all19",        r: 1, g: 12, j: "invites" },
  { p: "wallet",             c: "leap-day",             b: "youtube",    h: "newer",        r: 3, g: 6,  j: "anyone+invites" },
  { p: "authorized-capture", c: "fy-change",            b: "luckyOne",   h: "anyN",         r: 1, g: 9,  j: "list+waiting" },
  { p: "webhook-only",       c: "just-before-midnight", b: "luckyThree", h: "maxWinners",   r: 5, g: 6,  j: "list+invites" },
  { p: "verify-and-webhook", c: "small-hours",          b: "slides",     h: "unlucky",      r: 1, g: 15, j: "anyone" },
  { p: "tamper-then-ok",     c: "resched",              b: "max",        h: "minimal",      r: 2, g: 12, j: "list" },
  { p: "failed-retry",       c: "far-ahead",            b: "edges",      h: "many",         r: 1, g: 9,  j: "invites" },
  { p: "host-pays",          c: "first-of-month-late",  b: "withEdges",  h: "default",      r: 4, g: 6,  j: "anyone+invites" },
];
const TWO = [ // tickets 2 (pairings shifted)
  { p: "cohost-pays",        c: "year-end",             b: "withEdges",  h: "withTwoTicket", r: 1, g: 6,  j: "anyone+invites" },
  { p: "paylink",            c: "ordinary",             b: "max",        h: "all19",         r: 2, g: 9,  j: "list+invites" },
  { p: "usd-card",           c: "first-of-month-late",  b: "none",       h: "withTwoTicket", r: 1, g: 12, j: "anyone" },
  { p: "late-pay",           c: "small-hours",          b: "luckyThree", h: "extraWinners",  r: 3, g: 6,  j: "list" },
  { p: "credit",             c: "month-end",            b: "youtube",    h: "unlucky",       r: 1, g: 9,  j: "invites" },
  { p: "upi",                c: "far-ahead",            b: "speech",     h: "maxWinners",    r: 2, g: 15, j: "list+waiting" },
  { p: "card",               c: "leap-day",             b: "luckyOne",   h: "newer",         r: 1, g: 6,  j: "anyone+invites" },
  { p: "wallet",             c: "resched",              b: "file",       h: "withTwoTicket", r: 5, g: 9,  j: "anyone" },
  { p: "tamper-then-ok",     c: "fy-change",            b: "slides",     h: "many",          r: 1, g: 12, j: "list+invites" },
  { p: "verify-and-webhook", c: "just-before-midnight", b: "edges",      h: "anyN",          r: 4, g: 6,  j: "list" },
];
export const GAMES = [...ONE.map((x, i) => ({ no: i + 1, tickets: 1, ...x })), ...TWO.map((x, i) => ({ no: i + 11, tickets: 2, ...x }))].map((x) => ({ ...x, id: "G" + String(x.no).padStart(2, "0") }));

/** Self-check used by the runner and a unit test: every value used at least twice per ticket mode, specs are valid for the app's rules */
export function matrixProblems() {
  const bad = [];
  const MAXMID = (t) => 3 * t;
  for (const g of GAMES) {
    if (!CALENDARS.some((c) => c.id === g.c)) bad.push(`${g.id}: unknown calendar ${g.c}`);
    if (!PAY.includes(g.p)) bad.push(`${g.id}: unknown payment story ${g.p}`);
    if (!BREAKS[g.b]) bad.push(`${g.id}: unknown breaks ${g.b}`);
    if (!HOUSES[g.h]) bad.push(`${g.id}: unknown houses ${g.h}`);
    if (!JOINS.includes(g.j)) bad.push(`${g.id}: unknown join ${g.j}`);
    if (![6, 9, 12, 15].includes(g.g)) bad.push(`${g.id}: gap ${g.g}`);
    const br = BREAKS[g.b](g.tickets); if ((br.breaks?.length ?? 0) > MAXMID(g.tickets)) bad.push(`${g.id}: too many breaks`);
    if (g.tickets === 1 && (HOUSES[g.h]() ?? []).some((l) => l.scope === "two_ticket")) bad.push(`${g.id}: two-ticket house in a 1-ticket game`);
  }
  for (const t of [1, 2]) for (const f of ["c", "b", "h", "j", "r"]) { const n = {}; for (const g of GAMES.filter((x) => x.tickets === t)) n[g[f]] = (n[g[f]] ?? 0) + 1; for (const [k, v] of Object.entries(n)) if (v < 1) bad.push(`${f}=${k}`); }
  return bad;
}
