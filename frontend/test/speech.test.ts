import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeSpeechText,
  pickSpeakTarget,
  scoreSpeech,
} from '../src/lib/speech.ts';

test('规范化：大小写、标点、撇号、数字词', () => {
  assert.deepEqual(normalizeSpeechText("It's worth a try!"), ['its', 'worth', 'a', 'try']);
  assert.deepEqual(normalizeSpeechText('It takes 20 minutes.'), ['it', 'takes', '20', 'minutes']);
  assert.deepEqual(normalizeSpeechText('It takes twenty minutes.'), ['it', 'takes', '20', 'minutes']);
  assert.deepEqual(normalizeSpeechText('  '), []);
});

test('完全读对：100 分', () => {
  const r = scoreSpeech('I think it is worth a try.', 'I think it is worth a try');
  assert.equal(r.score, 100);
  assert.equal(r.matched, r.total);
  assert.ok(r.tokens.every((t) => t.ok));
});

test('标点与大小写差异不影响判分', () => {
  assert.equal(scoreSpeech("How's it going?", 'hows it going').score, 100);
});

test('漏词按比例扣分', () => {
  const r = scoreSpeech('I think it is worth a try', 'I think worth a try');
  assert.equal(r.total, 7);
  assert.equal(r.matched, 5);
  assert.equal(r.score, 71);
  assert.deepEqual(
    r.tokens.filter((t) => !t.ok).map((t) => t.word),
    ['it', 'is']
  );
});

test('识别结果多出词也不整句作废', () => {
  const r = scoreSpeech('Let me make you a coffee', 'let me make you a coffee now');
  assert.equal(r.score, 100);
});

test('顺序错乱只按能对上的算', () => {
  const r = scoreSpeech('I will call you back', 'I call will you back');
  assert.ok(r.score >= 60, `实际 ${r.score}`);
  assert.ok(r.score < 100);
});

test('完全不相关：0 分', () => {
  const r = scoreSpeech('Let me make you a coffee', 'the weather is nice today');
  assert.equal(r.score, 0);
  assert.equal(r.matched, 0);
});

test('空识别结果：0 分且不崩', () => {
  const r = scoreSpeech('Hello there', '');
  assert.equal(r.score, 0);
  assert.equal(r.total, 2);
});

test('空目标句：0 分', () => {
  const r = scoreSpeech('', 'whatever');
  assert.equal(r.score, 0);
  assert.equal(r.total, 0);
});

test('数字词与阿拉伯数字互通', () => {
  assert.equal(scoreSpeech('It takes 40 minutes to get to work', 'it takes forty minutes to get to work').score, 100);
});

test('朗读目标：单词/句型读例句，语块读本体', () => {
  const word = pickSpeakTarget({
    type: 'word',
    content: 'make',
    definition: 'v. 制作',
    examples: [{ en: 'Let me make you a coffee.', zh: '我给你冲杯咖啡吧。' }],
  });
  assert.equal(word.text, 'Let me make you a coffee.');
  assert.equal(word.zh, '我给你冲杯咖啡吧。');

  const chunk = pickSpeakTarget({
    type: 'chunk',
    content: "How's it going?",
    definition: '最近怎么样？',
    examples: [{ en: "Hey Tom, how's it going?" }],
  });
  assert.equal(chunk.text, "How's it going?");

  const grammar = pickSpeakTarget({
    type: 'grammar',
    content: 'It takes sb. + 时间 + to do sth.',
    definition: '做某事花费某人多少时间',
    examples: [{ en: 'It takes me 40 minutes to get to work.' }],
  });
  assert.equal(grammar.text, 'It takes me 40 minutes to get to work.');

  const fallback = pickSpeakTarget({
    type: 'word',
    content: 'make',
    definition: 'v. 制作',
    examples: [],
  });
  assert.equal(fallback.text, 'make');
  assert.equal(fallback.zh, 'v. 制作');
});
