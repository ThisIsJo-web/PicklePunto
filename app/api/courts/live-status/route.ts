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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const now = new Date();
    const todayManila = getManilaDateString(now);
    const dateParam = searchParams.get('date') || todayManila;
    const isToday = dateParam === todayManila;
    const nowMinutes = getManilaMinutes(now);

    // ── Rule: Auto-void physical on-site no-shows (30-minute grace period from reservation start time) ──
    const thirtyMinutesPastStart = new Date(now.getTime() - 30 * 60 * 1000);
    await prisma.booking.updateMany({
      where: {
        status: { in: ['PENDING', 'AWAITING_PAYMENT'] },
        startTime: { lte: thirtyMinutesPastStart },
      },
      data: {
        status: 'NO_SHOW',
        notes: 'Voided: 30-minute physical on-site no-show grace period expired',
      },
    }).catch((e) => console.warn('Auto-void sweep error:', e));

    const courts = await prisma.court.findMany({
      orderBy: { name: 'asc' },
    });

    // Query bounds covering the target date with timezone buffer (14 hours)
    const localDayStart = new Date(`${dateParam}T00:00:00`);
    const localDayEnd = new Date(`${dateParam}T23:59:59.999`);
    const queryFrom = new Date(localDayStart.getTime() - 14 * 3600 * 1000);
    const queryTo = new Date(localDayEnd.getTime() + 14 * 3600 * 1000);

    const [blocks, bookings] = await Promise.all([
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

    const statusList = courts.map((court) => {
      const openMinutes = timeStringToMinutes(court.openingTime);
      const closeMinutes = timeStringToMinutes(court.closingTime);

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

      // 3. Active booking covering right now (ONLY Confirmed booking counts as Playing)
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

      // 4. Check if Fully Booked for the selected date
      // A court is Fully Booked ONLY if all available operating slots on this date are taken.
      if (state !== 'BLOCKED' && state !== 'USING') {
        const totalDuration = closeMinutes - openMinutes;
        const slotStep = 60; // 1-hour standard booking blocks
        let totalSlots = 0;
        let bookedSlots = 0;

        for (let m = openMinutes; m + slotStep <= closeMinutes; m += slotStep) {
          totalSlots++;
          const slotStartH = String(Math.floor(m / 60)).padStart(2, '0');
          const slotStartM = String(m % 60).padStart(2, '0');
          const slotEndH = String(Math.floor((m + slotStep) / 60)).padStart(2, '0');
          const slotEndM = String((m + slotStep) % 60).padStart(2, '0');

          const slotStart = new Date(`${dateParam}T${slotStartH}:${slotStartM}:00`);
          const slotEnd = new Date(`${dateParam}T${slotEndH}:${slotEndM}:00`);

          const isOverlappingBooking = bookings.some(
            (b) =>
              b.courtId === court.id &&
              new Date(b.startTime) < slotEnd &&
              new Date(b.endTime) > slotStart
          );

          const isOverlappingBlock = blocks.some(
            (b) =>
              b.courtId === court.id &&
              new Date(b.blockedFrom) < slotEnd &&
              new Date(b.blockedTo) > slotStart
          );

          if (isOverlappingBooking || isOverlappingBlock) {
            bookedSlots++;
          }
        }

        if (totalSlots > 0 && bookedSlots >= totalSlots) {
          state = 'BOOKED'; // Fully Booked for this date
        } else if (isToday && nowMinutes >= closeMinutes) {
          // Closed for the night after closing time
          state = 'CLOSED';
        } else {
          // Has at least one available slot!
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

    return NextResponse.json(apiSuccess({ courts: statusList, summary, timestamp: now.toISOString() }));
  } catch (error: unknown) {
    console.error('Error in /api/courts/live-status:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch live court status';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
