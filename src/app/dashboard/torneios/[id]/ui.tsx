"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, useCallback } from "react";

import {
  setTournamentRegistrationStatus,
  setTournamentStatus,
  updateTournament,
  cancelTournament,
  generateTournamentMatches,
  recordMatchScore,
} from "@/lib/actions/tournaments";
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
    status: string;
    court_name: string;
    team_a: string;
    team_b: string;
    score_a: number | null;
    score_b: number | null;
  }>;
  standings: Array<{
    teamId: string;
    teamName: string;
    points: number;
    wins: number;
    losses: number;
    goals: number;
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
  const [matches, setMatches] = useState(tournament.matches);
  const [standings, setStandings] = useState(tournament.standings);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(tournament.name);
  const [editMaxTeams, setEditMaxTeams] = useState(tournament.max_teams);
  const [error, setError] = useState<string | null>(null);
  const [scoreModal, setScoreModal] = useState<{ matchId: string; teamA: string; teamB: string } | null>(null);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  const schedule = useMemo(() => matches, [matches]);

  const feeLabel = tournament.entry_fee_cents ? formatBRLFromCents(tournament.entry_fee_cents) : "Gratuito";

  const canEdit = currentStatus === "DRAFT" || currentStatus === "OPEN";
  const canCancel = currentStatus !== "FINISHED" && currentStatus !== "CANCELLED";
  const canGenerate = currentStatus === "OPEN" || currentStatus === "RUNNING";

  function handleStatus(next: string) {
    setError(null);
    startTransition(async () => {
      try {
        await setTournamentStatus({ tournamentId: tournament.id, status: next as "OPEN" | "RUNNING" | "FINISHED" | "CANCELLED" | "DRAFT" });
        setCurrentStatus(next);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao alterar status");
      }
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

  function handleSaveEdit() {
    setError(null);
    startTransition(async () => {
      try {
        await updateTournament({ tournamentId: tournament.id, name: editName, max_teams: editMaxTeams });
        setEditOpen(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  function handleCancel() {
    if (!confirm("Tem certeza que deseja cancelar o torneio? Todos os inscritos serao notificados.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await cancelTournament({ tournamentId: tournament.id });
        setCurrentStatus("CANCELLED");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao cancelar");
      }
    });
  }

  const handleGenerate = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateTournamentMatches({ tournamentId: tournament.id });
        alert(`${result.count} partidas geradas com sucesso!`);
        window.location.reload();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao gerar partidas");
      }
    });
  }, [tournament.id]);

  function handleOpenScore(match: { id: string; team_a: string; team_b: string; score_a: number | null; score_b: number | null }) {
    setScoreA(match.score_a ?? 0);
    setScoreB(match.score_b ?? 0);
    setScoreModal({ matchId: match.id, teamA: match.team_a, teamB: match.team_b });
  }

  function handleSaveScore() {
    if (!scoreModal) return;
    setError(null);
    startTransition(async () => {
      try {
        await recordMatchScore({ matchId: scoreModal.matchId, teamAScore: scoreA, teamBScore: scoreB });
        setMatches((prev) => prev.map((m) =>
          m.id === scoreModal.matchId ? { ...m, score_a: scoreA, score_b: scoreB, status: "FINISHED" } : m
        ));
        setScoreModal(null);
        window.location.reload();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao salvar placar");
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-12">
      {error ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : null}

      {/* Score modal */}
      {scoreModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-card border border-border p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">Registrar placar</h3>
            <p className="mt-1 text-xs text-muted-foreground">{scoreModal.teamA} x {scoreModal.teamB}</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex-1">
                <label className="ph-label">{scoreModal.teamA}</label>
                <input type="number" min={0} className="ph-input mt-1" value={scoreA} onChange={(e) => setScoreA(Number(e.target.value))} />
              </div>
              <span className="mt-6 text-lg font-bold text-muted-foreground">x</span>
              <div className="flex-1">
                <label className="ph-label">{scoreModal.teamB}</label>
                <input type="number" min={0} className="ph-input mt-1" value={scoreB} onChange={(e) => setScoreB(Number(e.target.value))} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="ph-button-secondary-sm" onClick={() => setScoreModal(null)} disabled={isPending}>Cancelar</button>
              <button type="button" className="ph-button-primary-sm" onClick={handleSaveScore} disabled={isPending}>Salvar</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit modal */}
      {editOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-card border border-border p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">Editar torneio</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="ph-label">Nome</label>
                <input type="text" className="ph-input mt-1" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <label className="ph-label">Maximo de times</label>
                <input type="number" min={2} className="ph-input mt-1" value={editMaxTeams} onChange={(e) => setEditMaxTeams(Number(e.target.value))} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="ph-button-secondary-sm" onClick={() => setEditOpen(false)} disabled={isPending}>Cancelar</button>
              <button type="button" className="ph-button-primary-sm" onClick={handleSaveEdit} disabled={isPending}>Salvar</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Torneio</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {tournament.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatSportLabel(tournament.sport_type)} · {tournament.city ?? "-"} · {statusLabel(currentStatus)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <button type="button" className="ph-button-secondary-sm" onClick={() => setEditOpen(true)} disabled={isPending}>
              Editar
            </button>
          ) : null}
          {canGenerate ? (
            <button type="button" className="ph-button-secondary-sm" onClick={handleGenerate} disabled={isPending}>
              Gerar chaveamento
            </button>
          ) : null}
          {currentStatus === "OPEN" ? (
            <button type="button" className="ph-button-secondary-sm" onClick={() => handleStatus("RUNNING")} disabled={isPending}>
              Iniciar torneio
            </button>
          ) : null}
          {currentStatus === "RUNNING" ? (
            <button type="button" className="ph-button-secondary-sm" onClick={() => handleStatus("FINISHED")} disabled={isPending}>
              Finalizar
            </button>
          ) : null}
          {canCancel ? (
            <button type="button" className="ph-button-secondary-sm text-red-500" onClick={handleCancel} disabled={isPending}>
              Cancelar torneio
            </button>
          ) : null}
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
            {canGenerate ? (
              <button type="button" className="ph-button-secondary-sm" onClick={handleGenerate} disabled={isPending}>
                Gerar/Regerar partidas
              </button>
            ) : null}
          </div>
          <div className="mt-4 space-y-3">
            {schedule.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground"
              >
                <div>
                  <p className="font-semibold text-foreground">
                    {item.team_a} {item.score_a != null ? item.score_a : ""} x {item.score_b != null ? item.score_b : ""} {item.team_b}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.round} · {item.court_name} {item.group_label ? `· ${item.group_label}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs ${item.status === "FINISHED" ? "bg-emerald-500/15 text-emerald-600" : "bg-secondary/60 text-muted-foreground"}`}>
                    {item.status === "FINISHED" ? "Finalizada" : item.status === "CANCELLED" ? "Cancelada" : new Date(item.start_time).toLocaleDateString("pt-BR") + " " + new Date(item.start_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {item.status !== "CANCELLED" ? (
                    <button type="button" className="ph-button-secondary-xs" onClick={() => handleOpenScore(item)} disabled={isPending}>
                      {item.score_a != null ? "Editar placar" : "Placar"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {!schedule.length ? <p className="text-xs text-muted-foreground">Agenda ainda nao publicada. Gere o chaveamento primeiro.</p> : null}
          </div>
        </div>
      ) : null}

      {tab === "results" ? (
        <div className="mt-6 rounded-3xl ph-surface p-6">
          <h2 className="text-sm font-semibold text-foreground">Classificacao</h2>
          {standings.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4">#</th>
                    <th className="pb-2 pr-4">Time</th>
                    <th className="pb-2 pr-4 text-center">Pts</th>
                    <th className="pb-2 pr-4 text-center">V</th>
                    <th className="pb-2 pr-4 text-center">D</th>
                    <th className="pb-2 text-center">Gols</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, idx) => (
                    <tr key={s.teamId} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-semibold text-foreground">{idx + 1}</td>
                      <td className="py-2 pr-4 text-foreground">{s.teamName}</td>
                      <td className="py-2 pr-4 text-center font-semibold text-foreground">{s.points}</td>
                      <td className="py-2 pr-4 text-center text-emerald-600">{s.wins}</td>
                      <td className="py-2 pr-4 text-center text-red-500">{s.losses}</td>
                      <td className="py-2 text-center text-muted-foreground">{s.goals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Nenhum resultado registrado ainda. Registre placares na aba Agenda.
            </p>
          )}
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
