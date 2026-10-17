#!/usr/bin/env node
/**
 * 线上冒烟测试
 *
 * 用法：
 *   node scripts/smoke-test.mjs                        # 默认打 https://eyu.pages.dev
 *   BASE=http://127.0.0.1:8787 node scripts/smoke-test.mjs   # 打本地 Worker
 *
 * 覆盖：注册 → 队列 → 四种评级 → 统计 → 当前用户 → 登出后令牌失效
 */

const BASE = (process.env.BASE || 'https://eyu.pages.dev').replace(/\/$/, '');

const readJson = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 200) };
  }
};

const call = (path, options = {}) =>
  fetch(`${BASE}${path}`, options).then(readJson);

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? '  ' + detail : ''}`);
  if (!ok) failed += 1;
};

const email = `smoke${Date.now()}@eyu.app`;

const reg = await call('/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'smoke12345', displayName: '冒烟测试' }),
});
check('注册', Boolean(reg?.data?.token), reg?.data?.user?.email ?? JSON.stringify(reg?.error));

const token = reg?.data?.token;
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

const queue = await call('/api/study/queue?limit=5', { headers: H });
const cards = queue?.data?.queue ?? [];
check(
  '队列发放新词',
  cards.length > 0,
  cards.map((c) => c.content).join(', ') + ' | ' + JSON.stringify(queue?.data?.summary)
);

const ratings = [2, 0, 3, 1];
for (let i = 0; i < Math.min(cards.length, ratings.length); i += 1) {
  const card = cards[i];
  const res = await call('/api/study/review', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ userCardId: card.userCardId, rating: ratings[i], elapsedMs: 2500 }),
  });
  check(
    `评级 ${card.content} = ${ratings[i]}`,
    Boolean(res?.data?.card),
    res?.data
      ? `stage ${res.data.card.stage} · ${res.data.card.intervalDays}d · ${res.data.feedback.intervalLabel}`
      : JSON.stringify(res?.error)
  );
}

const stats = await call('/api/stats/overview', { headers: H });
check(
  '统计聚合',
  stats?.data?.today?.reviewed === Math.min(cards.length, ratings.length),
  `reviewed=${stats?.data?.today?.reviewed} accuracy=${stats?.data?.today?.accuracy}% streak=${stats?.data?.streak?.current}`
);

const me = await call('/api/auth/me', { headers: H });
check('当前用户', me?.data?.user?.email === email, `tz=${me?.data?.user?.timezone}`);

const badRating = await call('/api/study/review', {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ userCardId: cards[0]?.userCardId, rating: 9 }),
});
check('非法评级被拒', badRating?.error?.code === 'invalid_rating', badRating?.error?.code);

const noAuth = await call('/api/stats/overview');
check('未鉴权被拒', noAuth?.error?.code === 'unauthorized', noAuth?.error?.code);

await call('/api/auth/logout', { method: 'POST', headers: H });
const revoked = await call('/api/stats/overview', { headers: H });
check('登出后令牌立即失效', revoked?.error?.code === 'session_revoked', revoked?.error?.code);

console.log(`\n${failed === 0 ? '全部通过' : `${failed} 项失败`}  ·  ${BASE}`);
process.exit(failed === 0 ? 0 : 1);
