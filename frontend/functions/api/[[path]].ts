/**
 * Pages Functions · 同源反向代理
 *
 * 为什么需要它：
 *   国内网络对 *.workers.dev 普遍存在 DNS 污染 / 连接超时，而 *.pages.dev 通常可直连。
 *   把 /api/* 通过 Pages 自身的边缘函数转发到 Worker，浏览器只访问 pages.dev 一个域，
 *   顺带把跨域（CORS）问题也彻底消掉。
 *
 * 路由：/api/health → https://eyu-api.<sub>.workers.dev/api/health
 */

interface Env {
  /** 目标 Worker 源站，可在 Pages 项目的环境变量里覆盖 */
  API_ORIGIN?: string;
}

const DEFAULT_ORIGIN = 'https://eyu-api.2412.workers.dev';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = env.API_ORIGIN || DEFAULT_ORIGIN;
  const target = new URL(url.pathname + url.search, origin);

  const headers = new Headers(request.headers);
  // 这些头由边缘自行管理，转发会引发签名/来源校验问题
  headers.delete('host');
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ipcountry');
  headers.delete('cf-ray');
  headers.delete('cf-visitor');
  headers.delete('x-forwarded-proto');
  headers.delete('x-real-ip');

  const method = request.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);

  const upstream = new Request(target.toString(), {
    method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
    // @ts-expect-error Cloudflare 专有字段，Node 类型里没有
    duplex: hasBody ? 'half' : undefined,
  });

  try {
    const response = await fetch(upstream);
    const out = new Headers(response.headers);
    // 同源请求不需要 CORS 头，避免重复
    out.delete('access-control-allow-origin');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: out,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'upstream_unreachable',
          message: `API 代理失败：${(error as Error).message}`,
        },
      }),
      { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' } }
    );
  }
};
