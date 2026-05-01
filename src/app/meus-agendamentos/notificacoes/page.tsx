import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerHeader } from "@/components/CustomerHeader";
import { deleteMyNotification, restoreMyNotification } from "@/lib/actions/notifications";
import { NotificationType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { ThemedBackground } from "@/components/ThemedBackground";
import { getNotificationTypeAppearance, getNotificationTypeLabel } from "@/lib/utils/notificationLabels";

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
  if (args.typeParam !== "all") parts.push(`tipo: ${getNotificationTypeLabel(args.typeParam)}`);
  if (args.from || args.to) parts.push(`período: ${args.from || "…"} → ${args.to || "…"}`);
  if (args.q) parts.push(`busca: “${args.q}”`);
  if (args.bookingId) parts.push(`bookingId: ${args.bookingId}`);
  parts.push(`limite: ${args.take}`);
  return parts;
}

export default async function MyNotificationsHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/meus-agendamentos/notificacoes")}`);
  }

  if (session?.user?.role !== "CUSTOMER") {
    redirect("/");
  }

  const status = asSingle(sp.status) ?? "all"; // all | active | deleted
  const read = asSingle(sp.read) ?? "all"; // all | unread | read
  const typeParam = asSingle(sp.type) ?? "all"; // all | NotificationType
  const q = (asSingle(sp.q) ?? "").trim();
  const bookingId = (asSingle(sp.bookingId) ?? "").trim();
  const from = (asSingle(sp.from) ?? "").trim();
  const to = (asSingle(sp.to) ?? "").trim();
  const takeRaw = asSingle(sp.take) ?? "100";
  const take = Math.min(500, Math.max(20, Number.parseInt(takeRaw, 10) || 100));

  const createdAt: { gte?: Date; lt?: Date } = {};
  const fromDate = from ? parseYmdStart(from) : null;
  const toDate = to ? parseYmdStart(to) : null;
  if (fromDate) createdAt.gte = fromDate;
  if (toDate) createdAt.lt = addDays(toDate, 1);

  const isValidType = (Object.values(NotificationType) as string[]).includes(typeParam);
  const type = isValidType ? (typeParam as NotificationType) : undefined;

  const where: Prisma.NotificationWhereInput = {
    userId,
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
    },
  });

  const filterSummary = buildFilterSummary({ status, read, typeParam, from, to, q, bookingId, take });

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
        rightSlot={
          <Link
            href="/meus-agendamentos"
            className="ph-button-secondary-sm"
          >
            Meus agendamentos
          </Link>
        }
      />

      <div className="mx-auto max-w-4xl px-6 pb-10">
        <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground dark:text-foreground">Histórico de notificações</h1>
            <p className="mt-1 text-sm text-muted-foreground">Inclui notificações excluídas.</p>
          </div>

          <Link
            href="/meus-agendamentos"
            className="ph-button-secondary-xs"
          >
            Voltar
          </Link>
        </div>

        <form method="get" className="mt-4 rounded-3xl ph-surface p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground">Status</label>
              <select
                name="status"
                defaultValue={status}
                className="mt-1 h-10 rounded-xl bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary dark:bg-secondary dark:text-foreground"
              >
                <option value="all">Todas</option>
                <option value="active">Ativas</option>
                <option value="deleted">Excluídas</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground">Leitura</label>
              <select
                name="read"
                defaultValue={read}
                className="mt-1 h-10 rounded-xl bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary dark:bg-secondary dark:text-foreground"
              >
                <option value="all">Todas</option>
                <option value="unread">Não lidas</option>
                <option value="read">Lidas</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground">Tipo</label>
              <select
                name="type"
                defaultValue={typeParam}
                className="mt-1 h-10 rounded-xl bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary dark:bg-secondary dark:text-foreground"
              >
                <option value="all">Todos</option>
                {Object.values(NotificationType).map((t) => (
                  <option key={t} value={t}>
                    {getNotificationTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground">De</label>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="mt-1 h-10 rounded-xl bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary dark:bg-secondary dark:text-foreground"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground">Até</label>
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="mt-1 h-10 rounded-xl bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary dark:bg-secondary dark:text-foreground"
              />
            </div>

            <div className="min-w-[220px] flex-1">
              <label className="block text-[11px] font-semibold text-muted-foreground">Busca</label>
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Título ou mensagem"
                className="mt-1 h-10 w-full rounded-xl bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary dark:bg-secondary dark:text-foreground"
              />
            </div>

            <div className="min-w-[220px] flex-1">
              <label className="block text-[11px] font-semibold text-muted-foreground">Booking ID</label>
              <input
                type="text"
                name="bookingId"
                defaultValue={bookingId}
                placeholder="Opcional"
                className="mt-1 h-10 w-full rounded-xl bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary dark:bg-secondary dark:text-foreground"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground">Limite</label>
              <select
                name="take"
                defaultValue={String(take)}
                className="mt-1 h-10 rounded-xl bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary dark:bg-secondary dark:text-foreground"
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="500">500</option>
              </select>
            </div>

            <button
              type="submit"
              className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:scale-105 transition-all"
            >
              Aplicar
            </button>

            <Link
              href="/meus-agendamentos/notificacoes"
              className="ph-button-secondary-sm"
            >
              Limpar
            </Link>
          </div>
        </form>

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl ph-surface p-4 text-sm text-muted-foreground dark:text-muted-foreground">
            <p>
              Mostrando <span className="font-semibold">{notifications.length}</span> notificação(ões).
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Filtros: {filterSummary.join(" • ")}</p>
          </div>

          {notifications.map((n) => (
            (() => {
              const appearance = getNotificationTypeAppearance(n.type);
              return (
            <details
              key={n.id}
              className={
                "rounded-2xl border border-l-4 p-4 " +
                appearance.cardAccentClassName +
                " " +
                (n.deletedAt
                  ? "border-border bg-card opacity-80 dark:border-border dark:bg-card"
                  : n.readAt
                    ? "border-border bg-card/70 backdrop-blur dark:border-border dark:bg-card/50"
                    : "border-primary/40 bg-primary/10 dark:border-primary/40 dark:bg-primary/10")
              }
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground dark:text-foreground">
                    {n.title}
                    {n.deletedAt ? " (excluída)" : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${appearance.dotClassName}`} aria-hidden="true" />
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${appearance.badgeClassName}`}>
                      {appearance.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground/80 dark:text-muted-foreground/80">{formatDateTimeBR(n.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!n.readAt && !n.deletedAt ? (
                    <span className="rounded-full bg-primary/80 px-2 py-1 text-[10px] font-bold text-primary-foreground">NOVA</span>
                  ) : null}
                </div>
              </summary>

              <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground dark:border-border dark:text-muted-foreground">
                <p>{n.body}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {n.bookingId ? (
                    <Link
                      href={`/meus-agendamentos/${n.bookingId}`}
                      className="rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-card dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-secondary"
                    >
                      Ver
                    </Link>
                  ) : null}

                  {n.deletedAt ? (
                    <form action={restoreMyNotification.bind(null, n.id)}>
                      <button
                        type="submit"
                        className="rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-card dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-secondary"
                      >
                        Restaurar
                      </button>
                    </form>
                  ) : (
                    <form action={deleteMyNotification.bind(null, n.id)}>
                      <button
                        type="submit"
                        className="rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-card dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-secondary"
                      >
                        Excluir
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </details>
              );
            })()
          ))}

          {notifications.length === 0 ? (
            <div className="rounded-3xl ph-surface p-6">
              <p className="text-sm text-muted-foreground">Você ainda não tem notificações.</p>
            </div>
          ) : null}
        </div>
      </div>
      </div>
    </div>
  );
}
