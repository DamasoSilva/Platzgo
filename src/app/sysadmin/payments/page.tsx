import Link from "next/link";

import { requireRoleOrRedirect } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PaymentProvider, PaymentStatus } from "@/generated/prisma/enums";

type SearchParams = {
  provider?: string;
  start?: string;
  end?: string;
};

function parseDateInput(value?: string, endOfDay?: boolean) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

function formatDt(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleString("pt-BR");
}

function formatMoney(cents?: number | null): string {
  if (typeof cents !== "number") return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toNumberFromMeta(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function readRefundMeta(meta: unknown): { refundAmountCents: number | null; refundFeeCents: number | null } {
  if (!meta || typeof meta !== "object") return { refundAmountCents: null, refundFeeCents: null };
  const data = meta as Record<string, unknown>;
  return {
    refundAmountCents: toNumberFromMeta(data.refund_amount_cents),
    refundFeeCents: toNumberFromMeta(data.refund_fee_cents),
  };
}

function outcomeLabel(status: PaymentStatus) {
  if (status === PaymentStatus.PAID) return "Sucesso";
  if (status === PaymentStatus.REFUNDED) return "Reembolsado";
  if (status === PaymentStatus.PENDING || status === PaymentStatus.AUTHORIZED) return "Pendente";
  return "Erro";
}

function statusBadge(status: PaymentStatus) {
  if (status === PaymentStatus.PAID) return "bg-primary/15 text-primary";
  if (status === PaymentStatus.AUTHORIZED) return "bg-sky-500/15 text-sky-700";
  if (status === PaymentStatus.PENDING) return "bg-amber-500/15 text-amber-600";
  if (status === PaymentStatus.REFUNDED) return "bg-secondary/70 text-muted-foreground";
  return "bg-destructive/15 text-destructive";
}

export default async function SysadminPaymentsPage(props: { searchParams?: SearchParams | Promise<SearchParams> }) {
  await requireRoleOrRedirect("SYSADMIN", "/sysadmin/payments");

  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const providerParam = (searchParams?.provider ?? "").toLowerCase().trim();
  const startParam = (searchParams?.start ?? "").trim();
  const endParam = (searchParams?.end ?? "").trim();

  const providerFilter =
    providerParam === "asaas"
      ? PaymentProvider.ASAAS
      : providerParam === "mercadopago"
        ? PaymentProvider.MERCADOPAGO
        : undefined;

  const startDate = parseDateInput(startParam, false);
  const endDate = parseDateInput(endParam, true);

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) dateFilter.gte = startDate;
  if (endDate) dateFilter.lte = endDate;

  const payments = await prisma.payment.findMany({
    where: {
      ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      ...(providerFilter ? { provider: providerFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      status: true,
      amount_cents: true,
      provider_payment_id: true,
      bookingId: true,
      monthlyPassId: true,
      tournamentRegistrationId: true,
      createdAt: true,
      metadata: true,
      booking: {
        select: {
          id: true,
          start_time: true,
          end_time: true,
          court: {
            select: {
              name: true,
              establishment: { select: { name: true } },
            },
          },
          customer: { select: { name: true, email: true } },
        },
      },
      monthlyPass: {
        select: {
          id: true,
          court: { select: { name: true, establishment: { select: { name: true } } } },
          customer: { select: { name: true, email: true } },
        },
      },
      tournamentRegistration: {
        select: {
          id: true,
          createdBy: { select: { name: true, email: true } },
          team: { select: { name: true } },
          tournament: { select: { name: true, establishment: { select: { name: true } } } },
        },
      },
    },
  });

  const events = await prisma.paymentEvent.findMany({
    where: {
      ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      ...(providerFilter ? { payment: { provider: providerFilter } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      provider_event_id: true,
      type: true,
      payload: true,
      createdAt: true,
      payment: {
        select: {
          id: true,
          provider: true,
          status: true,
          amount_cents: true,
          provider_payment_id: true,
          bookingId: true,
          monthlyPassId: true,
          booking: {
            select: {
              id: true,
              start_time: true,
              end_time: true,
              court: {
                select: {
                  name: true,
                  establishment: { select: { name: true } },
                },
              },
              customer: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });

  const totals = payments.reduce(
    (acc, payment) => {
      const refundMeta = readRefundMeta(payment.metadata);
      const refundAmount =
        payment.status === PaymentStatus.REFUNDED
          ? refundMeta.refundAmountCents ?? payment.amount_cents
          : null;

      if (payment.status === PaymentStatus.PAID) {
        acc.paidCents += payment.amount_cents;
        acc.paidCount += 1;
      } else if (payment.status === PaymentStatus.REFUNDED) {
        acc.refundCents += refundAmount ?? 0;
        acc.refundCount += 1;
      } else if (payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.AUTHORIZED) {
        acc.pendingCents += payment.amount_cents;
        acc.pendingCount += 1;
      } else {
        acc.errorCents += payment.amount_cents;
        acc.errorCount += 1;
      }
      return acc;
    },
    {
      paidCents: 0,
      refundCents: 0,
      pendingCents: 0,
      errorCents: 0,
      paidCount: 0,
      refundCount: 0,
      pendingCount: 0,
      errorCount: 0,
    }
  );

  const rangeLabel = startDate || endDate ? `${startParam || "..."} → ${endParam || "..."}` : "Todas as datas";

  return (
    <div className="space-y-6">
      <div className="ph-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pagamentos</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Retornos das APIs e webhooks por administradora. Configurações ficam em {" "}
              <Link className="underline" href="/sysadmin/settings">
                Sistema
              </Link>
              .
            </p>
          </div>
          <Link className="ph-button-secondary" href="/sysadmin">
            Voltar
          </Link>
        </div>

        <form className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]" method="get">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Administradora</label>
            <select name="provider" defaultValue={providerParam || "all"} className="ph-input mt-2">
              <option value="all">Todas</option>
              <option value="mercadopago">MercadoPago</option>
              <option value="asaas">Asaas</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Data inicial</label>
            <input name="start" type="date" defaultValue={startParam} className="ph-input mt-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Data final</label>
            <input name="end" type="date" defaultValue={endParam} className="ph-input mt-2" />
          </div>
          <button type="submit" className="ph-button h-11 self-end">Filtrar</button>
          <Link className="ph-button-secondary h-11 self-end" href="/sysadmin/payments">
            Limpar
          </Link>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full bg-secondary/60 px-3 py-1">
            {payments.length} transações
          </span>
          <span className="rounded-full bg-secondary/60 px-3 py-1">{rangeLabel}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="ph-card p-5">
          <p className="text-xs text-muted-foreground">Recebido</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatMoney(totals.paidCents)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{totals.paidCount} transações</p>
        </div>
        <div className="ph-card p-5">
          <p className="text-xs text-muted-foreground">Reembolsado</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatMoney(totals.refundCents)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{totals.refundCount} transações</p>
        </div>
        <div className="ph-card p-5">
          <p className="text-xs text-muted-foreground">Pendente</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatMoney(totals.pendingCents)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{totals.pendingCount} transações</p>
        </div>
        <div className="ph-card p-5">
          <p className="text-xs text-muted-foreground">Erro</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatMoney(totals.errorCents)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{totals.errorCount} transações</p>
        </div>
      </div>

      <div className="ph-card p-6">
        <h2 className="text-sm font-semibold text-foreground">Transações</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Resultado</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Valor</th>
                <th className="px-3 py-2">Reembolso</th>
                <th className="px-3 py-2">Multa</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Estabelecimento</th>
                <th className="px-3 py-2">Transação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-4 text-center text-muted-foreground">
                    Nenhuma transação encontrada.
                  </td>
                </tr>
              ) : (
                payments.map((payment) => {
                  const refundMeta = readRefundMeta(payment.metadata);
                  const refundAmount =
                    payment.status === PaymentStatus.REFUNDED
                      ? refundMeta.refundAmountCents ?? payment.amount_cents
                      : null;
                  const refundFee = refundMeta.refundFeeCents;
                  const origin = payment.bookingId
                    ? "Agendamento"
                    : payment.monthlyPassId
                      ? "Mensalidade"
                      : payment.tournamentRegistrationId
                        ? "Torneio"
                        : "—";
                  const customerLabel =
                    payment.booking?.customer?.name ||
                    payment.booking?.customer?.email ||
                    payment.monthlyPass?.customer?.name ||
                    payment.monthlyPass?.customer?.email ||
                    payment.tournamentRegistration?.createdBy?.name ||
                    payment.tournamentRegistration?.createdBy?.email ||
                    "—";
                  const establishmentLabel = payment.booking?.court?.establishment?.name
                    || payment.monthlyPass?.court?.establishment?.name
                    || payment.tournamentRegistration?.tournament?.establishment?.name
                    || "—";

                  return (
                    <tr key={payment.id} className="bg-card/70">
                      <td className="px-3 py-2 text-foreground">{formatDt(payment.createdAt)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{payment.provider}</td>
                      <td className="px-3 py-2 text-muted-foreground">{outcomeLabel(payment.status)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(payment.status)}`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{formatMoney(payment.amount_cents)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {refundAmount != null ? formatMoney(refundAmount) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {refundFee != null && refundFee > 0 ? formatMoney(refundFee) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{origin}</td>
                      <td className="px-3 py-2 text-muted-foreground">{customerLabel}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {establishmentLabel}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {payment.provider_payment_id ?? "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <details className="ph-card p-6">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Eventos (webhooks)</summary>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Evento</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Valor</th>
                <th className="px-3 py-2">IDs</th>
                <th className="px-3 py-2">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                    Nenhum evento encontrado.
                  </td>
                </tr>
              ) : (
                events.map((row) => (
                  <tr key={row.id} className="bg-card/70">
                    <td className="px-3 py-2 text-foreground">{formatDt(row.createdAt)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.payment.provider}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.type}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(row.payment.status)}`}>
                        {row.payment.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{formatMoney(row.payment.amount_cents)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div className="space-y-1">
                        <div>Pay: {row.payment.provider_payment_id ?? "—"}</div>
                        <div>Evt: {row.provider_event_id ?? "—"}</div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.payload ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">Ver</summary>
                          <pre className="mt-2 max-h-60 overflow-auto rounded-xl bg-foreground/90 p-3 text-[10px] text-background">
                            {JSON.stringify(row.payload, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}