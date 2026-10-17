import type { MiddlewareHandler } from 'hono';
import type { AuthUser, Env, UserRow } from '../types';
import { verifyJwt } from '../lib/jwt';
import { jsonError } from '../lib/http';

export type AppEnv = {
  Bindings: Env;
  Variables: { user: AuthUser };
};

export const SESSION_PREFIX = 'sess:';

/**
 * Bearer Token 鉴权中间件
 * 1. 验签 + 校验 exp / iss
 * 2. 校验 KV 中的会话仍存在（支持登出即失效、黑名单）
 * 3. 载入用户配置（时区、每日上限）
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return jsonError(c, 401, 'unauthorized', '缺少访问令牌');
  }

  const result = await verifyJwt(c.env.JWT_SECRET, token, c.env.JWT_ISSUER);
  if (!result.valid || !result.payload) {
    const reason = result.reason === 'expired' ? '登录已过期，请重新登录' : '无效的访问令牌';
    return jsonError(c, 401, result.reason ?? 'unauthorized', reason);
  }

  const { sub, jti } = result.payload;

  // KV 会话校验：登出 / 强制下线后立即失效
  const sessionUserId = await c.env.SESSIONS.get(`${SESSION_PREFIX}${jti}`);
  if (sessionUserId !== sub) {
    return jsonError(c, 401, 'session_revoked', '会话已失效，请重新登录');
  }

  const user = await c.env.DB.prepare(
    `SELECT id, email, display_name, timezone, daily_new_limit, daily_review_limit
       FROM users WHERE id = ?1`
  )
    .bind(sub)
    .first<UserRow>();

  if (!user) {
    return jsonError(c, 401, 'user_not_found', '用户不存在');
  }

  c.set('user', {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    timezone: user.timezone || c.env.DEFAULT_TZ || 'Asia/Shanghai',
    dailyNewLimit: user.daily_new_limit ?? 10,
    dailyReviewLimit: user.daily_review_limit ?? 100,
    jti,
  });

  await next();
};
