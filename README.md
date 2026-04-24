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
