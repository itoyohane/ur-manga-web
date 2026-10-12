import test from 'node:test';
import assert from 'node:assert/strict';
import { createBangumiSearch } from '../dist/search.mjs';

const json = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const book = (id, name = `漫画${id}`, extra = {}) => ({ id, type: 1, name, name_cn: '', images: {}, tags: [], nsfw: false, ...extra });
const person = (id, name, career = ['mangaka']) => ({ id, name, career });
const relation = (id, staff = '作者', type = 1) => ({ id, type, staff });

function api({ names = {}, tags = {}, people = {}, related = {}, details = {}, fail } = {}) {
  const calls = [];
  const fetch = async (address, options) => {
    const url = new URL(address);
    assert.equal(url.origin, 'https://api.bgm.tv', 'Only Bangumi supplies matches and metadata');
    assert.equal(options.credentials, 'omit');
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, body, options });
    const failed = fail?.(url, body);
    if (failed) return failed;
    if (url.pathname === '/v0/search/subjects') {
      assert.equal(options.method, 'POST');
      assert.deepEqual(body.filter.type, [1]);
      assert.equal(body.filter.nsfw, false);
      const all = body.filter.tag ? tags[[...body.filter.tag, ...(body.keyword ? [`名称:${body.keyword}`] : [])].join(' ')] || [] : names[body.keyword] || [];
      const offset = Number(url.searchParams.get('offset'));
      return json({ data: all.slice(offset, offset + Number(url.searchParams.get('limit'))), total: all.length });
    }
    if (url.pathname === '/v0/search/persons') {
      assert.equal(options.method, 'POST');
      const all = people[body.keyword] || [];
      return json({ data: all.slice(0, 20), total: all.length });
    }
    assert.equal(options.method, 'GET');
    const relatedMatch = url.pathname.match(/^\/v0\/persons\/(\d+)\/subjects$/);
    if (relatedMatch) return json(related[relatedMatch[1]] || []);
    const detailMatch = url.pathname.match(/^\/v0\/subjects\/(\d+)$/);
    if (detailMatch) return details[detailMatch[1]] ? json(details[detailMatch[1]]) : json({}, 404);
    assert.fail(`Unexpected API: ${address}`);
  };
  return { fetch, calls };
}

test('keeps the complete name query and official ordering while combining exact tag matches', async () => {
  const backend = api({ names: { '百合 伊藤': [book(8), book(3)] }, tags: { '百合 伊藤': [book(8), book(9)] } });
  const result = await createBangumiSearch({ fetch: backend.fetch }).search(' 百合 伊藤 ');
  assert.deepEqual(result.items.map(item => item.id), ['bangumi:8', 'bangumi:3', 'bangumi:9']);
  assert.deepEqual(result.items[0].evidence, ['名称 / 别名', '标签：百合、伊藤']);
  const nameRequest = backend.calls.find(call => call.body?.keyword === '百合 伊藤');
  assert.deepEqual(nameRequest.body, { keyword: '百合 伊藤', sort: 'match', filter: { type: [1], nsfw: false } });
  assert.equal(nameRequest.url.searchParams.get('limit'), '20');
});

test('finds 伊藤ハチ books through official person matches, author relations and exact 百合 tags', async () => {
  const backend = api({
    people: { 伊藤: [person(12, '伊藤ハチ'), person(13, '另一位伊藤')] },
    related: { 12: [relation(101), relation(102), relation(103, '出版社'), relation(104, '作者', 2), relation(105)], 13: [relation(106)] },
    details: {
      101: book(101, '百合作品', { tags: [{ name: '百合' }], infobox: [{ key: '作者', value: '伊藤ハチ' }] }),
      102: book(102, '其他题材', { tags: [{ name: '日常' }] }),
      105: book(105, '受限作品', { nsfw: true, tags: [{ name: '百合' }] }),
      106: book(106, '另一位作者的作品', { meta_tags: ['百合'] }),
    },
  });
  const result = await createBangumiSearch({ fetch: backend.fetch }).search('百合 伊藤');
  assert.deepEqual(result.items.map(item => item.id), ['bangumi:101', 'bangumi:106']);
  assert.equal(result.items[0].author, '伊藤ハチ');
  assert.deepEqual(result.items[0].evidence, ['作者：伊藤ハチ · 标签：百合']);
  assert.equal(result.items[1].author, '另一位伊藤', 'Preserve ambiguity instead of silently selecting one author');
  assert.ok(!backend.calls.some(call => /subjects\/(103|104)$/.test(call.url.pathname)), 'Publishers and non-book relations must not be treated as authored manga');
});

test('handles reversed author/tag order and more than one required tag', async () => {
  for (const query of ['伊藤 百合', '日常 伊藤 百合']) {
    const backend = api({ people: { 伊藤: [person(12, '伊藤ハチ')] }, related: { 12: [relation(1), relation(2)] }, details: {
      1: book(1, '完整匹配', { tags: [{ name: '百合' }, { name: '日常' }] }),
      2: book(2, '只有百合', { tags: [{ name: '百合' }] }),
    } });
    const result = await createBangumiSearch({ fetch: backend.fetch }).search(query);
    assert.deepEqual(result.items.map(item => item.id), query.startsWith('日常') ? ['bangumi:1'] : ['bangumi:1', 'bangumi:2']);
  }
});

test('single-word authors and tags work without a hand-written genre dictionary', async () => {
  const authorApi = api({ people: { 雪子: [person(2, '雪子')] }, related: { 2: [relation(3)] }, details: { 3: book(3, '双人间') } });
  assert.equal((await createBangumiSearch({ fetch: authorApi.fetch }).search('雪子')).items[0].title, '双人间');
  const tagApi = api({ tags: { 罕见官方标签: [book(4)] } });
  const result = await createBangumiSearch({ fetch: tagApi.fetch }).search('罕见官方标签');
  assert.deepEqual(result.items[0].evidence, ['标签：罕见官方标签']);
});

test('combines title keywords with official tag filters without requiring an author match', async () => {
  const backend = api({ tags: { '百合 名称:双人间': [book(1, '双人间')] } });
  const result = await createBangumiSearch({ fetch: backend.fetch }).search('百合 双人间');
  assert.equal(result.items[0].title, '双人间');
  assert.deepEqual(result.items[0].evidence, ['名称 / 别名 · 标签：百合']);
});

test('adapts titles, authors and covers and merges duplicate IDs with matching evidence', async () => {
  const item = book(1, 'ふたりべや', { name_cn: '双人间', images: { large: 'https://lain.bgm.tv/cover.jpg' }, infobox: [{ key: '作者', value: [{ v: '雪子' }] }] });
  const backend = api({ names: { 双人间: [item] }, people: { 双人间: [person(2, '雪子')] }, related: { 2: [relation(1)] }, details: { 1: item } });
  const { items } = await createBangumiSearch({ fetch: backend.fetch }).search('双人间');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '双人间');
  assert.equal(items[0].subtitle, 'ふたりべや');
  assert.equal(items[0].author, '雪子');
  assert.equal(items[0].coverUrl, 'https://lain.bgm.tv/cover.jpg');
  assert.equal(items[0].evidence.length, 2);
});

test('empty input makes no request and single-character names remain searchable', async () => {
  const backend = api({ names: { 鱼: [book(1, '鱼')] } });
  const search = createBangumiSearch({ fetch: backend.fetch });
  assert.deepEqual(await search.search('　 '), { items: [], warnings: [], nextOffset: null });
  assert.equal(backend.calls.length, 0);
  assert.equal((await search.search(' 鱼 ')).items[0].title, '鱼');
});

test('reads official pages beyond the first twenty and paginates merged results from cache', async () => {
  const backend = api({ names: { 海贼王: Array.from({ length: 45 }, (_, index) => book(index + 1)) } });
  const search = createBangumiSearch({ fetch: backend.fetch });
  const first = await search.search('海贼王');
  assert.equal(first.items.length, 20);
  assert.equal(first.nextOffset, 20);
  const count = backend.calls.length;
  const second = await search.search('海贼王', { offset: first.nextOffset });
  const third = await search.search('海贼王', { offset: second.nextOffset });
  assert.equal(second.items[0].id, 'bangumi:21');
  assert.equal(third.items.length, 5);
  assert.equal(third.nextOffset, null);
  assert.equal(backend.calls.length, count, 'Loading cached pages should not repeat author/detail lookups');
});

test('preserves usable results and reports partial failures, including a failed later page', async () => {
  const backend = api({ names: { 测试: Array.from({ length: 30 }, (_, index) => book(index + 1)) }, fail: (url, body) => {
    if (url.pathname.includes('/persons') || (body?.keyword === '测试' && url.searchParams.get('offset') === '20')) return json({}, 503);
  } });
  const result = await createBangumiSearch({ fetch: backend.fetch }).search('测试');
  assert.equal(result.items.length, 20);
  assert.ok(result.warnings.some(warning => warning.includes('作者搜索')));
  assert.ok(result.warnings.some(warning => warning.includes('后续分页')));
});

test('reports service errors and malformed responses rather than fake empty matches', async () => {
  for (const response of [json({}, 429), json({}, 503), json({ data: null })]) {
    const search = createBangumiSearch({ fetch: async () => response });
    await assert.rejects(search.search('不存在'), /较频繁|503|数据无法读取/);
  }
  const search = createBangumiSearch({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(search.search('不存在'), /Failed to fetch/);
});

test('valid empty results remain empty and failed queries can be retried', async () => {
  let fails = true;
  const backend = api({ names: { 测试: [book(1)] }, fail: () => fails ? json({}, 503) : null });
  const search = createBangumiSearch({ fetch: backend.fetch });
  await assert.rejects(search.search('测试'), /503/);
  fails = false;
  assert.equal((await search.search('测试')).items.length, 1);
  assert.deepEqual((await search.search('确实不存在')).items, []);
});

test('an explicit retry refreshes a failed branch while reusing successful metadata', async () => {
  let fails = true;
  const backend = api({ names: { 雪子: [book(1)] }, people: { 雪子: [person(2, '雪子')] }, related: { 2: [relation(3)] }, details: { 3: book(3) },
    fail: url => fails && url.pathname.includes('/search/persons') ? json({}, 503) : null,
  });
  const search = createBangumiSearch({ fetch: backend.fetch });
  assert.equal((await search.search('雪子')).items.length, 1);
  fails = false;
  const result = await search.search('雪子', { refresh: true });
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.warnings, []);
  assert.equal(backend.calls.filter(call => call.url.pathname === '/v0/search/subjects' && call.body.keyword === '雪子').length, 1);
});

test('caches successful queries for five minutes and honours cancellation before cached reads', async () => {
  let time = 0;
  const backend = api({ names: { 双人间: [book(1)] } });
  const search = createBangumiSearch({ fetch: backend.fetch, now: () => time });
  await search.search('双人间');
  const count = backend.calls.length;
  await search.search('双人间');
  assert.equal(backend.calls.length, count);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(search.search('双人间', { signal: controller.signal }), { name: 'AbortError' });
  time = 300001;
  await search.search('双人间');
  assert.ok(backend.calls.length > count);
});

test('cancels every active branch and does not cache cancelled responses', async () => {
  let aborted = 0;
  let block = true;
  const search = createBangumiSearch({ fetch: async (_, { signal }) => {
    if (!block) return json({ data: [], total: 0 });
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => { aborted++; reject(signal.reason); }, { once: true }));
  } });
  const controller = new AbortController();
  const pending = search.search('百合 伊藤', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.ok(aborted > 0);
  block = false;
  assert.deepEqual((await search.search('百合 伊藤')).items, []);
});

test('bounds expansion, concurrency and records incomplete author/name coverage', async () => {
  const backend = api({
    names: { 伊藤: Array.from({ length: 100 }, (_, index) => book(1000 + index)) },
    people: { 伊藤: Array.from({ length: 21 }, (_, index) => person(index + 1, `伊藤${index}`)) },
    related: Object.fromEntries(Array.from({ length: 21 }, (_, index) => [index + 1, Array.from({ length: 8 }, (_, position) => relation(index * 8 + position + 1))])),
    details: Object.fromEntries(Array.from({ length: 168 }, (_, index) => [index + 1, book(index + 1)])),
  });
  let active = 0, peak = 0;
  const search = createBangumiSearch({ fetch: async (...args) => {
    active++; peak = Math.max(peak, active);
    try { await new Promise(resolve => setImmediate(resolve)); return await backend.fetch(...args); }
    finally { active--; }
  } });
  const result = await search.search('伊藤');
  assert.ok(result.warnings.some(warning => warning.includes('前 60')));
  assert.ok(result.warnings.some(warning => warning.includes('前 12')));
  assert.ok(result.warnings.some(warning => warning.includes('前 40')));
  assert.ok(result.warnings.some(warning => warning.includes('前 20')));
  assert.ok(peak <= 3);
  assert.ok(backend.calls.length <= 70);
});
