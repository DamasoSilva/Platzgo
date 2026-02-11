import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdminWithSetupOrRedirect } from "@/lib/authz";

import { AgendaWeekView } from "./ui";

function parseYmdToLocalMidnight(ymd: string): Date | null {
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(ymd);
  if (!m) return null;
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(y, (mo || 1) - 1, d || 1, 0, 0, 0, 0);
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getSundayLocal(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const day = d.getDay();
  const diff = day; // 0->0 (Dom), 1->1 (Seg), ...
  d.setDate(d.getDate() - diff);
  return d;
}

export default async function DashboardAgendaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const courtIdParam = typeof sp.courtId === "string" ? sp.courtId : undefined;
  const weekParam = typeof sp.week === "string" ? sp.week : undefined;
  const focusBookingId = typeof sp.focusBookingId === "string" ? sp.focusBookingId : undefined;

  const { establishmentId } = await requireAdminWithSetupOrRedirect("/dashboard/agenda");

  const establishment = await prisma.establishment.findUnique({
    where: { id: establishmentId },
    select: {
      id: true,
      open_weekdays: true,
      opening_time: true,
      closing_time: true,
      courts: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  if (!establishment) {
    redirect("/dashboard/admin?setup=1");
  }

  const courts = establishment.courts;
  if (!courts.length) {
    redirect("/dashboard/quadras?setup=court&callbackUrl=%2Fdashboard%2Fagenda");
  }
  const selectedCourtIdRaw =
    courtIdParam === "all"
      ? "all"
      : (courtIdParam && courts.some((c) => c.id === courtIdParam) ? courtIdParam : undefined) ?? courts[0]?.id;

  if (!selectedCourtIdRaw) {
    redirect("/dashboard/quadras?setup=court&callbackUrl=%2Fdashboard%2Fagenda");
  }

  const selectedCourtId = selectedCourtIdRaw;
  const courtIds = courts.map((c) => c.id);
  const filterCourtIds = selectedCourtId === "all" ? courtIds : [selectedCourtId];

  const weekStart = weekParam ? parseYmdToLocalMidnight(weekParam) : null;
  const sunday = weekStart ? getSundayLocal(weekStart) : getSundayLocal(new Date());
  const rangeStart = new Date(sunday);
  const rangeEnd = new Date(sunday);
  rangeEnd.setDate(rangeEnd.getDate() + 7); // até o próximo domingo 00:00 (cobre Dom–Sáb)

  const [bookings, blocks] = await Promise.all([
    prisma.booking.findMany({
      where: {
        courtId: { in: filterCourtIds },
        start_time: { lt: rangeEnd },
        end_time: { gt: rangeStart },
        status: { not: "CANCELLED" },
      },
      orderBy: [{ courtId: "asc" }, { start_time: "asc" }],
      select: {
        id: true,
        start_time: true,
        end_time: true,
        status: true,
        rescheduledFromId: true,
        createdAt: true,
        court: { select: { id: true, name: true } },
        customer: { select: { name: true, email: true } },
        customer_name: true,
        customer_email: true,
        customer_phone: true,
      },
    }),
    prisma.courtBlock.findMany({
      where: {
        courtId: { in: filterCourtIds },
        start_time: { lt: rangeEnd },
        end_time: { gt: rangeStart },
      },
      orderBy: [{ courtId: "asc" }, { start_time: "asc" }],
      select: {
        id: true,
        start_time: true,
        end_time: true,
        note: true,
        court: { select: { id: true, name: true } },
      },
    }),
  ]);

  const monthlyPasses = await prisma.monthlyPass.findMany({
    where: {
      courtId: { in: filterCourtIds },
      status: "PENDING",
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      month: true,
      weekday: true,
      start_time: true,
      end_time: true,
      status: true,
      price_cents: true,
      terms_snapshot: true,
      createdAt: true,
      court: { select: { id: true, name: true } },
      customer: { select: { name: true, email: true } },
    },
  });

  return (
    <AgendaWeekView
      data={{
        establishment: {
          id: establishment.id,
          open_weekdays: establishment.open_weekdays,
          opening_time: establishment.opening_time,
          closing_time: establishment.closing_time,
        },
        courts,
        selectedCourtId,
        weekStart: toYMD(sunday),
        bookings: bookings.map((b) => ({
          id: b.id,
          start_time: b.start_time.toISOString(),
          end_time: b.end_time.toISOString(),
          status: b.status,
          rescheduledFromId: b.rescheduledFromId,
          createdAt: b.createdAt.toISOString(),
          court: b.court,
          customer: b.customer,
          customer_name: b.customer_name,
          customer_email: b.customer_email,
          customer_phone: b.customer_phone,
        })),
        blocks: blocks.map((b) => ({
          id: b.id,
          start_time: b.start_time.toISOString(),
          end_time: b.end_time.toISOString(),
          note: b.note,
          court: b.court,
        })),
        monthlyPasses: monthlyPasses.map((p) => ({
          id: p.id,
          month: p.month,
          weekday: p.weekday,
          start_time: p.start_time,
          end_time: p.end_time,
          status: p.status,
          price_cents: p.price_cents,
          terms_snapshot: p.terms_snapshot,
          createdAt: p.createdAt.toISOString(),
          court: p.court,
          customer: p.customer,
        })),
        focusBookingId: focusBookingId ?? null,
      }}
    />
  );
}
