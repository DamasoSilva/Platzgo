"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { requestPasswordReset, resetPasswordWithCode, verifyPasswordResetCode } from "@/lib/actions/passwordReset";

export function ResetPasswordClient(props: { initialEmail?: string | null; sent?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(props.initialEmail ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [resendCooldown, setResendCooldown] = useState(0);

  const canVerify = useMemo(() => email.trim().length > 3 && /^[0-9]{6}$/.test(code.trim()), [email, code]);
  const canReset = useMemo(
    () => verified && password.length >= 8 && password === confirm,
    [verified, password, confirm]
  );

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (props.sent) {
      setResendCooldown(60);
    }
  }, [props.sent]);

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    startTransition(async () => {
      try {
        await verifyPasswordResetCode({ email, code });
        setVerified(true);
        setInfo("Código verificado. Defina sua nova senha.");
      } catch (err) {
        setVerified(false);
        setError(err instanceof Error ? err.message : "Código inválido ou expirado");
      }
    });
  }

  function handleResend() {
    if (!email) {
      setError("Informe o email para reenviar o código.");
      return;
    }
    if (resendCooldown > 0) return;

    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        const res = await requestPasswordReset({ email });
        const retryMs = res?.retryAfterMs ?? 0;
        if (retryMs > 0) {
          setResendCooldown(Math.ceil(retryMs / 1000));
          setInfo("Aguarde para reenviar o código.");
          return;
        }
        setResendCooldown(60);
        setInfo("Reenvio do e-mail realizado com sucesso.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível reenviar o código");
      }
    });
  }

  function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }

    startTransition(async () => {
      try {
        await resetPasswordWithCode({ email, code, password });
        router.replace("/signin?reset=1");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível redefinir a senha");
      }
    });
  }

  return (
    <div className="ph-page">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#CCFF00]/15 blur-3xl" />
      <div className="relative mx-auto max-w-md px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Redefinir senha</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Informe seu email. Enviaremos um código para redefinir sua senha.
        </p>

        {info || props.sent ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            {info ?? "Se existir uma conta com esse email, enviamos um código para redefinir a senha."}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        {!verified ? (
          <form className="ph-card mt-6 p-6 space-y-4" onSubmit={handleVerify}>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Email</label>
              <input
                type="email"
                className="ph-input mt-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Código</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="ph-input mt-2"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex: 123456"
                required
              />
            </div>

            <button type="submit" className="ph-button w-full" disabled={!canVerify || isPending}>
              Verificar código
            </button>

            <button
              type="button"
              className="ph-button-secondary w-full"
              onClick={handleResend}
              disabled={isPending || resendCooldown > 0}
            >
              {resendCooldown > 0 ? `Reenviar código (${resendCooldown}s)` : "Reenviar código"}
            </button>
          </form>
        ) : null}

        {verified ? (
          <form className="ph-card mt-4 p-6 space-y-4" onSubmit={handleReset}>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nova senha</label>
              <input
                type="password"
                className="ph-input mt-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Mínimo de 8 caracteres.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Confirmar nova senha</label>
              <input
                type="password"
                className="ph-input mt-2"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <button type="submit" className="ph-button w-full" disabled={!canReset || isPending}>
                Confirmar nova senha
              </button>
              <button
                type="button"
                className="ph-button-secondary w-full"
                onClick={() => router.replace("/signin")}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}

        <div className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
          <Link className="font-semibold text-zinc-900 underline dark:text-zinc-100" href="/signin">
            Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}
