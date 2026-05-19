import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerHeader } from "@/components/CustomerHeader";
import { ThemedBackground } from "@/components/ThemedBackground";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { formatSportLabel } from "@/lib/utils/sport";
import { buildActivePaymentWhere } from "@/lib/utils/bookingAvailability";
import { PaymentStatus, TournamentRegistrationStatus, TournamentStatus } from "@/generated/prisma/enums";

type SearchParams = {
  registrationId?: string;
  confirmed?: string;
  payment?: string;
};

function formatDateRange(startDate: Date, endDate: Date) {
  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  return `${fmt.format(startDate)} - ${fmt.format(endDate)}`;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function registrationStatusLabel(status: TournamentRegistrationStatus) {
  if (status === TournamentRegistrationStatus.APPROVED) return "Aprovada";
  if (status === TournamentRegistrationStatus.REJECTED) return "Recusada";
  if (status === TournamentRegistrationStatus.CANCELLED) return "Cancelada";
  return "Aguardando aprovação";
}

function registrationStatusClass(status: TournamentRegistrationStatus) {
  if (status === TournamentRegistrationStatus.APPROVED) return "bg-primary/15 text-primary";
  if (status === TournamentRegistrationStatus.REJECTED) return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  if (status === TournamentRegistrationStatus.CANCELLED) return "bg-secondary text-muted-foreground";
  return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
}

function tournamentStatusLabel(status: TournamentStatus) {
  if (status === TournamentStatus.OPEN) return "Inscrições abertas";
  if (status === TournamentStatus.RUNNING) return "Em andamento";
  if (status === TournamentStatus.FINISHED) return "Finalizado";
  if (status === TournamentStatus.CANCELLED) return "Cancelado";
  return "Rascunho";
}

function tournamentStatusClass(status: TournamentStatus) {
  if (status === TournamentStatus.OPEN) return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  if (status === TournamentStatus.RUNNING) return "bg-primary/15 text-primary";
  if (status === TournamentStatus.FINISHED) return "bg-secondary text-muted-foreground";
  if (status === TournamentStatus.CANCELLED) return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  return "bg-secondary text-muted-foreground";
}

function isPendingPaymentStatus(status: PaymentStatus) {
  return status === PaymentStatus.PENDING || status === PaymentStatus.AUTHORIZED;
}

export default async function MyTournamentsPage(props: { searchParams?: SearchParams | Promise<SearchParams> }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  const userId = user?.id;

  if (!userId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/torneios/meus")}`);
  }

  if (user?.role !== "CUSTOMER") {
    redirect("/");
  }

  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const highlightedRegistrationId = typeof searchParams?.registrationId === "string" ? searchParams.registrationId : null;
  const showConfirmation = searchParams?.confirmed === "1";
  const hasPendingPaymentMessage = searchParams?.payment === "1";
  const now = new Date();
  const activePaymentWhere = buildActivePaymentWhere(now);

  const registrations = await prisma.tournamentRegistration.findMany({
    where: { createdById: userId },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      status: true,
      paid: true,
      createdAt: true,
      tournament: {
        select: {
          id: true,
          name: true,
          cover_image_url: true,
          sport_type: true,
          start_date: true,
          end_date: true,
          status: true,
          entry_fee_cents: true,
          location_name: true,
          city: true,
          establishment: { select: { name: true, address_text: true } },
        },
      },
      team: {
        select: {
          name: true,
          members: {
            take: 1,
            orderBy: { createdAt: "asc" },
            select: { full_name: true },
          },
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          amount_cents: true,
          checkout_url: true,
          expires_at: true,
        },
      },
    },
  });

  const totalRegistrations = registrations.length;
  const pendingApprovals = registrations.filter((item) => item.status === TournamentRegistrationStatus.PENDING).length;
  const approvedRegistrations = registrations.filter((item) => item.status === TournamentRegistrationStatus.APPROVED).length;
  const pendingPayments = registrations.filter((item) => {
    const payment = item.payments[0] ?? null;
    return Boolean(
      !item.paid &&
      payment &&
      isPendingPaymentStatus(payment.status) &&
      (!payment.expires_at || payment.expires_at > now)
    );
  }).length;

  return (
    <div className="ph-page">
      <ThemedBackground />
      <div className="relative z-10">
        <CustomerHeader
          variant="light"
          viewer={{
            isLoggedIn: true,
            name: user?.name ?? null,
            image: user?.image ?? null,
            role: user?.role ?? null,
          }}
          rightSlot={null}
        />

        <div className="mx-auto max-w-5xl px-6 pb-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Meus torneios</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Acompanhe aprovações, pagamentos e o andamento dos seus times inscritos.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href="/torneios" className="ph-button-secondary">
                Explorar torneios
              </Link>
              <Link href="/torneios/novo" className="ph-button-secondary">
                Criar torneio interno
              </Link>
            </div>
          </div>

          {showConfirmation ? (
            <div className="mt-6 rounded-3xl border border-primary/30 bg-primary/10 p-5 text-sm text-foreground">
              <p className="font-semibold text-primary">Inscrição registrada com sucesso.</p>
              <p className="mt-2 text-muted-foreground">
                {hasPendingPaymentMessage
                  ? "Seu time já está no acompanhamento. Finalize o pagamento para seguir com a validação da inscrição."
                  : "Agora você pode acompanhar por aqui o status da inscrição e o andamento do torneio."}
              </p>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-3xl ph-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="mt-3 text-3xl font-semibold text-foreground">{totalRegistrations}</p>
            </div>
            <div className="rounded-3xl ph-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aguardando aprovação</p>
              <p className="mt-3 text-3xl font-semibold text-foreground">{pendingApprovals}</p>
            </div>
            <div className="rounded-3xl ph-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aprovados</p>
              <p className="mt-3 text-3xl font-semibold text-foreground">{approvedRegistrations}</p>
            </div>
            <div className="rounded-3xl ph-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pagamento pendente</p>
              <p className="mt-3 text-3xl font-semibold text-foreground">{pendingPayments}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {registrations.map((registration) => {
              const payment = registration.payments[0] ?? null;
              const locationLabel = registration.tournament.location_name ?? registration.tournament.establishment?.name ?? null;
              const cityLabel = registration.tournament.city ?? registration.tournament.establishment?.address_text ?? null;
              const hasActivePayment = Boolean(
                payment &&
                isPendingPaymentStatus(payment.status) &&
                (!payment.expires_at || payment.expires_at > now)
              );
              const paymentLabel = !registration.tournament.entry_fee_cents
                ? "Gratuito"
                : registration.paid || payment?.status === PaymentStatus.PAID
                  ? "Pago"
                  : hasActivePayment
                    ? "Pagamento pendente"
                    : payment?.status === PaymentStatus.CANCELLED
                      ? "Pagamento cancelado"
                      : "Aguardando pagamento";
              const paymentClass = !registration.tournament.entry_fee_cents || registration.paid || payment?.status === PaymentStatus.PAID
                ? "bg-primary/15 text-primary"
                : hasActivePayment
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-secondary text-muted-foreground";

              return (
                <div
                  key={registration.id}
                  className={
                    "rounded-3xl ph-surface p-6 " +
                    (registration.id === highlightedRegistrationId ? "ring-2 ring-primary/40" : "")
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 gap-4">
                      {registration.tournament.cover_image_url ? (
                        <div className="hidden h-28 w-40 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted/30 sm:block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={registration.tournament.cover_image_url}
                            alt={registration.tournament.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : null}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${registrationStatusClass(registration.status)}`}>
                            {registrationStatusLabel(registration.status)}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tournamentStatusClass(registration.tournament.status)}`}>
                            {tournamentStatusLabel(registration.tournament.status)}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${paymentClass}`}>
                            {paymentLabel}
                          </span>
                        </div>

                        <h2 className="mt-3 text-xl font-semibold text-foreground">{registration.tournament.name}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Time {registration.team.name}
                          {registration.team.members[0]?.full_name ? ` • Capitão ${registration.team.members[0].full_name}` : ""}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {cityLabel ?? ""} {locationLabel ? `· ${locationLabel}` : ""}
                        </p>

                        <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Modalidade</p>
                            <p className="font-semibold text-foreground">{formatSportLabel(registration.tournament.sport_type)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Período</p>
                            <p className="font-semibold text-foreground">
                              {formatDateRange(registration.tournament.start_date, registration.tournament.end_date)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Taxa</p>
                            <p className="font-semibold text-foreground">{formatBRLFromCents(registration.tournament.entry_fee_cents)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Inscrito em</p>
                            <p className="font-semibold text-foreground">{formatDateTime(registration.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/torneios/${registration.tournament.id}`} className="ph-button-secondary-sm">
                        Acompanhar torneio
                      </Link>
                      {hasActivePayment && payment?.checkout_url ? (
                        <a
                          href={payment.checkout_url}
                          target="_blank"
                          rel="noreferrer"
                          className="ph-button-sm"
                        >
                          Pagar agora
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}

            {registrations.length === 0 ? (
              <div className="rounded-3xl ph-surface p-6">
                <p className="text-sm text-muted-foreground">Você ainda não inscreveu nenhum time em torneios.</p>
                <div className="mt-4">
                  <Link href="/torneios" className="ph-button-sm">
                    Ver torneios disponíveis
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}