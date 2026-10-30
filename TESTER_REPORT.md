# TESTER_REPORT: Tambola rc 1.8.5, test branch `tests/tambola-rc185-final7-2026-10-30`

- Base: `origin/tests/tambola-rc185-final6-2026-10-30` (= previous tests + rc 8cac314). `git merge-base --is-ancestor origin/rc/tambola-1.8.5 HEAD` is true, and rc is still 8cac314, so nothing was merged.
- **No product file was changed.** `git diff origin/rc/tambola-1.8.5 -- apps/edge/src apps/web/public apps/server packages/*/src tools/control-worker` is empty. Only tests, test helpers, the matrix tool, the break table and this report changed.
- All runs: this cloud sandbox, `bun test --isolate <folder>`, one folder at a time, nothing else running. Counts below are copied from the last summary line of each run (logs were in `/tmp/claude-0/run/`, not committed).

## 1. Result in one view

| Check | Result |
|---|---|
| `bun run typecheck` | exit 0, 0 errors |
| ID matrix `bun tools/matrix/id-clean.ts` | **1,122,798 distinct inputs, 20,216,310 checks, 0 failures** |
| Deliberate breaks | **98 of 98** proven green, then red, then restored (was 79; 19 added, 9 older ones repaired) |
| Folders | 8 of 9 green. **apps/web has 4 red tests. All 4 are PRODUCT bugs (section 4). They are red on purpose, I did not bend them.** |
| The run 8 failures (edge 1, web 5, matrix 896) | all fixed on the test side (section 3) |

## 2. Counts (last summary line of each run)

| Folder | Pass | Fail | Skip |
|---|---|---|---|
| packages/shared | 12 | 0 | 0 |
| packages/engine | 65 | 0 | 0 |
| packages/beacon | 359 | 0 | 0 |
| packages/billing | 26 | 0 | 0 |
| tools/control-worker | 1 | 0 | 0 |
| apps/edge | 2186 | 0 | 1 |
| apps/server | 9 | 0 | 0 |
| apps/web | 963 | **4** | 0 |
| tools/matrix (extra) | 8 | 0 | 0 |

### apps/web, three full runs in a row (final tree)

| Run | Summary | game-completed.test.ts | rc185/audit-fixes.test.ts (web) | Other failures |
|---|---|---|---|---|
| 1 | 963 pass, 4 fail | 0 failed | 0 failed | none |
| 2 | 963 pass, 4 fail | 0 failed | 0 failed | none |
| 3 | 963 pass, 4 fail | 0 failed | 0 failed | none |

- The 4 failures are the same 4 tests every time (section 4).
- The folder log does not list passing tests, so "0 failed" comes from the `(fail)` list. I also ran the two files alone three times: game-completed 20 pass / 0 fail, audit-fixes 36 pass / 0 fail, each time.
- These two files use one fixed fake clock (the Worker and the page read the same value) and no sleeps. The clock is read from the Worker's own `endedAtMs`, not from the real time.
- The new browser-check-2 file uses short polls (40 to 60 ms) to wait for a DOM redraw, never to decide a result, and a fixed clock.

## 3. The failures of run 8, and what I did

1. **edge audit-fixes "ended by the organizer (data erased)"**. The test was wrong, the product is right (R-end). An erase is a purge row, not a game end. The test now says: the purge row is `end_src='purge'`, `endedAtMs` is the recomputed scheduled bound (not the erase moment), and a second erase or tick does not move it. I added: absent one second before the bound, present at the bound, never moves afterwards. A cancelled game test now also reads after the bound and 48 hours later (the old test passed even without the cancel guard, break G2 now proves it).
2. **web game-completed (3 tests)**. The fixtures were wrong. They put the clock 31 minutes after a fabricated end (start + 30 calls), but the Worker's real end is the schedule bound (about 14.5 minutes after the start), so `endedAtMs` was about 19 minutes old and the page correctly showed the results. Now the fixture reads the real `endedAtMs` from `GET /info` and places the clock relative to it. I added three R-end cases: (a) no `endedAtMs` yet (clock before the bound) and no calls: never the calm page; (b) `endedAtMs` recent but the page's own estimate says "long ago": results stay (page uses `endedAtMs`); (c) `endedAtMs` 2 hours old: calm page. The 30-minute edge is exact: 30:00 shows results, 30:01 shows the calm page (the code uses `> 30 minutes`, as the handoff says).
3. **web audit-fixes (2)**. (i) "no endedAtMs from the server, the estimate decides" now keeps the clock before the real bound and moves the page's estimate instead. (ii) "a cancelled game" used a bare `life` row with `end_src='cancel'`. A real cancel (API) is used now.
4. **ID matrix**. The email-game hint check now expects the hint only when the value looks like an address. 0 failures at 1,122,798 distinct inputs. See the open question in section 5 (3 inputs).

Also fixed on the test side (found while making the runs repeatable, all pre-existing test races, none is a product problem):
- `apps/edge/test/ai-privacy.test.ts`: the 4-digit needle "6789" was found inside a random key in one full run. A 4-digit tail now counts as a leak only when it stands alone or behind mask characters.
- `apps/edge/test/usecases.test.ts` UC-32: the re-join used phone 1, but which 5 of the 40 simultaneous callers get a place is not fixed. It now uses a phone that really got one.
- `apps/web/test/pages.test.ts` (2 places): "My people" and "Your games" read buttons one moment before the page drew them. Both wait for the buttons now.
- `apps/web/test/zc-default-182.test.ts`: the page's synchronous game lookup (`zc-mode.js`) made happy-dom connect to 127.0.0.1:80. The unhandled `ECONNREFUSED` ended two whole-folder runs with no summary. The page now gets the Worker's real answer. One test that needs the new screens for a manual/host game now uses `flow=new`; the product keeps the old screens for such a game, which a unit test in the same file already proves.

## 4. PRODUCT bugs (rc 8cac314), with evidence. Not fixed (I do not touch product code)

**P1. Fix (g) does not work when it matters: after "Not allowed." appears, nothing turns it into "Please sign in first."**
- Test: `apps/web/test/rc185/browser-check2.test.ts`, "PRODUCT BUG ... Step 1 with no session" (2 tests: with and without the guide). Red.
- The real Worker answers `POST /api/z` without a key with `403 {"error":"Not allowed."}` (the test records it). Step 1 puts that text into `#zf-msg1`.
- `signInFirst()` in `zc-flow-tambola.js` (line 134) runs only inside `patchSteps()` from `paint()`, and `paint()` is triggered by a `MutationObserver` on `#app` with `{ childList: true }` only (line 205). Changing the text inside `#zf-msg1` is not a child change of `#app`, so the observer never fires and `#zf-msg1` stays "Not allowed.".
- Proof that the conversion code itself is right: the control test appends one node to `#app` (what a redraw does) and the message becomes "Please sign in first. Open the organizer sign-in ..." with `#zt-signin` pointing to `/zc.html`. That control test is green and has a break (X16).
- Limit of my evidence: the test loads the three console scripts and the guide, not the whole `zc.html`. Another script on the real page could redraw. Please re-check in a real browser, with no session.

**P2. Fix (d) is only half done: a 31-character employee ID shows the too-long sentence in the hint, but not on submit.**
- Test: `browser-check2.test.ts`, "PRODUCT BUG ... 31 cleaned characters". Red. Rule R-ids says hint and submit both say "This ID is too long. An employee ID may be up to 30 characters once cleaned."
- Hint (`z.js` line 1116): correct. Submit (`z.js` line 1133): the check `rd.length > 30` is there, but its message is `"An employee ID has letters and numbers only."` (the test reads the alert banner after pressing the button and gets exactly that). Nothing is sent to the server (also asserted).
- The guide card for the too-long sentence exists (green test, break X09), but the phone never shows the sentence it matches.

**P3. The "* mandatory without an employee ID" label is unreadable in Retro (the default look) and in Modern.**
- Test: `browser-check2.test.ts`, "PRODUCT BUG ... must also read at >= 4.5:1 in Retro ... and Modern". Red.
- `z.css` line 465 sets `.zreq{font-size:13px;color:#9C1C14}`. In both looks the join card is transparent (`html[data-pt] .zcard`) over the dark page background. Computed from the CSS: `#9c1c14` on `#6b1429` (Retro, first gradient stop) = **1.47:1**, needed 4.5. No rule overrides `.zreq` for the looks.
- On a light page it is fine (green test: 13px and 4.5:1 or more). The fix was made for the light page only.
- The same method proves the other contrast fixes: error card in Retro and Modern, both as pop-up and in place, and the prize rows in Retro and Modern all pass (>= 4.5:1).

R-end checks: the product follows R-end as written (`endedAtOf`, `worker.ts` line 142). One thing for the owner: no code path writes an "organizer end" row. The rule says an organizer end is returned whatever the clock says, but the only `end_src` values are `phones`, `schedule`, `cancel` and `purge`. So I could not test an organizer end. If one is planned, it needs its own row type.

## 5. Open points for the owner (not failures)

- **Email hint, three inputs.** I read "looks like an address" as: something between the `@` and the dot, and something after the dot. The page shows no hint for `.x@y.` , `de-mo-1@.` and `de-mo-1@-de-mo.` (a dot with nothing around it). A looser reading ("an `@` followed later by a dot") would show a hint for those 3 of 1.1 million inputs and the matrix would fail on them. Please confirm which reading you want. The matrix line is `looksAddress` in `tools/matrix/id-clean.ts`.
- **Error code name.** The brief says `id-kind-locked`. The Worker, the coder's handoff and the existing tests say `idkind-locked`. The console does not read the code, it matches the sentence. I left the name as built.
- The console shows the lock message together with the guide card by letting the guide's own watcher rewrite the box. Both forms (card, or plain sentence when the guide is not on the page) are tested.

## 6. The seven new checks (second real-browser check) and their breaks

New file `apps/web/test/rc185/browser-check2.test.ts` (35 tests, of which 4 are the red product-bug tests) and a small CSS cascade `apps/web/test/rc185/css.ts` (reads the real CSS files, picks the winning rule like a browser, gives colours and sizes). Tests (a), (g) run the new console against the **real Worker**.

| Fix | What is tested | Result | Break (green to red to restored) |
|---|---|---|---|
| a | 409 on `PATCH /settings`: message under the radios with the guide card, radio back on the saved kind, `idTouched` reset; both lock sentences; plain text without the guide; stale message cleared on success; Save and continue with 400, 403, 409, 422 shows the server's words, re-enables the button, does not move on; control: a good save moves on | green | X01 radio, X02 silent, X03 idTouched, X04 swallowed 4xx |
| b | "This game link does not work" card, as pop-up and in place, Retro and Modern, every text and button >= 4.5:1 | green | X05, X06 |
| c | prize card heading, "Demo prize: Four corners" row, won row, tag, Retro and Modern; demo.html uses the same z.css | green | X07 |
| d | hint says too long (and 30 characters does not); guide card for the sentence | green | X08, X09 |
| d | **submit shows it** | **red, P2** | none possible (needs a green baseline) |
| e | `#fsBtn`, `#spkBtn` have class `fs`; `.fs` >= 40 x 40 at 360, 1280, 1920 px | green | X10 |
| f | `.zc-dot` ('Jump to') 40 x 40 at 360 and 1280; partner header/nav/footer links 40 px tall block boxes; mandatory label 13px and 4.5:1 on the light page; EN button box (top 6 + 40 = 46 px) fits inside the 52 px strip reserved at 480 px and below, none on wide screens | green | X11, X12, X13, X14, X15 |
| f | mandatory label in Retro and Modern | **red, P3** | none possible |
| g | the Worker's real 403 -> "Please sign in first." + `#zt-signin`; the conversion works once the console paints; a signed-in organizer and other refusals are left alone | conversion green | X16 |
| g | **it happens on its own** | **red, P1** | none possible |

Other breaks added or repaired (all proven): G2 (cancelled), G7 (scheduled end shown before the bound), G8 (an erase counted as an end), M12 (hint in an Email ID game without an address; needs the new `tools/matrix/id-clean-page.test.ts`, which types 400 inputs per game into the real join page). Nine older breaks (B14, W08, W15, D1 to D3, G1, G2, G3) had stopped matching the product text of rc 8cac314 and were silently skipped in the old runner; they are repaired, and the runner now prints `BAD BREAK` rows.

## 7. How to run

```bash
bun install
bun test --isolate packages/shared        # then engine, beacon, billing, tools/control-worker, apps/edge, apps/server, apps/web
bun run typecheck
bun tools/matrix/id-clean.ts              # about 85 s
bun tools/matrix/breaks/run-breaks.ts     # all 98 breaks, about 5 minutes; --only X for the new ones
```
