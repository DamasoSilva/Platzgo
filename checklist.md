# 🏟️ Roadmap e Checklist: Projeto PlayHub

---

## 🟢 FASE 1: Infraestrutura e Base de Dados
- [ ] **Configuração do Ambiente:** Setup do Next.js 14+ (App Router), Tailwind CSS e Prisma ORM.
- [ ] **Banco de Dados:** Instância PostgreSQL ativa (local ou cloud).
- [ ] **Modelagem Prisma:**
    - [ ] Tabela `User` (Roles: ADMIN e CUSTOMER).
    - [ ] Tabela `Establishment` (Vínculo com Admin).
    - [ ] Tabela `Court` (Vínculo com Estabelecimento).
    - [ ] Tabela `Booking` (Vínculo com Cliente e Quadra).
- [ ] **Autenticação:** Configuração do NextAuth.js (Login/Cadastro).

---

## 🔵 FASE 2: O "Cérebro" (Lógica de Negócios)
- [ ] **Cálculo de Preço:** Lógica de horas e aplicação de desconto ($\ge$ 1h30).
- [ ] **Prevenção de Conflitos:** Implementar Database Transactions para evitar Double Booking.
- [ ] **Motor de Busca Geo:** Fórmula de Haversine para filtros de distância (KM).
- [ ] **API de Slots:** Algoritmo para calcular horários livres em tempo real.

---

## 🟠 FASE 3: Painel do Administrador (Web)
- [ ] **Perfil do Estabelecimento:**
    - [ ] Cadastro de Nome, WhatsApp e Horários.
    - [ ] Integração Google Maps Autocomplete (Lat/Lng).
- [ ] **Gestão de Quadras:**
    - [ ] CRUD completo de quadras.
    - [ ] Sistema de upload/armazenamento de fotos.
- [ ] **Gestão de Agendamentos:**
    - [ ] Visualização da agenda do estabelecimento.
    - [ ] Controle de status da reserva (Confirmado/Cancelado).

---

## 🔴 FASE 4: Portal do Cliente (Web)
- [ ] **Busca e Filtros:**
    - [ ] Filtro por modalidade, distância e preço.
- [ ] **Mapa de Navegação:** Exibição de pins dinâmicos no mapa.
- [ ] **Página da Quadra:**
    - [ ] Galeria de fotos e botão de WhatsApp.
    - [ ] Grade de horários clicável para agendamento.
- [ ] **Fluxo de Reserva:** Finalização e confirmação no banco.

---

## 📱 FASE 5: Aplicativo Mobile (iOS/Android)
- [ ] **Setup Expo:** Inicialização e configuração do NativeWind.
- [ ] **Navegação:** Setup de Tabs (Explorar, Reservas, Perfil).
- [ ] **Geolocalização Nativa:** Permissões de GPS e Mapa nativo.
- [ ] **Sincronização:** Integração total com a API do Backend Web.
- [ ] **Persistência:** Login persistente com JWT.

---

## 🟡 FASE 6: Finalização e Deploy
- [ ] **Segurança:** Proteção de API Keys e Variáveis de Ambiente.
- [ ] **Polimento UI:** Skeletons de carregamento e feedbacks de erro.
- [ ] **Deploy Produção:** Vercel (Web) e EAS/Store (Mobile).