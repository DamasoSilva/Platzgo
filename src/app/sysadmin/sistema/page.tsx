import { prisma } from "@/lib/prisma";
import { requireRoleOrRedirect } from "@/lib/authz";
import { OutboundEmailStatus } from "@/generated/prisma/enums";
import { processEmailQueueNow, requeueStuckSending, retryOutboundEmail } from "@/lib/actions/emailQueueAdmin";

type CountByStatus = { status: OutboundEmailStatus; _count: { _all: number } };

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
  if (status === OutboundEmailStatus.SENT) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200";
  if (status === OutboundEmailStatus.PENDING) return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
  if (status === OutboundEmailStatus.SENDING) return "bg-sky-500/15 text-sky-800 dark:text-sky-200";
  return "bg-rose-500/15 text-rose-800 dark:text-rose-200";
}

export default async function SysadminSistemaPage() {
  await requireRoleOrRedirect("SYSADMIN", "/sysadmin/sistema");

  const smtpOk = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM);
  const queueSecretOk = Boolean(process.env.EMAIL_QUEUE_SECRET);

  const now = new Date();
  const stuckSendingCutoff = new Date(now);
  stuckSendingCutoff.setMinutes(stuckSendingCutoff.getMinutes() - 15);

  const [
    counts,
    dueNowCount,
    oldestDue,
    latestSent,
    latest,
    stuckSendingCount,
    accessLogs,
  ] = await Promise.all([
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
  const latestTyped = latest as OutboundEmailRow[];
  const accessLogsTyped = accessLogs as AccessLogRow[];

  const countByStatus = (s: OutboundEmailStatus) =>
    countsTyped.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-6">
      <div className="ph-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Sistema</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Saúde do sistema e fila de e-mails.
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
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">SMTP</p>
            <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">{smtpOk ? "OK" : "Não configurado"}</p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Precisa de SMTP_* para enviar.</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Endpoint interno</p>
            <p className="mt-1 text-lg font-bold text-zinc-900 dark:text-zinc-50">{queueSecretOk ? "Protegido" : "Sem secret"}</p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">EMAIL_QUEUE_SECRET</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Fila de e-mails</p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              PENDING: {countByStatus(OutboundEmailStatus.PENDING)} • SENDING: {countByStatus(OutboundEmailStatus.SENDING)}
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              FAILED: {countByStatus(OutboundEmailStatus.FAILED)} • SENT: {countByStatus(OutboundEmailStatus.SENT)}
            </p>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              Prontos para envio agora: {dueNowCount} • Último envio: {latestSent?.sentAt ? formatMinutesSince(latestSent.sentAt) : "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Mais antigo (due): {oldestDue?.createdAt ? formatMinutesSince(oldestDue.createdAt) : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="ph-card p-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Últimos e-mails</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300">
              <tr>
                <th className="px-3 py-2">Para</th>
                <th className="px-3 py-2">Assunto</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Tentativas</th>
                <th className="px-3 py-2">Próxima</th>
                <th className="px-3 py-2">Criado</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {latestTyped.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-zinc-500">
                    Nenhum e-mail encontrado.
                  </td>
                </tr>
              ) : (
                latestTyped.map((row) => (
                  <tr key={row.id} className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">{row.to}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{row.subject}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${badgeClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {row.attempts}/{row.maxAttempts}
                    </td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{formatDt(row.nextAttemptAt)}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{formatDt(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      <form action={retryOutboundEmail}>
                        <input type="hidden" name="id" value={row.id} />
                        <button type="submit" className="ph-button-secondary-xs">Reenviar</button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ph-card p-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Logs de acesso</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300">
              <tr>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Método</th>
                <th className="px-3 py-2">Path</th>
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Quadra</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {accessLogsTyped.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-zinc-500">
                    Nenhum log registrado.
                  </td>
                </tr>
              ) : (
                accessLogsTyped.map((row) => (
                  <tr key={row.id} className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{formatDt(row.createdAt)}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{row.method}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{row.path}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {row.user?.name ?? row.user?.email ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{row.court?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{row.ip ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
