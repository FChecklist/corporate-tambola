# 07 - Flows (Mermaid)

All diagrams are text. Names in boxes are real routes/functions; see `04-API-REFERENCE.md` for details and `06-BUSINESS-LOGIC.md` for rules.

## 1. Organizer: create, build, publish, pay, share, game day, report, deletion

```mermaid
flowchart TD
  A["Home / site.js: enter work e-mail"] -->|POST /api/start| B{"e-mail has account?"}
  B -->|"no"| C["Console opens at once: master key ctk_, AI key cta_, aiMessage<br/>one dedicated mail with a 24 h AI key"]
  B -->|"yes"| B2["POST /api/auth/email -> 6-digit code or one-click link<br/>POST /api/auth/verify or /api/auth/link -> new ctk_ key"]
  B2 --> C
  C --> D["Console zc.html: Step 1..9<br/>POST /api/z creates a DRAFT pack=0"]
  D --> E["Build: PATCH /api/z/id/settings<br/>time, speed, cap, tickets, rounds, prizes, brand moments, invites<br/>POST roster / reuse for guest list"]
  E --> F["Check + Publish: POST /api/z/id/publish {email, phone}<br/>kv pub/id, contact/id; mail with guest link + pay link"]
  F --> G{"Paid before start - 45 s?"}
  G -->|"pay: POST /api/checkout then Razorpay then verify/webhook"| H["pack set, paidby recorded<br/>invoice mailed"]
  G -->|"no"| HELD["Held at start: phones show waiting screen<br/>organizer mailed once"]
  HELD -->|"pays later"| RESTART["start_round = now+20 rounds: first number in ~3 min"]
  RESTART --> H
  H --> SH["Share guest link z.html?e=id and big screen big.html?e=id"]
  SH --> GD["Game day: start+2 min first number<br/>announce, pause/resume/stop signed in browser, prizes"]
  GD --> END["Game ends: last call / stop / phones say over"]
  END -->|+3 min| RPT["Report e-mailed as ONE link report.html?e=&k=<br/>PDF built in organizer's browser"]
  RPT -->|+22 h| LINKCLOSE["report link closes"]
  LINKCLOSE -->|+23 h| PURGE["participants' names, numbers, seats, votes, results deleted<br/>audit personal part shredded"]
  PURGE -->|00:00 IST end of day 365| ALL["everything deleted; certificate + anonymous stats kept"]
```

## 2. Guest: join, ticket, play, claim, prize

```mermaid
sequenceDiagram
  participant G as Guest phone (z.html + z.js + zgame.js)
  participant W as Worker
  participant D as drand
  G->>W: GET /api/z/id/info (public settings)
  G->>G: show join form (name, mobile), generate/read device id (localStorage)
  G->>W: POST /api/z/id/join {phone,name,device,from?,cat?}
  Note over W: checks: published? full? invite-only? one phone one ticket?<br/>INSERT seat+participant in one batch (cap and quota inside the SQL)
  W-->>G: {pid, startRound, callSeconds, jr, rewards, breaks...}
  G->>G: ticket = ticketAt(eid, 2*(seat-1)+w) (collision-free)
  loop each beacon round of a call
    G->>D: fetch round (mirrors rotated), verify BLS
    G->>G: pickNumber -> mark number, speak it (audio.js)
  end
  G->>W: GET /api/z/id/control (pause file, announcement, polled by size)
  G->>W: GET /api/z/id/seats?after=n (public seat list)
  G->>G: PrizeEngine computes all winners
  G->>W: POST /api/z/id/vote {pid, results} (a share of phones)
  W-->>G: GET /api/z/id/results -> counts, own win detected locally
  G->>W: GET /api/z/id/myprizes?pid&device
  G->>W: POST /api/z/id/confirm {pid, device, name, phone} (winner confirms hand-over details)
  Note over G,W: Phone may say POST /over, 3 phones end the game early
```

## 3. External AI link (three ways an AI is used)

```mermaid
flowchart LR
  subgraph Opt1["Option 1: link in a chat AI"]
    P["Organizer pastes 2 lines + /ai/cta_key"] --> M["AI GET /ai/key = manual"]
    M --> FD["/ai/key/start front door, /facts, /map"]
    FD --> GO["/ai/key/go/... guided steps: new, time, occ, size, play, prizes, extras, review, save"]
    GO --> API["/ai/key/z/id/settings?_method=PATCH&_body=... or real POST/PATCH"]
    API --> HO{"needs the human?"}
    HO -->|"publish / erase / pause / stop"| LINK["hand-over link zc.html?e=id&do=publish|erase|pause|stop"]
    HO -->|"pay"| PAYL["pay.html?e=id"]
    HO -->|"guest names/numbers"| CON["console Participants card"]
  end
  subgraph Opt2["Option 2: AI that works in the browser"]
    B["AI drives zc.html in a browser"] --> SH["AI helper mode: shield hides guest names and numbers<br/>?quick=1 Quick setup form"]
    SH --> HO2["same hand-over links; human taps once"]
  end
  subgraph Opt3["Any AI that searches"]
    S["AI web search"] --> L["llms.txt, /trust.html: the 10 facts"]
    L --> ANS["AI answers safety/privacy/cost questions only from the facts"]
  end
```

Server pieces: `aiLink()` `worker.ts:294`, manual text `ai-link.ts`, functions list `ai-functions.ts`, facts `ai-facts.ts`, guided steps `ai-go.ts`, mails `mails.ts`, pages `ai-link.html/.js`, `trust.html`, `llms.txt`. Test: `ai-link.test.ts`, `ai-enablement.test.ts` (plays an outside AI), `ai-signin.test.ts`, `ai-mail*.test.ts`, `ai-privacy.test.ts`.

```mermaid
sequenceDiagram
  participant O as Organizer
  participant AI as External AI (GET-only)
  participant W as Worker /ai
  O->>AI: paste 2 lines with /ai/cta_key
  AI->>W: GET /ai/cta_key
  W-->>AI: manual (text) + audit row + new-place alert check
  AI->>W: GET /ai/cta_key/go
  W-->>AI: SAY TO THE ORGANIZER + numbered choices (links)
  AI->>O: asks question, one at a time
  O->>AI: answers
  AI->>W: GET /ai/cta_key/go/save?... (internal POST /api/z)
  W-->>AI: draft saved, openUrl console link
  AI->>O: give hand-over link: Publish
  O->>W: opens zc.html?e=id&do=publish, confirms e-mail + mobile, presses Publish
```

## 4. Host and Co-host: invite and pay

```mermaid
sequenceDiagram
  participant Org as Organizer (console)
  participant W as Worker
  participant H as Host
  participant C as Co-host
  participant G as Guest
  Org->>W: POST /api/org/host {label}
  W-->>Org: {hostKey cth_, manualUrl /ai/cth_..., id, label}, 24 h Host key mailed to Organizer
  Org->>H: sends private link (zc.html?k=cth_...) - "send it to that one person only"
  H->>W: (console) change game, invites, publish, game day, POST /api/org/cohost {label}
  W-->>H: {cohostKey ctc_, link zc.html?k=ctc_...}
  H->>C: sends private link
  C->>W: GET /api/whoami -> {kind: cohost}
  C->>W: GET /api/z/id/cohost -> {name,startMs,cap,joined,brought,price,payment,inviteLink}
  C->>G: shares inviteLink z.html?e=id&from=1e9+hex7
  G->>W: POST /join {from} -> seat.src = co:hex7
  C->>W: POST /api/checkout (x-organizer ctc_, eid) -> pay -> paidby = co-host
  W-->>C: payment status Paid by co-host, others see "Paid"
```

## 5. Payment (sequence)

See the sequence diagram in `06-BUSINESS-LOGIC.md` section 2. Summary states: `payment.status created -> paid`; entitlement created; draft published (`pack = paid size`, `kv pub/`, `paidby/`); invoice created; mails; commission row (if `ref`); funnel steps `published`, `paid`.

## 6. Lifecycle / cron tick

```mermaid
flowchart TD
  CR["apps/cron Worker: every minute"] -->|POST /api/lifecycle/tick x-cron-key| T["lifecycleTick"]
  T --> Q["SELECT up to 25 engagements with participants still present, ordered by start_round"]
  Q --> E1["life row: end = endBoundMs scheduled end, or phones' vote end"]
  E1 --> W1{"now >= end + 3 min and no report sent?"}
  W1 -->|"yes"| R["reportStep: prep chunks of 250 sealed into kv rptc/..., then send e-mail with link"]
  W1 -->|"no"| W2
  R --> W2{"report sent and 6 h before the link closes and never opened?"}
  W2 -->|"yes"| REM["reminder e-mail"]
  W2 --> W3{"now >= end + 23 h and no legal hold?"}
  W3 -->|"yes"| PUR["erasePersonal: delete participants, seats, claims, votes, results, working report; shred audit personal part"]
  T --> SH["late shred: audit_pii of engagements whose participant rows are already gone"]
  T --> VS["once a day: sweepVisits roll up visits older than 365 days"]
  T --> PO["purgeOld: retention sweep + eraseEverything for engagements past day 365 or stale drafts"]
  Org["any organizer-side request, at most once a minute per instance"] -.->|"fallback"| T
```

Code: `worker.ts:929` (route), `lifecycle.ts:294` (tick), `lifecycle.ts:114,124` (erase), `worker.ts:1333` (purge). The same route also performs `purgeOld` so one call per minute covers the daily clean-up; `housekeeping()` (`worker.ts:256`) adds the daily outbox retry and the 36-hour payment reminders on organizer traffic.

## 7. Winner quorum

```mermaid
flowchart TD
  P1["Phone computes winners from public numbers + public seat list"] --> V["POST /vote {pid, results[]}"]
  V --> CH{"pid is a participant? valid pattern/ordinal/round/idx/pids?"}
  CH -->|"no"| IGN["ignored"]
  CH -->|"yes"| SET{"already in settled?"}
  SET -->|"yes"| DONE["done"]
  SET -->|"no"| INS["INSERT OR IGNORE rvote(eid,round,pattern,ordinal,seat,digest)"]
  INS -->|"already voted"| IGN
  INS --> CAND["INSERT OR IGNORE rcand digest -> idx,pids"]
  CAND --> CNT{"count of rvote with same digest >= quorumFor(people)?"}
  CNT -->|"no"| WAIT["wait for more phones"]
  CNT -->|"yes"| ST["INSERT OR IGNORE settled; recordWinners (winner rows, src=phones); makePrizeRows (sealed copy of name+number)"]
```

## 8. Demo game

```mermaid
flowchart LR
  D0["demo.html /demo"] --> D1["Press Run Demo: sets the fragment r=FIRST-ROUND in the address and reloads"]
  D1 --> D2["demo.js defines window.__CT_DEMO: api stub, store in memory, scripted randomness"]
  D2 --> D3["z.js runs the REAL phone page with DEMO hook<br/>ticket = seat 1 of engagement DEMO"]
  D3 --> D4["3 numbers, 15 s break with demo-break.mp4 or CT_DEMO_VIDEO, 3 numbers, Four corners on 6th call"]
  D4 --> D5["Hurray + end screen; nothing stored anywhere; no sign-in"]
```

Script: `packages/beacon/src/demo-script.ts` (numbers `[1,23,80,9,50,60]`, corners `[1,80,9,60]`, `DEMO_CALL_SECONDS=9`, break after 3 for 15 s); test `packages/beacon/test/demo-script.test.ts`; page test `apps/web/test/pages.test.ts`.

## 9. Invite chain

```mermaid
flowchart TD
  ORG["Organizer / Host switch invitations on: per 1..4, categories"] --> LINK["Each participant gets: z.html?e=id&from=THEIR-SEAT&cat=KIND"]
  LINK --> J1["Invitee joins: seat.inv = inviter seat, seat.cat"]
  J1 --> Q{"inviter marked (role) or inviter.inv is null?"}
  Q -->|"inviter was themselves invited"| NOINV["invitee joins normally; no inviter recorded"]
  Q -->|"yes"| QUOTA{"plain participant: used < per?"}
  QUOTA -->|"no"| FULL["409 invite-full"]
  QUOTA -->|"yes"| OK["seat created; counts toward inviter's quota"]
  CO["Co-host link from = 1e9 plus hex7"] --> BYPASS["no quota, works with invites off; seat.src = co:hex7; shown as brought"]
```

Report: the invite tree (who brought whom, top inviter) is in the PDF (`report-layout.ts`, `lifecycle.ts:175-180`).
