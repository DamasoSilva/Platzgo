import { requireRoleOrRedirect } from "@/lib/authz";

import { SysadminReasons } from "./ui";

export default async function SysadminReasonsPage() {
  await requireRoleOrRedirect("SYSADMIN", "/sysadmin/reasons");

  return <SysadminReasons />;
}
