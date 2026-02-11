import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { BookingStatus, NotificationType } from "@/generated/prisma/enums";
import { enqueueEmail } from "@/lib/emailQueue";
import { availabilityAlertEmailToCustomer, getAppUrl } from "@/lib/emailTemplates";
import { getNotificationSettings } from "@/lib/notificationSettings";
import { dateWithTime } from "@/lib/utils/time";
import { logMetric } from "@/lib/metrics";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function expandRangeWithBuffer(start: Date, end: Date, bufferMinutes: number) {
  const bufferMs = Math.max(0, Math.floor(bufferMinutes)) * 60000;
  return {
    start: new Date(start.getTime() - bufferMs),
    end: new Date(end.getTime() + bufferMs),
  };
}

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function isWithinOperatingHours(establishmentId: string, start: Date, end: Date) {
  const dayKey = toDayKey(start);
  if (toDayKey(end) !== dayKey) return false;

  const establishment = await prisma.establishment.findUnique({
    where: { id: establishmentId },
    select: { open_weekdays: true, opening_time: true, closing_time: true },
  });
  if (!establishment) return false;

  const holiday = await prisma.establishmentHoliday.findUnique({
    where: { establishmentId_date: { establishmentId, date: dayKey } },
    select: { is_open: true, opening_time: true, closing_time: true },
  });

  const weekday = start.getDay();
  const isWeekdayOpen = establishment.open_weekdays.includes(weekday);
  if (holiday && !holiday.is_open) return false;
  if (!isWeekdayOpen && !holiday?.is_open) return false;

  const opening_time = holiday?.is_open ? holiday.opening_time ?? establishment.opening_time : establishment.opening_time;
  const closing_time = holiday?.is_open ? holiday.closing_time ?? establishment.closing_time : establishment.closing_time;

  const open = dateWithTime(start, opening_time);
  const close = dateWithTime(start, closing_time);
  if (!(close > open)) return false;
  return start >= open && end <= close;
}

async function processAlertsOnce() {
  const settings = await getNotificationSettings();
  const now = new Date();

  const alerts = await prisma.availabilityAlert.findMany({
    where: {
      is_active: true,
      notifiedAt: null,
      start_time: { gt: now },
    },
    select: {
      id: true,
      start_time: true,
      end_time: true,
      userId: true,
      courtId: true,
      user: { select: { name: true, email: true } },
      court: {
        select: {
          name: true,
          establishment: { select: { id: true, name: true, booking_buffer_minutes: true } },
        },
      },
    },
    take: 50,
  });

  let notified = 0;
  const appUrl = getAppUrl();

  for (const alert of alerts) {
    const start = alert.start_time;
    const end = alert.end_time;

    const inHours = await isWithinOperatingHours(alert.court.establishment.id, start, end);
    if (!inHours) continue;

    const bufferedRange = expandRangeWithBuffer(start, end, alert.court.establishment.booking_buffer_minutes ?? 0);

    const blocked = await prisma.courtBlock.findFirst({
      where: {
        courtId: alert.courtId,
        start_time: { lt: bufferedRange.end },
        end_time: { gt: bufferedRange.start },
      },
      select: { id: true },
    });

    const overlap = await prisma.booking.findFirst({
      where: {
        courtId: alert.courtId,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        start_time: { lt: bufferedRange.end },
        end_time: { gt: bufferedRange.start },
      },
      select: { id: true },
    });

    if (blocked || overlap) continue;

    await prisma.availabilityAlert.update({
      where: { id: alert.id },
      data: { is_active: false, notifiedAt: new Date() },
    });

    await prisma.notification.create({
      data: {
        userId: alert.userId,
        type: NotificationType.AVAILABILITY_ALERT,
        title: "Horário disponível",
        body: `O horário que você solicitou ficou disponível: ${alert.court.name}.`,
      },
    });

    const to = alert.user.email;
    if (to && settings.emailEnabled) {
      const detailsUrl = `${appUrl}/courts/${alert.courtId}?day=${toDayKey(start)}`;
      const { subject, text, html } = availabilityAlertEmailToCustomer({
        customerName: alert.user.name,
        establishmentName: alert.court.establishment.name,
        courtName: alert.court.name,
        start,
        end,
        detailsUrl,
      });

      await enqueueEmail({
        to,
        subject,
        text,
        html,
        dedupeKey: `availability:alert:${alert.id}:${to}`,
      });
    }

    notified += 1;
  }

  return { processed: alerts.length, notified };
}

async function main() {
  const intervalMs = clamp(Number(process.env.AVAILABILITY_ALERT_WORKER_INTERVAL_MS ?? 60000), 5000, 10 * 60 * 1000);
  console.log("[availability-alert-worker] started", { intervalMs });

  while (true) {
    try {
      const res = await processAlertsOnce();
      if (res.processed || res.notified) {
        console.log("[availability-alert-worker] batch", res);
        logMetric("availability_alerts.processed", res.processed, { notified: res.notified });
      }
    } catch (e) {
      console.error("[availability-alert-worker] error", e);
    }

    await sleep(intervalMs);
  }
}

main().catch((e) => {
  console.error("[availability-alert-worker] fatal", e);
  process.exit(1);
});
