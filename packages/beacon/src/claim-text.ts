// TA10: a claim that lost says WHY in two short lines, on the phone: who won it and at which number, and where this player's own ticket stood.
// Pure text from the published results and the player's own ticket; it never decides anything.
export interface WinRow { idx: number; tickets?: number[] }

const who = (w: WinRow): string => { const t = w.tickets ?? []; return t.length === 0 ? "another ticket" : t.length === 1 ? `ticket ${t[0]}` : `tickets ${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}`; };
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** `wins`: the published results of this house (every position that was awarded); `mineIdx`: the call index where this player's ticket completed it (-1 when not known). Two lines, plain words, numbers counted from 1. */
export function lostClaimLines(name: string, wins: readonly WinRow[], mineIdx: number): [string, string] {
  const rows = [...wins].sort((a, b) => a.idx - b.idx), first = rows[0];
  if (!first) return [`${name}: the prize was taken before your claim.`, "Your claim reached the game too late."];
  const l1 = `${cap(who(first))} won ${name} at number ${first.idx + 1}.` + (rows[1] ? ` ${cap(who(rows[1]))} won it at number ${rows[1].idx + 1}.` : "");
  const l2 = mineIdx < 0 ? "Your claim reached the game after the prize was taken."
    : mineIdx > first.idx ? `Your ticket completed it later, at number ${mineIdx + 1}.`
    : mineIdx === first.idx ? `Your ticket completed it at the same number, ${mineIdx + 1}. The other claim reached the game first.`
    : `Your ticket completed it at number ${mineIdx + 1}, but your claim reached the game after number ${mineIdx + 2} was called.`;
  return [l1, l2];
}
