import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/customers/[id] - Fetch detailed player profile, booking history & tabs
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        bookingsAsLeader: {
          include: {
            court: {
              select: { id: true, name: true, surfaceType: true },
            },
          },
          orderBy: { startTime: 'desc' },
          take: 50,
        },
        posTabs: {
          include: {
            court: { select: { id: true, name: true } },
            items: {
              include: {
                product: { select: { name: true, category: true } },
              },
            },
            transactions: true,
          },
          orderBy: { openedAt: 'desc' },
          take: 30,
        },
      },
    });

    if (!user) {
      return NextResponse.json(apiError('Customer not found'), { status: 404 });
    }

    const courtSpend = user.bookingsAsLeader
      .filter((b) => b.status === 'CONFIRMED')
      .reduce((sum, b) => sum + parseFloat(b.totalAmount.toString()), 0);

    const posSpend = user.posTabs
      .filter((t) => t.status === 'CLOSED')
      .reduce((tabSum, t) => {
        const itemsSum = t.items.reduce(
          (iSum, item) => iSum + item.quantity * parseFloat(item.unitPrice.toString()),
          0
        );
        return tabSum + itemsSum;
      }, 0);

    return NextResponse.json(
      apiSuccess({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        notes: user.notes,
        createdAt: user.createdAt.toISOString(),
        stats: {
          totalBookings: user.bookingsAsLeader.length,
          confirmedBookings: user.bookingsAsLeader.filter((b) => b.status === 'CONFIRMED').length,
          cancelledBookings: user.bookingsAsLeader.filter((b) => b.status === 'CANCELLED').length,
          noShowBookings: user.bookingsAsLeader.filter((b) => b.status === 'NO_SHOW').length,
          courtSpend: courtSpend.toFixed(2),
          posSpend: posSpend.toFixed(2),
          totalLifetimeSpend: (courtSpend + posSpend).toFixed(2),
          openTabsCount: user.posTabs.filter((t) => t.status === 'OPEN').length,
        },
        recentBookings: user.bookingsAsLeader.map((b) => ({
          id: b.id,
          courtName: b.court.name,
          startTime: b.startTime.toISOString(),
          endTime: b.endTime.toISOString(),
          durationMinutes: b.durationMinutes,
          status: b.status,
          totalAmount: b.totalAmount.toString(),
          isWalkIn: b.isWalkIn,
          createdAt: b.createdAt.toISOString(),
        })),
        recentTabs: user.posTabs.map((t) => {
          const totalAmount = t.items.reduce(
            (sum, item) => sum + item.quantity * parseFloat(item.unitPrice.toString()),
            0
          );
          return {
            id: t.id,
            courtName: t.court?.name || 'Walk-In / Lounge',
            status: t.status,
            openedAt: t.openedAt.toISOString(),
            closedAt: t.closedAt?.toISOString() || null,
            itemCount: t.items.reduce((sum, i) => sum + i.quantity, 0),
            totalAmount: totalAmount.toFixed(2),
          };
        }),
      })
    );
  } catch (error: unknown) {
    console.error('Error fetching customer profile:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch customer profile';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// PATCH /api/customers/[id] - Update customer staff notes or contact details
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { notes, phone, fullName } = body;

    const existing = await prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(apiError('Customer not found'), { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (notes !== undefined) data.notes = notes;
    if (phone !== undefined) data.phone = phone;
    if (fullName !== undefined && fullName.trim()) data.fullName = fullName.trim();

    const updated = await prisma.user.update({
      where: { id },
      data,
    });

    return NextResponse.json(
      apiSuccess({
        id: updated.id,
        fullName: updated.fullName,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        notes: updated.notes,
        updatedAt: new Date().toISOString(),
      })
    );
  } catch (error: unknown) {
    console.error('Error updating customer profile:', error);
    const message = error instanceof Error ? error.message : 'Failed to update customer profile';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
