import test from 'node:test';
import assert from 'node:assert/strict';

test('selected covers survive a failed import and uploads cannot be replaced by a late online response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const globals = ['document', 'localStorage', 'window', 'fetch', 'Image', 'confirm'];
  const original = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const drawnImages = [];
  const canvasDraws = [];
  const exportedCanvases = [];
  const imagePositions = [];
  const surfaces = [];
  const frames = [];
  const labels = [];
  const transforms = [];
  const rotations = [];
  const circles = [];
  const penStates = [];
  let decodedCovers = 0;
  const pen = new Proxy({
    textAlign: 'left',
    save: () => penStates.push({ font: pen.font, textAlign: pen.textAlign, fillStyle: pen.fillStyle }),
    restore: () => Object.assign(pen, penStates.pop()),
    translate: (x, y) => transforms.push({ x, y }),
    rotate: angle => rotations.push(angle),
    arc: (...bounds) => circles.push(bounds),
    roundRect: (...bounds) => frames.push(bounds),
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
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { for (const node of this.children) node.parent = null; this.children = []; this.append(...nodes); }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(key, callback) { (this.events[key] ||= []).push(callback); }
    async fire(key, event = {}) { for (const callback of this.events[key] || []) await callback(event); }
    focus() {}
    reset() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.fire('close'); }
    getContext() {
      const canvas = this;
      return new Proxy(pen, { get(target, key) {
        if (key === 'drawImage') return (image, ...bounds) => {
          canvasDraws.push({ canvas, source: image.src });
          return target.drawImage(image, ...bounds);
        };
        return target[key];
      } });
    }
    toDataURL() { return `data:image/jpeg;base64,${Buffer.from(String(++decodedCovers)).toString('base64')}`; }
    toBlob(callback) {
      assert.ok(canvasDraws.filter(draw => draw.canvas === this).every(draw => !draw.source.startsWith('https:')), 'Simulate the browser rejecting PNG export from a tainted Canvas');
      exportedCanvases.push(this);
      callback(new Blob(['PNG bytes'], { type: 'image/png' }));
    }
    click() {}
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
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
  globalThis.confirm = () => true;
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
    if (source === url || source === `/api/cover?url=${encodeURIComponent(url)}`) return fetchCover();
    assert.ok(source.startsWith('https://api.bgm.tv/v0/search/'));
    assert.equal(options.method, 'POST');
    if (searchFails) throw new TypeError('Failed to fetch');
    if (source.includes('/persons') || JSON.parse(options.body).filter?.tag) return { ok: true, json: async () => ({ data: [], total: 0 }) };
    if (JSON.parse(options.body).keyword === '未收录') return { ok: true, json: async () => ({ data: [], total: 0 }) };
    if (JSON.parse(options.body).keyword === '多结果') {
      const offset = Number(new URL(source).searchParams.get('offset'));
      const all = Array.from({ length: 25 }, (_, index) => ({ id: index + 100, type: 1, name: `测试漫画${index + 1}` }));
      return { ok: true, json: async () => ({ data: all.slice(offset, offset + 20), total: 25 }) };
    }
    const data = { data: [{
      id: 1, type: 1, name: '测试漫画', platform: '漫画', tags: [],
      images: { large: url }, infobox: [{ key: '作者', value: '测试作者' }],
    }] };
    return { ok: true, json: async () => data };
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await import('../dist/app.mjs');
  await settle();
  assert.equal(byId('poster').width, 1200);
  assert.equal(byId('poster').height, 1600, 'Match the reference image’s 3:4 aspect ratio');
  assert.equal(byId('slots').children.length, 3);
  assert.equal(byId('progress').textContent, '0 / 3 已选');
  assert.deepEqual(transforms.slice(0, 3).map(({ x }) => x < 600), [true, false, true], 'Three book covers alternate sides');
  assert.deepEqual(rotations.slice(0, 3).map(angle => Math.sign(angle)), [-1, 1, -1], 'Books tilt in alternating directions');
  assert.equal(circles.length, 0, 'The journal uses quiet category labels instead of decorative circular seals');
  assert.deepEqual(labels.filter(label => label.value === '未分类').map(({ value }) => value), ['未分类', '未分类', '未分类']);
  const beforeAdd = transforms.length;
  await byId('add-slot').fire('click');
  await settle();
  assert.equal(byId('slots').children.length, 4);
  assert.equal(byId('add-slot').hidden, true);
  assert.equal(saved.slotCount, 4);
  assert.deepEqual(transforms.slice(beforeAdd).map(({ x }) => x < 600), [true, false, true, false], 'Adding a slot redraws the poster with four rows');
  await byId('add-slot').fire('click');
  assert.equal(byId('slots').children.length, 4, 'Never exceed four books');
  assert.ok(labels.some(label => label.value === 'by: 一位漫画爱好者' && label.y > 1500), 'The signature sits below all four categories');
  assert.equal(pen.textAlign, 'left', 'Reset alignment after painting mirrored rows');
  const search = async index => {
    await byId('slots').children[index].fire('click');
    byId('category').value = 'short';
    await byId('category').fire('change');
    byId('query').value = '测试漫画';
    await byId('search-form').fire('submit', { preventDefault() {} });
    await settle();
    assert.equal(byId('results').children.length, 1);
    await byId('results').children[0].fire('click');
    assert.equal(byId('selected-cover-wrap').children[0].src, url, 'Show the original cover before import finishes');
    await settle();
  };
  await search(0);
  assert.equal(saved.picks.long, null, 'Selecting a draft must not persist it before saving');
  assert.equal(saved.categories.long, '', 'Category changes remain drafts until saved');
  assert.match(byId('poster').attrs['aria-label'], /短篇漫画：测试漫画/, 'User category immediately appears in the live preview');
  assert.ok(canvasDraws.some(draw => draw.canvas === byId('poster') && draw.source === url), 'An online cover is painted immediately, before saving and even when import fails');
  const beforeNote = labels.length;
  byId('recommendation').value = '实时预览推荐语';
  await byId('recommendation').fire('input');
  await settle();
  assert.ok(labels.slice(beforeNote).some(label => label.value === '实时预览推荐语'));
  assert.match(byId('cover-status').textContent, /文字封面/);
  await byId('save').fire('click');
  await settle();
  assert.equal(saved.picks.long.coverUrl, url);
  assert.equal(saved.picks.long.cover, '');
  assert.equal(saved.categories.long, 'short');
  assert.equal(byId('slots').children[0].children[1].children[0].children[0].src, url);
  assert.equal(byId('cover-warning').hidden, false);
  await byId('download').fire('click');
  await settle();
  assert.equal(exportedCanvases.length, 1, 'PNG still downloads when only the live preview has an online cover');
  assert.notEqual(exportedCanvases[0], byId('poster'), 'PNG uses a fresh Canvas rather than the tainted display Canvas');
  assert.equal(canvasDraws.filter(draw => draw.canvas === exportedCanvases[0] && draw.source !== './assets/washi-tape.png').length, 0, 'Failed imports use a text cover for export');

  // A previously failed saved cover should recover on download without reselection.
  fetchCover = async () => ({ ok: true, blob: async () => new Blob(['online cover'], { type: 'image/jpeg' }) });
  await byId('download').fire('click');
  await settle();
  assert.match(saved.picks.long.cover, /^data:image\/jpeg;base64,/);
  assert.equal(byId('cover-warning').hidden, true);
  assert.ok(drawnImages.includes(saved.picks.long.cover), 'The recovered cover is drawn before PNG download');
  assert.ok(canvasDraws.some(draw => draw.canvas === exportedCanvases[1] && draw.source === saved.picks.long.cover), 'Recovered local covers are drawn on the export Canvas');

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
  assert.equal(saved.categories.medium, 'short', 'Two books may share a user-selected category');
  await settle();
  assert.ok(imagePositions.some(([, , width, height]) => height === 264 && Math.abs(width / height - 2 / 3) < .001), 'Tilted books preserve the full portrait cover’s aspect ratio');
  assert.ok(canvasDraws.filter(draw => exportedCanvases.includes(draw.canvas)).every(draw => !draw.source.startsWith('https:')));

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
  const lastRender = labels.findLastIndex(label => label.value === '我的漫画私藏');
  const content = labels.slice(Math.max(start, lastRender)).filter(label => label.x === 520 && /^(长|作者：作|荐)/.test(label.value));
  assert.equal(content.filter(label => label.value.startsWith('长')).length, 2);
  assert.equal(content.filter(label => label.value.startsWith('荐')).length, 2);
  assert.ok(content.some(label => label.value.endsWith('…')));
  assert.ok(content.every(label => label.width <= 590 && label.x + label.width <= 1110 && label.y > 842 && label.y < 1149), `Long content stays beside the cover, within its own row: ${JSON.stringify(content)}`);

  await byId('slots').children[3].fire('click');
  searchFails = true;
  byId('query').value = '另一个关键词';
  await byId('search-form').fire('submit', { preventDefault() {} });
  await settle();
  assert.equal(byId('results').children.length, 0);
  assert.match(byId('search-status').textContent, /无法连接/);
  assert.equal(byId('search-fallback').hidden, false);
  assert.equal(byId('results').attrs['aria-busy'], 'false');
  byId('picker').close();
  await settle();
  // A manual draft previews immediately; cancelling restores the persisted card.
  await byId('slots').children[3].fire('click');
  byId('category').value = 'doujin';
  await byId('category').fire('change');
  await byId('manual-tab').fire('click');
  byId('manual-title').value = '尚未保存的草稿';
  const beforeDraft = labels.length;
  await byId('manual-form').fire('submit', { preventDefault() {} });
  await settle();
  assert.ok(labels.slice(beforeDraft).some(label => label.value === '尚未保存的草稿'));
  const beforeCancel = labels.length;
  byId('picker').close();
  await settle();
  assert.ok(!labels.slice(beforeCancel).some(label => label.value === '尚未保存的草稿'));
  assert.equal(saved.picks.doujin, null, 'Cancelling a preview must not save the draft');
  assert.equal(saved.categories.doujin, '', 'Cancelling restores the saved category');
  assert.ok(!byId('poster').attrs['aria-label'].includes('同人漫画'));
  await byId('slots').children[3].fire('click');
  searchFails = false;
  byId('query').value = '未收录';
  await byId('search-form').fire('submit', { preventDefault() {} });
  await settle();
  assert.equal(byId('results').children.length, 0);
  assert.match(byId('search-status').textContent, /暂未找到/);
  assert.equal(byId('search-fallback').hidden, false, 'Empty results offer the Bangumi directory link');
  byId('query').value = '多结果';
  await byId('search-form').fire('submit', { preventDefault() {} });
  await settle();
  assert.equal(byId('results').children.length, 21, 'First result page includes a load-more action');
  assert.match(byId('results').children[20].textContent, /加载更多/);
  await byId('results').children[20].fire('click');
  await settle();
  assert.equal(byId('results').children.length, 25, 'Loading another page appends books and removes the exhausted action');
  assert.equal(byId('search-status').textContent, '', 'Successful searches do not display result counts or search limits');
  await byId('results').children[0].fire('click');
  await byId('save').fire('click');
  assert.equal(saved.picks.doujin.title, '测试漫画1', 'Previously rendered rows remain selectable after pagination');
  await byId('reset').fire('click');
  await settle();
  assert.equal(byId('slots').children.length, 3);
  assert.equal(byId('add-slot').hidden, false);
  assert.equal(byId('progress').textContent, '0 / 3 已选');
});
