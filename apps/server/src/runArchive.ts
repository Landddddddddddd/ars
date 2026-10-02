import { db } from './db.js';
import type { Run } from './runStore.js';

// Durable archive of finished runs, on top of the in-memory RunStore.
// Runs are written once, when they reach a terminal state (done/error);
// listing/reading falls back to this table so history survives restarts.

export interface RunSummary {
  id: string;
  topic: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  // 'live' = still in the in-memory store (may still be running);
  // 'archived' = terminal snapshot loaded from SQLite.
  source: 'live' | 'archived';
}

interface RunRow {
  id: string;
  user_id: string;
  topic: string;
  status: string;
  events: string;
  created_at: number;
  updated_at: number;
}

/** Persist (or replace) the terminal snapshot of a run. Fire-and-forget safe. */
export function archiveRun(run: Run): void {
  try {
    db.prepare(
      `INSERT INTO runs (id, user_id, topic, status, events, created_at, updated_at)
       VALUES (@id, @user_id, @topic, @status, @events, @created_at, @updated_at)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         events = excluded.events,
         updated_at = excluded.updated_at`,
    ).run({
      id: run.id,
      user_id: run.userId,
      topic: run.topic,
      status: run.status,
      events: JSON.stringify(run.events),
      created_at: run.events[0]?.ts ?? Date.now(),
      updated_at: run.events[run.events.length - 1]?.ts ?? Date.now(),
    });
  } catch {
    /* archiving must never break event delivery */
  }
}

/** Recent runs for a user: archived terminal runs (newest first). Optional
 *  case-insensitive substring search on the topic. */
export function listArchivedRuns(userId: string, limit = 50, query?: string): RunSummary[] {
  const q = (query ?? '').trim();
  const sql =
    `SELECT id, topic, status, created_at, updated_at FROM runs WHERE user_id = ?` +
    (q ? ` AND LOWER(topic) LIKE LOWER(?)` : ``) +
    ` ORDER BY updated_at DESC LIMIT ?`;
  const stmt = db.prepare(sql);
  const rows = (q ? stmt.all(userId, `%${q}%`, limit) : stmt.all(userId, limit)) as Omit<
    RunRow,
    'events' | 'user_id'
  >[];
  return rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    source: 'archived' as const,
  }));
}

/** Delete an archived run. Returns true when a row was actually removed. */
export function deleteArchivedRun(id: string, userId: string): boolean {
  const res = db.prepare(`DELETE FROM runs WHERE id = ? AND user_id = ?`).run(id, userId);
  return res.changes > 0;
}

/** Full archived run (events included) or undefined. */
export function getArchivedRun(
  id: string,
  userId: string,
): { id: string; topic: string; status: string; events: unknown[] } | undefined {
  const row = db
    .prepare(`SELECT * FROM runs WHERE id = ? AND user_id = ?`)
    .get(id, userId) as RunRow | undefined;
  if (!row) return undefined;
  let events: unknown[] = [];
  try {
    const parsed = JSON.parse(row.events);
    if (Array.isArray(parsed)) events = parsed;
  } catch {
    /* corrupted snapshot — return an empty replay rather than failing */
  }
  return {
    id: row.id,
    topic: row.topic,
    status: row.status,
    events,
  };
}
