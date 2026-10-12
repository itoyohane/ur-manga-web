import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoverHandler } from '../api/cover.mjs';
import { importCover } from '../dist/cover.mjs';

const source = 'https://lain.bgm.tv/pic/cover/l/ab/cd/test.jpg';
const request = (url = source, method = 'GET') => new Request(`https://manga.example/api/cover?url=${encodeURIComponent(url)}`, { method });

test('the same-origin route imports a Bangumi image for export with safe cache headers', async () => {
  let calls = 0;
  const handler = createCoverHandler({ fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, source);
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Cookie, undefined);
    assert.equal(options.headers.Authorization, undefined);
    return new Response('cover bytes', { headers: { 'Content-Type': 'image/jpeg' } });
  } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('content-length'), '11');
  assert.match(response.headers.get('vercel-cdn-cache-control'), /s-maxage=604800/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await response.text(), 'cover bytes');
  const result = await importCover(source, async blob => {
    assert.equal(blob.type, 'image/jpeg');
    assert.equal(await blob.text(), 'cover bytes');
    return 'data:image/jpeg;base64,ready';
  }, { fetchImpl: address => {
    assert.equal(address, `/api/cover?url=${encodeURIComponent(source)}`);
    return handler(new Request(new URL(address, 'https://manga.example')));
  } });
  assert.equal(result, 'data:image/jpeg;base64,ready');
  assert.equal(calls, 2);
});

test('rejects unrelated hosts, protocols, credentials, ports and non-cover paths without fetching', async () => {
  const handler = createCoverHandler({ fetchImpl: () => assert.fail('Unsafe input must never reach the network') });
  for (const url of [
    '', 'http://lain.bgm.tv/pic/cover/l/test.jpg', 'https://127.0.0.1/test.jpg',
    'https://lain.bgm.tv.evil.example/pic/cover/l/test.jpg',
    'https://lain.bgm.tv@evil.example/pic/cover/l/test.jpg',
    'https://user:pass@lain.bgm.tv/pic/cover/l/test.jpg',
    'https://lain.bgm.tv:8080/pic/cover/l/test.jpg',
    'https://lain.bgm.tv/pic/user/l/test.jpg',
    'https://lain.bgm.tv/pic/cover/l/test.svg', `${source}?redirect=https://localhost`,
  ]) {
    const response = await handler(request(url));
    assert.equal(response.status, 400, url);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const response = await handler(request(source, 'POST'));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});

test('handles CDN errors, redirects, invalid MIME, empty images and advertised oversize bodies', async () => {
  for (const [status, upstream] of [
    [502, new Response('missing', { status: 404 })],
    [502, new Response(null, { status: 302, headers: { Location: 'https://localhost' } })],
    [502, new Response('<html>', { headers: { 'Content-Type': 'text/html' } })],
    [502, new Response(null, { headers: { 'Content-Type': 'image/jpeg' } })],
    [502, new Response('', { headers: { 'Content-Type': 'image/jpeg' } })],
    [413, new Response('too big', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(4 * 1024 * 1024 + 1) } })],
  ]) {
    const response = await createCoverHandler({ fetchImpl: async () => upstream })(request());
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const response = await createCoverHandler({ fetchImpl: async () => { throw new TypeError('network failure'); } })(request());
  assert.equal(response.status, 502);
});

test('caps streamed bytes even when the source omits content length and cancels the body', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
    cancel() { cancelled = true; },
  });
  const handler = createCoverHandler({ fetchImpl: async () => new Response(body, { headers: { 'Content-Type': 'image/png' } }) });
  assert.equal((await handler(request())).status, 413);
  assert.equal(cancelled, true);
});

test('aborts stalled upstream requests after eight seconds', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const handler = createCoverHandler({ fetchImpl: (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) });
  const pending = handler(request());
  t.mock.timers.tick(8000);
  assert.equal((await pending).status, 504);
});
