# Corporate Tambola: the use cases that are tested

Written 2026-10-22. One line per use case; each is a real-Chrome (Playwright) scenario in `tools/sim2/scenarios/ui/` unless marked otherwise. The number of checks is from the last full run. Status: PASS = ran green in the last run, NEW = written today and not yet in a full run, being built / planned = see the end.

| Use case | Area | What is tested | Checks | Status |
|---|---|---|---|---|
| 1. S01-01 | Sign-in (Organizer, Host) | Organizer signs up on the home page (laptop) and lands in an empty console | 11 | PASS |
| 2. S01-02 | Sign-in (Organizer, Host) | Sign-up with a bad e-mail shows a calm message and nothing is created | 10 | PASS |
| 3. S01-03 | Sign-in (Organizer, Host) | Log in on a phone with the e-mailed code (code taken from the mail sink) | 6 | PASS |
| 4. S01-04 | Sign-in (Organizer, Host) | Wrong code is refused with a message, the right code then works; 'Use this passcode' helper works in TEST mode | 7 | PASS |
| 5. S01-05 | Sign-in (Organizer, Host) | Log in with an unknown e-mail: same calm answer, nothing leaks about who has an account | 5 | PASS |
| 6. S01-06 | Sign-in (Organizer, Host) | Fake Google: sign up a new Organizer with 'Continue with Google' | 8 | PASS |
| 7. S01-07 | Sign-in (Organizer, Host) | Fake Google: log in an existing Organizer on the sign-in page and from the home page | 4 | PASS |
| 8. S01-08 | Sign-in (Organizer, Host) | Fake Google token from a different (unknown) audience is refused; tampered credential refused | 2 | PASS |
| 9. S01-09 | Sign-in (Organizer, Host) | The sign-in e-mail link page: incomplete link message, then a good link signs in once only | 7 | PASS |
| 10. S01-10 | Sign-in (Organizer, Host) | Console without a key shows the sign-in prompt (not a blank page) | 5 | PASS |
| 11. S02-01 | Console: building a game | Step 1 by tapping: occasion, a day and a time; the game is created and the start time is exactly what was tapped | 8 | PASS |
| 12. S02-02 | Console: building a game | Step 1 other date and other time inputs, and a past date is refused kindly | 10 | PASS |
| 13. S02-03 | Console: building a game | Step 2 by tapping: 500 players, own number 321, 2 tickets, 12 s, 3 rounds, anyone with the link, guest invites on | 9 | PASS |
| 14. S02-04 | Console: building a game | Step 2 players: a number that is not whole or below 1 is refused; the largest chip 10000 is accepted | 6 | PASS |
| 15. S02-05 | Console: building a game | Step 3: the four start-from bundles (Classic, Simple, Rich, Choose myself) change the ticked prizes and are saved | 6 | PASS |
| 16. S02-06 | Console: building a game | Step 3: every prize house on its own (19 houses), maximum winners each, saved and read back | 4 | PASS |
| 17. S02-07 | Console: building a game | Step 3: every prize kind (10 popular + something else + decide later + no prize) and 'a different prize for each winner' | 8 | PASS |
| 18. S02-08 | Console: building a game | Step 4: company name, colour, a logo file; the preview page shows the brand strip; guests' ticket page shows it too | 12 | PASS |
| 19. S02-09 | Console: building a game | Step 4: brand moments by tapping: an opening message, a during-game message, a closing message and a lucky draw | 6 | PASS |
| 20. S02-10 | Console: building a game | Step 4: the moment kinds (YouTube, video file, audio file) accept a link and refuse a bad one; 'Test it' appears | 5 | PASS |
| 21. S02-11 | Console: building a game | Step 5: add a Host (name, mobile, e-mail) and a Co-host (name, mobile) by tapping; Host e-mail is mandatory in the form | 9 | PASS |
| 22. S02-12 | Console: building a game | Step 6: add people one by one, paste from Excel with duplicates and wrong numbers, upload a CSV | 12 | PASS |
| 23. S02-13 | Console: building a game | Step 7 then 8 by tapping: publish with confirmation, then 'Pay now' leads to the pay page | 12 | PASS |
| 24. S02-14 | Console: building a game | Publish refuses a wrong e-mail / mobile and keeps the game a draft | 11 | PASS |
| 25. S02-15 | Console: building a game | All ten steps on a phone (390 px), tapping only: complete journey from sign-up to paid, with the progress bar | 21 | PASS |
| 26. S03-01 | Team: Hosts and Co-hosts | Host invited with mobile + e-mail: WhatsApp button -> simulator chat -> SEND -> Host's phone gets the link; first open in the UI | 15 | PASS |
| 27. S03-02 | Team: Hosts and Co-hosts | Host with e-mail only: first open asks e-mail code then the mobile number; console opens only after both | 11 | PASS |
| 28. S03-03 | Team: Hosts and Co-hosts | Host first open with Continue with Google (fake) when the Google e-mail is the Host's e-mail | 8 | PASS |
| 29. S03-04 | Team: Hosts and Co-hosts | Host first open with Google but a different e-mail: kind refusal, nothing opens | 9 | PASS |
| 30. S03-05 | Team: Hosts and Co-hosts | Host link unused for 8 days expires; the Organizer makes a new link and that one works | 12 | PASS |
| 31. S03-06 | Team: Hosts and Co-hosts | Host console: Host pill, no account section, can publish and pay the Organizer's game, can add a Co-host but not a Host | 23 | PASS |
| 32. S03-07 | Team: Hosts and Co-hosts | Host signs in later on a second device with an e-mail code (not the one-time link) | 9 | PASS |
| 33. S03-08 | Team: Hosts and Co-hosts | Retiring a Host at once stops all their keys; the console says so kindly | 11 | PASS |
| 34. S03-09 | Team: Hosts and Co-hosts | At most five Hosts: the sixth is refused with a message in the console | 8 | PASS |
| 35. S03-10 | Team: Hosts and Co-hosts | Co-host: link opens a 3-step view (Today's game, Invite people, Payment); no guest list, no game editing | 19 | PASS |
| 36. S03-11 | Team: Hosts and Co-hosts | Co-host invites people (own list, personal links), is stopped at the limit, and pays the game | 18 | PASS |
| 37. S03-12 | Team: Hosts and Co-hosts | Co-host link bound to one game: another game of the same Organizer is refused; retiring the Co-host stops the link | 9 | PASS |
| 38. S04-01 | Guests: joining, lists, links | Personal link: Organizer taps 'Send on WhatsApp' in the console, SEND in the simulator, the guest taps the link and is in without typing | 20 | PASS |
| 39. S04-02 | Guests: joining, lists, links | A personal link is single-use: a second phone using the same link goes to the waiting room, not into the first person's seat | 17 | PASS |
| 40. S04-03 | Guests: joining, lists, links | Common link, number on the list: recognised and placed under the real inviter even through another inviter's link (first wins) | 11 | PASS |
| 41. S04-04 | Guests: joining, lists, links | Who can join = list: a stranger waits; the page says so calmly; the Organizer admits in the console and the guest gets in | 19 | PASS |
| 42. S04-05 | Guests: joining, lists, links | Who can join = anyone: a stranger gets a ticket at once; an invalid number or empty name is refused kindly | 16 | PASS |
| 43. S04-06 | Guests: joining, lists, links | Waiting room: decline shows the guest a calm message; Approve all lets in everyone waiting | 15 | PASS |
| 44. S04-07 | Guests: joining, lists, links | Waiting room: who approved is recorded and shown (Host vs Organizer) | 11 | PASS |
| 45. S04-08 | Guests: joining, lists, links | Remove a person before the game (console): the place is freed, the same phone cannot re-join, a removal is logged | 17 | PASS |
| 46. S04-09 | Guests: joining, lists, links | Remove a person during the game: the phone shows removed and stops; the seat stays in the public seat list | 15 | PASS |
| 47. S04-10 | Guests: joining, lists, links | Level-1 guest 'My invites': invites up to the limit, sends a personal link on WhatsApp; the invited (level 2) guest plays but has no invite card | 22 | PASS |
| 48. S04-11 | Guests: joining, lists, links | Level-1 guest over the limit: a third invite is refused with a message; common link beyond the limit sends the guest to the Organizer's waiting room | 3 | PASS |
| 49. S04-12 | Guests: joining, lists, links | Hard cap: when the bought size is full the next guest is told the game is full | 9 | PASS |
| 50. S04-13 | Guests: joining, lists, links | Join form: name is required, a number with +91 / spaces / leading zero is cleaned, the same number twice gives one ticket | 16 | PASS |
| 51. S04-14 | Guests: joining, lists, links | A draft or unpublished game's link tells the guest it is not open yet; an unknown game id shows a calm not-found | 5 | PASS |
| 52. S04-15 | Guests: joining, lists, links | A player leaves from the player page (Leave this game): it asks first, the seat and the name are deleted, the page says so, the Organizer's count drops, and the same phone can join again later | 22 | PASS |
| 53. S04-16 | Guests: joining, lists, links | 'What do you hold about me / delete me': the page shows the promised answer time, answers with what is held, records the request and mails the Organizer and the owner; a deletion request removes the player at once | 16 | PASS |
| 54. S05-01 | Money: pay page, pay links, credit | Pay page (test payment) on a laptop: the Organizer pays, sees the finished page and invoice link; console pill turns Paid; a mail goes to the payer | 13 | PASS |
| 55. S05-02 | Money: pay page, pay links, credit | Pay button double-clicked: only one payment is made | 11 | PASS |
| 56. S05-03 | Money: pay page, pay links, credit | Opening the pay page again after payment: it does not take money twice | 5 | PASS |
| 57. S05-04 | Money: pay page, pay links, credit | Pay page for a signed-out person and for another organizer's game: calm messages, no payment | 8 | PASS |
| 58. S05-05 | Money: pay page, pay links, credit | Pay link: made in step 8, opened by a stranger with no sign-in; shows game, date, price, one Pay button; stranger pays with name + e-mail only | 14 | PASS |
| 59. S05-06 | Money: pay page, pay links, credit | Pay link states: a new link cancels the old; a link expires after 7 days; a paid game's link is closed | 8 | PASS |
| 60. S05-07 | Money: pay page, pay links, credit | Cancel a paid game before it starts: payment becomes credit (no refund) for 365 days; credit is offered on the next game; use it in full | 14 | PASS |
| 61. S05-08 | Money: pay page, pay links, credit | Credit smaller than a bigger game's price: credit is used and only the difference is paid (top-up); credit larger than price leaves the remainder | 6 | PASS |
| 62. S05-09 | Money: pay page, pay links, credit | Credit belongs to its organization only: another organizer sees none, and a pay-link stranger is never offered credit | 7 | PASS |
| 63. S05-10 | Money: pay page, pay links, credit | A payment that arrives after the game was cancelled becomes credit, not a refund | 3 | PASS |
| 64. S05-11 | Money: pay page, pay links, credit | Paid late: paying after the start time starts the game 2 minutes after the payment, and the console says so | 7 | PASS |
| 65. S06-01 | Life of a game: cancel, end, unpaid, erase | Cancel an UNPAID game through the three confirmations: cancelled, no credit, guests see 'cancelled by the organizer' | 11 | PASS |
| 66. S06-02 | Life of a game: cancel, end, unpaid, erase | Every 'No' path of the cancel flow: No at 1, Go back at 2, no tick no Submit, No at the final panel; wrong confirmation count refused by the server | 11 | PASS |
| 67. S06-03 | Life of a game: cancel, end, unpaid, erase | Cancel a PAID game by tapping: credit made, guests told, cancelled twice is harmless, cannot be published or paid again | 8 | PASS |
| 68. S06-04 | Life of a game: cancel, end, unpaid, erase | A paid game cannot be cancelled once its start time has passed; the console explains and points to End the game | 7 | PASS |
| 69. S06-05 | Life of a game: cancel, end, unpaid, erase | A Host cancels: the Organizer gets an e-mail; the Host's console does the same three confirmations | 7 | PASS |
| 70. S06-06 | Life of a game: cancel, end, unpaid, erase | Cancelled game on every surface: ticket page, big screen, pay page, pay link, Co-host view, preview and the info API | 10 | PASS |
| 71. S06-07 | Life of a game: cancel, end, unpaid, erase | Reschedule a published game from step 1: earlier and later; guests see the new time; past and over-30-days refused | 13 | PASS |
| 72. S06-08 | Life of a game: cancel, end, unpaid, erase | 'Create a new game like this one' with the people list: settings copied, date empty, nothing paid or published, people moved with new links | 9 | PASS |
| 73. S06-09 | Life of a game: cancel, end, unpaid, erase | Clone without people, and clone from a cancelled game; the 10-draft limit | 4 | PASS |
| 74. S06-10 | Life of a game: cancel, end, unpaid, erase | Unpaid after the start time: Organizer and Host read 'Payment pending'; guests and Co-hosts read 'Waiting for the Organizer or Host to start the game' | 18 | PASS |
| 75. S06-11 | Life of a game: cancel, end, unpaid, erase | The did-not-start screen: an unpaid game past its end shows 'did not start' to every role, can still be paid until erasure, then the data is erased with the e-mails | 10 | PASS |
| 76. S06-12 | Life of a game: cancel, end, unpaid, erase | Credit e-mails over time: 30 days before expiry, 3 days before, and the lapse at the end of day 365 (India time); lapsed credit cannot be used | 8 | PASS |
| 77. S07-01 | Playing: phones, numbers, winners | Two Chrome phones play a whole game on the fake beacon; both end, identical winners, no JavaScript errors, Organizer sees the results | 20 | PASS |
| 78. S07-02 | Playing: phones, numbers, winners | Four phones: a late joiner and a phone that goes offline for a while still end with the identical numbers and winners | 28 | PASS |
| 79. S07-03 | Playing: phones, numbers, winners | Big screen during the game shows numbers and winners only (no names or phone numbers) and agrees with the phones | 16 | PASS |
| 80. S07-04 | Playing: phones, numbers, winners | Brand moments in the game: the opening message is shown on the phones before the first number | 9 | PASS |
| 81. S07-05 | Playing: phones, numbers, winners | Organizer announcement during the game reaches every phone; the console's Game day step shows controls | 17 | PASS |
| 82. S07-06 | Playing: phones, numbers, winners | Remove a person during the game: that phone shows removed and stops; the other phones continue and winners stay identical | 23 | PASS |
| 83. S07-07 | Playing: phones, numbers, winners | After the game: the report link is e-mailed to the Organizer only about 3 minutes after the end; 'Delete all participant data now' empties the guests at once | 18 | PASS |
| 84. S07-08 | Playing: phones, numbers, winners | Two rounds: results of both rounds are kept apart and identical on both phones | 16 | PASS |
| 85. S08-C1280 | Screen sizes | Console at 1280 px: empty console, a game with each of the ten steps open, Host and Co-host views | 18 | PASS |
| 86. S08-C1920 | Screen sizes | Console at 1920 px: empty console, a game with each of the ten steps open, Host and Co-host views | 18 | PASS |
| 87. S08-C360 | Screen sizes | Console at 360 px: empty console, a game with each of the ten steps open, Host and Co-host views | 18 | PASS |
| 88. S08-C768 | Screen sizes | Console at 768 px: empty console, a game with each of the ten steps open, Host and Co-host views | 18 | PASS |
| 89. S08-G1280 | Screen sizes | Game pages at 1280 px: join form, ticket, waiting, big screen, preview, pay page, pay link, cancelled game | 25 | PASS |
| 90. S08-G1920 | Screen sizes | Game pages at 1920 px: join form, ticket, waiting, big screen, preview, pay page, pay link, cancelled game | 25 | PASS |
| 91. S08-G360 | Screen sizes | Game pages at 360 px: join form, ticket, waiting, big screen, preview, pay page, pay link, cancelled game | 25 | PASS |
| 92. S08-G768 | Screen sizes | Game pages at 768 px: join form, ticket, waiting, big screen, preview, pay page, pay link, cancelled game | 25 | PASS |
| 93. S08-P1280 | Screen sizes | Public pages at 1280 px: home, sign-in, guide, trust, legal pages, partner, demo, brochure, AI link, 404 | 6 | PASS |
| 94. S08-P1920 | Screen sizes | Public pages at 1920 px: home, sign-in, guide, trust, legal pages, partner, demo, brochure, AI link, 404 | 6 | PASS |
| 95. S08-P360 | Screen sizes | Public pages at 360 px: home, sign-in, guide, trust, legal pages, partner, demo, brochure, AI link, 404 | 6 | PASS |
| 96. S08-P768 | Screen sizes | Public pages at 768 px: home, sign-in, guide, trust, legal pages, partner, demo, brochure, AI link, 404 | 6 | PASS |
| 97. S09-01 | Brand moments | No logo set: the guest ticket page, the preview and the big screen say CORPORATE TAMBOLA in writing | 6 | PASS |
| 98. S09-02 | Brand moments | The Organizer uploads a logo in the console: it shows on the ticket, the preview and the big screen, at a size that fits | 7 | PASS |
| 99. S09-03 | Brand moments | A Host can set and change the logo too; a Co-host cannot; a bad logo is refused by the server with a plain reason | 10 | PASS |
| 100. S09-04 | Brand moments | The installed app (service worker) shows the logo and company name again with the network OFF | 6 | PASS |
| 101. S10-01 | Accessibility | Accessibility (axe-core, WCAG 2 A/AA incl. colour contrast) on the home page, pricing, host sign-in, player page and big screen at phone width | 8 | PASS |
| 102. S10-02 | Accessibility | Accessibility (axe-core, WCAG 2 A/AA incl. colour contrast) on the same five pages at laptop width | 8 | PASS |
| 103. S10-03 | Accessibility | Keyboard: Tab reaches every control of the five main pages in page order, and the place you are at is marked | 18 | PASS |
| 104. S10-04 | Accessibility | The Privacy page has an Accessibility statement with a way to report a problem | 6 | PASS |
| 105. S11-01 | Install as an app | Installable app: valid manifest and icons, install tags on the main pages, service worker saves the game and shows an offline page when the network is off | 25 | PASS |
| 106. S11-02 | Install as an app | Fit on six phone sizes and a phone held sideways: no sideways scrolling, no text under 12 px, targets 44 px or more (home, pricing, sign-in, join, demo, big screen) | 6 | PASS |
| 107. S11-03 | Install as an app | A game in progress and its result screen on the same sizes: no sideways scrolling, text 12 px or more, targets 44 px or more, the called number and the ticket in view | 23 | PASS |
| 108. S11-04 | Install as an app | The free demo is run to its end on a phone: the ball, the marks on the ticket and the end screen | 6 | PASS |
| 109. S12-01 | Help Desk / partners | A helper enrols in Refer & earn on the page, turns on Help Desk; a different e-mail is refused (page and API), the right one works | 12 | PASS |
| 110. S12-02 | Help Desk / partners | The helper invites an Organizer on the page: mail arrives with the accept link; a duplicate and the helper's own address are refused; no account-existence leak | 13 | PASS |
| 111. S12-03 | Help Desk / partners | Invite limits: 5 per hour per helper, 3 a day per Organizer address across helpers | 8 | PASS |
| 112. S12-04 | Help Desk / partners | The Organizer opens the accept page, signs in with the e-mailed code, reads the promise, taps Allow; the helper is told and gets console + AI link; consent is required | 19 | PASS |
| 113. S12-05 | Help Desk / partners | Wrong-account sign-in is refused on the accept page; made-up, malformed and expired tokens show calm messages | 12 | PASS |
| 114. S12-06 | Help Desk / partners | The helper opens the REAL console with the AI key on a 360 px phone and builds a game through the steps; it is the Organizer's game and the Help Desk page lists it | 11 | PASS |
| 115. S12-07 | Help Desk / partners | The same on a 1280 px laptop: Start a new game, steps 1 to 3, every other step opens without an error | 6 | PASS |
| 116. S12-08 | Help Desk / partners | The helper cannot publish, pay, close the account, see sign-in keys or add a Host: refused in the console and by the API | 27 | PASS |
| 117. S12-09 | Help Desk / partners | The helper asks the Organizer to publish: button on the Help Desk page, the Organizer's mail has the summary and the approval link, asking again waits | 15 | PASS |
| 118. S12-10 | Help Desk / partners | The approve page: summary shown, the K1 box starts unticked and is required, e-mail and mobile must be confirmed; wrong, replaced and expired tokens are refused | 33 | PASS |
| 119. S12-11 | Help Desk / partners | The Organizer publishes in one tap from the e-mailed link; the game is really published, guests can open the share link, the link cannot be used twice | 19 | PASS |
| 120. S12-12 | Help Desk / partners | After publishing the helper gets the Host link: first-open setup works in the UI, the helper changes a game detail as Host, and does not use one of the Organizer's 5 Host places | 19 | PASS |
| 121. S12-13 | Help Desk / partners | The helper sees the AI link on the Help Desk page; /ai/<key> opens the manual with the helper paragraph; the AI can ask for publishing with the link alone; the Host AI link opens too | 14 | PASS |
| 122. S12-14 | Help Desk / partners | The Organizer stops the helper on the page: every helper key stops at once (AI key, Host keys, Host AI link, console), published games stay, the helper is told | 22 | PASS |
| 123. S12-15 | Help Desk / partners | Stopping by API (the Organizer's key, the helper's own 'End this for me', declining an invitation); other accounts and other helpers cannot stop a link | 16 | PASS |
| 124. S12-16 | Help Desk / partners | A stopped link can be re-invited: a new invitation works, the old keys stay dead, the old games stay recorded under the old link | 10 | PASS |
| 125. S12-17 | Help Desk / partners | A paid game the helper prepared earns the helper commission (shown on the partner page), whatever partner code the buyer carried; a game the Organizer made alone earns the helper nothing | 17 | PASS |
| 126. S12-18 | Help Desk / partners | Self-referral earns nothing: when the helper's mobile number is the payer's, the commission is blocked and the partner page says so | 7 | PASS |
| 127. S12-19 | Help Desk / partners | Two helpers for the same Organizer are independent: own keys, own games, own approvals, own Host, own commission; stopping one leaves the other working | 17 | PASS |
| 128. S12-20 | Help Desk / partners | The Organizer replaces or revokes their own AI link: the helper keeps working (page, console and API) | 13 | PASS |
| 129. S12-21 | Help Desk / partners | Layout of the three Help Desk pages at 360 px and 1280 px: no sideways scroll, readable text, every tap target at least 36 px | 39 | PASS |
| 130. S12-22 | Help Desk / partners | Accessibility basics on the three Help Desk pages: language, title, one main heading, labels for every field, names for every button, and axe-core finds nothing | 38 | PASS |
| 131. S12-23 | Help Desk / partners | A tour of every state of the three pages (signed out, joined, invited, allowed, approve, used, stopped) raises no JavaScript or console error and no 5xx | 14 | PASS |
| 132. S12-24 | Help Desk / partners | When the helper closes their Refer & earn account every link ends and every key stops; when the Organizer closes theirs the Help Desk rows go | 9 | PASS |
| 133. S13-01 | Footer and legal pages | The uniform footer on the built public pages at 360 px: one footer, its own bright colours, seller line, payment-test link, every link into this site answers 200, no sideways scroll | 70 | PASS |
| 134. S15-01 | Surveys: what each role sees | Survey: what each role sees when they make a mistake (Organizer, Host, Co-host, participant) | 19 | PASS |
| 135. S15-02 | Surveys: what each role sees | Survey: what a participant sees in every state (list-only, full, other phone, second ticket, removed, cancelled, not open, wrong link) | 34 | PASS |
| 136. S16-01 | Guided errors (mistakes and failures) | Sign-in mistakes (Organizer): empty e-mail, bad e-mail, wrong code, short code. Each explains itself in place; Take me there focuses the right box; after the fix the sign-in works | 29 | PASS |
| 137. S16-02 | Guided errors (mistakes and failures) | Console step 2 (Organizer): 0, empty and over-limit players; each is explained in place, Take me there outlines the box, and after typing a good number Save and continue works | 25 | PASS |
| 138. S16-03 | Guided errors (mistakes and failures) | Console step 5 (Organizer): Host and Co-host slips; each guide names the right box and Take me there outlines exactly it | 46 | PASS |
| 139. S16-04 | Guided errors (mistakes and failures) | Publish (Organizer): the greyed-out button says what is still needed; a bad e-mail is explained in place; after the fix the game publishes | 17 | PASS |
| 140. S16-05 | Guided errors (mistakes and failures) | When the service has a bad moment (Organizer): a failed save (500), too many tries (429) and a dropped connection each explain themselves, say nothing is lost, offer Try again, and Try again then really saves | 24 | PASS |
| 141. S16-06 | Guided errors (mistakes and failures) | Participant join form: a short number, a number with letters and an empty name are each explained in place with steps; after the fix the person gets their ticket | 16 | PASS |
| 142. S16-07 | Guided errors (mistakes and failures) | Participant in every state (list-only game, full game, ticket on another phone, cancelled game, game not open yet, mistyped link, bad personal link): each is explained with steps, without a button into the Organizer's console, and nothing technical is shown | 71 | PASS |
| 143. S16-08 | Guided errors (mistakes and failures) | Take me there and back (Organizer): from Check and publish the guide takes the person to another step and exact box; after the fix one tap on 'Done? Back to ...' returns them to where they were; what they had typed on the way is still there | 9 | PASS |
| 144. S16-09 | Guided errors (mistakes and failures) | Adding people (Organizer, step 6): a number with a digit missing, the same number twice, and a list longer than the game allows are each explained with what to do; the person can correct the wrong number right there and add it | 15 | PASS |
| 145. S16-10 | Guided errors (mistakes and failures) | Host's first sign-in (Host): a bad e-mail, a wrong code and a short code are each explained in place with steps; after the fix the Host gets in | 24 | PASS |
| 146. S16-11 | Guided errors (mistakes and failures) | Pay page (Organizer): the Pay button says what is still needed; a bad e-mail is explained in place; after the fix the payment goes through | 15 | PASS |
| 147. S16-12 | Guided errors (mistakes and failures) | A stranger on a pay link (payer): missing name or e-mail is explained in place and the payment then goes through | 12 | PASS |
| 148. S16-13 | Guided errors (mistakes and failures) | Logo and game-day message (Organizer): a file that is not a picture, a picture over 5 MB, and an empty message are each explained in place with steps | 18 | PASS |
| 149. S16-14 | Guided errors (mistakes and failures) | Refer and earn sign-up (partner): a missing box tick and a bad mobile number or e-mail are explained in place; after the fix the sign-up goes on to the code | 19 | PASS |
| 150. S16-15 | Guided errors (mistakes and failures) | Wiring sweep: no screen, once drawn, has two elements with the same id; and tapping a text box, a label or a tick box never runs a button's action by accident (every screen of every role) | 6 | PASS |
| 151. S17-01 | Paying before and after the start | Pay 4 minutes BEFORE the start: the pay page confirms, then opens the engagement page by itself; the game is paid and keeps its start time | 13 | PASS |
| 152. S17-02 | Paying before and after the start | Pay 3 minutes AFTER the start time: the game begins at the payment, the Organizer lands on the engagement page, waiting guests get the game | 12 | PASS |
| 153. S17-03 | Paying before and after the start | 'Stay on this page' keeps the receipt; the page does not jump; the button still opens the engagement | 11 | PASS |
| 154. S17-04 | Paying before and after the start | A Co-host pays for the game: the receipt shows and the Co-host lands on the engagement page they are allowed to see |  | PASS |
| 155. S18-01 | Many winners, tie rules, prizes list, organizer board | Step 3: the organizer types 7 winners for the Top Line, taps 3 for the Full House, picks the tie rule; the game keeps exactly that and the console shows it again |  | NEW |
| 156. S18-02 | Many winners, tie rules, prizes list, organizer board | Ties take turns: 5 phones, Top Line with 3 prizes and Full House with 2; every prize position has one winner in order; the live prizes list puts open prizes first and crosses out claimed ones; a player sees no earlier numbers and no board |  | NEW |
| 157. S18-03 | Many winners, tie rules, prizes list, organizer board | Ties share: the same game with the sharing rule; each prize position is a later call, and people finishing together share it |  | NEW |
| 158. S18-04 | Many winners, tie rules, prizes list, organizer board | Only the organizer has the board: the board page without the key says so; with the key it shows the 90 numbers; the number screen shows the prizes and no board |  | NEW |
| 159. S18-05 | Many winners, tie rules, prizes list, organizer board | The Bumper: with two tickets the Full Two-Ticket House can have many winners; the prizes list names 1st, 2nd... positions; a 101st winner is refused with a plain message |  | NEW |
| 160. S98-01 |  | Probe: list every step and control of the Organizer console |  | NEW |
| 161. S98-02 |  | Probe: the Publish button before anything is filled |  | NEW |
| 162. S98-03 |  | Probe: a personal link with a wrong token, after pressing the button |  | NEW |
| 163. S98-04 |  | Probe: Refer and earn enrolment |  | NEW |
| 164. S98-05 |  | Probe: how many enrolment calls one click makes, with and without the new scripts |  | NEW |
| 165. S98-06 |  | Probe: partner page slips |  | NEW |
| 166. S98-07 |  | Probe: the pay link page |  | NEW |
| 167. S99-01 |  | manual screens: organizer |  | NEW |
| 168. S99-02 |  | manual screens: host, co-host, guests, game day |  | NEW |
| 169. S99-03 |  | manual screens: partner (refer and earn) |  | NEW |
| 170. S99-04 |  | manual screens: partner enrol, dashboard, referred sale; sales material |  | NEW |
| 171. S19-01..08 | Demo game (free, up to 10) | Demo game: make, 10 join, 11th refused kindly, publish free, play with watermark, convert mid-game, convert after end (clone), conversion payment fails -> guide |  | being built |
| 172. S20-01..06 | Host calls the numbers (manual mode) | Host calls: 3 phones + board + number screen get numbers only on presses, identical; pause during host mode; a Host presses from their link; press while pending refused kindly; auto mode regression |  | being built |
| 173. S21-01..05 | Real housie play mode | Real housie mode: player taps their own numbers; Claim button; wrong mark refused kindly; organizer sees who claimed; easy mode unchanged |  | planned |
| 174. S23-01 | Exceptions and abuse | Exception: the beacon (public random numbers) is unreachable for a while: phones wait calmly, resume with the same numbers |  | planned |
| 175. S23-02 | Exceptions and abuse | Exception: the store is down during a game: phones keep playing from public data, claims are sent later exactly once |  | planned |
| 176. S23-03 | Exceptions and abuse | Exception: two organizers edit the same game at once: the second save is refused or merged, never silently lost |  | planned |
| 177. S23-04 | Exceptions and abuse | Exception: a guest opens the same personal link on three phones: one ticket, the others told kindly |  | planned |
| 178. S23-05 | Exceptions and abuse | Exception: an expired or tampered sign-in link: a calm message, nothing created |  | planned |
| 179. S23-06 | Exceptions and abuse | Exception: a payment webhook arrives twice and out of order: one fulfilment |  | planned |
| 180. S23-07 | Exceptions and abuse | Exception: the organizer's clock is wrong by an hour: the game still starts on the public clock |  | planned |
| 181. S23-08 | Exceptions and abuse | Exception: a phone with JavaScript blocked or an old browser: a readable message, no blank page |  | planned |
| 182. S23-09 | Exceptions and abuse | Exception: 250 people join in one minute from one office network: all get seats, none blocked |  | planned |
| 183. S23-10 | Exceptions and abuse | Exception: the organizer deletes a person mid-game who already won a prize: the prize record stays, the phone is told |  | planned |

Total: 183 use cases listed (170 scenario files on disk or in the last run, 13 planned lines, several of which stand for 5 to 8 scenarios each).

## Unit-level use cases (not in Chrome)

- `bun test packages apps/edge`: about 1,940 checks of the game rules, prizes, ties, the store, payments, deletion and the AI link.
- `bun test apps/web`: about 430 checks of every page in a page harness (console, phone, pay, partner, help desk, guided errors).
