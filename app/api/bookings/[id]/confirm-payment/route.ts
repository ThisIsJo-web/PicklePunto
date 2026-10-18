import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// POST /api/bookings/:id/confirm-payment - Staff manually verifies e-wallet / cash transfer
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const body = await request.json();
    const { paymentMethod, paymentReference, staffUserId, participantId } = body;

    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: {
        participants: true,
      },
    });

    if (!booking) {
      return NextResponse.json(apiError('Booking not found'), { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. If confirming a single participant's split share
      if (participantId) {
        const participant = await tx.bookingParticipant.findUnique({
          where: { id: participantId },
        });

        if (!participant) {
          throw new Error('Participant not found');
        }

        await tx.bookingParticipant.update({
          where: { id: participantId },
          data: { paymentStatus: 'PAID' },
        });

        // Record transaction for this share
        await tx.transaction.create({
          data: {
            bookingId: booking.id,
            amount: participant.shareAmount,
            paymentMethod: paymentMethod === 'CASH' ? 'CASH' : 'EWALLET',
            paymentReference: paymentReference || null,
          },
        });

        // Check if all participants are now paid
        const allParticipants = await tx.bookingParticipant.findMany({
          where: { bookingId: booking.id },
        });

        const allPaid = allParticipants.every((p) => p.paymentStatus === 'PAID');

        let updatedBooking = booking;
        if (allPaid) {
          updatedBooking = await tx.booking.update({
            where: { id: booking.id },
            data: {
              status: 'CONFIRMED',
              paymentConfirmedBy: staffUserId || null,
              paymentConfirmedAt: new Date(),
            },
            include: { participants: true },
          });
        }

        return {
          booking: updatedBooking,
          participantPaid: true,
          allPaid,
        };
      }

      // 2. Full booking payment confirmation
      // Mark all participants as PAID
      if (booking.participants.length > 0) {
        await tx.bookingParticipant.updateMany({
          where: { bookingId: booking.id },
          data: { paymentStatus: 'PAID' },
        });
      }

      // Record full transaction
      const transaction = await tx.transaction.create({
        data: {
          bookingId: booking.id,
          amount: booking.totalAmount,
          paymentMethod: paymentMethod === 'CASH' ? 'CASH' : 'EWALLET',
          paymentReference: paymentReference || 'Staff Verified',
        },
      });

      // Update booking to CONFIRMED
      const updatedBooking = await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CONFIRMED',
          paymentConfirmedBy: staffUserId || null,
          paymentConfirmedAt: new Date(),
        },
        include: {
          participants: true,
          court: { select: { name: true } },
        },
      });

      return {
        booking: updatedBooking,
        transaction,
        allPaid: true,
      };
    });

    return NextResponse.json(apiSuccess(result));
  } catch (error: unknown) {
    console.error('Error confirming payment:', error);
    const message = error instanceof Error ? error.message : 'Failed to confirm payment';
    return NextResponse.json(apiError(message), { status: 400 });
  }
}
