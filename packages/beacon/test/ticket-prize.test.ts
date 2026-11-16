// 1.8.0 optional A/B prizes: validateCfg keeps a Ticket B prize only in a two-ticket game, the winning ticket is found from the called numbers, and the right text goes with it.
// FALSIFIED BY: ab-textB-kept-on-one-ticket, ab-default-changed, ab-slot-wrong, ab-text-wrong
import { expect, test } from "bun:test";
import { validateCfg } from "../src/config";
import { ticketsFor } from "../src/game";
import { ticketNumbers } from "../../shared/src/ticket";
import { hasPerTicketPrizes, prizeTextFor, winningSlot } from "../src/ticket-prize";

const lines = (extra: object = {}) => [{ pattern: "early5", scope: "ticket", ordinal: 1, text: "Hamper", ...extra }, { pattern: "full", scope: "ticket", ordinal: 1, text: "Phone", ...extra }];
const cfgOf = (tickets: number, rewards: unknown) => { const v: any = validateCfg({ tickets, rewards }); expect(v.ok).toBe(true); return v.cfg; };

test("default: a reward line with no Ticket B prize is saved exactly as before (the setting is off)", () => {
  const c = cfgOf(2, lines());
  expect(c.rewards.every((l: any) => !("textB" in l))).toBe(true); expect(hasPerTicketPrizes(c.rewards)).toBe(false);
});
test("a Ticket B prize is kept in a two-ticket game, cleaned, and dropped with one ticket or on the Super Bumper line", () => {
  const two = cfgOf(2, lines({ textB: "  Watch<> " })); expect(two.rewards[0].text).toBe("Hamper"); expect(two.rewards[0].textB).toBe("Watch"); expect(hasPerTicketPrizes(two.rewards)).toBe(true);
  const one = cfgOf(1, lines({ textB: "Watch" })); expect(one.rewards.some((l: any) => "textB" in l)).toBe(false);
  const bump = cfgOf(2, [...lines(), { pattern: "full", scope: "two_ticket", ordinal: 1, text: "Car", textB: "Boat" }]); expect(bump.rewards.find((l: any) => l.scope === "two_ticket" && "textB" in l)).toBeUndefined();
});
test("the winning ticket is the one that completes the house first (A on a tie); the right prize text goes with it", () => {
  const [A, B] = ticketsFor("EAB-1", "p1", 2);
  const a = ticketNumbers(A!), b = ticketNumbers(B!);
  expect(winningSlot([A!, B!], "full", [...a, ...b])).toBe("A");
  expect(winningSlot([A!, B!], "full", [...b, ...a])).toBe("B");
  expect(winningSlot([A!, B!], "full", [])).toBe(null);
  const line = { text: "Hamper", textB: "Watch" };
  expect(prizeTextFor(line, "A")).toBe("Hamper"); expect(prizeTextFor(line, "B")).toBe("Watch"); expect(prizeTextFor({ text: "Hamper" }, "B")).toBe("Hamper"); expect(prizeTextFor(line, null)).toBe("Hamper");
});
