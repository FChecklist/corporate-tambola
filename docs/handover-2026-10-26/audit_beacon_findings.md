### FINDING 20 [medium] Organizer console tries the relay last, with no timeout, so Next number / Pause hang on a network that drops drand traffic
File: packages/beacon/src/control-browser.ts line 30
Scenario: beaconRound() loops `[...MIRRORS, ...relay()]` one at a time with a bare fetch() (no AbortSignal). On an office network that silently drops traffic to the drand servers (the 'stalls at 0 of 90' case the release describes), each of the 4 direct fetches hangs until the browser's own connect timeout, and the relay is only reached after all four. TBControl.sign() awaits this before every message. In a Host-mode game the 'Next number' button (zc.js nextnum handler, no timeout) stays on 'pressing' and no number can be released. The Pause/Resume/Stop buttons give up after their 30 s race with a connection error. The same-origin relay is the one route guaranteed to work (the console page itself loaded from this site), yet it is the last one tried.
Suggested fix: In packages/beacon/src/control-browser.ts, change beaconRound() in three ways. Then rebuild control.js (`bun run build:control`).
1. Put the relay first: `[...relay(), ...MIRRORS]`. It is the one route that works wherever the console page loaded.
2. Give every fetch a short abort, about 3-4 s. Use an AbortController plus setTimeout rather than AbortSignal.timeout, because the file already supports older Safari and Firefox. The abort must also cover `r.json()`.
3. Better still, ask the relay and the mirrors in parallel and take the first valid answer (Promise.any-style, with a shared 4-5 s overall cap). The clock-computed round is the last resort only, since nextMessage documents that the round should come from the beacon, not a skewed device clock.

Optionally remember a mirror that failed or timed out in a module-level variable, so later presses skip it, as the phone runtime's `downUntil` does.

Separately, make the zc.js nextnum handler time out like the 30 s race on the Pause/Resume/Stop buttons, so S.pressing cannot stay set indefinitely.
Verifier's reasoning: The code does what the finding describes. In control-browser.ts, beaconRound() (lines 29-34) awaits `[...MIRRORS, ...relay()]` one at a time. Each call is a bare `fetch()` with no AbortSignal. The same-origin relay is last. TBControl.sign() (line 62) awaits this before every signed message, and publish() calls sign(). Nothing else bounds it:
- CSP connect-src in pages/build.mjs allows the four drand hosts, so the direct fetches really go out.
- blackbox.js and rum.js wrap window.fetch but add no timeout.
- The control.js bundle contains the same code, so the relay edit did ship.
- control-browser.ts says it is not unit-tested, and the console tests replace TBControl.sign with a stub. No test covers this path.

Nothing makes the 'Next number' handler (zc.js:1898-1907) give up. It sets S.pressing = true and awaits TBControl.publish(...) with no timeout, and a second press is ignored while pressing is true. The Pause, Resume and Stop buttons (zc.js:1911) race publish against a 30 s timer and show a connection error. The underlying publish keeps running in the background and can still land later.

I would not call it high, for these reasons:
1. It is not a regression. Before the release the same four un-timed fetches ran, then the code fell back to the device clock. The release only added the relay as a fifth, last source. The nextnum and ctl handlers are not in the diff.
2. It only bites a network that silently drops traffic to the drand hosts. A firewall that resets the connection, serves a block page, has DNS blocking, or has a proxy answering 403 fails fast, because `r.ok` is false or fetch throws, and then falls through to the relay quickly.
3. It is a delay, not a permanent block. After the four fetches give up, the relay is reached and the press succeeds. The finding's 'no number can be released' is overstated. The delay is at least the browser connect timeout, which I put at roughly 20-30 s per host on desktop Chrome, so about 1.5-2 minutes or more per press.
4. It affects Host-mode 'Next number' presses, Pause/Resume/Stop, and the confirm.js sign path.

It is still a real gap against the release's own claim. The 1.2.0 notes say a company firewall 'no longer stalls a game at 0 of 90 numbers'. The phone runtime handles this properly: parallel hedged requests, a 6 s timeout, and `downUntil` memory so blocked hosts are asked last. The organizer's signing helper does none of this and keeps no memory between presses, so every press repeats the full wait. A Host-mode organizer on the same blocked office network still has a game that effectively stalls. During a live game with real participants that is a stuck-organizer case.

### FINDING 21 [low] fetchBackfill ignores the new 'blocked mirror asked last' logic, so catching up on a blocked network costs ~24 s per batch
File: packages/beacon/src/game.ts line 295
Scenario: fetchBackfill() walks the mirror list in fixed order, one single-mirror fetchRound() at a time, until two mirrors agree. It never consults isDown() (index.ts) and the relay is the last entry. On a network that drops packets to the drand servers, each of the 4 direct probes waits the full default 6 s timeout, so 24 s pass before the relay is asked. The relay is only one answer (answers.length < 2), so the code then falls back to fetchLive(). phone-runtime.tick uses fetchBackfill for every round more than 2 behind and awaits all 8 in one Promise.all. A phone that was locked or backgrounded for a minute, or that joined late, therefore gets numbers in batches of 8 about 25 s apart, about as slow as the game itself. It stays far enough behind to miss claim windows. The 'asked last' fix only reaches fetchLive.
Suggested fix: Smallest change, in packages/beacon/src/index.ts and game.ts. Export `isDown` from index.ts, import it in game.ts, and in the `fetchBackfill` loop skip any mirror that is currently marked down. Check it on every iteration, not once up front, so marks set by concurrent rounds in the same batch count:

  const m = mirrors[(i + salt) % mirrors.length]!;
  if (isDown(m)) continue;

The existing `answers.length < 2` fallback then goes straight to `fetchLive`, which already asks the relay first. The first batch then costs about 6 s instead of 24 s, and later batches cost almost nothing. For the stall to stay short:
- Make the 'down' memory outlast a catch-up burst. Raise DOWN_FOR, or count it per tick instead of per request. At 8 or more requests per second, 40 requests is only a few seconds.
- Optionally add a re-entrancy guard around `rt.tick()` in the z.js `loop()`, so a slow tick does not stack up duplicate backfills.
- Optionally do not mark a mirror down when it was only aborted by `finish()` after another mirror won (index.ts, the `.catch` at line ~105).
Verifier's reasoning: The mechanism is real, but it is narrower than reported and is not a regression, so I rate it low instead of medium.

What the code does (274bde8):
- `fetchBackfill` (game.ts ~291-306) loops over `this.opts.mirrors ?? defaultMirrors()`. Production pages use `new ZG.RoundStore({})` and `beacon: {}` (z.js:69, big.js:12, zc.js:1423), so the list is the 4 drand hosts plus the relay, and the relay is last.
- Each iteration awaits a single-mirror `fetchRound(..., { mirrors: [one] })`. Reordering by `isDown` cannot do anything to a one-element list, and `isDown` is never read in game.ts. It is a non-exported const in index.ts.
- The default timeout is 6000 ms (index.ts:94), and nothing in production overrides it.
- If all 4 direct hosts silently drop packets, the loop spends 4 x 6 s = 24 s. The relay then gives only 1 answer, so `answers.length < 2` sends it to `fetchLive`, which does put the relay first. One batch therefore costs about 24 s plus a small amount.
- `tick()` (phone-runtime.ts:384) uses `fetchBackfill` for any round more than 2 behind. That covers a late joiner or a phone resuming after being locked. The 8 rounds in a batch run in one `Promise.all`.
- The finding's claim that the 'asked last' fix only reaches `fetchLive` is correct.

Why it is not worse:
- It only bites when the direct hosts hang. A fast failure (DNS block, reset, proxy block page) fails instantly. The relay-client test models the firewall as an immediate throw, and that case is fast.
- It is not a regression. The live version (fdf52e7) used a hardcoded list of the 4 direct hosts only, with no relay. On such a network backfill spent the same 24 s and then failed. Release 1.2.0 turns 'never works' into 'works slowly'. Live play (`now - br <= 2`) goes through `fetchLive` and is not affected.
- Catch-up still converges. Batches of 8 per ~25 s are faster than the game's one call per 6 s or longer.

What makes it worse than the finding says:
- z.js:843-844 runs `setInterval(loop, 1000)` with no re-entrancy guard (phone-runtime.ts:105 even admits ticks overlap).
- During a 25 s backfill, about 25 more ticks start. Each rebuilds the same `want` set, because the store is still empty, and launches its own sequential 5-probe chains, so one phone sends many duplicate requests.
- `askCount` rises by about 8 per second during catch-up. That also shortens the 40-request 'down' memory to a few seconds, so the 'asked last' benefit is partly lost.

The stalled tick delays `autoClaim`, but only for a phone that is already behind.

I did not run anything, per the brief. The timing is derived from the code.

### FINDING 22 [low] TBControl.sign() builds its sequence number from the 1-second shared copy of the pause file
File: packages/beacon/src/control-browser.ts line 59
Scenario: sharedRead() serves any GET of /api/z/<id>/control without an x-organizer or Authorization header from the Cache API for up to 1 s, and a publish does not purge it. sign() reads the file anonymously (`fetch(url, {cache:"no-store"})`, no auth header) and nextMessage() sets `seq = f.messages.length + 1`. In a live game phones keep the cache warm. A Host presses Next number and, within the same second, presses Pause or Stop. The second message is built from the old copy, reuses the same seq, and the server answers 409 'That sequence number is already used.', which the console shows raw. (The same stale copy is used by ensureKey at line 44 and the console's own read at zc.js:1412, but those self-heal on the next refresh.)
Suggested fix: Best root-cause fix: purge the shared copy on a successful write. In apps/edge/src/worker.ts, after `publishControl` succeeds in the POST handler (about line 1280), and after `registerKey` and `addHostKey` succeed, call `await (globalThis as any).caches?.default?.delete(new Request(req.url, { method: "GET" }))` inside a try/catch. This is the same key sharedRead uses. It fixes the console's own read (zc.js:1413), ensureKey and sign(), while other data centres stay within the designed 1 s.

Smallest client-only alternative: in control-browser.ts sign(), send `headers: hdr(a)` on the GET so it bypasses the share. The POST already sends that header with an empty token from confirm.js, so it is harmless. The cost is one extra audited request per press.

Also change the `ctlWords` text for "already used" to say plainly that this press did not go through and should be pressed again in a few seconds.
Verifier's reasoning: The defect is real, was introduced by 1.2.0, and has a narrow window with little impact.

What the code shows:
- **sharedRead is new in 1.2.0.** At fdf52e7 the control GET at worker.ts:1207 had no cache wrapper. At 274bde8 it is wrapped at worker.ts:1261 in `sharedRead(req, 1, ...)`.
- **The share keys on URL only and skips only authed calls.** sharedRead (worker.ts:234-243) bypasses the cache only if `x-organizer` or `authorization` is present. Otherwise it serves `cache.match(new Request(req.url))` for up to 1 s.
- **No purge on publish.** A grep of worker.ts finds `caches` only at lines 219, 235 and 1261. The POST handler (worker.ts:1273-1281) never calls `cache.delete`.
- **sign() reads anonymously.** control-browser.ts:59 does `fetch(url, {cache:"no-store"})` with no auth header. `cache:"no-store"` only controls the browser's own cache and does not stop the Worker's share. So sign() can get a copy up to 1 s old.
- **A stale copy gives a reused seq.** `nextMessage` (control.ts:433) uses `seq = f.messages.length + 1`. `publishControl` (control.ts:407) then answers 409 "That sequence number is already used." because the sig differs.
- **The cache is warm in a live game.** CONTROL_R2 is commented out in wrangler.toml, so phones poll `/api/z/<id>/control` through the Worker (phone-runtime.ts:320). The console (zc.js:1413) and the big screen (big.js:20) read the same URL anonymously.
- **No test covers it.** Worker tests run without `caches`, and control-browser.ts is not unit tested.

Why it is only low:
- **The window is under 1 s.** The host must send a second signed action within that time of the first action being accepted. For a human that is about 0.3 s on average.
- **It self-heals.** The 409 loses nothing and a second press a moment later works. Double-taps are already blocked by `S.pressing` and `S.ctlBusy`.

Corrections to the report:
- **The text is not always raw.** The Pause, Resume, Stop and Extend path (zc.js:1911) maps the 409 through `ctlWords` (zc.js:999) to "A press went through just before this one. Look at the buttons to see where the game is now." Only the Next path (zc.js:1904) shows the server text raw.
- **That mapped message misleads.** If the host's second press was an emergency Pause, it does not say the Pause failed or tell them to press again.
- **The ensureKey point is trivial.** A stale `pub` read at control-browser.ts:44 does not matter in practice.
- **Host-key lag is unreachable in practice.** The same stale copy could briefly hide a Host key just added, since sign() checks `f.hostKeys` at line 61. Nobody presses a control within 1 s of page load.

### FINDING 25 [low] SECRETS_NAMES.md lists JOIN_PER_IP_MINUTE and JOIN_PER_IP_DAY twice with conflicting 'where set'
File: C:\ct\test-sites\tambola\config\SECRETS_NAMES.md line 49
Scenario: Rows 45-46 say both names are 'wrangler var', which matches pages/wrangler.toml [vars] (600 and 20000). Rows 49-50 list the same two names again as 'Optional Pages variable' with different text. secrets-list.test.ts has no duplicate check, so it stays green. 1.2.0 did not add or change any env name, so the new code is consistent with this file and with wrangler.toml; the only inconsistency is this older duplicate. A reader cannot tell where to change the limit.
Suggested fix: Delete rows 49-50 and merge their wording into rows 45-46: "wrangler var; the Worker uses 200 per minute and 1,500 per day if unset". Optionally add a duplicate-name assertion to secrets-list.test.ts: collect the names from the table rows and expect no repeats.
Verifier's reasoning: The duplicate is real. config/SECRETS_NAMES.md lists JOIN_PER_IP_MINUTE and JOIN_PER_IP_DAY at rows 45-46 as "wrangler var" and again at rows 49-50 as "Optional Pages variable". pages/wrangler.toml [vars] sets them (lines 19-20, 600 and 20000), and the wrangler.toml comment says a name cannot be in both places. An owner who reads rows 49-50 and sets the limit in the Pages dashboard would not change the live limit, because wrangler.toml owns the name. The worker code (apps/edge/src/worker.ts line 388-391) reads env.JOIN_PER_IP_* and falls back to 1500/200, which matches the "default in code" text in rows 49-50. apps/edge/test/secrets-list.test.ts builds a Map keyed by name and only checks that every code name is listed, every row has 4 cells and no values, and every listed name is read somewhere. It has no duplicate check, so the file stays green.

It is documentation only, and it is not a 1.2.0 regression. `git diff fdf52e7 274bde8 -- config docs` is empty. Rows 49-50 date from commit 1a67a0e and rows 45-46 from 1.1.4 (01cd6bb). Nothing in the code or in any customer flow is affected, so this is cosmetic. The finding is accurate, but it should not block the release.
