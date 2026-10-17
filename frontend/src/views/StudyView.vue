<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError, type Exercise, type QueueResponse, type StudyCard } from '../lib/api';
import { readPracticePref } from '../lib/prefs';
import { isSpeechSupported, pickSpeakTarget } from '../lib/speech';
import StudyCardView from '../components/StudyCard.vue';
import ExerciseCard from '../components/ExerciseCard.vue';
import SpeakCard from '../components/SpeakCard.vue';

const router = useRouter();

const queue = ref<StudyCard[]>([]);
const index = ref(0);
const flipped = ref(false);
const loading = ref(true);
const submitting = ref(false);
const error = ref<string | null>(null);
const finished = ref(false);
const isExtra = ref(false);
const summary = ref<QueueResponse['summary'] | null>(null);

/** 练习题：只有复习卡（非新卡）才出题，新卡仍然先看翻转卡建立第一印象 */
const practice = ref<Exercise | null>(null);
const practiceLoading = ref(false);
const practiceResult = ref<{ correct: boolean } | null>(null);
const practiceEnabled = readPracticePref();
/** userCardId → 题目（null 表示这道卡出不了题，别再问第二次） */
const exerciseCache = new Map<string, Exercise | null>();

/** 口语测评：手动切换，避免一进学习页就弹麦克风权限 */
const speakMode = ref(false);
const speakResult = ref<{ score: number; correct: boolean } | null>(null);
const speechAvailable = isSpeechSupported();

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

/** 朗读目标：有练习题就用题目的完整句子，否则按卡片类型挑（单词/句型读例句） */
const speakText = computed(() => {
  const exercise = practice.value;
  if (exercise?.mode === 'cloze') {
    return exercise.sentence.replace('____', exercise.answerForm || exercise.answer);
  }
  if (exercise?.mode === 'order') return exercise.answerTokens.join(' ');
  const card = current.value;
  return card ? pickSpeakTarget(card).text : '';
});

const speakZh = computed<string | null>(() => {
  if (practice.value) return practice.value.zh;
  const card = current.value;
  return card ? pickSpeakTarget(card).zh : null;
});

const ratings = [
  { value: 0 as const, label: '忘记', hint: '10 分钟后再来', cls: 'bg-rose-500 active:bg-rose-600' },
  { value: 1 as const, label: '模糊', hint: '缩短间隔', cls: 'bg-amber-500 active:bg-amber-600' },
  { value: 2 as const, label: '掌握', hint: '按曲线推进', cls: 'bg-emerald-500 active:bg-emerald-600' },
  { value: 3 as const, label: '熟知', hint: '跳一级', cls: 'bg-sky-500 active:bg-sky-600' },
];

async function getExercise(card: StudyCard): Promise<Exercise | null> {
  if (exerciseCache.has(card.userCardId)) return exerciseCache.get(card.userCardId) ?? null;
  if (!practiceEnabled || card.isNew) {
    exerciseCache.set(card.userCardId, null);
    return null;
  }
  try {
    const res = await api.exercise(card.userCardId, 'auto');
    const exercise = res.available ? res.exercise : null;
    exerciseCache.set(card.userCardId, exercise);
    return exercise;
  } catch {
    // 出题失败不该挡住学习，静默退回翻转卡
    exerciseCache.set(card.userCardId, null);
    return null;
  }
}

function prefetch(position: number) {
  const card = queue.value[position];
  if (!card || card.isNew || exerciseCache.has(card.userCardId)) return;
  void getExercise(card);
}

async function enterCard() {
  const card = current.value;
  practice.value = null;
  practiceResult.value = null;
  lastFeedback.value = null;
  flipped.value = false;
  speakResult.value = null;
  startedAt.value = Date.now();
  if (!card) return;

  if (!practiceEnabled || card.isNew) {
    practiceLoading.value = false;
    return;
  }

  practiceLoading.value = true;
  const exercise = await getExercise(card);
  // 等网络这段时间用户可能已经退出或跳过
  if (current.value?.userCardId !== card.userCardId) return;
  practice.value = exercise;
  practiceLoading.value = false;
  prefetch(index.value + 1);
}

async function loadQueue(extra = false) {
  loading.value = true;
  error.value = null;
  try {
    const data: QueueResponse = await api.queue(30, extra);
    queue.value = data.queue;
    summary.value = data.summary;
    isExtra.value = extra;
    index.value = 0;
    exerciseCache.clear();
    tally.value = { forgot: 0, hard: 0, good: 0, easy: 0 };
    finished.value = data.queue.length === 0;
    if (!finished.value) await enterCard();
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载队列失败';
  } finally {
    loading.value = false;
  }
}

function advance() {
  index.value += 1;
  if (index.value >= total.value) {
    finished.value = true;
    practice.value = null;
    return;
  }
  void enterCard();
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

    advance();
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '提交失败，请重试';
  } finally {
    submitting.value = false;
  }
}

/**
 * 练习判分即评级：答对算「掌握」(2)，答错算「模糊」(1)。
 * 不用 0（忘记）是因为一次手滑就重置阶段太重，宁可保守。
 */
async function onExerciseSubmit(correct: boolean) {
  const card = current.value;
  const exercise = practice.value;
  if (!card || !exercise || practiceResult.value || submitting.value) return;

  practiceResult.value = { correct };
  if (correct) tally.value.good += 1;
  else tally.value.hard += 1;

  submitting.value = true;
  try {
    const result = await api.review({
      userCardId: card.userCardId,
      rating: correct ? 2 : 1,
      mode: exercise.mode,
      elapsedMs: Date.now() - startedAt.value,
    });
    lastFeedback.value = {
      label: `下次复习：${result.feedback.intervalLabel}`,
      isLapse: result.feedback.isLapse,
      rating: correct ? 2 : 1,
    };
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '提交失败，请重试';
  } finally {
    submitting.value = false;
  }
}

/**
 * 口语测评判分即评级：读对（≥70 分）算「掌握」，没过算「模糊」。
 * 和完形/语序保持同一套口径，复习日志里用 mode='speak' 区分。
 */
async function onSpeakSubmit(payload: { score: number; correct: boolean }) {
  const card = current.value;
  if (!card || speakResult.value || submitting.value) return;

  speakResult.value = payload;
  if (payload.correct) tally.value.good += 1;
  else tally.value.hard += 1;

  submitting.value = true;
  try {
    const result = await api.review({
      userCardId: card.userCardId,
      rating: payload.correct ? 2 : 1,
      mode: 'speak',
      elapsedMs: Date.now() - startedAt.value,
    });
    lastFeedback.value = {
      label: `下次复习：${result.feedback.intervalLabel}`,
      isLapse: result.feedback.isLapse,
      rating: payload.correct ? 2 : 1,
    };
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '提交失败，请重试';
  } finally {
    submitting.value = false;
  }
}

function onKey(event: KeyboardEvent) {
  if (event.key === ' ') {
    event.preventDefault();
    if (!practice.value && !speakMode.value) flipped.value = !flipped.value;
    return;
  }
  // 练习 / 口语答完回车继续，省一次点击
  if (event.key === 'Enter' && (practiceResult.value || speakResult.value)) {
    event.preventDefault();
    advance();
    return;
  }
  const map: Record<string, 0 | 1 | 2 | 3> = { '1': 0, '2': 1, '3': 2, '4': 3 };
  const rating = map[event.key];
  if (rating !== undefined && flipped.value && !practice.value && !speakMode.value && !submitting.value) {
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
      <button
        v-if="speechAvailable && !finished"
        class="rounded-full p-2 transition"
        :class="
          speakMode
            ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300'
            : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        "
        :aria-label="speakMode ? '退出跟读' : '跟读这句'"
        @click="speakMode = !speakMode"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.9">
          <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" stroke-linecap="round" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke-linecap="round" />
        </svg>
      </button>
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
        <template v-else>
          {{ summary && summary.newCap > 0 ? '今日新词额度已用完，明天继续，或稍后复习到期卡片' : '所有卡片都在记忆曲线上，到期后会自动出现' }}
        </template>
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
        <button v-if="reviewed" class="btn-primary w-full" @click="loadQueue(true)">
          继续加练
          <span class="text-[11px] font-normal text-white/70">
            今日额度 {{ summary?.dailyNewLimit ?? 0 }} → 可到 {{ summary?.extraNewCap ?? 60 }}
          </span>
        </button>
        <button class="btn-ghost w-full" @click="router.push('/')">回到今日</button>
        <button v-if="!reviewed" class="btn-ghost w-full" @click="router.push('/library')">逛逛词库</button>
      </div>
    </div>

    <!-- 学习中 -->
    <template v-else-if="current">
      <SpeakCard
        v-if="speakMode"
        :target="speakText"
        :zh="speakZh"
        :result="speakResult"
        @submit="onSpeakSubmit"
      />

      <div v-else-if="practiceLoading" class="card-surface flex h-[26rem] items-center justify-center">
        <div class="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
      </div>

      <ExerciseCard
        v-else-if="practice"
        :exercise="practice"
        :result="practiceResult"
        @submit="onExerciseSubmit"
      />

      <StudyCardView v-else :card="current" :flipped="flipped" @flip="flipped = !flipped" />

      <!-- 口语模式 -->
      <template v-if="speakMode">
        <div
          v-if="speakResult"
          class="mt-3 flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs"
          :class="
            speakResult.correct
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-900/25 dark:text-rose-300'
          "
        >
          <span class="font-semibold">
            {{ speakResult.correct ? `读得不错 · ${speakResult.score} 分` : `再练练 · ${speakResult.score} 分` }}
          </span>
          <span class="text-slate-500 dark:text-slate-400">{{ lastFeedback?.label ?? '' }}</span>
        </div>
        <button v-if="speakResult" class="btn-primary mt-3 w-full py-3.5" :disabled="submitting" @click="advance">
          继续
        </button>
        <p v-else class="mt-3 text-center text-[11px] text-slate-400">
          看着句子读一遍，自动判分（读对 70% 即通过）
        </p>
      </template>

      <!-- 练习模式：结果条 + 继续 -->
      <template v-else-if="practice">
        <div
          v-if="practiceResult"
          class="mt-3 flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs"
          :class="
            practiceResult.correct
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-900/25 dark:text-rose-300'
          "
        >
          <span class="font-semibold">{{ practiceResult.correct ? '答对了' : '再记一下' }}</span>
          <span class="text-slate-500 dark:text-slate-400">{{ lastFeedback?.label ?? '' }}</span>
        </div>
        <button v-if="practiceResult" class="btn-primary mt-3 w-full py-3.5" :disabled="submitting" @click="advance">
          继续
        </button>
        <p v-else class="mt-3 text-center text-[11px] text-slate-400">
          {{ practice.mode === 'cloze' ? '选出正确的一项，立即判分' : '点词块排出句子，排满自动判定' }}
        </p>
      </template>

      <!-- 翻转卡模式 -->
      <template v-else>
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
    </template>
  </div>
</template>
