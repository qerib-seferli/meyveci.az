// ============================================================
// MEYVƏÇİ.AZ - KURYER PANELİ
// Təyin olunan sifarişlər, canlı lokasiya, müştəri məlumatı və mesajlaşma.
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
let courierPosition = null;
const courierMaps = new Map();

// Səhifə açılan kimi kuryer yoxlanır, online edilir və sifarişlər yüklənir.
document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  activeCourier = await requireRole('courier');
  if (!activeCourier) return;

  $('#onlineToggle')?.addEventListener('change', toggleOnline);

  const onlineToggle = $('#onlineToggle');
  if (onlineToggle) {
    onlineToggle.checked = true;
    await toggleOnline({ target: onlineToggle });
  }

  await loadCourierOrders();
  subscribeCourierLive();
});

// Online/offline rejimi dəyişir. Online olanda telefondan lokasiya icazəsi istəyir.
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

// Təyin olunmuş aktiv sifarişləri gətirir.
// Qeyd: müştəri profilini ayrıca oxuyuruq ki, Supabase FK adı dəyişsə belə kuryer paneli dağılmasın.
async function loadCourierOrders() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('courier_id', activeCourier.id)
    .in('status', ['confirmed', 'preparing', 'on_the_way', 'courier_near'])
    .order('created_at', { ascending: false })
    .limit(60);

  const list = $('#courierOrders');

  if (error) {
    list.innerHTML = `<div class="card">${error.message}</div>`;
    return;
  }

  const userIds = [...new Set((orders || []).map((order) => order.user_id).filter(Boolean))];
  const orderIds = [...new Set((orders || []).map((order) => order.id).filter(Boolean))];

  const [{ data: profiles }, { data: locations }] = await Promise.all([
    userIds.length
      ? supabase.from('profiles').select('id,email,first_name,last_name,phone,avatar_url,address_line,apartment,door_code,lat,lng').in('id', userIds)
      : Promise.resolve({ data: [] }),
    orderIds.length
      ? supabase.from('courier_locations').select('*').in('order_id', orderIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profilesMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const locationsMap = new Map((locations || []).map((location) => [location.order_id, location]));

  list.innerHTML = (orders || [])
    .map((order) => orderCard(order, profilesMap.get(order.user_id), locationsMap.get(order.id)))
    .join('') || '<div class="card">Hazırda təyin olunmuş sifariş yoxdur.</div>';

  bindCourierButtons();
  initCourierMaps(orders || [], profilesMap, locationsMap);
}

// Kart düymələrinə klik hadisələri qoşulur.
function bindCourierButtons() {
  $$('.courier-status').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;

      const { error: statusError } = await supabase.rpc('courier_update_order_status', {
        p_order_id: button.dataset.id,
        p_status: button.dataset.s,
      });

      toast(statusError ? statusError.message : 'Status yeniləndi');
      button.disabled = false;
      loadCourierOrders();
    });
  });

  $$('.open-chat').forEach((button) => {
    button.addEventListener('click', () => {
      location.href = `../messages.html?order=${button.dataset.id}`;
    });
  });
}

// Kuryer kartı: müştəri şəkli, adı, telefon, sifariş ünvanı, xəritə və statuslar.
function orderCard(order, customer = {}, location = {}) {
  const customerPhone = customer?.phone || order.phone || '';
  const customerName = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || order.full_name || customer?.email || 'Müştəri';
  const address = order.address_text || [customer?.address_line, customer?.apartment, customer?.door_code].filter(Boolean).join(', ');
  const eta = estimateEta(order, customer, location);

  return `
    <article class="card courier-card" data-order-id="${order.id}">
      <div class="section-head">
        <div>
          <b>${order.order_code}</b>
          <p class="muted">${statusAz(order.status)} • ${money(order.total_amount)}</p>
        </div>
        <span class="unit-badge">ETA: ${eta}</span>
      </div>

      <div class="compact-row customer-card-row">
        <div class="customer-mini">
          <img class="preview-img customer-avatar" src="${customer?.avatar_url || PLACEHOLDER}" alt="Müştəri">
          <span>
            <b>${customerName}</b><br>
            <small class="muted">${customerPhone || 'Telefon yoxdur'}</small>
          </span>
        </div>
        ${customerPhone ? `<a class="btn btn-soft" href="tel:${customerPhone}">Zəng</a>` : ''}
      </div>

      <p><b>Ünvan:</b> ${address || 'Ünvan qeyd edilməyib'}</p>

      <div class="map-box order-live-map" id="courierMap-${order.id}"></div>
      <p class="muted map-note" id="courierMapNote-${order.id}">
        Müştəri: ${customer?.lat || order.lat || '—'}, ${customer?.lng || order.lng || '—'} • Kuryer: ${location?.lat || '—'}, ${location?.lng || '—'}
      </p>

      <div class="courier-actions">
        <button class="btn btn-soft courier-status ${order.status === 'on_the_way' ? 'active-status' : ''}" data-id="${order.id}" data-s="on_the_way">Yoldayam</button>
        <button class="btn btn-soft courier-status ${order.status === 'courier_near' ? 'active-status' : ''}" data-id="${order.id}" data-s="courier_near">Yaxınlaşıram</button>
        <button class="btn btn-primary courier-status ${order.status === 'delivered' ? 'active-status' : ''}" data-id="${order.id}" data-s="delivered">Təhvil verdim</button>
        <button class="btn btn-soft open-chat" data-id="${order.id}">Müştəriyə mesaj yaz</button>
      </div>
    </article>
  `;
}

// Leaflet xəritələrini yaradır və markerləri göstərir.
function initCourierMaps(orders, profilesMap, locationsMap) {
  if (!window.L) return;

  orders.forEach((order) => {
    const customer = profilesMap.get(order.user_id) || {};
    const location = locationsMap.get(order.id) || {};
    const customerLat = Number(order.lat || customer.lat);
    const customerLng = Number(order.lng || customer.lng);
    const courierLat = Number(location.lat || courierPosition?.lat);
    const courierLng = Number(location.lng || courierPosition?.lng);
    const mapEl = $(`#courierMap-${order.id}`);

    if (!mapEl) return;

    const center = validPoint(courierLat, courierLng)
      ? [courierLat, courierLng]
      : validPoint(customerLat, customerLng)
        ? [customerLat, customerLng]
        : [40.4093, 49.8671];

    const map = L.map(mapEl, { zoomControl: false }).setView(center, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const courierIcon = makeMapIcon('../assets/img/icons/courier-marker.png');
    const homeIcon = makeMapIcon('../assets/img/icons/home-marker.png');
    let courierMarker = null;
    let homeMarker = null;

    if (validPoint(courierLat, courierLng)) courierMarker = L.marker([courierLat, courierLng], { icon: courierIcon }).addTo(map).bindPopup('Kuryer');
    if (validPoint(customerLat, customerLng)) homeMarker = L.marker([customerLat, customerLng], { icon: homeIcon }).addTo(map).bindPopup('Müştəri ünvanı');

    const points = [];
    if (courierMarker) points.push(courierMarker.getLatLng());
    if (homeMarker) points.push(homeMarker.getLatLng());
    if (points.length > 1) map.fitBounds(points, { padding: [30, 30] });

    courierMaps.set(order.id, { map, courierMarker, homeMarker, courierIcon, homeIcon });
    setTimeout(() => map.invalidateSize(), 150);
  });
}

function makeMapIcon(url) {
  return L.icon({
    iconUrl: url,
    iconSize: [42, 42],
    iconAnchor: [21, 42],
    popupAnchor: [0, -36],
  });
}

function validPoint(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function estimateEta(order, customer = {}, location = {}) {
  const aLat = Number(location.lat || courierPosition?.lat);
  const aLng = Number(location.lng || courierPosition?.lng);
  const bLat = Number(order.lat || customer.lat);
  const bLng = Number(order.lng || customer.lng);

  if (validPoint(aLat, aLng) && validPoint(bLat, bLng)) {
    const km = distanceKm(aLat, aLng, bLat, bLng);
    const minutes = Math.max(5, Math.round((km / 22) * 60));
    if (minutes >= 60) return `${Math.floor(minutes / 60)} saat ${minutes % 60} dəqiqə`;
    return `${minutes} dəqiqə`;
  }

  if (order.status === 'courier_near') return '15 dəqiqə';
  if (order.status === 'on_the_way') return '35-45 dəqiqə';
  return '30-50 dəqiqə';
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Kuryerin canlı lokasiyasını aktiv sifarişlərə yazır.
function startLocationSharing() {
  if (!navigator.geolocation) {
    toast('Brauzer lokasiya paylaşımını dəstəkləmir');
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    async (position) => {
      courierPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

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
          updated_at: new Date().toISOString(),
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

// Sifariş, profil və lokasiya dəyişəndə kuryer paneli realtime yenilənir.
function subscribeCourierLive() {
  supabase
    .channel('courier-panel-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadCourierOrders())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadCourierOrders())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_locations' }, () => loadCourierOrders())
    .subscribe();
}
