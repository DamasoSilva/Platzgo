function formatRangePtBr(start: Date, end: Date): string {
  const startLocal = new Date(start);
  const endLocal = new Date(end);

  const dd = String(startLocal.getDate()).padStart(2, "0");
  const mm = String(startLocal.getMonth() + 1).padStart(2, "0");
  const yyyy = startLocal.getFullYear();
  const hh1 = String(startLocal.getHours()).padStart(2, "0");
  const mi1 = String(startLocal.getMinutes()).padStart(2, "0");
  const hh2 = String(endLocal.getHours()).padStart(2, "0");
  const mi2 = String(endLocal.getMinutes()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} • ${hh1}:${mi1}–${hh2}:${mi2}`;
}

function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buttonHtml(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `
    <a href="${safeHref}" style="display:inline-block;background:#CCFF00;color:#0a0a0a;padding:12px 16px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;">
      ${safeLabel}
    </a>
  `;
}

function layoutHtml(params: { title: string; bodyHtml: string; footerHtml?: string }) {
  const title = escapeHtml(params.title);
  const footer = params.footerHtml ??
    `<div style="margin-top:20px;color:#6b7280;font-size:12px;">Se você não esperava este email, pode ignorar.</div>`;

  return `
  <div style="background:#f6f7fb;padding:24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
      <div style="padding:18px 20px;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">PlatzGo!</div>
        <div style="margin-top:6px;font-size:18px;font-weight:800;color:#111827;">${title}</div>
      </div>
      <div style="padding:20px;color:#111827;font-size:14px;line-height:1.6;">
        ${params.bodyHtml}
        ${footer}
      </div>
    </div>
  </div>
  `;
}

export function getAppUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function passwordResetEmail(params: { to: string; resetUrl: string }) {
  const subject = "Redefinição de senha";
  const text =
    `Recebemos um pedido para redefinir sua senha.\n\n` +
    `Para criar uma nova senha, abra o link: ${params.resetUrl}\n\n` +
    `Se você não solicitou isso, ignore este email.`;

  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Recebemos um pedido para redefinir sua senha.</p>
      <div style="margin-top:16px;">${buttonHtml(params.resetUrl, "Redefinir senha")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.resetUrl)}">${escapeHtml(params.resetUrl)}</a></div>
    `,
  });

  return { subject, text, html };
}

export function passwordResetCodeEmail(params: { to: string; code: string }) {
  const subject = "Código para redefinição de senha";
  const text =
    `Recebemos um pedido para redefinir sua senha.\n\n` +
    `Seu código é: ${params.code}\n` +
    `Ele expira em alguns minutos.\n\n` +
    `Se você não solicitou isso, ignore este email.`;

  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Recebemos um pedido para redefinir sua senha.</p>
      <p>Seu código é:</p>
      <div style="margin:12px 0;padding:12px 16px;border-radius:14px;background:#f4f4f5;font-size:20px;font-weight:800;letter-spacing:2px;text-align:center;">
        ${escapeHtml(params.code)}
      </div>
      <p>Ele expira em alguns minutos.</p>
    `,
  });

  return { subject, text, html };
}

export function passwordChangedEmail(params: { name?: string | null; loginUrl: string }) {
  const subject = "Senha alterada";
  const text =
    `Olá${params.name ? ", " + params.name : ""}!\n\n` +
    `Sua senha foi alterada com sucesso.\n` +
    `Se não foi você, altere sua senha imediatamente.\n\n` +
    `Entrar: ${params.loginUrl}\n`;

  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.name ? ", <strong>" + escapeHtml(params.name) + "</strong>" : ""}!</p>
      <p>Sua senha foi alterada com sucesso.</p>
      <p>Se não foi você, altere sua senha imediatamente.</p>
      <div style="margin-top:16px;">${buttonHtml(params.loginUrl, "Entrar")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.loginUrl)}">${escapeHtml(params.loginUrl)}</a></div>
    `,
  });

  return { subject, text, html };
}

export function signupConfirmedEmailToCustomer(params: { name?: string | null; loginUrl: string }) {
  const subject = "Cadastro confirmado";
  const text =
    `Olá${params.name ? ", " + params.name : ""}!\n\n` +
    `Seu cadastro foi confirmado.\n` +
    `Você já pode entrar no PlatzGo!.\n\n` +
    `Entrar: ${params.loginUrl}\n`;

  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.name ? ", <strong>" + escapeHtml(params.name) + "</strong>" : ""}!</p>
      <p>Seu cadastro foi confirmado.</p>
      <div style="margin-top:16px;">${buttonHtml(params.loginUrl, "Entrar")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.loginUrl)}">${escapeHtml(params.loginUrl)}</a></div>
    `,
  });

  return { subject, text, html };
}

export function signupConfirmedEmailToOwner(params: { ownerName?: string | null; establishmentName: string; dashboardUrl: string }) {
  const subject = "Cadastro do estabelecimento confirmado";
  const text =
    `Olá${params.ownerName ? ", " + params.ownerName : ""}!\n\n` +
    `Seu cadastro do estabelecimento ${params.establishmentName} foi confirmado.\n` +
    `Você já pode acessar o painel do dono.\n\n` +
    `Abrir painel: ${params.dashboardUrl}\n`;

  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.ownerName ? ", <strong>" + escapeHtml(params.ownerName) + "</strong>" : ""}!</p>
      <p>Seu cadastro do estabelecimento <strong>${escapeHtml(params.establishmentName)}</strong> foi confirmado.</p>
      <div style="margin-top:16px;">${buttonHtml(params.dashboardUrl, "Abrir painel")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.dashboardUrl)}">${escapeHtml(params.dashboardUrl)}</a></div>
    `,
  });

  return { subject, text, html };
}

export function emailVerificationCodeEmail(params: {
  name?: string | null;
  code: string;
  purposeLabel: string;
}) {
  const subject = "Código de verificação";
  const text =
    `Olá${params.name ? ", " + params.name : ""}!\n\n` +
    `Seu código de verificação (${params.purposeLabel}) é: ${params.code}\n` +
    `Ele expira em alguns minutos.\n`;

  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.name ? ", <strong>" + escapeHtml(params.name) + "</strong>" : ""}!</p>
      <p>Seu código de verificação (${escapeHtml(params.purposeLabel)}) é:</p>
      <div style="margin:12px 0;padding:12px 16px;border-radius:14px;background:#f4f4f5;font-size:20px;font-weight:800;letter-spacing:2px;text-align:center;">
        ${escapeHtml(params.code)}
      </div>
      <p>Ele expira em alguns minutos.</p>
    `,
  });

  return { subject, text, html };
}

export function ownerPendingApprovalEmail(params: { ownerName?: string | null; establishmentName: string }) {
  const subject = "Cadastro em análise";
  const text =
    `Olá${params.ownerName ? ", " + params.ownerName : ""}!\n\n` +
    `Recebemos o cadastro do estabelecimento ${params.establishmentName}.\n` +
    `Ele está em análise pela equipe do sistema. Você já pode acessar o painel e ajustar informações.\n` +
    `Avisaremos quando a aprovação for concluída.\n`;

  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.ownerName ? ", <strong>" + escapeHtml(params.ownerName) + "</strong>" : ""}!</p>
      <p>Recebemos o cadastro do estabelecimento <strong>${escapeHtml(params.establishmentName)}</strong>.</p>
      <p>Ele está em análise pela equipe do sistema. Você já pode acessar o painel e ajustar informações.</p>
      <p>Avisaremos quando a aprovação for concluída.</p>
    `,
  });

  return { subject, text, html };
}

export function sysadminApprovalTaskEmail(params: {
  establishmentName: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  approvalsUrl: string;
}) {
  const subject = "Novo cadastro para aprovação";
  const text =
    `Novo cadastro aguardando aprovação.\n\n` +
    `Estabelecimento: ${params.establishmentName}\n` +
    `${params.ownerName ? `Dono: ${params.ownerName}\n` : ""}` +
    `${params.ownerEmail ? `Email: ${params.ownerEmail}\n` : ""}` +
    `Abrir aprovações: ${params.approvalsUrl}\n`;

  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Novo cadastro aguardando aprovação.</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        <div><strong>Estabelecimento:</strong> ${escapeHtml(params.establishmentName)}</div>
        ${params.ownerName ? `<div><strong>Dono:</strong> ${escapeHtml(params.ownerName)}</div>` : ""}
        ${params.ownerEmail ? `<div><strong>Email:</strong> ${escapeHtml(params.ownerEmail)}</div>` : ""}
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.approvalsUrl, "Abrir aprovações")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.approvalsUrl)}">${escapeHtml(params.approvalsUrl)}</a></div>
    `,
  });

  return { subject, text, html };
}

export function establishmentApprovedEmailToOwner(params: { ownerName?: string | null; establishmentName: string; dashboardUrl: string }) {
  const subject = "Estabelecimento aprovado";
  const text =
    `Olá${params.ownerName ? ", " + params.ownerName : ""}!\n\n` +
    `Seu estabelecimento ${params.establishmentName} foi aprovado.\n` +
    `Acesse o painel: ${params.dashboardUrl}\n`;

  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.ownerName ? ", <strong>" + escapeHtml(params.ownerName) + "</strong>" : ""}!</p>
      <p>Seu estabelecimento <strong>${escapeHtml(params.establishmentName)}</strong> foi aprovado.</p>
      <div style="margin-top:16px;">${buttonHtml(params.dashboardUrl, "Abrir painel")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.dashboardUrl)}">${escapeHtml(params.dashboardUrl)}</a></div>
    `,
  });

  return { subject, text, html };
}

export function establishmentRejectedEmailToOwner(params: { ownerName?: string | null; establishmentName: string; reason?: string | null }) {
  const subject = "Cadastro reprovado";
  const text =
    `Olá${params.ownerName ? ", " + params.ownerName : ""}!\n\n` +
    `O cadastro do estabelecimento ${params.establishmentName} foi reprovado.\n` +
    `${params.reason ? `Motivo: ${params.reason}\n` : ""}`;

  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.ownerName ? ", <strong>" + escapeHtml(params.ownerName) + "</strong>" : ""}!</p>
      <p>O cadastro do estabelecimento <strong>${escapeHtml(params.establishmentName)}</strong> foi reprovado.</p>
      ${params.reason ? `
        <div style="margin-top:12px;padding:12px 14px;border-left:4px solid #ef4444;background:#fff7f7;border-radius:12px;">
          <div style="font-weight:800;color:#b91c1c;">Motivo</div>
          <div style="color:#7f1d1d;">${escapeHtml(params.reason)}</div>
        </div>
      ` : ""}
    `,
  });

  return { subject, text, html };
}

export function bookingPendingEmailToOwner(params: {
  ownerName?: string | null;
  establishmentName?: string | null;
  courtName: string;
  start: Date;
  end: Date;
  agendaUrl: string;
}) {
  const subject = "Novo agendamento pendente";
  const text =
    `Olá${params.ownerName ? ", " + params.ownerName : ""}!\n\n` +
    `Nova solicitação pendente${params.establishmentName ? ` em ${params.establishmentName}` : ""}:\n` +
    `${params.courtName}\n` +
    `${formatRangePtBr(params.start, params.end)}\n\n` +
    `Abra a agenda para revisar: ${params.agendaUrl}\n`;
  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.ownerName ? ", <strong>" + escapeHtml(params.ownerName) + "</strong>" : ""}!</p>
      <p>Nova solicitação pendente${params.establishmentName ? ` em <strong>${escapeHtml(params.establishmentName)}</strong>` : ""}:</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        <div style="font-weight:800;">${escapeHtml(params.courtName)}</div>
        <div style="color:#374151;">${escapeHtml(formatRangePtBr(params.start, params.end))}</div>
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.agendaUrl, "Abrir agenda")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.agendaUrl)}">${escapeHtml(params.agendaUrl)}</a></div>
    `,
  });
  return { subject, text, html };
}

export function bookingConfirmedEmailToCustomer(params: {
  customerName?: string | null;
  establishmentName?: string | null;
  courtName?: string | null;
  start: Date;
  end: Date;
  detailsUrl: string;
}) {
  const subject = "Agendamento confirmado";
  const text =
    `Olá${params.customerName ? ", " + params.customerName : ""}!\n\n` +
    `Seu agendamento foi confirmado${params.establishmentName ? ` em ${params.establishmentName}` : ""}.\n` +
    `${params.courtName ? params.courtName + "\n" : ""}` +
    `${formatRangePtBr(params.start, params.end)}\n\n` +
    `Ver detalhes: ${params.detailsUrl}\n`;
  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.customerName ? ", <strong>" + escapeHtml(params.customerName) + "</strong>" : ""}!</p>
      <p>Seu agendamento foi confirmado${params.establishmentName ? ` em <strong>${escapeHtml(params.establishmentName)}</strong>` : ""}.</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        ${params.courtName ? `<div style="font-weight:800;">${escapeHtml(params.courtName)}</div>` : ""}
        <div style="color:#374151;">${escapeHtml(formatRangePtBr(params.start, params.end))}</div>
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.detailsUrl, "Ver detalhes")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.detailsUrl)}">${escapeHtml(params.detailsUrl)}</a></div>
    `,
  });
  return { subject, text, html };
}

export function bookingReminderEmailToCustomer(params: {
  customerName?: string | null;
  establishmentName?: string | null;
  courtName?: string | null;
  start: Date;
  end: Date;
  detailsUrl: string;
}) {
  const subject = "Lembrete de agendamento";
  const text =
    `Olá${params.customerName ? ", " + params.customerName : ""}!\n\n` +
    `Este é um lembrete do seu agendamento${params.establishmentName ? ` em ${params.establishmentName}` : ""}.\n` +
    `${params.courtName ? params.courtName + "\n" : ""}` +
    `${formatRangePtBr(params.start, params.end)}\n\n` +
    `Ver detalhes: ${params.detailsUrl}\n`;
  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.customerName ? ", <strong>" + escapeHtml(params.customerName) + "</strong>" : ""}!</p>
      <p>Este é um lembrete do seu agendamento${params.establishmentName ? ` em <strong>${escapeHtml(params.establishmentName)}</strong>` : ""}.</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        ${params.courtName ? `<div style="font-weight:800;">${escapeHtml(params.courtName)}</div>` : ""}
        <div style="color:#374151;">${escapeHtml(formatRangePtBr(params.start, params.end))}</div>
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.detailsUrl, "Ver detalhes")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.detailsUrl)}">${escapeHtml(params.detailsUrl)}</a></div>
    `,
  });
  return { subject, text, html };
}

export function availabilityAlertEmailToCustomer(params: {
  customerName?: string | null;
  establishmentName?: string | null;
  courtName?: string | null;
  start: Date;
  end: Date;
  detailsUrl: string;
}) {
  const subject = "Horário disponível";
  const text =
    `Olá${params.customerName ? ", " + params.customerName : ""}!\n\n` +
    `O horário que você solicitou ficou disponível${params.establishmentName ? ` em ${params.establishmentName}` : ""}.\n` +
    `${params.courtName ? params.courtName + "\n" : ""}` +
    `${formatRangePtBr(params.start, params.end)}\n\n` +
    `Agendar agora: ${params.detailsUrl}\n`;
  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.customerName ? ", <strong>" + escapeHtml(params.customerName) + "</strong>" : ""}!</p>
      <p>O horário que você solicitou ficou disponível${params.establishmentName ? ` em <strong>${escapeHtml(params.establishmentName)}</strong>` : ""}.</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        ${params.courtName ? `<div style="font-weight:800;">${escapeHtml(params.courtName)}</div>` : ""}
        <div style="color:#374151;">${escapeHtml(formatRangePtBr(params.start, params.end))}</div>
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.detailsUrl, "Agendar agora")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.detailsUrl)}">${escapeHtml(params.detailsUrl)}</a></div>
    `,
  });
  return { subject, text, html };
}

export function bookingCancelledEmailToCustomer(params: {
  customerName?: string | null;
  establishmentName?: string | null;
  courtName?: string | null;
  start: Date;
  end: Date;
  reason: string;
  detailsUrl: string;
}) {
  const subject = "Agendamento cancelado";
  const text =
    `Olá${params.customerName ? ", " + params.customerName : ""}!\n\n` +
    `Seu agendamento foi cancelado${params.establishmentName ? ` em ${params.establishmentName}` : ""}.\n` +
    `${params.courtName ? params.courtName + "\n" : ""}` +
    `${formatRangePtBr(params.start, params.end)}\n\n` +
    `Motivo: ${params.reason}\n\n` +
    `Ver detalhes: ${params.detailsUrl}\n`;
  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.customerName ? ", <strong>" + escapeHtml(params.customerName) + "</strong>" : ""}!</p>
      <p>Seu agendamento foi cancelado${params.establishmentName ? ` em <strong>${escapeHtml(params.establishmentName)}</strong>` : ""}.</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        ${params.courtName ? `<div style="font-weight:800;">${escapeHtml(params.courtName)}</div>` : ""}
        <div style="color:#374151;">${escapeHtml(formatRangePtBr(params.start, params.end))}</div>
      </div>
      <div style="margin-top:12px;padding:12px 14px;border-left:4px solid #ef4444;background:#fff7f7;border-radius:12px;">
        <div style="font-weight:800;color:#b91c1c;">Motivo</div>
        <div style="color:#7f1d1d;">${escapeHtml(params.reason)}</div>
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.detailsUrl, "Ver detalhes")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.detailsUrl)}">${escapeHtml(params.detailsUrl)}</a></div>
    `,
  });
  return { subject, text, html };
}

export function bookingCancelledEmailToOwner(params: {
  ownerName?: string | null;
  establishmentName?: string | null;
  courtName: string;
  start: Date;
  end: Date;
  agendaUrl: string;
  who: "cliente" | "estabelecimento";
}) {
  const subject = "Cancelamento de horário";
  const text =
    `Olá${params.ownerName ? ", " + params.ownerName : ""}!\n\n` +
    `Um agendamento foi cancelado (${params.who}).\n` +
    `${params.establishmentName ? params.establishmentName + "\n" : ""}` +
    `${params.courtName}\n` +
    `${formatRangePtBr(params.start, params.end)}\n\n` +
    `Abrir agenda: ${params.agendaUrl}\n`;
  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.ownerName ? ", <strong>" + escapeHtml(params.ownerName) + "</strong>" : ""}!</p>
      <p>Um agendamento foi cancelado (${escapeHtml(params.who)}).</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        ${params.establishmentName ? `<div style="font-weight:800;">${escapeHtml(params.establishmentName)}</div>` : ""}
        <div style="font-weight:800;">${escapeHtml(params.courtName)}</div>
        <div style="color:#374151;">${escapeHtml(formatRangePtBr(params.start, params.end))}</div>
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.agendaUrl, "Abrir agenda")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.agendaUrl)}">${escapeHtml(params.agendaUrl)}</a></div>
    `,
  });
  return { subject, text, html };
}

export function bookingRescheduledEmailToOwner(params: {
  ownerName?: string | null;
  establishmentName?: string | null;
  courtName: string;
  fromStart: Date;
  fromEnd: Date;
  toStart: Date;
  toEnd: Date;
  agendaUrl: string;
}) {
  const subject = "Reagendamento de horário";
  const text =
    `Olá${params.ownerName ? ", " + params.ownerName : ""}!\n\n` +
    `O cliente solicitou reagendamento${params.establishmentName ? ` em ${params.establishmentName}` : ""}.\n` +
    `${params.courtName}\n\n` +
    `De: ${formatRangePtBr(params.fromStart, params.fromEnd)}\n` +
    `Para: ${formatRangePtBr(params.toStart, params.toEnd)}\n\n` +
    `Abrir agenda: ${params.agendaUrl}\n`;
  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.ownerName ? ", <strong>" + escapeHtml(params.ownerName) + "</strong>" : ""}!</p>
      <p>O cliente solicitou reagendamento${params.establishmentName ? ` em <strong>${escapeHtml(params.establishmentName)}</strong>` : ""}.</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        <div style="font-weight:800;">${escapeHtml(params.courtName)}</div>
        <div style="margin-top:8px;color:#374151;"><strong>De:</strong> ${escapeHtml(formatRangePtBr(params.fromStart, params.fromEnd))}</div>
        <div style="color:#374151;"><strong>Para:</strong> ${escapeHtml(formatRangePtBr(params.toStart, params.toEnd))}</div>
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.agendaUrl, "Abrir agenda")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.agendaUrl)}">${escapeHtml(params.agendaUrl)}</a></div>
    `,
  });
  return { subject, text, html };
}

export function bookingRescheduledEmailToCustomer(params: {
  customerName?: string | null;
  establishmentName?: string | null;
  courtName?: string | null;
  fromStart: Date;
  fromEnd: Date;
  toStart: Date;
  toEnd: Date;
  detailsUrl: string;
}) {
  const subject = "Reagendamento solicitado";
  const text =
    `Olá${params.customerName ? ", " + params.customerName : ""}!\n\n` +
    `Seu reagendamento foi solicitado${params.establishmentName ? ` em ${params.establishmentName}` : ""}.\n` +
    `${params.courtName ? params.courtName + "\n" : ""}` +
    `De: ${formatRangePtBr(params.fromStart, params.fromEnd)}\n` +
    `Para: ${formatRangePtBr(params.toStart, params.toEnd)}\n\n` +
    `Ver detalhes: ${params.detailsUrl}\n`;
  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.customerName ? ", <strong>" + escapeHtml(params.customerName) + "</strong>" : ""}!</p>
      <p>Seu reagendamento foi solicitado${params.establishmentName ? ` em <strong>${escapeHtml(params.establishmentName)}</strong>` : ""}.</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        ${params.courtName ? `<div style="font-weight:800;">${escapeHtml(params.courtName)}</div>` : ""}
        <div style="margin-top:8px;color:#374151;"><strong>De:</strong> ${escapeHtml(formatRangePtBr(params.fromStart, params.fromEnd))}</div>
        <div style="color:#374151;"><strong>Para:</strong> ${escapeHtml(formatRangePtBr(params.toStart, params.toEnd))}</div>
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.detailsUrl, "Ver detalhes")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.detailsUrl)}">${escapeHtml(params.detailsUrl)}</a></div>
    `,
  });
  return { subject, text, html };
}

export function monthlyPassPendingEmailToOwner(params: {
  ownerName?: string | null;
  establishmentName?: string | null;
  courtName: string;
  month: string;
  dashboardUrl: string;
}) {
  const subject = "Mensalidade pendente";
  const text =
    `Olá${params.ownerName ? ", " + params.ownerName : ""}!\n\n` +
    `Nova solicitação de mensalidade${params.establishmentName ? ` em ${params.establishmentName}` : ""}:\n` +
    `${params.courtName}\n` +
    `Mês: ${params.month}\n\n` +
    `Abrir painel: ${params.dashboardUrl}\n`;
  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.ownerName ? ", <strong>" + escapeHtml(params.ownerName) + "</strong>" : ""}!</p>
      <p>Nova solicitação de mensalidade${params.establishmentName ? ` em <strong>${escapeHtml(params.establishmentName)}</strong>` : ""}.</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        <div style="font-weight:800;">${escapeHtml(params.courtName)}</div>
        <div style="color:#374151;">Mês: <strong>${escapeHtml(params.month)}</strong></div>
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.dashboardUrl, "Abrir painel")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.dashboardUrl)}">${escapeHtml(params.dashboardUrl)}</a></div>
    `,
  });
  return { subject, text, html };
}

export function monthlyPassConfirmedEmailToCustomer(params: {
  customerName?: string | null;
  courtName: string;
  month: string;
  detailsUrl: string;
}) {
  const subject = "Mensalidade confirmada";
  const text =
    `Olá${params.customerName ? ", " + params.customerName : ""}!\n\n` +
    `Sua mensalidade foi confirmada.\n` +
    `${params.courtName}\n` +
    `Mês: ${params.month}\n\n` +
    `Acompanhar: ${params.detailsUrl}\n`;
  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.customerName ? ", <strong>" + escapeHtml(params.customerName) + "</strong>" : ""}!</p>
      <p>Sua mensalidade foi confirmada.</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        <div style="font-weight:800;">${escapeHtml(params.courtName)}</div>
        <div style="color:#374151;">Mês: <strong>${escapeHtml(params.month)}</strong></div>
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.detailsUrl, "Acompanhar")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.detailsUrl)}">${escapeHtml(params.detailsUrl)}</a></div>
    `,
  });
  return { subject, text, html };
}

export function monthlyPassCancelledEmailToCustomer(params: {
  customerName?: string | null;
  courtName: string;
  month: string;
  detailsUrl: string;
}) {
  const subject = "Mensalidade cancelada";
  const text =
    `Olá${params.customerName ? ", " + params.customerName : ""}!\n\n` +
    `Sua mensalidade foi cancelada.\n` +
    `${params.courtName}\n` +
    `Mês: ${params.month}\n\n` +
    `Acompanhar: ${params.detailsUrl}\n`;
  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.customerName ? ", <strong>" + escapeHtml(params.customerName) + "</strong>" : ""}!</p>
      <p>Sua mensalidade foi cancelada.</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        <div style="font-weight:800;">${escapeHtml(params.courtName)}</div>
        <div style="color:#374151;">Mês: <strong>${escapeHtml(params.month)}</strong></div>
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.detailsUrl, "Acompanhar")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.detailsUrl)}">${escapeHtml(params.detailsUrl)}</a></div>
    `,
  });
  return { subject, text, html };
}

export function customerInviteEmail(params: {
  to: string;
  customerName: string;
  establishmentName: string;
  start: Date;
  end: Date;
  signupUrl: string;
}) {
  const subject = `Seu agendamento no ${params.establishmentName}`;
  const text =
    `Olá, ${params.customerName}!\n\n` +
    `Um agendamento foi criado para você em ${params.establishmentName}:\n` +
    `${formatRangePtBr(params.start, params.end)}\n\n` +
    `Para criar sua conta e acompanhar seus agendamentos, acesse: ${params.signupUrl}\n`;

  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá, <strong>${escapeHtml(params.customerName)}</strong>!</p>
      <p>Um agendamento foi criado para você em <strong>${escapeHtml(params.establishmentName)}</strong>:</p>
      <div style="padding:12px 14px;border:1px solid #e5e7eb;border-radius:14px;background:#fafafa;">
        <div style="color:#374151;">${escapeHtml(formatRangePtBr(params.start, params.end))}</div>
      </div>
      <div style="margin-top:16px;">${buttonHtml(params.signupUrl, "Criar conta e acompanhar")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.signupUrl)}">${escapeHtml(params.signupUrl)}</a></div>
    `,
  });

  return { subject, text, html };
}

export function courtValidatedEmailToOwner(params: {
  ownerName?: string | null;
  courtName: string;
  dashboardUrl: string;
}) {
  const subject = "Quadra validada";
  const text =
    `Olá${params.ownerName ? ", " + params.ownerName : ""}!\n\n` +
    `Sua quadra ${params.courtName} foi validada e está ativa.\n` +
    `Abra o painel para gerenciar: ${params.dashboardUrl}\n`;

  const html = layoutHtml({
    title: subject,
    bodyHtml: `
      <p>Olá${params.ownerName ? ", <strong>" + escapeHtml(params.ownerName) + "</strong>" : ""}!</p>
      <p>Sua quadra <strong>${escapeHtml(params.courtName)}</strong> foi validada e está ativa.</p>
      <div style="margin-top:16px;">${buttonHtml(params.dashboardUrl, "Abrir painel")}</div>
      <div style="margin-top:14px;color:#6b7280;font-size:12px;">Link direto: <a href="${escapeHtml(params.dashboardUrl)}">${escapeHtml(params.dashboardUrl)}</a></div>
    `,
  });

  return { subject, text, html };
}
