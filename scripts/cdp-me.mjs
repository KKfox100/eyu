/**
 * CDP 冒烟：提醒设置（开关 → 非法域名被拒 → 合法地址保存成功 → 落库确认）
 * 用法：node scripts/cdp-me.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9334;
const BASE = process.env.BASE || 'https://eyu.letsgo.cc.cd';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--window-size=420,1000',
    `--user-data-dir=C:/temp/cdp-me-${Date.now()}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {
      /* 等 chrome */
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

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('  截图', `${OUT}/${name}.png`);
}

async function waitFor(expression, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expression)) return true;
    await sleep(300);
  }
  throw new Error(`等待超时：${label}`);
}

const CLICK = (text) => `(() => {
  const el = [...document.querySelectorAll('button, a')].find(n => (n.textContent || '').includes(${JSON.stringify(text)}) && n.offsetParent !== null);
  if (!el) return false;
  el.click();
  return true;
})()`;

const SET_INPUT = (value) => `(() => {
  const el = document.querySelector('input[type="url"]');
  if (!el) return false;
  el.value = ${JSON.stringify(value)};
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`;

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });

  console.log('1) 注册新账号并进「我的」');
  await send('Page.navigate', { url: `${BASE}/login` });
  await sleep(1500);
  const email = `cdpm${Date.now()}@eyu.app`;
  const reg = await evaluate(`(async () => {
    const r = await fetch('${BASE}/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: '${email}', password: 'eyu12345' }),
    });
    const j = await r.json();
    if (!j.ok) return 'FAIL';
    localStorage.setItem('eyu.token', j.data.token);
    return 'ok';
  })()`);
  if (reg !== 'ok') throw new Error('注册失败');

  await send('Page.navigate', { url: `${BASE}/me` });
  await waitFor(`(document.body?.innerText || '').includes('每日提醒')`, 20000, '「我的」页渲染');
  console.log('   有「每日提醒」区块: true');
  await shot('me-1-default');

  console.log('2) 确保开关是打开的');
  // 库里 reminder_enabled 默认就是 1，所以不能无脑点，否则会把它关掉
  const state = await evaluate(`document.querySelector('[role="switch"]')?.getAttribute('aria-checked')`);
  console.log('   当前 aria-checked:', state);
  if (state !== 'true') {
    await evaluate(`document.querySelector('[role="switch"]').click()`);
    await sleep(400);
  }
  console.log('   现在 aria-checked:', await evaluate(`document.querySelector('[role="switch"]')?.getAttribute('aria-checked')`));
  console.log('   出现 webhook 输入框:', await evaluate(`!!document.querySelector('input[type="url"]')`));
  console.log('   未填时提示:', await evaluate(`(document.body?.innerText || '').includes('提醒发不出去')`));

  console.log('3) 先填个非法域名，应当被拒');
  console.log('   填值:', await evaluate(SET_INPUT('https://evil.example.com/hook')));
  await evaluate(CLICK('保存提醒设置'));
  await waitFor(`(document.body?.innerText || '').includes('只支持企业微信')`, 15000, '非法域名提示');
  console.log('   提示:', await evaluate(`(() => {
    const el = [...document.querySelectorAll('p')].find(n => n.textContent.includes('只支持企业微信'));
    return el ? el.textContent.trim() : '';
  })()`));
  await shot('me-2-invalid');

  console.log('4) 换成合法地址');
  await evaluate(SET_INPUT('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-only'));
  await evaluate(CLICK('保存提醒设置'));
  await waitFor(`(document.body?.innerText || '').includes('已保存')`, 15000, '保存成功提示');
  await shot('me-3-saved');

  console.log('5) 回读接口确认落库');
  const me = await evaluate(`(async () => {
    const r = await fetch('${BASE}/api/auth/me', { headers: { authorization: 'Bearer ' + localStorage.getItem('eyu.token') } });
    const j = await r.json();
    return JSON.stringify({ enabled: j.data.user.reminderEnabled, webhook: j.data.user.reminderWebhook });
  })()`);
  console.log('  ', me);

  console.log('\n全部通过');
} catch (error) {
  console.error('\n失败:', error.message);
  await shot('me-error').catch(() => {});
  process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill();
}
