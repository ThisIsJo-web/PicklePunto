'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { formatDate, formatTime } from '@/lib/utils/date';
import { differenceInHours } from 'date-fns';
import CourtStage from '@/components/court3d/CourtStage';
import { toVisualState, type StageCourt } from '@/components/court3d/types';
import SoundToggle from '@/components/sfx/SoundToggle';
import PlayerBottomNav from '@/components/layout/PlayerBottomNav';
import styles from './portal.module.css';

interface Booking {
  id: string;
  courtId: string;
  courtName: string;
  surfaceType: string;
  leadBookerId: string;
  leadBookerName: string;
  leadBookerEmail: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: string;
  totalAmount: string;
  isUsing?: boolean;
  createdAt?: string;
  notes?: string;
  addons: { id: string; productName: string; quantity: number; unitPrice: string }[];
  participants: { id: string; userName: string; shareAmount: string; paymentStatus: string }[];
}

function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface CourtLiveStatus {
  courtId: string;
  courtName: string;
  surfaceType: string;
  hourlyRate: string;
  openingTime: string;
  closingTime: string;
  currentState: 'AVAILABLE' | 'USING' | 'BOOKED' | 'RESERVED' | 'BLOCKED' | 'CLOSED';
  currentSession: {
    bookingId?: string;
    leadPlayerName?: string;
    startTime?: string;
    endTime?: string;
    durationMinutes?: number;
    reason?: string;
  } | null;
}

export default function PlayerPortalPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [user, setUser] = useState<any>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [liveCourts, setLiveCourts] = useState<CourtLiveStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past' | 'facility'>('upcoming');

  // Cancel & Reschedule Modal State
  const [selectedBookingForCancel, setSelectedBookingForCancel] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Reschedule state
  const todayStr = useMemo(() => getLocalDateString(), []);
  const [selectedBookingForReschedule, setSelectedBookingForReschedule] = useState<Booking | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>(() => getLocalDateString());
  const [rescheduleTime, setRescheduleTime] = useState<string>('09:00');
  const [rescheduling, setRescheduling] = useState(false);

  // 3D Cartoon Arena state
  const [selected3dCourtId, setSelected3dCourtId] = useState<string>('');

  const stageCourts: StageCourt[] = useMemo(() => {
    if (liveCourts.length === 0) {
      return [
        { id: 'c1', name: 'Court 1', state: 'AVAILABLE', caption: 'Open' },
        { id: 'c2', name: 'Court 2', state: 'USING', caption: 'Playing' },
        { id: 'c3', name: 'Court 3', state: 'AVAILABLE', caption: 'Open' },
        { id: 'c4', name: 'Court 4', state: 'BOOKED', caption: 'Fully Booked' },
      ];
    }
    return liveCourts.map((c) => ({
      id: c.courtId,
      name: c.courtName,
      state: toVisualState(c.currentState),
      caption: `${c.surfaceType} · ₱${parseFloat(c.hourlyRate).toFixed(0)}/hr`,
    }));
  }, [liveCourts]);

  useEffect(() => {
    if (liveCourts.length > 0 && !selected3dCourtId) {
      setSelected3dCourtId(liveCourts[0].courtId);
    }
  }, [liveCourts, selected3dCourtId]);

  // 1. Fetch user bookings
  const fetchBookings = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/bookings?userId=${userId}`);
      const json = await res.json();
      if (json.data) {
        setBookings(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch player bookings:', err);
    }
  }, []);

  // 2. Fetch live court statuses (AVAILABLE, USING, RESERVED, BLOCKED, CLOSED)
  const fetchLiveStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/courts/live-status');
      const json = await res.json();
      if (json.data?.courts) {
        setLiveCourts(json.data.courts);
      }
    } catch (err) {
      console.error('Failed to fetch live court status:', err);
    }
  }, []);

  // 3. Initial Load & Auth Check
  useEffect(() => {
    async function init() {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          router.push('/login');
          return;
        }
        setUser(authUser);
        await Promise.all([fetchBookings(authUser.id), fetchLiveStatus()]);
      } catch (err) {
        console.error('Portal init error:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router, supabase, fetchBookings, fetchLiveStatus]);

  // 4. Supabase Realtime Subscription for instant updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('player-portal-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          fetchBookings(user.id);
          fetchLiveStatus();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'court_blocks' },
        () => {
          fetchLiveStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase, fetchBookings, fetchLiveStatus]);

  // Split into Upcoming vs Past
  const now = new Date();
  const upcomingBookings = useMemo(() => {
    return bookings
      .filter((b) => b.status !== 'CANCELLED' && new Date(b.endTime) >= now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [bookings, now]);

  const pastBookings = useMemo(() => {
    return bookings
      .filter((b) => b.status === 'CANCELLED' || new Date(b.endTime) < now)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [bookings, now]);

  // Handle Sign Out
  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  // Handle Cancellation
  async function handleConfirmCancel() {
    if (!selectedBookingForCancel) return;
    setCancelling(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/bookings/${selectedBookingForCancel.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Cancellation failed');
      }

      if (user) await fetchBookings(user.id);
      await fetchLiveStatus();
      setSelectedBookingForCancel(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel reservation';
      setActionError(msg);
    } finally {
      setCancelling(false);
    }
  }

  // Open Reschedule Modal with pre-filled future values
  function handleOpenReschedule(b: Booking) {
    setSelectedBookingForReschedule(b);
    setActionError(null);
    const bDate = b.startTime.split('T')[0];
    const today = getLocalDateString();
    setRescheduleDate(bDate >= today ? bDate : today);
    // Find slot time in HH:mm
    const d = new Date(b.startTime);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    setRescheduleTime(`${hours}:${mins}`);
  }

  // Handle Reschedule
  async function handleConfirmReschedule() {
    if (!selectedBookingForReschedule || !rescheduleDate || !rescheduleTime) return;
    setRescheduling(true);
    setActionError(null);

    try {
      const fullStartTime = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      if (isNaN(fullStartTime.getTime())) {
        throw new Error('Invalid date or time selected');
      }

      if (fullStartTime.getTime() <= Date.now()) {
        throw new Error('Cannot reschedule to a past date or time. Please select an upcoming slot.');
      }

      const res = await fetch(`/api/bookings/${selectedBookingForReschedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: fullStartTime.toISOString(),
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Rescheduling failed');
      }

      if (user) await fetchBookings(user.id);
      await fetchLiveStatus();
      setSelectedBookingForReschedule(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reschedule';
      setActionError(msg);
    } finally {
      setRescheduling(false);
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/portal" className={styles.brand}>
            <span className={styles.brandIcon}>🏓</span>
            <span className={styles.brandName}>PicklePunto</span>
            <span className={styles.badge}>Player Portal</span>
          </Link>
          <div className={styles.userActions}>
            <span className={styles.userEmail}>{user?.email}</span>
            <Button id="btn-portal-signout" variant="ghost" size="sm" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* Hero Section */}
        <div className={styles.welcomeHero}>
          <div className={styles.heroLeft}>
            <h1 className={styles.heroTitle}>Welcome back, {user?.user_metadata?.full_name || 'Player'}</h1>
            <p className={styles.heroSubtitle}>
              Reserve courts with flexible duration blocks, inspect equipment rentals, and track live court availability.
            </p>
          </div>
          <div>
            <Link href="/portal/book" style={{ textDecoration: 'none' }}>
              <Button id="btn-portal-book-court" variant="primary" size="lg" data-sfx="pop">
                ⚡ Reserve a Court
              </Button>
            </Link>
          </div>
        </div>

        {/* Live Facility Court Status Bar */}
        <section className={styles.liveStatusSection} id="live-arena">
          <div className={styles.liveSectionHeader}>
            <span className={styles.liveSectionTitle}>
              <span className={styles.pulseDot} />
              Court Availability
            </span>
          </div>

          {/* 3D Interactive Cartoon Arena */}
          <div style={{ marginBottom: 'var(--space-6)' }}>
            <CourtStage
              courts={stageCourts}
              selectedCourtId={selected3dCourtId}
              onSelectCourt={(id) => setSelected3dCourtId(id)}
              title="Live Court View"
              subtitle="Check court availability and live play in real-time"
            />
          </div>

          <div className={styles.courtStatusGrid}>
            {liveCourts.map((court) => {
              const isUsing = court.currentState === 'USING';
              const isBlocked = court.currentState === 'BLOCKED';
              const isBooked = court.currentState === 'BOOKED';
              const isClosed = court.currentState === 'CLOSED';
              const isSelected3D = selected3dCourtId === court.courtId;

              return (
                <div
                  key={court.courtId}
                  onClick={() => setSelected3dCourtId(court.courtId)}
                  data-sfx="select"
                  className={`${styles.courtStatusCard} ${
                    isSelected3D ? styles.courtStatusCardSelected3D : ''
                  } ${
                    isUsing ? styles.courtStatusCardUsing : isBlocked ? styles.courtStatusCardBlocked : ''
                  }`}
                >
                  <div className={styles.courtStatusTop}>
                    <span className={styles.courtStatusName}>{court.courtName}</span>
                    <Badge
                      label={
                        isUsing
                          ? 'PLAYING'
                          : isBlocked
                          ? 'BLOCKED'
                          : isBooked
                          ? 'FULLY BOOKED'
                          : isClosed
                          ? 'CLOSED'
                          : 'OPEN'
                      }
                      status={
                        isUsing
                          ? 'USING'
                          : isBlocked
                          ? 'BLOCKED'
                          : isBooked
                          ? 'BOOKED'
                          : isClosed
                          ? 'CLOSED'
                          : 'AVAILABLE'
                      }
                    />
                  </div>

                  <div className={styles.courtStatusDesc}>
                    {court.surfaceType} · ₱{parseFloat(court.hourlyRate).toFixed(2)}/hr
                  </div>

                  {court.currentSession && (
                    <div className={styles.courtStatusSession}>
                      {isUsing && (
                        <span>
                          🎾 Playing: {court.currentSession.leadPlayerName} (until {formatTime(court.currentSession.endTime!)})
                        </span>
                      )}
                      {isBlocked && (
                        <span style={{ color: 'var(--ink-red)' }}>
                          🛠️ {court.currentSession.reason || 'Maintenance Block'}
                        </span>
                      )}
                    </div>
                  )}

                  {!court.currentSession && !isBooked && !isClosed && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-brand-accent)' }}>
                      ✓ Open for booking
                    </div>
                  )}
                  {isBooked && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-coral-500)' }}>
                      All time slots booked for this date
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Tab Navigation */}
        <div className={styles.tabsRow}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'upcoming' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('upcoming')}
          >
            My Upcoming Reservations ({upcomingBookings.length})
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'past' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('past')}
          >
            Past Sessions ({pastBookings.length})
          </button>
        </div>

        {/* Tab Content: Upcoming Reservations */}
        {activeTab === 'upcoming' && (
          <div className={styles.bookingsGrid}>
            {loading ? (
              <div className={styles.cardEmpty}>Loading your reservations...</div>
            ) : upcomingBookings.length === 0 ? (
              <div className={styles.cardEmpty}>
                <span style={{ fontSize: '2.5rem' }}>🎾</span>
                <h3>No Upcoming Reservations</h3>
                <p>You have no active court bookings. Reserve a slot now to play!</p>
                <Link href="/portal/book">
                  <Button variant="primary" size="md">
                    Reserve a Court Now
                  </Button>
                </Link>
              </div>
            ) : (
              upcomingBookings.map((b) => {
                const hoursLeft = differenceInHours(new Date(b.startTime), now);
                const isWithinGraceWindow = hoursLeft >= 12;

                return (
                  <div
                    key={b.id}
                    className={`${styles.bookingCard} ${b.isUsing ? styles.bookingCardUsing : ''}`}
                  >
                    <div className={styles.cardTop}>
                      <div>
                        <div className={styles.courtName}>{b.courtName}</div>
                        <div className={styles.courtSurface}>{b.surfaceType}</div>
                      </div>
                      <Badge
                        label={
                          b.isUsing
                            ? 'USING · In Session'
                            : b.status === 'CONFIRMED'
                            ? 'BOOKED · Confirmed'
                            : 'RESERVED · Awaiting Pay'
                        }
                        status={b.isUsing ? 'USING' : b.status === 'CONFIRMED' ? 'BOOKED' : 'RESERVED'}
                      />
                    </div>

                    <div className={styles.cardTimeRow}>
                      <span>📅 {formatDate(b.startTime)}</span>
                      <span>·</span>
                      <span>
                        ⏰ {formatTime(b.startTime)} – {formatTime(b.endTime)} ({b.durationMinutes}m)
                      </span>
                    </div>

                    {b.addons.length > 0 && (
                      <div className={styles.cardAddons}>
                        🏓 <strong>Add-ons:</strong>{' '}
                        {b.addons.map((a) => `${a.quantity}x ${a.productName}`).join(', ')}
                      </div>
                    )}

                    <div className={styles.cardMetaRow}>
                      <span>Total: ₱{parseFloat(b.totalAmount).toFixed(2)}</span>
                      <span>
                        {b.participants.length > 1
                          ? `Split (${b.participants.length} players)`
                          : 'Single Player'}
                      </span>
                    </div>

                    {(b.status === 'AWAITING_PAYMENT' || b.status === 'PENDING') && (
                      <div className={styles.unpaidNotice}>
                        ⏳ <strong>30-Min On-Site Check-in Policy:</strong> If you do not arrive physically on-site within 30 minutes of your scheduled reservation time ({formatTime(b.startTime)}), this court will be voided and released as an open slot.
                      </div>
                    )}

                    <div className={styles.cardActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenReschedule(b)}
                        title="Reschedule session"
                      >
                        🔄 Reschedule
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setSelectedBookingForCancel(b)}
                        title="Cancel reservation"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab Content: Past Reservations */}
        {activeTab === 'past' && (
          <div className={styles.bookingsGrid}>
            {pastBookings.length === 0 ? (
              <div className={styles.cardEmpty}>
                <p>No past reservation records found.</p>
              </div>
            ) : (
              pastBookings.map((b) => (
                <div key={b.id} className={styles.bookingCard} style={{ opacity: 0.8 }}>
                  <div className={styles.cardTop}>
                    <div>
                      <div className={styles.courtName}>{b.courtName}</div>
                      <div className={styles.courtSurface}>{b.surfaceType}</div>
                    </div>
                    <Badge label={b.status} status={b.status} />
                  </div>

                  <div className={styles.cardTimeRow} style={{ color: 'var(--color-text-secondary)' }}>
                    <span>{formatDate(b.startTime)}</span>
                    <span>·</span>
                    <span>
                      {formatTime(b.startTime)} – {formatTime(b.endTime)}
                    </span>
                  </div>

                  <div className={styles.cardMetaRow}>
                    <span>Duration: {b.durationMinutes} mins</span>
                    <span>Amount: ₱{parseFloat(b.totalAmount).toFixed(2)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Cancellation Confirmation Modal */}
      {selectedBookingForCancel && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Cancel Reservation</h3>
              <button
                type="button"
                onClick={() => setSelectedBookingForCancel(null)}
                style={{ color: 'var(--color-text-muted)', fontSize: '1.25rem' }}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <p>
                Are you sure you want to cancel your reservation for{' '}
                <strong>{selectedBookingForCancel.courtName}</strong> on{' '}
                <strong>{formatDate(selectedBookingForCancel.startTime)}</strong> at{' '}
                <strong>{formatTime(selectedBookingForCancel.startTime)}</strong>?
              </p>

              {differenceInHours(new Date(selectedBookingForCancel.startTime), now) < 12 ? (
                <div className={styles.lateNotice}>
                  ⚠️ <strong>Late Cancellation Notice (&lt; 12 Hours):</strong>
                  <br />
                  This session starts in less than 12 hours. As per our 12-hour cancellation policy, late cancellations release the slot, but refunds require counter staff review.
                </div>
              ) : (
                <div style={{ color: 'var(--color-brand-accent)', fontSize: 'var(--text-xs)', marginTop: '8px' }}>
                  ✓ This reservation qualifies for full cancellation under the 12-hour grace period.
                </div>
              )}

              {actionError && (
                <div style={{ color: 'var(--ink-red)', fontSize: 'var(--text-xs)', marginTop: '8px' }}>
                  ⚠️ {actionError}
                </div>
              )}
            </div>

            <div className={styles.modalActions}>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setSelectedBookingForCancel(null)}
                disabled={cancelling}
              >
                Keep Booking
              </Button>
              <Button
                id="btn-confirm-cancel-booking"
                variant="danger"
                size="md"
                loading={cancelling}
                onClick={handleConfirmCancel}
              >
                Confirm Cancellation
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {selectedBookingForReschedule && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Reschedule Reservation</h3>
              <button
                type="button"
                onClick={() => setSelectedBookingForReschedule(null)}
                style={{ color: 'var(--color-text-muted)', fontSize: '1.25rem' }}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <p>
                Rescheduling <strong>{selectedBookingForReschedule.courtName}</strong> (
                {selectedBookingForReschedule.durationMinutes} mins)
              </p>

              <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Select New Date:
                  </label>
                  <input
                    type="date"
                    min={todayStr}
                    value={rescheduleDate}
                    onChange={(e) => {
                      if (e.target.value >= todayStr) {
                        setRescheduleDate(e.target.value);
                      }
                    }}
                    style={{
                      width: '100%',
                      background: 'var(--color-bg-base)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-2) var(--space-3)',
                      color: 'var(--color-text-primary)',
                      fontSize: 'var(--text-sm)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Select New Start Time Slot:
                  </label>
                  <select
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--color-bg-base)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-2) var(--space-3)',
                      color: 'var(--color-text-primary)',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    {[
                      '06:00', '06:30', '07:00', '07:30', '08:00', '08:30',
                      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
                      '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
                      '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
                      '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
                      '21:00', '21:30',
                    ].map((slot) => {
                      const isPast =
                        rescheduleDate === todayStr &&
                        new Date(`${rescheduleDate}T${slot}:00`).getTime() <= Date.now();
                      return (
                        <option key={slot} value={slot} disabled={isPast}>
                          {slot} {isPast ? '(Past slot)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {actionError && (
                <div style={{ color: 'var(--ink-red)', fontSize: 'var(--text-xs)', marginTop: '8px' }}>
                  ⚠️ {actionError}
                </div>
              )}
            </div>

            <div className={styles.modalActions}>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setSelectedBookingForReschedule(null)}
                disabled={rescheduling}
              >
                Cancel
              </Button>
              <Button
                id="btn-confirm-reschedule"
                variant="primary"
                size="md"
                loading={rescheduling}
                onClick={handleConfirmReschedule}
              >
                Confirm Reschedule
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <PlayerBottomNav
        onScrollTo3D={() => {
          const el = document.getElementById('live-arena');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
