import { Hono } from 'hono';
import type { AuthUser, CardType, DueCardRow, Rating, UserCardRow } from '../types';
import { jsonError, jsonOk, intParam, localDateKey, newId } from '../lib/http';
import { describeInterval, schedule } from '../lib/sm2';
import { buildCloze, buildOptions, buildOrder, posOf } from '../lib/exercise';
import { requireAuth, type AppEnv } from '../middleware/auth';

const app = new Hono<AppEnv>();

interface CardDto {
  userCardId: string;
  cardId: string;
  type: 'word' | 'chunk' | 'grammar';
  content: string;
  phonetic: string | null;
  definition: string;
  grammarPattern: string | null;
  explanation: string | null;
  examples: Array<{ scene?: string; en: string; zh?: string }>;
  tags: string[];
  frequencyRank: number | null;
  stage: number;
  easinessFactor: number;
  intervalDays: number;
  nextReviewAt: string;
  reps: number;
  lapses: number;
  isNew: boolean;
}

function parseExamples(raw: string | null): CardDto['examples'] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        scene: typeof item.scene === 'string' ? item.scene : undefined,
        en: String(item.en ?? ''),
        zh: typeof item.zh === 'string' ? item.zh : undefined,
      }));
  } catch {
    return [];
  }
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 12) : [];
  } catch {
    return [];
  }
}

function toDto(row: DueCardRow): CardDto {
  return {
    userCardId: row.user_card_id,
    cardId: row.card_id,
    type: row.type,
    content: row.content,
    phonetic: row.phonetic,
    definition: row.definition,
    grammarPattern: row.grammar_pattern,
    explanation: row.explanation,
    examples: parseExamples(row.examples_json),
    tags: parseTags(row.tags),
    frequencyRank: row.frequency_rank,
    stage: row.stage,
    easinessFactor: row.easiness_factor,
    intervalDays: row.interval_days,
    nextReviewAt: row.next_review_at,
    reps: row.reps,
    lapses: row.lapses,
    isNew: row.state === 'new',
  };
}

/**
 * GET /api/study/queue
 * 生成今日学习队列：复习优先于新词。
 * 新词按 frequency_rank 升序发放（频次越高越先学），并受 daily_new_limit 约束。
 */
app.get('/queue', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const limit = intParam(c.req.query('limit'), 30, 1, 60);
  /** extra=1 为「加练」：允许突破每日新词额度，上限为 dailyNewLimit × 3（至少 60） */
  const extra = c.req.query('extra') === '1';
  const newCap = extra ? Math.max(user.dailyNewLimit * 3, 60) : user.dailyNewLimit;
  const now = new Date();
  const nowIso = now.toISOString();
  const todayKey = localDateKey(now, user.timezone);

  const dueRows = await c.env.DB.prepare(
    `SELECT * FROM v_due_cards
      WHERE user_id = ?1
        AND state IN ('learning', 'review')
        AND next_review_at <= ?2
      ORDER BY next_review_at ASC
      LIMIT ?3`
  )
    .bind(user.id, nowIso, Math.min(limit, user.dailyReviewLimit))
    .all<DueCardRow>();

  const due = dueRows.results ?? [];
  let newCards: CardDto[] = [];

  if (due.length < limit && newCap > 0) {
    const introduced = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM user_cards WHERE user_id = ?1 AND first_seen_date = ?2`
    )
      .bind(user.id, todayKey)
      .first<{ n: number }>();

    const quota = Math.max(0, newCap - (introduced?.n ?? 0));
    const wantNew = Math.min(quota, limit - due.length);

    if (wantNew > 0) {
      const candidates = await c.env.DB.prepare(
        `SELECT cm.* FROM cards_master cm
           LEFT JOIN user_cards uc
             ON uc.card_id = cm.id AND uc.user_id = ?1
          WHERE uc.id IS NULL
            AND (cm.owner_id IS NULL OR cm.owner_id = ?1)
          ORDER BY (cm.frequency_rank IS NULL) ASC, cm.frequency_rank ASC, cm.created_at ASC
          LIMIT ?2`
      )
        .bind(user.id, wantNew)
        .all<DueCardRow>();

      const rows = candidates.results ?? [];
      if (rows.length) {
        const inserts = rows.map((row) =>
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO user_cards
               (id, user_id, card_id, state, stage, easiness_factor, interval_days,
                next_review_at, first_seen_at, first_seen_date, reps, lapses)
             VALUES (?1, ?2, ?3, 'new', 0, 2.5, 0, ?4, ?4, ?5, 0, 0)`
          ).bind(newId(), user.id, row.id, nowIso, todayKey)
        );
        await c.env.DB.batch(inserts);

        // 回读刚插入的行，拿到真实的 user_card_id
        const placeholders = rows.map((_, i) => `?${i + 2}`).join(', ');
        const created = await c.env.DB.prepare(
          `SELECT * FROM v_due_cards WHERE user_id = ?1 AND card_id IN (${placeholders})`
        )
          .bind(user.id, ...rows.map((r) => r.id))
          .all<DueCardRow>();
        newCards = (created.results ?? []).map(toDto);
      }
    }
  }

  const totalDue = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM user_cards
      WHERE user_id = ?1 AND state IN ('learning', 'review') AND next_review_at <= ?2`
  )
    .bind(user.id, nowIso)
    .first<{ n: number }>();

  return jsonOk(c, {
    today: todayKey,
    queue: [...due.map(toDto), ...newCards],
    summary: {
      dueNow: totalDue?.n ?? due.length,
      dueInQueue: due.length,
      newInQueue: newCards.length,
      dailyNewLimit: user.dailyNewLimit,
      newCap,
      /** 加练模式下可达的新词上限，前端用来提示「今日额度 X → 可到 Y」 */
      extraNewCap: Math.max(user.dailyNewLimit * 3, 60),
      extra,
      dailyReviewLimit: user.dailyReviewLimit,
    },
  });
});

/**
 * GET /api/study/exercise?userCardId=xxx&mode=auto|cloze|order
 * 为一轮复习生成练习题。任何一步失败都返回 available:false，前端退回翻转卡。
 */
app.get('/exercise', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const userCardId = c.req.query('userCardId') ?? '';
  if (!userCardId) return jsonError(c, 400, 'missing_card', '缺少卡片标识');

  const requested = c.req.query('mode') ?? 'auto';
  const mode = ['auto', 'cloze', 'order'].includes(requested) ? requested : 'auto';

  const row = await c.env.DB.prepare(
    `SELECT cm.id, cm.type, cm.content, cm.definition, cm.examples_json
       FROM user_cards uc
       JOIN cards_master cm ON cm.id = uc.card_id
      WHERE uc.id = ?1 AND uc.user_id = ?2`
  )
    .bind(userCardId, user.id)
    .first<{
      id: string;
      type: CardType;
      content: string;
      definition: string;
      examples_json: string | null;
    }>();

  if (!row) return jsonError(c, 404, 'card_not_found', '卡片不存在或不属于当前用户');

  const examples = parseExamples(row.examples_json);
  const card = { content: row.content, type: row.type };

  /** auto：语法卡做语序（骨架没法挖空），词汇卡六成做填空 */
  const preferred = mode as 'cloze' | 'order';
  const plan: Array<'cloze' | 'order'> =
    mode === 'auto'
      ? row.type === 'grammar'
        ? ['order']
        : Math.random() < 0.6
          ? ['cloze', 'order']
          : ['order', 'cloze']
      : [preferred, preferred === 'cloze' ? 'order' : 'cloze'];

  for (const candidate of plan) {
    if (candidate === 'cloze') {
      const built = buildCloze(examples, card);
      if (!built) continue;

      // 干扰项从同类型卡片里随机取，长度接近的优先（buildOptions 内部排序）。
      // 单词再按词性过滤一遍 —— 否则 "Can I ____ your charger?" 的选项里冒出个 idea，
      // 答案等于白送。
      const poolRows = await c.env.DB.prepare(
        `SELECT content, definition FROM cards_master
          WHERE type = ?1 AND id <> ?2 AND (owner_id IS NULL OR owner_id = ?3)
          ORDER BY RANDOM() LIMIT 60`
      )
        .bind(row.type, row.id, user.id)
        .all<{ content: string; definition: string }>();

      const all = poolRows.results ?? [];
      const targetPos = posOf(row.definition);
      const samePos = targetPos ? all.filter((r) => posOf(r.definition) === targetPos) : [];
      const pool = (samePos.length >= 3 ? samePos : all).map((r) => r.content);

      const options = buildOptions(built.answer, pool);
      return jsonOk(c, { available: true, exercise: { ...built, options } });
    }

    const built = buildOrder(examples);
    if (built) return jsonOk(c, { available: true, exercise: built });
  }

  return jsonOk(c, { available: false, reason: 'no_usable_example' });
});

/**
 * POST /api/study/review
 * body: { userCardId, rating: 0|1|2|3, mode?, elapsedMs? }
 * 一次事务内：更新 user_cards + 写入 review_logs
 */
app.post('/review', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const body = await c.req.json<{
    userCardId?: unknown;
    rating?: unknown;
    mode?: unknown;
    elapsedMs?: unknown;
  }>().catch(() => ({} as Record<string, unknown>));

  const userCardId = typeof body.userCardId === 'string' ? body.userCardId : '';
  const rating = Number(body.rating);
  if (!userCardId) return jsonError(c, 400, 'missing_card', '缺少卡片标识');
  if (![0, 1, 2, 3].includes(rating)) {
    return jsonError(c, 400, 'invalid_rating', 'rating 必须是 0/1/2/3');
  }

  const current = await c.env.DB.prepare(
    `SELECT * FROM user_cards WHERE id = ?1 AND user_id = ?2`
  )
    .bind(userCardId, user.id)
    .first<UserCardRow>();

  if (!current) return jsonError(c, 404, 'card_not_found', '卡片不存在或不属于当前用户');

  const now = new Date();
  const result = schedule(
    {
      stage: current.stage,
      easinessFactor: current.easiness_factor,
      intervalDays: current.interval_days,
      lapses: current.lapses,
      reps: current.reps,
      state: current.state,
    },
    rating as Rating,
    now
  );

  const mode =
    typeof body.mode === 'string' && ['recall', 'cloze', 'order', 'speak'].includes(body.mode)
      ? body.mode
      : 'recall';
  const elapsedMs =
    typeof body.elapsedMs === 'number' && Number.isFinite(body.elapsedMs)
      ? Math.min(600_000, Math.max(0, Math.trunc(body.elapsedMs)))
      : null;
  const nowIso = now.toISOString();
  const todayKey = localDateKey(now, user.timezone);

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE user_cards
          SET stage = ?1, easiness_factor = ?2, interval_days = ?3, next_review_at = ?4,
              last_reviewed_at = ?5, lapses = ?6, reps = ?7, state = ?8
        WHERE id = ?9 AND user_id = ?10`
    ).bind(
      result.stage,
      result.easinessFactor,
      result.intervalDays,
      result.nextReviewAt,
      nowIso,
      result.lapses,
      result.reps,
      result.state,
      userCardId,
      user.id
    ),
    c.env.DB.prepare(
      `INSERT INTO review_logs
         (id, user_id, user_card_id, card_id, rating, mode, prev_state, next_state,
          prev_stage, next_stage, prev_interval, next_interval, prev_ef, next_ef,
          elapsed_ms, reviewed_at, review_date)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`
    ).bind(
      newId(),
      user.id,
      userCardId,
      current.card_id,
      rating,
      mode,
      current.state,
      result.state,
      current.stage,
      result.stage,
      current.interval_days,
      result.intervalDays,
      current.easiness_factor,
      result.easinessFactor,
      elapsedMs,
      nowIso,
      todayKey
    ),
  ]);

  const remaining = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM user_cards
      WHERE user_id = ?1 AND state IN ('learning', 'review') AND next_review_at <= ?2`
  )
    .bind(user.id, nowIso)
    .first<{ n: number }>();

  return jsonOk(c, {
    card: {
      userCardId,
      stage: result.stage,
      easinessFactor: result.easinessFactor,
      intervalDays: result.intervalDays,
      state: result.state,
      nextReviewAt: result.nextReviewAt,
      lapses: result.lapses,
      reps: result.reps,
    },
    feedback: {
      rating,
      isLapse: result.isLapse,
      intervalLabel: describeInterval(result),
      efDelta: Math.round((result.easinessFactor - current.easiness_factor) * 100) / 100,
    },
    remainingDue: remaining?.n ?? 0,
  });
});

/** GET /api/study/cards — 词库浏览（分页 + 类型筛选 + 关键词） */
app.get('/cards', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const page = intParam(c.req.query('page'), 1, 1, 1000);
  const pageSize = intParam(c.req.query('pageSize'), 20, 1, 100);
  const type = c.req.query('type');
  const keyword = (c.req.query('q') || '').trim();

  const where: string[] = ['(cm.owner_id IS NULL OR cm.owner_id = ?1)'];
  const params: unknown[] = [user.id];

  if (type && ['word', 'chunk', 'grammar'].includes(type)) {
    where.push(`cm.type = ?${params.length + 1}`);
    params.push(type);
  }
  if (keyword) {
    where.push(`(cm.content LIKE ?${params.length + 1} OR cm.definition LIKE ?${params.length + 1})`);
    params.push(`%${keyword}%`);
  }

  const whereSql = where.join(' AND ');
  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM cards_master cm WHERE ${whereSql}`
  )
    .bind(...params)
    .first<{ n: number }>();

  const listParams = [...params, pageSize, (page - 1) * pageSize];
  const rows = await c.env.DB.prepare(
    `SELECT cm.*,
            uc.id AS user_card_id, uc.user_id AS user_id, uc.state AS state,
            uc.stage AS stage, uc.easiness_factor AS easiness_factor,
            uc.interval_days AS interval_days, uc.next_review_at AS next_review_at,
            uc.reps AS reps, uc.lapses AS lapses
       FROM cards_master cm
       LEFT JOIN user_cards uc ON uc.card_id = cm.id AND uc.user_id = ?1
      WHERE ${whereSql}
      ORDER BY (cm.frequency_rank IS NULL) ASC, cm.frequency_rank ASC, cm.created_at ASC
      LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`
  )
    .bind(...listParams)
    .all<DueCardRow>();

  const items = (rows.results ?? []).map((row) =>
    row.user_card_id
      ? toDto(row)
      : {
          userCardId: null,
          cardId: row.id,
          type: row.type,
          content: row.content,
          phonetic: row.phonetic,
          definition: row.definition,
          grammarPattern: row.grammar_pattern,
          explanation: row.explanation,
          examples: parseExamples(row.examples_json),
          tags: parseTags(row.tags),
          frequencyRank: row.frequency_rank,
          stage: 0,
          easinessFactor: 2.5,
          intervalDays: 0,
          nextReviewAt: '',
          reps: 0,
          lapses: 0,
          isNew: true,
        }
  );

  return jsonOk(c, {
    page,
    pageSize,
    total: total?.n ?? 0,
    totalPages: Math.max(1, Math.ceil((total?.n ?? 0) / pageSize)),
    items,
  });
});

export default app;
