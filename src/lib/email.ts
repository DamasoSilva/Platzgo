import { enqueueEmail } from "@/lib/emailQueue";
import { customerInviteEmail, getAppUrl } from "@/lib/emailTemplates";
import { canSendEmail, getNotificationSettings } from "@/lib/notificationSettings";

export async function sendCustomerInviteEmail(params: {
  to: string;
  customerName: string;
  establishmentName: string;
  start: Date;
  end: Date;
}) {
  const notificationSettings = await getNotificationSettings();
  if (!canSendEmail(notificationSettings, "booking_invite")) return;

  const appUrl = getAppUrl();
  const signupUrl = `${appUrl}/signup?role=CUSTOMER`;

  const { subject, text, html } = customerInviteEmail({
    to: params.to,
    customerName: params.customerName,
    establishmentName: params.establishmentName,
    start: params.start,
    end: params.end,
    signupUrl,
  });

  await enqueueEmail({
    to: params.to,
    subject,
    text,
    html,
    dedupeKey: `invite:${params.to}:${params.start.toISOString()}:${params.establishmentName}`,
  });
}
