<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError, type ClippedCard } from '../lib/api';

const router = useRouter();

/** 与后端 MIN_CHARS / MAX_CHARS 保持一致 */
const MIN_CHARS = 120;
const MAX_CHARS = 6000;

const SAMPLE = `Remote work has changed the way we communicate. Instead of walking over to a colleague's desk, we now send a quick message and hope it lands well. The trouble is that tone is easy to misread in writing. A short reply that would sound friendly in person can come across as cold on screen.

Most teams get around this by over-communicating. They spell out what they need, they ask clarifying questions, and they confirm deadlines twice. It takes a little more effort up front, but it saves a lot of back-and-forth later.

If you are new to a remote team, try to touch base with one person every day. It does not have to be a long call. A two-minute check-in is enough to keep you in the loop.`;

const text = ref('');
const analyzing = ref(false);
const importing = ref(false);
const error = ref<string | null>(null);
const cards = ref<ClippedCard[]>([]);
const picked = ref<Set<number>>(new Set());
const done = ref<{ imported: number; skipped: number } | null>(null);

/** 解析通常 8-30 秒，让用户看到秒数在走，比干等一个转圈踏实 */
const elapsed = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

const typeLabel: Record<string, string> = { word: '单词', chunk: '语块', grammar: '句型' };
const typeCls: Record<string, string> = {
  word: 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
  chunk: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  grammar: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const charCount = computed(() => text.value.trim().length);
const tooShort = computed(() => charCount.value > 0 && charCount.value < MIN_CHARS);
const tooLong = computed(() => charCount.value > MAX_CHARS);
const canAnalyze = computed(
  () => charCount.value >= MIN_CHARS && charCount.value <= MAX_CHARS && !analyzing.value
);

const pickedCount = computed(() => picked.value.size);
const allPicked = computed(() => cards.value.length > 0 && picked.value.size === cards.value.length);

function toggle(index: number) {
  const next = new Set(picked.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  picked.value = next;
}

function toggleAll() {
  picked.value = allPicked.value ? new Set() : new Set(cards.value.map((_, i) => i));
}

function startTimer() {
  elapsed.value = 0;
  stopTimer();
  timer = setInterval(() => (elapsed.value += 1), 1000);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function analyze() {
  if (!canAnalyze.value) return;
  error.value = null;
  done.value = null;
  analyzing.value = true;
  startTimer();
  try {
    const result = await api.clipAnalyze(text.value.trim());
    cards.value = result.cards;
    picked.value = new Set(result.cards.map((_, i) => i));
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '解析失败，稍后再试';
  } finally {
    analyzing.value = false;
    stopTimer();
  }
}

async function doImport() {
  if (!pickedCount.value || importing.value) return;
  importing.value = true;
  error.value = null;
  try {
    const chosen = cards.value.filter((_, i) => picked.value.has(i));
    done.value = await api.clipImport(chosen);
    cards.value = [];
    picked.value = new Set();
    text.value = '';
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '导入失败';
  } finally {
    importing.value = false;
  }
}

function useSample() {
  text.value = SAMPLE;
  error.value = null;
  done.value = null;
}

function restart() {
  done.value = null;
  error.value = null;
}

/** 回到编辑状态，保留原文方便改两笔再解析 */
function editAgain() {
  cards.value = [];
  picked.value = new Set();
}

onBeforeUnmount(stopTimer);
</script>

<template>
  <div class="mx-auto w-full max-w-lg flex-1 px-5 pb-8 pt-6 safe-top">
    <header class="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">AI 剪藏</h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          贴一段英文，自动拆成单词 / 语块 / 句型卡片
        </p>
      </div>
      <button
        class="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label="返回"
        @click="router.back()"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M15 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </header>

    <!-- 导入成功 -->
    <section v-if="done" class="card-surface p-6 text-center">
      <div
        class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
      >
        <svg viewBox="0 0 24 24" class="h-7 w-7" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <p class="mt-4 text-lg font-semibold">已导入 {{ done.imported }} 张卡片</p>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
        <template v-if="done.skipped">另有 {{ done.skipped }} 张词库里已经有了，跳过。</template>
        <template v-else>它们会按每日新词的数量排进接下来的学习。</template>
      </p>
      <div class="mt-5 flex gap-2">
        <button class="btn-ghost flex-1" @click="restart">再剪一段</button>
        <button class="btn-primary flex-1" @click="router.push('/library')">去词库看看</button>
      </div>
    </section>

    <template v-else>
      <!-- 解析完把输入框收成一条摘要，把屏幕让给卡片 -->
      <section v-if="cards.length" class="card-surface flex items-center justify-between gap-3 p-4">
        <div class="min-w-0">
          <p class="text-sm font-semibold">解析完成</p>
          <p class="mt-0.5 truncate text-[11px] text-slate-400">
            {{ charCount }} 个字符 · {{ cards.length }} 张候选
          </p>
        </div>
        <button class="btn-ghost shrink-0 px-3 py-1.5 text-xs" @click="editAgain">重新粘贴</button>
      </section>

      <!-- 输入 -->
      <section v-else class="card-surface p-4">
        <textarea
          v-model="text"
          class="h-48 w-full resize-none rounded-xl bg-slate-50 p-3 text-sm leading-relaxed outline-none ring-1 ring-transparent transition placeholder:text-slate-400 focus:bg-white focus:ring-brand-500 dark:bg-slate-800/60 dark:focus:bg-slate-800"
          placeholder="粘贴英文文章、邮件、播客稿…… 至少 120 个字符"
          :disabled="analyzing"
        />
        <div class="mt-2 flex items-center justify-between text-[11px]">
          <span :class="tooLong ? 'text-red-500' : 'text-slate-400'">
            {{ charCount }} / {{ MAX_CHARS }}
            <template v-if="tooShort">· 还差 {{ MIN_CHARS - charCount }} 个字符</template>
          </span>
          <button class="font-medium text-brand-600 dark:text-brand-400" @click="useSample">用示例试试</button>
        </div>

        <p v-if="error" class="mt-2 text-xs leading-relaxed text-red-500">{{ error }}</p>

        <button class="btn-primary mt-3 w-full" :disabled="!canAnalyze" @click="analyze">
          <template v-if="analyzing">解析中… {{ elapsed }}s</template>
          <template v-else>拆成卡片</template>
        </button>

        <p v-if="analyzing" class="mt-2 text-center text-[11px] text-slate-400">
          模型正在读这段文字，一般 10-30 秒
        </p>
      </section>

      <!-- 结果 -->
      <section v-if="cards.length" class="mt-4">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold">
            挑出 {{ cards.length }} 张 · 已选 {{ pickedCount }}
          </p>
          <button class="text-xs font-medium text-brand-600 dark:text-brand-400" @click="toggleAll">
            {{ allPicked ? '全不选' : '全选' }}
          </button>
        </div>

        <ul class="space-y-2.5">
          <li v-for="(card, i) in cards" :key="`${card.type}-${card.content}-${i}`">
            <button
              class="card-surface w-full p-4 text-left transition"
              :class="picked.has(i) ? 'ring-2 ring-brand-500/60' : 'opacity-60'"
              @click="toggle(i)"
            >
              <div class="flex items-start gap-3">
                <span
                  class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition"
                  :class="
                    picked.has(i)
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-300 dark:border-slate-600'
                  "
                >
                  <svg v-if="picked.has(i)" viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3">
                    <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </span>

                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="truncate text-[15px] font-semibold">{{ card.content }}</p>
                      <p v-if="card.phonetic" class="mt-0.5 text-[11px] text-slate-400">{{ card.phonetic }}</p>
                    </div>
                    <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" :class="typeCls[card.type]">
                      {{ typeLabel[card.type] }}
                    </span>
                  </div>

                  <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">{{ card.definition }}</p>

                  <div v-if="card.grammarPattern" class="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    {{ card.grammarPattern }}
                  </div>

                  <div v-for="(ex, j) in card.examples.slice(0, 1)" :key="j" class="mt-2">
                    <p class="text-[11px] font-medium text-slate-500 dark:text-slate-400">{{ ex.en }}</p>
                    <p v-if="ex.zh" class="text-[11px] text-slate-400">{{ ex.zh }}</p>
                  </div>
                </div>
              </div>
            </button>
          </li>
        </ul>

        <button class="btn-primary mt-4 w-full py-4" :disabled="!pickedCount || importing" @click="doImport">
          {{ importing ? '导入中…' : `导入选中的 ${pickedCount} 张` }}
        </button>
      </section>

      <!-- 说明 -->
      <section v-else-if="!analyzing" class="card-surface mt-4 p-5">
        <h2 class="text-sm font-semibold">它会挑什么</h2>
        <ul class="mt-3 space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          <li><span class="font-semibold">单词</span>：高频实词，统一收成词典原形（clarifying → clarify）</li>
          <li><span class="font-semibold">语块</span>：固定搭配，如 touch base、come across as</li>
          <li><span class="font-semibold">句型</span>：带占位符的骨架，如 It takes sb. + 时间 + to do sth.</li>
        </ul>
        <p class="mt-3 text-[11px] leading-relaxed text-slate-400">
          专有名词、生僻词会被过滤；导入时按内容去重，同一段话反复剪不会灌满词库。
        </p>
      </section>
    </template>
  </div>
</template>
