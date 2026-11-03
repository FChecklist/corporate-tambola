// rc/tambola-1.8.5 matrix: the scenario stream. A scenario is one point in
//   kind (employee ID | Email ID) x era (new | old) x role (participant | organizer | host | cohost) x join (list | open) x family (off | on) x order (list-first | typed-first) x relation (same | other | wrong-kind | junk)
//   x base ID (16) x spelling of the listed ID (28) x spelling of the typed ID (28)
// = 2 x 2 x 4 x 2 x 2 x 2 x 4 x 16 x 28 x 28 = 6,422,528 scenarios. Streamed in lexicographic order: nothing is held in memory.
import { EMP_BASES, EMAIL_BASES, EMP_JUNK, EMAIL_JUNK, EMP_FORMATS, EMAIL_FORMATS } from "./spellings";

export const KINDS = ["emp", "email"] as const, ERAS = ["new", "old"] as const, ROLES = ["participant", "organizer", "host", "cohost"] as const, JOINS = ["list", "open"] as const;
export const FAMILY = [false, true] as const, ORDERS = ["list-first", "typed-first"] as const, RELS = ["same", "other", "wrong-kind", "junk"] as const;
export interface Scenario { n: number; kind: "emp" | "email"; era: "new" | "old"; role: string; join: string; family: boolean; order: string; rel: string; base: number; lf: number; tf: number; listText: string; typedText: string }
export const RADIX = [KINDS.length, ERAS.length, ROLES.length, JOINS.length, FAMILY.length, ORDERS.length, RELS.length, 16, 28, 28] as const;
export const TOTAL = RADIX.reduce((a, b) => a * b, 1);

export function textsOf(kind: "emp" | "email", rel: string, base: number, lf: number, tf: number): [string, string] {
  const B = kind === "emp" ? EMP_BASES : EMAIL_BASES, other = kind === "emp" ? EMAIL_BASES : EMP_BASES, J = kind === "emp" ? EMP_JUNK : EMAIL_JUNK, F = kind === "emp" ? EMP_FORMATS : EMAIL_FORMATS, G = kind === "emp" ? EMAIL_FORMATS : EMP_FORMATS;
  const list = F[lf]![1](B[base]!);
  if (rel === "same") return [list, F[tf]![1](B[base]!)];
  if (rel === "other") return [list, F[tf]![1](B[(base + 1) % 16]!)];
  if (rel === "wrong-kind") return [list, G[tf]![1](other[base]!)]; // an address typed in an employee-ID game / an employee ID typed in an Email-ID game
  return [list, F[tf]![1](J[base]!)];
}

/** index -> scenario (used by the small mode and the sampler); the full run uses the odometer below. */
export function scenarioAt(n: number): Scenario {
  let r = n; const d: number[] = new Array(RADIX.length);
  for (let i = RADIX.length - 1; i >= 0; i--) { d[i] = r % RADIX[i]!; r = Math.floor(r / RADIX[i]!); }
  const kind = KINDS[d[0]!]!, [listText, typedText] = textsOf(kind, RELS[d[6]!]!, d[7]!, d[8]!, d[9]!);
  return { n, kind, era: ERAS[d[1]!]!, role: ROLES[d[2]!]!, join: JOINS[d[3]!]!, family: FAMILY[d[4]!]!, order: ORDERS[d[5]!]!, rel: RELS[d[6]!]!, base: d[7]!, lf: d[8]!, tf: d[9]!, listText, typedText };
}
/** Every scenario, in order, one at a time (a generator: nothing is kept). `only` = N takes exactly N scenarios spread evenly over the whole space (small mode); the index still rises strictly, so they are all different. */
export function* scenarios(only = 0): Generator<Scenario> {
  if (only > 0) { for (let i = 0; i < only; i++) yield scenarioAt(Math.floor((i * TOTAL) / only)); return; }
  for (let n = 0; n < TOTAL; n++) yield scenarioAt(n);
}
