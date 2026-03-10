# Organizacao de Torneios - Especificacao

## Objetivo
Definir como criar e operar torneios dentro do sistema, cobrindo dono do estabelecimento e cliente.

## Perfis e permissoes
- Dono/Admin: cria torneios, configura regras, agenda jogos, aprova inscricoes, publica resultados.
- Cliente: descobre torneios, inscreve time, paga taxa, acompanha calendario e resultados.

## Funcionalidades para o dono do estabelecimento
- Criar torneio com:
  - Nome, descricao, data inicio/fim, modalidade, local, limite de times, taxa de inscricao (valor definido pelo dono/admin).
  - Quantidade de jogadores por time (min/max).
  - Formato: grupos + mata-mata, pontos corridos, eliminatoria simples/dupla.
  - Regras: duracao por jogo, desempate, tolerancia, wo, substituicoes.
- Categorias e niveis (ex.: iniciante, intermediario, avancado).
- Inscricoes:
  - Abrir/fechar inscricoes.
  - Aprovar/recusar times.
  - Gerar payload de pagamento para liberar o cadastro do time (PIX/cartao).
  - Lista de espera.
- Organizacao do chaveamento:
  - Sorteio automatico de grupos.
  - Gerar tabela e bracket.
  - Ajustes manuais em confrontos.
- Agenda e quadras:
  - Distribuir jogos por quadra e horario.
  - Bloquear horarios automaticamente (integracao com agenda).
  - Recalcular calendario ao alterar times ou regras.
- Operacao do torneio:
  - Registrar placares e estatisticas.
  - Atualizar classificacao em tempo real.
  - Publicar resultados e tabela.
- Comunicacao:
  - Notificacoes para times (confirmacao de jogo, mudanca de horario, resultado).
  - Mensagens pre-definidas e avisos gerais.
- Financeiro:
  - Acompanhar taxas pagas/pendentes.
  - Payload de pagamento vinculado a inscricao (valor, pix_payload, qr, expira).
  - Exportar lista de inscritos e pagamentos.

## Funcionalidades para o cliente
- Descobrir torneios:
  - Filtros por cidade, modalidade, data, nivel, taxa.
- Inscrever time:
  - Criar time e adicionar participantes.
  - Informar quantidade de jogadores conforme minimo/maximo do torneio.
  - Cadastrar jogadores com nome e documento (usuario opcional).
  - Enviar documentos/dados obrigatorios.
- Pagamento:
  - Pagar taxa de inscricao via PIX/cartao com payload gerado no cadastro.
  - Ver status de pagamento.
- Agenda do time:
  - Calendario de jogos.
  - Notificacoes de horario/local.
- Acompanhar torneio:
  - Tabela de classificacao.
  - Bracket atualizado.
  - Estatisticas do time/jogadores.
- Torneio interno (cliente):
  - Criar torneio privado com regras basicas e quantidade de jogadores por time.
  - Enviar convite por link/whatsapp/email.
  - Cadastrar jogadores manualmente para completar os times.

## Fluxos principais
1) Criacao do torneio
- Dono cria torneio, define formato, regras e datas.
- Sistema cria rascunho e permite ajustes.

2) Inscricoes
- Cliente inscreve time, informa elenco e paga taxa.
- Sistema gera payload de pagamento e libera inscricao apos confirmacao.
- Dono aprova/recusa e sistema atualiza lista.

3) Sorteio e agenda
- Sistema gera grupos e calendario.
- Dono ajusta e publica.

4) Operacao
- Dono registra placares.
- Sistema atualiza classificacao e bracket.

5) Finalizacao
- Publicar campeao.
- Encerrar torneio e gerar relatorio.

6) Torneio interno (cliente)
- Cliente cria torneio privado e define regras e elenco.
- Envia convites ou inclui jogadores manualmente.
- Sistema gera agenda e publica resultados internos.

## Dados e modelos (sugestao)
- Tournament: id, name, sport_type, start_date, end_date, status, format, rules, organizer_id, organizer_type, visibility, team_size_min, team_size_max, entry_fee.
- Category: id, tournament_id, label, level.
- Team: id, name, logo_url.
- TeamMember: id, team_id, user_id, full_name, document_id, role.
- Registration: id, team_id, tournament_id, status, paid, payment_id.
- Match: id, tournament_id, round, group, court_id, start_time, end_time, status.
- Score: id, match_id, team_a_score, team_b_score, stats.
- Standing: id, tournament_id, team_id, points, wins, losses, goals.
- Payment: id, registration_id, status, provider, amount, pix_payload, pix_qr_base64, pix_expires_at.
- Invitation: id, tournament_id, team_id, invited_by_id, contact, status, token.
- Notification: id, target_id, type, payload.

## Integracoes
- Agenda/Quadras: reservar horarios automaticamente para jogos.
- Pagamentos: taxa de inscricao com PIX/cartao, payload e comprovante.
- Notificacoes: email/push/whatsapp para jogos e resultados.

## MVP sugerido
- Torneio unico por estabelecimento.
- Formato: grupos + mata-mata simples.
- Pagamento de inscricao via PIX.
- Cadastro de jogadores com nome/documento e limite por time.
- Registro de placares e tabela basica.
- Calendario de jogos com bloqueio de quadra.

## Evolucoes futuras
- Ranking historico por equipe.
- Divisao por categorias com promocao/rebaixamento.
- Streaming/placar ao vivo.
- Patrocinio e premios.
