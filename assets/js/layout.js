// ============================================================
// MEYVƏÇİ.AZ - SABİT HEADER, BOTTOM NAV VƏ BİLDİRİŞLƏR
// Bu fayl bütün səhifələrə yuxarı/aşağı hissəni avtomatik əlavə edir.
// ============================================================

import { $, profile, logout, supabase, playNotifySound, notificationBodyAz } from './core.js';

// Aşağı menyu sırası: Sevimlilər, Səbət, Ana səhifə, Sifarişlərim, WhatsApp.
const bottomNav = [
  ['favorites.html', '❤️', 'Sevimlilər', 'favCount'],
  ['cart.html', '🛒', 'Səbət', 'cartCount'],
  ['index.html', 'logo', '', null],
  ['orders.html', '📦', 'Sifarişlərim', 'orderCount'],
  ['https://wa.me/994993909595', '💬', 'WhatsApp', null],
];

// Layout-un əsas başladıcı funksiyası.
export async function initLayout() {
  renderTopbar();
  renderBottomNav();
  await hydrateUserArea();
  await refreshBadges();
  subscribeNotifications();

  window.addEventListener('hideLoader', hideLoader);
  setTimeout(hideLoader, 550);
}

// Loader-i gizlədir.
function hideLoader() {
  const loader = $('#loader');
  if (loader) loader.style.display = 'none';
}

// Yuxarı sabit başlıq hissəsini yaradır.
function renderTopbar() {
  const root = getRootPath();
  const topbar = document.createElement('header');

  topbar.className = 'topbar';
  topbar.innerHTML = `
    <div class="topbar-inner">
      <a class="brand" href="${root}index.html" aria-label="Meyvəçi.az ana səhifə">
        <img src="${root}assets/img/logo/Meyveci-logo.png" alt="Meyvəçi.az" onerror="this.src='${root}assets/img/logo/Cilek-logo.png'">
      </a>

      <div class="top-actions">
        <button id="notifyBtn" class="icon-btn" title="Bildirişlər">
          🔔 <span id="notifyCount" class="badge-count hide">0</span>
        </button>

        <a id="panelLink" class="btn btn-soft hide" href="#">Panel</a>
        <a id="profileLink" class="profile-pill" href="${root}profile.html" title="Profil"><span class="profile-ico">👤</span><span id="topUserName" class="profile-name">Profil</span></a>
        <button id="logoutBtn" class="btn btn-danger hide">Çıxış</button>
      </div>

      <div id="notifyDrop" class="mini-dropdown">
        <div class="modal-head"><b>Bildirişlər</b><button id="notifyClose" class="mini-x" type="button">×</button></div>
        <div id="notifyList" class="compact-list" style="margin-top: 8px;">
          <span class="muted">Bildiriş yoxdur</span>
        </div>
      </div>
    </div>
  `;

  document.body.prepend(topbar);

  $('#notifyBtn')?.addEventListener('click', loadNotifications);
  $('#notifyClose')?.addEventListener('click', () => $('#notifyDrop')?.classList.remove('show'));
  $('#logoutBtn')?.addEventListener('click', logout);

  document.addEventListener('click', (event) => {
    const item = event.target.closest('.notify-item');
    if (item) openNotificationModal(item.dataset.title, item.dataset.body);
  });
}

// Aşağı sabit naviqasiyanı yaradır.
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
    </div>
  `;

  document.body.appendChild(nav);
}

// İstifadəçi roluna görə header-də panel linkini göstərir.
async function hydrateUserArea() {
  const activeProfile = await profile();
  const root = getRootPath();
  const panelLink = $('#panelLink');

  if (!activeProfile) return;

  $('#logoutBtn')?.classList.remove('hide');

  const fullName = `${activeProfile.first_name || ''} ${activeProfile.last_name || ''}`.trim();
  const topUserName = $('#topUserName');
  if (topUserName) topUserName.textContent = fullName || activeProfile.email || 'Profil';

  if (panelLink && activeProfile.role === 'admin') {
    panelLink.href = `${root}admin/index.html`;
    panelLink.textContent = 'Admin panel';
    panelLink.classList.remove('hide');
  }

  if (panelLink && activeProfile.role === 'courier') {
    panelLink.href = `${root}courier/index.html`;
    panelLink.textContent = 'Kuryer panel';
    panelLink.classList.remove('hide');
  }
}

// Səbət, sevimli, sifariş və bildiriş saylarını icon üstündə göstərir.
async function refreshBadges() {
  const activeProfile = await profile();
  if (!activeProfile) return;

  const [favorites, cart, orders, notifications] = await Promise.all([
    supabase.from('favorites').select('id', { count: 'exact', head: true }).eq('user_id', activeProfile.id),
    supabase.from('cart_items').select('id', { count: 'exact', head: true }).eq('user_id', activeProfile.id),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', activeProfile.id).neq('status', 'delivered'),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', activeProfile.id).eq('is_read', false),
  ]);

  setBadge('favCount', favorites.count || 0);
  setBadge('cartCount', cart.count || 0);
  setBadge('orderCount', orders.count || 0);
  setBadge('notifyCount', notifications.count || 0);
}

// Badge rəqəmini yazır və sıfırdırsa gizlədir.
function setBadge(id, count) {
  const el = $(`#${id}`);
  if (!el) return;

  el.textContent = count > 99 ? '99+' : String(count);
  el.classList.toggle('hide', count < 1);
}

// Bildiriş dropdown siyahısını yükləyir.
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
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) {
    list.innerHTML = '<span class="muted">Bildiriş yüklənmədi.</span>';
    return;
  }

  list.innerHTML = (data || []).map((item) => {
    const title = item.title || 'Bildiriş';
    const body = notificationBodyAz(item.body || '');

    return `
      <button class="compact-row notify-item" type="button" data-title="${escapeAttr(title)}" data-body="${escapeAttr(body)}">
        <span>
          <b>${title}</b><br>
          <small class="muted">${body}</small>
        </span>
        ${item.is_read ? '' : '<span class="badge-count" style="position: static;">•</span>'}
      </button>
    `;
  }).join('') || '<span class="muted">Bildiriş yoxdur.</span>';

  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', activeProfile.id)
    .eq('is_read', false);

  setBadge('notifyCount', 0);
}

// Realtime bildiriş gələndə badge artırır və səs verir.
async function subscribeNotifications() {
  const activeProfile = await profile();
  if (!activeProfile) return;

  supabase
    .channel(`notifications:${activeProfile.id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${activeProfile.id}`,
      },
      () => {
        refreshBadges();
        playNotifySound();
      }
    )
    .subscribe();
}

// Admin/kuryer qovluqlarından ana qovluğa çıxmaq üçün root path hesablayır.
function getRootPath() {
  return location.pathname.includes('/admin/') || location.pathname.includes('/courier/') ? '../' : './';
}


// Bildirişin detallı mətnini GitHub linkinə getmədən, səhifə içində modal kimi açır.
function openNotificationModal(title, body) {
  let modal = $('#notifyModal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'notifyModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-head">
          <b id="notifyModalTitle">Bildiriş</b>
          <button id="notifyModalClose" class="mini-x" type="button">×</button>
        </div>
        <p id="notifyModalBody" class="muted"></p>
      </div>
    `;
    document.body.appendChild(modal);
    $('#notifyModalClose')?.addEventListener('click', () => modal.classList.remove('show'));
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('show'); });
  }

  $('#notifyModalTitle').textContent = title || 'Bildiriş';
  $('#notifyModalBody').textContent = body || '';
  modal.classList.add('show');
}

// HTML atributlarında problem yaratmasın deyə sadə escape.
function escapeAttr(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
