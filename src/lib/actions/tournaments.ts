"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { getPaymentConfig } from "@/lib/payments";
import {
  PaymentProvider,
  PaymentStatus,
  SportType,
  TeamMemberRole,
  TournamentFormat,
  TournamentInvitationStatus,
  TournamentOrganizerType,
  TournamentRegistrationStatus,
  TournamentStatus,
  TournamentVisibility,
} from "@/generated/prisma/enums";

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

function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

async function ensureAsaasCustomer(userId: string, config: { apiKey?: string; baseUrl?: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, whatsapp_number: true, asaas_customer_id: true },
  });

  if (!user) throw new Error("Usuario nao encontrado");
  if (!config.apiKey) throw new Error("Asaas nao configurado");
  const baseUrl = config.baseUrl ?? "https://sandbox.asaas.com/api/v3";

  if (user.asaas_customer_id) {
    const checkRes = await fetch(`${baseUrl}/customers/${user.asaas_customer_id}`, {
      headers: { access_token: config.apiKey },
    }).catch(() => null);
    if (checkRes?.ok) return user.asaas_customer_id;

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
  if (!res.ok || !data?.id) {
    throw new Error("Falha ao criar cliente no Asaas");
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
  if (!res.ok || !data?.id) {
    throw new Error("Falha ao criar cobranca no Asaas");
  }

  const checkoutUrl = data.invoiceUrl ?? data.paymentLink ?? data.bankSlipUrl ?? null;

  let pixPayload: string | null = null;
  let pixQrBase64: string | null = null;
  let expiresAt: Date | null = null;
  try {
    const pixRes = await fetch(
      `${config.asaas.baseUrl ?? "https://sandbox.asaas.com/api/v3"}/payments/${data.id}/pixQrCode`,
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
      if (pixData.expirationDate) {
        const parsed = new Date(pixData.expirationDate);
        expiresAt = Number.isNaN(parsed.getTime()) ? null : parsed;
      }
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
  status?: TournamentStatus;
};

export async function createTournamentAsAdmin(input: CreateTournamentInput) {
  const session = await requireRole("ADMIN");

  const name = input.name?.trim();
  if (!name) throw new Error("Nome do torneio e obrigatorio");

  const start = toDate(input.start_date, "Data inicio");
  const end = toDate(input.end_date, "Data fim");
  if (end < start) throw new Error("Data fim deve ser maior ou igual a data inicio");

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

  const rules = parseRules(input.rules);
  const categories = parseCategories(input.categories);

  const created = await prisma.tournament.create({
    data: {
      organizer_user_id: session.user.id,
      organizer_type: TournamentOrganizerType.ESTABLISHMENT,
      establishmentId: establishment.id,
      visibility: TournamentVisibility.PUBLIC,
      status: input.status ?? TournamentStatus.DRAFT,
      name,
      description: input.description?.trim() || null,
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
      categories: categories.length
        ? {
            createMany: {
              data: categories.map((label) => ({ label })),
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
      entry_fee_cents: true,
      team_size_min: true,
      team_size_max: true,
      max_teams: true,
      categories: { select: { label: true } },
    },
  });

  if (!tournament) throw new Error("Torneio nao encontrado");
  if (tournament.visibility === TournamentVisibility.PUBLIC && tournament.status !== TournamentStatus.OPEN) {
    throw new Error("Inscricoes fechadas");
  }

  const currentCount = await prisma.tournamentRegistration.count({ where: { tournamentId: tournament.id } });
  if (currentCount >= tournament.max_teams) {
    throw new Error("Limite de times atingido");
  }

  const teamName = input.teamName?.trim();
  if (!teamName) throw new Error("Nome do time e obrigatorio");

  const already = await prisma.team.findFirst({
    where: { tournamentId: tournament.id, name: teamName },
    select: { id: true },
  });
  if (already) throw new Error("Nome do time ja utilizado");

  const players = input.players
    .map((player) => ({ full_name: player.fullName.trim(), document_id: player.documentId.trim() }))
    .filter((player) => player.full_name && player.document_id);

  if (players.length < tournament.team_size_min || players.length > tournament.team_size_max) {
    throw new Error("Quantidade de jogadores fora do limite do torneio");
  }

  if (input.categoryLabel && !tournament.categories.some((cat) => cat.label === input.categoryLabel)) {
    throw new Error("Categoria invalida");
  }

  const registration = await prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: {
        tournamentId: tournament.id,
        name: teamName,
        category_label: input.categoryLabel?.trim() || null,
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
  return { registrationId: registration.id, payment };
}

export async function createTournamentInvitations(input: { tournamentId: string; contacts: string[] }) {
  const session = await requireRole("CUSTOMER");

  const tournament = await prisma.tournament.findUnique({
    where: { id: input.tournamentId },
    select: { id: true, organizer_user_id: true, visibility: true },
  });

  if (!tournament) throw new Error("Torneio nao encontrado");
  if (tournament.organizer_user_id !== session.user.id || tournament.visibility !== TournamentVisibility.PRIVATE) {
    throw new Error("Sem permissao");
  }

  const contacts = input.contacts.map((item) => item.trim()).filter(Boolean);
  if (!contacts.length) return { count: 0 };

  await prisma.tournamentInvitation.createMany({
    data: contacts.map((contact) => ({
      tournamentId: tournament.id,
      invited_by_id: session.user.id,
      contact,
      status: TournamentInvitationStatus.PENDING,
      token: crypto.randomBytes(16).toString("hex"),
    })),
  });

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

  await prisma.tournament.update({
    where: { id: tournament.id },
    data: { status: input.status },
    select: { id: true },
  });

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
      tournament: { select: { id: true, establishment: { select: { ownerId: true } } } },
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

  revalidatePath(`/dashboard/torneios/${registration.tournament.id}`);
  return { ok: true };
}
