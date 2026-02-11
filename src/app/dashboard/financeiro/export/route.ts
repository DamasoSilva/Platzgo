import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/authz";

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmdToLocalMidnight(ymd: string | null): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function csvEscape(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export async function GET(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "SYSADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const url = new URL(request.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const courtIdParam = url.searchParams.get("courtId");

  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
  const rangeStart = parseYmdToLocalMidnight(startParam) ?? defaultStart;
  const endInput = parseYmdToLocalMidnight(endParam);
  let rangeEnd = endInput ? addDays(endInput, 1) : new Date(defaultStart.getFullYear(), defaultStart.getMonth() + 1, 1, 0, 0, 0, 0);
  if (rangeEnd <= rangeStart) rangeEnd = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 1, 0, 0, 0, 0);

  const establishment = await prisma.establishment.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });

  if (!establishment) {
    return NextResponse.json({ error: "Estabelecimento não encontrado" }, { status: 404 });
  }

  const courts = await prisma.court.findMany({
    where: { establishmentId: establishment.id },
    select: { id: true, name: true },
  });

  const selectedCourtId = courtIdParam && courts.some((c) => c.id === courtIdParam) ? courtIdParam : "all";
  const filterCourtIds = selectedCourtId === "all" ? courts.map((c) => c.id) : [selectedCourtId];

  const bookings = await prisma.booking.findMany({
    where: {
      courtId: { in: filterCourtIds },
      start_time: { gte: rangeStart, lt: rangeEnd },
    },
    orderBy: { start_time: "asc" },
    select: {
      start_time: true,
      end_time: true,
      status: true,
      total_price_cents: true,
      cancel_fee_cents: true,
      customer: { select: { name: true, email: true } },
      customer_name: true,
      customer_email: true,
      court: { select: { name: true } },
    },
  });

  const header = [
    "data",
    "inicio",
    "fim",
    "quadra",
    "cliente",
    "email",
    "status",
    "total_cents",
    "cancel_fee_cents",
  ];

  const rows = bookings.map((b) => {
    const start = b.start_time;
    const end = b.end_time;
    const customerName = b.customer?.name ?? b.customer_name ?? "";
    const customerEmail = b.customer?.email ?? b.customer_email ?? "";
    const dateStr = toYMD(start);
    const startTime = start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const endTime = end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    return [
      dateStr,
      startTime,
      endTime,
      b.court.name,
      customerName,
      customerEmail,
      b.status,
      b.total_price_cents ?? 0,
      b.cancel_fee_cents ?? 0,
    ].map(csvEscape).join(",");
  });

  const csv = [header.join(","), ...rows].join("\n");
  const filename = `financeiro_${toYMD(rangeStart)}_${toYMD(addDays(rangeEnd, -1))}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
