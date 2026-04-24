# Meyvəçi.az Fast Core

Minimal və sürətli HTML/CSS/JS + Supabase layihəsi.

## Quraşdırma
1. Supabase SQL Editor-də `sql/supabase-core.sql` faylını run et.
2. `assets/js/supabase.js` içində URL/anon key yoxla.
3. GitHub Pages-ə yüklə.
4. İlk admin üçün:
```sql
update public.profiles set role='admin', is_active=true where email='meyveci@proton.me';
```


## 24.04 düzəliş paketi

Bu paketdə aşağıdakılar düzəldildi:
- Admin məhsul/kateqoriya əlavə-redaktə-silmə üçün RLS/SQL düzəlişi əlavə edildi.
- İstifadəçi rol dəyişəndə `id=undefined` errorunun qarşısını alan guard əlavə edildi.
- Bildirişlər artıq GitHub/404 linkinə getmir, səhifə içində modal pəncərə kimi açılır.
- Status bildirişləri Azərbaycan dilinə çevrildi.
- WhatsApp nömrəsi `+994993909595` olaraq yeniləndi.
- Kuryer panelə daxil olanda avtomatik online olur və lokasiya icazəsi istəyir.
- Checkout zamanı istifadəçidən lokasiya icazəsi istənir.
- Sevimli ürək aktiv/passiv vəziyyəti daha düzgün göstərilir.
- Mobil ölçülər, iconlar, alt/yuxarı nav daha minimalist balanslandı.
- `assets/img/icons/` qovluğuna kuryer, ev və sifariş status ikonları əlavə edildi.

Supabase-də əlavə run ediləcək fayl:
`sql/supabase-fast-core-upgrade-v2.sql`
