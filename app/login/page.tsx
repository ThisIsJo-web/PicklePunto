'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SoundToggle from '@/components/sfx/SoundToggle';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      if (data?.user) {
        // Fetch role from database to determine redirect destination
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .single();

        const role = profile?.role ?? 'PLAYER';
        if (role === 'ADMIN' || role === 'STAFF') {
          router.push('/admin/schedule');
        } else {
          router.push('/portal');
        }
        router.refresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <SoundToggle />
      </div>

      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandIcon} aria-hidden="true">🏓</span>
          <span className={styles.brandBadge}>Pickleball Courts & POS</span>
          <h1 className={styles.brandTitle}>PicklePunto</h1>
          <p className={styles.brandSubtitle}>Court Booking & Facility Management</p>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert" id="login-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className={styles.form} id="form-login">
          <Input
            id="input-email"
            label="Email Address"
            type="email"
            placeholder="player@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <Input
            id="input-password"
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <Button
            id="btn-login-submit"
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
          >
            Sign In
          </Button>
        </form>

        <div className={styles.footer}>
          Don&apos;t have an account?{' '}
          <Link href="/signup" id="link-to-signup" className={styles.footerLink}>
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
