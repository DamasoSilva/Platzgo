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

function statusBadge(status: PaymentStatus) {
  if (status === PaymentStatus.PAID) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200";
  if (status === PaymentStatus.AUTHORIZED) return "bg-sky-500/15 text-sky-700 dark:text-sky-200";
  if (status === PaymentStatus.PENDING) return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
  if (status === PaymentStatus.REFUNDED) return "bg-zinc-500/15 text-zinc-700 dark:text-zinc-200";
  return "bg-rose-500/15 text-rose-800 dark:text-rose-200";
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

  const rangeLabel = startDate || endDate ? `${startParam || "..."} → ${endParam || "..."}` : "Todas as datas";

  return (
    <div className="space-y-6">
      <div className="ph-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Pagamentos</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
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
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Administradora</label>
            <select name="provider" defaultValue={providerParam || "all"} className="ph-input mt-2">
              <option value="all">Todas</option>
              <option value="mercadopago">MercadoPago</option>
              <option value="asaas">Asaas</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Data inicial</label>
            <input name="start" type="date" defaultValue={startParam} className="ph-input mt-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Data final</label>
            <input name="end" type="date" defaultValue={endParam} className="ph-input mt-2" />
          </div>
          <button type="submit" className="ph-button h-11 self-end">Filtrar</button>
          <Link className="ph-button-secondary h-11 self-end" href="/sysadmin/payments">
            Limpar
          </Link>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
          <span className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-900/60">
            {events.length} eventos
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-900/60">{rangeLabel}</span>
        </div>
      </div>

      <div className="ph-card p-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Últimos retornos</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Evento</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Valor</th>
                <th className="px-3 py-2">Agendamento</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Quadra</th>
                <th className="px-3 py-2">IDs</th>
                <th className="px-3 py-2">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-4 text-center text-zinc-500">
                    Nenhum evento encontrado.
                  </td>
                </tr>
              ) : (
                events.map((row) => (
                  <tr key={row.id} className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">{formatDt(row.createdAt)}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{row.payment.provider}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{row.type}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(row.payment.status)}`}>
                        {row.payment.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{formatMoney(row.payment.amount_cents)}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {row.payment.bookingId ?? row.payment.monthlyPassId ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {row.payment.booking?.customer?.name || row.payment.booking?.customer?.email || "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {row.payment.booking?.court?.name
                        ? `${row.payment.booking.court.name} · ${row.payment.booking.court.establishment?.name ?? ""}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      <div className="space-y-1">
                        <div>Pay: {row.payment.provider_payment_id ?? "—"}</div>
                        <div>Evt: {row.provider_event_id ?? "—"}</div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {row.payload ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-zinc-600 dark:text-zinc-300">Ver</summary>
                          <pre className="mt-2 max-h-60 overflow-auto rounded-xl bg-zinc-900/90 p-3 text-[10px] text-zinc-100">
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
      </div>
    </div>
  );
}