'use client';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import SoundToggle from '@/components/sfx/SoundToggle';
import styles from './AdminHeader.module.css';

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function AdminHeader({ title, subtitle, actions }: AdminHeaderProps) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function toggleMobileSidebar() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('toggle-admin-sidebar'));
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.leftGroup}>
        <button
          type="button"
          id="btn-mobile-menu"
          className={styles.mobileMenuBtn}
          onClick={toggleMobileSidebar}
          aria-label="Toggle navigation menu"
          title="Toggle Navigation Menu"
        >
          ☰
        </button>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
      <div className={styles.actions}>
        {actions}
        <SoundToggle />
        <button
          id="btn-sign-out"
          onClick={handleSignOut}
          className={styles.signOut}
          title="Sign out"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
