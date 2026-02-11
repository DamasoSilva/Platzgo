"use client";

import { useMemo, useState, useTransition } from "react";

import { PlacesLocationPicker } from "@/components/PlacesLocationPicker";
import { CustomerHeader } from "@/components/CustomerHeader";
import { updateMyProfile } from "@/lib/actions/profile";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

async function uploadUserAvatar(file: File): Promise<string> {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prefix: "users",
      files: [{ name: file.name, type: file.type, size: file.size }],
    }),
  });

  const data = (await res.json().catch(() => null)) as
    | null
    | { items?: Array<{ uploadUrl: string; publicUrl: string; contentType: string }>; error?: string };

  if (!res.ok) throw new Error(data?.error || "Erro ao preparar upload");
  const item = data?.items?.[0];
  if (!item?.uploadUrl || !item.publicUrl) throw new Error("Resposta de upload inválida");

  const put = await fetch(item.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": item.contentType || file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) throw new Error("Falha no upload do arquivo");

  return item.publicUrl;
}

type Props = {
  apiKey: string;
  viewer: {
    isLoggedIn: boolean;
    name?: string | null;
    image?: string | null;
    role?: import("@/generated/prisma/enums").Role | null;
  };
  initial: {
    name: string;
    email: string;
    whatsapp_number: string;
    address_text: string;
    latitude?: number;
    longitude?: number;
    image?: string;
  };
};

export function ProfileClient(props: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [name, setName] = useState(props.initial.name);
  const [whatsapp, setWhatsapp] = useState(props.initial.whatsapp_number);
  const [address, setAddress] = useState(props.initial.address_text);
  const [lat, setLat] = useState<number | null>(typeof props.initial.latitude === "number" ? props.initial.latitude : null);
  const [lng, setLng] = useState<number | null>(typeof props.initial.longitude === "number" ? props.initial.longitude : null);
  const [image, setImage] = useState<string | null>(props.initial.image ?? null);

  const locationReady = useMemo(() => typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng), [lat, lng]);

  async function onPickAvatar(file: File) {
    setMessage(null);

    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Envie apenas imagens para foto de perfil." });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setMessage({ type: "error", text: "Imagem muito grande (máx 3MB)." });
      return;
    }

    startTransition(async () => {
      try {
        const url = await uploadUserAvatar(file);
        await updateMyProfile({ image: url });
        setImage(url);
        setMessage({ type: "success", text: "Foto de perfil atualizada." });
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Erro ao atualizar foto" });
      }
    });
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        await updateMyProfile({
          name,
          whatsapp_number: whatsapp,
          address_text: address,
          latitude: locationReady ? lat! : undefined,
          longitude: locationReady ? lng! : undefined,
        });
        setMessage({ type: "success", text: "Perfil atualizado com sucesso." });
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Erro ao salvar" });
      }
    });
  }

  return (
    <div className="ph-page">
      <CustomerHeader variant="light" viewer={props.viewer} rightSlot={null} />

      <div className="mx-auto max-w-4xl px-6 pb-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Meu perfil</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Gerencie seus dados de cadastro.</p>
          </div>
        </div>

        {message ? (
          <div
            className={
              "mt-6 rounded-2xl border p-4 text-sm " +
              (message.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
                : "border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100")
            }
          >
            {message.text}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Foto de perfil</p>
              <div className="mt-4 flex items-center gap-4">
                <div className="h-20 w-20 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label className="ph-button-secondary inline-flex cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isPending}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        void onPickAvatar(f);
                      }}
                    />
                    Alterar foto
                  </label>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">PNG/JPG/WebP • até 3MB</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome</label>
                  <input className="ph-input mt-2" value={name} onChange={(e) => setName(e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Email</label>
                  <input className="ph-input mt-2" value={props.initial.email} disabled />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Telefone/WhatsApp</label>
                  <input className="ph-input mt-2" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                </div>

                <div className="sm:col-span-2">
                  <PlacesLocationPicker
                    apiKey={props.apiKey}
                    label="Sua localização"
                    initial={{ address, lat: lat ?? undefined, lng: lng ?? undefined }}
                    onChange={({ address, lat, lng }) => {
                      setAddress(address);
                      setLat(lat);
                      setLng(lng);
                    }}
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button type="button" className="ph-button" disabled={isPending} onClick={save}>
                  {isPending ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
