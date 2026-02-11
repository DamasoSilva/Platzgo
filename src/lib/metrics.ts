import { logInfo } from "@/lib/logger";

type MetricValue = number;

type MetricTags = Record<string, string | number | boolean | null | undefined>;

export function logMetric(name: string, value: MetricValue, tags?: MetricTags) {
  logInfo("metric", {
    name,
    value,
    tags,
    ts: new Date().toISOString(),
  });
}
