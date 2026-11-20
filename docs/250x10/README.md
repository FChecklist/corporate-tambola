# 250 players x 10 games

- `RESULTS.md`: the result of the ten games, one table per game (written by `bun run tools/game250/report.ts` from `data/`), followed by the failure points found, their causes and fixes.
- `FINDINGS.md`: the failure points on their own (it is also the last part of `RESULTS.md`).
- `data/game01.json` to `game10.json`: the raw record of each game on the FIXED code (what the tables are made from).
- `data-before-fixes/`: the same games on the code BEFORE the three fixes. Read `game04.json` (`extra.grind`: the Host picked a number, status 200), `game08.json` (`extra.reportNames`: "21th Early Five") and any game's `extra.retention` / the failing "365 days later" check. `game07-before-freshness.json` is game 7 after the ordinal / retention fixes but before the freshness fix: its pause list shows the backdated Resume accepted.
- Code: `tools/game250/` (`lib.ts` world, phones, organizer and Host helpers; `engine.ts` loop and fairness probes; `games.ts` common checks; `all.ts` the ten games; `run.ts` runner; `report.ts` writer).
- Run one game: `bun run tools/game250/run.ts 4`. All ten: `bun run tools/game250/run.ts all` (game 8 takes about 10 minutes, the others under 90 seconds each; four runs can go side by side on four cores).

Safety: nothing here opens a network connection or a real payment; the Worker runs in-process on an in-memory database, the beacon is a fake, and mail stops in the `outbox` table (game 9 uses a stand-in for the mail provider and restores the real `fetch` afterwards).
