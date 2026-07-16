"use client";

import Image from "next/image";
import { useState } from "react";

const FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600' fill='%231a1f2e'%3E%3Crect width='800' height='600'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23333a4d' font-size='16' font-family='sans-serif'%3ESem foto%3C/text%3E%3C/svg%3E";

export function OptimizedImage({
  src,
  alt,
  fill = false,
  width,
  height,
  className = "",
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  priority = false,
  quality = 85,
}: {
  src: string | null | undefined;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
  quality?: number;
}) {
  const [error, setError] = useState(false);

  const safeSrc = src && src.trim() ? src : FALLBACK;

  if (fill) {
    return (
      <div className={`relative ${className}`}>
        <Image
          src={error ? FALLBACK : safeSrc}
          alt={alt}
          fill
          sizes={sizes}
          className="object-cover"
          priority={priority}
          quality={quality}
          unoptimized={safeSrc === FALLBACK}
          onError={() => setError(true)}
        />
      </div>
    );
  }

  return (
    <Image
      src={error ? FALLBACK : safeSrc}
      alt={alt}
      width={width ?? 800}
      height={height ?? 600}
      className={className}
      sizes={sizes}
      priority={priority}
      quality={quality}
      unoptimized={safeSrc === FALLBACK}
      onError={() => setError(true)}
    />
  );
}