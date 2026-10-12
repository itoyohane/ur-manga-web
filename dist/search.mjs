// Search structured catalogue data; author matches come from actual credit relations.
export const GENRES = [
  { name: '百合', aliases: ['百合', 'GL', 'Yuri', 'Girls Love', "Girls' Love", '少女爱', '少女愛'], tag: 'Yuri' },
  { name: '日常', aliases: ['日常', 'Slice of Life'], genre: 'Slice of Life' },
  { name: '恋爱', aliases: ['恋爱', '戀愛', '爱情', '愛情', 'Romance'], genre: 'Romance' },
  { name: '校园', aliases: ['校园', '校園', '学园', '學園', 'School'], tag: 'School' },
  { name: '悬疑', aliases: ['悬疑', '懸疑', '推理', 'Mystery'], genre: 'Mystery' },
  { name: '奇幻', aliases: ['奇幻', 'Fantasy'], genre: 'Fantasy' },
  { name: '科幻', aliases: ['科幻', 'Sci-Fi', 'Science Fiction'], genre: 'Sci-Fi' },
  { name: '运动', aliases: ['运动', '運動', '体育', '體育', 'Sports'], genre: 'Sports' },
  { name: '搞笑', aliases: ['搞笑', '喜剧', '喜劇', 'Comedy'], genre: 'Comedy' },
  { name: '冒险', aliases: ['冒险', '冒險', 'Adventure'], genre: 'Adventure' },
  { name: '恐怖', aliases: ['恐怖', 'Horror'], genre: 'Horror' },
];

const traditional = { 愛: '爱', 戀: '恋', 學: '学', 園: '园', 懸: '悬', 運: '运', 動: '动', 體: '体', 劇: '剧', 險: '险', 雙: '双', 間: '间', 繪: '绘', 龍: '龙', 貓: '猫', 與: '与', 妳: '你', 來: '来', 夢: '梦', 見: '见', 語: '语', 贼: '贼', 賊: '贼', 葉: '叶', 聲: '声', 無: '无', 魚: '鱼' };
export function normalizeText(value) {
  return Array.from(String(value || '').normalize('NFKC').toLowerCase()).map(char => traditional[char] || char).join('').replace(/[\p{P}\p{Z}\s]/gu, '');
}

export function parseQuery(value) {
  let input = String(value || '').normalize('NFKC').trim().slice(0, 100);
  // Recognize explicit author phrases without stripping words from arbitrary titles.
  input = input.replace(/(.+?)(?:画的|畫的|创作的|創作的|老师的|老師的|的作品)/g, '$1 ');
  for (const genre of GENRES) {
    for (const alias of genre.aliases.filter(word => /^[\p{Script=Han}]+$/u.test(word))) {
      input = input.replaceAll(`${alias}漫画`, ` ${alias} `).replaceAll(`${alias}漫畫`, ` ${alias} `);
    }
  }
  const genres = [];
  // Replace known multiword English topics before tokenizing.
  for (const genre of GENRES) {
    for (const alias of genre.aliases.filter(word => word.includes(' '))) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      input = input.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), genre.name);
    }
  }
  const terms = [];
  for (const token of input.split(/[\s,，、;；+＋/]+/u).filter(Boolean)) {
    const genre = GENRES.find(item => item.aliases.some(alias => normalizeText(alias) === normalizeText(token)));
    if (genre) { if (!genres.includes(genre)) genres.push(genre); }
    else if (!/^(?:漫画|漫畫|作品|作者[:：]?)$/.test(token)) {
      const term = token.replace(/^(?:作者|author)[:：]/i, '');
      if (term && !terms.some(item => normalizeText(item) === normalizeText(term))) terms.push(term);
    }
  }
  return { raw: String(value || '').trim(), genres, terms };
}

function oneEditApart(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + Number(i < a.length || j < b.length) <= 1;
}

export function fuzzyScore(query, value) {
  const q = normalizeText(query), v = normalizeText(value);
  if (!q || !v) return 0;
  if (q === v) return 100;
  if (v.startsWith(q)) return 85;
  if (v.includes(q)) return 70;
  // Avoid fuzzy matching two-character names to unrelated people.
  if (q.length >= 4 || /^[a-z]{3,}$/.test(q)) {
    if (oneEditApart(q, v)) return 45;
    if (String(value).split(/[\s\p{P}]+/u).some(word => oneEditApart(q, normalizeText(word)))) return 45;
  }
  return 0;
}

function strings(value) {
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => typeof item === 'string' ? [item] : typeof item?.v === 'string' ? [item.v] : []);
}

function infoboxValues(item, keyPattern) {
  return (item.infobox || []).filter(field => keyPattern.test(field.key)).flatMap(field => strings(field.value));
}

const AUTHOR_ROLE = /^(?:story(?:\s*&\s*art)?|art|original (?:creator|story))(?:\s*\(|$)/i;

export function bangumiCandidate(item, overrides = {}) {
  const authorNames = infoboxValues(item, /^(作者|原作|作画|作畫|漫画|漫畫)$/);
  return {
    id: `bangumi:${item.id}`, title: item.name_cn || item.name || '',
    aliases: [item.name, item.name_cn, ...infoboxValues(item, /别名|別名|中文名/)].filter(Boolean),
    subtitle: item.name || '', author: authorNames.join(' / '), authorNames,
    tags: [...(item.tags || []).map(tag => typeof tag === 'string' ? tag : tag.name), ...(item.meta_tags || [])].filter(Boolean),
    coverUrl: item.images?.large || item.images?.common || item.image || '',
    source: 'Bangumi', url: `https://bgm.tv/subject/${item.id}`,
    nsfw: item.nsfw === true, platform: item.platform || '',
    ...overrides,
  };
}

function anilistCandidate(item, person) {
  const authors = (item.staff?.edges || []).filter(edge => AUTHOR_ROLE.test(edge.role || '')).flatMap(edge => [edge.node?.name?.native, edge.node?.name?.full]).filter(Boolean);
  if (person) authors.push(person.name?.native, person.name?.full, ...(person.name?.alternative || []));
  return {
    id: `anilist:${item.id}`, title: item.title?.native || item.title?.english || item.title?.romaji || '',
    aliases: [...Object.values(item.title || {}), ...(item.synonyms || [])].filter(Boolean),
    subtitle: item.title?.english || item.title?.romaji || '', author: person?.name?.native || person?.name?.full || authors[0] || '',
    authorNames: [...new Set(authors.filter(Boolean))],
    tags: [...(item.genres || []), ...(item.tags || []).filter(tag => !tag.isMediaSpoiler && !tag.isGeneralSpoiler).map(tag => tag.name)],
    coverUrl: item.coverImage?.large || '', source: 'AniList', url: `https://anilist.co/manga/${item.id}`,
    nsfw: item.isAdult === true, country: item.countryOfOrigin, format: item.format,
  };
}

export function matchesGenres(candidate, genres) {
  return genres.every(genre => (candidate.tags || []).some(tag => genre.aliases.some(alias => normalizeText(alias) === normalizeText(tag))));
}

export function rankCandidates(candidates, intent) {
  const ranked = [];
  for (const candidate of candidates) {
    if (!candidate.title || candidate.nsfw || /小说|小說|画集|畫集/.test(candidate.platform || '') || candidate.format === 'NOVEL') continue;
    if (!matchesGenres(candidate, intent.genres)) continue;
    const evidence = intent.genres.map(genre => genre.name);
    let score = intent.genres.length * 30;
    let matches = true;
    for (const term of intent.terms) {
      const titleScore = Math.max(0, ...(candidate.aliases || [candidate.title]).map(alias => fuzzyScore(term, alias)));
      const authorScore = Math.max(0, ...(candidate.authorNames || []).map(name => fuzzyScore(term, name)));
      const tagScore = Math.max(0, ...(candidate.tags || []).map(tag => fuzzyScore(term, tag)));
      const best = Math.max(titleScore, authorScore, tagScore);
      const isAuthor = (intent.authorTerms || []).some(name => normalizeText(name) === normalizeText(term));
      if (!best || (isAuthor && !authorScore)) { matches = false; break; }
      score += best + (authorScore ? 20 : 0);
      if (authorScore) evidence.push(`作者：${candidate.author || term}`);
    }
    if (matches) ranked.push({ ...candidate, score, evidence: [...new Set(evidence)] });
  }
  ranked.sort((a, b) => b.score - a.score || (a.source === b.source ? 0 : a.source === 'Bangumi' ? -1 : 1));
  const output = [];
  const ids = new Set();
  for (const candidate of ranked) {
    const aliases = (candidate.aliases || [candidate.title]).map(normalizeText).filter(Boolean);
    if (ids.has(candidate.id)) continue;
    const duplicate = output.find(item => {
      const sameTitle = (item.aliases || [item.title]).some(alias => aliases.includes(normalizeText(alias)));
      const sameAuthor = !item.authorNames?.length || !candidate.authorNames?.length || item.authorNames.some(name => candidate.authorNames.some(other => normalizeText(name) === normalizeText(other)));
      return sameTitle && sameAuthor;
    });
    if (duplicate) {
      // Preserve aliases and an available cover from the secondary source.
      duplicate.aliases = [...new Set([...(duplicate.aliases || [duplicate.title]), ...(candidate.aliases || [])])];
      if (!duplicate.coverUrl) duplicate.coverUrl = candidate.coverUrl;
      if (!duplicate.author) duplicate.author = candidate.author;
      ids.add(candidate.id); continue;
    }
    ids.add(candidate.id); output.push(candidate);
  }
  return output.slice(0, 24);
}

function createLimiter(maximum) {
  let running = 0;
  const queue = [];
  function next() {
    while (running < maximum && queue.length) {
      const { task, resolve, reject } = queue.shift(); running++;
      Promise.resolve().then(task).then(resolve, reject).finally(() => { running--; next(); });
    }
  }
  return task => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next(); });
}

const MEDIA_FIELDS = `id title { native english romaji } synonyms countryOfOrigin format isAdult
  coverImage { large } genres tags { name isMediaSpoiler isGeneralSpoiler }
  staff(perPage: 8) { edges { role node { name { full native } } } }`;

export function createSearchEngine({ fetch: fetcher = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  const limit = createLimiter(4);
  async function request(url, body, signal) {
    signal?.throwIfAborted();
    const key = url + JSON.stringify(body || null);
    const cached = cache.get(key);
    if (cached && now() - cached.time < 300000) return cached.data;
    return limit(async () => {
      signal?.throwIfAborted();
      const controller = new AbortController();
      const cancel = () => controller.abort(signal.reason);
      signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), 9000);
      try {
        const response = await fetcher(url, {
          ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(response.status === 429 ? '搜索较频繁，请稍后再试' : `数据源暂不可用（${response.status}）`);
        const data = await response.json();
        if (data?.errors) throw new Error('数据源返回查询错误');
        cache.set(key, { data, time: now() });
        if (cache.size > 128) cache.delete(cache.keys().next().value);
        return data;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
    });
  }

  async function searchBangumi(intent, signal) {
    const warnings = [];
    const tags = intent.genres.map(genre => genre.name);
    const jobs = [request('https://api.bgm.tv/v0/search/subjects?limit=24', {
      keyword: intent.terms.join(' '), sort: 'match', filter: { type: [1], nsfw: false, ...(tags.length ? { tag: tags } : {}) },
    }, signal)];
    const personTerms = intent.terms.filter(term => normalizeText(term).length <= 20).slice(0, 3);
    for (const term of personTerms) jobs.push(request('https://api.bgm.tv/v0/search/persons?limit=5', { keyword: term, filter: { career: ['mangaka'] } }, signal));
    const initial = await Promise.allSettled(jobs);
    signal?.throwIfAborted();
    if (initial.every(result => result.status === 'rejected')) throw initial[0].reason;
    const titles = initial[0].status === 'fulfilled' ? (initial[0].value.data || []).map(item => bangumiCandidate(item)) : [];
    if (initial.some(result => result.status === 'rejected')) warnings.push('部分标题或作者查询失败，结果可能不完整');
    const personGroups = await Promise.all(initial.slice(1).map(async (result, index) => {
      if (result.status !== 'fulfilled') return [];
      const term = personTerms[index];
      const raw = (result.value.data || []).map(person => ({ person: { ...person, aliases: [person.name] }, score: fuzzyScore(term, person.name) }));
      // A Chinese or romanized name can differ from the profile's Japanese display name.
      // Check aliases from the first two profile hits rather than assuming an identity.
      if (!raw.some(item => item.score >= 45)) {
        await Promise.all(raw.slice(0, 2).map(async item => {
          try {
            const detail = await request(`https://api.bgm.tv/v0/persons/${item.person.id}`, null, signal);
            item.person.aliases.push(...infoboxValues(detail, /别名|別名|中文名/));
            item.score = Math.max(0, ...item.person.aliases.map(name => fuzzyScore(term, name)));
          } catch { warnings.push('部分作者别名未能核对'); }
        }));
      }
      const matches = raw.filter(item => item.score >= 45).sort((a, b) => b.score - a.score);
      const exact = matches.filter(item => item.score === 100);
      return (exact.length ? exact : matches).slice(0, 2).map(item => item.person);
    }));
    const people = [...new Map(personGroups.flat().map(person => [person.id, person])).values()];
    // Bound relationship expansion and detail reads to keep mobile requests manageable.
    const related = await Promise.allSettled(people.slice(0, 3).map(async person => {
      const subjects = await request(`https://api.bgm.tv/v0/persons/${person.id}/subjects`, null, signal);
      return (Array.isArray(subjects) ? subjects : []).filter(subject => subject.type === 1 && /作者|原作|作画|作畫|漫画|漫畫|著者/.test(subject.staff || '')).map(subject => ({ subject, person }));
    }));
    signal?.throwIfAborted();
    if (related.some(result => result.status === 'rejected')) warnings.push('部分作者作品未能读取');
    const works = related.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    const unique = new Map();
    for (const { subject, person } of works) {
      if (!unique.has(subject.id)) unique.set(subject.id, { subject, people: [] });
      unique.get(subject.id).people.push(person);
    }
    const details = await Promise.allSettled([...unique.values()].slice(0, 24).map(async ({ subject, people: creators }) => {
      const detail = await request(`https://api.bgm.tv/v0/subjects/${subject.id}`, null, signal);
      const candidate = bangumiCandidate(detail);
      candidate.authorNames = [...new Set([...candidate.authorNames, ...creators.flatMap(person => person.aliases)])];
      candidate.author = candidate.author || creators.map(person => person.name).join(' / ');
      return candidate;
    }));
    signal?.throwIfAborted();
    if (details.some(result => result.status === 'rejected')) warnings.push('部分作品资料未能读取');
    if (unique.size > 24) warnings.push('作者作品较多，本次检索前 24 部，可补充书名缩小范围');
    const authorTerms = intent.terms.filter(term => people.some(person => person.aliases.some(name => fuzzyScore(term, name) >= 45)));
    return { candidates: [...details.flatMap(result => result.status === 'fulfilled' ? [result.value] : []), ...titles], authorTerms, warnings };
  }

  async function searchAniList(intent, signal) {
    const response = await request('https://graphql.anilist.co', {
      query: `query ($search: String, $staffSearch: String, $genres: [String], $tags: [String], $authors: Boolean!) {
        titles: Page(page: 1, perPage: 24) { media(search: $search, type: MANGA, countryOfOrigin: "JP", isAdult: false, genre_in: $genres, tag_in: $tags) { ${MEDIA_FIELDS} } }
        authors: Page(page: 1, perPage: 3) @include(if: $authors) { staff(search: $staffSearch) {
          name { full native alternative } staffMedia(type: MANGA, page: 1, perPage: 40, sort: POPULARITY_DESC) { edges { staffRole node { ${MEDIA_FIELDS} } } }
        } }
      }`,
      variables: {
        search: intent.terms.join(' ') || null, staffSearch: intent.terms.join(' ') || null, authors: intent.terms.length > 0,
        genres: intent.genres.map(genre => genre.genre).filter(Boolean).length ? intent.genres.map(genre => genre.genre).filter(Boolean) : null,
        tags: intent.genres.map(genre => genre.tag).filter(Boolean).length ? intent.genres.map(genre => genre.tag).filter(Boolean) : null,
      },
    }, signal);
    const titles = (response.data?.titles?.media || []).map(item => anilistCandidate(item));
    const authors = (response.data?.authors?.staff || []).flatMap(person => {
      const names = [person.name?.full, person.name?.native, ...(person.name?.alternative || [])];
      if (!intent.terms.some(term => names.some(name => fuzzyScore(term, name) >= 45))) return [];
      return (person.staffMedia?.edges || []).filter(edge => AUTHOR_ROLE.test(edge.staffRole || '') && edge.node?.countryOfOrigin === 'JP').map(edge => anilistCandidate(edge.node, person));
    });
    const authorTerms = intent.terms.filter(term => authors.some(item => item.authorNames.some(name => fuzzyScore(term, name) >= 45)));
    return { candidates: [...authors, ...titles], authorTerms, warnings: [] };
  }

  return {
    async search(query, { signal } = {}) {
      const intent = parseQuery(query);
      if (!intent.terms.length && !intent.genres.length) return { items: [], intent, warnings: [] };
      const sources = await Promise.allSettled([searchBangumi(intent, signal), searchAniList(intent, signal)]);
      signal?.throwIfAborted();
      if (sources.every(source => source.status === 'rejected')) throw new Error('暂时无法连接搜索服务，请稍后重试或手动添加');
      const warnings = sources.flatMap((source, index) => source.status === 'fulfilled' ? source.value.warnings : [`${index ? 'AniList' : 'Bangumi'} 暂不可用，已使用另一个来源`]);
      const candidates = sources.flatMap(source => source.status === 'fulfilled' ? source.value.candidates : []);
      const authorTerms = intent.genres.length || intent.terms.length > 1 ? [...new Set(sources.flatMap(source => source.status === 'fulfilled' ? source.value.authorTerms : []))] : [];
      const resolvedIntent = { ...intent, authorTerms };
      return { items: rankCandidates(candidates, resolvedIntent), intent: resolvedIntent, warnings: [...new Set(warnings)] };
    },
  };
}
