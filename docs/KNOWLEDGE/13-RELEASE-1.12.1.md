# Release 1.12.1 (25 Nov 2026): the owner's gap list on top of the three cups - not deployed

Written for a person or AI session that has not seen this work. No secret, key or personal address is in this page. The money flag `PAY_VIA_MONEYPENNY` stays off and no payment code is touched.

## Where it stands
Stacked on PR #39 (branch `p1/pricing-three-cups-2026-11-24`, 1.12.0). Needs two independent audits on the exact head commit before any deploy. See `CHANGELOG.md` section 1.12.1 for the full list.

## The prices
Small (up to 100 players) Rs 2,872, Medium (up to 500) Rs 4,872, Large (up to 1,000) Rs 7,882. One constant: `CUP_PRICES` in `packages/shared/src/pricing.ts`; browser copy `TB.CUP_PRICES` in `apps/web/public/common.js`. To revert: edit both (a test keeps them equal). The older numbers 2,999 / 4,999 / 7,499 are in PR #39's title and in 1.12.0's notes.

## Decisions and open points
- The idle end ("the game ends by itself after 30 minutes without activity") does not exist in the code; only a pause ends by itself after 30 minutes. The pages say only that.
- "Co-host" (older role) was left; "Host" became "Co-organizer".
- The legal pages still say "Host" and name the gateway (legal text, not reworded). The brochure PDF was rebuilt.
- The ban on "my / your" in user text is applied to new lines only.
