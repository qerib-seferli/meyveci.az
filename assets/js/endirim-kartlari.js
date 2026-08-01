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
const selectedDiscountCardIds = new Set();

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
    <label class="discount-select-card">
      <input type="checkbox" class="discount-card-check" data-id="${product.id}" ${selectedDiscountCardIds.has(String(product.id)) ? 'checked' : ''}>
      <span>Seç</span>
    </label>
  
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

  $$('.discount-card-check').forEach((input) => {
    input.addEventListener('change', () => {
      const id = String(input.dataset.id);
  
      if (input.checked) selectedDiscountCardIds.add(id);
      else selectedDiscountCardIds.delete(id);
    });
  });
  
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


// Yumru künclü düzbucaqlı yol yaradır
function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height
  );
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}


// JPG şəklini proporsiyasını pozmadan sahəyə yerləşdirir
function drawImageCover(ctx, img, x, y, width, height) {
  const imageRatio = img.naturalWidth / img.naturalHeight;
  const boxRatio = width / height;

  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = img.naturalWidth;
  let sourceHeight = img.naturalHeight;

  if (imageRatio > boxRatio) {
    // Şəkil daha enlidir — sağ və soldan kəsilir
    sourceWidth = img.naturalHeight * boxRatio;
    sourceX = (img.naturalWidth - sourceWidth) / 2;
  } else {
    // Şəkil daha hündürdür — yuxarı və aşağıdan kəsilir
    sourceHeight = img.naturalWidth / boxRatio;
    sourceY = (img.naturalHeight - sourceHeight) / 2;
  }

  ctx.drawImage(
    img,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height
  );
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

  // Kartın real ölçüsü
  const W = 1408;
  const H = 1024;

  ctx.clearRect(0, 0, W, H);

  // 1) Arxa fon PNG şablonu
  const bg = await loadCanvasImage(DISCOUNT_CARD_BG);
  ctx.drawImage(bg, 0, 0, W, H);

  // ============================================================
  // 2) MƏHSUL ŞƏKLİ
  // x: sağa-sola
  // y: yuxarı-aşağı
  // w: en
  // h: hündürlük
  // globalAlpha: şəffaflıq
  // ============================================================
if (product.image_url) {
  try {
    const productImg = await loadCanvasImage(product.image_url);

    // ==========================================================
    // JPG MƏHSUL ŞƏKLİ ÜÇÜN PRO FOTO VİTRİN
    // ==========================================================
    const imgX = 430;
    const imgY = 285;
    const imgW = 520;
    const imgH = 470;
    const imgRadius = 38;

    ctx.save();

    // Vitrinin arxasındakı yumşaq kölgə
    ctx.shadowColor = 'rgba(52, 83, 20, 0.30)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 18;

    roundedRectPath(
      ctx,
      imgX - 10,
      imgY - 10,
      imgW + 20,
      imgH + 20,
      imgRadius + 8
    );

    const frameGradient = ctx.createLinearGradient(
      imgX,
      imgY,
      imgX,
      imgY + imgH
    );

    frameGradient.addColorStop(0, 'rgba(255,255,255,0.98)');
    frameGradient.addColorStop(0.55, 'rgba(255,249,215,0.98)');
    frameGradient.addColorStop(1, 'rgba(239,194,45,0.98)');

    ctx.fillStyle = frameGradient;
    ctx.fill();

    ctx.restore();


    // Şəkli yumru çərçivənin daxilində saxlayırıq
    ctx.save();

    roundedRectPath(
      ctx,
      imgX,
      imgY,
      imgW,
      imgH,
      imgRadius
    );

    ctx.clip();

    // JPG şəkil artıq şəffaf olmayacaq
    ctx.globalAlpha = 1;

    // Rəng və kontrastı bir qədər yaxşılaşdırır
    ctx.filter = 'contrast(1.06) saturate(1.08) brightness(1.02)';

    // Şəkli dartmadan və proporsiyanı pozmadan yerləşdirir
    drawImageCover(
      ctx,
      productImg,
      imgX,
      imgY,
      imgW,
      imgH
    );

    ctx.filter = 'none';


    // Şəklin yuxarı hissəsinə çox zəif işıq effekti
    const topLight = ctx.createLinearGradient(
      imgX,
      imgY,
      imgX,
      imgY + 150
    );

    topLight.addColorStop(0, 'rgba(255,255,255,0.20)');
    topLight.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = topLight;
    ctx.fillRect(imgX, imgY, imgW, 150);


    // Şəklin aşağı hissəsini kartla yumşaq birləşdirir
    const bottomFade = ctx.createLinearGradient(
      imgX,
      imgY + imgH - 125,
      imgX,
      imgY + imgH
    );

    bottomFade.addColorStop(0, 'rgba(255,215,20,0)');
    bottomFade.addColorStop(1, 'rgba(255,215,20,0.22)');

    ctx.fillStyle = bottomFade;
    ctx.fillRect(
      imgX,
      imgY + imgH - 125,
      imgW,
      125
    );

    ctx.restore();


    // Vitrinin ağ-qızılı konturu
    ctx.save();

    roundedRectPath(
      ctx,
      imgX,
      imgY,
      imgW,
      imgH,
      imgRadius
    );

    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 7;
    ctx.stroke();

    roundedRectPath(
      ctx,
      imgX + 7,
      imgY + 7,
      imgW - 14,
      imgH - 14,
      imgRadius - 6
    );

    ctx.strokeStyle = 'rgba(232,177,0,0.38)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();

  } catch (error) {
    console.warn('Məhsul şəkli yüklənmədi:', error);
  }
}



  

  const percent = discountPercent(product.price, product.old_price);
  const price = Number(product.price || 0).toFixed(2);
  const oldPrice = Number(product.old_price || 0).toFixed(2);
  const unit = product.unit || 'ədəd';

  // ============================================================
  // 3) ENDİRİM FAİZİ - YAŞIL DAİRƏNİN İÇİ
  // percentX: sola-sağa
  // percentY: yuxarı-aşağı
  // ============================================================
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';

  const percentX = 1130; // sola çəkmək üçün azalt, sağa üçün artır
  const percentY = 245;  // yuxarı üçün azalt, aşağı üçün artır

  drawTextFit(ctx, `-${percent}%`, percentX, percentY, 150, 56, 34, '1000');

  ctx.font = '1000 20px Inter, Arial, sans-serif';
  ctx.fillText('ENDİRİM', percentX, percentY + 50);

  // ============================================================
  // 4) MƏHSUL ADI
  // nameX/nameY: məhsul adının yeri
  // font: məhsul adı ölçüsü
  // maxWidth: uzun adların sığacağı sahə
  // ============================================================
  ctx.fillStyle = '#050505';
  ctx.textAlign = 'left';

  ctx.font = '1000 54px Inter, Arial, sans-serif';

  const nameX = 140; // sola çəkmək üçün azalt, sağa üçün artır
  const nameY = 380; // yuxarı üçün azalt, aşağı üçün artır
  const nameMaxWidth = 390;
  const nameLineHeight = 58;

  drawTextFit(
    ctx,
    product.name,
    nameX,
    nameY,
    400, // maksimum en
    44,  // başlanğıc font
    38,  // minimum font
    '1000'
  );

  // ============================================================
  // 5) ÖLÇÜ VAHİDİ - kq, ədəd və s.
  // unitX/unitY: ölçü vahidinin yeri
  // ============================================================
  ctx.font = '500 32px Inter, Arial, sans-serif';

  const unitX = 140; // sola çəkmək üçün azalt
  const unitY = 440; // yuxarı üçün azalt

  ctx.fillText(unit, unitX, unitY);

  // ============================================================
  // 6) SOL XÜSUSİYYƏT YAZILARI
  // Bu yazılar ikonların qarşısında dayanır.
  // featureX: sağa-sola
  // featureY: ilk sətrin yeri
  // featureGap: sətirlər arası məsafə
  // ============================================================
  ctx.font = '1000 25px Inter, Arial, sans-serif';

  const featureX = 190; // sağa aparmaq üçün artır, sola üçün azalt
  const featureY = 550; // yuxarı qaldırmaq üçün azalt, aşağı üçün artır
  const featureGap = 52; // sətirlər arası məsafə

  ctx.fillText('TƏBİİ VƏ TƏZƏ', featureX, featureY);
  ctx.fillText(originText, featureX, featureY + featureGap);
  ctx.fillText('KEYFİYYƏT ZƏMANƏTİ', featureX, featureY + featureGap * 2);

  // ============================================================
  // 7) KÖHNƏ QİYMƏT
  // oldPriceX/oldPriceY: köhnə qiymətin yeri
  // ============================================================
  ctx.textAlign = 'right';
  ctx.fillStyle = '#050505';
  ctx.font = '500 70px Inter, Arial, sans-serif';

  const oldPriceX = 1260; // sola üçün azalt, sağa üçün artır
  const oldPriceY = 500;  // yuxarı üçün azalt, aşağı üçün artır

  ctx.fillText(`${oldPrice} ₼`, oldPriceX, oldPriceY);

  // ============================================================
  // 8) KÖHNƏ QİYMƏTİN ÜSTÜNDƏKİ XƏTT
  // moveTo və lineTo koordinatları ilə xətti oynada bilərsən.
  // ============================================================
  ctx.strokeStyle = '#d80a68';
  ctx.lineWidth = 8;
  ctx.beginPath();

  ctx.moveTo(965, 490);  // xəttin sol başlanğıcı
  ctx.lineTo(1280, 470); // xəttin sağ sonu

  ctx.stroke();

  // ============================================================
  // 9) YENİ BÖYÜK QİYMƏT
  // priceX/priceY: qiymətin yeri
  // font: qiymətin ölçüsü
  // ============================================================
  ctx.fillStyle = '#050505';
  ctx.font = '1000 172px Inter, Arial, sans-serif';

  const priceX = 1230; // sola çəkmək üçün azalt
  const priceY = 670;  // yuxarı qaldırmaq üçün azalt

  ctx.fillText(price, priceX, priceY);

  // ============================================================
  // 10) ₼ İŞARƏSİ
  // manatX/manatY: manat işarəsinin yeri
  // ============================================================
  ctx.font = '1000 62px Inter, Arial, sans-serif';

  const manatX = 1290; // sola üçün azalt, sağa üçün artır
  const manatY = 660;  // yuxarı üçün azalt, aşağı üçün artır

  ctx.fillText('₼', manatX, manatY);
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
          grid-template-columns: repeat(2, 99mm);
          gap: 2mm;
          justify-content: center;
          align-content: start;
        }

        img {
          width: 99mm;
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


export async function printSelectedDiscountCards() {
  await drawAllDiscountCanvases();

const selectedIds = [...selectedDiscountCardIds];

  if (!selectedIds.length) {
    toast('Çap üçün heç bir endirim kartı seçilməyib');
    return;
  }

  const canvases = selectedIds
    .map((id) => document.querySelector(`#discount-card-${CSS.escape(id)}`))
    .filter(Boolean);

  const images = canvases.map((canvas) => canvas.toDataURL('image/png'));

  const win = window.open('', '_blank');

  win.document.write(`
    <!DOCTYPE html>
    <html lang="az">
    <head>
      <meta charset="UTF-8">
      <title>Seçilmiş endirim kartları</title>
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
          grid-template-columns: repeat(2, 99mm);
          gap: 2mm;
          justify-content: center;
          align-content: start;
        }

        img {
          width: 99mm;
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

window.printSelectedDiscountCards = printSelectedDiscountCards;
