"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";

type SignInRole = "CUSTOMER" | "OWNER";

export function SignInForm(props: {
  callbackUrl: string;
  initialRole?: SignInRole;
  success?: "signup";
  loggedOut?: boolean;
  resetDone?: boolean;
}) {
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<SignInRole>(
    props.initialRole ?? (props.callbackUrl.startsWith("/dashboard") ? "OWNER" : "CUSTOMER")
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const desiredCallback = role === "OWNER"
        ? "/dashboard"
        : props.callbackUrl && props.callbackUrl !== "/"
          ? props.callbackUrl
          : "/";

      const postAuthUrl = `/post-auth?next=${encodeURIComponent(desiredCallback)}`;

      const res = await signIn("credentials", {
        email,
        password,
        roleIntent: role === "OWNER" ? "ADMIN" : "CUSTOMER",
        callbackUrl: postAuthUrl,
        redirect: false,
      });

      if (res?.error) {
        if (res.error === "TOO_MANY_ATTEMPTS") {
          setError("Muitas tentativas. Tente novamente em alguns minutos.");
          return;
        }
        if (res.error === "EMAIL_NOT_VERIFIED") {
          setError("Verifique seu e-mail com o código enviado antes de entrar.");
          return;
        }
        if (res.error === "ROLE_MISMATCH_OWNER") {
          setError("Essa conta é de Cliente. Selecione Cliente para entrar.");
          return;
        }
        if (res.error === "ROLE_MISMATCH_CUSTOMER") {
          setError("Essa conta é de Dono de Arena. Selecione Dono para entrar.");
          return;
        }

        if (res.error.startsWith("USER_INACTIVE:")) {
          const reason = res.error.replace("USER_INACTIVE:", "").trim();
          setError(`Usuário inativo. Motivo: ${reason || "não informado"}.`);
          return;
        }

        setError("Credenciais inválidas");
        return;
      }

      router.push(res?.url ?? postAuthUrl);
    });
  }

  return (
    <div className="ph-page">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#CCFF00]/15 blur-3xl" />
      <div className="relative mx-auto max-w-md px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Entrar</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Use seu email e senha para acessar.</p>

        {props.success === "signup" ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Cadastro efetuado com sucesso. Agora é só entrar.
          </div>
        ) : null}

        {props.loggedOut ? (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800">
            Você saiu do sistema com sucesso.
          </div>
        ) : null}

        {props.resetDone ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Senha redefinida com sucesso. Agora é só entrar.
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="ph-card mt-6 p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Sou</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole("CUSTOMER")}
                  className={
                    role === "CUSTOMER"
                      ? "rounded-full bg-[#CCFF00] px-4 py-3 text-sm font-bold text-black"
                      : "rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  }
                >
                  Cliente
                </button>
                <button
                  type="button"
                  onClick={() => setRole("OWNER")}
                  className={
                    role === "OWNER"
                      ? "rounded-full bg-[#CCFF00] px-4 py-3 text-sm font-bold text-black"
                      : "rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  }
                >
                  Dono de Arena
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ph-input mt-2"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ph-input mt-2"
                required
              />

              <div className="mt-2 text-right text-sm">
                <a className="font-semibold text-zinc-900 underline dark:text-zinc-100" href="/forgot-password">
                  Esqueci minha senha
                </a>
              </div>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button type="submit" disabled={isPending} className="ph-button w-full">
              {isPending ? "Entrando..." : "Entrar"}
            </button>

            <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">
              Não tem conta?{" "}
              <a
                className="font-semibold text-zinc-900 underline dark:text-zinc-100"
                href={`/signup?callbackUrl=${encodeURIComponent(props.callbackUrl)}&role=${role}`}
              >
                Criar conta
              </a>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
