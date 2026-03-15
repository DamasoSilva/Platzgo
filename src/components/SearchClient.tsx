"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { CustomerHeader } from "@/components/CustomerHeader";
import { PlacesLocationPicker } from "@/components/PlacesLocationPicker";
import { getNearbyEstablishments } from "@/lib/actions/establishments";
import { listSearchSportOptionsForPublic } from "@/lib/actions/sysadmin";
import { toggleFavoriteEstablishment } from "@/lib/actions/favorites";
import { loadGoogleMaps } from "@/lib/client/googleMaps";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { toWaMeLink } from "@/lib/utils/whatsapp";
import { SportType } from "@/generated/prisma/enums";

type NearbyEstablishment = Awaited<ReturnType<typeof getNearbyEstablishments>>[number];

type Props = {
  apiKey: string;
  viewer: { userId: string | null; isLoggedIn: boolean; role?: import("@/generated/prisma/enums").Role | null; name?: string | null; image?: string | null };
  hero?: {
    title: string;
    description: string;
  };
  showOwnerCtaOnLoggedOut?: boolean;
  showMarketingCardsOnLoggedOut?: boolean;
  showFooter?: boolean;
  initial: {
    lat: number;
    lng: number;
    address?: string;
    radiusKm: number;
    sport: SportType | "ALL";
    day: string;
    time?: string | null;
    q?: string;
    maxPrice?: number | null;
    onlyFavorites?: boolean;
    locationSource?: "user" | "query" | "default";
  };
};

type MarkerInfo = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export function SearchClient(props: Props) {
  const [isPending, startTransition] = useTransition();
  const [isFavPending, startFavTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [sportOptions, setSportOptions] = useState<Array<{ sport_type: SportType; label: string }>>([]);

  const [lat, setLat] = useState<number>(props.initial.lat);
  const [lng, setLng] = useState<number>(props.initial.lng);
  const [radiusKm, setRadiusKm] = useState<number>(props.initial.radiusKm);
  const [sport, setSport] = useState<SportType | "ALL">(props.initial.sport);
  const [day, setDay] = useState<string>(props.initial.day);
  const [time, setTime] = useState<string>(
    typeof props.initial.time === "string" && /^\d{2}:\d{2}$/.test(props.initial.time) ? props.initial.time : ""
  );
  const [q, setQ] = useState<string>(props.initial.q ?? "");
  const [maxPrice, setMaxPrice] = useState<number>(props.initial.maxPrice ?? 0);
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(props.initial.onlyFavorites ?? false);
  const [sortBy, setSortBy] = useState<"distance" | "rating">("distance");

  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSearchSportOptionsForPublic()
      .then((data) => {
        if (cancelled) return;
        setSportOptions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        // ignora
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sportSelectOptions = useMemo(() => {
    return sportOptions;
  }, [sportOptions]);

  const effectiveSport = useMemo<SportType | "ALL">(() => {
    if (sportSelectOptions.length === 0) return "ALL";
    if (sport === "ALL") return "ALL";
    return sportSelectOptions.some((o) => o.sport_type === sport) ? sport : "ALL";
  }, [sport, sportSelectOptions]);

  const effectiveRadiusKm = useMemo(() => (radiusKm > 0 ? radiusKm : 100), [radiusKm]);

  const searchHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("lat", String(lat));
    params.set("lng", String(lng));
    params.set("radiusKm", String(radiusKm));
    params.set("sport", effectiveSport);
    params.set("day", day);
    if (time) params.set("time", time);
    if (q.trim()) params.set("q", q.trim());
    if (maxPrice > 0) params.set("maxPrice", String(maxPrice));
    if (onlyFavorites) params.set("onlyFavorites", "1");
    return `/?${params.toString()}`;
  }, [day, effectiveSport, lat, lng, radiusKm, time, q, maxPrice, onlyFavorites]);

  useEffect(() => {
    if (!props.viewer.isLoggedIn) return;
    try {
      window.localStorage.setItem("ph:lastSearchHref", searchHref);
    } catch {
      // ignora
    }
  }, [props.viewer.isLoggedIn, searchHref]);

  const [results, setResults] = useState<NearbyEstablishment[]>([]);
  const [hoveredEstId, setHoveredEstId] = useState<string | null>(null);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());

  const cards = useMemo(() => {
    const out: Array<{
      estId: string;
      estName: string;
      estPhotoUrl?: string;
      requiresBookingConfirmation: boolean;
      distanceKm: number;
      whatsappNumber: string;
      contactNumber: string | null;
      addressText: string;
      openWeekdays: number[];
      openingTime: string;
      closingTime: string;
      avgRating: number;
      reviewsCount: number;
      isFavorite: boolean;
      highlightCourtName: string;
      highlightSportType: SportType;
      highlightPricePerHourCents: number;
      matchingCourtsCount: number;
      courtPhotoUrl?: string;
    }> = [];

    for (const e of results) {
      const matchingCourts =
        effectiveSport === "ALL" ? e.courts : e.courts.filter((c) => c.sport_type === effectiveSport);
      if (!matchingCourts.length) continue;

      const best = matchingCourts.reduce((acc, cur) => (cur.price_per_hour < acc.price_per_hour ? cur : acc));
      const estPhotoUrl = (e.photo_urls ?? []).find((u) => (u ?? "").trim());
      const courtPhotoUrl = (best.photo_urls ?? []).find((u) => (u ?? "").trim());

      out.push({
        estId: e.id,
        estName: e.name,
        estPhotoUrl,
        requiresBookingConfirmation: e.requires_booking_confirmation !== false,
        distanceKm: e.distanceKm,
        whatsappNumber: e.whatsapp_number,
        contactNumber: e.contact_number ?? null,
        addressText: e.address_text,
        openWeekdays: e.open_weekdays ?? [],
        openingTime: e.opening_time,
        closingTime: e.closing_time,
        avgRating: e.avgRating ?? 0,
        reviewsCount: e.reviewsCount ?? 0,
        isFavorite: Boolean(e.isFavorite),
        highlightCourtName: best.name,
        highlightSportType: best.sport_type,
        highlightPricePerHourCents: best.price_per_hour,
        matchingCourtsCount: matchingCourts.length,
        courtPhotoUrl,
      });
    }

    if (sortBy === "rating") {
      return out.sort((a, b) => {
        if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
        if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
        return a.distanceKm - b.distanceKm;
      });
    }

    return out.sort((a, b) => a.distanceKm - b.distanceKm);
  }, [effectiveSport, results, sortBy]);

  const markerInfos = useMemo<MarkerInfo[]>(() => {
    return results.map((e) => ({
      id: e.id,
      name: e.name,
      lat: e.latitude,
      lng: e.longitude,
    }));
  }, [results]);

  function fetchNearby(next: { userLat: number; userLng: number; radiusKm: number }) {
    setError(null);
    startTransition(async () => {
      try {
        const data = await getNearbyEstablishments({
          ...next,
          viewerUserId: props.viewer.userId,
          sport: effectiveSport,
          maxPrice: maxPrice > 0 ? maxPrice : null,
          day,
          q,
          onlyFavorites,
        });
        setResults(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao buscar quadras");
      }
    });
  }

  function handleToggleFavorite(estId: string) {
    if (!props.viewer.isLoggedIn) return;
    startFavTransition(async () => {
      try {
        const res = await toggleFavoriteEstablishment({ establishmentId: estId });
        setResults((prev) =>
          prev.map((e) => (e.id === estId ? { ...e, isFavorite: Boolean(res.isFavorite) } : e))
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao favoritar");
      }
    });
  }

  useEffect(() => {
    if (!props.viewer.isLoggedIn) return;
    if (!hasSearched) return;
    if (!props.apiKey) return;
    if (!mapDivRef.current) return;

    let cancelled = false;

    loadGoogleMaps(props.apiKey)
      .then(() => {
        if (cancelled) return;
        if (!window.google?.maps) return;

        if (!mapRef.current) {
          mapRef.current = new window.google.maps.Map(mapDivRef.current!, {
            center: { lat, lng },
            zoom: 13,
            mapTypeControl: false,
            streetViewControl: false,
          });
        }
      })
      .catch(() => {
        // sem mapa
      });

    return () => {
      cancelled = true;
    };
  }, [hasSearched, props.apiKey, props.viewer.isLoggedIn, lat, lng]);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    // Remove marcadores antigos
    for (const m of markersRef.current.values()) {
      m.setMap(null);
    }
    markersRef.current.clear();

    for (const est of markerInfos) {
      const marker = new window.google.maps.Marker({
        map,
        position: { lat: est.lat, lng: est.lng },
        title: est.name,
      });
      markersRef.current.set(est.id, marker);
    }

    if (markerInfos.length > 0) {
      map.setCenter({ lat: markerInfos[0]!.lat, lng: markerInfos[0]!.lng });
    }
  }, [markerInfos]);

  useEffect(() => {
    if (!hoveredEstId) return;
    const marker = markersRef.current.get(hoveredEstId);
    if (!marker) return;

    marker.setAnimation(window.google.maps.Animation.BOUNCE);
    const t = setTimeout(() => marker.setAnimation(null), 700);
    return () => clearTimeout(t);
  }, [hoveredEstId]);

  useEffect(() => {
    if (!hasSearched) return;
    const t = setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => clearTimeout(t);
  }, [hasSearched, results.length]);

  const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

  function formatWeekdays(openWeekdays: number[]): string {
    const unique = Array.from(new Set((openWeekdays ?? []).filter((n) => Number.isFinite(n))))
      .map((n) => Math.max(0, Math.min(6, Math.trunc(n))))
      .sort((a, b) => a - b);
    if (unique.length === 0) return "Horários não informados";
    return unique.map((d) => weekdayLabels[d] ?? String(d)).join(", ");
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#050608] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-90"
        style={{
          backgroundImage:
            "radial-gradient(680px 420px at 12% 10%, rgba(204,255,0,0.18), transparent 60%)," +
            "radial-gradient(520px 360px at 85% 15%, rgba(56,189,248,0.18), transparent 60%)," +
            "radial-gradient(720px 460px at 50% 100%, rgba(139,92,246,0.16), transparent 60%)," +
            "linear-gradient(to bottom, rgba(5,6,8,0.96), rgba(5,6,8,1))",
        }}
      />
      <div className="pointer-events-none absolute -top-24 left-8 h-48 w-48 rounded-full bg-[#CCFF00]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-10 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />

      <CustomerHeader
        variant="dark"
        subtitle="Agende quadras com poucos cliques"
        viewer={{
          isLoggedIn: props.viewer.isLoggedIn,
          name: props.viewer.name,
          image: props.viewer.image,
          role: props.viewer.role ?? null,
        }}
        rightSlot={
          props.viewer.isLoggedIn && props.viewer.role === "SYSADMIN" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/dashboard/admin"
                className="ph-button-secondary-sm"
              >
                Administrador
              </Link>
              <Link
                href="/sysadmin"
                className="ph-button-secondary-sm"
              >
                Sysadmin
              </Link>
            </div>
          ) : null
        }
      />

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-6 pb-10 pt-8">
        <section className={props.hero ? "grid gap-10 lg:grid-cols-12 lg:items-start" : ""}>
          {props.hero ? (
            <div className="lg:col-span-6 space-y-6 pt-4 ph-fade-up">
              <span className="ph-kicker">PlatzGo</span>
              <div className="max-w-2xl">
                <h1 className="ph-display text-balance text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
                  <span className="ph-grad-text ph-glow-text">{props.hero.title}</span>
                </h1>
                <p className="mt-4 text-lg leading-8 text-zinc-300">{props.hero.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a href="#busca" className="ph-button">
                  Buscar quadras
                </a>
              </div>
              <p className="text-xs text-zinc-400">Agende em minutos. Sem ligações, sem filas.</p>
            </div>
          ) : null}

          <div id="busca" className={(props.hero ? "lg:col-span-6" : "") + " ph-panel ph-glow-border p-6 ph-fade-up ph-delay-1"}>
            <div>
              <p className="text-sm font-semibold text-white">Encontre quadras perto de voce</p>
              <p className="mt-1 text-xs text-zinc-400">Filtre por esporte, horario e preco para achar o melhor horario.</p>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <PlacesLocationPicker
                apiKey={props.apiKey}
                label="Sua localização"
                labelStyle={{ marginBottom: 1 }}
                variant="light"
                buttonPlacement="below"
                initial={{ address: props.initial.address, lat: props.initial.lat, lng: props.initial.lng }}
                onChange={({ lat, lng }) => {
                  setLat(lat);
                  setLng(lng);
                }}
              />
            </div>

            <div className="lg:col-span-3">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">O que procura para seu jogo?</label>
              <select
                value={effectiveSport}
                onChange={(e) => setSport(e.target.value as SportType | "ALL")}
                disabled={sportSelectOptions.length === 0}
                className="mt-2 w-full rounded-xl bg-zinc-100/90 px-4 py-3 text-sm text-black outline-none focus:ring-2 focus:ring-[#CCFF00]"
              >
                <option value="ALL">Qualquer modalidade</option>
                {sportSelectOptions.map((o) => (
                  <option key={o.sport_type} value={o.sport_type}>
                    {o.label}
                  </option>
                ))}
              </select>
              {sportSelectOptions.length === 0 ? (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Nenhuma modalidade cadastrada pelo administrador ainda.</p>
              ) : null}
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">Buscar por nome</label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="mt-2 w-full rounded-xl bg-zinc-100/90 px-4 py-3 text-sm text-black outline-none focus:ring-2 focus:ring-[#CCFF00]"
                placeholder="Ex: Arena Central"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">Quando?</label>
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="mt-2 w-full rounded-xl bg-zinc-100/90 px-4 py-3 text-sm text-black outline-none focus:ring-2 focus:ring-[#CCFF00]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">Horario</label>
              <input
                type="time"
                step={1800}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-2 w-full rounded-xl bg-zinc-100/90 px-4 py-3 text-sm text-black outline-none focus:ring-2 focus:ring-[#CCFF00]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">Raio (KM)</label>
              <input
                type="number"
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                min={0}
                className="mt-2 w-full rounded-xl bg-zinc-100/90 px-4 py-3 text-sm text-black outline-none focus:ring-2 focus:ring-[#CCFF00]"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">Preço máx (R$/h)</label>
              <input
                type="number"
                min={0}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="mt-2 w-full rounded-xl bg-zinc-100/90 px-4 py-3 text-sm text-black outline-none focus:ring-2 focus:ring-[#CCFF00]"
              />
            </div>

            <div className="lg:col-span-12 flex flex-wrap items-center gap-4">
              {props.viewer.isLoggedIn ? (
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={onlyFavorites}
                    onChange={(e) => setOnlyFavorites(e.target.checked)}
                    className="h-4 w-4 rounded border-white/30 text-[#CCFF00] focus:ring-[#CCFF00]"
                  />
                  Somente favoritos
                </label>
              ) : null}

              <label className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Ordenar por
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "distance" | "rating")}
                  className="rounded-xl bg-zinc-100/90 px-3 py-2 text-xs text-black outline-none focus:ring-2 focus:ring-[#CCFF00]"
                >
                  <option value="distance">Distância</option>
                  <option value="rating">Recomendados</option>
                </select>
              </label>

              <p className="mt-2 text-xs text-black dark:text-zinc-400">
                Dica: digite a cidade/rua ou use o botão “Usar minha localização”.
              </p>
            </div>
            </div>

            {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setHasSearched(true);
                try {
                  window.localStorage.setItem("ph:lastSearchHref", searchHref);
                } catch {
                  // ignora
                }
                fetchNearby({ userLat: lat, userLng: lng, radiusKm: effectiveRadiusKm });
              }}
              className="inline-flex items-center justify-center rounded-full bg-[#CCFF00] px-6 py-3 text-sm font-bold text-black transition-all hover:scale-105 hover:shadow-[0_16px_40px_rgba(204,255,0,0.18)] disabled:opacity-60"
            >
              {isPending ? "Buscando..." : "Buscar quadras"}
            </button>

            {!props.viewer.isLoggedIn && props.showOwnerCtaOnLoggedOut ? (
              <Link
                href="/dashboard/admin"
                className="ph-button-secondary-sm"
              >
                Sou dono de quadra
              </Link>
            ) : null}

            {!props.viewer.isLoggedIn ? (
              <span className="text-xs text-zinc-400">
                Faça login para ver preços, contatos e mapa.
              </span>
            ) : null}
            </div>
          </div>
        </section>

        {!props.viewer.isLoggedIn && props.showMarketingCardsOnLoggedOut ? (
          <section className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              { t: "Para jogadores", d: "Encontre quadras perto de você e veja horários." },
              { t: "Para arenas", d: "Gerencie quadras, preços e disponibilidade." },
              { t: "Pagamentos (em breve)", d: "Checkout e repasse automatizado (roadmap)." },
            ].map((c, idx) => (
              <div
                key={c.t}
                className={
                  "ph-panel-soft p-6 text-white ph-fade-up " +
                  (idx === 1 ? "ph-delay-1" : idx === 2 ? "ph-delay-2" : "")
                }
              >
                <p className="text-sm font-semibold">{c.t}</p>
                <p className="mt-2 text-sm text-zinc-300">{c.d}</p>
              </div>
            ))}
          </section>
        ) : null}

        {hasSearched ? (
          <div ref={resultsRef} className="mt-10 grid gap-6 lg:grid-cols-12">
            <section className="lg:col-span-8 space-y-4">
              <div className="text-sm text-zinc-400">
                {cards.length} estabelecimentos encontrados • {effectiveRadiusKm} km
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((c) => {
                  const timeParam = time ? `&time=${encodeURIComponent(time)}` : "";
                  const dest = `/establishments/${c.estId}?day=${encodeURIComponent(day)}${timeParam}`;
                  const href = props.viewer.isLoggedIn
                    ? dest
                    : {
                        pathname: "/signin",
                        query: { callbackUrl: dest },
                      };

                  const showPrivate = props.viewer.isLoggedIn;
                  const blurClass = showPrivate ? "" : "blur-sm select-none";
                  const coverUrl = c.courtPhotoUrl || c.estPhotoUrl;

                  return (
                    <Link
                      key={c.estId}
                      href={href}
                      onMouseEnter={() => setHoveredEstId(c.estId)}
                      className="group block overflow-hidden rounded-[28px] border border-white/10 bg-white/5 text-white shadow-[0_24px_60px_rgba(0,0,0,0.35)] transition-all hover:-translate-y-1 hover:bg-white/10"
                    >
                      <div className="h-36 w-full bg-white/5">
                        {coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={coverUrl} alt={`Foto de ${c.estName}`} className="h-full w-full object-cover" />
                        ) : null}
                      </div>

                      <div className="p-5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{c.estName}</p>
                          {props.viewer.isLoggedIn ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleToggleFavorite(c.estId);
                              }}
                              className={
                                "inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs " +
                                (c.isFavorite
                                  ? "border-[#CCFF00] bg-[#CCFF00] text-black"
                                  : "border-white/20 bg-white/10 text-white")
                              }
                              title={c.isFavorite ? "Remover favorito" : "Favoritar"}
                              aria-label={c.isFavorite ? "Remover favorito" : "Favoritar"}
                              disabled={isFavPending}
                            >
                              {c.isFavorite ? "★" : "☆"}
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-zinc-300">
                          {c.reviewsCount > 0 ? `${c.avgRating.toFixed(1)} ★ • ${c.reviewsCount} avaliações` : "Sem avaliações"}
                        </div>
                        <p className={"mt-1 truncate text-xs text-zinc-300 " + blurClass}>
                          Quadra: <span className="font-semibold">{c.highlightCourtName}</span>
                          {c.matchingCourtsCount > 1 ? ` • +${c.matchingCourtsCount - 1} quadra(s)` : ""}
                        </p>

                        <p className="mt-2 text-xs text-zinc-400">
                          {c.requiresBookingConfirmation
                            ? "Exige confirmação do horário pelo estabelecimento"
                            : "NÃO exige confirmação de horário pelo estabelecimento"}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                          <span className={"rounded-full border border-white/10 bg-white/10 px-3 py-1 text-white/80 " + blurClass}>{c.highlightSportType}</span>
                          <span className={blurClass}>• {formatBRLFromCents(c.highlightPricePerHourCents)}/h</span>
                          <span className={blurClass}>• {c.distanceKm.toFixed(1)} km</span>
                        </div>

                        <div className="mt-3 space-y-1 text-xs text-zinc-300">
                          <div>
                            Funcionamento: {formatWeekdays(c.openWeekdays)} • {c.openingTime} - {c.closingTime}
                          </div>
                          <div className={blurClass}>WhatsApp: {c.whatsappNumber}</div>
                          {c.contactNumber ? <div className={blurClass}>Contato: {c.contactNumber}</div> : null}
                          <div className={blurClass}>Endereço: {c.addressText}</div>
                        </div>

                        {showPrivate ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className="inline-flex items-center justify-center rounded-full bg-[#CCFF00] px-4 py-2 text-xs font-bold text-black">
                              Ver horários
                            </span>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs text-white transition-all hover:bg-white/20"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(toWaMeLink(c.whatsappNumber), "_blank", "noopener,noreferrer");
                              }}
                            >
                              WhatsApp
                            </button>
                          </div>
                        ) : (
                          <div className="mt-4 text-xs text-zinc-400">Entre para ver preço, contato e agendar.</div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>

              {cards.length === 0 ? (
                <div className="ph-panel-soft p-6 text-white">
                  <p className="text-sm text-zinc-300">Nenhum estabelecimento encontrado nesses filtros.</p>
                </div>
              ) : null}
            </section>

            {props.viewer.isLoggedIn ? (
              <aside className="lg:col-span-4">
                <div className="sticky top-6">
                  {props.apiKey ? (
                    <div className="ph-panel-soft p-2">
                      <div ref={mapDivRef} className="h-[380px] lg:h-[520px] w-full rounded-[22px]" />
                    </div>
                  ) : (
                    <div className="ph-panel-soft p-6 text-white">
                      <p className="text-sm text-zinc-300">
                        Defina <span className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> para habilitar o mapa.
                      </p>
                    </div>
                  )}
                </div>
              </aside>
            ) : null}
          </div>
        ) : null}
      </main>

      {props.showFooter ? (
        <footer className="relative z-10 mt-auto border-t border-white/10 px-6 py-4">
          <div className="mx-auto max-w-7xl text-xs text-zinc-500">© {new Date().getFullYear()} PlatzGo!</div>
        </footer>
      ) : null}
    </div>
  );
}
