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
    <div className="ph-page min-h-screen flex">
      {/* Left visual panel - hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-emerald-600 to-emerald-800" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-primary/30 blur-2xl" />
        <div className="relative z-10 max-w-md px-12 text-white">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center font-bold text-2xl mb-8">
            P
          </div>
          <h2 className="text-4xl font-bold leading-tight">
            Sua quadra.<br />
            <span className="text-emerald-200">Seu horário.</span>
          </h2>
          <p className="mt-4 text-lg text-white/80 leading-relaxed">
            Agende quadras de futebol, padel, tênis e mais em segundos. Sem ligações, sem espera.
          </p>
          <div className="mt-8 flex items-center gap-4 text-sm text-white/70">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-300" />
              +50 quadras
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-300" />
              Pagamento seguro
            </span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center relative">
        <div className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.08)_0%,transparent_70%)] lg:hidden" />
        <div className="relative w-full max-w-md px-6 py-16">
          <div className="lg:hidden mb-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-primary-foreground text-sm">P</div>
              <span className="font-bold text-xl text-foreground">Platz<span className="text-primary">Go!</span></span>
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground dark:text-foreground">Entrar</h1>
          <p className="mt-2 text-sm text-muted-foreground">Use seu email e senha para acessar.</p>

        {props.success === "signup" ? (
          <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
            Cadastro efetuado com sucesso. Agora é só entrar.
          </div>
        ) : null}

        {props.loggedOut ? (
          <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm text-foreground">
            Você saiu do sistema com sucesso.
          </div>
        ) : null}

        {props.resetDone ? (
          <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
            Senha redefinida com sucesso. Agora é só entrar.
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="ph-card mt-6 p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">Sou</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole("CUSTOMER")}
                  className={
                    role === "CUSTOMER"
                      ? "rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
                      : "rounded-full border border-border bg-card px-4 py-3 text-sm text-foreground dark:border-border dark:bg-card dark:text-foreground"
                  }
                >
                  Cliente
                </button>
                <button
                  type="button"
                  onClick={() => setRole("OWNER")}
                  className={
                    role === "OWNER"
                      ? "rounded-full bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
                      : "rounded-full border border-border bg-card px-4 py-3 text-sm text-foreground dark:border-border dark:bg-card dark:text-foreground"
                  }
                >
                  Dono de Arena
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ph-input mt-2"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ph-input mt-2"
                required
              />

              <div className="mt-2 text-right text-sm">
                <a className="font-semibold text-foreground underline dark:text-foreground" href="/forgot-password">
                  Esqueci minha senha
                </a>
              </div>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <button type="submit" disabled={isPending} className="ph-button w-full">
              {isPending ? "Entrando..." : "Entrar"}
            </button>

            <div className="text-center text-sm text-muted-foreground">
              Não tem conta?{" "}
              <a
                className="font-semibold text-foreground underline dark:text-foreground"
                href={`/signup?callbackUrl=${encodeURIComponent(props.callbackUrl)}&role=${role}`}
              >
                Criar conta
              </a>
            </div>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}
