# Lifecycle simulation gaps (tools/sim2/scenarios/life)

Fixed 2026-10-09: LIFE-02 (a draft with a start time was kept 365 days; now forgotten after 30 days unless published), LIFE-05 (a game paid wholly from credit earned a second commission row), LIFE-06 (credit applied to a game that closed as "did not start" or was forgotten stayed locked; now restored), LIFE-07 (cancel mail promised "credit until" a date already past), LIFE-08 (game made smaller after credit was applied kept the excess; now partly restored).

Fixed since (checked 2026-10-09 by running the scenarios): LIFE-01 (the 36-hour "payment pending" reminder is sent by the scheduled job alone, L13 passes), LIFE-03 (the day-365 deletion is at 00:00 IST after day 365, 23:59:59 IST still keeps it, S05/S07 pass), LIFE-04 (payments, invoices and organizer invoice details are kept for ever, owner rule 2026-10-09).

Still open: none known.
