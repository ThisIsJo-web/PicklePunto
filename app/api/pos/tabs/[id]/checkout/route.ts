import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { id: string };
}

// POST /api/pos/tabs/[id]/checkout - Close tab + create transaction + issue receipt
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id: tabId } = params;
    const body = await request.json();
    const {
      paymentMethod = 'CASH', // CASH | EWALLET
      paymentReference,
      cashTendered,
      receiptEmail,
    } = body;

    const tab = await prisma.posTab.findUnique({
      where: { id: tabId },
      include: {
        court: true,
        player: true,
        items: {
          include: { product: true },
        },
      },
    });

    if (!tab) {
      return NextResponse.json(apiError('POS Tab not found'), { status: 404 });
    }

    if (tab.status === 'CLOSED') {
      return NextResponse.json(apiError('This tab is already closed and paid'), { status: 400 });
    }

    if (tab.items.length === 0) {
      return NextResponse.json(apiError('Cannot checkout an empty tab'), { status: 400 });
    }

    // Calculate total amount
    let totalAmount = 0;
    const receiptItems = tab.items.map((item) => {
      const unitPrice = Number(item.unitPrice);
      const lineTotal = unitPrice * item.quantity;
      totalAmount += lineTotal;

      return {
        id: item.id,
        name: item.product.name,
        category: item.product.category,
        sku: item.product.sku,
        quantity: item.quantity,
        unitPrice: unitPrice.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
      };
    });

    // Validate cash tendered
    let changeDue = 0;
    if (paymentMethod === 'CASH') {
      const tendered = parseFloat(cashTendered);
      if (isNaN(tendered) || tendered < totalAmount) {
        return NextResponse.json(
          apiError(`Cash tendered ($${tendered || 0}) is less than total due ($${totalAmount.toFixed(2)})`),
          { status: 400 }
        );
      }
      changeDue = parseFloat((tendered - totalAmount).toFixed(2));
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Close tab
      const updatedTab = await tx.posTab.update({
        where: { id: tabId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
        },
      });

      // 2. Create Transaction
      const refNote =
        paymentMethod === 'CASH'
          ? `Cash Tendered $${parseFloat(cashTendered).toFixed(2)} (Change: $${changeDue.toFixed(2)})`
          : paymentReference || 'E-Wallet Transfer Verified';

      const transaction = await tx.transaction.create({
        data: {
          tabId: updatedTab.id,
          amount: totalAmount,
          paymentMethod: paymentMethod === 'CASH' ? 'CASH' : 'EWALLET',
          paymentReference: refNote,
        },
      });

      // 3. Queue Email Receipt in notification_log (Skeleton ready for provider)
      const targetEmail = receiptEmail || tab.player?.email;
      let notificationLogId = null;

      if (targetEmail && tab.playerId) {
        const notif = await tx.notificationLog.create({
          data: {
            userId: tab.playerId,
            type: 'EMAIL',
            template: 'pos_counter_receipt',
            status: 'QUEUED',
            payload: {
              email: targetEmail,
              transactionId: transaction.id,
              tabId: updatedTab.id,
              totalAmount: totalAmount.toFixed(2),
              items: receiptItems,
              paymentMethod,
              paymentReference: refNote,
              timestamp: new Date().toISOString(),
            },
          },
        });
        notificationLogId = notif.id;
      }

      return {
        tab: updatedTab,
        transaction,
        changeDue,
        notificationLogId,
      };
    });

    const receipt = {
      receiptNumber: `RCP-${result.transaction.id.slice(0, 8).toUpperCase()}`,
      transactionId: result.transaction.id,
      tabId: tab.id,
      date: new Date().toISOString(),
      courtName: tab.court?.name || null,
      customerName: tab.player?.fullName || 'Walk-in Guest',
      customerEmail: receiptEmail || tab.player?.email || null,
      customerPhone: tab.player?.phone || null,
      items: receiptItems,
      totalAmount: totalAmount.toFixed(2),
      paymentMethod,
      cashTendered: paymentMethod === 'CASH' ? parseFloat(cashTendered).toFixed(2) : null,
      changeDue: paymentMethod === 'CASH' ? result.changeDue.toFixed(2) : null,
      paymentReference: result.transaction.paymentReference,
    };

    return NextResponse.json(
      apiSuccess({
        message: 'Tab closed successfully',
        transaction: result.transaction,
        receipt,
      })
    );
  } catch (error: unknown) {
    console.error('Error checking out POS tab:', error);
    const message = error instanceof Error ? error.message : 'Failed to checkout POS tab';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
