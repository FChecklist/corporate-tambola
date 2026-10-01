# Running Corporate Tambola on this laptop (everything local)

Nothing here uses a cloud account. Data lives in `C:\ct\tambola\data\` (SQLite file, dev mail outbox).

## Start the system
```
cd C:\ct\tambola
bun install                                   # once
bun run dev                                   # server + website on http://localhost:8787  (4-second gap between numbers; edit TAMBOLA_GAP to change)
bun run seed                                  # creates a ready demo engagement and prints every link (also data/seed.json)
```
Open http://localhost:8787 (website), log in with the printed organizer email (the 6-digit code is shown on screen in local test mode and saved in `data/outbox`).

## Tests
```
bun test packages                             # engine + shared unit tests (40)
bun run sim                                   # 100-participant full-cycle simulation against a FAST server (see below)
```
Simulation needs a fast server in another terminal:
```
set TAMBOLA_FAST=1&& set TAMBOLA_DATA=C:\ct\tambola\data-sim&& bun run apps/server/src/index.ts
bun run tools/sim/run.ts
```
It runs the full cycle through the real HTTP and WebSocket interfaces: organizer buys and logs in, sets up a 2-ticket engagement with 4 Full Houses and 2 Two-Ticket Houses and 3 brand breaks, uploads 100 participants, appoints 2 Hosts and 4 Team Leads, passes, family, waiting room, second-phone alerts, start, ~84 numbers called with bots claiming (including cheaters and late claims), emergency pause, end, report, privacy audit of every message, purge.

## Environment switches (server)
| Variable | Meaning |
|---|---|
| `PORT` | default 8787 |
| `TAMBOLA_GAP` | milliseconds between AI-called numbers (default 10000) |
| `TAMBOLA_FAST=1` | test speed: 120 ms gap, short claim windows (for the simulation) |
| `TAMBOLA_DEV=0` | production-like: no login code returned in responses, free-mail addresses refused, no dev routes |
| `TAMBOLA_DATA` | data folder |
| `TAMBOLA_IP_LIMIT` | joins per network address per 10 minutes (default 1000 locally) |
| `TAMBOLA_PURGE_MS` | when ended engagements are purged (default 24 hours) |

## What is a stand-in for Cloudflare
| Local | Production plan |
|---|---|
| `apps/server` (Bun, in-memory engine per engagement, SQLite snapshots, timers) | Worker + GameRoom Durable Object (alarms) + D1 |
| dev mail outbox in `data/outbox` | transactional email provider |
| fake always-succeeds payment in `/api/checkout` | Razorpay / Stripe |
| browser speech synthesis fallback for numbers | pre-recorded clips cached on each device (decision pending on the voice) |
