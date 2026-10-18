import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

// GET /api/payments/ewallet-info - Returns facility e-wallet QR code, account name, and number
export async function GET() {
  try {
    const settings = await prisma.facilitySetting.findMany({
      where: {
        key: {
          in: ['facility_name', 'ewallet_name', 'ewallet_number', 'ewallet_qr_url'],
        },
      },
    });

    const settingsMap = settings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {} as Record<string, string>);

    return NextResponse.json(
      apiSuccess({
        facilityName: settingsMap['facility_name'] || 'PicklePunto Sports Club',
        ewalletName: settingsMap['ewallet_name'] || 'PicklePunto Pay',
        ewalletNumber: settingsMap['ewallet_number'] || '+1 (555) 742-5537',
        ewalletQrUrl: settingsMap['ewallet_qr_url'] || '/qr-placeholder.png',
        instructions:
          'Please transfer your booking total to the e-wallet mobile number or scan the QR code above. Provide the transaction reference number to court staff to confirm your reservation.',
      })
    );
  } catch (error: unknown) {
    console.error('Error fetching e-wallet info:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch payment info';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
