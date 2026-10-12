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
  const imagePositions = [];
  const surfaces = [];
  const frames = [];
  const labels = [];
  let decodedCovers = 0;
  const pen = new Proxy({
    measureText: value => ({ width: Array.from(value).reduce((width, char) => width + (/[^\x00-\x7f]/.test(char) ? 1 : .55), 0) * (Number(pen.font?.match(/([\d.]+)px/)?.[1]) || 19) }),
    drawImage: (image, ...bounds) => { drawnImages.push(image.src); imagePositions.push(bounds); },
    fillRect: (...bounds) => surfaces.push(bounds),
    strokeRect: (...bounds) => frames.push(bounds),
    fillText: (value, x, y) => labels.push({ value, x, y, align: pen.textAlign, width: pen.measureText(value).width }),
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
  let searchFails = false;
  globalThis.fetch = async (source, options) => {
    if (source === url) return fetchCover();
    assert.equal(source, 'https://api.bgm.tv/v0/search/subjects?limit=24&offset=0');
    assert.equal(options.method, 'POST');
    if (searchFails) throw new TypeError('Failed to fetch');
    const data = { data: [{
      id: 1, type: 1, name: '测试漫画', platform: '漫画', tags: [],
      images: { large: url }, infobox: [{ key: '作者', value: '测试作者' }],
    }] };
    return { ok: true, json: async () => data };
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await import('../dist/app.mjs');
  await settle();
  assert.deepEqual(surfaces.slice(1, 5), [
    [96, 194, 168, 252], [936, 506, 168, 252],
    [96, 818, 168, 252], [936, 1130, 168, 252],
  ], 'Four portrait cover areas alternate left, right, left, right');
  assert.ok(frames.some(bounds => JSON.stringify(bounds) === JSON.stringify([64, 164, 1072, 1248])), 'One outer frame contains all four rows');
  assert.deepEqual(labels.filter(label => /^0[1-4]  \/  /.test(label.value)).map(({ x, y, align }) => ({ x, y, align })), [
    { x: 312, y: 213, align: 'left' }, { x: 888, y: 525, align: 'right' },
    { x: 312, y: 837, align: 'left' }, { x: 888, y: 1149, align: 'right' },
  ], 'Each row places its text opposite the portrait cover');
  assert.equal(pen.textAlign, 'left', 'Reset alignment after painting mirrored rows');
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
  await settle();
  assert.ok(imagePositions.some(([x, y, width, height]) => x === 96 && y === 194 && width === 168 && height === 252));
  assert.ok(imagePositions.some(([x, y, width, height]) => x === 936 && y === 506 && width === 168 && height === 252));
  assert.ok(drawnImages.every(source => !source.startsWith('https:')));

  // Max-length user content must remain inside a single horizontal row.
  await byId('slots').children[2].fire('click');
  await byId('manual-tab').fire('click');
  byId('manual-title').value = '长'.repeat(70);
  byId('manual-author').value = '作'.repeat(50);
  await byId('manual-form').fire('submit', { preventDefault() {} });
  byId('recommendation').value = '荐'.repeat(80);
  const start = labels.length;
  await byId('save').fire('click');
  await settle();
  const content = labels.slice(start).filter(label => /^[长作荐]/.test(label.value));
  assert.equal(content.filter(label => label.value.startsWith('长')).length, 2);
  assert.equal(content.filter(label => label.value.startsWith('荐')).length, 2);
  assert.ok(content.some(label => label.value.endsWith('…')));
  assert.ok(content.every(label => label.width <= 792 && label.x === 312 && label.y > 788 && label.y < 1100));

  await byId('slots').children[3].fire('click');
  searchFails = true;
  byId('query').value = '另一个关键词';
  await byId('search-form').fire('submit', { preventDefault() {} });
  await settle();
  assert.equal(byId('results').children.length, 0);
  assert.match(byId('search-status').textContent, /无法连接/);
  assert.equal(byId('results').attrs['aria-busy'], 'false');
  byId('picker').close();
});
