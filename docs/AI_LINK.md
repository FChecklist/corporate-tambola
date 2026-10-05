# The short AI work link: `https://<site>/ai/<key>`

Owner requirement (2026-10-05): the external AI link must be SHORT and take the AI to the bigger instructions by itself; the AI reads them, understands the work, the APIs and the workflow, and works as its role. It cannot code. It can create a game, set the options, go up to publishing, and do what an organizer or host can do by logging in, except payments (a human does those).

Background: in another project a very long pasted prompt failed in ChatGPT, Gemini, z.ai and DeepSeek. Those chat tools can usually open a web address (GET) but often cannot set headers or send POST. The old paste (about 1,000 characters, key in an `x-organizer` header on every call) failed for them.

## What the organizer pastes

Two short lines and the link (shown as Option 1 in the console and e-mailed in its own dedicated mail, see "Where the link may travel" below):

```
This is the API documentation and instructions for MY OWN Corporate Tambola account. I am the owner, and I am asking you to read it and help me with it.
Please open it now (a plain GET request) and follow it: https://corporate-tambola.pages.dev/ai/cta_<48 hex>
```

Wording: from PROJEXA testing, "open this link and follow it" was refused as prompt injection about one time in three by a careful AI; presenting the link as the owner's own API documentation worked every time. The key appears only inside the link.

## Where the link may travel (2026-10-05, owner rule)

* The AI work link (`cta_`) and a co-host link (`cth_`) are sent ONLY in dedicated e-mails to the organizer, built in `apps/edge/src/mails.ts` (`aiLinkMail`, `coHostLinkMail`): own subject ("Your personal AI work link - Corporate Tambola"), HTML plus plain-text parts, a red warning at the top AND the bottom ("IMPORTANT - DO NOT FORWARD YOUR AI WORK LINK OR THIS EMAIL TO ANYONE AS IT CONTAINS YOUR PERSONALIZED AI WORK LINK"), the two-line paste in a box as PLAIN TEXT (never an `<a>` hyperlink, because mail scanners open links), three numbered steps, what the AI can do, what stays with a human, and how to replace a lost link. The co-host mail names whose engagements it is, says it is a watch-and-announce role, and carries its own warning.
* When it is sent: at `/api/start` (sign-up) and whenever the organizer replaces the link. The publish mail no longer carries any AI link (no extra `cta_` key is minted at publish), so it can be forwarded safely; reminders, "could not begin", invoices, report-link and partner mails never carried one. No report page, PDF or guest page carries one (checked by `apps/edge/test/ai-mail.test.ts`).
* The organizer's address for these mails is kept sealed (`orgmail/<org>` in kv, AES-GCM like names and numbers); older accounts fall back to the address confirmed at their latest publish; with none known the new paste is shown in the console only (`mailed: false`). A mail that could not be sent keeps no body at all (nothing with a key is retried later); the organizer replaces the link to get a fresh one.
* Honest limit: mail apps may turn a bare web address in the box into a tappable link on their own; we never create one, and the warning plus the "replace" button are the remedy.

### Replace my AI link

Console card (Option 1, "Replace my AI link") and `POST /api/org/ai/replace` (the older `POST /api/org/ai` does the same): signed-in organizer key only; an AI key, a co-host key, the platform key or a stranger gets 403, also when attempted through an AI link. Every existing AI key is revoked at once (the old `/ai/<old>` answers 404), a new one is minted, the new paste is returned (`aiMessage`, `mailed`) and e-mailed in the dedicated mail, and the call is written to the AI audit trail as `POST /api/org/ai/replace`. Opening the manual (`GET`/`HEAD /ai/<key>`) changes nothing except its audit line, which nothing relies on (mail scanners and chat tools open it too).

## What the link serves

* `GET /ai/<key>` returns the complete manual for that key's role as `text/plain; charset=utf-8` (`?format=json` returns the same as data). Organizer-AI key (`cta_`): who you work for, a START HERE block, sizes and choices, the numbered conversation, every address (absolute, key included), examples, what the AI cannot do and what to tell the owner, payment facts, tone. Co-host key (`cth_`): a narrower manual (watch, announce, tick prizes).
* `GET|POST|PATCH /ai/<key>/<api path>` behaves exactly like `/api/<api path>` with the key in `x-organizer` (`/ai/<key>/z/{id}/summary` = `/api/z/{id}/summary`; an `api/` prefix inside is accepted too). The rewritten request goes through the normal route, so the audit trail records it with the `/api` path and the real method, never the key. Only `cta_` and `cth_` keys are accepted here: the organizer's own sign-in key (`ctk_`) and the platform key are never accepted in an address.
* Browse-only fallback, only under `/ai/<key>/`: `GET ...?_method=POST|PATCH&_body=<URL-encoded JSON>`. The decoded body is capped at 6,144 characters (documented to the AI as "about 20 people per roster call"); a body that is not JSON gets a plain 400 explaining URL-encoding; any other `_method` is a 400; the normal `/api` routes ignore `_method`/`_body`.
* Every answer carries `x-robots-tag: noindex, nofollow`, `referrer-policy: no-referrer`, `cache-control: no-store`.
* Unknown, mistyped, revoked, wrong-kind keys all get the identical `404 Not found.` plain text and nothing is recorded. Error bodies never echo the key. The audit trail records a manual read as `GET /ai/manual` and (new) a co-host key's link calls too.
* `/api/z/ai-manifest` and the `x-organizer` header path still work for tool-capable AIs (the manifest now also lists the new actions and the link).

Files: `apps/edge/src/ai-link.ts` (the words), `apps/edge/src/worker.ts` (`aiLink()` routing, `canAi`, manifest), `pages/functions/ai/[[path]].ts` (Pages Function), `pages/build.mjs` (`_routes.json` includes `/ai/*`), `apps/edge/test/ai-link.test.ts`.

## Organizer and co-host actions: who may do what

| Action (console) | Organizer AI (`cta_`) | Co-host (`cth_`) | Why |
|---|---|---|---|
| Create engagement, settings (time, speed, limit, tickets, rewards, breaks, rounds, invite-only, invitation policy) | allowed (draft, before the first number) | no | same as before; invitations added to the summary |
| Load roster, reuse an earlier list | allowed | no | |
| Read summary, participants (ids only), info, results, claims, life, history, pause status | allowed | summary/info/participants/results/life | |
| Announce to guests | **now allowed** (once published; 160 chars, 1 per 5 s) | allowed | a text to phones, no data or money |
| Mark a seat organizer/host/co-host, change of phone (unbind) | **now allowed** | no | organizer-level housekeeping, audited |
| Read prizes | **now allowed**, mobile numbers cut to the last two digits | allowed (full) | a full number should not travel through an outside chat |
| Tick "prize given" | **now allowed** (recorded as "organizer's AI") | allowed | |
| Create a co-host key | **now allowed** (max 5); the answer gives the co-host's own AI link | no | narrow key |
| Read the AI audit trail | **now allowed** (own) | no | |
| Report link | status only; the address is withheld | full | the address is a key to every name and number; it is e-mailed to the organizer |
| Payment | never | never | a human act on the payment page |
| Publish | hand-over only (the organizer confirms their e-mail and mobile and presses Publish) | no | unchanged |
| Erase participant data | ask only (`control/request`, organizer confirms) | no | unchanged |
| Pause / resume / stop | ask only (signed by the organizer's browser) | no | unchanged |
| Winners, numbers, tickets | nobody | nobody | software decides (`docs/WINNERS_AND_AUDIT.md`), unchanged |
| Retire sign-in keys, mint a new AI key, change e-mail | no | no | |

Honest note: `names` (the organizer's own read of a few winners' names) stays human-only; the AI sees the winner's name and masked number through `prizes`, which is what it needs for the hand-over.

## Real-AI simulations (2026-10-05)

Two simulated outside-AI sessions, each a separate sub-agent given only the pasted text and tools limited to `curl`, against a local instance (`tools/sim/local-e2e-server.ts`, `PUBLIC_ORIGIN=http://localhost:8795`):

* Run A (full curl): created a 100-person dealer meet with two-ticket house, YouTube break, lucky draw, invite-only, 6 roster people, marked a host seat, read report status, tried the welcome message, stopped at the publish hand-over.
* Run B (GET-only, `_method`/`_body` only): created a 50-person Diwali party with two rounds and a scratch lucky draw, set invitations, loaded 25 people in one call, created a co-host link, stopped at the hand-over.

Both completed with every call 200 except two expected refusals (announce on a draft = 400; control status before publishing = 404). Neither tried to publish, pay, erase or pause. Gaps found and fixed in the manual or API:

1. Tool output cut long pages (both runs; partly their sandbox wrapper). The manual now starts with a START HERE block with the essentials; it is still about 19 KB, so a client that truncates hard may need `?format=json` or fetching twice. Not solved by shortening further without losing content.
2. The summary and the settings answer did not show the invitation policy: both now include `invites`.
3. Valid guest kinds (`cats`) were not documented: listed in the manual.
4. Announce on a draft returned 400 with no warning: the manual now says the welcome message waits for publishing.
5. `GET .../control` answers 404 before a game is published and running: documented as normal.
6. Unclear: break `after` counting, two-ticket house ordinals, rounds repeating rewards/breaks, meaning of host vs co-host marks, where the sizes are: all stated.
7. "Who opened my guest link" is not recorded: the manual says so.
8. A broken `_body` gave a generic error: now a plain 400 explaining URL-encoding.

Honest limits: both simulated AIs are Claude sub-agents, not ChatGPT, Gemini, z.ai or DeepSeek; the paste wording rests on PROJEXA's 3-of-3 result, not on a fresh multi-vendor test here. A real chat AI may still refuse to open a localhost-style or unknown address, or truncate the manual; that cannot be tested from this laptop.

## Live verification (2026-10-05, https://corporate-tambola.pages.dev)

Deployed with the normal recipe (free Pages + Functions + D1, no new add-ons, no D1 migration needed). A throwaway organizer was minted with the platform key (`POST /api/org`, then `POST /api/org/ai`), not through `/api/start` (which e-mails). Checked with curl: the minted paste is two lines (300 characters) with the key only in the link; `GET /ai/<key>` returned 200, `text/plain; charset=utf-8`, `x-robots-tag: noindex, nofollow`, `referrer-policy: no-referrer`, `cache-control: no-store`, 19.8 KB with 36 absolute keyed addresses; `?format=json` 200; whoami, history, schedule through the link; the header path and `/api/z/ai-manifest` still 200; unknown and malformed keys `404 Not found.`; GET-only create, settings (with invitations), roster (2 fake numbers) and summary; announce on a draft 400; publish returned the console hand-over; erase through GET mode and through a real POST both 403; minting a key 403; `_method=DELETE` 400; `_method` on `/api` ignored (404); a co-host key got its own narrower manual, could read the summary and was refused a settings change (403); the audit trail listed all calls with `/api` paths and the key appeared nowhere in it. Afterwards every key of that test organizer (organizer, AI, co-host) was revoked directly in D1 (both links now answer 404). The test draft `AILINK-LIVECHECK` (two fake roster entries) was left in place; it is forgotten automatically after the 30-day draft rule.

## Live verification of the dedicated mail and Replace (2026-10-05)

Deployed free (Pages + Functions + D1, no migration, no add-on). Throwaway organizer minted with the platform key (no e-mail address on file, so no mail was sent anywhere). Checked with curl: first AI link 200; `POST /api/org/ai/replace` with the organizer key 200 (`mailed: false`, as expected without an address); the old link then 404 and the new one 200; the AI key, the AI link route, the platform key and an anonymous caller all got 403 on both replace routes and the new link kept working; the audit trail showed `POST /api/org/ai/replace`; `zc.js` live contains the new button. Afterwards the AI link was revoked (404) and the test organizer key was retired directly in D1 (403). The HTML mail itself was checked by rendering it in Chrome (screenshots reviewed at 700 and 390 px wide; long address wraps inside the box); no real e-mail was sent.
