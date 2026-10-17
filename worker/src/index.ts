import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { localDateKey, resolveCorsOrigin } from './lib/http';
import { buildReminderText, buildWebhookPayload, webhookKind } from './lib/webhook';
import authRoutes from './routes/auth';
import studyRoutes from './routes/cards';
import statsRoutes from './routes/stats';
import clipRoutes from './routes/clip';
import ttsRoutes from './routes/tts';
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
app.route('/api/clip', clipRoutes);
app.route('/api/tts', ttsRoutes);

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
 * Cron Triggers 入口（wrangler.toml 里每天 UTC 11:30 = 北京时间 19:30）
 *
 * 找出「今天还没学、但有卡片到期」的用户，往他自己的群机器人推一条提醒。
 * 没配 webhook 的用户直接跳过 —— 站内「今日」页本来就会显示到期数量。
 */
interface ReminderRow {
  id: string;
  display_name: string | null;
  timezone: string;
  reminder_webhook: string | null;
}

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[cron] tick', event.cron, new Date().toISOString());

    ctx.waitUntil(
      (async () => {
        const rows = await env.DB.prepare(
          `SELECT id, display_name, timezone, reminder_webhook
             FROM users
            WHERE reminder_enabled = 1 AND reminder_webhook IS NOT NULL`
        ).all<ReminderRow>();

        const users = rows.results ?? [];
        let sent = 0;
        let skipped = 0;

        for (const user of users) {
          const url = user.reminder_webhook?.trim();
          const kind = url ? webhookKind(url) : null;
          if (!url || !kind) {
            skipped += 1;
            continue;
          }

          // 每个用户按自己的时区算「今天」
          const today = localDateKey(new Date(), user.timezone);

          const due = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM user_cards
              WHERE user_id = ?1 AND state IN ('learning', 'review') AND next_review_at <= ?2`
          )
            .bind(user.id, new Date().toISOString())
            .first<{ n: number }>();

          const done = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM review_logs WHERE user_id = ?1 AND review_date = ?2`
          )
            .bind(user.id, today)
            .first<{ n: number }>();

          const dueCount = due?.n ?? 0;
          const doneCount = done?.n ?? 0;

          // 今天已经学过了就别打扰
          if (doneCount > 0) {
            skipped += 1;
            continue;
          }
          // 既没到期卡也没新卡可学（比如额度用完且全在曲线上），也别发
          if (dueCount === 0) {
            const newLeft = await env.DB.prepare(
              `SELECT COUNT(*) AS n FROM cards_master cm
                 LEFT JOIN user_cards uc ON uc.card_id = cm.id AND uc.user_id = ?1
                WHERE uc.id IS NULL AND (cm.owner_id IS NULL OR cm.owner_id = ?1)`
            )
              .bind(user.id)
              .first<{ n: number }>();
            if ((newLeft?.n ?? 0) === 0) {
              skipped += 1;
              continue;
            }
          }

          const streakRow = await env.DB.prepare(
            `SELECT COUNT(DISTINCT review_date) AS n FROM review_logs
              WHERE user_id = ?1 AND review_date >= date(?2, '-30 day')`
          )
            .bind(user.id, today)
            .first<{ n: number }>();

          const text = buildReminderText({
            name: user.display_name,
            due: dueCount,
            done: doneCount,
            streak: streakRow?.n ?? 0,
            siteUrl: env.SITE_URL,
          });

          try {
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(buildWebhookPayload(kind, text)),
            });
            if (res.ok) sent += 1;
            else {
              skipped += 1;
              console.log('[cron] webhook failed', user.id, res.status);
            }
          } catch (error) {
            skipped += 1;
            console.log('[cron] webhook error', user.id, (error as Error).message);
          }
        }

        console.log(`[cron] users=${users.length} sent=${sent} skipped=${skipped}`);
      })()
    );
  },
};
