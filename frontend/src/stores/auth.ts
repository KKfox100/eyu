import { computed, ref } from 'vue';
import { api, getToken, setToken, type User } from '../lib/api';

const user = ref<User | null>(null);
const token = ref<string | null>(getToken());
const booting = ref(true);
const authError = ref<string | null>(null);

async function bootstrap(): Promise<void> {
  if (!token.value) {
    booting.value = false;
    return;
  }
  try {
    const { user: me } = await api.me();
    user.value = me;
  } catch {
    setToken(null);
    token.value = null;
    user.value = null;
  } finally {
    booting.value = false;
  }
}

async function login(email: string, password: string): Promise<void> {
  authError.value = null;
  const result = await api.login({ email, password });
  setToken(result.token);
  token.value = result.token;
  user.value = result.user;
}

async function register(email: string, password: string, displayName?: string): Promise<void> {
  authError.value = null;
  const result = await api.register({ email, password, displayName });
  setToken(result.token);
  token.value = result.token;
  user.value = result.user;
}

async function logout(): Promise<void> {
  try {
    await api.logout();
  } catch {
    // 网络失败也要清掉本地状态
  }
  setToken(null);
  token.value = null;
  user.value = null;
}

function clearSession(): void {
  setToken(null);
  token.value = null;
  user.value = null;
}

export function useAuth() {
  return {
    user,
    token,
    booting,
    authError,
    isAuthenticated: computed(() => Boolean(token.value && user.value)),
    bootstrap,
    login,
    register,
    logout,
    clearSession,
  };
}
