import { SportType } from "@/generated/prisma/enums";

export function formatSportLabel(value: SportType | string | null | undefined): string {
  if (!value) return "";

  switch (value) {
    case SportType.FUTSAL:
      return "Futsal";
    case SportType.TENNIS:
      return "Tênis";
    case SportType.BEACH_TENNIS:
      return "Quadra de Areia";
    case SportType.PADEL:
      return "Padel";
    case SportType.POLIESPORTIVA:
      return "Quadra Poliesportiva";
    case SportType.SOCIETY:
      return "Society";
    case SportType.SQUASH:
      return "Squash";
    case SportType.TABLE_TENNIS:
      return "Tênis de Mesa";
    case SportType.BADMINTON:
      return "Badminton";
    case SportType.VOLLEYBALL:
      return "Vôlei";
    case SportType.BASKETBALL:
      return "Basquete";
    case SportType.GOLF:
      return "Golf";
    case SportType.RACQUETBALL:
      return "Raquetball";
    case SportType.HANDBALL:
      return "Handebol";
    case SportType.CAMPO:
      return "Campo";
    case SportType.PISCINA:
      return "Piscina";
    case SportType.CUSTOM:
      return "Personalizado";
    case SportType.OTHER:
      return "Outro";
    default:
      return String(value).replace(/_/g, " ");
  }
}
