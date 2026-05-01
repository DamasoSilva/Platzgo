"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { extractAsaasErrorMessage, getPaymentConfig } from "@/lib/payments";
import { enqueueEmail } from "@/lib/emailQueue";
import {
  getAppUrl,
  tournamentRegistrationPendingEmailToOwner,
  tournamentRegistrationApprovedEmail,
  tournamentRegistrationRejectedEmail,
  tournamentInvitationEmail,
  tournamentCancelledEmail,
} from "@/lib/emailTemplates";
import {
  NotificationType,
  PaymentProvider,
  PaymentStatus,
  SportType,
  TeamMemberRole,
  TournamentFormat,
  TournamentInvitationStatus,
  TournamentMatchStatus,
  TournamentOrganizerType,
  TournamentRegistrationStatus,
  TournamentStatus,
  TournamentVisibility,
} from "@/generated/prisma/enums";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/utils/cpfCnpj";

function toDate(value: string, fieldLabel: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldLabel} invalida`);
  }
  return date;
}

function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function toAsaasValueFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

function parseRules(input?: string | string[]): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((rule) => rule.trim()).filter(Boolean);
  return String(input)
    .split(/\r?\n|;/)
    .map((rule) => rule.trim())
    .filter(Boolean);
}

function parseCategories(input?: string[] | string): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((item) => item.trim()).filter(Boolean);
  return String(input)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const DEFAULT_TOURNAMENT_CATEGORIES = ["Sub-9", "Sub-13", "Sub-15", "Sub-17", "Sub-20", "Livre", "40+"];
const DEFAULT_TOURNAMENT_LEVELS = ["Baixo", "Médio", "Avançado", "Baixo-Médio", "Médio-Avançado", "Livre"];

const VALID_STATUS_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  [TournamentStatus.DRAFT]: [TournamentStatus.OPEN, TournamentStatus.CANCELLED],
  [TournamentStatus.OPEN]: [TournamentStatus.RUNNING, TournamentStatus.DRAFT, TournamentStatus.CANCELLED],
  [TournamentStatus.RUNNING]: [TournamentStatus.FINISHED, TournamentStatus.CANCELLED],
  [TournamentStatus.FINISHED]: [],
  [TournamentStatus.CANCELLED]: [],
};

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function filterAllowed(values: string[], allowed: string[]): string[] {
  const allowedMap = new Map<string, string>();
  for (const item of allowed) {
    const key = normalizeLabel(item);
    if (!key || allowedMap.has(key)) continue;
    allowedMap.set(key, item);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of values) {
    const key = normalizeLabel(item);
    if (!key || !allowedMap.has(key) || seen.has(key)) continue;
    out.push(allowedMap.get(key) ?? item.trim());
    seen.add(key);
  }

  return out;
}

function parseLevels(input?: string[] | string): string[] {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((item) => item.trim()).filter(Boolean);
  return String(input)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

async function ensureAsaasCustomer(userId: string, config: { apiKey?: string; baseUrl?: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, whatsapp_number: true, cpf_cnpj: true, asaas_customer_id: true },
  });

  if (!user) throw new Error("Usuario nao encontrado");
  if (!config.apiKey) throw new Error("Asaas nao configurado");
  const baseUrl = config.baseUrl ?? "https://sandbox.asaas.com/api/v3";
  const cpfCnpj = normalizeCpfCnpj(user.cpf_cnpj ?? "");

  if (!cpfCnpj) {
    throw new Error("CPF/CNPJ e obrigatorio para pagamentos online. Atualize seu perfil.");
  }
  if (!isValidCpfCnpj(cpfCnpj)) {
    throw new Error("CPF/CNPJ invalido. Atualize seu perfil.");
  }

  if (user.asaas_customer_id) {
    const checkRes = await fetch(`${baseUrl}/customers/${user.asaas_customer_id}`, {
      headers: { access_token: config.apiKey },
    }).catch(() => null);
    if (checkRes?.ok) {
      await fetch(`${baseUrl}/customers/${user.asaas_customer_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          access_token: config.apiKey,
        },
        body: JSON.stringify({ cpfCnpj }),
      }).catch(() => null);

      return user.asaas_customer_id;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { asaas_customer_id: null },
      select: { id: true },
    });
  }

  const payload = {
    name: user.name ?? user.email,
    email: user.email,
    phone: onlyDigits(user.whatsapp_number) || undefined,
    cpfCnpj,
  };

  const res = await fetch(`${baseUrl}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  const detail = extractAsaasErrorMessage(data);
  if (!res.ok || !data?.id) {
    throw new Error(detail ? `Falha ao criar cliente no Asaas: ${detail}` : "Falha ao criar cliente no Asaas");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { asaas_customer_id: String(data.id) },
    select: { id: true },
  });

  return String(data.id);
}

async function createAsaasPixCharge(params: {
  referenceId: string;
  amountCents: number;
  customerId: string;
  description: string;
}) {
  const config = await getPaymentConfig();
  if (!config.asaas.apiKey) throw new Error("Asaas nao configurado");

  const customer = await ensureAsaasCustomer(params.customerId, {
    apiKey: config.asaas.apiKey,
    baseUrl: config.asaas.baseUrl,
  });

  const dueDate = new Date().toISOString().slice(0, 10);

  const payload = {
    customer,
    billingType: "PIX",
    value: toAsaasValueFromCents(params.amountCents),
    dueDate,
    description: params.description,
    externalReference: params.referenceId,
  };

  const res = await fetch(`${config.asaas.baseUrl ?? "https://sandbox.asaas.com/api/v3"}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: config.asaas.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  const detail = extractAsaasErrorMessage(data);
  if (!res.ok || !data?.id) {
    throw new Error(detail ? `Falha ao criar cobranca no Asaas: ${detail}` : "Falha ao criar cobranca no Asaas");
  }

  const checkoutUrl = data.invoiceUrl ?? data.paymentLink ?? data.bankSlipUrl ?? null;

  let pixPayload: string | null = null;
  let pixQrBase64: string | null = null;
  let expiresAt: Date | null = null;
  const localExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  try {
    const pixRes = await fetch(
      `${config.asaas.baseUrl ?? "https:/api.asaas.com/api/v3"}/payments/${data.id}/pixQrCode`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          access_token: config.asaas.apiKey,
        },
      }
    );
    const pixData = await pixRes.json().catch(() => null);
    if (pixRes.ok && pixData?.payload) {
      pixPayload = String(pixData.payload);
      pixQrBase64 = typeof pixData.encodedImage === "string" ? pixData.encodedImage : null;
      expiresAt = localExpiresAt;
    }
  } catch {
    // ignore
  }

  return {
    providerPaymentId: String(data.id),
    checkoutUrl,
    pixPayload,
    pixQrBase64,
    expiresAt,
  };
}

export type CreateTournamentInput = {
  name: string;
  description?: string;
  cover_image_url?: string;
  sport_type: SportType;
  start_date: string;
  end_date: string;
  max_teams: number;
  entry_fee_cents: number;
  team_size_min: number;
  team_size_max: number;
  format: TournamentFormat;
  rules?: string[] | string;
  categories?: string[] | string;
  levels?: string[] | string;
  status?: TournamentStatus;
};

export async function createTournamentAsAdmin(input: CreateTournamentInput) {
  const session = await requireRole("ADMIN");

  const name = input.name?.trim();
  if (!name) throw new Error("Nome do torneio e obrigatorio");

  const start = toDate(input.start_date, "Data inicio");
  const end = toDate(input.end_date, "Data fim");
  if (end < start) throw new Error("Data fim deve ser maior ou igual a data inicio");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start < today) throw new Error("Data inicio não pode ser no passado");

  const maxTeams = Math.max(2, Math.floor(input.max_teams));
  const teamSizeMin = Math.max(1, Math.floor(input.team_size_min));
  const teamSizeMax = Math.max(teamSizeMin, Math.floor(input.team_size_max));

  const establishment = await prisma.establishment.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, name: true, address_text: true },
  });

  if (!establishment) {
    throw new Error("Estabelecimento nao encontrado");
  }

  const hasCourtWithSport = await prisma.court.findFirst({
    where: { establishmentId: establishment.id, sport_type: input.sport_type, is_active: true, inactive_reason_id: null },
    select: { id: true },
  });

  if (!hasCourtWithSport) {
    throw new Error("Modalidade invalida para o estabelecimento");
  }

  const rules = parseRules(input.rules);
  const categoriesRaw = parseCategories(input.categories);
  const levelsRaw = parseLevels(input.levels);
  const categories = filterAllowed(categoriesRaw, DEFAULT_TOURNAMENT_CATEGORIES);
  const levels = filterAllowed(levelsRaw, DEFAULT_TOURNAMENT_LEVELS);
  const selectedCategory = categories[0] ?? DEFAULT_TOURNAMENT_CATEGORIES[0] ?? null;
  const selectedLevel = levels[0] ?? DEFAULT_TOURNAMENT_LEVELS[0] ?? null;
  const finalCategories = selectedCategory ? [selectedCategory] : [];
  const finalLevels = selectedLevel ? [selectedLevel] : [];

  const created = await prisma.tournament.create({
    data: {
      organizer_user_id: session.user.id,
      organizer_type: TournamentOrganizerType.ESTABLISHMENT,
      establishmentId: establishment.id,
      visibility: TournamentVisibility.PUBLIC,
      status: input.status ?? TournamentStatus.DRAFT,
      name,
      description: input.description?.trim() || null,
      cover_image_url: input.cover_image_url?.trim() || null,
      sport_type: input.sport_type,
      start_date: start,
      end_date: end,
      location_name: establishment.name,
      city: establishment.address_text,
      max_teams: maxTeams,
      entry_fee_cents: toCents(input.entry_fee_cents),
      team_size_min: teamSizeMin,
      team_size_max: teamSizeMax,
      format: input.format,
      rules,
      categories: finalCategories.length
        ? {
            createMany: {
              data: finalCategories.map((label) => ({ label })),
            },
          }
        : undefined,
      levels: finalLevels.length
        ? {
            createMany: {
              data: finalLevels.map((label) => ({ label })),
            },
          }
        : undefined,
    },
    select: { id: true },
  });

  revalidatePath("/dashboard/torneios");
  revalidatePath("/torneios");
  return { id: created.id };
}

export type InternalTournamentTeamInput = {
  name: string;
  players: Array<{ fullName: string; documentId: string }>;
};

export type CreateInternalTournamentInput = {
  name: string;
  sport_type: SportType;
  start_date: string;
  team_size: number;
  rules?: string;
  teams: InternalTournamentTeamInput[];
  invites?: string[];
  status?: TournamentStatus;
};

export async function createInternalTournament(input: CreateInternalTournamentInput) {
  const session = await requireRole("CUSTOMER");

  const name = input.name?.trim();
  if (!name) throw new Error("Nome do torneio e obrigatorio");

  const start = toDate(input.start_date, "Data");
  const teamSize = Math.max(2, Math.floor(input.team_size));

  const rules = parseRules(input.rules);
  const invites = (input.invites ?? []).map((item) => item.trim()).filter(Boolean);

  const created = await prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.create({
      data: {
        organizer_user_id: session.user.id,
        organizer_type: TournamentOrganizerType.CUSTOMER,
        visibility: TournamentVisibility.PRIVATE,
        status: input.status ?? TournamentStatus.OPEN,
        name,
        description: null,
        sport_type: input.sport_type,
        start_date: start,
        end_date: start,
        location_name: null,
        city: null,
        max_teams: Math.max(2, input.teams.length || 2),
        entry_fee_cents: 0,
        team_size_min: teamSize,
        team_size_max: teamSize,
        format: TournamentFormat.GROUPS_KO,
        rules,
      },
      select: { id: true },
    });

    const teams = input.teams.filter((team) => team.name.trim());

    for (const team of teams) {
      const teamCreated = await tx.team.create({
        data: {
          tournamentId: tournament.id,
          name: team.name.trim(),
          created_by_id: session.user.id,
        },
        select: { id: true },
      });

      const members = team.players
        .map((player) => ({
          full_name: player.fullName.trim(),
          document_id: player.documentId.trim(),
        }))
        .filter((player) => player.full_name && player.document_id)
        .map((player, index) => ({
          teamId: teamCreated.id,
          full_name: player.full_name,
          document_id: player.document_id,
          role: index === 0 ? TeamMemberRole.CAPTAIN : TeamMemberRole.PLAYER,
        }));

      if (members.length) {
        await tx.teamMember.createMany({ data: members });
      }
    }

    if (invites.length) {
      await tx.tournamentInvitation.createMany({
        data: invites.map((contact) => ({
          tournamentId: tournament.id,
          invited_by_id: session.user.id,
          contact,
          status: TournamentInvitationStatus.PENDING,
          token: crypto.randomBytes(16).toString("hex"),
        })),
      });
    }

    return tournament;
  });

  revalidatePath("/torneios");
  return { id: created.id };
}

export type RegisterTeamInput = {
  tournamentId: string;
  teamName: string;
  categoryLabel?: string;
  levelLabel?: string;
  players: Array<{ fullName: string; documentId: string }>;
};

export async function registerTeamForTournament(input: RegisterTeamInput) {
  const session = await requireRole("CUSTOMER");

  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    select: {
      id: true,
      name: true,
      status: true,
      visibility: true,
      organizer_user_id: true,
      entry_fee_cents: true,
      team_size_min: true,
      team_size_max: true,
      max_teams: true,
      categories: { select: { label: true } },
      levels: { select: { label: true } },
      establishment: {
        select: {
          owner: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!tournament) throw new Error("Torneio nao encontrado");
  if (tournament.visibility === TournamentVisibility.PUBLIC && tournament.status !== TournamentStatus.OPEN) {
    throw new Error("Inscricoes fechadas");
  }

  if (tournament.visibility === TournamentVisibility.PRIVATE) {
    if (tournament.status !== TournamentStatus.OPEN) {
      throw new Error("Inscricoes fechadas");
    }
    const invited = await prisma.tournamentInvitation.findFirst({
      where: {
        tournamentId: tournament.id,
        contact: session.user.email ?? "",
        status: TournamentInvitationStatus.PENDING,
      },
      select: { id: true },
    });
    const isOrganizer = tournament.organizer_user_id === session.user.id;
    if (!invited && !isOrganizer) {
      throw new Error("Torneio privado: voce precisa de um convite para se inscrever");
    }
  }

  const teamName = input.teamName?.trim();
  if (!teamName) throw new Error("Nome do time e obrigatorio");

  const players = input.players
    .map((player) => ({ full_name: player.fullName.trim(), document_id: player.documentId.trim() }))
    .filter((player) => player.full_name && player.document_id);

  if (players.length < tournament.team_size_min || players.length > tournament.team_size_max) {
    throw new Error("Quantidade de jogadores fora do limite do torneio");
  }

  const documentIds = players.map((p) => p.document_id);
  if (new Set(documentIds).size !== documentIds.length) {
    throw new Error("Documentos duplicados: cada jogador deve ter um documento unico");
  }

  if (input.categoryLabel && !tournament.categories.some((cat) => cat.label === input.categoryLabel)) {
    throw new Error("Categoria invalida");
  }

  if (tournament.levels.length && !input.levelLabel) {
    throw new Error("Nivel obrigatorio");
  }

  if (input.levelLabel && !tournament.levels.some((level) => level.label === input.levelLabel)) {
    throw new Error("Nivel invalido");
  }

  const registration = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournament.id} FOR UPDATE`;

    const currentCount = await tx.tournamentRegistration.count({ where: { tournamentId: tournament.id } });
    if (currentCount >= tournament.max_teams) {
      throw new Error("Limite de times atingido");
    }

    const already = await tx.team.findFirst({
      where: { tournamentId: tournament.id, name: teamName },
      select: { id: true },
    });
    if (already) throw new Error("Nome do time ja utilizado");

    const team = await tx.team.create({
      data: {
        tournamentId: tournament.id,
        name: teamName,
        category_label: input.categoryLabel?.trim() || null,
        level_label: input.levelLabel?.trim() || null,
        created_by_id: session.user.id,
      },
      select: { id: true },
    });

    await tx.teamMember.createMany({
      data: players.map((player, index) => ({
        teamId: team.id,
        full_name: player.full_name,
        document_id: player.document_id,
        role: index === 0 ? TeamMemberRole.CAPTAIN : TeamMemberRole.PLAYER,
      })),
    });

    return tx.tournamentRegistration.create({
      data: {
        tournamentId: tournament.id,
        teamId: team.id,
        createdById: session.user.id,
        status: TournamentRegistrationStatus.PENDING,
        paid: tournament.entry_fee_cents <= 0,
      },
      select: { id: true },
    });
  });

  let payment: {
    id: string;
    checkoutUrl: string | null;
    pixPayload: string | null;
    pixQrBase64: string | null;
    expiresAt: string | null;
  } | null = null;

  if (tournament.entry_fee_cents > 0) {
    const asaasPayment = await createAsaasPixCharge({
      referenceId: registration.id,
      amountCents: tournament.entry_fee_cents,
      customerId: session.user.id,
      description: `Inscricao torneio ${tournament.name}`,
    });

    const paymentRecord = await prisma.payment.create({
      data: {
        tournamentRegistrationId: registration.id,
        provider: PaymentProvider.ASAAS,
        status: PaymentStatus.PENDING,
        amount_cents: tournament.entry_fee_cents,
        provider_payment_id: asaasPayment.providerPaymentId,
        checkout_url: asaasPayment.checkoutUrl,
        expires_at: asaasPayment.expiresAt,
        metadata: {
          pix_payload: asaasPayment.pixPayload,
          pix_qr_base64: asaasPayment.pixQrBase64,
        },
      },
      select: { id: true },
    });

    payment = {
      id: paymentRecord.id,
      checkoutUrl: asaasPayment.checkoutUrl,
      pixPayload: asaasPayment.pixPayload,
      pixQrBase64: asaasPayment.pixQrBase64,
      expiresAt: asaasPayment.expiresAt ? asaasPayment.expiresAt.toISOString() : null,
    };
  }

  revalidatePath(`/torneios/${tournament.id}`);
  revalidatePath(`/torneios/${tournament.id}/inscricao`);

  // Notificar dono do estabelecimento sobre nova inscrição
  const owner = tournament.establishment?.owner;
  if (owner) {
    const appUrl = getAppUrl();
    await prisma.notification.create({
      data: {
        userId: owner.id,
        type: NotificationType.TOURNAMENT_REGISTRATION_PENDING,
        title: "Nova inscrição no torneio",
        body: `O time "${teamName}" se inscreveu no torneio ${tournament.name}.`,
      },
      select: { id: true },
    }).catch(() => null);

    if (owner.email) {
      const { subject, text, html } = tournamentRegistrationPendingEmailToOwner({
        ownerName: owner.name,
        tournamentName: tournament.name,
        teamName,
        dashboardUrl: `${appUrl}/dashboard/torneios/${tournament.id}`,
      });
      await enqueueEmail({
        to: owner.email,
        subject, text, html,
        dedupeKey: `tournament:reg-pending:${registration.id}`,
      }).catch(() => null);
    }
  }

  return { registrationId: registration.id, payment };
}

export async function createTournamentInvitations(input: { tournamentId: string; contacts: string[] }) {
  const session = await requireRole("CUSTOMER");

  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    select: { id: true, name: true, organizer_user_id: true, visibility: true },
  });

  if (!tournament) throw new Error("Torneio nao encontrado");
  if (tournament.organizer_user_id !== session.user.id || tournament.visibility !== TournamentVisibility.PRIVATE) {
    throw new Error("Sem permissao");
  }

  const contacts = input.contacts.map((item) => item.trim()).filter(Boolean);
  if (!contacts.length) return { count: 0 };

  const invitations = contacts.map((contact) => ({
    tournamentId: tournament.id,
    invited_by_id: session.user.id,
    contact,
    status: TournamentInvitationStatus.PENDING,
    token: crypto.randomBytes(16).toString("hex"),
  }));

  await prisma.tournamentInvitation.createMany({ data: invitations });

  // Enviar email de convite para contatos que sao emails
  const appUrl = getAppUrl();
  for (const inv of invitations) {
    if (inv.contact.includes("@")) {
      const link = `${appUrl}/torneios/convite/${inv.token}`;
      const { subject, text, html } = tournamentInvitationEmail({
        tournamentName: tournament.name,
        organizerName: session.user.name ?? "Organizador",
        inviteUrl: link,
      });
      await enqueueEmail({
        to: inv.contact,
        subject, text, html,
        dedupeKey: `tournament:invite:${tournament.id}:${inv.contact}`,
      }).catch(() => null);
    }
  }

  revalidatePath(`/torneios/${tournament.id}`);
  return { count: contacts.length };
}

export async function setTournamentStatus(input: { tournamentId: string; status: TournamentStatus }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Nao autenticado");

  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    select: {
      id: true,
      status: true,
      organizer_user_id: true,
      organizer_type: true,
      establishment: { select: { ownerId: true } },
    },
  });

  if (!tournament) throw new Error("Torneio nao encontrado");

  const isAdmin = session.user.role === "ADMIN" || session.user.role === "SYSADMIN";
  const isOwner = tournament.organizer_type === TournamentOrganizerType.ESTABLISHMENT
    ? isAdmin && tournament.establishment?.ownerId === session.user.id
    : tournament.organizer_user_id === session.user.id;

  if (!isOwner) throw new Error("Sem permissao");

  const currentStatus = tournament.status as TournamentStatus;
  const allowed = VALID_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(input.status)) {
    throw new Error(`Transição de status inválida: ${currentStatus} → ${input.status}`);
  }

  await prisma.tournament.update({
    where: { id: tournament.id },
    data: { status: input.status },
    select: { id: true },
  });

  // Notificar todos os times quando torneio for cancelado
  if (input.status === TournamentStatus.CANCELLED) {
    const regs = await prisma.tournamentRegistration.findMany({
      where: {
        tournamentId: tournament.id,
        status: { in: [TournamentRegistrationStatus.PENDING, TournamentRegistrationStatus.APPROVED] },
      },
      select: {
        createdById: true,
        createdBy: { select: { name: true, email: true } },
      },
    });

    const tName = (await prisma.tournament.findUnique({ where: { id: tournament.id }, select: { name: true } }))?.name ?? "";

    await prisma.tournamentRegistration.updateMany({
      where: {
        tournamentId: tournament.id,
        status: { in: [TournamentRegistrationStatus.PENDING, TournamentRegistrationStatus.APPROVED] },
      },
      data: { status: TournamentRegistrationStatus.CANCELLED },
    });

    for (const reg of regs) {
      if (reg.createdById) {
        await prisma.notification.create({
          data: {
            userId: reg.createdById,
            type: NotificationType.TOURNAMENT_CANCELLED,
            title: "Torneio cancelado",
            body: `O torneio "${tName}" foi cancelado.`,
          },
          select: { id: true },
        }).catch(() => null);

        if (reg.createdBy?.email) {
          const { subject, text, html } = tournamentCancelledEmail({
            customerName: reg.createdBy.name,
            tournamentName: tName,
          });
          await enqueueEmail({
            to: reg.createdBy.email,
            subject, text, html,
            dedupeKey: `tournament:cancelled:${tournament.id}:${reg.createdById}`,
          }).catch(() => null);
        }
      }
    }
  }

  revalidatePath(`/dashboard/torneios/${tournament.id}`);
  revalidatePath(`/torneios/${tournament.id}`);
  return { ok: true };
}

export async function setTournamentRegistrationStatus(input: {
  registrationId: string;
  status: TournamentRegistrationStatus;
}) {
  const session = await requireRole("ADMIN");

  const registration = await prisma.tournamentRegistration.findUnique({
    where: { id: input.registrationId },
    select: {
      id: true,
      createdById: true,
      tournament: {
        select: {
          id: true,
          name: true,
          establishment: { select: { ownerId: true } },
        },
      },
      team: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });

  if (!registration) throw new Error("Inscricao nao encontrada");
  if (registration.tournament.establishment?.ownerId !== session.user.id && session.user.role !== "SYSADMIN") {
    throw new Error("Sem permissao");
  }

  await prisma.tournamentRegistration.update({
    where: { id: registration.id },
    data: { status: input.status, approvedById: session.user.id },
    select: { id: true },
  });

  // Notificar cliente sobre aprovação/rejeição
  const appUrl = getAppUrl();
  const isApproved = input.status === TournamentRegistrationStatus.APPROVED;
  const isRejected = input.status === TournamentRegistrationStatus.REJECTED;

  if ((isApproved || isRejected) && registration.createdById) {
    await prisma.notification.create({
      data: {
        userId: registration.createdById,
        type: isApproved
          ? NotificationType.TOURNAMENT_REGISTRATION_APPROVED
          : NotificationType.TOURNAMENT_REGISTRATION_REJECTED,
        title: isApproved ? "Inscrição aprovada" : "Inscrição recusada",
        body: isApproved
          ? `Seu time "${registration.team.name}" foi aprovado no torneio ${registration.tournament.name}.`
          : `Seu time "${registration.team.name}" foi recusado no torneio ${registration.tournament.name}.`,
      },
      select: { id: true },
    }).catch(() => null);

    const email = registration.createdBy?.email;
    if (email) {
      const detailsUrl = `${appUrl}/torneios/${registration.tournament.id}`;
      const templateFn = isApproved ? tournamentRegistrationApprovedEmail : tournamentRegistrationRejectedEmail;
      const { subject, text, html } = templateFn({
        customerName: registration.createdBy?.name,
        tournamentName: registration.tournament.name,
        teamName: registration.team.name,
        detailsUrl,
      });
      await enqueueEmail({
        to: email,
        subject, text, html,
        dedupeKey: `tournament:reg-${input.status.toLowerCase()}:${registration.id}`,
      }).catch(() => null);
    }
  }

  revalidatePath(`/dashboard/torneios/${registration.tournament.id}`);
  return { ok: true };
}

// ──────────────────────────────────────────────
// EDIT TOURNAMENT
// ──────────────────────────────────────────────

export type UpdateTournamentInput = {
  tournamentId: string;
  name?: string;
  description?: string;
  cover_image_url?: string | null;
  end_date?: string;
  max_teams?: number;
  rules?: string[] | string;
};

export async function updateTournament(input: UpdateTournamentInput) {
  const session = await requireRole("ADMIN");

  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    select: {
      id: true,
      status: true,
      establishment: { select: { ownerId: true } },
    },
  });

  if (!tournament) throw new Error("Torneio nao encontrado");
  if (tournament.establishment?.ownerId !== session.user.id && session.user.role !== "SYSADMIN") {
    throw new Error("Sem permissao");
  }
  if (tournament.status === TournamentStatus.FINISHED || tournament.status === TournamentStatus.CANCELLED) {
    throw new Error("Torneio finalizado ou cancelado nao pode ser editado");
  }

  const data: Record<string, unknown> = {};
  if (input.name?.trim()) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.cover_image_url !== undefined) data.cover_image_url = input.cover_image_url?.trim() || null;
  if (input.end_date) {
    const end = toDate(input.end_date, "Data fim");
    data.end_date = end;
  }
  if (input.max_teams != null) data.max_teams = Math.max(2, Math.floor(input.max_teams));
  if (input.rules !== undefined) data.rules = parseRules(input.rules);

  if (!Object.keys(data).length) throw new Error("Nenhum campo para atualizar");

  await prisma.tournament.update({
    where: { id: tournament.id },
    data,
    select: { id: true },
  });

  revalidatePath(`/dashboard/torneios/${tournament.id}`);
  revalidatePath(`/torneios/${tournament.id}`);
  return { ok: true };
}

// ──────────────────────────────────────────────
// CANCEL TOURNAMENT
// ──────────────────────────────────────────────

export async function cancelTournament(input: { tournamentId: string }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Nao autenticado");

  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    select: {
      id: true,
      name: true,
      status: true,
      organizer_user_id: true,
      organizer_type: true,
      establishment: { select: { ownerId: true } },
      registrations: {
        where: { status: { in: [TournamentRegistrationStatus.PENDING, TournamentRegistrationStatus.APPROVED] } },
        select: {
          id: true,
          createdById: true,
          createdBy: { select: { name: true, email: true } },
          team: { select: { name: true } },
        },
      },
    },
  });

  if (!tournament) throw new Error("Torneio nao encontrado");

  const isAdmin = session.user.role === "ADMIN" || session.user.role === "SYSADMIN";
  const isOwner = tournament.organizer_type === TournamentOrganizerType.ESTABLISHMENT
    ? isAdmin && tournament.establishment?.ownerId === session.user.id
    : tournament.organizer_user_id === session.user.id;
  if (!isOwner) throw new Error("Sem permissao");

  const currentStatus = tournament.status as TournamentStatus;
  const allowed = VALID_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(TournamentStatus.CANCELLED)) {
    throw new Error("Este torneio nao pode ser cancelado");
  }

  await prisma.$transaction(async (tx) => {
    await tx.tournament.update({
      where: { id: tournament.id },
      data: { status: TournamentStatus.CANCELLED },
      select: { id: true },
    });

    if (tournament.registrations.length) {
      await tx.tournamentRegistration.updateMany({
        where: {
          tournamentId: tournament.id,
          status: { in: [TournamentRegistrationStatus.PENDING, TournamentRegistrationStatus.APPROVED] },
        },
        data: { status: TournamentRegistrationStatus.CANCELLED },
      });
    }

    await tx.tournamentMatch.updateMany({
      where: { tournamentId: tournament.id, status: TournamentMatchStatus.SCHEDULED },
      data: { status: TournamentMatchStatus.CANCELLED },
    });
  });

  // Notificar clientes inscritos
  const appUrl = getAppUrl();
  for (const reg of tournament.registrations) {
    if (reg.createdById) {
      await prisma.notification.create({
        data: {
          userId: reg.createdById,
          type: NotificationType.TOURNAMENT_CANCELLED,
          title: "Torneio cancelado",
          body: `O torneio "${tournament.name}" foi cancelado.`,
        },
        select: { id: true },
      }).catch(() => null);

      if (reg.createdBy?.email) {
        const { subject, text, html } = tournamentCancelledEmail({
          customerName: reg.createdBy.name,
          tournamentName: tournament.name,
        });
        await enqueueEmail({
          to: reg.createdBy.email,
          subject, text, html,
          dedupeKey: `tournament:cancelled:${tournament.id}:${reg.createdById}`,
        }).catch(() => null);
      }
    }
  }

  revalidatePath("/dashboard/torneios");
  revalidatePath("/torneios");
  return { ok: true };
}

// ──────────────────────────────────────────────
// INVITE ACCEPTANCE FLOW
// ──────────────────────────────────────────────

export async function acceptTournamentInvitation(input: { token: string }) {
  const session = await requireRole("CUSTOMER");

  const invitation = await prisma.tournamentInvitation.findUnique({
    where: { token: input.token },
    select: {
      id: true,
      tournamentId: true,
      status: true,
      expires_at: true,
      tournament: { select: { id: true, name: true, status: true, visibility: true } },
    },
  });

  if (!invitation) throw new Error("Convite nao encontrado");
  if (invitation.status !== TournamentInvitationStatus.PENDING) {
    throw new Error("Convite ja utilizado ou expirado");
  }
  if (invitation.expires_at && invitation.expires_at < new Date()) {
    await prisma.tournamentInvitation.update({
      where: { id: invitation.id },
      data: { status: TournamentInvitationStatus.EXPIRED },
      select: { id: true },
    });
    throw new Error("Convite expirado");
  }
  if (invitation.tournament.status !== TournamentStatus.OPEN) {
    throw new Error("Inscricoes fechadas para este torneio");
  }

  await prisma.tournamentInvitation.update({
    where: { id: invitation.id },
    data: { status: TournamentInvitationStatus.ACCEPTED },
    select: { id: true },
  });

  revalidatePath(`/torneios/${invitation.tournamentId}`);
  return { ok: true, tournamentId: invitation.tournamentId, tournamentName: invitation.tournament.name };
}

// ──────────────────────────────────────────────
// PLAYER SUBSTITUTION
// ──────────────────────────────────────────────

export async function replaceTeamMember(input: {
  teamId: string;
  memberId: string;
  newFullName: string;
  newDocumentId: string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Nao autenticado");

  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: {
      id: true,
      created_by_id: true,
      tournament: {
        select: {
          id: true,
          status: true,
          establishment: { select: { ownerId: true } },
        },
      },
      members: { select: { id: true, document_id: true } },
    },
  });

  if (!team) throw new Error("Time nao encontrado");

  const isAdmin = session.user.role === "ADMIN" || session.user.role === "SYSADMIN";
  const isTeamCreator = team.created_by_id === session.user.id;
  const isEstabOwner = isAdmin && team.tournament.establishment?.ownerId === session.user.id;
  if (!isTeamCreator && !isEstabOwner) throw new Error("Sem permissao");

  if (team.tournament.status === TournamentStatus.FINISHED || team.tournament.status === TournamentStatus.CANCELLED) {
    throw new Error("Torneio finalizado ou cancelado");
  }

  const member = team.members.find((m) => m.id === input.memberId);
  if (!member) throw new Error("Jogador nao encontrado no time");

  const newName = input.newFullName?.trim();
  const newDoc = input.newDocumentId?.trim();
  if (!newName || !newDoc) throw new Error("Nome e documento sao obrigatorios");

  const duplicateDoc = team.members.find((m) => m.id !== input.memberId && m.document_id === newDoc);
  if (duplicateDoc) throw new Error("Documento ja utilizado por outro jogador do time");

  await prisma.teamMember.update({
    where: { id: input.memberId },
    data: { full_name: newName, document_id: newDoc },
    select: { id: true },
  });

  revalidatePath(`/torneios/${team.tournament.id}`);
  revalidatePath(`/dashboard/torneios/${team.tournament.id}`);
  return { ok: true };
}

// ──────────────────────────────────────────────
// MATCH MANAGEMENT
// ──────────────────────────────────────────────

export async function createTournamentMatch(input: {
  tournamentId: string;
  round: string;
  group_label?: string;
  courtId?: string;
  start_time: string;
  end_time: string;
  teamAId?: string;
  teamBId?: string;
}) {
  const session = await requireRole("ADMIN");

  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    select: {
      id: true,
      status: true,
      establishment: { select: { ownerId: true } },
    },
  });

  if (!tournament) throw new Error("Torneio nao encontrado");
  if (tournament.establishment?.ownerId !== session.user.id && session.user.role !== "SYSADMIN") {
    throw new Error("Sem permissao");
  }
  if (tournament.status !== TournamentStatus.OPEN && tournament.status !== TournamentStatus.RUNNING) {
    throw new Error("Torneio deve estar aberto ou em andamento para agendar partidas");
  }

  const start = toDate(input.start_time, "Horario inicio");
  const end = toDate(input.end_time, "Horario fim");
  if (end <= start) throw new Error("Horario fim deve ser posterior ao inicio");

  const round = input.round?.trim();
  if (!round) throw new Error("Rodada e obrigatoria");

  const match = await prisma.tournamentMatch.create({
    data: {
      tournamentId: tournament.id,
      round,
      group_label: input.group_label?.trim() || null,
      courtId: input.courtId || null,
      start_time: start,
      end_time: end,
      teamAId: input.teamAId || null,
      teamBId: input.teamBId || null,
      status: TournamentMatchStatus.SCHEDULED,
    },
    select: { id: true },
  });

  revalidatePath(`/dashboard/torneios/${tournament.id}`);
  revalidatePath(`/torneios/${tournament.id}`);
  return { id: match.id };
}

export async function generateTournamentMatches(input: { tournamentId: string }) {
  const session = await requireRole("ADMIN");

  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    select: {
      id: true,
      format: true,
      status: true,
      start_date: true,
      establishment: {
        select: {
          ownerId: true,
          courts: { where: { is_active: true }, select: { id: true, name: true }, take: 10 },
        },
      },
      registrations: {
        where: { status: TournamentRegistrationStatus.APPROVED },
        select: { team: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!tournament) throw new Error("Torneio nao encontrado");
  if (tournament.establishment?.ownerId !== session.user.id && session.user.role !== "SYSADMIN") {
    throw new Error("Sem permissao");
  }

  const teams = tournament.registrations.map((r) => r.team);
  if (teams.length < 2) throw new Error("E necessario pelo menos 2 times aprovados");

  // Limpar partidas existentes antes de regerar
  await prisma.tournamentMatch.deleteMany({
    where: { tournamentId: tournament.id, status: TournamentMatchStatus.SCHEDULED },
  });

  const courts = tournament.establishment?.courts ?? [];
  const defaultCourtId = courts[0]?.id ?? null;
  const matchDate = tournament.start_date;

  const matchesData: Array<{
    tournamentId: string;
    round: string;
    group_label: string | null;
    courtId: string | null;
    start_time: Date;
    end_time: Date;
    teamAId: string;
    teamBId: string;
    status: TournamentMatchStatus;
  }> = [];

  if (tournament.format === TournamentFormat.SINGLE_ELIM || tournament.format === TournamentFormat.GROUPS_KO) {
    // Eliminatória simples: gerar bracket
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    let roundNum = 1;
    let roundTeams = shuffled;

    while (roundTeams.length >= 2) {
      const roundLabel = roundTeams.length === 2 ? "Final" : roundTeams.length <= 4 ? "Semifinal" : `Rodada ${roundNum}`;
      for (let i = 0; i < roundTeams.length - 1; i += 2) {
        const courtId = courts.length > 0 ? courts[i % courts.length]?.id ?? defaultCourtId : defaultCourtId;
        const hour = 8 + Math.floor(i / 2);
        const startTime = new Date(matchDate);
        startTime.setDate(startTime.getDate() + roundNum - 1);
        startTime.setHours(hour, 0, 0, 0);
        const endTime = new Date(startTime);
        endTime.setHours(hour + 1);

        matchesData.push({
          tournamentId: tournament.id,
          round: roundLabel,
          group_label: null,
          courtId,
          start_time: startTime,
          end_time: endTime,
          teamAId: roundTeams[i].id,
          teamBId: roundTeams[i + 1].id,
          status: TournamentMatchStatus.SCHEDULED,
        });
      }
      roundTeams = roundTeams.slice(0, Math.ceil(roundTeams.length / 2));
      roundNum++;
    }
  } else {
    // Liga / pontos corridos: todos contra todos
    let matchIdx = 0;
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const courtId = courts.length > 0 ? courts[matchIdx % courts.length]?.id ?? defaultCourtId : defaultCourtId;
        const day = Math.floor(matchIdx / 4);
        const slot = matchIdx % 4;
        const startTime = new Date(matchDate);
        startTime.setDate(startTime.getDate() + day);
        startTime.setHours(8 + slot * 2, 0, 0, 0);
        const endTime = new Date(startTime);
        endTime.setHours(startTime.getHours() + 1);

        matchesData.push({
          tournamentId: tournament.id,
          round: `Rodada ${day + 1}`,
          group_label: null,
          courtId,
          start_time: startTime,
          end_time: endTime,
          teamAId: teams[i].id,
          teamBId: teams[j].id,
          status: TournamentMatchStatus.SCHEDULED,
        });
        matchIdx++;
      }
    }
  }

  if (matchesData.length) {
    await prisma.tournamentMatch.createMany({ data: matchesData });
  }

  // Inicializar standings para todos os times
  for (const team of teams) {
    await prisma.tournamentStanding.upsert({
      where: { tournamentId_teamId: { tournamentId: tournament.id, teamId: team.id } },
      create: { tournamentId: tournament.id, teamId: team.id, points: 0, wins: 0, losses: 0, goals: 0 },
      update: { points: 0, wins: 0, losses: 0, goals: 0 },
    });
  }

  revalidatePath(`/dashboard/torneios/${tournament.id}`);
  revalidatePath(`/torneios/${tournament.id}`);
  return { count: matchesData.length };
}

// ──────────────────────────────────────────────
// SCORE & STANDINGS
// ──────────────────────────────────────────────

export async function recordMatchScore(input: {
  matchId: string;
  teamAScore: number;
  teamBScore: number;
}) {
  const session = await requireRole("ADMIN");

  const match = await prisma.tournamentMatch.findUnique({
    where: { id: input.matchId },
    select: {
      id: true,
      status: true,
      teamAId: true,
      teamBId: true,
      tournamentId: true,
      tournament: {
        select: {
          establishment: { select: { ownerId: true } },
        },
      },
      score: { select: { id: true } },
    },
  });

  if (!match) throw new Error("Partida nao encontrada");
  if (match.tournament.establishment?.ownerId !== session.user.id && session.user.role !== "SYSADMIN") {
    throw new Error("Sem permissao");
  }
  if (match.status === TournamentMatchStatus.CANCELLED) {
    throw new Error("Partida cancelada");
  }

  const scoreA = Math.max(0, Math.floor(input.teamAScore));
  const scoreB = Math.max(0, Math.floor(input.teamBScore));

  await prisma.$transaction(async (tx) => {
    if (match.score) {
      await tx.tournamentScore.update({
        where: { id: match.score.id },
        data: { team_a_score: scoreA, team_b_score: scoreB },
      });
    } else {
      await tx.tournamentScore.create({
        data: {
          matchId: match.id,
          team_a_score: scoreA,
          team_b_score: scoreB,
        },
      });
    }

    await tx.tournamentMatch.update({
      where: { id: match.id },
      data: { status: TournamentMatchStatus.FINISHED },
      select: { id: true },
    });
  });

  // Recalcular standings
  await recalculateStandings(match.tournamentId);

  revalidatePath(`/dashboard/torneios/${match.tournamentId}`);
  revalidatePath(`/torneios/${match.tournamentId}`);
  return { ok: true };
}

async function recalculateStandings(tournamentId: string) {
  const matches = await prisma.tournamentMatch.findMany({
    where: { tournamentId, status: TournamentMatchStatus.FINISHED },
    select: {
      teamAId: true,
      teamBId: true,
      score: { select: { team_a_score: true, team_b_score: true } },
    },
  });

  const stats = new Map<string, { points: number; wins: number; losses: number; goals: number }>();

  for (const m of matches) {
    if (!m.teamAId || !m.teamBId || !m.score) continue;

    if (!stats.has(m.teamAId)) stats.set(m.teamAId, { points: 0, wins: 0, losses: 0, goals: 0 });
    if (!stats.has(m.teamBId)) stats.set(m.teamBId, { points: 0, wins: 0, losses: 0, goals: 0 });

    const a = stats.get(m.teamAId)!;
    const b = stats.get(m.teamBId)!;

    a.goals += m.score.team_a_score;
    b.goals += m.score.team_b_score;

    if (m.score.team_a_score > m.score.team_b_score) {
      a.wins++; a.points += 3;
      b.losses++;
    } else if (m.score.team_b_score > m.score.team_a_score) {
      b.wins++; b.points += 3;
      a.losses++;
    } else {
      a.points += 1;
      b.points += 1;
    }
  }

  for (const [teamId, s] of stats) {
    await prisma.tournamentStanding.upsert({
      where: { tournamentId_teamId: { tournamentId, teamId } },
      create: { tournamentId, teamId, ...s },
      update: s,
    });
  }
}

// ──────────────────────────────────────────────
// QUERIES
// ──────────────────────────────────────────────

export async function getTournamentStandings(tournamentId: string) {
  const standings = await prisma.tournamentStanding.findMany({
    where: { tournamentId },
    select: {
      teamId: true,
      team: { select: { name: true } },
      points: true,
      wins: true,
      losses: true,
      goals: true,
    },
    orderBy: [{ points: "desc" }, { wins: "desc" }, { goals: "desc" }],
  });

  return standings.map((s) => ({
    teamId: s.teamId,
    teamName: s.team.name,
    points: s.points,
    wins: s.wins,
    losses: s.losses,
    goals: s.goals,
  }));
}
