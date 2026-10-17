import type { Context } from 'hono';
import type { Env } from '../types';

export const newId = (): string => crypto.randomUUID();

export function jsonError(
  c: Context,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
) {
  return c.json({ ok: false, error: { code, message, ...extra } }, status as never);
}

export function jsonOk<T>(c: Context, data: T, status = 200) {
  return c.json({ ok: true, data }, status as never);
}

/** 用户时区下的本地日期键 YYYY-MM-DD，用于打卡与热力图 */
export function localDateKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function shiftDateKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 校验并归一化邮箱 */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  if (email.length < 5 || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

export function parseCorsOrigins(env: Env): string[] {
  return (env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveCorsOrigin(origin: string | undefined, env: Env): string | null {
  if (!origin) return null;
  const allowed = parseCorsOrigins(env);
  if (allowed.includes('*')) return '*';
  // 本地开发端口放行（Vite 可能换端口）
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return origin;
  return allowed.includes(origin) ? origin : null;
}

export function intParam(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
