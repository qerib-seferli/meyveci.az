// ============================================================
// MEYVƏÇİ.AZ - İSTİFADƏÇİ SƏHİFƏLƏRİ
// Sevimlilər, səbət, sifariş, profil və mesaj səhifələrinin məntiqi buradadır.
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
  uploadFile,
  PLACEHOLDER,
  statusAz,
  askLocation,
  updateMyPresence,
} from './core.js';

import { initLayout } from './layout.js';

let currentThread = null;
let allUserThreads = [];
let allUserThreadOrdersMap = new Map();
let allUserThreadCustomersMap = new Map();
let allUserThreadCouriersMap = new Map();
let allUserThreadUnreadMap = new Map();
let userOrderMaps = new Map();
let userTrackingTimer = null;
let presenceTimer = null;
let cartCurrentTotal = 0;
let userBonusBalance = 0;
let cartDeliveryFee = 0;
let cartPayableTotal = 0;
let deliveryDistanceKm = null;

const AZ_CITY_REGIONS = [
  'Abşeron',
  'Ağcabədi',
  'Ağdam',
  'Ağdaş',
  'Ağdərə',
  'Ağstafa',
  'Ağsu',
  'Alabaşlı',
  'Astara',
  'Babək',
  'Bakı',
  'Balakən',
  'Beyləqan',
  'Bərdə',
  'Biləsuvar',
  'Culfa',
  'Cəbrayıl',
  'Cəlilabad',
  'Daşkəsən',
  'Dəliməmmədli',
  'Füzuli',
  'Goranboy',
  'Göyçay',
  'Göygöl',
  'Göytəpə',
  'Gədəbəy',
  'Gəncə',
  'Hacıqabul',
  'Horadiz',
  'Xaçmaz',
  'Xankəndi',
  'Xocalı',
  'Xocavənd',
  'Xudat',
  'Xızı',
  'İmişli',
  'İsmayıllı',
  'Kəlbəcər',
  'Kəngərli',
  'Kürdəmir',
  'Laçın',
  'Lerik',
  'Liman',
  'Lənkəran',
  'Masallı',
  'Mingəçevir',
  'Naftalan',
  'Naxçıvan',
  'Neftçala',
  'Oğuz',
  'Ordubad',
  'Qax',
  'Qazax',
  'Qobustan',
  'Quba',
  'Qubadlı',
  'Qusar',
  'Qəbələ',
  'Saatlı',
  'Sabirabad',
  'Salyan',
  'Samux',
  'Siyəzən',
  'Sumqayıt',
  'Sədərək',
  'Tərtər',
  'Tovuz',
  'Ucar',
  'Xırdalan',
  'Yardımlı',
  'Yevlax',
  'Zaqatala',
  'Zəngilan',
  'Zərdab',
  'Şabran',
  'Şahbuz',
  'Şamaxı',
  'Şəki',
  'Şəmkir',
  'Şərur',
  'Şirvan',
  'Şuşa',
];

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

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  const page = document.body.dataset.page;

  if (['cart', 'favorites', 'orders', 'messages', 'profile'].includes(page)) {
    await requireAuth();
  }

  if (page === 'cart') initCart();
  if (page === 'favorites') initFavorites();
  if (page === 'orders') initOrders();
  if (page === 'messages') initMessages();
  if (page === 'profile') initProfile();
});





function productRow(item) {
  const product = item.products || item;
  const discount = getDiscount(product.price, product.old_price);
  const rating = Number(product.rating_avg || 0).toFixed(1);
  const hasDiscount = discount > 0;

  return `
    <article class="product-card ${hasDiscount ? 'discount-product-card' : 'fresh-product-card'}">
      <div class="product-media">
        <div class="rating-pill">
          <span>⭐</span>
          <b>${rating > 0 ? rating : '5.0'}</b>
        </div>

        <button class="fav-btn active remove-fav" data-id="${product.id}" title="Sevimlilərdən çıxart" aria-label="Sevimlilərdən çıxart">♥</button>

        <a class="pic" href="product.html?id=${product.id}">
          <img loading="lazy" src="${product.image_url || PLACEHOLDER}" alt="${product.name}">
        </a>

        <div class="fresh-badge">🌿 TƏZƏ MƏHSUL</div>
        <div class="quality-badge">🛡️ KEYFİYYƏT<br>ZƏMANƏTİ</div>
      </div>

      <div class="product-title-row">
        <h3><a href="product.html?id=${product.id}">${product.name}</a></h3>
        <span class="unit-badge">${product.unit || 'ədəd'}</span>
      </div>

      <div class="price-panel">
        <div>
          <span class="price">${money(product.price)}</span>
          <small>Meyvəçi qiyməti</small>
        </div>

        ${hasDiscount ? `
          <div class="discount-flag">
            <b>${discount}%</b>
            <span>ENDİRİM</span>
          </div>
          <span class="old-price">${money(product.old_price)}</span>
        ` : ''}
      </div>

      <p class="short-desc">🌿 ${product.short_description || 'Təzə və keyfiyyətli məhsul.'}</p>

      <button class="btn btn-primary cart-btn add-cart" data-id="${product.id}">
        🛒 Səbətə at
      </button>
    </article>`;
}




function getDiscount(price, oldPrice) {
  if (!oldPrice || Number(oldPrice) <= Number(price)) return 0;
  return Math.round(((Number(oldPrice) - Number(price)) / Number(oldPrice)) * 100);
}

async function removeFavorite(productId) {
  const activeUser = await requireAuth();
  const { error } = await supabase.from('favorites').delete().eq('user_id', activeUser.id).eq('product_id', productId);
  toast(error ? error.message : 'Sevimlilərdən çıxarıldı');
  initFavorites();
}

async function initFavorites() {
  const activeUser = await requireAuth();

  const { data, error } = await supabase
    .from('favorites')
    .select('id,products(id,name,price,old_price,image_url,unit,short_description,rating_avg)')
    .eq('user_id', activeUser.id)
    .order('created_at', { ascending: false })
    .limit(80);

  $('#favoritesGrid').innerHTML = error
    ? `<div class="card">${error.message}</div>`
    : (data || []).map(productRow).join('') || '<div class="card">Sevimli məhsul yoxdur.</div>';

  // Sevimlilər səhifəsində bütün kartların düymələrini ayrı-ayrı işlək edirik.
  $$('.add-cart').forEach((button) => {
    button.addEventListener('click', () => addCart(button.dataset.id));
  });

  // Ürəyə toxunanda məhsul sevimlilərdən çıxır və siyahı yenilənir.
  $$('.remove-fav').forEach((button) => {
    button.addEventListener('click', () => removeFavorite(button.dataset.id));
  });
}

async function addCart(productId) {
  const activeUser = await requireAuth();

  const { data } = await supabase
    .from('cart_items')
    .select('id,quantity')
    .eq('user_id', activeUser.id)
    .eq('product_id', productId)
    .maybeSingle();

  const response = data
    ? await supabase.from('cart_items').update({ quantity: data.quantity + 1 }).eq('id', data.id)
    : await supabase.from('cart_items').insert({ user_id: activeUser.id, product_id: productId, quantity: 1 });

  toast(response.error ? response.error.message : 'Səbətə əlavə olundu');
}

async function initCart() {
  await fillCheckoutFromProfile();
  await renderCart();
  await initBonusBox();

  $('#checkoutForm')?.city_region?.addEventListener('change', () => {
    clearCheckoutLocation();
    updateDeliveryFee();
  });
  
  $('#checkoutForm')?.address?.addEventListener('input', () => {
    clearCheckoutLocation();
    updateDeliveryFee();
  });
  
  $('#checkoutForm')?.apartment?.addEventListener('input', () => {
    clearCheckoutLocation();
    updateDeliveryFee();
  });
  
  await updateDeliveryFee();
  
  $('#getCheckoutLocation')?.addEventListener('click', getCheckoutLocation);
  updateCheckoutLocationText();

  $('#checkoutForm')?.address?.addEventListener('input', updateDeliveryFee);
  $('#checkoutForm')?.apartment?.addEventListener('input', updateDeliveryFee);

  $('#checkoutForm')?.addEventListener('submit', checkout);

  $('#checkoutToggle')?.addEventListener('click', () => {
    $('#personalFields')?.classList.toggle('checkout-collapsed');
    $('#checkoutToggle')?.classList.toggle('open');
  });
    
}

async function fillCheckoutFromProfile() {
  const activeProfile = await profile(true);
  const form = $('#checkoutForm');

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




async function renderCart() {
  const activeUser = await requireAuth();

  const { data, error } = await supabase
    .from('cart_items')
    .select('id,quantity,products(id,name,price,old_price,image_url,unit,short_description)')
    .eq('user_id', activeUser.id)
    .order('created_at', { ascending: false });

  const list = $('#cartList');

  if (error) {
    list.innerHTML = `<div class="card">${error.message}</div>`;
    return;
  }

  let total = 0;

  list.innerHTML = (data || []).map((item) => {
    const product = item.products;
    const discount = getDiscount(product.price, product.old_price);
    const hasDiscount = discount > 0;
    const lineTotal = Number(product.price || 0) * Number(item.quantity || 0);

    total += lineTotal;

    return `
      <div class="compact-row cart-product-row ${hasDiscount ? 'cart-discount-row' : 'cart-fresh-row'}">
        <div class="cart-product-main">
          <div class="cart-img-wrap">
            <img class="preview-img" src="${product.image_url || PLACEHOLDER}" alt="${product.name}">
            ${hasDiscount ? `<span class="cart-mini-discount">-${discount}%</span>` : ''}
          </div>

          <div class="cart-product-info">
            <b>${product.name}</b>

            <small class="cart-price-line">
              ${hasDiscount ? `<span class="cart-old-price">${money(product.old_price)}</span>` : ''}
              <span class="cart-new-price">${money(product.price)}</span>
              <span class="cart-dot">×</span>
              <span>${item.quantity} ${product.unit || 'ədəd'}</span>
            </small>

            <small class="cart-desc">
              🌿 ${product.short_description || (hasDiscount ? 'Endirimli və keyfiyyətli məhsul.' : 'Təzə və keyfiyyətli məhsul.')}
            </small>
          </div>
        </div>

        <div class="cart-row-actions">
          <div class="cart-line-total">${money(lineTotal)}</div>

          <div class="cart-qty-actions">
            <button class="btn btn-soft qty" data-id="${item.id}" data-q="${item.quantity - 1}">−</button>
            <b>${item.quantity}</b>
            <button class="btn btn-soft qty" data-id="${item.id}" data-q="${item.quantity + 1}">+</button>
            <button class="btn btn-danger del" data-id="${item.id}">Sil</button>
          </div>
        </div>
      </div>
    `;
  }).join('') || '<div class="card">Səbət boşdur.</div>';

  $('#cartTotal').textContent = money(total);
  
    cartCurrentTotal = total;
    await updateDeliveryFee();

  $$('.qty').forEach((button) => {
    button.addEventListener('click', () => updateQty(button.dataset.id, Number(button.dataset.q)));
  });

  $$('.del').forEach((button) => {
    button.addEventListener('click', () => removeItem(button.dataset.id));
  });
}




async function updateQty(id, quantity) {
  const response = quantity < 1
    ? await supabase.from('cart_items').delete().eq('id', id)
    : await supabase.from('cart_items').update({ quantity }).eq('id', id);

  if (response.error) toast(response.error.message);
  renderCart();
}

async function removeItem(id) {
  await supabase.from('cart_items').delete().eq('id', id);
  renderCart();
}


async function initBonusBox() {
  const activeProfile = await profile(true);
  const box = $('#bonusBox');

  if (!box) return;

  userBonusBalance = Number(activeProfile?.bonus_balance || 0);

  if (userBonusBalance <= 0) {
    box.hidden = true;
    return;
  }

  box.hidden = false;
  $('#bonusBalanceText').textContent = `${money(userBonusBalance)} bonusunuz var`;
  $('#cartBonusBadge')?.removeAttribute('hidden');
  if ($('#cartBonusAmount')) $('#cartBonusAmount').textContent = money(userBonusBalance);

  $('#useBonus')?.addEventListener('change', updateBonusPreview);
  $('#bonusAmountInput')?.addEventListener('input', updateBonusPreview);

  updateBonusPreview();
}


function updateBonusPreview() {
  const useBonus = $('#useBonus');
  const input = $('#bonusAmountInput');
  const help = $('#bonusHelpText');

  const productsTotal = Number(cartCurrentTotal || 0);
  const deliveryFee = Number(cartDeliveryFee || 0);
  const baseTotal = productsTotal + deliveryFee;

  if (!input || !help) {
    cartPayableTotal = baseTotal;
    updateCartSummary(0);
    return;
  }

  const maxBonus = Math.min(Number(userBonusBalance || 0), baseTotal);

  input.disabled = !useBonus?.checked;

  if (!useBonus?.checked) {
    input.value = '';
    cartPayableTotal = baseTotal;
    help.textContent = `Bonus istifadə olunmayacaq. Ödəniləcək məbləğ: ${money(cartPayableTotal)}`;
    $('#cartTotal').textContent = money(cartPayableTotal);
    updateCartSummary(0);
    return;
  }

  if (!input.value) input.value = maxBonus.toFixed(2);

  let used = Number(input.value || 0);
  used = Math.min(Math.max(used, 0), maxBonus);

  input.value = used.toFixed(2);

  cartPayableTotal = Math.max(baseTotal - used, 0);

  help.textContent = `${money(used)} bonus istifadə ediləcək. Ödəniləcək məbləğ: ${money(cartPayableTotal)}`;
  $('#cartTotal').textContent = money(cartPayableTotal);
  updateCartSummary(used);
}



function validCheckoutPoint(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);

  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  if (nLat === 0 && nLng === 0) return false;

  return nLat >= 38 && nLat <= 42.5 && nLng >= 44 && nLng <= 51;
}

async function updateDeliveryFee() {
  const form = $('#checkoutForm');
  const city = form?.city_region?.value || '';
  const lat = Number(form?.lat?.value || 0);
  const lng = Number(form?.lng?.value || 0);

  const text = $('#deliveryFeeText');
  const amount = $('#deliveryFeeAmount');

  cartDeliveryFee = 0;
  cartPayableTotal = 0;
  deliveryDistanceKm = null;

  if (Number(cartCurrentTotal || 0) <= 0) {
    if (text) text.textContent = 'Səbət boşdur';
    if (amount) amount.textContent = money(0);
    if ($('#cartTotal')) $('#cartTotal').textContent = money(0);
    updateCartSummary(0);
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

  const productsTotal = Number(cartCurrentTotal || 0);

  if (settings?.free_delivery_min && productsTotal >= Number(settings.free_delivery_min)) {
    cartDeliveryFee = 0;
    if (text) text.textContent = 'Pulsuz çatdırılma aktiv oldu';
    if (amount) amount.textContent = money(0);
    updateBonusPreview();
    return;
  }

  if (regionTariff?.free_delivery_min && productsTotal >= Number(regionTariff.free_delivery_min)) {
    cartDeliveryFee = 0;
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
    deliveryDistanceKm = distanceKm(Number(settings.store_lat), Number(settings.store_lng), lat, lng);

    const tariff = (kmTariffs || []).find((row) => {
      const min = Number(row.min_km || 0);
      const max = row.max_km === null || row.max_km === undefined ? Infinity : Number(row.max_km);
      return deliveryDistanceKm >= min && deliveryDistanceKm <= max;
    });

    if (tariff) {
      cartDeliveryFee =
        Number(tariff.base_fee || 0) +
        Math.max(deliveryDistanceKm - Number(tariff.min_km || 0), 0) * Number(tariff.per_km_fee || 0);

      cartDeliveryFee = Math.max(cartDeliveryFee, Number(settings?.min_fee || 0));
      cartDeliveryFee = Number(cartDeliveryFee.toFixed(2));

      if (text) text.textContent = `${deliveryDistanceKm.toFixed(1)} km məsafəyə görə hesablandı`;
      if (amount) amount.textContent = money(cartDeliveryFee);
      updateBonusPreview();
      return;
    }
  }

  if (regionTariff) {
    cartDeliveryFee = Number(regionTariff.fixed_fee || 0);
    if (text) text.textContent = `${city} üzrə rayon tarifi`;
    if (amount) amount.textContent = money(cartDeliveryFee);
    updateBonusPreview();
    return;
  }

  cartDeliveryFee = 0;

  if (text) {
    text.textContent = city
      ? `${city} üçün çatdırılma tarifi təyin edilməyib`
      : 'Şəhər/rayon seçin və lokasiyanı götürün';
  }

  if (amount) amount.textContent = money(0);

  updateBonusPreview();
}


async function getCheckoutLocation() {
  const button = $('#getCheckoutLocation');
  const form = $('#checkoutForm');

  if (!form) return;

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
  const form = $('#checkoutForm');
  const text = $('#checkoutLocationText');

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
  const form = $('#checkoutForm');
  if (!form) return;

  form.lat.value = '';
  form.lng.value = '';

  updateCheckoutLocationText();

  cartDeliveryFee = 0;
  deliveryDistanceKm = null;

  if ($('#deliveryFeeText')) {
    $('#deliveryFeeText').textContent = 'Yeni ünvan üçün lokasiyanı götürün';
  }

  if ($('#deliveryFeeAmount')) {
    $('#deliveryFeeAmount').textContent = money(0);
  }
}


function updateCartSummary(bonusUsed = 0) {
  if ($('#summaryProducts')) $('#summaryProducts').textContent = money(cartCurrentTotal);
  if ($('#summaryDelivery')) $('#summaryDelivery').textContent = money(cartDeliveryFee);
  if ($('#summaryBonus')) $('#summaryBonus').textContent = bonusUsed > 0 ? `-${money(bonusUsed)}` : money(0);
  if ($('#summaryPayable')) $('#summaryPayable').textContent = money(cartPayableTotal || (cartCurrentTotal + cartDeliveryFee));
}



async function checkout(event) {
  event.preventDefault();

  const data = formData(event.target);

  // Sifariş tamamlananda telefondan/browserdən lokasiya icazəsi istəyirik.
  if (!data.lat || !data.lng || data.lat == 0 || data.lng == 0) {
    toast('Çatdırılma üçün lokasiya icazəsi istənir...');
    const locationPoint = await askLocation();

    if (locationPoint) {
      data.lat = locationPoint.lat;
      data.lng = locationPoint.lng;
      if ($('#checkoutForm')?.lat) $('#checkoutForm').lat.value = locationPoint.lat;
      if ($('#checkoutForm')?.lng) $('#checkoutForm').lng.value = locationPoint.lng;
    }

        if (!data.lat || !data.lng) {
          const locationPoint = await askLocation();
        
          if (locationPoint) {
            data.lat = Number(locationPoint.lat);
            data.lng = Number(locationPoint.lng);
          } else {
            toast('Lokasiya alınmadı, xəritə düzgün işləməyə bilər');
          }
        }
    }

  try {
    
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
      .eq('id', (await requireAuth()).id);
        
    const { data: orderId, error } = await supabase.rpc('create_order_from_cart_fast', {
      p_full_name: data.full_name,
      p_phone: data.phone,
      p_address_text: data.address,
      p_apartment: data.apartment || null,
      p_door_code: data.door_code || null,
      p_note: data.note || null,
      p_lat: data.lat ? Number(data.lat) : null,
      p_lng: data.lng ? Number(data.lng) : null,
      p_payment_method: data.payment_method,
      p_transaction_ref: null,
      p_receipt_url: null,
      p_bonus_used: data.use_bonus === 'on' ? Number(data.bonus_used || 0) : 0,
      p_delivery_fee: Number(cartDeliveryFee || 0),
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
    })
    .eq('id', orderId);
    
    toast('Sifariş adminə göndərildi');
    
    setTimeout(() => {
      location.href = `orders.html?track=${orderId}`;
    }, 900);
  } catch (error) {
    toast(error.message);
  }
}

  async function initOrders() {
    const activeUser = await requireAuth();
  
    // 5 dəqiqəsi bitmiş paid_hold sifarişləri əvvəl backend-də bağlayırıq.
    // Beləliklə müştəri səhifəsində köhnə status qalarsa belə düymə aktiv görünməyəcək.
    await supabase.rpc('auto_release_paid_orders');
  
    const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', activeUser.id)
    .order('created_at', { ascending: false })
    .limit(60);

  const courierIds = [...new Set((data || []).map((order) => order.courier_id).filter(Boolean))];
  const orderIds = [...new Set((data || []).map((order) => order.id).filter(Boolean))];
  const addressIds = [...new Set((data || []).map((order) => order.address_id).filter(Boolean))];

  const [{ data: couriers }, { data: locations }, { data: addresses }] = await Promise.all([
    courierIds.length
      ? supabase.from('profiles').select('id,email,first_name,last_name,phone,avatar_url').in('id', courierIds)
      : Promise.resolve({ data: [] }),

    orderIds.length
      ? supabase.from('courier_locations').select('*').in('order_id', orderIds)
      : Promise.resolve({ data: [] }),

    addressIds.length
      ? supabase.from('addresses').select('*').in('id', addressIds)
      : Promise.resolve({ data: [] }),
  ]);

  const couriersMap = new Map((couriers || []).map((courier) => [courier.id, courier]));
  const locationsMap = new Map((locations || []).map((location) => [location.order_id, location]));
  const addressesMap = new Map((addresses || []).map((address) => [address.id, address]));

  $('#ordersList').innerHTML = error
    ? `<div class="card">${error.message}</div>`
    : (data || []).map((order) =>
        orderCard(
          order,
          couriersMap.get(order.courier_id),
          locationsMap.get(order.id),
          addressesMap.get(order.address_id)
        )
      ).join('') || '<div class="card">Sifariş yoxdur.</div>';

  $$('.open-chat').forEach((button) => {
    button.addEventListener('click', () => location.href = `messages.html?order=${button.dataset.id}`);
  });

  $$('.cancel-order').forEach((button) => {
    button.addEventListener('click', () => cancelOrder(button.dataset.id));
  });

  $$('.return-order-cart').forEach((button) => {
    button.addEventListener('click', () => returnOrderToCart(button.dataset.id));
  });

  $$('.follow-user-courier').forEach((button) => {
    button.addEventListener('click', () => {
      const orderId = button.dataset.id;
      const mapData = userOrderMaps.get(orderId);

      if (!mapData || !mapData.courierMarker) {
        toast('Kuryerin konumu hələ görünmür');
        return;
      }

      mapData.followCourier = !mapData.followCourier;
      button.classList.toggle('active-status', mapData.followCourier);
      button.textContent = mapData.followCourier ? '📍 İzləmə aktivdir' : '📍 Kuryeri izlə';

      if (mapData.followCourier) {
        mapData.map.panTo(mapData.courierMarker.getLatLng(), {
          animate: true,
          duration: 0.8,
        });
      }

      userOrderMaps.set(orderId, mapData);
    });
  });

  initUserOrderMaps(data || [], couriersMap, locationsMap, addressesMap);
  updateUserCountdowns();
  
  if (!window.__meyveciUserCountdownTimer) {
    window.__meyveciUserCountdownTimer = setInterval(updateUserCountdowns, 1000);
  }
  
  subscribeOrderTracking(activeUser.id);
}


function userOrderProgress(status) {
  const steps = [
    { key: 'paid_hold', label: 'Düzəliş' },
    { key: 'ready_to_confirm', label: 'Təsdiq gözləyir' },
    { key: 'confirmed', label: 'Təsdiqləndi' },
    { key: 'preparing', label: 'Hazırlanır' },
    { key: 'ready_for_courier', label: 'Kuryerə hazır' },
    { key: 'on_the_way', label: 'Yoldadır' },
    { key: 'courier_near', label: 'Yaxındadır' },
    { key: 'delivered', label: 'Təhvil verildi' },
  ];

  const currentIndex = steps.findIndex((step) => step.key === status);

  if (status === 'cancelled') {
    return `<div class="user-order-progress cancelled">❌ Sifariş ləğv edildi</div>`;
  }

  if (status === 'refunded') {
    return `<div class="user-order-progress refunded">↩️ Məbləğ geri qaytarıldı</div>`;
  }

  return `
    <div class="user-order-progress">
      ${steps.map((step, index) => `
        <span class="${index <= currentIndex ? 'done' : ''} ${step.key === status ? 'active' : ''}">
          ${step.label}
        </span>
      `).join('')}
    </div>
  `;
}


function getOrderEditDeadlineMs(order = {}) {
  if (order.edit_deadline) {
    return new Date(order.edit_deadline).getTime();
  }

  if (order.created_at) {
    return new Date(order.created_at).getTime() + 5 * 60 * 1000;
  }

  return 0;
}



function orderCard(order, courier = null, courierLocation = null, address = {}) {
  const eta = estimateEta(
    { lat: address?.lat || order.lat, lng: address?.lng || order.lng, status: order.status },
    courierLocation
  );

  const fullAddress = [
    address?.city_region || order.city_region,
    address?.address_line || order.address_text,
    address?.apartment || order.apartment ? `Mənzil/blok: ${address?.apartment || order.apartment}` : '',
    address?.door_code || order.door_code ? `Qapı kodu: ${address?.door_code || order.door_code}` : '',
    address?.note ? `Qeyd: ${address.note}` : '',
  ].filter(Boolean).join(', ');

const deadlineMs = getOrderEditDeadlineMs(order);
const editDiff = deadlineMs - Date.now();

const isRefundFlow = ['refund_pending', 'refund_processing', 'refunded'].includes(order.status);
const isPast = ['delivered', 'cancelled', 'refunded'].includes(order.status);
const canTrack = Boolean(order.courier_id && ['on_the_way', 'courier_near'].includes(order.status));
const canShowEditBox = order.status === 'paid_hold' && editDiff > 0;
const canReturnToCart = order.status === 'paid_hold' && editDiff > 0;
const canCancel = ['pending'].includes(order.status);


  if (isRefundFlow) {
  return `
    <article class="card user-order-card refund-only-card" data-order-id="${order.id}">
      <div class="user-order-top">
        <div>
          <span class="user-order-code">${order.order_code || order.id}</span>
          <h2>${statusAz(order.status)}</h2>
          <p class="muted">${new Date(order.created_at).toLocaleString('az-AZ')}</p>
        </div>

        <div class="user-order-price">
          <b>${money(order.total_amount)}</b>
          <small>${paymentStatusAz(order.payment_status)}</small>
        </div>
      </div>

      <div class="user-order-info-grid refund-only-grid">
        <div class="user-order-info-box">
          <b>💳 Ödəniş</b>
          <span>${paymentStatusAz(order.payment_status)}</span>
        </div>

        <div class="user-order-info-box">
          <b>📦 Status</b>
          <span>${statusAz(order.status)}</span>
        </div>
      </div>

      <div class="order-actions user-order-actions">
        <button class="btn btn-primary open-chat" data-id="${order.id}">
          💬 Sifariş söhbəti
        </button>
      </div>
    </article>
  `;
}

  
  return `
    <article class="card user-order-card" data-order-id="${order.id}">
      <div class="user-order-top">
        <div>
          <span class="user-order-code">${order.order_code || order.id}</span>
          <h2>${statusAz(order.status)}</h2>
          <p class="muted">${new Date(order.created_at).toLocaleString('az-AZ')}</p>
        </div>

        <div class="user-order-price">
          <b>${money(order.total_amount)}</b>
          <small>${paymentStatusAz(order.payment_status)}</small>
        </div>
      </div>

      ${userOrderProgress(order.status)}

      <div class="user-order-info-grid">
        <div class="user-order-info-box">
          <b>💳 Ödəniş</b>
          <span>${paymentStatusAz(order.payment_status)}</span>
        </div>

        <div class="user-order-info-box">
          <b>📦 Status</b>
          <span>${statusAz(order.status)}</span>
        </div>

        <div class="user-order-info-box full">
          <b>📍 Çatdırılma ünvanı</b>
          <span>${fullAddress || 'Ünvan qeyd edilməyib'}</span>
        </div>
      </div>

      ${canShowEditBox ? `
        <div class="paid-hold-box user-paid-hold-box">
          <b>⏳ Düzəliş vaxtı aktivdir</b>
          <p>Bu müddət ərzində sifarişi səbətə qaytarıb dəyişiklik edə bilərsən.</p>
          <span class="user-countdown" data-created="${order.created_at}" data-deadline="${order.edit_deadline || ''}">
            Vaxt hesablanır...
          </span>
          <button
            class="btn btn-danger return-order-cart"
            type="button"
            data-id="${order.id}"
            ${canReturnToCart ? '' : 'disabled'}
          >
            ${canReturnToCart ? 'Sifarişi səbətə qaytar' : 'Düzəliş vaxtı bitib'}
          </button>
        </div>
      ` : ''}

      ${canTrack ? `
        <div class="user-track-panel">
          <div class="user-track-head">
            <div>
              <b>🚚 Kuryer izləmə</b>
              <small>Kuryer yolda olduqda xəritə aktiv görünür.</small>
            </div>

            <button class="btn btn-soft follow-user-courier" type="button" data-id="${order.id}">
              📍 Kuryeri izlə
            </button>
          </div>

          <div class="map-box order-live-map" id="userOrderMap-${order.id}"></div>

          <p class="muted map-note" id="userMapNote-${order.id}">
            Təxmini çatma vaxtı: ${eta}
          </p>
        </div>
      ` : ''}

      ${!canTrack && !isPast ? `
        <div class="past-order-note">
          ${order.courier_id
            ? 'Kuryer təyin olunub. Kuryer yola çıxdıqda canlı xəritə aktiv olacaq.'
            : 'Kuryer təyin olunandan sonra izləmə məlumatları görünəcək.'
          }
        </div>
      ` : ''}

      ${isPast ? `
        <div class="past-order-note">
          Bu sifariş ${statusAz(order.status).toLowerCase()}. Canlı xəritə keçmiş sifarişlərdə gizlədilir.
        </div>
      ` : ''}

      <div class="user-courier-box">
        ${courier ? `
          <div class="customer-mini">
            <img class="preview-img customer-avatar" src="${courier.avatar_url || PLACEHOLDER}" alt="Kuryer">
            <span>
              <b>${courier.first_name || ''} ${courier.last_name || ''}</b>
              <small>${courier.phone || 'Telefon yoxdur'}</small>
            </span>
          </div>
          ${courier.phone ? `<a class="btn btn-soft" href="tel:${courier.phone}">📞 Kuryerə zəng</a>` : ''}
        ` : `
          <span class="muted">Kuryer hələ təyin edilməyib.</span>
        `}
      </div>

      <div class="order-actions user-order-actions">
        <button class="btn btn-primary open-chat" data-id="${order.id}">
          💬 Sifariş söhbəti
        </button>

        ${canCancel ? `
          <button class="btn btn-danger cancel-order" data-id="${order.id}">
            Sifarişi ləğv et
          </button>
        ` : ''}
      </div>
    </article>
  `;
}



function initUserOrderMaps(orders, couriersMap, locationsMap, addressesMap = new Map()) {
  if (!window.L) return;

  userOrderMaps.forEach((mapData) => {
    mapData.map.remove();
  });
  userOrderMaps.clear();

  orders.forEach((order) => {
    if (!['on_the_way', 'courier_near'].includes(order.status)) return;

    const address = addressesMap.get(order.address_id) || {};
    const location = locationsMap.get(order.id) || {};

    const customerLat = Number(address.lat);
    const customerLng = Number(address.lng);
    const courierLat = Number(location.lat);
    const courierLng = Number(location.lng);

    const mapEl = $(`#userOrderMap-${order.id}`);
    if (!mapEl) return;

    const center = validMapPoint(courierLat, courierLng)
      ? [courierLat, courierLng]
      : validMapPoint(customerLat, customerLng)
        ? [customerLat, customerLng]
        : [40.4093, 49.8671];

    const map = L.map(mapEl, { zoomControl: false }).setView(center, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const courierIcon = makeUserMapIcon('./assets/img/icons/courier-marker.png');
    const homeIcon = makeUserMapIcon('./assets/img/icons/home-marker.png');

    let courierMarker = null;
    let homeMarker = null;

    const points = [];

    if (validMapPoint(customerLat, customerLng)) {
      homeMarker = L.marker([customerLat, customerLng], { icon: homeIcon })
        .addTo(map)
        .bindPopup('Sizin ünvanınız');
      points.push(homeMarker.getLatLng());
    }

    if (validMapPoint(courierLat, courierLng)) {
      courierMarker = L.marker([courierLat, courierLng], { icon: courierIcon })
        .addTo(map)
        .bindPopup('Kuryer');
      points.push(courierMarker.getLatLng());
    }

    if (points.length > 1) {
      map.fitBounds(points, { padding: [30, 30] });
    }

    userOrderMaps.set(order.id, {
      map,
      courierMarker,
      homeMarker,
      courierIcon,
      homeIcon,
      routeLayer: null,
      customerLat,
      customerLng,
      followCourier: false,
    });

    if (validMapPoint(courierLat, courierLng) && validMapPoint(customerLat, customerLng)) {
      drawRouteForOrder(
        order.id,
        { lat: courierLat, lng: courierLng },
        { lat: customerLat, lng: customerLng }
      );
    }

    setTimeout(() => map.invalidateSize(), 200);
  });
}


function makeUserMapIcon(url) {
  return L.icon({
    iconUrl: url,
    iconSize: [42, 42],
    iconAnchor: [21, 42],
    popupAnchor: [0, -36],
  });
}



function validMapPoint(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);

  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;

  // 0,0 problemi — xəritəni Afrikaya aparırdı
  if (nLat === 0 && nLng === 0) return false;

  // Azərbaycan üçün normal GPS sərhədi
  if (nLat < 38 || nLat > 42.5) return false;
  if (nLng < 44 || nLng > 51) return false;

  return true;
}



function estimateEta(order, location = {}) {
  const aLat = Number(location?.lat);
  const aLng = Number(location?.lng);
  const bLat = Number(order.lat);
  const bLng = Number(order.lng);

  if (validMapPoint(aLat, aLng) && validMapPoint(bLat, bLng)) {
    const km = distanceKm(aLat, aLng, bLat, bLng);
    const minutes = Math.max(5, Math.round((km / 22) * 60));
    if (minutes >= 60) return `${Math.floor(minutes / 60)} saat ${minutes % 60} dəqiqə`;
    return `${minutes} dəqiqə`;
  }

  if (order.status === 'courier_near') return '15 dəqiqə';
  if (order.status === 'on_the_way') return '35-45 dəqiqə';
  if (order.status === 'preparing') return '45-60 dəqiqə';
  if (order.status === 'delivered') return 'Təhvil verildi';
  return '30-50 dəqiqə';
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapNavigationLinks(lat, lng) {
  const destLat = Number(lat);
  const destLng = Number(lng);

  if (!validMapPoint(destLat, destLng)) return '';

  const wazeUrl = `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`;
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
  const appleUrl = `https://maps.apple.com/?saddr=Current%20Location&daddr=${destLat},${destLng}&dirflg=d`;

  return `
    <a class="btn btn-soft map-nav-btn" href="${wazeUrl}" target="_blank" rel="noopener">🧭 Waze</a>
    <a class="btn btn-soft map-nav-btn" href="${googleUrl}" target="_blank" rel="noopener">🗺️ Google Maps</a>
    <a class="btn btn-soft map-nav-btn" href="${appleUrl}" target="_blank" rel="noopener">🍎 Apple Maps</a>
  `;
}



async function drawRouteForOrder(orderId, from, to) {
  const mapData = userOrderMaps.get(orderId);
  if (!mapData) return;

  const fromLat = Number(from.lat);
  const fromLng = Number(from.lng);
  const toLat = Number(to.lat);
  const toLng = Number(to.lng);

  if (!validMapPoint(fromLat, fromLng) || !validMapPoint(toLat, toLng)) return;

  if (mapData.routeLayer) {
    mapData.map.removeLayer(mapData.routeLayer);
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes[0]) {
      mapData.routeLayer = L.geoJSON(data.routes[0].geometry, {
        style: { color: '#16a34a', weight: 5, opacity: 0.9 },
      }).addTo(mapData.map);
    } else {
      mapData.routeLayer = L.polyline(
        [[fromLat, fromLng], [toLat, toLng]],
        { color: '#16a34a', weight: 5, opacity: 0.9, dashArray: '8,8' }
      ).addTo(mapData.map);
    }

    userOrderMaps.set(orderId, mapData);
  } catch (e) {
    mapData.routeLayer = L.polyline(
      [[fromLat, fromLng], [toLat, toLng]],
      { color: '#16a34a', weight: 5, opacity: 0.9, dashArray: '8,8' }
    ).addTo(mapData.map);

    userOrderMaps.set(orderId, mapData);
  }
}



async function refreshUserCourierLocations() {
  const orderIds = [...userOrderMaps.keys()];

  if (!orderIds.length) return;

  const { data, error } = await supabase
    .from('courier_locations')
    .select('*')
    .in('order_id', orderIds);

  if (error) {
    console.log('Müştəri xəritəsi lokasiya oxuma xətası:', error);
    return;
  }

  (data || []).forEach((location) => {
    updateUserCourierMarker(location);
  });
}

function updateUserCourierMarker(location) {
  if (!location) return;

  const mapData = userOrderMaps.get(location.order_id);
  if (!mapData) return;

  const courierLat = Number(location.lat);
  const courierLng = Number(location.lng);

  if (!validMapPoint(courierLat, courierLng)) return;

  const courierPoint = [courierLat, courierLng];

  if (mapData.courierMarker) {
    animateUserMarker(mapData.courierMarker, courierPoint);
  } else {
    mapData.courierMarker = L.marker(courierPoint, { icon: mapData.courierIcon })
      .addTo(mapData.map)
      .bindPopup('Kuryer');
  }

  const customerLat = Number(mapData.customerLat);
  const customerLng = Number(mapData.customerLng);

  if (validMapPoint(customerLat, customerLng)) {
    drawRouteForOrder(
      location.order_id,
      { lat: courierLat, lng: courierLng },
      { lat: customerLat, lng: customerLng }
    );

    const eta = estimateEta(
      { lat: customerLat, lng: customerLng },
      { lat: courierLat, lng: courierLng }
    );

    const note = $(`#userMapNote-${location.order_id}`);

    if (note) {
      note.textContent = `Kuryer canlı hərəkətdədir • Təxmini çatma vaxtı: ${eta}`;
    }
  }

  if (mapData.followCourier) {
    mapData.map.panTo(courierPoint, {
      animate: true,
      duration: 0.8,
    });
  }

  mapData.map.invalidateSize();
  userOrderMaps.set(location.order_id, mapData);
}




// Sifariş/lokasiya dəyişəndə istifadəçinin xəritəsi realtime yenilənir.
// Kuryer hərəkət edəndə artıq bütün səhifə yox, sadəcə marker və yol xətti yenilənir.
function subscribeOrderTracking(userId) {
  supabase
    .channel(`user-orders-live-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
      initOrders();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_locations' }, (payload) => {
      updateUserCourierMarker(payload.new);
    })
    .subscribe();

  if (userTrackingTimer) clearInterval(userTrackingTimer);

  userTrackingTimer = setInterval(() => {
    refreshUserCourierLocations();
  }, 5000);
}


// Sifarişi ləğv etmə RPC ilə edilir.
// Beləliklə RLS və status qaydası backend tərəfdə də qorunur.
async function cancelOrder(orderId) {
  if (!orderId) return;

  if (!confirm('Sifarişi ləğv etmək istədiyinizə əminsiniz?')) return;

  const { data, error } = await supabase.rpc('cancel_my_order', {
    p_order_id: orderId,
    p_cancel_note: 'İstifadəçi təsdiqdən əvvəl sifarişi ləğv etdi',
  });

  if (error) {
    toast(error.message);
    return;
  }

  if (data === false) {
    toast('Bu sifariş artıq təsdiqlənib. Ləğv üçün mağaza ilə əlaqə saxlayın.');
    await initOrders();
    return;
  }

  toast('Sifariş ləğv edildi');
  await initOrders();
}

function statusIcon(status) {
  const map = {
    confirmed: 'assets/img/icons/order-confirmed.png',
    preparing: 'assets/img/icons/order-preparing.png',
    on_the_way: 'assets/img/icons/order-delivery.png',
    courier_near: 'assets/img/icons/order-delivery.png',
    delivered: 'assets/img/icons/order-delivered.png',
    cancelled: 'assets/img/icons/Legv-edildi-icon.png',
  };
  return map[status] || 'assets/img/icons/order-confirmed.png';
}

async function initProfile() {
  const activeProfile = await profile(true);

  if (!activeProfile) {
    $('#profileBox').innerHTML = '<div class="card">Profil yüklənmədi.</div>';
    return;
  }

  const form = $('#profileForm');

  form.first_name.value = activeProfile.first_name || '';
  form.last_name.value = activeProfile.last_name || '';
  form.phone.value = activeProfile.phone || '';
  fillCityRegionSelect(form, activeProfile.city_region || '');
  form.address_line.value = activeProfile.address_line || '';
  form.apartment.value = activeProfile.apartment || '';
  form.door_code.value = activeProfile.door_code || '';
  form.lat.value = activeProfile.lat || '';
  form.lng.value = activeProfile.lng || '';
  form.bio.value = activeProfile.bio || '';
  
  updateProfileLocationText();
  
  $('#getProfileLocation')?.addEventListener('click', getProfileLocation);

  $('#profileEmail').textContent = activeProfile.email || '';
  $('#profileRole').textContent = activeProfile.role || 'user';

  if (activeProfile.avatar_url) $('#avatarPreview').src = activeProfile.avatar_url;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = formData(event.target);

    try {
      let avatarUrl = activeProfile.avatar_url;

      if ($('#avatarFile').files[0]) {
        avatarUrl = await uploadFile('avatars', $('#avatarFile').files[0], 'avatars');
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone,
          city_region: data.city_region,
          address_line: data.address_line,
          apartment: data.apartment,
          door_code: data.door_code,
          lat: data.lat ? Number(data.lat) : null,
          lng: data.lng ? Number(data.lng) : null,
          bio: data.bio,
          avatar_url: avatarUrl,
        })
        .eq('id', activeProfile.id);

      if (error) {
        toast(error.message);
        return;
      }
      
      toast('Profil yeniləndi');
      
      setTimeout(() => {
        location.href = 'index.html';
      }, 700);
      
    } catch (error) {
      toast(error.message);
    }
  });
}


async function getProfileLocation() {
  const button = $('#getProfileLocation');
  const form = $('#profileForm');

  if (!form || !button) return;

  button.disabled = true;
  button.textContent = '📍 Konum alınır...';

  const locationPoint = await askLocation();

  if (locationPoint) {
    form.lat.value = locationPoint.lat;
    form.lng.value = locationPoint.lng;

    updateProfileLocationText();
    toast('Konum təyin edildi');
  } else {
    toast('Konum alınmadı');
  }

  button.disabled = false;
  button.textContent = '📍 Konumu təyin et';
}

function updateProfileLocationText() {
  const form = $('#profileForm');
  const text = $('#profileLocationText');

  if (!form || !text) return;

  const lat = Number(form.lat?.value || 0);
  const lng = Number(form.lng?.value || 0);

  if (lat && lng) {
    text.textContent = `Konum seçildi: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    text.classList.add('ok');
  } else {
    text.textContent = 'Konum seçilməyib';
    text.classList.remove('ok');
  }
}


async function initMessages() {
  await startPresenceLive();

  const orderId = new URLSearchParams(location.search).get('order');

  // Sifarişdən gələndə həmin sifariş üçün söhbəti avtomatik açırıq.
  if (orderId) {
    const { data: threadId, error } = await supabase.rpc('create_or_get_order_thread', {
      p_order_id: orderId,
    });

    if (error) toast(error.message);

    if (threadId) {
      await loadThreads(threadId);
      $('#sendMessageForm')?.addEventListener('submit', sendMessage);
      subscribeMessageRealtime();
      initChatImageTools();
      return;
    }
  }

  await loadThreads();
  $('#sendMessageForm')?.addEventListener('submit', sendMessage);
  subscribeMessageRealtime();
  initChatImageTools();
}

//=============================================================================

async function loadThreads(autoOpenThreadId = null) {
  const activeUser = await requireAuth();

  const { data, error } = await supabase
    .from('chat_threads')
    .select('id,title,order_id,last_message_at,courier_id')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50);

  const list = $('#threadList');

  if (error) {
    list.innerHTML = `<div class="card">${error.message}</div>`;
    return;
  }

  const threads = data || [];
  const threadIds = [...new Set(threads.map((thread) => thread.id).filter(Boolean))];
  const orderIds = [...new Set(threads.map((thread) => thread.order_id).filter(Boolean))];

  const { data: orders } = orderIds.length
    ? await supabase
      .from('orders')
      .select(`
        id,
        order_code,
        user_id,
        courier_id,
        status,
        payment_method,
        payment_status,
        customer_note,
        total_amount,
        created_at,
        city_region
      `)
      .in('id', orderIds)
    : { data: [] };

      const profileIds = [
        ...new Set([
          ...(threads || []).flatMap((thread) => [thread.user_id, thread.courier_id]),
          ...(orders || []).flatMap((order) => [order.user_id, order.courier_id]),
        ].filter(Boolean)),
      ];

  const { data: profiles } = profileIds.length
    ? await supabase
        .from('profiles')
        .select(`
          id,
          email,
          first_name,
          last_name,
          phone,
          role,
          avatar_url,
          city_region,
          address_line,
          apartment,
          door_code,
          bio,
          is_active,
          is_online,
          last_seen
        `)
      .in('id', profileIds)
    : { data: [] };

  const { data: unreadMessages } = threadIds.length
    ? await supabase
      .from('chat_messages')
      .select('id,thread_id,sender_id,is_read')
      .in('thread_id', threadIds)
      .eq('is_read', false)
      .neq('sender_id', activeUser.id)
    : { data: [] };

  const profilesMap = new Map((profiles || []).map((item) => [item.id, item]));
  const unreadMap = new Map();

  (unreadMessages || []).forEach((message) => {
    unreadMap.set(message.thread_id, (unreadMap.get(message.thread_id) || 0) + 1);
  });

  allUserThreads = threads;
  allUserThreadOrdersMap = new Map((orders || []).map((order) => [order.id, order]));
  allUserThreadCustomersMap = new Map();
  allUserThreadCouriersMap = new Map();
  allUserThreadUnreadMap = unreadMap;

  (orders || []).forEach((order) => {
    if (order.user_id) allUserThreadCustomersMap.set(order.id, profilesMap.get(order.user_id) || {});
    if (order.courier_id) allUserThreadCouriersMap.set(order.id, profilesMap.get(order.courier_id) || {});
  });

  renderThreadList(autoOpenThreadId);
  setupThreadSearch();
  initProfileInfoModal();

  if (autoOpenThreadId && currentThread !== autoOpenThreadId) {
    openThread(autoOpenThreadId);
  } else if (threads?.[0] && !currentThread) {
    openThread(threads[0].id);
  }
}

//=========mesaj siyahısı LİMİTSİZ================================================================

      function getThreadLimit() {
        return Infinity;
      }

//================================================================================================

function renderThreadList(autoOpenThreadId = null) {
  const list = $('#threadList');
  const searchValue = ($('#threadSearch')?.value || '').trim().toLowerCase();

  let filteredThreads = allUserThreads.filter((thread) => {
    const order = allUserThreadOrdersMap.get(thread.order_id) || {};
    const customer = allUserThreadCustomersMap.get(thread.order_id) || {};
    const courier = allUserThreadCouriersMap.get(thread.order_id) || {};

    const orderCode = getOrderCode(thread, order);

    const searchText = [
      thread.title,
      orderCode,
      order.full_name,
      order.phone,
      order.city_region,
      order.address_text,
      customer.first_name,
      customer.last_name,
      courier.first_name,
      courier.last_name,
    ].join(' ').toLowerCase();

    return !searchValue || searchText.includes(searchValue);
  });

  filteredThreads = filteredThreads.slice(0, getThreadLimit());

  list.innerHTML = filteredThreads.map((thread) => {
    const order = allUserThreadOrdersMap.get(thread.order_id) || {};
    const customer = allUserThreadCustomersMap.get(thread.order_id) || {};
    const courier = allUserThreadCouriersMap.get(thread.order_id) || {};
    const unreadCount = allUserThreadUnreadMap.get(thread.id) || 0;

    const orderCode = getOrderCode(thread, order);

    const customerName = cleanText(
      `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
      'Müştəri'
    );

    const courierName = cleanText(
      `${courier.first_name || ''} ${courier.last_name || ''}`.trim() ||
      'Kuryer təyin edilməyib'
    );

    const customerOnline = isProfileOnline(customer);
    const courierOnline = isProfileOnline(courier);

    return `
      <article class="thread-mini-card ${currentThread === thread.id ? 'active-thread' : ''}" data-id="${thread.id}">
        <button class="thread-mini-avatar thread-profile-click" type="button" data-profile-type="customer" data-order-id="${thread.order_id}">
          <img src="${customer.avatar_url || PLACEHOLDER}" alt="${customerName}">
        </button>

        <div class="thread-mini-body">
          <div class="thread-mini-top">
            <button class="thread-mini-name thread-profile-click" type="button" data-profile-type="customer" data-order-id="${thread.order_id}">
              <span class="online-dot ${customerOnline ? 'online' : 'offline'}"></span>
              ${customerName}
            </button>

            <div class="thread-mini-right">
              ${unreadCount ? `<span class="thread-unread-badge">${unreadCount}</span>` : ''}
              <small>${formatThreadTime(thread.last_message_at)}</small>
            </div>
          </div>

          <div class="thread-mini-code">${cleanText(orderCode)}</div>

          <div class="thread-mini-info">
            <span>📞 ${cleanText(customer.phone || 'Telefon yoxdur')}</span>
            <span>📍 ${cleanText([customer.city_region || order.city_region, customer.address_line].filter(Boolean).join(', ') || 'Ünvan yoxdur')}</span>
            <button class="thread-order-items-btn" type="button" data-order-id="${order.id}">
              💰 ${money(order.total_amount || 0)}
            </button>
            <span>📦 ${statusAz(order.status)}</span>
          </div>

          <div class="thread-mini-courier">
            <span>Kuryer:</span>
            <button class="thread-profile-click" type="button" data-profile-type="courier" data-order-id="${thread.order_id}" ${courier.id ? '' : 'disabled'}>
              <span class="online-dot ${courierOnline ? 'online' : 'offline'}"></span>
              ${courierName}
            </button>
          </div>
        </div>
      </article>
    `;
  }).join('') || '<span class="muted">Söhbət tapılmadı.</span>';

  $$('.thread-mini-card').forEach((card) => {
    card.addEventListener('click', () => openThread(card.dataset.id));
  });

  $$('.thread-order-items-btn').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openOrderItemsModal(button.dataset.orderId);
  });
});
  
  $$('.thread-profile-click').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openProfileInfoModal(button.dataset.orderId, button.dataset.profileType);
    });
  });
}

//================================================================================================

function setupThreadSearch() {
  const input = $('#threadSearch');
  if (!input || input.dataset.ready === '1') return;

  input.dataset.ready = '1';

  input.addEventListener('input', () => {
    renderThreadList(currentThread);
  });

  window.addEventListener('resize', () => {
    renderThreadList(currentThread);
  });
}

//=====================================================================

async function openThread(id) {
  currentThread = id;
  renderThreadList(currentThread);

  // Mesajları ayrıca, profilləri ayrıca oxuyuruq.
  // Beləliklə kuryer öz yazdığı mesajı da, müştərinin cavabını da görə bilir.
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id,message_text,attachment_url,attachment_type,sender_id,sender_role,sender_name,sender_phone,created_at,is_read')
    .eq('thread_id', id)
    .order('created_at')
    .limit(160);

  const activeUser = await requireAuth();
  const senderIds = [...new Set((data || []).map((message) => message.sender_id).filter(Boolean))];
  const { data: profiles } = senderIds.length
    ? await supabase.from('profiles').select('id,first_name,last_name,phone,role').in('id', senderIds)
    : { data: [] };

  const profilesMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

  $('#chatBox').innerHTML = error
    ? error.message
    : (data || []).map((message) => {
      const sender = profilesMap.get(message.sender_id) || {};
      const fullName = message.sender_name || `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || 'İstifadəçi';
      const role = message.sender_role || sender.role || 'user';
      const phone = message.sender_phone || sender.phone || 'Telefon yoxdur';
      const isMe = message.sender_id === activeUser.id;

      return `
        <div class="msg ${isMe ? 'me' : ''} ${!message.is_read && !isMe ? 'unread-message' : ''}">
          <b>${fullName}</b>
          <small class="msg-meta">${roleAz(role)} • ${new Date(message.created_at).toLocaleString('az-AZ')}</small>
          <br>${message.message_text || ''}
          ${message.attachment_url ? `
            <img 
              class="chat-image-message" 
              src="${message.attachment_url}" 
              alt="Göndərilən şəkil"
              data-zoom="${message.attachment_url}"
            >
          ` : ''}
        </div>
      `;
    }).join('') || '<span class="muted">Mesaj yoxdur.</span>';

    await supabase.rpc('mark_thread_read', { p_thread_id: id });
    
    allUserThreadUnreadMap.set(id, 0);
    renderThreadList(currentThread);
    
      const chatBox = $('#chatBox');
      if (chatBox) {
        setTimeout(() => {
          chatBox.scrollTo({
            top: chatBox.scrollHeight,
            behavior: 'smooth',
          });
        }, 80);
      }
    
    $$('.chat-image-message').forEach((img) => {
    img.addEventListener('click', () => openImageZoom(img.dataset.zoom));
  });
}


function roleAz(role) {
  const map = {
    admin: 'Admin',
    warehouse: 'Anbardar',
    courier: 'Kuryer',
    user: 'Müştəri',
  };

  return map[role] || role || 'İstifadəçi';
}


function paymentStatusAz(status) {
  const map = {
    pending: 'Ödəniş gözlənilir',

    paid: 'Ödənildi',
    approved: 'Təsdiqləndi',
    confirmed: 'Təsdiqləndi',

    rejected: 'Rədd edildi',
    cancelled: 'Ləğv edildi',
    failed: 'Ödəniş alınmadı',

    refund_pending: 'Geri ödəniş gözləyir',
    refund_processing: 'Geri ödəniş icra olunur',
    refunded: 'Geri qaytarıldı',
  };

  return map[status] || status || 'Ödəniş gözlənilir';
}


function formatQty(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? number : number.toFixed(2).replace(/\.?0+$/, '');
}

function unitLabel(unit = '') {
  const text = String(unit || 'ədəd').trim();

  // Əgər unit bazada "1 kq" kimi yazılıbsa, modalda qarışıqlıq olmasın deyə "kq" göstəririk.
  return text.replace(/^1\s+/i, '');
}

function getOrderCode(thread = {}, order = {}) {
  if (order.order_code) return order.order_code;

  const title = String(thread.title || '');
  const match = title.match(/MV-\d{8}-[A-Z0-9]+/i);

  return match ? match[0] : `№ ${String(thread.order_id || '').slice(0, 8)}`;
}

function isProfileOnline(profileData = {}) {
  if (!profileData || !Object.keys(profileData).length) return false;

  const lastSeen = profileData.last_seen ? new Date(profileData.last_seen).getTime() : 0;
  const now = Date.now();

  return profileData.is_online === true && now - lastSeen <= 7000;
}


async function startPresenceLive() {
  await updateMyPresence(true);

  if (presenceTimer) clearInterval(presenceTimer);

  presenceTimer = setInterval(() => {
    updateMyPresence(true);
  }, 5000);

  window.addEventListener('beforeunload', () => {
    updateMyPresence(false);
  });

  document.addEventListener('visibilitychange', () => {
    updateMyPresence(!document.hidden);
  });
}


async function openOrderItemsModal(orderId) {
  const modal = $('#orderItemsModal');
  const body = $('#orderItemsBody');

  if (modal && modal.parentElement !== document.body) {
  document.body.appendChild(modal);
  }
  
  if (!modal || !body || !orderId) return;

  body.innerHTML = '<p class="muted">Məhsullar yüklənir...</p>';
  modal.classList.add('show');

  const { data: items, error } = await supabase
    .from('order_items')
    .select('id,order_id,product_id,product_name,quantity,unit_price,line_total')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) {
    body.innerHTML = `<p class="muted">${cleanText(error.message)}</p>`;
    return;
  }

  const productIds = [...new Set((items || []).map((item) => item.product_id).filter(Boolean))];

  const { data: products } = productIds.length
    ? await supabase
      .from('products')
      .select('id,name,image_url,unit')
      .in('id', productIds)
    : { data: [] };

  const { data: payment } = await supabase
  .from('payments')
  .select('status,amount')
  .eq('order_id', orderId)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();
  
  const productsMap = new Map((products || []).map((product) => [product.id, product]));
  const total = (items || []).reduce((sum, item) => sum + Number(item.line_total || 0), 0);

  body.innerHTML = `
      <div class="order-items-head">
        <h3>Sifariş məhsulları</h3>
      
        <div class="order-items-summary">
          <span class="payment-status-pill payment-${payment?.status || 'pending'}">
            ${paymentStatusAz(payment?.status || 'pending')}
          </span>
          <span class="order-items-total">${money(total)}</span>
        </div>
      </div>

    <div class="order-items-list">
      ${(items || []).map((item) => {
        const product = productsMap.get(item.product_id) || {};
        const name = item.product_name || product.name || 'Məhsul';
        const unit = product.unit || 'ədəd';

        return `
          <div class="order-item-row">
            <img src="${product.image_url || PLACEHOLDER}" alt="${cleanText(name)}">

            <div>
              <b>${cleanText(name)}</b>
              <small>
              Sifariş verildi: ${formatQty(item.quantity)} ${cleanText(unitLabel(unit))}  •  
              Vahid qiymət: ${money(item.unit_price || 0)}
              </small>
            </div>

            <strong>${money(item.line_total || 0)}</strong>
          </div>
        `;
      }).join('') || '<p class="muted">Bu sifarişdə məhsul tapılmadı.</p>'}
    </div>
  `;
}

function closeOrderItemsModal() {
  $('#orderItemsModal')?.classList.remove('show');
}

//====================================================================================

function cleanText(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatThreadTime(value) {
  if (!value) return 'Vaxt yoxdur';

  const date = new Date(value);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);

  if (diffMin < 1) return 'İndi';
  if (diffMin < 60) return `${diffMin} dəq əvvəl`;
  if (diffHour < 24) return `${diffHour} saat əvvəl`;

  return date.toLocaleString('az-AZ', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initProfileInfoModal() {
  const modal = $('#profileInfoModal');

  if (modal && modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  $('#closeProfileInfoModal')?.addEventListener('click', closeProfileInfoModal);

  $('#profileInfoModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'profileInfoModal') closeProfileInfoModal();
  });

  $('#closeOrderItemsModal')?.addEventListener('click', closeOrderItemsModal);

  $('#orderItemsModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'orderItemsModal') closeOrderItemsModal();
  });
}

function openProfileInfoModal(orderId, type = 'customer') {
  const modal = $('#profileInfoModal');
  const body = $('#profileInfoBody');

  if (!modal || !body) return;

  const order = allUserThreadOrdersMap.get(orderId) || {};
  const profileData = type === 'courier'
    ? allUserThreadCouriersMap.get(orderId)
    : allUserThreadCustomersMap.get(orderId);

  if (!profileData || !Object.keys(profileData).length) {
    toast(type === 'courier' ? 'Kuryer profili hələ təyin edilməyib' : 'Müştəri profili tapılmadı');
    return;
  }

  const fullName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || order.full_name || 'Profil';
  const role = roleAz(profileData.role || (type === 'courier' ? 'courier' : 'user'));

  body.innerHTML = `
    <div class="profile-info-hero">
      <img src="${profileData.avatar_url || PLACEHOLDER}" alt="${cleanText(fullName)}">
      <div>
        <h3>${cleanText(fullName)}</h3>
        <span>${cleanText(role)}</span>
      </div>
    </div>

    <div class="profile-info-list">
      <div><b>Email</b><span>${cleanText(profileData.email || 'Email yoxdur')}</span></div>
      <div><b>Telefon</b><span>${cleanText(profileData.phone || order.phone || 'Telefon yoxdur')}</span></div>
      <div><b>Rol</b><span>${cleanText(role)}</span></div>
      <div><b>Şəhər / rayon</b><span>${cleanText(profileData.city_region || order.city_region || 'Qeyd edilməyib')}</span></div>
      <div><b>Ünvan</b><span>${cleanText(profileData.address_line || order.address_text || 'Qeyd edilməyib')}</span></div>
      <div><b>Mənzil / blok</b><span>${cleanText(profileData.apartment || order.apartment || 'Qeyd edilməyib')}</span></div>
      <div><b>Qapı kodu</b><span>${cleanText(profileData.door_code || order.door_code || 'Qeyd edilməyib')}</span></div>
      <div class="profile-info-full"><b>Bio / qeydlər</b><span>${cleanText(profileData.bio || 'Qeyd yoxdur')}</span></div>
    </div>
  `;

  modal.classList.add('show');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

function closeProfileInfoModal() {
  const modal = $('#profileInfoModal');
  if (!modal) return;

  modal.classList.remove('show');

  if (!$('#imageZoomModal')?.classList.contains('show')) {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  }
}

//====================================================================================

// Mesaj səhifəsi açıq qalanda yeni mesajlar realtime görünür, F5 tələb olunmur.
function subscribeMessageRealtime() {
  supabase
    .channel('user-message-page-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      async (payload) => {
        const newMessage = payload.new;

        if (newMessage.thread_id === currentThread) {
          await openThread(currentThread);
          await loadThreads();
          return;
        }

        await loadThreads();
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_threads' },
      async () => {
        await loadThreads();
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles' },
      (payload) => {
        const updatedProfile = payload.new;

        allUserThreadCustomersMap.forEach((customer, orderId) => {
          if (customer?.id === updatedProfile.id) {
            allUserThreadCustomersMap.set(orderId, updatedProfile);
          }
        });

        allUserThreadCouriersMap.forEach((courier, orderId) => {
          if (courier?.id === updatedProfile.id) {
            allUserThreadCouriersMap.set(orderId, updatedProfile);
          }
        });

        renderThreadList(currentThread);
      }
    )
    .subscribe();
}

//=============================================================================================


async function sendMessage(event) {
  event.preventDefault();

  if (!currentThread) return toast('Söhbət seçilməyib');

  const text = $('#messageInput').value.trim();
  const galleryFile = $('#chatGalleryInput')?.files?.[0];
  const cameraFile = $('#chatCameraInput')?.files?.[0];
  const imageFile = galleryFile || cameraFile;

  if (!text && !imageFile) {
    return toast('Mesaj və ya şəkil əlavə edin');
  }

  try {
    let attachmentUrl = null;

    if (imageFile) {
      attachmentUrl = await uploadFile('chat-attachments', imageFile, 'messages');

      if (!attachmentUrl) {
        return toast('Şəkil yolu tapılmadı');
      }
    }

    const { error } = await supabase.rpc('send_chat_message', {
      p_thread_id: currentThread,
      p_message_text: text || (attachmentUrl ? 'Şəkil göndərildi' : ''),
      p_attachment_url: attachmentUrl,
      p_attachment_type: attachmentUrl ? 'image' : null,
    });

    if (error) throw error;

    $('#messageInput').value = '';

    if ($('#chatGalleryInput')) $('#chatGalleryInput').value = '';
    if ($('#chatCameraInput')) $('#chatCameraInput').value = '';
    if ($('#chatImagePreview')) $('#chatImagePreview').innerHTML = '';

    await openThread(currentThread);
  } catch (error) {
    toast(error.message);
  }
}





function initChatImageTools() {
  const modal = $('#imageZoomModal');

    if (modal && modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
  
  const galleryInput = $('#chatGalleryInput');
  const cameraInput = $('#chatCameraInput');
  const preview = $('#chatImagePreview');

  [galleryInput, cameraInput].forEach((input) => {
    if (!input || input.dataset.ready === '1') return;

    input.dataset.ready = '1';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file || !preview) return;

      preview.innerHTML = `
        <div class="chat-preview-box">
          <img src="${URL.createObjectURL(file)}" alt="Seçilmiş şəkil">
          <button type="button" id="removeChatImage">×</button>
        </div>
      `;

      $('#removeChatImage')?.addEventListener('click', () => {
        input.value = '';
        preview.innerHTML = '';
      });
    });
  });

  $('#closeImageZoom')?.addEventListener('click', closeImageZoom);

  $('#imageZoomModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'imageZoomModal') closeImageZoom();
  });
}



/**======= ŞƏKİL ZOOM ===============================================*/

function openImageZoom(url) {
  const modal = $('#imageZoomModal');
  const img = $('#zoomImage');

  if (!modal || !img) return;

  if (modal.parentElement !== document.body) {
    document.body.appendChild(modal);
  }

  img.src = url;
  modal.classList.add('show');

  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

function closeImageZoom() {
  const modal = $('#imageZoomModal');
  const img = $('#zoomImage');

  if (!modal || !img) return;

  modal.classList.remove('show');
  img.src = '';

  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
}

/*===================================================================*/

function fallbackLine(mapData, lat1, lng1, lat2, lng2) {
  mapData.routeLayer = L.polyline(
    [[lat1, lng1], [lat2, lng2]],
    { color: '#16a34a', weight: 5, opacity: 0.9, dashArray: '8,8' }
  ).addTo(mapData.map);
}

/*===================================================================*/

function animateUserMarker(marker, target) {
  const start = marker.getLatLng();
  const end = L.latLng(target[0], target[1]);

  const duration = 800;
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);

    const lat = start.lat + (end.lat - start.lat) * progress;
    const lng = start.lng + (end.lng - start.lng) * progress;

    marker.setLatLng([lat, lng]);

    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/*===================================================================*/

async function returnOrderToCart(orderId) {
  if (!orderId) return;

  const button = document.querySelector(`.return-order-cart[data-id="${orderId}"]`);

  if (button?.disabled) {
    toast('5 dəqiqəlik düzəliş vaxtı bitib. Sifarişi səbətə qaytarmaq mümkün deyil.');
    return;
  }

  if (!confirm('Sifariş məhsulları səbətə qaytarılsın? Ödəniş olunubsa, geri ödəniş prosesi başladılacaq.')) return;

  if (button) {
    button.disabled = true;
    button.textContent = 'Gözləyin...';
  }

  const { data, error } = await supabase.rpc('restore_paid_hold_order_to_cart', {
    p_order_id: orderId,
  });

  if (error) {
    toast(error.message);
    if (button) {
      button.disabled = false;
      button.textContent = 'Sifarişi səbətə qaytar';
    }
    return;
  }

  if (data === false) {
    toast('5 dəqiqəlik düzəliş vaxtı bitib. Sifarişi səbətə qaytarmaq mümkün deyil.');
    await initOrders();
    return;
  }

  toast('Məhsullar səbətə qaytarıldı. Geri ödəniş mağaza tərəfindən icra olunacaq.');

  setTimeout(() => {
    location.href = 'cart.html';
  }, 800);
}

/*===================================================================*/

function updateUserCountdowns() {
  document.querySelectorAll('.user-countdown').forEach((el) => {
    const created = new Date(el.dataset.created).getTime();
    const fallbackDeadline = created + 5 * 60 * 1000;

    const deadline = el.dataset.deadline
      ? new Date(el.dataset.deadline).getTime()
      : fallbackDeadline;

    const diff = deadline - Date.now();
    const card = el.closest('.user-paid-hold-box');
    const button = card?.querySelector('.return-order-cart');

    if (diff <= 0) {
      el.textContent = 'Düzəliş vaxtı bitdi';

      if (button) {
        button.disabled = true;
        button.textContent = 'Düzəliş vaxtı bitib';
        button.classList.add('disabled');
      }

      return;
    }

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    el.textContent = `⏳ ${minutes}:${String(seconds).padStart(2, '0')} qaldı`;

    if (button) {
      button.disabled = false;
      button.textContent = 'Sifarişi səbətə qaytar';
      button.classList.remove('disabled');
    }
  });
}

setInterval(updateUserCountdowns, 1000);

/*===================================================================*/
/*===================================================================*/
