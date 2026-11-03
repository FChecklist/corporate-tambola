import type { Rng, Scenario } from "./lib.mjs";
declare const gen: (a: { seed: number; R: Rng; L: typeof import("./lib.mjs") }) => Promise<Scenario[]>;
export default gen;
