// ============================================================
// MEYVƏÇİ.AZ - KURYER PANELİ
// Təyin olunan sifarişlər, canlı lokasiya və müştəri əlaqəsi buradadır.
// ============================================================

import {
  $,
  $$,
  supabase,
  requireRole,
  toast,
  money,
  statusAz,
  PLACEHOLDER,
} from './core.js';

import { initLayout } from './layout.js';

let activeCourier = null;
let watchId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  activeCourier = await requireRole('courier');
  if (!activeCourier) return;

  $('#onlineToggle')?.addEventListener('change', toggleOnline);
  await loadCourierOrders();
});

async function toggleOnline(event) {
  const isOnline = event.target.checked;

  await supabase
    .from('couriers')
    .upsert({ user_id: activeCourier.id, is_online: isOnline, is_active: true }, { onConflict: 'user_id' });

  if (isOnline) {
    startLocationSharing();
    toast('Kuryer online oldu');
  } else {
    stopLocationSharing();
    toast('Kuryer offline oldu');
  }
}

async function loadCourierOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*,profiles!orders_user_id_fkey(first_name,last_name,phone,avatar_url,address_line,apartment,door_code,lat,lng)')
    .eq('courier_id', activeCourier.id)
    .in('status', ['confirmed', 'preparing', 'on_the_way'])
    .order('created_at', { ascending: false })
    .limit(60);

  const list = $('#courierOrders');

  if (error) {
    list.innerHTML = `<div class="card">${error.message}</div>`;
    return;
  }

  list.innerHTML = (data || []).map(orderCard).join('') || '<div class="card">Hazırda təyin olunmuş sifariş yoxdur.</div>';

  $$('.courier-status').forEach((button) => {
    button.addEventListener('click', async () => {
      const { error: statusError } = await supabase.rpc('courier_update_order_status', {
        p_order_id: button.dataset.id,
        p_status: button.dataset.s,
      });

      toast(statusError ? statusError.message : 'Status yeniləndi');
      loadCourierOrders();
    });
  });

  $$('.open-chat').forEach((button) => {
    button.addEventListener('click', () => location.href = `../messages.html?order=${button.dataset.id}`);
  });
}

function orderCard(order) {
  const customer = order.profiles || {};
  const customerPhone = customer.phone || '';
  const address = [customer.address_line, customer.apartment, customer.door_code].filter(Boolean).join(', ');

  return `
    <article class="card courier-card">
      <div class="section-head">
        <div>
          <b>${order.order_code}</b>
          <p class="muted">${statusAz(order.status)} • ${money(order.total_amount)}</p>
        </div>
        <span class="unit-badge">ETA: təxmini 20-40 dəq.</span>
      </div>

      <div class="compact-row">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <img class="preview-img" src="${customer.avatar_url || PLACEHOLDER}" alt="Müştəri">
          <span>
            <b>${customer.first_name || ''} ${customer.last_name || ''}</b><br>
            <small class="muted">${customerPhone || 'Telefon yoxdur'}</small>
          </span>
        </div>
        <a class="btn btn-soft" href="tel:${customerPhone}">Zəng</a>
      </div>

      <p><b>Ünvan:</b> ${address || 'Ünvan qeyd edilməyib'}</p>

      <div class="map-box">
        <div>
          <b>Xəritə/lokasiya</b>
          <p class="muted">Müştərinin koordinatı: ${customer.lat || '—'}, ${customer.lng || '—'}</p>
          <p class="muted">Online rejimdə kuryer lokasiyası müştəriyə realtime göndərilir.</p>
        </div>
      </div>

      <div class="courier-actions">
        <button class="btn btn-soft courier-status" data-id="${order.id}" data-s="on_the_way">Yoldayam</button>
        <button class="btn btn-soft courier-status" data-id="${order.id}" data-s="courier_near">Yaxınlaşıram</button>
        <button class="btn btn-primary courier-status" data-id="${order.id}" data-s="delivered">Təhvil verdim</button>
        <button class="btn btn-soft open-chat" data-id="${order.id}">Mesaj</button>
      </div>
    </article>
  `;
}

function startLocationSharing() {
  if (!navigator.geolocation) {
    toast('Brauzer lokasiya paylaşımını dəstəkləmir');
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const { data: orders } = await supabase
        .from('orders')
        .select('id')
        .eq('courier_id', activeCourier.id)
        .in('status', ['on_the_way', 'courier_near']);

      await Promise.all((orders || []).map((order) => supabase
        .from('courier_locations')
        .upsert({
          order_id: order.id,
          courier_id: activeCourier.id,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speed: position.coords.speed,
          heading: position.coords.heading,
        }, { onConflict: 'order_id,courier_id' })
      ));
    },
    () => toast('Lokasiya icazəsi verilmədi'),
    { enableHighAccuracy: true, maximumAge: 7000, timeout: 15000 }
  );
}

function stopLocationSharing() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}
