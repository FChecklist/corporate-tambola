# Keys and secrets (G-06)

Where they live: Cloudflare Pages secrets for project `corporate-tambola` (production), and `config/live-secrets.txt` + `config/platform-key.txt` on the owner's laptop (git-ignored, never committed).

| Secret | Used for | If it is lost or changed |
|---|---|---|
| `DATA_KEY` | Seals names and mobile numbers (AES-256-GCM) and the organizer e-mail and lasting AI key kept for mail | Sealed rows cannot be opened again. Do NOT rotate while engagements hold participants. |
| `PHONE_SALT` | Hashes mobile numbers (one ticket per number, partner codes, change of phone) | Hashes stop matching: a participant who comes back is a new person; partner logins by number break. Safe only when there are no live games and no partners. |
| `ORGANIZER_SECRET` | The platform key (can mint organizers, read all AI audit). Also derives nothing else when `DATA_KEY` is set | Old key stops working at once. Update the tools that use it. |
| `CRON_KEY` | The one-minute job that runs deletion | The job gets 403 until the same value is set in the cron Worker. |
| `INBOUND_SECRET` | Mail-to-us deletion requests | Requests are refused until the mail webhook is updated. |
| `REPORT_KEY` | Telemetry report page | Reports unreadable until updated. |
| `RESEND_API_KEY` | Sending e-mail | No mail goes out (a failed mail is not retried when it carries a link). |
| `STRICT_KEYS=1` | Switch: the Worker answers 503 to everything unless `DATA_KEY`, `PHONE_SALT`, `ORGANIZER_SECRET`, `CRON_KEY`, `INBOUND_SECRET` are all set | Remove the switch to run without it (only for local work). |

## Rotation on 2026-10-05

* `ORGANIZER_SECRET` and `PHONE_SALT` were rotated (they had been committed once, in commit `37a9181`). The old values no longer work.
* Impact checked first on the live database: 13 test participants, 0 partners, 0 payments, so changing `PHONE_SALT` broke nothing real. If real games or partners exist, do not rotate the salt.
* The Worker no longer falls back to built-in constants: with `STRICT_KEYS=1` it refuses to run when a secret is missing; the report-link key no longer falls back to the word "ct".
* Method: `wrangler pages secret bulk <json> --project-name corporate-tambola`, then redeploy (Pages applies secrets on the next deployment). Verified: the new platform key is accepted (200), a wrong one is refused (403).
* Not rotated (owner action in the vendor dashboard): the shared full-access Resend key copied from the DPDP product. Create a send-only key for Tambola and set it as `RESEND_API_KEY`.

## History scrub

The local repository has no remote. The two commits that held the secret files were rewritten out of every commit with `git filter-branch` (files `config/platform-key.txt`, `config/live-secrets.txt`). Safety steps: tag `pre-scrub-2026-10-05` keeps the old history; the rewrite was done on branch `scrub-rewrite`; the working trees were compared (identical); the old secret values were searched for in the new history (found in 0 commits; found in 2 commits of the old). `master` now points at the scrubbed history. The tag and `refs/original/` still contain the (now retired) old secrets: delete them with `git tag -d pre-scrub-2026-10-05`, `git update-ref -d refs/original/refs/heads/scrub-rewrite`, `git gc --prune=now` when you are sure. The worktree `C:\ct\tb-wt-ai` (branch `feat/ai-link-and-pause`) still has the old history.
