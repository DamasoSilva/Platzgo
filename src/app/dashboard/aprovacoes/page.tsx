import Link from "next/link";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdminWithSetupOrRedirect } from "@/lib/authz";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { confirmBookingAsOwner, cancelBookingAsOwner } from "@/lib/actions/bookings";
import { confirmMonthlyPassAsOwner, cancelMonthlyPassAsOwner } from "@/lib/actions/monthlyPasses";
import { BookingStatus, MonthlyPassStatus } from "@/generated/prisma/enums";

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHHMM(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function parseYmdStart(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function asSingle(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function isBookingStatus(v: string): v is BookingStatus {
  return (Object.values(BookingStatus) as string[]).includes(v);
}

function isMonthlyPassStatus(v: string): v is MonthlyPassStatus {
  return (Object.values(MonthlyPassStatus) as string[]).includes(v);
}

type Kind = "all" | "booking" | "monthly";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};

  const { establishmentId } = await requireAdminWithSetupOrRedirect("/dashboard/aprovacoes");

  const courts = await prisma.court.findMany({
    where: { establishmentId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const kindParam = asSingle(sp.kind) ?? "all";
  const kind = kindParam as Kind;
  const courtIdParam = asSingle(sp.courtId) ?? "";
  const selectedCourtId = courtIdParam && courts.some((c) => c.id === courtIdParam) ? courtIdParam : "";

  const bookingStatusParam = asSingle(sp.bookingStatus) ?? "PENDING";
  const passStatusParam = asSingle(sp.passStatus) ?? "PENDING";

  const bookingStatus = bookingStatusParam === "all" ? undefined : isBookingStatus(bookingStatusParam) ? bookingStatusParam : "PENDING";
  const passStatus = passStatusParam === "all" ? undefined : isMonthlyPassStatus(passStatusParam) ? passStatusParam : "PENDING";

  const from = (asSingle(sp.from) ?? "").trim();
  const to = (asSingle(sp.to) ?? "").trim();
  const q = (asSingle(sp.q) ?? "").trim();

  const takeRaw = asSingle(sp.take) ?? "50";
  const take = Math.min(200, Math.max(20, Number.parseInt(takeRaw, 10) || 50));

  const fromDate = from ? parseYmdStart(from) : null;
  const toDate = to ? parseYmdStart(to) : null;

  const bookingDateWhere: { gte?: Date; lt?: Date } = {};
  if (fromDate) bookingDateWhere.gte = fromDate;
  if (toDate) bookingDateWhere.lt = addDays(toDate, 1);

  const passCreatedWhere: { gte?: Date; lt?: Date } = {};
  if (fromDate) passCreatedWhere.gte = fromDate;
  if (toDate) passCreatedWhere.lt = addDays(toDate, 1);

  const courtIds = selectedCourtId ? [selectedCourtId] : courts.map((c) => c.id);

  const [bookings, passes] = await Promise.all([
    kind === "monthly"
      ? Promise.resolve([])
      : prisma.booking.findMany({
          where: {
            courtId: { in: courtIds },
            ...(bookingStatus ? { status: bookingStatus } : {}),
            ...(Object.keys(bookingDateWhere).length ? { start_time: bookingDateWhere } : {}),
            ...(q
              ? {
                  OR: [
                    { customer_name: { contains: q, mode: "insensitive" } },
                    { customer_email: { contains: q, mode: "insensitive" } },
                    { customer_phone: { contains: q, mode: "insensitive" } },
                    { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
                    { customer: { is: { email: { contains: q, mode: "insensitive" } } } },
                    { court: { is: { name: { contains: q, mode: "insensitive" } } } },
                  ],
                }
              : {}),
          },
          orderBy: [{ start_time: "asc" }],
          take,
          select: {
            id: true,
            status: true,
            createdAt: true,
            start_time: true,
            end_time: true,
            total_price_cents: true,
            customer_name: true,
            customer_email: true,
            customer_phone: true,
            customer: { select: { name: true, email: true } },
            court: { select: { id: true, name: true } },
          },
        }),

    kind === "booking"
      ? Promise.resolve([])
      : prisma.monthlyPass.findMany({
          where: {
            courtId: { in: courtIds },
            ...(passStatus ? { status: passStatus } : {}),
            ...(Object.keys(passCreatedWhere).length ? { createdAt: passCreatedWhere } : {}),
            ...(q
              ? {
                  OR: [
                    { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
                    { customer: { is: { email: { contains: q, mode: "insensitive" } } } },
                    { court: { is: { name: { contains: q, mode: "insensitive" } } } },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: "desc" }],
          take,
          select: {
            id: true,
            status: true,
            month: true,
            weekday: true,
            start_time: true,
            end_time: true,
            createdAt: true,
            price_cents: true,
            customer: { select: { name: true, email: true } },
            court: { select: { id: true, name: true } },
          },
        }),
  ]);

  const total = bookings.length + passes.length;

  return (
    <div className="space-y-6">
      <div className="ph-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Aprovações</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Agendamentos e mensalidades aguardando ação.</p>
          </div>

          <Link href="/dashboard" className="ph-button-secondary">
            Voltar
          </Link>
        </div>

        <form method="get" className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Tipo</label>
              <select
                name="kind"
                defaultValue={kindParam}
                className="mt-1 h-10 rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="all">Tudo</option>
                <option value="booking">Agendamentos</option>
                <option value="monthly">Mensalidades</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Quadra</label>
              <select
                name="courtId"
                defaultValue={courtIdParam}
                className="mt-1 h-10 rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="">Todas</option>
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Status (agend.)</label>
              <select
                name="bookingStatus"
                defaultValue={bookingStatusParam}
                className="mt-1 h-10 rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="PENDING">Pendente</option>
                <option value="CONFIRMED">Confirmado</option>
                <option value="CANCELLED">Cancelado</option>
                <option value="all">Todos</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Status (mens.)</label>
              <select
                name="passStatus"
                defaultValue={passStatusParam}
                className="mt-1 h-10 rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="PENDING">Pendente</option>
                <option value="ACTIVE">Ativa</option>
                <option value="CANCELLED">Cancelada</option>
                <option value="all">Todos</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">De</label>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="mt-1 h-10 rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Até</label>
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="mt-1 h-10 rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div className="min-w-[240px] flex-1">
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Busca</label>
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Nome, e-mail, quadra..."
                className="mt-1 h-10 w-full rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Limite</label>
              <select
                name="take"
                defaultValue={String(take)}
                className="mt-1 h-10 rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </div>

            <button type="submit" className="ph-button">
              Aplicar
            </button>
            <Link href="/dashboard/aprovacoes" className="ph-button-secondary">
              Limpar
            </Link>
          </div>
        </form>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          Mostrando <span className="font-semibold">{total}</span> item(ns).
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="ph-card p-6 border border-[#CCFF00]/25">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Agendamentos</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Solicitações de agendamento.</p>

            <div className="mt-4 space-y-3">
              {bookings.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum agendamento para os filtros atuais.</p>
              ) : (
                bookings.map((b) => {
                  const customerName = b.customer?.name ?? b.customer_name ?? "Cliente";
                  const customerEmail = b.customer?.email ?? b.customer_email ?? "";
                  const customerPhone = b.customer_phone ?? "";
                  const isPending = b.status === "PENDING";

                  return (
                    <div
                      key={b.id}
                      className={
                        "rounded-2xl border p-4 " +
                        (isPending
                          ? "border-[#CCFF00]/40 bg-[#CCFF00]/10 dark:border-[#CCFF00]/40 dark:bg-[#CCFF00]/10"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950")
                      }
                    >
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{b.court.name}</p>
                      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                        {toYMD(b.start_time)} • {formatHHMM(b.start_time)}–{formatHHMM(b.end_time)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {customerName}
                        {customerEmail ? ` • ${customerEmail}` : ""}
                        {customerPhone ? ` • ${customerPhone}` : ""}
                      </p>
                      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">Valor: {formatBRLFromCents(b.total_price_cents ?? 0)}</p>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-500">Criado em: {toYMD(b.createdAt)}</p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Link
                          href={(() => {
                            const base = new Date(b.start_time.getFullYear(), b.start_time.getMonth(), b.start_time.getDate());
                            const sunday = new Date(base);
                            sunday.setDate(base.getDate() - base.getDay());
                            const week = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, "0")}-${String(sunday.getDate()).padStart(2, "0")}`;
                            const params = new URLSearchParams({
                              courtId: b.court.id,
                              week,
                              focusBookingId: b.id,
                            });
                            return `/dashboard/agenda?${params.toString()}`;
                          })()}
                          className="ph-button-secondary"
                        >
                          Ver na agenda
                        </Link>

                        {isPending ? (
                          <>
                            <form
                              action={async () => {
                                "use server";
                                await confirmBookingAsOwner({ bookingId: b.id });
                                revalidatePath("/dashboard/aprovacoes");
                                revalidatePath("/dashboard");
                              }}
                            >
                              <button type="submit" className="ph-button">
                                Confirmar
                              </button>
                            </form>

                            <form
                              action={async () => {
                                "use server";
                                await cancelBookingAsOwner({ bookingId: b.id });
                                revalidatePath("/dashboard/aprovacoes");
                                revalidatePath("/dashboard");
                              }}
                            >
                              <button type="submit" className="ph-button-secondary">
                                Cancelar
                              </button>
                            </form>
                          </>
                        ) : null}

                        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                          Status: {b.status === "PENDING" ? "Pendente" : b.status === "CONFIRMED" ? "Confirmado" : "Cancelado"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="ph-card p-6 border border-[#CCFF00]/25">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Mensalidades</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Solicitações de mensalidade.</p>

            <div className="mt-4 space-y-3">
              {passes.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma mensalidade para os filtros atuais.</p>
              ) : (
                passes.map((p) => {
                  const isPending = p.status === "PENDING";
                  return (
                    <div
                      key={p.id}
                      className={
                        "rounded-2xl border p-4 " +
                        (isPending
                          ? "border-[#CCFF00]/40 bg-[#CCFF00]/10 dark:border-[#CCFF00]/40 dark:bg-[#CCFF00]/10"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950")
                      }
                    >
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{p.court.name}</p>
                      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                        {p.month} • {formatBRLFromCents(p.price_cents)}
                      </p>
                      {typeof p.weekday === "number" && p.start_time && p.end_time ? (
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {"Dom Seg Ter Qua Qui Sex Sáb".split(" ")[p.weekday]} • {p.start_time}–{p.end_time}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {p.customer?.name ?? "Cliente"} • {p.customer?.email ?? ""}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-500">Criado em: {toYMD(p.createdAt)}</p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {isPending ? (
                          <>
                            <form
                              action={async () => {
                                "use server";
                                await confirmMonthlyPassAsOwner({ passId: p.id });
                                revalidatePath("/dashboard/aprovacoes");
                                revalidatePath("/dashboard");
                              }}
                            >
                              <button type="submit" className="ph-button">
                                Confirmar
                              </button>
                            </form>

                            <form
                              action={async () => {
                                "use server";
                                await cancelMonthlyPassAsOwner({ passId: p.id });
                                revalidatePath("/dashboard/aprovacoes");
                                revalidatePath("/dashboard");
                              }}
                            >
                              <button type="submit" className="ph-button-secondary">
                                Cancelar
                              </button>
                            </form>
                          </>
                        ) : null}

                        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                          Status: {p.status === "PENDING" ? "Pendente" : p.status === "ACTIVE" ? "Ativa" : "Cancelada"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
