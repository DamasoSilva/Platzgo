# Operação (PlayHubFit)

Este documento é voltado para operação/produção e troubleshooting.

## Componentes operacionais

- **Web app**: Next.js App Router.
- **Banco**: PostgreSQL.
- **Uploads**: S3 compatível (AWS/R2/MinIO).
- **E-mails**: fila no banco (`OutboundEmail`) + envio via SMTP (Nodemailer).

## Checklist rápido (produção)

- `DATABASE_URL` apontando para Postgres de produção.
- `NEXTAUTH_URL` com a URL pública (ex.: `https://app.seudominio.com`).
- `NEXTAUTH_SECRET` forte e fixo.
- `EMAIL_QUEUE_SECRET` forte e fixo.
- `SMTP_*` configurado (se quiser envio real).
- `S3_*` configurado (se quiser uploads no painel).

## Fila de e-mails (OutboundEmail)

### Como funciona

- A aplicação **enfileira** e-mails em `OutboundEmail` em ações críticas (ex.: agendamento/mensalidade/convite).
- Um processador em batch (`processEmailQueueBatch`) pega itens `PENDING/FAILED` com `nextAttemptAt <= agora`, marca como `SENDING`, tenta enviar e atualiza para `SENT` ou `FAILED`.
- Há retry com backoff exponencial.

### Formas de processar

#### Opção A) Worker contínuo (recomendado)

Rode como processo separado:

```bash
npm run email:worker
```

Parâmetros:

- `EMAIL_WORKER_INTERVAL_MS` (default: `2000`)
- `EMAIL_WORKER_BATCH` (default: `10`)

#### Opção B) Cron chamando endpoint interno

Endpoint:

- Método: `POST`
- Rota: `/api/internal/email-queue/process?limit=10`
- Header obrigatório: `x-email-queue-secret: <EMAIL_QUEUE_SECRET>`

Exemplo (PowerShell):

```powershell
Invoke-RestMethod -Method Post \
  -Uri "http://localhost:3000/api/internal/email-queue/process?limit=10" \
  -Headers @{ "x-email-queue-secret" = "SEU_SECRET" }
```

Recomendação de frequência:

- a cada 30–60s costuma ser suficiente, dependendo do volume.

### SMTP não configurado

Se `SMTP_HOST`, `SMTP_PORT` e `SMTP_FROM` não estiverem definidos, o envio é ignorado e o item pode ser marcado como `SENT` com mensagem indicando "SMTP não configurado".

Isso facilita o desenvolvimento local sem bloquear o fluxo do usuário.

### Itens travados em SENDING

Se houver falha no meio do envio, um item pode ficar em `SENDING` por tempo demais.

- No painel `/dashboard/sistema` existe a ação **Reenfileirar travados**.
- A lógica considera travado quando está em `SENDING` há mais de ~15 minutos.

## Uploads (S3)

### Como o upload funciona

- O front chama `POST /api/uploads` com metadados do arquivo.
- A API retorna `uploadUrl` (pré-assinada) e `publicUrl`.
- O browser faz `PUT` direto no S3.

### Erros comuns

- **MinIO porta errada**: `S3_ENDPOINT` na porta `9001` (console) vai falhar. Use `http://127.0.0.1:9000`.
- **CORS do bucket**: precisa permitir `PUT` a partir do seu domínio (local: `http://localhost:3000`).

## Observabilidade (painel)

A página `/dashboard/sistema` ajuda a diagnosticar:

- SMTP configurado ou não
- Proteção do endpoint interno (`EMAIL_QUEUE_SECRET`)
- Contadores da fila (PENDING/SENDING/FAILED/SENT)
- Itens prontos para envio agora e idade do mais antigo
- Métricas do estabelecimento (agendamentos e mensalidades)

## Troubleshooting rápido

- Login/Session quebrando em produção: confira `NEXTAUTH_URL` e `NEXTAUTH_SECRET`.
- Erros de conexão no banco: confira `DATABASE_URL` e acesso/rede.
- Upload falhando: confira `S3_*`, CORS e se `S3_PUBLIC_BASE_URL` está correto.
- E-mail não chega: verifique `SMTP_*`, logs do worker e erros em `OutboundEmail.lastError`.
