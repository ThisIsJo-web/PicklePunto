import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/products/[id]/stock - Adjust stock (+ / - with audit reason)
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { delta, newQty, reason } = body;

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json(
        apiError('Audit reason is required for stock adjustments (e.g. RESTOCK, DAMAGE, AUDIT, RETURN)'),
        { status: 400 }
      );
    }

    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return NextResponse.json(apiError('Product not found'), { status: 404 });
    }

    let calculatedQty = product.stockQty;

    if (delta !== undefined) {
      const deltaNum = parseInt(delta, 10);
      if (isNaN(deltaNum)) {
        return NextResponse.json(apiError('Invalid delta value'), { status: 400 });
      }
      calculatedQty = product.stockQty + deltaNum;
    } else if (newQty !== undefined) {
      const targetQty = parseInt(newQty, 10);
      if (isNaN(targetQty) || targetQty < 0) {
        return NextResponse.json(apiError('New quantity must be a non-negative number'), {
          status: 400,
        });
      }
      calculatedQty = targetQty;
    } else {
      return NextResponse.json(
        apiError('Either delta (relative change) or newQty (absolute count) must be provided'),
        { status: 400 }
      );
    }

    if (calculatedQty < 0) {
      return NextResponse.json(
        apiError(`Adjustment would result in negative stock (${calculatedQty}). Current stock is ${product.stockQty}.`),
        { status: 400 }
      );
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        stockQty: calculatedQty,
      },
    });

    return NextResponse.json(
      apiSuccess({
        productId: updated.id,
        name: updated.name,
        previousStock: product.stockQty,
        newStock: updated.stockQty,
        change: updated.stockQty - product.stockQty,
        reason: reason.trim(),
        adjustedAt: new Date().toISOString(),
        isLowStock: updated.stockQty <= updated.lowStockThreshold,
        lowStockThreshold: updated.lowStockThreshold,
      })
    );
  } catch (error: unknown) {
    console.error('Error adjusting stock:', error);
    const message = error instanceof Error ? error.message : 'Failed to adjust stock';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
