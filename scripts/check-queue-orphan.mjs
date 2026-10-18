#!/usr/bin/env node
/**
 * 队列孤儿卡回归测试
 *
 * 复现的 bug：打开「开始今日学习」→ 队列把 20 张新卡写成 state='new' 的 user_cards 行 →
 * 一张都不学就退出 → 再进来时既不在「到期」里（state 不含 new），也不在「全新卡」里
 * （WHERE uc.id IS NULL 排除了已引入的），于是队列永久为 0，还谎报「今日新词额度已用完」。
 *
 * 用法： BASE=http://127.0.0.1:8788 node scripts/check-queue-orphan.mjs
 */

const BASE = (process.env.BASE || 'http://127.0.0.1:8788').replace(/\/$/, '');

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? '  ' + detail : ''}`);
  if (!ok) failed += 1;
};

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

const email = `orphan${Date.now()}@eyu.app`;
const reg = await call('/api/auth/register', {
  method: 'POST',
  body: { email, password: 'smoke12345', displayName: '孤儿卡测试' },
});
const token = reg.json?.data?.token;
check('注册', Boolean(token), email);
if (!token) process.exit(1);

const queue = async () => (await call('/api/study/queue?limit=30', { token })).json?.data;

// ---- 1. 首次拉队列：发放新卡 ----
const q1 = await queue();
const ids1 = (q1?.queue ?? []).map((c) => c.cardId);
check('首次队列非空', ids1.length > 0, `len=${ids1.length}`);
check(
  '首次队列全部是新卡',
  (q1?.queue ?? []).every((c) => c.isNew === true),
  `isNew=${(q1?.queue ?? []).filter((c) => c.isNew).length}/${ids1.length}`
);
check(
  'summary 带待学字段',
  typeof q1?.summary?.pendingInQueue === 'number' &&
    typeof q1?.summary?.newQuotaLeft === 'number' &&
    typeof q1?.summary?.newDeckLeft === 'number',
  JSON.stringify(q1?.summary)
);

// ---- 2. 一张都不学，再拉一次：必须是同一批卡（核心断言）----
const q2 = await queue();
const ids2 = (q2?.queue ?? []).map((c) => c.cardId);
check('二次队列不再为空（修复前 len=0）', ids2.length > 0, `len=${ids2.length}`);
check('二次队列与首次一致', JSON.stringify(ids2) === JSON.stringify(ids1), `${ids2.length} vs ${ids1.length}`);
check(
  '二次队列走的是「待学」档',
  q2?.summary?.pendingInQueue === ids2.length && q2?.summary?.newInQueue === 0,
  `pending=${q2?.summary?.pendingInQueue} fresh=${q2?.summary?.newInQueue}`
);
check('今日额度已扣满', q2?.summary?.newQuotaLeft === 0, `quotaLeft=${q2?.summary?.newQuotaLeft}`);

// ---- 3. 学掉一张，剩下的仍在队列里 ----
const first = q2?.queue?.[0];
const rev = await call('/api/study/review', {
  method: 'POST',
  token,
  body: { userCardId: first.userCardId, rating: 2, mode: 'recall', elapsedMs: 1200 },
});
check('评级提交', rev.status === 200, `state=${rev.json?.data?.card?.state}`);

const q3 = await queue();
const ids3 = (q3?.queue ?? []).map((c) => c.cardId);
check('学掉一张后队列 -1', ids3.length === ids2.length - 1, `len=${ids3.length}`);
check('已学卡不再出现', !ids3.includes(first.cardId), first.cardId);

// ---- 4. 全部学完后队列为空，且原因是「额度用完」而不是「词库学完」 ----
let left = [...q3.queue];
let guard = 0;
while (left.length && guard < 40) {
  const card = left[0];
  await call('/api/study/review', {
    method: 'POST',
    token,
    body: { userCardId: card.userCardId, rating: 3, mode: 'recall', elapsedMs: 900 },
  });
  const next = await queue();
  left = next?.queue ?? [];
  guard += 1;
}
check('学完后队列为空', left.length === 0, `剩余=${left.length}`);

const qEnd = await queue();
const s = qEnd?.summary ?? {};
check(
  '空队列原因可区分',
  s.newQuotaLeft === 0 && s.newDeckLeft > 0 && s.pendingInQueue === 0,
  `quotaLeft=${s.newQuotaLeft} deckLeft=${s.newDeckLeft} pending=${s.pendingInQueue}`
);

// ---- 5. 加练：额度用完但能突破 ----
const qExtra = (await call('/api/study/queue?limit=30&extra=1', { token })).json?.data;
check('加练能拿到新卡', (qExtra?.queue ?? []).length > 0, `len=${qExtra?.queue?.length}`);

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
