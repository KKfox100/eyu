import { Hono } from 'hono';
import type { AuthUser, Env } from '../types';
import { jsonError, jsonOk, newId } from '../lib/http';
import { extractJson, readAiText, sanitizeCards } from '../lib/clip';
import { requireAuth, type AppEnv } from '../middleware/auth';

const app = new Hono<AppEnv>();

/**
 * 候选模型，按顺序试。
 * Workers AI 的模型下线很突然（llama-3.1-8b 在 2026-05-30 就 deprecate 了），
 * 所以这里留一串备选：前一个报 5028/3040 就换下一个，不让整个剪藏功能挂掉。
 */
const MODELS = [
  // 8s / 6 张，质量最稳，首选
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  // 13s / 3 张，偏保守但不会胡说
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  // 26s / 8 张，最全但慢，压箱底
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
];

const SYSTEM_PROMPT = `你是资深英语教学专家，负责把英文素材拆成可复习的卡片。

规则：
1. 只挑「值得学」的表达，6-8 张；专有名词、生僻词、人名地名一律不要。
2. type 只能是 word / chunk / grammar 三种：
   - word：高频实词（动词优先）。content **必须是词典原形**：原文出现 clarifying 就写 clarify，出现 confirmed 就写 confirm，出现 studies 就写 study。绝不要输出 -ing / -ed / -s 形式。
   - chunk：固定搭配、口语语块，如 "touch base"、"in terms of"、"make sense"。chunk 里该用原形的地方同样用原形。
   - grammar：句型骨架，用 sb. / sth. / do sth. / + 时间 + 这类占位符，如 "It takes sb. + 时间 + to do sth."
3. definition 用中文，word 必须带词性前缀，格式 "v. 谈判；协商" / "adj. 勉强的" / "n. 预算"。
4. 每张卡给 1-2 个例句：优先直接引用原文句子，其次改写贴近原文语境；必须带中文翻译。
5. word 给 phonetic（英式音标，带斜杠），没有把握就省略。
6. grammar 卡额外给 grammarPattern（可替换的骨架）和 explanation（100 字以内，讲清「为什么这么说」）。
7. 所有字段用英文双引号，不要输出注释、不要输出 markdown 代码块之外的内容。

严格输出下面结构的 JSON：
{"cards":[{"type":"word","content":"negotiate","phonetic":"/nɪˈɡəʊʃieɪt/","definition":"v. 谈判；协商","examples":[{"scene":"职场","en":"We need to negotiate the price.","zh":"我们需要谈谈价格。"}],"tags":["职场"]}]}`;

/** 一段剪藏文本的长度上下限 */
const MIN_CHARS = 120;
const MAX_CHARS = 6000;
/**
 * POST /api/clip/analyze
 * body: { text }
 * 把一段英文拆成卡片，只返回结果不落库 —— 让用户先看一眼、改一改再导入。
 */
app.post('/analyze', requireAuth, async (c) => {
  const body = await c.req
    .json<{ text?: unknown }>()
    .catch(() => ({} as Record<string, unknown>));

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < MIN_CHARS) {
    return jsonError(c, 400, 'text_too_short', `至少粘贴 ${MIN_CHARS} 个字符的英文`);
  }
  if (text.length > MAX_CHARS) {
    return jsonError(c, 400, 'text_too_long', `一次最多 ${MAX_CHARS} 个字符，分几次剪藏`);
  }

  const env = c.env as unknown as Env;

  const failures: string[] = [];

  for (const model of MODELS) {
    try {
      const result = (await env.AI.run(model as never, {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `请分析这段英文：\n\n${text}` },
        ],
        // 2048 是这几个模型的单次输出上限，写 4096 会直接报错；
        // 靠「6-8 张卡 + 每张 1-2 个例句」把输出压在上限内，万一超了还有截断修复兜底
        max_tokens: 2048,
        temperature: 0.2,
      })) as { response?: string };

      const raw = readAiText(result);
      if (!raw) {
        failures.push(`${model}: empty`);
        continue;
      }

      const cards = sanitizeCards(extractJson(raw));
      if (cards.length === 0) {
        // 小模型偶尔会退化成复读（输出几千个下划线），这种也算失败，换下一个模型
        failures.push(`${model}: unparsable(${raw.length})`);
        continue;
      }

      return jsonOk(c, { cards, model, chars: text.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${model}: ${message.slice(0, 120)}`);
    }
  }

  return jsonError(
    c,
    502,
    'ai_unavailable',
    `AI 解析失败（${failures.join(' | ')}）`
  );
});

/**
 * POST /api/clip/import
 * body: { cards: ClippedCard[] }
 * 写入 cards_master，owner_id = 当前用户（私有卡片），source = 'ai-clip'
 */
app.post('/import', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const body = await c.req
    .json<{ cards?: unknown }>()
    .catch(() => ({} as Record<string, unknown>));

  const cards = sanitizeCards({ cards: body.cards });
  if (cards.length === 0) return jsonError(c, 400, 'no_cards', '没有可导入的卡片');

  // 同一用户下按 content 去重，避免反复剪藏同一段话把词库灌满
  const existing = await c.env.DB.prepare(
    `SELECT content FROM cards_master WHERE owner_id = ?1`
  )
    .bind(user.id)
    .all<{ content: string }>();
  const known = new Set((existing.results ?? []).map((r) => r.content.toLowerCase()));

  const now = new Date().toISOString();
  const statements = [];
  let skipped = 0;

  for (const card of cards) {
    if (known.has(card.content.toLowerCase())) {
      skipped += 1;
      continue;
    }
    known.add(card.content.toLowerCase());

    statements.push(
      c.env.DB.prepare(
        `INSERT INTO cards_master
           (id, type, content, phonetic, definition, grammar_pattern, explanation,
            examples_json, frequency_rank, tags, difficulty, source, owner_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, 2, 'ai-clip', ?10, ?11)`
      ).bind(
        newId(),
        card.type,
        card.content,
        card.phonetic,
        card.definition,
        card.grammarPattern,
        card.explanation,
        JSON.stringify(card.examples),
        card.tags.length ? JSON.stringify(card.tags) : null,
        user.id,
        now
      )
    );
  }

  if (statements.length) await c.env.DB.batch(statements);

  return jsonOk(c, { imported: statements.length, skipped });
});

export default app;
