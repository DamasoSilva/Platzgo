"use server";

import { prisma } from "@/lib/prisma";

export type NearbyEstablishmentsInput = {
  userLat: number;
  userLng: number;
  radiusKm: number;
  viewerUserId?: string | null;
  sport?: import("@/generated/prisma/enums").SportType | "ALL";
  maxPrice?: number | null;
  day?: string;
  q?: string;
  onlyFavorites?: boolean;
};

type NearbyRow = {
  id: string;
  distance_km: number;
};

export async function getNearbyEstablishments(input: NearbyEstablishmentsInput) {
  const { userLat, userLng, radiusKm } = input;
  const effectiveRadiusKm = Number.isFinite(radiusKm) && radiusKm > 0 ? radiusKm : 100;
  const q = (input.q ?? "").trim();
  const maxPrice =
    typeof input.maxPrice === "number" && input.maxPrice > 0
      ? Math.round(input.maxPrice * 100)
      : null;
  const sport = input.sport && input.sport !== "ALL" ? input.sport : null;
  const onlyFavorites = Boolean(input.onlyFavorites);
  const viewerUserId = input.viewerUserId ?? null;

  let weekday: number | null = null;
  if (typeof input.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.day)) {
    const d = new Date(`${input.day}T00:00:00`);
    if (!Number.isNaN(d.getTime())) weekday = d.getDay();
  }

  if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
    throw new Error("Latitude/longitude do usuário inválidas");
  }
  if (!Number.isFinite(effectiveRadiusKm) || effectiveRadiusKm <= 0) {
    throw new Error("radiusKm inválido");
  }

  // Haversine (km). R = 6371
  // Obs: usamos parâmetros do Prisma template tag para evitar SQL injection.
  const rows = await prisma.$queryRaw<NearbyRow[]>`
    SELECT
      e."id" as id,
      (
        2 * 6371 * asin(
          sqrt(
            power(sin(radians((${userLat} - e."latitude") / 2)), 2)
            + cos(radians(e."latitude")) * cos(radians(${userLat}))
              * power(sin(radians((${userLng} - e."longitude") / 2)), 2)
          )
        )
      ) as distance_km
    FROM "Establishment" e
    WHERE (
      2 * 6371 * asin(
        sqrt(
          power(sin(radians((${userLat} - e."latitude") / 2)), 2)
          + cos(radians(e."latitude")) * cos(radians(${userLat}))
            * power(sin(radians((${userLng} - e."longitude") / 2)), 2)
        )
      )
    ) <= ${effectiveRadiusKm}
    ORDER BY distance_km ASC;
  `;

  if (rows.length === 0) return [];

  const establishments = await prisma.establishment.findMany({
    where: {
      id: { in: rows.map((r) => r.id) },
      // Não retorna estabelecimentos sem quadras ativas (não devem aparecer publicamente)
      courts: {
        some: {
          is_active: true,
          ...(sport ? { sport_type: sport } : {}),
          ...(maxPrice ? { price_per_hour: { lte: maxPrice } } : {}),
        },
      },
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(weekday !== null ? { open_weekdays: { has: weekday } } : {}),
      ...(onlyFavorites && viewerUserId ? { favorites: { some: { userId: viewerUserId } } } : {}),
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      description: true,
      whatsapp_number: true,
      contact_number: true,
      photo_urls: true,
      requires_booking_confirmation: true,
      address_text: true,
      latitude: true,
      longitude: true,
      open_weekdays: true,
      opening_time: true,
      closing_time: true,
      courts: {
        where: {
          is_active: true,
          ...(sport ? { sport_type: sport } : {}),
          ...(maxPrice ? { price_per_hour: { lte: maxPrice } } : {}),
        },
        select: {
          id: true,
          establishmentId: true,
          name: true,
          sport_type: true,
          price_per_hour: true,
          discount_percentage_over_90min: true,
          photo_urls: true,
        },
      },
    },
  });

  if (establishments.length === 0) return [];

  const establishmentIds = establishments.map((e) => e.id);

  const [ratings, favorites] = await Promise.all([
    prisma.establishmentReview.groupBy({
      by: ["establishmentId"],
      where: { establishmentId: { in: establishmentIds } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    viewerUserId
      ? prisma.establishmentFavorite.findMany({
          where: { establishmentId: { in: establishmentIds }, userId: viewerUserId },
          select: { establishmentId: true },
        })
      : Promise.resolve([]),
  ]);

  const ratingById = new Map(
    ratings.map((r) => [r.establishmentId, { avg: r._avg.rating ?? 0, count: r._count.rating }])
  );
  const favoriteSet = new Set(favorites.map((f) => f.establishmentId));

  const byId = new Map(establishments.map((e) => [e.id, e] as const));

  return rows
    .map((r) => {
      const establishment = byId.get(r.id);
      if (!establishment) return null;
      const rating = ratingById.get(establishment.id);
      return {
        ...establishment,
        distanceKm: Number(r.distance_km),
        avgRating: rating?.avg ?? 0,
        reviewsCount: rating?.count ?? 0,
        isFavorite: viewerUserId ? favoriteSet.has(establishment.id) : false,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
}
