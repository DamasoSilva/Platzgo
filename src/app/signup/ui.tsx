"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useId, useMemo, useState, useTransition } from "react";

import { PlacesLocationPicker } from "@/components/PlacesLocationPicker";
import { BrazilPhoneInput, isValidBrazilNationalDigits, toBrazilE164FromNationalDigits } from "@/components/BrazilPhoneInput";
import { registerCustomer, registerOwner, resendEmailVerificationCode, verifyEmailCode } from "@/lib/actions/users";

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
          const res = await registerCustomer({
            name,
            email,
            password,
            whatsapp_number: toBrazilE164FromNationalDigits(whatsappDigits),
            address_text: customerLoc.address,
            latitude: customerLoc.lat,
            longitude: customerLoc.lng,
          });
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
          const res = await registerOwner({
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
    <div className="ph-page">
      <div className="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[#CCFF00]/15 blur-3xl" />
      <div className="relative mx-auto max-w-md px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Criar conta</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Escolha o tipo de conta e complete seu cadastro.
        </p>

        {step === "verify" ? (
          <div className="ph-card mt-6 p-6">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Verifique seu e-mail</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Enviamos um código para <strong>{verificationEmail}</strong>. Digite abaixo para finalizar o cadastro.
            </p>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
            ) : null}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                startTransition(async () => {
                  try {
                    await verifyEmailCode({ email: verificationEmail, code: verificationCode });
                    const callbackUrl = role === "OWNER" ? "/dashboard/admin" : props.callbackUrl;
                    router.push(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}&role=${role}&success=signup`);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Código inválido");
                  }
                });
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Código</label>
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

            {role === "CUSTOMER" ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome completo</label>
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
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome da Arena</label>
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
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
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
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fotos e vídeos da Arena</label>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <UploadPickerButton
                      label={photoFiles.length ? "Adicionar mais arquivos" : "Adicionar arquivos"}
                      accept="image/*,video/mp4,video/webm"
                      multiple
                      disabled={isPending}
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
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {selectedCounts.photos}/{PROFILE_MAX_PHOTOS} fotos · {selectedCounts.videos}/{PROFILE_MAX_VIDEOS} vídeos
                    </div>
                  </div>
                  <p className="ph-help mt-2">Pelo menos 1 mídia é obrigatória. Vídeos: MP4/WebM.</p>

                  {ownerPhotoPreviews.length ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {ownerPhotoPreviews.map((url, idx) => {
                        const file = photoFiles[idx];
                        const isVideo = Boolean(file && (file.type === "video/mp4" || file.type === "video/webm"));
                        return (
                        <div
                          key={url}
                          className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          {isVideo ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-24 w-full items-center justify-center bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                              title="Abrir vídeo em nova aba"
                            >
                              <span className="flex items-center gap-2 text-xs font-semibold">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/80 text-white">▶</span>
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
                            className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white"
                          >
                            Remover
                          </button>
                        </div>
                      );
                      })}
                    </div>
                  ) : null}
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
              <p className="ph-help mt-2">Mínimo de 8 caracteres.</p>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button type="submit" disabled={isPending} className="ph-button w-full">
              {isPending ? "Criando..." : "Criar conta"}
            </button>

            <div className="text-center text-sm text-zinc-600 dark:text-zinc-400">
              Já tem conta?{" "}
              <a
                className="font-semibold text-zinc-900 underline dark:text-zinc-100"
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
  );
}
