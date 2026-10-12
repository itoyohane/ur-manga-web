const MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function coverUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'lain.bgm.tv' || url.port || url.username || url.password || url.search || url.hash) return null;
    if (!/^\/(?:r\/\d+\/)?pic\/cover\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

function failure(status, message, headers = {}) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function createCoverHandler({ fetchImpl = globalThis.fetch } = {}) {
  return async request => {
    if (request.method !== 'GET') return failure(405, '只支持 GET 请求。', { Allow: 'GET' });
    const url = coverUrl(new URL(request.url).searchParams.get('url'));
    if (!url) return failure(400, '仅支持 Bangumi 封面地址。');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let upstream;
    let reader;
    try {
      upstream = await fetchImpl(url, {
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
        headers: { Accept: 'image/jpeg, image/png, image/webp' },
      });
      if (!upstream.ok) return failure(502, '暂时无法获取 Bangumi 封面。');
      const type = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (!IMAGE_TYPES.has(type)) return failure(502, '图片源未返回支持的封面格式。');
      if (Number(upstream.headers.get('content-length')) > MAX_BYTES) return failure(413, '在线封面超过 4 MB。');
      if (!upstream.body) return failure(502, '封面内容为空。');
      reader = upstream.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) return failure(413, '在线封面超过 4 MB。');
        chunks.push(value);
      }
      if (!size) return failure(502, '封面内容为空。');
      return new Response(new Blob(chunks, { type }), { headers: {
        'Content-Type': type,
        'Content-Length': String(size),
        'Cache-Control': 'public, max-age=86400',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=604800',
        'X-Content-Type-Options': 'nosniff',
      } });
    } catch {
      return failure(controller.signal.aborted ? 504 : 502, '封面读取失败，请稍后重试。');
    } finally {
      clearTimeout(timeout);
      // Also stop bodies rejected by MIME/size checks; never follow an upstream redirect.
      controller.abort();
      if (reader) await reader.cancel().catch(() => {});
      if (upstream?.body && !upstream.body.locked) await upstream.body.cancel().catch(() => {});
    }
  };
}

const handler = createCoverHandler();
export default { fetch: request => handler(request) };
