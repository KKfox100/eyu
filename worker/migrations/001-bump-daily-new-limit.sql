-- 已有用户的每日新词从 10 提到 20（只影响还是旧默认值的账号）
UPDATE users SET daily_new_limit = 20 WHERE daily_new_limit = 10;
