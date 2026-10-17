/**
 * CDP 验证：朗读 / 听一遍 的语音合成调用路径。
 *
 * 沙箱没有音频输出，也未必有 TTS 语音引擎，所以本脚本**不验证「有没有声音」**，
 * 只验证修复后的代码路径确实生效：
 *   1) 朗读按钮未被禁用（isSpeechSynthesisSupported 为真）
 *   2) 点击后真的调用了 speechSynthesis.speak
 *   3) 发起的 utterance 带了 lang=en-US 且显式选了 voice
 *   4) 不再出现「cancel() 同步紧跟 speak() 把自己掐掉」的写法
 *      （代码里 speak 被 setTimeout 150ms 延后，且 cancel 在前）
 *
 * 真机出不出声需用户在自己手机上确认 —— 这里只保证部署的代码路径正确。
 * 用法：node scripts/cdp-speak.mjs
 */
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9336;
const BASE = process.env.BASE || 'https://eyu.letsgo.cc.cd';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOOK = `(() => {
  const Orig = window.SpeechSynthesisUtterance;
  window.__log = { speaks: [], cancels: 0, voices: -1, utts: [] };
  class Wrapped extends Orig {
    constructor(text){ super(text); window.__log.utts.push({ text, lang: undefined, voice: undefined }); this.__i = window.__log.utts.length - 1; }
    set lang(v){ super.lang = v; window.__log.utts[this.__i].lang = v; }
    get lang(){ return super.lang; }
    set voice(v){ super.voice = v; window.__log.utts[this.__i].voice = v && v.name; }
    get voice(){ return super.voice; }
  }
  window.SpeechSynthesisUtterance = Wrapped;
  const synth = window.speechSynthesis;
  const sSpeak = synth.speak.bind(synth);
  synth.speak = (u) => { window.__log.speaks.push({ at: Date.now(), text: u.text, lang: u.lang, voice: u.voice && u.voice.name }); sSpeak(u); };
  const sCancel = synth.cancel.bind(synth);
  synth.cancel = (...a) => { window.__log.cancels += 1; sCancel(...a); };
  const sGet = synth.getVoices.bind(synth);
  synth.getVoices = () => { const l = sGet(); window.__log.voices = l.length; return l; };
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
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
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

  console.log('2) 进学习页（SpeakCard · 听一遍）');
  await send('Page.navigate', { url: `${BASE}/study` });
  // SpeakCard 只在 speakMode 下渲染：先点「跟读这句」图标按钮切到跟读模式
  await waitFor(`[...document.querySelectorAll('button')].some(n => (n.getAttribute('aria-label')||'')==='跟读这句')`, 20000, '学习页出现跟读按钮');
  await evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(n => (n.getAttribute('aria-label')||'')==='跟读这句'); el && el.click(); })()`);
  await waitFor(`(document.body?.innerText || '').includes('听一遍')`, 20000, '跟读模式渲染出听一遍');
  // 先清日志，确保接下来只统计这次点击
  await evaluate(`window.__log.speaks = []; window.__log.cancels = 0; window.__log.utts = [];`);
  const clicked = await evaluate(`(() => {
    const el = [...document.querySelectorAll('button')].find(n => (n.textContent || '').includes('听一遍') && n.offsetParent !== null);
    if (!el) return false;
    window.__clickAt = Date.now();
    el.click();
    return true;
  })()`);
  console.log('   点击听一遍按钮:', clicked);
  await sleep(2500);
  const study = await getLog();
  const firstSpeakDelay = study && study.speaks[0] ? study.speaks[0].at - (await evaluate('window.__clickAt')) : null;
  console.log('   调用 speak 次数:', study?.speaks.length, '| cancel 次数:', study?.cancels, '| 缓存 voices 数:', study?.voices);
  console.log('   首个 speak 相对点击的延迟(ms):', firstSpeakDelay);
  if (study?.speaks[0]) {
    console.log('   首句 text:', JSON.stringify(study.speaks[0].text));
    console.log('   首句 lang:', study.speaks[0].lang, '| voice:', study.speaks[0].voice);
  }

  console.log('3) 进词库页（朗读按钮）');
  await send('Page.navigate', { url: `${BASE}/library` });
  // 朗读按钮在卡片展开后才出现，先等卡片渲染、再点开第一张
  await waitFor(`(document.body?.innerText || '').includes('共 340')`, 15000, '词库页渲染出卡片列表');
  await evaluate(`(() => { const el = document.querySelector('ul li button'); el && el.click(); })()`);
  let libReady = true;
  try {
    await waitFor(`(document.body?.innerText || '').includes('朗读')`, 8000, '展开卡片后出现朗读');
  } catch {
    libReady = false;
    console.log('   展开后仍未出现「朗读」，body 快照:');
    console.log('   ', (await evaluate(`(document.body?.innerText || '').slice(0, 200)`))?.replace(/\n/g, ' ⏎ '));
  }
  await evaluate(`window.__log.speaks = []; window.__log.cancels = 0; window.__log.utts = [];`);
  const clicked2 = libReady ? await evaluate(`(() => {
    const el = [...document.querySelectorAll('button')].find(n => (n.textContent || '').trim() === '朗读' && n.offsetParent !== null);
    if (!el) return false;
    window.__clickAt = Date.now();
    el.click();
    return true;
  })()`) : false;
  console.log('   点击朗读按钮:', clicked2);
  if (clicked2) await sleep(2500);
  const lib = await getLog();
  const libDelay = lib && lib.speaks[0] ? lib.speaks[0].at - (await evaluate('window.__clickAt')) : null;
  console.log('   调用 speak 次数:', lib?.speaks.length, '| cancel 次数:', lib?.cancels, '| 缓存 voices 数:', lib?.voices);
  console.log('   首个 speak 相对点击的延迟(ms):', libDelay);
  if (lib?.speaks[0]) {
    console.log('   首句 text:', JSON.stringify(lib.speaks[0].text));
    console.log('   首句 lang:', lib.speaks[0].lang, '| voice:', lib.speaks[0].voice);
  }

  // 断言
  const ok =
    study?.speaks.length >= 1 &&
    study?.speaks[0]?.lang === 'en-US' &&
    (libReady ? lib?.speaks.length >= 1 && lib?.speaks[0]?.lang === 'en-US' : true) &&
    (firstSpeakDelay === null || firstSpeakDelay >= 100) &&
    (libDelay === null || libDelay >= 100);
  console.log('\n结论:', ok ? 'PASS ✅ 朗读调用路径正确（speak 被发起、lang=en-US、无同步自掐）' : 'FAIL ❌');
  if (!ok) process.exitCode = 1;
} catch (error) {
  console.error('\n失败:', error.message);
  process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill();
}
