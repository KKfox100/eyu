<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError } from '../lib/api';
import { useAuth } from '../stores/auth';
import { useTheme } from '../lib/theme';

const router = useRouter();
const route = useRoute();
const { login, register } = useAuth();
const { isDark, toggleTheme } = useTheme();

const mode = ref<'login' | 'register'>('login');
const email = ref('');
const password = ref('');
const displayName = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);

const isRegister = computed(() => mode.value === 'register');
const canSubmit = computed(
  () => email.value.includes('@') && password.value.length >= 8 && !submitting.value
);

function switchMode(next: 'login' | 'register') {
  mode.value = next;
  error.value = null;
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = null;
  try {
    if (isRegister.value) {
      await register(
        email.value.trim(),
        password.value,
        displayName.value.trim() || undefined
      );
    } else {
      await login(email.value.trim(), password.value);
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    router.replace(redirect);
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '操作失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="relative flex min-h-full flex-col justify-center px-6 py-10 safe-top">
    <button
      class="absolute right-5 top-5 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
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

    <div class="mx-auto w-full max-w-sm animate-rise">
      <div class="mb-9 text-center">
        <div
          class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-3xl font-bold text-white shadow-lg shadow-brand-600/25"
        >
          e
        </div>
        <h1 class="text-2xl font-bold tracking-tight">e语</h1>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
          高频词 · 实用语块 · 语法骨架，每天 10 分钟
        </p>
      </div>

      <div class="card-surface p-6">
        <div class="mb-5 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <button
            class="flex-1 rounded-lg py-2 text-sm font-medium transition"
            :class="
              !isRegister
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
            "
            @click="switchMode('login')"
          >
            登录
          </button>
          <button
            class="flex-1 rounded-lg py-2 text-sm font-medium transition"
            :class="
              isRegister
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
            "
            @click="switchMode('register')"
          >
            注册
          </button>
        </div>

        <form class="space-y-3" @submit.prevent="submit">
          <input
            v-if="isRegister"
            v-model="displayName"
            class="input"
            type="text"
            autocomplete="nickname"
            placeholder="昵称（可选）"
            maxlength="32"
          />
          <input
            v-model="email"
            class="input"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="邮箱"
            required
          />
          <input
            v-model="password"
            class="input"
            type="password"
            :autocomplete="isRegister ? 'new-password' : 'current-password'"
            placeholder="密码（至少 8 位，含字母和数字）"
            required
          />

          <p
            v-if="error"
            class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400"
          >
            {{ error }}
          </p>

          <button type="submit" class="btn-primary w-full" :disabled="!canSubmit">
            <svg
              v-if="submitting"
              class="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 12a9 9 0 1 1-6.2-8.6" stroke-linecap="round" />
            </svg>
            {{ isRegister ? '创建账号' : '登录' }}
          </button>
        </form>

        <p class="mt-4 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
          多用户数据完全隔离 · 登录状态 7 天有效
        </p>
      </div>

      <p class="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
        基于 SM-2 间隔重复算法 · 数据存于 Cloudflare D1
      </p>
    </div>
  </div>
</template>
