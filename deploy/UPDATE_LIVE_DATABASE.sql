-- ONE FILE to bring the live database up to date (owner order 2026-10-09). Safe to run more than once.
-- Corporate Tambola's live database is Cloudflare D1 (database "corporate-tambola"), not Supabase; this is the file for it.
-- Apply (from C:\ct\tambola\pages, with the D1 token in CLOUDFLARE_API_TOKEN):
--   bun x wrangler@3 d1 execute corporate-tambola --remote --file ..\deploy\UPDATE_LIVE_DATABASE.sql
-- Then deploy the site (docs/dev/10-OPERATIONS.md). Apply this file BEFORE the deploy.
-- Already live before this file: 0001 to 0018. This file = 0019 (legal_party) + its back-fill.

-- 0019: permanent record of who paid and the organizer's invoice details (name, e-mail, mobile) for every paid game.
CREATE TABLE IF NOT EXISTS legal_party (eid TEXT PRIMARY KEY, org TEXT, organizer_name TEXT, organizer_email TEXT, organizer_phone TEXT, payer_name TEXT, payer_org TEXT, payer_email TEXT, payer_phone TEXT, payer_country TEXT, payer_tax_id TEXT, payment_ids TEXT, kept_ms INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS legal_party_org ON legal_party (org);

-- Back-fill: one permanent record for every game that already has a paid payment (the mobile number confirmed at Publish is copied by the app just before the game is deleted).
INSERT OR IGNORE INTO legal_party(eid,org,organizer_name,organizer_email,payer_name,payer_org,payer_email,payer_country,payer_tax_id,payment_ids,kept_ms)
SELECT p.eid, p.org, json_extract(p.meta,'$.name'), p.email, json_extract(p.meta,'$.name'), json_extract(p.meta,'$.org'), p.email, json_extract(p.meta,'$.country'), json_extract(p.meta,'$.taxId'), p.id, CAST(strftime('%s','now') AS INTEGER)*1000
FROM payment p WHERE p.eid IS NOT NULL AND p.status='paid' AND p.id=(SELECT MIN(q.id) FROM payment q WHERE q.eid=p.eid AND q.status='paid');
