import test from 'node:test';
import assert from 'node:assert/strict';
import { createBangumiSearch } from '../dist/search.mjs';

const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const subject = (id, name, extra = {}) => ({ id, name, name_cn: '', images: {}, ...extra });

test('sends unchanged keywords to the subjects endpoint and preserves Bangumi matching and order', async () => {
  const queries = ['百合 雪子', 'GL　雪子画的百合漫画'];
  const calls = [];
  const search = createBangumiSearch({ fetch: async (url, options) => {
    const target = new URL(url);
    assert.equal(target.origin + target.pathname, 'https://api.bgm.tv/v0/search/subjects');
    assert.equal(target.searchParams.get('limit'), '24');
    assert.equal(target.searchParams.get('offset'), '0');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.credentials, 'omit');
    const body = JSON.parse(options.body);
    assert.deepEqual(body, { keyword: queries[calls.length], sort: 'match', filter: { type: [1], nsfw: false } });
    calls.push(body);
    return json({ data: [
      subject(8, '接口排在第一的作品'),
      subject(3, '同名作品', { platform: '小说' }),
      subject(9, '同名作品'),
    ] });
  } });
  for (const query of queries) {
    const { items } = await search.search(query);
    assert.deepEqual(items.map(item => item.id), ['bangumi:8', 'bangumi:3', 'bangumi:9']);
    assert.deepEqual(items.map(item => item.title), ['接口排在第一的作品', '同名作品', '同名作品']);
  }
  assert.equal(calls.length, 2, 'Exactly one request per uncached query, with no author or secondary-source searches');
});

test('adapts titles, authors and covers from the response without extra lookups', async () => {
  const search = createBangumiSearch({ fetch: async () => json({ data: [
    subject(1, 'ふたりべや', {
      name_cn: '双人间', images: { large: 'https://lain.bgm.tv/large.jpg', common: 'https://lain.bgm.tv/common.jpg' },
      infobox: [{ key: '作者', value: [{ v: '雪子' }] }],
    }),
    subject(2, '原名', { images: { common: 'https://lain.bgm.tv/common.jpg' } }),
  ] }) });
  const { items } = await search.search('双人间');
  assert.deepEqual(items[0], {
    id: 'bangumi:1', title: '双人间', subtitle: 'ふたりべや', author: '雪子',
    coverUrl: 'https://lain.bgm.tv/large.jpg', source: 'Bangumi',
  });
  assert.equal(items[1].title, '原名');
  assert.equal(items[1].coverUrl, 'https://lain.bgm.tv/common.jpg');
  assert.equal(items[1].author, '');
});

test('empty input makes no request and single-character queries use the API', async () => {
  let calls = 0;
  const search = createBangumiSearch({ fetch: async (url, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).keyword, '鱼');
    return json({ data: [] });
  } });
  assert.deepEqual(await search.search('　 '), { items: [] });
  assert.deepEqual(await search.search(' 鱼 '), { items: [] });
  assert.equal(calls, 1);
});

test('returns an empty result only when Bangumi returns an empty result', async () => {
  const search = createBangumiSearch({ fetch: async () => json({ data: [], total: 0 }) });
  assert.deepEqual(await search.search('没有这部作品'), { items: [] });
});

test('reports rate limits and service failures instead of returning fake empty matches', async () => {
  for (const status of [429, 503]) {
    let calls = 0;
    const search = createBangumiSearch({ fetch: async () => { calls++; return json({}, status); } });
    for (let attempt = 0; attempt < 2; attempt++) {
      await assert.rejects(search.search('双人间'), status === 429 ? /较频繁/ : /503/);
    }
    assert.equal(calls, 2, 'Failed responses must not be cached');
  }
});

test('rejects malformed response data and preserves network failures', async () => {
  for (const data of [{}, { data: null }, { data: {} }]) {
    const search = createBangumiSearch({ fetch: async () => json(data) });
    await assert.rejects(search.search('双人间'), /数据无法读取/);
  }
  const search = createBangumiSearch({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(search.search('双人间'), /Failed to fetch/);
});

test('caches identical queries for five minutes without merging different keywords', async () => {
  let time = 0, calls = 0;
  const search = createBangumiSearch({ now: () => time, fetch: async () => {
    calls++; return json({ data: [subject(calls, '双人间')] });
  } });
  await search.search('百合 雪子');
  await search.search('百合 雪子');
  assert.equal(calls, 1);
  await search.search('雪子 百合');
  assert.equal(calls, 2);
  time = 300001;
  await search.search('百合 雪子');
  assert.equal(calls, 3);
});

test('cancels an in-flight query and never caches the cancelled response', async () => {
  let calls = 0;
  const search = createBangumiSearch({ fetch: async (url, { signal }) => {
    calls++;
    if (calls > 1) return json({ data: [] });
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const controller = new AbortController();
  const pending = search.search('双人间', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
  await search.search('双人间');
  assert.equal(calls, 2);
});

test('an already-aborted signal rejects before requesting or returning cached data', async () => {
  const search = createBangumiSearch({ fetch: async () => json({ data: [] }) });
  await search.search('双人间');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(search.search('双人间', { signal: controller.signal }), error => error.name === 'AbortError');
});
