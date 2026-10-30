# Tambola: GO-LIVE CHECKLIST (copy of handover note 400, one row at a time)

Written 30 Oct 2026 on branch feat/1.8.4-ui (base tag tambola-v1.8.3 = 751df6c, live). Rule: a row is ticked only with evidence named here; "not proven" rows say why and what proves them. Nothing for 1.8.4 or 1.8.5 is deployed.
Legend: [x] proven (evidence given) / [~] partly proven / [ ] not proven yet.

## A. Identity and lists
- [ ] A1 Employee ID cleaner (NFKC, uppercase, A-Z 0-9 only, 30 cap): NOT proven. Planned as release 1.8.5 by the console session. Today's engine trims and uppercases only.
- [ ] A2 Used on every path: not proven (needs 1.8.5, then a path-by-path test).
- [x] A3 Email cleaner: cleanEmail in apps/edge/src/approvals.ts (trim, lowercase, shape check). Evidence: apps/edge/test/email-fixes-183.test.ts, apps/web/test/approvals-1-8.test.ts. [~] NFKC and "typed email in an ID game refused plainly" not shown by a named test.
- [ ] A4 "same person after cleaning" flag: not proven (needs 1.8.5).
- [ ] A5 Hint "The system will read this as ...": not proven (UI, 1.8.5).
- [~] A6 Old games keep old behaviour: APPROVAL_RULES_FROM_MS = 1793316967027 is in force (approvals.ts, tests approvals-1-8). EMP_CLEAN_FROM_MS does not exist yet (1.8.5; deploy instant set at deploy time).
- [~] A7 Criterion Employee ID or Email ID: the join page supports both (mock A and A2; live landing shot live/player-landing.png shows the mobile variant only). Email-ID variant not captured live.
- [~] A8 Test addresses demoN@demo-test.invalid: campaign tools done (commit 9b15808, test apps/web/test/campaign-tools.test.ts). Older engine and DOM tests still use boss@acme.com and similar: not swept.

## B. Organizer
- [~] B1-B5 Steps 1-5 exist in the new console (zc-flow). Tests: apps/web/test/zc-default-182.test.ts, build-ships-flow.test.ts. Live screenshots of draft steps 1-5 NOT captured yet (my first run opened the dashboard of a published game). Super Bumper, Lucky Draw, A/B per ticket on step 3 not captured.
- [~] B6 Dashboard: Game ID, banners, share card, ready check, rehearsals, board, prizes all seen in data/ui/compare-2026-10-30/live/org-step1.png. Found and fixed one bug: Ready check printed "Paymentnull" (commit b6ee745, test apps/web/test/no-null-text-184.test.ts). 11 status pills not individually captured.
- [~] B7 Previous-screens link: visible in live/org-step1.png (top right and footer). Remembered per browser: tested in zc-default-182.test.ts. Old-console-only links not re-proven.
- [~] B8 Existing games in the new console: zc-default-182.test.ts; no fresh run on 1.8.4.

## C. Roles
- [~] C1 Host / C2 Co-host: sign-in and limits tested in apps/web/test/host-setup.test.ts and approvals-1-8.test.ts. Screens not compared with the mock: live Host sign-in not reached (gap report row 1), Host banner "You are a Host" and header MISSING in live (gap report).
- [~] C3 Family Passes: engine tested (apps/edge approvals, FAMILY_CUTOFF 15 min). Family screens (mock rows 53-57) NOT captured live.
- [ ] C4 Role chips and "you were made Co-host by ...": not proven.
- [x] C5 Authorization negatives: approvals-1-8.test.ts (nobody approves themselves, approver limited to own game). Campaign case UC-G3 written, not run.

## D. Join and approvals
- [x] D1/D2 Listed and open join: apps/web/test/participant-180-engine.test.ts, player-matrix.test.ts (460,800 permutations).
- [x] D3 Not on list, 30-minute wait limit, first decision wins: approvals-1-8.test.ts. [~] polite decline wording versus the mock card: DIFFERENT in gap report row 39/40.
- [x] D4 Consent version safe, stale page "Reload": apps/web/test/consent-old-version-183.test.ts, consent-pages.test.ts, consent.test.ts. Rehearsal join: rehearsal.test.ts, rehearsal-pages.test.ts.

## E. Before the game
- [~] E1 Landing, not-listed, waiting, ticket before start: live shots exist (live/player-landing.png, player-notlisted-or-waiting.png, player-before.png) and all three are DIFFERENT from the mock (gap-report.md rows 36, 39-41). Family waiting/approved, rehearsal, reconnect/back online not captured.

## F. During the game
- [~] F1 Timer cadence, no repeats: engine tested; campaign cases UC-G4-01 and UC-G4-06 written, NOT run.
- [~] F2 A/B switch, Retro/Modern: live shots live/player-live-two-tickets-A.png, -B.png, player-live-modern.png; DIFFERENT from the mock (gap report row 50). Test: player-look.test.ts.
- [~] F3 Claims: tests claim-window.test.ts, claim-signal.test.ts, claims-page.test.ts, claim-ui-pages.test.ts. Gold claim, bogey, results, bystander screens NOT captured live (gap report rows 23-35).
- [ ] F4 Super Bumper, Super Ticket, Lucky Draw: not proven on screen.

## G. After the game
- [~] G1 Thank-you / you won: live shot live/player-ended.png is DIFFERENT (no final-results table). "Game completed" page and the 30-minute message: not seen in live. Report email: report-email.test.ts. Delete/copy: not re-proven.

## H. Messages and language
- [~] H1 Guide entry for every refusal: apps/web/test/guide.test.ts (apps/web) and apps/edge guide checks. "private" never player-facing: test in no-internal-notes.test.ts. Full wording review against the mock: not done.

## I. Look and feel
- [~] I1 Version + release time IST in every footer: apps/web/test/version-stamp.test.ts (commit d02f040). Brand header on all pages: yes (logo files byte for byte, commit 4d43bb5). Mock look NOT matched: see I2.
- [ ] I2 Side-by-side compare: data/ui/compare-2026-10-30/index.html and gap-report.md. 59 mock shots; 11 live matches; 7 DIFFERENT; 48 not captured. NOT all SAME. Open.

## J. Payment and data
- [x] J1 Payee IT Services by Rajat Agarwal via Razorpay: invoice/brochure tests (commit 726ba19..d02f040, PDF tests); no payment from participants: no-participant-payment.test.ts. [~] "pay later link works 7 days": not re-proven here.
- [x] J2 24 h deletion and 365-day log: retention.test.ts, data-map.test.ts, email-notice-183.test.ts, privacy/terms/dpa/trust pages updated in 1.8.1 / 1.8.3.

## K. Tests (per release)
- [~] K1-K2 suites: run per folder, last full run for 1.8.3 recorded in handover note 150. For 1.8.4: only the new guard test and pack tests run (6 of 6 pass). Full suites NOT yet run on 1.8.4.
- [x] K3 1,000,000+ scenarios: player-matrix (460,800) plus participant matrix and engine suites recorded for 1.8.3; not re-run for 1.8.4.
- [ ] K4 One deliberate break per new rule: 1.8.4 break check not yet done.
- [ ] K5 Full suites on the cloud: not done for 1.8.4.
- [ ] K6 Typecheck 0 errors: not run on 1.8.4.
- [ ] K7 One-Chrome check 360/768/1280 light+dark: partial (390 and 1280 screenshots only).
- [ ] K8 Skeptic audit: not done for 1.8.4.
- [ ] K9 Live gate 0: checked at deploy time only.
- [ ] K10 Deploy with rollback id: 1.8.3 deployment 0891ca59 is the rollback for 1.8.4. 1.8.4 not deployed.
- [ ] K11 Live smoke: after deploy only.
- [ ] K12 version.json = commit: at build.
- [ ] K13 Register 150 + this checklist: 150/140 updated through 1.8.3.

## M. Campaign
- [x] M1 Layer A 1000 x 10: reported DONE by the console session (1000/1000). Evidence is theirs (tools/sim2 run); not re-run here.
- [ ] M2 Layer B, 100 use cases: 55 cases written (branch campaign/usecases-100, head 9b15808), NONE run against a server yet; 45 kinds still to implement.
- [ ] M3 Layer C, 25 cases on the real site: not started (needs the real-site meter run, owner/BOSS go and cleanup).

## Not provable yet (summary)
A1, A2, A4, A5, A6 (second half), A8 (older tests), C4, F4, I2, K4-K13 for 1.8.4, M2, M3; and partly B1-B5 (draft step shots), B6 pills, C3 (family screens), E1/F3/G1 (48 mock screens not captured live).
