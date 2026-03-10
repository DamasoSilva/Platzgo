"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { registerTeamForTournament } from "@/lib/actions/tournaments";
import { formatBRLFromCents } from "@/lib/utils/currency";

export type TournamentRegistrationView = {
  id: string;
  name: string;
  location_name: string | null;
  city: string | null;
  entry_fee_cents: number;
  team_size_min: number;
  team_size_max: number;
  categories: string[];
};

type Props = {
  tournament: TournamentRegistrationView;
};

type PlayerForm = {
  id: string;
  fullName: string;
  documentId: string;
};

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function createPlayer(): PlayerForm {
  return { id: makeId("player"), fullName: "", documentId: "" };
}

export function TournamentRegistrationClient(props: Props) {
  const { tournament } = props;

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [teamName, setTeamName] = useState("");
  const [category, setCategory] = useState(tournament.categories[0] ?? "");
  const [teamSize, setTeamSize] = useState(tournament.team_size_min);

  const [players, setPlayers] = useState<PlayerForm[]>(() =>
    Array.from({ length: tournament.team_size_min }, () => createPlayer())
  );

  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [pixPayload, setPixPayload] = useState<string | null>(null);
  const [pixQrBase64, setPixQrBase64] = useState<string | null>(null);
  const [pixExpiresAt, setPixExpiresAt] = useState<string | null>(null);
  const [pixCheckoutUrl, setPixCheckoutUrl] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const isLocked = Boolean(registrationId) || isPending;

  useEffect(() => {
    setPlayers((current) => {
      if (teamSize === current.length) return current;
      if (teamSize > current.length) {
        return [...current, ...Array.from({ length: teamSize - current.length }, () => createPlayer())];
      }
      return current.slice(0, teamSize);
    });
  }, [teamSize]);

  const feeLabel = tournament.entry_fee_cents ? formatBRLFromCents(tournament.entry_fee_cents) : "Gratuito";
  const isFree = tournament.entry_fee_cents === 0;

  const canAdvance = useMemo(() => {
    if (step === 0) return teamName.trim().length > 2 && teamSize >= tournament.team_size_min;
    if (step === 1) return players.every((p) => p.fullName.trim() && p.documentId.trim());
    if (step === 2) return tournament.entry_fee_cents === 0 || Boolean(pixPayload);
    return false;
  }, [step, teamName, teamSize, players, pixPayload, tournament.entry_fee_cents, tournament.team_size_min]);

  function nextStep() {
    setError(null);
    if (!canAdvance) {
      setError("Preencha os campos obrigatorios para continuar.");
      return;
    }
    setStep((current) => Math.min(2, current + 1));
  }

  function prevStep() {
    setError(null);
    setStep((current) => Math.max(0, current - 1));
  }

  function updatePlayer(id: string, field: "fullName" | "documentId", value: string) {
    setPlayers((current) => current.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  }

  function handleGeneratePix() {
    setError(null);
    setPixCopied(null);
    if (registrationId) return;

    const payloadPlayers = players.map((player) => ({
      fullName: player.fullName,
      documentId: player.documentId,
    }));

    startTransition(async () => {
      try {
        const result = await registerTeamForTournament({
          tournamentId: tournament.id,
          teamName,
          categoryLabel: category || undefined,
          players: payloadPlayers,
        });

        setRegistrationId(result.registrationId);
        if (result.payment) {
          setPixPayload(result.payment.pixPayload);
          setPixQrBase64(result.payment.pixQrBase64);
          setPixExpiresAt(result.payment.expiresAt);
          setPixCheckoutUrl(result.payment.checkoutUrl);
        } else {
          setIsConfirmed(true);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Nao foi possivel gerar o pagamento";
        setError(message);
      }
    });
  }

  async function handleCopyPix() {
    if (!pixPayload) return;
    try {
      await navigator.clipboard.writeText(pixPayload);
      setPixCopied("Payload copiado");
    } catch {
      setPixCopied("Nao foi possivel copiar");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Inscricao do time
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {tournament.name} · {(tournament.location_name ?? tournament.city ?? "-")}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
          Taxa: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{feeLabel}</span>
        </div>
      </div>

      <div className="mt-6 rounded-3xl ph-surface p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          <span className={step === 0 ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500"}>1. Time</span>
          <span>•</span>
          <span className={step === 1 ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500"}>2. Jogadores</span>
          <span>•</span>
          <span className={step === 2 ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500"}>3. Pagamento</span>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
            {error}
          </div>
        ) : null}

        {step === 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Nome do time
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="ph-input mt-2"
                disabled={isLocked}
              />
            </label>

            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Categoria
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="ph-select mt-2"
                disabled={isLocked}
              >
                {tournament.categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Jogadores por time
              <input
                type="number"
                min={tournament.team_size_min}
                max={tournament.team_size_max}
                value={teamSize}
                onChange={(e) => setTeamSize(Number(e.target.value))}
                className="ph-input mt-2"
                disabled={isLocked}
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                Minimo {tournament.team_size_min} · Maximo {tournament.team_size_max}
              </span>
            </label>

            <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/70">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">Requisitos do torneio</p>
              <p className="mt-2">Todos os jogadores devem informar nome completo e documento.</p>
              <p className="mt-2">O pagamento confirma a inscricao do time.</p>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Jogadores</h2>
              <span className="text-xs text-zinc-500">{players.length} / {teamSize}</span>
            </div>

            <div className="mt-4 grid gap-3">
              {players.map((player, index) => (
                <div key={player.id} className="rounded-2xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/70">
                  <p className="text-xs font-semibold text-zinc-500">Jogador {index + 1}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input
                      className="ph-input"
                      placeholder="Nome completo"
                      value={player.fullName}
                      onChange={(e) => updatePlayer(player.id, "fullName", e.target.value)}
                      disabled={isLocked}
                    />
                    <input
                      className="ph-input"
                      placeholder="Documento (CPF/RG)"
                      value={player.documentId}
                      onChange={(e) => updatePlayer(player.id, "documentId", e.target.value)}
                      disabled={isLocked}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-3xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-950/60">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pagamento via PIX (Asaas)</h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                {isFree ? "Inscricao gratuita. Confirme o cadastro do time." : "Gere o payload para liberar o cadastro do time."}
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="ph-button-secondary-sm"
                  onClick={handleGeneratePix}
                  disabled={isPending || Boolean(registrationId)}
                >
                  {isFree ? "Confirmar inscricao" : "Gerar payload"}
                </button>
                {pixPayload ? (
                  <button type="button" className="ph-button-secondary-sm" onClick={handleCopyPix}>
                    Copiar payload
                  </button>
                ) : null}
              </div>

              {pixCopied ? <p className="mt-3 text-xs text-zinc-500">{pixCopied}</p> : null}

              {pixPayload ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200">
                  <p className="font-semibold">Payload</p>
                  <p className="mt-2 break-all">{pixPayload}</p>
                  {pixExpiresAt ? (
                    <p className="mt-2 text-[11px] text-zinc-500">Expira em: {pixExpiresAt}</p>
                  ) : null}
                  {pixCheckoutUrl ? (
                    <p className="mt-2 text-[11px] text-zinc-500">Checkout: {pixCheckoutUrl}</p>
                  ) : null}
                </div>
              ) : null}

              {pixPayload ? (
                pixQrBase64 ? (
                  <div className="mt-4 flex justify-center rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-6 dark:border-zinc-700 dark:bg-zinc-900/50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/png;base64,${pixQrBase64}`}
                      alt="QR Code PIX"
                      className="h-40 w-40"
                    />
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50">
                    QR Code gerado (preview)
                  </div>
                )
              ) : null}
            </div>

            <div className="rounded-3xl border border-zinc-200 bg-white/80 p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Resumo do time</h3>
              <div className="mt-3 space-y-2">
                <p>
                  <span className="font-semibold">Time:</span> {teamName || "-"}
                </p>
                <p>
                  <span className="font-semibold">Categoria:</span> {category}
                </p>
                <p>
                  <span className="font-semibold">Jogadores:</span> {players.length}
                </p>
                <p>
                  <span className="font-semibold">Taxa:</span> {feeLabel}
                </p>
              </div>

              <button
                type="button"
                className="ph-button mt-6 w-full"
                disabled={isFree ? !registrationId : !pixPayload}
                onClick={() => setIsConfirmed(true)}
              >
                Confirmar inscricao
              </button>

              {isConfirmed ? (
                <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-200">
                  Inscricao confirmada. O time sera liberado apos validacao do pagamento.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            className="ph-button-secondary-sm"
            onClick={prevStep}
            disabled={step === 0 || isPending}
          >
            Voltar
          </button>
          {step < 2 ? (
            <button type="button" className="ph-button-sm" onClick={nextStep} disabled={isPending}>
              Proximo
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
