# Changes of 2026-10-23: one way in (e-mail), stay signed in, both roles, demo choice, auto-refresh

Owner's asks, and what was done. Everything was built and tested on the local test copy (C:\ct\test-sites) first.

1. **Free demo game is the first choice** in both size lists on the home page ("Free demo game (up to 10 participants)"). 250 stays selected by default. Choosing it changes the button to "Start your free demo game"; the process is the same (sign in, then the draft).
2. **One way in: the e-mail.** The e-mail has exactly two ways to use it:
   - Option 1: type the 6-digit number in the six boxes and press Submit.
   - Option 2: tap the **Sign me in** button in the e-mail.
   The sign-in screen, the e-mail, the one-tap page and the Refer & earn page all say this in the same words. The pasted "sign-in key" box and the Google button are gone from the pages. Hosts now get the same e-mail (code + one tap).
3. **Stay signed in, forever, until Sign out** (Organizer, Host, Co-host, Refer & earn partner). Signing in on a new phone or after Sign out is the same e-mail process; there is no password and nothing to remember. A "Sign out" button is in the console bar. Storage note updated (Privacy page, storage-registry.json).
4. **Auto-refresh**: `autoupdate.js` checks /version.json every 45 s and when the page comes to the front; a new version clears the saved copy and reloads (never while the person is typing, never twice for the same version).
5. **The page says who is signed in**: "Signed in as Organizer / Host / Co-host", and the home page's top link says it too.
6. **Organizer: all games always listed** ("Your games"), open any, or start a new one.
7. **Host: all games listed**, and "Start a new game as an Organizer" (same e-mail, Terms box, no new sign-in). A person who is both holds both keys and switches with one button ("Switch to Host view / Organizer view").
8. **Participant ticket page**: "Create a new game as an organizer".
9. **Refer & earn partners sign in by e-mail** (same two options), each phone/laptop gets its own key.
10. Number screen (/big) before publishing: plain message, no error report.
