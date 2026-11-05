# Independent review of the join-redesign WIP (workflow review-join-redesign, 26 Oct 2026 ~22:45 IST)
29 findings confirmed by a refuting skeptic, 8 refuted. Severity shown = the skeptic's verdict. Full reasoning in the workflow output file / journal.

## 1. [medium] (server-join) POST /api/z/:id/who is unreachable: the action is missing from the route regex, so it always answers 404
File: apps/edge/src/worker.ts:?
Scenario: Line 1484 matches /api/z/{id}/(join|claims|...|checkin|presence) and `who` is not in that list (the diff leaves the regex line unchanged). A request POST /api/z/PPL-1/who {empId:"E101",consent:{...}} falls into `if (!m) return json({error:"Not found", hint:...}, 404)` at line 1485 and never reaches the handler at lines 1561-1579 (the isDraft check at 1559 is dead for `who` too). z.js does not call it yet and no test covers it, so nothing fails visibly; once the page is wired to ask 'Is this you?' it gets 404 for every ID, listed or not.
Fix (reviewer): Add `who` to the action alternation on line 1484 (and to any other per-action allow-list you keep, e.g. the AI manifest/param-matrix if they enumerate actions), then add a real test: listed ID -> {known:true,name:'Asha R.'}, unlisted -> {known:false}, no consent -> 400 consent-required, draft -> 403.
Skeptic's better fix / notes: 1. In apps/edge/src/worker.ts:1484, add `who` to the action alternation, for example `...|checkin|presence|who)$/`. No other allow-list needs changing: the AI manifest does not list player-side routes, and HOST_ACTIONS only limits a Host's AI work link.

2. Add a committed test through the real worker route; the current suite never reaches the handler:
- POST /api/z/{id}/who with a listed employee ID and the K4 consent returns 200 with `{known:true,name:"Asha R."}` (first name plus last initial).
- An ID that is not on the list returns `{known:false}`.
- A missing K4 consent returns 400 with code `consent-required`.
- Wrong IDs return 429 `too-many-tries` after ID_MISS_PER_10MIN tries from one IP.
- A draft game returns 403, a cancelled game returns 409, and `mobile` mode returns `{known:false}`.
Run the test with the regex line reverted to prove it fails.

3. Correct the handover wording ("the /who route exists") so it is not read as proven. It is not proven until the test above passes.
Skeptic's reasoning: I could not refute the finding. The route is dead code, so it is real, but "high" overstates how much damage it does today.

What I checked in the code:
- apps/edge/src/worker.ts:1484 is the only dispatcher for /api/z/{id}/{action}. Its action list is: join|claims|bogey|settle|results|info|participants|erase|discard|reuse|roster|settings|publish|summary|announce|unbind|seats|names|mark|won|over|invites|life|vote|confirm|prizes|prizegiven|myprizes|reportlink|person|forget|cohost|cancel-preview|cancel|reopen|clone|leave|datareq|checkin|presence. `who` is not in it.
- That line is byte-identical to the one at 274bde8 (release 1.2.0), at the wip/join-redesign tip c4ba645, and in the working tree. The WIP added the handler but never touched the regex.
- Line 1485 (`if (!m) return json({error:"Not found",...},404)`) runs before the handler. Any request to /api/z/<id>/who therefore gets a 404 whatever the method, ID or consent, and never reaches the `action === "who"` handler at 1561-1579. The draft guard at 1559 is dead for `who` too.
- No earlier route catches it:
  - The people/waiting/me matcher at 1470 does not include `who`.
  - The control matcher at 1257 does not include `who`.
  - The suggestions matcher at 1328 does not include `who`.
  - audit.ts:116 is only a generic logging pattern.
  - A search of apps/edge/src shows no other place that lists engagement actions (HOST_ACTIONS at 1513 only restricts a Host's AI work link).
- No caller or test touches the route. z.js has 

## 2. [medium] (compat-tests) guide.test.ts goes red: two new server messages have no guide entry
File: C:\ct\test-sites\tambola\apps\web\test\guide.test.ts:?
Scenario: The first test (line 38) scans every `error: "..."` literal in apps/edge/src and requires a matching guide.js fragment. Two new literals match nothing: people.ts:133 "Open this ticket on the phone you joined with to invite people." (403, code device) and worker.ts:1622 "This employee ID already has a ticket on another phone. A ticket plays on one phone only. ..." (423, code id-used). guide.js (not touched by the work) has no fragment for either (line 99 only knows "This ticket is already on another phone" and "This ticket was opened in a different browser or app"; line 107 only knows "Please open this from the phone that holds ..."). The test lists both as missing, and at run time a player gets the generic status card instead of steps.
Fix (reviewer): In C:\ct\test-sites\tambola\apps\web\public\guide.js add "This employee ID already has a ticket on another phone" to the `m` array of line 99, and "Open this ticket on the phone you joined with" to the `m` array of line 107 (both are over 14 characters, so the short-fragment test stays green).
Skeptic's better fix / notes: In C:\ct\test-sites\tambola\apps\web\public\guide.js:
- Add "Open this ticket on the phone you joined with" to the `m` array of the line 107 entry ("Please use the phone that holds your ticket"). Its step "Open your ticket link on the same phone you joined with." matches people.ts:133.
- For worker.ts:1622 add a dedicated blocked entry rather than reusing line 99, with m: ["This employee ID already has a ticket on another phone"], title along the lines of "This employee ID already has a ticket", and steps such as "If it is you on a new phone, ask your organizer to move your ticket to this phone." and "If it is not you, check the ID and try again." Keep the text free of the BANNED technical words, and place it before any broader entry that could match first.
Skeptic's reasoning: The finding holds up. I re-implemented guide.js's matcher (norm plus a substring match of each catalog fragment, honouring the per-entry status filter) over all 140 catalog entries. I did not run the test suite, as instructed.

1. Both literals are new in the WIP. At 274bde8 neither "Open this ticket on the phone you joined" nor "already has a ticket on another phone" appears in people.ts or worker.ts. In the WIP they are at C:\ct\test-sites\tambola\apps\edge\src\people.ts:133 (`}, 403)`, code "device") and C:\ct\test-sites\tambola\apps\edge\src\worker.ts:1622 (`}, 423)`, code "id-used").
2. guide.js and guide.test.ts are untouched since 274bde8, and git log shows no commit touching either.
3. Neither message matches a catalog fragment, at status 403 or 423.
   - The nearest entries are guide.js:99 ("This ticket is already on another phone", "This ticket was opened in a different browser or app"), guide.js:100 ("This ticket belongs to another phone") and guide.js:107 ("Please open this from the phone that holds ...").
   - None of their normalised fragments is a substring of the new messages. A search of guide.js for "employee id" and "invite people" finds only unrelated entries at lines 51 and 103.
4. Neither message is excluded by apiOnly. API_ONLY at guide.js:209 is a prefix match, and neither message starts with any listed item.
5. The test at apps/web/test/guide.test.ts:38 scans every `error: "..."` literal in apps/edge/src. For both new literals it takes the status from

## 3. [medium] (compat-tests) New localStorage key ctz-cc is not in the storage registry or the Privacy page
File: C:\ct\test-sites\tambola\apps\web\public\z.js:?
Scenario: z.js:125 `const CC_KEY = "ctz-cc"`, read at :128 `store.get(CC_KEY)` and written at :894 `store.set(CC_KEY, J.cc)`. storage-scan.ts follows the constant, so apps/web/test/storage-notice.test.ts test 1 (line 19-22) reports `z.js: localStorage ctz-cc` as missing from apps/web/storage-registry.json. Besides the red test, the Privacy page sentence block in legal.html, which the test requires to list exactly what the scripts keep on a device, does not mention that the phone remembers the chosen country.
Fix (reviewer): Add "ctz-cc" to apps/web/storage-registry.json (new item or inside player-device with an updated `say`), and put the identical sentence as an <li> in the storage:start/end block of apps/web/public/legal.html.
Skeptic's better fix / notes: Add one registry item, or extend `player-game`, in apps/web/storage-registry.json with `store: "localStorage"`, `keys: ["ctz-cc"]` and a `say` such as "On a player's phone: the country chosen for the mobile number, so the list opens on it next time." Put that exact sentence, with `&rsquo;` for the apostrophe, as an `<li>` in the same position inside the `<!-- storage:start -->` ... `<!-- storage:end -->` block of apps/web/public/legal.html. The `<li>` order must follow the registry order, because test 5 compares the lists with `toEqual`. Keep the key as a constant string so the scanner can follow it. If the check-in or prize cards are later given a country list, make them reuse CC_KEY. Run `bun test apps/web/test/storage-notice.test.ts` before release.
Skeptic's reasoning: I could not refute this. It is a real defect introduced by the WIP, but "high" is overstated. I read the code and did not run any tests.

Facts I checked:
- C:\ct\test-sites\tambola\apps\web\public\z.js defines `const CC_KEY = "ctz-cc";` at line 125. It reads the key with `store.get(CC_KEY)` at line 128 and writes it with `store.set(CC_KEY, J.cc)` at line 894. `store` wraps `localStorage` (line 12). `ctz-cc` is absent from 274bde8's z.js, so the WIP adds it.
- apps/web/test/storage-scan.ts matches `store.get(` and `store.set(`. It follows a constant in the same file through its `(?:const|let|var) NAME = ...` regex, which resolves CC_KEY to "ctz-cc". z.js is in the shipped FILES list of pages/build.mjs. The scan therefore reports `z.js localStorage ctz-cc`.
- apps/web/storage-registry.json has no `ctz-cc`. The test compares exact `store|key` strings, and none of the wildcard entries (`ctz:*:pid`, `ctz-wait-*`, `ctz-prog-*-*` and so on) can match "ctz-cc". Test 1 in apps/web/test/storage-notice.test.ts ("every key the scripts keep on a device is listed") will fail.
- apps/web/public/legal.html has no sentence for it either, and test 5 requires the page's storage:start/end list to equal the registry sentences exactly.
- `git diff 274bde8` shows the WIP changed neither storage-registry.json, legal.html nor storage-notice.test.ts. docs/HANDOVER_2026-10-26_JOIN_REDESIGN.md says only some web tests were run ("Nothing else was run since"). It lists phone-guest and idiotproof-player-p

## 4. [low] (server-join) CSV list export prefixes every non-Indian mobile with a literal apostrophe
File: apps/edge/src/people.ts:?
Scenario: Kept numbers of other countries now begin with '+' (keptFromClean / keptPhone, e.g. '+447911123456'). exportPeople (line 358) writes pii.phone through csvCell (line 186), whose formula-injection guard `/^[=+\-@\t\r]/` turns it into "'+447911123456". The Organizer downloads the list and the Mobile column shows a stray apostrophe for every foreign person (India's '919876543210' is unaffected). Before this change nothing stored started with '+'.
Fix (reviewer): Exempt a cell that matches /^\+\d{6,15}$/ from the apostrophe rule in the Mobile column (a pure +digits string cannot be a formula), or export the Mobile column as digits only.
Skeptic's better fix / notes: Do not run the Mobile column through the formula guard blindly. In exportPeople, write the phone cell with a helper that skips the apostrophe when the value matches /^\+?\d{6,15}$/ (a digits-only number cannot be a formula). Keep csvCell for the Name, Employee ID and Invited-by columns. This also keeps the export re-importable, because cleanPhone rejects a leading apostrophe. Separately, fix people.ts:300 so it does not prepend another '+': use `t.digits.startsWith("+") ? t.digits : "+" + t.digits`.
Skeptic's reasoning: I could not refute it. The mechanism is confirmed by reading the code, and the WIP change causes it.

1. The export code is unchanged since 274bde8. `csvCell` is at apps/edge/src/people.ts:186 and is identical to the 274bde8 version (old line 202). It prefixes an apostrophe to any cell matching /^[=+\-@\t\r]/. `exportPeople` (line 358) writes `pii?.phone` into the Mobile column with `.map(csvCell)`, as it did before. The WIP did not touch either.

2. The WIP changed what `pii.phone` holds. The old cleanPhone returned bare digits (old people.ts lines 62-77), so nothing stored began with '+'. Now `keptFromClean` returns '+' + digits for every number that is not 12 digits starting with 91 (phonekit.ts:40). `keptPhone` does the same (phonekit.ts:31 and 35). The bulk-add path seals `keptFromClean(cl.digits)` (people.ts:291, and 276 for ID-only people), and the people.ts:420/424 call sites seal the same value. So a stored UK number is '+447911123456', and `csvCell` turns it into "'+447911123456". India's '919876543210' is unaffected. Foreign numbers are new in kept form, and a number typed '+65 ...' used to be stored as '65...' without a plus.

3. The Organizer or Host reaches this through GET /api/z/:id/people/export. The page at zc.js:1872 fetches that export and offers it for download. In Excel or Sheets the leading apostrophe is displayed literally when it comes from a CSV, so every foreign Mobile cell shows a stray apostrophe.

The impact is cosmetic and low. The cell content 

## 5. [low] (server-join) 'Removed' message shows a double plus for non-Indian numbers
File: apps/edge/src/people.ts:?
Scenario: Line 300 builds `raw: ${t.name} ${t.digits ? "+" + t.digits : ""}`. t.digits is now the kept form (keptFromClean), which already starts with '+' for non-Indian numbers. A Co-host adding '+44 7911 123456' for a person they earlier removed gets raw: 'Asha ++447911123456' in the `invalid` list that the console shows.
Fix (reviewer): Use phoneDigits(t.digits) or the kept value as it is: `t.digits ? (t.digits[0] === '+' ? t.digits : '+' + t.digits) : ''`.
Skeptic's better fix / notes: At apps/edge/src/people.ts:300 use `t.digits ? "+" + phoneDigits(t.digits) : ""`. That is correct for both kept forms: bare 91+10 digits for India, and +<code><number> for other countries. `phoneDigits` is already in scope, since waLinkOf on line 90 uses it. The proposed `t.digits[0] === '+' ? t.digits : '+' + t.digits` also works.
Skeptic's reasoning: Confirmed by reading the code and diffing against 274bde8. In 274bde8, `todo[].digits` was always bare digits (`cl.digits`, at old lines 292 and 307). The removed-person message at that commit (old line 316) used `t.digits ? "+" + t.digits : ""`, which was correct. The WIP changes `digits` to the kept form via `keptFromClean(cl.digits)` (people.ts lines 273 and 286). `keptFromClean` returns bare `91`+10 digits for India but `"+" + digits` for any other country. The WIP did not update the `"+" + t.digits` at people.ts:300, so a non-Indian number now renders with two plus signs.

Trace for '+44 7911 123456': `cleanPhone` sees a leading '+', and the digits do not start with 91, so it takes the `international` branch and returns `digits: "447911123456"`. `keptFromClean("447911123456")` is 12 digits but does not start with 91, so it returns "+447911123456". That value is pushed to `todo` with `digits: "+447911123456"`. At line 300 the `invalid` entry becomes `raw: "Asha ++447911123456"`.

Indian numbers are unaffected: `digits` is "919876543210", so the message shows "+919876543210". Nothing is stored or hashed from this string, so the effect is cosmetic: wrong text in the console's `invalid` list. The console parses that `raw` string again on the client (zc.js ~716). A '++' number may also fail its employee-ID lookup via `cleanPhone(q.phone)`, but that is speculative and also cosmetic.

One correction to the scenario in the finding. A Co-host or guest who removed the person thems

## 6. [low] (checkin-winners) PDF report cuts kept international numbers longer than 12 characters (UK, UAE, Pakistan, Saudi, Philippines, Germany...)
File: C:/ct/test-sites/tambola/apps/edge/src/report-layout.ts:38
Scenario: mob() now returns a kept international number unchanged, for example '+971501234567' or '+447911123456' (13 chars). The Mobile column in the winners table (line 100), the lucky-draw table (line 106) and section 6 'Everyone, with name and mobile number' (line 196) is 12 characters wide. pdf.ts:90 cuts any longer cell to width-2 characters plus '..', so the report prints '+971501234..' and '+447911123..' with 3 digits replaced by '..'. Before this change mob() returned at most 12 digits, which fit. Section 6 and the e-mail text call the PDF the only copy of the participants' details once they are erased after 20 hours, so those digits are lost for good. Winner rows are cut the same way, which breaks the prize hand-over for a foreign winner. Indian numbers (11 chars) and +65/+1 numbers (11-12 chars) fit, so a test with only those would not show it.
Fix (reviewer): Widen every 'Mobile' column that receives mob() to at least 16 (a '+' plus 15 digits) and take the characters from Name or Role so the table still fits the page. Alternatively have mob() return a spaced '+971 50 123 4567' and size for it. Add a report test with a 13-digit +971 and a +44 number that asserts the full number appears in the PDF text.
Skeptic's better fix / notes: Widen the Mobile column to 16 (a "+" plus 15 digits) in all three tables: winners (line 100), lucky draw (line 106) and section 6 (line 196). No other column needs to shrink. The widest table, the winners table, is 90 characters wide now. That is about 410 pt of the 507 pt page width at Courier 7.6 pt (4.56 pt per character). Widening Mobile by 4 gives 94 characters, about 429 pt, which still fits. A more robust option is to size the Mobile column from the longest mob() value in the data, with a minimum of 12 and a maximum of 16. Add a report test in report-logo.test.ts or privacy.test.ts. It should pass in people and winners with +971501234567, +447911123456 and a 15-digit number, then assert the full number appears in the PDF text and that ".." does not appear in the Mobile column.
Skeptic's reasoning: The mechanism is real and the WIP introduced it. The strongest claim in the finding, that the digits are "lost for good", is wrong.

What holds up:
- report-layout.ts:38-42: mob() returns any kept number that starts with "+" unchanged. For +971501234567 or +447911123456 that is 13 characters.
- Winners table (line 100), lucky-draw table (line 106) and section 6 (line 196) all set the Mobile column to width 12.
- pdf.ts:90: the cell function cuts any cell longer than the column width to width-2 characters plus "..". The 13-character numbers print as "+971501234.." and "+447911123..", so the last 3 digits are gone.
- Before the WIP, worker.ts digitsOf stored foreign numbers as bare digits, so a 12-digit UAE/UK/Pakistan/Saudi/Philippines number was 12 characters and fit. keptPhone/keptFromClean now add a "+" (worker.ts:1591, people.ts:276/291/420/424, winners.ts:90, checkin.ts:106), which pushes every foreign number of 12 or more digits over the limit.
- Numbers that still fit: Indian (shown as "98765 43210", 11 characters), +1 and +65.
- Since the WIP adds a country list to the join form, foreign numbers will become common.
- No test covers this. report-logo.test.ts and privacy.test.ts do not check a foreign number in the PDF text.

What the finding overstates:
- The report does not lose the digits for good. Section 5 (treeLines/treeSection, lines 171-192) lists every participant with seat and full mob() output through pdf.pre(). That function cuts only at the page edge (about 

## 7. [low] (checkin-winners) Check-in mobile box is still maxlength=14 and has no country list, so a long international number is silently cut and then saved as a different valid number
File: C:/ct/test-sites/tambola/apps/web/public/z.js:783
Scenario: The server side now accepts any country (checkin.ts:105-106), but the page's check-in edit field `<input id="ckmob" ... maxlength="14">` was not changed and has no country list. The comments in checkin.ts:105 and winners.ts:87 say 'the page sends +<country code><number>', but this page sends whatever was typed. A UAE participant clicks Edit and types '+971 50 123 4567' (16 characters). The browser keeps '+971 50 123 45', so the body is mobile='+971 50 123 45'. cleanPhone reads that as international with 10 digits, which is inside the accepted 8-15 range. The server answers ok and stores '+9715012345' with editedMobile=true, and no error is shown. The participant's real number is lost, and the wrong number reaches the prize hand-over and the report. The earlier audit named this box ('the box is too short for an international number', recommended maxlength of at least 20) and it is still open. Related: with no country list, a Singapore participant who types '6591234567' without a '+' is read as an Indian number and kept as '916591234567'.
Fix (reviewer): Raise maxlength on #ckmob to 20 or more, or remove it. Better, give the check-in edit and the prize 'Your mobile number' box the same country list as the join form, so the page really sends +<code><number>. Optionally have the server refuse an international number shorter than the usual length for its country code.
Skeptic's better fix / notes: One line: drop `maxlength="14"` on `#ckmob` in apps/web/public/z.js:783 (or raise it to 20 or more). Fuller fix: reuse the join form's country select and `CTPhone.parse` in the check-in edit box, and in the prize box if you want it consistent, so the page really sends +<code><number>. Optionally have the server refuse an international number shorter than usual for its country code, which is not needed once the box is no longer cut.
Skeptic's reasoning: The mechanism is real, but the reach is narrow, so I rate it low rather than medium.

**What I confirmed in the code**
- z.js:783 (`#ckmob`) still has `maxlength="14"`, no country list, and sends whatever was typed (z.js:795, 806). The WIP diff does not touch this block except `ckTime`. The join phone box (`#ph`, z.js:143), the My-invites box and the prize box (`#cfph`, z.js:374) have no maxlength.
- The scenario's arithmetic holds. '+971 50 123 4567' is cut to '+971 50 123 45' (14 characters) by the browser.
  - `cleanPhone` (phonekit.ts) sees a leading '+', digits '9715012345' (10), no '91' prefix, so it takes the international branch and accepts 8-15 digits.
  - `keptFromClean` returns '+9715012345'.
  - checkin.ts:105-106 differs from the stored '+971501234567', so it saves the value with editedMobile=true and answers ok with no error.
- The checkin.ts:105 comment ("the page sends +<country code><number>") is wrong for this page. Only the join form builds an E.164 number.

**Why it is not medium**
1. The `maxlength=14` is old code. The WIP makes it worse only because the server now accepts what it used to refuse.
   - Old checkin.ts took `replace(/\D/g,"")` and required `^[6-9]\d{9}$`. A cut Gulf number such as '+971 50 123 45' (digits 9715012345) was already saved silently as a wrong 10-digit number.
   - Most other cut numbers, for example '+44 7911 12345' (11 digits), were refused with "needs 10 digits". Under the WIP they are saved silently.
2. The trigger is rare. It

## 8. [low] (checkin-winners) cleanPhone is stricter than the digit-stripping it replaced in check-in and prize confirm: a pasted number with invisible direction marks is refused
File: C:/ct/test-sites/tambola/apps/edge/src/phonekit.ts:80
Scenario: The old check-in code (strip to digits) and the old prize code (digitsOf) accepted any text that contained the digits. checkin.ts:106 and winners.ts:85-87 now call cleanPhone, which refuses any character outside digits, whitespace and + - ( ) . /. A number copied from an iPhone contact or from WhatsApp often carries U+202A..U+202E, U+200E/F or U+2066..U+2069 around it (for example '‪+91 98765 43210‬'). \s does not match these, so the server answers 400 'A number has only digits (and + - spaces or brackets). Please check it.' The person cannot see anything wrong in the box. In check-in the error comes after the correct code was typed. The winner is told the same when pressing Confirm. Older pages that were open also hit this.
Fix (reviewer): Remove invisible format characters before the whitelist test: typed = typed.replace(/[\p{Cf} ]/gu, ' ').trim(). That keeps the garbage check for letters and symbols and makes the stricter parser as forgiving as the old routes.
Skeptic's better fix / notes: Fix it once, at the top of `cleanPhone` in phonekit.ts. Strip invisible format characters before the trim, the whitelist test and the `startsWith("+")`/`"00"` check:

`const typed = String(raw ?? "").replace(/\p{Cf}/gu, "").trim();`

`\p{Cf}` covers U+200B-200F, U+202A-202E, U+2060-2064, U+2066-2069 and U+FEFF. Keep the `[^\d\s+\-()./]` test after it, so letters, emoji and other symbols are still refused as typing mistakes. No change is needed in checkin.ts or winners.ts. List uploads, hostsetup and people.ts get the same leniency, since they share the function.

Optional: also apply `.replace(/\p{Cf}/gu, "")` at the top of `keptPhone` and `digitsOf` in worker.ts:1490. Their `/^\s*(\+|00)/` check also misses a leading mark. A pasted `"‪+65 9123 4567"` would then be kept as `916591234567`, not `+6591234567`. That is outside this finding's check-in and prize paths, but it is the same root cause.

Add a regression test: check-in and prize confirm with `"‪+91 98765 43210‬"` return 200 and store `919876543210`, and `"98765abcde"` is still refused.
Skeptic's reasoning: I could not refute this. It is a real regression that the WIP introduces on two live paths, but it is low severity.

1. The old code was lenient. In the 1.2.0 diff, check-in used `b.mobile.replace(/\D/g,"")` and prize confirm used `digitsOf` (`String(raw).replace(/\D/g,"")`). Both ignored any invisible characters. The WIP replaces them with `cleanPhone` at checkin.ts:106 and winners.ts:85-87.

2. `cleanPhone` is the list parser, moved unchanged into phonekit.ts. Line 9 of that file refuses any character outside `\d`, `\s` and `+ - ( ) . /`. The finding cites `phonekit.ts:80`, but the file has 41 lines. The real line is 9. I checked the regex semantics: JS `\s` does not match U+200B-200F, U+202A-202E or U+2066-2069. `String.trim()` does not strip them either. So `"‪+91 98765 43210‬"` returns `ok:false` with "A number has only digits...". Check-in answers 400 `bad-mobile`, and prize confirm answers 400 with the same text.

3. Nothing upstream cleans the value. The WIP's z.js diff does not touch the check-in or prize pages. Check-in sends `x.mobile` raw (z.js 806). Prize confirm sends `CF.phone` raw (z.js 385). The `api()` wrapper does not sanitise bodies, and the worker has no Cf-character stripping on these routes. The join route's `digitsOf` (worker.ts:1489) still strips non-digits, so join accepts such a paste while check-in and prize now refuse it. That is inconsistent behaviour.

4. The scenario is realistic. iOS Contacts and WhatsApp copy are known to wrap numbers in U+20

## 9. [low] (checkin-winners) People CSV export puts a formula-guard apostrophe on every international number, and re-uploading the file turns 10-digit-total ones (Singapore) into Indian numbers
File: C:/ct/test-sites/tambola/apps/edge/src/people.ts:358
Scenario: Lists now keep other countries as '+<code><number>' (keptFromClean). exportPeople writes pii.phone through csvCell (line 186), which prefixes ' to any cell starting with = + - @. The Mobile cell for '+6591234567' becomes "'+6591234567" (a visible apostrophe in Excel and Sheets), while Indian '91...' numbers are untouched. The organizer downloads the list and uploads it into the next game. zc.js cleanPhone (line 592) tests /^\+/ on the raw cell, so the leading apostrophe makes it non-international. The digits '6591234567' match /^[6-9]\d{9}$/, so the Singapore number is sent as +91 6591234567, a different person's number. UK and UAE numbers have 11 or more digits and survive by luck.
Fix (reviewer): Do not apply the formula guard to a cell that matches /^\+\d{8,15}$/ (a phone cannot execute as a formula). Alternatively export international numbers in the 00 form ('006591234567'), which both cleanPhone functions already understand.
Skeptic's better fix / notes: Fix both sides. (a) In exportPeople/csvCell, skip the formula guard for a cell matching /^\+\d{8,15}$/, so a direct download-then-upload keeps the plus. (b) In the importer (the zc.js parseList or vetRows step, owned by another helper), strip a single leading apostrophe from a cell before cleanPhone. That covers a file that went through Excel, where the apostrophe stays literal, and any older file the exporter already guarded. (c) Optionally make cleanPhone refuse a bare 10-digit number that does not start with 6 to 9 or has no plus when the row also carries a country hint. Alternatively, export non-Indian numbers as text-safe "00<code><number>", but note Excel also drops leading zeros unless the cell is quoted as text.
Skeptic's reasoning: Verified by reading the code. WIP-new part: the export is correct as described. addPeople (people.ts:276/291) now seals pii.phone as keptFromClean(...), so a Singapore invitee is stored as "+6591234567". exportPeople (people.ts:358) writes pii.phone through csvCell (people.ts:186, untouched by the WIP), whose /^[=+\-@\t\r]/ guard turns it into "'+6591234567". At 1.2.0 (274bde8) the kept form was bare digits, so the Mobile column never had a leading apostrophe. Now every non-Indian number carries a visible apostrophe, and the "+" form that phonekit.ts introduces so a kept number "never has to be guessed" is defeated at the export boundary. A phone cell matching /^\+\d{8,15}$/ cannot be a formula payload, so the guard adds nothing there. The re-import half of the scenario also holds. zc.js cleanPhone (line 592), run on "'+6591234567", fails the /^\+/ test, strips non-digits to "6591234567", matches /^[6-9]\d{9}$/ and returns "916591234567". vetRows (line 696) does not reject a leading apostrophe, and parseList does not strip it. addPeople then sends "+916591234567", and the server's cleanPhone accepts it as Indian. The same would hit any country whose number is exactly 10 digits and starts with 6 to 9: Singapore, Brunei, Maldives, and New Zealand numbers with an 8-digit local part. UK and UAE numbers have 12 digits and survive. Corrections to the claim: (1) The misrouting is NOT new or worse. At 274bde8 the old cleanPhone stored "6591234567" and exported it bare, and the zc.js 

## 10. [low] (client) Check-in mobile box is capped at 14 characters, so a foreign number typed with spaces loses its last digit and is saved wrong
File: C:\ct\test-sites\tambola\apps\web\public\z.js:783
Scenario: The server's checkin.ts now accepts any country (cleanPhone, 8 to 15 digits). A player taps Edit on the mobile row and types "+44 7911 123456" (15 characters) or "+971 50 123 4567" (16 characters). The input still has maxlength="14", so the last digit(s) are silently dropped: "+44 7911 12345". That is 11 digits, so cleanPhone accepts it as an international number. The participant record is rewritten with the wrong number and flagged as edited (+44791112345 instead of +447911123456). The join form's own placeholder teaches spaced numbers, so this is the natural way to type. For "+91 98765 43210" the cut-off text gives the confusing error "After +91 there must be 10 digits".
Fix (reviewer): Remove the maxlength from #ckmob, or raise it to 24 or more. Better, normalise the box with the same CTPhone.parse used on the join form and send the e164 value.
Skeptic's better fix / notes: Minimal: in z.js line 783 raise or remove the cap, for example `maxlength="30"`. The longest legitimate entry is a "+" plus 15 digits plus separators, about 24 characters. The server already strips separators and enforces 8 to 15 digits, so nothing else is needed for the truncation.

Fuller: give the check-in box the same country select and `CTPhone.parse(cc, typed)` as the join form. Send `body.mobile = p.e164` (as the server comment already assumes), and block Submit with `p.why` when parsing fails. That also fixes the separate case where a foreign number typed without "+" is read as Indian. Update guide.js (line 48, "Type the 10 digits without spaces") to match.
Skeptic's reasoning: The mechanics hold. I could not refute them, but the severity is lower than claimed.

1. Where the cap comes from. `maxlength="14"` on `#ckmob` (z.js:783) is NOT touched by the WIP. At 274bde8 it is the same attribute at old line 726, and `git diff` shows no hunk on that line. So the cap is old.

2. Why it counts as a WIP defect anyway. The WIP changes what the server does with a truncated value.
   - Old `checkin.ts` accepted only `^[6-9]\d{9}$` after stripping a 91 or 0 prefix. Any spaced or dashed `+91` entry cut to 14 characters (for example "+91 98765 4321", which is 11 digits) was rejected with "The mobile number needs 10 digits". It failed loudly.
   - New `checkin.ts` (line ~105) runs the raw box through `cleanPhone`, which accepts any non-91 `+` number of 8 to 15 digits, then stores it with `keptFromClean`. A truncated foreign number is now accepted and saved.
   - The client has no `CTPhone.parse` call in `bindCheckin` or the submit handler. `body.mobile = x.mobile` goes out raw, so nothing on the phone catches the cut-off.

3. Traced inputs through the actual code.
   - "+44 7911 123456" is 15 characters. Typed or pasted into the box, it is cut to "+44 7911 12345", which is 11 digits. `cleanPhone` takes the international branch (starts with "+", does not start with 91), length 11 is within 8 to 15, and it returns ok. `keptFromClean` gives "+44791112345". That differs from `keptPhone(old phone)`, so `phone` is overwritten and `editedMobile` is set. The `UPDATE parti

## 11. [low] (client) International forms "+44 (0)7911 123456" and "(+44) 7911 123456" give a wrong stored number with no error
File: C:\ct\test-sites\tambola\apps\web\public\z.js:100
Scenario: I ran CTPhone.parse from the file. (a) "+44 (0)7911 123456" or "+44 07911 123456" returns +4407911123456. The plus branch (lines 100-105) never removes the trunk 0 that the non-plus branch removes at line 108. "+49 (0)170 1234567" gives +4901701234567. The identity hash uses the last 10 digits and is unchanged, but the contact number the organizer sees, and any wa.me link, is wrong. The "(0)" form is the standard way UK, German, French and Australian numbers are written. (b) "(+44) 7911 123456" starts with "(", so t[0]==="+" is false and it is not read as international. With the list on United Kingdom it returns +44447911123456 (accepted, wrong). With the list on India it gives "An Indian mobile number has 10 digits". The same applies to "+91 098765 43210" and "+91 (0) 98765 43210", which are rejected because the India 12-digit and leading-0 rules only run outside the plus branch. The change handler at line 884 uses a similar plus test.
Fix (reviewer): Detect international input with /^[\s(]*(\+|00)/. After the country code is cut off, drop one leading 0 unless CT_ZERO_STAYS[c.iso]. For India in the plus branch, also drop a leading 0, and drop "91" if it is repeated.
Skeptic's better fix / notes: In CTPhone.parse, compute one flag, const intl = /^[\s(]*(\+|00)/.test(t), and use it for the branch at line 100 and for the match in the change handler at line 884. Keep the extra "(" tolerance in both places. After the country code is cut off in the plus branch, drop a single leading 0 when !CT_ZERO_STAYS[c.iso], the same rule as line 109. For India, apply the same leading-0 and repeated-91 handling as lines 107-108 before the 10-digit check. For example, move that block after the branch so it runs for both plus and non-plus input. As a secondary hardening, the server-side cleanPhone has the same missing trunk-0 handling for "+<code>(0)...". Fix it there too, so old pages and list uploads get the same result.
Skeptic's reasoning: The defect exists in new WIP code, but I rate it low rather than medium.

I traced CTPhone.parse in apps/web/public/z.js (lines 95-119) by hand and did not run it.

**(a) Trunk 0 kept in the plus branch: confirmed.**
- For "+44 (0)7911 123456", the character check at line 98 passes. The digits are "4407911123456", t[0] is "+", and the plus branch (lines 100-105) cuts "44" and leaves d = "07911123456".
- Nothing removes the 0. The non-plus branch does that at line 109, and the India branch at lines 107-108, but neither runs for plus input.
- The length check passes (2 + 11 = 13), so it returns e164 "+4407911123456".
- The client sends this as J.e164 (lines 906 and 216). The server's keptPhone (phonekit.ts line 31) only prefixes "+", so it is stored and shown as "+4407911123456". A wa.me link built from it would also be wrong.
- The identity hash is sha of the last 10 digits, so the "7911123456" tail is the same either way. Only the contact copy is wrong. The player still gets a ticket.
- A normal "type, then tap Get my ticket" flow mostly hides this. Tapping the button blurs the box first, which fires the change handler at line 884. That handler matches /^\s*(\+|00)/, parses fine, and rewrites the box to "07911123456" with the list set to United Kingdom. The click handler then re-parses that and strips the 0 at line 109, giving the correct "+447911123456".
- The bug stays live on the Enter / Go key path. The keydown handler at line 885 calls preventDefault and then go.click() 

## 12. [low] (client) Busy auto-retry: a request still in flight when the person presses "Stop and try myself" flips the page back to busy and can join with the old number
File: C:\ct\test-sites\tambola\apps\web\public\z.js:229
Scenario: The page is on the busy card and the retry timer fires, so doJoin() is awaiting rt.join. Under load that wait is seconds, up to the 20 s limit. The person presses "Stop and try myself" (line 880): the mode becomes "", busyTries becomes 0, and the form is drawn. The pending request then answers code "busy". Line 229 sees code==='busy' and busyTries(0) < 15, so it sets J.mode='busy', arms a new timer and calls paint(). If nothing in ph/nm/emp is focused, the form is replaced by the busy card again. If the person is typing, the guard at line 833 only tests the first of ph/nm/emp, so a focused name or ID box does not stop the redraw and its text is wiped. If #ph is focused, the redraw is skipped but the mode stays 'busy', so the timer later calls doJoin() on its own with the stale J.phone/J.e164 from the earlier click, not what is now typed. If that join succeeds, the person gets a ticket under the number they were trying to correct. If they press Get my ticket with the corrected number first, they can get a second request and a device-used 409.
Fix (reviewer): Add a counter J.gen that go.onclick and again.onclick increment. In doJoin, capture it before the await and, after it, ignore any failure result when the counter has changed. Also make the paint guard test every input including #cc.
Skeptic's better fix / notes: 1. Add a join generation. J.gen is incremented in go.onclick and in the again.onclick Stop handler. doJoin captures it before `await rt.join` and, after the await, returns without touching J.mode, rt.error, timers or paint if it has changed. A late success should still be accepted, since a ticket is real; ignore only the failure branches.

2. Make the busy state depend on the busy card actually being drawn. After the busy branch calls paint(), arm the retry only if document.getElementById('again') exists and document.getElementById('go') does not. Otherwise reset to J.mode = "" and J.busyTries = 0, so a form that is on screen never sits in a hidden 'busy' state with a silent timer.

3. Make the retry timer's callback re-check that same DOM condition before calling doJoin().

4. Change the paint guard at z.js:833 to test every input (#ph, #nm, #emp and #cc), for example `document.activeElement && /^(ph|nm|emp|cc)$/.test(document.activeElement.id)`, instead of comparing against the first box found.

5. Optionally, in go.onclick, re-enable the button and reset its label when the redraw is skipped, so the person is not left with a disabled "Getting your ticket…".
Skeptic's reasoning: I read z.js and the diff against 274bde8, plus rt.join (packages/beacon/src/phone-runtime.ts:291) and joinOverLimit/spend in the worker. I could not refute the mechanism. The busy retry is entirely new in the WIP, and it has no way to discard a result that arrives after the person pressed "Stop and try myself". I rate it low, not medium.

What I confirmed in the code:
- The timer at z.js:229 calls doJoin() while J.mode is still 'busy', so the busy card with its Stop button stays on screen during the request. Nothing disables the button, and rt.join and api have no single-flight or cancellation. rawApi only gives up after 20 s.
- The Stop handler (z.js:880) clears J.timer and J.retry, sets busyTries 0 and J.mode "", then repaints the form. It cannot cancel the request that is already in flight.
- The stale answer is code 'busy' (worker.ts:1675/1696/1697 return code "busy"). doJoin then passes the test busyTries(0) < 15 and sets mode 'busy' again with a new timer.
- That busy answer is handled by paint(). The guard at z.js:833 checks only the first existing box among #ph, #nm and #emp. #ph is now always present, because the WIP draws phone() in every verify mode. This gives three outcomes:
  1. No box is focused: the form is replaced by the busy card, showing "Try 1 of 15" again. This is the likeliest outcome and is harmless.
  2. #nm or #emp is focused: the guard compares against #ph, so the redraw goes ahead and wipes what is being typed.
  3. #ph is focused: the redraw is sk

## 13. [low] (client) Pasted numbers with invisible marks, typographic dashes or non-ASCII digits are refused as "digits only" (older page and server join route accepted them)
File: C:\ct\test-sites\tambola\apps\web\public\z.js:98
Scenario: /[^\d\s+\-()./]/ rejects U+202A/U+202C (added around a number copied from iPhone Contacts or WhatsApp), U+200E/U+200F/U+200B, en or non-breaking hyphens (U+2010-U+2015, U+2212) and Arabic-Indic or full-width digits. Confirmed by running parse: "‪+91 98765 43210‬" and "‎98765 43210" both return "A mobile number has digits only. Spaces, + and - are fine." although the box looks right. The older page sent the raw text and the server's digitsOf strips every non-digit, so these used to join. Even if the check passed, a leading mark would hide the "+" from t[0]==="+".
Fix (reviewer): Before any check, remove [​-‏‪-‮⁠-⁤⁦-⁩﻿], map [‐-―−] to "-", and convert \p{Nd} digits to ASCII.
Skeptic's better fix / notes: Normalise inside CTPhone.parse before any test (z.js line 96): `const t = String(typed == null ? "" : typed).replace(/[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "").replace(/[‐-―−]/g, "-").trim();`. This keeps the old server-side tolerance, makes `t[0]==="+"` and the `00` check work, and leaves the digits-only check for real letters and symbols. The value sent is `J.e164`, built from digits, so the marks never reach the server. Make the change handler on line 884 use the same cleaning, or have parse return a `hadPlus` flag so it does not re-test the raw box value. Converting Arabic-Indic or full-width digits is optional, since the old flow never supported them. Add a test for "‪+91 98765 43210‬", "‎98765 43210" and "98765‑43210".
Skeptic's reasoning: Confirmed as a small WIP regression, but only for part of what the finding lists.

WHAT THE CODE DOES. Line 98 of apps/web/public/z.js (`/[^\d\s+\-()./]/.test(t)`) rejects any character outside ASCII digits, JS `\s`, + - ( ) . /. JS `\s` does not include U+202A-202E, U+200B-200F or U+2060-2064. It also excludes the typographic dashes U+2010-2015 and U+2212. `String.trim()` does not strip U+202A/U+200E either. So "‪+91 98765 43210‬" and "‎98765 43210" are refused with "A mobile number has digits only. Spaces, + and - are fine." This follows from reading the code, and the reviewer's run agrees. NBSP U+00A0 and U+202F are in `\s`, so those pass.

THE OLD BEHAVIOUR WAS MORE LENIENT. At 274bde8 `go.onclick` did no check on the phone box. `doJoin` called `rt.join(J.phone, ...)`, and `phone-runtime.ts` line 293 posts the raw text. The old server's `digitsOf` was `String(raw).replace(/\D/g,"")` with a 10-15 digit length check. JS `\D` is non-[0-9], so invisible marks and typographic dashes were silently dropped, and "‪+91 98765 43210‬" joined fine. The new client check is stricter than the server, which still strips them. After the failed press, `paint()` rebuilds the form with the same pasted text still in the box (`pv = esc(J.phone)`). The box looks right, the message says "digits only", and pressing again gives the same refusal until the person clears the box and retypes.

REAL-WORLD TRIGGERS. These are plausible, not contrived. Copying a number from the iOS Contacts app or a What

## 14. [low] (client) Trunk-prefix handling for national typing: US "1 555..." and Benin-style numbers
File: C:\ct\test-sites\tambola\apps\web\public\z.js:90
Scenario: Without a plus, a US or Canada player who types "1 555 123 4567" gets +115551234567 (no error; the length rule allows it). The same happens when the list is United Kingdom and "44 7911 123456" is typed: +44447911123456. Separately, CT_ZERO_STAYS holds only Cote d'Ivoire, but Benin moved to 10-digit numbers beginning 01 in late 2024, and Republic of the Congo and Gabon numbers also begin with 0. I did not verify these three against a numbering plan. For them, the stripping of the leading 0 at line 108 corrupts a real number: Benin "01 97 12 34 56" becomes +229197123456. Contact data is wrong while the hash still matches or differs by accident.
Fix (reviewer): For dial code 1, require exactly 10 digits and drop one leading 1. Check the countries whose domestic numbers keep the 0, and add them to CT_ZERO_STAYS. Optionally refuse a national part that starts with the country's own dial code and would exceed the usual length.
Skeptic's better fix / notes: 1) In CTPhone.parse (z.js ~line 109), add BJ to CT_ZERO_STAYS now (confirmed: +229 01 XXXXXXXX). Add CG only after checking ITU or the national regulator; the evidence found was contradictory. Do not add GA. 2) For dial "1" (NANP), drop one leading "1" when the typed national part is 11 digits starting with 1, in the same else-if chain next to the India "91"/"0" handling. NANP area codes never start with 0 or 1, so this is safe. 3) Do not add a generic 'national part starts with own dial code' rule (breaks KZ/RU, and there is no per-country length data). Optionally show the normalized number back to the player before sending (CTPhone.show) so the 'UK 44...' double-code case is visible to them.
Skeptic's reasoning: Partly real, and low severity. Only the Benin part is a firm defect. The US part is a minor data-quality bug, and the UK part is a design limit rather than a bug.

I read the current z.js (CTPhone.parse at lines 92-120, the join handler at 886-910), phonekit.ts and the worker.ts join diff. All of this is new WIP code. Before the WIP there was no country picker and no stripping.

**What the client sends.** The join handler sets J.e164 = "+" + c.dial + d (line 106 of the file text, shown at line 906) and sends it as the phone. The server's digitsOf accepts it. keptPhone stores it as "+<code><number>" unchanged. The identity hash is sha(salt | last 10 digits).

**1. US "1 555 123 4567" (list: United States, no plus): confirmed, but cosmetic.**
- parse() does not strip a leading 1, and 1 + 11 digits is within 8-15. The stored contact becomes +115551234567.
- The identity hash is unaffected. The last 10 digits are 5551234567, the same as for +15551234567, so there is no duplicate join and no list mismatch.
- Only the stored contact is wrong. It feeds the wa.me link and the organizer reports. A winner is also asked to check and correct the pre-filled number in the prize confirmation (z.js 355-372), which softens it.
- The fix is easy and safe. NANP area codes never begin with 0 or 1, so for dial "1" a leading 1 on an 11-digit national part can be dropped. The WIP already does the equivalent for India ("91..." and "0...").

**2. UK "44 7911 123456" (list: United Kingdom, no plus): n

## 15. [low] (compat-tests) param-people.test.ts guest-invite test sends no device and now gets 403
File: C:\ct\test-sites\tambola\apps\edge\test\param-people.test.ts:?
Scenario: Line 155 `mine` posts /people?me=${a.pid} with no device. callerOf now needs deviceMatches, so it answers 403 code device and line 156 `.added` is undefined instead of 2 (test fails). Lines 161, 167 and 172 still pass but for the wrong reason: they expect 403 for a level-2 guest, invitations off, and a fake ticket, and now get it from the missing device, so they no longer test those rules.
Fix (reviewer): Line 155: `?me=${a.pid}&device=${dev(1)}`; line 161: `?me=${b.pid}&device=${dev(2)}`; line 167: `?me=${a.pid}&device=${dev(1)}` (dev is already imported).
Skeptic's better fix / notes: Add the device to the three guest-invite calls: line 155 `?me=${a.pid}&device=${dev(1)}`, line 161 `?me=${b.pid}&device=${dev(2)}`, line 167 `?me=${a.pid}&device=${dev(1)}`. Leave line 172 (the made-up ticket) as it is. For regression value, add one test in this file that a real guest with no device gets 403 and code "device", and that the same guest with the right device and a wrong one gets 200 and 403 respectively. People.test.ts already covers the wrong-device case, so this only needs to be a single line here.
Skeptic's reasoning: Confirmed by reading the code; this is a test-only defect (no production behaviour is wrong), with one detail in the claim that is wrong.

What the WIP changed: `callerOf` in `apps/edge/src/people.ts` (line 133, new since 274bde8) now calls `deviceMatches(...)` for a guest. The device comes from the `x-ct-dev` header, the `device` query parameter or `body.device`. `deviceMatches` (`checkin.ts:22-26`) returns false for an empty or missing device, and also false when the seat has no stored device hash. In that case the route answers 403 with code "device".

Why the test breaks:
- `apps/edge/test/param-people.test.ts` is NOT touched by the WIP (empty diff against 274bde8).
- Its helper `join` (`param-harness.ts:95`) sends `device: dev(i)`, and `worker.ts:1612` stores the hash of it on the seat.
- The guest-invite calls at lines 155, 161, 167 and 172 use `/people?me=<pid>` with `{}` headers and a body without `device`. The test helper `withDevice` (`device.ts:5-8`) only injects a device for paths ending in `/join`, so nothing adds one here. `with-terms.ts` only adds consent.
- The same WIP did update the sibling `people.test.ts` for exactly this change (`q = (pid, d) => ?me=..&device=${dev(d)}`, plus new "device" assertions). It missed this file.

Per-line effect:
- Line 155 (`mine`): returns 403 {code:"device"}, so line 156 `.added` is undefined and `toBe(2)` fails. The test is red.
- Line 161 (`bTry`, a guest-invited-by-a-guest seat): expects 403 and gets it from the device che

## 16. [low] (compat-tests) phone-guest.test.ts pins the phone sent as typed
File: C:\ct\test-sites\tambola\apps\web\test\phone-guest.test.ts:?
Scenario: z.js:216 now calls rt.join(J.e164 || J.phone). Line 110 expects the second join body phone to be "9822211111"; the page now sends "+919822211111". Line 131 expects a join after a reload with c.b.phone === "9822266666"; the saved waiting note now carries e164, so the body is "+919822266666". Both fail (the handover already lists them).
Fix (reviewer): Line 110: toBe("+919822211111"); line 131: c.b.phone === "+919822266666".
Skeptic's better fix / notes: Update the two expectations as proposed. Line 110: `expect(again.b.phone).toBe("+919822211111")`. Line 131: `c.b.phone === "+919822266666"`. Also add a small test that the page still accepts a waiting note saved by an older page. Such a note has no `e164`, so `doJoin` falls back to the bare `J.phone`, and the server must still admit it. That covers the backward-compatibility rule that the two edits alone do not cover.
Skeptic's reasoning: The finding is factually accurate, but it is a stale test, not a runtime defect, so low is the right severity and not medium.

Trace of the two failures in the WIP code:
- z.js:906 (the #go click handler) runs `CTPhone.parse(J.cc, J.phone)` on the typed number. For the default India country and "9822211111" this is ok, so `J.e164 = "+919822211111"`.
- z.js:216 (`doJoin`) then calls `rt.join(J.e164 || J.phone, ...)`.
- `rt.join` in packages/beacon/src/phone-runtime.ts:293 puts `phone` into the POST body unchanged. The body phone is therefore "+919822211111".
- apps/web/test/phone-guest.test.ts:110 still expects `again.b.phone` to be "9822211111", so it fails.
- Line 131 also fails. `saveWait` (z.js:192) stores `e164`, and `restoreWait` (z.js:198) reloads it. After the reload, `doJoin` sends "+919822266666", but the test checks `c.b.phone === "9822266666"`.
- `git diff 274bde8 -- apps/web/test/phone-guest.test.ts` is empty. The test file was not touched by the WIP, so it still pins the 1.2.0 wire format.

Why it is only low:
- Server compatibility is not broken. `digitsOf` at worker.ts:1489-1492 accepts a leading "+", and the identity hash uses the last 10 digits (worker.ts:1496). "+919822211111" and "9822211111" give the same hash.
- Older pages and the load-test phones that send bare 10-digit numbers are still accepted by the server. Field names, status codes and code strings are unchanged.
- Only the value format sent by the new page changed, and that is deliberate.
- The ha

## 17. [low] (compat-tests) idiotproof-player-pages.test.ts pins the old waiting-card text
File: C:\ct\test-sites\tambola\apps\web\test\idiotproof-player-pages.test.ts:?
Scenario: Line 63 expects /You asked with 9822233330/. The waiting card now prints shownPhone(), i.e. "You asked with +91 98222 33330" (z.js:156), so the regex fails. Line 66 (#ph keeps "9822233330") still passes.
Fix (reviewer): Line 63: /You asked with \+91 98222 33330/.
Skeptic's better fix / notes: In apps/web/test/idiotproof-player-pages.test.ts line 63, change the first expectation to /You asked with \+91 98222 33330/. Leave the "Wrong number or ID? Type it again" check and line 66 as they are. Optionally add a test for a non-Indian country, for example a Singapore number shown as "+65 91234567", so the new display format is pinned in both directions.
Skeptic's reasoning: Confirmed by reading the code, with one correction to severity. In 1.2.0 (274bde8, z.js line 100) the waiting card printed the raw typed text: `You asked with <b>${esc([J.emp, J.phone].filter(Boolean).join(" / "))}</b>`. The WIP (commit c4ba645, z.js:156) changed it to use shownPhone(), defined at z.js:129 as `CTPhone.parse(J.cc, J.phone)` followed by `CTPhone.show(p)`. CTPhone.show (z.js:121) returns "+" + cc + " " and, for India, the number split as 5 digits, a space, 5 digits.

Trace of the test at apps/web/test/idiotproof-player-pages.test.ts:59-70:
1. typeJoin sets #ph to "9822233330" and clicks #go.
2. The #go handler (z.js:893) stores J.phone = "9822233330" unchanged. J.cc is "IN" because the ctz-cc store key is empty and CT_BY_ISO falls back to India (z.js:128).
3. The number is not on the list, so the server answers waiting and the card renders (z.js:156). J.emp is empty, so the filter leaves only the phone, and shownPhone() returns "+91 98222 33330".
4. The harness text() (harness.ts:66) is the #app textContent with whitespace collapsed, so it reads "...You asked with +91 98222 33330. Is that wrong?".
5. Line 63's /You asked with 9822233330/ therefore does not match, and the test fails at that assertion.

The reviewer is also right that line 66 still passes. The form's value is `pv = esc(J.phone)` (z.js:142), which is the raw typed text "9822233330".

The test file is untouched since 1.2.0: `git diff 274bde8` on it is empty, and it is not in the working-tree modifie

## 18. [low] (compat-tests) pages.test.ts prize-confirm test expects a 10-digit stored phone
File: C:\ct\test-sites\tambola\apps\web\test\pages.test.ts:?
Scenario: Line 638 types "98765 43210" into #cfph; confirmPrize now stores keptFromClean = "919876543210", so /prizes returns that and line 642 `toMatchObject({ ..., phone: "9876543210" })` fails. The handover did not list this one.
Fix (reviewer): Line 642: phone: "919876543210".
Skeptic's better fix / notes: Change the expectation at pages.test.ts:642 to the kept form: `phone: "919876543210"`. Also add a short comment noting that India is kept as 91 + 10 digits. Optionally add a second case that confirms a foreign number such as "+65 91234567" and expects "+6591234567". That would also cover the new "any country" behaviour of confirmPrize, which currently has no test through this path.
Skeptic's reasoning: Confirmed by reading the code. The test is stale, and the server behaviour is the intended new behaviour, not a regression.

Path of the failing test:
- apps/web/test/pages.test.ts:638 types "98765 43210" into #cfph and presses Confirm.
- z.js (bindConfirm, around line 385) posts that raw string as `phone` to POST /api/z/:id/confirm. It does not add a country prefix.
- worker.ts:1964 passes the body to confirmPrize.
- winners.ts:85 runs `cleanPhone("98765 43210")`. That gives d="9876543210", length 10, and passes the India check, so it returns digits "919876543210".
- winners.ts:90 sets `phone = keptFromClean("919876543210")`. That is 12 digits starting with 91, so it comes back unchanged as "919876543210".
- That value is sealed through sealPii and opened again unchanged by openPii (pii.ts:41-45).
- listPrizes (winners.ts:123) returns `phone: cur?.phone`, so GET /prizes returns "919876543210".

pages.test.ts:642 still has `toMatchObject({ name: "Asha Rao", phone: "9876543210", ... })`. toMatchObject compares strings exactly, so the assertion fails. `git diff 274bde8` shows this line was not touched. On release 1.2.0, `digitsOf` kept only the last 10 digits, which is why the old expectation passed.

The handover doc (docs/HANDOVER_2026-10-26_JOIN_REDESIGN.md, line 61) lists only phone-guest.test.ts and idiotproof-player-pages.test.ts as known failing. It also says "Nothing else was run since". So this failure is unlisted, as the reviewer said.

Severity:
- This is not a produ

## 19. [low] (compat-tests) worker.test.ts edit commented out the confirmed assertion
File: C:\ct\test-sites\tambola\apps\edge\test\worker.test.ts:?
Scenario: Line 176 now reads `expect(mine.phone).toBe("91" + phone(2)); // kept with its country code: 91 + 10 digits for India; expect(mine.confirmed).toBe(false);`. The new comment swallowed `expect(mine.confirmed).toBe(false)`, so a regression that reports an unconfirmed prize as confirmed would pass.
Fix (reviewer): Put the comment at the end of the line or on its own line: `expect(mine.phone).toBe("91" + phone(2)); expect(mine.confirmed).toBe(false); // kept with its country code`.
Skeptic's better fix / notes: Keep the assertion and move the comment after it: `expect(mine.prizes).toHaveLength(1); expect(mine.phone).toBe("91" + phone(2)); expect(mine.confirmed).toBe(false); // phone kept with its country code: 91 + 10 digits for India`. Alternatively, put the comment on its own line above the expects. Do not leave a `//` comment in the middle of a line with several statements.
Skeptic's reasoning: Confirmed by reading the code. In the last release (274bde8), apps/edge/test/worker.test.ts line 176 was `expect(mine.prizes).toHaveLength(1); expect(mine.phone).toBe(phone(2)); expect(mine.confirmed).toBe(false);`. In the WIP (commit c4ba645, no later working-tree change to this file) the same line is `expect(mine.prizes).toHaveLength(1); expect(mine.phone).toBe("91" + phone(2)); // kept with its country code: 91 + 10 digits for India; expect(mine.confirmed).toBe(false);`. The `//` comment was inserted before the final statement, so `expect(mine.confirmed).toBe(false);` is now inside the comment and never runs. It is no longer an assertion. This is an accidental edit made by the WIP, not pre-existing behaviour.

The lost check is not covered elsewhere. A grep for `myprizes` across apps/edge/test, apps/web/test and tools finds only this one test. The `confirmed` flag returned by GET /api/z/:id/myprizes (winners.ts line 110: `confirmed: rows.some(r => r.confirmed_ms)`) is asserted nowhere else. The later `confirmed: true` check on the organizer's /prizes list is a different route and a different field. The WIP also edited winners.ts, so a regression in this flag would now pass the suite. That is the scenario the finding describes.

Severity is lower than the claimed medium. It is test-only, with no runtime or user impact, and the production code is unchanged by this. It is a real silent loss of the only coverage of the `confirmed` flag on myprizes, so it should be fixed, but i

## 20. [low] (compat-tests) Check-in mobile box is capped at 14 characters and has no country, so a truncated foreign number is accepted and saved
File: C:\ct\test-sites\tambola\apps\web\public\z.js:?
Scenario: Line 783 `<input id="ckmob" ... maxlength="14">` was not changed. A UK participant (stored +447911123456) presses Edit and types "+44 7911 123457" (15 characters): the browser cuts it to "+44 7911 12345". checkin.ts:105-106 now runs cleanPhone: it starts with +, is not 91, 11 digits is within 8-15, so it is accepted and saved as "+44791112345" (editedMobile true). Before the change the cut number failed the Indian 10-digit rule. Same for "+1 415 555 2671" (15 characters). Also the box has no country list, so a foreign number typed without + (07911 123457) is read as Indian and saved as 917911123457.
Fix (reviewer): Remove or raise the maxlength to about 22 in z.js:783, and either add the country list to the check-in card or tell the server to read a bare number in the country of the stored phone; add a hint to type + and the code for numbers outside India.
Skeptic's better fix / notes: 1. In `z.js:783`, remove `maxlength="14"` or raise it to about 24, so a spaced or dashed foreign number is not cut.
2. Preferably give the check-in mobile box the same country list as the join page. Reuse `CTPhone.parse(iso, typed)` and `ccOptions`, send `p.e164`, and block Submit with the `why` text if parsing fails. Show the parsed `+cc number` back to the user before they tick "This mobile number is correct".
3. On the server, make a bare number at check-in (no `+` or `00`) read in the country of the stored phone when that phone is foreign, instead of always as Indian. Old pages only ever had Indian stored numbers, so this does not break backward compatibility.
4. Fix the misleading comment at `checkin.ts:105`.
5. Add a test that a foreign number longer than 14 characters survives the check-in round trip.
Skeptic's reasoning: I could not refute it. The check-in page was not touched by the WIP, but the server it posts to was loosened.

What I verified in the code:
- `apps/web/public/z.js:783` still has `<input id="ckmob" ... maxlength="14">` and no country list. `z.diff` has no change to `ckmob` or to the check-in view. The only check-in hunk is the `ckTime` time-zone change.
- The check-in submit at `z.js:806` sends the raw typed text (`body.mobile = x.mobile`, only when Edit was pressed). It does not build `+<code><number>`.
- `apps/edge/src/checkin.ts:105` has the comment "the page sends +<country code><number>". That is false for check-in, so the server was loosened for a client change that was never made.
- `checkin.ts:106` runs `cleanPhone(rawMob)`, then `keptFromClean`, then saves it and sets `editedMobile`.

Trace of the truncation case:
1. A UK participant is stored as `+447911123456`. The page shows `******3456`.
2. Pressing Edit clears the box (`z.js:798` clears it because the value contains `*`).
3. The user types `+44 7911 123456` (15 characters). The browser cuts it to `+44 7911 12345` (14 characters, 11 digits).
4. In `phonekit.ts:12-13`, `cleanPhone` sees a leading `+` and a number that does not start with 91, so it is treated as international. 11 digits is inside 8-15, so it returns ok with digits `44791112345`.
5. `keptFromClean` gives `+44791112345`. That differs from `keptPhone("+447911123456")`, so it is saved and `editedMobile` is true.
6. Nothing complains, because the server

## 21. [low] (compat-tests) Older open pages lose guest invites silently (403 device) and autoupdate will not reload a running game
File: C:\ct\test-sites\tambola\apps\edge\src\people.ts:?
Scenario: Line 133: every guest call without `device` now answers 403 code device. A phone that loaded the previous z.js and is in a running game (autoupdate.js inRunningGame() never reloads it) calls GET /people?me=<pid> without device; the unchanged handler at z.js:551 treats any 403 as 'not allowed' and sets ME.canInvite=false, so the My invites card vanishes with no message; adding or removing an invitee shows the misleading 'Open this ticket on the phone you joined with'. This is a status change for an old client, against the stated compatibility rule.
Fix (reviewer): Add a grace like CHECKIN_FROM_MS: require the device proof only for games created at or after the release moment (or accept a missing device when the seat's game started before it), and remove the grace later.
Skeptic's better fix / notes: Keep the device gate for all games, with no grace. Two cheap mitigations:
1. In callerOf (people.ts:133), keep the same 403 and code "device", but when no device value was supplied at all (header, query and body all empty), use wording that fits a stale page, for example "This page is out of date. Reload it to invite people." That only changes the message text and does not weaken the check.
2. Add a line to the release notes and deploy checklist: deploy between games, or ask invite-enabled guests in a running game to reload. If the owner really wants a grace for live games, record it as an explicit, time-limited security exception instead of hiding it in code.
Skeptic's reasoning: The mechanics are accurate, but the severity is overstated. The proposed fix would be wrong, because it reopens a leak the WIP deliberately closes.

What I verified in the code:
- apps/edge/src/people.ts:133 (callerOf, commit c4ba645) calls deviceMatches with no grace. Header, query and body device are all empty for an old page, so the call returns false. The server answers 403 with code "device" before any other check. deviceMatches is in checkin.ts:22.
- The previous z.js (274bde8) sends only `?me=<pid>`. Its miQ is at line 485, and I found no x-ct-dev header or `device` anywhere in its people calls. So an old open page does get a 403 on GET /people and on the POST/remove/resend calls.
- The old handler (z.js 274bde8, line 494) sets ME.canInvite=false on any 403. The "My invites" card vanishes silently. Add and remove go through act() (line 520), which shows the server text "Open this ticket on the phone you joined with to invite people." That text is misleading, because the person is on the right phone but on a stale page. The card also flickers: pollMe (every 90-120 s) sets canInvite=true again from the unchanged /me route, and the next loadMine gets 403 again.
- The new z.js sends device (miQ now has `&device=`), so the break is limited to stale pages.

Why it is only low:
- This is a deliberate, documented, tested change, not an oversight. The handover says it closes the blocker "anyone can read a guest's invitees using a public ticket id".
- people.test.ts asserts that

## 22. [low] (compat-tests) apps/web/public/reportgen.js was not rebuilt, so browser-made PDFs print the new numbers raw
File: C:\ct\test-sites\tambola\apps\web\public\reportgen.js:?
Scenario: report-layout.ts mob() was changed, but the committed bundle used by report.html still has `I=(q)=>q?q.replace(/^(\d{5})(\d{5})$/,"$1 $2"):"-"` (line 23). A guest who joined with 9000000003 is now stored as 919000000003 and the report downloaded in the browser shows "919000000003" while the server layout (and privacy.test.ts:209, :231) shows "90000 00003". No test loads reportgen.js, and pages/build.mjs only copies it (build:report is not run by the deploy script).
Fix (reviewer): Run `bun run build:report` and commit apps/web/public/reportgen.js; consider a test that rebuilds into memory and compares, or that runs the bundle on a 91-prefixed and a +65 number.
Skeptic's better fix / notes: Run `bun run build:report` and commit `apps/web/public/reportgen.js`. Add `build:report` to the release checklist in the handover (section 8, step 6) next to the control.js and zgame.js rebuilds. To stop this recurring, add a test that loads the committed bundle, for example in a vm or happy-dom with `globalThis`, and checks that `RPT.layoutReport` output contains "98765 43210" for a stored "919876543210" and "+6591234567" for a Singapore number. Alternatively, rebuild `apps/edge/src/report-browser.ts` in memory with `Bun.build` and compare it with the committed file. `privacy.test.ts` `buildReport` could call the bundle instead of the source layout.
Skeptic's reasoning: I could not refute the finding. I did not edit, build or run anything, and I read the actual files and git history.

1. The bundle is stale. `git diff 274bde8 --stat` lists `report-layout.ts` (+5/-1) but not `apps/web/public/reportgen.js`. The working-tree copy equals HEAD except for CRLF checkout differences, and HEAD equals 274bde8. The committed bundle still has `I=(q)=>q?q.replace(/^(\d{5})(\d{5})$/,"$1 $2"):"-"` (one match, about char 6469), applied to every phone column (people table, winners table, the who-invited-whom tree).

2. The bundle is the only production path for report PDFs. `report.html` loads `/reportgen.js`. `report.js` calls `RPT.layoutReport` and `RPT.layoutPeoplePart` on this device. `lifecycle.ts` imports `layoutReport` but never calls it. `/api/report` returns `phone: o?.phone` unmodified, so nothing else formats the number.

3. Nothing rebuilds the bundle, and no test catches a stale one.
   - `package.json` has `build:report`, but `pages/build.mjs` only copies and minifies files.
   - `C:\ct\test-sites\tools\deploy_tambola_live.ps1` runs only `bun run pages/build.mjs` and then `wrangler pages deploy`.
   - `docs/dev/12-CHANGE-GUIDE.md` item 5 says bundles are committed build outputs, rebuilt by hand, and that a stale bundle means the shipped code disagrees with the tested source.
   - The tests that mention `reportgen.js` (`ai-mail`, `data-map`, `gtm-site`) only list it as a file name.
   - `privacy.test.ts` `buildReport` (lines 183-193) imports `la

## 23. [low] (compat-tests) People CSV export writes foreign numbers as '+65... (apostrophe shown in the cell)
File: C:\ct\test-sites\tambola\apps\edge\src\people.ts:?
Scenario: Line 358 exports `pii?.phone`. Kept foreign numbers now start with + (e.g. +6591234567), csvCell (line 186) prefixes any cell starting with = + - @ with an apostrophe, so the Mobile column holds '+6591234567; a spreadsheet shows the apostrophe, and importing the file back through the list uploader sees a stray character. Indian numbers (91...) are unaffected.
Fix (reviewer): Export the digits (phoneDigits(pii.phone)) or format it as a text cell that csvCell does not prefix; add a CSV test with a +65 number.
Skeptic's better fix / notes: The proposed fix (export `phoneDigits(pii.phone)`) is not safe. It drops the country: `+6591234567` becomes `6591234567`, which `cleanPhone` on re-import reads as a 10-digit Indian mobile starting with 6 and stores as `916591234567`.

Better fix: in `exportPeople` (people.ts line 358), write the phone cell without the apostrophe when it is strictly `/^\+\d{8,15}$/`, and keep `csvCell` for every other cell. A plus followed only by digits cannot carry a formula payload, and `cleanPhone` re-reads `+65...` correctly as international. For example, give the Mobile cell its own helper: `const phoneCell = (p: string) => (/^\+\d{8,15}$/.test(p) ? p : csvCell(p));`.

Add an edge test that adds a `+65` guest (list upload and common-link join) and asserts the CSV line contains `,+6591234567,` and not `'+65`. Optionally add a round trip: re-upload that cell and expect it to be accepted as Singapore.
Skeptic's reasoning: Confirmed by reading the code. Lines 186 (csvCell) and 358 (the Mobile cell, `pii?.phone ?? ""`) in apps/edge/src/people.ts are unchanged by the WIP, so the bug comes from what the WIP now stores.

1. Before the WIP, a non-Indian number was stored as bare digits. In 274bde8, worker.ts line 1489 `digitsOf` returned `\D`-stripped digits, and `cleanPhone().digits` for `+65...` was bare digits. The export therefore never saw a leading `+` in the Mobile column.
2. After the WIP, a non-Indian number is stored in the kept form `+<code><number>`. The paths are: people.ts line 98 and line 89 (`keptFromClean`) for list uploads, worker.ts line 1591 (`keptPhone`) for a person joining through a common link, and people.ts lines 106 and 111 for resend. For a common-link join, `addSeat` (worker.ts line 1508) copies the same sealed pii into the person row, which is what `exportPeople` reads.
3. `exportPeople` (line 358) passes `pii.phone` through `csvCell`. Line 186 prefixes `'` to any cell matching `^[=+\-@\t\r]`, so a Singapore guest is written as `'+6591234567`. A spreadsheet opening the CSV shows the apostrophe, because it is part of the CSV text and not an Excel text marker.
4. The stray character does more than look odd on re-import. The export header is `Name,Mobile,...`, which `parseList` in zc.js (line 1645 and following) maps to the phone column. Server `cleanPhone` (phonekit.ts line 9) rejects any character outside `[\d\s+\-()./]`, and `'` is outside that set. The row therefore com

## 24. [low] (compat-tests) Prize confirmation now refuses an unchanged number the join accepted
File: C:\ct\test-sites\tambola\apps\edge\src\winners.ts:?
Scenario: Lines 85-87: the winner card sends back the prefilled stored number. A player who joined with 5123456789 (the join route still only checks length, worker.ts digitsOf) or any legacy number that fails cleanPhone's 6-9 rule wins, presses Confirm without editing, and gets 400 'An Indian mobile number starts with 6, 7, 8 or 9.' Before, any 10-15 digits were accepted.
Fix (reviewer): Before cleanPhone, if keptPhone(b.phone) equals keptPhone(cur.phone) treat it as unchanged and skip the shape check (only validate a changed number).
Skeptic's better fix / notes: Treat an unchanged number as unchanged and validate only a changed one. In winners.ts confirmPrize, before the `typed.ok` check, compute `const same = typed !== null && !!cur?.phone && keptPhone(b.phone) === keptPhone(cur.phone)`. If `same`, skip the shape error and set `phone = keptPhone(cur.phone)`, or keep `cur.phone` as stored. Run `cleanPhone` and return its error only when the number differs from what is on file. As an alternative, make the confirm check as lenient as the join (10 to 15 digits, or 8 and up with a +/00 prefix) and keep the strict 6-9 rule on the client only. Add a test with a stored "915123456789" and a stored legacy "4155551234" that are sent back unchanged and must return ok.
Skeptic's reasoning: Confirmed by reading the code, but only for numbers the new join page itself will not produce.

How it fails:
- The winner card prefills the stored number and sends it back unchanged. `myPrizes` (winners.ts ~line 110) returns `cur.phone` as stored. z.js (loadCf at ~line 363, bindConfirm at ~line 385) puts it in `CF.phone` and posts it as `phone`.
- `confirmPrize` (winners.ts lines 85-87) now runs `cleanPhone(b.phone)` on that value and returns 400 whenever `!typed.ok`.
- `cleanPhone` (phonekit.ts lines 16-19) rejects a 10-digit or 91+10-digit number whose first digit is not 6-9 ("An Indian mobile number starts with 6, 7, 8 or 9."). It also rejects numbers starting with 91 that are not exactly 12 digits.

The server join accepts such numbers by length only:
- worker.ts lines 1489-1492 (`digitsOf`) accepts 10 to 15 digits, or 8 and up when typed with +/00, and never checks the first digit.
- worker.ts line 1591 stores `keptPhone(b.phone)`. "5123456789" becomes "915123456789", and a legacy "4155551234" becomes "914155551234".
- Walking that through: join with "5123456789", win, the card prefills "915123456789", the player presses Confirm without editing, and `cleanPhone("915123456789")` hits `indian("5123456789")` and fails with a 400.

This is a regression introduced by the WIP. The 1.2.0 `digitsOf` in winners.ts accepted any 10-15 digits and took the last 10, so an unchanged prefilled number always passed.

Why the severity is low:
- The new join page enforces 6-9 for India on

## 25. [low] (compat-tests) Other pii.phone writers still store unkept forms, so foreign 10-digit numbers read as Indian later
File: C:\ct\test-sites\tambola\apps\edge\src\worker.ts:?
Scenario: worker.ts:2018 (roster) seals digitsOf() output and people.ts:463 (myOwnSeat) seals cleanPhone().digits, not the kept form. A Singapore number +65 91234567 is stored as 6591234567 (no +); keptPhone("6591234567") reads it as Indian 916591234567. At check-in the person retypes +65 9123 4567, kept '+6591234567' differs, editedMobile is set, and the report shows 'details changed' although nothing changed.
Fix (reviewer): Seal keptPhone(raw) in the roster route and keptFromClean(digits) in myOwnSeat (and the Host/Co-host pii written at worker.ts ~1118-1180).
Skeptic's better fix / notes: 1. Seal the kept form in all four writers.
   - Roster, `worker.ts:2018`: `phone: keptPhone(x?.phone)`.
   - Host pii, `worker.ts:1125`: `phone: keptFromClean(hMob.digits)`.
   - Co-host pii, `worker.ts:1189`: store the kept form of `cb.phone`.
   - `myOwnSeat`, `people.ts:463`: `phone: keptFromClean(digits)`. Its `digits` already comes from `cleanPhone`.
   - `phoneHashOf` and the wa.me link are unaffected, because both use digits only.

2. Make the readers tolerate stored numbers that are not in the kept form. Fixing the writers does not repair the in-flight games already holding bare digits.
   - In `confirmPrize` (`winners.ts:90-91`), do not reinterpret an unchanged prefill. If the typed string has no leading '+' or '00' and its last 10 digits equal `phoneDigits(cur.phone).slice(-10)`, keep `cur.phone` as it is.
   - In the same function, compute `changed` from the last-10 digits (`phoneDigits(...).slice(-10)`), not from the kept strings. The identity hash already works on the last 10 digits.
   - Apply the same last-10 comparison in `checkin.ts:106`, so a retype never sets `editedMobile` for an unchanged number.
Skeptic's reasoning: The root claim holds, but the harm path in the finding is wrong, and the real harm is in winners.ts, not check-in.

**What I confirmed (all against the working tree, which matches HEAD 52e7824 for these files).**
- Four writers seal a number that is not in the kept form. Their lines are unchanged by the WIP (checked with `git diff 274bde8 -- apps/edge/src/worker.ts`):
  - the roster route, `worker.ts:2018`, seals `digitsOf()` output;
  - Host pii, `worker.ts:1125`, seals `hMob.digits`;
  - Co-host pii, `worker.ts:1189`, seals `cDigits`, which is bare digits;
  - `myOwnSeat`, `people.ts:463`, seals `cleanPhone().digits`.
- For a foreign number typed with a plus, each of these stores digits only. `+65 91234567` is stored as `6591234567`, with no '+'.
- This breaks the invariant the WIP states in `phonekit.ts`: a kept number never has to be guessed. `keptPhone("6591234567")` takes the `d.length === 10` branch and returns `916591234567`, an Indian reading.
- The same happens for any foreign number with exactly 10 digits including the country code: Singapore, Norway, Denmark, Estonia, Iceland. Foreign numbers of 11 to 15 digits round-trip correctly, because `keptPhone` returns "+" plus the digits.
- Pre-WIP this was consistent. `confirmPrize` compared `slice(-10)` on both sides and stored last-10 digits. The WIP introduced the kept form and length-based readers (`keptPhone`, `cleanPhone` on the prefill) but left these four writers behind. In-flight games hold the same bare form, b

## 26. [low] (compat-tests) Kept 91-prefixed numbers now show as 12 digits on the prize card and in the report 'joined as' line
File: C:\ct\test-sites\tambola\apps\web\public\z.js:?
Scenario: z.js:370 prints esc(CF.phone) and :374 prefills it, straight from /myprizes, so an Indian winner sees 'Asha Rao · 919876543210' (was 9876543210). lifecycle.ts:302 and report-layout.ts:102 print orig.phone raw in 'joined as Name, <phone>', so that line shows 919000000003 while the table cell beside it shows 90000 00003.
Fix (reviewer): Format with the same rule as mob() (CTPhone.show on the page; mob() in lifecycle/report-layout for changedFrom).
Skeptic's better fix / notes: Add one display helper next to `keptPhone` in phonekit.ts. It would turn `^91\d{10}$` into "98765 43210" and leave "+<code><number>" unchanged. Use it in three places:
- In `mob()` in report-layout.ts, which would call it.
- In lifecycle.ts:302, as `${mob(orig?.phone)}`. This needs `mob` exported or moved to phonekit.ts. reportgen.js is the generated copy of report-layout.ts and must be rebuilt after the change.
- On the prize card in z.js. Use the same rule for the shown text at line 370, for example `CTPhone.show(CTPhone.parse("IN", "+" + digits))` for a `91` number. For the prefill at lines 363 and 374, strip a leading `91` from a 12-digit Indian value so the box shows 10 digits again. The server already accepts that and treats it as unchanged.
Skeptic's reasoning: Confirmed as a cosmetic display defect that the WIP introduces for open-link joiners. It is not data-corrupting, and it is partly pre-existing for list-based joiners. I tried to refute it and could not.

What the code does:
- The WIP changes the stored join number from bare digits to the kept form. In 1.2.0, worker.test.ts:180 expected `joinedWithPhone: phone(2)` (10 digits) and `phone: "9876543210"` after confirm. The WIP test now expects `"91" + phone(2)` and `"919876543210"`. worker.ts:1591 sets `typedDigits = keptPhone(b?.phone)`, and winners.ts:90 stores `keptFromClean(...)`. So an Indian winner's sealed phone is now `91` plus 10 digits.
- The prize card was not touched. The z.js diff against 274bde8 has no hunk between old lines 174 and 484, and the confirm card sits around new lines 356-389. `myPrizes` (winners.ts:110) returns `cur.phone` raw. z.js:363 copies it into `CF.phone`, z.js:370 prints `esc(CF.phone)` and z.js:374 prefills the input with it. An Indian winner who joined with +91 98765 43210 therefore sees "Asha Rao · 919876543210" and a prefilled input of "919876543210". CTPhone.show is already defined at z.js:121 but is not used here.
- The report line is built in lifecycle.ts:302 as `joined as ${orig.name}, ${orig.phone}`, and report-layout.ts:102 prints it as is. The WIP did update `mob()` in report-layout.ts (lines 38-43) to show "98765 43210" with the comment "as before". The winner table cell uses `mob`, but this line does not. It reads "joined as Asha, 9

## 27. [low] (compat-tests) tools/sim2 guest-invite scenarios call /people?me= without device
File: C:\ct\test-sites\tambola\tools\sim2\scenarios\matrix\gen-people.mjs:?
Scenario: Line 135 posts with only x-ct-pid and body.me; tools/sim2/scenarios/ui/s04-guests.mjs:234 posts /people?me=${pid}. Both now get 403 code device, so 'two fit' / 'two invites accepted' fail (not part of bun test, so nobody sees it until a sim2 run).
Fix (reviewer): gen-people.mjs:135 add header "x-ct-dev": the guest's device id; s04-guests.mjs:234 append `&device=<device used in joinApi>`.
Skeptic's better fix / notes: gen-people.mjs:135: add the header "x-ct-dev": l1.device to the headers object (Guest has .device). s04-guests.mjs:234: change the URL to `/people?me=${pid}&device=${H.deviceOf(l1)}`, since joinApi used H.deviceOf(phone) and l1 is that phone. Separately, fix apps/edge/test/param-people.test.ts:155 ('mine' helper) to append `&device=${dev(1)}` and, for consistency, lines 161, 167 and 172, so the 'two-level chain' test still asserts the intended behaviour (the second invite is refused for the limit, not for the device).
Skeptic's reasoning: I could not refute this. It is a real WIP regression, but it is confined to the sim2 test tooling, so I rate it low. I only read code and did not run tests or servers.

**What the WIP changed.** `callerOf` in `apps/edge/src/people.ts` (lines 128-133) now calls `deviceMatches(...)` for guest ('My invites') callers. The device must arrive as the `x-ct-dev` header, the `?device=` query parameter or `body.device`. `deviceMatches` in `checkin.ts` returns false unless the value is a 16-64 character hex string and `seat.dev` is set and matches. A missing device therefore returns 403 with code `device`. `git diff 274bde8 -- people.ts` shows this is new in the WIP; release 1.2.0 had no `deviceMatches` in `people.ts`.

**Why the two sim2 call sites now fail.**
- `Guest.join()` in `tools/sim2/lib/api.mjs:133` sends `device: deviceOf(phone)`, so `seat.dev` is set.
- `tools/sim2/scenarios/ui/kit.mjs:209` `joinApi` also sends `device: H.deviceOf(phone)`.
- `api.mjs` `call()` (lines 32-37) adds no `x-ct-dev` header or device field.
- `tools/sim2/scenarios/matrix/gen-people.mjs:135` posts `/people` with only `x-ct-pid` and `body.me`. The test 'list|a level-1 guest's own list stops at their personal limit' then gets 403 `device` where it expects "two fit" and `added === 2`.
- `tools/sim2/scenarios/ui/s04-guests.mjs:234` posts `/people?me=${pid}` with `body.me` only. In S04-11, `r1.ok && r2.ok` ('two invites accepted') fails.
- `git diff 274bde8 -- tools/sim2` is empty, so the scenarios were n

## 28. [low] (compat-tests) join-probe.test.ts is committed but asserts nothing
File: C:\ct\test-sites\tambola\apps\edge\test\join-probe.test.ts:?
Scenario: The file is headed 'PROBE (temporary)' and only console.logs status codes (show()); the only expects are the settings PATCH 200s. It runs in `bun test apps`, always passes, and gives the false impression that ID-first lookup, the extra mobile kept as contact, id-used 423 and +65/+682/+44 joins are covered.
Fix (reviewer): Turn the scenarios into assertions in a join-global.test.ts (as the handover plans) and delete the probe.
Skeptic's better fix / notes: Write apps/edge/test/join-global.test.ts with real expectations, then delete join-probe.test.ts:
- ID only in 'id' and 'either' modes joins as the listed person.
- ID plus a typed mobile keeps the mobile as contact: the stored list person gains the phone via extraDigits.
- A second device using the same ID gets 423 with code 'id-used'.
- +65 9123 4567, +682 12345 and +44 7911 123456 join, and the stored form is '+<code><number>'.
- A bare 10-digit Indian number gives the same participant as '+91 ...'.
- The old-format bare-digit stored rows still match.

Also restore the swallowed assertion at worker.test.ts line 176 by moving the comment to the end of the line, after `expect(mine.confirmed).toBe(false);`.
Skeptic's reasoning: The finding is factually correct, but it is a test-coverage gap in a file already marked as temporary. It is not a runtime defect.

Confirmed by reading the code:
- `apps/edge/test/join-probe.test.ts` is 72 lines, committed in c4ba645, and headed "PROBE (temporary)".
- Its only `expect` calls are in `setup()` (line 28), which asserts the settings PATCH returns 200. Every scenario goes through `show()` (line 35), which only `console.log`s status and code. No scenario asserts a status, code or stored value, so all four tests always pass.
- `bun test apps` (the root `test` script) picks it up because the filename matches `*.test.ts`.
- The scenarios it prints cover code that is new in the WIP and has no assertions anywhere else:
  - ID-first lookup, `idHit` and `extraDigits` (worker.ts lines 1598-1604). These are absent from release 1.2.0 (274bde8).
  - The `id-used` 423 response (worker.ts line 1622). Grep finds the string only in worker.ts and docs, in no test.
  - International joins (+65 with 8 digits, +682, +44). Grep for these finds only the probe. `param-people.test.ts` covers list parsing of +44 and +971, not the join route.
- The existing ID-join tests in `verify.test.ts` predate the ID-first, mobile-kept-as-contact and `id-used` logic and do not exercise it.

Why low:
- The file is labelled "temporary", and `docs/HANDOVER_2026-10-26_JOIN_REDESIGN.md` states it is "scaffolding - turn its scenarios into real tests (file join-global.test.ts), then delete it". The same pla

## 29. [low] (compat-tests) No test covers most of the new behaviour (list)
File: C:\ct\test-sites\tambola\apps\edge\test:?
Scenario: No test at all for: POST /api/z/:id/who (K4 required, mode mobile returns known:false, draft game 403, removed person, wrong IDs counted toward the 30 limit, name shown as 'Asha R.', single-name person); keptPhone/keptFromClean/phoneDigits branches (+, 00, 11-digit with 0, 12 with 91, bare 11-15 foreign); join with a foreign or +code 8-9 digit number and its stored form; join id/either with ID found first, the extra mobile stored as contact (extraDigits) and the 423 id-used code; the join cleanName strictness (only lists are tested, verify.test.ts:132); guest device proof through the x-ct-dev header and body.device (only ?device= is tested) and on POST people, resend, remove; check-in GET hasName/hasMobile and the confirm rules for a person with no mobile or no name; check-in and prize confirmation with a foreign number; prize confirmation by a winner known by ID with no mobile ('Please enter your mobile number.' for one without ID); listPrizes empId; mob() with + and 91 numbers (only via privacy.test report text); waLink for a foreign person. Client side: CTPhone.parse and its country rules, the * mandatory / (optional) marks per mode (joinNeeds), the stop() messages, pasted +CC switching the list, busy auto-retry (15 tries, 'Stop and try myself'), ckTime local zone, ctz-cc persistence, waiting-note restore with cc/e164. z.js never reads hasName/hasMobile, so the check-in card still asks an ID-only person to tick 'This mobile number is correct' for an empty box.
Fix (reviewer): Add join-global.test.ts for the server items, a keptPhone unit test, and happy-dom tests in apps/web/test for the join form modes, busy retry and the check-in/prize cards.
Skeptic's better fix / notes: Reword the finding as "test suite debt and stale tests in the WIP", not "no test covers it".
1. Fix param-people.test.ts:155, 161, 167 by adding `&device=${dev(1)}` (dev(2) for B), plus a positive assertion for the "device" code, so they test the rules they name again. Patch tools/sim2/scenarios/ui/s04-guests.mjs:234 the same way.
2. Restore the swallowed assertion at worker.test.ts:176 by moving the comment after `expect(mine.confirmed).toBe(false);`.
3. Replace join-probe.test.ts with a real join-global.test.ts that asserts:
   - /who: K4 required, mode mobile returns known:false, draft game 403, removed person returns known:false, wrong IDs count toward the 30-per-10-minutes limit, 'Asha R.' and single-name output;
   - join: a foreign +code 8-9 digit number and its stored form, an ID found first with the mobile kept as contact (extraDigits), 423 id-used on a second phone, cleanName strictness;
   - guest device proof via x-ct-dev and body.device on GET and POST people, resend and remove;
   - check-in confirm rules for a person with no mobile or no name, plus hasName/hasMobile on GET;
   - prize confirm with a foreign number and with a winner known by ID but no mobile.
4. Add a phonekit unit test for keptPhone, keptFromClean, phoneDigits and mob().
5. Add happy-dom tests in apps/web/test for CTPhone.parse, the marks per mode, stop() messages, busy auto-retry (15 tries) and the waiting-note restore with cc/e164.
6. Update phone-guest.test.ts to expect "+91...", and wire the check-in card to hasName/hasMobile (hide the tick when there is nothing on file).
Skeptic's reasoning: The finding is mostly true as a statement about test coverage. It is not a wrong-output bug, so "medium" is too high. I read the code and the diffs only (git diff against 274bde8, working-tree reads); I ran no tests.

WHAT I CONFIRMED
- No test contains /who, id-used, hasName, hasMobile, keptPhone, keptFromClean, phoneDigits, extraDigits, x-ct-dev, CTPhone, joinNeeds, "mandatory", ctz-cc, "Many people are joining" or "Stop and try myself". Greps over apps/edge/test, apps/web/test and packages/*/test found nothing.
- Guest device proof is only tested through ?device=. The WIP changed people.test.ts at :133-142 and :345 and :362 to pass `&device=`. Nothing exercises the x-ct-dev header or body.device (people.ts:133).
- apps/edge/test/join-probe.test.ts is the only test that touches the id/either lookup, the extra mobile and the +65/+682/+44 joins. It has no assertions about behaviour, only console.log through a `show()` helper. Its header says "PROBE (temporary)", and the handover says to turn it into join-global.test.ts and delete it. It adds noise and proves nothing.
- Check-in: the checkin.test.ts diff only touches the shared test helper. It never sends a foreign number, never sends a person with no mobile or name on file, and never reads hasName/hasMobile.
- z.js does not read hasName or hasMobile. The check-in card (z.js around char 90900 and 93148) is unchanged by the WIP, so it still shows the "This mobile number is correct" tick and Submit still requires it.

WHERE THE 

# Refuted (do not fix)

- (server-join) /who is an unmetered name oracle: only misses are counted, hits are free, and it skips joinOverLimit and spend :: The reviewer's description of the handler is accurate, but its attack scenario cannot happen against the code as it stands, because the route is not reachable.

What I confirmed in the code:
- The handler is apps/edge/src/worker.ts:1561-1579. The idmiss counter is bumped only inside `if (!hit || hit
- (server-join) /who in verify mode 'both' can never find anyone but still burns the shared 30-per-10-minutes wrong-ID budget :: REFUTED as stated, because the handler it describes never runs. The route table in apps/edge/src/worker.ts line 1484 is `p.match(/^\/api\/z\/([A-Za-z0-9_-]{4,40})\/(join|claims|bogey|settle|results|info|participants|erase|discard|reuse|roster|settings|publish|summary|announce|unbind|seats|names|mark
- (server-join) Server keeps a trunk 0 after a country code and accepts '+91' with 8-9 digits; the list route rejects the latter :: I read phonekit.ts, the WIP diff of worker.ts (digitsOf, join route, /who), cleanPhone as it stood at 274bde8, report-layout mob(), and the page-side parser in z.js (CTPhone.parse, lines 92-122, and the join call at line 216). Three claims are bundled in the finding. None is a defect that the WIP in
- (server-join) Host and Co-host mobiles are still stored as bare digits and are re-read as Indian by 'my own seat' :: I could not confirm this as a defect in the WIP. The mechanics it describes are real, but every line involved is unchanged from 1.2.0, and the WIP does not make the behaviour worse.

Unchanged code: I compared the working tree against 274bde8 in code. Three pieces are byte-identical:
- `myOwnSeat` i
- (server-join) Mobile typed together with a listed employee ID is sealed only into participant.pii, not into the person row the console and CSV read :: The mechanism in the finding is accurate, but it is not a defect, and the stated harm does not hold.

What I confirmed (diffed 274bde8 against the working tree with Python, since the git output filter mangles diffs):
- worker.ts:1603 sets extraDigits, and worker.ts:1688 builds a new sealed pii with 
- (checkin-winners) Employee ID is still missing from the winners record and the PDF, now that a winner with an ID may have no mobile at all :: Not a defect in the WIP code. lifecycle.ts and report-layout.ts are untouched by the WIP (git diff 274bde8 --stat lists only report-layout.ts's mob() change, and no lifecycle.ts change). At the release 1.2.0 commit, git grep finds no "empId" in lifecycle.ts or report-layout.ts, and none in report.js
- (client) Check-in and prize cards were not adapted to the new stored shape :: I read the z.js check-in and prize code, the WIP diffs (z.js, checkin.ts, winners.ts, worker.ts, phonekit.ts) and docs/HANDOVER_2026-10-26_JOIN_REDESIGN.md. The facts in the finding are accurate, but neither half is a defect the WIP introduced or one that produces wrong or blocked behaviour.

(1) Ch
- (compat-tests) Many tests pin the word 'engagement' and will fail when the planned wording change lands :: Not a defect in the WIP code. The reported scenario is a future change that has not landed. The reviewer's own text says the tests are "Not failing today". I confirmed this by reading the code: apps/web/public/z.js:160 still renders "Join the engagement", and apps/web/test/pages.test.ts (lines 512, 