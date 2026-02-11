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
    const address = props.initial?.address;
    if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { address: address ?? "", lat, lng };
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
      setError("Geolocalização não suportada neste navegador.");
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
      () => setError("Não foi possível obter sua localização."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  return (
    <div className="space-y-2">
      {buttonPlacement === "inline" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            className={
              "block text-xs font-medium " +
              (variant === "dark" ? "text-zinc-200" : "text-zinc-700 dark:text-zinc-300")
            }
            style={props.labelStyle}
          >
            {props.label ?? "Localização"}
          </label>
          <button
            type="button"
            onClick={requestMyLocation}
            className={
              variant === "dark"
                ? "ph-button-secondary-xs"
                : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            }
          >
            Usar minha localização
          </button>
        </div>
      ) : (
        <label
          className={
            "block text-xs font-bold " + (variant === "dark" ? "text-zinc-200" : "text-zinc-700 dark:text-zinc-300")
          }
          style={props.labelStyle}
        >
          {props.label ?? "Localização"}
        </label>
      )}

      <input
        ref={inputRef}
        placeholder={apiKey ? "Digite o endereço e selecione uma sugestão" : "Defina a API key do Google Maps"}
        className={
          variant === "dark"
            ? "mt-2 w-full rounded-xl bg-zinc-100/90 px-4 py-3 text-sm text-black outline-none focus:ring-2 focus:ring-[#CCFF00]"
            : "ph-input"
        }
      />

      {buttonPlacement === "below" ? (
        <div className="pt-1">
          <button
            type="button"
            onClick={requestMyLocation}
            className={
              variant === "dark"
                ? "ph-button"
                : "ph-button-secondary"
            }
          >
            Usar minha localização
          </button>
        </div>
      ) : null}

      {value ? (
        <p className={variant === "dark" ? "text-xs text-zinc-300" : "ph-help"}>Coordenadas capturadas automaticamente.</p>
      ) : props.required ? (
        <p className={variant === "dark" ? "text-xs text-zinc-300" : "ph-help"}>Selecione um endereço ou use o GPS.</p>
      ) : null}

      {error ? <p className={variant === "dark" ? "text-sm text-red-200" : "text-sm text-red-600"}>{error}</p> : null}
    </div>
  );
}
