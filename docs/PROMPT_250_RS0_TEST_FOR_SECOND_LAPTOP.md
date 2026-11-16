# Prompt for the second laptop (PEHU): live Rs 0 test with 250 participants

Copy everything in the box below into Claude Code on the other laptop.

```text
TASK: Run ONE live Corporate Tambola game with 250 participants on the real website https://corporatetambola.com and report the result. It costs nothing (Rs 0): use the owner's test-only organizer login, which is allowed up to 250 people for free.

RULES (do not break these)
- Use only this organizer login: demo1@xyz.in . On the sign-in page ask for the e-mail code, then type 123456 (this test login never sends a mail; the code is always 123456).
- Do not pay anything, do not open any payment page, do not change any site setting, do not touch Cloudflare, GitHub or any other account. Do not use pehueagle@gmail.com for this test.
- Real website only (not a local server). Organizer actions must be done by clicking and typing in the page, like a person (no API calls to create or set up the game).
- If the site answers HTTP 500 or "something did not work on our side", wait 5 minutes and try again; keep trying, do not give up. Report every such error with the time.

SET UP THE GAME (click only, in Chromium)
1. Sign in as demo1@xyz.in. Press "Create a new game".
2. Step 2: choose "Up to 250 people", "Auto" (the software calls the numbers), gap 12 seconds, 1 ticket each, 1 game, audience "Anyone with the link". Save and continue.
3. Steps 3-5: keep the default prizes (5 prizes), no brand moments, no hosts. Step 6: Continue. Step 7: check and "Publish my game, free" (the game may already show as published/paid: that is fine, it is the Rs 0 test pack).
4. Set the game to start about 14 minutes after you publish. Copy the guest link.

THE 250 PLAYERS
- 10 players as real phone-size browser pages (390 x 844, each its own browser context): open the guest link, type a name and a mobile number (use 98122 followed by 5 digits, e.g. 9812200001), tick the boxes, join, then tap the called numbers about 1-4 seconds after they appear and press Claim when a prize is available.
- The other 240 players as lightweight in-page agents or HTTP phones (the same kind you built last time): join, receive numbers, tap and claim.
- Spread the joins over at least 3 minutes (random delay 0-180 s per player, starting 7 minutes before the game start). The site limits one network address to 200 joins a minute, and all 250 of your players come from one address. If some joins are refused for that reason, write down how many and what the screen said: that is a finding, not a failure of your test.
- If the laptop runs out of memory, reduce to 100 players (the owner allows this) and say so in the report.

WHAT TO MEASURE AND REPORT (plain words, one page, no jargon)
1. How many of the 250 joined, how long joining took, how many were refused and why.
2. The gap between numbers: average, smallest, largest (target 12.0 seconds, 90 numbers at most). Use the public big-screen page of the game as an independent observer.
3. For every player: did the numbers on the phone match the big screen, and how late did each number appear on the phone compared with the big screen (median, 95th percentile, worst).
4. Prizes: exactly 5 awarded, who got them, what late or beaten claimers were told.
5. Any page error, HTTP 5xx, blank screen, wrong text, or anything a normal person would find confusing. Include the time of each.
6. The game id (the part after e= in the link) and the start and end times (IST).
Save the report as a file on that laptop and also print it. Do not delete the game; it erases its own data.

Do not run any other live game at the same time. The main laptop may be running its own 100-player test on the same WiFi, so both laptops can look like one network address to the site: keep your joins spread out as described above, and do not start joining before 12:25 IST (06:55 UTC) today, so the two joining windows do not overlap.
```
