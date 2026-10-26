# Corporate Tambola: use-case dimensions and the expected-outcome oracle

Test designer deliverable, 2026-10-27. Three files belong together:

| File | What it is |
|---|---|
| `docs/flow/04-use-case-dimensions-and-oracle.md` | this document: the dimension model, the pruning rules, the oracle explained, 60 example cases, the doubtful rows |
| `docs/flow/04-use-case-oracle.json` | the oracle as data: ordered decision tables a test generator walks without reading any code |
| `docs/flow/04-count-cases.mjs` | a dependency-free Node script that reads the JSON, enumerates the whole matrix, evaluates the oracle for every case and prints the exact counts (`--list`, `--examples 60`) |

Bound to: branch `wip/join-redesign`, HEAD `2eced1a` plus the uncommitted working tree (`e9e21453b2 worker.ts, ad43144df2 people.ts`). The tree was being edited while this was written: the `ended` and `locked` gates and the `admitted` override (which fixes the "admitted but waiting for ever" loop of mode `both`, docs gap G4) appeared during the work, so every row below was checked against the real Worker at the end, not only read (section 9). Re-run the checks before trusting a row after the tree moves.

Sources read: `apps/edge/src/worker.ts` (join route, `can()`, `authOf`, settings, cancel/reopen routing), `apps/edge/src/people.ts` (callers, lists, waiting room, `me`), `apps/edge/src/consent.ts`, `apps/edge/src/phonekit.ts`, `apps/edge/src/cancel.ts`, `packages/beacon/src/config.ts` (verify, employeesOnly, invites), `docs/handover-2026-10-26/join_design.json` (the 20-row matrix, reused and extended), `docs/ROLES_AND_CONSOLE_SPEC_3.md`, `docs/ORGANIZER_FLOW_DESIGN_2026-10-25.md`, `apps/edge/test/verify.test.ts`, `apps/edge/test/people.test.ts`, and `docs/flow/01-join-verify-approval.md` (another agent's chart of the same code, used as a cross-check).

## 1. The model in one screen

The eight dimensions you listed are the axes of two families, **F-JOIN** (one person asks to come in) and **F-APPROVAL** (a waiting request is answered). Two small families are added so that every actor is exercised and the exact wrong-input messages are pinned down: **F-INPUT** (a malformed or incomplete request) and **F-PERM** (what each actor may do to the lists). Every family is crossed with the play-mode replicate.

| # | Dimension | Specified | Used | Values |
| --- | --- | --- | --- | --- |
| 1 | Play mode | 2 | 2 | manual, auto (replicate axis) |
| 2 | Verification | 4 | 4 | mobile, id, either, both |
| 3 | Audience | 5 | 6 | EMP_ONLY, LIST, LIST_INV, ANYONE, EMP_ID_OTHERS, ANYONE_INV (ANYONE_INV is the one extension) |
| 4 | Arrival route | 6 | 7 | ORG, HOST, COHOST, PERSONAL, GUEST_L1, GUEST_L2, DIRECT |
| 5 | Person state | 9 | 11 | S01, S02, S03, S04, S05, S06, S07, S08, S09, S10, S11 (S10, S11 added) |
| 6 | Approval outcome | 7 | 8 (+NONE) | AUTO, APPROVE, APPROVE_ALL, DECLINE, NEVER, APPROVE_AFTER_FULL, APPROVE_AFTER_REMOVAL, WRONG_ROLE (NONE = nothing to approve) |
| 7 | Approver role | (implied) | 10 | ORG, HOST, COHOST_OWNER, COHOST_OTHER, L1_OWNER, L1_OTHER, L2_GUEST, AI_KEY, ANON, OTHER_ORG |
| 8 | Capacity | 3 | 4 | ROOM, PROMISED_ONLY, FULL, OVER_QUOTA (PROMISED_ONLY added) |
| 9 | Lifecycle event | 6 | 6 | none, pause_resume, late_join, organizer_ends, cancelled_before_start, reopen |

Why four families and not one cross product: an approval needs a request that already waits, so "approval outcome" is meaningless for a join that ended in an error; and a malformed field is refused before route, person state, capacity and lifecycle are even read. Crossing those blindly would multiply cases whose answer is fixed by something else. The pruning rules in section 3 say exactly where and why.

## 2. The dimensions

### 2.1 Play mode (2)
`manual` (a Host presses a button for each number, config `callMode: "host"`, size at most 2000) and `auto`. The Worker never reads `callMode` in the join, people or waiting routes (`worker.ts` join route; all of `people.ts`), so this is a **replicate axis**: every manual case must give the same answer as its auto twin. It doubles the count and is never pruned (PR-09). One question for the product owner is DR-21.

### 2.2 Verification (4)
`mobile` (default, stored as no value), `id`, `either` (ID or mobile), `both`. From `people.ts verifyOf`, `worker.ts` join route.

### 2.3 Audience (5 specified, plus 1 extension)
The console's six choices (`ORGANIZER_FLOW_DESIGN_2026-10-25.md`) are only ways to set three stored switches: whoCanJoin (list or anyone), employeesOnly, guest invites. Your five audiences map as follows. `employeesOnly = true` forces whoCanJoin = list and switches guest invites off (`config.ts:332`), which is why console choice 2 ("employees plus their friends and family") has no exact server shape (DR-18).

| Audience | Meaning | closed (list only) | employeesOnly | guest invites | verify values crossed | console offers | stored settings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `EMP_ONLY` | Employees only | true | true | false | mobile, id, either, both | id, mobile, either, both | whoCanJoin list (forced), employeesOnly true, guestInvites off (forced by config.ts:332) |
| `LIST` | A list of people I choose (closed list, no guest invites) | true | false | false | mobile, id, either, both | mobile | whoCanJoin list, employeesOnly false, guestInvites off |
| `LIST_INV` | A list plus the people they invite (closed list, guest invites on) | true | false | true | mobile, id, either, both | mobile, id, either, both | whoCanJoin list, employeesOnly false, guestInvites on (per 1..10, default 4). With verify id/either/both this is the nearest server setting to console choice 2 'My employees, plus their friends and family' (see doubtful row DR-18) |
| `ANYONE` | Anyone with the link | false | false | false | mobile | mobile | whoCanJoin anyone, employeesOnly false, guestInvites off |
| `EMP_ID_OTHERS` | Anyone with the link; employees confirm with their employee ID, others use a mobile number | false | false | false | id, either, both | id, both | whoCanJoin anyone, employeesOnly false, verify id\|either\|both |
| `ANYONE_INV` | EXTENSION: Anyone with the link, guest invites on | false | false | true | mobile | (not a console choice) | whoCanJoin anyone, guestInvites on. Not offered as a console choice but the server allows it, and it is the only audience where a level-1 guest's quota is hit in an OPEN game (the 'over by invite' capacity). |

### 2.4 Arrival route (6 specified, 7 used)
You listed six; "guest invite link" is split in two because the code treats a level-1 guest's link and a level-2 guest's link differently (`worker.ts:1675-1679`), and your list also asks for the level-2 actor.

| Route | Meaning |
| --- | --- |
| `ORG` | Organizer common link: z.html?e=ID&from=1900000000 |
| `HOST` | Host common link: from = 1500000000 + hex(first 7 of the Host key hash) |
| `COHOST` | Co-host common link: from = 1000000000 + hex(first 7 of the Co-host key hash) |
| `PERSONAL` | Personal link /j/<token>: a secret made for one listed person (fixture convention: the person is on a Co-host's list). The page sends {token}. |
| `GUEST_L1` | Guest invite link of a level-1 participant (a participant who is not themself a guest): from = that participant's seat number |
| `GUEST_L2` | Guest invite link of a level-2 guest (somebody who joined through a level-1 guest's link or list): same shape, but the game ignores it for ownership |
| `DIRECT` | No link code: the bare game page (z.html?e=ID) or a typed address |

Terminology, to avoid a mix-up: in the code and in `ROLES_AND_CONSOLE_SPEC_3.md` the participant who is allowed to invite is called **level 1** and everybody they bring is **level 2** (plays, has no list, cannot invite). Your brief describes "guest level 1 who may invite" and "level 2 who cannot invite" as people invited by a participant. If you meant a three-level chain (participant, guest who may invite, guest who may not), the code does not have it; see DR-23. The matrix follows the code.

### 2.5 Person state (9 specified, 11 used)
Two states were added: S10 (the ID of a colleague who is listed but has not joined: the impersonation window the other states do not reach) and S11 (returning on the same phone, which every reload and every "late join" needs).

| State | Meaning | Request recipe (short) |
| --- | --- | --- |
| `S01` | On a list with a mobile number only | list: mobileOnly; request: {phone: M_s} |
| `S02` | On a list with an employee ID only (no mobile) | list: idOnly; request: {empId: E_s} |
| `S03` | On a list with both a mobile number and an employee ID | list: both; request: {phone: M_s, empId: E_s} |
| `S04` | Not on any list (an outsider): types only a mobile number; on a PERSONAL route types their own number on somebody else's link | list: nobody; request: {phone: M_s}   (PERSONAL: {token: of a listed person X, phone: M_s}) |
| `S05` | Removed by the organizer side before the game (before start): was listed, now status removed | list: same kind as the verify mode needs (mobile: mobileOnly, id\|either: idOnly, both: both), then the Organizer removes the person before the start; request: as S01/S02/S03 for that kind |
| `S06` | Already joined on another phone: the identity holds a ticket bound to device A, the request comes from device B (another phone, another browser, cleared site data) | list: as S05 without the removal; the person first joins with device A; request: the same request with device B |
| `S07` | Same phone, second ticket: the request's device already holds a ticket for a DIFFERENT identity | list: as S05 without the removal; a different listed person 'holder' first joins with device D_s; request: the subject's own request with device D_s |
| `S08` | Wrong ID: an employee ID that matches nobody (in 'both' mode: a listed mobile with an ID different from the listed one) | list: mode both: the subject's mobile is listed with ID E_s; modes id\|either: somebody else is listed; request: mode both: {phone: M_s, empId: <wrong>}; id\|either: {empId: <wrong>}; PERSONAL: {token, empId: <wrong>} |
| `S09` | ID of someone else who already joined (in 'both' mode: the person's own unlisted mobile with that other person's ID) | list: O is listed and has joined on D_o; request: id\|either: {empId: E_o}; both: {phone: M_s (unlisted), empId: E_o}; PERSONAL: {token, empId: E_o} |
| `S10` | ID of someone else who is listed but has NOT joined yet (impersonation window) | list: O is listed and has NOT joined; request: id\|either: {empId: E_o}; PERSONAL: {token, empId: E_o} |
| `S11` | Returning: same identity, same device, second visit (reload, reopen the link) | list: as S05 without the removal; the person joined with device D_s; request: the same request again with D_s |

The exact request for each state and each verify mode is in `oracle.recipes.byState`. Short form: the subject S has mobile M_s, ID E_s and a device D_s; "listed" means the Organizer (or, for a personal link, a Co-host) loaded the entry before the test; the request always carries both consent ticks and a device id.

### 2.6 Approval outcome (7 specified, 8 used) and approver role (10)

| Outcome | Meaning |
| --- | --- |
| `AUTO` | No waiting room: the join itself gives the ticket (auto-admit) |
| `APPROVE` | waiting-room approve (single request) by a right approver |
| `APPROVE_ALL` | 'Approve all' by a right approver (only their own link's requests for a Co-host or guest) |
| `DECLINE` | decline by a right approver |
| `NEVER` | never decided |
| `APPROVE_AFTER_FULL` | approve after all places on the lists are taken (persons == cap) |
| `APPROVE_AFTER_REMOVAL` | approve after the same identity was listed and then removed |
| `WRONG_ROLE` | approve by a role that may not decide this request |
| `NONE` | the join ended in an error, so there is nothing to approve |

| Approver role | Who |
| --- | --- |
| `ORG` | Organizer's own key |
| `HOST` | a Host's key |
| `COHOST_OWNER` | the Co-host whose common link the request came through |
| `COHOST_OTHER` | a Co-host who does not own the request |
| `L1_OWNER` | the level-1 guest whose invite link the request came through (known by ticket id + device) |
| `L1_OTHER` | another level-1 guest |
| `L2_GUEST` | a level-2 guest |
| `AI_KEY` | an AI key or any call through an AI work link |
| `ANON` | no key and no ticket |
| `OTHER_ORG` | the key of another organizer |

"Right roles" of a request: the Organizer and any Host always; the Co-host whose link the request came through; the level-1 guest whose link it came through (known by ticket id plus device id); nobody else. A request that is over its inviter's limit in an **open** game (`invite-full`) belongs to chain `,o,`: only the Organizer and Hosts see and decide it. Who sees a request is part of the oracle (`derive.viewers`).

### 2.7 Capacity (3 specified, 4 used)

| Capacity | Meaning |
| --- | --- |
| `ROOM` | Room left for this person (a free place, no promise problem, inviter quota not reached) |
| `PROMISED_ONLY` | The only free places are promised to listed people who have not yet joined: participants + unseated listed people == cap, participants < cap |
| `FULL` | Exactly full: participants == cap (the next new ticket would exceed the size bought) |
| `OVER_QUOTA` | The game has room, but the person's inviter (a Co-host with 100 default, or a level-1 guest with 'per') has no list places left |

`PROMISED_ONLY` was added because the code reserves places for listed people who have not come yet (`addSeat`, `worker.ts:1508`); without it "exactly full" hides the most surprising answer (DR-09).

### 2.8 Lifecycle events (6)

| Lifecycle | Meaning |
| --- | --- |
| `none` | Normal, before the first number |
| `pause_resume` | The organizer pauses and later resumes the numbers; the step under test happens while paused (signed control file only: nothing in join, people or waiting reads it) - REPLICATE of 'none' |
| `late_join` | The step happens after the first number and after the 2-minute grace (40 rounds): seats get jr = the current round |
| `organizer_ends` | The step happens after the game ended (last call + 60 s, or the organizer's stop): endBoundMs |
| `cancelled_before_start` | The step happens after the Organizer or a Host cancelled the game (3 confirmations). Co-host keys are revoked at the cancel. |
| `reopen` | A cancelled PAID game moved to a new date: cancelled flag cleared, Co-host keys stay revoked, guest data is gone (erased 20 h after the cancel): nobody has joined, old personal links are dead, old guest links point at no seat. The Organizer has loaded the lists again (new personal links). |

For F-JOIN the event is the moment of the join. For F-APPROVAL the request is created at the baseline and the event is the moment of the decision (PR-11).

### 2.9 Which actor is exercised where

| Actor | As arrival route | As approver | As caller of the lists (F-PERM) | Other places |
|---|---|---|---|---|
| Organizer | `ORG` link; lists everyone it loads (default list owner) | `ORG` | `ORG` (all ops) | cancel, reopen, remove, "put back" (A-AFTER-REMOVAL), cap changes (capacity FULL) |
| Host | `HOST` link | `HOST` | `HOST` | same rights as the Organizer on people; mailed when a Host removes someone |
| Co-host | `COHOST` link; owner of every `PERSONAL` link in the fixture | `COHOST_OWNER` (own requests only), `COHOST_OTHER` (never) | `COHOST` (own list only, no export) | keys are revoked by the cancel and not restored by the reopen (DR-14) |
| Participant (level 1, may invite) | `GUEST_L1` link; `PERSONAL` token holder; every "listed" state | `L1_OWNER`, `L1_OTHER` | `L1` (own list, quota `per`) | quota is the `OVER_QUOTA` capacity |
| Invited by a participant (level 2, cannot invite) | `GUEST_L2` link; the people who arrive through `GUEST_L1` | `L2_GUEST` (always refused) | `L2_GUEST` (always refused) | arriving through a level-2 link makes a new level-1 guest (DR-07) |
| Not an actor, always present | | `AI_KEY`, `ANON`, `OTHER_ORG` | same three | all refused |

## 3. Pruning rules

Impossible or redundant combinations are removed by rules, not by hand; each rule is data in `oracle.pruning` / `stateInvalidWhen` / rule fields, and the script applies exactly these.

| Rule | What is removed or kept | Why |
| --- | --- | --- |
| PR-01 | audience x verify: only the 'verifyAllowed' values of each audience are crossed (ANYONE and ANYONE_INV: mobile only; EMP_ID_OTHERS: id, either, both - with 'mobile' it would be the ANYONE audience). | An open game with verify 'mobile' and an employee-ID rule is a contradiction in terms; the same server setting is already covered by ANYONE. |
| PR-02 | state validity by verify mode (table stateInvalidWhen). | A person cannot be listed in a shape the people route refuses (people.ts addPeople): ID-only needs id\|either; mobile-only needs not(eo && id\|both); an ID is never stored in 'mobile' mode; S10 cannot exist in 'both' (identity is the mobile, so an unclaimed ID is the same as S09). |
| PR-03 | lifecycle reopen: states S05, S06, S07, S09, S11 do not exist, and capacity is ROOM only. | A reopened game starts empty: guest data was erased 20 h after the cancel, so nobody has been removed and nobody holds a ticket or a device yet. Capacity checks are the same code as in a game that was never cancelled, so FULL, PROMISED_ONLY and OVER_QUOTA add nothing there. |
| PR-04 | capacity values are kept for a case only if the rule that answers the case lists that capacity (rule.capacities, default ROOM only). | A case whose answer is decided by a gate before the capacity check (need-id, link-gone, returning phone, device-used, ended, cancelled) cannot depend on capacity, so FULL/PROMISED_ONLY/OVER_QUOTA there are the same use case as ROOM. OVER_QUOTA additionally needs an inviter that has a quota (limited) and an unlisted person. |
| PR-05 | rules marked 'ignores' keep one case per combination of the OTHER dimensions (the first value in enumeration order stands for the ignored ones). | The cancelled gate answers 403 before verify, state and capacity are read; a dead personal link after a reopen answers 404 before them; and so on. Keeping every verify x state there would only repeat one use case. |
| PR-06 | Approval outcomes other than AUTO and NONE exist only for requests that the join oracle answers with waiting:true. | Nothing waits otherwise. |
| PR-07 | Approver roles: APPROVE, APPROVE_ALL, DECLINE, APPROVE_AFTER_FULL, APPROVE_AFTER_REMOVAL cross only the RIGHT roles of the request; WRONG_ROLE crosses the six wrong roles; NEVER crosses no role. | A right role approving is one use case; a wrong role is the refusal use case. |
| PR-08 | Family F-INPUT crosses defects with (audience x verify) only; family F-PERM crosses caller x op x invites x lifecycle with the 'ignores' of its rules. | A malformed field is refused before route, state, capacity and lifecycle matter. |
| PR-10 | F-APPROVAL requests are one per (audience, route, request class, identity kind): request class is 'unlisted' (S04) or 'idmiss' (S08, S09, S10); identity kind is 'id' when the waiting request is keyed by a typed employee ID (verify id\|either) and 'phone' otherwise. The approver's answer does not depend on verify or on which of S08/S09/S10 produced the request. | approval.rules read only the request's owner, whether it is overlimit, and the audience's invite switch. Crossing every verify and state again would repeat identical answers. |
| PR-11 | F-APPROVAL is a base plus a sweep. Base (decision lifecycle none): every approval outcome x its roles x its capacity. Sweep (decision lifecycle pause_resume, late_join, organizer_ends, cancelled_before_start; reopen only for Co-host-link requests): APPROVE by every right role, NEVER, and for organizer_ends and cancelled_before_start also the two non-chain wrong roles. | The game-state gates (cancelled, ended) and the dead Co-host keys change the approver's answer; pause and late join only change the re-join leg. Crossing all five lifecycles with every outcome would repeat the base answers. |
| PR-09 | playMode is crossed with every family and never pruned. | It is a replicate axis: the oracle is identical, so each manual case must equal its auto twin (a cheap invariance check). |

State validity (PR-02) in one line each: S01 does not exist when verify is `id` or `both` with employees-only (the people route refuses a mobile-only row there); S02 needs `id` or `either`; S03 needs an ID mode; S08 and S09 need an ID mode; S10 needs `id` or `either`. The ID is never stored in `mobile` mode, so every ID state vanishes there.

Effect of each step on F-JOIN (play = auto):

| Step | Cases left (F-JOIN, auto) |
| --- | --- |
| Raw cross: 6 audiences x 4 verify x 7 routes x 11 states x 4 capacities x 6 lifecycles | 44352 |
| PR-01: only the allowed (audience, verify) pairs (17 pairs instead of 24) | 31416 |
| PR-02 + PR-03: impossible person states removed | 23296 |
| PR-04: capacity kept only where the answering rule lists it | 8779 |
| PR-05: gate-dominated duplicates collapsed | 6779 |

## 4. The oracle

### 4.1 How a test uses it
The oracle is a pure function from a case to an answer. Nothing in it needs the code:

1. Take the case's dimension values. Derive the audience flags `closed`, `employeesOnly`, `invites` from `dimensions.audience[audience]`, and the route owner `owner` from `derive.ownerRules` (first match). `limited` is true when the owner is `c` (Co-host, limit 100 by default, 10 to 1000) or `s` (level-1 guest, limit `per`, 1 to 10, default 4).
2. Walk the ordered rules of the family (`join.rules`, `approval.rules`, `input.defects`, `perm.rules`). The first rule whose `when` matches gives the answer. `when` keys are ANDed; an array means "any of"; `{ "not": v }` means "not v".
3. The answer has `status`, `code` (`ticket` for a 200 that carries a ticket id), `waiting`, `with` (the name shown in "Your request is with ..."), `sees` (who can see the waiting request), `msg` (a key into `messages`; the exact text is there) and `final` (what is stored afterwards).
4. A test passes when the real answer equals the oracle on those fields. Text is compared with the numbers normalised (limits and sizes depend on the fixture).

### 4.2 F-JOIN rules (ordered; first match wins)
Columns: `capacities` = the capacity values for which the rule is a distinct case (default ROOM only), `ignores` = dimensions the answer does not depend on (PR-05).

| # | Rule | when | Answer | capacities | ignores | Why / code anchor |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `J-GATE-CANCELLED` | lifecycle = cancelled_before_start | 403 cancelled; msg cancelled | ROOM | state, capacity, verify | worker.ts: cancelled && POST join |
| 2 | `J-LINK-GONE-REOPEN` | route = PERSONAL and lifecycle = reopen | 404 link-gone; msg linkGone | ROOM | state, capacity, verify | personByToken: guest data was erased, the old token no longer exists |
| 3 | `J-LINK-GONE` | route = PERSONAL and state = S05 | 404 link-gone; msg linkGone | ROOM | - | worker.ts join: token unknown or person removed (a removal also clears tok_hash) |
| 4 | `J-NEED-ID-ID` | employeesOnly = true and verify = id and state = S04 and route != PERSONAL | 400 need-id; msg needIdId | ROOM | - | worker.ts join: employeesOnly && id && no ID && no token |
| 5 | `J-NEED-ID-BOTH` | employeesOnly = true and verify = both and state = S04 and route != PERSONAL | 400 need-id; msg needIdBoth | ROOM | - | worker.ts join: employeesOnly && both && no ID && no token |
| 6 | `J-RETURNING` | state = S11 | 200 ticket; jr unchanged; again:true | ROOM | - | worker.ts join: have participant, same device (again:true) |
| 7 | `J-LINK-USED` | state = S06 and route = PERSONAL | 423 link-used; msg linkUsed; needPhone | ROOM | - | worker.ts join: token && !typedPh |
| 8 | `J-ID-USED-S06` | state = S06 and verify = id\|either | 423 id-used; msg idUsed | ROOM | - | worker.ts join: idHit |
| 9 | `J-OTHER-PHONE` | state = S06 | 423 other-phone; msg otherPhone | ROOM | - | worker.ts join: device mismatch |
| 10 | `J-ID-USED-S09` | state = S09 and verify = id\|either and route != PERSONAL | 423 id-used; msg idUsed | ROOM | - | the typed ID resolves to a listed person who already holds a ticket on another device |
| 11 | `J-ENDED` | lifecycle = organizer_ends | 403 ended; msg ended | ROOM | - | worker.ts join: now >= endBoundMs (new people only; a returning phone is handled above) |
| 12 | `J-REMOVED` | state = S05 | 403 removed; msg removed | ROOM | - | worker.ts join: person status removed |
| 13 | `J-DEVICE-USED` | state = S07 | 409 device-used; msg deviceUsedNew | ROOM | - | worker.ts join: a seat already holds this device |
| 14 | `J-FULL` | capacity = FULL and lifecycle != reopen | 409; msg full | FULL | verify | worker.ts join: participants >= cap (no code; checked BEFORE the waiting room, so 'full' beats 'waiting') |
| 15 | `J-LISTED` | state = S01\|S02\|S03 | 200 ticket; jr round-if-late; placed under listedOwner | ROOM, PROMISED_ONLY | - | worker.ts join: person found on a list; the promised place is kept (addSeat) |
| 16 | `J-TOKEN-WINS` | route = PERSONAL and state = S08\|S09\|S10 | 200 ticket; jr round-if-late; placed under listedOwner | ROOM, PROMISED_ONLY | - | worker.ts join: ID checks are skipped when a token is present. the token is the strong proof: a typed ID is ignored |
| 17 | `J-IMPERSONATE` | state = S10 and verify = id\|either | 200 ticket; jr round-if-late; placed under listedOwner; see DR-01 | ROOM, PROMISED_ONLY | - | worker.ts join: a listed ID is accepted from any phone that has not joined yet |
| 18 | `J-ID-MISS-WAIT` | state = S08\|S09\|S10 | 403 waiting; waiting:true, with the owner; msg waiting | ROOM | - | worker.ts join: idMiss -> wait(false). ID mismatch: the organizer decides, in open and closed games alike (doubtful DR-02) |
| 19 | `J-UNLISTED-CLOSED` | state = S04 and closed = true | 403 waiting; waiting:true, with the owner; msg waiting | ROOM | - | worker.ts join: e.closed -> wait(false) |
| 20 | `J-OVER-QUOTA-OPEN` | state = S04 and closed = false and capacity = OVER_QUOTA and limited = true and lifecycle != reopen | 409 invite-full; waiting:true, with organizer, overlimit; msg inviteFull; see DR-08 | OVER_QUOTA | - | worker.ts join: listCount(owner) >= limit -> wait(true, limit) |
| 21 | `J-PROMISED-OPEN-LIMITED` | state = S04 and closed = false and capacity = PROMISED_ONLY and limited = true and lifecycle != reopen | 409 invite-full; waiting:true, with organizer, overlimit; msg inviteFull; see DR-09 | PROMISED_ONLY | - | worker.ts join: the insert guard fails -> row null -> guardId !== null -> wait(true, guardLimit) |
| 22 | `J-PROMISED-OPEN` | state = S04 and closed = false and capacity = PROMISED_ONLY and lifecycle != reopen | 409; msg full; see DR-09 | PROMISED_ONLY | - | worker.ts join: the insert guard fails -> row null -> 409 full |
| 23 | `J-OPEN-NEW` | state = S04 and closed = false | 200 ticket; jr round-if-late; placed under owner | ROOM | - | worker.ts join: open game, inviter below its limit |

Derived values:

- **owner** (first matching rule): route = COHOST and lifecycle = reopen -> `o`; route = GUEST_L1|GUEST_L2 and lifecycle = reopen -> `o`; route = GUEST_L1 and invites = false -> `o`; route = ORG -> `o`; route = HOST -> `h`; route = COHOST -> `c`; route = GUEST_L1 -> `s`; route = GUEST_L2|DIRECT -> `o`; route = PERSONAL -> `c`.
- **limited**: owner is 'c' (Co-host: coHostLimit, default 100, 10..1000) or 's' (level-1 guest: invites.per, default 4, 1..10).
- **with** (the name in "Your request is with ..."): o: the organizer; h: <the label the Organizer gave the Host, else 'the host'>; c: <the label the Organizer gave the Co-host, else 'the co-host'>; s: the person who invited you; overlimit: the organizer.
- **viewers** of a waiting request: o: ORG, HOST; h: ORG, HOST; c: ORG, HOST, COHOST_OWNER; s: ORG, HOST, L1_OWNER; overlimit: ORG, HOST.
- **listed owner**: The list owner of a listed person: 'c' on route PERSONAL (fixture), otherwise 'o' (the Organizer loaded the list). First list wins: a listed person stays under their real inviter whatever link they use.
- **via** (stored on the waiting row): personal-link for route PERSONAL, direct for DIRECT, common-link otherwise.
- **seat after a new ticket**: person.inviter = the placement owner; seat.inv = the level-1 seat number when the inviter is 's', otherwise null; seat.src = o: link, h: ho:<hex>, c: co:<hex>, s: link.
- **finals**: `nothing` = no row is created; the phone has no ticket and no waiting request; `new-ticket` = participant + seat created. person row: status joined; inviter = placement (listedOwner: the list the person was on; owner: the route owner); seat.inv = level-1 seat number when the inviter is 's' else null; seat.src = co:<hex> | ho:<hex> | link; jr = 0 normally, the current round when lifecycle late_join; `same-ticket` = no new row; the reply carries again:true and the original jr; `waiting-row` = waiting row created (status waiting, one per identity, idempotent): inviter = owner (or 'o' when overlimit), overlimit flag, via = personal-link | common-link | direct, chain = the owner and, for 's', the guest's own inviter; NO seat, NO person row; the request is visible to 'sees'

Reading guide for the surprising answers: a person who is on a list is let in whatever link they use, and stays under their real inviter (first list wins); a **personal link** is the strong proof, so a typed ID on it is ignored (J-TOKEN-WINS); a typed **ID** is only matched to a list, never proven (J-IMPERSONATE); **full** and **ended** are checked before the waiting room, so an unlisted person in a full closed game is told "full", not "wait"; the **waiting room** keeps no place.

### 4.3 F-APPROVAL rules (ordered)
A request exists (a join answered `waiting:true`). The case adds the approver `role`, the `approval` outcome, the decision-time `lifecycle` and `capacity`.

| # | Rule | when | Approver answer | Phone sees (/me) | Re-join | capacities | ignores |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `A-NEVER` | approval = NEVER | no call | waiting | the join oracle again | ROOM | - |
| 2 | `A-AUTH-AI` | role = AI_KEY | 403 msg aiRefusal | waiting | the join oracle again | ROOM | lifecycle, capacity, route, state, reqLife |
| 3 | `A-AUTH-ANON` | role = ANON | 403 msg noSign | waiting | the join oracle again | ROOM | lifecycle, capacity, route, state, reqLife |
| 4 | `A-AUTH-OTHER-ORG` | role = OTHER_ORG | 403 msg notAllowed | waiting | the join oracle again | ROOM | lifecycle, capacity, route, state, reqLife |
| 5 | `A-AUTH-L2` | role = L2_GUEST | 403 msg l2 | waiting | the join oracle again | ROOM | lifecycle, capacity, route, state, reqLife |
| 6 | `A-AUTH-L1-INVITES-OFF` | role = L1_OWNER\|L1_OTHER and invites = false | 403 msg invitesOff | waiting | the join oracle again | ROOM | lifecycle, capacity, route, state, reqLife |
| 7 | `A-AUTH-COHOST-REVOKED` | role = COHOST_OWNER\|COHOST_OTHER and lifecycle = cancelled_before_start\|reopen | 403 msg noSign | waiting | the join oracle again | ROOM | capacity, route, state |
| 8 | `A-CANCELLED` | lifecycle = cancelled_before_start | 409 cancelled msg cancelled | waiting | the join oracle again | ROOM | capacity |
| 9 | `A-NOT-IN-CHAIN` | inChain = false | 404 msg notYours | waiting | the join oracle again | ROOM | capacity |
| 10 | `A-AFTER-REMOVAL` | approval = APPROVE_AFTER_REMOVAL | 200 body {ok:true,already:admitted} | admitted | 403 removed | ROOM | - |
| 11 | `A-ENDED` | lifecycle = organizer_ends | 409 msg lapsedOne | lapsed | the join oracle again | ROOM | capacity |
| 12 | `A-DECLINE` | approval = DECLINE | 200 body {ok:true,declined:true}; see DR-12 | declined | 403 declined | ROOM | - |
| 13 | `A-AFTER-FULL` | approval = APPROVE_AFTER_FULL | 409 over-cap msg overCap; see DR-11 | waiting | the join oracle again | FULL | - |
| 14 | `A-OVER-LIMIT` | approval = APPROVE and capacity = OVER_QUOTA and role = COHOST_OWNER\|L1_OWNER | 409 over-limit msg overLimit; see DR-16 | waiting | the join oracle again | OVER_QUOTA | - |
| 15 | `A-OVER-LIMIT-ALL` | approval = APPROVE_ALL and capacity = OVER_QUOTA and role = COHOST_OWNER\|L1_OWNER | 200 body {admitted:0,declined:0,stillWaiting:1,message:allSomeFull} | waiting | the join oracle again | OVER_QUOTA | - |
| 16 | `A-APPROVE-ALL` | approval = APPROVE_ALL | 200 body {admitted:1,declined:0,stillWaiting:0} | admitted | 200 ticket | ROOM, OVER_QUOTA | - |
| 17 | `A-APPROVE` | approval = APPROVE | 200 body {ok:true,admitted:true,placedUnder:by-rule} | admitted | 200 ticket | ROOM, OVER_QUOTA | - |

Derivations:

- **rightRoles**: ORG and HOST always. COHOST_OWNER when the request's owner is 'c' and the request is not overlimit and the Co-host key is alive (not lifecycle cancelled_before_start, not reopen). L1_OWNER when the owner is 's', not overlimit, and guest invites are on. An overlimit request (open game, inviter list full) is on chain ',o,': only ORG and HOST.
- **wrongRoles**: COHOST_OTHER, L1_OTHER, L2_GUEST, AI_KEY, ANON, OTHER_ORG
- **inChain**: role in {ORG, HOST} or (role COHOST_OWNER and owner c and not overlimit) or (role L1_OWNER and owner s and not overlimit). COHOST_OTHER and L1_OTHER are never in the chain. (If the level-1 guest was themself put on a Co-host's list, that Co-host is also in the chain of the guest's requests: the fixture lists the anchor guest under the Organizer to avoid it.)
- **requestKinds**: Every JOIN case whose oracle result has waiting:true is a request: (audience, verify, route, state, capacity ROOM) = ordinary waiting request; (…, capacity OVER_QUOTA) in an open game = overlimit request (chain ',o,').
- **placedUnder**: request.overlimit -> the approver's own label (Organizer / Host <label>); else if capacity OVER_QUOTA and the approver is ORG or HOST -> the approver's own label; else the request owner's label (Organizer / Host <label> / Co-host <label> / Guest (ticket n)).
- **decisionCapacity**: APPROVE, APPROVE_ALL, DECLINE: ROOM or OVER_QUOTA (the target list is full; only when the owner is c or s and the request is not overlimit). APPROVE_AFTER_FULL: FULL. Others: ROOM.
- **decisionLifecycle**: The request is created at baseline (lifecycle none, or reopen for the reopen cases). The decision happens in the stated lifecycle.
- **afterApprove**: me?wid -> admitted; the phone re-sends the same join -> 200 ticket; person.inviter = placedUnder id, status joined; seat.inv = the level-1 seat when placed under 's'.

Placement of an approved person (`placedUnder`): the request owner's list, except that an overlimit request, or a request whose owner's list is full, is placed on the approver's own list (Organizer or Host). The re-join after approval always gives a ticket (200) unless the game has ended or been cancelled in between.

### 4.4 F-INPUT: the exact wrong-input answers
Profiles: `mobile` (verify mobile, any audience), `id.eo` / `either.eo` / `both.eo` (employees only), `id` / `either` / `both` (not employees only). `continue` means "the request is otherwise a normal outsider request (S04) and the join rules answer it". Message keys are expanded in 4.6.

| Defect | What | `mobile` | `id.eo` | `id` | `either.eo` | `either` | `both.eo` | `both` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D01 | nothing typed (no phone, no ID) | 400 `badMobile` | 400 need-id `needIdId` | 400 `idOrMobile` | 400 need-id `needIdEither` | 400 `mobileOrId` | 400 need-id `needIdBoth` | 400 `badMobile` |
| D02 | phone is only spaces | 400 `badMobile` | 400 need-id `needIdId` | 400 `idOrMobile` | 400 need-id `needIdEither` | 400 `mobileOrId` | 400 need-id `needIdBoth` | 400 `badMobile` |
| D03 | phone with letters | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` |
| D04 | phone with 5 digits | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` |
| D05 | phone with 9 digits | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` |
| D06 | phone with 10 digits that no Indian list would accept (starts with 5) [DR-04] | continue | continue | continue | continue | continue | continue | continue |
| D07 | phone with 16 digits | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` |
| D08 | +65 9123 4567 (8-digit Singapore number) | continue | continue | continue | continue | continue | continue | continue |
| D09 | +65 912 3456 (country code + 7 digits) (the server only checks 8..15 digits in all; per-country length is the page's soft stop) | continue | continue | continue | continue | continue | continue | continue |
| D10 | +91 98765 (too short after +91) | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` | 400 `badMobile` |
| D11 | employee ID with markup characters (checked in EVERY mode, also 'mobile' where the ID is never used) | 400 bad-id `badId` | 400 bad-id `badId` | 400 bad-id `badId` | 400 bad-id `badId` | 400 bad-id `badId` | 400 bad-id `badId` | 400 bad-id `badId` |
| D12 | employee ID of 31 characters | 400 bad-id `badId` | 400 bad-id `badId` | 400 bad-id `badId` | 400 bad-id `badId` | 400 bad-id `badId` | 400 bad-id `badId` | 400 bad-id `badId` |
| D13 | a well-formed employee ID that is on no list, no phone | 400 `badMobile` | 403 waiting `waiting` | 403 waiting `waiting` | 403 waiting `waiting` | 403 waiting `waiting` | 400 `badMobile` | 400 `badMobile` |
| D14 | a well-formed mobile number that is on no list, no ID | continue | continue | continue | continue | continue | continue | continue |
| D15 | mobile on no list plus an ID on no list | continue | 403 waiting `waiting` | 403 waiting `waiting` | 403 waiting `waiting` | 403 waiting `waiting` | 403 waiting `waiting` | 403 waiting `waiting` |
| D16 | consent boxes not ticked (otherwise a normal S04 request) | 400 consent-required `consent` | 400 need-id `needIdId` | 400 consent-required `consent` | 400 consent-required `consent` | 400 consent-required `consent` | 400 need-id `needIdBoth` | 400 consent-required `consent` |
| D17 | no device id (otherwise a normal S04 request) | 400 `refresh` | 400 need-id `needIdId` | 400 `refresh` | 400 `refresh` | 400 `refresh` | 400 need-id `needIdBoth` | 400 `refresh` |
| D18 | phone sent as a JSON number (9876543210) | continue | continue | continue | continue | continue | continue | continue |
| D19 | ID typed with spaces and lower case (' zz 1 ') (spaces are dropped and the ID is upper-cased before it is matched) | 400 `badMobile` | 403 waiting `waiting` | 403 waiting `waiting` | 403 waiting `waiting` | 403 waiting `waiting` | 400 `badMobile` | 400 `badMobile` |

Order of the checks that produce these answers (from the join route): unknown or removed personal token (404) -> unparseable phone (400 "Enter a valid mobile number.") -> ID with bad characters (400 `bad-id`) -> employees-only `need-id` (ID and both: no ID and no token; either: no ID and no phone and no token) -> identity missing (400, mode-specific text) -> ticks missing (400 `consent-required`) -> returning-phone branch -> game ended -> device id missing (400 "Please refresh this page and try again.") -> device already holds a ticket (409) -> full (409) -> waiting room or ticket.

### 4.5 F-PERM: what each actor may do to the lists
Ops: LIST, ADD (one new person), EXPORT, REMOVE_OWN, REMOVE_OTHERS (a person on another inviter's list), RESEND_OWN, MYSEAT (own play seat), WAITING_LIST. Lifecycle: `none` (before the start), `late_join` (started), `organizer_ends`, `cancelled_before_start`. All GET routes (LIST, EXPORT, WAITING_LIST) ignore a cancel; every write obeys it.

| # | Rule | when | Answer | ignores |
| --- | --- | --- | --- | --- |
| 1 | `P-AI` | caller = AI_KEY | 403 `aiRefusal` | lifecycle, invites |
| 2 | `P-ANON` | caller = ANON | 403 `noSign` | lifecycle, invites |
| 3 | `P-OTHER-ORG` | caller = OTHER_ORG | 403 `notAllowed` | lifecycle, invites |
| 4 | `P-L2` | caller = L2_GUEST | 403 `l2` | lifecycle, invites |
| 5 | `P-L1-OFF` | caller = L1 and invites = false | 403 `invitesOff` | lifecycle |
| 6 | `P-COHOST-CANCELLED` | caller = COHOST and lifecycle = cancelled_before_start | 403 `noSign` | invites |
| 7 | `P-ADD-ENDED` | caller = ORG\|HOST\|COHOST\|L1 and op = ADD and lifecycle = organizer_ends | 409 `addEnded` | invites |
| 8 | `P-L1-EXPORT` | caller = L1 and op = EXPORT | 403 `exportOnly` | - |
| 9 | `P-CANCELLED-WRITE` | caller = ORG\|HOST\|L1 and lifecycle = cancelled_before_start and op = ADD\|REMOVE_OWN\|REMOVE_OTHERS\|RESEND_OWN\|MYSEAT | 409 cancelled `cancelled` | invites |
| 10 | `P-COHOST-EXPORT` | caller = COHOST and op = EXPORT | 403 `exportOnly` | invites |
| 11 | `P-L1-MYSEAT` | caller = L1 and op = MYSEAT | 403 `ownSeat` | - |
| 12 | `P-REMOVE-OTHERS-SCOPED` | caller = COHOST\|L1 and op = REMOVE_OTHERS | 404 `noSuchPerson` | invites |
| 13 | `P-REMOVE-STARTED` | caller = COHOST\|L1 and op = REMOVE_OWN and lifecycle = late_join\|organizer_ends | 403 `removeStarted` | invites |
| 14 | `P-RESEND-STARTED` | caller = COHOST\|L1 and op = RESEND_OWN and lifecycle = late_join\|organizer_ends | 403 `resendStarted` | invites |
| 15 | `P-OK` | (always) | 200 (success: see okNotes) | invites |

Success answers: ADD: 200 {added:1}; MYSEAT: 200 {role: organizer|host|co-host}; EXPORT: 200 text/csv (ORG, HOST only); LIST: 200 {people:[...]}; REMOVE_OWN: 200 {ok:true, removed:1}; REMOVE_OTHERS: 200 {ok:true, removed:1} for ORG and HOST; RESEND_OWN: 200 {ok:true, link}; WAITING_LIST: 200 {waiting:[...]}.

Lifecycle 'none' = before the start, 'late_join' = started, 'organizer_ends' = ended. GET routes (LIST, EXPORT, WAITING_LIST) are never blocked by a cancel; every write is.

### 4.6 Exact message texts

| Key | Exact text |
| --- | --- |
| `cancelled` | This game was cancelled by the organizer. |
| `didNotStart` | This game did not start. Your details have been erased. |
| `ended` | This game has ended, so no one can join it now. |
| `locked` | This game could not begin because the organizer's payment is not complete. Please ask your organizer. |
| `linkGone` | This link is not valid any more. Please ask the person who invited you to send it again. |
| `needIdId` | Enter your employee ID. |
| `needIdBoth` | Enter your employee ID and your mobile number. |
| `needIdEither` | Enter your mobile number or your employee ID. |
| `badMobile` | Enter a valid mobile number. |
| `badId` | An employee ID has letters and numbers only. |
| `idOrMobile` | Enter your employee ID, or your mobile number if you have no employee ID. |
| `mobileOrId` | Enter your mobile number or your employee ID. |
| `consent` | Please tick the box to continue. |
| `refresh` | Please refresh this page and try again. |
| `removed` | You were removed from this game by the organizer. |
| `idUsed` | This employee ID already has a ticket on another phone. A ticket plays on one phone only. If it is you on a new phone, ask your organizer to move your ticket to this phone. |
| `linkUsed` | This link was already opened on another phone. If you are someone else, type your own mobile number to ask to join. If it is you on a new phone, ask whoever invited you to send the link again. |
| `otherPhone` | This ticket was opened in a different browser or app (or on another phone). A ticket plays on one device only. Open your link in the same browser or app you used first. If you cannot, ask your organizer to move your ticket to this phone. |
| `deviceUsedNew` | This phone already holds a ticket in this engagement. One phone, one ticket. Others can join from their own phones, using your invitation link if the organizer allowed it. |
| `deviceUsedUnbound` | This phone already holds a ticket in this engagement. One phone, one ticket. Ask the person to open the link on their own phone. |
| `full` | This engagement is full. |
| `waiting` | This engagement is by invitation. Your request is with {with}. You can come in as soon as they say yes. |
| `inviteFull` | This invitation has already been used by {limit} people, which is the most one person can invite. Your request is with the organizer. You can come in as soon as they say yes. |
| `declined` | This game could not add you. Please talk to whoever invited you. |
| `tooManyTries` | Too many tries with an employee ID that is not on the list. Please ask your organizer for help. |
| `waitingFull` | Many people are waiting for an answer right now. Please try again a little later. |
| `busy429` | It is busy right now. Please try again in a few minutes. |
| `busy503` | It is very busy right now. Please try again in a few minutes. |
| `notYours` | No such request. |
| `aiRefusal` | Names and mobile numbers are handled by people in the console, never by an AI assistant. Ask the owner to do this in the console. |
| `noSign` | Please sign in, or open your ticket link first. |
| `notAllowed` | Not allowed. |
| `l2` | Guests invited by a guest can play but cannot invite more people. |
| `invitesOff` | The organizer has not switched on guest invitations for this game. |
| `lapsedOne` | The game has ended, so this request has lapsed. |
| `lapsedAll` | The game has ended, so these requests have lapsed. |
| `overLimit` | Your list is full ({limit} people). Remove someone first. |
| `overCap` | This game is for {cap} people and all places are taken. |
| `allSomeFull` | Some lists are full, so those requests are still waiting. |
| `meWaiting` | Your request is with {with}. You can come in as soon as they say yes. |
| `meAdmitted` | You are in. Open your ticket again to join. |
| `meDeclined` | This game could not add you. Please talk to whoever invited you. |
| `meLapsed` | This game has ended. |
| `exportOnly` | Only the Organizer and Hosts can download a list. |
| `ownSeat` | Your ticket link is the one you were sent. |
| `noSuchPerson` | No such person on your list. |
| `removeStarted` | Once the game has started only the Organizer or a Host can remove people. |
| `resendStarted` | Once the game has started only the Organizer or a Host can send a link again. |
| `addEnded` | The game has ended, so no one can be added. |

## 5. Generator and runner pseudocode

```text
load oracle.json
PLAY      = [manual, auto]
PAIRS     = [(a, v) for a in audience for v in audience[a].verifyAllowed]            # PR-01
valid(a, v, state, life) = not matches(stateInvalidWhen[state], {verify: v, employeesOnly: audience[a].employeesOnly})   # PR-02
                           and state not in lifecycleStateInvalid[life]                                            # PR-03

function F_JOIN():
  seen = {}
  for (a, v) in PAIRS, route in ROUTES, state in STATES, life in LIFECYCLES, cap in CAPACITIES:
    if not valid(a, v, state, life): continue
    case = {audience:a, verify:v, route, state, capacity:cap, lifecycle:life}
    ans  = joinOracle(case)                      # walks join.rules
    rule = ans.rule
    if cap not in (rule.capacities or [ROOM]): continue                                  # PR-04
    if rule.ignores:                                                                     # PR-05
        key = rule.id + values of the dimensions NOT in rule.ignores
        if key in seen: continue
        seen.add(key)
    emit case, ans

function F_APPROVAL():
  requests = one per (audience, route, stateClass, identityKind, reqLife, overlimit)
             among F_JOIN cases (lifecycle none, or reopen for route COHOST) with ans.waiting == true   # PR-06, PR-10
  for rq in requests:
    base (lifecycle none):
      APPROVE, APPROVE_ALL           x right roles x {ROOM, OVER_QUOTA if the owner has a quota}
      DECLINE, APPROVE_AFTER_REMOVAL x right roles x ROOM
      APPROVE_AFTER_FULL             x right roles x FULL
      WRONG_ROLE                     x the six wrong roles x ROOM
      NEVER                          (no role)
    sweep (PR-11): for life in [pause_resume, late_join, organizer_ends, cancelled_before_start]:
      APPROVE x right roles, NEVER; for organizer_ends and cancelled also WRONG_ROLE x [COHOST_OTHER, L1_OTHER]
    reopen requests (route COHOST only): APPROVE x right roles, NEVER, WRONG_ROLE x COHOST_OTHER
    each emitted case is passed through approvalOracle and the same capacities/ignores pruning

function F_INPUT():  for d in defects, (a, v) in PAIRS:
    key = d.id + profile(a, v)   if the answer is fixed text,   else   d.id + a + v ("continue")
function F_PERM():   for caller, op, invites, life: dedupe by the matching rule's ignores

ALL = for play in PLAY: F_JOIN + F_APPROVAL + F_INPUT + F_PERM          # PR-09

runner(case):
  world  = build(audience settings, verify, anchors)          # recipes.anchors: L1, L2, L1b, a Host, two Co-hosts, an AI key, another organizer
  fixture(case.capacity, case.lifecycle, case.state, case.route)     # recipes.capacityFixtures / lifecycleFixtures / byState
  actual = send(request from recipes.byState[state][verify], with route parameters from recipes.routeParams)
  expect = oracle(case)
  assert actual.status == expect.status and actual.code == expect.code and actual.waiting == expect.waiting
         and actual.with == expect.with and text(actual.error) == text(expect.msg)
  if expect.final == new-ticket: assert person.inviter and seat.inv and jr as in oracle.join.finals
  if case is an approval: also assert the phone's /me?wid= state and the re-join answer
```

## 6. Counts (exact, from `node docs/flow/04-count-cases.mjs`)

| Family | Cases per play mode | Notes |
| --- | --- | --- |
| F-JOIN | 6779 | after the pruning chain above; 702 of them end in the waiting room |
| F-APPROVAL | 2336 | 87 distinct waiting requests (PR-10), base plus sweep (PR-11) |
| F-INPUT | 187 | 19 defects x profiles / outsider answers (PR-08) |
| F-PERM | 168 | raw 512 (8 callers x 8 ops x 2 x 4) -> 168 (PR-08) |
| **Per play mode** | 9470 |  |
| **FULL MATRIX (manual + auto)** | **18940** | both play modes, nothing else removed |
| Core matrix (auto, without the pause_resume replicate) | 7566 | the set to run on every change |
| Distinct answer signatures (auto) | 84 | how many different behaviours the cases exercise |

Breakdown of the auto cases:

- F-JOIN by audience: EMP_ONLY 1492, LIST 1614, LIST_INV 1614, ANYONE 284, EMP_ID_OTHERS 1488, ANYONE_INV 287
- F-JOIN by route: ORG 969, HOST 969, COHOST 984, PERSONAL 947, GUEST_L1 972, GUEST_L2 969, DIRECT 969
- F-JOIN by person state: S01 1089, S04 842, S05 476, S06 476, S07 476, S11 476, S02 572, S03 816, S08 528, S09 456, S10 572
- F-JOIN by capacity: ROOM 4736, PROMISED_ONLY 1338, FULL 672, OVER_QUOTA 33
- F-JOIN by lifecycle: none 1659, pause_resume 1659, late_join 1659, organizer_ends 1064, cancelled_before_start 42, reopen 696
- F-APPROVAL by outcome: APPROVE 915, APPROVE_ALL 220, DECLINE 169, APPROVE_AFTER_FULL 169, APPROVE_AFTER_REMOVAL 169, WRONG_ROLE 303, NEVER 391
- F-APPROVAL by decision lifecycle: none 1182, pause_resume 245, late_join 245, organizer_ends 343, cancelled_before_start 277, reopen 44
- F-APPROVAL by approver role: ORG 729, HOST 729, COHOST_OTHER 176, L1_OTHER 75, L2_GUEST 13, AI_KEY 13, ANON 13, OTHER_ORG 13, null 391, COHOST_OWNER 151, L1_OWNER 33
- Extension audience ANYONE_INV (all families): 382 of 9470; the five specified audiences alone give 9088 auto cases and 18176 with both play modes (the extension adds no case to F-INPUT/F-PERM audiences other than its own rows).

How to read them. The **full matrix** is every pruned case in both play modes. Because play mode and pause/resume are proven replicates (same oracle answer), the **core matrix** (auto only, without the pause_resume replicate) is the set to run on every change; the full matrix is for a nightly run, where each manual twin must equal its auto twin. The number of **distinct answer signatures** shows how few different behaviours the thousands of cases exercise: the matrix is wide because the combinations are real arrival situations for real actors, not because the server has thousands of rules.

## 7. The first 60 concrete named cases

Case ids are `<family>.<play>.<dimensions...>` and are what the generator prints with `--list`. F = F-JOIN, A = F-APPROVAL, I = F-INPUT, P = F-PERM. "Expected" is the oracle answer with the rule that gave it in square brackets. Cases 57 to 60 are manual-mode twins and must equal their auto cases (same answer).

| # | Case id | Given | Expected |
|---|---|---|---|
| 1 | `J.auto.EMP_ONLY.mobile.DIRECT.S01.ROOM.cancelled_before_start` | employees-only game, give mobile; arrives by the bare game address; listed by mobile; capacity ROOM; cancelled_before_start | 403 cancelled [J-GATE-CANCELLED] "This game was cancelled by the organizer." |
| 2 | `J.auto.EMP_ONLY.mobile.PERSONAL.S01.ROOM.reopen` | employees-only game, give mobile; arrives by a personal link; listed by mobile; capacity ROOM; reopen | 404 link-gone [J-LINK-GONE-REOPEN] "This link is not valid any more. Please ask the person who invited you to send it again." |
| 3 | `J.auto.EMP_ONLY.mobile.PERSONAL.S05.ROOM.none` | employees-only game, give mobile; arrives by a personal link; removed; capacity ROOM; none | 404 link-gone [J-LINK-GONE] "This link is not valid any more. Please ask the person who invited you to send it again." |
| 4 | `J.auto.EMP_ONLY.id.COHOST.S04.ROOM.none` | employees-only game, give ID; arrives by a Co-host's link; an outsider (not listed); capacity ROOM; none | 400 need-id [J-NEED-ID-ID] "Enter your employee ID." |
| 5 | `J.auto.EMP_ONLY.both.ORG.S04.ROOM.none` | employees-only game, give ID and mobile; arrives by the Organizer's link; an outsider (not listed); capacity ROOM; none | 400 need-id [J-NEED-ID-BOTH] "Enter your employee ID and your mobile number." |
| 6 | `J.auto.EMP_ONLY.mobile.GUEST_L1.S11.ROOM.none` | employees-only game, give mobile; arrives by a level-1 guest's invite link; returning on the same phone; capacity ROOM; none | 200 ticket [J-RETURNING] |
| 7 | `J.auto.EMP_ONLY.mobile.PERSONAL.S06.ROOM.none` | employees-only game, give mobile; arrives by a personal link; already joined on another phone; capacity ROOM; none | 423 link-used [J-LINK-USED] "This link was already opened on another phone. If you are someone else, type your own mobile number to ask to join. If it is you on a new phone, ask whoever invited you to send the link again." |
| 8 | `J.auto.EMP_ONLY.id.DIRECT.S06.ROOM.none` | employees-only game, give ID; arrives by the bare game address; already joined on another phone; capacity ROOM; none | 423 id-used [J-ID-USED-S06] "This employee ID already has a ticket on another phone. A ticket plays on one phone only. If it is you on a new phone, ask your organizer to move your ticket to this phone." |
| 9 | `J.auto.EMP_ONLY.mobile.ORG.S06.ROOM.none` | employees-only game, give mobile; arrives by the Organizer's link; already joined on another phone; capacity ROOM; none | 423 other-phone [J-OTHER-PHONE] "This ticket was opened in a different browser or app (or on another phone). A ticket plays on one device only. Open your link in the same browser or app you used first. If you cannot, ask your organizer to move your ticket to this phone." |
| 10 | `J.auto.EMP_ONLY.id.HOST.S09.ROOM.none` | employees-only game, give ID; arrives by a Host's link; types the ID of a joined colleague; capacity ROOM; none | 423 id-used [J-ID-USED-S09] "This employee ID already has a ticket on another phone. A ticket plays on one phone only. If it is you on a new phone, ask your organizer to move your ticket to this phone." |
| 11 | `J.auto.EMP_ONLY.mobile.COHOST.S01.ROOM.organizer_ends` | employees-only game, give mobile; arrives by a Co-host's link; listed by mobile; capacity ROOM; organizer_ends | 403 ended [J-ENDED] "This game has ended, so no one can join it now." |
| 12 | `J.auto.EMP_ONLY.mobile.ORG.S05.ROOM.none` | employees-only game, give mobile; arrives by the Organizer's link; removed; capacity ROOM; none | 403 removed [J-REMOVED] "You were removed from this game by the organizer." |
| 13 | `J.auto.EMP_ONLY.mobile.GUEST_L1.S07.ROOM.none` | employees-only game, give mobile; arrives by a level-1 guest's invite link; second ticket on the same phone; capacity ROOM; none | 409 device-used [J-DEVICE-USED] "This phone already holds a ticket in this engagement. One phone, one ticket. Others can join from their own phones, using your invitation link if the organizer allowed it." |
| 14 | `J.auto.EMP_ONLY.mobile.GUEST_L2.S01.FULL.none` | employees-only game, give mobile; arrives by a level-2 guest's invite link; listed by mobile; capacity FULL; none | 409 [J-FULL] "This engagement is full." |
| 15 | `J.auto.EMP_ONLY.mobile.DIRECT.S01.ROOM.none` | employees-only game, give mobile; arrives by the bare game address; listed by mobile; capacity ROOM; none | 200 ticket [J-LISTED] |
| 16 | `J.auto.EMP_ONLY.id.PERSONAL.S08.ROOM.none` | employees-only game, give ID; arrives by a personal link; types a wrong ID; capacity ROOM; none | 200 ticket [J-TOKEN-WINS] |
| 17 | `J.auto.EMP_ONLY.id.HOST.S10.ROOM.none` | employees-only game, give ID; arrives by a Host's link; types the ID of a listed colleague who has not joined; capacity ROOM; none | 200 ticket [J-IMPERSONATE] |
| 18 | `J.auto.EMP_ONLY.id.COHOST.S08.ROOM.none` | employees-only game, give ID; arrives by a Co-host's link; types a wrong ID; capacity ROOM; none | 403 waiting (waiting, with Ravi) [J-ID-MISS-WAIT] "This engagement is by invitation. Your request is with Ravi. You can come in as soon as they say yes." |
| 19 | `J.auto.EMP_ONLY.mobile.PERSONAL.S04.ROOM.none` | employees-only game, give mobile; arrives by a personal link; an outsider (not listed); capacity ROOM; none | 403 waiting (waiting, with Ravi) [J-UNLISTED-CLOSED] "This engagement is by invitation. Your request is with Ravi. You can come in as soon as they say yes." |
| 20 | `J.auto.ANYONE.mobile.COHOST.S04.OVER_QUOTA.none` | open game, give mobile; arrives by a Co-host's link; an outsider (not listed); capacity OVER_QUOTA; none | 409 invite-full (waiting, with the organizer) [J-OVER-QUOTA-OPEN] "This invitation has already been used by 100 people, which is the most one person can invite. Your request is with the organizer. You can come in as soon as they say yes." |
| 21 | `J.auto.ANYONE.mobile.COHOST.S04.PROMISED_ONLY.none` | open game, give mobile; arrives by a Co-host's link; an outsider (not listed); capacity PROMISED_ONLY; none | 409 invite-full (waiting, with the organizer) [J-PROMISED-OPEN-LIMITED] "This invitation has already been used by 100 people, which is the most one person can invite. Your request is with the organizer. You can come in as soon as they say yes." |
| 22 | `J.auto.ANYONE.mobile.DIRECT.S04.PROMISED_ONLY.none` | open game, give mobile; arrives by the bare game address; an outsider (not listed); capacity PROMISED_ONLY; none | 409 [J-PROMISED-OPEN] "This engagement is full." |
| 23 | `J.auto.ANYONE.mobile.ORG.S04.ROOM.none` | open game, give mobile; arrives by the Organizer's link; an outsider (not listed); capacity ROOM; none | 200 ticket [J-OPEN-NEW] |
| 24 | `A.auto.LIST.mobile.DIRECT.S04.NEVER.none.ROOM.pause_resume` | closed-list game, give mobile; request came by the bare game address (an outsider (not listed)); approval NEVER; list/capacity ROOM; pause_resume | no call; phone sees waiting; re-join 403 waiting [A-NEVER] |
| 25 | `A.auto.LIST.id.ORG.S08.WRONG_ROLE.AI_KEY.ROOM.none` | closed-list game, give ID; request came by the Organizer's link (types a wrong ID); approval WRONG_ROLE by AI_KEY; list/capacity ROOM; none | 403; phone sees waiting; re-join 403 waiting [A-AUTH-AI] "Names and mobile numbers are handled by people in the console, never by an AI assistant. Ask the owner to do this in the console." |
| 26 | `A.auto.LIST.id.ORG.S08.WRONG_ROLE.ANON.ROOM.none` | closed-list game, give ID; request came by the Organizer's link (types a wrong ID); approval WRONG_ROLE by ANON; list/capacity ROOM; none | 403; phone sees waiting; re-join 403 waiting [A-AUTH-ANON] "Please sign in, or open your ticket link first." |
| 27 | `A.auto.LIST.id.ORG.S08.WRONG_ROLE.OTHER_ORG.ROOM.none` | closed-list game, give ID; request came by the Organizer's link (types a wrong ID); approval WRONG_ROLE by OTHER_ORG; list/capacity ROOM; none | 403; phone sees waiting; re-join 403 waiting [A-AUTH-OTHER-ORG] "Not allowed." |
| 28 | `A.auto.LIST.id.ORG.S08.WRONG_ROLE.L2_GUEST.ROOM.none` | closed-list game, give ID; request came by the Organizer's link (types a wrong ID); approval WRONG_ROLE by L2_GUEST; list/capacity ROOM; none | 403; phone sees waiting; re-join 403 waiting [A-AUTH-L2] "Guests invited by a guest can play but cannot invite more people." |
| 29 | `A.auto.LIST.mobile.ORG.S04.WRONG_ROLE.L1_OTHER.ROOM.none` | closed-list game, give mobile; request came by the Organizer's link (an outsider (not listed)); approval WRONG_ROLE by L1_OTHER; list/capacity ROOM; none | 403; phone sees waiting; re-join 403 waiting [A-AUTH-L1-INVITES-OFF] "The organizer has not switched on guest invitations for this game." |
| 30 | `A.auto.LIST.mobile.COHOST.S04.WRONG_ROLE.COHOST_OTHER.ROOM.reopen.reqReopen` | closed-list game, give mobile; request came by a Co-host's link (an outsider (not listed)); approval WRONG_ROLE by COHOST_OTHER; list/capacity ROOM; reopen | 403; phone sees waiting; re-join 403 waiting [A-AUTH-COHOST-REVOKED] "Please sign in, or open your ticket link first." |
| 31 | `A.auto.LIST.id.GUEST_L1.S08.APPROVE.HOST.ROOM.cancelled_before_start` | closed-list game, give ID; request came by a level-1 guest's invite link (types a wrong ID); approval APPROVE by HOST; list/capacity ROOM; cancelled_before_start | 409 cancelled; phone sees waiting; re-join 403 cancelled [A-CANCELLED] "This game was cancelled by the organizer." |
| 32 | `A.auto.LIST.both.ORG.S08.WRONG_ROLE.COHOST_OTHER.ROOM.organizer_ends` | closed-list game, give ID and mobile; request came by the Organizer's link (types a wrong ID); approval WRONG_ROLE by COHOST_OTHER; list/capacity ROOM; organizer_ends | 404; phone sees lapsed; re-join 403 ended [A-NOT-IN-CHAIN] "No such request." |
| 33 | `A.auto.LIST.mobile.DIRECT.S04.APPROVE_AFTER_REMOVAL.ORG.ROOM.none` | closed-list game, give mobile; request came by the bare game address (an outsider (not listed)); approval APPROVE_AFTER_REMOVAL by ORG; list/capacity ROOM; none | 200; phone sees admitted; re-join 403 removed [A-AFTER-REMOVAL] |
| 34 | `A.auto.LIST.mobile.DIRECT.S04.APPROVE.ORG.ROOM.organizer_ends` | closed-list game, give mobile; request came by the bare game address (an outsider (not listed)); approval APPROVE by ORG; list/capacity ROOM; organizer_ends | 409; phone sees lapsed; re-join 403 ended [A-ENDED] "The game has ended, so this request has lapsed." |
| 35 | `A.auto.LIST.mobile.DIRECT.S04.DECLINE.ORG.ROOM.none` | closed-list game, give mobile; request came by the bare game address (an outsider (not listed)); approval DECLINE by ORG; list/capacity ROOM; none | 200; phone sees declined; re-join 403 declined [A-DECLINE] |
| 36 | `A.auto.LIST.mobile.DIRECT.S04.APPROVE_AFTER_FULL.ORG.FULL.none` | closed-list game, give mobile; request came by the bare game address (an outsider (not listed)); approval APPROVE_AFTER_FULL by ORG; list/capacity FULL; none | 409 over-cap; phone sees waiting; re-join 403 waiting [A-AFTER-FULL] "This game is for 14 people and all places are taken." |
| 37 | `A.auto.LIST.mobile.PERSONAL.S04.APPROVE.COHOST_OWNER.OVER_QUOTA.none` | closed-list game, give mobile; request came by a personal link (an outsider (not listed)); approval APPROVE by COHOST_OWNER; list/capacity OVER_QUOTA; none | 409 over-limit; phone sees waiting; re-join 403 waiting [A-OVER-LIMIT] "Your list is full (100 people). Remove someone first." |
| 38 | `A.auto.LIST.mobile.PERSONAL.S04.APPROVE_ALL.COHOST_OWNER.OVER_QUOTA.none` | closed-list game, give mobile; request came by a personal link (an outsider (not listed)); approval APPROVE_ALL by COHOST_OWNER; list/capacity OVER_QUOTA; none | 200; phone sees waiting; re-join 403 waiting [A-OVER-LIMIT-ALL] |
| 39 | `A.auto.LIST.mobile.GUEST_L2.S04.APPROVE_ALL.HOST.ROOM.none` | closed-list game, give mobile; request came by a level-2 guest's invite link (an outsider (not listed)); approval APPROVE_ALL by HOST; list/capacity ROOM; none | 200; phone sees admitted; re-join 200 ticket [A-APPROVE-ALL] |
| 40 | `A.auto.LIST.mobile.GUEST_L2.S04.APPROVE.HOST.ROOM.late_join` | closed-list game, give mobile; request came by a level-2 guest's invite link (an outsider (not listed)); approval APPROVE by HOST; list/capacity ROOM; late_join | 200; phone sees admitted; re-join 200 ticket [A-APPROVE] |
| 41 | `I.auto.EMP_ONLY.both.D01` | employees-only game, give ID and mobile; defect D01: nothing typed (no phone, no ID) | 400 need-id "Enter your employee ID and your mobile number." |
| 42 | `I.auto.EMP_ONLY.both.D03` | employees-only game, give ID and mobile; defect D03: phone with letters | 400 "Enter a valid mobile number." |
| 43 | `I.auto.LIST_INV.mobile.D06` | closed-list game with guest invites, give mobile; defect D06: phone with 10 digits that no Indian list would accept (starts with 5) | 403 waiting (waiting, with the organizer) [J-UNLISTED-CLOSED] "This engagement is by invitation. Your request is with the organizer. You can come in as soon as they say yes." |
| 44 | `I.auto.EMP_ONLY.both.D11` | employees-only game, give ID and mobile; defect D11: employee ID with markup characters | 400 bad-id "An employee ID has letters and numbers only." |
| 45 | `I.auto.EMP_ONLY.both.D13` | employees-only game, give ID and mobile; defect D13: a well-formed employee ID that is on no list, no phone | 400 "Enter a valid mobile number." |
| 46 | `I.auto.LIST.id.D15` | closed-list game, give ID; defect D15: mobile on no list plus an ID on no list | 403 waiting (waiting, with the organizer) "This engagement is by invitation. Your request is with the organizer. You can come in as soon as they say yes." |
| 47 | `I.auto.EMP_ONLY.both.D16` | employees-only game, give ID and mobile; defect D16: consent boxes not ticked (otherwise a normal S04 request) | 400 need-id "Enter your employee ID and your mobile number." |
| 48 | `P.auto.AI_KEY.LIST.inv1.none` | AI_KEY does LIST; guest invites on; none | 403 [P-AI] "Names and mobile numbers are handled by people in the console, never by an AI assistant. Ask the owner to do this in the console." |
| 49 | `P.auto.ANON.LIST.inv1.none` | ANON does LIST; guest invites on; none | 403 [P-ANON] "Please sign in, or open your ticket link first." |
| 50 | `P.auto.OTHER_ORG.LIST.inv1.none` | OTHER_ORG does LIST; guest invites on; none | 403 [P-OTHER-ORG] "Not allowed." |
| 51 | `P.auto.L2_GUEST.LIST.inv1.none` | L2_GUEST does LIST; guest invites on; none | 403 [P-L2] "Guests invited by a guest can play but cannot invite more people." |
| 52 | `P.auto.L1.LIST.inv0.none` | L1 does LIST; guest invites off; none | 403 [P-L1-OFF] "The organizer has not switched on guest invitations for this game." |
| 53 | `P.auto.COHOST.LIST.inv1.cancelled_before_start` | COHOST does LIST; guest invites on; cancelled_before_start | 403 [P-COHOST-CANCELLED] "Please sign in, or open your ticket link first." |
| 54 | `P.auto.ORG.ADD.inv1.organizer_ends` | ORG does ADD; guest invites on; organizer_ends | 409 [P-ADD-ENDED] "The game has ended, so no one can be added." |
| 55 | `P.auto.ORG.ADD.inv1.cancelled_before_start` | ORG does ADD; guest invites on; cancelled_before_start | 409 cancelled [P-CANCELLED-WRITE] "This game was cancelled by the organizer." |
| 56 | `P.auto.L1.MYSEAT.inv1.none` | L1 does MYSEAT; guest invites on; none | 403 [P-L1-MYSEAT] "Your ticket link is the one you were sent." |
| 57 | `J.manual.EMP_ONLY.mobile.DIRECT.S01.ROOM.none` | MANUAL-MODE twin: employees-only game, give mobile; arrives by the bare game address; listed by mobile; capacity ROOM; none | 200 ticket [J-LISTED] |
| 58 | `J.manual.EMP_ONLY.id.COHOST.S08.ROOM.none` | MANUAL-MODE twin: employees-only game, give ID; arrives by a Co-host's link; types a wrong ID; capacity ROOM; none | 403 waiting (waiting, with Ravi) [J-ID-MISS-WAIT] "This engagement is by invitation. Your request is with Ravi. You can come in as soon as they say yes." |
| 59 | `J.manual.ANYONE.mobile.COHOST.S04.OVER_QUOTA.none` | MANUAL-MODE twin: open game, give mobile; arrives by a Co-host's link; an outsider (not listed); capacity OVER_QUOTA; none | 409 invite-full (waiting, with the organizer) [J-OVER-QUOTA-OPEN] "This invitation has already been used by 100 people, which is the most one person can invite. Your request is with the organizer. You can come in as soon as they say yes." |
| 60 | `J.manual.EMP_ONLY.mobile.DIRECT.S01.ROOM.cancelled_before_start` | MANUAL-MODE twin: employees-only game, give mobile; arrives by the bare game address; listed by mobile; capacity ROOM; cancelled_before_start | 403 cancelled [J-GATE-CANCELLED] "This game was cancelled by the organizer." |

## 8. Doubtful oracle rows

Rows where the code's behaviour looks wrong, surprising, or in conflict with a design document. The oracle follows the **code** (it is what a test will observe); each row says what to ask the product owner. Line numbers are for the working tree named at the top.

| Id | Severity | What looks wrong | Oracle rows | File:line | Why it matters |
| --- | --- | --- | --- | --- | --- |
| DR-01 | high | Any phone can take a listed colleague's place by typing their employee ID | J-IMPERSONATE (state S10; verify id\|either; every audience) | apps/edge/src/worker.ts:1603-1607 (the ID is looked up first and the listed person is adopted); 1650-1656 (only MISSES are throttled) | A listed ID that has not been used yet is treated as proof of identity: the first phone that types it gets the ticket, in an employees-only game too, and the real employee later gets 423 id-used (rule J-ID-USED-S09). An employee ID is not a secret, and a correct guess is never counted or limited. The people spec says a typed number is only 'matched, not proven'; for IDs nobody asked the organizer. |
| DR-02 | medium | An outsider (or a typo) in an OPEN game is parked in the waiting room with a message that is wrong for open games | J-ID-MISS-WAIT (S08, S09 in 'both'; audience EMP_ID_OTHERS, and every closed audience) | apps/edge/src/worker.ts:1649 (idMiss = true), 1699 (if (e.closed \|\| idMiss) return wait(false, null)) | In an open 'employees by ID, others by mobile' game anybody who types an ID that is on no list waits for approval and is told 'This engagement is by invitation', although the game is open and the console tells the organizer 'you do not need to approve anyone'. Every mistyped ID is a new waiting row (500 rows block everybody: waiting-full). Same as docs G9. |
| DR-03 | low | Admitting a request that carried someone else's ID creates a second person with the same employee ID | A-APPROVE after J-ID-MISS-WAIT (S09, verify both) | apps/edge/src/people.ts:493 (admitInsert copies the waiting row's sealed details, empId included), worker.ts:1699 | In 'both' mode the identity is the mobile number, so joining still works, but the organizer's list then shows two people with the same employee ID, and a later switch of the game to 'id' or 'either' makes that ID ambiguous. |
| DR-04 | medium | The join accepts mobile numbers that the people lists refuse | I-D06 (and any S04 request with a 10-digit number starting 0 to 5) | apps/edge/src/worker.ts:1493-1496 (digitsOf: any 10 to 15 digits) against apps/edge/src/phonekit.ts:16 (India must start 6-9) | 5123456789 joins and gets a ticket, but the same number can never be put on a list, so the organizer cannot pre-list or move this person, and the hash (last 10 digits) can collide with a real listed number. Docs G15. |
| DR-05 | high | A stranger using someone else's personal link in an OPEN game gets a ticket at once | J-OPEN-NEW with route PERSONAL, state S04 (ANYONE, ANYONE_INV, EMP_ID_OTHERS) | apps/edge/src/worker.ts:1615 (otherNumber), 1671 (owner = tok.inviter), 1699 (waiting only if closed or idMiss) | docs/ROLES_AND_CONSOLE_SPEC_3.md line 10 and join_design.json row 10 say a different number on a personal link goes to the waiting room. In an open game it does not: the stranger is seated under the link owner's list and uses up that Co-host's quota. In a closed game the code does wait (rule J-UNLISTED-CLOSED). |
| DR-06 | medium | Stale, forged, revoked or level-2 links silently credit the organizer | J-UNLISTED-CLOSED / J-OPEN-NEW with route GUEST_L1 while invitations are off, GUEST_L2, COHOST under lifecycle reopen | apps/edge/src/worker.ts:1672-1680 (owner stays null -> target 'o'; via is still 'common-link') | The person is not told and the owner is not told. The waiting row and the People list say 'common-link' and 'Organizer', so the Co-host or guest who shared the link loses the attribution and the 'brought by' count. |
| DR-07 | high | A guest who comes in through a LEVEL-2 guest's link becomes a person who CAN invite | J-OPEN-NEW / A-APPROVE with route GUEST_L2 (audience ANYONE_INV, LIST_INV) | apps/edge/src/worker.ts:1675-1679 (an L2 inviter gives owner = null) with 1703-1708 (inviter 'o', seat.inv stays null); apps/edge/src/people.ts:136 (only seat.inv !== null is refused) | Confirmed with the real Worker: the newcomer's seat has inv = null and GET /people for that ticket answers 200 with limit 4. The code comment at worker.ts:1677 says such a link 'records no inviter', but the newcomer becomes a level-1 guest. A level-2 guest can therefore mint unlimited level-1 guests, each with a fresh quota: the two-level rule can be extended one hop for ever. |
| DR-08 | medium | Open game, inviter at the limit: the person is parked instead of falling back to the organizer | J-OVER-QUOTA-OPEN (capacity OVER_QUOTA; routes COHOST, PERSONAL, GUEST_L1 with invites) | apps/edge/src/worker.ts:1701 (return wait(true, limit)); apps/edge/src/people.ts:604 (chain ',o,') | The 101st person on a Co-host's open link, or the 5th on a guest's, waits for the Organizer or a Host with 'This invitation has already been used by N people'. docs/handover-2026-10-26/join_design.json (matrix row 7, gap G17) says an open game should simply seat them under the organizer; ROLES_AND_CONSOLE_SPEC_3.md line 11 says they go to the waiting room. The two documents disagree; the code follows the spec. |
| DR-09 | medium | 'Places reserved for listed people' is reported as 'used by N people' or as a plain 'full' | J-PROMISED-OPEN-LIMITED and J-PROMISED-OPEN (capacity PROMISED_ONLY, open game, state S04) | apps/edge/src/worker.ts:1508 (addSeat guard counts unseated listed people), 1710 (row null -> guardId !== null ? wait(true, guardLimit) : 'This engagement is full.') | A stranger who arrives while the last places belong to listed people who have not come yet gets either 409 invite-full 'already used by 100 people' (through a Co-host or guest link) or 409 'This engagement is full.' with no code, although participants < cap. Neither message says the places are reserved. Docs G18. |
| DR-10 | medium | Full beats waiting, and a listed person can be locked out by a lowered size | J-FULL (capacity FULL), every state that reaches the capacity check | apps/edge/src/worker.ts:1665-1666 (participants >= cap -> 409, no code, before the waiting room); apps/edge/src/worker.ts:2055 (settings only refuse a cap below the number of PARTICIPANTS, not below the number of listed people) | (a) An unlisted person in a closed game gets 'full' instead of a waiting request while the game is full; (b) the organizer can lower the size below the list length, after which people who are listed but have not joined get 409 'This engagement is full.' with no warning to the organizer; (c) the answer has no code (join_design.json wants code 'full'). |
| DR-11 | medium | Approve when all list places are taken: the approver is refused, the person is not told | A-AFTER-FULL (capacity FULL; every right role) | apps/edge/src/people.ts:513 (counts PERSON rows against cap) versus apps/edge/src/worker.ts:1665 (counts PARTICIPANT rows) | Admit answers 409 over-cap and the request stays 'waiting'; GET /me?wid= keeps saying 'Your request is with ...' and the phone's re-join keeps answering 403 waiting until the participants reach cap, then flips to 409 full. Capacity is counted three ways (persons, participants, unseated listed people), so the same moment can look full to one screen and open to another. |
| DR-12 | medium | A decline is permanent for that identity | A-DECLINE then any re-join (J-UNLISTED-CLOSED) | apps/edge/src/people.ts:601 (addWaiting returns the existing row, declined included), 505 (admit on a declined row answers already:declined), 328-329 (only listing the person overrides) | After a decline every later request from that mobile number or ID answers 403 declined for ever; a Co-host who declined by mistake cannot reverse it from the waiting list and the Organizer's Admit does nothing. Docs G19. |
| DR-13 | low | Latent: an approver in the chain can put back a person the Organizer removed | A-AFTER-REMOVAL (reachable order) versus a stale 'waiting' row | apps/edge/src/people.ts:519 and 559 (admitRevive un-removes the person and un-blocks the seat) | Listing a waiting person flips the request to admitted, so with the normal order of events the revive path cannot run (rule A-AFTER-REMOVAL answers already:admitted). It can run when a waiting row and a removed person row exist together (a race, or rows made by the legacy roster/reuse calls); then a Co-host in the chain overrides the Organizer's removal, which the people route itself refuses (people.ts:300). |
| DR-14 | medium | After cancel and reopen every Co-host is gone, silently | lifecycle reopen: route COHOST, approver COHOST_OWNER | apps/edge/src/cancel.ts:151 (eraseCohostsSql revokes the keys), reopenGame (cancel.ts:94-130) never restores them | Co-host links keep working as 'common links' but credit the organizer (DR-06) and Co-host consoles answer 403 'Please sign in'. The reopen e-mail talks about guests who must join again but says nothing about Co-hosts. |
| DR-15 | low | 'Approve all' by a Co-host or guest outside the chain answers 200 with zeros, single approve answers 404 | A-NOT-IN-CHAIN versus APPROVE_ALL | apps/edge/src/people.ts:504 versus 534-538 | Two different answers for the same non-right role. Harmless but inconsistent, and the 200 hides that the caller had no right at all. |
| DR-16 | low | Admit when the target list is full silently re-attributes the person to the approver; the Co-host or guest only sees a refusal | A-OVER-LIMIT and A-APPROVE with capacity OVER_QUOTA | apps/edge/src/people.ts:510-512 | A Co-host or guest who tries to admit into a full list gets 409 'Your list is full'; the Organizer or a Host admitting the same request places the person on their OWN list, so the Co-host's 'people brought' count under-reports and the person's inviter changes. |
| DR-17 | low | A returning phone is never re-verified | J-RETURNING (S11) | apps/edge/src/worker.ts:1621-1639 | In 'both' mode a returning participant gets 200 again with a wrong or missing ID, and returning calls skip the per-network join limit. Docs G30 / doc 01 GAP-21. |
| DR-18 | medium | Console choice 2 'My employees, plus their friends and family' cannot be stored as designed | audience LIST_INV with verify id\|either\|both (the nearest shape) | packages/beacon/src/config.ts:332 (employeesOnly forces guest invites off); docs/ORGANIZER_FLOW_DESIGN_2026-10-25.md table row 2 ('list + employees + guests may invite') | The server cannot hold 'employees only' and 'guests may invite' together. The matrix therefore uses employeesOnly=false with verify id\|either\|both; the consequence is that an unlisted ID waits for the organizer instead of being refused as 'not an employee' (rule J-ID-MISS-WAIT), and 'employees only' is not enforced. |
| DR-19 | medium | 'Employees only' is enforced differently per verify mode, and a personal link skips it | J-NEED-ID-ID, J-NEED-ID-BOTH versus J-UNLISTED-CLOSED (EMP_ONLY, verify mobile\|either) and route PERSONAL | apps/edge/src/worker.ts:1600-1601 (need-id only for id and both, only when there is no token) | In an employees-only game with verify 'id' or 'both' a stranger with only a mobile number is refused (400 need-id); with verify 'either' or 'mobile' the same stranger is parked in the waiting room; and anyone holding ANY personal link plus their own mobile number also reaches the waiting room of an ID game without typing an ID. |
| DR-20 | low | Removed / link-gone / need-id are disclosed before the consent check | J-LINK-GONE, J-REMOVED, J-NEED-ID-* | apps/edge/src/worker.ts:1590, 1600-1601, 1622, 1654-1656 (consent checked later) | The comment at worker.ts:1658 says the point of asking for the ID after consent is that 'an untick-and-ask cannot be used to find out who is on the list', but a request with no ticks still learns whether a number belongs to a removed person. Doc 01 GAP-09. |
| DR-21 | low | Manual (Host-pressed) games take a join round from the wall clock | lifecycle late_join with playMode manual | apps/edge/src/worker.ts:1503 (lateNow uses roundOfMs(now)) | Not verified in the phones' game code: in manual mode the numbers are not clock-driven, so the join round stored on a late ticket may not match the numbers actually called. A question for the product owner rather than a confirmed defect. |
| DR-22 | low | Wrong-input answers have no 'code' in several places | I-D01, I-D02, I-D13, I-D17 (profiles id, either, both, mobile) | apps/edge/src/worker.ts:1596, 1612, 1658 | 'Enter a valid mobile number.', the two 'give an ID or a mobile' messages and 'Please refresh this page' carry no code while the employees-only variants carry need-id, so a page can only tell them apart by their text. Doc 01 GAP-08. |
| DR-23 | medium | The brief's three-level chain (participant, guest level 1 who may invite, guest level 2 who cannot) is not what the code has: it has two levels | route GUEST_L1 versus GUEST_L2; approver L1_OWNER versus L2_GUEST; perm caller L1 versus L2_GUEST | apps/edge/src/people.ts:136 (seat.inv !== null cannot invite), apps/edge/src/worker.ts:1675-1679 (only a seat with inv === null or a team role can own a link); docs/ROLES_AND_CONSOLE_SPEC_3.md line 7 | In the code the participant who invites is 'level 1' and everybody they bring is 'level 2 (plays, no list, no invites)'. If the product wants a guest who was invited by a participant to be able to invite in turn, that capability does not exist; the matrix follows the code (GUEST_L1 = a participant who may invite, GUEST_L2 = a guest who may not). Ask the owner which model is intended before writing tests for 'guest level 1 invites'. |
| DR-24 | low | After an erase and a reopen, an old guest link may point at a different person | lifecycle reopen with route GUEST_L1 / GUEST_L2 (inferred from the code, not exercised) | apps/edge/src/worker.ts:1675-1679 (the guest link looks the inviter up by seat number) with the seat numbering in addSeat (worker.ts:1508: MAX(seq)+1 over an empty table starts again at 1) | Seat numbers restart after the guest data is erased, so a stale from=<seat> link silently credits whoever now holds that seat number and spends that person's quota. The oracle assumes nobody holds the seat yet (the link falls back to the organizer). Worth a test before relying on the guest feature across a cancel. |

## 9. How the oracle was checked, and its limits

Method. A throwaway harness (kept outside the repository, in the session scratch directory) built a real Worker world with the repository's own test helpers (`makeD1`, `with-terms.handle`: the real `handle()` over an in-memory SQLite stand-in for D1, the same setup the existing `*.test.ts` files use), created the fixtures named in `oracle.recipes`, sent the case's request, and compared status, code, waiting flag, "with" name, message text, the stored inviter, seat.inv and jr with the oracle's answer. Nothing in the repository's source or tests was changed; no network and no browser were used.

- **F-JOIN, capacity ROOM, lifecycles none / pause_resume / late_join / organizer_ends (shared worlds)**: 4256 of 4256 cases agree with the real Worker.
- **F-JOIN, lifecycles cancelled_before_start and reopen (a fresh world for every case; reopen is emulated: a real reopen needs a paid game and a payment, so the harness cancels, deletes the guest rows, clears the cancel mark and loads the lists again)**: 657 of 1135 cases agree with the real Worker, 478 disagree.
- **F-JOIN, capacities FULL / PROMISED_ONLY / OVER_QUOTA (a fresh world per case; the harness fills the game, lowers or raises the size, or fills the Co-host's list)**: not run.
- **F-APPROVAL (a fresh world per case; the harness makes the request, builds the capacity and lifecycle fixture, makes the decision as the role, then reads /me?wid= and re-sends the join)**: not run.
- **F-PERM**: 512 of 512 agree (every caller x op x invites x lifecycle combination, before pruning).
- **F-INPUT**: 152 of 152 agree (19 defects x 8 world profiles).

Limits, said plainly:

- The harness runs the Worker in-process. It proves the answers of the server's code, not what the phone's page shows or what Cloudflare D1 does under real concurrency (the "crowd at the same instant" races covered by `people.test.ts` are not part of this matrix).
- `reopen` is emulated (above). `pause_resume` was not exercised on a live pause file: it is a replicate by reading the code (no read of the control file anywhere in the join, people or waiting routes).
- The early "stop" by the organizer ends the game through the same `endBoundMs` as the schedule; the harness used a time after the scheduled end.
- Capacity fixtures for the paid/unpaid difference were made by setting `pack` directly; the `locked` gate (unpaid and past start minus 45 s: 403 `locked`) is an extra rule that is not crossed because no listed dimension covers payment state.
- The `mismatches` of a later run mean either the code changed or the oracle is wrong; do not edit the expectation to make a test pass without deciding which.

## 10. Summary

1. Dimension sizes: play mode 2, verification 4, audience 5 specified (+1 extension = 6), arrival route 6 specified (7 used), person state 9 specified (11 used), approval outcome 7 specified (8 used), approver role 10, capacity 3 specified (4 used), lifecycle 6.
2. Families: F-JOIN, F-APPROVAL, F-INPUT (exact wrong-input messages), F-PERM (actor permissions); pruning rules PR-01 to PR-11 remove impossible and answer-identical combinations.
3. Raw F-JOIN cross 44352; after pruning 6779 join cases per play mode; plus 2336 approval, 187 input and 168 permission cases.
4. **Total after pruning: 9470 cases per play mode, 18940 in the full matrix (manual + auto)**; the core matrix to run on every change is 7566.
5. Those 18940 cases collapse to 84 distinct answer signatures, so the matrix is wide but the behaviour is small and checkable.
6. The oracle is ordered decision tables in JSON (23 join rules, 17 approval rules, 19 defects, 15 permission rules, 49 exact messages) plus a Node script that enumerates and evaluates it.
7. Checked against the real Worker: 4913 of 5391 join/approval cases agree, plus 664 of 664 permission and input cases.
8. Doubtful oracle rows: **24** (3 high, 12 medium, 9 low); the most serious are DR-01 (a typed ID is accepted as proof), DR-05 (a personal link used by a stranger in an open game), DR-07 (a level-2 link mints a new level-1 guest).
9. The tree moved while this was written (the ended/locked gates and the admitted override appeared); the oracle follows the final state and names the file hashes it was bound to.
10. Files: docs/flow/04-use-case-dimensions-and-oracle.md, docs/flow/04-use-case-oracle.json, docs/flow/04-count-cases.mjs; nothing else in the repository was touched.
