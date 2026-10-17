/**
 * 密码哈希 —— PBKDF2-SHA256（WebCrypto 原生，Workers 可用）
 * 存储格式： pbkdf2$sha256$<iterations>$<salt_b64url>$<hash_b64url>
 *
 * 迭代次数写在哈希串里，因此日后调高迭代数不会让老用户无法登录。
 * ⚠️ Workers 免费计划 CPU 上限 10ms，迭代数过高可能触发 1102。
 *    默认 100000，如遇超限可把 PBKDF2_ITERATIONS 降到 50000。
 */

import { base64UrlDecode, base64UrlEncode } from './jwt';

const encoder = new TextEncoder();
const DEFAULT_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bit
const SALT_LENGTH = 16;

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_LENGTH * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(
  password: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$sha256$${iterations}$${base64UrlEncode(salt)}$${base64UrlEncode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;

  const iterations = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const salt = base64UrlDecode(parts[3]);
  const expected = base64UrlDecode(parts[4]);
  const actual = await derive(password, salt, iterations);

  if (actual.length !== expected.length) return false;
  // 常量时间比较，避免时序侧信道
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
