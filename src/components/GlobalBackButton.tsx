"use client";

import { usePathname, useRouter } from "next/navigation";

export function GlobalBackButton() {
  const router = useRouter();
  const pathname = usePathname();

  // A home é a "página 0"; não faz sentido mostrar Voltar.
  if (pathname === "/") return null;

  function onBack() {
    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
        return;
      }
    } catch {
      // ignore
    }

    router.push("/");
  }

  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Voltar"
      className="fixed left-4 top-4 z-[60] inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/60 bg-card/80 px-4 text-sm font-semibold text-foreground backdrop-blur transition hover:bg-card focus:outline-none focus:ring-2 focus:ring-primary md:left-6 md:top-6"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="opacity-95"
      >
        <path
          d="M15 18L9 12L15 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="hidden sm:block">Voltar</span>
    </button>
  );
}
