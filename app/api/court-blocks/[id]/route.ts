import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';

interface RouteParams {
  params: { id: string };
}

// DELETE /api/court-blocks/:id - Delete a court block (unblock court)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const existing = await prisma.courtBlock.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json(apiError('Court block not found'), { status: 404 });
    }

    await prisma.courtBlock.delete({
      where: { id: params.id },
    });

    return NextResponse.json(apiSuccess({ id: params.id, message: 'Court block removed successfully' }));
  } catch (error: unknown) {
    console.error('Error removing court block:', error);
    const message = error instanceof Error ? error.message : 'Failed to remove court block';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}
