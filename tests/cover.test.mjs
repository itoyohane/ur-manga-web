import test from 'node:test';
import assert from 'node:assert/strict';
import { coverSource, importCover, normalizeCoverUrl } from '../dist/cover.mjs';
import { normalizeState } from '../dist/model.mjs';

test('retains a remote display cover when browser import is blocked, including after reload', async () => {
  const pick = { title: '测试漫画', cover: '', coverUrl: 'https://lain.bgm.tv/pic/cover/l/test.jpg' };
  await assert.rejects(importCover(pick.coverUrl, () => assert.fail('A failed fetch must not reach Canvas'), {
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
  }), /Failed to fetch/);
  const restored = normalizeState({ picks: { long: pick } }).picks.long;
  assert.equal(restored.cover, '');
  assert.equal(coverSource(restored), pick.coverUrl);
});

test('a local upload takes precedence over the remote display URL', () => {
  const restored = normalizeState({ picks: { long: {
    title: '测试漫画', cover: 'data:image/jpeg;base64,abcd', coverUrl: 'https://lain.bgm.tv/cover.jpg',
  } } }).picks.long;
  assert.equal(coverSource(restored), 'data:image/jpeg;base64,abcd');
  assert.equal(restored.coverUrl, 'https://lain.bgm.tv/cover.jpg');
});

test('normalizes HTTP and protocol-relative URLs and rejects executable or credentialed sources', () => {
  assert.equal(normalizeCoverUrl('http://lain.bgm.tv/cover.jpg'), 'https://lain.bgm.tv/cover.jpg');
  assert.equal(normalizeCoverUrl('//s4.anilist.co/cover.jpg'), 'https://s4.anilist.co/cover.jpg');
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', '/cover.jpg', 'https://user:secret@example.com/image', null, {}]) {
    assert.equal(normalizeCoverUrl(value), '');
  }
});

test('imports readable covers for PNG export without sending credentials', async () => {
  const image = new Blob(['image bytes'], { type: 'image/jpeg' });
  const result = await importCover('http://lain.bgm.tv/cover.jpg', async blob => {
    assert.equal(blob, image);
    return 'data:image/jpeg;base64,abcd';
  }, { fetchImpl: async (url, options) => {
    assert.equal(url, `/api/cover?url=${encodeURIComponent('https://lain.bgm.tv/cover.jpg')}`);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    return { ok: true, blob: async () => image };
  } });
  assert.equal(result, 'data:image/jpeg;base64,abcd');
});

test('falls back to a readable source on static hosting and does not retry after cancellation', async () => {
  const source = 'https://lain.bgm.tv/pic/cover/l/test.jpg';
  const calls = [];
  await importCover(source, async () => 'ready', { fetchImpl: async address => {
    calls.push(address);
    return address.startsWith('/api/') ? { ok: false } : { ok: true, blob: async () => new Blob(['bytes'], { type: 'image/png' }) };
  } });
  assert.deepEqual(calls, [`/api/cover?url=${encodeURIComponent(source)}`, source]);
  const controller = new AbortController();
  let count = 0;
  await assert.rejects(importCover(source, () => assert.fail(), { signal: controller.signal, fetchImpl: async () => {
    count++;
    controller.abort();
    throw new Error('cancelled');
  } }), { name: 'AbortError' });
  assert.equal(count, 1);
});

test('rejects failed, non-image and oversized responses before decoding', async () => {
  for (const response of [
    { ok: false },
    { ok: true, blob: async () => new Blob(['<html>'], { type: 'text/html' }) },
    { ok: true, blob: async () => ({ type: 'image/png', size: 8 * 1024 * 1024 + 1 }) },
  ]) {
    await assert.rejects(importCover('https://lain.bgm.tv/cover.jpg', () => assert.fail('Invalid images must not be decoded'), {
      fetchImpl: async () => response,
    }));
  }
});
