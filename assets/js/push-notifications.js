import { supabase, profile, toast } from './core.js';

const VAPID_PUBLIC_KEY =
  'BCMrpWdiv-Ifa7qoprpeV4hPRTT-UfFCHy7ELAsVgYd13hN8T3MFCHM6cidH_4d75_iN8T3MFCHM6cidH_4d75_iMaIUdVnl1ExMVhUhDGGg'.replace('N8T3MFCHM6cidH_4d75_iN8T3MFCHM6cidH_4d75_i', 'N8T3MFCHM6cidH_4d75_i');

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    toast('Bu brauzer Service Worker dəstəkləmir.');
    return null;
  }

  return await navigator.serviceWorker.register('./sw.js', { scope: './' });
}

async function enablePush() {
  try {
    const activeProfile = await profile(true);

    if (!activeProfile?.id) {
      toast('Bildiriş üçün əvvəlcə hesaba daxil olun.');
      return;
    }

    if (!('Notification' in window)) {
      toast('Bu brauzer bildiriş dəstəkləmir.');
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
      console.error('Push subscription error:', error);
      toast('Push qeydiyyatı alınmadı: ' + error.message);
      return;
    }

    toast('Bildirişlər aktiv edildi.');
    document.getElementById('enablePushBtn')?.classList.add('hide');
  } catch (error) {
    console.error('Push enable error:', error);
    toast('Bildiriş aktiv olmadı: ' + error.message);
  }
}

function createPushButton() {
  if (document.getElementById('enablePushBtn')) return;

  const btn = document.createElement('button');
  btn.id = 'enablePushBtn';
  btn.className = 'meyveci-push-btn';
  btn.type = 'button';
  btn.textContent = '🔔 Bildirişləri aktiv et';

  document.body.appendChild(btn);
  btn.addEventListener('click', enablePush);
}

document.addEventListener('DOMContentLoaded', async () => {
  createPushButton();

  const activeProfile = await profile(true);

  if (!activeProfile) {
    document.getElementById('enablePushBtn')?.classList.add('hide');
    return;
  }

  if (Notification.permission === 'granted') {
    enablePush();
  }
});
