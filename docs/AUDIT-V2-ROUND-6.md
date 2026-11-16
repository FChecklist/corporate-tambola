# V2 audit, round 6 (independent Rule 7c auditor)

Audited commit: 942b88b. Result: **FAIL**. Report as returned, trimmed. Fixed in the next commit.

AUDIT: FAIL

All 13 V2 test files pass one at a time; `packages/` untouched; hooks in worker/winners/lifecycle/audit/ai-link additive; item 9 not built; migration additive; the scope gate held against every variant tried (other games, /api/org, /api/owner, trailing/double slash, case, Bearer, `/ai/<ctg_>`, exact expiry at end + 24 h, cancelled or deleted game, AI game key on people lists, cloned key's reuse); capability-id trace found no cross-account access (receipts for Host/AI carry no payment id; invoice routes accept only the inv token; certificate ids open only the non-personal check page).

## Must fix before deploy
**1. MAJOR: a rejected claim's prize could still be marked "given" by padding the request body.** `prizeHold` read the body with a 1024-character limit, the real handler allows 4096; a longer body made `prizeHold` read nothing and skip the 409 hold. Reproduced with a 1500-character extra field, with the organizer's key and the AI key. Fix: use the same default limit.

## Minor
2. A declared-AI call with a person's game key could still mint a new key through `POST /clone`. Fix: refuse it.
3. A certificate could be made for a rejected claim once `erasePersonal` deleted the review rows (~20 h). Fix: keep the decision rows, null the reason.
4. A certificate stays valid if the claim is rejected after it was issued: say so in the owner note.

## Owner should know
A person's game key can re-mint itself through clone (each clone's key lives to 24 h after that game). The console with a game-only Host key was not exercised in a browser (`zc.html` calls routes the gate refuses). Free text keeps names typed in words for 365 days. The manifest wording about what an AI game key can do after the end was incomplete. Plan section 10 still names the old route `claimnote`.

Missing tests noted: oversized `prizegiven` body, declared-AI clone, certificate after erase, rejection after issue.
