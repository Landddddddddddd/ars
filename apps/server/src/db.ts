import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// The project's first persistence layer. SQLite is a single file, synchronous,
// and transactional — ideal for money-handling on a solo/two-site deployment.
// IMPORTANT (deploy): DATABASE_PATH must live on a persistent disk (Render Disk /
// Docker volume), otherwise a redeploy wipes users & credits.
const DB_PATH = process.env.DATABASE_PATH || './data/ars.db';

function open(): Database.Database {
  if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export const db = open();

// Schema is created idempotently on boot (no separate migration tool for M1).
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    email          TEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    credits        INTEGER NOT NULL DEFAULT 0,
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  -- Audit trail of every credit movement. users.credits is the balance source of
  -- truth; ledger rows explain how it got there and enable idempotent refunds.
  CREATE TABLE IF NOT EXISTS ledger (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta         INTEGER NOT NULL,
    reason        TEXT NOT NULL,
    ref           TEXT,
    balance_after INTEGER NOT NULL,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id);
  CREATE INDEX IF NOT EXISTS idx_ledger_ref ON ledger(reason, ref);

  -- Payments are idempotent by (provider, provider_ref): a webhook that fires
  -- twice hits the UNIQUE constraint and is ignored, so credits are never doubled.
  CREATE TABLE IF NOT EXISTS payments (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider     TEXT NOT NULL,
    provider_ref TEXT NOT NULL,
    package_id   TEXT NOT NULL,
    credits      INTEGER NOT NULL,
    amount       INTEGER NOT NULL,
    currency     TEXT NOT NULL,
    status       TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    UNIQUE(provider, provider_ref)
  );
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
`);

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  credits: number;
  email_verified: number;
  created_at: number;
}
