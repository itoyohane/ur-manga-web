import { normalizeCoverUrl } from './cover.mjs';

export const CATEGORIES = [
  { key: 'long', label: '长篇漫画', english: 'THE LONG JOURNEY', hint: '陪你走过漫长岁月的故事' },
  { key: 'medium', label: '中篇漫画', english: 'JUST THE RIGHT LENGTH', hint: '在恰好的篇幅里，念念不忘' },
  { key: 'short', label: '短篇漫画', english: 'A BRIEF ENCOUNTER', hint: '短短一瞬，也能留下长久回响' },
  { key: 'doujin', label: '同人漫画', english: 'MADE WITH LOVE', hint: '因为热爱，而继续的故事' },
];
export function emptyState() {
  return {
    nickname: '', tagline: '', slotCount: 3,
    // Keep stable storage keys so existing browser collections can be restored.
    categories: Object.fromEntries(CATEGORIES.map(({ key }) => [key, ''])),
    picks: Object.fromEntries(CATEGORIES.map(({ key }) => [key, null])),
  };
}
export function getSlots(state) {
  return CATEGORIES.slice(0, state.slotCount === 4 ? 4 : 3).map(({ key }) => {
    const category = CATEGORIES.find(category => category.key === state.categories?.[key]);
    return { key, label: category?.label || '未分类', hint: category?.hint || '类型由你选择，收好喜欢的故事' };
  });
}
export function normalizeState(value) {
  const state = emptyState();
  if (!value || typeof value !== 'object') return state;
  state.nickname = String(value.nickname || '').slice(0, 20);
  state.tagline = String(value.tagline || '').slice(0, 45);
  state.slotCount = value.slotCount === 4 ? 4 : 3;
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
    const category = value.categories?.[key];
    state.categories[key] = CATEGORIES.some(item => item.key === category) ? category : !value.categories && state.picks[key] ? key : '';
  }
  if (state.picks.doujin) state.slotCount = 4;
  return state;
}
