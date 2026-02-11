import "dotenv/config";

import { prisma } from "@/lib/prisma";

function daysToMs(days: number) {
  return days * 24 * 60 * 60 * 1000;
}

async function main() {
  const now = new Date();

  const auditRetentionDays = Number(process.env.MAINTENANCE_AUDIT_LOG_RETENTION_DAYS ?? 180);
  const notificationRetentionDays = Number(process.env.MAINTENANCE_NOTIFICATION_RETENTION_DAYS ?? 90);

  const auditCutoff = new Date(now.getTime() - daysToMs(auditRetentionDays));
  const notificationCutoff = new Date(now.getTime() - daysToMs(notificationRetentionDays));

  const [expiredTokens, oldAuditLogs, oldNotifications] = await Promise.all([
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
    }),
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: auditCutoff } },
    }),
    prisma.notification.deleteMany({
      where: {
        AND: [{ deletedAt: { not: null } }, { deletedAt: { lt: notificationCutoff } }],
      },
    }),
  ]);

  console.log("[maintenance-cleanup] done", {
    expiredTokens: expiredTokens.count,
    oldAuditLogs: oldAuditLogs.count,
    oldNotifications: oldNotifications.count,
  });
}

main().catch((e) => {
  console.error("[maintenance-cleanup] fatal", e);
  process.exit(1);
});
