import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

// POST /api/pos/checkout-direct - Quick on-the-spot counter sale
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      items = [], // [{ productId, quantity }]
      courtId,
      playerId,
      customerName,
      customerEmail,
      customerPhone,
      paymentMethod = 'CASH', // CASH | EWALLET
      paymentReference,
      cashTendered,
    } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(apiError('Cart is empty. Please add items before checkout.'), { status: 400 });
    }

    // Process all items, inventory checks, tab creation, and transaction in atomic tx
    const result = await prisma.$transaction(async (tx) => {
      // 1. Resolve or quick-register player if customer details passed
      let resolvedPlayerId = playerId || null;
      if (!resolvedPlayerId && customerName && customerName.trim()) {
        const cleanEmail = customerEmail?.trim() || `walkin.pos.${Date.now()}@picklepunto.local`;
        let user = await tx.user.findFirst({
          where: {
            OR: [
              { email: cleanEmail },
              ...(customerPhone ? [{ phone: customerPhone.trim() }] : []),
            ],
          },
        });

        if (!user) {
          user = await tx.user.create({
            data: {
              fullName: customerName.trim(),
              email: cleanEmail,
              phone: customerPhone?.trim() || null,
              role: 'PLAYER',
            },
          });
        }
        resolvedPlayerId = user.id;
      }

      // 2. Create tab marked as CLOSED immediately
      const tab = await tx.posTab.create({
        data: {
          courtId: courtId || null,
          playerId: resolvedPlayerId,
          status: 'CLOSED',
          closedAt: new Date(),
        },
      });

      // 3. Process each item & deduct stock
      let calculatedTotal = 0;
      const receiptItems = [];

      for (const cartItem of items) {
        const qty = parseInt(cartItem.quantity, 10);
        if (!cartItem.productId || isNaN(qty) || qty <= 0) continue;

        const product = await tx.product.findUnique({
          where: { id: cartItem.productId },
        });

        if (!product) {
          throw new Error(`Product not found: ${cartItem.productId}`);
        }

        if (product.stockQty < qty) {
          throw new Error(
            `Insufficient stock for "${product.name}". Available: ${product.stockQty}, Requested: ${qty}`
          );
        }

        // Deduct stock
        await tx.product.update({
          where: { id: product.id },
          data: { stockQty: product.stockQty - qty },
        });

        const unitPriceNum = Number(product.price);
        const lineTotal = unitPriceNum * qty;
        calculatedTotal += lineTotal;

        // Create tab item
        const tabItem = await tx.posTabItem.create({
          data: {
            tabId: tab.id,
            productId: product.id,
            quantity: qty,
            unitPrice: product.price,
          },
        });

        receiptItems.push({
          id: tabItem.id,
          name: product.name,
          category: product.category,
          sku: product.sku,
          quantity: qty,
          unitPrice: unitPriceNum.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
        });
      }

      if (receiptItems.length === 0) {
        throw new Error('No valid items found to checkout.');
      }

      // Validate cash tendered
      let changeDue = 0;
      if (paymentMethod === 'CASH') {
        const tendered = parseFloat(cashTendered);
        if (isNaN(tendered) || tendered < calculatedTotal) {
          throw new Error(
            `Cash tendered ($${tendered || 0}) is less than total due ($${calculatedTotal.toFixed(2)})`
          );
        }
        changeDue = parseFloat((tendered - calculatedTotal).toFixed(2));
      }

      // 4. Create Transaction
      const refNote =
        paymentMethod === 'CASH'
          ? `Cash Tendered $${parseFloat(cashTendered).toFixed(2)} (Change: $${changeDue.toFixed(2)})`
          : paymentReference || 'E-Wallet Transfer Verified at Counter';

      const transaction = await tx.transaction.create({
        data: {
          tabId: tab.id,
          amount: calculatedTotal,
          paymentMethod: paymentMethod === 'CASH' ? 'CASH' : 'EWALLET',
          paymentReference: refNote,
        },
      });

      // 5. Queue Notification Log for receipt
      const targetEmail = customerEmail || (resolvedPlayerId ? (await tx.user.findUnique({ where: { id: resolvedPlayerId } }))?.email : null);
      if (targetEmail && resolvedPlayerId) {
        await tx.notificationLog.create({
          data: {
            userId: resolvedPlayerId,
            type: 'EMAIL',
            template: 'pos_counter_receipt',
            status: 'QUEUED',
            payload: {
              email: targetEmail,
              transactionId: transaction.id,
              totalAmount: calculatedTotal.toFixed(2),
              items: receiptItems,
              paymentMethod,
              paymentReference: refNote,
              timestamp: new Date().toISOString(),
            },
          },
        });
      }

      let courtName = null;
      if (courtId) {
        const court = await tx.court.findUnique({ where: { id: courtId } });
        courtName = court?.name || null;
      }

      let bookerName = customerName || 'Walk-in Guest';
      if (resolvedPlayerId && !customerName) {
        const u = await tx.user.findUnique({ where: { id: resolvedPlayerId } });
        bookerName = u?.fullName || 'Walk-in Guest';
      }

      return {
        tab,
        transaction,
        receiptItems,
        totalAmount: calculatedTotal,
        changeDue,
        courtName,
        bookerName,
      };
    }, {
      maxWait: 10000,
      timeout: 15000,
    });

    const receipt = {
      receiptNumber: `RCP-${result.transaction.id.slice(0, 8).toUpperCase()}`,
      transactionId: result.transaction.id,
      tabId: result.tab.id,
      date: new Date().toISOString(),
      courtName: result.courtName,
      customerName: result.bookerName,
      customerEmail: customerEmail || null,
      customerPhone: customerPhone || null,
      items: result.receiptItems,
      totalAmount: result.totalAmount.toFixed(2),
      paymentMethod,
      cashTendered: paymentMethod === 'CASH' ? parseFloat(cashTendered).toFixed(2) : null,
      changeDue: paymentMethod === 'CASH' ? result.changeDue.toFixed(2) : null,
      paymentReference: result.transaction.paymentReference,
    };

    return NextResponse.json(
      apiSuccess({
        message: 'Direct checkout successful',
        transaction: result.transaction,
        receipt,
      }),
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error processing direct POS checkout:', error);
    const message = error instanceof Error ? error.message : 'Failed to process POS checkout';
    return NextResponse.json(apiError(message), { status: 400 });
  }
}
