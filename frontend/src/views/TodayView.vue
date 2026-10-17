<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError, type Overview } from '../lib/api';
import { useAuth } from '../stores/auth';
import { useTheme } from '../lib/theme';

const router = useRouter();
const { user } = useAuth();
const { isDark, toggleTheme } = useTheme();

const data = ref<Overview | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
/** 今日目标在首次加载时定格，避免学习中目标随 dueNow 减少而抖动 */
const goalSnapshot = ref<number | null>(null);

const todayLabel = computed(() => {
  const d = new Date();
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`;
});

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

const displayName = computed(
  () => user.value?.displayName || user.value?.email?.split('@')[0] || '同学'
);

const totalToday = computed(() => {
  if (!data.value) return 0;
  return data.value.today.reviewed;
});

const dailyGoal = computed(() => {
  if (goalSnapshot.value) return goalSnapshot.value;
  const u = user.value;
  if (!u) return 20;
  const due = data.value?.totals.dueNow ?? 0;
  return Math.max(10, Math.min(80, due + u.dailyNewLimit));
});

const goalPercent = computed(() =>
  Math.min(100, Math.round((totalToday.value / dailyGoal.value) * 100))
);

const hasWork = computed(() => {
  if (!data.value) return false;
  return data.value.totals.dueNow > 0 || data.value.totals.newAvailable > 0;
});

const recentDays = computed(() => {
  if (!data.value) return [];
  const map = new Map(data.value.heatmap.map((d) => [d.date, d.count]));
  const out: Array<{ date: string; count: number; label: string }> = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: user.value?.timezone || 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    out.push({
      date: key,
      count: map.get(key) ?? 0,
      label: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()],
    });
  }
  return out;
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await api.overview(30);
    if (goalSnapshot.value === null && user.value) {
      goalSnapshot.value = Math.max(
        10,
        Math.min(80, data.value.totals.dueNow + user.value.dailyNewLimit)
      );
    }
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
    <!-- 顶栏 -->
    <header class="mb-6 flex items-start justify-between">
      <div>
        <p class="text-xs font-medium tracking-wide text-slate-400">{{ todayLabel }}</p>
        <h1 class="mt-1 text-2xl font-bold tracking-tight">
          {{ greeting }}，{{ displayName }}
        </h1>
      </div>
      <button
        class="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label="切换主题"
        @click="toggleTheme"
      >
        <svg v-if="isDark" viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke-linecap="round" />
        </svg>
        <svg v-else viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </header>

    <div v-if="loading" class="space-y-4">
      <div class="h-52 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
      <div class="grid grid-cols-2 gap-3">
        <div class="h-24 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
        <div class="h-24 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
      </div>
    </div>

    <div
      v-else-if="error"
      class="card-surface p-6 text-center text-sm text-slate-500"
    >
      {{ error }}
      <button class="btn-ghost mt-4 w-full" @click="load">重试</button>
    </div>

    <template v-else-if="data">
      <!-- 打卡主卡 -->
      <section
        class="animate-rise rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-xl shadow-brand-600/20"
      >
        <div class="flex items-start justify-between">
          <div>
            <p class="text-xs font-medium text-brand-100/80">连续打卡</p>
            <p class="mt-1 flex items-baseline gap-1.5">
              <span class="text-4xl font-bold tabular-nums">{{ data.streak.current }}</span>
              <span class="text-sm text-brand-100">天</span>
            </p>
          </div>
          <div class="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur">
            最长 {{ data.streak.longest }} 天
          </div>
        </div>

        <div class="mt-6">
          <div class="mb-2 flex items-end justify-between text-xs text-brand-100/90">
            <span>今日已复习 {{ totalToday }} 张</span>
            <span class="tabular-nums">{{ goalPercent }}%</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-white/20">
            <div
              class="h-full rounded-full bg-white transition-all duration-500"
              :style="{ width: `${goalPercent}%` }"
            />
          </div>
        </div>

        <div class="mt-6 grid grid-cols-7 gap-1.5">
          <div v-for="day in recentDays" :key="day.date" class="text-center">
            <div
              class="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-semibold transition"
              :class="
                day.count > 0
                  ? 'bg-white/90 text-brand-700'
                  : 'bg-white/10 text-white/50'
              "
            >
              {{ day.count > 0 ? day.count : '·' }}
            </div>
            <p class="mt-1 text-[10px] text-brand-100/60">{{ day.label }}</p>
          </div>
        </div>
      </section>

      <!-- 数据块 -->
      <section class="mt-4 grid grid-cols-2 gap-3">
        <div class="card-surface p-4">
          <p class="text-xs text-slate-400">待复习</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">{{ data.totals.dueNow }}</p>
          <p class="mt-0.5 text-[11px] text-slate-400">已到期，优先处理</p>
        </div>
        <div class="card-surface p-4">
          <p class="text-xs text-slate-400">可学新词</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">{{ data.totals.newAvailable }}</p>
          <p class="mt-0.5 text-[11px] text-slate-400">按频次从高到低</p>
        </div>
      </section>

      <!-- 主按钮 -->
      <section class="mt-5">
        <button v-if="hasWork" class="btn-primary w-full py-4 text-base" @click="router.push('/study')">
          开始今日学习
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14m-6-6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div v-else class="card-surface p-6 text-center">
          <p class="text-lg font-semibold">今天的任务已完成 🎉</p>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
            记忆曲线会安排下一次复习，明天再来
          </p>
          <router-link to="/library" class="btn-ghost mt-4 inline-flex">逛逛词库</router-link>
        </div>
      </section>

      <!-- 学习概览 -->
      <section class="card-surface mt-4 p-5">
        <h2 class="text-sm font-semibold">学习总览</h2>
        <div class="mt-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <p class="text-xl font-bold tabular-nums">{{ data.totals.learned }}</p>
            <p class="mt-0.5 text-[11px] text-slate-400">已入库</p>
          </div>
          <div>
            <p class="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {{ data.totals.mastered }}
            </p>
            <p class="mt-0.5 text-[11px] text-slate-400">已熟练</p>
          </div>
          <div>
            <p class="text-xl font-bold tabular-nums">{{ data.totals.learning }}</p>
            <p class="mt-0.5 text-[11px] text-slate-400">学习中</p>
          </div>
        </div>
        <div class="mt-4 flex gap-2">
          <span class="chip">单词 {{ data.totals.byType.word ?? 0 }}</span>
          <span class="chip">语块 {{ data.totals.byType.chunk ?? 0 }}</span>
          <span class="chip">语法 {{ data.totals.byType.grammar ?? 0 }}</span>
        </div>
      </section>
    </template>
  </div>
</template>
