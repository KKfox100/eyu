/**
 * 口语测评（纯函数 + 浏览器能力探测）
 *
 * 流程：SpeechRecognition 把朗读转成文本 → 和目标句做词级对齐 → 给分。
 * 判分只看「读对了几个词」，不评价音色、语调 —— 那需要音频特征分析，
 * Web Speech API 拿不到，硬做只会给出骗人的分数。
 */

export interface SpeechScore {
  /** 0–100 */
  score: number;
  matched: number;
  total: number;
  /** 目标句逐词标记，用于界面上打勾/标红 */
  tokens: Array<{ word: string; ok: boolean }>;
  /** 识别到的原文，给用户看「系统听到了什么」 */
  heard: string;
}

/** 及格线：读对 70% 的词就算过 */
export const PASS_SCORE = 70;

/** 英文数字词 → 数字，避免「20 minutes」被识别成「twenty minutes」时判错 */
const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
  hundred: '100',
};

/**
 * 规范化：小写、去标点、去掉撇号（it's → its，避免识别结果漏撇号被判错）、
 * 数字词转数字。
 */
export function normalizeSpeechText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    // 撇号直接删掉而不是变成空格：it's 和 its 应当等价
    .replace(/'/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((token) => NUMBER_WORDS[token] ?? token);
}

/**
 * 最长公共子序列对齐，返回目标句每个词是否被读到。
 * 用 LCS 而不是逐位比较：识别结果多词、少词、顺序微调都不该整句作废。
 */
function alignLcs(target: string[], heard: string[]): boolean[] {
  const n = target.length;
  const m = heard.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      dp[i][j] =
        target[i - 1] === heard[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const ok = new Array<boolean>(n).fill(false);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (target[i - 1] === heard[j - 1]) {
      ok[i - 1] = true;
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return ok;
}

export function scoreSpeech(target: string, heard: string): SpeechScore {
  const targetTokens = normalizeSpeechText(target);
  const heardTokens = normalizeSpeechText(heard);

  if (targetTokens.length === 0) {
    return { score: 0, matched: 0, total: 0, tokens: [], heard };
  }

  const flags = alignLcs(targetTokens, heardTokens);
  const matched = flags.filter(Boolean).length;

  return {
    score: Math.round((matched / targetTokens.length) * 100),
    matched,
    total: targetTokens.length,
    tokens: targetTokens.map((word, index) => ({ word, ok: flags[index] })),
    heard,
  };
}

/** 浏览器是否支持语音识别（Chrome / Edge 支持，Firefox 没有，Safari 部分支持） */
export function isSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return 'SpeechRecognition' in w || 'webkitSpeechRecognition' in w;
}

/**
 * 取一张卡片适合朗读的内容。
 * 单词和句型都读**例句**——只读一个 make 太短，识别几乎必然满分，考不出连读和语调；
 * 语块本身就是完整短语，读本体即可。
 */
export function pickSpeakTarget(card: {
  type: 'word' | 'chunk' | 'grammar';
  content: string;
  definition: string;
  examples: Array<{ en: string; zh?: string }>;
}): { text: string; zh: string | null } {
  if (card.type === 'chunk') {
    return { text: card.content, zh: card.definition };
  }
  const first = card.examples[0];
  if (first?.en) {
    return { text: first.en, zh: first.zh ?? card.definition };
  }
  return { text: card.content, zh: card.definition };
}

/**
 * 浏览器是否支持语音合成（朗读）。iOS / Android / 桌面 Chrome · Edge · Safari 都支持，
 * 但要注意：朗读和识别是两套能力 —— 有的环境支持朗读却不支持识别（或反之）。
 */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// 语音列表是异步加载的：首次调用时可能还是空的，必须监听 voiceschanged 再缓存起来。
// 不缓存的话，每次都拿不到 voice，部分安卓机型会静默不响。
let cachedVoices: SpeechSynthesisVoice[] = [];

function loadVoices(): void {
  if (!isSpeechSynthesisSupported()) return;
  const list = window.speechSynthesis.getVoices();
  if (list.length) cachedVoices = list;
}

if (isSpeechSynthesisSupported()) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

/**
 * 不同设备 / 浏览器的英文语音质量差很多：iOS 上 Samantha 最自然，Android 上
 * Google US English 最稳，但默认未必是它，有些设备还会塞一个很机器人的 Pico/TTS 语音。
 * 这里给每个 voice 打分，自动挑最自然的那一个 —— 这就是「自主换 TTS」，不用用户手动选。
 */
const QUALITY_HINTS: Array<[RegExp, number]> = [
  [/neural/i, 40],
  [/premium/i, 35],
  [/enhanced/i, 30],
  [/natural/i, 28],
  [/samantha/i, 26], // iOS 最自然的英文女声
  [/aria|jenny|guy|zira|david|mark/i, 22], // Windows / Edge 神经语音
  [/google us english/i, 18],
  [/microsoft/i, 12],
  [/daniel/i, 10], // iOS 男声
];

function scoreVoice(v: SpeechSynthesisVoice, want: string, base: string): number {
  let s = 0;
  const vl = (v.lang || '').toLowerCase();
  if (vl === want) s += 100;
  else if (vl.startsWith(want)) s += 60;
  else if (vl.startsWith(base)) s += 30;
  const name = v.name || '';
  for (const [re, pts] of QUALITY_HINTS) if (re.test(name)) s += pts;
  if (v.default) s += 6;
  return s;
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  if (!cachedVoices.length) loadVoices();
  if (!cachedVoices.length) return undefined;
  const want = lang.toLowerCase();
  const base = want.split('-')[0];
  let best: SpeechSynthesisVoice | undefined;
  let bestScore = -Infinity;
  for (const v of cachedVoices) {
    const sc = scoreVoice(v, want, base);
    if (sc > bestScore) {
      bestScore = sc;
      best = v;
    }
  }
  return best;
}

let speakToken = 0;

/**
 * 本地语音合成（speechSynthesis）。移动端的坑都集中在这里，单独抽出来统一处理：
 * 1. 先 cancel() 再 speak() 必须**隔开一帧**——iOS / 部分安卓里同步连写会把自己掐掉。
 * 2. 必须显式选一个英文 voice，否则部分设备静默失败。
 * 3. iOS 第一句经常被静默丢掉；用 speakToken 兜底补播一次。
 */
export function speakSynth(
  text: string,
  opts: { lang?: string; rate?: number; onStart?: () => void; onEnd?: () => void } = {}
): boolean {
  if (!isSpeechSynthesisSupported()) return false;
  const synth = window.speechSynthesis;
  const lang = opts.lang || 'en-US';

  try {
    synth.cancel();
  } catch {
    /* 忽略 */
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.volume = 1;
  utterance.rate = opts.rate ?? 0.92;
  utterance.pitch = 1;
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;

  let started = false;
  let ended = false;
  const token = ++speakToken;

  const finish = () => {
    if (ended) return;
    ended = true;
    opts.onEnd?.();
  };

  utterance.onstart = () => {
    started = true;
    opts.onStart?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;

  window.setTimeout(() => {
    if (token === speakToken) {
      try {
        synth.speak(utterance);
      } catch {
        finish();
      }
    }
  }, 150);

  window.setTimeout(() => {
    if (token === speakToken && !started) {
      try {
        synth.speak(utterance);
      } catch {
        /* 忽略 */
      }
    }
  }, 700);

  return true;
}

// ============================================================
// 云端神经 TTS（Workers AI · Deepgram Aura-2，经 Worker 转发，更自然）
// 注：最初试过 OpenAI TTS，但 OpenAI 对 Cloudflare Worker 出网地区做了地域封禁
// （403 unsupported_country_region_territory），跑不通；改用 Workers AI 自家网络。
// ============================================================

/** 默认云端音色：nova → Aura-2 的 luna（自然女声）。id 是稳定的 API 约定，后端再映射到具体说话人 */
const CLOUD_VOICE_DEFAULT = 'nova';
const CLOUD_VOICES = [
  { id: 'nova', label: '自然女声（默认）' },
  { id: 'shimmer', label: '柔和女声' },
  { id: 'alloy', label: '中性女声' },
  { id: 'fable', label: '清亮男声' },
  { id: 'onyx', label: '沉稳男声' },
  { id: 'echo', label: '明亮男声' },
] as const;

export const cloudVoices = CLOUD_VOICES;

let cloudEnabled = readBool('eyu.cloudTts', true);
let cloudVoice = localStorage.getItem('eyu.cloudVoice') || CLOUD_VOICE_DEFAULT;
let cloudBrokenUntil = 0;

function readBool(key: string, fallback: boolean): boolean {
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === '1';
}

/** 是否启用云端 TTS（默认开；关了就只用本地 speechSynthesis） */
export function isCloudTts(): boolean {
  return cloudEnabled;
}
export function setCloudTts(v: boolean): void {
  cloudEnabled = v;
  localStorage.setItem('eyu.cloudTts', v ? '1' : '0');
}
export function getCloudVoice(): string {
  return cloudVoice;
}
export function setCloudVoice(v: string): void {
  cloudVoice = v;
  localStorage.setItem('eyu.cloudVoice', v);
}

/** 设备能不能朗读：云端开着就算能（网络允许时），否则看本地 speechSynthesis 支持 */
export function isTtsAvailable(): boolean {
  return cloudEnabled || isSpeechSynthesisSupported();
}

function cloudBroken(): boolean {
  return Date.now() < cloudBrokenUntil;
}
function markCloudBroken(): void {
  cloudBrokenUntil = Date.now() + 60_000;
}

let audioEl: HTMLAudioElement | null = null;

/**
 * 走云端 TTS：fetch 音频 → <audio> 播放。失败（网络/端点）自动回退本地 speechSynthesis。
 * 返回 true 表示「已经发起尝试」（即便之后回退，调用方不必再处理）。
 */
function playCloud(
  text: string,
  opts: { lang?: string; rate?: number; voice?: string; onStart?: () => void; onEnd?: () => void }
): boolean {
  if (typeof window === 'undefined' || typeof window.Audio === 'undefined') return speakSynth(text, opts);
  const token = ++speakToken;
  const voice = opts.voice || cloudVoice;
  const url = `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}`;
  const headers: Record<string, string> = {};
  const tk = localStorage.getItem('eyu.token');
  if (tk) headers.Authorization = `Bearer ${tk}`;

  window
    .fetch(url, { headers })
    .then((res) => {
      if (!res.ok) throw new Error(`tts http ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      if (token !== speakToken) return;
      if (!blob || !blob.size) {
        markCloudBroken();
        speakSynth(text, opts);
        return;
      }
      const el = audioEl || (audioEl = new window.Audio());
      const objUrl = URL.createObjectURL(blob);
      const cleanup = () => {
        if (el.src === objUrl || el.src.startsWith('blob:')) URL.revokeObjectURL(objUrl);
      };
      el.onended = () => {
        cleanup();
        if (token === speakToken) opts.onEnd?.();
      };
      el.onerror = () => {
        cleanup();
        // 音频本身加载失败：说明这段 mp3 数据有问题，标记冷却避免反复兜圈子
        if (token === speakToken) {
          markCloudBroken();
          speakSynth(text, opts);
        }
      };
      el.src = objUrl;
      opts.onStart?.();
      // 注意：play() 被拒绝（个别浏览器自动播放策略 / 无音频设备）只本次回退本地，
      // 不标记云端「坏了」——接口是正常的，下次仍优先走云端。
      el.play().catch(() => {
        if (token === speakToken) speakSynth(text, opts);
      });
    })
    .catch(() => {
      if (token === speakToken) {
        markCloudBroken();
        speakSynth(text, opts);
      }
    });
  return true;
}

/**
 * 朗读入口：默认优先云端神经 TTS（更自然），失败回退本地 speechSynthesis。
 * 调用方无需关心走哪条路。
 */
export function speakText(
  text: string,
  opts: { lang?: string; rate?: number; voice?: string; onStart?: () => void; onEnd?: () => void } = {}
): boolean {
  if (cloudEnabled && !cloudBroken()) {
    return playCloud(text, opts);
  }
  return speakSynth(text, opts);
}
