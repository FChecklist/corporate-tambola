/** Packs are sold as "Up to N participants" (glossary). [participants, INR software price excl. 18% GST, USD all-inclusive (INR incl. GST / 70, rounded)]. */
export const PACKS: ReadonlyArray<readonly [number, number, number]> = [
  [100, 999, 17], [250, 1299, 22], [500, 1499, 25], [750, 1799, 30], [1000, 1999, 34], [2500, 3999, 67], [5000, 6249, 105], [10000, 9999, 169],
];
export const GST = 0.18;
export type Currency = "INR" | "USD";
const r2 = (x: number) => Math.round(x * 100) / 100;

export function price(pack: number, currency: Currency): { total: number; base: number; tax: number } {
  const p = PACKS.find((x) => x[0] === pack);
  if (!p) throw new RangeError(`unknown pack ${pack}`);
  if (currency === "INR") {
    const tax = r2(p[1] * GST);
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
