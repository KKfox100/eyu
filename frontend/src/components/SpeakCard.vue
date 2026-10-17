<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  isSpeechSupported,
  isTtsAvailable,
  PASS_SCORE,
  scoreSpeech,
  speakText,
  type SpeechScore,
} from '../lib/speech';

const props = defineProps<{
  target: string;
  zh?: string | null;
  /** 父组件已经提交评级后传入，用来锁定界面 */
  result: { score: number; correct: boolean } | null;
}>();

const emit = defineEmits<{ (e: 'submit', payload: { score: number; correct: boolean }): void }>();

/** 允许重读的次数上限，超过就按没过处理，避免一直赖在这张卡上 */
const MAX_ATTEMPTS = 3;

const supported = isSpeechSupported();
/** 朗读（语音合成）和识别是两套能力：有的环境能读却不能识别，反之亦然 */
const ttsAvailable = isTtsAvailable();
const listening = ref(false);
const transcript = ref('');
const score = ref<SpeechScore | null>(null);
const attempts = ref(0);
const errorMsg = ref<string | null>(null);
const speaking = ref(false);

type RecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

let recognition: InstanceType<RecognitionCtor> | null = null;

const passed = computed(() => score.value !== null && score.value.score >= PASS_SCORE);
/** 没识别出内容（score 为空）时不算用掉次数，可以一直重试；打出分之后才受次数限制 */
const canRetry = computed(() => {
  if (props.result || passed.value) return false;
  // 还没读过就别急着给「跳过 / 再读一次」
  if (attempts.value === 0) return false;
  if (score.value === null) return true;
  return attempts.value < MAX_ATTEMPTS;
});
const showBreakdown = computed(() => score.value !== null);

const micLabel = computed(() => {
  if (listening.value) return '正在听…';
  if (attempts.value === 0) return '点击开始朗读';
  return '再读一次';
});

watch(
  () => props.target,
  () => {
    transcript.value = '';
    score.value = null;
    attempts.value = 0;
    errorMsg.value = null;
  }
);

function stopRecognition() {
  if (recognition) {
    try {
      recognition.abort();
    } catch {
      /* 已经停了 */
    }
    recognition = null;
  }
  listening.value = false;
}

onBeforeUnmount(() => {
  stopRecognition();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
});

function start() {
  if (!supported || listening.value || props.result) return;

  errorMsg.value = null;
  transcript.value = '';
  score.value = null;

  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as RecognitionCtor | undefined;
  if (!Ctor) {
    errorMsg.value = '当前浏览器不支持语音识别';
    return;
  }

  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onresult = (event: any) => {
    let text = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      text += event.results[i][0].transcript;
    }
    transcript.value = text.trim();
  };

  rec.onerror = (event: any) => {
    const code = String(event?.error ?? '');
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      errorMsg.value = '麦克风权限被拒绝，请在浏览器地址栏左侧重新允许';
    } else if (code === 'no-speech') {
      errorMsg.value = '没听到声音，再靠近一点麦克风';
    } else if (code === 'network') {
      errorMsg.value = '语音识别服务连不上，检查网络后重试';
    } else if (code !== 'aborted') {
      errorMsg.value = `识别出错（${code}）`;
    }
    listening.value = false;
  };

  rec.onend = () => {
    listening.value = false;
    recognition = null;
    finishRound();
  };

  recognition = rec;
  listening.value = true;
  attempts.value += 1;
  try {
    rec.start();
  } catch {
    listening.value = false;
    errorMsg.value = '麦克风启动失败，请重试';
  }
}

function stop() {
  if (recognition) {
    try {
      recognition.stop();
    } catch {
      /* 忽略 */
    }
  }
}

/** 一轮朗读结束：能识别出内容就打分，空结果只提示不判负 */
function finishRound() {
  if (props.result) return;
  const heard = transcript.value.trim();
  if (!heard) {
    if (!errorMsg.value) errorMsg.value = '没听到内容，再试一次';
    return;
  }

  const result = scoreSpeech(props.target, heard);
  score.value = result;

  if (result.score >= PASS_SCORE) {
    emit('submit', { score: result.score, correct: true });
    return;
  }
  if (attempts.value >= MAX_ATTEMPTS) {
    emit('submit', { score: result.score, correct: false });
  }
}

function giveUp() {
  if (props.result) return;
  emit('submit', { score: score.value?.score ?? 0, correct: false });
}

/** 先听一遍标准发音 */
function playModel() {
  if (!ttsAvailable) return;
  speaking.value = true;
  speakText(props.target, {
    lang: 'en-US',
    rate: 0.9,
    onStart: () => {
      speaking.value = true;
    },
    onEnd: () => {
      speaking.value = false;
    },
  });
}
</script>

<template>
  <div class="card-surface flex h-[26rem] w-full flex-col p-6">
    <div class="flex items-center justify-between">
      <span class="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
        口语测评
      </span>
      <button
        class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-slate-400 transition active:scale-95 disabled:opacity-40"
        :disabled="!ttsAvailable"
        :title="ttsAvailable ? '听一遍标准发音' : '当前设备无法朗读'"
        @click="playModel"
      >
        <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M16 9a4 4 0 0 1 0 6" stroke-linecap="round" />
        </svg>
        {{ speaking ? '播放中' : '听一遍' }}
      </button>
    </div>

    <!-- 目标句 -->
    <div class="mt-5 text-center">
      <p class="text-[1.3rem] font-semibold leading-relaxed tracking-tight">{{ target }}</p>
      <p v-if="zh" class="mt-2 text-sm text-slate-500 dark:text-slate-400">{{ zh }}</p>
    </div>

    <!-- 不支持 -->
    <div v-if="!supported" class="my-auto text-center">
      <p class="text-sm text-slate-500 dark:text-slate-400">
        这个浏览器不支持语音识别。
      </p>
      <p class="mt-1.5 text-[11px] text-slate-400">用 Chrome / Edge 打开即可，Safari 需 14.1+</p>
    </div>

    <!-- 录音按钮 -->
    <div v-else class="mt-auto flex flex-col items-center">
      <button
        class="relative flex items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50"
        :class="[
          showBreakdown ? 'h-14 w-14' : 'h-20 w-20',
          listening
            ? 'bg-rose-500 text-white'
            : passed
              ? 'bg-emerald-500 text-white'
              : 'bg-sky-500 text-white',
        ]"
        :disabled="!!result"
        @click="listening ? stop() : start()"
      >
        <span
          v-if="listening"
          class="absolute inset-0 animate-ping rounded-full bg-rose-400/50"
        />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          :class="showBreakdown ? 'relative h-6 w-6' : 'relative h-8 w-8'"
        >
          <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" stroke-linecap="round" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke-linecap="round" />
        </svg>
      </button>

      <p class="mt-3 text-xs text-slate-400">
        {{ result ? '已记录' : micLabel }}
        <template v-if="!result && attempts > 0"> · 第 {{ attempts }}/{{ MAX_ATTEMPTS }} 次</template>
      </p>

      <!-- 识别结果与逐词判定 -->
      <div v-if="showBreakdown" class="mt-3 w-full">
        <p class="text-center text-xs text-slate-400">
          听到：<span class="text-slate-500 dark:text-slate-300">{{ transcript || '（空）' }}</span>
        </p>
        <p class="mt-1 text-center">
          <span
            class="text-2xl font-bold tabular-nums"
            :class="passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
          >{{ score?.score }}</span>
          <span class="ml-1 text-[11px] text-slate-400">/ 100</span>
        </p>
        <div class="mt-2 flex flex-wrap justify-center gap-x-1.5 gap-y-1">
          <span
            v-for="(token, i) in score?.tokens ?? []"
            :key="i"
            class="rounded px-1 text-[13px] font-medium"
            :class="
              token.ok
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-600 line-through dark:bg-rose-900/30 dark:text-rose-300'
            "
          >{{ token.word }}</span>
        </div>
      </div>

      <p v-if="errorMsg" class="mt-2 text-center text-[11px] text-rose-500">{{ errorMsg }}</p>

      <div v-if="canRetry" class="mt-3 flex w-full gap-2">
        <button class="btn-ghost flex-1 py-2 text-xs" @click="giveUp">先跳过</button>
        <button class="btn-primary flex-1 py-2 text-xs" @click="start">再读一次</button>
      </div>
    </div>
  </div>
</template>
