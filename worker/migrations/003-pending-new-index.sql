-- 003 · 待学新卡索引
-- /queue 现在会按 state 单独捞「已发放但还没学完」的卡（修复孤儿卡 bug），
-- 补一个 (user_id, state) 索引避免全表扫。
CREATE INDEX IF NOT EXISTS idx_user_cards_state
  ON user_cards(user_id, state);
