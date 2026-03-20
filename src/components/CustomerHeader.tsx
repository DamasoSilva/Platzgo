"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, signOut } from "next-auth/react";
import type { Role } from "@/generated/prisma/enums";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

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
  const variant = props.variant ?? "dark";
  const isLoggedIn = Boolean(props.viewer?.isLoggedIn);
  const role = props.viewer?.role ?? null;
  const router = useRouter();

  // Protecao contra BFCache (voltar do navegador apos logout).
  // Se a rota for protegida e nao houver mais sessao, força login.
  // Isso evita o cenario de "parecer logado" por HTML restaurado.
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
  const [menuOpen, setMenuOpen] = useState(false);

  const name = useMemo(() => firstTwoNames(props.viewer?.name), [props.viewer?.name]);
  const avatarInitials = useMemo(() => initials(props.viewer?.name), [props.viewer?.name]);

  const pill = "text-sm text-muted-foreground hover:text-foreground transition-colors";
  const menuItem = "block px-4 py-3 text-sm text-foreground hover:bg-secondary/60 transition-colors";

  const links = [
    { label: "Início", href: "/" },
    { label: "Agendar", href: "/#busca" },
    { label: "Sorteio de times", href: "/sorteio-times" },
    { label: "Torneios", href: "/torneios" },
    { label: "Como funciona", href: "/#como-funciona" },
    { label: "Contato", href: "/#contato" },
  ];
  const ctaHref = "/#busca";
  const ctaLabel = "Agendar agora";

  const headerClass =
    variant === "light"
      ? "fixed top-0 left-0 right-0 z-50 bg-card/90 text-foreground backdrop-blur border-b border-border"
      : "fixed top-0 left-0 right-0 z-50 glass";

  return (
    <header className={headerClass}>
      <nav className="container flex items-center justify-between h-16">
        <Link href={homeHref} onClick={onHomeClick} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center font-display font-bold text-primary-foreground text-sm">
            P
          </div>
          <span className="font-display font-bold text-xl tracking-tight">
            Platz<span className="gradient-text">Go!</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <Link key={link.label} href={link.href} className={pill}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {props.rightSlot ? <div className="hidden items-center gap-3 sm:flex">{props.rightSlot}</div> : null}

          <Link
            href={ctaHref}
            className="hidden sm:inline-flex gradient-primary text-primary-foreground font-semibold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            {ctaLabel}
          </Link>

          {!isLoggedIn ? (
            <Link
              href={`/signin?callbackUrl=${encodeURIComponent(signInCallbackUrl)}`}
              className="hidden sm:inline-flex border border-border bg-card/50 text-foreground font-medium text-sm px-5 py-2.5 rounded-lg hover:bg-card transition-colors"
            >
              Entrar
            </Link>
          ) : (
            <div className="relative hidden sm:block">
              <button
                type="button"
                className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-4 py-2 text-sm text-foreground backdrop-blur hover:bg-card transition-colors"
                onClick={() => setOpen((s) => !s)}
              >
                <span className="hidden sm:block font-semibold">{name || "Usuário"}</span>
                <span className="relative h-8 w-8 overflow-hidden rounded-full bg-secondary">
                  {props.viewer?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={props.viewer.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs font-bold text-foreground">
                      {avatarInitials}
                    </span>
                  )}
                </span>
              </button>

              {open ? (
                <div
                  className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-card/90 text-foreground shadow-xl backdrop-blur"
                  onMouseLeave={() => setOpen(false)}
                >
                  {role === "SYSADMIN" ? (
                    <>
                      <Link href="/sysadmin" className={menuItem} onClick={() => setOpen(false)}>
                        Painel do sysadmin
                      </Link>
                      <Link href="/dashboard/admin" className={menuItem} onClick={() => setOpen(false)}>
                        Painel do administrador
                      </Link>
                      <Link href="/" className={menuItem} onClick={() => setOpen(false)}>
                        Ver como cliente
                      </Link>
                    </>
                  ) : null}

                  <Link href="/sorteio-times" className={menuItem} onClick={() => setOpen(false)}>
                    Sorteio de times
                  </Link>
                  <Link href="/torneios" className={menuItem} onClick={() => setOpen(false)}>
                    Torneios
                  </Link>
                  <Link href="/perfil" className={menuItem} onClick={() => setOpen(false)}>
                    Meu perfil
                  </Link>
                  <button
                    type="button"
                    className={`${menuItem} w-full text-left`}
                    onClick={() => signOut({ callbackUrl: signOutCallbackUrl })}
                  >
                    Sair
                  </button>
                </div>
              ) : null}
            </div>
          )}

          <button
            type="button"
            className="md:hidden text-foreground"
            onClick={() => setMenuOpen((s) => !s)}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden glass border-t border-border/50 overflow-hidden"
          >
            <div className="container py-4 flex flex-col gap-3">
              {links.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={pill}
                >
                  {link.label}
                </Link>
              ))}

              {role === "SYSADMIN" ? (
                <>
                  <Link href="/sysadmin" className={pill} onClick={() => setMenuOpen(false)}>
                    Painel do sysadmin
                  </Link>
                  <Link href="/dashboard/admin" className={pill} onClick={() => setMenuOpen(false)}>
                    Painel do administrador
                  </Link>
                  <Link href="/" className={pill} onClick={() => setMenuOpen(false)}>
                    Ver como cliente
                  </Link>
                </>
              ) : null}

              {isLoggedIn ? (
                <>
                  <Link href="/perfil" className={pill} onClick={() => setMenuOpen(false)}>
                    Meu perfil
                  </Link>
                  <button
                    type="button"
                    className={pill}
                    onClick={() => {
                      setMenuOpen(false);
                      signOut({ callbackUrl: signOutCallbackUrl });
                    }}
                  >
                    Sair
                  </button>
                </>
              ) : (
                <Link
                  href={`/signin?callbackUrl=${encodeURIComponent(signInCallbackUrl)}`}
                  onClick={() => setMenuOpen(false)}
                  className="gradient-primary text-primary-foreground font-semibold text-sm px-5 py-2.5 rounded-lg text-center"
                >
                  Entrar
                </Link>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
