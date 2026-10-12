import test from 'node:test';
import assert from 'node:assert/strict';

test('selected covers survive a failed import and uploads cannot be replaced by a late online response', async t => {
  const globals = ['document', 'localStorage', 'window', 'fetch', 'Image'];
  const original = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const drawnImages = [];
  let decodedCovers = 0;
  const pen = new Proxy({
    measureText: value => ({ width: value.length * 19 }),
    drawImage: image => drawnImages.push(image.src),
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  class Element {
    constructor() {
      this.children = []; this.attrs = {}; this.events = {}; this.value = '';
      this.hidden = false; this.style = {}; this.files = [];
      this.classList = { add() {}, remove() {} };
    }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(key, callback) { (this.events[key] ||= []).push(callback); }
    async fire(key, event = {}) { for (const callback of this.events[key] || []) await callback(event); }
    focus() {}
    reset() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
    getContext() { return pen; }
    toDataURL() { return `data:image/jpeg;base64,${Buffer.from(String(++decodedCovers)).toString('base64')}`; }
  }
  const nodes = new Map();
  const byId = id => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  const tabs = new Element();
  globalThis.document = {
    getElementById: byId,
    createElement: () => new Element(),
    querySelector: () => tabs,
    querySelectorAll: () => ['search-tab', 'manual-tab'].map(id => { const node = byId(id); node.id = id; return node; }),
    body: new Element(),
  };
  let saved;
  globalThis.localStorage = { getItem: () => null, setItem: (key, value) => { saved = JSON.parse(value); } };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  globalThis.Image = class {
    width = 200;
    height = 300;
    set src(value) { this.source = value; queueMicrotask(() => this.onload?.()); }
    get src() { return this.source; }
  };
  const url = 'https://lain.bgm.tv/pic/cover/l/test.jpg';
  let fetchCover = async () => { throw new TypeError('Failed to fetch'); };
  globalThis.fetch = async source => {
    if (source === url) return fetchCover();
    const data = source.includes('/search/subjects') ? { data: [{
      id: 1, type: 1, name: '测试漫画', platform: '漫画', tags: [],
      images: { large: url }, infobox: [{ key: '作者', value: '测试作者' }],
    }] } : source.includes('graphql.anilist.co') ? { data: { titles: { media: [] }, authors: { staff: [] } } } : { data: [] };
    return { ok: true, json: async () => data };
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await import('../dist/app.mjs');
  await settle();
  const search = async index => {
    await byId('slots').children[index].fire('click');
    byId('query').value = '测试漫画';
    await byId('search-form').fire('submit', { preventDefault() {} });
    await settle();
    assert.equal(byId('results').children.length, 1);
    await byId('results').children[0].fire('click');
    assert.equal(byId('selected-cover-wrap').children[0].src, url, 'Show the original cover before import finishes');
    await settle();
  };
  await search(0);
  assert.match(byId('cover-status').textContent, /文字封面/);
  await byId('save').fire('click');
  await settle();
  assert.equal(saved.picks.long.coverUrl, url);
  assert.equal(saved.picks.long.cover, '');
  assert.equal(byId('slots').children[0].children[1].children[0].children[0].src, url);
  assert.equal(byId('cover-warning').hidden, false);
  assert.deepEqual(drawnImages, [], 'Unreadable remote images must never taint the export Canvas');

  await byId('slots').children[0].fire('click');
  byId('replace-cover').files = [new Blob(['uploaded image'], { type: 'image/jpeg' })];
  await byId('replace-cover').fire('change');
  // Save immediately to exercise waiting for the pending upload.
  await byId('save').fire('click');
  await settle();
  assert.match(saved.picks.long.cover, /^data:image\/jpeg;base64,/);
  assert.equal(byId('cover-warning').hidden, true);
  assert.ok(drawnImages.some(source => source === saved.picks.long.cover));

  let finishImport;
  fetchCover = () => new Promise(resolve => { finishImport = resolve; });
  await search(1);
  byId('replace-cover').files = [new Blob(['replacement'], { type: 'image/jpeg' })];
  await byId('replace-cover').fire('change');
  await settle();
  const uploaded = byId('selected-cover-wrap').children[0].src;
  finishImport({ ok: true, blob: async () => new Blob(['late online image'], { type: 'image/jpeg' }) });
  await settle();
  assert.equal(byId('selected-cover-wrap').children[0].src, uploaded, 'A late online import must not overwrite the uploaded preview');
  await byId('save').fire('click');
  assert.equal(saved.picks.medium.cover, uploaded);
  assert.ok(drawnImages.every(source => !source.startsWith('https:')));
});
