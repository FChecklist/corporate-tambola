import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDb(path: string): Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizers (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, org_name TEXT, country TEXT, tax_id TEXT,
      verified_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, organizer_id TEXT NOT NULL, engagement_code TEXT, pack INTEGER, currency TEXT,
      total REAL, tax REAL, status TEXT, created_at INTEGER NOT NULL, upgrade_of TEXT
    );
    CREATE TABLE IF NOT EXISTS email_codes (
      email TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS tokens (
      hash TEXT PRIMARY KEY, organizer_id TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS engagements (
      code TEXT PRIMARY KEY, organizer_id TEXT NOT NULL, pack INTEGER, currency TEXT,
      state_json TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    -- Kept for reuse (owner decision: every number uploaded or joined, 365 days). Never holds tickets, phones, claims or logs.
    CREATE TABLE IF NOT EXISTS contacts (
      organizer_id TEXT NOT NULL, e164 TEXT NOT NULL, name TEXT, info TEXT,
      first_seen INTEGER NOT NULL, last_used INTEGER NOT NULL, expires_at INTEGER NOT NULL,
      PRIMARY KEY (organizer_id, e164)
    );
    CREATE TABLE IF NOT EXISTS engagement_people (
      engagement_code TEXT NOT NULL, organizer_id TEXT NOT NULL, e164 TEXT NOT NULL, name TEXT, info TEXT,
      role TEXT, kind TEXT, cap INTEGER, joined INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL,
      PRIMARY KEY (engagement_code, e164)
    );
    -- No personal data: counts only. Survives the people expiring.
    CREATE TABLE IF NOT EXISTS engagement_history (
      code TEXT PRIMARY KEY, organizer_id TEXT NOT NULL, name TEXT, org_name TEXT, held_at INTEGER,
      started_at INTEGER, ended_at INTEGER, total INTEGER, participated INTEGER, family INTEGER,
      team_leads INTEGER, hosts INTEGER, people_expires_at INTEGER
    );
    -- A person who asked us not to keep their details. Stores a hash only, never the number.
    CREATE TABLE IF NOT EXISTS optouts (
      organizer_id TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (organizer_id, hash)
    );
    CREATE TABLE IF NOT EXISTS mail_sent (
      code TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (code, kind)
    );
    -- Signed organizer control log (pause/resume/extend/stop) for the phone-only mode. Public by design: signed messages, no personal data.
    CREATE TABLE IF NOT EXISTS control_kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS summaries (
      code TEXT PRIMARY KEY, organizer_id TEXT NOT NULL, json TEXT NOT NULL
    );
  `);
  return db;
}

export const sha256 = (s: string): string => new Bun.CryptoHasher("sha256").update(s).digest("hex");
