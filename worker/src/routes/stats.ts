import { Hono } from 'hono';
import type { AuthUser } from '../types';
import { intParam, jsonOk, localDateKey, shiftDateKey } from '../lib/http';
import { requireAuth, type AppEnv } from '../middleware/auth';

const app = new Hono<AppEnv>();

/**
 * GET /api/stats/overview?days=90
 * 打卡主页所需的全部聚合数据：今日进度、连续天数、总量、热力图
 */
app.get('/overview', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const days = intParam(c.req.query('days'), 90, 7, 365);
  const now = new Date();
  const nowIso = now.toISOString();
  const todayKey = localDateKey(now, user.timezone);
  const sinceKey = shiftDateKey(todayKey, -(days - 1));

  const [todayRow, totalsRow, dueRow, newRow, typeRows, heatRows, dateRows] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS reviewed,
              SUM(CASE WHEN rating >= 2 THEN 1 ELSE 0 END) AS good,
              SUM(CASE WHEN prev_state = 'new' THEN 1 ELSE 0 END) AS new_learned
         FROM review_logs WHERE user_id = ?1 AND review_date = ?2`
    ).bind(user.id, todayKey),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS learned,
              SUM(CASE WHEN stage >= 4 THEN 1 ELSE 0 END) AS mastered,
              SUM(CASE WHEN state = 'learning' THEN 1 ELSE 0 END) AS learning
         FROM user_cards WHERE user_id = ?1 AND state != 'suspended'`
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM user_cards
        WHERE user_id = ?1 AND state IN ('learning', 'review') AND next_review_at <= ?2`
    ).bind(user.id, nowIso),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM cards_master cm
         LEFT JOIN user_cards uc ON uc.card_id = cm.id AND uc.user_id = ?1
        WHERE uc.id IS NULL AND (cm.owner_id IS NULL OR cm.owner_id = ?1)`
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT cm.type AS type, COUNT(*) AS n
         FROM user_cards uc JOIN cards_master cm ON cm.id = uc.card_id
        WHERE uc.user_id = ?1 AND uc.state != 'suspended'
        GROUP BY cm.type`
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT review_date AS date,
              COUNT(*) AS count,
              SUM(CASE WHEN prev_state = 'new' THEN 1 ELSE 0 END) AS new_count,
              SUM(CASE WHEN rating >= 2 THEN 1 ELSE 0 END) AS good_count
         FROM review_logs
        WHERE user_id = ?1 AND review_date >= ?2
        GROUP BY review_date ORDER BY review_date ASC`
    ).bind(user.id, sinceKey),
    c.env.DB.prepare(
      `SELECT DISTINCT review_date AS date FROM review_logs
        WHERE user_id = ?1 ORDER BY review_date DESC LIMIT 400`
    ).bind(user.id),
  ]);

  const today = (todayRow.results?.[0] ?? {}) as {
    reviewed?: number;
    good?: number;
    new_learned?: number;
  };
  const totals = (totalsRow.results?.[0] ?? {}) as {
    learned?: number;
    mastered?: number;
    learning?: number;
  };

  const reviewedToday = today.reviewed ?? 0;
  const goodToday = today.good ?? 0;

  const dates = ((dateRows.results ?? []) as Array<{ date: string }>).map((r) => r.date);
  const streak = computeStreak(dates, todayKey);

  const byType = { word: 0, chunk: 0, grammar: 0 } as Record<string, number>;
  for (const row of (typeRows.results ?? []) as Array<{ type: string; n: number }>) {
    byType[row.type] = row.n;
  }

  const heatmap = ((heatRows.results ?? []) as Array<{
    date: string;
    count: number;
    new_count: number;
    good_count: number;
  }>).map((r) => ({
    date: r.date,
    count: r.count,
    newCount: r.new_count ?? 0,
    goodCount: r.good_count ?? 0,
  }));

  return jsonOk(c, {
    today: {
      date: todayKey,
      reviewed: reviewedToday,
      newLearned: today.new_learned ?? 0,
      accuracy: reviewedToday ? Math.round((goodToday / reviewedToday) * 100) : null,
      goalMet: reviewedToday >= 1,
    },
    totals: {
      learned: totals.learned ?? 0,
      mastered: totals.mastered ?? 0,
      learning: totals.learning ?? 0,
      dueNow: (dueRow.results?.[0] as { n?: number } | undefined)?.n ?? 0,
      newAvailable: (newRow.results?.[0] as { n?: number } | undefined)?.n ?? 0,
      byType,
    },
    streak,
    heatmap,
    days,
  });
});

/** GET /api/stats/history?limit=30 — 最近 N 天的每日明细 */
app.get('/history', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const limit = intParam(c.req.query('limit'), 30, 1, 365);
  const rows = await c.env.DB.prepare(
    `SELECT review_date AS date, COUNT(*) AS count,
            SUM(CASE WHEN rating >= 2 THEN 1 ELSE 0 END) AS good_count,
            SUM(CASE WHEN rating = 0 THEN 1 ELSE 0 END) AS lapse_count
       FROM review_logs WHERE user_id = ?1
      GROUP BY review_date ORDER BY review_date DESC LIMIT ?2`
  )
    .bind(user.id, limit)
    .all<{ date: string; count: number; good_count: number; lapse_count: number }>();

  return jsonOk(c, {
    items: (rows.results ?? []).map((r) => ({
      date: r.date,
      reviewed: r.count,
      accuracy: r.count ? Math.round(((r.good_count ?? 0) / r.count) * 100) : null,
      lapses: r.lapse_count ?? 0,
    })),
  });
});

/**
 * 连续打卡天数。
 * 今天没学不算断 —— 只要昨天有记录，连续天数依然保留（当天还有机会补上）。
 */
export function computeStreak(datesDesc: string[], todayKey: string): {
  current: number;
  longest: number;
  lastActiveDate: string | null;
} {
  if (!datesDesc.length) return { current: 0, longest: 0, lastActiveDate: null };

  const set = new Set(datesDesc);
  let current = 0;
  const startFromToday = set.has(todayKey);
  let cursor = startFromToday ? todayKey : shiftDateKey(todayKey, -1);

  if (set.has(cursor)) {
    while (set.has(cursor)) {
      current += 1;
      cursor = shiftDateKey(cursor, -1);
    }
  }

  // 最长连续
  const ascending = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of ascending) {
    run = prev && shiftDateKey(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }

  return { current, longest, lastActiveDate: ascending[ascending.length - 1] ?? null };
}

export default app;
