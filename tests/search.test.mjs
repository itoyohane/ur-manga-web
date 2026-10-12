import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, normalizeText, fuzzyScore, bangumiCandidate, rankCandidates, createSearchEngine } from '../dist/search.mjs';

const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const subject = (id, name, tags = ['百合'], author = '雪子', platform = '漫画') => ({
  id, type: 1, name, name_cn: '', platform, tags: tags.map(name => ({ name })),
  infobox: [{ key: '作者', value: author }], images: {}, nsfw: false,
});

test('recognizes unordered author/topic terms, fullwidth spaces and genre aliases', () => {
  for (const query of ['百合 雪子', '雪子　百合', 'GL 雪子', "Girls' Love 雪子", '雪子画的百合漫画']) {
    const intent = parseQuery(query);
    assert.deepEqual(intent.terms, ['雪子'], query);
    assert.deepEqual(intent.genres.map(item => item.name), ['百合'], query);
  }
  assert.deepEqual(parseQuery('百合 日常 雪子 百合').genres.map(item => item.name), ['百合', '日常']);
  assert.deepEqual(parseQuery('百合是我的工作').terms, ['百合是我的工作']);
  assert.deepEqual(parseQuery('作者：雪子').terms, ['雪子']);
});

test('matches partial titles, casing, limited traditional variants and Latin typos', () => {
  assert.equal(normalizeText('雙人間'), '双人间');
  assert.equal(fuzzyScore('双人', '雙人間'), 85);
  assert.equal(fuzzyScore('ONE PIECE', 'One Piece'), 100);
  assert.equal(fuzzyScore('Pice', 'One Piece'), 45);
  assert.equal(fuzzyScore('雪子', '雪孑'), 0);
  assert.equal(fuzzyScore('雪子', '仲谷鳰'), 0);
});

test('requires every topic and the resolved author; title mentions are not author credits', () => {
  const intent = { ...parseQuery('百合 雪子'), authorTerms: ['雪子'] };
  const candidates = [
    bangumiCandidate(subject(1, 'ふたりべや')),
    bangumiCandidate(subject(2, 'Other romance', ['恋爱'])),
    bangumiCandidate(subject(3, '雪子的故事', ['百合'], '其他作者')),
    bangumiCandidate(subject(4, '画集', ['百合'], '雪子', '画集')),
    bangumiCandidate({ ...subject(5, 'Adult'), nsfw: true }),
  ];
  const result = rankCandidates(candidates, intent);
  assert.deepEqual(result.map(item => item.id), ['bangumi:1']);
  assert.deepEqual(result[0].evidence, ['百合', '作者：雪子']);
  assert.equal(rankCandidates(candidates, parseQuery('百合 日常 雪子')).length, 0);
});

test('deduplicates equivalent source entries while keeping different authors with the same title', () => {
  const first = bangumiCandidate(subject(1, 'ふたりべや'));
  const duplicate = { ...first, id: 'anilist:2', source: 'AniList', coverUrl: 'https://example.com/cover.jpg' };
  const sameTitle = bangumiCandidate(subject(3, 'ふたりべや', ['百合'], '其他作者'));
  const result = rankCandidates([first, first, duplicate, sameTitle], parseQuery('百合'));
  assert.equal(result.length, 2);
  assert.equal(result[0].coverUrl, 'https://example.com/cover.jpg');
});

function fixtureFetch({ failAniList = false, aliases = false } = {}) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    const body = options.body && JSON.parse(options.body);
    calls.push({ url, body });
    if (url === 'https://graphql.anilist.co') return failAniList ? json({}, 429) : json({ data: { titles: { media: [] }, authors: { staff: [] } } });
    if (url.includes('/search/subjects')) return json({ data: [subject(900, '雪子的百合故事', ['百合'], '其他作者')] });
    if (url.includes('/search/persons')) return json({ data: [{ id: 100, name: aliases ? 'ゆきこ' : '雪子', career: ['mangaka'] }] });
    if (url.endsWith('/persons/100')) return json({ name: 'ゆきこ', infobox: [{ key: '别名', value: [{ v: '雪子' }, { v: 'Yukiko' }] }] });
    if (url.endsWith('/persons/100/subjects')) return json([
      { id: 101, type: 1, staff: '作者', name: 'ふたりべや' },
      { id: 102, type: 1, staff: '作者', name: 'Non-Yuri' },
      { id: 103, type: 1, staff: '插图', name: 'Illustrated novel' },
      { id: 104, type: 2, staff: '原作', name: 'Anime' },
    ]);
    if (url.endsWith('/subjects/101')) return json(subject(101, 'ふたりべや'));
    if (url.endsWith('/subjects/102')) return json(subject(102, 'Non-Yuri', ['奇幻']));
    throw new Error(`Unexpected endpoint: ${url}`);
  };
  return { fetcher, calls };
}

test('author/topic search expands actual author relationships and filters their works by topic', async () => {
  const { fetcher, calls } = fixtureFetch();
  const { items, intent, warnings } = await createSearchEngine({ fetch: fetcher }).search('百合 雪子');
  assert.deepEqual(items.map(item => item.title), ['ふたりべや']);
  assert.deepEqual(intent.authorTerms, ['雪子']);
  assert.deepEqual(warnings, []);
  assert.equal(items[0].author, '雪子');
  const titleRequest = calls.find(call => call.url.includes('/search/subjects'));
  assert.equal(titleRequest.body.keyword, '雪子');
  assert.deepEqual(titleRequest.body.filter.tag, ['百合']);
  assert.ok(calls.some(call => call.url.endsWith('/persons/100/subjects')));
  assert.ok(!calls.some(call => call.url.endsWith('/subjects/103')));
  assert.ok(!calls.some(call => call.url.endsWith('/subjects/104')));
});

test('resolves verified profile aliases before associating an author with works', async () => {
  const { fetcher, calls } = fixtureFetch({ aliases: true });
  const { items } = await createSearchEngine({ fetch: fetcher }).search('百合 雪子');
  assert.equal(items[0].title, 'ふたりべや');
  assert.ok(calls.some(call => call.url.endsWith('/persons/100')));
});

test('returns useful results and a warning when one source is rate limited', async () => {
  const { fetcher } = fixtureFetch({ failAniList: true });
  const { items, warnings } = await createSearchEngine({ fetch: fetcher }).search('百合 雪子');
  assert.equal(items.length, 1);
  assert.ok(warnings.some(message => message.includes('AniList')));
});

test('reports total service failure instead of pretending there are no matches', async () => {
  const engine = createSearchEngine({ fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(engine.search('百合 雪子'), /无法连接搜索服务/);
});

test('reuses cached data for repeated queries and refreshes it after five minutes', async () => {
  const { fetcher, calls } = fixtureFetch();
  let time = 1000;
  const engine = createSearchEngine({ fetch: fetcher, now: () => time });
  await engine.search('百合 雪子'); const firstCount = calls.length;
  await engine.search('雪子 百合');
  assert.equal(calls.length, firstCount);
  time += 300001;
  await engine.search('百合 雪子');
  assert.ok(calls.length > firstCount);
});

test('cancels in-flight searches so stale results cannot overwrite newer input', async () => {
  const controller = new AbortController();
  const engine = createSearchEngine({ fetch: (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    if (signal.aborted) reject(signal.reason);
  }) });
  const pending = engine.search('百合 雪子', { signal: controller.signal });
  await Promise.resolve(); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('AniList fallback uses author credits, excludes cover-only credits and checks topics', async () => {
  const book = { id: 3, title: { native: 'ふたりべや' }, countryOfOrigin: 'JP', format: 'MANGA', genres: ['Slice of Life'], tags: [{ name: 'Yuri' }] };
  const engine = createSearchEngine({ fetch: async url => {
    if (url !== 'https://graphql.anilist.co') throw new TypeError('offline');
    return json({ data: { titles: { media: [] }, authors: { staff: [{ name: { native: '雪子', full: 'Yukiko' }, staffMedia: { edges: [
      { staffRole: 'Story & Art', node: book },
      { staffRole: 'Cover Art', node: { ...book, id: 4, title: { native: 'Unrelated anthology' } } },
    ] } }] } } });
  } });
  const { items } = await engine.search('百合 雪子');
  assert.deepEqual(items.map(item => item.title), ['ふたりべや']);
  assert.equal(items[0].author, '雪子');
});

test('empty input makes no network calls', async () => {
  let called = false;
  const { items } = await createSearchEngine({ fetch: async () => { called = true; } }).search('  ');
  assert.deepEqual(items, []); assert.equal(called, false);
});
