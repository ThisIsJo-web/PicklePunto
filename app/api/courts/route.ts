import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

// GET /api/courts - List courts (optional query param: ?all=true to include inactive)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('all') === 'true';

    const courts = await prisma.court.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });

    const courtsDto = courts.map((c) => ({
      id: c.id,
      name: c.name,
      surfaceType: c.surfaceType,
      isActive: c.isActive,
      hourlyRate: c.hourlyRate.toString(),
      openingTime: c.openingTime,
      closingTime: c.closingTime,
      createdAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json(apiSuccess(courtsDto));
  } catch (error: unknown) {
    console.error('Error fetching courts:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch courts';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// POST /api/courts - Create a new court (Admin only)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, surfaceType, hourlyRate, openingTime, closingTime, isActive } = body;

    if (!name || !surfaceType || !hourlyRate || !openingTime || !closingTime) {
      return NextResponse.json(
        apiError('Missing required fields: name, surfaceType, hourlyRate, openingTime, closingTime'),
        { status: 400 }
      );
    }

    const court = await prisma.court.create({
      data: {
        name,
        surfaceType,
        hourlyRate: parseFloat(hourlyRate),
        openingTime,
        closingTime,
        isActive: isActive ?? true,
      },
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
      }),
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating court:', error);
    const message = error instanceof Error ? error.message : 'Failed to create court';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
