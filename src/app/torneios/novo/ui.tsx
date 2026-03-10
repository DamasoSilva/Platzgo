"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createInternalTournament } from "@/lib/actions/tournaments";

type PlayerForm = {
  id: string;
  fullName: string;
  documentId: string;
};

type TeamForm = {
  id: string;
  name: string;
  players: PlayerForm[];
};

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function createPlayer(): PlayerForm {
  return { id: makeId("player"), fullName: "", documentId: "" };
}

function createTeam(name = ""): TeamForm {
  return { id: makeId("team"), name, players: [createPlayer(), createPlayer()] };
}

export function InternalTournamentCreateClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sport, setSport] = useState("FUTSAL");
  const [date, setDate] = useState("");
  const [teamSize, setTeamSize] = useState(6);
  const [rules, setRules] = useState("");

  const [teams, setTeams] = useState<TeamForm[]>([createTeam("Time A"), createTeam("Time B")]);
  const [invites, setInvites] = useState<string[]>([""]);

  const inviteLink = createdId ? `/torneios/${createdId}` : "Salve o torneio para gerar o link.";

  function addTeam() {
    setTeams((current) => [...current, createTeam(`Time ${current.length + 1}`)]);
  }

  function removeTeam(id: string) {
    setTeams((current) => (current.length <= 2 ? current : current.filter((team) => team.id !== id)));
  }

  function updateTeam(id: string, value: string) {
    setTeams((current) => current.map((team) => (team.id === id ? { ...team, name: value } : team)));
  }

  function addPlayer(teamId: string) {
    setTeams((current) =>
      current.map((team) => (team.id === teamId ? { ...team, players: [...team.players, createPlayer()] } : team))
    );
  }

  function updatePlayer(teamId: string, playerId: string, field: "fullName" | "documentId", value: string) {
    setTeams((current) =>
      current.map((team) =>
        team.id === teamId
          ? {
              ...team,
              players: team.players.map((player) =>
                player.id === playerId ? { ...player, [field]: value } : player
              ),
            }
          : team
      )
    );
  }

  function removePlayer(teamId: string, playerId: string) {
    setTeams((current) =>
      current.map((team) =>
        team.id === teamId ? { ...team, players: team.players.filter((p) => p.id !== playerId) } : team
      )
    );
  }

  function updateInvite(index: number, value: string) {
    setInvites((current) => current.map((item, idx) => (idx === index ? value : item)));
  }

  function addInvite() {
    setInvites((current) => [...current, ""]);
  }

  function submitTournament(status: "DRAFT" | "OPEN") {
    setError(null);
    startTransition(async () => {
      try {
        if (!name.trim()) throw new Error("Nome do torneio e obrigatorio");
        if (!date) throw new Error("Data do torneio e obrigatoria");

        const result = await createInternalTournament({
          name,
          sport_type: sport as "FUTSAL" | "SOCIETY" | "BEACH_TENNIS" | "PADEL",
          start_date: date,
          team_size: teamSize,
          rules,
          teams: teams.map((team) => ({
            name: team.name,
            players: team.players.map((player) => ({
              fullName: player.fullName,
              documentId: player.documentId,
            })),
          })),
          invites: invites.filter((item) => item.trim()),
          status: status as "DRAFT" | "OPEN",
        });

        setCreatedId(result.id);
        if (status === "OPEN") {
          router.push(`/torneios/${result.id}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Nao foi possivel criar o torneio";
        setError(message);
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Criar torneio interno
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Convide amigos, monte os times e organize a agenda.
          </p>
        </div>
        <button type="button" className="ph-button-secondary" onClick={() => submitTournament("DRAFT")} disabled={isPending}>
          Salvar rascunho
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="ph-card p-6">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Detalhes do torneio</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Nome do torneio
                <input value={name} onChange={(e) => setName(e.target.value)} className="ph-input mt-2" disabled={isPending} />
              </label>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Modalidade
                <select value={sport} onChange={(e) => setSport(e.target.value)} className="ph-select mt-2" disabled={isPending}>
                  <option value="FUTSAL">Futsal</option>
                  <option value="SOCIETY">Society</option>
                  <option value="BEACH_TENNIS">Beach Tennis</option>
                  <option value="PADEL">Padel</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Data
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="ph-input mt-2"
                  disabled={isPending}
                />
              </label>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Jogadores por time
                <input
                  type="number"
                  min={2}
                  max={15}
                  value={teamSize}
                  onChange={(e) => setTeamSize(Number(e.target.value))}
                  className="ph-input mt-2"
                  disabled={isPending}
                />
              </label>
            </div>
            <label className="mt-4 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Regras basicas
              <textarea
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                className="ph-textarea mt-2"
                rows={4}
                placeholder="Descreva duracao, desempate e outras regras."
                disabled={isPending}
              />
            </label>
          </section>

          <section className="ph-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Times e jogadores</h2>
              <button type="button" className="ph-button-secondary-sm" onClick={addTeam}>
                Adicionar time
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">Recomendado: {teamSize} jogadores por time.</p>

            <div className="mt-4 space-y-4">
              {teams.map((team) => (
                <div key={team.id} className="rounded-3xl border border-zinc-200 bg-white/70 p-5 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <input
                      value={team.name}
                      onChange={(e) => updateTeam(team.id, e.target.value)}
                      className="ph-input max-w-xs"
                      placeholder="Nome do time"
                      disabled={isPending}
                    />
                    <button type="button" className="ph-button-secondary-xs" onClick={() => removeTeam(team.id)}>
                      Remover time
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {team.players.map((player, index) => (
                      <div key={player.id} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <input
                          className="ph-input"
                          placeholder={`Jogador ${index + 1}`}
                          value={player.fullName}
                          onChange={(e) => updatePlayer(team.id, player.id, "fullName", e.target.value)}
                          disabled={isPending}
                        />
                        <input
                          className="ph-input"
                          placeholder="Documento"
                          value={player.documentId}
                          onChange={(e) => updatePlayer(team.id, player.id, "documentId", e.target.value)}
                          disabled={isPending}
                        />
                        <button type="button" className="ph-button-secondary-xs" onClick={() => removePlayer(team.id, player.id)}>
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>

                  <button type="button" className="ph-button-secondary-xs mt-4" onClick={() => addPlayer(team.id)} disabled={isPending}>
                    Adicionar jogador
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-zinc-200 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Convites</h3>
            <p className="mt-2 text-xs text-zinc-500">Envie convite por link, email ou WhatsApp.</p>

            <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200">
              Link do convite
              <p className="mt-2 break-all text-[11px] text-zinc-500">{inviteLink}</p>
            </div>

            <div className="mt-4 space-y-3">
              {invites.map((value, index) => (
                <input
                  key={`invite-${index}`}
                  className="ph-input"
                  placeholder="Email ou telefone"
                  value={value}
                  onChange={(e) => updateInvite(index, e.target.value)}
                  disabled={isPending}
                />
              ))}
            </div>

            <button type="button" className="ph-button-secondary-xs mt-4" onClick={addInvite} disabled={isPending}>
              Adicionar convite
            </button>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white/80 p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Resumo</h3>
            <div className="mt-3 space-y-2">
              <p>
                <span className="font-semibold">Times:</span> {teams.length}
              </p>
              <p>
                <span className="font-semibold">Jogadores:</span> {teams.reduce((acc, team) => acc + team.players.length, 0)}
              </p>
              <p>
                <span className="font-semibold">Convites:</span> {invites.filter(Boolean).length}
              </p>
            </div>
            <button type="button" className="ph-button mt-6 w-full" onClick={() => submitTournament("OPEN")} disabled={isPending}>
              Publicar torneio interno
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
