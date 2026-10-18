import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

// GET or POST /api/cron/low-stock-check - Automated or manual low-stock audit
export async function POST(request: Request) {
  return handleLowStockCheck();
}

export async function GET(request: Request) {
  return handleLowStockCheck();
}

async function handleLowStockCheck() {
  try {
    // 1. Find all products where stock is at or below threshold
    const products = await prisma.product.findMany({
      orderBy: { stockQty: 'asc' },
    });

    const lowStockItems = products
      .filter((p) => p.stockQty <= p.lowStockThreshold)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        stockQty: p.stockQty,
        lowStockThreshold: p.lowStockThreshold,
        deficit: p.lowStockThreshold - p.stockQty,
      }));

    if (lowStockItems.length === 0) {
      return NextResponse.json(
        apiSuccess({
          message: 'All inventory items are currently above their low-stock thresholds.',
          lowStockCount: 0,
          items: [],
          alertsQueued: 0,
        })
      );
    }

    // 2. Find admin users to notify
    const adminUsers = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'STAFF'] },
      },
      select: { id: true, email: true, fullName: true },
    });

    let alertsQueued = 0;

    // 3. Queue notification for admins if available
    for (const admin of adminUsers) {
      await prisma.notificationLog.create({
        data: {
          userId: admin.id,
          type: 'EMAIL',
          template: 'LOW_STOCK_ALERT',
          status: 'QUEUED',
          payload: {
            recipientEmail: admin.email,
            recipientName: admin.fullName,
            alertDate: new Date().toISOString(),
            lowStockCount: lowStockItems.length,
            items: lowStockItems,
          },
        },
      });
      alertsQueued++;
    }

    return NextResponse.json(
      apiSuccess({
        message: `Identified ${lowStockItems.length} low-stock item(s). Queued ${alertsQueued} staff notification(s).`,
        lowStockCount: lowStockItems.length,
        items: lowStockItems,
        alertsQueued,
      })
    );
  } catch (error: unknown) {
    console.error('Error running low-stock check:', error);
    const message = error instanceof Error ? error.message : 'Failed to perform low-stock check';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
