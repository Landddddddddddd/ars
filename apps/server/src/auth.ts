import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Context, Next } from 'hono';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { db, type UserRow } from './db.js';
import { SESSION_SECRET, SESSION_TTL_MS, COOKIE_SECURE } from './env.js';

const COOKIE_NAME = 'ars_session';

// ---- Users -----------------------------------------------------------------

const insertUser = db.prepare(
  `INSERT INTO users (id, email, password_hash, credits, email_verified, created_at)
   VALUES (@id, @email, @password_hash, @credits, @email_verified, @created_at)`,
);
const userByEmail = db.prepare(`SELECT * FROM users WHERE email = ?`);
const userById = db.prepare(`SELECT * FROM users WHERE id = ?`);

export function findUserByEmail(email: string): UserRow | undefined {
  return userByEmail.get(email.toLowerCase()) as UserRow | undefined;
}

export function findUserById(id: string): UserRow | undefined {
  return userById.get(id) as UserRow | undefined;
}

export interface CreatedUser {
  id: string;
  email: string;
}

export async function createUser(
  email: string,
  password: string,
  startingCredits: number,
  verified: boolean,
): Promise<CreatedUser> {
  const id = randomUUID();
  const password_hash = await bcrypt.hash(password, 10);
  insertUser.run({
    id,
    email: email.toLowerCase(),
    password_hash,
    credits: startingCredits,
    email_verified: verified ? 1 : 0,
    created_at: Date.now(),
  });
  return { id, email: email.toLowerCase() };
}

export function verifyPassword(user: UserRow, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}

// ---- Sessions --------------------------------------------------------------

const insertSession = db.prepare(
  `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
);
const sessionById = db.prepare(`SELECT * FROM sessions WHERE id = ?`);
const deleteSession = db.prepare(`DELETE FROM sessions WHERE id = ?`);

interface SessionRow {
  id: string;
  user_id: string;
  expires_at: number;
  created_at: number;
}

function createSession(userId: string): string {
  const id = randomUUID();
  const now = Date.now();
  insertSession.run(id, userId, now + SESSION_TTL_MS, now);
  return id;
}

/** Issue a session for `userId` and set the signed httpOnly cookie. */
export async function startSession(c: Context, userId: string): Promise<void> {
  const sid = createSession(userId);
  await setSignedCookie(c, COOKIE_NAME, sid, SESSION_SECRET, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** Clear the current session (cookie + DB row). */
export async function endSession(c: Context): Promise<void> {
  const sid = await getSignedCookie(c, SESSION_SECRET, COOKIE_NAME);
  if (sid) deleteSession.run(sid);
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}

async function resolveUser(c: Context): Promise<UserRow | null> {
  const sid = await getSignedCookie(c, SESSION_SECRET, COOKIE_NAME);
  if (!sid) return null;
  const session = sessionById.get(sid) as SessionRow | undefined;
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    deleteSession.run(sid);
    return null;
  }
  return (userById.get(session.user_id) as UserRow | undefined) ?? null;
}

// Hono context variable typing for the resolved user.
export type AuthVars = { user: UserRow };

/** Middleware: 401 unless a valid session resolves to a user. */
export async function requireAuth(c: Context, next: Next) {
  const user = await resolveUser(c);
  if (!user) return c.json({ error: '未登录' }, 401);
  c.set('user', user);
  await next();
}

/** Resolve the user without failing (for optional-auth routes like /me). */
export async function optionalUser(c: Context): Promise<UserRow | null> {
  return resolveUser(c);
}
