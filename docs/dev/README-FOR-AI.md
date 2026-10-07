# README FOR AI: start here

You are about to work on **Corporate Tambola** (repo root `C:\ct\tambola`). Read `INDEX.md` next; it lists these documents in reading order.

## Rules

1. **Trust code over docs.** These docs were written by reading the code on 2026-10-07; older documents under `docs/` are partly stale (`KNOWN-DOC-DRIFT.md`). If a doc and the code disagree, the code is right: fix the doc (and add the drift to `KNOWN-DOC-DRIFT.md` if you cannot).
2. **Verify before you assert.** Open the file at the cited `path:line` (lines drift; search for the quoted string). Cheap checks: `git status`, `git ls-files`, `grep -n "<route>" apps/edge/src/worker.ts`, `bun test <one file>`.
3. **Another agent may be editing the same files** (`apps/edge/src/worker.ts`, `apps/web/public/zc.*`). Re-read a file right before you edit it, keep edits small, never revert changes you did not make.
4. **Do not commit, push or deploy unless the owner asks.** Never deploy to the live site as a test. `tests/e2e/run-live.mjs` touches the real site: do not run it casually.
5. **Never write, read aloud or log a secret value.** Secret files exist on the laptop (`config/live-secrets.txt`, `config/platform-key.txt`, `config/telemetry-report-key.txt`, `.env*`): do not open them. Names of variables are documented in `10-OPERATIONS.md`.
6. **8 GB RAM laptop shared with other sessions**: run targeted tests only, follow the lock protocol in `C:\ct\HEAVY_JOB_PROTOCOL.md` for builds, browsers and large test runs (`10-OPERATIONS.md` section 3).
7. **Plain words for the owner**: the owner is non-technical; user-visible text is short, soft and never over-claims (banned words list in `12-CHANGE-GUIDE.md`).
8. **Winners and numbers must stay un-choosable**: no route may let a person (organizer, host, co-host, AI, or us) set or change a number, ticket or winner. `packages/beacon` logic is shared by phones and server; changing its constants changes every game (`12-CHANGE-GUIDE.md` gotcha 12).

## Orientation in 30 seconds

- Product: tambola for company events on guests' phones; organizer builds, publishes (free), pays before start, shares one link. Numbers from the public drand beacon; winners by phone quorum (`00`, `01`).
- Backend = one function `handle()` in `apps/edge/src/worker.ts` (Cloudflare Pages Functions + D1). Shared brain = `packages/beacon`. Static site = `apps/web/public`, shipped by the whitelist in `pages/build.mjs`.
- Roles: Organizer (`ctk_`), Host (`cth_`, max 5), Co-host (`ctc_`), AI (`cta_`), partner (`ctp_`), platform key (`05`).
- Legacy (not deployed): `apps/server`, `packages/engine`, `play/screen/console/confirm` pages.

## How to verify these docs

```
cd C:\ct\tambola
node tools/check-dev-docs.mjs          # paths, routes, tables, file map, index
bun test apps/edge/test/migrations.test.ts   # migrations equal SCHEMA (needs bun on PATH: C:\Users\Dell\AppData\Roaming\npm)
```

Known not-yet-final area: the organizer console (`zc.html/js/css`) is being rewritten; see "RE-VERIFY AFTER CONSOLE REWRITE" at the end of `09-FRONTEND.md`.
