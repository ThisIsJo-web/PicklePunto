import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

interface RouteParams {
  params: { id: string };
}

// GET /api/courts/:id
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const court = await prisma.court.findUnique({
      where: { id: params.id },
      include: {
        bookings: {
          where: {
            status: { in: ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED'] },
          },
          orderBy: { startTime: 'asc' },
          take: 10,
        },
        courtBlocks: {
          orderBy: { blockedFrom: 'asc' },
          take: 5,
        },
      },
    });

    if (!court) {
      return NextResponse.json(apiError('Court not found'), { status: 404 });
    }

    return NextResponse.json(
      apiSuccess({
        id: court.id,
        name: court.name,
        surfaceType: court.surfaceType,
        isActive: court.isActive,
        hourlyRate: court.hourlyRate.toString(),
        openingTime: court.openingTime,
        closingTime: court.closingTime,
        createdAt: court.createdAt.toISOString(),
        bookings: court.bookings,
        courtBlocks: court.courtBlocks,
      })
    );
  } catch (error: unknown) {
    console.error('Error fetching court:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch court';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// PATCH /api/courts/:id - Update court properties (Admin)
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const body = await request.json();
    const { name, surfaceType, hourlyRate, openingTime, closingTime, isActive } = body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (surfaceType !== undefined) data.surfaceType = surfaceType;
    if (hourlyRate !== undefined) data.hourlyRate = parseFloat(hourlyRate);
    if (openingTime !== undefined) data.openingTime = openingTime;
    if (closingTime !== undefined) data.closingTime = closingTime;
    if (isActive !== undefined) data.isActive = isActive;

    const court = await prisma.court.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(
      apiSuccess({
        id: court.id,
        name: court.name,
        surfaceType: court.surfaceType,
        isActive: court.isActive,
        hourlyRate: court.hourlyRate.toString(),
        openingTime: court.openingTime,
        closingTime: court.closingTime,
        createdAt: court.createdAt.toISOString(),
      })
    );
  } catch (error: unknown) {
    console.error('Error updating court:', error);
    const message = error instanceof Error ? error.message : 'Failed to update court';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// DELETE /api/courts/:id - Deactivate court (safe delete)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const court = await prisma.court.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    return NextResponse.json(apiSuccess({ id: court.id, isActive: false }));
  } catch (error: unknown) {
    console.error('Error deactivating court:', error);
    const message = error instanceof Error ? error.message : 'Failed to deactivate court';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
