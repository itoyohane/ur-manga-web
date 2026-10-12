export function normalizeCoverUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim().replace(/^\/\//, 'https://'));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    url.protocol = 'https:';
    return url.href;
  } catch { return ''; }
}

export function coverSource(item) {
  if (typeof item?.cover === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(item.cover)) return item.cover;
  return normalizeCoverUrl(item?.coverUrl);
}

// Bangumi covers use the same-origin function so Canvas never reads a cross-origin image.
export async function importCover(source, resizeImage, { fetchImpl = globalThis.fetch, signal = AbortSignal.timeout(10000) } = {}) {
  const url = normalizeCoverUrl(source);
  if (!url) throw new Error('封面地址不可用。');
  const sources = new URL(url).hostname === 'lain.bgm.tv' ? [`/api/cover?url=${encodeURIComponent(url)}`, url] : [url];
  let lastError;
  for (const address of sources) {
    signal.throwIfAborted();
    try {
      const response = await fetchImpl(address, { signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
      if (!response.ok) throw new Error('封面暂时无法读取。');
      const blob = await response.blob();
      if (blob.size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new Error('封面格式或大小不受支持。');
      return await resizeImage(blob);
    } catch (error) {
      signal.throwIfAborted();
      lastError = error;
    }
  }
  throw lastError;
}
