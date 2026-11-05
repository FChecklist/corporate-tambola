// TA10: the lost-claim explanation on the phone is two lines: who won and at which number, and why this player's claim did not (not one merged guess).
import { describe, expect, test } from "bun:test";
import { lostClaimLines } from "../src/claim-text";

describe("TA10: why a claim lost, in two lines", () => {
  test("another ticket completed it first: names the ticket and the number, and says this ticket completed it later", () => {
    const [a, b] = lostClaimLines("Top Line", [{ idx: 64, tickets: [7] }], 66);
    expect(a).toBe("Ticket 7 won Top Line at number 65."); expect(b).toBe("Your ticket completed it later, at number 67.");
  });
  test("this ticket completed it before, but the claim came after the next number: the late cause is named with the number", () => {
    const [a, b] = lostClaimLines("Top Line", [{ idx: 65, tickets: [7] }], 60);
    expect(a).toBe("Ticket 7 won Top Line at number 66."); expect(b).toBe("Your ticket completed it at number 61, but your claim reached the game after number 62 was called.");
  });
  test("the same number: the other claim reached the game first; several winning tickets are listed; unknown tickets are not invented", () => {
    expect(lostClaimLines("Early 5", [{ idx: 20, tickets: [3, 9] }], 20)[1]).toBe("Your ticket completed it at the same number, 21. The other claim reached the game first.");
    expect(lostClaimLines("Early 5", [{ idx: 20, tickets: [3, 9, 12] }], 20)[0]).toBe("Tickets 3, 9 and 12 won Early 5 at number 21.");
    expect(lostClaimLines("Early 5", [{ idx: 20 }], 25)[0]).toBe("Another ticket won Early 5 at number 21.");
  });
  test("two positions awarded and nothing known about this ticket: both winners, one honest second line", () => {
    const [a, b] = lostClaimLines("Full House", [{ idx: 80, tickets: [2] }, { idx: 70, tickets: [5] }], -1);
    expect(a).toBe("Ticket 5 won Full House at number 71. Ticket 2 won it at number 81."); expect(b).toBe("Your claim reached the game after the prize was taken.");
  });
});
