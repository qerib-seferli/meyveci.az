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

## V3 düzəliş qeydləri

Dəyişdirilən əsas fayllar:

- `assets/js/layout.js` — yuxarı header-ə ayrıca mesaj butonu əlavə edildi, bildiriş modalı tarix/saat ilə düzəldildi, istifadəçi adında yalnız ad göstərildi.
- `assets/js/shop.js` — banner, xəbər və partnyor kartları yenidən quruldu; xəbərlər səhifədən çıxmadan modalda açılır.
- `assets/js/user.js` — sevimlilər kartları ana səhifə məhsul kartı ilə eyniləşdirildi; sifariş status ikonları, canlı xəritə önizləməsi və mesaj tarix/saatı əlavə edildi.
- `assets/js/admin.js` — kuryer təyin etmə RPC çağırışı `p_note` ilə sabitləşdirildi.
- `assets/js/core.js` — bildiriş/mesaj üçün iki tonlu xüsusi səs sistemi əlavə edildi.
- `assets/css/style.css` — mobil balans, banner/xəbər/partnyor ölçüləri, modal, status ikonları, xəritə markerləri və səbət ümumi məbləğ görünüşü yeniləndi.
- `cart.html` — checkout formuna mobil yığcam sinif əlavə edildi.
- `sql/supabase-fast-core-upgrade-v3.sql` — kuryer təyin etmə overload xətası, mesaj bildirişləri və icazələr üçün SQL düzəlişi əlavə edildi.

Vacib: Supabase-də mütləq `sql/supabase-fast-core-upgrade-v3.sql` faylını run et.

## V4 düzəlişləri

Supabase-də əlavə olaraq `sql/supabase-fast-core-upgrade-v4.sql` faylını run et.

Dəyişilən əsas fayllar:

- `assets/js/shop.js` — ana səhifədə xəbər modalını bloklayan selector səhvi düzəldildi; buna görə index-də kataloq/məhsul/partnyor renderi dayanmayacaq.
- `assets/js/admin.js` — sifarişdə kuryer seçimi yalnız hazırda aktiv courier rolunda olan şəxsləri göstərir; statuslara rəngli badge və icon əlavə edildi; rol courier-dən çıxanda couriers qeydi passiv edilir.
- `assets/js/layout.js` — admin üçün yuxarıda yeni sifariş iconu əlavə edildi; bildiriş və yeni sifariş sayı realtime yenilənir; istifadəçi sifariş sayı yalnız aktiv sifarişləri sayır.
- `assets/css/admin.css` — admin menyusu soldan yox, yuxarıda soldan-sağa düzülür; status rəngləri əlavə edildi.
- `assets/css/style.css` — banner daha nazik/uzun edildi; banner/xəbər/partnyor kart ölçüləri balanslandı; mobil ölçülər yığcamlaşdırıldı.
- `assets/img/icons/Legv-edildi-icon.png` — ləğv edilmiş sifariş iconu əlavə edildi.
- `sql/supabase-fast-core-upgrade-v4.sql` — kuryer təyin etmə funksiyası, `courier_assignments.assigned_by` sütunu və yeni sifariş admin bildirişi düzəldildi.

Qeyd: Kuryer təyin etmə xətası SQL səviyyəsində idi. Mütləq V4 SQL faylını Supabase SQL Editor-də run et.

## V5 düzəliş qeydləri
- `assets/js/user.js`: Sevimlilərdən çıxarma və sevimlilərdən səbətə atma işlək edildi; mesaj səhifəsinə realtime yenilənmə əlavə edildi; tamamlanmış/ləğv edilmiş sifarişlərdə xəritə gizlədildi.
- `assets/js/shop.js`: Xəbərlər və partnyorlar dayanmadan döngülü animasiyaya salındı; məhsul detal səhifəsi genişləndirildi və oxşar məhsullar əlavə edildi.
- `assets/js/admin.js`: Sifarişlər cədvəlində error olduqda gizlənməsin deyə mesaj göstərildi; kuryer təyin etmə üçün ehtiyat update mexanizmi əlavə edildi.
- `assets/css/style.css`: Kateqoriya sürüşməsi, açıq alt naviqasiya rəngi, profil avatar neon animasiyası, product.html dizaynı və slider döngü stilləri əlavə edildi.
- `profile.html`: Profil şəkli ortada daha böyük və neon animasiyalı edildi.
- `sql/supabase-fast-core-upgrade-v5.sql`: Kuryer təyin etmə üçün `courier_assignments.assigned_by/status/note` sütunları və tək RPC funksiyası yenidən quruldu.
