"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  createTournamentConnectionRequest,
  deleteTeamRecruitmentPosting,
  publishMyTournamentAvailability,
  removeMyTournamentAvailability,
  updateTournamentConnectionRequestStatus,
  upsertTeamRecruitmentPosting,
  upsertTournamentPlayerProfile,
} from "@/lib/actions/tournamentConnections";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { formatSportLabel } from "@/lib/utils/sport";
import { toWaMeLink } from "@/lib/utils/whatsapp";
import type { Role } from "@/generated/prisma/enums";

export type TournamentDetailView = {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  sport_type: string;
  start_date: string;
  end_date: string;
  location_name: string | null;
  city: string | null;
  entry_fee_cents: number;
  team_size_min: number;
  team_size_max: number;
  max_teams: number;
  registered_teams: number;
  status: string;
  visibility: string;
  organizer_type: string;
  organizer_name: string | null;
  format: string;
  rules: string[];
  categories: string[];
  levels: string[];
  registrations: Array<{ id: string; team_name: string; status: string; paid: boolean }>;
  matches: Array<{
    id: string;
    round: string;
    group_label: string | null;
    start_time: string;
    status: string;
    court_name: string | null;
    team_a: string;
    team_b: string;
    score_a: number | null;
    score_b: number | null;
  }>;
  standings: Array<{
    teamId: string;
    teamName: string;
    points: number;
    wins: number;
    losses: number;
    goals: number;
  }>;
  player_marketplace: Array<{
    userId: string;
    name: string;
    city: string | null;
    photo_url: string;
    whatsapp_number: string;
    age: number;
    birth_year: number;
    preferred_position: string;
    height_cm: number;
    weight_kg: number;
    description: string;
    isCurrentUser: boolean;
  }>;
  team_recruitments: Array<{
    id: string;
    teamId: string;
    teamName: string;
    city: string | null;
    photo_url: string;
    whatsapp_number: string;
    desired_position: string;
    average_age: number;
    notes: string;
    isOwnedByCurrentUser: boolean;
  }>;
  current_player_profile: {
    photo_url: string;
    whatsapp_number: string;
    age: number;
    birth_year: number;
    preferred_position: string;
    height_cm: number;
    weight_kg: number;
    description: string;
    isPublishedForTournament: boolean;
  } | null;
  my_teams: Array<{
    id: string;
    name: string;
    recruitment_post: {
      id: string;
      photo_url: string;
      whatsapp_number: string;
      desired_position: string;
      average_age: number;
      notes: string;
    } | null;
  }>;
  connection_requests: Array<{
    id: string;
    kind: string;
    status: string;
    note: string | null;
    response_note: string | null;
    createdAt: string;
    teamId: string;
    teamName: string;
    playerUserId: string;
    playerName: string;
    isMineAsPlayer: boolean;
    isMineAsTeamOwner: boolean;
    isCreatedByCurrentUser: boolean;
  }>;
  currentUserId: string | null;
  currentUserRole: Role | null;
};

type Props = {
  tournament: TournamentDetailView;
  isLoggedIn: boolean;
};

type TabKey = "overview" | "agenda" | "teams" | "connections" | "standings" | "rules";

function onlyDigits(value: string) {
  return String(value ?? "").replace(/\D/g, "");
}

async function uploadMarketplaceImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Envie uma imagem valida.");
  }

  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prefix: "users",
      files: [{ name: file.name, type: file.type, size: file.size }],
    }),
  });

  const data = (await res.json().catch(() => null)) as
    | null
    | { error?: string; items?: Array<{ uploadUrl: string; publicUrl: string; contentType: string }> };

  if (!res.ok) throw new Error(data?.error || "Nao foi possivel preparar o upload da imagem.");
  const item = data?.items?.[0];
  if (!item?.uploadUrl || !item.publicUrl) throw new Error("Resposta de upload invalida.");

  const put = await fetch(item.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": item.contentType || file.type || "application/octet-stream" },
    body: file,
  });

  if (!put.ok) throw new Error("Falha ao enviar a imagem.");
  return item.publicUrl;
}

function formatDateLong(dateStr: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(
    new Date(dateStr)
  );
}

function statusLabel(status: string) {
  if (status === "OPEN") return "Inscrições abertas";
  if (status === "RUNNING") return "Em andamento";
  if (status === "FINISHED") return "Finalizado";
  if (status === "CANCELLED") return "Cancelado";
  return "Rascunho";
}

function formatFormatLabel(value: string) {
  if (value === "GROUPS_KO") return "Grupos + mata-mata";
  if (value === "LEAGUE") return "Pontos corridos";
  if (value === "SINGLE_ELIM") return "Eliminação simples";
  if (value === "DOUBLE_ELIM") return "Eliminação dupla";
  return "Formato customizado";
}

function connectionRequestStatusLabel(status: string) {
  if (status === "ACCEPTED") return "Aceita";
  if (status === "REJECTED") return "Recusada";
  if (status === "CANCELLED") return "Cancelada";
  return "Pendente";
}

function connectionRequestStatusClass(status: string) {
  if (status === "ACCEPTED") return "bg-emerald-500/15 text-emerald-700";
  if (status === "REJECTED") return "bg-rose-500/15 text-rose-700";
  if (status === "CANCELLED") return "bg-secondary text-muted-foreground";
  return "bg-amber-500/15 text-amber-700";
}

export function TournamentDetailClient(props: Props) {
  const router = useRouter();
  const { tournament } = props;
  const isLoggedIn = props.isLoggedIn;
  const [tab, setTab] = useState<TabKey>("overview");
  const [isPending, startTransition] = useTransition();
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [playerPhotoUrl, setPlayerPhotoUrl] = useState(tournament.current_player_profile?.photo_url ?? "");
  const [playerWhatsapp, setPlayerWhatsapp] = useState(tournament.current_player_profile?.whatsapp_number ?? "");
  const [playerAge, setPlayerAge] = useState(String(tournament.current_player_profile?.age ?? ""));
  const [playerBirthYear, setPlayerBirthYear] = useState(String(tournament.current_player_profile?.birth_year ?? ""));
  const [playerPosition, setPlayerPosition] = useState(tournament.current_player_profile?.preferred_position ?? "");
  const [playerHeight, setPlayerHeight] = useState(String(tournament.current_player_profile?.height_cm ?? ""));
  const [playerWeight, setPlayerWeight] = useState(String(tournament.current_player_profile?.weight_kg ?? ""));
  const [playerDescription, setPlayerDescription] = useState(tournament.current_player_profile?.description ?? "");
  const [playerPublished, setPlayerPublished] = useState(Boolean(tournament.current_player_profile?.isPublishedForTournament));
  const [selectedTeamId, setSelectedTeamId] = useState(tournament.my_teams[0]?.id ?? "");
  const [teamPhotoUrl, setTeamPhotoUrl] = useState("");
  const [teamWhatsapp, setTeamWhatsapp] = useState("");
  const [teamPosition, setTeamPosition] = useState("");
  const [teamAverageAge, setTeamAverageAge] = useState("");
  const [teamNotes, setTeamNotes] = useState("");
  const [applicationNote, setApplicationNote] = useState("");
  const [invitationNote, setInvitationNote] = useState("");
  const [connectionPositionFilter, setConnectionPositionFilter] = useState("");
  const [connectionAgeMinFilter, setConnectionAgeMinFilter] = useState("");
  const [connectionAgeMaxFilter, setConnectionAgeMaxFilter] = useState("");
  const [connectionCityFilter, setConnectionCityFilter] = useState("");

  const schedule = useMemo(() => tournament.matches, [tournament.matches]);
  const teams = useMemo(() => tournament.registrations, [tournament.registrations]);
  const selectedTeam = useMemo(
    () => tournament.my_teams.find((item) => item.id === selectedTeamId) ?? null,
    [selectedTeamId, tournament.my_teams]
  );
  const selectedTeamRecruitmentPost = selectedTeam?.recruitment_post ?? null;
  const filteredPlayerMarketplace = useMemo(() => {
    const position = connectionPositionFilter.trim().toLowerCase();
    const city = connectionCityFilter.trim().toLowerCase();
    const minAge = Number(connectionAgeMinFilter) || null;
    const maxAge = Number(connectionAgeMaxFilter) || null;

    return tournament.player_marketplace.filter((player) => {
      const matchesPosition = !position || player.preferred_position.toLowerCase().includes(position);
      const matchesCity = !city || (player.city ?? "").toLowerCase().includes(city);
      const matchesMinAge = minAge == null || player.age >= minAge;
      const matchesMaxAge = maxAge == null || player.age <= maxAge;
      return matchesPosition && matchesCity && matchesMinAge && matchesMaxAge;
    });
  }, [connectionAgeMaxFilter, connectionAgeMinFilter, connectionCityFilter, connectionPositionFilter, tournament.player_marketplace]);
  const filteredTeamRecruitments = useMemo(() => {
    const position = connectionPositionFilter.trim().toLowerCase();
    const city = connectionCityFilter.trim().toLowerCase();
    const minAge = Number(connectionAgeMinFilter) || null;
    const maxAge = Number(connectionAgeMaxFilter) || null;

    return tournament.team_recruitments.filter((teamRecruitment) => {
      const matchesPosition = !position || teamRecruitment.desired_position.toLowerCase().includes(position);
      const matchesCity = !city || (teamRecruitment.city ?? "").toLowerCase().includes(city);
      const matchesMinAge = minAge == null || teamRecruitment.average_age >= minAge;
      const matchesMaxAge = maxAge == null || teamRecruitment.average_age <= maxAge;
      return matchesPosition && matchesCity && matchesMinAge && matchesMaxAge;
    });
  }, [connectionAgeMaxFilter, connectionAgeMinFilter, connectionCityFilter, connectionPositionFilter, tournament.team_recruitments]);
  const myApplications = useMemo(
    () => tournament.connection_requests.filter((request) => request.kind === "APPLICATION" && request.isMineAsPlayer),
    [tournament.connection_requests]
  );
  const myInvitations = useMemo(
    () => tournament.connection_requests.filter((request) => request.kind === "INVITATION" && request.isMineAsPlayer),
    [tournament.connection_requests]
  );
  const incomingApplicationsToMyTeams = useMemo(
    () => tournament.connection_requests.filter((request) => request.kind === "APPLICATION" && request.isMineAsTeamOwner),
    [tournament.connection_requests]
  );
  const invitationsFromMyTeams = useMemo(
    () => tournament.connection_requests.filter((request) => request.kind === "INVITATION" && request.isMineAsTeamOwner),
    [tournament.connection_requests]
  );

  const availableSlots = Math.max(0, tournament.max_teams - tournament.registered_teams);
  const feeLabel = tournament.entry_fee_cents ? formatBRLFromCents(tournament.entry_fee_cents) : "Gratuito";

  useEffect(() => {
    const post = selectedTeam?.recruitment_post;
    setTeamPhotoUrl(post?.photo_url ?? "");
    setTeamWhatsapp(post?.whatsapp_number ?? "");
    setTeamPosition(post?.desired_position ?? "");
    setTeamAverageAge(post?.average_age ? String(post.average_age) : "");
    setTeamNotes(post?.notes ?? "");
  }, [selectedTeam]);

  async function handlePlayerImageChange(file: File | null) {
    if (!file) return;
    setConnectionError(null);
    try {
      const uploaded = await uploadMarketplaceImage(file);
      setPlayerPhotoUrl(uploaded);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Erro ao enviar foto do jogador.");
    }
  }

  async function handleTeamImageChange(file: File | null) {
    if (!file) return;
    setConnectionError(null);
    try {
      const uploaded = await uploadMarketplaceImage(file);
      setTeamPhotoUrl(uploaded);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Erro ao enviar foto do time.");
    }
  }

  function handleSavePlayerProfile() {
    setConnectionError(null);
    startTransition(async () => {
      try {
        await upsertTournamentPlayerProfile({
          photo_url: playerPhotoUrl,
          whatsapp_number: playerWhatsapp,
          age: Number(playerAge),
          birth_year: Number(playerBirthYear),
          preferred_position: playerPosition,
          height_cm: Number(playerHeight),
          weight_kg: Number(playerWeight),
          description: playerDescription,
        });
        router.refresh();
      } catch (error) {
        setConnectionError(error instanceof Error ? error.message : "Nao foi possivel salvar o perfil.");
      }
    });
  }

  function handlePublishPlayerProfile() {
    setConnectionError(null);
    startTransition(async () => {
      try {
        await upsertTournamentPlayerProfile({
          photo_url: playerPhotoUrl,
          whatsapp_number: playerWhatsapp,
          age: Number(playerAge),
          birth_year: Number(playerBirthYear),
          preferred_position: playerPosition,
          height_cm: Number(playerHeight),
          weight_kg: Number(playerWeight),
          description: playerDescription,
        });
        await publishMyTournamentAvailability({ tournamentId: tournament.id });
        setPlayerPublished(true);
        router.refresh();
      } catch (error) {
        setConnectionError(error instanceof Error ? error.message : "Nao foi possivel publicar seu perfil.");
      }
    });
  }

  function handleRemovePlayerProfileFromTournament() {
    setConnectionError(null);
    startTransition(async () => {
      try {
        await removeMyTournamentAvailability({ tournamentId: tournament.id });
        setPlayerPublished(false);
        router.refresh();
      } catch (error) {
        setConnectionError(error instanceof Error ? error.message : "Nao foi possivel remover seu perfil da busca.");
      }
    });
  }

  function handleSaveTeamRecruitment() {
    if (!selectedTeamId) {
      setConnectionError("Escolha um time para publicar a busca.");
      return;
    }

    setConnectionError(null);
    startTransition(async () => {
      try {
        await upsertTeamRecruitmentPosting({
          tournamentId: tournament.id,
          teamId: selectedTeamId,
          photo_url: teamPhotoUrl,
          whatsapp_number: teamWhatsapp,
          desired_position: teamPosition,
          average_age: Number(teamAverageAge),
          notes: teamNotes,
        });
        router.refresh();
      } catch (error) {
        setConnectionError(error instanceof Error ? error.message : "Nao foi possivel publicar a busca do time.");
      }
    });
  }

  function handleDeleteTeamRecruitment() {
    const postingId = selectedTeamRecruitmentPost?.id;
    if (!postingId) {
      setConnectionError("Esse time ainda nao tem busca publicada.");
      return;
    }

    setConnectionError(null);
    startTransition(async () => {
      try {
        await deleteTeamRecruitmentPosting({ postingId });
        router.refresh();
      } catch (error) {
        setConnectionError(error instanceof Error ? error.message : "Nao foi possivel remover a busca do time.");
      }
    });
  }

  function handleCreateConnectionRequest(kind: "APPLICATION" | "INVITATION", teamId: string, playerUserId: string) {
    setConnectionError(null);
    startTransition(async () => {
      try {
        await createTournamentConnectionRequest({
          tournamentId: tournament.id,
          teamId,
          playerUserId,
          kind,
          note: kind === "APPLICATION" ? applicationNote : invitationNote,
        });
        if (kind === "APPLICATION") {
          setApplicationNote("");
        } else {
          setInvitationNote("");
        }
        router.refresh();
      } catch (error) {
        setConnectionError(error instanceof Error ? error.message : "Nao foi possivel registrar a solicitacao interna.");
      }
    });
  }

  function handleUpdateConnectionRequest(requestId: string, status: "ACCEPTED" | "REJECTED" | "CANCELLED") {
    setConnectionError(null);
    startTransition(async () => {
      try {
        await updateTournamentConnectionRequestStatus({ requestId, status });
        router.refresh();
      } catch (error) {
        setConnectionError(error instanceof Error ? error.message : "Nao foi possivel atualizar a solicitacao.");
      }
    });
  }

  function findConnectionRequest(kind: "APPLICATION" | "INVITATION", teamId: string, playerUserId: string) {
    return tournament.connection_requests.find(
      (request) => request.kind === kind && request.teamId === teamId && request.playerUserId === playerUserId
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      {tournament.cover_image_url ? (
        <div className="mb-8 overflow-hidden rounded-[2rem] border border-border bg-muted/40 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tournament.cover_image_url} alt={tournament.name} className="h-72 w-full object-cover" />
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
              {tournament.visibility === "PRIVATE" ? "Privado" : "Público"}
            </span>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              {formatSportLabel(tournament.sport_type)}
            </span>
            <span className="rounded-full bg-primary/100/15 px-3 py-1 text-xs font-semibold text-primary dark:text-emerald-300">
              {statusLabel(tournament.status)}
            </span>
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {tournament.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tournament.location_name ?? ""} {tournament.city ? `· ${tournament.city}` : ""}
          </p>
          {tournament.description ? (
            <p className="mt-4 text-base text-muted-foreground">{tournament.description}</p>
          ) : null}

          <div className="mt-6 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Data</p>
              <p className="font-semibold text-foreground">
                {formatDateLong(tournament.start_date)} - {formatDateLong(tournament.end_date)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Formato</p>
              <p className="font-semibold text-foreground">{formatFormatLabel(tournament.format)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Jogadores por time</p>
              <p className="font-semibold text-foreground">
                {tournament.team_size_min}-{tournament.team_size_max}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Taxa</p>
              <p className="font-semibold text-foreground">{feeLabel}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Vagas</p>
              <p className="font-semibold text-foreground">
                {availableSlots} restantes
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Organizador</p>
              <p className="font-semibold text-foreground">{tournament.organizer_name ?? "-"}</p>
            </div>
          </div>

          {tournament.categories.length ? (
            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Categorias</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {tournament.categories.map((cat) => (
                  <span
                    key={cat}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {tournament.levels.length ? (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Níveis</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {tournament.levels.map((level) => (
                  <span
                    key={level}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                  >
                    {level}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="w-full max-w-sm rounded-3xl border border-border bg-card/80 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Resumo</p>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Times inscritos</span>
              <span className="font-semibold text-foreground">
                {tournament.registered_teams}/{tournament.max_teams}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Taxa</span>
              <span className="font-semibold text-foreground">{feeLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Inscrições</span>
              <span className="font-semibold text-foreground">{statusLabel(tournament.status)}</span>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {tournament.status === "OPEN" ? (
              isLoggedIn ? (
                <Link href={`/torneios/${tournament.id}/inscricao`} className="ph-button w-full">
                  Inscrever time
                </Link>
              ) : (
                <Link
                  href={`/signin?callbackUrl=${encodeURIComponent(`/torneios/${tournament.id}/inscricao`)}`}
                  className="ph-button w-full"
                >
                  Entrar para se inscrever
                </Link>
              )
            ) : null}
            <Link href="/torneios" className="ph-button-secondary w-full">
              Voltar aos torneios
            </Link>
          </div>

          {tournament.visibility === "PRIVATE" ? (
            <div className="mt-6 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-xs text-sky-800">
              Torneio privado. O ingresso do time depende de convite ou liberação do organizador.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-2">
        <button
          type="button"
          className={
            tab === "overview"
              ? "ph-button-secondary-sm"
              : "rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          }
          onClick={() => setTab("overview")}
        >
          Visão geral
        </button>
        <button
          type="button"
          className={
            tab === "agenda"
              ? "ph-button-secondary-sm"
              : "rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          }
          onClick={() => setTab("agenda")}
        >
          Agenda
        </button>
        <button
          type="button"
          className={
            tab === "teams"
              ? "ph-button-secondary-sm"
              : "rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          }
          onClick={() => setTab("teams")}
        >
          Times
        </button>
        <button
          type="button"
          className={
            tab === "connections"
              ? "ph-button-secondary-sm"
              : "rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          }
          onClick={() => setTab("connections")}
        >
          Conexoes
        </button>
        <button
          type="button"
          className={
            tab === "standings"
              ? "ph-button-secondary-sm"
              : "rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          }
          onClick={() => setTab("standings")}
        >
          Classificacao
        </button>
        <button
          type="button"
          className={
            tab === "rules"
              ? "ph-button-secondary-sm"
              : "rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          }
          onClick={() => setTab("rules")}
        >
          Regras
        </button>
      </div>

      <div className="mt-6">
        {tab === "overview" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="ph-card p-6">
              <h3 className="text-sm font-semibold text-foreground">Destaques</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {tournament.rules.length ? (
                  tournament.rules.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-muted-foreground">Sem destaques definidos.</li>
                )}
              </ul>
            </div>
            <div className="ph-card p-6">
              <h3 className="text-sm font-semibold text-foreground">Categorias e niveis</h3>
              <div className="mt-3 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorias</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tournament.categories.map((cat) => (
                      <span
                        key={cat}
                        className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
                {tournament.levels.length ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Níveis</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tournament.levels.map((level) => (
                        <span
                          key={level}
                          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                        >
                          {level}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Escolha a categoria e o nível no momento da inscrição do time.
              </p>
            </div>
          </div>
        ) : null}

        {tab === "agenda" ? (
          <div className="rounded-3xl ph-surface p-6">
            <h3 className="text-sm font-semibold text-foreground">Agenda</h3>
            <div className="mt-4 space-y-3">
              {schedule.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-4 py-3 text-sm text-foreground"
                >
                  <div>
                    <p className="font-semibold text-foreground">
                      {item.team_a} {item.score_a != null ? item.score_a : ""} x {item.score_b != null ? item.score_b : ""} {item.team_b}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.round} {item.group_label ? `· ${item.group_label}` : ""}
                      {item.court_name ? ` · ${item.court_name}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.status === "FINISHED" ? "bg-emerald-500/15 text-emerald-600" : "bg-secondary text-foreground"}`}>
                    {item.status === "FINISHED" ? "Finalizada" : item.status === "CANCELLED" ? "Cancelada" : `${new Date(item.start_time).toLocaleDateString("pt-BR")} · ${new Date(item.start_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                  </span>
                </div>
              ))}
              {!schedule.length ? <p className="text-xs text-muted-foreground">Agenda ainda nao publicada.</p> : null}
            </div>
          </div>
        ) : null}

        {tab === "teams" ? (
          <div className="rounded-3xl ph-surface p-6">
            <h3 className="text-sm font-semibold text-foreground">Times inscritos</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="rounded-2xl border border-border bg-card/80 px-4 py-3 text-sm text-foreground"
                >
                  <p className="font-semibold text-foreground">{team.team_name}</p>
                  <p className="text-xs text-muted-foreground">Status: {team.status}</p>
                  <p className="text-xs text-muted-foreground">Pagamento: {team.paid ? "Confirmado" : "Pendente"}</p>
                </div>
              ))}
              {!teams.length ? <p className="text-xs text-muted-foreground">Nenhum time inscrito.</p> : null}
            </div>
          </div>
        ) : null}

        {tab === "connections" ? (
          <div className="space-y-6">
            {connectionError ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900">
                {connectionError}
              </div>
            ) : null}

            <section className="rounded-3xl ph-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Filtros do marketplace</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Refine os perfis e anuncios por posicao, faixa de idade e cidade.
                  </p>
                </div>
                <button
                  type="button"
                  className="ph-button-secondary-sm"
                  onClick={() => {
                    setConnectionPositionFilter("");
                    setConnectionAgeMinFilter("");
                    setConnectionAgeMaxFilter("");
                    setConnectionCityFilter("");
                  }}
                >
                  Limpar filtros
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-4">
                <label className="text-xs font-semibold text-muted-foreground">
                  Posicao
                  <input
                    value={connectionPositionFilter}
                    onChange={(event) => setConnectionPositionFilter(event.target.value)}
                    className="ph-input mt-2"
                    placeholder="Ala, goleiro, pivô..."
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  Idade minima
                  <input
                    type="number"
                    value={connectionAgeMinFilter}
                    onChange={(event) => setConnectionAgeMinFilter(event.target.value)}
                    className="ph-input mt-2"
                    placeholder="18"
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  Idade maxima
                  <input
                    type="number"
                    value={connectionAgeMaxFilter}
                    onChange={(event) => setConnectionAgeMaxFilter(event.target.value)}
                    className="ph-input mt-2"
                    placeholder="35"
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  Cidade
                  <input
                    value={connectionCityFilter}
                    onChange={(event) => setConnectionCityFilter(event.target.value)}
                    className="ph-input mt-2"
                    placeholder="Sao Paulo"
                  />
                </label>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <section className="rounded-3xl ph-surface p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Seu perfil para buscar times</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Preencha uma vez e publique no torneio quando quiser se disponibilizar para convites.
                    </p>
                  </div>
                  <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                    {playerPublished ? "Perfil publicado neste torneio" : "Perfil salvo, mas nao publicado"}
                  </span>
                </div>

                {tournament.currentUserRole === "CUSTOMER" ? (
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="text-xs font-semibold text-muted-foreground md:col-span-2">
                      Foto do jogador
                      <input
                        type="file"
                        accept="image/*"
                        className="ph-input mt-2"
                        disabled={isPending}
                        onChange={(event) => void handlePlayerImageChange(event.target.files?.[0] ?? null)}
                      />
                    </label>

                    {playerPhotoUrl ? (
                      <div className="md:col-span-2 overflow-hidden rounded-3xl border border-border bg-card/70">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={playerPhotoUrl} alt="Foto do jogador" className="h-52 w-full object-cover" />
                      </div>
                    ) : null}

                    <label className="text-xs font-semibold text-muted-foreground">
                      WhatsApp
                      <input
                        value={playerWhatsapp}
                        onChange={(event) => setPlayerWhatsapp(onlyDigits(event.target.value))}
                        className="ph-input mt-2"
                        placeholder="11999998888"
                        disabled={isPending}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Posicao
                      <input
                        value={playerPosition}
                        onChange={(event) => setPlayerPosition(event.target.value)}
                        className="ph-input mt-2"
                        placeholder="Ala, pivô, fixo, lateral..."
                        disabled={isPending}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Idade
                      <input
                        type="number"
                        value={playerAge}
                        onChange={(event) => setPlayerAge(event.target.value)}
                        className="ph-input mt-2"
                        disabled={isPending}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Ano de nascimento
                      <input
                        type="number"
                        value={playerBirthYear}
                        onChange={(event) => setPlayerBirthYear(event.target.value)}
                        className="ph-input mt-2"
                        disabled={isPending}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Altura (cm)
                      <input
                        type="number"
                        value={playerHeight}
                        onChange={(event) => setPlayerHeight(event.target.value)}
                        className="ph-input mt-2"
                        disabled={isPending}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Peso (kg)
                      <input
                        type="number"
                        value={playerWeight}
                        onChange={(event) => setPlayerWeight(event.target.value)}
                        className="ph-input mt-2"
                        disabled={isPending}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground md:col-span-2">
                      Descricao objetiva
                      <textarea
                        value={playerDescription}
                        onChange={(event) => setPlayerDescription(event.target.value)}
                        className="ph-input mt-2 min-h-28"
                        placeholder="Fale do seu estilo de jogo, intensidade, pontos fortes e o que procura em um time."
                        disabled={isPending}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground md:col-span-2">
                      Observacao opcional para candidatura
                      <textarea
                        value={applicationNote}
                        onChange={(event) => setApplicationNote(event.target.value)}
                        className="ph-input mt-2 min-h-24"
                        placeholder="Se quiser, deixe uma mensagem curta para os times ao se candidatar."
                        disabled={isPending}
                      />
                    </label>
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">
                    Entre com uma conta de jogador para publicar seu perfil e ficar visivel para os times.
                  </div>
                )}

                {tournament.currentUserRole === "CUSTOMER" ? (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" className="ph-button-secondary-sm" onClick={handleSavePlayerProfile} disabled={isPending}>
                      Salvar perfil
                    </button>
                    <button type="button" className="ph-button-sm" onClick={handlePublishPlayerProfile} disabled={isPending}>
                      Abrir perfil para times
                    </button>
                    {playerPublished ? (
                      <button
                        type="button"
                        className="ph-button-secondary-sm"
                        onClick={handleRemovePlayerProfileFromTournament}
                        disabled={isPending}
                      >
                        Remover da busca deste torneio
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="rounded-3xl ph-surface p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Seu time buscando jogador</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Publique a necessidade do elenco com foto, WhatsApp e caracteristicas desejadas.
                    </p>
                  </div>
                  <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                    {tournament.my_teams.length} time(s) sob sua gestao
                  </span>
                </div>

                {tournament.my_teams.length ? (
                  <div className="mt-5 grid gap-4">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Time
                      <select
                        value={selectedTeamId}
                        onChange={(event) => setSelectedTeamId(event.target.value)}
                        className="ph-select mt-2"
                        disabled={isPending}
                      >
                        {tournament.my_teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Foto do time
                      <input
                        type="file"
                        accept="image/*"
                        className="ph-input mt-2"
                        disabled={isPending}
                        onChange={(event) => void handleTeamImageChange(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    {teamPhotoUrl ? (
                      <div className="overflow-hidden rounded-3xl border border-border bg-card/70">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={teamPhotoUrl} alt="Foto do time" className="h-44 w-full object-cover" />
                      </div>
                    ) : null}
                    <label className="text-xs font-semibold text-muted-foreground">
                      WhatsApp do time
                      <input
                        value={teamWhatsapp}
                        onChange={(event) => setTeamWhatsapp(onlyDigits(event.target.value))}
                        className="ph-input mt-2"
                        placeholder="11999998888"
                        disabled={isPending}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Posicao procurada
                      <input
                        value={teamPosition}
                        onChange={(event) => setTeamPosition(event.target.value)}
                        className="ph-input mt-2"
                        placeholder="Ala esquerdo, goleiro, zagueiro..."
                        disabled={isPending}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Media de idade desejada
                      <input
                        type="number"
                        value={teamAverageAge}
                        onChange={(event) => setTeamAverageAge(event.target.value)}
                        className="ph-input mt-2"
                        disabled={isPending}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Observacoes sobre o perfil buscado
                      <textarea
                        value={teamNotes}
                        onChange={(event) => setTeamNotes(event.target.value)}
                        className="ph-input mt-2 min-h-28"
                        placeholder="Explique o estilo, intensidade, leitura tática e comportamento que o time espera."
                        disabled={isPending}
                      />
                    </label>
                    <label className="text-xs font-semibold text-muted-foreground">
                      Observacao opcional para convocacao
                      <textarea
                        value={invitationNote}
                        onChange={(event) => setInvitationNote(event.target.value)}
                        className="ph-input mt-2 min-h-24"
                        placeholder="Mensagem curta que sera enviada junto com a convocacao interna."
                        disabled={isPending}
                      />
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className="ph-button-sm" onClick={handleSaveTeamRecruitment} disabled={isPending}>
                        Publicar busca do time
                      </button>
                      {selectedTeamRecruitmentPost ? (
                        <button type="button" className="ph-button-secondary-sm" onClick={handleDeleteTeamRecruitment} disabled={isPending}>
                          Remover anuncio
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground">
                    Quando voce inscrever um time neste torneio, ele aparecera aqui para voce divulgar que esta buscando reforcos.
                  </div>
                )}
              </section>
            </div>

            {(myApplications.length || myInvitations.length || incomingApplicationsToMyTeams.length || invitationsFromMyTeams.length) ? (
              <section className="rounded-3xl ph-surface p-6">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Fluxo interno</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aqui ficam as candidaturas e convocacoes internas, separadas do contato direto por WhatsApp.
                  </p>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-border bg-card/70 p-4">
                    <h4 className="text-sm font-semibold text-foreground">Minhas candidaturas</h4>
                    <div className="mt-3 space-y-3">
                      {myApplications.map((request) => (
                        <div key={request.id} className="rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-foreground">{request.teamName}</p>
                              <p className="text-xs text-muted-foreground">{new Date(request.createdAt).toLocaleDateString("pt-BR")}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connectionRequestStatusClass(request.status)}`}>
                              {connectionRequestStatusLabel(request.status)}
                            </span>
                          </div>
                          {request.note ? <p className="mt-2 text-xs text-muted-foreground">Observacao: {request.note}</p> : null}
                          {request.response_note ? <p className="mt-2 text-xs text-muted-foreground">Resposta: {request.response_note}</p> : null}
                          {request.status === "PENDING" && request.isCreatedByCurrentUser ? (
                            <button type="button" className="ph-button-secondary-xs mt-3" onClick={() => handleUpdateConnectionRequest(request.id, "CANCELLED")} disabled={isPending}>
                              Cancelar candidatura
                            </button>
                          ) : null}
                        </div>
                      ))}
                      {!myApplications.length ? <p className="text-xs text-muted-foreground">Nenhuma candidatura enviada.</p> : null}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border bg-card/70 p-4">
                    <h4 className="text-sm font-semibold text-foreground">Convocacoes recebidas</h4>
                    <div className="mt-3 space-y-3">
                      {myInvitations.map((request) => (
                        <div key={request.id} className="rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-foreground">{request.teamName}</p>
                              <p className="text-xs text-muted-foreground">{new Date(request.createdAt).toLocaleDateString("pt-BR")}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connectionRequestStatusClass(request.status)}`}>
                              {connectionRequestStatusLabel(request.status)}
                            </span>
                          </div>
                          {request.note ? <p className="mt-2 text-xs text-muted-foreground">Observacao: {request.note}</p> : null}
                          {request.response_note ? <p className="mt-2 text-xs text-muted-foreground">Resposta: {request.response_note}</p> : null}
                          {request.status === "PENDING" ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" className="ph-button-secondary-xs" onClick={() => handleUpdateConnectionRequest(request.id, "ACCEPTED")} disabled={isPending}>
                                Aceitar
                              </button>
                              <button type="button" className="ph-button-secondary-xs" onClick={() => handleUpdateConnectionRequest(request.id, "REJECTED")} disabled={isPending}>
                                Recusar
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {!myInvitations.length ? <p className="text-xs text-muted-foreground">Nenhuma convocacao recebida.</p> : null}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border bg-card/70 p-4">
                    <h4 className="text-sm font-semibold text-foreground">Candidaturas para meus times</h4>
                    <div className="mt-3 space-y-3">
                      {incomingApplicationsToMyTeams.map((request) => (
                        <div key={request.id} className="rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-foreground">{request.playerName}</p>
                              <p className="text-xs text-muted-foreground">Time: {request.teamName}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connectionRequestStatusClass(request.status)}`}>
                              {connectionRequestStatusLabel(request.status)}
                            </span>
                          </div>
                          {request.note ? <p className="mt-2 text-xs text-muted-foreground">Observacao: {request.note}</p> : null}
                          {request.response_note ? <p className="mt-2 text-xs text-muted-foreground">Resposta: {request.response_note}</p> : null}
                          {request.status === "PENDING" ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" className="ph-button-secondary-xs" onClick={() => handleUpdateConnectionRequest(request.id, "ACCEPTED")} disabled={isPending}>
                                Aceitar candidatura
                              </button>
                              <button type="button" className="ph-button-secondary-xs" onClick={() => handleUpdateConnectionRequest(request.id, "REJECTED")} disabled={isPending}>
                                Recusar candidatura
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                      {!incomingApplicationsToMyTeams.length ? <p className="text-xs text-muted-foreground">Nenhuma candidatura recebida.</p> : null}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border bg-card/70 p-4">
                    <h4 className="text-sm font-semibold text-foreground">Convocacoes enviadas pelos meus times</h4>
                    <div className="mt-3 space-y-3">
                      {invitationsFromMyTeams.map((request) => (
                        <div key={request.id} className="rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-foreground">{request.playerName}</p>
                              <p className="text-xs text-muted-foreground">Time: {request.teamName}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connectionRequestStatusClass(request.status)}`}>
                              {connectionRequestStatusLabel(request.status)}
                            </span>
                          </div>
                          {request.note ? <p className="mt-2 text-xs text-muted-foreground">Observacao: {request.note}</p> : null}
                          {request.response_note ? <p className="mt-2 text-xs text-muted-foreground">Resposta: {request.response_note}</p> : null}
                          {request.status === "PENDING" && request.isCreatedByCurrentUser ? (
                            <button type="button" className="ph-button-secondary-xs mt-3" onClick={() => handleUpdateConnectionRequest(request.id, "CANCELLED")} disabled={isPending}>
                              Cancelar convocacao
                            </button>
                          ) : null}
                        </div>
                      ))}
                      {!invitationsFromMyTeams.length ? <p className="text-xs text-muted-foreground">Nenhuma convocacao enviada.</p> : null}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-3xl ph-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Jogadores buscando time</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Os times podem avaliar o perfil e chamar direto no WhatsApp para compor o elenco.
                  </p>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                  {tournament.player_marketplace.length} jogador(es)
                </span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredPlayerMarketplace.map((player) => {
                  const invitationRequest = selectedTeamId ? findConnectionRequest("INVITATION", selectedTeamId, player.userId) : null;
                  return (
                  <article key={player.userId} className="overflow-hidden rounded-3xl border border-border bg-card/80 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={player.photo_url} alt={player.name} className="h-44 w-full object-cover" />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-base font-semibold text-foreground">{player.name}</h4>
                          <p className="mt-1 text-xs text-muted-foreground">{player.preferred_position}</p>
                          {player.city ? <p className="mt-1 text-xs text-muted-foreground">{player.city}</p> : null}
                        </div>
                        {player.isCurrentUser ? (
                          <span className="rounded-full bg-primary/15 px-3 py-1 text-[11px] font-semibold text-primary">
                            Seu perfil
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div className="rounded-2xl border border-border bg-background/70 px-3 py-2">Idade: {player.age}</div>
                        <div className="rounded-2xl border border-border bg-background/70 px-3 py-2">Nascimento: {player.birth_year}</div>
                        <div className="rounded-2xl border border-border bg-background/70 px-3 py-2">Altura: {player.height_cm} cm</div>
                        <div className="rounded-2xl border border-border bg-background/70 px-3 py-2">Peso: {player.weight_kg} kg</div>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">{player.description}</p>
                      <a
                        href={toWaMeLink(player.whatsapp_number)}
                        target="_blank"
                        rel="noreferrer"
                        className="ph-button-secondary-sm mt-5 inline-flex w-full justify-center"
                      >
                        Chamar no WhatsApp
                      </a>
                      {tournament.my_teams.length && !player.isCurrentUser ? (
                        <div className="mt-3 space-y-2">
                          {invitationRequest ? (
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${connectionRequestStatusClass(invitationRequest.status)}`}>
                              Convocacao {connectionRequestStatusLabel(invitationRequest.status).toLowerCase()}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="ph-button-secondary-sm w-full"
                            onClick={() => handleCreateConnectionRequest("INVITATION", selectedTeamId, player.userId)}
                            disabled={isPending || !selectedTeamId || invitationRequest?.status === "PENDING"}
                          >
                            Convocar para o time selecionado
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );})}
                {!filteredPlayerMarketplace.length ? (
                  <p className="text-sm text-muted-foreground">Nenhum jogador publicou disponibilidade neste torneio.</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-3xl ph-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Times buscando jogadores</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Jogadores podem entrar em contato direto com o responsavel do time pelo WhatsApp.
                  </p>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                  {tournament.team_recruitments.length} anuncio(s)
                </span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredTeamRecruitments.map((item) => {
                  const applicationRequest = tournament.currentUserId
                    ? findConnectionRequest("APPLICATION", item.teamId, tournament.currentUserId)
                    : null;
                  return (
                  <article key={item.id} className="overflow-hidden rounded-3xl border border-border bg-card/80 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.photo_url} alt={item.teamName} className="h-44 w-full object-cover" />
                    <div className="p-5">
                      <h4 className="text-base font-semibold text-foreground">{item.teamName}</h4>
                      {item.city ? <p className="mt-1 text-xs text-muted-foreground">{item.city}</p> : null}
                      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                        <p>Posicao procurada: <span className="font-semibold text-foreground">{item.desired_position}</span></p>
                        <p>Media de idade: <span className="font-semibold text-foreground">{item.average_age} anos</span></p>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">{item.notes}</p>
                      <a
                        href={toWaMeLink(item.whatsapp_number)}
                        target="_blank"
                        rel="noreferrer"
                        className="ph-button mt-5 inline-flex w-full justify-center"
                      >
                        Falar com o time
                      </a>
                      {!item.isOwnedByCurrentUser && tournament.currentUserRole === "CUSTOMER" ? (
                        <div className="mt-3 space-y-2">
                          {applicationRequest ? (
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${connectionRequestStatusClass(applicationRequest.status)}`}>
                              Candidatura {connectionRequestStatusLabel(applicationRequest.status).toLowerCase()}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="ph-button-secondary-sm w-full"
                            onClick={() => tournament.currentUserId ? handleCreateConnectionRequest("APPLICATION", item.teamId, tournament.currentUserId) : null}
                            disabled={isPending || !tournament.currentUserId || applicationRequest?.status === "PENDING"}
                          >
                            Candidatar-se internamente
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );})}
                {!filteredTeamRecruitments.length ? (
                  <p className="text-sm text-muted-foreground">Nenhum time publicou busca de jogador neste torneio.</p>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {tab === "standings" ? (
          <div className="rounded-3xl ph-surface p-6">
            <h3 className="text-sm font-semibold text-foreground">Classificacao</h3>
            {tournament.standings.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">Time</th>
                      <th className="pb-2 pr-4 text-center">Pts</th>
                      <th className="pb-2 pr-4 text-center">V</th>
                      <th className="pb-2 pr-4 text-center">D</th>
                      <th className="pb-2 text-center">Gols</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournament.standings.map((s, idx) => (
                      <tr key={s.teamId} className="border-b border-border/50">
                        <td className="py-2 pr-4 font-semibold text-foreground">{idx + 1}</td>
                        <td className="py-2 pr-4 text-foreground">{s.teamName}</td>
                        <td className="py-2 pr-4 text-center font-semibold text-foreground">{s.points}</td>
                        <td className="py-2 pr-4 text-center text-emerald-600">{s.wins}</td>
                        <td className="py-2 pr-4 text-center text-red-500">{s.losses}</td>
                        <td className="py-2 text-center text-muted-foreground">{s.goals}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Nenhum resultado registrado ainda.</p>
            )}
          </div>
        ) : null}

        {tab === "rules" ? (
          <div className="rounded-3xl ph-surface p-6">
            <h3 className="text-sm font-semibold text-foreground">Regras principais</h3>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {tournament.rules.length ? (
                tournament.rules.map((rule) => (
                  <li key={rule} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <span>{rule}</span>
                  </li>
                ))
              ) : (
                <li className="text-xs text-muted-foreground">Regras nao informadas.</li>
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
