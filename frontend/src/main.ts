import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { initTheme } from './lib/theme';
import { setUnauthorizedHandler } from './lib/api';
import { useAuth } from './stores/auth';
import './style.css';

initTheme();

const app = createApp(App);
app.use(router);

// 令牌失效时统一回到登录页
setUnauthorizedHandler(() => {
  useAuth().clearSession();
  if (router.currentRoute.value.name !== 'login') {
    router.replace({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } });
  }
});

app.mount('#app');
