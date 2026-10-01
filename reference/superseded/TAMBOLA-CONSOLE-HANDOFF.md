# Tambola Game Console — Build Handoff

**For:** the next build session (developer or AI coding agent)
**From:** Product owner (Rajat) + design session, 30 Sep 2026
**Status:** Product rules agreed. Clickable prototype done. No backend yet.
**Files handed over with this document:**

- `tambola-console-prototype.html`: a single-file clickable prototype of the Organizer, Host and Team Lead console. It is the **visual and behaviour reference**. All data in it is fake and in-memory.
- Live prototype: https://claude.ai/artifact/7sCiUw5bbxyvae7kfFnkHX (private to the owner).

> Read sections 1–4 before writing any code. They are the product rules. Everything after that is the spec that implements them.

---

## 1. What this product is

A web-only (mobile-friendly) **Tambola / Housie game platform for closed groups**: companies, housing societies (RWAs), clubs and large families. It works in any country.

The **Organizer** (usually HR or an event lead) sets up a game, adds the allowed mobile numbers, shares links, admits people and runs the game. Players join from their phones through a link. Nobody gets an SMS.

This handoff covers **only the console** (setup, people, links, admission, start/end, report). The live number-calling game screen and the player's ticket screen are out of scope here (see section 14).

## 2. Non-negotiable product rules

1. **We are software, not a gaming company.** No payments from players, no payment links, no wallets. All prizes come from the organizer. The platform only records, checks and reports.
2. **Players never pay.** Closed group only.
3. **No SMS and no OTP for players.** Access is controlled by the organizer's list, personal links (passes) and approval.
4. **One person = one mobile number = one entry per game.** The same number can never be in the same game twice.
5. **Personal data is deleted 24 hours after the game ends.** This covers mobile numbers, names and device bindings. Before deletion, the organizer copies the game report.
6. **Entry closes when the game starts.** No new joins, no new passes, no admissions after that.
7. **Mobile numbers never appear in URLs.** Links carry only random codes.
8. **Global from day one.** Accept numbers from every country and store them in E.164 format (`+919876543210`).
9. **Idiot-proof UI.** Choices are radio buttons, dropdowns and tick boxes. Typing is allowed only for names, mobile numbers and the game name.

## 3. Roles

User-facing names are fixed. **Do not call anyone "admin" or "co-admin" in the UI**, because that wording worries IT and HR teams.

| Role (UI name) | Who creates them | What they can do | What they cannot do |
|---|---|---|---|
| **Organizer** | Signs up. Verified once by work-email OTP or payment (the only verification in the system). | Everything: settings, upload numbers, make Hosts and Team Leads, set caps, admit/decline, start/end game, copy report | — |
| **Host** | Organizer | Admit/decline from the waiting room, make Team Leads, set Team Lead caps, change the **family limit** setting, resolve phone conflicts, share the game link | Upload numbers, make or edit Hosts, change other settings, start/end the game, see the report |
| **Team Lead** | Organizer or Host (from people on the list) | Create personal passes for colleagues (up to their cap) and for their own family (up to the family limit); cancel, resend and reissue their own passes | Admit people from the waiting room, change any setting |
| **Player** (on the list) | Organizer's upload | Join with the common link + their number; bring family (up to the family limit); invite colleagues only if the "regular players can invite" setting is on (those invites go to the waiting room) | — |
| **Invited colleague** | Team Lead pass | Play; bring family up to the family limit | Invite colleagues |
| **Family member** | Any player or Team Lead | Play | Invite anyone. Cannot be made Team Lead or Host |

**Invite depth rule:** chains stop quickly. Organizer → Team Lead → colleague → family, and nothing goes further. Family members never invite. Invited colleagues never invite colleagues.

## 4. How people get into a game

There are two entry routes and one fallback.

### 4.1 Common game link (for everyone on the Organizer's list)
- One link per game: `https://<domain>/g/<gameCode>`.
- The player opens it and types their mobile number (any format, with a country dropdown defaulting to the game's country).
- The server normalizes the number (section 7) and looks it up in the game's list:
  - **On the list and not yet claimed** → admitted. The number is bound to this device (section 8.3).
  - **On the list but already claimed by another device** → blocked. The player sees *"This number has already joined on another phone. Contact your organizer."* A **conflict alert** goes to the Organizer and Hosts (section 4.4).
  - **Not on the list** → a waiting-room form (name required, department/flat optional) → enters the **waiting room**.

### 4.2 Personal passes (for Team Lead invites, family invites, and Hosts/Team Leads themselves)
- The sender types the recipient's name, picks the country, types the number → the system creates a pass: `https://<domain>/p/<passCode>`.
- The sender shares it via a WhatsApp button that opens `wa.me/<recipient number>` with the message pre-filled, or via Copy.
- The recipient **does not type a number**. The pass already belongs to that number.
- The first device that opens the pass is bound to it. Any other device sees *"This pass is already in use. Ask the person who sent it."*
- The sender can **Cancel** an unused pass (frees the slot) or **Issue new pass** for someone who changed phones (old code dies, device binding resets).
- Team Lead colleague passes are **auto-admitted** because the Team Lead is trusted. Family passes are also auto-admitted.
- On first open, family members (and any pass recipient) tick a consent box: *"I agree to join. My number is deleted within 24 hours after the game."*

### 4.3 Waiting room (fallback, needs approval)
Filled by: people who used the common link but aren't on the list, and invites from regular players (when that setting is on).
Organizer or Host can **Admit selected**, **Admit everyone**, or **Decline selected** (with Undo). Each entry shows name, number, source ("Used the game link. Not on your list." / "Invited by Rahul Mehta") and how long ago.

### 4.4 Phone conflict alerts
When a claimed number or pass is opened on a second device, the Organizer/Host sees:
*"Second phone tried to join as Rahul Mehta (+91 98765 43210). The first phone is still playing."*
Buttons: **Keep first phone** (dismiss; second device stays blocked) or **Let new phone in** (rebind to the new device; the old device is logged out).

### 4.5 The player limit always wins
The Organizer sets a total **player limit**. Every entry path (upload, admit, pass creation) is refused once `places used` reaches the limit, whatever the individual caps allow.
**"Places used" = everyone on the list + every issued pass (sent or joined) + everyone admitted.** It excludes pending waiting-room entries and cancelled passes.

## 5. Settings (all set in the Organizer console)

| Setting | Control | Allowed values | Default | Who can change |
|---|---|---|---|---|
| Game name | Text | 1–60 chars | — | Organizer |
| Game date | Date picker | — | — | Organizer |
| Start time | Dropdown | 06:00–23:30 in 30-minute steps, shown in the viewer's local 12/24h format | 17:00 | Organizer |
| Most players' country | Dropdown (all countries, "Common" group on top: IN, AE, US, GB, SG, AU, CA, SA) | ISO-3166 alpha-2 | Guessed from browser locale/timezone, else IN | Organizer |
| Player limit | Dropdown | 50, 100, 250, 500, 1000, 2000, 5000 | 500 | Organizer. Cannot go below current places used |
| Family members each player can bring | Radio | None, 1, 2, 3, 4 | 2 | Organizer **and Host** |
| Can family members win prizes? | Radio | Yes / No, they play for fun | Yes | Organizer |
| Can regular players invite colleagues? | Radio | No, 1 each, 2 each, 3 each (invites go to the waiting room) | No | Organizer |
| Team Lead cap (per Team Lead) | Dropdown per person | 10, 25, 50, 100 colleagues | 25 | Organizer and Host |

All settings lock when the game starts.

Store the timezone of the game as the Organizer's IANA timezone at creation. Show every time to each viewer in their own local time.

## 6. Game lifecycle

```
draft ──(first save)──> open ──(Organizer: Start game)──> started ──(Organizer: End game)──> ended ──(+24h job)──> purged
```

- **open:** entry allowed. All console actions are available.
- **started:** entry closed. Joining, passes, admissions, uploads and settings are all disabled. The waiting room is frozen, and anyone still pending is shown "Entry closed".
- **ended:** the report is available to the Organizer. The deletion time is shown: `ended_at + 24h`.
- **purged:** all personal data is hard-deleted (section 9.4). Only an anonymous summary row remains.
- **Safety net:** if a game is never ended, auto-end it 12 hours after the scheduled start. (*Open decision, confirm with the owner.*)

**Start game** needs two ticks before the button enables:
1. "I have admitted everyone I want from the waiting room."
2. "I understand nobody can join after the game starts."

## 7. Mobile number handling (global)

Use **libphonenumber** (JS: `libphonenumber-js`, "max" metadata; server-side: the same library or Google's libphonenumber). Always store **E.164**.

### 7.1 Algorithm (matches the prototype's `normalize()`)
1. Trim. Remove spaces, `-`, `.`, `(`, `)`, `/`.
2. If it contains letters → reject: "Contains letters".
3. If it starts with `00` → replace it with `+` (international dialling prefix).
4. Count digits: fewer than 6 → "Too short"; more than 15 → "Too long".
5. If it starts with `+` → parse as international.
   Else → first try parsing as a **national number of the default country** (this handles a leading trunk `0`, e.g. `09876543210`). If that is invalid, try `+` + digits (handles `919876543210`, `447700900123`).
6. Accept only if `isValid()` is true. Store `number` (E.164).
7. Mark the number as **"format fixed"** if the E.164 result differs from the input after step 1. This is shown to the user as information, not as an error.

### 7.2 Required test cases (default country = IN)

| Input | Result |
|---|---|
| `98200 44556` | `+919820044556` (fixed) |
| `+91 99876 11223` | `+919987611223` |
| `09123456780` | `+919123456780` (fixed) |
| `0091 9988776655` | `+919988776655` (fixed) |
| `919812312312` | `+919812312312` (fixed) |
| `+65 9123 4567` | `+6591234567` |
| `+971 50 765 4321` | `+971507654321` |
| `12345` | rejected: Too short |
| `98765abc10` | rejected: Contains letters |
| Same number twice in one upload | second one → "Repeated in your list" |
| Number already in this game | → "Already in this game" |

### 7.3 Bulk upload parsing
- Accept paste, `.csv`, `.txt`, `.xlsx`, `.xls`. For Excel, read the first sheet **as raw values**, never as formatted text, so long numbers don't turn into `9.19E+11`.
- One person per row/line. Split cells on `, ; | TAB`. The phone is the cell with the most digits. The name is the remaining non-numeric text (optional).
- If the first line has no digits, treat it as a header and skip it. Later lines with no digits → "No number found".
- Show a check screen **before** anything is saved, with four counts: **Ready**, **Format fixed**, **Repeats removed**, **Need your attention**. Each has an expandable list with the reason per line.
- If adding would exceed the player limit → block with: "This adds N people, but only M places are left under your limit of L. Raise the player limit in step 1, or remove some names."
- The button reads **"Add N people to the game"**. Nothing is saved until it is pressed.

## 8. Security and privacy

### 8.1 Links
- `gameCode`: 7+ chars; `passCode`: 8+ chars. Use the alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no look-alike characters) and generate with a cryptographically secure random source.
- **Store only a hash (SHA-256) of each pass code.** The code itself is shown once at creation and can be regenerated with "Issue new pass".
- The Organizer, Host and Team Lead consoles are reached through their own **personal role links** (`/p/<code>` resolving to a role), bound to one device each, like players. The Organizer additionally has an email-verified login.

### 8.2 Rate limits
- Common link number entry: max 5 attempts per device per 10 minutes, then a 10-minute cool-down. This stops people guessing colleagues' numbers.
- Pass opens and waiting-room submissions: rate-limit per IP and per game.

### 8.3 Device binding
- On a successful claim, create a random `device_secret` and store it in an **httpOnly, Secure, SameSite=Lax cookie** scoped to the game. Keep a copy in localStorage as a fallback. Store only its hash server-side on the player row.
- Each request from the player checks the cookie against that hash. Any mismatch → the conflict flow (section 4.4).

### 8.4 Privacy (DPDP India / GDPR / others)
- Collect only name, mobile number and the invite relationship. No email for players, no location, no contacts access.
- Consent tick box on first open for anyone whose number was entered by someone else.
- Short privacy notice linked in the player join screen footer.
- The Organizer is the data controller for their list. We are the processor. Put this in the terms.
- Hard deletion after 24 hours (section 9.4). **Do not keep backups that hold player numbers longer than 7 days.** (*Confirm the backup policy with the owner.*)

## 9. Data model (Postgres / Supabase-friendly)

```sql
organizers (
  id uuid pk, email text unique not null, email_verified_at timestamptz,
  display_name text, created_at timestamptz default now()
)

games (
  id uuid pk, organizer_id uuid fk -> organizers,
  name text not null, starts_at timestamptz not null, timezone text not null,
  default_country char(2) not null,
  player_limit int not null check (player_limit in (50,100,250,500,1000,2000,5000)),
  family_limit int not null default 2 check (family_limit between 0 and 4),
  family_can_win boolean not null default true,
  player_invite_limit int not null default 0 check (player_invite_limit between 0 and 3),
  game_code_hash text unique not null,
  status text not null default 'open' check (status in ('open','started','ended','purged')),
  started_at timestamptz, ended_at timestamptz, purge_after timestamptz,
  created_at timestamptz default now()
)

participants (
  id uuid pk, game_id uuid fk -> games on delete cascade,
  name text, phone_e164 text not null,
  role text not null check (role in ('host','team_lead','player')),
  kind text check (kind in ('colleague','family')),        -- null = came from organizer list / waiting room
  team_lead_cap int check (team_lead_cap in (10,25,50,100)),
  source text not null check (source in ('list','pass','waiting_room')),
  invited_by uuid fk -> participants,                         -- null for list entries
  status text not null check (status in ('not_joined','pass_sent','joined')),
  pass_code_hash text unique,                                 -- personal link, if any
  device_secret_hash text,
  consent_at timestamptz, joined_at timestamptz,
  created_by_role text, created_by_id uuid,                   -- audit: who added/promoted
  created_at timestamptz default now(),
  unique (game_id, phone_e164)                                -- rule: 1 number per game
)

waiting_room (
  id uuid pk, game_id uuid fk on delete cascade,
  name text not null, extra_info text, phone_e164 text not null,
  source text not null check (source in ('common_link','player_invite')),
  invited_by uuid fk -> participants,
  device_secret_hash text,
  created_at timestamptz default now(),
  unique (game_id, phone_e164)
)

conflict_alerts (
  id uuid pk, game_id uuid fk on delete cascade, participant_id uuid fk on delete cascade,
  new_device_secret_hash text, created_at timestamptz default now(), resolved_at timestamptz,
  resolution text check (resolution in ('kept_first','moved_to_new'))
)

audit_log (   -- deleted with the game at purge
  id bigserial pk, game_id uuid fk on delete cascade, actor_id uuid, actor_role text,
  action text, detail jsonb, created_at timestamptz default now()
)

game_summaries (   -- survives purge, no personal data
  game_id uuid pk, organizer_id uuid, player_count int, family_count int,
  team_lead_count int, started_at timestamptz, ended_at timestamptz
)
```

Also enforce `phone_e164` uniqueness **across both** `participants` and `waiting_room` for a game (check in the service layer inside a transaction, or with a shared lookup table).

### 9.1 Derived counts
- `places_used` = participants where `status in ('not_joined','pass_sent','joined')` (cancelled passes are deleted rows).
- Team Lead colleague usage = participants where `invited_by = TL.id and kind = 'colleague'`.
- Family usage per person = participants where `invited_by = X.id and kind = 'family'`.

### 9.2 Row-level security (if Supabase)
- The Organizer sees everything for their games.
- A Host sees the participants and waiting room of their game. They cannot update `role = 'host'` rows or the games table, except `family_limit`.
- A Team Lead sees only rows where `invited_by = self`.
- Players see only their own row.
- Do all writes through server functions / edge functions that re-check role, game status, caps and limits. **Never trust the client.**

### 9.3 Removing people
Removing a participant also removes everyone they invited (cascade in the service layer). The UI offers **Undo** for 7 seconds, so apply a soft delete first and hard-delete when the undo window expires.

### 9.4 Purge job
Run every 15 minutes: for games where `status = 'ended' and now() > purge_after` (`ended_at + 24h`):
1. Write `game_summaries`.
2. Delete participants, waiting_room, conflict_alerts and audit_log for the game.
3. Set `games.status = 'purged'` and null out `name`.

It must be idempotent and logged, with no personal data in the logs.

## 10. API (suggested; REST or server actions)

| Method & path | Who | Does |
|---|---|---|
| `POST /games` | Organizer | Create game with settings |
| `PATCH /games/:id` | Organizer (Host: `family_limit` only) | Update settings; rejected if not `open`; `player_limit >= places_used` |
| `POST /games/:id/upload/check` | Organizer | Body: raw text or file → returns ready / fixed / duplicates / invalid (no save) |
| `POST /games/:id/upload/commit` | Organizer | Saves the checked list; re-validates the limit |
| `GET /games/:id/participants?filter=&q=` | Organizer, Host | List with filters: all, player, team_lead, host, joined, not_joined, pass_sent, family |
| `POST /games/:id/participants/bulk` | Organizer, Host | `{ids[], action: make_team_lead(cap) / make_host / make_player / remove}`; Host cannot `make_host` or touch hosts; family rows skipped for role changes |
| `PATCH /participants/:id` | Organizer, Host | Role / cap |
| `POST /participants/:id/link` | Organizer, Host | (Re)generate a personal role link for a Host or Team Lead |
| `POST /games/:id/passes` | Team Lead, any player (family only) | `{name, country, number, kind}` → validates caps, limit, uniqueness → returns pass URL once |
| `DELETE /passes/:id` | Creator | Cancel if not joined |
| `POST /passes/:id/reissue` | Creator | New code, clears device binding |
| `GET /j/g/:gameCode` / `POST /j/g/:gameCode/claim` | Public | Common-link join by number |
| `GET /j/p/:passCode` / `POST /j/p/:passCode/claim` | Public | Pass open + consent + device bind |
| `POST /j/g/:gameCode/request` | Public | Waiting-room request |
| `GET /games/:id/waiting-room` | Organizer, Host | List |
| `POST /games/:id/waiting-room/admit` / `decline` | Organizer, Host | `{ids[]}` or `{all:true}`; admit checks the limit |
| `POST /conflicts/:id/resolve` | Organizer, Host | `{resolution: kept_first / moved_to_new}` |
| `POST /games/:id/start` / `end` | Organizer | State transitions |
| `GET /games/:id/report` | Organizer, status `ended` only | Players, role, joined through, invited by, and later winners/tickets/call order |

Push live updates (waiting room, joined counts, conflicts) to the console with Supabase Realtime or websockets. **Polling every 5 seconds is acceptable for v1.**

## 11. UI specification

**The prototype is the source of truth for layout, wording and behaviour.** Match its copy exactly unless noted. Here is a summary so nothing is missed.

### 11.1 Global frame
- **Sticky top bar:** a small tambola-ticket motif (a 3×9 grid, 15 filled cells, marigold) + product title + one-line subtitle. In the prototype there is a "Viewing as: Organizer / Host / Team Lead" switch. **Remove this in production**: the role comes from the logged-in person's link.
- **Status strip:** game name, date/time in local time, a status pill ("Open for entry" / "Game in progress: entry closed" / "Game ended"), and counts for **Joined**, **Places used**, **Player limit**, **Waiting**.
- **Sections are numbered cards, because they are a real sequence.** The Host view drops step 2 and renumbers the rest.

### 11.2 Organizer view (steps)
1. **Set up the game**: the settings in section 5.
2. **Add mobile numbers**: radio "Paste a list / Upload Excel or CSV", a textarea or file input, a **Check numbers** button, the result chips and lists, then **Add N people to the game**. Help line: *"Paste or upload in any format: 98765 43210, +91 98765 43210, 09876543210, 0091 98765 43210, +44 7700 900123. We fix the format and remove repeats."*
3. **People and roles**: search box, a "Show" filter dropdown, and a bulk bar ("N selected" + one dropdown: *Make Team Lead: 10 / 25 / 50 / 100 invites, Make Host, Make regular player, Remove from game* + **Apply**). Table columns: select, Name (+ how they joined), Mobile (international format, monospace), Role (dropdown), Can bring in (cap dropdown with "N used" for Team Leads; "Helps run the game" for Hosts; "Family: up to N" for players; "Cannot invite" for family), Status pill, Their link (**Copy** + **WhatsApp** for Hosts, Team Leads and pass holders; "Uses game link" for list players).
4. **Share the game link**: the link in a dashed box, **Copy link**, **Share on WhatsApp** (`wa.me/?text=`), **Copy message for email**, an editable message, and a QR code (always dark on white).
5. **Waiting room**: conflict alerts on top, then Select all + **Admit selected / Admit everyone / Decline selected**, then the list.
6. **Start the game**: two tick boxes → **Start game now**; then **End game**.
7. **After the game**: before the game ends, a placeholder explaining the report. After it ends: the deletion date and time, **Copy report (for Excel)** (tab-separated, pastes straight into Excel), and the report table.

### 11.3 Host view
Same as the Organizer view, minus step 2 and the report. Settings are read-only except the family limit. "Make Host" is hidden. Host rows can't be edited. Start/End are replaced by *"Only the Organizer can start or end the game."*

### 11.4 Team Lead view
1. **"[First name], bring in your team"**: three meters (Colleague passes `used / cap`, Family passes `used / family limit`, Places left in the whole game). Then the form: radio "A colleague / My family member" (family disabled when full), Name, Country dropdown, Mobile number with a live hint (*"Pass will be for +91 98765 43210"* in green, or the error reason in red). Button: **Create pass**. On success, a result card with the link, **Send to [first name] on WhatsApp** (opens `wa.me/<their number>`) and **Copy link and message**, plus the note *"WhatsApp opens with the message ready. You press send."*
2. **Passes you created**: a list with name, number, type, and status pill (Pass sent / Joined). Actions: *Resend on WhatsApp, Copy, Cancel pass* (if not joined) or *Changed phone? New pass* (if joined).
- Blocking messages replace the hint: game started / game full / "You have used all N colleague passes. Ask the organizer for more."

### 11.5 Player join screens (not in the prototype; build them in the same style)
- **Common link:** game name + time → Country dropdown + mobile field → **Join game**. The not-on-list form: name, "Department or flat (optional)" → **Ask to join**. Then the waiting screen: *"Your request is with the organizer. Keep this page open."*
- **Pass link:** *"Hi Karan, this is your pass for Diwali Housie 2026"* → consent tick box → **Join game**.
- **Error screens:** "Already in use on another phone", "This pass was cancelled", "Entry is closed. The game has started", "The game is full".

### 11.6 Interaction rules
- **No browser `alert/confirm/prompt`.** Confirmations are in-page tick boxes. Destructive actions offer **Undo** in a toast (7 seconds).
- The toast is bottom-centre and announced to screen readers (`aria-live="polite"`).
- Every control has a label. Focus rings are visible. Tap targets are ≥ 40px on mobile.
- Tables scroll sideways inside their own box on phones. The page itself never scrolls sideways.
- All numbers are shown in international format (`+91 98765 43210`) in the monospace face.

## 12. Design system (from the prototype)

### 12.1 Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F4F6F3` | `#0E1412` | Page background |
| `--surface` | `#FFFFFF` | `#161F1C` | Cards, inputs |
| `--sunk` | `#EDF1EE` | `#111916` | Table headers, info boxes, disabled |
| `--ink` | `#14211E` | `#E6EEEA` | Text |
| `--muted` | `#56665F` | `#9AADA5` | Secondary text |
| `--line` | `#D5DDD8` | `#2A3833` | Borders |
| `--accent` | `#0E6857` | `#43B89F` | Primary buttons, selected choices, links |
| `--accent-soft` | `#DCEFE9` | `#17332C` | Selected backgrounds, bulk bar |
| `--on-accent` | `#FFFFFF` | `#06120F` | Text on accent |
| `--marigold` | `#D9920B` | `#F0B53D` | Brand motif, focus ring |
| `--marigold-soft` | `#FBEFD3` | `#3A2D10` | Motif background |
| `--good` / `--good-soft` | `#1B7A4A` / `#DDF2E6` | `#52C68D` / `#12301F` | Joined, ready |
| `--warn` / `--warn-soft` | `#9A6400` / `#FBEFD3` | `#E6AE4E` / `#352812` | Alerts, game in progress |
| `--bad` / `--bad-soft` | `#B42318` / `#FBE3E0` | `#F2766C` / `#3A1715` | Errors, decline, remove |

Support light and dark themes (follow the system setting). Never hard-code a colour outside these tokens. The QR code is the only exception: always `#14211E` on white.

### 12.2 Type
- **Display:** Bricolage Grotesque 600/700 (headings, game name)
- **Body:** Figtree 400/500/600/700 (everything else, 15px base, line-height 1.5)
- **Data:** JetBrains Mono 500 (mobile numbers, counts, links), with tabular numerals
- Scale: h1 1.45rem, h2 1.2rem, h3 1rem, small .86rem, labels .9rem/600, uppercase micro-labels .76–.8rem with .05em letter-spacing.

### 12.3 Components
- **Choice chips** (radios): bordered 8px-radius tiles. Selected = accent border + accent-soft fill + accent text.
- **Buttons:** primary (accent fill), default (surface + line border), danger (bad text + border), small size `sm`. Radius 8px.
- **Status pills:** rounded, with a coloured dot: Joined/Open (good), Pass sent (accent), Not joined (muted), In progress (warn), Ended/Cancelled (bad).
- **Cards/panels:** 10px radius, 1px line border, 20px padding (16px on phone), a numbered circular step badge.
- **Meters:** label, big mono number `used / total`, 8px progress bar.
- **Link box:** mono text, sunk background, dashed accent border, select-all on click.
- Layout: single column, max width 1040px, 16px side padding, 18px gap between sections. The settings grid uses `auto-fit, minmax(230px, 1fr)`.

## 13. Message templates (editable later; keep them short)

- **Game link (group):**
  `You're invited to {game} on {date, time}!\nJoin here from your phone: {gameLink}\nEntry closes when the game starts.`
- **Personal pass:**
  `Hi {name}, here is your personal pass for {game}: {passLink}\nIt works on one phone only, so please don't forward it.`
- **Team Lead link:**
  `Hi {name}, you are a Team Lead for {game}. Open your link to bring in up to {cap} colleagues: {link}\nPlease don't forward this link. It works on one phone only.`
- **Host link:**
  `Hi {name}, you are a Host for {game}. Open your link to help admit players: {link}\nPlease don't forward this link.`

WhatsApp: `https://wa.me/<E.164 without +>?text=<urlencoded>` for a person, `https://wa.me/?text=` for choosing a chat. Always offer **Copy** as well, because WhatsApp is not used everywhere (US: SMS/iMessage, China: WeChat, Japan: LINE).

Plan for translation: keep every UI string and template in one strings file from day one (English only for v1).

## 14. Out of scope for this handoff (separate specs)
- The live game: ticket generation (90-number, 3×9 tickets), number calling, claim buttons (early five, lines, full house), winner verification screen.
- Organizer sign-up, email OTP and billing (pricing not decided).
- Languages other than English.
- Channel partner / reseller portal (planned 50/50 revenue split).

## 15. Open decisions (ask the owner before building these)
1. Auto-end a game that was never ended: 12 hours after the scheduled start?
2. Backup retention for personal data (proposed: 7 days maximum).
3. Should players on the list be able to bring family through their own join screen in v1, or only Team Leads? (The prototype assumes all players can, up to the family limit.)
4. Winner verification step: "Verify winner" button on the Organizer screen with an identity-checked tick box. Needed in v1?
5. The first markets for "global": the 90-number Tambola/Housie game fits India, the Gulf, the UK and Australia. The US plays 75-number bingo.

## 16. Acceptance checklist (v1 console is done when all pass)
- [ ] Every test case in section 7.2 passes, server-side as well as client-side.
- [ ] Upload of a 2,000-row Excel file with mixed formats finishes the check step in under 3 seconds.
- [ ] No endpoint or URL ever contains a raw mobile number.
- [ ] The same number cannot be added twice to a game through any path (upload, pass, waiting room, admit).
- [ ] Player limit refuses the entry that would exceed it, on every path, including concurrent requests (test with parallel admits).
- [ ] A Team Lead cannot exceed their cap. A person cannot exceed the family limit. Family and invited colleagues cannot invite colleagues.
- [ ] A Host cannot create or edit Hosts, upload numbers, change non-family settings, start/end the game or see the report (check server-side, not just the hidden UI).
- [ ] A second device opening a claimed pass or number is blocked and raises a conflict alert. "Let new phone in" logs out the old device.
- [ ] After Start: every entry path returns "Entry is closed" and all console write actions are disabled.
- [ ] After End + 24 hours: no personal data remains anywhere in the database; the summary row exists.
- [ ] Works on a 360px-wide phone and a desktop, in light and dark mode, with keyboard-only use.
- [ ] No `alert()` / `confirm()` / `prompt()` anywhere. Destructive actions have Undo.

## 17. Notes on the prototype code
- Written as plain HTML + CSS + vanilla JS in one file. Treat it as a reference, not production code. Rebuild it in the target stack (e.g. Next.js + Supabase on Vercel) using the components and tokens above.
- Functions worth porting almost directly: `normalize()`, `splitLine()`, `runCheck()` (the bulk check), the caps/limit checks in `renderTL()` and `admit()`, and `fmt()`.
- In the prototype, links point to the placeholder domain `play.yourgame.example`. Replace it with the real domain.
- The prototype loads `libphonenumber-js@1.11.4` (max bundle) from jsDelivr, `xlsx@0.18.5` and `qrcodejs@1.0.0` from cdnjs. In production, bundle these as npm dependencies.
