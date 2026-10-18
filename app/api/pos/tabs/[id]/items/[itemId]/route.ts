import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string; itemId: string };
}

// DELETE /api/pos/tabs/[id]/items/[itemId] - Remove item or decrement quantity from tab
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { id: tabId, itemId } = params;
    const { searchParams } = new URL(request.url);
    const removeCount = parseInt(searchParams.get('quantity') || '0', 10);

    const tab = await prisma.posTab.findUnique({
      where: { id: tabId },
    });

    if (!tab) {
      return NextResponse.json(apiError('POS Tab not found'), { status: 404 });
    }

    if (tab.status === 'CLOSED') {
      return NextResponse.json(apiError('Cannot remove items from a closed tab'), { status: 400 });
    }

    const tabItem = await prisma.posTabItem.findUnique({
      where: { id: itemId },
    });

    if (!tabItem || tabItem.tabId !== tabId) {
      return NextResponse.json(apiError('Tab item not found in this tab'), { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // Determine how many items to restore
      const restoreQty = removeCount > 0 && removeCount < tabItem.quantity ? removeCount : tabItem.quantity;

      // Restore stock
      await tx.product.update({
        where: { id: tabItem.productId },
        data: { stockQty: { increment: restoreQty } },
      });

      if (removeCount > 0 && removeCount < tabItem.quantity) {
        // Partial reduction
        await tx.posTabItem.update({
          where: { id: itemId },
          data: { quantity: tabItem.quantity - removeCount },
        });
      } else {
        // Complete removal
        await tx.posTabItem.delete({
          where: { id: itemId },
        });
      }
    });

    return NextResponse.json(apiSuccess({ message: 'Item updated and stock restored' }));
  } catch (error: unknown) {
    console.error('Error removing item from tab:', error);
    const message = error instanceof Error ? error.message : 'Failed to remove item from tab';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
