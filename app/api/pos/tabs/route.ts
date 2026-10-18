import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

// GET /api/pos/tabs - List POS tabs (filter by ?status=OPEN|CLOSED, ?courtId=, ?playerId=)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const courtId = searchParams.get('courtId');
    const playerId = searchParams.get('playerId');

    const where: any = {};
    if (statusParam === 'OPEN' || statusParam === 'CLOSED') {
      where.status = statusParam;
    }
    if (courtId) where.courtId = courtId;
    if (playerId) where.playerId = playerId;

    const tabs = await prisma.posTab.findMany({
      where,
      include: {
        court: { select: { id: true, name: true } },
        player: { select: { id: true, fullName: true, email: true, phone: true } },
        items: {
          include: {
            product: {
              select: { id: true, name: true, category: true, sku: true, price: true },
            },
          },
          orderBy: { addedAt: 'asc' },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { openedAt: 'desc' },
    });

    const tabsDto = tabs.map((tab) => {
      let totalAmount = 0;
      const items = tab.items.map((item) => {
        const unitPriceNum = Number(item.unitPrice);
        const lineTotal = unitPriceNum * item.quantity;
        totalAmount += lineTotal;

        return {
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          category: item.product.category,
          sku: item.product.sku,
          quantity: item.quantity,
          unitPrice: unitPriceNum.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
          addedAt: item.addedAt.toISOString(),
        };
      });

      return {
        id: tab.id,
        courtId: tab.courtId,
        courtName: tab.court?.name ?? null,
        playerId: tab.playerId,
        playerName: tab.player?.fullName ?? 'Counter Walk-in Guest',
        playerEmail: tab.player?.email ?? null,
        playerPhone: tab.player?.phone ?? null,
        status: tab.status,
        openedAt: tab.openedAt.toISOString(),
        closedAt: tab.closedAt ? tab.closedAt.toISOString() : null,
        itemsCount: items.reduce((acc, i) => acc + i.quantity, 0),
        totalAmount: totalAmount.toFixed(2),
        items,
        transactions: tab.transactions.map((tx) => ({
          id: tx.id,
          amount: Number(tx.amount).toFixed(2),
          paymentMethod: tx.paymentMethod,
          paymentReference: tx.paymentReference,
          createdAt: tx.createdAt.toISOString(),
        })),
      };
    });

    return NextResponse.json(apiSuccess(tabsDto));
  } catch (error: unknown) {
    console.error('Error fetching POS tabs:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch POS tabs';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// POST /api/pos/tabs - Open a new POS tab
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { courtId, playerId, items = [] } = body;

    // Open tab and add initial items inside transaction
    const tab = await prisma.$transaction(async (tx) => {
      const createdTab = await tx.posTab.create({
        data: {
          courtId: courtId || null,
          playerId: playerId || null,
          status: 'OPEN',
        },
      });

      if (Array.isArray(items) && items.length > 0) {
        for (const item of items) {
          if (!item.productId || !item.quantity || item.quantity <= 0) continue;

          const product = await tx.product.findUnique({
            where: { id: item.productId },
          });

          if (!product) {
            throw new Error(`Product not found: ${item.productId}`);
          }

          if (product.stockQty < item.quantity) {
            throw new Error(
              `Insufficient stock for "${product.name}". Available: ${product.stockQty}, Requested: ${item.quantity}`
            );
          }

          // Decrement stock
          await tx.product.update({
            where: { id: product.id },
            data: { stockQty: product.stockQty - item.quantity },
          });

          // Create tab item
          await tx.posTabItem.create({
            data: {
              tabId: createdTab.id,
              productId: product.id,
              quantity: item.quantity,
              unitPrice: product.price,
            },
          });
        }
      }

      return createdTab;
    });

    return NextResponse.json(apiSuccess(tab), { status: 201 });
  } catch (error: unknown) {
    console.error('Error opening POS tab:', error);
    const message = error instanceof Error ? error.message : 'Failed to open POS tab';
    return NextResponse.json(apiError(message), { status: 400 });
  }
}
