# Click-only real-browser tests

Whole games played only by clicking and typing in real browser pages (no API set-up): the Organizer signs in, builds the game through the 10-step console, publishes; players open the link on phone-sized pages.

    BROWSER=chrome|chromium|webkit SITE=https://corporatetambola.com node tools/browser-tests/ui-game.mjs --tag U1 --login demo1@xyz.in --cap 10 --players 10 --mode auto --lead 9

- `chrome` is the installed Chrome; `chromium` and `webkit` are Playwright's own builds (Playwright 1.63; `ui-lib.mjs` loads it from `C:/ct/ct/dpdp-app`, change the path for another machine).
- On the live site use the test logins `demo1/2/3@xyz.in` (code 123456, no mail is sent). Nothing is paid; the Rs 0 game is for up to 10 people.
- `deploy_tambola_live.ps1` builds and deploys to Cloudflare Pages (token read from `C:\ct\ct\.env.local`, never stored here).
