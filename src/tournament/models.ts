export type Gender = 'F' | 'M';
export type SetScore = [number, number];
export interface Player {
  id: number;
  name: string;
  gender: Gender;
  professional: boolean;
  koExcluded?: boolean;
}
export interface Game {
  id: number;
  teams: [[number, number], [number, number]];
  sets: SetScore[];
  called?: boolean;
}
export interface Tournament {
  players: Player[];
  group: Game[][];
  qualified: number[] | null;
  ko: Game[][];
  nextId: number;
}
export interface RankedPlayer extends Player {
  points: number;
  setsWon: number;
}
