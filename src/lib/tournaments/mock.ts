export type TournamentVisibility = "PUBLIC" | "PRIVATE";
export type TournamentStatus = "DRAFT" | "OPEN" | "RUNNING" | "FINISHED";
export type TournamentOrganizerType = "ESTABLISHMENT" | "CUSTOMER";

export type TournamentMock = {
  id: string;
  name: string;
  description: string;
  sport: string;
  city: string;
  locationName: string;
  startDate: string;
  endDate: string;
  entryFeeCents: number;
  teamSizeMin: number;
  teamSizeMax: number;
  maxTeams: number;
  registeredTeams: number;
  status: TournamentStatus;
  visibility: TournamentVisibility;
  organizerType: TournamentOrganizerType;
  organizerName: string;
  formatKey: string;
  formatLabel: string;
  categories: string[];
  rules: string[];
  highlights: string[];
};

export const tournamentsMock: TournamentMock[] = [
  {
    id: "arena-elite-cup-2026",
    name: "Arena Elite Cup 2026",
    description:
      "Torneio aberto com grupos e mata-mata. Abertura com cerimonia e final com premiacao.",
    sport: "FUTSAL",
    city: "Campinas, SP",
    locationName: "Arena Elite",
    startDate: "2026-04-12",
    endDate: "2026-04-20",
    entryFeeCents: 12000,
    teamSizeMin: 5,
    teamSizeMax: 8,
    maxTeams: 16,
    registeredTeams: 9,
    status: "OPEN",
    visibility: "PUBLIC",
    organizerType: "ESTABLISHMENT",
    organizerName: "Arena Elite",
    formatKey: "GROUPS_KO",
    formatLabel: "Grupos + mata-mata",
    categories: ["Iniciante", "Intermediario"],
    rules: ["2 tempos de 20m", "WO apos 10m", "3 substituicoes"],
    highlights: ["Premiacao para campeao e vice", "Arbitragem oficial"],
  },
  {
    id: "copa-quadra-norte",
    name: "Copa Quadra Norte",
    description: "Campeonato regional com tabela corrida e semifinales.",
    sport: "SOCIETY",
    city: "Ribeirao Preto, SP",
    locationName: "Quadra Norte",
    startDate: "2026-05-03",
    endDate: "2026-05-18",
    entryFeeCents: 9000,
    teamSizeMin: 6,
    teamSizeMax: 10,
    maxTeams: 12,
    registeredTeams: 12,
    status: "RUNNING",
    visibility: "PUBLIC",
    organizerType: "ESTABLISHMENT",
    organizerName: "Quadra Norte",
    formatKey: "LEAGUE",
    formatLabel: "Pontos corridos",
    categories: ["Livre"],
    rules: ["2 tempos de 25m", "Cartao amarelo acumula", "Empate conta ponto"],
    highlights: ["Equipe medica no local", "Transmissao das finais"],
  },
  {
    id: "open-beach-series",
    name: "Open Beach Series",
    description: "Circuito rapido com eliminatoria simples.",
    sport: "BEACH_TENNIS",
    city: "Sao Paulo, SP",
    locationName: "Clube Sol",
    startDate: "2026-03-28",
    endDate: "2026-03-30",
    entryFeeCents: 6000,
    teamSizeMin: 2,
    teamSizeMax: 2,
    maxTeams: 24,
    registeredTeams: 18,
    status: "OPEN",
    visibility: "PUBLIC",
    organizerType: "ESTABLISHMENT",
    organizerName: "Clube Sol",
    formatKey: "SINGLE_ELIM",
    formatLabel: "Eliminatoria simples",
    categories: ["Amador", "Avancado"],
    rules: ["Set unico de 6 games", "Sem vantagem"],
    highlights: ["Kit atleta", "Fotos profissionais"],
  },
  {
    id: "copa-rua-11",
    name: "Copa Rua 11",
    description: "Torneio interno entre amigos com convites privados.",
    sport: "SOCIETY",
    city: "Sorocaba, SP",
    locationName: "Arena Street 11",
    startDate: "2026-03-23",
    endDate: "2026-03-23",
    entryFeeCents: 0,
    teamSizeMin: 5,
    teamSizeMax: 8,
    maxTeams: 4,
    registeredTeams: 2,
    status: "DRAFT",
    visibility: "PRIVATE",
    organizerType: "CUSTOMER",
    organizerName: "Rafael Costa",
    formatKey: "GROUPS_KO",
    formatLabel: "Grupos + mata-mata",
    categories: ["Fechado"],
    rules: ["1 tempo de 30m", "Sem arbitragem oficial"],
    highlights: ["Convite por link", "Times montados pelo organizador"],
  },
];

export function getTournamentMock(id: string): TournamentMock | null {
  return tournamentsMock.find((t) => t.id === id) ?? null;
}

export function listPublicTournaments(): TournamentMock[] {
  return tournamentsMock.filter((t) => t.visibility === "PUBLIC");
}

export function listInternalTournaments(): TournamentMock[] {
  return tournamentsMock.filter((t) => t.visibility === "PRIVATE");
}
