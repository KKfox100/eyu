<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, ApiError, type StudyCard } from '../lib/api';

const items = ref<StudyCard[]>([]);
const total = ref(0);
const page = ref(1);
const totalPages = ref(1);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref<string | null>(null);

const keyword = ref('');
const type = ref<'' | 'word' | 'chunk' | 'grammar'>('');
const expanded = ref<string | null>(null);

const tabs = [
  { value: '' as const, label: '全部' },
  { value: 'word' as const, label: '单词' },
  { value: 'chunk' as const, label: '语块' },
  { value: 'grammar' as const, label: '句型' },
];

const typeLabel: Record<string, string> = { word: '单词', chunk: '语块', grammar: '句型' };
const typeCls: Record<string, string> = {
  word: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
  chunk: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  grammar: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const hasMore = computed(() => page.value < totalPages.value);

async function load(reset = true) {
  if (reset) {
    page.value = 1;
    loading.value = true;
  } else {
    loadingMore.value = true;
  }
  error.value = null;
  try {
    const result = await api.cards({
      page: page.value,
      pageSize: 20,
      type: type.value || undefined,
      q: keyword.value.trim() || undefined,
    });
    items.value = reset ? result.items : [...items.value, ...result.items];
    total.value = result.total;
    totalPages.value = result.totalPages;
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败';
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value) return;
  page.value += 1;
  await load(false);
}

let timer: ReturnType<typeof setTimeout> | null = null;
watch(keyword, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void load(true), 320);
});
watch(type, () => void load(true));

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.92;
  window.speechSynthesis.speak(u);
}

onMounted(() => void load(true));
</script>

<template>
  <div class="mx-auto w-full max-w-lg flex-1 px-5 pb-8 pt-6 safe-top">
    <header class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">词库</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          共 {{ total }} 张卡片 · 按频次排序
        </p>
      </div>
      <router-link
        to="/clip"
        class="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-brand-600/25 transition active:scale-95"
      >
        <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M3 12h3m12 0h3M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1" stroke-linecap="round" />
        </svg>
        AI 剪藏
      </router-link>
    </header>

    <div class="sticky top-0 z-10 -mx-5 bg-paper/95 px-5 pb-3 pt-1 backdrop-blur dark:bg-slate-950/95">
      <input v-model="keyword" class="input" type="search" placeholder="搜索单词、语块或释义" />
      <div class="mt-3 flex gap-2">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="rounded-full px-3.5 py-1.5 text-xs font-medium transition"
          :class="
            type === tab.value
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          "
          @click="type = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="mt-4 space-y-2.5">
      <div v-for="i in 5" :key="i" class="h-20 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
    </div>

    <div v-else-if="error" class="card-surface mt-4 p-6 text-center text-sm text-slate-500">
      {{ error }}
      <button class="btn-ghost mt-4 w-full" @click="load(true)">重试</button>
    </div>

    <div v-else-if="!items.length" class="card-surface mt-4 p-8 text-center text-sm text-slate-500">
      没有匹配的卡片
    </div>

    <ul v-else class="mt-4 space-y-2.5">
      <li
        v-for="card in items"
        :key="card.cardId"
        class="card-surface overflow-hidden transition"
      >
        <button class="w-full px-4 py-3.5 text-left" @click="expanded = expanded === card.cardId ? null : card.cardId">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate text-[15px] font-semibold">{{ card.content }}</p>
              <p v-if="card.phonetic" class="mt-0.5 text-[11px] text-slate-400">{{ card.phonetic }}</p>
              <p class="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                {{ card.definition }}
              </p>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1">
              <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="typeCls[card.type]">
                {{ typeLabel[card.type] }}
              </span>
              <span v-if="card.userCardId" class="text-[10px] text-slate-400">阶段 {{ card.stage }}</span>
              <span v-else class="text-[10px] text-slate-400">未学</span>
            </div>
          </div>
        </button>

        <div v-if="expanded === card.cardId" class="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          <div v-if="card.grammarPattern" class="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            {{ card.grammarPattern }}
          </div>
          <p v-if="card.explanation" class="mb-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {{ card.explanation }}
          </p>
          <div v-for="(ex, i) in card.examples" :key="i" class="mb-2 last:mb-0">
            <p class="text-xs font-medium">{{ ex.en }}</p>
            <p v-if="ex.zh" class="text-[11px] text-slate-500 dark:text-slate-400">{{ ex.zh }}</p>
          </div>
          <button
            class="btn-ghost mt-2 w-full py-2 text-xs"
            @click.stop="speak(card.type === 'grammar' ? card.examples[0]?.en || card.content : card.content)"
          >
            朗读
          </button>
        </div>
      </li>
    </ul>

    <button
      v-if="hasMore"
      class="btn-ghost mt-4 w-full"
      :disabled="loadingMore"
      @click="loadMore"
    >
      {{ loadingMore ? '加载中…' : '加载更多' }}
    </button>
  </div>
</template>
