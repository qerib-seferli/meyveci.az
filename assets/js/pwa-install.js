// ============================================================
// MEYVƏÇİ.AZ - PWA INSTALL BUTTON
// Android Chrome/Edge install prompt + iPhone Safari təlimatı.
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

function isSafari() {
  return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(window.navigator.userAgent);
}

function shouldHideInstallButton() {
  return isStandaloneMode() || localStorage.getItem('meyveci_pwa_installed') === '1';
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
  const btn = document.getElementById('meyveciInstallBtn');
  if (!btn || shouldHideInstallButton()) return;
  btn.classList.remove('hide');
}

function hideInstallButton() {
  document.getElementById('meyveciInstallBtn')?.classList.add('hide');
}

async function handleInstallClick() {
  if (shouldHideInstallButton()) {
    hideInstallButton();
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();

    const choice = await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;

    if (choice?.outcome === 'accepted') {
      localStorage.setItem('meyveci_pwa_installed', '1');
      hideInstallButton();
    }

    return;
  }

  if (isIOS()) {
    showIOSInstallModal();
    return;
  }

  showGenericInstallModal();
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
          <b>Meyvəçi tətbiqini yüklə</b>
          <button id="meyveciInstallModalClose" class="mini-x" type="button">×</button>
        </div>

        <div class="install-modal-body">
          <img src="${PWA_ICON}" alt="Meyvəçi">
          <p>
            iPhone-da tətbiq kimi istifadə etmək üçün Safari brauzerində:
            <br><b>Paylaş</b> düyməsinə toxun → <b>Ana ekrana əlavə et</b>.
          </p>
          <small class="muted">
            Chrome/Edge iPhone-da birbaşa install pəncərəsi açmır.
          </small>
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

function showGenericInstallModal() {
  let modal = document.getElementById('meyveciInstallModal');

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'meyveciInstallModal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card meyveci-install-modal">
        <div class="modal-head">
          <b>Tətbiqi yüklə</b>
          <button id="meyveciInstallModalClose" class="mini-x" type="button">×</button>
        </div>

        <div class="install-modal-body">
          <img src="${PWA_ICON}" alt="Meyvəçi">
          <p>
            Brauzer hələ install icazəsini hazır etməyib.
            Bir neçə saniyə sonra yenidən yoxlayın və ya brauzer menyusundan
            <b>Ana ekrana əlavə et</b> seçin.
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

  if (!shouldHideInstallButton()) {
    showInstallButton();
  }
});

window.addEventListener('appinstalled', () => {
  localStorage.setItem('meyveci_pwa_installed', '1');
  hideInstallButton();
});

document.addEventListener('DOMContentLoaded', () => {
  createInstallButton();

  if (isStandaloneMode()) {
    localStorage.setItem('meyveci_pwa_installed', '1');
    hideInstallButton();
    return;
  }

  if (isIOS() && isSafari() && !shouldHideInstallButton()) {
    showInstallButton();
  }

  setTimeout(() => {
    if (deferredInstallPrompt && !shouldHideInstallButton()) {
      showInstallButton();
    }
  }, 1200);
});
