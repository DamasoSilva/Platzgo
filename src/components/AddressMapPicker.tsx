"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { loadGoogleMaps } from "@/lib/client/googleMaps";

type AddressMapPickerProps = {
  apiKey: string;
  initialAddress?: string;
  initialLat?: number;
  initialLng?: number;
  onChange: (value: { address: string; lat: number; lng: number }) => void;
};

export function AddressMapPicker(props: AddressMapPickerProps) {
  const { apiKey, initialAddress, onChange } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialCenter = useMemo(() => {
    if (Number.isFinite(props.initialLat) && Number.isFinite(props.initialLng)) {
      return { lat: props.initialLat as number, lng: props.initialLng as number };
    }
    return { lat: -23.55052, lng: -46.633308 }; // SP default
  }, [props.initialLat, props.initialLng]);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (cancelled) return;
      setError(null);
    });

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled) return;
        setReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erro ao carregar Google Maps");
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!ready) return;
    if (!inputRef.current || !mapRef.current) return;
    if (!window.google?.maps?.places) return;

    const map = new window.google.maps.Map(mapRef.current, {
      center: initialCenter,
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
    });

    const marker = new window.google.maps.Marker({
      map,
      position: initialCenter,
    });

    if (initialAddress && inputRef.current) {
      inputRef.current.value = initialAddress;
    }

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "geometry"],
      types: ["geocode"],
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const address = place.formatted_address;
      const location = place.geometry?.location;

      if (!address || !location) return;

      const lat = location.lat();
      const lng = location.lng();

      map.setCenter({ lat, lng });
      marker.setPosition({ lat, lng });

      onChange({ address, lat, lng });
    });

    return () => {
      window.google?.maps.event.removeListener(listener);
    };
  }, [ready, initialCenter, initialAddress, onChange]);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Endereço</label>
      <input
        ref={inputRef}
        placeholder="Digite e selecione um endereço"
        className="ph-input"
      />
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <p className="ph-help">
          Dica: selecione uma sugestão do Autocomplete para capturar lat/lng.
        </p>
      )}
      <div
        ref={mapRef}
        className="h-72 w-full rounded-3xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
      />
    </div>
  );
}
