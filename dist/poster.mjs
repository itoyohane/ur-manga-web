import { getSlots } from './model.mjs';

export const POSTER_SIZE = { width: 1200, height: 1600 };
export const POSTER_PALETTE = {
  paper: '#fffcf6', ink: '#34302e', muted: '#776e65',
  pink: '#ad657b', line: '#e3dacd', soft: '#f7e7e9', accent: '#a45570',
};
const serif = '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif';
const sans = '"Satoshi", "PingFang SC", "Microsoft YaHei", sans-serif';
const script = '"Kaiti SC", "STKaiti", "KaiTi", ' + serif;

function setFont(ctx, size, weight = 400, italic = false, family = serif) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
}
function text(ctx, value, x, y, size, color = POSTER_PALETTE.ink, weight = 400, italic = false, family = serif) {
  setFont(ctx, size, weight, italic, family);
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}
function lines(ctx, value, width, limit) {
  const result = [];
  let current = '';
  for (const char of Array.from(String(value).replace(/\s+/g, ' ').trim())) {
    if (current && ctx.measureText(current + char).width > width) {
      result.push(current); current = char;
    } else current += char;
  }
  if (current) result.push(current);
  if (result.length > limit) {
    result.length = limit;
    const tail = Array.from(result[limit - 1]);
    while (tail.length && ctx.measureText(tail.join('') + '…').width > width) tail.pop();
    result[limit - 1] = tail.join('') + '…';
  }
  return result;
}
function rounded(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}
function rule(ctx, y) {
  ctx.strokeStyle = POSTER_PALETTE.line; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(64, y); ctx.lineTo(1136, y); ctx.stroke();
}
function cover(ctx, image, centerX, centerY, tilt, title) {
  const ratio = image ? image.width / image.height : 3 / 4;
  const height = Math.min(264, 380 / ratio);
  const width = height * ratio;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(tilt);
  // A small photographic paper edge; the whole uploaded cover remains visible.
  rounded(ctx, -width / 2 - 10, -height / 2 - 10, width + 20, height + 20, 5);
  ctx.shadowColor = '#73543b24'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.save();
  rounded(ctx, -width / 2, -height / 2, width, height, 3); ctx.clip();
  if (image) ctx.drawImage(image, -width / 2, -height / 2, width, height);
  else {
    ctx.fillStyle = POSTER_PALETTE.soft;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.textAlign = 'center';
    text(ctx, '漫画私藏', 0, -height / 2 + 34, 17, POSTER_PALETTE.accent, 400, false, sans);
    setFont(ctx, 27, 600);
    const copy = lines(ctx, title || '下一本心头好', width - 32, 4);
    copy.forEach((line, index) => text(ctx, line, 0, -17 * (copy.length - 1) + index * 34 + 10, 27, POSTER_PALETTE.accent, 600));
    text(ctx, 'MANGA COLLECTION', 0, height / 2 - 22, 10, POSTER_PALETTE.accent, 400, false, sans);
  }
  ctx.restore();
  ctx.restore();
}

export function drawRecommendation(ctx, snapshot, images = [], { tape } = {}) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = POSTER_PALETTE.paper;
  ctx.fillRect(0, 0, POSTER_SIZE.width, POSTER_SIZE.height);
  ctx.save();
  rounded(ctx, 0, 0, 1200, 1600, 24); ctx.clip();
  // Keep one tape detail. The exported card deliberately has no doodles or stamps.
  if (tape) ctx.drawImage(tape, 40, 170, 2100, 370, 900, 14, 184, 34);
  text(ctx, '我的漫画私藏', 66, 126, 72, POSTER_PALETTE.ink, 700, false, script);
  text(ctx, 'MangaList', 70, 180, 32, POSTER_PALETTE.pink, 400, true, serif);
  text(ctx, '那些喜欢的故事，', 800, 116, 23, POSTER_PALETTE.muted, 400, false, script);
  text(ctx, '是我留给生活的温柔注脚。', 800, 153, 23, POSTER_PALETTE.muted, 400, false, script);
  rule(ctx, 214);

  const slots = getSlots(snapshot);
  const rowHeight = 1228 / slots.length;
  slots.forEach((category, index) => {
    const rowTop = 228 + index * rowHeight;
    const y = rowTop + (rowHeight - 307) / 2;
    const right = index % 2 === 1;
    const x = right ? 82 : 520;
    const width = 590;
    const item = snapshot.picks[category.key];
    cover(ctx, images[index], right ? 944 : 264, y + 153, right ? .035 : -.035, item?.title);
    ctx.textAlign = 'left';
    text(ctx, `0${index + 1}`, x, y + 48, 44, POSTER_PALETTE.pink, 400, true);
    rounded(ctx, x + 74, y + 17, 102, 39, 8);
    ctx.fillStyle = POSTER_PALETTE.soft; ctx.fill();
    text(ctx, category.label.replace('漫画', ''), x + 95, y + 44, 25, POSTER_PALETTE.accent, 400, false, sans);

    const title = item?.title || '留给下一本心头好';
    setFont(ctx, 60, 700);
    let size = 60;
    if (ctx.measureText(title).width > width * 2) { size = 42; setFont(ctx, size, 600); }
    const titles = lines(ctx, title, width, 2);
    titles.forEach((line, lineIndex) => text(ctx, line, x,
      y + (titles.length === 1 ? 132 : 106 + lineIndex * 50),
      size, item ? POSTER_PALETTE.ink : POSTER_PALETTE.muted, 700));

    setFont(ctx, 30, 400, false, sans);
    const author = lines(ctx, `作者：${item?.author || (item ? '私藏推荐' : '等你来选')}`, width, 1)[0];
    text(ctx, author, x, y + 194, 30, POSTER_PALETTE.muted, 400, false, sans);
    setFont(ctx, 34, 400, false, script);
    const notes = lines(ctx, item ? item.note || '这份喜欢，想与你分享。' : category.hint, width, 2);
    notes.forEach((line, lineIndex) => text(ctx, line, x,
      y + (notes.length === 1 ? 256 : 243 + lineIndex * 35),
      34, POSTER_PALETTE.ink, 400, false, script));
    rule(ctx, rowTop + rowHeight);
  });

  ctx.textAlign = 'left';
  setFont(ctx, 31, 400, false, script);
  const tagline = lines(ctx, snapshot.tagline.trim() || '把喜欢的故事，认真收好。', 1068, 1)[0];
  text(ctx, tagline, 66, 1512, 31, POSTER_PALETTE.ink, 400, false, script);
  setFont(ctx, 24, 400, false, sans);
  const name = lines(ctx, `by: ${snapshot.nickname.trim() || '一位漫画爱好者'}`, 780, 1)[0];
  text(ctx, name, 68, 1562, 24, POSTER_PALETTE.muted, 400, false, sans);
  ctx.textAlign = 'right';
  text(ctx, '漫画私藏', 1134, 1562, 27, POSTER_PALETTE.ink, 400, false, script);
  ctx.restore();
  ctx.restore();
}
