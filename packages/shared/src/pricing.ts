/** Packs are sold as "Up to N participants" (glossary). [participants, INR incl. 18% GST, USD]. */
export const PACKS: ReadonlyArray<readonly [number, number, number]> = [
  [100, 500, 79], [250, 1000, 149], [500, 1500, 249], [750, 1800, 329],
  [1000, 2000, 399], [2500, 4000, 799], [5000, 6250, 1299], [10000, 10000, 1999],
];
export const GST = 0.18;
export type Currency = "INR" | "USD";
const r2 = (x: number) => Math.round(x * 100) / 100;

export function price(pack: number, currency: Currency): { total: number; base: number; tax: number } {
  const p = PACKS.find((x) => x[0] === pack);
  if (!p) throw new RangeError(`unknown pack ${pack}`);
  if (currency === "INR") {
    const base = r2(p[1] / (1 + GST));
    return { total: p[1], base, tax: r2(p[1] - base) };
  }
  return { total: p[2], base: p[2], tax: 0 };
}

/** Where brand breaks go by default: near-equal intervals over the 90 calls (owner decision CR-02). */
export function proposeBreakPositions(count: number): number[] {
  if (count <= 0) return [];
  if (count > 3) throw new RangeError("at most 3 brand breaks");
  return ({ 1: [45], 2: [30, 60], 3: [22, 45, 67] } as Record<number, number[]>)[count]!;
}
