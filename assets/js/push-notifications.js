// ============================================================
// MEYVƏÇİ.AZ - PUSH SUBSCRIPTION
// İstifadəçinin cihazını push_subscriptions cədvəlinə yazır.
// ============================================================

import { supabase, profile, toast } from './core.js';

const VAPID_PUBLIC_KEY = 'BCMrpWdiv-Ifa7qoprpeV4hPRTT-UfFCHy7ELAsVgYd13hN8T3MFCHM6cidH_4d75_iMaIUdVnl1ExMVhUhDGGg';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  return await navigator.serviceWorker.register('./sw.js', {
    scope: './'
  });
}

async function savePushSubscription(subscription) {
  const activeProfile = await profile();
  if (!activeProfile || !subscription) return;

  const json = subscription.toJSON();

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: activeProfile.id,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
      is_active: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'endpoint'
    });

  if (error) {
    console.warn('Push subscription yazılmadı:', error.message);
  }
}

async function enablePush() {
  const activeProfile = await profile();
  if (!activeProfile) return;

  if (VAPID_PUBLIC_KEY === 'BCMrpWdiv-Ifa7qoprpeV4hPRTT-UfFCHy7ELAsVgYd13hN8T3MFCHM6cidH_4d75_iMaIUdVnl1ExMVhUhDGGg') {
    console.warn('VAPID_PUBLIC_KEY yazılmayıb.');
    return;
  }

  if (!('Notification' in window)) return;

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

  if (permission !== 'granted') {
    if (permission === 'denied') {
      toast('Bildiriş icazəsi bağlıdır. Brauzer ayarlarından icazə verin.');
    }
    return;
  }

  const registration = await registerServiceWorker();
  if (!registration || !registration.pushManager) return;

  const existing = await registration.pushManager.getSubscription();

  if (existing) {
    await savePushSubscription(existing);
    return;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });

  await savePushSubscription(subscription);
}

async function updateAppBadge() {
  const activeProfile = await profile();
  if (!activeProfile) return;

  const [{ count: notifyCount }, { count: messageCount }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', activeProfile.id)
      .eq('is_read', false)
      .neq('title', 'Yeni mesaj'),

    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', activeProfile.id)
      .eq('is_read', false)
      .eq('title', 'Yeni mesaj')
  ]);

  const total = Number(notifyCount || 0) + Number(messageCount || 0);

  try {
    if (total > 0 && 'setAppBadge' in navigator) {
      await navigator.setAppBadge(total);
    }

    if (total < 1 && 'clearAppBadge' in navigator) {
      await navigator.clearAppBadge();
    }
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', async () => {
  await registerServiceWorker();

  setTimeout(() => {
    enablePush();
    updateAppBadge();
  }, 1600);

  window.addEventListener('focus', updateAppBadge);
});
