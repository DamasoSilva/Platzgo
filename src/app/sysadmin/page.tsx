import Link from "next/link";

import { requireRoleOrRedirect } from "@/lib/authz";

export default async function SysadminHomePage() {
  await requireRoleOrRedirect("SYSADMIN", "/sysadmin");

  return (
    <div className="ph-card p-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Administrador</h1>
      <p className="mt-2 text-sm text-muted-foreground">Acesso rápido às telas do sistema.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link className="ph-card p-5 hover:border-primary/40 transition" href="/sysadmin/settings">
          <p className="text-sm font-semibold text-foreground">Configurações do sistema</p>
          <p className="mt-1 text-xs text-muted-foreground">SMTP, senha e utilitários</p>
        </Link>

        <Link className="ph-card p-5 hover:border-primary/40 transition" href="/sysadmin/payments">
          <p className="text-sm font-semibold text-foreground">Pagamentos e webhooks</p>
          <p className="mt-1 text-xs text-muted-foreground">Retornos das APIs e eventos</p>
        </Link>

        <Link className="ph-card p-5 hover:border-primary/40 transition" href="/sysadmin/search-options">
          <p className="text-sm font-semibold text-foreground">Opções de quadras</p>
          <p className="mt-1 text-xs text-muted-foreground">Modalidades (ex.: Futsal, Padel)</p>
        </Link>

        <Link className="ph-card p-5 hover:border-primary/40 transition" href="/sysadmin/reasons">
          <p className="text-sm font-semibold text-foreground">Motivos de inativação</p>
          <p className="mt-1 text-xs text-muted-foreground">Cadastro/edição de motivos</p>
        </Link>

        <Link className="ph-card p-5 hover:border-primary/40 transition" href="/sysadmin/approvals">
          <p className="text-sm font-semibold text-foreground">Aprovação de estabelecimentos</p>
          <p className="mt-1 text-xs text-muted-foreground">Validar cadastros pendentes</p>
        </Link>
      </div>

      <div className="mt-8">
        <p className="text-sm font-semibold text-foreground">Navegação (para checar telas)</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Como SYSADMIN, você pode abrir telas de Dono/Cliente. Como seu usuário não tem estabelecimentos/agendamentos, você
          não verá dados de terceiros.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="ph-button" href="/sysadmin">
            Administrador
          </Link>
          <Link className="ph-button-secondary" href="/dashboard">
            Dono do Estabelecimento
          </Link>
          <Link className="ph-button-secondary" href="/">
            Cliente
          </Link>
        </div>
      </div>
    </div>
  );
}
