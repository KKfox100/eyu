/**
 * SM-2 变体实现（4 级反馈）
 *
 * 设计要点
 * - 完全无副作用、不依赖 Date.now()，便于单元测试与回放。
 * - 基础间隔表 BASE_INTERVALS 精确对应需求里的 1d → 3d → 7d → 14d → 30d 曲线。
 * - EF 只作为「难度修正系数」参与乘法，且被夹在 [1.3, 2.8]，
 *   避免长期 3 分（Easy）导致间隔指数爆炸。
 */

import type { Rating, UserCardState } from '../types';

/** 阶段 0 表示尚未真正进入长间隔复习；下标即 stage */
export const BASE_INTERVALS = [0, 1, 3, 7, 14, 30, 60, 120, 240] as const;
export const MAX_STAGE = BASE_INTERVALS.length - 1;

export const MIN_EF = 1.3;
export const MAX_EF = 2.8;
export const DEFAULT_EF = 2.5;

/** 「忘记」后在当天内重刷的间隔（分钟） */
export const RELEARN_MINUTES = 10;
/** 间隔上限（天），防止 EF 累加后出现 10 年复习间隔 */
export const MAX_INTERVAL_DAYS = 365;

export interface CardMemoryState {
  stage: number;
  easinessFactor: number;
  intervalDays: number;
  lapses: number;
  reps: number;
}

export interface ScheduleInput extends Partial<CardMemoryState> {
  /** 当前状态，用于决定 new/learning/review 的迁移 */
  state?: UserCardState;
}

export interface ScheduleResult {
  stage: number;
  easinessFactor: number;
  intervalDays: number;
  lapses: number;
  reps: number;
  state: UserCardState;
  /** 下次复习时间（UTC ISO8601） */
  nextReviewAt: string;
  /** 距下次复习的毫秒数，便于前端提示 */
  dueInMs: number;
  /** 本次评级是否算作「遗忘」 */
  isLapse: boolean;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * 计算一次复习后的新状态。
 *
 * | rating | 语义 | stage 变化 | EF 变化 | 间隔 |
 * |--------|------|-----------|---------|------|
 * | 0 忘记 | 重置到阶段 0 | → 0 | -0.20 | 10 分钟后重刷 |
 * | 1 模糊 | 原地踏步 | 不变 | -0.15 | 当前间隔 × 0.6（至少 1 天） |
 * | 2 掌握 | 前进一级 | +1 | 不变 | BASE[stage] × EF/2.5 |
 * | 3 熟知 | 跳一级 | +2 | +0.15 | BASE[stage] × EF/2.5 |
 */
export function schedule(
  input: ScheduleInput,
  rating: Rating,
  now: Date = new Date()
): ScheduleResult {
  const prev: CardMemoryState = {
    stage: clamp(Math.trunc(input.stage ?? 0), 0, MAX_STAGE),
    easinessFactor: clamp(input.easinessFactor ?? DEFAULT_EF, MIN_EF, MAX_EF),
    intervalDays: Math.max(0, Math.trunc(input.intervalDays ?? 0)),
    lapses: Math.max(0, Math.trunc(input.lapses ?? 0)),
    reps: Math.max(0, Math.trunc(input.reps ?? 0)),
  };

  let { stage, easinessFactor: ef, intervalDays, lapses } = prev;
  let nextAt: Date;
  let isLapse = false;

  switch (rating) {
    case 0: {
      // 忘记：重置阶段，当天稍后重刷；EF 下调，记录一次 lapse
      isLapse = true;
      lapses += 1;
      ef = clamp(ef - 0.2, MIN_EF, MAX_EF);
      stage = 0;
      intervalDays = 0;
      nextAt = new Date(now.getTime() + RELEARN_MINUTES * 60 * 1000);
      break;
    }
    case 1: {
      // 模糊：不前进，间隔缩短
      ef = clamp(ef - 0.15, MIN_EF, MAX_EF);
      intervalDays = Math.max(
        1,
        Math.min(MAX_INTERVAL_DAYS, Math.round(Math.max(prev.intervalDays, 1) * 0.6))
      );
      nextAt = addDays(now, intervalDays);
      break;
    }
    case 2: {
      // 掌握：标准曲线推进
      stage = clamp(stage + 1, 0, MAX_STAGE);
      intervalDays = computeInterval(stage, ef);
      nextAt = addDays(now, intervalDays);
      break;
    }
    case 3: {
      // 熟知：跨一级，EF 上调
      ef = clamp(ef + 0.15, MIN_EF, MAX_EF);
      stage = clamp(stage + 2, 0, MAX_STAGE);
      intervalDays = computeInterval(stage, ef);
      nextAt = addDays(now, intervalDays);
      break;
    }
    default:
      throw new Error(`invalid rating: ${rating}`);
  }

  const reps = prev.reps + 1;
  // 首次学习（reps 从 0 → 1）仍标记 learning，避免统计上「一天就学会」
  const state: UserCardState = intervalDays <= 0 ? 'learning' : reps <= 1 ? 'learning' : 'review';

  return {
    stage,
    easinessFactor: round(ef),
    intervalDays,
    lapses,
    reps,
    state,
    nextReviewAt: nextAt.toISOString(),
    dueInMs: nextAt.getTime() - now.getTime(),
    isLapse,
  };
}

function computeInterval(stage: number, ef: number): number {
  const base = BASE_INTERVALS[clamp(stage, 0, MAX_STAGE)];
  const adjusted = Math.round(base * (ef / DEFAULT_EF));
  return clamp(adjusted, 1, MAX_INTERVAL_DAYS);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * 人类可读的下次复习描述，用于 API 响应和 UI 提示
 */
export function describeInterval(result: ScheduleResult): string {
  if (result.intervalDays === 0) return `${RELEARN_MINUTES} 分钟后`;
  if (result.intervalDays === 1) return '明天';
  if (result.intervalDays < 30) return `${result.intervalDays} 天后`;
  if (result.intervalDays < 365) return `${Math.round(result.intervalDays / 30)} 个月后`;
  return '一年后';
}
