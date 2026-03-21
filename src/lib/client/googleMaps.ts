"use client";

declare global {
  interface Window {
    google?: typeof google;
  }
}

let googleMapsPromise: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();

  if (googleMapsPromise) return googleMapsPromise;

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-google-maps="true"]'
  );

  if (existing) {
    googleMapsPromise = new Promise((resolve, reject) => {
      if (window.google?.maps) {
        resolve();
        return;
      }

      const onLoad = () => {
        if (window.google?.maps) {
          resolve();
          return;
        }
        reject(new Error("Google Maps carregado sem objeto maps"));
      };
      const onError = () => reject(new Error("Falha ao carregar Google Maps"));

      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
    });

    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset.googleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places`;
    script.onload = () => {
      if (window.google?.maps) {
        resolve();
        return;
      }
      reject(new Error("Google Maps carregado sem objeto maps"));
    };
    script.onerror = () => reject(new Error("Falha ao carregar Google Maps"));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}
