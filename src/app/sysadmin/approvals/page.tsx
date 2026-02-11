import Link from "next/link";
import { redirect } from "next/navigation";

import { requireRoleOrRedirect } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { approveEstablishment, rejectEstablishment } from "@/lib/actions/sysadminApprovals";
import { EstablishmentApprovalStatus } from "@/generated/prisma/enums";

export default async function SysadminApprovalsPage(props: {
  searchParams?: { ok?: string; err?: string } | Promise<{ ok?: string; err?: string }>;
}) {
  await requireRoleOrRedirect("SYSADMIN", "/sysadmin/approvals");

  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const ok = searchParams?.ok === "1";
  const err = (searchParams?.err ?? "").trim();

  const pending = await prisma.establishment.findMany({
    where: { approval_status: EstablishmentApprovalStatus.PENDING },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      whatsapp_number: true,
      contact_number: true,
      instagram_url: true,
      address_text: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  const isRedirectError = (e: unknown) =>
    Boolean((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT"));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Aprovação de estabelecimentos</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Cadastros pendentes de validação pelo SYSADMIN.</p>
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

      <div className="ph-card p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Pendentes</h2>

        {pending.length ? (
          <div className="mt-4 space-y-4">
            {pending.map((est) => (
              <div key={est.id} className="rounded-2xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{est.name}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      Dono: {est.owner?.name ?? "—"} {est.owner?.email ? `(${est.owner.email})` : ""}
                    </p>
                    <details className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                      <summary className="cursor-pointer font-semibold text-zinc-800 dark:text-zinc-200">
                        Ver detalhes
                      </summary>
                      <div className="mt-2 space-y-1">
                        <div>WhatsApp: {est.whatsapp_number || "—"}</div>
                        <div>Contato: {est.contact_number || "—"}</div>
                        <div>Instagram: {est.instagram_url || "—"}</div>
                        <div>Endereço: {est.address_text || "—"}</div>
                      </div>
                    </details>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <form
                      action={async () => {
                        "use server";
                        try {
                          await approveEstablishment({ establishmentId: est.id });
                          redirect("/sysadmin/approvals?ok=1");
                        } catch (e) {
                          if (isRedirectError(e)) throw e;
                          const msg = e instanceof Error ? e.message : "Erro ao aprovar";
                          redirect(`/sysadmin/approvals?err=${encodeURIComponent(msg)}`);
                        }
                      }}
                    >
                      <button type="submit" className="ph-button">Aprovar</button>
                    </form>

                    <form
                      action={async (formData) => {
                        "use server";
                        try {
                          const note = String(formData.get("note") ?? "");
                          await rejectEstablishment({ establishmentId: est.id, note });
                          redirect("/sysadmin/approvals?ok=1");
                        } catch (e) {
                          if (isRedirectError(e)) throw e;
                          const msg = e instanceof Error ? e.message : "Erro ao reprovar";
                          redirect(`/sysadmin/approvals?err=${encodeURIComponent(msg)}`);
                        }
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        name="note"
                        placeholder="Motivo (opcional)"
                        className="ph-input h-10"
                      />
                      <button type="submit" className="ph-button-secondary">Reprovar</button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Nenhum cadastro pendente.</p>
        )}
      </div>
    </div>
  );
}
