import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerHeader } from "@/components/CustomerHeader";
import { toWaMeLink } from "@/lib/utils/whatsapp";
import { ThemedBackground } from "@/components/ThemedBackground";
import { PhotoStrip } from "@/components/PhotoStrip";
import { EstablishmentHeader, CourtCard } from "@/components/EstablishmentUI";
import { EngagementClient } from "./EngagementClient";
import { SearchPrefillClient } from "@/components/SearchPrefillClient";

export async function generateMetadata(props: { params: { id: string } | Promise<{ id: string }> }): Promise<Metadata> {
  const params = await Promise.resolve(props.params);
  const est = await prisma.establishment.findUnique({ where: { id: params.id }, select: { name: true, description: true, slug: true } });
  if (!est) return { title: "Estabelecimento" };
  return { title: `${est.name} • PlatzGo!`, description: est.description ?? `Agende horários em ${est.name}.`, robots: { index: false, follow: true }, alternates: { canonical: est.slug ? `/${est.slug}` : undefined } };
}

function coerceDay(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function coerceTime(value: unknown): string | null {
  if (typeof value === "string" && /^\d{2}:\d{2}$/.test(value)) return value;
  return null;
}

export default async function EstablishmentPage(props: {
  params: { id: string } | Promise<{ id: string }>;
  searchParams?: { day?: string; time?: string } | Promise<{ day?: string; time?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const params = await Promise.resolve(props.params);
  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const rawDay = searchParams?.day;
  const rawTime = searchParams?.time;
  const hasDayParam = typeof rawDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDay);
  const hasTimeParam = typeof rawTime === "string" && /^\d{2}:\d{2}$/.test(rawTime);
  const day = coerceDay(rawDay);
  const time = coerceTime(rawTime);
  const callbackUrl = `/establishments/${params.id}?day=${encodeURIComponent(day)}${time ? `&time=${encodeURIComponent(time)}` : ""}`;

  const est = await prisma.establishment.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, description: true, slug: true, photo_urls: true, address_text: true,
      whatsapp_number: true, contact_number: true, instagram_url: true,
      open_weekdays: true, opening_time: true, closing_time: true,
      courts: { where: { is_active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, sport_type: true, price_per_hour: true, photo_urls: true, amenities: true } },
    },
  });
  if (!est) redirect("/");
  if (est.slug) {
    const qs = hasDayParam ? `day=${encodeURIComponent(day)}${time ? `&time=${encodeURIComponent(time)}` : ""}` : "";
    redirect(`/${est.slug}${qs ? `?${qs}` : ""}`);
  }

  const [reviews, stats, favorite] = await Promise.all([
    prisma.establishmentReview.findMany({ where: { establishmentId: est.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, rating: true, comment: true, createdAt: true, userId: true, user: { select: { name: true } } } }),
    prisma.establishmentReview.aggregate({ where: { establishmentId: est.id }, _avg: { rating: true }, _count: { rating: true } }),
    userId ? prisma.establishmentFavorite.findUnique({ where: { establishmentId_userId: { establishmentId: est.id, userId } }, select: { id: true } }) : Promise.resolve(null),
  ]);

  const waLink = toWaMeLink(est.whatsapp_number);
  const instagramUrl = (est.instagram_url ?? "").trim() || null;
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(est.address_text)}`;
  const photos = (est.photo_urls ?? []).filter((u) => (u ?? "").trim());

  return (
    <div className="ph-page">
      <ThemedBackground />
      <div className="relative z-10">
        <CustomerHeader variant="light" subtitle="Agende quadras com poucos cliques" viewer={{ isLoggedIn: Boolean(userId), name: session?.user?.name ?? null, image: session?.user?.image ?? null, role: session?.user?.role ?? null }} rightSlot={null} />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-16 pt-4">
          <EstablishmentHeader name={est.name} address={est.address_text} description={est.description} openingTime={est.opening_time} closingTime={est.closing_time} waLink={waLink} mapsHref={mapsHref} instagramUrl={instagramUrl} />
          <SearchPrefillClient hasDayParam={hasDayParam} hasTimeParam={hasTimeParam} basePath={`/establishments/${est.id}`} />

          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight text-foreground">Quadras disponíveis ({est.courts.length})</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {est.courts.map((c) => (
                <CourtCard key={c.id} court={c} coverUrl={photos[0] ?? null} waLink={waLink} day={day} time={time} hasDayParam={hasDayParam} hasTimeParam={hasTimeParam} />
              ))}
            </div>
            {est.courts.length === 0 && <div className="mt-4 rounded-2xl ph-surface p-6 text-sm text-muted-foreground">Nenhuma quadra ativa encontrada.</div>}
          </section>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Fotos</h3>
              <PhotoStrip photos={photos} altPrefix={`Foto de ${est.name}`} />
            </div>
            <div>
              <EngagementClient
                establishmentId={est.id} initialIsFavorite={Boolean(favorite)}
                avgRating={stats._avg.rating ?? 0} reviewsCount={stats._count.rating}
                isLoggedIn={Boolean(userId)} signInCallbackUrl={callbackUrl}
                reviews={reviews.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, createdAt: r.createdAt.toISOString(), userName: r.user?.name ?? "Cliente", userId: r.userId }))}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}