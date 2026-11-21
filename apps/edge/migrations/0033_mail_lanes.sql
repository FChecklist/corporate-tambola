-- Mail lanes (1.11.0, mail-lanes.ts): the send counter per lane, the state the mail service reports for each mail, the do-not-mail list (hard bounce, complaint), the waiting bulk mail.
-- ADDITIVE ONLY. Apply BEFORE deploying the code that reads it; the old code ignores these tables. Safe to repeat. test/migrations.test.ts keeps this identical to MAIL_LANES_SCHEMA.
-- Retention (docs/RETENTION.md): mail_count 100 days (numbers only); mail_track 3 days (hash of the address + subject); mail_suppress 365 days (hash + masked form); mail_bulk_queue 24 hours (address and body).
CREATE TABLE IF NOT EXISTS mail_count (day TEXT NOT NULL, lane TEXT NOT NULL, provider TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, lane, provider));
CREATE TABLE IF NOT EXISTS mail_track (ref TEXT PRIMARY KEY, at_ms INTEGER NOT NULL, to_hash TEXT NOT NULL, subject TEXT, lane TEXT NOT NULL, state TEXT NOT NULL, rank INTEGER NOT NULL, state_ms INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS mail_track_at ON mail_track (at_ms);
CREATE TABLE IF NOT EXISTS mail_suppress (to_hash TEXT PRIMARY KEY, to_mask TEXT, reason TEXT NOT NULL, at_ms INTEGER NOT NULL, ref TEXT);
CREATE TABLE IF NOT EXISTS mail_bulk_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, at_ms INTEGER NOT NULL, to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, html TEXT);
