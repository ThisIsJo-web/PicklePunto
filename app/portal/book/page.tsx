'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { formatTime, formatDate } from '@/lib/utils/date';
import CourtStage from '@/components/court3d/CourtStage';
import type { StageCourt } from '@/components/court3d/types';
import { useSfx } from '@/components/sfx/SfxProvider';
import styles from './book.module.css';

interface Court {
  id: string;
  name: string;
  surfaceType: string;
  hourlyRate: string;
  openingTime: string;
  closingTime: string;
}

interface Product {
  id: string;
  name: string;
  category: string;
  price: string;
  stockQty?: number;
  stockQuantity?: number;
}

interface Slot {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isAvailable?: boolean;
  status?: 'available' | 'booked' | 'playing' | 'blocked' | 'open_play' | 'past';
  statusLabel?: string;
}

interface CourtAvailability {
  courtId: string;
  courtName: string;
  surfaceType: string;
  hourlyRate: string;
  openingTime: string;
  closingTime: string;
  availableSlots: Slot[];
  allSlots?: Slot[];
}

function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function PlayerBookingWizardPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todayStr = useMemo(() => getLocalDateString(), []);

  // Wizard state
  const { play } = useSfx();
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [selectedDuration, setSelectedDuration] = useState<30 | 60 | 90>(60);
  const [courts, setCourts] = useState<Court[]>([]);
  const [availability, setAvailability] = useState<CourtAvailability[]>([]);
  const [selectedCourtId, setSelectedCourtId] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const bookingStageCourts: StageCourt[] = useMemo(() => {
    return courts.map((c) => {
      const avail = availability.find((a) => a.courtId === c.id);
      const hasSlots = avail ? avail.availableSlots.length > 0 : true;
      const isSelected = c.id === selectedCourtId;

      return {
        id: c.id,
        name: c.name,
        state: isSelected ? 'USING' : hasSlots ? 'AVAILABLE' : 'BOOKED',
        caption: `${c.surfaceType} · ₱${parseFloat(c.hourlyRate).toFixed(0)}/hr`,
      };
    });
  }, [courts, availability, selectedCourtId]);

  // Add-ons & Split
  const [products, setProducts] = useState<Product[]>([]);
  const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>({});
  const [splitCount, setSplitCount] = useState<number>(1);
  const [paymentRef, setPaymentRef] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // E-wallet info
  const [ewallet, setEwallet] = useState<{
    accountName: string;
    gcashNumber: string;
    mayaNumber: string;
  }>({
    accountName: 'PicklePunto Sports Center',
    gcashNumber: '0917-888-PUNTO',
    mayaNumber: '0918-999-PUNTO',
  });

  // Success view state
  const [confirmedBooking, setConfirmedBooking] = useState<any | null>(null);

  // Quick date tabs: Today, Tomorrow, +2 Days
  const dateOptions = useMemo(() => {
    const dates = [];
    const now = new Date();
    for (let i = 0; i < 5; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      const str = getLocalDateString(d);
      const label =
        i === 0
          ? 'Today'
          : i === 1
          ? 'Tomorrow'
          : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      dates.push({ date: str, label });
    }
    return dates;
  }, []);

  // 1. Check Auth & Load initial courts + products
  useEffect(() => {
    async function init() {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          router.push('/login');
          return;
        }
        setUser(authUser);

        // Fetch courts
        const courtsRes = await fetch('/api/courts');
        const courtsJson = await courtsRes.json();
        if (courtsJson.data && courtsJson.data.length > 0) {
          setCourts(courtsJson.data);
          setSelectedCourtId(courtsJson.data[0].id);
        }

        // Fetch rental & retail products
        const prodRes = await fetch('/api/products');
        const prodJson = await prodRes.json();
        if (prodJson.data) {
          setProducts(prodJson.data.filter((p: Product) => p.category === 'RENTAL' || p.category === 'RETAIL'));
        }

        // Fetch e-wallet info
        const ewRes = await fetch('/api/payments/ewallet-info');
        const ewJson = await ewRes.json();
        if (ewJson.data) {
          setEwallet(ewJson.data);
        }
      } catch (err) {
        console.error('Failed to load initial data:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router, supabase]);

  // 2. Fetch Availability when Date, Duration, or Courts change
  useEffect(() => {
    async function fetchAvail() {
      if (!selectedDate) return;
      try {
        const res = await fetch(
          `/api/courts/availability?date=${selectedDate}&duration=${selectedDuration}`
        );
        const json = await res.json();
        if (json.data) {
          setAvailability(json.data);
          // If previously selected slot is no longer valid, clear it
          setSelectedSlot(null);
        }
      } catch (err) {
        console.error('Error fetching court availability:', err);
      }
    }
    fetchAvail();
  }, [selectedDate, selectedDuration]);

  // Active court object & available slots for selected court
  const activeCourt = useMemo(() => {
    return courts.find((c) => c.id === selectedCourtId) || courts[0];
  }, [courts, selectedCourtId]);

  const courtSlots = useMemo(() => {
    const courtAvail = availability.find((a) => a.courtId === selectedCourtId);
    if (!courtAvail) return [];
    return courtAvail.allSlots || courtAvail.availableSlots || [];
  }, [availability, selectedCourtId]);

  // Dynamic pricing calculation
  const courtFee = useMemo(() => {
    if (!activeCourt) return 0;
    const hourly = parseFloat(activeCourt.hourlyRate) || 0;
    return (hourly * selectedDuration) / 60;
  }, [activeCourt, selectedDuration]);

  const addonsTotal = useMemo(() => {
    return Object.entries(addonQuantities).reduce((acc, [prodId, qty]) => {
      const prod = products.find((p) => p.id === prodId);
      if (!prod || qty <= 0) return acc;
      return acc + parseFloat(prod.price) * qty;
    }, 0);
  }, [addonQuantities, products]);

  const totalAmount = courtFee + addonsTotal;
  const sharePerPlayer = splitCount > 0 ? totalAmount / splitCount : totalAmount;

  function updateAddonQty(prodId: string, delta: number) {
    setAddonQuantities((prev) => {
      const current = prev[prodId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [prodId]: next };
    });
  }

  // Handle Booking Submission
  async function handleSubmitBooking(e?: React.SyntheticEvent) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    if (!selectedSlot || !activeCourt || !user) {
      setError('Please select an available time slot to reserve.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const formattedAddons = Object.entries(addonQuantities)
        .filter(([_, qty]) => qty > 0)
        .map(([productId, quantity]) => ({ productId, quantity }));

      const payload = {
        courtId: activeCourt.id,
        leadBookerId: user.id,
        startTime: selectedSlot.startTime,
        durationMinutes: selectedDuration,
        participantCount: splitCount,
        notes: [
          paymentRef ? `E-Wallet Ref: ${paymentRef}` : '',
          notes ? `Player Note: ${notes}` : '',
        ]
          .filter(Boolean)
          .join(' | '),
        addons: formattedAddons,
        initialStatus: 'AWAITING_PAYMENT',
      };

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        play('error');
        throw new Error(json.error || 'Failed to submit booking');
      }

      play('success');
      setConfirmedBooking(json.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reservation failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <p>Loading PicklePunto Booking Engine...</p>
        </div>
      </div>
    );
  }

  // ── Success Celebration Screen ──
  if (confirmedBooking) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.headerLeft}>
              <Link href="/portal" className={styles.brand}>
                <span className={styles.brandIcon}>🏓</span>
                <span>PicklePunto</span>
              </Link>
              <span className={styles.badge}>Reservation Confirmed</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <Link href="/portal">
                <Button variant="ghost" size="sm">
                  Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <main className={styles.main}>
          <div className={styles.successContainer}>
            <span className={styles.successIcon}>🎉</span>
            <h1 className={styles.successTitle}>Court Reserved Successfully!</h1>
            <p className={styles.successDesc}>
              Your court is reserved at PicklePunto. Our staff will verify your e-wallet payment on-site or via counter check-in.
            </p>

            <div className={styles.successCard}>
              <div className={styles.successRow}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Reservation ID:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{confirmedBooking.id}</span>
              </div>
              <div className={styles.successRow}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Court:</span>
                <span style={{ fontWeight: 600 }}>{confirmedBooking.court?.name || activeCourt?.name}</span>
              </div>
              <div className={styles.successRow}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Time & Duration:</span>
                <span>
                  {formatDate(confirmedBooking.startTime)} · {formatTime(confirmedBooking.startTime)} ({confirmedBooking.durationMinutes} mins)
                </span>
              </div>
              <div className={styles.successRow}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Total Due:</span>
                <span style={{ color: 'var(--color-coral-500)', fontWeight: 700, fontSize: '1.25rem' }}>
                  ₱{parseFloat(confirmedBooking.totalAmount).toFixed(2)}
                </span>
              </div>
              <div className={styles.successRow}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Status:</span>
                <Badge label="Reserved · Awaiting Pay" status="AWAITING_PAYMENT" />
              </div>
            </div>

            <div className={styles.successActions}>
              <Link href="/portal" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="lg" style={{ width: '100%' }} data-sfx="whoosh">
                  View in My Reservations
                </Button>
              </Link>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmedBooking(null);
                  setSelectedSlot(null);
                }}
              >
                Book Another Court
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <Link href="/portal" className={styles.brand}>
              <span className={styles.brandIcon}>🏓</span>
              <span>PicklePunto</span>
            </Link>
            <span className={styles.badge}>Court Reservation</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Link href="/portal">
              <Button variant="ghost" size="sm">
                <span className={styles.backBtnDesktop}>← Back to Dashboard</span>
                <span className={styles.backBtnMobile}>← Back</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.titleSection}>
          <h1 className={styles.pageTitle}>Reserve a Pickleball Court</h1>
          <p className={styles.pageSubtitle}>
            Select your preferred court, session duration, and equipment add-ons with instant confirmation.
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--ink-red)',
              marginBottom: 'var(--space-6)',
              fontSize: 'var(--text-sm)',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmitBooking} className={styles.wizardGrid}>
          {/* Main Booking Wizard Column */}
          <div className={styles.flowColumn}>
            {/* Step 1: Date & Duration */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.stepNumber}>1</span>
                <h2 className={styles.cardTitle}>Choose Date & Duration Block</h2>
              </div>

              {/* Date selection */}
              <div className={styles.dateRow}>
                {dateOptions.map((opt) => (
                  <button
                    type="button"
                    key={opt.date}
                    className={`${styles.datePill} ${
                      selectedDate === opt.date ? styles.datePillActive : ''
                    }`}
                    onClick={() => setSelectedDate(opt.date)}
                  >
                    {opt.label}
                  </button>
                ))}
                <input
                  type="date"
                  value={selectedDate}
                  min={todayStr}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val && val < todayStr) return;
                    setSelectedDate(val);
                  }}
                  style={{
                    background: 'var(--color-bg-subtle)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--color-text-primary)',
                    padding: '0 var(--space-3)',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </div>

              {/* Flexible Duration Blocks (30/60/90 mins) */}
              <div className={styles.durationRow}>
                {[30, 60, 90].map((d) => (
                  <button
                    type="button"
                    key={d}
                    className={`${styles.durationBtn} ${
                      selectedDuration === d ? styles.durationBtnActive : ''
                    }`}
                    onClick={() => setSelectedDuration(d as 30 | 60 | 90)}
                  >
                    <span className={styles.durationTitle}>{d} Minutes</span>
                    <span className={styles.durationSub}>
                      {d === 30 ? '30 mins' : d === 60 ? '1 hour' : '1.5 hours'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Court & Time Slot Selection */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.stepNumber}>2</span>
                <h2 className={styles.cardTitle}>Select Court & Time Slot</h2>
              </div>

              {/* 3D Court Showcase for Chosen Court */}
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <CourtStage
                  courts={bookingStageCourts}
                  selectedCourtId={selectedCourtId}
                  onSelectCourt={(id) => {
                    play('select');
                    setSelectedCourtId(id);
                    setSelectedSlot(null);
                  }}
                  title={activeCourt ? `${activeCourt.name.split(/ - |—/)[0]} · 3D View` : '3D Court View'}
                  subtitle="Tap a court chip to switch courts"
                />
              </div>

              {/* Court Cards */}
              <div className={styles.courtsGrid}>
                {courts.map((court) => {
                  const isSelected = court.id === selectedCourtId;
                  return (
                    <button
                      type="button"
                      key={court.id}
                      data-sfx="select"
                      className={`${styles.courtCard} ${
                        isSelected ? styles.courtCardSelected : ''
                      }`}
                      onClick={() => {
                        play('select');
                        setSelectedCourtId(court.id);
                        setSelectedSlot(null);
                      }}
                    >
                      <div className={styles.courtName}>{court.name}</div>
                      <div className={styles.courtMeta}>
                        <span>{court.surfaceType}</span>
                        <span className={styles.courtRate}>
                          ₱{parseFloat(court.hourlyRate).toFixed(2)}/hr
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.85 }}>
                        Hours: 5:00 AM – 2:00 AM (Next Day)
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Schedule Slots for Active Court */}
              <div className={styles.slotsSectionTitle}>
                Schedule for {activeCourt?.name} on {selectedDate} ({selectedDuration} mins):
              </div>

              {courtSlots.length === 0 ? (
                <div className={styles.noSlotsNotice}>
                  No schedule slots found for this court on the selected date.
                </div>
              ) : (
                <div className={styles.slotsGrid}>
                  {courtSlots.map((slot) => {
                    const isSlotSelected = selectedSlot?.startTime === slot.startTime;
                    const isAvail = slot.isAvailable !== false;
                    const isOpenPlay = slot.status === 'open_play';
                    const isPlaying = slot.status === 'playing';
                    const isBooked = slot.status === 'booked';
                    const slotD = new Date(slot.startTime);
                    const slotY = slotD.getFullYear();
                    const slotM = String(slotD.getMonth() + 1).padStart(2, '0');
                    const slotDay = String(slotD.getDate()).padStart(2, '0');
                    const isNextCalendarDay = `${slotY}-${slotM}-${slotDay}` !== selectedDate;

                    return (
                      <button
                        type="button"
                        key={slot.startTime}
                        disabled={!isAvail}
                        data-sfx={isAvail ? 'pop' : 'none'}
                        className={`${styles.slotBtn} ${
                          isSlotSelected ? styles.slotBtnSelected : ''
                        } ${!isAvail ? styles.slotBtnFaded : ''}`}
                        onClick={() => {
                          if (!isAvail) return;
                          play('select');
                          setSelectedSlot(slot);
                        }}
                      >
                        <span className={styles.slotTimeText}>
                          {formatTime(slot.startTime)}
                          {isNextCalendarDay && (
                            <span style={{ fontSize: '10px', opacity: 0.75, marginLeft: '4px', fontWeight: 700 }}>
                              +1d
                            </span>
                          )}
                        </span>
                        <span
                          className={`${styles.slotStatusTag} ${
                            isAvail
                              ? styles.tagAvailable
                              : isOpenPlay
                              ? styles.tagOpenPlay
                              : isPlaying
                              ? styles.tagPlaying
                              : styles.tagBooked
                          }`}
                        >
                          {isAvail
                            ? 'Available'
                            : slot.statusLabel || (isBooked ? 'Booked' : 'Unavailable')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 3: Equipment Rental Add-ons */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.stepNumber}>3</span>
                <h2 className={styles.cardTitle}>Equipment Rental Add-ons (Optional)</h2>
              </div>

              <div className={styles.addonsList}>
                {products.map((prod) => {
                  const qty = addonQuantities[prod.id] || 0;
                  return (
                    <div key={prod.id} className={styles.addonItem}>
                      <div className={styles.addonInfo}>
                        <span className={styles.addonName}>{prod.name}</span>
                        <span className={styles.addonPrice}>
                          ₱{parseFloat(prod.price).toFixed(2)} each · {prod.stockQty ?? prod.stockQuantity ?? 0} in stock
                        </span>
                      </div>
                      <div className={styles.addonControls}>
                        <button
                          type="button"
                          className={styles.counterBtn}
                          disabled={qty <= 0}
                          onClick={() => updateAddonQty(prod.id, -1)}
                        >
                          -
                        </button>
                        <span className={styles.counterVal}>{qty}</span>
                        <button
                          type="button"
                          className={styles.counterBtn}
                          disabled={qty >= (prod.stockQty ?? prod.stockQuantity ?? 0)}
                          onClick={() => updateAddonQty(prod.id, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 4: Split Payment Option */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.stepNumber}>4</span>
                <h2 className={styles.cardTitle}>Split Payment Shares</h2>
              </div>

              <div className={styles.splitSection}>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  Are you sharing this reservation with other players?
                </div>
                <div className={styles.splitButtons}>
                  {[1, 2, 3, 4].map((count) => (
                    <button
                      type="button"
                      key={count}
                      className={`${styles.splitBtn} ${
                        splitCount === count ? styles.splitBtnActive : ''
                      }`}
                      onClick={() => setSplitCount(count)}
                    >
                      {count === 1 ? '1 Player (Full)' : `${count} Players`}
                    </button>
                  ))}
                </div>

                {splitCount > 1 && (
                  <div className={styles.splitShareBanner}>
                    <span>Calculated Share per Player ({splitCount} ways):</span>
                    <span className={styles.splitShareValue}>
                      ₱{sharePerPlayer.toFixed(2)} / player
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sticky Summary & Checkout Sidebar */}
          <div className={styles.summarySidebar}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryHeader}>
                <span>Reservation Summary</span>
                <Badge label="New Booking" status="OPEN" />
              </div>

              <div className={styles.summaryLineItems}>
                <div className={styles.summaryRow}>
                  <span>Court:</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {activeCourt?.name}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Date & Duration:</span>
                  <span>
                    {selectedDate} · {selectedDuration}m
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Selected Time:</span>
                  <span style={{ fontWeight: 600, color: selectedSlot ? 'var(--color-brand-accent)' : 'var(--ink-red)' }}>
                    {selectedSlot ? formatTime(selectedSlot.startTime) : 'Select a slot'}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Court Rental Fee:</span>
                  <span>₱{courtFee.toFixed(2)}</span>
                </div>

                {addonsTotal > 0 && (
                  <div className={styles.summaryRow}>
                    <span>Gear Rentals Add-on:</span>
                    <span>₱{addonsTotal.toFixed(2)}</span>
                  </div>
                )}

                <div className={styles.summaryRowTotal}>
                  <span>Total Due:</span>
                  <span className={styles.totalAmount}>₱{totalAmount.toFixed(2)}</span>
                </div>

                {splitCount > 1 && (
                  <div className={styles.summaryRow} style={{ color: 'var(--color-brand-accent)', fontWeight: 600 }}>
                    <span>Your Share (1 of {splitCount}):</span>
                    <span>₱{sharePerPlayer.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* E-wallet Skeleton Payment Instructions */}
              <div className={styles.ewalletCard}>
                <div className={styles.ewalletTitle}>
                  <span>📲</span>
                  <span>E-Wallet Transfer Skeleton</span>
                </div>
                <div className={styles.ewalletDetail}>
                  <span>Recipient:</span>
                  <strong>{ewallet.accountName}</strong>
                </div>
                <div className={styles.ewalletDetail}>
                  <span>GCash Mobile:</span>
                  <strong>{ewallet.gcashNumber}</strong>
                </div>
                <div className={styles.ewalletDetail}>
                  <span>Maya Mobile:</span>
                  <strong>{ewallet.mayaNumber}</strong>
                </div>
              </div>

              {/* Reference number and notes input */}
              <div className={styles.refInputGroup}>
                <label htmlFor="input-pay-ref" className={styles.refLabel}>
                  E-Wallet Reference # (Optional)
                </label>
                <input
                  id="input-pay-ref"
                  className={styles.refInput}
                  placeholder="e.g. GCASH-1234567890"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                />
              </div>

              <div className={styles.refInputGroup}>
                <label htmlFor="input-notes" className={styles.refLabel}>
                  Notes for Facility Staff
                </label>
                <input
                  id="input-notes"
                  className={styles.refInput}
                  placeholder="e.g. Beginners game, right net"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <Button
                id="btn-submit-booking"
                type="button"
                onClick={() => handleSubmitBooking()}
                variant="primary"
                size="lg"
                loading={submitting}
                disabled={!selectedSlot || submitting}
                style={{ width: '100%' }}
              >
                {selectedSlot ? 'Reserve Court Slot' : 'Select Time Slot to Continue'}
              </Button>

              <p className={styles.policyNotice}>
                🛡️ 12-Hour Cancellation Policy: Free cancellation up to 12 hours before session start.
              </p>
            </div>
          </div>
        </form>

        {/* Floating Mobile Booking Bar - Always ready at bottom for player's thumb */}
        <aside className={styles.mobileFloatingBar} aria-label="Mobile booking action bar">
          <div className={styles.mobileBarDetails}>
            <div className={styles.mobileBarCourt}>
              {selectedSlot
                ? (activeCourt?.name?.split(/[-—:]/)[0]?.trim() || 'Court')
                : 'Pick a Time Slot'}
            </div>
            <div className={styles.mobileBarSlot}>
              {selectedSlot ? (
                <>
                  {formatTime(selectedSlot.startTime)} ({selectedDuration}m) ·{' '}
                  <span className={styles.mobileBarPrice}>₱{totalAmount.toFixed(2)}</span>
                </>
              ) : (
                <span>Tap any time slot above</span>
              )}
            </div>
          </div>
          <Button
            type="button"
            onClick={() => handleSubmitBooking()}
            variant="primary"
            size="md"
            loading={submitting}
            disabled={!selectedSlot || submitting}
            data-sfx="whoosh"
          >
            {selectedSlot ? 'Reserve Slot' : 'Select Slot'}
          </Button>
        </aside>
      </main>
    </div>
  );
}
