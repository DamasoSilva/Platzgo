"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { signIn } from "next-auth/react";

import { PlacesLocationPicker } from "@/components/PlacesLocationPicker";
import { BrazilPhoneInput, isValidBrazilNationalDigits, toBrazilE164FromNationalDigits } from "@/components/BrazilPhoneInput";
import { registerCustomerSafe, registerOwnerSafe, resendEmailVerificationCode, verifyEmailCode } from "@/lib/actions/users";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/utils/cpfCnpj";

type SignUpRole = "CUSTOMER" | "OWNER";

const PROFILE_MAX_PHOTOS = 7;
const PROFILE_MAX_VIDEOS = 2;

function validateMediaFiles(files: File[]): void {
  const allowedVideoTypes = new Set(["video/mp4", "video/webm"]);

  for (const f of files) {
    const type = (f.type || "").toLowerCase();
    if (type.startsWith("image/")) continue;
    if (allowedVideoTypes.has(type)) continue;
    throw new Error("Apenas imagens e vídeos MP4/WebM são permitidos.");
  }
}

function countSelectedMedia(files: File[]): { photos: number; videos: number } {
  let photos = 0;
  let videos = 0;
  for (const f of files) {
    const t = (f.type || "").toLowerCase();
    if (t.startsWith("image/")) photos += 1;
    else if (t === "video/mp4" || t === "video/webm") videos += 1;
  }
  return { photos, videos };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}


function UploadPickerButton(props: {
  label: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const id = useId();

  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        disabled={props.disabled}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          props.onFiles(files);
        }}
      />
      <label
        htmlFor={id}
        className={
          "ph-button inline-flex cursor-pointer items-center justify-center" +
          (props.disabled ? " pointer-events-none opacity-60" : "")
        }
      >
        {props.label}
      </label>
    </div>
  );
}

export function SignUpForm(props: { callbackUrl: string; initialRole?: SignUpRole }) {
  const router = useRouter();

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<SignUpRole>(props.initialRole ?? "CUSTOMER");

  // CUSTOMER
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [whatsappDigits, setWhatsappDigits] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [customerLoc, setCustomerLoc] = useState<{ address: string; lat: number; lng: number } | null>(null);

  // OWNER
  const [arenaName, setArenaName] = useState("");
  const [arenaWhatsappDigits, setArenaWhatsappDigits] = useState("");
  const [arenaContactDigits, setArenaContactDigits] = useState("");
  const [arenaInstagram, setArenaInstagram] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [ownerPhotoPreviews, setOwnerPhotoPreviews] = useState<string[]>([]);
  const [ownerLoc, setOwnerLoc] = useState<{ address: string; lat: number; lng: number } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "verify">("form");
  const [verificationEmail, setVerificationEmail] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState<string>("");

  const selectedCounts = useMemo(() => countSelectedMedia(photoFiles), [photoFiles]);
  const canUploadOwnerMedia = useMemo(() => isValidEmail(email), [email]);

  useEffect(() => {
    // Gera previews e limpa URLs antigas
    const next = photoFiles.map((f) => URL.createObjectURL(f));
    setOwnerPhotoPreviews(next);
    return () => {
      for (const url of next) URL.revokeObjectURL(url);
    };
  }, [photoFiles]);

  async function uploadOwnerPhotos(files: File[]): Promise<string[]> {
    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prefix: "establishments",
        email,
        roleIntent: "OWNER",
        files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      }),
    });

    const data = (await res.json().catch(() => null)) as
      | null
      | {
          items?: Array<{ key: string; uploadUrl: string; publicUrl: string; contentType: string }>;
          error?: string;
        };

    if (!res.ok) {
      throw new Error(data?.error || "Erro ao preparar upload das fotos");
    }

    const items = data?.items ?? [];
    if (items.length !== files.length) {
      throw new Error("Falha ao preparar upload: quantidade de URLs não confere");
    }

    // Upload direto para o storage
    await Promise.all(
      items.map((item, idx) => {
        const file = files[idx]!;
        return fetch(item.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": item.contentType || file.type || "application/octet-stream",
          },
          body: file,
        }).then(async (r) => {
          if (!r.ok) {
            const text = await r.text().catch(() => "");
            throw new Error(`Erro no upload da imagem (${r.status}): ${text || "falha"}`);
          }
        });
      })
    );

    return items.map((i) => i.publicUrl);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        if (role === "CUSTOMER") {
          if (!customerLoc) throw new Error("Selecione um endereço ou use o GPS");
          if (!isValidBrazilNationalDigits(whatsappDigits)) {
            throw new Error("Telefone/WhatsApp inválido. Informe DDD + número (fixo ou celular)." );
          }
          const cpfDigits = normalizeCpfCnpj(cpfCnpj);
          if (!cpfDigits) throw new Error("CPF/CNPJ é obrigatório");
          if (!isValidCpfCnpj(cpfDigits)) throw new Error("CPF/CNPJ inválido");
          const res = await registerCustomerSafe({
            name,
            email,
            password,
            whatsapp_number: toBrazilE164FromNationalDigits(whatsappDigits),
            cpf_cnpj: cpfDigits,
            address_text: customerLoc.address,
            latitude: customerLoc.lat,
            longitude: customerLoc.lng,
          });
          if (!res.ok) throw new Error(res.error);
          if (res?.verificationRequired) {
            setVerificationEmail(res.email ?? email);
            setStep("verify");
            return;
          }
        } else {
          if (!ownerLoc) throw new Error("Selecione o endereço da arena");
          if (photoFiles.length < 1) throw new Error("Inclua pelo menos 1 foto/vídeo da arena");
          validateMediaFiles(photoFiles);

          if (selectedCounts.photos > PROFILE_MAX_PHOTOS || selectedCounts.videos > PROFILE_MAX_VIDEOS) {
            throw new Error(`Limite do perfil: até ${PROFILE_MAX_PHOTOS} fotos e ${PROFILE_MAX_VIDEOS} vídeos.`);
          }
          if (!isValidBrazilNationalDigits(arenaWhatsappDigits)) {
            throw new Error("WhatsApp comercial inválido. Informe DDD + número (fixo ou celular)." );
          }
          if (arenaContactDigits.trim() && !isValidBrazilNationalDigits(arenaContactDigits)) {
            throw new Error("Número para contato inválido. Informe DDD + número (fixo ou celular)." );
          }

          const uploadedUrls = await uploadOwnerPhotos(photoFiles);
          const res = await registerOwnerSafe({
            email,
            password,
            arena_name: arenaName,
            whatsapp_number: toBrazilE164FromNationalDigits(arenaWhatsappDigits),
            contact_number: arenaContactDigits.trim()
              ? toBrazilE164FromNationalDigits(arenaContactDigits)
              : null,
            instagram_url: arenaInstagram.trim() || null,
            photo_urls: uploadedUrls,
            address_text: ownerLoc.address,
            latitude: ownerLoc.lat,
            longitude: ownerLoc.lng,
          });
          if (!res.ok) throw new Error(res.error);
          if (res?.verificationRequired) {
            setVerificationEmail(res.email ?? email);
            setStep("verify");
            return;
          }
        }

        const callbackUrl = role === "OWNER" ? "/dashboard/admin" : props.callbackUrl;
        router.push(
          `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}&role=${role}&success=signup`
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao cadastrar");
      }
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
            Crie sua conta<br />
            <span className="text-emerald-200">e entre em quadra.</span>
          </h2>
          <p className="mt-4 text-lg text-white/80 leading-relaxed">
            Cadastre-se para agendar quadras, acompanhar reservas e muito mais.
          </p>
          <div className="mt-8 flex items-center gap-4 text-sm text-white/70">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-300" />
              Rápido e gratuito
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-300" />
              Sem complicação
            </span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center relative overflow-y-auto">
        <div className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl lg:hidden" />
        <div className="relative w-full max-w-md px-6 py-16">
          <div className="lg:hidden mb-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center font-bold text-primary-foreground text-sm">P</div>
              <span className="font-bold text-xl text-foreground">Platz<span className="text-primary">Go!</span></span>
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground dark:text-foreground">Criar conta</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Escolha o tipo de conta e complete seu cadastro.
          </p>

        {step === "verify" ? (
          <div className="ph-card mt-6 p-6">
            <h2 className="text-lg font-semibold text-foreground dark:text-foreground">Verifique seu e-mail</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Enviamos um código para <strong>{verificationEmail}</strong>. Digite abaixo para finalizar o cadastro.
            </p>

            {error ? (
              <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
            ) : null}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                startTransition(async () => {
                  try {
                    await verifyEmailCode({ email: verificationEmail, code: verificationCode });
                    const callbackUrl = role === "OWNER" ? "/dashboard/admin" : props.callbackUrl;
                    const roleIntent = role === "OWNER" ? "ADMIN" : "CUSTOMER";
                    if (!password) {
                      router.push(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}&role=${role}&success=signup`);
                      return;
                    }

                    const result = await signIn("credentials", {
                      redirect: false,
                      email: verificationEmail,
                      password,
                      roleIntent,
                    });

                    if (result?.error) {
                      router.push(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}&role=${role}&success=signup`);
                      return;
                    }

                    router.push(callbackUrl);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Código inválido");
                  }
                });
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">Código</label>
                <input
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="ph-input mt-2"
                  inputMode="numeric"
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="submit" className="ph-button" disabled={isPending}>Confirmar código</button>
                <button
                  type="button"
                  className="ph-button-secondary"
                  disabled={isPending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      try {
                        await resendEmailVerificationCode({ email: verificationEmail });
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Erro ao reenviar código");
                      }
                    });
                  }}
                >
                  Reenviar código
                </button>
              </div>
            </form>
          </div>
        ) : (
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

            {role === "CUSTOMER" ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">Nome completo</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="ph-input mt-2" required />
                </div>

                <div>
                  <BrazilPhoneInput
                    label="Telefone/WhatsApp"
                    valueDigits={whatsappDigits}
                    onChangeDigits={setWhatsappDigits}
                    required
                    helpText="Aceita fixo (8 dígitos) ou celular (9 dígitos), sempre com DDD."
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">CPF/CNPJ</label>
                  <input
                    value={cpfCnpj}
                    onChange={(e) => setCpfCnpj(normalizeCpfCnpj(e.target.value).slice(0, 14))}
                    className="ph-input mt-2"
                    inputMode="numeric"
                    maxLength={14}
                    placeholder="Somente numeros"
                    required
                  />
                  <p className="ph-help mt-2">Obrigatório para pagamentos online.</p>
                </div>

                <div>
                  <PlacesLocationPicker
                    apiKey={apiKey}
                    label="Localização"
                    required
                    onChange={(v) => setCustomerLoc(v)}
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">Nome da Arena</label>
                  <input
                    value={arenaName}
                    onChange={(e) => setArenaName(e.target.value)}
                    className="ph-input mt-2"
                    required
                  />
                </div>

                <div>
                  <BrazilPhoneInput
                    label="WhatsApp Comercial"
                    valueDigits={arenaWhatsappDigits}
                    onChangeDigits={setArenaWhatsappDigits}
                    required
                    helpText="DDD + número. Aceita fixo ou celular."
                  />
                </div>

                <div>
                  <BrazilPhoneInput
                    label="Número para contato (opcional)"
                    valueDigits={arenaContactDigits}
                    onChangeDigits={setArenaContactDigits}
                    placeholder="(11) 99999-9999"
                    helpText="Se for fixo, digite apenas 8 dígitos após o DDD."
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">
                    Instagram (opcional)
                  </label>
                  <input
                    value={arenaInstagram}
                    onChange={(e) => setArenaInstagram(e.target.value)}
                    className="ph-input mt-2"
                    placeholder="@suaarena ou https://instagram.com/suaarena"
                  />
                </div>

                <div>
                  <PlacesLocationPicker
                    apiKey={apiKey}
                    label="Endereço da Arena"
                    required
                    onChange={(v) => setOwnerLoc(v)}
                  />
                </div>
              </>
            )}

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
              <p className="ph-help mt-2">Mínimo de 8 caracteres.</p>
            </div>

            {role === "OWNER" ? (
              <div>
                <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">Fotos e vídeos da Arena</label>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <UploadPickerButton
                    label={photoFiles.length ? "Adicionar mais arquivos" : "Adicionar arquivos"}
                    accept="image/*,video/mp4,video/webm"
                    multiple
                    disabled={isPending || !canUploadOwnerMedia}
                    onFiles={(files) => {
                      try {
                        validateMediaFiles(files);

                        const next = [...photoFiles, ...files];
                        const nextCounts = countSelectedMedia(next);
                        if (nextCounts.photos > PROFILE_MAX_PHOTOS || nextCounts.videos > PROFILE_MAX_VIDEOS) {
                          throw new Error(`Limite do perfil: até ${PROFILE_MAX_PHOTOS} fotos e ${PROFILE_MAX_VIDEOS} vídeos.`);
                        }

                        setPhotoFiles(next);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Erro ao selecionar arquivos");
                      }
                    }}
                  />
                  <div className="text-xs text-muted-foreground">
                    {selectedCounts.photos}/{PROFILE_MAX_PHOTOS} fotos · {selectedCounts.videos}/{PROFILE_MAX_VIDEOS} vídeos
                  </div>
                </div>
                <p className="ph-help mt-2">Pelo menos 1 mídia é obrigatória. Vídeos: MP4/WebM.</p>
                {!canUploadOwnerMedia ? (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                    Informe um e-mail válido para habilitar o upload.
                  </p>
                ) : null}

                {ownerPhotoPreviews.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {ownerPhotoPreviews.map((url, idx) => {
                      const file = photoFiles[idx];
                      const isVideo = Boolean(file && (file.type === "video/mp4" || file.type === "video/webm"));
                      return (
                        <div
                          key={url}
                          className="relative overflow-hidden rounded-2xl border border-border bg-secondary dark:border-border dark:bg-card"
                        >
                          {isVideo ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-24 w-full items-center justify-center bg-secondary text-foreground dark:bg-card dark:text-foreground"
                              title="Abrir vídeo em nova aba"
                            >
                              <span className="flex items-center gap-2 text-xs font-semibold">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-foreground/80 text-background">▶</span>
                                Vídeo
                              </span>
                            </a>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={url} alt="" className="h-24 w-full object-cover" />
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            className="absolute right-2 top-2 rounded-full bg-foreground/60 px-2 py-1 text-[10px] font-semibold text-white"
                          >
                            Remover
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <button type="submit" disabled={isPending} className="ph-button w-full">
              {isPending ? "Criando..." : "Criar conta"}
            </button>

            <div className="text-center text-sm text-muted-foreground">
              Já tem conta?{" "}
              <a
                className="font-semibold text-foreground underline dark:text-foreground"
                href={`/signin?callbackUrl=${encodeURIComponent(props.callbackUrl)}&role=${role}`}
              >
                Entrar
              </a>
            </div>
          </div>
          </form>
        )}
      </div>
      </div>
    </div>
  );
}
