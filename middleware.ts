import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// ─── Route Protection Middleware ──────────────────────────────────────────────
// Runs on every matched route. Guards:
//   /admin/* → STAFF or ADMIN only (verified from Supabase DB)
//   /portal/* → authenticated user
//   /login, /signup → redirect authenticated users based on role

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh the session — REQUIRED on every request
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  // ── Redirect unauthenticated users away from protected routes ───────────────
  if (!user) {
    if (pathname.startsWith('/admin') || pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }

  // Fetch the user's role from the database
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role ?? 'PLAYER';

  // ── Authenticated: redirect away from auth pages ────────────────────────────
  if (pathname === '/login' || pathname === '/signup') {
    const dest = (role === 'ADMIN' || role === 'STAFF') ? '/admin/schedule' : '/portal';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // ── Admin routes: require STAFF or ADMIN role ────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (role !== 'ADMIN' && role !== 'STAFF') {
      return NextResponse.redirect(new URL('/portal', request.url));
    }
  }

  return response;
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
