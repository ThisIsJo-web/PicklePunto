import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';
import { subDays, startOfDay, endOfDay } from 'date-fns';

export const dynamic = 'force-dynamic';

// GET /api/reports/occupancy?days=7|30
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = parseInt(searchParams.get('days') || '7', 10);
    const rangeDays = isNaN(daysParam) || daysParam <= 0 ? 7 : Math.min(60, daysParam);

    const now = new Date();
    const startDate = startOfDay(subDays(now, rangeDays - 1));
    const endDate = endOfDay(now);

    const [courts, bookings] = await Promise.all([
      prisma.court.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      prisma.booking.findMany({
        where: {
          startTime: {
            gte: startDate,
            lte: endDate,
          },
          status: { in: ['CONFIRMED', 'AWAITING_PAYMENT'] },
        },
      }),
    ]);

    // Hourly histogram covering full 24h cycle
    const hourlyHistogram: { hour: number; label: string; count: number }[] = [];
    for (let h = 0; h < 24; h++) {
      const label = `${h % 12 || 12}:00 ${h >= 12 ? 'PM' : 'AM'}`;
      hourlyHistogram.push({ hour: h, label, count: 0 });
    }

    // Per-court utilization
    const courtStats: Record<
      string,
      {
        id: string;
        name: string;
        surfaceType: string;
        hourlyRate: number;
        totalCapacityMinutes: number;
        bookedMinutes: number;
        bookingsCount: number;
      }
    > = {};

    for (const c of courts) {
      const [openH, openM] = c.openingTime.split(':').map(Number);
      const [closeH, closeM] = c.closingTime.split(':').map(Number);
      let dayMinutes = (closeH * 60 + closeM) - (openH * 60 + openM);
      if (dayMinutes < 0) dayMinutes += 24 * 60;
      const totalCapacity = Math.max(0, dayMinutes * rangeDays);

      courtStats[c.id] = {
        id: c.id,
        name: c.name,
        surfaceType: c.surfaceType,
        hourlyRate: Number(c.hourlyRate),
        totalCapacityMinutes: totalCapacity,
        bookedMinutes: 0,
        bookingsCount: 0,
      };
    }

    for (const b of bookings) {
      const startH = new Date(b.startTime).getHours();
      const histItem = hourlyHistogram.find((item) => item.hour === startH);
      if (histItem) {
        histItem.count += 1;
      }

      if (courtStats[b.courtId]) {
        courtStats[b.courtId].bookedMinutes += b.durationMinutes;
        courtStats[b.courtId].bookingsCount += 1;
      }
    }

    const courtBreakdown = Object.values(courtStats).map((cs) => {
      const occupancyRate =
        cs.totalCapacityMinutes > 0
          ? Math.min(100, parseFloat(((cs.bookedMinutes / cs.totalCapacityMinutes) * 100).toFixed(1)))
          : 0;

      return {
        id: cs.id,
        name: cs.name,
        surfaceType: cs.surfaceType,
        hourlyRate: cs.hourlyRate,
        bookedHours: parseFloat((cs.bookedMinutes / 60).toFixed(1)),
        capacityHours: parseFloat((cs.totalCapacityMinutes / 60).toFixed(1)),
        bookingsCount: cs.bookingsCount,
        occupancyRate,
      };
    });

    const totalFacilityCapacity = courtBreakdown.reduce((acc, c) => acc + c.capacityHours, 0);
    const totalFacilityBooked = courtBreakdown.reduce((acc, c) => acc + c.bookedHours, 0);
    const overallOccupancyRate =
      totalFacilityCapacity > 0
        ? Math.min(100, parseFloat(((totalFacilityBooked / totalFacilityCapacity) * 100).toFixed(1)))
        : 0;

    return NextResponse.json(
      apiSuccess({
        rangeDays,
        overallOccupancyRate,
        totalBookedHours: parseFloat(totalFacilityBooked.toFixed(1)),
        totalCapacityHours: parseFloat(totalFacilityCapacity.toFixed(1)),
        courtBreakdown,
        hourlyHistogram,
      })
    );
  } catch (error: unknown) {
    console.error('Error fetching occupancy report:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch occupancy report';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
