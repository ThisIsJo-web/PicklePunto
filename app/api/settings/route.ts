import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

const DEFAULT_SETTINGS: Record<string, string> = {
  facility_name: 'PicklePunto Arena & Club',
  facility_address: '128 Padel & Pickleball Way, Metro Manila, Philippines',
  facility_contact_phone: '+63 917 888 7868',
  facility_contact_email: 'hello@picklepunto.ph',
  cancellation_grace_hours: '12',
  onsite_grace_period_mins: '30',
  court_count: '4',
  location_mode: 'SINGLE',
  default_opening_time: '06:00',
  default_closing_time: '22:00',
  gcash_account_name: 'PicklePunto Sports Hub Inc.',
  gcash_account_number: '0917-888-7868',
  maya_account_name: 'PicklePunto Arena',
  maya_account_number: '0918-999-7868',
};

// GET /api/settings - Fetch all facility configuration settings
export async function GET() {
  try {
    const settings = await prisma.facilitySetting.findMany();

    const settingsMap: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json(apiSuccess(settingsMap));
  } catch (error: unknown) {
    console.error('Error fetching facility settings:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch facility settings';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// PATCH /api/settings - Update facility settings
export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json(apiError('Invalid payload: expected settings object'), {
        status: 400,
      });
    }

    const updates = Object.entries(body);
    const updatedMap: Record<string, string> = {};

    for (const [key, value] of updates) {
      if (typeof key === 'string' && value !== undefined && value !== null) {
        const strVal = String(value);
        const record = await prisma.facilitySetting.upsert({
          where: { key },
          update: { value: strVal },
          create: { key, value: strVal },
        });
        updatedMap[record.key] = record.value;
      }
    }

    // Merge with current state
    const allSettings = await prisma.facilitySetting.findMany();
    const finalMap: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const s of allSettings) {
      finalMap[s.key] = s.value;
    }

    return NextResponse.json(
      apiSuccess({
        message: 'Facility settings updated successfully',
        settings: finalMap,
      })
    );
  } catch (error: unknown) {
    console.error('Error updating facility settings:', error);
    const message = error instanceof Error ? error.message : 'Failed to update facility settings';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
