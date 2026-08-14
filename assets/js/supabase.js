// ============================================================
// MEYVƏÇİ.AZ - SUPABASE BAĞLANTISI
// Bu faylda saytın Supabase URL və ANON key məlumatları saxlanılır.
// Public ANON key frontend-də ola bilər, amma service_role key heç vaxt olmaz.
// ============================================================

export const SUPABASE_URL = 'https://ozrcfjibufzfmvydccst.supabase.co';

export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96cmNmamlidWZ6Zm12eWRjY3N0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NDcxMTIsImV4cCI6MjA5MjEyMzExMn0.rc9hmJm1DwltaI4VDOOsyIuYPT9Lod-xXWg7mf6QwWw';

export const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
