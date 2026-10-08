# Phase 2 server: what actually exists (use this, not guesses)

Built in `apps/edge/src/worker.ts` (+ helpers), migration `apps/edge/migrations/0016_people.sql`, tests `apps/edge/test/people.test.ts`. Authoritative detail: `docs/dev/04-API-REFERENCE.md`.

- Callers: Organizer and Host (all of their game); Co-host (own list, key bound to its game); participant level 1 identified by pid via `?me=<pid>` or header `x-ct-pid` or `me` in the body; level 2: none; an AI key gets 403 on every people/waiting route.
- `GET /api/z/{id}/people[?limit=&offset=&all=1]` -> `{people:[{id,name,maskedPhone,status:'invited'|'joined'|'removed',link,waLink,inviter?,approvedBy?}], limit, used, total, cap, offset, waiting, whoCanJoin, role, canExport, commonLink}` (waiting requests are NOT in `people`; use `/waiting`).
- `POST /api/z/{id}/people {people:[{name,phone}]}` (max 200 per request; chunk bigger uploads) -> `{added,duplicates,invalid:[{raw,why}],people}`; 409 `over-limit` / `over-cap` with a calm message.
- `POST /api/z/{id}/people/{pid}/remove {withTheirPeople?}` -> `{ok,removed,during}`; `POST .../resend {phone?}` -> `{link,waLink}` (phone only if not joined).
- `GET /api/z/{id}/waiting` -> `{waiting:[{id,firstName,last4,via,at}], approved:[{name,last4,decision,by,ms}]}`; `POST /waiting/{wid} {decision:'admit'|'decline'}`; `POST /waiting/all {decision}` -> `{admitted,declined,stillWaiting,message?}`.
- `GET /api/z/{id}/people/export[?all=1]` CSV, Organizer and Host only.
- `GET|POST /api/z/{id}/people/me` creates/returns the caller's own play seat (Organizer/Host/Co-host personal play link; 400 `need-phone` if no mobile is known).
- `GET /api/z/{id}/me?pid=<pid>` or `?wid=<wid>` public status for phones: admitted / declined / lapsed / removed / waiting.
- `join` additionally accepts `token` (personal link). Responses: 403 `{waiting:true,wid,code:'waiting',with}` (list mode, number not listed), 409 `{code:'invite-full',waiting:true,wid}` (link owner's limit passed), 403 `removed`, 423 `{code:'link-used',needPhone:true}`, 404 `link-gone`; `role` returned for team seats.
- `PATCH /api/z/{id}/settings` and `info`/`summary` carry `whoCanJoin:'list'|'anyone'`, `coHostLimit` (10..1000, default 100), `guestInvites {on,per 1..10}`; `closed` stays as an alias; `POST /api/z` accepts `whoCanJoin` (API default 'anyone'; the console sends 'list').
- Personal link: `GET /j/<token>` (Worker + Pages function `pages/functions/j/[[path]].ts`, `/j/*` in `_routes.json`) -> Open Graph page then redirect to `z.html?e=<id>&t=<token>`.
- Common-link codes (`from=`): Organizer 1900000000, Hosts 1500000000+, Co-hosts 1000000000+, a guest = their seat number. `commonLink` in `GET /people` is ready to use.
- `POST /api/org/host {label, mobile (required), email}` (AI key 403); `POST /api/org/cohost {label, phone, e}`; removed person's prize shows `notGiven:'removed'`.
- A join now costs 3 D1 writes (was 2).

# The phone page (z.js) must

Read `t` from the URL and send it as `token` in `join`; on `needPhone:true` ask for a number and resend; on `waiting:true` + `wid` show the calm waiting message and poll `GET /me?wid=` until admitted (then `join` again), declined or lapsed; on 403 `removed` and via `GET /me?pid=` show "removed" and stop; show the level-1 **My invites** card (list, add, send on WhatsApp, remove, resend using `/people?me=pid`); nothing for level 2; show the cancelled screen (`info.cancelled`).

# Console switch-over

Replace the in-memory `peopleWorld()` stub in `apps/web/test/pages.test.ts` with the real Worker; send `whoCanJoin`, `guestInvites`, `coHostLimit` via `PATCH settings`; chunk uploads at 200; use `/people/me` for Play now / Send my play link; use `commonLink`/`waLink`; export only for Organizer/Host.
