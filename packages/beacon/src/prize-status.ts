// The live list of prizes everybody can read: the ones still open come first, the ones already claimed follow (the screens draw them crossed out with a small "claimed").
// It is read-only: it only looks at the organizer's reward lines and the published results, it never decides anything.
import { keyOfLine, keysInPlay, linesFor, houseLabel, type EngagementCfg, type PatternKey } from "./config";

export interface PrizeLine { key: PatternKey; label: string; ordinal: number; of: number; name: string; text: string; claimed: boolean }
const ordName = (n: number): string => { const t = n % 100; if (t >= 11 && t <= 13) return n + "th"; return n + (n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"); };

/** `results`: what is published so far ({ pattern, ordinal, round }). `round`: the round being played (every round awards its own prizes). */
export function prizeStatus(cfg: EngagementCfg, results: readonly { pattern: string; ordinal: number; round?: number }[], round = 1): PrizeLine[] {
  const out: PrizeLine[] = [];
  for (const key of keysInPlay(cfg.rewards)) {
    if (key === "unlucky") continue; // decided at the end of the game, it is not a position that fills up
    const lines = linesFor(cfg.rewards, key);
    for (const l of lines) {
      const claimed = results.some((x) => x.pattern === keyOfLine(l) && x.ordinal === l.ordinal && (x.round ?? 1) === round);
      const label = l.scope === "two_ticket" ? houseLabel("full2") : houseLabel(l.pattern);
      out.push({ key, label, ordinal: l.ordinal, of: lines.length, name: lines.length > 1 ? `${ordName(l.ordinal)} ${label}` : label, text: l.text, claimed });
    }
  }
  return [...out.filter((p) => !p.claimed), ...out.filter((p) => p.claimed)]; // pending first, claimed after (each group keeps the house order and the 1st, 2nd... order)
}
