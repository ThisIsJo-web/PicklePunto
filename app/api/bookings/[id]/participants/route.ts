import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// POST /api/bookings/:id/participants - Add a participant to split payment
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(apiError('Missing userId'), { status: 400 });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: { participants: true },
    });

    if (!booking) {
      return NextResponse.json(apiError('Booking not found'), { status: 404 });
    }

    // Check if participant already added
    const alreadyExists = booking.participants.some((p) => p.userId === userId);
    if (alreadyExists) {
      return NextResponse.json(apiError('User is already a participant on this booking'), {
        status: 400,
      });
    }

    // Recalculate shares: new participant count
    const newCount = booking.participants.length + 1;
    const total = Number(booking.totalAmount);
    const newShare = (total / newCount).toFixed(2);

    const result = await prisma.$transaction(async (tx) => {
      // Create new participant
      const created = await tx.bookingParticipant.create({
        data: {
          bookingId: booking.id,
          userId,
          shareAmount: parseFloat(newShare),
          paymentStatus: 'PENDING',
        },
      });

      // Update existing participants share amount
      await tx.bookingParticipant.updateMany({
        where: { bookingId: booking.id },
        data: { shareAmount: parseFloat(newShare) },
      });

      return created;
    }, {
      maxWait: 10000,
      timeout: 15000,
    });

    return NextResponse.json(apiSuccess(result), { status: 201 });
  } catch (error: unknown) {
    console.error('Error adding participant:', error);
    const message = error instanceof Error ? error.message : 'Failed to add participant';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
