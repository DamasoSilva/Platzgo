"use client";

import { useMemo, useState, useTransition, useRef } from "react";
import { User, Mail, Phone, FileText, MapPin, Camera, CheckCircle2, AlertCircle, Shield } from "lucide-react";
import { PlacesLocationPicker } from "@/components/PlacesLocationPicker";
import { CustomerHeader } from "@/components/CustomerHeader";
import { updateMyProfile } from "@/lib/actions/profile";
import { OptimizedImage } from "@/components/OptimizedImage";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;

async function uploadUserAvatar(file: File): Promise<string> {
  const res = await fetch("/api/uploads", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "users", files: [{ name: file.name, type: file.type, size: file.size }] }),
  });
  const data = (await res.json().catch(() => null)) as { items?: Array<{ uploadUrl: string; publicUrl: string; contentType: string }>; error?: string } | null;
  if (!res.ok) throw new Error(data?.error || "Erro ao preparar upload");
  const item = data?.items?.[0];
  if (!item?.uploadUrl || !item.publicUrl) throw new Error("Resposta de upload inválida");
  const put = await fetch(item.uploadUrl, { method: "PUT", headers: { "Content-Type": item.contentType || file.type || "application/octet-stream" }, body: file });
  if (!put.ok) throw new Error("Falha no upload do arquivo");
  return item.publicUrl;
}

type Props = {
  apiKey: string;
  viewer: { isLoggedIn: boolean; name?: string | null; image?: string | null; role?: import("@/generated/prisma/enums").Role | null };
  initial: { name: string; email: string; whatsapp_number: string; cpf_cnpj: string; address_text: string; latitude?: number; longitude?: number; image?: string };
};

export function ProfileClient(props: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [name, setName] = useState(props.initial.name);
  const [whatsapp, setWhatsapp] = useState(props.initial.whatsapp_number);
  const [cpfCnpj, setCpfCnpj] = useState(props.initial.cpf_cnpj);
  const [address, setAddress] = useState(props.initial.address_text);
  const [lat, setLat] = useState<number | null>(typeof props.initial.latitude === "number" ? props.initial.latitude : null);
  const [lng, setLng] = useState<number | null>(typeof props.initial.longitude === "number" ? props.initial.longitude : null);
  const [image, setImage] = useState<string | null>(props.initial.image ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const locationReady = useMemo(() => typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng), [lat, lng]);
  const cpfValid = useMemo(() => /^\d{11}$/.test(cpfCnpj.replace(/\D/g, "")) || /^\d{14}$/.test(cpfCnpj.replace(/\D/g, "")), [cpfCnpj]);
  const hasChanges = name !== props.initial.name || whatsapp !== props.initial.whatsapp_number || cpfCnpj !== props.initial.cpf_cnpj || address !== props.initial.address_text;

  async function onPickAvatar(file: File) {
    setMessage(null);
    if (!file.type.startsWith("image/")) { setMessage({ type: "error", text: "Envie apenas imagens." }); return; }
    if (file.size > MAX_AVATAR_BYTES) { setMessage({ type: "error", text: "Imagem muito grande (máx 3MB)." }); return; }
    setIsUploading(true);
    try {
      const url = await uploadUserAvatar(file);
      await updateMyProfile({ image: url });
      setImage(url);
      setMessage({ type: "success", text: "Foto atualizada!" });
    } catch (e) { setMessage({ type: "error", text: e instanceof Error ? e.message : "Erro ao atualizar foto" }); }
    finally { setIsUploading(false); }
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        await updateMyProfile({ name, whatsapp_number: whatsapp, cpf_cnpj: cpfCnpj, address_text: address, latitude: locationReady ? lat! : undefined, longitude: locationReady ? lng! : undefined });
        setMessage({ type: "success", text: "Perfil atualizado com sucesso!" });
      } catch (e) { setMessage({ type: "error", text: e instanceof Error ? e.message : "Erro ao salvar" }); }
    });
  }

  return (
    <div className="ph-page">
      <CustomerHeader variant="light" viewer={props.viewer} rightSlot={null} />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pb-16 pt-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Meu perfil</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gerencie seus dados pessoais e preferências.</p>
        </div>

        {message && (
          <div className={`mb-6 rounded-2xl border p-4 flex items-center gap-3 text-sm ${message.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
            {message.type === "success" ? <CheckCircle2 className="h-5 w-5 flex-shrink-0" /> : <AlertCircle className="h-5 w-5 flex-shrink-0" />}
            {message.text}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Avatar header */}
          <div className="relative h-32 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent">
            <div className="absolute -bottom-10 left-6 flex items-end gap-4">
              <div className="relative">
                <div className="h-24 w-24 rounded-full border-4 border-card bg-secondary overflow-hidden shadow-lg">
                  {image ? (
                    <OptimizedImage src={image} alt="Avatar" width={96} height={96} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-secondary">
                      <User className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" disabled={isUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickAvatar(f); }} />
              </div>
              <div className="pb-2">
                <h2 className="text-lg font-bold text-foreground">{props.initial.name || "Usuário"}</h2>
                <p className="text-xs text-muted-foreground">{props.initial.email}</p>
              </div>
            </div>
          </div>

          <div className="px-6 pt-14 pb-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
                  <User className="h-3.5 w-3.5" /> Nome
                </label>
                <input className="ph-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome completo" />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
                  <Mail className="h-3.5 w-3.5" /> Email
                </label>
                <input className="ph-input opacity-60" value={props.initial.email} disabled />
                <p className="mt-1 text-[10px] text-muted-foreground">Gerencie seu email nas configurações da conta.</p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
                  <Phone className="h-3.5 w-3.5" /> WhatsApp
                </label>
                <input className="ph-input" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+55 (11) 99999-9999" />
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
                  <FileText className="h-3.5 w-3.5" /> CPF/CNPJ
                </label>
                <input
                  className="ph-input" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value.replace(/\D/g, "").slice(0, 14))}
                  placeholder="Somente números" inputMode="numeric" maxLength={14}
                />
                <div className="mt-1 flex items-center gap-1.5">
                  {cpfCnpj.length > 0 && (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${cpfValid ? "text-emerald-500" : "text-destructive"}`}>
                      {cpfValid ? <><CheckCircle2 className="h-3 w-3" /> Válido</> : <><AlertCircle className="h-3 w-3" /> Inválido</>}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">Obrigatório para pagamentos online</span>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
                  <MapPin className="h-3.5 w-3.5" /> Endereço
                </label>
                <PlacesLocationPicker
                  apiKey={props.apiKey}
                  label=""
                  initial={{ address, lat: lat ?? undefined, lng: lng ?? undefined }}
                  onChange={({ address, lat: newLat, lng: newLng }) => { setAddress(address); setLat(newLat); setLng(newLng); }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                Seus dados são protegidos e nunca compartilhados.
              </div>
              <button type="button" className="ph-button" disabled={isPending || !hasChanges} onClick={save}>
                {isPending ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}