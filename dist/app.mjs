import { CATEGORIES, emptyState, normalizeState } from './model.mjs';
import { createSearchEngine, parseQuery } from './search.mjs';
import { normalizeCoverUrl, coverSource, importCover } from './cover.mjs';

const $ = id => document.getElementById(id);
const storageKey = 'mangalist:picks:v1';
let state = emptyState();
try { state = normalizeState(JSON.parse(localStorage.getItem(storageKey))); } catch { /* A new or unavailable store starts empty. */ }
let activeKey = 'long';
let draft = null;
let coverPromise = Promise.resolve();
let coverRevision = 0;
let coverPending = false;
let manualCover = '';
let uploadPending = false;
let uploadRevision = 0;
let searchController;
let searchRevision = 0;
let searchDebounce;
let composing = false;
const searchEngine = createSearchEngine();
let toastTimer;
let renderRevision = 0;
let renderPromise = Promise.resolve();
const imageCache = new Map();
const canvas = $('poster');
const ctx = canvas.getContext('2d');
const font = '"M Saans Variable", "M Saans 600", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
const palette = { paper: '#ffffff', ink: '#000000', muted: '#717171', surface: '#f3f4f6', line: '#e5e7eb', dark: '#141414' };

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
  $('slots').replaceChildren(...CATEGORIES.map((category, index) => {
    const item = state.picks[category.key];
    const button = element('button', `slot${item ? ' filled' : ''}`);
    button.setAttribute('aria-label', `${category.label}：${item?.title || '尚未选择'}，点击编辑`);
    const top = element('span', 'slot-top');
    top.append(element('span', 'slot-number', `0${index + 1}`), element('span', 'slot-label', category.label));
    const copy = element('span', 'slot-copy');
    const media = element('span', 'slot-media');
    const source = coverSource(item);
    if (source) {
      const image = element('img'); image.alt = ''; image.referrerPolicy = 'no-referrer';
      image.addEventListener('error', () => media.replaceChildren(element('span', 'cover-fallback', '封面加载失败')), { once: true });
      image.src = source; media.append(image);
    } else media.textContent = item ? '漫' : '+';
    media.setAttribute('aria-hidden', 'true');
    copy.append(media, element('span', 'slot-title', item?.title || '选择漫画'));
    const action = element('span', 'slot-plus', item ? '↗' : '+');
    action.setAttribute('aria-hidden', 'true');
    button.append(top, copy, action);
    button.addEventListener('click', () => openPicker(category));
    return button;
  }));
  const count = Object.values(state.picks).filter(Boolean).length;
  $('progress').textContent = `${count} / 4 已选`;
  $('download').disabled = count === 0;
  const missing = CATEGORIES.filter(category => state.picks[category.key]?.coverUrl && !state.picks[category.key]?.cover);
  $('cover-warning').hidden = !missing.length;
  $('cover-warning').textContent = missing.length ? `${missing.map(category => category.label).join('、')}的封面暂不能加入下载图片。点击对应漫画上传封面，或使用文字封面下载。` : '';
}

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
}

function openPicker(category) {
  composing = false;
  activeKey = category.key;
  draft = state.picks[activeKey] ? { ...state.picks[activeKey] } : null;
  coverPromise = Promise.resolve();
  coverRevision++;
  coverPending = false;
  $('replace-cover').value = '';
  $('picker-title').textContent = `我的${category.label}`;
  $('picker-feedback').hidden = true;
  $('search-intent').hidden = true;
  $('results').setAttribute('aria-busy', 'false');
  $('results').replaceChildren();
  $('search-status').textContent = '支持书名片段、作者和题材搜索。';
  $('query').value = '';
  $('manual-form').reset();
  manualCover = '';
  uploadPending = false;
  uploadRevision++;
  $('upload-preview').hidden = true;
  showDraft();
  $('picker').showModal();
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

function describeIntent(query) {
  const intent = parseQuery(query);
  const parts = [];
  if (intent.genres.length) parts.push(`题材：${intent.genres.map(genre => genre.name).join('、')}`);
  if (intent.terms.length) parts.push(`书名 / 作者：${intent.terms.join('、')}`);
  $('search-intent').textContent = parts.join(' · ');
  $('search-intent').hidden = !parts.length;
}

async function runSearch() {
  clearTimeout(searchDebounce);
  const query = $('query').value.trim();
  if (!query) return;
  const revision = ++searchRevision;
  searchController?.abort();
  searchController = new AbortController();
  const controller = searchController;
  const timeout = setTimeout(() => controller.abort(), 30000);
  describeIntent(query);
  $('results').replaceChildren();
  $('results').setAttribute('aria-busy', 'true');
  $('search-status').textContent = '正在查询作品、作者与题材…';
  try {
    const { items, warnings } = await searchEngine.search(query, { signal: controller.signal });
    if (revision !== searchRevision) return;
    const message = items.length ? `找到 ${items.length} 部作品，点击选择。` : '暂无符合全部关键词的作品。试试减少关键词、换个名字，或手动添加。';
    $('search-status').textContent = `${message}${warnings.length ? ` ${warnings.join('；')}。` : ''}`;
    $('results').replaceChildren(...items.map(item => {
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
      copy.append(element('small', 'result-evidence', [...item.evidence, item.source].join(' · ')));
      button.append(copy, element('span', 'result-arrow', '＋'));
      button.addEventListener('click', () => { coverPromise = chooseResult(item, revision); });
      return button;
    }));
  } catch (error) {
    if (revision !== searchRevision) return;
    $('search-status').textContent = error.name === 'AbortError' ? '搜索超时，可以重试或手动添加。' : error.message === 'Failed to fetch' ? '暂时无法连接搜索服务，可以稍后重试或手动添加。' : error.message;
  } finally { clearTimeout(timeout); if (revision === searchRevision) $('results').setAttribute('aria-busy', 'false'); }
}

$('search-form').addEventListener('submit', event => { event.preventDefault(); runSearch(); });
$('search-example').addEventListener('click', () => { $('query').value = '百合 雪子'; runSearch(); });
function queueSearch() {
  clearTimeout(searchDebounce); searchRevision++; searchController?.abort();
  $('results').replaceChildren(); $('results').setAttribute('aria-busy', 'false');
  const query = $('query').value.trim();
  describeIntent(query);
  $('search-status').textContent = query ? '输入完成后自动搜索，也可点击搜索。' : '支持书名片段、作者和题材搜索。';
  if (!composing && query.length >= 2 && !$('search-panel').hidden) searchDebounce = setTimeout(runSearch, 700);
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
  if (!imageCache.has(source)) imageCache.set(source, new Promise(resolve => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = source;
  }));
  return imageCache.get(source);
}

function text(value, x, y, size, color = palette.ink, weight = 400) {
  ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.fillText(value, x, y);
}

function wrap(value, maxWidth, maxLines) {
  const lines = []; let current = '';
  for (const char of Array.from(value.replace(/\s+/g, ' '))) {
    if (ctx.measureText(current + char).width > maxWidth && current) { lines.push(current); current = char; } else current += char;
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

function fitText(value, x, y, size, width, color, weight = 400) {
  ctx.font = `${weight} ${size}px ${font}`;
  const [line = ''] = wrap(value, width, 1);
  text(line, x, y, size, color, weight);
}

function drawCover(image, x, y, w, h) {
  ctx.fillStyle = palette.surface; ctx.fillRect(x, y, w, h);
  if (image) {
    // Fit the full cover, with a muted matte instead of cropping the title.
    const scale = Math.min(w / image.width, h / image.height);
    const iw = image.width * scale, ih = image.height * scale;
    ctx.drawImage(image, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  } else {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = '#71717166'; ctx.lineWidth = 3;
    ctx.strokeRect(x + w / 2 - 43, y + h / 2 - 60, 86, 113);
    ctx.beginPath(); ctx.moveTo(x + w / 2 - 30, y + h / 2 - 60); ctx.lineTo(x + w / 2 - 30, y + h / 2 + 53); ctx.stroke();
    ctx.restore();
  }
}

async function drawPoster(revision, snapshot) {
  const images = await Promise.all(CATEGORIES.map(category => loadImage(snapshot.picks[category.key]?.cover)));
  if (revision !== renderRevision) return;
  ctx.fillStyle = palette.paper; ctx.fillRect(0, 0, 1200, 1500);
  text('漫画私藏', 78, 95, 28, palette.ink, 600);
  text('MangaList', 992, 92, 22, palette.muted);
  ctx.strokeStyle = palette.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(78, 122); ctx.lineTo(1122, 122); ctx.stroke();
  text('我的漫画偏爱', 78, 224, 80, palette.ink, 650);
  fitText(`${snapshot.nickname.trim() || '一位漫画爱好者'} 的四格私藏`, 80, 282, 25, 1040, palette.muted);
  fitText(snapshot.tagline.trim() || '人生很长，幸好还有漫画。', 80, 334, 23, 1040, palette.muted);
  CATEGORIES.forEach((category, index) => {
    const x = 78 + (index % 2) * 542;
    const y = 388 + Math.floor(index / 2) * 475;
    const item = snapshot.picks[category.key];
    ctx.fillStyle = palette.paper; ctx.fillRect(x, y, 502, 438);
    ctx.strokeStyle = palette.line; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, 500, 436);
    text(`0${index + 1}`, x + 19, y + 35, 19, palette.muted);
    text(category.label, x + 68, y + 35, 24, palette.ink, 600);
    drawCover(images[index], x + 18, y + 57, 466, 232);
    if (!item) {
      text('留给下一本心头好', x + 20, y + 332, 25, palette.muted, 500);
      text(category.hint, x + 20, y + 382, 19, palette.muted);
    } else {
      fitText(item.title, x + 20, y + 329, 27, 462, palette.ink, 600);
      if (item.author) fitText(item.author, x + 20, y + 358, 17, 462, palette.muted);
      ctx.font = `19px ${font}`;
      const lines = wrap(item.note || '这份喜欢，想与你分享。', 462, 2);
      lines.forEach((line, lineIndex) => text(line, x + 20, y + 391 + lineIndex * 27, 19, palette.muted));
    }
  });
  ctx.strokeStyle = palette.line; ctx.beginPath(); ctx.moveTo(78, 1382); ctx.lineTo(1122, 1382); ctx.stroke();
  text('每一份喜欢，都有自己的理由。', 78, 1432, 20, palette.muted);
  text('My manga, my picks.', 923, 1430, 18, palette.muted);
  canvas.setAttribute('aria-label', `${snapshot.nickname || '一位漫画爱好者'}的漫画推荐卡。${CATEGORIES.map(c => `${c.label}：${snapshot.picks[c.key]?.title || '未选择'}`).join('。')}`);
}

function schedulePoster() {
  const revision = ++renderRevision;
  const snapshot = structuredClone(state);
  renderPromise = drawPoster(revision, snapshot);
}

$('download').addEventListener('click', async () => {
  const button = $('download'); button.disabled = true;
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    schedulePoster();
    await renderPromise;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('图片生成失败，请重试。');
    const url = URL.createObjectURL(blob);
    const link = element('a'); link.href = url; link.download = '我的漫画私藏.png';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const missing = Object.values(state.picks).some(item => item?.coverUrl && !item.cover);
    toast(missing ? '推荐卡已下载；未准备好的在线封面使用文字封面，可上传图片后重新下载。' : '推荐卡已生成，正在下载。手机上也可以长按下载的图片保存。');
  } catch { toast('图片生成失败，请重试。'); }
  finally { button.disabled = !Object.values(state.picks).some(Boolean); }
});

$('preview-panel').open = window.matchMedia('(min-width: 900px)').matches;
renderSlots(); schedulePoster();
if (document.fonts?.ready) document.fonts.ready.then(schedulePoster);
