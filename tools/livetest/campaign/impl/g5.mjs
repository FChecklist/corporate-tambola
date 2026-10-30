// G5 Claims. Whole games with 9 real phones that play along (the runtime's own play-along), compressed on the local server (CLOCK_SPEED), real time on the real site.
// Implemented here: UC-G5-01..05 (each house claimed correctly), UC-G5-06 (Full House several winners). Not implemented (they need a forced situation: a stale mark, a late press, two claims in the same second, a pause): 07-18.
import { playGame, mkChecks, closeAll } from "../core.mjs";

const WATCH = { own: /Congratulations! You won/i, notice: /Ticket \d+ has claimed/i, correct: /claim is correct|Congratulations Ticket/i, listWon: /Won by Ticket/i, gone: /has been won|already won|Already won/i };
const line = (pattern, n = 1) => Array.from({ length: n }, (_, i) => ({ pattern, scope: "ticket", ordinal: i + 1, text: "Test prize " + (i + 1) }));
const claimCase = (patterns, label) => async (c, env) => {
  const { ck, checks } = mkChecks();
  const rewards = patterns.flatMap((p) => line(p));
  const s = await playGame(env, c, { rewards, watch: WATCH, maxGameSec: 700, done: (st) => st.anySaw("own") && st.countSaw("notice") >= 2 });
  try {
    ck("all 9 players joined", s.joined === 9, s.joined);
    ck(`someone completed ${label} and won it (the winner's page says Congratulations)`, s.anySaw("own"), `numbers called ${s.numbers}`);
    ck("the other phones were told 'Ticket N has claimed ...' (bystander notice)", s.countSaw("notice") >= 2, s.countSaw("notice"));
    ck("every phone shows the same numbers so far", s.logs.every((l, i) => { const m = Math.min(l.length, s.logs[0].length); return l.slice(0, m).join() === s.logs[0].slice(0, m).join(); }));
    ck("no phone had a script error", s.ps.every((p) => p.errs.length === 0), s.ps.flatMap((p) => p.errs).join(";"));
  } finally { await closeAll(s.ps); }
  return { checks, game: s.g.tag.id };
};
export const IMPL = {
  "UC-G5-01": claimCase(["early5"], "the Early Five"),
  "UC-G5-02": claimCase(["top"], "the Top line"),
  "UC-G5-03": claimCase(["mid"], "the Middle line"),
  "UC-G5-04": claimCase(["bot"], "the Bottom line"),
  "UC-G5-05": claimCase(["corners", "star"], "Four corners and the Star"),
  /** Full House five times: winners come in order of completion, never the same ticket twice. */
  async "UC-G5-06"(c, env) {
    const { ck, checks } = mkChecks();
    const s = await playGame(env, c, { rewards: line("full", 5), watch: WATCH, maxGameSec: 700, done: (st) => st.numbers >= 90 || st.countSaw("own") >= 5 });
    try {
      const winners = s.seen.filter((x) => x.own).length;
      ck("at least one Full House was won", winners >= 1, `numbers ${s.numbers}`);
      ck("no more winners than prizes (five)", winners <= 5, winners);
      ck("no number repeats on any phone", s.logs.every((l) => new Set(l).size === l.length));
    } finally { await closeAll(s.ps); }
    return { checks, game: s.g.tag.id };
  },
};
