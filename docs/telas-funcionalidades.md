# Telas e funcionalidades

Este documento lista as telas (rotas) e descreve as principais funcionalidades, indicando onde estao no codigo.

## Estrutura de pastas (resumo)

```text
/
  .env
  .env.example
  .git/
  .github/
  .next/
  docs/
  prisma/
  public/
  scripts/
  src/
    app/
    components/
    generated/
    lib/
    middleware.ts
    types/
  tests/
  package.json
  next.config.ts
  tsconfig.json
```

## Estrutura de telas (src/app)

```text
src/app/
  page.tsx
  [slug]/page.tsx
  search/page.tsx
  maintenance/page.tsx
  signin/page.tsx
  signup/page.tsx
  forgot-password/page.tsx
  reset-password/page.tsx
  post-auth/page.tsx
  perfil/page.tsx
  courts/[id]/page.tsx
  establishments/[id]/page.tsx
  meus-agendamentos/page.tsx
  meus-agendamentos/[id]/page.tsx
  meus-agendamentos/notificacoes/page.tsx
  sorteio-times/page.tsx
  torneios/page.tsx
  torneios/novo/page.tsx
  torneios/[id]/page.tsx
  torneios/[id]/inscricao/page.tsx
  dashboard/layout.tsx
  dashboard/page.tsx
  dashboard/admin/page.tsx
  dashboard/agenda/page.tsx
  dashboard/quadras/page.tsx
  dashboard/financeiro/page.tsx
  dashboard/pagamentos/page.tsx
  dashboard/aprovacoes/page.tsx
  dashboard/notificacoes/page.tsx
  dashboard/config/page.tsx
  dashboard/sistema/page.tsx
  dashboard/torneios/page.tsx
  dashboard/torneios/novo/page.tsx
  dashboard/torneios/[id]/page.tsx
  sysadmin/layout.tsx
  sysadmin/page.tsx
  sysadmin/approvals/page.tsx
  sysadmin/reasons/page.tsx
  sysadmin/search-options/page.tsx
  sysadmin/payments/page.tsx
  sysadmin/settings/page.tsx
  sysadmin/sistema/page.tsx
  sysadmin/users/page.tsx
  api/
```

## Telas e funcionalidades

### Publico e busca

- Rota: /
  - Funcionalidades: landing/hero, busca por localizacao, filtros (modalidade, data, horario, raio, preco), listagem de estabelecimentos, favoritos, mapa (logado), CTA para dono, secoes marketing.
  - Arquivos: [src/app/page.tsx](src/app/page.tsx), [src/components/SearchClient.tsx](src/components/SearchClient.tsx)

- Rota: /search
  - Funcionalidades: redireciona query string para a home.
  - Arquivo: [src/app/search/page.tsx](src/app/search/page.tsx)

- Rota: /maintenance
  - Funcionalidades: tela estatica de manutencao.
  - Arquivo: [src/app/maintenance/page.tsx](src/app/maintenance/page.tsx)

- Rota: /[slug]
  - Funcionalidades: detalhe do estabelecimento por slug, lista de quadras, acesso rapido a horarios, contato WhatsApp, reviews e favoritos.
  - Arquivos: [src/app/[slug]/page.tsx](src/app/[slug]/page.tsx), [src/app/establishments/[id]/EngagementClient.tsx](src/app/establishments/[id]/EngagementClient.tsx)

- Rota: /establishments/[id]
  - Funcionalidades: detalhe do estabelecimento por id, lista de quadras, filtros de dia/horario, reviews e favoritos.
  - Arquivos: [src/app/establishments/[id]/page.tsx](src/app/establishments/[id]/page.tsx), [src/app/establishments/[id]/EngagementClient.tsx](src/app/establishments/[id]/EngagementClient.tsx)

- Rota: /courts/[id]
  - Funcionalidades: detalhe da quadra, selecao de horario, agendamento, pagamentos (Pix/cartao/boleto conforme setup), alertas de disponibilidade.
  - Arquivos: [src/app/courts/[id]/page.tsx](src/app/courts/[id]/page.tsx), [src/app/courts/[id]/ui.tsx](src/app/courts/[id]/ui.tsx)

- Rota: /sorteio-times
  - Funcionalidades: sorteio/geracao de times.
  - Arquivos: [src/app/sorteio-times/page.tsx](src/app/sorteio-times/page.tsx), [src/app/sorteio-times/ui.tsx](src/app/sorteio-times/ui.tsx)

### Autenticacao

- Rota: /signin
  - Funcionalidades: login, suporte a callbackUrl, selecao de papel inicial (CUSTOMER/OWNER), mensagens de sucesso/saida/reset.
  - Arquivos: [src/app/signin/page.tsx](src/app/signin/page.tsx), [src/app/signin/ui.tsx](src/app/signin/ui.tsx)

- Rota: /signup
  - Funcionalidades: cadastro com papel inicial e callbackUrl.
  - Arquivos: [src/app/signup/page.tsx](src/app/signup/page.tsx), [src/app/signup/ui.tsx](src/app/signup/ui.tsx)

- Rota: /forgot-password
  - Funcionalidades: solicitar codigo de redefinicao por email.
  - Arquivo: [src/app/forgot-password/page.tsx](src/app/forgot-password/page.tsx)

- Rota: /reset-password
  - Funcionalidades: redefinir senha com email e codigo enviado.
  - Arquivos: [src/app/reset-password/page.tsx](src/app/reset-password/page.tsx), [src/app/reset-password/ResetPasswordClient.tsx](src/app/reset-password/ResetPasswordClient.tsx)

- Rota: /post-auth
  - Funcionalidades: pos-login; redireciona por papel (SYSADMIN, ADMIN) ou para rota segura.
  - Arquivo: [src/app/post-auth/page.tsx](src/app/post-auth/page.tsx)

### Cliente

- Rota: /perfil
  - Funcionalidades: editar dados do usuario (nome, email, whatsapp, cpf/cnpj, endereco, localizacao, imagem).
  - Arquivos: [src/app/perfil/page.tsx](src/app/perfil/page.tsx), [src/app/perfil/ProfileClient.tsx](src/app/perfil/ProfileClient.tsx)

- Rota: /meus-agendamentos
  - Funcionalidades: listar agendamentos com filtros, status, pagamentos pendentes, notificacoes recentes, review de partidas finalizadas.
  - Arquivos: [src/app/meus-agendamentos/page.tsx](src/app/meus-agendamentos/page.tsx), [src/app/meus-agendamentos/ReviewFormClient.tsx](src/app/meus-agendamentos/ReviewFormClient.tsx), [src/app/meus-agendamentos/MyBookingsFiltersClient.tsx](src/app/meus-agendamentos/MyBookingsFiltersClient.tsx)

- Rota: /meus-agendamentos/[id]
  - Funcionalidades: detalhe do agendamento, pagamento, reagendamento, notificacoes do booking.
  - Arquivos: [src/app/meus-agendamentos/[id]/page.tsx](src/app/meus-agendamentos/[id]/page.tsx), [src/app/meus-agendamentos/[id]/BookingDetailClient.tsx](src/app/meus-agendamentos/[id]/BookingDetailClient.tsx)

- Rota: /meus-agendamentos/notificacoes
  - Funcionalidades: historico de notificacoes com filtros, exclusao/restauracao.
  - Arquivo: [src/app/meus-agendamentos/notificacoes/page.tsx](src/app/meus-agendamentos/notificacoes/page.tsx)

### Torneios (cliente)

- Rota: /torneios
  - Funcionalidades: listar torneios publicos e privados, filtros e detalhes basicos.
  - Arquivos: [src/app/torneios/page.tsx](src/app/torneios/page.tsx), [src/app/torneios/ui.tsx](src/app/torneios/ui.tsx)

- Rota: /torneios/novo
  - Funcionalidades: criar torneio interno (cliente).
  - Arquivos: [src/app/torneios/novo/page.tsx](src/app/torneios/novo/page.tsx), [src/app/torneios/novo/ui.tsx](src/app/torneios/novo/ui.tsx)

- Rota: /torneios/[id]
  - Funcionalidades: detalhe do torneio, times inscritos, partidas e regras.
  - Arquivos: [src/app/torneios/[id]/page.tsx](src/app/torneios/[id]/page.tsx), [src/app/torneios/[id]/ui.tsx](src/app/torneios/[id]/ui.tsx)

- Rota: /torneios/[id]/inscricao
  - Funcionalidades: inscricao em torneio, categorias e niveis.
  - Arquivos: [src/app/torneios/[id]/inscricao/page.tsx](src/app/torneios/[id]/inscricao/page.tsx), [src/app/torneios/[id]/inscricao/ui.tsx](src/app/torneios/[id]/inscricao/ui.tsx)

### Dashboard (dono/admin)

- Rota: /dashboard (layout)
  - Funcionalidades: layout e estado do estabelecimento, status de aprovacao e avisos.
  - Arquivo: [src/app/dashboard/layout.tsx](src/app/dashboard/layout.tsx)

- Rota: /dashboard
  - Funcionalidades: visao geral com agenda por dia/semana/mes, notificacoes, pendencias de agendamento/mensalidade e estatisticas.
  - Arquivo: [src/app/dashboard/page.tsx](src/app/dashboard/page.tsx)

- Rota: /dashboard/admin
  - Funcionalidades: dados do estabelecimento, configuracoes gerais, horarios e dados basicos.
  - Arquivos: [src/app/dashboard/admin/page.tsx](src/app/dashboard/admin/page.tsx), [src/app/dashboard/admin/ui.tsx](src/app/dashboard/admin/ui.tsx)

- Rota: /dashboard/agenda
  - Funcionalidades: agenda semanal por quadra, bloqueios, mensalidades pendentes.
  - Arquivos: [src/app/dashboard/agenda/page.tsx](src/app/dashboard/agenda/page.tsx), [src/app/dashboard/agenda/ui.tsx](src/app/dashboard/agenda/ui.tsx)

- Rota: /dashboard/quadras
  - Funcionalidades: gestao de quadras, preco, modalidades, comodidades, inativacao.
  - Arquivos: [src/app/dashboard/quadras/page.tsx](src/app/dashboard/quadras/page.tsx), [src/app/dashboard/quadras/ui.tsx](src/app/dashboard/quadras/ui.tsx)

- Rota: /dashboard/financeiro
  - Funcionalidades: indicadores financeiros, ocupacao, cancelamentos, mensalidades.
  - Arquivo: [src/app/dashboard/financeiro/page.tsx](src/app/dashboard/financeiro/page.tsx)

- Rota: /dashboard/pagamentos
  - Funcionalidades: relatorio de pagamentos, filtros por provedor e periodo.
  - Arquivo: [src/app/dashboard/pagamentos/page.tsx](src/app/dashboard/pagamentos/page.tsx)

- Rota: /dashboard/aprovacoes
  - Funcionalidades: aprovar/cancelar agendamentos e mensalidades com filtros.
  - Arquivo: [src/app/dashboard/aprovacoes/page.tsx](src/app/dashboard/aprovacoes/page.tsx)

- Rota: /dashboard/notificacoes
  - Funcionalidades: historico de notificacoes do dono, filtros e acoes.
  - Arquivo: [src/app/dashboard/notificacoes/page.tsx](src/app/dashboard/notificacoes/page.tsx)

- Rota: /dashboard/config
  - Funcionalidades: redireciona para /dashboard/admin.
  - Arquivo: [src/app/dashboard/config/page.tsx](src/app/dashboard/config/page.tsx)

- Rota: /dashboard/sistema
  - Funcionalidades: redireciona para /sysadmin/sistema (somente SYSADMIN).
  - Arquivo: [src/app/dashboard/sistema/page.tsx](src/app/dashboard/sistema/page.tsx)

- Rota: /dashboard/torneios
  - Funcionalidades: lista de torneios do estabelecimento.
  - Arquivos: [src/app/dashboard/torneios/page.tsx](src/app/dashboard/torneios/page.tsx), [src/app/dashboard/torneios/ui.tsx](src/app/dashboard/torneios/ui.tsx)

- Rota: /dashboard/torneios/novo
  - Funcionalidades: criar torneio do estabelecimento.
  - Arquivos: [src/app/dashboard/torneios/novo/page.tsx](src/app/dashboard/torneios/novo/page.tsx), [src/app/dashboard/torneios/novo/ui.tsx](src/app/dashboard/torneios/novo/ui.tsx)

- Rota: /dashboard/torneios/[id]
  - Funcionalidades: detalhe do torneio, inscricoes, partidas e financeiro.
  - Arquivos: [src/app/dashboard/torneios/[id]/page.tsx](src/app/dashboard/torneios/[id]/page.tsx), [src/app/dashboard/torneios/[id]/ui.tsx](src/app/dashboard/torneios/[id]/ui.tsx)

### Sysadmin

- Rota: /sysadmin (layout)
  - Funcionalidades: layout global com contagem de aprovacoes pendentes.
  - Arquivo: [src/app/sysadmin/layout.tsx](src/app/sysadmin/layout.tsx)

- Rota: /sysadmin
  - Funcionalidades: hub de navegacao para telas administrativas.
  - Arquivo: [src/app/sysadmin/page.tsx](src/app/sysadmin/page.tsx)

- Rota: /sysadmin/approvals
  - Funcionalidades: aprovar/reprovar estabelecimentos pendentes.
  - Arquivo: [src/app/sysadmin/approvals/page.tsx](src/app/sysadmin/approvals/page.tsx)

- Rota: /sysadmin/reasons
  - Funcionalidades: motivos de inativacao de quadras.
  - Arquivos: [src/app/sysadmin/reasons/page.tsx](src/app/sysadmin/reasons/page.tsx), [src/app/sysadmin/reasons/ui.tsx](src/app/sysadmin/reasons/ui.tsx)

- Rota: /sysadmin/search-options
  - Funcionalidades: opcoes de modalidade para busca publica.
  - Arquivos: [src/app/sysadmin/search-options/page.tsx](src/app/sysadmin/search-options/page.tsx), [src/app/sysadmin/search-options/ui.tsx](src/app/sysadmin/search-options/ui.tsx)

- Rota: /sysadmin/payments
  - Funcionalidades: pagamentos e eventos de webhook (view global).
  - Arquivo: [src/app/sysadmin/payments/page.tsx](src/app/sysadmin/payments/page.tsx)

- Rota: /sysadmin/settings
  - Funcionalidades: SMTP, configuracao de pagamentos, credenciais e testes.
  - Arquivo: [src/app/sysadmin/settings/page.tsx](src/app/sysadmin/settings/page.tsx)

- Rota: /sysadmin/sistema
  - Funcionalidades: saude do sistema, fila de emails, logs de acesso.
  - Arquivo: [src/app/sysadmin/sistema/page.tsx](src/app/sysadmin/sistema/page.tsx)

- Rota: /sysadmin/users
  - Funcionalidades: gestao de usuarios (inativar/reativar).
  - Arquivo: [src/app/sysadmin/users/page.tsx](src/app/sysadmin/users/page.tsx)
