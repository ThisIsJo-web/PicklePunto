import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';
import { isBefore, isAfter } from 'date-fns';

export const dynamic = 'force-dynamic';

// Helper to convert "HH:MM" on today's local date to Date object
function timeStringToDate(date: Date, timeStr: string): Date {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return new Date(`${y}-${m}-${d}T${timeStr}:00`);
}

export type CourtLiveState = 'AVAILABLE' | 'USING' | 'RESERVED' | 'BLOCKED' | 'CLOSED';

export async function GET() {
  try {
    const now = new Date();

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

    // Fetch active blocks covering right now or upcoming today
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const queryFrom = new Date(dayStart.getTime() - 14 * 3600 * 1000);
    const queryTo = new Date(dayEnd.getTime() + 14 * 3600 * 1000);

    const blocks = await prisma.courtBlock.findMany({
      where: {
        blockedFrom: { lte: queryTo },
        blockedTo: { gte: queryFrom },
      },
    });

    // Fetch bookings for today (excluding CANCELLED and NO_SHOW)
    const bookings = await prisma.booking.findMany({
      where: {
        startTime: { gte: queryFrom, lte: queryTo },
        status: { in: ['CONFIRMED', 'AWAITING_PAYMENT', 'PENDING'] },
      },
      include: {
        leadBooker: { select: { fullName: true, email: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    const statusList = courts.map((court) => {
      const openTime = timeStringToDate(now, court.openingTime);
      const closeTime = timeStringToDate(now, court.closingTime);

      let state: CourtLiveState = 'AVAILABLE';
      let currentSession: {
        bookingId?: string;
        leadPlayerName?: string;
        startTime?: string;
        endTime?: string;
        durationMinutes?: number;
        reason?: string | null;
      } | null = null;

      // 1. Check if outside operating hours
      if (isBefore(now, openTime) || isAfter(now, closeTime)) {
        state = 'CLOSED';
      }

      // 2. Check active block covering now
      const activeBlock = blocks.find(
        (b) => b.courtId === court.id && isBefore(new Date(b.blockedFrom), now) && isAfter(new Date(b.blockedTo), now)
      );

      if (activeBlock) {
        state = 'BLOCKED';
        currentSession = {
          reason: activeBlock.reason,
          startTime: activeBlock.blockedFrom.toISOString(),
          endTime: activeBlock.blockedTo.toISOString(),
        };
      }

      // 3. Check active booking covering now
      if (state !== 'BLOCKED') {
        const activeBooking = bookings.find(
          (b) => b.courtId === court.id && isBefore(new Date(b.startTime), now) && isAfter(new Date(b.endTime), now)
        );

        if (activeBooking) {
          if (activeBooking.status === 'CONFIRMED') {
            state = 'USING'; // Confirmed and actively in session
          } else {
            state = 'RESERVED'; // Pending/awaiting payment
          }
          currentSession = {
            bookingId: activeBooking.id,
            leadPlayerName: activeBooking.leadBooker.fullName,
            startTime: activeBooking.startTime.toISOString(),
            endTime: activeBooking.endTime.toISOString(),
            durationMinutes: activeBooking.durationMinutes,
          };
        }
      }

      // 4. Find next upcoming booking today
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
      reserved: statusList.filter((c) => c.currentState === 'RESERVED').length,
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
