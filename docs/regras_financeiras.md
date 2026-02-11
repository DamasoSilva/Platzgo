# Regras financeiras (pagamentos online)

Este documento define o comportamento financeiro do sistema para agendamentos pagos.

## 1) Estados do pagamento
- `PENDING`: cobrança criada e aguardando pagamento.
- `AUTHORIZED`: pagamento recebido, aguardando confirmação do dono (quando exigido).
- `PAID`: pagamento concluído (agendamento confirmado).
- `CANCELLED`: pagamento expirado/cancelado pelo gateway.
- `REFUNDED`: estorno realizado (ou marcado como estornado).
- `FAILED`: falha na criação/atualização da cobrança.

## 2) Confirmação de horário
- Se o estabelecimento **exige confirmação**, o pagamento fica em `AUTHORIZED` até o dono confirmar.
- Se **não exige confirmação**, ao receber o pagamento o agendamento é confirmado e o pagamento passa a `PAID`.

## 3) Bloqueio de horário
- Um agendamento `PENDING` bloqueia o horário, evitando dupla reserva.
- Agendamentos com pagamento `PENDING` bloqueiam o horário até expiração/cancelamento.

## 4) Expiração de cobrança
- Cobranças são criadas com expiração padrão (ex.: 15 minutos).
- Ao expirar/cancelar no gateway, o sistema cancela o agendamento.

## 5) Cancelamento e estorno
- Cancelamento pelo dono ou pelo cliente:
  - Se houver pagamento `AUTHORIZED` ou `PAID`, o pagamento é marcado como `REFUNDED`.
  - A multa (quando aplicável) pode ser descontada no estorno conforme política do estabelecimento.

## 6) Política de multa
- Se o cancelamento ocorrer após o prazo mínimo do estabelecimento, aplica-se multa:
  - Percentual (`cancel_fee_percent`) **ou** valor fixo (`cancel_fee_fixed_cents`).
- A multa deve ser abatida no estorno quando houver pagamento.

## 7) Split de pagamento (Asaas)
- Se configurado `walletId` e `splitPercent`, o split é aplicado automaticamente na cobrança.

## 8) Auditoria
- Todos os pagamentos geram registros (`Payment` e `PaymentEvent`).
- Webhooks são a fonte oficial para mudança de status.

## 9) Regras de segurança
- Não armazenar dados de cartão no sistema.
- Validar assinatura dos webhooks antes de aplicar mudanças.

## 10) Observações
- Em ambientes de teste, use sandbox.
- Em produção, confirme URLs e chaves corretas para evitar divergências.
