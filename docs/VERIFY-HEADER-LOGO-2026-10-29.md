# Verify: header and logo branch (2026-10-29)

Branch tested (not modified): `claude/housie-header-logo-71da56` @ be837d8 (on live 1.6.7 e6759a0). Baseline: `wip/join-redesign`.

## Tests and typecheck
- `bun test --isolate packages apps tools/control-worker`: branch 3082 pass / 9 fail; baseline 3037 pass / 2 fail.
- Typecheck: 176 errors on both (same, from before this branch, e.g. apps/edge/src/checkin.ts:103). No new type errors.
- Same 2 failures on both (not new): UC-32 crowd limit; check-in "organizer sees how many are present".
- 7 NEW failures:
  - 6 x apps/edge/test/terms.test.ts (terms, legal-position, dpa, subprocessors, partner-terms, organizer-guide): the test expects `class="legaltop"`; the new header removed it. Stale test, not a page bug.
  - 1 x apps/edge/test/ai-enablement.test.ts (Trust page / llms.txt must equal generated text): generated output differs from the shipped file. Likely not regenerated after the header change. Needs a fix on the branch.

## Manual checks (static, on the branch)
- Six-item header (How it works | Free demo game | Guide | Brochure | Refer & earn | Log in): present on about, contact, dpa, index, legal, legal-position, partner-terms, pricing, privacy, refund-policy, subprocessors, terms, organizer-guide, ai-prompt. NOT present (fully or partly) on: brochure (5 missing), helpdesk (4 missing), 404, signin, trust, pay, paylink, partner, report, demo, offline. Internal pages (console, play, screen, confirm, z, zc) are not shipped live. Which of the rest count as "public" is the owner's call; as written, "every public page" does NOT pass.
- Word "private" in player-facing HTML: none found (only in code comments and JS).
- Payee: pages name only "IT Services by Rajat Agarwal" with Razorpay. No other payee found.
- Link to console.corporatetambola.com: none in pages or JS (only in a test and docs/flow/10-roles-identity-trail.md).
- Logo equals brand kit: NOT VERIFIED. No brand-kit source file is in the repo or was given. Only confirmed: icons changed, logo-512 and icon-512 are the same size (57734 bytes), icon-192 matches the pages/public copy. No visual comparison done.

## Verdict
Do not release. Fix the 7 failures and the pages missing the six-item header, and supply the brand kit file for the logo check.
