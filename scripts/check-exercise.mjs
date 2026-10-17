#!/usr/bin/env node
/**
 * 练习生成器抽样检查
 *
 *   node scripts/check-exercise.mjs                     # 打线上
 *   BASE=http://127.0.0.1:8787 node scripts/check-exercise.mjs
 *
 * 流程：注册新号 → 领 30 张新卡 → 全部评「掌握」→ 逐张请求练习题，
 * 打印生成的题干，人工看一眼有没有挖错空、切错词。
 */

const BASE = process.env.BASE || 'https://eyu.pages.dev';
const SAMPLE = Number(process.env.SAMPLE || 12);

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${path} → ${JSON.stringify(json.error)}`);
  return json.data;
}

const email = `ex${Date.now()}@eyu.app`;
const { token } = await call('/api/auth/register', {
  method: 'POST',
  body: { email, password: 'eyu12345' },
});
console.log(`账号 ${email}\n`);

const { queue } = await call('/api/study/queue?limit=30', { token });
console.log(`领到 ${queue.length} 张新卡`);

for (const card of queue) {
  await call('/api/study/review', {
    method: 'POST',
    token,
    body: { userCardId: card.userCardId, rating: 2, mode: 'recall' },
  });
}
console.log('全部评为「掌握」，开始抽样出题\n');

const stats = { cloze: 0, order: 0, none: 0 };

for (const card of queue.slice(0, SAMPLE)) {
  const res = await call(`/api/study/exercise?userCardId=${card.userCardId}&mode=auto`, { token });

  if (!res.available) {
    stats.none += 1;
    console.log(`✗ ${card.type.padEnd(7)} ${card.content} → 出不了题（${res.reason}）`);
    continue;
  }

  const ex = res.exercise;
  stats[ex.mode] += 1;

  if (ex.mode === 'cloze') {
    console.log(`· ${card.type.padEnd(7)} ${card.content}`);
    console.log(`  ${ex.sentence}`);
    console.log(`  选项：${ex.options.join(' / ')}  ← ${ex.answer}`);
  } else {
    console.log(`· ${card.type.padEnd(7)} ${card.content}`);
    console.log(`  打乱：${ex.shuffled.join(' ')}`);
    console.log(`  原句：${ex.answerTokens.join(' ')}`);
  }
  console.log('');
}

console.log(`完形 ${stats.cloze} · 语序 ${stats.order} · 无题 ${stats.none}`);
process.exit(stats.none === SAMPLE ? 1 : 0);
