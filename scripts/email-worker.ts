import "dotenv/config";

import { processEmailQueueBatch } from "@/lib/emailQueue";
import { logMetric } from "@/lib/metrics";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const intervalMs = Number(process.env.EMAIL_WORKER_INTERVAL_MS ?? 2000);
  const limit = Number(process.env.EMAIL_WORKER_BATCH ?? 10);

  console.log("[email-worker] started", { intervalMs, limit });

  while (true) {
    try {
      const res = await processEmailQueueBatch({ limit });
      if (res.processed) {
        console.log("[email-worker] batch", res);
        logMetric("email_queue.processed", res.processed, { sent: res.sent, failed: res.failed });
      }
    } catch (e) {
      console.error("[email-worker] error", e);
    }

    await sleep(intervalMs);
  }
}

main().catch((e) => {
  console.error("[email-worker] fatal", e);
  process.exit(1);
});
