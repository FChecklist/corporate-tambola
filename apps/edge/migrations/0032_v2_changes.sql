-- V2 (13 Nov 2026): game master keys, Host keys without personal data, AI label in the audit trail, certificates, support tickets, claim review, Host hand-over. ADDITIVE ONLY.
-- Apply BEFORE deploying the code that reads it. Nothing existing is changed or dropped; the old code ignores the new columns and tables. ALTER ... ADD COLUMN runs once (wrangler records it).
ALTER TABLE organizer_key ADD COLUMN scope_eid TEXT;
ALTER TABLE organizer_key ADD COLUMN scope_src TEXT;
ALTER TABLE organizer_key ADD COLUMN scope_kind TEXT;
ALTER TABLE ai_audit ADD COLUMN label TEXT;
CREATE TABLE IF NOT EXISTS v2_cert (id TEXT PRIMARY KEY, eid TEXT NOT NULL, seq INTEGER NOT NULL, round INTEGER NOT NULL, pattern TEXT NOT NULL, ordinal INTEGER NOT NULL, ticket INTEGER NOT NULL, prize TEXT NOT NULL, issued_ms INTEGER NOT NULL, prev TEXT NOT NULL, hash TEXT NOT NULL, sig TEXT NOT NULL, UNIQUE (eid, seq), UNIQUE (eid, round, pattern, ordinal, ticket));
CREATE TABLE IF NOT EXISTS v2_support (id INTEGER PRIMARY KEY AUTOINCREMENT, org TEXT NOT NULL, eid TEXT, role TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS v2_support_org ON v2_support (org);
CREATE TABLE IF NOT EXISTS v2_support_msg (id INTEGER PRIMARY KEY AUTOINCREMENT, tid INTEGER NOT NULL, who TEXT NOT NULL, body TEXT NOT NULL, at_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS v2_claim_review (eid TEXT NOT NULL, round INTEGER NOT NULL, pattern TEXT NOT NULL, ticket INTEGER NOT NULL, decision TEXT NOT NULL, reason TEXT, by TEXT NOT NULL, at_ms INTEGER NOT NULL, PRIMARY KEY (eid, round, pattern, ticket));
CREATE TABLE IF NOT EXISTS v2_flag (eid TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, PRIMARY KEY (eid, k));
CREATE TABLE IF NOT EXISTS v2_handover (id INTEGER PRIMARY KEY AUTOINCREMENT, eid TEXT NOT NULL, org TEXT NOT NULL, host_id TEXT NOT NULL, label TEXT, note TEXT, state TEXT NOT NULL DEFAULT 'pending', created_ms INTEGER NOT NULL, decided_ms INTEGER);
CREATE TABLE IF NOT EXISTS v2_notice (id INTEGER PRIMARY KEY AUTOINCREMENT, org TEXT NOT NULL, eid TEXT, kind TEXT NOT NULL, text TEXT NOT NULL, at_ms INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS v2_notice_org ON v2_notice (org, id);
CREATE INDEX IF NOT EXISTS organizer_key_scope ON organizer_key (scope_eid);
