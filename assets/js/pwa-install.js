// ============================================================
// MEYVƏÇİ.AZ - REAL PWA INSTALL
// Android Chrome / Edge: tətbiq kimi quraşdırma promptu.
// iPhone: sadəcə Safari təlimatı.
// ============================================================

let deferredInstallPrompt = null;

const PWA_ICON = './assets/img/logo/Cilek-logo.png';

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function createInstallButton() {
  if (document.getElementById('meyveciInstallBtn')) return;

  const btn = document.createElement('button');
  btn.id = 'meyveciInstallBtn';
  btn.className = 'meyveci-install-btn hide';
  btn.type = 'button';
  btn.innerHTML = `
    <img src="${PWA_ICON}" alt="Meyvəçi">
    <span>Tətbiqi yüklə</span>
  `;

  document.body.appendChild(btn);

  btn.addEventListener('click', handleInstallClick);
}

function showInstallButton() {
  if (isStandaloneMode()) return;
  document.getElementById('meyveciInstallBtn')?.classList.remove('hide');
}

function hideInstallButton() {
  document.getElementById('meyveciInstallBtn')?.classList.add('hide');
}

async function handleInstallClick() {
  if (isStandaloneMode()) {
    hideInstallButton();
    return;
  }

  // Android Chrome / Edge real app install pəncərəsi.
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();

    const choice = await deferredInstallPrompt.userChoice.catch(() => null);

    if (choice?.outcome === 'accepted') {
      hideInstallButton();
    }

    deferredInstallPrompt = null;
    return;
  }

  // iPhone üçün məcburi sadə izah. Android-də bu hissə işləməyəcək.
  if (isIOS()) {
    showIOSInstallModal();
  }
}

function showIOSInstallModal() {
  let modal = document.getElementById('meyveciInstallModal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'meyveciInstallModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card meyveci-install-modal">
        <div class="modal-head">
          <b>Meyvəçi tətbiq kimi açılsın</b>
          <button id="meyveciInstallModalClose" class="mini-x" type="button">×</button>
        </div>

        <div class="install-modal-body">
          <img src="${PWA_ICON}" alt="Meyvəçi">
          <p>
            iPhone-da PWA tətbiqlər Safari vasitəsilə əlavə olunur.
            Safari-də <b>Paylaş</b> düyməsinə toxun və <b>Ana ekrana əlavə et</b> seç.
            Bundan sonra Meyvəçi ayrıca tətbiq kimi açılacaq.
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('meyveciInstallModalClose')?.addEventListener('click', () => {
      modal.classList.remove('show');
    });

    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.classList.remove('show');
    });
  }

  modal.classList.add('show');
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  showInstallButton();
});

window.addEventListener('appinstalled', () => {
  hideInstallButton();
});

document.addEventListener('DOMContentLoaded', () => {
  createInstallButton();

  if (isStandaloneMode()) {
    hideInstallButton();
  }
});
