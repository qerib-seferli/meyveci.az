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
let heartbeatTimer = null;
let watchId = null;
let courierPosition = null;
const courierMaps = new Map();
let followCourier = false;

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
    startCourierHeartbeat();
    toast('Kuryer online oldu');
  } else {
    stopLocationSharing();
    stopCourierHeartbeat();
    toast('Kuryer offline oldu');
  }
}


//======================================================================================================

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

  const [{ data: profiles }, { data: locations }, { data: payments }] = await Promise.all([
    userIds.length
      ? supabase.from('profiles').select('id,email,first_name,last_name,phone,avatar_url,city_region,address_line,apartment,door_code,lat,lng').in('id', userIds)
      : Promise.resolve({ data: [] }),

    orderIds.length
      ? supabase.from('courier_locations').select('*').in('order_id', orderIds)
      : Promise.resolve({ data: [] }),

    orderIds.length
      ? supabase.from('payments').select('*').in('order_id', orderIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profilesMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const locationsMap = new Map((locations || []).map((location) => [location.order_id, location]));
  const paymentsMap = new Map((payments || []).map((payment) => [payment.order_id, payment]));

  list.innerHTML = (orders || [])
    .map((order) => orderCard(
      order,
      profilesMap.get(order.user_id),
      locationsMap.get(order.id),
      paymentsMap.get(order.id)
    ))
    .join('') || '<div class="card">Hazırda təyin olunmuş sifariş yoxdur.</div>';

  bindCourierButtons();
  initCourierMaps(orders || [], profilesMap, locationsMap);
}

//======================================================================================================

// Kart düymələrinə klik hadisələri qoşulur.
function bindCourierButtons() {
  $$('.courier-status').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;

      const { error: statusError } = await supabase.rpc('courier_update_order_status', {
        p_order_id: button.dataset.id,
        p_status: button.dataset.s,
      });

      if (!statusError) {
        await createCourierStatusNotification(button.dataset.id, button.dataset.s);
      }
      
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

  $$('.follow-courier-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      followCourier = !followCourier;
      button.classList.toggle('active-status', followCourier);
      button.textContent = followCourier ? '📍 İzləmə aktivdir' : '📍 Kuryeri izlə';
    });
  });
}


async function createCourierStatusNotification(orderId, status) {
  const titleMap = {
    on_the_way: 'Kuryer yoldadır',
    courier_near: 'Kuryer yaxınlaşır',
    delivered: 'Sifariş təhvil verildi',
  };

  const bodyMap = {
    on_the_way: 'Kuryer sifarişinizi çatdırmaq üçün yola çıxdı.',
    courier_near: 'Kuryer ünvanınıza yaxınlaşır.',
    delivered: 'Sifarişiniz təhvil verildi.',
  };

  const { data: order } = await supabase
    .from('orders')
    .select('id,user_id,order_code')
    .eq('id', orderId)
    .maybeSingle();

  if (!order?.user_id) return;

  await supabase.from('notifications').insert({
    user_id: order.user_id,
    title: titleMap[status] || 'Sifariş statusu yeniləndi',
    body: `${order.order_code || 'Sifariş'}: ${bodyMap[status] || 'Sifarişinizin statusu dəyişdi.'}`,
    link_url: `orders.html?track=${orderId}`,
    is_read: false,
  });
}


// ==============================================================================================

function orderCard(order, customer = {}, location = {}, payment = null) {
  const customerPhone = customer?.phone || order.phone || '';
  const customerName = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim() || order.full_name || customer?.email || 'Müştəri';

  const address = [
    order.city_region || customer?.city_region,
    order.address_text || customer?.address_line,
    order.apartment || customer?.apartment,
    order.door_code || customer?.door_code,
  ].filter(Boolean).join(', ');

  const eta = estimateEta(order, customer, location);
  const paymentText = courierPaymentText(order, payment);

  return `
    <article class="card courier-card" data-order-id="${order.id}">
      <div class="section-head">
        <div>
          <b>${order.order_code}</b>
          <p class="muted">${statusAz(order.status)} • ${money(order.total_amount)}</p>
        </div>
        <span class="unit-badge" id="courierEta-${order.id}">ETA: ${eta}</span>
      </div>

      <div class="courier-payment-info">
        ${paymentText}
      </div>

      <div class="compact-row customer-card-row">
        <div class="customer-mini">
          <img class="preview-img customer-avatar" src="${customer?.avatar_url || PLACEHOLDER}" alt="Müştəri">
          <span>
            <b>${customerName}</b><br>
            <small class="muted">${customerPhone || 'Telefon yoxdur'}</small>
          </span>
        </div>
        
        <div class="customer-actions">
            ${customerPhone ? `<a class="btn btn-soft" href="tel:${customerPhone}">📞 Zəng</a>` : ''}
            <button class="btn btn-soft open-chat" data-id="${order.id}">💬 Mesaj</button>
        </div>
      </div>

      <p><b>Ünvan:</b> ${address || 'Ünvan qeyd edilməyib'}</p>

      <div class="map-toolbar">
        <button class="btn btn-soft follow-courier-toggle" type="button">
          📍 Kuryeri izlə
        </button>
        ${mapNavigationLinks(order.lat || customer?.lat, order.lng || customer?.lng)}
      </div>

      <div class="map-box order-live-map" id="courierMap-${order.id}"></div>

      <p class="muted map-note" id="courierMapNote-${order.id}">
        Marşrut hesablanır...
      </p>

      <div class="courier-actions">
        <button class="btn btn-soft courier-status ${order.status === 'on_the_way' ? 'active-status' : ''}" data-id="${order.id}" data-s="on_the_way">Yoldayam</button>
        <button class="btn btn-soft courier-status ${order.status === 'courier_near' ? 'active-status' : ''}" data-id="${order.id}" data-s="courier_near">Yaxınlaşıram</button>
        <button class="btn btn-primary courier-status ${order.status === 'delivered' ? 'active-status' : ''}" data-id="${order.id}" data-s="delivered">Təhvil verdim</button>
      </div>
    </article>
  `;
}

//==========================================================================================================

function courierPaymentText(order, payment = null) {
  const method = order.payment_method || payment?.provider || '';
  const status = order.payment_status || payment?.status || '';
  const amount = Number(payment?.amount || order.total_amount || 0);
  const amountText = money(amount);

  if (method === 'cash') {
    return `
      <b>💵 Nağd ödəniş</b>
      <span>Müştəri kuryerə nağd ${amountText} ödəyəcək.</span>
    `;
  }

  if (method === 'card_transfer') {
    if (status === 'paid' || status === 'approved') {
      return `
        <b>💳 Kart köçürməsi</b>
        <span>Müştəri kart köçürməsi ilə ${amountText} ödəniş edib. Müştəridən nağd pul tələb etmə.</span>
      `;
    }

    return `
      <b>💳 Kart köçürməsi</b>
      <span>Müştəri ${amountText} məbləği karta köçürmə yolu ilə ödəməlidir. Status hələ təsdiqlənməyib.</span>
    `;
  }

  if (method === 'pos') {
    return `
      <b>🏧 POS terminal</b>
      <span>POS terminal hazır olsun. Müştəri ${amountText} məbləği POS vasitəsilə ödəyəcək.</span>
    `;
  }

  if (method === 'online_payment' || method === 'online') {
    if (status === 'paid' || status === 'approved') {
      return `
        <b>🌐 Online ödəniş</b>
        <span>${amountText} online ödəniş edilib. Müştəridən əlavə pul tələb etmə.</span>
      `;
    }

    return `
      <b>🌐 Online ödəniş</b>
      <span>Online ödəniş seçilib. Məbləğ: ${amountText}. Status hələ təsdiqlənməyib.</span>
    `;
  }

  return `
    <b>💰 Ödəniş</b>
    <span>Məbləğ: ${amountText}</span>
  `;
}

function formatRouteDuration(seconds = 0) {
  const minutes = Math.max(1, Math.round(Number(seconds) / 60));

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} saat ${rest} dəqiqə` : `${hours} saat`;
  }

  return `${minutes} dəqiqə`;
}

function updateCourierRouteInfo(orderId, distanceMeters, durationSeconds) {
  const km = Number(distanceMeters) / 1000;
  const kmText = km >= 10 ? km.toFixed(0) : km.toFixed(1);
  const durationText = formatRouteDuration(durationSeconds);

  const etaBadge = $(`#courierEta-${orderId}`);
  const note = $(`#courierMapNote-${orderId}`);

  if (etaBadge) {
    etaBadge.textContent = `ETA: ${durationText}`;
  }

  if (note) {
    note.textContent = `Marşrut: ${kmText} km • Təxmini çatma vaxtı: ${durationText}`;
  }
}

//==========================================================================================================

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

    courierMaps.set(order.id, {
      map,
      courierMarker,
      homeMarker,
      courierIcon,
      homeIcon,
      routeLayer: null,
      customerLat,
      customerLng,
    });

    if (validPoint(courierLat, courierLng) && validPoint(customerLat, customerLng)) {
        drawCourierRoute(
          order.id,
          { lat: courierLat, lng: courierLng },
          { lat: customerLat, lng: customerLng }
        );
      }
        
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

function mapNavigationLinks(lat, lng) {
  const destLat = Number(lat);
  const destLng = Number(lng);

  if (!validPoint(destLat, destLng)) return '';

  const wazeUrl = `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`;
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;
  const appleUrl = `https://maps.apple.com/?saddr=Current%20Location&daddr=${destLat},${destLng}&dirflg=d`;

  return `
    <a class="btn btn-soft map-nav-btn" href="${wazeUrl}" target="_blank" rel="noopener">🧭 Waze</a>
    <a class="btn btn-soft map-nav-btn" href="${googleUrl}" target="_blank" rel="noopener">🗺️ Google Maps</a>
    <a class="btn btn-soft map-nav-btn" href="${appleUrl}" target="_blank" rel="noopener">🍎 Apple Maps</a>
  `;
}

//=======================================================================================

async function drawCourierRoute(orderId, from, to) {
  const mapData = courierMaps.get(orderId);
  if (!mapData) return;

  if (mapData.routeLayer) {
    mapData.map.removeLayer(mapData.routeLayer);
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.routes && data.routes[0]) {
      const route = data.routes[0];

      mapData.routeLayer = L.geoJSON(route.geometry, {
        style: { color: '#16a34a', weight: 5, opacity: 0.9 },
      }).addTo(mapData.map);

      updateCourierRouteInfo(orderId, route.distance, route.duration);
    } else {
      mapData.routeLayer = L.polyline(
        [[from.lat, from.lng], [to.lat, to.lng]],
        { color: '#16a34a', weight: 5, opacity: 0.9, dashArray: '8,8' }
      ).addTo(mapData.map);

      const fallbackKm = distanceKm(from.lat, from.lng, to.lat, to.lng);
      updateCourierRouteInfo(orderId, fallbackKm * 1000, Math.max(300, (fallbackKm / 22) * 3600));
    }

    courierMaps.set(orderId, mapData);
  } catch (e) {
    mapData.routeLayer = L.polyline(
      [[from.lat, from.lng], [to.lat, to.lng]],
      { color: '#16a34a', weight: 5, opacity: 0.9, dashArray: '8,8' }
    ).addTo(mapData.map);

    const fallbackKm = distanceKm(from.lat, from.lng, to.lat, to.lng);
    updateCourierRouteInfo(orderId, fallbackKm * 1000, Math.max(300, (fallbackKm / 22) * 3600));

    courierMaps.set(orderId, mapData);
  }
}

//========================================================================================


// Kuryerin hazırki koordinatını bütün aktiv sifarişlərinə yazır.
// Bu məlumat müştəri tərəfində marker və yol xətti üçün istifadə olunur.
async function saveCourierLocationToOrders(lat, lng, coords = {}) {
  if (!activeCourier || !validPoint(Number(lat), Number(lng))) {
    console.log('Lokasiya yazılmadı:', { activeCourier, lat, lng });
    toast('Kuryer və ya lokasiya məlumatı düzgün deyil');
    return;
  }

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_code, status, courier_id')
    .eq('courier_id', activeCourier.id)
    .in('status', ['confirmed', 'preparing', 'on_the_way', 'courier_near']);

  console.log('Lokasiya yazılacaq sifarişlər:', orders, error);

  if (error) {
    toast(error.message);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log('Aktiv sifariş tapılmadı. activeCourier:', activeCourier.id);
    toast('Lokasiya yazılacaq aktiv sifariş tapılmadı');
    return;
  }

  const rows = orders.map((order) => ({
    order_id: order.id,
    courier_id: activeCourier.id,
    lat: Number(lat),
    lng: Number(lng),
    speed: coords.speed ?? null,
    heading: coords.heading ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { data, error: upsertError } = await supabase
    .from('courier_locations')
    .upsert(rows, { onConflict: 'order_id,courier_id' })
    .select();

  console.log('Lokasiya yazma cavabı:', data, upsertError);

  if (upsertError) {
    toast(upsertError.message);
    return;
  }
  
  // Bu xəritənin “əsib yenilənməsi” problemi
  // await loadCourierOrders();
}


// Kuryer hərəkət etdikcə xəritədə marker reload olmadan yerini dəyişir.
function updateCourierMapsLive(lat, lng) {
  if (!validPoint(Number(lat), Number(lng))) return;

  courierMaps.forEach((mapData) => {
    const point = [Number(lat), Number(lng)];

    if (mapData.courierMarker) {
      mapData.courierMarker.setLatLng(point);
    } else {
      mapData.courierMarker = L.marker(point, { icon: mapData.courierIcon })
        .addTo(mapData.map)
        .bindPopup('Kuryer');
    }

    const customerLat = Number(mapData.customerLat);
    const customerLng = Number(mapData.customerLng);
    
    if (validPoint(customerLat, customerLng)) {
      const orderId = [...courierMaps.entries()].find(([, value]) => value === mapData)?.[0];
    
      if (orderId) {
        drawCourierRoute(
          orderId,
          { lat: Number(lat), lng: Number(lng) },
          { lat: customerLat, lng: customerLng }
        );
      }
    }
    
    // kuryer iconu marker kimi hərəkət edəcək, amma xəritə özü səni məcburi uzaqlaşdırmayacaq
    if (followCourier) {
      mapData.map.panTo(point, { animate: true, duration: 0.8 });
      }
  });
}



// Kuryerin canlı lokasiyasını aktiv sifarişlərə yazır.
function startLocationSharing() {
  if (!navigator.geolocation) {
    toast('Brauzer lokasiya paylaşımını dəstəkləmir');
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      courierPosition = { lat, lng };

      // Kuryer paneldə markeri realtime hərəkət etdirir
      updateCourierMapsLive(lat, lng);

      // 🔥 ƏSAS DÜZƏLİŞ BURDADIR
      // artıq manual query yox, helper function istifadə edirik
      await saveCourierLocationToOrders(
        lat,
        lng,
        position.coords
      );
    },
    (err) => {
      console.log(err);
      toast('Lokasiya icazəsi verilmədi');
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    }
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_locations' }, (payload) => {
      const location = payload.new;
      if (!location) return;

      const mapData = courierMaps.get(location.order_id);
      if (!mapData) return;

      const lat = Number(location.lat);
      const lng = Number(location.lng);

      if (!validPoint(lat, lng)) return;

      const point = [lat, lng];

      if (mapData.courierMarker) {
        mapData.courierMarker.setLatLng(point);
      } else {
        mapData.courierMarker = L.marker(point, { icon: mapData.courierIcon })
          .addTo(mapData.map)
          .bindPopup('Kuryer');
      }
    })
    .subscribe();
}



//================================================================

async function startCourierHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  await sendCourierHeartbeat();

  heartbeatTimer = setInterval(() => {
    sendCourierHeartbeat();
  }, 30000);

  window.addEventListener('online', sendCourierHeartbeat);
  window.addEventListener('offline', sendCourierHeartbeat);
}

function stopCourierHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

async function sendCourierHeartbeat() {
  if (!activeCourier?.id) return;

  let batteryLevel = null;
  let isCharging = false;

  try {
    if (navigator.getBattery) {
      const battery = await navigator.getBattery();
      batteryLevel = Math.round(battery.level * 100);
      isCharging = Boolean(battery.charging);
    }
  } catch {}

  const networkStatus = navigator.onLine ? 'online' : 'offline';

  await supabase
    .from('courier_device_status')
    .upsert({
      courier_id: activeCourier.id,
      battery_level: batteryLevel,
      is_charging: isCharging,
      is_online: navigator.onLine,
      network_status: networkStatus,
      last_heartbeat: new Date().toISOString(),
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'courier_id' });

  await supabase
    .from('couriers')
    .upsert({
      user_id: activeCourier.id,
      is_online: navigator.onLine,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
}
