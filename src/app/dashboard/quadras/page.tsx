import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireAdminWithEstablishmentOrRedirect } from "@/lib/authz";

import { QuadrasDashboard } from "./ui";

export default async function QuadrasPage() {
  const { establishmentId } = await requireAdminWithEstablishmentOrRedirect("/dashboard/quadras");

  const establishment = await prisma.establishment.findUnique({
    where: { id: establishmentId },
    select: {
      id: true,
      name: true,
      courts: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          sport_type: true,
          price_per_hour: true,
          discount_percentage_over_90min: true,
          amenities: true,
          monthly_price_cents: true,
          monthly_terms: true,
          photo_urls: true,
          is_active: true,
          inactive_reason_id: true,
          inactive_reason_note: true,
          inactive_reason: {
            select: { id: true, title: true },
          },
        },
      },
    },
  });

  if (!establishment) {
    redirect("/dashboard/admin?setup=1");
  }

  return <QuadrasDashboard establishment={establishment} />;
}
