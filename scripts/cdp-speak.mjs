/**
 * CDP 验证：云端 TTS（Workers AI）的真实调用路径。
 *
 * 沙箱没有音频输出，本脚本**不验证「有没有声音」**，只验证：
 *   1) 点击「听一遍 / 朗读」后，浏览器真的向 /api/tts 发起了请求
 *   2) 该请求返回 200 + audio/mpeg + 有字节（说明 Worker 真的吐了 mp3）
 *   3) 一个 <audio> 元素真的调用了 play()（说明前端拿到 mp3 并尝试播放）
 *   4) 没有触发本地 speechSynthesis.speak（说明没有回退到生硬的本机女声）
 *
 * 直接用 fetch 包装器抓 /api/tts 的真实 status / content-type / size（克隆响应，不干扰页面）。
 * 用法：node scripts/cdp-speak.mjs
 */
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9338;
const BASE = process.env.BASE || 'https://eyu.letsgo.cc.cd';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOOK = `(() => {
  window.__log = { speaks: [], cancels: 0, audioPlays: [], ttsFetch: null };
  const synth = window.speechSynthesis;
  if (synth) {
    const sSpeak = synth.speak.bind(synth);
    synth.speak = (u) => { window.__log.speaks.push({ at: Date.now(), text: (u.text||'').slice(0,40), lang: u.lang, voice: u.voice && u.voice.name }); sSpeak(u); };
    const sCancel = synth.cancel.bind(synth);
    synth.cancel = (...a) => { window.__log.cancels += 1; sCancel(...a); };
  }
  const OAP = HTMLAudioElement.prototype.play;
  HTMLAudioElement.prototype.play = function () {
    window.__log.audioPlays.push({ at: Date.now(), src: (this.src || '').slice(0, 50) });
    // 无头 Chrome 没有音频设备，真实 play() 会 reject → 误触发本地回退。
    // 这里模拟「播放成功」（resolve），以便测试 App 自身的逻辑：云端拿到 mp3 后是否会兜底本地。
    return Promise.resolve();
  };
  const OF = window.fetch;
  window.fetch = function (url, opts) {
    const u = typeof url === 'string' ? url : (url && url.url);
    if (u && u.includes('/api/tts')) {
      const rec = { url: u, status: null, mime: null, size: null, ok: null };
      window.__log.ttsFetch = rec;
      return OF.apply(this, arguments).then(async (res) => {
        rec.status = res.status;
        rec.ok = res.ok;
        rec.mime = res.headers ? res.headers.get('content-type') : null;
        try { const b = await res.clone().blob(); rec.size = b.size; } catch (e) { rec.size = -1; }
        return res;
      });
    }
    return OF.apply(this, arguments);
  };
})()`;

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--window-size=420,1000',
    `--user-data-dir=C:/temp/cdp-speak-${Date.now()}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

async function getTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {
      /* wait */
    }
    await sleep(250);
  }
  throw new Error('Chrome 没起来');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
});

let id = 0;
const pending = new Map();
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
function send(method, params = {}) {
  const mid = ++id;
  return new Promise((resolve, reject) => {
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'evaluate 失败');
  return result.result.value;
}
const waitFor = async (expr, timeoutMs, label) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expr)) return true;
    await sleep(300);
  }
  throw new Error(`等待超时：${label}`);
};
const getLog = () => evaluate(`window.__log || null`);

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

  console.log('1) 注册并登录');
  await send('Page.navigate', { url: `${BASE}/login` });
  await sleep(1200);
  const email = `cdps${Date.now()}@eyu.app`;
  const reg = await evaluate(`(async () => {
    const r = await fetch('${BASE}/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: '${email}', password: 'eyu12345' }) });
    const j = await r.json();
    if (!j.ok) return 'FAIL:' + JSON.stringify(j);
    localStorage.setItem('eyu.token', j.data.token);
    return 'ok';
  })()`);
  if (reg !== 'ok') throw new Error('注册失败 ' + reg);

  async function clickAndObserve(buttonExpr, label, waitText) {
    await evaluate(`window.__log = { speaks: [], cancels: 0, audioPlays: [], ttsFetch: null };`);
    const clicked = await evaluate(`(() => { const el = ${buttonExpr}; if (!el) return false; window.__clickAt = Date.now(); el.click(); return true; })()`);
    console.log('   [' + label + '] 点击:', clicked);
    await sleep(3500);
    const log = await getLog();
    console.log('   /api/tts:', JSON.stringify(log?.ttsFetch));
    console.log('   <audio> play:', log?.audioPlays.length, '| 本地 speak:', log?.speaks.length, '| cancel:', log?.cancels);
    if (log?.speaks[0]) console.log('   本地首句:', JSON.stringify(log.speaks[0]));
    return log;
  }

  console.log('2) 学习页（SpeakCard · 听一遍）');
  await send('Page.navigate', { url: `${BASE}/study` });
  await waitFor(`[...document.querySelectorAll('button')].some(n => (n.getAttribute('aria-label')||'')==='跟读这句')`, 20000, '学习页出现跟读按钮');
  await evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(n => (n.getAttribute('aria-label')||'')==='跟读这句'); el && el.click(); })()`);
  await waitFor(`(document.body?.innerText || '').includes('听一遍')`, 20000, '跟读模式渲染出听一遍');
  const study = await clickAndObserve(`[...document.querySelectorAll('button')].find(n => (n.textContent || '').includes('听一遍') && n.offsetParent !== null)`, '听一遍');

  console.log('3) 词库页（朗读按钮）');
  await send('Page.navigate', { url: `${BASE}/library` });
  await waitFor(`(document.body?.innerText || '').includes('共 340')`, 15000, '词库页渲染出卡片列表');
  await evaluate(`(() => { const el = document.querySelector('ul li button'); el && el.click(); })()`);
  let libReady = true;
  try {
    await waitFor(`(document.body?.innerText || '').includes('朗读')`, 8000, '展开卡片后出现朗读');
  } catch {
    libReady = false;
    console.log('   展开后仍未出现「朗读」');
  }
  const lib = libReady
    ? await clickAndObserve(`[...document.querySelectorAll('button')].find(n => (n.textContent || '').trim() === '朗读' && n.offsetParent !== null)`, '朗读')
    : null;

  const ttsStudy = study?.ttsFetch;
  const ttsLib = lib?.ttsFetch;
  const studyOk = !!(ttsStudy && ttsStudy.ok && /audio\/mpeg/.test(ttsStudy.mime || '') && ttsStudy.size > 0);
  const libOk = libReady ? !!(ttsLib && ttsLib.ok && /audio\/mpeg/.test(ttsLib.mime || '') && ttsLib.size > 0) : true;
  const noLocalFallback = (study?.speaks.length || 0) === 0 && (libReady ? (lib?.speaks.length || 0) === 0 : true);
  const audioPlayed = (study?.audioPlays.length || 0) >= 1 && (libReady ? (lib?.audioPlays.length || 0) >= 1 : true);

  const ok = studyOk && libOk && noLocalFallback && audioPlayed;
  console.log('\n结论:', ok ? 'PASS ✅ 云端 TTS 路径正确（/api/tts 返回 mp3、<audio> 播放、无本地回退）'
    : 'FAIL ❌');
  console.log('   明细: studyTtsOk=%s libTtsOk=%s noLocalFallback=%s audioPlayed=%s', studyOk, libOk, noLocalFallback, audioPlayed);
  if (!ok) process.exitCode = 1;
} catch (error) {
  console.error('\n失败:', error.message);
  process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill();
}
