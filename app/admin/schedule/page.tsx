'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AdminHeader from '@/components/layout/AdminHeader';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { CourtDto } from '@/types';
import { formatDate, formatTime, formatTimeString } from '@/lib/utils/date';
import { useRealtimeSchedule } from '@/lib/hooks/useRealtimeSchedule';
import { addDays, subDays, format, parseISO } from 'date-fns';
import styles from './schedule.module.css';
import pageStyles from '../admin.module.css';

// 30-minute intervals covering complete operating cycle:
// 05:00 to 02:00 next day (Active Play Hours) + 02:00 to 05:00 (Facility Closed)
const TIME_SLOTS = [
  '05:00', '05:30', '06:00', '06:30', '07:00', '07:30',
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30', '22:00', '22:30',
  '23:00', '23:30', '00:00', '00:30', '01:00', '01:30',
  '02:00', '02:30', '03:00', '03:30', '04:00', '04:30',
];

function getSlotDateTime(dateStr: string, timeSlot: string): Date {
  const base = parseISO(dateStr);
  if (timeSlot < '05:00') {
    // Hours past midnight (00:00 to 04:30) belong to the next calendar morning
    const next = addDays(base, 1);
    const nextStr = format(next, 'yyyy-MM-dd');
    return new Date(`${nextStr}T${timeSlot}:00`);
  }
  return new Date(`${dateStr}T${timeSlot}:00`);
}

type GridCell =
  | { kind: 'skip' }
  | { kind: 'free'; maxMinutes?: number }
  | { kind: 'closed'; span: number }
  | { kind: 'block'; span: number; block: any }
  | { kind: 'booking'; span: number; booking: any };

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

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

  // Open Play Modal State
  const [isOpenPlayModalOpen, setIsOpenPlayModalOpen] = useState(false);
  const [openPlayCourtId, setOpenPlayCourtId] = useState('');
  const [openPlayDate, setOpenPlayDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [openPlayStartTime, setOpenPlayStartTime] = useState('17:00');
  const [openPlayEndTime, setOpenPlayEndTime] = useState('20:00');
  const [openPlayTitle, setOpenPlayTitle] = useState('Community Open Play · All Skill Levels');
  const [submittingOpenPlay, setSubmittingOpenPlay] = useState(false);
  const [openPlayError, setOpenPlayError] = useState<string | null>(null);

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
    if (court.closingTime < court.openingTime) {
      return timeSlot >= court.openingTime || timeSlot < court.closingTime;
    }
    return timeSlot >= court.openingTime && timeSlot < court.closingTime;
  }

  function getBookingAtSlot(courtId: string, timeSlot: string) {
    const slotTarget = getSlotDateTime(dateStr, timeSlot);
    return bookings.find((b) => {
      if (b.courtId !== courtId || b.status === 'CANCELLED' || b.status === 'NO_SHOW') return false;
      const bStart = new Date(b.startTime);
      const bEnd = new Date(b.endTime);
      return slotTarget >= bStart && slotTarget < bEnd;
    });
  }

  function getBlockAtSlot(courtId: string, timeSlot: string) {
    const slotTarget = getSlotDateTime(dateStr, timeSlot);
    return blocks.find((blk) => {
      if (blk.courtId !== courtId) return false;
      const blkStart = new Date(blk.blockedFrom);
      const blkEnd = new Date(blk.blockedTo);
      return slotTarget >= blkStart && slotTarget < blkEnd;
    });
  }

  // ── Live clock: drives the "NOW" row, in-play status and utilization ──
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const gridRef = useRef<HTMLDivElement>(null);
  const scrolledForDate = useRef<string>('');
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 3200);
  }

  function openBooking(booking: any) {
    setPaymentError(null);
    setPaymentRef('');
    setSelectedBooking(booking);
  }

  // Close the details drawer with Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedBooking(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const peso = (value: number | string | undefined | null) => {
    const n = typeof value === 'string' ? parseFloat(value) : value ?? 0;
    return `₱${(Number.isFinite(n) ? (n as number) : 0).toFixed(2)}`;
  };

  const isToday = dateStr === format(new Date(nowTick), 'yyyy-MM-dd');
  const nowSlotIndex = isToday
    ? TIME_SLOTS.findIndex((s) => {
        const st = getSlotDateTime(dateStr, s).getTime();
        return st <= nowTick && nowTick < st + 30 * 60000;
      })
    : -1;

  // On load / date change, scroll the grid to the current time (today) or the top
  useEffect(() => {
    if (loading || !gridRef.current || scrolledForDate.current === dateStr) return;
    scrolledForDate.current = dateStr;
    const row = gridRef.current.querySelector('[data-now-row="true"]') as HTMLElement | null;
    gridRef.current.scrollTo({ top: row ? Math.max(0, row.offsetTop - 110) : 0, behavior: 'smooth' });
  }, [loading, dateStr]);

  // Visual + semantic state of a booking (one source of truth for colour, label, behaviour)
  function getBookingState(b: any) {
    const s = new Date(b.startTime).getTime();
    const e = new Date(b.endTime).getTime();
    const paid = b.status === 'CONFIRMED';
    const walkIn =
      Boolean(b.isWalkIn) || Boolean(b.notes?.includes('Walk-in')) || Boolean(b.notes?.includes('🚶'));
    const using = paid && s <= nowTick && e > nowTick;
    const past = e <= nowTick;
    const key: 'using' | 'awaiting' | 'walkin' | 'confirmed' = using
      ? 'using'
      : !paid
      ? 'awaiting'
      : walkIn
      ? 'walkin'
      : 'confirmed';
    const labels = {
      using: 'In Play',
      awaiting: 'Awaiting Payment',
      walkin: 'Walk-in · Paid',
      confirmed: 'Booked · Paid',
    };
    const emojis = { using: '🟢', awaiting: '⏳', walkin: '🚶', confirmed: '🎾' };
    return { key, label: labels[key], emoji: emojis[key], paid, walkIn, using, past };
  }

  const toneClass = {
    using: styles.bookingUsing,
    awaiting: styles.bookingAwaiting,
    walkin: styles.bookingWalkIn,
    confirmed: styles.bookingConfirmed,
  };

  // Build one column of cells per court. Bookings / blocks / closed hours are merged
  // into a single tall cell (rowSpan) so a 90-minute booking reads as ONE card.
  function buildColumn(court: CourtDto): GridCell[] {
    const cells: GridCell[] = [];
    const total = TIME_SLOTS.length;
    const pushSpan = (cell: GridCell, span: number) => {
      cells.push(cell);
      for (let k = 1; k < span; k++) cells.push({ kind: 'skip' });
    };

    let i = 0;
    while (i < total) {
      const slot = TIME_SLOTS[i];

      if (!isCourtOpen(court, slot)) {
        let span = 1;
        while (i + span < total && !isCourtOpen(court, TIME_SLOTS[i + span])) span++;
        pushSpan({ kind: 'closed', span }, span);
        i += span;
        continue;
      }

      const block = getBlockAtSlot(court.id, slot);
      if (block) {
        let span = 1;
        while (
          i + span < total &&
          isCourtOpen(court, TIME_SLOTS[i + span]) &&
          getBlockAtSlot(court.id, TIME_SLOTS[i + span])?.id === block.id
        ) {
          span++;
        }
        pushSpan({ kind: 'block', span, block }, span);
        i += span;
        continue;
      }

      const booking = getBookingAtSlot(court.id, slot);
      if (booking) {
        let span = 1;
        while (i + span < total) {
          const next = TIME_SLOTS[i + span];
          if (
            !isCourtOpen(court, next) ||
            getBlockAtSlot(court.id, next) ||
            getBookingAtSlot(court.id, next)?.id !== booking.id
          ) {
            break;
          }
          span++;
        }
        pushSpan({ kind: 'booking', span, booking }, span);
        i += span;
        continue;
      }

      // Count continuous free slots until next booking / block / closed
      let freeSpan = 1;
      while (i + freeSpan < total) {
        const next = TIME_SLOTS[i + freeSpan];
        if (!isCourtOpen(court, next) || getBlockAtSlot(court.id, next) || getBookingAtSlot(court.id, next)) {
          break;
        }
        freeSpan++;
      }
      const maxMinutes = freeSpan * 30;

      cells.push({ kind: 'free', maxMinutes });
      i++;
    }
    return cells;
  }
  const columns = courts.map(buildColumn);

  // ── At-a-glance stats for the selected day ──
  const activeBookings = bookings.filter((b) => b.status !== 'CANCELLED' && b.status !== 'NO_SHOW');
  const stats = {
    total: activeBookings.length,
    playing: activeBookings.filter((b) => getBookingState(b).using).length,
    awaiting: activeBookings.filter((b) => b.status !== 'CONFIRMED').length,
    revenue: activeBookings
      .filter((b) => b.status === 'CONFIRMED')
      .reduce((sum, b) => sum + (parseFloat(b.totalAmount) || 0), 0),
  };
  const openMinutes = courts.reduce(
    (sum, c) => {
      const open = toMinutes(c.openingTime);
      let close = toMinutes(c.closingTime);
      if (close < open) close += 24 * 60;
      return sum + Math.max(0, close - open);
    },
    0
  );
  const bookedMinutes = activeBookings.reduce((sum, b) => sum + (b.durationMinutes || 0), 0);
  const utilization = openMinutes > 0 ? Math.min(100, Math.round((bookedMinutes / openMinutes) * 100)) : 0;

  // Interactive slot click
  function handleSlotClick(courtId: string, timeSlot: string) {
    const slotTarget = getSlotDateTime(dateStr, timeSlot);
    if (slotTarget.getTime() <= Date.now()) {
      showToast('Cannot reserve a slot in the past. Please pick an upcoming slot or use Walk-in.');
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

  // Calculate continuous available minutes for any court at a given start time
  const getAvailableWindowForCourt = useCallback(
    (courtId: string, startTime: string): { maxMinutes: number; nextEventReason?: string; nextEventTime?: string } => {
      const court = courts.find((c) => c.id === courtId);
      if (!court) return { maxMinutes: 60 };

      const total = TIME_SLOTS.length;
      const startIdx = TIME_SLOTS.indexOf(startTime);
      if (startIdx === -1) return { maxMinutes: 60 };

      let span = 0;
      let nextEventReason: string | undefined;
      let nextEventTime: string | undefined;

      for (let k = startIdx; k < total; k++) {
        const slot = TIME_SLOTS[k];
        if (!isCourtOpen(court, slot)) {
          nextEventReason = 'Closing time';
          nextEventTime = slot;
          break;
        }
        const block = getBlockAtSlot(courtId, slot);
        if (block) {
          nextEventReason = block.reason || 'Court Maintenance';
          nextEventTime = slot;
          break;
        }
        const booking = getBookingAtSlot(courtId, slot);
        if (booking) {
          nextEventReason = `Reserved by ${booking.leadBookerName || 'Player'}`;
          nextEventTime = slot;
          break;
        }
        span++;
      }

      return {
        maxMinutes: span * 30,
        nextEventReason,
        nextEventTime,
      };
    },
    [courts, isCourtOpen, getBlockAtSlot, getBookingAtSlot]
  );

  const currentWindow = useMemo(() => {
    return getAvailableWindowForCourt(bookCourtId, bookStartTime);
  }, [bookCourtId, bookStartTime, getAvailableWindowForCourt]);

  // Find alternative courts with longer available windows at this same start time
  const alternativeCourts = useMemo(() => {
    if (!isBookingModalOpen) return [];
    if (currentWindow.maxMinutes >= 90) return [];

    return courts
      .filter((c) => c.id !== bookCourtId)
      .map((c) => ({
        court: c,
        window: getAvailableWindowForCourt(c.id, bookStartTime),
      }))
      .filter((alt) => alt.window.maxMinutes > currentWindow.maxMinutes);
  }, [isBookingModalOpen, currentWindow.maxMinutes, courts, bookCourtId, bookStartTime, getAvailableWindowForCourt]);

  // Auto-clamp bookDuration if current court's available window is smaller than selected duration
  useEffect(() => {
    if (isBookingModalOpen && currentWindow.maxMinutes > 0 && bookDuration > currentWindow.maxMinutes) {
      const bestFit = [90, 60, 30].find((d) => d <= currentWindow.maxMinutes) || 30;
      setBookDuration(bestFit);
    }
  }, [isBookingModalOpen, currentWindow.maxMinutes, bookDuration]);

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
      const slotTarget = getSlotDateTime(dateStr, bookStartTime);

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
            ? `Tendered ₱${parseFloat(walkInCashTendered).toFixed(2)} (Change: ₱${Math.max(0, parseFloat(walkInCashTendered) - totalAmount).toFixed(2)})`
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
      const startIso = getSlotDateTime(dateStr, blockStartTime).toISOString();
      const endIso = getSlotDateTime(dateStr, blockEndTime).toISOString();

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
  async function handleRemoveBlock(blockId: string, promptMsg?: string) {
    if (!confirm(promptMsg || 'Unblock this court time?')) return;
    try {
      await fetch(`/api/court-blocks/${blockId}`, { method: 'DELETE' });
      showToast('Court time released successfully');
      loadSchedule();
    } catch (err) {
      console.error('Error removing block:', err);
    }
  }

  function handleOpenOpenPlayModal(courtId?: string, timeSlot?: string) {
    setOpenPlayCourtId(courtId || (courts[0]?.id || ''));
    setOpenPlayDate(dateStr);
    if (timeSlot) {
      setOpenPlayStartTime(timeSlot);
      const [h, m] = timeSlot.split(':').map(Number);
      const endH = String(Math.min(23, h + 2)).padStart(2, '0');
      setOpenPlayEndTime(`${endH}:${String(m).padStart(2, '0')}`);
    } else {
      setOpenPlayStartTime('17:00');
      setOpenPlayEndTime('20:00');
    }
    setOpenPlayTitle('Community Open Play · All Skill Levels');
    setOpenPlayError(null);
    setIsOpenPlayModalOpen(true);
  }

  async function handleCreateOpenPlay(e: React.FormEvent) {
    e.preventDefault();
    if (!openPlayCourtId) {
      setOpenPlayError('Please select a court');
      return;
    }
    setSubmittingOpenPlay(true);
    setOpenPlayError(null);

    try {
      const startIso = new Date(`${openPlayDate}T${openPlayStartTime}:00`).toISOString();
      const endIso = new Date(`${openPlayDate}T${openPlayEndTime}:00`).toISOString();

      const res = await fetch('/api/court-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courtId: openPlayCourtId,
          blockedFrom: startIso,
          blockedTo: endIso,
          reason: `Open Play: ${openPlayTitle.trim() || 'Community Session'}`,
          createdBy: 'Admin (Open Play)',
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to schedule Open Play session');
      }

      setIsOpenPlayModalOpen(false);
      showToast('Open Play session scheduled successfully!');
      loadSchedule();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error scheduling Open Play';
      setOpenPlayError(msg);
    } finally {
      setSubmittingOpenPlay(false);
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
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button
              id="btn-schedule-open-play"
              variant="primary"
              onClick={() => handleOpenOpenPlayModal()}
            >
              🎾 Schedule Open Play
            </Button>
            <Button
              id="btn-walkin-booking"
              variant="secondary"
              onClick={() => handleOpenWalkInModal()}
            >
              ⚡ Walk-in Booking
            </Button>
            <Button
              id="btn-block-court"
              variant="ghost"
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

          {/* At-a-glance stats for the selected day */}
          <div className={styles.statsStrip}>
            <div className={styles.statChip}>
              <span className={styles.statChipIcon}>📅</span>
              <div>
                <div className={styles.statChipValue}>{stats.total}</div>
                <div className={styles.statChipLabel}>Bookings</div>
              </div>
            </div>
            <div className={styles.statChip}>
              <span className={styles.statChipIcon}>🟢</span>
              <div>
                <div className={styles.statChipValue}>{stats.playing}</div>
                <div className={styles.statChipLabel}>In Play Now</div>
              </div>
            </div>
            <div className={`${styles.statChip} ${stats.awaiting > 0 ? styles.statChipAttention : ''}`}>
              <span className={styles.statChipIcon}>⏳</span>
              <div>
                <div className={styles.statChipValue}>{stats.awaiting}</div>
                <div className={styles.statChipLabel}>Awaiting Payment</div>
              </div>
            </div>
            <div className={styles.statChip}>
              <span className={styles.statChipIcon}>💰</span>
              <div>
                <div className={styles.statChipValue}>{peso(stats.revenue).replace('.00', '')}</div>
                <div className={styles.statChipLabel}>Confirmed Revenue</div>
              </div>
            </div>
            <div className={styles.statChip}>
              <span className={styles.statChipIcon}>📈</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={styles.statChipValue}>{utilization}%</div>
                <div className={styles.statChipLabel}>Court Utilization</div>
                <div className={styles.utilBar}>
                  <div className={styles.utilFill} style={{ width: `${utilization}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Schedule Grid */}
          <div className={styles.timelineWrapper} ref={gridRef}>
            <table
              className={styles.timelineTable}
              id="table-schedule-grid"
              style={{ minWidth: 84 + Math.max(courts.length, 1) * 176 }}
            >
              <thead>
                <tr>
                  <th className={styles.timeHeaderCol}>Time</th>
                  {courts.map((court) => (
                    <th key={court.id} className={styles.courtHeaderCol}>
                      <div className={styles.courtTitle}>{court.name}</div>
                      <div className={styles.courtSubtitle}>
                        {court.surfaceType} · {peso(court.hourlyRate)}/hr
                      </div>
                      <span className={styles.courtHoursTag}>
                        {formatTimeString(court.openingTime)} – {formatTimeString(court.closingTime)}
                        {court.closingTime < court.openingTime ? ' (+1d)' : ''}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map((slot, i) => {
                  const isHour = slot.endsWith(':00');
                  const isNow = i === nowSlotIndex;
                  return (
                    <tr
                      key={slot}
                      data-now-row={isNow ? 'true' : undefined}
                      className={`${isHour ? styles.rowHour : ''} ${isNow ? styles.rowNow : ''}`}
                    >
                      <td className={`${styles.timeCell} ${isHour ? styles.timeCellHour : ''}`}>
                        {isHour ? (
                          formatTimeString(slot)
                        ) : (
                          <span className={styles.timeCellHalf}>:{slot.slice(3)}</span>
                        )}
                        {slot < '05:00' && (
                          <span style={{ fontSize: '9px', opacity: 0.65, display: 'block', fontWeight: 600 }}>
                            {slot >= '02:00' ? 'Closed' : '+1d'}
                          </span>
                        )}
                        {isNow && <span className={styles.nowTag}>NOW</span>}
                      </td>

                      {courts.map((court, ci) => {
                        const cell = columns[ci]?.[i];
                        if (!cell || cell.kind === 'skip') return null;

                        if (cell.kind === 'closed') {
                          return (
                            <td
                              key={court.id}
                              rowSpan={cell.span}
                              className={`${styles.slotCell} ${styles.slotClosed}`}
                            >
                              <div className={styles.closedInner}>
                                {cell.span >= 2 ? (
                                  <>
                                    <strong>Closed</strong>
                                    <span style={{ fontSize: '10px', opacity: 0.85, display: 'block', marginTop: '2px' }}>
                                      Reopens 5:00 AM
                                    </span>
                                  </>
                                ) : (
                                  'Closed'
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (cell.kind === 'block') {
                          const { block, span } = cell;
                          const isOpenPlay = /open\s*play/i.test(block.reason || '');
                          return (
                            <td key={court.id} rowSpan={span} className={styles.slotCell}>
                              <button
                                type="button"
                                className={`${styles.blockedBlock} ${isOpenPlay ? styles.openPlayBlock : ''}`}
                                onClick={() =>
                                  handleRemoveBlock(
                                    block.id,
                                    isOpenPlay
                                      ? 'Cancel this scheduled Open Play session?'
                                      : 'Unblock this court time?'
                                  )
                                }
                                title={`${isOpenPlay ? 'Open Play Session' : 'Blocked'}: ${
                                  block.reason || 'Maintenance'
                                }. Click to ${isOpenPlay ? 'cancel' : 'unblock'}.`}
                              >
                                <span className={styles.blockedTitle}>
                                  {isOpenPlay ? '🎾 ' : '🔒 '}
                                  {block.reason || 'Court Blocked'}
                                </span>
                                <span className={styles.blockedSubtitle}>
                                  {formatTime(block.blockedFrom)} – {formatTime(block.blockedTo)}
                                </span>
                                {span >= 2 && (
                                  <span className={styles.blockedHint}>
                                    {isOpenPlay ? 'Tap to cancel Open Play' : 'Tap to unblock'}
                                  </span>
                                )}
                              </button>
                            </td>
                          );
                        }

                        if (cell.kind === 'booking') {
                          const { booking, span } = cell;
                          const st = getBookingState(booking);
                          const compact = span <= 1;
                          return (
                            <td key={court.id} rowSpan={span} className={styles.slotCell}>
                              <button
                                type="button"
                                data-booking="true"
                                className={`${styles.bookingBlock} ${toneClass[st.key]} ${
                                  st.past ? styles.bookingPast : ''
                                } ${compact ? styles.bookingCompact : ''}`}
                                onClick={() => openBooking(booking)}
                                title={`${st.label} · ${booking.leadBookerName} · ${formatTime(
                                  booking.startTime
                                )} – ${formatTime(booking.endTime)}`}
                              >
                                {!compact && (
                                  <span className={styles.bookingTop}>
                                    <span className={styles.bookingStatus}>
                                      {st.emoji} {st.label}
                                    </span>
                                    {span >= 3 && (
                                      <span className={styles.bookingPrice}>{peso(booking.totalAmount)}</span>
                                    )}
                                  </span>
                                )}
                                <span className={styles.bookingBooker}>
                                  {compact ? `${st.emoji} ` : ''}
                                  {booking.leadBookerName}
                                </span>
                                <span className={styles.bookingMeta}>
                                  {formatTime(booking.startTime)} – {formatTime(booking.endTime)}
                                </span>
                                {!compact && st.walkIn && st.key !== 'walkin' && (
                                  <span className={styles.bookingMeta}>🚶 Walk-in guest</span>
                                )}
                                {!compact && st.key === 'awaiting' && (
                                  <span className={styles.bookingCta}>Tap to verify payment →</span>
                                )}
                              </button>
                            </td>
                          );
                        }

                        // Free slot
                        const slotDate = getSlotDateTime(dateStr, slot);
                        const slotEnd = new Date(slotDate.getTime() + 30 * 60000);
                        const isConcluded = slotEnd.getTime() <= nowTick;
                        const isOngoing = slotDate.getTime() <= nowTick && !isConcluded;
                        const maxMins = cell.kind === 'free' ? cell.maxMinutes : 60;
                        const isCapped30 = maxMins === 30;

                        return (
                          <td key={court.id} className={styles.slotCell}>
                            <button
                              type="button"
                              className={`${styles.slotAvailable} ${
                                isConcluded ? styles.slotPast : isOngoing ? styles.slotOngoing : ''
                              }`}
                              onClick={() => {
                                if (isConcluded) {
                                  showToast('That time has already passed — pick an upcoming slot.');
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
                                  ? 'Time has passed'
                                  : isCapped30
                                  ? `Only 30 mins available before next booking on ${court.name}`
                                  : isOngoing
                                  ? `Walk-in play on ${court.name} right now`
                                  : `Reserve ${court.name} at ${formatTimeString(slot)}`
                              }
                            >
                              <span className={styles.slotAvailableText}>
                                {isConcluded
                                  ? ''
                                  : isOngoing
                                  ? isCapped30
                                    ? '⚡ Walk-in (30m)'
                                    : '⚡ Walk-in'
                                  : isCapped30
                                  ? '+ Reserve (30m)'
                                  : '+ Reserve'}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {toast && (
            <div className={styles.toast} role="status">
              {toast}
            </div>
          )}
        </div>

        {/* ── Booking / Walk-in Modal ── */}
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
                  ✕
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
                  📅 Advance Reservation
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
                          {c.name} (₱{parseFloat(c.hourlyRate).toFixed(0)}/hr)
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

                {/* Conflict Notice & Alternative Court Recommendations */}
                {currentWindow.maxMinutes < 90 && (
                  <div className={styles.conflictNoticeCard}>
                    <div className={styles.conflictNoticeHeader}>
                      <span style={{ fontSize: '18px' }}>⚠️</span>
                      <div>
                        <strong>
                          {currentWindow.maxMinutes <= 30
                            ? 'Limited time slot: Only 30 mins available'
                            : `Only ${currentWindow.maxMinutes} mins available on ${selectedCourt?.name.split(' - ')[0] || 'this court'}`}
                        </strong>
                        <p>
                          Next reserved session begins at {formatTimeString(currentWindow.nextEventTime || '')}
                          {currentWindow.nextEventReason ? ` (${currentWindow.nextEventReason})` : ''}.
                        </p>
                      </div>
                    </div>

                    {alternativeCourts.length > 0 && (
                      <div className={styles.conflictAltSection}>
                        <span className={styles.conflictAltTitle}>
                          💡 Need a full 60m or 90m session? Switch court:
                        </span>
                        <div className={styles.conflictAltPills}>
                          {alternativeCourts.map(({ court: altCourt, window: altWin }: any) => (
                            <button
                              key={altCourt.id}
                              type="button"
                              className={styles.conflictAltBtn}
                              onClick={() => {
                                setBookCourtId(altCourt.id);
                                if (altWin.maxMinutes >= 60) {
                                  setBookDuration(60);
                                }
                              }}
                            >
                              <span>👉 Switch to {altCourt.name.split(' - ')[0]}</span>
                              <span className={styles.conflictAltBadge}>{altWin.maxMinutes}m free</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Duration Selector Pills (Flexible Blocks with Conflict Prevention) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
                      Session Duration (Flexible Blocks)
                    </label>
                    {currentWindow.maxMinutes < 90 && (
                      <span style={{ fontSize: '11px', color: '#b45309', fontWeight: 600 }}>
                        Max {currentWindow.maxMinutes} mins available
                      </span>
                    )}
                  </div>
                  <div className={styles.pillGroup}>
                    {[30, 60, 90].map((dur) => {
                      const isAllowed = dur <= currentWindow.maxMinutes;
                      const isSelected = bookDuration === dur;
                      return (
                        <button
                          key={dur}
                          type="button"
                          id={`pill-duration-${dur}`}
                          disabled={!isAllowed}
                          className={`${styles.pillBtn} ${isSelected ? styles.pillActive : ''} ${
                            !isAllowed ? styles.durationPillDisabled : ''
                          }`}
                          onClick={() => {
                            if (!isAllowed) return;
                            setBookDuration(dur);
                          }}
                          title={
                            !isAllowed
                              ? `Cannot select ${dur} mins: overlaps with ${currentWindow.nextEventTime} (${currentWindow.nextEventReason})`
                              : ''
                          }
                        >
                          <span>{dur} Min</span>
                          {!isAllowed && <span className={styles.durationPillBadge}>Overlaps</span>}
                        </button>
                      );
                    })}
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
                        Paddle Rentals ({paddleProduct ? peso(paddleProduct.price) : 'n/a'} each)
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
                        Ball Can 3-pk ({ballProduct ? peso(ballProduct.price) : 'n/a'})
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
                      {peso(totalAmount)}
                    </strong>
                    {bookSplitCount > 1 && (
                      <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'block' }}>
                        ({peso(perPersonShare)} / person)
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
                          📱 E-Wallet
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
                          ⏳ Pay Later
                        </button>
                      </div>
                    </div>

                    {walkInPayMethod === 'CASH' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', alignItems: 'center' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                            Cash Tendered (₱)
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
                            {peso(Math.max(0, (parseFloat(walkInCashTendered) || 0) - totalAmount))}
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

        {/* ── Court Blocking Modal ── */}
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
                  ✕
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

        {/* ── Open Play Scheduling Modal ── */}
        {isOpenPlayModalOpen && (
          <div className={pageStyles.modalBackdrop}>
            <div className={pageStyles.modalCard} role="dialog" aria-modal="true">
              <div className={pageStyles.modalHeader}>
                <h2 className={pageStyles.modalTitle}>🎾 Schedule Open Play Session</h2>
                <button
                  type="button"
                  className={pageStyles.modalClose}
                  onClick={() => setIsOpenPlayModalOpen(false)}
                >
                  ✕
                </button>
              </div>

              {openPlayError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--color-error)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                  {openPlayError}
                </div>
              )}

              <form onSubmit={handleCreateOpenPlay} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)' }}>
                    Select Court for Open Play
                  </label>
                  <select
                    id="openplay-court-select"
                    value={openPlayCourtId}
                    onChange={(e) => setOpenPlayCourtId(e.target.value)}
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

                <Input
                  id="openplay-date"
                  label="Session Date"
                  type="date"
                  value={openPlayDate}
                  onChange={(e) => setOpenPlayDate(e.target.value)}
                  required
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <Input
                    id="openplay-start-time"
                    label="Start Time"
                    type="time"
                    value={openPlayStartTime}
                    onChange={(e) => setOpenPlayStartTime(e.target.value)}
                    required
                  />

                  <Input
                    id="openplay-end-time"
                    label="End Time"
                    type="time"
                    value={openPlayEndTime}
                    onChange={(e) => setOpenPlayEndTime(e.target.value)}
                    required
                  />
                </div>

                <Input
                  id="openplay-title"
                  label="Session Description / Level"
                  placeholder="e.g. Community Open Play · All Skill Levels"
                  value={openPlayTitle}
                  onChange={(e) => setOpenPlayTitle(e.target.value)}
                  required
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                  <Button type="button" variant="ghost" onClick={() => setIsOpenPlayModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button id="btn-confirm-openplay" type="submit" variant="primary" loading={submittingOpenPlay}>
                    Confirm Open Play
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Reservation Details Drawer ── */}
        {selectedBooking && (() => {
          const sb = selectedBooking;
          const st = getBookingState(sb);
          const addons: any[] = sb.addons || [];
          const participants: any[] = sb.participants || [];
          return (
            <div className={styles.drawerBackdrop} onClick={() => setSelectedBooking(null)}>
              <aside
                className={styles.drawer}
                role="dialog"
                aria-modal="true"
                aria-label="Reservation details"
                onClick={(e) => e.stopPropagation()}
              >
                <header className={`${styles.drawerHeader} ${toneClass[st.key]}`}>
                  <div style={{ minWidth: 0 }}>
                    <span className={styles.drawerStatus}>
                      {st.emoji} {st.label}
                    </span>
                    <h2 className={styles.drawerTitle}>{sb.courtName}</h2>
                    <p className={styles.drawerWhen}>
                      {formatDate(sb.startTime)} · {formatTime(sb.startTime)} – {formatTime(sb.endTime)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.drawerClose}
                    onClick={() => setSelectedBooking(null)}
                    aria-label="Close details"
                  >
                    ✕
                  </button>
                </header>

                <div className={styles.drawerBody}>
                  {paymentError && <div className={styles.drawerError}>{paymentError}</div>}

                  {/* Player */}
                  <section className={styles.drawerCard}>
                    <div className={styles.playerRow}>
                      <span className={styles.playerAvatar}>
                        {(sb.leadBookerName || '?').trim().charAt(0).toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className={styles.playerName}>{sb.leadBookerName}</div>
                        {sb.leadBookerEmail && <div className={styles.playerEmail}>{sb.leadBookerEmail}</div>}
                      </div>
                      {st.walkIn && <span className={styles.walkInTag}>🚶 Walk-in</span>}
                    </div>
                  </section>

                  {/* Key facts */}
                  <div className={styles.factGrid}>
                    <div className={styles.fact}>
                      <span className={styles.factLabel}>Duration</span>
                      <span className={styles.factValue}>{sb.durationMinutes} min</span>
                    </div>
                    <div className={styles.fact}>
                      <span className={styles.factLabel}>{st.paid ? 'Total Paid' : 'Amount Due'}</span>
                      <span className={`${styles.factValue} ${st.paid ? styles.factPaid : styles.factDue}`}>
                        {peso(sb.totalAmount)}
                      </span>
                    </div>
                  </div>

                  {sb.notes && (
                    <section className={styles.drawerCard}>
                      <span className={styles.drawerSectionLabel}>Notes &amp; Payment Details</span>
                      <p className={styles.drawerNotes}>{sb.notes}</p>
                    </section>
                  )}

                  {addons.length > 0 && (
                    <section className={styles.drawerCard}>
                      <span className={styles.drawerSectionLabel}>Gear Rentals</span>
                      {addons.map((a: any) => (
                        <div key={a.id} className={styles.lineRow}>
                          <span>
                            {a.productName} × {a.quantity}
                          </span>
                          <strong>{peso(parseFloat(a.unitPrice) * a.quantity)}</strong>
                        </div>
                      ))}
                    </section>
                  )}

                  {participants.length > 0 && (
                    <section className={styles.drawerCard}>
                      <span className={styles.drawerSectionLabel}>
                        Split Payment · {participants.length} Players
                      </span>
                      {participants.map((p: any, idx: number) => (
                        <div key={p.id} className={styles.lineRow}>
                          <span>
                            Player {idx + 1} · <strong>{peso(p.shareAmount)}</strong>
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <Badge
                              label={p.paymentStatus}
                              status={p.paymentStatus === 'PAID' ? 'confirmed' : 'pending'}
                            />
                            {p.paymentStatus === 'PENDING' && (
                              <button
                                type="button"
                                className={styles.verifyShareBtn}
                                onClick={() => handleConfirmPayment(p.id)}
                              >
                                Verify
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </section>
                  )}

                  {/* Payment verification */}
                  {sb.status === 'AWAITING_PAYMENT' && (
                    <section className={styles.verifyBox}>
                      <span className={styles.verifyTitle}>💳 Verify payment to confirm this booking</span>
                      <div className={styles.pillGroup}>
                        <button
                          type="button"
                          className={`${styles.pillBtn} ${paymentMethod === 'EWALLET' ? styles.pillActive : ''}`}
                          onClick={() => setPaymentMethod('EWALLET')}
                        >
                          📱 E-Wallet
                        </button>
                        <button
                          type="button"
                          className={`${styles.pillBtn} ${paymentMethod === 'CASH' ? styles.pillActive : ''}`}
                          onClick={() => setPaymentMethod('CASH')}
                        >
                          💵 Cash
                        </button>
                      </div>
                      {paymentMethod === 'EWALLET' && (
                        <input
                          className={styles.verifyInput}
                          placeholder="Reference # (e.g. GCASH-982143)"
                          value={paymentRef}
                          onChange={(e) => setPaymentRef(e.target.value)}
                        />
                      )}
                      <Button
                        id="btn-confirm-full-payment"
                        type="button"
                        variant="primary"
                        loading={verifyingPayment}
                        onClick={() => handleConfirmPayment()}
                        style={{ width: '100%' }}
                      >
                        ✓ Confirm Payment · {peso(sb.totalAmount)}
                      </Button>
                    </section>
                  )}
                </div>

                <footer className={styles.drawerFooter}>
                  <Button
                    id="btn-void-noshow"
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => handleCancelSelectedBooking('NO_SHOW')}
                    title="Void reservation after 30-minute onsite physical no-show grace period"
                  >
                    Void (No-Show)
                  </Button>
                  <Button
                    id="btn-cancel-reservation"
                    type="button"
                    variant="ghost"
                    size="sm"
                    style={{ color: 'var(--ink-red)' }}
                    onClick={() => handleCancelSelectedBooking('CANCELLED')}
                  >
                    Cancel Booking
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedBooking(null)}>
                    Close
                  </Button>
                </footer>
              </aside>
            </div>
          );
        })()}
      </main>
    </>
  );
}
