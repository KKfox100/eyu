/**
 * 智能剪藏的纯函数层：模型输出 → 可入库的卡片结构。
 * 单独放在 lib 里，测试就不用把整个 Hono 应用拖进来。
 */

import type { CardType } from '../types';

/** 一次最多产出多少张卡，防止模型失控刷库 */
const MAX_CARDS = 12;

export interface ClippedCard {
  type: CardType;
  content: string;
  phonetic: string | null;
  definition: string;
  grammarPattern: string | null;
  explanation: string | null;
  examples: Array<{ scene?: string; en: string; zh?: string }>;
  tags: string[];
}

/**
 * 修复被 max_tokens 截断的 JSON。
 *
 * 思路：扫一遍字符，维护「未闭合括号栈」。每当一个 `}` 闭合、且外面还有容器没关，
 * 就记下这个位置和「此刻需要补的闭合符序列」。取最靠后的那个位置截断并补齐 ——
 * 这样哪怕模型正写到第三个例句的半句话就断了，前面完整的卡片也能全救回来。
 */
export function repairTruncatedJson(text: string): unknown {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let best: { cut: number; closers: string } | null = null;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      stack.push('}');
    } else if (ch === '[') {
      stack.push(']');
    } else if (ch === '}' || ch === ']') {
      if (stack.length && stack[stack.length - 1] === ch) stack.pop();
      if (ch === '}' && stack.length) {
        best = { cut: i + 1, closers: [...stack].reverse().join('') };
      }
    }
  }

  if (!best) return null;
  try {
    return JSON.parse(text.slice(0, best.cut) + best.closers);
  } catch {
    return null;
  }
}

/** 从模型输出里抠出 JSON：容忍 ```json 围栏、前后废话、被 max_tokens 截断 */
export function extractJson(raw: string): unknown {
  const text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf('{');
  if (start < 0) return null;

  const end = candidate.lastIndexOf('}');
  if (end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // 落到下面的截断修复
    }
  }

  return repairTruncatedJson(candidate.slice(start));
}

function asString(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * 从 Workers AI 的返回里取出正文。
 *
 * 坑：同一批模型，返回结构并不统一 ——
 * - 新的 OpenAI 兼容格式把正文放在 choices[0].message.content，顶层 response 是空串；
 * - 老的 text-generation 格式才用 response。
 * 只读 response 的话，主力模型全被判成「empty」，然后悄悄降级到最差的模型。
 * 推理型模型（qwen3）还会把 token 烧在 reasoning 上、content 返回 null，这里也一并当空处理。
 */
export function readAiText(result: unknown): string {
  if (typeof result === 'string') return result.trim();
  if (!result || typeof result !== 'object') return '';

  const obj = result as Record<string, unknown>;

  const choices = obj.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as { message?: { content?: unknown } })?.message;
    const content = message?.content;
    if (typeof content === 'string' && content.trim()) return content.trim();
  }

  return typeof obj.response === 'string' ? obj.response.trim() : '';
}

/**
 * 归一化卡片类型。
 * prompt 是中文写的，模型经常把 type 直接输出成「单词 / 语块 / 句型」——
 * 只认英文枚举的话，整批卡片会被静默丢掉。
 */
export function normalizeType(value: unknown): CardType | null {
  const raw = asString(value, 20).toLowerCase();
  if (!raw) return null;
  if (raw === 'word' || raw.includes('单词') || raw.includes('词汇') || raw === 'vocab') return 'word';
  if (raw === 'chunk' || raw.includes('语块') || raw.includes('短语') || raw.includes('搭配')) return 'chunk';
  if (raw === 'grammar' || raw.includes('句型') || raw.includes('语法') || raw.includes('句式')) return 'grammar';
  return null;
}

/** 把模型的自由输出收敛成可入库的结构；字段缺失或类型不对就丢掉这张卡 */
export function sanitizeCards(raw: unknown): ClippedCard[] {
  const source = Array.isArray((raw as { cards?: unknown })?.cards)
    ? ((raw as { cards: unknown[] }).cards as unknown[])
    : [];

  const cards: ClippedCard[] = [];
  const seen = new Set<string>();

  for (const item of source) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;

    const type = normalizeType(row.type);
    if (!type) continue;

    const content = asString(row.content, 120);
    const definition = asString(row.definition, 240);
    if (!content || !definition) continue;

    const key = `${type}:${content.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const rawExamples = Array.isArray(row.examples) ? row.examples : [];
    const examples = rawExamples
      .map((ex) => {
        // 有的模型会把例句写成纯字符串数组
        if (typeof ex === 'string') return { scene: undefined, en: asString(ex, 300), zh: undefined };
        if (!ex || typeof ex !== 'object') return null;
        const obj = ex as Record<string, unknown>;
        return {
          scene: asString(obj.scene, 20) || undefined,
          en: asString(obj.en, 300),
          zh: asString(obj.zh, 300) || undefined,
        };
      })
      .filter((ex): ex is { scene: string | undefined; en: string; zh: string | undefined } => !!ex && ex.en.length > 0)
      .slice(0, 3);

    if (examples.length === 0) continue;

    const tags = (Array.isArray(row.tags) ? row.tags : [])
      .map((t) => asString(t, 16))
      .filter(Boolean)
      .slice(0, 6);

    cards.push({
      type,
      content,
      phonetic: asString(row.phonetic, 60) || null,
      definition,
      grammarPattern: asString(row.grammarPattern, 160) || null,
      explanation: asString(row.explanation, 400) || null,
      examples,
      tags,
    });

    if (cards.length >= MAX_CARDS) break;
  }

  return cards;
}
