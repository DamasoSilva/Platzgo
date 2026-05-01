"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { NotificationType } from "@/generated/prisma/enums";

type UpsertTournamentPlayerProfileInput = {
  photo_url: string;
  whatsapp_number: string;
  age: number;
  birth_year: number;
  preferred_position: string;
  height_cm: number;
  weight_kg: number;
  description: string;
};

type SetTournamentAvailabilityInput = {
  tournamentId: string;
};

type UpsertTeamRecruitmentPostingInput = {
  tournamentId: string;
  teamId: string;
  photo_url: string;
  whatsapp_number: string;
  desired_position: string;
  average_age: number;
  notes: string;
};

type DeleteTeamRecruitmentPostingInput = {
  postingId: string;
};

type CreateTournamentConnectionRequestInput = {
  tournamentId: string;
  teamId: string;
  playerUserId: string;
  kind: "APPLICATION" | "INVITATION";
  note?: string;
};

type UpdateTournamentConnectionRequestStatusInput = {
  requestId: string;
  status: "ACCEPTED" | "REJECTED" | "CANCELLED";
  response_note?: string;
};

function normalizeDigits(value: string) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeWhatsappNumber(value: string) {
  const digits = normalizeDigits(value);
  if (digits.length < 10 || digits.length > 13) {
    throw new Error("Informe um WhatsApp valido com DDD.");
  }
  return digits;
}

function requiredText(value: string, label: string, minLength = 1) {
  const normalized = String(value ?? "").trim();
  if (normalized.length < minLength) {
    throw new Error(`${label} e obrigatorio.`);
  }
  return normalized;
}

function requiredImage(value: string, label: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} e obrigatoria.`);
  }
  return normalized;
}

function integerInRange(value: number, label: string, min: number, max: number) {
  const normalized = Math.trunc(Number(value));
  if (!Number.isFinite(normalized) || normalized < min || normalized > max) {
    throw new Error(`${label} deve estar entre ${min} e ${max}.`);
  }
  return normalized;
}

async function ensureTournamentExists(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true },
  });

  if (!tournament) {
    throw new Error("Torneio nao encontrado.");
  }

  return tournament;
}

async function ensureAdminTournamentAccess(tournamentId: string, ownerId: string) {
  const tournament = await prisma.tournament.findFirst({
    where: {
      id: tournamentId,
      establishment: { ownerId },
    },
    select: { id: true },
  });

  if (!tournament) {
    throw new Error("Torneio nao encontrado para esse organizador.");
  }

  return tournament;
}

async function loadTournamentConnectionRequest(requestId: string) {
  const request = await prisma.tournamentConnectionRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      tournamentId: true,
      teamId: true,
      playerUserId: true,
      createdById: true,
      kind: true,
      status: true,
      team: {
        select: {
          id: true,
          name: true,
          created_by_id: true,
          tournament: {
            select: {
              name: true,
            },
          },
        },
      },
      tournament: {
        select: {
          establishment: {
            select: { ownerId: true },
          },
        },
      },
    },
  });

  if (!request) {
    throw new Error("Solicitacao nao encontrada.");
  }

  return request;
}

async function notifyTournamentConnectionArrival(params: {
  recipientUserId: string;
  actorName: string;
  teamName: string;
  tournamentName: string;
  note: string | null;
  kind: "APPLICATION" | "INVITATION";
}) {
  if (!params.recipientUserId) return;

  const noteText = params.note ? ` Observação: ${params.note}` : "";

  await prisma.notification.create({
    data: {
      userId: params.recipientUserId,
      type:
        params.kind === "APPLICATION"
          ? NotificationType.TOURNAMENT_CONNECTION_APPLICATION
          : NotificationType.TOURNAMENT_CONNECTION_INVITATION,
      title:
        params.kind === "APPLICATION"
          ? "Nova candidatura para o time"
          : "Nova convocação de time",
      body:
        params.kind === "APPLICATION"
          ? `${params.actorName} se candidatou ao time ${params.teamName} no torneio ${params.tournamentName}.${noteText}`
          : `O time ${params.teamName} convocou ${params.actorName} no torneio ${params.tournamentName}.${noteText}`,
    },
  });
}

async function notifyTournamentConnectionDecision(params: {
  recipientUserId: string;
  teamName: string;
  tournamentName: string;
  responseNote: string | null;
  kind: "APPLICATION" | "INVITATION";
  status: "ACCEPTED" | "REJECTED";
}) {
  if (!params.recipientUserId) return;

  const noteText = params.responseNote ? ` Observação: ${params.responseNote}` : "";
  const actionLabel = params.kind === "APPLICATION" ? "candidatura" : "convocação";
  const statusLabel = params.status === "ACCEPTED" ? "aceita" : "recusada";

  await prisma.notification.create({
    data: {
      userId: params.recipientUserId,
      type:
        params.status === "ACCEPTED"
          ? NotificationType.TOURNAMENT_CONNECTION_ACCEPTED
          : NotificationType.TOURNAMENT_CONNECTION_REJECTED,
      title: `${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} ${statusLabel}`,
      body: `Sua ${actionLabel} para o time ${params.teamName} no torneio ${params.tournamentName} foi ${statusLabel}.${noteText}`,
    },
  });
}

export async function upsertTournamentPlayerProfile(input: UpsertTournamentPlayerProfileInput) {
  const session = await requireRole("CUSTOMER");
  const currentYear = new Date().getFullYear();

  const payload = {
    photo_url: requiredImage(input.photo_url, "A foto do jogador"),
    whatsapp_number: normalizeWhatsappNumber(input.whatsapp_number),
    age: integerInRange(input.age, "A idade", 8, 80),
    birth_year: integerInRange(input.birth_year, "O ano de nascimento", 1940, currentYear),
    preferred_position: requiredText(input.preferred_position, "A posicao", 2),
    height_cm: integerInRange(input.height_cm, "A altura", 100, 250),
    weight_kg: integerInRange(input.weight_kg, "O peso", 30, 250),
    description: requiredText(input.description, "A descricao", 20),
  };

  await prisma.tournamentPlayerProfile.upsert({
    where: { userId: session.user.id },
    update: payload,
    create: {
      userId: session.user.id,
      ...payload,
    },
    select: { id: true },
  });

  revalidatePath("/torneios");
  return { ok: true };
}

export async function publishMyTournamentAvailability(input: SetTournamentAvailabilityInput) {
  const session = await requireRole("CUSTOMER");
  const tournamentId = requiredText(input.tournamentId, "O torneio");

  await ensureTournamentExists(tournamentId);

  const profile = await prisma.tournamentPlayerProfile.findUnique({
    where: { userId: session.user.id },
    select: { userId: true },
  });

  if (!profile) {
    throw new Error("Complete seu perfil de jogador antes de buscar um time.");
  }

  await prisma.tournamentPlayerAvailability.upsert({
    where: {
      tournamentId_userId: {
        tournamentId,
        userId: session.user.id,
      },
    },
    update: {},
    create: {
      tournamentId,
      userId: session.user.id,
    },
    select: { id: true },
  });

  revalidatePath(`/torneios/${tournamentId}`);
  return { ok: true };
}

export async function removeMyTournamentAvailability(input: SetTournamentAvailabilityInput) {
  const session = await requireRole("CUSTOMER");
  const tournamentId = requiredText(input.tournamentId, "O torneio");

  await prisma.tournamentPlayerAvailability.deleteMany({
    where: {
      tournamentId,
      userId: session.user.id,
    },
  });

  revalidatePath(`/torneios/${tournamentId}`);
  return { ok: true };
}

export async function upsertTeamRecruitmentPosting(input: UpsertTeamRecruitmentPostingInput) {
  const session = await requireRole("CUSTOMER");
  const tournamentId = requiredText(input.tournamentId, "O torneio");
  const teamId = requiredText(input.teamId, "O time");

  await ensureTournamentExists(tournamentId);

  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      tournamentId,
      created_by_id: session.user.id,
    },
    select: { id: true },
  });

  if (!team) {
    throw new Error("Voce nao pode publicar busca para esse time.");
  }

  const payload = {
    photo_url: requiredImage(input.photo_url, "A foto do time"),
    whatsapp_number: normalizeWhatsappNumber(input.whatsapp_number),
    desired_position: requiredText(input.desired_position, "A posicao procurada", 2),
    average_age: integerInRange(input.average_age, "A media de idade", 8, 80),
    notes: requiredText(input.notes, "A observacao", 10),
  };

  await prisma.tournamentTeamRecruitmentPosting.upsert({
    where: { teamId },
    update: payload,
    create: {
      tournamentId,
      teamId,
      createdById: session.user.id,
      ...payload,
    },
    select: { id: true },
  });

  revalidatePath(`/torneios/${tournamentId}`);
  return { ok: true };
}

export async function deleteTeamRecruitmentPosting(input: DeleteTeamRecruitmentPostingInput) {
  const session = await requireRole("CUSTOMER");
  const postingId = requiredText(input.postingId, "O anuncio");

  const posting = await prisma.tournamentTeamRecruitmentPosting.findFirst({
    where: {
      id: postingId,
      createdById: session.user.id,
    },
    select: {
      id: true,
      tournamentId: true,
    },
  });

  if (!posting) {
    throw new Error("Anuncio nao encontrado.");
  }

  await prisma.tournamentTeamRecruitmentPosting.delete({
    where: { id: posting.id },
    select: { id: true },
  });

  revalidatePath(`/torneios/${posting.tournamentId}`);
  return { ok: true };
}

export async function createTournamentConnectionRequest(input: CreateTournamentConnectionRequestInput) {
  const session = await requireRole("CUSTOMER");
  const tournamentId = requiredText(input.tournamentId, "O torneio");
  const teamId = requiredText(input.teamId, "O time");
  const playerUserId = requiredText(input.playerUserId, "O jogador");
  const note = (input.note ?? "").trim() || null;

  await ensureTournamentExists(tournamentId);

  const team = await prisma.team.findFirst({
    where: { id: teamId, tournamentId },
    select: { id: true, name: true, created_by_id: true, tournament: { select: { name: true } } },
  });

  if (!team) {
    throw new Error("Time nao encontrado nesse torneio.");
  }

  const player = await prisma.user.findUnique({
    where: { id: playerUserId },
    select: { id: true, name: true },
  });

  if (!player) {
    throw new Error("Jogador nao encontrado.");
  }

  const playerAvailability = await prisma.tournamentPlayerAvailability.findUnique({
    where: {
      tournamentId_userId: {
        tournamentId,
        userId: playerUserId,
      },
    },
    select: { id: true },
  });

  if (!playerAvailability) {
    throw new Error("O jogador precisa estar com o perfil publicado nesse torneio.");
  }

  if (input.kind === "APPLICATION") {
    if (playerUserId !== session.user.id) {
      throw new Error("Voce so pode se candidatar com o proprio perfil.");
    }

    const posting = await prisma.tournamentTeamRecruitmentPosting.findUnique({
      where: { teamId },
      select: { id: true },
    });

    if (!posting) {
      throw new Error("Esse time nao esta buscando jogadores no momento.");
    }
  } else {
    if (team.created_by_id !== session.user.id) {
      throw new Error("Voce so pode convocar jogadores para um time seu.");
    }
    if (playerUserId === session.user.id) {
      throw new Error("Nao e possivel convocar o proprio perfil.");
    }
  }

  const existing = await prisma.tournamentConnectionRequest.findUnique({
    where: {
      tournamentId_teamId_playerUserId_kind: {
        tournamentId,
        teamId,
        playerUserId,
        kind: input.kind,
      },
    },
    select: { id: true, status: true },
  });

  if (existing?.status === "PENDING") {
    throw new Error("Ja existe uma solicitacao pendente para essa combinacao.");
  }

  await prisma.tournamentConnectionRequest.upsert({
    where: {
      tournamentId_teamId_playerUserId_kind: {
        tournamentId,
        teamId,
        playerUserId,
        kind: input.kind,
      },
    },
    update: {
      status: "PENDING",
      note,
      response_note: null,
      createdById: session.user.id,
    },
    create: {
      tournamentId,
      teamId,
      playerUserId,
      kind: input.kind,
      status: "PENDING",
      note,
      createdById: session.user.id,
    },
    select: { id: true },
  });

  const recipientUserId = input.kind === "APPLICATION" ? team.created_by_id : playerUserId;
  if (recipientUserId !== session.user.id) {
    await notifyTournamentConnectionArrival({
      recipientUserId,
      actorName: player.name ?? "Jogador",
      teamName: team.name,
      tournamentName: team.tournament.name,
      note,
      kind: input.kind,
    });
  }

  revalidatePath(`/torneios/${tournamentId}`);
  return { ok: true };
}

export async function updateTournamentConnectionRequestStatus(input: UpdateTournamentConnectionRequestStatusInput) {
  const session = await requireRole("CUSTOMER");
  const requestId = requiredText(input.requestId, "A solicitacao");
  const response_note = (input.response_note ?? "").trim() || null;
  const request = await loadTournamentConnectionRequest(requestId);

  const isTeamOwner = request.team.created_by_id === session.user.id;
  const isPlayer = request.playerUserId === session.user.id;
  const isCreator = request.createdById === session.user.id;

  if (request.kind === "APPLICATION" && !(isTeamOwner || isCreator)) {
    throw new Error("Voce nao pode responder a essa candidatura.");
  }
  if (request.kind === "INVITATION" && !(isPlayer || isCreator)) {
    throw new Error("Voce nao pode responder a essa convocacao.");
  }

  if (input.status === "ACCEPTED") {
    const canAccept = request.kind === "APPLICATION" ? isTeamOwner : isPlayer;
    if (!canAccept) {
      throw new Error("Somente o destinatario pode aceitar essa solicitacao.");
    }
  }

  if (input.status === "REJECTED") {
    const canReject = request.kind === "APPLICATION" ? isTeamOwner : isPlayer;
    if (!canReject) {
      throw new Error("Somente o destinatario pode recusar essa solicitacao.");
    }
  }

  if (input.status === "CANCELLED" && !isCreator) {
    throw new Error("Somente quem iniciou a solicitacao pode cancelar.");
  }

  await prisma.tournamentConnectionRequest.update({
    where: { id: request.id },
    data: {
      status: input.status,
      response_note,
    },
    select: { id: true },
  });

  if (input.status === "ACCEPTED" || input.status === "REJECTED") {
    await notifyTournamentConnectionDecision({
      recipientUserId: request.createdById,
      teamName: request.team.name,
      tournamentName: request.team.tournament.name,
      responseNote: response_note,
      kind: request.kind,
      status: input.status,
    });
  }

  revalidatePath(`/torneios/${request.tournamentId}`);
  return { ok: true };
}

export async function removeTournamentPlayerAvailabilityAsAdmin(input: SetTournamentAvailabilityInput & { userId: string }) {
  const session = await requireRole("ADMIN");
  const tournamentId = requiredText(input.tournamentId, "O torneio");
  const userId = requiredText(input.userId, "O jogador");

  await ensureAdminTournamentAccess(tournamentId, session.user.id);

  await prisma.tournamentPlayerAvailability.deleteMany({
    where: { tournamentId, userId },
  });

  revalidatePath(`/dashboard/torneios/${tournamentId}`);
  revalidatePath(`/torneios/${tournamentId}`);
  return { ok: true };
}

export async function deleteTeamRecruitmentPostingAsAdmin(input: DeleteTeamRecruitmentPostingInput) {
  const session = await requireRole("ADMIN");
  const postingId = requiredText(input.postingId, "O anuncio");

  const posting = await prisma.tournamentTeamRecruitmentPosting.findUnique({
    where: { id: postingId },
    select: {
      id: true,
      tournamentId: true,
      tournament: {
        select: {
          establishment: {
            select: { ownerId: true },
          },
        },
      },
    },
  });

  if (!posting || posting.tournament.establishment?.ownerId !== session.user.id) {
    throw new Error("Anuncio nao encontrado para esse organizador.");
  }

  await prisma.tournamentTeamRecruitmentPosting.delete({
    where: { id: posting.id },
    select: { id: true },
  });

  revalidatePath(`/dashboard/torneios/${posting.tournamentId}`);
  revalidatePath(`/torneios/${posting.tournamentId}`);
  return { ok: true };
}

export async function updateTournamentConnectionRequestStatusAsAdmin(input: UpdateTournamentConnectionRequestStatusInput) {
  const session = await requireRole("ADMIN");
  const requestId = requiredText(input.requestId, "A solicitacao");
  const response_note = (input.response_note ?? "").trim() || null;
  const request = await loadTournamentConnectionRequest(requestId);

  if (request.tournament.establishment?.ownerId !== session.user.id) {
    throw new Error("Solicitacao nao encontrada para esse organizador.");
  }

  await prisma.tournamentConnectionRequest.update({
    where: { id: request.id },
    data: {
      status: input.status,
      response_note,
    },
    select: { id: true },
  });

  if (input.status === "ACCEPTED" || input.status === "REJECTED") {
    await notifyTournamentConnectionDecision({
      recipientUserId: request.createdById,
      teamName: request.team.name,
      tournamentName: request.team.tournament.name,
      responseNote: response_note,
      kind: request.kind,
      status: input.status,
    });
  }

  revalidatePath(`/dashboard/torneios/${request.tournamentId}`);
  revalidatePath(`/torneios/${request.tournamentId}`);
  return { ok: true };
}