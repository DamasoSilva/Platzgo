import { OptimizedImage } from "@/components/OptimizedImage";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { formatSportLabel } from "@/lib/utils/sport";
import { PrefilledCourtLink } from "@/components/PrefilledCourtLink";
import { MapPin, Clock, Instagram, MessageCircle, Star } from "lucide-react";

export function CourtCard({
  court,
  coverUrl,
  waLink,
  day,
  time,
  hasDayParam,
  hasTimeParam,
}: {
  court: {
    id: string;
    name: string;
    sport_type: string;
    price_per_hour: number;
    photo_urls: string[];
    amenities?: string[];
  };
  coverUrl: string | null;
  waLink: string;
  day: string;
  time: string | null;
  hasDayParam: boolean;
  hasTimeParam: boolean;
}) {
  const courtPhoto = (court.photo_urls ?? []).find((u) => (u ?? "").trim()) ?? coverUrl;
  const amenities = (court.amenities ?? []).filter(Boolean);

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-card border border-border/60 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300">
      <div className="relative overflow-hidden aspect-[16/10] bg-secondary/30">
        {courtPhoto ? (
          <OptimizedImage
            src={courtPhoto}
            alt={`Quadra ${court.name}`}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Sem foto
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card/90 to-transparent pointer-events-none" />
        <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {formatSportLabel(court.sport_type)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/90 px-2.5 py-1 text-xs font-bold text-primary-foreground backdrop-blur-sm">
            {formatBRLFromCents(court.price_per_hour)}/h
          </span>
        </div>
      </div>

      <div className="px-5 py-4">
        <h3 className="font-semibold text-foreground truncate">{court.name}</h3>

        {amenities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {amenities.slice(0, 4).map((a) => (
              <span key={a} className="inline-flex rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {a}
              </span>
            ))}
            {amenities.length > 4 && (
              <span className="inline-flex rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                +{amenities.length - 4}
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <PrefilledCourtLink
            courtId={court.id}
            day={day}
            time={time}
            hasDayParam={hasDayParam}
            hasTimeParam={hasTimeParam}
            className="ph-button-sm flex-1"
          >
            Ver horários
          </PrefilledCourtLink>

          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="ph-button-secondary-sm flex-shrink-0"
            aria-label="WhatsApp"
          >
            <MessageCircle className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

export function CourtSidebarCard({
  court,
  waLink,
  avgRating,
  reviewsCount,
  day,
  time,
  hasDayParam,
  hasTimeParam,
}: {
  court: {
    id: string;
    name: string;
    sport_type: string;
    price_per_hour: number;
    photo_urls: string[];
    amenities?: string[];
  };
  waLink: string;
  avgRating: number | null;
  reviewsCount: number | null;
  day: string;
  time: string | null;
  hasDayParam: boolean;
  hasTimeParam: boolean;
}) {
  const courtPhotos = (court.photo_urls ?? []).filter((u) => (u ?? "").trim());
  const amenities = (court.amenities ?? []).filter(Boolean);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-xl font-bold text-foreground">{court.name}</h2>

      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Star size={14} className="text-primary" />
        {avgRating != null ? (
          <>
            <span className="font-semibold text-foreground">{avgRating.toFixed(1)}</span>
            <span>•</span>
            <span>{reviewsCount ?? 0} avaliações</span>
          </>
        ) : (
          <span>Sem avaliações</span>
        )}
      </div>

      <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Esporte</span>
          <span className="font-semibold text-foreground">{formatSportLabel(court.sport_type)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Preço/hora</span>
          <span className="font-semibold text-foreground">{formatBRLFromCents(court.price_per_hour)}</span>
        </div>
      </div>

      {courtPhotos.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-secondary/30">
          <div className="relative aspect-[16/10] w-full">
            <OptimizedImage
              src={courtPhotos[0]!}
              alt={`Foto da quadra ${court.name}`}
              fill
              className="object-cover"
              sizes="400px"
            />
          </div>
        </div>
      )}

      {amenities.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-secondary/50 p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Comodidades</p>
          <div className="flex flex-wrap gap-1.5">
            {amenities.map((a) => (
              <span key={a} className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] text-foreground">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <PrefilledCourtLink
          courtId={court.id}
          day={day}
          time={time}
          hasDayParam={hasDayParam}
          hasTimeParam={hasTimeParam}
          className="ph-button-sm flex-1"
        >
          Ver horários
        </PrefilledCourtLink>

        <a
          href={waLink}
          target="_blank"
          rel="noreferrer"
          className="ph-button-secondary-sm flex-shrink-0"
          aria-label="WhatsApp"
        >
          <MessageCircle className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

export function EstablishmentHeader({
  name,
  address,
  description,
  openingTime,
  closingTime,
  waLink,
  mapsHref,
  instagramUrl,
}: {
  name: string;
  address: string;
  description: string | null;
  openingTime: string;
  closingTime: string;
  waLink: string;
  mapsHref: string;
  instagramUrl: string | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-card/80 border border-border/60 backdrop-blur-sm">
      <div className="p-6 sm:p-8">
        <p className="ph-kicker text-xs">Escolha sua quadra e horário</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          {name}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
            {address}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
            {openingTime} às {closingTime}
          </span>
        </div>

        {description && (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground/80">
            {description}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="ph-button-sm inline-flex items-center gap-1.5"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            className="ph-button-secondary-sm inline-flex items-center gap-1.5"
          >
            <MapPin className="h-4 w-4" />
            Ver no mapa
          </a>
          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noreferrer"
              className="ph-button-secondary-sm inline-flex items-center gap-1.5"
            >
              <Instagram className="h-4 w-4" />
              Instagram
            </a>
          )}
        </div>
      </div>
    </div>
  );
}