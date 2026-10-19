import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

// GET /api/court-blocks - List court blocks (optional filters ?date=YYYY-MM-DD, ?court_id=UUID)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const courtId = searchParams.get('court_id');

    let dateFilter = {};
    if (dateParam) {
      const localDayStart = new Date(`${dateParam}T00:00:00`);
      const localDayEnd = new Date(`${dateParam}T23:59:59.999`);
      const queryFrom = new Date(localDayStart.getTime() - 14 * 3600 * 1000);
      const queryTo = new Date(localDayEnd.getTime() + 28 * 3600 * 1000);
      dateFilter = {
        blockedFrom: { lte: queryTo },
        blockedTo: { gte: queryFrom },
      };
    }

    const blocks = await prisma.courtBlock.findMany({
      where: {
        ...dateFilter,
        ...(courtId ? { courtId } : {}),
      },
      include: {
        court: { select: { id: true, name: true, surfaceType: true } },
      },
      orderBy: { blockedFrom: 'asc' },
    });

    const blocksDto = blocks.map((b) => ({
      id: b.id,
      courtId: b.courtId,
      courtName: b.court.name,
      surfaceType: b.court.surfaceType,
      blockedFrom: b.blockedFrom.toISOString(),
      blockedTo: b.blockedTo.toISOString(),
      reason: b.reason,
      createdBy: b.createdBy,
      createdAt: b.createdAt.toISOString(),
    }));

    return NextResponse.json(apiSuccess(blocksDto));
  } catch (error: unknown) {
    console.error('Error fetching court blocks:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch court blocks';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// POST /api/court-blocks - Create a new court block (Maintenance, Private Event, Clinic)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { courtId, blockedFrom, blockedTo, reason, createdBy } = body;

    if (!courtId || !blockedFrom || !blockedTo) {
      return NextResponse.json(
        apiError('Missing required fields: courtId, blockedFrom, blockedTo'),
        { status: 400 }
      );
    }

    const start = new Date(blockedFrom);
    const end = new Date(blockedTo);

    if (start >= end) {
      return NextResponse.json(
        apiError('Invalid time range: blockedFrom must be before blockedTo'),
        { status: 400 }
      );
    }

    // Check if overlaps existing active bookings
    const activeBooking = await prisma.booking.findFirst({
      where: {
        courtId,
        status: { in: ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED'] },
        OR: [
          {
            startTime: { lt: end },
            endTime: { gt: start },
          },
        ],
      },
    });

    if (activeBooking) {
      return NextResponse.json(
        apiError('Cannot block court: Target time overlaps with an existing booking'),
        { status: 409 }
      );
    }

    const block = await prisma.courtBlock.create({
      data: {
        courtId,
        blockedFrom: start,
        blockedTo: end,
        reason: reason || 'Scheduled Court Maintenance',
        createdBy: createdBy || 'Staff Admin',
      },
      include: {
        court: { select: { name: true } },
      },
    });

    return NextResponse.json(
      apiSuccess({
        id: block.id,
        courtId: block.courtId,
        courtName: block.court.name,
        blockedFrom: block.blockedFrom.toISOString(),
        blockedTo: block.blockedTo.toISOString(),
        reason: block.reason,
        createdBy: block.createdBy,
        createdAt: block.createdAt.toISOString(),
      }),
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating court block:', error);
    const message = error instanceof Error ? error.message : 'Failed to create court block';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
