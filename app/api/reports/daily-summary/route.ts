import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';
import { startOfDay, endOfDay, parseISO } from 'date-fns';

export const dynamic = 'force-dynamic';

// GET /api/reports/daily-summary?date=YYYY-MM-DD
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const targetDate = dateParam ? parseISO(dateParam) : new Date();

    const dayStart = startOfDay(targetDate);
    const dayEnd = endOfDay(targetDate);

    // 1. Transactions for the day
    const transactions = await prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      include: {
        booking: {
          include: { court: true },
        },
        tab: {
          include: {
            court: true,
            items: { include: { product: true } },
          },
        },
      },
    });

    let totalRevenue = 0;
    let courtRentalRevenue = 0;
    let posSalesRevenue = 0;

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      totalRevenue += amount;
      if (tx.bookingId) {
        courtRentalRevenue += amount;
      } else {
        posSalesRevenue += amount;
      }
    }

    // 2. Bookings for the day
    const bookings = await prisma.booking.findMany({
      where: {
        startTime: {
          gte: dayStart,
          lte: dayEnd,
        },
        status: { in: ['CONFIRMED', 'AWAITING_PAYMENT'] },
      },
      include: { court: true },
    });

    const totalBookingsCount = bookings.length;
    const totalMinutesBooked = bookings.reduce((acc, b) => acc + b.durationMinutes, 0);

    // 3. Active Courts & Capacity
    const courts = await prisma.court.findMany({
      where: { isActive: true },
    });

    let totalCapacityMinutes = 0;
    for (const c of courts) {
      const [openH, openM] = c.openingTime.split(':').map(Number);
      const [closeH, closeM] = c.closingTime.split(':').map(Number);
      let courtMinutes = (closeH * 60 + closeM) - (openH * 60 + openM);
      if (courtMinutes < 0) courtMinutes += 24 * 60;
      if (courtMinutes > 0) {
        totalCapacityMinutes += courtMinutes;
      }
    }

    const occupancyRate = totalCapacityMinutes > 0
      ? Math.min(100, parseFloat(((totalMinutesBooked / totalCapacityMinutes) * 100).toFixed(1)))
      : 0;

    // 4. Active Open Tabs
    const openTabsCount = await prisma.posTab.count({
      where: { status: 'OPEN' },
    });

    // 5. Peak Hours distribution across all hours
    const hourHistogram: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourHistogram[h] = 0;

    for (const b of bookings) {
      const startH = new Date(b.startTime).getHours();
      if (hourHistogram[startH] !== undefined) {
        hourHistogram[startH] += 1;
      }
    }

    let peakHour = 18; // fallback 6 PM
    let maxHourBookings = 0;
    for (const [h, count] of Object.entries(hourHistogram)) {
      if (count > maxHourBookings) {
        maxHourBookings = count;
        peakHour = parseInt(h, 10);
      }
    }

    const summary = {
      date: dateParam || new Date().toISOString().slice(0, 10),
      totalRevenue: totalRevenue.toFixed(2),
      courtRentalRevenue: courtRentalRevenue.toFixed(2),
      posSalesRevenue: posSalesRevenue.toFixed(2),
      totalBookingsCount,
      totalHoursPlayed: (totalMinutesBooked / 60).toFixed(1),
      occupancyRate,
      openTabsCount,
      peakHourFormatted: `${peakHour % 12 || 12}:00 ${peakHour >= 12 ? 'PM' : 'AM'}`,
      activeCourtsCount: courts.length,
    };

    return NextResponse.json(apiSuccess(summary));
  } catch (error: unknown) {
    console.error('Error fetching daily summary report:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch daily summary';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
