# Gap analysis: the error log request, 2026-10-20

The owner asked for: (1) every error in the real working captured automatically with a complete report; (2) every game monitored from start to end; (3) every action monitored; all of it done on the user's phone or laptop and not on our server; all logs kept; an AI the owner starts to fix each error and say what it changed, with file paths; an automatic process; no AI inside the product.

Rule used: a row says DONE only when a named test or file proves it. Not-done and owner-only items are listed at the end.

## 1. What existed before

| Piece | What it really did | Limit |
|---|---|---|
| `rum.js` -> `/api/telemetry` | Page views, speed, JavaScript errors, failed or slow calls, as 200-character snippets, at most 30 per page load, counted and grouped in a plain-text report | No stack, no device, no trail of actions, no game or stage, no way to mark an error fixed |
| Worker 5xx counter (`admin.ts`, `countError`) | Counts server errors in 10-minute buckets for the health alarm | The exception itself was thrown away (`catch (e)` ignored `e`): no route, no message, no stack |
| `v.js` visit tracking | Which sections of the public pages were seen | Marketing analytics only; not on the game screens |
| Owner desk error view | Errors per hour | Counts only |
| Uptime check (GitHub, every 15 minutes) | Site down or up | Says nothing about an error inside a working page |

## 2. Gaps and what was done

| # | Requirement | Gap found | Fix | Proof |
|---|---|---|---|---|
| G1 | Every error captured with a complete report | Only a 200-character snippet; nothing to act on | `apps/web/public/blackbox.js` builds one complete report on the device: message, stack, page, role, game, stage, device summary, trail of the last 40 actions, release version | `blackbox.test.ts` "an error becomes one complete report..." |
| G2 | Every kind of error | Calls refused or very slow, console errors and files that failed to load were not reported as errors | Script errors, promise failures, console errors, failed files, 5xx, calls that never arrived, refusals (401, 403 and other 4xx except 404 and 409), calls over 8 s all become reports with a severity (`error` or `warn`) | `blackbox.test.ts` "a server error and a call that never arrived..." |
| G3 | Errors on our own side | Exception discarded; only a counter | `apps/edge/src/errorbox.ts` stores route, method, status, name, message and stack (cleaned) for every thrown error and every 5xx the Worker answers; wired into the front door | `blackbox.test.ts` "server-side errors" |
| G4 | Every game start to end | Errors carried no game or stage; nothing recorded when a game ended | Reports carry the game and its stage (the player screen reports each stage change via `window.ctzView`); the end of a game sends a short summary from devices that had errors, and from one in twenty healthy devices | `blackbox.test.ts` (stage in report), `z.js` hook checked by "the pages carry the recorder" |
| G5 | Every action | No record of what the person did before an error | Rolling trail on the device: taps (control only), changes (control only), page opened, hidden or closed, online or offline, game stage, every call with status and time | `blackbox.test.ts` first test |
| G6 | On the user's device, not our server | Server aggregated everything | Capture, trail, report building, de-duplication (once per error per visit, at most 6 per visit) and offline queue all run on the device; the server only stores a finished report in the existing free D1 | `blackbox.js` (no server round trip until an error); daily caps in `blackbox.ts` |
| G7 | Nothing identifying is stored | Risk if reports carried text | Never reads typed text, button words, query strings, cookies or storage; scrubs phone numbers, e-mail, keys and tokens on the device and again on the server; no IP stored | `blackbox.test.ts` "a phone number, an e-mail..." and "what is stored is cleaned again on the server" and "never reads what a person types" |
| G8 | Reports must not be lost offline | Beacons lost offline | Reports queue on the phone (`ctz-bbq`, at most 8) and go when it is online again; listed in the storage registry and on the Privacy page | `blackbox.test.ts` "offline..." and `storage-notice.test.ts` |
| G9 | All logs kept | Telemetry kept 90 days, no grouping | Groups kept until fixed + 90 days after last seen; up to 4 full samples per error kept 90 days; repeats counted, never dropped | `blackbox.test.ts` "keeps at most four samples" (count reaches 15) |
| G10 | AI addresses each log when the owner wants | Nothing | `tools/errorlog/pull.mjs` writes one plain report per open error; `docs/ERROR_FIX_PLAYBOOK.md` is the AI's job; one sentence starts it | the files; used end to end in the live check below |
| G11 | AI says what it did, with file paths and the fix | Nothing | `tools/errorlog/resolve.mjs` refuses unless files and a note are given; stores them in the box and appends `errors/FIXED.md` | `blackbox.test.ts` "fixing: the owner's AI must name the files..." |
| G12 | Automatic process | Manual | Capture and storing are automatic; the fix run starts when the owner says one sentence, or on a schedule the owner asks their AI to create | `docs/ERROR_LOG.md` |
| G13 | An error that comes back | A fix could silently fail | A fixed error that appears again 15 minutes after the fix is **reopened**, with the earlier fix kept on record | `blackbox.test.ts` same test |
| G14 | AI not in the product | - | Nothing in the product calls an AI; the AI is the owner's own session | search: no AI call in `blackbox.js`, `blackbox.ts`, `errorbox.ts` |
| G15 | Game screens had no monitor at all | `demo.html` and `preview.html` lacked even `rum.js` | The recorder is on every page that has the speed monitor, plus demo and preview, and always loads before it | `blackbox.test.ts` "every built page that reports page speed also runs the recorder" |
| G16 | Offline copy of the game must include the recorder | A page saved for offline use would miss it | `/blackbox.js` added to the offline saved set; cache version bumped to v26 | `pwa.test.ts` |

## 3. Found along the way and fixed in the same pass

- A flaky test, `param-life.test.ts` "a wrong key never opens the report": it built a "wrong" key by changing the last character to `0`, which is the real key about one run in 16. Now always different.
- The home page's colour dots covered the brand name on phones, and the information pages' header was crowded (WhatsApp and Back wrapped); fixed in `site.css` (live).

## 4. What is not covered, said plainly

| Item | Status | Why |
|---|---|---|
| A device with no connection that is then closed for good | Report waits on that phone; lost if the phone is never opened again | Nothing can send from a switched-off device |
| A page that never loads at all | Not seen by the recorder | Covered by the 15-minute uptime check and the server-side error capture |
| Other games (Bingo, Tic Tac Toe, Snakes and Ladders, Luck by Chance) | **Not yet done** | Separate sites and repositories. The steps are written in `docs/ERROR_FIX_PLAYBOOK.md` ("Putting the error log into the other games") |
| Scheduled automatic fixing | Owner choice | It needs the owner's AI session to be asked to run on a schedule |
| Battery and data use | Small by design | No polling, no background timers except one 4-second check for waiting reports; a report is under 14 KB and is sent only when something goes wrong |
| Human judgement on what a fix should be | AI proposes, tests prove, owner decides to deploy | The playbook forbids deploying or pushing without the owner's yes |
