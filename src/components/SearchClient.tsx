"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CalendarCheck,
  Clock,
  CreditCard,
  MapPin,
  Search,
  Shield,
  Star,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

import { CustomerHeader } from "@/components/CustomerHeader";
import { PlacesLocationPicker } from "@/components/PlacesLocationPicker";
import { getNearbyEstablishments } from "@/lib/actions/establishments";
import { listSearchSportOptionsForPublic } from "@/lib/actions/sysadmin";
import { toggleFavoriteEstablishment } from "@/lib/actions/favorites";
import { loadGoogleMaps } from "@/lib/client/googleMaps";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { formatSportLabel } from "@/lib/utils/sport";
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
  footer?: {
    contactEmail?: string | null;
    contactInstagram?: string | null;
    contactWhatsapp?: string | null;
    termsUrl?: string | null;
    privacyUrl?: string | null;
  };
  initial: {
    lat: number;
    lng: number;
    address?: string;
    radiusKm: number;
    sport: SportType | "ALL";
    day: string;
    dayFromQuery?: boolean;
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

type Card = {
  estId: string;
  estName: string;
  estPhotoUrl: string | null;
  courtPhotoUrl: string | null;
  highlightCourtName: string;
  highlightSportType: string;
  highlightPricePerHourCents: number;
  matchingCourtsCount: number;
  reviewsCount: number;
  avgRating: number;
  whatsappNumber: string;
  contactNumber: string | null;
  addressText: string;
  openWeekdays: number[];
  openingTime: string;
  closingTime: string;
  requiresBookingConfirmation: boolean;
  distanceKm: number;
  lat: number;
  lng: number;
  isFavorite: boolean;
};

const landingFeatures = [
  {
    icon: Zap,
    title: "Reserva instantânea",
    description: "Escolha, reserve e confirme sua quadra em menos de 30 segundos.",
  },
  {
    icon: Calendar,
    title: "Agenda inteligente",
    description: "Veja horários disponíveis em tempo real e nunca perca seu jogo.",
  },
  {
    icon: CreditCard,
    title: "Pagamento integrado",
    description: "Pague via Pix, cartão ou boleto direto pela plataforma.",
  },
  {
    icon: Star,
    title: "Avaliações reais",
    description: "Confira avaliações de outros jogadores antes de reservar.",
  },
  {
    icon: Users,
    title: "Monte seu time",
    description: "Convide amigos e organize partidas com facilidade.",
  },
  {
    icon: BarChart3,
    title: "Painel do gestor",
    description: "Gerencie reservas, receita e clientes em um só lugar.",
  },
];

const landingSteps = [
  {
    step: "01",
    title: "Encontre",
    description: "Busque quadras próximas a você por esporte, localização ou horário.",
    icon: Search,
  },
  {
    step: "02",
    title: "Reserve",
    description: "Escolha o horário ideal e confirme sua reserva em poucos cliques.",
    icon: CalendarCheck,
  },
  {
    step: "03",
    title: "Pague",
    description: "Realize o pagamento de forma segura via Pix, cartão ou boleto.",
    icon: CreditCard,
  },
  {
    step: "04",
    title: "Jogue",
    description: "Compareça no horário, aproveite o jogo e avalie a experiência.",
    icon: Trophy,
  },
];

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function formatWeekdays(days: number[]): string {
  if (!Array.isArray(days) || days.length === 0) return "Sem informação";
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.map((d) => WEEKDAYS[d] ?? "?").join(", ");
}

function firstNonEmpty(list?: Array<string | null> | null): string | null {
  if (!list) return null;
  const found = list.find((u) => (u ?? "").trim());
  return found ? found : null;
}

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function SearchClient(props: Props) {
  const heroTitle = props.hero?.title ?? "Sua quadra. Seu horário. Sem complicação.";
  const heroDescription =
    props.hero?.description ??
    "Agende quadras de futebol, padel, tênis e muito mais em segundos. Sem ligações, sem espera - tudo online e na palma da mão.";

  const footerSettings = props.footer ?? {};
  const contactEmail = (footerSettings.contactEmail ?? "contato@platzgo.com").trim();
  const contactInstagram = (footerSettings.contactInstagram ?? "@platzgo").trim();
  const contactWhatsapp = (footerSettings.contactWhatsapp ?? "WhatsApp").trim();
  const termsUrl = (footerSettings.termsUrl ?? "/").trim() || "/";
  const privacyUrl = (footerSettings.privacyUrl ?? "/").trim() || "/";

  const instagramUrl = contactInstagram
    ? (isExternalUrl(contactInstagram)
      ? contactInstagram
      : `https://instagram.com/${contactInstagram.replace(/^@/, "")}`)
    : "";

  const [lat, setLat] = useState(props.initial.lat);
  const [lng, setLng] = useState(props.initial.lng);
  const [radiusKm, setRadiusKm] = useState(props.initial.radiusKm);
  const [sport, setSport] = useState<SportType | "ALL">(props.initial.sport);
  const [day, setDay] = useState(props.initial.day);
  const [dayTouched, setDayTouched] = useState(Boolean(props.initial.dayFromQuery));
  const [time, setTime] = useState(props.initial.time ?? "");
  const [q, setQ] = useState(props.initial.q ?? "");
  const [maxPrice, setMaxPrice] = useState(props.initial.maxPrice ?? 0);
  const [onlyFavorites, setOnlyFavorites] = useState(Boolean(props.initial.onlyFavorites));
  const [sortBy, setSortBy] = useState<"distance" | "rating">("distance");
  const [hasSearched, setHasSearched] = useState(props.initial.locationSource === "query");
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isFavPending, startFavTransition] = useTransition();
  const [hoveredEstId, setHoveredEstId] = useState<string | null>(null);

  const resultsRef = useRef<HTMLElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());

  const [mapReady, setMapReady] = useState(false);
  const [sportSelectOptions, setSportSelectOptions] = useState<Array<{ sport_type: SportType; label: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    listSearchSportOptionsForPublic()
      .then((res) => {
        if (cancelled) return;
        setSportSelectOptions(res ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setSportSelectOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sportLabelMap = useMemo(() => {
    return new Map(sportSelectOptions.map((o) => [o.sport_type, o.label] as const));
  }, [sportSelectOptions]);

  const effectiveSport = useMemo(() => {
    if (sport === "ALL") return "ALL";
    return sportLabelMap.has(sport) ? sport : "ALL";
  }, [sport, sportLabelMap]);

  const effectiveRadiusKm = useMemo(() => {
    if (Number.isFinite(radiusKm) && radiusKm > 0) return radiusKm;
    return 10;
  }, [radiusKm]);

  const effectiveMaxPrice = useMemo(() => {
    if (Number.isFinite(maxPrice) && maxPrice > 0) return maxPrice;
    return null;
  }, [maxPrice]);

  const searchHref = useMemo(() => {
    const params = new URLSearchParams();
    if (Number.isFinite(lat)) params.set("lat", String(lat));
    if (Number.isFinite(lng)) params.set("lng", String(lng));
    if (Number.isFinite(radiusKm) && radiusKm > 0) params.set("radiusKm", String(radiusKm));
    if (effectiveSport !== "ALL") params.set("sport", String(effectiveSport));
    if (dayTouched && day) params.set("day", day);
    if (time) params.set("time", time);
    if (q) params.set("q", q);
    if (Number.isFinite(maxPrice) && maxPrice > 0) params.set("maxPrice", String(maxPrice));
    if (onlyFavorites) params.set("onlyFavorites", "1");
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  }, [lat, lng, radiusKm, effectiveSport, day, dayTouched, time, q, maxPrice, onlyFavorites]);

  useEffect(() => {
    if (!props.viewer.isLoggedIn && onlyFavorites) {
      setOnlyFavorites(false);
    }
  }, [props.viewer.isLoggedIn, onlyFavorites]);

  const normalizeCards = useCallback(
    (establishments: NearbyEstablishment[]): Card[] => {
      return establishments.map((est) => {
        const courts = est.courts ?? [];
        const primaryCourt = courts[0] ?? null;
        const sportLabel = primaryCourt
          ? sportLabelMap.get(primaryCourt.sport_type) ?? formatSportLabel(primaryCourt.sport_type)
          : formatSportLabel(effectiveSport === "ALL" ? "" : effectiveSport);

        return {
          estId: est.id,
          estName: est.name,
          estPhotoUrl: firstNonEmpty(est.photo_urls ?? null),
          courtPhotoUrl: firstNonEmpty(primaryCourt?.photo_urls ?? null),
          highlightCourtName: primaryCourt?.name ?? "Quadra",
          highlightSportType: sportLabel,
          highlightPricePerHourCents: primaryCourt?.price_per_hour ?? 0,
          matchingCourtsCount: courts.length,
          reviewsCount: est.reviewsCount ?? 0,
          avgRating: est.avgRating ?? 0,
          whatsappNumber: est.whatsapp_number,
          contactNumber: est.contact_number ?? null,
          addressText: est.address_text,
          openWeekdays: est.open_weekdays,
          openingTime: est.opening_time,
          closingTime: est.closing_time,
          requiresBookingConfirmation: est.requires_booking_confirmation,
          distanceKm: est.distanceKm ?? 0,
          lat: est.latitude,
          lng: est.longitude,
          isFavorite: est.isFavorite ?? false,
        };
      });
    },
    [effectiveSport, sportLabelMap]
  );

  const fetchNearby = useCallback(
    (params: { userLat: number; userLng: number; radiusKm: number }) => {
      setError(null);
      startTransition(async () => {
        try {
          const results = await getNearbyEstablishments({
            userLat: params.userLat,
            userLng: params.userLng,
            radiusKm: params.radiusKm,
            viewerUserId: props.viewer.userId,
            sport: effectiveSport,
            maxPrice: effectiveMaxPrice,
            day: dayTouched ? day : undefined,
            q,
            onlyFavorites: props.viewer.isLoggedIn ? onlyFavorites : false,
          });

          const normalized = normalizeCards(results);
          const sorted = [...normalized].sort((a, b) => {
            if (sortBy === "rating") {
              const byRating = b.avgRating - a.avgRating;
              return byRating !== 0 ? byRating : a.distanceKm - b.distanceKm;
            }
            return a.distanceKm - b.distanceKm;
          });

          setCards(sorted);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao buscar estabelecimentos");
        }
      });
    },
    [
      day,
      dayTouched,
      effectiveMaxPrice,
      effectiveSport,
      normalizeCards,
      onlyFavorites,
      props.viewer.isLoggedIn,
      props.viewer.userId,
      q,
      sortBy,
    ]
  );

  useEffect(() => {
    if (props.initial.locationSource !== "query") return;
    fetchNearby({ userLat: lat, userLng: lng, radiusKm: effectiveRadiusKm });
  }, [props.initial.locationSource, fetchNearby, lat, lng, effectiveRadiusKm]);

  useEffect(() => {
    if (!hasSearched || !resultsRef.current) return;
    resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasSearched, cards.length]);

  useEffect(() => {
    if (!props.viewer.isLoggedIn) return;
    if (!props.apiKey) return;
    let cancelled = false;

    loadGoogleMaps(props.apiKey)
      .then(() => {
        if (cancelled) return;
        setMapReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMapReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [props.apiKey, props.viewer.isLoggedIn]);

  useEffect(() => {
    if (!mapReady || !mapDivRef.current || !window.google?.maps) return;

    if (!mapRef.current) {
      mapRef.current = new window.google.maps.Map(mapDivRef.current, {
        center: { lat, lng },
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
    } else {
      mapRef.current.setCenter({ lat, lng });
    }
  }, [mapReady, lat, lng]);

  const markers = useMemo<MarkerInfo[]>(() => {
    return cards.map((c) => ({ id: c.estId, name: c.estName, lat: c.lat, lng: c.lng }));
  }, [cards]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current.clear();

    markers.forEach((m) => {
      const marker = new window.google.maps.Marker({
        map: mapRef.current!,
        position: { lat: m.lat, lng: m.lng },
        title: m.name,
      });
      markersRef.current.set(m.id, marker);
    });
  }, [mapReady, markers]);

  useEffect(() => {
    if (!mapReady || !window.google?.maps) return;
    markersRef.current.forEach((marker, id) => {
      marker.setAnimation(id === hoveredEstId ? window.google.maps.Animation.BOUNCE : null);
    });
  }, [hoveredEstId, mapReady]);

  const handleToggleFavorite = useCallback(
    (establishmentId: string) => {
      if (!props.viewer.isLoggedIn) return;
      startFavTransition(async () => {
        try {
          const res = await toggleFavoriteEstablishment({ establishmentId });
          setCards((prev) => {
            if (!res?.ok) return prev;
            if (onlyFavorites && !res.isFavorite) {
              return prev.filter((c) => c.estId !== establishmentId);
            }
            return prev.map((c) => (c.estId === establishmentId ? { ...c, isFavorite: res.isFavorite } : c));
          });
        } catch {
          // ignore
        }
      });
    },
    [onlyFavorites, props.viewer.isLoggedIn]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <CustomerHeader
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
              <Link href="/dashboard/admin" className="ph-button-secondary-sm">
                Administrador
              </Link>
              <Link href="/sysadmin" className="ph-button-secondary-sm">
                Sysadmin
              </Link>
            </div>
          ) : null
        }
      />

      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-courts.jpg"
            alt="Complexo esportivo moderno iluminado"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />
        </div>

        <div className="container relative z-10 pt-24 pb-16">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-6">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
                Quadras disponíveis agora
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-5xl md:text-7xl font-display font-bold leading-[1.05] mb-6"
            >
              {props.hero ? (
                <span className="gradient-text glow-text">{heroTitle}</span>
              ) : (
                <>
                  Sua quadra.
                  <br />
                  <span className="gradient-text glow-text">Seu horário.</span>
                  <br />
                  Sem complicação.
                </>
              )}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="text-lg text-muted-foreground max-w-lg mb-8 leading-relaxed"
            >
              {heroDescription}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 mb-12"
            >
              <Link
                href="#busca"
                className="gradient-primary text-primary-foreground font-bold text-base px-8 py-4 rounded-xl inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity glow-box"
              >
                Agendar agora
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/dashboard"
                className="border border-border bg-card/50 text-foreground font-medium text-base px-8 py-4 rounded-xl inline-flex items-center justify-center gap-2 hover:bg-card transition-colors"
              >
                Sou dono de quadra
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="flex flex-wrap gap-6 text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-2">
                <MapPin size={16} className="text-primary" />
                +50 quadras
              </span>
              <span className="flex items-center gap-2">
                <Clock size={16} className="text-primary" />
                Agendamento 24h
              </span>
              <span className="flex items-center gap-2">
                <Shield size={16} className="text-primary" />
                Pagamento seguro
              </span>
            </motion.div>
          </div>
        </div>
      </section>

      <section id="busca" className="py-24 bg-card/30">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="text-primary text-sm font-semibold uppercase tracking-widest mb-3 block">
              Buscar quadras
            </span>
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">
              Encontre a quadra ideal
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Use os filtros para encontrar o horário perfeito e agendar em segundos.
            </p>
          </motion.div>

          <div className="rounded-2xl bg-card border border-border p-6">
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <PlacesLocationPicker
                  apiKey={props.apiKey}
                  label="Sua localização"
                  labelStyle={{ marginBottom: 1 }}
                  variant="dark"
                  buttonPlacement="below"
                  initial={{ address: props.initial.address, lat: props.initial.lat, lng: props.initial.lng }}
                  onChange={({ lat: nextLat, lng: nextLng }) => {
                    setLat(nextLat);
                    setLng(nextLng);
                  }}
                />
              </div>

              <div className="lg:col-span-3">
                <label className="block text-xs font-bold text-muted-foreground">O que procura para seu jogo?</label>
                <select
                  value={effectiveSport}
                  onChange={(e) => setSport(e.target.value as SportType | "ALL")}
                  disabled={sportSelectOptions.length === 0}
                  className="mt-2 w-full rounded-xl bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="ALL">Qualquer modalidade</option>
                  {sportSelectOptions.map((o) => (
                    <option key={o.sport_type} value={o.sport_type}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {sportSelectOptions.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Nenhuma modalidade cadastrada pelo administrador ainda.</p>
                ) : null}
              </div>

              <div className="lg:col-span-2">
                <label className="block text-xs font-bold text-muted-foreground">Buscar por nome</label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="mt-2 w-full rounded-xl bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Ex: Arena Central"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-xs font-bold text-muted-foreground">Quando?</label>
                <input
                  type="date"
                  value={day}
                  onChange={(e) => {
                    setDayTouched(true);
                    setDay(e.target.value);
                  }}
                  className="mt-2 w-full rounded-xl bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-xs font-bold text-muted-foreground">Horário</label>
                <input
                  type="time"
                  step={1800}
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-2 w-full rounded-xl bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-xs font-bold text-muted-foreground">Raio (KM)</label>
                <input
                  type="number"
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  min={0}
                  className="mt-2 w-full rounded-xl bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-xs font-bold text-muted-foreground">Preço máx (R$/h)</label>
                <input
                  type="number"
                  min={0}
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                  className="mt-2 w-full rounded-xl bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="lg:col-span-12 flex flex-wrap items-center gap-4">
                {props.viewer.isLoggedIn ? (
                  <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={onlyFavorites}
                      onChange={(e) => setOnlyFavorites(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                    />
                    Somente favoritos
                  </label>
                ) : null}

                <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                  Ordenar por
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as "distance" | "rating")}
                    className="rounded-xl bg-secondary px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="distance">Distância</option>
                    <option value="rating">Recomendados</option>
                  </select>
                </label>

                <p className="text-xs text-muted-foreground">
                  Dica: digite a cidade/rua ou use o botão "Usar minha localização".
                </p>
              </div>
            </div>

            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

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
                className="gradient-primary text-primary-foreground font-bold text-base px-8 py-4 rounded-xl inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity glow-box disabled:opacity-60"
              >
                {isPending ? "Buscando..." : "Buscar quadras"}
              </button>

              {!props.viewer.isLoggedIn && props.showOwnerCtaOnLoggedOut ? (
                <Link
                  href="/dashboard"
                  className="border border-border bg-card/50 text-foreground font-medium text-base px-8 py-4 rounded-xl inline-flex items-center justify-center gap-2 hover:bg-card transition-colors"
                >
                  Sou dono de quadra
                </Link>
              ) : null}

              {!props.viewer.isLoggedIn ? (
                <span className="text-xs text-muted-foreground">
                  Faça login para ver preços, contatos e mapa.
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {hasSearched ? (
        <section ref={resultsRef} className="py-16">
          <div className="container">
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8 space-y-4">
                <div className="text-sm text-muted-foreground">
                  {cards.length} estabelecimentos encontrados • {effectiveRadiusKm} km
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {cards.map((c) => {
                    const params = new URLSearchParams();
                    if (dayTouched && day) params.set("day", day);
                    if (time) params.set("time", time);
                    const qs = params.toString();
                    const dest = qs ? `/establishments/${c.estId}?${qs}` : `/establishments/${c.estId}`;
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
                        className="group p-6 rounded-2xl bg-card border border-border hover:glow-border transition-all duration-300"
                      >
                        <div className="h-36 w-full rounded-xl bg-secondary/60 overflow-hidden">
                          {coverUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={coverUrl} alt={`Foto de ${c.estName}`} className="h-full w-full object-cover" />
                          ) : null}
                        </div>

                        <div className="mt-4">
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
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-secondary text-muted-foreground")
                                }
                                title={c.isFavorite ? "Remover favorito" : "Favoritar"}
                                aria-label={c.isFavorite ? "Remover favorito" : "Favoritar"}
                                disabled={isFavPending}
                              >
                                {c.isFavorite ? "★" : "☆"}
                              </button>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {c.reviewsCount > 0
                              ? `${c.avgRating.toFixed(1)} ★ • ${c.reviewsCount} avaliações`
                              : "Sem avaliações"}
                          </div>
                          <p className={"mt-1 truncate text-xs text-muted-foreground " + blurClass}>
                            Quadra: <span className="font-semibold text-foreground">{c.highlightCourtName}</span>
                            {c.matchingCourtsCount > 1 ? ` • +${c.matchingCourtsCount - 1} quadra(s)` : ""}
                          </p>

                          <p className="mt-2 text-xs text-muted-foreground">
                            {c.requiresBookingConfirmation
                              ? "Exige confirmação do horário pelo estabelecimento"
                              : "Não exige confirmação de horário pelo estabelecimento"}
                          </p>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className={"rounded-full bg-secondary px-3 py-1 text-foreground " + blurClass}>{c.highlightSportType}</span>
                            <span className={blurClass}>• {formatBRLFromCents(c.highlightPricePerHourCents)}/h</span>
                            <span className={blurClass}>• {c.distanceKm.toFixed(1)} km</span>
                          </div>

                          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                            <div>
                              Funcionamento: {formatWeekdays(c.openWeekdays)} • {c.openingTime} - {c.closingTime}
                            </div>
                            <div className={blurClass}>WhatsApp: {c.whatsappNumber}</div>
                            {c.contactNumber ? <div className={blurClass}>Contato: {c.contactNumber}</div> : null}
                            <div className={blurClass}>Endereço: {c.addressText}</div>
                          </div>

                          {showPrivate ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              <span className="inline-flex items-center justify-center rounded-xl gradient-primary text-primary-foreground px-4 py-2 text-xs font-bold">
                                Ver horários
                              </span>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-xl border border-border bg-card/50 px-4 py-2 text-xs text-foreground hover:bg-card transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(toWaMeLink(c.whatsappNumber), "_blank", "noopener,noreferrer");
                                }}
                              >
                                WhatsApp
                              </button>
                            </div>
                          ) : (
                            <div className="mt-4 text-xs text-muted-foreground">Entre para ver preço, contato e agendar.</div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {cards.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-card border border-border">
                    <p className="text-sm text-muted-foreground">Nenhum estabelecimento encontrado nesses filtros.</p>
                  </div>
                ) : null}
              </div>

              {props.viewer.isLoggedIn ? (
                <aside className="lg:col-span-4">
                  <div className="sticky top-24">
                    {props.apiKey ? (
                      <div className="p-2 rounded-2xl bg-card border border-border">
                        <div ref={mapDivRef} className="h-[380px] lg:h-[520px] w-full rounded-xl" />
                      </div>
                    ) : (
                      <div className="p-6 rounded-2xl bg-card border border-border">
                        <p className="text-sm text-muted-foreground">
                          Defina <span className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> para habilitar o mapa.
                        </p>
                      </div>
                    )}
                  </div>
                </aside>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {props.showMarketingCardsOnLoggedOut || props.viewer.isLoggedIn ? (
        <section className="py-24 relative">
          <div className="container">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <span className="text-primary text-sm font-semibold uppercase tracking-widest mb-3 block">
                Funcionalidades
              </span>
              <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">
                Tudo que você precisa para jogar
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Do agendamento ao pagamento, tudo integrado para uma experiência perfeita - seja jogador ou dono de quadra.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {landingFeatures.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="group p-6 rounded-2xl bg-card border border-border hover:glow-border transition-all duration-300"
                >
                  <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <feature.icon size={22} className="text-primary-foreground" />
                  </div>
                  <h3 className="font-display font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section id="como-funciona" className="py-24 bg-card/30">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-primary text-sm font-semibold uppercase tracking-widest mb-3 block">
              Como funciona
            </span>
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">Simples como deve ser</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">Em 4 passos rápidos, você sai do sofá para a quadra.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {landingSteps.map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="text-center relative"
              >
                {i < landingSteps.length - 1 ? (
                  <div className="hidden lg:block absolute top-10 left-[60%] w-[80%] h-px bg-gradient-to-r from-primary/40 to-transparent" />
                ) : null}
                <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5 relative">
                  <step.icon size={28} className="text-primary" />
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full gradient-primary text-primary-foreground font-display font-bold text-xs flex items-center justify-center">
                    {step.step}
                  </span>
                </div>
                <h3 className="font-display font-bold text-xl mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-[220px] mx-auto">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="contato" className="py-24">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative rounded-3xl overflow-hidden"
          >
            <div className="absolute inset-0 gradient-primary opacity-[0.08]" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/20 rounded-full blur-[120px]" />

            <div className="relative border border-primary/20 rounded-3xl p-12 md:p-20 text-center">
              <h2 className="text-3xl md:text-5xl font-display font-bold mb-5">
                Pronto para <span className="gradient-text">entrar em quadra</span>?
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto mb-8 text-lg">
                Junte-se a milhares de jogadores que já agendam suas quadras de forma rápida e segura com PlatzGo!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="#busca"
                  className="gradient-primary text-primary-foreground font-bold text-base px-8 py-4 rounded-xl inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity glow-box"
                >
                  Agendar minha quadra
                  <ArrowRight size={18} />
                </Link>
                <Link
                  href="/dashboard"
                  className="border border-primary/30 bg-primary/5 text-foreground font-medium text-base px-8 py-4 rounded-xl inline-flex items-center justify-center gap-2 hover:bg-primary/10 transition-colors"
                >
                  Cadastrar minha quadra
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {props.showFooter ? (
        <footer className="border-t border-border py-12 bg-card/30">
          <div className="container">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
              <div className="md:col-span-1">
                <Link href="/" className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center font-display font-bold text-primary-foreground text-sm">
                    P
                  </div>
                  <span className="font-display font-bold text-xl">
                    Platz<span className="gradient-text">Go!</span>
                  </span>
                </Link>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A plataforma que conecta jogadores a quadras esportivas.
                </p>
              </div>

              <div>
                <h4 className="font-display font-semibold mb-4 text-sm uppercase tracking-wider">Plataforma</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link href="#busca" className="hover:text-foreground transition-colors">Agendar quadra</Link></li>
                  <li><Link href="/sorteio-times" className="hover:text-foreground transition-colors">Sorteio de times</Link></li>
                  <li><Link href="/torneios" className="hover:text-foreground transition-colors">Torneios</Link></li>
                  <li><Link href="/dashboard" className="hover:text-foreground transition-colors">Painel do gestor</Link></li>
                  <li><Link href="/" className="hover:text-foreground transition-colors">Preços</Link></li>
                </ul>
              </div>

              <div>
                <h4 className="font-display font-semibold mb-4 text-sm uppercase tracking-wider">Esportes</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>Futebol Society</li>
                  <li>Beach Tennis</li>
                  <li>Padel</li>
                  <li>Tênis</li>
                  <li>E muito mais</li>
                </ul>
              </div>

              <div>
                <h4 className="font-display font-semibold mb-4 text-sm uppercase tracking-wider">Contato</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {contactEmail ? (
                    <li>
                      <a href={`mailto:${contactEmail}`} className="hover:text-foreground transition-colors">
                        {contactEmail}
                      </a>
                    </li>
                  ) : null}
                  {contactInstagram ? (
                    <li>
                      <a href={instagramUrl} className="hover:text-foreground transition-colors" target="_blank" rel="noreferrer">
                        Instagram: {contactInstagram}
                      </a>
                    </li>
                  ) : null}
                  {contactWhatsapp ? <li>WhatsApp: {contactWhatsapp}</li> : null}
                  {isExternalUrl(termsUrl) ? (
                    <li>
                      <a href={termsUrl} className="hover:text-foreground transition-colors" target="_blank" rel="noreferrer">
                        Termos de uso
                      </a>
                    </li>
                  ) : (
                    <li>
                      <Link href={termsUrl} className="hover:text-foreground transition-colors">Termos de uso</Link>
                    </li>
                  )}
                  {isExternalUrl(privacyUrl) ? (
                    <li>
                      <a href={privacyUrl} className="hover:text-foreground transition-colors" target="_blank" rel="noreferrer">
                        Privacidade
                      </a>
                    </li>
                  ) : (
                    <li>
                      <Link href={privacyUrl} className="hover:text-foreground transition-colors">Privacidade</Link>
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
              <p>(c) 2026 PlatzGo! Todos os direitos reservados.</p>
            </div>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
