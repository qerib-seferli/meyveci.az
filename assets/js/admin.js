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

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  adminProfile = await requireRole('admin');
  if (!adminProfile) return;

  initTabs();
  initAdminModal();

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
        <a class="btn btn-soft btn-mini" href="orders.html">Aç</a>
      </div>
    </div>
  `).join('') || '<span class="muted">Sifariş yoxdur.</span>';
}

async function loadCourierMonitor() {
  if (!$('#courierMap')) return;

  const [{ data: couriers }, { data: profiles }, { data: devices }, { data: locations }] = await Promise.all([
    supabase.from('couriers').select('*').eq('is_active', true),
    supabase.from('profiles').select('id,first_name,last_name,email,phone,avatar_url,is_online,last_seen,role'),
    supabase.from('courier_device_status').select('*'),
    supabase.from('courier_locations').select('*').order('updated_at', { ascending: false }).limit(200),
  ]);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
  const deviceMap = new Map((devices || []).map((d) => [d.courier_id, d]));
  const locationMap = new Map();

  (locations || []).forEach((loc) => {
    if (!locationMap.has(loc.courier_id)) locationMap.set(loc.courier_id, loc);
  });

  initCourierAdminMap();

  const rows = (couriers || []).map((courier) => {
    const profile = profileMap.get(courier.user_id) || {};
    const device = deviceMap.get(courier.user_id) || {};
    const loc = locationMap.get(courier.user_id) || {};
    updateCourierMarker(courier, profile, device, loc);

    const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Kuryer';
    const heartbeatAge = device.last_heartbeat ? Math.round((Date.now() - new Date(device.last_heartbeat).getTime()) / 1000) : null;
    const online = heartbeatAge !== null && heartbeatAge <= 130;

    return `
      <div class="admin-live-card">
        <img class="admin-avatar" src="${profile.avatar_url || PLACEHOLDER}" alt="${esc(fullName)}">
        <span>
          <b>${esc(fullName)}</b>
          <small>${esc(profile.phone || 'Telefon yoxdur')} • Son siqnal: ${heartbeatAge === null ? 'yoxdur' : `${heartbeatAge} san əvvəl`}</small>
        </span>
        <div class="admin-device-mini">
          <span class="mini-badge ${online ? 'mini-green' : 'mini-red'}">${online ? 'Online' : 'Offline'}</span>
          <span class="mini-badge ${Number(device.battery_level || 0) <= 15 ? 'mini-red' : 'mini-green'}">🔋 ${safe(device.battery_level, '?')}%</span>
          <span class="mini-badge ${device.network_status === 'offline' ? 'mini-red' : 'mini-blue'}">🌐 ${safe(device.network_status, 'bilinmir')}</span>
        </div>
      </div>
    `;
  });

  $('#courierLiveList').innerHTML = rows.join('') || '<span class="muted">Aktiv kuryer yoxdur.</span>';

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

  const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Kuryer';
  const popup = `
    <b>${esc(name)}</b><br>
    🔋 ${safe(device.battery_level, '?')}%<br>
    🌐 ${safe(device.network_status, 'bilinmir')}<br>
    GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}
  `;

  if (courierMarkers.has(courier.user_id)) {
    courierMarkers.get(courier.user_id).setLatLng([lat, lng]).setPopupContent(popup);
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
      if (diff > 120000) {
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
      if (diff > 300000) {
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
  const { data } = await supabase
    .from('admin_alerts')
    .select('*,profiles:courier_id(first_name,last_name,email,phone)')
    .eq('is_resolved', false)
    .order('created_at', { ascending: false })
    .limit(20);

  const critical = (data || []).filter((a) => a.severity === 'critical');

  if (critical.length) {
    $('#adminAlertBar')?.classList.remove('hide');
    $('#adminAlertBar').textContent = `🚨 ${critical.length} kritik xəbərdarlıq var. Alert mərkəzinə baxın.`;
    playAdminSound();
  } else {
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
      await supabase.from('admin_alerts').update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq('id', btn.dataset.id);
      loadAdminAlerts();
    });
  });
}

function playAdminSound() {
  try {
    $('#adminNotifyAudio')?.play?.().catch(() => playNotifySound());
  } catch {
    playNotifySound();
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
    supabase.from('products').select('*,categories(name)').order('created_at', { ascending: false }).limit(300),
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
  await loadOrders();
  await loadPayments();

  $('#orderSearch')?.addEventListener('input', loadOrders);
  $('#paymentSearch')?.addEventListener('input', loadPayments);
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
    return `<option value="${courier.user_id}" ${selectedId === courier.user_id ? 'selected' : ''}>${esc(name)}${courier.vehicle_plate ? ` • ${esc(courier.vehicle_plate)}` : ''}</option>`;
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
        <td><b>${money(order.total_amount)}</b><small class="muted">${itemsMap.get(order.id)?.length || 0} məhsul</small></td>
        <td>
          <select class="assign" data-id="${order.id}">
            <option value="">Kuryer seç</option>
            ${makeCourierOptions(order.courier_id)}
          </select>
          <small class="muted">${courier.first_name || courier.email || ''}</small>
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
      <td><b>${esc(payment.orders?.order_code || '—')}</b><small class="muted">${formatDate(payment.created_at)}</small></td>
      <td>${esc(payment.provider || payment.orders?.payment_method || '—')}<small class="muted">${esc(payment.transaction_ref || '')}</small></td>
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
          <select class="role" data-id="${user.id}">
            <option value="user" ${user.role === 'user' ? 'selected' : ''}>Müştəri</option>
            <option value="courier" ${user.role === 'courier' ? 'selected' : ''}>Kuryer</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </td>
        <td>${activeSwitch(user.id, user.is_active !== false, 'toggle-user-active', 'profiles')}</td>
        <td>${user.is_online ? '<span class="mini-badge mini-green">Online</span>' : '<span class="mini-badge mini-red">Offline</span>'}</td>
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
        await supabase.from('couriers').update({ is_active: false, is_online: false }).eq('user_id', userId);
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
        <div class="admin-detail-grid">
          <div class="admin-detail-box"><b>Ad Soyad</b><span>${esc(`${u.first_name || ''} ${u.last_name || ''}`.trim())}</span></div>
          <div class="admin-detail-box"><b>Email</b><span>${esc(u.email)}</span></div>
          <div class="admin-detail-box"><b>Telefon</b><span>${esc(u.phone)}</span></div>
          <div class="admin-detail-box"><b>Rol</b><span>${esc(u.role)}</span></div>
          <div class="admin-detail-box"><b>Status</b><span>${u.is_active !== false ? 'Aktiv' : 'Passiv'}</span></div>
          <div class="admin-detail-box"><b>Son giriş</b><span>${formatDate(u.last_seen)}</span></div>
          <div class="admin-detail-box admin-detail-full"><b>Ünvan</b><span>${esc([u.city_region, u.address_line, u.apartment, u.door_code].filter(Boolean).join(', '))}</span></div>
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
      }
      if (document.body.dataset.page === 'admin-orders') loadOrders();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
      if (document.body.dataset.page === 'admin-orders') loadPayments();
      if (document.body.dataset.page === 'admin-dashboard') loadDashboardKpis();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_locations' }, () => {
      if (document.body.dataset.page === 'admin-dashboard') loadCourierMonitor();
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
