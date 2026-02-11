import { requireRoleOrRedirect } from "@/lib/authz";

import { SysadminSearchOptions } from "./ui";

export default async function SysadminSearchOptionsPage() {
  await requireRoleOrRedirect("SYSADMIN", "/sysadmin/search-options");

  return <SysadminSearchOptions />;
}
