import "dotenv/config";

import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import type { Prisma } from "../src/generated/prisma/client";
import {
  MonthlyPassStatus,
  PaymentProvider,
  PaymentStatus,
  Role,
  SportType,
  TeamMemberRole,
  TournamentFormat,
  TournamentOrganizerType,
  TournamentRegistrationStatus,
  TournamentStatus,
  TournamentVisibility,
} from "../src/generated/prisma/enums";
import { slugify } from "../src/lib/utils/slug";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function listWeekdayDates(month: string, weekday: number): Date[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const cursor = new Date(year, (monthIndex ?? 1) - 1, 1, 0, 0, 0, 0);
  const dates: Date[] = [];

  while (cursor.getMonth() === (monthIndex ?? 1) - 1) {
    if (cursor.getDay() === weekday) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function toDateTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return result;
}

type SeedUser = {
  email: string;
  name: string;
  password: string;
  cpfCnpj: string;
  whatsapp: string;
  address: string;
  role?: Role;
};

async function upsertUser(prisma: PrismaClient, config: SeedUser) {
  const passwordHash = await bcrypt.hash(config.password, 10);

  return prisma.user.upsert({
    where: { email: config.email },
    update: {
      name: config.name,
      role: config.role ?? Role.CUSTOMER,
      password_hash: passwordHash,
      whatsapp_number: config.whatsapp,
      cpf_cnpj: config.cpfCnpj,
      address_text: config.address,
      is_active: true,
    },
    create: {
      email: config.email,
      name: config.name,
      role: config.role ?? Role.CUSTOMER,
      password_hash: passwordHash,
      whatsapp_number: config.whatsapp,
      cpf_cnpj: config.cpfCnpj,
      address_text: config.address,
      is_active: true,
    },
    select: { id: true, email: true, name: true },
  });
}

async function ensureEstablishment(prisma: PrismaClient, adminId: string) {
  const existing = await prisma.establishment.findFirst({
    where: { ownerId: adminId },
    select: { id: true },
  });

  if (existing) {
    return prisma.establishment.update({
      where: { id: existing.id },
      data: {
        name: "PlayHub Arena",
        slug: slugify("PlayHub Arena"),
        description: "Estrutura de exemplo para cenários automatizados de torneios e mensalidades.",
        whatsapp_number: "+55 11 98888-0000",
        address_text: "Av. Paulista, 1000 - São Paulo, SP",
        latitude: -23.564,
        longitude: -46.653,
        opening_time: "08:00",
        closing_time: "23:00",
        online_payments_enabled: true,
        requires_booking_confirmation: true,
      },
      select: { id: true, name: true },
    });
  }

  return prisma.establishment.create({
    data: {
      ownerId: adminId,
      name: "PlayHub Arena",
      slug: slugify("PlayHub Arena"),
      description: "Estrutura de exemplo para cenários automatizados de torneios e mensalidades.",
      whatsapp_number: "+55 11 98888-0000",
      address_text: "Av. Paulista, 1000 - São Paulo, SP",
      latitude: -23.564,
      longitude: -46.653,
      opening_time: "08:00",
      closing_time: "23:00",
      online_payments_enabled: true,
      requires_booking_confirmation: true,
    },
    select: { id: true, name: true },
  });
}

async function ensureCourt(
  prisma: PrismaClient,
  establishmentId: string,
  input: {
    name: string;
    sportType: SportType;
    pricePerHour: number;
    monthlyPriceCents: number;
    photoUrl: string;
  }
) {
  const existing = await prisma.court.findFirst({
    where: { establishmentId, name: input.name },
    select: { id: true },
  });

  if (existing) {
    return prisma.court.update({
      where: { id: existing.id },
      data: {
        sport_type: input.sportType,
        price_per_hour: input.pricePerHour,
        discount_percentage_over_90min: 10,
        monthly_price_cents: input.monthlyPriceCents,
        monthly_terms: "Mensalidade cobre um horário semanal fixo, sujeita à aprovação do estabelecimento.",
        photo_urls: [input.photoUrl],
        is_active: true,
      },
      select: { id: true, name: true },
    });
  }

  return prisma.court.create({
    data: {
      establishmentId,
      name: input.name,
      sport_type: input.sportType,
      price_per_hour: input.pricePerHour,
      discount_percentage_over_90min: 10,
      monthly_price_cents: input.monthlyPriceCents,
      monthly_terms: "Mensalidade cobre um horário semanal fixo, sujeita à aprovação do estabelecimento.",
      photo_urls: [input.photoUrl],
    },
    select: { id: true, name: true },
  });
}

async function resetTournamentScenario(
  prisma: PrismaClient,
  input: {
    name: string;
    organizerUserId: string;
    organizerType: TournamentOrganizerType;
    establishmentId: string;
    visibility: TournamentVisibility;
    status: TournamentStatus;
    sportType: SportType;
    startDate: Date;
    endDate: Date;
    locationName: string;
    city: string;
    entryFeeCents: number;
    maxTeams: number;
    teamSizeMin: number;
    teamSizeMax: number;
    format: TournamentFormat;
    description: string;
    coverImageUrl: string;
    categories: string[];
    levels: string[];
  }
) {
  const existing = await prisma.tournament.findFirst({
    where: { name: input.name },
    select: { id: true },
  });

  if (existing) {
    const existingPayments = await prisma.payment.findMany({
      where: { tournamentRegistration: { tournamentId: existing.id } },
      select: { id: true },
    });

    if (existingPayments.length) {
      await prisma.paymentEvent.deleteMany({
        where: { paymentId: { in: existingPayments.map((payment) => payment.id) } },
      });
      await prisma.payment.deleteMany({
        where: { id: { in: existingPayments.map((payment) => payment.id) } },
      });
    }

    await prisma.tournamentStanding.deleteMany({ where: { tournamentId: existing.id } });
    await prisma.tournamentMatch.deleteMany({ where: { tournamentId: existing.id } });
    await prisma.tournamentInvitation.deleteMany({ where: { tournamentId: existing.id } });
    await prisma.tournamentConnectionRequest.deleteMany({ where: { tournamentId: existing.id } });
    await prisma.tournamentTeamRecruitmentPosting.deleteMany({ where: { tournamentId: existing.id } });
    await prisma.tournamentPlayerAvailability.deleteMany({ where: { tournamentId: existing.id } });
    await prisma.tournamentRegistration.deleteMany({ where: { tournamentId: existing.id } });
    await prisma.team.deleteMany({ where: { tournamentId: existing.id } });
    await prisma.tournamentCategory.deleteMany({ where: { tournamentId: existing.id } });
    await prisma.tournamentLevel.deleteMany({ where: { tournamentId: existing.id } });

    return prisma.tournament.update({
      where: { id: existing.id },
      data: {
        organizer_user_id: input.organizerUserId,
        organizer_type: input.organizerType,
        establishmentId: input.establishmentId,
        visibility: input.visibility,
        status: input.status,
        name: input.name,
        description: input.description,
        cover_image_url: input.coverImageUrl,
        sport_type: input.sportType,
        start_date: input.startDate,
        end_date: input.endDate,
        location_name: input.locationName,
        city: input.city,
        max_teams: input.maxTeams,
        entry_fee_cents: input.entryFeeCents,
        team_size_min: input.teamSizeMin,
        team_size_max: input.teamSizeMax,
        format: input.format,
        rules: [
          "Chegar com 30 minutos de antecedência.",
          "Documentação obrigatória para todos os atletas.",
        ],
      },
      select: { id: true, name: true },
    });
  }

  return prisma.tournament.create({
    data: {
      organizer_user_id: input.organizerUserId,
      organizer_type: input.organizerType,
      establishmentId: input.establishmentId,
      visibility: input.visibility,
      status: input.status,
      name: input.name,
      description: input.description,
      cover_image_url: input.coverImageUrl,
      sport_type: input.sportType,
      start_date: input.startDate,
      end_date: input.endDate,
      location_name: input.locationName,
      city: input.city,
      max_teams: input.maxTeams,
      entry_fee_cents: input.entryFeeCents,
      team_size_min: input.teamSizeMin,
      team_size_max: input.teamSizeMax,
      format: input.format,
      rules: [
        "Chegar com 30 minutos de antecedência.",
        "Documentação obrigatória para todos os atletas.",
      ],
    },
    select: { id: true, name: true },
  });
}

async function createTeamRegistration(
  prisma: PrismaClient,
  input: {
    tournamentId: string;
    createdById: string;
    approvedById?: string;
    teamName: string;
    categoryLabel: string;
    levelLabel: string;
    playerNames: string[];
    documentPrefix: string;
    status: TournamentRegistrationStatus;
    paid: boolean;
    payment?: {
      amountCents: number;
      status: PaymentStatus;
      expiresAt?: Date | null;
      checkoutUrl?: string | null;
      providerPaymentId?: string;
        metadata?: Prisma.InputJsonValue;
    };
  }
) {
  const team = await prisma.team.create({
    data: {
      tournamentId: input.tournamentId,
      name: input.teamName,
      category_label: input.categoryLabel,
      level_label: input.levelLabel,
      created_by_id: input.createdById,
    },
    select: { id: true, name: true },
  });

  await prisma.teamMember.createMany({
    data: input.playerNames.map((playerName, index) => ({
      teamId: team.id,
      userId: index === 0 ? input.createdById : undefined,
      full_name: playerName,
      document_id: `${input.documentPrefix}-${index + 1}`,
      role: index === 0 ? TeamMemberRole.CAPTAIN : TeamMemberRole.PLAYER,
    })),
  });

  const registration = await prisma.tournamentRegistration.create({
    data: {
      tournamentId: input.tournamentId,
      teamId: team.id,
      createdById: input.createdById,
      approvedById: input.approvedById ?? null,
      status: input.status,
      paid: input.paid,
    },
    select: { id: true, teamId: true },
  });

  if (input.payment) {
    await prisma.payment.create({
      data: {
        tournamentRegistrationId: registration.id,
        provider: PaymentProvider.ASAAS,
        status: input.payment.status,
        amount_cents: input.payment.amountCents,
        provider_payment_id: input.payment.providerPaymentId ?? `test-tournament-${registration.id}`,
        checkout_url: input.payment.checkoutUrl ?? null,
        expires_at: input.payment.expiresAt ?? null,
        metadata: input.payment.metadata ?? undefined,
      },
      select: { id: true },
    });
  }

  return { registrationId: registration.id, teamId: team.id };
}

async function seedMonthlyPassScenarios(
  prisma: PrismaClient,
  input: {
    adminId: string;
    courtId: string;
    monthlyPriceCents: number;
    activeUser: { id: string; name: string };
    renewalUser: { id: string; name: string };
  }
) {
  const now = new Date();
  const currentMonth = monthKey(now);
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  const nextMonth = monthKey(nextMonthDate);
  const weekday = 2;
  const startTime = "19:00";
  const endTime = "20:00";

  const existingPasses = await prisma.monthlyPass.findMany({
    where: {
      courtId: input.courtId,
      customerId: { in: [input.activeUser.id, input.renewalUser.id] },
      month: { in: [currentMonth, nextMonth] },
    },
    select: { id: true },
  });

  if (existingPasses.length) {
    const ids = existingPasses.map((pass) => pass.id);
    await prisma.paymentEvent.deleteMany({ where: { payment: { monthlyPassId: { in: ids } } } });
    await prisma.payment.deleteMany({ where: { monthlyPassId: { in: ids } } });
    await prisma.monthlyPass.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.courtBlock.deleteMany({
    where: {
      courtId: input.courtId,
      createdById: input.adminId,
      note: { in: [`Mensalidade • ${input.activeUser.name}`, `Mensalidade • ${input.renewalUser.name}`] },
    },
  });

  const activePass = await prisma.monthlyPass.create({
    data: {
      courtId: input.courtId,
      customerId: input.activeUser.id,
      month: currentMonth,
      weekday,
      start_time: startTime,
      end_time: endTime,
      status: MonthlyPassStatus.ACTIVE,
      price_cents: input.monthlyPriceCents,
      terms_snapshot: "Mensalidade ativa de teste para validar renovação e visualização.",
    },
    select: { id: true },
  });

  const renewalCurrentPass = await prisma.monthlyPass.create({
    data: {
      courtId: input.courtId,
      customerId: input.renewalUser.id,
      month: currentMonth,
      weekday,
      start_time: startTime,
      end_time: endTime,
      status: MonthlyPassStatus.ACTIVE,
      price_cents: input.monthlyPriceCents,
      terms_snapshot: "Mensalidade ativa de teste para validar vencimento e renovação.",
    },
    select: { id: true },
  });

  const renewalNextPass = await prisma.monthlyPass.create({
    data: {
      courtId: input.courtId,
      customerId: input.renewalUser.id,
      month: nextMonth,
      weekday,
      start_time: startTime,
      end_time: endTime,
      status: MonthlyPassStatus.PENDING,
      price_cents: input.monthlyPriceCents,
      terms_snapshot: "Renovação pendente de teste.",
    },
    select: { id: true },
  });

  await prisma.payment.create({
    data: {
      monthlyPassId: renewalNextPass.id,
      provider: PaymentProvider.ASAAS,
      status: PaymentStatus.PENDING,
      amount_cents: input.monthlyPriceCents,
      provider_payment_id: `test-monthly-${renewalNextPass.id}`,
      expires_at: addDays(now, 3),
      metadata: { scenario: "monthly-renewal-test" },
    },
    select: { id: true },
  });

  const activePassUsers = [input.activeUser, input.renewalUser];
  for (const user of activePassUsers) {
    const dates = listWeekdayDates(currentMonth, weekday);
    if (!dates.length) continue;

    await prisma.courtBlock.createMany({
      data: dates.map((date) => ({
        courtId: input.courtId,
        start_time: toDateTime(date, startTime),
        end_time: toDateTime(date, endTime),
        note: `Mensalidade • ${user.name}`,
        createdById: input.adminId,
      })),
    });
  }

  return { activePassId: activePass.id, renewalCurrentPassId: renewalCurrentPass.id, renewalNextPassId: renewalNextPass.id };
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@playhub.local";
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
    const customerEmail = process.env.SEED_CUSTOMER_EMAIL ?? "customer@playhub.local";
    const customerPassword = process.env.SEED_CUSTOMER_PASSWORD ?? "customer123";

    const admin = await upsertUser(prisma, {
      email: adminEmail,
      name: "Admin",
      password: adminPassword,
      cpfCnpj: "12345678909",
      whatsapp: "+55 11 90000-0001",
      address: "São Paulo, SP",
      role: Role.ADMIN,
    });

    const defaultCustomer = await upsertUser(prisma, {
      email: customerEmail,
      name: "Customer",
      password: customerPassword,
      cpfCnpj: "12345678901",
      whatsapp: "+55 11 90000-0002",
      address: "São Paulo, SP",
      role: Role.CUSTOMER,
    });

    const tournamentUsers = await Promise.all([
      upsertUser(prisma, {
        email: "torneio.01@playhub.local",
        name: "Capitão Teste 01",
        password: "teste123",
        cpfCnpj: "11111111111",
        whatsapp: "+55 11 90000-1001",
        address: "São Paulo, SP",
      }),
      upsertUser(prisma, {
        email: "torneio.02@playhub.local",
        name: "Capitão Teste 02",
        password: "teste123",
        cpfCnpj: "22222222222",
        whatsapp: "+55 11 90000-1002",
        address: "São Paulo, SP",
      }),
      upsertUser(prisma, {
        email: "torneio.03@playhub.local",
        name: "Capitão Teste 03",
        password: "teste123",
        cpfCnpj: "33333333333",
        whatsapp: "+55 11 90000-1003",
        address: "Osasco, SP",
      }),
      upsertUser(prisma, {
        email: "torneio.04@playhub.local",
        name: "Capitão Teste 04",
        password: "teste123",
        cpfCnpj: "44444444444",
        whatsapp: "+55 11 90000-1004",
        address: "Barueri, SP",
      }),
      upsertUser(prisma, {
        email: "mensalista.ativo@playhub.local",
        name: "Mensalista Ativo Teste",
        password: "teste123",
        cpfCnpj: "55555555555",
        whatsapp: "+55 11 90000-2001",
        address: "São Paulo, SP",
      }),
      upsertUser(prisma, {
        email: "mensalista.renovacao@playhub.local",
        name: "Mensalista Renovação Teste",
        password: "teste123",
        cpfCnpj: "66666666666",
        whatsapp: "+55 11 90000-2002",
        address: "São Paulo, SP",
      }),
    ]);

    const [captain1, captain2, captain3, captain4, monthlyActiveUser, monthlyRenewalUser] = tournamentUsers;

    const establishment = await ensureEstablishment(prisma, admin.id);
    const futsalCourt = await ensureCourt(prisma, establishment.id, {
      name: "Quadra Futsal 1",
      sportType: SportType.FUTSAL,
      pricePerHour: 12000,
      monthlyPriceCents: 32000,
      photoUrl: "https://images.unsplash.com/photo-1521412644187-c49fa049e84d",
    });
    const beachCourt = await ensureCourt(prisma, establishment.id, {
      name: "Beach Tennis 1",
      sportType: SportType.BEACH_TENNIS,
      pricePerHour: 18000,
      monthlyPriceCents: 42000,
      photoUrl: "https://images.unsplash.com/photo-1517649763962-0c623066013b",
    });

    const now = new Date();
    const openTournament = await resetTournamentScenario(prisma, {
      name: "[TESTE] Copa PIX do Cliente",
      organizerUserId: admin.id,
      organizerType: TournamentOrganizerType.ESTABLISHMENT,
      establishmentId: establishment.id,
      visibility: TournamentVisibility.PUBLIC,
      status: TournamentStatus.OPEN,
      sportType: SportType.FUTSAL,
      startDate: addDays(now, 7),
      endDate: addDays(now, 9),
      locationName: establishment.name,
      city: "São Paulo - SP",
      entryFeeCents: 4500,
      maxTeams: 8,
      teamSizeMin: 5,
      teamSizeMax: 8,
      format: TournamentFormat.GROUPS_KO,
      description: "Cenário automatizado com PIX pendente para validar acompanhamento do cliente.",
      coverImageUrl: "https://images.unsplash.com/photo-1547347298-4074fc3086f0",
      categories: ["Livre"],
      levels: ["Médio"],
    });

    const freeTournament = await resetTournamentScenario(prisma, {
      name: "[TESTE] Copa Gratuita em Análise",
      organizerUserId: admin.id,
      organizerType: TournamentOrganizerType.ESTABLISHMENT,
      establishmentId: establishment.id,
      visibility: TournamentVisibility.PUBLIC,
      status: TournamentStatus.OPEN,
      sportType: SportType.BEACH_TENNIS,
      startDate: addDays(now, 12),
      endDate: addDays(now, 13),
      locationName: establishment.name,
      city: "São Paulo - SP",
      entryFeeCents: 0,
      maxTeams: 6,
      teamSizeMin: 2,
      teamSizeMax: 2,
      format: TournamentFormat.SINGLE_ELIM,
      description: "Cenário gratuito com inscrição pendente para validar o funil de aprovação.",
      coverImageUrl: "https://images.unsplash.com/photo-1517649763962-0c623066013b",
      categories: ["Livre"],
      levels: ["Iniciante", "Intermediário"],
    });

    const runningTournament = await resetTournamentScenario(prisma, {
      name: "[TESTE] Liga em Andamento",
      organizerUserId: admin.id,
      organizerType: TournamentOrganizerType.ESTABLISHMENT,
      establishmentId: establishment.id,
      visibility: TournamentVisibility.PUBLIC,
      status: TournamentStatus.RUNNING,
      sportType: SportType.FUTSAL,
      startDate: addDays(now, -3),
      endDate: addDays(now, 10),
      locationName: establishment.name,
      city: "São Paulo - SP",
      entryFeeCents: 3500,
      maxTeams: 4,
      teamSizeMin: 5,
      teamSizeMax: 7,
      format: TournamentFormat.LEAGUE,
      description: "Cenário automatizado com partidas, classificação e time aprovado do cliente padrão.",
      coverImageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018",
      categories: ["Livre"],
      levels: ["Médio"],
    });

    await prisma.tournamentCategory.createMany({
      data: [
        { tournamentId: openTournament.id, label: "Livre" },
        { tournamentId: freeTournament.id, label: "Livre" },
        { tournamentId: runningTournament.id, label: "Livre" },
      ],
    });

    await prisma.tournamentLevel.createMany({
      data: [
        { tournamentId: openTournament.id, label: "Médio" },
        { tournamentId: freeTournament.id, label: "Iniciante" },
        { tournamentId: freeTournament.id, label: "Intermediário" },
        { tournamentId: runningTournament.id, label: "Médio" },
      ],
    });

    await createTeamRegistration(prisma, {
      tournamentId: openTournament.id,
      createdById: defaultCustomer.id,
      teamName: "Time Customer PIX",
      categoryLabel: "Livre",
      levelLabel: "Médio",
      playerNames: ["Customer", "Atleta A", "Atleta B", "Atleta C", "Atleta D"],
      documentPrefix: "PIX-CUSTOMER",
      status: TournamentRegistrationStatus.PENDING,
      paid: false,
      payment: {
        amountCents: 4500,
        status: PaymentStatus.PENDING,
        expiresAt: addDays(now, 2),
        metadata: { scenario: "pending-tournament-payment" },
      },
    });

    await createTeamRegistration(prisma, {
      tournamentId: openTournament.id,
      createdById: captain1.id,
      approvedById: admin.id,
      teamName: "Trovão FC",
      categoryLabel: "Livre",
      levelLabel: "Médio",
      playerNames: ["Capitão Teste 01", "Rafael Lima", "Bruno Souza", "Caio Alves", "Diego Melo"],
      documentPrefix: "TROVAO",
      status: TournamentRegistrationStatus.APPROVED,
      paid: true,
      payment: {
        amountCents: 4500,
        status: PaymentStatus.PAID,
        metadata: { scenario: "approved-paid-tournament" },
      },
    });

    await createTeamRegistration(prisma, {
      tournamentId: freeTournament.id,
      createdById: defaultCustomer.id,
      teamName: "Dupla Customer Free",
      categoryLabel: "Livre",
      levelLabel: "Intermediário",
      playerNames: ["Customer", "Parceiro Free"],
      documentPrefix: "FREE-CUSTOMER",
      status: TournamentRegistrationStatus.PENDING,
      paid: true,
    });

    const runningCustomer = await createTeamRegistration(prisma, {
      tournamentId: runningTournament.id,
      createdById: defaultCustomer.id,
      approvedById: admin.id,
      teamName: "Time Customer Liga",
      categoryLabel: "Livre",
      levelLabel: "Médio",
      playerNames: ["Customer", "Leo Costa", "Guilherme Dias", "Vitor Prado", "Renan Souza"],
      documentPrefix: "LIGA-CUSTOMER",
      status: TournamentRegistrationStatus.APPROVED,
      paid: true,
      payment: {
        amountCents: 3500,
        status: PaymentStatus.PAID,
        metadata: { scenario: "running-tournament-approved" },
      },
    });

    const runningTeam2 = await createTeamRegistration(prisma, {
      tournamentId: runningTournament.id,
      createdById: captain2.id,
      approvedById: admin.id,
      teamName: "União Norte",
      categoryLabel: "Livre",
      levelLabel: "Médio",
      playerNames: ["Capitão Teste 02", "Pedro Gomes", "Igor Lima", "Fábio Castro", "Mateus Sena"],
      documentPrefix: "UNIAO",
      status: TournamentRegistrationStatus.APPROVED,
      paid: true,
      payment: {
        amountCents: 3500,
        status: PaymentStatus.PAID,
        metadata: { scenario: "running-tournament-approved" },
      },
    });

    const runningTeam3 = await createTeamRegistration(prisma, {
      tournamentId: runningTournament.id,
      createdById: captain3.id,
      approvedById: admin.id,
      teamName: "Fênix SP",
      categoryLabel: "Livre",
      levelLabel: "Médio",
      playerNames: ["Capitão Teste 03", "André Nunes", "Murilo Paz", "César Lima", "Thiago Pires"],
      documentPrefix: "FENIX",
      status: TournamentRegistrationStatus.APPROVED,
      paid: true,
      payment: {
        amountCents: 3500,
        status: PaymentStatus.PAID,
        metadata: { scenario: "running-tournament-approved" },
      },
    });

    const runningTeam4 = await createTeamRegistration(prisma, {
      tournamentId: runningTournament.id,
      createdById: captain4.id,
      approvedById: admin.id,
      teamName: "Central Sul",
      categoryLabel: "Livre",
      levelLabel: "Médio",
      playerNames: ["Capitão Teste 04", "Alan Ribeiro", "David Lopes", "Gustavo Silva", "Edu Rocha"],
      documentPrefix: "CENTRAL",
      status: TournamentRegistrationStatus.APPROVED,
      paid: true,
      payment: {
        amountCents: 3500,
        status: PaymentStatus.PAID,
        metadata: { scenario: "running-tournament-approved" },
      },
    });

    const finishedMatch = await prisma.tournamentMatch.create({
      data: {
        tournamentId: runningTournament.id,
        round: "1ª rodada",
        group_label: "Grupo A",
        courtId: futsalCourt.id,
        start_time: addDays(now, -1),
        end_time: new Date(addDays(now, -1).getTime() + 60 * 60 * 1000),
        status: TournamentStatus.RUNNING === TournamentStatus.RUNNING ? "FINISHED" : "SCHEDULED",
        teamAId: runningCustomer.teamId,
        teamBId: runningTeam2.teamId,
      },
      select: { id: true },
    });

    await prisma.tournamentScore.create({
      data: {
        matchId: finishedMatch.id,
        team_a_score: 3,
        team_b_score: 1,
      },
      select: { id: true },
    });

    await prisma.tournamentMatch.create({
      data: {
        tournamentId: runningTournament.id,
        round: "2ª rodada",
        group_label: "Grupo A",
        courtId: futsalCourt.id,
        start_time: addDays(now, 2),
        end_time: new Date(addDays(now, 2).getTime() + 60 * 60 * 1000),
        status: "SCHEDULED",
        teamAId: runningTeam3.teamId,
        teamBId: runningTeam4.teamId,
      },
      select: { id: true },
    });

    await prisma.tournamentStanding.createMany({
      data: [
        { tournamentId: runningTournament.id, teamId: runningCustomer.teamId, points: 3, wins: 1, losses: 0, goals: 3 },
        { tournamentId: runningTournament.id, teamId: runningTeam2.teamId, points: 0, wins: 0, losses: 1, goals: 1 },
        { tournamentId: runningTournament.id, teamId: runningTeam3.teamId, points: 0, wins: 0, losses: 0, goals: 0 },
        { tournamentId: runningTournament.id, teamId: runningTeam4.teamId, points: 0, wins: 0, losses: 0, goals: 0 },
      ],
    });

    const monthlyPasses = await seedMonthlyPassScenarios(prisma, {
      adminId: admin.id,
      courtId: beachCourt.id,
      monthlyPriceCents: 42000,
      activeUser: { id: monthlyActiveUser.id, name: monthlyActiveUser.name ?? "Mensalista Ativo Teste" },
      renewalUser: { id: monthlyRenewalUser.id, name: monthlyRenewalUser.name ?? "Mensalista Renovação Teste" },
    });

    console.log("Cenários de teste prontos:");
    console.log(`- Cliente principal para acompanhar torneios: ${defaultCustomer.email} / ${customerPassword}`);
    console.log("- Torneios criados automaticamente:");
    console.log("  • [TESTE] Copa PIX do Cliente");
    console.log("  • [TESTE] Copa Gratuita em Análise");
    console.log("  • [TESTE] Liga em Andamento");
    console.log(`- Mensalista ativo: ${monthlyActiveUser.email} / teste123`);
    console.log(`- Mensalista com renovação pendente: ${monthlyRenewalUser.email} / teste123`);
    console.log(`- Passes mensais criados: ${monthlyPasses.activePassId}, ${monthlyPasses.renewalCurrentPassId}, ${monthlyPasses.renewalNextPassId}`);
    console.log("- Acompanhar torneios do cliente: /torneios/meus");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});