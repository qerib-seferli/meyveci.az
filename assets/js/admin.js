// ============================================================
// MEYVƏÇİ.AZ - ADMIN PANEL FUNKSİYALARI
// Dashboard, məhsul/kateqoriya, sifariş, ödəniş, istifadəçi, rəy və kontent idarəsi.
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
} from './core.js';

import { initLayout } from './layout.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  const isAdmin = await requireRole('admin');
  if (!isAdmin) return;

  initTabs();

  const page = document.body.dataset.page;

  if (page === 'admin-dashboard') dashboard();
  if (page === 'admin-catalog') catalog();
  if (page === 'admin-orders') ordersPayments();
  if (page === 'admin-users') usersReviews();
  if (page === 'admin-content') content();
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

async function dashboard() {
  const [products, orders, users, couriers, messages, payments] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('couriers').select('id', { count: 'exact', head: true }),
    supabase.from('chat_messages').select('id', { count: 'exact', head: true }),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  $('#kpis').innerHTML = `
    <div class="kpi"><span>Məhsul</span><strong>${products.count || 0}</strong></div>
    <div class="kpi"><span>Sifariş</span><strong>${orders.count || 0}</strong></div>
    <div class="kpi"><span>İstifadəçi</span><strong>${users.count || 0}</strong></div>
    <div class="kpi"><span>Kuryer</span><strong>${couriers.count || 0}</strong></div>
    <div class="kpi"><span>Yeni mesaj</span><strong>${messages.count || 0}</strong></div>
    <div class="kpi"><span>Gözləyən ödəniş</span><strong>${payments.count || 0}</strong></div>
  `;

  const { data } = await supabase
    .from('orders')
    .select('id,order_code,status,payment_status,total_amount,created_at')
    .order('created_at', { ascending: false })
    .limit(8);

  $('#recentOrders').innerHTML = (data || []).map((order) => `
    <div class="compact-row">
      <span><b>${order.order_code}</b><br><small>${statusAz(order.status)} • ${statusAz(order.payment_status)}</small></span>
      <b>${money(order.total_amount)}</b>
    </div>
  `).join('') || '<span class="muted">Sifariş yoxdur.</span>';
}

async function catalog() {
  await loadCategories();
  await loadProducts();

  $('#catForm').addEventListener('submit', saveCategory);
  $('#productForm').addEventListener('submit', saveProduct);
  $('#newCat').addEventListener('click', () => resetForm('catForm'));
  $('#newProduct').addEventListener('click', () => resetForm('productForm'));
}

function resetForm(id) {
  const form = $(`#${id}`);
  form.reset();
  if (form.id) form.id.value = '';
}

function fillForm(id, row) {
  const form = $(`#${id}`);

  Object.entries(row).forEach(([key, value]) => {
    if (!form[key]) return;

    if (form[key].type === 'checkbox') {
      form[key].checked = Boolean(value);
    } else {
      form[key].value = value ?? '';
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order');

  const table = $('#catTable');

  table.innerHTML = error
    ? `<tr><td>${error.message}</td></tr>`
    : (data || []).map((category) => `
      <tr>
        <td>${category.name}</td>
        <td>${category.slug}</td>
        <td>${category.sort_order || 0}</td>
        <td>${category.is_active ? 'Aktiv' : 'Passiv'}</td>
        <td>
          <button class="btn btn-soft edit-cat" data-row='${JSON.stringify(category)}'>Redaktə</button>
          <button class="btn btn-danger del-cat" data-id="${category.id}">Sil</button>
        </td>
      </tr>
    `).join('');

  $$('.edit-cat').forEach((button) => {
    button.addEventListener('click', () => fillForm('catForm', JSON.parse(button.dataset.row)));
  });

  $$('.del-cat').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Kateqoriya silinsin?')) return;
      await supabase.from('categories').delete().eq('id', button.dataset.id);
      loadCategories();
    });
  });
}

async function saveCategory(event) {
  event.preventDefault();

  const data = formData(event.target);
  const row = {
    name: data.name,
    slug: data.slug || slugify(data.name),
    description: data.description,
    sort_order: Number(data.sort_order || 0),
    is_active: data.is_active === 'on',
  };

  const response = data.id
    ? await supabase.from('categories').update(row).eq('id', data.id)
    : await supabase.from('categories').insert(row);

  toast(response.error ? response.error.message : 'Kateqoriya saxlanıldı');
  event.target.reset();
  loadCategories();
}

async function loadProducts() {
  const [products, categories] = await Promise.all([
    supabase.from('products').select('*,categories(name)').order('created_at', { ascending: false }).limit(250),
    supabase.from('categories').select('id,name').order('sort_order'),
  ]);

  $('#productCategory').innerHTML = '<option value="">Kateqoriya seç</option>' + (categories.data || []).map((category) => `
    <option value="${category.id}">${category.name}</option>
  `).join('');

  $('#productTable').innerHTML = products.error
    ? `<tr><td>${products.error.message}</td></tr>`
    : (products.data || []).map((product) => `
      <tr>
        <td><img class="preview-img" src="${product.image_url || PLACEHOLDER}" alt="${product.name}"></td>
        <td>${product.name}<br><small>${product.categories?.name || ''}</small></td>
        <td>${money(product.price)}<br><small>${product.old_price ? money(product.old_price) : ''}</small></td>
        <td>${product.stock_quantity}</td>
        <td>${product.status}</td>
        <td>
          <button class="btn btn-soft edit-product" data-row='${JSON.stringify(product)}'>Redaktə</button>
          <button class="btn btn-danger del-product" data-id="${product.id}">Sil</button>
        </td>
      </tr>
    `).join('');

  $$('.edit-product').forEach((button) => {
    button.addEventListener('click', () => fillForm('productForm', JSON.parse(button.dataset.row)));
  });

  $$('.del-product').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Məhsul silinsin?')) return;
      await supabase.from('products').delete().eq('id', button.dataset.id);
      loadProducts();
    });
  });
}

async function saveProduct(event) {
  event.preventDefault();

  const data = formData(event.target);

  try {
    let imageUrl = data.image_url || null;

    if ($('#productImage').files[0]) {
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
}

async function loadOrders() {
  const [orders, couriers] = await Promise.all([
    supabase.from('orders').select('*,profiles!orders_user_id_fkey(email,first_name,last_name,phone)').order('created_at', { ascending: false }).limit(150),
    supabase.from('couriers').select('user_id,vehicle_type,vehicle_plate,profiles(email,first_name,last_name)').eq('is_active', true),
  ]);

  const courierOptions = (couriers.data || []).map((courier) => `
    <option value="${courier.user_id}">${courier.profiles?.first_name || courier.profiles?.email || 'Kuryer'} ${courier.vehicle_plate || ''}</option>
  `).join('');

  $('#ordersTable').innerHTML = (orders.data || []).map((order) => `
    <tr>
      <td>${order.order_code}<br><small>${order.profiles?.email || ''}</small></td>
      <td>${statusAz(order.status)}</td>
      <td>${statusAz(order.payment_status)}</td>
      <td>${money(order.total_amount)}</td>
      <td>
        <select class="assign" data-id="${order.id}">
          <option value="">Kuryer seç</option>
          ${courierOptions}
        </select>
      </td>
      <td>
        <button class="btn btn-soft status" data-id="${order.id}" data-s="confirmed">Təsdiq</button>
        <button class="btn btn-soft status" data-id="${order.id}" data-s="preparing">Hazırla</button>
        <button class="btn btn-soft status" data-id="${order.id}" data-s="on_the_way">Kuryerə ver</button>
        <button class="btn btn-soft status" data-id="${order.id}" data-s="delivered">Təhvil</button>
        <button class="btn btn-danger status" data-id="${order.id}" data-s="cancelled">Ləğv</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6">Sifariş yoxdur.</td></tr>';

  $$('.assign').forEach((select) => {
    select.addEventListener('change', async () => {
      if (!select.value) return;

      const { error } = await supabase.rpc('assign_courier_to_order', {
        p_order_id: select.dataset.id,
        p_courier_id: select.value,
      });

      toast(error ? error.message : 'Kuryer təyin edildi');
      loadOrders();
    });
  });

  $$('.status').forEach((button) => {
    button.addEventListener('click', async () => {
      const { error } = await supabase.rpc('admin_update_order_status', {
        p_order_id: button.dataset.id,
        p_status: button.dataset.s,
      });

      toast(error ? error.message : 'Status dəyişdi');
      loadOrders();
    });
  });
}

async function loadPayments() {
  const { data } = await supabase
    .from('payments')
    .select('*,orders(order_code)')
    .order('created_at', { ascending: false })
    .limit(150);

  $('#paymentsTable').innerHTML = (data || []).map((payment) => `
    <tr>
      <td>${payment.orders?.order_code || ''}</td>
      <td>${payment.provider}</td>
      <td>${money(payment.amount)}</td>
      <td>${payment.status}</td>
      <td>${payment.receipt_url ? `<a class="btn btn-soft" target="_blank" href="${payment.receipt_url}">Çekə bax</a>` : '—'}</td>
      <td>
        <button class="btn btn-soft pay" data-id="${payment.id}" data-s="approved">Təsdiq</button>
        <button class="btn btn-danger pay" data-id="${payment.id}" data-s="rejected">Rədd</button>
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
}

async function loadUsers() {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  $('#usersTable').innerHTML = (data || []).map((user) => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <img class="preview-img" src="${user.avatar_url || PLACEHOLDER}" alt="${user.email}">
          <span>${user.first_name || ''} ${user.last_name || ''}<br><small>${user.email || ''} • ${user.phone || ''}</small></span>
        </div>
      </td>
      <td>${user.address_line || '—'}</td>
      <td>
        <select class="role" data-id="${user.id}">
          <option ${user.role === 'user' ? 'selected' : ''}>user</option>
          <option ${user.role === 'courier' ? 'selected' : ''}>courier</option>
          <option ${user.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
      </td>
      <td>${user.is_active ? 'Aktiv' : 'Passiv'}</td>
      <td><button class="btn btn-soft active" data-id="${user.id}" data-v="${!user.is_active}">${user.is_active ? 'Passiv et' : 'Aktiv et'}</button></td>
    </tr>
  `).join('');

  $$('.role').forEach((select) => {
    select.addEventListener('change', async () => {
      await supabase.from('profiles').update({ role: select.value }).eq('id', select.dataset.id);

      if (select.value === 'courier') {
        await supabase.from('couriers').upsert({ user_id: select.dataset.id, is_active: true }, { onConflict: 'user_id' });
      }

      toast('Rol dəyişdi');
    });
  });

  $$('.active').forEach((button) => {
    button.addEventListener('click', async () => {
      await supabase.from('profiles').update({ is_active: button.dataset.v === 'true' }).eq('id', button.dataset.id);
      loadUsers();
    });
  });
}

async function loadReviews() {
  const { data } = await supabase
    .from('reviews')
    .select('*,products(name,image_url),profiles(email)')
    .order('created_at', { ascending: false })
    .limit(150);

  $('#reviewsTable').innerHTML = (data || []).map((review) => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <img class="preview-img" src="${review.products?.image_url || PLACEHOLDER}" alt="Məhsul">
          <span>${review.products?.name || ''}<br><small>${review.profiles?.email || ''}</small></span>
        </div>
      </td>
      <td>${'⭐'.repeat(review.rating)}</td>
      <td>${review.review_text || ''}</td>
      <td>${review.status}</td>
      <td>
        <button class="btn btn-soft review" data-id="${review.id}" data-s="approved">Təsdiq</button>
        <button class="btn btn-danger review" data-id="${review.id}" data-s="rejected">Rədd</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5">Rəy yoxdur.</td></tr>';

  $$('.review').forEach((button) => {
    button.addEventListener('click', async () => {
      await supabase.from('reviews').update({ status: button.dataset.s }).eq('id', button.dataset.id);
      loadReviews();
    });
  });
}

async function content() {
  await loadContent('banners');
  await loadContent('news');
  await loadContent('partners');

  $('#bannerForm').addEventListener('submit', (event) => saveContent(event, 'banners', 'content'));
  $('#newsForm').addEventListener('submit', (event) => saveContent(event, 'news', 'content'));
  $('#partnerForm').addEventListener('submit', (event) => saveContent(event, 'partners', 'content'));
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
    .order('created_at', { ascending: false })
    .limit(100);

  $(map[table]).innerHTML = (data || []).map((item) => `
    <div class="compact-row">
      <span><b>${item.title || item.name || 'Başlıqsız'}</b><br><small>${item.is_active ? 'Aktiv' : 'Passiv'}</small></span>
      <button class="btn btn-danger del-content" data-table="${table}" data-id="${item.id}">Sil</button>
    </div>
  `).join('') || '<span class="muted">Məlumat yoxdur.</span>';

  $$('.del-content').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Silinsin?')) return;
      await supabase.from(button.dataset.table).delete().eq('id', button.dataset.id);
      loadContent(button.dataset.table);
    });
  });
}

async function saveContent(event, table, bucket) {
  event.preventDefault();

  const data = formData(event.target);

  try {
    let imageUrl = data.image_url || null;
    const file = event.target.querySelector('[type="file"]')?.files?.[0];

    if (file) {
      imageUrl = await uploadFile(bucket, file, table);
    }

    const row = {
      ...data,
      image_url: imageUrl,
      is_active: data.is_active === 'on',
    };

    delete row.id;

    if (table === 'news') row.slug = row.slug || slugify(row.title);

    const { error } = await supabase.from(table).insert(row);

    toast(error ? error.message : 'Saxlanıldı');
    event.target.reset();
    loadContent(table);
  } catch (error) {
    toast(error.message);
  }
}
