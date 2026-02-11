import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { getCourtBookingsForDay } from "@/lib/actions/courts";
import { prisma } from "@/lib/prisma";
import { CourtDetailsClient } from "./ui";

export async function generateMetadata(props: {
  params: { id: string } | Promise<{ id: string }>;
}): Promise<Metadata> {
  const params = await Promise.resolve(props.params);
  const court = await prisma.court.findUnique({
    where: { id: params.id },
    select: { name: true, establishment: { select: { name: true } } },
  });

  if (!court) {
    return { title: "Quadra" };
  }

  return {
    title: `${court.name} • ${court.establishment.name} • PlatzGo!`,
    description: `Agende horários na quadra ${court.name} em ${court.establishment.name}.`,
  };
}

function coerceDay(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return value;
}

export default async function CourtPage(props: {
  params: { id: string } | Promise<{ id: string }>;
  searchParams?: { day?: string } | Promise<{ day?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  const viewer = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, image: true },
      })
    : null;

  const params = await Promise.resolve(props.params);
  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;

  const day = coerceDay(searchParams?.day);

  let data: Awaited<ReturnType<typeof getCourtBookingsForDay>>;
  try {
    data = await getCourtBookingsForDay({
      courtId: params.id,
      day,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "COURT_INACTIVE") {
      notFound();
    }
    throw e;
  }

  return (
    <CourtDetailsClient
      userId={userId}
      viewer={{
        name: session?.user?.name ?? viewer?.name ?? null,
        image: session?.user?.image ?? viewer?.image ?? null,
        role: session?.user?.role ?? null,
      }}
      courtId={params.id}
      day={day}
      initial={data}
    />
  );
}
