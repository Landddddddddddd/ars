import { Hono } from 'hono';
import {
  createUser,
  findUserByEmail,
  verifyPassword,
  startSession,
  endSession,
  requireAuth,
  type AuthVars,
} from '../auth.js';
import { grant, publicUser } from '../credits.js';
import { SIGNUP_BONUS_CREDITS, REQUIRE_EMAIL_VERIFY } from '../env.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const authRoutes = new Hono<{ Variables: AuthVars }>();

authRoutes.post('/signup', async (c) => {
  const body = await c.req
    .json<{ email?: string; password?: string }>()
    .catch(() => ({}) as { email?: string; password?: string });
  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';

  if (!EMAIL_RE.test(email)) return c.json({ error: '邮箱格式不正确' }, 400);
  if (password.length < 8) return c.json({ error: '密码至少 8 位' }, 400);
  if (findUserByEmail(email)) return c.json({ error: '该邮箱已注册' }, 409);

  const verified = !REQUIRE_EMAIL_VERIFY; // M1: verification off by default
  const created = await createUser(email, password, 0, verified);
  if (SIGNUP_BONUS_CREDITS > 0) grant(created.id, SIGNUP_BONUS_CREDITS, 'signup.bonus', null);

  await startSession(c, created.id);
  const user = findUserByEmail(email)!;
  return c.json({ user: publicUser(user) }, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await c.req
    .json<{ email?: string; password?: string }>()
    .catch(() => ({}) as { email?: string; password?: string });
  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';

  const user = findUserByEmail(email);
  if (!user || !(await verifyPassword(user, password))) {
    return c.json({ error: '邮箱或密码错误' }, 401);
  }
  await startSession(c, user.id);
  return c.json({ user: publicUser(user) });
});

authRoutes.post('/logout', async (c) => {
  await endSession(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, (c) => {
  return c.json({ user: publicUser(c.get('user')) });
});
