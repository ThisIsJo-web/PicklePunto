import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ─── Supabase Server Client ───────────────────────────────────────────────────
// Use in Server Components, Route Handlers, and Server Actions.
// Reads/writes cookies via the Next.js cookies() API.

export async function createSupabaseServerClient() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  return createServerClient(url, anonKey, {
    cookieOptions: {
      maxAge: 365 * 24 * 60 * 60,
      sameSite: 'lax',
      path: '/',
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              maxAge: 365 * 24 * 60 * 60,
              sameSite: 'lax',
              path: '/',
              ...options,
            });
          });
        } catch {
          // setAll called from a Server Component — safe to ignore
        }
      },
    },
  });
}

// ─── Admin Client (Service Role) ─────────────────────────────────────────────
// Only use server-side where elevated privileges are needed (bypasses RLS).
export async function createSupabaseAdminClient() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key';

  return createServerClient(url, serviceKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {}
      },
    },
  });
}
