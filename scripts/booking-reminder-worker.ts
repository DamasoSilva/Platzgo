import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { BookingStatus } from "@/generated/prisma/enums";
import { enqueueEmail } from "@/lib/emailQueue";
import { bookingReminderEmailToCustomer, getAppUrl } from "@/lib/emailTemplates";
import { canSendEmail, getNotificationSettings } from "@/lib/notificationSettings";
import { logMetric } from "@/lib/metrics";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function processRemindersOnce() {
  const settings = await getNotificationSettings();
  if (!canSendEmail(settings, "booking_reminder")) {
    return { processed: 0, skipped: true };
  }

  const now = new Date();
  const reminderHours = settings.emailReminderHoursBefore;
  const windowMinutes = clamp(Number(process.env.REMINDER_WINDOW_MINUTES ?? 60), 5, 240);

  const extraRaw = process.env.REMINDER_EXTRA_HOURS;
  const extraList = (extraRaw ? extraRaw.split(",") : ["24", "3"]).map((v) => Number(v.trim()));
  const reminderHoursList = Array.from(
    new Set([reminderHours, ...extraList].filter((v) => Number.isFinite(v) && v > 0))
  );

  const appUrl = getAppUrl();
  let sent = 0;
  let processed = 0;

  for (const hours of reminderHoursList) {
    const windowStart = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const windowEnd = new Date(windowStart.getTime() + windowMinutes * 60 * 1000);

    const bookings = await prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        start_time: { gte: windowStart, lt: windowEnd },
      },
      select: {
        id: true,
        start_time: true,
        end_time: true,
        customer_name: true,
        customer_email: true,
        customer: { select: { name: true, email: true } },
        court: { select: { name: true, establishment: { select: { name: true } } } },
      },
    });

    processed += bookings.length;

    for (const booking of bookings) {
      const to = booking.customer?.email ?? booking.customer_email ?? null;
      if (!to) continue;

      const detailsUrl = `${appUrl}/meus-agendamentos/${booking.id}`;
      const { subject, text, html } = bookingReminderEmailToCustomer({
        customerName: booking.customer?.name ?? booking.customer_name ?? null,
        establishmentName: booking.court.establishment.name,
        courtName: booking.court.name,
        start: booking.start_time,
        end: booking.end_time,
        detailsUrl,
      });

      await enqueueEmail({
        to,
        subject,
        text,
        html,
        dedupeKey: `booking:reminder:${booking.id}:${hours}:${to}`,
      });

      sent++;
    }
  }

  return { processed, sent, skipped: false };
}

async function main() {
  const intervalMs = clamp(Number(process.env.REMINDER_WORKER_INTERVAL_MS ?? 60000), 5000, 10 * 60 * 1000);
  console.log("[booking-reminder-worker] started", { intervalMs });

  while (true) {
    try {
      const res = await processRemindersOnce();
      if (res.processed || res.skipped) {
        console.log("[booking-reminder-worker] batch", res);
        if (!res.skipped) {
          logMetric("booking_reminders.processed", res.processed, { sent: res.sent });
        }
      }
    } catch (e) {
      console.error("[booking-reminder-worker] error", e);
    }

    await sleep(intervalMs);
  }
}

main().catch((e) => {
  console.error("[booking-reminder-worker] fatal", e);
  process.exit(1);
});
