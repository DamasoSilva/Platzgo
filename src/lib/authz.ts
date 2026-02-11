import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado");
  return session;
}

export async function requireRole(role: Role) {
  const session = await requireSession();
  if (session.user.role !== role) {
    if (!(session.user.role === "SYSADMIN" && role === "ADMIN")) {
      throw new Error("Sem permissão");
    }
  }
  return session;
}

export async function requireSessionOrRedirect(callbackUrl: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  return session;
}

export async function requireRoleOrRedirect(role: Role, callbackUrl: string) {
  const session = await requireSessionOrRedirect(callbackUrl);
  if (session.user.role !== role && !(session.user.role === "SYSADMIN" && role === "ADMIN")) {
    redirect("/");
  }
  return session;
}

export async function requireAdminWithEstablishmentOrRedirect(callbackUrl: string) {
  const session = await requireRoleOrRedirect("ADMIN", callbackUrl);

  const establishment = await prisma.establishment.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });

  if (!establishment) {
    redirect(`/dashboard/admin?setup=1&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return { session, establishmentId: establishment.id };
}

export async function requireAdminWithSetupOrRedirect(callbackUrl: string) {
  const { session, establishmentId } = await requireAdminWithEstablishmentOrRedirect(callbackUrl);

  const hasCourt = await prisma.court.findFirst({
    where: { establishmentId },
    select: { id: true },
  });

  if (!hasCourt) {
    redirect(`/dashboard/quadras?setup=court&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  return { session, establishmentId };
}
