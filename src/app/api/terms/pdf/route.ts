import { NextResponse } from "next/server";
import { pdfHtmlWrapper } from "@/lib/pdfUtils";

const content = `<h1>Termos de Uso</h1>
<p class="date">Última atualização: 17 de julho de 2026</p>

<h2>1. Aceitação dos Termos</h2>
<p>Ao acessar e utilizar a plataforma PlatzGo, você concorda integralmente com estes Termos de Uso. Caso não concorde com qualquer disposição aqui contida, não utilize a Plataforma. A PlatzGo reserva-se o direito de modificar estes termos a qualquer momento, notificando os usuários por e-mail ou através da própria Plataforma.</p>

<h2>2. Definições</h2>
<ul>
  <li><strong>Plataforma:</strong> O website, aplicativo e serviços oferecidos sob a marca PlatzGo.</li>
  <li><strong>Estabelecimento:</strong> Pessoa jurídica ou física que disponibiliza quadras esportivas para reserva.</li>
  <li><strong>Usuário/Cliente:</strong> Pessoa física que utiliza a Plataforma para buscar e reservar quadras.</li>
  <li><strong>Reserva:</strong> Agendamento de horário em quadra realizado através da Plataforma.</li>
</ul>

<h2>3. Cadastro e Verificação</h2>
<p>Para utilizar a Plataforma, o Usuário deve fornecer informações verdadeiras, incluindo nome completo, e-mail válido, telefone e CPF/CNPJ. Estes dados são obrigatórios para processamento de pagamentos via ASAAS. O CPF/CNPJ é validado eletronicamente e armazenado de forma segura conforme a LGPD.</p>
<p>O Usuário é responsável pela confidencialidade de suas credenciais. A PlatzGo reserva-se o direito de suspender contas com informações falsas.</p>

<h2>4. Responsabilidades do Estabelecimento</h2>
<ul>
  <li>Manter informações precisas sobre quadras, horários e preços.</li>
  <li>Honrar todas as reservas confirmadas.</li>
  <li>Garantir condições adequadas de uso das quadras.</li>
  <li>Definir políticas de cancelamento e reembolso.</li>
  <li>Manter wallet ASAAS ativo para recebimento dos valores.</li>
</ul>

<h2>5. Pagamentos e Split</h2>
<p>Todos os pagamentos são processados pelo provedor ASAAS. A Plataforma utiliza split de pagamento: uma porcentagem é destinada à PlatzGo como taxa de serviço, e o restante é repassado ao Estabelecimento. O pagamento via PIX é o método padrão, com prazo de expiração de 15 minutos. Em caso de não pagamento, a reserva poderá ser cancelada automaticamente.</p>

<h2>6. Cancelamentos e Reembolsos</h2>
<p>Cada Estabelecimento define sua política de cancelamento: prazo mínimo de antecedência e taxa (percentual ou valor fixo). Cancelamentos após o prazo estão sujeitos à multa. No-show é tratado como cancelamento após o prazo. Reembolsos seguem a política do Estabelecimento e do provedor de pagamento.</p>

<h2>7. Propriedade Intelectual</h2>
<p>Todos os direitos sobre a Plataforma, incluindo código-fonte, design, logotipos e marcas, são de titularidade exclusiva da PlatzGo. É vedada a reprodução sem autorização expressa.</p>

<h2>8. Limitação de Responsabilidade</h2>
<p>A PlatzGo atua como intermediadora, não sendo responsável pela qualidade dos serviços dos Estabelecimentos. Em nenhuma circunstância será responsável por danos indiretos ou consequenciais. A responsabilidade limita-se ao valor dos serviços prestados diretamente pela Plataforma.</p>

<h2>9. Privacidade e Proteção de Dados</h2>
<p>O tratamento de dados pessoais é regido pela Política de Privacidade, em conformidade com a LGPD. Dados sensíveis são armazenados criptografados e utilizados exclusivamente para processamento de pagamentos.</p>

<h2>10. Disposições Gerais</h2>
<p>Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca da sede da Plataforma. A nulidade de qualquer disposição não afetará as demais.</p>`;

export async function GET() {
  const html = pdfHtmlWrapper("Termos de Uso - PlatzGo", content);
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"platzgo-termos-de-uso.html\"",
    },
  });
}