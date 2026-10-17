#!/usr/bin/env node
/**
 * e语 · Cloudflare 一键初始化脚本
 *
 * 做四件事：
 *   1. 创建 D1 数据库 eyu-db，并把 database_id 回填到 worker/wrangler.toml
 *   2. 创建 KV 命名空间 SESSIONS，回填 id / preview_id
 *   3. 导入 schema.sql + seed.sql（远程）
 *   4. 生成随机 JWT_SECRET 并写入 Worker 机密
 *
 * 用法（需先 `npx wrangler login` 或设置 CLOUDFLARE_API_TOKEN）：
 *   node scripts/setup-cloudflare.mjs
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = join(root, 'worker');
const tomlPath = join(workerDir, 'wrangler.toml');

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: workerDir, encoding: 'utf8', stdio: 'pipe', ...opts });
}

function step(n, msg) {
  console.log(`\n${c.bold(`[${n}/4]`)} ${msg}`);
}

function fail(msg, hint) {
  console.error(`${c.red('✗')} ${msg}`);
  if (hint) console.error(c.dim(hint));
  process.exit(1);
}

console.log(c.bold('\n e语 · Cloudflare 初始化\n'));

// 0. 校验登录态
try {
  const who = run('npx wrangler whoami');
  if (/You are not authenticated|Not logged in/i.test(who)) throw new Error('not logged in');
  console.log(c.green('✓') + ' 已登录 Cloudflare');
} catch (error) {
  fail(
    '未登录 Cloudflare，或登录已过期',
    '请先执行：npx wrangler login\n' +
      '若所在网络无法访问 dash.cloudflare.com，请改用 API Token：\n' +
      '  export CLOUDFLARE_API_TOKEN=xxxx   （Windows: set CLOUDFLARE_API_TOKEN=xxxx）'
  );
}

let toml = readFileSync(tomlPath, 'utf8');

// 1. D1
step(1, '创建 D1 数据库 eyu-db');
if (!toml.includes('database_id   = "00000000-0000-0000-0000-000000000000"')) {
  console.log(c.dim('  wrangler.toml 中已有 database_id，跳过创建'));
} else {
  let out = '';
  try {
    out = run('npx wrangler d1 create eyu-db');
  } catch (error) {
    out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (!/already exists|code: 7404|10000/i.test(out)) {
      fail('创建 D1 失败', out.slice(-800));
    }
    fail(
      'D1 数据库 eyu-db 已存在，但 wrangler.toml 里还是占位 ID',
      '请执行 npx wrangler d1 list 找到 database_id，手工填入 worker/wrangler.toml 后重新运行本脚本'
    );
  }
  const id = out.match(/database_id\s*=\s*"([0-9a-f-]{36})"/i)?.[1];
  if (!id) fail('无法从 wrangler 输出中解析 database_id', out.slice(-800));
  toml = toml.replace('00000000-0000-0000-0000-000000000000', id);
  console.log(`${c.green('✓')} database_id = ${id}`);
}

// 2. KV
step(2, '创建 KV 命名空间 SESSIONS');
if (!toml.includes('id         = "00000000000000000000000000000000"')) {
  console.log(c.dim('  wrangler.toml 中已有 KV id，跳过创建'));
} else {
  let out = '';
  try {
    out = run('npx wrangler kv namespace create SESSIONS');
  } catch (error) {
    out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    fail('创建 KV 失败', out.slice(-800));
  }
  const id = out.match(/id\s*=\s*"([0-9a-f]{32})"/i)?.[1];
  if (!id) fail('无法解析 KV namespace id', out.slice(-800));
  toml = toml.replace(/"00000000000000000000000000000000"/g, `"${id}"`);
  console.log(`${c.green('✓')} KV id = ${id}`);
}

writeFileSync(tomlPath, toml);

// 3. 初始化表结构与种子数据
step(3, '导入表结构与种子词库');
for (const file of ['schema.sql', 'seed.sql']) {
  process.stdout.write(c.dim(`  ${file} … `));
  run(`npx wrangler d1 execute eyu-db --remote --file=./${file}`);
  console.log(c.green('ok'));
}

// 4. JWT 机密
step(4, '写入 JWT_SECRET');
const secret = randomBytes(48).toString('base64url');
try {
  run('npx wrangler secret put JWT_SECRET', { input: `${secret}\n` });
  console.log(c.green('✓') + ' JWT_SECRET 已写入（48 字节随机值）');
} catch (error) {
  console.log(c.yellow('!') + ' 写入失败，请手动执行：npx wrangler secret put JWT_SECRET');
  console.log(c.dim(`  建议值：${secret}`));
}

console.log(c.bold(c.green('\n✓ 初始化完成\n')));
console.log('下一步：');
console.log('  1) 部署 API      ' + c.dim('npm run deploy:api'));
console.log('  2) 记录 API 域名 ' + c.dim('（部署输出里的 https://eyu-api.<subdomain>.workers.dev）'));
console.log('  3) 构建前端      ' + c.dim('VITE_API_BASE=<API域名> npm run build'));
console.log('  4) 部署前端      ' + c.dim('npm run deploy:web'));
