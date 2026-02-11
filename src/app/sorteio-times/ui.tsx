"use client";

import { useEffect, useMemo, useState } from "react";

const LEVELS = [
  { key: "level1", label: "Nível 1 - Alto rendimento" },
  { key: "level2", label: "Nível 2 - Médio rendimento" },
  { key: "level3", label: "Nível 3 - Baixo rendimento" },
] as const;

type DrawMode = "random" | "skill";

type TeamResult = {
  teams: string[][];
  bench: string[];
};

function parseNames(raw: string): string[] {
  return (raw ?? "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniquePreserveOrder(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of list) {
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

function removeAllDuplicates(list: string[]): string[] {
  const counts = new Map<string, number>();
  for (const n of list) {
    const key = n.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return list.filter((n) => (counts.get(n.toLowerCase()) ?? 0) === 1);
}

function listDuplicates(list: string[]): string[] {
  const counts = new Map<string, { count: number; display: string }>();
  for (const n of list) {
    const key = n.toLowerCase();
    const current = counts.get(key);
    if (!current) {
      counts.set(key, { count: 1, display: n });
    } else {
      counts.set(key, { count: current.count + 1, display: current.display });
    }
  }
  return Array.from(counts.values())
    .filter((v) => v.count > 1)
    .map((v) => v.display);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createTeams(teamCount: number): string[][] {
  return Array.from({ length: teamCount }, () => []);
}

function computeTargetSizes(totalPlayers: number, teamCount: number, playersPerTeam: number): number[] {
  if (teamCount <= 0) return [];

  let remaining = totalPlayers;
  const sizes: number[] = [];
  for (let i = 0; i < teamCount; i += 1) {
    const size = Math.max(0, Math.min(playersPerTeam, remaining));
    sizes.push(size);
    remaining -= size;
  }
  return sizes;
}

function assignRoundRobin(players: string[], teams: string[][], targetSizes: number[]): void {
  const totalTeams = teams.length;
  if (totalTeams === 0) return;

  let pointer = 0;
  for (const player of players) {
    let placed = false;
    for (let tries = 0; tries < totalTeams; tries += 1) {
      const idx = (pointer + tries) % totalTeams;
      if (teams[idx].length < (targetSizes[idx] ?? 0)) {
        teams[idx].push(player);
        pointer = (idx + 1) % totalTeams;
        placed = true;
        break;
      }
    }
    if (!placed) {
      const last = totalTeams - 1;
      teams[last].push(player);
    }
  }
}

function buildSnakeOrder(teamCount: number): number[] {
  if (teamCount <= 1) return [0];
  const forward = Array.from({ length: teamCount }, (_, i) => i);
  const backward = Array.from({ length: teamCount - 2 }, (_, i) => teamCount - 2 - i);
  return [...forward, ...backward];
}

function assignSnake(players: string[], teams: string[][], targetSizes: number[]): void {
  const totalTeams = teams.length;
  if (totalTeams === 0) return;
  const order = buildSnakeOrder(totalTeams);
  let pointer = 0;

  for (const player of players) {
    let placed = false;
    for (let tries = 0; tries < totalTeams; tries += 1) {
      const idx = order[pointer] ?? 0;
      pointer = (pointer + 1) % order.length;
      if (teams[idx].length < (targetSizes[idx] ?? 0)) {
        teams[idx].push(player);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const last = totalTeams - 1;
      teams[last].push(player);
    }
  }
}

function randomDraw(players: string[], teamCount: number, playersPerTeam: number): TeamResult {
  const teams = createTeams(teamCount);
  const bench: string[] = [];
  const targetSizes = computeTargetSizes(players.length, teamCount, playersPerTeam);

  assignRoundRobin(shuffle(players), teams, targetSizes);

  return { teams, bench };
}

function snakeIndex(i: number, teamCount: number): number {
  const block = Math.floor(i / teamCount);
  const idx = i % teamCount;
  return block % 2 === 0 ? idx : teamCount - 1 - idx;
}

function balancedDraw(
  levelPlayers: { level1: string[]; level2: string[]; level3: string[] },
  teamCount: number,
  playersPerTeam: number
): TeamResult {
  const teams = createTeams(teamCount);
  const bench: string[] = [];
  const targetSizes = computeTargetSizes(
    levelPlayers.level1.length + levelPlayers.level2.length + levelPlayers.level3.length,
    teamCount,
    playersPerTeam
  );

  const distribute = (players: string[]) => {
    const shuffled = shuffle(players);
    assignSnake(shuffled, teams, targetSizes);
  };

  distribute(levelPlayers.level1);
  distribute(levelPlayers.level2);
  distribute(levelPlayers.level3);

  return { teams, bench };
}

export function TeamDrawClient() {
  const [mode, setMode] = useState<DrawMode>("random");
  const [teamCount, setTeamCount] = useState(2);
  const [playersPerTeam, setPlayersPerTeam] = useState(2);

  const [randomNames, setRandomNames] = useState("");
  const [level1Names, setLevel1Names] = useState("");
  const [level2Names, setLevel2Names] = useState("");
  const [level3Names, setLevel3Names] = useState("");

  const [result, setResult] = useState<TeamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [duplicatePromptOpen, setDuplicatePromptOpen] = useState(false);
  const [pendingRemoveDuplicates, setPendingRemoveDuplicates] = useState<boolean | null>(null);
  const [lastSkillLevels, setLastSkillLevels] = useState<{
    level1: string[];
    level2: string[];
    level3: string[];
  } | null>(null);

  const totalPlayers = useMemo(() => {
    if (mode === "random") return removeAllDuplicates(uniquePreserveOrder(parseNames(randomNames))).length;
    const l1 = parseNames(level1Names);
    const l2 = parseNames(level2Names);
    const l3 = parseNames(level3Names);
    const merged = removeAllDuplicates(uniquePreserveOrder([...l1, ...l2, ...l3]));
    return merged.length;
  }, [mode, randomNames, level1Names, level2Names, level3Names]);

  const duplicateNames = useMemo(() => {
    if (mode === "random") return listDuplicates(parseNames(randomNames));
    const l1 = parseNames(level1Names);
    const l2 = parseNames(level2Names);
    const l3 = parseNames(level3Names);
    return listDuplicates([...l1, ...l2, ...l3]);
  }, [mode, randomNames, level1Names, level2Names, level3Names]);

  useEffect(() => {
    setPendingRemoveDuplicates(null);
    setDuplicatePromptOpen(false);
  }, [mode, randomNames, level1Names, level2Names, level3Names]);

  const fullTeamsPossible = useMemo(() => {
    if (playersPerTeam <= 0) return 0;
    return Math.floor(totalPlayers / playersPerTeam);
  }, [playersPerTeam, totalPlayers]);

  function runGenerate(removeDuplicates: boolean) {
    setError(null);
    setResult(null);
    setWarning(null);
    setDuplicatePromptOpen(false);
    setPendingRemoveDuplicates(removeDuplicates);
    setLastSkillLevels(null);

    if (teamCount < 2 || teamCount > 12) {
      setError("Quantidade de times deve ser entre 2 e 12.");
      return;
    }
    if (playersPerTeam < 1 || playersPerTeam > 20) {
      setError("Jogadores por time deve ser entre 1 e 20.");
      return;
    }

    if (mode === "random") {
      const parsed = parseNames(randomNames);
      const players = removeDuplicates ? removeAllDuplicates(uniquePreserveOrder(parsed)) : parsed.filter(Boolean);
      if (!players.length) {
        setError("Informe os jogadores para sortear.");
        return;
      }
      if (players.length < teamCount) {
        setError("Jogadores insuficientes para a quantidade de times.");
        return;
      }
      const remainder = players.length - teamCount * playersPerTeam;
      if (remainder > 0) {
        setWarning((prev) =>
          prev
            ? `${prev} ${remainder} jogador(es) extra entraram no último time.`
            : `${remainder} jogador(es) extra entraram no último time.`
        );
      }
      if (remainder < 0) {
        const missing = Math.abs(remainder);
        setWarning((prev) =>
          prev
            ? `${prev} Faltam ${missing} jogador(es) para completar todos os times.`
            : `Faltam ${missing} jogador(es) para completar todos os times.`
        );
      }
      setResult(randomDraw(players, teamCount, playersPerTeam));
      return;
    }

    const level1Raw = parseNames(level1Names);
    const level2Raw = parseNames(level2Names);
    const level3Raw = parseNames(level3Names);
    const mergedRaw = [...level1Raw, ...level2Raw, ...level3Raw];
    const merged = removeDuplicates ? removeAllDuplicates(uniquePreserveOrder(mergedRaw)) : mergedRaw.filter(Boolean);
    const level1 = removeDuplicates
      ? merged.filter((n) => level1Raw.some((x) => x.toLowerCase() === n.toLowerCase()))
      : level1Raw.filter(Boolean);
    const level2 = removeDuplicates
      ? merged.filter((n) => level2Raw.some((x) => x.toLowerCase() === n.toLowerCase()))
      : level2Raw.filter(Boolean);
    const level3 = removeDuplicates
      ? merged.filter((n) => level3Raw.some((x) => x.toLowerCase() === n.toLowerCase()))
      : level3Raw.filter(Boolean);
    if (!merged.length) {
      setError("Informe os jogadores por nível.");
      return;
    }
    if (merged.length < teamCount) {
      setError("Jogadores insuficientes para a quantidade de times.");
      return;
    }
    const remainder = merged.length - teamCount * playersPerTeam;
    if (remainder > 0) {
      setWarning((prev) =>
        prev
          ? `${prev} ${remainder} jogador(es) extra entraram no último time.`
          : `${remainder} jogador(es) extra entraram no último time.`
      );
    }
    if (remainder < 0) {
      const missing = Math.abs(remainder);
      setWarning((prev) =>
        prev
          ? `${prev} Faltam ${missing} jogador(es) para completar todos os times. O balanceamento por nível foi mantido.`
          : `Faltam ${missing} jogador(es) para completar todos os times. O balanceamento por nível foi mantido.`
      );
    }

    setLastSkillLevels({
      level1: level1.map((n) => n.toLowerCase()),
      level2: level2.map((n) => n.toLowerCase()),
      level3: level3.map((n) => n.toLowerCase()),
    });
    setResult(balancedDraw({ level1, level2, level3 }, teamCount, playersPerTeam));
  }

  function onGenerate() {
    setError(null);
    setResult(null);
    setWarning(null);

    if (duplicateNames.length > 0 && pendingRemoveDuplicates === null) {
      setDuplicatePromptOpen(true);
      return;
    }

    runGenerate(pendingRemoveDuplicates ?? true);
  }

  const capacity = teamCount * playersPerTeam;
  const remainderPreview = totalPlayers - Math.max(0, Math.min(teamCount, fullTeamsPossible)) * playersPerTeam;

  return (
    <div className="space-y-6">
      <div className="ph-card p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Sorteio de times</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Escolha o formato de sorteio, informe os jogadores e gere times automaticamente.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Formato</label>
            <select
              className="ph-select mt-2"
              value={mode}
              onChange={(e) => setMode(e.target.value as DrawMode)}
            >
              <option value="random">Aleatório</option>
              <option value="skill">Por qualidade/habilidade</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Quantidade de times</label>
            <input
              type="number"
              min={2}
              max={12}
              value={teamCount}
              onChange={(e) => setTeamCount(Number(e.target.value))}
              className="ph-input mt-2"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Jogadores por time</label>
            <input
              type="number"
              min={1}
              max={20}
              value={playersPerTeam}
              onChange={(e) => setPlayersPerTeam(Number(e.target.value))}
              className="ph-input mt-2"
            />
          </div>
        </div>

        <div className="mt-6">
          {mode === "random" ? (
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Jogadores (um por linha ou separado por vírgula)</label>
              <textarea
                rows={6}
                value={randomNames}
                onChange={(e) => setRandomNames(e.target.value)}
                className="ph-input mt-2 min-h-[140px]"
                placeholder="Ex: João\nMaria\nCarlos"
              />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {LEVELS.map((lvl) => (
                <div key={lvl.key}>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">{lvl.label}</label>
                  <textarea
                    rows={6}
                    value={lvl.key === "level1" ? level1Names : lvl.key === "level2" ? level2Names : level3Names}
                    onChange={(e) =>
                      lvl.key === "level1"
                        ? setLevel1Names(e.target.value)
                        : lvl.key === "level2"
                          ? setLevel2Names(e.target.value)
                          : setLevel3Names(e.target.value)
                    }
                    className="ph-input mt-2 min-h-[140px]"
                    placeholder="Ex: Ana\nBruno"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400">
            <span>Total de jogadores (duplicados removidos): {totalPlayers}</span>
            <span>Capacidade sugerida: {capacity} ({teamCount} times × {playersPerTeam} jogadores)</span>
          </div>
          {duplicateNames.length ? (
            <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-200">
              Duplicados detectados: {duplicateNames.join(", ")}
            </p>
          ) : null}

          {duplicatePromptOpen ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-semibold">
                Verificamos que os seguintes nomes estão duplicados: {duplicateNames.join(", ")}
              </p>
              <p className="mt-2">Deseja removê-los ou continuar com o sorteio?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="ph-button"
                  onClick={() => runGenerate(true)}
                >
                  Remover duplicados
                </button>
                <button
                  type="button"
                  className="ph-button-secondary"
                  onClick={() => runGenerate(false)}
                >
                  Continuar com duplicados
                </button>
              </div>
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            Times completos possíveis: {fullTeamsPossible}. Se sobrarem jogadores, eles entram no último time.
          </p>
          {remainderPreview > 0 ? (
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              Excedente estimado: {remainderPreview} jogador(es).
            </p>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100">
              {error}
            </div>
          ) : null}
          {warning ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
              {warning}
            </div>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button type="button" className="ph-button" onClick={onGenerate}>
              Gerar sorteio
            </button>
            <button
              type="button"
              className="ph-button-secondary"
              onClick={() => {
                setResult(null);
                setError(null);
                setWarning(null);
                setLastSkillLevels(null);
              }}
            >
              Limpar resultado
            </button>
          </div>
        </div>
      </div>

      {result ? (
        <div className="ph-card p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Resultado</h2>
            {mode === "skill" ? (
              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
                Balanceamento por nível aplicado
              </span>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {result.teams.map((team, idx) => (
              <div key={`team-${idx}`} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Time {idx + 1}</p>
                {team.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {team.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Sem jogadores</p>
                )}

                {mode === "skill" && lastSkillLevels ? (() => {
                  const l1 = team.filter((n) => lastSkillLevels.level1.includes(n.toLowerCase())).length;
                  const l2 = team.filter((n) => lastSkillLevels.level2.includes(n.toLowerCase())).length;
                  const l3 = team.filter((n) => lastSkillLevels.level3.includes(n.toLowerCase())).length;
                  const total = team.length || 1;
                  const p1 = Math.round((l1 / total) * 100);
                  const p2 = Math.round((l2 / total) * 100);
                  const p3 = Math.round((l3 / total) * 100);
                  return (
                    <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
                      <p className="font-semibold">Resumo por nível</p>
                      <p className="mt-1">
                        Nível 1: {l1} ({p1}%) • Nível 2: {l2} ({p2}%) • Nível 3: {l3} ({p3}%)
                      </p>
                    </div>
                  );
                })() : null}
              </div>
            ))}
          </div>

          {result.bench.length ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-semibold">Reservas (fora do time completo)</p>
              <p className="mt-2">{result.bench.join(", ")}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
