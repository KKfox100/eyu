<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../stores/auth';
import { useTheme } from '../lib/theme';
import { readPracticePref, writePracticePref } from '../lib/prefs';

const router = useRouter();
const { user, logout } = useAuth();
const { isDark, toggleTheme } = useTheme();

const practiceOn = ref(readPracticePref());
function togglePractice() {
  practiceOn.value = !practiceOn.value;
  writePracticePref(practiceOn.value);
}

const dailyNew = ref(user.value?.dailyNewLimit ?? 10);
const dailyReview = ref(user.value?.dailyReviewLimit ?? 100);
const saving = ref(false);
const savedAt = ref<number | null>(null);
const error = ref<string | null>(null);

const initial = computed(() => {
  const name = user.value?.displayName || user.value?.email || 'e';
  return name.charAt(0).toUpperCase();
});

const timezone = computed(
  () => user.value?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
);

watch(
  () => user.value?.dailyNewLimit,
  (v) => {
    if (typeof v === 'number') dailyNew.value = v;
  }
);
watch(
  () => user.value?.dailyReviewLimit,
  (v) => {
    if (typeof v === 'number') dailyReview.value = v;
  }
);

async function save() {
  saving.value = true;
  error.value = null;
  try {
    const result = await api.updateSettings({
      dailyNewLimit: dailyNew.value,
      dailyReviewLimit: dailyReview.value,
    });
    if (user.value && result.user) user.value = result.user;
    savedAt.value = Date.now();
    setTimeout(() => (savedAt.value = null), 2000);
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

async function handleLogout() {
  await logout();
  router.replace('/login');
}
</script>

<template>
  <div class="mx-auto w-full max-w-lg flex-1 px-5 pb-8 pt-6 safe-top">
    <header class="mb-5">
      <h1 class="text-2xl font-bold tracking-tight">我的</h1>
    </header>

    <!-- 资料 -->
    <section class="card-surface flex items-center gap-4 p-5">
      <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">
        {{ initial }}
      </div>
      <div class="min-w-0">
        <p class="truncate text-base font-semibold">
          {{ user?.displayName || '未设置昵称' }}
        </p>
        <p class="truncate text-xs text-slate-500 dark:text-slate-400">{{ user?.email }}</p>
      </div>
    </section>

    <!-- 每日计划 -->
    <section class="card-surface mt-4 p-5">
      <h2 class="text-sm font-semibold">每日计划</h2>

      <div class="mt-4 space-y-5">
        <div>
          <div class="mb-2 flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">每日新词</p>
              <p class="text-[11px] text-slate-400">按频次从高到低发放；加练可到 3 倍</p>
            </div>
            <span class="text-sm font-semibold tabular-nums">{{ dailyNew }}</span>
          </div>
          <input v-model.number="dailyNew" type="range" min="0" max="100" step="5" class="w-full accent-brand-600" />
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">每日复习上限</p>
              <p class="text-[11px] text-slate-400">到期卡片优先，超出部分顺延</p>
            </div>
            <span class="text-sm font-semibold tabular-nums">{{ dailyReview }}</span>
          </div>
          <input v-model.number="dailyReview" type="range" min="10" max="300" step="10" class="w-full accent-brand-600" />
        </div>
      </div>

      <p v-if="error" class="mt-3 text-xs text-red-500">{{ error }}</p>

      <button class="btn-primary mt-4 w-full" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : savedAt ? '已保存' : '保存设置' }}
      </button>
    </section>

    <!-- 偏好 -->
    <section class="card-surface mt-4 divide-y divide-slate-100 dark:divide-slate-800">
      <button class="flex w-full items-center justify-between px-5 py-4 text-left" @click="toggleTheme">
        <span class="text-sm font-medium">深色模式</span>
        <span class="text-xs text-slate-400">{{ isDark ? '已开启' : '已关闭' }}</span>
      </button>
      <button class="flex w-full items-center justify-between px-5 py-4 text-left" @click="togglePractice">
        <span>
          <span class="text-sm font-medium">复习用练习题</span>
          <span class="mt-0.5 block text-[11px] text-slate-400">完形填空 / 语序重组；新卡不受影响</span>
        </span>
        <span class="text-xs text-slate-400">{{ practiceOn ? '已开启' : '已关闭' }}</span>
      </button>
      <div class="flex items-center justify-between px-5 py-4">
        <span class="text-sm font-medium">时区</span>
        <span class="text-xs text-slate-400">{{ timezone }}</span>
      </div>
      <div class="flex items-center justify-between px-5 py-4">
        <span class="text-sm font-medium">版本</span>
        <span class="text-xs text-slate-400">Phase 2 · 0.2.0</span>
      </div>
    </section>

    <!-- 算法说明 -->
    <section class="card-surface mt-4 p-5">
      <h2 class="text-sm font-semibold">记忆曲线怎么安排复习</h2>
      <ol class="mt-3 space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        <li><span class="font-semibold text-emerald-600 dark:text-emerald-400">掌握</span>：按 1 → 3 → 7 → 14 → 30 天推进</li>
        <li><span class="font-semibold text-amber-600 dark:text-amber-400">模糊</span>：间隔缩短约 40%，难度系数下调</li>
        <li><span class="font-semibold text-sky-600 dark:text-sky-400">熟知</span>：跨一级推进，难度系数上调</li>
        <li><span class="font-semibold text-rose-600 dark:text-rose-400">忘记</span>：重置到阶段 0，10 分钟后再来一次</li>
      </ol>
      <p class="mt-3 text-[11px] leading-relaxed text-slate-400">
        难度系数 EF 会被限制在 1.3–2.8，避免长期「熟知」导致间隔指数膨胀。
      </p>
    </section>

    <button class="btn-ghost mt-5 w-full text-red-600 dark:text-red-400" @click="handleLogout">
      退出登录
    </button>
  </div>
</template>
