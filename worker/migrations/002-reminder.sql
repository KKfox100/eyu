-- 002 · 打卡提醒
-- 提醒渠道用「群机器人 webhook」：企业微信 / 钉钉 / 飞书都支持，
-- 用户把机器人的地址粘进来，Cron 到点 POST 一条文本过去。
ALTER TABLE users ADD COLUMN reminder_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN reminder_webhook TEXT;
