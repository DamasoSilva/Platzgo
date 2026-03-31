"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { acceptTournamentInvitation } from "@/lib/actions/tournaments";

export default function TournamentInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ tournamentId: string; tournamentName: string } | null>(null);

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await acceptTournamentInvitation({ token: params.token });
        if (result.ok) {
          setSuccess({ tournamentId: result.tournamentId!, tournamentName: result.tournamentName! });
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao aceitar convite");
      }
    });
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card/70 p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Convite para torneio</h1>

        {success ? (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              Convite aceito para o torneio <span className="font-semibold text-foreground">{success.tournamentName}</span>.
            </p>
            <button
              type="button"
              className="ph-button-primary-sm mt-4"
              onClick={() => router.push(`/torneios/${success.tournamentId}`)}
            >
              Ir para o torneio
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">
              Voce recebeu um convite para participar de um torneio privado. Aceite para iniciar sua inscricao.
            </p>

            {error ? (
              <p className="mt-3 text-sm text-red-500">{error}</p>
            ) : null}

            <button
              type="button"
              className="ph-button-primary-sm mt-4"
              onClick={handleAccept}
              disabled={isPending}
            >
              {isPending ? "Processando..." : "Aceitar convite"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
