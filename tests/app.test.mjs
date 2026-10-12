import test from 'node:test';
import assert from 'node:assert/strict';

test('selected covers survive a failed import and uploads cannot be replaced by a late online response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const globals = ['document', 'localStorage', 'window', 'fetch', 'Image'];
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
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
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
    remove() {}
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
    if (source === url || source === `/api/cover?url=${encodeURIComponent(url)}`) return fetchCover();
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
  assert.equal(byId('poster').width, 1200);
  assert.equal(byId('poster').height, 1600, 'Match the reference image’s 3:4 aspect ratio');
  assert.deepEqual(transforms.slice(0, 4).map(({ x }) => x < 600), [true, false, true, false], 'Book covers alternate sides');
  assert.deepEqual(rotations.slice(0, 4).map(angle => Math.sign(angle)), [-1, 1, -1, 1], 'Books tilt in alternating directions');
  assert.ok(frames.some(([x, y, width, height, radius]) => x === 14 && y === 14 && width === 1172 && height === 1572 && radius === 22), 'The rounded frame contains rows and signature');
  assert.equal(circles.length, 4, 'Each category has its own circular seal');
  assert.deepEqual(labels.filter(label => /^0[1-4]$/.test(label.value)).map(({ align }) => align), ['left', 'right', 'left', 'right']);
  assert.ok(labels.some(label => label.value === 'by: 一位漫画爱好者' && label.y > 1500), 'The signature sits below all four categories');
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
  assert.equal(saved, undefined, 'Selecting a draft must not persist it before saving');
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
  assert.equal(byId('slots').children[0].children[1].children[0].children[0].src, url);
  assert.equal(byId('cover-warning').hidden, false);
  await byId('download').fire('click');
  await settle();
  assert.equal(exportedCanvases.length, 1, 'PNG still downloads when only the live preview has an online cover');
  assert.notEqual(exportedCanvases[0], byId('poster'), 'PNG uses a fresh Canvas rather than the tainted display Canvas');
  assert.equal(canvasDraws.filter(draw => draw.canvas === exportedCanvases[0]).length, 0, 'Failed imports use a text cover for export');

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
  await settle();
  assert.ok(imagePositions.some(([, , width, height]) => height === 320 && Math.abs(width / height - 2 / 3) < .001), 'Tilted books preserve the full portrait cover’s aspect ratio');
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
  const content = labels.slice(start).filter(label => (label.x === 450 || label.x === 474) && /^[长作荐]/.test(label.value));
  assert.equal(content.filter(label => label.value.startsWith('长')).length, 2);
  assert.equal(content.filter(label => label.value.startsWith('荐')).length, 2);
  assert.ok(content.some(label => label.value.endsWith('…')));
  assert.ok(content.every(label => label.width <= 470 && label.x + label.width <= 920 && label.y > 744 && label.y < 1109), 'Long content stays between the cover and category seal, within its own row');

  await byId('slots').children[3].fire('click');
  searchFails = true;
  byId('query').value = '另一个关键词';
  await byId('search-form').fire('submit', { preventDefault() {} });
  await settle();
  assert.equal(byId('results').children.length, 0);
  assert.match(byId('search-status').textContent, /无法连接/);
  assert.equal(byId('results').attrs['aria-busy'], 'false');
  byId('picker').close();
  await settle();
  // A manual draft previews immediately; cancelling restores the persisted card.
  await byId('slots').children[3].fire('click');
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
});
