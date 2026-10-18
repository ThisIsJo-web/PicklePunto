import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

export const dynamic = 'force-dynamic';

// GET /api/users - List registered users (optional filter ?role=PLAYER|STAFF|ADMIN, ?search=)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roleParam = searchParams.get('role');
    const searchParam = searchParams.get('search');

    const users = await prisma.user.findMany({
      where: {
        ...(roleParam ? { role: roleParam as any } : {}),
        ...(searchParam
          ? {
              OR: [
                { fullName: { contains: searchParam, mode: 'insensitive' } },
                { email: { contains: searchParam, mode: 'insensitive' } },
                { phone: { contains: searchParam, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
      orderBy: { fullName: 'asc' },
    });

    const usersDto = users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    }));

    return NextResponse.json(apiSuccess(usersDto));
  } catch (error: unknown) {
    console.error('Error fetching users:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch users';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
