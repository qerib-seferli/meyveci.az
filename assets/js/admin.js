// ============================================================
// MEYVƏÇİ.AZ - FULL PRO ADMIN PANEL
// Dashboard, katalog, sifariş, ödəniş, istifadəçi, rəy, kontent və kuryer monitor.
// ============================================================

import {
  $,
  $$,
  supabase,
  requireRole,
  money,
  toast,
  formData,
  uploadFile,
  slugify,
  statusAz,
  PLACEHOLDER,
  playNotifySound,
} from './core.js';

import { initLayout } from './layout.js';

let adminProfile = null;
let courierMap = null;
let courierMarkers = new Map();
let adminSoundReady = false;
let adminAlarmLoop = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  adminProfile = await requireRole('admin');
  if (!adminProfile) return;

  initTabs();
  initAdminModal();
  initAdminSoundUnlock();

  const page = document.body.dataset.page;

  if (page === 'admin-dashboard') dashboard();
  if (page === 'admin-catalog') catalog();
  if (page === 'admin-orders') ordersPayments();
  if (page === 'admin-users') usersReviews();
  if (page === 'admin-content') content();

  subscribeAdminRealtime();

  $('#adminRefreshBtn')?.addEventListener('click', () => location.reload());
});

function initTabs() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const root = tab.closest('.tabs-wrap') || document;
      $$('.tab', root).forEach((item) => item.classList.remove('active'));
      $$('.tab-panel', root).forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      $(`#${tab.dataset.tab}`)?.classList.add('active');
    });
  });
}

function initAdminModal() {
  if ($('#adminModal')) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="adminModal" class="admin-modal">
      <div class="admin-modal-card">
        <div class="admin-modal-head">
          <b id="adminModalTitle">Detallar</b>
          <button id="adminModalClose" class="mini-x" type="button">×</button>
        </div>
        <div id="adminModalBody"></div>
      </div>
    </div>
  `);

  $('#adminModalClose')?.addEventListener('click', closeAdminModal);
  $('#adminModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'adminModal') closeAdminModal();
  });
}

function openAdminModal(title, html) {
  $('#adminModalTitle').textContent = title || 'Detallar';
  $('#adminModalBody').innerHTML = html || '';
  $('#adminModal').classList.add('show');
}

function closeAdminModal() {
  $('#adminModal')?.classList.remove('show');
}

function safe(value, fallback = '—') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function esc(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function rowAttr(row) {
  return JSON.stringify(row || {})
    .replaceAll('&', '&amp;')
    .replaceAll("'", '&#39;')
    .replaceAll('"', '&quot;');
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('az-AZ') : '—';
}

function formatDuration(ms) {
  if (!ms || ms < 0) return 'yoxdur';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours} saat ${minutes} dəq ${seconds} san`;
  if (minutes > 0) return `${minutes} dəq ${seconds} san`;
  return `${seconds} san`;
}

function heartbeatText(value) {
  if (!value) return 'yoxdur';
  return formatDuration(Date.now() - new Date(value).getTime());
}

function courierFlowHtml(order = null) {
  const activeStatus = order?.status || 'idle';

  const steps = [
    { key: 'confirmed', cls: 'accepted', label: '✅ Sifariş qəbul edildi' },
    { key: 'preparing', cls: 'preparing', label: '🥝 Hazırlanır' },
    { key: 'on_the_way', cls: 'way', label: '🚚 Yoldadır' },
    { key: 'courier_near', cls: 'near', label: '📍 Ünvana yaxın' },
    { key: 'delivered', cls: 'done', label: '🎉 Təslim edildi' },
  ];

  return `
    <div class="courier-flow-line">
      <b>Cari vəziyyət:</b>
      <div class="courier-status-flow">
        ${steps.map((step) => `
          <span class="flow-step ${step.cls} ${step.key === activeStatus ? 'active' : 'passive'}">
            ${step.label}
          </span>
        `).join('')}
      </div>
    </div>
  `;
}

function courierWorkStatus(order = null) {
  if (!order) return 'Boşdur';
  if (order.status === 'confirmed') return 'Sifariş qəbul edildi';
  if (order.status === 'preparing') return 'Hazırlanır';
  if (order.status === 'on_the_way') return 'Yoldadır';
  if (order.status === 'courier_near') return 'Təslim edir';
  if (order.status === 'delivered') return 'Təslim edildi';
  if (order.status === 'cancelled') return 'Ləğv edildi';
  return statusAz(order.status);
}

function methodAz(method) {
  const map = {
    cash: 'Nağd',
    card_transfer: 'Kart köçürməsi',
    pos: 'POS terminal',
    online_payment: 'Online payment',
    online: 'Online payment',
  };

  return map[method] || method || '—';
}

function fullName(profile = {}) {
  return `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Adsız istifadəçi';
}

function isReallyOnline(profile = {}, device = null) {
  const lastSeen = profile.last_seen ? new Date(profile.last_seen).getTime() : 0;
  const heartbeat = device?.last_heartbeat ? new Date(device.last_heartbeat).getTime() : 0;

  const profileOnline = profile.is_online === true && Date.now() - lastSeen <= 10 * 60 * 1000;
  const deviceOnline = heartbeat && Date.now() - heartbeat <= 15 * 60 * 1000;

  return Boolean(profileOnline || deviceOnline);
}


function statusClass(status) {
  return `status-${String(status || '').replaceAll('_', '-')}`;
}

function statusBadge(status) {
  return `<span class="status-pill ${statusClass(status)}">${statusIcon(status)} ${statusAz(status)}</span>`;
}

function payBadge(status) {
  return `<span class="payment-status-pill status-${status || 'pending'}">${statusAz(status)}</span>`;
}

function statusIcon(status) {
  const root = location.pathname.includes('/admin/') ? '../' : './';
  const icons = {
    pending: `${root}assets/img/icons/order-confirmed.png`,
    confirmed: `${root}assets/img/icons/order-confirmed.png`,
    preparing: `${root}assets/img/icons/order-preparing.png`,
    on_the_way: `${root}assets/img/icons/order-delivery.png`,
    courier_near: `${root}assets/img/icons/order-delivery.png`,
    delivered: `${root}assets/img/icons/order-delivered.png`,
    cancelled: `${root}assets/img/icons/Legv-edildi-icon.png`,
  };

  return icons[status] ? `<img class="status-mini-icon" src="${icons[status]}" alt="">` : '';
}

function activeSwitch(id, checked, className, table, field = 'is_active') {
  return `
    <label class="switch" title="${checked ? 'Aktiv' : 'Passiv'}">
      <input class="${className}" data-id="${id}" data-table="${table}" data-field="${field}" type="checkbox" ${checked ? 'checked' : ''}>
      <span></span>
    </label>
  `;
}

function resetForm(id) {
  const form = $(`#${id}`);
  if (!form) return;
  form.reset();
  const hidden = form.querySelector('[name="id"]');
  if (hidden) hidden.value = '';
}

function fillForm(id, row) {
  const form = $(`#${id}`);
  if (!form) return;

  Object.entries(row).forEach(([key, value]) => {
    if (!form[key]) return;
    if (form[key].type === 'checkbox') form[key].checked = Boolean(value);
    else form[key].value = value ?? '';
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function dashboard() {
  await Promise.all([
    loadDashboardKpis(),
    loadRecentOrders(),
    loadCourierMonitor(),
    loadAdminAlerts(),
  ]);

  $('#resolveAlertsBtn')?.addEventListener('click', async () => {
    await supabase.from('admin_alerts').update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq('is_resolved', false);
    toast('Alertlər oxundu edildi');
    loadAdminAlerts();
  });
}

async function loadDashboardKpis() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [products, orders, users, couriers, pendingPay, todayOrders, revenue] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('couriers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
    supabase.from('orders').select('total_amount').eq('status', 'delivered'),
  ]);

  const totalRevenue = (revenue.data || []).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

  $('#kpis').innerHTML = `
    <div class="pro-kpi"><span>Ümumi məhsul</span><strong>${products.count || 0}</strong><small>Kataloq bazası</small></div>
    <div class="pro-kpi"><span>Ümumi sifariş</span><strong>${orders.count || 0}</strong><small>Bütün tarix</small></div>
    <div class="pro-kpi"><span>Bugünkü sifariş</span><strong>${todayOrders.count || 0}</strong><small>Canlı satış</small></div>
    <div class="pro-kpi"><span>İstifadəçi</span><strong>${users.count || 0}</strong><small>Müştəri bazası</small></div>
    <div class="pro-kpi"><span>Aktiv kuryer</span><strong>${couriers.count || 0}</strong><small>Çatdırılma komandası</small></div>
    <div class="pro-kpi"><span>Gözləyən ödəniş</span><strong>${pendingPay.count || 0}</strong><small>${money(totalRevenue)} dövriyyə</small></div>
  `;
}

async function loadRecentOrders() {
  const { data } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(8);

  $('#recentOrders').innerHTML = (data || []).map((order) => `
    <div class="pro-order-card">
      <div class="pro-cell-main">
        <span>
          <b>${esc(order.order_code || order.id)}</b>
          <small>${formatDate(order.created_at)} • ${money(order.total_amount)}</small>
        </span>
      </div>
      <div class="action-row">
        ${statusBadge(order.status)}
        ${payBadge(order.payment_status)}
        <a class="btn btn-soft btn-mini" href="orders.html?code=${encodeURIComponent(order.order_code || '')}">Aç</a>
      </div>
    </div>
  `).join('') || '<span class="muted">Sifariş yoxdur.</span>';
}


async function loadCourierMonitor() {
  if (!$('#courierMap')) return;

  const [
    { data: couriers },
    { data: profiles },
    { data: devices },
    { data: locations },
    { data: activeOrders },
  ] = await Promise.all([
    supabase.from('couriers').select('*').eq('is_active', true),
    supabase.from('profiles').select('id,first_name,last_name,email,phone,avatar_url,is_online,last_seen,role'),
    supabase.from('courier_device_status').select('*'),
    supabase.from('courier_locations').select('*').order('updated_at', { ascending: false }).limit(200),
    supabase
      .from('orders')
      .select('id,order_code,courier_id,status,total_amount,created_at')
      .in('status', ['confirmed', 'preparing', 'on_the_way', 'courier_near'])
      .order('created_at', { ascending: false }),
  ]);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
  const deviceMap = new Map((devices || []).map((d) => [d.courier_id, d]));
  const locationMap = new Map();
  const courierActiveOrderMap = new Map();

  (locations || []).forEach((loc) => {
    if (!locationMap.has(loc.courier_id)) locationMap.set(loc.courier_id, loc);
  });

  (activeOrders || []).forEach((order) => {
    if (!courierActiveOrderMap.has(order.courier_id)) {
      courierActiveOrderMap.set(order.courier_id, order);
    }
  });

  initCourierAdminMap();

  const rows = (couriers || [])
    .filter((courier) => {
      const profile = profileMap.get(courier.user_id) || {};
      return profile.role === 'courier';
    })
    .map((courier) => {
      const profile = profileMap.get(courier.user_id) || {};
      const device = deviceMap.get(courier.user_id) || {};
      const loc = locationMap.get(courier.user_id) || {};
      const activeOrder = courierActiveOrderMap.get(courier.user_id) || null;
      const online = isReallyOnline(profile, device);
      const name = fullName(profile);

      updateCourierMarker(courier, profile, device, loc);

      return `
        <div class="admin-live-card focus-courier" data-courier-id="${courier.user_id}">
          <img class="admin-avatar" src="${profile.avatar_url || PLACEHOLDER}" alt="${esc(name)}">

          <div class="admin-courier-main">
            <div class="admin-courier-topline">
              <b>
                <span class="admin-online-dot ${online ? 'online' : 'offline'}"></span>
                ${esc(name)}
              </b>
              <small>${esc(profile.phone || 'Telefon yoxdur')} • Son siqnal: ${heartbeatText(device.last_heartbeat)}</small>
            </div>

            ${activeOrder ? `
              <small class="admin-order-mini">
                Sifariş: <b class="order-code-green">${esc(activeOrder.order_code || '')}</b>
                <span>•</span>
                <b class="order-price-gold">${money(activeOrder.total_amount || 0)}</b>
              </small>
            ` : `
              <small class="admin-order-mini muted">Sifariş yoxdur</small>
            `}

            ${courierFlowHtml(activeOrder)}
          </div>

          <div class="admin-device-mini">
            <span class="mini-badge ${online ? 'mini-green' : 'mini-red'}">${online ? 'Online' : 'Offline'}</span>

            <span class="mini-badge ${
              device.battery_level === null || device.battery_level === undefined
                ? 'mini-blue'
                : Number(device.battery_level) <= 15
                  ? 'mini-red'
                  : 'mini-green'
            }">
              🔋 ${device.battery_level === null || device.battery_level === undefined ? 'dəstək yoxdur' : `${device.battery_level}%`}
            </span>

            <span class="mini-badge ${
              online
                ? 'mini-green'
                : device.network_status === 'offline'
                  ? 'mini-red'
                  : 'mini-blue'
            }">
              🌐 ${online ? 'internet var' : device.network_status === 'offline' ? 'internet yoxdur' : 'bilinmir'}
            </span>

            <span class="mini-badge ${loc.lat && loc.lng ? 'mini-green' : 'mini-yellow'}">
              📍 ${loc.lat && loc.lng ? 'GPS var' : 'GPS yoxdur'}
            </span>
          </div>
        </div>
      `;
    });

  $('#courierLiveList').innerHTML = rows.join('') || '<span class="muted">Aktiv kuryer yoxdur.</span>';

  $$('.focus-courier').forEach((card) => {
    card.addEventListener('click', () => {
      const marker = courierMarkers.get(card.dataset.courierId);
      if (!marker || !courierMap) {
        toast('Bu kuryerin GPS məlumatı hələ yoxdur');
        return;
      }

      courierMap.setView(marker.getLatLng(), 15, { animate: true });
      marker.openPopup();
      setTimeout(() => courierMap.invalidateSize(), 120);
    });
  });

  fitAllCourierMarkers();

  setTimeout(() => {
    courierMap?.invalidateSize();
  }, 250);

  await generateCourierAlerts(couriers || [], profileMap, deviceMap, locationMap);
}



function initCourierAdminMap() {
  if (!window.L || courierMap) return;

  courierMap = L.map('courierMap', { zoomControl: false }).setView([40.4093, 49.8671], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
  }).addTo(courierMap);

  setTimeout(() => courierMap.invalidateSize(), 150);
}


function updateCourierMarker(courier, profile, device, location) {
  if (!courierMap || !location?.lat || !location?.lng) return;

  const lat = Number(location.lat);
  const lng = Number(location.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const name = fullName(profile);
  const online = isReallyOnline(profile, device);

  const popup = `
    <b>${esc(name)}</b><br>
    ${online ? '🟢 Online' : '🔴 Offline'}<br>
    🔋 ${device?.battery_level ?? 'dəstək yoxdur'}${device?.battery_level ? '%' : ''}
    🌐 ${online ? 'internet var' : 'bilinmir'}<br>
    📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}
  `;

  if (courierMarkers.has(courier.user_id)) {
    const marker = courierMarkers.get(courier.user_id);
    animateMarkerTo(marker, [lat, lng]);
    marker.setPopupContent(popup);
    return;
  }

  const icon = L.icon({
    iconUrl: '../assets/img/icons/courier-marker.png',
    iconSize: [42, 42],
    iconAnchor: [21, 42],
  });

  const marker = L.marker([lat, lng], { icon }).addTo(courierMap).bindPopup(popup);
  courierMarkers.set(courier.user_id, marker);
}


async function generateCourierAlerts(couriers, profileMap, deviceMap, locationMap) {
  for (const courier of couriers) {
    const profile = profileMap.get(courier.user_id) || {};
    const device = deviceMap.get(courier.user_id) || {};
    const loc = locationMap.get(courier.user_id) || {};
    const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Kuryer';

    if (device.last_heartbeat) {
      const diff = Date.now() - new Date(device.last_heartbeat).getTime();
      if (diff > 15 * 60 * 1000) {
        await createAlertOnce('courier_offline', courier.user_id, null, 'critical', 'Kuryer ilə əlaqə kəsildi', `${name} son 2 dəqiqə ərzində heartbeat göndərməyib.`);
      }
    }

    if (Number(device.battery_level) > 0 && Number(device.battery_level) <= 10) {
      await createAlertOnce('low_battery', courier.user_id, null, 'medium', 'Kuryerin batareyası azdır', `${name} telefon batareyası ${device.battery_level}% səviyyəsindədir.`);
    }

    if (device.network_status === 'offline') {
      await createAlertOnce('network_offline', courier.user_id, null, 'high', 'Kuryer interneti offline görünür', `${name} cihazında internet bağlantısı kəsilib.`);
    }

    if (loc.updated_at) {
      const diff = Date.now() - new Date(loc.updated_at).getTime();
      if (diff > 20 * 60 * 1000) {
        await createAlertOnce('idle_location', courier.user_id, loc.order_id, 'medium', 'Kuryer lokasiyası yenilənmir', `${name} son 5 dəqiqə ərzində GPS yeniləməyib.`);
      }
    }
  }
}

async function createAlertOnce(type, courierId, orderId, severity, title, body) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('admin_alerts')
    .select('id')
    .eq('alert_type', type)
    .eq('courier_id', courierId)
    .eq('is_resolved', false)
    .gte('created_at', since)
    .maybeSingle();

  if (data?.id) return;

  await supabase.from('admin_alerts').insert({
    alert_type: type,
    courier_id: courierId,
    order_id: orderId || null,
    severity,
    title,
    body,
  });
}

async function loadAdminAlerts() {
  const { data, error } = await supabase
    .from('admin_alerts')
    .select('*')
    .eq('is_resolved', false)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    $('#adminAlertsList').innerHTML = `<span class="muted">${error.message}</span>`;
    return;
  }

  const critical = (data || []).filter((a) => a.severity === 'critical');

  
    if (critical.length) {
      $('#adminAlertBar')?.classList.remove('hide');
      $('#adminAlertBar').textContent = `${critical.length} kritik xəbərdarlıq var. Alert mərkəzinə baxın.`;
    
    playAdminSound(true);
      
    } else {
      window.__adminCriticalAlarmPlayed = false;
      stopAdminAlarm();
      $('#adminAlertBar')?.classList.add('hide');
    }
  
  
  $('#adminAlertsList').innerHTML = (data || []).map((alert) => `
    <div class="admin-alert-card ${alert.severity === 'critical' ? 'critical' : ''}">
      <b>${esc(alert.title)}</b>
      <small class="muted">${esc(alert.body || '')}</small>
      <div class="action-row">
        <span class="mini-badge ${alert.severity === 'critical' ? 'mini-red' : alert.severity === 'high' ? 'mini-yellow' : 'mini-blue'}">${esc(alert.severity)}</span>
        <small class="muted">${formatDate(alert.created_at)}</small>
        <button class="btn btn-soft btn-mini resolve-alert" data-id="${alert.id}">Oxundu</button>
      </div>
    </div>
  `).join('') || '<span class="muted">Aktiv alert yoxdur.</span>';

  $$('.resolve-alert').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await supabase
        .from('admin_alerts')
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq('id', btn.dataset.id);

      loadAdminAlerts();
    });
  });
}

function playAdminSound(force = false) {
  try {
    const audio = $('#adminNotifyAudio');
    if (!audio) return;

    audio.src = '../assets/sounds/courier-alarm.mp3';
    audio.volume = 0.9;
    audio.loop = false;

    const run = () => {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    };

    if (adminSoundReady || force) run();

    if (force) {
      clearInterval(adminAlarmLoop);

      adminAlarmLoop = setInterval(() => {
        const hasCritical = document.querySelector('.admin-alert-card.critical');

        if (!hasCritical) {
          stopAdminAlarm();
          return;
        }

        run();
      }, 4500);
    }
  } catch (error) {
    console.warn('Admin alarm səsi işləmədi:', error.message);
  }
}

function stopAdminAlarm() {
  const audio = $('#adminNotifyAudio');

  clearInterval(adminAlarmLoop);
  adminAlarmLoop = null;

  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

async function catalog() {
  await loadCategories();
  await loadProducts();

  $('#catForm')?.addEventListener('submit', saveCategory);
  $('#productForm')?.addEventListener('submit', saveProduct);
  $('#newCat')?.addEventListener('click', () => resetForm('catForm'));
  $('#newProduct')?.addEventListener('click', () => resetForm('productForm'));

  $('#productSearch')?.addEventListener('input', loadProducts);
  $('#categorySearch')?.addEventListener('input', loadCategories);

  $('#productImportBtn')?.addEventListener('click', () => {
  $('#productExcelImport')?.click();
  });
  
  $('#productExcelImport')?.addEventListener('change', importProductsFromExcel);
  $('#productTemplateBtn')?.addEventListener('click', downloadProductExcelTemplate);
  $('#productExportBtn')?.addEventListener('click', exportProductsToExcel);

    await loadDiscountCards();

  $('#discountCardSearch')?.addEventListener('input', loadDiscountCards);
  $('#discountPrintAllBtn')?.addEventListener('click', printAllDiscountCards);
  $('#discountPdfAllBtn')?.addEventListener('click', printAllDiscountCards);
  
}

async function loadCategories() {
  const q = ($('#categorySearch')?.value || '').trim();

  let query = supabase.from('categories').select('*,products(id)', { count: 'exact' }).order('sort_order');

  if (q) query = query.ilike('name', `%${q}%`);

  const { data, error } = await query;
  const table = $('#catTable');
  if (!table) return;

  table.innerHTML = error
    ? `<tr><td colspan="7">${error.message}</td></tr>`
    : (data || []).map((category) => `
      <tr>
        <td>
          <div class="pro-cell-main">
            <img class="admin-product-img" src="${category.image_url || PLACEHOLDER}" alt="${esc(category.name)}">
            <span><b>${esc(category.name)}</b><small>${esc(category.description || 'Açıqlama yoxdur')}</small></span>
          </div>
        </td>
        <td>${esc(category.slug)}</td>
        <td>${category.sort_order || 0}</td>
        <td>${category.products?.length || 0}</td>
        <td>${activeSwitch(category.id, category.is_active, 'toggle-active', 'categories')}</td>
        <td>${formatDate(category.created_at)}</td>
        <td>
          <div class="action-row">
            <button class="btn btn-soft btn-mini edit-cat" data-row="${rowAttr(category)}">Redaktə</button>
            <button class="btn btn-danger btn-mini del-cat" data-id="${category.id}">Sil</button>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="7">Kateqoriya yoxdur.</td></tr>';

  bindCategoryEvents();
}

function bindCategoryEvents() {
  $$('.edit-cat').forEach((button) => {
    button.addEventListener('click', () => fillForm('catForm', JSON.parse(button.dataset.row)));
  });

  $$('.del-cat').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Kateqoriya silinsin?')) return;
      const { error } = await supabase.from('categories').delete().eq('id', button.dataset.id);
      toast(error ? error.message : 'Kateqoriya silindi');
      loadCategories();
      loadProducts();
    });
  });

  $$('.toggle-active').forEach((input) => input.addEventListener('change', toggleActive));
}

async function saveCategory(event) {
  event.preventDefault();

  const data = formData(event.target);
  let imageUrl = data.image_url || null;
  const file = $('#catImage')?.files?.[0];

  try {
    if (file) imageUrl = await uploadFile('products', file, 'categories');

    const row = {
      name: data.name,
      slug: data.slug || slugify(data.name),
      description: data.description,
      sort_order: Number(data.sort_order || 0),
      image_url: imageUrl,
      is_active: data.is_active === 'on',
      updated_at: new Date().toISOString(),
    };

    const response = data.id
      ? await supabase.from('categories').update(row).eq('id', data.id)
      : await supabase.from('categories').insert(row);

    toast(response.error ? response.error.message : 'Kateqoriya saxlanıldı');
    event.target.reset();
    loadCategories();
    loadProducts();
  } catch (error) {
    toast(error.message);
  }
}

async function loadProducts() {
  const q = ($('#productSearch')?.value || '').trim();

  const [products, categories] = await Promise.all([
    supabase.from('products').select('*,categories(name)').order('created_at', { ascending: false }).limit(5000),
    supabase.from('categories').select('id,name').order('sort_order'),
  ]);

  $('#productCategory').innerHTML = '<option value="">Kateqoriya seç</option>' + (categories.data || []).map((category) => `
    <option value="${category.id}">${esc(category.name)}</option>
  `).join('');

  const filtered = q
    ? (products.data || []).filter((p) => String(p.name || '').toLowerCase().includes(q.toLowerCase()))
    : (products.data || []);

  $('#productTable').innerHTML = products.error
    ? `<tr><td colspan="10">${products.error.message}</td></tr>`
    : filtered.map((product) => `
      <tr>
        <td><img class="admin-product-img" src="${product.image_url || PLACEHOLDER}" alt="${esc(product.name)}"></td>
        <td>
          <b>${esc(product.name)}</b>
          <small class="muted">${esc(product.short_description || '')}</small>
        </td>
        <td>${esc(product.categories?.name || 'Kateqoriyasız')}</td>
        <td>${money(product.price)}${product.old_price ? `<br><small class="muted">${money(product.old_price)}</small>` : ''}</td>
        <td>${product.stock_quantity || 0} ${esc(product.unit || 'ədəd')}</td>
        <td>${product.is_featured ? '<span class="mini-badge mini-yellow">Seçilmiş</span>' : '<span class="mini-badge mini-blue">Adi</span>'}</td>
        <td>${activeSwitch(product.id, product.status === 'active', 'toggle-product-status', 'products', 'status')}</td>
        <td>${formatDate(product.created_at)}</td>
        <td>
          <div class="action-row">
            <button class="btn btn-soft btn-mini edit-product" data-row="${rowAttr(product)}">Redaktə</button>
            <button class="btn btn-danger btn-mini del-product" data-id="${product.id}">Sil</button>
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="10">Məhsul yoxdur.</td></tr>';

  bindProductEvents();
}

function bindProductEvents() {
  $$('.edit-product').forEach((button) => {
    button.addEventListener('click', () => fillForm('productForm', JSON.parse(button.dataset.row)));
  });

  $$('.del-product').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Məhsul silinsin?')) return;
      const { error } = await supabase.from('products').delete().eq('id', button.dataset.id);
      toast(error ? error.message : 'Məhsul silindi');
      loadProducts();
    });
  });

  $$('.toggle-product-status').forEach((input) => input.addEventListener('change', async () => {
    const status = input.checked ? 'active' : 'inactive';
    const { error } = await supabase.from('products').update({ status, updated_at: new Date().toISOString() }).eq('id', input.dataset.id);
    toast(error ? error.message : 'Məhsul statusu dəyişdi');
    loadProducts();
  }));
}

async function saveProduct(event) {
  event.preventDefault();

  const data = formData(event.target);

  try {
    let imageUrl = data.image_url || null;
    if ($('#productImage')?.files?.[0]) {
      imageUrl = await uploadFile('products', $('#productImage').files[0], 'products');
    }

    const row = {
      category_id: data.category_id || null,
      name: data.name,
      slug: data.slug || slugify(data.name),
      price: Number(data.price || 0),
      old_price: data.old_price ? Number(data.old_price) : null,
      stock_quantity: Number(data.stock_quantity || 0),
      unit: data.unit || 'ədəd',
      image_url: imageUrl,
      short_description: data.short_description,
      description: data.description,
      is_featured: data.is_featured === 'on',
      status: data.status || 'active',
      updated_at: new Date().toISOString(),
    };

    const response = data.id
      ? await supabase.from('products').update(row).eq('id', data.id)
      : await supabase.from('products').insert(row);

    toast(response.error ? response.error.message : 'Məhsul saxlanıldı');
    event.target.reset();
    loadProducts();
  } catch (error) {
    toast(error.message);
  }
}



async function ordersPayments() {
  const code = new URLSearchParams(location.search).get('code');

  if (code && $('#orderSearch')) {
    $('#orderSearch').value = code;
  }

  initPreparationDates();

  await loadOrders();
  await loadPayments();
  await loadPreparationCenter();

  $('#orderSearch')?.addEventListener('input', loadOrders);
  $('#paymentSearch')?.addEventListener('input', loadPayments);

  $('#prepFilterBtn')?.addEventListener('click', loadPreparationCenter);
  $('#prepSearch')?.addEventListener('input', loadPreparationCenter);
  $('#prepStatus')?.addEventListener('change', loadPreparationCenter);
  $('#prepStartDate')?.addEventListener('change', loadPreparationCenter);
  $('#prepEndDate')?.addEventListener('change', loadPreparationCenter);

  $('#prepExportBtn')?.addEventListener('click', exportPreparationExcel);
  $('#prepPrintBtn')?.addEventListener('click', printPreparationCenter);
}



async function loadOrders() {
  const [ordersRes, profilesRes, couriersRes, paymentsRes, itemsRes] = await Promise.all([
    supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(250),
    supabase.from('profiles').select('*'),
    supabase.from('couriers').select('*'),
    supabase.from('payments').select('*'),
    supabase.from('order_items').select('*'),
  ]);

  const table = $('#ordersTable');
  if (!table) return;

  if (ordersRes.error) {
    table.innerHTML = `<tr><td colspan="11">${ordersRes.error.message}</td></tr>`;
    return;
  }

  const search = ($('#orderSearch')?.value || '').toLowerCase();
  const profilesMap = new Map((profilesRes.data || []).map((p) => [p.id, p]));
  const paymentsMap = new Map((paymentsRes.data || []).map((p) => [p.order_id, p]));
  const itemsMap = new Map();

  (itemsRes.data || []).forEach((item) => {
    if (!itemsMap.has(item.order_id)) itemsMap.set(item.order_id, []);
    itemsMap.get(item.order_id).push(item);
  });

  const activeCouriers = (couriersRes.data || [])
    .map((courier) => ({ ...courier, profile: profilesMap.get(courier.user_id) }))
    .filter((courier) => courier.is_active && courier.profile?.role === 'courier');

  const makeCourierOptions = (selectedId = '') => activeCouriers.map((courier) => {
    const p = courier.profile || {};
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Kuryer';
    const phone = p.phone ? ` • ${p.phone}` : '';
    return `<option value="${courier.user_id}" ${selectedId === courier.user_id ? 'selected' : ''}>${esc(name)}${phone}${courier.vehicle_plate ? ` • ${esc(courier.vehicle_plate)}` : ''}</option>`;
  }).join('');

  let rows = ordersRes.data || [];
  if (search) {
    rows = rows.filter((o) => {
      const p = profilesMap.get(o.user_id) || {};
      return [o.order_code, o.full_name, o.phone, p.email, p.phone, p.first_name, p.last_name, o.address_text, o.city_region]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }

  table.innerHTML = rows.map((order) => {
    const p = profilesMap.get(order.user_id) || {};
    const courier = profilesMap.get(order.courier_id) || {};
    const customerName = safe(order.full_name, `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Müştəri');
    const phone = safe(order.phone, p.phone || '—');
    const address = [order.city_region, order.address_text || p.address_line, order.apartment || p.apartment, order.door_code || p.door_code].filter(Boolean).join(', ');

    return `
      <tr>
        <td>
          <b>${esc(order.order_code || order.id)}</b>
          <small class="muted">${formatDate(order.created_at)}</small>
        </td>
        <td>
          <b>${esc(customerName)}</b>
          <small class="muted">${esc(p.email || 'Email yoxdur')}</small>
          <small class="muted">📞 ${esc(phone)}</small>
        </td>
        <td>
          <small>${esc(address || 'Ünvan yoxdur')}</small>
        </td>
        <td>${statusBadge(order.status)}</td>
        <td>${payBadge(order.payment_status)}</td>
        <td class="admin-money-cell">
          <b>${money(order.total_amount)}</b>
          <small>${itemsMap.get(order.id)?.length || 0} məhsul</small>
        </td>
        <td>
          <select class="assign" data-id="${order.id}">
            <option value="">Kuryer seç</option>
            ${makeCourierOptions(order.courier_id)}
          </select>
          <small class="muted">${esc(fullName(courier))}</small>
        </td>
        <td>
          <div class="action-row">
            <button class="btn btn-soft btn-mini view-order" data-row="${rowAttr({ order, profile: p, items: itemsMap.get(order.id) || [], payment: paymentsMap.get(order.id) || {} })}">Detallar</button>
            <button class="btn btn-soft btn-mini status" data-id="${order.id}" data-s="confirmed">Təsdiq</button>
            <button class="btn btn-soft btn-mini status" data-id="${order.id}" data-s="preparing">Hazırla</button>
            <button class="btn btn-soft btn-mini status" data-id="${order.id}" data-s="on_the_way">Kuryerə ver</button>
            <button class="btn btn-primary btn-mini status" data-id="${order.id}" data-s="delivered">Təhvil</button>
            <button class="btn btn-danger btn-mini status" data-id="${order.id}" data-s="cancelled">Ləğv</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="8">Sifariş yoxdur.</td></tr>';

  bindOrderEvents();
}

function bindOrderEvents() {
  $$('.assign').forEach((select) => {
    select.addEventListener('change', async () => {
      if (!select.value) return;
      select.disabled = true;
      const { error } = await assignCourierSafe(select.dataset.id, select.value);
      toast(error ? error.message : 'Kuryer təyin edildi');
      select.disabled = false;
      loadOrders();
    });
  });

  $$('.status').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      const { error } = await supabase.rpc('admin_update_order_status', {
        p_order_id: button.dataset.id,
        p_status: button.dataset.s,
      });
      toast(error ? error.message : 'Status dəyişdi');
      button.disabled = false;
      loadOrders();
      loadPayments();
    });
  });

  $$('.view-order').forEach((button) => {
    button.addEventListener('click', () => {
      const data = JSON.parse(button.dataset.row);
      showOrderDetails(data);
    });
  });
}

function showOrderDetails({ order, profile, items, payment }) {
  openAdminModal(`Sifariş detalları: ${safe(order.order_code)}`, `
    <div class="admin-detail-grid">
      <div class="admin-detail-box"><b>Müştəri</b><span>${esc(order.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email)}</span></div>
      <div class="admin-detail-box"><b>Telefon</b><span>${esc(order.phone || profile.phone)}</span></div>
      <div class="admin-detail-box"><b>Email</b><span>${esc(profile.email)}</span></div>
      <div class="admin-detail-box"><b>Məbləğ</b><span>${money(order.total_amount)}</span></div>
      <div class="admin-detail-box"><b>Status</b><span>${statusAz(order.status)}</span></div>
      <div class="admin-detail-box"><b>Ödəniş</b><span>${statusAz(order.payment_status)} • ${esc(order.payment_method)}</span></div>
      <div class="admin-detail-box admin-detail-full"><b>Ünvan</b><span>${esc([order.city_region, order.address_text || profile.address_line, order.apartment, order.door_code].filter(Boolean).join(', '))}</span></div>
      <div class="admin-detail-box admin-detail-full"><b>Müştəri qeydi</b><span>${esc(order.customer_note || order.note || 'Qeyd yoxdur')}</span></div>
      <div class="admin-detail-box admin-detail-full"><b>Məhsullar</b><span>${(items || []).map((i) => `${esc(i.product_name)} — ${i.quantity} × ${money(i.unit_price)} = ${money(i.line_total)}`).join('<br>') || 'Məhsul yoxdur'}</span></div>
      <div class="admin-detail-box admin-detail-full"><b>Çek</b><span>${payment?.receipt_url ? `<a class="btn btn-soft btn-mini" target="_blank" href="${payment.receipt_url}">Çekə bax</a>` : 'Çek yoxdur'}</span></div>
    </div>
  `);
}

async function assignCourierSafe(orderId, courierId) {
  const response = await supabase.rpc('assign_courier_to_order', {
    p_order_id: orderId,
    p_courier_id: courierId,
    p_note: 'Admin paneldən kuryer təyin edildi',
  });

  if (response.error) {
    const fallback = await supabase
      .from('orders')
      .update({ courier_id: courierId, status: 'on_the_way', updated_at: new Date().toISOString() })
      .eq('id', orderId);

    return { error: fallback.error || response.error };
  }

  return { error: null };
}



let preparationRowsCache = [];
let preparationPurchaseCache = [];
let preparationOrdersCache = [];

function initPreparationDates() {
  const start = $('#prepStartDate');
  const end = $('#prepEndDate');
  if (!start || !end) return;

  const today = new Date();
  const value = today.toISOString().slice(0, 10);

  if (!start.value) start.value = value;
  if (!end.value) end.value = value;
}

function getPreparationRange() {
  const startValue = $('#prepStartDate')?.value;
  const endValue = $('#prepEndDate')?.value;

  const start = startValue ? new Date(`${startValue}T00:00:00`) : new Date();
  const end = endValue ? new Date(`${endValue}T23:59:59`) : new Date();

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function loadPreparationCenter() {
  if (!$('#prepSummaryTable')) return;

  const range = getPreparationRange();
  const status = $('#prepStatus')?.value || 'active';
  const search = ($('#prepSearch')?.value || '').trim().toLowerCase();

  let ordersQuery = supabase
    .from('orders')
    .select('*')
    .gte('created_at', range.start)
    .lte('created_at', range.end)
    .order('created_at', { ascending: true })
    .limit(500);

  if (status === 'active') {
    ordersQuery = ordersQuery.in('status', ['confirmed', 'preparing']);
  } else if (status !== 'all') {
    ordersQuery = ordersQuery.eq('status', status);
  }

  const [ordersRes, itemsRes, productsRes, profilesRes] = await Promise.all([
    ordersQuery,
    supabase.from('order_items').select('*').limit(3000),
    supabase.from('products').select('id,name,stock_quantity,unit,status').limit(1000),
    supabase.from('profiles').select('id,first_name,last_name,email,phone,city_region,address_line,apartment,door_code').limit(1000),
  ]);

  if (ordersRes.error) {
    $('#prepSummaryTable').innerHTML = `<tr><td colspan="5">${esc(ordersRes.error.message)}</td></tr>`;
    return;
  }

  const orders = ordersRes.data || [];
  const orderIds = new Set(orders.map((o) => o.id));
  const productsMap = new Map((productsRes.data || []).map((p) => [p.id, p]));
  const profilesMap = new Map((profilesRes.data || []).map((p) => [p.id, p]));
  const ordersMap = new Map(orders.map((o) => [o.id, o]));

  const items = (itemsRes.data || []).filter((item) => orderIds.has(item.order_id));

  const productAgg = new Map();

  items.forEach((item) => {
    const order = ordersMap.get(item.order_id);
    if (!order) return;

    const product = productsMap.get(item.product_id) || {};
    const productName = item.product_name || product.name || 'Adsız məhsul';

    if (search && !productName.toLowerCase().includes(search)) return;

    const key = item.product_id || productName;
    const quantity = Number(item.quantity || 0);
    const stock = Number(product.stock_quantity || 0);
    const unit = product.unit || 'ədəd';
    const profile = profilesMap.get(order.user_id) || {};

    const customerName =
      order.full_name ||
      `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
      profile.email ||
      'Müştəri';

    if (!productAgg.has(key)) {
      productAgg.set(key, {
        product_id: item.product_id,
        product_name: productName,
        unit,
        stock,
        total_quantity: 0,
        customers: [],
        first_order_date: order.created_at,
      });
    }

    const row = productAgg.get(key);
    row.total_quantity += quantity;

    if (new Date(order.created_at) < new Date(row.first_order_date)) {
      row.first_order_date = order.created_at;
    }

    row.customers.push({
      order_code: order.order_code || order.id,
      customer_name: customerName,
      phone: order.phone || profile.phone || '',
      quantity,
      unit,
      created_at: order.created_at,
      status: order.status,
    });
  });

  const rows = [...productAgg.values()]
    .map((row) => ({
      ...row,
      need_quantity: Math.max(Number(row.total_quantity || 0) - Number(row.stock || 0), 0),
      remain_quantity: Math.max(Number(row.stock || 0) - Number(row.total_quantity || 0), 0),
      customers: row.customers.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    }))
    .sort((a, b) => new Date(a.first_order_date) - new Date(b.first_order_date));

  
preparationRowsCache = rows;
preparationPurchaseCache = rows.filter((row) => row.need_quantity > 0);

preparationOrdersCache = orders.map((order) => {
  const profile = profilesMap.get(order.user_id) || {};
  const orderItems = items
    .filter((item) => item.order_id === order.id)
    .map((item) => {
      const product = productsMap.get(item.product_id) || {};
      return {
        product_name: item.product_name || product.name || 'Məhsul',
        quantity: Number(item.quantity || 0),
        unit: product.unit || 'ədəd',
        unit_price: Number(item.unit_price || 0),
        line_total: Number(item.line_total || 0),
      };
    });

  return {
    order,
    profile,
    items: orderItems,
  };
});
  

  renderPreparationKpis(rows, orders);
  renderPreparationSummary(rows);
  renderPreparationDetails(rows);
  renderPreparationPurchase(preparationPurchaseCache);
}

function renderPreparationKpis(rows, orders) {
  const totalProducts = rows.length;
  const totalOrders = orders.length;
  const needCount = rows.filter((row) => row.need_quantity > 0).length;
  const readyCount = rows.filter((row) => row.need_quantity <= 0).length;

  $('#prepKpis').innerHTML = `
    <div class="prep-kpi"><span>Sifariş</span><b>${totalOrders}</b><small>Seçilən tarix aralığı</small></div>
    <div class="prep-kpi"><span>Məhsul çeşidi</span><b>${totalProducts}</b><small>Cəmlənmiş məhsul sayı</small></div>
    <div class="prep-kpi"><span>Anbarda var</span><b>${readyCount}</b><small>Tam hazırlana bilər</small></div>
    <div class="prep-kpi danger"><span>Satınalma lazımdır</span><b>${needCount}</b><small>Çatışmayan məhsul</small></div>
  `;
}

function renderPreparationSummary(rows) {
  $('#prepSummaryTable').innerHTML = rows.map((row) => `
    <tr>
      <td>
        <b>${esc(row.product_name)}</b>
        <small class="muted">${formatDate(row.first_order_date)} tarixindən başlayır</small>
      </td>
      <td><b>${row.total_quantity} ${esc(row.unit)}</b></td>
      <td>${row.stock} ${esc(row.unit)}</td>
      <td>
        ${
          row.need_quantity > 0
            ? `<span class="prep-badge danger">Alınmalıdır: ${row.need_quantity} ${esc(row.unit)}</span>`
            : `<span class="prep-badge success">Yetərlidir</span>`
        }
      </td>
      <td>${row.remain_quantity} ${esc(row.unit)}</td>
    </tr>
  `).join('') || '<tr><td colspan="5">Bu tarix aralığında hazırlanacaq məhsul yoxdur.</td></tr>';
}

function renderPreparationDetails(rows) {
  $('#prepDetailsList').innerHTML = rows.map((row) => `
    <details class="prep-detail-card">
      <summary>
        <span>
          <b>${esc(row.product_name)}</b>
          <small>${row.total_quantity} ${esc(row.unit)} ümumi sifariş</small>
        </span>
        ${
          row.need_quantity > 0
            ? `<em class="prep-badge danger">Çatışmır: ${row.need_quantity} ${esc(row.unit)}</em>`
            : `<em class="prep-badge success">Anbarda var</em>`
        }
      </summary>

      <div class="prep-customer-list">
        ${row.customers.map((customer, index) => `
          <div class="prep-customer-row">
            <div>
              <b>${index + 1}. ${esc(customer.customer_name)}</b>
              <small>${esc(customer.order_code)} • ${formatDate(customer.created_at)} • ${statusAz(customer.status)}</small>
              ${customer.phone ? `<small>📞 ${esc(customer.phone)}</small>` : ''}
            </div>
            <strong>${customer.quantity} ${esc(customer.unit)}</strong>
          </div>
        `).join('')}
      </div>
    </details>
  `).join('') || '<span class="muted">Müştəri detalları yoxdur.</span>';
}

function renderPreparationPurchase(rows) {
  $('#prepPurchaseTable').innerHTML = rows.map((row) => `
    <tr>
      <td><b>${esc(row.product_name)}</b></td>
      <td>${row.total_quantity} ${esc(row.unit)}</td>
      <td>${row.stock} ${esc(row.unit)}</td>
      <td><span class="prep-badge danger">${row.need_quantity} ${esc(row.unit)}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="4">Satınalma ehtiyacı yoxdur.</td></tr>';
}



async function exportPreparationExcel() {
  if (!window.ExcelJS) {
    toast('ExcelJS kitabxanası yüklənməyib');
    return;
  }

  if (!preparationRowsCache.length && !preparationOrdersCache.length) {
    toast('Export üçün məlumat yoxdur');
    return;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Meyveci.az';
  workbook.created = new Date();


  
let logoId = null;

try {
  const logoUrl = new URL('../img/logo/Meyveci-logo.png', import.meta.url).href;

  const logoRes = await fetch(logoUrl, {
    cache: 'no-store',
    mode: 'cors',
  });

  if (!logoRes.ok) {
    throw new Error(`Logo tapılmadı: ${logoRes.status}`);
  }

  const logoBlob = await logoRes.blob();

  const logoBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error('Logo base64 çevrilmədi'));
    };

    reader.readAsDataURL(logoBlob);
  });

  logoId = workbook.addImage({
    base64: logoBase64,
    extension: 'png',
  });

  console.log('Excel logo əlavə edildi:', logoUrl);
} catch (error) {
  console.warn('Excel logo xətası:', error.message);
  logoId = null;
}
  

  
  const border = {
    top: { style: 'thin', color: { argb: 'FFB7E4C7' } },
    left: { style: 'thin', color: { argb: 'FFB7E4C7' } },
    bottom: { style: 'thin', color: { argb: 'FFB7E4C7' } },
    right: { style: 'thin', color: { argb: 'FFB7E4C7' } },
  };

  const headerFill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDCFCE7' },
  };

  const titleFill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF16A34A' },
  };

  function styleHeader(row) {
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FF064E3B' } };
      cell.fill = headerFill;
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
  }

  function styleBody(row) {
    row.eachCell((cell) => {
      cell.border = border;
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  }

  
const usedSheetNames = new Set();

function safeSheetName(name) {
  let clean = String(name || 'List')
    .replace(/[\\/*?:[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) clean = 'List';

  let finalName = clean.slice(0, 31);
  let counter = 2;

  while (usedSheetNames.has(finalName)) {
    const suffix = `-${counter}`;
    finalName = `${clean.slice(0, 31 - suffix.length)}${suffix}`;
    counter++;
  }

  usedSheetNames.add(finalName);
  return finalName;
}
  

function addLogo(ws) {
  ws.getRow(2).height = 24;
  ws.getRow(3).height = 24;

  if (!logoId) {
    ws.getCell('A2').value = 'Meyveci.az';
    ws.getCell('A2').font = { bold: true, size: 14, color: { argb: 'FF047857' } };
    ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    return;
  }

  ws.addImage(logoId, 'A2:A3');
}

  

  const summarySheet = workbook.addWorksheet('Hazırlanma Mərkəzi');

  summarySheet.columns = [
    { key: 'a', width: 28 },
    { key: 'b', width: 18 },
    { key: 'c', width: 18 },
    { key: 'd', width: 22 },
    { key: 'e', width: 20 },
  ];

  //addLogo(summarySheet);

  summarySheet.mergeCells('A1:E3');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = 'Hazırlanma Mərkəzi';
  titleCell.font = { bold: true, size: 20, color: { argb: 'FF064E3B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  summarySheet.getCell('A4').value = `Tarix: ${new Date().toLocaleString('az-AZ')}`;
  summarySheet.mergeCells('A4:E4');

  summarySheet.addRow([]);
  const h1 = summarySheet.addRow(['Məhsul', 'Cəm miqdar', 'Anbar qalığı', 'Satınalma ehtiyacı', 'Anbarda qalacaq']);
  styleHeader(h1);

  preparationRowsCache.forEach((row) => {
    const r = summarySheet.addRow([
      row.product_name,
      `${row.total_quantity} ${row.unit}`,
      `${row.stock} ${row.unit}`,
      row.need_quantity > 0 ? `${row.need_quantity} ${row.unit}` : 'Yetərlidir',
      `${row.remain_quantity} ${row.unit}`,
    ]);
    styleBody(r);
  });

  summarySheet.addRow([]);
  const purchaseTitle = summarySheet.addRow(['SATINALMA SİYAHISI']);
  summarySheet.mergeCells(`A${purchaseTitle.number}:E${purchaseTitle.number}`);
  purchaseTitle.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  purchaseTitle.getCell(1).fill = titleFill;
  purchaseTitle.getCell(1).alignment = { horizontal: 'center' };

  const h2 = summarySheet.addRow(['Məhsul', 'Lazım olan', 'Anbar', 'Alınacaq', 'Qeyd']);
  styleHeader(h2);

  preparationPurchaseCache.forEach((row) => {
    const r = summarySheet.addRow([
      row.product_name,
      `${row.total_quantity} ${row.unit}`,
      `${row.stock} ${row.unit}`,
      `${row.need_quantity} ${row.unit}`,
      'Satınalma lazımdır',
    ]);
    styleBody(r);
  });

  summarySheet.pageSetup = {
  paperSize: 9,
  orientation: 'portrait',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 1,
  margins: {
    left: 0.25,
    right: 0.25,
    top: 0.35,
    bottom: 0.35,
    header: 0.1,
    footer: 0.1,
  },
};


  preparationOrdersCache.forEach((data, index) => {
  const order = data.order || {};
  const profile = data.profile || {};
  const items = data.items || [];

  const customerName =
    order.full_name ||
    `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
    profile.email ||
    `Müştəri ${index + 1}`;

  const fullAddress = [
    order.city_region,
    order.address_text,
    profile.address_line && profile.address_line !== order.address_text ? profile.address_line : '',
    order.apartment || profile.apartment,
    order.door_code || profile.door_code,
  ].filter(Boolean).join(', ');

  const shortCode = String(order.order_code || order.id || index + 1).slice(-6);

  const ws = workbook.addWorksheet(
    safeSheetName(`${customerName}-${shortCode}`)
  );

  ws.columns = [
    { key: 'a', width: 22 },
    { key: 'b', width: 36 },
    { key: 'c', width: 20 },
    { key: 'd', width: 22 },
    { key: 'e', width: 22 },
  ];

  ws.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0.1, footer: 0.1 },
  };

  ws.getRow(1).height = 10;
  ws.getRow(2).height = 24;
  ws.getRow(3).height = 24;
  ws.getRow(4).height = 10;

  addLogo(ws);

  ws.mergeCells('B2:E3');
  const title = ws.getCell('B2');
  title.value = 'MÜŞTƏRİ SİFARİŞ ÇEKİ ✅';
  title.font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getRow(6).values = ['Sifariş kodu:', order.order_code || order.id, '', 'Tarix:', formatDate(order.created_at)];
  ws.getRow(7).values = ['Müştəri:', customerName, '', 'Telefon:', order.phone || profile.phone || '—'];
  ws.getRow(8).values = ['Ünvan:', fullAddress || 'Ünvan yoxdur', '', 'Ödəniş üsulu:', methodAz(order.payment_method)];
  ws.getRow(9).values = ['Sifariş statusu:', statusAz(order.status), '', 'Ödəniş statusu:', statusAz(order.payment_status)];

    ws.mergeCells('B8:C8');
    ws.getCell('B8').alignment = {
      wrapText: true,
      vertical: 'middle',
      horizontal: 'left',
    };
    ws.getRow(8).height = 24;

  [6, 7, 8, 9].forEach((rowNo) => {
    ws.getRow(rowNo).eachCell((cell) => {
      cell.border = border;
      cell.alignment = { vertical: 'middle', wrapText: true };
    });

    ws.getCell(`A${rowNo}`).font = { bold: true };
    ws.getCell(`D${rowNo}`).font = { bold: true };
  });

  const greenFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
  const redFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

  ws.getCell('B9').fill = ['confirmed', 'preparing', 'on_the_way', 'courier_near', 'delivered'].includes(order.status)
    ? greenFill
    : redFill;

  ws.getCell('E9').fill = ['paid', 'approved'].includes(order.payment_status)
    ? greenFill
    : redFill;

  ws.addRow([]);

  const productHeader = ws.addRow(['Məhsul', 'Miqdar', 'Vahid qiymət', 'Cəmi', 'Qeyd']);
  productHeader.height = 24;
  styleHeader(productHeader);

  items.forEach((item) => {
    const r = ws.addRow([
      item.product_name,
      `${item.quantity} ${item.unit}`,
      money(item.unit_price),
      money(item.line_total),
      '',
    ]);
    styleBody(r);
  });

  for (let i = items.length; i < 4; i++) {
    styleBody(ws.addRow(['', '', '', '', '']));
  }

const totalRow = ws.addRow(['', '', 'Ümumi məbləğ:', money(order.total_amount), '']);
ws.mergeCells(`A${totalRow.number}:B${totalRow.number}`);
totalRow.height = 34;

styleBody(totalRow);

[1, 2, 3, 4, 5].forEach((cellNo) => {
  totalRow.getCell(cellNo).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFFFF' },
  };
});

totalRow.getCell(3).font = { bold: true, size: 14 };
totalRow.getCell(4).font = { bold: true, size: 16, color: { argb: 'FF047857' } };

totalRow.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
totalRow.getCell(4).alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };

  ws.addRow([]);

  const noteRow = ws.addRow([
    'Qeyd:',
    'Bu çek məhsulların paketinə əlavə edilmək üçün hazırlanıb.',
    '',
    '',
    '',
  ]);

  ws.mergeCells(`B${noteRow.number}:E${noteRow.number}`);
  noteRow.getCell(1).font = { bold: true };
  styleBody(noteRow);
});
  

  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `hazirlanma-merkezi-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}




function printPreparationCenter() {
  const summary = $('#prepSummaryTable')?.innerHTML || '';
  const purchase = $('#prepPurchaseTable')?.innerHTML || '';
  const details = $('#prepDetailsList')?.innerHTML || '';

  const win = window.open('', '_blank');
  if (!win) {
    toast('Print pəncərəsi bloklandı');
    return;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html lang="az">
    <head>
      <meta charset="UTF-8">
      <title>Hazırlanma Mərkəzi</title>
      <style>
        body { font-family: Arial, sans-serif; color:#111827; padding:24px; }
        h1,h2 { margin:0 0 12px; color:#064e3b; }
        table { width:100%; border-collapse:collapse; margin:12px 0 24px; }
        th,td { border:1px solid #d1d5db; padding:8px; text-align:left; font-size:13px; }
        th { background:#dcfce7; color:#064e3b; }
        small { display:block; color:#64748b; }
        details { border:1px solid #d1d5db; border-radius:10px; padding:10px; margin-bottom:10px; }
        summary { font-weight:bold; }
        .prep-customer-row { display:flex; justify-content:space-between; border-top:1px solid #e5e7eb; padding:8px 0; }
        .prep-badge { font-weight:bold; }
        @media print { button { display:none; } }
      </style>
    </head>
    <body>
      <h1>Hazırlanma Mərkəzi</h1>
      <p>Çap tarixi: ${new Date().toLocaleString('az-AZ')}</p>

      <h2>Ümumi sifariş miqdarı</h2>
      <table>
        <thead>
          <tr>
            <th>Məhsul</th>
            <th>Cəm miqdar</th>
            <th>Anbar qalığı</th>
            <th>Satınalma ehtiyacı</th>
            <th>Anbarda qalacaq</th>
          </tr>
        </thead>
        <tbody>${summary}</tbody>
      </table>

      <h2>Satınalma siyahısı</h2>
      <table>
        <thead>
          <tr>
            <th>Məhsul</th>
            <th>Lazım olan miqdar</th>
            <th>Anbar qalığı</th>
            <th>Satın alınacaq</th>
          </tr>
        </thead>
        <tbody>${purchase}</tbody>
      </table>

      <h2>Müştəri detalları</h2>
      ${details}
    </body>
    </html>
  `);

  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}



async function loadPayments() {
  const search = ($('#paymentSearch')?.value || '').toLowerCase();

  const { data } = await supabase
    .from('payments')
    .select('*,orders(order_code,payment_method,total_amount)')
    .order('created_at', { ascending: false })
    .limit(250);

  let rows = data || [];
  if (search) rows = rows.filter((p) => [p.orders?.order_code, p.provider, p.status, p.transaction_ref].join(' ').toLowerCase().includes(search));

  $('#paymentsTable').innerHTML = rows.map((payment) => `
    <tr>
      <td>
        <b>${esc(payment.orders?.order_code || '—')}</b>
        <small class="muted">${formatDate(payment.created_at)}</small>
      </td>
      <td>
        <b>${esc(methodAz(payment.provider || payment.orders?.payment_method))}</b>
        <small class="muted">${esc(payment.transaction_ref || '')}</small>
      </td>
      <td><b>${money(payment.amount)}</b></td>
      <td>${payBadge(payment.status)}</td>
      <td>${payment.receipt_url ? `<a class="btn btn-soft btn-mini" target="_blank" href="${payment.receipt_url}">Çekə bax</a>` : '—'}</td>
      <td>
        <div class="action-row">
          <button class="btn btn-soft btn-mini pay" data-id="${payment.id}" data-s="approved">Təsdiq</button>
          <button class="btn btn-danger btn-mini pay" data-id="${payment.id}" data-s="rejected">Rədd</button>
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6">Ödəniş yoxdur.</td></tr>';

  $$('.pay').forEach((button) => {
    button.addEventListener('click', async () => {
      const { error } = await supabase.rpc('admin_update_payment_status', {
        p_payment_id: button.dataset.id,
        p_status: button.dataset.s,
        p_admin_note: '',
      });

      toast(error ? error.message : 'Ödəniş yeniləndi');
      loadPayments();
    });
  });
}

async function usersReviews() {
  await loadUsers();
  await loadReviews();

  $('#userSearch')?.addEventListener('input', loadUsers);
  $('#reviewSearch')?.addEventListener('input', loadReviews);
}

async function loadUsers() {
  const search = ($('#userSearch')?.value || '').toLowerCase();

  const { data: setting } = await supabase
  .from('site_settings')
  .select('setting_value')
  .eq('setting_key', 'master_admin_email')
  .maybeSingle();

  const masterEmail = setting?.setting_value || 'meyveci@proton.me';

  const [{ data: users }, { data: orders }] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('orders').select('id,user_id,total_amount,status'),
  ]);

  const orderCount = new Map();
  (orders || []).forEach((o) => orderCount.set(o.user_id, (orderCount.get(o.user_id) || 0) + 1));

  let rows = users || [];
  if (search) rows = rows.filter((u) => [u.first_name, u.last_name, u.email, u.phone, u.role, u.city_region].join(' ').toLowerCase().includes(search));

  $('#usersTable').innerHTML = rows.map((user) => {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || 'İstifadəçi';
    return `
      <tr>
        <td>
          <div class="pro-cell-main">
            <img class="admin-avatar" src="${user.avatar_url || PLACEHOLDER}" alt="${esc(fullName)}">
            <span><b>${esc(fullName)}</b><small>${esc(user.email || '')}</small><small>📞 ${esc(user.phone || 'Telefon yoxdur')}</small></span>
          </div>
        </td>
        <td><small>${esc([user.city_region, user.address_line, user.apartment, user.door_code].filter(Boolean).join(', ') || 'Ünvan yoxdur')}</small></td>
        <td>
          <select class="role" data-id="${user.id}" ${user.email === masterEmail && adminProfile?.email !== masterEmail ? 'disabled' : ''}>
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>Müştəri</option>
            <option value="courier" ${user.role === 'courier' ? 'selected' : ''}>Kuryer</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </td>
        <td>
          ${
            user.email === masterEmail && adminProfile?.email !== masterEmail
              ? '<span class="mini-badge mini-yellow">Əsas admin qorunur</span>'
              : activeSwitch(user.id, user.is_active !== false, 'toggle-user-active', 'profiles')
          }
        </td>
        <td>
          ${isReallyOnline(user)
            ? '<span class="mini-badge mini-green"><span class="admin-online-dot online"></span>Online</span>'
            : '<span class="mini-badge mini-red"><span class="admin-online-dot offline"></span>Offline</span>'
          }
        </td>
        <td>${orderCount.get(user.id) || 0}</td>
        <td>${formatDate(user.created_at)}</td>
        <td>
          <button class="btn btn-soft btn-mini view-user" data-row="${rowAttr(user)}">Detallar</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="8">İstifadəçi yoxdur.</td></tr>';

  bindUserEvents();
}

function bindUserEvents() {
  $$('.role').forEach((select) => {
    select.addEventListener('change', async () => {
      const userId = select.dataset.id;
      select.disabled = true;

      const { error } = await supabase.from('profiles').update({ role: select.value }).eq('id', userId);

      if (!error && select.value === 'courier') {
        await supabase.from('couriers').upsert({ user_id: userId, is_active: true, is_online: false }, { onConflict: 'user_id' });
      }

      if (!error && select.value !== 'courier') {
        await supabase
          .from('couriers')
          .update({ is_active: false, is_online: false, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      }
      
      toast(error ? error.message : 'Rol dəyişdi');
      select.disabled = false;
      loadUsers();
    });
  });

  $$('.toggle-user-active').forEach((input) => input.addEventListener('change', toggleActive));

  $$('.view-user').forEach((btn) => {
    btn.addEventListener('click', () => {
      const u = JSON.parse(btn.dataset.row);
    openAdminModal('İstifadəçi detalları', `
      <div style="display:flex;gap:14px;align-items:center;margin-bottom:14px;">
        <img class="admin-detail-profile-img" src="${u.avatar_url || PLACEHOLDER}" alt="${esc(fullName(u))}">
        <div>
          <h2 style="margin:0;">${esc(fullName(u))}</h2>
          <p class="muted" style="margin:4px 0 0;">${esc(u.email || '')}</p>
        </div>
      </div>
    
      <div class="admin-detail-grid">
        <div class="admin-detail-box"><b>Ad Soyad</b><span>${esc(`${u.first_name || ''} ${u.last_name || ''}`.trim())}</span></div>
        <div class="admin-detail-box"><b>Email</b><span>${esc(u.email)}</span></div>
        <div class="admin-detail-box"><b>Telefon</b><span>${esc(u.phone)}</span></div>
        <div class="admin-detail-box"><b>Rol</b><span>${esc(u.role)}</span></div>
        <div class="admin-detail-box"><b>Status</b><span>${u.is_active !== false ? 'Aktiv' : 'Passiv'}</span></div>
        <div class="admin-detail-box"><b>Online</b><span>${isReallyOnline(u) ? 'Online' : 'Offline'}</span></div>
        <div class="admin-detail-box"><b>Son giriş</b><span>${formatDate(u.last_seen)}</span></div>
        <div class="admin-detail-box"><b>Qeydiyyat</b><span>${formatDate(u.created_at)}</span></div>
        <div class="admin-detail-box admin-detail-full"><b>Ünvan</b><span>${esc([u.city_region, u.address_line, u.apartment, u.door_code].filter(Boolean).join(', ') || 'Ünvan yoxdur')}</span></div>
        <div class="admin-detail-box admin-detail-full"><b>Koordinat</b><span>${esc([u.lat, u.lng].filter(Boolean).join(', ') || 'GPS yoxdur')}</span></div>
        <div class="admin-detail-box admin-detail-full"><b>Bio</b><span>${esc(u.bio || 'Qeyd yoxdur')}</span></div>
      </div>
    `);
    });
  });
}

async function loadReviews() {
  const search = ($('#reviewSearch')?.value || '').toLowerCase();

  const { data } = await supabase
    .from('reviews')
    .select('*,products(name,image_url),profiles(email,first_name,last_name,phone)')
    .order('created_at', { ascending: false })
    .limit(250);

  let rows = data || [];
  if (search) rows = rows.filter((r) => [r.products?.name, r.profiles?.email, r.review_text, r.status].join(' ').toLowerCase().includes(search));

  $('#reviewsTable').innerHTML = rows.map((review) => {
    const customer = `${review.profiles?.first_name || ''} ${review.profiles?.last_name || ''}`.trim() || review.profiles?.email || 'Müştəri';

    return `
      <tr>
        <td>
          <div class="pro-cell-main">
            <img class="admin-product-img" src="${review.products?.image_url || PLACEHOLDER}" alt="Məhsul">
            <span><b>${esc(review.products?.name || 'Məhsul')}</b><small>${esc(customer)}</small></span>
          </div>
        </td>
        <td>${'⭐'.repeat(Number(review.rating || 0))}<small class="muted">${review.rating}/5</small></td>
        <td><small>${esc(review.review_text || 'Rəy mətni yoxdur')}</small></td>
        <td>${statusBadge(review.status || 'pending')}</td>
        <td>${formatDate(review.created_at)}</td>
        <td>
          <div class="action-row">
            <button class="btn btn-soft btn-mini review" data-id="${review.id}" data-s="approved">Təsdiq</button>
            <button class="btn btn-soft btn-mini review" data-id="${review.id}" data-s="pending">Gözlət</button>
            <button class="btn btn-danger btn-mini review" data-id="${review.id}" data-s="rejected">Rədd</button>
            <button class="btn btn-danger btn-mini del-review" data-id="${review.id}">Sil</button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6">Rəy yoxdur.</td></tr>';

  $$('.review').forEach((button) => {
    button.addEventListener('click', async () => {
      await supabase.from('reviews').update({ status: button.dataset.s, updated_at: new Date().toISOString() }).eq('id', button.dataset.id);
      toast('Rəy statusu yeniləndi');
      loadReviews();
    });
  });

  $$('.del-review').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Rəy silinsin?')) return;
      await supabase.from('reviews').delete().eq('id', button.dataset.id);
      toast('Rəy silindi');
      loadReviews();
    });
  });
}

async function content() {
  await loadContent('banners');
  await loadContent('news');
  await loadContent('partners');

  $('#bannerForm')?.addEventListener('submit', (event) => saveContent(event, 'banners', 'content'));
  $('#newsForm')?.addEventListener('submit', (event) => saveContent(event, 'news', 'content'));
  $('#partnerForm')?.addEventListener('submit', (event) => saveContent(event, 'partners', 'content'));

  $('#newBanner')?.addEventListener('click', () => resetForm('bannerForm'));
  $('#newNews')?.addEventListener('click', () => resetForm('newsForm'));
  $('#newPartner')?.addEventListener('click', () => resetForm('partnerForm'));
}

async function loadContent(table) {
  const map = {
    banners: '#bannersList',
    news: '#newsList',
    partners: '#partnersList',
  };

  const { data } = await supabase
    .from(table)
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200);

  $(map[table]).innerHTML = (data || []).map((item) => `
    <div class="compact-row">
      <div class="pro-cell-main">
        <img class="admin-product-img" src="${item.image_url || PLACEHOLDER}" alt="${esc(item.title || item.name)}">
        <span>
          <b>${esc(item.title || item.name || 'Başlıqsız')}</b>
          <small>${esc(item.link_url || item.slug || '')}</small>
        </span>
      </div>
      <div class="action-row">
        ${activeSwitch(item.id, item.is_active, 'toggle-active', table)}
        <button class="btn btn-soft btn-mini view-content" data-table="${table}" data-row="${rowAttr(item)}">Bax</button>
        <button class="btn btn-soft btn-mini edit-content" data-table="${table}" data-row="${rowAttr(item)}">Redaktə</button>
        <button class="btn btn-danger btn-mini del-content" data-table="${table}" data-id="${item.id}">Sil</button>
      </div>
    </div>
  `).join('') || '<span class="muted">Məlumat yoxdur.</span>';

  $$('.edit-content').forEach((button) => {
    button.addEventListener('click', () => {
      const table = button.dataset.table;
      const row = JSON.parse(button.dataset.row);
      const formId = table === 'banners' ? 'bannerForm' : table === 'news' ? 'newsForm' : 'partnerForm';
      fillForm(formId, row);
    });
  });

  $$('.del-content').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Silinsin?')) return;
      await supabase.from(button.dataset.table).delete().eq('id', button.dataset.id);
      toast('Silindi');
      loadContent(button.dataset.table);
    });
  });


  $$('.view-content').forEach((button) => {
  button.addEventListener('click', () => {
    const item = JSON.parse(button.dataset.row);
    const title = item.title || item.name || 'Başlıqsız';

    openAdminModal(title, `
      <img class="admin-content-preview-img" src="${item.image_url || PLACEHOLDER}" alt="${esc(title)}">
      <div class="admin-detail-grid">
        <div class="admin-detail-box admin-detail-full"><b>Başlıq / Ad</b><span>${esc(title)}</span></div>
        <div class="admin-detail-box"><b>Status</b><span>${item.is_active ? 'Aktiv' : 'Passiv'}</span></div>
        <div class="admin-detail-box"><b>Sıra</b><span>${safe(item.sort_order, 0)}</span></div>
        <div class="admin-detail-box admin-detail-full"><b>Link</b><span>${esc(item.link_url || 'Link yoxdur')}</span></div>
        <div class="admin-detail-box admin-detail-full"><b>Qısa mətn</b><span>${esc(item.excerpt || 'Yoxdur')}</span></div>
        <div class="admin-detail-box admin-detail-full"><b>Geniş mətn</b><span>${esc(item.body || 'Yoxdur')}</span></div>
      </div>
    `);
  });
});

  
  $$('.toggle-active').forEach((input) => input.addEventListener('change', toggleActive));
}

async function saveContent(event, table, bucket) {
  event.preventDefault();

  const data = formData(event.target);

  try {
    let imageUrl = data.image_url || null;
    const file = event.target.querySelector('[type="file"]')?.files?.[0];

    if (file) imageUrl = await uploadFile(bucket, file, table);

    let row = {
      ...data,
      image_url: imageUrl,
      is_active: data.is_active === 'on',
      sort_order: Number(data.sort_order || 0),
      updated_at: new Date().toISOString(),
    };

    if (table === 'news') row.slug = row.slug || slugify(row.title);
    if (table !== 'news') {
      delete row.slug;
      delete row.excerpt;
      delete row.body;
    }
    if (table === 'partners') delete row.title;
    if (table !== 'partners') delete row.name;

    const id = row.id;
    delete row.id;

    const response = id
      ? await supabase.from(table).update(row).eq('id', id)
      : await supabase.from(table).insert(row);

    toast(response.error ? response.error.message : 'Saxlanıldı');
    event.target.reset();
    loadContent(table);
  } catch (error) {
    toast(error.message);
  }
}

async function toggleActive(event) {
  const input = event.target;
  const table = input.dataset.table;
  const field = input.dataset.field || 'is_active';

  let value = input.checked;
  if (field === 'status') value = input.checked ? 'active' : 'inactive';

  const { error } = await supabase
    .from(table)
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', input.dataset.id);

  toast(error ? error.message : 'Status yeniləndi');
}

function subscribeAdminRealtime() {
  supabase
    .channel('admin-pro-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
      if (document.body.dataset.page === 'admin-dashboard') {
        loadDashboardKpis();
        loadRecentOrders();
        loadCourierMonitor();
        loadAdminAlerts();
      }
    
      if (document.body.dataset.page === 'admin-orders') {
        loadOrders();
        loadPayments();
        loadPreparationCenter();
      }
    })
    
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
      if (document.body.dataset.page === 'admin-orders') loadPayments();
      if (document.body.dataset.page === 'admin-dashboard') loadDashboardKpis();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_locations' }, (payload) => {
      if (document.body.dataset.page === 'admin-dashboard') handleCourierLocationRealtime(payload.new);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_device_status' }, () => {
      if (document.body.dataset.page === 'admin-dashboard') loadCourierMonitor();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_alerts' }, () => {
      if (document.body.dataset.page === 'admin-dashboard') loadAdminAlerts();
      playAdminSound();
    })
    .subscribe();
}


function initAdminSoundUnlock() {
  const unlock = async () => {
    const audio = $('#adminNotifyAudio');
    if (!audio) return;

    try {
      audio.src = '../assets/sounds/courier-alarm.mp3';
      audio.volume = 0;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0.85;
      adminSoundReady = true;
    } catch {
      adminSoundReady = false;
    }
  };

  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
}


function animateMarkerTo(marker, targetLatLng) {
  const start = marker.getLatLng();
  const end = L.latLng(targetLatLng[0], targetLatLng[1]);

  const duration = 900;
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

function fitAllCourierMarkers() {
  if (!courierMap || courierMarkers.size === 0) return;

  const points = [...courierMarkers.values()].map((marker) => marker.getLatLng());

  if (points.length === 1) {
    courierMap.setView(points[0], 13);
    return;
  }

  courierMap.fitBounds(L.latLngBounds(points), {
    padding: [45, 45],
    maxZoom: 12,
  });
}


    async function handleCourierLocationRealtime(location) {
      if (!location?.courier_id || !location.lat || !location.lng) return;
    
      const [
        { data: profile },
        { data: device },
        { data: courier },
        { data: activeOrder },
      ] = await Promise.all([
        supabase.from('profiles').select('id,first_name,last_name,email,phone,avatar_url,is_online,last_seen,role').eq('id', location.courier_id).maybeSingle(),
        supabase.from('courier_device_status').select('*').eq('courier_id', location.courier_id).maybeSingle(),
        supabase.from('couriers').select('*').eq('user_id', location.courier_id).maybeSingle(),
        supabase
          .from('orders')
          .select('id,order_code,courier_id,status,total_amount,created_at')
          .eq('courier_id', location.courier_id)
          .in('status', ['confirmed', 'preparing', 'on_the_way', 'courier_near'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
    
      if (!courier?.is_active || profile?.role !== 'courier') return;
    
      updateCourierMarker(courier, profile || {}, device || {}, location);
    
      const card = document.querySelector(`.focus-courier[data-courier-id="${location.courier_id}"]`);
      if (!card) return;
    
      const online = isReallyOnline(profile || {}, device || {});
      const name = fullName(profile || {});
    
      card.innerHTML = `
        <img class="admin-avatar" src="${profile?.avatar_url || PLACEHOLDER}" alt="${esc(name)}">
    
        <div class="admin-courier-main">
          <div class="admin-courier-topline">
            <b>
              <span class="admin-online-dot ${online ? 'online' : 'offline'}"></span>
              ${esc(name)}
            </b>
            <small>${esc(profile?.phone || 'Telefon yoxdur')} • Son siqnal: ${heartbeatText(device?.last_heartbeat)}</small>
          </div>
    
          ${activeOrder ? `
            <small class="admin-order-mini">
              Sifariş: <b class="order-code-green">${esc(activeOrder.order_code || '')}</b>
              <span>•</span>
              <b class="order-price-gold">${money(activeOrder.total_amount || 0)}</b>
            </small>
          ` : `
            <small class="admin-order-mini muted">Sifariş yoxdur</small>
          `}
    
          ${courierFlowHtml(activeOrder)}
        </div>
    
        <div class="admin-device-mini">
          <span class="mini-badge ${online ? 'mini-green' : 'mini-red'}">${online ? 'Online' : 'Offline'}</span>
    
          <span class="mini-badge ${
            device?.battery_level === null || device?.battery_level === undefined
              ? 'mini-blue'
              : Number(device.battery_level) <= 15
                ? 'mini-red'
                : 'mini-green'
          }">
            🔋 ${device?.battery_level === null || device?.battery_level === undefined ? 'dəstək yoxdur' : `${device.battery_level}%`}
          </span>
    
          <span class="mini-badge ${online ? 'mini-green' : 'mini-blue'}">
            🌐 ${online ? 'internet var' : 'bilinmir'}
          </span>
    
          <span class="mini-badge mini-green">📍 GPS var</span>
        </div>
      `;
    
      card.addEventListener('click', () => {
        const marker = courierMarkers.get(location.courier_id);
        if (!marker || !courierMap) {
          toast('Bu kuryerin GPS məlumatı hələ yoxdur');
          return;
        }
    
        courierMap.setView(marker.getLatLng(), 15, { animate: true });
        marker.openPopup();
        setTimeout(() => courierMap.invalidateSize(), 120);
      });
    }


  // 📥 Excel Import ⚡ Qiymət və Stok Yenilə 📊 Exceldən Məhsul Yenilə =====================================

async function importProductsFromExcel(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!window.XLSX) {
    toast('Excel kitabxanası yüklənməyib');
    return;
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows.length) {
      toast('Excel faylında məlumat tapılmadı');
      return;
    }

    const { data: categories } = await supabase
      .from('categories')
      .select('id,name');

    const categoryMap = new Map(
      (categories || []).map((cat) => [
        String(cat.name || '').trim().toLowerCase(),
        cat.id,
      ])
    );

    const { data: existingProducts } = await supabase
      .from('products')
      .select('id,sku,one_c_name,slug');

    const bySku = new Map();
    const byOneC = new Map();
    const usedSlugs = new Set();

    (existingProducts || []).forEach((p) => {
      if (p.sku) bySku.set(String(p.sku).trim(), p);
      if (p.one_c_name) byOneC.set(String(p.one_c_name).trim(), p);
      if (p.slug) usedSlugs.add(String(p.slug).trim());
    });

    const parseNum = (value) => {
      const clean = String(value || '0')
        .replace(',', '.')
        .replace(/[^\d.]/g, '');
      return Number(clean || 0);
    };

    const makeUniqueSlug = (baseSlug, currentOldSlug = '') => {
      let slug = baseSlug || `mehsul-${Date.now()}`;
      let finalSlug = slug;
      let i = 2;

      while (usedSlugs.has(finalSlug) && finalSlug !== currentOldSlug) {
        finalSlug = `${slug}-${i}`;
        i++;
      }

      usedSlugs.add(finalSlug);
      return finalSlug;
    };

    let added = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const item of rows) {
      const name = String(item['Məhsul adı'] || '').trim();
      const sku = String(item['SKU'] || item['Sku'] || '').trim();
      const oneCName = String(item['1c də olan məhsul adı'] || item['1C adı'] || '').trim();
      const categoryName = String(item['Kateqoriya'] || '').trim();

      if (!name) {
        skipped++;
        continue;
      }

      const matched =
        (sku && bySku.get(sku)) ||
        (oneCName && byOneC.get(oneCName)) ||
        null;

      const baseSlug = String(item['Slug'] || slugify(name)).trim();
      const finalSlug = makeUniqueSlug(baseSlug, matched?.slug || '');

      const row = {
        name,
        slug: finalSlug,
        category_id: categoryMap.get(categoryName.toLowerCase()) || null,
        price: parseNum(item['Faktiki satış qiyməti'] || item['Qiymət']),
        old_price: item['Köhnə qiymət'] ? parseNum(item['Köhnə qiymət']) : null,
        stock_quantity: Math.round(parseNum(item['Stok (anbar)'] || item['Stok'])),
        unit: String(item['Ölçü vahidi'] || item['Vahid'] || 'ədəd').trim(),
        sku: sku || null,
        one_c_name: oneCName || null,
        status: 'active',
        updated_at: new Date().toISOString(),
      };

      let response;

      if (matched?.id) {
        response = await supabase
          .from('products')
          .update(row)
          .eq('id', matched.id);

        updated++;
      } else {
        response = await supabase
          .from('products')
          .insert(row)
          .select('id,sku,one_c_name,slug')
          .single();

        if (response.data) {
          if (response.data.sku) bySku.set(response.data.sku, response.data);
          if (response.data.one_c_name) byOneC.set(response.data.one_c_name, response.data);
        }

        added++;
      }

      if (response.error) {
        console.warn('Import xətası:', response.error.message, item);
        errors++;
      }
    }

    toast(`Import tamamlandı: əlavə ${added}, yenilənən ${updated}, boş keçilən ${skipped}, xəta ${errors}`);
    event.target.value = '';
    loadProducts();
  } catch (error) {
    toast(error.message);
  }
}


// Excel Şablonu düyməsinə vuranda hazır .xlsx faylı yüklənsin========================
function downloadProductExcelTemplate() {
  if (!window.XLSX) {
    toast('Excel kitabxanası yüklənməyib');
    return;
  }

  const rows = [
    {
      'SKU': 'UBC470',
      'Məhsul adı': 'Ümid Balı – Çiçək Balı 470 qr',
      'Slug': 'umid-bali-cicek-bali-470qr',
      'Kateqoriya': 'Arıçılıq Məhsulları',
      'Faktiki satış qiyməti': 14.90,
      'Köhnə qiymət': 16.50,
      'Stok (anbar)': 25,
      'Ölçü vahidi': 'ədəd',
      '1c də olan məhsul adı': 'Umid Bal Cicek 0.470Qr',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Mehsul Import');

  XLSX.writeFile(workbook, 'meyveci-mehsul-import-sablonu.xlsx');
}


// Bu sistemlə admin belə işləyəcək: =====================================================
// Bazadan Excel Çıxart vurur
// Faylda qiymət, stok, ad, kateqoriya düzəlişi edir
// Sonra 1C Excel Import ilə geri yükləyir
// Sistem SKU ilə məhsulu tapır və yeniləyir
// SKU yoxdursa 1c də olan məhsul adı ilə yoxlayır
// Heç biri tapılmasa yeni məhsul kimi əlavə edir.

async function exportProductsToExcel() {
  if (!window.XLSX) {
    toast('Excel kitabxanası yüklənməyib');
    return;
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        sku,
        name,
        slug,
        price,
        old_price,
        stock_quantity,
        unit,
        one_c_name,
        categories(name)
      `)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) {
      toast(error.message);
      return;
    }

    const rows = (data || []).map((product) => ({
      'SKU': product.sku || '',
      'Məhsul adı': product.name || '',
      'Slug': product.slug || '',
      'Kateqoriya': product.categories?.name || '',
      'Faktiki satış qiyməti': Number(product.price || 0),
      'Köhnə qiymət': product.old_price ?? '',
      'Stok (anbar)': Number(product.stock_quantity || 0),
      'Ölçü vahidi': product.unit || 'ədəd',
      '1c də olan məhsul adı': product.one_c_name || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);

    worksheet['!cols'] = [
      { wch: 18 },
      { wch: 38 },
      { wch: 38 },
      { wch: 28 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 14 },
      { wch: 42 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mehsullar');

    XLSX.writeFile(
      workbook,
      `meyveci-baza-mehsullari-${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    toast('Məhsullar Excelə çıxarıldı');
  } catch (error) {
    toast(error.message);
  }
}


// ============================================================
// MEYVƏÇİ.AZ - ENDİRİM KARTLARI
// Bazada old_price > price olan məhsulları avtomatik endirim kartına çevirir.
// ============================================================

const discountOriginOptions = [
  'YERLİ FERMER',
  'İDXAL',
  'İSTİXANA',
  'EKZOTİK',
  'SELEKSİYA',
  'ORQANİK',
];

let discountCardsCache = [];

function discountPercent(price, oldPrice) {
  const p = Number(price || 0);
  const o = Number(oldPrice || 0);
  if (!p || !o || o <= p) return 0;
  return Math.round(((o - p) / o) * 100);
}

function discountOriginSelect(productId) {
  return `
    <select class="discount-origin-select" data-id="${productId}">
      ${discountOriginOptions.map((item) => `<option value="${esc(item)}">${esc(item)}</option>`).join('')}
    </select>
  `;
}

async function loadDiscountCards() {
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
    || '<div class="muted">Endirimli məhsul yoxdur. Endirim üçün məhsulda “Köhnə qiymət” faktiki qiymətdən böyük olmalıdır.</div>';

  bindDiscountCardEvents();
}



//=======================================================================================================

function renderDiscountCard(product) {
  const percent = discountPercent(product.price, product.old_price);
  const unit = product.unit || 'ədəd';

  return `
    <div class="discount-card-wrap" data-id="${product.id}">
      <div class="discount-card-admin-actions">
        ${discountOriginSelect(product.id)}
        <button type="button" class="btn btn-soft btn-mini print-discount-card" data-id="${product.id}">🖨️ Çap</button>
        <button type="button" class="btn btn-soft btn-mini pdf-discount-card" data-id="${product.id}">📄 PDF</button>
      </div>

      <div class="meyveci-discount-card" id="discount-card-${product.id}">
        ${product.image_url ? `
          <img class="dc-product-watermark" src="${esc(product.image_url)}" alt="">
        ` : ''}

        <div class="dc-percent">
          <strong>-${percent}%</strong>
          <span>ENDİRİM</span>
        </div>

        <div class="dc-product-info">
          <h4>${esc(product.name)}</h4>
          <p>${esc(unit)}</p>

          <ul>
            <li>TƏBİİ VƏ TƏZƏ</li>
            <li><b class="origin-text" data-id="${product.id}">YERLİ FERMER</b></li>
            <li>KEYFİYYƏT ZƏMANƏTİ</li>
          </ul>
        </div>

        <div class="dc-price-box">
          <div class="dc-old-price">${Number(product.old_price || 0).toFixed(2)} ₼</div>
          <div class="dc-new-price">${Number(product.price || 0).toFixed(2)}<small>₼</small></div>
        </div>
      </div>
    </div>
  `;
}


function bindDiscountCardEvents() {
  $$('.discount-origin-select').forEach((select) => {
    select.addEventListener('change', () => {
      const text = document.querySelector(`.origin-text[data-id="${select.dataset.id}"]`);
      if (text) text.textContent = select.value;
    });
  });

  $$('.print-discount-card').forEach((btn) => {
    btn.addEventListener('click', () => printSingleDiscountCard(btn.dataset.id));
  });

  $$('.pdf-discount-card').forEach((btn) => {
    btn.addEventListener('click', () => printSingleDiscountCard(btn.dataset.id));
  });
}

function printSingleDiscountCard(id) {
  const card = document.querySelector(`#discount-card-${CSS.escape(id)}`);
  if (!card) return;

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html lang="az">
    <head>
      <meta charset="UTF-8">
      <title>Endirim kartı</title>
      <link rel="stylesheet" href="../assets/css/style.css">
      <link rel="stylesheet" href="../assets/css/admin.css">
    </head>
    <body class="discount-print-body single">
      ${card.outerHTML}
      <script>
        window.onload = () => {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);
  win.document.close();
}

function printAllDiscountCards() {
  const cards = [...document.querySelectorAll('.meyveci-discount-card')];
  if (!cards.length) {
    toast('Çap üçün endirim kartı yoxdur');
    return;
  }

  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html>
    <html lang="az">
    <head>
      <meta charset="UTF-8">
      <title>Toplu endirim kartları</title>
      <link rel="stylesheet" href="../assets/css/style.css">
      <link rel="stylesheet" href="../assets/css/admin.css">
    </head>
    <body class="discount-print-body all">
      <div class="discount-print-sheet">
        ${cards.map((card) => card.outerHTML).join('')}
      </div>
      <script>
        window.onload = () => {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);
  win.document.close();
}

//=======================================================================================================

