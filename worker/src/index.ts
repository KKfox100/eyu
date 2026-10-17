import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { resolveCorsOrigin } from './lib/http';
import authRoutes from './routes/auth';
import studyRoutes from './routes/cards';
import statsRoutes from './routes/stats';
import type { AppEnv } from './middleware/auth';
import type { Env } from './types';

const app = new Hono<AppEnv>();

/** CORS：只放行白名单来源（含本地开发端口） */
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => resolveCorsOrigin(origin, c.env) ?? '',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
    credentials: false,
  })
);

app.get('/', (c) =>
  c.json({
    name: 'e语 API',
    version: '0.1.0',
    phase: 'Phase 1',
    docs: '/api/health',
  })
);

app.get('/api/health', async (c) => {
  let db = 'unknown';
  try {
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM cards_master').first<{
      n: number;
    }>();
    db = `ok (${row?.n ?? 0} cards)`;
  } catch (error) {
    db = `error: ${(error as Error).message}`;
  }
  return c.json({
    ok: true,
    data: {
      service: 'eyu-api',
      env: c.env.ENVIRONMENT,
      db,
      now: new Date().toISOString(),
    },
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/study', studyRoutes);
app.route('/api/stats', statsRoutes);

app.notFound((c) => c.json({ ok: false, error: { code: 'not_found', message: '接口不存在' } }, 404));

app.onError((err, c) => {
  console.error('[eyu-api]', err);
  return c.json(
    {
      ok: false,
      error: {
        code: 'internal_error',
        message: c.env.ENVIRONMENT === 'production' ? '服务器内部错误' : err.message,
      },
    },
    500
  );
});

/**
 * Cron Triggers 入口（Phase 3 启用，见 wrangler.toml）
 * 每日 23:00 UTC 扫描当天未打卡的用户，写入待推送队列。
 */
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[cron] tick', event.cron, new Date().toISOString());
    ctx.waitUntil(
      (async () => {
        const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
        console.log('[cron] users:', row?.n ?? 0);
      })()
    );
  },
};
