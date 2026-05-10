// ============================================================
// MEYVƏÇİ.AZ - WEB PUSH NOTIFICATIONS
// Push subscription Supabase-də saxlanılır.
// ============================================================

import { supabase, profile, toast } from './core.js';

const VAPID_PUBLIC_KEY = 'BURAYA_VAPID_PUBLIC_KEY_YAZILACAQ';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  const registration = await navigator.serviceWorker.register('./sw.js', {
    scope: './'
  });

  return registration;
}

async function askNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  return await Notification.requestPermission();
}

async function savePushSubscription(subscription) {
  const activeProfile = await profile();
  if (!activeProfile || !subscription) return;

  const sub = subscription.toJSON();

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: activeProfile.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys?.p256dh,
      auth: sub.keys?.auth,
      user_agent: navigator.userAgent,
      is_active: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'endpoint'
    });

  if (error) {
    console.warn('Push subscription saxlanmadı:', error.message);
  }
}

async function subscribeToPush() {
  const activeProfile = await profile();
  if (!activeProfile) return;

  if (VAPID_PUBLIC_KEY === 'BURAYA_VAPID_PUBLIC_KEY_YAZILACAQ') {
    console.warn('VAPID_PUBLIC_KEY hələ yazılmayıb.');
    return;
  }

  const permission = await askNotificationPermission();

  if (permission !== 'granted') {
    if (permission === 'denied') {
      toast('Bildiriş icazəsi bağlıdır. Brauzer ayarlarından icazə verin.');
    }
    return;
  }

  const registration = await registerServiceWorker();
  if (!registration) return;

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

async function updateAppBadgeFromUnread() {
  if (!('setAppBadge' in navigator) && !('clearAppBadge' in navigator)) return;

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
    } else if ('clearAppBadge' in navigator) {
      await navigator.clearAppBadge();
    }
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', async () => {
  await registerServiceWorker();

  // Login olan istifadəçidə push subscription avtomatik yoxlanır.
  // İcazə pəncərəsi yalnız brauzer icazə istəyəndə çıxacaq.
  setTimeout(() => {
    subscribeToPush();
    updateAppBadgeFromUnread();
  }, 1800);

  window.addEventListener('focus', updateAppBadgeFromUnread);
});
