// Defects already written to docs/SIM_GAPS_life.md: a scenario whose ONLY failing assertions start with one of these names is reported "known-gap" instead of FAIL, so a NEW regression stays visible.
// Shape: { "<scenario id>": [ { check: "<assertion name prefix>", gap: "<gap id in docs/SIM_GAPS_life.md>" } ] }
export const KNOWN = {
  L13: [{ check: "one reminder from the scheduled job", gap: "LIFE-01" }],
  S02: [{ check: "gone after day 30", gap: "LIFE-02" }],
  S03: [{ check: "draft forgotten at day 30", gap: "LIFE-02" }],
  S05: [{ check: "23:59:59 IST: kept", gap: "LIFE-03" }],
  S07: [{ check: "kept 1 ms before the IST midnight", gap: "LIFE-03" }],
  S08: [{ check: "payment/invoice/entitlement records purged", gap: "LIFE-04" }],
  K24: [{ check: "paying by credit adds no commission ROW", gap: "LIFE-05" }],
  K31: [{ check: "the credit is usable again", gap: "LIFE-06" }, { check: "no credit stays 'applied'", gap: "LIFE-06" }],
  K32: [{ check: "credit usable again", gap: "LIFE-06" }],
  K36: [{ check: "mail does not say it 'stays as credit until'", gap: "LIFE-07" }],
  K38: [{ check: "credit taken by the game = the new price exactly", gap: "LIFE-08" }, { check: "the excess is back in the credit", gap: "LIFE-08" }],
};
