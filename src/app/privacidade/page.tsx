import type { Metadata } from "next";
import { CustomerHeader } from "@/components/CustomerHeader";
import { ThemedBackground } from "@/components/ThemedBackground";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = { title: "Política de Privacidade • PlatzGo!", description: "Política de privacidade e proteção de dados da plataforma PlatzGo." };

export default async function PrivacyPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  return (
    <div className="ph-page">
      <ThemedBackground />
      <div className="relative z-10">
        <CustomerHeader variant="light" viewer={{ isLoggedIn: Boolean(userId), name: session?.user?.name ?? null, image: session?.user?.image ?? null, role: session?.user?.role ?? null }} rightSlot={null} />
        <div className="mx-auto max-w-3xl px-4 sm:px-6 pb-16 pt-6">
          <div className="rounded-2xl border border-border bg-card p-8 sm:p-10">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-bold text-foreground">Política de Privacidade</h1>
              <a href="/api/privacy/pdf" className="text-xs font-medium text-primary hover:underline">Baixar PDF</a>
            </div>
            <p className="text-sm text-muted-foreground mb-6">Última atualização: 17 de julho de 2026. Em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).</p>

            <div className="prose prose-sm prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
              <section>
                <h2 className="text-lg font-bold text-foreground">1. Introdução</h2>
                <p>A PlatzGo (&ldquo;nós&rdquo;, &ldquo;nosso&rdquo;) está comprometida com a proteção da privacidade e dos dados pessoais de seus usuários (&ldquo;você&rdquo;, &ldquo;titular&rdquo;). Esta Política de Privacidade descreve como coletamos, usamos, armazenamos, compartilhamos e protegemos suas informações pessoais quando você utiliza nossa plataforma de agendamento de quadras esportivas.</p>
                <p>Esta política está em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 - LGPD), o Marco Civil da Internet (Lei nº 12.965/2014) e demais legislações aplicáveis.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">2. Dados Coletados</h2>
                <h3 className="text-base font-semibold text-foreground mt-3">2.1 Dados de Cadastro</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Nome completo</li>
                  <li>Endereço de e-mail</li>
                  <li>Número de telefone (WhatsApp)</li>
                  <li>CPF ou CNPJ (obrigatório para pagamentos)</li>
                  <li>Endereço físico (para busca por proximidade)</li>
                  <li>Coordenadas geográficas (latitude/longitude)</li>
                  <li>Foto de perfil (Google OAuth ou upload)</li>
                </ul>

                <h3 className="text-base font-semibold text-foreground mt-3">2.2 Dados de Uso</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Histórico de reservas e agendamentos</li>
                  <li>Preferências de busca (esporte, raio, horário)</li>
                  <li>Favoritos (estabelecimentos salvos)</li>
                  <li>Avaliações e comentários sobre estabelecimentos</li>
                  <li>Interações com a plataforma (páginas visitadas, recursos utilizados)</li>
                </ul>

                <h3 className="text-base font-semibold text-foreground mt-3">2.3 Dados Financeiros</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Histórico de transações e pagamentos via ASAAS</li>
                  <li>Status de pagamentos (pendente, confirmado, cancelado, reembolsado)</li>
                  <li>Chaves PIX e QR Codes (temporários, não armazenados permanentemente)</li>
                  <li>Dados de split de pagamento (percentual da plataforma, wallet do estabelecimento)</li>
                </ul>

                <h3 className="text-base font-semibold text-foreground mt-3">2.4 Dados Técnicos</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Endereço IP</li>
                  <li>Tipo de navegador e sistema operacional</li>
                  <li>Cookies e tecnologias similares (apenas essenciais)</li>
                  <li>Logs de acesso ao servidor</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">3. Finalidades do Tratamento</h2>
                <p>Seus dados são tratados para as seguintes finalidades específicas:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Execução do serviço:</strong> processar reservas, pagamentos, notificações de confirmação e cancelamento.</li>
                  <li><strong>Verificação de identidade:</strong> validação de CPF/CNPJ junto ao ASAAS para conformidade financeira.</li>
                  <li><strong>Geolocalização:</strong> localizar estabelecimentos próximos à sua posição.</li>
                  <li><strong>Melhoria da plataforma:</strong> análise de uso para otimização de funcionalidades.</li>
                  <li><strong>Comunicação:</strong> e-mails transacionais (confirmações, lembretes, alertas de disponibilidade).</li>
                  <li><strong>Segurança:</strong> prevenção a fraudes, auditoria e cumprimento de obrigações legais.</li>
                  <li><strong>Obrigação legal:</strong> emissão de notas fiscais quando aplicável, atendimento a ordens judiciais.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">4. Compartilhamento de Dados</h2>
                <p>Seus dados pessoais podem ser compartilhados nas seguintes situações:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>ASAAS:</strong> provedor de pagamentos. Recebe CPF/CNPJ, nome e e-mail para processamento de transações PIX e validação de identidade financeira. O ASAAS opera sob sua própria política de privacidade e está em conformidade com a LGPD.</li>
                  <li><strong>Google:</strong> para autenticação OAuth (login social) e exibição de mapas (Google Maps API). Apenas dados públicos do perfil Google são acessados.</li>
                  <li><strong>AWS/MinIO/DigitalOcean (S3):</strong> armazenamento de fotos de perfil, quadras e estabelecimentos em infraestrutura de storage compatível com S3, com criptografia em trânsito (TLS) e em repouso.</li>
                  <li><strong>Estabelecimentos:</strong> ao realizar uma reserva, o estabelecimento recebe seu nome e horário agendado para identificação no local.</li>
                  <li><strong>Autoridades:</strong> mediante ordem judicial ou requisição de autoridade competente, conforme legislação aplicável.</li>
                </ul>
                <p>Não vendemos, alugamos ou comercializamos dados pessoais para terceiros para fins de marketing.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">5. Armazenamento e Segurança</h2>
                <p>Seus dados são armazenados em servidores seguros utilizando PostgreSQL com criptografia em repouso e em trânsito. Medidas de segurança implementadas incluem:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Criptografia AES-256-GCM para dados sensíveis armazenados (CPF/CNPJ, chaves de API).</li>
                  <li>Conexões TLS/SSL para toda comunicação entre cliente e servidor.</li>
                  <li>Autenticação segura via NextAuth.js com suporte a OAuth 2.0 e credenciais hash.</li>
                  <li>Tokens de acesso rotativos e sessões com tempo de expiração.</li>
                  <li>Validação de webhooks ASAAS via token seguro com comparação timing-safe.</li>
                  <li>Monitoramento de acessos e logs de auditoria para detecção de atividades suspeitas.</li>
                  <li>Redis para cache com prefixo isolado (&ldquo;platzgo:&rdquo;), sem armazenamento de dados sensíveis em cache.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">6. Retenção de Dados</h2>
                <p>Os dados pessoais são mantidos pelo período necessário para cumprir as finalidades descritas nesta política, observando os seguintes prazos:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Dados de conta: enquanto a conta estiver ativa. Após inatividade de 5 anos ou solicitação de exclusão, os dados são removidos.</li>
                  <li>Dados de transações: mínimo de 5 anos conforme legislação fiscal e tributária brasileira.</li>
                  <li>Logs de acesso: 6 meses conforme Marco Civil da Internet.</li>
                  <li>Cookies: armazenados localmente no navegador do usuário, podendo ser limpos a qualquer momento.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">7. Seus Direitos (LGPD)</h2>
                <p>Você possui os seguintes direitos garantidos pela LGPD:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Confirmação e acesso:</strong> direito de confirmar a existência de tratamento e acessar seus dados.</li>
                  <li><strong>Correção:</strong> direito de corrigir dados incompletos, inexatos ou desatualizados.</li>
                  <li><strong>Anonimização, bloqueio ou eliminação:</strong> de dados desnecessários, excessivos ou tratados em desconformidade.</li>
                  <li><strong>Portabilidade:</strong> direito de receber seus dados em formato estruturado para transferência.</li>
                  <li><strong>Eliminação:</strong> direito de solicitar exclusão de dados tratados com consentimento.</li>
                  <li><strong>Informação sobre compartilhamento:</strong> saber com quais entidades seus dados são compartilhados.</li>
                  <li><strong>Revogação de consentimento:</strong> retirar consentimento a qualquer momento.</li>
                  <li><strong>Revisão automatizada:</strong> solicitar revisão de decisões tomadas unicamente por meios automatizados.</li>
                </ul>
                <p>Para exercer seus direitos, entre em contato através do e-mail: privacidade@platzgo.com.br.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">8. Cookies</h2>
                <p>Utilizamos apenas cookies essenciais para o funcionamento da plataforma:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Autenticação:</strong> cookies de sessão (NextAuth.js) para manter o login ativo.</li>
                  <li><strong>Preferências:</strong> armazenamento local (localStorage) para lembrar filtros de busca (dia, horário).</li>
                </ul>
                <p>Não utilizamos cookies de rastreamento, publicidade ou analytics de terceiros. Você pode configurar seu navegador para recusar cookies, mas isso pode afetar a funcionalidade de login da plataforma.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">9. Transferência Internacional</h2>
                <p>Seus dados podem ser processados em servidores localizados fora do Brasil. Nestes casos, garantimos que o tratamento ocorre em conformidade com a LGPD, mantendo o mesmo nível de proteção exigido pela legislação brasileira, através de cláusulas contratuais padrão e certificações de segurança dos provedores.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">10. Contato</h2>
                <p>Para questões relacionadas à privacidade, exercício de direitos ou comunicação com o Encarregado de Proteção de Dados (DPO):</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>E-mail:</strong> privacidade@platzgo.com.br</li>
                  <li><strong>Endereço:</strong> Avenida Paulista, 1000 - São Paulo/SP - CEP 01310-100</li>
                </ul>
                <p className="mt-3">A PlatzGo compromete-se a responder todas as solicitações no prazo máximo de 15 (quinze) dias, conforme estabelecido pela LGPD.</p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}