<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    data: Array<{ date: string; count: number }>;
    days?: number;
  }>(),
  { days: 90 }
);

interface Cell {
  date: string;
  count: number;
  level: number;
  weekday: number;
}

function levelOf(count: number): number {
  if (count <= 0) return 0;
  if (count < 10) return 1;
  if (count < 20) return 2;
  if (count < 40) return 3;
  return 4;
}

const cells = computed<Cell[]>(() => {
  const map = new Map(props.data.map((d) => [d.date, d.count]));
  const today = new Date();
  const out: Cell[] = [];
  for (let i = props.days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = map.get(key) ?? 0;
    out.push({ date: key, count, level: levelOf(count), weekday: d.getDay() });
  }
  return out;
});

/** 按周切分成列（GitHub 风格：每列一周，周日起） */
const weeks = computed<Cell[][]>(() => {
  const out: Cell[][] = [];
  let column: Cell[] = [];

  const pad = (weekday: number): Cell => ({ date: '', count: -1, level: -1, weekday });

  cells.value.forEach((cell, i) => {
    if (i === 0) for (let k = 0; k < cell.weekday; k += 1) column.push(pad(k));
    column.push(cell);
    if (column.length === 7) {
      out.push(column);
      column = [];
    }
  });
  if (column.length) {
    while (column.length < 7) column.push(pad(column.length));
    out.push(column);
  }
  return out;
});

const levelClass = [
  'bg-slate-100 dark:bg-slate-800',
  'bg-brand-200 dark:bg-brand-900',
  'bg-brand-400 dark:bg-brand-700',
  'bg-brand-500 dark:bg-brand-500',
  'bg-brand-700 dark:bg-brand-400',
];

function monthLabel(week: Cell[]): string {
  const first = week.find((c) => c.date);
  if (!first) return '';
  const d = new Date(`${first.date}T00:00:00Z`);
  return d.getUTCDate() <= 7 ? `${d.getUTCMonth() + 1}月` : '';
}
</script>

<template>
  <div class="flex gap-[3px] overflow-x-auto pb-1">
    <div v-for="(week, wi) in weeks" :key="wi" class="flex flex-col gap-[3px]">
      <span class="h-3 whitespace-nowrap text-[9px] leading-3 text-slate-400">
        {{ monthLabel(week) }}
      </span>
      <div
        v-for="(cell, ci) in week"
        :key="ci"
        class="h-3 w-3 rounded-[3px]"
        :class="cell.level < 0 ? 'bg-transparent' : levelClass[cell.level]"
        :title="cell.date ? `${cell.date}：${cell.count} 次` : ''"
      />
    </div>
  </div>

  <div class="mt-3 flex items-center justify-end gap-1 text-[10px] text-slate-400">
    <span>少</span>
    <div v-for="(cls, i) in levelClass" :key="i" class="h-2.5 w-2.5 rounded-[2px]" :class="cls" />
    <span>多</span>
  </div>
</template>
