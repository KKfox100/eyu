/**
 * CDP 冒烟：AI 剪藏全流程（示例文本 → 解析 → 勾选 → 导入）
 * 用法：node scripts/cdp-clip.mjs
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import WebSocket from 'ws';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const BASE = process.env.BASE || 'https://eyu.pages.dev';
const OUT = 'shots';
mkdirSync(OUT, { recursive: true });

const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--window-size=420,900',
    `--user-data-dir=C:/temp/cdp-clip-${Date.now()}`,
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
      /* chrome 还没起来 */
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
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || 'evaluate 失败');
  }
  return result.result.value;
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const file = `${OUT}/${name}.png`;
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log('  截图', file);
}

async function waitFor(expression, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expression)) return true;
    await sleep(400);
  }
  throw new Error(`等待超时：${label}`);
}

/** 按可见文字点按钮 */
const CLICK = (text) => `(() => {
  const el = [...document.querySelectorAll('button, a')].find(n => (n.textContent || '').includes(${JSON.stringify(text)}) && n.offsetParent !== null);
  if (!el) return false;
  el.click();
  return true;
})()`;

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Network.enable');

  console.log('1) 注册新账号');
  await send('Page.navigate', { url: `${BASE}/login` });
  await sleep(1500);
  const email = `cdp${Date.now()}@eyu.app`;
  const reg = await evaluate(`(async () => {
    const r = await fetch('${BASE}/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: '${email}', password: 'eyu12345' }),
    });
    const j = await r.json();
    if (!j.ok) return 'FAIL ' + JSON.stringify(j.error);
    localStorage.setItem('eyu.token', j.data.token);
    return 'ok';
  })()`);
  console.log('  ', reg, email);
  if (reg !== 'ok') throw new Error('注册失败');

  console.log('2) 打开剪藏页');
  await send('Page.navigate', { url: `${BASE}/clip` });
  await sleep(1800);
  const hasTextarea = await evaluate(`!!document.querySelector('textarea')`);
  console.log('   输入框存在:', hasTextarea);
  if (!hasTextarea) throw new Error('剪藏页没渲染出来');

  console.log('3) 填示例文本');
  console.log('   点「用示例试试」:', await evaluate(CLICK('用示例试试')));
  await sleep(400);
  const chars = await evaluate(`document.querySelector('textarea').value.length`);
  console.log('   字数:', chars);
  await shot('clip-1-input');

  console.log('4) 开始解析（等最多 90s）');
  console.log('   点「拆成卡片」:', await evaluate(CLICK('拆成卡片')));
  await sleep(1200);
  await shot('clip-2-loading');

  const ok = await evaluate(`(async () => {
    const start = Date.now();
    while (Date.now() - start < 90000) {
      const body = document.body.innerText;
      if (body.includes('挑出')) return 'cards';
      if (body.includes('失败') || body.includes('不支持') || body.includes('至少')) return 'error:' + body.slice(0, 200);
      await new Promise(r => setTimeout(r, 500));
    }
    return 'timeout';
  })()`);
  console.log('   结果:', ok);
  if (ok !== 'cards') throw new Error('解析没出卡：' + ok);

  const summary = await evaluate(`(() => {
    const el = [...document.querySelectorAll('p')].find(n => n.textContent.includes('挑出'));
    return el ? el.textContent.trim() : '';
  })()`);
  console.log('  ', summary);
  await shot('clip-3-cards');

  console.log('5) 导入');
  const importLabel = await evaluate(`(() => {
    const el = [...document.querySelectorAll('button')].find(n => n.textContent.includes('导入选中的'));
    return el ? el.textContent.trim() : '';
  })()`);
  console.log('   按钮:', importLabel);
  console.log('   点击:', await evaluate(CLICK('导入选中的')));
  await waitFor(`document.body.innerText.includes('已导入')`, 30000, '导入成功');
  const doneText = await evaluate(`(() => {
    const el = [...document.querySelectorAll('p')].find(n => n.textContent.includes('已导入'));
    return el ? el.parentElement.innerText.replace(/\\n+/g, ' | ') : '';
  })()`);
  console.log('  ', doneText);
  await shot('clip-4-done');

  console.log('6) 去词库确认卡片已入库');
  await evaluate(CLICK('去词库看看'));
  await sleep(2000);
  const lib = await evaluate(`(() => {
    const body = document.body.innerText;
    const m = body.match(/共 (\\d+) 张卡片/);
    return m ? m[1] : 'n/a';
  })()`);
  console.log('   词库卡片数:', lib);
  await shot('clip-5-library');

  console.log('\n全部通过');
} catch (error) {
  console.error('\n失败:', error.message);
  await shot('clip-error').catch(() => {});
  process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill();
}
