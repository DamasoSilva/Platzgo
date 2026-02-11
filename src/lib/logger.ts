type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return "info";
}

function shouldLog(level: LogLevel) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[getLevel()];
}

function formatMeta(meta?: Record<string, unknown>) {
  if (!meta) return "";
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return "";
  }
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
  if (!shouldLog("info")) return;
  console.info(`[info] ${message}${formatMeta(meta)}`);
}

export function logWarn(message: string, meta?: Record<string, unknown>) {
  if (!shouldLog("warn")) return;
  console.warn(`[warn] ${message}${formatMeta(meta)}`);
}

export function logError(message: string, meta?: Record<string, unknown>) {
  if (!shouldLog("error")) return;
  console.error(`[error] ${message}${formatMeta(meta)}`);
}

export function logDebug(message: string, meta?: Record<string, unknown>) {
  if (!shouldLog("debug")) return;
  console.debug(`[debug] ${message}${formatMeta(meta)}`);
}
