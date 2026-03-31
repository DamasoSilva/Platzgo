import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <h1 className="text-6xl font-black text-primary">404</h1>
      <h2 className="text-2xl font-bold text-foreground">Página não encontrada</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        O endereço que você acessou não existe ou foi removido.
      </p>
      <Link
        href="/"
        className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
