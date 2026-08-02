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

const selectedDiscountCardIds =
  new Set();

/* ============================================================
   ENDİRİM KARTLARI — 15-LİK SƏHİFƏLƏMƏ
   ============================================================ */

const DISCOUNT_PAGE_SIZE = 15;

/*
  Sorğuda old_price > price müqayisəsini hazırkı
  strukturda brauzerdə yoxladığımız üçün bir dəfəyə
  45 sətir oxuyuruq və onların içindən 15 endirimli
  məhsulu seçirik.
*/
const DISCOUNT_FETCH_CHUNK = 45;

let discountRawOffset = 0;
let discountHasMore = true;
let discountIsLoading = false;
let discountObserver = null;
let discountSearchTimer = null;
let discountRequestToken = 0;

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
    x: 695,
    y: 75,
    width: 650,
    height: 750,

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
    startY: 530,        // birinci sətri aşağı/yuxarı çəkir
    gap: 62,            // sətirlər arasındakı məsafə
    textMaxWidth: 335,
    fontSize: 25,
    minFontSize: 18,
  },

  // ==========================================================
  // ENDİRİM FAİZİ — ULDUZUN İÇİ
  // ==========================================================
  percent: {
    centerX: 710,       // artır → sağa, azalt → sola
    y: 380,             // artır → aşağı, azalt → yuxarı
    maxWidth: 225,
    fontSize: 69,
    minFontSize: 44,

            // labelY: 398,        // ENDİRİM yazısının yeri
            // labelFontSize: 24,
  },

  // ==========================================================
  // KÖHNƏ QİYMƏT
  // ==========================================================
  oldPrice: {
    centerX: 622,
    y: 560,
    maxWidth: 275,
    fontSize: 48,
    minFontSize: 31,

    // Üstündən keçən çəhrayı xətt
    // aşağı endir → Y artır
    // yuxarı qaldır → Y azalt
    
    lineStartX: 490, // xəttin sol ucu: sağa/sola
    lineStartY: 555, // xəttin sol ucu: aşağı/yuxarı
    lineEndX: 752,   // xəttin sağ ucu: sağa/sola
    lineEndY: 525,   // xəttin sağ ucu: aşağı/yuxarı
    lineWidth: 5,    // xəttin qalınlığı
  },

  // ==========================================================
  // YENİ QİYMƏT
  //
  // Qiymət soldan başlayır.
  // Buna görə uzun qiymətlər sağa, məhsul şəklinin üzərinə
  // bir qədər keçə bilər və çox balacalaşmaz.
  // ==========================================================
  newPrice: {
    x: 485,             // artır → sağa, azalt → sola
    y: 685,             // artır → aşağı, azalt → yuxarı

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
    boxX: 900,          // bütün barkodu sağa/sola çəkir
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

// ============================================================
// ENDİRİM KARTI YÜKLƏMƏ STATUSU
// ============================================================

function setDiscountLoadStatus(
  text,
  {
    loading = false,
    finished = false,
  } = {}
) {
  const sentinel =
    $('#discountCardsLoadMoreSentinel');

  const label =
    $('#discountCardsLoadMoreText');

  if (label) {
    label.textContent = text;
  }

  sentinel?.classList.toggle(
    'is-loading',
    loading
  );

  sentinel?.classList.toggle(
    'is-finished',
    finished
  );
}


// ============================================================
// SUPABASE SORĞUSUNUN ƏSAS SEÇİMİ
// ============================================================

function createDiscountProductsQuery() {
  return supabase
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
      created_at,
      categories(name)
    `)
    .eq('status', 'active')
    .not('old_price', 'is', null)
    .order('created_at', {
      ascending: false,
    });
}


// ============================================================
// ENDİRİMİN HƏQİQİ OLDUĞUNU YOXLAMA
// ============================================================

function isDiscountProduct(product) {
  const price =
    Number(product?.price || 0);

  const oldPrice =
    Number(product?.old_price || 0);

  return (
    Number.isFinite(price) &&
    Number.isFinite(oldPrice) &&
    oldPrice > price
  );
}


// ============================================================
// SUPABASE-DƏN ENDİRİM KARTLARINI 15-LİK YÜKLƏ
// ============================================================

export async function loadDiscountCards(
  reset = true
) {
  const grid =
    $('#discountCardsGrid');

  if (!grid) return;

  if (reset) {
    discountRequestToken += 1;
    discountRawOffset = 0;
    discountHasMore = true;
    discountIsLoading = false;
    discountCardsCache = [];

    grid.innerHTML = '';

    setDiscountLoadStatus(
      'Endirim kartları yüklənir...',
      { loading: true }
    );
  }

  if (
    discountIsLoading ||
    (!reset && !discountHasMore)
  ) {
    return;
  }

  const currentToken =
    discountRequestToken;

  const search =
    String(
      $('#discountCardSearch')?.value || ''
    ).trim();

  discountIsLoading = true;

  setDiscountLoadStatus(
    reset
      ? 'Endirim kartları yüklənir...'
      : 'Növbəti 15 kart yüklənir...',
    { loading: true }
  );

  const collected = [];

  /*
    Bəzi sətirlərdə old_price mövcuddur,
    amma real endirim yoxdur. Ona görə 15 həqiqi
    endirimli məhsul tapana qədər sorğunu davam etdiririk.
  */
  while (
    collected.length < DISCOUNT_PAGE_SIZE &&
    discountHasMore
  ) {
    const from =
      discountRawOffset;

    const to =
      from + DISCOUNT_FETCH_CHUNK - 1;

    let query =
      createDiscountProductsQuery()
        .range(from, to);

    /*
      Axtarış serverdə aparılır.
      Ad və SKU üzrə yoxlanır.
    */
    if (search) {
      const safeSearch = search
        .replaceAll(',', ' ')
        .replaceAll('(', ' ')
        .replaceAll(')', ' ');

      query = query.or(
        `name.ilike.%${safeSearch}%,sku.ilike.%${safeSearch}%`
      );
    }

    const { data, error } =
      await query;

    if (
      currentToken !==
      discountRequestToken
    ) {
      discountIsLoading = false;
      return;
    }

    if (error) {
      discountIsLoading = false;

      console.error(
        'Endirim kartları yüklənmədi:',
        error
      );

      if (reset) {
        grid.innerHTML = `
          <div class="muted">
            ${esc(error.message)}
          </div>
        `;
      }

      setDiscountLoadStatus(
        'Endirim kartları yüklənmədi',
        { finished: true }
      );

      return;
    }

    const rows =
      data || [];

    discountRawOffset +=
      rows.length;

    if (
      rows.length <
      DISCOUNT_FETCH_CHUNK
    ) {
      discountHasMore = false;
    }

    for (const product of rows) {
      if (!isDiscountProduct(product)) {
        continue;
      }

      /*
        Eyni məhsul iki dəfə əlavə olunmur.
      */
      const alreadyLoaded =
        discountCardsCache.some(
          (item) =>
            String(item.id) ===
            String(product.id)
        ) ||
        collected.some(
          (item) =>
            String(item.id) ===
            String(product.id)
        );

      if (alreadyLoaded) {
        continue;
      }

      collected.push(product);

      if (
        collected.length >=
        DISCOUNT_PAGE_SIZE
      ) {
        break;
      }
    }

    if (!rows.length) {
      discountHasMore = false;
    }
  }

  discountIsLoading = false;

  if (
    reset &&
    !collected.length
  ) {
    grid.innerHTML = `
      <div class="muted">
        Endirimli məhsul yoxdur.
      </div>
    `;

    setDiscountLoadStatus(
      'Başqa endirim kartı yoxdur',
      { finished: true }
    );

    return;
  }

  discountCardsCache.push(
    ...collected
  );

  const cardsHtml =
    collected
      .map((product) =>
        renderDiscountCard(product)
      )
      .join('');

  grid.insertAdjacentHTML(
    'beforeend',
    cardsHtml
  );

  /*
    Yalnız yeni əlavə olunan kartların hadisələri
    və canvas-ları hazırlanır.
  */
  await bindDiscountCardEvents();

  if (discountHasMore) {
    setDiscountLoadStatus(
      'Aşağı endikcə digər 15 kart yüklənəcək'
    );
  } else {
    setDiscountLoadStatus(
      'Bütün endirim kartları göstərildi',
      { finished: true }
    );
  }
}


// ============================================================
// ENDİRİM KARTI AXTARIŞI VƏ INFINITE SCROLL
// ============================================================

export function initDiscountCardsInfiniteScroll() {
  const sentinel =
    $('#discountCardsLoadMoreSentinel');

  if (!sentinel) return;

  /*
    Axtarış hadisəsini yalnız bir dəfə bağlayırıq.
  */
  const searchInput =
    $('#discountCardSearch');

  if (
    searchInput &&
    searchInput.dataset.paginationBound !== '1'
  ) {
    searchInput.dataset.paginationBound = '1';

    searchInput.addEventListener(
      'input',
      () => {
        clearTimeout(
          discountSearchTimer
        );

        discountSearchTimer =
          setTimeout(() => {
            loadDiscountCards(true);
          }, 350);
      }
    );
  }

  if (discountObserver) return;

  discountObserver =
    new IntersectionObserver(
      (entries) => {
        const entry =
          entries[0];

        if (
          !entry?.isIntersecting ||
          discountIsLoading ||
          !discountHasMore
        ) {
          return;
        }

        /*
          Endirim kartları tabı bağlıdırsa
          əlavə sorğu göndərmir.
        */
        const panel =
          $('#discountCardsPanel');

        if (
          !panel?.classList.contains('active')
        ) {
          return;
        }

        loadDiscountCards(false);
      },
      {
        root: null,
        rootMargin: '700px 0px',
        threshold: 0.01,
      }
    );

  discountObserver.observe(
    sentinel
  );
}


// ============================================================
// HADİSƏLƏR
// ============================================================
// YALNIZ YENİ KARTLARIN HADİSƏLƏRİNİ BAĞLA
// ============================================================

async function bindDiscountCardEvents() {
  const newCanvases = [];

  $$('.discount-card-check').forEach(
    (input) => {
      if (input.dataset.bound === '1') {
        return;
      }

      input.dataset.bound = '1';

      input.addEventListener(
        'change',
        () => {
          const id =
            String(input.dataset.id);

          if (input.checked) {
            selectedDiscountCardIds.add(id);
          } else {
            selectedDiscountCardIds.delete(id);
          }
        }
      );
    }
  );

  $$('.discount-origin-select').forEach(
    (select) => {
      if (select.dataset.bound === '1') {
        return;
      }

      select.dataset.bound = '1';

      select.addEventListener(
        'change',
        async () => {
          const productId =
            String(select.dataset.id);

          const canvas =
            document.querySelector(
              `#discount-card-${CSS.escape(productId)}`
            );

          const product =
            getDiscountProductById(
              productId
            );

          if (!canvas || !product) return;

          await drawDiscountCanvas(
            canvas,
            product,
            select.value
          );
        }
      );
    }
  );

  $$('.print-discount-card').forEach(
    (button) => {
      if (button.dataset.bound === '1') {
        return;
      }

      button.dataset.bound = '1';

      button.addEventListener(
        'click',
        async () => {
          await printSingleDiscountCanvas(
            button.dataset.id
          );
        }
      );
    }
  );

  $$('.discount-card-canvas').forEach(
    (canvas) => {
      if (
        canvas.dataset.drawn === '1'
      ) {
        return;
      }

      canvas.dataset.drawn = '1';
      newCanvases.push(canvas);
    }
  );

  /*
    Köhnə 15 kart yenidən çəkilmir.
    Yalnız yeni gəlmiş kartlar çəkilir.
  */
  for (const canvas of newCanvases) {
    const product =
      getDiscountProductById(
        canvas.dataset.id
      );

    if (!product) continue;

    try {
      await drawDiscountCanvas(
        canvas,
        product,
        getDiscountOriginValue(
          product.id
        )
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
// JSBARCODE — REAL EAN-13 / UPC-A BARKOD GENERATORU
//
// 12 rəqəm → UPC-A
// 13 rəqəm → EAN-13
//
// Mövcud barkod koordinatları dəyişdirilmir.
// ============================================================


// SKU daxilində yalnız rəqəmləri saxlayır
function normalizeRetailBarcode(value) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .trim();
}


// JsBarcode kitabxanasının yüklənməsini yoxlayır
function isJsBarcodeReady() {
  return typeof window.JsBarcode === 'function';
}


// Barkodu müvəqqəti canvas üzərində yaradır
function createJsBarcodeCanvas(value, maxWidth, barHeight) {
  if (!isJsBarcodeReady()) {
    console.error(
      'JsBarcode kitabxanası yüklənməyib'
    );

    return null;
  }

  const normalized =
    normalizeRetailBarcode(value);

  /*
    12 rəqəmli 1C barkodu UPC-A,
    13 rəqəmli barkod isə EAN-13 kimi çəkilir.
  */
  let format = '';

  if (normalized.length === 12) {
    format = 'UPC';
  } else if (normalized.length === 13) {
    format = 'EAN13';
  } else {
    console.warn(
      'Barkod 12 və ya 13 rəqəmli deyil:',
      value
    );

    return null;
  }

  /*
    Əvvəl 3 px modul eni ilə yoxlayırıq.
    Sahəyə sığmasa 2 px, sonra 1 px istifadə olunur.

    Tam piksel eni xətlərin bulanıqlaşmasının
    qarşısını alır.
  */
  const candidateWidths = [3, 2, 1];

  for (const lineWidth of candidateWidths) {
    const barcodeCanvas =
      document.createElement('canvas');

    try {
      window.JsBarcode(
        barcodeCanvas,
        normalized,
        {
          format,

          /*
            Hər nazik modulun eni.
            Kassa skanerinin düzgün oxuması üçün
            tam piksel saxlanılır.
          */
          width: lineWidth,

          /*
            Yalnız qara xətlərin hündürlüyü.
          */
          height: Math.max(
            40,
            Math.round(barHeight)
          ),

          lineColor: '#000000',
          background: '#ffffff',

          /*
            Rəqəmi JsBarcode çəkmir.
            Aşağıdakı mövcud kodumuz rəqəmi
            əvvəlki koordinatda ayrıca yazacaq.
          */
          displayValue: false,

          /*
            Ağ sakit sahə əsas kartdakı
            sidePadding vasitəsilə saxlanılır.
          */
          margin: 0,

          flat: true,
        }
      );

      if (
        barcodeCanvas.width <= maxWidth
      ) {
        return {
          canvas: barcodeCanvas,
          value: normalized,
          format,
        };
      }
    } catch (error) {
      console.warn(
        'JsBarcode barkodu yarada bilmədi:',
        {
          value: normalized,
          format,
          error: error?.message || error,
        }
      );

      return null;
    }
  }

  console.warn(
    'Barkod mövcud ağ sahəyə sığmadı:',
    normalized
  );

  return null;
}


// ============================================================
// BARKOD SAHƏSİ
//
// CARD_LAYOUT.barcode koordinatları olduğu kimi qalır.
// ============================================================

function drawBarcodeArea(ctx, sku) {
  const value =
    normalizeRetailBarcode(sku);

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

  const generated =
    createJsBarcodeCanvas(
      value,
      barsWidth,
      barcode.barsHeight
    );

  if (!generated) return;

  const barcodeCanvas =
    generated.canvas;

  /*
    JsBarcode-un yaratdığı barkod dartılmadan,
    təbii ölçüsündə ağ sahənin ortasına qoyulur.
    Bu vacibdir: şəkli eni üzrə dartmaq xətləri
    bulanıqlaşdırıb skaneri poza bilər.
  */
  const drawX =
    Math.round(
      barsX +
      (
        barsWidth -
        barcodeCanvas.width
      ) / 2
    );

  const drawY =
    Math.round(barsY);

  ctx.save();

  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.drawImage(
    barcodeCanvas,
    drawX,
    drawY
  );

  ctx.restore();


  /*
    SKU rəqəmi əvvəlki koordinatda qalır.
    Heç bir yerləşmə rəqəmi dəyişdirilmir.
  */
  ctx.save();

  ctx.filter = 'none';
  ctx.globalAlpha = 1;

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

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
// BÜTÜN ENDİRİMLİ MƏHSULLARI YALNIZ ÇAP ÜÇÜN ÇƏK
// ============================================================

async function fetchAllDiscountProductsForPrint() {
  const allProducts = [];
  const pageSize = 200;

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } =
      await createDiscountProductsQuery()
        .range(
          offset,
          offset + pageSize - 1
        );

    if (error) {
      throw error;
    }

    const rows =
      data || [];

    allProducts.push(
      ...rows.filter(
        isDiscountProduct
      )
    );

    offset += rows.length;

    hasMore =
      rows.length === pageSize;
  }

  return allProducts;
}


// ============================================================
// MÜVƏQQƏTİ CANVAS-DA KART HAZIRLA
// ============================================================

async function productToCardImage(
  product,
  originText = 'YERLİ FERMER'
) {
  const canvas =
    document.createElement('canvas');

  canvas.width =
    CARD_WIDTH;

  canvas.height =
    CARD_HEIGHT;

  await drawDiscountCanvas(
    canvas,
    product,
    originText
  );

  return canvas.toDataURL(
    'image/png'
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
// BAZADAKI BÜTÜN ENDİRİM KARTLARINI ÇAP ET
// ============================================================

export async function printAllDiscountCards() {
  const button =
    $('#discountPrintAllBtn');

  const oldText =
    button?.textContent || '';

  if (button) {
    button.disabled = true;
    button.textContent =
      '⏳ Kartlar hazırlanır...';
  }

  try {
    const products =
      await fetchAllDiscountProductsForPrint();

    if (!products.length) {
      toast(
        'Çap üçün endirim kartı yoxdur'
      );

      return;
    }

    const images = [];

    /*
      Kartları ardıcıl hazırlayırıq.
      Bu, çoxlu böyük canvas-ın eyni anda
      yaddaşa yüklənməsinin qarşısını alır.
    */
    for (
      let index = 0;
      index < products.length;
      index += 1
    ) {
      const product =
        products[index];

      const originText =
        getDiscountOriginValue(
          product.id
        );

      const image =
        await productToCardImage(
          product,
          originText
        );

      images.push(image);

      if (button) {
        button.textContent =
          `⏳ ${index + 1}/${products.length}`;
      }
    }

    openMultipleCardPrintWindow(
      images,
      'Toplu endirim kartları'
    );
  } catch (error) {
    console.error(
      'Toplu kartlar hazırlanmadı:',
      error
    );

    toast(
      error?.message ||
      'Toplu çap hazırlanmadı'
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        oldText || '🖨️ Toplu çap et';
    }
  }
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
