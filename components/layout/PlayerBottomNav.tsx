'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import styles from './PlayerBottomNav.module.css';

interface PlayerBottomNavProps {
  onScrollTo3D?: () => void;
  onSignOut?: () => void;
}

export default function PlayerBottomNav({ onScrollTo3D, onSignOut }: PlayerBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  // On the dedicated booking wizard page, hide bottom nav to avoid double bars
  if (pathname.startsWith('/portal/book')) {
    return null;
  }

  const isPortal = pathname === '/portal';

  const handleSignOut = async () => {
    if (onSignOut) {
      onSignOut();
    } else {
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    }
  };

  return (
    <nav className={styles.bottomNav} aria-label="Mobile Navigation">
      <Link
        href="/portal"
        className={`${styles.navBtn} ${isPortal ? styles.navBtnActive : ''}`}
        data-sfx="whoosh"
      >
        <span className={styles.navIcon}>🏓</span>
        <span className={styles.navLabel}>My Games</span>
      </Link>

      <Link
        href="/portal/book"
        className={`${styles.navBtn} ${styles.bookCtaBtn}`}
        data-sfx="pop"
      >
        <span className={styles.navIcon}>⚡</span>
        <span className={styles.navLabel}>Book Court</span>
      </Link>

      {onScrollTo3D ? (
        <button
          type="button"
          className={styles.navBtn}
          onClick={onScrollTo3D}
          data-sfx="select"
        >
          <span className={styles.navIcon}>🏟️</span>
          <span className={styles.navLabel}>3D Arena</span>
        </button>
      ) : (
        <Link
          href="/portal#live-arena"
          className={styles.navBtn}
          data-sfx="select"
        >
          <span className={styles.navIcon}>🏟️</span>
          <span className={styles.navLabel}>3D Arena</span>
        </Link>
      )}

      <button
        type="button"
        onClick={handleSignOut}
        className={styles.navBtn}
        data-sfx="tap"
        title="Sign Out"
      >
        <span className={styles.navIcon}>🚪</span>
        <span className={styles.navLabel}>Exit</span>
      </button>
    </nav>
  );
}
