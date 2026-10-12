import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, normalizeState, getSlots } from '../dist/model.mjs';

test('restores four categories and ignores malformed stored picks', () => {
  const restored = normalizeState({ nickname: '读者', picks: { long: { title: '海贼王', cover: 'https://unsafe.invalid/image', note: '喜欢' }, short: { title: '' } } });
  assert.equal(restored.nickname, '读者');
  assert.equal(restored.picks.long.title, '海贼王');
  assert.equal(restored.picks.long.cover, '');
  assert.equal(restored.picks.short, null);
  assert.equal(Object.keys(restored.picks).length, 4);
  assert.equal(restored.slotCount, 3);
  assert.equal(restored.categories.long, 'long', 'Legacy selections retain their original category');
  assert.deepEqual(normalizeState(null), emptyState());
});

test('retains local cover images and caps user text from saved data', () => {
  const restored = normalizeState({ nickname: 'a'.repeat(30), picks: { doujin: { title: 'b'.repeat(100), note: 'c'.repeat(100), cover: 'data:image/jpeg;base64,abcd' } } });
  assert.equal(restored.nickname.length, 20);
  assert.equal(restored.picks.doujin.title.length, 70);
  assert.equal(restored.picks.doujin.note.length, 80);
  assert.equal(restored.picks.doujin.cover, 'data:image/jpeg;base64,abcd');
  assert.equal(restored.slotCount, 4, 'Keep an existing fourth book visible');
});

test('starts with three unclassified slots and restores independent, repeatable categories', () => {
  assert.deepEqual(getSlots(emptyState()).map(slot => slot.label), ['未分类', '未分类', '未分类']);
  const restored = normalizeState({ slotCount: 4, categories: { long: 'short', medium: 'short', short: 'invalid', doujin: 'long' } });
  assert.deepEqual(getSlots(restored).map(slot => slot.label), ['短篇漫画', '短篇漫画', '未分类', '长篇漫画']);
  assert.equal(normalizeState({ slotCount: 99 }).slotCount, 3);
});

