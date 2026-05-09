// ============================================================
// MEYVƏÇİ.AZ - ENDİRİM KARTLARI CANVAS MODULU
// Bu fayl endirimli məhsullar üçün kartları canvas ilə çəkir.
// ============================================================

import {
  $,
  $$,
  supabase,
  money,
  toast,
} from './core.js';

let discountCardsCache = [];

const DISCOUNT_CARD_BG = '../assets/img/fotolar/Endirim-karti.png';

const discountOriginOptions = [
  'YERLİ FERMER',
  'İDXAL',
  'İSTİXANA',
  'EKZOTİK',
  'SELEKSİYA',
  'ORQANİK',
];

function esc(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function discountPercent(price, oldPrice) {
  const p = Number(price || 0);
  const o = Number(oldPrice || 0);
  if (!p || !o || o <= p) return 0;
  return Math.round(((o - p) / o) * 100);
}

function discountOriginSelect(productId) {
  return `
    <select class="discount-origin-select" data-id="${productId}">
      ${discountOriginOptions.map((item) => `
        <option value="${esc(item)}">${esc(item)}</option>
      `).join('')}
    </select>
  `;
}

function renderDiscountCard(product) {
  return `
    <div class="discount-card-wrap" data-id="${product.id}">
      <div class="discount-card-admin-actions">
        ${discountOriginSelect(product.id)}
        <button type="button" class="btn btn-primary btn-mini print-discount-card" data-id="${product.id}">
          🖨️ Çap
        </button>
      </div>

      <div class="discount-canvas-box">
        <canvas
          class="discount-card-canvas"
          id="discount-card-${product.id}"
          width="1408"
          height="1024"
          data-id="${product.id}">
        </canvas>
      </div>
    </div>
  `;
}

export async function loadDiscountCards() {
  const grid = $('#discountCardsGrid');
  if (!grid) return;

  const search = ($('#discountCardSearch')?.value || '').trim().toLowerCase();

  const { data, error } = await supabase
    .from('products')
    .select('id,name,price,old_price,unit,status,image_url,categories(name)')
    .eq('status', 'active')
    .not('old_price', 'is', null)
    .order('name', { ascending: true })
    .limit(5000);

  if (error) {
    grid.innerHTML = `<div class="muted">${esc(error.message)}</div>`;
    return;
  }

  discountCardsCache = (data || []).filter((product) => {
    const isDiscount = Number(product.old_price || 0) > Number(product.price || 0);
    const matchSearch = !search || String(product.name || '').toLowerCase().includes(search);
    return isDiscount && matchSearch;
  });

  grid.innerHTML = discountCardsCache.map((product) => renderDiscountCard(product)).join('')
    || '<div class="muted">Endirimli məhsul yoxdur.</div>';

  bindDiscountCardEvents();
}

function bindDiscountCardEvents() {
  drawAllDiscountCanvases();

  $$('.discount-origin-select').forEach((select) => {
    select.addEventListener('change', () => {
      drawAllDiscountCanvases();
    });
  });

  $$('.print-discount-card').forEach((btn) => {
    btn.addEventListener('click', () => printSingleDiscountCanvas(btn.dataset.id));
  });
}

function loadCanvasImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = reject;

    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

function getDiscountProductById(id) {
  return discountCardsCache.find((product) => String(product.id) === String(id));
}

function getDiscountOriginValue(id) {
  return document.querySelector(`.discount-origin-select[data-id="${CSS.escape(id)}"]`)?.value || 'YERLİ FERMER';
}

async function drawAllDiscountCanvases() {
  const canvases = [...document.querySelectorAll('.discount-card-canvas')];

  for (const canvas of canvases) {
    const product = getDiscountProductById(canvas.dataset.id);
    if (product) {
      await drawDiscountCanvas(canvas, product, getDiscountOriginValue(product.id));
    }
  }
}

function drawTextFit(ctx, text, x, y, maxWidth, fontSize, minFontSize, fontWeight = '900') {
  let size = fontSize;
  ctx.font = `${fontWeight} ${size}px Inter, Arial, sans-serif`;

  while (ctx.measureText(text).width > maxWidth && size > minFontSize) {
    size -= 2;
    ctx.font = `${fontWeight} ${size}px Inter, Arial, sans-serif`;
  }

  ctx.fillText(text, x, y);
  return size;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || '').split(' ');
  let line = '';
  const lines = [];

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;

    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }

  if (line) lines.push(line);

  lines.slice(0, maxLines).forEach((item, index) => {
    ctx.fillText(item, x, y + index * lineHeight);
  });
}

async function drawDiscountCanvas(canvas, product, originText = 'YERLİ FERMER') {
  const ctx = canvas.getContext('2d');

  const W = 1408;
  const H = 1024;

  ctx.clearRect(0, 0, W, H);

  // Fon PNG
  const bg = await loadCanvasImage(DISCOUNT_CARD_BG);
  ctx.drawImage(bg, 0, 0, W, H);

  // Məhsul şəkli
  if (product.image_url) {
    try {
      const productImg = await loadCanvasImage(product.image_url);

      ctx.save();
      ctx.globalAlpha = 0.72;

      // Məhsul şəklinin yeri
      // x = sağa/sola, y = yuxarı/aşağı, width/height = ölçü
      ctx.drawImage(productImg, 455, 275, 355, 270);

      ctx.restore();
    } catch (error) {
      console.warn('Məhsul şəkli yüklənmədi:', error.message);
    }
  }

  const percent = discountPercent(product.price, product.old_price);
  const price = Number(product.price || 0).toFixed(2);
  const oldPrice = Number(product.old_price || 0).toFixed(2);
  const unit = product.unit || 'ədəd';

  // Endirim faizi
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  drawTextFit(ctx, `-${percent}%`, 1175, 265, 165, 56, 34, '1000');

  ctx.font = '1000 20px Inter, Arial, sans-serif';
  ctx.fillText('ENDİRİM', 1175, 315);

  // Məhsul adı
  ctx.fillStyle = '#050505';
  ctx.textAlign = 'left';
  ctx.font = '1000 54px Inter, Arial, sans-serif';
  wrapText(ctx, product.name, 118, 455, 395, 58, 2);

  // Ölçü vahidi
  ctx.font = '500 40px Inter, Arial, sans-serif';
  ctx.fillText(unit, 118, 555);

  // Sol xüsusiyyət yazıları
  ctx.font = '1000 25px Inter, Arial, sans-serif';
  ctx.fillText('TƏBİİ VƏ TƏZƏ', 205, 655);
  ctx.fillText(originText, 205, 710);
  ctx.fillText('KEYFİYYƏT ZƏMANƏTİ', 205, 765);

  // Köhnə qiymət
  ctx.textAlign = 'right';
  ctx.fillStyle = '#050505';
  ctx.font = '500 70px Inter, Arial, sans-serif';
  ctx.fillText(`${oldPrice} ₼`, 1260, 500);

  // Köhnə qiymət xətti
  ctx.strokeStyle = '#d80a68';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(930, 490);
  ctx.lineTo(1280, 470);
  ctx.stroke();

  // Yeni qiymət
  ctx.fillStyle = '#050505';
  ctx.font = '1000 150px Inter, Arial, sans-serif';
  ctx.fillText(price, 1250, 665);

  // ₼ işarəsi
  ctx.font = '1000 58px Inter, Arial, sans-serif';
  ctx.fillText('₼', 1325, 665);
}

function printSingleDiscountCanvas(id) {
  const canvas = document.querySelector(`#discount-card-${CSS.escape(id)}`);
  if (!canvas) return;

  const img = canvas.toDataURL('image/png');

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html lang="az">
    <head>
      <meta charset="UTF-8">
      <title>Endirim kartı</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 8mm;
        }

        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          background: #fff;
        }

        img {
          width: 180mm;
          height: auto;
          display: block;
        }
      </style>
    </head>
    <body>
      <img src="${img}" alt="Endirim kartı">
      <script>
        window.onload = () => window.print();
      <\/script>
    </body>
    </html>
  `);

  win.document.close();
}

export async function printAllDiscountCards() {
  await drawAllDiscountCanvases();

  const canvases = [...document.querySelectorAll('.discount-card-canvas')];

  if (!canvases.length) {
    toast('Çap üçün endirim kartı yoxdur');
    return;
  }

  const images = canvases.map((canvas) => canvas.toDataURL('image/png'));

  const win = window.open('', '_blank');

  win.document.write(`
    <!DOCTYPE html>
    <html lang="az">
    <head>
      <meta charset="UTF-8">
      <title>Toplu endirim kartları</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 7mm;
        }

        body {
          margin: 0;
          background: #fff;
        }

        .sheet {
          display: grid;
          grid-template-columns: repeat(2, 96mm);
          gap: 7mm;
          justify-content: center;
          align-content: start;
        }

        img {
          width: 96mm;
          height: auto;
          display: block;
          break-inside: avoid;
          page-break-inside: avoid;
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        ${images.map((src) => `<img src="${src}" alt="Endirim kartı">`).join('')}
      </div>

      <script>
        window.onload = () => window.print();
      <\/script>
    </body>
    </html>
  `);

  win.document.close();
}

// Admin.js bu funksiyaları görə bilsin deyə window-a bağlayırıq
window.loadDiscountCards = loadDiscountCards;
window.printAllDiscountCards = printAllDiscountCards;
