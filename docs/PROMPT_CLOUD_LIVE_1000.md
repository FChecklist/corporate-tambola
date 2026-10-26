# Prompt for a cloud session: live end-to-end games on corporatetambola.com (250 x 4 scenarios, then 1,000 x 2)

Copy into `start_session` (target cloud, repository FChecklist/corporate-tambola). Start it only after the release has been deployed and nothing else is loading the live site.

```text
TASK: play real, whole games on the LIVE Corporate Tambola site from this cloud sandbox, one at a time, and report exact numbers. You may NOT change product code, the site's mode or settings, or anything in Cloudflare/GitHub other than pushing your result files to a new branch. No payments: the account below is the owner's Rs 0 test account.

SITE AND ACCOUNT
- Site: https://corporatetambola.com . If it answers 403 to this sandbox (bot rules for datacenter addresses), use https://corporate-tambola.pages.dev instead and say so.
- Organizer sign-in (test login, no e-mail is sent): e-mail demo1@xyz.in , then the 6-digit code 123456. This account may create games of up to 1,000 people at Rs 0 (published without payment). Use only this account.

SETUP
1. git fetch origin cloud/test-tools (or the newest release branch the owner names) and check it out; read tools/load-tests/README.md and port the Windows paths in COPIES under tools/load-tests/ (data dir -> ./data, undici and playwright imports). Install Node 22+, npm i undici playwright, npx playwright install --with-deps chromium.
2. The scripts: tools/load-tests/ui-game.mjs plays a whole game by clicking: the organizer builds and publishes through the 10 console steps in real Chromium, a few people play on real phone-size pages (--real N) and the rest on protocol phones that run the real phone game code (tools/load-tests/nodephone.mjs; on an https site it adds our own beacon relay automatically).
   Example: BROWSER=chromium SITE=https://corporatetambola.com node tools/load-tests/ui-game.mjs --tag C250-1 --login demo1@xyz.in --cap 250 --players 250 --real 6 --mode host --speed 9 --aud 1 --lead 12
   Flags: --mode auto|host (host = manual: the organizer presses Next number), --speed 9|12 (seconds between numbers in auto), --aud 1 employees only with employee ID (the script uploads a CSV and the people use their IDs) or 5 anyone with the link, --lead minutes until the start.

THE GAMES (strictly one at a time, never two at once; wait for each to finish; pause 5 minutes between games):
 1. C250-1: 250 people, manual, employees only + employee ID (--mode host --aud 1)
 2. C250-2: 250 people, manual, anyone with the link (--mode host --aud 5)
 3. C250-3: 250 people, auto 9 s, employees only + employee ID (--mode auto --speed 9 --aud 1)
 4. C250-4: 250 people, auto 12 s, anyone (--mode auto --speed 12 --aud 5)
 5. C1000-A: 1,000 people, auto 12 s, anyone (--cap 1000 --players 1000 --real 6 --lead 18)
 6. C1000-M: 1,000 people, manual, employees only + employee ID (--cap 1000 --players 1000 --real 6 --mode host --aud 1 --lead 18)
For the 1,000 games watch the sandbox's memory (1,000 protocol phones need about 1 GB); if it cannot hold them, use as many as fit and say how many.

WHAT TO REPORT PER GAME (from the script's own checks plus what you observe): how many of the people joined, how long joining took, every refused or failed request with its status, numbers called and whether every page showed the same numbers in the same order, whether all pages showed the same winners, that exactly the configured prizes were awarded, tickets different and well formed, any page error or 5xx from our site, the game id and start/end times. For AUTO games also measure the timer: open the public big-screen page (https://SITE/big.html?e=<game id>) in a separate headless page and record the moment each new number appears; report the average, smallest and largest gap (target exactly 9.0 or 12.0 seconds) and how many gaps fell outside +/-0.7 s. For MANUAL games report the time between the organizer's press and the number appearing on the phones (median, 95th percentile, worst).
If more than 1% of requests to our site fail with 5xx, or joins are refused for being busy, STOP and report at once instead of continuing to load the live site.

DELIVERABLES: commit your result files (no node_modules) to a NEW branch cloud/live-results-<date> and push it; final message: a table (game, people joined, numbers consistent, winners consistent, prizes, timer or press statistics, errors) and an honest list of what failed or could not be run and why. Never claim a pass you did not observe.
```
