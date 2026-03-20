"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSession, signOut } from "next-auth/react";
import {
  BarChart3,
  Calendar,
  LayoutGrid,
  DollarSign,
  CreditCard,
  CheckSquare,
  Bell,
  Settings,
  Trophy,
  LogOut,
  ChevronLeft,
  Menu,
  X,
} from "lucide-react";


type NavItem = {
  href: string;
  label: string;
  icon: typeof BarChart3;
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

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(max-width: 1023px)");

    const update = () => setIsMobile(media.matches);
    update();

    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function DashboardLayoutClient(props: {
  children: React.ReactNode;
  hasEstablishment?: boolean;
  hasAtLeastOneCourt?: boolean;
  establishmentProfile?: EstablishmentProfile | null;
  approvalStatus?: import("@/generated/prisma/enums").EstablishmentApprovalStatus | null;
  approvalNote?: string | null;
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
      approvalNote={props.approvalNote}
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
  approvalNote?: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) setCollapsed(false);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

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

  const nav = useMemo<NavItem[]>(() => {
    const base: NavItem[] = [{ href: "/dashboard/admin", label: "Configuracoes", icon: Settings }];

    if (!props.hasEstablishment) return base;

    if (!props.hasAtLeastOneCourt) {
      return [...base, { href: "/dashboard/quadras", label: "Quadras", icon: LayoutGrid }];
    }

    return [
      { href: "/dashboard", label: "Visao geral", icon: BarChart3 },
      { href: "/dashboard/agenda", label: "Agenda", icon: Calendar },
      { href: "/dashboard/quadras", label: "Quadras", icon: LayoutGrid },
      { href: "/dashboard/financeiro", label: "Financeiro", icon: DollarSign },
      { href: "/dashboard/pagamentos", label: "Pagamentos", icon: CreditCard },
      { href: "/dashboard/aprovacoes", label: "Aprovacoes", icon: CheckSquare },
      { href: "/dashboard/notificacoes", label: "Notificacoes", icon: Bell },
      { href: "/dashboard/torneios", label: "Torneios", icon: Trophy },
      ...base,
    ];
  }, [props.hasEstablishment, props.hasAtLeastOneCourt]);

  const isActive = (href: string) => {
    if (href === "/dashboard") return props.pathname === "/dashboard";
    return props.pathname === href || props.pathname.startsWith(`${href}/`);
  };

  const establishmentName = props.establishmentProfile?.name ?? null;
  const establishmentInitials = useMemo(() => initialsFromName(establishmentName), [establishmentName]);

  const signOutCallbackUrl = "/signin?logout=1&callbackUrl=%2Fdashboard";

  const showApprovalBanner = props.approvalStatus === "PENDING" || props.approvalStatus === "REJECTED";

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    []
  );

  const sidebarContent = (
    <>
      <div className="p-4 flex items-center gap-3 border-b border-border h-16">
        <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center font-display font-bold text-primary-foreground shrink-0 shadow-lg shadow-primary/20">
          P
        </div>

        {(!collapsed || isMobile) ? (
          <div className="flex-1 min-w-0">
            <span className="font-display font-bold text-lg">
              Platz<span className="gradient-text">Go!</span>
            </span>
            <p className="text-xs text-muted-foreground">Painel do gestor</p>
          </div>
        ) : null}

        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {nav.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (isMobile) setMobileOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group relative",
                active
                  ? "text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              )}
            >
              {active ? <div className="absolute inset-0 rounded-xl bg-primary/8 glow-border" /> : null}
              <item.icon
                size={20}
                className={cn(
                  "shrink-0 relative z-10 transition-colors",
                  active && "drop-shadow-[0_0_6px_hsl(72_100%_50%/0.5)]"
                )}
              />
              {(!collapsed || isMobile) ? <span className="relative z-10">{item.label}</span> : null}
              {active && (!collapsed || isMobile) ? (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary relative z-10 shadow-[0_0_6px_hsl(72_100%_50%/0.6)]" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border space-y-0.5">
        {!isMobile ? (
          <button
            type="button"
            onClick={() => setCollapsed((s) => !s)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
          >
            <ChevronLeft
              size={20}
              className={cn("shrink-0 transition-transform duration-300", collapsed && "rotate-180")}
            />
            {!collapsed ? <span>Recolher</span> : null}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: signOutCallbackUrl })}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
        >
          <LogOut size={20} className="shrink-0" />
          {(!collapsed || isMobile) ? <span>Sair</span> : null}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {isMobile && mobileOpen ? (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 bg-foreground/60 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "bg-card border-r border-border flex flex-col h-full z-50",
          isMobile
            ? cn("fixed transition-transform duration-300 w-72", mobileOpen ? "translate-x-0" : "-translate-x-full")
            : cn("fixed transition-all duration-300", collapsed ? "w-[72px]" : "w-64")
        )}
      >
        {sidebarContent}
      </aside>

      <main
        className={cn(
          "flex-1 transition-all duration-300",
          isMobile ? "ml-0" : collapsed ? "ml-[72px]" : "ml-64"
        )}
      >
        <header className="h-16 border-b border-border flex items-center justify-between px-4 sm:px-6 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {isMobile ? (
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Abrir menu"
              >
                <Menu size={20} />
              </button>
            ) : null}
            <p className="text-xs text-muted-foreground hidden sm:block">{todayLabel}</p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/notificacoes"
              className="relative p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <Bell size={18} />
            </Link>
            <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center font-display font-bold text-sm text-primary-foreground shadow-lg shadow-primary/20 overflow-hidden">
              {props.establishmentProfile?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={props.establishmentProfile.imageUrl}
                  alt={props.establishmentProfile.name || "Estabelecimento"}
                  className="h-full w-full object-cover"
                />
              ) : (
                establishmentInitials || "A"
              )}
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6">
          {showApprovalBanner ? (
            <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              {props.approvalStatus === "REJECTED" ? (
                <div className="space-y-2">
                  <p>
                    Seu cadastro foi reprovado.
                    {props.approvalNote ? ` Motivo: ${props.approvalNote}` : ""}
                  </p>
                  <p>
                    Ajuste os dados em{" "}
                    <Link href="/dashboard/admin" className="font-semibold underline text-foreground">
                      Configuracoes
                    </Link>{" "}
                    e reenviar para aprovacao.
                  </p>
                </div>
              ) : (
                <p>
                  Seu cadastro esta em analise pelo SYSADMIN. Voce pode ajustar o perfil normalmente, mas a aprovacao ainda esta pendente.
                </p>
              )}
            </div>
          ) : null}

          {props.children}
        </div>
      </main>
    </div>
  );
}
