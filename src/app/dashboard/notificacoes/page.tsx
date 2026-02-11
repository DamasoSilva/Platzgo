import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireAdminWithSetupOrRedirect } from "@/lib/authz";
import { deleteMyNotification, restoreMyNotification } from "@/lib/actions/notifications";
import { NotificationType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

function formatDateTimeBR(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
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

function buildFilterSummary(args: {
  status: string;
  read: string;
  typeParam: string;
  from: string;
  to: string;
  q: string;
  bookingId: string;
  take: number;
}) {
  const parts: string[] = [];
  if (args.status !== "all") parts.push(`status: ${args.status === "active" ? "ativas" : "excluídas"}`);
  if (args.read !== "all") parts.push(`leitura: ${args.read === "unread" ? "não lidas" : "lidas"}`);
  if (args.typeParam !== "all") parts.push(`tipo: ${args.typeParam}`);
  if (args.from || args.to) parts.push(`período: ${args.from || "…"} → ${args.to || "…"}`);
  if (args.q) parts.push(`busca: “${args.q}”`);
  if (args.bookingId) parts.push(`bookingId: ${args.bookingId}`);
  parts.push(`limite: ${args.take}`);
  return parts;
}

export default async function DashboardNotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const { session } = await requireAdminWithSetupOrRedirect("/dashboard/notificacoes");

  const status = asSingle(sp.status) ?? "all"; // all | active | deleted
  const read = asSingle(sp.read) ?? "all"; // all | unread | read
  const typeParam = asSingle(sp.type) ?? "all"; // all | NotificationType
  const q = (asSingle(sp.q) ?? "").trim();
  const bookingId = (asSingle(sp.bookingId) ?? "").trim();
  const from = (asSingle(sp.from) ?? "").trim();
  const to = (asSingle(sp.to) ?? "").trim();
  const takeRaw = asSingle(sp.take) ?? "200";
  const take = Math.min(500, Math.max(20, Number.parseInt(takeRaw, 10) || 200));

  const createdAt: { gte?: Date; lt?: Date } = {};
  const fromDate = from ? parseYmdStart(from) : null;
  const toDate = to ? parseYmdStart(to) : null;
  if (fromDate) createdAt.gte = fromDate;
  if (toDate) createdAt.lt = addDays(toDate, 1);

  const isValidType = (Object.values(NotificationType) as string[]).includes(typeParam);
  const type = isValidType ? (typeParam as NotificationType) : undefined;

  const where: Prisma.NotificationWhereInput = {
    userId: session.user.id,
    ...(bookingId ? { bookingId } : {}),
    ...(status === "active" ? { deletedAt: null } : status === "deleted" ? { deletedAt: { not: null } } : {}),
    ...(read === "unread" ? { readAt: null } : read === "read" ? { readAt: { not: null } } : {}),
    ...(type ? { type } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { body: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      createdAt: true,
      bookingId: true,
      readAt: true,
      deletedAt: true,
      booking: { select: { courtId: true, start_time: true } },
    },
  });

  const filterSummary = buildFilterSummary({ status, read, typeParam, from, to, q, bookingId, take });

  return (
    <div className="space-y-6">
      <div className="ph-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Histórico de notificações</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Inclui notificações excluídas.</p>
          </div>

          <Link href="/dashboard" className="ph-button-secondary">
            Voltar
          </Link>
        </div>

        <form method="get" className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Status</label>
              <select
                name="status"
                defaultValue={status}
                className="mt-1 h-10 rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="all">Todas</option>
                <option value="active">Ativas</option>
                <option value="deleted">Excluídas</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Leitura</label>
              <select
                name="read"
                defaultValue={read}
                className="mt-1 h-10 rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="all">Todas</option>
                <option value="unread">Não lidas</option>
                <option value="read">Lidas</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Tipo</label>
              <select
                name="type"
                defaultValue={typeParam}
                className="mt-1 h-10 rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="all">Todos</option>
                {Object.values(NotificationType).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
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
                placeholder="Título ou mensagem"
                className="mt-1 h-10 w-full rounded-xl bg-zinc-100 px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div className="min-w-[220px] flex-1">
              <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">Booking ID</label>
              <input
                type="text"
                name="bookingId"
                defaultValue={bookingId}
                placeholder="Opcional"
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
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </select>
            </div>

            <button type="submit" className="ph-button">
              Aplicar
            </button>
            <Link href="/dashboard/notificacoes" className="ph-button-secondary">
              Limpar
            </Link>
          </div>
        </form>

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            <p>
              Mostrando <span className="font-semibold">{notifications.length}</span> notificação(ões).
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Filtros: {filterSummary.join(" • ")}</p>
          </div>

          {notifications.map((n) => (
            <div
              key={n.id}
              className={
                "rounded-2xl border p-4 " +
                (n.deletedAt
                  ? "border-zinc-200 bg-zinc-50 opacity-80 dark:border-zinc-800 dark:bg-zinc-950"
                  : n.readAt
                    ? "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                    : "border-[#CCFF00]/40 bg-[#CCFF00]/10 dark:border-[#CCFF00]/40 dark:bg-[#CCFF00]/10")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {n.title}
                    {n.deletedAt ? " (excluída)" : ""}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{n.body}</p>
                  <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">{formatDateTimeBR(n.createdAt)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {n.bookingId ? (
                    <Link
                      href={(() => {
                        if (!n.booking) return "/dashboard/agenda";
                        const start = n.booking.start_time;
                        const base = new Date(start.getFullYear(), start.getMonth(), start.getDate());
                        const sunday = new Date(base);
                        sunday.setDate(base.getDate() - base.getDay());
                        const y = sunday.getFullYear();
                        const m = String(sunday.getMonth() + 1).padStart(2, "0");
                        const d = String(sunday.getDate()).padStart(2, "0");
                        const week = `${y}-${m}-${d}`;
                        const params = new URLSearchParams({
                          courtId: n.booking.courtId,
                          week,
                          focusBookingId: n.bookingId,
                        });
                        return `/dashboard/agenda?${params.toString()}`;
                      })()}
                      className="ph-button-secondary"
                    >
                      Ver
                    </Link>
                  ) : null}

                  {n.deletedAt ? (
                    <form action={restoreMyNotification.bind(null, n.id)}>
                      <button type="submit" className="ph-button-secondary">
                        Restaurar
                      </button>
                    </form>
                  ) : (
                    <form action={deleteMyNotification.bind(null, n.id)}>
                      <button type="submit" className="ph-button-secondary">
                        Excluir
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}

          {notifications.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma notificação ainda.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
