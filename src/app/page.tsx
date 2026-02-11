import type { Metadata } from "next";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SearchClient } from "@/components/SearchClient";
import { SportType } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "PlatzGo! • Encontre e agende quadras",
  description: "Busque quadras por localização, veja disponibilidade e finalize o agendamento.",
};

function parseNumber(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function parseDay(v: unknown): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseSport(v: unknown): SportType | "ALL" {
  if (v === "ALL") return "ALL";
  if (typeof v !== "string") return "ALL";
  return (Object.values(SportType) as string[]).includes(v) ? (v as SportType) : "ALL";
}

export default async function Home(props: {
  searchParams?:
    | {
        lat?: string;
        lng?: string;
        radiusKm?: string;
        sport?: string;
        day?: string;
        q?: string;
        maxPrice?: string;
        minRating?: string;
        onlyFavorites?: string;
      }
    | Promise<{
        lat?: string;
        lng?: string;
        radiusKm?: string;
        sport?: string;
        day?: string;
        q?: string;
        maxPrice?: string;
        minRating?: string;
        onlyFavorites?: string;
      }>;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const session = await getServerSession(authOptions);
  const viewerUserId = session?.user?.id ?? null;
  const isLoggedIn = Boolean(viewerUserId);

  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const latFromQuery = typeof searchParams?.lat === "string" ? parseNumber(searchParams.lat, NaN) : NaN;
  const lngFromQuery = typeof searchParams?.lng === "string" ? parseNumber(searchParams.lng, NaN) : NaN;

  let userLat: number | null = null;
  let userLng: number | null = null;
  let userAddress: string | null = null;
  let userName: string | null = null;
  let userImage: string | null = null;
  if (viewerUserId) {
    const user = await prisma.user.findUnique({
      where: { id: viewerUserId },
      select: { latitude: true, longitude: true, address_text: true, name: true, image: true },
    });
    userLat = typeof user?.latitude === "number" ? user.latitude : null;
    userLng = typeof user?.longitude === "number" ? user.longitude : null;
    userAddress = typeof user?.address_text === "string" ? user.address_text : null;
    userName = typeof user?.name === "string" ? user.name : null;
    userImage = typeof user?.image === "string" ? user.image : null;
  }

  const hasCoordsFromQuery = Number.isFinite(latFromQuery) && Number.isFinite(lngFromQuery);
  const hasCoordsFromUser = typeof userLat === "number" && typeof userLng === "number";

  const lat = hasCoordsFromQuery ? latFromQuery : hasCoordsFromUser ? userLat! : -23.55052;
  const lng = hasCoordsFromQuery ? lngFromQuery : hasCoordsFromUser ? userLng! : -46.633308;
  const radiusKm = parseNumber(searchParams?.radiusKm, 20);
  const sport = parseSport(searchParams?.sport);
  const day = parseDay(searchParams?.day);
  const maxPrice = parseNumber(searchParams?.maxPrice, 0);
  const minRating = parseNumber(searchParams?.minRating, 0);
  const onlyFavorites = searchParams?.onlyFavorites === "1";

  return (
    <SearchClient
      apiKey={apiKey}
      hero={{
        title: "O jeito mais rápido de encontrar e agendar sua próxima partida.",
        description: "Busque quadras por localização, veja disponibilidade e finalize o agendamento.",
      }}
      showOwnerCtaOnLoggedOut={!isLoggedIn}
      showMarketingCardsOnLoggedOut={!isLoggedIn}
      showFooter
      viewer={{
        userId: viewerUserId,
        isLoggedIn,
        role: session?.user?.role ?? null,
        name: session?.user?.name ?? userName,
        image: session?.user?.image ?? userImage,
      }}
      initial={{
        lat,
        lng,
        address: userAddress ?? undefined,
        radiusKm,
        sport,
        day,
        q: searchParams?.q,
        maxPrice: maxPrice > 0 ? maxPrice : null,
        minRating: minRating > 0 ? minRating : null,
        onlyFavorites,
        locationSource: hasCoordsFromQuery ? "query" : hasCoordsFromUser ? "user" : "default",
      }}
    />
  );
}
