// ============================================================
// MEYVƏÇİ.AZ - ÜMUMİ KÖMƏKÇİ FUNKSİYALAR
// Bu fayl bütün səhifələrdə istifadə olunan qısa funksiyaları saxlayır.
// ============================================================

import { supabase } from './supabase.js';

export { supabase };

// DOM elementini seçmək üçün qısa köməkçi.
export const $ = (selector, root = document) => root.querySelector(selector);

// Bir neçə DOM elementi seçmək üçün qısa köməkçi.
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

// Saytda məhsul şəkli boş olanda göstərilən placeholder.
export const PLACEHOLDER = pagePath('assets/img/placeholders/product-placeholder.png');

// Session və profil məlumatını təkrar sorğu atmamaq üçün yaddaşda saxlayırıq.
const cache = {
  session: undefined,
  profile: undefined,
};

// Qiyməti AZN formatında göstərir.
export function money(value) {
  return `${Number(value || 0).toFixed(2)} AZN`;
}

// Kiçik bildiriş/toast göstərir.
export function toast(message) {
  message = friendlyError(message);
  let toastBox = $('#toast');

  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.id = 'toast';
    toastBox.className = 'toast';
    document.body.appendChild(toastBox);
  }

  toastBox.textContent = message;
  toastBox.classList.add('show');

  setTimeout(() => toastBox.classList.remove('show'), 2800);
}


// Texniki Supabase/GitHub xətalarını istifadəçiyə sadə dildə göstərir.
// Test mərhələsində xətanın real mətnini də göstəririk ki, hansı cədvəldə problem olduğunu tapaq.
export function friendlyError(message) {
  const text = String(message || 'Əməliyyat tamamlanmadı');

  if (text.includes('403') || text.toLowerCase().includes('row-level security')) {
    console.error('Supabase icazə/RLS xətası:', text);
    return `Bu əməliyyat üçün icazə yoxdur. Texniki xəta: ${text}`;
  }

  if (text.includes('404') || text.toLowerCase().includes('not found')) {
    return 'Məlumat və ya şəkil yolu tapılmadı.';
  }

  if (text.toLowerCase().includes('failed to fetch')) {
    return 'Serverlə bağlantı alınmadı. İnterneti və Supabase ayarlarını yoxlayın.';
  }

  if (text.includes('duplicate key')) {
    return 'Bu məlumat artıq mövcuddur.';
  }

  if (text.includes('assigned_by') || text.includes('courier_assignments')) {
    return 'Kuryer təyinat cədvəli yenilənməyib. SQL v4 faylını Supabase-də run edin.';
  }

  if (text.includes('undefined')) {
    return 'Seçilən məlumat tapılmadı. Səhifəni yeniləyib təkrar yoxlayın.';
  }

  return text;
}


// URL-dən id parametrini oxuyur: product.html?id=...
export function byId() {
  return new URLSearchParams(location.search).get('id');
}

// Hazır auth session məlumatını gətirir.
export async function session(force = false) {
  if (cache.session !== undefined && !force) return cache.session;

  const { data } = await supabase.auth.getSession();
  cache.session = data.session || null;

  return cache.session;
}

// Hazır istifadəçini gətirir.
export async function user() {
  const activeSession = await session();
  return activeSession?.user || null;
}

// Login olmuş istifadəçinin profilini gətirir.
export async function profile(force = false) {
  if (cache.profile !== undefined && !force) return cache.profile;

  const activeUser = await user();

  if (!activeUser) {
    cache.profile = null;
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', activeUser.id)
    .maybeSingle();

  if (error) {
    console.warn('Profil oxunmadı:', error.message);
    cache.profile = null;
    return null;
  }

  cache.profile = data;
  sessionStorage.setItem('mc_role', data?.role || 'user');

  return data;
}

// Səhifə yalnız login olmuş istifadəçilər üçündürsə yoxlama edir.
export async function requireAuth() {
  const activeUser = await user();

  if (!activeUser) {
    location.href = pagePath('login.html');
    return null;
  }

  return activeUser;
}

// Səhifə yalnız müəyyən rol üçündürsə yoxlama edir.
export async function requireRole(role) {
  const activeProfile = await profile(true);

  if (!activeProfile || activeProfile.role !== role) {
    toast('Bu bölməyə giriş icazəniz yoxdur');
    setTimeout(() => {
      location.href = pagePath('index.html');
    }, 900);
    return null;
  }

  return activeProfile;
}

// Hesabdan çıxış edir.
export async function logout() {
  await supabase.auth.signOut();
  sessionStorage.clear();
  localStorage.removeItem('mc_notify_sound_ok');
  location.href = pagePath('index.html');
}

// Loader-i açıb-bağlamaq üçün istifadə olunur.
export function setLoading(isVisible = false) {
  const loader = $('#loader');
  if (loader) loader.style.display = isVisible ? 'grid' : 'none';
}

// Statusları Azərbaycan dilində göstərir.
export function statusAz(status) {
  const statuses = {
    pending: 'Gözləyir',
    confirmed: 'Təsdiqləndi',
    preparing: 'Hazırlanır',
    on_the_way: 'Kuryerə verildi',
    courier_near: 'Kuryer yaxınlaşır',
    delivered: 'Təhvil verildi',
    cancelled: 'Ləğv edildi',
    paid: 'Ödənildi',
    rejected: 'Rədd edildi',
    approved: 'Təsdiqləndi',
    refunded: 'Geri qaytarıldı',
  };

  return statuses[status] || status || '—';
}

// Alt qovluqlardakı səhifələr üçün doğru fayl yolu düzəldir.
export function pagePath(path) {
  const isSubPage = location.pathname.includes('/admin/') || location.pathname.includes('/courier/');
  return `${isSubPage ? '../' : './'}${path}`;
}

// Mətn dəyərini slug formatına çevirir.
export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll('ə', 'e')
    .replaceAll('ö', 'o')
    .replaceAll('ü', 'u')
    .replaceAll('ı', 'i')
    .replaceAll('ğ', 'g')
    .replaceAll('ş', 's')
    .replaceAll('ç', 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Form inputlarını obyektə çevirir.
export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// Faylı Supabase Storage bucket-inə yükləyir və public URL qaytarır.
export async function uploadFile(bucket, file, pathPrefix = 'uploads') {
  if (!file || !file.name) return null;

  const extension = file.name.split('.').pop();
  const filePath = `${pathPrefix}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, { upsert: true });

  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(filePath).data.publicUrl;
}

// Səsli bildiriş üçün Meyvəçi.az-a məxsus yumşaq iki tonlu beep.
// Qeyd: telefon brauzerləri səsi yalnız istifadəçi səhifəyə toxunandan sonra buraxır.
let notifyAudioContext = null;
function getNotifyAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!notifyAudioContext) notifyAudioContext = new AudioContext();
  if (notifyAudioContext.state === "suspended") notifyAudioContext.resume().catch(() => {});
  return notifyAudioContext;
}
document.addEventListener("pointerdown", () => getNotifyAudioContext(), { once: true });
export function playNotifySound() {
  try {
    const audio = getNotifyAudioContext();
    if (!audio) return;
    [660, 920].forEach((freq, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = freq;
      oscillator.connect(gain);
      gain.connect(audio.destination);
      const start = audio.currentTime + index * 0.13;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
  } catch (error) {
    console.warn("Səsli bildiriş işləmədi:", error.message);
  }
}


// Bildiriş mətnlərinin içində qalan texniki status sözlərini Azərbaycan dilinə çevirir.
export function notificationBodyAz(value) {
  let text = String(value || '');
  const map = {
    pending: 'Gözləyir',
    confirmed: 'Təsdiqləndi',
    preparing: 'Hazırlanır',
    on_the_way: 'Kuryerə təhvil verildi',
    courier_near: 'Kuryer yaxınlaşır',
    delivered: 'Məhsullar təhvil verildi',
    cancelled: 'Ləğv edildi',
    paid: 'Ödənildi',
    approved: 'Təsdiqləndi',
    rejected: 'Rədd edildi',
    refunded: 'Geri qaytarıldı',
  };
  Object.entries(map).forEach(([key, label]) => { text = text.replaceAll(key, label); });
  return text;
}

// Telefonlarda/icazəli brauzerlərdə lokasiya istəmək üçün ortaq funksiya.
export function askLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 7000, timeout: 15000 }
    );
  });
}


//======================================================================================

export async function updateMyPresence(isOnline = true) {
  const activeUser = await user();
  if (!activeUser) return;

  await supabase
    .from('profiles')
    .update({
      last_seen: new Date().toISOString(),
      is_online: isOnline,
    })
    .eq('id', activeUser.id);
}

//=======================================================================================
