# Lifecycle simulation gaps (tools/sim2/scenarios/life)

Fixed 2026-10-09: LIFE-02 (a draft with a start time was kept 365 days; now forgotten after 30 days unless published), LIFE-05 (a game paid wholly from credit earned a second commission row), LIFE-06 (credit applied to a game that closed as "did not start" or was forgotten stayed locked; now restored), LIFE-07 (cancel mail promised "credit until" a date already past), LIFE-08 (game made smaller after credit was applied kept the excess; now partly restored).

Still open (documented, not fixed):
- LIFE-01: the "payment pending" reminder (unpaid game within 36 h) is only sent when the Organizer's console asks, not by the scheduled job alone.
- LIFE-03: the day-365 deletion instant. The code deletes at the first IST midnight after end+365 days; the scenario expects 23:59:59 IST of that day to still keep it. Owner/wording decision needed (privacy text names the date).
- LIFE-04: payment, invoice and entitlement rows are deleted with the engagement at day 365; docs/RETENTION.md says invoices are kept for the law. Needs the owner's CA to decide.
