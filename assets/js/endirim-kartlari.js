// ============================================================
// MEYVƏÇİ.AZ - ENDİRİM KARTLARI CANVAS MODULU
// Yeni Endirim-karti.png şablonuna uyğun versiya
// Canvas ölçüsü: 1402 × 1122
// ============================================================

import {
  $,
  $$,
  supabase,
  toast,
} from './core.js';

let discountCardsCache = [];

const selectedDiscountCardIds = new Set();

const DISCOUNT_CARD_BG =
  '../assets/img/fotolar/Endirim-karti.png';

// Yeni PNG şablonun real ölçüsü
const CARD_WIDTH = 1402;
const CARD_HEIGHT = 1122;

// Şəkilləri təkrar-təkrar yükləməmək üçün keş
const canvasImageCache = new Map();

const discountOriginOptions = [
  'YERLİ FERMER',
  'İDXAL',
  'İSTİXANA',
  'EKZOTİK',
  'SELEKSİYA',
  'ORQANİK',
];


// ============================================================
// HTML TƏHLÜKƏSİZLİYİ
// ============================================================

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


// ============================================================
// ENDİRİM FAİZİ
// ============================================================

function discountPercent(price, oldPrice) {
  const currentPrice = Number(price || 0);
  const previousPrice = Number(oldPrice || 0);

  if (
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(previousPrice) ||
    currentPrice <= 0 ||
    previousPrice <= currentPrice
  ) {
    return 0;
  }

  return Math.round(
    ((previousPrice - currentPrice) / previousPrice) * 100
  );
}


// ============================================================
// QİYMƏT FORMATLAMA
// ============================================================

function formatPrice(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return '0.00';
  }

  return number.toFixed(2);
}


// ============================================================
// SKU / BARKOD KODUNU TƏMİZLƏMƏ
// ============================================================

function normalizeSku(value) {
  return String(value ?? '').trim();
}


// ============================================================
// MƏNŞƏ SEÇİMİ
// ============================================================

function discountOriginSelect(productId) {
  return `
    <select
      class="discount-origin-select"
      data-id="${esc(productId)}"
      aria-label="Məhsulun mənşəyi"
    >
      ${discountOriginOptions.map((item) => `
        <option value="${esc(item)}">
          ${esc(item)}
        </option>
      `).join('')}
    </select>
  `;
}


// ============================================================
// KARTIN HTML-İ
// ============================================================

function renderDiscountCard(product) {
  const productId = String(product.id);

  return `
    <div
      class="discount-card-wrap"
      data-id="${esc(productId)}"
    >
      <div class="discount-card-admin-actions">

        <label class="discount-select-card">
          <input
            type="checkbox"
            class="discount-card-check"
            data-id="${esc(productId)}"
            ${selectedDiscountCardIds.has(productId) ? 'checked' : ''}
          >
          <span>Seç</span>
        </label>

        ${discountOriginSelect(productId)}

        <button
          type="button"
          class="btn btn-primary btn-mini print-discount-card"
          data-id="${esc(productId)}"
        >
          🖨️ Çap
        </button>

      </div>

      <div class="discount-canvas-box">
        <canvas
          class="discount-card-canvas"
          id="discount-card-${esc(productId)}"
          width="${CARD_WIDTH}"
          height="${CARD_HEIGHT}"
          data-id="${esc(productId)}"
        ></canvas>
      </div>
    </div>
  `;
}


// ============================================================
// ENDİRİMLİ MƏHSULLARI SUPABASE-DƏN ÇƏKMƏ
// ============================================================

export async function loadDiscountCards() {
  const grid = $('#discountCardsGrid');

  if (!grid) return;

  const search = String(
    $('#discountCardSearch')?.value || ''
  )
    .trim()
    .toLowerCase();

  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      price,
      old_price,
      unit,
      status,
      image_url,
      sku,
      categories(name)
    `)
    .eq('status', 'active')
    .not('old_price', 'is', null)
    .order('name', { ascending: true })
    .limit(5000);

  if (error) {
    console.error('Endirim kartları yüklənmədi:', error);

    grid.innerHTML = `
      <div class="muted">
        ${esc(error.message)}
      </div>
    `;

    return;
  }

  discountCardsCache = (data || []).filter((product) => {
    const price = Number(product.price || 0);
    const oldPrice = Number(product.old_price || 0);

    const hasDiscount =
      Number.isFinite(price) &&
      Number.isFinite(oldPrice) &&
      oldPrice > price;

    const matchesSearch =
      !search ||
      String(product.name || '')
        .toLowerCase()
        .includes(search) ||
      String(product.sku || '')
        .toLowerCase()
        .includes(search);

    return hasDiscount && matchesSearch;
  });

  grid.innerHTML =
    discountCardsCache
      .map((product) => renderDiscountCard(product))
      .join('') ||
    '<div class="muted">Endirimli məhsul yoxdur.</div>';

  bindDiscountCardEvents();
}


// ============================================================
// HADİSƏLƏR
// ============================================================

function bindDiscountCardEvents() {
  drawAllDiscountCanvases();

  $$('.discount-card-check').forEach((input) => {
    input.addEventListener('change', () => {
      const id = String(input.dataset.id);

      if (input.checked) {
        selectedDiscountCardIds.add(id);
      } else {
        selectedDiscountCardIds.delete(id);
      }
    });
  });

  $$('.discount-origin-select').forEach((select) => {
    select.addEventListener('change', async () => {
      const productId = String(select.dataset.id);

      const canvas = document.querySelector(
        `#discount-card-${CSS.escape(productId)}`
      );

      const product = getDiscountProductById(productId);

      if (!canvas || !product) return;

      await drawDiscountCanvas(
        canvas,
        product,
        select.value
      );
    });
  });

  $$('.print-discount-card').forEach((button) => {
    button.addEventListener('click', async () => {
      await printSingleDiscountCanvas(button.dataset.id);
    });
  });
}


// ============================================================
// ŞƏKİL YÜKLƏMƏ
// ============================================================

function loadCanvasImage(src) {
  const imageUrl = String(src || '').trim();

  if (!imageUrl) {
    return Promise.reject(
      new Error('Şəkil ünvanı boşdur')
    );
  }

  if (canvasImageCache.has(imageUrl)) {
    return canvasImageCache.get(imageUrl);
  }

  const imagePromise = new Promise((resolve, reject) => {
    const image = new Image();

    image.crossOrigin = 'anonymous';

    image.onload = () => resolve(image);

    image.onerror = () => {
      canvasImageCache.delete(imageUrl);

      reject(
        new Error(`Şəkil yüklənmədi: ${imageUrl}`)
      );
    };

    image.src = imageUrl;
  });

  canvasImageCache.set(imageUrl, imagePromise);

  return imagePromise;
}


// ============================================================
// MƏHSULU ID İLƏ TAPMA
// ============================================================

function getDiscountProductById(id) {
  return discountCardsCache.find(
    (product) => String(product.id) === String(id)
  );
}


// ============================================================
// MƏNŞƏ DƏYƏRİNİ GÖTÜRMƏ
// ============================================================

function getDiscountOriginValue(id) {
  return document.querySelector(
    `.discount-origin-select[data-id="${CSS.escape(String(id))}"]`
  )?.value || 'YERLİ FERMER';
}


// ============================================================
// BÜTÜN CANVAS-LARI ÇƏKMƏ
// ============================================================

async function drawAllDiscountCanvases() {
  const canvases = [
    ...document.querySelectorAll(
      '.discount-card-canvas'
    ),
  ];

  for (const canvas of canvases) {
    const product = getDiscountProductById(
      canvas.dataset.id
    );

    if (!product) continue;

    try {
      await drawDiscountCanvas(
        canvas,
        product,
        getDiscountOriginValue(product.id)
      );
    } catch (error) {
      console.error(
        `Kart çəkilmədi: ${product.name}`,
        error
      );
    }
  }
}


// ============================================================
// YUMRU DÜZBUCAQLI YOL
// ============================================================

function roundedRectPath(
  ctx,
  x,
  y,
  width,
  height,
  radius
) {
  const r = Math.max(
    0,
    Math.min(radius, width / 2, height / 2)
  );

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);

  ctx.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + r
  );

  ctx.lineTo(
    x + width,
    y + height - r
  );

  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - r,
    y + height
  );

  ctx.lineTo(x + r, y + height);

  ctx.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - r
  );

  ctx.lineTo(x, y + r);

  ctx.quadraticCurveTo(
    x,
    y,
    x + r,
    y
  );

  ctx.closePath();
}


// ============================================================
// MƏTNİ ENƏ UYĞUN KIÇILTMА
// ============================================================

function drawTextFit(
  ctx,
  text,
  x,
  y,
  maxWidth,
  fontSize,
  minFontSize,
  fontWeight = '900',
  fontFamily = 'Inter, Arial, sans-serif'
) {
  const value = String(text ?? '');

  let size = fontSize;

  ctx.font =
    `${fontWeight} ${size}px ${fontFamily}`;

  while (
    ctx.measureText(value).width > maxWidth &&
    size > minFontSize
  ) {
    size -= 2;

    ctx.font =
      `${fontWeight} ${size}px ${fontFamily}`;
  }

  ctx.fillText(value, x, y);

  return size;
}


// ============================================================
// MƏTNİ SƏTRLƏRƏ BÖLƏRƏK ÇƏKMƏ
// ============================================================

function drawWrappedTextFit(
  ctx,
  text,
  x,
  y,
  maxWidth,
  maxLines = 2,
  startSize = 52,
  minSize = 32,
  lineHeightMultiplier = 1.08,
  fontWeight = '900'
) {
  const value = String(text || '').trim();

  if (!value) return;

  for (
    let fontSize = startSize;
    fontSize >= minSize;
    fontSize -= 2
  ) {
    ctx.font =
      `${fontWeight} ${fontSize}px Inter, Arial, sans-serif`;

    const words = value.split(/\s+/);
    const lines = [];

    let currentLine = '';

    for (const word of words) {
      const testLine =
        currentLine
          ? `${currentLine} ${word}`
          : word;

      if (
        ctx.measureText(testLine).width >
          maxWidth &&
        currentLine
      ) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    const fitsWidth = lines.every(
      (line) =>
        ctx.measureText(line).width <= maxWidth
    );

    if (
      fitsWidth &&
      lines.length <= maxLines
    ) {
      const lineHeight =
        fontSize * lineHeightMultiplier;

      lines.forEach((line, index) => {
        ctx.fillText(
          line,
          x,
          y + index * lineHeight
        );
      });

      return {
        fontSize,
        lines,
        height: lines.length * lineHeight,
      };
    }
  }

  drawTextFit(
    ctx,
    value,
    x,
    y,
    maxWidth,
    minSize,
    minSize,
    fontWeight
  );

  return {
    fontSize: minSize,
    lines: [value],
    height: minSize,
  };
}


// ============================================================
// ŞƏKLİ COVER FORMASINDA ÇƏKMƏ
// Proporsiya pozulmur, boşluq qalmır
// ============================================================

function drawImageCover(
  ctx,
  image,
  x,
  y,
  width,
  height,
  focusX = 0.5,
  focusY = 0.5
) {
  const sourceWidth =
    image.naturalWidth || image.width;

  const sourceHeight =
    image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) return;

  const imageRatio =
    sourceWidth / sourceHeight;

  const boxRatio =
    width / height;

  let cropX = 0;
  let cropY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;

  if (imageRatio > boxRatio) {
    cropWidth =
      sourceHeight * boxRatio;

    cropX =
      (sourceWidth - cropWidth) *
      Math.min(1, Math.max(0, focusX));
  } else {
    cropHeight =
      sourceWidth / boxRatio;

    cropY =
      (sourceHeight - cropHeight) *
      Math.min(1, Math.max(0, focusY));
  }

  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    x,
    y,
    width,
    height
  );
}


// ============================================================
// MƏHSUL ŞƏKLİ ÜÇÜN YUMŞAQ FON
// Şəkil yüklənməsə boş qara sahə qalmasın
// ============================================================

function drawProductImageFallback(ctx) {
  const imageX = 770;
  const imageY = 70;
  const imageWidth = 632;
  const imageHeight = 780;

  ctx.save();

  const gradient = ctx.createLinearGradient(
    imageX,
    imageY,
    imageX,
    imageY + imageHeight
  );

  gradient.addColorStop(
    0,
    '#dff7c7'
  );

  gradient.addColorStop(
    0.5,
    '#96cf66'
  );

  gradient.addColorStop(
    1,
    '#4e9d3a'
  );

  ctx.fillStyle = gradient;

  ctx.fillRect(
    imageX,
    imageY,
    imageWidth,
    imageHeight
  );

  ctx.restore();
}


// ============================================================
// MƏHSUL ŞƏKLİNİ SAĞ HİSSƏYƏ ÇƏKMƏ
// Şəkil şablondan əvvəl çəkilir.
// PNG yarpaqları və dekorlar şəklin üstündə qalır.
// ============================================================

async function drawProductImage(ctx, product) {
  const imageX = 770;
  const imageY = 70;
  const imageWidth = 632;
  const imageHeight = 780;

  if (!product.image_url) {
    drawProductImageFallback(ctx);
    return;
  }

  try {
    const productImage =
      await loadCanvasImage(product.image_url);

    ctx.save();

    // Şəkilin ətrafından kənara çıxmaması üçün
    // sağ sahəni yumşaq şəkildə kəsirik
    roundedRectPath(
      ctx,
      imageX,
      imageY,
      imageWidth,
      imageHeight,
      54
    );

    ctx.clip();

    ctx.filter =
      'contrast(1.04) saturate(1.06) brightness(1.01)';

    drawImageCover(
      ctx,
      productImage,
      imageX,
      imageY,
      imageWidth,
      imageHeight,
      0.5,
      0.5
    );

    ctx.filter = 'none';

    // Şəklin sol kənarında sarı fonla yumşaq keçid
    const leftFade =
      ctx.createLinearGradient(
        imageX,
        imageY,
        imageX + 150,
        imageY
      );

    leftFade.addColorStop(
      0,
      'rgba(245, 236, 42, 0.38)'
    );

    leftFade.addColorStop(
      1,
      'rgba(245, 236, 42, 0)'
    );

    ctx.fillStyle = leftFade;

    ctx.fillRect(
      imageX,
      imageY,
      150,
      imageHeight
    );

    // Aşağı hissəyə çox zəif kölgə
    const bottomShadow =
      ctx.createLinearGradient(
        imageX,
        imageY + imageHeight - 150,
        imageX,
        imageY + imageHeight
      );

    bottomShadow.addColorStop(
      0,
      'rgba(0,0,0,0)'
    );

    bottomShadow.addColorStop(
      1,
      'rgba(0,0,0,0.10)'
    );

    ctx.fillStyle = bottomShadow;

    ctx.fillRect(
      imageX,
      imageY + imageHeight - 150,
      imageWidth,
      150
    );

    ctx.restore();
  } catch (error) {
    console.warn(
      `Məhsul şəkli yüklənmədi: ${product.name}`,
      error
    );

    drawProductImageFallback(ctx);
  }
}


// ============================================================
// SOLDAKI XÜSUSİYYƏT İKONLARI
// ============================================================

function drawLeafIcon(ctx, centerX, centerY) {
  ctx.save();

  ctx.translate(centerX, centerY);
  ctx.rotate(-0.55);

  ctx.fillStyle = '#159447';

  ctx.beginPath();
  ctx.ellipse(
    0,
    0,
    13,
    23,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.strokeStyle =
    'rgba(255,255,255,0.9)';

  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(-1, 16);
  ctx.lineTo(2, -16);
  ctx.stroke();

  ctx.restore();
}


function drawPinIcon(ctx, centerX, centerY) {
  ctx.save();

  ctx.fillStyle = '#da075f';

  ctx.beginPath();
  ctx.arc(
    centerX,
    centerY - 7,
    14,
    Math.PI,
    0
  );

  ctx.lineTo(
    centerX,
    centerY + 21
  );

  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';

  ctx.beginPath();
  ctx.arc(
    centerX,
    centerY - 7,
    5,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.restore();
}


function drawShieldIcon(ctx, centerX, centerY) {
  ctx.save();

  ctx.fillStyle = '#149447';

  ctx.beginPath();

  ctx.moveTo(
    centerX,
    centerY - 23
  );

  ctx.lineTo(
    centerX + 19,
    centerY - 15
  );

  ctx.lineTo(
    centerX + 16,
    centerY + 10
  );

  ctx.quadraticCurveTo(
    centerX,
    centerY + 26,
    centerX,
    centerY + 26
  );

  ctx.quadraticCurveTo(
    centerX,
    centerY + 26,
    centerX - 16,
    centerY + 10
  );

  ctx.lineTo(
    centerX - 19,
    centerY - 15
  );

  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();

  ctx.moveTo(
    centerX - 9,
    centerY
  );

  ctx.lineTo(
    centerX - 2,
    centerY + 7
  );

  ctx.lineTo(
    centerX + 11,
    centerY - 8
  );

  ctx.stroke();

  ctx.restore();
}


// ============================================================
// XÜSUSİYYƏT SƏTRİ
// ============================================================

function drawFeatureRow(
  ctx,
  type,
  text,
  iconX,
  iconY,
  textX,
  textY,
  maxWidth
) {
  ctx.save();

  // İkonun arxasındakı çox zəif ağ dairə
  ctx.fillStyle =
    'rgba(255,255,255,0.66)';

  ctx.beginPath();

  ctx.arc(
    iconX,
    iconY,
    27,
    0,
    Math.PI * 2
  );

  ctx.fill();

  if (type === 'leaf') {
    drawLeafIcon(ctx, iconX, iconY);
  }

  if (type === 'pin') {
    drawPinIcon(ctx, iconX, iconY);
  }

  if (type === 'shield') {
    drawShieldIcon(ctx, iconX, iconY);
  }

  ctx.fillStyle = '#111111';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  drawTextFit(
    ctx,
    String(text || '').toUpperCase(),
    textX,
    textY,
    maxWidth,
    25,
    18,
    '900'
  );

  ctx.restore();
}


// ============================================================
// CODE 128-B BARKOD NÜMUNƏLƏRİ
// ============================================================

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223',
  '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212',
  '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212',
  '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321',
  '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331',
  '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113',
  '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122',
  '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211',
  '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212',
  '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121',
  '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];


// ============================================================
// CODE 128-B MƏLUMAT KODLARI
// ============================================================

function code128Values(value) {
  const text = String(value || '');

  if (!text) return [];

  const values = [];

  for (const character of text) {
    const charCode =
      character.charCodeAt(0);

    // Code 128-B yalnız ASCII 32–126
    if (
      charCode < 32 ||
      charCode > 126
    ) {
      continue;
    }

    values.push(charCode - 32);
  }

  return values;
}


// ============================================================
// CODE 128-B BARKOD ÇƏKMƏ
// ============================================================

function drawCode128Barcode(
  ctx,
  value,
  x,
  y,
  width,
  height
) {
  const text = normalizeSku(value);

  if (!text) return false;

  const dataValues =
    code128Values(text);

  if (!dataValues.length) {
    return false;
  }

  // Code Set B başlanğıcı
  const startCode = 104;

  let checksum = startCode;

  dataValues.forEach((code, index) => {
    checksum += code * (index + 1);
  });

  checksum %= 103;

  const codes = [
    startCode,
    ...dataValues,
    checksum,
    106,
  ];

  const patterns = codes
    .map((code) => CODE128_PATTERNS[code])
    .filter(Boolean);

  if (!patterns.length) {
    return false;
  }

  // Sol və sağ sakit sahə
  const quietModules = 10;

  let moduleCount =
    quietModules * 2;

  patterns.forEach((pattern) => {
    for (const digit of pattern) {
      moduleCount += Number(digit);
    }
  });

  const moduleWidth =
    width / moduleCount;

  let currentX =
    x + quietModules * moduleWidth;

  ctx.save();

  ctx.fillStyle = '#050505';

  patterns.forEach((pattern) => {
    let drawBar = true;

    for (const digit of pattern) {
      const modules = Number(digit);
      const barWidth =
        modules * moduleWidth;

      if (drawBar) {
        ctx.fillRect(
          currentX,
          y,
          Math.max(1, barWidth),
          height
        );
      }

      currentX += barWidth;
      drawBar = !drawBar;
    }
  });

  ctx.restore();

  return true;
}


// ============================================================
// BARKOD BLOKU
// ============================================================

function drawBarcodeArea(ctx, sku) {
  const barcodeValue =
    normalizeSku(sku);

  if (!barcodeValue) return;

  // PNG-dəki ağ sahənin içi
  const boxX = 928;
  const boxY = 874;
  const boxW = 404;

  const barcodeX = boxX + 18;
  const barcodeY = boxY + 10;
  const barcodeW = boxW - 36;
  const barcodeH = 82;

  drawCode128Barcode(
    ctx,
    barcodeValue,
    barcodeX,
    barcodeY,
    barcodeW,
    barcodeH
  );

  // Barkod rəqəmi
  ctx.save();

  ctx.fillStyle = '#050505';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  drawTextFit(
    ctx,
    barcodeValue,
    boxX + boxW / 2,
    boxY + 126,
    boxW - 30,
    28,
    19,
    '700'
  );

  ctx.restore();
}


// ============================================================
// ƏSAS ENDİRİM KARTININ ÇƏKİLMƏSİ
// ============================================================

async function drawDiscountCanvas(
  canvas,
  product,
  originText = 'YERLİ FERMER'
) {
  if (!canvas || !product) return;

  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  ctx.clearRect(
    0,
    0,
    CARD_WIDTH,
    CARD_HEIGHT
  );

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const percent = discountPercent(
    product.price,
    product.old_price
  );

  const price =
    formatPrice(product.price);

  const oldPrice =
    formatPrice(product.old_price);

  const unit =
    String(product.unit || 'ədəd').trim();

  const sku =
    normalizeSku(product.sku);

  // ==========================================================
  // 1. MƏHSUL ŞƏKLİ
  // Əvvəl çəkilir ki, PNG dekorları onun üstündə qalsın.
  // ==========================================================

  await drawProductImage(ctx, product);


  // ==========================================================
  // 2. PNG ŞABLON
  // Yarpaqlar, loqo, başlıq və ağ barkod sahəsi
  // məhsul şəklinin üstünə gəlir.
  // ==========================================================

  try {
    const background =
      await loadCanvasImage(
        DISCOUNT_CARD_BG
      );

    ctx.drawImage(
      background,
      0,
      0,
      CARD_WIDTH,
      CARD_HEIGHT
    );
  } catch (error) {
    console.error(
      'Endirim kartının fonu yüklənmədi:',
      error
    );
  }


  // ==========================================================
  // 3. MƏHSUL ADI
  // ==========================================================

  ctx.save();

  ctx.fillStyle = '#050505';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const nameResult =
    drawWrappedTextFit(
      ctx,
      product.name,
      118,
      350,
      385,
      2,
      50,
      31,
      1.08,
      '950'
    );

  const nameBottom =
    350 +
    Math.max(
      0,
      (nameResult?.lines?.length || 1) - 1
    ) *
    (nameResult?.fontSize || 40) *
    1.08;


  // ==========================================================
  // 4. ÖLÇÜ VAHİDİ
  // ==========================================================

  ctx.fillStyle = '#111111';
  ctx.font =
    '500 30px Inter, Arial, sans-serif';

  ctx.fillText(
    unit,
    120,
    nameBottom + 48
  );

  ctx.restore();


  // ==========================================================
  // 5. XÜSUSİYYƏTLƏR
  // ==========================================================

  const featureStartY = 510;
  const featureGap = 61;

  drawFeatureRow(
    ctx,
    'leaf',
    'TƏBİİ VƏ TƏZƏ',
    137,
    featureStartY - 8,
    178,
    featureStartY,
    310
  );

  drawFeatureRow(
    ctx,
    'pin',
    originText,
    137,
    featureStartY + featureGap - 8,
    178,
    featureStartY + featureGap,
    310
  );

  drawFeatureRow(
    ctx,
    'shield',
    'KEYFİYYƏT ZƏMANƏTİ',
    137,
    featureStartY + featureGap * 2 - 8,
    178,
    featureStartY + featureGap * 2,
    330
  );


  // ==========================================================
  // 6. ENDİRİM FAİZİ
  // Photoshop şablonundakı ulduz formasının içi
  // ==========================================================

  ctx.save();

  ctx.fillStyle = '#d40861';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  drawTextFit(
    ctx,
    `-${percent}%`,
    744,
    341,
    220,
    68,
    45,
    '1000'
  );

  ctx.font =
    '950 25px Inter, Arial, sans-serif';

  ctx.fillText(
    'ENDİRİM',
    744,
    385
  );

  ctx.restore();


  // ==========================================================
  // 7. KÖHNƏ QİYMƏT
  // ==========================================================

  ctx.save();

  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  drawTextFit(
    ctx,
    `${oldPrice} ₼`,
    632,
    520,
    280,
    53,
    37,
    '500'
  );

  // Köhnə qiymətin üstündən xətt
  ctx.strokeStyle = '#d40861';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';

  ctx.beginPath();

  ctx.moveTo(
    510,
    505
  );

  ctx.lineTo(
    754,
    482
  );

  ctx.stroke();

  ctx.restore();


  // ==========================================================
  // 8. YENİ QİYMƏT
  // Qiymət və manat işarəsi birlikdə avtomatik yerləşir
  // ==========================================================

  ctx.save();

  ctx.fillStyle = '#050505';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  drawTextFit(
    ctx,
    `${price} ₼`,
    630,
    684,
    390,
    119,
    75,
    '1000'
  );

  ctx.restore();


  // ==========================================================
  // 9. BARKOD
  // SKU: sözü yazılmır
  // Rəqəm barkodun altında göstərilir
  // ==========================================================

  drawBarcodeArea(ctx, sku);
}


// ============================================================
// TƏK KARTI ÇAP ETMƏ
// ============================================================

async function printSingleDiscountCanvas(id) {
  const productId = String(id);

  const canvas = document.querySelector(
    `#discount-card-${CSS.escape(productId)}`
  );

  if (!canvas) return;

  const product =
    getDiscountProductById(productId);

  if (product) {
    await drawDiscountCanvas(
      canvas,
      product,
      getDiscountOriginValue(productId)
    );
  }

  let imageData;

  try {
    imageData =
      canvas.toDataURL('image/png');
  } catch (error) {
    console.error(
      'Kart şəkilə çevrilmədi:',
      error
    );

    toast(
      'Kart hazırlanmadı. Məhsul şəklinin CORS icazəsini yoxlayın.'
    );

    return;
  }

  const printWindow =
    window.open('', '_blank');

  if (!printWindow) {
    toast(
      'Çap pəncərəsi bloklandı. Brauzerdə pop-up icazəsi verin.'
    );

    return;
  }

  printWindow.document.write(`
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

        html,
        body {
          margin: 0;
          padding: 0;
          background: #ffffff;
        }

        body {
          min-height: 100vh;
          display: grid;
          place-items: center;
        }

        img {
          display: block;
          width: 180mm;
          height: auto;
          max-width: 100%;
        }
      </style>
    </head>

    <body>
      <img
        src="${imageData}"
        alt="Endirim kartı"
      >

      <script>
        window.onload = function () {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();
}


// ============================================================
// BÜTÜN KARTLARI ÇAP ETMƏ
// ============================================================

export async function printAllDiscountCards() {
  await drawAllDiscountCanvases();

  const canvases = [
    ...document.querySelectorAll(
      '.discount-card-canvas'
    ),
  ];

  if (!canvases.length) {
    toast(
      'Çap üçün endirim kartı yoxdur'
    );

    return;
  }

  let images;

  try {
    images = canvases.map(
      (canvas) =>
        canvas.toDataURL('image/png')
    );
  } catch (error) {
    console.error(
      'Kartlar şəkilə çevrilmədi:',
      error
    );

    toast(
      'Kartlardan biri hazırlanmadı. Şəkil icazələrini yoxlayın.'
    );

    return;
  }

  openMultipleCardPrintWindow(
    images,
    'Toplu endirim kartları'
  );
}


// ============================================================
// SEÇİLMİŞ KARTLARI ÇAP ETMƏ
// ============================================================

export async function printSelectedDiscountCards() {
  const selectedIds = [
    ...selectedDiscountCardIds,
  ];

  if (!selectedIds.length) {
    toast(
      'Çap üçün heç bir endirim kartı seçilməyib'
    );

    return;
  }

  for (const id of selectedIds) {
    const canvas = document.querySelector(
      `#discount-card-${CSS.escape(id)}`
    );

    const product =
      getDiscountProductById(id);

    if (!canvas || !product) continue;

    await drawDiscountCanvas(
      canvas,
      product,
      getDiscountOriginValue(id)
    );
  }

  const canvases = selectedIds
    .map((id) =>
      document.querySelector(
        `#discount-card-${CSS.escape(id)}`
      )
    )
    .filter(Boolean);

  let images;

  try {
    images = canvases.map(
      (canvas) =>
        canvas.toDataURL('image/png')
    );
  } catch (error) {
    console.error(
      'Seçilmiş kartlar hazırlanmadı:',
      error
    );

    toast(
      'Seçilmiş kartlardan biri hazırlanmadı.'
    );

    return;
  }

  openMultipleCardPrintWindow(
    images,
    'Seçilmiş endirim kartları'
  );
}


// ============================================================
// TOPLU ÇAP PƏNCƏRƏSİ
// ============================================================

function openMultipleCardPrintWindow(
  images,
  title
) {
  const printWindow =
    window.open('', '_blank');

  if (!printWindow) {
    toast(
      'Çap pəncərəsi bloklandı. Brauzerdə pop-up icazəsi verin.'
    );

    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="az">
    <head>
      <meta charset="UTF-8">
      <title>${esc(title)}</title>

      <style>
        @page {
          size: A4 portrait;
          margin: 7mm;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          background: #ffffff;
        }

        .sheet {
          display: grid;
          grid-template-columns: repeat(2, 99mm);
          gap: 2mm;
          justify-content: center;
          align-content: start;
        }

        img {
          display: block;
          width: 99mm;
          height: auto;
          break-inside: avoid;
          page-break-inside: avoid;
        }
      </style>
    </head>

    <body>
      <div class="sheet">
        ${images.map((src) => `
          <img
            src="${src}"
            alt="Endirim kartı"
          >
        `).join('')}
      </div>

      <script>
        window.onload = function () {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();
}


// ============================================================
// ADMIN.JS ÜÇÜN WINDOW-A BAĞLAMA
// ============================================================

window.loadDiscountCards =
  loadDiscountCards;

window.printAllDiscountCards =
  printAllDiscountCards;

window.printSelectedDiscountCards =
  printSelectedDiscountCards;
