-- Real housie (2026-10-22): a wrong claim (a Bogey) is recorded like a claim; two on the same house put that ticket out of it, on every phone alike. Apply BEFORE deploying the code that reads it.
CREATE TABLE IF NOT EXISTS bogey (id INTEGER PRIMARY KEY AUTOINCREMENT, eid TEXT NOT NULL, pid TEXT NOT NULL, pattern TEXT NOT NULL, round INTEGER NOT NULL DEFAULT 1, at_ms INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS bogey_eid ON bogey (eid, at_ms);
CREATE INDEX IF NOT EXISTS claim_eid_at ON claim (eid, at_ms);
