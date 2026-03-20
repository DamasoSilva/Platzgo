import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdminWithSetupOrRedirect, requireRoleOrRedirect } from "@/lib/authz";
import { OutboundEmailStatus } from "@/generated/prisma/enums";

type CountByStatus = { status: OutboundEmailStatus; _count: { _all: number } };
type BookingCount = { status: string; _count: { _all: number } };
type AccessLogRow = {
  id: string;
  method: string;
  path: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; email: string | null } | null;
  court: { id: string; name: string } | null;
};
type OutboundEmailRow = {
  id: string;
  to: string;
  subject: string;
  status: OutboundEmailStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  createdAt: Date;
  sentAt: Date | null;
  lastError: string | null;
  providerMessageId: string | null;
};

import { processEmailQueueNow, requeueStuckSending, retryOutboundEmail } from "@/lib/actions/emailQueueAdmin";

function formatDt(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("pt-BR");
}

function formatMinutesSince(d: Date | null | undefined): string {
  if (!d) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${rest}m`;
}

function badgeClass(status: OutboundEmailStatus) {
  if (status === OutboundEmailStatus.SENT) return "bg-primary/15 text-primary";
  if (status === OutboundEmailStatus.PENDING) return "bg-amber-500/15 text-amber-600";
  if (status === OutboundEmailStatus.SENDING) return "bg-sky-500/15 text-sky-600";
  return "bg-destructive/15 text-destructive";
}

export default async function DashboardSistemaPage() {
  await requireRoleOrRedirect("SYSADMIN", "/sysadmin/sistema");
  redirect("/sysadmin/sistema");

  const { session, establishmentId } = await requireAdminWithSetupOrRedirect("/dashboard/sistema");

  const smtpOk = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM);
  const queueSecretOk = Boolean(process.env.EMAIL_QUEUE_SECRET);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfToday.getDate() + 1);

  const startOfNext7Days = new Date(now);
  startOfNext7Days.setDate(now.getDate() + 7);

  const stuckSendingCutoff = new Date(now);
  stuckSendingCutoff.setMinutes(stuckSendingCutoff.getMinutes() - 15);

  const [
    establishment,
    unreadNotifications,
    bookingsToday,
    bookingsNext7Days,
    monthlyPassPending,
    monthlyPassActive,
    counts,
    dueNowCount,
    oldestDue,
    latestSent,
    latest,
    stuckSendingCount,
    accessLogs,
  ] = await Promise.all([
    prisma.establishment.findUnique({
      where: { id: establishmentId },
      select: { id: true, name: true },
    }),
    prisma.notification.count({
      where: {
        userId: session.user.id,
        readAt: null,
        deletedAt: null,
      },
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: {
        court: { establishmentId },
        start_time: { gte: startOfToday, lt: startOfTomorrow },
      },
      _count: { _all: true },
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: {
        court: { establishmentId },
        start_time: { gte: now, lt: startOfNext7Days },
      },
      _count: { _all: true },
    }),
    prisma.monthlyPass.count({
      where: {
        status: "PENDING",
        court: { establishmentId },
      },
    }),
    prisma.monthlyPass.count({
      where: {
        status: "ACTIVE",
        court: { establishmentId },
      },
    }),
    prisma.outboundEmail.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.outboundEmail.count({
      where: {
        status: { in: [OutboundEmailStatus.PENDING, OutboundEmailStatus.FAILED] },
        nextAttemptAt: { lte: now },
      },
    }),
    prisma.outboundEmail.findFirst({
      where: {
        status: { in: [OutboundEmailStatus.PENDING, OutboundEmailStatus.FAILED] },
        nextAttemptAt: { lte: now },
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      select: { createdAt: true, nextAttemptAt: true },
    }),
    prisma.outboundEmail.findFirst({
      where: { status: OutboundEmailStatus.SENT },
      orderBy: [{ sentAt: "desc" }],
      select: { sentAt: true },
    }),
    prisma.outboundEmail.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        to: true,
        subject: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        nextAttemptAt: true,
        createdAt: true,
        sentAt: true,
        lastError: true,
        providerMessageId: true,
      },
    }),
    prisma.outboundEmail.count({
      where: {
        status: OutboundEmailStatus.SENDING,
        nextAttemptAt: { lt: stuckSendingCutoff },
      },
    }),
    prisma.accessLog.findMany({
      where: establishmentId ? { establishmentId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        method: true,
        path: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
        court: { select: { id: true, name: true } },
      },
    }),
  ]);

  const countsTyped = counts as CountByStatus[];
  const bookingsTodayTyped = bookingsToday as BookingCount[];
  const bookingsNext7DaysTyped = bookingsNext7Days as BookingCount[];
  const latestTyped = latest as OutboundEmailRow[];
  const accessLogsTyped = accessLogs as AccessLogRow[];

  const countByStatus = (s: OutboundEmailStatus) =>
    countsTyped.find((c) => c.status === s)?._count._all ?? 0;

  const countBookings = (
    list: BookingCount[],
    status: "PENDING" | "CONFIRMED" | "CANCELLED",
  ) => list.find((x) => x.status === status)?._count._all ?? 0;

  const todayTotal = bookingsTodayTyped.reduce((acc: number, x) => acc + x._count._all, 0);
  const next7Total = bookingsNext7DaysTyped.reduce((acc: number, x) => acc + x._count._all, 0);
  const establishmentName = establishment?.name ?? "";
  const latestSentAt = latestSent?.sentAt ?? null;
  const oldestDueAt = oldestDue?.createdAt ?? null;

  return (
    <div className="space-y-6">
      <div className="ph-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground dark:text-foreground">Sistema</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Saúde do sistema e indicadores do estabelecimento{establishmentName ? `: ${establishmentName}` : ""}.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={processEmailQueueNow}>
              <button type="submit" className="ph-button">Processar fila agora</button>
            </form>
            {stuckSendingCount ? (
              <form action={requeueStuckSending}>
                <button type="submit" className="ph-button-secondary">Reenfileirar travados ({stuckSendingCount})</button>
              </form>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4 dark:border-border dark:bg-card">
            <p className="text-xs font-semibold text-muted-foreground">SMTP</p>
            <p className="mt-1 text-lg font-bold text-foreground dark:text-foreground">{smtpOk ? "OK" : "Não configurado"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Precisa de SMTP_* para enviar.</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 dark:border-border dark:bg-card">
            <p className="text-xs font-semibold text-muted-foreground">Endpoint interno</p>
            <p className="mt-1 text-lg font-bold text-foreground dark:text-foreground">{queueSecretOk ? "Protegido" : "Sem secret"}</p>
            <p className="mt-1 text-xs text-muted-foreground">EMAIL_QUEUE_SECRET</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 dark:border-border dark:bg-card">
            <p className="text-xs font-semibold text-muted-foreground">Fila de e-mails</p>
            <p className="mt-1 text-sm font-semibold text-foreground dark:text-foreground">
              PENDING: {countByStatus(OutboundEmailStatus.PENDING)} • SENDING: {countByStatus(OutboundEmailStatus.SENDING)}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground dark:text-foreground">
              FAILED: {countByStatus(OutboundEmailStatus.FAILED)} • SENT: {countByStatus(OutboundEmailStatus.SENT)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Prontos para envio agora: {dueNowCount} • Último envio: {latestSentAt ? formatMinutesSince(latestSentAt) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mais antigo (due): {oldestDueAt ? formatMinutesSince(oldestDueAt) : "—"}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4 dark:border-border dark:bg-card">
            <p className="text-xs font-semibold text-muted-foreground">Agendamentos hoje</p>
            <p className="mt-1 text-lg font-bold text-foreground dark:text-foreground">{todayTotal}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              PENDING: {countBookings(bookingsToday, "PENDING")} • CONFIRMED: {countBookings(bookingsToday, "CONFIRMED")} • CANCELLED: {countBookings(bookingsToday, "CANCELLED")}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 dark:border-border dark:bg-card">
            <p className="text-xs font-semibold text-muted-foreground">Próximos 7 dias</p>
            <p className="mt-1 text-lg font-bold text-foreground dark:text-foreground">{next7Total}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              PENDING: {countBookings(bookingsNext7Days, "PENDING")} • CONFIRMED: {countBookings(bookingsNext7Days, "CONFIRMED")}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 dark:border-border dark:bg-card">
            <p className="text-xs font-semibold text-muted-foreground">Mensalidades</p>
            <p className="mt-1 text-sm font-semibold text-foreground dark:text-foreground">PENDING: {monthlyPassPending}</p>
            <p className="mt-1 text-sm font-semibold text-foreground dark:text-foreground">ACTIVE: {monthlyPassActive}</p>
            <p className="mt-2 text-xs text-muted-foreground">Não lidas: {unreadNotifications} notificações</p>
          </div>
        </div>
      </div>

      <div className="ph-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground dark:text-foreground">Acessos recentes</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Últimos acessos registrados{establishmentName ? ` para ${establishmentName}` : ""}.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground/80">
                <th className="py-2 pr-4">Data</th>
                <th className="py-2 pr-4">Usuário</th>
                <th className="py-2 pr-4">Rota</th>
                <th className="py-2 pr-4">Quadra</th>
                <th className="py-2 pr-4">IP</th>
                <th className="py-2 pr-4">Agente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-border">
              {accessLogsTyped.map((log) => (
                <tr key={log.id} className="text-foreground">
                  <td className="py-2 pr-4 whitespace-nowrap">{formatDt(log.createdAt)}</td>
                  <td className="py-2 pr-4">
                    <div className="text-xs font-semibold">{log.user?.name ?? log.user?.email ?? "Visitante"}</div>
                    {log.user?.email ? <div className="text-[11px] text-muted-foreground/80">{log.user.email}</div> : null}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <span className="rounded-full bg-secondary px-2 py-1 text-xs font-semibold text-muted-foreground dark:bg-secondary dark:text-muted-foreground">
                      {log.method}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">{log.path}</span>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-xs">
                    {log.court?.name ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-xs">{log.ip ?? "—"}</td>
                  <td className="py-2 pr-4 text-[11px] text-muted-foreground/80">
                    {log.userAgent ? log.userAgent.slice(0, 60) : "—"}
                  </td>
                </tr>
              ))}
              {!accessLogs.length ? (
                <tr>
                  <td className="py-4 text-center text-sm text-muted-foreground/80" colSpan={6}>
                    Nenhum acesso registrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ph-card p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground dark:text-foreground">E-mails recentes</h2>
            <p className="mt-1 text-sm text-muted-foreground">Últimos 50 itens da fila.</p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground/80 dark:text-muted-foreground">
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Para</th>
                <th className="py-2 pr-4">Assunto</th>
                <th className="py-2 pr-4">Tentativas</th>
                <th className="py-2 pr-4">Próxima</th>
                <th className="py-2 pr-4">Criado</th>
                <th className="py-2 pr-4">Enviado</th>
                <th className="py-2 pr-4">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border dark:divide-border">
              {latestTyped.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="py-3 pr-4">
                    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${badgeClass(e.status)}`}>
                      {e.status}
                    </span>
                    {e.lastError ? (
                      <div className="mt-2 max-w-[260px] text-[11px] text-rose-700 dark:text-rose-200">
                        {e.lastError}
                      </div>
                    ) : null}
                    {e.providerMessageId ? (
                      <div className="mt-1 max-w-[260px] text-[11px] text-muted-foreground/80 dark:text-muted-foreground/80">
                        id: {e.providerMessageId}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 max-w-[220px] break-words text-foreground dark:text-foreground">{e.to}</td>
                  <td className="py-3 pr-4 max-w-[360px] break-words text-foreground dark:text-foreground">{e.subject}</td>
                  <td className="py-3 pr-4 text-muted-foreground dark:text-muted-foreground">{e.attempts}/{e.maxAttempts}</td>
                  <td className="py-3 pr-4 text-muted-foreground dark:text-muted-foreground">{formatDt(e.nextAttemptAt)}</td>
                  <td className="py-3 pr-4 text-muted-foreground dark:text-muted-foreground">{formatDt(e.createdAt)}</td>
                  <td className="py-3 pr-4 text-muted-foreground dark:text-muted-foreground">{formatDt(e.sentAt)}</td>
                  <td className="py-3 pr-4">
                    {e.status !== OutboundEmailStatus.SENT ? (
                      <form action={retryOutboundEmail}>
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className="ph-button-secondary">Reenviar</button>
                      </form>
                    ) : (
                      <span className="text-xs text-muted-foreground/80 dark:text-muted-foreground/80">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
