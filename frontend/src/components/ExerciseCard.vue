<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Exercise } from '../lib/api';

const props = defineProps<{
  exercise: Exercise;
  /** null = 未作答；否则为判定结果 */
  result: { correct: boolean } | null;
}>();

const emit = defineEmits<{ (e: 'submit', correct: boolean): void }>();

const picked = ref<string[]>([]);
const chosen = ref<string | null>(null);

const isCloze = computed(() => props.exercise.mode === 'cloze');
const answered = computed(() => props.result !== null);

const title = computed(() => (isCloze.value ? '完形填空' : '语序重组'));
const hint = computed(() =>
  isCloze.value ? '选出最适合空格的一项' : '按正确顺序点击词块'
);

/** 把 "Let me ____ you a coffee." 拆成 [前缀, 后缀] */
const segments = computed(() => {
  if (props.exercise.mode !== 'cloze') return [];
  return props.exercise.sentence.split('____');
});

const clozeAnswer = computed(() =>
  props.exercise.mode === 'cloze' ? props.exercise.answer : ''
);
/** 揭晓时按原句的真实形态回填（It ____ → It takes） */
const clozeForm = computed(() =>
  props.exercise.mode === 'cloze' ? props.exercise.answerForm || props.exercise.answer : ''
);

/** 空格里显示什么：答对显示答案，答错也显示正确答案 */
function blankText() {
  return answered.value ? clozeForm.value : '';
}

const pool = computed(() => (props.exercise.mode === 'order' ? props.exercise.shuffled : []));
/** 候选区需要保留「同一个词出现多次」的下标，按字符串去重会少一个 */
const poolItems = computed(() => {
  const consumed = new Map<string, number>();
  for (const token of picked.value) consumed.set(token, (consumed.get(token) ?? 0) + 1);
  const out: Array<{ token: string; index: number }> = [];
  pool.value.forEach((token, index) => {
    const skip = consumed.get(token) ?? 0;
    if (skip > 0) {
      consumed.set(token, skip - 1);
      return;
    }
    out.push({ token, index });
  });
  return out;
});

function reset() {
  picked.value = [];
  chosen.value = null;
}

watch(() => props.exercise, reset, { immediate: true });

function choose(option: string) {
  if (answered.value || chosen.value) return;
  chosen.value = option;
  emit('submit', option === clozeAnswer.value);
}

function pickToken(token: string) {
  if (answered.value) return;
  picked.value = [...picked.value, token];
  if (props.exercise.mode === 'order' && picked.value.length === props.exercise.answerTokens.length) {
    const correct = picked.value.every((t, i) => t === props.exercise.answerTokens[i]);
    emit('submit', correct);
  }
}

function unpick(index: number) {
  if (answered.value) return;
  picked.value = picked.value.filter((_, i) => i !== index);
}

function clearPicked() {
  if (answered.value) return;
  picked.value = [];
}

const correctSentence = computed(() =>
  props.exercise.mode === 'order'
    ? props.exercise.answerTokens.join(' ')
    : props.exercise.sentence.replace('____', clozeForm.value)
);
</script>

<template>
  <div class="card-surface flex h-[26rem] w-full flex-col p-6">
    <div class="flex items-center justify-between">
      <span class="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
        {{ title }}
      </span>
      <span v-if="exercise.scene" class="text-[11px] text-slate-400">{{ exercise.scene }}</span>
    </div>

    <!-- 完形填空 -->
    <div v-if="isCloze" class="flex flex-1 flex-col justify-center">
      <p class="text-center text-[1.35rem] font-medium leading-relaxed tracking-tight">
        <template v-for="(part, i) in segments" :key="i">
          <span>{{ part }}</span>
          <span
            v-if="i < segments.length - 1"
            class="mx-1 inline-block min-w-[4.5rem] border-b-2 px-2 text-center font-semibold transition"
            :class="
              answered
                ? result?.correct
                  ? 'border-emerald-400 text-emerald-600 dark:text-emerald-400'
                  : 'border-rose-400 text-rose-600 dark:text-rose-400'
                : 'border-brand-300 text-brand-600 dark:border-brand-600'
            "
          >{{ blankText() || '　' }}</span>
        </template>
      </p>

      <p v-if="answered && exercise.zh" class="mt-5 text-center text-sm text-slate-500 dark:text-slate-400">
        {{ exercise.zh }}
      </p>
      <p
        v-if="answered && clozeForm && clozeForm.toLowerCase() !== clozeAnswer.toLowerCase()"
        class="mt-1.5 text-center text-[11px] text-slate-400"
      >
        原句里写作 {{ clozeForm }}
      </p>
    </div>

    <!-- 语序重组 -->
    <div v-else class="flex flex-1 flex-col">
      <div
        class="mt-4 flex min-h-[5.5rem] flex-wrap content-start gap-2 rounded-xl border border-dashed p-3 transition"
        :class="
          answered
            ? result?.correct
              ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-900/20'
              : 'border-rose-300 bg-rose-50/60 dark:border-rose-700 dark:bg-rose-900/20'
            : 'border-slate-300 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40'
        "
      >
        <button
          v-for="(token, i) in picked"
          :key="`${token}-${i}`"
          class="rounded-lg bg-white px-2.5 py-1.5 text-sm font-medium shadow-sm transition dark:bg-slate-700"
          :class="answered ? 'cursor-default' : 'active:scale-95'"
          :disabled="answered"
          @click="unpick(i)"
        >
          {{ token }}
        </button>
        <span v-if="!picked.length" class="self-center text-xs text-slate-400">{{ hint }}</span>
      </div>

      <div class="mt-4 flex-1">
        <p v-if="poolItems.length" class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">词块</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="item in poolItems"
            :key="item.index"
            class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 transition active:scale-95 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            :disabled="answered"
            @click="pickToken(item.token)"
          >
            {{ item.token }}
          </button>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <button
          v-if="picked.length && !answered"
          class="text-xs text-slate-400 underline-offset-2 hover:underline"
          @click="clearPicked"
        >
          清空
        </button>
        <span v-else />
        <p v-if="answered && exercise.zh" class="text-right text-xs text-slate-500 dark:text-slate-400">
          {{ exercise.zh }}
        </p>
      </div>
    </div>

    <!-- 选项（仅完形） -->
    <div v-if="isCloze" class="mt-4 grid grid-cols-2 gap-2.5">
      <button
        v-for="option in exercise.options"
        :key="option"
        class="rounded-xl border px-3 py-3 text-sm font-semibold transition active:scale-[0.98] disabled:active:scale-100"
        :class="[
          answered && option === clozeAnswer
            ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
            : answered && option === chosen
              ? 'border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-600 dark:bg-rose-900/30 dark:text-rose-300'
              : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
        ]"
        :disabled="answered"
        @click="choose(option)"
      >
        {{ option }}
      </button>
    </div>

    <p v-if="answered && !result?.correct" class="mt-3 truncate text-center text-[11px] text-slate-400">
      正确答案：{{ correctSentence }}
    </p>
  </div>
</template>
