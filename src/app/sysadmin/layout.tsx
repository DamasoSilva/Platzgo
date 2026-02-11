import { SysadminLayoutClient } from "./SysadminLayoutClient";
import { prisma } from "@/lib/prisma";
import { EstablishmentApprovalStatus } from "@/generated/prisma/enums";

export default async function SysadminLayout(props: { children: React.ReactNode }) {
  const pendingApprovalsCount = await prisma.establishment.count({
    where: { approval_status: EstablishmentApprovalStatus.PENDING },
  });

  return <SysadminLayoutClient pendingApprovalsCount={pendingApprovalsCount}>{props.children}</SysadminLayoutClient>;
}
