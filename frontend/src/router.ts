import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from './stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
      meta: { guestOnly: true, title: '登录' },
    },
    {
      path: '/',
      name: 'today',
      component: () => import('./views/TodayView.vue'),
      meta: { requiresAuth: true, title: '今日' },
    },
    {
      path: '/study',
      name: 'study',
      component: () => import('./views/StudyView.vue'),
      meta: { requiresAuth: true, title: '学习' },
    },
    {
      path: '/stats',
      name: 'stats',
      component: () => import('./views/StatsView.vue'),
      meta: { requiresAuth: true, title: '统计' },
    },
    {
      path: '/library',
      name: 'library',
      component: () => import('./views/LibraryView.vue'),
      meta: { requiresAuth: true, title: '词库' },
    },
    {
      path: '/me',
      name: 'me',
      component: () => import('./views/MeView.vue'),
      meta: { requiresAuth: true, title: '我的' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach(async (to) => {
  const { token, user, booting, bootstrap } = useAuth();
  if (booting.value) await bootstrap();

  if (to.meta.requiresAuth && !(token.value && user.value)) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && token.value && user.value) {
    return { name: 'today' };
  }
  return true;
});

router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) ?? '';
  document.title = title ? `${title} · e语` : 'e语 · 英语打卡自学';
});

export default router;
