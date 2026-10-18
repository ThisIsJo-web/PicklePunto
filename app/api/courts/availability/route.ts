import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';
import { parseISO, addMinutes, isBefore, isAfter, isEqual } from 'date-fns';

export const dynamic = 'force-dynamic';

// Helper to convert "HH:MM" on a given date to a Date object in local time
function timeStringToDate(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // YYYY-MM-DD
    const durationParam = parseInt(searchParams.get('duration') || '60', 10);
    const courtIdParam = searchParams.get('court_id');

    if (!dateParam) {
      return NextResponse.json(apiError('Missing required query param: date (YYYY-MM-DD)'), {
        status: 400,
      });
    }

    // ── Rule: Auto-void physical on-site no-shows (30-minute grace period from reservation start time) ──
    const now = new Date();
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
    }).catch((e) => console.warn('Auto-void sweep error in availability:', e));

    const duration = [30, 60, 90].includes(durationParam) ? durationParam : 60;

    // Fetch active courts (or specific court if requested)
    const courts = await prisma.court.findMany({
      where: {
        isActive: true,
        ...(courtIdParam ? { id: courtIdParam } : {}),
      },
      orderBy: { name: 'asc' },
    });

    // Timezone-safe local day bounds with buffer
    const localDayStart = new Date(`${dateParam}T00:00:00`);
    const localDayEnd = new Date(`${dateParam}T23:59:59.999`);
    const queryFrom = new Date(localDayStart.getTime() - 14 * 3600 * 1000);
    const queryTo = new Date(localDayEnd.getTime() + 14 * 3600 * 1000);

    // Fetch active bookings (PENDING, AWAITING_PAYMENT, CONFIRMED - excluding CANCELLED and NO_SHOW)
    const bookings = await prisma.booking.findMany({
      where: {
        status: { in: ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED'] },
        startTime: { gte: queryFrom, lte: queryTo },
      },
    });

    // Fetch blocks for the target day
    const blocks = await prisma.courtBlock.findMany({
      where: {
        blockedFrom: { lte: queryTo },
        blockedTo: { gte: queryFrom },
      },
    });

    // Compute available slots per court
    const courtAvailability = courts.map((court) => {
      const courtOpen = timeStringToDate(dateParam, court.openingTime);
      const courtClose = timeStringToDate(dateParam, court.closingTime);

      const slots: { startTime: string; endTime: string; durationMinutes: number }[] = [];

      let currentSlotStart = courtOpen;

      while (true) {
        const currentSlotEnd = addMinutes(currentSlotStart, duration);

        // Cannot exceed court closing time
        if (isAfter(currentSlotEnd, courtClose)) {
          break;
        }

        // ── Constraint: Disallow past slots (before or equal to current time) ──
        if (isBefore(currentSlotStart, now) || isEqual(currentSlotStart, now)) {
          currentSlotStart = addMinutes(currentSlotStart, 30);
          continue;
        }

        // Check if overlaps any active booking for this court
        const bookingOverlap = bookings.some((b) => {
          if (b.courtId !== court.id) return false;
          const bStart = new Date(b.startTime);
          const bEnd = new Date(b.endTime);
          return (
            (isBefore(currentSlotStart, bEnd) && isAfter(currentSlotEnd, bStart)) ||
            isEqual(currentSlotStart, bStart)
          );
        });

        // Check if overlaps any court block
        const blockOverlap = blocks.some((blk) => {
          if (blk.courtId !== court.id) return false;
          const blkStart = new Date(blk.blockedFrom);
          const blkEnd = new Date(blk.blockedTo);
          return (
            (isBefore(currentSlotStart, blkEnd) && isAfter(currentSlotEnd, blkStart)) ||
            isEqual(currentSlotStart, blkStart)
          );
        });

        if (!bookingOverlap && !blockOverlap) {
          slots.push({
            startTime: currentSlotStart.toISOString(),
            endTime: currentSlotEnd.toISOString(),
            durationMinutes: duration,
          });
        }

        // Step by 30-minute intervals to support staggered start times
        currentSlotStart = addMinutes(currentSlotStart, 30);
      }

      return {
        courtId: court.id,
        courtName: court.name,
        surfaceType: court.surfaceType,
        hourlyRate: court.hourlyRate.toString(),
        openingTime: court.openingTime,
        closingTime: court.closingTime,
        availableSlots: slots,
      };
    });

    return NextResponse.json(apiSuccess(courtAvailability));
  } catch (error: unknown) {
    console.error('Error calculating court availability:', error);
    const message = error instanceof Error ? error.message : 'Failed to calculate availability';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
