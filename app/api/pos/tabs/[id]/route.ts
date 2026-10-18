import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

// GET /api/pos/tabs/[id] - Fetch single tab details
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id } = params;

    const tab = await prisma.posTab.findUnique({
      where: { id },
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
    });

    if (!tab) {
      return NextResponse.json(apiError('POS Tab not found'), { status: 404 });
    }

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

    const tabDto = {
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

    return NextResponse.json(apiSuccess(tabDto));
  } catch (error: unknown) {
    console.error('Error fetching tab:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch tab';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// DELETE /api/pos/tabs/[id] - Cancel/void open tab and restore inventory
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { id } = params;

    const tab = await prisma.posTab.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!tab) {
      return NextResponse.json(apiError('POS Tab not found'), { status: 404 });
    }

    if (tab.status === 'CLOSED') {
      return NextResponse.json(apiError('Cannot void an already closed and paid tab'), { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // Restore stock for all items
      for (const item of tab.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity } },
        });
      }

      // Delete tab items & tab
      await tx.posTabItem.deleteMany({ where: { tabId: id } });
      await tx.posTab.delete({ where: { id } });
    });

    return NextResponse.json(apiSuccess({ message: 'POS Tab cancelled and stock restored' }));
  } catch (error: unknown) {
    console.error('Error deleting tab:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete tab';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
