export const SUPABASE_URL = 'https://acafrpfpzquyjpkqlhzm.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjYWZycGZwenF1eWpwa3FsaHptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3ODg1NzAsImV4cCI6MjA5MjM2NDU3MH0.c5sh_iC7qozS3k5g3vYgxCDBMhF1AdSt7VkNPwr3KEU';
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
