const API = 'https://api.bgm.tv/v0';
const PAGE_SIZE = 20;
const AUTHOR_STAFF = /^(作者|原作|作画|作畫|漫画|漫畫|脚本|劇本|故事|插图|插圖|插画|插畫)$/;
const AUTHOR_CAREERS = new Set(['mangaka', 'writer', 'illustrator', 'artist']);

function subjectResult(item, evidence) {
  const author = (item.infobox || []).filter(field => /^(作者|原作|作画|作畫)$/.test(field.key)).flatMap(field => {
    if (typeof field.value === 'string') return [field.value];
    return Array.isArray(field.value) ? field.value.map(value => typeof value === 'string' ? value : value?.v).filter(value => typeof value === 'string') : [];
  }).join(' / ');
  return {
    id: `bangumi:${item.id}`,
    title: item.name_cn || item.name || '',
    subtitle: item.name || '',
    author,
    coverUrl: item.images?.large || item.images?.common || item.image || '',
    source: 'Bangumi', evidence: [evidence],
  };
}

function authorPlans(keyword, words) {
  if (words.length === 1) return [{ keyword, tags: [] }];
  if (words.length > 4) return [];
  const plans = new Map();
  for (let index = 0; index < words.length; index++) {
    const others = words.filter((_, position) => position !== index);
    for (const plan of [{ keyword: others.join(' '), tags: [words[index]] }, { keyword: words[index], tags: others }]) {
      plans.set(JSON.stringify(plan), plan);
    }
  }
  return [...plans.values()].slice(0, 6);
}

async function mapLimit(values, operation) {
  const results = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await operation(values[index]);
    }
  }));
  return results;
}

export function createBangumiSearch({ fetch: fetcher = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  const dataCache = new Map();
  return {
    async search(query, { signal, offset = 0, refresh = false } = {}) {
      const keyword = String(query ?? '').trim();
      signal?.throwIfAborted();
      if (!keyword) return { items: [], warnings: [], nextOffset: null };
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('搜索分页参数无效。');
      const page = result => ({
        items: result.items.slice(offset, offset + PAGE_SIZE), warnings: result.warnings,
        nextOffset: offset + PAGE_SIZE < result.items.length ? offset + PAGE_SIZE : null,
      });
      const cached = cache.get(keyword);
      if (!refresh && cached && now() < cached.expires) return page(cached);
      const controller = new AbortController();
      const cancel = () => controller.abort(signal.reason);
      signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => controller.abort(new DOMException('Bangumi 查询超时，请重试。', 'TimeoutError')), 20000);
      const warnings = new Set();
      const errors = [];
      const merged = new Map();
      const words = keyword.split(/\s+/u);
      let requestCount = 0;

      function add(item, evidence, author = '') {
        if (!Number.isSafeInteger(item?.id) || item.type !== 1 || item.nsfw === true) return;
        const result = subjectResult(item, evidence);
        if (!result.title) return;
        result.author ||= author;
        const previous = merged.get(result.id);
        if (previous) {
          if (!previous.evidence.includes(evidence)) previous.evidence.push(evidence);
          previous.author ||= result.author;
          previous.coverUrl ||= result.coverUrl;
        } else merged.set(result.id, result);
      }

      async function request(path, body) {
        controller.signal.throwIfAborted();
        const key = JSON.stringify([path, body]);
        const cachedData = dataCache.get(key);
        if (cachedData && now() - cachedData.time < 300000) return cachedData.value;
        if (++requestCount > 70) throw new Error('本次搜索已达到请求上限，请输入更完整的作者名缩小范围。');
        const response = await fetcher(`${API}${path}`, {
          method: body ? 'POST' : 'GET',
          ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]), credentials: 'omit',
        });
        if (!response.ok) throw new Error(response.status === 429 ? '搜索较频繁，请稍后再试。' : `Bangumi 搜索请求失败（${response.status}）。`);
        const value = await response.json();
        controller.signal.throwIfAborted();
        if (path.includes('/search/') ? !Array.isArray(value?.data) : path.endsWith('/subjects') ? !Array.isArray(value) : !Number.isSafeInteger(value?.id)) {
          throw new Error('Bangumi 返回的数据无法读取，请稍后重试。');
        }
        dataCache.set(key, { time: now(), value });
        if (dataCache.size > 256) dataCache.delete(dataCache.keys().next().value);
        return value;
      }

      async function attempt(label, operation, fallback = []) {
        try { return await operation(); }
        catch (error) {
          signal?.throwIfAborted();
          errors.push(error);
          warnings.add(`${label}未完整读取，可重试或缩小关键词范围。`);
          return fallback;
        }
      }

      async function subjects(body, label, maxPages = 3) {
        const items = [];
        for (let index = 0; index < maxPages; index++) {
          let data;
          try { data = await request(`/search/subjects?limit=20&offset=${items.length}`, body); }
          catch (error) {
            signal?.throwIfAborted();
            if (!items.length) throw error;
            errors.push(error);
            warnings.add(`${label}后续分页未完整读取，可重试或缩小关键词范围。`);
            return items;
          }
          items.push(...data.data);
          if (!data.data.length || (Number.isFinite(data.total) ? items.length >= data.total : data.data.length < PAGE_SIZE)) return items;
        }
        warnings.add(`${label}仅读取前 ${maxPages * PAGE_SIZE} 条，可增加关键词缩小范围。`);
        return items;
      }

      try {
        // Candidate partitions contain no genre dictionary or locally invented fuzzy score.
        // Bangumi matches names; its filters and metadata verify the tags and author relations.
        if (words.length > 4) warnings.add('超过四个词时仅查询完整书名，可减少关键词启用作者和标签组合查询。');
        const plans = authorPlans(keyword, words);
        const jobs = [
          { kind: 'title', run: () => subjects({ keyword, sort: 'match', filter: { type: [1], nsfw: false } }, '名称搜索') },
          ...(words.length <= 4 ? [{ kind: 'tags', run: () => subjects({ keyword: '', sort: 'heat', filter: { type: [1], nsfw: false, tag: words } }, '标签搜索') }] : []),
          ...plans.filter(plan => plan.tags.length).map(plan => ({ kind: 'tag-title', plan, run: () => subjects({ keyword: plan.keyword, sort: 'match', filter: { type: [1], nsfw: false, tag: plan.tags } }, '名称与标签组合', 1) })),
          ...plans.map(plan => ({ kind: 'person', plan, run: async () => {
            const data = await request('/search/persons?limit=20&offset=0', { keyword: plan.keyword });
            if (data.total > data.data.length) warnings.add('人物候选仅读取前 20 位，可输入完整作者名缩小范围。');
            return data.data.filter(person => !person.career?.length || person.career.some(career => AUTHOR_CAREERS.has(career)));
          } })),
        ];
        const batches = await mapLimit(jobs, async job => ({ ...job, data: await attempt(job.kind === 'person' ? '作者搜索' : job.kind === 'tags' ? '标签搜索' : '名称搜索', job.run) }));
        const candidates = new Map();
        for (const batch of batches.filter(batch => batch.kind === 'person')) {
          for (const person of batch.data) {
            if (!Number.isSafeInteger(person.id)) continue;
            if (!candidates.has(person.id)) candidates.set(person.id, { person, tags: [] });
            candidates.get(person.id).tags.push(batch.plan.tags);
          }
        }
        if (candidates.size > 12) warnings.add('作者候选较多，本次展开前 12 位；可输入完整作者名缩小范围。');
        const related = await mapLimit([...candidates.values()].slice(0, 12), async candidate => ({
          ...candidate, books: await attempt('作者关联作品', async () => {
            const items = await request(`/persons/${candidate.person.id}/subjects`);
            return items.filter(item => item.type === 1 && AUTHOR_STAFF.test(item.staff));
          }),
        }));
        // Round-robin prevents the first prolific author from consuming the whole detail budget.
        const books = new Map();
        const longest = Math.max(0, ...related.map(candidate => candidate.books.length));
        for (let index = 0; index < longest; index++) {
          for (const candidate of related) {
            const book = candidate.books[index];
            if (!book || !Number.isSafeInteger(book.id)) continue;
            if (!books.has(book.id)) books.set(book.id, []);
            books.get(book.id).push(candidate);
          }
        }
        if (books.size > 40) warnings.add('作者作品本次核对前 40 部；可输入完整作者名或书名缩小范围。');
        const known = new Map(batches.filter(batch => batch.kind !== 'person').flatMap(batch => batch.data).map(item => [item.id, item]));
        const details = await mapLimit([...books].slice(0, 40), async ([id, authors]) => ({
          authors, item: known.get(id) || await attempt('作品详情', () => request(`/subjects/${id}`), null),
        }));
        // Verified author+tag matches appear first; each branch keeps Bangumi's ordering.
        for (const { item, authors } of details) {
          if (!item) continue;
          const tags = new Set([...(item.tags || []).map(tag => tag.name), ...(item.meta_tags || [])]);
          for (const candidate of authors) {
            for (const required of candidate.tags) {
              if (required.every(tag => tags.has(tag))) add(item, `作者：${candidate.person.name}${required.length ? ` · 标签：${required.join('、')}` : ''}`, candidate.person.name);
            }
          }
        }
        for (const kind of ['tag-title', 'title', 'tags']) {
          for (const batch of batches.filter(batch => batch.kind === kind)) {
            const evidence = kind === 'tag-title' ? `名称 / 别名 · 标签：${batch.plan.tags.join('、')}` : kind === 'title' ? '名称 / 别名' : `标签：${words.join('、')}`;
            for (const item of batch.data) add(item, evidence);
          }
        }
        signal?.throwIfAborted();
        if (!merged.size && errors.length) throw errors[0];
        if (controller.signal.aborted) warnings.add('搜索超时，当前仅展示已读取的结果，可重试。');
        const result = { items: [...merged.values()], warnings: [...warnings], expires: now() + (errors.length ? 30000 : 300000) };
        cache.set(keyword, result);
        if (cache.size > 128) cache.delete(cache.keys().next().value);
        return page(result);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      }
    },
  };
}
