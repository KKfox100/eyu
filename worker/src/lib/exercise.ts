/**
 * 练习引擎（纯函数）
 *
 * 两种题型：
 *  - cloze（完形填空）：从例句里挖掉目标词/语块，给 4 个选项
 *  - order（语序重组）：把例句切词打乱，让用户点回原序
 *
 * 设计原则：任何一步匹配不上就返回 null，由调用方降级 —— 宁可退回翻转卡，
 * 也不要生成一道「空格根本不存在」的废题。
 */

export interface Example {
  scene?: string;
  en: string;
  zh?: string;
}

export type CardType = 'word' | 'chunk' | 'grammar';

export interface ClozeExercise {
  mode: 'cloze';
  /** 挖空后的句子，空格统一用 ____ 表示 */
  sentence: string;
  /** 选项里的正确答案（卡片原形，用于和选项比对） */
  answer: string;
  /** 原句里的真实形态：takes / getting / how's it going? —— 揭晓时填回空格用 */
  answerForm: string;
  options: string[];
  zh: string | null;
  scene: string | null;
}

export interface OrderExercise {
  mode: 'order';
  /** 打乱后的词块 */
  shuffled: string[];
  /** 正确顺序（前端校验用；这是学习应用，不需要防作弊） */
  answerTokens: string[];
  zh: string | null;
  scene: string | null;
}

export type Exercise = ClozeExercise | OrderExercise;

const BLANK = '____';
const PUNCT = /[.,!?;:"“”()\[\]]/g;
/** 句子切词上限，太长不适合做语序重组 */
const MAX_TOKENS = 14;
/** 完形填空的最低词数（"It's late." 这种也能挖，只要目标词在里面） */
const MIN_TOKENS = 3;
/** 语序重组至少 5 个词块，"I got your message." 这种 4 词的等于白送 */
const ORDER_MIN_TOKENS = 5;

function tokenize(sentence: string): string[] {
  return sentence.trim().split(/\s+/).filter(Boolean);
}

/** 去掉标点、统一弯引号、转小写 —— 只用于比较，不用于显示 */
function normToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(PUNCT, '')
    .replace(/[’']/g, "'")
    .trim();
}

function stemOf(word: string): string {
  const w = normToken(word);
  if (w.length <= 3) return w;
  // 去掉词尾 e/y 后再做前缀匹配，能覆盖 make/making、study/studies
  return w.replace(/(e|y)$/, '');
}

/**
 * 常见词形变化（含规则变化与双写末尾辅音）。
 * 不用「前缀猜测」是因为它既会漏（get → getting 长度差 4）又会误伤（get → getter）。
 */
export function inflections(word: string): string[] {
  const w = normToken(word);
  if (!w) return [];

  const out = new Set([w, `${w}s`, `${w}es`, `${w}ed`, `${w}d`, `${w}ing`]);

  // study → studies / studied
  if (/[^aeiou]y$/.test(w)) {
    const base = w.slice(0, -1);
    out.add(`${base}ies`);
    out.add(`${base}ied`);
  }
  // make → making
  if (/e$/.test(w)) out.add(`${w.slice(0, -1)}ing`);
  // get → getting、put → putting
  if (/[^aeiou][aeiou][bdgklmnprt]$/.test(w)) {
    const doubled = w + w.slice(-1);
    out.add(`${doubled}ing`);
    out.add(`${doubled}ed`);
  }

  return [...out];
}

/**
 * 在句子中定位目标词：先按词形变化表精确匹配，再退化成同词干的前缀匹配。
 */
function findWordToken(tokens: string[], word: string): number {
  const target = normToken(word);
  if (!target) return -1;

  const forms = new Set(inflections(word));
  for (let i = 0; i < tokens.length; i += 1) {
    if (forms.has(normToken(tokens[i]))) return i;
  }

  // 兜底：不规则变化（make → made 之类）靠词干前缀，长度差限制在 2 以内
  const stem = stemOf(word);
  if (stem.length < 3) return -1;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = normToken(tokens[i]);
    if (t.startsWith(stem) && Math.abs(t.length - target.length) <= 2) return i;
  }
  return -1;
}

/** 在句子中定位语块：按 token 序列匹配，忽略标点与大小写 */
function findChunkSpan(tokens: string[], chunk: string): [number, number] | null {
  const target = tokenize(chunk).map(normToken).filter(Boolean);
  if (target.length === 0) return null;

  const norm = tokens.map(normToken);
  for (let i = 0; i + target.length <= norm.length; i += 1) {
    let hit = true;
    for (let j = 0; j < target.length; j += 1) {
      if (norm[i + j] !== target[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return [i, i + target.length - 1];
  }
  return null;
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 生成完形填空。
 * grammar 卡片不参与 —— 它的 content 是「It takes sb. + 时间 + to do sth.」这种骨架，
 * 在例句里根本不是字面串，挖空只会挖出个空。
 */
export function buildCloze(
  examples: Example[],
  card: { content: string; type: CardType }
): Omit<ClozeExercise, 'options'> | null {
  if (card.type === 'grammar') return null;

  for (const example of examples) {
    const tokens = tokenize(example.en);
    if (tokens.length < MIN_TOKENS || tokens.length > MAX_TOKENS + 4) continue;

    let start = -1;
    let end = -1;

    if (card.type === 'chunk') {
      const span = findChunkSpan(tokens, card.content);
      if (!span) continue;
      [start, end] = span;
    } else {
      const at = findWordToken(tokens, card.content);
      if (at < 0) continue;
      start = at;
      end = at;
    }

    // 句末标点要跟着空格走，否则 "How did the meeting go?" 会变成没有问号的残句。
    // 但语块本身可能已经带了标点（"How's it going?"），重复补就成了 "??"
    const rawTail = tokens[end].match(/[.,!?;:…]+$/)?.[0] ?? '';
    const tail = rawTail && !card.content.trim().endsWith(rawTail) ? rawTail : '';
    const sentence = [
      ...tokens.slice(0, start),
      BLANK + tail,
      ...tokens.slice(end + 1),
    ].join(' ');

    // 原句里的真实形态（可能是 takes / getting），揭晓时按它填回空格，
    // 否则 "It ____ 20 minutes" 填成 "take" 就成了病句
    const answerForm = tokens
      .slice(start, end + 1)
      .join(' ')
      .replace(/[.,!?;:…]+$/, '');

    return {
      mode: 'cloze',
      sentence,
      answer: card.content,
      answerForm: answerForm || card.content,
      zh: example.zh ?? null,
      scene: example.scene ?? null,
    };
  }

  return null;
}

/**
 * 生成语序重组。任意类型都适用，只要有长度合适的例句。
 */
export function buildOrder(
  examples: Example[],
  rand: () => number = Math.random
): OrderExercise | null {
  const usable = examples.filter((e) => {
    const n = tokenize(e.en).length;
    return n >= ORDER_MIN_TOKENS && n <= MAX_TOKENS;
  });
  if (usable.length === 0) return null;

  const example = usable[Math.floor(rand() * usable.length)];
  const answerTokens = tokenize(example.en);

  let shuffled = shuffle(answerTokens, rand);
  // 打乱后如果与原序一致（短句很容易），再洗几次
  for (let attempt = 0; attempt < 6 && shuffled.every((t, i) => t === answerTokens[i]); attempt += 1) {
    shuffled = shuffle(answerTokens, rand);
  }

  return {
    mode: 'order',
    shuffled,
    answerTokens,
    zh: example.zh ?? null,
    scene: example.scene ?? null,
  };
}

/** 从释义里读词性：种子数据的定义都以 "v. " / "adj. " / "n. " 开头 */
export function posOf(definition: string | null | undefined): string {
  return (definition?.match(/^\s*([a-zA-Z]+)\./)?.[1] ?? '').toLowerCase();
}

/**
 * 拼装选项：正确答案 + 3 个干扰项。
 * 干扰项优先取长度接近的，避免「三个两字母 + 一个十字母」把答案直接暴露。
 */
export function buildOptions(
  answer: string,
  pool: string[],
  rand: () => number = Math.random,
  count = 4
): string[] {
  const seen = new Set([answer.toLowerCase()]);
  const candidates = pool
    .map((item) => item.trim())
    .filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));

  const scored = candidates
    .map((item) => ({ item, gap: Math.abs(item.length - answer.length) }))
    .sort((a, b) => a.gap - b.gap);

  // 从「长度最接近的前 10 个」里随机取，既有区分度又不至于每次都一样
  const head = scored.slice(0, 10).map((s) => s.item);
  const picked = shuffle(head, rand).slice(0, Math.max(0, count - 1));

  // 词库不够时用尾部候选补齐
  if (picked.length < count - 1) {
    for (const item of scored.slice(10).map((s) => s.item)) {
      if (picked.length >= count - 1) break;
      if (!picked.includes(item)) picked.push(item);
    }
  }

  return shuffle([answer, ...picked], rand);
}

/** 校验语序重组的答案 */
export function checkOrder(answerTokens: string[], picked: string[]): boolean {
  if (answerTokens.length !== picked.length) return false;
  return answerTokens.every((token, i) => token === picked[i]);
}
