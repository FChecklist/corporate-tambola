# Failure scenarios found (who / when / how / why)

| Scenario | Whose fault | When | How | Why it works |
|---|---|---|---|---|
| Forged winner | any participant (or someone with the link who joined) | after start+2 min, once seats are public | read /seats, POST /vote as 3 other ticket ids naming self | votes need only a public ticket id (F-01) |
| Platform-wide "busy" | any anonymous address | any time | loop identical vote/claim/over posts | each costs shared write budget even if duplicate (F-03) |
| Double charge / dead invoice link | organizer (double click) or Razorpay timing | at payment | two orders or verify+webhook together | non-atomic fulfil (F-04) |
| Office cannot join | employer network (NAT) | start of game | 250 joins from one address | per-address limit 200/min (F-10) |
| Data kept for years | organizer | at creation | start time in 2100 | no horizon limit (F-08) |
| Announcement not delivered | organizer | game day | console never opened | key registered only by console (G4) |
| Wrong game time | organizer's AI | scheduling | date without zone / 30 Feb | lenient Date.parse (F-06) |
Reproductions: tests/e2e/timetravel/*.test.ts and tests/e2e/0*.spec.ts.
