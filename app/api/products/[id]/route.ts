import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/products/[id] - Fetch single product
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const product = await prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      return NextResponse.json(apiError('Product not found'), { status: 404 });
    }

    return NextResponse.json(
      apiSuccess({
        id: product.id,
        name: product.name,
        category: product.category,
        price: product.price.toString(),
        stockQty: product.stockQty,
        lowStockThreshold: product.lowStockThreshold,
        sku: product.sku,
        createdAt: product.createdAt.toISOString(),
      })
    );
  } catch (error: unknown) {
    console.error('Error fetching product:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch product';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// PATCH /api/products/[id] - Update product details
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, category, price, stockQty, lowStockThreshold, sku } = body;

    const existing = await prisma.product.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(apiError('Product not found'), { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (category !== undefined) data.category = category;
    if (price !== undefined) data.price = parseFloat(price);
    if (stockQty !== undefined) data.stockQty = Math.max(0, parseInt(stockQty, 10));
    if (lowStockThreshold !== undefined)
      data.lowStockThreshold = Math.max(0, parseInt(lowStockThreshold, 10));
    if (sku !== undefined) data.sku = sku || null;

    const updated = await prisma.product.update({
      where: { id },
      data,
    });

    return NextResponse.json(
      apiSuccess({
        id: updated.id,
        name: updated.name,
        category: updated.category,
        price: updated.price.toString(),
        stockQty: updated.stockQty,
        lowStockThreshold: updated.lowStockThreshold,
        sku: updated.sku,
        createdAt: updated.createdAt.toISOString(),
      })
    );
  } catch (error: unknown) {
    console.error('Error updating product:', error);
    const message = error instanceof Error ? error.message : 'Failed to update product';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// DELETE /api/products/[id] - Delete a product
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const existing = await prisma.product.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            bookingAddons: true,
            posTabItems: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(apiError('Product not found'), { status: 404 });
    }

    if (existing._count.bookingAddons > 0 || existing._count.posTabItems > 0) {
      return NextResponse.json(
        apiError(
          `Cannot delete product '${existing.name}' because it has existing booking add-ons (${existing._count.bookingAddons}) or POS orders (${existing._count.posTabItems}).`
        ),
        { status: 400 }
      );
    }

    await prisma.product.delete({
      where: { id },
    });

    return NextResponse.json(
      apiSuccess({
        deleted: true,
        id,
        name: existing.name,
      })
    );
  } catch (error: unknown) {
    console.error('Error deleting product:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete product';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
