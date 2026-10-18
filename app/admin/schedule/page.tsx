'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { CourtDto } from '@/types';
import { formatDate, formatTimeString } from '@/lib/utils/date';
import { useRealtimeSchedule } from '@/lib/hooks/useRealtimeSchedule';
import { addDays, subDays, format } from 'date-fns';
import styles from './schedule.module.css';
import pageStyles from '../admin.module.css';

// 30-minute intervals from 06:00 to 22:00
const TIME_SLOTS = [
  '06:00', '06:30', '07:00', '07:30', '08:00', '08:30',
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
  '21:00', '21:30', '22:00',
];

export default function AdminSchedulePage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [courts, setCourts] = useState<CourtDto[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals & Panels
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);

  // Booking Form State
  const [bookCourtId, setBookCourtId] = useState('');
  const [bookPlayerId, setBookPlayerId] = useState('');
  const [bookStartTime, setBookStartTime] = useState('09:00');
  const [bookDuration, setBookDuration] = useState<number>(60);
  const [bookNotes, setBookNotes] = useState('');
  const [bookPaddleQty, setBookPaddleQty] = useState<number>(0);
  const [bookBallQty, setBookBallQty] = useState<number>(0);
  const [bookSplitCount, setBookSplitCount] = useState<number>(1);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Walk-in Form State
  const [isWalkInMode, setIsWalkInMode] = useState<boolean>(false);
  const [walkInIsNewPlayer, setWalkInIsNewPlayer] = useState<boolean>(true);
  const [walkInName, setWalkInName] = useState<string>('');
  const [walkInPhone, setWalkInPhone] = useState<string>('');
  const [walkInEmail, setWalkInEmail] = useState<string>('');
  const [walkInPayMethod, setWalkInPayMethod] = useState<'CASH' | 'EWALLET' | 'LATER'>('CASH');
  const [walkInCashTendered, setWalkInCashTendered] = useState<string>('');
  const [walkInEwalletRef, setWalkInEwalletRef] = useState<string>('');

  // Block Form State
  const [blockCourtId, setBlockCourtId] = useState('');
  const [blockStartTime, setBlockStartTime] = useState('12:00');
  const [blockEndTime, setBlockEndTime] = useState('14:00');
  const [blockReason, setBlockReason] = useState('Court Maintenance & Cleaning');
  const [submittingBlock, setSubmittingBlock] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  // Payment Verification State
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'EWALLET' | 'CASH'>('EWALLET');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const loadSchedule = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch courts, bookings, blocks, users, and products in parallel
      const [courtsRes, bookingsRes, blocksRes, usersRes, productsRes] = await Promise.all([
        fetch('/api/courts'),
        fetch(`/api/bookings?date=${dateStr}`),
        fetch(`/api/court-blocks?date=${dateStr}`),
        fetch('/api/users'),
        fetch('/api/products'),
      ]);

      const [courtsJson, bookingsJson, blocksJson, usersJson, productsJson] = await Promise.all([
        courtsRes.json(),
        bookingsRes.json(),
        blocksRes.json(),
        usersRes.json(),
        productsRes.json(),
      ]);

      if (courtsJson.data) setCourts(courtsJson.data);
      if (bookingsJson.data) setBookings(bookingsJson.data);
      if (blocksJson.data) setBlocks(blocksJson.data);
      if (usersJson.data) {
        setUsers(usersJson.data);
        if (usersJson.data.length > 0 && !bookPlayerId) {
          setBookPlayerId(usersJson.data[0].id);
        }
      }
      if (productsJson.data) setProducts(productsJson.data);
    } catch (err) {
      console.error('Failed to load schedule data:', err);
    } finally {
      setLoading(false);
    }
  }, [dateStr, bookPlayerId]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Real-time synchronization via Supabase Realtime Hook
  const { isConnected: isRealtimeConnected } = useRealtimeSchedule(loadSchedule);

  function prevDay() {
    setSelectedDate((curr) => subDays(curr, 1));
  }

  function nextDay() {
    setSelectedDate((curr) => addDays(curr, 1));
  }

  function goToday() {
    setSelectedDate(new Date());
  }

  function isCourtOpen(court: CourtDto, timeSlot: string): boolean {
    return timeSlot >= court.openingTime && timeSlot < court.closingTime;
  }

  function getBookingAtSlot(courtId: string, timeSlot: string) {
    const slotTarget = new Date(`${dateStr}T${timeSlot}:00`);
    return bookings.find((b) => {
      if (b.courtId !== courtId || b.status === 'CANCELLED' || b.status === 'NO_SHOW') return false;
      const bStart = new Date(b.startTime);
      const bEnd = new Date(b.endTime);
      return slotTarget >= bStart && slotTarget < bEnd;
    });
  }

  function getBlockAtSlot(courtId: string, timeSlot: string) {
    const slotTarget = new Date(`${dateStr}T${timeSlot}:00`);
    return blocks.find((blk) => {
      if (blk.courtId !== courtId) return false;
      const blkStart = new Date(blk.blockedFrom);
      const blkEnd = new Date(blk.blockedTo);
      return slotTarget >= blkStart && slotTarget < blkEnd;
    });
  }

  // Interactive slot click
  function handleSlotClick(courtId: string, timeSlot: string) {
    const slotTarget = new Date(`${dateStr}T${timeSlot}:00`);
    if (slotTarget.getTime() <= Date.now()) {
      alert('Cannot reserve or book a slot in the past. Please select an upcoming slot or use Walk-in.');
      return;
    }
    setIsWalkInMode(false);
    setWalkInIsNewPlayer(false);
    setBookCourtId(courtId);
    setBookStartTime(timeSlot);
    setBookDuration(60);
    setBookPaddleQty(0);
    setBookBallQty(0);
    setBookSplitCount(1);
    setBookNotes('');
    setBookingError(null);
    setIsBookingModalOpen(true);
  }

  // Open Walk-in Modal for immediate physical customer play
  function handleOpenWalkInModal(courtId?: string, timeSlot?: string) {
    setIsWalkInMode(true);
    setWalkInIsNewPlayer(true);
    setWalkInName('');
    setWalkInPhone('');
    setWalkInEmail('');
    setWalkInPayMethod('CASH');
    setWalkInCashTendered('');
    setWalkInEwalletRef('');
    setBookCourtId(courtId || (courts.length > 0 ? courts[0].id : ''));

    if (timeSlot) {
      setBookStartTime(timeSlot);
    } else {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = now.getMinutes() < 30 ? '00' : '30';
      setBookStartTime(`${h}:${m}`);
    }

    setBookDuration(60);
    setBookPaddleQty(0);
    setBookBallQty(0);
    setBookSplitCount(1);
    setBookNotes('');
    setBookingError(null);
    setIsBookingModalOpen(true);
  }

  // Open Block Modal
  function handleOpenBlockModal(courtId?: string) {
    setBlockCourtId(courtId || (courts.length > 0 ? courts[0].id : ''));
    setBlockStartTime('12:00');
    setBlockEndTime('14:00');
    setBlockReason('Court Maintenance & Surface Cleaning');
    setBlockError(null);
    setIsBlockModalOpen(true);
  }

  // Price calculations for booking modal
  const selectedCourt = courts.find((c) => c.id === bookCourtId);
  const paddleProduct = products.find((p) => p.sku === 'RENT-PAD-01');
  const ballProduct = products.find((p) => p.sku === 'RET-BALL-03');

  const courtHourlyRate = selectedCourt ? parseFloat(selectedCourt.hourlyRate) : 35;
  const courtTotal = (courtHourlyRate * bookDuration) / 60;
  const paddleTotal = paddleProduct ? parseFloat(paddleProduct.price) * bookPaddleQty : 0;
  const ballTotal = ballProduct ? parseFloat(ballProduct.price) * bookBallQty : 0;
  const totalAmount = courtTotal + paddleTotal + ballTotal;
  const perPersonShare = (totalAmount / Math.max(1, bookSplitCount)).toFixed(2);

  // Submit new booking (supports Advance Reservation and ⚡ Walk-in)
  async function handleCreateBooking(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingBooking(true);
    setBookingError(null);

    try {
      const slotTarget = new Date(`${dateStr}T${bookStartTime}:00`);

      if (!isWalkInMode && slotTarget.getTime() <= Date.now()) {
        throw new Error('Cannot create an advance reservation in the past. Please select an upcoming slot.');
      }

      const slotEnd = new Date(slotTarget.getTime() + bookDuration * 60000);
      if (isWalkInMode && slotEnd.getTime() <= Date.now()) {
        throw new Error('Cannot create a walk-in for a time slot that has already concluded.');
      }

      const fullStartTime = slotTarget.toISOString();

      const addonsPayload = [];
      if (paddleProduct && bookPaddleQty > 0) {
        addonsPayload.push({ productId: paddleProduct.id, quantity: bookPaddleQty });
      }
      if (ballProduct && bookBallQty > 0) {
        addonsPayload.push({ productId: ballProduct.id, quantity: bookBallQty });
      }

      const payload: any = {
        courtId: bookCourtId,
        startTime: fullStartTime,
        durationMinutes: bookDuration,
        notes: bookNotes,
        addons: addonsPayload,
        participantCount: bookSplitCount,
        isWalkIn: isWalkInMode,
      };

      if (isWalkInMode) {
        if (walkInIsNewPlayer) {
          if (!walkInName.trim()) {
            throw new Error('Please enter walk-in customer full name.');
          }
          payload.walkInCustomer = {
            fullName: walkInName.trim(),
            phone: walkInPhone.trim() || undefined,
            email: walkInEmail.trim() || undefined,
          };
        } else {
          payload.leadBookerId = bookPlayerId;
        }

        if (walkInPayMethod === 'CASH') {
          payload.initialStatus = 'CONFIRMED';
          payload.paymentMethod = 'CASH';
          payload.paymentReference = walkInCashTendered
            ? `Tendered $${parseFloat(walkInCashTendered).toFixed(2)} (Change: $${Math.max(0, parseFloat(walkInCashTendered) - totalAmount).toFixed(2)})`
            : 'Paid Cash at Counter';
        } else if (walkInPayMethod === 'EWALLET') {
          payload.initialStatus = 'CONFIRMED';
          payload.paymentMethod = 'EWALLET';
          payload.paymentReference = walkInEwalletRef.trim() || 'E-Wallet Verified at Counter';
        } else {
          payload.initialStatus = 'AWAITING_PAYMENT';
        }
      } else {
        payload.leadBookerId = bookPlayerId;
        payload.initialStatus = 'AWAITING_PAYMENT';
      }

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to create booking');
      }

      setIsBookingModalOpen(false);
      loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating reservation';
      setBookingError(msg);
    } finally {
      setSubmittingBooking(false);
    }
  }

  // Submit court block
  async function handleCreateBlock(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingBlock(true);
    setBlockError(null);

    try {
      const startIso = new Date(`${dateStr}T${blockStartTime}:00`).toISOString();
      const endIso = new Date(`${dateStr}T${blockEndTime}:00`).toISOString();

      const res = await fetch('/api/court-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courtId: blockCourtId,
          blockedFrom: startIso,
          blockedTo: endIso,
          reason: blockReason,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to block court');
      }

      setIsBlockModalOpen(false);
      loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error blocking court';
      setBlockError(msg);
    } finally {
      setSubmittingBlock(false);
    }
  }

  // Remove block
  async function handleRemoveBlock(blockId: string) {
    if (!confirm('Unblock this court time?')) return;
    try {
      await fetch(`/api/court-blocks/${blockId}`, { method: 'DELETE' });
      loadSchedule();
    } catch (err) {
      console.error('Error removing block:', err);
    }
  }

  // Confirm payment for selected booking
  async function handleConfirmPayment(participantId?: string) {
    if (!selectedBooking) return;
    setVerifyingPayment(true);
    setPaymentError(null);

    try {
      const res = await fetch(`/api/bookings/${selectedBooking.id}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod,
          paymentReference: paymentRef || 'Verified at counter',
          participantId,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to verify payment');
      }

      setSelectedBooking(null);
      setPaymentRef('');
      loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error confirming payment';
      setPaymentError(msg);
    } finally {
      setVerifyingPayment(false);
    }
  }

  // Cancel / Void booking from drawer
  async function handleCancelSelectedBooking(status: 'CANCELLED' | 'NO_SHOW' = 'CANCELLED') {
    if (!selectedBooking) return;
    const actionLabel = status === 'NO_SHOW' ? 'void this reservation as No-Show' : 'cancel this reservation';
    if (!confirm(`Are you sure you want to ${actionLabel}? This slot will immediately open for other players.`)) return;

    try {
      if (status === 'NO_SHOW') {
        const res = await fetch(`/api/bookings/${selectedBooking.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'NO_SHOW',
            notes: `${selectedBooking.notes ? selectedBooking.notes + ' | ' : ''}Voided: 30-minute onsite physical no-show policy by staff`,
          }),
        });
        if (!res.ok) throw new Error('Failed to void booking');
      } else {
        const res = await fetch(`/api/bookings/${selectedBooking.id}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to cancel booking');
      }
      setSelectedBooking(null);
      loadSchedule();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error modifying booking');
    }
  }

  return (
    <>
      <AdminHeader
        title="Court Schedule Timeline"
        subtitle="Real-time multi-court schedule grid respecting individual operating hours & court blocks"
        actions={
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              id="btn-walkin-booking"
              variant="primary"
              onClick={() => handleOpenWalkInModal()}
            >
              ⚡ Walk-in Booking
            </Button>
            <Button
              id="btn-block-court"
              variant="secondary"
              onClick={() => handleOpenBlockModal()}
            >
              🔒 Block Court
            </Button>
            <Button id="btn-refresh-schedule" variant="ghost" onClick={loadSchedule}>
              🔄 Refresh
            </Button>
          </div>
        }
      />

      <main className={pageStyles.pageContent}>
        <div className={styles.scheduleContainer}>
          {/* Controls Bar */}
          <div className={styles.controlsBar}>
            <div className={styles.dateNav}>
              <button
                type="button"
                id="btn-prev-day"
                className={styles.navArrowBtn}
                onClick={prevDay}
                aria-label="Previous Day"
              >
                ◀ Prev
              </button>
              <button
                type="button"
                id="btn-today"
                className={styles.navArrowBtn}
                onClick={goToday}
              >
                Today
              </button>
              <button
                type="button"
                id="btn-next-day"
                className={styles.navArrowBtn}
                onClick={nextDay}
                aria-label="Next Day"
              >
                Next ▶
              </button>

              <span className={styles.dateDisplay} id="schedule-date-display">
                {formatDate(selectedDate)}
              </span>

              <input
                type="date"
                value={dateStr}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedDate(new Date(`${e.target.value}T00:00:00`));
                  }
                }}
                style={{
                  background: 'var(--color-bg-raised)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                }}
              />
            </div>

            <div className={styles.rightControls}>
              <div className={styles.realtimeBadge} title="Real-time WebSocket sync enabled">
                <span className={styles.pulseDot} />
                <span>{isRealtimeConnected ? 'Live Realtime Active' : 'Connecting Sync...'}</span>
              </div>

              {/* Legend */}
              <div className={styles.legend}>
                <div className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendAvailable}`} />
                  <span>Available</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendAwaiting}`} />
                  <span>Reserved</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendBooked}`} />
                  <span>Booked</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                  <span>Using</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: '#a855f7', boxShadow: '0 0 8px #a855f7' }} />
                  <span>Walk-in</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendBlocked}`} />
                  <span>Blocked</span>
                </div>
                <div className={styles.legendItem}>
                  <span className={`${styles.legendDot} ${styles.legendClosed}`} />
                  <span>Closed</span>
                </div>
              </div>
            </div>
          </div>

          {/* Schedule Grid Table */}
          <div className={styles.timelineWrapper}>
            <table className={styles.timelineTable} id="table-schedule-grid">
              <thead>
                <tr>
                  <th className={styles.timeHeaderCol}>Time</th>
                  {courts.map((court) => (
                    <th key={court.id} className={styles.courtHeaderCol}>
                      <div className={styles.courtTitle}>{court.name}</div>
                      <div className={styles.courtSubtitle}>
                        ${parseFloat(court.hourlyRate).toFixed(2)}/hr · {court.surfaceType}
                      </div>
                      <span className={styles.courtHoursTag}>
                        Hours: {formatTimeString(court.openingTime)} – {formatTimeString(court.closingTime)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map((slot) => (
                  <tr key={slot}>
                    <td className={styles.timeCell}>{formatTimeString(slot)}</td>
                    {courts.map((court) => {
                      const open = isCourtOpen(court, slot);
                      const block = open ? getBlockAtSlot(court.id, slot) : null;
                      const booking = open && !block ? getBookingAtSlot(court.id, slot) : null;

                      if (!open) {
                        return (
                          <td key={court.id} className={`${styles.slotCell} ${styles.slotClosed}`}>
                            Closed
                          </td>
                        );
                      }

                      if (block) {
                        return (
                          <td
                            key={court.id}
                            className={styles.slotCell}
                            onClick={() => handleRemoveBlock(block.id)}
                            title={`Blocked: ${block.reason}. Click to unblock.`}
                          >
                            <div className={styles.blockedBlock}>
                              <span className={styles.blockedTitle}>🔒 {block.reason}</span>
                              <span className={styles.blockedSubtitle}>Maintenance Block</span>
                            </div>
                          </td>
                        );
                      }

                      if (booking) {
                        const now = new Date();
                        const isConfirmed = booking.status === 'CONFIRMED';
                        const isUsing = isConfirmed && new Date(booking.startTime) <= now && new Date(booking.endTime) >= now;
                        const isWalkIn = Boolean(booking.isWalkIn) || booking.notes?.includes('Walk-in') || booking.notes?.includes('ðŸš¶');

                        return (
                          <td
                            key={court.id}
                            className={styles.slotCell}
                            onClick={() => setSelectedBooking(booking)}
                          >
                            <div
                              className={`${styles.bookingBlock} ${
                                isUsing
                                  ? styles.bookingUsing
                                  : isWalkIn
                                  ? styles.bookingWalkIn
                                  : isConfirmed
                                  ? styles.bookingConfirmed
                                  : styles.bookingAwaiting
                              }`}
                              title={isWalkIn ? `ðŸš¶ Walk-in Session: ${booking.leadBookerName}` : `Click to view reservation & verify payment`}
                            >
                              <span className={styles.bookingBooker}>
                                {isUsing ? 'ðŸŸ¢ ' : isWalkIn ? 'ðŸš¶ ' : '🎾 '}{booking.leadBookerName}
                              </span>
                              <span className={styles.bookingMeta}>
                                {booking.durationMinutes}m · {isUsing ? 'USING' : isWalkIn ? 'WALK-IN' : isConfirmed ? 'BOOKED' : 'RESERVED'}
                              </span>
                            </div>
                          </td>
                        );
                      }

                      const slotDate = new Date(`${dateStr}T${slot}:00`);
                      const slotEnd = new Date(slotDate.getTime() + 30 * 60000);
                      const isConcluded = slotEnd.getTime() <= Date.now();
                      const isOngoing = slotDate.getTime() <= Date.now() && !isConcluded;

                      return (
                        <td
                          key={court.id}
                          className={styles.slotCell}
                          onClick={() => {
                            if (isConcluded) {
                              alert('Cannot reserve or book a slot that has already concluded. Please select an upcoming slot.');
                              return;
                            }
                            if (isOngoing) {
                              handleOpenWalkInModal(court.id, slot);
                              return;
                            }
                            handleSlotClick(court.id, slot);
                          }}
                          title={
                            isConcluded
                              ? 'Concluded slot'
                              : isOngoing
                              ? `Click for immediate Walk-in play on ${court.name}`
                              : `Click to reserve ${court.name} at ${formatTimeString(slot)}`
                          }
                        >
                          <div
                            className={styles.slotAvailable}
                            style={
                              isConcluded
                                ? { opacity: 0.35, cursor: 'not-allowed' }
                                : isOngoing
                                ? { opacity: 0.85, background: 'rgba(168, 85, 247, 0.12)', border: '1px dashed #a855f7' }
                                : undefined
                            }
                          >
                            <span
                              className={styles.slotAvailableText}
                              style={isOngoing ? { display: 'inline', color: 'var(--ink-purple)', fontWeight: 600 } : undefined}
                            >
                              {isConcluded ? '— Past' : isOngoing ? '⚡ Walk-in' : '+ Reserve'}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* â”€â”€ Booking / Walk-in Modal â”€â”€ */}
        {isBookingModalOpen && (
          <div className={pageStyles.modalBackdrop}>
            <div className={pageStyles.modalCard} role="dialog" aria-modal="true">
              <div className={pageStyles.modalHeader}>
                <h2 className={pageStyles.modalTitle}>
                  {isWalkInMode ? '⚡ Register Walk-in Player' : 'Reserve Court Slot'}
                </h2>
                <button
                  type="button"
                  className={pageStyles.modalClose}
                  onClick={() => setIsBookingModalOpen(false)}
                >
                  âœ•
                </button>
              </div>

              {/* Mode Switcher Tabs */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                <button
                  type="button"
                  id="tab-mode-advance"
                  onClick={() => setIsWalkInMode(false)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: !isWalkInMode ? '2px solid var(--color-brand-500)' : '1px solid var(--color-border)',
                    background: !isWalkInMode ? 'rgba(34, 197, 94, 0.15)' : 'var(--color-bg-raised)',
                    color: !isWalkInMode ? 'var(--color-brand-400)' : 'var(--color-text-secondary)',
                    fontWeight: 600,
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  ðŸ“… Advance Reservation
                </button>
                <button
                  type="button"
                  id="tab-mode-walkin"
                  onClick={() => setIsWalkInMode(true)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: isWalkInMode ? '2px solid #a855f7' : '1px solid var(--color-border)',
                    background: isWalkInMode ? 'rgba(168, 85, 247, 0.2)' : 'var(--color-bg-raised)',
                    color: isWalkInMode ? 'var(--ink-purple)' : 'var(--color-text-secondary)',
                    fontWeight: 600,
                    fontSize: 'var(--text-xs)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  ⚡ Walk-in (Immediate Play)
                </button>
              </div>

              {bookingError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--color-error)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                  {bookingError}
                </div>
              )}

              <form onSubmit={handleCreateBooking} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {/* Walk-in Player Info Section */}
                {isWalkInMode && (
                  <div style={{ background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-purple)' }}>
                        Walk-in Player Details
                      </span>
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <button
                          type="button"
                          id="btn-walkin-guest"
                          onClick={() => setWalkInIsNewPlayer(true)}
                          style={{
                            background: walkInIsNewPlayer ? 'rgba(168, 85, 247, 0.3)' : 'transparent',
                            border: walkInIsNewPlayer ? '1px solid #a855f7' : '1px solid var(--color-border)',
                            color: walkInIsNewPlayer ? 'var(--ink-purple)' : 'var(--color-text-muted)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          + New Guest
                        </button>
                        <button
                          type="button"
                          id="btn-walkin-registered"
                          onClick={() => setWalkInIsNewPlayer(false)}
                          style={{
                            background: !walkInIsNewPlayer ? 'rgba(168, 85, 247, 0.3)' : 'transparent',
                            border: !walkInIsNewPlayer ? '1px solid #a855f7' : '1px solid var(--color-border)',
                            color: !walkInIsNewPlayer ? 'var(--ink-purple)' : 'var(--color-text-muted)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Existing Player
                        </button>
                      </div>
                    </div>

                    {walkInIsNewPlayer ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 'var(--space-2)' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                            Full Name *
                          </label>
                          <input
                            id="input-walkin-name"
                            type="text"
                            placeholder="e.g. Alex Santos"
                            value={walkInName}
                            onChange={(e) => setWalkInName(e.target.value)}
                            required={isWalkInMode && walkInIsNewPlayer}
                            style={{ width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                            Phone (Optional)
                          </label>
                          <input
                            id="input-walkin-phone"
                            type="tel"
                            placeholder="0917-xxx-xxxx"
                            value={walkInPhone}
                            onChange={(e) => setWalkInPhone(e.target.value)}
                            style={{ width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                            Email (Optional)
                          </label>
                          <input
                            id="input-walkin-email"
                            type="email"
                            placeholder="alex@gmail.com"
                            value={walkInEmail}
                            onChange={(e) => setWalkInEmail(e.target.value)}
                            style={{ width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)' }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                          Select Existing Registered Player
                        </label>
                        <select
                          id="modal-walkin-registered-player"
                          value={bookPlayerId}
                          onChange={(e) => setBookPlayerId(e.target.value)}
                          style={{ width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)' }}
                          required={isWalkInMode && !walkInIsNewPlayer}
                        >
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.fullName} ({u.email})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Court and Time Selection */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                      Court
                    </label>
                    <select
                      id="modal-court-select"
                      value={bookCourtId}
                      onChange={(e) => setBookCourtId(e.target.value)}
                      style={{ width: '100%', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}
                      required
                    >
                      {courts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (${parseFloat(c.hourlyRate).toFixed(0)}/hr)
                        </option>
                      ))}
                    </select>
                  </div>

                  {!isWalkInMode ? (
                    <div>
                      <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                        Player Account
                      </label>
                      <select
                        id="modal-player-select"
                        value={bookPlayerId}
                        onChange={(e) => setBookPlayerId(e.target.value)}
                        style={{ width: '100%', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}
                        required={!isWalkInMode}
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.fullName} ({u.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                        Start Time (Immediate / Slot)
                      </label>
                      <Input
                        id="modal-start-time"
                        type="time"
                        value={bookStartTime}
                        onChange={(e) => setBookStartTime(e.target.value)}
                        required
                      />
                    </div>
                  )}
                </div>

                {!isWalkInMode && (
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                      Start Time
                    </label>
                    <Input
                      id="modal-start-time"
                      type="time"
                      value={bookStartTime}
                      onChange={(e) => setBookStartTime(e.target.value)}
                      required
                    />
                  </div>
                )}

                {/* Duration Selector Pills (Flexible Blocks) */}
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    Session Duration (Flexible Blocks)
                  </label>
                  <div className={styles.pillGroup}>
                    {[30, 60, 90].map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        id={`pill-duration-${dur}`}
                        className={`${styles.pillBtn} ${bookDuration === dur ? styles.pillActive : ''}`}
                        onClick={() => setBookDuration(dur)}
                      >
                        {dur} Min
                      </button>
                    ))}
                  </div>
                </div>

                {/* Equipment Rental Add-ons */}
                <div style={{ background: 'var(--color-bg-raised)', border: '1px solid var(--color-border)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)', display: 'block', marginBottom: 'var(--space-2)' }}>
                    Equipment Rental Add-ons
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'block' }}>
                        Paddle Rentals ($5 each)
                      </label>
                      <input
                        id="input-paddle-qty"
                        type="number"
                        min="0"
                        max="8"
                        value={bookPaddleQty}
                        onChange={(e) => setBookPaddleQty(parseInt(e.target.value, 10) || 0)}
                        style={{ width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', marginTop: '2px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'block' }}>
                        Ball Can 3-pk ($9.50)
                      </label>
                      <input
                        id="input-ball-qty"
                        type="number"
                        min="0"
                        max="5"
                        value={bookBallQty}
                        onChange={(e) => setBookBallQty(parseInt(e.target.value, 10) || 0)}
                        style={{ width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', marginTop: '2px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Split Payment / Number of Players */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                      Split Payment Players
                    </label>
                    <select
                      id="select-split-count"
                      value={bookSplitCount}
                      onChange={(e) => setBookSplitCount(parseInt(e.target.value, 10))}
                      style={{ width: '100%', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}
                    >
                      <option value="1">1 Player (Full payment)</option>
                      <option value="2">2 Players (50% each)</option>
                      <option value="3">3 Players (33.3% each)</option>
                      <option value="4">4 Players (25% each)</option>
                    </select>
                  </div>

                  <div style={{ background: 'var(--color-bg-raised)', border: '1px solid var(--color-border)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', textAlign: 'right' }}>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block' }}>
                      TOTAL AMOUNT
                    </span>
                    <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--color-brand-400)' }}>
                      ${totalAmount.toFixed(2)}
                    </strong>
                    {bookSplitCount > 1 && (
                      <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}>
                        (${perPersonShare} / person)
                      </span>
                    )}
                  </div>
                </div>

                {/* Walk-in Counter Payment Section */}
                {isWalkInMode && (
                  <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-brand-400)' }}>
                        💵 Counter Checkout / Immediate Payment
                      </span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          id="btn-pay-cash"
                          onClick={() => setWalkInPayMethod('CASH')}
                          style={{
                            background: walkInPayMethod === 'CASH' ? 'var(--color-lime-400)' : 'var(--color-bg-surface)',
                            border: '1px solid var(--color-border)',
                            color: walkInPayMethod === 'CASH' ? 'var(--color-brand-700)' : 'var(--color-text-secondary)',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          💵 Cash
                        </button>
                        <button
                          type="button"
                          id="btn-pay-ewallet"
                          onClick={() => setWalkInPayMethod('EWALLET')}
                          style={{
                            background: walkInPayMethod === 'EWALLET' ? '#3b82f6' : 'var(--color-bg-surface)',
                            border: '1px solid var(--color-border)',
                            color: walkInPayMethod === 'EWALLET' ? '#fff' : 'var(--color-text-secondary)',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          ðŸ“± E-Wallet
                        </button>
                        <button
                          type="button"
                          id="btn-pay-later"
                          onClick={() => setWalkInPayMethod('LATER')}
                          style={{
                            background: walkInPayMethod === 'LATER' ? '#eab308' : 'var(--color-bg-surface)',
                            border: '1px solid var(--color-border)',
                            color: walkInPayMethod === 'LATER' ? 'var(--color-brand-700)' : 'var(--color-text-secondary)',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          â³ Pay Later
                        </button>
                      </div>
                    </div>

                    {walkInPayMethod === 'CASH' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', alignItems: 'center' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                            Cash Tendered ($)
                          </label>
                          <input
                            id="input-cash-tendered"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder={`e.g. ${Math.ceil(totalAmount)}`}
                            value={walkInCashTendered}
                            onChange={(e) => setWalkInCashTendered(e.target.value)}
                            style={{ width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)' }}
                          />
                        </div>
                        <div style={{ background: 'var(--color-bg-surface)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block' }}>CHANGE DUE</span>
                          <strong style={{ fontSize: 'var(--text-sm)', color: (parseFloat(walkInCashTendered) || 0) >= totalAmount ? 'var(--color-brand-400)' : 'var(--color-text-muted)' }}>
                            ${Math.max(0, (parseFloat(walkInCashTendered) || 0) - totalAmount).toFixed(2)}
                          </strong>
                        </div>
                      </div>
                    )}

                    {walkInPayMethod === 'EWALLET' && (
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                          Reference / Transaction No. (Optional)
                        </label>
                        <input
                          id="input-ewallet-ref"
                          type="text"
                          placeholder="e.g. GCash / Maya Ref #"
                          value={walkInEwalletRef}
                          onChange={(e) => setWalkInEwalletRef(e.target.value)}
                          style={{ width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)' }}
                        />
                      </div>
                    )}

                    {walkInPayMethod === 'LATER' && (
                      <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Player will be registered as Awaiting Payment. Payment can be verified in the drawer before session ends.
                      </p>
                    )}
                  </div>
                )}

                <Input
                  id="modal-notes"
                  label="Session Notes (Optional)"
                  placeholder="e.g. League practice, need balls upon arrival"
                  value={bookNotes}
                  onChange={(e) => setBookNotes(e.target.value)}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                  <Button type="button" variant="ghost" onClick={() => setIsBookingModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button id="btn-submit-reservation" type="submit" variant="primary" loading={submittingBooking}>
                    {isWalkInMode ? '⚡ Confirm Walk-in & Start Play' : 'Create Reservation'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* â”€â”€ Court Blocking Modal (Maintenance & Event Drag-to-block) â”€â”€ */}
        {isBlockModalOpen && (
          <div className={pageStyles.modalBackdrop}>
            <div className={pageStyles.modalCard} role="dialog" aria-modal="true">
              <div className={pageStyles.modalHeader}>
                <h2 className={pageStyles.modalTitle}>Block Court for Maintenance</h2>
                <button
                  type="button"
                  className={pageStyles.modalClose}
                  onClick={() => setIsBlockModalOpen(false)}
                >
                  âœ•
                </button>
              </div>

              {blockError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--color-error)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                  {blockError}
                </div>
              )}

              <form onSubmit={handleCreateBlock} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                    Select Court to Block
                  </label>
                  <select
                    id="block-court-select"
                    value={blockCourtId}
                    onChange={(e) => setBlockCourtId(e.target.value)}
                    style={{ width: '100%', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}
                    required
                  >
                    {courts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <Input
                    id="block-start-time"
                    label="Block From"
                    type="time"
                    value={blockStartTime}
                    onChange={(e) => setBlockStartTime(e.target.value)}
                    required
                  />

                  <Input
                    id="block-end-time"
                    label="Block To"
                    type="time"
                    value={blockEndTime}
                    onChange={(e) => setBlockEndTime(e.target.value)}
                    required
                  />
                </div>

                <Input
                  id="block-reason"
                  label="Block Reason"
                  placeholder="e.g. Surface cleaning, net repairs, private coaching clinic"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  required
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                  <Button type="button" variant="ghost" onClick={() => setIsBlockModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button id="btn-confirm-block" type="submit" variant="danger" loading={submittingBlock}>
                    Confirm Block
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* â”€â”€ Booking Details & E-Wallet Verification Drawer/Modal â”€â”€ */}
        {selectedBooking && (
          <div className={pageStyles.modalBackdrop}>
            <div className={pageStyles.modalCard} role="dialog" aria-modal="true">
              <div className={pageStyles.modalHeader}>
                <div>
                  <h2 className={pageStyles.modalTitle}>Reservation Details</h2>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    ID: {selectedBooking.id}
                  </span>
                </div>
                <button
                  type="button"
                  className={pageStyles.modalClose}
                  onClick={() => setSelectedBooking(null)}
                >
                  âœ•
                </button>
              </div>

              {paymentError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--color-error)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                  {paymentError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Court:</span>
                  <strong>{selectedBooking.courtName}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Player:</span>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{selectedBooking.leadBookerName} ({selectedBooking.leadBookerEmail})</strong>
                    {(selectedBooking.isWalkIn || selectedBooking.notes?.includes('Walk-in') || selectedBooking.notes?.includes('ðŸš¶')) && (
                      <span style={{ display: 'inline-block', marginLeft: '6px', fontSize: '10px', background: 'rgba(168, 85, 247, 0.2)', color: 'var(--ink-purple)', border: '1px solid rgba(168, 85, 247, 0.5)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                        ðŸš¶ Walk-in Player
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Time:</span>
                  <strong>{formatDate(selectedBooking.startTime)} · {selectedBooking.durationMinutes} mins</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Total Due:</span>
                  <strong style={{ color: 'var(--color-brand-400)', fontSize: 'var(--text-base)' }}>
                    ${parseFloat(selectedBooking.totalAmount).toFixed(2)}
                  </strong>
                </div>

                {selectedBooking.notes && (
                  <div style={{ background: 'var(--color-bg-raised)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
                      Notes & Payment Details:
                    </span>
                    <span style={{ color: 'var(--color-text-primary)' }}>
                      {selectedBooking.notes}
                    </span>
                  </div>
                )}

                {/* Addons List */}
                {selectedBooking.addons && selectedBooking.addons.length > 0 && (
                  <div style={{ background: 'var(--color-bg-raised)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>
                      Add-on Gear Rentals:
                    </span>
                    {selectedBooking.addons.map((a: any) => (
                      <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                        <span>â€¢ {a.productName} Ã— {a.quantity}</span>
                        <span>${(parseFloat(a.unitPrice) * a.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Split Participants (Module A.3) */}
                {selectedBooking.participants && selectedBooking.participants.length > 0 && (
                  <div style={{ background: 'var(--color-bg-raised)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>
                      Split Payment Shares ({selectedBooking.participants.length} Players):
                    </span>
                    {selectedBooking.participants.map((p: any, idx: number) => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', marginTop: '4px' }}>
                        <span>Player {idx + 1} Share: <strong>${parseFloat(p.shareAmount).toFixed(2)}</strong></span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <Badge
                            label={p.paymentStatus}
                            status={p.paymentStatus === 'PAID' ? 'confirmed' : 'pending'}
                          />
                          {p.paymentStatus === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => handleConfirmPayment(p.id)}
                              style={{ background: 'var(--color-lime-400)', border: 'none', color: 'var(--color-brand-700)', fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                            >
                              Verify Share
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* E-Wallet Staff Verification Box */}
                {selectedBooking.status === 'AWAITING_PAYMENT' && (
                  <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginTop: 'var(--space-2)' }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink-amber)', display: 'block', marginBottom: 'var(--space-2)' }}>
                      E-Wallet / Cash Payment Verification
                    </span>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)' }}
                      >
                        <option value="EWALLET">E-Wallet Transfer</option>
                        <option value="CASH">Cash Counter</option>
                      </select>

                      <input
                        placeholder="Ref # (e.g. EW-982143)"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                        style={{ flex: 1, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)' }}
                      />
                    </div>
                    <Button
                      id="btn-confirm-full-payment"
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={verifyingPayment}
                      onClick={() => handleConfirmPayment()}
                    >
                      âœ“ Confirm Full Payment & Mark Confirmed
                    </Button>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <Button
                      id="btn-void-noshow"
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => handleCancelSelectedBooking('NO_SHOW')}
                      title="Void reservation after 30-minute onsite physical no-show grace period"
                    >
                      Void (30m No-Show)
                    </Button>
                    <Button
                      id="btn-cancel-reservation"
                      type="button"
                      variant="ghost"
                      size="sm"
                      style={{ color: 'var(--ink-red)' }}
                      onClick={() => handleCancelSelectedBooking('CANCELLED')}
                    >
                      Cancel Reservation
                    </Button>
                  </div>
                  <Button type="button" variant="ghost" onClick={() => setSelectedBooking(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
