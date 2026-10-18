/**
 * 截图：登录后抓「今日 / 词库（展开一张卡）/ 我的」三屏，用于目视检查莫兰迪配色。
 * 用法：node scripts/cdp-shot.mjs
 * 输出：shots/morandi-today.png / morandi-library.png / morandi-me.png
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9341;
const BASE = process.env.BASE || 'https://eyu.letsgo.cc.cd';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('shots', { recursive: true });

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--no-first-run',
  '--hide-scrollbars', '--window-size=430,932', `--user-data-dir=C:/temp/cdp-shot-${Date.now()}`, 'about:blank',
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

  console.log('1) 登录');
  await send('Page.navigate', { url: `${BASE}/login` });
  await sleep(1000);
  const email = `shot${Date.now()}@eyu.app`;
  const ok = await evaluate(`(async () => {
    const r = await fetch('${BASE}/api/auth/register', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email:'${email}', password:'eyu12345' }) });
    const j = await r.json();
    if (!j.ok) return 'FAIL';
    localStorage.setItem('eyu.token', j.data.token);
    return 'ok';
  })()`);
  if (ok !== 'ok') throw new Error('注册失败');

  console.log('2) 今日');
  await send('Page.navigate', { url: `${BASE}/` });
  await sleep(1800);
  await shot('morandi-today');

  console.log('3) 词库（展开一张）');
  await send('Page.navigate', { url: `${BASE}/library` });
  await waitFor(`(document.body?.innerText||'').includes('共 340')`, 15000, '词库渲染');
  await sleep(400);
  await evaluate(`(() => { const el = document.querySelector('ul li button'); el && el.click(); })()`);
  await sleep(600);
  await shot('morandi-library');

  console.log('4) 我的');
  await send('Page.navigate', { url: `${BASE}/me` });
  await sleep(1400);
  await shot('morandi-me');
  console.log('done');
} catch (e) {
  console.error('失败:', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill();
}
