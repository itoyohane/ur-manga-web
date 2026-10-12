import { CATEGORIES } from './model.mjs';

export const POSTER_SIZE = { width: 1200, height: 1600 };
export const POSTER_PALETTE = {
  paper: '#ffffff', ink: '#202020', muted: '#454545',
  pink: '#f58aa7', line: '#ffc0d3', soft: '#ffedf3', accent: '#ba345f',
};
const serif = '"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif';
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
      result.push(current);
      current = char;
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

function cover(ctx, image, centerX, centerY, tilt, title) {
  const ratio = image ? image.width / image.height : 3 / 4;
  const height = Math.min(320, 304 / ratio);
  const width = height * ratio;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(tilt);
  rounded(ctx, -width / 2, -height / 2, width, height, 10);
  ctx.shadowColor = '#6e324b24'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
  ctx.fillStyle = POSTER_PALETTE.soft; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.save();
  ctx.clip();
  if (image) {
    // Keep the entire image and its original aspect ratio inside the tilted book.
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
  } else {
    ctx.textAlign = 'center';
    text(ctx, '私 藏', 0, -height / 2 + 42, 20, POSTER_PALETTE.accent);
    setFont(ctx, 29, 600);
    const copy = lines(ctx, title || '下一本\n心头好', width - 40, 4);
    copy.forEach((line, index) => text(ctx, line, 0, -18 * (copy.length - 1) + index * 36 + 10, 29, POSTER_PALETTE.accent, 600));
    text(ctx, 'MANGA COLLECTION', 0, height / 2 - 28, 11, POSTER_PALETTE.accent);
  }
  ctx.restore();
  rounded(ctx, -width / 2, -height / 2, width, height, 10);
  ctx.strokeStyle = POSTER_PALETTE.line; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

function badge(ctx, label, x, y) {
  ctx.beginPath(); ctx.arc(x, y, 104, 0, Math.PI * 2);
  ctx.fillStyle = POSTER_PALETTE.pink; ctx.fill();
  ctx.textAlign = 'center';
  text(ctx, label, x, y + 23, 68, POSTER_PALETTE.paper, 400, true, script);
}

export function drawRecommendation(ctx, snapshot, images = []) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = POSTER_PALETTE.paper;
  ctx.fillRect(0, 0, POSTER_SIZE.width, POSTER_SIZE.height);
  const frame = { x: 14, y: 14, width: 1172, height: 1572, rowHeight: 365 };
  // Clip tilted books and all user content to the rounded outer frame.
  ctx.save();
  rounded(ctx, frame.x, frame.y, frame.width, frame.height, 22); ctx.clip();
  CATEGORIES.forEach((category, index) => {
    const y = frame.y + index * frame.rowHeight;
    const right = index % 2 === 1;
    const x = right ? 750 : 450;
    const width = 470;
    const item = snapshot.picks[category.key];
    cover(ctx, images[index], right ? 964 : 236, y + frame.rowHeight / 2, right ? .065 : -.065, item?.title);
    badge(ctx, category.label.replace('漫画', ''), right ? 150 : 1050, y + frame.rowHeight / 2);
    ctx.textAlign = right ? 'right' : 'left';
    text(ctx, `0${index + 1}`, x, y + 88, 56, POSTER_PALETTE.pink, 400, true);
    ctx.strokeStyle = POSTER_PALETTE.line; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + (right ? -158 : 76), y + 68);
    ctx.lineTo(x + (right ? -86 : 148), y + 68); ctx.stroke();

    const title = item?.title || '留给下一本心头好';
    setFont(ctx, 72, 600);
    let size = ctx.measureText(title).width <= width ? 72 : 52;
    setFont(ctx, size, 600);
    if (ctx.measureText(title).width > width * 2) { size = 42; setFont(ctx, size, 600); }
    const titles = lines(ctx, title, width, 2);
    titles.forEach((line, lineIndex) => text(ctx, line, x,
      y + (titles.length === 1 ? 176 : 142 + lineIndex * 52), size,
      item ? POSTER_PALETTE.ink : POSTER_PALETTE.muted, 600));

    setFont(ctx, 27);
    const author = lines(ctx, item?.author || (item ? '私藏推荐' : '等你来选'), width - 48, 1)[0];
    const pillWidth = Math.min(width, ctx.measureText(author).width + 48);
    rounded(ctx, right ? x - pillWidth : x, y + 210, pillWidth, 48, 24);
    ctx.fillStyle = POSTER_PALETTE.soft; ctx.fill();
    text(ctx, author, x + (right ? -24 : 24), y + 244, 27, POSTER_PALETTE.accent);

    setFont(ctx, 32);
    const notes = lines(ctx, item ? item.note || '这份喜欢，想与你分享。' : category.hint, width, 2);
    notes.forEach((line, lineIndex) => text(ctx, line, x,
      y + (notes.length === 1 ? 320 : 300 + lineIndex * 36), 32, POSTER_PALETTE.muted));
  });

  ctx.strokeStyle = POSTER_PALETTE.line; ctx.lineWidth = 2;
  for (let index = 1; index <= CATEGORIES.length; index++) {
    const y = frame.y + index * frame.rowHeight;
    ctx.beginPath(); ctx.moveTo(frame.x, y); ctx.lineTo(frame.x + frame.width, y); ctx.stroke();
  }
  ctx.textAlign = 'left';
  setFont(ctx, 44, 500);
  const tagline = lines(ctx, snapshot.tagline.trim() || '太好看了⑧', 920, 1)[0];
  text(ctx, tagline, 56, 1526, 44, POSTER_PALETTE.accent, 500);
  setFont(ctx, 30);
  const name = lines(ctx, `by: ${snapshot.nickname.trim() || '一位漫画爱好者'}`, 920, 1)[0];
  text(ctx, name, 58, 1565, 30, POSTER_PALETTE.accent);
  ctx.textAlign = 'right';
  text(ctx, '漫画私藏', 1144, 1527, 24, POSTER_PALETTE.accent);
  text(ctx, 'MangaList', 1144, 1563, 20, POSTER_PALETTE.pink);
  ctx.restore();
  rounded(ctx, frame.x, frame.y, frame.width, frame.height, 22);
  ctx.strokeStyle = POSTER_PALETTE.line; ctx.lineWidth = 5; ctx.stroke();
  ctx.restore();
}
