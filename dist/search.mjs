const SEARCH_URL = 'https://api.bgm.tv/v0/search/subjects?limit=24&offset=0';

function subjectResult(item) {
  const author = (item.infobox || []).filter(field => /^(作者|原作|作画|作畫)$/.test(field.key)).flatMap(field => {
    if (typeof field.value === 'string') return [field.value];
    return Array.isArray(field.value) ? field.value.map(value => typeof value === 'string' ? value : value?.v).filter(value => typeof value === 'string') : [];
  }).join(' / ');
  return {
    id: `bangumi:${item.id}`,
    title: item.name_cn || item.name || '',
    subtitle: item.name || '',
    author,
    coverUrl: item.images?.large || item.images?.common || '',
    source: 'Bangumi',
  };
}

export function createBangumiSearch({ fetch: fetcher = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  return {
    async search(query, { signal } = {}) {
      const keyword = String(query ?? '').trim();
      signal?.throwIfAborted();
      if (!keyword) return { items: [] };
      const cached = cache.get(keyword);
      if (cached && now() - cached.time < 300000) return { items: cached.items };
      const controller = new AbortController();
      const cancel = () => controller.abort(signal.reason);
      signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => controller.abort(new DOMException('Bangumi 查询超时，请重试或手动添加。', 'TimeoutError')), 10000);
      try {
        const response = await fetcher(SEARCH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword, sort: 'match', filter: { type: [1], nsfw: false } }),
          signal: controller.signal,
          credentials: 'omit',
        });
        if (!response.ok) throw new Error(response.status === 429 ? '搜索较频繁，请稍后再试。' : `Bangumi 暂时无法搜索（${response.status}），请稍后重试或手动添加。`);
        const data = await response.json();
        signal?.throwIfAborted();
        controller.signal.throwIfAborted();
        if (!Array.isArray(data?.data)) throw new Error('Bangumi 返回的数据无法读取，请稍后重试。');
        // The API supplies matching and ordering; only adapt fields for display.
        const items = data.data.map(subjectResult);
        cache.set(keyword, { items, time: now() });
        if (cache.size > 128) cache.delete(cache.keys().next().value);
        return { items };
      } catch (error) {
        signal?.throwIfAborted();
        if (controller.signal.aborted) throw controller.signal.reason;
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      }
    },
  };
}
