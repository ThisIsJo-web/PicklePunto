'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import styles from './AdminSidebar.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  id: string;
  disabled?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/admin/schedule',
    label: 'Schedule',
    icon: '📅',
    id: 'nav-schedule',
  },
  {
    href: '/admin/bookings',
    label: 'Bookings',
    icon: '🏓',
    id: 'nav-bookings',
  },
  {
    href: '/admin/courts',
    label: 'Courts',
    icon: '🏟️',
    id: 'nav-courts',
  },
  { href: '/admin/pos', label: 'POS & Counter', icon: '🧾', id: 'nav-pos', disabled: false },
  { href: '/admin/inventory', label: 'Inventory', icon: '📦', id: 'nav-inventory', disabled: false },
  { href: '/admin/customers', label: 'Customers', icon: '👥', id: 'nav-customers', disabled: false },
  { href: '/admin/reports', label: 'Reports', icon: '📊', id: 'nav-reports', disabled: false },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️', id: 'nav-settings', disabled: false },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const handleToggle = () => setIsMobileOpen((prev) => !prev);
    const handleClose = () => setIsMobileOpen(false);

    window.addEventListener('toggle-admin-sidebar', handleToggle);
    window.addEventListener('close-admin-sidebar', handleClose);

    return () => {
      window.removeEventListener('toggle-admin-sidebar', handleToggle);
      window.removeEventListener('close-admin-sidebar', handleClose);
    };
  }, []);

  // Close mobile sidebar whenever route changes
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {isMobileOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={cn(styles.sidebar, isMobileOpen && styles.sidebarMobileOpen)}>
        {/* Logo */}
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🏓</span>
          <span className={styles.logoText}>PicklePunto</span>
          <button
            type="button"
            className={styles.mobileCloseBtn}
            onClick={() => setIsMobileOpen(false)}
            aria-label="Close menu"
            title="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className={styles.nav} aria-label="Admin navigation">
          <ul className={styles.navList}>
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  {item.disabled ? (
                    <span
                      className={cn(styles.navItem, styles.disabled)}
                      title="Available in a future phase"
                      id={item.id}
                    >
                      <span className={styles.navIcon}>{item.icon}</span>
                      <span className={styles.navLabel}>{item.label}</span>
                      <span className={styles.soon}>Soon</span>
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      id={item.id}
                      className={cn(styles.navItem, isActive && styles.active)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className={styles.navIcon}>{item.icon}</span>
                      <span className={styles.navLabel}>{item.label}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className={styles.sidebarFooter}>
          <p className={styles.version}>Phase 6 — Launch & Polish</p>
        </div>
      </aside>
    </>
  );
}
