import type { Game, Tournament } from './models.js';
const pairKey = (a: number, b: number): string => [a, b].sort((x, y) => x - y).join(':');
const shuffle = <T>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function history(
  state: Tournament,
  phase: 'group' | 'ko',
): { partners: Set<string>; opponents: Map<string, number> } {
  const partners = new Set<string>(),
    opponents = new Map<string, number>();
  for (const round of phase === 'ko' ? state.ko : state.group)
    for (const game of round) {
      const [a, b] = game.teams;
      partners.add(pairKey(a[0], a[1]));
      partners.add(pairKey(b[0], b[1]));
      for (const x of a)
        for (const y of b) {
          const key = pairKey(x, y);
          opponents.set(key, (opponents.get(key) ?? 0) + 1);
        }
    }
  return { partners, opponents };
}

export function draw(state: Tournament, ids: number[], phase: 'group' | 'ko' = 'group'): Game[] {
  if (ids.length % 4) throw new Error('Die Teilnehmerzahl muss durch vier teilbar sein.');
  const people = new Map(state.players.map((p) => [p.id, p]));
  const countF = ids.filter((id) => people.get(id)?.gender === 'F').length;
  const countM = ids.length - countF;
  const { partners, opponents } = history(state, phase);
  const mixedRequired = phase === 'ko';
  const mixedTarget = mixedRequired ? Math.min(countF, countM) : 0;
  const professionalPair = (a: number, b: number): number =>
    Number(Boolean(people.get(a)?.professional && people.get(b)?.professional));
  let teams: [number, number][] | null = null;
  let avoidProfessionalMismatch = true;
  for (; !teams; avoidProfessionalMismatch = false) {
    for (let allowed = 0; allowed <= ids.length / 2 && !teams; allowed++) {
      let visited = 0;
      let limit = 500_000;
      const search = (
        remaining: number[],
        mixedLeft: number,
        repeatsLeft: number,
        professionalsLeft: number,
        pureTeams = 0,
        singleTeams = 0,
      ): [number, number][] | null => {
        if (++visited > limit) return null;
        if (!remaining.length) {
          const emptyTeams = ids.length / 2 - pureTeams - singleTeams;
          return mixedLeft === 0 &&
            (!avoidProfessionalMismatch ||
              pureTeams % 2 === 0 ||
              singleTeams > 0 ||
              emptyTeams === 0)
            ? []
            : null;
        }
        const professionalCount = remaining.filter((id) => people.get(id)?.professional).length;
        if (Math.max(0, professionalCount - remaining.length / 2) > professionalsLeft) return null;
        const candidates = (id: number): number =>
          remaining.filter(
            (other) =>
              other !== id &&
              (!mixedRequired || people.get(id)?.gender !== people.get(other)?.gender) &&
              !partners.has(pairKey(id, other)),
          ).length;
        const first = [...remaining].sort(
          (a, b) =>
            candidates(a) - candidates(b) ||
            Number(people.get(b)?.professional) - Number(people.get(a)?.professional),
        )[0];
        const others = shuffle(remaining.filter((id) => id !== first)).sort(
          (a, b) =>
            Number(partners.has(pairKey(first, a))) - Number(partners.has(pairKey(first, b))) ||
            (mixedRequired
              ? Number(people.get(first)?.gender === people.get(a)?.gender) -
                Number(people.get(first)?.gender === people.get(b)?.gender)
              : 0) ||
            professionalPair(first, a) - professionalPair(first, b),
        );
        for (const second of others) {
          const isMixed = people.get(first)?.gender !== people.get(second)?.gender;
          const nextMixed = mixedLeft - Number(mixedRequired && isMixed);
          if (nextMixed < 0 || nextMixed > remaining.length / 2 - 1) continue;
          const repeats = Number(partners.has(pairKey(first, second)));
          if (repeats > repeatsLeft) continue;
          const professionals = professionalPair(first, second);
          if (professionals > professionalsLeft) continue;
          const rest = search(
            remaining.filter((id) => id !== first && id !== second),
            nextMixed,
            repeatsLeft - repeats,
            professionalsLeft - professionals,
            pureTeams + professionals,
            singleTeams +
              Number(
                Boolean(people.get(first)?.professional) !==
                  Boolean(people.get(second)?.professional),
              ),
          );
          if (rest) return [[first, second], ...rest];
        }
        return null;
      };
      teams = search(ids, mixedTarget, allowed, ids.length / 2);
      if (teams) {
        // Improve the feasible draw within a bounded search; never block a round for this preference.
        const currentProfessionalPairs = teams.reduce(
          (sum, [a, b]) => sum + professionalPair(a, b),
          0,
        );
        const minimum = Math.max(
          0,
          ids.filter((id) => people.get(id)?.professional).length - ids.length / 2,
        );
        visited = 0;
        limit = 20_000;
        for (let budget = minimum; budget < currentProfessionalPairs && visited < limit; budget++) {
          const improved = search(ids, mixedTarget, allowed, budget);
          if (improved) {
            teams = improved;
            break;
          }
        }
      }
    }
    if (!teams && !avoidProfessionalMismatch)
      throw new Error('Keine Auslosung gefunden. Bitte die Turnierleitung informieren.');
    if (teams) break;
  }
  let best: [[number, number], [number, number]][] = [];
  let fewestProfessionalMismatches = Infinity;
  let fewestOpponentRepeats = Infinity;
  const professionalCount = (team: [number, number]): number =>
    team.filter((id) => people.get(id)?.professional).length;
  const pureTeams = shuffle(teams.filter((team) => professionalCount(team) === 2));
  const singleTeams = shuffle(teams.filter((team) => professionalCount(team) === 1));
  const emptyTeams = shuffle(teams.filter((team) => professionalCount(team) === 0));
  const safeOrder: [number, number][] = [];
  while (pureTeams.length >= 2) safeOrder.push(pureTeams.pop()!, pureTeams.pop()!);
  if (pureTeams.length) safeOrder.push(pureTeams.pop()!, (singleTeams.pop() ?? emptyTeams.pop())!);
  safeOrder.push(...shuffle([...singleTeams, ...emptyTeams]));
  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidate = attempt === 0 ? safeOrder : shuffle(teams);
    const games: [[number, number], [number, number]][] = [];
    let professionalMismatches = 0;
    let opponentRepeats = 0;
    for (let i = 0; i < candidate.length; i += 2) {
      const a = candidate[i],
        b = candidate[i + 1];
      if (
        avoidProfessionalMismatch &&
        ((professionalCount(a) === 2 && professionalCount(b) === 0) ||
          (professionalCount(b) === 2 && professionalCount(a) === 0))
      ) {
        professionalMismatches = Infinity;
        break;
      }
      games.push([a, b]);
      for (const x of a) for (const y of b) opponentRepeats += opponents.get(pairKey(x, y)) ?? 0;
      const hasProfessional = (team: [number, number]): boolean =>
        team.some((id) => people.get(id)?.professional);
      professionalMismatches += Number(hasProfessional(a) !== hasProfessional(b));
    }
    // Professional balance takes priority regardless of the number of previous encounters.
    if (
      professionalMismatches < fewestProfessionalMismatches ||
      (professionalMismatches === fewestProfessionalMismatches &&
        opponentRepeats < fewestOpponentRepeats)
    ) {
      best = games;
      fewestProfessionalMismatches = professionalMismatches;
      fewestOpponentRepeats = opponentRepeats;
      if (professionalMismatches === 0 && opponentRepeats === 0) break;
    }
  }
  return best.map((teams) => ({ id: state.nextId++, teams, sets: [] }));
}
