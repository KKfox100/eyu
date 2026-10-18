import { Hono } from 'hono';
import { requireAuth, type AppEnv } from '../middleware/auth';

/**
 * 云端神经 TTS —— 走 Cloudflare 自家的 Workers AI（Deepgram Aura-2，语调断句接近真人）。
 *
 * 为什么不用浏览器自带的 speechSynthesis：它受设备限制，部分手机默认是很机器人的语音。
 * 为什么不用 OpenAI TTS：OpenAI 的 API 对 Cloudflare Worker 出网所在地区做了地域封禁
 * （返回 403 unsupported_country_region_territory），在这套部署上跑不通。
 * Workers AI 跑在 Cloudflare 自己的网络里，没有出网地域问题，且复用已有的 AI binding，不另需密钥。
 *
 * 前端 fetch 这段音频 → <audio> 播放；失败时自动回退本地 speechSynthesis（见 frontend/src/lib/speech.ts）。
 *
 * 前端传来的是 OpenAI 风格音色名（nova/shimmer/...），这里映射到 Aura-2 的说话人。
 */
const app = new Hono<AppEnv>();

const DEFAULT_VOICE = 'nova';
const MAX_TEXT = 1000;
/** 前端音色名 → Aura-2 说话人（全部为合法 enum 值） */
const SPEAKER_MAP: Record<string, string> = {
  nova: 'luna', // 自然女声（默认）
  shimmer: 'athena', // 柔和女声
  alloy: 'asteria', // 中性女声
  fable: 'orion', // 清亮男声
  onyx: 'zeus', // 沉稳男声
  echo: 'apollo', // 明亮男声
};
const ALLOWED_VOICES = new Set(Object.keys(SPEAKER_MAP));
const MODEL = '@cf/deepgram/aura-2-en';

app.use('*', requireAuth);

app.get('/', async (c) => {
  const text = (c.req.query('text') || '').trim();
  const requestedVoice = (c.req.query('voice') || DEFAULT_VOICE).trim();
  const voice = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : DEFAULT_VOICE;
  if (!text) {
    return c.json({ ok: false, error: { code: 'bad_request', message: 'text 不能为空' } }, 400);
  }
  if (text.length > MAX_TEXT) {
    return c.json({ ok: false, error: { code: 'bad_request', message: 'text 过长（上限 1000 字符）' } }, 400);
  }

  try {
    // 注意：encoding=mp3 时不能带 container 参数（Aura-2 的限制）。
    const audio = (await c.env.AI.run(MODEL as any, {
      text,
      speaker: SPEAKER_MAP[voice],
      encoding: 'mp3',
    } as any)) as unknown as ArrayBuffer | null;

    if (!audio || audio.byteLength === 0) {
      return c.json({ ok: false, error: { code: 'tts_empty', message: 'TTS 返回空音频' } }, 502);
    }
    return new Response(audio as BodyInit, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    return c.json(
      { ok: false, error: { code: 'tts_failed', message: (err as Error).message } },
      502
    );
  }
});

export default app;
