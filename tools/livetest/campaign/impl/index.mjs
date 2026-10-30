// One registry of every implemented case (id -> function). A group file adds its cases here; the cases that are not here report "not-implemented".
import { IMPL as S0 } from "./s0.mjs";
import { IMPL as G2 } from "./g2.mjs";
export const IMPL = { ...S0, ...G2 };
