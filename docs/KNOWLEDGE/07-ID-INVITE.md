# ID-only invite (release 1.10.0, 21 Nov 2026) - not deployed

Owner rule, 20 Nov 2026: people are invited with ONLY an ID (employee, associate, vendor or customer ID). No name, no mobile number, no e-mail.

## How it works
- One ID rule for every game (`normEmpFor` in `apps/edge/src/empid.ts`): every character that is not a letter or a number is dropped, then capitals. A-1101, A 1101 and A/1101 are one ID, at upload, join, approval and matching. Games made before the rule are also looked up in their older form (`legacyEmpFor`); stored hashes are never rewritten.
- A game is an ID game when its stored `verify` is `"id"`. The default console (`apps/web/public/pack/zc-flow.js`) sends it when it creates the game and when step 2 is saved. The previous screens (`zc.js`) send it too.
- Join (`POST /api/z/{id}/join`): a listed ID gets one ticket (any spelling); an ID not on the list waits for the Organizer's yes or no; in a list-only game a phone number with no ID waits. In a game that anyone with the link may join (made only through the API, the new screens never make one) a person who gives only a mobile number still comes in at once: that is the older, tested design for outsiders and was left as it is (owner's choice). Wrong IDs are counted per network per game per 10 minutes.
- Invite and approval log: `GET /api/z/{id}/people/log`. ID only. Organizer and Hosts see all rows; a Co-host only their own; a guest ticket is refused (403).
- The list, the waiting requests, the `idx/` and `idmiss/` keys and the log are erased with the players' data, 24 hours after the game.

## Where the tests are
- `apps/edge/test/id-invite.test.ts`, `id-invite-audit2.test.ts` (server rules, each protection proven red when removed).
- `apps/web/test/id-invite-pages.test.ts`, `zc-flow-id-default.test.ts` (screens; the second drives the default console against the real Worker with no manual PATCH).

## Open
1. The shared console pack is vendored from the console repo: the `verify: "id"` change and the "reason next to the count" change in `zc-flow.js` must be made there too (`feat/id-invite-pack-2026-11-20`), or the next `tools/vendor-pack.mjs` run puts the old file back.
2. Live data cannot be read from the cloud: whether any live game holds IDs stored in the older form with punctuation is unknown. Such an ID is found only if the invitee types the same punctuation. Check the live database before the deploy.
3. The version number is the top entry of `apps/edge/src/releases.json`; `/version.json` is written by the build (`bun run pages:deploy`), it is not a file in the repository.
4. Audit 2 (M2, M3) left for the owner: IDs can be guessed because only wrong IDs are counted (30 per network per 10 minutes); the waiting room holds 500 (`WAITING_MAX`). A cap that counts right IDs too would lock out an office behind one address.

## Release 1.10.2 (21 Nov 2026) - stacked on 1.10.1, not deployed
PRs #22 (ordinal names 21st/22nd/23rd), #23 (F28 finale scratch card) and #25 (organizer's limited AI key `cta_` may make the pay link) were re-applied on top of 1.10.1 as one release. Nothing in the ID-invite behaviour above changed. The service-worker cache is `ct-game-v45`. See CHANGELOG.md, section 1.10.2.
