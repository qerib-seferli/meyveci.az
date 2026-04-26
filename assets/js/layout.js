// ============================================================
// MEYVƏÇİ.AZ - SABİT HEADER, BOTTOM NAV, MESAJ VƏ BİLDİRİŞLƏR
// Bu fayl bütün səhifələrə yuxarı/aşağı hissəni avtomatik əlavə edir.
// Header-də bildiriş və mesaj butonları var, kliklənəndə GitHub 404 yox, sayt içi modal açılır.
// ============================================================

import { $, profile, logout, supabase, playNotifySound, notificationBodyAz } from './core.js';

const bottomNav = [
  ['favorites.html', '❤️', 'Sevimlilər', 'favCount'],
  ['cart.html', '🛒', 'Səbət', 'cartCount'],
  ['index.html', 'logo', '', null],
  ['orders.html', '📦', 'Sifarişlərim', 'orderCount'],
  ['https://wa.me/994993909595', '💬', 'WhatsApp', null],
];

export async function initLayout() {
  renderTopbar();
  renderBottomNav();
  await hydrateUserArea();
  await refreshBadges();
  await subscribeNotifications();
  initSoundUnlock();
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
      <a class="brand" href="${root}index.html" aria-label="Meyvəçi.az ana səhifə">
        <img src="${root}assets/img/logo/Meyveci-logo.png" alt="Meyvəçi.az" onerror="this.src='${root}assets/img/logo/Cilek-logo.png'">
      </a>

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
  const topUserName = $('#topUserName');
  if (topUserName) topUserName.textContent = (activeProfile.first_name || '').trim() || activeProfile.email || 'Profil';

  if (panelLink && activeProfile.role === 'admin') {
    panelLink.href = `${root}admin/index.html`;
    panelLink.textContent = 'Admin panel';
    panelLink.classList.remove('hide');
    $('#adminOrdersBtn')?.classList.remove('hide');
  }
  if (panelLink && activeProfile.role === 'courier') {
    panelLink.href = `${root}courier/index.html`;
    panelLink.textContent = 'Kuryer panel';
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
    .order('created_at', { ascending: false })
    .limit(16);

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
          <small class="muted">${body}</small><br>
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
                const item = payload.new;
        
                refreshBadges();
                playNotifySound();
        
                if (item?.title === 'Yeni mesaj') {
                  showRealtimeToast('💬 Yeni mesaj', notificationBodyAz(item.body || 'Sizə yeni mesaj gəldi.'));
                } else {
                  showRealtimeToast(item?.title || 'Yeni bildiriş', notificationBodyAz(item?.body || 'Yeni bildiriş gəldi.'));
                }
              }
            )
            .on(
              'postgres_changes',
              {
                event: 'UPDATE',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${activeProfile.id}`,
              },
              () => {
                refreshBadges();
              }
            )
            .subscribe();
        
          if (activeProfile.role === 'admin' || activeProfile.role === 'courier') {
            supabase
              .channel(`orders-badge-live-${activeProfile.id}`)
              .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                  refreshBadges();
                }
              )
              .subscribe();
          }
        
          supabase
            .channel(`chat-badge-live-${activeProfile.id}`)
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'chat_messages' },
              () => {
                refreshBadges();
              }
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

function getRootPath() {
  return location.pathname.includes('/admin/') || location.pathname.includes('/courier/') ? '../' : './';
}

function escapeAttr(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
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

function initSoundUnlock() {
  const unlock = () => {
    playNotifySound();
    document.removeEventListener('click', unlock);
    document.removeEventListener('touchstart', unlock);
  };

  document.addEventListener('click', unlock, { once: true });
  document.addEventListener('touchstart', unlock, { once: true });
}
