import type { NotificationType } from "@/generated/prisma/enums";

const FRIENDLY_NOTIFICATION_LABELS: Partial<Record<NotificationType, string>> = {
  BOOKING_CONFIRMED: "Agendamento confirmado",
  BOOKING_CANCELLED: "Agendamento cancelado",
  BOOKING_PENDING: "Agendamento pendente",
  BOOKING_RESCHEDULED: "Agendamento remarcado",
  BOOKING_AUTO_CANCELLED: "Agendamento cancelado automaticamente",
  MONTHLY_PASS_PENDING: "Passe mensal pendente",
  AVAILABILITY_ALERT: "Alerta de disponibilidade",
  TOURNAMENT_REGISTRATION_PENDING: "Inscrição de torneio pendente",
  TOURNAMENT_REGISTRATION_APPROVED: "Inscrição de torneio aprovada",
  TOURNAMENT_REGISTRATION_REJECTED: "Inscrição de torneio recusada",
  TOURNAMENT_CANCELLED: "Torneio cancelado",
  TOURNAMENT_INVITATION: "Convite de torneio",
  TOURNAMENT_CONNECTION_APPLICATION: "Candidatura a time",
  TOURNAMENT_CONNECTION_INVITATION: "Convocação de time",
  TOURNAMENT_CONNECTION_ACCEPTED: "Conexão aceita",
  TOURNAMENT_CONNECTION_REJECTED: "Conexão recusada",
};

type NotificationAppearance = {
  label: string;
  badgeClassName: string;
  dotClassName: string;
  cardAccentClassName: string;
};

const DEFAULT_NOTIFICATION_APPEARANCE: NotificationAppearance = {
  label: "Notificação",
  badgeClassName: "border-border bg-secondary text-foreground",
  dotClassName: "bg-muted-foreground/60",
  cardAccentClassName: "border-l-border",
};

const NOTIFICATION_APPEARANCES: Partial<Record<NotificationType, Omit<NotificationAppearance, "label">>> = {
  BOOKING_CONFIRMED: {
    badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dotClassName: "bg-emerald-500",
    cardAccentClassName: "border-l-emerald-500/60",
  },
  BOOKING_CANCELLED: {
    badgeClassName: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dotClassName: "bg-rose-500",
    cardAccentClassName: "border-l-rose-500/60",
  },
  BOOKING_PENDING: {
    badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dotClassName: "bg-amber-500",
    cardAccentClassName: "border-l-amber-500/60",
  },
  BOOKING_RESCHEDULED: {
    badgeClassName: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    dotClassName: "bg-sky-500",
    cardAccentClassName: "border-l-sky-500/60",
  },
  BOOKING_AUTO_CANCELLED: {
    badgeClassName: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dotClassName: "bg-rose-500",
    cardAccentClassName: "border-l-rose-500/60",
  },
  MONTHLY_PASS_PENDING: {
    badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    dotClassName: "bg-amber-500",
    cardAccentClassName: "border-l-amber-500/60",
  },
  AVAILABILITY_ALERT: {
    badgeClassName: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    dotClassName: "bg-cyan-500",
    cardAccentClassName: "border-l-cyan-500/60",
  },
  TOURNAMENT_REGISTRATION_PENDING: {
    badgeClassName: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    dotClassName: "bg-orange-500",
    cardAccentClassName: "border-l-orange-500/60",
  },
  TOURNAMENT_REGISTRATION_APPROVED: {
    badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dotClassName: "bg-emerald-500",
    cardAccentClassName: "border-l-emerald-500/60",
  },
  TOURNAMENT_REGISTRATION_REJECTED: {
    badgeClassName: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dotClassName: "bg-rose-500",
    cardAccentClassName: "border-l-rose-500/60",
  },
  TOURNAMENT_CANCELLED: {
    badgeClassName: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dotClassName: "bg-rose-500",
    cardAccentClassName: "border-l-rose-500/60",
  },
  TOURNAMENT_INVITATION: {
    badgeClassName: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
    dotClassName: "bg-indigo-500",
    cardAccentClassName: "border-l-indigo-500/60",
  },
  TOURNAMENT_CONNECTION_APPLICATION: {
    badgeClassName: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
    dotClassName: "bg-fuchsia-500",
    cardAccentClassName: "border-l-fuchsia-500/60",
  },
  TOURNAMENT_CONNECTION_INVITATION: {
    badgeClassName: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    dotClassName: "bg-violet-500",
    cardAccentClassName: "border-l-violet-500/60",
  },
  TOURNAMENT_CONNECTION_ACCEPTED: {
    badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    dotClassName: "bg-emerald-500",
    cardAccentClassName: "border-l-emerald-500/60",
  },
  TOURNAMENT_CONNECTION_REJECTED: {
    badgeClassName: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
    dotClassName: "bg-rose-500",
    cardAccentClassName: "border-l-rose-500/60",
  },
};

export function getNotificationTypeLabel(type: NotificationType | string): string {
  return FRIENDLY_NOTIFICATION_LABELS[type as NotificationType] ?? String(type).replace(/_/g, " ").toLowerCase();
}

export function getNotificationTypeAppearance(type: NotificationType | string): NotificationAppearance {
  const normalizedType = type as NotificationType;
  return {
    label: getNotificationTypeLabel(type),
    ...DEFAULT_NOTIFICATION_APPEARANCE,
    ...(NOTIFICATION_APPEARANCES[normalizedType] ?? {}),
  };
}