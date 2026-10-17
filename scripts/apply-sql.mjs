#!/usr/bin/env node
/**
 * 按顺序把 SQL 文件应用到 D1
 *
 *   node scripts/apply-sql.mjs --local      # 本地模拟库
 *   node scripts/apply-sql.mjs --remote     # 线上库（需已登录 / 有 API Token）
 *
 * 所有文件都是幂等的（CREATE ... IF NOT EXISTS / INSERT OR IGNORE），
 * 重复执行不会产生重复数据。
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = join(root, 'worker');

const FILES = [
  'schema.sql',
  'seed.sql',
  'seeds/words-2.sql',
  'seeds/words-3.sql',
  'seeds/chunks-2.sql',
  'seeds/grammar-2.sql',
  'migrations/001-bump-daily-new-limit.sql',
];

const target = process.argv.includes('--local') ? '--local' : '--remote';
/** 直接用 node 跑 wrangler 的入口，避免 Windows 上 .cmd 需要 shell 的问题 */
const WRANGLER_BIN = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/** 同步等待（不 spawn 子进程） */
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

let failed = 0;

for (const file of FILES) {
  const abs = join(workerDir, file);
  if (!existsSync(abs)) {
    console.log(`- ${file} 不存在，跳过`);
    continue;
  }

  let ok = false;
  for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
    try {
      execFileSync(
        process.execPath,
        [WRANGLER_BIN, 'd1', 'execute', 'eyu-db', target, `--file=./${file}`],
        { cwd: workerDir, stdio: 'pipe', encoding: 'utf8' }
      );
      ok = true;
    } catch (error) {
      const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      if (attempt === 3) {
        failed += 1;
        console.error(`✗ ${file}`);
        console.error(output.trim().split('\n').slice(-6).join('\n'));
      } else {
        console.log(`  ${file} 第 ${attempt} 次失败，重试…`);
        sleep(3000);
      }
    }
  }

  if (ok) console.log(`✓ ${file}`);
}

console.log(failed === 0 ? '\n全部应用完成' : `\n${failed} 个文件失败`);
process.exit(failed === 0 ? 0 : 1);
