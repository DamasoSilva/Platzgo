"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSession, signOut } from "next-auth/react";

import { ThemedBackground } from "@/components/ThemedBackground";

type NavItem = { href: string; label: string; badge?: number };

function NavLink(props: { item: NavItem; active: boolean; onClick?: () => void }) {
  const hasBadge = typeof props.item.badge === "number" && props.item.badge > 0;
  const highlight = hasBadge && !props.active;
  return (
    <Link
      href={props.item.href}
      onClick={props.onClick}
      className={
        props.active
          ? "flex items-center justify-between rounded-2xl bg-[#CCFF00] px-4 py-3 text-sm font-bold text-black shadow-[0_10px_30px_rgba(204,255,0,0.22)] ring-1 ring-black/10"
          : highlight
            ? "flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
            : "flex items-center justify-between rounded-2xl px-4 py-3 text-sm text-zinc-800 hover:bg-zinc-900/5 dark:text-zinc-100/90 dark:hover:bg-white/10"
      }
    >
      <span>{props.item.label}</span>
      {props.active ? <span className="text-xs font-semibold">●</span> : null}
      {hasBadge && !props.active ? (
        <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
          {props.item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function SysadminLayoutClient(props: { children: React.ReactNode; pendingApprovalsCount?: number }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <SysadminLayoutShell
      key={pathname ?? "/sysadmin"}
      pathname={pathname ?? "/sysadmin"}
      router={router}
      pendingApprovalsCount={props.pendingApprovalsCount}
    >
      {props.children}
    </SysadminLayoutShell>
  );
}

function SysadminLayoutShell(props: {
  children: React.ReactNode;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  pendingApprovalsCount?: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  function closeMenus() {
    setAccountOpen(false);
    setMobileOpen(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function ensureAuthenticated() {
      try {
        const session = await getSession();
        if (cancelled) return;
        if (!session?.user?.id) {
          const callback = props.pathname || "/sysadmin";
          props.router.replace(`/signin?callbackUrl=${encodeURIComponent(callback)}`);
        }
      } catch {
        // noop
      }
    }

    ensureAuthenticated();

    function onPageShow() {
      ensureAuthenticated();
    }

    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [props.pathname, props.router]);

  const nav = useMemo<NavItem[]>(
    () => [
      { href: "/sysadmin", label: "Administrador" },
      { href: "/sysadmin/users", label: "Usuários" },
      { href: "/sysadmin/approvals", label: "Aprovações", badge: props.pendingApprovalsCount ?? 0 },
      { href: "/sysadmin/settings", label: "Sistema" },
      { href: "/sysadmin/payments", label: "Pagamentos" },
      { href: "/sysadmin/sistema", label: "Monitoramento" },
      { href: "/sysadmin/search-options", label: "Opções de quadras" },
      { href: "/sysadmin/reasons", label: "Motivos" },
    ],
    [props.pendingApprovalsCount]
  );

  const containerClass = "mx-auto w-full max-w-[96rem] px-6";

  const isActive = (href: string) => props.pathname === href;

  const signOutCallbackUrl = "/signin?logout=1&callbackUrl=%2Fsysadmin";

  const accountButton = (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAccountOpen((s) => !s)}
        className="rounded-full border border-zinc-200 bg-white/80 px-4 py-2 text-sm text-zinc-900 shadow-sm hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
      >
        Conta ▾
      </button>

      {accountOpen ? (
        <div className="absolute right-0 mt-2 w-48 overflow-hidden rounded-2xl border border-zinc-200 bg-white/95 text-zinc-900 shadow-xl backdrop-blur dark:border-white/10 dark:bg-black/60 dark:text-white">
          <button
            type="button"
            className="block w-full px-4 py-3 text-left text-sm hover:bg-zinc-900/5 dark:hover:bg-white/10"
            onClick={() => signOut({ callbackUrl: signOutCallbackUrl })}
          >
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="ph-page">
      <ThemedBackground />

      <div className="relative z-10">
        <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur shadow-sm dark:border-white/10 dark:bg-[#121212]/90">
          <div className={`${containerClass} flex items-center justify-between py-4`}>
            <div className="flex items-center gap-3">
              <Link href="/sysadmin" className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">
                <span className="relative h-12 w-12 overflow-hidden rounded-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo" alt="PlatzGo!" className="h-full w-full object-contain" />
                </span>
              </Link>
              <span className="text-xs text-zinc-600 dark:text-zinc-300">A partida começa AQUI</span>
            </div>
            <div className="flex items-center gap-2">
              {accountButton}
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-full border border-zinc-200 bg-white/80 px-4 py-2 text-sm text-zinc-900 shadow-sm hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              >
                Menu
              </button>
            </div>
          </div>
        </div>

        {mobileOpen ? (
          <div className="lg:hidden fixed inset-0 z-50">
            <button className="absolute inset-0 bg-black/60" aria-label="Fechar menu" onClick={closeMenus} type="button" />
            <aside className="absolute left-0 top-0 h-full w-[320px] bg-white/95 text-zinc-900 border-r border-zinc-200 p-5 dark:bg-[#0f0f0f] dark:text-white dark:border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Link href="/sysadmin" className="flex items-center gap-2 text-sm font-bold" onClick={closeMenus}>
                    <span className="relative h-12 w-12 overflow-hidden rounded-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/logo" alt="PlatzGo!" className="h-full w-full object-contain" />
                    </span>
                  </Link>
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">A partida começa AQUI</span>
                </div>
                <button
                  type="button"
                  onClick={closeMenus}
                  className="rounded-full border border-zinc-200 bg-white/80 px-4 py-2 text-sm text-zinc-900 shadow-sm hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                >
                  Fechar
                </button>
              </div>

              <div className="mt-5">{accountButton}</div>

              <div className="mt-6 space-y-2">
                {nav.map((item) => (
                  <NavLink key={item.href} item={item} active={isActive(item.href)} onClick={closeMenus} />
                ))}
              </div>

              <div className="mt-8 space-y-2">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Atalhos</p>
                <Link href="/dashboard/admin" className="block rounded-2xl px-4 py-3 text-sm text-zinc-900 hover:bg-zinc-900/5 dark:text-zinc-100/90 dark:hover:bg-white/10" onClick={closeMenus}>
                  Administrador (dono)
                </Link>
                <Link href="/" className="block rounded-2xl px-4 py-3 text-sm text-zinc-900 hover:bg-zinc-900/5 dark:text-zinc-100/90 dark:hover:bg-white/10" onClick={closeMenus}>
                  Cliente
                </Link>
              </div>
            </aside>
          </div>
        ) : null}

        <div className={`${containerClass} py-8 lg:py-10`}>
          <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
            <aside className="hidden lg:block">
              <div className="rounded-3xl border border-zinc-200 bg-white/70 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Link href="/sysadmin" className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">
                      <span className="relative h-12 w-12 overflow-hidden rounded-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo" alt="PlatzGo!" className="h-full w-full object-contain" />
                      </span>
                    </Link>
                    <span className="text-xs text-zinc-600 dark:text-zinc-300">A partida começa AQUI</span>
                  </div>
                  {accountButton}
                </div>

                <div className="mt-6 space-y-2">
                  {nav.map((item) => (
                    <NavLink key={item.href} item={item} active={isActive(item.href)} />
                  ))}
                </div>

                <div className="mt-8 space-y-2">
                  <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Atalhos</p>
                  <Link href="/dashboard/admin" className="block rounded-2xl px-4 py-3 text-sm text-zinc-900 hover:bg-zinc-900/5 dark:text-zinc-100/90 dark:hover:bg-white/10">
                    Administrador (dono)
                  </Link>
                  <Link href="/" className="block rounded-2xl px-4 py-3 text-sm text-zinc-900 hover:bg-zinc-900/5 dark:text-zinc-100/90 dark:hover:bg-white/10">
                    Cliente
                  </Link>
                </div>
              </div>
            </aside>

            <main className="min-w-0">{props.children}</main>
          </div>
        </div>
      </div>
    </div>
  );
}
