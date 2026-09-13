MEYVECI.AZ WINDOWS EXE BUILD
============================

Bu qovluq GitHub Actions vasitəsilə MeyveciSetup.exe yaradır.

İş prinsipi:
- EXE saytın ayrıca köhnə/offline nüsxəsini saxlamır.
- Canlı https://meyveci.az saytını Windows tətbiq pəncərəsində açır.
- Məhsullar, sifarişlər, admin, Supabase, realtime və sayt dəyişiklikləri canlı saytdan gəlir.
- Service Worker / web bildiriş məntiqi Chromium (Edge/Chrome) üzərindən işləyir.
- İlk açılış URL-ində ?app=exe işarəsi olur və yalnız həmin EXE sessiyasında məhsul detalındakı Geri düyməsi görünür.
- Adi brauzer və PWA dəyişmir.

BUILD:
GitHub -> Actions -> "Build Meyveci Windows EXE" -> Run workflow
Bitəndə run daxilində Artifacts bölməsindən "MeyveciSetup" yüklənir.

Hazır MeyveciSetup.exe faylını repoda downloads/MeyveciSetup.exe ilə əvəz edə bilərsiniz.
