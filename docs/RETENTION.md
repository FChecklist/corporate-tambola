# What we keep, and for how long

Everything is kept in one Cloudflare D1 database (table `kv` holds small keyed records). The daily housekeeping (`purgeOld`, run from the one-minute job and from the first organizer request each UTC day) enforces this schedule. Tests: `apps/edge/test/retention.test.ts`, `apps/edge/test/privacy.test.ts`.

| Data | Where | Kept | Then |
|---|---|---|---|
| Participant name and mobile number (sealed), seat, invitation record, tickets, votes, claims, working copies of the report | `participant`, `seat`, `claim`, `settled`, `rvote`, `rcand`, `overvote`, `kv seats-base/ rpt*` | 22 hours after the game ends | Deleted (`erasePersonal`). |
| A player's request to see, correct or delete their data (card id, kind, short note, times: no name, no number) | `data_request` | 22 hours after the game ends, with the participants | Deleted (`erasePersonal`); again with the game at 365 days |
| Winners record (seat, prize, round, time) | `winner` | 365 days after the game ends | Deleted with the engagement |
| Winner's prize hand-over details (name and number as confirmed, change trail, given date), sealed | `prize` | 365 days | Deleted with the engagement |
| Engagement, its settings, the end-of-game clock | `engagement`, `life`, `ctl_request`, `kv control/ contact/ pub/ ann/` | Until 00:00 IST at the end of day 365 after the game ended. An unpublished draft: 30 days | Deleted (`eraseEverything`) |
| Organizer account: sign-in keys, e-mail hash, sealed e-mail for our mails, sealed lasting AI key, terms version accepted | `organizer_key`, `organizer_email`, `kv orgmail/ aikey/`, `organizer_terms` | While the account exists | Deleted by "Close my organizer account" in the console (with every engagement and the AI audit trail) |
| E-mailed 24-hour AI keys | `organizer_key` (expires_ms) | Expire after 24 hours; row deleted 7 days later | Deleted by the sweep |
| Retired (revoked) keys | `organizer_key` | 90 days | Deleted by the sweep |
| Sign-in codes and one-click sign-in tokens (hash only) | `login_code` | 10 minutes; row deleted 1 day after it expires | Deleted by the sweep |
| Partner sign-up codes and e-mail deletion confirmation codes (hash only) | `kv penr/ delreq/` | 10 minutes (deletion codes 30 minutes); row deleted after 1 day | Deleted by the sweep |
| Report-link salt | `kv rptsalt/` | Until the engagement is deleted | Deleted with it |
| Network-address hashes for daily limits (sign-up count, bad sign-in tries, partner limits) | `kv start/ linkfail/ plim/ jlim/ jbm/` (join limits) | 2 days | Deleted by the sweep |
| "New place" records for AI keys (country, network prefix, program family) and the alert clock | `kv seen/ alert/` | While their key is live | Deleted by the sweep when the key is retired or expired |
| AI audit trail (time, key id, call, status, network address, program, country) | `ai_audit` | 365 days | Deleted |
| Mail outbox | `outbox` | A mail that was sent keeps no body. An unsent mail without a key: 3 days. An unsent mail with a link: no body at all | Deleted |
| Visits to the public pages (source, landing page, device, language, country and city, sections seen with time, choices made, exit page and section, first-party visitor id, shortened network address, keyed hash of the address, funnel step, organizer id once an account is made; never names or mobile numbers) | `visit_session`, `visit_event` | 365 days after the visit began | Rolled into anonymous per-day totals (`visit_agg`, kept), then deleted by the lifecycle tick. With Global Privacy Control or Do Not Track only the totals are kept |
| Daily write counters | `usage` | 90 days | Deleted by the sweep |
| Payments, invoices, entitlements | `payment`, `invoice`, `entitlement` | For ever, as the law requires (owner order 2026-10-09) | Never deleted by code (TEST-mode clean-up only removes test payments) |
| Organizer's invoice details (name, e-mail, mobile) and who paid (name, organisation, e-mail, mobile, country, GSTIN) | `legal_party` (a copy per paid game, written at payment and again just before the game is deleted), and the payment and invoice rows | For ever, as the law requires | Never deleted by code |
| Partner account (name, random code, hashes of phone and e-mail, key hash) and commissions | `partner`, `commission` | While the partner is active; commissions as accounting records | Partner row deleted by "Close my partner account"; commission rows stay without any link to a person |
| Ideas from organizers' AI assistants (no names or numbers) | `suggestion`, `suggestion_vote` | Until we remove them | Not deleted by code |

## Open (decisions, not code)

* Partner commission records (kept as accounting records). Payments, invoices, organizer invoice details and payer details are kept for ever by owner order.
* Whether the one-year log rule in DPDP Rule 6(1)(e) reaches any of the above. A lawyer must decide.
