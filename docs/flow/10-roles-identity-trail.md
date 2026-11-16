# Roles, identity and the trail (owner decisions, 2026-10-27)

Status: DESIGN ONLY, nothing built. Owner decisions, in his words condensed.

1. Identity is the e-mail for exactly three roles: Organizer, Host, Co-host. E-mail is a must for all three. Sign-in is one e-mail that carries a 6-digit code and a one-tap link.
2. Participants have no account and no e-mail. Nothing server-side links a participant's games to each other.
3. Roles are per game, not per person. One person can be Organizer of several games, Host of others, Co-host of others, and a participant in others; each game many times.
4. Host and Co-host are assigned per game (by e-mail, accepted by one tap after signing in, removable, ends with the game). The old no-e-mail Co-host link is removed from the screens; links already issued keep working until their game ends.
5. All three roles get console access as per role (Organizer: whole game; Host: runs the game and sees what happened under their link/actions; Co-host: their own lists, invites and part).
6. All e-mails are kept 365 days and deleted at the end of the 365th day (midnight IST). Counted from the last game the e-mail took part in (to confirm with the owner: or from sign-up).
7. The trail: the chain of participants and invited-by-participant links to the e-mail account (helper id) of the Organizer / Host / Co-host it came through. Who approved, who accepted, who declined (waiting room and other approval options when open), with time. Kept 365 days WITHOUT any player name or mobile number: only the ticket (seat) number, the helper id, the action and the time. Players' names and mobile numbers are still deleted 20 hours after the game.
8. When a helper's e-mail is deleted at 365 days the trail keeps the action but no longer points to a person.
9. Open for a lawyer: whether a seat number kept for 365 days is personal data under DPDP / GDPR / US state laws; do not claim 'fully deleted' publicly until confirmed.
10. The same person in two roles in ONE game (Organizer who also plays, Host who also plays): allowed; whether they may win prizes is an open owner question.

Where it plugs in: `organizer_email`, `host_state`, `host_login`, `organizer_key (kind cohost, eid)`, `person`, `waiting`, the invite tree in the report, `audit_log`, `game_record`; the common console (console.corporatetambola.com) reads it per e-mail.
