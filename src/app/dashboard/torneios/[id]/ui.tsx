"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { setTournamentRegistrationStatus, setTournamentStatus } from "@/lib/actions/tournaments";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { formatSportLabel } from "@/lib/utils/sport";

export type DashboardTournamentDetailView = {
  id: string;
  name: string;
  sport_type: string;
  city: string | null;
  status: string;
  format: string;
  entry_fee_cents: number;
  team_size_min: number;
  team_size_max: number;
  max_teams: number;
  registered_teams: number;
  registrations: Array<{ id: string; team_name: string; captain_name: string; status: string; paid: boolean }>;
  matches: Array<{
    id: string;
    round: string;
    group_label: string | null;
    start_time: string;
    court_name: string;
    team_a: string;
    team_b: string;
  }>;
  finance: {
    received_cents: number;
    received_gross_cents: number;
    pending_cents: number;
    pending_gross_cents: number;
  };
};

type Props = {
  tournament: DashboardTournamentDetailView;
};

type TabKey = "overview" | "registrations" | "schedule" | "results" | "finance";

function statusLabel(status: string) {
  if (status === "OPEN") return "Inscricoes abertas";
  if (status === "RUNNING") return "Em andamento";
  if (status === "FINISHED") return "Finalizado";
  if (status === "CANCELLED") return "Cancelado";
  return "Rascunho";
}

function formatFormatLabel(value: string) {
  if (value === "GROUPS_KO") return "Grupos + mata-mata";
  if (value === "LEAGUE") return "Pontos corridos";
  if (value === "SINGLE_ELIM") return "Eliminatoria simples";
  if (value === "DOUBLE_ELIM") return "Eliminatoria dupla";
  return "Formato customizado";
}

export function DashboardTournamentDetailClient(props: Props) {
  const { tournament } = props;
  const [tab, setTab] = useState<TabKey>("overview");
  const [isPending, startTransition] = useTransition();
  const [currentStatus, setCurrentStatus] = useState(tournament.status);
  const [registrations, setRegistrations] = useState(tournament.registrations);

  const schedule = useMemo(() => tournament.matches, [tournament.matches]);

  const feeLabel = tournament.entry_fee_cents ? formatBRLFromCents(tournament.entry_fee_cents) : "Gratuito";

  function handleStatus(next: string) {
    startTransition(async () => {
      await setTournamentStatus({ tournamentId: tournament.id, status: next as "OPEN" | "RUNNING" | "FINISHED" | "CANCELLED" | "DRAFT" });
      setCurrentStatus(next);
    });
  }

  function handleRegistrationStatus(registrationId: string, status: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      await setTournamentRegistrationStatus({ registrationId, status });
      setRegistrations((current) =>
        current.map((item) => (item.id === registrationId ? { ...item, status } : item))
      );
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Torneio</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {tournament.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatSportLabel(tournament.sport_type)} · {tournament.city ?? "-"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ph-button-secondary-sm" disabled={isPending}>
            Gerar chaveamento
          </button>
          <button type="button" className="ph-button-secondary-sm" onClick={() => handleStatus("RUNNING")} disabled={isPending}>
            Publicar agenda
          </button>
          <Link href="/dashboard/torneios" className="ph-button-secondary-sm">
            Voltar
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {(
          [
            { key: "overview", label: "Resumo" },
            { key: "registrations", label: "Inscricoes" },
            { key: "schedule", label: "Agenda" },
            { key: "results", label: "Resultados" },
            { key: "finance", label: "Financeiro" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            className={
              tab === item.key
                ? "ph-button-secondary-sm"
                : "rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
            }
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-border bg-card/70 p-5 text-sm text-muted-foreground shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{statusLabel(currentStatus)}</p>
            <p className="mt-2">Formato: {formatFormatLabel(tournament.format)}</p>
          </div>
          <div className="rounded-3xl border border-border bg-card/70 p-5 text-sm text-muted-foreground shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Times</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {tournament.registered_teams}/{tournament.max_teams}
            </p>
            <p className="mt-2">Jogadores por time: {tournament.team_size_min}-{tournament.team_size_max}</p>
          </div>
          <div className="rounded-3xl border border-border bg-card/70 p-5 text-sm text-muted-foreground shadow-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Taxa</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{feeLabel}</p>
            <p className="mt-2">Pagamento via Asaas</p>
          </div>
        </div>
      ) : null}

      {tab === "registrations" ? (
        <div className="mt-6 rounded-3xl ph-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Inscricoes</h2>
            <button
              type="button"
              className="ph-button-secondary-sm"
              disabled={isPending}
              onClick={() => {
                registrations.forEach((item) => {
                  if (item.status !== "APPROVED") {
                    handleRegistrationStatus(item.id, "APPROVED");
                  }
                });
              }}
            >
              Aprovar todos
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {registrations.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground"
              >
                <div>
                  <p className="font-semibold text-foreground">{item.team_name}</p>
                  <p className="text-xs text-muted-foreground">Capitao: {item.captain_name}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
                    {item.status}
                  </span>
                  <span className="rounded-full bg-primary/100/15 px-3 py-1 text-xs text-primary dark:text-emerald-300">
                    {item.paid ? "Pago" : "Pendente"}
                  </span>
                  <button
                    type="button"
                    className="ph-button-secondary-xs"
                    onClick={() => handleRegistrationStatus(item.id, "APPROVED")}
                    disabled={isPending || item.status === "APPROVED"}
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    className="ph-button-secondary-xs"
                    onClick={() => handleRegistrationStatus(item.id, "REJECTED")}
                    disabled={isPending || item.status === "REJECTED"}
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))}
            {!registrations.length ? <p className="text-xs text-muted-foreground">Nenhuma inscrição no momento.</p> : null}
          </div>
        </div>
      ) : null}

      {tab === "schedule" ? (
        <div className="mt-6 rounded-3xl ph-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Agenda</h2>
            <button type="button" className="ph-button-secondary-sm" disabled={isPending}>
              Distribuir jogos
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {schedule.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground"
              >
                <div>
                  <p className="font-semibold text-foreground">
                    {item.team_a} x {item.team_b}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.court_name} {item.group_label ? `· ${item.group_label}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
                  {new Date(item.start_time).toLocaleDateString("pt-BR")} ·
                  {new Date(item.start_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
            {!schedule.length ? <p className="text-xs text-muted-foreground">Agenda ainda nao publicada.</p> : null}
          </div>
        </div>
      ) : null}

      {tab === "results" ? (
        <div className="mt-6 rounded-3xl ph-surface p-6">
          <h2 className="text-sm font-semibold text-foreground">Resultados</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Registre placares, estatisticas e publique a tabela.
          </p>
          <button type="button" className="ph-button-secondary-sm mt-4">
            Atualizar placar
          </button>
        </div>
      ) : null}

      {tab === "finance" ? (
        <div className="mt-6 rounded-3xl ph-surface p-6">
          <h2 className="text-sm font-semibold text-foreground">Financeiro</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Recebido (líquido)</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {formatBRLFromCents(tournament.finance.received_cents)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Bruto: {formatBRLFromCents(tournament.finance.received_gross_cents)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Pendente (líquido)</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {formatBRLFromCents(tournament.finance.pending_cents)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Bruto: {formatBRLFromCents(tournament.finance.pending_gross_cents)}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
