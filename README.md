# PlayHubFit

Sistema web para gestão de quadras e agendamentos (portal do cliente + painel do dono), com notificações e envio de e-mails transacionais de forma assíncrona.

## Stack

- Next.js (App Router) + React + TypeScript
- Tailwind
- PostgreSQL + Prisma
- NextAuth (Credentials)
- Uploads via S3 (AWS S3 / Cloudflare R2 / MinIO / etc)
- E-mails via Nodemailer (SMTP) com fila no banco (`OutboundEmail`)

## Requisitos

- Node.js (recomendado LTS)
- PostgreSQL (local ou cloud)
- (Opcional) MinIO local para uploads (há um `docker-compose.minio.yml`)

## Setup local (passo a passo)

### 1) Instalar dependências

```bash
npm install
```

### 2) Variáveis de ambiente

Copie o arquivo de exemplo e ajuste:

```bash
copy .env.example .env
```

Valores obrigatórios para rodar o app:

- `DATABASE_URL` (Postgres)
- `NEXTAUTH_URL` (ex.: `http://localhost:3000`)
- `NEXTAUTH_SECRET` (string aleatória e longa)

Valores opcionais (mas recomendados dependendo do que você quer testar):

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (habilita mapa/autocomplete)
- `S3_*` (uploads de fotos/vídeos)
- `SMTP_*` (envio real de e-mails)
- `EMAIL_QUEUE_SECRET` (protege o endpoint interno de processamento da fila)

### 3) Criar/atualizar o schema no banco

```bash
npx prisma migrate dev
```

Se você precisar apenas gerar o client após mudanças:

```bash
npx prisma generate
```

### 4) Seed (dados de exemplo)

```bash
npm run seed
```

Por padrão, cria/atualiza apenas usuários (o sistema inicia zerado, sem estabelecimentos/quadras/motivos):

- Sysadmin: `sysadmin@playhub.local` / `sysadmin123` (ajustável via `SEED_SYSADMIN_EMAIL`/`SEED_SYSADMIN_PASSWORD`)
- Admin: `admin@playhub.local` / `admin123` (ajustável via `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`)
- Customer: `customer@playhub.local` / `customer123` (ajustável via `SEED_CUSTOMER_EMAIL`/`SEED_CUSTOMER_PASSWORD`)

Para popular dados de exemplo (estabelecimento, quadras e motivos), rode com:

```bash
SEED_DEMO_DATA=1 npm run seed
```

### 5) Rodar o servidor

```bash
npm run dev
```

Abra `http://localhost:3000`.

## Scripts disponíveis

- `npm run dev`: servidor de desenvolvimento
- `npm run build`: build de produção
- `npm run start`: servidor de produção
- `npm run lint`: lint
- `npm run seed`: cria usuários (e opcionalmente dados de exemplo com `SEED_DEMO_DATA=1`)
- `npm run backup:db`: gera backup do Postgres
- `npm run restore:db`: restaura backup do Postgres
- `npm run email:worker`: processa a fila de e-mails em loop
- `npm run availability:worker`: processa alertas de disponibilidade
- `npm run reminder:worker`: envia lembretes de agendamentos
- `npm run maintenance:cleanup`: limpeza de tokens/logs antigos

## Papéis (Roles)

O sistema tem três roles:

- `CUSTOMER`: cliente final
- `ADMIN`: dono/gestor do estabelecimento
- `SYSADMIN`: manutenção do sistema (ex.: motivos padrão de inativação)

Observações:

- O cadastro em `/signup` cria usuário `CUSTOMER`.
- O painel do dono exige que o `ADMIN` tenha um estabelecimento e pelo menos uma quadra (o sistema redireciona para o fluxo de setup caso falte).

## Rotas principais

- `/` busca/exploração de quadras
- `/search` resultados da busca
- `/courts/[id]` detalhes da quadra + horários
- `/signin` login
- `/signup` cadastro
- `/meus-agendamentos` lista do cliente
- `/meus-agendamentos/[id]` detalhe do agendamento (com cancelamento/reagendamento)

Painel do dono:

- `/dashboard` (visão geral + notificações)
- `/dashboard/agenda` (agenda/semana)
- `/dashboard/financeiro` (financeiro)
- `/dashboard/config` (configurações)
- `/dashboard/quadras` (CRUD quadras)
- `/dashboard/sistema` (saúde e indicadores do sistema)

Sysadmin:

- `/sysadmin/reasons` (motivos de inativação de quadra)

## Uploads (S3 / MinIO)

O app gera URLs pré-assinadas em `POST /api/uploads` para o browser fazer `PUT` direto no storage.

Variáveis usadas:

- `S3_REGION`
- `S3_ENDPOINT` (opcional; para MinIO/compatíveis)
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_PUBLIC_BASE_URL` (base pública para montar a URL final que vai para o banco)

Dica importante (MinIO):

- `S3_ENDPOINT` precisa apontar para a API S3 (porta `9000`). A porta `9001` é apenas o console.

Você também precisa configurar CORS no bucket para permitir `PUT` do `http://localhost:3000`.

## E-mails (assíncrono, via fila no banco)

O envio de e-mails é feito por fila (`OutboundEmail`) para não travar o usuário no fluxo de agendamento.

### SMTP

Quando `SMTP_HOST`, `SMTP_PORT` e `SMTP_FROM` estão configurados, o sistema envia via Nodemailer.

Quando NÃO estão configurados, o envio é “skipped” (não envia), mas o item é marcado como `SENT` com erro informativo (útil para ambiente local).

Variáveis:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_FROM`
- `SMTP_USER` (opcional)
- `SMTP_PASS` (opcional)

### Processamento da fila

Você tem duas formas:

1) Rodar o worker local:

```bash
npm run email:worker
```

2) Chamar o endpoint interno (para cron/monitor):

- URL: `POST /api/internal/email-queue/process?limit=10`
- Header obrigatório: `x-email-queue-secret: <EMAIL_QUEUE_SECRET>`

> Recomenda-se manter `EMAIL_QUEUE_SECRET` sempre definido em produção.

### Monitoramento

No painel do admin, a página `/dashboard/sistema` mostra contadores e permite:

- Processar fila agora
- Reenfileirar itens travados em `SENDING`
- Reenviar itens que não foram `SENT`

## Operação / produção

Documentação operacional detalhada (fila, troubleshooting, checklist): veja `docs/OPERACAO.md`.

Checklist completo de deploy: veja `docs/DEPLOY_CHECKLIST.md`.

## Backups

Guia completo em [docs/BACKUPS.md](docs/BACKUPS.md).
