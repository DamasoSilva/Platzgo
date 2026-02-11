import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerHeader } from "@/components/CustomerHeader";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { toWaMeLink } from "@/lib/utils/whatsapp";
import { ThemedBackground } from "@/components/ThemedBackground";

import { DayPickerClient } from "./DayPickerClient";
import { EngagementClient } from "./EngagementClient";
import { formatSportLabel } from "@/lib/utils/sport";

export async function generateMetadata(props: {
  params: { id: string } | Promise<{ id: string }>;
}): Promise<Metadata> {
  const params = await Promise.resolve(props.params);
  const est = await prisma.establishment.findUnique({
    where: { id: params.id },
    select: { name: true, description: true },
  });

  if (!est) {
    return { title: "Estabelecimento" };
  }

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

export default async function EstablishmentPage(props: {
  params: { id: string } | Promise<{ id: string }>;
  searchParams?: { day?: string } | Promise<{ day?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  const params = await Promise.resolve(props.params);
  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const day = coerceDay(searchParams?.day);

  const callbackUrl = `/establishments/${params.id}?day=${encodeURIComponent(day)}`;
  if (!userId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const est = await prisma.establishment.findUnique({
    where: { id: params.id },
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
    redirect("/");
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

        <div className="mx-auto max-w-5xl px-6 pb-12">
          <div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">Selecione a quadra para ver os horários disponíveis</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{est.name}</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{est.address_text}</p>
            {instagramUrl ? (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center text-sm font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-4 dark:text-zinc-100 dark:decoration-zinc-600"
              >
                Instagram
              </a>
            ) : null}
          </div>

          <div className="mt-6">
            <DayPickerClient establishmentId={est.id} initialDay={day} />
          </div>

          {coverUrl ? (
            <div className="mt-6 h-72 overflow-hidden rounded-3xl border border-zinc-200 bg-black/20 dark:border-zinc-800 dark:bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverUrl} alt={`Foto de ${est.name}`} className="h-full w-full object-contain" />
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {est.courts.map((c) => {
              const courtCover = (c.photo_urls ?? []).find((u) => (u ?? "").trim()) ?? coverUrl;
              return (
                <div
                  key={c.id}
                  className="overflow-hidden rounded-3xl ph-surface"
                >
                  {courtCover ? (
                    <div className="h-44 w-full bg-black/20 dark:bg-black/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={courtCover} alt={`Foto da quadra ${c.name}`} className="h-full w-full object-contain" />
                    </div>
                  ) : null}

                  <div className="p-5">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{c.name}</p>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      {formatSportLabel(c.sport_type)} • {formatBRLFromCents(c.price_per_hour)}/h
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Link
                        href={{ pathname: `/courts/${c.id}`, query: { day } }}
                        className="ph-button-sm"
                      >
                        Ver horários
                      </Link>

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
            <div className="mt-6 rounded-3xl ph-surface p-6 text-sm text-zinc-700 dark:text-zinc-200">
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
