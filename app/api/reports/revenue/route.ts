import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';

export const dynamic = 'force-dynamic';

// GET /api/reports/revenue?from=&to=&days=7|30
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = parseInt(searchParams.get('days') || '7', 10);
    const rangeDays = isNaN(daysParam) || daysParam <= 0 ? 7 : Math.min(60, daysParam);

    const now = new Date();
    const startDate = startOfDay(subDays(now, rangeDays - 1));
    const endDate = endOfDay(now);

    // Fetch all transactions in range
    const transactions = await prisma.transaction.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        booking: {
          include: { addons: { include: { product: true } } },
        },
        tab: {
          include: { items: { include: { product: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Aggregate by day
    const dayMap: Record<
      string,
      {
        date: string;
        displayDate: string;
        courtRentals: number;
        retail: number;
        foodDrink: number;
        rentals: number;
        total: number;
      }
    > = {};

    for (let i = 0; i < rangeDays; i++) {
      const d = subDays(now, rangeDays - 1 - i);
      const key = format(d, 'yyyy-MM-dd');
      dayMap[key] = {
        date: key,
        displayDate: format(d, 'EEE, MMM d'),
        courtRentals: 0,
        retail: 0,
        foodDrink: 0,
        rentals: 0,
        total: 0,
      };
    }

    let grandTotalCourt = 0;
    let grandTotalRetail = 0;
    let grandTotalFoodDrink = 0;
    let grandTotalRentals = 0;

    for (const tx of transactions) {
      const dayKey = format(tx.createdAt, 'yyyy-MM-dd');
      if (!dayMap[dayKey]) continue;

      const amt = Number(tx.amount);
      dayMap[dayKey].total += amt;

      if (tx.bookingId) {
        dayMap[dayKey].courtRentals += amt;
        grandTotalCourt += amt;
      } else if (tx.tab && tx.tab.items.length > 0) {
        for (const item of tx.tab.items) {
          const itemTotal = Number(item.unitPrice) * item.quantity;
          if (item.product.category === 'FOOD_DRINK') {
            dayMap[dayKey].foodDrink += itemTotal;
            grandTotalFoodDrink += itemTotal;
          } else if (item.product.category === 'RENTAL') {
            dayMap[dayKey].rentals += itemTotal;
            grandTotalRentals += itemTotal;
          } else {
            dayMap[dayKey].retail += itemTotal;
            grandTotalRetail += itemTotal;
          }
        }
      } else {
        dayMap[dayKey].retail += amt;
        grandTotalRetail += amt;
      }
    }

    const timeSeries = Object.values(dayMap).map((d) => ({
      date: d.date,
      displayDate: d.displayDate,
      courtRentals: parseFloat(d.courtRentals.toFixed(2)),
      retail: parseFloat(d.retail.toFixed(2)),
      foodDrink: parseFloat(d.foodDrink.toFixed(2)),
      rentals: parseFloat(d.rentals.toFixed(2)),
      total: parseFloat(d.total.toFixed(2)),
    }));

    const totalRevenue = grandTotalCourt + grandTotalRetail + grandTotalFoodDrink + grandTotalRentals;

    const breakdown = [
      {
        category: 'Court Rentals',
        amount: parseFloat(grandTotalCourt.toFixed(2)),
        percentage: totalRevenue > 0 ? parseFloat(((grandTotalCourt / totalRevenue) * 100).toFixed(1)) : 0,
        color: '#22c55e',
      },
      {
        category: 'Pro Shop & Retail',
        amount: parseFloat(grandTotalRetail.toFixed(2)),
        percentage: totalRevenue > 0 ? parseFloat(((grandTotalRetail / totalRevenue) * 100).toFixed(1)) : 0,
        color: '#3b82f6',
      },
      {
        category: 'Food & Drinks',
        amount: parseFloat(grandTotalFoodDrink.toFixed(2)),
        percentage: totalRevenue > 0 ? parseFloat(((grandTotalFoodDrink / totalRevenue) * 100).toFixed(1)) : 0,
        color: '#eab308',
      },
      {
        category: 'Gear Rentals',
        amount: parseFloat(grandTotalRentals.toFixed(2)),
        percentage: totalRevenue > 0 ? parseFloat(((grandTotalRentals / totalRevenue) * 100).toFixed(1)) : 0,
        color: '#a855f7',
      },
    ];

    return NextResponse.json(
      apiSuccess({
        rangeDays,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        breakdown,
        timeSeries,
      })
    );
  } catch (error: unknown) {
    console.error('Error fetching revenue report:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch revenue report';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
