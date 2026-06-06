// ============================================================
// MEYVƏÇİ.AZ - AUTH FUNKSİYALARI
// Telefon OTP, email login, qeydiyyat, forgot və reset password.
// ============================================================

import { $, supabase, toast, formData } from './core.js';
import { initLayout } from './layout.js';

let pendingOtpPhone = '';

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  const page = document.body.dataset.page;

  if (page === 'login') initLogin();
  if (page === 'register') initRegister();
  if (page === 'forgot') initForgot();
  if (page === 'reset') initReset();
});

function initLogin() {
  initAuthTabs();

  $('#phoneLoginForm')?.addEventListener('submit', sendPhoneOtp);
  $('#otpVerifyForm')?.addEventListener('submit', verifyPhoneOtp);

  $('#changePhoneBtn')?.addEventListener('click', () => {
    pendingOtpPhone = '';
    $('#otpVerifyForm').hidden = true;
    $('#otpVerifyForm')?.classList.remove('active');
    $('#phoneLoginForm')?.classList.add('active');
    $('#phoneLoginForm').hidden = false;
    $('#otpCodeInput').value = '';
  });

  $('#loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = formData(event.target);

    if (!data.email || !data.password) {
      return toast('Email və şifrə yazın');
    }

    const { data: loginData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      return toast(error.message === 'Email not confirmed' ? 'Email təsdiqlənməyib' : error.message);
    }

    await ensureProfile(loginData?.user);
    await redirectAfterLogin(loginData?.user);
  });
}

function initAuthTabs() {
  const tabs = document.querySelectorAll('.auth-tab');
  const phonePanel = $('#phoneLoginForm');
  const emailPanel = $('#loginForm');
  const otpPanel = $('#otpVerifyForm');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.authTab;

      tabs.forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');

      phonePanel?.classList.toggle('active', target === 'phone');
      emailPanel?.classList.toggle('active', target === 'email');

      if (target === 'phone') {
        phonePanel.hidden = false;
        emailPanel.hidden = true;

        if (pendingOtpPhone) {
          otpPanel.hidden = false;
          otpPanel.classList.add('active');
          phonePanel.classList.remove('active');
          phonePanel.hidden = true;
        }
      }

      if (target === 'email') {
        emailPanel.hidden = false;
        phonePanel.hidden = true;
        otpPanel.hidden = true;
        otpPanel.classList.remove('active');
      }
    });
  });

  if (emailPanel) emailPanel.hidden = true;
}

async function sendPhoneOtp(event) {
  event.preventDefault();

  const button = $('#sendOtpBtn');
  const phone = normalizePhone($('#phoneNumberInput')?.value, $('#phoneCountry')?.value || '+994');

  if (!phone) {
    return toast('Telefon nömrəsini düzgün yazın');
  }

  try {
    button.disabled = true;
    button.textContent = 'Kod göndərilir...';

    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        data: {
          phone,
          role: 'user',
          provider: 'phone',
        },
      },
    });

    if (error) throw error;

    pendingOtpPhone = phone;

    $('#phoneLoginForm').hidden = true;
    $('#phoneLoginForm')?.classList.remove('active');

    $('#otpVerifyForm').hidden = false;
    $('#otpVerifyForm')?.classList.add('active');
    $('#otpCodeInput')?.focus();

    toast('SMS kod göndərildi');
  } catch (error) {
    toast(authErrorAz(error.message));
  } finally {
    button.disabled = false;
    button.textContent = 'SMS kod göndər';
  }
}

async function verifyPhoneOtp(event) {
  event.preventDefault();

  const button = $('#verifyOtpBtn');
  const code = String($('#otpCodeInput')?.value || '').trim();

  if (!pendingOtpPhone) {
    return toast('Əvvəl telefon nömrəsini yazın');
  }

  if (!/^\d{6}$/.test(code)) {
    return toast('6 rəqəmli SMS kodu yazın');
  }

  try {
    button.disabled = true;
    button.textContent = 'Yoxlanılır...';

    const { data, error } = await supabase.auth.verifyOtp({
      phone: pendingOtpPhone,
      token: code,
      type: 'sms',
    });

    if (error) throw error;

    await ensureProfile(data?.user, { phone: pendingOtpPhone });
    toast('Giriş uğurludur');

    setTimeout(() => {
      location.href = './profile.html';
    }, 500);
  } catch (error) {
    toast(authErrorAz(error.message));
  } finally {
    button.disabled = false;
    button.textContent = 'Kodu təsdiqlə';
  }
}

function normalizePhone(value, countryCode = '+994') {
  let raw = String(value || '').trim();

  if (!raw) return '';

  raw = raw
    .replaceAll(' ', '')
    .replaceAll('-', '')
    .replaceAll('(', '')
    .replaceAll(')', '');

  if (raw.startsWith('00')) raw = `+${raw.slice(2)}`;

  if (raw.startsWith('+')) {
    const cleaned = `+${raw.replace(/\D/g, '')}`;
    return cleaned.length >= 10 ? cleaned : '';
  }

  raw = raw.replace(/\D/g, '');

  if (countryCode === '+994') {
    if (raw.startsWith('994')) raw = raw.slice(3);
    if (raw.startsWith('0')) raw = raw.slice(1);

    if (!/^(50|51|55|70|77|99|10|60)\d{7}$/.test(raw)) {
      return '';
    }

    return `+994${raw}`;
  }

  if (raw.startsWith('0')) raw = raw.slice(1);

  return `${countryCode}${raw}`;
}

async function ensureProfile(user, extra = {}) {
  if (!user?.id) return null;

  const fullName =
    user.user_metadata?.full_name ||
    `${user.user_metadata?.first_name || ''} ${user.user_metadata?.last_name || ''}`.trim();

  const insertData = {
    id: user.id,
    email: user.email || null,
    phone: extra.phone || user.phone || user.user_metadata?.phone || null,
    first_name: user.user_metadata?.first_name || null,
    last_name: user.user_metadata?.last_name || null,
    role: user.user_metadata?.role || 'user',
    is_online: true,
    last_seen: new Date().toISOString(),
  };

  if (fullName && !insertData.first_name) {
    insertData.first_name = fullName.split(' ')[0] || null;
    insertData.last_name = fullName.split(' ').slice(1).join(' ') || null;
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('id,role')
    .eq('id', user.id)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from('profiles')
      .update({
        email: insertData.email,
        phone: insertData.phone,
        is_online: true,
        last_seen: new Date().toISOString(),
      })
      .eq('id', user.id);

    return existing;
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert(insertData)
    .select('id,role')
    .maybeSingle();

  if (error) {
    console.warn('Profil yaradılmadı:', error.message);
    return null;
  }

  return data;
}

async function redirectAfterLogin(user) {
  if (!user?.id) {
    location.href = './profile.html';
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role === 'admin') location.href = './admin/index.html';
  else if (profile?.role === 'courier') location.href = './courier/index.html';
  else if (profile?.role === 'warehouse') location.href = './warehouse/index.html';
  else location.href = './profile.html';
}

function initRegister() {
  $('#registerForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = formData(event.target);

    if (data.password !== data.password2) {
      return toast('Şifrələr eyni deyil');
    }

    const phone = data.phone ? normalizePhone(data.phone, '+994') : '';

    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          first_name: data.first_name,
          last_name: data.last_name,
          phone,
          role: 'user',
        },
      },
    });

    if (error) return toast(error.message);

    await ensureProfile(signUpData?.user, { phone });

    toast('Qeydiyyat tamamlandı. Email təsdiqi aktivdirsə, emailinizi yoxlayın.');
    setTimeout(() => location.href = './login.html', 1200);
  });
}

function initForgot() {
  $('#forgotForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = formData(event.target);
    const redirectTo = 'https://meyveci.az/reset-password.html';

    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo,
    });

    if (error) return toast(error.message);

    toast('Şifrə yeniləmə linki email ünvanınıza göndərildi. Zəhmət olmasa emailinizi yoxlayın.');
  });
}

function initReset() {
  $('#resetForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = formData(event.target);

    if (!data.password || data.password.length < 6) {
      return toast('Şifrə ən azı 6 simvol olmalıdır');
    }

    if (data.password !== data.password2) {
      return toast('Şifrələr eyni deyil');
    }

    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData?.session) {
      return toast('Şifrə yeniləmə sessiyası tapılmadı. Zəhmət olmasa emaildəki linkə yenidən daxil olun.');
    }

    const { error } = await supabase.auth.updateUser({
      password: data.password,
    });

    if (error) return toast(error.message);

    toast('Şifrə uğurla yeniləndi. İndi giriş edə bilərsiniz.');

    setTimeout(() => {
      location.href = './login.html';
    }, 1200);
  });
}

function authErrorAz(message = '') {
  const text = String(message || '');

  if (text.toLowerCase().includes('invalid login credentials')) {
    return 'Email və ya şifrə yanlışdır';
  }

  if (text.toLowerCase().includes('token has expired')) {
    return 'SMS kodun vaxtı bitib. Yenidən kod göndərin';
  }

  if (text.toLowerCase().includes('invalid token')) {
    return 'SMS kod yanlışdır';
  }

  if (text.toLowerCase().includes('sms')) {
    return `SMS göndərilmədi: ${text}`;
  }

  return text || 'Əməliyyat tamamlanmadı';
}
