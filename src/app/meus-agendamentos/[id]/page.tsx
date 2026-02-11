import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerHeader } from "@/components/CustomerHeader";
import { getCourtBookingsForDay } from "@/lib/actions/courts";
import { ThemedBackground } from "@/components/ThemedBackground";

import { BookingDetailClient } from "./BookingDetailClient";

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/meus-agendamentos/${id}`)}`);
  }

  if (session?.user?.role !== "CUSTOMER") {
    redirect("/");
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      start_time: true,
      end_time: true,
      total_price_cents: true,
      cancel_reason: true,
      cancel_fee_cents: true,
      customerId: true,
      court: {
        select: {
          id: true,
          name: true,
          sport_type: true,
          establishment: { select: { name: true, whatsapp_number: true } },
        },
      },
      rescheduledFrom: { select: { id: true } },
      rescheduledTo: { select: { id: true, status: true, start_time: true, end_time: true } },
    },
  });

  if (!booking || booking.customerId !== userId) {
    notFound();
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const initialDay = toYMD(tomorrow);

  const initial = await getCourtBookingsForDay({ courtId: booking.court.id, day: initialDay });

  const availabilityInitial = {
    day: initialDay,
    court: {
      price_per_hour: initial.court.price_per_hour,
      discount_percentage_over_90min: initial.court.discount_percentage_over_90min ?? null,
      establishment: {
        opening_time: initial.court.establishment.opening_time,
        closing_time: initial.court.establishment.closing_time,
        booking_buffer_minutes: initial.court.establishment.booking_buffer_minutes ?? null,
      },
    },
    bookings: initial.bookings,
    blocks: initial.blocks ?? [],
    monthlyPass: initial.monthlyPass,
    dayInfo: initial.dayInfo,
  };

  // Ao abrir o detalhe, marcar como lidas as notificações desse agendamento.
  await prisma.notification.updateMany({
    where: { userId, bookingId: booking.id, readAt: null, deletedAt: null },
    data: { readAt: new Date() },
  });

  const bookingNotifications = await prisma.notification.findMany({
    where: { userId, bookingId: booking.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      createdAt: true,
    },
  });

  return (
    <div className="ph-page">
      <ThemedBackground />
      <div className="relative z-10">
      <CustomerHeader
        variant="light"
        viewer={{
          isLoggedIn: true,
          name: session?.user?.name ?? null,
          image: session?.user?.image ?? null,
          role: session?.user?.role ?? null,
        }}
      />

      <div className="mx-auto max-w-4xl px-6 pb-10">
        <BookingDetailClient
          booking={{
            id: booking.id,
            status: booking.status,
            start_time: booking.start_time.toISOString(),
            end_time: booking.end_time.toISOString(),
            total_price_cents: booking.total_price_cents,
            cancel_reason: booking.cancel_reason,
            cancel_fee_cents: booking.cancel_fee_cents,
            notifications: bookingNotifications.map((n) => ({
              id: n.id,
              title: n.title,
              body: n.body,
              createdAt: n.createdAt.toISOString(),
            })),
            court: booking.court,
            availabilityInitial,
            rescheduledFrom: booking.rescheduledFrom,
            rescheduledTo: booking.rescheduledTo
              ? {
                  id: booking.rescheduledTo.id,
                  status: booking.rescheduledTo.status,
                  start_time: booking.rescheduledTo.start_time.toISOString(),
                  end_time: booking.rescheduledTo.end_time.toISOString(),
                }
              : null,
          }}
        />
      </div>
      </div>
    </div>
  );
}
