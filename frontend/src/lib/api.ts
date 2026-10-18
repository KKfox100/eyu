const RAW_BASE = import.meta.env.VITE_API_BASE ?? '';
export const API_BASE = RAW_BASE.replace(/\/$/, '');

const TOKEN_KEY = 'eyu.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler): void {
  onUnauthorized = fn;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch {
    throw new ApiError(0, 'network_error', '网络连接失败，请检查网络后重试');
  }

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    const code = payload?.error?.code ?? 'http_error';
    const message = payload?.error?.message ?? `请求失败（${response.status}）`;
    if (response.status === 401 && code !== 'invalid_credentials') {
      setToken(null);
      onUnauthorized?.();
    }
    throw new ApiError(response.status, code, message);
  }

  return payload.data as T;
}

// ---------- 类型 ----------
export interface User {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  dailyNewLimit: number;
  dailyReviewLimit: number;
  reminderEnabled: boolean;
  reminderWebhook: string | null;
  createdAt?: string;
}

export interface StudyCard {
  userCardId: string;
  cardId: string;
  type: 'word' | 'chunk' | 'grammar';
  content: string;
  phonetic: string | null;
  definition: string;
  grammarPattern: string | null;
  explanation: string | null;
  examples: Array<{ scene?: string; en: string; zh?: string }>;
  tags: string[];
  frequencyRank: number | null;
  stage: number;
  easinessFactor: number;
  intervalDays: number;
  nextReviewAt: string;
  reps: number;
  lapses: number;
  isNew: boolean;
}

export interface QueueResponse {
  today: string;
  queue: StudyCard[];
  summary: {
    dueNow: number;
    dueInQueue: number;
    /** 已发放但还没学完的新卡（「点开队列没学就退出」留下的，会被重新排进队列） */
    pendingInQueue: number;
    newInQueue: number;
    dailyNewLimit: number;
    newCap: number;
    /** 今日已引入的新卡数（额度按「引入」扣，不按「学完」扣） */
    newIntroducedToday: number;
    /** 今日还能引入多少张全新卡 */
    newQuotaLeft: number;
    /** 词库里还剩多少张从未学过的卡 */
    newDeckLeft: number;
    extraNewCap: number;
    extra: boolean;
    dailyReviewLimit: number;
  };
}

export type ExerciseMode = 'cloze' | 'order';

export interface ClozeExercise {
  mode: 'cloze';
  sentence: string;
  answer: string;
  /** 原句里的真实形态（takes / getting），揭晓时填回空格 */
  answerForm: string;
  options: string[];
  zh: string | null;
  scene: string | null;
}

export interface OrderExercise {
  mode: 'order';
  shuffled: string[];
  answerTokens: string[];
  zh: string | null;
  scene: string | null;
}

export type Exercise = ClozeExercise | OrderExercise;

export type ExerciseResponse =
  | { available: true; exercise: Exercise }
  | { available: false; reason: string };

export interface ReviewResponse {
  card: {
    userCardId: string;
    stage: number;
    easinessFactor: number;
    intervalDays: number;
    state: string;
    nextReviewAt: string;
    lapses: number;
    reps: number;
  };
  feedback: {
    rating: number;
    isLapse: boolean;
    intervalLabel: string;
    efDelta: number;
  };
  remainingDue: number;
}

export interface ClippedCard {
  type: 'word' | 'chunk' | 'grammar';
  content: string;
  phonetic: string | null;
  definition: string;
  grammarPattern: string | null;
  explanation: string | null;
  examples: Array<{ scene?: string; en: string; zh?: string }>;
  tags: string[];
}

export interface Overview {
  today: {
    date: string;
    reviewed: number;
    newLearned: number;
    accuracy: number | null;
    goalMet: boolean;
  };
  totals: {
    learned: number;
    mastered: number;
    learning: number;
    dueNow: number;
    newAvailable: number;
    byType: Record<string, number>;
  };
  streak: { current: number; longest: number; lastActiveDate: string | null };
  heatmap: Array<{ date: string; count: number; newCount: number; goodCount: number }>;
  days: number;
}

// ---------- 接口 ----------
export const api = {
  register: (body: { email: string; password: string; displayName?: string }) =>
    request<{ token: string; expiresIn: number; user: User }>('/api/auth/register', {
      method: 'POST',
      body,
    }),

  login: (body: { email: string; password: string }) =>
    request<{ token: string; expiresIn: number; user: User }>('/api/auth/login', {
      method: 'POST',
      body,
    }),

  logout: () => request<{ loggedOut: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: User }>('/api/auth/me'),

  updateSettings: (
    body: Partial<
      Pick<
        User,
        | 'dailyNewLimit'
        | 'dailyReviewLimit'
        | 'timezone'
        | 'displayName'
        | 'reminderEnabled'
        | 'reminderWebhook'
      >
    >
  ) => request<{ user: User }>('/api/auth/me', { method: 'PATCH', body }),

  queue: (limit = 30, extra = false) =>
    request<QueueResponse>(`/api/study/queue?limit=${limit}${extra ? '&extra=1' : ''}`),

  exercise: (userCardId: string, mode: 'auto' | ExerciseMode = 'auto') =>
    request<ExerciseResponse>(`/api/study/exercise?userCardId=${encodeURIComponent(userCardId)}&mode=${mode}`),

  review: (body: { userCardId: string; rating: 0 | 1 | 2 | 3; mode?: string; elapsedMs?: number }) =>
    request<ReviewResponse>('/api/study/review', { method: 'POST', body }),

  overview: (days = 90) => request<Overview>(`/api/stats/overview?days=${days}`),

  /** 剪藏：把一段英文拆成卡片（只解析，不落库） */
  clipAnalyze: (text: string) =>
    request<{ cards: ClippedCard[]; model: string; chars: number }>('/api/clip/analyze', {
      method: 'POST',
      body: { text },
    }),

  clipImport: (cards: ClippedCard[]) =>
    request<{ imported: number; skipped: number }>('/api/clip/import', {
      method: 'POST',
      body: { cards },
    }),

  cards: (params: { page?: number; pageSize?: number; type?: string; q?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.page) search.set('page', String(params.page));
    if (params.pageSize) search.set('pageSize', String(params.pageSize));
    if (params.type) search.set('type', params.type);
    if (params.q) search.set('q', params.q);
    return request<{
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      items: StudyCard[];
    }>(`/api/study/cards?${search.toString()}`);
  },
};
