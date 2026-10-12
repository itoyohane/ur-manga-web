import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, normalizeState } from '../dist/model.mjs';

test('restores four categories and ignores malformed stored picks', () => {
  const restored = normalizeState({ nickname: '读者', picks: { long: { title: '海贼王', cover: 'https://unsafe.invalid/image', note: '喜欢' }, short: { title: '' } } });
  assert.equal(restored.nickname, '读者');
  assert.equal(restored.picks.long.title, '海贼王');
  assert.equal(restored.picks.long.cover, '');
  assert.equal(restored.picks.short, null);
  assert.equal(Object.keys(restored.picks).length, 4);
  assert.deepEqual(normalizeState(null), emptyState());
});

test('retains local cover images and caps user text from saved data', () => {
  const restored = normalizeState({ nickname: 'a'.repeat(30), picks: { doujin: { title: 'b'.repeat(100), note: 'c'.repeat(100), cover: 'data:image/jpeg;base64,abcd' } } });
  assert.equal(restored.nickname.length, 20);
  assert.equal(restored.picks.doujin.title.length, 70);
  assert.equal(restored.picks.doujin.note.length, 80);
  assert.equal(restored.picks.doujin.cover, 'data:image/jpeg;base64,abcd');
});

