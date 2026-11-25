# Release 1.12.0 (24 Nov 2026): new prices, three cups - not deployed

Written for a person or AI session that has not seen this work. No secret, key or personal address is in this page. The money flag `PAY_VIA_MONEYPENNY` is off and no payment code is touched; payments are only taken by IT Services by Rajat Agarwal through Razorpay.

## Why
The owner's pricing update of 23 Nov 2026: three cups for all games and consoles; the prices must agree in every system and change only behind two independent audits and a version bump. The boss's ladder: "Rs 2,500 to open a game + Rs 5 per player place, charm endings."

## Where it stands
Branch `p1/pricing-three-cups-2026-11-24`, built on master `6d38283` (1.11.2). 1.11.0 is the live release (commit `8a4a0be`, deployment `1366bf89`; rollback `edd21023` = 1.10.2). 1.11.1 and 1.11.2 are merged into master and are NOT live, so deploying this release also ships them. Not deployed, not merged. Needs two independent audits on the exact head commit.

## The prices
| Size | Cup | Rupees (new) | Rupees (before) | US dollars (unchanged) |
|---|---|---|---|---|
| up to 100 | Small | 2,999 | 2,399 | 34 |
| up to 250 | | 3,799 | 3,499 | 51 |
| up to 500 | Medium, "Most chosen" | 4,999 | 4,699 | 67 |
| up to 750 | | 6,299 | 5,899 | 84 |
| up to 1,000 | Large | 7,499 | 7,099 | 101 |
| up to 2,500 | | 11,999 | 11,799 | 169 |
| up to 5,000 | | 17,999 | 17,699 | 253 |
| up to 10,000 | | 29,999 | 29,499 | 421 |

No GST is shown or added (`GST_ON` stays false). Everything that charges, invoices, credits or pays a commission reads the one list, so the money follows by itself.

## Where the prices and words live (revert = edit these)
| What | Where |
|---|---|
| `PACKS` (prices), `CUPS` (Small 100, Medium 500, Large 1,000), `PRICING_COPY` (headline, three benefit lines, two trust lines) | `packages/shared/src/pricing.ts` (the one place) |
| The browser copy: `TB.PACKS`, `TB.CUPS`, `TB.PRICING_COPY` | `apps/web/public/common.js` (a test keeps it equal to the code) |
| The home page cups (drawn from `TB`) | `apps/web/public/site.js`, `cups.css`, the heading in `index.html`, the structured-data offers in `index.html` |
| The price page, the brochure | `pricing.html`, `brochure.html` (+ `brochure.pdf`, rebuilt with `node tools/make-brochure.mjs`), `partner.html` (the Refer and earn example) |
| The console | `zc.js` (`CUP_SIZES`, `capChips`, the make-real card), `pack/zc-flow.js` (`CUP_NAMES`, the cups above the size list, `FALLBACK_PACKS`), `pack/zc-flow.css` |
| Visit counting of a cup click | `v.js` (`shown`) |
| Saved copies on phones | `zsw.js` cache `ct-game-v48` |
| The build ships the stylesheet | `pages/build.mjs` (`cups.css`) |

To revert a price: edit `PACKS` and `TB.PACKS`, the two fallback lists in `zc.js` and `pack/zc-flow.js`, the written pages (price page, brochure and its PDF, structured data, the partner example) and the simulator list `tools/sim2/scenarios/life/lib.mjs`; the test `apps/web/test/pricing-cups.test.ts` says what is out of step. Then follow the version rule (new number, two audits).

## Decisions and open points for the owner
- **"erased".** The trust line says "erased within 24 hours"; the order of 1 Nov 2026 says customer text never says erase. The newer written line is used word for word, and `no-erase-words.test.ts` allows exactly that one sentence. To go back: write "deleted" in the places above and delete the allowance.
- **Formula.** 100 / 500 / 1,000 follow "2,500 + 5 a place" (3,000 / 5,000 / 7,500, charm endings). 250 and 750 are above it (3,750 / 6,250 given as 3,799 / 6,299); 2,500, 5,000 and 10,000 are far below it (15,000 / 27,500 / 52,500 by the formula) by the owner's own list. Built exactly as given.
- **US dollars** were not part of the decision and did not change; the cups show them under the rupee price on the price page and when the visitor picks US$ on the home page.
- **Console size buttons show no price** (older rule: the price shows only in the Pay step); the new flow's size list and the demo card show prices from the game's own list.
- **Open:** two audits on the exact head commit; the base question (1.11.1 and 1.11.2 are not live); `tests/e2e` selectors for the old price card were already stale and are not run.

## Checks
The exact results (type-check and every test file as its own process, and the red-without-the-change proofs) are in the pull request comment.
