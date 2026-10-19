import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';
import { isBefore, isAfter } from 'date-fns';

export const dynamic = 'force-dynamic';

export type CourtLiveState = 'AVAILABLE' | 'USING' | 'BOOKED' | 'BLOCKED' | 'CLOSED';

// Returns "YYYY-MM-DD" in Asia/Manila timezone
function getManilaDateString(d: Date = new Date()): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return f.format(d);
}

// Returns current minutes since midnight in Asia/Manila timezone (0 - 1439)
function getManilaMinutes(d: Date = new Date()): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = f.formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const min = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return hour * 60 + min;
}

function timeStringToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

let cachedLiveStatus: { timestamp: number; key: string; payload: any } | null = null;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const todayManila = getManilaDateString(now);
    const dateParam = searchParams.get('date') || todayManila;
    const isToday = dateParam === todayManila;
    const nowMinutes = getManilaMinutes(now);

    // ── 3-second in-memory response cache for instant client rendering ──
    const cacheKey = `${dateParam}-${Math.floor(now.getTime() / 3000)}`;
    if (cachedLiveStatus && cachedLiveStatus.key === cacheKey) {
      return NextResponse.json(apiSuccess(cachedLiveStatus.payload));
    }

    // ── Non-blocking background sweep for expired unpaid/pending reservations ──
    const thirtyMinutesPastStart = new Date(now.getTime() - 30 * 60 * 1000);
    prisma.booking
      .updateMany({
        where: {
          status: { in: ['PENDING', 'AWAITING_PAYMENT'] },
          startTime: { lte: thirtyMinutesPastStart },
        },
        data: {
          status: 'NO_SHOW',
          notes: 'Voided: 30-minute physical on-site no-show grace period expired',
        },
      })
      .catch((e) => console.warn('Auto-void sweep error:', e));

    // Operating day bounds: 05:00 of dateParam until 02:00 of (dateParam + 1 day)
    const localDayStart = new Date(`${dateParam}T00:00:00`);
    const localDayEnd = new Date(`${dateParam}T23:59:59.999`);
    const queryFrom = new Date(localDayStart.getTime() - 14 * 3600 * 1000);
    const queryTo = new Date(localDayEnd.getTime() + 28 * 3600 * 1000); // covers until next day late afternoon

    // Run all 3 queries in parallel for maximum performance
    const [courts, blocks, bookings] = await Promise.all([
      prisma.court.findMany({ orderBy: { name: 'asc' } }),
      prisma.courtBlock.findMany({
        where: {
          blockedFrom: { lte: queryTo },
          blockedTo: { gte: queryFrom },
        },
      }),
      prisma.booking.findMany({
        where: {
          startTime: { gte: queryFrom, lte: queryTo },
          status: { in: ['CONFIRMED', 'AWAITING_PAYMENT', 'PENDING'] },
        },
        include: {
          leadBooker: { select: { fullName: true, email: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    // Next calendar date string for overnight schedule
    const nextDate = new Date(localDayStart.getTime() + 24 * 3600 * 1000);
    const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

    // Operating window bounds: dateParam 05:00:00 to nextDateStr 02:00:00
    const opWindowStart = new Date(`${dateParam}T05:00:00`);
    const opWindowEnd = new Date(`${nextDateStr}T02:00:00`);

    // Closed period: 02:01 AM to 04:59 AM (120 to 300 minutes from midnight)
    const isFacilityClosedNow = nowMinutes >= 120 && nowMinutes < 300;

    const statusList = courts.map((court) => {
      let state: CourtLiveState = 'AVAILABLE';
      let currentSession: {
        bookingId?: string;
        leadPlayerName?: string;
        startTime?: string;
        endTime?: string;
        durationMinutes?: number;
        reason?: string | null;
      } | null = null;

      // 1. Inactive court
      if (!court.isActive) {
        state = 'BLOCKED';
        currentSession = { reason: 'Court Inactive' };
      }

      // 2. Active block covering right now (for today)
      if (state !== 'BLOCKED' && isToday) {
        const activeBlock = blocks.find(
          (b) =>
            b.courtId === court.id &&
            isBefore(new Date(b.blockedFrom), now) &&
            isAfter(new Date(b.blockedTo), now)
        );
        if (activeBlock) {
          state = 'BLOCKED';
          currentSession = {
            reason: activeBlock.reason,
            startTime: activeBlock.blockedFrom.toISOString(),
            endTime: activeBlock.blockedTo.toISOString(),
          };
        }
      }

      // 3. Active booking covering right now (Confirmed booking counts as Playing)
      if (state !== 'BLOCKED' && isToday) {
        const activeBooking = bookings.find(
          (b) =>
            b.courtId === court.id &&
            isBefore(new Date(b.startTime), now) &&
            isAfter(new Date(b.endTime), now)
        );

        if (activeBooking && activeBooking.status === 'CONFIRMED') {
          state = 'USING'; // Actively in session / Playing
          currentSession = {
            bookingId: activeBooking.id,
            leadPlayerName: activeBooking.leadBooker.fullName,
            startTime: activeBooking.startTime.toISOString(),
            endTime: activeBooking.endTime.toISOString(),
            durationMinutes: activeBooking.durationMinutes,
          };
        }
      }

      // 4. Check if Fully Booked for the operating day (05:00 to 02:00 next day)
      if (state !== 'BLOCKED' && state !== 'USING') {
        let totalSlots = 0;
        let bookedSlots = 0;
        let slotCursor = new Date(opWindowStart);

        while (slotCursor < opWindowEnd) {
          totalSlots++;
          const slotEnd = new Date(slotCursor.getTime() + 30 * 60 * 1000);

          const isOverlappingBooking = bookings.some(
            (b) =>
              b.courtId === court.id &&
              new Date(b.startTime) < slotEnd &&
              new Date(b.endTime) > slotCursor
          );

          const isOverlappingBlock = blocks.some(
            (b) =>
              b.courtId === court.id &&
              new Date(b.blockedFrom) < slotEnd &&
              new Date(b.blockedTo) > slotCursor
          );

          if (isOverlappingBooking || isOverlappingBlock) {
            bookedSlots++;
          }

          slotCursor = slotEnd;
        }

        if (totalSlots > 0 && bookedSlots >= totalSlots) {
          state = 'BOOKED'; // Fully Booked for this operating day
        } else if (isToday && isFacilityClosedNow) {
          // Closed during 2:01 AM to 4:59 AM
          state = 'CLOSED';
        } else {
          state = 'AVAILABLE';
        }
      }

      // 5. Find next upcoming booking for this court
      const upcoming = bookings.find(
        (b) => b.courtId === court.id && isAfter(new Date(b.startTime), now)
      );

      return {
        courtId: court.id,
        courtName: court.name,
        surfaceType: court.surfaceType,
        hourlyRate: court.hourlyRate.toString(),
        openingTime: court.openingTime,
        closingTime: court.closingTime,
        isActive: court.isActive,
        currentState: state,
        currentSession,
        nextSession: upcoming
          ? {
              bookingId: upcoming.id,
              leadPlayerName: upcoming.leadBooker.fullName,
              startTime: upcoming.startTime.toISOString(),
              endTime: upcoming.endTime.toISOString(),
              status: upcoming.status,
            }
          : null,
      };
    });

    const summary = {
      total: statusList.length,
      available: statusList.filter((c) => c.currentState === 'AVAILABLE').length,
      using: statusList.filter((c) => c.currentState === 'USING').length,
      booked: statusList.filter((c) => c.currentState === 'BOOKED').length,
      blocked: statusList.filter((c) => c.currentState === 'BLOCKED').length,
      closed: statusList.filter((c) => c.currentState === 'CLOSED').length,
    };

    const payload = { courts: statusList, summary, timestamp: now.toISOString() };
    cachedLiveStatus = { timestamp: now.getTime(), key: cacheKey, payload };

    return NextResponse.json(apiSuccess(payload));
  } catch (error: unknown) {
    console.error('Error in /api/courts/live-status:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch live court status';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
