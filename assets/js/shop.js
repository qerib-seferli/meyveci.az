// ============================================================
// MEYVƏÇİ.AZ - MAĞAZA VƏ ANA SƏHİFƏ FUNKSİYALARI
// Bu fayl ana səhifə, məhsul siyahısı, sevimli və səbət əlavə etməni idarə edir.
// ============================================================

import {
  $,
  $$,
  supabase,
  money,
  toast,
  PLACEHOLDER,
  requireAuth,
  byId,
  formData,
} from './core.js';

import { initLayout } from './layout.js';

const state = {
  categories: [],
  products: [],
  favorites: new Set(),
  category: 'all',
  query: '',
  visible: 12,
};

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  const page = document.body.dataset.page;

  if (page === 'home') initHome();
  if (page === 'product') initProduct();
});

async function initHome() {
  await loadHomeData();
  setupHomeEvents();


  // Banner, xəbər və partnyorlar artıq xüsusi CSS layout ilə idarə olunur.
  // Köhnə auto scroll və marquee sistemi söndürüldü.
  //startAutoScroll('#bannerGrid');
  startCampaignRotation();
  startNewsRotation();
  
  // Xəbərlər və partnyorlar CSS marquee ilə davamlı döngüdə hərəkət edir.
  //prepareMarquee('#newsGrid', 'left');
  //prepareMarquee('#partnersGrid', 'right');
  window.dispatchEvent(new Event('hideLoader'));
}

function setupHomeEvents() {
  $('#homeSearchInput')?.addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.visible = 12;
    renderProducts();
  });

  $('#clearHomeFilters')?.addEventListener('click', () => {
    state.query = '';
    state.category = 'all';
    state.visible = 12;
    $('#homeSearchInput').value = '';
    renderCategoryChips();
    renderProducts();
  });

  $('#loadMore')?.addEventListener('click', () => {
    state.visible += 10;
    renderProducts();
  });
}

async function loadHomeData() {
  const [categories, products, banners, news, partners, favorites] = await Promise.all([
    supabase.from('categories').select('id,name,slug,description,image_url,sort_order').eq('is_active', true).order('sort_order').limit(50),
    supabase.from('products').select('*').eq('status', 'active').order('is_featured', { ascending: false }).order('created_at', { ascending: false }).limit(120),
    supabase.from('banners').select('*').eq('is_active', true).order('sort_order').limit(5),
    supabase.from('news').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(8),
    supabase.from('partners').select('*').eq('is_active', true).order('sort_order').limit(16),
    supabase.from('favorites').select('product_id'),
  ]);

  state.categories = categories.data || [];
  state.products = products.data || [];
  state.favorites = new Set((favorites.data || []).map((item) => item.product_id));

  renderBanners(banners.data || []);
  renderNews(news.data || []);
  renderCategoryChips();
  renderProducts();
  renderPartners(partners.data || []);
}

function renderBanners(rows) {
  const container = $('#bannerGrid');
  if (!container) return;

  const fallback = [{
    title: 'Təzə məhsullar qapına qədər',
    image_url: 'assets/img/logo/Cilek-logo.png',
    link_url: '#products',
  }];

  const items = rows.length ? rows : fallback;

  container.innerHTML = items.map((item, index) => `
    <a class="home-banner-card ${index < 2 ? 'show' : ''}" href="${item.link_url || '#products'}" data-banner-index="${index}">
      <img src="${item.image_url || 'assets/img/logo/Cilek-logo.png'}" alt="${item.title || 'Banner'}">
      <b>${item.title || 'Meyvəçi.az'}</b>
    </a>
  `).join('');
}



function renderNews(rows) {
  const container = $('#newsGrid');
  if (!container) return;

  const fallback = [{
    title: 'Günün xəbərləri',
    excerpt: 'Tezliklə yeni kampaniyalar əlavə olunacaq.',
    body: '',
    image_url: 'assets/img/logo/Cilek-logo.png'
  }];

  const items = rows.length ? rows : fallback;
  window.meyveciNewsItems = items;

  renderNewsTicker(items);

  const mainItem = items[0];
  const sideItems = items.slice(1, 4);

  container.innerHTML = `
    <button class="home-main-news news-open" type="button"
      data-news-index="0"
      data-title="${escapeAttr(mainItem.title || 'Xəbər')}"
      data-excerpt="${escapeAttr(mainItem.excerpt || '')}"
      data-body="${escapeAttr(mainItem.body || mainItem.content || mainItem.description || '')}"
      data-image="${escapeAttr(mainItem.image_url || 'assets/img/logo/Cilek-logo.png')}">
      <img src="${mainItem.image_url || 'assets/img/logo/Cilek-logo.png'}" alt="${mainItem.title || 'Xəbər'}">
      <span></span>
      <b>${mainItem.title || 'Xəbər'}</b>
      <small>${mainItem.excerpt || ''}</small>
    </button>

    <div class="home-side-news">
      ${sideItems.map((item, index) => `
        <button class="home-mini-news news-open" type="button"
          data-news-index="${index + 1}"
          data-title="${escapeAttr(item.title || 'Xəbər')}"
          data-excerpt="${escapeAttr(item.excerpt || '')}"
          data-body="${escapeAttr(item.body || item.content || item.description || '')}"
          data-image="${escapeAttr(item.image_url || 'assets/img/logo/Cilek-logo.png')}">
          <img src="${item.image_url || 'assets/img/logo/Cilek-logo.png'}" alt="${item.title || 'Xəbər'}">
          <b>${item.title || 'Xəbər'}</b>
        </button>
      `).join('')}
    </div>
  `;

  $$('.news-open').forEach((button) => {
    button.addEventListener('click', () => openNewsModal(button.dataset));
  });
}



function renderPartners(rows) {
  const container = $('#partnersGrid');
  if (!container) return;

  const items = rows.length ? rows : [{
    name: 'Meyvəçi.az',
    image_url: 'assets/img/logo/Meyveci-logo.png'
  }];

  container.innerHTML = duplicateForLoop(items).map((item) => `
    <a class="home-partner-card" href="${item.link_url || '#'}">
      <img src="${item.image_url || 'assets/img/logo/Cilek-logo.png'}" alt="${item.name || 'Partnyor'}">
      <b>${item.name || 'Partnyor'}</b>
    </a>
  `).join('');
}



// Xəbər detalını səhifədən çıxmadan açır: mobil və kompüterdə ekrana sığan modal.
function openNewsModal(data) {
  let modal = $('#newsModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'newsModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <article class="modal-card news-modal-card">
        <div class="modal-head">
          <b id="newsModalTitle">Xəbər</b>
          <button id="newsModalClose" class="mini-x" type="button">×</button>
        </div>
        <img id="newsModalImage" src="" alt="Xəbər">
        <p id="newsModalExcerpt" class="muted"></p>
        <div id="newsModalBody" class="news-body"></div>
      </article>`;
    document.body.appendChild(modal);
    $('#newsModalClose')?.addEventListener('click', () => modal.classList.remove('show'));
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('show'); });
  }
  $('#newsModalTitle').textContent = data.title || 'Xəbər';
  $('#newsModalImage').src = data.image || 'assets/img/logo/Cilek-logo.png';
  $('#newsModalExcerpt').textContent = data.excerpt || '';
  $('#newsModalBody').textContent = data.body || data.excerpt || '';
  modal.classList.add('show');
}

// Döngülü animasiya üçün eyni siyahını iki dəfə artırırıq; boşluq yaranmır.
function duplicateForLoop(items) {
  return [...items, ...items];
}

function escapeAttr(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function renderCategoryChips() {
  const container = $('#homeCategoryChips');
  if (!container) return;

  container.innerHTML = `
    <button class="category-card ${state.category === 'all' ? 'active' : ''}" data-id="all">
      <span class="category-img-wrap">
        <img src="./assets/img/logo/Cilek-logo.png" alt="Hamısı" loading="lazy">
      </span>
      <span class="category-name">Hamısı</span>
    </button>

    ${state.categories.map((category) => `
      <button class="category-card ${state.category === category.id ? 'active' : ''}" data-id="${category.id}">
        <span class="category-img-wrap">
          <img 
            src="${category.image_url || './assets/img/logo/Cilek-logo.png'}" 
            alt="${category.name || 'Kateqoriya'}"
            loading="lazy"
          >
        </span>
        <span class="category-name">${category.name}</span>
      </button>
    `).join('')}
  `;

  $$('#homeCategoryChips .category-card').forEach((button) => {
    button.addEventListener('click', () => {
      state.category = button.dataset.id;
      state.visible = 12;
      renderCategoryChips();
      renderProducts();
    });
  });
}

function filteredProducts() {
  return state.products.filter((product) => {
    const categoryMatch = state.category === 'all' || product.category_id === state.category;
    const searchMatch = !state.query || product.name.toLowerCase().includes(state.query);
    return categoryMatch && searchMatch;
  });
}

function renderProducts() {
  const container = $('#productsGrid');
  if (!container) return;

  const rows = filteredProducts();
  const visibleRows = rows.slice(0, state.visible);

  container.innerHTML = visibleRows.map(productCard).join('') || `
    <div class="card">
      <b>Məhsul tapılmadı</b>
      <p class="muted">Axtarışı və ya kateqoriyanı dəyişin.</p>
    </div>
  `;

  $$('.add-cart').forEach((button) => {
    button.addEventListener('click', () => addCart(button.dataset.id));
  });

  $$('.fav-btn').forEach((button) => {
    button.addEventListener('click', () => toggleFavorite(button.dataset.id, button));
  });

  const loadMoreButton = $('#loadMore');
  if (loadMoreButton) loadMoreButton.style.display = rows.length > visibleRows.length ? 'inline-flex' : 'none';
}

function productCard(product) {
  const discount = getDiscount(product.price, product.old_price);
  const isFavorite = state.favorites.has(product.id);

  return `
    <article class="product-card">
      ${discount ? `<span class="discount-leaf">-${discount}%</span>` : ''}
      <button class="fav-btn ${isFavorite ? 'active' : ''}" data-id="${product.id}" title="${isFavorite ? 'Sevimlilərdən çıxart' : 'Sevimlilərə əlavə et'}" aria-label="${isFavorite ? 'Sevimlilərdən çıxart' : 'Sevimlilərə əlavə et'}">♥</button>

      <a href="product.html?id=${product.id}" class="pic">
        <img loading="lazy" src="${product.image_url || PLACEHOLDER}" alt="${product.name}">
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
    </article>
  `;
}

function getDiscount(price, oldPrice) {
  if (!oldPrice || Number(oldPrice) <= Number(price)) return 0;
  return Math.round(((Number(oldPrice) - Number(price)) / Number(oldPrice)) * 100);
}

async function addCart(productId) {
  const activeUser = await requireAuth();
  if (!activeUser) return;

  const { data } = await supabase
    .from('cart_items')
    .select('id,quantity')
    .eq('user_id', activeUser.id)
    .eq('product_id', productId)
    .maybeSingle();

  const response = data
    ? await supabase.from('cart_items').update({ quantity: data.quantity + 1 }).eq('id', data.id)
    : await supabase.from('cart_items').insert({ user_id: activeUser.id, product_id: productId, quantity: 1 });

  if (response.error) return toast(response.error.message);

  toast('Səbətə əlavə olundu');
}

async function toggleFavorite(productId, button) {
  const activeUser = await requireAuth();
  if (!activeUser) return;

  if (state.favorites.has(productId)) {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', activeUser.id)
      .eq('product_id', productId);

    if (error) return toast(error.message);

    state.favorites.delete(productId);
    button.classList.remove('active');
    button.title = 'Sevimlilərə əlavə et';
    button.setAttribute('aria-label', 'Sevimlilərə əlavə et');
    toast('Sevimlilərdən çıxarıldı');
    return;
  }

  const { error } = await supabase
    .from('favorites')
    .upsert({ user_id: activeUser.id, product_id: productId }, { onConflict: 'user_id,product_id' });

  if (error) return toast(error.message);

  state.favorites.add(productId);
  button.classList.add('active');
  button.title = 'Sevimlilərdən çıxart';
  button.setAttribute('aria-label', 'Sevimlilərdən çıxart');
  toast('Sevimlilərə əlavə olundu');
}

async function initProduct() {
  const id = byId();
  const detail = $('#productDetail');

  if (!id || !detail) {
    detail.innerHTML = '<div class="card">Məhsul tapılmadı.</div>';
    return;
  }

  const { data: product, error } = await supabase
    .from('products')
    .select('*,categories(name)')
    .eq('id', id)
    .maybeSingle();

  if (error || !product) {
    detail.innerHTML = '<div class="card">Məhsul tapılmadı.</div>';
    return;
  }

  const discount = getDiscount(product.price, product.old_price);

  detail.innerHTML = `
    <div class="card product-detail-grid">
      <div class="product-detail-image">
        ${discount ? `<span class="discount-leaf">-${discount}%</span>` : ''}
        <img src="${product.image_url || PLACEHOLDER}" alt="${product.name}">
      </div>

      <div class="product-detail-info">
        <span class="unit-badge">${product.categories?.name || 'Məhsul'}</span>
        <h1>${product.name}</h1>
        <div class="price-row">
          <span class="price">${money(product.price)}</span>
          ${product.old_price ? `<span class="old-price">${money(product.old_price)}</span>` : ''}
        </div>
        <p><b>Ölçü vahidi:</b> ${product.unit || 'ədəd'}</p>
        <p class="muted">${product.description || product.short_description || 'Təzə və keyfiyyətli məhsul.'}</p>
        <div class="detail-actions">
          <button id="addCartDetail" class="btn btn-primary">Səbətə əlavə et</button>
          <button id="addFavDetail" class="btn btn-soft">Sevimlilərə əlavə et</button>
        </div>
      </div>
    </div>
  `;

  $('#addCartDetail').addEventListener('click', () => addCart(product.id));
  $('#addFavDetail').addEventListener('click', () => toggleFavorite(product.id, $('#addFavDetail')));
  await renderRelatedProducts(product);
}

// Məhsul detalının altında eyni kateqoriyadan oxşar məhsullar göstərilir.
async function renderRelatedProducts(product) {
  const detail = $('#productDetail');
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('status', 'active')
    .eq('category_id', product.category_id)
    .neq('id', product.id)
    .limit(5);

  if (!data?.length) return;

  detail.insertAdjacentHTML('beforeend', `
    <section class="related-products">
      <div class="section-head"><h2>Oxşar məhsullar</h2></div>
      <div class="product-grid">${data.map(productCard).join('')}</div>
    </section>
  `);

  $$('.related-products .add-cart').forEach((button) => button.addEventListener('click', () => addCart(button.dataset.id)));
  $$('.related-products .fav-btn').forEach((button) => button.addEventListener('click', () => toggleFavorite(button.dataset.id, button)));
}

function prepareMarquee(selector, direction) {
  const element = $(selector);
  if (!element) return;
  element.classList.add('marquee-strip');
  if (direction === 'right') element.classList.add('reverse');
}

function startAutoScroll(selector) {
  const element = $(selector);
  if (!element) return;

  setInterval(() => {
    const next = element.scrollLeft + Math.min(360, element.clientWidth * 0.85);
    const endReached = next >= element.scrollWidth - element.clientWidth - 8;
    element.scrollTo({ left: endReached ? 0 : next, behavior: 'smooth' });
  }, 4200);
}





function renderNewsTicker(items) {
  const newsSection = $('#newsGrid')?.closest('section');
  if (!newsSection || $('#newsTicker')) return;

  const ticker = document.createElement('div');
  ticker.id = 'newsTicker';
  ticker.className = 'news-ticker';

  const firstImage = items[0]?.image_url || 'assets/img/logo/Cilek-logo.png';

  ticker.innerHTML = `
    <div class="ticker-badge">
      <img src="${firstImage}" alt="Xəbər">
      <span>CANLI XƏBƏR</span>
    </div>
    <div class="ticker-line">
      <div class="ticker-track">
        ${duplicateForLoop(items).map((item) => `
          <span>${item.title || 'Xəbər'}</span>
        `).join('')}
      </div>
    </div>
  `;

  newsSection.insertBefore(ticker, newsSection.querySelector('.section-head'));
}

function startNewsRotation() {
  setInterval(() => {
    const items = window.meyveciNewsItems || [];
    if (items.length < 2) return;

    items.push(items.shift());
    renderNews(items);
  }, 5200);
}

function startCampaignRotation() {
  setInterval(() => {
    const cards = $$('#bannerGrid .home-banner-card');
    if (cards.length <= 2) return;

    cards.forEach((card) => card.classList.remove('show'));

    const first = cards[0];
    const second = cards[1];

    $('#bannerGrid').appendChild(first);
    $('#bannerGrid').appendChild(second);

    setTimeout(() => {
      $$('#bannerGrid .home-banner-card').slice(0, 2).forEach((card) => {
        card.classList.add('show');
      });
    }, 80);
  }, 4000);  // Bannerlərin dəyişmə saniyəsin 4 saniyə etdim
}


//=========================================================
// ==================== MƏHSUL RƏYLƏRİ ====================

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const form = document.querySelector('#reviewForm');
    const productId = new URLSearchParams(location.search).get('id');
    if (!form || !productId) return;

    loadProductReviews(productId);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const { requireAuth, toast, supabase } = window.__dummy || {};
    });
  }, 800);
});

//=========================================================

async function loadProductReviews(productId) {
  const box = $('#productReviews');
  if (!box) return;

  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('product_id', productId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    box.innerHTML = `<span class="muted">${error.message}</span>`;
    return;
  }

  const userIds = [...new Set((reviews || []).map((r) => r.user_id).filter(Boolean))];

  const { data: profiles } = userIds.length
    ? await supabase
      .from('profiles')
      .select('id,first_name,last_name,email,avatar_url')
      .in('id', userIds)
    : { data: [] };

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  box.innerHTML = (reviews || []).map((review) => {
    const p = profileMap.get(review.user_id) || {};
    const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email || 'Müştəri';
    const dateText = review.created_at ? new Date(review.created_at).toLocaleString('az-AZ') : '';

    return `
      <div class="compact-row">
        <div style="display:flex;gap:10px;align-items:center;">
          <img class="preview-img customer-avatar" src="${p.avatar_url || PLACEHOLDER}" alt="${name}">
          <span>
            <b>${name}</b><br>
            <small>${'⭐'.repeat(Number(review.rating || 0))} ${Number(review.rating || 0)}/5</small><br>
            <small class="muted">${dateText}</small><br>
            <small class="muted">${review.review_text || ''}</small>
          </span>
        </div>
      </div>
    `;
  }).join('') || '<span class="muted">Bu məhsul üçün təsdiqlənmiş rəy yoxdur.</span>';
}


document.addEventListener('submit', async (event) => {
  if (event.target?.id !== 'reviewForm') return;

  event.preventDefault();

  const productId = byId();
  const activeUser = await requireAuth();
  if (!activeUser || !productId) return;

  const data = formData(event.target);

  const { error } = await supabase.from('reviews').insert({
    product_id: productId,
    user_id: activeUser.id,
    rating: Number(data.rating),
    review_text: data.review_text,
    status: 'pending',
  });

  toast(error ? error.message : 'Rəy göndərildi. Admin təsdiq etdikdən sonra görünəcək.');
  event.target.reset();
});

//=========================================================

