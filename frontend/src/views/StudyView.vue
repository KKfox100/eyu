<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError, type QueueResponse, type StudyCard } from '../lib/api';
import StudyCardView from '../components/StudyCard.vue';

const router = useRouter();

const queue = ref<StudyCard[]>([]);
const index = ref(0);
const flipped = ref(false);
const loading = ref(true);
const submitting = ref(false);
const error = ref<string | null>(null);
const finished = ref(false);

const tally = ref({ forgot: 0, hard: 0, good: 0, easy: 0 });
const startedAt = ref(Date.now());
const lastFeedback = ref<{ label: string; isLapse: boolean; rating: number } | null>(null);

const current = computed(() => queue.value[index.value] ?? null);
const total = computed(() => queue.value.length);
const progress = computed(() =>
  total.value ? Math.round((index.value / total.value) * 100) : 0
);
const reviewed = computed(() => tally.value.forgot + tally.value.hard + tally.value.good + tally.value.easy);
const accuracy = computed(() => {
  if (!reviewed.value) return null;
  return Math.round(((tally.value.good + tally.value.easy) / reviewed.value) * 100);
});

const ratings = [
  { value: 0 as const, label: '忘记', hint: '10 分钟后再来', cls: 'bg-rose-500 active:bg-rose-600' },
  { value: 1 as const, label: '模糊', hint: '缩短间隔', cls: 'bg-amber-500 active:bg-amber-600' },
  { value: 2 as const, label: '掌握', hint: '按曲线推进', cls: 'bg-emerald-500 active:bg-emerald-600' },
  { value: 3 as const, label: '熟知', hint: '跳一级', cls: 'bg-sky-500 active:bg-sky-600' },
];

async function loadQueue() {
  loading.value = true;
  error.value = null;
  try {
    const data: QueueResponse = await api.queue(20);
    queue.value = data.queue;
    index.value = 0;
    flipped.value = false;
    finished.value = data.queue.length === 0;
    tally.value = { forgot: 0, hard: 0, good: 0, easy: 0 };
    startedAt.value = Date.now();
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载队列失败';
  } finally {
    loading.value = false;
  }
}

async function rate(rating: 0 | 1 | 2 | 3) {
  const card = current.value;
  if (!card || submitting.value) return;
  submitting.value = true;
  try {
    const result = await api.review({
      userCardId: card.userCardId,
      rating,
      mode: 'recall',
      elapsedMs: Date.now() - startedAt.value,
    });
    if (rating === 0) tally.value.forgot += 1;
    if (rating === 1) tally.value.hard += 1;
    if (rating === 2) tally.value.good += 1;
    if (rating === 3) tally.value.easy += 1;

    lastFeedback.value = {
      label: `下次复习：${result.feedback.intervalLabel}`,
      isLapse: result.feedback.isLapse,
      rating,
    };

    index.value += 1;
    flipped.value = false;
    startedAt.value = Date.now();
    if (index.value >= total.value) finished.value = true;
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '提交失败，请重试';
  } finally {
    submitting.value = false;
  }
}

function onKey(event: KeyboardEvent) {
  if (event.key === ' ') {
    event.preventDefault();
    flipped.value = !flipped.value;
    return;
  }
  const map: Record<string, 0 | 1 | 2 | 3> = { '1': 0, '2': 1, '3': 2, '4': 3 };
  const rating = map[event.key];
  if (rating !== undefined && flipped.value && !submitting.value) {
    void rate(rating);
  }
}

onMounted(() => {
  void loadQueue();
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-6 pt-4 safe-top">
    <!-- 顶栏 -->
    <header class="mb-4 flex items-center gap-3">
      <button
        class="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label="退出学习"
        @click="router.push('/')"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" />
        </svg>
      </button>
      <div class="flex-1">
        <div class="progress-track">
          <div class="progress-bar" :style="{ width: `${progress}%` }" />
        </div>
      </div>
      <span class="w-12 text-right text-xs font-medium tabular-nums text-slate-400">
        {{ Math.min(index + (finished ? 0 : 1), total) }}/{{ total }}
      </span>
    </header>

    <!-- 加载 -->
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <div class="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="card-surface my-auto p-6 text-center">
      <p class="text-sm text-slate-500">{{ error }}</p>
      <button class="btn-ghost mt-4 w-full" @click="loadQueue">重新加载</button>
    </div>

    <!-- 完成 -->
    <div v-else-if="finished" class="my-auto animate-rise text-center">
      <div class="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30">
        <svg viewBox="0 0 24 24" class="h-10 w-10 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h2 class="text-xl font-bold">{{ reviewed ? '本轮完成' : '暂时没有待学卡片' }}</h2>
      <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
        <template v-if="reviewed">
          共复习 {{ reviewed }} 张<template v-if="accuracy !== null"> · 正确率 {{ accuracy }}%</template>
        </template>
        <template v-else> 所有卡片都在记忆曲线上，到期后会自动出现 </template>
      </p>

      <div v-if="reviewed" class="card-surface mt-6 grid grid-cols-4 divide-x divide-slate-100 p-4 dark:divide-slate-800">
        <div>
          <p class="text-lg font-bold tabular-nums text-rose-500">{{ tally.forgot }}</p>
          <p class="mt-0.5 text-[11px] text-slate-400">忘记</p>
        </div>
        <div>
          <p class="text-lg font-bold tabular-nums text-amber-500">{{ tally.hard }}</p>
          <p class="mt-0.5 text-[11px] text-slate-400">模糊</p>
        </div>
        <div>
          <p class="text-lg font-bold tabular-nums text-emerald-500">{{ tally.good }}</p>
          <p class="mt-0.5 text-[11px] text-slate-400">掌握</p>
        </div>
        <div>
          <p class="text-lg font-bold tabular-nums text-sky-500">{{ tally.easy }}</p>
          <p class="mt-0.5 text-[11px] text-slate-400">熟知</p>
        </div>
      </div>

      <div class="mt-6 space-y-2.5">
        <button class="btn-primary w-full" @click="router.push('/')">回到今日</button>
        <button class="btn-ghost w-full" @click="loadQueue">再学一轮</button>
      </div>
    </div>

    <!-- 学习中 -->
    <template v-else-if="current">
      <StudyCardView :card="current" :flipped="flipped" @flip="flipped = !flipped" />

      <p
        v-if="lastFeedback"
        class="mt-3 text-center text-xs"
        :class="lastFeedback.isLapse ? 'text-rose-500' : 'text-slate-400'"
      >
        {{ lastFeedback.label }}
      </p>

      <div class="mt-4">
        <div v-if="!flipped" class="space-y-2">
          <button class="btn-primary w-full py-3.5" @click="flipped = true">查看答案</button>
          <p class="text-center text-[11px] text-slate-400">桌面端可用空格翻面、1–4 评级</p>
        </div>

        <div v-else class="grid grid-cols-2 gap-2.5">
          <button
            v-for="r in ratings"
            :key="r.value"
            class="flex flex-col items-center justify-center rounded-xl py-3.5 text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50"
            :class="r.cls"
            :disabled="submitting"
            @click="rate(r.value)"
          >
            <span class="text-sm font-semibold">{{ r.label }}</span>
            <span class="mt-0.5 text-[10px] text-white/80">{{ r.hint }}</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
