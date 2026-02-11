import { getSystemSecret, getSystemSetting } from "@/lib/systemSettings";

type PaymentProvider = "mercadopago" | "asaas" | "none";

type PaymentConfig = {
  enabled: boolean;
  provider: PaymentProvider;
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
  returnUrl: "payments.return_url",
  mpAccessToken: "payments.mercadopago.access_token",
  mpWebhook: "payments.mercadopago.webhook",
  asaasApiKey: "payments.asaas.api_key",
  asaasWebhook: "payments.asaas.webhook",
  asaasBaseUrl: "payments.asaas.base_url",
  asaasSplitWalletId: "payments.asaas.split_wallet_id",
  asaasSplitPercent: "payments.asaas.split_percent",
} as const;

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const [
    enabledDb,
    providerDb,
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

  const returnUrl = (returnUrlDb ?? process.env.PAYMENT_RETURN_URL ?? "").trim() || undefined;

  return {
    enabled,
    provider,
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
  if (!config.enabled || config.provider === "none") {
    throw new Error("PAYMENTS_DISABLED");
  }
  return config;
}
