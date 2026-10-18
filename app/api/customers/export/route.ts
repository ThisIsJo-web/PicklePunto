import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export const dynamic = 'force-dynamic';

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

// GET /api/customers/export - Export player directory to CSV
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      include: {
        bookingsAsLeader: {
          select: {
            status: true,
            totalAmount: true,
          },
        },
        posTabs: {
          select: {
            status: true,
            items: {
              select: {
                quantity: true,
                unitPrice: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'Customer ID',
      'Full Name',
      'Email Address',
      'Phone Number',
      'Role',
      'Member Since',
      'Total Bookings',
      'Confirmed Bookings',
      'Lifetime Spend (PHP)',
      'Staff Notes',
    ];

    const rows = users.map((u) => {
      const courtSpend = u.bookingsAsLeader
        .filter((b) => b.status === 'CONFIRMED')
        .reduce((sum, b) => sum + parseFloat(b.totalAmount.toString()), 0);

      const posSpend = u.posTabs
        .filter((t) => t.status === 'CLOSED')
        .reduce((tabSum, t) => {
          const itemsSum = t.items.reduce(
            (iSum, item) => iSum + item.quantity * parseFloat(item.unitPrice.toString()),
            0
          );
          return tabSum + itemsSum;
        }, 0);

      const totalSpend = (courtSpend + posSpend).toFixed(2);
      const totalBookings = u.bookingsAsLeader.length;
      const confirmedBookings = u.bookingsAsLeader.filter((b) => b.status === 'CONFIRMED').length;

      return [
        escapeCsvCell(u.id),
        escapeCsvCell(u.fullName),
        escapeCsvCell(u.email),
        escapeCsvCell(u.phone || 'N/A'),
        escapeCsvCell(u.role),
        escapeCsvCell(new Date(u.createdAt).toISOString().split('T')[0]),
        escapeCsvCell(totalBookings),
        escapeCsvCell(confirmedBookings),
        escapeCsvCell(totalSpend),
        escapeCsvCell(u.notes || ''),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const dateStr = new Date().toISOString().split('T')[0];

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="picklepunto_customers_${dateStr}.csv"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: unknown) {
    console.error('Error generating customers CSV export:', error);
    return new NextResponse('Internal Server Error generating CSV', { status: 500 });
  }
}
