import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { formatSportLabel } from "@/lib/utils/sport";
import { formatHHMM } from "@/lib/utils/time";

function formatDateFull(d: Date) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(d); }
function formatDateShort(d: Date) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d); }

export const metadata: Metadata = { title: "Extrato do Agendamento • PlatzGo!" };

export default async function BookingExtratoPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) redirect(`/signin?callbackUrl=${encodeURIComponent(`/meus-agendamentos/${id}/extrato`)}`);

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true, status: true, start_time: true, end_time: true, total_price_cents: true, cancel_fee_cents: true,
      customer: { select: { name: true, cpf_cnpj: true, email: true } },
      court: { select: { name: true, sport_type: true, establishment: { select: { name: true, address_text: true } } } },
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true, provider_payment_id: true, status: true } },
    },
  });
  if (!booking || booking.customer?.email !== session.user?.email) notFound();

  const payment = booking.payments[0] ?? null;
  const statusLabel = booking.status === "CONFIRMED" ? "Confirmado" : booking.status === "CANCELLED" ? "Cancelado" : "Pendente";

  return (
    <div className="min-h-screen bg-white text-slate-900 flex items-center justify-center p-4" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-extrabold text-white">Platz<span className="text-lime-400">Go</span></div>
          </div>
          <p className="mt-1 text-xs text-slate-400">Comprovante de agendamento</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Status */}
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${
            booking.status === "CONFIRMED" ? "bg-emerald-100 text-emerald-700" :
            booking.status === "CANCELLED" ? "bg-slate-100 text-slate-500" : "bg-amber-100 text-amber-700"
          }`}>
            {statusLabel}
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Estabelecimento</p>
              <p className="text-sm font-bold text-slate-900">{booking.court.establishment.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Quadra</p>
              <p className="text-sm font-bold text-slate-900">{booking.court.name} • {formatSportLabel(booking.court.sport_type)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Data</p>
                <p className="text-sm font-bold text-slate-900">{formatDateFull(booking.start_time)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Horário</p>
                <p className="text-sm font-bold text-slate-900">{formatHHMM(booking.start_time)} – {formatHHMM(booking.end_time)}</p>
              </div>
            </div>
            {booking.court.establishment.address_text && (
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Endereço</p>
                <p className="text-sm font-medium text-slate-700">{booking.court.establishment.address_text}</p>
              </div>
            )}
          </div>

          {/* Value */}
          <div className="rounded-xl bg-lime-400/20 border border-lime-400/40 p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Valor total</p>
              <p className="text-2xl font-extrabold text-slate-900">{formatBRLFromCents(booking.total_price_cents)}</p>
            </div>
            {payment?.provider_payment_id && (
              <div className="text-right">
                <p className="text-[9px] text-slate-400">ID Transação</p>
                <p className="text-[10px] font-mono text-slate-500 break-all max-w-[140px]">{payment.provider_payment_id}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-center text-[10px] text-slate-400">
              Emitido em {formatDateShort(new Date())} • platzgo.com.br
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}