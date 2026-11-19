// V2 (13 Nov 2026) additive schema. A LEAF file: it imports nothing, so worker.ts can spread it into SCHEMA without an import cycle.
// The same text is in migrations/0032_v2_changes.sql (apps/edge/test/migrations.test.ts keeps the two identical). Nothing existing is changed or dropped.
export const V2_SCHEMA: string[] = [
  // a key made for ONE game (scope_kind 'gm' = a game master key, 'lh' = a Host key made without personal data); scope_src = the game it was cloned from (a new game's key may fetch that game's people)
  `ALTER TABLE organizer_key ADD COLUMN scope_eid TEXT`,
  `ALTER TABLE organizer_key ADD COLUMN scope_src TEXT`,
  `ALTER TABLE organizer_key ADD COLUMN scope_kind TEXT`,
  // the label an AI call carries in the game's own audit trail ('AI' or 'AI: ChatGPT')
  `ALTER TABLE ai_audit ADD COLUMN label TEXT`,
  // certificates: a signed, hash-chained record per winning ticket and prize; NO name, mobile or e-mail is ever stored here
  `CREATE TABLE IF NOT EXISTS v2_cert (id TEXT PRIMARY KEY, eid TEXT NOT NULL, seq INTEGER NOT NULL, round INTEGER NOT NULL, pattern TEXT NOT NULL, ordinal INTEGER NOT NULL, ticket INTEGER NOT NULL, prize TEXT NOT NULL, issued_ms INTEGER NOT NULL, prev TEXT NOT NULL, hash TEXT NOT NULL, sig TEXT NOT NULL, UNIQUE (eid, seq), UNIQUE (eid, round, pattern, ordinal, ticket))`,
  // support tickets (an organizer, a game key or a Host raises; the owner answers)
  `CREATE TABLE IF NOT EXISTS v2_support (id INTEGER PRIMARY KEY AUTOINCREMENT, org TEXT NOT NULL, eid TEXT, role TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS v2_support_org ON v2_support (org)`,
  `CREATE TABLE IF NOT EXISTS v2_support_msg (id INTEGER PRIMARY KEY AUTOINCREMENT, tid INTEGER NOT NULL, who TEXT NOT NULL, body TEXT NOT NULL, at_ms INTEGER NOT NULL)`,
  // claim review by a Host (optional per game); removed with the participants' data
  `CREATE TABLE IF NOT EXISTS v2_claim_review (eid TEXT NOT NULL, round INTEGER NOT NULL, pattern TEXT NOT NULL, ticket INTEGER NOT NULL, decision TEXT NOT NULL, reason TEXT, by TEXT NOT NULL, at_ms INTEGER NOT NULL, PRIMARY KEY (eid, round, pattern, ticket))`,
  // small per-game switches (claim review on or off)
  `CREATE TABLE IF NOT EXISTS v2_flag (eid TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, PRIMARY KEY (eid, k))`,
  // a Host asks the organizer to hand the Host job to someone else
  `CREATE TABLE IF NOT EXISTS v2_handover (id INTEGER PRIMARY KEY AUTOINCREMENT, eid TEXT NOT NULL, org TEXT NOT NULL, host_id TEXT NOT NULL, label TEXT, note TEXT, state TEXT NOT NULL DEFAULT 'pending', created_ms INTEGER NOT NULL, decided_ms INTEGER)`,
  // things the organizer should be told (a Host stepped down, a hand-over was asked for)
  `CREATE TABLE IF NOT EXISTS v2_notice (id INTEGER PRIMARY KEY AUTOINCREMENT, org TEXT NOT NULL, eid TEXT, kind TEXT NOT NULL, text TEXT NOT NULL, at_ms INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS v2_notice_org ON v2_notice (org, id)`,
  `CREATE INDEX IF NOT EXISTS organizer_key_scope ON organizer_key (scope_eid)`,
];
