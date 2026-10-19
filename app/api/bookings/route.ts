import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { apiSuccess, apiError } from '@/types';
import { parseISO, isBefore, isAfter, isEqual } from 'date-fns';

export const dynamic = 'force-dynamic';

// GET /api/bookings - List bookings (filters: date, court_id, status)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const courtId = searchParams.get('court_id');
    const status = searchParams.get('status');
    const userId = searchParams.get('userId') || searchParams.get('user_id');

    // ── Rule: Auto-void physical on-site no-shows (30-minute grace period from reservation start time) ──
    const now = new Date();
    const thirtyMinutesPastStart = new Date(now.getTime() - 30 * 60 * 1000);
    prisma.booking
      .updateMany({
        where: {
          status: { in: ['PENDING', 'AWAITING_PAYMENT'] },
          startTime: { lte: thirtyMinutesPastStart },
        },
        data: {
          status: 'NO_SHOW',
          notes: 'Voided: 30-minute physical on-site no-show grace period expired',
        },
      })
      .catch((e) => console.warn('Auto-void sweep error:', e));

    let dateFilter = {};
    let nextDateStr = '';
    if (dateParam) {
      // Operating day: dateParam 05:00 through next day 02:00 AM
      const localDayStart = new Date(`${dateParam}T00:00:00`);
      const localDayEnd = new Date(`${dateParam}T23:59:59.999`);
      const nextDate = new Date(localDayStart.getTime() + 24 * 3600 * 1000);
      nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

      const queryFrom = new Date(localDayStart.getTime() - 14 * 3600 * 1000);
      const queryTo = new Date(localDayEnd.getTime() + 28 * 3600 * 1000);
      dateFilter = {
        startTime: { gte: queryFrom, lte: queryTo },
      };
    }

    const rawBookings = await prisma.booking.findMany({
      where: {
        ...dateFilter,
        ...(courtId ? { courtId } : {}),
        ...(status ? { status: status as any } : {}),
        ...(userId
          ? {
              OR: [
                { leadBookerId: userId },
                { participants: { some: { userId } } },
              ],
            }
          : {}),
      },
      include: {
        court: { select: { id: true, name: true, surfaceType: true } },
        leadBooker: { select: { id: true, fullName: true, email: true, phone: true } },
        addons: { include: { product: true } },
        participants: { include: { user: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    // If dateParam was passed, filter bookings belonging to operating day:
    // dateParam (05:00 - 23:59) OR nextDateStr (00:00 - 04:59 late night)
    const bookings = dateParam
      ? rawBookings.filter((b) => {
          const d = new Date(b.startTime);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const bookingDateStr = `${y}-${m}-${day}`;
          const hours = d.getHours();

          if (bookingDateStr === dateParam) {
            return true;
          }
          if (bookingDateStr === nextDateStr && hours < 5) {
            return true;
          }
          return false;
        })
      : rawBookings;

    const bookingsDto = bookings.map((b) => {
      const isUnpaid = b.status === 'AWAITING_PAYMENT' || b.status === 'PENDING';
      const unpaidExpiresAt = isUnpaid
        ? new Date(new Date(b.createdAt).getTime() + 20 * 60 * 1000).toISOString()
        : null;

      return {
        id: b.id,
        courtId: b.courtId,
        courtName: b.court.name,
        surfaceType: b.court.surfaceType,
        leadBookerId: b.leadBookerId,
        isUsing: b.status === 'CONFIRMED' && new Date(b.startTime) <= now && new Date(b.endTime) >= now,
        unpaidExpiresAt,
        isWalkIn: b.isWalkIn,
        walkInGuestName: b.walkInGuestName,
        walkInGuestPhone: b.walkInGuestPhone,
        walkInGuestEmail: b.walkInGuestEmail,
        leadBookerName: (b.isWalkIn && b.walkInGuestName) ? b.walkInGuestName : b.leadBooker.fullName,
        leadBookerEmail: (b.isWalkIn && b.walkInGuestEmail) ? b.walkInGuestEmail : b.leadBooker.email,
        leadBookerPhone: (b.isWalkIn && b.walkInGuestPhone) ? b.walkInGuestPhone : b.leadBooker.phone,
        startTime: b.startTime.toISOString(),
        endTime: b.endTime.toISOString(),
        durationMinutes: b.durationMinutes,
        status: b.status,
        totalAmount: b.totalAmount.toString(),
        paymentConfirmedBy: b.paymentConfirmedBy,
        paymentConfirmedAt: b.paymentConfirmedAt?.toISOString() ?? null,
        notes: b.notes,
        createdAt: b.createdAt.toISOString(),
        addons: b.addons.map((a) => ({
          id: a.id,
          productId: a.productId,
          productName: a.product.name,
          quantity: a.quantity,
          unitPrice: a.unitPrice.toString(),
        })),
        participants: b.participants.map((p) => ({
          id: p.id,
          userId: p.userId,
          userName: p.user.fullName,
          userEmail: p.user.email,
          shareAmount: p.shareAmount.toString(),
          paymentStatus: p.paymentStatus,
        })),
      };
    });

    return NextResponse.json(apiSuccess(bookingsDto));
  } catch (error: unknown) {
    console.error('Error fetching bookings:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch bookings';
    return NextResponse.json(apiError(message), { status: 500 });
  }
}

// POST /api/bookings - Create booking (Phase 2: Add-ons, Duration 30/60/90, Split shares, E-wallet status)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      courtId,
      leadBookerId,
      walkInCustomer, // Optional { fullName: string, phone?: string, email?: string } for fast walk-in registration
      isWalkIn = false,
      startTime,
      durationMinutes,
      notes,
      addons = [], // Array of { productId: string, quantity: number }
      participantCount = 1, // Number of players splitting the cost
      initialStatus = 'AWAITING_PAYMENT', // 'AWAITING_PAYMENT' or 'CONFIRMED'
      paymentMethod, // 'CASH' or 'EWALLET'
      paymentReference,
      staffId,
    } = body;

    if (!courtId || (!leadBookerId && !walkInCustomer?.fullName) || !startTime || !durationMinutes) {
      return NextResponse.json(
        apiError('Missing required fields: courtId, leadBookerId or walkInCustomer, startTime, durationMinutes'),
        { status: 400 }
      );
    }

    const start = new Date(startTime);
    const duration = parseInt(durationMinutes, 10);
    const end = new Date(start.getTime() + duration * 60000);

    // ── Constraint Check ──
    if (isWalkIn) {
      // Walk-in is playing now or for current/upcoming slot: must not be completely in the past
      if (end.getTime() <= Date.now()) {
        return NextResponse.json(
          apiError('Cannot create a walk-in for a session that has already ended.'),
          { status: 400 }
        );
      }
    } else {
      // Advance reservation: must be in the future (with 1-minute drift tolerance)
      if (start.getTime() <= Date.now() - 60000) {
        return NextResponse.json(
          apiError('Cannot reserve a court in the past. Reservations must be scheduled in the future.'),
          { status: 400 }
        );
      }
    }

    // 1. Validate court exists and is active
    const court = await prisma.court.findUnique({
      where: { id: courtId },
    });

    if (!court || !court.isActive) {
      return NextResponse.json(apiError('Selected court is unavailable or inactive'), {
        status: 400,
      });
    }

    // 2. Resolve or quick-register lead booker
    let resolvedBookerId = leadBookerId;

    if (!resolvedBookerId && walkInCustomer?.fullName) {
      const walkInName = walkInCustomer.fullName.trim();
      const walkInPhone = walkInCustomer.phone?.trim() || null;
      const walkInEmail =
        walkInCustomer.email?.trim() ||
        `walkin.${Date.now()}.${Math.floor(Math.random() * 1000)}@picklepunto.local`;

      // Check if player already exists by email or phone
      let existingUser = null;
      if (walkInCustomer.email?.trim()) {
        existingUser = await prisma.user.findUnique({
          where: { email: walkInCustomer.email.trim() },
        });
      }
      if (!existingUser && walkInPhone) {
        existingUser = await prisma.user.findFirst({
          where: { phone: walkInPhone },
        });
      }

      if (!existingUser) {
        existingUser = await prisma.user.create({
          data: {
            fullName: walkInName,
            email: walkInEmail,
            phone: walkInPhone,
            role: 'PLAYER',
          },
        });
      }
      resolvedBookerId = existingUser.id;
    }

    const booker = await prisma.user.findUnique({
      where: { id: resolvedBookerId },
    });

    if (!booker) {
      return NextResponse.json(apiError('Lead booker account not found'), { status: 404 });
    }

    // 3. Perform atomic transaction: conflict check + stock deduction + booking creation
    const booking = await prisma.$transaction(async (tx) => {
      // Overlapping bookings check
      const overlappingBooking = await tx.booking.findFirst({
        where: {
          courtId,
          status: { in: ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED'] },
          OR: [
            {
              startTime: { lt: end },
              endTime: { gt: start },
            },
          ],
        },
      });

      if (overlappingBooking) {
        const conflictStart = new Date(overlappingBooking.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const conflictEnd = new Date(overlappingBooking.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        throw new Error(`This court slot conflicts with an existing reservation (${conflictStart} - ${conflictEnd}). Please select a shorter duration or another court.`);
      }

      // Overlapping blocks check
      const overlappingBlock = await tx.courtBlock.findFirst({
        where: {
          courtId,
          blockedFrom: { lt: end },
          blockedTo: { gt: start },
        },
      });

      if (overlappingBlock) {
        const blockReason = overlappingBlock.reason || 'Maintenance';
        const blockStart = new Date(overlappingBlock.blockedFrom).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const blockEnd = new Date(overlappingBlock.blockedTo).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        throw new Error(`This court is blocked (${blockStart} - ${blockEnd}): ${blockReason}. Please pick another time or court.`);
      }

      // Calculate court rental cost
      const hourlyRateNumber = Number(court.hourlyRate);
      const courtCost = (hourlyRateNumber * duration) / 60;

      // Calculate add-ons cost and validate inventory
      let addonsCost = 0;
      const validAddons: { productId: string; quantity: number; unitPrice: number }[] = [];

      for (const item of addons) {
        if (!item.productId || !item.quantity || item.quantity <= 0) continue;

        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        if (product.stockQty < item.quantity) {
          throw new Error(
            `Insufficient stock for ${product.name}. Requested: ${item.quantity}, Available: ${product.stockQty}`
          );
        }

        const unitPriceNum = Number(product.price);
        const itemTotal = unitPriceNum * item.quantity;
        addonsCost += itemTotal;

        validAddons.push({
          productId: product.id,
          quantity: item.quantity,
          unitPrice: unitPriceNum,
        });

        // Decrement product inventory
        await tx.product.update({
          where: { id: product.id },
          data: { stockQty: product.stockQty - item.quantity },
        });
      }

      const totalCalculatedAmount = courtCost + addonsCost;

      const isConfirmed = initialStatus === 'CONFIRMED';
      const formattedNotes = [
        isWalkIn ? '🚶 Walk-in Customer' : '',
        paymentMethod ? `Paid via ${paymentMethod}${paymentReference ? ` (${paymentReference})` : ''}` : '',
        notes || '',
      ].filter(Boolean).join(' | ');

      // Create Booking
      const createdBooking = await tx.booking.create({
        data: {
          courtId,
          leadBookerId: resolvedBookerId,
          startTime: start,
          endTime: end,
          durationMinutes: duration,
          status: isConfirmed ? 'CONFIRMED' : 'AWAITING_PAYMENT',
          paymentConfirmedAt: isConfirmed ? new Date() : null,
          paymentConfirmedBy: isConfirmed ? (staffId || null) : null,
          totalAmount: totalCalculatedAmount,
          isWalkIn: Boolean(isWalkIn),
          walkInGuestName: walkInCustomer?.fullName || null,
          walkInGuestPhone: walkInCustomer?.phone || null,
          walkInGuestEmail: walkInCustomer?.email || null,
          notes: formattedNotes || null,
        },
      });

      // Insert Transaction record if paid at counter
      if (isConfirmed && (paymentMethod === 'CASH' || paymentMethod === 'EWALLET')) {
        await tx.transaction.create({
          data: {
            bookingId: createdBooking.id,
            amount: totalCalculatedAmount,
            paymentMethod: paymentMethod === 'CASH' ? 'CASH' : 'EWALLET',
            paymentReference: paymentReference || (paymentMethod === 'CASH' ? 'Walk-in Cash Counter' : 'Walk-in E-Wallet Counter'),
          },
        });
      }

      // Insert Booking Add-ons
      for (const addon of validAddons) {
        await tx.bookingAddon.create({
          data: {
            bookingId: createdBooking.id,
            productId: addon.productId,
            quantity: addon.quantity,
            unitPrice: addon.unitPrice,
          },
        });
      }

      // Insert Participant Shares if split requested
      const splitPlayers = Math.max(1, parseInt(participantCount, 10) || 1);
      const shareAmount = parseFloat((totalCalculatedAmount / splitPlayers).toFixed(2));

      // Always create at least the lead booker participant share
      await tx.bookingParticipant.create({
        data: {
          bookingId: createdBooking.id,
          userId: resolvedBookerId,
          shareAmount,
          paymentStatus: isConfirmed ? 'PAID' : 'PENDING',
        },
      });

      return tx.booking.findUnique({
        where: { id: createdBooking.id },
        include: {
          court: { select: { name: true, surfaceType: true } },
          leadBooker: { select: { fullName: true, email: true } },
          addons: { include: { product: true } },
          participants: true,
        },
      });
    });

    if (booking?.leadBookerId) {
      await prisma.notificationLog.create({
        data: {
          userId: booking.leadBookerId,
          type: 'EMAIL',
          template: 'BOOKING_CONFIRMATION_SKELETON',
          status: 'QUEUED',
          payload: {
            bookingId: booking.id,
            courtName: booking.court.name,
            startTime: booking.startTime,
            totalAmount: booking.totalAmount.toString(),
            message: 'Email provider held pending selection. Logged for delivery.',
          },
        },
      }).catch((e) => console.warn('NotificationLog skipped:', e));
    }

    return NextResponse.json(apiSuccess(booking), { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating booking:', error);
    const message = error instanceof Error ? error.message : 'Failed to create booking';
    return NextResponse.json(apiError(message), { status: 400 });
  }
}
