'use client';

import { useState, useEffect } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { CourtDto } from '@/types';
import { formatDate, formatTime, todayInputDate } from '@/lib/utils/date';
import styles from '../admin.module.css';

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [courts, setCourts] = useState<CourtDto[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayInputDate());
  const [selectedCourtId, setSelectedCourtId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // New Booking Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [courtId, setCourtId] = useState('');
  const [leadBookerId, setLeadBookerId] = useState('');
  const [bookingTime, setBookingTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [notes, setNotes] = useState('');
  const [paddleQty, setPaddleQty] = useState(0);
  const [ballQty, setBallQty] = useState(0);
  const [splitCount, setSplitCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payment Verification Modal states
  const [paymentModalBooking, setPaymentModalBooking] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'EWALLET' | 'CASH'>('EWALLET');
  const [paymentRef, setPaymentRef] = useState('');
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  async function loadData() {
    try {
      setLoading(true);
      const [courtsRes, bookingsRes, usersRes, productsRes] = await Promise.all([
        fetch('/api/courts'),
        fetch(`/api/bookings?date=${selectedDate}${selectedCourtId ? `&court_id=${selectedCourtId}` : ''}`),
        fetch('/api/users'),
        fetch('/api/products'),
      ]);

      const [courtsJson, bookingsJson, usersJson, productsJson] = await Promise.all([
        courtsRes.json(),
        bookingsRes.json(),
        usersRes.json(),
        productsRes.json(),
      ]);

      if (courtsJson.data) {
        setCourts(courtsJson.data);
        if (courtsJson.data.length > 0 && !courtId) {
          setCourtId(courtsJson.data[0].id);
        }
      }

      if (bookingsJson.data) {
        setBookings(bookingsJson.data);
      }

      if (usersJson.data) {
        setUsers(usersJson.data);
        if (usersJson.data.length > 0 && !leadBookerId) {
          setLeadBookerId(usersJson.data[0].id);
        }
      }

      if (productsJson.data) {
        setProducts(productsJson.data);
      }
    } catch (err) {
      console.error('Failed to load bookings data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedDate, selectedCourtId]);

  // Price calculations
  const selectedCourt = courts.find((c) => c.id === courtId);
  const paddleProduct = products.find((p) => p.sku === 'RENT-PAD-01');
  const ballProduct = products.find((p) => p.sku === 'RET-BALL-03');

  const hourlyRate = selectedCourt ? parseFloat(selectedCourt.hourlyRate) : 35;
  const courtCost = (hourlyRate * parseInt(durationMinutes, 10)) / 60;
  const paddleCost = paddleProduct ? parseFloat(paddleProduct.price) * paddleQty : 0;
  const ballCost = ballProduct ? parseFloat(ballProduct.price) * ballQty : 0;
  const totalCalculated = courtCost + paddleCost + ballCost;
  const shareCalculated = (totalCalculated / Math.max(1, splitCount)).toFixed(2);

  async function handleCreateBooking(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const slotTarget = new Date(`${selectedDate}T${bookingTime}:00`);
      if (slotTarget.getTime() <= Date.now()) {
        throw new Error('Cannot create a booking in the past. Please select an upcoming date and time.');
      }

      const fullStartTime = slotTarget.toISOString();

      const addonsPayload = [];
      if (paddleProduct && paddleQty > 0) {
        addonsPayload.push({ productId: paddleProduct.id, quantity: paddleQty });
      }
      if (ballProduct && ballQty > 0) {
        addonsPayload.push({ productId: ballProduct.id, quantity: ballQty });
      }

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courtId,
          leadBookerId,
          startTime: fullStartTime,
          durationMinutes: parseInt(durationMinutes, 10),
          notes,
          addons: addonsPayload,
          participantCount: splitCount,
          initialStatus: 'AWAITING_PAYMENT',
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to create booking');
      }

      setIsModalOpen(false);
      setNotes('');
      setPaddleQty(0);
      setBallQty(0);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error creating booking';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmPaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!paymentModalBooking) return;
    setConfirmingPayment(true);

    try {
      const res = await fetch(`/api/bookings/${paymentModalBooking.id}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod,
          paymentReference: paymentRef || 'Counter Verified',
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to verify payment');
      }

      setPaymentModalBooking(null);
      setPaymentRef('');
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error confirming payment');
    } finally {
      setConfirmingPayment(false);
    }
  }

  async function handleCancelBooking(id: string) {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.data?.message) {
        alert(json.data.message);
      }
      loadData();
    } catch (err) {
      console.error('Error cancelling booking:', err);
    }
  }

  return (
    <>
      <AdminHeader
        title="Court Bookings"
        subtitle="Manage court reservations, inspect player details, and schedule manual sessions"
        actions={
          <Button id="btn-new-booking" variant="primary" onClick={() => setIsModalOpen(true)}>
            + New Booking
          </Button>
        }
      />

      <main className={styles.pageContent}>
        {/* Filters */}
        <div className={styles.actionBar}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                Filter Date
              </label>
              <input
                id="filter-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  background: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                Filter Court
              </label>
              <select
                id="filter-court"
                value={selectedCourtId}
                onChange={(e) => setSelectedCourtId(e.target.value)}
                style={{
                  background: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <option value="">All Courts</option>
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Bookings Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.table} id="table-bookings">
            <thead>
              <tr>
                <th>Time & Date</th>
                <th>Court</th>
                <th>Lead Player</th>
                <th>Duration & Gear</th>
                <th>Total / Share</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    Loading bookings...
                  </td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                    No bookings found for the selected date and filters.
                  </td>
                </tr>
              ) : (
                bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <div>
                        <strong>{formatTime(booking.startTime)} – {formatTime(booking.endTime)}</strong>
                      </div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        {formatDate(booking.startTime)}
                      </span>
                    </td>
                    <td>
                      <div>{booking.courtName}</div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        {booking.surfaceType}
                      </span>
                    </td>
                    <td>
                      <div><strong>{booking.leadBookerName}</strong></div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {booking.leadBookerEmail}
                      </span>
                    </td>
                    <td>
                      <div>{booking.durationMinutes} mins</div>
                      {booking.addons && booking.addons.length > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--color-brand-400)' }}>
                          +{booking.addons.map((a: any) => `${a.quantity}x ${a.productName.split(' ')[0]}`).join(', ')}
                        </span>
                      )}
                    </td>
                    <td>
                      <div><strong>${parseFloat(booking.totalAmount).toFixed(2)}</strong></div>
                      {booking.participants && booking.participants.length > 1 && (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          {booking.participants.length} shares (${parseFloat(booking.participants[0].shareAmount).toFixed(2)} ea)
                        </span>
                      )}
                    </td>
                    <td>
                      <Badge
                        label={booking.status}
                        status={
                          booking.status === 'CONFIRMED'
                            ? 'confirmed'
                            : booking.status === 'CANCELLED' || booking.status === 'NO_SHOW'
                            ? 'cancelled'
                            : 'pending'
                        }
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
                        {booking.status === 'AWAITING_PAYMENT' && (
                          <Button
                            id={`btn-verify-pay-${booking.id}`}
                            variant="secondary"
                            size="sm"
                            onClick={() => setPaymentModalBooking(booking)}
                          >
                            Verify Pay
                          </Button>
                        )}
                        {booking.status !== 'CANCELLED' && booking.status !== 'NO_SHOW' && (
                          <Button
                            id={`btn-cancel-booking-${booking.id}`}
                            variant="danger"
                            size="sm"
                            onClick={() => handleCancelBooking(booking.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Create Booking Modal ── */}
        {isModalOpen && (
          <div className={styles.modalBackdrop}>
            <div className={styles.modalCard} role="dialog" aria-modal="true">
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>Reserve Court Slot</h2>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={() => setIsModalOpen(false)}
                >
                  ✕
                </button>
              </div>

              {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--color-error)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateBooking} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                      Select Court
                    </label>
                    <select
                      id="booking-court-select"
                      value={courtId}
                      onChange={(e) => setCourtId(e.target.value)}
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

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                      Select Registered Player
                    </label>
                    <select
                      id="booking-player-select"
                      value={leadBookerId}
                      onChange={(e) => setLeadBookerId(e.target.value)}
                      style={{ width: '100%', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}
                      required
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <Input
                    id="booking-start-time"
                    label="Start Time"
                    type="time"
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    required
                  />

                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                      Duration Block
                    </label>
                    <select
                      id="booking-duration-select"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      style={{ width: '100%', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}
                      required
                    >
                      <option value="30">30 Minutes</option>
                      <option value="60">60 Minutes</option>
                      <option value="90">90 Minutes</option>
                    </select>
                  </div>
                </div>

                {/* Addons Box */}
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
                        type="number"
                        min="0"
                        max="8"
                        value={paddleQty}
                        onChange={(e) => setPaddleQty(parseInt(e.target.value, 10) || 0)}
                        style={{ width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', marginTop: '2px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)', display: 'block' }}>
                        Ball Can 3-pk ($9.50)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="5"
                        value={ballQty}
                        onChange={(e) => setBallQty(parseInt(e.target.value, 10) || 0)}
                        style={{ width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', marginTop: '2px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Split Count & Total */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                      Split Players
                    </label>
                    <select
                      value={splitCount}
                      onChange={(e) => setSplitCount(parseInt(e.target.value, 10))}
                      style={{ width: '100%', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}
                    >
                      <option value="1">1 Player (Full)</option>
                      <option value="2">2 Players (50% each)</option>
                      <option value="3">3 Players (33.3% each)</option>
                      <option value="4">4 Players (25% each)</option>
                    </select>
                  </div>

                  <div style={{ background: 'var(--color-bg-raised)', border: '1px solid var(--color-border)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', textAlign: 'right' }}>
                    <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block' }}>
                      TOTAL
                    </span>
                    <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--color-brand-400)' }}>
                      ${totalCalculated.toFixed(2)}
                    </strong>
                    {splitCount > 1 && (
                      <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}>
                        (${shareCalculated} / player)
                      </span>
                    )}
                  </div>
                </div>

                <Input
                  id="booking-notes"
                  label="Session Notes (Optional)"
                  placeholder="e.g. Club tournament practice, paddle rental requested"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    id="btn-confirm-booking"
                    type="submit"
                    variant="primary"
                    loading={submitting}
                  >
                    Confirm Booking
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Verify Payment Modal ── */}
        {paymentModalBooking && (
          <div className={styles.modalBackdrop}>
            <div className={styles.modalCard} role="dialog" aria-modal="true">
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>Verify Customer Payment</h2>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={() => setPaymentModalBooking(null)}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleConfirmPaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ background: 'var(--color-bg-raised)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Booker:</span>
                    <strong>{paymentModalBooking.leadBookerName}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Total Due:</span>
                    <strong style={{ color: 'var(--color-brand-400)' }}>
                      ${parseFloat(paymentModalBooking.totalAmount).toFixed(2)}
                    </strong>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    style={{ width: '100%', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}
                  >
                    <option value="EWALLET">E-Wallet Transfer (Manual QR / Phone)</option>
                    <option value="CASH">Cash at Counter</option>
                  </select>
                </div>

                <Input
                  id="input-payment-ref"
                  label="Transaction Reference # (Manual Entry)"
                  placeholder="e.g. EW-9082341 or Cash Receipt"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  hint="Logged for accounting reconciliation & audit"
                  required
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                  <Button type="button" variant="ghost" onClick={() => setPaymentModalBooking(null)}>
                    Cancel
                  </Button>
                  <Button id="btn-submit-payment-verification" type="submit" variant="primary" loading={confirmingPayment}>
                    Confirm Payment Received
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
