import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';
import { addMinutes, isBefore, isAfter, isEqual } from 'date-fns';

export const dynamic = 'force-dynamic';

// Helper to convert "HH:MM" on a given date to a Date object in local time
function timeStringToDate(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

export interface SlotDto {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isAvailable: boolean;
  status: 'available' | 'booked' | 'playing' | 'blocked' | 'open_play' | 'past';
  statusLabel: string;
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

    // ── Non-blocking auto-void physical on-site no-shows (30-minute grace period) ──
    const now = new Date();
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
      .catch((e) => console.warn('Auto-void sweep error in availability:', e));

    const duration = [30, 60, 90].includes(durationParam) ? durationParam : 60;

    // Fetch active courts (or specific court if requested)
    const courts = await prisma.court.findMany({
      where: {
        isActive: true,
        ...(courtIdParam ? { id: courtIdParam } : {}),
      },
      orderBy: { name: 'asc' },
    });

    // Timezone-safe local day bounds with buffer (covers through next day)
    const localDayStart = new Date(`${dateParam}T00:00:00`);
    const localDayEnd = new Date(`${dateParam}T23:59:59.999`);
    const queryFrom = new Date(localDayStart.getTime() - 14 * 3600 * 1000);
    const queryTo = new Date(localDayEnd.getTime() + 28 * 3600 * 1000);

    // Fetch active bookings (PENDING, AWAITING_PAYMENT, CONFIRMED - excluding CANCELLED and NO_SHOW)
    const [bookings, blocks] = await Promise.all([
      prisma.booking.findMany({
        where: {
          status: { in: ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED'] },
          startTime: { gte: queryFrom, lte: queryTo },
        },
      }),
      prisma.courtBlock.findMany({
        where: {
          blockedFrom: { lte: queryTo },
          blockedTo: { gte: queryFrom },
        },
      }),
    ]);

    // Compute slots per court
    const courtAvailability = courts.map((court) => {
      const courtOpen = timeStringToDate(dateParam, court.openingTime);
      let courtClose = timeStringToDate(dateParam, court.closingTime);
      if (court.closingTime < court.openingTime) {
        // Closes next calendar day (e.g. 02:00 AM next day)
        courtClose = addMinutes(courtClose, 24 * 60);
      }

      const allSlots: SlotDto[] = [];

      let currentSlotStart = courtOpen;

      while (true) {
        const currentSlotEnd = addMinutes(currentSlotStart, duration);

        // Cannot exceed court closing time
        if (isAfter(currentSlotEnd, courtClose)) {
          break;
        }

        // Check if overlaps any active booking for this court
        const overlappingBooking = bookings.find((b) => {
          if (b.courtId !== court.id) return false;
          const bStart = new Date(b.startTime);
          const bEnd = new Date(b.endTime);
          return (
            (isBefore(currentSlotStart, bEnd) && isAfter(currentSlotEnd, bStart)) ||
            isEqual(currentSlotStart, bStart)
          );
        });

        // Check if overlaps any court block
        const overlappingBlock = blocks.find((blk) => {
          if (blk.courtId !== court.id) return false;
          const blkStart = new Date(blk.blockedFrom);
          const blkEnd = new Date(blk.blockedTo);
          return (
            (isBefore(currentSlotStart, blkEnd) && isAfter(currentSlotEnd, blkStart)) ||
            isEqual(currentSlotStart, blkStart)
          );
        });

        const isPast = isBefore(currentSlotStart, now) || isEqual(currentSlotStart, now);
        const isCurrentPlaying =
          overlappingBooking &&
          overlappingBooking.status === 'CONFIRMED' &&
          isBefore(new Date(overlappingBooking.startTime), now) &&
          isAfter(new Date(overlappingBooking.endTime), now);

        let isAvailable = false;
        let status: SlotDto['status'] = 'available';
        let statusLabel = 'Available';

        if (overlappingBlock) {
          const reason = overlappingBlock.reason || '';
          if (/open\s*play/i.test(reason)) {
            status = 'open_play';
            statusLabel = 'Open Play';
          } else {
            status = 'blocked';
            statusLabel = 'Maintenance';
          }
          isAvailable = false;
        } else if (isCurrentPlaying) {
          status = 'playing';
          statusLabel = 'Playing Now';
          isAvailable = false;
        } else if (overlappingBooking) {
          status = 'booked';
          statusLabel = 'Booked';
          isAvailable = false;
        } else if (isPast) {
          status = 'past';
          statusLabel = 'Past';
          isAvailable = false;
        } else {
          status = 'available';
          statusLabel = 'Available';
          isAvailable = true;
        }

        allSlots.push({
          startTime: currentSlotStart.toISOString(),
          endTime: currentSlotEnd.toISOString(),
          durationMinutes: duration,
          isAvailable,
          status,
          statusLabel,
        });

        // Step by 30-minute intervals to support flexible start times
        currentSlotStart = addMinutes(currentSlotStart, 30);
      }

      return {
        courtId: court.id,
        courtName: court.name,
        surfaceType: court.surfaceType,
        hourlyRate: court.hourlyRate.toString(),
        openingTime: court.openingTime,
        closingTime: court.closingTime,
        availableSlots: allSlots.filter((s) => s.isAvailable),
        allSlots,
      };
    });

    return NextResponse.json(apiSuccess(courtAvailability));
  } catch (error: unknown) {
    console.error('Error calculating court availability:', error);
    const message = error instanceof Error ? error.message : 'Failed to calculate availability';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
