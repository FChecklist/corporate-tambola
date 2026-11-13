-- Set-up path (sign-in, create, publish): these three tables were looked up by organizer with no index, so every game set-up scanned them whole several times (13 Nov 2026, TARGET-99 Tambola plan).
-- Safe and quick (a few thousand rows); IF NOT EXISTS makes it repeatable; undo with DROP INDEX. Apply BEFORE or AFTER the code, either order works (the code reads the same rows with or without the index).
CREATE INDEX IF NOT EXISTS organizer_key_org ON organizer_key (org);
CREATE INDEX IF NOT EXISTS entitlement_org ON entitlement (org, eid);
CREATE INDEX IF NOT EXISTS engagement_org ON engagement (org);
