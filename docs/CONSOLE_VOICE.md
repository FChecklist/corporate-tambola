# Console voice (owner rule, 20 Nov 2026)

Full rules: marketing-ledger `plans/ID-INVITE-AND-ARCHITECTURE-RULES-2026-11-20.md`.

**Two voices, never mixed.**
- **Console voice** (console.corporatetambola.com and each game's organizer / Host / Co-host screens): speaks TO the organizer or Host as **you**. Simple English, short sentences, no jargon.
- **Game voice** (player screens): speaks to the players. Not covered by this file.

**Rules for console text**
1. Say "you" and "your". Never "I", "my", "me", "myself" (a button is "Add to your list", not "Add to my list").
2. One idea per sentence. Short words. Say what happens next ("Press Start when you are ready.").
3. No jargon: no "payload", "token", "endpoint", "hash", "bridge". Say what the person sees.
4. A question is asked of the organizer in the third person ("Who calls the numbers?"), and every answer starts with "You" or "The game".
5. Keep the owner's approved texts word for word (the ID-invite text, the start and number wording below).
6. A test (`apps/web/test/console-voice.test.ts`) fails if the new screens contain "I", "my", "me" or "myself"; the older screens may only improve.

**Approved wording, start and numbers**
- "The game starts by itself" / "The game begins at the time you set. You do nothing."
- "You start the game" / "The game waits for you. Press Start when you are ready."
- (Tambola and Bingo) "Numbers come by themselves" / "A new random number appears every 12 seconds."
- (Tambola and Bingo) "You call the numbers" / "Press Next whenever you want a new random number."
- Values stay: start auto / manual, call auto / host.

**Ten before and after**
| Before | After |
|---|---|
| Add to my list | Add to your list |
| Manual: I'll set each prize myself | Manual: you set each prize yourself |
| My total budget for this game's prizes is | Your total budget for this game's prizes is |
| I start it | You start the game |
| I call the numbers | You call the numbers |
| Each person I invite can bring family or friends | Each person you invite can bring family or friends |
| 3 people are on my list | 3 people are on your list |
| I press Start: at the start time the game waits | You press Start: at the start time the game waits |
| Auto start / The game starts by itself at the time I set. | The game starts by itself / The game begins at the time you set. You do nothing. |
| A new number comes every 12 seconds, by itself. | A new random number appears every 12 seconds. |

## Old screens (zc.js): first-person strings still to rewrite (89, a test keeps this number from growing)

| Where | Text |
|---|---|
| zc.js:129 | I will decide later |
| zc.js:274 | Only my employees: only the people on the list you upload can pl |
| zc.js:274 | My employees, plus their friends and family: your employees |
| zc.js:274 | A list of people I choose: customers, vendors, dealers or members you add. O |
| zc.js:274 | A list of people I choose, plus the people they invite: the same, and each p |
| zc.js:274 | Anyone with the link, my employees confirm with their employee ID: anyone can joi |
| zc.js:275 | Only my employees |
| zc.js:276 | obile number only (unless you chose Only my employees). |
| zc.js:287 | Which one should I choose? |
| zc.js:288 | What happens if I choose \"Anyone with the link\" (open for all)? |
| zc.js:289 | What happens if I choose \"Only people on a list\"? |
| zc.js:290 | What if I share the common link and the game is \"Only people on a |
| zc.js:291 | ho is not on your list gets the link and I do nothing? |
| zc.js:292 | Can I change this later? |
| zc.js:293 | Why would I choose a list? |
| zc.js:294 | Why would I choose open for all? |
| zc.js:303 | What if I do not want the common link to work any more? |
| zc.js:303 | a list choice such as \"A list of people I choose\" (until the game starts). People who are not list |
| zc.js:312 | What if I admit someone by mistake? |
| zc.js:312 | Open \"My people\" and remove them. They lose their ticket. |
| zc.js:316 | What does \"Only my employees\" do exactly? |
| zc.js:318 | What if I want families or vendors to play too? |
| zc.js:319 | Is this checked against my company's HR records? |
| zc.js:322 | Which one should I choose? |
| zc.js:324 | In a game that is not \"Only my employees\", outsiders simply type their mobile number a |
| zc.js:329 | What if I choose Host and the Host forgets to press? |
| zc.js:330 | What if I choose Auto? |
| zc.js:331 | Can I change this after the game has started? |
| zc.js:334 | Can I make it faster? |
| zc.js:335 | What if I choose 2 rounds? |
| zc.js:337 | What if I set it to zero? |
| zc.js:338 | Can I let guests invite anyone? |
| zc.js:339 | What if my occasion is not in the list? |
| zc.js:340 | What if I pick the wrong day? |
| zc.js:341 | What time should I choose? |
| zc.js:342 | What if I forget to press Play now? |
| zc.js:342 | Can I win? |
| zc.js:343 | What if I do not like the prizes it gives? |
| zc.js:344 | What if I want to change the time later? |
| zc.js:347 | What if I add nothing here? |
| zc.js:348 | What if I do not add anyone? |
| zc.js:349 | What if I use the common link and the personal links together? |
| zc.js:350 | What if I publish and then change my mind? |
| zc.js:352 | What if I press Pause by mistake? |
| zc.js:352 | What if my internet goes down? |
| zc.js:353 | What if I need the report later? |
| zc.js:357 | You can send it from My people by WhatsApp. |
| zc.js:376 | Only my employees (the list I upload) |
| zc.js:376 | My employees, plus their friends and family |
| zc.js:376 | A list of people I choose (customers, vendors, members) |
| zc.js:376 | A list of people I choose, plus the people they invite |
| zc.js:443 | My crowd is a different size |
| zc.js:491 | Choose myself |
| zc.js:676 | ID. Type the number here, or choose Only my employees in step 2. |
| zc.js:700 | My people list is not switched on yet. Please try again a li |
| zc.js:793 | From my contacts |
| zc.js:806 | Pick from my contacts |
| zc.js:807 | ople by employee ID instead, choose Only my employees in step 2. Open step 2 |
| zc.js:829 | My people ${P.stale ? |
| zc.js:903 | is game can no longer be moved. Move my game to this date ${M.err ? |
| zc.js:919 | : ""} No, keep my game Change the date instead Yes, go to the 2nd confir |
| zc.js:920 | e auto-deleted. You cannot undo this. I understand that cancelling cannot be undone Go back Su |
| zc.js:921 | This will cancel for good. No, keep my game Yes, is cancelled |
| zc.js:948 | Same guests as my game |
| zc.js:948 | No guests yet (I will add them) |
| zc.js:948 | Pick guests from my game |
| zc.js:998 | Publish my game, free |
| zc.js:1013 | : ""}. Use it for this game. Use my credit ${S.creditErr ? |
| zc.js:1231 | How do I start? |
| zc.js:1234 | Can I change things later? |
| zc.js:1235 | How do I add a video? |
| zc.js:1237 | Is my guests' data safe? |
| zc.js:1239 | How do I stop the game? |
| zc.js:1243 | Can I get a refund? |
| zc.js:1244 | Who do I contact? |
| zc.js:1258 | All my games |
| zc.js:1300 | Who is this game for: \"A list of people I choose\" keeps it to your list, and people not on the lis |
| zc.js:1301 | \"I will decide later\" is fine. You can still publish and ch |
| zc.js:1349 | Copy my AI work link Get a fresh AI link Replace my AI link |
| zc.js:1350 | Get my AI work link |
| zc.js:1352 | ChatGPT Atlas, Perplexity Comet): tick My AI works in my web browser in the AI Assistant box, so |
| zc.js:1363 | Close my account Close my account |
| zc.js:1371 | My AI works in my web browser: hide guest names and numbers |
| zc.js:1521 | ner screens are on their own page. Open my partner area |
| zc.js:1599 | Send me a code |
| zc.js:1601 | . Your mobile number Save my number |
| zc.js:1737 | All my games |
| zc.js:2225 | I understand: the numbers stop for every player until I pres |
| zc.js:2309 | Yes, close my account |
