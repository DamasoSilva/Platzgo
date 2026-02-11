# Checklist de Deploy (Produção)

## 1) Banco de dados e migrations
- [ ] Definir `DATABASE_URL` (PostgreSQL produção).
- [ ] Executar `npx prisma migrate deploy`.
- [ ] Executar `npx prisma generate`.

## 2) Variáveis obrigatórias
- [ ] `NEXTAUTH_URL`
- [ ] `NEXTAUTH_SECRET`
- [ ] `DATABASE_URL`

## 3) Email
- [ ] `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- [ ] `EMAIL_QUEUE_SECRET`
- [ ] Ativar worker de email: `npm run email:worker`

## 4) Workers
- [ ] Lembretes: `npm run reminder:worker`
- [ ] Alertas de disponibilidade: `npm run availability:worker`
- [ ] Manutenção: `npm run maintenance:cleanup` (cron diário)

## 5) Logs de acesso
- [ ] `ACCESS_LOG_SECRET`
- [ ] Verificar painel em `/dashboard/sistema`

## 6) Storage S3/MinIO
- [ ] `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- [ ] `S3_ENDPOINT` (se não for AWS)
- [ ] `S3_PUBLIC_BASE_URL`
- [ ] CORS do bucket permitindo `PUT` do domínio

## 7) Redis (rate limit persistente)
- [ ] `REDIS_URL` (ex.: `redis://user:pass@host:6379/0`)

## 8) Pagamentos (se habilitar)
- [ ] `PAYMENTS_ENABLED=1`
- [ ] `PAYMENT_PROVIDER=stripe|mercadopago`
- [ ] `PAYMENT_RETURN_URL`
- [ ] Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- [ ] MercadoPago: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`
- [ ] Endpoints ativos:
  - [ ] `/api/payments/checkout`
  - [ ] `/api/payments/stripe/webhook`
  - [ ] `/api/payments/mercadopago/webhook`

## 9) Observabilidade
- [ ] `LOG_LEVEL` ajustado
- [ ] Logs do provedor (ex.: Vercel/Render) habilitados

## 10) Checklist final
- [ ] `npm run build`
- [ ] `npm run start`
- [ ] Verificar `/api/health`
- [ ] Verificar login e fluxo de agendamento
