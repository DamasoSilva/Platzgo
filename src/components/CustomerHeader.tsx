"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSession, signOut } from "next-auth/react";
import type { Role } from "@/generated/prisma/enums";

type Props = {
  variant?: "dark" | "light";
  viewer?: {
    isLoggedIn: boolean;
    name?: string | null;
    image?: string | null;
    role?: Role | null;
  };
  subtitle?: string;
  rightSlot?: React.ReactNode;
  homeHref?: string;
  signInCallbackUrl?: string;
};

function firstTwoNames(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.slice(0, 2).join(" ");
}

function initials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  const a = parts[0]?.[0] ?? "U";
  const b = parts.length > 1 ? parts[1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}

export function CustomerHeader(props: Props) {
  const variant = props.variant ?? "light";
  const isLoggedIn = Boolean(props.viewer?.isLoggedIn);
  const role = props.viewer?.role ?? null;
  const router = useRouter();
  const pathname = usePathname();

  // Proteção contra BFCache (voltar do navegador após logout).
  // Se a rota for protegida e não houver mais sessão, força login.
  // Isso evita o cenário de "parecer logado" por HTML restaurado.
  useEffect(() => {
    if (typeof window === "undefined") return;

    async function ensureAuthIfProtected() {
      try {
        const p = window.location.pathname;
        const isProtected = p.startsWith("/meus-agendamentos") || p.startsWith("/perfil") || p.startsWith("/dashboard");
        if (!isProtected) return;

        const session = await getSession();
        if (!session?.user?.id) {
          const cb = window.location.pathname + window.location.search;
          window.location.replace(`/signin?callbackUrl=${encodeURIComponent(cb)}`);
        }
      } catch {
        // noop
      }
    }

    ensureAuthIfProtected();

    function onPageShow() {
      ensureAuthIfProtected();
    }

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const baseHomeHref =
    props.homeHref ??
    (!isLoggedIn
      ? "/"
      : role === "ADMIN"
        ? "/dashboard"
        : role === "SYSADMIN"
          ? "/sysadmin"
          : "/");

  const homeHref = baseHomeHref;
  const showHomeButton = pathname !== homeHref;

  function getLastSearchHref(): string | null {
    if (!isLoggedIn) return null;
    if (props.homeHref) return null;
    if (role !== "CUSTOMER") return null;
    try {
      const v = window.localStorage.getItem("ph:lastSearchHref");
      if (typeof v === "string" && (v === "/" || v.startsWith("/?") || v.startsWith("/search"))) return v;
      return null;
    } catch {
      return null;
    }
  }

  function onHomeClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const last = getLastSearchHref();
    if (!last) return;
    if (last === homeHref) return;
    e.preventDefault();
    router.push(last);
  }

  const signInCallbackUrl = props.signInCallbackUrl ?? "/";

  const signOutCallbackUrl = role === "ADMIN" ? "/signin?logout=1&callbackUrl=%2Fdashboard" : "/signin?logout=1&callbackUrl=%2F";

  const [open, setOpen] = useState(false);

  const name = useMemo(() => firstTwoNames(props.viewer?.name), [props.viewer?.name]);
  const avatarInitials = useMemo(() => initials(props.viewer?.name), [props.viewer?.name]);

  const baseText = variant === "dark" ? "text-white" : "text-zinc-900 dark:text-zinc-50";
  const subText = variant === "dark" ? "text-zinc-300" : "text-zinc-600 dark:text-zinc-400";
  const pill =
    variant === "dark"
      ? "inline-flex h-10 items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 text-sm text-white backdrop-blur hover:bg-white/10 dark:hover:bg-white/20"
      : "inline-flex h-10 items-center justify-center rounded-full border border-zinc-200 bg-white px-4 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800";

  return (
    <header
      className={
        "sticky top-0 z-40 w-full border-b backdrop-blur shadow-sm " +
        (variant === "dark"
          ? "border-white/10 bg-black/65 text-white"
          : "border-zinc-200 bg-white/85 text-zinc-900 dark:border-white/10 dark:bg-[#121212]/85")
      }
    >
      <div className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
        <div>
        <Link href={homeHref} onClick={onHomeClick} className={"flex items-center gap-3 text-lg font-semibold tracking-tight " + baseText}>
          <span className="relative h-12 w-24 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo" alt="PlatzGo!" className="h-full w-full object-contain" />
          </span>
        </Link>
        <p className={"text-xs font-semibold " + subText}>{props.subtitle ?? "A partida começa AQUI"}</p>
        </div>

        <div className="flex items-center gap-3">
        {props.rightSlot ? <div className="flex items-center gap-3">{props.rightSlot}</div> : null}

        {isLoggedIn && role === "CUSTOMER" ? (
          <Link href="/sorteio-times" className={"sm:hidden " + pill}>
            Sorteio
          </Link>
        ) : null}

        {isLoggedIn && role === "CUSTOMER" ? (
          <div className="hidden items-center gap-2 sm:flex">
            <Link href="/meus-agendamentos" className={pill}>
              Meus agendamentos
            </Link>
            <Link href="/sorteio-times" className={pill}>
              Sorteio de times
            </Link>
          </div>
        ) : null}

        {!isLoggedIn ? (
          <Link href={`/signin?callbackUrl=${encodeURIComponent(signInCallbackUrl)}`} className={pill}>
            Entrar
          </Link>
        ) : (
          <div className="relative">
            <button
              type="button"
              className={
                variant === "dark"
                    ? "flex h-10 items-center gap-3 rounded-full border border-white/15 bg-white/5 px-4 text-sm text-white backdrop-blur hover:bg-white/10 dark:hover:bg-white/20"
                  : "flex h-10 items-center gap-3 rounded-full border border-zinc-200 bg-white px-4 text-sm text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              }
              onClick={() => setOpen((s) => !s)}
            >
              <span className="hidden sm:block font-semibold">{name || "Usuário"}</span>
              <span className="relative h-8 w-8 overflow-hidden rounded-full bg-white/10">
                {props.viewer?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={props.viewer.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span
                    className={
                      "flex h-full w-full items-center justify-center text-xs font-bold " +
                      (variant === "dark" ? "text-white" : "text-zinc-900 dark:text-zinc-50")
                    }
                  >
                    {avatarInitials}
                  </span>
                )}
              </span>
            </button>

            {open ? (
              <div
                className={
                  "absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border shadow-xl " +
                  (variant === "dark"
                    ? "border-white/10 bg-black/60 text-white backdrop-blur"
                    : "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100")
                }
                onMouseLeave={() => setOpen(false)}
              >
                {role === "SYSADMIN" ? (
                  <>
                    <Link href="/sysadmin" className="block px-4 py-3 text-sm hover:bg-white/10 dark:hover:bg-white/5" onClick={() => setOpen(false)}>
                      Painel do sysadmin
                    </Link>
                    <Link href="/dashboard/admin" className="block px-4 py-3 text-sm hover:bg-white/10 dark:hover:bg-white/5" onClick={() => setOpen(false)}>
                      Painel do administrador
                    </Link>
                    <Link href="/" className="block px-4 py-3 text-sm hover:bg-white/10 dark:hover:bg-white/5" onClick={() => setOpen(false)}>
                      Ver como cliente
                    </Link>
                  </>
                ) : null}

                <Link href="/perfil" className="block px-4 py-3 text-sm hover:bg-white/10 dark:hover:bg-white/5" onClick={() => setOpen(false)}>
                  Meu perfil
                </Link>
                <Link
                  href="/meus-agendamentos"
                  className="block px-4 py-3 text-sm hover:bg-white/10 dark:hover:bg-white/5"
                  onClick={() => setOpen(false)}
                >
                  Meus agendamentos
                </Link>
                {role === "CUSTOMER" ? (
                  <Link
                    href="/sorteio-times"
                    className="block px-4 py-3 text-sm hover:bg-white/10 dark:hover:bg-white/5"
                    onClick={() => setOpen(false)}
                  >
                    Sorteio de times
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="block w-full px-4 py-3 text-left text-sm hover:bg-white/10 dark:hover:bg-white/5"
                  onClick={() => signOut({ callbackUrl: signOutCallbackUrl })}
                >
                  Sair
                </button>
              </div>
            ) : null}
          </div>
        )}

        {showHomeButton ? (
          <Link
            href={homeHref}
            onClick={onHomeClick}
            className={
              "inline-flex h-10 items-center justify-center rounded-full bg-[#CCFF00] px-5 text-sm font-bold text-black transition-all hover:scale-105"
            }
          >
            Início
          </Link>
        ) : null}
        </div>
      </div>
    </header>
  );
}
