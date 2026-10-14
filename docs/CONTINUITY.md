# Continuity: backups, restore, incidents (short)

Corporate Tambola runs on free Cloudflare services: Pages (site and API), D1 (database), a one-minute cron Worker, Resend (e-mail). Source is in this git repository (local; no remote yet). DRAFT FOR LAWYER REVIEW where it touches promises.

## What can fail, and what to do
| Failure | Effect | First step |
|---|---|---|
| Cloudflare Pages down | Site and API unreachable. Phones that already loaded a game keep playing offline; they cannot join, vote or fetch results | Wait; check Cloudflare status. Nothing to do on our side |
| D1 unavailable or over its free limit | Joins and writes answer a friendly "busy" (503). Reads may still work | Check usage; the Worker already refuses new work before the daily limit |
| Cron Worker stopped | Deletion and end-of-game reports stop. The daily housekeeping still runs on organizer requests | Redeploy the cron Worker (see `corporate-tambola-state` notes); run `POST /api/lifecycle/tick` with the cron key once |
| Resend down or key revoked | No e-mail (sign-in codes, AI links, reports) | Set a new `RESEND_API_KEY` (`docs/compliance/KEY_RUNBOOK.md`) and redeploy |
| A secret leaked | See `docs/BREACH_RUNBOOK.md` | Rotate, redeploy |
| Bad deploy | Pages keeps every old deployment | In the Cloudflare dashboard, roll back to the previous deployment |

## Backups
* D1 keeps point-in-time history (Time Travel) for a limited window on the free plan. Export a copy any time: `wrangler d1 export corporate-tambola --remote --output backup.sql` (the file holds sealed names and numbers; keep it private and delete it after the restore drill).
* The code and migrations are in git. Secrets are in Cloudflare and in `config/live-secrets.txt` (git-ignored, on the owner's laptop). Keep a second private copy of that file (password manager). Without `DATA_KEY` sealed rows cannot be opened.
* We make no promise about how long Cloudflare keeps that history, and the pages say nothing about a backup period. If a backup process of our own is built, say so on the Privacy page and in the data map first.

## Restore drill (do twice a year, on a scratch database; never on the live one)
1. `wrangler d1 create corporate-tambola-drill`.
2. Apply every file in `apps/edge/migrations/` in order: `wrangler d1 execute corporate-tambola-drill --remote --file apps/edge/migrations/000N_....sql`.
3. Export the live database as above and import it into the drill database: `wrangler d1 execute corporate-tambola-drill --remote --file backup.sql`.
4. Point a throwaway Pages preview (not production) at the drill database and the real `DATA_KEY`; sign in with a test organizer; open a draft; confirm the summary reads.
5. Note the time it took and what was missing. Delete `corporate-tambola-drill` and the export file.
6. Record the date and result in this file.

| Date | Result | Notes |
|---|---|---|
| (none yet) | not run | The drill is written; run it before relying on a restore |

## Who does what
* The owner decides, the AI assistant does the work, a lawyer decides on notices.
* Customer message in an outage: one line on the home page notice board (`POST /api/notices`, platform key).
