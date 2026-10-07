# 08 - Sitemap: every page, who it is for, what it loads, what it calls

Source files: `apps/web/public/*.html`. Shipped set = the `FILES` whitelist in `pages/build.mjs:7` (60 files incl. assets). CSP/robots class = `PAGES` table in `pages/build.mjs:17-21`. "Indexable" = listed in `apps/web/public/sitemap.xml` (9 URLs) and not `noindex`.

CSP classes (`pages/build.mjs:10-13`):
- **PLAIN** (`PLAINCSP`): `default-src 'self'`; scripts `'self'` + Cloudflare Insights; styles `'self' 'unsafe-inline'`; `connect-src` self + drand mirrors + Cloudflare insights + Razorpay hosts; **no frame-src**; `frame-ancestors 'none'`.
- **PAY** (`PAYCSP`): PLAIN + scripts from `https://checkout.razorpay.com` and frames from Razorpay. Only `/pay`.
- **GAME** (`GAMECSP`): PLAIN + `frame-src https://www.youtube-nocookie.com` and `media-src 'self' blob: https:` (break videos/audio). Used by `/z`, `/preview`, `/demo`.
Common headers for every page rule: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`. Both `/page.html` and `/page` spellings get a rule (Pages serves `/z.html` as `/z`, a 308). `*.js`/`*.css`: `Cache-Control: no-cache`; `/img/*` 7 days; `/fonts/*` 1 year immutable.

## 1. Navigation tree (ASCII)

```
https://corporate-tambola.pages.dev
|
|-- /                         index.html        Home: pitch, prices, FAQ, sign-in/create sheet
|   |-- /demo.html            Free demo (real ticket, ~70 s mini-game)
|   |-- /trust.html           Safety, privacy, how it works: the 10 facts (also /llms.txt)
|   |-- /organizer-guide.html How to set up, share, run and close a game
|   |-- /legal.html           Rules, privacy and disclaimer
|   |-- /terms.html           Terms
|   |-- /dpa.html             Data processing terms
|   |-- /subprocessors.html   Sub-processors
|   |-- /partner.html         Refer & Earn (enrol, dashboard)   -- /partner-terms.html
|   '-- /signin.html          Landing of the sign-in e-mail's buttons (single-use link)
|
|-- ORGANIZER AREA (noindex)
|   |-- /zc.html              Console (single page, 9 steps; Co-host 3 steps; partners' screens)
|   |-- /pay.html             Publish and pay
|   |-- /ai-link.html         "Show my AI work link" (fresh 24 h link, replace)
|   |-- /preview.html         Test your brand moment (link tester)
|   '-- /report.html          Engagement report (opens from the e-mailed link)
|
|-- GUEST AREA (noindex)
|   |-- /z.html?e=<id>        Phone game (join, ticket, play, prize confirm)
|   '-- /big.html?e=<id>      Big screen for a projector (numbers + winners only)
|
|-- OWNER ONLY (noindex, not linked)
|   '-- /owner-visits.html    Visitor-journey reports (platform key)
|
|-- /404.html                 Not found
|-- /ai/<key> ...             AI work link (served by a Function, text/plain)  -> /start /map /facts /go /<api path>
|-- /api/...                  JSON API (see 04)
|-- /sitemap.xml  /robots.txt /llms.txt  /manifest.webmanifest  /ct4f9c2e7a1b8d3056ae91c4d7f20b6a38.txt (IndexNow-style key file)
```

## 2. Page table

Columns: file (URL), purpose, audience, scripts then styles it loads (from its own tags), API calls its scripts make, CSP/robots class, indexable?

| Page (file) | Purpose | Audience | Scripts | Styles | API calls | CSP / robots | Indexable |
|---|---|---|---|---|---|---|---|
| `index.html` (`/`) | Landing: what it is, prices (`PACKS`), FAQ, create/sign-in sheet, theme dots; JSON-LD prices equal `PACKS` (tested) | public / prospective organizers | `theme.js`, `pwa.js`, `rum.js`, `v.js`, `common.js`, `site.js` | `fonts.css`, `app.css`, `site.css` | `/api/partner/check?code=`, `/api/payments/status`, `/api/start`, `/api/checkout`, `/api/auth/email`, `/api/auth/verify`, `/api/v/b` (v.js), `/api/telemetry` (rum.js), `/api/notices` (pwa.js) | PLAIN, indexable | yes (priority 1.0) |
| `demo.html` | Free demo: runs the real phone page with scripted numbers | prospects | `audio.js`, `zgame.js`, `demo-config.js`, `demo.js`, `z.js` | `fonts.css`, `app.css`, `z.css` | none (stubbed by `window.__CT_DEMO.api`) | GAME, noindex | no (robots Disallow) |
| `trust.html` | The 10 facts; generated from `ai-facts.ts` (a test fails if stale) | public, search engines, AI assistants | none (no JavaScript by test) | `fonts.css`, `app.css` | none | PLAIN, indexable | yes (0.8) |
| `organizer-guide.html` | Plain guide for organizers | organizers | `rum.js`, `v.js` | `fonts.css`, `app.css`, `site.css` | `/api/v/b`, `/api/telemetry` | PLAIN | yes (0.3) |
| `legal.html` | Rules, privacy and data policy, disclaimer | all | `rum.js`, `v.js` | same | same | PLAIN | yes |
| `terms.html` | Terms (version `TERMS_VERSION` equals page date) | organizers | `rum.js`, `v.js` | same | same | PLAIN | yes |
| `dpa.html` | Data processing terms | organizers | `rum.js`, `v.js` | same | same | PLAIN | yes |
| `subprocessors.html` | Sub-processor list | organizers | `rum.js`, `v.js` | same | same | PLAIN | yes |
| `partner-terms.html` | Partner terms | partners | `rum.js`, `v.js` | same | same | PLAIN | yes |
| `partner.html` | Refer & Earn: enrol with e-mail code, see sales | partners (any person) | `rum.js`, `v.js`, `common.js`, `partner.js` | `fonts.css`, `app.css`, `z.css`, `zc.css`, `partner.css` | `/api/partner/enroll`, `/api/partner/enroll/verify`, `/api/partner/me`, `/api/partner/close` | PLAIN **but `X-Robots-Tag: noindex` in `build.mjs:19`** while `sitemap.xml` and `seo.test.ts` treat it as indexable (inconsistency, see `KNOWN-DOC-DRIFT.md`) | listed in sitemap (0.7) |
| `signin.html` | The sign-in e-mail's buttons open it; a button POSTs the single-use token (GET changes nothing) | organizers | `rum.js`, `v.js`, `signin.js` | `fonts.css`, `app.css`, `z.css` | `/api/auth/link` | PLAIN, noindex | no |
| `ai-link.html` | "Show my AI work link" after e-mail code sign-in; copy, fresh 24 h link, replace | organizers | `rum.js`, `ai-link.js` | `fonts.css`, `app.css`, `z.css` | `/api/auth/email`, `/api/auth/verify`, `/api/org/ai/link`, `/api/org/ai/replace`, `/api/org/ai/fresh` | PLAIN, noindex | no |
| `zc.html` | Organizer console (see section 3) | Organizer, Host, Co-host, partners | `pwa.js`, `rum.js`, `zgame.js`, `control.js`, `zc.js` | `fonts.css`, `app.css`, `z.css`, `zc.css` | see section 3 | PLAIN, noindex | no |
| `pay.html` | Publish and pay (Razorpay Checkout) | Organizer / Host / Co-host | `rum.js`, `v.js`, `common.js`, `pay.js` (+ Razorpay's checkout script from checkout.razorpay.com, injected on demand by `TB.pay` in `common.js:146`) | `fonts.css`, `app.css`, `z.css`, `zc.css` | `/api/checkout`, `/api/payments/status`, `/api/z/{id}/info`, `/api/z/{id}/cohost`, `/api/payments/verify` (via `common.js`) | **PAY**, noindex | no |
| `z.html` | The guest's phone game | guests | `pwa.js`, `rum.js`, `audio.js`, `zgame.js`, `z.js` | `fonts.css`, `app.css`, `z.css` | via `PhoneRuntime`: `/api/z/{id}/info`, `join`, `control`, `seats`, `claims`, `results`, `vote`, `over`; via `z.js`: `invites`, `myprizes`, `confirm` | **GAME**, noindex | no |
| `big.html` | Big screen: numbers and winners only; no sign-in; never joins | a room | `pwa.js`, `rum.js`, `zgame.js`, `big.js` | `fonts.css`, `big.css` | `/api/z/{id}/info`, `control`, `results` | PLAIN, noindex | no |
| `preview.html` | Test a brand moment with a real link, no game (all in the `#` fragment) | organizers | `preview.js` | `fonts.css`, `app.css`, `z.css` | none | **GAME**, noindex | no |
| `report.html` | The report: fetches data pieces, lays PDF out locally | Organizer (via e-mail link) | `rum.js`, `reportgen.js`, `report.js` | `fonts.css`, `app.css`, `z.css` | `GET /api/report/{eid}?k=...` (+ `part=people&i=n`) | PLAIN, noindex | no |
| `owner-visits.html` | Visitor reports for the owner | platform owner | `owner-visits.js` | none | `/api/owner/visits/summary`, `/api/owner/visits/journey/<id>` | PLAIN, noindex, not linked from any public page (tested) | no |
| `404.html` | Not found | all | none | `fonts.css`, `app.css`, `z.css` | none | PLAIN, noindex | no |

Not shipped (legacy server-driven pages; exist in the folder only): `play.html`, `screen.html`, `console.html`, `confirm.html`, `_prototype_shell.html` and their `.js/.css`, plus `sw.js` and `_headers`. They call `/api/e/...`, `/api/p/...`, `/api/orgs/...`, which exist only in `apps/server`.

## 3. Console screen map (as of spec; verify against `zc.js` - see the TODO in `09-FRONTEND.md`)

Spec: `docs/ROLES_AND_CONSOLE_SPEC.md`, mock `docs/mock/console-mock-v5.html`. One page, one section open at a time, numbered coloured sections, "Save and continue", progress bar with jump dots, "Next" card, role pill + payment pill, help section.

| # | Section (colour) | Organizer | Host | Co-host | Main APIs |
|---|---|---|---|---|---|
| 1 | Your game (blue) | Y | Y | - | `POST /api/z`, `GET/PATCH /api/z/{id}/settings`, `GET /api/z/{id}/summary`, `/info` |
| 2 | How it plays (teal) - tickets, speed, rounds, invite option | Y | Y | - | `PATCH settings` |
| 3 | Prizes (amber) - 10 popular prize chips + "I will decide later" + "No prize" | Y | Y | - | `PATCH settings {rewards}` |
| 4 | Brand moments (pink) - Type a message / YouTube / video link / audio link, "Test it" | Y | Y | - | `PATCH settings {opening, breaks, closing}`; `preview.html` |
| 5 | Your team (green) - three role cards; Hosts n of 5; Co-hosts (no limit); copy private link; remove | Y (adds Hosts + Co-hosts) | Y (adds Co-hosts) | - | `GET /api/org/team`, `POST /api/org/host`, `/api/org/cohost`, `/api/org/team/retire` |
| 6 | Invite and share (yellow) - Guest link, Big screen, Your guest list (type / paste from Excel / upload; WhatsApp or e-mail invites) | Y | Y | (Co-host sees own link in "Invite people") | `POST roster`, `reuse`, `mark` |
| 7 | Check, publish and pay (orange) | Y | Y | Payment only (step 3 of Co-host) | `POST publish`, `POST /api/checkout` |
| 8 | Game day (violet) - pause/resume/end/announce, prizes given, requests from the AI | Y | Y | - | `control/key`, `control` (signed), `control/request`, `announce`, `prizes`, `prizegiven`, `participants` |
| 9 | After the game (red) - report link, winners hand-over, erase, close | Y (account: keys, AI link, close) | Y (no account actions) | - | `reportlink`, `life`, `erase`, `/api/org/keys*`, `/api/org/ai/*`, `/api/org/close` |
| - | Pinned strip (Organizer only): AI assistant work link with Copy | Y | - | - | `GET /api/org/ai/link` |
| - | Help (pre-answered questions) | Y | Y | Y | - |
| Co-host | Today's game / Invite people / Payment | - | - | Y | `GET /api/z/{id}/cohost`, `POST /api/checkout` |
| Partner | Existing partner screens ("Refer and Earn Partner" / "Sales Partner" pill) | via partner sign-in | | | `/api/partner/*` |

Hand-over links the console understands: `zc.html?e=<id>&do=publish|erase|pause|stop`; `?quick=1` Quick setup form; `?k=<cth_ or ctc_ key>` or `#host=` / `#cohost=` sign-in link for Hosts/Co-hosts (the key is moved into the tab's `sessionStorage` under `ctz-org` and removed from the address bar, `zc.js:12-14`; an Organizer key is pasted into the sign-in box instead); `BroadcastChannel("ctz-org-key")` shares a sign-in between tabs; AI helper mode keeps `ctz-shield` in `sessionStorage` so guest names and numbers are hidden.

## 4. Public text files

| File | Purpose |
|---|---|
| `robots.txt` | `Allow: /` ; `Disallow` `/api/`, `/ai/`, `/pay.html`, `/signin.html`, `/ai-link.html`, `/report.html`, `/z.html`, `/zc.html`, `/big.html`, `/preview.html`, `/demo.html`; points to the sitemap. (`partner.html` and `owner-visits.html` are not in it: partner is allowed by robots but noindex by header.) |
| `sitemap.xml` | 9 URLs: `/`, `partner.html`, `legal.html`, `terms.html`, `dpa.html`, `subprocessors.html`, `partner-terms.html`, `organizer-guide.html`, `trust.html`; written by `tools/make-sitemap.mjs` (lastmod = last commit date of each file). `organizer-guide.html` etc. are in the sitemap; `index.html` is `/`. |
| `llms.txt` | Written by `tools/make-trust.ts` from `ai-facts.ts` (`llmsTxt()` in `trust-page.ts`); links to trust, legal, terms, dpa, sub-processors, guide, demo, home; explains the `/ai/<key>` link to an AI and states honest limits |
| `manifest.webmanifest` | PWA manifest (name, icons 192/512/maskable, `start_url`) |
| `ct4f9c2e7a1b8d3056ae91c4d7f20b6a38.txt` | Search-engine ownership/IndexNow key file (one line equals its own file name) |
