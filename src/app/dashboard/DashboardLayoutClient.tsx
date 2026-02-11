"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSession, signOut } from "next-auth/react";

import { ThemedBackground } from "@/components/ThemedBackground";

type NavItem = {
  href: string;
  label: string;
};

type EstablishmentProfile = {
  name: string;
  imageUrl: string | null;
};

function initialsFromName(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "E";
  const a = parts[0]?.[0] ?? "E";
  const b = parts.length > 1 ? parts[1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}

function NavLink(props: { item: NavItem; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={props.item.href}
      onClick={props.onClick}
      className={
        props.active
          ? "flex items-center justify-between rounded-2xl bg-[#CCFF00] px-4 py-3 text-sm font-bold text-black shadow-[0_10px_30px_rgba(204,255,0,0.22)] ring-1 ring-black/10"
          : "flex items-center justify-between rounded-2xl px-4 py-3 text-sm text-zinc-800 hover:bg-zinc-900/5 dark:text-zinc-100/90 dark:hover:bg-white/10"
      }
    >
      <span>{props.item.label}</span>
      {props.active ? <span className="text-xs font-semibold">●</span> : null}
    </Link>
  );
}

export function DashboardLayoutClient(props: {
  children: React.ReactNode;
  hasEstablishment?: boolean;
  hasAtLeastOneCourt?: boolean;
  establishmentProfile?: EstablishmentProfile | null;
  approvalStatus?: import("@/generated/prisma/enums").EstablishmentApprovalStatus | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <DashboardLayoutShell
      key={pathname ?? "/dashboard"}
      pathname={pathname ?? "/dashboard"}
      router={router}
      hasEstablishment={props.hasEstablishment}
      hasAtLeastOneCourt={props.hasAtLeastOneCourt}
      establishmentProfile={props.establishmentProfile}
      approvalStatus={props.approvalStatus}
    >
      {props.children}
    </DashboardLayoutShell>
  );
}

function DashboardLayoutShell(props: {
  children: React.ReactNode;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  hasEstablishment?: boolean;
  hasAtLeastOneCourt?: boolean;
  establishmentProfile?: EstablishmentProfile | null;
  approvalStatus?: import("@/generated/prisma/enums").EstablishmentApprovalStatus | null;
}) {
  const [accountOpen, setAccountOpen] = useState(false);

  // Protege contra BFCache: se o usuário sair e apertar "voltar",
  // o browser pode restaurar HTML antigo sem pedir ao servidor. Aqui
  // confirmamos a sessão e redirecionamos para login quando necessário.
  useEffect(() => {
    let cancelled = false;

    async function ensureAuthenticated() {
      try {
        const session = await getSession();
        if (cancelled) return;
        if (!session?.user?.id) {
          const callback = props.pathname || "/dashboard";
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

  const homeHref = props.hasEstablishment && props.hasAtLeastOneCourt ? "/dashboard" : "/dashboard/admin";

  const nav = useMemo<NavItem[]>(() => {
    // Sempre mostramos "Meu espaço" (é onde o dono completa o cadastro do estabelecimento).
    const base: NavItem[] = [{ href: "/dashboard/admin", label: "Meu espaço" }];

    // Sem estabelecimento: só Meu espaço.
    if (!props.hasEstablishment) return base;

    // Com estabelecimento mas sem quadras: liberar "Quadras" para criar a primeira.
    if (!props.hasAtLeastOneCourt) {
      return [...base, { href: "/dashboard/quadras", label: "Quadras" }];
    }

    // Setup completo.
    return [
      { href: "/dashboard", label: "Resumo" },
      { href: "/dashboard/aprovacoes", label: "Aprovações" },
      { href: "/dashboard/agenda", label: "Agenda" },
      { href: "/dashboard/quadras", label: "Quadras" },
      { href: "/dashboard/financeiro", label: "Financeiro" },
      ...base,
    ];
  }, [props.hasEstablishment, props.hasAtLeastOneCourt]);

  const containerClass = "mx-auto w-full max-w-[96rem] px-6";
  const mainInnerClass = "w-full";

  const isActive = (href: string) => props.pathname === href;

  const establishmentName = props.establishmentProfile?.name ?? null;
  const establishmentImageUrl = props.establishmentProfile?.imageUrl ?? null;
  const establishmentInitials = useMemo(() => initialsFromName(establishmentName), [establishmentName]);

  const signOutCallbackUrl = "/signin?logout=1&callbackUrl=%2Fdashboard";

  const accountCard = props.establishmentProfile ? (
    <div className="relative mt-5">
      <button
        type="button"
        onClick={() => setAccountOpen((s) => !s)}
        className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white/75 px-3 py-3 text-left text-zinc-900 shadow-sm hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
      >
        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-100 ring-1 ring-zinc-200 dark:bg-white/10 dark:ring-white/10">
          {establishmentImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={establishmentImageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs font-extrabold text-zinc-900 dark:text-white">
              {establishmentInitials}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{establishmentName}</span>
          <span className="block text-xs text-zinc-600 dark:text-zinc-300">Você está logado</span>
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-300">▾</span>
      </button>

      {accountOpen ? (
        <div className="absolute left-0 right-0 mt-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white/90 text-zinc-900 shadow-xl backdrop-blur dark:border-white/10 dark:bg-black/60 dark:text-white">
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
  ) : null;

  const showApprovalBanner = props.approvalStatus === "PENDING" || props.approvalStatus === "REJECTED";


  return (
    <div className="ph-page">
      <ThemedBackground />
      <div className="relative z-10">
      <div className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur shadow-sm dark:border-white/10 dark:bg-[#121212]/90">
        <div className={`${containerClass} flex items-center justify-between py-4`}>
          <div className="flex items-center gap-3">
            <Link href={homeHref} className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">
              <span className="relative h-12 w-12 overflow-hidden rounded-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo" alt="PlatzGo!" className="h-full w-full object-contain" />
              </span>
            </Link>
            <span className="text-xs text-zinc-600 dark:text-zinc-300">A partida começa AQUI</span>
          </div>
          <div className="flex items-center gap-2" />
        </div>
      </div>

      <div className={`${containerClass} grid gap-6 py-8 lg:grid-cols-[260px_minmax(0,1fr)]`}>
        <aside className="hidden lg:block">
          <div className="rounded-3xl border border-zinc-200 bg-white/75 p-5 text-zinc-900 shadow-[0_12px_40px_rgba(0,0,0,0.10)] backdrop-blur dark:border-white/10 dark:bg-[#0b0b0b]/85 dark:text-white dark:shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-3">
              <Link href={homeHref} className="flex items-center gap-2 text-sm font-bold">
                <span className="relative h-12 w-12 overflow-hidden rounded-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo" alt="PlatzGo!" className="h-full w-full object-contain" />
                </span>
              </Link>
              <span className="text-xs text-zinc-600 dark:text-zinc-300">A partida começa AQUI</span>
            </div>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">Painel do dono</p>

            {accountCard}

            {!props.hasEstablishment ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                Complete o cadastro da sua arena em <span className="font-semibold">Meu espaço</span>.
              </div>
            ) : !props.hasAtLeastOneCourt ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                Crie sua <span className="font-semibold">primeira quadra</span> em Quadras para liberar o dashboard.
              </div>
            ) : null}

            <div className="mt-6 space-y-2">
              {nav.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <div className={mainInnerClass}>
            {showApprovalBanner ? (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {props.approvalStatus === "REJECTED"
                  ? "Seu cadastro foi reprovado. Verifique o e-mail enviado pelo sistema para detalhes."
                  : "Seu cadastro está em análise pelo SYSADMIN. Você pode ajustar o perfil normalmente, mas a aprovação ainda está pendente."}
              </div>
            ) : null}
            {props.children}
          </div>
        </main>
      </div>
      </div>
    </div>
  );
}
