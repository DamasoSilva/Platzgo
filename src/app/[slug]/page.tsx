import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerHeader } from "@/components/CustomerHeader";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { toWaMeLink } from "@/lib/utils/whatsapp";
import { ThemedBackground } from "@/components/ThemedBackground";
import { slugify } from "@/lib/utils/slug";

import { EngagementClient } from "@/app/establishments/[id]/EngagementClient";
import { formatSportLabel } from "@/lib/utils/sport";
import { SearchPrefillClient } from "@/components/SearchPrefillClient";
import { PrefilledCourtLink } from "@/components/PrefilledCourtLink";

async function resolveEstablishmentIdBySlug(rawSlug: string): Promise<string | null> {
  const normalized = slugify(rawSlug);

  const direct = await prisma.establishment.findFirst({
    where: { slug: normalized },
    select: { id: true },
  });

  if (direct) return direct.id;

  const candidates = await prisma.establishment.findMany({
    select: { id: true, name: true, slug: true },
  });

  const matches = candidates.filter((c) => slugify(c.name) === normalized);
  if (matches.length !== 1) return null;

  const match = matches[0];
  if (!match.slug) {
    try {
      await prisma.establishment.update({
        where: { id: match.id },
        data: { slug: normalized },
      });
    } catch {
      // Ignore slug update conflicts.
    }
  }

  return match.id;
}

export async function generateMetadata(props: {
  params: { slug: string } | Promise<{ slug: string }>;
}): Promise<Metadata> {
  const params = await Promise.resolve(props.params);
  const estId = await resolveEstablishmentIdBySlug(params.slug);

  if (!estId) return { title: "Estabelecimento" };

  const est = await prisma.establishment.findUnique({
    where: { id: estId },
    select: { name: true, description: true },
  });

  if (!est) return { title: "Estabelecimento" };

  return {
    title: `${est.name} • PlatzGo!`,
    description: est.description ?? `Agende horários em ${est.name}.`,
  };
}

function coerceDay(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function coerceTime(value: unknown): string | null {
  if (typeof value === "string" && /^\d{2}:\d{2}$/.test(value)) return value;
  return null;
}

export default async function EstablishmentSlugPage(props: {
  params: { slug: string } | Promise<{ slug: string }>;
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

  const normalizedSlug = slugify(params.slug);
  const estId = await resolveEstablishmentIdBySlug(params.slug);

  if (!estId) {
    notFound();
  }

  const basePath = `/${normalizedSlug}`;
  const callbackUrl = `${basePath}?day=${encodeURIComponent(day)}${time ? `&time=${encodeURIComponent(time)}` : ""}`;
  if (!userId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const est = await prisma.establishment.findUnique({
    where: { id: estId },
    select: {
      id: true,
      name: true,
      description: true,
      photo_urls: true,
      address_text: true,
      whatsapp_number: true,
      contact_number: true,
      instagram_url: true,
      open_weekdays: true,
      opening_time: true,
      closing_time: true,
      courts: {
        where: { is_active: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          sport_type: true,
          price_per_hour: true,
          photo_urls: true,
        },
      },
    },
  });

  if (!est) {
    notFound();
  }

  const [reviews, stats, favorite] = await Promise.all([
    prisma.establishmentReview.findMany({
      where: { establishmentId: est.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        userId: true,
        user: { select: { name: true } },
      },
    }),
    prisma.establishmentReview.aggregate({
      where: { establishmentId: est.id },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.establishmentFavorite.findUnique({
      where: { establishmentId_userId: { establishmentId: est.id, userId } },
      select: { id: true },
    }),
  ]);

  const coverUrl = (est.photo_urls ?? []).find((u) => (u ?? "").trim()) ?? null;
  const waLink = toWaMeLink(est.whatsapp_number);
  const instagramUrl = (est.instagram_url ?? "").trim() || null;
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(est.address_text)}`;

  return (
    <div className="ph-page">
      <ThemedBackground />
      <div className="relative z-10">
        <CustomerHeader
          variant="light"
          subtitle="Agende quadras com poucos cliques"
          viewer={{
            isLoggedIn: true,
            name: session?.user?.name ?? null,
            image: session?.user?.image ?? null,
            role: session?.user?.role ?? null,
          }}
          rightSlot={null}
        />

        <div className="mx-auto max-w-6xl px-6 pb-12 pt-4">
          <div className="ph-card p-6 sm:p-8">
            <p className="text-xs text-muted-foreground dark:text-muted-foreground">Escolha sua quadra e horário em poucos cliques</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground dark:text-foreground">{est.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground">{est.address_text}</p>
            {est.description ? (
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground dark:text-muted-foreground">{est.description}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a href={waLink} target="_blank" rel="noreferrer" className="ph-button-sm">WhatsApp</a>
              <a href={mapsHref} target="_blank" rel="noreferrer" className="ph-button-secondary-sm">Ver no mapa</a>
              {instagramUrl ? (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ph-button-secondary-sm"
                >
                  Instagram
                </a>
              ) : null}
            </div>

            <div className="mt-4 inline-flex items-center rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground dark:border-border dark:bg-card/60 dark:text-muted-foreground">
              Funcionamento: {est.opening_time} às {est.closing_time}
            </div>
          </div>

          <SearchPrefillClient hasDayParam={hasDayParam} hasTimeParam={hasTimeParam} basePath={basePath} />

          {coverUrl ? (
            <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-card shadow-sm dark:border-border dark:bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverUrl} alt={`Foto de ${est.name}`} className="aspect-[16/6] h-full w-full object-cover" />
            </div>
          ) : null}

          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {est.courts.map((c) => {
              const courtCover = (c.photo_urls ?? []).find((u) => (u ?? "").trim()) ?? coverUrl;
              return (
                <div key={c.id} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm dark:border-border dark:bg-card">
                  {courtCover ? (
                    <div className="w-full bg-secondary/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={courtCover} alt={`Foto da quadra ${c.name}`} className="aspect-[16/10] h-full w-full object-cover" />
                    </div>
                  ) : null}

                  <div className="p-5">
                    <p className="text-sm font-semibold text-foreground dark:text-foreground">{c.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground dark:text-muted-foreground">
                      {formatSportLabel(c.sport_type)} • {formatBRLFromCents(c.price_per_hour)}/h
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <PrefilledCourtLink
                        courtId={c.id}
                        day={day}
                        time={time}
                        hasDayParam={hasDayParam}
                        hasTimeParam={hasTimeParam}
                        className="ph-button-sm"
                      >
                        Ver horários
                      </PrefilledCourtLink>

                      <a
                        href={waLink}
                        target="_blank"
                        rel="noreferrer"
                        className="ph-button-secondary-sm"
                      >
                        WhatsApp
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {est.courts.length === 0 ? (
            <div className="mt-6 rounded-3xl ph-surface p-6 text-sm text-muted-foreground dark:text-muted-foreground">
              Nenhuma quadra ativa encontrada neste estabelecimento.
            </div>
          ) : null}

          <EngagementClient
            establishmentId={est.id}
            initialIsFavorite={Boolean(favorite)}
            avgRating={stats._avg.rating ?? 0}
            reviewsCount={stats._count.rating}
            reviews={reviews.map((r) => ({
              id: r.id,
              rating: r.rating,
              comment: r.comment,
              createdAt: r.createdAt.toISOString(),
              userName: r.user?.name ?? "Cliente",
              userId: r.userId,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
