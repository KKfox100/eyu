import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractJson, readAiText, repairTruncatedJson, sanitizeCards } from '../src/lib/clip.ts';
import {
  buildReminderText,
  buildWebhookPayload,
  isAllowedWebhook,
  webhookKind,
} from '../src/lib/webhook.ts';

test('extractJson：裸 JSON', () => {
  assert.deepEqual(extractJson('{"cards":[]}'), { cards: [] });
});

test('extractJson：带 ```json 围栏和前后废话', () => {
  const raw = '好的，结果如下：\n```json\n{"cards":[{"type":"word"}]}\n```\n希望有帮助。';
  assert.deepEqual(extractJson(raw), { cards: [{ type: 'word' }] });
});

test('extractJson：不是 JSON 就返回 null', () => {
  assert.equal(extractJson('抱歉，我无法处理'), null);
  assert.equal(extractJson('{"cards": [}'), null);
});

test('extractJson：输出截断在例句中间时，前面完整的卡要救回来', () => {
  // 模型写到第二张卡的第二个例句就断了（max_tokens 用尽）
  const raw =
    '{"cards":[{"type":"word","content":"clarify","definition":"v. 澄清","examples":[{"en":"Let me clarify.","zh":"我澄清一下。"}]},' +
    '{"type":"chunk","content":"touch base","definition":"v. 联系","examples":[{"en":"I will touch base tomorrow."';
  const parsed = extractJson(raw) as { cards: unknown[] };
  const cards = sanitizeCards(parsed);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].content, 'clarify');
});

test('extractJson：截断在字符串里也不产出半个字段', () => {
  const raw = '{"cards":[{"type":"word","content":"clarify","definition":"v. 澄';
  const cards = sanitizeCards(extractJson(raw));
  // 这张卡还没写完，宁可丢掉也不能塞半句释义进去
  assert.equal(cards.length, 0);
});

test('repairTruncatedJson：补全未闭合的括号栈', () => {
  assert.deepEqual(repairTruncatedJson('{"a":[{"b":1}'), { a: [{ b: 1 }] });
  assert.equal(repairTruncatedJson('no json here'), null);
});

test('sanitizeCards：丢弃类型不对、字段缺失、无例句的卡片', () => {
  const cards = sanitizeCards({
    cards: [
      { type: 'word', content: 'negotiate', definition: 'v. 谈判', examples: [{ en: 'We negotiate.', zh: '我们谈判。' }] },
      { type: 'sentence', content: 'x', definition: 'y', examples: [{ en: 'z' }] },
      { type: 'word', content: '', definition: 'v. 空', examples: [{ en: 'z' }] },
      { type: 'word', content: 'noexample', definition: 'v. 没例句', examples: [] },
    ],
  });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].content, 'negotiate');
});

test('sanitizeCards：同内容去重，且限制数量', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    type: 'word',
    content: `word${i}`,
    definition: `v. 词${i}`,
    examples: [{ en: `Use word${i} here.` }],
  }));
  many.push({ ...many[0] });
  const cards = sanitizeCards({ cards: many });
  assert.equal(cards.length, 12);
  assert.equal(new Set(cards.map((c) => c.content)).size, 12);
});

test('sanitizeCards：输入不是对象也不崩', () => {
  assert.deepEqual(sanitizeCards(null), []);
  assert.deepEqual(sanitizeCards({}), []);
  assert.deepEqual(sanitizeCards({ cards: 'nope' }), []);
});

test('readAiText：OpenAI 兼容格式读 choices，老格式读 response', () => {
  // 新的兼容格式：顶层 response 是空串，正文在 choices 里
  assert.equal(
    readAiText({
      response: '',
      choices: [{ message: { role: 'assistant', content: '{"cards":[]}' } }],
    }),
    '{"cards":[]}'
  );
  assert.equal(readAiText({ response: 'plain text' }), 'plain text');
  assert.equal(readAiText('  bare string  '), 'bare string');
  // 推理模型把 token 烧在 reasoning 上，content 是 null —— 当空处理，换下一个模型
  assert.equal(readAiText({ choices: [{ message: { content: null, reasoning: '想……' } }] }), '');
  assert.equal(readAiText(null), '');
});

test('webhook 白名单只认三家的 https 地址', () => {
  assert.equal(
    isAllowedWebhook('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc'),
    true
  );
  assert.equal(isAllowedWebhook('https://oapi.dingtalk.com/robot/send?access_token=x'), true);
  assert.equal(isAllowedWebhook('https://open.feishu.cn/open-apis/bot/v2/hook/x'), true);
  assert.equal(isAllowedWebhook('https://evil.example.com/hook'), false);
  assert.equal(isAllowedWebhook('http://qyapi.weixin.qq.com/x'), false);
  assert.equal(isAllowedWebhook('不是网址'), false);
});

test('webhook 类型识别与报文格式', () => {
  assert.equal(webhookKind('https://qyapi.weixin.qq.com/a'), 'wecom');
  assert.equal(webhookKind('https://open.larksuite.com/a'), 'feishu');
  assert.equal(webhookKind('https://example.com/a'), null);

  assert.deepEqual(buildWebhookPayload('wecom', 'hi'), {
    msgtype: 'text',
    text: { content: 'hi' },
  });
  assert.deepEqual(buildWebhookPayload('feishu', 'hi'), {
    msg_type: 'text',
    content: { text: 'hi' },
  });
});

test('提醒文案：带到期数与站点链接', () => {
  const text = buildReminderText({ name: '小林', due: 12, done: 0, streak: 7 });
  assert.ok(text.includes('小林'));
  assert.ok(text.includes('12 张'));
  assert.ok(text.includes('7 天'));
  assert.ok(text.includes('https://'));
});

test('提醒文案：站点地址可覆盖，换域名不用改代码', () => {
  const text = buildReminderText({
    name: null,
    due: 3,
    done: 0,
    streak: 0,
    siteUrl: 'https://eyu.example.com',
  });
  assert.ok(text.includes('https://eyu.example.com'));
  assert.ok(!text.includes('letsgo'));
});

test('提醒文案：没到期卡时说学新词', () => {
  const text = buildReminderText({ name: null, due: 0, done: 0, streak: 0 });
  assert.ok(text.includes('同学'));
  assert.ok(text.includes('新词'));
});
