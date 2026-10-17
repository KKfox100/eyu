<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const items = [
  {
    name: 'today',
    to: '/',
    label: '今日',
    icon: 'M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m10-10 1.4-1.4',
  },
  {
    name: 'library',
    to: '/library',
    label: '词库',
    icon: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Zm0 15A2.5 2.5 0 0 1 6.5 18H19',
  },
  {
    name: 'stats',
    to: '/stats',
    label: '统计',
    icon: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  },
  {
    name: 'me',
    to: '/me',
    label: '我的',
    icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0',
  },
];

const active = computed(() => route.name);
</script>

<template>
  <nav
    class="sticky bottom-0 z-30 mt-auto border-t border-slate-200/80 bg-white/90 backdrop-blur
           dark:border-slate-800 dark:bg-slate-950/90 safe-bottom"
  >
    <ul class="mx-auto flex max-w-lg items-stretch">
      <li v-for="item in items" :key="item.name" class="flex-1">
        <router-link
          :to="item.to"
          class="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition"
          :class="
            active === item.name
              ? 'text-brand-600 dark:text-brand-400'
              : 'text-slate-400 dark:text-slate-500'
          "
        >
          <svg
            viewBox="0 0 24 24"
            class="h-6 w-6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="item.icon" />
          </svg>
          {{ item.label }}
        </router-link>
      </li>
    </ul>
  </nav>
</template>
