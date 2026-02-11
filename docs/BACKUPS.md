# Backups do Postgres

Este documento descreve o fluxo de backup/restore do banco.

## Pré‑requisitos

- PostgreSQL instalado localmente (com `pg_dump` e `pg_restore` no PATH).
- `DATABASE_URL` definido no `.env`.

## Variáveis de ambiente

- `BACKUP_DIR`: diretório para salvar os arquivos `.dump` (padrão: `./backups`).
- `BACKUP_RETENTION_DAYS`: quantos dias manter (0 para não remover).
- `BACKUP_FILE`: caminho do arquivo para restore (se não passar argumento).
- `BACKUP_UPLOAD_S3`: `1` para enviar o backup para o bucket configurado.
- `BACKUP_S3_PREFIX`: prefixo/pasta no bucket (padrão: `backups`).

## Como gerar backup

```bash
npm run backup:db
```

O script cria um arquivo `.dump` (formato custom) com timestamp e remove backups antigos conforme `BACKUP_RETENTION_DAYS`.

Se `BACKUP_UPLOAD_S3=1`, o arquivo também é enviado para o bucket configurado em `S3_*`.

## Como restaurar

```bash
npm run restore:db
```

- Se `BACKUP_FILE` estiver definido, ele é usado.
- Se você passar um caminho, ele tem prioridade:

```bash
npm run restore:db -- "C:\backups\backup_20260203_120000.dump"
```

> O restore usa `--clean --if-exists` e pode **apagar dados** no banco de destino.

## Agendamento

### Linux (cron)

Exemplo diário às 02:00:

```
0 2 * * * cd /caminho/do/projeto && npm run backup:db >> /var/log/playhubfit-backup.log 2>&1
```

### Windows (Task Scheduler)

- Ação: `Program/script` = `npm`
- Arguments: `run backup:db`
- Start in: `C:\Users\damas\playhubfit`

## Dica de retenção

- Homologação: 7–14 dias.
- Produção: 30–90 dias (dependendo do volume).

## Teste de restore

Recomenda-se restaurar em um banco **separado** para validar:

1. Crie um banco de teste.
2. Defina `DATABASE_URL` apontando para ele.
3. Execute `npm run restore:db`.
