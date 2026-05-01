"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSession, signOut } from "next-auth/react";
import {
  BarChart3,
  Users,
  CheckSquare,
  Settings,
  CreditCard,
  Activity,
  Sliders,
  AlertTriangle,
  Bell,
  LogOut,
  ChevronLeft,
} from "lucide-react";


type NavItem = { href: string; label: string; icon: typeof BarChart3; badge?: number };

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

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function SysadminLayoutShell(props: {
  children: React.ReactNode;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  pendingApprovalsCount?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);

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
      { href: "/sysadmin", label: "Administrador", icon: BarChart3 },
      { href: "/sysadmin/users", label: "Usuários", icon: Users },
      { href: "/sysadmin/approvals", label: "Aprovacoes", icon: CheckSquare, badge: props.pendingApprovalsCount ?? 0 },
      { href: "/sysadmin/settings", label: "Sistema", icon: Settings },
      { href: "/sysadmin/payments", label: "Pagamentos", icon: CreditCard },
      { href: "/sysadmin/sistema", label: "Monitoramento", icon: Activity },
      { href: "/sysadmin/search-options", label: "Opções de quadras", icon: Sliders },
      { href: "/sysadmin/reasons", label: "Motivos", icon: AlertTriangle },
    ],
    [props.pendingApprovalsCount]
  );

  const isActive = (href: string) => props.pathname === href;

  const signOutCallbackUrl = "/signin?logout=1&callbackUrl=%2Fsysadmin";

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

  return (
    <div className="ph-page-ambient flex">
      <aside
        className={cn(
          "bg-card border-r border-border transition-all duration-300 flex flex-col fixed h-full z-40",
          collapsed ? "w-[72px]" : "w-64"
        )}
      >
        <div className="p-4 flex items-center gap-3 border-b border-border h-16">
          <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center font-display font-bold text-primary-foreground shrink-0">
            P
          </div>
          {!collapsed ? (
            <div>
              <span className="font-display font-bold text-lg">
                Platz<span className="gradient-text">Go!</span>
              </span>
              <p className="text-xs text-muted-foreground">Painel do sysadmin</p>
            </div>
          ) : null}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all",
                isActive(item.href)
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              <item.icon size={20} className="shrink-0" />
              {!collapsed ? (
                <span className="flex-1 flex items-center justify-between gap-2">
                  <span>{item.label}</span>
                  {typeof item.badge === "number" && item.badge > 0 ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <button
            type="button"
            onClick={() => setCollapsed((s) => !s)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          >
            <ChevronLeft size={20} className={cn("shrink-0 transition-transform", collapsed && "rotate-180")} />
            {!collapsed ? <span>Recolher</span> : null}
          </button>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: signOutCallbackUrl })}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          >
            <LogOut size={20} className="shrink-0" />
            {!collapsed ? <span>Sair</span> : null}
          </button>
        </div>
      </aside>

      <main className={cn("flex-1 transition-all duration-300", collapsed ? "ml-[72px]" : "ml-64")}>
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div>
            <p className="text-xs text-muted-foreground">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/sysadmin/approvals"
              className="relative p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <Bell size={18} />
              {props.pendingApprovalsCount && props.pendingApprovalsCount > 0 ? (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                  {props.pendingApprovalsCount}
                </span>
              ) : null}
            </Link>
            <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center font-display font-bold text-sm text-primary-foreground">
              S
            </div>
          </div>
        </header>

        <div className="p-6">{props.children}</div>
      </main>
    </div>
  );
}
