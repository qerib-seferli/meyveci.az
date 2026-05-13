// ============================================================
// MEYVƏÇİ.AZ - AUTH FUNKSİYALARI
// Login, qeydiyyat, forgot password və reset password buradan idarə olunur.
// ============================================================

import { $, supabase, toast, formData } from './core.js';
import { initLayout } from './layout.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initLayout();

  const page = document.body.dataset.page;

  if (page === 'login') initLogin();
  if (page === 'register') initRegister();
  if (page === 'forgot') initForgot();
  if (page === 'reset') initReset();
});

function initLogin() {
  $('#loginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = formData(event.target);

    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      return toast(error.message === 'Email not confirmed' ? 'Email təsdiqlənməyib' : error.message);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('email', data.email)
      .maybeSingle();

    if (profile?.role === 'admin') location.href = './admin/index.html';
    else if (profile?.role === 'courier') location.href = './courier/index.html';
    else location.href = './index.html';
  });
}

function initRegister() {
  $('#registerForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = formData(event.target);

    if (data.password !== data.password2) {
      return toast('Şifrələr eyni deyil');
    }

    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          first_name: data.first_name,
          last_name: data.last_name,
          phone: data.phone,
        },
      },
    });

    if (error) return toast(error.message);

    toast('Qeydiyyat tamamlandı. Giriş edə bilərsiniz.');
    setTimeout(() => location.href = './login.html', 900);
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
