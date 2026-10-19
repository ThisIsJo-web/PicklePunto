import { createBrowserClient } from '@supabase/ssr';

// ─── Supabase Browser Client ──────────────────────────────────────────────────
// Use in Client Components ('use client') for auth state, realtime subscriptions.

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  return createBrowserClient(url, anonKey, {
    cookieOptions: {
      maxAge: 365 * 24 * 60 * 60, // 1-year long session persistence
      sameSite: 'lax',
      path: '/',
    },
  });
}
