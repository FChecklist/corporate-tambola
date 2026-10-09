# Corporate Tambola: developer documentation (index)

Written 2026-10-07 by reading the real code. If you are an AI, read `README-FOR-AI.md` first (it is short), then this index. **Trust code over docs.** Everything here carries `path` or `path:line` references that `node tools/check-dev-docs.mjs` verifies.

## Suggested reading order

1. `README-FOR-AI.md`: how to use these docs, how to verify claims.
2. `00-OVERVIEW.md`
3. `01-ARCHITECTURE.md`
4. `02-FILE-MAP.md` (look things up, do not read linearly)
5. `05-ROLES-AND-PERMISSIONS.md` then `04-API-REFERENCE.md`
6. `03-DATABASE.md`
7. `06-BUSINESS-LOGIC.md`, `07-FLOWS.md`
8. `12-CHANGE-GUIDE.md` before editing anything
9. `10-OPERATIONS.md`, `11-TESTING.md` before running or deploying anything
10. `08-SITEMAP.md`, `09-FRONTEND.md`, `13-AI-INTEGRATION.md` as needed
11. `KNOWN-DOC-DRIFT.md` before trusting any older document under `docs/`

## Documents

| File | One line |
|---|---|
| `README-FOR-AI.md` | Start here: rules for an AI working on this repo, and how to verify a claim |
| `INDEX.md` | This file |
| `00-OVERVIEW.md` | What the product is, who uses it, price packs, zero-cost architecture in 6 lines, glossary of every term |
| `01-ARCHITECTURE.md` | Components, request path and data-flow diagrams, trust model, security and privacy design, local vs production |
| `02-FILE-MAP.md` | Every file in the repository with its purpose and who uses it (generated list, hand-described) |
| `03-DATABASE.md` | All 50 D1 tables + `telemetry`, columns, writers/readers, retention, migrations 0001-0015 and how to apply, ER diagram, `kv` key families |
| `04-API-REFERENCE.md` | Every HTTP route: auth, request, response, errors, side effects, D1 write cost, handler line; the `/ai/<key>` link routes |
| `05-ROLES-AND-PERMISSIONS.md` | Key kinds and prefixes, how auth is resolved, permission matrix, Host vs Organizer-only, Co-host and AI limits, invitations rule, payment by any role |
| `06-BUSINESS-LOGIC.md` | Every rule (pricing, payment, draft/publish/lock, commissions, brand moments, lucky draws, rounds, tickets, quorum, deletion clocks, tracking, audit) with where and which test proves it; known weaknesses |
| `07-FLOWS.md` | Mermaid flows: organizer journey, guest journey, AI link (3 ways), Host/Co-host, payment, lifecycle tick, winner quorum, demo, invite chain |
| `08-SITEMAP.md` | Every public page: purpose, audience, scripts, styles, API calls, CSP class, indexable; navigation tree; console screen map |
| `09-FRONTEND.md` | How each page script works, bundles and rebuild rule, service worker and cache-bump rule, build step, AI helper shield, hooks, and the "RE-VERIFY AFTER CONSOLE REWRITE" TODO list |
| `10-OPERATIONS.md` | Environment variables and secrets (names only), local dev, tests and RAM rules, known failing tests, deploy recipe, monitoring, owner-only items, free-plan limits, incident runbooks |
| `11-TESTING.md` | Which test covers which feature, use-case mapping, how to add tests, mutation-check practice |
| `12-CHANGE-GUIDE.md` | "If you want to change X, edit these files and run these tests", plus the gotchas and traps |
| `13-AI-INTEGRATION.md` | How outside AI assistants are supported: link kinds, manual, FUNCTIONS, FACTS, trust page, audit, what an AI can never do |
| `KNOWN-DOC-DRIFT.md` | Contradictions between older docs/comments/tests and the code |

## Verification

`node tools/check-dev-docs.mjs` checks: every backticked repo path exists (and `:line` is inside the file), every route string in `apps/edge/src` is in `04`, every table in `03`, every file in `02`, and that this index lists every document. Re-run it after every edit of these docs or of the repository layout.

## Existing documents reused (verified, with exceptions in `KNOWN-DOC-DRIFT.md`)

`docs/ROLES_AND_CONSOLE_SPEC.md` (owner-approved roles and console spec), `docs/AI_LINK.md`, `docs/PRIVACY_AND_LIFECYCLE.md`, `docs/WINNERS_AND_AUDIT.md`, `docs/TEST_AND_LIVE_MODE.md`, `docs/ZERO_SERVER_DESIGN.md`, `docs/USE_CASES.md`, `docs/CONTINUITY.md`, `docs/BREACH_RUNBOOK.md`, `docs/compliance/KEY_RUNBOOK.md`, `docs/E2E_FINDINGS.md`.
