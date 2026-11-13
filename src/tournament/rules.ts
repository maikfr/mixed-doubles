import type { Gender, Game, RankedPlayer, SetScore, Tournament } from './models.js';
export const MAX_GROUP_ROUNDS = 10;
export const KO_WIN_SETS = 3;
export const emptyTournament = (): Tournament => ({
  players: [],
  group: [],
  qualified: null,
  ko: [],
  nextId: 1,
});
export function compareRank(a: RankedPlayer, b: RankedPlayer): number {
  return b.points - a.points || b.setsWon - a.setsWon;
}

export function qualificationCount(state: Tournament, gender: Gender): number {
  const eligible = state.players.filter((p) => !p.koExcluded);
  const count = eligible.filter((p) => p.gender === gender).length;
  return Math.min(count, Math.max(8, 16 - (eligible.length - count)));
}

export function scoreSet(a: number, b: number): SetScore {
  if (!Number.isInteger(a) || !Number.isInteger(b) || Math.min(a, b) < 0) {
    throw new Error('Satzpunkte müssen ganze, nichtnegative Zahlen sein.');
  }
  const high = Math.max(a, b),
    low = Math.min(a, b);
  if (high < 11 || high - low < 2 || (high > 11 && high - low !== 2)) {
    throw new Error('Ungültiges Ergebnis.');
  }
  const loser = low - (high - 11);
  return a > b ? [11, loser] : [loser, 11];
}

export function pointsOf(state: Tournament): Map<number, number> {
  const points = new Map(state.players.map((p) => [p.id, 0]));
  for (const round of state.group)
    for (const game of round) {
      for (const [a, b] of game.sets) {
        const [left, right] = scoreSet(a, b);
        for (const id of game.teams[0]) points.set(id, (points.get(id) ?? 0) + left);
        for (const id of game.teams[1]) points.set(id, (points.get(id) ?? 0) + right);
      }
    }
  return points;
}

export function standings(state: Tournament, gender: Gender): RankedPlayer[] {
  const points = pointsOf(state);
  const setsWon = new Map<number, number>();
  for (const round of state.group)
    for (const game of round) {
      for (const [a, b] of game.sets) {
        for (const id of game.teams[a > b ? 0 : 1]) setsWon.set(id, (setsWon.get(id) ?? 0) + 1);
      }
    }
  return state.players
    .filter((p) => p.gender === gender)
    .map((p) => ({ ...p, points: points.get(p.id) ?? 0, setsWon: setsWon.get(p.id) ?? 0 }))
    .sort((a, b) => compareRank(a, b) || a.name.localeCompare(b.name, 'de'));
}

export function roundDone(round: Game[] | undefined, wins: number, knockout = false): boolean {
  return (
    !!round &&
    round.length > 0 &&
    round.every((g) => (knockout ? !!winnerTeam(g, wins) : g.sets.length >= wins))
  );
}

export function winnerTeam(game: Game, winsNeeded = KO_WIN_SETS): [number, number] | null {
  if (!game.sets.length) return null;
  const left = game.sets.filter(([a, b]) => a > b).length;
  const right = game.sets.length - left;
  return Math.max(left, right) < winsNeeded ? null : game.teams[left > right ? 0 : 1];
}
