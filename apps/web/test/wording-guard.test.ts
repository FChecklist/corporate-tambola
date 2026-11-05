// WP-01 / TA27 guard: a player opens a GAME, never an "engagement", and no player-facing screen says "private" (owner rules 2026-10-28: the games are online and close group).
// It fails the moment either word returns in the text a player reads: the player page, the board, the big screen, the phone's own messages, the player-facing HTML pages and the
// refusals the Worker sends to a player. Names of variables, SQL and comments are not text and are not checked (wording-scan.ts).
import { describe, expect, test } from "bun:test";
import { htmlText, read, wordInLiterals } from "./wording-scan";

const base = new URL("../../../", import.meta.url);
const ENGAGEMENT = /\bengagements?\b/i, PRIVATE = /\bprivate\b/i;

/** Scripts whose every string a player can read. */
const PLAYER_SCRIPTS = [
  "apps/web/public/z.js", "apps/web/public/board.js", "apps/web/public/big.js",
  "packages/beacon/src/phone-runtime.ts", "packages/beacon/src/story.ts", "packages/beacon/src/messages.ts", "packages/beacon/src/claim-text.ts", "packages/beacon/src/prize-status.ts", "packages/beacon/src/house-rules.ts", "packages/beacon/src/gaps.ts",
];
/** Pages a player reads (their text, not their scripts). */
const PLAYER_PAGES = ["apps/web/public/z.html", "apps/web/public/board.html", "apps/web/public/big.html", "apps/web/public/offline.html"];
/** The Worker files hold organizer and player messages together: only the refusals a PLAYER meets are named here. */
const PLAYER_REFUSALS = [/^.This engagement is/i, /^.Not a participant of this engagement/i, /holds a ticket in this engagement/i, /^.That engagement was not found/i, /engagement link is not valid/i];

describe("TA27: the word 'engagement' (and 'private') does not return to the player's screens", () => {
  for (const f of PLAYER_SCRIPTS) {
    test(`${f}: no 'engagement' and no 'private' in anything the player reads`, () => {
      const src = read(f, base);
      expect(wordInLiterals(src, ENGAGEMENT)).toEqual([]); expect(wordInLiterals(src, PRIVATE)).toEqual([]);
    });
  }
  for (const f of PLAYER_PAGES) {
    test(`${f}: the page text has neither word`, () => {
      const t = htmlText(read(f, base)); expect(t).not.toMatch(ENGAGEMENT); expect(t).not.toMatch(PRIVATE);
    });
  }
  test("the Worker's refusals to a player (full, not open yet, by invitation, already has a ticket, not a participant) say 'game'", () => {
    for (const f of ["apps/edge/src/worker.ts", "apps/edge/src/checkin.ts", "apps/edge/src/lifecycle.ts", "apps/edge/src/winners.ts", "apps/edge/src/people.ts"]) {
      const hits = wordInLiterals(read(f, base), ENGAGEMENT).filter((h) => PLAYER_REFUSALS.some((r) => r.test(h.text)));
      expect(hits).toEqual([]);
    }
  });
  test("the scan itself works: it finds the word in a string a person reads and ignores a variable name, a comment and SQL", () => {
    expect(wordInLiterals('const a = "Join the engagement";', ENGAGEMENT).length).toBe(1);
    expect(wordInLiterals("const a = `Hi ${engagementId} welcome`;", ENGAGEMENT)).toEqual([]);
    expect(wordInLiterals('// the engagement starts\nconst engagement = 1; /* an engagement */', ENGAGEMENT)).toEqual([]);
    expect(wordInLiterals('db.prepare("SELECT * FROM engagement WHERE id=?")', ENGAGEMENT)).toEqual([]);
    expect(htmlText('<h1>Our private game</h1><script>var engagement = 1</script>')).toMatch(PRIVATE);
  });
});
