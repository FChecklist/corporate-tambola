// OWNER DECISION 2026-11-24 (via BOSS): no claim the repository cannot back. "Over 200 games played." was removed everywhere because nothing
// in the repository counts real games with real players (the large counts here are simulator and load runs).
// This pattern catches a games-played / games-hosted COUNT written for customers, in any wording that gives a number or a vague big number:
//   "Over 200 games played", "200+ games hosted", "500 events run", "more than 1,000 games", "hundreds of games", "played 300 games".
// A number inside a section number ("13.3 Games run") or a limit ("when more than 25 games hold data") is not a claim, so the second form must end the phrase.
// Used by pricing-cups.test.ts (code, pages, the whole repository) and pdf-assets.test.ts (the brochure PDF text).
export const GAMES_PLAYED_CLAIM = new RegExp([
  String.raw`(?<![\d.])\d[\d,]*\s*\+?\s*(?:real\s+|live\s+|paid\s+|corporate\s+|successful\s+)?(?:games?|events?|sessions?)\s+(?:played|hosted|run|conducted|completed|delivered|organi[sz]ed)\b`,
  String.raw`\b(?:over|more\s+than|above|upwards\s+of|\d[\d,]*\s*\+)\s+[\d,]+\s*\+?\s*(?:real\s+|live\s+|paid\s+|corporate\s+|successful\s+)?(?:games?|events?)(?=\s*(?:[.!,;:·|<"')\]]|$))`,
  String.raw`\b(?:hundreds|thousands|dozens)\s+of\s+(?:real\s+|live\s+|paid\s+)?(?:games|events)\b`,
  String.raw`\b(?:played|hosted|run|delivered)\s+(?:over\s+|more\s+than\s+)?\d[\d,]*\s*\+?\s*(?:real\s+|live\s+)?(?:games|events)\b`,
].join("|"), "i");
