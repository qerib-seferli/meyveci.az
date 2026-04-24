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
} from './core.js';

import { initLayout } from './layout.js';

let currentThread = null;

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

  // Sevimlilər səhifəsində kart ana səhifədəki məhsul kartı ilə eyni görünür.
  return `
    <article class="product-card">
      ${discount ? `<span class="discount-leaf">-${discount}%</span>` : ''}
      <button class="fav-btn active remove-fav" data-id="${product.id}" title="Sevimlilərdən çıxart" aria-label="Sevimlilərdən çıxart">♥</button>
      <a class="pic" href="product.html?id=${product.id}">
        <img src="${product.image_url || PLACEHOLDER}" alt="${product.name}">
      </a>
      <div class="product-title-row">
        <h3><a href="product.html?id=${product.id}">${product.name}</a></h3>
        <span class="unit-badge">${product.unit || 'ədəd'}</span>
      </div>
      <div class="price-row">
        <span class="price">${money(product.price)}</span>
        ${product.old_price ? `<span class="old-price">${money(product.old_price)}</span>` : ''}
      </div>
      <p class="short-desc">${product.short_description || 'Təzə və keyfiyyətli məhsul.'}</p>
      <button class="btn btn-primary cart-btn add-cart" data-id="${product.id}">Səbətə at</button>
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
    .select('id,products(id,name,price,old_price,image_url,unit,short_description)')
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

  $('#paymentMethod')?.addEventListener('change', updatePaymentHelp);
  $('#checkoutForm')?.addEventListener('submit', checkout);
  updatePaymentHelp();
}

async function fillCheckoutFromProfile() {
  const activeProfile = await profile(true);
  const form = $('#checkoutForm');

  if (!activeProfile || !form) return;

  form.full_name.value = `${activeProfile.first_name || ''} ${activeProfile.last_name || ''}`.trim();
  form.phone.value = activeProfile.phone || '';
  form.address.value = activeProfile.address_line || '';
  form.apartment.value = activeProfile.apartment || '';
  form.door_code.value = activeProfile.door_code || '';
  form.lat.value = activeProfile.lat || '';
  form.lng.value = activeProfile.lng || '';
}

async function renderCart() {
  const activeUser = await requireAuth();

  const { data, error } = await supabase
    .from('cart_items')
    .select('id,quantity,products(id,name,price,image_url,unit,short_description)')
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
    total += Number(product.price) * item.quantity;

    return `
      <div class="compact-row">
        <div style="display:flex;gap:10px;align-items:center;min-width:0;">
          <img class="preview-img" src="${product.image_url || PLACEHOLDER}" alt="${product.name}">
          <div style="min-width:0;">
            <b>${product.name}</b><br>
            <small class="muted">${money(product.price)} × ${item.quantity} ${product.unit || 'ədəd'}</small>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
          <button class="btn btn-soft qty" data-id="${item.id}" data-q="${item.quantity - 1}">−</button>
          <b>${item.quantity}</b>
          <button class="btn btn-soft qty" data-id="${item.id}" data-q="${item.quantity + 1}">+</button>
          <button class="btn btn-danger del" data-id="${item.id}">Sil</button>
        </div>
      </div>
    `;
  }).join('') || '<div class="card">Səbət boşdur.</div>';

  $('#cartTotal').textContent = money(total);

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

function updatePaymentHelp() {
  const method = $('#paymentMethod')?.value;
  const help = $('#paymentHelp');

  if (!help) return;

  if (method === 'cash') {
    help.innerHTML = '<b>Nağd ödəniş:</b> ümumi məbləğ məhsullar təhvil veriləndə kuryerə ödəniləcək.';
  }

  if (method === 'card_transfer') {
    help.innerHTML = '<b>Kart köçürməsi:</b> 4169 7388 0000 0000 kartına ödəniş edin və çek şəklini yükləyin.';
  }

  if (method === 'pos') {
    help.innerHTML = '<b>POS terminal:</b> yaxın ərazilərdə kuryerin üzərindəki POS terminal vasitəsilə ödəniş edə bilərsiniz.';
  }

  if (method === 'online_payment') {
    help.innerHTML = '<b>Online ödəniş:</b> gələcək mərhələdə bank/payment inteqrasiyası qoşulduqda avtomatik ödəniş aktiv olacaq.';
  }

  help.classList.add('show');
}

async function checkout(event) {
  event.preventDefault();

  const data = formData(event.target);
  const receiptFile = $('#receiptFile')?.files?.[0];

  // Sifariş tamamlananda telefondan/browserdən lokasiya icazəsi istəyirik.
  if (!data.lat || !data.lng) {
    toast('Çatdırılma üçün lokasiya icazəsi istənir...');
    const locationPoint = await askLocation();

    if (locationPoint) {
      data.lat = locationPoint.lat;
      data.lng = locationPoint.lng;
      if ($('#checkoutForm')?.lat) $('#checkoutForm').lat.value = locationPoint.lat;
      if ($('#checkoutForm')?.lng) $('#checkoutForm').lng.value = locationPoint.lng;
    }
  }

  try {
    let receiptUrl = null;

    if (receiptFile) {
      receiptUrl = await uploadFile('receipts', receiptFile, 'receipts');
    }

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
      p_transaction_ref: data.transaction_ref || null,
      p_receipt_url: receiptUrl,
    });

    if (error) throw error;

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

  const { data, error } = await supabase
    .from('orders')
    .select('*,profiles!orders_courier_id_fkey(first_name,last_name,phone,avatar_url)')
    .eq('user_id', activeUser.id)
    .order('created_at', { ascending: false })
    .limit(60);

  $('#ordersList').innerHTML = error
    ? `<div class="card">${error.message}</div>`
    : (data || []).map(orderCard).join('') || '<div class="card">Sifariş yoxdur.</div>';

  $$('.open-chat').forEach((button) => {
    button.addEventListener('click', () => location.href = `messages.html?order=${button.dataset.id}`);
  });
  $$('.cancel-order').forEach((button) => {
    button.addEventListener('click', () => cancelOrder(button.dataset.id, button.dataset.status));
  });
}

function orderCard(order) {
  const courier = order.profiles;
  const eta = estimateEta(order);

  // Sifariş status ikonları xəritənin içində yox, status sözünün yanında göstərilir.
  return `
    <div class="card">
      <div class="section-head">
        <div>
          <b>${order.order_code}</b>
          <p class="muted">${new Date(order.created_at).toLocaleString('az-AZ')}</p>
        </div>
        <span class="status-pill"><img src="${statusIcon(order.status)}" alt="Status">${statusAz(order.status)}</span>
      </div>

      <p><b>Məbləğ:</b> ${money(order.total_amount)} • <b>Ödəniş:</b> ${statusAz(order.payment_status)}</p>

      ${['delivered','cancelled'].includes(order.status) ? `
        <div class="past-order-note">Bu sifariş artıq ${statusAz(order.status).toLowerCase()}. Canlı xəritə keçmiş sifarişlərdə gizlədilir.</div>
      ` : `
        <div class="map-box order-track-box live-map-preview">
          <div class="map-marker courier-marker"><img src="assets/img/icons/courier-marker.png" alt="Kuryer"></div>
          <div class="map-marker home-marker"><img src="assets/img/icons/home-marker.png" alt="Ünvan"></div>
          <div class="map-info">
            <b>Canlı izləmə</b>
            <p class="muted">${order.courier_id ? `Təxmini çatma vaxtı: ${eta}` : 'Kuryer təyin olunandan sonra canlı xəritə görünəcək.'}</p>
          </div>
        </div>
      `}

      ${courier ? `
        <div class="compact-row" style="margin-top: 12px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <img class="preview-img" src="${courier.avatar_url || PLACEHOLDER}" alt="Kuryer">
            <div>
              <b>${courier.first_name || ''} ${courier.last_name || ''}</b><br>
              <small class="muted">${courier.phone || 'Telefon yoxdur'}</small>
            </div>
          </div>
          <a class="btn btn-soft" href="tel:${courier.phone || ''}">Zəng</a>
        </div>
      ` : '<p class="muted">Kuryer hələ təyin edilməyib.</p>'}

                <div class="order-actions">
                <button class="btn btn-primary open-chat" data-id="${order.id}">Admin/Kuryer ilə mesajlaş</button>
              
                ${order.status === 'pending' ? `
                  <button class="btn btn-danger cancel-order" data-id="${order.id}" data-status="${order.status}">
                    Sifarişi ləğv et
                  </button>
                ` : ''}
              </div>
    </div>`;
}

              async function cancelOrder(orderId, status) {
                if (status !== 'pending') {
                  toast('Sifariş artıq təsdiqlənib. Ləğv üçün mağaza ilə əlaqə saxlayın.');
                  return;
                }
              
                if (!confirm('Sifarişi ləğv etmək istədiyinizə əminsiniz?')) return;
              
                const { error } = await supabase
                  .from('orders')
                  .update({
                    status: 'cancelled',
                    cancelled_by: 'user',
                    cancel_note: 'İstifadəçi sifarişi təsdiqdən əvvəl ləğv etdi',
                  })
                  .eq('id', orderId)
                  .eq('status', 'pending');
              
                toast(error ? error.message : 'Sifariş ləğv edildi');
                initOrders();
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

function estimateEta(order) {
  if (order.status === 'courier_near') return '15 dəqiqə';
  if (order.status === 'on_the_way') return '35-45 dəqiqə';
  if (order.status === 'preparing') return '45-60 dəqiqə';
  if (order.status === 'delivered') return 'Təhvil verildi';
  return '30-50 dəqiqə';
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
  form.address_line.value = activeProfile.address_line || '';
  form.apartment.value = activeProfile.apartment || '';
  form.door_code.value = activeProfile.door_code || '';
  form.lat.value = activeProfile.lat || '';
  form.lng.value = activeProfile.lng || '';
  form.bio.value = activeProfile.bio || '';

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
          address_line: data.address_line,
          apartment: data.apartment,
          door_code: data.door_code,
          lat: data.lat ? Number(data.lat) : null,
          lng: data.lng ? Number(data.lng) : null,
          bio: data.bio,
          avatar_url: avatarUrl,
        })
        .eq('id', activeProfile.id);

      toast(error ? error.message : 'Profil yeniləndi');
    } catch (error) {
      toast(error.message);
    }
  });
}

async function initMessages() {
  const orderId = new URLSearchParams(location.search).get('order');

  if (orderId) {
    await supabase.rpc('create_or_get_order_thread', { p_order_id: orderId });
  }

  await loadThreads();
  $('#sendMessageForm')?.addEventListener('submit', sendMessage);
  subscribeMessageRealtime();
}

async function loadThreads() {
  const { data, error } = await supabase
    .from('chat_threads')
    .select('id,title,order_id,last_message_at')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50);

  const list = $('#threadList');

  if (error) {
    list.innerHTML = `<div class="card">${error.message}</div>`;
    return;
  }

  list.innerHTML = (data || []).map((thread) => `
    <button class="compact-row thread" data-id="${thread.id}">
      <span>${thread.title || 'Söhbət'}<br><small class="muted">${thread.order_id || ''}</small></span>
    </button>
  `).join('') || '<span class="muted">Söhbət yoxdur.</span>';

  $$('.thread').forEach((button) => {
    button.addEventListener('click', () => openThread(button.dataset.id));
  });

  if (data?.[0]) openThread(data[0].id);
}

async function openThread(id) {
  currentThread = id;

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id,message_text,sender_id,created_at,is_read,profiles(first_name,last_name,phone)')
    .eq('thread_id', id)
    .order('created_at')
    .limit(120);

  const activeUser = await requireAuth();

  $('#chatBox').innerHTML = error
    ? error.message
    : (data || []).map((message) => `
      <div class="msg ${message.sender_id === activeUser.id ? 'me' : ''} ${!message.is_read && message.sender_id !== activeUser.id ? 'unread-message' : ''}">
          <b>${message.profiles?.first_name || ''} ${message.profiles?.last_name || ''}</b>
          <small class="muted"> • ${message.profiles?.phone || 'Telefon yoxdur'} • ${new Date(message.created_at).toLocaleString('az-AZ')}</small>
          <br>
          ${message.message_text}
      </div>
    `).join('') || '<span class="muted">Mesaj yoxdur.</span>';

  await supabase.rpc('mark_thread_read', { p_thread_id: id });
  $('#chatBox').scrollTop = 999999;
}

// Mesaj səhifəsi açıq qalanda yeni mesajlar realtime görünür, F5 tələb olunmur.
function subscribeMessageRealtime() {
  supabase
    .channel('user-message-page-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
      if (currentThread) openThread(currentThread);
      loadThreads();
    })
    .subscribe();
}

async function sendMessage(event) {
  event.preventDefault();

  if (!currentThread) return toast('Söhbət seçilməyib');

  const text = $('#messageInput').value.trim();
  if (!text) return;

  const { error } = await supabase.rpc('send_chat_message', {
    p_thread_id: currentThread,
    p_message_text: text,
  });

  if (error) return toast(error.message);

  $('#messageInput').value = '';
  openThread(currentThread);
}
