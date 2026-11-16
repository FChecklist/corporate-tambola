### FINDING 0 [low] Unsaved 'Who calls the numbers?' choice of step 2 is silently reset when step 1 is saved (mode left in GROUPS[1])
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1347
Scenario: The release moved the save of callMode to step 2 only, but 'mode' is still listed in GROUPS[1] (line 1347) while the chip is drawn and baselined in step 2 (special case at line 1591). Organizer opens step 2 and taps 'A Host presses a button for each number' (not saved, S.touched[2]=1, banner 'Not saved yet'), jumps to step 1, changes the time and presses Save and continue. The tail of saveStepWork (line 1591) copies every GROUPS[1] key, including mode='host', from the live form into S.fBase. The refresh that follows runs syncForm (line 1352): group 1 now looks unchanged, so S.f.mode is overwritten with the server value 'auto'. Back in step 2 the chip shows the software selected, yet the step still says 'Not saved yet. Press Save and continue below.' The organizer presses it, saves 'auto', and the game runs on the timer instead of a Host pressing each number. The new test 'saving step 1 does not carry the unsaved who-calls-the-numbers choice' only checks the server and never looks at the form afterwards.
Suggested fix: In C:\ct\test-sites\tambola\apps\web\public\zc.js, change line 1347 to GROUPS = { 1: ["occ","oname","day","dayo","time","timeo"], 2: ["cap","tix","spd","rnd","who","inv","per","cats","demo","mode"], ... }. Then delete `if (n === 2) S.fBase.mode = S.f.mode;` at line 1591. Also extend the test at idiotproof-steps-1-2.test.ts:136 to open step 2 again after saving step 1 and expect the Host chip to still have aria-pressed="true".
Verifier's reasoning: I could not refute this finding. The code path is in zc.js.

1. The mode chip is drawn in step 2 (line 413). Tapping it runs chipClick (line 1670). That sets S.f.mode and calls edited(), so S.touched[2]=1. markUnsaved also sets S.unsaved[2]=true. This gives the "Not saved yet. Press Save and continue below." banner, which is built from touched(2) at line 1140.

2. Line 1347 still lists "mode" in GROUPS[1]. The same list existed at fdf52e7, because step 1 used to send callMode. In 1.2.0 step 1 no longer sends callMode (line 1575); only step 2 does (line 1576). The group list was not updated to match.

3. When step 1 saves, the tail at line 1591 runs `for (const k of GROUPS[1]) S.fBase[k] = copy of S.f[k]`. That copies the unsaved mode='host' into fBase. It runs synchronously, before `refreshEng()` is started.

4. `refreshEng` calls `syncForm()` unconditionally at line 1450, with no check of S.unsaved or S.touched. In syncForm (line 1352), every GROUPS[1] key now equals fBase, so `S.f[k] = fresh[k]` runs for all of them. That includes mode, which becomes the server value 'auto' (formFromServer, line 189).

5. The only things that clear step 2's flags are the line 1590 `S.touched[n]=0` and the `S.unsaved[n]=false` in the line 1591 tail, and both run for n=1 only. So step 2 keeps saying "Not saved yet" while its chip has been silently set back to the software option.

6. The new test (idiotproof-steps-1-2.test.ts:136-143) only checks that the PATCH has no callMode and that the server still says 'auto'. It never reads the form afterwards, so it does not cover this.

The result is that the organizer's tap is lost without a word, and the banner contradicts the chip. If they press Save and continue, 'auto' is saved. A game meant to be Host-called then runs on the timer.

I rate it low, not medium, for three reasons. It needs an out-of-order path: change step 2's mode, jump to step 1, save it. The chip and the text under it do show the reverted state ("A new number every few seconds, by itself", and the speed chips reappear). And the organizer can re-tap and save, so nothing is stuck or lost beyond one tap.

The suggested fix is correct and minimal. GROUPS is used only at lines 1347, 1349, 1352 and 1591. Moving "mode" into GROUPS[2] makes step 2's baseline, snapshot, unsaved-step check and refresh all cover it. It also makes the special case `if (n === 2) S.fBase.mode = S.f.mode;` redundant.

### FINDING 1 [low] Stale red refusal stays on screen after the person fixes it with a prize tick-box, Remove, currency chip or logo (clearToast is not called by those handlers)
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1720
Scenario: The release clears a red Save refusal only through edited(), and only chipClick, onField and the data-bool handler call it. In step 3 the person presses Save with nothing ticked and gets 'Tick at least one prize.' above the button. They tick a prize: the data-hc handler (line 1720) sets h.on and redraws without edited(), and redraw() keeps S.toast, so the red 'Tick at least one prize.' is still shown beside a ticked box. Same in step 4: after 'During the game you can have 3 things in all... You have 4. Remove 1', pressing Remove on the lucky draw (data-luckydel, line 1723) leaves 'You have 4. Remove 1' on screen. data-cashcur (1718), data-cashamt (1717), the logo choose/remove handlers (1841, 1848) and data-luckyadd (1722) behave the same. The new test covers only chips and typed boxes.
Suggested fix: In C:\ct\test-sites\tambola\apps\web\public\zc.js, call edited() (already defined at line 92 and in scope in bind()) at the start of each of these handlers:
- data-hc onchange (line 1720)
- data-luckyadd (line 1722) and data-luckydel (line 1723)
- data-cashcur (line 1718) and data-cashamt (line 1717)
- $("logorm").onclick (line 1848)
- the #brandlogo change handler (around line 1841)

Alternative: call clearToast() inside markUnsaved, after its step-range and click-filter checks but before the `S.unsaved[n]` early return. That listener already sees every edit in steps 1-4. Do not put it above the click filter, or any click in the section would clear the message.

Add a test in apps/web/test/idiotproof-steps-3-4.test.ts for each of two cases. First, untick all prizes, press Save, tick one, and assert #footmsg is gone. Second, make the lucky-draw count too high, press data-luckydel, and assert #footmsg is gone.
Verifier's reasoning: Confirmed from the code at commit 274bde8. I found no other layer that clears the message, and no test covers this path.

What clears the message today:
- clearToast() and edited() are new in 1.2.0 (the text is absent at fdf52e7). Line 92 clears S.toast and removes .zc-toast-foot.
- edited() is called only from onField (line 1662), chipClick (line 1671) and the data-bool handler (line 1715).
- The stated aim in the test header (idiotproof-steps-1-2.test.ts line 2) is "the red message goes as soon as the person changes anything".

Why the other handlers leave it on screen:
- Step 3 prize tick-box (data-hc, line 1720): it sets h.on and calls redraw(). stepPrizes() ends with save(3), which calls footMsg(3) (lines 357-358). footMsg renders the red box whenever S.toast is set and S.open matches (line 355), and nothing in view(), draw() or redraw() clears S.toast. After "Tick at least one prize." (line 1577), ticking a prize leaves the red text beside a ticked box.
- Step 4 lucky-draw Remove (data-luckydel, line 1723): it splices S.f.lucky and redraws. Step 4 ends with save(4) (line 532). "You have 4. Remove 1, then press Save again." (line 1563) stays after the person has removed one.
- Same gap in data-luckyadd, data-cashcur, data-cashamt and the #logorm handler.
- markUnsaved (lines 1481-1486) only sets S.unsaved and inserts the "Not saved yet" note. It does not touch S.toast.
- guide.js (line 374 onwards) only rewrites message text in place; it never clears it.
- The only existing coverage is for chips and typed boxes (steps-1-2 test, line 145 onward). The step 3/4 tests at line 89 and nearby never check that the message goes after Remove or a tick.

Why it is only low severity:
- Pressing Save works. saveStep sets S.toast = "" at lines 1567 and 1571, so the stale message cannot block anyone.
- Before 1.2.0 the message stayed in every case, so this is an incomplete improvement rather than a regression.
- The result is a red line that contradicts the screen, which breaks the rule that error messages must be accurate.

### FINDING 2 [low] 'Not saved yet' note and update-block appear when nothing was changed (tapping 'My crowd is a different size', re-tapping a chosen chip, a rejected logo file)
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1483
Scenario: markUnsaved flags any click on [data-ck],[data-bool],... and any change event in steps 1-4. The 'My crowd is a different size' button is a [data-bool="capOther"]; the data-bool handler (line 1715) deliberately skips edited() for it because it only reveals a box, but markUnsaved does not skip it. An organizer on a saved step 2 taps that button and changes nothing: S.unsaved[2]=true, 'Not saved yet. Press the button below to keep your changes.' is inserted above Save, while the step banner still says 'Saved. You can change it any time.' (touched flag not set). window.__ctDirty() is now true, so autoupdate.js refuses to load a new version until Save. Re-tapping an already chosen chip (edited() skips it at line 1671) and picking a logo of the wrong type or over 5 MB (change event, nothing changed) do the same.
Suggested fix: In `markUnsaved` (zc.js ~1482-1484):
- Skip the click when `t.closest('[data-bool="capOther"]')`.
- Skip it when the target is `t.closest('[data-ck]:not([data-multi])[aria-pressed="true"]')` and its `data-ck` is not `brand.color`.
  - The `data-multi` exclusion is needed because multi chips toggle off, which is a real change.
  - The `brand.color` exclusion is needed because re-tapping a colour clears it.
  - At this point the event target is the old, detached button, so its `aria-pressed` still holds the pre-click state.
- Set `S.unsaved[4]` from `#brandlogo`'s `onchange` only after `fitLogo` succeeds.
  - Also make `markUnsaved` ignore `change` events whose target has `type="file"`.
Verifier's reasoning: The finding holds, but the harm is limited. Here is how the code shows it.

The listener. zc.js:1481-1486 is a document-level click/input/change listener. For a click it only checks `t.closest("[data-ck],[data-bool],[data-cashcur],[data-luckyadd],[data-luckydel],#logorm")`. It never asks whether anything actually changed.

The cases:

1. "My crowd is a different size" is `data-bool="capOther"` (line 411).
   - The handler at line 1715 skips `edited()` for it. The `capOther` flag exists only at lines 410, 411 and 1715, so it is pure UI and not part of any saved group.
   - `redraw()` does `$app.innerHTML = v` (lines 1490-1493), so the old button is detached. `closest("#secbN")` still matches on the detached subtree, so `markUnsaved` still runs.
   - `S.unsaved[n]` is set to true, and "Not saved yet. Press the button below to keep your changes." is inserted above `.zc-foot`, even though nothing was changed.

2. Re-tapping an already chosen single-choice chip.
   - `chipClick` (line 1671) skips `edited()` because the value is the same, but `markUnsaved` still fires.

3. A rejected logo (wrong type or over 5 MB).
   - The logo input is `#brandlogo` (line 464). Its `onchange` (lines 1841-1845) only sets `S.logoNote` and redraws on rejection. `S.f.brand.logo` is not touched.
   - The `change` event still reaches `markUnsaved`, because `t.closest("#secb4")` matches. This sets `S.unsaved[4]`.

Consequences, all verified in the code:
- `window.__ctDirty()` (line 1480) is true. `autoupdate.js` line 34 then returns early on every check, so the open console tab will not move to a newer release until the person presses Save.
- The flag is cleared only by `saveStep` (line 1591) or when the event changes (line 1351). Leaving the step does not clear it.
- For steps 3 and 4, `unsavedWarn` (line 92) uses `n > 2 && S.unsaved[n]`. So a false flag on step 3 or 4 also shows "Step N has changes you have not saved yet..." on other views. The preview note at line 1724 also reports unsaved changes.
- For steps 1 and 2, the "Saved. You can change it any time." banner contradicts the "Not saved yet" note, because the touched flag is not set.

Nothing tests the false-positive case. The tests only assert the true positive, for example the brand-name field at idiotproof-steps-3-4.test.ts:107 and a chip tap in idiotproof-console-frame.test.ts:158.

No data is lost, no one is stuck, and Save still works. The harm is a misleading note and a delayed auto-update, so the severity is low.

### FINDING 3 [low] What was typed while 'Saving...' is marked as saved and then overwritten by the refresh
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1591
Scenario: After the PATCH (and, for step 2, the extra GET /summary) returns, line 1591 copies the live S.f into S.fBase and sets S.unsaved[n]=false. Only the Save button is disabled while saving; chips and boxes still accept input. On a slow phone connection the organizer presses Save on step 3, then ticks one more prize (or types in a step 4 box) before the answer arrives. That change was not in the request, but it becomes the baseline, the unsaved flag is cleared, and the refresh started on the next line runs syncForm, sees the group as unchanged and replaces S.f with the server copy. The extra tick or text disappears with no 'Not saved yet' warning.
Suggested fix: Snapshot what is actually sent, not the live form. In saveStepWork, immediately before each `await call("PATCH", ...)` (after validation and step 4's brand cleaning), do `sent = {}; for (const k of GROUPS[n]) sent[k] = JSON.stringify(S.f[k] === undefined ? null : S.f[k]);`. At line 1591, set `S.fBase[k] = JSON.parse(sent[k])` instead of copying live S.f. Compute `later = GROUPS[n].some(k => JSON.stringify(S.f[k] === undefined ? null : S.f[k]) !== sent[k])`. Then set `S.unsaved[n] = later` and `if (later) S.touched[n] = 1`. In saveStep (line 1568), skip `snapGroup(n)` when later is true. The refresh then keeps the mid-save edit, "Not saved yet" shows, and autoupdate's __ctDirty guard stays on.
Verifier's reasoning: I could not refute the finding. Everything below is read from the code. Line numbers refer to the 1.2.0 zc.js.

**The window exists.**
- saveStep (line 1567) sets S.saving = n and redraws. The only thing S.saving changes is the Save button, which is disabled and reads "Saving…" (saveBtn, line 356; unsavedNote, line 1479).
- I searched all of apps/web/public for pointer-events, aria-busy, fieldset and other uses of saving. Nothing else locks chips or boxes while a save is in flight.
- chipClick (line 1670) and onField (line 1660) still change S.f through setP. markUnsaved (line 1481) still sets S.unsaved[n] = true.
- The step stays open until advance(n) runs, which happens only after the PATCH answers. On step 2 that includes the extra GET /summary.

**What the person sent and what is adopted differ.**
- The PATCH body is built before the await, for example rewardsOut(f) in step 3 and momentsOut(f) in step 4, so a tick or text added during the wait is not in the request.
- After the await, line 1591 copies the live S.f[k] into S.fBase[k] for every key of GROUPS[n], then sets S.unsaved[n] = false. The mid-save change therefore becomes the baseline and the "Not saved yet" flag is cleared.
- refreshEng() (line 1394) is fired next, then advance(n). It makes several sequential GETs (info, participants and more), then runs syncForm() at line 1450.
- In syncForm (line 1352) the group's S.f equals S.fBase, so it counts as "unchanged" and S.f[k] is replaced by the server copy. The mid-save edit disappears with no warning.
- saveStep (line 1568) then calls snapGroup(n) on the same S.f, so fSnap also treats it as saved.
- window.__ctDirty() now returns false, so autoupdate.js is also free to reload the page.
- Line 1591's own comment says a later change by the person must not be taken for "unchanged". That is true only for changes made after the baseline copy. Changes made during the in-flight request are the ones it misses.

**It is new in 1.2.0.** In fdf52e7, fBase was only set in syncForm and was never rewritten from S.f at save time, and there was no unsaved flag. A mid-save edit then stayed visible in the form (still unsaved, but not erased). The new baseline copy turns that into a silent revert.

**Why it is only low.**
- The person has to change something between pressing Save and the answer. On a fast link that is a few hundred milliseconds.
- Nothing already saved is damaged. The page reverts to what the server holds, so what it shows is true, and only the last tap or typing is lost.

**Smallest fix.**
- Right before each `await call("PATCH", ...)` in saveStepWork, after validation and after step 4's brand cleaning (cleanNm, bc) so the snapshot matches what was sent, take `sent = {}` with `sent[k] = JSON.stringify(S.f[k] === undefined ? null : S.f[k])` for each k in GROUPS[n].
- At line 1591 set S.fBase[k] from `sent[k]`, not from live S.f.
- If any key's live JSON differs from `sent[k]`, keep S.unsaved[n] = true and S.touched[n] = 1.
- Skip the snapGroup(n) call in saveStep (line 1568) in that case.
- syncForm then sees the group as changed and keeps the edit, the "Not saved yet" note shows, and autoupdate keeps waiting.

### FINDING 4 [low] 'Add a lucky draw' does nothing and says nothing when typed moments have just filled the three places
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1722
Scenario: The button is drawn only when momentsOut(f).breaks.length < lim.mid at draw time, and typing in a moment box does not redraw. Organizer sets 'During the game' to 3, then types a title in each of the three boxes, then taps 'Add a lucky draw' straight away. The counter above already reads '3 used' (onField updates it), but the handler at line 1722 now hits `if (momentsOut(S.f).breaks.length >= ...mid) return;` and returns silently: no lucky draw, no message, no redraw. The explanation 'All 3 places during the game are used' only appears at the next redraw (up to 5 seconds later).
Suggested fix: In the handler at zc.js:1722, replace the silent return with `{ redraw(); return; }`, so the button is replaced at once by the "All N places during the game are used ... Remove one to make room." text. The typed moment titles survive because they are already in S.f via setP in onField, and draw() rebuilds the page from S.f.
Verifier's reasoning: The defect is real as described, but it is minor. Checked in the 274bde8 build of C:\ct\test-sites\tambola\apps\web\public\zc.js.

- stepBrand() (line 529) draws the "Add a lucky draw" button only when midUsed < lim.mid. midUsed comes from momentsOut(f).breaks.length, and momentOut() drops empty boxes (momentEmpty, line 160). So with "During the game" set to 3 and three empty boxes, the count is 0 and the button is drawn.
- Typing in a moment box runs onField (line 1664). It calls setP, edited, and only a text update of #midcount and #bmcount. It never calls redraw, so the button stays on screen while the counter changes to "3 used".
- The old handler (fdf52e7, line 1650) had no cap check and always pushed a lucky draw and redrew. The new one at line 1722 returns silently when breaks.length >= maxFor(tix).mid, with no redraw and no message. After the three titles are typed, the tap does nothing visible.
- No other layer fills the gap at that moment. The explanatory sentence "All N places ... are used" exists only inside stepBrand() (line 529), which runs only on a redraw.
- The only redraw is the 5-second setInterval tick (line 2042). It skips while an INPUT is focused and runs refreshEng, whose redraw picks up the new midUsed. Tapping the button takes focus off the input, so the message appears within about 5 seconds. The person is not stuck. But for those seconds a tap gives no feedback at all, which goes against the standing rule that a person is told in plain words, beside the control they used, what to do.
- The test at apps/web/test/idiotproof-steps-3-4.test.ts:86-87 does not cover this. It clicks luckyadd while only two moments are filled, so the click succeeds and redraws. The silent-return branch is untested.

Impact is low. Nothing is lost, nothing is blocked, and it clears itself shortly. Save would also catch an overflow ("You have 4. Remove 1").

### FINDING 5 [medium] 'Fix and add' drops the employee ID, so rows told to 'type the mobile number' are refused again or saved without their ID
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1823
Scenario: Step 2 is set to 'Employee ID and mobile number' (verify 'both'), for example Only my employees. The Organizer uploads a CSV with rows 'Asha Rao,E101' and no mobile. cleanBatch (lines 628 and 633) puts the row in the wrong list as {name, raw:'', why:'A mobile number is needed as well.'} with no empId. The box says 'These need a mobile number. Type it and press Fix and add.' The data-fix handler (line 1823) then sends only {name, phone:v}. The employee ID typed in the file is lost. In an employees-only game the server answers 'This game is for employees: the employee ID is missing.' (people.ts line 289), the row lands in the wrong list again, and no box exists to give the ID, so the Organizer loops. In a non-employees-only 'both' game the person is saved without their ID. The same loss happens for id-mode rows whose mobile looks wrong.
Suggested fix: 1) In cleanBatch, keep the ID on the wrong rows. Line 628: wrong.push({ name, raw: String(r.phone||""), empId: emp, why: ... }). Line 633: wrong.push({ name, raw: ..., empId: emp, why: ... }).
2) In the data-fix handler (line 1823) send it back: S.pp.wrong.splice(i,1); addPeople([{ name: w.name, phone: v, empId: w.empId }], true). On the next cleanBatch pass, 'both' mode then keeps the ID (line 635 adds empId when emp is set and the mode is not 'mobile'), and 'id' mode keeps it via the line 630 path.
3) For server-invalid rows (line 715), look the ID up from the batch just sent. For example, build a map from good.slice(i, i+200) keyed by name plus '+'+phone, and attach empId to the bad row when the key matches.
4) Optionally show the ID next to the name in the wrong-list row, for example 'Asha Rao (ID E101)', so the Organizer can see which ID is being kept.
5) Add a test: a CSV row 'Asha Rao,E101' in an employees-only 'both' game, then type a mobile and press Fix and add. Assert that the POST body carries empId and the person lands on the list.
Verifier's reasoning: I could not refute this. The failure follows from the code.

Path for 'both' mode, step by step:
- parseList (zc.js 1642-1655) turns the row "Asha Rao,E101" into {name, phone:'', empId:'E101'}. With a header row, the Mobile column is read as '' and the ID column keeps E101.
- vetRows (701) keeps the row because the ID is present.
- cleanBatch (626): the early ID branch only runs for vmode 'id', or for 'either' without a phone. With 'both' the row falls through to line 632. cleanPhone('') returns null, so line 633 pushes {name, raw:'', why:'A mobile number is needed as well.'}. There is no empId on that object, and no code reads one back later.
- The wrong-list box (line 776) offers one input, #fixin<i>, labelled 'Mobile number for ...'. It has no ID field and says 'Type it and press Fix and add.'
- The data-fix handler (line 1823) calls addPeople([{name: w.name, phone: v}], true), so the ID typed in the file is gone.

What happens next:
- Employees-only 'both' game (Step 2 'Only my employees' with 'Employee ID and mobile number'). The server (people.ts 289) answers invalid 'This game is for employees: the employee ID is missing.' addPeople line 715 puts the row back in the wrong list. The Organizer sees the same single mobile box and the same Fix and add button, and loops. The only ways out are the separate 'Add one person' form, which has a #gemp ID field, or fixing the file and uploading it again. Nothing on screen points to either.
- Non-employees-only 'both' game. people.ts 289 does not fire and line 307 stores the person without an ID. The summary says '1 good'. At join (worker.ts 1614 and 1624) a stored empId is what triggers the ID check, so this person joins on mobile alone and the ID check is skipped.
- 'id' mode with a bad mobile (line 628) has the same loss. A non-employees-only 'id' game saves the person under the phone hash without an ID. When that employee types their ID, worker.ts 1614-1616 finds no match and sends them to the waiting list for the Organizer to admit. An employees-only 'id' game bounces and loops as above.

No test covers this. pages.test.ts 1314-1315 and s16-faults 253-259 only fix a bad mobile on a row with no ID.

It is not new. The old handler at the same place also sent {name, phone} only. But the release added the sentence that sends the Organizer into this flow (line 633 'A mobile number is needed as well.' and the box heading 'These need a mobile number. Type it and press Fix and add.'). Before, those rows had no reason text. Severity is medium: the fix button is a dead end and the ID is silently lost, but the Organizer is not permanently blocked, and creating and publishing a game is untouched.

One part of the suggested fix needs care. The server's invalid[] items carry only {raw, why}, with raw = name + phone (people.ts 284), so addPeople line 715 cannot recover an empId from them. That part would need to look the ID up from the submitted batch by name and phone. Server-rejected phones that passed client cleaning are rare, so the client-side fix covers the main case.

### FINDING 6 [low] addPeople returns silently while another add is running; the 'Fix and add' row or a second CSV is lost with no message
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 708
Scenario: A long list is being added: P.adding is true and the page shows 'Adding N people...' for several batches. The person presses 'Fix and add' on a row of an earlier 'look wrong' list. The handler (line 1823) has already run S.pp.wrong.splice(i,1) when addPeople hits 'if (P.adding) return', so the row vanishes from the list and is never added. Choosing a second CSV (gfile, line 1821) sets 'N rows were left out...' and calls addPeople, which also returns silently, so nothing is added and the note implies it was. Only the Add button, Add them (PDF and paste) and gadd are disabled while adding. The Fix buttons and the CSV file box stay active.
Suggested fix: 1) In addPeople (zc.js:708) replace 'if (P.adding) return;' with 'if (P.adding) { P.sum = "Still adding the last list. Please wait a moment, then try again."; return redraw(); }'. 2) In the data-fix handler (line 1823), add 'if (S.pp.adding) { S.pp.sum = "Still adding the last list. Please wait a moment, then press Fix and add again."; return redraw(); }' before S.pp.wrong.splice(i, 1). 3) At the top of the #gfile onchange (line 1821) and the #gcontacts onclick (line 1822), do the same check before setting S.csvNote or calling addPeople. 4) Optionally render the data-fix buttons, #gfile and #gcontacts with a disabled attribute when S.pp.adding, as is already done for gadd, rosterGo and pdfgo.
Verifier's reasoning: Confirmed from the code, and it is new in 1.2.0. In fdf52e7 addPeople had no guard, so a second call ran alongside the first and the row was added. In 274bde8, zc.js:708 has 'if (P.adding) return;', which gives no message and no redraw.

What the guard covers: only rosterGo (759), pdfgo (756) and gadd (758) are rendered disabled while S.pp.adding. These stay active:
- The 'Fix and add' buttons (data-fix, line 776, no disabled attribute).
- The CSV file input #gfile (757).
- The contacts picker #gcontacts (1822), which also calls addPeople.

Fix and add (line 1823): the handler runs S.pp.wrong.splice(i,1) and then addPeople([...], true). If P.adding is true, addPeople returns silently. The row is removed from P.wrong and was never posted, so the name and typed number are lost. Nothing redraws, so the row stays on screen until the running add finishes, then drops off. When that add finishes, 'P.wrong = keep ? P.wrong.concat(bad) : bad' is built from the already-spliced list (or replaced outright when keep is false). The person gets no sign that the click did nothing.

Second CSV (line 1821): onchange sets S.csvNote, which may say 'N rows were left out ... upload again' and implies the rest were added. It then calls addPeople, which returns silently. The second file is never added, and nothing says so.

Why it stays low:
- The window is only the few seconds a multi-batch add takes (200 people per POST). Fix and add on one row is a single POST.
- The organizer has to act mid-add, and 'Adding N people...' is visible.
- It loses one name or one file the organizer can re-enter. It does not block or corrupt a game.
- None of the standing owner rules are broken. The only text problem is that csvNote can claim a file was used when it was not.
- Existing tests (pages.test.ts 1315-1316, idiotproof-steps-5-6.test.ts) never overlap two adds, so no test covers this.

The smallest fix is the reviewer's, with one extra call site. First, in addPeople replace the bare return with a visible note: if (P.adding) { P.sum = "Still adding the last list. Please wait a moment and try again."; return redraw(); }. Second, in the data-fix handler, test S.pp.adding before the splice. Third, do the same check at the top of the gfile onchange and gcontacts onclick, before setting csvNote. Rendering data-fix buttons and the CSV input disabled while S.pp.adding is optional.

### FINDING 7 [low] After End the game, the Host-mode 'Next number' button stays live and a refusal shows the raw server text
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1904
Scenario: In Host mode the Organizer presses End the game. The new Controls block (line 1015) disables Pause, Resume and End and says the game is being ended. hostBlock (line 980) computes off without the stopped state, so the big Next number button stays enabled and its text still reads 'Press when you are ready for the next number.' A Host who presses it gets r.status 422 with error 'engagement already stopped' (control.js publishControl line 411 returns bad.why for 'next'). Line 1904 puts r.data.error into S.nextNote without ctlWords, so the Host sees that technical phrase. A simultaneous press by two Hosts likewise shows 'Next sequence number is 7.' Only the catch branch of this handler goes through ctlWords.
Suggested fix: 1. In hostBlock (zc.js ~line 971), compute `const stopped = !!(S.control && S.control.stopped)`, add `|| stopped` to `off`, and put `stopped ? "The game has been ended." :` at the front of the `state` chain. The text could use S.control.stopNow to switch between "being ended" and "over", matching the Controls block.

2. On line 1904, replace the non-200 text with `ctlWords({ message: (r.data && r.data.error) || ZG.NEXT_REFUSALS.lead })`. The full line becomes: `S.nextNote = r.status === 200 ? "" : ctlWords({ message: (r.data && r.data.error) || ZG.NEXT_REFUSALS.lead });`

3. Also add a client-side guard in the nextnum handler, next to the paused check: `if (S.control && S.control.stopped) { S.nextNote = ctlWords({ message: "already stopped" }); return redraw(); }`.
Verifier's reasoning: I could not refute this. I traced it in commit 274bde8 and it holds.

1. The button stays live after End. In hostBlock (zc.js ~line 971), `off = !S.started || onWay || done || S.pressing || over`. Nothing in `off` or in the `state` text reads `S.control.stopped`. `over` is `allPrizesWon()` and `done` is `count >= total`; neither is set by a stop. stepDay always renders hostBlock() above the Controls block, and the Controls block does disable Pause, Resume and End once `CS.stopped` is true.

2. The press is refused by the server. The nextnum handler (line 1898) only pre-checks the paused and order cases. For anything else it calls TBControl.publish(..., "next"). nextMessage never refuses a stopped game, so the message is signed and POSTed. In resolveControl (control.ts ~line 233), `check(m, cfg, cur, stop !== null, ...)` returns "engagement already stopped" once any stop has been accepted. publishControl (control.ts line 411) then returns status 422 with `error: bad.why` for "next", without the "Not accepted:" prefix.

3. The raw text reaches the screen. Line 1904 does `S.nextNote = r.status === 200 ? "" : (r.data && r.data.error) || ZG.NEXT_REFUSALS.lead`. So S.nextNote becomes "engagement already stopped", and hostBlock shows it as-is in the `#nextnote` paragraph beside the button. That breaks the owner rule that errors are plain words and say what to do. The word "engagement" is also internal jargon.

4. 1.2.0 half-fixed this. The live version fdf52e7 had the same non-200 branch, and its catch branch was `S.nextNote = e.message`. 1.2.0 changed only the catch branch to `ctlWords(e)`. ctlWords already maps /already stopped/ to "This game has already been ended." and /already used|Next sequence number/ to plain words, so the 422 and 409 text takes the one path that skips it.

5. The 409 case is real but narrow. TBControl.sign re-reads the control file immediately before signing, so a 409 ("Next sequence number is N." or "That sequence number is already used.") needs two Hosts pressing within the same short window. The End-then-Next case needs no race. A second Host or the Organizer on another device only has to press Next after End.

6. No test pins the old behaviour. I searched apps/web/test and apps/edge/test for "engagement already stopped" and for nextnum. The hostcalls-pages tests cover the not-started, paused and "On its way" cases only.

Impact is small. The server rejects the press, so no game state is corrupted and nothing is lost. The effect is a live button after End, a misleading "Press when you are ready for the next number." line, and a technical message. That is why I rate it low.

The suggested fix is safe. ctlWords passes every NEXT_REFUSALS string through unchanged, because none of them match its regexes, and it maps "engagement already stopped" to a plain sentence.

### FINDING 8 [low] 'Send a new link' button can stay disabled for ever after two identical failures
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1826
Scenario: The service is busy or the phone is offline. The Organizer presses 'Send a new link'. The handler does b.disabled=true straight on the DOM and the call fails: S.pp.sum gets the message, the page redraws and the button is fresh again. Pressing it a second time fails with the same message. S.pp.sum, the list and the stale note are unchanged, so view() returns exactly lastHtml and draw() returns early (line 1299 'v === lastHtml'). The element keeps disabled=true and the button stays grey, as do the 5-second refreshes, until some other change alters the HTML. pubgo and usecredit avoid this by setting lastHtml='' in their catch, but data-resend does not.
Suggested fix: In the `[data-resend]` handler in apps/web/public/zc.js, set `lastHtml = "";` immediately before the final `await loadPeople(); redraw();`, on both success and failure. `lastHtml` is in scope, as `pubgo` and `usecredit` already show. The next `redraw()` then rebuilds the row and the button is enabled again. Alternatively wrap the call in try/finally and re-enable the button there: `finally { if (b.isConnected) b.disabled = false; }`. The `lastHtml = ""` version is smaller and matches the existing pattern.
Verifier's reasoning: Confirmed from the code at 274bde8 (apps/web/public/zc.js; the handler starts at line 1825 and the cited `b.disabled = true` is line 1826).

1. The `if (b.disabled) return; b.disabled = true;` guard is new in 1.2.0. In `git diff fdf52e7 274bde8` the old handler never touched `disabled`. Nothing in the file sets it back, and there is no `.disabled = false` or `removeAttribute` for this button. `a11y()` and `markAct()` don't touch it either.

2. The button is only rebuilt through `draw(v)`, which starts with `if (v === lastHtml && $app.firstChild) return;` (line 1490). `lastHtml` is the last HTML string, not the DOM. Setting `disabled` on the element never changes it.

3. The failure path in the handler is `catch (e) { S.pp.sum = friendly(e); }` and then `await loadPeople(); redraw();`. `friendly()` gives the same text for the same failure: "We could not reach the service..." for offline, or "Something went wrong on our side. Please try again in a minute." for a 5xx.
   - First failure: `sum` changes. If the people list also fails to load, `P.stale` is set as well. The HTML differs, so `draw` runs and a fresh enabled button appears.
   - Second identical failure: `sum` is the same. `loadPeople` leaves `P.list` and `P.stale` the same, or the list loads again unchanged. `view()` returns exactly `lastHtml`, so `draw` returns early and the clicked element stays `disabled=true`, shown grey.
   - If only the resend POST fails (the list GET works), the first failure still changes the HTML through `sum`. The second is identical, and nothing else changes it.

4. Nothing else in the page changes the HTML in a quiet game. I read `engView`, `mainHtml`, `alertZone`, `barHtml`, `payNote`, `progHtml` and `synHtml`. They hold no clock or countdown. `payDueCard` shows "in N min" only when `S.unpaid && !S.locked`, but `alertZone` calls it only when `S.locked`. In that branch it returns the card without a countdown. The 5-second `refreshEng` tick calls `redraw()`, which is a no-op when the HTML is unchanged.
   - The button un-sticks only when something visible changes: the live person or number count, the list, the stale note clearing once the service recovers, or opening another step.
   - With a persistent failure on a quiet pre-game console, it stays grey. The message on screen says "try again in a minute" while the only retry control is disabled.

5. Partial mitigation, which does not remove the stuck button: `call()` runs `guided()` and `CTG.watch`, and guide.js shows a "Try again" dialog for the network and wait-type messages. It is a pop-up that disappears when closed, and the button underneath is still disabled.

6. No test covers the failure path. The tests I found (pages.test.ts around lines 1301-1304 and idiotproof-steps-5-6.test.ts around lines 40-48) only exercise the success path, where the button is replaced by `a[data-wa]`.

Severity is low. It needs two identical failures in a row and recovers on any visible change or a page reload. Nothing is lost and no one is blocked from the game. It is a regression from the pre-1.2.0 handler, and it is the same class of bug that `pubgo` and `usecredit` already guard against with `lastHtml = ""`.

### FINDING 9 [low] Remove Host/Co-host and 'Delete their data' still use the browser's own confirm(), which the new code says can leave a red button dead
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1797
Scenario: askSure's own comment says the browser's confirm box can be blocked and then the red button looks dead, and End game, the new report link and Delete all participant data were moved to it. Step 5 Remove (line 1797) and step 6 'Delete their data' (line 1888) still call confirm(). In a browser that has suppressed dialogs for the page (Chrome 'prevent additional dialogs') or an in-app WebView, confirm() returns false at once. The Organizer presses Remove on a Host whose link was lost and nothing happens, with no message.
Suggested fix: Use `askSure` the same way as End game and erase.

Remove (zc.js:1797): `if (!(await askSure("Remove this " + label + "?", "Their link stops working at once." + (host ? "\n\nA Host works in all your games, so this stops them in every game." : ""), "Yes, remove them", "No, keep them"))) return;`. The handler is already async.

Delete their data (zc.js:1888): make the handler `async` and use `if (!(await askSure("Delete this player's data?", "Their name and number are deleted now. This cannot be undone.", "Yes, delete it", "No, keep it"))) return;`.

Update pages.test.ts:297 to click `#zcsure [data-y]` instead of stubbing `win.confirm`. Add one test where `win.confirm` returns false and the in-page question still appears. For consistency, also convert :1985, :1988 and :1992.
Verifier's reasoning: I could not refute it, but it is a leftover inconsistency, not a regression. At 274bde8, zc.js:1797 is `if (!confirm("Remove this Host/Co-host? ...")) return;` and zc.js:1888 is `if (!confirm("Delete this player's name and number now? ...")) return;`. Neither has an else branch or a note. The `askSure` comment at zc.js:337 says the browser's own confirm box can be blocked and then the red button looks dead. That is true: Chrome's "prevent additional dialogs" and WebViews with no confirm handler return false at once. In both calls a false result silently does nothing. No other layer handles it. The diff against fdf52e7 shows both calls were only reworded (1797 got the extra "works in all your games" text; 1888 now goes through `guestTool`). Nothing wraps them for the suppressed-dialog case. The only tests for these flows (pages.test.ts:297 for Remove; pddel has none) stub `win.confirm = () => true`, so the dead-button case is not covered.

Why it is only low, and why it is not a regression:
- The failure is safe. Nothing is removed or erased by mistake, and the organizer can retry in another browser.
- The trigger is environmental and uncommon: a suppressed dialog or an in-app WebView.
- The earlier audit record (idiotproof-confirmed.json, steps-7-10) rated this class low and listed the other confirm sites for consistency. The release then converted only End game, the new report link and both erase calls.

The finding undercounts the leftovers. zc.js:1985 (Retire this key), :1988 (Close your account, the most serious) and :1992 (`newLink`'s `ask`, the replace-AI-link confirm) also still use confirm().

### FINDING 10 [low] A Host who hits one 403 stays stuck on the dead-link page: "All my games" cannot get out
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1463
Scenario: A Host opens a game link and GET /info returns 403, so refreshEng sets S.deadLink = true (line 1451). view() then returns deadLinkView() for any cth_/ctc_ key (line 1463), and a Host never sees the new S.note. The bar still offers "All my games" (hostall, line 1691). It runs leaveGame() + bootstrap(), but S.deadLink is never reset (not in leaveGame at 1687, not in bootstrap, not in the back, open-game or takeKey handlers). The next redraw therefore shows "This link no longer opens the game" again, even if the Host's other games load fine. Only a manual page reload helps. Organizers also keep S.deadLink = true for the rest of the tab, so saveLast (line 1495) is skipped from then on.
Suggested fix: Clear the flag where a person leaves or changes game, and on any success. Edit zc.js:
1. Add `S.deadLink = false;` to leaveGame() (line 1687). That covers hostall, takeKey and switchrole.
2. Add the same to the `$("back")` handler (line 1698) and to the `[data-open-game]` handler (line 1973), because neither calls leaveGame().
3. Optionally, at the end of the successful path in refreshEng (just before the final `redraw()` after the try block), put `if (!S.note || !/^This game does not open/.test(S.note)) S.deadLink = false;`. A simpler way is to set `S.deadLink = false;` right after `S.info = await call("GET", ...)` succeeds. A real 403 sets it again on the next call.
No other change is needed. The dead-link page keeps its bar, so "All my games" then works.
Verifier's reasoning: The mechanism is real, but release 1.2.0 did not introduce it and its effect is narrower than "medium". It was checked with git grep, because the shell pipe truncated git show output.

What holds up, in C:\ct\test-sites\tambola\apps\web\public\zc.js:
- S.deadLink is written once, in the refreshEng catch (line 1451, on a 403). It is read in view() (line 1463) and in draw() (line 1495). Nothing anywhere sets it back to false: leaveGame (1687), takeKey (1688), the hostall handler (1691), the back handler (1698), data-open-game (1973) and bootstrap (2019) all leave it alone.
- view() checks `S.deadLink && /^ct[hc]_/.test(secret)` before anything else, so a Host (cth_) or Co-host (ctc_) key always gets deadLinkView() once the flag is set. That view never shows S.note, so the new 1.2.0 text "Press All my games..." is never seen by a Host.
- barHtml() and roleBtns() still draw "All my games" (id hostall) whenever role is host and eid is set. Pressing it runs leaveGame() and bootstrap().
  - With one game, bootstrap sets eid and refreshEng succeeds, but the next view() returns the dead-link page anyway.
  - With several games it calls redraw(), which also returns the dead-link page, so the game list is never shown.
  - The visible button therefore does nothing useful.
- For an Organizer the flag also stays true for the rest of the tab, so saveLast() is skipped for every later game (line 1495). After a reload the Organizer lands on the home page instead of the last game. This is minor.

What lowers the severity:
- Not a 1.2.0 regression. git grep shows deadLink on 4 lines in both fdf52e7 and 274bde8, with the same sticky behaviour and the same hostall and leaveGame code. 1.2.0 only reworded the 403 note, which a Host never sees.
- It needs a 403 from one of the refreshEng calls for a Host. Examples: a Host opening a link for a game of another organizer, a draft they cannot open, or a game they were removed from. It is not the normal path.
- The person is not locked out for good. "Sign out" and a page reload reset the in-memory flag. leaveGame also strips ?e= from the URL.
- Tests: no test under apps/web/test or apps/edge/test covers deadLink.
- It has happened to real users before: docs/QA_MATRIX_2026-10-23.md item 8 describes a Host thrown to this page during first-open setup. The setup race was fixed at the guard on line 1398, but the flag stays sticky.

The fix is tiny and safe, so it is worth making even though it is not a regression.

### FINDING 11 [low] "Your games" calls a published game that is waiting for payment a "draft"
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1232
Scenario: /api/history returns draft = (pack=0). An organizer publishes a normal paid game and has not paid yet, so pack is still 0, the link is live and the console says Published and Payment pending. The home list (gameRow, line 1232) and the History block (line 1256) still print "draft" for it. The organizer may think the link is not live and not send it, or publish again, and the list never says payment is pending. Only e.deletable (draft and not published) means a real draft; the new last-game bar already uses deletable correctly. The new test makes FR-B exactly this case but never checks its row label.
Suggested fix: The suggested fix is right but incomplete. The middle bucket (draft=1, deletable=0) also holds unpaid games that were cancelled or did not start, and "payment pending" is wrong for those. To be exact, add `(e.cancelled_ms IS NOT NULL) AS cancelled` and `(e.unplayed_ms IS NOT NULL) AS didNotStart` to both history SELECTs in worker.ts (lines 1414-1415). Then label in this order: cancelled, then "did not start", then `deletable` as "draft", then `draft` as "published, payment pending", else "published". The cheap client-only version in the reasoning is acceptable if that rare case is ignored, since those games already show "draft" today.
Verifier's reasoning: The defect is real but not a regression, and its impact is smaller than "medium".

What the code shows:
- worker.ts lines 1414-1415 (/api/history) compute `draft` as `(e.pack=0)` and `deletable` as `pack=0 AND not cancelled AND not unplayed AND no kv 'pub/<id>'`.
- The publish handler (worker.ts about 1838-1860) writes `pub/<eid>` but only sets `pack` when an entitlement exists or the game is a demo or free launch. A normal game published before payment therefore keeps pack=0, so history returns draft=1 with deletable=0.
- zc.js 1232 (`gameRow`) prints `e.draft ? "draft" : "published"`, so that game reads "draft" in "Your games".
- The History block at zc.js 1256 appends " · draft" for `e.draft`.
- Nothing else normalizes the data. `S.history` is the raw response (zc.js 1370 and 2029).
- The console for the same game says "Published" and "Payment pending" (zc.js 1115). admin.ts already separates "published, not paid" from "draft", and the last-game bar at 1254 already uses `deletable`.
- The test at apps/web/test/idiotproof-console-frame.test.ts:96-105 makes and publishes FR-B and asserts "Your last game was on", but not its row label. The pages.test.ts test at 1835 treats UI-PUB1 as published and checks only the Delete button. No test expects "draft" for this case, so the fix breaks nothing.

Why it is only low:
- The label is identical in the old version (the fdf52e7 diff shows the same `e.draft ? "draft" : "published"`). The release added the name and code to that line but did not introduce the mislabel.
- It is cosmetic. The organizer published the game themselves and can tap Open, where the console shows Published and Payment pending. No work is lost and no flow is blocked.
- The Delete button is correctly hidden, so nothing destructive is offered.
- It does breach the rule against contradicting text (the list says "draft", the console says "Published"), and a paid game reads "published" while an unpaid one does not say why. That is worth fixing, but it is not medium.

Smallest fix: label by `deletable` in both places.
- gameRow: `${e.deletable ? "draft" : e.draft ? "published, payment pending" : "published"}`.
- History row: `${e.deletable ? " · draft" : e.draft ? " · published, payment pending" : ""}`.

### FINDING 12 [low] Organizer home still shows "AI" wording: key list row "AI assistant link" and "Suggested by organizers' AI assistants"
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1179
Scenario: On the home screen the Account card is open by default (open = !eid, line 1177). /api/org/keys lists every organizer key, including the "ai" key made at sign-up. The row therefore reads "AI assistant link · made … · Retire", and the ideas block (line 1180) says "Suggested by organizers' AI assistants". This breaks the standing owner rule that the organizer console never mentions AI. The rest of the AI UI is already switched off (aiStrip and aiBlock return ""), so these two lines are leftovers.
Suggested fix: In C:\ct\test-sites\tambola\apps\web\public\zc.js line 1179, change the ai label from "AI assistant link" to a neutral "Work link". Do not hide the row: the key stays in the list and the organizer can still retire a lost or leaked link. The mailed temporary links are kind "ai" too, and it is the only place the organizer can retire a key. In line 1180, change small("Suggested by organizers' AI assistants. We review them all.") to small("Suggested by organizers. We review them all."). For the owner rule, also add a test with p.text() not matching /\bAI\b/ on the home screen with the Account card open (call refreshHome and open "#acct"). pages.test.ts:221 checks only /AI work link/ on a game page, where the card is collapsed.
Verifier's reasoning: The wording is shown to organizers as claimed, and nothing in the code hides it. It is also not new in 1.2.0, and nothing breaks or blocks a person.

What the code shows:
- zc.js:1179 labels a key row "AI assistant link" when k.kind === "ai". zc.js:1180 prints "Suggested by organizers' AI assistants". The key-list line is long and also covers the "Host key", "Co-host key" and "Organizer key" labels.
- GET /api/org/keys (worker.ts:1051-1056) returns every key of the org, with no filter on kind. createOrganizer (worker.ts:649-650) always inserts a kind "ai" key at sign-up, and mailTempLink inserts more ai keys. So every organizer's list has at least one "AI assistant link" row.
- refreshHome (zc.js:1367) loads S.keys and S.sugs. S.acctOpen starts as null (zc.js:1346), so open = !eid (zc.js:1177). The Account card is therefore open by default on the home screen, and the row shows for every returning organizer.
- aiBlock returns "" (zc.js:1166-1167), and the audit block is blanked, so these two strings are leftovers of the switched-off AI UI, as the finding says.
- No test asserts either string. Tests under apps/web/test and apps/edge/test contain neither "AI assistant link" nor "Suggested by organizers". The only guard, pages.test.ts:221, checks /AI work link/ on a game page where the card is collapsed, so it would not catch this. A fix will not break any test.

Why only low:
- Both strings are identical in live fdf52e7 (one occurrence of each; the old and new files differ only elsewhere). The 1.2.0 edits neither introduced nor touched them, so this is not a regression.
- It is a wording violation of the standing owner rule. No flow is blocked and no data is at risk.
- The suggestions block shows only when ideas exist. The key row always shows.

I could not refute the finding. I rate it low rather than medium because it is a pre-existing text slip that blocks no one.

### FINDING 13 [low] False "Not saved yet" and a stuck __ctDirty flag hold back the page update for the whole tab
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1481
Scenario: markUnsaved flags a step on any click on [data-ck] or [data-bool]. But edited() (lines 92, 1670, 1715) deliberately ignores a re-tap of the already chosen chip and the capOther button "My crowd is a different size". A person who only re-taps the selected size, or opens the own-number box, sees "Not saved yet. Press the button below…" although nothing changed (the top banner says nothing, so the two disagree). S.unsaved[n] is cleared only by a successful Save of that step. It is not cleared when the game starts and the steps lock, nor when "All games" or Open discards S.f. window.__ctDirty() (line 1480) then stays true and autoupdate.js never reloads this console tab, including for a fix released while the game is live.
Suggested fix: In zc.js:
1. window.__ctDirty = () => !!S.f && !lockedGame() && role() !== "cohost" && [1, 2, 3, 4].some((n) => S.unsaved[n]);
2. In markUnsaved, for a click, return early when t.closest('[data-bool="capOther"]'), or when t.closest('[data-ck]') is a non-multi chip with aria-pressed="true" and data-ck !== "brand.color". brand.color is the one chip where re-tapping the chosen value really clears it (line 1673), so it must still be flagged. chipClick's own test, "String(getP(path)) !== String(v) or multi", mirrors this.
3. Reset S.unsaved = {} next to each S.f = null (lines 1606, 1687, 1698, 1958, 1973, 1981), or put it in one small helper.
Add one test for each case: re-tap of the chosen chip leaves no #unsavednote, and __ctDirty() is false once the game is locked.
Verifier's reasoning: Confirmed from the code. No data is lost, but the false note and the stuck flag are both real, and no test covers them. (1) False "Not saved yet". markUnsaved (zc.js 1481-1486) flags on any click that lands on [data-ck] or [data-bool], with no check that anything changed. chipClick (1671) deliberately skips edited() when a single-choice chip is re-tapped with the value it already has. The capOther button (1715) is also skipped. That button only reveals the empty "your own number" box, because it is drawn only when the box is hidden (lines 410-411). So re-tapping the chosen size, speed, occasion or ticket count, or opening that box, still sets S.unsaved[n]. The foot note then reads "Not saved yet. Press the button below to keep your changes." although nothing changed. In steps 1 and 2 the banner at the top of the step (line 1139) uses touched(n), which stays false, so the two messages disagree. The tests (idiotproof-steps-3-4 line 105, idiotproof-console-frame lines 157-161) only cover a real edit. (2) Stuck flag. S.unsaved[n] is cleared in only two places: line 1351, when syncForm sees a new game or S.f is null, and line 1591, after a successful Save. Lines 1698, 1687, 1973, 1958 and 1981 set S.f = null but leave S.unsaved alone. S.started is purely time-based (line 1421). When the start time passes with a flag set, lockedGame() turns true and steps 1-4 render only lockedNote() plus readBack() (lines 383, 406, 447, 519), so Save can never run and the flag can never clear. The author knew locked games must ignore the flag, because unsavedWarn() (line 1349) checks !lockedGame(). window.__ctDirty (line 1480) has no such check. autoupdate.js (lines 29 and 34) then returns early on every 45-second check, so that tab never reloads for a release, including one made while the game is live. After "All games", __ctDirty stays true on the home list until a game is opened. The effect is a console tab left on old code until the person reloads, plus a misleading note, so low severity. Smallest correct fix is below.

### FINDING 14 [low] Deleting the only draft can silently create a brand-new game
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1372
Scenario: The Delete handler (line 1969) ends with refreshHome(). refreshHome auto-creates a first game when history is empty and sessionStorage ctz-qauto is not "1". That key is set only inside that same empty-history branch, so in a tab that never auto-created (an organizer who already had games, and a new tab) it is unset. The organizer deletes their only draft and is dropped straight into a new game with no "Draft deleted." note (afterCreate clears it). The 5-second tick can do the same if the last game is deleted from another tab. This breaks the rule that "Create a new game" is the only way to create a game.
Suggested fix: In `refreshHome` (zc.js:1370), right after the history is loaded, mark the tab as having seen games: `if (S.history && S.history.engagements && S.history.engagements.length) { try { sessionStorage.setItem("ctz-qauto", "1"); } catch {} }`. This covers the delete handler, the 5-second tick and another-tab deletion with one line, and the new-organizer path (empty history on first load) is unchanged. The narrower alternative from the finding is to set `ctz-qauto` to "1" inside the delete handler before `await refreshHome()`, but that leaves the other-tab/tick case open. Add a test with one draft, no preset `ctz-qauto`, and two taps on Delete, asserting that the home shows "Draft deleted." and that no new game is created.
Verifier's reasoning: The code path is real, but it is not a 1.2.0 regression and the harm is small.

Reproduced from the committed code (274bde8):
- The Delete button (`data-del-draft`, shown by `gameRow`) is only drawn in `gamesBlock` on the organizer home screen, where `eid` is empty (zc.js:1232).
- The handler at zc.js:1969-1972 POSTs `/discard`, sets "Draft deleted.", then runs `await refreshHome()`.
- `/discard` calls `eraseEverything`, so the draft is gone from `/api/history` (worker.ts:1950-1956).
- `refreshHome` then sees `engagements.length === 0`. Its guard at zc.js:1372 is `isOrg() && !QUICK && !NEWDEMO && !NEWGAME && !eid`. The only thing stopping it is `sessionStorage "ctz-qauto" === "1"`.
- That key is written in one place only, inside this same empty-history branch (grep finds 1 occurrence in zc.js). In a tab that loaded a non-empty history it is never set.
- So a returning organizer in a fresh tab with exactly one draft, who taps Delete twice, gets `startNew()` and a new game. The 5-second tick (zc.js:2042) goes through the same `refreshHome` and does the same if the last game is deleted from another tab.
- One detail in the finding is off: the person sees "Your draft is saved. Open each step..." (set by `startNew`), not silence. "Draft deleted." is still gone.
- The existing tests do not cover it. The delete test (pages.test.ts:1835) has 2 drafts and a published game. The dashboard tests preset `ctz-qauto=1`.

Why this is only low and should not hold the release:
- It is pre-existing and unchanged by 1.2.0. I compared fdf52e7 and 274bde8 with git via Python, because the shell filter truncates `git show | grep` output. The `ctz-qauto` line (1341 to 1372) and the delete handler (1897 to 1971) are byte-identical, so this behavior is already live in 1.1.8. The only nearby 1.2.0 changes are a single-flight busy guard on the tick and an `S.histErr` flag in `refreshHome`. Neither changes this behavior.
- It is not among the 79 confirmed audit items.
- The "first game is made by itself, once" behavior is deliberate (commit a3cc315, "first game made for a new organizer"). This case is the heuristic's blind spot, where "no games" does not mean "new organizer".
- It is bounded and loses nothing. It happens once per tab, because `startNew` has already set the key. The person lands in a working draft and can delete it again without a repeat. It only costs one extra draft and a slightly surprising screen.
- It conflicts with "Create a new game is the only way to create a game" only loosely, since that rule itself includes the first-game exception.

### FINDING 15 [low] The "Create a new game like this one" panel follows the person into another game and clones the wrong one
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1395
Scenario: S.clone = {from: A} is set by a data-clonebtn tap and cleared only by "Not now" or a successful clone (lines 1952 and 1959). The per-game reset block in refreshEng, the open-game handler and back do not clear it. On home the organizer taps "Create a new game like this one" on game A, then taps Open on game B. alertZone() draws the same panel at the top of B's console, with no name of the source game. Pressing "Create the new game" there copies A, not B.
Suggested fix: Clear the stale clone state when the open game changes. In the data-open-game handler (zc.js:1973), add `if (S.clone && S.clone.from !== b.dataset.openGame) S.clone = null;`. In the back handler (1698), add `S.clone = null;`. Optionally also add `S.clone = null;` to the `S.stateFor !== eid` reset in refreshEng (1395). That reset is safe: #clonego clears S.clone itself before refreshEng, and the step-7 clone button sets S.clone after the reset has run. Optionally, put the source game's name in the panel text so "this one" is unambiguous.
Verifier's reasoning: I could not refute this. The failure follows from the code, but it is not a 1.2.0 regression, and the damage is limited and recoverable.

What the code does:
- S.clone is assigned only at zc.js:1950, when a data-clonebtn is tapped. That sets { from: b.dataset.from || eid, ... }.
- It is cleared only at 1952 ("Not now", #cloneno) and 1959 (after a successful clone).
- A grep of the whole file finds no other place that clears it. The per-game reset in refreshEng (line 1395) does not touch S.clone. The data-open-game handler (1973) and the back handler (1698) do not either.
- clonePanel() is drawn in two places, with no check of which game it belongs to: home (main0 at 1255) and the top of every game console via alertZone() (1193, called from mainHtml at 1209).
- #clonego posts to `/api/z/${K.from}/clone` (1956). K.from is the game the panel was opened for, not the game now on screen.
- Scenario: on home, the organizer taps "Create a new game like this one" on game A's row (gameRow, 1232). The panel appears at the top of home. They tap "Open" on game B instead of answering the panel. refreshEng sets eid to B and the console renders. alertZone() draws the same panel, titled "Create a new game like this one" and with no source-game name, at the top of B. Pressing "Create the new game" clones A. The "Also bring my people list from the old game" tick also refers to A.
- The step-7 cloneButton path leaves the same stale state: tap clone in game A's console, press back, then open B.

Limits on severity:
- The panel is the first thing on screen, and the click handler scrolls to it. "Not now" is right beside the button the person would press, so most people will answer the panel before navigating.
- The result is a free, unpublished, deletable draft. It lands with the note "Your new game is ready to check". Nothing is paid, published, or lost.
- The guest list copied is the organizer's own, and the server authorizes the clone of A for that same organizer.
- No test covers opening another game with the panel open. The tests I found (pages.test.ts around 1775-1794, idiotproof-console-frame.test.ts:107) only click through the panel on one game.

Origin: clonePanel() in alertZone, the home main0, and the S.clone assignments and clears all exist in the live version fdf52e7 (lines 891, 1162, 1224, 1876-1885). 1.2.0 did not introduce this. It only changed game rows to show names.

### FINDING 24 [medium] Organizer home screen still shows "AI assistant link" (rule: no AI wording in the organizer console)
File: C:\ct\test-sites\tambola\apps\web\public\zc.js line 1179
Scenario: Every new account gets a lasting key of kind 'ai' at sign-up (apps/edge/src/worker.ts:649), and GET /api/org/keys returns all keys, including that one (worker.ts:1054). The home screen (no game open) opens the 'Your account' box by default (S.acctOpen = null, zc.js:1346, so open = !eid). Its keys list prints k.kind === "ai" ? "AI assistant link" with a Retire button, so a normal organizer who just opens the console reads 'AI assistant link · made <date>'. Line 1180 also prints 'Suggested by organizers' AI assistants' above any suggestions. Lines 1188 and 1201 ('Your AI assistant brought you here', 'Your AI assistant is asking') are only reached after an AI hand-over, and pages.test.ts:992 locks the first one in. The existing guard (pages.test.ts:221) only runs on a game screen where the account box is collapsed and only checks /AI work link/, so this was never caught. aiStrip() and aiBlock() were already neutered, but this list was missed. This predates 1.2.0 but is still in the shipped code.
Suggested fix: In apps/web/public/zc.js acctHtml(), around lines 1179-1180:

(a) Drop AI keys before rendering the keys block, for example `const ks = (S.keys || []).filter((k) => k.kind !== "ai");`. Use `ks` for both the length check and the map, so the block is hidden if nothing is left (the master key means it normally won't be empty).

(b) Reword the suggestions note to "Suggested by organizers. We review them all."

(c) Add a test in pages.test.ts that opens the console home screen as a fresh organizer and asserts p.text() has no /\bAI\b/. Also change the line 221 style guard to run against the home screen with the account box open.

Optionally, avoid the "Your AI assistant ..." wording in actBanner and the reqs alert, or accept it only after an AI hand-over. pages.test.ts:992 locks the actBanner text in, so that test would need to change with it.
Verifier's reasoning: The finding holds. I read all of it in the release tree at 274bde8.

1. Every organizer has an AI key. createOrganizer (apps/edge/src/worker.ts:649) inserts an organizer_key row with kind "ai" at sign-up. GET /api/org/keys (worker.ts:1051-1056) selects every key row for the org, whether active or revoked, and returns each row's kind unchanged.

2. The keys are loaded and rendered on the home screen.
   - refreshHome (zc.js:1367) and loadAccount (zc.js:1375) put the result straight into S.keys, with no filtering.
   - viewDispatch (zc.js:1467) shows homeView() for an organizer when no game is open. homeView ends with ${acctHtml()} (zc.js:1259).
   - acctHtml computes open = S.acctOpen === null ? !eid : S.acctOpen (zc.js:1177). S.acctOpen is initialised to null (zc.js:1346) and eid is empty on home, so the Your account box is open by default.
   - The keys block at zc.js:1179 prints `k.kind === "ai" ? "AI assistant link" : ...` for each key. Every organizer therefore reads a row such as "AI assistant link · made 12/10/2026", with a Retire button, or "retired" if it was replaced.

3. Showing this contradicts the console's own intent and the standing rule "no mention of AI in the organizer console".
   - aiStrip() returns "" with the comment "the AI work link is not offered to the organizer or the host".
   - aiBlock() returns "" (zc.js:1167).
   - The audit block is blanked with the comment "the AI activity log is not shown in the organizer console".
   - The keys list was missed.

4. Line 1180 is also real. Its sentence "Suggested by organizers' AI assistants." shows whenever S.sugs is non-empty. /api/z/suggestions is shared across all organizers (worker.ts:1328-1338), so any organizer can see it.

5. Nothing else catches it. pages.test.ts:221 checks p.text() only on a game screen (UI-TEN), where the account box is collapsed, and it only tests /AI work link/. No test asserts "AI assistant link", "Organizer key" or the retire button text on the home screen. Lines 1188 and 1201 (actBanner, "Your AI assistant is asking") are reached only after an AI hand-over, so they are not the main problem.

The finding says this predates 1.2.0. The old zc.js (fdf52e7) has the same keys and sugs lines (1148-1149), so it is not a 1.2.0 regression. It is still a violation in the shipped code. Impact is wording only: nobody is stuck and no work is lost. It shows on the default landing screen for every organizer, so I rate it medium.
