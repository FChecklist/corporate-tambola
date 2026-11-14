# How it was built, tested and checked

## Build
Branch `tambola-v2` in its own worktree off the live commit, so the live folder was never touched. A plan first (`docs/V2_CHANGE_PLAN.md`), then the build, with each item tested including the refusals (wrong role, expired key, after the end, personal data not leaking, language isolation, certificate tamper checks, deletion at 24 hours).

## The rule behind the audits
The builder cannot certify their own work (Rule 7c). After the build, a fresh auditor who had not seen the work was given the brief and the code, told to trust nothing, and asked for `AUDIT: PASS` or `AUDIT: FAIL`. Findings were fixed with tests, recorded in `docs/AUDIT-V2-ROUND-N.md`, and a NEW fresh auditor was started on the new code. The target was **two consecutive PASS**.

## The nine rounds
| Round | Result | Main finding |
|---|---|---|
| 1 | FAIL | An AI game key had a person's powers; rollback failed open; a Host key without details saw winners' contacts |
| 2 | FAIL | Game-only Host keys used up the account's five Host places |
| 3 | PASS | none blocking |
| 4 to 7 | FAIL | Keys and ids reaching existing routes the gate did not see: the audit log kept typed reasons, a payment id opened the public receipt, request-body keys, a Host key sent in a Google sign-in body |
| sweep | | After round 7, one systematic sweep replaced hole-by-hole fixing: one key resolver, a table of every route, and a test that walks it. It found and fixed the Google body-key hole and a game key making a practice game |
| 8 | PASS | three minor points, two fixed |
| 9 | PASS | no blocking defect (second in a row) |

## Run the full suite, one file at a time
The development laptop has little free memory, so no single process runs everything. Run each test file by itself:

```bash
# one file
bun test apps/edge/test/v2-keys.test.ts
```

For the whole suite, loop over every `*.test.ts` under `packages`, `apps` and `tools`, run `bun test <file>` for each as its own process, and record the pass and fail counts per file.

The V2 files are `v2-keys, v2-host, v2-receipts, v2-certs, v2-export, v2-ai-label, v2-support, v2-claims, v2-join-id, v2-ai-key, v2-audit-copy, v2-round5, v2-host-body-key, v2-route-walk, v2-round8` under `apps/edge/test`, and `apps/web/test/v2-pages.test.ts`. `v2-route-walk` takes about a minute. One test (`ai-enablement`, "third route") already fails on the live version.

## Roll back
See [06-DEPLOY-AND-ROLLBACK.md](06-DEPLOY-AND-ROLLBACK.md). In short: run `deploy/ROLLBACK_V2.sql` (it switches off every V2 key), roll Pages back to the recorded deployment, run the SQL again.
