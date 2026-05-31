// ============================================================
// MEYVƏÇİ.AZ - TOPLU SİFARİŞ SƏHİFƏSİ
// Restoran, hotel və mağazalar üçün toplu məhsul seçimi,
// çatdırılma, bonus və Kapital Bank checkout axını.
// ============================================================

import {
  $,
  $$,
  supabase,
  money,
  toast,
  requireAuth,
  profile,
  formData,
  PLACEHOLDER,
  askLocation,
} from './core.js';

import { initLayout } from './layout.js';

const AZ_CITY_REGIONS = [
  'Abşeron', 'Ağcabədi', 'Ağdam', 'Ağdaş', 'Ağdərə', 'Ağstafa', 'Ağsu',
  'Alabaşlı', 'Astara', 'Babək', 'Bakı', 'Balakən', 'Beyləqan', 'Bərdə',
  'Biləsuvar', 'Culfa', 'Cəbrayıl', 'Cəlilabad', 'Daşkəsən', 'Dəliməmmədli',
  'Füzuli', 'Goranboy', 'Göyçay', 'Göygöl', 'Göytəpə', 'Gədəbəy', 'Gəncə',
  'Hacıqabul', 'Horadiz', 'Xaçmaz', 'Xankəndi', 'Xocalı', 'Xocavənd',
  'Xudat', 'Xızı', 'İmişli', 'İsmayıllı', 'Kəlbəcər', 'Kəngərli',
  'Kürdəmir', 'Laçın', 'Lerik', 'Liman', 'Lənkəran', 'Masallı',
  'Mingəçevir', 'Naftalan', 'Naxçıvan', 'Neftçala', 'Oğuz', 'Ordubad',
  'Qax', 'Qazax', 'Qobustan', 'Quba', 'Qubadlı', 'Qusar', 'Qəbələ',
  'Saatlı', 'Sabirabad', 'Salyan', 'Samux', 'Siyəzən', 'Sumqayıt',
  'Sədərək', 'Tərtər', 'Tovuz', 'Ucar', 'Xırdalan', 'Yardımlı',
  'Yevlax', 'Zaqatala', 'Zəngilan', 'Zərdab', 'Şabran', 'Şahbuz',
  'Şamaxı', 'Şəki', 'Şəmkir', 'Şərur', 'Şirvan', 'Şuşa',
];

const BULK_STORAGE_KEY = 'meyveciBulkOrderDraft';

const state = {
  categories: [],
  products: [],
  selected: new Map(),
  category: 'all',
  query: '',
  visible: 24,

  productsTotal: 0,
  deliveryFee: 0,
  payableTotal: 0,
  bonusBalance: 0,
  bonusUsed: 0,
  deliveryDistanceKm: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  if (document.body.dataset.page !== 'bulk-order') return;

  await requireAuth();
  await fillCheckoutFromProfile();
  await loadBulkData();
  setupEvents();
  await initBonusBox();
  await updateDeliveryFee();

  window.dispatchEvent(new Event('hideLoader'));
});

function setupEvents() {
  $('#bulkSearchInput')?.addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.visible = 24;
    renderProducts();
  });

  $('#bulkClearFilters')?.addEventListener('click', () => {
    state.category = 'all';
    state.query = '';
    state.visible = 24;

    if ($('#bulkSearchInput')) $('#bulkSearchInput').value = '';

    renderCategories();
    renderProducts();
  });

  $('#bulkLoadMore')?.addEventListener('click', () => {
    state.visible += 24;
    renderProducts();
  });

  $('#bulkCheckoutToggle')?.addEventListener('click', () => {
    $('#bulkPersonalFields')?.classList.toggle('checkout-collapsed');
    $('#bulkCheckoutToggle')?.classList.toggle('open');
  });

  const form = $('#bulkCheckoutForm');

  form?.city_region?.addEventListener('change', () => {
    clearCheckoutLocation();
    updateDeliveryFee();
  });

  form?.address?.addEventListener('input', () => {
    clearCheckoutLocation();
    updateDeliveryFee();
  });

  form?.apartment?.addEventListener('input', () => {
    clearCheckoutLocation();
    updateDeliveryFee();
  });

  $('#bulkGetLocation')?.addEventListener('click', getCheckoutLocation);
  $('#bulkUseBonus')?.addEventListener('change', updateBonusPreview);
  $('#bulkBonusAmountInput')?.addEventListener('input', updateBonusPreview);

  form?.addEventListener('submit', checkoutBulkOrder);
}

async function loadBulkData() {
  const [categoriesRes, productsRes] = await Promise.all([
    supabase
      .from('categories')
      .select('id,name,slug,description,image_url,sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .limit(80),

    supabase
      .from('products')
      .select('*')
      .eq('status', 'active')
      .order('is_featured', { ascending: false })
      .order('name', { ascending: true })
      .limit(500),
  ]);

  if (categoriesRes.error) toast(categoriesRes.error.message);
  if (productsRes.error) toast(productsRes.error.message);

  state.categories = categoriesRes.data || [];
  state.products = productsRes.data || [];

  restoreBulkDraft();
  renderCategories();
  renderProducts();
  renderSelected();
  enableBulkCategoryDrag();
}

function renderCategories() {
  const container = $('#bulkCategoryChips');
  if (!container) return;

  const discountProducts = state.products.filter((product) =>
    Number(product.old_price) > Number(product.price)
  );

  container.innerHTML = `
    <button class="bulk-category-chip ${state.category === 'all' ? 'active' : ''}" data-id="all">
      <img src="./assets/img/logo/Cilek-logo.png" alt="Hamısı">
      <span>Hamısı</span>
    </button>

    <button class="bulk-category-chip discount ${state.category === 'discounts' ? 'active' : ''}" data-id="discounts">
      <span class="bulk-discount-ico">%</span>
      <span>Endirimli</span>
      <b>${discountProducts.length}</b>
    </button>

    ${state.categories.map((category) => `
      <button class="bulk-category-chip ${state.category === category.id ? 'active' : ''}" data-id="${category.id}">
        <img src="${category.image_url || './assets/img/logo/Cilek-logo.png'}" alt="${safeText(category.name)}">
        <span>${safeText(category.name)}</span>
      </button>
    `).join('')}
  `;

  $$('#bulkCategoryChips .bulk-category-chip').forEach((button) => {
    button.addEventListener('click', () => {
      state.category = button.dataset.id || 'all';
      state.visible = 24;
    
      renderCategories();
      renderProducts();
    
      document.querySelector('#bulkProducts')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  });
}

function filteredProducts() {
  return state.products.filter((product) => {
    const discount = getDiscount(product.price, product.old_price);

    const categoryMatch =
      state.category === 'all' ||
      (state.category === 'discounts' && discount > 0) ||
      product.category_id === state.category;

    const searchText = [
      product.name,
      product.unit,
      product.short_description,
      product.description,
    ].join(' ').toLowerCase();

    const searchMatch = !state.query || searchText.includes(state.query);

    return categoryMatch && searchMatch;
  });
}

function renderProducts() {
  const container = $('#bulkProducts');
  if (!container) return;

  const rows = filteredProducts();
  const visibleRows = rows.slice(0, state.visible);

  container.innerHTML = visibleRows.map(productCard).join('') || `
    <div class="card bulk-not-found">
      <b>Məhsul tapılmadı</b>
      <p class="muted">Axtarışı və ya kateqoriyanı dəyişin.</p>
    </div>
  `;

  $$('.bulk-add').forEach((button) => {
    button.addEventListener('click', () => increaseProduct(button.dataset.id));
  });

  $$('.bulk-minus').forEach((button) => {
    button.addEventListener('click', () => decreaseProduct(button.dataset.id));
  });

  $$('.bulk-plus').forEach((button) => {
    button.addEventListener('click', () => increaseProduct(button.dataset.id));
  });

  $$('.bulk-card-qty-input').forEach((input) => {
    input.addEventListener('change', () => setProductQuantity(input.dataset.id, Number(input.value || 0)));
  });

  const loadMoreButton = $('#bulkLoadMore');
  if (loadMoreButton) {
    loadMoreButton.style.display = rows.length > visibleRows.length ? 'inline-flex' : 'none';
  }
}

function productCard(product) {
  const discount = getDiscount(product.price, product.old_price);
  const hasDiscount = discount > 0;
  const qty = state.selected.get(product.id)?.quantity || 0;
  const lineTotal = qty * Number(product.price || 0);

  return `
    <article class="bulk-product-card ${hasDiscount ? 'bulk-discount-card' : ''} ${qty > 0 ? 'selected' : ''}">
      <div class="bulk-product-img">
        <img loading="lazy" src="${product.image_url || PLACEHOLDER}" alt="${safeText(product.name)}">
        ${hasDiscount ? `<span class="bulk-discount-badge">-${discount}%</span>` : ''}
      </div>

      <div class="bulk-product-body">
        <div class="bulk-product-title">
          <h3>${safeText(product.name)}</h3>
          <span>${safeText(product.unit || 'ədəd')}</span>
        </div>

        <div class="bulk-price-row">
          <div>
            ${hasDiscount ? `<small class="old-price">${money(product.old_price)}</small>` : ''}
            <b class="price">${money(product.price)}</b>
          </div>

          ${hasDiscount ? `<em>${discount}% endirim</em>` : `<em class="fresh">Təzə məhsul</em>`}
        </div>

        <div class="bulk-card-actions">
          <div class="bulk-qty-box">
            <button class="bulk-minus" type="button" data-id="${product.id}">−</button>
            <input class="bulk-card-qty-input" data-id="${product.id}" type="number" min="0" step="${getQtyStep(product)}" value="${qty || ''}" placeholder="0">
            <button class="bulk-plus" type="button" data-id="${product.id}">+</button>
          </div>

          <button class="btn btn-primary bulk-add" type="button" data-id="${product.id}">
            ${qty > 0 ? money(lineTotal) : 'Əlavə et'}
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderSelected() {
  const list = $('#bulkSelectedList');
  if (!list) return;

  const items = [...state.selected.values()];

  if (!items.length) {
    list.innerHTML = `
      <div class="bulk-empty">
        <b>Hələ məhsul seçilməyib</b>
        <p class="muted">Məhsul kartındakı + düyməsi ilə toplu siyahıya əlavə edin.</p>
      </div>
    `;
  } else {
    list.innerHTML = items.map(({ product, quantity }) => {
      const discount = getDiscount(product.price, product.old_price);
      const hasDiscount = discount > 0;
      const lineTotal = Number(product.price || 0) * Number(quantity || 0);

      return `
        <div class="bulk-selected-row ${hasDiscount ? 'has-discount' : ''}">
          ${hasDiscount ? `<span class="bulk-selected-discount-badge">-${discount}%</span>` : ''}
          <div class="bulk-selected-main">
            <div class="bulk-selected-img">
              <img src="${product.image_url || PLACEHOLDER}" alt="${safeText(product.name)}">
            </div>

            <div>
              <b>${safeText(product.name)}</b>
              <small>
                ${hasDiscount ? `<i>${money(product.old_price)}</i>` : ''}
                <strong>${money(product.price)}</strong>
                • ${safeText(product.unit || 'ədəd')}
              </small>
            </div>
          </div>

          <div class="bulk-selected-actions">
            <div class="bulk-qty-box small">
              <button type="button" data-id="${product.id}" class="bulk-panel-minus">−</button>
              <input type="number" min="0" step="${getQtyStep(product)}" value="${quantity}" data-id="${product.id}" class="bulk-panel-input">
              <button type="button" data-id="${product.id}" class="bulk-panel-plus">+</button>
            </div>

            <b>${money(lineTotal)}</b>
            <button class="bulk-remove" type="button" data-id="${product.id}">×</button>
          </div>
        </div>
      `;
    }).join('');
  }

  $$('.bulk-panel-minus').forEach((button) => {
    button.addEventListener('click', () => decreaseProduct(button.dataset.id));
  });

  $$('.bulk-panel-plus').forEach((button) => {
    button.addEventListener('click', () => increaseProduct(button.dataset.id));
  });

  $$('.bulk-panel-input').forEach((input) => {
    input.addEventListener('change', () => setProductQuantity(input.dataset.id, Number(input.value || 0)));
  });

  $$('.bulk-remove').forEach((button) => {
    button.addEventListener('click', () => removeProduct(button.dataset.id));
  });

  calculateTotals();
}

function increaseProduct(productId) {
  const product = findProduct(productId);
  if (!product) return;

  const current = state.selected.get(productId)?.quantity || 0;
  const step = getQtyStep(product);

  setProductQuantity(productId, roundQty(current + step));
}

function decreaseProduct(productId) {
  const product = findProduct(productId);
  if (!product) return;

  const current = state.selected.get(productId)?.quantity || 0;
  const step = getQtyStep(product);

  setProductQuantity(productId, roundQty(current - step));
}

function setProductQuantity(productId, quantity) {
  const product = findProduct(productId);
  if (!product) return;

  const qty = Math.max(0, roundQty(quantity));

  if (qty <= 0) {
    state.selected.delete(productId);
  } else {
    state.selected.set(productId, {
      product,
      quantity: qty,
    });
  }

  saveBulkDraft();
  renderProducts();
  renderSelected();
  updateDeliveryFee();
}

function removeProduct(productId) {
  state.selected.delete(productId);
  saveBulkDraft();
  renderProducts();
  renderSelected();
  updateDeliveryFee();
}

function calculateTotals() {
  const items = [...state.selected.values()];

  state.productsTotal = items.reduce((sum, item) => {
    return sum + Number(item.product.price || 0) * Number(item.quantity || 0);
  }, 0);

  $('#bulkSelectedCount').textContent = String(items.length);
  $('#bulkProductsTotal').textContent = money(state.productsTotal);
  $('#bulkSummaryProducts').textContent = money(state.productsTotal);

  updateBonusPreview();
}

async function fillCheckoutFromProfile() {
  const activeProfile = await profile(true);
  const form = $('#bulkCheckoutForm');

  if (!activeProfile || !form) return;

  form.full_name.value = `${activeProfile.first_name || ''} ${activeProfile.last_name || ''}`.trim();
  form.phone.value = activeProfile.phone || '';
  fillCityRegionSelect(form, activeProfile.city_region || '');
  form.address.value = activeProfile.address_line || '';
  form.apartment.value = activeProfile.apartment || '';
  form.door_code.value = activeProfile.door_code || '';
  form.lat.value = activeProfile.lat || '';
  form.lng.value = activeProfile.lng || '';

  updateCheckoutLocationText();
}

function fillCityRegionSelect(form, selectedValue = '') {
  const select = form?.city_region;
  if (!select) return;

  select.innerHTML = `
    <option value="">Şəhər / rayon seçin</option>
    ${AZ_CITY_REGIONS.map((city) => `
      <option value="${city}" ${city === selectedValue ? 'selected' : ''}>${city}</option>
    `).join('')}
  `;
}

async function initBonusBox() {
  const activeProfile = await profile(true);
  const box = $('#bulkBonusBox');

  if (!box) return;

  state.bonusBalance = Number(activeProfile?.bonus_balance || 0);

  if (state.bonusBalance <= 0) {
    box.hidden = true;
    return;
  }

  box.hidden = false;
  $('#bulkBonusBalanceText').textContent = `${money(state.bonusBalance)} bonusunuz var`;

  updateBonusPreview();
}

function updateBonusPreview() {
  const useBonus = $('#bulkUseBonus');
  const input = $('#bulkBonusAmountInput');
  const help = $('#bulkBonusHelpText');

  const baseTotal = Number(state.productsTotal || 0) + Number(state.deliveryFee || 0);

  if (!input || !help) {
    state.bonusUsed = 0;
    updateSummary(0);
    return;
  }

  const maxBonus = Math.min(Number(state.bonusBalance || 0), baseTotal);

  input.disabled = !useBonus?.checked;

  if (!useBonus?.checked) {
    input.value = '';
    state.bonusUsed = 0;
    updateSummary(0);
    help.textContent = `Bonus istifadə olunmayacaq. Ödəniləcək məbləğ: ${money(state.payableTotal)}`;
    return;
  }

  if (!input.value) input.value = maxBonus.toFixed(2);

  let used = Number(input.value || 0);
  used = Math.min(Math.max(used, 0), maxBonus);

  input.value = used.toFixed(2);
  state.bonusUsed = used;

  updateSummary(used);

  help.textContent = `${money(used)} bonus istifadə ediləcək. Ödəniləcək məbləğ: ${money(state.payableTotal)}`;
}

function updateSummary(bonusUsed = 0) {
  const productsTotal = Number(state.productsTotal || 0);
  const deliveryFee = Number(state.deliveryFee || 0);
  const usedBonus = Number(bonusUsed || 0);

  state.payableTotal = Math.max(productsTotal + deliveryFee - usedBonus, 0);

  $('#bulkDeliveryMini').textContent = money(deliveryFee);
  $('#bulkBonusMini').textContent = usedBonus > 0 ? `-${money(usedBonus)}` : money(0);
  $('#bulkPayableMini').textContent = money(state.payableTotal);

  $('#bulkSummaryProducts').textContent = money(productsTotal);
  $('#bulkSummaryDelivery').textContent = money(deliveryFee);
  $('#bulkSummaryBonus').textContent = usedBonus > 0 ? `-${money(usedBonus)}` : money(0);
  $('#bulkSummaryPayable').textContent = money(state.payableTotal);
}

async function updateDeliveryFee() {
  const form = $('#bulkCheckoutForm');
  const city = form?.city_region?.value || '';
  const lat = Number(form?.lat?.value || 0);
  const lng = Number(form?.lng?.value || 0);

  const text = $('#bulkDeliveryFeeText');
  const amount = $('#bulkDeliveryFeeAmount');

  state.deliveryFee = 0;
  state.deliveryDistanceKm = null;

  if (Number(state.productsTotal || 0) <= 0) {
    if (text) text.textContent = 'Məhsul seçilməyib';
    if (amount) amount.textContent = money(0);
    updateBonusPreview();
    return;
  }

  const [{ data: settings }, { data: regionTariff }, { data: kmTariffs }] = await Promise.all([
    supabase
      .from('delivery_settings')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    city
      ? supabase
          .from('delivery_region_tariffs')
          .select('*')
          .eq('city_region', city)
          .eq('is_active', true)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    supabase
      .from('delivery_km_tariffs')
      .select('*')
      .eq('is_active', true)
      .order('min_km', { ascending: true }),
  ]);

  const productsTotal = Number(state.productsTotal || 0);

  if (settings?.free_delivery_min && productsTotal >= Number(settings.free_delivery_min)) {
    state.deliveryFee = 0;
    if (text) text.textContent = 'Pulsuz çatdırılma aktiv oldu';
    if (amount) amount.textContent = money(0);
    updateBonusPreview();
    return;
  }

  if (regionTariff?.free_delivery_min && productsTotal >= Number(regionTariff.free_delivery_min)) {
    state.deliveryFee = 0;
    if (text) text.textContent = `${city}: pulsuz çatdırılma aktiv oldu`;
    if (amount) amount.textContent = money(0);
    updateBonusPreview();
    return;
  }

  const hasValidDistance =
    settings?.store_lat &&
    settings?.store_lng &&
    validCheckoutPoint(settings.store_lat, settings.store_lng) &&
    validCheckoutPoint(lat, lng);

  if (hasValidDistance) {
    state.deliveryDistanceKm = distanceKm(
      Number(settings.store_lat),
      Number(settings.store_lng),
      lat,
      lng
    );

    const tariff = (kmTariffs || []).find((row) => {
      const min = Number(row.min_km || 0);
      const max = row.max_km === null || row.max_km === undefined ? Infinity : Number(row.max_km);
      return state.deliveryDistanceKm >= min && state.deliveryDistanceKm <= max;
    });

    if (tariff) {
      state.deliveryFee =
        Number(tariff.base_fee || 0) +
        Math.max(state.deliveryDistanceKm - Number(tariff.min_km || 0), 0) * Number(tariff.per_km_fee || 0);

      state.deliveryFee = Math.max(state.deliveryFee, Number(settings?.min_fee || 0));
      state.deliveryFee = Number(state.deliveryFee.toFixed(2));

      if (text) text.textContent = `${state.deliveryDistanceKm.toFixed(1)} km məsafəyə görə hesablandı`;
      if (amount) amount.textContent = money(state.deliveryFee);
      updateBonusPreview();
      return;
    }
  }

  if (regionTariff) {
    state.deliveryFee = Number(regionTariff.fixed_fee || 0);
    if (text) text.textContent = `${city} üzrə rayon tarifi`;
    if (amount) amount.textContent = money(state.deliveryFee);
    updateBonusPreview();
    return;
  }

  state.deliveryFee = 0;

  if (text) {
    text.textContent = city
      ? `${city} üçün çatdırılma tarifi təyin edilməyib`
      : 'Şəhər/rayon seçin və lokasiyanı götürün';
  }

  if (amount) amount.textContent = money(0);

  updateBonusPreview();
}

async function getCheckoutLocation() {
  const button = $('#bulkGetLocation');
  const form = $('#bulkCheckoutForm');

  if (!form || !button) return;

  button.disabled = true;
  button.textContent = '📍 Lokasiya alınır...';

  const locationPoint = await askLocation();

  if (locationPoint) {
    form.lat.value = locationPoint.lat;
    form.lng.value = locationPoint.lng;

    toast('Lokasiya yeniləndi');
    updateCheckoutLocationText();
    await updateDeliveryFee();
  } else {
    toast('Lokasiya alınmadı');
  }

  button.disabled = false;
  button.textContent = '📍 Olduğum yerə gətir';
}

function updateCheckoutLocationText() {
  const form = $('#bulkCheckoutForm');
  const text = $('#bulkLocationText');

  if (!form || !text) return;

  const lat = Number(form.lat?.value || 0);
  const lng = Number(form.lng?.value || 0);

  if (lat && lng) {
    text.textContent = `Lokasiya seçildi: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    text.classList.add('ok');
  } else {
    text.textContent = 'Lokasiya seçilməyib';
    text.classList.remove('ok');
  }
}

function clearCheckoutLocation() {
  const form = $('#bulkCheckoutForm');
  if (!form) return;

  form.lat.value = '';
  form.lng.value = '';

  updateCheckoutLocationText();

  state.deliveryFee = 0;
  state.deliveryDistanceKm = null;

  if ($('#bulkDeliveryFeeText')) {
    $('#bulkDeliveryFeeText').textContent = 'Yeni ünvan üçün lokasiyanı götürün';
  }

  if ($('#bulkDeliveryFeeAmount')) {
    $('#bulkDeliveryFeeAmount').textContent = money(0);
  }

  updateBonusPreview();
}

async function checkoutBulkOrder(event) {
  event.preventDefault();

  const selectedItems = [...state.selected.values()];

  if (!selectedItems.length) {
    toast('Toplu sifariş üçün məhsul seçin');
    document.querySelector('#bulkProducts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const submitBtn = $('#bulkSubmitBtn');

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sifariş hazırlanır...';
  }

  const data = formData(event.target);

  if (!data.lat || !data.lng || data.lat == 0 || data.lng == 0) {
    toast('Çatdırılma üçün lokasiya icazəsi istənir...');

    const locationPoint = await askLocation();

    if (locationPoint) {
      data.lat = locationPoint.lat;
      data.lng = locationPoint.lng;

      if ($('#bulkCheckoutForm')?.lat) $('#bulkCheckoutForm').lat.value = locationPoint.lat;
      if ($('#bulkCheckoutForm')?.lng) $('#bulkCheckoutForm').lng.value = locationPoint.lng;

      updateCheckoutLocationText();
      await updateDeliveryFee();
    } else {
      toast('Lokasiya alınmadı, xəritə düzgün işləməyə bilər');
    }
  }

  try {
    const activeUser = await requireAuth();

    await supabase
      .from('profiles')
      .update({
        city_region: data.city_region || null,
        address_line: data.address || null,
        apartment: data.apartment || null,
        door_code: data.door_code || null,
        lat: data.lat ? Number(data.lat) : null,
        lng: data.lng ? Number(data.lng) : null,
      })
      .eq('id', activeUser.id);

    const { count: existingCartCount } = await supabase
      .from('cart_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', activeUser.id);

    if (Number(existingCartCount || 0) > 0) {
      const ok = confirm(
        'Səbətinizdə əvvəl seçilmiş məhsullar var. Toplu sifariş yaratmaq üçün mövcud səbət təmizlənib bu siyahı ilə əvəz ediləcək. Davam edilsin?'
      );

      if (!ok) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Toplu sifarişi tamamla';
        }
        return;
      }

      const clearRes = await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', activeUser.id);

      if (clearRes.error) throw clearRes.error;
    }

    const cartRows = selectedItems.map(({ product, quantity }) => ({
      user_id: activeUser.id,
      product_id: product.id,
      quantity: Math.max(1, Math.round(Number(quantity || 0))),
    }));

    const cartInsert = await supabase
      .from('cart_items')
      .insert(cartRows);

    if (cartInsert.error) throw cartInsert.error;

    const bonusUsed = data.use_bonus === 'on' ? Number(data.bonus_used || 0) : 0;

    const { data: orderId, error } = await supabase.rpc('create_order_from_cart_fast', {
      p_full_name: data.full_name,
      p_phone: data.phone,
      p_address_text: data.address,
      p_apartment: data.apartment || null,
      p_door_code: data.door_code || null,
      p_note: data.note ? `Toplu sifariş: ${data.note}` : 'Toplu sifariş',
      p_lat: data.lat ? Number(data.lat) : null,
      p_lng: data.lng ? Number(data.lng) : null,
      p_payment_method: 'online_payment',
      p_transaction_ref: null,
      p_receipt_url: null,
      p_bonus_used: bonusUsed,
      p_delivery_fee: Number(state.deliveryFee || 0),
    });

    if (error) throw error;

    await supabase
      .from('orders')
      .update({
        full_name: data.full_name || null,
        phone: data.phone || null,
        city_region: data.city_region || null,
        address_text: data.address || null,
        apartment: data.apartment || null,
        door_code: data.door_code || null,
        lat: data.lat ? Number(data.lat) : null,
        lng: data.lng ? Number(data.lng) : null,
        customer_note: data.note ? `Toplu sifariş: ${data.note}` : 'Toplu sifariş',
      })
      .eq('id', orderId);

    if (Number(state.payableTotal || 0) <= 0) {
      localStorage.removeItem('meyveciPendingKapitalPayment');
      toast('Toplu sifariş bonusla ödənildi');
      clearBulkDraft();

      setTimeout(() => {
        location.href = `orders.html?track=${orderId}`;
      }, 700);

      return;
    }

    const { data: kapitalResult, error: kapitalError } = await supabase.functions.invoke(
      'kapital-create-order',
      {
        body: {
          order_id: orderId,
          amount: Number(state.payableTotal || 0),
          description: `Meyveci.az bulk order ${orderId}`,
        },
      }
    );

    if (kapitalError) throw kapitalError;

    if (!kapitalResult?.redirect_url) {
      throw new Error('Bank ödəniş linki alınmadı');
    }

    await supabase.rpc('mark_kapital_redirect', {
      p_order_id: orderId,
      p_bank_order_id: String(kapitalResult.kapital_order_id || kapitalResult.order_id || ''),
      p_session_id: String(kapitalResult.kapital_password || kapitalResult.password || ''),
      p_status: String(kapitalResult.kapital_status || kapitalResult.status || 'Preparing'),
    });

    localStorage.setItem('meyveciPendingKapitalPayment', JSON.stringify({
      order_id: orderId,
      bank_order_id: kapitalResult.kapital_order_id,
      created_at: new Date().toISOString(),
    }));

    toast('Kapital Bank ödəniş səhifəsinə yönləndirilirsiniz...');

    setTimeout(() => {
      window.location.href = kapitalResult.redirect_url;
    }, 500);
  } catch (error) {
    toast(error.message || 'Toplu sifariş zamanı xəta baş verdi');

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Toplu sifarişi tamamla';
    }
  }
}

function findProduct(productId) {
  return state.products.find((product) => product.id === productId);
}

function getDiscount(price, oldPrice) {
  if (!oldPrice || Number(oldPrice) <= Number(price)) return 0;
  return Math.round(((Number(oldPrice) - Number(price)) / Number(oldPrice)) * 100);
}

function getQtyStep(product) {
  return 1;
}

function roundQty(value) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function validCheckoutPoint(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);

  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  if (nLat === 0 && nLng === 0) return false;

  return nLat >= 38 && nLat <= 42.5 && nLng >= 44 && nLng <= 51;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function safeText(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}



function saveBulkDraft() {
  const items = [...state.selected.values()].map((item) => ({
    product_id: item.product.id,
    quantity: item.quantity,
  }));

  localStorage.setItem(BULK_STORAGE_KEY, JSON.stringify({
    items,
    updated_at: new Date().toISOString(),
  }));
}

function restoreBulkDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(BULK_STORAGE_KEY) || 'null');
    const items = draft?.items || [];

    items.forEach((item) => {
      const product = state.products.find((p) => p.id === item.product_id);
      const quantity = Number(item.quantity || 0);

      if (product && quantity > 0) {
        state.selected.set(product.id, { product, quantity });
      }
    });
  } catch (_) {
    localStorage.removeItem(BULK_STORAGE_KEY);
  }
}

function clearBulkDraft() {
  localStorage.removeItem(BULK_STORAGE_KEY);
}

function enableBulkCategoryDrag() {
  const row = $('#bulkCategoryChips');
  if (!row || row.dataset.dragReady === '1') return;

  row.dataset.dragReady = '1';

  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;
  let moved = false;

  row.addEventListener('mousedown', (event) => {
    isDown = true;
    moved = false;
    row.classList.add('dragging');
    startX = event.pageX - row.offsetLeft;
    scrollLeft = row.scrollLeft;
  });

  row.addEventListener('mouseleave', () => {
    isDown = false;
    row.classList.remove('dragging');
  });

  row.addEventListener('mouseup', () => {
    isDown = false;
    setTimeout(() => {
      row.classList.remove('dragging');
    }, 30);
  });

  row.addEventListener('mousemove', (event) => {
    if (!isDown) return;

    const x = event.pageX - row.offsetLeft;
    const walk = (x - startX) * 1.35;

    if (Math.abs(walk) > 6) moved = true;

    if (moved) {
      event.preventDefault();
      row.scrollLeft = scrollLeft - walk;
    }
  });

  row.addEventListener('click', (event) => {
    if (!moved) return;

    event.preventDefault();
    event.stopPropagation();
    moved = false;
  }, true);
}
