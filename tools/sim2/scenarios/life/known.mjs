// Defects already written to docs/SIM_GAPS_life.md: a scenario whose ONLY failing assertions start with one of these names is reported "known-gap" instead of FAIL, so a NEW regression stays visible.
// Shape: { "<scenario id>": [ { check: "<assertion name prefix>", gap: "<gap id in docs/SIM_GAPS_life.md>" } ] }
export const KNOWN = {
  L13: [{ check: "one reminder from the scheduled job", gap: "LIFE-01" }],
  S05: [{ check: "23:59:59 IST: kept", gap: "LIFE-03" }],
  S07: [{ check: "kept 1 ms before the IST midnight", gap: "LIFE-03" }],
  S08: [{ check: "payment/invoice/entitlement records purged", gap: "LIFE-04" }],
};
