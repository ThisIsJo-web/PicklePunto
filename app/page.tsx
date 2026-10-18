import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// ─── Root Page ─────────────────────────────────────────────────────────────────
// Redirects authenticated users to the appropriate area based on role.
// Unauthenticated users are sent to login.

export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

  if (!user) {
    redirect('/login');
  }

  // Fetch the user's role from the DB
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role ?? 'PLAYER';

  if (role === 'ADMIN' || role === 'STAFF') {
    redirect('/admin/schedule');
  }

  redirect('/portal');
}
