import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

// POST /api/pos/tabs/[id]/items - Add item to tab
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id: tabId } = params;
    const body = await request.json();
    const { productId, quantity = 1 } = body;

    const qty = parseInt(quantity, 10);
    if (!productId || isNaN(qty) || qty <= 0) {
      return NextResponse.json(apiError('Valid productId and quantity (> 0) required'), { status: 400 });
    }

    const tab = await prisma.posTab.findUnique({
      where: { id: tabId },
    });

    if (!tab) {
      return NextResponse.json(apiError('POS Tab not found'), { status: 404 });
    }

    if (tab.status === 'CLOSED') {
      return NextResponse.json(apiError('Cannot add items to a closed tab'), { status: 400 });
    }

    const updatedTabItem = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      if (product.stockQty < qty) {
        throw new Error(
          `Insufficient stock for "${product.name}". Available: ${product.stockQty}, Requested: ${qty}`
        );
      }

      // Decrement product inventory
      await tx.product.update({
        where: { id: product.id },
        data: { stockQty: product.stockQty - qty },
      });

      // Check if item already exists in this tab
      const existingItem = await tx.posTabItem.findFirst({
        where: { tabId, productId },
      });

      if (existingItem) {
        return await tx.posTabItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: existingItem.quantity + qty,
            unitPrice: product.price, // update to current price
          },
        });
      } else {
        return await tx.posTabItem.create({
          data: {
            tabId,
            productId,
            quantity: qty,
            unitPrice: product.price,
          },
        });
      }
    });

    return NextResponse.json(apiSuccess(updatedTabItem), { status: 201 });
  } catch (error: unknown) {
    console.error('Error adding item to tab:', error);
    const message = error instanceof Error ? error.message : 'Failed to add item to tab';
    return NextResponse.json(apiError(message), { status: 400 });
  }
}
