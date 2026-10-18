import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

// GET /api/products - List products (filter ?category=RENTAL|RETAIL|FOOD_DRINK)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    const products = await prisma.product.findMany({
      where: category ? { category: category as any } : undefined,
      orderBy: { name: 'asc' },
    });

    const productsDto = products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price.toString(),
      stockQty: p.stockQty,
      lowStockThreshold: p.lowStockThreshold,
      sku: p.sku,
      createdAt: p.createdAt.toISOString(),
    }));

    return NextResponse.json(apiSuccess(productsDto));
  } catch (error: unknown) {
    console.error('Error fetching products:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch products';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// POST /api/products - Add product (admin)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, category, price, stockQty, lowStockThreshold, sku } = body;

    if (!name || !category || price === undefined) {
      return NextResponse.json(apiError('Missing required fields: name, category, price'), {
        status: 400,
      });
    }

    const product = await prisma.product.create({
      data: {
        name,
        category,
        price: parseFloat(price),
        stockQty: stockQty ? parseInt(stockQty, 10) : 0,
        lowStockThreshold: lowStockThreshold ? parseInt(lowStockThreshold, 10) : 5,
        sku: sku || null,
      },
    });

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
      }),
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating product:', error);
    const message = error instanceof Error ? error.message : 'Failed to create product';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
