/**
 * THE ONE PLACE FOR THE PRICES. To revert a price change, edit PACKS here (and its browser copy `TB.PACKS` in apps/web/public/common.js, which
 * `apps/web/test/pricing-cups.test.ts` keeps equal to this list), then follow the version rule.
 *
 * Packs are sold as "Up to N participants" (glossary). [participants, INR price the customer pays, USD price].
 * Owner decision 2026-10-09: the seller is not registered for GST, so NO GST is charged. GST_ON is the one switch: when the seller registers, set it to true
 * and GST (18%) is added ON TOP of these prices (review the prices first).
 *
 * Owner pricing update 2026-11-23 (the boss's ladder: "Rs 2,500 to open a game + Rs 5 per player place, charm endings"), three cups for every game and console:
 * Small up to 100 = Rs 2,999, Medium up to 500 = Rs 4,999 (shown as "Most chosen"), Large up to 1,000 = Rs 7,499. More sizes sit behind "See more sizes":
 * 250 = 3,799, 750 = 6,299, 2,500 = 11,999, 5,000 = 17,999, 10,000 = 29,999. The US dollar column was not part of that decision and is unchanged.
 * Before 2026-11-23 the INR prices were 2,399 / 3,499 / 4,699 / 5,899 / 7,099 / 11,799 / 17,699 / 29,499.
 */
export const PACKS: ReadonlyArray<readonly [number, number, number]> = [
  [100, 2999, 34], [250, 3799, 51], [500, 4999, 67], [750, 6299, 84], [1000, 7499, 101], [2500, 11999, 169], [5000, 17999, 253], [10000, 29999, 421],
];
/** The three cups shown first, everywhere (home page, price page, brochure, console). `upTo` must be a size in PACKS; every other size is behind "See more sizes". */
export const CUPS: ReadonlyArray<{ readonly key: "small" | "medium" | "large"; readonly name: string; readonly upTo: number; readonly mostChosen: boolean }> = [
  { key: "small", name: "Small", upTo: 100, mostChosen: false },
  { key: "medium", name: "Medium", upTo: 500, mostChosen: true },
  { key: "large", name: "Large", upTo: 1000, mostChosen: false },
];
/** Page copy for the cups (owner rules 2026-11-23: you / rupee sign, no tick boxes, never "no data is taken", never "100% secure", never "played by major companies"). Browser copy: `TB.PRICING_COPY` in common.js. */
export const PRICING_COPY = {
  headline: "Run a game your whole team will talk about.",
  benefits: ["You choose auto mode or manual mode.", "Close group only: just the people you invite.", "You are in control, from start to finish."],
  trust: ["Players' details are erased within 24 hours after the game.", "Pay once per game, receipt straight away."],
  mostChosen: "Most chosen",
  moreSizes: "See more sizes",
} as const;
export const GST_ON = false;
export const GST = 0.18;
export type Currency = "INR" | "USD";
const r2 = (x: number) => Math.round(x * 100) / 100;

export function price(pack: number, currency: Currency): { total: number; base: number; tax: number } {
  const p = PACKS.find((x) => x[0] === pack);
  if (!p) throw new RangeError(`unknown pack ${pack}`);
  if (currency === "INR") {
    const tax = GST_ON ? r2(p[1] * GST) : 0;
    return { total: r2(p[1] + tax), base: p[1], tax };
  }
  return { total: p[2], base: p[2], tax: 0 };
}

/** Where brand breaks go by default: near-equal intervals over the 90 calls (owner decision CR-02). */
export function proposeBreakPositions(count: number): number[] {
  if (count <= 0) return [];
  if (count > 3) throw new RangeError("at most 3 brand breaks");
  return ({ 1: [45], 2: [30, 60], 3: [22, 45, 67] } as Record<number, number[]>)[count]!;
}
