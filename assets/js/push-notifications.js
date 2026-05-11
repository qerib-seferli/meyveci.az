import { supabase, profile, toast } from './core.js';

const VAPID_PUBLIC_KEY =
  'BCMrpWdiv-Ifa7qoprpeV4hPRTT-UfFCHy7ELAsVgYd13hN8T3MFCHM6cidH_4d75_iMaIUdVnl1ExMVhUhDGGg';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  return await navigator.serviceWorker.register('./sw.js', { scope: './' });
}

async function saveSubscription(subscription) {
  const activeProfile = await profile();
  if (!activeProfile || !subscription) return;

  const json = subscription.toJSON();

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: activeProfile.id,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    console.warn('Push subscription yazılmadı:', error.message);
    toast('Bildiriş cihazı qeyd olunmadı.');
  } else {
    toast('Bildirişlər aktiv edildi.');
  }
}

async function enablePush() {
  const activeProfile = await profile();
  if (!activeProfile) {
    toast('Bildiriş üçün əvvəlcə hesaba daxil olun.');
    return;
  }

  if (!('Notification' in window)) {
    toast('Bu brauzer bildirişi dəstəkləmir.');
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    toast('Bildiriş icazəsi verilmədi.');
    return;
  }

  const registration = await registerServiceWorker();
  if (!registration?.pushManager) {
    toast('Push sistemi bu brauzerdə aktiv deyil.');
    return;
  }

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  await saveSubscription(subscription);
  hidePushButton();
}

function createPushButton() {
  if (document.getElementById('enablePushBtn')) return;

  const btn = document.createElement('button');
  btn.id = 'enablePushBtn';
  btn.className = 'meyveci-push-btn hide';
  btn.type = 'button';
  btn.innerHTML = '🔔 Bildirişləri aktiv et';

  document.body.appendChild(btn);
  btn.addEventListener('click', enablePush);
}

function showPushButton() {
  document.getElementById('enablePushBtn')?.classList.remove('hide');
}

function hidePushButton() {
  document.getElementById('enablePushBtn')?.classList.add('hide');
}

document.addEventListener('DOMContentLoaded', async () => {
  await registerServiceWorker();
  createPushButton();

  const activeProfile = await profile();
  if (!activeProfile) return;

  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();

    if (existing) {
      await saveSubscription(existing);
      hidePushButton();
    } else {
      showPushButton();
    }

    return;
  }

  if (Notification.permission === 'default') {
    showPushButton();
  }
});
