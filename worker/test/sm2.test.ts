import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_INTERVALS,
  MAX_EF,
  MAX_INTERVAL_DAYS,
  MIN_EF,
  RELEARN_MINUTES,
  describeInterval,
  schedule,
  type ScheduleInput,
} from '../src/lib/sm2.ts';

const NOW = new Date('2026-10-17T02:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function daysBetween(iso: string): number {
  return Math.round((new Date(iso).getTime() - NOW.getTime()) / DAY);
}

test('新卡「掌握」→ 1 天，随后 3 / 7 / 14 / 30 天', () => {
  let state: ScheduleInput = { stage: 0, easinessFactor: 2.5, intervalDays: 0, lapses: 0, reps: 0 };
  const expected = [1, 3, 7, 14, 30];

  for (let i = 0; i < expected.length; i += 1) {
    const result = schedule(state, 2, NOW);
    assert.equal(result.intervalDays, expected[i], `第 ${i + 1} 次复习间隔应为 ${expected[i]} 天`);
    assert.equal(daysBetween(result.nextReviewAt), expected[i]);
    state = {
      stage: result.stage,
      easinessFactor: result.easinessFactor,
      intervalDays: result.intervalDays,
      lapses: result.lapses,
      reps: result.reps,
    };
  }
});

test('基础间隔表就是 1/3/7/14/30', () => {
  assert.deepEqual(BASE_INTERVALS.slice(1, 6), [1, 3, 7, 14, 30]);
});

test('「熟知」跳一级并抬高 EF', () => {
  const result = schedule({ stage: 0, easinessFactor: 2.5, intervalDays: 0, lapses: 0, reps: 0 }, 3, NOW);
  assert.equal(result.stage, 2);
  assert.equal(result.easinessFactor, 2.65);
  assert.equal(result.intervalDays, 3);
});

test('「忘记」重置阶段、10 分钟后重刷、lapses+1', () => {
  const result = schedule(
    { stage: 4, easinessFactor: 2.5, intervalDays: 14, lapses: 2, reps: 6 },
    0,
    NOW
  );
  assert.equal(result.stage, 0);
  assert.equal(result.intervalDays, 0);
  assert.equal(result.lapses, 3);
  assert.equal(result.isLapse, true);
  assert.equal(result.state, 'learning');
  assert.equal(result.nextReviewAt, new Date(NOW.getTime() + RELEARN_MINUTES * 60_000).toISOString());
});

test('「模糊」缩短间隔且不前进', () => {
  const result = schedule(
    { stage: 3, easinessFactor: 2.5, intervalDays: 7, lapses: 0, reps: 4 },
    1,
    NOW
  );
  assert.equal(result.stage, 3);
  assert.ok(result.intervalDays < 7, '间隔应缩短');
  assert.equal(result.intervalDays, 4);
  assert.equal(result.easinessFactor, 2.35);
});

test('EF 下限 1.3：连续忘记不会击穿', () => {
  let ef = 2.5;
  for (let i = 0; i < 20; i += 1) {
    ef = schedule({ stage: 0, easinessFactor: ef, intervalDays: 0, lapses: i, reps: i }, 0, NOW)
      .easinessFactor;
  }
  assert.equal(ef, MIN_EF);
});

test('EF 上限 2.8：连续熟知不会击穿', () => {
  let ef = 2.5;
  for (let i = 0; i < 20; i += 1) {
    ef = schedule({ stage: 0, easinessFactor: ef, intervalDays: 1, lapses: 0, reps: i }, 3, NOW)
      .easinessFactor;
  }
  assert.equal(ef, MAX_EF);
});

test('间隔不会超过 365 天上限', () => {
  const result = schedule(
    { stage: 8, easinessFactor: MAX_EF, intervalDays: 240, lapses: 0, reps: 30 },
    3,
    NOW
  );
  assert.ok(result.intervalDays <= MAX_INTERVAL_DAYS);
  // 240 × (2.8 / 2.5) = 268.8 → 269，已接近上限
  assert.equal(result.intervalDays, 269);
});

test('阶段不会越界', () => {
  const result = schedule(
    { stage: BASE_INTERVALS.length - 1, easinessFactor: 2.5, intervalDays: 240, lapses: 0, reps: 40 },
    3,
    NOW
  );
  assert.equal(result.stage, BASE_INTERVALS.length - 1);
});

test('首次复习后状态为 learning，第二次起为 review', () => {
  const first = schedule({ reps: 0 }, 2, NOW);
  assert.equal(first.state, 'learning');
  const second = schedule({ reps: 1, stage: first.stage, intervalDays: first.intervalDays }, 2, NOW);
  assert.equal(second.state, 'review');
});

test('describeInterval 输出可读文案', () => {
  assert.equal(describeInterval(schedule({}, 0, NOW)), '10 分钟后');
  assert.equal(describeInterval(schedule({ stage: 0, intervalDays: 0, reps: 1 }, 2, NOW)), '明天');
  assert.equal(describeInterval(schedule({ stage: 1, intervalDays: 1, reps: 2 }, 2, NOW)), '3 天后');
});

test('非法 rating 直接抛错', () => {
  assert.throws(() => schedule({}, 9 as never, NOW));
});
