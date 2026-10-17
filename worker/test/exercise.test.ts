import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCloze,
  buildOptions,
  buildOrder,
  checkOrder,
  type Example,
} from '../src/lib/exercise.ts';

const ex = (en: string, zh?: string, scene?: string): Example => ({ en, zh, scene });

/** 固定序列的伪随机，保证测试可复现 */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test('完形填空：原形直接命中', () => {
  const result = buildCloze([ex('Let me make you a coffee.', '我给你冲杯咖啡吧。')], {
    content: 'make',
    type: 'word',
  });
  assert.ok(result);
  assert.equal(result.sentence, 'Let me ____ you a coffee.');
  assert.equal(result.answer, 'make');
  assert.equal(result.zh, '我给你冲杯咖啡吧。');
});

test('完形填空：词形变化也能命中', () => {
  const cases: Array<[string, string]> = [
    ['It makes things easier.', 'make'],
    ['She is making dinner.', 'make'],
    ['He studies every night.', 'study'],
    ['I studied all weekend.', 'study'],
    ["It's getting late.", 'get'],
    ['He is running late.', 'run'],
    ['She uses it every day.', 'use'],
  ];
  for (const [sentence, word] of cases) {
    const result = buildCloze([ex(sentence)], { content: word, type: 'word' });
    assert.ok(result, `${sentence} 应能挖空 ${word}`);
    assert.ok(result.sentence.includes('____'), sentence);
  }
});

test('完形填空：语块按 token 序列匹配，忽略大小写与标点', () => {
  const result = buildCloze([ex("Hey Tom, how's it going?", '嘿 Tom，最近怎么样？')], {
    content: "How's it going?",
    type: 'chunk',
  });
  assert.ok(result);
  assert.equal(result.sentence, 'Hey Tom, ____');
  assert.equal(result.answer, "How's it going?");
});

test('完形填空：句末标点跟着空格保留', () => {
  const result = buildCloze([ex('How did the meeting go?')], { content: 'go', type: 'word' });
  assert.ok(result);
  assert.equal(result.sentence, 'How did the meeting ____?');
});

test('完形填空：answerForm 记录原句里的真实形态', () => {
  const inflected = buildCloze([ex('It takes 20 minutes to get there.')], {
    content: 'take',
    type: 'word',
  });
  assert.ok(inflected);
  assert.equal(inflected.answer, 'take');
  assert.equal(inflected.answerForm, 'takes');

  const base = buildCloze([ex('Let me make you a coffee.')], { content: 'make', type: 'word' });
  assert.ok(base);
  assert.equal(base.answerForm, 'make');
});

test('完形填空：语法卡不参与（骨架不是字面串）', () => {
  const result = buildCloze([ex('It takes me 40 minutes to get to work.')], {
    content: 'It takes sb. + 时间 + to do sth.',
    type: 'grammar',
  });
  assert.equal(result, null);
});

test('完形填空：例句里找不到目标词就返回 null，不硬造题', () => {
  const result = buildCloze([ex('The weather is nice today.')], {
    content: 'negotiate',
    type: 'word',
  });
  assert.equal(result, null);
});

test('完形填空：句子过长时跳过', () => {
  const long = Array.from({ length: 24 }, (_, i) => `word${i}`).join(' ') + ' make';
  const result = buildCloze([ex(long)], { content: 'make', type: 'word' });
  assert.equal(result, null);
});

test('语序重组：词块数量守恒，且不与原序相同', () => {
  const rand = seeded(7);
  const result = buildOrder([ex('This change will make things easier.', '这个改动会让事情更简单。')], rand);
  assert.ok(result);
  assert.deepEqual(result.answerTokens, ['This', 'change', 'will', 'make', 'things', 'easier.']);
  assert.equal(result.shuffled.length, 6);
  assert.deepEqual([...result.shuffled].sort(), [...result.answerTokens].sort());
  assert.notDeepEqual(result.shuffled, result.answerTokens);
  assert.equal(result.zh, '这个改动会让事情更简单。');
});

test('语序重组：过短或过长的句子被过滤', () => {
  const rand = seeded(3);
  assert.equal(buildOrder([ex('Hi there.')], rand), null);
  // 四个词块也太送分，至少 5 个
  assert.equal(buildOrder([ex('I got your message.')], rand), null);
  assert.equal(buildOrder([ex(Array.from({ length: 20 }, (_, i) => `w${i}`).join(' '))], rand), null);
});

test('选项：四个互不相同，包含正确答案，优先长度接近', () => {
  // 12 个四字母左右的短词 + 2 个长词，长词应当被长度筛选排除在外
  const pool = [
    'take', 'get', 'give', 'put', 'bring', 'find',
    'tell', 'work', 'call', 'feel', 'leave', 'keep',
    'negotiate', 'understand',
  ];
  const options = buildOptions('make', pool, seeded(11));
  assert.equal(options.length, 4);
  assert.equal(new Set(options.map((o) => o.toLowerCase())).size, 4);
  assert.ok(options.includes('make'));
  assert.ok(!options.includes('negotiate'));
  assert.ok(!options.includes('understand'));
});

test('选项：词库不足时不崩，有几个给几个', () => {
  const options = buildOptions('make', ['take'], seeded(5));
  assert.deepEqual(options.sort(), ['make', 'take']);
});

test('语序校验', () => {
  const answer = ['I', 'will', 'call', 'you.'];
  assert.equal(checkOrder(answer, ['I', 'will', 'call', 'you.']), true);
  assert.equal(checkOrder(answer, ['I', 'call', 'will', 'you.']), false);
  assert.equal(checkOrder(answer, ['I', 'will', 'call']), false);
});
