import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import cover from './api/cover.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'dist');
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

// Shared by the local HTTP server and tests; uses the same cover handler as Vercel.
export async function handleRequest(request, { coverHandler = cover.fetch } = {}) {
  const url = new URL(request.url);
  if (url.pathname === '/api/cover') return coverHandler(request);
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  try {
    const pathname = decodeURIComponent(url.pathname);
    const candidate = resolve(root, `.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`);
    if (!candidate.startsWith(root + sep)) return new Response('Not found', { status: 404 });
    const filename = await realpath(candidate);
    if (!filename.startsWith(root + sep)) return new Response('Not found', { status: 404 });
    const bytes = await readFile(filename);
    return new Response(request.method === 'HEAD' ? null : bytes, { headers: {
      'Content-Type': types[extname(filename)] || 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    return new Response('Not found', { status: error instanceof URIError ? 400 : 404 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 8000);
  const server = createServer(async (request, response) => {
    try {
      const result = await handleRequest(new Request(new URL(request.url, 'http://localhost'), { method: request.method }));
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('本地服务请求失败，请重试。');
    }
  });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。请先在旧服务终端按 Ctrl+C，再运行 node dev.mjs。` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`漫画私藏：http://localhost:${port}/（页面与封面接口已启动）`));
}
