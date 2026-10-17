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
 * 朗读一段文本，返回是否真的发起了（false = 浏览器不支持语音合成）。
 *
 * 移动端的坑都集中在这里，所以单独抽出来统一处理：
 * 1. 先 cancel() 再 speak() 必须**隔开一帧**——iOS / 部分安卓里同步连写会把自己掐掉，
 *    表现就是「按了没声」。
 * 2. 必须显式选一个英文 voice，否则部分设备静默失败。
 * 3. iOS 第一句经常被静默丢掉；用 speakToken 兜底：超过 700ms 还没真正开始响，就补一次。
 *    同一时刻只允许最新的那次朗读补播，不会重复发声。
 */
export function speakText(
  text: string,
  opts: { lang?: string; rate?: number; onStart?: () => void; onEnd?: () => void } = {}
): boolean {
  if (!isSpeechSynthesisSupported()) return false;
  const synth = window.speechSynthesis;
  const lang = opts.lang || 'en-US';

  // 清掉残留队列：iOS 上旧的 utterance 没播完会让新的卡住
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

  // 隔一帧再 speak，给 cancel() 留出生效时间
  window.setTimeout(() => {
    if (token === speakToken) {
      try {
        synth.speak(utterance);
      } catch {
        finish();
      }
    }
  }, 150);

  // iOS 常见：第一句静默丢失，onstart 始终不触发。补播一次，靠 token 保证不重播。
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
