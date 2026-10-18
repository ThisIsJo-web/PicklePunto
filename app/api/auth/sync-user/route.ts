import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, email, fullName, phone, role } = body;

    if (!id || !email || !fullName) {
      return NextResponse.json(apiError('Missing required fields (id, email, fullName)'), {
        status: 400,
      });
    }

    const user = await prisma.user.upsert({
      where: { id },
      update: {
        email,
        fullName,
        phone: phone || null,
      },
      create: {
        id,
        email,
        fullName,
        phone: phone || null,
        role: role === 'ADMIN' ? 'ADMIN' : role === 'STAFF' ? 'STAFF' : 'PLAYER',
      },
    });

    return NextResponse.json(apiSuccess(user));
  } catch (error: unknown) {
    console.error('Error syncing user:', error);
    const message = error instanceof Error ? error.message : 'Failed to sync user';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
