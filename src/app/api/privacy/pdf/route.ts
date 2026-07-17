import { NextResponse } from "next/server";
import { pdfHtmlWrapper } from "@/lib/pdfUtils";

const content = `<h1>Política de Privacidade</h1>
<p class="date">Última atualização: 17 de julho de 2026 &bull; Em conformidade com a LGPD (Lei nº 13.709/2018)</p>

<h2>1. Introdução</h2>
<p>A PlatzGo está comprometida com a proteção da privacidade e dos dados pessoais de seus usuários. Esta política descreve como coletamos, usamos, armazenamos e protegemos suas informações.</p>

<h2>2. Dados Coletados</h2>
<h3>2.1 Dados de Cadastro</h3>
<ul><li>Nome completo, e-mail, telefone (WhatsApp), CPF/CNPJ, endereço, coordenadas geográficas, foto de perfil.</li></ul>
<h3>2.2 Dados de Uso</h3>
<ul><li>Histórico de reservas, preferências de busca, favoritos, avaliações, interações com a plataforma.</li></ul>
<h3>2.3 Dados Financeiros</h3>
<ul><li>Histórico de transações via ASAAS, status de pagamentos, chaves PIX (temporárias), dados de split.</li></ul>
<h3>2.4 Dados Técnicos</h3>
<ul><li>Endereço IP, navegador, sistema operacional, cookies essenciais, logs de acesso.</li></ul>

<h2>3. Finalidades do Tratamento</h2>
<ul>
  <li><strong>Execução do serviço:</strong> processar reservas, pagamentos e notificações.</li>
  <li><strong>Verificação de identidade:</strong> validação de CPF/CNPJ junto ao ASAAS.</li>
  <li><strong>Geolocalização:</strong> localizar estabelecimentos próximos.</li>
  <li><strong>Melhoria da plataforma:</strong> análise de uso para otimização.</li>
  <li><strong>Comunicação:</strong> e-mails transacionais, lembretes e alertas.</li>
  <li><strong>Segurança:</strong> prevenção a fraudes, auditoria e obrigações legais.</li>
</ul>

<h2>4. Compartilhamento de Dados</h2>
<ul>
  <li><strong>ASAAS:</strong> provedor de pagamentos (CPF/CNPJ, nome, e-mail).</li>
  <li><strong>Google:</strong> autenticação OAuth e mapas (Google Maps API).</li>
  <li><strong>AWS/MinIO/DigitalOcean (S3):</strong> armazenamento de fotos com criptografia.</li>
  <li><strong>Estabelecimentos:</strong> nome e horário para identificação no local.</li>
</ul>
<p>Não vendemos ou comercializamos dados pessoais para terceiros.</p>

<h2>5. Armazenamento e Segurança</h2>
<ul>
  <li>Criptografia AES-256-GCM para dados sensíveis (CPF/CNPJ, chaves de API).</li>
  <li>Conexões TLS/SSL para toda comunicação.</li>
  <li>Autenticação segura via NextAuth.js com OAuth 2.0 e credenciais hash.</li>
  <li>Validação de webhooks ASAAS via token com comparação timing-safe.</li>
  <li>Monitoramento de acessos e logs de auditoria.</li>
  <li>Redis para cache com prefixo isolado, sem dados sensíveis.</li>
</ul>

<h2>6. Retenção de Dados</h2>
<ul>
  <li>Dados de conta: enquanto ativa. Após inatividade de 5 anos ou solicitação, são removidos.</li>
  <li>Transações: mínimo de 5 anos conforme legislação fiscal.</li>
  <li>Logs de acesso: 6 meses conforme Marco Civil da Internet.</li>
</ul>

<h2>7. Seus Direitos (LGPD)</h2>
<ul>
  <li>Confirmação e acesso aos dados</li>
  <li>Correção de dados incompletos ou inexatos</li>
  <li>Anonimização, bloqueio ou eliminação</li>
  <li>Portabilidade dos dados</li>
  <li>Eliminação de dados tratados com consentimento</li>
  <li>Informação sobre compartilhamento</li>
  <li>Revogação de consentimento</li>
  <li>Revisão de decisões automatizadas</li>
</ul>
<p>Para exercer seus direitos: privacidade@platzgo.com.br</p>

<h2>8. Cookies</h2>
<p>Utilizamos apenas cookies essenciais: autenticação (NextAuth.js) e preferências (localStorage para filtros de busca). Não utilizamos cookies de rastreamento, publicidade ou analytics.</p>

<h2>9. Transferência Internacional</h2>
<p>Dados podem ser processados em servidores fora do Brasil, mantendo o mesmo nível de proteção exigido pela LGPD através de cláusulas contratuais e certificações de segurança.</p>

<h2>10. Contato</h2>
<p>Encarregado de Proteção de Dados (DPO): privacidade@platzgo.com.br<br/>Endereço: Avenida Paulista, 1000 - São Paulo/SP - CEP 01310-100<br/>Resposta em até 15 dias conforme LGPD.</p>`;

export async function GET() {
  const html = pdfHtmlWrapper("Política de Privacidade - PlatzGo", content);
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"platzgo-politica-de-privacidade.html\"",
    },
  });
}