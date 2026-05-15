// ============================================================
// MEYVƏÇİ.AZ - ANBARDAR PANELİ
// Sifariş hazırlama, məhsul cəmləmə və kuryerə təhvil.
// ============================================================

import {
  $,
  $$,
  supabase,
  requireRole,
  money,
  toast,
  statusAz,
} from './core.js';

import { initLayout } from './layout.js';

let warehouseProfile = null;
let warehouseOrdersCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  warehouseProfile = await requireRole('warehouse');
  if (!warehouseProfile) return;

  await loadWarehousePanel();

  $('#warehouseRefreshBtn')?.addEventListener('click', loadWarehousePanel);
  $('#warehouseOrderSearch')?.addEventListener('input', loadWarehouseOrders);
  $('#warehousePrepSearch')?.addEventListener('input', loadWarehousePreparation);
  $('#warehousePrepRefresh')?.addEventListener('click', loadWarehousePreparation);

  setupWarehouseTabs();
  subscribeWarehouseLive();
});

async function loadWarehousePanel() {
  await Promise.all([
    loadWarehouseOrders(),
    loadWarehousePreparation(),
  ]);
}

function esc(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('az-AZ') : '—';
}

function fullName(profile = {}) {
  return `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || '—';
}

function statusBadge(status) {
  return `<span class="status-pill status-${String(status || '').replaceAll('_', '-')}">${statusAz(status)}</span>`;
}

async function loadWarehouseOrders() {
  const search = ($('#warehouseOrderSearch')?.value || '').trim().toLowerCase();

  const [ordersRes, profilesRes, couriersRes, itemsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('*')
      .in('status', ['confirmed', 'preparing', 'ready_for_courier'])
      .order('created_at', { ascending: true })
      .limit(300),

    supabase
      .from('profiles')
      .select('id,email,first_name,last_name,phone,role,city_region,address_line,apartment,door_code'),

    supabase
      .from('couriers')
      .select('*'),

    supabase
      .from('order_items')
      .select('*')
      .limit(3000),
  ]);

  const table = $('#warehouseOrdersTable');
  if (!table) return;

  if (ordersRes.error) {
    table.innerHTML = `<tr><td colspan="7">${esc(ordersRes.error.message)}</td></tr>`;
    return;
  }

  const profilesMap = new Map((profilesRes.data || []).map((p) => [p.id, p]));
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
    const name = fullName(p);
    const phone = p.phone ? ` • ${p.phone}` : '';
    const plate = courier.vehicle_plate ? ` • ${courier.vehicle_plate}` : '';
    return `<option value="${courier.user_id}" ${selectedId === courier.user_id ? 'selected' : ''}>${esc(name)}${esc(phone)}${esc(plate)}</option>`;
  }).join('');

  let rows = ordersRes.data || [];
  warehouseOrdersCache = rows;

  if (search) {
    rows = rows.filter((order) => {
      const p = profilesMap.get(order.user_id) || {};
      return [
        order.order_code,
        order.full_name,
        order.phone,
        order.city_region,
        order.address_text,
        p.email,
        p.phone,
        p.first_name,
        p.last_name,
      ].join(' ').toLowerCase().includes(search);
    });
  }

  renderWarehouseKpis(warehouseOrdersCache);

  table.innerHTML = rows.map((order) => {
    const p = profilesMap.get(order.user_id) || {};
    const courier = profilesMap.get(order.courier_id) || {};
    const customerName = order.full_name || fullName(p);
    const phone = order.phone || p.phone || '—';
    const address = [
      order.city_region || p.city_region,
      order.address_text || p.address_line,
      order.apartment || p.apartment,
      order.door_code || p.door_code,
    ].filter(Boolean).join(', ');

    return `
      <tr>
        <td>
          <b>${esc(order.order_code || order.id)}</b>
          <small class="muted">${formatDate(order.created_at)}</small>
        </td>

        <td>
          <b>${esc(customerName)}</b>
          <small class="muted">📞 ${esc(phone)}</small>
        </td>

        <td>
          <small>${esc(address || 'Ünvan yoxdur')}</small>
        </td>

        <td>${statusBadge(order.status)}</td>

        <td>
          <b>${money(order.total_amount || 0)}</b>
          <small class="muted">${itemsMap.get(order.id)?.length || 0} məhsul</small>
        </td>

        <td>
          <select class="warehouse-courier-select assign-warehouse-courier" data-id="${order.id}" ${order.status === 'confirmed' ? 'disabled' : ''}>
            <option value="">Kuryer seç</option>
            ${makeCourierOptions(order.courier_id)}
          </select>
          <small class="muted">${esc(fullName(courier))}</small>
        </td>

        <td>
          <div class="warehouse-action-row">
            <button class="btn btn-soft btn-mini warehouse-status" data-id="${order.id}" data-status="preparing" ${order.status !== 'confirmed' ? 'disabled' : ''}>
              🥝 Hazırla
            </button>

            <button class="btn btn-primary btn-mini warehouse-status" data-id="${order.id}" data-status="ready_for_courier" ${order.status !== 'preparing' ? 'disabled' : ''}>
              🚚 Kuryerə hazır
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7">Hazırlanacaq sifariş yoxdur.</td></tr>';

  bindWarehouseOrderEvents();
}

function renderWarehouseKpis(orders = []) {
  const confirmed = orders.filter((o) => o.status === 'confirmed').length;
  const preparing = orders.filter((o) => o.status === 'preparing').length;
  const ready = orders.filter((o) => o.status === 'ready_for_courier').length;
  const total = orders.length;

  $('#warehouseKpis').innerHTML = `
    <div class="pro-kpi"><span>Ümumi aktiv</span><strong>${total}</strong><small>Hazırlanma axını</small></div>
    <div class="pro-kpi"><span>Təsdiqlənmiş</span><strong>${confirmed}</strong><small>Hazırlanmalıdır</small></div>
    <div class="pro-kpi"><span>Hazırlanır</span><strong>${preparing}</strong><small>Anbar prosesində</small></div>
    <div class="pro-kpi"><span>Kuryerə hazır</span><strong>${ready}</strong><small>Təhvil gözləyir</small></div>
  `;
}

function bindWarehouseOrderEvents() {
  $$('.warehouse-status').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;

      const { error } = await supabase.rpc('warehouse_update_order_status', {
        p_order_id: button.dataset.id,
        p_status: button.dataset.status,
      });

      toast(error ? error.message : 'Status yeniləndi');

      await loadWarehousePanel();
    });
  });

  $$('.assign-warehouse-courier').forEach((select) => {
    select.addEventListener('change', async () => {
      if (!select.value) return;

      select.disabled = true;

      const { error } = await supabase.rpc('warehouse_assign_courier', {
        p_order_id: select.dataset.id,
        p_courier_id: select.value,
      });

      toast(error ? error.message : 'Kuryer təyin edildi');

      await loadWarehousePanel();
    });
  });
}

async function loadWarehousePreparation() {
  const search = ($('#warehousePrepSearch')?.value || '').trim().toLowerCase();

  const [ordersRes, itemsRes, productsRes, profilesRes] = await Promise.all([
    supabase
      .from('orders')
      .select('*')
      .in('status', ['confirmed', 'preparing'])
      .order('created_at', { ascending: true })
      .limit(500),

    supabase
      .from('order_items')
      .select('*')
      .limit(3000),

    supabase
      .from('products')
      .select('id,name,stock_quantity,unit,status')
      .limit(1500),

    supabase
      .from('profiles')
      .select('id,first_name,last_name,email,phone')
      .limit(1500),
  ]);

  if (ordersRes.error) {
    $('#warehousePrepSummaryTable').innerHTML = `<tr><td colspan="5">${esc(ordersRes.error.message)}</td></tr>`;
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

  renderWarehousePrepKpis(rows, orders);
  renderWarehousePreparationSummary(rows);
  renderWarehousePreparationDetails(rows);
}

function renderWarehousePrepKpis(rows, orders) {
  const totalProducts = rows.length;
  const totalOrders = orders.length;
  const needCount = rows.filter((row) => row.need_quantity > 0).length;
  const readyCount = rows.filter((row) => row.need_quantity <= 0).length;

  $('#warehousePrepKpis').innerHTML = `
    <div class="prep-kpi"><span>Sifariş</span><b>${totalOrders}</b><small>Hazırlanan sifarişlər</small></div>
    <div class="prep-kpi"><span>Məhsul çeşidi</span><b>${totalProducts}</b><small>Cəmlənmiş məhsul sayı</small></div>
    <div class="prep-kpi"><span>Anbarda var</span><b>${readyCount}</b><small>Tam hazırlana bilər</small></div>
    <div class="prep-kpi danger"><span>Satınalma lazımdır</span><b>${needCount}</b><small>Çatışmayan məhsul</small></div>
  `;
}

function renderWarehousePreparationSummary(rows) {
  $('#warehousePrepSummaryTable').innerHTML = rows.map((row) => `
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
  `).join('') || '<tr><td colspan="5">Hazırlanacaq məhsul yoxdur.</td></tr>';
}

function renderWarehousePreparationDetails(rows) {
  $('#warehousePrepDetailsList').innerHTML = rows.map((row) => `
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

function subscribeWarehouseLive() {
  supabase
    .channel('warehouse-panel-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadWarehousePanel())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => loadWarehousePanel())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => loadWarehousePreparation())
    .subscribe();
}

function setupWarehouseTabs() {
  $$('.warehouse-tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const panelId = button.dataset.panel;

      $$('.warehouse-tab-btn').forEach((btn) => btn.classList.remove('active'));
      $$('.warehouse-panel').forEach((panel) => panel.classList.remove('active'));

      button.classList.add('active');
      $(`#${panelId}`)?.classList.add('active');
    });
  });
}
