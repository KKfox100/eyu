/**
 * 剪藏质量抽样：注册新号 → 解析一段英文 → 打印卡片 → 导入 → 再导入验证去重
 * 用法：node scripts/check-clip.mjs
 *       BASE=http://127.0.0.1:8787 node scripts/check-clip.mjs
 */
const BASE = process.env.BASE || 'https://eyu.letsgo.cc.cd';

async function call(path, options = {}) {
  const response = await fetch(BASE + path, {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: 'Bearer ' + options.token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (!payload.ok) throw new Error(`${path} → ${JSON.stringify(payload.error)}`);
  return payload.data;
}

const TEXT = `Remote work has changed the way we communicate. Instead of walking over to a colleague's desk, we now send a quick message and hope it lands well. The trouble is that tone is easy to misread in writing. A short reply that would sound friendly in person can come across as cold on screen.

Most teams get around this by over-communicating. They spell out what they need, they ask clarifying questions, and they confirm deadlines twice. It takes a little more effort up front, but it saves a lot of back-and-forth later.

If you are new to a remote team, try to touch base with one person every day. It does not have to be a long call. A two-minute check-in is enough to keep you in the loop.`;

const reg = await call('/api/auth/register', {
  method: 'POST',
  body: { email: `clip${Date.now()}@eyu.app`, password: 'eyu12345' },
});
const token = reg.token;

const t0 = Date.now();
const result = await call('/api/clip/analyze', { method: 'POST', token, body: { text: TEXT } });
console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s · 模型 ${result.model} · 原文 ${result.chars} 字符`);
console.log(`卡片数 ${result.cards.length}\n`);

const byType = {};
for (const card of result.cards) {
  byType[card.type] = (byType[card.type] || 0) + 1;
  console.log(`[${card.type}] ${card.content} ${card.phonetic || ''}`);
  console.log('  释义:', card.definition);
  if (card.grammarPattern) console.log('  骨架:', card.grammarPattern);
  card.examples.forEach((ex) => console.log('  例:', ex.en, '/', ex.zh || ''));
  console.log('');
}
console.log('类型分布:', byType);

const first = await call('/api/clip/import', { method: 'POST', token, body: { cards: result.cards } });
console.log('\n首次导入:', first.imported, '张，跳过:', first.skipped);

const second = await call('/api/clip/import', { method: 'POST', token, body: { cards: result.cards } });
console.log('重复导入:', second.imported, '张，跳过:', second.skipped);

if (second.imported !== 0) {
  console.error('\n去重失效：同一批卡片被导入了两次');
  process.exit(1);
}
if (result.cards.length === 0) {
  console.error('\n没解析出卡片');
  process.exit(1);
}
console.log('\n通过');
