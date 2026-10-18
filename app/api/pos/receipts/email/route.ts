import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

// POST /api/pos/receipts/email - Send or resend digital receipt via email skeleton
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, receipt } = body;

    if (!email || !receipt) {
      return NextResponse.json(apiError('Email and receipt details are required'), { status: 400 });
    }

    // Lookup user by email to associate notification log
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Find staff or admin
      user = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    }

    if (!user) {
      return NextResponse.json(apiError('Could not associate user for notification log'), { status: 400 });
    }

    const log = await prisma.notificationLog.create({
      data: {
        userId: user.id,
        type: 'EMAIL',
        template: 'pos_digital_receipt',
        status: 'QUEUED', // ready for provider pickup (e.g. Postmark / Resend)
        payload: {
          recipientEmail: email,
          receiptNumber: receipt.receiptNumber,
          totalAmount: receipt.totalAmount,
          items: receipt.items,
          paymentMethod: receipt.paymentMethod,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json(
      apiSuccess({
        message: `Digital receipt queued for delivery to ${email}`,
        logId: log.id,
      })
    );
  } catch (error: unknown) {
    console.error('Error queuing receipt email:', error);
    const message = error instanceof Error ? error.message : 'Failed to queue receipt email';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
