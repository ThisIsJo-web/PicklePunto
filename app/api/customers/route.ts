import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

// GET /api/customers - List customers/players with stats & search
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || '';
    const role = searchParams.get('role')?.trim() || '';

    const whereClause: Record<string, unknown> = {};

    if (role && role !== 'ALL') {
      whereClause.role = role;
    }

    if (search) {
      whereClause.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      include: {
        bookingsAsLeader: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            startTime: true,
          },
        },
        posTabs: {
          select: {
            id: true,
            status: true,
            items: {
              select: {
                quantity: true,
                unitPrice: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const customersDto = users.map((u) => {
      // Calculate total court spend from confirmed bookings
      const courtSpend = u.bookingsAsLeader
        .filter((b) => b.status === 'CONFIRMED')
        .reduce((sum, b) => sum + parseFloat(b.totalAmount.toString()), 0);

      // Calculate POS spend from closed tabs
      const posSpend = u.posTabs
        .filter((t) => t.status === 'CLOSED')
        .reduce((tabSum, t) => {
          const itemsSum = t.items.reduce(
            (iSum, item) => iSum + item.quantity * parseFloat(item.unitPrice.toString()),
            0
          );
          return tabSum + itemsSum;
        }, 0);

      const totalLifetimeSpend = courtSpend + posSpend;
      const totalBookings = u.bookingsAsLeader.length;
      const confirmedBookings = u.bookingsAsLeader.filter((b) => b.status === 'CONFIRMED').length;

      // Find last active date
      const bookingDates = u.bookingsAsLeader.map((b) => new Date(b.startTime).getTime());
      const lastBookingTime = bookingDates.length > 0 ? Math.max(...bookingDates) : null;

      return {
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        role: u.role,
        notes: u.notes,
        createdAt: u.createdAt.toISOString(),
        totalBookings,
        confirmedBookings,
        totalLifetimeSpend: totalLifetimeSpend.toFixed(2),
        lastActiveAt: lastBookingTime ? new Date(lastBookingTime).toISOString() : null,
      };
    });

    return NextResponse.json(apiSuccess(customersDto));
  } catch (error: unknown) {
    console.error('Error fetching customers:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch customers';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
