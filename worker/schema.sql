-- ============================================================
-- e语 · Cloudflare D1 数据库初始化脚本 (Phase 1)
-- 执行： wrangler d1 execute eyu-db --remote --file=./schema.sql
-- 说明： 全脚本幂等（IF NOT EXISTS），可重复执行。
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- 1. 用户表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,              -- PBKDF2-SHA256: pbkdf2$<iter>$<salt_b64>$<hash_b64>
  display_name      TEXT,
  timezone          TEXT    DEFAULT 'Asia/Shanghai', -- 用于「今日」边界与打卡热力图
  daily_new_limit   INTEGER DEFAULT 20,         -- 每日新词上限（加练可突破到 3 倍）
  daily_review_limit INTEGER DEFAULT 100,       -- 每日复习上限
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_active_at    DATETIME
);

-- ------------------------------------------------------------
-- 2. 全局词库 / 句型主表
--    owner_id 为 NULL 表示公共词库；非 NULL 表示用户私有卡片（智能剪藏产物）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cards_master (
  id               TEXT PRIMARY KEY,
  type             TEXT CHECK(type IN ('word', 'chunk', 'grammar')) NOT NULL,
  content          TEXT NOT NULL,               -- 单词 / 短语语块 / 语法骨架
  phonetic         TEXT,                        -- 音标，如 /ˈbæləns/
  definition       TEXT NOT NULL,               -- 释义（中文为主）
  grammar_pattern  TEXT,                        -- 语法骨架模式，如 "It takes sb. + time + to do sth."
  explanation      TEXT,                        -- 100 字极简场景解析
  examples_json    TEXT,                        -- [{"scene":"职场","en":"...","zh":"..."}]
  frequency_rank   INTEGER,                     -- 频次排名，1 = 最高频（新词发放优先级依据）
  tags             TEXT,                        -- JSON 数组，如 ["职场","高频动词"]
  difficulty       INTEGER DEFAULT 3,           -- 1..5，供 AI 解析与排序使用
  source           TEXT    DEFAULT 'seed',      -- seed | ai | manual
  owner_id         TEXT,                        -- NULL = 公共词库
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 3. 用户记忆状态表（SM-2 核心依据）
--    一行 = 一个用户对一张卡片的记忆状态
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_cards (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  card_id           TEXT NOT NULL,
  state             TEXT    DEFAULT 'new',      -- new | learning | review | suspended
  stage             INTEGER DEFAULT 0,          -- 当前所处复习阶段（对应基础间隔表下标）
  easiness_factor   REAL    DEFAULT 2.5,        -- EF 因子，区间 [1.3, 2.8]
  interval_days     INTEGER DEFAULT 0,          -- 当前间隔（天）；0 表示当天内需重刷
  next_review_at    DATETIME NOT NULL,          -- UTC 时间戳（ISO8601），到期即可复习
  last_reviewed_at  DATETIME,
  first_seen_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  first_seen_date   TEXT,                       -- 首次出现日（用户本地 YYYY-MM-DD），用于每日新词限额
  reps              INTEGER DEFAULT 0,          -- 累计复习次数
  lapses            INTEGER DEFAULT 0,          -- 遗忘次数（评级 0 的次数）
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(card_id) REFERENCES cards_master(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 4. 复习日志（打卡热力图 / 学习曲线 / 数据导出 的唯一数据源）
--    review_date 为「用户时区下的本地日期」，避免跨时区统计错位
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS review_logs (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  user_card_id    TEXT NOT NULL,
  card_id         TEXT NOT NULL,
  rating          INTEGER NOT NULL,             -- 0 忘记 / 1 模糊 / 2 掌握 / 3 熟知
  mode            TEXT DEFAULT 'recall',        -- recall | cloze | order | speak
  prev_state      TEXT,                         -- new / learning / review（用于区分「新学」与「复习」）
  next_state      TEXT,
  prev_stage      INTEGER,
  next_stage      INTEGER,
  prev_interval   INTEGER,
  next_interval   INTEGER,
  prev_ef         REAL,
  next_ef         REAL,
  elapsed_ms      INTEGER,                      -- 作答耗时，用于分析「假性掌握」
  reviewed_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  review_date     TEXT NOT NULL,                -- YYYY-MM-DD（用户本地日期）
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 5. 索引
-- ------------------------------------------------------------
-- 到期队列： WHERE user_id = ? AND next_review_at <= ? ORDER BY next_review_at
CREATE INDEX IF NOT EXISTS idx_user_cards_due
  ON user_cards(user_id, next_review_at);

-- 同一用户同一卡片只能有一份状态（幂等 upsert 的基石）
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_cards_unique
  ON user_cards(user_id, card_id);

-- 新词发放：按频次优先级取未学卡片
CREATE INDEX IF NOT EXISTS idx_cards_master_rank
  ON cards_master(type, frequency_rank);

CREATE INDEX IF NOT EXISTS idx_cards_master_owner
  ON cards_master(owner_id);

-- 热力图：按用户 + 日期聚合
CREATE INDEX IF NOT EXISTS idx_review_logs_user_date
  ON review_logs(user_id, review_date);

CREATE INDEX IF NOT EXISTS idx_review_logs_card
  ON review_logs(user_card_id, reviewed_at);

-- ------------------------------------------------------------
-- 6. 视图：一次 JOIN 拿到「待复习卡片 + 内容」
--    Worker 端直接 SELECT * FROM v_due_cards WHERE user_id = ?
-- ------------------------------------------------------------
DROP VIEW IF EXISTS v_due_cards;
CREATE VIEW v_due_cards AS
SELECT
  uc.id             AS user_card_id,
  uc.user_id        AS user_id,
  uc.card_id        AS card_id,
  uc.state          AS state,
  uc.stage          AS stage,
  uc.easiness_factor AS easiness_factor,
  uc.interval_days  AS interval_days,
  uc.next_review_at AS next_review_at,
  uc.lapses         AS lapses,
  uc.reps           AS reps,
  cm.type           AS type,
  cm.content        AS content,
  cm.phonetic       AS phonetic,
  cm.definition     AS definition,
  cm.grammar_pattern AS grammar_pattern,
  cm.explanation    AS explanation,
  cm.examples_json  AS examples_json,
  cm.frequency_rank AS frequency_rank,
  cm.tags           AS tags
FROM user_cards uc
JOIN cards_master cm ON cm.id = uc.card_id;
