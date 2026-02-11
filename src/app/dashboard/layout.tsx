import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardLayoutClient } from "./DashboardLayoutClient";

export default async function DashboardLayout(props: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  let hasEstablishment = false;
  let hasAtLeastOneCourt = false;
  let establishmentProfile: { name: string; imageUrl: string | null } | null = null;
  let approvalStatus: import("@/generated/prisma/enums").EstablishmentApprovalStatus | null = null;
  if (session?.user?.id && session.user.role === "ADMIN") {
    const est = await prisma.establishment.findFirst({
      where: { ownerId: session.user.id },
      select: { id: true, name: true, photo_urls: true, approval_status: true, courts: { select: { id: true }, take: 1 } },
    });
    hasEstablishment = Boolean(est);
    hasAtLeastOneCourt = Boolean(est?.courts?.length);

    if (est) {
      establishmentProfile = { name: est.name, imageUrl: est.photo_urls?.[0] ?? null };
      approvalStatus = est.approval_status ?? null;
    }
  }

  return (
    <DashboardLayoutClient
      hasEstablishment={hasEstablishment}
      hasAtLeastOneCourt={hasAtLeastOneCourt}
      establishmentProfile={establishmentProfile}
      approvalStatus={approvalStatus}
    >
      {props.children}
    </DashboardLayoutClient>
  );
}
