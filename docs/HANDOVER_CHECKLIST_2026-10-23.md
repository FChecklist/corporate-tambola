# Handover checklist (2026-10-23)

Built from the previous session's report, docs/AUDIT_ALL_PRODUCTS_2026-10-23.md and a check of every repo under C:\ct.

## Done and verified in this pass
- [x] Read the audit and the handover; checked git state of every repo (tambola, bingo, snakesladders, luckbychance, tictactoe, games index, startup-coach, itservices, shobha-site, scheduler).
- [x] tambola, bingo, snakesladders, luckbychance, tictactoe, corporate-games(-index), startup-coach-site: clean, nothing unpushed.
- [x] itservices-site: 1 unpushed commit (home page redesign, already deployed) pushed. Only a stale .pyc remains modified (not tracked work).
- [x] shobha-site (company site): 22 uncommitted files (structured data, rum.js monitoring, Razorpay logo, functions, redirect, rebuilt dist) committed locally as e014cab. This repo has no remote.
- [x] "Real-housie mode" (earlier listed as NOT built): already shipped, commit 62829e4 - every game is real housie (tap, Claim, Bogeys). The owner's later rule removed the per-game switch.
- [x] "AI prompt for ChatGPT/Gemini" (listed as NOT built): already shipped - aiPaste in apps/edge/src/ai-link.ts, docs/AI_PROMPT.md, live at /ai-prompt (HTTP 200).

## Needs the owner
- [ ] Rs 1 real payment on Tic Tac Toe, Snakes & Ladders, Luck by Chance (then switch from TEST to LIVE and remove "Coming soon").
- [ ] Trademark application.
- [ ] hello@ forwarding check; uptime alarm; lawyer/CA sign-off; Razorpay webhook secret.
- [ ] Startup Coach: one real paid purchase.
- [ ] DPDP app screens behind sign-in: needs a throw-away account to test.
- [ ] Test shells raajat.agarwal+demonew1..4 and +livetest2: close with `node tools/livetest/live.mjs cleanup --close` (needs a live sign-in token; closing deletes the account, so the owner should confirm which account the saved token belongs to).

## Open engineering (decision needed, not started)
- [ ] Port release B (multi-winner + tie rule, free demo game, Host-calls mode, prizes list) to Bingo, Snakes & Ladders, Luck by Chance, Tic Tac Toe. Each game has different rules; confirm which features apply to which game before building.
- [ ] Cloudflare bot-challenge snippet blocked by the strict CSP (console warning only, no user effect).

## Not part of this work (other uncommitted material, left alone)
- C:\ct\ct (branch fix/r47-percent-entries-cap): ~60 untracked handover docs / KT files / SQL from earlier sessions.
- C:\ct\projexa (test/r92-diag): 23 changed files from an earlier diagnostic effort.
- C:\ct\scheduler: untracked cloudflare/, cleanup/ folders.
