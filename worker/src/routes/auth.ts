import { Hono } from 'hono';
import type { AuthUser, Env, UserRow } from '../types';
import { hashPassword, verifyPassword } from '../lib/password';
import { signJwt } from '../lib/jwt';
import { jsonError, jsonOk, newId } from '../lib/http';
import { SESSION_PREFIX, requireAuth, type AppEnv } from '../middleware/auth';

const app = new Hono<AppEnv>();

interface CredentialsBody {
  email?: unknown;
  password?: unknown;
  displayName?: unknown;
  timezone?: unknown;
}

function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return '密码不能为空';
  if (password.length < 8) return '密码至少 8 位';
  if (password.length > 128) return '密码过长';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return '密码需同时包含字母和数字';
  return null;
}

function publicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    timezone: row.timezone,
    dailyNewLimit: row.daily_new_limit,
    dailyReviewLimit: row.daily_review_limit,
    createdAt: row.created_at,
  };
}

async function issueSession(env: Env, user: Pick<UserRow, 'id' | 'email'>) {
  const jti = newId();
  const ttl = Number.parseInt(env.ACCESS_TOKEN_TTL || '604800', 10);
  const token = await signJwt(env.JWT_SECRET, {
    sub: user.id,
    email: user.email,
    jti,
    issuer: env.JWT_ISSUER,
    ttlSeconds: ttl,
  });
  await env.SESSIONS.put(`${SESSION_PREFIX}${jti}`, user.id, { expirationTtl: ttl });
  return { token, expiresIn: ttl, jti };
}

/** 注册 */
app.post('/register', async (c) => {
  const body = await c.req.json<CredentialsBody>().catch(() => ({}) as CredentialsBody);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return jsonError(c, 400, 'invalid_email', '请输入有效的邮箱地址');
  }
  const passwordError = validatePassword(body.password);
  if (passwordError) return jsonError(c, 400, 'invalid_password', passwordError);

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?1')
    .bind(email)
    .first<{ id: string }>();
  if (existing) return jsonError(c, 409, 'email_taken', '该邮箱已注册，请直接登录');

  const iterations = Number.parseInt(c.env.PBKDF2_ITERATIONS || '100000', 10);
  const passwordHash = await hashPassword(body.password as string, iterations);
  const id = newId();
  const timezone =
    typeof body.timezone === 'string' && body.timezone.length < 64
      ? body.timezone
      : c.env.DEFAULT_TZ || 'Asia/Shanghai';
  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim().slice(0, 32)
      : null;

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, timezone, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  )
    .bind(id, email, passwordHash, displayName, timezone, new Date().toISOString())
    .run();

  const user: UserRow = {
    id,
    email,
    password_hash: passwordHash,
    display_name: displayName,
    timezone,
    daily_new_limit: 10,
    daily_review_limit: 100,
    created_at: new Date().toISOString(),
    last_active_at: null,
  };

  const session = await issueSession(c.env, user);
  return jsonOk(c, { token: session.token, expiresIn: session.expiresIn, user: publicUser(user) }, 201);
});

/** 登录 */
app.post('/login', async (c) => {
  const body = await c.req.json<CredentialsBody>().catch(() => ({}) as CredentialsBody);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || typeof body.password !== 'string') {
    return jsonError(c, 400, 'invalid_credentials', '请输入邮箱和密码');
  }

  const row = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?1')
    .bind(email)
    .first<UserRow>();

  // 统一错误信息，避免邮箱枚举
  if (!row) return jsonError(c, 401, 'invalid_credentials', '邮箱或密码错误');

  const ok = await verifyPassword(body.password, row.password_hash);
  if (!ok) return jsonError(c, 401, 'invalid_credentials', '邮箱或密码错误');

  await c.env.DB.prepare('UPDATE users SET last_active_at = ?1 WHERE id = ?2')
    .bind(new Date().toISOString(), row.id)
    .run();

  const session = await issueSession(c.env, row);
  return jsonOk(c, { token: session.token, expiresIn: session.expiresIn, user: publicUser(row) });
});

/** 登出：删除 KV 会话，令牌立即失效 */
app.post('/logout', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  await c.env.SESSIONS.delete(`${SESSION_PREFIX}${user.jti}`);
  return jsonOk(c, { loggedOut: true });
});

/** 当前用户 */
app.get('/me', requireAuth, async (c) => {
  const authUser = c.get('user') as AuthUser;
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?1')
    .bind(authUser.id)
    .first<UserRow>();
  if (!row) return jsonError(c, 404, 'user_not_found', '用户不存在');
  return jsonOk(c, { user: publicUser(row) });
});

/** 更新个人设置：每日上限 / 时区 / 昵称 */
app.patch('/me', requireAuth, async (c) => {
  const authUser = c.get('user') as AuthUser;
  const body = await c.req
    .json<Record<string, unknown>>()
    .catch((): Record<string, unknown> => ({}));

  const updates: string[] = [];
  const values: unknown[] = [];

  if (typeof body.dailyNewLimit === 'number' && Number.isFinite(body.dailyNewLimit)) {
    updates.push(`daily_new_limit = ?${values.length + 1}`);
    values.push(Math.min(100, Math.max(0, Math.trunc(body.dailyNewLimit))));
  }
  if (typeof body.dailyReviewLimit === 'number' && Number.isFinite(body.dailyReviewLimit)) {
    updates.push(`daily_review_limit = ?${values.length + 1}`);
    values.push(Math.min(500, Math.max(10, Math.trunc(body.dailyReviewLimit))));
  }
  if (typeof body.timezone === 'string' && body.timezone.length < 64) {
    updates.push(`timezone = ?${values.length + 1}`);
    values.push(body.timezone);
  }
  if (typeof body.displayName === 'string') {
    updates.push(`display_name = ?${values.length + 1}`);
    values.push(body.displayName.trim().slice(0, 32) || null);
  }

  if (!updates.length) return jsonError(c, 400, 'no_changes', '没有需要更新的字段');

  values.push(authUser.id);
  await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?${values.length}`)
    .bind(...values)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?1')
    .bind(authUser.id)
    .first<UserRow>();
  return jsonOk(c, { user: row ? publicUser(row) : null });
});

export default app;
