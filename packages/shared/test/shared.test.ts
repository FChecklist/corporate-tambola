import { describe, expect, test } from "bun:test";
import {
  normalize, generateTicket, isValidTicket, ticketNumbers, patternNumbers, spokenPhrase, numberWords,
  price, PACKS, CUP_PRICES, proposeBreakPositions, rewardName, maskNumber,
} from "../src";

describe("phone numbers (handout section 12, default country IN)", () => {
  const ok = (raw: string, e164: string, cc = "IN") => {
    const r = normalize(raw, cc);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.e164).toBe(e164);
  };
  test("mandated formats", () => {
    ok("98200 44556", "+919820044556");
    ok("+91 99876 11223", "+919987611223");
    ok("09123456780", "+919123456780");
    ok("0091 9988776655", "+919988776655");
    ok("919812312312", "+919812312312");
    ok("+65 9123 4567", "+6591234567");
    ok("+971 50 765 4321", "+971507654321");
  });
  test("rejections", () => {
    expect(normalize("12345", "IN")).toEqual({ ok: false, reason: "Too short" });
    expect(normalize("98765abc10", "IN")).toEqual({ ok: false, reason: "Contains letters" });
    expect(normalize("", "IN")).toEqual({ ok: false, reason: "No number found" });
    expect(normalize("1".repeat(16), "IN")).toEqual({ ok: false, reason: "Too long" });
  });
  test("changed flag", () => {
    const a = normalize("+919820044556", "IN");
    const b = normalize("98200 44556", "IN");
    expect(a.ok && a.changed).toBe(false);
    expect(b.ok && b.changed).toBe(true);
  });
  test("masking hides the middle digits", () => {
    const m = maskNumber("+919820044556");
    expect(m).toContain("•");
    expect(m.endsWith("556")).toBe(true);
  });
});

describe("tickets", () => {
  test("10,000 generated tickets are all structurally valid", () => {
    for (let i = 0; i < 10000; i++) expect(isValidTicket(generateTicket())).toBe(true);
  });
  test("pattern number sets have the right sizes", () => {
    const t = generateTicket();
    expect(patternNumbers(t, "top")!.length).toBe(5);
    expect(patternNumbers(t, "corners")!.length).toBe(4);
    expect(patternNumbers(t, "star")!.length).toBe(5);
    expect(patternNumbers(t, "full")!.length).toBe(15);
    expect(patternNumbers(t, "early5")).toBeNull();
    expect(ticketNumbers(t).length).toBe(15);
  });
});

describe("spoken phrase (owner decision: digits then words, single digits not repeated)", () => {
  test("examples", () => {
    expect(spokenPhrase(24)).toBe("Next number is two four, twenty-four. Number twenty-four.");
    expect(spokenPhrase(7)).toBe("Next number is seven. Number seven.");
    expect(spokenPhrase(10)).toBe("Next number is one zero, ten. Number ten.");
    expect(spokenPhrase(90)).toBe("Next number is nine zero, ninety. Number ninety.");
    expect(spokenPhrase(13)).toBe("Next number is one three, thirteen. Number thirteen.");
  });
  test("all 90 have words and bounds are enforced", () => {
    for (let n = 1; n <= 90; n++) expect(numberWords(n).length).toBeGreaterThan(2);
    expect(() => numberWords(0)).toThrow();
    expect(() => numberWords(91)).toThrow();
  });
});

describe("pricing and breaks", () => {
  test("no GST is charged: the rupee price is the whole amount; no tax abroad either", () => {
    expect(price(1000, "INR")).toEqual({ total: 7882, base: 7882, tax: 0 });
    expect(price(1000, "USD")).toEqual({ total: 101, base: 101, tax: 0 });
  });
  test("owner pricing update 2026-11-23: every rupee price ends in 99 and the ladder rises with the size; the exact list; the US dollar column is unchanged", () => {
    // (This replaces the owner rule of 2026-10-09, "the old GST-inclusive price rounded to the nearest 99": the boss's ladder is "Rs 2,500 to open a game + Rs 5 per player place, charm endings".)
    PACKS.forEach(([n, inr], i) => {
      if (!(Object.values(CUP_PRICES) as number[]).includes(inr)) expect(inr % 100).toBe(99); // the three cups are the owner's own numbers (2,872 / 4,872 / 7,882)
      expect(price(n, "INR").total).toBe(inr);
      if (i > 0) { expect(inr).toBeGreaterThan(PACKS[i - 1]![1]); expect(n).toBeGreaterThan(PACKS[i - 1]![0]); }
    });
    expect(PACKS.map((p) => p[0])).toEqual([100, 250, 500, 750, 1000, 2500, 5000, 10000]);
    expect(PACKS.map((p) => p[1])).toEqual([2872, 3799, 4872, 6299, 7882, 11999, 17999, 29999]);
    expect(PACKS.map((p) => p[2])).toEqual([34, 51, 67, 84, 101, 169, 253, 421]);
  });
  test("break positions are near-equal and capped at 3", () => {
    expect(proposeBreakPositions(3)).toEqual([22, 45, 67]);
    expect(() => proposeBreakPositions(4)).toThrow();
  });
  test("reward names", () => {
    expect(rewardName("full", "ticket", 2, 3)).toBe("2nd Full House");
    expect(rewardName("full", "two_ticket", 1, 1)).toBe("Full Two-Ticket House");
    expect(rewardName("top", "ticket", 1, 1)).toBe("Top Line");
  });
});
