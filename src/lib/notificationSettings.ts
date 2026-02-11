import { getSystemSetting, setSystemSetting } from "@/lib/systemSettings";

export const NOTIFICATION_SETTING_KEYS = {
  emailEnabled: "notifications.email.enabled",
  emailBookingConfirmationEnabled: "notifications.email.booking_confirmation_enabled",
  emailBookingCancellationEnabled: "notifications.email.booking_cancellation_enabled",
  emailBookingReminderEnabled: "notifications.email.booking_reminder_enabled",
  emailReminderHoursBefore: "notifications.email.reminder_hours_before",
  whatsappEnabled: "notifications.whatsapp.enabled",
  whatsappQuietHoursStart: "notifications.whatsapp.quiet_hours_start",
  whatsappQuietHoursEnd: "notifications.whatsapp.quiet_hours_end",
  smsEnabled: "notifications.sms.enabled",
  smsQuietHoursStart: "notifications.sms.quiet_hours_start",
  smsQuietHoursEnd: "notifications.sms.quiet_hours_end",
} as const;

export type NotificationSettings = {
  emailEnabled: boolean;
  emailBookingConfirmationEnabled: boolean;
  emailBookingCancellationEnabled: boolean;
  emailBookingReminderEnabled: boolean;
  emailReminderHoursBefore: number;
  whatsappEnabled: boolean;
  whatsappQuietHoursStart: number;
  whatsappQuietHoursEnd: number;
  smsEnabled: boolean;
  smsQuietHoursStart: number;
  smsQuietHoursEnd: number;
};

export type NotificationSettingsInput = Partial<NotificationSettings>;

export type EmailNotificationKind =
  | "booking_pending"
  | "booking_confirmation"
  | "booking_cancellation"
  | "booking_reminder"
  | "booking_rescheduled"
  | "booking_invite";

const DEFAULTS: NotificationSettings = {
  emailEnabled: true,
  emailBookingConfirmationEnabled: true,
  emailBookingCancellationEnabled: true,
  emailBookingReminderEnabled: true,
  emailReminderHoursBefore: 24,
  whatsappEnabled: false,
  whatsappQuietHoursStart: 22,
  whatsappQuietHoursEnd: 8,
  smsEnabled: false,
  smsQuietHoursStart: 22,
  smsQuietHoursEnd: 8,
};

function parseBool(value: string | null | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const v = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function clampNumber(value: string | number | null | undefined, fallback: number, min: number, max: number): number {
  if (value == null) return fallback;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const [
    emailEnabledRaw,
    emailConfirmationRaw,
    emailCancellationRaw,
    emailReminderRaw,
    reminderHoursRaw,
    whatsappEnabledRaw,
    whatsappQuietStartRaw,
    whatsappQuietEndRaw,
    smsEnabledRaw,
    smsQuietStartRaw,
    smsQuietEndRaw,
  ] = await Promise.all([
    getSystemSetting(NOTIFICATION_SETTING_KEYS.emailEnabled),
    getSystemSetting(NOTIFICATION_SETTING_KEYS.emailBookingConfirmationEnabled),
    getSystemSetting(NOTIFICATION_SETTING_KEYS.emailBookingCancellationEnabled),
    getSystemSetting(NOTIFICATION_SETTING_KEYS.emailBookingReminderEnabled),
    getSystemSetting(NOTIFICATION_SETTING_KEYS.emailReminderHoursBefore),
    getSystemSetting(NOTIFICATION_SETTING_KEYS.whatsappEnabled),
    getSystemSetting(NOTIFICATION_SETTING_KEYS.whatsappQuietHoursStart),
    getSystemSetting(NOTIFICATION_SETTING_KEYS.whatsappQuietHoursEnd),
    getSystemSetting(NOTIFICATION_SETTING_KEYS.smsEnabled),
    getSystemSetting(NOTIFICATION_SETTING_KEYS.smsQuietHoursStart),
    getSystemSetting(NOTIFICATION_SETTING_KEYS.smsQuietHoursEnd),
  ]);

  return {
    emailEnabled: parseBool(emailEnabledRaw, DEFAULTS.emailEnabled),
    emailBookingConfirmationEnabled: parseBool(
      emailConfirmationRaw,
      DEFAULTS.emailBookingConfirmationEnabled
    ),
    emailBookingCancellationEnabled: parseBool(
      emailCancellationRaw,
      DEFAULTS.emailBookingCancellationEnabled
    ),
    emailBookingReminderEnabled: parseBool(emailReminderRaw, DEFAULTS.emailBookingReminderEnabled),
    emailReminderHoursBefore: clampNumber(
      reminderHoursRaw,
      DEFAULTS.emailReminderHoursBefore,
      1,
      168
    ),
    whatsappEnabled: parseBool(whatsappEnabledRaw, DEFAULTS.whatsappEnabled),
    whatsappQuietHoursStart: clampNumber(
      whatsappQuietStartRaw,
      DEFAULTS.whatsappQuietHoursStart,
      0,
      23
    ),
    whatsappQuietHoursEnd: clampNumber(
      whatsappQuietEndRaw,
      DEFAULTS.whatsappQuietHoursEnd,
      0,
      23
    ),
    smsEnabled: parseBool(smsEnabledRaw, DEFAULTS.smsEnabled),
    smsQuietHoursStart: clampNumber(smsQuietStartRaw, DEFAULTS.smsQuietHoursStart, 0, 23),
    smsQuietHoursEnd: clampNumber(smsQuietEndRaw, DEFAULTS.smsQuietHoursEnd, 0, 23),
  };
}

export async function saveNotificationSettings(input: NotificationSettingsInput) {
  const payload: NotificationSettings = {
    ...DEFAULTS,
    ...input,
    emailReminderHoursBefore: clampNumber(
      input.emailReminderHoursBefore,
      DEFAULTS.emailReminderHoursBefore,
      1,
      168
    ),
    whatsappQuietHoursStart: clampNumber(
      input.whatsappQuietHoursStart,
      DEFAULTS.whatsappQuietHoursStart,
      0,
      23
    ),
    whatsappQuietHoursEnd: clampNumber(
      input.whatsappQuietHoursEnd,
      DEFAULTS.whatsappQuietHoursEnd,
      0,
      23
    ),
    smsQuietHoursStart: clampNumber(
      input.smsQuietHoursStart,
      DEFAULTS.smsQuietHoursStart,
      0,
      23
    ),
    smsQuietHoursEnd: clampNumber(
      input.smsQuietHoursEnd,
      DEFAULTS.smsQuietHoursEnd,
      0,
      23
    ),
  };

  await Promise.all([
    setSystemSetting(NOTIFICATION_SETTING_KEYS.emailEnabled, payload.emailEnabled ? "1" : "0"),
    setSystemSetting(
      NOTIFICATION_SETTING_KEYS.emailBookingConfirmationEnabled,
      payload.emailBookingConfirmationEnabled ? "1" : "0"
    ),
    setSystemSetting(
      NOTIFICATION_SETTING_KEYS.emailBookingCancellationEnabled,
      payload.emailBookingCancellationEnabled ? "1" : "0"
    ),
    setSystemSetting(
      NOTIFICATION_SETTING_KEYS.emailBookingReminderEnabled,
      payload.emailBookingReminderEnabled ? "1" : "0"
    ),
    setSystemSetting(
      NOTIFICATION_SETTING_KEYS.emailReminderHoursBefore,
      String(payload.emailReminderHoursBefore)
    ),
    setSystemSetting(NOTIFICATION_SETTING_KEYS.whatsappEnabled, payload.whatsappEnabled ? "1" : "0"),
    setSystemSetting(
      NOTIFICATION_SETTING_KEYS.whatsappQuietHoursStart,
      String(payload.whatsappQuietHoursStart)
    ),
    setSystemSetting(
      NOTIFICATION_SETTING_KEYS.whatsappQuietHoursEnd,
      String(payload.whatsappQuietHoursEnd)
    ),
    setSystemSetting(NOTIFICATION_SETTING_KEYS.smsEnabled, payload.smsEnabled ? "1" : "0"),
    setSystemSetting(NOTIFICATION_SETTING_KEYS.smsQuietHoursStart, String(payload.smsQuietHoursStart)),
    setSystemSetting(NOTIFICATION_SETTING_KEYS.smsQuietHoursEnd, String(payload.smsQuietHoursEnd)),
  ]);

  return { ok: true };
}

export function canSendEmail(settings: NotificationSettings, kind: EmailNotificationKind): boolean {
  if (!settings.emailEnabled) return false;

  if (kind === "booking_confirmation" && !settings.emailBookingConfirmationEnabled) return false;
  if (kind === "booking_cancellation" && !settings.emailBookingCancellationEnabled) return false;
  if (kind === "booking_reminder" && !settings.emailBookingReminderEnabled) return false;

  return true;
}

export function isWithinQuietHours(now: Date, startHour: number, endHour: number): boolean {
  const hour = now.getHours();
  if (startHour === endHour) return true;
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  return hour >= startHour || hour < endHour;
}
