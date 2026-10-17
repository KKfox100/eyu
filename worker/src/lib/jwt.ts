/**
 * 极简 JWT (HS256) 实现 —— 只依赖 WebCrypto，可在 Workers / 浏览器双端运行。
 * 不引入 jsonwebtoken（Node 专用，Workers 不可用）。
 */

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function encodeJson(obj: unknown): string {
  return base64UrlEncode(encoder.encode(JSON.stringify(obj)));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export interface SignOptions {
  sub: string;
  email: string;
  jti: string;
  issuer: string;
  ttlSeconds: number;
  now?: number;
}

export async function signJwt(secret: string, opts: SignOptions): Promise<string> {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: opts.sub,
    email: opts.email,
    jti: opts.jti,
    iss: opts.issuer,
    iat,
    exp: iat + opts.ttlSeconds,
  };
  const signingInput = `${encodeJson(header)}.${encodeJson(payload)}`;
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
}

export interface VerifyResult {
  valid: boolean;
  payload?: {
    sub: string;
    email: string;
    jti: string;
    iss: string;
    iat: number;
    exp: number;
  };
  reason?: 'malformed' | 'bad_signature' | 'expired' | 'bad_issuer';
}

export async function verifyJwt(
  secret: string,
  token: string,
  expectedIssuer: string,
  now: number = Date.now()
): Promise<VerifyResult> {
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };

  const [headerB64, payloadB64, sigB64] = parts;
  let payload: VerifyResult['payload'];
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!payload || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
    return { valid: false, reason: 'malformed' };
  }

  const key = await importKey(secret);
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(sigB64),
    encoder.encode(`${headerB64}.${payloadB64}`)
  );
  if (!ok) return { valid: false, reason: 'bad_signature' };

  if (payload.exp * 1000 <= now) return { valid: false, reason: 'expired' };
  if (payload.iss !== expectedIssuer) return { valid: false, reason: 'bad_issuer' };

  return { valid: true, payload };
}
