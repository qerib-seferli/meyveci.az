// ============================================================
// ENDİRİM KARTLARI CANVAS MODULU
// Endirim-karti.png şablonuna uyğun yekun versiya
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

const CARD_WIDTH = 1402;
const CARD_HEIGHT = 1122;

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
// KARTDAKI BÜTÜN KOORDİNATLAR
//
// X artır  → sağa gedir
// X azalt  → sola gedir
// Y artır  → aşağı gedir
// Y azalt  → yuxarı gedir
// W artır  → en böyüyür
// H artır  → hündürlük böyüyür
// FONT artır → yazı böyüyür
// ============================================================

const CARD_LAYOUT = {
  // ==========================================================
  // MƏHSUL ŞƏKLİ
  //
  // Şəkil PNG şablonundan ƏVVƏL çəkilir.
  // Şablondakı şəffaf sahənin altını tam doldurur.
  //
  // x azalt → şəkil sola gəlir
  // x artır → şəkil sağa gedir
  // y azalt → şəkil yuxarı qalxır
  // y artır → şəkil aşağı düşür
  // width artır → şəkil sahəsi sola doğru da böyüyür
  // height artır → şəkil sahəsi aşağıya doğru böyüyür
  // ==========================================================
  productImage: {
    x: 745,
    y: 57,
    width: 657,
    height: 748,

    // Şəkildə əsas məhsul sağdadırsa focusX artır.
    // Məhsul soldadırsa focusX azalt.
    // 0 = ən sol, 0.5 = orta, 1 = ən sağ
    focusX: 0.50,

    // 0 = ən yuxarı, 0.5 = orta, 1 = ən aşağı
    focusY: 0.50,

    brightness: 1.01,
    contrast: 1.03,
    saturation: 1.04,
  },

  // ==========================================================
  // MƏHSUL ADI
  // ==========================================================
  productName: {
    x: 100,             // artır → sağa, azalt → sola
    y: 335,             // artır → aşağı, azalt → yuxarı
    maxWidth: 395,      // artır → uzun ad üçün daha çox yer
    maxLines: 2,
    fontSize: 49,       // başlanğıc ölçü
    minFontSize: 29,    // bundan balaca olmayacaq
    lineHeight: 1.08,
  },

  // ==========================================================
  // VAHİD — kq, ədəd və s.
  // ==========================================================
  unit: {
    x: 102,
    gapAfterName: 50,   // məhsul adından aşağı məsafə
    fontSize: 31,
  },

  // ==========================================================
  // XÜSUSİYYƏTLƏR
  // ==========================================================
  features: {
    iconX: 120,         // ikonları sağa/sola çəkir
    textX: 164,         // yazıları sağa/sola çəkir
    startY: 500,        // birinci sətri aşağı/yuxarı çəkir
    gap: 62,            // sətirlər arasındakı məsafə
    textMaxWidth: 335,
    fontSize: 25,
    minFontSize: 18,
  },

  // ==========================================================
  // ENDİRİM FAİZİ — ULDUZUN İÇİ
  // ==========================================================
  percent: {
    centerX: 695,       // artır → sağa, azalt → sola
    y: 340,             // artır → aşağı, azalt → yuxarı
    maxWidth: 225,
    fontSize: 69,
    minFontSize: 44,

    labelY: 378,        // ENDİRİM yazısının yeri
    labelFontSize: 24,
  },

  // ==========================================================
  // KÖHNƏ QİYMƏT
  // ==========================================================
  oldPrice: {
    centerX: 622,
    y: 530,
    maxWidth: 275,
    fontSize: 48,
    minFontSize: 31,

    // Üstündən keçən çəhrayı xətt
    lineStartX: 490,
    lineStartY: 492,
    lineEndX: 752,
    lineEndY: 471,
    lineWidth: 7,
  },

  // ==========================================================
  // YENİ QİYMƏT
  //
  // Qiymət soldan başlayır.
  // Buna görə uzun qiymətlər sağa, məhsul şəklinin üzərinə
  // bir qədər keçə bilər və çox balacalaşmaz.
  // ==========================================================
  newPrice: {
    x: 475,             // artır → sağa, azalt → sola
    y: 665,             // artır → aşağı, azalt → yuxarı

    // Qiymətin istifadə edə biləcəyi sahə.
    // Artırsan uzun qiymət daha az kiçiləcək.
    maxWidth: 475,

    fontSize: 112,
    minFontSize: 82,

    // ₼ işarəsi rəqəmdən bir qədər balaca çəkilir
    currencyFontRatio: 0.56,
    currencyGap: 14,
  },

  // ==========================================================
  // BARKOD
  // ==========================================================
  barcode: {
    boxX: 905,          // bütün barkodu sağa/sola çəkir
    boxY: 855,          // bütün barkodu aşağı/yuxarı çəkir
    boxWidth: 415,
    boxHeight: 145,

    sidePadding: 25,
    topPadding: 14,

    barsHeight: 76,

    numberY: 124,       // boxY üzərinə əlavə olunur
    numberFontSize: 25,
    numberMinFontSize: 18,
  },
};


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
// SKU TƏMİZLƏMƏ
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
// SUPABASE-DƏN ENDİRİMLİ MƏHSULLAR
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
      await printSingleDiscountCanvas(
        button.dataset.id
      );
    });
  });
}


// ============================================================
// CANVAS ŞƏKİL YÜKLƏMƏ
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

  canvasImageCache.set(
    imageUrl,
    imagePromise
  );

  return imagePromise;
}


// ============================================================
// MƏHSULU ID İLƏ TAPMA
// ============================================================

function getDiscountProductById(id) {
  return discountCardsCache.find(
    (product) =>
      String(product.id) === String(id)
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

  if (!value) {
    return {
      fontSize: startSize,
      lines: [],
      height: 0,
    };
  }

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
        height:
          lines.length > 1
            ? (lines.length - 1) * lineHeight
            : 0,
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
    height: 0,
  };
}


// ============================================================
// ŞƏKLİ COVER FORMASINDA ÇƏKMƏ
//
// Şəkil sahəni tam doldurur.
// Boşluq qalmır.
// Proporsiya pozulmur.
// Artıq hissələr avtomatik kəsilir.
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

  const safeFocusX =
    Math.min(1, Math.max(0, focusX));

  const safeFocusY =
    Math.min(1, Math.max(0, focusY));

  if (imageRatio > boxRatio) {
    cropWidth =
      sourceHeight * boxRatio;

    cropX =
      (sourceWidth - cropWidth) *
      safeFocusX;
  } else {
    cropHeight =
      sourceWidth / boxRatio;

    cropY =
      (sourceHeight - cropHeight) *
      safeFocusY;
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
// KARTIN XARİCİNƏ ŞƏKİL DAŞMASIN DEYƏ ÜMUMİ MASKA
// ============================================================

function clipToCardShape(ctx) {
  ctx.beginPath();

  roundedRectPath(
    ctx,
    60,
    70,
    CARD_WIDTH - 120,
    CARD_HEIGHT - 140,
    82
  );

  ctx.clip();
}


// ============================================================
// MƏHSUL ŞƏKLİ OLMADIQDA FON
// ============================================================

function drawProductImageFallback(ctx) {
  const photo = CARD_LAYOUT.productImage;

  ctx.save();

  clipToCardShape(ctx);

  const gradient = ctx.createLinearGradient(
    photo.x,
    photo.y,
    photo.x,
    photo.y + photo.height
  );

  gradient.addColorStop(
    0,
    '#eef8df'
  );

  gradient.addColorStop(
    0.55,
    '#a8d77a'
  );

  gradient.addColorStop(
    1,
    '#599f3f'
  );

  ctx.fillStyle = gradient;

  ctx.fillRect(
    photo.x,
    photo.y,
    photo.width,
    photo.height
  );

  ctx.restore();
}


// ============================================================
// MƏHSUL ŞƏKLİNİ ÇƏKMƏ
//
// Şəkil əvvəl çəkilir.
// PNG şablonu sonra çəkildiyi üçün yarpaqlar və digər
// dekorlar məhsul şəklinin üzərində qalır.
// ============================================================

async function drawProductImage(ctx, product) {
  const photo = CARD_LAYOUT.productImage;

  if (!product.image_url) {
    drawProductImageFallback(ctx);
    return;
  }

  try {
    const productImage =
      await loadCanvasImage(
        product.image_url
      );

    ctx.save();

    // Şəkil kartın ümumi yumru sərhədindən kənara çıxmır
    clipToCardShape(ctx);

    ctx.filter = `
      brightness(${photo.brightness})
      contrast(${photo.contrast})
      saturate(${photo.saturation})
    `;

    drawImageCover(
      ctx,
      productImage,
      photo.x,
      photo.y,
      photo.width,
      photo.height,
      photo.focusX,
      photo.focusY
    );

    ctx.filter = 'none';

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
// XÜSUSİYYƏT İKONLARI
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
  maxWidth,
  fontSize,
  minFontSize
) {
  ctx.save();

  ctx.fillStyle =
    'rgba(255,255,255,0.68)';

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
    drawLeafIcon(
      ctx,
      iconX,
      iconY
    );
  }

  if (type === 'pin') {
    drawPinIcon(
      ctx,
      iconX,
      iconY
    );
  }

  if (type === 'shield') {
    drawShieldIcon(
      ctx,
      iconX,
      iconY
    );
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
    fontSize,
    minFontSize,
    '900'
  );

  ctx.restore();
}


// ============================================================
// CODE 128 BARKOD CƏDVƏLİ
//
// SKU 12 və ya 13 rəqəm olsa da olduğu kimi kodlanır.
// Heç bir əlavə yoxlama rəqəmi əlavə edilmir.
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
// CODE 128-B DƏYƏRLƏRİ
// ============================================================

function code128Values(value) {
  const text = String(value || '');

  if (!text) return [];

  const values = [];

  for (const character of text) {
    const charCode =
      character.charCodeAt(0);

    if (
      charCode < 32 ||
      charCode > 126
    ) {
      continue;
    }

    values.push(
      charCode - 32
    );
  }

  return values;
}


// ============================================================
// CODE 128 BARKODUNU ÇƏKMƏ
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

  const startCode = 104;

  let checksum = startCode;

  dataValues.forEach((code, index) => {
    checksum +=
      code * (index + 1);
  });

  checksum %= 103;

  const codes = [
    startCode,
    ...dataValues,
    checksum,
    106,
  ];

  const patterns = codes
    .map((code) =>
      CODE128_PATTERNS[code]
    )
    .filter(Boolean);

  if (!patterns.length) {
    return false;
  }

  const quietModules = 10;

  let totalModules =
    quietModules * 2;

  patterns.forEach((pattern) => {
    for (const digit of pattern) {
      totalModules += Number(digit);
    }
  });

  const moduleWidth =
    width / totalModules;

  let currentX =
    x + quietModules * moduleWidth;

  ctx.save();

  ctx.fillStyle = '#050505';

  patterns.forEach((pattern) => {
    let isBar = true;

    for (const digit of pattern) {
      const partWidth =
        Number(digit) * moduleWidth;

      if (isBar) {
        ctx.fillRect(
          currentX,
          y,
          Math.max(1, partWidth),
          height
        );
      }

      currentX += partWidth;
      isBar = !isBar;
    }
  });

  ctx.restore();

  return true;
}


// ============================================================
// BARKOD SAHƏSİ
// ============================================================

function drawBarcodeArea(ctx, sku) {
  const value = normalizeSku(sku);

  if (!value) return;

  const barcode =
    CARD_LAYOUT.barcode;

  const barsX =
    barcode.boxX +
    barcode.sidePadding;

  const barsY =
    barcode.boxY +
    barcode.topPadding;

  const barsWidth =
    barcode.boxWidth -
    barcode.sidePadding * 2;

  const success = drawCode128Barcode(
    ctx,
    value,
    barsX,
    barsY,
    barsWidth,
    barcode.barsHeight
  );

  if (!success) return;

  ctx.save();

  ctx.fillStyle = '#050505';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  drawTextFit(
    ctx,
    value,
    barcode.boxX +
      barcode.boxWidth / 2,
    barcode.boxY +
      barcode.numberY,
    barcode.boxWidth - 40,
    barcode.numberFontSize,
    barcode.numberMinFontSize,
    '700'
  );

  ctx.restore();
}


// ============================================================
// YENİ QİYMƏTİ ÇƏKMƏ
//
// Rəqəm və ₼ ayrı çəkilir.
// Uzun qiymətlər lazımsız dərəcədə balacalaşmır.
// ============================================================

function drawLargePrice(ctx, priceText) {
  const layout =
    CARD_LAYOUT.newPrice;

  let fontSize =
    layout.fontSize;

  const minFontSize =
    layout.minFontSize;

  ctx.save();

  ctx.fillStyle = '#050505';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.font =
    `1000 ${fontSize}px Inter, Arial, sans-serif`;

  while (
    ctx.measureText(priceText).width >
      layout.maxWidth &&
    fontSize > minFontSize
  ) {
    fontSize -= 2;

    ctx.font =
      `1000 ${fontSize}px Inter, Arial, sans-serif`;
  }

  ctx.fillText(
    priceText,
    layout.x,
    layout.y
  );

  const priceWidth =
    ctx.measureText(priceText).width;

  const currencyFontSize =
    Math.round(
      fontSize *
      layout.currencyFontRatio
    );

  ctx.font =
    `1000 ${currencyFontSize}px Inter, Arial, sans-serif`;

  ctx.fillText(
    '₼',
    layout.x +
      priceWidth +
      layout.currencyGap,
    layout.y
  );

  ctx.restore();
}


// ============================================================
// ƏSAS ENDİRİM KARTINI ÇƏKMƏ
// ============================================================

async function drawDiscountCanvas(
  canvas,
  product,
  originText = 'YERLİ FERMER'
) {
  if (!canvas || !product) return;

  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx =
    canvas.getContext('2d');

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
    String(
      product.unit || 'ədəd'
    ).trim();

  const sku =
    normalizeSku(product.sku);


  // ==========================================================
  // 1. MƏHSUL ŞƏKLİ
  // ==========================================================

  await drawProductImage(
    ctx,
    product
  );


  // ==========================================================
  // 2. PNG ŞABLON
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

  const nameLayout =
    CARD_LAYOUT.productName;

  ctx.save();

  ctx.fillStyle = '#050505';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const nameResult =
    drawWrappedTextFit(
      ctx,
      product.name,
      nameLayout.x,
      nameLayout.y,
      nameLayout.maxWidth,
      nameLayout.maxLines,
      nameLayout.fontSize,
      nameLayout.minFontSize,
      nameLayout.lineHeight,
      '950'
    );

  const nameBottom =
    nameLayout.y +
    (nameResult?.height || 0);


  // ==========================================================
  // 4. VAHİD
  // ==========================================================

  const unitLayout =
    CARD_LAYOUT.unit;

  ctx.fillStyle = '#111111';

  ctx.font =
    `500 ${unitLayout.fontSize}px Inter, Arial, sans-serif`;

  ctx.fillText(
    unit,
    unitLayout.x,
    nameBottom +
      unitLayout.gapAfterName
  );

  ctx.restore();


  // ==========================================================
  // 5. XÜSUSİYYƏTLƏR
  // ==========================================================

  const features =
    CARD_LAYOUT.features;

  drawFeatureRow(
    ctx,
    'leaf',
    'TƏBİİ VƏ TƏZƏ',
    features.iconX,
    features.startY - 8,
    features.textX,
    features.startY,
    features.textMaxWidth,
    features.fontSize,
    features.minFontSize
  );

  drawFeatureRow(
    ctx,
    'pin',
    originText,
    features.iconX,
    features.startY +
      features.gap - 8,
    features.textX,
    features.startY +
      features.gap,
    features.textMaxWidth,
    features.fontSize,
    features.minFontSize
  );

  drawFeatureRow(
    ctx,
    'shield',
    'KEYFİYYƏT ZƏMANƏTİ',
    features.iconX,
    features.startY +
      features.gap * 2 - 8,
    features.textX,
    features.startY +
      features.gap * 2,
    features.textMaxWidth,
    features.fontSize,
    features.minFontSize
  );


  // ==========================================================
  // 6. ENDİRİM FAİZİ
  // ==========================================================

  const percentLayout =
    CARD_LAYOUT.percent;

  ctx.save();

  ctx.fillStyle = '#d40861';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  drawTextFit(
    ctx,
    `-${percent}%`,
    percentLayout.centerX,
    percentLayout.y,
    percentLayout.maxWidth,
    percentLayout.fontSize,
    percentLayout.minFontSize,
    '1000'
  );

  ctx.font =
    `950 ${percentLayout.labelFontSize}px Inter, Arial, sans-serif`;

  ctx.fillText(
    'ENDİRİM',
    percentLayout.centerX,
    percentLayout.labelY
  );

  ctx.restore();


  // ==========================================================
  // 7. KÖHNƏ QİYMƏT
  // ==========================================================

  const oldLayout =
    CARD_LAYOUT.oldPrice;

  ctx.save();

  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  drawTextFit(
    ctx,
    `${oldPrice} ₼`,
    oldLayout.centerX,
    oldLayout.y,
    oldLayout.maxWidth,
    oldLayout.fontSize,
    oldLayout.minFontSize,
    '500'
  );

  ctx.strokeStyle = '#d40861';
  ctx.lineWidth =
    oldLayout.lineWidth;
  ctx.lineCap = 'round';

  ctx.beginPath();

  ctx.moveTo(
    oldLayout.lineStartX,
    oldLayout.lineStartY
  );

  ctx.lineTo(
    oldLayout.lineEndX,
    oldLayout.lineEndY
  );

  ctx.stroke();

  ctx.restore();


  // ==========================================================
  // 8. YENİ QİYMƏT
  // ==========================================================

  drawLargePrice(
    ctx,
    price
  );


  // ==========================================================
  // 9. BARKOD
  // ==========================================================

  drawBarcodeArea(
    ctx,
    sku
  );
}


// ============================================================
// TƏK KARTI ÇAP ETMƏ
// ============================================================

async function printSingleDiscountCanvas(id) {
  const productId =
    String(id);

  const canvas =
    document.querySelector(
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
    const canvas =
      document.querySelector(
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
