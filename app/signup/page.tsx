'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SoundToggle from '@/components/sfx/SoundToggle';
import styles from '../login/login.module.css';

export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone || null,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (data?.user) {
        // Also register in public.users table if not handled by Supabase trigger
        await fetch('/api/auth/sync-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: data.user.id,
            email,
            fullName,
            phone: phone || null,
            role: 'PLAYER',
          }),
        }).catch(() => {
          // Non-blocking sync attempt
        });

        router.push('/portal');
        router.refresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred during registration';
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
          <span className={styles.brandBadge}>New Player Registration</span>
          <h1 className={styles.brandTitle}>Join PicklePunto</h1>
          <p className={styles.brandSubtitle}>Create your player account to reserve courts</p>
        </div>

        {error && (
          <div className={styles.errorBanner} role="alert" id="signup-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSignUp} className={styles.form} id="form-signup">
          <Input
            id="input-name"
            label="Full Name"
            placeholder="Rafael Nadal"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
          />

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
            id="input-phone"
            label="Phone Number (Optional)"
            type="tel"
            placeholder="+1 555-0199"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            hint="For booking confirmations and reminders"
          />

          <Input
            id="input-password"
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
          />

          <Button
            id="btn-signup-submit"
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
          >
            Create Account
          </Button>
        </form>

        <div className={styles.footer}>
          Already have an account?{' '}
          <Link href="/login" id="link-to-login" className={styles.footerLink}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
