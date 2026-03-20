import Link from "next/link";

import { requireAdminWithSetupOrRedirect } from "@/lib/authz";
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
  if (!d) return "-";
  return d.toLocaleString("pt-BR");
}

function formatMoney(cents?: number | null): string {
  if (typeof cents !== "number") return "-";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusBadge(status: PaymentStatus) {
  if (status === PaymentStatus.PAID) return "bg-primary/15 text-primary";
  if (status === PaymentStatus.AUTHORIZED) return "bg-sky-500/15 text-sky-700";
  if (status === PaymentStatus.PENDING) return "bg-amber-500/15 text-amber-600";
  if (status === PaymentStatus.REFUNDED) return "bg-secondary/70 text-muted-foreground";
  return "bg-destructive/15 text-destructive";
}

function outcomeLabel(status: PaymentStatus) {
  if (status === PaymentStatus.PAID) return "Sucesso";
  if (status === PaymentStatus.REFUNDED) return "Reembolsado";
  if (status === PaymentStatus.PENDING || status === PaymentStatus.AUTHORIZED) return "Pendente";
  return "Erro";
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

function readNetValueCents(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const data = meta as Record<string, unknown>;
  return toNumberFromMeta(data.net_value_cents);
}

function readOwnerNetValueCents(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const data = meta as Record<string, unknown>;
  return toNumberFromMeta(data.owner_net_value_cents);
}

function readAdminCommissionPercent(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const data = meta as Record<string, unknown>;
  return toNumberFromMeta(data.admin_commission_percent);
}

function readOwnerPercent(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const data = meta as Record<string, unknown>;
  return toNumberFromMeta(data.owner_percent);
}

function readAsaasFeeCents(meta: unknown, amountCents: number): number | null {
  if (meta && typeof meta === "object") {
    const data = meta as Record<string, unknown>;
    const stored = toNumberFromMeta(data.asaas_fee_cents);
    if (stored != null) return stored;
  }
  const netValueCents = readNetValueCents(meta);
  if (netValueCents != null) return Math.max(0, amountCents - netValueCents);
  return null;
}

function getOwnerNetCents(payment: { amount_cents: number; payout_amount_cents?: number | null; metadata?: unknown }): number | null {
  const ownerNetValueCents = readOwnerNetValueCents(payment.metadata);
  if (ownerNetValueCents != null) return ownerNetValueCents;

  const netValueCents = readNetValueCents(payment.metadata);
  const adminPercent = readAdminCommissionPercent(payment.metadata);
  const ownerPercent = readOwnerPercent(payment.metadata);
  const payoutCents = typeof payment.payout_amount_cents === "number" ? payment.payout_amount_cents : null;

  if (netValueCents != null) {
    if (adminPercent != null) return Math.round(netValueCents * (1 - adminPercent / 100));
    if (ownerPercent != null) return Math.round(netValueCents * (ownerPercent / 100));
    if (payoutCents != null && payment.amount_cents > 0) {
      return Math.round((netValueCents * payoutCents) / payment.amount_cents);
    }
    return netValueCents;
  }

  if (payoutCents != null) return payoutCents;
  return null;
}

function getAdminCommissionPercent(payment: { amount_cents: number; payout_amount_cents?: number | null; metadata?: unknown }): number | null {
  const metaPercent = readAdminCommissionPercent(payment.metadata);
  if (metaPercent != null) return metaPercent;
  const payoutCents = typeof payment.payout_amount_cents === "number" ? payment.payout_amount_cents : null;
  if (payoutCents != null && payment.amount_cents > 0) {
    const ownerPercent = (payoutCents / payment.amount_cents) * 100;
    return Math.max(0, Math.min(100, 100 - ownerPercent));
  }
  return null;
}

function getAdminCommissionCents(payment: { amount_cents: number; payout_amount_cents?: number | null; metadata?: unknown }): number | null {
  const netValueCents = readNetValueCents(payment.metadata);
  if (netValueCents == null) return null;
  const ownerNetCents = getOwnerNetCents(payment);
  if (ownerNetCents != null) return Math.max(0, netValueCents - ownerNetCents);
  const percent = getAdminCommissionPercent(payment);
  if (percent != null) return Math.round(netValueCents * (percent / 100));
  return null;
}

function getAsaasFeeCents(payment: { amount_cents: number; metadata?: unknown }): number | null {
  return readAsaasFeeCents(payment.metadata, payment.amount_cents);
}

export default async function DashboardPaymentsPage(props: { searchParams?: SearchParams | Promise<SearchParams> }) {
  const { establishmentId } = await requireAdminWithSetupOrRedirect("/dashboard/pagamentos");

  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const providerParam = (searchParams?.provider ?? "").toLowerCase().trim();
  const startParam = (searchParams?.start ?? "").trim();
  const endParam = (searchParams?.end ?? "").trim();

  const providerFilter = providerParam === "asaas" ? PaymentProvider.ASAAS : undefined;

  const startDate = parseDateInput(startParam, false);
  const endDate = parseDateInput(endParam, true);

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (startDate) dateFilter.gte = startDate;
  if (endDate) dateFilter.lte = endDate;

  const payments = await prisma.payment.findMany({
    where: {
      OR: [
        { booking: { court: { establishmentId } } },
        { monthlyPass: { court: { establishmentId } } },
        { tournamentRegistration: { tournament: { establishmentId } } },
      ],
      ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      ...(providerFilter ? { provider: providerFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      status: true,
      amount_cents: true,
      payout_amount_cents: true,
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
          court: { select: { name: true } },
          customer: { select: { name: true, email: true } },
        },
      },
      monthlyPass: {
        select: {
          id: true,
          court: { select: { name: true } },
          customer: { select: { name: true, email: true } },
        },
      },
      tournamentRegistration: {
        select: {
          id: true,
          createdBy: { select: { name: true, email: true } },
          team: { select: { name: true } },
          tournament: { select: { name: true } },
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
      const netCents = getOwnerNetCents(payment);
      const netFallback = netCents ?? payment.amount_cents;
      const feeCents = getAsaasFeeCents(payment) ?? 0;
      const adminCommissionCents = getAdminCommissionCents(payment) ?? 0;

      if (payment.status === PaymentStatus.PAID) {
        acc.paidCents += payment.amount_cents;
        acc.netPaidCents += netFallback;
        acc.paidFeeCents += feeCents;
        acc.paidAdminCommissionCents += adminCommissionCents;
        acc.paidCount += 1;
      } else if (payment.status === PaymentStatus.REFUNDED) {
        acc.refundCents += refundAmount ?? 0;
        acc.refundCount += 1;
      } else if (payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.AUTHORIZED) {
        acc.pendingCents += payment.amount_cents;
        acc.netPendingCents += netFallback;
        acc.pendingFeeCents += feeCents;
        acc.pendingAdminCommissionCents += adminCommissionCents;
        acc.pendingCount += 1;
      } else {
        acc.errorCents += payment.amount_cents;
        acc.errorCount += 1;
      }
      return acc;
    },
    {
      paidCents: 0,
      netPaidCents: 0,
      paidFeeCents: 0,
      paidAdminCommissionCents: 0,
      refundCents: 0,
      pendingCents: 0,
      netPendingCents: 0,
      pendingFeeCents: 0,
      pendingAdminCommissionCents: 0,
      errorCents: 0,
      paidCount: 0,
      refundCount: 0,
      pendingCount: 0,
      errorCount: 0,
    }
  );

  const rangeLabel = startDate || endDate ? `${startParam || "..."} -> ${endParam || "..."}` : "Todas as datas";

  return (
    <div className="space-y-6">
      <div className="ph-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pagamentos</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Acompanhamento das transacoes do seu estabelecimento.
            </p>
          </div>
          <Link className="ph-button-secondary" href="/dashboard">
            Voltar
          </Link>
        </div>

        <form className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]" method="get">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Administradora</label>
            <select name="provider" defaultValue={providerParam || "asaas"} className="ph-input mt-2">
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
          <Link className="ph-button-secondary h-11 self-end" href="/dashboard/pagamentos">
            Limpar
          </Link>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full bg-secondary/60 px-3 py-1">
            {payments.length} transacoes
          </span>
          <span className="rounded-full bg-secondary/60 px-3 py-1">{rangeLabel}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="ph-card p-5">
          <p className="text-xs text-muted-foreground">Recebido (líquido)</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatMoney(totals.netPaidCents)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Bruto: {formatMoney(totals.paidCents)}</p>
          {totals.paidFeeCents > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">Taxa Asaas: {formatMoney(totals.paidFeeCents)}</p>
          ) : null}
          {totals.paidAdminCommissionCents > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Comissão admin: {formatMoney(totals.paidAdminCommissionCents)}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Cálculo: (Bruto - Taxa Asaas) x (1 - Comissão admin)
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{totals.paidCount} transacoes</p>
        </div>
        <div className="ph-card p-5">
          <p className="text-xs text-muted-foreground">Reembolsado</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatMoney(totals.refundCents)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{totals.refundCount} transacoes</p>
        </div>
        <div className="ph-card p-5">
          <p className="text-xs text-muted-foreground">Pendente (líquido)</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatMoney(totals.netPendingCents)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Bruto: {formatMoney(totals.pendingCents)}</p>
          {totals.pendingFeeCents > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">Taxa Asaas: {formatMoney(totals.pendingFeeCents)}</p>
          ) : null}
          {totals.pendingAdminCommissionCents > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Comissão admin: {formatMoney(totals.pendingAdminCommissionCents)}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Cálculo: (Bruto - Taxa Asaas) x (1 - Comissão admin)
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{totals.pendingCount} transacoes</p>
        </div>
        <div className="ph-card p-5">
          <p className="text-xs text-muted-foreground">Erro</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {formatMoney(totals.errorCents)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{totals.errorCount} transacoes</p>
        </div>
      </div>

      <div className="ph-card p-6">
        <h2 className="text-sm font-semibold text-foreground">Transacoes</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Resultado</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Bruto</th>
                <th className="px-3 py-2">Líquido</th>
                <th className="px-3 py-2">Taxa Asaas</th>
                <th className="px-3 py-2">Comissão admin</th>
                <th className="px-3 py-2">Reembolso</th>
                <th className="px-3 py-2">Multa</th>
                <th className="px-3 py-2">Origem</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Detalhe</th>
                <th className="px-3 py-2">Transacao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-3 py-4 text-center text-muted-foreground">
                    Nenhuma transacao encontrada.
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
                  const netCents = getOwnerNetCents(payment);
                  const netDisplay = netCents ?? null;
                  const feeCents = getAsaasFeeCents(payment);
                  const adminCommissionCents = getAdminCommissionCents(payment);
                  const adminPercent = getAdminCommissionPercent(payment);
                  const adminPercentLabel =
                    adminPercent != null
                      ? `${adminPercent.toFixed(adminPercent % 1 === 0 ? 0 : 1)}%`
                      : null;
                  const origin = payment.bookingId
                    ? "Agendamento"
                    : payment.monthlyPassId
                      ? "Mensalidade"
                      : payment.tournamentRegistrationId
                        ? "Torneio"
                        : "-";
                  const customerLabel =
                    payment.booking?.customer?.name ||
                    payment.booking?.customer?.email ||
                    payment.monthlyPass?.customer?.name ||
                    payment.monthlyPass?.customer?.email ||
                    payment.tournamentRegistration?.createdBy?.name ||
                    payment.tournamentRegistration?.createdBy?.email ||
                    "-";
                  const detailLabel =
                    payment.booking?.court?.name ||
                    payment.monthlyPass?.court?.name ||
                    payment.tournamentRegistration?.tournament?.name ||
                    "-";

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
                        {netDisplay != null ? formatMoney(netDisplay) : "-"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {feeCents != null ? formatMoney(feeCents) : "-"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {adminCommissionCents != null
                          ? `${formatMoney(adminCommissionCents)}${adminPercentLabel ? ` (${adminPercentLabel})` : ""}`
                          : "-"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {refundAmount != null ? formatMoney(refundAmount) : "-"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {refundFee != null && refundFee > 0 ? formatMoney(refundFee) : "-"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{origin}</td>
                      <td className="px-3 py-2 text-muted-foreground">{customerLabel}</td>
                      <td className="px-3 py-2 text-muted-foreground">{detailLabel}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {payment.provider_payment_id ?? "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
