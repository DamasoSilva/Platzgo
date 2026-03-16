"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

import { loadGoogleMaps } from "@/lib/client/googleMaps";

type Props = {
  apiKey: string;
  label?: string;
  labelStyle?: CSSProperties;
  required?: boolean;
  variant?: "light" | "dark";
  buttonPlacement?: "inline" | "below";
  initial?: {
    address?: string;
    lat?: number;
    lng?: number;
  };
  onChange: (value: { address: string; lat: number; lng: number }) => void;
};

export function PlacesLocationPicker(props: Props) {
  const apiKey = props.apiKey;
  const onChange = props.onChange;
  const variant = props.variant ?? "light";
  const buttonPlacement = props.buttonPlacement ?? "inline";

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<{ address: string; lat: number; lng: number } | null>(() => {
    const lat = props.initial?.lat;
    const lng = props.initial?.lng;
    const address = props.initial?.address ?? "";
    if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { address, lat, lng };
    }
    return null;
  });

  useEffect(() => {
    if (!inputRef.current) return;
    if (props.initial?.address) inputRef.current.value = props.initial.address;
  }, [props.initial?.address]);

  useEffect(() => {
    if (!apiKey) return;
    if (!inputRef.current) return;

    let cancelled = false;
    let listener: google.maps.MapsEventListener | null = null;

    Promise.resolve().then(() => {
      if (cancelled) return;
      setError(null);
    });

    void (async () => {
      try {
        await loadGoogleMaps(apiKey);
        if (cancelled) return;
        if (!window.google?.maps?.places) return;

        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current!, {
          fields: ["formatted_address", "geometry"],
          types: ["geocode"],
        });

        listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const address = place.formatted_address ?? "";
          const loc = place.geometry?.location;
          if (!loc) return;
          const next = { address, lat: loc.lat(), lng: loc.lng() };
          setValue(next);
          onChange(next);
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erro ao carregar Google Maps");
      }
    })();

    return () => {
      cancelled = true;
      if (listener) {
        window.google?.maps.event.removeListener(listener);
      }
    };
  }, [apiKey, onChange]);

  async function requestMyLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError("Geolocalizacao nao suportada neste navegador.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        let address = value?.address ?? "";

        if (apiKey) {
          try {
            await loadGoogleMaps(apiKey);
            const geocoder = new window.google.maps.Geocoder();
            const res = await geocoder.geocode({ location: { lat, lng } });
            const formatted = res.results?.[0]?.formatted_address;
            if (formatted) address = formatted;
            if (inputRef.current && formatted) inputRef.current.value = formatted;
          } catch {
            // silencioso
          }
        }

        const next = { address, lat, lng };
        setValue(next);
        onChange(next);
      },
      (err) => {
        if (err?.code === 1) {
          setError("Permissao de localizacao negada. Ative o acesso a localizacao no navegador.");
          return;
        }
        if (err?.code === 2) {
          setError("Localizacao indisponivel. Verifique o GPS ou a conexao.");
          return;
        }
        if (err?.code === 3) {
          setError("Tempo esgotado ao obter a localizacao. Tente novamente.");
          return;
        }
        setError("Nao foi possivel obter sua localizacao.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  const labelClass = "block text-xs font-medium text-muted-foreground";
  const inlineButtonClass = "ph-button-secondary-xs";
  const inputClass =
    variant === "dark"
      ? "mt-2 w-full rounded-xl border border-input bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      : "ph-input";

  return (
    <div className="space-y-2">
      {buttonPlacement === "inline" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className={labelClass} style={props.labelStyle}>
            {props.label ?? "Localizacao"}
          </label>
          <button type="button" onClick={requestMyLocation} className={inlineButtonClass}>
            Usar minha localizacao
          </button>
        </div>
      ) : (
        <label className={labelClass} style={props.labelStyle}>
          {props.label ?? "Localizacao"}
        </label>
      )}

      <input
        ref={inputRef}
        placeholder={apiKey ? "Digite o endereco e selecione uma sugestao" : "Defina a API key do Google Maps"}
        className={inputClass}
      />

      {buttonPlacement === "below" ? (
        <div className="pt-1">
          <button type="button" onClick={requestMyLocation} className={variant === "dark" ? "ph-button" : "ph-button-secondary"}>
            Usar minha localizacao
          </button>
        </div>
      ) : null}

      {value ? (
        <p className="text-xs text-muted-foreground">Coordenadas capturadas automaticamente.</p>
      ) : props.required ? (
        <p className="text-xs text-muted-foreground">Selecione um endereco ou use o GPS.</p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
