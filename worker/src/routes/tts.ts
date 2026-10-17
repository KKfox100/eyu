import { Hono } from 'hono';
import { requireAuth, type AppEnv } from '../middleware/auth';

/**
 * 云端神经 TTS —— 走 OpenAI 的语音合成（tts-1-hd，语调断句接近真人）。
 *
 * 为什么不用浏览器自带的 speechSynthesis：它受设备限制，部分手机默认是很机器人的语音。
 * 为什么用 OpenAI 而不是 Edge TTS：Cloudflare 免费计划**禁止出站 WebSocket**，
 * 而 Edge / Azure 的神经语音走 WebSocket 协议，在这里跑不通。OpenAI TTS 是普通 HTTP，能用。
 *
 * 前端 fetch 这段音频 → <audio> 播放；失败时自动回退本地 speechSynthesis（见 frontend/src/lib/speech.ts）。
 */
const app = new Hono<AppEnv>();

const DEFAULT_VOICE = 'nova';
const MAX_TEXT = 1000;
/** 允许的 OpenAI 音色白名单（防止被拿去合成任意音色） */
const ALLOWED_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
const MODEL = 'tts-1-hd';

app.use('*', requireAuth);

app.get('/', async (c) => {
  const key = c.env.OPENAI_API_KEY;
  if (!key) {
    return c.json(
      { ok: false, error: { code: 'tts_no_key', message: '未配置 OPENAI_API_KEY' } },
      503
    );
  }
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
    const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        input: text,
        voice,
        response_format: 'mp3',
      }),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return c.json(
        { ok: false, error: { code: 'tts_upstream', message: `OpenAI ${upstream.status}: ${detail.slice(0, 200)}` } },
        502
      );
    }
    const mp3 = new Uint8Array(await upstream.arrayBuffer());
    if (!mp3.length) {
      return c.json({ ok: false, error: { code: 'tts_empty', message: 'TTS 返回空音频' } }, 502);
    }
    return new Response(mp3, {
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
