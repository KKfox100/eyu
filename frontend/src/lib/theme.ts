import { ref } from 'vue';

const STORAGE_KEY = 'eyu.theme';
const isDark = ref(false);

function apply(dark: boolean): void {
  isDark.value = dark;
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#020617' : '#4f46e5');
}

export function initTheme(): void {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') {
    apply(saved === 'dark');
    return;
  }
  apply(window.matchMedia('(prefers-color-scheme: dark)').matches);
}

export function toggleTheme(): void {
  const next = !isDark.value;
  localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  apply(next);
}

export function useTheme() {
  return { isDark, toggleTheme };
}
