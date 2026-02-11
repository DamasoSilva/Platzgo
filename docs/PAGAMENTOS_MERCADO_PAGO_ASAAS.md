# Pagamentos online: Mercado Pago e Asaas

Este guia descreve como conectar Mercado Pago e Asaas no sistema, com regras mínimas para operação segura e consistente.

> Objetivo: usar **ambos** os gateways, com seleção por método/cliente ou fallback.

---

## 1) Regras comuns (valem para os dois)

1. **Ambiente**
   - Use **sandbox** para testes e **produção** apenas após validação.
   - Separe chaves por ambiente (dev/staging/prod).

2. **Webhook obrigatório**
   - Confirmação de pagamento deve ser feita **via webhook**.
   - Não finalize pedido apenas pelo retorno do frontend.

3. **Idempotência**
   - Cada criação/atualização deve usar um `idempotency_key` (ex.: `bookingId` + `attempt`).

4. **Mapeamento de status** (padrão sugerido)
   - `PENDING` → pagamento criado, aguardando.
   - `PAID` → confirmado via webhook.
   - `CANCELLED` → expirado/cancelado.
   - `REFUNDED` → estornado.

5. **Auditoria**
   - Grave logs de requisição/resposta (sem dados sensíveis).
   - Persistir `payment_provider`, `payment_id`, `status`, `amount_cents`, `currency`.

6. **Segurança**
   - Validar assinatura dos webhooks.
   - Não armazenar dados de cartão no servidor.

---

## 2) Mercado Pago

### 2.1 Credenciais
- **Access Token** (server-side)
- **Public Key** (frontend, quando aplicável)

**Configuração sugerida (.env):**
```
MERCADOPAGO_ACCESS_TOKEN=...
MERCADOPAGO_PUBLIC_KEY=...
MERCADOPAGO_WEBHOOK_SECRET=...
```

### 2.2 Integração (passos)
1. Criar aplicação no painel do Mercado Pago.
2. Ativar credenciais de **sandbox** e **produção**.
3. Configurar webhook apontando para:
   - `POST /api/webhooks/mercadopago`
4. Criar preferência/pagamento no backend.
5. Receber confirmação no webhook e atualizar o status.

### 2.3 Regras de negócio sugeridas
- **Expiração**: definir expiração da cobrança (ex.: 30 min).
- **Re-tentativas**: permitir até 2 re-tentativas por pedido.
- **Antifraude**: validar nome/email do pagante.

### 2.4 Assinatura de webhook
- Verificar assinatura via header oficial do Mercado Pago.
- Rejeitar payloads sem assinatura válida.

---

## 3) Asaas

### 3.1 Credenciais
- **API Key** (server-side)
- **Webhook token** (validação)

**Configuração sugerida (.env):**
```
ASAAS_API_KEY=...
ASAAS_WEBHOOK_TOKEN=...
ASAAS_BASE_URL=https://sandbox.asaas.com/api/v3
```

### 3.2 Integração (passos)
1. Criar conta e obter API Key (sandbox e produção).
2. Configurar webhook apontando para:
   - `POST /api/webhooks/asaas`
3. Criar cobrança no backend (boleto/cartão/pix).
4. Receber atualização no webhook e confirmar pagamento.

### 3.3 Regras de negócio sugeridas
- **Validade da cobrança**: definir `dueDate` e expiração.
- **Notificações**: habilitar notificações de vencimento.
- **Re-tentativas**: para cartão, permitir reprocesso controlado.

### 3.4 Assinatura de webhook
- Validar token do Asaas informado no header.
- Rejeitar eventos não autenticados.

---

## 4) Seleção de gateway

Recomendação de regra simples:
- **PIX**: Mercado Pago
- **Boleto**: Asaas
- **Cartão**: selecionar pelo menor custo ou taxa de aprovação

Caso um gateway falhe, fazer fallback automático (registrando o motivo).

---

## 5) Checklist rápido

- [ ] Chaves de sandbox configuradas
- [ ] Webhooks ativos e assinaturas validadas
- [ ] Status mapeados corretamente
- [ ] Logs e auditoria de pagamento
- [ ] Expiração e re-tentativas configuradas

---

## 6) Próximos passos no projeto

1. Criar endpoints:
   - `POST /api/payments/mercadopago`
   - `POST /api/payments/asaas`
   - `POST /api/webhooks/mercadopago`
   - `POST /api/webhooks/asaas`
2. Persistir tabela de pagamentos com `provider`, `provider_payment_id`, `status`.
3. Atualizar o fluxo de criação de agendamentos para esperar confirmação.

Se quiser, posso implementar os endpoints e os modelos de dados no projeto.
