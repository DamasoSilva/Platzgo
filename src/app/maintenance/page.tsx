import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PlatzGo! • Manutencao",
  description: "Estamos preparando novidades. Voltamos em breve.",
};

export default function MaintenancePage() {
  return (
    <main className="min-h-screen bg-[#121212] text-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.35em] text-zinc-300">
          PlatzGo! em manutencao
        </div>
        <h1 className="text-3xl font-semibold sm:text-4xl">
          Estamos atualizando a plataforma agora.
        </h1>
        <p className="text-base text-zinc-300 sm:text-lg">
          Em instantes tudo volta ao normal. Obrigado pela paciencia.
        </p>
      </div>
    </main>
  );
}
