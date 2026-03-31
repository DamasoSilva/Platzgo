"use client";

import { useEffect } from "react";

export default function BookingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[BookingsError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-bold text-foreground">Erro nos agendamentos</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Não foi possível carregar seus agendamentos. Tente novamente.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Tentar novamente
        </button>
        <a
          href="/"
          className="rounded-full border border-border bg-card px-6 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          Página inicial
        </a>
      </div>
    </div>
  );
}
