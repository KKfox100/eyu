<script setup lang="ts">
import { computed } from 'vue';
import type { StudyCard } from '../lib/api';

const props = defineProps<{ card: StudyCard; flipped: boolean }>();
const emit = defineEmits<{ (e: 'flip'): void }>();

const typeMeta = {
  word: { label: '单词', cls: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' },
  chunk: { label: '语块', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  grammar: { label: '句型', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
} as const;

const meta = computed(() => typeMeta[props.card.type]);
const speakText = computed(() =>
  props.card.type === 'grammar' ? props.card.examples[0]?.en || props.card.content : props.card.content
);

function speak(event: Event) {
  event.stopPropagation();
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speakText.value);
  utterance.lang = 'en-US';
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}
</script>

<template>
  <div class="flip-scene h-[26rem] w-full cursor-pointer select-none" @click="emit('flip')">
    <div class="flip-inner" :class="{ 'is-flipped': flipped }">
      <!-- 正面 -->
      <div class="flip-face card-surface flex flex-col p-6">
        <div class="flex items-center justify-between">
          <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="meta.cls">
            {{ meta.label }}
          </span>
          <span class="text-[11px] text-slate-400">
            <template v-if="card.isNew">新卡</template>
            <template v-else>第 {{ card.reps + 1 }} 次复习</template>
          </span>
        </div>

        <div class="flex flex-1 flex-col items-center justify-center px-2 text-center">
          <p
            class="font-semibold leading-snug tracking-tight"
            :class="card.type === 'grammar' ? 'text-2xl' : 'text-[2.1rem]'"
          >
            {{ card.content }}
          </p>
          <p v-if="card.phonetic" class="mt-3 text-sm text-slate-400">{{ card.phonetic }}</p>

          <button
            class="mt-5 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-2 text-xs font-medium text-slate-600 transition active:scale-95 dark:bg-slate-800 dark:text-slate-300"
            @click="speak"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M16 9a4 4 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12" stroke-linecap="round" />
            </svg>
            朗读
          </button>
        </div>

        <p class="text-center text-[11px] text-slate-400">先在心里回忆，再点击卡片翻面</p>
      </div>

      <!-- 背面 -->
      <div class="flip-face flip-back card-surface flex flex-col overflow-hidden p-0">
        <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">{{ card.content }}</p>
            <p v-if="card.phonetic" class="text-[11px] text-slate-400">{{ card.phonetic }}</p>
          </div>
          <span class="ml-2 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" :class="meta.cls">
            {{ meta.label }}
          </span>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4">
          <p class="text-[15px] font-medium leading-relaxed">{{ card.definition }}</p>

          <div v-if="card.grammarPattern" class="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 dark:bg-amber-900/20">
            <p class="text-[11px] font-semibold text-amber-700 dark:text-amber-400">核心骨架</p>
            <p class="mt-1 text-sm font-medium text-amber-900 dark:text-amber-200">
              {{ card.grammarPattern }}
            </p>
          </div>

          <p
            v-if="card.explanation"
            class="mt-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300"
          >
            {{ card.explanation }}
          </p>

          <div v-if="card.examples.length" class="mt-4 space-y-2.5">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">场景例句</p>
            <div
              v-for="(ex, i) in card.examples"
              :key="i"
              class="rounded-xl bg-slate-50 px-3.5 py-3 dark:bg-slate-800/60"
            >
              <div class="flex items-center gap-2">
                <span v-if="ex.scene" class="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                  {{ ex.scene }}
                </span>
              </div>
              <p class="mt-1.5 text-sm font-medium leading-snug">{{ ex.en }}</p>
              <p v-if="ex.zh" class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ ex.zh }}</p>
            </div>
          </div>

          <div v-if="card.tags.length" class="mt-4 flex flex-wrap gap-1.5">
            <span v-for="tag in card.tags" :key="tag" class="chip">{{ tag }}</span>
          </div>
        </div>

        <div class="border-t border-slate-100 px-5 py-2.5 text-center text-[11px] text-slate-400 dark:border-slate-800">
          阶段 {{ card.stage }} · EF {{ card.easinessFactor.toFixed(2) }} · 间隔 {{ card.intervalDays }} 天
        </div>
      </div>
    </div>
  </div>
</template>
