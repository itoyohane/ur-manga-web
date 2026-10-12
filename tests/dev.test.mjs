import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../dev.mjs';
import { createCoverHandler } from '../api/cover.mjs';
import { importCover } from '../dist/cover.mjs';

const request = (path, method = 'GET') => new Request(`http://localhost:8000${path}`, { method });

test('local development serves the app and its modules with correct MIME types', async () => {
  const home = await handleRequest(request('/'));
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.match(await home.text(), /id="poster"/);
  for (const [path, type] of [['/app.mjs', 'text/javascript'], ['/cover.mjs', 'text/javascript'], ['/style.css', 'text/css']]) {
    const response = await handleRequest(request(path));
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-type').startsWith(type));
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const head = await handleRequest(request('/', 'HEAD'));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.ok(Number(head.headers.get('content-length')) > 0);
});

test('local routing connects a selected cover to the actual API handler for export', async () => {
  const source = 'https://lain.bgm.tv/pic/cover/l/ab/cd/test.jpg';
  const coverHandler = createCoverHandler({ fetchImpl: async address => {
    assert.equal(address, source);
    return new Response('test image bytes', { headers: { 'Content-Type': 'image/jpeg' } });
  } });
  const data = await importCover(source, async blob => {
    assert.equal(await blob.text(), 'test image bytes');
    return 'data:image/jpeg;base64,ready';
  }, { fetchImpl: address => handleRequest(request(address), { coverHandler }) });
  assert.equal(data, 'data:image/jpeg;base64,ready');
  assert.equal((await handleRequest(request('/api/cover'))).status, 400, 'API routes must not fall through to static file serving');
});

test('local development does not expose repository files or unsupported methods', async () => {
  for (const path of ['/README.md', '/.git/config', '/api/cover.mjs', '/..%2fREADME.md', '/%ZZ', '/missing.mjs']) {
    const response = await handleRequest(request(path));
    assert.ok([400, 404].includes(response.status), path);
  }
  const response = await handleRequest(request('/', 'POST'));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
