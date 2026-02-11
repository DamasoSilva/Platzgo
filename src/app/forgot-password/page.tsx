import Link from "next/link";
import { redirect } from "next/navigation";

import { requestPasswordReset } from "@/lib/actions/passwordReset";

export default async function ForgotPasswordPage(props: {
  searchParams?: { sent?: string } | Promise<{ sent?: string }>;
}) {
  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const sent = searchParams?.sent === "1";

  return (
    <div className="ph-page">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#CCFF00]/15 blur-3xl" />
      <div className="relative mx-auto max-w-md px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Redefinir senha</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Informe seu email. Se existir uma conta, enviaremos um código para redefinir a senha.
        </p>

        {sent ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Se existir uma conta com esse email, enviamos um código para redefinir a senha.
          </div>
        ) : null}

        <form
          className="ph-card mt-6 p-6"
          action={async (formData) => {
            "use server";
            const email = String(formData.get("email") ?? "");
            await requestPasswordReset({ email });
            redirect(`/reset-password?email=${encodeURIComponent(email)}&sent=1`);
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Email</label>
              <input type="email" name="email" className="ph-input mt-2" required />
            </div>

            <button type="submit" className="ph-button w-full">
              Enviar código
            </button>

            <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">
              <Link className="font-semibold text-zinc-900 underline dark:text-zinc-100" href="/signin">
                Voltar para o login
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
