'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SoundToggle from '@/components/sfx/SoundToggle';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  // Load remembered credentials state on mount
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('picklepunto_remember_email');
      const savedRemember = localStorage.getItem('picklepunto_remember_me');

      if (savedRemember !== null) {
        setRememberMe(savedRemember === 'true');
      }

      if (savedEmail) {
        setEmail(savedEmail);
        // Focus password input if email was already saved
        setTimeout(() => {
          passwordInputRef.current?.focus();
        }, 60);
      }
    } catch {
      // Ignore if localStorage unavailable
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Persist or clear remember-me preference
      try {
        if (rememberMe) {
          localStorage.setItem('picklepunto_remember_email', email.trim());
          localStorage.setItem('picklepunto_remember_me', 'true');
          document.cookie = `picklepunto_remember=true; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
        } else {
          localStorage.removeItem('picklepunto_remember_email');
          localStorage.setItem('picklepunto_remember_me', 'false');
          document.cookie = 'picklepunto_remember=; path=/; max-age=0; SameSite=Lax';
        }
      } catch {
        // Safe to ignore storage errors
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
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
            ref={passwordInputRef}
            id="input-password"
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <div className={styles.rememberRow}>
            <label htmlFor="checkbox-remember-me" className={styles.checkboxLabel}>
              <input
                type="checkbox"
                id="checkbox-remember-me"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className={styles.checkboxInput}
                data-sfx="pop"
              />
              <span className={styles.customCheckbox} aria-hidden="true">
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={styles.checkIcon}
                >
                  <polyline points="3.5 8.5 6.5 11.5 12.5 5" />
                </svg>
              </span>
              <span className={styles.rememberText}>
                Remember me
                <span className={styles.rememberSubtext}>Stay signed in on this device</span>
              </span>
            </label>
          </div>

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
