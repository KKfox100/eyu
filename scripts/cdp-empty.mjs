/**
 * 截图：学习页「空队列」提示。
 *
 * 造一个「今日新词额度已用完」的账号：注册 → 拉队列 → 把 20 张卡全部按「熟知」评掉
 * （全部进入 review 状态，今天不再到期）→ 再进 /study 就落到空队列页。
 *
 * 用法：node scripts/cdp-empty.mjs
 * 输出：shots/empty-quota.png
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9342;
const BASE = process.env.BASE || 'https://eyu.letsgo.cc.cd';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('shots', { recursive: true });

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--no-first-run',
  '--hide-scrollbars', '--window-size=430,932', `--user-data-dir=C:/temp/cdp-empty-${Date.now()}`, 'about:blank',
], { stdio: 'ignore' });

async function getTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* wait */ }
    await sleep(250);
  }
  throw new Error('Chrome 没起来');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });

let id = 0;
const pending = new Map();
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
  }
});
function send(method, params = {}) {
  const mid = ++id;
  return new Promise((resolve, reject) => { pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params })); });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate 失败');
  return r.result.value;
}
const waitFor = async (expr, timeoutMs, label) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { if (await evaluate(expr)) return true; await sleep(300); }
  throw new Error(`等待超时：${label}`);
};
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(`shots/${name}.png`, Buffer.from(r.data, 'base64'));
  console.log('   saved shots/' + name + '.png');
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });

  console.log('1) 注册并学完今日 20 张新卡');
  await send('Page.navigate', { url: `${BASE}/login` });
  await sleep(900);
  const email = `empty${Date.now()}@eyu.app`;
  const setup = await evaluate(`(async () => {
    const reg = await fetch('${BASE}/api/auth/register', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email:'${email}', password:'eyu12345' }) });
    const j = await reg.json();
    if (!j.ok) return 'register failed: ' + JSON.stringify(j.error);
    const token = j.data.token;
    localStorage.setItem('eyu.token', token);
    const H = { 'content-type': 'application/json', authorization: 'Bearer ' + token };

    // 第一轮：拉队列 + 全部学掉（学完再拉，防止还有没发放的）
    let learned = 0;
    for (let round = 0; round < 4; round += 1) {
      const q = await (await fetch('${BASE}/api/study/queue?limit=30', { headers: H })).json();
      const cards = q.data.queue;
      if (!cards.length) break;
      for (const c of cards) {
        await fetch('${BASE}/api/study/review', { method:'POST', headers: H, body: JSON.stringify({ userCardId: c.userCardId, rating: 3, mode: 'recall', elapsedMs: 800 }) });
        learned += 1;
      }
    }
    const last = await (await fetch('${BASE}/api/study/queue?limit=30', { headers: H })).json();
    return JSON.stringify({ learned, summary: last.data.summary, queueLen: last.data.queue.length });
  })()`);
  console.log('   ' + setup);

  console.log('2) 打开学习页，等待空队列文案');
  await send('Page.navigate', { url: `${BASE}/study` });
  const ok = await waitFor(`(document.body?.innerText||'').includes('暂时没有待学卡片')`, 20000, '空队列文案');
  const text = await evaluate(`(document.body?.innerText||'').replace(/\\n+/g,' | ')`);
  console.log('   页面文案：' + text);
  await sleep(500);
  await shot('empty-quota');

  // ---- 场景 B：打开队列但一张没学就退出，回来必须还能看到卡 ----
  console.log('3) 待学场景：拉了队列但没学，重进学习页');
  const email2 = `pending${Date.now()}@eyu.app`;
  const pendingInfo = await evaluate(`(async () => {
    const reg = await fetch('${BASE}/api/auth/register', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email:'${email2}', password:'eyu12345' }) });
    const j = await reg.json();
    if (!j.ok) return 'register failed';
    const token = j.data.token;
    localStorage.setItem('eyu.token', token);
    const H = { authorization: 'Bearer ' + token };
    const q1 = await (await fetch('${BASE}/api/study/queue?limit=30', { headers: H })).json();
    const q2 = await (await fetch('${BASE}/api/study/queue?limit=30', { headers: H })).json();
    return JSON.stringify({ first: q1.data.queue.length, second: q2.data.queue.length, pending: q2.data.summary.pendingInQueue });
  })()`);
  console.log('   ' + pendingInfo);

  await send('Page.navigate', { url: `${BASE}/study` });
  await waitFor(`(document.body?.innerText||'').includes('/20')`, 20000, '待学队列渲染');
  const text2 = await evaluate(`(document.querySelector('header')?.innerText||'').replace(/\\n+/g,' ')`);
  console.log('   进度显示：' + text2);
  await sleep(500);
  await shot('pending-queue');

  console.log('done');
} catch (e) {
  console.error('失败:', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill();
}
