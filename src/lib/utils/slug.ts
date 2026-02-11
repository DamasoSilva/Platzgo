export function slugify(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "estabelecimento";
}
