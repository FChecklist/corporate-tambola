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
    CREATE TABLE IF NOT EXISTS summaries (
      code TEXT PRIMARY KEY, organizer_id TEXT NOT NULL, json TEXT NOT NULL
    );
  `);
  return db;
}

export const sha256 = (s: string): string => new Bun.CryptoHasher("sha256").update(s).digest("hex");
