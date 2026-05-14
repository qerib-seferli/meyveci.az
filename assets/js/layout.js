// ============================================================
// MEYVƏÇİ.AZ - SABİT HEADER, BOTTOM NAV, MESAJ VƏ BİLDİRİŞLƏR
// Bu fayl bütün səhifələrə yuxarı/aşağı hissəni avtomatik əlavə edir.
// Header-də bildiriş və mesaj butonları var, kliklənəndə GitHub 404 yox, sayt içi modal açılır.
// ============================================================

import { $, $$, profile, logout, supabase, playNotifySound, notificationBodyAz, updateMyPresence } from './core.js';

let notificationPollTimer = null;
let lastNotificationTime = new Date().toISOString();

const bottomNav = [
  ['favorites.html', '❤️', 'Sevimlilər', 'favCount'],
  ['cart.html', '🛒', 'Səbət', 'cartCount'],
  ['index.html', 'logo', '', null],
  ['orders.html', '📦', 'Sifarişlərim', 'orderCount'],
  //['https://wa.me/994993909595', '💬', 'WhatsApp', null],
  [
  'https://wa.me/994993909595',
  `<svg viewBox="0 0 32 32" width="20" height="20">
    <path fill="#25D366" d="M16 .4C7.3.4.4 7.3.4 16c0 2.8.7 5.5 2.1 7.9L0 32l8.4-2.2c2.3 1.3 4.9 2 7.6 2 8.7 0 15.6-6.9 15.6-15.6S24.7.4 16 .4zm0 28.5c-2.4 0-4.7-.6-6.7-1.8l-.5-.3-5 .1 1.3-4.9-.3-.5C3.6 19.4 3 17.7 3 16 3 9.9 9.9 3 16 3s13 6.9 13 13-6.9 12.9-13 12.9zm7.2-9.7c-.4-.2-2.3-1.1-2.6-1.3-.4-.1-.6-.2-.9.2-.3.4-1 1.3-1.2 1.6-.2.3-.4.3-.8.1-.4-.2-1.6-.6-3-1.9-1.1-1-1.9-2.2-2.1-2.6-.2-.4 0-.6.1-.8.1-.1.4-.5.6-.7.2-.2.2-.4.3-.6.1-.2 0-.4 0-.6 0-.2-.9-2.2-1.2-3-.3-.7-.6-.6-.9-.6h-.7c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9s1.2 3.3 1.3 3.6c.2.2 2.3 3.6 5.6 5 3.3 1.4 3.3.9 3.9.8.6-.1 2.3-.9 2.6-1.8.3-.9.3-1.7.2-1.8-.1-.2-.4-.3-.8-.5z"/>
  </svg>`,
  'WhatsApp',
  null
  ],
];

export async function initLayout() {
  renderTopbar();
  renderBottomNav();
  renderSiteFooter();
  await hydrateUserArea();
  startGlobalPresence();
  await refreshBadges();
  await subscribeNotifications();
  startNotificationPolling();
  window.addEventListener('hideLoader', hideLoader);
  setTimeout(hideLoader, 550);
}

function hideLoader() {
  const loader = $('#loader');
  if (loader) loader.style.display = 'none';
}

function renderTopbar() {
  const root = getRootPath();
  const topbar = document.createElement('header');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <div class="topbar-inner">
    <div class="topbar-left">
      <button id="catalogMenuBtn" class="catalog-menu-btn" type="button" aria-label="Kateqoriya menyusu">
        <span></span><span></span><span></span>
      </button>
    
      <a class="brand" href="${root}index.html" aria-label="Meyvəçi.az ana səhifə">
        <img src="${root}assets/img/logo/Meyveci-logo.png" alt="Meyvəçi.az" onerror="this.src='${root}assets/img/logo/Cilek-logo.png'">
      </a>
    </div>
      <div class="top-actions">
        <button id="notifyBtn" class="icon-btn" title="Bildirişlər">
          🔔 <span id="notifyCount" class="badge-count hide">0</span>
        </button>

        <!-- Mesaj butonu: admin/kuryer/user hamısı mesajlara buradan girir. -->
        <a id="messageBtn" class="icon-btn" href="${root}messages.html" title="Mesajlar">
          💬 <span id="messageCount" class="badge-count hide">0</span>
        </a>

        <!-- Admin üçün yeni sifarişlər, kuryer üçün təyin edilmiş sifarişlər qısa keçidi. -->
        <a id="adminOrdersBtn" class="icon-btn hide" href="${root}admin/orders.html" title="Yeni sifarişlər">
          📦 <span id="newOrderCount" class="badge-count hide">0</span>
        </a>

        <a id="panelLink" class="btn btn-soft hide" href="#">Panel</a>
        <a id="profileLink" class="profile-pill" href="${root}profile.html" title="Profil"><span class="profile-ico">👤</span><span id="topUserName" class="profile-name">Profil</span></a>
        <button id="logoutBtn" class="btn btn-danger hide">Çıxış</button>
      </div>

      <div id="notifyDrop" class="mini-dropdown">
        <div class="modal-head"><b>Bildirişlər</b><button id="notifyClose" class="mini-x" type="button">×</button></div>
        <div id="notifyList" class="compact-list" style="margin-top: 8px;"><span class="muted">Bildiriş yoxdur</span></div>
      </div>
    </div>
  `;
  document.body.prepend(topbar);
  $('#notifyBtn')?.addEventListener('click', loadNotifications);
  $('#notifyClose')?.addEventListener('click', () => $('#notifyDrop')?.classList.remove('show'));
  $('#logoutBtn')?.addEventListener('click', logout);
    initCatalogMegaMenu();

              $('#messageBtn')?.addEventListener('click', async (event) => {
                event.preventDefault();
              
                const activeProfile = await profile();
                const href = $('#messageBtn')?.href;
              
                if (activeProfile) {
                  await supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('user_id', activeProfile.id)
                    .eq('title', 'Yeni mesaj')
                    .eq('is_read', false);
              
                  setBadge('messageCount', 0);
                }
              
                if (href) location.href = href;
              });
                
  document.addEventListener('click', (event) => {
    const item = event.target.closest('.notify-item');
    if (item) openNotificationModal(item.dataset.title, item.dataset.body, item.dataset.date);
  });
}

function renderBottomNav() {
  if (location.pathname.includes('/admin/')) return;
  const root = getRootPath();
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.innerHTML = `
    <div class="bottom-nav-inner">
      ${bottomNav.map(([href, icon, label, badgeId]) => {
        const isExternal = href.startsWith('http');
        const url = isExternal ? href : `${root}${href}`;
        const target = isExternal ? 'target="_blank" rel="noopener"' : '';
        const content = icon === 'logo'
          ? `<img class="home-logo" src="${root}assets/img/logo/Cilek-logo.png" alt="Ana səhifə">`
          : `<span class="ico">${icon}</span><span>${label}</span>${badgeId ? `<span id="${badgeId}" class="badge-count hide">0</span>` : ''}`;
        return `<a class="nav-item" href="${url}" ${target}>${content}</a>`;
      }).join('')}
    </div>`;
  document.body.appendChild(nav);
}

async function hydrateUserArea() {
  const activeProfile = await profile();
  const root = getRootPath();
  const panelLink = $('#panelLink');
  if (!activeProfile) return;

  $('#logoutBtn')?.classList.remove('hide');
  setupResponsiveLogout();
  const topUserName = $('#topUserName');
  if (topUserName) topUserName.textContent = (activeProfile.first_name || '').trim() || activeProfile.email || 'Profil';

  if (panelLink && activeProfile.role === 'admin') {
    panelLink.href = `${root}admin/index.html`;
    panelLink.textContent = '👨‍💼';
    panelLink.classList.remove('hide');
    $('#adminOrdersBtn')?.classList.remove('hide');
  }
  if (panelLink && activeProfile.role === 'courier') {
    panelLink.href = `${root}courier/index.html`;
    panelLink.textContent = '🚚';
    panelLink.classList.remove('hide');
    const courierOrdersBtn = $('#adminOrdersBtn');
    if (courierOrdersBtn) {
      courierOrdersBtn.href = `${root}courier/index.html`;
      courierOrdersBtn.title = 'Təyin edilmiş sifarişlər';
      courierOrdersBtn.classList.remove('hide');
    }
  }
}

async function refreshBadges() {
  const activeProfile = await profile();
  if (!activeProfile) return;

  const [favorites, cart, orders, notifications, messages, newOrders] = await Promise.all([
    supabase.from('favorites').select('id', { count: 'exact', head: true }).eq('user_id', activeProfile.id),
    supabase.from('cart_items').select('id', { count: 'exact', head: true }).eq('user_id', activeProfile.id),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', activeProfile.id).not('status', 'in', '(delivered,cancelled)'),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', activeProfile.id).eq('is_read', false).neq('title', 'Yeni mesaj'),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', activeProfile.id).eq('is_read', false).eq('title', 'Yeni mesaj'),
    activeProfile.role === 'admin'
      ? supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['pending','confirmed','preparing','on_the_way','courier_near'])
      : activeProfile.role === 'courier'
        ? supabase.from('orders').select('id', { count: 'exact', head: true }).eq('courier_id', activeProfile.id).not('status', 'in', '(delivered,cancelled)')
        : Promise.resolve({ count: 0 }),
  ]);

  setBadge('favCount', favorites.count || 0);
  setBadge('cartCount', cart.count || 0);
  setBadge('orderCount', orders.count || 0);
  setBadge('notifyCount', notifications.count || 0);
  setBadge('messageCount', messages.count || 0);
  setBadge('newOrderCount', newOrders.count || 0);

  const totalAppBadge =
    Number(notifications.count || 0) +
    Number(messages.count || 0);
  
  try {
    if (totalAppBadge > 0 && 'setAppBadge' in navigator) {
      navigator.setAppBadge(totalAppBadge);
    }
  
    if (totalAppBadge < 1 && 'clearAppBadge' in navigator) {
      navigator.clearAppBadge();
    }
  } catch (_) {}
}

function setBadge(id, count) {
  const el = $(`#${id}`);
  if (!el) return;
  el.textContent = count > 99 ? '99+' : String(count);
  el.classList.toggle('hide', count < 1);
}

async function loadNotifications() {
  const dropdown = $('#notifyDrop');
  const list = $('#notifyList');
  dropdown?.classList.toggle('show');
  if (!dropdown?.classList.contains('show')) return;

  const activeProfile = await profile();
  if (!activeProfile) {
    list.innerHTML = '<span class="muted">Bildiriş görmək üçün daxil olun.</span>';
    return;
  }

  const { data, error } = await supabase
    .from('notifications')
    .select('id,title,body,created_at,is_read,link_url')
    .eq('user_id', activeProfile.id)
    .neq('title', 'Yeni mesaj')
    .order('created_at', { ascending: false })
    .limit(99);

  if (error) {
    list.innerHTML = '<span class="muted">Bildiriş yüklənmədi.</span>';
    return;
  }

  list.innerHTML = (data || []).map((item) => {
    const title = item.title || 'Bildiriş';
    const body = notificationBodyAz(item.body || '');
    const dateText = item.created_at ? new Date(item.created_at).toLocaleString('az-AZ') : '';
    return `
      <button class="compact-row notify-item" type="button" data-title="${escapeAttr(title)}" data-body="${escapeAttr(body)}" data-date="${escapeAttr(dateText)}">
        <span>
          <b>${title}</b><br>
          <small class="muted">${highlightNotificationBody(body)}</small><br>
          <small class="muted">${dateText}</small>
        </span>
        ${item.is_read ? '' : '<span class="badge-count" style="position: static;">•</span>'}
      </button>`;
  }).join('') || '<span class="muted">Bildiriş yoxdur.</span>';

  await supabase.from('notifications').update({ is_read: true }).eq('user_id', activeProfile.id).eq('is_read', false).neq('title', 'Yeni mesaj');
  setBadge('notifyCount', 0);
}




async function subscribeNotifications() {
  const activeProfile = await profile();
  if (!activeProfile) return;

  supabase
    .channel(`notifications-live-${activeProfile.id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${activeProfile.id}`,
      },
      (payload) => {
        handleIncomingNotification(payload.new);
      }
    )
    .subscribe((status) => {
      console.log('Notification realtime status:', status);
    });

  if (activeProfile.role === 'admin' || activeProfile.role === 'courier') {
    supabase
      .channel(`orders-badge-live-${activeProfile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => refreshBadges()
      )
      .subscribe();
  }
}




function openNotificationModal(title, body, dateText = '') {
  let modal = $('#notifyModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'notifyModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-head"><b id="notifyModalTitle">Bildiriş</b><button id="notifyModalClose" class="mini-x" type="button">×</button></div>
        <p id="notifyModalBody" class="muted"></p>
        <small id="notifyModalDate" class="muted"></small>
      </div>`;
    document.body.appendChild(modal);
    $('#notifyModalClose')?.addEventListener('click', () => modal.classList.remove('show'));
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('show'); });
  }
  $('#notifyModalTitle').textContent = title || 'Bildiriş';
  $('#notifyModalBody').textContent = body || '';
  $('#notifyModalDate').textContent = dateText || '';
  modal.classList.add('show');
}


function renderSiteFooter() {
  if (document.querySelector('.site-footer')) return;
  if (location.pathname.includes('/admin/') || location.pathname.includes('/courier/')) return;

  const root = getRootPath();

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="site-footer-inner">
      <div class="footer-brand">
        <img src="${root}assets/img/logo/Meyveci-logo.png" alt="Meyvəçi.az">
        <p>Meyvəçi.az — təzə məhsulların təhlükəsiz və rahat onlayn sifarişi.</p>
        <small>“MAREHO” MMC • VÖEN: 3105652551</small>
      </div>

      <div class="footer-grid">
        <div>
          <h4>Şirkət</h4>
          <a href="${root}index.html">Ana səhifə</a>
          <a href="${root}faq.html">Tez-tez verilən suallar</a>
          <a href="${root}delivery.html">Çatdırılma</a>
        </div>

        <div>
          <h4>Müştəri xidməti</h4>
          <a href="${root}refund.html">Geri qaytarma siyasəti</a>
          <a href="https://wa.me/994993909595" target="_blank" rel="noopener">WhatsApp dəstək</a>
          <a href="mailto:meyveci@proton.me">Email dəstək</a>
        </div>

        <div>
          <h4>Hüquqi</h4>
          <a href="${root}privacy.html">Məxfilik siyasəti</a>
          <a href="${root}terms.html">İstifadə şərtləri</a>
          <a href="${root}security.html">Təhlükəsizlik</a>
        </div>

        <div>
          <h4>Ödəniş və təhlükəsizlik</h4>
          <a href="${root}payment-security.html">Ödəniş təhlükəsizliyi</a>
          <span>SSL Secure Checkout</span>
          <span>3D Secure dəstəyi</span>
        </div>
      </div>

        <div class="footer-bottom">
          <span class="footer-copy-left">
            © 2026 Meyveci.az. Bütün hüquqlar qorunur.
            “MAREHO” MMC tərəfindən idarə olunur.
          </span>
        
          <span class="footer-copy-right">
            - - -
          </span>
        </div>
    </div>
  `;

  document.body.appendChild(footer);
}


function getRootPath() {
  return location.pathname.includes('/admin/') || location.pathname.includes('/courier/') ? '../' : './';
}

function highlightNotificationBody(body = '') {
  return escapeAttr(body)
    .replace(/(MV-\d{8}-[A-Z0-9]+)/g, '<b class="notify-code">$1</b>')
    .replace(/(\d+(?:\.\d{2})?\sAZN)/g, '<b class="notify-price">$1</b>');
}

function escapeAttr(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}



/*function showRealtimeToast(title, body = '') {
  let box = $('#realtimeToast');

  if (!box) {
    box = document.createElement('div');
    box.id = 'realtimeToast';
    box.className = 'realtime-toast';
    box.innerHTML = `
      <button class="realtime-toast-x" type="button">×</button>
      <b id="realtimeToastTitle"></b>
      <p id="realtimeToastBody"></p>
    `;
    document.body.appendChild(box);

    box.querySelector('.realtime-toast-x')?.addEventListener('click', () => {
      box.classList.remove('show');
    });
  }

  $('#realtimeToastTitle').textContent = title || 'Yeni bildiriş';
  $('#realtimeToastBody').textContent = body || '';

  box.classList.add('show');

  clearTimeout(window.__meyveciToastTimer);
  window.__meyveciToastTimer = setTimeout(() => {
    box.classList.remove('show');
  }, 6500);
}*/




async function startNotificationPolling() {
  const activeProfile = await profile();
  if (!activeProfile) return;

  if (notificationPollTimer) clearInterval(notificationPollTimer);

  notificationPollTimer = setInterval(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('id,title,body,created_at,is_read')
      .eq('user_id', activeProfile.id)
      .eq('is_read', false)
      .gt('created_at', lastNotificationTime)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data?.length) return;

    handleIncomingNotification(data[0]);
  }, 5000);
}


async function showPhoneNotification(item) {
  if (!item) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.ready;

  await registration.showNotification(item.title || 'Meyvəçi', {
    body: notificationBodyAz(item.body || 'Yeni bildiriş gəldi.'),
    icon: './assets/img/logo/Cilek-logo.png',
    badge: './assets/img/logo/Cilek-logo.png',
    vibrate: [160, 80, 160],
    tag: `meyveci-${item.id || Date.now()}`,
    renotify: true,
    data: {
      url: item.link_url || './messages.html',
    },
  });
}


function handleIncomingNotification(item) {
  if (!item) return;

  lastNotificationTime = item.created_at || new Date().toISOString();

  refreshBadges();
  playNotifySound();

  showPhoneNotification(item).catch(() => {});

  if (item.title === 'Yeni mesaj') {
    return;
  }

  showRealtimeToast(
    item.title || 'Yeni bildiriş',
    notificationBodyAz(item.body || 'Yeni bildiriş gəldi.')
  );
}


function showRealtimeToast(title, body = '') {
  let box = $('#realtimeToast');

  if (!box) {
    box = document.createElement('div');
    box.id = 'realtimeToast';
    box.className = 'realtime-toast';
    box.innerHTML = `
      <button class="realtime-toast-x" type="button">×</button>
      <b id="realtimeToastTitle"></b>
      <p id="realtimeToastBody"></p>
    `;
    document.body.appendChild(box);

    box.querySelector('.realtime-toast-x')?.addEventListener('click', () => {
      box.classList.remove('show');
    });
  }

  $('#realtimeToastTitle').textContent = title || 'Yeni bildiriş';
  $('#realtimeToastBody').textContent = body || '';

  box.classList.add('show');

  clearTimeout(window.__meyveciToastTimer);
  window.__meyveciToastTimer = setTimeout(() => {
    box.classList.remove('show');
  }, 6500);
}



/*====================================== Bu hissə çıxış düyməsi üçündür===================================================*/
function setupResponsiveLogout() {
  const logoutBtn = $('#logoutBtn');
  const profileLink = $('#profileLink');
  const slot = $('#mobileLogoutSlot');

  if (!logoutBtn || !profileLink) return;

  function moveLogout() {
    const isMobile = window.innerWidth <= 768;

    if (isMobile && slot) {
      // Telefonda yalnız profile.html səhifəsində Yadda saxla düyməsinin altına köçürürük.
      slot.appendChild(logoutBtn);
      logoutBtn.classList.remove('hide');
      logoutBtn.classList.add('mobile-profile-logout');
      logoutBtn.classList.add('full');
      return;
    }

    // Desktopda əvvəlki yerinə — profilin sağına qaytarırıq.
    profileLink.insertAdjacentElement('afterend', logoutBtn);
    logoutBtn.classList.remove('mobile-profile-logout');
    logoutBtn.classList.remove('full');
    logoutBtn.classList.remove('hide');
  }

  moveLogout();

  if (!window.__meyveciLogoutMoveReady) {
    window.__meyveciLogoutMoveReady = true;
    window.addEventListener('resize', moveLogout);
  }
}

/*==========================================================================================================*/

let globalPresenceTimer = null;

async function startGlobalPresence() {
  const activeProfile = await profile();
  if (!activeProfile) return;

  await updateMyPresence(true);

  if (globalPresenceTimer) clearInterval(globalPresenceTimer);

  globalPresenceTimer = setInterval(() => {
    updateMyPresence(!document.hidden);
  }, 30000);

  document.addEventListener('visibilitychange', () => {
    updateMyPresence(!document.hidden);
  });

  window.addEventListener('beforeunload', () => {
    updateMyPresence(false);
  });
}
/*==========================================================================================================*/

/* ==================== TRENDYOL STYLE KATALOQ MENYU ==================== */

async function initCatalogMegaMenu() {
  const root = getRootPath();
  const btn = $('#catalogMenuBtn');
  if (!btn) return;

  let menu = $('#catalogMegaMenu');

  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'catalogMegaMenu';
    menu.className = 'catalog-mega-menu';
    menu.innerHTML = `
      <div class="catalog-menu-panel">
        <div class="catalog-mobile-title">
          <button id="catalogCloseBtn" type="button">←</button>
          <b>Bütün kateqoriyalar</b>
        </div>
        <div class="catalog-left" id="catalogLeft"></div>
        <div class="catalog-right" id="catalogRight"></div>
      </div>
    `;
    document.body.appendChild(menu);
  }

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from('categories')
      .select('id,name,image_url,slug,sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .limit(60),

  supabase
    .from('products')
    .select('id,name,category_id,image_url,status,price,old_price')
    .eq('status', 'active')
    .order('name')
    .limit(300),
    
  ]);

  const cats = categories || [];
  const prods = products || [];

  const left = $('#catalogLeft');
  const right = $('#catalogRight');

  function productKeywords(categoryId) {
    const names = prods
      .filter((p) => p.category_id === categoryId)
      .map((p) => String(p.name || '').trim())
      .filter(Boolean);

    const words = [];

    names.forEach((name) => {
      const firstWord = name.split(' ')[0];
      if (firstWord && firstWord.length > 2) words.push(firstWord);
      words.push(name);
    });

    return [...new Set(words)].slice(0, 18);
  }

  function openCategory(category) {
    const keywords = productKeywords(category.id);

    right.innerHTML = `
      <div class="catalog-mobile-head">
        <button id="catalogBackBtn" type="button">←</button>
        <b>${category.name}</b>
      </div>

      <div class="catalog-right-title">
        <img src="${category.image_url || `${root}assets/img/logo/Cilek-logo.png`}" alt="${category.name}">
        <div>
          <b>${category.name}</b>
          <span>Məhsul adına görə sürətli filter</span>
        </div>
      </div>

      <div class="catalog-keyword-grid">
        ${keywords.map((word) => `
          <button class="catalog-keyword" type="button" data-cat="${category.id}" data-word="${escapeAttr(word)}">
            ${word}
          </button>
        `).join('') || '<span class="muted">Bu kateqoriyada məhsul yoxdur.</span>'}
      </div>
    `;

    $$('.catalog-keyword').forEach((item) => {
      item.addEventListener('click', () => {
        applyCatalogFilter(item.dataset.cat, item.dataset.word);
      });
    });

    $('#catalogBackBtn')?.addEventListener('click', () => {
      menu.classList.remove('show-products');
    });

    $('#catalogCloseBtn')?.addEventListener('click', () => {
      menu.classList.remove('show');
      menu.classList.remove('show-products');
    });
    
    menu.classList.add('show-products');
  }


  const discountedProducts = prods.filter((product) =>
    Number(product.old_price) > Number(product.price)
  );
  
  const maxDiscount = discountedProducts.length
    ? Math.max(...discountedProducts.map((product) =>
        Math.round(((Number(product.old_price) - Number(product.price)) / Number(product.old_price)) * 100)
      ))
    : 0;

  
  left.innerHTML = `
    <button class="catalog-discount-head" type="button" data-discount="true">
      <span class="discount-head-left">
        <b>Endirimli məhsullar</b>
        <small>🔥 Ən sərfəli qiymətlər</small>
      </span>
      <span class="discount-head-percent">${maxDiscount || 0}%</span>
    </button>

    ${cats.map((cat, index) => `
      <button class="catalog-left-item ${index === 0 ? 'active' : ''}" type="button" data-id="${cat.id}">
        <img src="${cat.image_url || `${root}assets/img/logo/Cilek-logo.png`}" alt="${cat.name}">
        <span>${cat.name}</span>
      </button>
    `).join('')}
  `;
  

  $('.catalog-discount-head')?.addEventListener('click', () => {
    localStorage.setItem('meyveciCatalogFilter', JSON.stringify({
      category: 'discounts',
      query: '',
    }));
  
    menu.classList.remove('show');
    menu.classList.remove('show-products');
  
    if (document.body.dataset.page === 'home') {
      window.dispatchEvent(new CustomEvent('meyveciCatalogFilter', {
        detail: { category: 'discounts', query: '' },
      }));
    } else {
      location.href = `${root}index.html`;
    }
  });
  
  $$('.catalog-left-item').forEach((item) => {
    item.addEventListener('mouseenter', () => {
      if (window.innerWidth <= 768) return;
      $$('.catalog-left-item').forEach((x) => x.classList.remove('active'));
      item.classList.add('active');
      const cat = cats.find((c) => c.id === item.dataset.id);
      if (cat) openCategory(cat);
    });

    item.addEventListener('click', () => {
      const cat = cats.find((c) => c.id === item.dataset.id);
      if (cat) {
        if (window.innerWidth <= 768) {
          applyCatalogFilter(cat.id, '');
        } else {
          openCategory(cat);
        }
      }
    });
  });

  if (cats[0]) openCategory(cats[0]);

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    menu.classList.toggle('show');
    menu.classList.remove('show-products');
  });

  menu.addEventListener('click', (event) => {
    if (event.target === menu) {
      menu.classList.remove('show');
      menu.classList.remove('show-products');
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#catalogMegaMenu') && !event.target.closest('#catalogMenuBtn')) {
      menu.classList.remove('show');
      menu.classList.remove('show-products');
    }
  });

  function applyCatalogFilter(categoryId, keyword = '') {
    localStorage.setItem('meyveciCatalogFilter', JSON.stringify({
      category: categoryId || 'all',
      query: keyword || '',
    }));

    menu.classList.remove('show');
    menu.classList.remove('show-products');

    if (document.body.dataset.page === 'home') {
      window.dispatchEvent(new CustomEvent('meyveciCatalogFilter', {
        detail: { category: categoryId || 'all', query: keyword || '' },
      }));
    } else {
      location.href = `${root}index.html`;
    }
  }
}
/*==========================================================================================================*/
