import { normalizeCoverUrl } from './cover.mjs';

export const CATEGORIES = [
  { key: 'long', label: '长篇漫画', english: 'THE LONG JOURNEY', hint: '陪你走过漫长岁月的故事' },
  { key: 'medium', label: '中篇漫画', english: 'JUST THE RIGHT LENGTH', hint: '在恰好的篇幅里，念念不忘' },
  { key: 'short', label: '短篇漫画', english: 'A BRIEF ENCOUNTER', hint: '短短一瞬，也能留下长久回响' },
  { key: 'doujin', label: '同人漫画', english: 'MADE WITH LOVE', hint: '因为热爱，而继续的故事' },
];
export function emptyState() {
  return { nickname: '', tagline: '', picks: Object.fromEntries(CATEGORIES.map(({ key }) => [key, null])) };
}
export function normalizeState(value) {
  const state = emptyState();
  if (!value || typeof value !== 'object') return state;
  state.nickname = String(value.nickname || '').slice(0, 20);
  state.tagline = String(value.tagline || '').slice(0, 45);
  for (const { key } of CATEGORIES) {
    const item = value.picks?.[key];
    if (item && typeof item.title === 'string' && item.title.trim()) {
      state.picks[key] = {
        title: item.title.slice(0, 70), author: String(item.author || '').slice(0, 50),
        note: String(item.note || '').slice(0, 80),
        cover: typeof item.cover === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(item.cover) ? item.cover : '',
        coverUrl: normalizeCoverUrl(item.coverUrl),
      };
    }
  }
  return state;
}
