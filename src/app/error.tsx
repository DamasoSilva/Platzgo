"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <h1 className="text-4xl font-bold text-foreground">Ops, algo deu errado</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Ocorreu um erro inesperado. Tente novamente ou volte para a página inicial.
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
