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
