import type { Metadata } from "next";
import Link from "next/link";
import { CustomerHeader } from "@/components/CustomerHeader";
import { ThemedBackground } from "@/components/ThemedBackground";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = { title: "Termos de Uso • PlatzGo!", description: "Termos e condições de uso da plataforma PlatzGo." };

export default async function TermsPage() {
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
              <h1 className="text-2xl font-bold text-foreground">Termos de Uso</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-6">Última atualização: 17 de julho de 2026</p>

            <div className="prose prose-sm prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
              <section>
                <h2 className="text-lg font-bold text-foreground">1. Aceitação dos Termos</h2>
                <p>Ao acessar e utilizar a plataforma PlatzGo (&ldquo;Plataforma&rdquo;), você (&ldquo;Usuário&rdquo;) concorda integralmente com estes Termos de Uso. Caso não concorde com qualquer disposição aqui contida, não utilize a Plataforma. A PlatzGo reserva-se o direito de modificar estes termos a qualquer momento, notificando os usuários por e-mail ou através da própria Plataforma. O uso continuado após a modificação constitui aceitação tácita dos novos termos.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">2. Definições</h2>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Plataforma:</strong> O website, aplicativo e serviços oferecidos sob a marca PlatzGo.</li>
                  <li><strong>Estabelecimento:</strong> Pessoa jurídica ou física que disponibiliza quadras esportivas para reserva através da Plataforma.</li>
                  <li><strong>Usuário/Cliente:</strong> Pessoa física que utiliza a Plataforma para buscar e reservar quadras esportivas.</li>
                  <li><strong>Reserva:</strong> Agendamento de um horário específico em uma quadra realizada através da Plataforma.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">3. Cadastro e Verificação</h2>
                <p>Para utilizar a Plataforma, o Usuário deve criar uma conta fornecendo informações verdadeiras, precisas e completas, incluindo nome completo, e-mail válido, número de telefone (WhatsApp) e CPF/CNPJ. Estes dados são obrigatórios para processamento de pagamentos via ASAAS, provedor de pagamentos integrado à Plataforma.</p>
                <p>O Usuário é responsável por manter a confidencialidade de suas credenciais de acesso. Qualquer atividade realizada através de sua conta é de sua exclusiva responsabilidade. A PlatzGo reserva-se o direito de suspender ou cancelar contas que forneçam informações falsas ou incompletas.</p>
                <p>O CPF/CNPJ informado é validado eletronicamente e armazenado de forma segura. O tratamento destes dados segue rigorosamente a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">4. Responsabilidades do Estabelecimento</h2>
                <p>O Estabelecimento cadastrado na Plataforma é responsável por:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Manter informações precisas sobre quadras, horários de funcionamento e preços.</li>
                  <li>Honrar todas as reservas confirmadas através da Plataforma.</li>
                  <li>Garantir condições adequadas de uso das quadras (segurança, limpeza, manutenção).</li>
                  <li>Definir e comunicar claramente suas políticas de cancelamento e reembolso.</li>
                  <li>Manter wallet ASAAS ativo para recebimento dos valores das reservas.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">5. Pagamentos e Split</h2>
                <p>Todos os pagamentos realizados na Plataforma são processados pelo provedor ASAAS (sandbox ou produção, conforme configuração). A Plataforma utiliza split de pagamento: uma porcentagem configurável é destinada à PlatzGo como taxa de serviço, e o restante é repassado ao Estabelecimento via wallet ASAAS.</p>
                <p>Os valores são exibidos em reais (BRL) e processados em centavos para precisão. O pagamento via PIX é o método padrão disponível, com prazo de expiração do QR Code PIX de 15 (quinze) minutos. Em caso de não pagamento dentro do prazo, a reserva poderá ser cancelada automaticamente.</p>
                <p>O Usuário é responsável por verificar os dados do pagamento antes da confirmação. A PlatzGo não se responsabiliza por pagamentos realizados em links fraudulentos fora da Plataforma.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">6. Cancelamentos e Reembolsos</h2>
                <p>Cada Estabelecimento define sua política de cancelamento através do painel administrativo, incluindo:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Prazo mínimo de antecedência</strong> para cancelamento sem multa (em horas).</li>
                  <li><strong>Taxa de cancelamento:</strong> percentual sobre o valor da reserva ou valor fixo em reais.</li>
                  <li>Cancelamentos realizados após o prazo estão sujeitos à multa configurada pelo Estabelecimento.</li>
                  <li>No-show (não comparecimento) é tratado como cancelamento após o prazo.</li>
                </ul>
                <p>Reembolsos são processados de acordo com a política do Estabelecimento e do provedor de pagamento. O prazo de reembolso pode variar conforme o método de pagamento utilizado e as regras do ASAAS.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">7. Propriedade Intelectual</h2>
                <p>Todos os direitos de propriedade intelectual sobre a Plataforma, incluindo código-fonte, design, logotipos, marcas e conteúdo, são de titularidade exclusiva da PlatzGo ou de seus licenciadores. É vedada a reprodução, distribuição ou modificação de qualquer parte da Plataforma sem autorização expressa por escrito.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">8. Limitação de Responsabilidade</h2>
                <p>A PlatzGo atua como intermediadora entre Usuários e Estabelecimentos, não sendo responsável pela qualidade dos serviços prestados pelos Estabelecimentos, incluindo mas não se limitando a condições das quadras, segurança do local ou conduta de terceiros.</p>
                <p>Em nenhuma circunstância a PlatzGo será responsável por danos indiretos, incidentais, especiais ou consequenciais decorrentes do uso da Plataforma. A responsabilidade da PlatzGo limita-se ao valor dos serviços prestados diretamente pela Plataforma.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">9. Privacidade e Proteção de Dados</h2>
                <p>O tratamento de dados pessoais é regido pela nossa Política de Privacidade, disponível em <Link href="/privacidade" className="text-primary underline">platzgo.com.br/privacidade</Link>, e está em conformidade com a LGPD. Dados sensíveis como CPF/CNPJ são armazenados criptografados e utilizados exclusivamente para processamento de pagamentos via ASAAS.</p>
              </section>

              <section>
                <h2 className="text-lg font-bold text-foreground">10. Disposições Gerais</h2>
                <p>Estes Termos de Uso são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca da sede da Plataforma para dirimir quaisquer controvérsias decorrentes destes termos. A nulidade ou ineficácia de qualquer disposição não afetará as demais. A tolerância de eventual descumprimento não constitui renúncia ou novação.</p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}