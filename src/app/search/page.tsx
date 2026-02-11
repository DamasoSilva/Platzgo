import { redirect } from "next/navigation";

export default async function SearchPage(props: {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (typeof v === "string") params.set(k, v);
  }
  const qs = params.toString();
  redirect(qs ? `/?${qs}` : "/");
}
