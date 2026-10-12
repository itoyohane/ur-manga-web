import { CATEGORIES, emptyState, normalizeState, getSlots } from './model.mjs';
import { createBangumiSearch } from './search.mjs';
import { normalizeCoverUrl, coverSource, importCover } from './cover.mjs';
import { drawRecommendation, POSTER_PALETTE as palette, POSTER_SIZE } from './poster.mjs';

const $ = id => document.getElementById(id);
const storageKey = 'mangalist:picks:v1';
let state = emptyState();
try { state = normalizeState(JSON.parse(localStorage.getItem(storageKey))); } catch { /* A new or unavailable store starts empty. */ }
let activeKey = 'long';
let draft = null;
let draftCategory = '';
let coverPromise = Promise.resolve();
let coverRevision = 0;
let coverPending = false;
let manualCover = '';
let uploadPending = false;
let uploadRevision = 0;
let searchController;
let searchRevision = 0;
let searchDebounce;
let searchOffset = 0;
let searchIds = new Set();
let composing = false;
const bangumiSearch = createBangumiSearch();
let toastTimer;
let renderRevision = 0;
const imageCache = new Map();
const coverRecoveries = new Map();
let downloading = false;
const canvas = $('poster');
const ctx = canvas.getContext('2d');
canvas.width = POSTER_SIZE.width;
canvas.height = POSTER_SIZE.height;

function toast(message) {
  if ($('picker').open) {
    $('picker-feedback').textContent = message;
    $('picker-feedback').hidden = false;
    return;
  }
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4500);
}

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { toast('浏览器存储空间不足，当前卡片仍可下载，但无法自动保存。'); }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderSlots() {
  const slots = getSlots(state);
  $('slots').replaceChildren(...slots.map((category, index) => {
    const item = state.picks[category.key];
    const button = element('button', `slot${item ? ' filled' : ''}`);
    button.setAttribute('aria-label', `第 ${index + 1} 本，${category.label}：${item?.title || '尚未选择'}，点击编辑`);
    const top = element('span', 'slot-top');
    top.append(element('span', 'slot-number', `0${index + 1}`), element('span', 'slot-label', category.label.replace('漫画', '')));
    const copy = element('span', 'slot-copy');
    const media = element('span', 'slot-media');
    const source = coverSource(item);
    if (source) {
      const image = element('img'); image.alt = ''; image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => media.replaceChildren(element('span', 'cover-fallback', '封面加载失败')), { once: true });
      image.src = source; media.append(image);
    } else {
      const icon = element('img', 'empty-cover-icon');
      icon.src = './assets/book-open.svg'; icon.alt = '';
      media.append(icon);
    }
    media.setAttribute('aria-hidden', 'true');
    const details = element('span', 'slot-details');
    details.append(element('span', 'slot-title', item?.title || '选择漫画'));
    details.append(element('span', 'slot-author', item ? item.author || '私藏推荐' : '搜索或手动添加'));
    details.append(element('span', 'slot-note', item ? item.note || '写下你的推荐理由' : category.hint));
    copy.append(media, details);
    const action = element('img', 'slot-plus');
    action.src = item ? './assets/pencil-simple.svg' : './assets/plus.svg'; action.alt = '';
    action.setAttribute('aria-hidden', 'true');
    button.append(top, copy, action);
    button.addEventListener('click', () => openPicker(category));
    return button;
  }));
  const count = slots.filter(({ key }) => state.picks[key]).length;
  $('progress').textContent = `${count} / ${slots.length} 已选`;
  $('selection-count').textContent = `${count} / ${slots.length}`;
  $('add-slot').hidden = slots.length === 4;
  $('download').disabled = downloading || count === 0;
  const missing = slots.filter(category => state.picks[category.key]?.coverUrl && !state.picks[category.key]?.cover);
  $('cover-warning').hidden = !missing.length;
  $('cover-warning').textContent = missing.length ? `${missing.map(({ key }) => state.picks[key].title).join('、')}的封面暂不能加入下载图片。点击对应漫画上传封面，或使用文字封面下载。` : '';
}

$('add-slot').addEventListener('click', () => {
  if (state.slotCount >= 4) return;
  state.slotCount = 4;
  persist(); renderSlots(); schedulePoster();
});

$('category').replaceChildren(element('option', '', '选择类型（选填）'), ...CATEGORIES.map(category => {
  const option = element('option', '', category.label);
  option.value = category.key;
  return option;
}));
$('category').children[0].value = '';
$('category').addEventListener('change', () => {
  draftCategory = $('category').value;
  schedulePoster();
});

function showDraftCover() {
  if (!draft) return;
  const chosen = draft;
  const source = coverSource(chosen);
  const wrap = $('selected-cover-wrap');
  wrap.replaceChildren();
  if (source) {
    const image = element('img'); image.alt = `${chosen.title}的封面`; image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      if (draft !== chosen || wrap.children[0] !== image) return;
      wrap.replaceChildren(element('span', 'cover-fallback', '封面加载失败'));
      $('cover-status').textContent = '封面暂时无法显示，可以上传图片替换。';
    }, { once: true });
    image.src = source; wrap.append(image);
  } else wrap.append(element('span', 'cover-fallback', '暂无封面'));
  $('cover-status').textContent = coverPending ? '正在准备封面，完成后即可随推荐卡下载…' : chosen.cover ? '封面已就绪，可随推荐卡下载。' : chosen.coverUrl ? '在线封面可供显示；下载图片将使用文字封面。上传封面后即可一同下载。' : '这部作品暂无封面，可以上传图片。';
  schedulePoster();
}

function selectTab(mode) {
  if (mode === 'manual') {
    clearTimeout(searchDebounce); searchRevision++; searchController?.abort();
    $('results').setAttribute('aria-busy', 'false');
  }
  for (const name of ['search', 'manual']) {
    $(`${name}-tab`).setAttribute('aria-selected', String(mode === name));
    $(`${name}-tab`).tabIndex = mode === name ? 0 : -1;
    $(`${name}-panel`).hidden = mode !== name;
  }
}

function showDraft() {
  $('selected-editor').hidden = !draft;
  document.querySelector('.tabs').hidden = !!draft;
  $('search-panel').hidden = true;
  $('manual-panel').hidden = true;
  if (draft) {
    $('selected-name').textContent = draft.title;
    $('recommendation').value = draft.note || '';
    showDraftCover();
    $('remove').hidden = !state.picks[activeKey];
    $('recommendation').focus();
  } else selectTab('search');
  if (!draft) schedulePoster();
}

function openPicker(category) {
  composing = false;
  activeKey = category.key;
  draftCategory = state.categories[activeKey];
  $('category').value = draftCategory;
  draft = state.picks[activeKey] ? { ...state.picks[activeKey] } : null;
  coverPromise = Promise.resolve();
  coverRevision++;
  coverPending = false;
  $('replace-cover').value = '';
  $('picker-title').textContent = `第 ${getSlots(state).findIndex(slot => slot.key === activeKey) + 1} 本漫画`;
  $('picker-feedback').hidden = true;
  $('results').setAttribute('aria-busy', 'false');
  $('results').replaceChildren();
  $('search-status').textContent = '输入漫画名称或关键词开始搜索。';
  $('search-fallback').hidden = true;
  $('query').value = '';
  $('manual-form').reset();
  manualCover = '';
  uploadPending = false;
  uploadRevision++;
  $('upload-preview').hidden = true;
  showDraft();
  $('picker').showModal();
  schedulePoster();
  document.body.style.overflow = 'hidden';
  (draft ? $('recommendation') : $('query')).focus();
}

$('close').addEventListener('click', () => $('picker').close());
$('picker').addEventListener('close', () => {
  document.body.style.overflow = '';
  clearTimeout(searchDebounce);
  searchRevision++;
  searchController?.abort();
  uploadRevision++;
  coverRevision++;
  coverPending = false;
  schedulePoster();
});
$('search-tab').addEventListener('click', () => { selectTab('search'); $('query').focus(); });
$('manual-tab').addEventListener('click', () => { selectTab('manual'); $('manual-title').focus(); });
document.querySelectorAll('[role="tab"]').forEach(tab => tab.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? $('search-tab') : event.key === 'End' ? $('manual-tab') : tab.id === 'search-tab' ? $('manual-tab') : $('search-tab');
  selectTab(next.id === 'search-tab' ? 'search' : 'manual');
  next.focus();
}));
$('change').addEventListener('click', () => { draft = null; coverRevision++; coverPending = false; coverPromise = Promise.resolve(); $('replace-cover').value = ''; showDraft(); $('query').focus(); });
$('recommendation').addEventListener('input', () => {
  if (!draft) return;
  draft.note = $('recommendation').value.trim();
  schedulePoster();
});
$('save').addEventListener('click', async () => {
  if (!draft) return;
  const chosen = draft;
  const key = activeKey;
  $('save').disabled = true;
  $('save').textContent = '正在保存…';
  try {
    // If an upload replaces a pending online import, wait for the latest image operation.
    let pending;
    do { pending = coverPromise; await pending; } while (pending !== coverPromise);
    if (!$('picker').open || draft !== chosen || key !== activeKey) return;
    state.picks[key] = { ...chosen, note: $('recommendation').value.trim() };
    state.categories[key] = draftCategory;
    persist(); renderSlots(); schedulePoster(); $('picker').close();
  } finally { $('save').disabled = false; $('save').textContent = '保存选择'; }
});
$('remove').addEventListener('click', () => {
  state.picks[activeKey] = null;
  persist(); renderSlots(); schedulePoster(); $('picker').close();
});

for (const name of ['nickname', 'tagline']) {
  $(name).value = state[name];
  $(name).addEventListener('input', () => { state[name] = $(name).value; persist(); schedulePoster(); });
}
$('reset').addEventListener('click', () => {
  if (!confirm('清空已选漫画、署名和推荐语，重新开始？')) return;
  state = emptyState(); imageCache.clear();
  $('nickname').value = ''; $('tagline').value = '';
  persist(); renderSlots(); schedulePoster();
});

async function runSearch(append = false, refresh = false) {
  clearTimeout(searchDebounce);
  const query = $('query').value.trim();
  if (!query) return;
  const revision = ++searchRevision;
  searchController?.abort();
  searchController = new AbortController();
  const controller = searchController;
  const timeout = setTimeout(() => controller.abort(), 30000);
  if (!append) { searchOffset = 0; searchIds = new Set(); $('results').replaceChildren(); }
  $('results').setAttribute('aria-busy', 'true');
  $('search-fallback').hidden = true;
  $('search-status').textContent = '正在搜索…';
  try {
    const { items, nextOffset = null } = await bangumiSearch.search(query, { signal: controller.signal, offset: searchOffset, refresh });
    if (revision !== searchRevision) return;
    const fresh = items.filter(item => !searchIds.has(item.id));
    fresh.forEach(item => searchIds.add(item.id));
    $('search-status').textContent = searchIds.size ? '' : '暂未找到作品，试试其他关键词或手动添加。';
    $('search-fallback').hidden = false;
    const rows = fresh.map(item => {
      const button = element('button', 'result');
      const source = normalizeCoverUrl(item.coverUrl);
      if (source) {
        const img = element('img'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => img.replaceWith(element('span', 'result-placeholder', '漫')), { once: true });
        img.src = source;
        button.append(img);
      } else button.append(element('span', 'result-placeholder', '漫'));
      const copy = element('span', 'result-copy');
      copy.append(element('strong', '', item.title), element('small', '', item.author || item.subtitle));
      copy.append(element('small', 'result-source', [item.source, ...(item.evidence || [])].join(' · ')));
      const action = element('img', 'result-arrow ui-icon'); action.src = './assets/plus.svg'; action.alt = '';
      button.append(copy, action);
      button.addEventListener('click', () => { coverPromise = chooseResult(item, searchRevision); });
      return button;
    });
    if (append) $('results').append(...rows); else $('results').replaceChildren(...rows);
    if (nextOffset !== null) {
      const more = element('button', 'text-button', '加载更多作品');
      more.type = 'button';
      more.addEventListener('click', async () => {
        if (more.disabled) return;
        more.disabled = true;
        searchOffset = nextOffset;
        if (await runSearch(true)) more.remove(); else more.disabled = false;
      });
      $('results').append(more);
    }
    return true;
  } catch (error) {
    if (revision !== searchRevision) return;
    $('search-status').textContent = error.name === 'AbortError' ? '搜索超时，可以重试或手动添加。' : error.message === 'Failed to fetch' ? '暂时无法连接 Bangumi，可以稍后重试或手动添加。' : error.message;
    $('search-fallback').hidden = false;
    return false;
  } finally { clearTimeout(timeout); if (revision === searchRevision) $('results').setAttribute('aria-busy', 'false'); }
}

$('search-form').addEventListener('submit', event => { event.preventDefault(); runSearch(false, true); });
function queueSearch() {
  clearTimeout(searchDebounce); searchRevision++; searchController?.abort();
  $('results').replaceChildren(); $('results').setAttribute('aria-busy', 'false');
  $('search-fallback').hidden = true;
  const query = $('query').value.trim();
  $('search-status').textContent = query ? '输入完成后自动搜索，也可点击搜索。' : '输入漫画名称或关键词开始搜索。';
  if (!composing && query && !$('search-panel').hidden) searchDebounce = setTimeout(runSearch, 700);
}
$('query').addEventListener('compositionstart', () => { composing = true; clearTimeout(searchDebounce); searchRevision++; searchController?.abort(); });
$('query').addEventListener('compositionend', () => { composing = false; queueSearch(); });
$('query').addEventListener('input', () => { if (!composing) queueSearch(); });
async function chooseResult(item, revision) {
  // Display the original URL immediately; a failed export import must not erase it.
  draft = { title: item.title.slice(0, 70), author: item.author.slice(0, 50), note: '', cover: '', coverUrl: normalizeCoverUrl(item.coverUrl) };
  const chosenDraft = draft;
  const operation = ++coverRevision;
  coverPending = !!chosenDraft.coverUrl;
  showDraft();
  if (!chosenDraft.coverUrl) return;
  try {
    const cover = await importCover(chosenDraft.coverUrl, resizeImage);
    if (revision !== searchRevision || operation !== coverRevision || draft !== chosenDraft) return;
    chosenDraft.cover = cover;
  } catch {
    // The remote image remains available to ordinary image elements even when import fails.
  } finally {
    if (operation === coverRevision && draft === chosenDraft && $('picker').open) {
      coverPending = false;
      showDraftCover();
    }
  }
}

$('replace-cover').addEventListener('change', () => {
  const file = $('replace-cover').files[0];
  if (!file || !draft) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    toast('请选择 8 MB 以内的 JPG、PNG 或 WebP 图片。'); $('replace-cover').value = ''; return;
  }
  const chosen = draft;
  const operation = ++coverRevision;
  coverPending = true;
  showDraftCover();
  coverPromise = (async () => {
    try {
      const cover = await resizeImage(file);
      if (operation !== coverRevision || draft !== chosen) return;
      chosen.cover = cover;
    } catch (error) {
      if (operation === coverRevision && draft === chosen) toast(error.message);
    } finally {
      if (operation === coverRevision && draft === chosen && $('picker').open) {
        coverPending = false;
        showDraftCover();
      }
    }
  })();
});

function resizeImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        const buffer = document.createElement('canvas');
        buffer.width = Math.max(1, Math.round(img.width * scale)); buffer.height = Math.max(1, Math.round(img.height * scale));
        const pen = buffer.getContext('2d');
        pen.fillStyle = palette.paper; pen.fillRect(0, 0, buffer.width, buffer.height);
        pen.drawImage(img, 0, 0, buffer.width, buffer.height);
        resolve(buffer.toDataURL('image/jpeg', .85));
      } catch (error) { reject(error); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取这张图片，请换一张 JPG、PNG 或 WebP 图片。')); };
    img.src = url;
  });
}

$('cover').addEventListener('change', async () => {
  const revision = ++uploadRevision;
  const file = $('cover').files[0];
  manualCover = ''; $('upload-preview').hidden = true;
  if (!file) { uploadPending = false; return; }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    toast('请选择 8 MB 以内的 JPG、PNG 或 WebP 图片。'); $('cover').value = ''; uploadPending = false; return;
  }
  uploadPending = true;
  try {
    const cover = await resizeImage(file);
    if (revision !== uploadRevision) return;
    manualCover = cover; $('upload-preview').src = cover; $('upload-preview').hidden = false;
  } catch (error) { if (revision === uploadRevision) toast(error.message); }
  finally { if (revision === uploadRevision) uploadPending = false; }
});

$('manual-form').addEventListener('submit', event => {
  event.preventDefault();
  const title = $('manual-title').value.trim();
  if (!title) { $('manual-title').focus(); return; }
  if (uploadPending) { toast('封面正在处理中，请稍等片刻。'); return; }
  draft = { title, author: $('manual-author').value.trim(), cover: manualCover, note: '' };
  coverPromise = Promise.resolve();
  showDraft();
});

function loadImage(source) {
  if (!source) return Promise.resolve(null);
  if (!imageCache.has(source)) {
    const pending = new Promise(resolve => {
      const image = new Image();
      const timeout = setTimeout(() => finish(null), 10000);
      function finish(value) {
        clearTimeout(timeout);
        image.onload = null; image.onerror = null;
        resolve(value);
      }
      image.onload = () => finish(image); image.onerror = () => finish(null);
      image.referrerPolicy = 'no-referrer';
      image.src = source;
    });
    imageCache.set(source, pending);
    pending.then(image => { if (!image && imageCache.get(source) === pending) imageCache.delete(source); });
  }
  return imageCache.get(source);
}

async function drawPoster(revision, snapshot) {
  // Display-only Canvas may show remote images even when their pixels cannot be exported.
  const [images, tape] = await Promise.all([
    Promise.all(getSlots(snapshot).map(category => loadImage(coverSource(snapshot.picks[category.key])))),
    loadImage('./assets/washi-tape.png'),
  ]);
  if (revision !== renderRevision) return;
  drawRecommendation(ctx, snapshot, images, { tape });
  canvas.setAttribute('aria-label', `${snapshot.nickname || '一位漫画爱好者'}的漫画推荐卡。${getSlots(snapshot).map(c => `${c.label}：${snapshot.picks[c.key]?.title || '未选择'}`).join('。')}`);
}

function schedulePoster() {
  const revision = ++renderRevision;
  const snapshot = structuredClone(state);
  if ($('picker').open) {
    snapshot.categories[activeKey] = draftCategory;
    if (draft) snapshot.picks[activeKey] = { ...draft };
  }
  drawPoster(revision, snapshot);
}

async function recoverSavedCovers() {
  await Promise.all(getSlots(state).map(async ({ key }) => {
    const item = state.picks[key];
    if (!item?.coverUrl || item.cover) return;
    if (!coverRecoveries.has(item)) {
      coverRecoveries.set(item, (async () => {
        try {
          const cover = await importCover(item.coverUrl, resizeImage);
          // An edit or reset while fetching must keep its newer choice.
          if (state.picks[key] !== item || item.cover) return;
          item.cover = cover;
          persist(); renderSlots(); schedulePoster();
        } catch { /* Keep the original URL and the visible fallback notice. */ }
        finally { coverRecoveries.delete(item); }
      })());
    }
    await coverRecoveries.get(item);
  }));
}

$('download').addEventListener('click', async () => {
  if (downloading) return;
  downloading = true;
  const button = $('download'); button.disabled = true;
  try {
    await recoverSavedCovers();
    if (document.fonts?.ready) await document.fonts.ready;
    schedulePoster();
    // Use a fresh Canvas containing only readable local images; never export the display Canvas.
    const output = document.createElement('canvas');
    output.width = POSTER_SIZE.width; output.height = POSTER_SIZE.height;
    const snapshot = structuredClone(state);
    const [images, tape] = await Promise.all([
      Promise.all(getSlots(snapshot).map(category => loadImage(snapshot.picks[category.key]?.cover))),
      loadImage('./assets/washi-tape.png'),
    ]);
    drawRecommendation(output.getContext('2d'), snapshot, images, { tape });
    const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('图片生成失败，请重试。');
    const url = URL.createObjectURL(blob);
    const link = element('a'); link.href = url; link.download = '我的漫画私藏.png';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const missing = Object.values(state.picks).some(item => item?.coverUrl && !item.cover);
    toast(missing ? '推荐卡已下载；未准备好的在线封面使用文字封面，可上传图片后重新下载。' : '推荐卡已生成，正在下载。手机上也可以长按下载的图片保存。');
  } catch { toast('图片生成失败，请重试。'); }
  finally { downloading = false; button.disabled = !Object.values(state.picks).some(Boolean); }
});

renderSlots(); schedulePoster();
recoverSavedCovers();
if (document.fonts?.ready) document.fonts.ready.then(schedulePoster);
