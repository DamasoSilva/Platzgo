export function toWaMeLink(whatsappNumber: string): string {
  const digits = (whatsappNumber ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}
