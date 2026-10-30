// One registry of every implemented case (id -> function). A group file adds its cases here; the cases that are not here report "not-implemented".
import { IMPL as S0 } from "./s0.mjs";
import { IMPL as G1 } from "./g1.mjs";
import { IMPL as G2 } from "./g2.mjs";
import { IMPL as G3 } from "./g3.mjs";
import { IMPL as G4 } from "./g4.mjs";
import { IMPL as G5 } from "./g5.mjs";
import { IMPL as G6 } from "./g6.mjs";
import { IMPL as G78 } from "./g7g8.mjs";
export const IMPL = { ...S0, ...G1, ...G2, ...G3, ...G4, ...G5, ...G6, ...G78 };
