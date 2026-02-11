import Link from "next/link";
import { redirect } from "next/navigation";

import { requireRoleOrRedirect } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { inactivateUser, reactivateUser } from "@/lib/actions/sysadminUsers";
import { Role } from "@/generated/prisma/enums";

function isRedirectError(e: unknown) {
  return Boolean((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT"));
}

async function inactivateUserAction(formData: FormData) {
  "use server";
  try {
    const userId = String(formData.get("userId") ?? "");
    const reason = String(formData.get("reason") ?? "");
    await inactivateUser({ userId, reason });
    redirect("/sysadmin/users?ok=1");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "Erro ao inativar";
    redirect(`/sysadmin/users?err=${encodeURIComponent(msg)}`);
  }
}

async function reactivateUserAction(formData: FormData) {
  "use server";
  try {
    const userId = String(formData.get("userId") ?? "");
    await reactivateUser({ userId });
    redirect("/sysadmin/users?ok=1");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    const msg = e instanceof Error ? e.message : "Erro ao reativar";
    redirect(`/sysadmin/users?err=${encodeURIComponent(msg)}`);
  }
}

export default async function SysadminUsersPage(props: {
  searchParams?: { ok?: string; err?: string } | Promise<{ ok?: string; err?: string }>;
}) {
  await requireRoleOrRedirect("SYSADMIN", "/sysadmin/users");

  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const ok = searchParams?.ok === "1";
  const err = (searchParams?.err ?? "").trim();

  const ownerSelect = {
    id: true,
    name: true,
    email: true,
    is_active: true,
    inactive_reason: true,
    whatsapp_number: true,
  };

  const customerSelect = {
    id: true,
    name: true,
    email: true,
    is_active: true,
    inactive_reason: true,
    whatsapp_number: true,
  };

  const sysadminSelect = {
    id: true,
    name: true,
    email: true,
    is_active: true,
    inactive_reason: true,
  };

  const [establishments, customers, sysadmins] = await Promise.all([
    prisma.establishment.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        owner: { select: ownerSelect },
      },
    }) as Promise<
      Array<{
        id: string;
        name: string;
        owner: {
          id: string;
          name: string | null;
          email: string;
          is_active: boolean;
          inactive_reason: string | null;
          whatsapp_number: string | null;
        } | null;
      }>
    >,
    prisma.user.findMany({
      where: { role: Role.CUSTOMER },
      orderBy: { createdAt: "desc" },
      select: customerSelect,
    }) as Promise<
      Array<{
        id: string;
        name: string | null;
        email: string;
        is_active: boolean;
        inactive_reason: string | null;
        whatsapp_number: string | null;
      }>
    >,
    prisma.user.findMany({
      where: { role: Role.SYSADMIN },
      orderBy: { createdAt: "desc" },
      select: sysadminSelect,
    }) as Promise<
      Array<{
        id: string;
        name: string | null;
        email: string;
        is_active: boolean;
        inactive_reason: string | null;
      }>
    >,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Usuários cadastrados</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Gerencie usuários por estabelecimento e realize inativações quando necessário.
          </p>
        </div>
        <Link className="ph-button-secondary" href="/sysadmin">
          Voltar
        </Link>
      </div>

      {ok ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Ação concluída.
        </div>
      ) : null}

      {err ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{err}</div> : null}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Estabelecimentos</h2>

        {establishments.length ? (
          <div className="space-y-4">
            {establishments.map((est) => (
              <div key={est.id} className="rounded-2xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{est.name}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Dono: {est.owner?.name ?? "—"} {est.owner?.email ? `(${est.owner.email})` : ""}
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      WhatsApp: {est.owner?.whatsapp_number ?? "—"}
                    </p>
                    {!est.owner?.is_active ? (
                      <p className="text-xs font-semibold text-red-700 dark:text-red-200">
                        Inativo: {est.owner?.inactive_reason ?? "motivo não informado"}
                      </p>
                    ) : null}
                  </div>

                  {est.owner ? (
                    <div className="flex flex-wrap gap-2">
                      {est.owner.is_active ? (
                        <form action={inactivateUserAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="userId" value={est.owner.id} />
                          <input name="reason" placeholder="Motivo" className="ph-input h-10" />
                          <button type="submit" className="ph-button-secondary">
                            Inativar
                          </button>
                        </form>
                      ) : (
                        <form action={reactivateUserAction}>
                          <input type="hidden" name="userId" value={est.owner.id} />
                          <button type="submit" className="ph-button">
                            Reativar
                          </button>
                        </form>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum estabelecimento cadastrado.</p>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Clientes</h2>
        {customers.length ? (
          <div className="space-y-3">
            {customers.map((u) => (
              <div key={u.id} className="rounded-2xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{u.name ?? "Sem nome"}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">{u.email}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">WhatsApp: {u.whatsapp_number ?? "—"}</p>
                    {!u.is_active ? (
                      <p className="text-xs font-semibold text-red-700 dark:text-red-200">
                        Inativo: {u.inactive_reason ?? "motivo não informado"}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {u.is_active ? (
                      <form action={inactivateUserAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <input name="reason" placeholder="Motivo" className="ph-input h-10" />
                        <button type="submit" className="ph-button-secondary">
                          Inativar
                        </button>
                      </form>
                    ) : (
                      <form action={reactivateUserAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button type="submit" className="ph-button">
                          Reativar
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum cliente cadastrado.</p>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Sysadmins</h2>
        {sysadmins.length ? (
          <div className="space-y-3">
            {sysadmins.map((u) => (
              <div key={u.id} className="rounded-2xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{u.name ?? "Sem nome"}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">{u.email}</p>
                    {!u.is_active ? (
                      <p className="text-xs font-semibold text-red-700 dark:text-red-200">
                        Inativo: {u.inactive_reason ?? "motivo não informado"}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {u.is_active ? (
                      <form action={inactivateUserAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <input name="reason" placeholder="Motivo" className="ph-input h-10" />
                        <button type="submit" className="ph-button-secondary">
                          Inativar
                        </button>
                      </form>
                    ) : (
                      <form action={reactivateUserAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button type="submit" className="ph-button">
                          Reativar
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum sysadmin cadastrado.</p>
        )}
      </div>
    </div>
  );
}
