import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';
import { differenceInHours } from 'date-fns';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// GET /api/bookings/:id - Booking details
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: {
        court: true,
        leadBooker: true,
        participants: { include: { user: true } },
        addons: { include: { product: true } },
      },
    });

    if (!booking) {
      return NextResponse.json(apiError('Booking not found'), { status: 404 });
    }

    return NextResponse.json(
      apiSuccess({
        id: booking.id,
        courtId: booking.courtId,
        courtName: booking.court.name,
        surfaceType: booking.court.surfaceType,
        hourlyRate: booking.court.hourlyRate.toString(),
        leadBookerId: booking.leadBookerId,
        leadBookerName: booking.leadBooker.fullName,
        leadBookerEmail: booking.leadBooker.email,
        leadBookerPhone: booking.leadBooker.phone,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        durationMinutes: booking.durationMinutes,
        status: booking.status,
        totalAmount: booking.totalAmount.toString(),
        notes: booking.notes,
        paymentConfirmedBy: booking.paymentConfirmedBy,
        paymentConfirmedAt: booking.paymentConfirmedAt?.toISOString() ?? null,
        createdAt: booking.createdAt.toISOString(),
        participants: booking.participants.map((p) => ({
          id: p.id,
          userId: p.userId,
          name: p.user.fullName,
          email: p.user.email,
          shareAmount: p.shareAmount.toString(),
          paymentStatus: p.paymentStatus,
        })),
        addons: booking.addons.map((a) => ({
          id: a.id,
          productId: a.productId,
          productName: a.product.name,
          quantity: a.quantity,
          unitPrice: a.unitPrice.toString(),
        })),
      })
    );
  } catch (error: unknown) {
    console.error('Error fetching booking details:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch booking details';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// PATCH /api/bookings/:id - Update booking status or reschedule
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const body = await request.json();
    const { status, notes, startTime, durationMinutes } = body;

    const existing = await prisma.booking.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json(apiError('Booking not found'), { status: 404 });
    }

    // Disallow modifying concluded or already cancelled/voided bookings
    if (existing.status === 'CANCELLED' || existing.status === 'NO_SHOW') {
      return NextResponse.json(apiError('Cannot modify a cancelled or voided booking'), { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (notes !== undefined) data.notes = notes;

    // Rescheduling logic if startTime or duration changed
    if (startTime) {
      const newStart = new Date(startTime);
      if (isNaN(newStart.getTime())) {
        return NextResponse.json(apiError('Invalid startTime format'), { status: 400 });
      }

      // Constraint: No booking/rescheduling before the present date and time
      if (newStart.getTime() <= Date.now()) {
        return NextResponse.json(
          apiError('Cannot reschedule to a past date or time. Please select a future slot.'),
          { status: 400 }
        );
      }

      if (new Date(existing.endTime).getTime() <= Date.now()) {
        return NextResponse.json(
          apiError('Cannot reschedule a booking that has already ended.'),
          { status: 400 }
        );
      }

      const duration = durationMinutes ? parseInt(durationMinutes, 10) : existing.durationMinutes;
      const newEnd = new Date(newStart.getTime() + duration * 60000);

      // Check conflict
      const conflict = await prisma.booking.findFirst({
        where: {
          id: { not: params.id },
          courtId: existing.courtId,
          status: { in: ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED'] },
          OR: [
            {
              startTime: { lt: newEnd },
              endTime: { gt: newStart },
            },
          ],
        },
      });

      if (conflict) {
        return NextResponse.json(
          apiError('Cannot reschedule: Target slot overlaps with another booking'),
          { status: 409 }
        );
      }

      data.startTime = newStart;
      data.endTime = newEnd;
      data.durationMinutes = duration;
    }

    const updated = await prisma.booking.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(apiSuccess(updated));
  } catch (error: unknown) {
    console.error('Error updating booking:', error);
    const message = error instanceof Error ? error.message : 'Failed to update booking';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// DELETE /api/bookings/:id - Cancel booking with 12-hour grace window check (Decision 6)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
    });

    if (!booking) {
      return NextResponse.json(apiError('Booking not found'), { status: 404 });
    }

    if (booking.status === 'CANCELLED') {
      return NextResponse.json(apiError('Booking is already cancelled'), { status: 400 });
    }

    if (new Date(booking.endTime).getTime() <= Date.now()) {
      return NextResponse.json(apiError('Cannot cancel a booking that has already concluded'), { status: 400 });
    }

    // Check cancellation window
    const hoursUntilSession = differenceInHours(new Date(booking.startTime), new Date());
    const isLateCancellation = hoursUntilSession < 12;

    const cancelled = await prisma.booking.update({
      where: { id: params.id },
      data: {
        status: 'CANCELLED',
        notes: isLateCancellation
          ? `${booking.notes ? booking.notes + ' | ' : ''}Late cancellation (< 12h policy)`
          : booking.notes,
      },
    });

    return NextResponse.json(
      apiSuccess({
        id: cancelled.id,
        status: cancelled.status,
        isLateCancellation,
        hoursUntilSession,
        message: isLateCancellation
          ? 'Booking cancelled within the 12-hour window. Staff review required for refund.'
          : 'Booking cancelled successfully within standard cancellation grace period.',
      })
    );
  } catch (error: unknown) {
    console.error('Error cancelling booking:', error);
    const message = error instanceof Error ? error.message : 'Failed to cancel booking';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
