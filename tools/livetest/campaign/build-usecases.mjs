// The catalogue of the 100 unique use cases of the demo-game campaign (note 310). Run: node tools/livetest/campaign/build-usecases.mjs
// Writes tools/livetest/usecases-100.json (read by run.mjs) and docs/USECASES_100.md (readable). Row = [group, title, roles, options, steps, expected, layers, driver].
// roles: O organizer, H Host, C Co-host, P player (9 players + the organizer = 10 people unless the row says otherwise), F family host / family member
// layers: A = local engine mass runner, B = real Chromium on the local server, C = the real site (quota-metered; the 25 cases that need real network, real Cloudflare, real consent or real time)
// driver: the kind of scenario run.mjs executes for layers B and C ("basic" is implemented in S0; the others are filled in S2 and are reported as "not implemented" until then, never as passed)
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
const R = [];
const g = (grp, rows) => rows.forEach((r) => R.push([grp, ...r]));

g("G1", [
  ["Step 1: automatic start, game calls the numbers", "O+9P", "startMode auto, callMode auto, 12 s", "create a draft, pick a start 2 minutes ahead, publish, all players join, game starts by itself", "numbers come every 12 s, same on every phone, no repeats", "AB", "basic"],
  ["Step 1: manual start, organizer presses Start", "O+9P", "startMode manual", "publish, players wait, organizer presses Start", "game does not start by itself; after Start the first number comes", "AB", "manual-start"],
  ["Step 1: host-called numbers (organizer rolls each number)", "O+9P", "callMode host", "start, organizer presses Roll Out the Next Number for 10 numbers", "one number per press, never faster than the lock, same on every phone", "AB", "host-called"],
  ["Step 2: who is the game for, open join", "O+9P", "whoCanJoin anyone", "publish, players open the common link and join with a mobile number", "all 9 join without approval, 10 tickets", "ABC", "open-join"],
  ["Step 2: who is the game for, list game with 9 listed people", "O+9P", "whoCanJoin list, 9 people uploaded", "upload list, publish, listed players join", "listed players join directly, an unlisted one waits", "AB", "list-join"],
  ["Step 3: one ticket each, early prizes only", "O+9P", "tickets 1, prizes early5/top/mid/bot", "play to the end of the prize list", "each prize won once in order, game ends when all are claimed", "AB", "prizes"],
  ["Step 3: two tickets each (Ticket A and B)", "O+9P", "tickets 2", "players see Ticket A and B, switch between them", "both tickets mark; the one not played is greyed; each ticket has its own number", "AB", "two-tickets"],
  ["Step 3: Lucky Draw 1 prize", "O+9P", "lucky draw x1", "play until the draw", "one lucky winner among players, never the organizer/Host/Co-host", "AB", "lucky"],
  ["Step 3: Lucky Draw 3 prizes", "O+9P", "lucky draw x3", "play until the draws", "three different winners, none repeated, none from the team", "AB", "lucky"],
  ["Step 3: Super Bumper with 1, 2, 5 and 10 prizes (four runs)", "O+9P", "tickets 2, full2 x1/2/5/10", "play each configuration", "Super Bumper prizes won in order, one per player, game continues until all open prizes are won", "AB", "super-bumper"],
  ["Step 4: breaks, brand and time zone", "O+9P", "opening, closing, one break, company name, time zone Dubai", "set a message break and a brand, publish, play through the break", "break shown to all phones at the same moment, brand strip, time zone in the start text", "AB", "breaks-brand"],
  ["Step 5: payment demo, publish and rehearsal 1-3", "O", "free demo (up to 10 people), rehearsals 1, 2, 3", "check and publish (free), start rehearsal 1, finish it, rehearsal 2, 3", "rehearsal cards unlock in order, REHEARSAL block on the rehearsal game, real game untouched", "ABC", "rehearsal"],
]);

g("G2", [
  ["Join by listed employee ID", "O+9P", "verify id, list of 9 IDs", "player types the ID", "joins with the listed name; wrong ID waits for approval", "AB", "id-join"],
  ["Join by listed email ID", "O+9P", "verify id, IDs are emails", "player types the email", "joins; a typo is refused with the neutral text", "AB", "id-join"],
  ["Not on the list, Host approves", "O+H+P", "list game, one Host", "unlisted player asks, Host admits", "waiting screen, then the ticket appears by itself", "AB", "approval"],
  ["Not on the list, Co-host approves own people only", "O+C+2P", "list game, one Co-host link", "player joins with the Co-host link, Co-host admits; another Co-host's person is not visible", "Co-host sees and decides only requests from their own link", "AB", "approval"],
  ["Not on the list, Organizer approves", "O+P", "list game", "unlisted player asks, organizer admits and declines another", "admitted gets a ticket; declined reads the polite message", "ABC", "approval"],
  ["Open join with an optional email ID", "O+9P", "open game, EMAIL_ENABLED on", "players join, three give an email, one bad shape, one reused email", "bad shape and reused email refused with the agreed words; no email is fine", "ABC", "email"],
  ["Duplicate mobile on another device", "O+2P", "open game", "same mobile on a second browser", "refused: one ticket plays on one device; no second ticket", "AB", "duplicate"],
  ["Game full: cap reached", "O+3P", "cap 2", "third player joins", "told the places are taken; the first two keep their tickets", "AB", "cap"],
  ["Late join after the first numbers", "O+9P", "open game, late join", "player joins after number 10", "ticket counts only from the join round, earlier numbers shown as history only", "AB", "late-join"],
  ["Cached page with the old consent version", "O+P", "stale consent.js", "join from a page that sends the old version", "told the page is out of date with a Reload button; after reload joins", "ABC", "stale-consent"],
  ["Reconnect: close the page and reopen", "O+P", "any game", "close the tab mid-game, open the link again", "same ticket, marks kept, game position correct", "AB", "reconnect"],
  ["Two devices: second phone for the same ticket", "O+P", "any game", "open the personal link on a second device", "refused with the one-device message", "AB", "two-devices"],
  ["Family pass: request, approve, decline", "O+F+2P", "list game, invites on (family)", "two family requests; host approves one, declines one", "approved comes in, declined reads the polite message", "ABC", "family"],
  ["Family pass: 30-minute lapse and 15-minute cutoff", "O+F+2P", "list game, invites on", "one request waits 30 minutes (test clock), one asked after the cutoff", "lapsed message with ask again; cutoff message, organizer can still admit", "AB", "family-time"],
]);

g("G3", [
  ["Host signs in with the Host link", "O+H", "one Host", "Host opens the link, accepts the role", "Host console shows the game; role chip says Host", "ABC", "host"],
  ["Co-host opens the Co-host link", "O+C", "one Co-host", "Co-host accepts the role, sees the small game header", "no names, no settings; role chip says Co-host", "AB", "cohost"],
  ["Co-host limit: invite up to N people", "O+C+P", "Co-host limit 3", "four people join through the Co-host link", "the fourth is refused or waits per the limit text", "AB", "cohost-limit"],
  ["Who approves text per role", "O+H+C", "list game", "open each console", "organizer, Host and Co-host each read only the truthful sentence", "AB", "approves-text"],
  ["Organizer vs Host controls", "O+H", "manual start", "Host tries organizer-only steps", "Host cannot erase, pay or change prizes; can approve", "AB", "role-limits"],
  ["Up to 5 Hosts", "O+5H", "five Hosts", "add five Hosts, a sixth", "sixth refused with the plain limit message", "AB", "hosts-limit"],
  ["Co-host without accepting", "O+C", "Co-host key never accepted", "Co-host opens the console", "asked to accept the role (tick box), nothing else works", "AB", "cohost-consent"],
  ["Co-host with an old-version acceptance", "O+C", "K5 recorded under 2026-10-15", "Co-host opens the console", "works as before, no tick box, no reload dead end", "ABC", "cohost-old"],
  ["Co-host sees waiting list of own link only", "O+2C+3P", "two Co-hosts", "players join through each link", "each Co-host sees only their own waiting people", "AB", "cohost-scope"],
  ["Organizer removes a person and the email is released", "O+2P", "open game with email", "organizer removes player 1, player 2 reuses the email", "second player joins; first player cannot rejoin", "AB", "remove"],
]);

g("G4", [
  ["Automatic timer 12 seconds", "O+9P", "callMode auto 12 s", "watch 15 numbers", "gap between numbers 12 s (+/- 1 s), the same number at the same moment on all phones", "ABC", "timer"],
  ["Manual start then automatic numbers", "O+9P", "start manual, numbers auto", "Start pressed, play 10 numbers", "numbers start after Start only, then every 12 s", "AB", "manual-start"],
  ["Host-called numbers with the 5-second lock", "O+9P", "callMode host", "double-press Roll Out", "second press inside the lock does nothing", "AB", "host-called"],
  ["Pause when a claim is checked", "O+9P", "claim during play", "a claim is sent", "claim notice on all phones; game continues as the engine does (no auto-pause)", "AB", "claim-notice"],
  ["Pause and resume by the organizer", "O+9P", "organizer pauses", "pause for a minute, resume", "numbers stop, phones show Paused, then resume with no repeat", "AB", "pause"],
  ["No repeated numbers across 90", "O+9P", "run all 90", "play to the end", "every number 1..90 exactly once, same order on all phones", "AB", "sequence"],
  ["Game ends at 90 numbers", "O+9P", "prizes that cannot all be won", "play 90 numbers", "game ends, final screen, thank-you strip", "AB", "end-90"],
  ["Game ends when all prizes are claimed", "O+9P", "three prizes", "claim all three", "ends right after the last prize, not later", "AB", "end-prizes"],
  ["Early end by the organizer", "O+9P", "organizer stops the game", "press Stop mid-game", "all phones show the game over screen", "AB", "stop"],
  ["Last numbers and called count", "O+9P", "any game", "check Last 5 and N of 90 called", "strip matches the real sequence on every phone", "AB", "strip"],
  ["Crossing a number twice un-crosses it", "O+P", "any game", "tap a called number twice", "cross appears and disappears; a not-called number is refused in place", "AB", "crossing"],
  ["Ticket A/B switch in a two-ticket game", "O+P", "tickets 2", "switch the playing ticket", "the other is greyed, both keep marking", "AB", "two-tickets"],
  ["Retro and Modern looks", "O+P", "player look", "switch look", "page theme changes, ticket stays the rich element, cross visible in both", "ABC", "looks"],
  ["Phone, tablet and laptop widths", "O+P", "360, 768, 1280 px", "open the player page at each width", "no sideways scroll, claim button reachable", "AB", "widths"],
]);

g("G5", [
  ["Early Five claim, correct", "O+9P", "prize early5", "a player completes and claims", "gold CLAIM, checking notice, congratulations, prize marked won", "ABC", "claim"],
  ["Top line claim, correct", "O+9P", "prize top", "claim", "same, winning cells gold", "AB", "claim"],
  ["Middle line claim, correct", "O+9P", "prize mid", "claim", "same", "AB", "claim"],
  ["Bottom line claim, correct", "O+9P", "prize bot", "claim", "same", "AB", "claim"],
  ["Four corners and Star claims", "O+9P", "prizes corners, star", "claim each", "both accepted with the right cells", "AB", "claim"],
  ["Full House 1st to 5th", "O+9P", "full x5", "claim five times", "five different winners, in order of completion, ordinals 1..5", "AB", "claim-multi"],
  ["Bogey: claim with nothing to claim", "O+P", "grey CLAIM pressed", "press a grey CLAIM and Submit", "asked first; counts as a wrong claim; no prize", "AB", "bogey"],
  ["Wrong claim: a stale mark", "O+P", "player marks an uncalled number", "claim", "claim fails with Bogey; the other prizes stay open", "AB", "wrong-claim"],
  ["Late claim after the next number", "O+P", "claim after the next call", "claim too late", "refused as too late", "AB", "late-claim"],
  ["Prize already taken", "O+2P", "two near-simultaneous claims", "both claim the same prize", "one wins; the other reads Prize already taken", "AB", "taken"],
  ["Two winners on one number", "O+2P", "tie settings share and next", "two players finish on the same number", "share: both win; next: they take consecutive positions", "AB", "tie"],
  ["Simultaneous claims by many players", "O+9P", "all claim in the same second", "claim together", "exactly the allowed winners, no double award", "ABC", "burst"],
  ["Claim during a pause", "O+P", "pause then claim", "claim while paused", "handled as the engine does (accepted or refused with a clear text)", "AB", "claim-pause"],
  ["Bystander banner for other players' claims", "O+9P", "any claim", "watch a phone that did not claim", "Ticket N has claimed ... then correct / not correct / won", "AB", "bystander"],
  ["Claim screens in both looks", "O+P", "retro and modern", "claim in each look", "the three gold CLAIM buttons (top, sticky, side) are one claim", "AB", "claim-ui"],
  ["Super Bumper 1-10 prizes in order", "O+9P", "tickets 2, full2 x10", "play to the end", "ten prizes won in order, one per player", "AB", "super-bumper"],
  ["Per-ticket A/B prize", "O+9P", "Ticket B prize on a reward line", "claim with Ticket B", "prize goes to the B ticket owner, shown as Ticket B", "AB", "ab-prize"],
  ["Lucky Draw is drawn and published", "O+9P", "lucky draw", "play to the draw", "winner announced on every phone, never a team member", "AB", "lucky"],
]);

g("G6", [
  ["Common link opens the join page", "O+P", "open game", "open the common link", "invitation text names the organizer/company; join works", "ABC", "links"],
  ["Personal link joins without a number", "O+P", "list game, personal links", "open a personal link", "ticket without typing; second device refused", "AB", "personal-link"],
  ["Family link shows the family wording", "O+F+P", "family link", "open the family link", "family sentence, not for Co-host or Host links", "AB", "family-link"],
  ["Co-host link never shows family words", "O+C+P", "Co-host link", "open the Co-host link as a player", "no family wording, waits for the Co-host or organizer", "AB", "cohost-link"],
  ["Host link opens the Host console", "O+H", "Host link", "open it", "Host console, not the player page", "ABC", "host-link"],
  ["Thank-you page after the game", "O+9P", "game ended", "look at the end screen", "thank-you strip with Share and WhatsApp, no rules row", "AB", "thanks"],
  ["Game completed page 30 minutes later", "O+P", "30 minutes after the end", "open the link", "hidden until the engine exposes the end time: the plain end screen is shown, never an error", "AB", "completed"],
  ["30-minute wait message", "O+P", "request waits 30 minutes", "wait with the test clock", "polite lapsed message with ask again", "AB", "lapse-text"],
  ["Share and WhatsApp buttons", "O+P", "end screen", "press Share and WhatsApp", "link carries only the game address and a short line, no personal data", "AB", "share"],
  ["Brochure, guide and manual links", "O", "footer and menu", "open the brochure PDF, organizer guide and manual", "200, one page, new logo, six-item menu", "ABC", "pages"],
]);

g("G7", [
  ["24-hour erase of personal data", "O+9P", "game ended, 21 h later (test clock)", "run the sweep", "names, numbers, emails, seats, links gone; winners record kept", "ABC", "erase"],
  ["Email key deletion on leave and decline", "O+2P", "open game with email", "player leaves; another request declined", "the email can be used again", "AB", "email-release"],
  ["Game log is kept and complete", "O+9P", "finished game", "open the game log", "every call, claim and end reason present, no personal data", "AB", "gamelog"],
  ["Winners record kept for 365 days", "O+9P", "finished game", "read the record after the sweep", "winning ticket numbers and prizes remain, no names", "AB", "winners"],
  ["Report e-mail and PDF", "O+9P", "finished game", "download the report", "PDF with the new logo, correct counts", "AB", "report"],
  ["Delete data button", "O+9P", "organizer erases now", "press Delete all participant data", "erased at once; confirm text; game record kept", "AB", "delete-now"],
  ["Consent text and version are the same everywhere", "O+P", "server, page, terms", "read all three", "identical wording, version 2026-10-30", "ABC", "consent"],
  ["Privacy pages name what is kept", "O", "privacy, terms, trust", "read them", "mobile number, optional email ID, erase within 24 hours stated", "ABC", "privacy"],
  ["Rehearsal data is erased with the rehearsal", "O+P", "rehearsal game", "finish a rehearsal and sweep", "rehearsal participants gone, real game untouched", "AB", "rehearsal-erase"],
  ["No personal data in URLs", "O+9P", "all pages", "inspect every URL and request", "no phone, name or email in any address", "ABC", "no-pii-url"],
  ["Right to leave deletes the player's data", "O+P", "player presses Leave", "leave the game", "seat and details removed, others unaffected", "AB", "leave"],
  ["Data request by a player", "O+P", "what do you hold about me", "send the request", "recorded without name or number; organizer told", "AB", "datareq"],
]);

g("G8", [
  ["Offline then reload mid-game", "O+P", "network cut for 30 s", "go offline, reload, come back", "Reconnecting then Back online; position correct; no duplicate marks", "ABC", "offline"],
  ["Server refusals read as plain words", "O+P", "forced refusals", "provoke each refusal the engine can send", "every refusal has a guide entry; no raw JSON shown", "AB", "refusals"],
  ["Rate limit (429) for an email or ID guess", "O+P", "many wrong tries", "guess an email repeatedly", "429 with the polite message, then works after the window", "AB", "rate-limit"],
  ["Wrong organizer key", "O", "bad key", "open the console with a wrong key", "refused, no data shown, sign-in offered", "ABC", "wrong-key"],
  ["Expired or removed link", "O+P", "link gone", "open a removed person's link", "link not active message", "AB", "expired-link"],
  ["Stale page after a release", "O+P", "old consent script", "join from a stale page", "reload message and button (see G2)", "ABC", "stale-consent"],
  ["Double submit of Join and Claim", "O+P", "double click", "press Join twice, Claim twice", "one ticket, one claim", "AB", "double-submit"],
  ["Game cancelled by the organizer", "O+P", "cancel", "cancel before and during the game", "calm screen for players; data erased within a day", "AB", "cancelled"],
  ["Payment pending locks the game", "O+P", "unpaid at the start time", "start time passes unpaid", "players told the organizer's payment is not complete; nobody can join", "AB", "payment-pending"],
  ["Free launch limit", "O", "free game over 10 people", "ask for 11 people", "refused with the plain limit message", "ABC", "free-limit"],
]);

// the 25 cases that go to the real site (layer C): those that need the real network, Cloudflare, real consent or real time
const C = new Set(["G1-04", "G1-12", "G2-05", "G2-06", "G2-10", "G2-13", "G3-01", "G3-08", "G4-01", "G4-13", "G5-01", "G5-12", "G6-01", "G6-05", "G6-10", "G7-01", "G7-07", "G7-08", "G7-10", "G8-01", "G8-04", "G8-06", "G8-10", "G2-12", "G6-02"]);
const out = []; const per = {};
for (const [grp, title, roles, options, steps, expected, layers, driver] of R) {
  per[grp] = (per[grp] || 0) + 1; const id = `${grp}-${String(per[grp]).padStart(2, "0")}`;
  const L = layers.split(""); const real = L.includes("C") || C.has(id);
  const ls = Array.from(new Set([...L.filter((x) => x !== "C"), ...(real ? ["C"] : [])])).sort();
  out.push({ id: "UC-" + id, group: grp, title, roles, options, steps, expected, layers: ls, driver });
}
const total = out.length, cCount = out.filter((x) => x.layers.includes("C")).length;
const titles = new Set(out.map((x) => x.title)); if (titles.size !== total) throw new Error("titles must be unique");
if (total !== 100) throw new Error("the catalogue must have exactly 100 rows, has " + total);
const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const root = join(here, "../../..");
writeFileSync(join(root, "tools/livetest/usecases-100.json"), JSON.stringify({ version: 1, note: "310-DEMO-GAME-CAMPAIGN-PLAN; layers A local engine, B real Chromium local, C real site metered", cases: out }, null, 1) + "\n");
const names = { G1: "Organizer setup", G2: "Joining", G3: "Roles", G4: "Play and timer", G5: "Claims", G6: "Links and pages", G7: "Data and rules", G8: "Failure and safety" };
let md = `# The 100 use cases of the demo-game campaign\n\nGenerated by tools/livetest/campaign/build-usecases.mjs from the plan in handover note 310. ${total} unique cases; layer C (the real site, request-metered): ${cCount} cases.\nLayers: A = local engine mass runner (10 variants each), B = real Chromium on the local server (organizer + 9 players or the role mix), C = the real site housie.corporatetambola.com.\nRoles: O organizer, H Host, C Co-host, P player, F family host or member. Every game of a run is tagged: organizer name TEST-RUN-<id>, contact test+<id>@example.invalid.\n`;
for (const grp of Object.keys(names)) {
  md += `\n## ${grp} ${names[grp]}\n\n| Id | Title | Roles | Options | Steps | Expected | Layers | Driver |\n|---|---|---|---|---|---|---|---|\n`;
  for (const c of out.filter((x) => x.group === grp)) md += `| ${c.id} | ${c.title} | ${c.roles} | ${c.options} | ${c.steps} | ${c.expected} | ${c.layers.join("")} | ${c.driver} |\n`;
}
writeFileSync(join(root, "docs/USECASES_100.md"), md);
console.log("wrote", total, "cases;", cCount, "on the real site;", Object.entries(per).map(([k, v]) => k + "=" + v).join(" "));
