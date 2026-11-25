# Release 1.11.3 (25 Nov 2026): the mark १३९ at the top of every page - not deployed

Owner order, the same in every FChecklist repository. No secret, key or personal address is in this file.

## What is new
The three numerals `१३९` sit at the very top centre of every page: 6px, bold, dark blue `#0B2A6B`, with a 0.5px dark red `#7A1010` line under them, only as wide as the numerals. Position absolute (no content moves), `pointer-events:none`, `user-select:none`, `aria-hidden="true"`.

## Where
Static pages: every `*.html` in `apps/web/public` and `pack/gamelog.html` (CSS inline; `z.html` and `zc.html` use `app.css` because their policy allows no inline style). Built pages: `admin.ts`, `people.ts` (2), `v2-certs.ts`, `trust-page.ts` (all use `apps/edge/src/mark139.ts`) and `packages/billing/src/index.ts` (invoice, own copy). Guard: `apps/edge/test/mark139.test.ts`. A NEW page must carry the mark once and be added to that test's list if it is built in code.

## Open
Deploy needs the usual audits. E-mails and raster pictures have no mark.
