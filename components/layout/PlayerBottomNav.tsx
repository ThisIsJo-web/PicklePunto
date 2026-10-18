'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SoundToggle from '@/components/sfx/SoundToggle';
import styles from './PlayerBottomNav.module.css';

interface PlayerBottomNavProps {
  onScrollTo3D?: () => void;
  onSignOut?: () => void;
}

export default function PlayerBottomNav({ onScrollTo3D, onSignOut }: PlayerBottomNavProps) {
  const pathname = usePathname();

  const isPortal = pathname === '/portal';
  const isBooking = pathname.startsWith('/portal/book');

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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SoundToggle />
      </div>

      {onSignOut && (
        <button
          type="button"
          onClick={onSignOut}
          className={styles.navBtn}
          data-sfx="tap"
          title="Sign Out"
        >
          <span className={styles.navIcon}>🚪</span>
          <span className={styles.navLabel}>Exit</span>
        </button>
      )}
    </nav>
  );
}
