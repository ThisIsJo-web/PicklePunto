'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import adminStyles from '../admin.module.css';
import styles from './customers.module.css';

interface CustomerSummary {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: 'PLAYER' | 'STAFF' | 'ADMIN';
  notes: string | null;
  createdAt: string;
  totalBookings: number;
  confirmedBookings: number;
  totalLifetimeSpend: string;
  lastActiveAt: string | null;
}

interface CustomerDetail {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  notes: string | null;
  createdAt: string;
  stats: {
    totalBookings: number;
    confirmedBookings: number;
    cancelledBookings: number;
    noShowBookings: number;
    courtSpend: string;
    posSpend: string;
    totalLifetimeSpend: string;
    openTabsCount: number;
  };
  recentBookings: Array<{
    id: string;
    courtName: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    status: string;
    totalAmount: string;
    isWalkIn: boolean;
    createdAt: string;
  }>;
  recentTabs: Array<{
    id: string;
    courtName: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    itemCount: number;
    totalAmount: string;
  }>;
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'spend' | 'bookings' | 'recent'>('spend');

  // Customer Drawer State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'bookings' | 'tabs'>('bookings');
  const [notesSavedSuccess, setNotesSavedSuccess] = useState(false);

  // Fetch Customers List
  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/customers');
      const data = await res.json();
      if (data.data) {
        setCustomers(data.data);
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Fetch Single Customer Detail when drawer opens
  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerDetail(null);
      return;
    }

    const loadDetail = async () => {
      try {
        setDetailLoading(true);
        const res = await fetch(`/api/customers/${selectedCustomerId}`);
        const data = await res.json();
        if (data.data) {
          setCustomerDetail(data.data);
          setNotesText(data.data.notes || '');
        }
      } catch (err) {
        console.error('Failed to load customer profile:', err);
      } finally {
        setDetailLoading(false);
      }
    };

    loadDetail();
  }, [selectedCustomerId]);

  // Save Staff Notes
  const handleSaveNotes = async () => {
    if (!selectedCustomerId) return;
    try {
      setSavingNotes(true);
      const res = await fetch(`/api/customers/${selectedCustomerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesText }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotesSavedSuccess(true);
        setTimeout(() => setNotesSavedSuccess(false), 3000);
        // Update local list
        setCustomers((prev) =>
          prev.map((c) => (c.id === selectedCustomerId ? { ...c, notes: notesText } : c))
        );
      }
    } catch (err) {
      console.error('Failed to save staff notes:', err);
    } finally {
      setSavingNotes(false);
    }
  };

  // KPIs
  const totalRegistered = customers.length;
  const activePlayers = useMemo(
    () => customers.filter((c) => c.confirmedBookings > 0).length,
    [customers]
  );
  const totalRevenue = useMemo(
    () =>
      customers.reduce((acc, c) => acc + parseFloat(c.totalLifetimeSpend || '0'), 0),
    [customers]
  );
  const avgSpend = useMemo(
    () => (totalRegistered > 0 ? totalRevenue / totalRegistered : 0),
    [totalRevenue, totalRegistered]
  );

  // Filtered & Sorted Customers
  const filteredCustomers = useMemo(() => {
    return customers
      .filter((c) => {
        const matchesSearch =
          c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.phone && c.phone.includes(searchTerm));
        const matchesRole = roleFilter === 'ALL' || c.role === roleFilter;
        return matchesSearch && matchesRole;
      })
      .sort((a, b) => {
        if (sortBy === 'spend') {
          return parseFloat(b.totalLifetimeSpend) - parseFloat(a.totalLifetimeSpend);
        }
        if (sortBy === 'bookings') {
          return b.totalBookings - a.totalBookings;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [customers, searchTerm, roleFilter, sortBy]);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return <Badge label="Admin" status="confirmed" />;
      case 'STAFF':
        return <Badge label="Staff" status="paid" />;
      default:
        return <Badge label="Player" status="default" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return <Badge label="Confirmed" status="confirmed" />;
      case 'CANCELLED':
        return <Badge label="Cancelled" status="cancelled" />;
      case 'NO_SHOW':
        return <Badge label="No-Show" status="warning" />;
      case 'CLOSED':
        return <Badge label="Paid & Closed" status="paid" />;
      case 'OPEN':
        return <Badge label="Open Tab" status="warning" />;
      default:
        return <Badge label={status} status="default" />;
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return (name[0] || 'P').toUpperCase();
  };

  return (
    <div className={adminStyles.adminLayout}>
      <AdminHeader
        title="Customer Directory"
        subtitle="Manage registered players, track lifetime court spend, record staff notes, and export rosters"
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant="secondary"
              id="btn-refresh-customers"
              onClick={fetchCustomers}
            >
              🔄 Refresh
            </Button>
            <a
              href="/api/customers/export"
              download
              id="btn-export-csv"
              style={{ textDecoration: 'none' }}
            >
              <Button variant="primary">
                📥 Export CSV
              </Button>
            </a>
          </div>
        }
      />

      <main className={adminStyles.mainContent}>
        <div className={styles.container}>
          {/* KPI Stats */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(56, 189, 248, 0.15)', color: 'var(--ink-blue)' }}>
                👥
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Registered Users</span>
                <span className={styles.statValue}>{totalRegistered}</span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(34, 197, 94, 0.15)', color: 'var(--ink-green)' }}>
                🏓
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Active Players</span>
                <span className={styles.statValue}>{activePlayers}</span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--ink-amber)' }}>
                💰
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Total Player Spend</span>
                <span className={styles.statValue}>₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(168, 85, 247, 0.15)', color: 'var(--ink-purple)' }}>
                📊
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Avg Spend / Player</span>
                <span className={styles.statValue}>₱{avgSpend.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className={styles.filterBar}>
            <div className={styles.searchBox}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search players by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                id="customer-search-input"
              />
            </div>

            <div className={styles.filterControls}>
              <div className={styles.filterPills}>
                <button
                  type="button"
                  className={`${styles.pillBtn} ${roleFilter === 'ALL' ? styles.pillBtnActive : ''}`}
                  onClick={() => setRoleFilter('ALL')}
                >
                  All ({totalRegistered})
                </button>
                <button
                  type="button"
                  className={`${styles.pillBtn} ${roleFilter === 'PLAYER' ? styles.pillBtnActive : ''}`}
                  onClick={() => setRoleFilter('PLAYER')}
                >
                  Players
                </button>
                <button
                  type="button"
                  className={`${styles.pillBtn} ${roleFilter === 'STAFF' ? styles.pillBtnActive : ''}`}
                  onClick={() => setRoleFilter('STAFF')}
                >
                  Staff
                </button>
                <button
                  type="button"
                  className={`${styles.pillBtn} ${roleFilter === 'ADMIN' ? styles.pillBtnActive : ''}`}
                  onClick={() => setRoleFilter('ADMIN')}
                >
                  Admin
                </button>
              </div>

              <select
                className={styles.sortSelect}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                id="customer-sort-select"
              >
                <option value="spend">Sort: Highest Spend</option>
                <option value="bookings">Sort: Most Bookings</option>
                <option value="recent">Sort: Recently Joined</option>
              </select>
            </div>
          </div>

          {/* Customer Table */}
          <div className={styles.tableContainer}>
            <table className={styles.table} id="customers-table">
              <thead>
                <tr>
                  <th>Player Details</th>
                  <th>Contact Phone</th>
                  <th>Role</th>
                  <th>Member Since</th>
                  <th>Bookings</th>
                  <th>Lifetime Spend</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className={styles.emptyState}>
                      Loading player directory...
                    </td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.emptyState}>
                      <span style={{ fontSize: '2rem' }}>👥</span>
                      <p>No customers match your search criteria.</p>
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((c) => (
                    <tr
                      key={c.id}
                      id={`customer-row-${c.id}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedCustomerId(c.id)}
                    >
                      <td>
                        <div className={styles.customerCell}>
                          <div className={styles.avatar}>{getInitials(c.fullName)}</div>
                          <div className={styles.nameInfo}>
                            <span className={styles.customerName}>{c.fullName}</span>
                            <span className={styles.customerEmail}>{c.email}</span>
                            {c.notes && (
                              <span className={styles.noteBadge}>
                                📝 Staff Note Added
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: c.phone ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                        {c.phone || '—'}
                      </td>
                      <td>{getRoleBadge(c.role)}</td>
                      <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                        {new Date(c.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td>
                        <strong style={{ color: 'var(--color-text-primary)' }}>{c.totalBookings}</strong>
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>
                          {' '}({c.confirmedBookings} confirmed)
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--ink-blue)' }}>
                        ₱{parseFloat(c.totalLifetimeSpend).toLocaleString('en-PH', {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomerId(c.id);
                          }}
                        >
                          View Profile & Notes
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Slide-out Player Profile Drawer */}
        {selectedCustomerId && (
          <div className={styles.drawerOverlay} onClick={() => setSelectedCustomerId(null)}>
            <div className={styles.drawer} onClick={(e) => e.stopPropagation()} id="customer-profile-drawer">
              {detailLoading || !customerDetail ? (
                <div className={styles.emptyState} style={{ margin: 'auto' }}>
                  Loading customer profile...
                </div>
              ) : (
                <>
                  <div className={styles.drawerHeader}>
                    <div className={styles.drawerUser}>
                      <div className={styles.drawerAvatar}>
                        {getInitials(customerDetail.fullName)}
                      </div>
                      <div className={styles.drawerUserInfo}>
                        <h2>{customerDetail.fullName}</h2>
                        <p>{customerDetail.email} • {customerDetail.phone || 'No phone recorded'}</p>
                        <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.5rem' }}>
                          {getRoleBadge(customerDetail.role)}
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                            Member since {new Date(customerDetail.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.drawerCloseBtn}
                      onClick={() => setSelectedCustomerId(null)}
                      title="Close Drawer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className={styles.drawerBody}>
                    {/* Lifetime Spending & Activity Cards */}
                    <div className={styles.drawerStatsGrid}>
                      <div className={styles.drawerStatCard}>
                        <span className={styles.drawerStatLabel}>Total Lifetime Spend</span>
                        <div className={styles.drawerStatVal} style={{ color: 'var(--ink-blue)' }}>
                          ₱{parseFloat(customerDetail.stats.totalLifetimeSpend).toLocaleString('en-PH', {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                      </div>

                      <div className={styles.drawerStatCard}>
                        <span className={styles.drawerStatLabel}>Court Booking Spend</span>
                        <div className={styles.drawerStatVal} style={{ color: 'var(--ink-green)' }}>
                          ₱{parseFloat(customerDetail.stats.courtSpend).toLocaleString('en-PH', {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                      </div>

                      <div className={styles.drawerStatCard}>
                        <span className={styles.drawerStatLabel}>POS / Refreshments Spend</span>
                        <div className={styles.drawerStatVal} style={{ color: 'var(--ink-amber)' }}>
                          ₱{parseFloat(customerDetail.stats.posSpend).toLocaleString('en-PH', {
                            minimumFractionDigits: 2,
                          })}
                        </div>
                      </div>

                      <div className={styles.drawerStatCard}>
                        <span className={styles.drawerStatLabel}>Booking Reliability</span>
                        <div className={styles.drawerStatVal}>
                          {customerDetail.stats.confirmedBookings} / {customerDetail.stats.totalBookings}
                          {customerDetail.stats.noShowBookings > 0 && (
                            <span style={{ color: 'var(--ink-red)', fontSize: '0.8rem', marginLeft: '0.3rem' }}>
                              ({customerDetail.stats.noShowBookings} no-show)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Staff Notes Section */}
                    <div className={styles.notesSection}>
                      <div className={styles.notesHeader}>
                        <h4>📝 Private Staff Notes</h4>
                        {notesSavedSuccess && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--ink-green)' }}>
                            ✅ Saved Successfully
                          </span>
                        )}
                      </div>
                      <textarea
                        className={styles.notesTextarea}
                        placeholder="Add staff-only observations (e.g. preferred paddle brand, VIP corporate member, frequent doubles partner, payment preferences)..."
                        value={notesText}
                        onChange={(e) => setNotesText(e.target.value)}
                        id="customer-notes-textarea"
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Button
                          variant="primary"
                          size="sm"
                          id="btn-save-notes"
                          onClick={handleSaveNotes}
                          disabled={savingNotes}
                        >
                          {savingNotes ? 'Saving...' : 'Save Staff Notes'}
                        </Button>
                      </div>
                    </div>

                    {/* Tabs / Bookings History */}
                    <div className={styles.drawerNavTabs}>
                      <button
                        type="button"
                        className={`${styles.drawerNavTab} ${
                          activeDrawerTab === 'bookings' ? styles.drawerNavTabActive : ''
                        }`}
                        onClick={() => setActiveDrawerTab('bookings')}
                      >
                        Recent Bookings ({customerDetail.recentBookings.length})
                      </button>
                      <button
                        type="button"
                        className={`${styles.drawerNavTab} ${
                          activeDrawerTab === 'tabs' ? styles.drawerNavTabActive : ''
                        }`}
                        onClick={() => setActiveDrawerTab('tabs')}
                      >
                        POS / Food Tabs ({customerDetail.recentTabs.length})
                      </button>
                    </div>

                    {activeDrawerTab === 'bookings' ? (
                      <div className={styles.historyList}>
                        {customerDetail.recentBookings.length === 0 ? (
                          <div className={styles.emptyState}>No court bookings recorded yet.</div>
                        ) : (
                          customerDetail.recentBookings.map((b) => (
                            <div key={b.id} className={styles.historyCard}>
                              <div className={styles.historyInfo}>
                                <h5>{b.courtName} {b.isWalkIn ? '• Walk-In' : ''}</h5>
                                <p>
                                  {new Date(b.startTime).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true,
                                  })}{' '}
                                  ({b.durationMinutes} mins)
                                </p>
                              </div>
                              <div className={styles.historyMeta}>
                                <span className={styles.historyAmount}>
                                  ₱{parseFloat(b.totalAmount).toFixed(2)}
                                </span>
                                {getStatusBadge(b.status)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className={styles.historyList}>
                        {customerDetail.recentTabs.length === 0 ? (
                          <div className={styles.emptyState}>No POS orders or tabs recorded yet.</div>
                        ) : (
                          customerDetail.recentTabs.map((t) => (
                            <div key={t.id} className={styles.historyCard}>
                              <div className={styles.historyInfo}>
                                <h5>{t.courtName}</h5>
                                <p>
                                  Opened: {new Date(t.openedAt).toLocaleDateString()} • {t.itemCount} item(s)
                                </p>
                              </div>
                              <div className={styles.historyMeta}>
                                <span className={styles.historyAmount}>
                                  ₱{parseFloat(t.totalAmount).toFixed(2)}
                                </span>
                                {getStatusBadge(t.status)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
