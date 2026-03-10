import { getSystemSecret, getSystemSetting } from "@/lib/systemSettings";

type PaymentProvider = "mercadopago" | "asaas" | "none";
type EnabledPaymentProvider = "mercadopago" | "asaas";

type PaymentConfig = {
  enabled: boolean;
  provider: PaymentProvider;
  providersEnabled: EnabledPaymentProvider[];
  mercadopago: {
    accessToken?: string;
    webhookSecret?: string;
  };
  asaas: {
    apiKey?: string;
    webhookToken?: string;
    baseUrl?: string;
    splitWalletId?: string;
    splitPercent?: number;
  };
  returnUrl?: string;
};

export const PAYMENT_SETTING_KEYS = {
  enabled: "payments.enabled",
  provider: "payments.provider",
  providers: "payments.providers",
  returnUrl: "payments.return_url",
  mpAccessToken: "payments.mercadopago.access_token",
  mpWebhook: "payments.mercadopago.webhook",
  asaasApiKey: "payments.asaas.api_key",
  asaasWebhook: "payments.asaas.webhook",
  asaasBaseUrl: "payments.asaas.base_url",
  asaasSplitWalletId: "payments.asaas.split_wallet_id",
  asaasSplitPercent: "payments.asaas.split_percent",
  asaasTestCpfCnpj: "payments.asaas.test_cpf_cnpj",
} as const;

function normalizeProviders(raw: string | null | undefined): EnabledPaymentProvider[] {
  if (!raw) return [];
  const cleaned = raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  const out: EnabledPaymentProvider[] = [];
  for (const item of cleaned) {
    if (item === "mercadopago" || item === "asaas") {
      if (!out.includes(item)) out.push(item);
    }
  }

  return out;
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const [
    enabledDb,
    providerDb,
    providersDb,
    returnUrlDb,
    mpAccessTokenDb,
    mpWebhookDb,
    asaasApiKeyDb,
    asaasWebhookDb,
    asaasBaseUrlDb,
    asaasSplitWalletIdDb,
    asaasSplitPercentDb,
  ] = await Promise.all([
    getSystemSetting(PAYMENT_SETTING_KEYS.enabled),
    getSystemSetting(PAYMENT_SETTING_KEYS.provider),
    getSystemSetting(PAYMENT_SETTING_KEYS.providers),
    getSystemSetting(PAYMENT_SETTING_KEYS.returnUrl),
    getSystemSecret(PAYMENT_SETTING_KEYS.mpAccessToken),
    getSystemSecret(PAYMENT_SETTING_KEYS.mpWebhook),
    getSystemSecret(PAYMENT_SETTING_KEYS.asaasApiKey),
    getSystemSecret(PAYMENT_SETTING_KEYS.asaasWebhook),
    getSystemSetting(PAYMENT_SETTING_KEYS.asaasBaseUrl),
    getSystemSetting(PAYMENT_SETTING_KEYS.asaasSplitWalletId),
    getSystemSetting(PAYMENT_SETTING_KEYS.asaasSplitPercent),
  ]);

  const enabledRaw = (enabledDb ?? process.env.PAYMENTS_ENABLED ?? "0").trim();
  const enabled = enabledRaw === "1" || enabledRaw.toLowerCase() === "true";
  const providerRaw = (providerDb ?? process.env.PAYMENT_PROVIDER ?? "none").trim().toLowerCase();
  const provider: PaymentProvider =
    providerRaw === "mercadopago" || providerRaw === "asaas" ? providerRaw : "none";

  const providersRaw = (providersDb ?? process.env.PAYMENT_PROVIDERS ?? "").trim();
  const providersEnabled = normalizeProviders(providersRaw);

  if (providersEnabled.length === 0 && provider !== "none") {
    providersEnabled.push(provider);
  }

  const returnUrl = (returnUrlDb ?? process.env.PAYMENT_RETURN_URL ?? "").trim() || undefined;

  return {
    enabled,
    provider,
    providersEnabled,
    mercadopago: {
      accessToken: mpAccessTokenDb ?? process.env.MERCADOPAGO_ACCESS_TOKEN,
      webhookSecret: mpWebhookDb ?? process.env.MERCADOPAGO_WEBHOOK_SECRET,
    },
    asaas: {
      apiKey: asaasApiKeyDb ?? process.env.ASAAS_API_KEY,
      webhookToken: asaasWebhookDb ?? process.env.ASAAS_WEBHOOK_TOKEN,
      baseUrl:
        (asaasBaseUrlDb ?? process.env.ASAAS_BASE_URL ?? "https://sandbox.asaas.com/api/v3").trim() ||
        undefined,
      splitWalletId: (asaasSplitWalletIdDb ?? process.env.ASAAS_SPLIT_WALLET_ID ?? "").trim() || undefined,
      splitPercent:
        typeof asaasSplitPercentDb === "string" && asaasSplitPercentDb.trim()
          ? Number(asaasSplitPercentDb)
          : undefined,
    },
    returnUrl,
  };
}

export async function assertPaymentsEnabled() {
  const config = await getPaymentConfig();
  if (!config.enabled || config.providersEnabled.length === 0) {
    throw new Error("PAYMENTS_DISABLED");
  }
  return config;
}

export function extractAsaasErrorMessage(data: unknown): string | null {
  if (typeof data === "string") {
    const text = data.trim();
    return text ? text : null;
  }

  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  const errors = Array.isArray(record.errors) ? record.errors : [];
  if (errors.length) {
    const descriptions = errors
      .map((err) => {
        if (!err || typeof err !== "object") return null;
        const desc = (err as Record<string, unknown>).description;
        return typeof desc === "string" ? desc.trim() : null;
      })
      .filter((desc): desc is string => Boolean(desc));
    if (descriptions.length) return descriptions.join("; ");
  }

  const direct = [record.message, record.error, record.details, record.detail].find(
    (value) => typeof value === "string" && value.trim().length > 0
  ) as string | undefined;

  return direct ?? null;
}
