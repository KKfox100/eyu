/**
 * 临时诊断：词库页「朗读」按下态是否串台（针对**已学**卡片——历史 bug 就在这）。
 * 1) 注册，造 2 张已学卡（queue + review）
 * 2) /library 展开已学卡1 → 点朗读
 * 3) 展开已学卡2 → 它的按钮应是「朗读」而不是「朗读中…」
 */
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9342;
const BASE = process.env.BASE || 'https://eyu.letsgo.cc.cd';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--no-first-run',
  '--window-size=420,1000', `--user-data-dir=C:/temp/cdp-ui-${Date.now()}`, 'about:blank',
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
const SNAP = `(() => {
  const btns = [...document.querySelectorAll('button')].filter(b => (b.textContent||'').includes('朗读'));
  return btns.map(b => ({ text: (b.textContent||'').trim(), disabled: b.disabled }));
})()`;

try {
  await send('Page.enable');
  await send('Runtime.enable');

  console.log('1) 注册 + 造 2 张已学卡');
  await send('Page.navigate', { url: `${BASE}/login` });
  await sleep(1000);
  const email = `learn${Date.now()}@eyu.app`;
  const setup = await evaluate(`(async () => {
    const r = await fetch('${BASE}/api/auth/register', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email:'${email}', password:'eyu12345' }) });
    const j = await r.json();
    if (!j.ok) return 'FAIL-reg';
    const token = j.data.token;
    localStorage.setItem('eyu.token', token);
    const q = await (await fetch('${BASE}/api/study/queue?limit=2', { headers:{ Authorization:'Bearer '+token } })).json();
    const queue = (q.data && q.data.queue) || [];
    for (const c of queue) {
      await fetch('${BASE}/api/study/review', { method:'POST', headers:{ 'content-type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify({ userCardId: c.userCardId, rating: 3 }) });
    }
    const cards = await (await fetch('${BASE}/api/study/cards?page=1&pageSize=5', { headers:{ Authorization:'Bearer '+token } })).json();
    return JSON.stringify(((cards.data && cards.data.items) || []).map(x => ({ cardId: x.cardId, uc: !!x.userCardId })));
  })()`);
  console.log('   已学卡列表:', setup);

  console.log('2) 进词库，展开已学卡1，点朗读');
  await send('Page.navigate', { url: `${BASE}/library` });
  await waitFor(`(document.body?.innerText||'').includes('共 340')`, 15000, '词库渲染');
  await sleep(400);
  await evaluate(`(() => { const el = document.querySelector('ul li button'); el && el.click(); })()`); // expand card1
  await waitFor(`(document.body?.innerText||'').includes('朗读')`, 8000, '出现朗读');
  await evaluate(`(() => { const el = [...document.querySelectorAll('button')].find(n => (n.textContent||'').trim()==='朗读' && n.offsetParent!==null); el && el.click(); })()`);
  await sleep(500);
  console.log('   卡1点朗读后:', JSON.stringify(await evaluate(SNAP)));

  console.log('3) 折叠卡1，展开已学卡2');
  await evaluate(`(() => { const el = document.querySelector('ul li button'); el && el.click(); })()`); // collapse 1
  await sleep(300);
  await evaluate(`(() => { const els = document.querySelectorAll('ul li button'); els[1] && els[1].click(); })()`); // expand 2
  await sleep(600);
  const snap2 = await evaluate(SNAP);
  console.log('   卡2展开后按钮:', JSON.stringify(snap2));

  const buggy = Array.isArray(snap2) && snap2.some((b) => b.text.includes('朗读中') || b.disabled);
  console.log('\n结论:', buggy ? 'FAIL ❌ 仍有卡片串台（显示朗读中/被禁用）' : 'PASS ✅ 只有被点的那张受影响，其他卡正常');
  if (buggy) process.exitCode = 1;
} catch (e) {
  console.error('失败:', e.message);
  process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill();
}
