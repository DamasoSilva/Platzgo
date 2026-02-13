import Link from "next/link";
import { redirect } from "next/navigation";

import { requireRoleOrRedirect } from "@/lib/authz";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import {
  getSmtpSettingsForSysadmin,
  saveSmtpSettings,
  clearSmtpPassword,
  sendTestEmailToMe,
  changeMyPassword,
  getNotificationSettingsForSysadmin,
  saveNotificationSettingsForSysadmin,
  getPaymentSettingsForSysadmin,
  savePaymentSettingsForSysadmin,
  clearPaymentSecretsForSysadmin,
  testAsaasSplitWallet,
  listAsaasWallets,
} from "@/lib/actions/sysadminSettings";

export default async function SysadminSettingsPage(props: {
  searchParams?:
    | { ok?: string; err?: string; walletOk?: string; walletErr?: string; walletList?: string }
    | Promise<{ ok?: string; err?: string; walletOk?: string; walletErr?: string; walletList?: string }>;
}) {
  await requireRoleOrRedirect("SYSADMIN", "/sysadmin/settings");

  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const ok = searchParams?.ok === "1";
  const err = (searchParams?.err ?? "").trim();
  const walletOk = searchParams?.walletOk === "1";
  const walletErr = (searchParams?.walletErr ?? "").trim();
  const walletList = (searchParams?.walletList ?? "").trim();

  const [smtp, notifications, payments] = await Promise.all([
    getSmtpSettingsForSysadmin(),
    getNotificationSettingsForSysadmin(),
    getPaymentSettingsForSysadmin(),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Configurações do sistema</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Gerencie SMTP e credenciais administrativas.</p>
        </div>
        <Link className="ph-button-secondary" href="/sysadmin">
          Voltar
        </Link>
      </div>

      {ok ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Configuração salva.
        </div>
      ) : null}

      {err ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{err}</div> : null}

      {walletOk ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Wallet Asaas validado.
        </div>
      ) : null}

      {walletErr ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{walletErr}</div>
      ) : null}

      {walletList ? (
        <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800">
          Wallets encontradas: {walletList}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="ph-card p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">SMTP (e-mail)</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Salvo no banco (com fallback no .env).</p>

          <form
            className="mt-4 space-y-4"
            action={async (formData) => {
              "use server";
              try {
                await saveSmtpSettings({
                  host: String(formData.get("host") ?? ""),
                  port: String(formData.get("port") ?? ""),
                  from: String(formData.get("from") ?? ""),
                  user: String(formData.get("user") ?? ""),
                  pass: String(formData.get("pass") ?? ""),
                });
                redirect("/sysadmin/settings?ok=1");
              } catch (e) {
                if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
                const msg = e instanceof Error ? e.message : "Erro ao salvar";
                redirect(`/sysadmin/settings?err=${encodeURIComponent(msg)}`);
              }
            }}
          >
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Host</label>
              <input name="host" defaultValue={smtp.host} className="ph-input mt-2" placeholder="smtp.exemplo.com" />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Porta</label>
              <input name="port" defaultValue={smtp.port} className="ph-input mt-2" placeholder="587" inputMode="numeric" />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">From</label>
              <input name="from" defaultValue={smtp.from} className="ph-input mt-2" placeholder="PlatzGo! <no-reply@dominio.com>" />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Usuário</label>
              <input name="user" defaultValue={smtp.user} className="ph-input mt-2" placeholder="usuario@dominio.com" />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Senha</label>
              <input name="pass" type="password" className="ph-input mt-2" placeholder={smtp.hasPass ? "(já definida)" : ""} />
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Para salvar senha pelo painel, defina a env `SETTINGS_ENCRYPTION_KEY` (32 bytes em base64/hex).
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <FormSubmitButton label="Salvar SMTP" pendingLabel="Salvando..." className="ph-button" />

              <button
                formAction={async () => {
                  "use server";
                  try {
                    await clearSmtpPassword();
                    redirect("/sysadmin/settings?ok=1");
                  } catch (e) {
                    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
                    const msg = e instanceof Error ? e.message : "Erro ao limpar";
                    redirect(`/sysadmin/settings?err=${encodeURIComponent(msg)}`);
                  }
                }}
                className="ph-button-secondary"
                type="submit"
              >
                Limpar senha
              </button>

              <button
                formAction={async () => {
                  "use server";
                  try {
                    await sendTestEmailToMe();
                    redirect("/sysadmin/settings?ok=1");
                  } catch (e) {
                    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
                    const msg = e instanceof Error ? e.message : "Erro ao enviar teste";
                    redirect(`/sysadmin/settings?err=${encodeURIComponent(msg)}`);
                  }
                }}
                className="ph-button-secondary"
                type="submit"
              >
                Enviar email de teste
              </button>
            </div>
          </form>
        </div>

        <div className="ph-card p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Pagamentos (gateways)</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Configuração salva no banco. Mantém desativado até habilitar.
          </p>

          <form
            className="mt-4 space-y-4"
            action={async (formData) => {
              "use server";
              try {
                const providers = (formData.getAll("paymentProviders") ?? []).map((v) => String(v)).join(",");
                await savePaymentSettingsForSysadmin({
                  enabled: String(formData.get("paymentsEnabled") ?? "0"),
                  provider: String(formData.get("paymentProvider") ?? "none"),
                  providers,
                  returnUrl: String(formData.get("paymentReturnUrl") ?? ""),
                  mpAccessToken: String(formData.get("mpAccessToken") ?? ""),
                  mpWebhook: String(formData.get("mpWebhook") ?? ""),
                  asaasApiKey: String(formData.get("asaasApiKey") ?? ""),
                  asaasWebhook: String(formData.get("asaasWebhook") ?? ""),
                  asaasBaseUrl: String(formData.get("asaasBaseUrl") ?? ""),
                  asaasSplitWalletId: String(formData.get("asaasSplitWalletId") ?? ""),
                  asaasSplitPercent: String(formData.get("asaasSplitPercent") ?? ""),
                  asaasTestCpfCnpj: String(formData.get("asaasTestCpfCnpj") ?? ""),
                });
                redirect("/sysadmin/settings?ok=1");
              } catch (e) {
                if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
                const msg = e instanceof Error ? e.message : "Erro ao salvar";
                redirect(`/sysadmin/settings?err=${encodeURIComponent(msg)}`);
              }
            }}
          >
            <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2">
                  <input
                    name="paymentsEnabled"
                    type="checkbox"
                    defaultChecked={String(payments.enabled) === "1"}
                    value="1"
                  />
                  <span>Ativar pagamentos</span>
                </label>
                <span className="text-xs text-zinc-500">Provider padrão: {payments.provider}</span>
              </div>

              <div className="mt-3">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Providers ativos</label>
                <div className="mt-2 flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="paymentProviders"
                      value="mercadopago"
                      defaultChecked={payments.providers?.includes("mercadopago")}
                    />
                    MercadoPago
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="paymentProviders"
                      value="asaas"
                      defaultChecked={payments.providers?.includes("asaas")}
                    />
                    Asaas
                  </label>
                </div>
                <p className="mt-2 text-xs text-zinc-500">Marque os providers que estarao disponiveis no checkout.</p>
              </div>

              <div className="mt-3">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Provider</label>
                <select name="paymentProvider" defaultValue={payments.provider} className="ph-input mt-2">
                  <option value="none">Desativado</option>
                  <option value="mercadopago">MercadoPago</option>
                  <option value="asaas">Asaas</option>
                </select>
              </div>

              <div className="mt-3">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">URL de retorno</label>
                <input
                  name="paymentReturnUrl"
                  defaultValue={payments.returnUrl}
                  className="ph-input mt-2"
                  placeholder="https://seu-dominio.com/pagamento/retorno"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">MercadoPago</p>
              <div className="mt-3 grid gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Access token</label>
                  <input
                    name="mpAccessToken"
                    type="password"
                    className="ph-input mt-2"
                    placeholder={payments.hasMpAccessToken ? "(já definido)" : ""}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Webhook secret</label>
                  <input
                    name="mpWebhook"
                    type="password"
                    className="ph-input mt-2"
                    placeholder={payments.hasMpWebhook ? "(já definido)" : ""}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">Asaas</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Wallet ID (split)</label>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      name="asaasSplitWalletId"
                      className="ph-input flex-1"
                      defaultValue={payments.asaasSplitWalletId}
                      placeholder="walletId do app"
                    />
                    <button
                      formAction={async () => {
                        "use server";
                        try {
                          const res = await listAsaasWallets();
                          const preview = res.wallets.slice(0, 5).join(", ");
                          const label = res.wallets.length
                            ? `${res.wallets.length} encontrados: ${preview}${res.wallets.length > 5 ? " ..." : ""}`
                            : "nenhum wallet encontrado";
                          redirect(`/sysadmin/settings?walletList=${encodeURIComponent(label)}`);
                        } catch (e) {
                          if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
                          const msg = e instanceof Error ? e.message : "Erro ao listar";
                          redirect(`/sysadmin/settings?walletErr=${encodeURIComponent(msg)}`);
                        }
                      }}
                      className="ph-button-secondary"
                      type="submit"
                    >
                      Listar wallets
                    </button>
                    <button
                      formAction={async () => {
                        "use server";
                        try {
                          await testAsaasSplitWallet();
                          redirect("/sysadmin/settings?walletOk=1");
                        } catch (e) {
                          if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
                          const msg = e instanceof Error ? e.message : "Erro ao testar";
                          redirect(`/sysadmin/settings?walletErr=${encodeURIComponent(msg)}`);
                        }
                      }}
                      className="ph-button-secondary"
                      type="submit"
                    >
                      Testar wallet
                    </button>
                    {walletOk ? <span className="text-xs font-semibold text-emerald-600">OK</span> : null}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">CPF/CNPJ de teste</label>
                  <input
                    name="asaasTestCpfCnpj"
                    className="ph-input mt-2"
                    defaultValue={payments.asaasTestCpfCnpj}
                    placeholder="Somente numeros"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">API key</label>
                  <input
                    name="asaasApiKey"
                    type="password"
                    className="ph-input mt-2"
                    placeholder={payments.hasAsaasApiKey ? "(já definida)" : ""}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Webhook token</label>
                  <input
                    name="asaasWebhook"
                    type="password"
                    className="ph-input mt-2"
                    placeholder={payments.hasAsaasWebhook ? "(já definido)" : ""}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Base URL</label>
                  <input
                    name="asaasBaseUrl"
                    className="ph-input mt-2"
                    defaultValue={payments.asaasBaseUrl}
                    placeholder="https://sandbox.asaas.com/api/v3"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Comissao % do app</label>
                  <input
                    name="asaasSplitPercent"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    className="ph-input mt-2"
                    defaultValue={payments.asaasSplitPercent}
                    placeholder="Ex.: 10"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                O repasse usa o Wallet ID do estabelecimento (configurado no painel do dono).
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <FormSubmitButton label="Salvar pagamentos" pendingLabel="Salvando..." className="ph-button" />
              <button
                formAction={async () => {
                  "use server";
                  try {
                    await clearPaymentSecretsForSysadmin();
                    redirect("/sysadmin/settings?ok=1");
                  } catch (e) {
                    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
                    const msg = e instanceof Error ? e.message : "Erro ao limpar";
                    redirect(`/sysadmin/settings?err=${encodeURIComponent(msg)}`);
                  }
                }}
                className="ph-button-secondary"
                type="submit"
              >
                Limpar segredos
              </button>
              <p className="text-xs text-zinc-500">
                Para salvar segredos pelo painel, defina `SETTINGS_ENCRYPTION_KEY`.
              </p>
            </div>
          </form>
        </div>

        <div className="ph-card p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Notificações</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Controle canais e regras de envio. Lembretes por e-mail usam o worker de notificações.
          </p>

          <form
            className="mt-4 space-y-4"
            action={async (formData) => {
              "use server";
              try {
                const toBool = (key: string) => String(formData.get(key) ?? "").toLowerCase() === "on";
                const toNumber = (key: string) => Number(String(formData.get(key) ?? "").trim());

                await saveNotificationSettingsForSysadmin({
                  emailEnabled: toBool("emailEnabled"),
                  emailBookingConfirmationEnabled: toBool("emailBookingConfirmationEnabled"),
                  emailBookingCancellationEnabled: toBool("emailBookingCancellationEnabled"),
                  emailBookingReminderEnabled: toBool("emailBookingReminderEnabled"),
                  emailReminderHoursBefore: toNumber("emailReminderHoursBefore"),
                  whatsappEnabled: toBool("whatsappEnabled"),
                  whatsappQuietHoursStart: toNumber("whatsappQuietHoursStart"),
                  whatsappQuietHoursEnd: toNumber("whatsappQuietHoursEnd"),
                  smsEnabled: toBool("smsEnabled"),
                  smsQuietHoursStart: toNumber("smsQuietHoursStart"),
                  smsQuietHoursEnd: toNumber("smsQuietHoursEnd"),
                });

                redirect("/sysadmin/settings?ok=1");
              } catch (e) {
                if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
                const msg = e instanceof Error ? e.message : "Erro ao salvar";
                redirect(`/sysadmin/settings?err=${encodeURIComponent(msg)}`);
              }
            }}
          >
            <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">E-mail</p>
              <div className="mt-3 grid gap-3">
                <label className="flex items-center gap-2">
                  <input name="emailEnabled" type="checkbox" defaultChecked={notifications.emailEnabled} />
                  <span>Ativar e-mails</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    name="emailBookingConfirmationEnabled"
                    type="checkbox"
                    defaultChecked={notifications.emailBookingConfirmationEnabled}
                  />
                  <span>Confirmações de agendamento</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    name="emailBookingCancellationEnabled"
                    type="checkbox"
                    defaultChecked={notifications.emailBookingCancellationEnabled}
                  />
                  <span>Cancelamentos de agendamento</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    name="emailBookingReminderEnabled"
                    type="checkbox"
                    defaultChecked={notifications.emailBookingReminderEnabled}
                  />
                  <span>Lembretes de agendamento</span>
                </label>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Enviar lembrete (horas antes)
                  </label>
                  <input
                    name="emailReminderHoursBefore"
                    defaultValue={notifications.emailReminderHoursBefore}
                    className="ph-input mt-2"
                    type="number"
                    min={1}
                    max={168}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">WhatsApp</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Integração pendente. As regras ficam salvas.</p>
              <div className="mt-3 grid gap-3">
                <label className="flex items-center gap-2">
                  <input name="whatsappEnabled" type="checkbox" defaultChecked={notifications.whatsappEnabled} />
                  <span>Ativar WhatsApp</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Início (hora)</label>
                    <input
                      name="whatsappQuietHoursStart"
                      defaultValue={notifications.whatsappQuietHoursStart}
                      className="ph-input mt-2"
                      type="number"
                      min={0}
                      max={23}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fim (hora)</label>
                    <input
                      name="whatsappQuietHoursEnd"
                      defaultValue={notifications.whatsappQuietHoursEnd}
                      className="ph-input mt-2"
                      type="number"
                      min={0}
                      max={23}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              <p className="font-semibold text-zinc-900 dark:text-zinc-50">SMS</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Integração pendente. As regras ficam salvas.</p>
              <div className="mt-3 grid gap-3">
                <label className="flex items-center gap-2">
                  <input name="smsEnabled" type="checkbox" defaultChecked={notifications.smsEnabled} />
                  <span>Ativar SMS</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Início (hora)</label>
                    <input
                      name="smsQuietHoursStart"
                      defaultValue={notifications.smsQuietHoursStart}
                      className="ph-input mt-2"
                      type="number"
                      min={0}
                      max={23}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fim (hora)</label>
                    <input
                      name="smsQuietHoursEnd"
                      defaultValue={notifications.smsQuietHoursEnd}
                      className="ph-input mt-2"
                      type="number"
                      min={0}
                      max={23}
                    />
                  </div>
                </div>
              </div>
            </div>

            <FormSubmitButton label="Salvar notificações" pendingLabel="Salvando..." className="ph-button" />
          </form>
        </div>

        <div className="ph-card p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Senha do administrador</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Troque a senha do seu usuário SYSADMIN.</p>

          <form
            className="mt-4 space-y-4"
            action={async (formData) => {
              "use server";
              try {
                await changeMyPassword({
                  currentPassword: String(formData.get("current") ?? ""),
                  newPassword: String(formData.get("next") ?? ""),
                });
                redirect("/sysadmin/settings?ok=1");
              } catch (e) {
                if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
                const msg = e instanceof Error ? e.message : "Erro ao trocar senha";
                redirect(`/sysadmin/settings?err=${encodeURIComponent(msg)}`);
              }
            }}
          >
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Senha atual</label>
              <input name="current" type="password" className="ph-input mt-2" required />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nova senha</label>
              <input name="next" type="password" className="ph-input mt-2" required minLength={8} />
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Mínimo de 8 caracteres.</p>
            </div>

            <FormSubmitButton label="Salvar nova senha" pendingLabel="Salvando..." className="ph-button" />

            <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Dica: você também pode usar o fluxo de Esqueci minha senha no login.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
