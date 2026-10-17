<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, ApiError, type Overview } from '../lib/api';
import Heatmap from '../components/Heatmap.vue';

const data = ref<Overview | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const maxDayCount = computed(() => {
  if (!data.value?.heatmap.length) return 0;
  return Math.max(...data.value.heatmap.map((d) => d.count));
});

const activeDays = computed(() => data.value?.heatmap.filter((d) => d.count > 0).length ?? 0);

const totalReviewed = computed(() =>
  data.value?.heatmap.reduce((sum, d) => sum + d.count, 0) ?? 0
);

const typeBars = computed(() => {
  const byType = data.value?.totals.byType ?? {};
  const total = Object.values(byType).reduce((a, b) => a + b, 0) || 1;
  return [
    { key: 'word', label: '单词', value: byType.word ?? 0, cls: 'bg-brand-500' },
    { key: 'chunk', label: '语块', value: byType.chunk ?? 0, cls: 'bg-emerald-500' },
    { key: 'grammar', label: '句型', value: byType.grammar ?? 0, cls: 'bg-amber-500' },
  ].map((item) => ({ ...item, percent: Math.round((item.value / total) * 100) }));
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await api.overview(120);
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="mx-auto w-full max-w-lg flex-1 px-5 pb-8 pt-6 safe-top">
    <header class="mb-5">
      <h1 class="text-2xl font-bold tracking-tight">学习统计</h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">数据来自每一次复习记录</p>
    </header>

    <div v-if="loading" class="space-y-4">
      <div class="h-28 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
      <div class="h-40 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
    </div>

    <div v-else-if="error" class="card-surface p-6 text-center text-sm text-slate-500">
      {{ error }}
      <button class="btn-ghost mt-4 w-full" @click="load">重试</button>
    </div>

    <template v-else-if="data">
      <!-- 关键指标 -->
      <section class="grid grid-cols-2 gap-3">
        <div class="card-surface p-4">
          <p class="text-xs text-slate-400">连续打卡</p>
          <p class="mt-1 text-3xl font-bold tabular-nums">
            {{ data.streak.current }}<span class="ml-1 text-sm font-medium text-slate-400">天</span>
          </p>
          <p class="mt-1 text-[11px] text-slate-400">最长 {{ data.streak.longest }} 天</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs text-slate-400">累计复习</p>
          <p class="mt-1 text-3xl font-bold tabular-nums">
            {{ totalReviewed }}<span class="ml-1 text-sm font-medium text-slate-400">次</span>
          </p>
          <p class="mt-1 text-[11px] text-slate-400">近 120 天</p>
        </div>
      </section>

      <!-- 热力图 -->
      <section class="card-surface mt-4 p-5">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold">打卡热力图</h2>
          <span class="text-[11px] text-slate-400">
            活跃 {{ activeDays }} 天 · 单日最高 {{ maxDayCount }}
          </span>
        </div>
        <Heatmap :data="data.heatmap" :days="120" />
      </section>

      <!-- 卡片构成 -->
      <section class="card-surface mt-4 p-5">
        <h2 class="mb-4 text-sm font-semibold">卡片构成</h2>
        <div class="space-y-3">
          <div v-for="bar in typeBars" :key="bar.key">
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="font-medium">{{ bar.label }}</span>
              <span class="tabular-nums text-slate-400">{{ bar.value }} 张 · {{ bar.percent }}%</span>
            </div>
            <div class="progress-track">
              <div class="h-full rounded-full transition-all" :class="bar.cls" :style="{ width: `${bar.percent}%` }" />
            </div>
          </div>
        </div>
      </section>

      <!-- 记忆分布 -->
      <section class="card-surface mt-4 p-5">
        <h2 class="mb-4 text-sm font-semibold">记忆状态</h2>
        <dl class="grid grid-cols-2 gap-y-4 text-sm">
          <div>
            <dt class="text-xs text-slate-400">已入库</dt>
            <dd class="mt-0.5 text-lg font-semibold tabular-nums">{{ data.totals.learned }}</dd>
          </div>
          <div>
            <dt class="text-xs text-slate-400">已熟练（阶段 ≥ 4）</dt>
            <dd class="mt-0.5 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {{ data.totals.mastered }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-slate-400">学习中</dt>
            <dd class="mt-0.5 text-lg font-semibold tabular-nums">{{ data.totals.learning }}</dd>
          </div>
          <div>
            <dt class="text-xs text-slate-400">今日正确率</dt>
            <dd class="mt-0.5 text-lg font-semibold tabular-nums">
              {{ data.today.accuracy === null ? '—' : `${data.today.accuracy}%` }}
            </dd>
          </div>
        </dl>
      </section>
    </template>
  </div>
</template>
