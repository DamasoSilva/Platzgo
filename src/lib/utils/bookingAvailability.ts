import type { Prisma } from "@/generated/prisma/client";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";

const activePaymentStatuses = [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] as const;

export function buildActivePaymentWhere(now: Date): Prisma.PaymentWhereInput {
  return {
    status: { in: [...activePaymentStatuses] },
    OR: [{ expires_at: null }, { expires_at: { gt: now } }],
  };
}

export function buildBlockingBookingWhere(now: Date): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: BookingStatus.CONFIRMED },
      {
        status: BookingStatus.PENDING,
        payments: { none: { status: { in: [...activePaymentStatuses] } } },
      },
      {
        status: BookingStatus.PENDING,
        payments: { some: buildActivePaymentWhere(now) },
      },
    ],
  };
}
