# Changelog: Corporate Tambola

Reconstructed on 20 Nov 2026 from git history, tags and the live `/version.json` (https://housie.corporatetambola.com/version.json). Before this file there was no changelog and no version policy; entries below the live one are approximate (dates from tags and commits). Unknown values are written "unknown", not guessed. From now on follow the standard: marketing-ledger plans/VERSION-AND-KNOWLEDGE-STANDARD-2026-11-20.md section 2.2 (newest first; Added/Changed/Fixed; what, where, PR, two audit PASS ids, rollback id).

## Live now
Version 1.9.0; commit `be7e4da0e124`; built 2026-11-16 17:28 UTC (22:58 IST).

## History (newest first)
- 1.9.0 (live, built 2026-11-16 17:28 UTC, commit be7e4da; tag frozen-1.9.0 = 646010d on 2026-10-31 is the engine copy source). Merged to master on 16 Nov 2026 (PR titles are branch names): #9 rc/tambola-runner-2026-11-05, #11 t99/setup-path-2026-11-13, #16 boss16/tambola-ci-2026-11-16 (CI), #17 boss16/tambola-security-2026-11-16 (security), #20 boss16/stack-3b-v2-noterms (v2 terms-free stack). Where: apps/edge, pages/, tools/, tests. Audit ids: unknown. Rollback id of the previous deploy: unknown.
- 2026-11-14: docs/knowledge map (#15). KNOWLEDGE-MAP.md.
- 2026-11-01 tags: tambola-private, tambola-double-pay (pay, 58d6d34), tambola-no-erase (1331b09), tambola-cache 2026-10-31 (b588f03).
- 2026-10-30 tags: v1.7.0 (e3c2365), v1.7.1 (8eddbde), v1.8.0 (c28b42c), v1.8.2 (a2f4b99), v1.8.3 (751df6c).
- 2026-10-23 sign-in redesign (e-mail first, 6-box code), one door sign-in, tools. 2026-10-22: real housie claims, AI guided path, protection headers, manual. Details: `git log` and docs/DEPLOYS.md.
